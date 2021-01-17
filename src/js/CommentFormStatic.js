/**
 * Methods related to comment forms.
 *
 * @module CommentFormStatic
 */

import cd from './cd';

/**
 * Callback to be used in Array#sort() for comment forms.
 *
 * @param {CommentForm} commentForm1
 * @param {CommentForm} commentForm2
 * @returns {number}
 * @private
 */
function lastFocused(commentForm1, commentForm2) {
  const lastFocused1 = commentForm1.lastFocused || new Date(0);
  const lastFocused2 = commentForm2.lastFocused || new Date(0);

  if (lastFocused2 > lastFocused1) {
    return 1;
  } else if (lastFocused2 < lastFocused1) {
    return -1;
  } else {
    return 0;
  }
}

export default {
  /**
   * Get the name of the correlated property of the comment form target based on the comment for
   * mode.
   *
   * @param {string} mode
   * @returns {string}
   * @private
   */
  modeToProperty(mode) {
    return mode === 'replyInSection' ? 'addReply' : mode;
  },

  /**
   * Get the last active comment form.
   *
   * @returns {?CommentForm}
   */
  getLastActive() {
    return (
      cd.commentForms
        .slice()
        .sort(lastFocused)[0] ||
      null
    );
  },

  /**
   * Get the last active comment form that has received an input. This includes altering text
   * fields, not checkboxes.
   *
   * @returns {?CommentForm}
   */
  getLastActiveAltered() {
    return (
      cd.commentForms
        .slice()
        .sort(lastFocused)
        .find((commentForm) => commentForm.isAltered()) ||
      null
    );
  },
};
