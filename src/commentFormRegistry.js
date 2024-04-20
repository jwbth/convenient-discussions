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
import sectionRegistry from './sectionRegistry';
import { defined, removeFromArrayIfPresent } from './utils-general';
import { mixEventEmitterIntoObject } from './utils-oojs';
import { isCmdModifierPressed, isInputFocused, keyCombination } from './utils-window';

// TODO: make into a class extending a generic registry.

export default {
  /**
   * List of comment forms.
   *
   * @type {CommentForm[]}
   * @private
   */
  items: [],

  /**
   * _For internal use._ Initialize the registry.
   */
  init() {
    // Do it here because `OO.EventEmitter` can be unavailable when this module is first imported.
    mixEventEmitterIntoObject(this);

    this.configureClosePageConfirmation();

    controller
      .on('beforeReload', () => {
        // In case checkboxes were changed programmatically
        this.saveSession();
      })
      .on('startReload', this.detach.bind(this))
      .on('keydown', (e) => {
        if (
          // Ctrl+Alt+Q
          keyCombination(e, 81, ['cmd', 'alt']) ||

          // Q
          (keyCombination(e, 81) && !isInputFocused())
        ) {
          const lastActiveCommentForm = this.getLastActive();
          const comment = commentRegistry.getSelectedComment();
          if (lastActiveCommentForm) {
            e.preventDefault();
            lastActiveCommentForm.quote(isCmdModifierPressed(e), comment);
          } else {
            if (comment?.isActionable) {
              e.preventDefault();
              comment.reply();
            }
          }
        }
      })
      .on('resize', this.adjustLabels.bind(this));
  },

  /**
   * Create a comment form and add it both to the registry and to the page. If it already exists,
   * reattach it to the page.
   *
   * @param {import('./Comment').default|import('./Section').default|import('./pageRegistry').Page} target
   * @param {object} config See {@link CommentForm}.
   * @param {object|import('./CommentForm').default} [initialStateOrCommentForm]
   * @returns {CommentForm}
   * @fires commentFormCreated
   */
  setupCommentForm(target, config, initialStateOrCommentForm) {
    let item;
    if (initialStateOrCommentForm instanceof CommentForm) {
      item = initialStateOrCommentForm;
      item.setTargets(target);
      target.addCommentFormToPage(config.mode, item);
    } else {
      item = new CommentForm(Object.assign({
        target,
        initialState: initialStateOrCommentForm,
      }, config));
      target.addCommentFormToPage(config.mode, item);
      item.setup(initialStateOrCommentForm);
      this.items.push(item);
      item
        .on('change', this.saveSession.bind(this))
        .on('unregister', () => {
          this.remove(item);
        })
        .on('teardown', () => {
          controller.updatePageTitle();
          this.emit('teardown', item);
        });
      this.emit('add', item);
    }
    controller.updatePageTitle();
    this.saveSession();

    /**
     * A comment form has been created and added to the page.
     *
     * @event commentFormCreated
     * @param {CommentForm} commentForm
     * @param {object} cd {@link convenientDiscussions} object.
     * @global
     */
    mw.hook('convenientDiscussions.commentFormCreated').fire(item, cd);

    return item;
  },

  /**
   * Remove a comment form from the registry.
   *
   * @param {CommentForm} item
   */
  remove(item) {
    removeFromArrayIfPresent(this.items, item);
    this.saveSession(true);
    this.emit('remove', item);
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
   * Get comment forms by a condition.
   *
   * @param {Function} condition
   * @returns {CommentForm[]}
   */
  query(condition) {
    return this.items.filter(condition);
  },

  /**
   * Reset the comment form list.
   *
   * @private
   */
  reset() {
    this.items.length = 0;
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
      commentForm.$element.detach();
      commentForm.checkCodeRequest = null;
    });
  },

  /**
   * The method that does the actual work for {@link module:commentFormRegistry.saveSession}.
   *
   * @private
   */
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
    // A check in light of the existence of RevisionSlider, see the method
    if (!controller.isCurrentRevision()) return;

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
   * {@link module:commentFormRegistry.maybeShowRescueDialog Rescue} forms that couldn't be
   * restored.
   *
   * @private
   */
  restoreSessionFromStorage() {
    let haveRestored = false;

    this.maybeShowRescueDialog(
      (new StorageItem('commentForms'))
        .cleanUp((entry) =>
          !entry.commentForms?.length ||
          // FIXME: Remove `([keep] || entry.saveUnixTime)` after June 2024
          (entry.saveTime || entry.saveUnixTime) < Date.now() - 60 * cd.g.msInDay
        )
        .save()
        .get(mw.config.get('wgPageName'))
        ?.commentForms
        .map((data) => {
          const target = this.getTargetByData(data.targetData);
          if (
            target?.isActionable &&
            (!target.canBeReplied || target.canBeReplied()) &&

            // Check if there is another form already
            !target[CommentForm.getPropertyNameOnTarget(target, data.mode)]
          ) {
            try {
              target[target.getCommentFormMethodName(data.mode)](
                data,
                data.preloadConfig,
                data.newTopicOnTop
              );
              haveRestored = true;
            } catch (e) {
              console.warn(e);
              return data;
            }
          } else {
            return data;
          }
        })
        .filter(defined)
    );

    if (haveRestored) {
      mw.notification.notify(cd.s('restore-restored-text'), {
        title: cd.s('restore-restored-title'),
      }).$notification.on('click', () => {
        this.items[0].goTo();
      });
    }
  },

  /**
   * Given identifying data (created by e.g. {@link Comment#getIdentifyingData}), get a comment or
   * section on the page or the page itself.
   *
   * @param {object} targetData
   * @returns {import('./Comment').default|import('./Section').default|import('./Page').default}
   */
  getTargetByData(targetData) {
    if (targetData?.headline) {
      // Section
      return sectionRegistry.search({
        headline: targetData.headline,
        oldestCommentId: targetData.oldestCommentId,
        index: targetData.index,
        id: targetData.id,
        ancestors: targetData.ancestors,
      })?.section;
    } else if (targetData?.id) {
      // Comment
      return commentRegistry.getById(targetData.id);
    } else {  // `data.mode === 'addSection'` or `targetData === null`
      // Page
      return cd.page;
    }
  },

  /**
   * Restore comment forms using the data in {@link convenientDiscussions.commentForms}.
   *
   * @private
   */
  restoreSessionDirectly() {
    this.maybeShowRescueDialog(
      this.items
        .map((commentForm) => commentForm.restore())
        .filter(defined)
    );
  },

  /**
   * Show a modal with content of comment forms that we were unable to restore to the page (because
   * their target comments/sections disappeared, for example).
   *
   * @param {object[]} [content]
   * @param {string} [content[].headline]
   * @param {string} content[].comment
   * @param {string} content[].summary
   * @private
   */
  maybeShowRescueDialog(content) {
    if (!content?.length) return;

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
   * Return saved comment forms to their places.
   *
   * @param {boolean} fromStorage Should the session be restored from the local storage instead of
   *   directly from {@link convenientDiscussions.commentForms}.
   * @private
   */
  restoreSession(fromStorage) {
    if (fromStorage) {
      // This is needed when the page is reloaded externally.
      this.reset();

      this.restoreSessionFromStorage();
    } else {
      this.restoreSessionDirectly();
    }
  },

  /**
   * Add a condition to show a confirmation when trying to close the page with active comment forms
   * on it.
   *
   * @private
   */
  configureClosePageConfirmation() {
    controller.addPreventUnloadCondition('commentForms', () => {
      this.saveSession(true);
      return (
        mw.user.options.get('useeditwarning') &&
        (
          this.getLastActiveAltered() ||
          (
            (
              mw.user.options.get('editondblclick') ||
              mw.user.options.get('editsectiononrightclick')
            ) &&
            this.getCount()
          )
        )
      );
    });
  },
};
