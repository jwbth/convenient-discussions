/**
 * Singleton storing data about comments on the page and managing them.
 *
 * @module commentRegistry
 */

import Comment from './Comment';
import TreeWalker from './TreeWalker';
import cd from './cd';
import commentFormRegistry from './commentFormRegistry';
import controller from './controller';
import settings from './settings';
import updateChecker from './updateChecker';
import { getPagesExistence } from './utils-api';
import { getCommonGender, reorderArray, unique } from './utils-general';
import { getExtendedRect, getHigherNodeAndOffsetInSelection } from './utils-window';
import visits from './visits';

// TODO: make into a class extending a generic registry.

export default {
  /**
   * List of comments.
   *
   * @type {Comment[]}
   * @private
   */
  items: [],

  /**
   * List of underlays.
   *
   * @type {Element[]}
   */
  underlays: [],

  /**
   * List of containers of layers.
   *
   * @type {Element[]}
   */
  layersContainers: [],

  /**
   * _For internal use._ Initialize the registry.
   */
  init() {
    this.reformatCommentsSetting = settings.get('reformatComments');

    controller
      .on('scroll', this.registerSeen.bind(this))
      .on('mutate', this.maybeRedrawLayers.bind(this))
      .on('resize', this.maybeRedrawLayers.bind(this))
      .on('mouseMove', this.maybeHighlightHovered.bind(this))
      .on('popState', (fragment) => {
        // Don't jump to the comment if the user pressed "Back"/"Forward" in the browser or if
        // history.pushState() is called from Comment#scrollTo() (after clicks on added (gray)
        // items in the TOC). A marginal state of this happening is when a page with a comment ID in
        // the fragment is opened and then a link with the same fragment is clicked.
        if (!Comment.isAnyId(fragment) || history.state?.cdJumpedToComment) return;

        this.getByAnyId(fragment, true)?.scrollTo();
      })
      .on('selectionChange', this.getSelectedComment.bind(this))
      .on('beforeReload', (passedData) => {
        // Stop all animations, clear all timeouts.
        this.items.forEach((comment) => {
          comment.stopAnimations();
        });

        // If the page is reloaded externally, its content is already replaced, so we won't break
        // anything if we remove the layers containers early. And we better do so to avoid comment
        // layers hanging around without their owner comments.
        if (passedData.isPageReloadedExternally) {
          this.resetLayers();
        }
      })
      .on('startReload', this.resetLayers.bind(this))
      .on('addedCommentsUpdate', ({ all }) => {
        this.addNewCommentsNotes(all);
      })
      .on('desktopNotificationClick', this.maybeRedrawLayers.bind(this, true));
    visits
      .on('process', this.registerSeen.bind(this));
    updateChecker
      // If the layers of deleted comments have been configured in Comment#unmarkAsChanged(), they
      // will prevent layers before them from being updated due to the "stop at the first three
      // unmoved comments" optimization in .maybeRedrawLayers(). So we just do the whole job here.
      .on('newChanges', this.maybeRedrawLayers.bind(this, true));
    commentFormRegistry
      .on('teardown', this.registerSeen.bind(this));
  },

  /**
   * _For internal use._ Perform some comment-related operations when the registry is filled, in
   * addition to those performed when each comment is added to the registry.
   */
  setup() {
    // This can be updated after an in-script page reload if the user agrees to this setting in the
    // onboarding popup (settings.maybeSuggestEnableCommentReformatting()).
    this.reformatCommentsSetting = settings.get('reformatComments');

    this.reformatTimestamps();
    this.findAndUpdateTableComments();
    this.adjustDom();
    this.handleDtTimestampsClick();
  },

  /**
   * Add a comment to the list.
   *
   * @param {Comment} item
   */
  add(item) {
    this.items.push(item);
  },

  /**
   * Get all comments on the page ordered the same way as in the DOM. It returns the original array,
   * so use `.slice()` when changing it.
   *
   * @returns {Comment[]}
   */
  getAll() {
    return this.items;
  },

  /**
   * Get a comment by index.
   *
   * @param {number} index Use a negative index to count from the end.
   * @returns {?Comment}
   */
  getByIndex(index) {
    if (index < 0) {
      index = this.items.length + index;
    }
    return this.items[index] || null;
  },

  /**
   * Get the number of comments.
   *
   * @returns {number}
   */
  getCount() {
    return this.items.length;
  },

  /**
   * Get comments by a condition.
   *
   * @param {Function} condition
   * @returns {Comment[]}
   */
  query(condition) {
    return this.items.filter(condition);
  },

  /**
   * Reset the comment list.
   */
  reset() {
    this.items = [];
  },

  /**
   * Set the {@link Comment#isNew} and {@link Comment#isSeen} properties to comments.
   *
   * @param {object} currentPageData Visits data for the current page.
   * @param {number} currentTime Unix timestamp.
   * @param {boolean} markAsReadRequested Have the user requested to mark all shown comments as
   *   read.
   * @returns {boolean} Whether there is a time conflict.
   */
  initNewAndSeen(currentPageData, currentTime, markAsReadRequested) {
    let timeConflict = false;
    const unseenComments = controller.getBootProcess().passedData.unseenComments;
    this.items.forEach((comment) => {
      const unseenComment = unseenComments?.find((c) => c.id === comment.id);
      const commentTimeConflict = comment.initNewAndSeen(
        currentPageData,
        currentTime,
        markAsReadRequested ? undefined : unseenComment,
        unseenComment?.isChangedSincePreviousVisit ? unseenComment.$changeNote : undefined
      );
      timeConflict ||= commentTimeConflict;
    });

    this.configureAndAddLayers((comment) => comment.isNew);

    return timeConflict;
  },

  /**
   * Configure and add layers for a group of comments.
   *
   * @param {Function} condition
   */
  configureAndAddLayers(condition) {
    const comments = this.items.filter(condition);

    const floatingRects = comments.length ?
      controller.getFloatingElements().map(getExtendedRect) :
      undefined;
    comments.forEach((comment) => {
      comment.configureLayers({
        add: false,
        update: false,
        floatingRects,
      });
    });

    // Faster to add them in one sequence.
    comments.forEach((comment) => {
      comment.addLayers();
    });
  },

  /**
   * Recalculate the offset of the highlighted comments' (usually, new or own) layers and redraw if
   * they've changed.
   *
   * @param {boolean} [redrawAll] Whether to redraw all layers and not stop at first three unmoved.
   */
  maybeRedrawLayers(redrawAll = false) {
    if (controller.isBooting() || (document.hidden && !redrawAll)) return;

    this.layersContainers.forEach((container) => {
      container.cdCouldHaveMoved = true;
    });

    let floatingRects;
    const comments = [];
    const rootBottom = controller.$root[0].getBoundingClientRect().bottom + window.scrollY;
    let notMovedCount = 0;

    // We go from the end and stop at the first _three_ comments that have not been misplaced. A
    // quirky reason for this is that the mouse could be over some comment making its underlay to be
    // repositioned immediately and therefore not appearing as misplaced to this procedure. Three
    // comments threshold should be more reliable.
    this.items.slice().reverse().some((comment) => {
      const shouldBeHighlighted = (
        !comment.isCollapsed &&
        (
          comment.isNew ||
          comment.isOwn ||
          comment.isTarget ||
          comment.isHovered ||
          comment.isDeleted ||

          // Need to generate a gray line to close the gaps between adjacent list item elements.
          comment.isLineGapped
        )
      );

      // Layers that ended up under the bottom of the page content and could be moving the page
      // bottom down.
      const isUnderRootBottom = comment.offset && comment.offset.bottom > rootBottom;

      if (comment.underlay && !shouldBeHighlighted && isUnderRootBottom) {
        comment.removeLayers();
      } else if (shouldBeHighlighted) {
        floatingRects ||= controller.getFloatingElements().map(getExtendedRect);
        const isMoved = comment.configureLayers({
          // If a comment was hidden, then became visible, we need to add the layers.
          add: true,

          update: false,
          floatingRects,
        });
        if (isMoved || redrawAll) {
          notMovedCount = 0;
          comments.push(comment);
        } else if (isMoved === null) {
          comment.removeLayers();

        // Nested containers shouldn't count, the offset of layers inside them may be OK, unlike the
        // layers preceding them.
        } else if (comment.getLayersContainer().cdIsTopLayersContainer) {
          // isMoved === false
          notMovedCount++;
          if (notMovedCount === 2) {
            return true;
          }
        }
      }
      return false;
    });

    // It's faster to update the offsets separately in one sequence.
    comments.forEach((comment) => {
      comment.updateLayersOffset();
    });
  },

  /**
   * _For internal use._ Empty the underlay registry and the layers container elements. Done on page
   * reload.
   */
  resetLayers() {
    this.underlays = [];
    this.layersContainers.forEach((container) => {
      container.innerHTML = '';
    });
  },

  /**
   * _For internal use._ Mark comments that are currently in the viewport as read, and also
   * {@link Comment#flash flash} comments that are prescribed to flash.
   */
  registerSeen() {
    if (document.hidden) return;

    const commentInViewport = this.findInViewport();
    if (!commentInViewport) return;

    const registerIfInViewport = (comment) => {
      const isInViewport = comment.isInViewport();
      if (isInViewport) {
        comment.registerSeen();
        return false;
      } else if (isInViewport === false) {
        // isInViewport could also be `null`.
        return true;
      }
    };

    // Back
    this.items
      .slice(0, commentInViewport.index)
      .reverse()
      .some(registerIfInViewport);

    // Forward
    this.items
      .slice(commentInViewport.index)
      .some(registerIfInViewport);

    this.emit('registerSeen');
  },

  /**
   * Find any one comment inside the viewport.
   *
   * @param {string} [findClosestDirection] If there is no comment in the viewport, find the closest
   *   comment in the specified direction.
   * @returns {?Comment}
   */
  findInViewport(findClosestDirection) {
    // Reset the roughOffset property. It is used only within this method.
    this.items.forEach((comment) => {
      delete comment.roughOffset;
    });

    const viewportTop = window.scrollY + cd.g.bodyScrollPaddingTop;
    const viewportBottom = window.scrollY + window.innerHeight;

    // Visibility is checked in the sense that an element is visible on the page, not necessarily in
    // the viewport.
    const isVisible = (comment) => {
      comment.getOffset({ set: true });
      return Boolean(comment.roughOffset);
    };
    const findVisible = (direction, startIndex = 0, endIndex) => {
      let comments = reorderArray(this.items, startIndex, direction === 'backward');
      if (endIndex !== undefined) {
        comments = comments.filter((comment) => (
          direction === 'forward' ?
            comment.index >= startIndex && comment.index < endIndex :
            comment.index <= startIndex && comment.index > endIndex
        ));
      }
      return comments.find(isVisible) || null;
    };

    const firstVisibleComment = findVisible('forward');
    const lastVisibleComment = findVisible('backward', this.items.length - 1);
    if (!firstVisibleComment) {
      return null;
    }

    let searchArea = {
      top: firstVisibleComment,
      bottom: lastVisibleComment,
    };
    let comment = searchArea.top;
    let foundComment;

    const findClosest = (direction, searchArea, reverse = false) => (
      direction ?
        findVisible(
          direction,
          searchArea[(direction === 'forward' ? reverse : !reverse) ? 'top' : 'bottom'].index
        ) :
        null
    );

    // Here, we don't iterate over this.items as it may look like. We perform a so-called
    // interpolation search: narrow the search region by getting a proportion of the distance
    // between far away comments and the viewport and calculating the ID of the next comment based
    // on it; then, the position of that next comment is checked, and so on. this.items.length value
    // is used as an upper boundary for the number of cycle steps. It's more of a protection against
    // an infinite loop: the value is with a large margin and not practically reachable, unless when
    // there is only few comments. Usually the cycle finishes after a few steps.
    for (let i = 0; i < this.items.length; i++) {
      if (!comment.roughOffset) {
        comment.getOffset({ set: true });
        if (!comment.roughOffset) {
          comment = (
            findVisible('forward', comment.index, searchArea.bottom.index) ||
            findVisible('backward', comment.index, searchArea.top.index)
          );
          if (!comment) {
            foundComment = findClosest(findClosestDirection, searchArea);
            break;
          }
        }
      }

      if (comment.isInViewport(false)) {
        foundComment = comment;
        break;
      }

      if (
        comment.roughOffset &&

        (
          // The bottom edge of the viewport is above the first comment.
          (
            comment === firstVisibleComment &&
            viewportBottom < comment.roughOffset.bottomForVisibility
          ) ||

          // The top edge of the viewport is below the last comment.
          (comment === lastVisibleComment && viewportTop > comment.roughOffset.top)
        )
      ) {
        foundComment = findClosest(findClosestDirection, searchArea, true);
        break;
      }

      // Should usually be the case only if there is one comment on the page. But the proportion
      // below fails in rare cases too (see the console.warn call).
      if (searchArea.top === searchArea.bottom) {
        foundComment = findClosest(findClosestDirection, searchArea);
        break;
      }

      if (comment === firstVisibleComment) {
        comment = searchArea.bottom;
      } else {
        searchArea[viewportTop > comment.roughOffset.top ? 'top' : 'bottom'] = comment;

        // There's not a single comment in the viewport.
        if (searchArea.bottom.index - searchArea.top.index <= 1) {
          foundComment = findClosest(findClosestDirection, searchArea);
          break;
        }

        // Determine the ID of the next comment to check.
        const higherTop = searchArea.top.roughOffset.top;
        const lowerBottom = searchArea.bottom.roughOffset.bottomForVisibility;
        const proportion = (
          (viewportTop - higherTop) /
          ((lowerBottom - viewportBottom) + (viewportTop - higherTop))
        );
        if (proportion < 0 || proportion >= 1) {
          console.warn(
            'The proportion shouldn\'t be less than 0 or greater or equal to 1.',
            'proportion', proportion,
            'searchArea', searchArea
          );
        }
        const index = Math.round(
          (searchArea.bottom.index - searchArea.top.index - 1) * proportion +
          searchArea.top.index +
          0.5
        );
        comment = this.items[index];
      }
    }

    return foundComment || null;
  },

  /**
   * Handles the `mousemove` and `mouseover` events and highlights hovered comments even when the
   * cursor is between comment parts, not over them. (An event handler for comment part elements
   * wouldn't be able to handle this space between.)
   *
   * @param {Event} e
   */
  maybeHighlightHovered(e) {
    if (this.reformatCommentsSetting) return;

    const isObstructingElementHovered = controller.isObstructingElementHovered();
    this.items
      .filter((comment) => comment.underlay)
      .forEach((comment) => {
        comment.updateHoverState(e, isObstructingElementHovered);
      });
  },

  /**
   * Get a comment by ID in the CD format.
   *
   * @param {string} id
   * @param {boolean} [impreciseDate=false] Comment date is inferred from the edit date (but these
   *   may be different). If `true`, we allow the time on the page to be 1-3 minutes less than the
   *   edit time.
   * @returns {?Comment}
   */
  getById(id, impreciseDate = false) {
    if (!this.items.length || !id) {
      return null;
    }

    const findById = (id) => this.items.find((comment) => comment.id === id);

    let comment = findById(id);
    if (!comment && impreciseDate) {
      const { date, author } = Comment.parseId(id) || {};
      for (let gap = 1; !comment && gap <= 3; gap++) {
        comment = findById(
          Comment.generateId(new Date(date.getTime() - cd.g.msInMin * gap), author)
        );
      }
    }

    return comment || null;
  },

  /**
   * Get a comment by a comment ID in the DiscussionTools format.
   *
   * @param {string} id
   * @param {boolean} [returnComponents=false] Whether to return the constituents of the ID (as an
   *   object) together with a comment.
   * @returns {?(Comment|object)}
   */
  getByDtId(id, returnComponents = false) {
    const data = Comment.parseDtId(id);
    if (!data) {
      return null;
    }

    let comments = this.items.filter((comment) => (
      comment.date &&
      comment.date.getTime() === data.date.getTime() &&
      comment.author.getName() === data.author
    ));

    let comment;
    if (comments.length === 1) {
      comment = comments[0];
    } else if (comments.length > 1) {
      comments = comments.filter((comment) => (
        comment.getParent()?.date?.getTime() === data.parentDate?.getTime() &&
        comment.getParent()?.author.getName() === data.parentAuthor &&
        (!data.sectionIdBeginning || comment.section?.id.startsWith(data.sectionIdBeginning))
      ));
      comment = comments.length === 1 ? comments[0] : comments[data.index || 0];
    }

    if (returnComponents) {
      data.comment = comment;
      return data;
    }

    return comment;
  },

  /**
   * Get a comment by a comment ID in the CD or DiscussionTools format.
   *
   * @param {string} id
   * @param {boolean} [impreciseDate=false] (For CD IDs.) Comment date is inferred from the edit
   *   date (but these may be different). If `true`, we allow the time on the page to be 1-3 minutes
   *   less than the edit time.
   * @returns {?Comment}
   */
  getByAnyId(id, impreciseDate = false) {
    return Comment.isId(id) ?
      this.getById(id, impreciseDate) :
      this.getByDtId(id);
  },

  /**
   * _For internal use._ Filter out floating and hidden elements from all the comments'
   * {@link CommentSkeleton#highlightables highlightables}, change their attributes, and update the
   * comments' level and parent elements' level classes.
   */
  reviewHighlightables() {
    this.items.forEach((comment) => {
      comment.reviewHighlightables();
      comment.isLineGapped = comment.highlightables.length > 1 && comment.level > 0;
    });
  },

  /**
   * _For internal use._ Add new comments notifications to threads and sections.
   *
   * @param {Map} newComments
   */
  addNewCommentsNotes(newComments) {
    controller.saveRelativeScrollPosition();

    this.items.forEach((comment) => {
      comment.subitemList.remove('newCommentsNote');
    });

    // Section-level replies notes.
    $('.cd-thread-newCommentsNote').remove();

    const newCommentsByParent = new Map();
    newComments.forEach((comment) => {
      let key;
      if (comment.parent) {
        key = comment.parentMatch;
      } else {
        // If there is no section match, use the ancestor sections' section match.
        for (let s = comment.section; s && !key; s = s.parent) {
          key = s.match;
        }
      }

      // Indirect comment children and comments out of section
      if (!key) return;

      if (!newCommentsByParent.get(key)) {
        newCommentsByParent.set(key, []);
      }
      newCommentsByParent.get(key).push(comment);
    });

    const newCommentIndexes = newComments.map((comment) => comment.index);
    newCommentsByParent.forEach((comments, parent) => {
      if (parent instanceof Comment) {
        this.addNewCommentsNote(parent, comments, 'thread', newCommentIndexes);
      } else {
        // Add notes for level 0 comments and their children and the rest of the comments (for
        // example, level 1 comments without a parent and their children) separately.
        const sectionComments = comments
          .filter((comment) => comment.logicalLevel === 0)
          .reduce((arr, child) => (
            this.searchForNewCommentsInSubtree(child, arr, newCommentIndexes)
          ), []);
        const threadComments = comments.filter((comment) => !sectionComments.includes(comment));
        this.addNewCommentsNote(parent, sectionComments, 'section', newCommentIndexes);
        this.addNewCommentsNote(parent, threadComments, 'thread', newCommentIndexes);
      }
    });

    controller.restoreRelativeScrollPosition();
  },

  /**
   * Add an individual new comments notification to a thread or section.
   *
   * @param {import('./Comment').default|import('./Section').default} parent
   * @param {import('./CommentSkeleton').default[]} childComments
   * @param {'thread'|'section'} type
   * @param {import('./CommentSkeleton').default[]} newCommentIndexes
   * @private
   */
  addNewCommentsNote(parent, childComments, type, newCommentIndexes) {
    if (!childComments.length) return;

    const descendantComments = parent instanceof Comment ?
      childComments.reduce((arr, child) => (
        this.searchForNewCommentsInSubtree(child, arr, newCommentIndexes)
      ), []) :
      childComments;

    const authors = descendantComments
      .map((comment) => comment.author)
      .filter(unique);
    const button = new OO.ui.ButtonWidget({
      label: cd.s(
        type === 'thread' ? 'thread-newcomments' : 'section-newcomments',
        descendantComments.length,
        authors.length,
        authors.map((author) => author.getName()).join(cd.mws('comma-separator')),
        getCommonGender(authors)
      ),
      framed: false,
      classes: ['cd-button-ooui'],
    });
    button.on('click', () => {
      controller.reload({
        commentIds: descendantComments.map((comment) => comment.id),
        pushState: true,
      });
    });

    if (parent instanceof Comment) {
      button.$element.addClass('cd-thread-button');
      const { $wrappingItem } = parent.addSubitem('newCommentsNote', 'bottom');
      $wrappingItem
        .addClass('cd-thread-button-container cd-thread-newCommentsNote')
        .append(button.$element);

      // Update the collapsed range for the thread.
      if (parent.thread?.isCollapsed) {
        parent.thread.expand();
        parent.thread.collapse(null, true);
      }
    } else if (type === 'thread' && parent.$replyButtonWrapper) {
      button.$element.addClass('cd-thread-button');
      const tagName = parent.$replyButtonContainer.prop('tagName') === 'DL' ? 'dd' : 'li';
      $(`<${tagName}>`)
        .addClass('cd-thread-button-container cd-thread-newCommentsNote')
        .append(button.$element)
        .insertBefore(parent.$replyButtonWrapper);
    } else {
      button.$element.addClass('cd-section-button');
      (
        type === 'section' ?
          $('<div>').append(button.$element) :
          $('<dl>').append($('<dd>').append(button.$element))
      )
        .addClass('cd-thread-button-container cd-thread-newCommentsNote')
        .insertAfter(
          parent.$addSubsectionButtonContainer && !parent.getChildren().length ?
            parent.$addSubsectionButtonContainer :
            parent.$replyButtonContainer || parent.lastElementInFirstChunk
        );
    }
  },

  /**
   * _For internal use._ Reformat the comments (moving the author and date up and links down) if the
   * relevant setting is enabled.
   */
  async reformatComments() {
    if (!this.reformatCommentsSetting) return;

    $(document.body).addClass('cd-reformattedComments');
    if (!cd.page.exists()) return;

    const pagesToCheckExistence = [];
    this.items.forEach((comment) => {
      pagesToCheckExistence.push(...comment.replaceSignatureWithHeader());
      comment.addMenu();
    });

    // Check existence of user and user talk pages and apply respective changes to elements.
    const pageNamesToLinks = {};
    pagesToCheckExistence.forEach((page) => {
      pageNamesToLinks[page.pageName] ||= [];
      pageNamesToLinks[page.pageName].push(page.link);
    });
    const pagesExistence = await getPagesExistence(Object.keys(pageNamesToLinks));
    Object.keys(pagesExistence).forEach((name) => {
      pageNamesToLinks[name].forEach((link) => {
        link.title = pagesExistence[name].normalized;
        if (pagesExistence[name].exists) {
          link.href = mw.util.getUrl(pagesExistence[name].normalized);
        } else {
          link.classList.add('new');
          link.href = mw.util.getUrl(name, {
            action: 'edit',
            redlink: 1,
          });
        }
      });
    });
  },

  /**
   * _For internal use._ Change the format of the comment timestamps according to the settings.
   */
  reformatTimestamps() {
    if (!cd.g.areTimestampsAltered) return;

    this.items.forEach((comment) => {
      comment.reformatTimestamp();
    });
  },

  /**
   * Change the state of all comments to unselected.
   *
   * @private
   */
  resetSelectedComment() {
    const comment = this.items.find((comment) => comment.isSelected);
    if (comment) {
      comment.setSelected(false);
      this.emit('unselected', comment);
    }
  },

  /**
   * Determine which comment on the page is selected.
   *
   * @returns {?Comment}
   */
  getSelectedComment() {
    const selection = window.getSelection();
    const selectionText = selection.toString().trim();
    let comment;
    if (selectionText) {
      const { higherNode } = getHigherNodeAndOffsetInSelection(selection);
      const treeWalker = new TreeWalker(controller.rootElement, null, false, higherNode);
      let commentIndex;
      do {
        commentIndex = treeWalker.currentNode.dataset?.cdCommentIndex;
      } while (commentIndex === undefined && treeWalker.parentNode());
      if (commentIndex !== undefined) {
        comment = this.items[commentIndex];
        if (comment) {
          if (!comment.isSelected) {
            this.resetSelectedComment();
            comment.setSelected(true);
            this.emit('selected', comment);
          }
        } else {
          this.resetSelectedComment();
        }
      } else {
        this.resetSelectedComment();
      }
    } else {
      this.resetSelectedComment();
    }
    return comment || null;
  },

  /**
   * Find a previous comment by time by the specified author within a 1-day window.
   *
   * @param {Date} date
   * @param {string} author
   * @returns {Comment}
   * @private
   */
  findPriorComment(date, author) {
    return this.items
      .filter((comment) => (
        comment.author.getName() === author &&
        comment.date &&
        comment.date < date &&
        comment.date.getTime() > date.getTime() - cd.g.msInDay
      ))
      .sort((c1, c2) => c1.date.getTime() - c2.date.getTime())
      .slice(-1)[0];
  },

  /**
   * _For internal use._ Add available DiscussionTools IDs to respective comments.
   *
   * @param {string[]} ids
   */
  setDtIds(ids) {
    ids.forEach((id) => {
      const comment = this.getByDtId(id);
      if (comment) {
        comment.dtId = id;
      }
    });
  },

  /**
   * _For internal use._ Set the {@link Comment#isTableComment} property for each "table comment",
   * i.e. a comment that is (or its signature is) inside a table containing only that comment.
   */
  findAndUpdateTableComments() {
    // Faster than doing it for every individual comment.
    controller.rootElement
      .querySelectorAll('table.cd-comment-part .cd-signature, .cd-comment-part > table .cd-signature')
      .forEach((signature) => {
        const index = signature.closest('.cd-comment-part').dataset.cdCommentIndex;
        if (index !== undefined) {
          this.items[index].isTableComment = true;
        }
      });
  },

  /**
   * Add comment's children, including indirect, into an array, if they are in the array of all new
   * comments.
   *
   * @param {import('./CommentSkeleton').default} childComment
   * @param {import('./CommentSkeleton').default[]} newCommentsInSubtree
   * @param {number[]} newCommentIndexes
   * @returns {import('./CommentSkeleton').default[]}
   * @private
   */
  searchForNewCommentsInSubtree(childComment, newCommentsInSubtree, newCommentIndexes) {
    if (newCommentIndexes.includes(childComment.index)) {
      newCommentsInSubtree.push(childComment);
    }
    childComment.children.forEach((childComment) => {
      this.searchForNewCommentsInSubtree(childComment, newCommentsInSubtree, newCommentIndexes);
    });
    return newCommentsInSubtree;
  },

  /**
   * _For internal use._ Perform some DOM-related tasks after parsing comments.
   */
  adjustDom() {
    this.mergeAdjacentCommentLevels();
    this.mergeAdjacentCommentLevels();
    if (
      controller.rootElement.querySelector('.cd-commentLevel:not(ol) + .cd-commentLevel:not(ol)')
    ) {
      console.warn('.cd-commentLevel adjacencies have left.');
    }

    this.items.slice(1).forEach((comment) => {
      comment.maybeSplitParent();
    });
  },

  /**
   * Remove DT's event listener from its comment links and attach ours.
   *
   * @private
   */
  handleDtTimestampsClick() {
    if (this.reformatCommentsSetting) return;

    this.items.forEach((comment) => {
      comment.handleDtTimestampClick();
    });
  },

  /**
   * Combine two adjacent `.cd-commentLevel` elements into one, recursively going deeper in terms of
   * nesting level.
   *
   * @private
   */
  mergeAdjacentCommentLevels() {
    const levels = controller.rootElement
      .querySelectorAll('.cd-commentLevel:not(ol) + .cd-commentLevel:not(ol)');
    if (!levels.length) return;

    const isOrHasCommentLevel = (el) => (
      (el.classList.contains('cd-commentLevel') && el.tagName !== 'OL') ||
      el.querySelector('.cd-commentLevel:not(ol)')
    );

    [...levels].forEach((bottomElement) => {
      const topElement = bottomElement.previousElementSibling;

      // If the previous element was removed in this cycle. (Or it could be absent for some other
      // reason? I can confirm that I witnessed a case where the element was absent, but didn't pay
      // attention why unfortunately.)
      if (!topElement) return;

      let currentTopElement = topElement;
      let currentBottomElement = bottomElement;
      do {
        const topTag = currentTopElement.tagName;
        const bottomInnerTags = {};
        if (topTag === 'UL') {
          bottomInnerTags.DD = 'LI';
        } else if (topTag === 'DL') {
          bottomInnerTags.LI = 'DD';
        }

        let firstMoved;
        if (isOrHasCommentLevel(currentTopElement)) {
          const firstElementChild = currentBottomElement.firstElementChild;

          /*
            Avoid collapsing adjacent <li>s and <dd>s if we deal with a structure like this:

              <li>
                <div>Comment</div>
                <ul>Replies</ul>
              </li>
              <li>
                <div>Comment</div>
                <ul>Replies</ul>
              </li>
          */
          if (['DL', 'DD', 'UL', 'LI'].includes(firstElementChild.tagName)) {
            while (currentBottomElement.childNodes.length) {
              let child = currentBottomElement.firstChild;
              if (child.tagName) {
                if (bottomInnerTags[child.tagName]) {
                  child = this.changeElementType(child, bottomInnerTags[child.tagName]);
                }
                firstMoved ??= child;
              } else if (firstMoved === undefined && child.textContent.trim()) {
                // Don't fill the "firstMoved" variable which is used further to merge elements if
                // there is a non-empty text node between. (An example that is now fixed:
                // https://ru.wikipedia.org/wiki/Википедия:Форум/Архив/Викиданные/2018/1_полугодие#201805032155_NBS,
                // but other can be on the loose.) Instead, wrap the text node into an element to
                // prevent it from being ignored when searching next time for adjacent .commentLevel
                // elements. This could be seen only as an additional precaution, since it doesn't
                // fix the source of the problem: the fact that a bare text node is (probably) a
                // part of the reply. It shouldn't be happening.
                firstMoved = null;
                const newChild = document.createElement('span');
                newChild.appendChild(child);
                child = newChild;
              }
              currentTopElement.appendChild(child);
            }
            currentBottomElement.remove();
          }
        }

        currentBottomElement = firstMoved;
        currentTopElement = firstMoved?.previousElementSibling;
      } while (
        currentTopElement &&
        currentBottomElement &&
        isOrHasCommentLevel(currentBottomElement)
      );
    });
  },

  /**
   * Replace an element with an identical one but with another tag name, i.e. move all child nodes,
   * attributes, and some bound events to a new node, and also reassign references in some variables
   * and properties to this element. Unfortunately, we can't just change the element's `tagName` to
   * do that.
   *
   * @param {Element} element
   * @param {string} newType
   * @returns {Element}
   */
  changeElementType(element, newType) {
    const newElement = document.createElement(newType);
    while (element.firstChild) {
      newElement.appendChild(element.firstChild);
    }
    [...element.attributes].forEach((attribute) => {
      newElement.setAttribute(attribute.name, attribute.value);
    });

    // If this element is a part of a comment, replace it in the Comment object instance.
    const commentIndex = element.getAttribute('data-cd-comment-index');
    if (commentIndex !== null) {
      this.items[Number(commentIndex)].replaceElement(element, newElement);
    } else {
      element.parentNode.replaceChild(newElement, element);
    }

    controller.replaceScrollAnchorElement(element, newElement);

    return newElement;
  },

  /**
   * _For internal use._ Add the `'cd-connectToPreviousItem'` class to some item elements to
   * visually connect threads broken by some intervention.
   */
  connectBrokenThreads() {
    const items = [];

    controller.rootElement
      .querySelectorAll('dd.cd-comment-part-last + dd, li.cd-comment-part-last + li')
      .forEach((el) => {
        if (el.firstElementChild?.classList.contains('cd-commentLevel')) {
          items.push(el);
        }
      });

    // When editing https://en.wikipedia.org/wiki/Wikipedia:Village_pump_(technical)/Archive_212#c-PrimeHunter-20240509091500-2605:A601:AAF7:3700:A1D7:26C1:E273:28CF-20240509055600
    controller.rootElement
      .querySelectorAll('dd.cd-comment-part:not(.cd-comment-part-last) + dd > .cd-comment-part:first-child, li.cd-comment-part:not(.cd-comment-part-last) + li > .cd-comment-part:first-child')
      .forEach((el) => {
        items.push(el.parentNode);
      });

    // https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#202009202110_Example
    controller.rootElement
      .querySelectorAll('.cd-comment-replacedPart.cd-comment-part-last')
      .forEach((el) => {
        const possibleItem = el.parentNode.nextElementSibling;
        if (possibleItem?.firstElementChild?.classList.contains('cd-commentLevel')) {
          items.push(possibleItem);
        }
      });

    // https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#Image_breaking_a_thread
    controller.rootElement
      .querySelectorAll('.cd-commentLevel + .thumb + .cd-commentLevel > li')
      .forEach((el) => {
        items.push(el);
      });

    if (controller.areThereOutdents()) {
      // Outdent templates. We could instead merge adjacent <li>s, but if there is a {{outdent|0}}
      // template and the whole <li> of the parent is considered a comment part, then we can't do
      // that.
      controller.rootElement
        .querySelectorAll(`.cd-commentLevel > li + li > .${cd.config.outdentClass}, .cd-commentLevel > dd + dd > .${cd.config.outdentClass}`)
        .forEach((el) => {
          items.push(el.parentNode);
        });
      controller.rootElement
        .querySelectorAll(`.cd-commentLevel > li + .cd-comment-outdented, .cd-commentLevel > dd + .cd-comment-outdented`)
        .forEach((el) => {
          items.push(el);
        });
    }

    items.forEach((item) => {
      item.classList.add('cd-connectToPreviousItem');
    });
  },
};
