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
import { hideText, unhideText } from './util';
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
   * Create widget fields with states of controls set according to setting values.
   *
   * @param {object} settingValues Values of settings according to which to set the states of
   *   controls.
   */
  createFields(settingValues) {
    this.controls = {};
    Object.entries(settings.scheme.ui).forEach(([key, data]) => {
      switch (data.type) {
        case 'checkbox':
          this.controls[key] = createCheckboxField({
            value: key,
            selected: settingValues[key],
            label: data.label,
            help: data.help,
            classes: data.classes,
          });
          this.controls[key].input.connect(this, { change: 'updateStates' });
          break;

        case 'radio':
          this.controls[key] = createRadioField({
            options: data.options,
            selected: settingValues[key],
            label: data.label,
            help: data.help,
          });
          this.controls[key].select.connect(this, { select: 'updateStates' });
          break;

        case 'text':
          this.controls[key] = createTextField({
            value: settingValues[key],
            maxLength: 100,
            label: data.label,
            help: data.help,
          });
          this.controls[key].input.connect(this, { change: 'updateStates' });
          break;

        case 'number':
          this.controls[key] = createNumberField({
            value: settingValues[key],
            min: data.min,
            max: data.max,
            buttonStep: data.buttonStep,
            label: data.label,
            help: data.help,
          });
          this.controls[key].input.connect(this, { change: 'updateStates' });
          break;

        case 'multicheckbox':
          this.controls[key] = {};
          this.controls[key].multiselect = new OO.ui.CheckboxMultiselectWidget({
            items: data.options.map((option) => (
              new OO.ui.CheckboxMultioptionWidget({
                data: option.data,
                selected: settingValues[key].includes(option.data),
                label: option.label,
              })
            )),
            classes: data.classes,
          });
          this.controls[key].multiselect.connect(this, { select: 'updateStates' });
          this.controls[key].field = new OO.ui.FieldLayout(this.controls[key].multiselect, {
            label: data.label,
            align: 'top',
          });
          break;

        case 'multitag':
          this.controls[key] = {};
          this.controls[key].multiselect = new OO.ui.TagMultiselectWidget({
            placeholder: data.placeholder,
            allowArbitrary: true,
            inputPosition: 'outline',
            tagLimit: data.tagLimit,
            selected: (data.valueModifier || ((val) => val)).call(null, settingValues[key]),
          });
          this.controls[key].multiselect.connect(this, { change: 'updateStates' });
          this.controls[key].field = new OO.ui.FieldLayout(this.controls[key].multiselect, {
            label: data.label,
            align: 'top',
            help: data.help,
            helpInline: true,
          });
          break;

        case 'button':
          this.controls[key] = {};
          this.controls[key].button = new OO.ui.ButtonWidget({
            label: data.label,
            flags: data.flags,
          });
          this.controls[key].field = new OO.ui.FieldLayout(this.controls[key].button, {
            label: data.fieldLabel,
            align: 'top',
            help: data.help,
            helpInline: true,
          });
          break;
      }
    });

    this.controls.removeData.button.connect(this, { click: 'removeData' });
    this.controls.desktopNotifications.select.connect(this, {
      choose: 'onDesktopNotificationsSelectChange',
    });
  }

  /**
   * Render control widgets.
   *
   * @param {object} settingValues Values of settings according to which to set the states of
   *   controls.
   */
  renderControls(settingValues) {
    settings.initUi();
    this.createFields(settingValues);

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
    const collectedSettings = {};
    Object.entries(settings.scheme.ui).forEach(([key, data]) => {
      switch (data.type) {
        case 'checkbox':
          collectedSettings[key] = this.controls[key].input.isSelected();
          break;
        case 'radio':
          collectedSettings[key] = (
            this.controls[key].select.findSelectedItem()?.getData() ||
            settings.scheme.default[key]
          );
          break;
        case 'text':
          collectedSettings[key] = this.controls[key].input.getValue();
          break;
        case 'number':
          collectedSettings[key] = Number(this.controls[key].input.getValue());
          break;
        case 'multicheckbox':
          collectedSettings[key] = this.controls[key].multiselect.findSelectedItemsData();
          break;
        case 'multitag':
          collectedSettings[key] = this.controls[key].multiselect.getValue();
          break;
      }
    });

    collectedSettings.insertButtons = collectedSettings.insertButtons
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
    settings.scheme.states.forEach((state) => {
      collectedSettings[state] = this.settings[state];
    });
    collectedSettings.haveInsertButtonsBeenAltered = (
      JSON.stringify(collectedSettings.insertButtons) !==
      JSON.stringify(settings.scheme.default.insertButtons)
    );

    return collectedSettings;
  }

  /**
   * Update the control states.
   */
  async updateStates() {
    this.controls.showContribsLink.input.setDisabled(
      !this.controls.reformatComments.input.isSelected()
    );

    const useTemplateDataCheckboxDisabled = !this.controls.autocompleteTypes.multiselect
      .findItemFromData('templates')
      .isSelected();
    this.controls.useTemplateData.input.setDisabled(useTemplateDataCheckboxDisabled);

    const hideTimezoneCheckboxDisabled = (
      this.controls.timestampFormat.select.findSelectedItem()?.getData() === 'relative'
    );
    this.controls.hideTimezone.input.setDisabled(hideTimezoneCheckboxDisabled);

    let areInputsValid = true;
    try {
      await this.controls.collapseThreadsLevel.input.getValidity();
      await this.controls.highlightNewInterval.input.getValidity();
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
          this.controls.desktopNotifications.select.selectItemByData('none');
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
      mw.storage.remove('convenientDiscussions-collapsedThreads');
      mw.storage.remove('convenientDiscussions-mutedUsers');

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
      'reformatComments',
      'showContribsLink',
      'allowEditOthersComments',
      'enableThreads',
      'collapseThreadsLevel',
      'modifyToc',
      'useBackgroundHighlighting',
      'highlightNewInterval',
      'improvePerformance',
    ].map((key) => dialog.controls[key].field.$element));
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
      'autopreview',
      'watchOnReply',
      'subscribeOnReply',
      'showToolbar',
      'alwaysExpandAdvanced',
      'autocompleteTypes',
      'useTemplateData',
      'insertButtons',
      'signaturePrefix',
    ].map((key) => dialog.controls[key].field.$element));
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
      'useUiTime',
      'hideTimezone',
      'timestampFormat',
    ].map((key) => dialog.controls[key].field.$element));
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
      'useTopicSubscription',
      'desktopNotifications',
      'notifications',
      'notifyCollapsedThreads',
    ].map((key) => dialog.controls[key].field.$element));
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
    this.$element.append(dialog.controls.removeData.field.$element);
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
