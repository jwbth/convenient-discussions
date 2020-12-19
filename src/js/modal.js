/**
 * Modal dialogs. Move section dialog goes in {@link module:Section#move}.
 *
 * @module modal
 */

import CdError from './CdError';
import Comment from './Comment';
import cd from './cd';
import { addPreventUnloadCondition, removePreventUnloadCondition } from './eventHandlers';
import { areObjectsEqual, dealWithLoadingBug, defined, spacesToUnderlines, unique } from './util';
import { checkboxField, radioField } from './ooui';
import { encodeWikilink } from './wikitext';
import { getPageIds, getPageTitles, setGlobalOption, setLocalOption } from './apiWrappers';
import { getSettings, getWatchedSections, setSettings, setWatchedSections } from './options';
import { hideText, underlinesToSpaces, unhideText } from './util';

/**
 * Create an OOUI window manager. It is supposed to be reused across the script.
 */
export function createWindowManager() {
  if (cd.g.windowManager) return;

  cd.g.windowManager = new OO.ui.WindowManager().on('closing', async (win, closed) => {
    // We don't have windows that can be reused.
    await closed;
    cd.g.windowManager.clearWindows();
  });

  $(document.body).append(cd.g.windowManager.$element);
}

/**
 * Display a OOUI message dialog where user is asked to confirm something. Compared to
 * `OO.ui.confirm`, returns an action string, not a boolean (which helps to differentiate between
 * more than two types of answer and also a window close by pressing Esc).
 *
 * @param {JQuery|string} message
 * @param {object} [options={}]
 * @returns {boolean}
 */
export async function confirmDialog(message, options = {}) {
  const defaultOptions = {
    message,
    // OO.ui.MessageDialog standard
    actions: [
      {
        action: 'accept',
        label: OO.ui.deferMsg('ooui-dialog-message-accept'),
        flags: 'primary',
      },
      {
        action: 'reject',
        label: OO.ui.deferMsg('ooui-dialog-message-reject'),
        flags: 'safe',
      },
    ],
  };

  const dialog = new OO.ui.MessageDialog();
  cd.g.windowManager.addWindows([dialog]);
  const windowInstance = cd.g.windowManager.openWindow(
    dialog,
    Object.assign({}, defaultOptions, options)
  );

  return (await windowInstance.closed)?.action;
}

/**
 * Show a confirmation message dialog with a destructive action.
 *
 * @param {string} messageName
 * @param {object} [customOptions={}]
 * @returns {Promise}
 */
export function confirmDestructive(messageName, customOptions = {}) {
  const actions = [
    {
      label: cd.s(`${messageName}-yes`),
      action: 'accept',
      flags: ['primary', 'destructive'],
    },
    {
      label: cd.s(`${messageName}-no`),
      action: 'reject',
      flags: 'safe',
    },
  ];
  const options = Object.assign({}, { actions }, customOptions);
  return OO.ui.confirm(cd.s(messageName), options);
}

/**
 * Check if there are unsaved changes in a process dialog.
 *
 * @param {OoUiProcessDialog} dialog
 * @returns {boolean}
 * @private
 */
function isUnsaved(dialog) {
  const saveButton = dialog.actions.get({ actions: 'save' })[0];
  return saveButton && !saveButton.isDisabled();
}

/**
 * @typedef {object} OoUiProcessDialog
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.ProcessDialog
 */

/**
 * Confirm closing a process dialog.
 *
 * @param {OoUiProcessDialog} dialog
 * @param {string} dialogCode
 * @private
 */
async function confirmCloseDialog(dialog, dialogCode) {
  if (!isUnsaved(dialog) || (await confirmDestructive(`${dialogCode}-close-confirm`))) {
    dialog.close({ action: 'close' });
    removePreventUnloadCondition('dialog');
  }
}

/**
 * Standard process dialog error handler.
 *
 * @param {OoUiProcessDialog} dialog
 * @param {CdError|Error} e
 * @param {string} messageName
 * @param {boolean} recoverable
 */
function handleError(dialog, e, messageName, recoverable) {
  if (e instanceof CdError) {
    const error = new OO.ui.Error(cd.sParse(messageName), { recoverable });
    dialog.showErrors(error);
  } else {
    const error = new OO.ui.Error(cd.sParse('error-javascript'), { recoverable: false });
    dialog.showErrors(error);
  }
  console.warn(e);
  if (!recoverable) {
    dialog.$errors
      .find('.oo-ui-buttonElement-button')
      .on('click', () => {
        dialog.close();
      });
  }

  dialog.actions.setAbilities({ close: true });

  cd.g.windowManager.updateWindowSize(dialog);
  dialog.popPending();
}

/**
 * Show a settings dialog.
 */
export async function settingsDialog() {
  if (cd.util.isPageOverlayOn()) return;

  /**
   * @class Subclass of {@link
   *   https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.ProcessDialog OO.ui.ProcessDialog}
   *   used to create a settings dialog.
   * @private
   */
  function SettingsDialog() {
    SettingsDialog.parent.call(this);
  }
  OO.inheritClass(SettingsDialog, OO.ui.ProcessDialog);

  SettingsDialog.static.name = 'settingsDialog';
  SettingsDialog.static.title = cd.s('sd-title');
  SettingsDialog.static.actions = [
    {
      action: 'close',
      modes: ['settings', 'reload', 'dataRemoved'],
      flags: ['safe', 'close'],
      disabled: true,
    },
    {
      action: 'save',
      modes: ['settings'],
      label: cd.s('sd-save'),
      flags: ['primary', 'progressive'],
      disabled: true,
    },
    {
      action: 'reset',
      modes: ['settings'],
      label: cd.s('sd-reset'),
      flags: ['destructive'],
      disabled: true,
    },
    {
      action: 'reload',
      modes: ['reload'],
      label: cd.s('sd-reload'),
      flags: ['primary', 'progressive'],
    },
  ];
  SettingsDialog.static.size = 'large';

  SettingsDialog.prototype.getBodyHeight = function () {
    return 600;
  };

  SettingsDialog.prototype.initialize = async function () {
    SettingsDialog.parent.prototype.initialize.apply(this, arguments);

    this.pushPending();

    const $loading = $('<div>').text(cd.s('loading-ellipsis'));
    this.loadingPanel = new OO.ui.PanelLayout({
      padded: true,
      expanded: false,
    });
    this.loadingPanel.$element.append($loading);

    this.settingsPanel = new OO.ui.PanelLayout({
      padded: false,
      expanded: true,
    });

    const $settingsSaved = $('<p>').text(cd.s('sd-saved'));
    this.reloadPanel = new OO.ui.PanelLayout({
      padded: true,
      expanded: false,
    });
    this.reloadPanel.$element.append($settingsSaved);

    const $dataRemoved = $('<p>').text(cd.s('sd-dataremoved'));
    this.dataRemovedPanel = new OO.ui.PanelLayout({
      padded: true,
      expanded: false,
    });
    this.dataRemovedPanel.$element.append($dataRemoved);

    this.stackLayout = new OO.ui.StackLayout({
      items: [this.loadingPanel, this.settingsPanel, this.reloadPanel, this.dataRemovedPanel],
    });

    this.$body.append(this.stackLayout.$element);
  };

  SettingsDialog.prototype.getSetupProcess = function (data) {
    return SettingsDialog.parent.prototype.getSetupProcess.call(this, data).next(() => {
      this.stackLayout.setItem(this.loadingPanel);
      this.actions.setMode('settings');
    });
  };

  SettingsDialog.prototype.getReadyProcess = function (data) {
    return SettingsDialog.parent.prototype.getReadyProcess.call(this, data).next(async () => {
      let settings;
      try {
        [settings] = await Promise.all(preparationRequests);
      } catch (e) {
        handleError(this, e, 'error-settings-load', false);
        return;
      }
      this.settings = Object.assign({}, cd.settings, settings);

      // For testing purposes
      cd.g.settingsForm = this;

      this.renderForm(this.settings);

      this.stackLayout.setItem(this.settingsPanel);
      this.bookletLayout.setPage('general');
      this.actions.setAbilities({ close: true });

      cd.g.windowManager.updateWindowSize(this);
      this.popPending();

      addPreventUnloadCondition('dialog', () => isUnsaved(dialog));
    });
  };

  SettingsDialog.prototype.getActionProcess = function (action) {
    if (action === 'save') {
      return new OO.ui.Process(async () => {
        this.pushPending();

        const settings = this.collectSettings();

        try {
          await setSettings(settings);
        } catch (e) {
          handleError(this, e, 'error-settings-save', true);
          return;
        }

        this.stackLayout.setItem(this.reloadPanel);
        this.actions.setMode('reload');

        this.popPending();
      });
    } else if (action === 'reload') {
      return new OO.ui.Process(() => {
        this.close({ action });
        location.reload();
      });
    } else if (action === 'close') {
      return new OO.ui.Process(async () => {
        await confirmCloseDialog(this, 'sd');
      });
    } else if (action === 'reset') {
      return new OO.ui.Process(async () => {
        if (await OO.ui.confirm(cd.s('sd-reset-confirm'))) {
          const currentPageName = this.bookletLayout.getCurrentPageName();
          this.renderForm(cd.defaultSettings);
          this.bookletLayout.setPage(currentPageName);
        }
      });
    }
    return SettingsDialog.parent.prototype.getActionProcess.call(this, action);
  };

  SettingsDialog.prototype.renderForm = function (settings) {
    [this.allowEditOthersCommentsField, this.allowEditOthersCommentsCheckbox] = checkboxField({
      value: 'allowEditOthersComments',
      selected: settings.allowEditOthersComments,
      label: cd.s('sd-alloweditotherscomments'),
    });

    [this.alwaysExpandAdvancedField, this.alwaysExpandAdvancedCheckbox] = checkboxField({
      value: 'alwaysExpandAdvanced',
      selected: settings.alwaysExpandAdvanced,
      label: cd.s('sd-alwaysexpandadvanced'),
    });

    const autocompleteMentionsOption = new OO.ui.CheckboxMultioptionWidget({
      data: 'mentions',
      selected: settings.autocompleteTypes.includes('mentions'),
      label: cd.s('sd-autocompletetypes-mentions'),
    });

    const autocompleteCommentLinksOption = new OO.ui.CheckboxMultioptionWidget({
      data: 'commentLinks',
      selected: settings.autocompleteTypes.includes('commentLinks'),
      label: cd.s('sd-autocompletetypes-commentlinks'),
    });

    const autocompleteWikilinksOption = new OO.ui.CheckboxMultioptionWidget({
      data: 'wikilinks',
      selected: settings.autocompleteTypes.includes('wikilinks'),
      label: cd.s('sd-autocompletetypes-wikilinks'),
    });

    const autocompleteTemplatesOption = new OO.ui.CheckboxMultioptionWidget({
      data: 'templates',
      selected: settings.autocompleteTypes.includes('templates'),
      label: cd.s('sd-autocompletetypes-templates'),
    });

    const autocompleteTagsOption = new OO.ui.CheckboxMultioptionWidget({
      data: 'tags',
      selected: settings.autocompleteTypes.includes('tags'),
      label: cd.s('sd-autocompletetypes-tags'),
    });

    this.autocompleteTypesMultiselect = new OO.ui.CheckboxMultiselectWidget({
      items: [
        autocompleteMentionsOption,
        autocompleteCommentLinksOption,
        autocompleteWikilinksOption,
        autocompleteTemplatesOption,
        autocompleteTagsOption,
      ],
      classes: ['cd-autocompleteTypesMultiselect'],
    });

    this.autocompleteTypesField = new OO.ui.FieldLayout(this.autocompleteTypesMultiselect, {
      label: cd.s('sd-autocompletetypes'),
      align: 'top',
    });

    [this.autopreviewField, this.autopreviewCheckbox] = checkboxField({
      value: 'autopreview',
      selected: settings.autopreview,
      label: cd.s('sd-autopreview'),
    });

    [
      this.desktopNotificationsField,
      this.desktopNotificationsSelect,
      this.desktopNotificationsRadioAll,
      this.desktopNotificationsRadioNone,
      this.desktopNotificationsRadioToMe,
    ] = radioField({
      options: [
        {
          label: cd.s('sd-desktopnotifications-radio-all'),
          data: 'all',
        },
        {
          label: cd.s('sd-desktopnotifications-radio-tome'),
          data: 'toMe',
        },
        {
          label: cd.s('sd-desktopnotifications-radio-none'),
          data: 'none',
        },
      ],
      selected: settings.desktopNotifications,
      label: cd.s('sd-desktopnotifications'),
      help: cd.s('sd-desktopnotifications-help', location.hostname),
    });

    let defaultCommentLinkTypeHelp = (
      cd.s('sd-defaultcommentlinktype-help') +
      ' ' +
      cd.s('sd-defaultcommentlinktype-help-notdifflinks')
    );
    [
      this.defaultCommentLinkTypeField,
      this.defaultCommentLinkTypeSelect,
      this.defaultCommentLinkTypeRadioWikilink,
      this.defaultCommentLinkTypeRadioLink,
    ] = radioField({
      options: [
        {
          label: cd.s('sd-defaultcommentlinktype-radio-diff'),
          data: 'diff',
        },
        {
          label: cd.s('sd-defaultcommentlinktype-radio-wikilink'),
          data: 'wikilink',
        },
        {
          label: cd.s('sd-defaultcommentlinktype-radio-link'),
          data: 'link',
        },
      ],
      selected: settings.defaultCommentLinkType,
      label: cd.s('sd-defaultcommentlinktype', cd.s('cm-copylink')),
      help: defaultCommentLinkTypeHelp,
    });

    [
      this.defaultSectionLinkTypeField,
      this.defaultSectionLinkTypeSelect,
      this.defaultSectionLinkTypeRadioWikilink,
      this.defaultSectionLinkTypeRadioLink,
    ] = radioField({
      options: [
        {
          label: cd.s('sd-defaultsectionlinktype-radio-wikilink'),
          data: 'wikilink',
        },
        {
          label: cd.s('sd-defaultsectionlinktype-radio-link'),
          data: 'link',
        },
      ],
      selected: settings.defaultSectionLinkType,
      label: cd.s('sd-defaultsectionlinktype'),
      help: cd.s('sd-defaultsectionlinktype-help'),
    });

    [this.highlightOwnCommentsField, this.highlightOwnCommentsCheckbox] = checkboxField({
      value: 'highlightOwnComments',
      selected: settings.highlightOwnComments,
      label: cd.s('sd-highlightowncomments'),
    });

    const insertButtonsSelected = settings.insertButtons
      .map((button) => Array.isArray(button) ? button.join(';') : button);
    this.insertButtonsMultiselect = new OO.ui.TagMultiselectWidget({
      placeholder: cd.s('sd-insertbuttons-multiselect-placeholder'),
      allowArbitrary: true,
      inputPosition: 'outline',
      tagLimit: 100,
      selected: insertButtonsSelected,
    });
    this.insertButtonsField = new OO.ui.FieldLayout(this.insertButtonsMultiselect, {
      label: cd.s('sd-insertbuttons'),
      align: 'top',
      help: cd.util.wrap(cd.sParse('sd-insertbuttons-help') + ' ' + cd.sParse('sd-localsetting')),
      helpInline: true,
    });

    [this.modifyTocField, this.modifyTocCheckbox] = checkboxField({
      value: 'modifyToc',
      selected: settings.modifyToc,
      label: cd.s('sd-modifytoc'),
      help: cd.s('sd-modifytoc-help'),
    });

    [
      this.notificationsField,
      this.notificationsSelect,
      this.notificationsRadioAll,
      this.notificationsRadioNone,
      this.notificationsRadioToMe,
    ] = radioField({
      options: [
        {
          label: cd.s('sd-notifications-radio-all'),
          data: 'all',
        },
        {
          label: cd.s('sd-notifications-radio-tome'),
          data: 'toMe',
        },
        {
          label: cd.s('sd-notifications-radio-none'),
          data: 'none',
        },
      ],
      selected: settings.notifications,
      label: cd.s('sd-notifications'),
      help: cd.s('sd-notifications-help'),
    });

    this.notificationsBlacklistMultiselect = new mw.widgets.UsersMultiselectWidget({
      placeholder: cd.s('sd-notificationsblacklist-multiselect-placeholder'),
      tagLimit: 100,
      selected: settings.notificationsBlacklist,
    });
    this.notificationsBlacklistField = (
      new OO.ui.FieldLayout(this.notificationsBlacklistMultiselect, {
        label: cd.s('sd-notificationsblacklist'),
        align: 'top',
      })
    );

    [this.showToolbarField, this.showToolbarCheckbox] = checkboxField({
      value: 'showToolbar',
      selected: settings.showToolbar,
      label: cd.s('sd-showtoolbar'),
    });

    this.signaturePrefixInput = new OO.ui.TextInputWidget({
      value: settings.signaturePrefix,
      maxlength: 100,
    });
    this.signaturePrefixField = new OO.ui.FieldLayout(this.signaturePrefixInput, {
      label: cd.s('sd-signatureprefix'),
      align: 'top',
      help: cd.util.wrap(cd.sParse('sd-signatureprefix-help') + ' ' + cd.sParse('sd-localsetting')),
      helpInline: true,
    });

    [this.useTemplateDataField, this.useTemplateDataCheckbox] = checkboxField({
      value: 'useTemplateData',
      selected: settings.useTemplateData,
      disabled: !settings.autocompleteTypes.includes('templates'),
      label: cd.s('sd-usetemplatedata'),
      help: cd.s('sd-usetemplatedata-help'),
    });

    [this.watchOnReplyField, this.watchOnReplyCheckbox] = checkboxField({
      value: 'watchOnReply',
      selected: settings.watchOnReply,
      label: cd.s('sd-watchonreply'),
    });

    [this.watchSectionOnReplyField, this.watchSectionOnReplyCheckbox] = checkboxField({
      value: 'watchSectionOnReply',
      selected: settings.watchSectionOnReply,
      label: cd.s('sd-watchsectiononreply'),
      help: cd.s('sd-watchsectiononreply-help'),
    });

    this.insertButtonsMultiselect.connect(this, { change: 'updateStates' });
    this.allowEditOthersCommentsCheckbox.connect(this, { change: 'updateStates' });
    this.alwaysExpandAdvancedCheckbox.connect(this, { change: 'updateStates' });
    this.autocompleteTypesMultiselect.connect(this, { select: 'updateStates' });
    this.autopreviewCheckbox.connect(this, { change: 'updateStates' });
    this.desktopNotificationsSelect.connect(this, {
      select: 'updateStates',
      choose: 'changeDesktopNotifications',
    });
    this.defaultCommentLinkTypeSelect.connect(this, { select: 'updateStates' });
    this.defaultSectionLinkTypeSelect.connect(this, { select: 'updateStates' });
    this.highlightOwnCommentsCheckbox.connect(this, { change: 'updateStates' });
    this.modifyTocCheckbox.connect(this, { change: 'updateStates' });
    this.notificationsSelect.connect(this, { select: 'updateStates' });
    this.notificationsBlacklistMultiselect.connect(this, { change: 'updateStates' });
    this.showToolbarCheckbox.connect(this, { change: 'updateStates' });
    this.signaturePrefixInput.connect(this, { change: 'updateStates' });
    this.useTemplateDataCheckbox.connect(this, { change: 'updateStates' });
    this.watchSectionOnReplyCheckbox.connect(this, { change: 'updateStates' });
    this.watchOnReplyCheckbox.connect(this, { change: 'updateStates' });

    this.removeDataButton = new OO.ui.ButtonWidget({
      label: cd.s('sd-removedata'),
      flags: ['destructive'],
    });
    this.removeDataButton.connect(this, { click: 'removeData' });

    this.removeDataField = new OO.ui.FieldLayout(this.removeDataButton, {
      label: cd.s('sd-removedata-description'),
      align: 'top',
      help: cd.util.wrap(cd.sParse('sd-removedata-help'), { targetBlank: true }),
      helpInline: true,
    });

    /**
     * @class Subclass of {@link
     *   https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.PageLayout OO.ui.PageLayout} used
     *   to create a "General" booklet page.
     * @param {string} name
     * @param {object} [config]
     * @private
     */
    function GeneralPageLayout(name, config) {
      GeneralPageLayout.super.call(this, name, config);
      this.$element.append([
        dialog.highlightOwnCommentsField.$element,
        dialog.allowEditOthersCommentsField.$element,
        dialog.modifyTocField.$element,
        dialog.defaultCommentLinkTypeField.$element,
        dialog.defaultSectionLinkTypeField.$element,
      ]);
    }
    OO.inheritClass(GeneralPageLayout, OO.ui.PageLayout);
    GeneralPageLayout.prototype.setupOutlineItem = function (outlineItem) {
      GeneralPageLayout.super.prototype.setupOutlineItem.call(this, outlineItem);
      this.outlineItem.setLabel(cd.s('sd-page-talkpage'));
    };

    /**
     * @class Subclass of {@link
     *   https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.PageLayout OO.ui.PageLayout} used
     *   to create a "Comment form" booklet page.
     * @private
     * @param {string} name
     * @param {object} [config]
     */
    function CommentFormPageLayout(name, config) {
      CommentFormPageLayout.super.call(this, name, config);
      this.$element.append([
        dialog.autopreviewField.$element,
        dialog.watchOnReplyField.$element,
        dialog.watchSectionOnReplyField.$element,
        dialog.showToolbarField.$element,
        dialog.alwaysExpandAdvancedField.$element,
        dialog.autocompleteTypesField.$element,
        dialog.useTemplateDataField.$element,
        dialog.insertButtonsField.$element,
        dialog.signaturePrefixField.$element,
      ]);
    }
    OO.inheritClass(CommentFormPageLayout, OO.ui.PageLayout);
    CommentFormPageLayout.prototype.setupOutlineItem = function () {
      this.outlineItem.setLabel(cd.s('sd-page-commentform'));
    };

    /**
     * @class Subclass of {@link
     *   https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.PageLayout OO.ui.PageLayout} used
     *   to create a "Notifications" booklet page.
     * @param {string} name
     * @param {object} [config]
     * @private
     */
    function NotificationsPageLayout(name, config) {
      NotificationsPageLayout.super.call(this, name, config);
      this.$element.append([
        dialog.notificationsField.$element,
        dialog.desktopNotificationsField.$element,
        dialog.notificationsBlacklistField.$element,
      ]);
    }
    OO.inheritClass(NotificationsPageLayout, OO.ui.PageLayout);
    NotificationsPageLayout.prototype.setupOutlineItem = function () {
      this.outlineItem.setLabel(cd.s('sd-page-notifications'));
    };

    /**
     * @class Subclass of {@link
     *   https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.PageLayout OO.ui.PageLayout} used
     *   to create a "Remove data" booklet page.
     * @param {string} name
     * @param {object} [config]
     * @private
     */
    function RemoveDataPageLayout(name, config) {
      RemoveDataPageLayout.super.call(this, name, config);
      this.$element.append(dialog.removeDataField.$element);
    }
    OO.inheritClass(RemoveDataPageLayout, OO.ui.PageLayout);
    RemoveDataPageLayout.prototype.setupOutlineItem = function () {
      this.outlineItem.setLabel(cd.s('sd-page-dataremoval'));
    };

    const generalPage = new GeneralPageLayout('general');
    const commentFormPage = new CommentFormPageLayout('commentForm');
    const notificationsPage = new NotificationsPageLayout('notifications');
    const removeDataPage = new RemoveDataPageLayout('removeData');

    this.bookletLayout = new OO.ui.BookletLayout({
      outlined: true,
    });
    this.bookletLayout.addPages([generalPage, commentFormPage, notificationsPage, removeDataPage]);

    this.settingsPanel.$element.empty().append(this.bookletLayout.$element);

    this.updateStates();
  };

  SettingsDialog.prototype.collectSettings = function () {
    const settings = {
      allowEditOthersComments: this.allowEditOthersCommentsCheckbox.isSelected(),
      alwaysExpandAdvanced: this.alwaysExpandAdvancedCheckbox.isSelected(),
      autocompleteTypes: this.autocompleteTypesMultiselect.findSelectedItemsData(),
      autopreview: this.autopreviewCheckbox.isSelected(),
      desktopNotifications: (
        this.desktopNotificationsSelect.findSelectedItem()?.getData() ||
        'unknown'
      ),
      defaultCommentLinkType: this.defaultCommentLinkTypeSelect.findSelectedItem()?.getData(),
      defaultSectionLinkType: this.defaultSectionLinkTypeSelect.findSelectedItem()?.getData(),
      highlightOwnComments: this.highlightOwnCommentsCheckbox.isSelected(),
      insertButtons: this.processInsertButtons(),
      modifyToc: this.modifyTocCheckbox.isSelected(),
      notifications: this.notificationsSelect.findSelectedItem()?.getData(),
      notificationsBlacklist: this.notificationsBlacklistMultiselect.getValue(),
      showToolbar: this.showToolbarCheckbox.isSelected(),
      signaturePrefix: this.signaturePrefixInput.getValue(),
      useTemplateData: this.useTemplateDataCheckbox.isSelected(),
      watchOnReply: this.watchOnReplyCheckbox.isSelected(),
      watchSectionOnReply: this.watchSectionOnReplyCheckbox.isSelected(),
    };
    settings.haveInsertButtonsBeenAltered = (
      JSON.stringify(settings.insertButtons) !==
      JSON.stringify(cd.defaultSettings.insertButtons)
    );
    return settings;
  };

  SettingsDialog.prototype.processInsertButtons = function () {
    return this.insertButtonsMultiselect
      .getValue()
      .map((value) => {
        const hidden = [];
        value = hideText(value, /\\[+;\\]/g, hidden);
        let [, text, displayedText] = value.match(/^(.*?)(?:;(.+))?$/) || [];
        if (!text?.replace(/^ +$/, '')) return;
        text = unhideText(text, hidden);
        displayedText = displayedText && unhideText(displayedText, hidden);
        return [text, displayedText].filter(defined);
      })
      .filter(defined);
  };

  SettingsDialog.prototype.updateStates = async function () {
    this.useTemplateDataCheckbox.setDisabled(
      !this.autocompleteTypesMultiselect.findItemFromData('templates').isSelected()
    );

    const settings = this.collectSettings();
    const save = !areObjectsEqual(settings, this.settings, true);
    const reset = !areObjectsEqual(settings, cd.defaultSettings, true);

    this.actions.setAbilities({ save, reset });
  };

  SettingsDialog.prototype.changeDesktopNotifications = function (option) {
    if (option.data !== 'none' && Notification.permission !== 'granted') {
      OO.ui.alert(cd.s('dn-grantpermission'));
      Notification.requestPermission((permission) => {
        if (permission !== 'granted') {
          this.desktopNotificationsSelect.selectItemByData('none');
        }
      });
    }
  };

  SettingsDialog.prototype.removeData = async function () {
    if (await confirmDestructive('sd-removedata-confirm', { size: 'medium' })) {
      this.pushPending();

      try {
        await Promise.all([
          setLocalOption(cd.g.LOCAL_SETTINGS_OPTION_NAME, undefined),
          setLocalOption(cd.g.VISITS_OPTION_NAME, undefined),
          setLocalOption(cd.g.WATCHED_SECTIONS_OPTION_NAME, undefined),
          setGlobalOption(cd.g.SETTINGS_OPTION_NAME, undefined),
        ]);
      } catch (e) {
        handleError(this, e, 'sd-error-removedata', false);
        return;
      }

      localStorage.removeItem('convenientDiscussions-commentForms');
      localStorage.removeItem('convenientDiscussions-thanks');

      this.stackLayout.setItem(this.dataRemovedPanel);
      this.actions.setMode('dataRemoved');

      this.popPending();
    }
  };

  if (dealWithLoadingBug('mediawiki.widgets.UsersMultiselectWidget')) return;

  // Make requests in advance.
  const preparationRequests = [
    getSettings({ omitLocal: true }),
    mw.loader.using('mediawiki.widgets.UsersMultiselectWidget'),
  ];

  createWindowManager();
  const dialog = new SettingsDialog();
  cd.g.windowManager.addWindows([dialog]);
  cd.g.windowManager.openWindow(dialog);
}

/**
 * Show an edit watched sections dialog.
 */
export async function editWatchedSections() {
  if (cd.util.isPageOverlayOn()) return;

  /**
   * @class Subclass of {@link
   *   https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.ProcessDialog OO.ui.ProcessDialog}
   *   used to create an edit watched sections dialog.
   * @private
   */
  function EditWatchedSectionsDialog() {
    EditWatchedSectionsDialog.parent.call(this);
  }
  OO.inheritClass(EditWatchedSectionsDialog, OO.ui.ProcessDialog);

  EditWatchedSectionsDialog.static.name = 'editWatchedSectionsDialog';
  EditWatchedSectionsDialog.static.title = cd.s('ewsd-title');
  EditWatchedSectionsDialog.static.actions = [
    {
      action: 'close',
      modes: ['edit', 'saved'],
      flags: ['safe', 'close'],
      disabled: true,
    },
    {
      action: 'save',
      modes: ['edit'],
      label: cd.s('ewsd-save'),
      flags: ['primary', 'progressive'],
      disabled: true,
    },
  ];
  EditWatchedSectionsDialog.static.size = 'large';

  EditWatchedSectionsDialog.prototype.getBodyHeight = function () {
    return this.$errorItems ? this.$errors[0].scrollHeight : this.$body[0].scrollHeight;
  };

  EditWatchedSectionsDialog.prototype.initialize = async function () {
    EditWatchedSectionsDialog.parent.prototype.initialize.apply(this, arguments);

    this.pushPending();

    const $loading = $('<div>').text(cd.s('loading-ellipsis'));
    this.loadingPanel = new OO.ui.PanelLayout({
      padded: true,
      expanded: false,
    });
    this.loadingPanel.$element.append($loading);

    this.sectionsPanel = new OO.ui.PanelLayout({
      padded: false,
      expanded: false,
    });

    const $watchedSectionsSaved = $('<p>').text(cd.s('ewsd-saved'));
    this.savedPanel = new OO.ui.PanelLayout({
      padded: true,
      expanded: false,
    });
    this.savedPanel.$element.append($watchedSectionsSaved);

    this.stackLayout = new OO.ui.StackLayout({
      items: [this.loadingPanel, this.sectionsPanel, this.savedPanel],
    });

    this.$body.append(this.stackLayout.$element);
  };

  EditWatchedSectionsDialog.prototype.getSetupProcess = function (data) {
    return EditWatchedSectionsDialog.parent.prototype.getSetupProcess.call(this, data).next(() => {
      this.stackLayout.setItem(this.loadingPanel);
      this.actions.setMode('edit');
    });
  };

  EditWatchedSectionsDialog.prototype.getReadyProcess = function (data) {
    return EditWatchedSectionsDialog.parent.prototype.getReadyProcess.call(this, data)
      .next(async () => {
        let pages;
        try {
          await watchedSectionsRequest;
          pages = await getPageTitles(
            Object.keys(cd.g.watchedSections)
              .filter((pageId) => cd.g.watchedSections[pageId].length)
          );
        } catch (e) {
          handleError(this, e, 'ewsd-error-processing', false);
          return;
        }

        // Logically, there should be no coinciding titles between pages, so we don't need a separate
        // "return 0" condition.
        pages.sort((page1, page2) => page1.title > page2.title ? 1 : -1);

        const value = pages
          // Filter out deleted pages
          .filter((page) => page.title)

          .map((page) => (
            cd.g.watchedSections[page.pageid]
              .map((section) => `${page.title}#${section}`)
              .join('\n')
          ))
          .join('\n');

        this.input = new OO.ui.MultilineTextInputWidget({
          value,
          rows: 30,
          classes: ['cd-editWatchedSections-input'],
        });
        this.input.on('change', (newValue) => {
          this.actions.setAbilities({ save: newValue !== value });
        });

        this.sectionsPanel.$element.append(this.input.$element);

        this.stackLayout.setItem(this.sectionsPanel);
        this.input.focus();
        this.actions.setAbilities({ close: true });

        // A dirty workaround to avoid the scrollbar appearing when the window is loading. Couldn't
        // figure out a way to do this out of the box.
        dialog.$body.css('overflow', 'hidden');
        setTimeout(() => {
          dialog.$body.css('overflow', '');
        }, 500);

        cd.g.windowManager.updateWindowSize(this);
        this.popPending();

        addPreventUnloadCondition('dialog', () => isUnsaved(dialog));
      });
  };

  EditWatchedSectionsDialog.prototype.getActionProcess = function (action) {
    if (action === 'save') {
      return new OO.ui.Process(async () => {
        this.pushPending();

        const sections = {};
        const pageTitles = [];
        this.input
          .getValue()
          .split('\n')
          .forEach((section) => {
            const match = section.match(/^(.+?)#(.+)$/);
            if (match) {
              const pageTitle = match[1].trim();
              const sectionTitle = match[2].trim();
              if (!sections[pageTitle]) {
                sections[pageTitle] = [];
                pageTitles.push(pageTitle);
              }
              sections[pageTitle].push(sectionTitle);
            }
          });

        let normalized;
        let redirects;
        let pages;
        try {
          ({ normalized, redirects, pages } = await getPageIds(pageTitles) || {});
        } catch (e) {
          handleError(this, e, 'ewsd-error-processing', true);
          return;
        }

        // Correct to normalized titles && redirect targets, add to the collection.
        normalized
          .concat(redirects)
          .filter((page) => sections[page.from])
          .forEach((page) => {
            if (!sections[page.to]) {
              sections[page.to] = [];
            }
            sections[page.to].push(...sections[page.from]);
            delete sections[page.from];
          });

        const titleToId = {};
        pages
          .filter((page) => page.pageid !== undefined)
          .forEach((page) => {
            titleToId[page.title] = page.pageid;
          });

        cd.g.watchedSections = {};
        Object.keys(sections)
          .filter((key) => titleToId[key])
          .forEach((key) => {
            cd.g.watchedSections[titleToId[key]] = sections[key].filter(unique);
          });

        try {
          await setWatchedSections();
        } catch (e) {
          if (e instanceof CdError) {
            const { type, code, apiData } = e.data;
            if (type === 'internal' && code === 'sizeLimit') {
              const error = new OO.ui.Error(
                cd.sParse('ewsd-error-maxsize'),
                { recoverable: false }
              );
              this.showErrors(error);
            } else {
              const error = new OO.ui.Error(
                cd.sParse('ewsd-error-processing'),
                { recoverable: true }
              );
              this.showErrors(error);
            }
            console.warn(type, code, apiData);
          } else {
            const error = new OO.ui.Error(cd.sParse('error-javascript'), { recoverable: false });
            this.showErrors(error);
            console.warn(e);
          }
          this.popPending();
          return;
        }

        this.stackLayout.setItem(this.savedPanel);
        this.actions.setMode('saved');

        this.popPending();
      });
    } else if (action === 'close') {
      return new OO.ui.Process(async () => {
        await confirmCloseDialog(this, 'ewsd');
      });
    }
    return EditWatchedSectionsDialog.parent.prototype.getActionProcess.call(this, action);
  };

  // Make a request in advance.
  const watchedSectionsRequest = getWatchedSections();

  createWindowManager();
  const dialog = new EditWatchedSectionsDialog();
  cd.g.windowManager.addWindows([dialog]);
  cd.g.windowManager.openWindow(dialog);
}

/**
 * Copy a link and notify whether the operation was successful.
 *
 * @param {string} text
 * @private
 */
function copyLinkToClipboardAndNotify(text) {
  const $textarea = $('<textarea>')
    .val(text)
    .appendTo(document.body)
    .select();
  const successful = document.execCommand('copy');
  $textarea.remove();

  if (successful) {
    if (text.startsWith('http')) {
      const $body = cd.util.wrap(cd.sParse('copylink-copied-url', text), { targetBlank: true });
      mw.notify($body);
    } else {
      mw.notify(cd.s('copylink-copied'));
    }
  } else {
    mw.notify(cd.s('copylink-error'), { type: 'error' });
  }
}

/**
 * Copy a link to the object or show a copy link dialog.
 *
 * @param {Comment|Section} object Comment or section to copy the link to.
 * @param {boolean} chooseLink Allow the user to choose the type of the link.
 * @param {Function} [finallyCallback] Callback to execute on success or error.
 */
export async function copyLink(object, chooseLink, finallyCallback) {
  if (object.isLinkBeingCopied) return;

  /**
   * Is a link to the comment being copied right now (a copy link dialog is opened or a request is
   * being made to get the diff).
   *
   * @name isLinkBeingCopied
   * @type {boolean}
   * @instance module:Comment
   */

  /**
   * Is a link to the section being copied right now (a copy link dialog is opened).
   *
   * @name isLinkBeingCopied
   * @type {boolean}
   * @instance module:Section
   */
  object.isLinkBeingCopied = true;

  let anchor = object instanceof Comment ? object.anchor : underlinesToSpaces(object.anchor);
  anchor = encodeWikilink(anchor);
  const wikilink = `[[${cd.g.CURRENT_PAGE.name}#${anchor}]]`;
  let decodedCurrentPageUrl;
  try {
    decodedCurrentPageUrl = decodeURI(cd.g.CURRENT_PAGE.getUrl());
  } catch (e) {
    console.error(e);
    object.isLinkBeingCopied = false;
    if (finallyCallback) {
      finallyCallback();
    }
    return;
  }
  const anchorWithUnderlines = spacesToUnderlines(anchor);
  const url = `https:${mw.config.get('wgServer')}${decodedCurrentPageUrl}#${anchorWithUnderlines}`;

  if (chooseLink) {
    let diffInput;
    let diffField;
    if (object instanceof Comment) {
      let diffLink;
      let value;
      try {
        value = diffLink = await object.getDiffLink(object);
      } catch (e) {
        if (e instanceof CdError) {
          const { type } = e.data;
          if (type === 'network') {
            value = cd.s('cld-diff-error-network');
          } else {
            value = cd.s('cld-diff-error');
          }
        } else {
          value = cd.s('cld-diff-error-unknown');
        }
      }

      diffInput = new OO.ui.TextInputWidget({
        value,
        disabled: !diffLink,
      });
      const diffButton = new OO.ui.ButtonWidget({
        label: cd.s('cld-copy'),
        icon: 'articles',
        disabled: !diffLink,
      });
      diffButton.on('click', () => {
        copyLinkToClipboardAndNotify(diffInput.getValue());
        dialog.close();
      });
      diffField = new OO.ui.ActionFieldLayout(diffInput, diffButton, {
        align: 'top',
        label: cd.s('cld-diff'),
      });
    }

    let onlyCdWarning;
    if (object instanceof Comment) {
      onlyCdWarning = cd.s('cld-help-onlycd');
    }

    const wikilinkInput = new OO.ui.TextInputWidget({
      value: wikilink,
    });
    const wikilinkButton = new OO.ui.ButtonWidget({
      label: cd.s('cld-copy'),
      icon: 'articles',
    });
    wikilinkButton.on('click', () => {
      copyLinkToClipboardAndNotify(wikilinkInput.getValue());
      dialog.close();
    });
    const wikilinkField = new OO.ui.ActionFieldLayout(wikilinkInput, wikilinkButton, {
      align: 'top',
      label: cd.s('cld-wikilink'),
      help: onlyCdWarning,
      helpInline: true,
    });

    const anchorWikilinkInput = new OO.ui.TextInputWidget({
      value: `[[#${anchor}]]`,
    });
    const anchorWikilinkButton = new OO.ui.ButtonWidget({
      label: cd.s('cld-copy'),
      icon: 'articles',
    });
    anchorWikilinkButton.on('click', () => {
      copyLinkToClipboardAndNotify(anchorWikilinkInput.getValue());
      dialog.close();
    });
    const anchorWikilinkField = new OO.ui.ActionFieldLayout(
      anchorWikilinkInput,
      anchorWikilinkButton, {
        align: 'top',
        label: cd.s('cld-currentpagewikilink'),
      }
    );

    const linkInput = new OO.ui.TextInputWidget({
      value: url,
    });
    const linkButton = new OO.ui.ButtonWidget({
      label: cd.s('cld-copy'),
      icon: 'articles',
    });
    linkButton.on('click', () => {
      copyLinkToClipboardAndNotify(linkInput.getValue());
      dialog.close();
    });
    const linkField = new OO.ui.ActionFieldLayout(linkInput, linkButton, {
      align: 'top',
      label: cd.s('cld-link'),
      help: onlyCdWarning,
      helpInline: true,
    });

    const $message = $('<div>')
      .append(diffField?.$element)
      .append(wikilinkField.$element)
      .append(anchorWikilinkField.$element)
      .append(linkField.$element);

    const dialog = new OO.ui.MessageDialog();
    cd.g.windowManager.addWindows([dialog]);
    const windowInstance = cd.g.windowManager.openWindow(dialog, {
      message: $message,
      actions: [
        {
          label: cd.s('cld-close'),
          action: 'close',
        },
      ],
      size: 'large',
    });
    windowInstance.closed.then(() => {
      object.isLinkBeingCopied = false;
    });
  } else {
    let link;
    const defaultType = cd.settings[
      object instanceof Comment ? 'defaultCommentLinkType' : 'defaultSectionLinkType'
    ];
    switch (defaultType) {
      case 'diff':
        if (!(object instanceof Comment)) {
          link = wikilink;
          break;
        }
        try {
          link = await object.getDiffLink(object);
        } catch (e) {
          let text = cd.sParse('error-diffnotfound');
          if (e instanceof CdError) {
            const { type } = e.data;
            if (type === 'network') {
              text += ' ' + cd.sParse('error-network');
            } else {
              const url = object.getSourcePage().getArchivedPage().getUrl({ action: 'history' });
              text += ' ' + cd.sParse('error-diffnotfound-history', url);
            }
          } else {
            text += ' ' + cd.sParse('error-unknown');
          }
          const $body = cd.util.wrap(text, { targetBlank: true });
          mw.notify($body, { type: 'error' });
          object.isLinkBeingCopied = false;
          if (finallyCallback) {
            finallyCallback();
          }
          return;
        }
        break;

      case 'link':
        link = url;
        break;

      default:
        link = wikilink;
    }

    copyLinkToClipboardAndNotify(link);

    object.isLinkBeingCopied = false;
  }

  if (finallyCallback) {
    finallyCallback();
  }
}

/**
 * Show a modal with content of comment forms that we were unable to restore to the page (because
 * their target comments/sections disappeared, for example).
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

/**
 * Show a message dialog that informs the user that the section/comment was not found.
 *
 * @param {string} decodedFragment
 * @param {Date} date
 */
export async function notFound(decodedFragment, date) {
  const title = $('<span>')
    .addClass('cd-destructiveText')
    .text(date ? cd.s('deadanchor-comment-title') : cd.s('deadanchor-section-title'));
  let message = date ? cd.s('deadanchor-comment-text') : cd.s('deadanchor-section-text');
  if (cd.g.CURRENT_PAGE.canHaveArchives()) {
    message += ' ' + cd.s('deadanchor-searchinarchive');
    if (await OO.ui.confirm(message, { title })) {
      let text;
      if (date) {
        text = cd.util.formatDate(date);
      } else {
        text = decodedFragment
          .replace(/_/g, ' ')
          .replace(/"/g, '')
          .trim();
      }
      const archivePrefix = cd.g.CURRENT_PAGE.getArchivePrefix();
      const searchQuery = `"${text}" prefix:${archivePrefix}`;
      const url = mw.util.getUrl('Special:Search', {
        profile: 'default',
        fulltext: 'Search',
        search: searchQuery,
        cdcomment: date && decodedFragment,
      });
      location.assign(mw.config.get('wgServer') + url);
    }
  } else {
    OO.ui.alert(message, { title });
  }
}
