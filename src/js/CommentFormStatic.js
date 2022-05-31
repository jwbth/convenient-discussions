import CommentForm from './CommentForm';
import cd from './cd';
import controller from './controller';
import { areObjectsEqual, focusInput } from './util';

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
   * @memberof CommentForm
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
   * @memberof CommentForm
   */
  modeToProperty(mode) {
    return mode === 'replyInSection' ? 'reply' : mode;
  },

  /**
   * Get the last active comment form.
   *
   * @returns {?CommentForm}
   * @memberof CommentForm
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
   * @memberof CommentForm
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
   * @param {object} [preloadConfig=CommentForm.getDefaultPreloadConfig()]
   * @param {boolean} [isNewTopicOnTop=false]
   * @param {object} [dataToRestore]
   * @memberof CommentForm
   */
  createAddSectionForm(
    preloadConfig = CommentForm.getDefaultPreloadConfig(),
    isNewTopicOnTop = false,
    dataToRestore
  ) {
    if (controller.getAddSectionForm()) {
      // Sometimes there is more than one "Add section" button on the page, and they lead to opening
      // forms with different content.
      if (!areObjectsEqual(preloadConfig, controller.getAddSectionForm().preloadConfig)) {
        mw.notify(cd.s('cf-error-formconflict'), { type: 'error' });
        return;
      }

      controller.getAddSectionForm().$element.cdScrollIntoView('center');

      // Headline input may be missing if the "nosummary" preload parameter is truthy.
      focusInput(
        controller.getAddSectionForm().headlineInput ||
        controller.getAddSectionForm().commentInput
      );
    } else {
      /**
       * Add section form.
       *
       * @name addSectionForm
       * @type {CommentForm|undefined}
       * @memberof convenientDiscussions.g
       */
      const commentForm = new CommentForm({
        mode: 'addSection',
        target: cd.page,
        preloadConfig,
        isNewTopicOnTop,
        dataToRestore,
      });
      controller.setAddSectionForm(commentForm);
    }
  },

  /**
   * Adjust the button labels of all comment forms according to the form width: if the form is to
   * narrow, the labels will shrink.
   */
  adjustLabels() {
    cd.commentForms.forEach((commentForm) => {
      commentForm.adjustLabels();
    });
  },

  /**
   * Detach the comment forms keeping events.
   */
  detach() {
    cd.commentForms.forEach((commentForm) => {
      commentForm.$outermostElement.detach();
    });
  },
};
