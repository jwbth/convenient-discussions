import cd from './cd';
import controller from './controller';
import settings from './settings';
import { areObjectsEqual } from './util';
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

    this.preparatoryRequests = [
      settings.load({ omitLocal: true }),
    ];

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
      this.bookletLayout.setPage(this.initialPageName || settings.scheme.ui[0].name);
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
   * @returns {object}
   */
  createPages(settingValues) {
    const controls = {};
    const pages = settings.scheme.ui.map((pageData) => {
      const $fields = pageData.controls.map((data) => {
        const name = data.name;
        switch (data.type) {
          case 'checkbox':
            controls[name] = createCheckboxField({
              value: name,
              selected: settingValues[name],
              label: data.label,
              help: data.help,
              classes: data.classes,
            });
            controls[name].input.connect(this, { change: 'updateStates' });
            break;

          case 'radio':
            controls[name] = createRadioField({
              options: data.options,
              selected: settingValues[name],
              label: data.label,
              help: data.help,
            });
            controls[name].select.connect(this, { select: 'updateStates' });
            break;

          case 'text':
            controls[name] = createTextField({
              value: settingValues[name],
              maxLength: 100,
              label: data.label,
              help: data.help,
            });
            controls[name].input.connect(this, { change: 'updateStates' });
            break;

          case 'number':
            controls[name] = createNumberField({
              value: settingValues[name],
              min: data.min,
              max: data.max,
              buttonStep: data.buttonStep,
              label: data.label,
              help: data.help,
              classes: data.classes,
            });
            controls[name].input.connect(this, { change: 'updateStates' });
            break;

          case 'multicheckbox':
            controls[name] = {};
            controls[name].multiselect = new OO.ui.CheckboxMultiselectWidget({
              items: data.options.map((option) => (
                new OO.ui.CheckboxMultioptionWidget({
                  data: option.data,
                  selected: settingValues[name].includes(option.data),
                  label: option.label,
                })
              )),
              classes: data.classes,
            });
            controls[name].multiselect.connect(this, { select: 'updateStates' });
            controls[name].field = new OO.ui.FieldLayout(controls[name].multiselect, {
              label: data.label,
              align: 'top',
            });
            break;

          case 'multitag':
            controls[name] = {};
            controls[name].multiselect = new OO.ui.TagMultiselectWidget({
              placeholder: data.placeholder,
              allowArbitrary: true,
              inputPosition: 'outline',
              tagLimit: data.tagLimit,
              selected: (data.dataToUi || ((val) => val)).call(null, settingValues[name]),
            });
            controls[name].multiselect.connect(this, { change: 'updateStates' });
            controls[name].field = new OO.ui.FieldLayout(controls[name].multiselect, {
              label: data.label,
              align: 'top',
              help: data.help,
              helpInline: true,
            });
            break;

          case 'button':
            controls[name] = {};
            controls[name].button = new OO.ui.ButtonWidget({
              label: data.label,
              flags: data.flags,
            });
            controls[name].field = new OO.ui.FieldLayout(controls[name].button, {
              label: data.fieldLabel,
              align: 'top',
              help: data.help,
              helpInline: true,
            });
            break;
        }

        return controls[name].field.$element;
      });

      // eslint-disable-next-line jsdoc/require-jsdoc
      const PageLayout = class extends OO.ui.PageLayout {
        // eslint-disable-next-line jsdoc/require-jsdoc
        constructor() {
          super(pageData.name);
          this.$element.append($fields);
        }

        // eslint-disable-next-line jsdoc/require-jsdoc
        setupOutlineItem() {
          this.outlineItem.setLabel(pageData.label);
        }
      };
      tweakUserOoUiClass(PageLayout, OO.ui.PageLayout);
      const page = new PageLayout(this);
      return page;
    });

    controls.removeData.button.connect(this, { click: 'removeData' });
    controls.desktopNotifications.select.connect(this, {
      choose: 'onDesktopNotificationsSelectChange',
    });

    this.controls = controls;

    return pages;
  }

  /**
   * Render control widgets.
   *
   * @param {object} settingValues Values of settings according to which to set the states of
   *   controls.
   */
  renderControls(settingValues) {
    settings.initUi();

    this.bookletLayout = new OO.ui.BookletLayout({
      outlined: true,
    });
    this.bookletLayout.addPages(this.createPages(settingValues));
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
    const controls = this.controls;
    settings.scheme.ui.forEach((pageData) => {
      pageData.controls.forEach((data) => {
        const name = data.name;
        switch (data.type) {
          case 'checkbox':
            collectedSettings[name] = controls[name].input.isSelected();
            break;
          case 'radio':
            collectedSettings[name] = (
              controls[name].select.findSelectedItem()?.getData() ||
              settings.scheme.default[name]
            );
            break;
          case 'text':
            collectedSettings[name] = controls[name].input.getValue();
            break;
          case 'number':
            collectedSettings[name] = Number(controls[name].input.getValue());
            break;
          case 'multicheckbox':
            collectedSettings[name] = controls[name].multiselect.findSelectedItemsData();
            break;
          case 'multitag':
            collectedSettings[name] = (data.uiToData || ((val) => val)).call(
              null,
              controls[name].multiselect.getValue()
            );
            break;
        }
      });
    });

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
    const controls = this.controls;

    controls.collapseThreadsLevel.input.setDisabled(!controls.enableThreads.input.isSelected());
    controls.hideTimezone.input.setDisabled(
      controls.timestampFormat.select.findSelectedItem()?.getData() === 'relative'
    );
    controls.notifyCollapsedThreads.input.setDisabled(
      controls.desktopNotifications.select.findSelectedItem()?.getData() === 'none' &&
      controls.notifications.select.findSelectedItem()?.getData() === 'none'
    );
    controls.showContribsLink.input.setDisabled(!controls.reformatComments.input.isSelected());
    controls.useTemplateData.input.setDisabled(
      !controls.autocompleteTypes.multiselect.findItemFromData('templates').isSelected()
    );

    let areInputsValid = true;
    const numberSettingNames = [].concat(...settings.scheme.ui.map((pageData) => (
      pageData.controls
        .filter((data) => data.type === 'number')
        .map((data) => data.name)
    )));
    await Promise.all(numberSettingNames.map((name) => controls[name].input.getValidity()))
      .catch(() => {
        areInputsValid = false;
      });

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

tweakUserOoUiClass(SettingsDialog, OO.ui.ProcessDialog);

export default SettingsDialog;
