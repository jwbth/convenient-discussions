/**
 * Functions that handle events bound to the `window` and `document` objects.
 *
 * @module eventHandlers
 */

import Comment from './Comment';
import CommentForm from './CommentForm';
import Thread from './Thread';
import cd from './cd';
import navPanel from './navPanel';
import pageNav from './pageNav';
import { isCommentAnchor } from './timestamp';
import { isInputFocused, isPageOverlayOn, keyCombination } from './util';
import { setContentColumnGlobals } from './boot';

const beforeUnloadHandlers = {};

/**
 * _Method for internal use._ Handles the window `resize` event as well as `orientationchange`.
 */
export function handleWindowResize() {
  // Seems like sometimes it doesn't have time to update.
  setTimeout(() => {
    setContentColumnGlobals(true);
    Comment.redrawLayersIfNecessary(true);
    Thread.updateLines();
    pageNav.updateWidth();
  });

  navPanel.updateCommentFormButton();
  cd.commentForms.forEach((commentForm) => {
    commentForm.adjustLabels();
  });
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
    delete beforeUnloadHandlers[name];
  }
}

/**
 * _For internal use._ Handles the document `keydown` event.
 *
 * @param {Event} e
 */
export function handleGlobalKeyDown(e) {
  if (isPageOverlayOn()) return;

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

    // C
    if (keyCombination(e, 67) && !isInputFocused()) {
      e.preventDefault();
      navPanel.goToNextCommentForm();
    }
  }
}

/**
 * _For internal use._ Register seen comments, update the navigation panel's first unseen button,
 * and update the current section block.
 */
export function handleScroll() {
  // Don't run this more than once in some period, otherwise scrolling may be slowed down. Also,
  // wait before running, otherwise comments may be registered as seen after a press of Page
  // Down/Page Up.
  if (cd.state.isScrollHandlingPrevented || cd.state.isAutoScrollInProgress) return;

  cd.state.isScrollHandlingPrevented = true;

  // One scroll in Chrome, Firefox with Page Up/Page Down takes a little less than 200ms, but
  // 200ms proved to be not enough, so we try 300ms.
  setTimeout(() => {
    cd.state.isScrollHandlingPrevented = false;

    if (cd.state.isAutoScrollInProgress) return;

    if (cd.state.isPageActive) {
      Comment.registerSeen();
      navPanel.updateCommentFormButton();
    }
    pageNav.update();
  }, 300);
}

/**
 * Handle the `hashchange` event.
 */
export function handleHashChange() {
  let anchor = location.hash.slice(1);
  if (isCommentAnchor(anchor)) {
    // Don't jump to the comment if the user pressed Back/Forward in the browser or if
    // history.pushState() is caled from Comment#scrollTo().
    if (history.state?.cdJumpedToComment) return;

    try {
      anchor = decodeURIComponent(anchor);
    } catch (e) {
      console.error(e);
      return;
    }
    Comment.getByAnchor(anchor, true)?.scrollTo();
  }
}
