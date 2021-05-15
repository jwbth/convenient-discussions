/**
 * Functions that handle events bound to the `window` and `document` objects.
 *
 * @module eventHandlers
 */

import Comment from './Comment';
import CommentForm from './CommentForm';
import Thread from './Thread';
import cd from './cd';
import commentLayers from './commentLayers';
import navPanel from './navPanel';
import pageNav from './pageNav';
import { isInputFocused, keyCombination } from './util';
import { setContentColumnGlobals } from './boot';

const beforeUnloadHandlers = {};

/**
 * Handles the window `resize` event as well as `orientationchange`.
 */
export function handleWindowResize() {
  setContentColumnGlobals(true);
  commentLayers.redrawIfNecessary(true);
  Thread.updateLines();
  navPanel.updateCommentFormButton();
  cd.commentForms.forEach((commentForm) => {
    commentForm.adjustLabels();
  });
  pageNav.updateWidth();
  handleScroll();
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
  if (cd.util.isPageOverlayOn()) return;

  if (
    // Ctrl+Alt+Q
    keyCombination(e, 81, ['ctrl', 'alt']) ||

    // Q
    (keyCombination(e, 81) && !isInputFocused())
  ) {
    const lastActiveCommentForm = CommentForm.getLastActive();
    if (lastActiveCommentForm) {
      e.preventDefault();
      lastActiveCommentForm.quote(e.ctrlKey);
    }
  }

  if (navPanel.isMounted()) {
    // R
    if (keyCombination(e, 82) && !isInputFocused()) {
      navPanel.refreshClick();
    }

    // W
    if (keyCombination(e, 87) && !isInputFocused()) {
      navPanel.goToPreviousNewComment();
    }

    // S
    if (keyCombination(e, 83) && !isInputFocused()) {
      navPanel.goToNextNewComment();
    }

    // F
    if (keyCombination(e, 70) && !isInputFocused()) {
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
  if (cd.g.dontHandleScroll || cd.g.isAutoScrollInProgress) return;

  cd.g.dontHandleScroll = true;

  // One scroll in Chrome, Firefox with Page Up/Page Down takes a little less than 200ms, but
  // 200ms proved to be not enough, so we try 300ms.
  setTimeout(() => {
    cd.g.dontHandleScroll = false;

    if (cd.g.isAutoScrollInProgress) return;

    cd.debug.startTimer('handleScroll');
    if (cd.g.isPageActive) {
      Comment.registerSeen();
      navPanel.updateCommentFormButton();
    }
    pageNav.update();
    cd.debug.stopTimer('handleScroll');
  }, 300);
}
