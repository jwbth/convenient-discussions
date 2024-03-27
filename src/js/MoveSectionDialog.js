import Autocomplete from './Autocomplete';
import CdError from './CdError';
import cd from './cd';
import controller from './controller';
import pageRegistry from './pageRegistry';
import { buildEditSummary, sleep } from './utils';
import { focusInput } from './utils-window';
import { wrapHtml } from './utils-window';
import { createCheckboxField, tweakUserOoUiClass } from './ooui';
import { encodeWikilink, endWithTwoNewlines, findFirstTimestamp } from './wikitext';

/**
 * Class used to create a move section dialog.
 *
 * @augments external:OO.ui.ProcessDialog
 */
class MoveSectionDialog extends OO.ui.ProcessDialog {
  static name = 'moveSectionDialog';
  static title = cd.s('msd-title');
  static actions = [
    {
      action: 'close',
      modes: ['move', 'success'],
      flags: ['safe', 'close'],
      disabled: true,
    },
    {
      action: 'move',
      modes: ['move'],
      label: cd.s('msd-move'),
      flags: ['primary', 'progressive'],
      disabled: true,
    },
  ];

  /**
   * Create a move section dialog.
   *
   * @param {import('./Section').default} section
   */
  constructor(section) {
    super();
    this.section = section;
  }

  /**
   * OOUI native method to get the height of the window body.
   *
   * @returns {number}
   * @see
   *   https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/OO.ui.Window-method-getBodyHeight
   * @private
   */
  getBodyHeight() {
    return this.$errorItems ? this.$errors.prop('scrollHeight') : this.$body.prop('scrollHeight');
  }

  /**
   * OOUI native method that initializes window contents.
   *
   * @param {...*} [args]
   * @see
   *   https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/OO.ui.ProcessDialog-method-initialize
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   * @private
   */
  initialize(...args) {
    super.initialize(...args);

    this.pushPending();

    this.initRequests = [
      this.section.getSourcePage().loadCode(),
      mw.loader.using('mediawiki.widgets'),
    ];

    this.loadingPanel = new OO.ui.PanelLayout({
      padded: true,
      expanded: false,
    });
    this.loadingPanel.$element.append($('<div>').text(cd.s('loading-ellipsis')));

    this.movePanel = new OO.ui.PanelLayout({
      padded: true,
      expanded: false,
    });

    this.successPanel = new OO.ui.PanelLayout({
      padded: true,
      expanded: false,
    });

    this.stackLayout = new OO.ui.StackLayout({
      items: [this.loadingPanel, this.movePanel, this.successPanel],
    });
    this.$body.append(this.stackLayout.$element);
  }

  /**
   * OOUI native method that returns a "setup" process which is used to set up a window for use in a
   * particular context, based on the `data` argument.
   *
   * @param {object} [data] Dialog opening data
   * @returns {external:OO.ui.Process}
   * @see
   *   https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/OO.ui.Dialog-method-getSetupProcess
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   * @private
   */
  getSetupProcess(data) {
    return super.getSetupProcess(data).next(() => {
      this.stackLayout.setItem(this.loadingPanel);
      this.actions.setMode('move');
    });
  }

  /**
   * OOUI native method that returns a "ready" process which is used to ready a window for use in a
   * particular context, based on the `data` argument.
   *
   * @param {object} data Window opening data
   * @returns {external:OO.ui.Process}
   * @see
   *   https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/OO.ui.Window-method-getReadyProcess
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   * @private
   */
  getReadyProcess(data) {
    return super.getReadyProcess(data).next(async () => {
      try {
        await Promise.all(this.initRequests);
      } catch (e) {
        this.abort(cd.sParse('cf-error-getpagecode'), false);
        return;
      }

      try {
        this.section.locateInCode();
      } catch (e) {
        if (e instanceof CdError) {
          const { data } = e.data;
          const messageName = data === 'locateSection' ? 'error-locatesection' : 'error-unknown';
          const message = cd.sParse(messageName);
          this.abort(message, false);
        } else {
          console.warn(e);
          this.abort(cd.sParse('error-javascript'), false);
        }
        return;
      }
      const sectionCode = this.section.source.code;

      this.controls = {};
      this.controls.title = {},
      this.controls.title.input = new mw.widgets.TitleInputWidget({
        $overlay: this.$overlay,
        excludeCurrentPage: true,
        showMissing: false,
        showSuggestionsOnFocus: false,
        value: pageRegistry.getCurrent().isArchivePage() ?
          pageRegistry.getCurrent().getArchivedPage().name :
          '',
        validate: () => {
          const title = this.controls.title.input.getMWTitle();
          const page = title && pageRegistry.get(title);
          return page && page !== this.section.getSourcePage();
        },
      });
      this.controls.title.field = new OO.ui.FieldLayout(this.controls.title.input, {
        label: cd.s('msd-targetpage'),
        align: 'top',
      });

      this.controls.title.input.connect(this, {
        change: 'onTitleInputChange',
        enter: () => {
          if (!this.actions.get({ actions: 'move' })[0].isDisabled()) {
            this.executeAction('move');
          }
        },
      });

      if (cd.config.getMoveSourcePageCode || cd.config.getMoveTargetPageCode) {
        this.controls.keepLink = createCheckboxField({
          value: 'keepLink',
          selected: !pageRegistry.getCurrent().isArchivePage(),
          label: cd.s('msd-keeplink'),
        });
      }

      this.controls.summaryEnding = {};
      this.controls.summaryEnding.input = new OO.ui.TextInputWidget({
        // TODO: Take into account the whole summary length, updating the maximum value dynamically.
        maxLength: 250,
      });
      this.summaryEndingAutocomplete = new Autocomplete({
        types: ['mentions', 'wikilinks'],
        inputs: [this.controls.summaryEnding.input],
      });
      this.summaryEndingAutocomplete.init();
      this.controls.summaryEnding.field = new OO.ui.FieldLayout(this.controls.summaryEnding.input, {
        label: cd.s('msd-summaryending'),
        align: 'top',
      });

      this.movePanel.$element.append(
        this.controls.title.field.$element,
        this.controls.keepLink.field?.$element,
        $('<pre>')
          .addClass('cd-dialog-moveSection-code')
          .text(sectionCode.slice(0, 300) + (sectionCode.length >= 300 ? '...' : '')),
        $('<p>')
          .addClass('cd-dialog-moveSection-code-note')
          .text(cd.s('msd-bottom')),
        this.controls.summaryEnding.field.$element,
      );

      this.stackLayout.setItem(this.movePanel);
      focusInput(this.controls.title.input);
      this.actions.setAbilities({ close: true });

      // A dirty workaround to avoid a scrollbar appearing when the window is loading. Couldn't
      // figure out a way to do this out of the box.
      this.$body.css('overflow', 'hidden');
      sleep(500).then(() => {
        this.$body.css('overflow', '');
      });

      this.updateSize();
      this.popPending();
    });
  }

  /**
   * OOUI native method that returns a process for taking action.
   *
   * @param {string} action Symbolic name of the action.
   * @returns {external:OO.ui.Process}
   * @see
   *   https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/OO.ui.Dialog-method-getActionProcess
   * @private
   */
  getActionProcess(action) {
    if (action === 'move') {
      return new OO.ui.Process(async () => {
        this.pushPending();
        this.controls.title.input.$input.blur();

        let targetPage = pageRegistry.get(this.controls.title.input.getMWTitle());

        // Should be ruled out by making the button disabled.
        if (targetPage === this.section.getSourcePage()) {
          this.abort(cd.sParse('msd-error-wrongpage'), false);
          return;
        }

        let source;
        let target;
        try {
          [source, target] = await Promise.all([
            this.loadSourcePage(),
            this.loadTargetPage(targetPage),
          ]);
          await this.editTargetPage(source, target);
          await this.editSourcePage(source, target);
        } catch (e) {
          this.abort(...e);
          return;
        }

        this.successPanel.$element.append(
          wrapHtml(cd.sParse('msd-moved', target.sectionWikilink), { tagName: 'div' })
        );

        controller.reload({
          sectionId: this.controls.keepLink.input.isSelected() ? this.section.id : undefined,
        });

        this.stackLayout.setItem(this.successPanel);
        this.actions.setMode('success');
        this.popPending();
      });
    } else if (action === 'close') {
      return new OO.ui.Process(() => {
        this.close();
      });
    }
    return super.getActionProcess(action);
  }

  /**
   * Handler of the event of change of the title input.
   *
   * @private
   */
  async onTitleInputChange() {
    let move = true;
    await this.controls.title.input.getValidity().catch(() => {
      move = false;
    });
    this.actions.setAbilities({ move });
  }

  /**
   * Load the source page code.
   *
   * @returns {object}
   * @throws {Array.<string|boolean>}
   * @private
   */
  async loadSourcePage() {
    try {
      await this.section.getSourcePage().loadCode(false);
    } catch (e) {
      if (e instanceof CdError) {
        const { type, code } = e.data;
        if (type === 'api') {
          if (code === 'missing') {
            throw [cd.sParse('msd-error-sourcepagedeleted'), true];
          } else {
            throw [cd.sParse('error-api', code), true];
          }
        } else if (type === 'network') {
          throw [cd.sParse('error-network'), true];
        }
      } else {
        console.warn(e);
        throw [cd.sParse('error-javascript'), false];
      }
    }

    try {
      this.section.locateInCode();
    } catch (e) {
      if (e instanceof CdError) {
        const { code } = e.data;
        const messageName = code === 'locateSection' ? 'error-locatesection' : 'error-unknown';
        const message = cd.sParse(messageName);
        throw [message, true];
      } else {
        console.warn(e);
        throw [cd.sParse('error-javascript'), false];
      }
    }

    const pageName = this.section.getSourcePage().name;
    const headlineEncoded = encodeWikilink(this.section.headline);
    return {
      page: this.section.getSourcePage(),
      sectionSource: this.section.source,
      sectionWikilink: this.controls.keepLink.input.isSelected() ?
        `${pageName}#${headlineEncoded}` :
        pageName,
    };
  }

  /**
   * Load the target page code.
   *
   * @param {import('./pageRegistry').Page} targetPage
   * @returns {object}
   * @throws {Array.<string|boolean>}
   * @private
   */
  async loadTargetPage(targetPage) {
    try {
      await targetPage.loadCode();
    } catch (e) {
      if (e instanceof CdError) {
        const { type, code } = e.data;
        if (type === 'api') {
          if (code === 'invalid') {
            // Should be filtered before submit anyway.
            throw [cd.sParse('msd-error-invalidpagename'), false];
          } else {
            throw [cd.sParse('error-api', code), true];
          }
        } else if (type === 'network') {
          throw [cd.sParse('error-network'), true];
        }
      } else {
        console.warn(e);
        throw [cd.sParse('error-javascript'), false];
      }
    }

    targetPage.analyzeNewTopicPlacement();

    return {
      page: targetPage,
      sectionWikilink: `${targetPage.realName}#${encodeWikilink(this.section.headline)}`,
    };
  }

  /**
   * Edit the target page.
   *
   * @param {object} source
   * @param {object} target
   * @returns {object}
   * @throws {Array.<string|boolean>}
   * @private
   */
  async editTargetPage(source, target) {
    let codeBeginning;
    let codeEnding;
    if (cd.config.getMoveTargetPageCode && this.controls.keepLink.input.isSelected()) {
      const code = cd.config.getMoveTargetPageCode(
        source.sectionWikilink.replace(/=/g, '{{=}}'),
        cd.g.userSignature.replace(/=/g, '{{=}}')
      );
      if (Array.isArray(code)) {
        codeBeginning = code[0] + '\n';
        codeEnding = '\n' + code[1];
      } else {
        codeBeginning = code;
        codeEnding = '';
      }
    } else {
      codeBeginning = '';
      codeEnding = '';
    }

    const sectionCode = source.sectionSource.code;
    const relativeContentStartIndex = source.sectionSource.relativeContentStartIndex;
    const newSectionCode = endWithTwoNewlines(
      sectionCode.slice(0, relativeContentStartIndex) +
      codeBeginning +
      sectionCode.slice(relativeContentStartIndex) +
      codeEnding
    );

    let newCode;
    const pageCode = target.page.code;
    if (target.page.areNewTopicsOnTop) {
      // If the page has no sections, we add to the bottom.
      const firstSectionStartIndex = target.page.firstSectionStartIndex ?? pageCode.length;

      newCode = (
        endWithTwoNewlines(pageCode.slice(0, firstSectionStartIndex)) +
        newSectionCode +
        pageCode.slice(firstSectionStartIndex)
      );
    } else {
      newCode = pageCode + (pageCode ? '\n' : '') + newSectionCode;
    }

    let summaryEnding = this.controls.summaryEnding.input.getValue();
    summaryEnding &&= cd.mws('colon-separator', { language: 'content' }) + summaryEnding;

    try {
      await target.page.edit({
        text: newCode,
        summary: buildEditSummary({
          text: cd.s('es-move-from', source.sectionWikilink) + summaryEnding,
          section: this.section.headline,
        }),
        baserevid: target.page.revisionId,
        starttimestamp: target.page.queryTimestamp,
      });
    } catch (e) {
      const genericMessage = cd.sParse('msd-error-editingtargetpage');
      if (e instanceof CdError) {
        const { type, details } = e.data;
        if (type === 'network') {
          throw [genericMessage + ' ' + cd.sParse('error-network'), true];
        } else {
          let { code, message, logMessage } = details;
          if (code === 'editconflict') {
            message += ' ' + cd.sParse('msd-error-editconflict-retry');
          }
          console.warn(logMessage);
          throw [genericMessage + ' ' + message, true];
        }
      } else {
        console.warn(e);
        throw [genericMessage + ' ' + cd.sParse('error-javascript'), false];
      }
    }
  }

  /**
   * Edit the source page.
   *
   * @param {object} source
   * @param {object} target
   * @returns {object}
   * @throws {Array.<string|boolean>}
   */
  async editSourcePage(source, target) {
    const sectionCode = source.sectionSource.code;

    let summaryEnding = this.controls.summaryEnding.input.getValue();
    summaryEnding &&= cd.mws('colon-separator', { language: 'content' }) + summaryEnding;

    try {
      await source.page.edit({
        text: (
          source.page.code.slice(0, source.sectionSource.startIndex) +
          (
            cd.config.getMoveSourcePageCode && this.controls.keepLink.input.isSelected() ?
              (
                sectionCode.slice(0, source.sectionSource.relativeContentStartIndex) +
                cd.config.getMoveSourcePageCode(
                  target.sectionWikilink,
                  cd.g.userSignature,
                  findFirstTimestamp(sectionCode) || cd.g.signCode + '~'
                ) +
                '\n'
              ) :
              ''
          ) +
          source.page.code.slice(source.sectionSource.endIndex)
        ),
        summary: buildEditSummary({
          text: cd.s('es-move-to', target.sectionWikilink) + summaryEnding,
          section: this.section.headline,
        }),
        baserevid: source.page.revisionId,
        starttimestamp: source.page.queryTimestamp,
      });
    } catch (e) {
      // Errors when editing the target page are recoverable, because we haven't performed any
      // actions yet. Errors when editing the source page are not recoverable, because we have
      // already edited the source page.
      const genericMessage = cd.sParse('msd-error-editingsourcepage');
      if (e instanceof CdError) {
        const { type, details } = e.data;
        if (type === 'network') {
          throw [genericMessage + ' ' + cd.sParse('error-network'), false, true];
        } else {
          const { message, logMessage } = details;
          console.warn(logMessage);
          throw [genericMessage + ' ' + message, false, true];
        }
      } else {
        console.warn(e);
        throw [genericMessage + ' ' + cd.sParse('error-javascript'), false, true];
      }
    }
  }

  /**
   * Abort an operation and show an error.
   *
   * @param {string} html Error HTML code.
   * @param {boolean} recoverable Is the error recoverable.
   * @param {boolean} [closeDialog=false] Close the dialog after pressing "Close" under the error
   *   message.
   * @private
   */
  abort(html, recoverable, closeDialog = false) {
    const $body = wrapHtml(html, {
      callbacks: {
        'cd-message-reloadPage': () => {
          this.close();
          controller.reload();
        },
      },
    });
    this.showErrors(new OO.ui.Error($body, { recoverable }));
    this.$errors
      .find('.oo-ui-buttonElement-button')
      .on('click', () => {
        if (closeDialog) {
          this.close();
        } else {
          this.updateSize();
        }
      });

    this.actions.setAbilities({
      close: true,
      move: recoverable,
    });

    this.updateSize();
    this.popPending();
  }
}

tweakUserOoUiClass(MoveSectionDialog, OO.ui.ProcessDialog);

export default MoveSectionDialog;
