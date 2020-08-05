/**
 * Functions that handle events bound to the "window" and "document" objects.
 *
 * @module eventHandlers
 */

import CommentForm from './CommentForm';
import cd from './cd';
import commentLayers from './commentLayers';
import navPanel from './navPanel';
import { isInputFocused } from './util';

const beforeUnloadHandlers = {};

/**
 * Handles the window `resize` event as well as "orientationchange".
 */
export function windowResizeHandler() {
  commentLayers.redrawIfNecessary(true);
  if (navPanel.isMounted()) {
    navPanel.updateCommentFormButton();
  }
  cd.commentForms.forEach((commentForm) => {
    commentForm.adjustLabels();
  });
  commentLayers.couldHaveMoved = true;
}

/**
 * Add a condition preventing page unload.
 *
 * @param {string} name
 * @param {Function} condition
 */
export function addPreventUnloadCondition(name, condition) {
  beforeUnloadHandlers[name] = (e) => {
    if (condition()) {
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
  };
  $(window).on('beforeunload', beforeUnloadHandlers[name]);
}

/**
 * Remove a condition preventing page unload.
 *
 * @param {string} name
 */
export function removePreventUnloadCondition(name) {
  if (beforeUnloadHandlers[name]) {
    $(window).off('beforeunload', beforeUnloadHandlers[name]);
  }
}

/**
 * Handles the document `keydown` event.
 *
 * @param {Event} e
 */
export function globalKeyDownHandler(e) {
  if (cd.util.isPageOverlayOn()) return;

  if (
    // Ctrl+Alt+Q
    (e.ctrlKey && !e.shiftKey && e.altKey && e.keyCode === 81) ||
    // Q
    (!e.ctrlKey && !e.shiftKey && !e.altKey && e.keyCode === 81 && !isInputFocused())
  ) {
    e.preventDefault();
    const commentForm = CommentForm.getLastActiveCommentForm();
    if (commentForm) {
      commentForm.quote(!e.ctrlKey);
    }
  }

  if (navPanel.isMounted()) {
    // R
    if (!e.ctrlKey && !e.shiftKey && !e.altKey && e.keyCode === 82 && !isInputFocused()) {
      navPanel.refreshClick();
    }

    // W
    if (!e.ctrlKey && !e.shiftKey && !e.altKey && e.keyCode === 87 && !isInputFocused()) {
      navPanel.goToPreviousNewComment();
    }

    // S
    if (!e.ctrlKey && !e.shiftKey && !e.altKey && e.keyCode === 83 && !isInputFocused()) {
      navPanel.goToNextNewComment();
    }

    // F
    if (!e.ctrlKey && !e.shiftKey && !e.altKey && e.keyCode === 70 && !isInputFocused()) {
      navPanel.goToFirstUnseenComment();
    }
  }
}

/**
 * Handles the `mousemove` and `mouseover` events and highlights hovered comments even when the
 * cursor is between comment parts, not over them.
 *
 * @param {Event} e
 */
export function highlightFocused(e) {
  if (cd.g.dontHandleScroll || cd.g.autoScrollInProgress || cd.util.isPageOverlayOn()) return;

  const autocompleteMenuHovered = (
    cd.g.activeAutocompleteMenu &&
    cd.g.activeAutocompleteMenu.matches(':hover')
  );

  cd.comments
    .filter((comment) => comment.underlay)
    .forEach((comment) => {
      const layersContainerOffset = comment.getLayersContainerOffset();
      if (
        // In case the user has moved the navigation panel to the right side.
        !navPanel.isMouseOver &&

        !autocompleteMenuHovered &&
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
}
