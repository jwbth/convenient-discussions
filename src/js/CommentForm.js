/**
 * Comment form class.
 *
 * @module CommentForm
 */

import Autocomplete from './Autocomplete';
import CdError from './CdError';
import Comment from './Comment';
import Page from './Page';
import Section from './Section';
import cd from './cd';
import navPanel from './navPanel';
import { addNotification, reloadPage, removeLoadingOverlay, saveSession } from './boot';
import { checkboxField } from './ooui';
import { confirmDestructive, settingsDialog } from './modal';
import {
  defined,
  findLastIndex,
  handleApiReject,
  hideText,
  insertText,
  isInputFocused,
  nativePromiseState,
  removeDoubleSpaces,
  restoreScrollPosition,
  saveScrollPosition,
  unhideText,
  unique,
} from './util';
import { extractSignatures, hideSensitiveCode, removeWikiMarkup } from './wikitext';
import { generateCommentAnchor } from './timestamp';
import { parseCode, unknownApiErrorText } from './apiWrappers';

let commentFormsCounter = 0;

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

/** Class representing a comment form. */
export default class CommentForm {
  /**
   * Object specifying configuration to preload data into the comment form. It is extracted from the
   * "Add section" link/button target.
   *
   * @typedef {object} PreloadConfig
   * @property {string} [editIntro] Edit intro page name.
   * @property {string} [commentTemplate] Comment template's page name.
   * @property {string} [headline] Subject/headline.
   * @property {string} [summary] Edit summary.
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
   * @fires commentFormCreated
   * @fires commentFormModulesReady
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
      this.sectionHeadline = this.target.getSection() && this.target.getSection().headline;
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
    this.isSummaryAltered = dataToRestore ? dataToRestore.isSummaryAltered : false;

    if (this.mode === 'addSection') {
      let code = (
        '<div class="cd-editnotice">' +
        `{{MediaWiki:Editnotice-${cd.g.CURRENT_NAMESPACE_NUMBER}}}` +
        '</div>\n' +
        '<div class="cd-editnotice">' +
        `{{MediaWiki:Editnotice-${cd.g.CURRENT_NAMESPACE_NUMBER}-${cd.g.CURRENT_PAGE.title}}}` +
        '</div>\n'
      );
      if (this.preloadConfig?.editIntro) {
        code = `<div class="cd-editintro">{{${this.preloadConfig.editIntro}}}</div>\n` + code;
      }
      parseCode(code, { title: cd.g.CURRENT_PAGE.name })
        .then((result) => {
          const mediaWikiNamespace = mw.config.get('wgFormattedNamespaces')[8];
          this.$messageArea
            .append(result.html)
            .cdAddCloseButton()
            .find(`.cd-editnotice > a.new[title^="${mediaWikiNamespace}:Editnotice-"]`)
            .parent()
            .remove();

          this.$messageArea
            .find('.mw-charinsert-item')
            .on('click', (e) => {
              const $link = $(e.currentTarget);
              const range = this.commentInput.getRange();
              const selection = this.commentInput.getValue().substring(range.from, range.to);
              insertText(
                this.commentInput,
                $link.data('mw-charinsert-start') + selection + $link.data('mw-charinsert-end')
              );
            });
        });
    }

    this.createContents(dataToRestore);
    this.addEvents();
    this.initAutocomplete();

    // This call and the subsequent `restoreScrollPosition()` call is, first of all, for
    // compensation of the Chrome 84.0.4147.89 behavior where the viewport jumps down all of a
    // sudden.
    saveScrollPosition();

    this.addToPage();

    /**
     * @typedef {object} Operation
     * @property {string} type Operation type. One of `'load'`, `'preview'`, `'viewChanges'`, and
     *   `'submit'`.
     * @property {boolean} [affectHeadline=false] Should the headline input be shown as pending.
     * @property {boolean} [isClosed] Is the operation closed (settled).
     * @property {boolean} [isDelayed] Is the operation delayed.
     */

    /**
     * A list of current operations.
     *
     * @type {Operation[]}
     */
    this.operations = [];

    cd.commentForms.push(this);

    restoreScrollPosition();

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
    } else {
      // Wrap into setTimeout() for a more smooth animation.
      setTimeout(() => {
        this.$element.cdScrollIntoView('center', true, () => {
          this[this.headlineInput ? 'headlineInput' : 'commentInput'].focus();
        });
      });

      if (this.mode === 'edit') {
        const currentOperation = this.registerOperation({ type: 'load' });
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

            this.commentInput.focus();
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
      } else {
        if (this.preloadConfig?.commentTemplate) {
          const currentOperation = this.registerOperation({
            type: 'load',
            affectHeadline: false,
          });
          const preloadPage = new Page(this.preloadConfig.commentTemplate);
          preloadPage.getCode().then(
            () => {
              let code = preloadPage.code;

              const regexp = /<onlyinclude(?: [\w ]+(?:=[^<>]+?)?| ?\/?)>([^]*?)<\/onlyinclude(?: \w+)? ?>/g;
              let match;
              let onlyInclude;
              while ((match = regexp.exec(code))) {
                if (onlyInclude === undefined) {
                  onlyInclude = '';
                }
                onlyInclude += match[1];
              }
              if (onlyInclude !== undefined) {
                code = onlyInclude;
              }

              code = code
                .replace(
                  /<includeonly(?: [\w ]+(?:=[^<>]+?)?| ?\/?)>([^]*?)<\/includeonly(?: \w+)? ?>/g,
                  '$1'
                )
                .replace(
                  /<noinclude(?: [\w ]+(?:=[^<>]+?)?| ?\/?)>([^]*?)<\/noinclude(?: \w+)? ?>/g,
                  ''
                );
              code = code.trim();

              if (code.includes(cd.g.SIGN_CODE)) {
                this.omitSignatureCheckbox.setSelected(true);
              }

              this.commentInput.setValue(code);
              this.originalComment = code;

              this.closeOperation(currentOperation);

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
        } else {
          this.originalComment = '';
        }

        if (this.headlineInput) {
          this.headlineInput.setValue(this.preloadConfig?.headline || '');
          this.originalHeadline = this.preloadConfig?.headline || '';
        }

        if (!(this.target instanceof Page)) {
          this.checkCode();
        }
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
       * @type {JQuery.Promise|undefined}
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
   * Set the `target`, `targetSection`, `targetComment`, and `targetPage` properties.
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
      this.targetSection = this.target.getSection();

      /**
       * Target comment. This may be the comment the user replies to or the comment opening the
       * section.
       *
       * @type {?(Comment|Section|undefined)}
       */
      this.targetComment = this.target;
    } else if (this.target instanceof Section) {
      this.targetSection = this.target;

      if (this.mode === 'replyInSection' && !this.target.$replyButton) {
        throw new CdError();
      }
      if (
        this.mode === 'addSubsection' &&
        !this.targetSection.$heading.find('.cd-sectionLink-addSubsection').length
      ) {
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
    this.targetPage = this.targetSection ? this.targetSection.getSourcePage() : cd.g.CURRENT_PAGE;
  }

  /**
   * Add a WikiEditor toolbar to the comment input.
   *
   * @param {string[]} moduleNames List of custom comment form modules to await loading of before
   *   adding the toolbar.
   * @fires commentFormToolbarReady
   * @private
   */
  addToolbar(moduleNames) {
    const $toolbarPlaceholder = $('<div>')
      .addClass('cd-toolbarPlaceholder')
      .insertBefore(this.commentInput.$element);

    mw.loader.using(['ext.wikiEditor'].concat(moduleNames)).then(() => {
      const $input = this.commentInput.$input;
      $input.wikiEditor(
        'addModule',
        mw.loader.moduleRegistry['ext.wikiEditor']
          .packageExports['jquery.wikiEditor.toolbar.config.js']
      );
      const dialogsConfig = mw.loader.moduleRegistry['ext.wikiEditor']
        .packageExports['jquery.wikiEditor.dialogs.config.js'];
      dialogsConfig.replaceIcons($input);
      $input.wikiEditor('addModule', dialogsConfig.getDefaultConfig());
      this.commentInput.$element
        .find('.tool[rel="redirect"], .tool[rel="signature"], .tool[rel="newline"], .tool[rel="gallery"], .tool[rel="reference"], .option[rel="heading-2"]')
        .remove();

      $input.wikiEditor('addToToolbar', {
        section: 'main',
        groups: {
          'convenient-discussions': {
            tools: {
              mention: {
                label: cd.s('cf-mentions-tooltip'),
                type: 'button',
                icon: 'https://upload.wikimedia.org/wikipedia/commons/9/98/OOjs_UI_icon_userAvatar.svg',
                action: {
                  type: 'callback',
                  execute: () => {},
                },
              },
              quote: {
                label: `${cd.s('cf-quote-tooltip')} ${cd.mws('parentheses', `Q${cd.mws('comma-separator')}Ctrl+Alt+Q`)}`,
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
      this.$element
        .find('.tool-button[rel="mention"]')
        .off('click')
        .on('click', (e) => {
          this.mention(e.ctrlKey);
        });

      // For some reason, in (starting with?) Chrome 84.0.4147.89, if you put
      // `$toolbarPlaceholder.hide();` to the top, the viewport will jump down. See also
      // saveScrollPosition() call above.
      $toolbarPlaceholder.remove();

      // More Chrome scrolling bug fixes
      this.$element
        .find('.tool[rel="link"] a, .tool[rel="file"] a')
        .on('mouseup', () => {
          saveScrollPosition();
        })
        .on('click', () => {
          restoreScrollPosition();
        });

      /**
       * The comment form toolbar is ready; all requested custom comment form modules have been
       * loaded and executed.
       *
       * @event commentFormToolbarReady
       * @type {module:CommentForm}
       */
      mw.hook('convenientDiscussions.commentFormToolbarReady').fire(this);
    });
  }

  /**
   * Add an insert button to the block under the comment input.
   *
   * @param {string} text
   * @param {string} [displayedText]
   * @private
   */
  addInsertButton(text, displayedText) {
    const hidden = [];
    text = hideText(text, /\\[+;\\]/g, hidden);
    let [, pre, post] = text.match(/^(.*?)(?:\+(.*))?$/) || [];
    if (!pre) return;
    post = post || '';
    const unescape = (text) => text.replace(/\\([+;\\])/g, '$1');
    pre = unescape(unhideText(pre, hidden));
    post = unescape(unhideText(post, hidden));
    displayedText = displayedText ? unescape(displayedText) : pre + post;

    const $a = $('<a>')
      .text(displayedText)
      .addClass('cd-insertButtons-item')
      .on('click', () => {
        const range = this.commentInput.getRange();
        const selection = this.commentInput.getValue().substring(range.from, range.to);
        insertText(this.commentInput, pre + selection + post);
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
    if (this.target instanceof Page) {
      this.containerListType = null;
    } else {
      /**
       * Name of the tag used as a list whereof this comment form is an item. `'dl'`, `'ul'`,
       * `'ol'`, or `null`.
       *
       * @type {?string}
       */
      this.containerListType = this.target instanceof Comment ?
        this.target.$elements
          .last()
          .parent()
          .prop('tagName')
          .toLowerCase() :
        this.target.$replyWrapper
          .parent()
          .prop('tagName')
          .toLowerCase();
    }

    let outerWrapperTag;
    let createList = false;
    if (this.mode === 'reply') {
      createList = true;
      const $lastOfTarget = this.target.$elements.last();
      const $nextToTarget = $lastOfTarget.next();
      if ($lastOfTarget.is('li')) {
        // We need to avoid a number appearing next to the form in numbered lists, so we have <div>
        // in those cases. Which is unsemantic, yes :-(
        if (this.containerListType !== 'ol') {
          outerWrapperTag = 'li';
        } else {
          outerWrapperTag = 'div';
        }
      } else if ($lastOfTarget.is('dd')) {
        outerWrapperTag = 'dd';
      } else {
        if ($nextToTarget.is('ul')) {
          createList = false;
          outerWrapperTag = 'li';
        } else if ($nextToTarget.is('dl')) {
          createList = false;
          outerWrapperTag = 'dd';
        }
      }
    } else if (this.mode === 'edit') {
      const $lastOfTarget = this.target.$elements.last();
      if ($lastOfTarget.is('li')) {
        outerWrapperTag = 'li';
      } else if ($lastOfTarget.is('dd')) {
        outerWrapperTag = 'dd';
      }
    }

    this.editingSectionOpeningComment = this.mode === 'edit' && this.target.isOpeningSection;

    /**
     * The main form element.
     *
     * @type {JQuery}
     */
    this.$element = $('<div>')
      .addClass('cd-commentForm')
      .addClass(`cd-commentForm-${this.mode}`)

      // The form may sometimes get inside <div dir="..."> element, so we need to reset the text
      // direction.
      .attr('dir', cd.g.SITE_DIR);
    if (this.containerListType === 'ol') {
      this.$element.addClass('cd-commentForm-inNumberedList');
    }
    if (this.editingSectionOpeningComment) {
      this.$element.addClass('cd-commentForm-sectionOpeningComment');
    }
    if (this.mode === 'addSubsection') {
      this.$element.addClass(`cd-commentForm-addSubsection-${this.target.level}`);
    }

    if (outerWrapperTag) {
      /**
       * Element, usually a `li` or `dd`, that wraps either {@link module:CommentForm~$element the
       * comment form element} directly, or {@link module:CommentForm~$wrappingList the list} that
       * wraps the item that wraps the comment form element.
       *
       * @type {JQuery|undefined}
       */
      this.$outerWrapper = $(`<${outerWrapperTag}>`);
    }

    if (this.mode === 'reply') {
      if (createList) {
        /**
         * List that wraps the item that wraps the comment form element.
         *
         * @type {JQuery|undefined}
         */
        this.$wrappingList = $('<ul>').addClass('cd-commentLevel');

        if (this.$outerWrapper) {
          this.$wrappingList.appendTo(this.$outerWrapper);
        }

        const $wrappingItem = $('<li>').appendTo(this.$wrappingList);

        this.$element.appendTo($wrappingItem);
      } else {
        this.$element.appendTo(this.$outerWrapper);
      }
    } else if (this.mode === 'edit') {
      if (this.$outerWrapper) {
        this.$element.appendTo(this.$outerWrapper);
      }
    }

    /**
     * A wrapper for other comment form elements placed inside the main element.
     *
     * @type {JQuery}
     */
    this.$innerWrapper = $('<div>')
      .addClass('cd-commentForm-innerWrapper')
      .appendTo(this.$element);

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

    if (['addSection', 'addSubsection'].includes(this.mode) || this.editingSectionOpeningComment) {
      if (this.mode === 'addSubsection') {
        this.headlineInputPurpose = cd.s('cf-headline-subsection', this.targetSection.headline);
      } else if (this.mode === 'edit' && this.targetSection.getParent()) {
        this.headlineInputPurpose = cd.s(
          'cf-headline-subsection',
          this.targetSection.getParent().headline
        );
      } else {
        this.headlineInputPurpose = cd.s('cf-headline-topic');
      }

      /**
       * Headline input.
       *
       * @type {OoUiTextInputWidget|undefined}
       */
      this.headlineInput = new OO.ui.TextInputWidget({
        value: dataToRestore ? dataToRestore.headline : '',
        placeholder: this.headlineInputPurpose,
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
     * Advanced section container.
     *
     * @type {JQuery}
     */
    this.$advanced = $('<div>').addClass('cd-commentFormAdvanced');

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
       * @type {OoUiFieldLayout|undefined}
       * @instance module:CommentForm
       */

      /**
       * Minor change checkbox.
       *
       * @name minorCheckbox
       * @type {OoUiCheckboxInputWidget|undefined}
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
      (cd.settings.watchOnReply && this.mode !== 'edit') ||
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
      const label = cd.s('cf-watchsection-' + (callItTopic ? 'topic' : 'subsection'));
      const selected = (
        (cd.settings.watchSectionOnReply && this.mode !== 'edit') ||
        this.targetSection?.isWatched
      );

      /**
       * Watch section checkbox field.
       *
       * @name watchSectionField
       * @type {OoUiFieldLayout|undefined}
       * @instance module:CommentForm
       */

      /**
       * Watch section checkbox.
       *
       * @name watchSectionCheckbox
       * @type {OoUiCheckboxInputWidget|undefined}
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

    if (this.headlineInput) {
      /**
       * Omit signature checkbox field.
       *
       * @name omitSignatureField
       * @type {OoUiFieldLayout|undefined}
       * @instance module:CommentForm
       */

      /**
       * Omit signature checkbox.
       *
       * @name omitSignatureCheckbox
       * @type {OoUiCheckboxInputWidget|undefined}
       * @instance module:CommentForm
       */

      [this.omitSignatureField, this.omitSignatureCheckbox] = checkboxField({
        value: 'omitSignature',
        selected: dataToRestore ? dataToRestore.omitSignature : false,
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
      const selected = dataToRestore ? dataToRestore.delete : false;

      /**
       * Delete checkbox field.
       *
       * @name deleteField
       * @type {OoUiFieldLayout|undefined}
       * @instance module:CommentForm
       */

      /**
       * Delete checkbox.
       *
       * @name deleteCheckbox
       * @type {OoUiCheckboxInputWidget|undefined}
       * @instance module:CommentForm
       */
      [this.deleteField, this.deleteCheckbox] = checkboxField({
        value: 'delete',
        selected,
        label: cd.s('cf-delete'),
        tabIndex: String(this.id) + '26',
      });
    }

    /**
     * Script settings button.
     *
     * @name settingsButton
     * @type {Promise}
     * @instance module:CommentForm
     */
    this.settingsButton = new OO.ui.ButtonWidget({
      framed: false,
      icon: 'settings',
      label: cd.s('cf-settings-tooltip'),
      invisibleLabel: true,
      title: cd.s('cf-settings-tooltip'),
      classes: ['cd-button', 'cd-settingsButton'],
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
    this.checkboxesLayout = new OO.ui.HorizontalLayout({
      classes: ['cd-checkboxesContainer'],
      items: [
        this.minorField,
        this.watchField,
        this.watchSectionField,
        this.omitSignatureField,
        this.deleteField,
        this.settingsButton,
      ].filter(defined),
    });

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

    let message;
    switch (this.mode) {
      case 'edit':
        message = 'save';
        break;
      case 'addSection':
        message = 'addtopic';
        break;
      case 'addSubsection':
        message = 'addsubsection';
        break;
      default:
        message = 'reply';
    }
    this.submitButtonLabelStandard = cd.s(`cf-${message}`);
    this.submitButtonLabelShort = cd.s(`cf-${message}-short`);

    /**
     * @typedef {object} OoUiButtonWidget
     * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.ButtonWidget
     */

    /**
     * Toggle advanced section button.
     *
     * @type {OoUiButtonWidget}
     */
    this.advancedButton = new OO.ui.ButtonWidget({
      label: cd.s('cf-advanced'),
      framed: false,
      classes: ['cd-button', 'cd-advancedButton'],
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
        head: false,
        $content: cd.util.wrap(cd.sParse('cf-help-content', cd.config.mentionCharacter), {
          tagName: 'div',
          targetBlank: true,
        }),
        padded: true,
        align: 'center',
        width: 400,
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
    if (cd.settings.autopreview) {
      this.previewButton.$element.hide();
    }

    /**
     * Submit button.
     *
     * @type {OoUiButtonWidget}
     */
    this.submitButton = new OO.ui.ButtonWidget({
      label: this.submitButtonLabelStandard,
      flags: ['progressive', 'primary'],
      classes: ['cd-submitButton'],
      tabIndex: String(this.id) + '35',
    });

    if (this.deleteCheckbox?.isSelected()) {
      this.updateFormOnDeleteCheckboxChange(true);
    }

    this.$advanced.append([
      this.summaryInput.$element,
      this.$summaryPreview,
      this.checkboxesLayout.$element,
    ]);
    this.$leftButtonsContainer.append([
      this.advancedButton.$element,
      this.helpPopupButton.$element,
    ]);
    this.$rightButtonsContainer.append([
      this.cancelButton.$element,
      this.viewChangesButton.$element,
      this.previewButton.$element,
      this.submitButton.$element,
    ]);
    this.$buttonsContainer.append(this.$leftButtonsContainer, this.$rightButtonsContainer);
    this.$innerWrapper.append([
      this.$messageArea,
      this.headlineInput?.$element,
      this.commentInput.$element,
      this.$advanced,
      this.$buttonsContainer,
    ].filter(defined));

    if (this.mode !== 'edit' && !cd.settings.alwaysExpandAdvanced) {
      this.$advanced.hide();
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

    if (this.containerListType === 'ol' && $.client.profile().layout !== 'webkit') {
      // Dummy element for forms inside a numbered list so that the number is placed in front of
      // that area, not in some silly place. Note that in Chrome, the number is placed in front of
      // the textarea, so we don't need this in that browser.
      $('<div>')
        .html('&nbsp;')
        .addClass('cd-commentForm-dummyElement')
        .prependTo(this.$innerWrapper);
    }

    const moduleNames = cd.config.customCommentFormModules
      .filter((module) => !module.checkFunc || module.checkFunc())
      .map((module) => module.name);
    mw.loader.using(moduleNames).then(() => {
      /**
       * All requested custom comment form modules have been loaded and executed. (The comment form
       * may not be ready yet, use {@link module:CommentForm~commentFormToolbarReady} for that.)
       *
       * @event commentFormModulesReady
       * @type {module:CommentForm}
       */
      mw.hook('convenientDiscussions.commentFormModulesReady').fire(this);
    });

    if (cd.settings.showToolbar) {
      this.addToolbar(moduleNames);
    }

    if (cd.settings.insertButtons.length) {
      /**
       * Text insert buttons.
       *
       * @type {JQuery|undefined}
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
    if (this.mode === 'replyInSection') {
      this.target.$replyButton.hide();
    } else if (this.mode === 'addSubsection' && this.target.$addSubsectionButtonContainer) {
      this.target.$addSubsectionButtonContainer.hide();
    } else if (this.mode === 'addSection' && cd.g.$addSectionButtonContainer) {
      cd.g.$addSectionButtonContainer.hide();
    }

    // 'addSection'
    if (!mw.config.get('wgArticleId')) {
      cd.g.$root.empty();
    }

    switch (this.mode) {
      case 'reply': {
        const $lastOfTarget = this.target.$elements.last();
        const $nextToTarget = $lastOfTarget.next();
        if ($lastOfTarget.is('li, dd')) {
          this.$outerWrapper.insertAfter($lastOfTarget);
        } else if ($nextToTarget.is('ul, dl')) {
          this.$outerWrapper.prependTo($nextToTarget);
        } else {
          this.$wrappingList.insertAfter($lastOfTarget);
        }
        break;
      }

      case 'edit': {
        const $element = this.$outerWrapper || this.$element;

        // We insert the form before the comment so that if the comment ends on a wrong level, the
        // form is on a right one. The exception is comments that open a section (otherwise a bug
        // will be introduced that will manifest when opening an "Add subsection" form of the
        // previous section).
        if (this.target.isOpeningSection) {
          $element.insertAfter(this.target.$elements.last());
        } else {
          $element.insertBefore(this.target.$elements.first());
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
          this.$element.appendTo(cd.g.$root);
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
        const headingLevelRegexp = new RegExp(
          `\\bcd-commentForm-addSubsection-[${this.target.level}-6]\\b`
        );
        let $target;
        let $tested = this.target.$elements.last();
        do {
          $target = $tested;
          $tested = $tested.next();
        } while (
          $tested.is('.cd-sectionButtonContainer, .cd-commentForm-reply') ||
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
    this.commentInput.$input.get(0).addEventListener('tribute-replaced', (e) => {
      if (e.detail.instance.trigger === cd.config.mentionCharacter) {
        if (this.mode === 'edit') {
          const $message = cd.util.wrap(
            cd.sParse('cf-reaction-mention-edit'),
            { targetBlank: true }
          );
          this.showMessage($message, {
            type: 'notice',
            name: 'mentionEdit',
          });
        }
        if (this.omitSignatureCheckbox?.isSelected()) {
          const $message = cd.util.wrap(
            cd.sParse('cf-reaction-mention-nosignature'),
            { targetBlank: true }
          );
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

    if (this.omitSignatureCheckbox) {
      this.omitSignatureCheckbox
        .on('change', () => {
          this.preview(false);
        })
        .on('change', saveSessionEventHandler);
    }

    if (this.deleteCheckbox) {
      this.deleteCheckbox
        .on('change', (selected) => {
          this.updateAutoSummary(true, true);
          this.updateFormOnDeleteCheckboxChange(selected);
        })
        .on('change', preview)
        .on('change', saveSessionEventHandler);
    }

    this.settingsButton
      .on('click', () => {
        settingsDialog();
      });

    this.advancedButton
      .on('click', () => {
        this.toggleAdvanced();
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
   */
  initAutocomplete() {
    let commentsInSection = [];
    if (this.targetSection) {
      commentsInSection = this.targetSection.getBase().comments;
    } else if (this.mode !== 'addSection') {
      // Comments in the lead section
      cd.comments.some((comment) => {
        if (comment.getSection()) {
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

    let usersInSection = commentsInSection
      .map((comment) => comment.author.name)
      .sort();
    if (this.targetComment && this.mode !== 'edit') {
      usersInSection.unshift(this.targetComment.author.name);
    }
    usersInSection = usersInSection.filter(unique);

    /**
     * Autocomplete object for the comment input.
     *
     * @type {Autocomplete}
     */
    this.autocomplete = new Autocomplete({
      types: ['mentions', 'wikilinks', 'templates', 'tags', 'commentLinks'],
      inputs: [this.commentInput],
      comments: commentsInSection,
      defaultUserNames: usersInSection,
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
        defaultUserNames: usersInSection,
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
      defaultUserNames: usersInSection,
    });
  }

  /**
   * Show or hide the advanced section.
   */
  toggleAdvanced() {
    saveScrollPosition();
    if (this.$advanced.is(':hidden')) {
      this.$advanced.show();
      const value = this.summaryInput.getValue();
      const match = value.match(/^.+?\*\/ */);
      this.summaryInput.selectRange(match ? match[0].length : 0, value.length);
    } else {
      this.$advanced.hide();
      this.commentInput.focus();
    }
    restoreScrollPosition();
  }

  /**
   * Adjust button labels according to the form width: if the form is to narrow, the labels will
   * shrink.
   */
  adjustLabels() {
    let formWidth = this.$innerWrapper.width();

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
   * @param {boolean} blockButtons Whether to block buttons.
   * @param {boolean} affectHeadline Should the `pushPending` method be applied to the headline
   *   input.
   * @see
   *   https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.mixin.PendingElement-method-pushPending
   */
  pushPending(blockButtons = false, affectHeadline = true) {
    this.commentInput.pushPending();
    this.summaryInput.pushPending();
    if (this.headlineInput && affectHeadline) {
      this.headlineInput.pushPending();
    }

    if (blockButtons) {
      this.submitButton.setDisabled(true);
      this.previewButton.setDisabled(true);
      this.viewChangesButton.setDisabled(true);
      this.cancelButton.setDisabled(true);
    }
  }

  /**
   * Pop the pending status of the form inputs.
   *
   * @param {boolean} [unblockButtons=false] Whether to unblock buttons if they were blocked.
   * @param {boolean} [affectHeadline=true] Should the `popPending` method be applied to the
   *   headline input.
   * @see
   *   https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.mixin.PendingElement-method-popPending
   */
  popPending(unblockButtons = false, affectHeadline = true) {
    this.commentInput.popPending();
    this.summaryInput.popPending();
    if (this.headlineInput && affectHeadline) {
      this.headlineInput.popPending();
    }

    if (unblockButtons) {
      this.submitButton.setDisabled(false);
      this.previewButton.setDisabled(false);
      this.viewChangesButton.setDisabled(false);
      this.cancelButton.setDisabled(false);
    }
  }

  /**
   * Show a service message above the form.
   *
   * @param {string|JQuery} htmlOrJquery
   * @param {object} [options]
   * @param {string} [options.type='notice'] `'notice'`, `'error'`, `'warning'`, or `'success'`. See
   *   {@link
   *   https://doc.wikimedia.org/oojs-ui/master/demos/?page=widgets&theme=wikimediaui&direction=ltr&platform=desktop#MessageWidget-type-notice-inline-true
   *   the OOUI Demos}.
   * @param {string} [options.name] Name added to the class name of the message element.
   * @param {boolean} [options.isRaw=false] Message HTML contains the whole message code. It doesn't
   *   need to be wrapped in the widget.
   */
  showMessage(htmlOrJquery, {
    type = 'notice',
    name,
    isRaw = false,
  } = {}) {
    if (this.isDestroyed || (name && this.$messageArea.children(`.cd-message-${name}`).length)) {
      return;
    }

    let appendable;
    if (isRaw) {
      appendable = htmlOrJquery;
    } else {
      const $label = htmlOrJquery instanceof $ ? htmlOrJquery : cd.util.wrap(htmlOrJquery);
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
   * @param {string} options.message Message visible to the user.
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
      addNotification([
        message,
        {
          type: 'error',
          autoHideSeconds: 'long',
        },
      ]);
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
   * wrapper around {@link module:CommentForm#abort}.
   *
   * @param {object} options
   * @param {string} options.type Type of the error: `'parse'` for parse errors defined in the
   *   script, `'api'` for MediaWiki API errors, `'network'` for network errors defined in the
   *   script, `'javascript'` for JavaScript errors.
   * @param {string} [options.code] Code of the error (either `code`, `apiData`, or `message`
   *   should be specified).
   * @param {object} [options.details] Additional details about an error.
   * @param {string} [options.apiData] Data object received from the MediaWiki server (either
   *   `code`, `apiData`, or `message` should be specified).
   * @param {string} [options.message] Text of the error (either `code`, `apiData`, or `message`
   *   should be specified).
   * @param {string} [options.messageType] Message type if not `'error'` (`'notice'` or
   *   `'warning'`).
   * @param {string} [options.logMessage] Data or text to display in the browser console.
   * @param {boolean} [options.cancel=false] Cancel the form and show the message as a
   *   notification.
   * @param {boolean} [options.isRawMessage=false] Show the message as it is, without OOUI framing.
   * @param {Operation} [options.currentOperation] Operation the form is undergoing.
   */
  async handleError({
    type,
    code,
    details,
    apiData,
    message,
    messageType,
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
            editUrl = this.targetSection ?
              this.targetSection.editUrl.toString() :
              cd.g.CURRENT_PAGE.getUrl({
                action: 'edit',
                section: 0,
              });
            message = cd.sParse('error-locatecomment', editUrl);
            break;
          case 'locateSection':
            editUrl = cd.g.CURRENT_PAGE.getUrl({ action: 'edit' });
            message = cd.sParse('error-locatesection', editUrl);
            break;
          case 'numberedList-list':
            message = (
              cd.sParse('cf-error-numberedlist') +
              ' ' +
              cd.sParse('cf-error-numberedlist-list')
            );
            break;
          case 'numberedList-table':
            message = (
              cd.sParse('cf-error-numberedlist') +
              ' ' +
              cd.sParse('cf-error-numberedlist-table')
            );
            break;
          case 'findPlace':
            message = cd.sParse('cf-error-findplace');
            break;
          case 'findPlace-unexpectedHeading':
            message = cd.sParse('cf-error-findplace-unexpectedheading');
            break;
          case 'delete-repliesToComment':
            message = cd.sParse('cf-error-delete-repliestocomment');
            break;
          case 'delete-repliesInSection':
            message = cd.sParse('cf-error-delete-repliesinsection');
            break;
          case 'commentLinks-commentNotFound':
            message = cd.sParse('cf-error-commentlinks-commentnotfound', details.anchor);
            break;
        }
        const navigateToEditUrl = async (e) => {
          if (e.ctrlKey || e.shiftKey || e.metaKey) return;
          e.preventDefault();
          if (await this.confirmClose()) {
            this.forget();
            location.assign(editUrl);
          }
        };
        message = cd.util.wrap(
          message,
          {
            callbacks: {
              'cd-message-reloadPage': async () => {
                if (await this.confirmClose()) {
                  this.reloadPage();
                }
              },
              'cd-message-editSection': navigateToEditUrl,
              'cd-message-editPage': navigateToEditUrl,
            },
          }
        );
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
            const {
              code: errorCode,
              info: errorInfo,
            } = apiData.error;
            switch (errorCode) {
              case 'missingtitle':
                message = cd.sParse('cf-error-pagedoesntexist');
                break;
              default:
                message = await unknownApiErrorText(errorCode, errorInfo);
            }
            break;
          }
        }

        message = cd.util.wrap(message);
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
   * Prepend indentation chars to code.
   *
   * @param {string} code
   * @param {string} indentationChars
   * @returns {string}
   * @private
   */
  addIndentationChars(code, indentationChars) {
    return (
      indentationChars +
      (
        indentationChars && !/^[:*#]/.test(code) && cd.config.spaceAfterIndentationChars ?
        ' ' :
        ''
      ) +
      code
    );
  }

  /**
   * Convert the text of the comment in the form to wikitext.
   *
   * @param {string} action `'submit'` (view changes maps to this too) or `'preview'`.
   * @returns {string}
   * @throws {CdError}
   */
  commentTextToCode(action) {
    let indentationChars;

    // This is mostly to tell if inconvertible newlines would cause problems in the comment and
    // reflect that in the comment preview.
    let willCommentBeIndented = false;

    switch (this.mode) {
      case 'reply':
        indentationChars = this.target.inCode.replyIndentationChars;
        willCommentBeIndented = true;
        break;
      case 'edit':
        indentationChars = this.target.inCode.indentationChars;
        willCommentBeIndented = Boolean(indentationChars);
        break;
      case 'replyInSection':
        indentationChars = cd.config.defaultIndentationChar;
        if (this.target.inCode.lastCommentIndentationChars) {
          if (this.target.inCode.lastCommentIndentationChars[0] === '#') {
            indentationChars = '#';
          } else if (cd.config.indentationCharMode === 'mimic') {
            indentationChars = this.target.inCode.lastCommentIndentationChars[0];
          }
        }
        willCommentBeIndented = true;
        break;
      default:
        indentationChars = '';
    }

    const isZeroLevel = (
      action === 'preview' ||
      ['addSection', 'addSubsection'].includes(this.mode) ||
      (this.mode === 'edit' && !indentationChars)
    );

    const newLineIndentationChars = indentationChars.replace(/\*/g, ':');

    // Work with the code
    let code = this.commentInput.getValue();

    if (cd.config.preTransformCode) {
      code = cd.config.preTransformCode(code, this);
    }

    code = code.trim();

    let hidden;
    ({ code, hidden } = hideSensitiveCode(code));

    let isWholeCommentInSmall = false;
    if (!this.headlineInput) {
      // If the user wrapped the comment in <small></small>, remove the tags to later wrap the
      // comment together with the signature into the tags and possibly ensure the correct line
      // spacing.
      code = code.replace(/^<small>([^]*)<\/small>$/i, (s, content) => {
        isWholeCommentInSmall = true;
        return content;
      });
    }

    // Remove spaces from empty lines except when they are a part of the syntax creating <pre>.
    code = code
      .replace(/^(?:[ \t\xA0\uFEFF]*\n)+(?! )/gm, (s) => s.replace(/^[ \t\uFEFF\xA0]+/gm, ''));

    let signature;
    if (this.omitSignatureCheckbox?.isSelected()) {
      signature = '';
    } else {
      signature = this.mode === 'edit' ?
        this.target.inCode.signatureCode :
        cd.g.CURRENT_USER_SIGNATURE;
    }

    // Make so that the signature doesn't turn out to be at the end of the last item of the list if
    // the comment contains one.
    if (
      signature &&
      (this.mode !== 'edit' || !/^[ \t]*\n/.test(signature)) &&
      /\n[:*#].*$/.test(code)
    ) {
      code += '\n';
    }

    if (!isZeroLevel) {
      // Add intentation characters to the lines with the list markup.
      code = code.replace(/\n([:*#]+)/g, (s, chars) => '\n' + newLineIndentationChars + chars);

      if (willCommentBeIndented && (/^[:*#]/m.test(code) || code.includes('\x03'))) {
        if (newLineIndentationChars === '#') {
          throw new CdError({
            type: 'parse',
            code: 'numberedList-list',
          });
        }

        // Table markup is OK only with colons as indentation characters.
        if (newLineIndentationChars.includes('#') && code.includes('\x03')) {
          throw new CdError({
            type: 'parse',
            code: 'numberedList-table',
          });
        }

        // Add intentation characters to the rest of the lines.
        code = code.replace(/\n(?!:)/g, () => (
          '\n' +
          newLineIndentationChars +
          (cd.config.spaceAfterIndentationChars ? ' ' : '')
        ));
      }
    }

    if (willCommentBeIndented) {
      // Remove spaces in the beginning of the lines if the comment is indented.
      code = code.replace(/^ +/gm, '');

      const replacement = cd.config.paragraphTemplates.length ?
        `$1{{${cd.config.paragraphTemplates[0]}}}` :
        '$1<br><br>';
      code = code.replace(/^((?![:*#= ]).*)\n\n(?![:*#=])/gm, replacement);
    }

    // Process newlines by adding or not adding <br> and keeping or not keeping the newline. \x01
    // and \x02 mean the beginning and ending of sensitive code except for tables. \x03 and \x04
    // mean the beginning and ending of a table. Note: This should be kept coordinated with the
    // reverse transformation code in Comment#codeToText.
    const entireLineRegexp = new RegExp(
      `^(?:\\x01.+?\\x02|\\[\\[${cd.g.FILE_PREFIX_PATTERN}.+\\]\\]) *$`,
      'i'
    );
    const thisLineEndingRegexp = new RegExp(
      `(?:<${cd.g.PNIE_PATTERN}(?: [\\w ]+?=[^<>]+?| ?\\/?)>|<\\/${cd.g.PNIE_PATTERN}>|\\x04) *$`,
      'i'
    );
    const nextLineBeginningRegexp = new RegExp(
      `^(?:<\\/${cd.g.PNIE_PATTERN}>|<${cd.g.PNIE_PATTERN}|\\|)`,
      'i'
    );
    const headingRegexp = /^(=+).*\1[ \t]*$/;
    code = code.replace(
      /^((?![:*# ]).+)\n(?![\n:*# \x03])(?=(.*))/gm,
      (s, thisLine, nextLine) => {
        const br = (
          // We assume that if a tag/template occupies an entire line or multiple lines, it's a
          // block tag/template and it doesn't need <br>s before or after it. A false positive is
          // possible in case of <nowiki> occupying an entire line (as of May 2020, no other inline
          // tags are hidden, see hideSensitiveCode() in wikitext.js).
          // https://en.wikipedia.org/w/index.php?diff=946978893
          // https://en.wikipedia.org/w/index.php?diff=941991985
          entireLineRegexp.test(thisLine) ||
          entireLineRegexp.test(nextLine) ||

          (
            !willCommentBeIndented &&
            (headingRegexp.test(thisLine) || headingRegexp.test(nextLine))
          ) ||

          // Removing <br>s after block elements is not a perfect solution as there would be no
          // newlines when editing such a comment, but this way we would avoid empty lines in cases
          // like "</div><br>".
          thisLineEndingRegexp.test(thisLine) ||
          nextLineBeginningRegexp.test(nextLine)
        ) ?
          '' :
          '<br>';
        const newline = willCommentBeIndented ? '' : '\n';
        return thisLine + br + newline;
      }
    );

    if (!this.omitSignatureCheckbox?.isSelected()) {
      // Remove signature tildes
      code = code.replace(/\s*~{3,}$/, '');
    }

    // If the comment starts with a numbered list or table, replace all asterisks in the indentation
    // chars with colons to have the list or table form correctly.
    if (!isZeroLevel && /^(#|.*\x03)/.test(code)) {
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

      if (this.editingSectionOpeningComment && /^\n/.test(this.target.inCode.code)) {
        // To have pretty diffs.
        code = '\n' + code;
      }
      code = `${equalSigns} ${this.headlineInput.getValue().trim()} ${equalSigns}\n${code}`;
    }

    // Add the signature
    if (action === 'preview' && signature) {
      signature = `<span class="cd-commentForm-signature">${signature}</span>`;
    }

    // Space in the beggining of the line, creating <pre>.
    if (/(?:^|\n) .*$/.test(code)) {
      code += '\n';
    }

    // Remove starting spaces if the line starts with the signature.
    if (!code || code.endsWith('\n') || code.endsWith(' ')) {
      signature = signature.trimLeft();
    }

    code += signature;

    // Process the small font wrappers
    if (!this.headlineInput && isWholeCommentInSmall) {
      const indentation = (
        newLineIndentationChars +
        (/^[:*#]/.test(code) || !cd.config.spaceAfterIndentationChars ? '' : ' ')
      );
      const before = /^[:*# ]/.test(code) ? `\n${indentation}` : '';
      if (cd.config.smallDivTemplates?.[0] && !/^[:*#]/m.test(code)) {
        const adjustedCode = code.replace(/\|/g, '{{!}}');
        code = `{{${cd.config.smallDivTemplates[0]}|1=${adjustedCode}}}`;
      } else {
        code = `<small>${before}${code}</small>`;
      }
    }

    if (this.mode !== 'edit') {
      code += '\n';
    }

    // Add the indentation characters
    if (action === 'submit') {
      code = this.addIndentationChars(code, indentationChars);

      // When an indented comment had been started with a list but the list has gone after editing.
      // Really rare but possible (see
      // https://ru.wikipedia.org/w/index.php?diff=next&oldid=105978713) case.
      if (
        willCommentBeIndented &&
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
    if (action === 'preview' && willCommentBeIndented && this.commentInput.getValue().trim()) {
      code = code.replace(/^(?=(.?))/gm, (s, after) => ':' + (after === ';' ? ' ' : ''));
      imitateList = true;
    } else {
      imitateList = false;
    }

    code = unhideText(code, hidden);

    if (cd.config.postTransformCode) {
      code = cd.config.postTransformCode(code, this);
    }

    return {
      commentCode: code,
      imitateList,
    };
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
    const doDelete = this.deleteCheckbox?.isSelected();

    if (!(this.target instanceof Page)) {
      this.target.locateInCode();
    }
    let { newPageCode, codeBeforeInsertion, commentCode } = this.target.modifyCode({
      pageCode,
      action: this.mode,
      doDelete,
      commentForm: this,
    });

    if (action === 'submit' && !doDelete) {
      // We need this only to generate anchors for the comments above our comment to avoid
      // collisions.
      extractSignatures(codeBeforeInsertion, true);
    }

    // Add anchor code to comments linked from the comment.
    const anchorsRegexp = /\[\[#(\d{12}_[^|\]]+)/g;
    const anchors = [];
    let match;
    while ((match = anchorsRegexp.exec(commentCode))) {
      anchors.push(match[1]);
    }
    anchors.forEach((anchor) => {
      const comment = Comment.getCommentByAnchor(anchor);
      if (comment) {
        const commentInCode = comment.locateInCode(newPageCode);
        const anchorCode = cd.config.getAnchorCode(anchor);
        if (commentInCode.code.includes(anchorCode)) return;

        let commentStart = this.addIndentationChars(
          commentInCode.code,
          commentInCode.indentationChars
        );
        const commentTextIndex = commentStart.match(/^[:*#]* */)[0].length;
        commentStart = (
          commentStart.slice(0, commentTextIndex) +
          anchorCode +
          commentStart.slice(commentTextIndex)
        );
        const commentCode = (
          (commentInCode.headingCode || '') +
          commentStart +
          commentInCode.signatureDirtyCode
        );

        ({ newPageCode } = comment.modifyCode({
          pageCode: newPageCode,
          thisInCode: commentInCode,
          action: 'edit',
          commentCode,
        }));
      } else if (!$('#' + anchor).length) {
        throw new CdError({
          type: 'parse',
          code: 'commentLinks-commentNotFound',
          details: { anchor },
        });
      }
    });

    return newPageCode;
  }

  /**
   * Prepare the new page code and handle errors.
   *
   * @param {string} action `'submit'` or `'viewChanges'`.
   * @returns {string} newPageCode
   * @private
   */
  async tryPrepareNewPageCode(action) {
    try {
      await this.targetPage.getCode(mw.config.get('wgArticleId') === 0);
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

    let newPageCode;
    try {
      newPageCode = this.prepareNewPageCode(this.targetPage.code, action);
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

    return newPageCode;
  }

  /**
   * Add an operation to the registry of operations.
   *
   * @param {Operation} operation
   * @returns {Operation}
   */
  registerOperation(operation) {
    this.operations.push(operation);
    operation.isClosed = false;
    if (operation.type !== 'preview' || !operation.isAuto) {
      this.$messageArea.empty();
      this.pushPending(['load', 'submit'].includes(operation.type), operation.affectHeadline);
    }
    return operation;
  }

  /**
   * Mark the operation as closed if it is not. Should be done when the operation has finished
   * (either successfully or not).
   *
   * @param {Operation} operation
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
   * @param {Operation} operation
   * @returns {boolean}
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
   * @param {Operation} operation
   */
  unregisterOperation(operation) {
    if (this.operations.includes(operation)) {
      this.operations.splice(this.operations.indexOf(operation), 1);
    }
    // This was excessive at the time when it was written as the only use case is autopreview.
    if (operation.type !== 'preview' || !operation.isAuto) {
      this.popPending(operation.type === 'submit', operation.affectHeadline);
    }
  }

  /**
   * Whether the form is being submitted right now.
   *
   * @returns {boolean}
   */
  isBeingSubmitted() {
    return this.operations.some((op) => op.type === 'submit' && !op.isClosed);
  }

  /**
   * Preview the comment.
   *
   * @param {boolean} [previewEmpty=true] If `false`, don't preview if the comment and headline
   *   inputs are empty.
   * @param {boolean} [isAuto=true] Preview is initiated automatically (if the user has
   *   `cd.settings.autopreview` as `true`).
   * @param {boolean} [operation] Operation object when the function is called from within itself,
   *   being delayed.
   * @fires previewReady
   */
  async preview(previewEmpty = true, isAuto = true, operation) {
    if (
      this.operations.some((op) => !op.isClosed && op.type === 'load') ||
      (
        !(this.target instanceof Page) &&
        !this.target.inCode &&
        this.checkCodeRequest &&
        (await nativePromiseState(this.checkCodeRequest)) === 'resolved'
      ) ||
      this.isBeingSubmitted() ||
      (isAuto && !cd.settings.autopreview)
    ) {
      if (operation) {
        this.closeOperation(operation);
      }
      return;
    }

    const currentOperation = (
      operation ||
      this.registerOperation({
        type: 'preview',
        isAuto,
      })
    );

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
    if (!(this.target instanceof Page) && !this.target.inCode) {
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

    const { commentCode, imitateList } = this.commentTextToCode('preview');
    let html;
    let parsedSummary;
    try {
      ({ html, parsedSummary } = await parseCode(commentCode, {
        title: this.targetPage.name,
        summary: cd.util.buildEditSummary({ text: this.summaryInput.getValue() }),
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
        if (imitateList) {
          this.$previewArea.addClass('cd-previewArea-indentedComment');
        } else {
          this.$previewArea.removeClass('cd-previewArea-indentedComment');
        }

        /**
         * A comment preview has been rendered.
         *
         * @event previewReady
         * @type {JQuery}
         */
        mw.hook('convenientDiscussions.previewReady').fire(this.$previewArea);

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

    if (cd.settings.autopreview && this.previewButton.$element.is(':visible')) {
      this.previewButton.$element.hide();
      this.viewChangesButton.$element.show();
      this.adjustLabels();
    }

    if (!isAuto) {
      this.commentInput.focus();

      this.$previewArea.cdScrollIntoView(
        this.$previewArea.hasClass('cd-previewArea-above') ?
        'top' :
        'bottom'
      );
    }

    this.closeOperation(currentOperation);
  }

  /**
   * View changes in the page code after submitting the form.
   */
  async viewChanges() {
    if (this.isBeingSubmitted()) return;

    const currentOperation = this.registerOperation({ type: 'viewChanges' });

    const newPageCode = await this.tryPrepareNewPageCode('viewChanges');
    if (newPageCode === undefined) {
      this.closeOperation(currentOperation);
    }
    if (currentOperation.isClosed) return;

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
        options.fromrev = this.targetPage.revisionId;
      } else {
        // Unexistent pages
        options.fromslots = 'main',
        options['fromtext-main'] = '';
      }
      resp = await cd.g.api.post(options).catch(handleApiReject);
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
      html = cd.util.wrapDiffBody(html);
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

    if (cd.settings.autopreview) {
      this.viewChangesButton.$element.hide();
      this.previewButton.$element.show();
      this.adjustLabels();
    }

    this.$previewArea.cdScrollIntoView(
      this.$previewArea.hasClass('cd-previewArea-above') ?
      'top' :
      'bottom'
    );

    this.commentInput.focus();

    this.closeOperation(currentOperation);
  }

  /**
   * Forget the form and reload the page.
   *
   * @param {object} [keptData] Data passed from the previous page state.
   * @param {Operation} [currentOperation] Current operation.
   */
  async reloadPage(keptData, currentOperation) {
    this.forget();

    try {
      await reloadPage(keptData);
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
      removeLoadingOverlay();
    }
  }

  /**
   * Run checks before submitting the form.
   *
   * @param {object} options
   * @param {boolean} options.doDelete
   * @returns {boolean}
   * @private
   */
  async runChecks({ doDelete }) {
    const checks = [
      {
        condition: this.headlineInput?.getValue() === '',
        confirmation: async () => {
          const noHeadline = cd.s(
            'cf-confirm-noheadline-' +
            (this.headlineInputPurpose === cd.s('cf-headline-topic') ? 'topic' : 'subsection')
          );
          return await OO.ui.confirm(noHeadline + ' ' + cd.s('cf-confirm-noheadline-question'));
        },
      },
      {
        condition: (
          !this.commentInput.getValue().trim() &&
          !cd.config.noConfirmPostEmptyCommentPageRegexp?.test(cd.g.CURRENT_PAGE.name)
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
        condition: doDelete,
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
    let result;
    try {
      result = await this.targetPage.edit({
        text: newPageCode,
        summary: cd.util.buildEditSummary({ text: this.summaryInput.getValue() }),
        tags: cd.config.tagName,
        baserevid: page.revisionId,
        starttimestamp: page.queryTimestamp,
        minor: this.minorCheckbox?.isSelected(),
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
            this.submit();
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

    return result;
  }

  /**
   * Submit the form.
   */
  async submit() {
    if (this.operations.some((op) => !op.isClosed && op.type === 'load')) return;

    const doDelete = this.deleteCheckbox?.isSelected();

    if (!(await this.runChecks({ doDelete }))) return;

    const currentOperation = this.registerOperation({ type: 'submit' });

    const newPageCode = await this.tryPrepareNewPageCode('submit');
    if (newPageCode === undefined) {
      this.closeOperation(currentOperation);
      return;
    }

    const editTimestamp = await this.tryEditPage(
      this.targetPage,
      newPageCode,
      currentOperation
    );
    if (!editTimestamp) return;

    // Here we use a trick where we pass, in keptData, the name of the section that was set to be
    // watched/unwatched using a checkbox in a form just sent. The server doesn't manage to update
    // the value quickly enough, so it returns the old value, but we must display the new one.
    let keptData = { didSubmitCommentForm: true };
    // When creating a page
    if (!mw.config.get('wgArticleId')) {
      mw.config.set('wgArticleId', this.targetPage.pageId);
      keptData.wasPageCreated = true;
    }

    if (this.watchSectionCheckbox) {
      if (this.watchSectionCheckbox.isSelected()) {
        const isHeadlineAltered = (
          this.editingSectionOpeningComment &&
          this.headlineInput.getValue() !== this.originalHeadline
        );
        if (this.mode === 'addSection' || this.mode === 'addSubsection' || isHeadlineAltered) {
          const headline = removeWikiMarkup(this.headlineInput.getValue());
          Section.watchSection(headline, { silent: true });
          keptData.justWatchedSection = headline;
          if (isHeadlineAltered) {
            const originalHeadline = removeWikiMarkup(this.originalHeadline);
            Section.unwatchSection(originalHeadline, { silent: true });
            keptData.justUnwatchedSection = originalHeadline;
          }
        } else {
          const section = this.targetSection;
          if (section && !section.isWatched) {
            section.watch(true);
            keptData.justWatchedSection = section.headline;
          }
        }
      } else {
        const section = this.targetSection;
        if (section?.isWatched) {
          section.unwatch(true);
          keptData.justUnwatchedSection = section.headline;
        }
      }
    }

    if (this.watchCheckbox.isSelected() && $('#ca-watch').length) {
      $('#ca-watch').attr('id', 'ca-unwatch');
    }
    if (!this.watchCheckbox.isSelected() && $('#ca-unwatch').length) {
      $('#ca-unwatch').attr('id', 'ca-watch');
    }

    if (!doDelete) {
      keptData.commentAnchor = this.mode === 'edit' ?
        this.target.anchor :
        generateCommentAnchor(new Date(editTimestamp), cd.g.CURRENT_USER_NAME, true);
    }

    this.reloadPage(keptData, currentOperation);
  }

  /**
   * Ask for a confirmation to close the form if necessary.
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
    if (cd.util.isPageOverlayOn() || this.isBeingSubmitted()) return;

    if (confirmClose && !(await this.confirmClose())) {
      this.commentInput.focus();
      return;
    }

    this.destroy();

    if (this.mode === 'reply') {
      this.target.scrollIntoView('top');
    } else if (this.mode === 'replyInSection') {
      this.target.$replyButton.show();
      this.target.$replyWrapper.removeClass('cd-replyWrapper-hasCommentForm');
    } else if (this.mode === 'edit') {
      this.target.$elements.removeClass('cd-hidden');
      this.target.scrollIntoView('top');
      this.target.configureLayers();
    } else if (this.mode === 'addSection' && cd.g.$addSectionButtonContainer) {
      cd.g.$addSectionButtonContainer.show();
    }
  }

  /**
   * Remove the elements and other objects' properties related to the form.
   */
  destroy() {
    this.operations
      .filter((op) => !op.isClosed)
      .forEach(this.closeOperation.bind(this));
    this.forget();
    this.$element.remove();

    /**
     * Has the comment form been {@link module:CommentForm#destroy destroyed}.
     *
     * @type {boolean}
     */
    this.isDestroyed = true;
  }

  /**
   * Remove the references to the form and unload it from the session data thus making it not appear
   * after a page reload.
   *
   * @private
   */
  forget() {
    if (this.mode === 'addSection') {
      delete cd.g.addSectionForm;
    } else {
      delete this.target[CommentForm.modeToProperty(this.mode) + 'Form'];
    }
    if (cd.commentForms.includes(this)) {
      cd.commentForms.splice(cd.commentForms.indexOf(this), 1);
    }
    saveSession();
    navPanel.updateCommentFormButton();
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
          cd.g.USER_NAMESPACE_ALIASES_REGEXP.test(wikilink) ? text : s
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
      if (this.headlineInput) {
        this.headlineInput.setDisabled(true);
      }
      this.minorCheckbox.setDisabled(true);
      if (this.omitSignatureCheckbox) {
        this.omitSignatureCheckbox.setDisabled(true);
      }

      this.$element.addClass('cd-commentForm-disabled');

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
      if (this.headlineInput) {
        this.headlineInput.setDisabled(false);
      }
      this.minorCheckbox.setDisabled(false);
      if (this.omitSignatureCheckbox) {
        this.omitSignatureCheckbox.setDisabled(false);
      }

      this.$element.removeClass('cd-commentForm-disabled');

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
   * Insert "@" into the comment input, activating the mention autocomplete menu.
   *
   * @param {boolean} mentionAddressee Don't show the autocomplete menu, just insert a mention of
   *   the addressee to the beginning of the comment input.
   */
  mention(mentionAddressee) {
    if (mentionAddressee && this.targetComment) {
      let data = Autocomplete.getMentionsConfig()
        .transform(this.targetComment.author.name);
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

    const lastChar = caretIndex && this.commentInput.getValue().slice(caretIndex - 1, caretIndex);
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
  quote(allowEmptySelection = true) {
    const selectionText = isInputFocused() ?
      document.activeElement.value
        .substring(document.activeElement.selectionStart, document.activeElement.selectionEnd) :
      window.getSelection().toString().trim();
    // With just the "Q" hotkey, empty selection doesn't count.
    if (selectionText || allowEmptySelection) {
      // We don't use the native insertContent() function here in order to prevent harm from
      // replacing the selected text (when both the text in the input and on the page is
      // selected), and we don't use encapsulateContent() to insert exactly at the cursor position
      // which can be in the beginning and in the end of the selection depending on where it
      // started. On top of that, we don't use setValue() by default because we want to keep the
      // undo/redo functionality.
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

      const quotePre = cd.config.quoteFormatting[0];
      const quotePost = cd.config.quoteFormatting[1];
      const quotation = quotePre + (selectionText || cd.s('cf-quote-placeholder')) + quotePost;
      const newRangeStart = rangeStart + (selectionText ? quotation.length : quotePre.length);
      const newRangeEnd = selectionText ?
        newRangeStart :
        newRangeStart + cd.s('cf-quote-placeholder').length;
      insertText(this.commentInput, quotation);
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
