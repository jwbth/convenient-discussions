/**
 * Comment underlay and overlay-related functions and configuration.
 *
 * @module commentLayers
 */

import cd from './cd';

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
   * @param {boolean} removeUnhighlighted Set to `true` to remove the unhighlighted comments'
   *   layers.
   */
  redrawIfNecessary(removeUnhighlighted = false) {
    if (!this.underlays.length || document.hidden) return;

    this.layersContainers.forEach((container) => {
      container.cdCouldHaveMoved = true;
    });

    const comments = [];
    const rootBottom = cd.g.$root.get(0).getBoundingClientRect().bottom + window.pageYOffset;
    let notMovedCount = 0;
    let floatingRects;

    // We go from the end and stop at the first _two_ comments that have not been misplaced. A
    // quirky reason for this is that the mouse could be over some comment making its underlay to be
    // repositioned immediately and therefore not appearing as misplaced to this procedure. Two
    // comments threshold should be more reliable.
    cd.comments.slice().reverse().some((comment) => {
      const shouldBeHighlighted = (
        comment.newness ||
        (comment.own && cd.settings.highlightOwnComments) ||
        comment.target ||
        comment.focused
      );
      if (
        (
          removeUnhighlighted ||

          // Layers that ended up under the bottom of the page content and could be moving the page
          // bottom down.
          (comment.positions && comment.positions.bottom > rootBottom)
        ) &&
        !shouldBeHighlighted &&
        comment.$underlay
      ) {
        comment.removeLayers();
      } else if (shouldBeHighlighted && !comment.editForm) {
        floatingRects = (
          floatingRects ||
          cd.g.specialElements.floating.map((el) => el.getBoundingClientRect())
        );
        const moved = comment.configureLayers(false, floatingRects);
        if (moved) {
          notMovedCount = 0;
          comments.push(comment);
        } else if (
          moved === false &&

          // Nested containers shouldn't count, the positions of layers inside them may be OK,
          // unlike layers preceding them.
          !comment.getLayersContainer().parentNode.closest('.cd-commentLayersContainer')
        ) {
          notMovedCount++;
          if (notMovedCount === 2) {
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
