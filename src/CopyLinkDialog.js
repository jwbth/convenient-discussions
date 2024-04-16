import CdError from './CdError';
import Comment from './Comment';
import DivLabelWidget from './DivLabelWidget';
import cd from './cd';
import { createCopyTextField, tweakUserOoUiClass } from './utils-oojs';
import { wrapHtml } from './utils-window';

/**
 * Class used to create a "Copy link" dialog.
 *
 * @augments external:OO.ui.MessageDialog
 */
class CopyLinkDialog extends OO.ui.MessageDialog {
  static name = 'copyLinkDialog';
  static actions = [
    {
      label: cd.s('cld-close'),
      action: 'close',
    },
  ];

  /**
   * Create a "Copy link" dialog.
   *
   * @param {Comment|import('./Section').default} object
   * @param {object} content
   */
  constructor(object, content) {
    super({
      classes: ['cd-dialog-copyLink'],
    });

    this.object = object;
    this.content = content;
    this.isComment = this.object instanceof Comment;
  }

  /**
   * OOUI native method that initializes window contents.
   *
   * @param {...*} [args]
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.MessageDialog.html#initialize
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   * @private
   */
  initialize(...args) {
    super.initialize(...args);

    // By default, the whole message is wrapped in a `<label>` element. We don't want that behavior
    // and revert it.
    this.message.$element.remove();
    this.message = new DivLabelWidget({ classes: ['oo-ui-messageDialog-message'] });
    this.text.$element.append(this.message.$element);

    if (this.isComment) {
      this.anchorOptionWidget = new OO.ui.ButtonOptionWidget({
        data: 'anchor',
        label: cd.s('cld-select-anchor'),
        selected: true,
      });
      this.diffOptionWidget = new OO.ui.ButtonOptionWidget({
        data: 'diff',
        label: cd.s('cld-select-diff'),
        disabled: true,
        title: cd.s('loading-ellipsis'),
        classes: ['cd-dialog-copyLink-diffButton'],
      });
      this.buttonSelectWidget = (new OO.ui.ButtonSelectWidget({
        items: [this.anchorOptionWidget, this.diffOptionWidget],
        classes: ['cd-dialog-copyLink-linkTypeSelect'],
      })).on('choose', (item) => {
        const panel = item === this.anchorOptionWidget ? this.anchorPanel : this.diffPanel;
        this.stackLayout.setItem(panel);
        this.updateSize();
      });
    }

    this.anchorPanel = new OO.ui.PanelLayout({
      $content: this.createAnchorPanelContent(),
      padded: false,
      expanded: false,
      scrollable: true,
    });
    this.stackLayout = new OO.ui.StackLayout({
      items: [this.anchorPanel],
      expanded: false,
    });

    if (this.isComment) {
      this.createDiffPanel();
    }
  }

  /**
   * OOUI native method that returns a "setup" process which is used to set up a window for use in a
   * particular context, based on the `data` argument.
   *
   * @param {object} [data] Dialog opening data
   * @returns {external:OO.ui.Process}
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.Window.html#getSetupProcess
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   * @private
   */
  getSetupProcess(data) {
    return super.getSetupProcess(data).next(() => {
      this.title.setLabel(this.isComment ? cd.s('cld-title-comment') : cd.s('cld-title-section'));
      this.message.setLabel(
        $.cdMerge(
          this.buttonSelectWidget?.$element,
          this.stackLayout.$element,
        )
      );
      this.size = this.isComment ? 'larger' : 'large';
      this.stackLayout.setItem(this.anchorPanel);
    });
  }

  /**
   * Callback for copying text.
   *
   * @param {boolean} successful
   * @param {external:OO.ui.CopyTextLayout} field
   * @private
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
   * @private
   */
  async createDiffPanel() {
    let errorText;
    try {
      Object.assign(this.content, {
        diffStandard: await this.object.getDiffLink('standard'),
        diffShort: await this.object.getDiffLink('short'),
        diffWikilink: await this.object.getDiffLink('wikilink'),
        $diffView: await this.object.generateDiffView(),
      });

      mw.hook('wikipage.content').fire(this.content.$diffView);

      await mw.loader.using(['mediawiki.diff', 'mediawiki.diff.styles']);
    } catch (e) {
      if (e instanceof CdError) {
        const { type } = e.data;
        errorText = type === 'network' ?
          cd.s('cld-diff-error-network') :
          cd.s('cld-diff-error');
      } else {
        errorText = cd.s('cld-diff-error-unknown');
        console.warn(e);
      }
    }

    this.diffPanel = new OO.ui.PanelLayout({
      $content: this.createDiffPanelContent(),
      padded: false,
      expanded: false,
      scrollable: true,
    });

    this.stackLayout.addItems([this.diffPanel]);
    this.diffOptionWidget.setDisabled(errorText);
    this.diffOptionWidget.setTitle(errorText || '');
  }

  /**
   * Create the content of the "Anchor" panel in the dialog.
   *
   * @returns {external:jQuery}
   * @private
   */
  createAnchorPanelContent() {
    // Doesn't apply to DT IDs.
    let helpOnlyCd;
    let helpNotOnlyCd;
    if (this.isComment && this.content.fragment === this.object.id) {
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

    return $.cdMerge(
      wikilinkField.$element,
      currentPageWikilinkField.$element,
      permanentWikilinkField.$element,
      linkField.$element,
      permanentLinkField.$element,
    );
  }

  /**
   * Create the content of the "Diff" panel in the dialog.
   *
   * @returns {external:jQuery}
   * @private
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

    return $.cdMerge(
      standardField.$element,
      shortField.$element,
      wikilinkField.$element,
      this.content.$diffView,
    );
  }
}

tweakUserOoUiClass(CopyLinkDialog);

export default CopyLinkDialog;
