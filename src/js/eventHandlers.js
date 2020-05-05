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
  if (cd.g.pageOverlayOn) return;

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
 * mouse is between comment parts, not over them.
 *
 * @param {Event} e
 */
export function highlightFocused(e) {
  if (cd.g.pageOverlayOn || cd.g.dontHandleScroll || cd.g.autoScrollInProgress) return;

  const contentLeft = cd.g.rootElement.getBoundingClientRect().left;
  if (e.pageX < contentLeft - cd.g.COMMENT_UNDERLAY_SIDE_MARGIN) {
    commentLayers.underlays
      .filter((underlay) => underlay.classList.contains('cd-commentUnderlay-focused'))
      .forEach((underlay) => {
        underlay.cdTarget.unhighlightFocused();
      });
    return;
  }

  cd.comments
    .filter((comment) => comment.$underlay)
    .forEach((comment) => {
      const underlay = comment.$underlay.get(0);

      if (!underlay.classList.contains('cd-commentUnderlay')) return;

      const top = Number(underlay.style.top.replace('px', ''));
      const left = Number(underlay.style.left.replace('px', ''));
      const width = Number(underlay.style.width.replace('px', ''));
      const height = Number(underlay.style.height.replace('px', ''));

      const layersContainerOffset = comment.getLayersContainerOffset();

      if (
        // In case some user moves the navigation panel to the right side.
        !navPanel.isMouseOver &&

        e.pageY >= top + layersContainerOffset.top &&
        e.pageY <= top + height + layersContainerOffset.top &&
        e.pageX >= left + layersContainerOffset.left &&
        e.pageX <= left + width + layersContainerOffset.left
      ) {
        if (!underlay.classList.contains('cd-commentUnderlay-focused')) {
          underlay.cdTarget.highlightFocused();
        }
      } else {
        if (underlay.classList.contains('cd-commentUnderlay-focused')) {
          underlay.cdTarget.unhighlightFocused();
        }
      }
    });
}
