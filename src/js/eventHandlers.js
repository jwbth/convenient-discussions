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
import { isInputFocused, isPageOverlayOn, isPostponed, keyCombination, postpone } from './util';
import { setContentColumnGlobals } from './boot';

const beforeUnloadHandlers = {};

export function handleMouseMove(e) {
  if (isPostponed('scroll') || cd.state.isAutoScrollInProgress || isPageOverlayOn()) return;

  Comment.highlightHovered(e);
}

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
    } else {
      const comment = Comment.getSelectedComment();
      if (comment?.isActionable) {
        e.preventDefault();
        comment.reply();
      }
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
  // Scroll will be handled when the autoscroll is finished.
  if (cd.state.isAutoScrollInProgress) return;

  const actuallyHandle = () => {
    if (cd.state.isAutoScrollInProgress) return;

    if (cd.state.isPageActive) {
      Comment.registerSeen();
      navPanel.updateCommentFormButton();
    }
    pageNav.update();
  };

  // Don't run this more than once in some period, otherwise scrolling may be slowed down. Also,
  // wait before running, otherwise comments may be registered as seen after a press of Page
  // Down/Page Up. One scroll in Chrome, Firefox with Page Up/Page Down takes a little less than
  // 200ms, but 200ms proved to be not enough, so we try 300ms.
  postpone('scroll', actuallyHandle, 300);
}

/**
 * Handle the `hashchange` event, including clicks on links pointing to comment anchors.
 */
export function handleHashChange() {
  let fragment = location.hash.slice(1);
  if (fragment.startsWith('c-') || isCommentAnchor(fragment)) {
    // Don't jump to the comment if the user pressed Back/Forward in the browser or if
    // history.pushState() is called from Comment#scrollTo().
    if (history.state?.cdJumpedToComment) return;

    try {
      fragment = decodeURIComponent(fragment);
    } catch (e) {
      console.error(e);
      return;
    }
    const comment = fragment.startsWith('c-') ?
      Comment.getByDtId(fragment) :
      Comment.getByAnchor(fragment, true);
    comment?.scrollTo();
  }
}

export function handleSelectionChange() {
  postpone('selectionChange', Comment.getSelectedComment, 200);
}
