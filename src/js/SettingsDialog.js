import cd from './cd';
import controller from './controller';
import settings from './settings';
import { areObjectsEqual, defined } from './util';
import {
  confirmCloseDialog,
  createCheckboxField,
  createNumberField,
  createRadioField,
  createTextField,
  handleDialogError,
  isDialogUnsaved,
  tweakUserOoUiClass,
} from './ooui';
import { formatDateImproved, formatDateNative, formatDateRelative } from './timestamp';
import { hideText, unhideText, wrap } from './util';
import { setGlobalOption, setLocalOption } from './apiWrappers';

/**
 * Class used to create a settings dialog.
 *
 * @augments external:OO.ui.ProcessDialog
 */
class SettingsDialog extends OO.ui.ProcessDialog {
  static name = 'settingsDialog';
  static title = cd.s('sd-title');
  static actions = [
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
  static size = 'large';

  /**
   * Create a settings dialog.
   *
   * @param {string} [initialPageName]
   */
  constructor(initialPageName) {
    super({ classes: ['cd-dialog-settings'] });
    this.initialPageName = initialPageName;
    this.preparatoryRequests = [
      settings.load({ omitLocal: true }),
      mw.loader.using('mediawiki.widgets.UsersMultiselectWidget'),
    ];
  }

  /**
   * OOUI native method to get the height of the window body.
   *
   * @returns {number}
   * @see
   *   https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/OO.ui.Window-method-getBodyHeight
   */
  getBodyHeight() {
    return 600;
  }

  /**
   * OOUI native method that initializes window contents.
   *
   * @param {...*} [args]
   * @see
   *   https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/OO.ui.ProcessDialog-method-initialize
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   */
  initialize(...args) {
    super.initialize(...args);

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
      this.stackLayout.setItem(this.loadingPanel);
      this.actions.setMode('settings');
    });
  }

  /**
   * OOUI native method that returns a "ready" process which is used to ready a window for use in a
   * particular context, based on the `data` argument.
   *
   * @param {object} data Window opening data
   * @returns {external:OO.ui.Process}
   * @see
   *   https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/OO.ui.Window-method-getReadyProcess
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   */
  getReadyProcess(data) {
    return super.getReadyProcess(data).next(async () => {
      let loadedSettings;
      try {
        [loadedSettings] = await Promise.all(this.preparatoryRequests);
      } catch (e) {
        handleDialogError(this, e, 'error-settings-load', false);
        return;
      }
      this.settings = Object.assign({}, settings.get(), loadedSettings);

      this.renderControls(this.settings);

      this.stackLayout.setItem(this.settingsPanel);
      this.bookletLayout.setPage(this.initialPageName || 'isTalkPage');
      this.actions.setAbilities({ close: true });

      this.popPending();

      controller.addPreventUnloadCondition('dialog', () => isDialogUnsaved(this));
    });
  }

  /**
   * OOUI native method that returns a process for taking action.
   *
   * @param {string} action Symbolic name of the action.
   * @returns {external:OO.ui.Process}
   * @see
   *   https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/OO.ui.Dialog-method-getActionProcess
   */
  getActionProcess(action) {
    if (action === 'save') {
      return new OO.ui.Process(async () => {
        this.pushPending();

        const collectedSettings = this.collectSettings();

        try {
          await settings.save(collectedSettings);
        } catch (e) {
          handleDialogError(this, e, 'error-settings-save', true);
          return;
        }

        controller.removePreventUnloadCondition('dialog');

        this.stackLayout.setItem(this.reloadPanel);
        this.actions.setMode('reload');

        this.popPending();
      });
    } else if (action === 'reload') {
      return new OO.ui.Process(() => {
        this.close();
        location.reload();
      });
    } else if (action === 'close') {
      return new OO.ui.Process(() => {
        confirmCloseDialog(this, 'sd');
      });
    } else if (action === 'reset') {
      return new OO.ui.Process(() => {
        if (confirm(cd.s('sd-reset-confirm'))) {
          const currentPageName = this.bookletLayout.getCurrentPageName();
          this.renderControls(settings.scheme.default);
          this.bookletLayout.setPage(currentPageName);
        }
      });
    }
    return super.getActionProcess(action);
  }

  /**
   * Create widget fields with states of controls set according to settings.
   *
   * @param {object} settings Settings according to which to set the control states.
   */
  createFields(settings) {
    [
      this.allowEditOthersCommentsField,
      this.allowEditOthersCommentsCheckbox,
    ] = createCheckboxField({
      value: 'allowEditOthersComments',
      selected: settings.allowEditOthersComments,
      label: cd.s('sd-alloweditotherscomments'),
    });

    [this.alwaysExpandAdvancedField, this.alwaysExpandAdvancedCheckbox] = createCheckboxField({
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

    [this.autopreviewField, this.autopreviewCheckbox] = createCheckboxField({
      value: 'autopreview',
      selected: settings.autopreview,
      label: cd.s('sd-autopreview'),
    });

    [this.collapseThreadsLevelField, this.collapseThreadsLevelInput] = createNumberField({
      value: settings.collapseThreadsLevel,
      min: 0,
      max: 999,
      label: cd.s('sd-collapsethreadslevel'),
      help: cd.s('sd-collapsethreadslevel-help'),
    });

    [
      this.desktopNotificationsField,
      this.desktopNotificationsSelect,
      this.desktopNotificationsRadioAll,
      this.desktopNotificationsRadioNone,
      this.desktopNotificationsRadioToMe,
    ] = createRadioField({
      options: [
        {
          label: cd.s('sd-desktopnotifications-radio-all', mw.user),
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

    [this.enableThreadsField, this.enableThreadsCheckbox] = createCheckboxField({
      value: 'enableThreads',
      selected: settings.enableThreads,
      label: cd.s('sd-enablethreads'),
    });

    [this.hideTimezoneField, this.hideTimezoneCheckbox] = createCheckboxField({
      value: 'hideTimezone',
      selected: settings.hideTimezone,
      label: cd.s('sd-hidetimezone'),
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
      help: wrap(cd.sParse('sd-insertbuttons-help') + ' ' + cd.sParse('sd-localsetting')),
      helpInline: true,
    });

    [this.modifyTocField, this.modifyTocCheckbox] = createCheckboxField({
      value: 'modifyToc',
      selected: settings.modifyToc,
      label: cd.s('sd-modifytoc'),
      help: cd.s('sd-modifytoc-help', mw.user),
    });

    [
      this.notificationsField,
      this.notificationsSelect,
      this.notificationsRadioAll,
      this.notificationsRadioNone,
      this.notificationsRadioToMe,
    ] = createRadioField({
      options: [
        {
          label: cd.s('sd-notifications-radio-all', mw.user),
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

    [this.notifyCollapsedThreadsField, this.notifyCollapsedThreadsCheckbox] = createCheckboxField({
      value: 'notifyCollapsedThreads',
      selected: settings.notifyCollapsedThreads,
      label: cd.s('sd-notifycollapsedthreads'),
    });

    [this.reformatCommentsField, this.reformatCommentsCheckbox] = createCheckboxField({
      value: 'reformatComments',
      selected: settings.reformatComments,
      label: cd.s('sd-reformatcomments'),
    });

    this.removeDataButton = new OO.ui.ButtonWidget({
      label: cd.s('sd-removedata'),
      flags: ['destructive'],
    });
    this.removeDataButton.connect(this, { click: 'removeData' });

    this.removeDataField = new OO.ui.FieldLayout(this.removeDataButton, {
      label: cd.s('sd-removedata-description'),
      align: 'top',
      help: wrap(cd.sParse('sd-removedata-help'), { targetBlank: true }),
      helpInline: true,
    });

    [this.showContribsLinkField, this.showContribsLinkCheckbox] = createCheckboxField({
      value: 'showContribsLink',
      selected: settings.showContribsLink,
      label: cd.s('sd-showcontribslink'),
      classes: ['cd-setting-indented'],
    });

    [this.showToolbarField, this.showToolbarCheckbox] = createCheckboxField({
      value: 'showToolbar',
      selected: settings.showToolbar,
      label: cd.s('sd-showtoolbar'),
    });

    [this.signaturePrefixField, this.signaturePrefixInput] = createTextField({
      value: settings.signaturePrefix,
      maxLength: 100,
      label: cd.s('sd-signatureprefix'),
      help: wrap(cd.sParse('sd-signatureprefix-help') + ' ' + cd.sParse('sd-localsetting')),
    });

    const fortyThreeMinutesAgo = new Date(Date.now() - cd.g.MILLISECONDS_IN_MINUTE * 43);
    const threeDaysAgo = new Date(Date.now() - cd.g.MILLISECONDS_IN_MINUTE * 60 * 24 * 3.3);

    const exampleDefault = formatDateNative(fortyThreeMinutesAgo);
    const exampleImproved1 = formatDateImproved(fortyThreeMinutesAgo);
    const exampleImproved2 = formatDateImproved(threeDaysAgo);
    const exampleRelative1 = formatDateRelative(fortyThreeMinutesAgo);
    const exampleRelative2 = formatDateRelative(threeDaysAgo);

    [
      this.timestampFormatField,
      this.timestampFormatSelect,
      this.timestampFormatRadioDefault,
      this.timestampFormatRadioImproved,
      this.timestampFormatRadioRelative,
    ] = createRadioField({
      options: [
        {
          label: cd.s('sd-timestampformat-radio-default', exampleDefault),
          data: 'default',
        },
        {
          label: cd.s('sd-timestampformat-radio-improved', exampleImproved1, exampleImproved2),
          data: 'improved',
        },
        {
          label: cd.s('sd-timestampformat-radio-relative', exampleRelative1, exampleRelative2),
          data: 'relative',
        },
      ],
      selected: settings.timestampFormat,
      label: cd.s('sd-timestampformat'),
      help: cd.s('sd-timestampformat-help'),
    });

    [
      this.useBackgroundHighlightingField,
      this.useBackgroundHighlightingCheckbox,
    ] = createCheckboxField({
      value: 'useBackgroundHighlighting',
      selected: settings.useBackgroundHighlighting,
      label: cd.s('sd-usebackgroundhighlighting'),
    });

    [this.useUiTimeField, this.useUiTimeCheckbox] = createCheckboxField({
      value: 'useUiTime',
      selected: settings.useUiTime,
      label: cd.s('sd-useuitime'),
    });

    [this.useTemplateDataField, this.useTemplateDataCheckbox] = createCheckboxField({
      value: 'useTemplateData',
      selected: settings.useTemplateData,
      label: cd.s('sd-usetemplatedata'),
      help: cd.s('sd-usetemplatedata-help'),
    });

    [this.useTopicSubscriptionField, this.useTopicSubscriptionCheckbox] = createCheckboxField({
      value: 'useTopicSubscription',
      selected: settings.useTopicSubscription,
      label: wrap(cd.sParse('sd-usetopicsubscription', mw.user), { targetBlank: true }),
      help: wrap(cd.sParse('sd-usetopicsubscription-help'), { targetBlank: true }),
    });

    [this.watchOnReplyField, this.watchOnReplyCheckbox] = createCheckboxField({
      value: 'watchOnReply',
      selected: settings.watchOnReply,
      label: cd.s('sd-watchonreply', mw.user),
    });

    [this.subscribeOnReplyField, this.subscribeOnReplyCheckbox] = createCheckboxField({
      value: 'subscribeOnReply',
      selected: settings.subscribeOnReply,
      label: cd.s('sd-watchsectiononreply', mw.user),
      help: cd.s('sd-watchsectiononreply-help'),
    });
  }

  /**
   * Connect event handlers to controls.
   */
  connectHandlers() {
    this.insertButtonsMultiselect.connect(this, { change: 'updateStates' });
    this.allowEditOthersCommentsCheckbox.connect(this, { change: 'updateStates' });
    this.alwaysExpandAdvancedCheckbox.connect(this, { change: 'updateStates' });
    this.autocompleteTypesMultiselect.connect(this, { select: 'updateStates' });
    this.autopreviewCheckbox.connect(this, { change: 'updateStates' });
    this.collapseThreadsLevelInput.connect(this, { change: 'updateStates' });
    this.desktopNotificationsSelect.connect(this, {
      select: 'updateStates',
      choose: 'onDesktopNotificationsSelectChange',
    });
    this.enableThreadsCheckbox.connect(this, { change: 'updateStates' });
    this.hideTimezoneCheckbox.connect(this, { change: 'updateStates' });
    this.modifyTocCheckbox.connect(this, { change: 'updateStates' });
    this.notificationsSelect.connect(this, { select: 'updateStates' });
    this.notificationsBlacklistMultiselect.connect(this, { change: 'updateStates' });
    this.notifyCollapsedThreadsCheckbox.connect(this, { change: 'updateStates' });
    this.reformatCommentsCheckbox.connect(this, { change: 'updateStates' });
    this.showContribsLinkCheckbox.connect(this, { change: 'updateStates' });
    this.showToolbarCheckbox.connect(this, { change: 'updateStates' });
    this.signaturePrefixInput.connect(this, { change: 'updateStates' });
    this.timestampFormatSelect.connect(this, { select: 'updateStates' });
    this.useBackgroundHighlightingCheckbox.connect(this, { change: 'updateStates' });
    this.useUiTimeCheckbox.connect(this, { change: 'updateStates' });
    this.useTemplateDataCheckbox.connect(this, { change: 'updateStates' });
    this.useTopicSubscriptionCheckbox.connect(this, { change: 'updateStates' });
    this.subscribeOnReplyCheckbox.connect(this, { change: 'updateStates' });
    this.watchOnReplyCheckbox.connect(this, { change: 'updateStates' });
  }

  /**
   * Render control widgets.
   *
   * @param {object} settings Settings according to which to set the control states.
   */
  renderControls(settings) {
    this.createFields(settings);
    this.connectHandlers();

    const talkPagePage = new TalkPagePageLayout(this);
    const commentFormPage = new CommentFormPageLayout(this);
    const timestampsPage = new TimestampsPageLayout(this);
    const notificationsPage = new NotificationsPageLayout(this);
    const removeDataPage = new RemoveDataPageLayout(this);

    this.bookletLayout = new OO.ui.BookletLayout({
      outlined: true,
    });
    this.bookletLayout.addPages([
      talkPagePage,
      commentFormPage,
      timestampsPage,
      notificationsPage,
      removeDataPage,
    ]);

    this.settingsPanel.$element.empty().append(this.bookletLayout.$element);

    this.updateStates();
  }

  /**
   * Get setting values from controls.
   *
   * @returns {object}
   */
  collectSettings() {
    const collectedSettings = {
      allowEditOthersComments: this.allowEditOthersCommentsCheckbox.isSelected(),
      alwaysExpandAdvanced: this.alwaysExpandAdvancedCheckbox.isSelected(),
      autocompleteTypes: this.autocompleteTypesMultiselect.findSelectedItemsData(),
      autopreview: this.autopreviewCheckbox.isSelected(),
      collapseThreadsLevel: Number(this.collapseThreadsLevelInput.getValue()),
      desktopNotifications: (
        this.desktopNotificationsSelect.findSelectedItem()?.getData() ||
        'unknown'
      ),
      enableThreads: this.enableThreadsCheckbox.isSelected(),
      hideTimezone: this.hideTimezoneCheckbox.isSelected(),
      insertButtons: this.getInsertButtons(),
      modifyToc: this.modifyTocCheckbox.isSelected(),
      notifications: this.notificationsSelect.findSelectedItem()?.getData(),
      notificationsBlacklist: this.notificationsBlacklistMultiselect.getValue(),
      notifyCollapsedThreads: this.notifyCollapsedThreadsCheckbox.isSelected(),
      reformatComments: this.reformatCommentsCheckbox.isSelected(),
      showContribsLink: this.showContribsLinkCheckbox.isSelected(),
      showToolbar: this.showToolbarCheckbox.isSelected(),
      signaturePrefix: this.signaturePrefixInput.getValue(),
      timestampFormat: this.timestampFormatSelect.findSelectedItem()?.getData(),
      topicSubscriptionSeenNotice: this.settings.topicSubscriptionSeenNotice,
      useBackgroundHighlighting: this.useBackgroundHighlightingCheckbox.isSelected(),
      useUiTime: this.useUiTimeCheckbox.isSelected(),
      useTemplateData: this.useTemplateDataCheckbox.isSelected(),
      useTopicSubscription: this.useTopicSubscriptionCheckbox.isSelected(),
      watchOnReply: this.watchOnReplyCheckbox.isSelected(),
      subscribeOnReply: this.subscribeOnReplyCheckbox.isSelected(),
    };
    collectedSettings.haveInsertButtonsBeenAltered = (
      JSON.stringify(collectedSettings.insertButtons) !==
      JSON.stringify(settings.scheme.default.insertButtons)
    );

    return collectedSettings;
  }

  /**
   * Process the insert buttons multiselect data to get the insert buttons.
   *
   * @returns {string[]}
   */
  getInsertButtons() {
    return this.insertButtonsMultiselect
      .getValue()
      .map((value) => {
        const hidden = [];
        value = hideText(value, /\\[+;\\]/g, hidden);
        let [, snippet, label] = value.match(/^(.*?)(?:;(.+))?$/) || [];
        if (!snippet?.replace(/^ +$/, '')) return;
        snippet = unhideText(snippet, hidden);
        label = label && unhideText(label, hidden);
        return [snippet, label].filter(defined);
      })
      .filter(defined);
  }

  /**
   * Update the control states.
   */
  async updateStates() {
    this.showContribsLinkCheckbox.setDisabled(!this.reformatCommentsCheckbox.isSelected());

    const useTemplateDataCheckboxDisabled = !this.autocompleteTypesMultiselect
      .findItemFromData('templates')
      .isSelected();
    this.useTemplateDataCheckbox.setDisabled(useTemplateDataCheckboxDisabled);

    const hideTimezoneCheckboxDisabled = (
      this.timestampFormatSelect.findSelectedItem()?.getData() === 'relative'
    );
    this.hideTimezoneCheckbox.setDisabled(hideTimezoneCheckboxDisabled);

    let areInputsValid = true;
    try {
      await this.collapseThreadsLevelInput.getValidity();
    } catch {
      areInputsValid = false;
    }

    const collectedSettings = this.collectSettings();
    const save = !areObjectsEqual(collectedSettings, this.settings, true) && areInputsValid;
    const reset = !areObjectsEqual(collectedSettings, settings.scheme.default, true);

    this.actions.setAbilities({ save, reset });
  }

  /**
   * Handler of the event of change of the desktop notifications radio select.
   *
   * @param {external:OO.ui.RadioOptionWidget} option
   */
  onDesktopNotificationsSelectChange(option) {
    if (typeof Notification === 'undefined') return;

    if (option.data !== 'none' && Notification.permission !== 'granted') {
      OO.ui.alert(cd.s('dn-grantpermission'));
      Notification.requestPermission((permission) => {
        if (permission !== 'granted') {
          this.desktopNotificationsSelect.selectItemByData('none');
        }
      });
    }
  }

  /**
   * Remove script data as requested by the user after confirmation.
   */
  async removeData() {
    if (confirm(cd.s('sd-removedata-confirm'))) {
      this.pushPending();

      try {
        await Promise.all([
          setLocalOption(cd.g.LOCAL_SETTINGS_OPTION_NAME, undefined),
          setLocalOption(cd.g.VISITS_OPTION_NAME, undefined),
          setLocalOption(cd.g.SUBSCRIPTIONS_OPTION_NAME, undefined),
          setGlobalOption(cd.g.SETTINGS_OPTION_NAME, undefined),
        ]);
      } catch (e) {
        handleDialogError(this, e, 'sd-error-removedata', false);
        return;
      }

      mw.storage.remove('convenientDiscussions-commentForms');
      mw.storage.remove('convenientDiscussions-thanks');
      mw.storage.remove('convenientDiscussions-seenRenderedChanges');

      this.stackLayout.setItem(this.dataRemovedPanel);
      this.actions.setMode('dataRemoved');

      this.popPending();
    }
  }
}

/**
 * Class used to create the "Talk page" booklet page.
 *
 * @augments external:OO.ui.PageLayout
 * @private
 */
class TalkPagePageLayout extends OO.ui.PageLayout {
  /**
   * Create the "Talk page" booklet page.
   *
   * @param {SettingsDialog} dialog Settings dialog that has the booklet page.
   */
  constructor(dialog) {
    super('isTalkPage');
    this.$element.append([
      dialog.reformatCommentsField.$element,
      dialog.showContribsLinkField.$element,
      dialog.allowEditOthersCommentsField.$element,
      dialog.enableThreadsField.$element,
      dialog.modifyTocField.$element,
      dialog.useBackgroundHighlightingField.$element,
      dialog.collapseThreadsLevelField.$element,
    ]);
  }

  /**
   * OOUI native widget used to set up the outline item.
   */
  setupOutlineItem() {
    this.outlineItem.setLabel(cd.s('sd-page-talkpage'));
  }
}

/**
 * Class used to create the "Comment form" booklet page.
 *
 * @augments external:OO.ui.PageLayout
 * @private
 */
class CommentFormPageLayout extends OO.ui.PageLayout {
  /**
   * Create the "Comment form" booklet page.
   *
   * @param {SettingsDialog} dialog Settings dialog that has the booklet page.
   */
  constructor(dialog) {
    super('commentForm');
    this.$element.append([
      dialog.autopreviewField.$element,
      dialog.watchOnReplyField.$element,
      dialog.subscribeOnReplyField.$element,
      dialog.showToolbarField.$element,
      dialog.alwaysExpandAdvancedField.$element,
      dialog.autocompleteTypesField.$element,
      dialog.useTemplateDataField.$element,
      dialog.insertButtonsField.$element,
      dialog.signaturePrefixField.$element,
    ]);
  }

  /**
   * OOUI native widget used to set up the outline item.
   */
  setupOutlineItem() {
    this.outlineItem.setLabel(cd.s('sd-page-commentform'));
  }
}

/**
 * Class used to create the "Timestamps" booklet page.
 *
 * @augments external:OO.ui.PageLayout
 * @private
 */
class TimestampsPageLayout extends OO.ui.PageLayout {
  /**
   * Create the "Timestamps" booklet page.
   *
   * @param {SettingsDialog} dialog Settings dialog that has the booklet page.
   */
  constructor(dialog) {
    super('timestamps');
    this.$element.append([
      dialog.useUiTimeField.$element,
      dialog.hideTimezoneField.$element,
      dialog.timestampFormatField.$element,
    ]);
  }

  /**
   * OOUI native widget used to set up the outline item.
   */
  setupOutlineItem() {
    this.outlineItem.setLabel(cd.s('sd-page-timestamps'));
  }
}

/**
 * Class used to create the "Notifications" booklet page.
 *
 * @augments external:OO.ui.PageLayout
 * @private
 */
class NotificationsPageLayout extends OO.ui.PageLayout {
  /**
   * Create the "Notifications" booklet page.
   *
   * @param {SettingsDialog} dialog Settings dialog that has the booklet page.
   */
  constructor(dialog) {
    super('notifications');
    this.$element.append([
      dialog.useTopicSubscriptionField.$element,
      dialog.notificationsField.$element,
      dialog.desktopNotificationsField.$element,
      dialog.notifyCollapsedThreadsField.$element,
      dialog.notificationsBlacklistField.$element,
    ]);
  }

  /**
   * OOUI native widget used to set up the outline item.
   */
  setupOutlineItem() {
    this.outlineItem.setLabel(cd.s('sd-page-notifications'));
  }
}

/**
 * Class used to create the "Remove data" booklet page.
 *
 * @augments external:OO.ui.PageLayout
 * @private
 */
class RemoveDataPageLayout extends OO.ui.PageLayout {
  /**
   * Create the "Remove data" booklet page.
   *
   * @param {SettingsDialog} dialog Settings dialog that has the booklet page.
   */
  constructor(dialog) {
    super('removeData');
    this.$element.append(dialog.removeDataField.$element);
  }

  /**
   * OOUI native widget used to set up the outline item.
   */
  setupOutlineItem() {
    this.outlineItem.setLabel(cd.s('sd-page-dataremoval'));
  }
}

tweakUserOoUiClass(SettingsDialog, OO.ui.ProcessDialog);
tweakUserOoUiClass(TalkPagePageLayout, OO.ui.PageLayout);
tweakUserOoUiClass(CommentFormPageLayout, OO.ui.PageLayout);
tweakUserOoUiClass(TimestampsPageLayout, OO.ui.PageLayout);
tweakUserOoUiClass(NotificationsPageLayout, OO.ui.PageLayout);
tweakUserOoUiClass(RemoveDataPageLayout, OO.ui.PageLayout);

export default SettingsDialog;
