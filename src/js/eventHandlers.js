/**
 * Functions that handle events bound to the "window" and "document" objects.
 *
 * @module eventHandlers
 */

import Comment from './Comment';
import CommentForm from './CommentForm';
import cd from './cd';
import commentLayers from './commentLayers';
import currentSection from './currentSection';
import navPanel from './navPanel';
import { isInputFocused } from './util';

const beforeUnloadHandlers = {};

/**
 * Handles the window `resize` event as well as "orientationchange".
 */
export function handleWindowResize() {
  commentLayers.redrawIfNecessary(true);
  navPanel.updateCommentFormButton();
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
export function handleGlobalKeyDown(e) {
  if (!cd.g.isPageActive || cd.util.isPageOverlayOn()) return;

  if (
    // Ctrl+Alt+Q
    (e.keyCode === 81 && e.ctrlKey && !e.shiftKey && e.altKey) ||
    // Q
    (e.keyCode === 81 && !e.ctrlKey && !e.shiftKey && !e.altKey && !isInputFocused())
  ) {
    e.preventDefault();
    CommentForm.getLastActive()?.quote(e.ctrlKey);
  }

  if (navPanel.isMounted()) {
    // R
    if (e.keyCode === 82 && !e.ctrlKey && !e.shiftKey && !e.altKey && !isInputFocused()) {
      navPanel.refreshClick();
    }

    // W
    if (e.keyCode === 87 && !e.ctrlKey && !e.shiftKey && !e.altKey && !isInputFocused()) {
      navPanel.goToPreviousNewComment();
    }

    // S
    if (e.keyCode === 83 && !e.ctrlKey && !e.shiftKey && !e.altKey && !isInputFocused()) {
      navPanel.goToNextNewComment();
    }

    // F
    if (e.keyCode === 70 && !e.ctrlKey && !e.shiftKey && !e.altKey && !isInputFocused()) {
      navPanel.goToFirstUnseenComment();
    }
  }
}

/**
 * Register seen comments, update the navigation panel's first unseen button, and update the current
 * section block.
 */
export function handleScroll() {
  // Don't run this more than once in some period, otherwise scrolling may be slowed down. Also,
  // wait before running, otherwise comments may be registered as seen after a press of Page
  // Down/Page Up.
  if (cd.g.dontHandleScroll || cd.g.autoScrollInProgress) return;

  cd.g.dontHandleScroll = true;

  // One scroll in Chrome, Firefox with Page Up/Page Down takes a little less than 200ms, but
  // 200ms proved to be not enough, so we try 300ms.
  setTimeout(() => {
    cd.g.dontHandleScroll = false;

    if (cd.g.isPageActive) {
      Comment.registerSeen();
      navPanel.updateFirstUnseenButton();
      navPanel.updateCommentFormButton();
    }
    currentSection.update();
  }, 300);
}
