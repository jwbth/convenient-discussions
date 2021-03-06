/**
 * Move section dialog class.
 *
 * @module MoveSectionDialog
 */

import Autocomplete from './Autocomplete';
import CdError from './CdError';
import Page from './Page';
import cd from './cd';
import { buildEditSummary, focusInput, wrap } from './util';
import { createCheckboxField, tweakUserOoUiClass } from './ooui';
import { encodeWikilink, endWithTwoNewlines, findFirstTimestamp } from './wikitext';
import { reloadPage } from './boot';

/**
 * Class used to create a move section dialog.
 *
 * @augments external:OO.ui.ProcessDialog
 */
export default class MoveSectionDialog extends OO.ui.ProcessDialog {
  static name = 'moveSectionDialog';
  static title = cd.s('msd-title');
  static actions = [
    {
      action: 'close',
      modes: ['move', 'reload'],
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
    {
      action: 'reload',
      modes: ['reload'],
      label: cd.s('msd-reload'),
      flags: ['primary', 'progressive'],
    },
  ];

  /**
   * Create a move section dialog.
   *
   * @param {Section} section
   */
  constructor(section) {
    super();
    this.section = section;
    this.preparatoryRequests = [
      section.getSourcePage().getCode(),
      mw.loader.using('mediawiki.widgets'),
    ];
  }

  /**
   * OOUI native method to get the height of the window body.
   *
   * @returns {number}
   * @see
   *   https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/OO.ui.Window-method-getBodyHeight
   */
  getBodyHeight() {
    return this.$errorItems ? this.$errors.get(0).scrollHeight : this.$body.get(0).scrollHeight;
  }

  /**
   * OOUI native method that initializes window contents.
   *
   * @param {...*} [args]
   * @see
   *   https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/OO.ui.ProcessDialog-method-initialize
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   */
  initialize(...args) {
    super.initialize(...args);

    this.pushPending();

    const $loading = $('<div>').text(cd.s('loading-ellipsis'));
    this.loadingPanel = new OO.ui.PanelLayout({
      padded: true,
      expanded: false,
    });
    this.loadingPanel.$element.append($loading);

    this.movePanel = new OO.ui.PanelLayout({
      padded: true,
      expanded: false,
    });

    this.reloadPanel = new OO.ui.PanelLayout({
      padded: true,
      expanded: false,
    });

    this.stackLayout = new OO.ui.StackLayout({
      items: [this.loadingPanel, this.movePanel, this.reloadPanel],
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
   */
  getReadyProcess(data) {
    return super.getReadyProcess(data).next(async () => {
      try {
        await Promise.all(this.preparatoryRequests);
      } catch (e) {
        this.abort(cd.sParse('cf-error-getpagecode'), false);
        return;
      }

      try {
        this.section.locateInCode();
      } catch (e) {
        if (e instanceof CdError) {
          const { data } = e.data;
          const message = data === 'locateSection' ?
            cd.sParse('error-locatesection') :
            cd.sParse('error-unknown');
          this.abort(message, false);
        } else {
          this.abort(cd.sParse('error-javascript'), false);
        }
        return;
      }
      const sectionCode = this.section.inCode.code;

      this.titleInput = new mw.widgets.TitleInputWidget({
        $overlay: this.$overlay,
        excludeCurrentPage: true,
        showMissing: false,
        validate: () => {
          const title = this.titleInput.getMWTitle();
          const page = title && new Page(title);
          return (
            page &&
            page.name !== this.section.getSourcePage().name &&
            page.isProbablyTalkPage()
          );
        },
      });
      this.titleField = new OO.ui.FieldLayout(this.titleInput, {
        label: cd.s('msd-targetpage'),
        align: 'top',
      });

      this.titleInput.connect(this, { 'change': 'onTitleInputChange' });
      this.titleInput.connect(this, {
        'enter': () => {
          if (!this.actions.get({ actions: 'move' })[0].isDisabled()) {
            this.executeAction('move');
          }
        },
      });

      if (cd.config.getMoveSourcePageCode || cd.config.getMoveTargetPageCode) {
        [this.keepLinkField, this.keepLinkCheckbox] = createCheckboxField({
          value: 'keepLink',
          selected: true,
          label: cd.s('msd-keeplink'),
        });
      }

      const $sectionCodeNote = $('<div>');
      const code = sectionCode.slice(0, 300) + (sectionCode.length >= 300 ? '...' : '');
      $('<pre>')
        .addClass('cd-moveSectionDialog-code')
        .text(code)
        .appendTo($sectionCodeNote);
      $('<p>')
        .addClass('cd-moveSectionDialog-codeNote')
        .text(cd.s('msd-bottom'))
        .appendTo($sectionCodeNote);

      this.summaryEndingInput = new OO.ui.TextInputWidget({
        // TODO: take into account the whole summary length, updating the maximum value
        // dynamically.
        maxLength: 250,
      });
      this.summaryEndingAutocomplete = new Autocomplete({
        types: ['mentions', 'wikilinks'],
        inputs: [this.summaryEndingInput],
      });
      this.summaryEndingField = new OO.ui.FieldLayout(this.summaryEndingInput, {
        label: cd.s('msd-summaryending'),
        align: 'top',
      });

      this.movePanel.$element.append([
        this.titleField.$element,
        this.keepLinkField?.$element,
        $sectionCodeNote,
        this.summaryEndingField.$element,
      ]);

      this.stackLayout.setItem(this.movePanel);
      focusInput(this.titleInput);
      this.actions.setAbilities({ close: true });

      // A dirty workaround to avoid a scrollbar appearing when the window is loading. Couldn't
      // figure out a way to do this out of the box.
      this.$body.css('overflow', 'hidden');
      setTimeout(() => {
        this.$body.css('overflow', '');
      }, 500);

      cd.g.windowManager.updateWindowSize(this);
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
   */
  getActionProcess(action) {
    if (action === 'move') {
      return new OO.ui.Process(async () => {
        this.pushPending();
        this.titleInput.$input.blur();

        let targetPage = new Page(this.titleInput.getMWTitle());
        // Should be ruled out by making the button disabled.
        if (targetPage.name === this.section.getSourcePage().name ||
          !targetPage.isProbablyTalkPage()) {
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

        this.reloadPanel.$element.append(
          wrap(cd.sParse('msd-moved', target.sectionWikilink), { tagName: 'div' })
        );

        this.stackLayout.setItem(this.reloadPanel);
        this.actions.setMode('reload');
        this.popPending();
      });
    } else if (action === 'reload') {
      return new OO.ui.Process(() => {
        this.close();
        reloadPage({ sectionAnchor: this.section.anchor });
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
   */
  async onTitleInputChange() {
    let move = true;
    try {
      await this.titleInput.getValidity();
    } catch (e) {
      move = false;
    }
    this.actions.setAbilities({ move });
  }

  /**
   * Load the source page code.
   *
   * @returns {object}
   * @throws {Array}
   */
  async loadSourcePage() {
    try {
      await this.section.getSourcePage().getCode(false);
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
        throw [cd.sParse('error-javascript'), false];
      }
    }

    try {
      this.section.locateInCode();
    } catch (e) {
      if (e instanceof CdError) {
        const { code } = e.data;
        const message = code === 'locateSection' ?
          cd.sParse('error-locatesection') :
          cd.sParse('error-unknown');
        throw [message, true];
      } else {
        throw [cd.sParse('error-javascript'), false];
      }
    }

    const pageName = this.section.getSourcePage().name;
    const headlineEncoded = encodeWikilink(this.section.headline);
    return {
      page: this.section.getSourcePage(),
      sectionInCode: this.section.inCode,
      sectionWikilink: `${pageName}#${headlineEncoded}`,
    };
  }

  /**
   * Load the target page code.
   *
   * @param {Page} targetPage
   * @returns {object}
   * @throws {Array}
   */
  async loadTargetPage(targetPage) {
    try {
      await targetPage.getCode();
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
   * @throws {Array}
   */
  async editTargetPage(source, target) {
    let codeBeginning;
    let codeEnding;
    if (cd.config.getMoveTargetPageCode && this.keepLinkCheckbox.isSelected()) {
      const code = cd.config.getMoveTargetPageCode(source.sectionWikilink, cd.g.USER_SIGNATURE);
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

    const sectionCode = source.sectionInCode.code;
    const codeBefore = sectionCode.slice(0, source.sectionInCode.relativeContentStartIndex);
    const sectionContentCode = sectionCode.slice(source.sectionInCode.relativeContentStartIndex);
    const newSectionCode = endWithTwoNewlines(
      codeBefore +
      codeBeginning +
      sectionContentCode +
      codeEnding
    );

    let newCode;
    const pageCode = target.page.code;
    if (target.page.areNewTopicsOnTop) {
      // The page has no sections, so we add to the bottom.
      if (target.page.firstSectionStartIndex === undefined) {
        target.page.firstSectionStartIndex = pageCode.length;
      }
      const codeBefore = endWithTwoNewlines(pageCode.slice(0, target.page.firstSectionStartIndex));
      const codeAfter = pageCode.slice(target.page.firstSectionStartIndex);
      newCode = codeBefore + newSectionCode + codeAfter;
    } else {
      newCode = pageCode + (pageCode ? '\n' : '') + newSectionCode;
    }

    let summaryEnding = this.summaryEndingInput.getValue();
    const colon = cd.mws('colon-separator', { language: 'content' });
    summaryEnding = summaryEnding && colon + summaryEnding;
    const summary = cd.s('es-move-from', source.sectionWikilink) + summaryEnding;
    try {
      await target.page.edit({
        text: newCode,
        summary: buildEditSummary({
          text: summary,
          section: this.section.headline,
        }),
        baserevid: target.page.revisionId,
        starttimestamp: target.page.queryTimestamp,
      });
    } catch (e) {
      const editingTargetPageMessage = cd.sParse('msd-error-editingtargetpage');
      if (e instanceof CdError) {
        const { type, details } = e.data;
        if (type === 'network') {
          throw [editingTargetPageMessage + ' ' + cd.sParse('error-network'), true];
        } else {
          let { code, message, logMessage } = details;
          if (code === 'editconflict') {
            message += ' ' + cd.sParse('msd-error-editconflict-retry');
          }
          console.warn(logMessage);
          throw [editingTargetPageMessage + ' ' + message, true];
        }
      } else {
        console.warn(e);
        throw [editingTargetPageMessage + ' ' + cd.sParse('error-javascript'), true];
      }
    }
  }

  /**
   * Edit the source page.
   *
   * @param {object} source
   * @param {object} target
   * @returns {object}
   * @throws {Array}
   */
  async editSourcePage(source, target) {
    const sectionCode = source.sectionInCode.code;
    const timestamp = findFirstTimestamp(sectionCode) || cd.g.SIGN_CODE + '~';

    let newSectionCode;
    if (cd.config.getMoveSourcePageCode && this.keepLinkCheckbox.isSelected()) {
      const code = cd.config.getMoveSourcePageCode(
        target.sectionWikilink,
        cd.g.USER_SIGNATURE,
        timestamp
      );
      const codeBefore = sectionCode.slice(0, source.sectionInCode.relativeContentStartIndex);
      newSectionCode = codeBefore + code + '\n';
    } else {
      newSectionCode = '';
    }

    const codeBefore = source.page.code.slice(0, source.sectionInCode.startIndex);
    const codeAfter = source.page.code.slice(source.sectionInCode.endIndex);
    const newCode = codeBefore + newSectionCode + codeAfter;

    let summaryEnding = this.summaryEndingInput.getValue();
    const colon = cd.mws('colon-separator', { language: 'content' });
    summaryEnding = summaryEnding && colon + summaryEnding;
    const summary = cd.s('es-move-to', target.sectionWikilink) + summaryEnding;

    try {
      await source.page.edit({
        text: newCode,
        summary: buildEditSummary({
          text: summary,
          section: this.section.headline,
        }),
        baserevid: source.page.revisionId,
        starttimestamp: source.page.queryTimestamp,
      });
    } catch (e) {
      const editingSourcePageMessage = cd.sParse('msd-error-editingsourcepage');
      if (e instanceof CdError) {
        const { type, details } = e.data;
        if (type === 'network') {
          throw [editingSourcePageMessage + ' ' + cd.sParse('error-network'), false];
        } else {
          let { message, logMessage } = details;
          console.warn(logMessage);
          throw [editingSourcePageMessage + ' ' + message, false];
        }
      } else {
        console.warn(e);
        throw [editingSourcePageMessage + ' ' + cd.sParse('error-javascript'), false];
      }
    }
  }

  /**
   * Abort an operation and show an error.
   *
   * @param {string} html Error HTML code.
   * @param {boolean} recoverable Is the error recoverable.
   */
  abort(html, recoverable) {
    const $body = wrap(html, {
      callbacks: {
        'cd-message-reloadPage': () => {
          this.close();
          reloadPage();
        },
      },
    });
    const error = new OO.ui.Error($body, { recoverable });
    this.showErrors(error);
    this.$errors
      .find('.oo-ui-buttonElement-button')
      .on('click', () => {
        if (recoverable) {
          cd.g.windowManager.updateWindowSize(this);
        } else {
          this.close();
        }
      });
    this.actions.setAbilities({
      close: true,
      move: recoverable,
    });
    cd.g.windowManager.updateWindowSize(this);
    this.popPending();
  }
}

tweakUserOoUiClass(MoveSectionDialog, OO.ui.ProcessDialog);
