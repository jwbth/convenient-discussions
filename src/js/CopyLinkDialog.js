import CdError from './CdError';
import Comment from './Comment';
import cd from './cd';
import { copyText, dealWithLoadingBug, wrap } from './util';
import { createCopyActionField, tweakUserOoUiClass } from './ooui';

/**
 * Class used to create an "Copy link" dialog.
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
   * Create an "Copy link" dialog.
   *
   * @param {Comment|Section} object
   * @param {object} content
   */
  constructor(object, content) {
    super({
      classes: ['cd-dialog-copyLink'],
    });

    this.object = object;
    this.content = content;
    this.isComment = this.object instanceof Comment;

    this.copyCallback = this.copyCallback.bind(this);
  }

  /**
   * OOUI native method that initializes window contents.
   *
   * @param {...*} [args]
   * @see
   *   https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/OO.ui.MessageDialog-method-initialize
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   */
  initialize(...args) {
    super.initialize(...args);

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
      this.buttonSelectWidget = new OO.ui.ButtonSelectWidget({
        items: [this.anchorOptionWidget, this.diffOptionWidget],
        classes: ['cd-dialog-copyLink-linkTypeSelect'],
      }).on('choose', (item) => {
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
   * @see
   *   https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/OO.ui.Dialog-method-getSetupProcess
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   */
  getSetupProcess(data) {
    return super.getSetupProcess(data).next(() => {
      this.title.setLabel(this.isComment ? cd.s('cld-title-comment') : cd.s('cld-title-section'));
      const $message = $('<div>').append([
        this.buttonSelectWidget?.$element,
        this.stackLayout.$element,
      ]);
      this.message.setLabel($message);
      this.size = this.isComment ? 'larger' : 'large';
      this.stackLayout.setItem(this.anchorPanel);
    });
  }

  /**
   * Callback for clicking of the "Copy" button next to an input field.
   *
   * @param {string} value Input value.
   */
  copyCallback(value) {
    copyText(value, this.content.copyMessages);
    this.close();
  }

  /**
   * Create the "Diff" panel in the dialog.
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

      if (dealWithLoadingBug('mediawiki.diff.styles')) return;

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
   * @returns {JQuery}
   */
  createAnchorPanelContent() {
    // Doesn't apply to DT IDs.
    let helpOnlyCd;
    let helpNotOnlyCd;
    if (this.isComment && this.content.id === this.object.id) {
      helpOnlyCd = cd.s('cld-help-onlycd');
      helpNotOnlyCd = wrap(cd.sParse('cld-help-notonlycd'));
    }

    const wikilinkField = createCopyActionField({
      value: this.content.wikilink,
      disabled: !this.content.wikilink,
      label: cd.s('cld-wikilink'),
      copyCallback: this.copyCallback,
      help: helpOnlyCd,
    });

    const currentPageWikilinkField = createCopyActionField({
      value: this.content.currentPageWikilink,
      label: cd.s('cld-currentpagewikilink'),
      copyCallback: this.copyCallback,
      help: helpNotOnlyCd,
    });

    const linkField = createCopyActionField({
      value: this.content.link,
      label: cd.s('cld-link'),
      copyCallback: this.copyCallback,
      help: helpOnlyCd,
    });

    const permanentLinkField = createCopyActionField({
      value: this.content.permanentLink,
      label: cd.s('cld-permanentlink'),
      copyCallback: this.copyCallback,
      help: helpOnlyCd,
    });

    const $anchorPanelContent = $('<div>').append([
      wikilinkField.$element,
      currentPageWikilinkField.$element,
      linkField.$element,
      permanentLinkField.$element,
    ]);

    // Workaround, because we don't want the first input to be focused on click almost anywhere in
    // the dialog, which happens because the whole message is wrapped in the <label> element.
    $('<input>')
      .addClass('cd-hidden')
      .prependTo($anchorPanelContent.children().first());

    return $anchorPanelContent;
  }

  /**
   * Create the content of the "Diff" panel in the dialog.
   *
   * @returns {JQuery}
   */
  createDiffPanelContent() {
    const standardField = createCopyActionField({
      value: this.content.diffStandard,
      disabled: !this.content.diffStandard,
      label: cd.s('cld-diff'),
      copyCallback: this.copyCallback,
    });

    const shortField = createCopyActionField({
      value: this.content.diffShort,
      disabled: !this.content.diffShort,
      label: cd.s('cld-shortdiff'),
      copyCallback: this.copyCallback,
    });

    const wikilinkField = createCopyActionField({
      value: this.content.diffWikilink,
      disabled: !this.content.diffWikilink,
      label: cd.s('cld-diffwikilink'),
      copyCallback: this.copyCallback,
    });

    return $('<div>').append([
      standardField.$element,
      shortField.$element,
      wikilinkField.$element,
      this.content.$diffView,
    ]);
  }
}

tweakUserOoUiClass(CopyLinkDialog, OO.ui.MessageDialog);

export default CopyLinkDialog;
