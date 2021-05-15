/**
 * Methods related to comments.
 *
 * @module CommentStatic
 */

import Comment from './Comment';
import Section from './Section';
import cd from './cd';
import navPanel from './navPanel';
import {
  getExtendedRect,
  reorderArray,
  restoreRelativeScrollPosition,
  saveRelativeScrollPosition,
  unique,
} from './util';
import { getPagesExistence } from './apiWrappers';
import { reloadPage } from './boot';

export default {
  /**
   * Configure and add underlayers for a group of comments.
   *
   * @param {Comment[]} comments
   * @memberof module:Comment
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
   * Mark comments that are currently in the viewport as read, and also {@link module:Comment#flash
   * flash} comments that are prescribed to flash.
   *
   * @memberof module:Comment
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
   * Object with the same basic structure as {@link module:CommentSkeleton} has. (It comes from a
   * web worker so its constuctor is lost.)
   *
   * @typedef {object} CommentSkeletonLike
   */

  /**
   * Turn comment array into object with section anchors as keys.
   *
   * @param {CommentSkeletonLike[]|Comment[]} comments
   * @returns {Map}
   * @private
   * @memberof module:Comment
   */
  groupBySection(comments) {
    const commentsBySection = new Map();
    comments.forEach((comment) => {
      let sectionOrAnchor;
      if (comment instanceof Comment) {
        sectionOrAnchor = comment.section;
      } else if (comment.section) {
        sectionOrAnchor = comment.section.match || comment.section.anchor;
      } else {
        sectionOrAnchor = null;
      }

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
   * @memberof module:Comment
   */
  findInViewport(findClosestDirection) {
    const viewportTop = window.scrollY + cd.g.BODY_SCROLL_PADDING_TOP;
    const viewportBottom = viewportTop + window.innerHeight;

    // Visibility in the sense that an element is visible on the page, not necessarily in the
    // viewport.
    const isVisible = (comment) => {
      comment.getPositions();
      return Boolean(comment.positions);
    };
    const findVisible = (direction, startIndex = 0) => {
      const comments = reorderArray(cd.comments, startIndex, direction === 'backward');
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
    let currentComment = searchArea.top;
    let foundComment;

    const findClosest = (direction, searchArea, reverse = false) => {
      if (direction) {
        const startIndex = (
          (direction === 'forward' && reverse) ||
          (direction === 'backward' && !reverse)
        ) ?
          searchArea.top.id :
          searchArea.bottom.id;
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
      if (currentComment.isInViewport()) {
        foundComment = currentComment;
        break;
      }

      if (
        currentComment.positions &&

        // The bottom edge of the viewport is above the first comment.
        (
          currentComment === firstVisibleComment &&
          viewportBottom < currentComment.positions.downplayedBottom
        ) ||

        // The top edge of the viewport is below the last comment.
        (currentComment === lastVisibleComment && viewportTop > currentComment.positions.top)
      ) {
        foundComment = findClosest(findClosestDirection, searchArea, true);
        break;
      }

      if (searchArea.top === searchArea.bottom) {
        foundComment = findClosest(findClosestDirection, searchArea);
        break;
      }

      if (!currentComment.positions) {
        // To avoid contriving a sophisticated algorithm for choosing which comment to pick next
        // (and avoid picking any previously picked) we just pick the comment next to the beginning
        // of the search area.
        currentComment = findVisible('forward', searchArea.top.id + 1);
        searchArea.top = currentComment;
        continue;
      }

      if (currentComment === firstVisibleComment) {
        currentComment = searchArea.bottom;
      } else {
        searchArea[viewportTop > currentComment.positions.top ? 'top' : 'bottom'] = currentComment;

        // There's not a single comment in the viewport.
        if (searchArea.bottom.id - searchArea.top.id <= 1) {
          foundComment = findClosest(findClosestDirection, searchArea);
          break;
        }

        // Determine the ID of the next comment to check.
        const higherTop = searchArea.top.positions.top;
        const lowerBottom = searchArea.bottom.positions.downplayedBottom;
        const proportion = (
          (viewportTop - higherTop) /
          ((lowerBottom - viewportBottom) + (viewportTop - higherTop))
        );
        if (proportion < 0 || proportion >= 1) {
          console.warn(
            'The proportion shouldn\'t be more than 0 or less or equal to 1.',
            'proportion', proportion,
            'searchArea', searchArea
          );
        }
        const index = Math.round(
          (searchArea.bottom.id - searchArea.top.id - 1) * proportion +
          searchArea.top.id +
          0.5
        );
        currentComment = cd.comments[index];
      }
    }

    return foundComment || null;
  },

  /**
   * Handles the `mousemove` and `mouseover` events and highlights hovered comments even when the
   * cursor is between comment parts, not over them.
   *
   * @param {Event} e
   * @memberof module:Comment
   */
  highlightHovered(e) {
    if (cd.g.dontHandleScroll || cd.g.isAutoScrollInProgress || cd.util.isPageOverlayOn()) return;

    const isObstructingElementHovered = (
      Array.from(cd.g.NOTIFICATION_AREA?.querySelectorAll('.mw-notification'))
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
        const layersContainerOffset = comment.getLayersContainerOffset();
        if (
          !isObstructingElementHovered &&
          e.pageY >= comment.layersTop + layersContainerOffset.top &&
          e.pageY <= comment.layersTop + comment.layersHeight + layersContainerOffset.top &&
          e.pageX >= comment.layersLeft + layersContainerOffset.left &&
          e.pageX <= comment.layersLeft + comment.layersWidth + layersContainerOffset.left
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
   * @returns {?Comment}
   * @memberof module:Comment
   */
  getByAnchor(anchor) {
    if (!cd.comments || !anchor) {
      return null;
    }
    return cd.comments.find((comment) => comment.anchor === anchor) || null;
  },

  /**
   * Filter out floating and hidden elements from all the comments' {@link
   * module:CommentSkeleton#highlightables}, change their attributes, and update the comments' level
   * and parent elements' level classes.
   */
  reviewHighlightables() {
    cd.comments.forEach((comment) => {
      comment.reviewHighlightables();
      comment.isLineGapped = comment.highlightables.length > 1 && comment.level > 0;
    });
  },

  /**
   * Add new comments notifications to the threads.
   *
   * @param {Map} newComments
   * @memberof module:Section
   */
  addNewRepliesNote(newComments) {
    saveRelativeScrollPosition();

    cd.comments.forEach((comment) => {
      comment.subitemList.remove('newRepliesNote');
    });
    $('.cd-thread-newRepliesNote').remove();

    const newCommentsByParent = new Map();
    newComments.forEach((comment) => {
      let key;
      if (comment.parent) {
        key = comment.parentMatch;
      } else {
        // If there is no section match, use the ancestors' section match.
        for (let s = comment.section; s && !key; s = s.parent) {
          key = s.match;
        }
      }
      if (!key) return;

      if (!newCommentsByParent.get(key)) {
        newCommentsByParent.set(key, []);
      }
      newCommentsByParent.get(key).push(comment);
    });

    const walkThroughChildren = (child, arr) => {
      arr.push(child);
      child.children.forEach((child) => {
        walkThroughChildren(child, arr);
      });
    };

    const addNote = (comments, parent, type = 'thread') => {
      if (!comments.length) return;

      let commentsWithChildren = [];
      comments.forEach((child) => {
        walkThroughChildren(child, commentsWithChildren);
      });

      if (parent instanceof Section) {
        commentsWithChildren = commentsWithChildren.filter(unique);
      }

      const authors = commentsWithChildren
        .map((comment) => comment.author)
        .filter(unique);
      const genders = authors.map((author) => author.getGender());
      let commonGender;
      if (genders.every((gender) => gender === 'female')) {
        commonGender = 'female';
      } else if (genders.every((gender) => gender !== 'female')) {
        commonGender = 'male';
      } else {
        commonGender = 'unknown';
      }
      const userList = authors.map((user) => user.name).join(', ');
      const button = new OO.ui.ButtonWidget({
        label: cd.s(
          type === 'thread' ? 'thread-newcomments' : 'section-newcomments',
          commentsWithChildren.length,
          authors.length,
          userList,
          commonGender
        ),
        framed: false,
        classes: ['cd-button', 'cd-threadButton'],
      });
      button.on('click', () => {
        const commentAnchor = commentsWithChildren[0].anchor;
        reloadPage({ commentAnchor });
      });

      if (parent instanceof Comment) {
        // We can't use Comment#containerListType as it contains the type for the _first_
        // (highlightable) element.
        const parentListType = parent.$elements.last().cdGetContainerListType();

        const [$wrappingItem] = parent
          .createSublevelItem('newRepliesNote', 'bottom', parentListType);
        $wrappingItem
          .addClass('cd-threadButton-container cd-thread-newRepliesNote')
          .append(button.$element);

        // Update collapsed range for the thread
        if (parent.thread?.isCollapsed) {
          parent.thread.expand();
          parent.thread.collapse();
        }
      } else if (type === 'thread' && parent.$replyWrapper) {
        const tagName = parent.$replyContainer.prop('tagName') === 'DL' ? 'dd' : 'li';
        $(`<${tagName}>`)
          .addClass('cd-threadButton-container cd-thread-newRepliesNote')
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
          .removeClass('cd-threadButton')
          .addClass('cd-sectionButton');
        let $container;
        if (type === 'section') {
          $container = $('<div>').append(button.$element);
        } else {
          const $item = $('<dd>').append(button.$element);
          $container = $('<dl>').append($item);
        }
        $container
          .addClass('cd-sectionButton-container cd-thread-newRepliesNote')
          .insertAfter($last);
      }
    };

    newCommentsByParent.forEach((comments, parent) => {
      if (parent instanceof Section) {
        // Add notes for level 0 comments and their children and the rest of comments separately.
        const level0Comments = comments.filter((comment) => comment.logicalLevel === 0);
        let level0CommentsWithChildren = [];
        level0Comments.forEach((child) => {
          walkThroughChildren(child, level0CommentsWithChildren);
        });
        const restOfComments = comments
          .filter((comment) => !level0CommentsWithChildren.includes(comment));
        addNote(restOfComments, parent);
        addNote(level0CommentsWithChildren, parent, 'section');
      } else {
        addNote(comments, parent);
      }
    });

    restoreRelativeScrollPosition();
  },

  async reformatComments() {
    if (cd.settings.reformatComments) {
      const pagesToCheckExistence = [];
      $(document.documentElement).addClass('cd-reformattedComments');
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
      Object.keys(pagesExistence)
        .filter((name) => !pagesExistence[name])
        .forEach((name) => {
          pageNamesToLinks[name].forEach((link) => {
            link.classList.add('new');
            link.href = mw.util.getUrl(name, {
              action: 'edit',
              redlink: 1,
            });
          });
        });
    }
  },
};
