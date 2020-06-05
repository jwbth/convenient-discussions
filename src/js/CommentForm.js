/** Comment form class.
 *
 * @module CommentForm
 */

import CdError from './CdError';
import Comment from './Comment';
import Section from './Section';
import cd from './cd';
import { animateLink, defined, findLastIndex, handleApiReject, isInputFocused } from './util';
import { checkboxField } from './ooui';
import { confirmDestructive, settingsDialog } from './modal';
import {
  extractSignatures,
  hideHtmlComments,
  hideSensitiveCode,
  removeWikiMarkup,
  unhideSensitiveCode,
} from './wikitext';
import { generateCommentAnchor } from './timestamp';
import { getLastRevision, parseCode } from './apiWrappers';
import { reloadPage, removeLoadingOverlay, saveSession } from './boot';

let commentFormsCounter = 0;

/**
 * Callback to be used in Array.prototype.sort() for comment forms.
 *
 * @param {CommentForm} commentForm1
 * @param {CommentForm} commentForm2
 * @returns {number}
 */
export function lastFocused(commentForm1, commentForm2) {
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

/** Class representing a comment form. */
export default class CommentForm {
  #sectionHeadline
  #standardButtonsTotalWidth
  #standardSubmitButtonLabel
  #shortSubmitButtonLabel
  #lastPreviewTimestamp
  #previewTimeout
  #dontAutopreview
  #editingSectionOpeningComment
  #headlineInputPurpose

  /**
   * Create a comment form.
   *
   * @param {object} config
   * @param {string} config.mode `'reply'`, `'replyInSection'`, `'edit'`, `'addSubsection'`, or
   *   `'addSection'`.
   * @param {Comment|Section|null} config.target Comment or section that the comment should reply
   *   to.
   * @param {JQuery} [config.$addSectionLink] When adding a section, the element the user clicked to
   *   do it.
   * @param {object} [config.dataToRestore] Data saved in the previous session.
   * @param {boolean} [config.scrollIntoView] Whether to scroll the form into view.
   * @param {string} [config.editintro] Editintro wikilink.
   * @throws {CdError}
   * @fires commentFormCreated
   * @fires commentFormReady
   */
  constructor({ mode, target, $addSectionLink, dataToRestore, scrollIntoView, editintro }) {
    /**
     * `'reply'`, `'replyInSection'`, `'edit'`, `'addSubsection'`, or `'addSection'`.
     *
     * @type {string}
     */
    this.mode = mode;

    this.setTargets(target);

    /**
     * When adding a section, an element the user clicked to do it.
     *
     * @type {JQuery}
     */
    this.$addSectionLink = $addSectionLink;

    if (this.target instanceof Comment) {
      this.#sectionHeadline = this.target.section && this.target.section.headline;
    } else if (this.target instanceof Section) {
      this.#sectionHeadline = this.target.headline;
    }

    /**
     * The form ID.
     *
     * @type {number}
     */
    this.id = commentFormsCounter++;

    if (this.mode === 'edit' && !dataToRestore) {
      /**
       * Has the text been loaded when editing an existing comment.
       *
       * @type {boolean}
       */
      this.textLoaded = false;
    }

    /**
     * Was the summary altered manually.
     *
     * @type {boolean}
     */
    this.summaryAltered = dataToRestore ? dataToRestore.summaryAltered : false;

    if (editintro) {
      parseCode(`{{${editintro}}}`, { title: cd.g.CURRENT_PAGE }).then(
        (result) => {
          this.$messageArea
            .append(result.html)
            .cdAddCloseButton();
        }
      );
    }

    this.createContents(dataToRestore);

    this.addEvents();

    this.addToPage();

    /**
     * Will the comment have indentation characters.
     *
     * This is mostly to tell if inconvertible newlines would cause problems in the comment and
     * reflect that in the comment preview.
     *
     * @type {boolean}
     */
    this.willCommentBeIndented = ['reply', 'replyInSection'].includes(this.mode);

    /**
     * @typedef {object} Operation
     * @property {string} type One of `'preview'`, `'viewChanges'`, and `'submit'`.
     * @property {boolean} closed Whether the operation is closed (settled).
     * @property {boolean} delayed Whether the operation is delayed.
     */

    /**
     * A list of current operations.
     *
     * @type {Operation[]}
     */
    this.operations = [];

    cd.commentForms.push(this);

    if (dataToRestore) {
      this.originalComment = dataToRestore.originalComment;
      this.originalHeadline = dataToRestore.originalHeadline;
      if (dataToRestore.lastFocused) {
        /**
         * The date when the comment form was focused last time.
         *
         * @type {Date}
         */
        this.lastFocused = new Date(dataToRestore.lastFocused);
      }
    } else {
      if (this.mode === 'edit') {
        this.pushPending(true);

        this.target.getCode(true).then(
          ({ commentText, headline }) => {
            this.commentInput.setValue(commentText);
            if (this.smallCheckbox) {
              this.smallCheckbox.setSelected(this.target.inCode.inSmallFont);
            }
            this.originalComment = commentText;
            if (this.headlineInput) {
              this.headlineInput.setValue(headline);
              this.originalHeadline = headline;
            }

            // This value is probably inferrable from this.mode and this.level, but for safety we
            // take it from the most reliable source.
            this.willCommentBeIndented = this.target.inCode.indentationChars;

            this.popPending(true);
            this.textLoaded = true;
            saveSession();

            this.commentInput.focus();
          },
          (e) => {
            if (e instanceof CdError) {
              this.handleError(Object.assign({}, e.data, { retryFunc: this.retryLoad }));
            } else {
              this.handleError({
                type: 'javascript',
                logMessage: e,
              });
            }
          }
        );
      } else {
        this.originalComment = '';
        if (this.headlineInput) {
          this.originalHeadline = '';
        }

        if (this.target) {
          this.checkCode();
        } else {
          saveSession();
        }

        if (scrollIntoView) {
          this.$element.cdScrollIntoView('center');
        }
        this[this.headlineInput ? 'headlineInput' : 'commentInput'].focus();
      }
    }

    /**
     * A comment form has been created.
     *
     * @event commentFormCreated
     * @type {module:CommentForm}
     */
    mw.hook('convenientDiscussions.commentFormCreated').fire(this);
  }

  /**
   * Test if a comment or section exists in the code.
   *
   * @returns {JQuery.Promise}
   */
  checkCode() {
    if (!this.checkCodeRequest) {
      /**
       * Request to test if a comment or section exists in the code made by {@link
       * module:CommentForm#checkCode}.
       *
       * @type {JQuery.Promise}
       */
      // We use a jQuery promise as there is no way to know the state of native promises.
      const deferred = $.Deferred();
      this.checkCodeRequest = deferred.then(
        () => {
          saveSession();
        },
        (e) => {
          if (e instanceof CdError) {
            this.handleError(Object.assign({}, e.data));
          } else {
            this.handleError({
              type: 'javascript',
              logMessage: e,
            });
          }
        }
      );
      this.target.getCode(this).then(
        () => {
          deferred.resolve();
        },
        (e) => {
          deferred.reject(e);
        }
      );
    }
    return this.checkCodeRequest;
  }

  /**
   * Function to run when the user retries loading a comment by pressing the relevant button.
   *
   * @private
   */
  retryLoad() {
    this.$element.hide();
    this.destroy();
    this.target[CommentForm.modeToProperty(this.mode)]();
  }

  /**
   * Set the `target`, `targetSection` and `targetComment` properties.
   *
   * @param {Comment|Section|null} target
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
       * @type {?Section}
       */
      this.targetSection = this.target.section;
    } else if (this.target instanceof Section) {
      this.targetSection = this.target;
    }

    /**
     * Wiki page that has the source code of the target object (may be different from the current
     * page if the section is transcluded from another page).
     *
     * @type {string}
     */
    this.targetPage = this.targetSection ? this.targetSection.sourcePage : cd.g.CURRENT_PAGE;

    if (target instanceof Comment) {
      /**
       * Target comment.
       *
       * @type {?(Comment|Section)}
       */
      this.targetComment = target;
    } else if (target instanceof Section) {
      if (target.commentsInFirstChunk[0] && target.commentsInFirstChunk[0].isOpeningSection) {
        this.targetComment = target.commentsInFirstChunk[0];
      }
    }
  }

  /**
   * Add a WikiEditor toolbar to the comment input.
   *
   * @private
   */
  addToolbar() {
    const $toolbarPlaceholder = $('<div>')
      .addClass('cd-toolbarPlaceholder')
      .insertBefore(this.commentInput.$element);

    const modules = ['ext.wikiEditor'];
    cd.config.customCommentFormModules
      .filter((module) => !module.checkFunc || module.checkFunc())
      .forEach((module) => {
        modules.push(module.name);
      });

    mw.loader.using(modules).then(() => {
      $toolbarPlaceholder.hide();

      const $textarea = this.commentInput.$input;
      $textarea.wikiEditor(
        'addModule',
        mw.loader.moduleRegistry['ext.wikiEditor']
          .packageExports['jquery.wikiEditor.toolbar.config.js']
      );
      const dialogsConfig = mw.loader.moduleRegistry['ext.wikiEditor']
        .packageExports['jquery.wikiEditor.dialogs.config.js'];
      dialogsConfig.replaceIcons($textarea);
      $textarea.wikiEditor('addModule', dialogsConfig.getDefaultConfig());
      this.commentInput.$element
        .find('.tool[rel="redirect"], .tool[rel="signature"], .tool[rel="gallery"], .tool[rel="reference"], .option[rel="heading-2"]')
        .remove();

      $textarea.wikiEditor('addToToolbar', {
        section: 'main',
        groups: {
          'convenient-discussions': {
            tools: {
              quote: {
                label: cd.s('cf-quote-tooltip'),
                type: 'button',
                icon: 'https://upload.wikimedia.org/wikipedia/commons/c/c0/OOjs_UI_icon_quotes-ltr.svg',
                action: {
                  type: 'callback',
                  execute: () => {
                    this.quote();
                  },
                },
              },
            },
          }
        },
      });
      this.commentInput.$element.find('.group-convenient-discussions')
        .insertBefore(this.commentInput.$element.find('.section-main .group-insert'));

      /**
       * The comment form is ready (all requested modules have been loaded and executed).
       *
       * @event commentFormReady
       * @type {module:CommentForm}
       */
      mw.hook('convenientDiscussions.commentFormReady').fire(this);
    });
  }

  /**
   * Add an insert button to the block under the comment input.
   *
   * @param {string} text
   * @param {string} displayedText
   * @private
   */
  addInsertButton(text, displayedText) {
    let [, pre, post] = text.match(/^(.*?(?:^|[^\\]))(?:\+(.*))?$/) || [];
    if (!pre) return;
    post = post || '';
    if (!displayedText) {
      displayedText = pre + post;
    }

    const $a = $('<a>')
      .text(displayedText)
      .addClass('cd-insertButtons-item')
      .on('click', (e) => {
        e.preventDefault();
        this.commentInput.$input.textSelection('encapsulateSelection', {
          pre,
          peri: '',
          post,
        });
      });
    this.$insertButtons.append($a, ' ');
  }

  /**
   * Create the contents of the form.
   *
   * @param {object} dataToRestore
   * @private
   */
  createContents(dataToRestore) {
    if (this.target) {
      /**
       * Comment form is an item in a numbered list.
       *
       * @type {boolean}
       */
      this.isInNumberedList = this.target instanceof Comment ?
        this.target.$elements.last().parent().is('ol') :
        this.target.$replyWrapper.parent().is('ol');
    } else {
      this.isInNumberedList = false;
    }

    let tag = 'div';
    if (['reply', 'edit'].includes(this.mode)) {
      const $lastElementOfTarget = this.target.$elements.last();
      if ($lastElementOfTarget.is('li')) {
        // We need to avoid a number appearing next to the form in numbered lists, so we keep div in
        // those cases. Which is unsemantic, yes :-(
        if (!this.isInNumberedList || this.mode === 'edit') {
          tag = 'li';
        }
      } else if ($lastElementOfTarget.is('dd')) {
        tag = 'dd';
      } else if (this.mode === 'reply') {
        tag = 'ul';
      }
    }

    this.#editingSectionOpeningComment = this.mode === 'edit' && this.target.isOpeningSection;

    /**
     * The main form element.
     *
     * @type {JQuery}
     */
    this.$element = $(document.createElement(tag))
      .addClass('cd-commentForm')
      .addClass(`cd-commentForm-${this.mode}`);
    if (this.isInNumberedList) {
      this.$element.addClass('cd-commentForm-inNumberedList');
    }
    if (this.#editingSectionOpeningComment) {
      this.$element.addClass('cd-commentForm-sectionOpeningComment');
    }
    if (this.mode === 'addSubsection') {
      this.$element.addClass(`cd-commentForm-addSubsection-${this.target.level}`);
    }

    if (this.mode === 'reply') {
      const $list = tag === 'ul' ? this.$element : $('<ul>').appendTo(this.$element);

      /**
       * A wrapper for other comment form elements placed inside the main element.
       *
       * @type {JQuery}
       */
      this.$innerWrapper = $('<li>')
        .addClass('cd-commentForm-innerWrapper')
        .appendTo($list);
      $list.addClass('cd-commentLevel');
    } else {
      this.$innerWrapper = $('<div>')
        .addClass('cd-commentForm-innerWrapper')
        .appendTo(this.$element);
    }

    /**
     * The area where service messages are displayed.
     *
     * @type {JQuery}
     */
    this.$messageArea = $('<div>').addClass('cd-messageArea');

    /**
     * @typedef {object} OoUiTextInputWidget
     * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.TextInputWidget
     */

    if (['addSection', 'addSubsection'].includes(this.mode) || this.#editingSectionOpeningComment) {
      if (this.mode === 'addSubsection') {
        this.#headlineInputPurpose = cd.s('cf-headline-subsection', this.targetSection.headline);
      } else if (this.mode === 'edit' && this.target.section.level > 2) {
        this.#headlineInputPurpose = cd.s(
          'cf-headline-subsection',
          this.targetSection.parent.headline
        );
      } else {
        this.#headlineInputPurpose = cd.s('cf-headline-topic');
      }

      /**
       * Headline input.
       *
       * @type {OoUiTextInputWidget}
       */
      this.headlineInput = new OO.ui.TextInputWidget({
        value: dataToRestore ? dataToRestore.headline : '',
        placeholder: this.#headlineInputPurpose,
        classes: ['cd-headlineInput'],
        tabIndex: String(this.id) + '11',
      });
    }

    let rowNumber = this.headlineInput ? 5 : 3;
    // Firefox gives a bigger height to a textarea with a specified number of rows than other
    // browsers.
    if ($.client.profile().name === 'firefox') {
      rowNumber -= 1;
    }

    let commentInputPlaceholder;
    if (!cd.config.commentInputEmptyPlaceholder) {
      if (
        this.mode === 'replyInSection' ||
        (this.mode === 'reply' && this.target.isOpeningSection)
      ) {
        commentInputPlaceholder = cd.s(
          'cf-comment-placeholder-replytosection',
          this.targetSection.headline
        );
      } else if (this.mode === 'reply') {
        // If there is a need to make a request to get the user gender, we don't show any
        // placeholder text at the beginning to avoid drawing the user's attention to the changing
        // of the text. (But it could be a better idea to set the commentInputEmptyPlaceholder
        // config variable to true to avoid showing any text whatsoever.)
        this.target.requestAuthorGender(() => {
          this.commentInput.$input.attr(
            'placeholder',
            cd.s(
              'cf-comment-placeholder-replytocomment',
              this.target.author.name,
              this.target.author
            )
          );
        });
      } else if (this.mode === 'addSection') {
        commentInputPlaceholder = cd.s('cf-comment-placeholder-addsection');
      } else if (this.mode === 'addSubsection') {
        commentInputPlaceholder = cd.s('cf-comment-placeholder-addsubsection');
      }
    }

    /**
     * @typedef {object} OoUiMultilineTextInputWidget
     * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.MultilineTextInputWidget
     */

    /**
     * Comment input.
     *
     * @type {OoUiMultilineTextInputWidget}
     */
    this.commentInput = new OO.ui.MultilineTextInputWidget({
      value: dataToRestore ? dataToRestore.comment : '',
      placeholder: commentInputPlaceholder,
      autosize: true,
      rows: rowNumber,
      maxRows: 30,
      classes: ['cd-commentInput'],
      tabIndex: String(this.id) + '12',
    });

    /**
     * Comment settings container.
     *
     * @type {JQuery}
     */
    this.$settings = $('<div>').addClass('cd-commentFormSettings')

    /**
     * Edit summary input.
     *
     * @type {OoUiTextInputWidget}
     */
    this.summaryInput = new OO.ui.TextInputWidget({
      value: dataToRestore ? dataToRestore.summary : '',
      maxLength: cd.g.SUMMARY_LENGTH_LIMIT,
      placeholder: cd.s('cf-summary-placeholder'),
      classes: ['cd-summaryInput'],
      tabIndex: String(this.id) + '13',
    });
    this.summaryInput.$input.codePointLimit(cd.g.SUMMARY_LENGTH_LIMIT);
    mw.widgets.visibleCodePointLimit(this.summaryInput, cd.g.SUMMARY_LENGTH_LIMIT);
    this.updateAutoSummary(!dataToRestore);

    /**
     * The area where edit summary preview is displayed.
     *
     * @type {JQuery}
     */
    this.$summaryPreview = $('<div>').addClass('cd-summaryPreview');

    /**
     * @typedef {object} OoUiFieldLayout
     * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.FieldLayout
     */

    /**
     * @typedef {object} OoUiCheckboxInputWidget
     * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.CheckboxInputWidget
     */

    if (this.mode === 'edit') {
      /**
       * Minor change checkbox field.
       *
       * @name minorField
       * @type {OoUiFieldLayout}
       * @instance module:CommentForm
       */

      /**
       * Minor change checkbox.
       *
       * @name minorCheckbox
       * @type {OoUiCheckboxInputWidget}
       * @instance module:CommentForm
       */
      [this.minorField, this.minorCheckbox] = checkboxField({
        value: 'minor',
        selected: dataToRestore ? dataToRestore.minor : true,
        label: cd.s('cf-minor'),
        tabIndex: String(this.id) + '20',
      });
    }

    const watchCheckboxSelected = (
      (cd.settings.watchSectionOnReply && this.mode !== 'edit') ||
      $('#ca-unwatch').length ||
      mw.user.options.get(mw.config.get('wgArticleId') ? 'watchdefault' : 'watchcreations')
    );

    /**
     * Watch page checkbox field.
     *
     * @name watchField
     * @type {OoUiFieldLayout}
     * @instance module:CommentForm
     */

    /**
     * Watch page checkbox.
     *
     * @name watchCheckbox
     * @type {OoUiCheckboxInputWidget}
     * @instance module:CommentForm
     */
    [this.watchField, this.watchCheckbox] = checkboxField({
      value: 'watch',
      selected: dataToRestore ? dataToRestore.watch : watchCheckboxSelected,
      label: cd.s('cf-watch'),
      tabIndex: String(this.id) + '21',
    });

    if (this.targetSection || this.mode === 'addSection') {
      const callItTopic = (
        this.mode !== 'addSubsection' &&
        ((this.targetSection && this.targetSection.level <= 2) || this.mode === 'addSection')
      );
      const label = callItTopic ?
        cd.s('cf-watchsection-topic') :
        cd.s('cf-watchsection-subsection');
      const selected = (
        (cd.settings.watchSectionOnReply && this.mode !== 'edit') ||
        (this.targetSection && this.targetSection.watched)
      );

      /**
       * Watch section checkbox field.
       *
       * @name watchSectionField
       * @type {OoUiFieldLayout}
       * @instance module:CommentForm
       */

      /**
       * Watch section checkbox.
       *
       * @name watchSectionCheckbox
       * @type {OoUiCheckboxInputWidget}
       * @instance module:CommentForm
       */
      [this.watchSectionField, this.watchSectionCheckbox] = checkboxField({
        value: 'watchSection',
        selected: dataToRestore ? dataToRestore.watchSection : selected,
        label,
        tabIndex: String(this.id) + '22',
        title: cd.s('cf-watchsection-tooltip'),
      });
    }

    if (
      !['addSection', 'addSubsection', 'edit'].includes(this.mode) &&
      this.targetComment &&
      !this.targetComment.own &&
      cd.config.pingTemplate
    ) {
      /**
       * Ping checkbox field.
       *
       * @name pingField
       * @type {OoUiFieldLayout}
       * @instance module:CommentForm
       */

      /**
       * Ping checkbox.
       *
       * @name pingCheckbox
       * @type {OoUiCheckboxInputWidget}
       * @instance module:CommentForm
       */
      [this.pingField, this.pingCheckbox] = checkboxField({
        value: 'ping',
        selected: dataToRestore ? dataToRestore.ping : false,
        label: this.targetComment.isOpeningSection ?
          cd.s('cf-ping-sectionauthor') :
          cd.s('cf-ping-commentauthor'),
        tabIndex: String(this.id) + '23',
      });

      if (this.targetComment.author.registered) {
        this.pingField.setTitle(cd.s('cf-ping-tooltip'));
      } else {
        this.pingCheckbox.setDisabled(true);
        this.pingCheckbox.setTitle(cd.s('cf-ping-tooltip-unreg'));
        this.pingField.setTitle(cd.s('cf-ping-tooltip-unreg'));
      }
    }

    if (!this.headlineInput) {
      /**
       * Small font checkbox field.
       *
       * @name smallField
       * @type {OoUiFieldLayout}
       * @instance module:CommentForm
       */

      /**
       * Small font checkbox.
       *
       * @name smallCheckbox
       * @type {OoUiCheckboxInputWidget}
       * @instance module:CommentForm
       */
      [this.smallField, this.smallCheckbox] = checkboxField({
        value: 'small',
        selected: dataToRestore ? dataToRestore.small : false,
        label: cd.s('cf-small'),
        tabIndex: String(this.id) + '24',
      });
    }

    if (this.headlineInput) {
      /**
       * No signature checkbox field.
       *
       * @name noSignatureField
       * @type {OoUiFieldLayout}
       * @instance module:CommentForm
       */

      /**
       * No signature checkbox.
       *
       * @name noSignatureCheckbox
       * @type {OoUiCheckboxInputWidget}
       * @instance module:CommentForm
       */

      [this.noSignatureField, this.noSignatureCheckbox] = checkboxField({
        value: 'noSignature',
        selected: dataToRestore ? dataToRestore.noSignature : false,
        label: cd.s('cf-nosignature'),
        tabIndex: String(this.id) + '25',
      });
    }

    if (
      this.mode === 'edit' &&
      (
        !this.target.isOpeningSection ||
        (this.target.section && this.target.section.comments.length === 1)
      )
    ) {
      const hasReplies = !this.target.isOpeningSection ?
        !this.target.section || this.target.section.comments
          .slice(this.target.section.comments.indexOf(this.target))
          .some((comment) => comment.parent === this.target) :
        undefined;
      if (this.target.isOpeningSection || !hasReplies) {
        const selected = dataToRestore ? dataToRestore.delete : false;
        /**
         * Delete checkbox field.
         *
         * @name deleteField
         * @type {OoUiFieldLayout}
         * @instance module:CommentForm
         */

        /**
         * Delete checkbox.
         *
         * @name deleteCheckbox
         * @type {OoUiCheckboxInputWidget}
         * @instance module:CommentForm
         */
        [this.deleteField, this.deleteCheckbox] = checkboxField({
          value: 'delete',
          selected,
          label: cd.s('cf-delete'),
          tabIndex: String(this.id) + '26',
        });
      }
    }

    /**
     * Script settings button.
     *
     * @name scriptSettingsButton
     * @type {Promise}
     * @instance module:CommentForm
     */
    this.scriptSettingsButton = new OO.ui.ButtonWidget({
      framed: false,
      icon: 'settings',
      label: cd.s('cf-scriptsettings-tooltip'),
      invisibleLabel: true,
      title: cd.s('cf-scriptsettings-tooltip'),
      classes: ['cd-button', 'cd-scriptSettingsButton'],
      tabIndex: String(this.id) + '27',
    });

    /**
     * @typedef {object} OoUiHorizontalLayout
     * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.HorizontalLayout
     */

    /**
     * Checkboxes area.
     *
     * @type {OoUiHorizontalLayout}
     */
    this.horizontalLayout = new OO.ui.HorizontalLayout({
      classes: ['cd-checkboxesContainer'],
    });
    this.horizontalLayout.addItems([
      this.minorField,
      this.watchField,
      this.watchSectionField,
      this.pingField,
      this.smallField,
      this.noSignatureField,
      this.deleteField,
      this.scriptSettingsButton,
    ].filter(defined));

    /**
     * Form buttons container.
     *
     * @type {JQuery}
     */
    this.$buttonsContainer = $('<div>').addClass('cd-buttonsContainer');

    /**
     * Left form buttons container.
     *
     * @type {JQuery}
     */
    this.$leftButtonsContainer = $('<div>').addClass('cd-leftButtonsContainer');

    /**
     * Right form buttons container.
     *
     * @type {JQuery}
     */
    this.$rightButtonsContainer = $('<div>').addClass('cd-rightButtonsContainer');

    switch (this.mode) {
      case 'edit':
        this.#standardSubmitButtonLabel = cd.s('cf-save');
        this.#shortSubmitButtonLabel = cd.s('cf-save');
        break;
      case 'addSection':
        this.#standardSubmitButtonLabel = cd.s('cf-addtopic');
        this.#shortSubmitButtonLabel = cd.s('cf-addtopic-short');
        break;
      case 'addSubsection':
        this.#standardSubmitButtonLabel = cd.s('cf-addsubsection');
        this.#shortSubmitButtonLabel = cd.s('cf-addsubsection-short');
        break;
      default:
        this.#standardSubmitButtonLabel = cd.s('cf-reply');
        this.#shortSubmitButtonLabel = cd.s('cf-reply-short');
    }

    /**
     * @typedef {object} OoUiButtonWidget
     * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.ButtonWidget
     */

    /**
     * Script settings button.
     *
     * @type {OoUiButtonWidget}
     */
    this.settingsButton = new OO.ui.ButtonWidget({
      label: cd.s('cf-settings'),
      framed: false,
      classes: ['cd-button', 'cd-settingsButton'],
      tabIndex: String(this.id) + '30',
    });

    if (!cd.g.$popupsOverlay) {
      cd.g.$popupsOverlay = $('<div>')
        .addClass('cd-popupsOverlay')
        .appendTo(document.body);
    }

    /**
     * @typedef {object} OoUiPopupButtonWidget
     * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.PopupButtonWidget
     */

    /**
     * Help button.
     *
     * @type {OoUiPopupButtonWidget}
     */
    this.helpPopupButton = new OO.ui.PopupButtonWidget({
      label: cd.s('cf-help'),
      framed: false,
      classes: ['cd-button'],
      popup: {
        head: true,
        $content: cd.util.wrapInElement(cd.s('cf-help-content'), 'div'),
        padded: true,
        align: 'center',
      },
      $overlay: cd.g.$popupsOverlay,
      tabIndex: String(this.id) + '31',
    });

    /**
     * Cancel button.
     *
     * @type {OoUiButtonWidget}
     */
    this.cancelButton = new OO.ui.ButtonWidget({
      label: cd.s('cf-cancel'),
      flags: 'destructive',
      framed: false,
      classes: ['cd-button', 'cd-cancelButton'],
      tabIndex: String(this.id) + '32',
    });

    /**
     * View changes button.
     *
     * @type {OoUiButtonWidget}
     */
    this.viewChangesButton = new OO.ui.ButtonWidget({
      label: cd.s('cf-viewchanges'),
      classes: ['cd-viewChangesButton'],
      tabIndex: String(this.id) + '33',
    });

    if (!cd.settings.autopreview) {
      /**
       * Preview button.
       *
       * @type {OoUiButtonWidget}
       */
      this.previewButton = new OO.ui.ButtonWidget({
        label: cd.s('cf-preview'),
        classes: ['cd-previewButton'],
        tabIndex: String(this.id) + '34',
      });
    }

    /**
     * Submit button.
     *
     * @type {OoUiButtonWidget}
     */
    this.submitButton = new OO.ui.ButtonInputWidget({
      type: 'submit',
      label: this.#standardSubmitButtonLabel,
      flags: ['progressive', 'primary'],
      classes: ['cd-submitButton'],
      tabIndex: String(this.id) + '35',
    });

    if (this.deleteCheckbox && this.deleteCheckbox.isSelected()) {
      this.updateFormOnDeleteCheckboxChange(true);
    }

    this.$settings.append(
      this.summaryInput.$element,
      this.$summaryPreview,
      this.horizontalLayout.$element
    );
    this.$leftButtonsContainer.append(this.settingsButton.$element, this.helpPopupButton.$element);
    this.$rightButtonsContainer.append(...[
      this.cancelButton.$element,
      this.viewChangesButton && this.viewChangesButton.$element,
      this.previewButton && this.previewButton.$element,
      this.submitButton.$element
    ].filter(defined));
    this.$buttonsContainer.append(this.$leftButtonsContainer, this.$rightButtonsContainer);
    this.$form = $('<form>');
    this.$form.append(...[
      this.headlineInput && this.headlineInput.$element,
      this.commentInput.$element,
      this.$settings,
      this.$buttonsContainer,
    ].filter(defined));
    this.$innerWrapper.append(this.$messageArea, this.$form);

    if (this.mode !== 'edit' && !cd.settings.alwaysExpandSettings) {
      this.$settings.hide();
    }

    /**
     * The area where comment previews and changes are displayed.
     *
     * @type {JQuery}
     */
    this.$previewArea = $('<div>').addClass('cd-previewArea')
    if (cd.settings.autopreview) {
      this.$previewArea
        .addClass('cd-previewArea-below')
        .appendTo(this.$innerWrapper);
    } else {
      this.$previewArea
        .addClass('cd-previewArea-above')
        .prependTo(this.$innerWrapper);
    }

    if (this.target && this.isInNumberedList && $.client.profile().layout !== 'webkit') {
      // Dummy element for forms inside a numbered list so that the number is placed in front of
      // that area, not in some silly place. Note that in Chrome, the number is placed in front of
      // the textarea, so we don't need this in that browser.
      $('<div>')
        .html('&nbsp;')
        .addClass('cd-commentForm-dummyElement')
        .prependTo(this.$innerWrapper);
    }

    if (cd.settings.showToolbar) {
      this.addToolbar();
    }

    if (cd.settings.insertButtons.length) {
      /**
       * Text insert buttons.
       *
       * @type {JQuery}
       */
      this.$insertButtons = $('<div>')
        .addClass('cd-insertButtons')
        .insertAfter(this.commentInput.$element);

      cd.settings.insertButtons.forEach((button) => {
        let text;
        let displayedText;
        if (Array.isArray(button)) {
          text = button[0];
          displayedText = button[1];
        } else {
          text = button;
        }
        this.addInsertButton(text, displayedText);
      });
    }
  }

  /**
   * Insert the form into the DOM.
   */
  addToPage() {
    // 'addSection'
    if (!mw.config.get('wgArticleId')) {
      cd.g.$root.empty();
    }

    switch (this.mode) {
      case 'reply': {
        this.$element.insertAfter(this.target.$elements.last());
        break;
      }

      case 'edit': {
        // We insert the form before the comment so that if the comment ends on a wrong level, the
        // form is on a right one. The exception is comments that open a section (otherwise a bug
        // will be introduced that will manifest when opening an "Add subsection" form of the
        // previous section).
        if (this.target.isOpeningSection) {
          this.$element.insertAfter(this.target.$elements.last());
        } else {
          this.$element.insertBefore(this.target.$elements.first());
        }
        break;
      }

      case 'replyInSection': {
        this.$element.appendTo(this.target.$replyWrapper);
        this.target.$replyWrapper.addClass('cd-replyWrapper-hasCommentForm');
        break;
      }

      case 'addSection': {
        this.newTopicOnTop = this.$addSectionLink && this.$addSectionLink.is('[href*="section=0"]');
        if (this.newTopicOnTop && cd.sections[0]) {
          this.$element.insertBefore(cd.sections[0].$heading);
        } else {
          this.$element.appendTo(cd.g.$root);
        }
        break;
      }

      case 'addSubsection': {
        // In the following structure:
        //   == Level 2 section ==
        //   === Level 3 section ===
        //   ==== Level 4 section ====
        // ..."Add subsection" forms should go in the opposite order. So, if there are "Add
        // subsection" forms for a level 4 and then a level 2 section, we need to put our form
        // between them.
        const headingLevelRegexp = new RegExp(
          `\\bcd-commentForm-addSubsection-[${this.target.level}-6]\\b`
        );
        let $target;
        let $tested = this.target.$elements.last();
        do {
          $target = $tested;
          $tested = $tested.next();
        } while (
          $tested.is('.cd-sectionButtonContainer') ||
          ($tested.length && $tested.get(0).className.match(headingLevelRegexp))
        );
        this.$element.insertAfter($target);
        break;
      }
    }

    this.adjustLabels();
  }

  /**
   * Add events to form elements.
   */
  addEvents() {
    const saveSessionEventHandler = () => {
      saveSession();
    };
    const preview = () => {
      this.preview();
    };
    const previewFalse = () => {
      this.preview(false);
    };

    const textReactions = [
      {
        pattern: new RegExp(cd.g.SIGN_CODE + '\\s*$'),
        message: cd.s('cf-reaction-signature', cd.g.SIGN_CODE),
        class: 'signatureNotNeeded',
        type: 'notice',
      },
      {
        pattern: /<pre/,
        message: cd.s('cf-reaction-pre'),
        class: 'dontUsePre',
        type: 'warning',
      },
    ].concat(cd.config.customTextReactions);

    this.$form
      .on('submit', (e) => {
        e.preventDefault();
        this.submit();
      })
      // Hotkeys
      .on('keydown', (e) => {
        // Ctrl+Enter
        if (e.ctrlKey && !e.shiftKey && !e.altKey && e.keyCode === 13) {
          this.submit();
        }

        // Esc
        if (!e.ctrlKey && !e.shiftKey && !e.altKey && e.keyCode === 27) {
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

          if (headline.includes('{{')) {
            this.showMessage(
              cd.s('cf-reaction-templateinheadline'),
              'warning',
              'templateInHeadline'
            );
          } else {
            this.hideMessage('templateInHeadline');
          }
        })
        .on('change', preview)
        .on('change', saveSessionEventHandler);
    }
    this.commentInput
      .on('change', (text) => {
        this.updateAutoSummary(true, true);

        textReactions.forEach((reaction) => {
          if (
            reaction.pattern.test(text) &&
            (typeof reaction.checkFunc !== 'function' || reaction.checkFunc())
          ) {
            this.showMessage(reaction.message, reaction.type, reaction.class);
          } else {
            this.hideMessage(reaction.class);
          }
        });
      })
      .on('change', preview)
      .on('change', saveSessionEventHandler);
    this.summaryInput
      .on('change', () => {
        if (!this.#dontAutopreview) {
          preview();
        }
      })
      .on('change', saveSessionEventHandler);
    this.summaryInput.$element
      .on('keypress', () => {
        this.summaryAltered = true;
        this.#dontAutopreview = false;
      });
    if (this.minorCheckbox) {
      this.minorCheckbox
        .on('change', saveSessionEventHandler);
    }
    this.watchCheckbox
      .on('change', saveSessionEventHandler);
    if (this.watchSectionCheckbox) {
      this.watchSectionCheckbox
        .on('change', saveSessionEventHandler);
    }
    if (this.pingCheckbox) {
      this.pingCheckbox
        .on('change', previewFalse)
        .on('change', saveSessionEventHandler);
    }
    if (this.smallCheckbox) {
      this.smallCheckbox
        .on('change', previewFalse)
        .on('change', saveSessionEventHandler);
    }
    if (this.noSignatureCheckbox) {
      this.noSignatureCheckbox
        .on('change', previewFalse)
        .on('change', saveSessionEventHandler);
    }
    if (this.deleteCheckbox) {
      this.deleteCheckbox
        .on('change', (selected) => {
          this.updateAutoSummary();
          this.updateFormOnDeleteCheckboxChange(selected);
        })
        .on('change', (selected) => {
          if (selected && cd.settings.autopreview) {
            this.$previewArea.empty();
          }
        })
        .on('change', saveSessionEventHandler);
    }
    this.scriptSettingsButton
      .on('click', () => {
        settingsDialog();
      });
    this.settingsButton
      .on('click', () => {
        this.toggleSettings();
      });
    this.cancelButton
      .on('click', () => {
        this.cancel();
      });
    this.viewChangesButton
      .on('click', () => {
        this.viewChanges();
      });
    if (this.previewButton) {
      this.previewButton
        .on('click', () => {
          this.preview(true, false);
        });
    }
  }

  /**
   * Show or hide the comment settings.
   */
  toggleSettings() {
    if (this.$settings.is(':hidden')) {
      this.$settings.show();
    } else {
      this.$settings.hide();
    }
  }

  /**
   * Adjust button labels according to the form width: if the form is to narrow, the labels will
   * shrink.
   */
  adjustLabels() {
    let formWidth = this.$innerWrapper.width();

    if (this.$element.hasClass('cd-commentForm-short')) {
      if (formWidth >= this.#standardButtonsTotalWidth + 7) {
        this.$element.removeClass('cd-commentForm-short');
        this.submitButton.setLabel(this.#standardSubmitButtonLabel);
        if (this.previewButton) {
          this.previewButton.setLabel(cd.s('cf-preview'));
        }
        if (this.viewChangesButton) {
          this.viewChangesButton.setLabel(cd.s('cf-viewchanges'));
        }
        this.cancelButton.setLabel(cd.s('cf-cancel'));
      }
    } else {
      this.#standardButtonsTotalWidth = (
        this.submitButton.$element.outerWidth(true) +
        (this.previewButton ? this.previewButton.$element.outerWidth(true) : 0) +
        (this.viewChangesButton ? this.viewChangesButton.$element.outerWidth(true) : 0) +
        this.settingsButton.$element.outerWidth(true) +
        this.helpPopupButton.$element.outerWidth(true) +
        this.cancelButton.$element.outerWidth(true)
      );
      if (formWidth < this.#standardButtonsTotalWidth + 7) {
        this.$element.addClass('cd-commentForm-short');
        this.submitButton.setLabel(this.#shortSubmitButtonLabel);
        if (this.previewButton) {
          this.previewButton.setLabel(cd.s('cf-preview-short'));
        }
        if (this.viewChangesButton) {
          this.viewChangesButton.setLabel(cd.s('cf-viewchanges-short'));
        }
        this.cancelButton.setLabel(cd.s('cf-cancel-short'));
      }
    }
  }

  /**
   * Push the pending status of the form inputs.
   *
   * @param {boolean} blockButtons Whether to block buttons.
   * @see
   *   https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.mixin.PendingElement-method-pushPending
   */
  pushPending(blockButtons = false) {
    this.commentInput.pushPending();
    this.summaryInput.pushPending();
    if (this.headlineInput) {
      this.headlineInput.pushPending();
    }

    if (blockButtons) {
      this.submitButton.setDisabled(true);
      if (this.previewButton) {
        this.previewButton.setDisabled(true);
      }
      if (this.viewChangesButton) {
        this.viewChangesButton.setDisabled(true);
      }
      this.cancelButton.setDisabled(true);
    }
  }

  /**
   * Pop the pending status of the form inputs.
   *
   * @param {boolean} unblockButtons Whether to unblock buttons if they were blocked.
   * @see
   *   https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.mixin.PendingElement-method-popPending
   */
  popPending(unblockButtons = false) {
    this.commentInput.popPending();
    this.summaryInput.popPending();
    if (this.headlineInput) {
      this.headlineInput.popPending();
    }

    if (unblockButtons) {
      this.submitButton.setDisabled(false);
      if (this.previewButton) {
        this.previewButton.setDisabled(false);
      }
      if (this.viewChangesButton) {
        this.viewChangesButton.setDisabled(false);
      }
      this.cancelButton.setDisabled(false);
    }
  }

  /**
   * Show a service message above the form.
   *
   * @param {string|JQuery} html
   * @param {string} [type='notice'] `'notice'`, `'error'`, `'warning'`, or `'success'`. See {@link
   *   https://doc.wikimedia.org/oojs-ui/master/demos/?page=widgets&theme=wikimediaui&direction=ltr&platform=desktop#MessageWidget-type-notice-inline-true
   *   the OOUI Demos}.
   * @param {string} [className]
   */
  showMessage(html, type = 'notice', className) {
    if (
      this.destroyed ||
      (className && this.$messageArea.children(`.cd-message-${className}`).length)
    ) {
      return;
    }

    const $label = html instanceof $ ? html : cd.util.wrapInElement(html);
    const classes = ['cd-message'];
    if (className) {
      classes.push(`cd-message-${className}`);
    }
    const message = new OO.ui.MessageWidget({
      type,
      inline: true,
      label: $label,
      classes,
    });
    this.$messageArea
      .append(message.$element)
      .cdAddCloseButton()
      .cdScrollIntoView('top');
  }

  /**
   * Hide the service message above the form with the provided class.
   *
   * @param {string} className
   */
  hideMessage(className) {
    const $info = this.$messageArea.children(`.cd-message-${className}`);
    if ($info.length) {
      $info.remove();
    }
  }

  /**
   * Abort the operation the form is undergoing and show an error message.
   *
   * @param {object} options
   * @param {string} options.message Message visible to the user.
   * @param {string} [options.messageType='error'] Message type if not `'error'` (`'notice'` or
   *   `'warning'`).
   * @param {string} [options.logMessage] Message for the browser console.
   * @param {Function} [options.retryFunc] Function to execute when the user presses "Retry".
   *   Presence of this value implies tearing down the form.
   * @param {boolean} [options.tearDown=false] Tear down the primary form elements (but keep the
   *   message area).
   * @param {boolean} [options.isRawMessage=false] Show the message as it is, without icons and
   *   framing.
   * @param {object} [options.currentOperation] Operation the form is undergoing.
   * @private
   */
  abort({
    message,
    messageType = 'error',
    logMessage,
    retryFunc,
    tearDown = false,
    isRawMessage = false,
    currentOperation,
  }) {
    if (currentOperation) {
      this.closeOperation(currentOperation);
    }

    if (this.destroyed) return;

    if (logMessage) {
      console.warn(logMessage);
    }

    if (!(currentOperation && currentOperation.type === 'preview' && cd.settings.autopreview)) {
      if (isRawMessage) {
        this.$messageArea.append(message);
      } else {
        this.showMessage(message, messageType);
      }
    }

    if (retryFunc || tearDown) {
      this.$innerWrapper.children(':not(.cd-messageArea)').remove();

      const cancelLink = new OO.ui.ButtonWidget({
        label: cd.s('cf-error-cancel'),
        framed: false,
      });
      cancelLink.on('click', () => {
        this.cancel(false);
      });

      const $div = $('<div>')
        .append(cancelLink.$element)
        .appendTo(this.$messageArea);

      if (retryFunc) {
        const retryLink = new OO.ui.ButtonWidget({
          label: cd.s('cf-error-tryagain'),
          framed: false,
        });
        retryLink.on('click', () => {
          this.$messageArea.empty();
          retryFunc.call(this);
        });
        $div.append(retryLink.$element);
      }
    }

    this.$messageArea.cdScrollIntoView('top');
  }

  /**
   * Generate an error text for an unknown error.
   *
   * @param {string} errorCode
   * @param {string} [errorInfo]
   * @returns {string}
   * @private
   */
  async unknownApiErrorText(errorCode, errorInfo) {
    let text;
    if (errorCode) {
      text = cd.s('error-api', errorCode) + ' ';
      if (errorInfo) {
        try {
          const { html } = await parseCode(errorInfo);
          text += html;
        } catch (e) {
          text += errorInfo;
        }
      }
    }

    return text;
  }

  /**
   * Abort the operation the form is undergoing and show an appropriate error message. This is a
   * wrapper around {@link module:CommentForm#abort}.
   *
   * @param {object} options
   * @param {string} options.type Type of the error: `'parse'` for parse errors defined in the
   *   script, `'api'` for MediaWiki API errors, `'network'` for network errors defined in the
   *   script, `'javascript'` for JavaScript errors.
   * @param {string} [options.code] Code of the error (either `code`, `apiData`, or `message`
   *   should be specified).
   * @param {string} [options.apiData] Data object received from the MediaWiki server (either
   *   `code`, `apiData`, or `message` should be specified).
   * @param {string} [options.message] Text of the error (either `code`, `apiData`, or `message`
   *   should be specified).
   * @param {string} [options.messageType] Message type if not `'error'` (`'notice'` or
   *   `'warning'`).
   * @param {string} [options.logMessage] Data or text to display in the browser console.
   * @param {Function} [options.retryFunc] Function to execute when the user presses "Retry".
   *   Presence of this value implies deletion of the form elements.
   * @param {boolean} [options.tearDown=false] Tear down the primary form elements (but keep the
   *   message area).
   * @param {boolean} [options.isRawMessage=false] Show the message as it is, without OOUI framing.
   * @param {object} [options.currentOperation] Operation the form is undergoing.
   */
  async handleError({
    type,
    code,
    apiData,
    message,
    messageType,
    logMessage,
    retryFunc,
    tearDown = false,
    isRawMessage = false,
    currentOperation,
  }) {
    switch (type) {
      case 'parse': {
        switch (code) {
          case 'couldntLocateComment':
            message = cd.s('error-locatecomment');
            break;
          case 'couldntLocateSection':
            message = cd.s('error-locatesection');
            break;
          case 'numberedList':
            message = cd.s('cf-error-numberedlist');
            break;
          case 'findPlace':
            message = cd.s('cf-error-findplace');
            break;
          case 'findPlace-unexpectedHeading':
            message = cd.s('cf-error-findplace-unexpectedheading');
            break;
          case 'delete-repliesToComment':
            message = cd.s('cf-error-delete-repliestocomment');
            break;
          case 'delete-repliesInSection':
            message = cd.s('cf-error-delete-repliesinsection');
            break;
        }
        const $message = animateLink(message, 'cd-message-reloadPage', async () => {
          this.reloadPage({}, null, true);
        });
        this.abort({
          message: $message,
          messageType,
          retryFunc,
          tearDown,
          isRawMessage,
          currentOperation,
        });
        break;
      }

      case 'api': {
        // Error messages related to error codes from API should rewrite our generic messages.
        switch (code) {
          case 'missing': {
            message = cd.s('cf-error-pagedoesntexist');
            break;
          }

          case 'error': {
            const {
              code: errorCode,
              info: errorInfo,
            } = apiData.error;
            switch (errorCode) {
              case 'missingtitle':
                message = cd.s('cf-error-pagedoesntexist');
                break;
              default:
                message = await this.unknownApiErrorText(errorCode, errorInfo);
            }
            break;
          }
        }

        const $message = cd.util.wrapInElement(message);
        $message.find('.mw-parser-output').css('display', 'inline');
        this.abort({
          message: $message,
          messageType,
          isRawMessage,
          logMessage: logMessage || [code, apiData],
          retryFunc,
          tearDown,
          currentOperation,
        });
        break;
      }

      case 'network': {
        message = (message ? `${message} ` : '') + cd.s('error-network');
        this.abort({
          message,
          isRawMessage,
          logMessage,
          retryFunc,
          tearDown,
          currentOperation,
        });
        break;
      }

      case 'javascript': {
        this.abort({
          message: cd.s('error-javascript'),
          logMessage,
          tearDown,
          currentOperation,
        });
        break;
      }
    }
  }

  /**
   * Convert the comment in the form to wikitext.
   *
   * @param {string} action `'submit'` (view changes maps to this too) or `'preview'`.
   * @returns {string}
   * @throws {CdError}
   */
  commentTextToCode(action) {
    let text = this.commentInput.getValue();

    // Prepare indentation characters
    let indentationChars;
    let replyIndentationChars;

    // If this is a preview, there's no point to look into the code.
    if (this.target instanceof Comment) {
      indentationChars = this.target.inCode.indentationChars;
      replyIndentationChars = this.target.inCode.replyIndentationChars;
    }
    indentationChars = indentationChars || '';

    if (this.mode === 'reply') {
      indentationChars = replyIndentationChars;
    } else if (this.mode === 'replyInSection') {
      indentationChars = (
        this.target.inCode.lastCommentFirstIndentationChar ||
        cd.config.defaultIndentationChar
      );
    }

    const isZeroLevel = (
      action === 'preview' ||
      ['addSection', 'addSubsection'].includes(this.mode) ||
      (this.mode === 'edit' && !indentationChars)
    );

    const newLineIndentationChars = indentationChars.replace(/\*/g, ':');

    // Work with code
    let code = text.trim();

    let useColonsForNewLines = /^[:*#]/.test(code);
    let hasTable = false;
    let hidden;
    ({ code, hidden } = hideSensitiveCode(code, (isTable) => {
      if (isTable && this.willCommentBeIndented) {
        useColonsForNewLines = true;
        hasTable = true;
      }
    }));

    let implicitSmall = false;
    if (this.smallCheckbox) {
      // If the user wrapped the comment in <small></small>, select the relevant checkbox and remove
      // the tags. This will include the signature into the tags and possibly ensure the right line
      // spacing.
      code = code.replace(/^<small>([^]*)<\/small>$/i, (s, m1) => {
        implicitSmall = true;
        return m1;
      });
    }
    // Remove spaces from empty lines except when they are a part of the syntax creating <pre>.
    code = code
      .replace(/^(?:[ \t\xA0\uFEFF]*\n)+(?! )/gm, (s) => s.replace(/^[ \t\uFEFF\xA0]+/gm, ''));

    let signature;
    if (this.noSignatureCheckbox && this.noSignatureCheckbox.isSelected()) {
      signature = '';
    } else {
      signature = this.mode === 'edit' ?
        this.target.inCode.signature :
        cd.settings.mySignature;
    }

    // So that the signature doesn't turn out to be at the end of the last item of the list if the
    // comment contains one.
    if (
      signature &&
      (this.mode !== 'edit' || !/^[ \t]*\n/.test(signature)) &&
      /\n[:*#].*$/.test(code)
    ) {
      code += '\n';

      if (this.mode === 'edit') {
        signature = signature.replace(/^\s+/, '');
      }
    }

    if (!isZeroLevel) {
      code = code.replace(/\n([:*#]+)/g, (s, m1) => {
        useColonsForNewLines = true;
        // **** → ::::, if the comment contains a list or internal indentations.
        return '\n' + newLineIndentationChars + m1;
      });
      if (useColonsForNewLines && indentationChars) {
        code = code.replace(/\n(?![:#\x03])/g, () => {
          if (newLineIndentationChars === '#') {
            throw new CdError({
              type: 'parse',
              code: 'numberedList',
            });
          }
          return `\n${newLineIndentationChars}` + (cd.config.spaceAfterIndentationChar ? ' ' : '');
        });
      }
    }

    if (this.willCommentBeIndented) {
      // Remove spaces in the beginning of lines if the comment is indented.
      code = code.replace(/^ +/gm, '');

      const replacement = cd.config.paragraphTemplates.length ?
        `$1{{${cd.config.paragraphTemplates[0]}}}` :
        '$1<br><br>';
      code = code.replace(/^((?![:*#= ]).*)\n\n(?![:*#=])/gm, replacement);
    }

    // Process newlines by adding or not adding <br> and keeping or not keeping the newline. (\x03
    // and \x04 mean the beginning and ending of a table.)
    const entireLineRegexp = new RegExp(
      `^(?:\\x01.*?\\x02 *|\\[\\[${cd.g.FILE_PREFIX_PATTERN}.+\\]\\]\\s*)$`,
      'im'
    );
    const thisLineEndingRegexp = new RegExp(
      `(?:<${cd.g.PNIE_PATTERN}(?: [\\w ]+?=[^<>]+?| ?\\/?)>|<\\/${cd.g.PNIE_PATTERN}>)|\\x04$`,
      'i'
    );
    const nextLineBeginningRegexp = new RegExp(
      `^(?:<\\/${cd.g.PNIE_PATTERN}>|<${cd.g.PNIE_PATTERN})`,
      'i'
    );
    code = code.replace(
      /^((?![:*#= ]).+)\n(?![\n:*#= \x03])(?=(.*))/gm,
      (s, thisLine, nextLine) => {
        const br = (
          // We assume that if a tag/template occupies an entire line or multiple lines, it's a block
          // tag/template and it doesn't need <br>s before or after it. A false positive is possible
          // in case of <nowiki> occupying an entire line (as of May 2020, no other inline tags are
          // hidden, see hideSensitiveCode() in wikitext.js).
          // https://en.wikipedia.org/w/index.php?diff=946978893
          // https://en.wikipedia.org/w/index.php?diff=941991985
          entireLineRegexp.test(thisLine) ||
          entireLineRegexp.test(nextLine) ||

          // Removing <br>s after block elements is not a perfect solution as there would be no
          // newlines when editing such comment, but this way we would avoid empty lines in cases like
          // "</div><br>".
          thisLineEndingRegexp.test(thisLine) ||
          nextLineBeginningRegexp.test(nextLine)
        ) ?
          '' :
          '<br>';
        const newline = this.willCommentBeIndented ? '' : '\n';
        return thisLine + br + newline;
      }
    );

    // Remove signature tildes
    code = code.replace(/\s*~{3,}$/, '');

    // Add the ping template
    if (this.pingCheckbox && this.pingCheckbox.isSelected()) {
      const name = this.targetComment.author.name.includes('=') ?
        '1=' + this.targetComment.author.name :
        this.targetComment.author.name;
      const param = code ? '' : '|p=.';
      let separator;
      if (/^[:*#]/.test(code)) {
        separator = '\n' + (isZeroLevel ? '' : newLineIndentationChars);
      } else {
        separator = ' ';
      }
      code = `{{${cd.config.pingTemplate}|${name}${param}}}${separator}${code}`;
    }

    // If there are numbered lists in the comment, replace all asterisks in the indentation chars
    // with colons to have the <ol> form correctly.
    if (!isZeroLevel && /^#/gm.test(code)) {
      indentationChars = newLineIndentationChars;
    }

    // Add the headline
    if (this.headlineInput) {
      let level;
      if (this.mode === 'addSection') {
        level = 2;
      } else if (this.mode === 'addSubsection') {
        level = this.target.level + 1;
      } else {
        level = this.target.inCode.headingLevel;
      }
      const equalSigns = '='.repeat(level);

      if (this.#editingSectionOpeningComment && /^\n/.test(this.target.inCode.code)) {
        // To have pretty diffs.
        code = '\n' + code;
      }
      code = `${equalSigns} ${this.headlineInput.getValue().trim()} ${equalSigns}\n${code}`;
    }

    // Add the signature
    if (action === 'preview' && signature) {
      signature = `<span class="cd-commentForm-signature">${signature}</span>`;
    }
    // ">" is an ad hoc fix to Sdkb's signature:
    // https://en.wikipedia.org/w/index.php?diff=953603813.
    if (!/^\s/.test(signature) && code && !/[\s>]$/.test(code)) {
      code += ' ';
    }
    // Space in the beggining of the line, creating <pre>.
    if (/(?:^|\n) .*$/.test(code)) {
      code += '\n';
    }
    code += signature;

    // Process small font wrappers
    if (this.smallCheckbox) {
      if (this.smallCheckbox.isSelected() || implicitSmall) {
        const indentation = (
          newLineIndentationChars +
          (/^[:*#]/.test(code) || !cd.config.spaceAfterIndentationChar ? '' : ' ')
        );
        const before = /^[:*# ]/.test(code) ? `\n${indentation}` : '';
        const adjustedCode = code.replace(/\|/g, '{{!}}');
        code = (cd.config.blockSmallTemplate && !/^[:*#]/m.test(code)) ?
          `{{${cd.config.blockSmallTemplate}|1=${adjustedCode}}}` :
          `<small>${before}${code}</small>`;
      }
    }

    if (this.mode !== 'edit') {
      code += '\n';
    }

    // Add indentation characters
    if (action === 'submit') {
      if (this.mode === 'reply' || this.mode === 'replyInSection') {
        code = (
          indentationChars +
          (
            indentationChars && !/^[:*#]/.test(code) && cd.config.spaceAfterIndentationChar ?
            ' ' :
            ''
          ) +
          code
        );
      }

      // When an indented comment had been started with a list but the list has gone after editing.
      // Really rare but possible (see
      // https://ru.wikipedia.org/w/index.php?diff=next&oldid=105978713) case.
      if (
        this.willCommentBeIndented &&
        this.mode === 'edit' &&
        /^[:*]/.test(this.target.inCode.code) &&
        !/^[:*]/.test(code)
      ) {
        code = ' ' + code;
      }

      if (this.mode === 'addSubsection') {
        code += '\n';
      }
    }

    // Imitate a list so that the user will see where it would break on a real page. This
    // pseudolist's margin is made invisible by CSS.
    let imitateList;
    if (
      action === 'preview' &&
      this.willCommentBeIndented &&
      this.commentInput.getValue().trim() &&
      !hasTable
    ) {
      code = code.replace(/^/gm, ':');
      imitateList = true;
    } else {
      imitateList = false;
    }

    code = unhideSensitiveCode(code, hidden);

    if (cd.config.customCodeTransformations) {
      code = cd.config.customCodeTransformations(code, this);
    }

    return { code, imitateList };
  }

  /**
   * @typedef {object} TryPrepareNewPageCodeReturn
   * @property {object} page
   * @property {string} newPageCode
   * @private
   */

  /**
   * Prepare the new page code and handle errors.
   *
   * @param {string} action `'submit'` or `'viewChanges'`.
   * @returns {TryPrepareNewPageCodeReturn}
   * @private
   */
  async tryPrepareNewPageCode(action) {
    let page;
    try {
      page = await getLastRevision(this.targetPage);
    } catch (e) {
      if (e instanceof CdError) {
        this.handleError(Object.assign({}, { message: cd.s('cf-error-getpagecode') }, e.data));
      } else {
        this.handleError({
          type: 'javascript',
          logMessage: e,
        });
      }
      return;
    }

    let newPageCode;
    try {
      newPageCode = this.prepareNewPageCode(page.code, action);
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

    return { page, newPageCode };
  }

  /**
   * Prepare the new page code based on the form input.
   *
   * @param {string} pageCode
   * @param {string} action `'submit'` or `'viewChanges'`.
   * @returns {string}
   * @throws {CdError}
   * @private
   */
  prepareNewPageCode(pageCode, action) {
    pageCode += '\n';

    let targetInCode;
    if (this.target) {
      this.target.locateInCode(pageCode);
      targetInCode = this.target.inCode;
      if (this.mode === 'edit') {
        this.willCommentBeIndented = this.target.inCode.indentationChars;
      }
    }

    let currentIndex;
    if (this.mode === 'reply') {
      currentIndex = targetInCode.endIndex;
      const succeedingText = pageCode.slice(currentIndex);

      const properPlaceRegexp = new RegExp(
        '^([^]*?(?:' + mw.util.escapeRegExp(targetInCode.signature) + '|' +
        cd.g.TIMESTAMP_REGEXP.source + '.*)\\n)\\n*' +
        (
          targetInCode.indentationChars.length > 0 ?
          `[:*#]{0,${targetInCode.indentationChars.length}}` :
          ''
        ) +
        '(?![:*#\\n])'
      );
      const properPlaceMatch = properPlaceRegexp.exec(succeedingText);
      if (!properPlaceMatch) {
        throw new CdError({
          type: 'parse',
          code: 'findPlace',
        });
      }

      // If the comment is to be put after a comment with different indentation characters, use
      // these.
      const textBeforeInsertion = properPlaceMatch[1];
      const changedIndentationCharsMatch = textBeforeInsertion.match(/\n([:*#]{2,}).*\n$/);
      const changedIndentationChars = (
        changedIndentationCharsMatch && changedIndentationCharsMatch[1]
      );
      if (changedIndentationChars) {
        if (changedIndentationChars.length > targetInCode.indentationChars.length) {
          // Note a bug https://ru.wikipedia.org/w/index.php?diff=next&oldid=105529545 that was
          // possible here because of "slice(0, targetInCode.indentationChars.length + 1)".
          targetInCode.replyIndentationChars = changedIndentationChars
            .slice(0, targetInCode.replyIndentationChars.length)
            .replace(/:$/, cd.config.defaultIndentationChar);
        } else {
          targetInCode.indentationChars = changedIndentationChars
            .slice(0, targetInCode.indentationChars.length)
            .replace(/:$/, cd.config.defaultIndentationChar);
        }
      }

      const adjustedTextBeforeInsertion = textBeforeInsertion.replace(/<!--[^]*?-->/g, '');
      if (/\n(=+).*?\1[ \t]*\n/.test(adjustedTextBeforeInsertion)) {
        throw new CdError({
          type: 'parse',
          code: 'findPlace-unexpectedHeading',
        });
      }
      currentIndex += textBeforeInsertion.length;
    }

    if (
      this.mode === 'replyInSection' &&
      // For now we use the workaround with this.isInNumberedList to make sure "#" is a part of
      // comments organized in a numbered list, not of a numbered list _in_ the target comment in
      // which case the reply is in an <ul> tag, not <ol>.
      this.isInNumberedList &&
      /\n#.*\n+$/.test(targetInCode.firstChunkCode)
    ) {
      targetInCode.lastCommentFirstIndentationChar = '#';
    }

    const isDelete = this.deleteCheckbox && this.deleteCheckbox.isSelected();
    let commentCode;
    if (!isDelete) {
      try {
        ({ code: commentCode } = this.commentTextToCode('submit'));
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
    }

    let newPageCode;
    let before;
    switch (this.mode) {
      case 'reply': {
        before = pageCode.slice(0, currentIndex);
        newPageCode = before + commentCode + pageCode.slice(currentIndex);
        break;
      }

      case 'edit': {
        if (isDelete) {
          let startIndex;
          let endIndex;
          if (this.target.isOpeningSection && targetInCode.headingStartIndex !== undefined) {
            this.target.section.locateInCode(pageCode);
            const targetInCode = this.target.section.inCode;
            const commentCount = extractSignatures(targetInCode.code).length;
            if (commentCount > 1) {
              throw new CdError({
                type: 'parse',
                code: 'delete-repliesInSection',
              });
            } else {
              // Deleting the whole section is safer as we don't want to leave any content in the
              // end anyway.
              ({ startIndex, contentEndIndex: endIndex } = targetInCode);
            }
          } else {
            endIndex = targetInCode.endIndex + targetInCode.dirtySignature.length + 1;
            const succeedingText = pageCode.slice(targetInCode.endIndex);

            const repliesRegexp = new RegExp(
              `^.+\\n+[:*#]{${targetInCode.indentationChars.length + 1},}`
            );
            const repliesMatch = repliesRegexp.exec(succeedingText);

            if (repliesMatch) {
              throw new CdError({
                type: 'parse',
                code: 'delete-repliesToComment',
              });
            } else {
              startIndex = targetInCode.lineStartIndex;
            }
          }

          newPageCode = pageCode.slice(0, startIndex) + pageCode.slice(endIndex);
        } else {
          const startIndex = (
            this.target.isOpeningSection && targetInCode.headingStartIndex !== undefined ?
            targetInCode.headingStartIndex :
            targetInCode.startIndex
          );
          before = pageCode.slice(0, startIndex);
          newPageCode = (
            before +
            commentCode +
            pageCode.slice(targetInCode.endIndex + targetInCode.dirtySignature.length)
          );
        }
        break;
      }

      case 'replyInSection': {
        before = pageCode.slice(0, targetInCode.firstChunkContentEndIndex);
        newPageCode = before + commentCode + pageCode.slice(targetInCode.firstChunkContentEndIndex);
        break;
      }

      case 'addSection': {
        if (this.newTopicOnTop) {
          const adjustedPageCode = hideHtmlComments(pageCode);
          const firstSectionIndex = adjustedPageCode.search(/^(=+).*?\1/m);
          before = pageCode.slice(0, firstSectionIndex);
          newPageCode = before + commentCode + '\n' + pageCode.slice(firstSectionIndex);
        } else {
          before = (pageCode + '\n').trimStart();
          newPageCode = before + commentCode;
        }
        break;
      }

      case 'addSubsection': {
        before = pageCode.slice(0, targetInCode.contentEndIndex).replace(/([^\n])\n$/, '$1\n\n');
        newPageCode = before + commentCode + pageCode.slice(targetInCode.contentEndIndex);
        break;
      }
    }

    if (action === 'submit' && !isDelete) {
      // We need this only to generate anchors for the comments above ours to avoid collisions.
      extractSignatures(before, true);
    }

    return newPageCode;
  }

  /**
   * Add an operation to the registry of operations.
   *
   * @param {Operation} operation
   */
  registerOperation(operation) {
    this.operations.push(operation);
    operation.closed = false;
    if (operation.type !== 'preview' || !cd.settings.autopreview) {
      this.$messageArea.empty();
      this.pushPending(operation.type === 'submit');
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
   * @param {Operation} operation
   * @param {boolean} [condition] Additional condition to close operation on.
   * @returns {boolean}
   */
  closeOperationIfNecessary(operation, condition) {
    if (operation.closed) {
      return true;
    }
    const otherOperationIndex = findLastIndex(
      this.operations,
      // With "&& !op.delayed", the preview would try to update at every key stroke, but not more
      // often than once a second. Without "&& !op.delayed", the preview would update only when
      // the user didn't type anything for 1 second (but still make requests in the background).
      (op) => operation !== op && ['preview', 'viewChanges'].includes(op.type) && !op.delayed
    );
    if (
      (otherOperationIndex !== null && otherOperationIndex > this.operations.indexOf(operation)) ||
      condition
    ) {
      this.closeOperation(operation);
      return true;
    } else {
      return false;
    }
  }

  /**
   * Mark the operation as closed. Should be done when the operation has finished (either
   * successfully or not).
   *
   * @param {Operation} operation
   */
  closeOperation(operation) {
    operation.closed = true;
    if (operation.type !== 'preview' || !cd.settings.autopreview) {
      this.popPending(operation.type === 'submit');
    }
  }

  /**
   * Remove the operation from the registry of operations.
   *
   * @param {Operation} operation
   */
  unregisterOperation(operation) {
    if (this.operations.includes(operation)) {
      this.operations.splice(this.operations.indexOf(operation), 1);
    }
  }

  /**
   * Whether the form is being submitted right now.
   *
   * @returns {boolean}
   */
  isBeingSubmitted() {
    return this.operations.some((op) => op.type === 'submit' && !op.closed);
  }

  /**
   * Preview the comment.
   *
   * @param {boolean} [maySummaryHaveChanged=false] If `false`, don't preview if the comment input
   *   is empty.
   * @param {boolean} [auto=true] Preview is initiated automatically (if the user has
   *   `cd.settings.autopreview` as `true`).
   * @param {boolean} [operation] Operation object when the function is called from within itself,
   *   being delayed.
   */
  async preview(maySummaryHaveChanged = true, auto = true, operation) {
    if (
      this.textLoaded === false ||
      (
        this.target &&
        !this.target.inCode &&
        this.checkCodeRequest &&
        this.checkCodeRequest.state() === 'resolved'
      ) ||
      this.isBeingSubmitted() ||
      (auto && !cd.settings.autopreview)
    ) {
      if (operation) {
        this.closeOperation(operation);
      }
      return;
    }

    let currentOperation;
    if (operation) {
      currentOperation = operation;
    } else {
      currentOperation = { type: 'preview' };
      this.registerOperation(currentOperation);
    }

    if (auto) {
      const isTooEarly = Date.now() - this.#lastPreviewTimestamp < 1000;
      if (
        isTooEarly ||
        this.operations
          .some((op) => !op.closed && op.type === 'preview' && op !== currentOperation)
      ) {
        if (this.#previewTimeout) {
          this.unregisterOperation(currentOperation);
        } else {
          currentOperation.delayed = true;
          this.#previewTimeout = setTimeout(() => {
            this.#previewTimeout = null;
            this.preview(maySummaryHaveChanged, true, currentOperation);
          }, isTooEarly ? 1000 - (Date.now() - this.#lastPreviewTimestamp) : 100);
        }
        return;
      }
      this.#lastPreviewTimestamp = Date.now();
    }

    if (this.closeOperationIfNecessary(currentOperation)) return;

    // This happens:
    // - when restoring the form from a session,
    // - when the target comment has not been loaded yet, possibly because of an error when tried to
    // (if the mode is 'edit' and the comment has not been loaded, this method would halt after the
    // "this.textLoaded" check above).
    if (this.target && !this.target.inCode) {
      await this.checkCode();
      if (this.closeOperationIfNecessary(currentOperation, !this.target.inCode)) return;
    }

    // In case of an empty comment input, we in fact make this request for the sake of parsing
    // summary if there is a need.
    const emptyPreview = (
      !this.commentInput.getValue().trim() &&
      !(this.headlineInput && this.headlineInput.getValue().trim())
    );

    if (emptyPreview && !maySummaryHaveChanged) {
      this.closeOperation(currentOperation);
      return;
    }

    const { code: commentCode, imitateList } = this.commentTextToCode('preview');
    let html;
    let parsedSummary;
    try {
      ({ html, parsedSummary } = await parseCode(commentCode, {
        title: this.targetPage,
        summary: cd.util.buildEditSummary({ text: this.summaryInput.getValue() }),
      }));
    } catch (e) {
      if (e instanceof CdError) {
        this.handleError(Object.assign({}, e.data, {
          message: cd.s('cf-error-preview'),
          currentOperation,
        }));
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
      if ((auto && emptyPreview) || (this.deleteCheckbox && this.deleteCheckbox.isSelected())) {
        this.$previewArea.empty();
      } else {
        const $label = $('<div>')
          .addClass('cd-commentForm-blockLabel')
          .text(cd.s('cf-block-preview'));
        this.$previewArea
          .html(html)
          .prepend($label)
          .cdAddCloseButton();
        if (imitateList) {
          this.$previewArea.addClass('cd-previewArea-indentedComment');
        } else {
          this.$previewArea.removeClass('cd-previewArea-indentedComment');
        }
      }

      const $parsedSummary = parsedSummary && cd.util.wrapInElement(parsedSummary);
      if ($parsedSummary.length) {
        this.$element
          .find('.cd-summaryPreview')
          .html(`${cd.s('cf-summary-preview')}: <span class="comment">${$parsedSummary.html()}</span>`);
      }

      if (!auto) {
        mw.hook('wikipage.content').fire(this.$previewArea);
      }
    }
    if (this.$previewArea.hasClass('cd-previewArea-above')) {
      this.$previewArea.cdScrollIntoView('top');
    }

    this.closeOperation(currentOperation);
  }

  /**
   * View changes in the page code after submitting the form.
   */
  async viewChanges() {
    if (this.isBeingSubmitted()) return;

    const currentOperation = { type: 'viewChanges' };
    this.registerOperation(currentOperation);

    const { page, newPageCode } = await this.tryPrepareNewPageCode('viewChanges') || {};
    if (this.closeOperationIfNecessary(currentOperation, newPageCode === undefined)) return;

    mw.loader.load('mediawiki.diff.styles');

    let resp;
    try {
      const options = {
        action: 'compare',
        toslots: 'main',
        'totext-main': newPageCode,
        prop: 'diff',
        formatversion: 2,
      };
      if (mw.config.get('wgArticleId')) {
        options.fromrev = page.revisionId;
      } else {
        // Unexistent pages
        options.fromslots = 'main',
        options['fromtext-main'] = '';
      }
      resp = await cd.g.api.post(options).catch(handleApiReject);
    } catch (e) {
      if (e instanceof CdError) {
        this.handleError(Object.assign({}, e.data, {
          message: cd.s('cf-error-viewchanges'),
          currentOperation,
        }));
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

    let html = resp && resp.compare && resp.compare.body;
    if (html) {
      html = cd.util.wrapDiffBody(html);
      const $label = $('<div>')
        .addClass('cd-commentForm-blockLabel')
        .text(cd.s('cf-block-viewchanges'));
      this.$previewArea
        .html(html)
        .prepend($label)
        .cdAddCloseButton();
    } else {
      this.$previewArea.empty();
      if (html !== undefined) {
        this.showMessage(cd.s('cf-notice-nochanges'));
      }
    }
    this.$previewArea.cdScrollIntoView(
      this.$previewArea.hasClass('cd-previewArea-above') ? 'top' : 'bottom'
    );

    this.closeOperation(currentOperation);
  }

  /**
   * Forget the form and reload the page.
   *
   * @param {object} [keptData] Data passed from the previous page state.
   * @param {Operation} [currentOperation] Current operation.
   * @param {boolean} [confirmClose=false] Whether to confirm form close.
   */
  async reloadPage(keptData, currentOperation, confirmClose = false) {
    if (confirmClose && !(await this.confirmClose())) return;

    this.forget(false);

    try {
      await reloadPage(keptData);
    } catch (e) {
      if (e instanceof CdError) {
        this.handleError(Object.assign({}, e.data, {
          message: cd.s('error-reloadpage'),
          retryFunc: () => {
            this.reloadPage(keptData);
          },
          tearDown: true,
          currentOperation,
        }));
      } else {
        this.handleError({
          type: 'javascript',
          logMessage: e,
          tearDown: true,
          currentOperation,
        });
      }
      removeLoadingOverlay();
    }
  }

  /**
   * Run checks before submitting the form.
   *
   * @param {object} options
   * @param {boolean} options.isDelete
   * @returns {boolean}
   * @private
   */
  async runChecks({ isDelete }) {
    const checks = [
      {
        condition: this.headlineInput && this.headlineInput.getValue() === '',
        confirmation: async () => {
          const noHeadline = this.#headlineInputPurpose === cd.s('cf-headline-topic') ?
            cd.s('cf-confirm-noheadline-topic') :
            cd.s('cf-confirm-noheadline-subsection');
          return await OO.ui.confirm(noHeadline + ' ' + cd.s('cf-confirm-noheadline-question'));
        },
      },
      {
        condition: (
          !this.commentInput.getValue().trim() &&
          (
            !cd.config.noConfirmPostEmptyCommentPageRegexp ||
            !cd.config.noConfirmPostEmptyCommentPageRegexp.test(cd.g.CURRENT_PAGE)
          )
        ),
        confirmation: async () => await OO.ui.confirm(cd.s('cf-confirm-empty')),
      },
      {
        condition: this.commentInput.getValue().trim().length > cd.config.longCommentThreshold,
        confirmation: async () => (
          await OO.ui.confirm(cd.s('cf-confirm-long', cd.config.longCommentThreshold))
        ),
      },
      {
        condition: /^==[^=]/m.test(this.commentInput.getValue()) && this.mode !== 'edit',
        confirmation: async () => await OO.ui.confirm(cd.s('cf-confirm-secondlevelheading')),
      },
      {
        condition: isDelete,
        confirmation: async () => await confirmDestructive('cf-confirm-delete'),
      }
    ];

    for (const check of checks) {
      if (check.condition && !(await check.confirmation())) {
        this.commentInput.focus();
        return false;
      }
    }

    return true;
  }

  /**
   * Send a post request to edit the page and handle errors.
   *
   * @param {object} page
   * @param {string} newPageCode
   * @param {Operation} currentOperation
   * @returns {?object}
   * @private
   */
  async tryEditPage(page, newPageCode, currentOperation) {
    let resp;
    try {
      resp = await cd.g.api.postWithEditToken(cd.g.api.assertCurrentUser({
        action: 'edit',
        title: this.targetPage,
        text: newPageCode,
        summary: cd.util.buildEditSummary({ text: this.summaryInput.getValue() }),
        tags: cd.config.tagName,
        baserevid: page.revisionId,
        starttimestamp: page.queryTimestamp,
        minor: this.minorCheckbox && this.minorCheckbox.isSelected(),
        watchlist: this.watchCheckbox.isSelected() ? 'watch' : 'unwatch',
        formatversion: 2,
      })).catch(handleApiReject);
    } catch (e) {
      if (e instanceof CdError) {
        const { type, apiData } = e.data;
        if (type === 'network') {
          this.handleError({
            type,
            message: cd.s('cf-error-couldntedit'),
            currentOperation,
          });
        } else {
          const error = apiData && apiData.error;
          let message;
          let messageType;
          let isRawMessage = false;
          let logMessage;
          if (error) {
            switch (error.code) {
              case 'spamblacklist':
                message = cd.s('cf-error-spamblacklist', error.spamblacklist.matches[0]);
                break;
              case 'titleblacklist':
                message = cd.s('cf-error-titleblacklist');
                break;
              case 'abusefilter-warning':
              case 'abusefilter-disallowed':
                await cd.g.api.loadMessagesIfMissing([error.code]);
                ({ html: message } = await parseCode(
                  mw.message(error.code, error.abusefilter.description).plain()
                ) || {});
                if (message) {
                  isRawMessage = true;
                } else {
                  message = cd.s('cf-error-abusefilter', error.abusefilter.description);
                }
                break;
              case 'editconflict':
                message = cd.s('cf-notice-editconflict');
                messageType = 'notice';
                this.submit();
                break;
              case 'blocked':
                message = cd.s('cf-error-blocked');
                break;
              case 'missingtitle':
                message = cd.s('cf-error-pagedeleted');
                break;
              default:
                message = (
                  cd.s('cf-error-pagenotedited') + ' ' +
                  (await this.unknownApiErrorText(error.code, error.info))
                );
            }

            logMessage = [error.code, apiData];
          } else {
            logMessage = apiData;
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

    return resp;
  }

  /**
   * Submit the form.
   */
  async submit() {
    const isDelete = this.deleteCheckbox && this.deleteCheckbox.isSelected();

    if (!(await this.runChecks({ isDelete }))) return;

    const currentOperation = { type: 'submit' };
    this.registerOperation(currentOperation);

    const { page, newPageCode } = await this.tryPrepareNewPageCode('submit') || {};
    if (newPageCode === undefined) {
      this.closeOperation(currentOperation);
      return;
    }

    // That's a hack used where we pass, in keptData, the name of the section that was set to be
    // watched/unwatched using a checkbox in a form just sent. The server doesn't manage to update
    // the value so quickly, so it returns the old value, but we must display the new one.
    let keptData = {};
    let watchSectionAfterGettingArticleId;
    if (this.watchSectionCheckbox) {
      if (this.watchSectionCheckbox.isSelected()) {
        const isHeadlineAltered = (
          this.#editingSectionOpeningComment &&
          this.headlineInput.getValue() !== this.originalHeadline
        );
        if (this.mode === 'addSection' || this.mode === 'addSubsection' || isHeadlineAltered) {
          const headline = removeWikiMarkup(this.headlineInput.getValue());
          if (mw.config.get('wgArticleId')) {
            Section.watchSection(headline, true);
            if (isHeadlineAltered) {
              const originalHeadline = removeWikiMarkup(this.originalHeadline);
              Section.unwatchSection(originalHeadline, true);
            }
          } else {
            watchSectionAfterGettingArticleId = headline;
          }
          keptData.justWatchedSection = headline;
        } else {
          const section = this.targetSection;
          if (section && !section.watched) {
            section.watch(true);
            keptData.justWatchedSection = section.headline;
          }
        }
      } else {
        const section = this.targetSection;
        if (section && section.watched) {
          section.unwatch(true);
          keptData.justUnwatchedSection = section.headline;
        }
      }
    }

    const resp = await this.tryEditPage(page, newPageCode, currentOperation);
    if (!resp) return;

    if (this.watchCheckbox.isSelected() && $('#ca-watch').length) {
      $('#ca-watch').attr('id', 'cd-unwatch');
    }
    if (!this.watchCheckbox.isSelected() && $('#ca-unwatch').length) {
      $('#ca-unwatch').attr('id', 'cd-watch');
    }

    // When creating a page
    if (!mw.config.get('wgArticleId')) {
      mw.config.set('wgArticleId', resp.edit.pageid);
      keptData.wasPageCreated = true;
      if (watchSectionAfterGettingArticleId) {
        Section.watchSection(watchSectionAfterGettingArticleId, true);
      }
    }

    if (!isDelete) {
      keptData.commentAnchor = this.mode === 'edit' ?
        this.target.anchor :
        generateCommentAnchor(new Date(resp.edit.newtimestamp), cd.g.CURRENT_USER_NAME, true);
    }

    this.reloadPage(keptData, currentOperation);
  }

  /**
   * Ask for confirmation to close the form if necessary.
   *
   * @returns {boolean}
   */
  async confirmClose() {
    return (!this.isAltered() || (await confirmDestructive('cf-confirm-close')));
  }

  /**
   * Close the form.
   *
   * @param {boolean} [confirmClose=true] Whether to confirm form close.
   */
  async cancel(confirmClose = true) {
    if (this.beingCancelled || this.isBeingSubmitted()) return;

    /**
     * Comment form is in the process of being cancelled.
     *
     * @type {boolean}
     */
    this.beingCancelled = true;

    if (confirmClose && !(await this.confirmClose())) {
      this.commentInput.focus();
      this.beingCancelled = false;
      return;
    }

    this.destroy();

    this.beingCancelled = false;

    if (this.mode === 'reply') {
      this.target.scrollIntoView('top');
    } else if (this.mode === 'replyInSection') {
      this.target.$replyButton.show();
      this.target.$replyWrapper.removeClass('cd-replyWrapper-hasCommentForm');
    } else if (this.mode === 'edit') {
      this.target.$elements.removeClass('cd-hidden');
      this.target.scrollIntoView('top');
      this.target.configureLayers();
    }
  }

  /**
   * Remove elements and other objects' properties related to the form.
   */
  destroy() {
    this.operations
      .filter((op) => !op.closed)
      .forEach(this.closeOperation.bind(this));
    this.forget();
    this.$element.remove();

    /**
     * Comment form has been destroyed.
     *
     * @type {boolean}
     */
    this.destroyed = true;
  }

  /**
   * Remove references to the form and unload it from the session data thus making it not appear
   * after the page reload.
   *
   * @param {boolean} [removeCommentProperty=true]
   * @private
   */
  forget(removeCommentProperty = true) {
    if (this.target && removeCommentProperty) {
      delete this.target[CommentForm.modeToProperty(this.mode) + 'Form'];
    }
    if (cd.commentForms.includes(this)) {
      cd.commentForms.splice(cd.commentForms.indexOf(this), 1);
    }
    if (this.mode === 'addSection') {
      cd.g.addSectionForm = null;
    }

    saveSession();
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
   * @param {boolean} [dontAutopreview=false] Was the update initiated by a change in the comment or
   *   headline input which means no autopreview request is needed to be made to prevent making two
   *   identical requests.
   * @private
   */
  updateAutoSummary(set = true, dontAutopreview = false) {
    if (this.summaryAltered) return;

    this.#dontAutopreview = dontAutopreview;

    const text = this.autoText();
    const section = this.headlineInput && this.mode !== 'addSubsection' ?
      removeWikiMarkup(this.headlineInput.getValue()) :
      this.#sectionHeadline;

    let optionalText;
    if (['reply', 'replyInSection'].includes(this.mode)) {
      const commentText = this.commentInput
        .getValue()
        .trim()
        .replace(/\s+/g, ' ');
      if (commentText && commentText.length <= cd.config.summaryCommentTextLengthLimit) {
        optionalText = `: ${commentText} (-)`;
      }
    } else if (this.mode === 'addSubsection') {
      const subsection = removeWikiMarkup(this.headlineInput.getValue());
      if (subsection) {
        optionalText = `: /* ${subsection} */`;
      }
    }

    this.autoSummary = cd.util.buildEditSummary({
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
    const callback = this.updateAutoSummary.bind(this);

    switch (this.mode) {
      case 'reply': {
        if (this.target.isOpeningSection) {
          return cd.s('es-reply');
        } else {
          this.target.requestAuthorGender(callback);
          return this.target.own ?
            cd.s('es-addition') :
            cd.s('es-reply-to', this.target.author.name, this.target.author).replace(/ {2,}/, ' ');
        }
      }

      case 'edit': {
        // The code for generating "edit" and "delete" descriptions is equivalent, so we provide an
        // umbrella function.
        const editOrDeleteText = (action) => {
          let subject;
          if (this.target.own) {
            if (this.target.parent) {
              if (this.target.parent.level === 0) {
                subject = 'reply';
              } else {
                this.target.parent.requestAuthorGender(callback);
                subject = this.target.parent.own ? 'addition' : 'reply-to';
              }
            } else {
              if (this.target.isOpeningSection) {
                subject = this.target.section.level <= 2 ? 'topic' : 'subsection';
              } else {
                subject = 'comment';
              }
            }
          } else {
            if (this.target.isOpeningSection) {
              subject = this.target.section.level <= 2 ? 'topic' : 'subsection';
            } else {
              this.target.requestAuthorGender(callback);
              subject = 'comment-by';
            }
          }
          return cd.s(`es-${action}-${subject}`, this.target.author.name, this.target.author)
            .replace(/ {2,}/, ' ');
        };

        return editOrDeleteText(
          this.deleteCheckbox && this.deleteCheckbox.isSelected() ?
          'delete' :
          'edit'
        );
      }

      case 'replyInSection': {
        return cd.s('es-reply');
      }

      case 'addSection': {
        let newTopicSummary;
        if (this.$addSectionLink) {
          const uri = new mw.Uri(this.$addSectionLink.attr('href'));
          const summary = uri.query.summary;
          newTopicSummary = summary && summary.replace(/^.+?\*\/ */, '');
        }
        return newTopicSummary || cd.s('es-new-topic');
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
      if (this.headlineInput) {
        this.headlineInput.setDisabled(true);
      }
      this.minorCheckbox.setDisabled(true);
      if (this.smallCheckbox) {
        this.smallCheckbox.setDisabled(true);
      }
      if (this.noSignatureCheckbox) {
        this.noSignatureCheckbox.setDisabled(true);
      }

      this.$element.addClass('cd-commentForm-disabled');

      this.#standardSubmitButtonLabel = cd.s('cf-delete-button');
      this.#shortSubmitButtonLabel = cd.s('cf-delete-button-short');
      this.submitButton
        .clearFlags()
        .setFlags(['destructive', 'primary'])
        .setLabel(
          this.$element.hasClass('cd-commentForm-short') ?
          this.#standardSubmitButtonLabel :
          this.#shortSubmitButtonLabel
        );
    } else {
      this.minorCheckbox.setSelected(this.initialMinorCheckboxSelected);

      this.commentInput.setDisabled(false);
      if (this.headlineInput) {
        this.headlineInput.setDisabled(false);
      }
      this.minorCheckbox.setDisabled(false);
      if (this.smallCheckbox) {
        this.smallCheckbox.setDisabled(false);
      }
      if (this.noSignatureCheckbox) {
        this.noSignatureCheckbox.setDisabled(false);
      }

      this.$element.removeClass('cd-commentForm-disabled');

      this.#standardSubmitButtonLabel = cd.s('cf-save');
      this.#shortSubmitButtonLabel = cd.s('cf-save-short');
      this.submitButton
        .clearFlags()
        .setFlags(['progressive', 'primary'])
        .setLabel(
          this.$element.hasClass('cd-commentForm-short') ?
          this.#standardSubmitButtonLabel :
          this.#shortSubmitButtonLabel
        );
    }
  }

  /**
   * Quote the selected text.
   *
   * @param {boolean} [ignoreEmptySelection=false] If the selection is empty, do nothing.
   */
  quote(ignoreEmptySelection = false) {
    const selectionText = isInputFocused() ?
      document.activeElement.value
        .substring(document.activeElement.selectionStart, document.activeElement.selectionEnd) :
      window.getSelection().toString().trim();
    // With just the "Q" hotkey, empty selection doesn't count.
    if (selectionText || !ignoreEmptySelection) {
      // We don't use the native insertContent() function here in order to prevent harm from
      // replacing the selected text (when both the text in the input and on the page is
      // selected), and we don't use encapsulateContent() to insert exactly at the cursor position
      // which can be in the beginning or in the end of the selection depending on where it
      // started.
      const isCommentInputFocused = this.commentInput.$input.is(':focus');
      const range = this.commentInput.getRange();
      const cursorIndex = range.to;
      const rangeStart = Math.min(range.to, range.from);
      const rangeEnd = Math.max(range.to, range.from);
      const value = this.commentInput.getValue();
      const quotePre = cd.config.quoteFormatting[0];
      const quotePost = cd.config.quoteFormatting[1];
      const quotation = quotePre + (selectionText || cd.s('cf-quote-placeholder')) + quotePost;
      const newRangeStart = (
        (isCommentInputFocused ? rangeStart : cursorIndex) +
        (selectionText ? quotation.length : quotePre.length)
      );
      const newRangeEnd = selectionText ?
        newRangeStart :
        newRangeStart + cd.s('cf-quote-placeholder').length;
      const newValue = isCommentInputFocused ?
        value.slice(0, rangeStart) + quotation + value.slice(rangeEnd) :
        value.slice(0, cursorIndex) + quotation + value.slice(cursorIndex);
      this.commentInput.setValue(newValue);
      this.commentInput.selectRange(newRangeStart, newRangeEnd);
    }
  }

  /**
   * Get the name of the correlated property of the comment form target based on the comment for mode.
   *
   * @param {string} mode
   * @returns {string}
   * @private
   */
  static modeToProperty(mode) {
    return mode === 'replyInSection' ? 'addReply' : mode;
  }

  /**
   * Get the last active comment form.
   *
   * @returns {?CommentForm}
   */
  static getLastActiveCommentForm() {
    return (
      cd.commentForms
        .slice()
        .sort(lastFocused)[0] ||
      null
    );
  }

  /**
   * Get the last active comment form that has received an input. This includes altering text
   * fields, not checkboxes.
   *
   * @returns {?CommentForm}
   */
  static getLastActiveAlteredCommentForm() {
    return (
      cd.commentForms
        .slice()
        .sort(lastFocused)
        .find((commentForm) => commentForm.isAltered()) ||
      null
    );
  }
}
