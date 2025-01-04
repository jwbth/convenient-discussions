import CdError from './CdError';
import DivLabelWidget from './DivLabelWidget';
import cd from './cd';
import { createCopyTextField, tweakUserOoUiClass } from './utils-oojs';
import { mergeJquery, wrapHtml } from './utils-window';

/**
 * Class used to create a "Copy link" dialog.
 *
 * @augments OO.ui.MessageDialog
 * @template {'comment' | 'section'} T
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

  /**
   * @typedef {T extends 'comment' ? import('./Comment').default : import('./Section').default} CommentOrSection
   */

  /**
   * Create a "Copy link" dialog.
   *
   * @param {CommentOrSection} object
   * @param {object} content
   * @param {T} type
   */
  constructor(object, content, type) {
    super({
      classes: ['cd-dialog-copyLink'],
    });

    /** @type {CommentOrSection} */
    this.object = object;
    this.content = content;

    this.readyDeferred = $.Deferred();
  }

  /**
   * Check if the dialog is for a comment.
   *
   * @returns {this is CopyLinkDialog<'comment'>}
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
        this.contentStack.setItem(item === this.anchorOption ? this.anchorPanel : this.diffPanel);
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

    const wikilinkField = createCopyTextField({
      value: this.content.wikilink,
      disabled: !this.content.wikilink,
      label: cd.s('cld-wikilink'),
      copyCallback,
      help: helpOnlyCd,
    });

    const currentPageWikilinkField = createCopyTextField({
      value: this.content.currentPageWikilink,
      label: cd.s('cld-currentpagewikilink'),
      copyCallback,
      help: helpNotOnlyCd,
    });

    const permanentWikilinkField = createCopyTextField({
      value: this.content.permanentWikilink,
      label: cd.s('cld-permanentwikilink'),
      copyCallback,
      help: helpOnlyCd,
    });

    const linkField = createCopyTextField({
      value: this.content.link,
      label: cd.s('cld-link'),
      copyCallback,
      help: helpOnlyCd,
    });

    const permanentLinkField = createCopyTextField({
      value: this.content.permanentLink,
      label: cd.s('cld-permanentlink'),
      copyCallback,
      help: helpOnlyCd,
    });

    let jsCall;
    let jsBreakpoint;
    let jsBreakpointTimestamp;
    if (cd.g.debug) {
      jsCall = createCopyTextField({
        value: this.content.jsCall,
        label: 'JS call',
        copyCallback,
      });

      jsBreakpoint = createCopyTextField({
        value: this.content.jsBreakpoint,
        label: 'JS conditional breakpoint',
        copyCallback,
      });

      if (this.isComment()) {
        jsBreakpointTimestamp = createCopyTextField({
          value: this.content.jsBreakpointTimestamp,
          label: 'JS conditional breakpoint (timestamp)',
          copyCallback,
        });
      }
    }

    return mergeJquery(
      wikilinkField.$element,
      currentPageWikilinkField.$element,
      permanentWikilinkField.$element,
      linkField.$element,
      permanentLinkField.$element,
      jsCall?.$element,
      jsBreakpoint?.$element,
      jsBreakpointTimestamp?.$element,
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

    const standardField = createCopyTextField({
      value: this.content.diffStandard,
      disabled: !this.content.diffStandard,
      label: cd.s('cld-diff'),
      copyCallback,
    });

    const shortField = createCopyTextField({
      value: this.content.diffShort,
      disabled: !this.content.diffShort,
      label: cd.s('cld-shortdiff'),
      copyCallback,
    });

    const wikilinkField = createCopyTextField({
      value: this.content.diffWikilink,
      disabled: !this.content.diffWikilink,
      label: cd.s('cld-diffwikilink'),
      copyCallback,
    });

    return mergeJquery(
      standardField.$element,
      shortField.$element,
      wikilinkField.$element,
      this.content.$diffView,
    );
  }
}

tweakUserOoUiClass(CopyLinkDialog);

export default CopyLinkDialog;
