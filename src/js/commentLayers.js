/**
 * Comment underlay and overlay-related functions and configuration.
 *
 * @module commentLayers
 */

import cd from './cd';

export default {
  /**
   * List of underlays.
   *
   * @type {Element[]}
   */
  underlays: [],

  /**
   * List of layers containers.
   *
   * @type {Element[]}
   */
  layersContainers: [],

  /**
   * Whether the layers (actually, the layers containers make difference to us) could have moved
   * after some event. Used to avoid expensive operations like calculating the layers offset if they
   * don't make sense.
   *
   * @type {boolean}
   */
  couldHaveMoved: false,

  /**
   * Recalculate positions of the highlighted comments' (usually, new or own) layers and redraw if
   * they've changed.
   *
   * @param {boolean} removeUnhighlighted Set to `true` to remove the unhighlighted comments'
   *   layers.
   */
  redrawIfNecessary(removeUnhighlighted = false) {
    cd.debug.startTimer('redrawIfNecessary');
    if (!this.underlays.length || document.hidden) {
      cd.debug.stopTimer('redrawIfNecessary');
      return;
    }

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
        comment.target
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
        cd.debug.startTimer('isMoved');
        floatingRects = (
          floatingRects ||
          cd.g.specialElements.floating.map((el) => el.getBoundingClientRect())
        );
        const isMoved = comment.configureLayers(false, floatingRects);
        cd.debug.startTimer('closest');
        if (isMoved) {
          notMovedCount = 0;
          comments.push(comment);
        } else if (
          isMoved === false &&

          // Nested containers shouldn't count, the positions of layers inside them may be OK,
          // unlike layers preceding them.
          !comment.getLayersContainer()
            .closest('.cd-commentLayersContainer')
            .parentNode
            .closest('.cd-commentLayersContainer')
        ) {
          notMovedCount++;
          if (notMovedCount === 2) {
            cd.debug.stopTimer('closest');
            cd.debug.stopTimer('isMoved');
            return true;
          }
        }
        cd.debug.stopTimer('closest');
      }
      cd.debug.stopTimer('isMoved');
      return false;
    });

    // It's faster to update the positions separately in one sequence.
    comments.forEach((comment) => {
      comment.updateLayersPositions();
    });
    cd.debug.stopTimer('redrawIfNecessary');
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
