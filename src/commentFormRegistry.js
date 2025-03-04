import CommentForm from './CommentForm';
import StorageItemWithKeysAndSaveTime from './StorageItemWithKeysAndSaveTime';
import bootController from './bootController';
import cd from './cd';
import commentRegistry from './commentRegistry';
import sectionRegistry from './sectionRegistry';
import talkPageController from './talkPageController';
import { defined, removeFromArrayIfPresent, subtractDaysFromNow } from './utils-general';
import { EventEmitter } from './utils-oojs';
import { isCmdModifierPressed, isInputFocused, keyCombination } from './utils-window';

// TODO: make into a class extending a generic registry.

/**
 * @typedef {object} EventMap
 * @property {[CommentForm]} teardown
 * @property {[CommentForm]} add
 * @property {[CommentForm]} remove
 */

/**
 * Singleton storing data about comment forms on the page and managing them.
 *
 * @augments EventEmitter<EventMap>
 */
class CommentFormRegistry extends EventEmitter {
  /**
   * List of comment forms.
   *
   * @type {CommentForm[]}
   * @private
   */
  items = [];

  /**
   * @type {((...args: any[]) => any)|undefined}
   */
  throttledSaveSession;

  /**
   * _For internal use._ Initialize the registry.
   */
  init() {
    this.configureClosePageConfirmation();

    talkPageController
      .on('beforeReload', () => {
        // In case checkboxes were changed programmatically
        this.saveSession();
      })
      .on('startReload', this.detach.bind(this))
      .on('keyDown', (event) => {
        if (
          // Ctrl+Alt+Q
          keyCombination(event, 81, ['cmd', 'alt']) ||

          // Q
          (keyCombination(event, 81) && !isInputFocused())
        ) {
          const lastActiveCommentForm = this.getLastActive();
          const comment = commentRegistry.getSelectedComment();
          if (lastActiveCommentForm) {
            event.preventDefault();
            lastActiveCommentForm.quote(isCmdModifierPressed(event), comment || undefined);
          } else {
            if (comment?.isActionable) {
              event.preventDefault();
              comment.reply();
            }
          }
        }
      })
      .on('resize', this.adjustLabels.bind(this));
    commentRegistry
      .on('select', this.toggleQuoteButtonsHighlighting.bind(this, true))
      .on('unselect', this.toggleQuoteButtonsHighlighting.bind(this, false));
  }

  /**
   * Create a comment form and add it both to the registry and to the page. If it already exists,
   * reattach it to the page.
   *
   * @param {import('./Comment').default|import('./Section').default|import('./pageRegistry').Page} target
   * @param {object} config See {@link CommentForm}'s constructor.
   * @param {import('./CommentForm').CommentFormInitialState} [initialState] See
   *   {@link CommentForm}'s constructor.
   * @param {import('./CommentForm').default} [commentForm]
   * @returns {CommentForm}
   * @fires commentFormCreated
   */
  setupCommentForm(target, config, initialState, commentForm) {
    if (commentForm) {
      commentForm.setTargets(target);
      target.addCommentFormToPage(config.mode, commentForm);
    } else {
      commentForm = new CommentForm(Object.assign({ target, initialState }, config));
      target.addCommentFormToPage(config.mode, commentForm);
      commentForm.setup(initialState);
      this.items.push(commentForm);
      commentForm
        .on('change', this.saveSession.bind(this))
        .on('unregister', () => {
          this.remove(/** @type {CommentForm} */ (commentForm));
        })
        .on('teardown', () => {
          talkPageController.updatePageTitle();
          this.emit('teardown', commentForm);
        });
      this.emit('add', commentForm);
    }
    talkPageController.updatePageTitle();
    this.saveSession();

    /**
     * A comment form has been created and added to the page.
     *
     * @event commentFormCreated
     * @param {CommentForm} commentForm
     * @param {object} cd {@link convenientDiscussions} object.
     * @global
     */
    mw.hook('convenientDiscussions.commentFormCreated').fire(commentForm, cd);

    return commentForm;
  }

  /**
   * Remove a comment form from the registry.
   *
   * @param {CommentForm} item
   */
  remove(item) {
    removeFromArrayIfPresent(this.items, item);
    this.saveSession(true);
    this.emit('remove', item);
  }

  /**
   * Get all comment forms.
   *
   * @returns {CommentForm[]}
   */
  getAll() {
    return this.items;
  }

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
  }

  /**
   * Get the number of comment forms.
   *
   * @returns {number}
   */
  getCount() {
    return this.items.length;
  }

  /**
   * Get comment forms by a condition.
   *
   * @param {(commentForm: CommentForm) => boolean} condition
   * @returns {CommentForm[]}
   */
  query(condition) {
    return this.items.filter(condition);
  }

  /**
   * Reset the comment form list.
   *
   * @private
   */
  reset() {
    this.items.length = 0;
  }

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
  }

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
  }

  /**
   * Callback to be used in
   * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort Array#sort()}
   * for comment forms.
   *
   * @param {CommentForm} cf1
   * @param {CommentForm} cf2
   * @returns {number}
   * @private
   */
  lastFocused(cf1, cf2) {
    return (cf2.getLastFocused()?.getTime() || 0) - (cf1.getLastFocused()?.getTime() || 0);
  }

  /**
   * Adjust the button labels of all comment forms according to the form width: if the form is too
   * narrow, the labels will shrink.
   */
  adjustLabels() {
    this.items.forEach((commentForm) => {
      commentForm.adjustLabels();
    });
  }

  /**
   * Detach the comment forms keeping events. Also reset some of their properties.
   */
  detach() {
    this.items.forEach((commentForm) => {
      commentForm.detach();
    });
  }

  /**
   * The method that does the actual work for {@link module:commentFormRegistry.saveSession}.
   *
   * @private
   */
  actuallySaveSession() {
    (new StorageItemWithKeysAndSaveTime('commentForms'))
      .setWithTime(
        mw.config.get('wgPageName'),
        this.items
          .filter((commentForm) => commentForm.isAltered())
          .map((commentForm) => commentForm.getData())
      )
      .save();
  }

  /**
   * _For internal use._ Save comment form data to the local storage.
   *
   * @param {boolean} [force=true] Save session immediately, without regard for save frequency.
   */
  saveSession(force) {
    // A check in light of the existence of RevisionSlider, see the method
    if (!talkPageController.isCurrentRevision()) return;

    if (force) {
      this.actuallySaveSession();
    } else {
      // Don't save more often than once per 5 seconds.
      this.throttledSaveSession ||= OO.ui.throttle(
        /** @type {() => void} */ (this.actuallySaveSession.bind(this)),
        500
      );
      this.throttledSaveSession();
    }
  }

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
      /** @type {StorageItemWithKeysAndSaveTime<import('./CommentForm').CommentFormData[], 'commentForms'>} */ (
        new StorageItemWithKeysAndSaveTime('commentForms')
      )
        .cleanUp((entry) => !entry.commentForms?.length || entry.saveTime < subtractDaysFromNow(60))
        .save()
        .get(mw.config.get('wgPageName'))
        ?.commentForms
        .filter((data) => {
          const target = this.getTargetByData(data.targetData);
          if (data.targetWithOutdentedRepliesData) {
            /** @type {import('./CommentForm').CommentFormInitialState} */ (
              data
            ).targetWithOutdentedReplies = /** @type {import('./Comment').default|undefined} */ (
              this.getTargetByData(data.targetWithOutdentedRepliesData)
            );
          }
          if (
            target?.isActionable &&
            (!('canBeReplied' in target) || target.canBeReplied()) &&
            // Check if there is another form already
            !target[CommentForm.getPropertyNameOnTarget(target, data.mode)]
          ) {
            try {
              target[target.getCommentFormMethodName(data.mode)](
                data,
                undefined,
                data.preloadConfig,
                data.newTopicOnTop
              );
              haveRestored = true;
            } catch (error) {
              console.warn(error);
              return true;
            }
          } else {
            return true;
          }

          return false;
        })
    );

    if (haveRestored) {
      mw.notification.notify(cd.s('restore-restored-text'), {
        title: cd.s('restore-restored-title'),
      }).$notification.on('click', () => {
        this.items[0].goTo();
      });
    }
  }

  /**
   * Given identifying data (created by e.g. {@link Comment#getIdentifyingData}), get a comment or
   * section on the page or the page itself.
   *
   * @param {object} targetData
   * @returns {import('./Comment').default|import('./Section').default|import('./pageRegistry').Page|undefined}
   * @private
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
      return commentRegistry.getById(targetData.id) || undefined;
    } else {  // `data.mode === 'addSection'` or `targetData === null`
      // Page
      return cd.page;
    }
  }

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
  }

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
    cd.getWindowManager().addWindows([dialog]);
    cd.getWindowManager().openWindow(dialog, {
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

    this.saveSession();
  }

  /**
   * Return saved comment forms to their places.
   *
   * @param {boolean} fromStorage Should the session be restored from the local storage instead of
   *   directly from {@link convenientDiscussions.commentForms}.
   */
  restoreSession(fromStorage) {
    if (fromStorage) {
      // This is needed when the page is reloaded externally.
      this.reset();

      this.restoreSessionFromStorage();
    } else {
      this.restoreSessionDirectly();
    }
  }

  /**
   * Add a condition to show a confirmation when trying to close the page with active comment forms
   * on it.
   *
   * @private
   */
  configureClosePageConfirmation() {
    bootController.addPreventUnloadCondition('commentForms', () => {
      // Check for altered comment forms - if there are none, don't save the session to decrease the
      // chance of the situation where a user had two same pages in different tabs and lost a form
      // in other tab after saving nothing in this tab.
      if (this.getLastActiveAltered()) {
        this.saveSession(true);
      }
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
  }

  /**
   * Highlight or unhighlight the quote buttons of all comment forms.
   *
   * @param {boolean} highlight
   */
  toggleQuoteButtonsHighlighting(highlight) {
    this.items.forEach((item) => {
      item.highlightQuoteButton(highlight);
    });
  }
}

export default new CommentFormRegistry();
