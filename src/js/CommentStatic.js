import Comment from './Comment';
import cd from './cd';
import navPanel from './navPanel';
import { TreeWalker } from './treeWalker';
import { generateCommentAnchor, parseCommentAnchor } from './timestamp';
import {
  getCommonGender,
  getExtendedRect,
  getHigherNodeAndOffsetInSelection,
  reorderArray,
  restoreRelativeScrollPosition,
  saveRelativeScrollPosition,
  unique,
} from './util';
import { getPagesExistence } from './apiWrappers';
import { isPageLoading, reloadPage } from './boot';

/**
 * Add all comment's children, including indirect, into array, if they are in the array of new
 * comments.
 *
 * @param {CommentSkeleton} child
 * @param {CommentSkeleton[]} arr
 * @param {number[]} newCommentIds
 * @private
 */
function searchForNewCommentsInSubtree(child, arr, newCommentIds) {
  if (newCommentIds.includes(child.id)) {
    arr.push(child);
  }
  child.children.forEach((child) => {
    searchForNewCommentsInSubtree(child, arr, newCommentIds);
  });
}

/**
 * Add an individual new comments notification to a thread or section.
 *
 * @param {CommentSkeleton[]} comments
 * @param {Comment|Section} parent
 * @param {string} type
 * @param {CommentSkeleton[]} newCommentIds
 * @private
 */
function addNewCommentsNote(comments, parent, type, newCommentIds) {
  if (!comments.length) return;

  let commentsWithChildren;
  if (parent instanceof Comment) {
    commentsWithChildren = [];
    comments.forEach((child) => {
      searchForNewCommentsInSubtree(child, commentsWithChildren, newCommentIds);
    });
  } else {
    commentsWithChildren = comments;
  }

  const authors = commentsWithChildren
    .map((comment) => comment.author)
    .filter(unique);
  const authorList = authors.map((author) => author.name).join(cd.mws('comma-separator'));
  const commonGender = getCommonGender(authors);
  const stringName = type === 'thread' ? 'thread-newcomments' : 'section-newcomments';
  const button = new OO.ui.ButtonWidget({
    label: cd.s(stringName, commentsWithChildren.length, authors.length, authorList, commonGender),
    framed: false,
    classes: ['cd-button-ooui', 'cd-thread-button'],
  });
  button.on('click', () => {
    const commentAnchor = commentsWithChildren[0].anchor;
    reloadPage({ commentAnchor });
  });

  if (parent instanceof Comment) {
    const { $wrappingItem } = parent.addSublevelItem('newCommentsNote', 'bottom');
    $wrappingItem
      .addClass('cd-thread-button-container cd-thread-newCommentsNote')
      .append(button.$element);

    // Update collapsed range for the thread.
    if (parent.thread?.isCollapsed) {
      parent.thread.expand();
      parent.thread.collapse();
    }
  } else if (type === 'thread' && parent.$replyWrapper) {
    const tagName = parent.$replyContainer.prop('tagName') === 'DL' ? 'dd' : 'li';
    $(`<${tagName}>`)
      .addClass('cd-thread-button-container cd-thread-newCommentsNote')
      .append(button.$element)
      .insertBefore(parent.$replyWrapper);
  } else {
    let $last;
    if (parent.$addSubsectionButtonContainer && !parent.getChildren().length) {
      $last = parent.$addSubsectionButtonContainer;
    } else if (parent.$replyContainer) {
      $last = parent.$replyContainer;
    } else {
      $last = $(parent.lastElementInFirstChunk);
    }
    button.$element
      .removeClass('cd-thread-button')
      .addClass('cd-section-button');
    let $container;
    if (type === 'section') {
      $container = $('<div>').append(button.$element);
    } else {
      const $item = $('<dd>').append(button.$element);
      $container = $('<dl>').append($item);
    }
    $container
      .addClass('cd-section-button-container cd-thread-newCommentsNote')
      .insertAfter($last);
  }
}

export default {
  /**
   * List of the underlays.
   *
   * @type {Element[]}
   * @memberof Comment
   */
  underlays: [],

  /**
   * List of the containers of the underlays.
   *
   * @type {Element[]}
   * @memberof Comment
   */
  layersContainers: [],

  /**
   * Configure and add layers for a group of comments.
   *
   * @param {Comment[]} comments
   * @memberof Comment
   */
  configureAndAddLayers(comments) {
    let floatingRects;
    if (comments.length) {
      floatingRects = cd.g.floatingElements.map(getExtendedRect);
    }

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
   * @param {boolean} [removeUnhighlighted] Whether to remove the unhighlighted comments' layers.
   *   This is necessary when the window is resized, because these layers can occupy space at the
   *   bottom of the page extending it to the bottom.
   * @param {boolean} [redrawAll] Whether to redraw all layers and not stop at first three unmoved.
   * @param {object} [floatingRects]
   * @memberof Comment
   */
  redrawLayersIfNecessary(removeUnhighlighted = false, redrawAll = false, floatingRects) {
    if (isPageLoading() || (document.hidden && !redrawAll)) return;

    this.layersContainers.forEach((container) => {
      container.cdCouldHaveMoved = true;
    });

    const comments = [];
    const rootBottom = cd.g.$root.get(0).getBoundingClientRect().bottom + window.scrollY;
    let notMovedCount = 0;

    // We go from the end and stop at the first _three_ comments that have not been misplaced. A
    // quirky reason for this is that the mouse could be over some comment making its underlay to be
    // repositioned immediately and therefore not appearing as misplaced to this procedure. Three
    // comments threshold should be more reliable.
    cd.comments.slice().reverse().some((comment) => {
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

      if (comment.underlay && !shouldBeHighlighted && (removeUnhighlighted || isUnderRootBottom)) {
        comment.removeLayers();
      } else if (shouldBeHighlighted && !comment.editForm) {
        floatingRects = floatingRects || cd.g.floatingElements.map(getExtendedRect);
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
        } else if (
          // Nested containers shouldn't count, the offset of the layers inside them may be OK,
          // unlike the layers preceding them.
          !comment.getLayersContainer().parentNode.parentNode
            .closest('.cd-commentLayersContainer-parent')
        ) {
          // isMoved === false
          notMovedCount++;
          if (notMovedCount === 3) {
            return true;
          }
        }
      }
      return false;
    });

    // It's faster to update the offset separately in one sequence.
    comments.forEach((comment) => {
      comment.updateLayersOffset();
    });
  },

  /**
   * _For internal use._ Empty the underlay registry and the layers container elements. Done on page
   * reload.
   *
   * @memberof Comment
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
   *
   * @memberof Comment
   */
  registerSeen() {
    if (document.hidden) return;

    const commentInViewport = Comment.findInViewport();
    if (!commentInViewport) return;

    const registerIfInViewport = (comment) => {
      const isInViewport = comment.isInViewport();
      if (isInViewport) {
        comment.registerSeen();
        return false;
      } else if (isInViewport === false) {
        // isInViewport could also be null.
        return true;
      }
    };

    // Back
    cd.comments
      .slice(0, commentInViewport.id)
      .reverse()
      .some(registerIfInViewport);

    // Forward
    cd.comments
      .slice(commentInViewport.id)
      .some(registerIfInViewport);

    navPanel.updateFirstUnseenButton();
  },

  /**
   * Turn a comment array into an object with sections or their anchors as keys.
   *
   * @param {import('./commonTypedefs').CommentSkeletonLike[]|Comment[]} comments
   * @returns {Map}
   * @memberof Comment
   */
  groupBySection(comments) {
    const commentsBySection = new Map();
    comments.forEach((comment) => {
      const sectionOrAnchor = comment.section ? comment.section : null;
      if (!commentsBySection.get(sectionOrAnchor)) {
        commentsBySection.set(sectionOrAnchor, []);
      }
      commentsBySection.get(sectionOrAnchor).push(comment);
    });

    return commentsBySection;
  },

  /**
   * Find any one comment inside the viewport.
   *
   * @param {string} [findClosestDirection] If there is no comment in the viewport, find the closest
   *   comment in the specified direction.
   * @returns {?Comment}
   * @memberof Comment
   */
  findInViewport(findClosestDirection) {
    // Reset the `roughOffset` property. It is used only within this method.
    cd.comments.forEach((comment) => {
      delete comment.roughOffset;
    });

    const viewportTop = window.scrollY + cd.g.BODY_SCROLL_PADDING_TOP;
    const viewportBottom = viewportTop + window.innerHeight;

    // Visibility is checked in the sense that an element is visible on the page, not necessarily in
    // the viewport.
    const isVisible = (comment) => {
      comment.getOffset({ set: true });
      return Boolean(comment.roughOffset);
    };
    const findVisible = (direction, startIndex = 0, endIndex) => {
      let comments = reorderArray(cd.comments, startIndex, direction === 'backward');
      if (endIndex !== undefined) {
        comments = comments.filter((comment) => (
          direction === 'forward' ?
          comment.id < endIndex && comment.id >= startIndex :
          comment.id > endIndex && comment.id <= startIndex
        ));
      }
      return comments.find(isVisible) || null;
    };

    const firstVisibleComment = findVisible('forward');
    const lastVisibleComment = findVisible('backward', cd.comments.length - 1);
    if (!firstVisibleComment) {
      return null;
    }

    let searchArea = {
      top: firstVisibleComment,
      bottom: lastVisibleComment,
    };
    let comment = searchArea.top;
    let foundComment;

    const findClosest = (direction, searchArea, reverse = false) => {
      if (direction) {
        const isTop = direction === 'forward' ? reverse : !reverse;
        const startIndex = isTop ? searchArea.top.id : searchArea.bottom.id;
        return findVisible(direction, startIndex);
      }
      return null;
    };

    // Here, we don't iterate over cd.comments as it may look like. We narrow the search region by
    // getting a proportion of the distance between far away comments and the viewport and
    // calculating the ID of the next comment based on it; then, the position of that next comment
    // is checked, and so on. cd.comments.length value is used as an upper boundary for the number
    // of cycle steps. It's more of a protection against an infinite loop: the value is with a large
    // margin and not practically reachable, unless when there is only few comments. Usually the
    // cycle finishes after a few steps.
    for (let i = 0; i < cd.comments.length; i++) {
      if (!comment.roughOffset) {
        comment.getOffset({ set: true });
        if (!comment.roughOffset) {
          comment = (
            findVisible('forward', comment.id, searchArea.bottom.id) ||
            findVisible('backward', comment.id, searchArea.top.id)
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
            viewportBottom < comment.roughOffset.downplayedBottom
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
        if (searchArea.bottom.id - searchArea.top.id <= 1) {
          foundComment = findClosest(findClosestDirection, searchArea);
          break;
        }

        // Determine the ID of the next comment to check.
        const higherTop = searchArea.top.roughOffset.top;
        const lowerBottom = searchArea.bottom.roughOffset.downplayedBottom;
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
          (searchArea.bottom.id - searchArea.top.id - 1) * proportion +
          searchArea.top.id +
          0.5
        );
        comment = cd.comments[index];
      }
    }

    return foundComment || null;
  },

  /**
   * Handles the `mousemove` and `mouseover` events and highlights hovered comments even when the
   * cursor is between comment parts, not over them.
   *
   * @param {Event} e
   * @memberof Comment
   */
  highlightHovered(e) {
    const isObstructingElementHovered = (
      Array.from(cd.g.notificationArea?.querySelectorAll('.mw-notification'))
        .some((notification) => notification.matches(':hover')) ||

      cd.g.activeAutocompleteMenu?.matches(':hover') ||

      // In case the user has moved the navigation panel to the other side.
      navPanel.$element?.get(0).matches(':hover') ||

      // WikiEditor dialog
      $(document.body).children('.ui-widget-overlay').length ||

      cd.g.$popupsOverlay
        ?.get(0)
        .querySelector('.oo-ui-popupWidget:not(.oo-ui-element-hidden)')
        ?.matches(':hover')
    );

    cd.comments
      .filter((comment) => comment.underlay)
      .forEach((comment) => {
        const layersOffset = comment.layersOffset;
        const layersContainerOffset = comment.getLayersContainerOffset();
        if (!layersOffset || !layersContainerOffset) {
          // Something has happened with the comment (or the layers container); it disappeared.
          comment.removeLayers();
          return;
        }
        if (
          !isObstructingElementHovered &&
          e.pageY >= layersOffset.top + layersContainerOffset.top &&
          e.pageY <= layersOffset.top + layersOffset.height + layersContainerOffset.top &&
          e.pageX >= layersOffset.left + layersContainerOffset.left &&
          e.pageX <= layersOffset.left + layersOffset.width + layersContainerOffset.left
        ) {
          comment.highlightHovered();
        } else {
          comment.unhighlightHovered();
        }
      });
  },

  /**
   * Get a comment by anchor.
   *
   * @param {string} anchor
   * @param {boolean} impreciseDate Comment date is inferred from the edit date (but these may be
   *   different). If `true`, we allow the time on the page to be 1-3 minutes less than the edit
   *   time.
   * @returns {?Comment}
   * @memberof Comment
   */
  getByAnchor(anchor, impreciseDate) {
    if (!cd.comments || !anchor) {
      return null;
    }

    const findByAnchor = (anchor) => cd.comments.find((comment) => comment.anchor === anchor);

    let comment = findByAnchor(anchor);
    if (!comment && impreciseDate) {
      const { date, author } = parseCommentAnchor(anchor) || {};
      for (let gap = 1; !comment && gap <= 3; gap++) {
        const dateToFind = new Date(date.getTime() - cd.g.MILLISECONDS_IN_MINUTE * gap);
        comment = findByAnchor(generateCommentAnchor(dateToFind, author));
      }
    }

    return comment || null;
  },

  /**
   * _For internal use._ Filter out floating and hidden elements from all the comments'
   * {@link CommentSkeleton#highlightables highlightables}, change their attributes, and update the
   * comments' level and parent elements' level classes.
   *
   * @memberof Comment
   */
  reviewHighlightables() {
    cd.comments.forEach((comment) => {
      comment.reviewHighlightables();
      comment.isLineGapped = comment.highlightables.length > 1 && comment.level > 0;
    });
  },

  /**
   * _For internal use._ Add new comments notifications to threads and sections.
   *
   * @param {Map} newComments
   * @memberof Comment
   */
  addNewCommentsNotes(newComments) {
    saveRelativeScrollPosition();

    cd.comments.forEach((comment) => {
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

    const newCommentIds = newComments.map((c) => c.id);
    newCommentsByParent.forEach((comments, parent) => {
      if (parent instanceof Comment) {
        addNewCommentsNote(comments, parent, 'thread', newCommentIds);
      } else {
        // Add notes for level 0 comments and their children and the rest of the comments (for
        // example, level 1 comments without a parent and their children) separately.
        const level0Comments = comments.filter((comment) => comment.logicalLevel === 0);
        let sectionComments = [];
        level0Comments.forEach((child) => {
          searchForNewCommentsInSubtree(child, sectionComments, newCommentIds);
        });
        const threadComments = comments.filter((comment) => !sectionComments.includes(comment));
        addNewCommentsNote(sectionComments, parent, 'section', newCommentIds);
        addNewCommentsNote(threadComments, parent, 'thread', newCommentIds);
      }
    });

    restoreRelativeScrollPosition();
  },

  /**
   * _For internal use._ Reformat the comments (moving the author and date up and links down) if the
   * relevant setting is enabled.
   *
   * @memberof Comment
   */
  async reformatComments() {
    if (cd.settings.reformatComments) {
      const pagesToCheckExistence = [];
      $(document.body).addClass('cd-reformattedComments');
      cd.comments.forEach((comment) => {
        pagesToCheckExistence.push(...comment.replaceSignatureWithHeader());
        comment.addMenu();
      });

      // Check existence of user and user talk pages and apply respective changes to elements.
      const pageNamesToLinks = {};
      pagesToCheckExistence.forEach((page) => {
        const pageName = page.pageName;
        if (!pageNamesToLinks[pageName]) {
          pageNamesToLinks[pageName] = [];
        }
        pageNamesToLinks[pageName].push(page.link);
      });
      const pageNames = Object.keys(pageNamesToLinks);
      const pagesExistence = await getPagesExistence(pageNames);
      Object.keys(pagesExistence).forEach((name) => {
        pageNamesToLinks[name].forEach((link) => {
          link.title = pagesExistence[name].normalized;
          if (!pagesExistence[name].exists) {
            link.classList.add('new');
            link.href = mw.util.getUrl(name, {
              action: 'edit',
              redlink: 1,
            });
          }
        });
      });
    }
  },

  /**
   * _For internal use._ Change the format of the comment timestamps according to the settings.
   *
   * @memberof Comment
   */
  reformatTimestamps() {
    if (cd.g.ARE_TIMESTAMPS_ALTERED) {
      cd.comments.forEach((comment) => {
        comment.reformatTimestamp();
      });
    }
  },

  resetSelectedComment() {
    const comment = cd.comments.find((comment) => comment.isSelected);
    if (comment) {
      comment.isSelected = false;
      comment.replyButton.setLabel(cd.s('cm-reply'));
    }
  },

  getSelectedComment() {
    const selection = window.getSelection();
    const selectionText = selection.toString().trim();
    let comment;
    if (selectionText) {
      const { higherNode } = getHigherNodeAndOffsetInSelection(selection);
      const treeWalker = new TreeWalker(cd.g.rootElement, null, false, higherNode);
      let commentId;
      do {
        commentId = treeWalker.currentNode.dataset?.cdCommentId;
      } while (commentId === undefined && treeWalker.parentNode());
      if (commentId !== undefined) {
        comment = cd.comments[commentId];
        Comment.resetSelectedComment();
        if (comment && comment.isActionable && !comment.replyForm) {
          comment.isSelected = true;
          comment.replyButton.setLabel(cd.s('cm-quote'));
        }
      } else {
        Comment.resetSelectedComment();
      }
    } else {
      Comment.resetSelectedComment();
    }
    return comment || null;
  }
};
