/**
 * Modal dialogs. Move section dialog goes in {@link Section#move}.
 *
 * @module modal
 */

import CdError from './CdError';
import Comment from './Comment';
import cd from './cd';
import { createCopyActionField, createWindowManager } from './ooui';
import { dealWithLoadingBug } from './util';
import { encodeWikilink } from './wikitext';
import { isPageOverlayOn, underlinesToSpaces, wrap } from './util';

/**
 * Show a settings dialog.
 *
 * @param {string} [initalPageName]
 */
export async function showSettingsDialog(initalPageName) {
  if (
    $('.cd-settingsDialog').length ||
    dealWithLoadingBug('mediawiki.widgets.UsersMultiselectWidget')
  ) {
    return;
  }

  const SettingsDialog = require('./SettingsDialog').default;

  createWindowManager();
  const dialog = new SettingsDialog(initalPageName);
  cd.g.windowManager.addWindows([dialog]);
  cd.g.windowManager.openWindow(dialog);

  // For testing purposes
  cd.g.settingsDialog = dialog;
}

/**
 * Show an edit subscriptions dialog.
 */
export async function editSubscriptions() {
  if (isPageOverlayOn()) return;

  const EditSubscriptionsDialog = require('./EditSubscriptionsDialog').default;

  createWindowManager();
  const dialog = new EditSubscriptionsDialog();
  cd.g.windowManager.addWindows([dialog]);
  cd.g.windowManager.openWindow(dialog);
}

async function createDiffPanel(comment, dialog) {
  let $diff;
  let diffLink;
  let shortDiffLink;
  let diffWikilink;
  let $historyLinkBlock;
  let errorText;
  try {
    diffLink = await comment.getDiffLink('standard');
    shortDiffLink = await comment.getDiffLink('short');
    diffWikilink = await comment.getDiffLink('wikilink');
    $diff = await comment.generateDiffView();
  } catch (e) {
    if (e instanceof CdError) {
      const { type } = e.data;
      if (type === 'network') {
        errorText = cd.s('cld-diff-error-network');
      } else {
        errorText = cd.s('cld-diff-error');
        const $historyLink = $('<a>')
          .attr('href', comment.getSourcePage().getUrl({ action: 'history' }))
          .attr('target', '_blank')
          .text(cd.s('cld-diff-history'));
        $historyLinkBlock = $('<div>')
          .addClass('cd-copyLinkDialog-historyLinkBlock')
          .append($historyLink);
      }
    } else {
      errorText = cd.s('cld-diff-error-unknown');
      console.warn(e);
    }
  }

  const copyCallback = (value) => {
    copyLink(value);
    dialog.close();
  };

  const diffField = createCopyActionField({
    value: diffLink,
    disabled: !diffLink,
    label: cd.s('cld-diff'),
    copyCallback,
  });

  const shortDiffField = createCopyActionField({
    value: shortDiffLink,
    disabled: !shortDiffLink,
    label: cd.s('cld-shortdiff'),
    copyCallback,
  });

  const diffWikilinkField = createCopyActionField({
    value: diffWikilink,
    disabled: !diffWikilink,
    label: cd.s('cld-diffwikilink'),
    copyCallback,
  });

  const $diffPanelContent = $('<div>').append([
    diffField.$element,
    shortDiffField.$element,
    diffWikilinkField.$element,
    $diff,
    $historyLinkBlock,
  ]);

  dialog.diffPanel = new OO.ui.PanelLayout({
    $content: $diffPanelContent,
    padded: false,
    expanded: false,
    scrollable: true,
  });

  if (dealWithLoadingBug('mediawiki.diff.styles')) return;

  await mw.loader.using(['mediawiki.diff', 'mediawiki.diff.styles']);

  dialog.stackLayout.addItems([dialog.diffPanel]);
  dialog.diffOptionWidget.setDisabled(Boolean(errorText));
  dialog.diffOptionWidget.setTitle(errorText || '');
}

/**
 * Copy a link and notify whether the operation was successful.
 *
 * @param {string} text Text to copy.
 * @private
 */
function copyLink(text) {
  const $textarea = $('<textarea>')
    .val(text)
    .appendTo(document.body)
    .select();
  const successful = document.execCommand('copy');
  $textarea.remove();

  if (text && successful) {
    mw.notify(cd.s('copylink-copied'));
  } else {
    mw.notify(cd.s('copylink-error'), { type: 'error' });
  }
}

/**
 * Show a copy link dialog.
 *
 * @param {Comment|Section} object Comment or section to copy a link to.
 * @param {Event} e
 */
export async function showCopyLinkDialog(object, e) {
  if (object.isLinkBeingCopied) return;

  const isComment = object instanceof Comment;
  const anchor = isComment ?
    object.dtId || object.anchor :
    encodeWikilink(underlinesToSpaces(object.anchor));

  const wikilink = `[[${cd.page.name}#${anchor}]]`;
  const link = object.getUrl();
  const permanentLink = object.getUrl(true);

  /**
   * Is a link to the comment being copied right now (a copy link dialog is opened or a request is
   * being made to get the diff).
   *
   * @name isLinkBeingCopied
   * @type {boolean}
   * @memberof Comment
   * @instance
   */

  /**
   * Is a link to the section being copied right now (a copy link dialog is opened).
   *
   * @name isLinkBeingCopied
   * @type {boolean}
   * @memberof Section
   * @instance
   */
  object.isLinkBeingCopied = true;

  // Undocumented feature allowing to copy a link of a default type without opening a dialog.
  const relevantSetting = isComment ?
    cd.settings.defaultCommentLinkType :
    cd.settings.defaultSectionLinkType;
  if (!e.shiftKey && relevantSetting) {
    switch (relevantSetting) {
      case 'wikilink':
        copyLink(wikilink);
        break;
      case 'link':
        copyLink(link);
        break;
    }
    object.isLinkBeingCopied = false;
    return;
  }

  const dialog = new OO.ui.MessageDialog({
    classes: ['cd-copyLinkDialog'],
  });

  if (isComment) {
    dialog.anchorOptionWidget = new OO.ui.ButtonOptionWidget({
      data: 'anchor',
      label: cd.s('cld-select-anchor'),
      selected: true,
    });
    dialog.diffOptionWidget = new OO.ui.ButtonOptionWidget({
      data: 'diff',
      label: cd.s('cld-select-diff'),
      disabled: true,
      title: cd.s('loading-ellipsis'),
      classes: ['cd-copyLinkDialog-diffButton'],
    });
    dialog.buttonSelectWidget = new OO.ui.ButtonSelectWidget({
      items: [dialog.anchorOptionWidget, dialog.diffOptionWidget],
      classes: ['cd-copyLinkDialog-linkTypeSelect'],
    }).on('choose', (item) => {
      const panel = item === dialog.anchorOptionWidget ? dialog.anchorPanel : dialog.diffPanel;
      dialog.stackLayout.setItem(panel);
      dialog.updateSize();
    });
  }

  const copyCallback = (value) => {
    copyLink(value);
    dialog.close();
  };

  // Doesn't apply to DT anchors.
  let helpOnlyCd;
  let helpNotOnlyCd;
  if (isComment && anchor === object.anchor) {
    helpOnlyCd = cd.s('cld-help-onlycd');
    helpNotOnlyCd = wrap(cd.sParse('cld-help-notonlycd'));
  }

  const wikilinkField = createCopyActionField({
    value: wikilink,
    disabled: !wikilink,
    label: cd.s('cld-wikilink'),
    copyCallback,
    help: helpOnlyCd,
  });

  const currentPageWikilinkField = createCopyActionField({
    value: `[[#${anchor}]]`,
    label: cd.s('cld-currentpagewikilink'),
    copyCallback,
    help: helpNotOnlyCd,
  });

  const linkField = createCopyActionField({
    value: link,
    label: cd.s('cld-link'),
    copyCallback,
    help: helpOnlyCd,
  });

  const permanentLinkField = createCopyActionField({
    value: permanentLink,
    label: cd.s('cld-permanentlink'),
    copyCallback,
    help: helpOnlyCd,
  });

  // Workaround, because we don't want the first input to be focused on click almost anywhere in
  // the dialog, which happens because the whole message is wrapped in the <label> element.
  const $dummyInput = $('<input>').addClass('cd-hidden');

  const $anchorPanelContent = $('<div>').append([
    wikilinkField.$element,
    currentPageWikilinkField.$element,
    linkField.$element,
    permanentLinkField.$element,
  ]);
  $anchorPanelContent.children().first().prepend($dummyInput);

  dialog.anchorPanel = new OO.ui.PanelLayout({
    $content: $anchorPanelContent,
    padded: false,
    expanded: false,
    scrollable: true,
  });

  dialog.stackLayout = new OO.ui.StackLayout({
		items: [dialog.anchorPanel],
    expanded: false,
	});

  const $message = $('<div>').append([
    dialog.buttonSelectWidget?.$element,
    dialog.stackLayout.$element,
  ]);
  cd.g.windowManager.addWindows([dialog]);
  const windowInstance = cd.g.windowManager.openWindow(dialog, {
    title: isComment ? cd.s('cld-title-comment') : cd.s('cld-title-section'),
    message: $message,
    actions: [
      {
        label: cd.s('cld-close'),
        action: 'close',
      },
    ],
    size: isComment ? 'larger' : 'large',
  });
  windowInstance.closed.then(() => {
    object.isLinkBeingCopied = false;
  });

  if (isComment) {
    createDiffPanel(object, dialog);
  }
}

/**
 * _For internal use._ Show a modal with content of comment forms that we were unable to restore to
 * the page (because their target comments/sections disappeared, for example).
 *
 * @param {object[]} content
 * @param {string} [content[].headline]
 * @param {string} content[].comment
 * @param {string} content[].summary
 */
export function rescueCommentFormsContent(content) {
  const text = content
    .map((data) => {
      let text = data.headline !== undefined ?
        `${cd.s('rd-headline')}: ${data.headline}\n\n` :
        '';
      text += `${cd.s('rd-comment')}: ${data.comment}\n\n${cd.s('rd-summary')}: ${data.summary}`;
      return text;
    })
    .join('\n\n----\n');

  const input = new OO.ui.MultilineTextInputWidget({
    value: text,
    rows: 20,
  });
  const field = new OO.ui.FieldLayout(input, {
    align: 'top',
    label: cd.s('rd-intro'),
  });

  const dialog = new OO.ui.MessageDialog();
  cd.g.windowManager.addWindows([dialog]);
  cd.g.windowManager.openWindow(dialog, {
    message: field.$element,
    actions: [
      { label: cd.s('rd-close'), action: 'close' },
    ],
    size: 'large',
  });
}
