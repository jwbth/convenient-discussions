/**
 * Functions that handle events bound to the "window" and "document" objects.
 *
 * @module eventHandlers
 */

import Comment from './Comment';
import CommentForm from './CommentForm';
import cd from './cd';
import commentLayers from './commentLayers';
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
  if (cd.util.isPageOverlayOn()) return;

  if (
    // Ctrl+Alt+Q
    (e.keyCode === 81 && e.ctrlKey && !e.shiftKey && e.altKey) ||
    // Q
    (e.keyCode === 81 && !e.ctrlKey && !e.shiftKey && !e.altKey && !isInputFocused())
  ) {
    e.preventDefault();
    const commentForm = CommentForm.getLastActiveCommentForm();
    if (commentForm) {
      commentForm.quote(e.ctrlKey);
    }
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
 * Handles the `mousemove` and `mouseover` events and highlights hovered comments even when the
 * cursor is between comment parts, not over them.
 *
 * @param {Event} e
 */
export function highlightFocused(e) {
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

    const commentInViewport = Comment.findInViewport();
    if (!commentInViewport) return;

    const registerSeenIfInViewport = (comment) => {
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
      .some(registerSeenIfInViewport);

    // Forward
    cd.comments
      .slice(commentInViewport.id)
      .some(registerSeenIfInViewport);

    navPanel.updateFirstUnseenButton();
  }, 300);
}
