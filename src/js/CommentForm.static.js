import Comment from './Comment';
import CommentForm from './CommentForm';
import Section from './Section';
import cd from './cd';
import controller from './controller';
import navPanel from './navPanel';
import postponements from './postponements';
import { areObjectsEqual, focusInput, getFromLocalStorage, saveToLocalStorage } from './util';
import { rescueCommentFormsContent } from './modal';

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

/**
 * Restore comment forms using the data saved in the local storage.
 *
 * @param {object} commentFormsData
 * @private
 */
function restoreFromStorage(commentFormsData) {
  let haveRestored = false;
  const rescue = [];
  commentFormsData.commentForms.forEach((data) => {
    const prop = CommentForm.modeToProperty(data.mode);
    if (data.targetData?.headline) {
      const section = Section.search({
        headline: data.targetData.headline,
        oldestCommentId: data.targetData.oldestCommentId,
        index: data.targetData.index,
        id: data.targetData.id,
        ancestors: data.targetData.ancestors,
      });
      if (section?.isActionable && !section[`${prop}Form`]) {
        try {
          section[prop](data);
          haveRestored = true;
        } catch (e) {
          console.warn(e);
          rescue.push(data);
        }
      } else {
        rescue.push(data);
      }

      // TODO: remove the "data.targetData.anchor" part 2 months after the release.
    } else if (data.targetData?.id || data.targetData?.anchor) {
      const comment = Comment.getById(data.targetData.id || data.targetData.anchor);
      if (comment?.isActionable && !comment[`${prop}Form`]) {
        try {
          comment[prop](data);
          haveRestored = true;
        } catch (e) {
          console.warn(e);
          rescue.push(data);
        }
      } else {
        rescue.push(data);
      }
    } else if (data.mode === 'addSection') {
      if (!controller.getAddSectionForm()) {
        const commentForm = new CommentForm({
          target: cd.page,
          mode: data.mode,
          dataToRestore: data,
          preloadConfig: data.preloadConfig,
          newTopicOnTop: data.newTopicOnTop,
        });
        controller.setAddSectionForm(commentForm);
        haveRestored = true;
      } else {
        rescue.push(data);
      }
    }
  });
  if (haveRestored) {
    const notification = mw.notification.notify(cd.s('restore-restored-text'), {
      title: cd.s('restore-restored-title'),
    });
    notification.$notification.on('click', () => {
      cd.commentForms[0].goTo();
    });
  }
  if (rescue.length) {
    rescueCommentFormsContent(rescue);
  }
}

/**
 * Restore comment forms using the data in {@link convenientDiscussions.commentForms}.
 *
 * @private
 */
function restoreDirectly() {
  const rescue = [];
  const addToRescue = (commentForm) => {
    rescue.push({
      headline: commentForm.headlineInput?.getValue(),
      comment: commentForm.commentInput.getValue(),
      summary: commentForm.summaryInput.getValue(),
    });
    cd.commentForms.splice(cd.commentForms.indexOf(commentForm), 1);
  };

  cd.commentForms.forEach((commentForm) => {
    commentForm.restore(addToRescue);
  });
  if (rescue.length) {
    rescueCommentFormsContent(rescue);
  }
}

/**
 * Remove sessions older than 60 days.
 *
 * @param {object[]} data
 * @returns {object}
 * @private
 */
function cleanUpSessionRegistry(data) {
  const newData = Object.assign({}, data);
  Object.keys(newData).forEach((key) => {
    const page = newData[key];
    if (!page.commentForms?.length || page.saveUnixTime < Date.now() - 60 * cd.g.MS_IN_DAY) {
      delete newData[key];
    }
  });
  return newData;
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
   * @param {boolean} [newTopicOnTop=false]
   * @param {object} [dataToRestore]
   * @memberof CommentForm
   */
  createAddSectionForm(
    preloadConfig = CommentForm.getDefaultPreloadConfig(),
    newTopicOnTop = false,
    dataToRestore
  ) {
    const addSectionForm = controller.getAddSectionForm();
    if (addSectionForm) {
      // Sometimes there is more than one "Add section" button on the page, and they lead to opening
      // forms with different content.
      if (!areObjectsEqual(preloadConfig, addSectionForm.getPreloadConfig())) {
        mw.notify(cd.s('cf-error-formconflict'), { type: 'error' });
        return;
      }

      addSectionForm.$element.cdScrollIntoView('center');

      // Headline input may be missing if the "nosummary" preload parameter is truthy.
      focusInput(addSectionForm.headlineInput || addSectionForm.commentInput);
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
        newTopicOnTop,
        dataToRestore,
      });
      controller.setAddSectionForm(commentForm);
    }
  },

  /**
   * Adjust the button labels of all comment forms according to the form width: if the form is to
   * narrow, the labels will shrink.
   *
   * @memberof CommentForm
   */
  adjustLabels() {
    cd.commentForms.forEach((commentForm) => {
      commentForm.adjustLabels();
    });
  },

  /**
   * Detach the comment forms keeping events.
   *
   * @memberof CommentForm
   */
  detach() {
    cd.commentForms.forEach((commentForm) => {
      commentForm.$outermostElement.detach();
    });
  },

  /**
   * _For internal use._ Save comment form data to the local storage. (Session storage doesn't allow
   * to restore when the browser has crashed.)
   *
   * @param {boolean} [force=true] Save session immediately, without regard for save frequency.
   * @memberof CommentForm
   */
  saveSession(force) {
    const save = () => {
      const commentForms = cd.commentForms
        .filter((commentForm) => commentForm.isAltered())
        .map((commentForm) => ({
          mode: commentForm.getMode(),
          targetData: commentForm.getTarget().getIdentifyingData(),
          preloadConfig: commentForm.getPreloadConfig(),
          newTopicOnTop: commentForm.isNewTopicOnTop(),
          headline: commentForm.headlineInput?.getValue(),
          comment: commentForm.commentInput.getValue(),
          summary: commentForm.summaryInput.getValue(),
          minor: commentForm.minorCheckbox?.isSelected(),
          watch: commentForm.watchCheckbox?.isSelected(),
          subscribe: commentForm.subscribeCheckbox?.isSelected(),
          omitSignature: commentForm.omitSignatureCheckbox?.isSelected(),
          delete: commentForm.deleteCheckbox?.isSelected(),
          originalHeadline: commentForm.getOriginalHeadline(),
          originalComment: commentForm.getOriginalComment(),
          summaryAltered: commentForm.isSummaryAltered(),
          lastFocused: commentForm.getLastFocused(),
        }));
      const saveUnixTime = Date.now();
      const data = commentForms.length ? { commentForms, saveUnixTime } : {};

      const dataAllPages = getFromLocalStorage('commentForms');
      dataAllPages[mw.config.get('wgPageName')] = data;
      saveToLocalStorage('commentForms', dataAllPages);
    };

    // Don't save more often than once per 5 seconds.
    if (force) {
      save();
    } else {
      postponements.add('saveSession', save, 5000);
    }
  },

  /**
   * _For internal use._ Return saved comment forms to their places.
   *
   * @param {boolean} fromStorage Should the session be restored from the local storage instead of
   * directly from {@link conveneintDiscussions.commentForms}.
   * @memberof CommentForm
   */
  restoreSession(fromStorage) {
    if (fromStorage) {
      // This is needed when the page is reloaded externally.
      cd.commentForms = [];

      const dataAllPages = cleanUpSessionRegistry(getFromLocalStorage('commentForms'));
      saveToLocalStorage('commentForms', dataAllPages);
      const data = dataAllPages[mw.config.get('wgPageName')] || {};
      if (data.commentForms) {
        restoreFromStorage(data);
      }
    } else {
      restoreDirectly();
    }
    CommentForm.saveSession();
    navPanel.updateCommentFormButton();
  },
};
