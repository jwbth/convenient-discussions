/**
 * Methods related to comments.
 *
 * @module CommentStatic
 */

import Comment from './Comment';
import Section from './Section';
import cd from './cd';
import navPanel from './navPanel';
import { getExtendedRect, reorderArray } from './util';

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
        doAdd: false,
        doUpdate: false,
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
        sectionOrAnchor = comment.getSection();
      } else if (comment.section) {
        sectionOrAnchor = (
          comment.section.match ||
          Section.search(comment.section) ||
          comment.section.anchor
        );
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
    const viewportTop = window.pageYOffset;
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
      if (direction === 'forward') {
        return findVisible(direction, reverse ? searchArea.top.id : searchArea.bottom.id);
      } else if (direction === 'backward') {
        return findVisible(direction, reverse ? searchArea.bottom.id : searchArea.top.id);
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
        currentComment = cd.comments[searchArea.top.id + 1];
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
        currentComment = cd.comments[Math.round(
          (searchArea.bottom.id - searchArea.top.id - 1) * proportion +
          searchArea.top.id +
          0.5
        )];
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
  highlightFocused(e) {
    if (cd.g.dontHandleScroll || cd.g.autoScrollInProgress || cd.util.isPageOverlayOn()) return;

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
          comment.highlightFocused();
        } else {
          comment.unhighlightFocused();
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
};
