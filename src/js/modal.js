/**
 * Simple modal dialogs.
 *
 * @module modal
 */

import Comment from './Comment';
import cd from './cd';
import controller from './controller';
import settings from './settings';
import { copyText } from './util';

/**
 * Show a settings dialog.
 *
 * @param {string} [initalPageName]
 */
export async function showSettingsDialog(initalPageName) {
  if ($('.cd-dialog-settings').length) return;

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
  if (controller.isPageOverlayOn()) return;

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
export function showCopyLinkDialog(object, e) {
  const fragment = object.getWikilinkFragment();
  const permalinkSpecialPageName = (
    mw.config.get('wgFormattedNamespaces')[-1] +
    ':' +
    cd.g.SPECIAL_PAGE_ALIASES.Permalink +
    '/' +
    mw.config.get('wgRevisionId')
  );
  const content = {
    fragment,
    wikilink: `[[${cd.page.name}#${fragment}]]`,
    currentPageWikilink: `[[#${fragment}]]`,
    permanentWikilink: `[[${permalinkSpecialPageName}#${fragment}]]`,
    link: object.getUrl(),
    permanentLink: object.getUrl(true),
    copyMessages: {
      success: cd.s('copylink-copied'),
      fail: cd.s('copylink-error'),
    },
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
    return;
  }

  const CopyLinkDialog = require('./CopyLinkDialog').default;

  const dialog = new CopyLinkDialog(object, content);
  controller.getWindowManager().addWindows([dialog]);
  controller.getWindowManager().openWindow(dialog);
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
