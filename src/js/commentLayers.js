/**
 * Comment underlay and overlay-related functions and configuration.
 *
 * @module commentLayers
 */

import cd from './cd';
import { getExtendedRect } from './util';

export default {
  /**
   * List of the underlays.
   *
   * @type {Element[]}
   */
  underlays: [],

  /**
   * List of the containers of the underlays.
   *
   * @type {Element[]}
   */
  layersContainers: [],

  /**
   * Recalculate positions of the highlighted comments' (usually, new or own) layers and redraw if
   * they've changed.
   *
   * @param {boolean} [removeUnhighlighted] Whether to remove the unhighlighted comments' layers.
   * @param {boolean} [redrawAll] Whether to redraw all underlays and not stop at first three
   *   unmoved.
   */
  redrawIfNecessary(removeUnhighlighted = false, redrawAll = false) {
    if (!this.underlays.length || (document.hidden && !redrawAll)) return;

    this.layersContainers.forEach((container) => {
      container.cdCouldHaveMoved = true;
    });

    const comments = [];
    const rootBottom = cd.g.$root.get(0).getBoundingClientRect().bottom + window.scrollY;
    let notMovedCount = 0;
    let floatingRects;

    // We go from the end and stop at the first _three_ comments that have not been misplaced. A
    // quirky reason for this is that the mouse could be over some comment making its underlay to be
    // repositioned immediately and therefore not appearing as misplaced to this procedure. Three
    // comments threshold should be more reliable.
    cd.comments.slice().reverse().some((comment) => {
      const shouldBeHighlighted = (
        !comment.isCollapsed &&
        (
          comment.isNew ||
          (comment.isOwn && cd.settings.highlightOwnComments) ||
          comment.isTarget ||
          comment.isHovered ||
          comment.isDeleted ||

          // Need to generate the gray line to close the gaps between adjacent list item elements.
          comment.isLineGapped
        )
      );

      // Layers that ended up under the bottom of the page content and could be moving the page
      // bottom down.
      const isUnderBottom = comment.positions && comment.positions.bottom > rootBottom;

      if ((removeUnhighlighted || isUnderBottom) && !shouldBeHighlighted && comment.$underlay) {
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
        } else if (
          isMoved === false &&

          // Nested containers shouldn't count, the positions of the layers inside them may be OK,
          // unlike the layers preceding them.
          !comment.getLayersContainer().parentNode.parentNode
            .closest('.cd-commentLayersContainer-parent')
        ) {
          notMovedCount++;
          if (notMovedCount === 3) {
            return true;
          }
        }
      }
      return false;
    });

    // It's faster to update the positions separately in one sequence.
    comments.forEach((comment) => {
      comment.updateLayersPositions();
    });
  },

  /**
   * Empty the underlay registry and the layers container elements.
   */
  reset() {
    this.underlays = [];
    this.layersContainers.forEach((container) => {
      container.innerHTML = '';
    });
  },
};
