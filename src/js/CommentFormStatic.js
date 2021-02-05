/**
 * Methods related to comment forms.
 *
 * @module CommentFormStatic
 */

import CommentForm from './CommentForm';
import cd from './cd';
import { areObjectsEqual } from './util';

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
   * Get default preload configuration for the `addSection` mode.
   *
   * @returns {object}
   * @memberof module:CommentForm
   */
  getDefaultPreloadConfig() {
    return {
      editIntro: undefined,
      commentTemplate: undefined,
      headline: undefined,
      summary: undefined,
      noHeadline: false,
      omitSignature: false,
    };
  },

  /**
   * Get the name of the correlated property of the comment form target based on the comment for
   * mode.
   *
   * @param {string} mode
   * @returns {string}
   * @private
   * @memberof module:CommentForm
   */
  modeToProperty(mode) {
    return mode === 'replyInSection' ? 'addReply' : mode;
  },

  /**
   * Get the last active comment form.
   *
   * @returns {?CommentForm}
   * @memberof module:CommentForm
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
   * @memberof module:CommentForm
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

  /**
   * Create an add section form if not existent.
   *
   * @param {object} [preloadConfig]
   * @param {boolean} [isNewTopicOnTop=false]
   * @private
   */
  createAddSectionForm(
    preloadConfig = CommentForm.getDefaultPreloadConfig(),
    isNewTopicOnTop = false
  ) {
    const addSectionForm = cd.g.addSectionForm;
    if (addSectionForm) {
      // Sometimes there is more than one "Add section" button on the page, and they lead to opening
      // forms with different content.
      if (!areObjectsEqual(preloadConfig, addSectionForm.preloadConfig)) {
        mw.notify(cd.s('cf-error-formconflict'), { type: 'error' });
        return;
      }

      addSectionForm.$element.cdScrollIntoView('center');

      // Headline input may be missing if the "nosummary" preload parameter is truthy.
      addSectionForm[addSectionForm.headlineInput ? 'headlineInput' : 'commentInput'].focus();
    } else {
      /**
       * Add section form.
       *
       * @type {CommentForm|undefined}
       * @memberof module:cd~convenientDiscussions.g
       */
      cd.g.addSectionForm = new CommentForm({
        mode: 'addSection',
        target: cd.g.CURRENT_PAGE,
        preloadConfig,
        isNewTopicOnTop,
      });
    }
  },
};
