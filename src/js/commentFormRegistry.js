/**
 * Singleton storing data about comment forms on the page and managing them.
 *
 * @module commentFormRegistry
 */

import CommentForm from './CommentForm';
import StorageItem from './StorageItem';
import cd from './cd';
import commentRegistry from './commentRegistry';
import controller from './controller';
import pageRegistry from './pageRegistry';
import sectionRegistry from './sectionRegistry';
import { areObjectsEqual, removeFromArrayIfPresent } from './utils-general';

export default {
  /**
   * List of comment forms.
   *
   * @type {CommentForm[]}
   * @private
   */
  items: [],

  /**
   * Add a comment form to the list.
   *
   * @param {CommentForm} item
   */
  add(item) {
    this.items.push(item);
  },

  /**
   * Remove a comment form from the list.
   *
   * @param {CommentForm} item
   */
  remove(item) {
    removeFromArrayIfPresent(this.items, item);
  },

  /**
   * Get all comment forms.
   *
   * @returns {CommentForm[]}
   */
  getAll() {
    return this.items;
  },

  /**
   * Get a comment form by index.
   *
   * @param {number} index Use a negative index to count from the end.
   * @returns {?CommentForm}
   */
  getByIndex(index) {
    if (index < 0) {
      index = this.items.length + index;
    }
    return this.items[index] || null;
  },

  /**
   * Get the number of comment forms.
   *
   * @returns {number}
   */
  getCount() {
    return this.items.length;
  },

  /**
   * Reset the comment form list.
   */
  reset() {
    this.items.length = 0;
  },

  /**
   * Get the default preload configuration for the `addSection` mode.
   *
   * @returns {object}
   */
  getDefaultPreloadConfig() {
    return {
      editIntro: undefined,
      commentTemplate: undefined,
      headline: undefined,
      params: [],
      summary: undefined,
      noHeadline: false,
      omitSignature: false,
    };
  },

  /**
   * Get the last active comment form.
   *
   * @returns {?CommentForm}
   */
  getLastActive() {
    return (
      this.items
        .slice()
        .sort(this.lastFocused)[0] ||
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
      this.items
        .slice()
        .sort(this.lastFocused)
        .find((commentForm) => commentForm.isAltered()) ||
      null
    );
  },

  /**
   * Callback to be used in
   * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort Array#sort()}
   * for comment forms.
   *
   * @param {CommentForm} commentForm1
   * @param {CommentForm} commentForm2
   * @returns {number}
   * @private
   */
  lastFocused(commentForm1, commentForm2) {
    return (commentForm2.lastFocused || new Date(0)) - (commentForm1.lastFocused || new Date(0));
  },

  /**
   * Create an add section form if not existent.
   *
   * @param {object} [preloadConfig={@link commentRegistry.getDefaultPreloadConfig commentRegistry.getDefaultPreloadConfig()}]
   * @param {boolean} [newTopicOnTop=false]
   * @param {object} [initialState]
   */
  createAddSectionForm(
    preloadConfig = this.getDefaultPreloadConfig(),
    newTopicOnTop = false,
    initialState
  ) {
    const addSectionForm = this.getAddSectionForm();
    if (addSectionForm) {
      // Sometimes there is more than one "Add section" button on the page, and they lead to opening
      // forms with different content.
      if (!areObjectsEqual(preloadConfig, addSectionForm.getPreloadConfig())) {
        mw.notify(cd.s('cf-error-formconflict'), { type: 'error' });
        return;
      }

      addSectionForm.$element.cdScrollIntoView('center');

      // Headline input may be missing if the "nosummary" preload parameter is truthy.
      (addSectionForm.headlineInput || addSectionForm.commentInput).cdFocus();
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
        target: pageRegistry.getCurrent(),
        preloadConfig,
        newTopicOnTop,
        initialState,
      });
      this.setAddSectionForm(commentForm);
    }
  },

  /**
   * Memorize the "Add section" form.
   *
   * @param {CommentForm} commentForm
   */
  setAddSectionForm(commentForm) {
    this.addSectionForm = commentForm;
    $('#ca-addsection').addClass('selected');
    $('#ca-view').removeClass('selected');
  },

  /**
   * Get the "Add section" form.
   *
   * @returns {CommentForm}
   */
  getAddSectionForm() {
    return this.addSectionForm;
  },

  /**
   * Forget the "Add section" form (after it was torn down).
   */
  forgetAddSectionForm() {
    delete this.addSectionForm;
    $('#ca-addsection').removeClass('selected');
    $('#ca-view').addClass('selected');
  },

  /**
   * Adjust the button labels of all comment forms according to the form width: if the form is too
   * narrow, the labels will shrink.
   */
  adjustLabels() {
    this.items.forEach((commentForm) => {
      commentForm.adjustLabels();
    });
  },

  /**
   * Detach the comment forms keeping events. Also reset some of their properties.
   */
  detach() {
    this.items.forEach((commentForm) => {
      commentForm.$outermostElement.detach();
      commentForm.checkCodeRequest = null;
    });
  },

  actuallySaveSession() {
    (new StorageItem('commentForms'))
      .setWithTime(
        mw.config.get('wgPageName'),
        this.items
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
            omitSignatureCheckboxAltered: commentForm.isOmitSignatureCheckboxAltered(),
            lastFocused: commentForm.getLastFocused(),
          }))
      )
      .save();
  },

  /**
   * _For internal use._ Save comment form data to the local storage. (Session storage doesn't allow
   * to restore when the browser has crashed.)
   *
   * @param {boolean} [force=true] Save session immediately, without regard for save frequency.
   */
  saveSession(force) {
    if (force) {
      this.actuallySaveSession();
    } else {
      // Don't save more often than once per 5 seconds.
      this.throttledSaveSession ||= OO.ui.throttle(this.actuallySaveSession.bind(this), 500);
      this.throttledSaveSession();
    }
  },

  /**
   * Restore comment forms using the data saved in the local storage.
   *
   * @param {object} commentFormsData
   * @private
   */
  restoreSessionFromStorage(commentFormsData) {
    let haveRestored = false;
    const rescue = [];
    commentFormsData.commentForms.forEach((data) => {
      const prop = CommentForm.modeToProperty(data.mode);
      if (data.targetData?.headline) {
        const { section } = sectionRegistry.search({
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
        const comment = commentRegistry.getById(data.targetData.id || data.targetData.anchor);
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
        if (!this.getAddSectionForm()) {
          this.setAddSectionForm(
            new CommentForm({
              target: pageRegistry.getCurrent(),
              mode: data.mode,
              initialState: data,
              preloadConfig: data.preloadConfig,
              newTopicOnTop: data.newTopicOnTop,
            })
          );
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
        this.items[0].goTo();
      });
    }
    if (rescue.length) {
      this.rescueCommentFormsContent(rescue);
    }
  },

  /**
   * Restore comment forms using the data in {@link convenientDiscussions.commentForms}.
   *
   * @private
   */
  restoreSessionDirectly() {
    const rescue = [];
    const addToRescue = (commentForm) => {
      rescue.push({
        headline: commentForm.headlineInput?.getValue(),
        comment: commentForm.commentInput.getValue(),
        summary: commentForm.summaryInput.getValue(),
      });
      this.remove(commentForm);
    };

    this.items.forEach((commentForm) => {
      commentForm.restore(addToRescue);
    });
    if (rescue.length) {
      this.rescueCommentFormsContent(rescue);
    }
  },

  /**
   * Show a modal with content of comment forms that we were unable to restore to the page (because
   * their target comments/sections disappeared, for example).
   *
   * @param {object[]} content
   * @param {string} [content[].headline]
   * @param {string} content[].comment
   * @param {string} content[].summary
   * @private
   */
  maybeShowRescueDialog(content) {
    const text = content
      .map((data) => (
        (data.headline === undefined ? '' : `${cd.s('rd-headline')}: ${data.headline}\n\n`) +
        `${cd.s('rd-comment')}: ${data.comment}\n\n${cd.s('rd-summary')}: ${data.summary}`
      ))
      .join('\n\n----\n');

    const dialog = new OO.ui.MessageDialog();
    controller.getWindowManager().addWindows([dialog]);
    controller.getWindowManager().openWindow(dialog, {
      message: (new OO.ui.FieldLayout(
        new OO.ui.MultilineTextInputWidget({
          value: text,
          rows: 20,
        }),
        {
          align: 'top',
          label: cd.s('rd-intro'),
        }
      )).$element,
      actions: [
        {
          label: cd.s('rd-close'),
          action: 'close',
        },
      ],
      size: 'large',
    });
  },

  /**
   * _For internal use._ Return saved comment forms to their places.
   *
   * @param {boolean} fromStorage Should the session be restored from the local storage instead of
   *   directly from {@link convenientDiscussions.commentForms}.
   */
  restoreSession(fromStorage) {
    if (fromStorage) {
      // This is needed when the page is reloaded externally.
      this.reset();

      const data = (new StorageItem('commentForms'))
        .cleanUp((entry) =>
          !entry.commentForms?.length ||
          // FIXME: Remove `([keep] || entry.saveUnixTime)` after June 2024
          (entry.saveTime || entry.saveUnixTime) < Date.now() - 60 * cd.g.msInDay
        )
        .save()
        .get(mw.config.get('wgPageName'));
      if (data?.commentForms) {
        this.restoreSessionFromStorage(data);
      }
    } else {
      this.restoreSessionDirectly();
    }
    this.saveSession();
  },

  /**
   * _For internal use._ Add buttons and connect to existing ones, attach event handlers, restore
   * the previous session, etc.
   *
   * @param {import('./BootProcess').default} bootProcess
   */
  setup(bootProcess) {
    this.restoreSession(
      bootProcess.isFirstRun() ||
      bootProcess.passedData.isPageReloadedExternally
    );

    this.maybeAddAddSectionForm(bootProcess.hideDtNewTopicForm());

    if (bootProcess.isFirstRun()) {
      this.configureClosePageConfirmation();
    }
  },

  /**
   * Add an "Add section" form or not depending on the URL.
   *
   * @param {object} dtNewTopicFormData
   * @private
   */
  maybeAddAddSectionForm(dtNewTopicFormData) {
    // May crash if the current URL contains undecodable "%" in the fragment,
    // https://phabricator.wikimedia.org/T207365.
    const { searchParams } = new URL(location.href);

    // &action=edit&section=new when DT's New Topic Tool is enabled.
    if (
      searchParams.get('section') === 'new' ||
      Number(searchParams.get('cdaddtopic')) ||
      dtNewTopicFormData
    ) {
      this.createAddSectionForm(undefined, undefined, dtNewTopicFormData);
    }
  },

  /**
   * _For internal use._ Add a condition to show a confirmation when trying to close the page with
   * active comment forms on it.
   */
  configureClosePageConfirmation() {
    const alwaysConfirmLeavingPage = (
      mw.user.options.get('editondblclick') ||
      mw.user.options.get('editsectiononrightclick')
    );
    controller.addPreventUnloadCondition('commentForms', () => {
      this.saveSession(true);
      return (
        mw.user.options.get('useeditwarning') &&
        (this.getLastActiveAltered() || (alwaysConfirmLeavingPage && this.getCount()))
      );
    });
  },
};
