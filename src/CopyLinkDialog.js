import CdError from './CdError';
import DivLabelWidget from './DivLabelWidget';
import cd from './cd';
import { createCopyTextField, es6ClassToOoJsClass } from './utils-oojs';
import { mergeJquery, wrapHtml } from './utils-window';

/**
 * Class used to create a "Copy link" dialog.
 *
 * @augments OO.ui.MessageDialog
 * @template {import('./Comment').default|import('./Section').default} T
 */
class CopyLinkDialog extends OO.ui.MessageDialog {
  // @ts-ignore: https://phabricator.wikimedia.org/T358416
  static name = 'copyLinkDialog';
  static actions = [
    {
      label: cd.s('cld-close'),
      action: 'close',
    },
  ];

  /** @type {DivLabelWidget} */
  message;

  /** @type {OO.ui.ButtonOptionWidget} */
  anchorOption;

  /** @type {OO.ui.ButtonOptionWidget} */
  diffOption;

  /** @type {OO.ui.ButtonSelectWidget} */
  linkTypeSelect;

  /** @type {OO.ui.PanelLayout} */
  anchorPanel;

  /** @type {OO.ui.StackLayout} */
  contentStack;

  /** @type {ControlsByName} */
  controls;

  /**
   * Create a "Copy link" dialog.
   *
   * @param {T} object
   * @param {object} content
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

    this.controls = /** @type {ControlsByName} */ ({});
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
   * @param {object} [data] Dialog opening data
   * @returns {OO.ui.Process}
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.Dialog.html#getSetupProcess
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   * @ignore
   */
  getSetupProcess(data) {
    return super.getSetupProcess(data).next(() => {
      this.title.setLabel(this.isComment() ? cd.s('cld-title-comment') : cd.s('cld-title-section'));
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
   * @param {OO.ui.CopyTextLayout} field
   * @protected
   */
  async copyCallback(successful, field) {
    if (successful) {
      mw.notify(this.content.copyMessages.success);
    } else {
      mw.notify(this.content.copyMessages.fail, { type: 'error' });
    }

    // Make external tools that react to text selection quiet
    field.textInput.selectRange(0);

    this.close();
  }

  /**
   * Create the "Diff" panel in the dialog.
   *
   * @protected
   * @throws {CdError}
   */
  async createDiffPanel() {
    if (!this.isClosing() || !this.object.isComment()) {
      throw new CdError();
    }

    let errorText;
    try {
      this.diffStandard = await this.object.getDiffLink('standard');
      this.diffShort = await this.object.getDiffLink('short');
      this.diffWikilink = await this.object.getDiffLink('wikilink');
      this.$diffView = await this.object.generateDiffView();

      await mw.loader.using(['mediawiki.diff', 'mediawiki.diff.styles']);

      this.diffPanel = new OO.ui.PanelLayout({
        $content: this.createDiffPanelContent(),
        padded: false,
        expanded: false,
        scrollable: true,
      });
      this.contentStack.addItems([this.diffPanel]);
      this.readyDeferred.then(() => {
        mw.hook('wikipage.content').fire(this.content.$diffView);
      });
    } catch (error) {
      if (error instanceof CdError) {
        const { type } = error.data;
        errorText = type === 'network' ?
          cd.s('cld-diff-error-network') :
          cd.s('cld-diff-error');
      } else {
        errorText = cd.s('cld-diff-error-unknown');
        console.warn(error);
      }
    }

    this.diffOption.setDisabled(Boolean(errorText));
    this.diffOption.setTitle(errorText || '');
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

    const copyCallback = this.copyCallback.bind(this);

    this.controls.wikilink = createCopyTextField({
      value: this.content.wikilink,
      disabled: !this.content.wikilink,
      label: cd.s('cld-wikilink'),
      copyCallback,
      help: helpOnlyCd,
    });

    this.controls.currentPageWikilink = createCopyTextField({
      value: this.content.currentPageWikilink,
      label: cd.s('cld-currentpagewikilink'),
      copyCallback,
      help: helpNotOnlyCd,
    });

    this.controls.permanentWikilink = createCopyTextField({
      value: this.content.permanentWikilink,
      label: cd.s('cld-permanentwikilink'),
      copyCallback,
      help: helpOnlyCd,
    });

    this.controls.link = createCopyTextField({
      value: this.content.link,
      label: cd.s('cld-link'),
      copyCallback,
      help: helpOnlyCd,
    });

    this.controls.permanentLink = createCopyTextField({
      value: this.content.permanentLink,
      label: cd.s('cld-permanentlink'),
      copyCallback,
      help: helpOnlyCd,
    });

    if (cd.g.debug) {
      this.controls.jsCall = createCopyTextField({
        value: this.content.jsCall,
        label: 'JS call',
        copyCallback,
      });

      this.controls.jsBreakpoint = createCopyTextField({
        value: this.content.jsBreakpoint,
        label: 'JS conditional breakpoint',
        copyCallback,
      });

      if (this.isComment()) {
        this.controls.jsBreakpointTimestamp = createCopyTextField({
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
   * @returns {JQuery}
   * @protected
   */
  createDiffPanelContent() {
    const copyCallback = this.copyCallback.bind(this);

    this.standard = createCopyTextField({
      value: this.content.diffStandard,
      disabled: !this.content.diffStandard,
      label: cd.s('cld-diff'),
      copyCallback,
    });

    this.short = createCopyTextField({
      value: this.content.diffShort,
      disabled: !this.content.diffShort,
      label: cd.s('cld-shortdiff'),
      copyCallback,
    });

    this.wikilink = createCopyTextField({
      value: this.content.diffWikilink,
      disabled: !this.content.diffWikilink,
      label: cd.s('cld-diffwikilink'),
      copyCallback,
    });

    return mergeJquery(
      this.controls.standard.field.$element,
      this.controls.short.field.$element,
      this.controls.wikilink.field.$element,
      this.content.$diffView,
    );
  }
}

es6ClassToOoJsClass(CopyLinkDialog);

export default CopyLinkDialog;
