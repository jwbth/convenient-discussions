/**
 * Modal dialogs. Move section dialog goes in {@link Section#move}.
 *
 * @module modal
 */

import Comment from './Comment';
import cd from './cd';
import controller from './controller';
import { copyText, dealWithLoadingBug } from './util';
import { encodeWikilink } from './wikitext';
import { isPageOverlayOn, underlinesToSpaces } from './util';

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

  const dialog = new SettingsDialog(initalPageName);
  controller.getWindowManager().addWindows([dialog]);
  controller.getWindowManager().openWindow(dialog);

  cd.tests.settingsDialog = dialog;
}

/**
 * Show an edit subscriptions dialog.
 */
export async function showEditSubscriptionsDialog() {
  if (isPageOverlayOn()) return;

  const EditSubscriptionsDialog = require('./EditSubscriptionsDialog').default;

  const dialog = new EditSubscriptionsDialog();
  controller.getWindowManager().addWindows([dialog]);
  controller.getWindowManager().openWindow(dialog);
}

/**
 * Show a copy link dialog.
 *
 * @param {Comment|Section} object Comment or section to copy a link to.
 * @param {Event} e
 */
export async function showCopyLinkDialog(object, e) {
  if (object.isLinkBeingCopied) return;

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

  const id = object instanceof Comment ?
    object.dtId || object.id :
    encodeWikilink(underlinesToSpaces(object.id));

  const content = {
    id,
    wikilink: `[[${cd.page.name}#${id}]]`,
    currentPageWikilink: `[[#${id}]]`,
    link: object.getUrl(),
    permanentLink: object.getUrl(true),
    copyMessages: {
      success: cd.s('copylink-copied'),
      fail: cd.s('copylink-error'),
    }
  };

  // Undocumented feature allowing to copy a link of a default type without opening a dialog.
  const relevantSetting = object instanceof Comment ?
    settings.get('defaultCommentLinkType') :
    settings.get('defaultSectionLinkType');
  if (!e.shiftKey && relevantSetting) {
    switch (relevantSetting) {
      case 'wikilink':
        copyText(content.wikilink, content.copyMessages);
        break;
      case 'link':
        copyText(content.link, content.copyMessages);
        break;
    }
    object.isLinkBeingCopied = false;
    return;
  }

  const CopyLinkDialog = require('./CopyLinkDialog').default;

  const dialog = new CopyLinkDialog(object, content);
  controller.getWindowManager().addWindows([dialog]);
  const windowInstance = controller.getWindowManager().openWindow(dialog);
  windowInstance.closed.then(() => {
    object.isLinkBeingCopied = false;
  });
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
  controller.getWindowManager().addWindows([dialog]);
  controller.getWindowManager().openWindow(dialog, {
    message: field.$element,
    actions: [
      {
        label: cd.s('rd-close'),
        action: 'close',
      },
    ],
    size: 'large',
  });
}
