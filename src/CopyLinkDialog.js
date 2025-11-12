import Comment from './Comment';
import DivLabelWidget from './DivLabelWidget';
import cd from './loader/cd';
import CdError from './shared/CdError';
import { createCopyTextControl, es6ClassToOoJsClass } from './utils-oojs';
import { mergeJquery, wrapHtml } from './utils-window';

/**
 * @typedef {object} CopyLinkDialogContent
 * @property {object} copyMessages
 * @property {string} copyMessages.success
 * @property {string} copyMessages.fail
 * @property {string | undefined} fragment
 * @property {string} wikilink
 * @property {string} currentPageWikilink
 * @property {string} permanentWikilink
 * @property {string} link
 * @property {string} permanentLink
 * @property {string} jsCall
 * @property {string} jsBreakpoint
 * @property {string | undefined} jsBreakpointTimestamp
 */

/**
 * Class used to create a "Copy link" dialog.
 *
 * @augments OO.ui.MessageDialog
 * @template {import('./Comment').default|import('./Section').default} T
 */
class CopyLinkDialog extends OO.ui.MessageDialog {
  // @ts-expect-error: https://phabricator.wikimedia.org/T358416
  static name = 'copyLinkDialog';
  static actions = [
    {
      label: cd.s('cld-close'),
      action: 'close',
    },
  ];

  /** @type {DivLabelWidget} */
  message;

  /** @type {OO.ui.ButtonOptionWidget | undefined} */
  anchorOption;

  /** @type {OO.ui.ButtonOptionWidget | undefined} */
  diffOption;

  /** @type {OO.ui.ButtonSelectWidget | undefined} */
  linkTypeSelect;

  /** @type {OO.ui.PanelLayout} */
  anchorPanel;

  /** @type {OO.ui.StackLayout} */
  contentStack;

  /**
   * @typedef {{
   *   standard: 'copyText';
   *   short: 'copyText';
   *   wikilink: 'copyText';
   *   currentPageWikilink: 'copyText';
   *   permanentWikilink: 'copyText';
   *   link: 'copyText';
   *   permanentLink: 'copyText';
   *   jsCall: 'copyText' | undefined;
   *   jsBreakpoint: 'copyText' | undefined;
   *   jsBreakpointTimestamp: 'copyText' | undefined;
   * }} CopyLinkDialogControlTypes
   */

  controls = /** @type {ControlTypesByName<CopyLinkDialogControlTypes>} */ ({});

  /**
   * Create a "Copy link" dialog.
   *
   * @param {T} object
   * @param {CopyLinkDialogContent} content
   */
  constructor(object, content) {
    super({
      classes: ['cd-dialog-copyLink'],
    });
    this.object = object;
    this.content = content;
    this.readyDeferred = $.Deferred();
  }

  /**
   * Check if the dialog is for a comment.
   *
   * @returns {this is CopyLinkDialog<import('./Comment').default>}
   */
  isComment() {
    return this.object.TYPE === 'comment';
  }

  /**
   * OOUI native method that initializes window contents.
   *
   * @override
   * @returns {this}
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.MessageDialog.html#initialize
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   * @ignore
   */
  initialize() {
    super.initialize();

    // By default, the whole message is wrapped in a <label> element. We don't want that behavior
    // and revert it.
    this.message.$element.remove();
    this.message = new DivLabelWidget({ classes: ['oo-ui-messageDialog-message'] });
    this.text.$element.append(this.message.$element);

    if (this.isComment()) {
      this.anchorOption = new OO.ui.ButtonOptionWidget({
        data: 'anchor',
        label: cd.s('cld-select-anchor'),
        selected: true,
      });
      this.diffOption = new OO.ui.ButtonOptionWidget({
        data: 'diff',
        label: cd.s('cld-select-diff'),
        disabled: true,
        title: cd.s('loading-ellipsis'),
        classes: ['cd-dialog-copyLink-diffButton'],
      });
      this.linkTypeSelect = new OO.ui.ButtonSelectWidget({
        items: [this.anchorOption, this.diffOption],
        classes: ['cd-dialog-copyLink-linkTypeSelect'],
      });
      this.linkTypeSelect.on('choose', (item) => {
        this.contentStack.setItem(
          item === this.anchorOption
            ? this.anchorPanel
            : /** @type {OO.ui.PanelLayout} */ (this.diffPanel)
        );
        this.updateSize();
      });
    }

    this.anchorPanel = new OO.ui.PanelLayout({
      $content: this.createAnchorPanelContent(),
      padded: false,
      expanded: false,
      scrollable: true,
    });
    this.contentStack = new OO.ui.StackLayout({
      items: [this.anchorPanel],
      expanded: false,
    });

    if (this.isComment()) {
      this.createDiffPanel();
    }

    return this;
  }

  /**
   * OOUI native method that returns a "setup" process which is used to set up a window for use in a
   * particular context, based on the `data` argument.
   *
   * @override
   * @param {object} [data] Dialog opening data
   * @returns {OO.ui.Process}
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.Dialog.html#getSetupProcess
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   * @ignore
   */
  getSetupProcess(data) {
    return super.getSetupProcess(data).next(() => {
      this.title.setLabel(cd.s(this.isComment() ? 'cld-title-comment' : 'cld-title-section'));
      this.message.setLabel(
        mergeJquery(
          this.linkTypeSelect?.$element,
          this.contentStack.$element,
        )
      );
      this.size = this.isComment() ? 'larger' : 'large';
      this.contentStack.setItem(this.anchorPanel);
    });
  }

  /**
   * OOUI native method that returns a "ready" process which is used to ready a window for use in a
   * particular context, based on the `data` argument.
   *
   * @override
   * @param {object} data Window opening data
   * @returns {OO.ui.Process}
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getReadyProcess
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   * @ignore
   */
  getReadyProcess(data) {
    return super.getReadyProcess(data).next(() => {
      this.readyDeferred.resolve();
    });
  }

  /**
   * Callback for copying text.
   *
   * @param {boolean} successful
   * @param {OO.ui.TextInputWidget} input
   * @protected
   */
  copyCallback = (successful, input) => {
    if (successful) {
      mw.notify(this.content.copyMessages.success);
    } else {
      mw.notify(this.content.copyMessages.fail, { type: 'error' });
    }

    // Make external tools that react to text selection quiet
    input.selectRange(0);

    this.close();
  };

  /**
   * @typedef {object} DiffPanelContent
   * @property {string} diffStandard
   * @property {string} diffShort
   * @property {string} diffWikilink
   * @property {JQuery} $diffView
   */

  /**
   * Create the "Diff" panel in the dialog.
   *
   * @protected
   * @throws {CdError}
   */
  async createDiffPanel() {
    if (this.isClosing() || !(this.object instanceof Comment)) {
      throw new CdError();
    }

    let errorText;
    try {
      /** @type {DiffPanelContent} */
      const diffPanelContent = {
        diffStandard: await this.object.getDiffLink('standard'),
        diffShort: await this.object.getDiffLink('short'),
        diffWikilink: await this.object.getDiffLink('wikilink'),
        $diffView: await this.object.generateDiffView(),
      };

      await mw.loader.using(['mediawiki.diff', 'mediawiki.diff.styles']);

      this.diffPanel = new OO.ui.PanelLayout({
        $content: this.createDiffPanelContent(diffPanelContent),
        padded: false,
        expanded: false,
        scrollable: true,
      });
      this.contentStack.addItems([this.diffPanel]);
      this.readyDeferred.then(() => {
        mw.hook('wikipage.content').fire(diffPanelContent.$diffView);
      });
    } catch (error) {
      if (error instanceof CdError) {
        errorText = cd.s(
          error.getType() === 'network' ? 'cld-diff-error-network' : 'cld-diff-error'
        );
      } else {
        errorText = cd.s('cld-diff-error-unknown');
        console.warn(error);
      }
    }

    /** @type {NonNullable<typeof this.diffOption>} */ (this.diffOption).setDisabled(Boolean(errorText));
    /** @type {NonNullable<typeof this.diffOption>} */ (this.diffOption).setTitle(errorText || '');
  }

  /**
   * Create the content of the "Anchor" panel in the dialog.
   *
   * @returns {JQuery}
   * @protected
   */
  createAnchorPanelContent() {
    // Doesn't apply to DT IDs.
    let helpOnlyCd;
    let helpNotOnlyCd;
    if (this.isComment() && this.content.fragment === this.object.id) {
      helpOnlyCd = cd.s('cld-help-onlycd');
      helpNotOnlyCd = wrapHtml(cd.sParse('cld-help-notonlycd'));
    }

    const copyCallback = this.copyCallback;

    this.controls.wikilink = createCopyTextControl({
      value: this.content.wikilink,
      disabled: !this.content.wikilink,
      label: cd.s('cld-wikilink'),
      copyCallback,
      help: helpOnlyCd,
    });

    this.controls.currentPageWikilink = createCopyTextControl({
      value: this.content.currentPageWikilink,
      label: cd.s('cld-currentpagewikilink'),
      copyCallback,
      help: helpNotOnlyCd,
    });

    this.controls.permanentWikilink = createCopyTextControl({
      value: this.content.permanentWikilink,
      label: cd.s('cld-permanentwikilink'),
      copyCallback,
      help: helpOnlyCd,
    });

    this.controls.link = createCopyTextControl({
      value: this.content.link,
      label: cd.s('cld-link'),
      copyCallback,
      help: helpOnlyCd,
    });

    this.controls.permanentLink = createCopyTextControl({
      value: this.content.permanentLink,
      label: cd.s('cld-permanentlink'),
      copyCallback,
      help: helpOnlyCd,
    });

    if (cd.g.debug) {
      this.controls.jsCall = createCopyTextControl({
        value: this.content.jsCall,
        label: 'JS call',
        copyCallback,
      });

      this.controls.jsBreakpoint = createCopyTextControl({
        value: this.content.jsBreakpoint,
        label: 'JS conditional breakpoint',
        copyCallback,
      });

      if (this.content.jsBreakpointTimestamp) {
        this.controls.jsBreakpointTimestamp = createCopyTextControl({
          value: this.content.jsBreakpointTimestamp,
          label: 'JS conditional breakpoint (timestamp)',
          copyCallback,
        });
      }
    }

    return mergeJquery(
      this.controls.wikilink.field.$element,
      this.controls.currentPageWikilink.field.$element,
      this.controls.permanentWikilink.field.$element,
      this.controls.link.field.$element,
      this.controls.permanentLink.field.$element,
      this.controls.jsCall?.field.$element,
      this.controls.jsBreakpoint?.field.$element,
      this.controls.jsBreakpointTimestamp?.field.$element,
    );
  }

  /**
   * Create the content of the "Diff" panel in the dialog.
   *
   * @param {DiffPanelContent} diffPanelContent
   * @returns {JQuery}
   * @protected
   */
  createDiffPanelContent(diffPanelContent) {
    const copyCallback = this.copyCallback;

    this.controls.standard = createCopyTextControl({
      value: diffPanelContent.diffStandard,
      disabled: !diffPanelContent.diffStandard,
      label: cd.s('cld-diff'),
      copyCallback,
    });

    this.controls.short = createCopyTextControl({
      value: diffPanelContent.diffShort,
      disabled: !diffPanelContent.diffShort,
      label: cd.s('cld-shortdiff'),
      copyCallback,
    });

    this.controls.wikilink = createCopyTextControl({
      value: diffPanelContent.diffWikilink,
      disabled: !diffPanelContent.diffWikilink,
      label: cd.s('cld-diffwikilink'),
      copyCallback,
    });

    return mergeJquery(
      this.controls.standard.field.$element,
      this.controls.short.field.$element,
      this.controls.wikilink.field.$element,
      diffPanelContent.$diffView,
    );
  }
}

es6ClassToOoJsClass(CopyLinkDialog);

export default CopyLinkDialog;
