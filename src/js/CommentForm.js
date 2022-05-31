import Autocomplete from './Autocomplete';
import Button from './Button';
import CdError from './CdError';
import Comment from './Comment';
import CommentFormStatic from './CommentFormStatic';
import CommentTextParser from './CommentTextParser';
import Section from './Section';
import cd from './cd';
import controller from './controller';
import navPanel from './navPanel';
import notifications from './notifications';
import pageRegistry from './pageRegistry';
import sessions from './sessions';
import settings from './settings';
import subscriptions from './subscriptions';
import userRegistry from './userRegistry';
import {
  buildEditSummary,
  defined,
  findLastIndex,
  focusInput,
  getNativePromiseState,
  handleApiReject,
  hideText,
  insertText,
  isCmdModifierPressed,
  isInputFocused,
  keyCombination,
  removeDoubleSpaces,
  removeFromArrayIfPresent,
  unhideText,
  unique,
  wrap,
  wrapDiffBody,
} from './util';
import { createCheckboxField } from './ooui';
import { generateTagsRegexp, removeWikiMarkup } from './wikitext';
import { parseCode } from './apiWrappers';
import { showSettingsDialog } from './modal';

let commentFormsCounter = 0;

/**
 * Extract IDs from comment links in the code.
 *
 * @param {string} code
 * @returns {string[]}
 * @private
 */
function extractCommentIds(code) {
  // Russian Wikipedia's Wikificator might mangle these links, replacing "_" with " ", so we search
  // for both characters.
  const idRegexp = /\[\[#(\d{12}[_ ][^|\]]+)/g;

  const ids = [];
  let match;
  while ((match = idRegexp.exec(code))) {
    ids.push(match[1]);
  }
  return ids;
}

/** Class representing a comment form. */
class CommentForm {
  /**
   * Object specifying configuration to preload data into the comment form. It is extracted from the
   * "Add section" link/button target.
   *
   * @typedef {object} PreloadConfig
   * @property {string} [editIntro] Edit intro page name.
   * @property {string} [commentTemplate] Comment template's page name.
   * @property {string} [headline] Subject/headline.
   * @property {string} [summary] Edit summary.
   * @property {string} [noHeadline] Whether to include a headline.
   * @property {string} [omitSignature] Whether to add the user's signature.
   * @global
   */

  /**
   * Create a comment form.
   *
   * @param {object} config
   * @param {string} config.mode `'reply'`, `'replyInSection'`, `'edit'`, `'addSubsection'`, or
   *   `'addSection'`.
   * @param {Comment|Section|Page} config.target Comment, section, or page that the form is related
   *   to.
   * @param {object} [config.dataToRestore] Data saved in the previous session.
   * @param {PreloadConfig} [config.preloadConfig] Configuration to preload data into the form.
   * @param {boolean} [config.isNewTopicOnTop] When adding a topic, whether it should be on top.
   * @throws {CdError}
   * @fires commentFormModulesReady
   * @fires commentFormCreated
   */
  constructor({ mode, target, dataToRestore, preloadConfig, isNewTopicOnTop }) {
    /**
     * Form mode. `'reply'`, `'replyInSection'`, `'edit'`, `'addSubsection'`, or `'addSection'`.
     *
     * @type {string}
     */
    this.mode = mode;

    this.setTargets(target);

    /**
     * Configuration to preload data into the form.
     *
     * @type {object|undefined}
     */
    this.preloadConfig = preloadConfig;

    /**
     * When adding a topic, whether it should be on top.
     *
     * @type {boolean|undefined}
     */
    this.isNewTopicOnTop = isNewTopicOnTop;

    if (this.target instanceof Comment) {
      this.sectionHeadline = this.target.section?.headline;
    } else if (this.target instanceof Section) {
      this.sectionHeadline = this.target.headline;
    }

    /**
     * Form ID.
     *
     * @type {number}
     */
    this.id = commentFormsCounter++;

    /**
     * Was the summary altered manually.
     *
     * @type {boolean}
     */
    this.isSummaryAltered = dataToRestore?.isSummaryAltered ?? false;

    /**
     * Is section opening comment edited.
     *
     * @type {boolean}
     * @private
     */
    this.isSectionOpeningCommentEdited = this.mode === 'edit' && this.target.isOpeningSection;

    /**
     * @typedef {object} CommentFormOperation
     * @property {string} type Operation type. One of `'load'`, `'preview'`, `'viewChanges'`, and
     *   `'submit'`.
     * @property {boolean} [affectHeadline=false] Should the headline input be displayed as pending.
     * @property {boolean} [isClosed] Is the operation closed (settled).
     * @property {boolean} [isDelayed] Is the operation delayed.
     * @global
     */

    /**
     * A list of current operations.
     *
     * @type {CommentFormOperation[]}
     */
    this.operations = [];

    if (this.mode === 'addSection') {
      // This is above `this.createContents()` as that function is time-costly and would delay the
      // requests made in `this.addEditNotices()`.
      this.addEditNotices();
    }

    const moduleNames = cd.config.customCommentFormModules
      .filter((module) => !module.checkFunc || module.checkFunc())
      .map((module) => module.name);
    mw.loader.using(moduleNames).then(() => {
      /**
       * All the requested custom comment form modules have been loaded and executed. (The comment
       * form may not be ready yet, use {@link event:commentFormToolbarReady} for that.)
       *
       * @event commentFormModulesReady
       * @param {CommentForm} commentForm
       * @param {object} cd {@link convenientDiscussions} object.
       */
      mw.hook('convenientDiscussions.commentFormModulesReady').fire(this, cd);
    });

    this.createContents(dataToRestore, moduleNames);
    this.addEventListeners();
    this.initAutocomplete();

    this.addToPage();
    if (this.mode === 'addSection') {
      $('#ca-addsection').addClass('selected');
      $('#ca-view').removeClass('selected');
    }

    if (!cd.user.isRegistered()) {
      this.showMessage(cd.sParse('error-anoneditwatning'), {
        type: 'warning',
        name: 'anonEditWarning',
      });
    }

    cd.commentForms.push(this);

    if (dataToRestore) {
      this.originalComment = dataToRestore.originalComment;
      this.originalHeadline = dataToRestore.originalHeadline;
      if (dataToRestore.lastFocused) {
        /**
         * The date when the comment form was focused last time.
         *
         * @type {Date|undefined}
         */
        this.lastFocused = new Date(dataToRestore.lastFocused);
      }

      if (dataToRestore.focus) {
        focusInput(this.headlineInput || this.commentInput);
      }

      // Navigation panel's comment form button is updated in the end of sessions.restore(),
      // so we don't have to do it here.
    } else {
      this.$element.cdScrollIntoView('center', true, () => {
        if (this.mode !== 'edit') {
          focusInput(this.headlineInput || this.commentInput);
        }

        // This is for the case when scrolling isn't performed (when it is, callback at the end of
        // $#cdScrollIntoView executes this line itself).
        navPanel.updateCommentFormButton();
      });

      if (this.mode === 'edit') {
        this.loadComment();
      } else {
        if (this.preloadConfig?.commentTemplate) {
          this.preloadTemplate();
        } else {
          this.originalComment = '';
        }

        if (this.headlineInput) {
          this.headlineInput.setValue(this.preloadConfig?.headline || '');
          this.originalHeadline = this.preloadConfig?.headline || '';
        }

        if (!(this.target.constructor.name === 'Page')) {
          this.checkCode();
        }
      }
    }

    /**
     * A comment form has been created and added to the page.
     *
     * @event commentFormCreated
     * @param {CommentForm} commentForm
     * @param {object} cd {@link convenientDiscussions} object.
     */
    mw.hook('convenientDiscussions.commentFormCreated').fire(this, cd);
  }

  /**
   * _For internal use._ Set the `target`, `targetSection`, `targetComment`, and `targetPage`
   * properties.
   *
   * @param {Comment|Section|Page} target
   * @throws {CdError}
   */
  setTargets(target) {
    /**
     * Target object.
     *
     * @type {?(Comment|Section)}
     */
    this.target = target;

    if (this.target instanceof Comment) {
      /**
       * Target section.
       *
       * @type {?(Section|undefined)}
       */
      this.targetSection = this.target.section;

      /**
       * Target comment. This may be the comment the user replies to or the comment opening the
       * section.
       *
       * @type {?(Comment|Section|undefined)}
       */
      this.targetComment = this.target;
    } else if (this.target instanceof Section) {
      this.targetSection = this.target;

      if (this.mode === 'replyInSection' && !this.target.replyButton) {
        throw new CdError();
      }

      if (this.target.comments[0]?.isOpeningSection) {
        this.targetComment = this.target.comments[0];
      }
    }

    /**
     * Wiki page that has the source code of the target object (may be different from the current
     * page if the section is transcluded from another page).
     *
     * @type {string}
     */
    this.targetPage = this.targetSection ? this.targetSection.getSourcePage() : cd.page;
  }

  /**
   * Create the inputs from OOUI widgets.
   *
   * @param {object} dataToRestore
   * @private
   */
  createInputs(dataToRestore) {
    if (
      (['addSection', 'addSubsection'].includes(this.mode) && !this.preloadConfig?.noHeadline) ||
      this.isSectionOpeningCommentEdited
    ) {
      const parentSection = this.targetSection?.getParent();
      if (this.mode === 'addSubsection') {
        this.headlineInputPlaceholder = cd.s('cf-headline-subsection', this.targetSection.headline);
      } else if (this.mode === 'edit' && parentSection) {
        this.headlineInputPlaceholder = cd.s('cf-headline-subsection', parentSection.headline);
      } else {
        this.headlineInputPlaceholder = cd.s('cf-headline-topic');
      }

      /**
       * Headline input.
       *
       * @type {external:OO.ui.TextInputWidget|undefined}
       */
      this.headlineInput = new OO.ui.TextInputWidget({
        value: dataToRestore?.headline ?? '',
        placeholder: this.headlineInputPlaceholder,
        classes: ['cd-commentForm-headlineInput'],
        tabIndex: String(this.id) + '11',
      });
    }

    let rowNumber = this.headlineInput ? 5 : 3;
    // Firefox gives a bigger height to a textarea with a specified number of rows than other
    // browsers.
    if (cd.g.CLIENT_PROFILE.name === 'firefox') {
      rowNumber -= 1;
    }

    let commentInputPlaceholder;
    if (this.mode === 'replyInSection' || (this.mode === 'reply' && this.target.isOpeningSection)) {
      commentInputPlaceholder = cd.s(
        'cf-comment-placeholder-replytosection',
        this.targetSection.headline
      );
    } else if (this.mode === 'reply') {
      // If there is a need to make a request to get the user gender, we don't show any
      // placeholder text at the beginning to avoid drawing the user's attention to the changing
      // of the text. (But it could be a better idea to set the `showCommentInputPlaceholder`
      // config variable to `false` to avoid showing any text whatsoever.)
      this.target.requestAuthorGenderIfNeeded(() => {
        this.commentInput.$input.attr(
          'placeholder',
          removeDoubleSpaces(cd.s(
            'cf-comment-placeholder-replytocomment',
            this.target.author.name,
            this.target.author
          ))
        );
      }, true);
    }

    /**
     * Comment input.
     *
     * @type {external:OO.ui.MultilineTextInputWidget}
     */
    this.commentInput = new OO.ui.MultilineTextInputWidget({
      value: dataToRestore?.comment ?? '',
      placeholder: commentInputPlaceholder,
      autosize: true,
      rows: rowNumber,
      maxRows: 30,
      classes: ['cd-commentForm-commentInput'],
      tabIndex: String(this.id) + '12',
    });
    this.commentInput.$input.addClass('ime-position-inside');

    /**
     * Edit summary input.
     *
     * @type {external:OO.ui.TextInputWidget}
     */
    this.summaryInput = new OO.ui.TextInputWidget({
      value: dataToRestore?.summary ?? '',
      maxLength: cd.g.SUMMARY_LENGTH_LIMIT,
      placeholder: cd.s('cf-summary-placeholder'),
      classes: ['cd-commentForm-summaryInput'],
      tabIndex: String(this.id) + '13',
    });
    this.summaryInput.$input.codePointLimit(cd.g.SUMMARY_LENGTH_LIMIT);
    mw.widgets.visibleCodePointLimit(this.summaryInput, cd.g.SUMMARY_LENGTH_LIMIT);
    this.updateAutoSummary(!dataToRestore?.summary);
  }

  /**
   * Create the checkboxes and the horizontal layout containing them from OOUI widgets.
   *
   * @param {object} dataToRestore
   * @private
   */
  createCheckboxes(dataToRestore) {
    if (this.mode === 'edit') {
      /**
       * Minor change checkbox field.
       *
       * @name minorField
       * @type {external:OO.ui.FieldLayout|undefined}
       * @memberof CommentForm
       * @instance
       */

      /**
       * Minor change checkbox.
       *
       * @name minorCheckbox
       * @type {external:OO.ui.CheckboxInputWidget|undefined}
       * @memberof CommentForm
       * @instance
       */
      [this.minorField, this.minorCheckbox] = createCheckboxField({
        value: 'minor',
        selected: dataToRestore?.minor ?? true,
        label: cd.s('cf-minor'),
        tabIndex: String(this.id) + '20',
      });
    }

    const watchCheckboxSelected = (
      (settings.get('watchOnReply') && this.mode !== 'edit') ||
      $('#ca-unwatch').length ||
      mw.user.options.get(mw.config.get('wgArticleId') ? 'watchdefault' : 'watchcreations')
    );

    /**
     * Watch page checkbox field.
     *
     * @name watchField
     * @type {external:OO.ui.FieldLayout}
     * @memberof CommentForm
     * @instance
     */

    /**
     * Watch page checkbox.
     *
     * @name watchCheckbox
     * @type {external:OO.ui.CheckboxInputWidget}
     * @memberof CommentForm
     * @instance
     */
    [this.watchField, this.watchCheckbox] = createCheckboxField({
      value: 'watch',
      selected: dataToRestore?.watch ?? watchCheckboxSelected,
      label: cd.s('cf-watch'),
      tabIndex: String(this.id) + '21',
    });

    if (this.targetSection || this.mode === 'addSection') {
      const selected = (
        (settings.get('subscribeOnReply') && this.mode !== 'edit') ||
        this.targetSection?.subscriptionState
      );

      const callItTopic = (
        settings.get('useTopicSubscription') ||
        (
          this.mode !== 'addSubsection' &&
          ((this.targetSection && this.targetSection.level <= 2) || this.mode === 'addSection')
        )
      );
      const label = cd.s('cf-watchsection-' + (callItTopic ? 'topic' : 'subsection'));

      /**
       * Subscribe checkbox field.
       *
       * @name subscribeField
       * @type {external:OO.ui.FieldLayout|undefined}
       * @memberof CommentForm
       * @instance
       */

      /**
       * Subscribe checkbox.
       *
       * @name subscribeCheckbox
       * @type {external:OO.ui.CheckboxInputWidget|undefined}
       * @memberof CommentForm
       * @instance
       */
      [this.subscribeField, this.subscribeCheckbox] = createCheckboxField({
        value: 'subscribe',
        selected: dataToRestore?.subscribe ?? selected,
        label,
        tabIndex: String(this.id) + '22',
        title: cd.s('cf-watchsection-tooltip'),
      });
    }

    if (['addSection', 'addSubsection'].includes(this.mode)) {
      /**
       * Omit signature checkbox field.
       *
       * @name omitSignatureField
       * @type {external:OO.ui.FieldLayout|undefined}
       * @memberof CommentForm
       * @instance
       */

      /**
       * Omit signature checkbox.
       *
       * @name omitSignatureCheckbox
       * @type {external:OO.ui.CheckboxInputWidget|undefined}
       * @memberof CommentForm
       * @instance
       */

      [this.omitSignatureField, this.omitSignatureCheckbox] = createCheckboxField({
        value: 'omitSignature',
        selected: dataToRestore?.omitSignature ?? false,
        label: cd.s('cf-omitsignature'),
        tabIndex: String(this.id) + '25',
      });
    }

    if (
      this.mode === 'edit' &&
      (
        this.target.isOpeningSection ?
          this.targetSection.comments.length === 1 :
          !this.target.getChildren().length
      )
    ) {
      const selected = dataToRestore?.delete ?? false;

      /**
       * Delete checkbox field.
       *
       * @name deleteField
       * @type {external:OO.ui.FieldLayout|undefined}
       * @memberof CommentForm
       * @instance
       */

      /**
       * Delete checkbox.
       *
       * @name deleteCheckbox
       * @type {external:OO.ui.CheckboxInputWidget|undefined}
       * @memberof CommentForm
       * @instance
       */
      [this.deleteField, this.deleteCheckbox] = createCheckboxField({
        value: 'delete',
        selected,
        label: cd.s('cf-delete'),
        tabIndex: String(this.id) + '26',
      });
    }

    /**
     * Checkboxes area.
     *
     * @type {external:OO.ui.HorizontalLayout}
     */
    this.checkboxesLayout = new OO.ui.HorizontalLayout({
      classes: ['cd-commentForm-checkboxes'],
      items: [
        this.minorField,
        this.watchField,
        this.subscribeField,
        this.omitSignatureField,
        this.deleteField,
      ].filter(defined),
    });
  }

  /**
   * Create the buttons from OOUI widgets.
   *
   * @private
   */
  createButtons() {
    const modeToSubmitButtonMessageName = {
      edit: 'save',
      addSection: 'addtopic',
      addSubsection: 'addsubsection',
    };
    const submitButtonMessageName = modeToSubmitButtonMessageName[this.mode] || 'reply';
    this.submitButtonLabelStandard = cd.s(`cf-${submitButtonMessageName}`);
    this.submitButtonLabelShort = cd.s(`cf-${submitButtonMessageName}-short`);

    /**
     * Toggle advanced section button.
     *
     * @type {external:OO.ui.ButtonWidget}
     */
    this.advancedButton = new OO.ui.ButtonWidget({
      label: cd.s('cf-advanced'),
      framed: false,
      classes: ['cd-button-ooui', 'cd-commentForm-advancedButton'],
      tabIndex: String(this.id) + '30',
    });

    /**
     * Help button.
     *
     * @type {external:OO.ui.PopupButtonWidget}
     */
    this.helpPopupButton = new OO.ui.PopupButtonWidget({
      label: cd.s('cf-help'),
      framed: false,
      classes: ['cd-button-ooui'],
      popup: {
        head: false,
        $content: wrap(
          cd.sParse('cf-help-content', cd.config.mentionCharacter, cd.g.CMD_MODIFIER),
          {
            tagName: 'div',
            targetBlank: true,
          }
        ),
        padded: true,
        align: 'center',
        width: 400,
      },
      $overlay: controller.getPopupOverlay(),
      tabIndex: String(this.id) + '31',
    });

    /**
     * Script settings button.
     *
     * @name settingsButton
     * @type {Promise}
     * @memberof CommentForm
     * @instance
     */
    this.settingsButton = new OO.ui.ButtonWidget({
      framed: false,
      icon: 'settings',
      label: cd.s('cf-settings-tooltip'),
      invisibleLabel: true,
      title: cd.s('cf-settings-tooltip'),
      classes: ['cd-button-ooui', 'cd-commentForm-settingsButton'],
      tabIndex: String(this.id) + '32',
    });

    /**
     * Cancel button.
     *
     * @type {external:OO.ui.ButtonWidget}
     */
    this.cancelButton = new OO.ui.ButtonWidget({
      label: cd.s('cf-cancel'),
      flags: 'destructive',
      framed: false,
      classes: ['cd-button-ooui', 'cd-commentForm-cancelButton'],
      tabIndex: String(this.id) + '33',
    });

    /**
     * View changes button.
     *
     * @type {external:OO.ui.ButtonWidget}
     */
    this.viewChangesButton = new OO.ui.ButtonWidget({
      label: cd.s('cf-viewchanges'),
      classes: ['cd-commentForm-viewChangesButton'],
      tabIndex: String(this.id) + '34',
    });

    /**
     * Preview button.
     *
     * @type {external:OO.ui.ButtonWidget}
     */
    this.previewButton = new OO.ui.ButtonWidget({
      label: cd.s('cf-preview'),
      classes: ['cd-commentForm-previewButton'],
      tabIndex: String(this.id) + '35',
    });
    if (settings.get('autopreview')) {
      this.previewButton.$element.hide();
    }

    /**
     * Submit button.
     *
     * @type {external:OO.ui.ButtonWidget}
     */
    this.submitButton = new OO.ui.ButtonWidget({
      label: this.submitButtonLabelStandard,
      flags: ['progressive', 'primary'],
      classes: ['cd-commentForm-submitButton'],
      tabIndex: String(this.id) + '36',
    });
  }

  /**
   * Create the main element, the wrappers for the controls (inputs, checkboxes, buttons), and other
   * elements.
   *
   * @private
   */
  createElements() {
    if (!['addSection', 'addSubsection'].includes(this.mode)) {
      if (this.mode === 'reply') {
        /**
         * Name of the tag of the list that this comment form is an item of. `'dl'`, `'ul'`, `'ol'`,
         * or `undefined`.
         *
         * @type {string|undefined}
         */
        this.containerListType = 'dl';
      } else if (this.mode === 'edit') {
        this.containerListType = this.target.containerListType;
      } else if (this.mode === 'replyInSection') {
        this.containerListType = this.target.$replyContainer.prop('tagName').toLowerCase();
      }
    }

    /**
     * The main form element.
     *
     * @type {external:jQuery}
     */
    this.$element = $('<div>').addClass(`cd-commentForm cd-commentForm-${this.mode}`);

    if (this.containerListType === 'ol') {
      this.$element.addClass('cd-commentForm-inNumberedList');
    }
    if (this.isSectionOpeningCommentEdited) {
      this.$element.addClass('cd-commentForm-sectionOpeningComment');
    }
    if (this.mode === 'addSubsection') {
      this.$element.addClass(`cd-commentForm-addSubsection-${this.target.level}`);
    }

    /**
     * The area where service messages are displayed.
     *
     * @type {external:jQuery}
     */
    this.$messageArea = $('<div>').addClass('cd-messageArea');

    /**
     * The area where edit summary preview is displayed.
     *
     * @type {external:jQuery}
     */
    this.$summaryPreview = $('<div>').addClass('cd-summaryPreview');

    /**
     * Advanced section container.
     *
     * @type {external:jQuery}
     */
    this.$advanced = $('<div>')
      .addClass('cd-commentForm-advanced')
      .append([
        this.summaryInput.$element,
        this.$summaryPreview,
        this.checkboxesLayout.$element,
      ]);

    /**
     * Start (left on LTR wikis, right on RTL wikis) form buttons container.
     *
     * @type {external:jQuery}
     */
    this.$buttonsStart = $('<div>')
      .addClass('cd-commentForm-buttons-start')
      .append([
        this.advancedButton.$element,
        this.helpPopupButton.$element,
        this.settingsButton.$element,
      ]);

    /**
     * End (right on LTR wikis, left on RTL wikis) form buttons container.
     *
     * @type {external:jQuery}
     */
    this.$buttonsEnd = $('<div>')
      .addClass('cd-commentForm-buttons-end')
      .append([
        this.cancelButton.$element,
        this.viewChangesButton.$element,
        this.previewButton.$element,
        this.submitButton.$element,
      ]);

    /**
     * Form buttons container.
     *
     * @type {external:jQuery}
     */
    this.$buttons = $('<div>')
      .addClass('cd-commentForm-buttons')
      .append(this.$buttonsStart, this.$buttonsEnd);

    this.$element.append([
      this.$messageArea,
      this.headlineInput?.$element,
      this.commentInput.$element,
      this.$advanced,
      this.$buttons,
    ]);

    if (this.mode !== 'edit' && !settings.get('alwaysExpandAdvanced')) {
      this.$advanced.hide();
    }

    /**
     * The area where comment previews and changes are displayed.
     *
     * @type {external:jQuery}
     */
    this.$previewArea = $('<div>').addClass('cd-previewArea');

    if (settings.get('autopreview')) {
      this.$previewArea
        .addClass('cd-previewArea-below')
        .appendTo(this.$element);
    } else {
      this.$previewArea
        .addClass('cd-previewArea-above')
        .prependTo(this.$element);
    }

    if (this.containerListType === 'ol' && cd.g.CLIENT_PROFILE.layout !== 'webkit') {
      // Dummy element for forms inside a numbered list so that the number is placed in front of
      // that area, not in some silly place. Note that in Chrome, the number is placed in front of
      // the textarea, so we don't need this in that browser.
      $('<div>')
        .html('&nbsp;')
        .addClass('cd-commentForm-dummyElement')
        .prependTo(this.$element);
    }
  }

  /**
   * Add a WikiEditor toolbar to the comment input if the relevant setting is enabled.
   *
   * @param {string[]} requestedModulesNames List of custom comment form modules to await loading of
   *   before adding the toolbar.
   * @fires commentFormToolbarReady
   * @private
   */
  async addToolbar(requestedModulesNames) {
    if (!settings.get('showToolbar')) return;

    const $toolbarPlaceholder = $('<div>')
      .addClass('cd-toolbarPlaceholder')
      .insertBefore(this.commentInput.$element);

    await mw.loader.using(['ext.wikiEditor', ...requestedModulesNames]);

    $toolbarPlaceholder.remove();

    const $input = this.commentInput.$input;

    const wikiEditorModule = mw.loader.moduleRegistry['ext.wikiEditor'];
    const toolbarConfig = wikiEditorModule.packageExports['jquery.wikiEditor.toolbar.config.js'];
    $input.wikiEditor('addModule', toolbarConfig);
    const dialogsConfig = wikiEditorModule.packageExports['jquery.wikiEditor.dialogs.config.js'];
    dialogsConfig.replaceIcons($input);
    $input.wikiEditor('addModule', dialogsConfig.getDefaultConfig());

    this.commentInput.$element
      .find('.tool[rel="redirect"], .tool[rel="signature"], .tool[rel="newline"], .tool[rel="reference"], .option[rel="heading-2"]')
      .remove();
    if (!['addSection', 'addSubsection'].includes(this.mode)) {
      this.commentInput.$element.find('.group-heading').remove();
    }

    // Make the undo/redo functionality work in browsers that support it. Also, fix the behavior
    // of dialog where text is inserted into the last opened form, not the current.
    $input.textSelection('register', {
      encapsulateSelection: (options) => {
        // Seems like the methods are registered for all inputs instead of the one the method is
        // called for.
        CommentForm.getLastActive().encapsulateSelection(options);
      },
      setContents: (value) => {
        const commentForm = CommentForm.getLastActive();
        commentForm.commentInput.select();
        insertText(commentForm.commentInput, value);
      },
    });

    const lang = cd.g.USER_LANGUAGE;
    $input.wikiEditor('addToToolbar', {
      section: 'main',
      group: 'format',
      tools: {
        smaller: {
          label: cd.mws('wikieditor-toolbar-tool-small'),
          type: 'button',
          icon: `/w/load.php?modules=oojs-ui.styles.icons-editing-styling&image=smaller&lang=${lang}&skin=vector`,
          action: {
            type: 'encapsulate',
            options: {
              pre: '<small>',
              peri: cd.mws('wikieditor-toolbar-tool-small-example'),
              post: '</small>',
            },
          },
        },
        quote: {
          label: `${cd.s('cf-quote-tooltip')} ${cd.mws('parentheses', `Q${cd.mws('comma-separator')}Ctrl+Alt+Q`)}`,
          type: 'button',
          icon: `/w/load.php?modules=oojs-ui.styles.icons-editing-advanced&image=quotes&lang=${lang}&skin=vector`,
          action: {
            type: 'callback',
            execute: () => {
              this.quote();
            },
          },
        },
      },
    });
    $input.wikiEditor('addToToolbar', {
      section: 'advanced',
      group: 'format',
      tools: {
        code: {
          label: cd.s('cf-code-tooltip'),
          type: 'button',
          icon: `/w/load.php?modules=oojs-ui.styles.icons-editing-advanced&image=code&lang=${lang}&skin=vector`,
          action: {
            type: 'encapsulate',
            options: {
              pre: '<code><nowiki>',
              peri: cd.s('cf-code-placeholder'),
              post: '</'.concat('nowiki></code>'),
            },
          },
        },
        codeBlock: {
          label: cd.s('cf-codeblock-tooltip'),
          type: 'button',
          icon: `/w/load.php?modules=oojs-ui.styles.icons-editing-advanced&image=markup&lang=${lang}&skin=vector`,
          action: {
            type: 'encapsulate',
            options: {
              pre: '<syntaxhighlight lang="">\n',
              peri: cd.s('cf-codeblock-placeholder'),
              post: '\n</syntaxhighlight>',
            },
          },
        },
        underline: {
          label: cd.s('cf-underline-tooltip'),
          type: 'button',
          icon: `/w/load.php?modules=oojs-ui.styles.icons-editing-styling&image=underline&lang=${lang}&skin=vector`,
          action: {
            type: 'encapsulate',
            options: {
              pre: '<u>',
              peri: cd.s('cf-underline-placeholder'),
              post: '</u>',
            },
          },
        },
        strikethrough: {
          label: cd.s('cf-strikethrough-tooltip'),
          type: 'button',
          icon: `/w/load.php?modules=oojs-ui.styles.icons-editing-styling&image=strikethrough&lang=${lang}&skin=vector`,
          action: {
            type: 'encapsulate',
            options: {
              pre: '<s>',
              peri: cd.s('cf-strikethrough-placeholder'),
              post: '</s>',
            },
          },
        },
      },
    });
    $input.wikiEditor('addToToolbar', {
      section: 'main',
      group: 'insert',
      tools: {
        mention: {
          label: cd.s('cf-mention-tooltip', cd.g.CMD_MODIFIER),
          type: 'button',
          icon: `/w/load.php?modules=oojs-ui.styles.icons-user&image=userAvatar&lang=${lang}&skin=vector`,
          action: {
            type: 'callback',
            execute: () => {},
          },
        },
      },
    });
    this.$element
      .find('.tool-button[rel="mention"]')
      .off('click')
      .on('click', (e) => {
        this.mention(isCmdModifierPressed(e));
      });

    this.$element
      .find('.tool[rel="link"] a, .tool[rel="file"] a')
      .on('click', (e) => {
        // Fix text being inserted in a wrong textarea.
        const rel = e.currentTarget.parentNode.getAttribute('rel');
        const $dialog = $(`#wikieditor-toolbar-${rel}-dialog`);
        if ($dialog.length) {
          const context = $dialog.data('context');
          if (context) {
            context.$textarea = context.$focusedElem = this.commentInput.$input;
          }

          // Fix the error when trying to submit the dialog by pressing Enter after doing so by
          // pressing a button.
          $dialog.parent().data('dialogaction', false);
        }
      });

    // Fix a focus bug in Firefox 56.
    if ($input.is(':focus')) {
      $input.blur();
      focusInput(this.commentInput);
    }

    // A hack to make the WikiEditor cookies related to active sections and pages saved correctly.
    $input.data('wikiEditor-context').instance = 5;
    $.wikiEditor.instances = Array(5);

    /**
     * The comment form toolbar is ready; all the requested custom comment form modules have been
     * loaded and executed.
     *
     * @event commentFormToolbarReady
     * @param {CommentForm} commentForm
     * @param {object} cd {@link convenientDiscussions} object.
     */
    mw.hook('convenientDiscussions.commentFormToolbarReady').fire(this, cd);
  }

  /**
   * Add an insert button to the block under the comment input.
   *
   * @param {string} snippet
   * @param {string} [label]
   * @private
   */
  addInsertButton(snippet, label) {
    const hidden = [];
    snippet = hideText(snippet, /\\[+;\\]/g, hidden);
    let [, pre, post] = snippet.match(/^(.*?)(?:\+(.*))?$/) || [];
    if (!pre) return;
    post = post || '';
    const unescape = (snippet) => snippet.replace(/\\([+;\\])/g, '$1');
    pre = unescape(unhideText(pre, hidden));
    post = unescape(unhideText(post, hidden));
    label = label ? unescape(label) : pre + post;

    const button = new Button({
      label: label,
      classes: ['cd-insertButtons-button'],
      action: () => {
        this.encapsulateSelection({ pre, post });
      },
    })
    this.$insertButtons.append(button.element, ' ');
  }

  /**
   * Add the insert buttons block under the comment input.
   *
   * @private
   */
  addInsertButtons() {
    if (!settings.get('insertButtons').length) return;

    /**
     * Text insert buttons.
     *
     * @type {external:jQuery|undefined}
     */
    this.$insertButtons = $('<div>')
      .addClass('cd-insertButtons')
      .insertAfter(this.commentInput.$element);

    settings.get('insertButtons').forEach((button) => {
      let snippet;
      let label;
      if (Array.isArray(button)) {
        snippet = button[0];
        label = button[1];
      } else {
        snippet = button;
      }
      this.addInsertButton(snippet, label);
    });
  }

  /**
   * Create the contents of the form.
   *
   * @param {object} dataToRestore
   * @param {string[]} requestedModulesNames
   * @private
   */
  createContents(dataToRestore, requestedModulesNames) {
    this.createInputs(dataToRestore);
    this.createCheckboxes(dataToRestore);
    this.createButtons();

    if (this.deleteCheckbox?.isSelected()) {
      this.updateFormOnDeleteCheckboxChange(true);
    }

    this.createElements();
    this.addToolbar(requestedModulesNames);
    this.addInsertButtons();
  }

  /**
   * Load the edited comment to the comment form.
   *
   * @private
   */
  loadComment() {
    const currentOperation = this.registerOperation('load');
    this.target.getCode(true).then(
      () => {
        let commentText = this.target.codeToText();
        if (this.target.inCode.inSmallFont) {
          commentText = `<small>${commentText}</small>`;
        }
        const headline = this.target.inCode.headlineCode;

        this.commentInput.setValue(commentText);
        this.originalComment = commentText;
        if (this.headlineInput) {
          this.headlineInput.setValue(headline);
          this.originalHeadline = headline;
        }

        this.closeOperation(currentOperation);

        focusInput(this.commentInput);
        this.preview();
      },
      (e) => {
        if (e instanceof CdError) {
          const options = Object.assign({}, e.data, {
            cancel: true,
            currentOperation,
          });
          this.handleError(options);
        } else {
          this.handleError({
            type: 'javascript',
            logMessage: e,
            cancel: true,
            currentOperation,
          });
        }
      }
    );
  }

  /**
   * Test if a comment or section exists in the wikitext.
   *
   * @returns {external:jQueryPromise}
   */
  checkCode() {
    if (!this.checkCodeRequest) {
      /**
       * Request to test if a comment or section exists in the code made by
       * {@link CommentForm#checkCode}.
       *
       * @type {external:jQueryPromise|undefined}
       */
      this.checkCodeRequest = this.target.getCode(this).catch((e) => {
        if (e instanceof CdError) {
          const options = Object.assign({}, e.data);
          this.handleError(options);
        } else {
          this.handleError({
            type: 'javascript',
            logMessage: e,
          });
        }
      });
    }
    return this.checkCodeRequest;
  }

  /**
   * Make a parse request with the transclusion code of edit notices and edit intro and add the
   * result to the message area.
   *
   * @private
   */
  async addEditNotices() {
    const title = cd.page.title.replace(/\//g, '-');
    let code = (
      '<div class="cd-editnotice">' +
      `{{MediaWiki:Editnotice-${cd.g.NAMESPACE_NUMBER}}}` +
      '</div>\n' +
      '<div class="cd-editnotice">' +
      `{{MediaWiki:Editnotice-${cd.g.NAMESPACE_NUMBER}-${title}}}` +
      '</div>\n'
    );
    if (this.preloadConfig?.editIntro) {
      code = `<div class="cd-editintro">{{${this.preloadConfig.editIntro}}}</div>\n` + code;
    }

    let result;
    try {
      result = await parseCode(code, { title: cd.page.name });
    } catch {
      // TODO: Some error message? (But in most cases there are no edit notices anyway, and if the
      // user is knowingly offline they would be annoying.)
      return;
    }

    const mediaWikiNamespace = mw.config.get('wgFormattedNamespaces')[8];
    this.$messageArea
      .append(result.html)
      .cdAddCloseButton()
      .find(`.cd-editnotice > a.new[title^="${mediaWikiNamespace}:Editnotice-"]`)
      .parent()
      .remove();

    // We mirror the functionality of the "ext.charinsert" module to keep the undo/redo
    // functionality.
    this.$messageArea
      .find('.mw-charinsert-item')
      .each((i, el) => {
        const $el = $(el);
        const pre = $el.data('mw-charinsert-start');
        const post = $el.data('mw-charinsert-end');
        $el
          .on('click', () => {
            this.encapsulateSelection({ pre, post });
          })
          .data('mw-charinsert-done', true);
      });

    mw.hook('wikipage.content').fire(this.$messageArea);
  }

  /**
   * Load the content of a preload template (`preload` parameter of the URL or a POST request) to
   * the comment input.
   *
   * @private
   */
  preloadTemplate() {
    const currentOperation = this.registerOperation('load', { affectHeadline: false });
    const preloadPage = pageRegistry.get(this.preloadConfig.commentTemplate);
    preloadPage.getCode().then(
      () => {
        let code = preloadPage.code;

        const regexp = generateTagsRegexp(['onlyinclude']);
        let match;
        let onlyInclude;
        while ((match = regexp.exec(code))) {
          if (onlyInclude === undefined) {
            onlyInclude = '';
          }
          onlyInclude += match[2];
        }
        if (onlyInclude !== undefined) {
          code = onlyInclude;
        }

        code = code
          .replace(generateTagsRegexp(['includeonly']), '$2')
          .replace(generateTagsRegexp(['noinclude']), '');
        code = code.trim();

        if (code.includes(cd.g.SIGN_CODE) || this.preloadConfig.omitSignature) {
          this.omitSignatureCheckbox.setSelected(true);
        }

        this.commentInput.setValue(code);
        this.originalComment = code;

        this.closeOperation(currentOperation);

        focusInput(this.headlineInput || this.commentInput);
        this.preview();
      },
      (e) => {
        if (e instanceof CdError) {
          const options = Object.assign({}, e.data, {
            cancel: true,
            currentOperation,
          });
          this.handleError(options);
        } else {
          this.handleError({
            type: 'javascript',
            logMessage: e,
            cancel: true,
            currentOperation,
          });
        }
      }
    );
  }

  /**
   * _For internal use._ Insert the form into the DOM.
   */
  addToPage() {
    if (this.mode === 'replyInSection') {
      this.target.replyButton.hide();
    } else if (this.mode === 'addSubsection' && this.target.$addSubsectionButtonContainer) {
      this.target.$addSubsectionButtonContainer.hide();
    } else if (this.mode === 'addSection' && controller.$addSectionButtonContainer) {
      controller.$addSectionButtonContainer.hide();
    }

    // 'addSection'
    if (!mw.config.get('wgArticleId')) {
      controller.$content.children('.noarticletext, .warningbox').hide();
    }

    let $wrappingItem;
    let $wrappingList;
    let $outerWrapper;
    if (this.mode === 'reply') {
      ({ $wrappingItem, $wrappingList, $outerWrapper } = this.target
        .addSublevelItem('replyForm', 'top'));
    } else if (this.mode === 'edit') {
      const $lastOfTarget = this.target.$elements.last();
      if ($lastOfTarget.is('dd, li')) {
        const outerWrapperTag = $lastOfTarget.prop('tagName').toLowerCase();
        $outerWrapper = $(`<${outerWrapperTag}>`);
        this.$element.appendTo($outerWrapper);
      }
    }

    /**
     * The outermost element of the form (equal to the comment form element, item that wraps the
     * comment form element, list that wraps the item etc., or outer wrapper (usually an item of a
     * list itself) that wraps the list etc. It is removed to return the DOM to the original state,
     * before the form was created.
     *
     * @type {external:jQuery}
     */
    this.$outermostElement = $outerWrapper || $wrappingList || $wrappingItem || this.$element;

    // Add to page
    switch (this.mode) {
      case 'reply': {
        this.$element.appendTo($wrappingItem || $outerWrapper);
        break;
      }

      case 'edit': {
        // We insert the form before the comment so that if the comment ends on a wrong level, the
        // form is on a right one. The exception is comments that open a section (otherwise a bug
        // will be introduced that will manifest when opening an "Add subsection" form of the
        // previous section).
        if (this.target.isOpeningSection) {
          this.$outermostElement.insertAfter(this.target.$elements.last());
        } else {
          this.$outermostElement.insertBefore(this.target.$elements.first());
        }
        break;
      }

      case 'replyInSection': {
        this.$element.appendTo(this.target.$replyWrapper);
        this.target.$replyWrapper.addClass('cd-replyWrapper-hasCommentForm');
        break;
      }

      case 'addSection': {
        if (this.isNewTopicOnTop && cd.sections[0]) {
          this.$element.insertBefore(cd.sections[0].$heading);
        } else {
          this.$element.appendTo(controller.$content);
        }
        break;
      }

      case 'addSubsection': {
        /*
          In the following structure:
            == Level 2 section ==
            === Level 3 section ===
            ==== Level 4 section ====
          ..."Add subsection" forms should go in the opposite order. So, if there are "Add
          subsection" forms for a level 4 and then a level 2 section and the user clicks "Add
          subsection" for a level 3 section, we need to put our form between them.
         */
        const level = this.target.level;
        const headingLevelRegexp = new RegExp(`\\bcd-commentForm-addSubsection-[${level}-6]\\b`);
        let $target;
        let $tested = $(this.target.lastElement);
        const selector = '.cd-section-button-container, .cd-commentForm-reply';
        do {
          $target = $tested;
          $tested = $tested.next();
        } while ($tested.is(selector) || $tested.get(0)?.className.match(headingLevelRegexp));
        this.$element.insertAfter($target);
        break;
      }
    }

    this.adjustLabels();
  }

  /**
   * Add events to form elements.
   *
   * @private
   */
  addEventListeners() {
    const saveSessionEventHandler = () => {
      sessions.save();
    };
    const preview = () => {
      this.preview();
    };

    const textReactions = [
      {
        pattern: new RegExp(cd.g.SIGN_CODE + '\\s*$'),
        message: cd.sParse('cf-reaction-signature', cd.g.SIGN_CODE),
        name: 'signatureNotNeeded',
        type: 'notice',
        checkFunc: () => !this.omitSignatureCheckbox?.isSelected(),
      },
      {
        pattern: /<pre/,
        message: cd.sParse('cf-reaction-pre'),
        name: 'dontUsePre',
        type: 'warning',
      },
    ].concat(cd.config.customTextReactions);

    this.$element
      // Hotkeys
      .on('keydown', (e) => {
        // Ctrl+Enter
        if (keyCombination(e, 13, ['ctrl'])) {
          this.submit();
        }

        // Esc
        if (keyCombination(e, 27)) {
          this.cancel();
        }
      })

      // "focusin" is "focus" that bubbles, i.e. propagates up the node tree.
      .on('focusin', () => {
        this.lastFocused = new Date();
      });

    if (this.headlineInput) {
      this.headlineInput
        .on('change', (headline) => {
          this.updateAutoSummary(true, true);

          if (headline.includes('{{') && !this.preloadConfig?.headline) {
            this.showMessage(cd.sParse('cf-reaction-templateinheadline'), {
              type: 'warning',
              name: 'templateInHeadline',
            });
          } else {
            this.hideMessage('templateInHeadline');
          }
        })
        .on('change', preview)
        .on('change', saveSessionEventHandler);

      this.headlineInput.$input.on('keydown', (e) => {
        // Enter
        if (e.keyCode === 13 && !controller.getActiveAutocompleteMenu()) {
          this.submit();
        }
      });
    }

    this.commentInput
      .on('change', (text) => {
        this.updateAutoSummary(true, true);

        textReactions.forEach(({ pattern, checkFunc, message, type, name }) => {
          if (pattern.test(text) && (typeof checkFunc !== 'function' || checkFunc(this))) {
            this.showMessage(message, { type, name });
          } else {
            this.hideMessage(name);
          }
        });
      })
      .on('change', preview)
      .on('change', saveSessionEventHandler);

    this.commentInput.$input
      .on('paste drop', async (e) => {
        const data = e.originalEvent.clipboardData || e.originalEvent.dataTransfer;
        if (data.types.includes('text/html')) {
          e.preventDefault();
          const text = await controller.getWikitextFromPaste(
            data.getData('text/html'),
            this.commentInput
          );
          insertText(this.commentInput, text);
        }
      })
      .on('tribute-replaced', (e) => {
        if (e.originalEvent.detail.instance.trigger === cd.config.mentionCharacter) {
          if (this.mode === 'edit') {
            const $message = wrap(cd.sParse('cf-reaction-mention-edit'), { targetBlank: true });
            this.showMessage($message, {
              type: 'notice',
              name: 'mentionEdit',
            });
          }
          if (this.omitSignatureCheckbox?.isSelected()) {
            const $message = wrap(cd.sParse('cf-reaction-mention-nosignature'), {
              targetBlank: true,
            });
            this.showMessage($message, {
              type: 'notice',
              name: 'mentionNoSignature',
            });
          }
        }
      });

    this.summaryInput
      .on('change', () => {
        if (this.summaryInput.$input.is(':focus')) {
          this.isSummaryAltered = true;
          this.dontAutopreviewOnSummaryChange = false;
        }
        if (!this.dontAutopreviewOnSummaryChange) {
          preview();
        }
      })
      .on('change', saveSessionEventHandler);

    this.summaryInput.$input.on('keydown', (e) => {
      // Enter
      if (e.keyCode === 13 && !controller.getActiveAutocompleteMenu()) {
        this.submit();
      }
    });

    this.minorCheckbox
      ?.on('change', saveSessionEventHandler);
    this.watchCheckbox
      .on('change', saveSessionEventHandler);
    this.subscribeCheckbox
      ?.on('change', saveSessionEventHandler);
    this.omitSignatureCheckbox
      ?.on('change', () => {
        this.preview(false);
      })
      .on('change', saveSessionEventHandler);
    this.deleteCheckbox
      ?.on('change', (selected) => {
        this.updateAutoSummary(true, true);
        this.updateFormOnDeleteCheckboxChange(selected);
      })
      .on('change', preview)
      .on('change', saveSessionEventHandler);

    this.advancedButton
      .on('click', () => {
        this.toggleAdvanced();
      });
    this.settingsButton
      .on('click', () => {
        showSettingsDialog();
      });
    this.cancelButton
      .on('click', () => {
        this.cancel();
      });
    this.viewChangesButton
      .on('click', () => {
        this.viewChanges();
      });
    this.previewButton
      .on('click', () => {
        this.preview(true, false);
      });
    this.submitButton
      .on('click', () => {
        this.submit();
      });
  }

  /**
   * Initialize autocomplete using {@link https://github.com/zurb/tribute Tribute}.
   *
   * @private
   */
  initAutocomplete() {
    let commentsInSection = [];
    if (this.targetSection) {
      commentsInSection = this.targetSection.getBase().comments;
    } else if (this.mode !== 'addSection') {
      // Comments in the lead section
      cd.comments.some((comment) => {
        if (comment.section) {
          return true;
        } else {
          commentsInSection.push(comment);
          return false;
        }
      });
    }
    if (this.mode === 'edit') {
      commentsInSection = commentsInSection.filter((comment) => comment !== this.target);
    }

    let pageOwner;
    if (cd.g.NAMESPACE_NUMBER === 3) {
      const userName = (cd.page.title.match(/^([^/]+)/) || [])[0];
      if (userName) {
        pageOwner = userRegistry.get(userName);
      }
    }
    let defaultUserNames = commentsInSection
      .map((comment) => comment.author)
      .concat(pageOwner)
      .filter(defined)
      .sort((u1, u2) => u2.isRegistered() - u1.isRegistered() || (u2.name > u1.name ? -1 : 1))
      .map((u) => u.name);
    if (this.targetComment && this.mode !== 'edit') {
      for (let с = this.targetComment; с; с = с.getParent()) {
        if (с.author !== cd.user) {
          if (!с.author.isRegistered()) break;
          defaultUserNames.unshift(с.author.name);
          break;
        }
      }
    }
    defaultUserNames = defaultUserNames.filter(unique);

    /**
     * Autocomplete object for the comment input.
     *
     * @type {Autocomplete}
     */
    this.autocomplete = new Autocomplete({
      types: ['mentions', 'wikilinks', 'templates', 'tags', 'commentLinks'],
      inputs: [this.commentInput],
      comments: commentsInSection,
      defaultUserNames,
    });

    if (this.headlineInput) {
      /**
       * Autocomplete object for the headline input.
       *
       * @type {Autocomplete|undefined}
       */
      this.headlineAutocomplete = new Autocomplete({
        types: ['mentions', 'wikilinks', 'tags'],
        inputs: [this.headlineInput],
        comments: commentsInSection,
        defaultUserNames,
      });
    }

    /**
     * Autocomplete object for the summary input.
     *
     * @type {Autocomplete}
     */
    this.summaryAutocomplete = new Autocomplete({
      types: ['mentions', 'wikilinks'],
      inputs: [this.summaryInput],
      comments: commentsInSection,
      defaultUserNames,
    });
  }

  /**
   * Show or hide the advanced section.
   *
   * @private
   */
  toggleAdvanced() {
    if (this.$advanced.is(':hidden')) {
      this.$advanced.show();
      const value = this.summaryInput.getValue();
      const match = value.match(/^.+?\*\/ */);
      focusInput(this.summaryInput);
      this.summaryInput.selectRange(match ? match[0].length : 0, value.length);
    } else {
      this.$advanced.hide();
      focusInput(this.commentInput);
    }
  }

  /**
   * Adjust the button labels according to the form width: if the form is to narrow, the labels will
   * shrink.
   */
  adjustLabels() {
    let formWidth = this.$element.width();

    if (this.$element.hasClass('cd-commentForm-short')) {
      if (formWidth >= this.buttonsTotalWidthStandard + 7) {
        this.$element.removeClass('cd-commentForm-short');
        this.submitButton.setLabel(this.submitButtonLabelStandard);
        this.previewButton.setLabel(cd.s('cf-preview'));
        this.viewChangesButton.setLabel(cd.s('cf-viewchanges'));
        this.cancelButton.setLabel(cd.s('cf-cancel'));
      }
    } else {
      this.buttonsTotalWidthStandard = (
        this.submitButton.$element.outerWidth(true) +
        (
          this.previewButton.$element.is(':visible') ?
            this.previewButton.$element.outerWidth(true) :
            0
        ) +
        // Users may hide the view changes button by any kind of a plugin.
        (
          this.viewChangesButton.$element.is(':visible') ?
            this.viewChangesButton.$element.outerWidth(true) :
            0
        ) +
        this.advancedButton.$element.outerWidth(true) +
        this.helpPopupButton.$element.outerWidth(true) +
        this.cancelButton.$element.outerWidth(true)
      );
      if (formWidth < this.buttonsTotalWidthStandard + 7) {
        this.$element.addClass('cd-commentForm-short');
        this.submitButton.setLabel(this.submitButtonLabelShort);
        this.previewButton.setLabel(cd.s('cf-preview-short'));
        this.viewChangesButton.setLabel(cd.s('cf-viewchanges-short'));
        this.cancelButton.setLabel(cd.s('cf-cancel-short'));
      }
    }
  }

  /**
   * Push the pending status of the form inputs.
   *
   * @param {boolean} setDisabled Whether to set the buttons and inputs disabled.
   * @param {boolean} affectHeadline Should the `pushPending` method be applied to the headline
   *   input.
   * @see
   *   https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.mixin.PendingElement-method-pushPending
   */
  pushPending(setDisabled = false, affectHeadline = true) {
    this.commentInput.pushPending();
    this.summaryInput.pushPending();
    if (affectHeadline) {
      this.headlineInput?.pushPending();
    }

    if (setDisabled) {
      this.commentInput.setDisabled(true);
      this.summaryInput.setDisabled(true);
      if (affectHeadline) {
        this.headlineInput?.setDisabled(true);
      }

      this.submitButton.setDisabled(true);
      this.previewButton.setDisabled(true);
      this.viewChangesButton.setDisabled(true);
      this.cancelButton.setDisabled(true);

      this.minorCheckbox?.setDisabled(true);
      this.watchCheckbox.setDisabled(true);
      this.subscribeCheckbox?.setDisabled(true);
      this.omitSignatureCheckbox?.setDisabled(true);
      this.deleteCheckbox?.setDisabled(true);
    }

    if (this.commentInput.isPending()) {
      this.$element.addClass('cd-commentForm-pending');
    }
  }

  /**
   * Pop the pending status of the form inputs.
   *
   * @param {boolean} [setEnabled=false] Whether to set buttons and inputs enabled.
   * @param {boolean} [affectHeadline=true] Should the `popPending` method be applied to the
   *   headline input.
   * @see
   *   https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.mixin.PendingElement-method-popPending
   */
  popPending(setEnabled = false, affectHeadline = true) {
    this.commentInput.popPending();
    this.summaryInput.popPending();
    if (affectHeadline) {
      this.headlineInput?.popPending();
    }

    if (setEnabled) {
      this.commentInput.setDisabled(false);
      this.summaryInput.setDisabled(false);
      if (affectHeadline) {
        this.headlineInput?.setDisabled(false);
      }

      this.submitButton.setDisabled(false);
      this.previewButton.setDisabled(false);
      this.viewChangesButton.setDisabled(false);
      this.cancelButton.setDisabled(false);

      this.minorCheckbox?.setDisabled(false);
      this.watchCheckbox.setDisabled(false);
      this.subscribeCheckbox?.setDisabled(false);
      this.omitSignatureCheckbox?.setDisabled(false);
      this.deleteCheckbox?.setDisabled(false);

      // Restore needed "disabled"s.
      if (this.deleteCheckbox?.isSelected()) {
        this.updateFormOnDeleteCheckboxChange(true);
      }
    }

    if (!this.commentInput.isPending()) {
      this.$element.removeClass('cd-commentForm-pending');
    }
  }

  /**
   * Show a service message above the form.
   *
   * @param {string|JQuery} htmlOrJquery
   * @param {object} [options]
   * @param {string} [options.type='notice'] `'notice'`, `'error'`, `'warning'`, or `'success'`. See
   *   {@link https://doc.wikimedia.org/oojs-ui/master/demos/?page=widgets&theme=wikimediaui&direction=ltr&platform=desktop#MessageWidget-type-notice-inline-true the OOUI Demos}.
   * @param {string} [options.name] Name added to the class name of the message element.
   * @param {boolean} [options.isRaw=false] Message HTML contains the whole message code. It doesn't
   *   need to be wrapped in a widget.
   */
  showMessage(htmlOrJquery, { type = 'notice', name, isRaw = false } = {}) {
    if (this.isDestroyed || (name && this.$messageArea.children(`.cd-message-${name}`).length)) {
      return;
    }

    let appendable;
    if (isRaw) {
      appendable = htmlOrJquery;
    } else {
      const $label = htmlOrJquery instanceof $ ? htmlOrJquery : wrap(htmlOrJquery);
      const classes = ['cd-message'];
      if (name) {
        classes.push(`cd-message-${name}`);
      }
      const message = new OO.ui.MessageWidget({
        type,
        inline: true,
        label: $label,
        classes,
      });
      appendable = message.$element;
    }

    this.$messageArea
      .append(appendable)
      .cdAddCloseButton()
      .cdScrollIntoView('top');
  }

  /**
   * Hide the service message above the form with the provided class.
   *
   * @param {string} name
   */
  hideMessage(name) {
    const $info = this.$messageArea.children(`.cd-message-${name}`);
    if ($info.length) {
      $info.remove();
    }
  }

  /**
   * Abort the operation the form is undergoing and show an error message.
   *
   * @param {object} options
   * @param {string|JQuery} options.message Message visible to the user.
   * @param {string} [options.messageType='error'] Message type if not `'error'` (`'notice'` or
   *   `'warning'`).
   * @param {boolean} [options.isRawMessage=false] Show the message as it is, without icons and
   *   framing.
   * @param {string} [options.logMessage] Message for the browser console.
   * @param {boolean} [options.cancel=false] Cancel the form and show the message as a notification.
   * @param {object} [options.currentOperation] Operation the form is undergoing.
   * @private
   */
  abort({
    message,
    messageType = 'error',
    isRawMessage = false,
    logMessage,
    cancel = false,
    currentOperation,
  }) {
    if (currentOperation) {
      this.closeOperation(currentOperation);
    }

    if (this.isDestroyed) return;

    if (logMessage) {
      console.warn(logMessage);
    }

    if (cancel) {
      notifications.add(message instanceof $ ? message : wrap(message), {
        type: 'error',
        autoHideSeconds: 'long',
      });
      this.cancel(false);
    } else {
      if (!(currentOperation && currentOperation.type === 'preview' && currentOperation.isAuto)) {
        this.showMessage(message, {
          type: messageType,
          isRaw: isRawMessage,
        });
      }
      this.$messageArea.cdScrollIntoView('top');
    }
  }

  /**
   * Abort the operation the form is undergoing and show an appropriate error message. This is a
   * wrapper around {@link CommentForm#abort}.
   *
   * @param {object} options
   * @param {string} options.type Type of the error: `'parse'` for parse errors defined in the
   *   script, `'api'` for MediaWiki API errors, `'network'` for network errors defined in the
   *   script, `'javascript'` for JavaScript errors, `'ui'` for UI errors.
   * @param {string} [options.code] Code of the error. (Either `code`, `apiData`, or `message`
   *   should be specified.)
   * @param {object} [options.details] Additional details about the error.
   * @param {object} [options.apiData] Data object received from the MediaWiki server. (Either
   *   `code`, `apiData`, or `message` should be specified.)
   * @param {string} [options.message] Text of the error. (Either `code`, `apiData`, or `message`
   *   should be specified.)
   * @param {string} [options.messageType='error'] Message type if not `'error'` (`'notice'` or
   *   `'warning'`).
   * @param {string} [options.logMessage] Data or text to display in the browser console.
   * @param {boolean} [options.cancel=false] Cancel the form and show the message as a
   *   notification.
   * @param {boolean} [options.isRawMessage=false] Show the message as it is, without OOUI framing.
   * @param {CommentFormOperation} [options.currentOperation] Operation the form is undergoing.
   */
  handleError({
    type,
    code,
    details,
    apiData,
    message,
    messageType = 'error',
    logMessage,
    cancel = false,
    isRawMessage = false,
    currentOperation,
  }) {
    switch (type) {
      case 'parse': {
        let editUrl;
        switch (code) {
          case 'locateComment':
            if (this.targetSection) {
              editUrl = this.targetSection.editUrl || cd.page.getUrl({ action: 'edit' });
            } else {
              editUrl = cd.page.getUrl({
                action: 'edit',
                section: 0,
              });
            }
            message = cd.sParse('error-locatecomment', editUrl);
            break;
          case 'locateSection':
            editUrl = cd.page.getUrl({ action: 'edit' });
            message = cd.sParse('error-locatesection', editUrl);
            break;
          case 'numberedList':
            message = cd.sParse('cf-error-numberedlist');
            break;
          case 'numberedList-table':
            message = (
              cd.sParse('cf-error-numberedlist') +
              ' ' +
              cd.sParse('cf-error-numberedlist-table')
            );
            break;
          case 'closed':
            message = cd.sParse('cf-error-closed');
            break;
          case 'findPlace':
            message = cd.sParse('cf-error-findplace');
            break;
          case 'delete-repliesToComment':
            message = cd.sParse('cf-error-delete-repliestocomment');
            break;
          case 'delete-repliesInSection':
            message = cd.sParse('cf-error-delete-repliesinsection');
            break;
          case 'commentLinks-commentNotFound':
            message = cd.sParse('cf-error-commentlinks-commentnotfound', details.id);
            break;
        }
        const navigateToEditUrl = async (e) => {
          if (e.ctrlKey || e.shiftKey || e.metaKey) return;
          e.preventDefault();
          if (this.confirmClose()){
            this.forget();
            location.assign(editUrl);
          }
        };
        message = wrap(message, {
          callbacks: {
            'cd-message-reloadPage': async () => {
              if (this.confirmClose()) {
                this.reloadPage();
              }
            },
            'cd-message-editSection': navigateToEditUrl,
            'cd-message-editPage': navigateToEditUrl,
          },
        }).$wrapper;
        break;
      }

      case 'api': {
        // Error messages related to error codes from API should rewrite our generic messages.
        switch (code) {
          case 'missing': {
            message = cd.sParse('cf-error-pagedoesntexist');
            break;
          }

          case 'error': {
            const error = apiData.errors[0];
            switch (error.code) {
              case 'missingtitle':
                message = cd.sParse('cf-error-pagedoesntexist');
                break;
              default:
                message = error.html;
            }
            break;
          }
        }

        message = wrap(message);
        message.find('.mw-parser-output').css('display', 'inline');
        logMessage = logMessage || [code, apiData];
        break;
      }

      case 'network':
      case 'javascript': {
        message = (message ? message + ' ' : '') + cd.sParse(`error-${type}`);
        break;
      }
    }

    this.abort({ message, messageType, isRawMessage, logMessage, cancel, currentOperation });
  }

  /**
   * Convert the text of the comment in the form to wikitext.
   *
   * @param {string} action `'submit'`, `'viewChanges'`, or `'preview'`.
   * @returns {string}
   * @throws {CdError}
   */
  commentTextToCode(action) {
    // Are we at a stage where we better introduce a lexical analyzer (or use MediaWiki's / some
    // part of it)?..

    const parser = new CommentTextParser(this, action);

    /**
     * Will the comment be indented (is a reply or an edited reply).
     *
     * This is mostly to tell if unconverted newlines will cause problems in the comment layout and
     * prevent it. Theoretically, this value can change.
     *
     * @type {boolean|undefined}
     */
    this.willCommentBeIndented = parser.isIndented;

    let code = this.commentInput.getValue();
    if (cd.config.preTransformCode) {
      code = cd.config.preTransformCode(code, this);
    }
    code = parser.parse(code);
    if (cd.config.postTransformCode) {
      code = cd.config.postTransformCode(code, this);
    }

    return code;
  }

  /**
   * Add anchor code to comments linked from the comment.
   *
   * @param {string} wholeCode Code of the section or page.
   * @param {string[]} commentIds
   * @returns {string} New code of the section or page.
   * @throws {CdError}
   * @private
   */
  addAnchorsToComments(wholeCode, commentIds) {
    commentIds.forEach((id) => {
      const comment = Comment.getById(id);
      if (comment) {
        const commentInCode = comment.locateInCode(wholeCode);
        const anchorCode = cd.config.getAnchorCode(id);
        if (commentInCode.code.includes(anchorCode)) return;

        let commentCodePart = CommentTextParser.prototype.prepareLineStart(
          commentInCode.indentationChars,
          commentInCode.code
        );
        const commentTextIndex = commentCodePart.match(/^[:*#]* */)[0].length;
        const codeBefore = commentCodePart.slice(0, commentTextIndex);
        const codeAfter = commentCodePart.slice(commentTextIndex);
        commentCodePart = codeBefore + anchorCode + codeAfter;
        const headingCode = commentInCode.headingCode || '';
        const commentCode = headingCode + commentCodePart + commentInCode.signatureDirtyCode;

        wholeCode = comment.modifyWholeCode({
          action: 'edit',
          commentCode,
          wholeCode,
          thisInCode: commentInCode,
        });
      } else if (!$('#' + id).length) {
        throw new CdError({
          type: 'parse',
          code: 'commentLinks-commentNotFound',
          details: { id },
        });
      }
    });

    return wholeCode;
  }

  /**
   * Prepare the new section or page code based on the comment form input and handle errors.
   *
   * @param {string} action `'submit'` or `'viewChanges'`.
   * @returns {Promise.<object|undefined>}
   * @private
   */
  async prepareWholeCode(action) {
    const commentIds = extractCommentIds(this.commentInput.getValue());

    /**
     * Will we try to submit the section code first instead of the whole page code. (Filled upon
     * submitting or viewing changes.)
     *
     * @type {boolean|undefined}
     */
    this.submitSection = Boolean(
      this.mode === 'addSection' &&
      !this.isNewTopicOnTop &&
      this.headlineInput?.getValue().trim()
    );
    try {
      if (
        this.targetSection &&
        this.targetSection.liveSectionNumber !== null &&
        !commentIds.length
      ) {
        await this.targetSection.getCode(this);
      } else {
        await this.targetPage.getCode(mw.config.get('wgArticleId') === 0);
      }
    } catch (e) {
      if (e instanceof CdError) {
        const options = Object.assign({}, { message: cd.sParse('cf-error-getpagecode') }, e.data);
        this.handleError(options);
      } else {
        this.handleError({
          type: 'javascript',
          logMessage: e,
        });
      }
      return;
    }

    let wholeCode;
    let commentCode;
    try {
      if (
        !(this.target.constructor.name === 'Page') &&

        // We already located the section when got its code.
        !(this.target instanceof Section && this.submitSection)
      ) {
        this.target.locateInCode(this.submitSection);
      }
      if (this.mode === 'replyInSection') {
        this.target.setLastCommentIndentationChars(this);
      }
      commentCode = this.commentTextToCode(action);
      wholeCode = this.target.modifyWholeCode({
        commentCode,
        action: this.mode,
        doDelete: this.deleteCheckbox?.isSelected(),
        commentForm: this,
      });
      wholeCode = this.addAnchorsToComments(wholeCode, commentIds);
    } catch (e) {
      if (e instanceof CdError) {
        this.handleError(e.data);
      } else {
        this.handleError({
          type: 'javascript',
          logMessage: e,
        });
      }
      return;
    }

    return { wholeCode, commentCode };
  }

  /**
   * Add an operation to the registry of operations.
   *
   * @param {string} type
   * @param {object} [options={}]
   * @param {boolean} [clearMessages=true] Whether to clear messages above the comment form.
   * @returns {CommentFormOperation}
   * @private
   */
  registerOperation(type, options = {}, clearMessages = true) {
    const operation = Object.assign(options, { type });
    this.operations.push(operation);
    operation.isClosed = false;
    if (operation.type !== 'preview' || !operation.isAuto) {
      if (clearMessages) {
        this.$messageArea.empty();
      }
      this.pushPending(['load', 'submit'].includes(operation.type), operation.affectHeadline);
    }
    return operation;
  }

  /**
   * Mark an operation as closed if it is not. Should be done when an operation has finished (either
   * successfully or not).
   *
   * @param {CommentFormOperation} operation
   * @private
   */
  closeOperation(operation) {
    if (operation.isClosed) return;
    operation.isClosed = true;
    if (operation.type !== 'preview' || !operation.isAuto) {
      this.popPending(['load', 'submit'].includes(operation.type), operation.affectHeadline);
    }
  }

  /**
   * Check for conflicts of the operation with other pending operations, and if there are such,
   * close the operation and return `true` to abort it. The rules are the following:
   * - `preview` and `viewChanges` operations may be overriden with other of one of these types
   * (every new request replaces the old, although a new autopreview request cannot be made while
   * the old is pending).
   * - `submit` operations may not be overriden (and are not checked by this function), but also
   * don't override existing `preview` and `viewChanges` operations (so that the user gets the last
   * autopreview even after they have sent the comment).
   *
   * For convenience, can also check for an arbitrary condition and close the operation if it is
   * `true`.
   *
   * @param {CommentFormOperation} operation
   * @returns {boolean}
   * @private
   */
  closeOperationIfNecessary(operation) {
    if (operation.isClosed) {
      return true;
    }
    const otherOperationIndex = findLastIndex(
      this.operations,
      (op) => operation !== op && ['preview', 'viewChanges'].includes(op.type) && !op.isDelayed
    );
    if (otherOperationIndex !== null && otherOperationIndex > this.operations.indexOf(operation)) {
      this.closeOperation(operation);
      return true;
    } else {
      return false;
    }
  }

  /**
   * Remove the operation from the registry of operations.
   *
   * @param {CommentFormOperation} operation
   * @private
   */
  unregisterOperation(operation) {
    removeFromArrayIfPresent(this.operations, operation);

    // This was excessive at the time when it was written as the only use case is autopreview.
    if (operation.type !== 'preview' || !operation.isAuto) {
      this.popPending(operation.type === 'submit', operation.affectHeadline);
    }
  }

  /**
   * Check if the form is being submitted right now.
   *
   * @returns {boolean}
   */
  isBeingSubmitted() {
    return (
      this.operations.some((op) => op.type === 'submit' && !op.isClosed) ||
      this.areChecksRunning
    );
  }

  /**
   * Check if the content of the form is being loaded right now.
   *
   * @returns {boolean}
   */
  isContentBeingLoaded() {
    return this.operations.some((op) => op.type === 'load' && !op.isClosed);
  }

  /**
   * Preview the comment.
   *
   * @param {boolean} [previewEmpty=true] If `false`, don't preview if the comment and headline
   *   inputs are empty.
   * @param {boolean} [isAuto=true] Preview is initiated automatically (if the user has
   *   `settings.get('autopreview')` as `true`).
   * @param {CommentFormOperation} [operation] Operation object when the function is called from
   *   within itself, being delayed.
   * @fires previewReady
   */
  async preview(previewEmpty = true, isAuto = true, operation) {
    if (
      this.isContentBeingLoaded() ||
      (
        !(this.target.constructor.name === 'Page') &&
        !this.target.inCode &&
        this.checkCodeRequest &&
        (await getNativePromiseState(this.checkCodeRequest)) === 'resolved'
      ) ||
      this.isBeingSubmitted() ||
      (isAuto && !settings.get('autopreview'))
    ) {
      if (operation) {
        this.closeOperation(operation);
      }
      return;
    }

    const currentOperation = operation || this.registerOperation('preview', { isAuto });

    if (isAuto) {
      const isTooEarly = Date.now() - this.lastPreviewTimestamp < 1000;
      if (
        isTooEarly ||
        this.operations
          .some((op) => !op.isClosed && op.type === 'preview' && op !== currentOperation)
      ) {
        if (this.previewTimeout) {
          this.unregisterOperation(currentOperation);
        } else {
          currentOperation.isDelayed = true;
          this.previewTimeout = setTimeout(() => {
            this.previewTimeout = null;
            this.preview(previewEmpty, true, currentOperation);
          }, isTooEarly ? 1000 - (Date.now() - this.lastPreviewTimestamp) : 100);
        }
        return;
      }
      this.lastPreviewTimestamp = Date.now();
    }

    if (this.closeOperationIfNecessary(currentOperation)) return;

    /*
      This happens:
      - when restoring the form from a session,
      - when the target comment has not been loaded yet, possibly because of an error when tried to
      (if the mode is 'edit' and the comment has not been loaded, this method would halt after the
      looking for the unclosed 'load' operation above).
     */
    if (!(this.target.constructor.name === 'Page') && !this.target.inCode) {
      await this.checkCode();
      if (!this.target.inCode) {
        this.closeOperation(currentOperation);
      }
      if (currentOperation.isClosed) return;
    }

    // In case of an empty comment input, we in fact make this request for the sake of parsing the
    // summary if there is a need. The other possibility is previewing by clicking the relevant
    // button.
    const areInputsEmpty = (
      !this.commentInput.getValue().trim() &&
      !this.headlineInput?.getValue().trim()
    );

    if (areInputsEmpty && !previewEmpty) {
      this.closeOperation(currentOperation);
      return;
    }

    const commentCode = this.commentTextToCode('preview');
    let html;
    let parsedSummary;
    try {
      ({ html, parsedSummary } = await parseCode(commentCode, {
        title: this.targetPage.name,
        summary: buildEditSummary({ text: this.summaryInput.getValue() }),
      }));
    } catch (e) {
      if (e instanceof CdError) {
        const options = Object.assign({}, e.data, {
          message: cd.sParse('cf-error-preview'),
          currentOperation,
        });
        this.handleError(options);
      } else {
        this.handleError({
          type: 'javascript',
          logMessage: e,
          currentOperation,
        });
      }
      return;
    }

    if (this.closeOperationIfNecessary(currentOperation)) return;

    if (html) {
      if ((isAuto && areInputsEmpty) || this.deleteCheckbox?.isSelected()) {
        this.$previewArea.empty();
      } else {
        const $label = $('<div>')
          .addClass('cd-previewArea-label')
          .text(cd.s('cf-block-preview'));
        this.$previewArea
          .html(html)
          .prepend($label)
          .cdAddCloseButton();
        this.$previewArea.toggleClass('cd-previewArea-indentedComment', this.willCommentBeIndented);

        /**
         * A comment preview has been rendered.
         *
         * @event previewReady
         * @param {external:jQuery} $previewArea {@link CommentForm#$previewArea} object.
         * @param {object} cd {@link convenientDiscussions} object.
         */
        mw.hook('convenientDiscussions.previewReady').fire(this.$previewArea, cd);

        if (!isAuto) {
          mw.hook('wikipage.content').fire(this.$previewArea);
        }
      }

      const $comment = $('<span>')
        .addClass('comment')
        .append(parsedSummary);
      this.$summaryPreview.empty();
      if (parsedSummary) {
        const $colon = $('<span>').text(cd.mws('colon-separator'));
        const $previewLabel = $('<span>').text(cd.s('cf-summary-preview'));
        this.$summaryPreview.append($previewLabel, $colon, $comment);
      }
    }

    if (settings.get('autopreview') && this.previewButton.$element.is(':visible')) {
      this.previewButton.$element.hide();
      this.viewChangesButton.$element.show();
      this.adjustLabels();
    }

    this.closeOperation(currentOperation);

    if (!isAuto) {
      const position = this.$previewArea.hasClass('cd-previewArea-above') ? 'top' : 'bottom';
      this.$previewArea.cdScrollIntoView(position);
      focusInput(this.commentInput);
    }
  }

  /**
   * View changes in the page code after submitting the form.
   */
  async viewChanges() {
    if (this.isBeingSubmitted()) return;

    const currentOperation = this.registerOperation('viewChanges');

    const { wholeCode: code } = await this.prepareWholeCode('viewChanges') || {};
    if (code === undefined) {
      this.closeOperation(currentOperation);
    }
    if (currentOperation.isClosed) return;

    mw.loader.load('mediawiki.diff.styles');

    let resp;
    try {
      const options = {
        action: 'compare',
        totitle: this.targetPage.name,
        toslots: 'main',
        'totext-main': code,
        topst: true,
        prop: 'diff',
        errorformat: 'html',
        errorlang: cd.g.USER_LANGUAGE,
        errorsuselocal: true,
      };
      if (this.submitSection || !mw.config.get('wgArticleId')) {
        options.fromslots = 'main';
        options['fromtext-main'] = this.mode === 'addSection' ? '' : this.targetSection.code;
      } else {
        options.fromrev = this.targetPage.revisionId;
      }
      resp = await controller.getApi().post(options, {
        // Beneficial when sending long unicode texts, which is what we do here.
        contentType: 'multipart/form-data',
      }).catch(handleApiReject);
    } catch (e) {
      if (e instanceof CdError) {
        const options = Object.assign({}, e.data, {
          message: cd.sParse('cf-error-viewchanges'),
          currentOperation,
        });
        this.handleError(options);
      } else {
        this.handleError({
          type: 'javascript',
          logMessage: e,
          currentOperation,
        });
      }
      return;
    }

    if (this.closeOperationIfNecessary(currentOperation)) return;

    let html = resp.compare?.body;
    if (html) {
      html = wrapDiffBody(html);
      const $label = $('<div>')
        .addClass('cd-previewArea-label')
        .text(cd.s('cf-block-viewchanges'));
      this.$previewArea
        .html(html)
        .prepend($label)
        .cdAddCloseButton();
    } else {
      this.$previewArea.empty();
      if (html !== undefined) {
        this.showMessage(cd.sParse('cf-notice-nochanges'));
      }
    }

    if (settings.get('autopreview')) {
      this.viewChangesButton.$element.hide();
      this.previewButton.$element.show();
      this.adjustLabels();
    }

    this.closeOperation(currentOperation);

    const position = this.$previewArea.hasClass('cd-previewArea-above') ? 'top' : 'bottom';
    this.$previewArea.cdScrollIntoView(position);
    focusInput(this.commentInput);
  }

  /**
   * Forget the form and reload the page.
   *
   * @param {object} [passedData] Data passed from the previous page state.
   * @param {CommentFormOperation} [currentOperation] Current operation.
   */
  async reloadPage(passedData, currentOperation) {
    this.forget();

    try {
      await controller.reload(passedData);
    } catch (e) {
      if (e instanceof CdError) {
        const options = Object.assign({}, e.data, {
          message: cd.sParse('error-reloadpage-saved'),
          cancel: true,
          currentOperation,
        });
        this.handleError(options);
      } else {
        this.handleError({
          type: 'javascript',
          logMessage: e,
          cancel: true,
          currentOperation,
        });
      }
      controller.bootProcess.finish();
    }
  }

  /**
   * Check the form content for several conditions before submitting the form. Ask the user to
   * confirm submitting if one of the conditions is met.
   *
   * @param {object} options
   * @param {boolean} options.doDelete
   * @returns {Promise.<boolean>}
   * @private
   */
  runChecks({ doDelete }) {
    const checks = [
      {
        condition: !doDelete && this.headlineInput?.getValue() === '',
        confirmation: () => {
          const ending = this.headlineInputPlaceholder === cd.s('cf-headline-topic') ?
            'topic' :
            'subsection';
          return confirm(
            cd.s(`cf-confirm-noheadline-${ending}`) +
            ' ' +
            cd.s('cf-confirm-noheadline-question')
          );
        },
      },
      {
        condition: (
          !doDelete &&
          !this.commentInput.getValue().trim() &&
          !cd.config.noConfirmPostEmptyCommentPageRegexp?.test(cd.page.name)
        ),
        confirmation: () => confirm(cd.s('cf-confirm-empty')),
      },
      {
        condition: (
          !doDelete &&
          this.commentInput.getValue().trim().length > cd.config.longCommentThreshold
        ),
        confirmation: () => confirm(cd.s('cf-confirm-long', cd.config.longCommentThreshold)),
      },
      {
        condition: (
          !doDelete &&
          /^==[^=]/m.test(this.commentInput.getValue()) &&
          this.mode !== 'edit' &&
          !this.preloadConfig?.commentTemplate
        ),
        confirmation: () => confirm(cd.s('cf-confirm-secondlevelheading')),
      },
      {
        condition: doDelete,
        confirmation: () => confirm(cd.s('cf-confirm-delete')),
      }
    ];

    for (const check of checks) {
      if (check.condition && !check.confirmation()) {
        focusInput(this.commentInput);
        return false;
      }
    }

    return true;
  }

  /**
   * Send a post request to edit the page and handle errors.
   *
   * @param {string} code
   * @param {CommentFormOperation} currentOperation
   * @returns {Promise.<object|null>}
   * @private
   */
  async editPage(code, currentOperation) {
    let result;
    try {
      let sectionParam;
      let sectionOrPage;
      let sectionTitleParam;
      if (this.submitSection) {
        if (this.mode === 'addSection') {
          sectionTitleParam = this.headlineInput.getValue().trim();
          sectionParam = 'new';
        } else {
          sectionParam = this.targetSection.liveSectionNumber;
        }
        sectionOrPage = this.targetSection;
      } else {
        sectionOrPage = this.targetPage;
      }
      result = await this.targetPage.edit({
        section: sectionParam,
        sectiontitle: sectionTitleParam,
        text: code,
        summary: buildEditSummary({ text: this.summaryInput.getValue() }),
        minor: this.minorCheckbox?.isSelected(),
        baserevid: sectionOrPage?.revisionId,
        starttimestamp: sectionOrPage?.queryTimestamp,
        watchlist: this.watchCheckbox.isSelected() ? 'watch' : 'unwatch',
      });
    } catch (e) {
      if (e instanceof CdError) {
        const { type, details } = e.data;
        if (type === 'network') {
          this.handleError({
            type,
            message: cd.sParse('cf-error-couldntedit'),
            currentOperation,
          });
        } else {
          let messageType;
          let { code, message, isRawMessage, logMessage } = details;
          if (code === 'editconflict') {
            message += ' ' + cd.sParse('cf-notice-editconflict-retrying');
            messageType = 'notice';
          }

          // FIXME: We don't pass apiData to prevent the message for "missingtitle" to be overriden,
          // which is hacky.
          this.handleError({
            type,
            message,
            messageType,
            isRawMessage,
            logMessage,
            currentOperation,
          });

          if (code === 'editconflict') {
            this.submit(true);
          }
        }
      } else {
        this.handleError({
          type: 'javascript',
          logMessage: e,
          currentOperation,
        });
      }
      return null;
    }

    return result;
  }

  /**
   * Subscribe and unsubscribe from topics
   *
   * @param {string} editTimestamp
   * @param {string} commentCode
   * @param {object} passedData
   */
  updateSubscriptionStatus(editTimestamp, commentCode, passedData) {
    if (this.subscribeCheckbox.isSelected()) {
      // Add the created section to the subscription list or change the headline for legacy
      // subscriptions.
      if (
        this.mode === 'addSection' ||
        (
          !settings.get('useTopicSubscription') &&
          (this.mode === 'addSubsection' || this.isSectionOpeningCommentEdited)
        )
      ) {
        let subscribeId;
        let originalHeadline;
        let isHeadlineAltered;
        if (settings.get('useTopicSubscription')) {
          subscribeId = Section.generateDtSubscriptionId(cd.user.name, editTimestamp);
        } else {
          let rawHeadline;
          if (this.headlineInput) {
            rawHeadline = this.headlineInput.getValue().trim();
          }
          if (!this.isSectionOpeningCommentEdited && !rawHeadline) {
            [, rawHeadline] = commentCode.match(/^==(.*?)==[ \t]*$/m) || [];
          }
          subscribeId = rawHeadline && removeWikiMarkup(rawHeadline);
          if (this.isSectionOpeningCommentEdited) {
            originalHeadline = removeWikiMarkup(this.originalHeadline);
            isHeadlineAltered = subscribeId !== originalHeadline;
          }
        }

        if (subscribeId !== undefined) {
          passedData.justSubscribedToSection = subscribeId;
          if (isHeadlineAltered) {
            passedData.justUnsubscribedFromSection = originalHeadline;
          }
          subscriptions.subscribe(subscribeId, originalHeadline);
        }
      } else {
        const section = this.targetSection;
        if (section && !section.subscriptionState) {
          section.subscribe(true);
          passedData.justSubscribedToSection = section.subscribeId;
        }
      }
    } else {
      const section = this.targetSection;
      if (section?.subscriptionState) {
        section.unsubscribe(true);
        passedData.justUnsubscribedFromSection = section.subscribeId;
      }
    }
  }

  /**
   * Generate a comment ID to jump to after the page is reloaded, taking possible collisions into
   * account.
   *
   * @param {string} editTimestamp
   * @returns {string}
   */
  generateFutureCommentId(editTimestamp) {
    const date = new Date(editTimestamp);

    // Timestamps on the page (and therefore anchors) have no seconds.
    date.setSeconds(0);

    let commentAbove;
    if (this.target instanceof Comment) {
      const descendants = this.target.getChildren(true);
      commentAbove = descendants[descendants.length - 1] || this.target;
    } else if (this.target instanceof Section) {
      const sectionAbove = (
        (this.mode === 'addSubsection' && this.target.getChildren(true).slice(-1)[0]) ||
        this.target
      );
      cd.sections
        .slice(0, sectionAbove.index + 1)
        .reverse()
        .some((section) => {
          if (section.commentsInFirstChunk.length) {
            commentAbove = section.commentsInFirstChunk[section.commentsInFirstChunk.length - 1];
          }
          return commentAbove;
        });
    } else {
      commentAbove = this.isNewTopicOnTop ? null : cd.comments[cd.comments.length - 1];
    }

    const existingIds = cd.comments
      .slice(0, commentAbove ? commentAbove.index + 1 : 0)
      .filter((comment) => (
        comment.author === cd.user &&
        comment.date?.getTime() === date.getTime()
      ))
      .map((comment) => comment.id);

    return Comment.generateId(date, cd.user.name, existingIds);
  }

  /**
   * Submit the form.
   *
   * @param {boolean} [afterEditConflict=false]
   */
  async submit(afterEditConflict = false) {
    if (this.isBeingSubmitted() || this.isContentBeingLoaded()) return;

    this.areChecksRunning = true;
    const doDelete = this.deleteCheckbox?.isSelected();
    if (!this.runChecks({ doDelete })) {
      setTimeout(() => {
        // If Ctrl+Enter is pressed when the caret in the headline or summary input, then without
        // setTimeout, the check would run twice.
        this.areChecksRunning = false;
      });
      return;
    }

    const currentOperation = this.registerOperation('submit', undefined, !afterEditConflict);

    const otherFormsSubmitted = cd.commentForms
      .some((commentForm) => commentForm !== this && commentForm.isBeingSubmitted());
    if (otherFormsSubmitted) {
      this.handleError({
        type: 'ui',
        message: cd.sParse('cf-error-othersubmitted'),
        currentOperation,
      });
      return;
    }

    const {
      wholeCode: code,
      commentCode,
    } = await this.prepareWholeCode('submit') || {};
    if (code === undefined) {
      this.closeOperation(currentOperation);
      return;
    }

    const editTimestamp = await this.editPage(code, currentOperation);

    // The operation is closed inside CommentForm#editPage.
    if (!editTimestamp) return;

    // Here we use a trick where we pass, in passedData, the name of the section that was set to be
    // watched/unwatched using a checkbox in a form just sent. The server doesn't manage to update
    // the value quickly enough, so it returns the old value, but we must display the new one.
    const passedData = { wasCommentFormSubmitted: true };

    // When creating a page
    if (!mw.config.get('wgArticleId')) {
      mw.config.set('wgArticleId', this.targetPage.pageId);
      passedData.wasPageCreated = true;
    }

    if (this.subscribeCheckbox && editTimestamp !== 'nochange') {
      this.updateSubscriptionStatus(editTimestamp, commentCode, passedData);
    }

    if (this.watchCheckbox.isSelected() && $('#ca-watch').length) {
      $('#ca-watch')
        .attr('id', 'ca-unwatch')
        .find('a')
        .attr('href', cd.page.getUrl({ action: 'unwatch' }));
    }
    if (!this.watchCheckbox.isSelected() && $('#ca-unwatch').length) {
      $('#ca-unwatch')
        .attr('id', 'ca-watch')
        .find('a')
        .attr('href', cd.page.getUrl({ action: 'watch' }));
    }

    if (!doDelete) {
    // Generate an ID for the comment to jump to.
      passedData.commentId = this.mode === 'edit' ?
        this.target.id :
        this.generateFutureCommentId(editTimestamp);
    }

    // When the edit takes place on another page that is transcluded in the current one, we must
    // purge the current page, otherwise we may get an old version without the submitted comment.
    if (this.targetPage !== cd.page) {
      await cd.page.purge();
    }

    this.reloadPage(passedData, currentOperation);
  }

  /**
   * Ask for a confirmation to close the form if necessary.
   *
   * @returns {boolean}
   */
  confirmClose() {
    return !this.isAltered() || confirm(cd.s('cf-confirm-close'));
  }

  /**
   * Close the form.
   *
   * @param {boolean} [confirmClose=true] Whether to confirm form close.
   */
  async cancel(confirmClose = true) {
    if (controller.isPageOverlayOn() || this.isBeingSubmitted()) return;

    if (confirmClose && !this.confirmClose()) {
      focusInput(this.commentInput);
      return;
    }

    this.destroy();

    if (this.mode === 'reply') {
      this.target.scrollIntoView('top');
    } else if (this.mode === 'replyInSection') {
      this.target.replyButton.show();
      this.target.$replyWrapper.removeClass('cd-replyWrapper-hasCommentForm');
    } else if (this.mode === 'edit') {
      this.target.$elements.removeClass('cd-hidden');
      this.target.scrollIntoView('top');
      this.target.configureLayers();
    } else if (this.mode === 'addSection' && controller.$addSectionButtonContainer) {
      controller.$addSectionButtonContainer.show();
    }
  }

  /**
   * Remove the elements and other objects' properties related to the form.
   */
  destroy() {
    if (this.mode === 'reply') {
      this.target.subitemList.remove('replyForm');
    } else {
      this.$outermostElement.remove();
      if (this.mode === 'addSection') {
        if (!mw.config.get('wgArticleId')) {
          controller.$content
            // In case DT's new topic tool is enabled. This should be above .show() so that .show()
            // did set correct styles.
            .removeClass('ext-discussiontools-init-replylink-open')

            .children('.noarticletext, .warningbox')
            .show();
        }
      }
    }

    this.operations
      .filter((op) => !op.isClosed)
      .forEach(this.closeOperation.bind(this));
    this.forget();

    /**
     * Has the comment form been {@link CommentForm#destroy destroyed}.
     *
     * @type {boolean}
     */
    this.isDestroyed = true;
  }

  /**
   * Remove all references to the form and unload it from the session data thus making it not appear
   * after a page reload.
   *
   * @private
   */
  forget() {
    if (this.mode === 'addSection') {
      controller.forgetAddSectionForm();

      $('#ca-addsection').removeClass('selected');
      $('#ca-view').addClass('selected');
    } else {
      delete this.target[CommentForm.modeToProperty(this.mode) + 'Form'];
    }
    removeFromArrayIfPresent(cd.commentForms, this);
    sessions.save(true);
    navPanel.updateCommentFormButton();
    this.autocomplete.cleanUp();
  }

  /**
   * Check if the form was altered. This means the values of the text fields (but not the state of
   * checkboxes) are different from initial.
   *
   * @returns {boolean}
   */
  isAltered() {
    // In case of the comment being edited some properties would be undefined if its code was not
    // located in the source.
    return (
      (
        this.originalComment !== undefined &&
        this.originalComment !== this.commentInput.getValue()
      ) ||
      this.autoSummary !== this.summaryInput.getValue() ||
      (
        this.headlineInput &&
        this.originalHeadline !== undefined &&
        this.originalHeadline !== this.headlineInput.getValue()
      )
    );
  }

  /**
   * Update the automatic text for the edit summary.
   *
   * @param {boolean} [set=true] Whether to actually set the input value, or just save auto summary
   *   to a property.
   * @param {boolean} [dontAutopreviewOnSummaryChange=false] Whether to prevent making autopreview
   *   request in order not to make two identical requests (for example, if the update is initiated
   *   by a change in the comment).
   * @private
   */
  updateAutoSummary(set = true, dontAutopreviewOnSummaryChange = false) {
    if (this.isSummaryAltered) return;

    this.dontAutopreviewOnSummaryChange = dontAutopreviewOnSummaryChange;

    const text = this.autoText();
    const section = this.headlineInput && this.mode !== 'addSubsection' ?
      removeWikiMarkup(this.headlineInput.getValue()) :
      this.sectionHeadline;

    let optionalText;
    if (['reply', 'replyInSection'].includes(this.mode)) {
      const commentText = this.commentInput.getValue()
        .trim()
        .replace(/\s+/g, ' ')

        // Remove user links to prevent sending a double notification.
        .replace(/\[\[:?(?:([^|[\]<>\n]+)\|)?(.+?)\]\]/g, (s, wikilink, text) => (
          cd.g.USER_LINK_REGEXP.test(wikilink) ? text : s
        ));
      if (commentText && commentText.length <= cd.config.summaryCommentTextLengthLimit) {
        optionalText = `: ${commentText} (-)`;
      }
    } else if (this.mode === 'addSubsection') {
      const subsection = removeWikiMarkup(this.headlineInput.getValue());
      if (subsection) {
        optionalText = `: /* ${subsection} */`;
      }
    }

    this.autoSummary = buildEditSummary({
      text,
      section,
      optionalText,
      addPostfix: false,
    });
    if (set) {
      this.summaryInput.setValue(this.autoSummary);
    }
  }

  /**
   * Generate the _static_ part of the automatic text for the edit summary, excluding the section
   * headline.
   *
   * @returns {string}
   * @private
   */
  autoText() {
    this.updateAutoSummaryBound = this.updateAutoSummaryBound || this.updateAutoSummary.bind(this);

    switch (this.mode) {
      case 'reply': {
        if (this.target.isOpeningSection) {
          return cd.s('es-reply');
        } else {
          this.target.requestAuthorGenderIfNeeded(this.updateAutoSummaryBound);
          return this.target.isOwn ?
            cd.s('es-addition') :
            removeDoubleSpaces(cd.s('es-reply-to', this.target.author.name, this.target.author));
        }
      }

      case 'edit': {
        // The codes for generating "edit" and "delete" descriptions are equivalent, so we provide
        // an umbrella function.
        const editOrDeleteText = (action) => {
          let subject;
          let target = this.target;
          if (this.target.isOwn) {
            const targetParent = this.target.getParent();
            if (targetParent) {
              if (targetParent.level === 0) {
                subject = 'reply';
              } else {
                targetParent.requestAuthorGenderIfNeeded(this.updateAutoSummaryBound);
                subject = targetParent.isOwn ? 'addition' : 'reply-to';
                target = targetParent;
              }
            } else {
              if (this.target.isOpeningSection) {
                subject = this.targetSection.getParent() ? 'subsection' : 'topic';
              } else {
                subject = 'comment';
              }
            }
          } else {
            if (this.target.isOpeningSection) {
              subject = this.targetSection.getParent() ? 'subsection' : 'topic';
            } else {
              this.target.requestAuthorGenderIfNeeded(this.updateAutoSummaryBound);
              subject = 'comment-by';
            }
          }
          return removeDoubleSpaces(
            cd.s(`es-${action}-${subject}`, target.author.name, target.author)
          );
        };

        return editOrDeleteText(this.deleteCheckbox?.isSelected() ? 'delete' : 'edit');
      }

      case 'replyInSection': {
        return cd.s('es-reply');
      }

      case 'addSection': {
        return this.preloadConfig?.summary || cd.s('es-new-topic');
      }

      case 'addSubsection': {
        return cd.s('es-new-subsection');
      }
    }
  }

  /**
   * Handle the delete checkbox change, setting form elements as disabled or enabled.
   *
   * @param {boolean} selected
   * @private
   */
  updateFormOnDeleteCheckboxChange(selected) {
    if (selected) {
      this.initialMinorCheckboxSelected = this.minorCheckbox.isSelected();
      this.minorCheckbox.setSelected(false);

      this.commentInput.setDisabled(true);
      this.headlineInput?.setDisabled(true);
      this.minorCheckbox.setDisabled(true);
      this.omitSignatureCheckbox?.setDisabled(true);

      this.submitButtonLabelStandard = cd.s('cf-delete-button');
      this.submitButtonLabelShort = cd.s('cf-delete-button-short');
      this.submitButton
        .clearFlags()
        .setFlags(['destructive', 'primary'])
        .setLabel(
          this.$element.hasClass('cd-commentForm-short') ?
            this.submitButtonLabelStandard :
            this.submitButtonLabelShort
        );
    } else {
      this.minorCheckbox.setSelected(this.initialMinorCheckboxSelected);

      this.commentInput.setDisabled(false);
      this.headlineInput?.setDisabled(false);
      this.minorCheckbox.setDisabled(false);
      this.omitSignatureCheckbox?.setDisabled(false);

      this.submitButtonLabelStandard = cd.s('cf-save');
      this.submitButtonLabelShort = cd.s('cf-save-short');
      this.submitButton
        .clearFlags()
        .setFlags(['progressive', 'primary'])
        .setLabel(
          this.$element.hasClass('cd-commentForm-short') ?
            this.submitButtonLabelStandard :
            this.submitButtonLabelShort
        );
    }
  }

  /**
   * Insert the contents of `cd.config.mentionCharacter` (usually `@`) into the comment input,
   * activating the mention autocomplete menu.
   *
   * @param {boolean} mentionAddressee Don't show the autocomplete menu, just insert a mention of
   *   the addressee to the beginning of the comment input.
   */
  mention(mentionAddressee) {
    if (mentionAddressee && this.targetComment) {
      let data = Autocomplete.getConfig('mentions').transform(this.targetComment.author.name);
      data = data.ctrlModify(data);
      const text = data.start + data.content + data.end;
      const range = this.commentInput.getRange();
      this.commentInput.selectRange(0);
      insertText(this.commentInput, text);
      this.commentInput.selectRange(range.from + text.length, range.to + text.length);
      return;
    }

    const caretIndex = this.commentInput.getRange().to;

    // Prevent removal of text
    if (this.commentInput.getRange().from !== caretIndex) {
      this.commentInput.selectRange(caretIndex);
    }

    const lastChar = caretIndex && this.commentInput.getValue().substr(caretIndex - 1, 1);
    if (caretIndex && !/\s/.test(lastChar)) {
      insertText(this.commentInput, ' ');
    }

    this.autocomplete.tribute.showMenuForCollection(
      this.commentInput.$input.get(0),
      this.autocomplete.tribute.collection
        .findIndex((collection) => collection.trigger === cd.config.mentionCharacter)
    );
  }

  /**
   * Quote the selected text.
   *
   * @param {boolean} [allowEmptySelection=true] Insert markup (with a placeholder text) even if the
   *   selection is empty.
   */
  async quote(allowEmptySelection = true) {
    let selectionText;
    if (isInputFocused()) {
      selectionText = document.activeElement.value
        .substring(document.activeElement.selectionStart, document.activeElement.selectionEnd);
    } else {
      selectionText = await controller.getWikitextFromSelection(this.commentInput);
    }
    selectionText = selectionText.trim();

    // With just "Q" pressed, empty selection doesn't count.
    if (selectionText || allowEmptySelection) {
      const isCommentInputFocused = this.commentInput.$input.is(':focus');
      const range = this.commentInput.getRange();
      const caretIndex = range.to;
      let rangeStart = Math.min(range.to, range.from);
      let rangeEnd = Math.max(range.to, range.from);

      // Reset the selection if the input is not focused to prevent losing text.
      if (!isCommentInputFocused && rangeStart !== rangeEnd) {
        this.commentInput.selectRange(caretIndex);
        rangeStart = rangeEnd = caretIndex;
      }

      let quoteFormatting = cd.config.quoteFormatting;
      if ($.isPlainObject(quoteFormatting)) {
        quoteFormatting = selectionText.includes('\n') ?
          quoteFormatting.multiline || quoteFormatting.singleline :
          quoteFormatting.singleline || quoteFormatting.multiline;
      }
      const [pre, post] = quoteFormatting;

      this.encapsulateSelection({
        pre,
        peri: cd.s('cf-quote-placeholder'),
        post,
        selection: selectionText,
        ownline: true,
      });
    }
  }

  /**
   * Wrap the selected text in the comment input with other text, optionally falling back to the
   * provided value if no text is selected.
   *
   * @param {object} options
   * @param {string} [options.pre=''] Text to insert before the caret/selection.
   * @param {string} [options.peri=''] Fallback value used instead of a selection and selected
   *   afterwards.
   * @param {string} [options.post=''] Text to insert after the caret/selection.
   * @param {string} [options.replace=false] If there is a selection, replace it with pre, peri,
   *   post instead of leaving it alone.
   * @param {string} [options.selection] Selected text. Use if the selection is outside of the
   *   input.
   * @param {boolean} [options.ownline=false] Put the inserted text on a line of its own.
   */
  encapsulateSelection({
    pre = '',
    peri = '',
    post = '',
    selection,
    replace = false,
    ownline = false,
  }) {
    const range = this.commentInput.getRange();
    const selectionStartPos = Math.min(range.from, range.to);
    const selectionEndPos = Math.max(range.from, range.to);
    const value = this.commentInput.getValue();
    const addLeadingNewLine = (
      ownline &&
      !/(^|\n)$/.test(value.slice(0, selectionStartPos)) &&
      !/^\n/.test(peri)
    );
    const leadingNewline = addLeadingNewLine ? '\n' : '';
    const addTrailingNewLine = (
      ownline &&
      !/^\n/.test(value.slice(selectionEndPos)) &&
      !/\n$/.test(post)
    );
    const trailingNewline = addTrailingNewLine ? '\n' : '';
    let periStartPos;
    if (!selection && !replace) {
      periStartPos = selectionStartPos + leadingNewline.length + pre.length;
      selection = value.substring(range.from, range.to);
    } else {
      selection = selection || '';
    }

    // Wrap the text moving the leading and trailing spaces to the sides of the resulting text.
    const [leadingSpace] = selection.match(/^ */);
    const [trailingSpace] = selection.match(/ *$/);
    const middleText = selection || peri;
    const text = (
      leadingNewline +
      leadingSpace +
      pre +
      middleText.slice(leadingSpace.length, middleText.length - trailingSpace.length) +
      post +
      trailingSpace +
      trailingNewline
    );

    insertText(this.commentInput, text);
    if (!selection && !replace) {
      this.commentInput.selectRange(periStartPos, periStartPos + peri.length);
    }
  }
}

Object.assign(CommentForm, CommentFormStatic);

export default CommentForm;
