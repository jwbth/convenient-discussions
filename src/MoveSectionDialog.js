import Autocomplete from './Autocomplete';
import CdError from './CdError';
import ProcessDialog from './ProcessDialog';
import PseudoLink from './Pseudolink';
import TextInputWidget from './TextInputWidget';
import bootController from './bootController';
import cd from './cd';
import pageRegistry from './pageRegistry';
import { buildEditSummary, defined, definedAndNotNull, ensureArray, mergeMaps, sleep } from './utils-general';
import { createCheckboxControl, createTitleControl, es6ClassToOoJsClass } from './utils-oojs';
import { encodeWikilink, endWithTwoNewlines, findFirstTimestamp } from './utils-wikitext';
import { wrapHtml } from './utils-window';

/**
 * Class used to create a move section dialog.
 *
 * @augments ProcessDialog
 */
class MoveSectionDialog extends ProcessDialog {
  // @ts-ignore: https://phabricator.wikimedia.org/T358416
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

  /** @type {OO.ui.StackLayout} */
  stack;

  /** @type {OO.ui.PanelLayout} */
  loadingPanel;

  /** @type {OO.ui.PanelLayout} */
  movePanel;

  /** @type {OO.ui.PanelLayout} */
  successPanel;

  /** @type {Array<Promise|JQuery.Promise>} */
  initRequests;

  /** @typedef {{
   *   title: 'title';
   *   keepLink: 'checkbox';
   *   chronologicalOrder: 'checkbox';
   *   summaryEnding: 'text';
   * }} MoveSectionDialogControlTypes
   */

  controls = /** @type {ControlTypesByName<MoveSectionDialogControlTypes>} */ ({});

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
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getBodyHeight
   * @ignore
   */
  getBodyHeight() {
    return this.$errorItems ? this.$errors.prop('scrollHeight') : this.$body.prop('scrollHeight');
  }

  /**
   * OOUI native method that initializes window contents.
   *
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#initialize
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   * @ignore
   */
  initialize() {
    super.initialize();

    this.pushPending();

    const sourcePage = this.section.getSourcePage();
    const archivingConfigPages = [];
    if (sourcePage.canHaveArchives()) {
      archivingConfigPages.push(
        sourcePage,
        ...(cd.config.archivingConfig.subpages || [])
          .map((subpage) => pageRegistry.get(sourcePage.name + '/' + subpage))
          .filter(definedAndNotNull)
      );
    }
    const templatePages = (cd.config.archivingConfig.templates || [])
      .map((template) => pageRegistry.get(template.name))
      .filter(definedAndNotNull);
    this.initRequests = [
      sourcePage.loadCode(),
      mw.loader.using('mediawiki.widgets'),
      Promise.all(
        archivingConfigPages.map((page) => page.getFirstTemplateTransclusion(templatePages))
      ).then((transclusions) => this.guessArchiveConfig(mergeMaps(transclusions)), () => {}),
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

    this.stack = new OO.ui.StackLayout({
      items: [this.loadingPanel, this.movePanel, this.successPanel],
    });
    this.$body.append(this.stack.$element);

    return this;
  }

  /**
   * OOUI native method that returns a "setup" process which is used to set up a window for use in a
   * particular context, based on the `data` argument.
   *
   * @param {object} [data] Dialog opening data
   * @returns {OO.ui.Process}
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getSetupProcess
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   * @ignore
   */
  getSetupProcess(data) {
    return super.getSetupProcess(data).next(() => {
      this.stack.setItem(this.loadingPanel);
      this.actions.setMode('move');
    });
  }

  /**
   * OOUI native method that returns a "ready" process which is used to ready a window for use in a
   * particular context, based on the `data` argument.
   *
   * @param {object} data Window opening data
   * @returns {OO.ui.Process}
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getReadyProcess
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   * @ignore
   */
  getReadyProcess(data) {
    return super.getReadyProcess(data).next(async () => {
      let archiveConfig;
      try {
        [, , archiveConfig] = await Promise.all(this.initRequests);
      } catch (error) {
        this.abort(cd.sParse('cf-error-getpagecode'), false);
        return;
      }

      try {
        this.section.locateInCode();
      } catch (error) {
        if (error instanceof CdError) {
          this.abort(cd.sParse(error.data.code === 'locateSection' ? 'error-locatesection' : 'error-unknown'), false);
        } else {
          console.warn(error);
          this.abort(cd.sParse('error-javascript'), false);
        }
        return;
      }

      this.controls.title = createTitleControl({
        label: cd.s('msd-targetpage'),
        $overlay: this.$overlay,
        excludeCurrentPage: true,
        showMissing: false,
        showSuggestionsOnFocus: false,
        validate: () => {
          const title = this.controls.title.input.getMWTitle();
          const page = title && pageRegistry.get(title);

          return Boolean(page && page !== this.section.getSourcePage());
        },
      });

      this.controls.title.input
        .on('change', this.onTitleInputChange.bind(this))
        .on('enter', () => {
          if (!this.actions.get({ actions: 'move' })[0].isDisabled()) {
            this.executeAction('move');
          }
        });

      const archivePath =
        archiveConfig?.path ||
        (cd.page.isArchive() ? undefined : cd.page.getArchivePrefix(true));
      if (archivePath) {
        this.insertArchivePageButton = new PseudoLink({
          label: archivePath,
          input: this.controls.title.input,
        });
        $(this.insertArchivePageButton.buttonElement).on('click', () => {
          this.controls.keepLink?.input.setSelected(false);
          this.controls.chronologicalOrder.input.setSelected(archiveConfig?.isSorted || false);
        });
      }

      if (cd.config.getMoveSourcePageCode || cd.config.getMoveTargetPageCode) {
        this.controls.keepLink = createCheckboxControl({
          value: 'keepLink',
          selected: !cd.page.isArchive(),
          label: cd.s('msd-keeplink'),
        });
      }
      this.controls.chronologicalOrder = createCheckboxControl({
        value: 'chronologicalOrder',
        selected: false,
        label: cd.s('msd-chronologicalorder'),
      });

      this.controls.summaryEnding = /** @type {TextControl} */ ({});
      this.controls.summaryEnding.input = new TextInputWidget({
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

      this.movePanel.$element.append([
        this.controls.title.field.$element,
        this.insertArchivePageButton?.element,
        this.controls.keepLink?.field.$element,
        this.controls.chronologicalOrder.field.$element,
        this.controls.summaryEnding.field.$element,
      ].filter(defined));

      this.stack.setItem(this.movePanel);
      this.controls.title.input.focus();
      this.onTitleInputChange();
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
   * @returns {OO.ui.Process}
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getActionProcess
   * @ignore
   */
  getActionProcess(action) {
    if (action === 'move') {
      return new OO.ui.Process(async () => {
        this.pushPending();
        this.controls.title.input.$input.blur();

        let targetPage = /** @type {import('./Page').default} */ (
          pageRegistry.get(/** @type {mw.Title} */ (this.controls.title.input.getMWTitle()))
        );

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
        } catch (error) {
          if (error instanceof CdError) {
            this.abort(.../** @type {Parameters<MoveSectionDialog['abort']>} */ (error.data));
          } else {
            throw error;
          }
          return;
        }

        this.successPanel.$element.append(
          wrapHtml(cd.sParse('msd-moved', target.sectionWikilink), { tagName: 'div' })
        );

        bootController.reboot({
          sectionId: this.controls.keepLink.input.isSelected() ? this.section.id : undefined,
        });

        this.stack.setItem(this.successPanel);
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
   * @protected
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
   * @returns {Promise<{
   *   page: import('./Page').default;
   *   sectionSource: import('./SectionSource').default;
   *   sectionWikilink: string;
   * }>}
   * @throws {Array.<string|boolean>}
   * @protected
   */
  async loadSourcePage() {
    try {
      await this.section.getSourcePage().loadCode(undefined, false);
    } catch (error) {
      if (error instanceof CdError) {
        const { type, code } = error.data;
        if (type === 'api') {
          if (code === 'missing') {
            throw new CdError({ data: [cd.sParse('msd-error-sourcepagedeleted'), true] });
          } else {
            throw new CdError({ data: [cd.sParse('error-api', code), true] });
          }
        } else if (type === 'network') {
          throw new CdError({ data: [cd.sParse('error-network'), true] });
        }
      } else {
        console.warn(error);
        throw new CdError({ data: [cd.sParse('error-javascript'), false] });
      }
    }

    let sectionSource;
    try {
      sectionSource = this.section.locateInCode();
    } catch (error) {
      if (error instanceof CdError) {
        throw new CdError({
          data: [
            cd.sParse(
              error.data.code === 'locateSection' ? 'error-locatesection' : 'error-unknown'
            ),
            true,
          ],
        });
      } else {
        console.warn(error);
        throw new CdError({ data: [cd.sParse('error-javascript'), false] });
      }
    }

    const pageName = this.section.getSourcePage().name;
    const headlineEncoded = encodeWikilink(this.section.headline);

    return {
      page: this.section.getSourcePage(),
      sectionSource,
      sectionWikilink: this.controls.keepLink.input.isSelected() ?
        `${pageName}#${headlineEncoded}` :
        pageName,
    };
  }

  /**
   * Load the target page code.
   *
   * @param {import('./Page').default} targetPage
   * @returns {Promise<{
   *   page: import('./Page').default;
   *   targetIndex: number | null;
   *   sectionWikilink: string;
   * }>}
   * @throws {Array.<string|boolean>}
   * @protected
   */
  async loadTargetPage(targetPage) {
    try {
      await targetPage.loadCode();
    } catch (error) {
      if (error instanceof CdError) {
        const { type, code } = error.data;
        if (type === 'api') {
          if (code === 'invalid') {
            // Should be filtered before submit anyway.
            throw new CdError({ data: [cd.sParse('msd-error-invalidpagename'), false] });
          } else {
            throw new CdError({ data: [cd.sParse('error-api', code), true] });
          }
        } else if (type === 'network') {
          throw new CdError({ data: [cd.sParse('error-network'), true] });
        }
      } else {
        console.warn(error);
        throw new CdError({ data: [cd.sParse('error-javascript'), false] });
      }
    }

    return {
      page: targetPage,
      targetIndex: targetPage.source.findProperPlaceForSection(
        this.controls.chronologicalOrder.input.isSelected()
          ? (this.section.oldestComment?.date || undefined)
          : undefined
      ),
      sectionWikilink: `${targetPage.realName}#${encodeWikilink(this.section.headline)}`,
    };
  }

  /**
   * Edit the target page.
   *
   * @param {object} source
   * @param {object} target
   * @throws {Array.<string|boolean>}
   * @protected
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

    let summaryEnding = this.controls.summaryEnding.input.getValue();
    summaryEnding &&= cd.mws('colon-separator', { language: 'content' }) + summaryEnding;

    try {
      await target.page.edit({
        text: (
          endWithTwoNewlines(target.page.code.slice(0, target.targetIndex)) +

          // New section code
          endWithTwoNewlines(
            sectionCode.slice(0, relativeContentStartIndex) +
            codeBeginning +
            sectionCode.slice(relativeContentStartIndex) +
            codeEnding
          ) +

          target.page.code.slice(target.targetIndex)
        ),
        summary: buildEditSummary({
          text: cd.s('es-move-from', source.sectionWikilink) + summaryEnding,
          section: this.section.headline,
        }),
        baserevid: target.page.revisionId,
        starttimestamp: target.page.queryTimestamp,
      });
    } catch (error) {
      const genericMessage = cd.sParse('msd-error-editingtargetpage');
      if (error instanceof CdError) {
        const { type, details } = error.data;
        if (type === 'network') {
          throw new CdError({ data: [genericMessage + ' ' + cd.sParse('error-network'), true] });
        } else {
          let { code, message, logMessage } = details;
          if (code === 'editconflict') {
            message += ' ' + cd.sParse('msd-error-editconflict-retry');
          }
          console.warn(logMessage);
          throw new CdError({ data: [genericMessage + ' ' + message, true] });
        }
      } else {
        console.warn(error);
        throw new CdError({ data: [genericMessage + ' ' + cd.sParse('error-javascript'), false] });
      }
    }
  }

  /**
   * Edit the source page.
   *
   * @param {object} source
   * @param {object} target
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
    } catch (error) {
      // Errors when editing the target page are recoverable because we haven't performed any
      // actions yet. Errors when editing the source page are not recoverable because we have
      // already edited the source page.
      const genericMessage = cd.sParse('msd-error-editingsourcepage');
      if (error instanceof CdError) {
        const { type, details } = error.data;
        if (type === 'network') {
          throw new CdError({
            data: [genericMessage + ' ' + cd.sParse('error-network'), false, true],
          });
        } else {
          const { message, logMessage } = details;
          console.warn(logMessage);
          throw new CdError({ data: [genericMessage + ' ' + message, false, true] });
        }
      } else {
        console.warn(error);
        throw new CdError({ data: [genericMessage + ' ' + cd.sParse('error-javascript'), false, true] });
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
   * @protected
   */
  abort(html, recoverable, closeDialog = false) {
    this.showErrors(new OO.ui.Error(wrapHtml(html, {
      callbacks: {
        'cd-message-reloadPage': () => {
          this.close();
          bootController.reboot();
        },
      },
    }), { recoverable }));
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

  /**
   * Provided parameters of archiving templates present on the page, guess the archive path and
   * other configuration for the section.
   *
   * @param {Map<import('./Page').default, StringsByKey>} templateToParameters
   * @returns {?{
   *   path: ?string;
   *   isSorted: boolean;
   * }}
   */
  guessArchiveConfig(templateToParameters) {
    return Array.from(templateToParameters).reduce((config, [page, parameters]) => {
      if (config) {
        return config;
      }

      const templateConfig = /** @type {import('../config/default').ArchivingTemplateEntry} */ (
        (cd.config.archivingConfig.templates || []).find(
          (template) => pageRegistry.get(template.name) === page
        )
      );

      /**
       * Find a parameter mentioned in the template config in the list of actual template
       * parameters, do the regexp transformations, and return the result.
       *
       * @param {string} prop
       * @returns {?string}
       */
      const findPresentParamAndReplaceAll = (prop) => {
        const replaceAll = (/** @type {string} */ value) =>
          Array.from(templateConfig.replacements || []).reduce(
            (v, [regexp, replacer]) => {
              return v.replace(regexp, (...match) =>
                replacer(
                  {
                    counter: parameters[templateConfig.counterParam] || null,
                    date: this.section.oldestComment?.date || null,
                  },

                  // Basically get all string matches. Use a complex expression in case JavaScript
                  // evolves in the future to add more arguments.
                  match.slice(0, match.findIndex((el) => typeof el !== 'string'))
                ),
              );
            },
            value
          );

        const presentPathParam = ensureArray(templateConfig[prop]).find(
          (pathParam) => parameters[pathParam]
        );

        return presentPathParam ? replaceAll(parameters[presentPathParam]) : null;
      };

      let path = findPresentParamAndReplaceAll('pathParam');
      if (!path) {
        path = findPresentParamAndReplaceAll('relativePathParam');
        if (path) {
          const [absolutePairKey, absolutePairValue] = templateConfig.absolutePathPair || [];
          if (!(absolutePairKey && parameters[absolutePairKey]?.match(absolutePairValue))) {
            path = cd.page.name + '/' + path;
          }
        }
      }

      return {
        path,
        isSorted: cd.config.archivingConfig.areArchivesSorted || false,
      };
    }, null);
  }
}

es6ClassToOoJsClass(MoveSectionDialog);

export default MoveSectionDialog;
