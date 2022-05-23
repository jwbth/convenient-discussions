import CommentForm from './CommentForm';
import Section from './Section';
import cd from './cd';
import controller from './controller';
import navPanel from './navPanel';
import postponements from './postponements';
import { getFromLocalStorage, saveToLocalStorage } from './util';
import { rescueCommentFormsContent } from './modal';

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
          isNewTopicOnTop: data.isNewTopicOnTop,
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
      navPanel.goToNextCommentForm(true);
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
    commentForm.checkCodeRequest = null;
    const target = commentForm.target;
    if (target instanceof Comment) {
      if (target.id) {
        const comment = Comment.getById(target.id);
        if (comment?.isActionable) {
          try {
            commentForm.setTargets(comment);
            comment[CommentForm.modeToProperty(commentForm.mode)](commentForm);
            commentForm.addToPage();
          } catch (e) {
            console.warn(e);
            addToRescue(commentForm);
          }
        } else {
          addToRescue(commentForm);
        }
      } else {
        addToRescue(commentForm);
      }
    } else if (target instanceof Section) {
      const section = Section.search({
        headline: target.headline,
        oldestCommentId: target.oldestComment?.id,
        index: target.index,
        id: target.id,

        // We cache ancestors when saving the session, so this call will return the right value,
        // despite cd.sections has already changed.
        ancestors: target.getAncestors().map((section) => section.headline),
      });
      if (section?.isActionable) {
        try {
          commentForm.setTargets(section);
          section[CommentForm.modeToProperty(commentForm.mode)](commentForm);
          commentForm.addToPage();
        } catch (e) {
          console.warn(e);
          addToRescue(commentForm);
        }
      } else {
        addToRescue(commentForm);
      }
    } else if (commentForm.mode === 'addSection') {
      commentForm.addToPage();
      controller.setAddSectionForm(commentForm);
    }
  });
  if (rescue.length) {
    rescueCommentFormsContent(rescue);
  }
}

export default {
  /**
   * Remove sessions older than 60 days.
   *
   * @param {object[]} data
   * @returns {object}
   * @private
   */
  cleanUpRegistry(data) {
    const newData = Object.assign({}, data);
    const interval = 60 * cd.g.SECONDS_IN_DAY * 1000;
    Object.keys(newData).forEach((key) => {
      if (!newData[key].commentForms?.length || newData[key].saveUnixTime < Date.now() - interval) {
        delete newData[key];
      }
    });
    return newData;
  },

  /**
   * _For internal use._ Save comment form data to the local storage. (Session storage doesn't allow
   * to restore when the browser has crashed.)
   *
   * @param {boolean} [force=true] Save session immediately, without regard for save frequency.
   */
  save(force) {
    const save = () => {
      const commentForms = cd.commentForms
        .filter((commentForm) => commentForm.isAltered())
        .map((commentForm) => {
          let targetData;
          const target = commentForm.target;
          if (commentForm.target instanceof Comment) {
            targetData = { id: target.id };
          } else if (target instanceof Section) {
            targetData = {
              headline: target.headline,
              oldestCommentId: target.oldestComment?.id,
              index: target.index,
              id: target.id,
              ancestors: target.getAncestors().map((section) => section.headline),
            };
          }
          return {
            mode: commentForm.mode,
            targetData,
            preloadConfig: commentForm.preloadConfig,
            isNewTopicOnTop: commentForm.isNewTopicOnTop,
            headline: commentForm.headlineInput?.getValue(),
            comment: commentForm.commentInput.getValue(),
            summary: commentForm.summaryInput.getValue(),
            minor: commentForm.minorCheckbox?.isSelected(),
            watch: commentForm.watchCheckbox?.isSelected(),
            subscribe: commentForm.subscribeCheckbox?.isSelected(),
            omitSignature: commentForm.omitSignatureCheckbox?.isSelected(),
            delete: commentForm.deleteCheckbox?.isSelected(),
            originalHeadline: commentForm.originalHeadline,
            originalComment: commentForm.originalComment,
            isSummaryAltered: commentForm.isSummaryAltered,
            lastFocused: commentForm.lastFocused,
          };
        });
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
   */
  restore(fromStorage) {
    if (fromStorage) {
      // This is needed when the page is reloaded externally.
      cd.commentForms = [];

      const dataAllPages = this.cleanUpRegistry(getFromLocalStorage('commentForms'));
      saveToLocalStorage('commentForms', dataAllPages);
      const data = dataAllPages[mw.config.get('wgPageName')] || {};
      if (data.commentForms) {
        restoreFromStorage(data);
      }
    } else {
      restoreDirectly();
    }
    this.save();
    navPanel.updateCommentFormButton();
  },
};
