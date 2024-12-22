import Autocomplete from './Autocomplete';
import Button from './Button';
import CdError from './CdError';
import Comment from './Comment';
import CommentFormInputTransformer from './CommentFormInputTransformer';
import CommentFormOperationRegistry from './CommentFormOperationRegistry';
import Parser from './Parser';
import TextMasker from './TextMasker';
import cd from './cd';
import commentFormRegistry from './commentFormRegistry';
import commentRegistry from './commentRegistry';
import controller from './controller';
import notifications from './notifications';
import pageRegistry from './pageRegistry';
import sectionRegistry from './sectionRegistry';
import settings from './settings';
import userRegistry from './userRegistry';
import { handleApiReject, parseCode } from './utils-api';
import { buildEditSummary, defined, getDayTimestamp, removeDoubleSpaces, sleep, unique } from './utils-general';
import { createCheckboxField } from './utils-oojs';
import { escapePipesOutsideLinks, generateTagsRegexp, removeWikiMarkup } from './utils-wikitext';
import { isCmdModifierPressed, isExistentAnchor, isHtmlConvertibleToWikitext, isInputFocused, keyCombination, wrapDiffBody, wrapHtml } from './utils-window';

/**
 * @typedef {'reply'|'replyInSection'|'edit'|'addSubsection'|'addSection'} CommentFormMode
 */

/**
 * Class representing a comment form.
 *
 * @template {CommentFormMode} Mode
 */
class CommentForm {
  /**
   * Target object.
   *
   * @type {CommentFormTarget}
   * @private
   */
  target;

  /**
   * Target section.
   *
   * @type {CommentFormTargetSection}
   * @private
   */
  targetSection;

  /**
   * Wiki page that has the source code of the target object (may be different from the current
   * page if the section is transcluded from another page).
   *
   * @type {import('./pageRegistry').Page}
   * @private
   */
  targetPage;

  /**
   * Parent comment. This is the comment the user replies to, if any, or the comment opening the
   * section.
   *
   * @type {?Comment}
   * @private
   */
  parentComment;

  /**
   * The main form element.
   *
   * @type {JQuery}
   */
  $element;

  /**
   * Headline input.
   *
   * @type {OO.ui.TextInputWidget|undefined}
   */
  headlineInput;

  /**
   * Comment input.
   *
   * @type {import('./MultilineTextInputWidget').default}
   */
  commentInput;

  /**
   * Edit summary input.
   *
   * @type {OO.ui.TextInputWidget}
   */
  summaryInput;

  /**
   * Minor change checkbox field.
   *
   * @type {OO.ui.FieldLayout|undefined}
   * @memberof CommentForm
   * @instance
   */
  minorField;

  /**
   * Minor change checkbox.
   *
   * @type {import('./CheckboxInputWidget').default|undefined}
   * @memberof CommentForm
   * @instance
   */
  minorCheckbox;

  /**
   * Watch page checkbox field.
   *
   * @type {OO.ui.FieldLayout}
   * @memberof CommentForm
   * @instance
   */
  watchField;

  /**
   * Watch page checkbox.
   *
   * @type {import('./CheckboxInputWidget').default}
   * @memberof CommentForm
   * @instance
   */
  watchCheckbox;

  /**
   * Subscribe checkbox field.
   *
   * @type {OO.ui.FieldLayout|undefined}
   * @memberof CommentForm
   * @instance
   */
  subscribeField;

  /**
   * Subscribe checkbox.
   *
   * @type {import('./CheckboxInputWidget').default|undefined}
   * @memberof CommentForm
   * @instance
   */
  subscribeCheckbox;

  /**
   * Omit signature checkbox field.
   *
   * @type {OO.ui.FieldLayout|undefined}
   * @memberof CommentForm
   * @instance
   */
  omitSignatureField;

  /**
   * Omit signature checkbox.
   *
   * @type {import('./CheckboxInputWidget').default|undefined}
   * @memberof CommentForm
   * @instance
   */
  omitSignatureCheckbox;

  /**
   * Delete checkbox field.
   *
   * @type {OO.ui.FieldLayout|undefined}
   * @memberof CommentForm
   * @instance
   */
  deleteField;

  /**
   * Delete checkbox.
   *
   * @type {import('./CheckboxInputWidget').default|undefined}
   * @memberof CommentForm
   * @instance
   */
  deleteCheckbox;

  /**
   * Checkboxes area.
   *
   * @type {OO.ui.HorizontalLayout}
   */
  checkboxesLayout;

  /** @type {string} */
  submitButtonLabelStandard;

  /** @type {string} */
  submitButtonLabelShort;

  /**
   * Toggle advanced section button.
   *
   * @type {OO.ui.ButtonWidget}
   */
  advancedButton;

  /**
   * Help button.
   *
   * @type {OO.ui.PopupButtonWidget}
   */
  helpPopupButton;

  /**
   * Script settings button.
   *
   * @type {OO.ui.ButtonWidget}
   */
  settingsButton;

  /**
   * Cancel button.
   *
   * @type {OO.ui.ButtonWidget}
   */
  cancelButton;

  /**
   * View changes button.
   *
   * @type {OO.ui.ButtonWidget}
   */
  viewChangesButton;

  /**
   * Preview button.
   *
   * @type {OO.ui.ButtonWidget}
   */
  previewButton;

  /**
   * Submit button.
   *
   * @type {OO.ui.ButtonWidget}
   */
  submitButton;

  /**
   * The area where service messages are displayed.
   *
   * @type {JQuery}
   */
  $messageArea;

  /**
   * The area where edit summary preview is displayed.
   *
   * @type {JQuery}
   */
  $summaryPreview;

  /**
   * Advanced section container.
   *
   * @type {JQuery}
   */
  $advanced;

  /**
   * Start (left on LTR wikis, right on RTL wikis) form buttons container.
   *
   * @type {JQuery}
   */
  $buttonsStart;

  /**
   * End (right on LTR wikis, left on RTL wikis) form buttons container.
   *
   * @type {JQuery}
   */
  $buttonsEnd;

  /**
   * Form buttons container.
   *
   * @type {JQuery}
   */
  $buttons;

  /**
   * The area where comment previews and changes are displayed.
   *
   * @type {JQuery}
   */
  $previewArea;

  /**
   * Name of the tag of the list that this comment form is an item of.
   *
   * @type {?('dl'|'ul'|'ol')}
   * @private
   */
  containerListType = null;

  /**
   * @typedef {(
   *   Mode extends 'reply' | 'edit' ?
   *     Comment :
   *     Mode extends 'replyInSection' | 'addSubsection' ?
   *       import('./Section').default :
   *       import('./pageRegistry').Page
   * )} CommentFormTarget
   */

  /**
   * @typedef {Mode extends 'addSection' ? null : import('./Section').default} CommentFormTargetSection
   */

  /**
   * Object specifying configuration to preload data into the comment form. It is extracted from the
   * "Add section" link/button target.
   *
   * @typedef {object} PreloadConfig
   * @property {string} [editIntro] Edit intro page name.
   * @property {string} [commentTemplate] Comment template's page name.
   * @property {string} [headline] Subject/headline.
   * @property {string[]} [params] Preload parameters to take place of `$1`, `$2`, etc. in the
   *   comment template.
   * @property {string} [summary] Edit summary.
   * @property {string} [noHeadline] Whether to include a headline.
   * @property {string} [omitSignature] Whether to add the user's signature.
   * @memberof CommentForm
   * @inner
   */

  /**
   * Create a comment form.
   *
   * @param {object} config
   * @param {Mode} config.mode
   * @param {CommentFormTarget} config.target
   *   Comment, section, or page that the form is related to.
   * @param {object} [config.initialState = {}] Initial state of the form (data saved in the
   *   previous session, quoted text, data transferred from DT's new topic form, etc.).
   * @param {PreloadConfig} [config.preloadConfig] Configuration to preload data into the form.
   * @param {boolean} [config.newTopicOnTop=false] When adding a topic, whether it should be on top.
   * @fires commentFormCustomModulesReady
   */
  constructor({ mode, target, initialState = {}, preloadConfig, newTopicOnTop = false }) {
    // Mixin constructor
    OO.EventEmitter.call(this);

    this.watchOnReply = settings.get('watchOnReply');
    this.subscribeOnReply = settings.get('subscribeOnReply');
    this.useTopicSubscription = settings.get('useTopicSubscription');
    this.autopreview = settings.get('autopreview');
    this.alwaysExpandAdvanced = settings.get('alwaysExpandAdvanced');
    this.showToolbar = settings.get('showToolbar');
    this.insertButtons = settings.get('insertButtons');
    this.improvePerformance = settings.get('improvePerformance');
    this.manyFormsOnboarded = settings.get('manyForms-onboarded');
    this.uploadOnboarded = settings.get('upload-onboarded');

    this.uploadToCommons = cd.g.isProbablyWmfSulWiki;

    /**
     * Form mode.
     *
     * @type {Mode}
     * @private
     */
    this.mode = mode;

    this.setTargets(target);

    /**
     * Configuration to preload data into the form.
     *
     * @type {PreloadConfig|undefined}
     * @private
     */
    this.preloadConfig = preloadConfig;

    /**
     * When adding a topic, whether it should be on top.
     *
     * @type {boolean|undefined}
     * @private
     */
    this.newTopicOnTop = newTopicOnTop;

    /**
     * Form index.
     *
     * @type {number}
     * @private
     */
    this.index = CommentForm.counter++;

    /**
     * Is the comment form registered ({@link CommentForm#unregister .unregister()} hasn't been run
     * on it).
     *
     * @type {boolean}
     */
    this.registered = true;

    /**
     * Has the comment form been {@link CommentForm#teardown torndown}.
     *
     * @type {boolean}
     */
    this.torndown = false;

    /**
     * Was the summary altered manually.
     *
     * @type {boolean}
     * @private
     */
    this.summaryAltered = initialState.summaryAltered ?? false;

    /**
     * Was the omit signature checkbox altered manually.
     *
     * @type {boolean}
     * @private
     */
    this.omitSignatureCheckboxAltered = initialState.omitSignatureCheckboxAltered ?? false;

    /**
     * If the user replies to a comment with outdented replies (in which case the form is created
     * like a regular section reply), this is that target comment.
     *
     * @type {?Comment}
     */
    this.targetWithOutdentedReplies = initialState.targetWithOutdentedReplies || null;

    /**
     * Is section opening comment edited.
     *
     * @type {boolean}
     * @private
     */
    this.sectionOpeningCommentEdited =
      this.mode === 'edit' && this.target instanceof Comment && this.target.isOpeningSection;

    /**
     * Whether a new section will be added on submit using a dedicated API request. (Filled upon
     * submitting or viewing changes.)
     *
     * @type {?boolean}
     * @private
     */
    this.newSectionApi = null;

    /**
     * Whether the wikitext of a section will be submitted to the server instead of a page. (Filled
     * upon submitting or viewing changes.)
     *
     * @type {?boolean}
     * @private
     */
    this.sectionSubmitted = null;

    /**
     * Operation registry.
     *
     * @type {CommentFormOperationRegistry}
     * @private
     */
    this.operations = new CommentFormOperationRegistry(this);

    /**
     * List of timestamps of last keypresses.
     *
     * @type {number[]}
     * @private
     */
    this.lastKeyPresses = [];

    if (this.mode === 'addSection') {
      // This is above this.createContents() as that function is time-costly and would delay the
      // requests made in this.addEditNotices().
      this.addEditNotices();
    }

    const customModulesNames = cd.config.customCommentFormModules
      .filter((module) => !module.checkFunc || module.checkFunc())
      .map((module) => module.name);
    mw.loader.using(customModulesNames).then(() => {
      /**
       * All the requested
       * {@link module:defaultConfig.customCommentFormModules custom comment form modules} have been
       * loaded and executed. (The toolbar may not be ready yet if it's enabled; use
       * {@link event:commentFormToolbarReady} for that.)
       *
       * @event commentFormCustomModulesReady
       * @param {CommentForm} commentForm
       * @param {object} cd {@link convenientDiscussions} object.
       */
      mw.hook('convenientDiscussions.commentFormCustomModulesReady').fire(this, cd);
    });

    this.createContents(initialState, customModulesNames);
    this.addEventListeners();
    this.initAutocomplete();
  }

  /**
   * Setup the form after it is added to the page for the first time (not after a page reload).
   *
   * @param {object} [initialState={}]
   */
  setup(initialState = {}) {
    this.adjustLabels();

    if (!cd.user.isRegistered() && !mw.user.isTemp?.()) {
      this.showMessage(cd.sParse('error-anoneditwatning'), {
        type: 'warning',
        name: 'anonEditWarning',
      });
    }

    if (this.mode === 'edit') {
      this.loadComment(initialState);
    } else if (initialState.originalComment !== undefined) {
      this.originalComment = initialState.originalComment || '';
      this.originalHeadline = initialState.originalHeadline || '';
    } else {
      if (this.preloadConfig?.commentTemplate) {
        this.preloadTemplate();
      } else {
        this.originalComment = '';
      }

      if (this.headlineInput) {
        if (this.preloadConfig?.headline) {
          this.headlineInput.setValue(this.preloadConfig.headline);
        }

        // The headline may be set from initialState.headline at this point
        this.originalHeadline = this.headlineInput.getValue();
      }
    }

    if (initialState.lastFocused) {
      /**
       * The date when the comment form was focused last time.
       *
       * @type {Date|undefined}
       * @private
       */
      this.lastFocused = new Date(initialState.lastFocused);
    }

    if (initialState.targetWithOutdentedReplies) {
      this.showMessage(
        wrapHtml(
          cd.sParse(
            'cf-notice-outdent',
            (new mw.Title(cd.config.outdentTemplates[0], 10)).toString()
          ),
          { targetBlank: true }
        ),
        {
          type: 'notice',
          name: 'outdent',
        }
      );
    }

    if (this.mode !== 'addSection' && this.mode !== 'edit') {
      this.checkCode();
    }

    if (!initialState.originalComment && initialState.focus !== false) {
      this.$element.cdScrollIntoView('center', true, () => {
        if (this.mode !== 'edit') {
          (this.headlineInput || this.commentInput).focus();
        }
      });
    }

    this.onboardOntoMultipleForms();
    this.onboardOntoUpload();
  }

  /**
   * Set the `target`, `targetSection`, `parentComment`, and `targetPage` properties.
   *
   * @param {CommentFormTarget} target
   * @private
   */
  setTargets(target) {
    this.target = target;
    this.targetSection = /** @type {CommentFormTargetSection} */ (this.target.getRelevantSection());
    this.targetPage = this.targetSection ?
      this.targetSection.getSourcePage() :
      cd.page;
    this.parentComment = ['reply', 'replyInSection'].includes(this.mode) ?
      this.target.getRelevantComment() :
      null;
  }

  /**
   * Compose a tab index for an element from the form's index and the supplied element index.
   *
   * @param {number} elementIndex
   * @returns {number}
   * @private
   */
  getTabIndex(elementIndex) {
    return Number(String(this.index) + String(elementIndex));
  }

  /**
   * Create the text inputs based on OOUI widgets.
   *
   * @param {object} initialState
   * @private
   */
  createTextInputs(initialState) {
    if (
      (['addSection', 'addSubsection'].includes(this.mode) && !this.preloadConfig?.noHeadline) ||
      this.sectionOpeningCommentEdited
    ) {
      this.headlineInputPlaceholder = this.target.getCommentFormHeadlineInputPlaceholder(this.mode);
      this.headlineInput = new (require('./TextInputWidget').default)({
        value: initialState.headline ?? '',
        placeholder: this.headlineInputPlaceholder,
        classes: ['cd-commentForm-headlineInput'],
        tabIndex: this.getTabIndex(11),
      });
    }

    this.commentInput = new (require('./MultilineTextInputWidget').default)({
      value: initialState.comment ?? '',
      placeholder: this.target.getCommentFormCommentInputPlaceholder(
        this.mode,
        ([commentAuthor]) => {
          this.commentInput.$input.attr(
            'placeholder',
            removeDoubleSpaces(cd.s(
              'cf-comment-placeholder-replytocomment',
              commentAuthor.getName(),
              commentAuthor
            ))
          )
        }
      ) || undefined,
      rows: this.headlineInput ? 5 : 3,
      autosize: true,
      maxRows: 9999,
      classes: ['cd-commentForm-commentInput'],
      tabIndex: this.getTabIndex(12),
    });
    this.commentInput.$input.addClass('ime-position-inside');

    this.summaryInput = new (require('./TextInputWidget').default)({
      value: initialState.summary ?? '',
      maxLength: cd.g.summaryLengthLimit,
      placeholder: cd.s('cf-summary-placeholder'),
      classes: ['cd-commentForm-summaryInput'],
      tabIndex: this.getTabIndex(13),
    });
    this.summaryInput.$input.codePointLimit(cd.g.summaryLengthLimit);
    mw.widgets.visibleCodePointLimit(this.summaryInput, cd.g.summaryLengthLimit);
    this.updateAutoSummary(!initialState.summary);
  }

  /**
   * Create the checkboxes and the horizontal layout containing them based on OOUI widgets.
   *
   * @param {object} initialState
   * @private
   */
  createCheckboxes(initialState) {
    if (cd.user.isRegistered()) {
      if (this.mode === 'edit') {
         ({
          field: this.minorField,
          input: this.minorCheckbox,
        } = createCheckboxField({
          value: 'minor',
          selected: initialState.minor ?? true,
          label: cd.s('cf-minor'),
          tabIndex: this.getTabIndex(20),
        }));
      }

      ({
        field: this.watchField,
        input: this.watchCheckbox,
      } = createCheckboxField({
        value: 'watch',
        selected: (
          initialState.watch ??
          (
            (this.watchOnReply && this.mode !== 'edit') ||
            $('.mw-watchlink a[href*="action=unwatch"]').length ||
            mw.user.options.get(cd.page.exists() ? 'watchdefault' : 'watchcreations')
          )
        ),
        label: cd.s('cf-watch'),
        tabIndex: this.getTabIndex(21),
      }));

      const subscribableSection = this.useTopicSubscription ?
        this.targetSection?.getBase(true) :
        this.targetSection;
      if (
        (subscribableSection?.subscribeId || this.mode === 'addSection') &&
        (!controller.isSubscribingDisabled() || subscribableSection?.subscriptionState)
      ) {
        ({
          field: this.subscribeField,
          input: this.subscribeCheckbox,
        } = createCheckboxField({
          value: 'subscribe',
          selected: (
            initialState.subscribe ??
            (
              (this.subscribeOnReply && this.mode !== 'edit') ||
              subscribableSection?.subscriptionState
            )
          ),
          label: (
            this.useTopicSubscription ||
            (
              this.mode === 'addSection' ||
              (
                this.mode !== 'addSubsection' &&
                ((this.targetSection && this.targetSection.level <= 2))
              )
            )
          ) ?
            cd.s('cf-watchsection-topic') :
            cd.s('cf-watchsection-subsection'),
          tabIndex: this.getTabIndex(22),
          title: cd.s('cf-watchsection-tooltip'),
        }));
      }
    }

    ({
      field: this.omitSignatureField,
      input: this.omitSignatureCheckbox,
    } = createCheckboxField({
      value: 'omitSignature',
      selected: initialState.omitSignature ?? false,
      label: cd.s('cf-omitsignature'),
      title: cd.s('cf-omitsignature-tooltip'),
      tabIndex: this.getTabIndex(25),
    }));
    if (!['addSection', 'addSubsection'].includes(this.mode)) {
      // The checkbox works (for cases like https://en.wikipedia.org/wiki/Template:3ORshort) but is
      // hidden.
      this.omitSignatureField.toggle(false);
    }

    if (
      this.mode === 'edit' &&
      /** @type {import('./Comment').default} */ (this.target).isDeletable()
    ) {
      ({ field: this.deleteField, input: this.deleteCheckbox } = createCheckboxField({
        value: 'delete',
        selected: initialState.delete ?? false,
        label: cd.s('cf-delete'),
        tabIndex: this.getTabIndex(26),
      }));
    }

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
   * Create the buttons based on OOUI widgets.
   *
   * @private
   */
  createButtons() {
    const /** @type {{[key: string]: string}} */ modeToSubmitButtonMessageName = {
      edit: 'save',
      addSection: 'addtopic',
      addSubsection: 'addsubsection',
    };
    const submitButtonMessageName = modeToSubmitButtonMessageName[this.mode] || 'reply';
    this.submitButtonLabelStandard = cd.s(`cf-${submitButtonMessageName}`);
    this.submitButtonLabelShort = cd.s(`cf-${submitButtonMessageName}-short`);

    this.advancedButton = new OO.ui.ButtonWidget({
      label: cd.s('cf-advanced'),
      framed: false,
      classes: ['cd-button-ooui', 'cd-commentForm-advancedButton'],
      tabIndex: this.getTabIndex(30),
    });

    this.helpPopupButton = new OO.ui.PopupButtonWidget({
      label: cd.s('cf-help'),
      framed: false,
      classes: ['cd-button-ooui'],
      popup: {
        head: false,
        $content: wrapHtml(
          cd.sParse(
            'cf-help-content',
            cd.config.mentionCharacter,
            cd.g.cmdModifier,
            cd.s('dot-separator')
          ),
          {
            tagName: 'div',
            targetBlank: true,
          }
        ).contents(),
        padded: true,
        align: 'center',
        width: 400,
        classes: ['cd-helpPopup'],
      },
      $overlay: controller.getPopupOverlay(),
      tabIndex: this.getTabIndex(31),
    });

    if (cd.user.isRegistered()) {
      this.settingsButton = new OO.ui.ButtonWidget({
        framed: false,
        icon: 'settings',
        label: cd.s('cf-settings-tooltip'),
        invisibleLabel: true,
        title: cd.s('cf-settings-tooltip'),
        classes: ['cd-button-ooui', 'cd-commentForm-settingsButton'],
        tabIndex: this.getTabIndex(32),
      });
    }

    this.cancelButton = new OO.ui.ButtonWidget({
      label: cd.s('cf-cancel'),
      flags: 'destructive',
      framed: false,
      classes: ['cd-button-ooui', 'cd-commentForm-cancelButton'],
      tabIndex: this.getTabIndex(33),
    });

    this.viewChangesButton = new OO.ui.ButtonWidget({
      label: cd.s('cf-viewchanges'),
      classes: ['cd-commentForm-viewChangesButton'],
      tabIndex: this.getTabIndex(34),
    });
    this.viewChangesButton.on('toggle', this.adjustLabels.bind(this));

    this.previewButton = new OO.ui.ButtonWidget({
      label: cd.s('cf-preview'),
      classes: ['cd-commentForm-previewButton'],
      tabIndex: this.getTabIndex(35),
    });
    if (this.autopreview) {
      this.previewButton.toggle(false);
    }
    this.previewButton.on('toggle', this.adjustLabels.bind(this));

    this.submitButton = new OO.ui.ButtonWidget({
      label: this.submitButtonLabelStandard,
      flags: ['progressive', 'primary'],
      classes: ['cd-commentForm-submitButton'],
      tabIndex: this.getTabIndex(36),
    });
  }

  /**
   * Create the main element, the wrappers for the controls (inputs, checkboxes, buttons), and other
   * elements.
   *
   * @private
   */
  createElements() {
    if (this.mode === 'reply') {
      this.containerListType = 'dl';
    } else if (this.mode === 'edit') {
      this.containerListType = /** @type {Comment} */ (this.target).containerListType;
    } else if (this.mode === 'replyInSection') {
      this.containerListType = /** @type {import('./Section').default} */ (
        this.target
      ).$replyButtonContainer.prop('tagName').toLowerCase();
    }

    this.$element = $('<div>').addClass([
      `cd-commentForm cd-commentForm-${this.mode}`,
      this.containerListType === 'ol' ?
        'cd-commentForm-inNumberedList' :
        undefined,
      this.sectionOpeningCommentEdited ?
        'cd-commentForm-sectionOpeningComment' :
        undefined,
      this.mode === 'addSubsection' ?
        `cd-commentForm-addSubsection-${this.target.level}` :
        undefined,
    ].filter(defined));

    this.$messageArea = $('<div>').addClass('cd-commentForm-messageArea');

    this.$summaryPreview = $('<div>').addClass('cd-summaryPreview');

    this.$advanced = $('<div>')
      .addClass('cd-commentForm-advanced')
      .append(
        this.summaryInput.$element,
        this.$summaryPreview,
        this.checkboxesLayout.$element,
      );

    this.$buttonsStart = $('<div>')
      .addClass('cd-commentForm-buttons-start')
      .append(
        this.advancedButton.$element,
        this.helpPopupButton.$element,
        this.settingsButton?.$element,
      );

    this.$buttonsEnd = $('<div>')
      .addClass('cd-commentForm-buttons-end')
      .append(
        this.cancelButton.$element,
        this.viewChangesButton.$element,
        this.previewButton.$element,
        this.submitButton.$element,
      );

    this.$buttons = $('<div>')
      .addClass('cd-commentForm-buttons')
      .append(this.$buttonsStart, this.$buttonsEnd);

    this.$element.append(
      this.$messageArea,
      this.headlineInput?.$element,
      this.commentInput.$element,
      this.$advanced,
      this.$buttons,
    );

    if (this.mode !== 'edit' && !this.alwaysExpandAdvanced) {
      this.$advanced.hide();
    }

    // .mw-body-content is for 404 pages
    this.$previewArea = $('<div>').addClass('cd-commentForm-previewArea mw-body-content');

    if (this.autopreview) {
      this.$previewArea
        .addClass('cd-commentForm-previewArea-below')
        .appendTo(this.$element);
    } else {
      this.$previewArea
        .addClass('cd-commentForm-previewArea-above')
        .prependTo(this.$element);
    }

    if (this.containerListType === 'ol' && $.client.profile().layout !== 'webkit') {
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
    if (!this.showToolbar || !mw.loader.getState('ext.wikiEditor')) return;

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
    const dialogsDefaultConfig = dialogsConfig.getDefaultConfig();
    if (this.uploadToCommons) {
      const commentForm = this;
      dialogsDefaultConfig.dialogs['insert-file'].dialog.buttons['wikieditor-toolbar-tool-file-upload'] = function () {
        $(this).dialog('close');
        commentForm.uploadImage(undefined, true);
      };
    }
    $input.wikiEditor('addModule', dialogsDefaultConfig);

    this.commentInput.$element
      .find('.tool[rel="redirect"], .tool[rel="signature"], .tool[rel="newline"], .tool[rel="reference"], .option[rel="heading-2"]')
      .remove();
    if (!['addSection', 'addSubsection'].includes(this.mode)) {
      this.commentInput.$element.find('.group-heading').remove();
    }

    const scriptPath = mw.config.get('wgScriptPath');
    const lang = cd.g.userLanguage;
    $input.wikiEditor('addToToolbar', {
      section: 'main',
      group: 'format',
      tools: {
        smaller: {
          label: cd.mws('wikieditor-toolbar-tool-small'),
          type: 'button',
          icon: `${scriptPath}/load.php?modules=oojs-ui.styles.icons-editing-styling&image=smaller&lang=${lang}&skin=vector`,
          action: {
            type: 'encapsulate',
            options: {
              pre: '<small>',
              peri: cd.mws('wikieditor-toolbar-tool-small-example'),
              post: '</small>',
            },
          },
        },
      },
    });

    $input.wikiEditor('addToToolbar', {
      section: 'main',
      groups: {
        'convenient-discussions': {},
      },
    });
    $input.wikiEditor('addToToolbar', {
      section: 'main',
      group: 'convenient-discussions',
      tools: {
        quote: {
          label: `${cd.s('cf-quote-tooltip')} ${cd.mws('parentheses', `Q${cd.mws('comma-separator')}${cd.g.cmdModifier}+Alt+Q`)}`,
          type: 'button',
          icon: `${scriptPath}/load.php?modules=oojs-ui.styles.icons-editing-advanced&image=quotes&lang=${lang}&skin=vector`,
          action: {
            type: 'callback',
            execute: () => {
              this.quote(true, commentRegistry.getSelectedComment());
            },
          },
        },
        mention: {
          label: cd.s('cf-mention-tooltip', cd.g.cmdModifier),
          type: 'button',
          icon: `${scriptPath}/load.php?modules=oojs-ui.styles.icons-user&image=userAvatar&lang=${lang}&skin=vector`,
          action: {
            type: 'callback',
            execute: () => {
              // Use deprecated window.event to avoid removing and adding a listener
              this.mention(isCmdModifierPressed(window.event));
            },
          },
        },
        commentLink: {
          label: `${cd.s('cf-commentlink-tooltip')}`,
          type: 'button',
          icon: cd.g.userDirection === 'ltr' ?
            `'data:image/svg+xml, %3Csvg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"%3E%3Cpath d="M3 2C2.46957 2 1.96086 2.21071 1.58579 2.58579C1.21071 2.96086 1 3.46957 1 4V20L5 16H17C17.5304 16 18.0391 15.7893 18.4142 15.4142C18.7893 15.0391 19 14.5304 19 14V4C19 3.46957 18.7893 2.96086 18.4142 2.58579C18.0391 2.21071 17.5304 2 17 2H3Z" /%3E%3C/svg%3E'` :
            `'data:image/svg+xml, %3Csvg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"%3E%3Cpath d="M17 2C17.5304 2 18.0391 2.21071 18.4142 2.58579C18.7893 2.96086 19 3.46957 19 4V20L15 16H3C2.46957 16 1.96086 15.7893 1.58579 15.4142C1.21071 15.0391 1 14.5304 1 14V4C1 3.46957 1.21071 2.96086 1.58579 2.58579C1.96086 2.21071 2.46957 2 3 2H17Z" /%3E%3C/svg%3E'`,
          action: {
            type: 'callback',
            execute: () => {
              this.insertCommentLink();
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
          label: `${cd.s('cf-code-tooltip')} ${cd.mws('parentheses', `${cd.g.cmdModifier}+Shift+6`)}`,
          type: 'button',
          icon: `${scriptPath}/load.php?modules=oojs-ui.styles.icons-editing-advanced&image=code&lang=${lang}&skin=vector`,
          action: {
            type: 'encapsulate',
            options: CommentForm.encapsulateOptions.code,
          },
        },
        codeBlock: {
          label: cd.s('cf-codeblock-tooltip'),
          type: 'button',
          icon: `${scriptPath}/load.php?modules=oojs-ui.styles.icons-editing-advanced&image=markup&lang=${lang}&skin=vector`,
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
          label: `${cd.s('cf-underline-tooltip')} ${cd.mws('parentheses', `${cd.g.cmdModifier}+U`)}`,
          type: 'button',
          icon: `${scriptPath}/load.php?modules=oojs-ui.styles.icons-editing-styling&image=underline&lang=${lang}&skin=vector`,
          action: {
            type: 'encapsulate',
            options: CommentForm.encapsulateOptions.underline,
          },
        },
        strikethrough: {
          label: `${cd.s('cf-strikethrough-tooltip')} ${cd.mws('parentheses', `${cd.g.cmdModifier}+Shift+5`)}`,
          type: 'button',
          icon: `${scriptPath}/load.php?modules=oojs-ui.styles.icons-editing-styling&image=strikethrough&lang=${lang}&skin=vector`,
          action: {
            type: 'encapsulate',
            options: CommentForm.encapsulateOptions.strikethrough,
          },
        },
      },
    });

    this.$element
      .find('.tool[rel="bold"] a')
      .attr('title', `${mw.msg('wikieditor-toolbar-tool-bold')} ${cd.mws('parentheses', `${cd.g.cmdModifier}+B`)}`);

    this.$element
      .find('.tool[rel="italic"] a')
      .attr('title', `${mw.msg('wikieditor-toolbar-tool-italic')} ${cd.mws('parentheses', `${cd.g.cmdModifier}+I`)}`);

    this.$element
      .find('.tool[rel="link"] a')
      .attr('title', `${mw.msg('wikieditor-toolbar-tool-link')} ${cd.mws('parentheses', `${cd.g.cmdModifier}+K`)}`);

    this.$element
      .find('.tool[rel="ulist"] a')
      .attr('title', `${mw.msg('wikieditor-toolbar-tool-ulist')} ${cd.mws('parentheses', `${cd.g.cmdModifier}+Shift+8`)}`);

    this.$element
      .find('.tool[rel="link"] a, .tool[rel="file"] a')
      .on('click', (e) => {
        // Fix text being inserted in a wrong textarea.
        const rel = e.currentTarget.parentElement?.getAttribute('rel');
        if (!rel) return;

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

    this.$element
      .find('.tool[rel="quote"]')
      .wrap($('<span>').addClass('cd-tool-button-wrapper'));

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
    // Mask escaped characters
    const textMasker = new TextMasker(snippet).mask(/\\[+;\\]/g);

    let [, pre, post] = textMasker.getText().match(/^(.*?)(?:\+(.*))?$/) || [];
    if (!pre) return;

    pre = pre.replace(/\\n/g, '\n');
    post ||= '';
    post = post.replace(/\\n/g, '\n');

    // Unmask escaped characters
    const unescape = (snippet) => snippet.replace(/\\([+;\\])/g, '$1');
    pre = unescape(textMasker.unmaskText(pre));
    post = unescape(textMasker.unmaskText(post));
    label = label ? unescape(label) : pre + post;

    this.$insertButtons.append(
      new Button({
        label,
        classes: ['cd-insertButtons-button'],
        action: () => {
          this.encapsulateSelection({ pre, post });
        },
      }).element,
      ' ',
    );
  }

  /**
   * Add the insert buttons block under the comment input.
   *
   * @private
   */
  addInsertButtons() {
    if (!this.insertButtons.length) return;

    /**
     * Text insert buttons.
     *
     * @type {JQuery|undefined}
     */
    this.$insertButtons = $('<div>')
      .addClass('cd-insertButtons')
      .insertAfter(this.commentInput.$element);

    this.insertButtons.forEach((button) => {
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
   * @param {object} initialState
   * @param {string[]} requestedModulesNames
   * @private
   */
  createContents(initialState, requestedModulesNames) {
    this.createTextInputs(initialState);
    this.createCheckboxes(initialState);
    this.createButtons();
    this.createElements();
    this.addToolbar(requestedModulesNames);
    this.addInsertButtons();

    if (this.deleteCheckbox?.isSelected()) {
      this.updateFormOnDeleteCheckboxChange(true);
    }
  }

  /**
   * Load the edited comment to the comment form.
   *
   * @param {object} initialState
   * @private
   */
  async loadComment(initialState) {
    const operation = this.operations.add('load');
    try {
      await this.target.loadCode(this);
      let commentInputValue = this.target.source.toInput();
      if (this.target.source.inSmallFont) {
        commentInputValue = `<small>${commentInputValue}</small>`;
      }
      const headline = this.target.source.headlineCode;

      this.commentInput.setValue(commentInputValue);
      this.originalComment = commentInputValue;
      if (this.headlineInput) {
        this.headlineInput.setValue(headline);
        this.originalHeadline = headline;
      }

      operation.close();

      (initialState.focusHeadline && this.headlineInput || this.commentInput).focus();
      this.preview();
    } catch (e) {
      if (e instanceof CdError) {
        this.handleError(
          Object.assign({}, e.data, {
            cancel: true,
            operation,
          })
        );
      } else {
        this.handleError({
          type: 'javascript',
          logMessage: e,
          cancel: true,
          operation,
        });
      }
    }
  }

  /**
   * Test if a target comment or section exists in the wikitext.
   *
   * @returns {JQueryPromise}
   * @private
   */
  checkCode() {
    if (!this.checkCodeRequest) {
      /**
       * Request to test if a comment or section exists in the code made by
       * {@link CommentForm#checkCode}.
       *
       * @type {JQueryPromise|undefined}
       */
      this.checkCodeRequest = this.target.loadCode(this).catch((e) => {
        this.$messageArea.empty();
        this.checkCodeRequest = null;
        if (e instanceof CdError) {
          this.handleError(Object.assign({}, e.data));
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
    let result;
    try {
      const title = cd.page.title.replace(/\//g, '-');

      // Just making a parse request with both edit intro and edit notices is simpler than making
      // two requests for each of them.
      result = await parseCode(
        (
          (
            this.preloadConfig?.editIntro ?
              `<div class="cd-editintro">{{${this.preloadConfig.editIntro}}}</div>\n` :
              ''
          ) +
          `<div class="cd-editnotice">{{MediaWiki:Editnotice-${cd.g.namespaceNumber}}}</div>` +
          `<div class="cd-editnotice">{{MediaWiki:Editnotice-${cd.g.namespaceNumber}-${title}}}</div>`
        ),
        { title: cd.page.name }
      );
    } catch {
      // TODO: Some error message? (But in most cases there are no edit notices anyway, and if the
      // user is knowingly offline they would be annoying.)
      return;
    }

    const $editNotices = $(result.html.replace(/<div class="cd-editnotice"><\/div>/g, ''));
    if (!$editNotices.children().length && !$editNotices.text()) return;

    this.$messageArea
      .append($editNotices)
      .cdAddCloseButton()
      .find(`:is(.cd-editnotice, .cd-editintro) > a.new:first-child:last-child`)
      .parent()
      .remove();

    // We mirror the functionality of the ext.charinsert module to keep the undo/redo
    // functionality.
    this.$messageArea
      .find('.mw-charinsert-item')
      .each((i, el) => {
        const $el = $(el);
        $el
          .on('click', () => {
            this.encapsulateSelection({
              pre: $el.data('mw-charinsert-start'),
              post: $el.data('mw-charinsert-end'),
            });
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
  async preloadTemplate() {
    const operation = this.operations.add('load', { affectsHeadline: false });
    const preloadPage = pageRegistry.get(this.preloadConfig.commentTemplate);
    try {
      await preloadPage.loadCode();
      let code = preloadPage.code;

      const regexp = generateTagsRegexp(['onlyinclude']);
      let match;
      let onlyInclude;
      while ((match = regexp.exec(code))) {
        onlyInclude ??= '';
        onlyInclude += match[3];
      }
      if (onlyInclude !== undefined) {
        code = onlyInclude;
      }

      code = code
        .replace(generateTagsRegexp(['includeonly']), '$3')
        .replace(generateTagsRegexp(['noinclude']), '')
        .replace(/\$(\d+)/g, (m, s) => this.preloadConfig.params[s - 1] ?? m);
      code = code.trim();

      if (code.includes(cd.g.signCode) || this.preloadConfig.omitSignature) {
        this.omitSignatureCheckbox.setSelected(true);
        this.omitSignatureCheckboxAltered = true;
      }

      this.commentInput.setValue(code);
      this.originalComment = code;

      operation.close();

      (this.headlineInput || this.commentInput).focus();
      this.preview();
    } catch (e) {
      if (e instanceof CdError) {
        this.handleError(
          Object.assign({}, e.data, {
            cancel: true,
            operation,
          })
        );
      } else {
        this.handleError({
          type: 'javascript',
          logMessage: e,
          cancel: true,
          operation,
        });
      }
    }
  }

  /**
   * Check whether we recently suggested the user to enable the "Improve performance" setting via a
   * warn notification.
   *
   * @returns {boolean}
   */
  haveSuggestedToImprovePerformanceRecently() {
    return getDayTimestamp() - settings.get('improvePerformance-lastSuggested') < 14;
  }

  /**
   * Used as a callback for `keydown` events - check whether there are performance issues based on
   * the rate of the last `keypressCount` keypresses. If there are such, show a notification.
   *
   * @param {Event} e
   * @param {number} keypressCount
   * @param {number} rateLimit
   * @private
   */
  checkForPerformanceIssues(e, keypressCount, rateLimit) {
    if (this.haveSuggestedToImprovePerformanceRecently()) return;

    this.lastKeyPresses.push(e.timeStamp);
    this.lastKeyPresses.splice(0, this.lastKeyPresses.length - keypressCount);
    if (
      this.lastKeyPresses[keypressCount - 1] - this.lastKeyPresses[0] <
      keypressCount * rateLimit
    ) {
      const $body = wrapHtml(cd.sParse('warning-performance'), {
        callbacks: {
          'cd-notification-talkPageSettings': () => {
            settings.showDialog('talkPage');
          },
        },
      });
      mw.notify($body, {
        title: cd.s('warning-performance-title'),
        type: 'warn',
        autoHideSeconds: 'long',
      });
      settings.saveSettingOnTheFly('improvePerformance-lastSuggested', getDayTimestamp());
    }
  }

  /**
   * Get a dummy "floatable container" to attach a popup to so that the popup is at the caret
   * position.
   *
   * @returns {JQuery}
   * @private
   */
  getCommentInputDummyFloatableContainer() {
    const element = this.commentInput.$input[0];
    const computedStyle = window.getComputedStyle(element);
    const $span = $('<span>');
    const $div = $('<div>')
      .text(element.value.substring(0, this.commentInput.getRange().to))
      .css({
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',

        // Position off-screen
        position: 'absolute',
        visibility: 'hidden',

        width: `${parseFloat(computedStyle.width)}px`,

        // Transfer the element's properties to the div.
        ...cd.g.inputPropsAffectingCoords.reduce((props, propName) => {
          props[propName] = computedStyle[propName];
          return props;
        }, {}),
      })
      .append($span)
      .appendTo(document.body);
    $span
      .css({
        top: $span[0].offsetTop,
        left: $span[0].offsetLeft,
        width: 0,
        height: parseFloat($span.css('line-height')) - 3,
      })
      .addClass('cd-dummyFloatableContainer');
    $div.remove();
    return $span;
  }

  /**
   * Tear down all popups that could be attached to the caret position or input.
   *
   * @private
   */
  teardownInputPopups() {
    this.richFormattingPopup?.toggle(false).$element.remove();
    this.$commentInputPopupFloatableContainer?.remove();

    // Don't toggle off, just remove, so that it is not considered closed and may reappear
    this.manyFormsPopup?.$element.remove();
    this.uploadPopup?.$element.remove();
  }

  /**
   * When the user inserted text that was copied with rich formatting, suggest to convert it to
   * wikitext.
   *
   * @param {string} html
   * @param {string} insertedText
   * @private
   */
  async suggestConvertToWikitext(html, insertedText) {
    await sleep();
    const button = new OO.ui.ButtonWidget({
      label: cd.s('cf-popup-richformatting-convert'),
      flags: ['progressive'],
    });
    const position = this.commentInput.getRange().to;
    button.on('click', async () => {
      // The input is made disabled, so the content can't be changed by the user during the
      // loading stage.
      const text = await this.commentInput.getWikitextFromPaste(html, controller.rootElement);

      this.commentInput
        .selectRange(position - insertedText.length, position)
        .cdInsertContent(text);
      this.teardownInputPopups();
    });
    this.teardownInputPopups();

    const $textareaWrapper = this.showToolbar ?
      this.$element.find('.wikiEditor-ui-text') :
      this.commentInput.$element;
    this.$commentInputPopupFloatableContainer = this.getCommentInputDummyFloatableContainer();
    $textareaWrapper.append(this.$commentInputPopupFloatableContainer);

    /**
     * Popup that appears when pasting text that has rich formatting available.
     *
     * @type {OO.ui.PopupWidget|undefined}
     */
    this.richFormattingPopup = new OO.ui.PopupWidget({
      icon: 'wikiText',
      label: wrapHtml(cd.sParse('cf-popup-richformatting')),
      $content: button.$element,
      head: true,
      autoClose: true,
      $autoCloseIgnore: this.commentInput.$input,
      hideCloseButton: true,
      $floatableContainer: this.$commentInputPopupFloatableContainer,
      $container: $textareaWrapper,
      containerPadding: -10,
      padded: true,
      classes: ['cd-popup-richFormatting'],
    });
    $textareaWrapper.append(this.richFormattingPopup.$element);
    this.richFormattingPopup.toggle(true);
  }

  /**
   * Upload an image and insert its markup to the comment form.
   *
   * @param {File} file File to upload.
   * @param {boolean} openInsertFileDialogAfterwards Whether to open the WikiEditor's "Insert file"
   *   dialog after the "Upload file" dialog is closed with success.
   */
  async uploadImage(file, openInsertFileDialogAfterwards) {
    if (this.uploadDialog || this.commentInput.isPending() || !this.uploadToCommons) return;

    this.pushPending();

    try {
      await mw.loader.using([
        'mediawiki.Upload.Dialog',
        'mediawiki.ForeignStructuredUpload.BookletLayout',
        'mediawiki.widgets',
      ]);
    } catch (e) {
      mw.notify(cd.s('cf-error-uploadimage'), { type: 'error' });
      this.popPending();
      return;
    }

    this.uploadDialog = new (require('./UploadDialog').default)();
    const windowManager = controller.getWindowManager();
    windowManager.addWindows([this.uploadDialog]);
    const win = windowManager.openWindow(this.uploadDialog, {
      file,
      commentForm: this,
    });
    win.closed.then(() => {
      delete this.uploadDialog;
    });

    this.uploadDialog.uploadBooklet.on('fileSaved', (imageInfo) => {
      this.uploadDialog.close();
      win.closed.then(() => {
        if (openInsertFileDialogAfterwards) {
          $.wikiEditor.modules.dialogs.api.openDialog(this, 'insert-file');
          $('#wikieditor-toolbar-file-target').val(imageInfo.canonicaltitle);
        } else {
          // If some text was selected, insert a link. Otherwise, insert an image.
          if (this.commentInput.getRange().from === this.commentInput.getRange().to) {
            // Localise the "File:" prefix
            const filename = new mw.Title(imageInfo.canonicaltitle).getPrefixedText();

            // Sometimes the file is not yet available on Commons. The preview gives a red link in
            // that case. Use a hack to run the preview now so that the next preview runs a second
            // later.
            this.preview(true);

            this.encapsulateSelection({
              pre: `[[${filename}|frameless|none]]`,
            });
          } else {
            this.encapsulateSelection({
              pre: `[${imageInfo.url} `,
              post: `]`,
            });
          }
        }
      });
    });
  }

  /**
   * Handle `paste` and `drop` events.
   *
   * @param {event} e
   */
  handlePasteDrop(e) {
    const data = e.originalEvent.clipboardData || e.originalEvent.dataTransfer;

    const image = [...data.items].find((item) => CommentForm.allowedFileTypes.includes(item.type));
    if (image) {
      e.preventDefault();
      this.uploadImage(image.getAsFile());
    } else if (data.types.includes('text/html')) {
      const html = data.getData('text/html');
      if (!isHtmlConvertibleToWikitext(html, this.commentInput.$element[0])) return;

      this.suggestConvertToWikitext(html, data.getData('text/plain')?.replace(/\r/g, ''));
    }
  }

  /**
   * Add event listeners to the text inputs.
   *
   * @param {Function} emitChange
   * @param {Function} preview
   * @private
   */
  addEventListenersToTextInputs(emitChange, preview) {
    const substAliasesString = ['subst:'].concat(cd.config.substAliases).join('|');
    const textReactions = [
      {
        regexp: new RegExp(cd.g.signCode + '\\s*$'),
        message: cd.sParse('cf-reaction-signature', cd.g.signCode),
        name: 'signatureNotNeeded',
        type: 'notice',
        checkFunc: () => !this.omitSignatureCheckbox?.isSelected(),
      },
      {
        regexp: /<pre[ >]/,
        message: cd.sParse(
          'cf-reaction-pre',
          '<code><nowiki><pre></'.concat('nowiki></code>'),
          '<code><nowiki><syntaxhighlight lang="wikitext"></'.concat('nowiki></code>')
        ),
        name: 'dontUsePre',
        type: 'warning',
      },
      {
        regexp: new RegExp(`\\{\\{(?! *(${substAliasesString}))`, 'i'),
        message: cd.sParse('cf-reaction-templateinheadline'),
        type: 'warning',
        name: 'templateInHeadline',
        target: 'headline',
        checkFunc: () => !this.preloadConfig?.headline,
      },
    ].concat(cd.config.textReactions);

    if (this.headlineInput) {
      this.headlineInput
        .on('change', (headline) => {
          this.updateAutoSummary(true, true);

          textReactions
            .filter(({ target }) => target === 'headline' || target === 'all')
            .forEach((reaction) => {
              this.reactToText(headline, reaction);
            });
        })
        .on('change', preview)
        .on('change', emitChange);

      this.headlineInput
        .on('enter', this.submit.bind(this));
    }

    this.commentInput
      .on('change', (text) => {
        if (this.richFormattingPopup) {
          this.teardownInputPopups();
        }

        this.updateAutoSummary(true, true);

        textReactions
          .filter(({ target }) => !target || target === 'comment' || target === 'all')
          .forEach((reaction) => {
            this.reactToText(text, reaction);
          });
      })
      .on('change', preview)
      .on('change', emitChange);

    this.commentInput.$input
      .on('dragover', (event) => {
        if (
          ![...event.originalEvent.dataTransfer.items].some(((item) => (
            CommentForm.allowedFileTypes.includes(item.type)
          )))
        ) {
          return;
        }
        this.commentInput.$element.addClass('cd-input-acceptFile');
        event.preventDefault();
      })
      .on('dragleave drop blur', () => {
        this.commentInput.$element.removeClass('cd-input-acceptFile');
      })
      .on('paste drop', this.handlePasteDrop.bind(this))
      .on('tribute-replaced', (event) => {
        if (event.originalEvent.detail.instance.trigger === cd.config.mentionCharacter) {
          if (this.mode === 'edit') {
            this.showMessage(
              wrapHtml(cd.sParse('cf-reaction-mention-edit'), { targetBlank: true }),
              {
                type: 'notice',
                name: 'mentionEdit',
              }
            );
          }
          if (
            this.omitSignatureCheckbox?.isSelected() &&
            !this.commentInput.getValue().includes(cd.g.signCode)
          ) {
            this.showMessage(
              wrapHtml(cd.sParse('cf-reaction-mention-nosignature'), {
                targetBlank: true,
              }),
              {
                type: 'notice',
                name: 'mentionNoSignature',
              }
            );
          }
        }
      });

    // "Performance issues?" hint
    if (
      controller.isLongPage() &&
      $.client.profile().layout === 'webkit' &&
      !this.improvePerformance &&
      !this.haveSuggestedToImprovePerformanceRecently()
    ) {
      const keypressCount = 10;
      const rateLimit = 50;
      const checkForPerformanceIssues = (e) => {
        this.checkForPerformanceIssues(e, keypressCount, rateLimit);
      };
      this.commentInput.$input.on('input', checkForPerformanceIssues);
      this.headlineInput?.$input.on('input', checkForPerformanceIssues);
    }

    this.summaryInput
      .on('manualChange', () => {
        this.summaryAltered = true;
        this.summaryAutopreviewBlocked = false;
      })
      .on('change', () => {
        if (!this.summaryAutopreviewBlocked) {
          preview();
        }
      })
      .on('change', emitChange);

    this.summaryInput
      .on('enter', this.submit.bind(this));
  }

  /**
   * Add event listeners to the checkboxes.
   *
   * @param {Function} emitChange
   * @param {Function} preview
   * @private
   */
  addEventListenersToCheckboxes(emitChange, preview) {
    this.minorCheckbox
      ?.on('change', emitChange);
    this.watchCheckbox
      ?.on('change', emitChange);
    this.subscribeCheckbox
      ?.on('change', emitChange);
    this.omitSignatureCheckbox
      ?.on('change', preview)
      .on('manualChange', () => {
        this.omitSignatureCheckboxAltered = true;
      })
      .on('change', emitChange);
    this.deleteCheckbox
      ?.on('change', (selected) => {
        this.updateAutoSummary(true, true);
        this.updateFormOnDeleteCheckboxChange(selected);
      })
      .on('change', preview)
      .on('change', emitChange);
  }

  /**
   * Add event listeners to the buttons.
   *
   * @private
   */
  addEventListenersToButtons() {
    this.advancedButton.on('click', () => {
      this.toggleAdvanced();
    });
    this.settingsButton?.on('click', () => {
      settings.showDialog();
    });
    this.cancelButton.on('click', () => {
      this.cancel();
    });
    this.viewChangesButton.on('click', () => {
      this.viewChanges();
    });
    this.previewButton.on('click', () => {
      this.preview(false);
    });
    this.submitButton.on('click', () => {
      this.submit();
    });
  }

  /**
   * Add event listeners to form elements.
   *
   * @private
   */
  addEventListeners() {
    const emitChange = () => {
      this.emit('change');
    };
    const preview = () => {
      this.preview();
    };

    this.$element
      // Hotkeys
      .on('keydown', (e) => {
        // Ctrl+Enter
        if (keyCombination(e, 13, ['cmd'])) {
          this.submit();
        }

        // Esc
        if (keyCombination(e, 27)) {
          this.cancel();
        }

        // WikiEditor started supporting these in October 2024
        // https://phabricator.wikimedia.org/T62928
        if (!this.showToolbar) {
          // Ctrl+B
          if (keyCombination(e, 66, ['cmd'])) {
            this.encapsulateSelection({
              pre: "'''",
              peri: mw.msg('wikieditor-toolbar-tool-bold-example'),
              post: "'''",
            });
            e.preventDefault();
          }

          // Ctrl+I
          if (keyCombination(e, 73, ['cmd'])) {
            this.encapsulateSelection({
              pre: "''",
              peri: mw.msg('wikieditor-toolbar-tool-italic-example'),
              post: "''",
            });
            e.preventDefault();
          }

          // Ctrl+U
          if (keyCombination(e, 85, ['cmd'])) {
            this.encapsulateSelection(CommentForm.encapsulateOptions.underline);
            e.preventDefault();
          }
        }

        // Ctrk+Shift+5
        if (keyCombination(e, 53, ['cmd', 'shift'])) {
          this.encapsulateSelection(CommentForm.encapsulateOptions.strikethrough);
          e.preventDefault();
        }

        // Ctrk+Shift+6
        if (keyCombination(e, 54, ['cmd', 'shift'])) {
          this.encapsulateSelection(CommentForm.encapsulateOptions.code);
          e.preventDefault();
        }

        // Ctrk+Shift+8
        if (keyCombination(e, 56, ['cmd', 'shift'])) {
          this.commentInput.$element.find('.tool[rel="ulist"] a')[0]?.click();
          e.preventDefault();
        }
      })

      // "focusin" is "focus" that bubbles, i.e. propagates up the node tree.
      .on('focusin', () => {
        this.lastFocused = new Date();
        controller.updatePageTitle();
      });

    this.addEventListenersToTextInputs(emitChange, preview);
    this.addEventListenersToCheckboxes(emitChange, preview);
    this.addEventListenersToButtons();
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
      commentsInSection = commentRegistry.query((comment) => !comment.section);
    }
    if (this.mode === 'edit') {
      commentsInSection = commentsInSection.filter((comment) => comment !== this.target);
    }

    let pageOwner;
    if (cd.g.namespaceNumber === 3) {
      const userName = (cd.page.title.match(/^([^/]+)/) || [])[0];
      if (userName) {
        pageOwner = userRegistry.get(userName);
      }
    }
    let defaultUserNames = commentsInSection
      .map((comment) => comment.author)
      .concat(
        // User links in the section
        commentsInSection.flatMap((comment) => (
          comment.$elements
            .find('a')
            .filter((i, el) => (
              cd.g.userLinkRegexp.test(el.title) &&
              !el.closest(settings.get('reformatComments') ? '.cd-comment-author' : '.cd-signature')
            ))
            .get()
            .map((el) => Parser.processLink(el)?.userName)
            .filter(defined)
            .map((userName) => userRegistry.get(userName))
        ))
      )
      .concat(pageOwner)
      .filter(defined)
      .sort((u1, u2) => u2.isRegistered() - u1.isRegistered() || (u2.name > u1.name ? -1 : 1))
      .filter((u) => u !== cd.user)
      .map((u) => u.name);

    // Move the addressee to the beginning of the user list
    if (this.parentComment) {
      for (let с = this.parentComment; с; с = с.getParent()) {
        if (с.author !== cd.user) {
          if (!с.author.isRegistered()) break;
          defaultUserNames.unshift(с.author.getName());
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
    this.autocomplete.init();

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
      this.headlineAutocomplete.init();
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
    this.summaryAutocomplete.init();
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
      this.summaryInput
        .focus()
        .selectRange(match ? match[0].length : 0, value.length);
    } else {
      this.$advanced.hide();
      this.commentInput.focus();
    }
  }

  /**
   * Adjust the button labels according to the form width: if the form is to narrow, the labels will
   * shrink.
   */
  adjustLabels() {
    const formWidth = /** @type {number} */ (this.$element.width());
    const additive = 7;

    if (this.$element.hasClass('cd-commentForm-short')) {
      if (formWidth >= this.buttonsTotalWidthStandard + additive) {
        this.$element.removeClass('cd-commentForm-short');
        this.submitButton.setLabel(this.submitButtonLabelStandard);
        this.previewButton.setLabel(cd.s('cf-preview'));
        this.viewChangesButton.setLabel(cd.s('cf-viewchanges'));
        this.cancelButton.setLabel(cd.s('cf-cancel'));
      }
    } else {
      this.buttonsTotalWidthStandard = [
        'submitButton',
        'previewButton',
        'viewChangesButton',
        'cancelButton',
        'advancedButton',
        'helpPopupButton',
        'settingsButton',
      ]
        .map((name) => this[name]?.$element)
        .filter(defined)
        .filter(($el) => $el.is(':visible'))
        .reduce((width, $el) => width + $el.outerWidth(true), 0);
      if (formWidth < this.buttonsTotalWidthStandard + additive) {
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
   * @param {boolean} affectsHeadline Should the `pushPending` method be applied to the headline
   *   input.
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.mixin.PendingElement.html#pushPending
   */
  pushPending(setDisabled = false, affectsHeadline = true) {
    this.commentInput.pushPending();
    this.summaryInput.pushPending();
    if (affectsHeadline) {
      this.headlineInput?.pushPending();
    }

    if (setDisabled) {
      this.commentInput.setDisabled(true);
      this.summaryInput.setDisabled(true);
      if (affectsHeadline) {
        this.headlineInput?.setDisabled(true);
      }

      this.submitButton.setDisabled(true);
      this.previewButton.setDisabled(true);
      this.viewChangesButton.setDisabled(true);
      this.cancelButton.setDisabled(true);

      this.minorCheckbox?.setDisabled(true);
      this.watchCheckbox?.setDisabled(true);
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
   * @param {boolean} [affectsHeadline=true] Should the `popPending` method be applied to the
   *   headline input.
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.mixin.PendingElement.html#popPending
   */
  popPending(setEnabled = false, affectsHeadline = true) {
    this.commentInput.popPending();
    this.summaryInput.popPending();
    if (affectsHeadline) {
      this.headlineInput?.popPending();
    }

    if (setEnabled) {
      this.commentInput.setDisabled(false);
      this.summaryInput.setDisabled(false);
      if (affectsHeadline) {
        this.headlineInput?.setDisabled(false);
      }

      this.submitButton.setDisabled(false);
      this.previewButton.setDisabled(false);
      this.viewChangesButton.setDisabled(false);
      this.cancelButton.setDisabled(false);

      this.minorCheckbox?.setDisabled(false);
      this.watchCheckbox?.setDisabled(false);
      this.subscribeCheckbox?.setDisabled(false);
      this.omitSignatureCheckbox?.setDisabled(false);
      this.deleteCheckbox?.setDisabled(false);

      // Restore disabled states caused by the delete checkbox being checked
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
   * @param {'notice'|'error'|'warning'|'success'} [options.type='notice'] See the
   *   {@link https://doc.wikimedia.org/oojs-ui/master/demos/?page=widgets&theme=wikimediaui&direction=ltr&platform=desktop#MessageWidget-type-notice-inline-true OOUI Demos}.
   * @param {string} [options.name] Name added to the class name of the message element.
   * @param {boolean} [options.isRaw=false] Message HTML contains the whole message code. It doesn't
   *   need to be wrapped in a widget.
   */
  showMessage(htmlOrJquery, { type = 'notice', name, isRaw = false } = {}) {
    // Don't show two messages with the same name (we assume they should have the same text).
    if (this.torndown || (name && this.$messageArea.children(`.cd-message-${name}`).length)) {
      return;
    }

    this.$messageArea
      .append(
        isRaw ?
          htmlOrJquery :
          (
            new OO.ui.MessageWidget({
              type,
              inline: true,
              label: htmlOrJquery instanceof $ ? htmlOrJquery : wrapHtml(htmlOrJquery),
              classes: ['cd-message', name ? `cd-message-${name}` : undefined].filter(defined),
            })
          ).$element
      )
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
    if (this.$messageArea.children().length === 1) {
      this.$messageArea.cdRemoveCloseButton();
    }
  }

  /**
   * Abort the operation the form is undergoing and show an error message.
   *
   * @param {object} options
   * @param {string|JQuery} options.message Message visible to the user.
   * @param {'error'|'notice'|'warning'} [options.messageType='error'] Message type if not
   *   `'error'`.
   * @param {boolean} [options.isRawMessage=false] Show the message as it is, without icons and
   *   framing.
   * @param {string} [options.logMessage] Message for the browser console.
   * @param {boolean} [options.cancel=false] Cancel the form and show the message as a notification.
   * @param {import('./CommentFormOperationRegistry').CommentFormOperation} [options.operation]
   *   Operation the form is undergoing.
   * @private
   */
  abort({
    message,
    messageType = 'error',
    isRawMessage = false,
    logMessage,
    cancel = false,
    operation,
  }) {
    operation?.close();

    if (this.torndown) return;

    if (logMessage) {
      console.warn(logMessage);
    }

    if (cancel) {
      notifications.add(message instanceof $ ? message : wrapHtml(message), {
        type: 'error',
        autoHideSeconds: 'long',
      });
      this.cancel(false);
    } else {
      if (!this.registered) return;
      if (!(operation && operation.getType() === 'preview' && operation.getOption('isAuto'))) {
        this.showMessage(message, {
          type: messageType,
          isRaw: isRawMessage,
        });
      }
      this.$messageArea.cdScrollIntoView('top');
      this.captchaInput?.focus();
    }
  }

  /**
   * Abort an operation the form is undergoing and show an appropriate error message. This method is
   * a wrapper around `CommentForm#abort`.
   *
   * @param {object} options
   * @param {'parse'|'api'|'network'|'javascript'|'ui'} options.type Type of the error:
   *   * `'parse'` for parse errors defined in the script,
   *   * `'api'` for MediaWiki API errors,
   *   * `'network'` for network errors defined in the script,
   *   * `'javascript'` for JavaScript errors,
   *   * `'ui'` for UI errors.
   * @param {string} [options.code] Code of the error. (Either `code`, `apiResp`, or `message`
   *   should be specified.)
   * @param {object} [options.details] Additional details about the error.
   * @param {object} [options.apiResp] Data object received from the MediaWiki server. (Either
   *   `code`, `apiResp`, or `message` should be specified.)
   * @param {string} [options.message] Text of the error. (Either `code`, `apiResp`, or `message`
   *   should be specified.)
   * @param {'error'|'notice'|'warning'} [options.messageType='error'] Message type if not
   *   `'error'`.
   * @param {string} [options.logMessage] Data or text to display in the browser console.
   * @param {boolean} [options.cancel=false] Cancel the form and show the message as a notification.
   * @param {boolean} [options.isRawMessage=false] Show the message as it is, without OOUI framing.
   * @param {import('./CommentFormOperationRegistry').CommentFormOperation} [options.operation]
   *   Operation the form is undergoing.
   */
  handleError({
    type,
    code,
    details,
    apiResp,
    message,
    messageType = 'error',
    logMessage,
    cancel = false,
    isRawMessage = false,
    operation,
  }) {
    switch (type) {
      case 'parse': {
        const editUrl = cd.g.server + cd.page.getUrl({ action: 'edit' });
        switch (code) {
          case 'locateComment':
            message = cd.sParse('error-locatecomment', editUrl, cd.page.name);
            break;
          case 'locateSection':
            message = cd.sParse('error-locatesection', editUrl, cd.page.name);
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
            message = cd.sParse('cf-error-findplace', editUrl);
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
        message = wrapHtml(message, {
          callbacks: {
            'cd-message-reloadPage': async () => {
              if (this.confirmClose()) {
                this.reloadPage();
              }
            },
          },
        });
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
            const error = apiResp.errors[0];
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

        message = wrapHtml(message);
        message.find('.mw-parser-output').css('display', 'inline');
        logMessage ||= [code, apiResp];
        break;
      }

      case 'network':
      case 'javascript': {
        message = (message ? message + ' ' : '') + cd.sParse(`error-${type}`);
        break;
      }
    }

    this.abort({ message, messageType, isRawMessage, logMessage, cancel, operation });
  }

  /**
   * Convert the comment form input to wikitext.
   *
   * @param {'submit'|'viewChanges'|'preview'} action
   * @returns {string}
   * @throws {CdError}
   */
  inputToCode(action) {
    // Are we at a stage where we better introduce a lexical analyzer (or use MediaWiki's / some
    // part of it)?..

    let code = this.commentInput.getValue();
    code = cd.config.preTransformCode?.(code, this) || code;

    const transformer = new CommentFormInputTransformer(code, this, action);

    /**
     * Will the comment be indented (is a reply or an edited reply).
     *
     * This is mostly to tell if unconverted newlines will cause problems in the comment layout and
     * prevent it. Theoretically, this value can change.
     *
     * @type {boolean|undefined}
     */
    this.willCommentBeIndented = transformer.isIndented();

    code = transformer.transform();
    code = cd.config.postTransformCode?.(code, this) || code;

    return code;
  }

  /**
   * Add anchor code to comments linked from the comment.
   *
   * @param {string} originalContextCode Code of the section or page.
   * @param {string[]} commentIds
   * @returns {string} New code of the section or page.
   * @throws {CdError}
   * @private
   */
  addAnchorsToComments(originalContextCode, commentIds) {
    let contextCode = originalContextCode;
    commentIds.forEach((id) => {
      const comment = commentRegistry.getById(id);
      if (comment) {
        const commentSource = comment.locateInCode(false, contextCode);
        const anchorCode = cd.config.getAnchorCode(id);
        if (commentSource.code.includes(anchorCode)) return;

        const commentCodePart = CommentFormInputTransformer.prependIndentationToLine(
          commentSource.indentation,
          commentSource.code
        );
        const commentTextIndex = commentCodePart.match(/^[:*#]* */)[0].length;
        ({ contextCode } = commentSource.modifyContext({
          action: 'edit',
          commentCode: (
            (commentSource.headingCode || '') +
            commentCodePart.slice(0, commentTextIndex) +
            anchorCode +
            commentCodePart.slice(commentTextIndex) +
            commentSource.signatureDirtyCode
          ),
          contextCode,
        }));
      } else if (!$('#' + id).length) {
        throw new CdError({
          type: 'parse',
          code: 'commentLinks-commentNotFound',
          details: { id },
        });
      }
    });

    return contextCode;
  }

  /**
   * Prepare the new wikitext of the section or page based on the comment form input and handle
   * errors.
   *
   * @param {'submit'|'viewChanges'} action
   * @param {import('./CommentFormOperationRegistry').CommentFormOperation} operation Operation the
   *   form is undergoing.
   * @returns {Promise.<object|undefined>}
   * @private
   */
  async buildSource(action, operation) {
    const commentIds = CommentForm.extractCommentIds(this.commentInput.getValue());

    this.newSectionApi = Boolean(
      this.mode === 'addSection' &&
      !this.newTopicOnTop &&
      this.headlineInput?.getValue().trim() &&
      !commentIds.length
    );

    if (!this.newSectionApi) {
      try {
        await this.target.loadCode(this.mode === 'addSection' ? !cd.page.exists() : this);
      } catch (e) {
        if (e instanceof CdError) {
          this.handleError(
            Object.assign({
              message: cd.sParse('cf-error-getpagecode'),
              operation,
            }, e.data)
          );
        } else {
          this.handleError({
            type: 'javascript',
            logMessage: e,
            operation,
          });
        }
        return;
      }
    }

    let contextCode;
    let commentCode;
    try {
      ({ contextCode, commentCode } = this.target.source.modifyContext({
        // Ugly solution to avoid overcomplication of code: for replies, we need to get
        // CommentSource#isReplyOutdented set for `action === 'reply'` which we don't have so far.
        // So let CommentSource#modifyContext compute it. In the rest of cases just get the comment
        // code.
        commentCode: this.mode === 'reply' ? undefined : this.inputToCode(action),

        action: this.mode,
        formAction: action,
        doDelete: this.deleteCheckbox?.isSelected(),
        commentForm: this,
      }));
      contextCode = this.addAnchorsToComments(contextCode, commentIds);
    } catch (e) {
      if (e instanceof CdError) {
        this.handleError(Object.assign(e.data, { operation }));
      } else {
        this.handleError({
          type: 'javascript',
          logMessage: e,
          operation,
        });
      }
      return;
    }

    return { contextCode, commentCode };
  }

  /**
   * Check if the form is being submitted right now.
   *
   * @returns {boolean}
   */
  isBeingSubmitted() {
    return Boolean(this.operations.filterByType('submit').length);
  }

  /**
   * Check if the content of the form is being loaded right now.
   *
   * @returns {boolean}
   */
  isContentBeingLoaded() {
    return Boolean(this.operations.filterByType('load').length);
  }

  /**
   * Update the preview area with the content of the preview.
   *
   * @param {string} html
   * @private
   */
  updatePreview(html) {
    this.$previewArea
      .html(html)
      .prepend(
        $('<div>')
          .addClass('cd-commentForm-previewArea-label')
          .text(cd.s('cf-block-preview'))
      )
      .cdAddCloseButton()
      .toggleClass('cd-commentForm-previewArea-indentedComment', this.willCommentBeIndented);

    /**
     * A comment preview has been rendered.
     *
     * @event previewReady
     * @param {JQuery} $previewArea {@link CommentForm#$previewArea} object.
     * @param {object} cd {@link convenientDiscussions} object.
     */
    mw.hook('convenientDiscussions.previewReady').fire(this.$previewArea, cd);

    mw.hook('wikipage.content').fire(this.$previewArea);
  }

  /**
   * Preview the comment.
   *
   * @param {boolean} [isAuto=true] Preview is initiated automatically (if the user has the
   *   `autopreview` setting set to `true`).
   * @param {import('./CommentFormOperationRegistry').CommentFormOperation} [operation] Operation
   *   object when the function is called from within itself, being delayed.
   * @fires previewReady
   */
  async preview(isAuto = true, operation) {
    if (
      this.isContentBeingLoaded() ||
      (!this.autopreview && (isAuto || this.isBeingSubmitted()))
    ) {
      operation?.close();
      return;
    }

    operation ||= this.operations.add('preview', { isAuto });

    if (isAuto) {
      const isTooEarly = Date.now() - this.lastPreviewTimestamp < 1000;
      if (
        isTooEarly ||
        this.operations.filterByType('preview').some((op) => op !== operation)
      ) {
        if (this.previewTimeout) {
          operation.close();
        } else {
          operation.delay();
          this.previewTimeout = setTimeout(() => {
            this.previewTimeout = null;
            this.preview(true, operation);
          }, isTooEarly ? 1000 - (Date.now() - this.lastPreviewTimestamp) : 100);
        }
        return;
      }
      operation.undelay();
      this.lastPreviewTimestamp = Date.now();
    }

    if (operation.maybeClose()) return;

    /*
      This condition can be met:
      - when restoring the form from a session backup;
      - when the target comment has not been loaded yet, possibly because of an error when tried to
        (if the mode is 'edit' and the comment has not been loaded, this method would halt after
        looking for an unclosed 'load' operation above).
     */
    if (this.mode !== 'addSection' && !this.target.source) {
      await this.checkCode();
      if (!this.target.source) {
        operation.close();
      }
      if (operation.isClosed()) return;
    }

    const commentInputValue = this.commentInput.getValue();

    // In case of an empty comment input, we in fact make this request for the sake of parsing the
    // summary if there is a need. The other possibility is previewing by clicking the relevant
    // button.
    const areInputsEmpty = !commentInputValue.trim() && !this.headlineInput?.getValue().trim();

    let html;
    let parsedSummary;
    try {
      ({ html, parsedSummary } = await parseCode(this.inputToCode('preview'), {
        title: this.targetPage.name,
        summary: buildEditSummary({ text: this.summaryInput.getValue() }),
      }));
    } catch (e) {
      if (e instanceof CdError) {
        this.handleError(
          Object.assign({}, e.data, {
            message: cd.sParse('cf-error-preview'),
            operation,
          })
        );
      } else {
        this.handleError({
          type: 'javascript',
          logMessage: e,
          operation,
        });
      }
      return;
    }

    if (operation.maybeClose()) return;

    if (html) {
      if ((isAuto && areInputsEmpty) || this.deleteCheckbox?.isSelected()) {
        this.$previewArea.empty();
      } else {
        this.updatePreview(html);
      }

      // Workaround to omit the signature when templates containing a signature, like
      // https://en.wikipedia.org/wiki/Template:Requested_move, are substituted.
      if (this.omitSignatureCheckbox && !this.omitSignatureCheckboxAltered) {
        const substAliasesString = ['subst:'].concat(cd.config.substAliases).join('|');
        if ((new RegExp(`{{ *(${substAliasesString})`, 'i')).test(commentInputValue)) {
          const signatureText = this.$previewArea.find('.cd-commentForm-signature').text();
          const previewText = this.$previewArea.text();
          if (
            signatureText &&
            previewText.indexOf(signatureText) !== previewText.lastIndexOf(signatureText)
          ) {
            this.omitSignatureCheckbox.setSelected(true);
          }
        } else {
          this.omitSignatureCheckbox.setSelected(false);
        }
      }

      this.$summaryPreview.empty();
      if (parsedSummary) {
        this.$summaryPreview.append(
          document.createTextNode(cd.sParse('cf-summary-preview')),
          document.createTextNode(cd.mws('colon-separator')),
          $('<span>')
            .addClass('comment')
            .html(parsedSummary),
        );
      }
    }

    if (this.autopreview && this.previewButton.$element.is(':visible')) {
      this.previewButton.toggle(false);
      this.viewChangesButton.toggle(true);
    }

    operation.close();

    if (!isAuto) {
      this.$previewArea.cdScrollIntoView(
        this.$previewArea.hasClass('cd-commentForm-previewArea-above') ?
          'top' :
          'bottom'
      );
      this.commentInput.focus();
    }
  }

  /**
   * View changes in the page code after submitting the form.
   */
  async viewChanges() {
    if (this.isBeingSubmitted()) return;

    const operation = this.operations.add('viewChanges');

    const { contextCode } = await this.buildSource('viewChanges', operation) || {};
    if (operation.isClosed()) return;

    mw.loader.load('mediawiki.diff.styles');

    let resp;
    try {
      const options = {
        action: 'compare',
        totitle: this.targetPage.name,
        toslots: 'main',
        'totext-main': contextCode,
        topst: true,
        prop: 'diff',
        ...cd.g.apiErrorFormatHtml,
      };

      if (this.sectionSubmitted || this.newSectionApi || !this.targetPage.revisionId) {
        options.fromslots = 'main';
        options['fromtext-main'] = this.sectionSubmitted ? this.targetSection.presumedCode : '';
      } else {
        options.fromrev = this.targetPage.revisionId;
      }

      resp = await controller.getApi().post(options, {
        // Beneficial when sending long unicode texts, which is what we do here.
        contentType: 'multipart/form-data',
      }).catch(handleApiReject);
    } catch (e) {
      if (e instanceof CdError) {
        this.handleError(
          Object.assign({}, e.data, {
            message: cd.sParse('cf-error-viewchanges'),
            operation,
          })
        );
      } else {
        this.handleError({
          type: 'javascript',
          logMessage: e,
          operation,
        });
      }
      return;
    }

    if (operation.maybeClose()) return;

    let html = resp.compare?.body;
    if (html) {
      this.$previewArea
        .html(wrapDiffBody(html))
        .prepend(
          $('<div>')
            .addClass('cd-commentForm-previewArea-label')
            .text(cd.s('cf-block-viewchanges'))
        )
        .cdAddCloseButton();
    } else {
      this.$previewArea.empty();
      if (html !== undefined) {
        this.showMessage(cd.sParse('cf-notice-nochanges'));
      }
    }

    if (this.autopreview) {
      this.viewChangesButton.toggle(false);
      this.previewButton.toggle(true);
    }

    operation.close();

    this.$previewArea.cdScrollIntoView(
      this.$previewArea.hasClass('cd-commentForm-previewArea-above') ?
        'top' :
        'bottom'
    );
    this.commentInput.focus();
  }

  /**
   * Remove references to the form and reload the page.
   *
   * @param {object} [bootData] Data to pass to the boot process.
   * @param {import('./CommentFormOperationRegistry').CommentFormOperation} [operation] Operation
   */
  async reloadPage(bootData, operation) {
    this.unregister();

    if (!cd.page.exists()) {
      const url = new URL(location.href);
      url.searchParams.delete('cdaddtopic');
      url.searchParams.delete('section');
      url.searchParams.delete('action');
      url.hash = bootData.commentIds[0];
      const currentPathnameAndSearch = location.pathname + location.search;
      location.href = url.toString();
      if (currentPathnameAndSearch === url.pathname + url.search) {
        location.reload();
      }
      return;
    }

    try {
      await controller.reload(bootData);
    } catch (e) {
      if (e instanceof CdError) {
        this.handleError(
          Object.assign({}, e.data, {
            message: cd.sParse('error-reloadpage-saved'),
            cancel: true,
            operation,
          })
        );
      } else {
        this.handleError({
          type: 'javascript',
          logMessage: e,
          cancel: true,
          operation,
        });
      }
      controller.hideLoadingOverlay();
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
          !cd.config.dontConfirmEmptyCommentPages.some((regexp) => cd.page.name.match(regexp))
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
        this.commentInput.focus();
        return false;
      }
    }

    return true;
  }

  /**
   * Send a post request to edit the page and handle errors.
   *
   * @param {string} code Code to save.
   * @param {import('./CommentFormOperationRegistry').CommentFormOperation} operation Operation the
   *   form is undergoing.
   * @param {boolean} [suppressTag=false]
   * @returns {Promise.<object|null>}
   * @private
   */
  async editPage(code, operation, suppressTag = false) {
    let result;
    try {
      const options = {
        text: code,
        summary: buildEditSummary({ text: this.summaryInput.getValue() }),
        minor: this.minorCheckbox?.isSelected(),
        watchlist: this.watchCheckbox?.isSelected() ? 'watch' : 'unwatch',
        captchaid: this.captchaInput?.getCaptchaId(),
        captchaword: this.captchaInput?.getCaptchaWord(),
      };
      let sectionOrPage;
      if (this.newSectionApi) {
        options.sectiontitle = this.headlineInput.getValue().trim();
        options.section = 'new';
      } else if (this.sectionSubmitted) {
        options.section = this.targetSection.liveSectionNumber;
        sectionOrPage = this.targetSection;
      } else {
        sectionOrPage = this.targetPage;
      }
      options.baserevid = sectionOrPage?.revisionId;
      options.starttimestamp = sectionOrPage?.queryTimestamp;
      if (suppressTag) {
        options.tags = undefined;
      }
      result = await this.targetPage.edit(options);
    } catch (e) {
      delete this.captchaInput;

      if (e instanceof CdError) {
        const { type, details, apiResp } = e.data;
        if (type === 'network') {
          this.handleError({
            type,
            message: cd.sParse('cf-error-couldntedit'),
            operation,
          });
        } else {
          let messageType;
          let { code, message, isRawMessage, logMessage } = details;
          if (code === 'editconflict') {
            message += ' ' + cd.sParse('cf-notice-editconflict-retrying');
            messageType = 'notice';
          } else if (code === 'captcha' && mw.libs.confirmEdit) {
            this.captchaInput = new mw.libs.confirmEdit.CaptchaInputWidget(apiResp.edit.captcha);
            this.captchaInput.on('enter', () => {
              this.submit();
            });
            let captchaMessage = new OO.ui.MessageWidget({
              type: 'notice',
              label: this.captchaInput.$element,
            });
            message = captchaMessage.$element;
          }

          // FIXME: We don't pass apiResp to prevent the message for `missingtitle` to be overriden,
          // which is hacky.
          this.handleError({
            type,
            message,
            messageType,
            isRawMessage,
            logMessage,
            operation,
          });

          if (code === 'editconflict') {
            this.submit(false);
          }
          if (code === 'tags-apply-blocked') {
            this.submit(false, true);
          }
        }
      } else {
        this.handleError({
          type: 'javascript',
          logMessage: e,
          operation,
        });
      }
      return null;
    }

    return result;
  }

  /**
   * Subscribe and unsubscribe from topics.
   *
   * @param {string} editTimestamp
   * @param {string} commentCode
   * @param {import('./BootProcess').PassedData} bootData
   * @private
   */
  updateSubscriptionStatus(editTimestamp, commentCode, bootData) {
    if (this.subscribeCheckbox.isSelected()) {
      // Add the created section to the subscription list or change the headline for legacy
      // subscriptions.
      if (
        // FIXME: fix behavior for sections added with no headline (that are, in fact, comments
        // added to the preceding section)
        this.mode === 'addSection' ||
        (
          !this.useTopicSubscription &&
          (this.mode === 'addSubsection' || this.sectionOpeningCommentEdited)
        )
      ) {
        let rawHeadline;
        let headline;
        if (this.headlineInput) {
          rawHeadline = this.headlineInput.getValue().trim();
        }
        if (!this.sectionOpeningCommentEdited && !rawHeadline) {
          [, rawHeadline] = commentCode.match(/^==(.*?)==[ \t]*$/m) || [];
        }
        headline = rawHeadline && removeWikiMarkup(rawHeadline);

        let subscribeId;
        let originalHeadline;
        let isHeadlineAltered;
        if (this.useTopicSubscription) {
          subscribeId = sectionRegistry.generateDtSubscriptionId(cd.user.getName(), editTimestamp);
        } else {
          subscribeId = headline;
          if (this.sectionOpeningCommentEdited) {
            originalHeadline = removeWikiMarkup(this.originalHeadline);
            isHeadlineAltered = subscribeId !== originalHeadline;
          }
        }

        if (subscribeId !== undefined) {
          bootData.justSubscribedToSection = subscribeId;
          if (isHeadlineAltered) {
            bootData.justUnsubscribedFromSection = originalHeadline;
          }
          controller.getSubscriptionsInstance()
            .subscribe(subscribeId, headline, originalHeadline, true);
        }
      } else {
        const section = this.targetSection?.getSectionSubscribedTo();
        if (section && !section.subscriptionState) {
          section.ensureSubscribeIdPresent(editTimestamp);
          section.subscribe('silent');
          bootData.justSubscribedToSection = section.subscribeId;
        }
      }
    } else {
      const section = this.targetSection?.getSectionSubscribedTo();
      if (section?.subscriptionState) {
        section.ensureSubscribeIdPresent(editTimestamp);
        section.unsubscribe('silent');
        bootData.justUnsubscribedFromSection = section.subscribeId;
      }
    }
  }

  /**
   * Generate a comment ID to jump to after the page is reloaded, taking possible collisions into
   * account.
   *
   * @param {string} editTimestamp
   * @returns {string}
   * @private
   */
  generateFutureCommentId(editTimestamp) {
    const date = new Date(editTimestamp);

    // Timestamps on the page (and therefore anchors) have no seconds.
    date.setSeconds(0);

    return Comment.generateId(
      date,
      cd.user.getName(),
      commentRegistry.getAll()
        .slice(0, this.target.getCommentAboveReply(this)?.index + 1 ?? 0)
        .filter((comment) => (
          comment.author === cd.user &&
          comment.date?.getTime() === date.getTime()
        ))
        .map((comment) => comment.id)
    );
  }

  /**
   * Submit the form.
   *
   * @param {boolean} [clearMessages=true]
   * @param {boolean} [suppressTag=false]
   */
  async submit(clearMessages = true, suppressTag = false) {
    const doDelete = this.deleteCheckbox?.isSelected();
    if (this.isBeingSubmitted() || this.isContentBeingLoaded() || !this.runChecks({ doDelete })) {
      return;
    }

    if (commentFormRegistry.getAll().some((commentForm) => commentForm.isBeingSubmitted())) {
      this.handleError({
        type: 'ui',
        message: cd.sParse('cf-error-othersubmitted'),
      });
      return;
    }

    const operation = this.operations.add('submit', undefined, clearMessages);

    const { contextCode, commentCode } = await this.buildSource('submit', operation) || {};
    if (operation.isClosed()) return;

    const editTimestamp = await this.editPage(contextCode, operation, suppressTag);

    // The operation is closed inside CommentForm#editPage().
    if (!editTimestamp) return;

    // Here we use a trick where we pass, in bootData, the name of the section that was set to be
    // be watched/unwatched using a checkbox in a form just sent. The server doesn't manage to
    // update the value quickly enough, so it returns the old value, but we must display the new
    // one.
    const bootData = { submittedCommentForm: this };

    if (this.subscribeCheckbox) {
      this.updateSubscriptionStatus(editTimestamp, commentCode, bootData);
    }

    if (this.watchCheckbox?.isSelected() && $('#ca-watch').length) {
      $('#ca-watch')
        .attr('id', 'ca-unwatch')
        .find('a')
        .attr('href', cd.page.getUrl({ action: 'unwatch' }));
    }
    if (!this.watchCheckbox?.isSelected() && $('#ca-unwatch').length) {
      $('#ca-unwatch')
        .attr('id', 'ca-watch')
        .find('a')
        .attr('href', cd.page.getUrl({ action: 'watch' }));
    }

    if (!doDelete) {
      // Generate an ID for the comment to jump to.
      bootData.commentIds = [
        this.mode === 'edit' ? this.target.id : this.generateFutureCommentId(editTimestamp),
      ];
    }

    // When the edit takes place on another page that is transcluded in the current one, we must
    // purge the current page, otherwise we may get an old version without the submitted comment.
    if (this.targetPage !== cd.page) {
      await cd.page.purge();
    }

    this.reloadPage(bootData, operation);
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
   * Close the form, asking for confirmation if necessary, and scroll to the target comment if
   * available.
   *
   * @param {boolean} [confirmClose=true] Whether to confirm form close.
   */
  async cancel(confirmClose = true) {
    if (controller.isPageOverlayOn() || this.isBeingSubmitted()) return;

    if (confirmClose && !this.confirmClose()) {
      this.commentInput.focus();
      return;
    }

    this.teardown();
  }

  /**
   * Remove the comment form elements and restore the page elements that were hidden. Remove
   * properties of other objects related to the form. Close all form operations and remove all
   * references to the form.
   */
  teardown() {
    this.operations.closeAll();
    if (this.$element[0].isConnected) {
      this.target.cleanUpCommentFormTraces(this.mode, this);
      this.$element.remove();
    }
    this.unregister();
    this.emit('teardown');
    this.torndown = true;
  }

  /**
   * Remove all outside references to the form and unload it from the session data thus making it
   * not appear after a page reload. A form may be unregistered without being torn down (but not
   * vice versa) - when it is submitted.
   *
   * @private
   */
  unregister() {
    if (!this.registered) return;

    CommentForm.forgetOnTarget(this.target, this.mode);

    // Popups can be placed outside the form element, so they need to be torn down whenever the form
    // is unregistered (even if the form itself is not torn down).
    this.teardownInputPopups();

    this.autocomplete.cleanUp();
    this.headlineAutocomplete?.cleanUp();
    this.summaryAutocomplete.cleanUp();

    this.registered = false;
    this.emit('unregister');
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
   * Show or hide messages as a result of comparing the text to the data in a reaction object.
   *
   * @param {string} text Text to check for reactions to.
   * @param {import('../config/default').Reaction} reaction Reaction object.
   * @private
   */
  reactToText(text, { regexp, checkFunc, message, type, name }) {
    if (regexp?.test(text) && (typeof checkFunc !== 'function' || checkFunc(this))) {
      this.showMessage(message, { type, name });
    } else {
      this.hideMessage(name);
    }
  }

  /**
   * _For internal use._ Update the automatic text for the edit summary.
   *
   * @param {boolean} [set=true] Whether to actually set the input value, or just save the auto
   *   summary to a property (e.g. to later tell if it was altered).
   * @param {boolean} [blockAutopreview=false] Whether to prevent making autopreview request in
   *   order not to make two identical requests (for example, if the update is initiated by a change
   *   in the comment – that change would initiate its own request).
   * @private
   */
  updateAutoSummary = (set = true, blockAutopreview = false) => {
    if (this.summaryAltered) return;

    this.summaryAutopreviewBlocked = blockAutopreview;

    const text = this.generateStaticSummaryText(
      this.targetWithOutdentedReplies ? 'reply' : undefined,
      this.targetWithOutdentedReplies
    );
    const section = this.headlineInput && this.mode !== 'addSubsection' ?
      removeWikiMarkup(this.headlineInput.getValue()) :
      this.target.getRelevantSection()?.headline;

    let optionalText;
    if (['reply', 'replyInSection'].includes(this.mode)) {
      const commentText = this.commentInput.getValue()
        .trim()
        .replace(/\s+/g, ' ')

        // Pipe trick
        .replace(cd.g.pipeTrickRegexp, '$1$2$3')

        // Remove user links to prevent sending a double notification.
        .replace(/\[\[:?(?:([^|[\]<>\n]+)\|)?(.+?)\]\]/g, (s, wikilink, text) => (
          cd.g.userLinkRegexp.test(wikilink) ? text : s
        ));
      if (commentText && commentText.length <= cd.config.commentToSummaryLengthLimit) {
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
  };

  /**
   * _For internal use._ Generate the _static_ part of the automatic text for the edit summary,
   * excluding the section headline.
   *
   * @param {string} [mode=this.mode]
   * @param {Comment|import('./Section').default|import('./pageRegistry').Page} [target=this.target]
   * @returns {string}
   * @private
   */
  generateStaticSummaryText(mode = this.mode, target = this.target) {
    // FIXME: distribute this across the classes of targets? Not sure this belongs here.
    switch (mode) {
      case 'reply': {
        if (target.isOpeningSection) {
          return cd.s('es-reply');
        } else {
          target.maybeRequestAuthorGender(this.updateAutoSummary);
          return target.isOwn ?
            cd.s('es-addition') :
            removeDoubleSpaces(
              cd.s('es-reply-to', target.author.getName(), target.author)
            );
        }
      }

      case 'edit': {
        // The codes for generating "edit" and "delete" descriptions are equivalent, so we provide
        // an umbrella function.
        const editOrDeleteText = (action) => {
          let subject;
          let realTarget = target;
          if (target.isOwn) {
            const targetParent = target.getParent();
            if (targetParent) {
              if (targetParent.level === 0) {
                subject = 'reply';
              } else {
                targetParent.maybeRequestAuthorGender(this.updateAutoSummary);
                subject = targetParent.isOwn ? 'addition' : 'reply-to';
                realTarget = targetParent;
              }
            } else {
              if (target.isOpeningSection) {
                subject = this.targetSection.getParent() ? 'subsection' : 'topic';
              } else {
                subject = 'comment';
              }
            }
          } else {
            if (target.isOpeningSection) {
              subject = this.targetSection.getParent() ? 'subsection' : 'topic';
            } else {
              target.maybeRequestAuthorGender(this.updateAutoSummary);
              subject = 'comment-by';
            }
          }
          const authorName = realTarget.author.getName();
          return removeDoubleSpaces(
            cd.s(
              `es-${action}-${subject}`,
              subject === 'comment-by' && realTarget.author.isRegistered() ?
                `[[${realTarget.author.getNamespaceAlias()}:${authorName}|${authorName}]]` :
                authorName,
              realTarget.author
            )
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
      this.initialMinorCheckboxSelected = this.minorCheckbox?.isSelected();
      this.minorCheckbox?.setSelected(false);

      this.commentInput.setDisabled(true);
      this.headlineInput?.setDisabled(true);
      this.minorCheckbox?.setDisabled(true);
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
      this.minorCheckbox?.setSelected(this.initialMinorCheckboxSelected);

      this.commentInput.setDisabled(false);
      this.headlineInput?.setDisabled(false);
      this.minorCheckbox?.setDisabled(false);
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
    const range = this.commentInput.getRange();

    if (mentionAddressee && this.parentComment) {
      const data = Autocomplete.getConfig('mentions').transform(
        this.parentComment.author.getName()
      );
      if (data.usePipeTrickCheck(data)) {
        data.content = '';
      }
      data.cmdModify();
      const text = data.start + data.content + data.end;
      this.commentInput
        .selectRange(0)
        .cdInsertContent(text)

        // Restore the selection
        .selectRange(range.from + text.length, range.to + text.length);

      return;
    }

    const selection = this.commentInput.getValue().substring(range.from, range.to);
    if (
      selection &&
      mw.Title.newFromText(selection) &&
      !selection.includes('/') &&
      selection.length <= 85
    ) {
      // Valid username

      const data = Autocomplete.getConfig('mentions').transform(selection);
      if (data.usePipeTrickCheck(data)) {
        data.content = '';
      }
      this.commentInput.cdInsertContent(data.start + data.content + data.end);

      return;
    }

    this.insertContentAfter(cd.config.mentionCharacter);
  }

  /**
   * Quote the selected text.
   *
   * @param {boolean} allowEmptySelection Insert markup (with a placeholder text) even if the
   *   selection is empty.
   * @param {Comment} [comment] Quoted comment.
   * @param {boolean} [mentionSource] Whether to mention the source of the quote (author, timestamp,
   *   link), if available. This makes sense when quoting a comment other than the one you reply to.
   */
  async quote(allowEmptySelection, comment, mentionSource) {
    let selection;
    if (isInputFocused()) {
      const activeElement = document.activeElement;
      selection = activeElement.value.substring(
        activeElement.selectionStart,
        activeElement.selectionEnd
      );
    } else {
      selection = await this.commentInput.getWikitextFromSelection(controller.rootElement);
    }
    selection = selection.trim();

    // With just "Q" pressed, empty selection doesn't count.
    if (selection || allowEmptySelection) {
      const isCommentInputFocused = this.commentInput.$input.is(':focus');
      const range = this.commentInput.getRange();
      let rangeStart = Math.min(range.to, range.from);
      let rangeEnd = Math.max(range.to, range.from);

      // Reset the selection if the input is not focused to prevent losing text.
      if (!isCommentInputFocused && rangeStart !== rangeEnd) {
        this.commentInput.selectRange(range.to);
        rangeStart = rangeEnd = range.to;
      }

      const [pre, post] = typeof cd.config.quoteFormatting === 'function' ?
        cd.config.quoteFormatting.apply(
          null,
          comment && (mentionSource ?? comment !== this.parentComment) ?
            [true, comment.author.getName(), comment.timestamp, comment.dtId] :
            [selection.match(new RegExp(`<${cd.g.pniePattern}\\b|(^|\n)[:*#;]`, 'i'))]
        ) :
        cd.config.quoteFormatting;

      if (pre.includes('{{')) {
        selection = escapePipesOutsideLinks(selection);
      }

      this.encapsulateSelection({
        pre,
        peri: cd.s('cf-quote-placeholder'),
        post,
        selection,
        ownline: true,
      });
    }
  }

  /**
   * Insert markup for a comment or section link.
   */
  insertCommentLink() {
    const range = this.commentInput.getRange();
    const selection = this.commentInput.getValue().substring(range.from, range.to);
    if (selection && (commentRegistry.getByAnyId(selection) || isExistentAnchor(selection, true))) {
      // Valid ID

      this.commentInput.cdInsertContent(`[[#${selection}]]`);

      return;
    }

    this.insertContentAfter('[[#');
  }

  /**
   * Insert some content after the caret, making sure it's separated with a space and the selected
   * text is not removed.
   *
   * @param {string} content
   * @private
   */
  insertContentAfter(content) {
    const range = this.commentInput.getRange();
    const rangeEnd = Math.max(range.to, range.from);

    // Prevent removal of text
    if (range.from !== range.to) {
      this.commentInput.selectRange(rangeEnd);
    }

    // Insert a space if the preceding text doesn't end with one
    if (rangeEnd && !/\s/.test(this.commentInput.getValue().substr(rangeEnd - 1, 1))) {
      this.commentInput.cdInsertContent(' ');
    }

    this.encapsulateSelection({ pre: content });
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
   * @param {string} [options.replace=false] If there is a selection, replace it with `pre`, `peri`,
   *   `post` instead of leaving it alone.
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
    const selectionStartIndex = Math.min(range.from, range.to);
    const selectionEndIndex = Math.max(range.from, range.to);
    const value = this.commentInput.getValue();
    const addLeadingNewLine = (
      ownline &&
      !/(^|\n)$/.test(value.slice(0, selectionStartIndex)) &&
      !/^\n/.test(peri)
    );
    const leadingNewline = addLeadingNewLine ? '\n' : '';
    const addTrailingNewLine = (
      ownline &&
      !/^\n/.test(value.slice(selectionEndIndex)) &&
      !/\n$/.test(post)
    );
    const trailingNewline = addTrailingNewLine ? '\n' : '';
    let periStartIndex;
    if (!selection && !replace) {
      periStartIndex = selectionStartIndex + leadingNewline.length + pre.length;
      selection = value.substring(range.from, range.to);
    } else {
      selection ||= '';
    }

    // Wrap the text, moving the leading and trailing spaces to the sides of the resulting text.
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

    this.commentInput.cdInsertContent(text);
    if (!selection && !replace) {
      this.commentInput.selectRange(periStartIndex, periStartIndex + peri.length);
    }
  }

  /**
   * Get the form mode.
   *
   * @returns {'reply'|'replyInSection'|'edit'|'addSubsection'|'addSection'}
   */
  getMode() {
    return this.mode;
  }

  /**
   * Get the name of the correlated property of the form's target based on the form's mode.
   *
   * @returns {string}
   * @private
   */
  getModeTargetProperty() {
    return this.mode === 'replyInSection' ? 'reply' : this.mode;
  }

  /**
   * Get the configuration to preload data into the form.
   *
   * @returns {object}
   */
  getPreloadConfig() {
    return this.preloadConfig;
  }

  /**
   * Get whether the form will add a topic on top.
   *
   * @returns {boolean}
   */
  isNewTopicOnTop() {
    return this.newTopicOnTop;
  }

  /**
   * Get the headline at the time of the form creation.
   *
   * @returns {string}
   */
  getOriginalHeadline() {
    return this.originalHeadline;
  }

  /**
   * Get the comment text at the time of the form creation.
   *
   * @returns {string}
   */
  getOriginalComment() {
    return this.originalComment;
  }

  /**
   * Check whether the summary was altered by the user.
   *
   * @returns {boolean}
   */
  isSummaryAltered() {
    return this.summaryAltered;
  }

  /**
   * Check whether the omit signature checkbox was altered by the user.
   *
   * @returns {boolean}
   */
  isOmitSignatureCheckboxAltered() {
    return this.omitSignatureCheckboxAltered;
  }

  /**
   * Get the date when the form was focused last time.
   *
   * @returns {boolean}
   */
  getLastFocused() {
    return this.lastFocused;
  }

  /**
   * Get the {@link CommentForm#target target} object of the form.
   *
   * @returns {Comment|import('./Section').default|import('./pageRegistry').Page}
   */
  getTarget() {
    return this.target;
  }

  /**
   * Get the target comment if it has outdented replies and the reply is therefore to the section.
   *
   * @returns {Comment|undefined}
   */
  getTargetWithOutdentedReplies() {
    return this.targetWithOutdentedReplies;
  }

  /**
   * Get the {@link CommentForm#parentComment parent comment} object of the form. This is the
   * comment the user replies to, if any. If the user replies to a section, this is the comment
   * opening the section.
   *
   * @returns {?Comment}
   */
  getParentComment() {
    return this.parentComment;
  }

  /**
   * Set whether a new section will be added on submit using a dedicated API request.
   *
   * @param {boolean} value
   */
  setNewSectionApi(value) {
    this.newSectionApi = Boolean(value);
  }

  /**
   * Check whether a new section will be added on submit using a dedicated API request.
   *
   * @returns {boolean}
   */
  isNewSectionApi() {
    return this.newSectionApi;
  }

  /**
   * Set whether the section code will be sent on submit, not the whole page code.
   *
   * @param {boolean} value
   */
  setSectionSubmitted(value) {
    this.sectionSubmitted = Boolean(value);
  }

  /**
   * Check whether the section code will be sent on submit, not the whole page code.
   *
   * @returns {boolean}
   */
  isSectionSubmitted() {
    return this.sectionSubmitted;
  }

  /**
   * Get the name of the tag of the list that this form is an item of.
   *
   * @returns {?('dl'|'ul'|'ol')}
   */
  getContainerListType() {
    return this.containerListType;
  }

  /**
   * Restore the form from data.
   *
   * @returns {object|undefined}
   */
  restore() {
    const newSelf = this.target.findNewSelf();
    if (newSelf?.isActionable) {
      try {
        newSelf[this.getModeTargetProperty()](undefined, this);
      } catch (e) {
        console.warn(e);
        return this.rescue();
      }
    } else {
      return this.rescue();
    }
  }

  /**
   * Return the key contents of the form, to be printed to the user in a popup so that they may have
   * a chance to copy it and not lose.
   *
   * @returns {object}
   */
  rescue() {
    this.teardown();

    return {
      headline: this.headlineInput?.getValue(),
      comment: this.commentInput.getValue(),
      summary: this.summaryInput.getValue(),
    };
  }

  /**
   * Scroll to the comment form and focus the comment input.
   * {@link Comment#expandAllThreadsDownTo Expand all threads} that this form is inside.
   */
  goTo() {
    let visuallyTargetComment;
    if (['reply', 'edit'].includes(this.mode)) {
      visuallyTargetComment = this.target;
    } else if (this.mode === 'replyInSection') {
      visuallyTargetComment = this.targetSection.commentsInFirstChunk
        .slice()
        .reverse()
        .find((c) => c.level === 0);
    }
    visuallyTargetComment?.expandAllThreadsDownTo();
    this.$element.cdScrollIntoView('center');
    this.commentInput.focus();
  }

  /**
   * Show an onboarding popup that informs the user they can open multiple comment forms at once.
   *
   * @private
   */
  onboardOntoMultipleForms() {
    if (
      this.manyFormsOnboarded ||
      !cd.user.isRegistered() ||

      // This form will be the second
      commentFormRegistry.getCount() !== 1 ||

      // Left column hidden in Timeless
      (cd.g.skin === 'timeless' && window.innerWidth < 1100) ||

      (cd.g.skin === 'vector-2022' && window.innerWidth < 1000)
    ) {
      return;
    }

    const button = new OO.ui.ButtonWidget({
      label: cd.mws('visualeditor-educationpopup-dismiss'),
      flags: ['progressive', 'primary'],
    });
    button.on('click', () => {
      this.manyFormsPopup.toggle(false);
    });
    this.manyFormsPopup = new OO.ui.PopupWidget({
      icon: 'lightbulb',
      label: cd.s('popup-manyForms-title'),
      $content: $.cdMerge(
        $('<p>').text(cd.s('popup-manyForms-text')),
        $('<p>').append(button.$element),
      ),
      head: true,
      $floatableContainer: this.commentInput.$element,

      // Not $root - add section form is outside it. Not $content either - it's the same as $root on
      // 404 pages.
      $container: controller.$root.parent(),

      position: (
        $('#vector-main-menu-pinned-container, #vector-toc-pinned-container').is(':visible')
      ) ?
        'before' :
        'below',
      padded: true,
      classes: ['cd-popup-onboarding'],
    });
    $(document.body).append(this.manyFormsPopup.$element);
    this.manyFormsPopup.toggle(true);
    this.manyFormsPopup.on('closing', () => {
      settings.saveSettingOnTheFly('manyForms-onboarded', true);
    });
  }

  /**
   * Show an onboarding popup that informs the user they can upload images.
   *
   * @private
   */
  onboardOntoUpload() {
    if (
      !this.uploadToCommons ||
      this.uploadOnboarded ||
      !cd.user.isRegistered() ||

      // Left column hidden in Timeless
      (cd.g.skin === 'timeless' && window.innerWidth < 1100) ||

      (cd.g.skin === 'vector-2022' && window.innerWidth < 1000)
    ) {
      return;
    }

    const button = new OO.ui.ButtonWidget({
      label: cd.mws('visualeditor-educationpopup-dismiss'),
      flags: ['progressive', 'primary'],
    });
    button.on('click', () => {
      this.uploadPopup.toggle(false);
    });
    this.uploadPopup = new OO.ui.PopupWidget({
      icon: 'lightbulb',
      label: cd.s('popup-upload-title'),
      $content: $.cdMerge(
        $('<p>').text(cd.s('popup-upload-text')),
        $('<p>').append(button.$element),
      ),
      head: true,
      $floatableContainer: this.commentInput.$element,

      // Not $root - add section form is outside it. Not $content either - it's the same as $root on
      // 404 pages.
      $container: controller.$root.parent(),

      position: (
        $('#vector-main-menu-pinned-container, #vector-toc-pinned-container').is(':visible')
      ) ?
        'before' :
        'below',
      padded: true,
      classes: ['cd-popup-onboarding'],
    });
    $(document.body).append(this.uploadPopup.$element);
    this.uploadPopup.toggle(true);
    this.uploadPopup.on('closing', () => {
      settings.saveSettingOnTheFly('upload-onboarded', true);
    });
  }

  /**
   * Get the outermost element of the form (`$element` or its outer wrapper if present).
   *
   * @returns {HTMLElement}
   */
  getOutermostElement() {
    const el = this.$element[0];

    return el.parentElement?.classList.contains('cd-commentForm-outerWrapper') ?
      /** @type {HTMLElement} */ (el.parentNode) :
      el;
  }

  /**
   * Highlight or unhighlight the quote button.
   *
   * @param {boolean} highlight
   */
  highlightQuoteButton(highlight) {
    if (!this.showToolbar) return;

    this.$element
      .find('.tool-button[rel="quote"]')
      .closest('.cd-tool-button-wrapper')
      .toggleClass('cd-highlight', highlight);
  }

  static counter = 0;
  static allowedFileTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml'];

  /**
   * Initialize the class.
   */
  static init() {
    this.encapsulateOptions = {
      code: {
        pre: '<code><nowiki>',
        peri: cd.s('cf-code-placeholder'),
        post: '</'.concat('nowiki></code>'),
      },
      underline: {
        pre: '<u>',
        peri: cd.s('cf-underline-placeholder'),
        post: '</u>',
      },
      strikethrough: {
        pre: '<s>',
        peri: cd.s('cf-strikethrough-placeholder'),
        post: '</s>',
      },
    };
  }

  /**
   * Extract IDs from comment links in the code.
   *
   * @param {string} code
   * @returns {string[]}
   * @private
   */
  static extractCommentIds(code) {
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

  /**
   * Get the default preload configuration for the `addSection` mode.
   *
   * @returns {object}
   */
  static getDefaultPreloadConfig() {
    return {
      editIntro: undefined,
      commentTemplate: undefined,
      headline: undefined,
      params: [],
      summary: undefined,
      noHeadline: false,
      omitSignature: false,
    };
  }

  /**
   * Get the name of the target's property that can contain a comment form with the specified mode.
   *
   * @param {Comment|import('./Section').default|import('./pageRegistry').Page} target
   * @param {import('./CommentForm').CommentFormMode} mode
   * @returns {string}
   */
  static getPropertyNameOnTarget(target, mode) {
    return target.getCommentFormMethodName(mode) + 'Form';
  }

  /**
   * Remove references to a comment form on its target object (after it was unregistered).
   *
   * @param {Comment|import('./Section').default|import('./pageRegistry').Page} target
   * @param {import('./CommentForm').CommentFormMode} mode
   */
  static forgetOnTarget(target, mode) {
    delete target[this.getPropertyNameOnTarget(target, mode)];
  }
}

export default CommentForm;
