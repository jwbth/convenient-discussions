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
 */
export async function showSettingsDialog() {
  if (isPageOverlayOn() || dealWithLoadingBug('mediawiki.widgets.UsersMultiselectWidget')) return;

  const SettingsDialog = require('./SettingsDialog').default;

  createWindowManager();
  const dialog = new SettingsDialog();
  cd.g.windowManager.addWindows([dialog]);
  cd.g.windowManager.openWindow(dialog);

  // For testing purposes
  cd.g.settingsDialog = dialog;
}

/**
 * Show an edit watched sections dialog.
 */
export async function editWatchedSections() {
  if (isPageOverlayOn()) return;

  const EditWatchedSectionsDialog = require('./EditWatchedSectionsDialog').default;

  createWindowManager();
  const dialog = new EditWatchedSectionsDialog();
  cd.g.windowManager.addWindows([dialog]);
  cd.g.windowManager.openWindow(dialog);
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
  const anchor = encodeWikilink(isComment ? object.anchor : underlinesToSpaces(object.anchor));
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

  const copyCallback = (value) => {
    copyLink(value);
    dialog.close();
  };
  let diffField;
  let shortDiffField;
  let $diff;
  let diffLink;
  let shortDiffLink;
  let $historyLinkBlock;
  if (isComment) {
    let errorText;
    try {
      diffLink = await object.getDiffLink();
      shortDiffLink = await object.getDiffLink(true);
      $diff = await object.generateDiffView();
    } catch (e) {
      if (e instanceof CdError) {
        const { type } = e.data;
        if (type === 'network') {
          errorText = cd.s('cld-diff-error-network');
        } else {
          errorText = cd.s('cld-diff-error');
          const $historyLink = $('<a>')
            .attr('href', object.getSourcePage().getUrl({ action: 'history' }))
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

    diffField = createCopyActionField({
      value: diffLink || errorText,
      disabled: !diffLink,
      label: cd.s('cld-diff'),
      copyCallback,
    });

    shortDiffField = createCopyActionField({
      value: shortDiffLink || errorText,
      disabled: !shortDiffLink,
      label: cd.s('cld-shortdiff'),
      copyCallback,
    });

    if (dealWithLoadingBug('mediawiki.diff.styles')) {
      object.isLinkBeingCopied = false;
      return;
    }

    await mw.loader.using('mediawiki.diff.styles');
  }

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
      case 'diff':
        copyLink(diffLink);
        break;
    }
    object.isLinkBeingCopied = false;
    return;
  }

  let helpOnlyCd;
  let helpNotOnlyCd;
  if (isComment) {
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

  const $message = $('<div>').append([
    diffField?.$element,
    shortDiffField?.$element,
    $diff,
    $historyLinkBlock,
    wikilinkField.$element,
    currentPageWikilinkField.$element,
    linkField.$element,
    permanentLinkField.$element,
  ]);
  $message.children().first().prepend($dummyInput);

  const dialog = new OO.ui.MessageDialog({
    classes: ['cd-copyLinkDialog'],
  });
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
