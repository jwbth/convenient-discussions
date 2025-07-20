import ProcessDialog from './ProcessDialog';
import StorageItem from './StorageItem';
import bootController from './bootController';
import cd from './cd';
import settings from './settings';
import { saveGlobalOption, saveLocalOption } from './utils-api';
import { areObjectsEqual } from './utils-general';
import { createCheckboxControl, createNumberControl, createRadioControl, createTextControl, es6ClassToOoJsClass, createMulticheckboxControl, createTagsControl as createMultitagControl, createButtonControl } from './utils-oojs';

/**
 * Class used to create a settings dialog.
 *
 * @augments ProcessDialog
 */
class SettingsDialog extends ProcessDialog {
  // @ts-ignore: https://phabricator.wikimedia.org/T358416
  static name = 'settingsDialog';
  static title = cd.s('sd-title');
  static actions = [
    {
      action: 'close',
      modes: ['settings', 'reboot', 'dataRemoved'],
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
      action: 'reboot',
      modes: ['reboot'],
      label: cd.s('sd-reload'),
      flags: ['primary', 'progressive'],
    },
  ];
  static size = 'large';
  static cdKey = 'sd';

  /** @type {OO.ui.StackLayout} */
  stack;

  /** @type {OO.ui.PanelLayout} */
  loadingPanel;

  /** @type {OO.ui.PanelLayout} */
  settingsPanel;

  /** @type {OO.ui.PanelLayout} */
  reloadPanel;

  /** @type {OO.ui.PanelLayout} */
  dataDeletedPanel;

  /** @type {OO.ui.BookletLayout} */
  bookletLayout;

  controls = /** @type {ControlTypesByName<import('./settings')['default']['scheme']['controlTypes'] >} */ ({});

  /** @type {Partial<import('./settings').SettingsValues>} */
  loadedSettings;

  /** @type {Partial<import('./settings').SettingsValues>} */
  collectedSettings;

  /**
   * Create a settings dialog.
   *
   * @param {string} [initialPageName]
   * @param {string} [focusSelector]
   */
  constructor(initialPageName, focusSelector) {
    super({ classes: ['cd-dialog-settings'] });
    this.initialPageName = initialPageName;
    this.focusSelector = focusSelector;
  }

  /**
   * OOUI native method to get the height of the window body.
   *
   * @returns {number}
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getBodyHeight
   * @ignore
   */
  getBodyHeight() {
    return 600;
  }

  /**
   * OOUI native method that initializes window contents.
   *
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#initialize
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   * @ignore
   */
  initialize() {
    super.initialize();

    this.pushPending();

    this.loadingPanel = new OO.ui.PanelLayout({
      padded: true,
      expanded: false,
    });
    this.loadingPanel.$element.append($('<div>').text(cd.s('loading-ellipsis')));

    this.settingsPanel = new OO.ui.PanelLayout({
      padded: false,
      expanded: true,
    });

    this.reloadPanel = new OO.ui.PanelLayout({
      padded: true,
      expanded: false,
    });
    this.reloadPanel.$element.append($('<p>').text(cd.s('sd-saved')));

    this.dataDeletedPanel = new OO.ui.PanelLayout({
      padded: true,
      expanded: false,
    });
    this.dataDeletedPanel.$element.append($('<p>').text(cd.s('sd-dataremoved')));

    this.stack = new OO.ui.StackLayout({
      items: [this.loadingPanel, this.settingsPanel, this.reloadPanel, this.dataDeletedPanel],
    });

    this.$body.append(this.stack.$element);

    return this;
  }

  /**
   * OOUI native method that returns a "setup" process which is used to set up a window for use in a
   * particular context, based on the `data` argument.
   *
   * @param {object} data Dialog opening data
   * @param {Partial<import('./settings').SettingsValues>} data.loadedSettings Loaded settings
   * @returns {OO.ui.Process}
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getSetupProcess
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   * @ignore
   */
  getSetupProcess({ loadedSettings }) {
    return super.getSetupProcess().next(() => {
      this.stack.setItem(this.loadingPanel);
      this.actions.setMode('settings');
      this.loadedSettings = loadedSettings;
    });
  }

  /**
   * OOUI native method that returns a "ready" process which is used to ready a window for use in a
   * particular context, based on the `data` argument.
   *
   * @returns {OO.ui.Process}
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getReadyProcess
   * @see https://www.mediawiki.org/wiki/OOUI/Windows#Window_lifecycle
   * @ignore
   */
  getReadyProcess() {
    return super.getReadyProcess().next(async () => {
      // this.settings can be empty after removing the data using the relevant functionality in the
      // UI.
      if (!Object.keys(this.loadedSettings).length) {
        this.loadedSettings = settings.get();
      }

      this.renderControls(this.loadedSettings);

      this.stack.setItem(this.settingsPanel);
      this.bookletLayout.setPage(this.initialPageName || settings.scheme.ui[0].name);
      if (this.focusSelector) {
        this.$body.find(this.focusSelector).focus();
      }
      this.actions.setAbilities({ close: true });

      this.popPending();

      bootController.addPreventUnloadCondition('dialog', () => this.isUnsaved());
    });
  }

  /**
   * OOUI native method that returns a process for taking action.
   *
   * @param {string} action Symbolic name of the action.
   * @returns {OO.ui.Process}
   * @see https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.ProcessDialog.html#getActionProcess
   * @ignore
   */
  getActionProcess(action) {
    if (action === 'save') {
      return new OO.ui.Process(async () => {
        this.pushPending();

        try {
          await settings.save(this.collectSettings());
        } catch (error) {
          this.handleError(error, 'error-settings-save', true);
          return;
        }

        bootController.removePreventUnloadCondition('dialog');

        this.stack.setItem(this.reloadPanel);
        this.actions.setMode('reboot');

        this.popPending();
      });
    } else if (action === 'reboot') {
      return new OO.ui.Process(() => {
        this.close();
        location.reload();
      });
    } else if (action === 'close') {
      return new OO.ui.Process(() => {
        this.confirmClose();
      });
    } else if (action === 'reset') {
      return new OO.ui.Process(() => {
        if (confirm(cd.s('sd-reset-confirm'))) {
          this.renderControls(settings.scheme.default);
          this.bookletLayout.setPage(/** @type {string} */(this.bookletLayout.getCurrentPageName()));
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
   * @protected
   */
  createPages(settingValues) {
    // eslint-disable-next-line no-one-time-vars/no-one-time-vars
    const pages = settings.scheme.ui.map((pageData) => {
      const $fields = pageData.controls.map((data) => {
        const name = data.name;
        switch (data.type) {
          case 'checkbox':
            this.controls[name] = createCheckboxControl({
              .../** @type {import('./utils-oojs').CheckboxControlOptions} */ (data),
              selected: settingValues[name],
            });
            this.controls[name].input.on('change', this.updateAbilities.bind(this));
            break;

          case 'radio':
            this.controls[name] = createRadioControl({
              .../** @type {import('./utils-oojs').RadioControlOptions} */ (data),
              selected: settingValues[name],
            });
            this.controls[name].input.on('select', this.updateAbilities.bind(this));
            break;

          case 'text':
            this.controls[name] = createTextControl({
              .../** @type {import('./utils-oojs').TextControlOptions} */ (data),
              value: settingValues[name],
            });
            this.controls[name].input.on('change', this.updateAbilities.bind(this));
            break;

          case 'number':
            this.controls[name] = createNumberControl({
              .../** @type {import('./utils-oojs').NumberControlOptions} */ (data),
              value: settingValues[name],
            });
            this.controls[name].input.on('change', this.updateAbilities.bind(this));
            break;

          case 'multicheckbox':
            this.controls[name] = createMulticheckboxControl({
              .../** @type {import('./utils-oojs').MulticheckboxControlOptions} */ (data),
              selected: settingValues[name],
            });
            this.controls[name].input.on('select', this.updateAbilities.bind(this));
            break;

          case 'multitag':
            this.controls[name] = createMultitagControl({
              .../** @type {import('./utils-oojs').MultitagControlOptions} */ (data),
              selected: settingValues[name],
            });
            this.controls[name].input.on('change', this.updateAbilities.bind(this));
            break;

          case 'button':
            this.controls[name] = createButtonControl({
              .../** @type {import('./utils-oojs').ButtonControlOptions} */ (data),
            });
            break;
        }

        return this.controls[name].field.$element;
      });

      // eslint-disable-next-line jsdoc/require-jsdoc
      return new (es6ClassToOoJsClass(class extends OO.ui.PageLayout {
        // eslint-disable-next-line jsdoc/require-jsdoc
        constructor() {
          super(pageData.name);
          this.$element.append($fields);
        }

        // eslint-disable-next-line jsdoc/require-jsdoc
        setupOutlineItem() {
          /** @type {OO.ui.OutlineOptionWidget} */ (this.outlineItem).setLabel(pageData.label);
        }
      }))();
    });

    this.controls.removeData.input.connect(this, { click: this.removeData });
    this.controls.desktopNotifications.input.connect(this, {
      choose: this.onDesktopNotificationsSelectChange,
    });

    return pages;
  }

  /**
   * Render control widgets.
   *
   * @param {object} settingValues Values of settings according to which to set the states of
   *   controls.
   * @protected
   */
  renderControls(settingValues) {
    settings.initUi();

    this.bookletLayout = new OO.ui.BookletLayout({
      outlined: true,
    });
    this.bookletLayout.addPages(this.createPages(settingValues), 0);
    this.settingsPanel.$element.empty().append(this.bookletLayout.$element);

    this.updateAbilities();
  }

  /**
   * Get an object with settings related to states (see {@link module:settings.scheme}).
   *
   * @returns {object}
   * @protected
   */
  getStateSettings() {
    return settings.scheme.states.reduce((obj, state) => {
      obj[state] = this.loadedSettings[state];
      return obj;
    }, {});
  }

  /**
   * Get setting values from controls.
   *
   * @returns {Partial<import('./settings').SettingsValues>}
   * @protected
   */
  collectSettings() {
    this.collectedSettings = Object.entries(this.controls)
      .reduce((settingsValues, [name, control]) => {
        switch (control.type) {
          case 'checkbox':
            settingsValues[name] = control.input.isSelected();
            break;
          case 'radio':
            settingsValues[name] = control.input.findSelectedItem()?.getData() || settings.scheme.default[name];
            break;
          case 'text':
            settingsValues[name] = control.input.getValue();
            break;
          case 'number':
            settingsValues[name] = Number(control.input.getValue());
            break;
          case 'multicheckbox':
            settingsValues[name] = control.input.findSelectedItemsData();
            break;
          case 'multitag':
            settingsValues[name] = (control.uiToData || ((val) => val)).call(
              null,
              control.input.getValue()
            );
            break;
        }

        return settingsValues;
      }, {});

    return {
      ...settings.scheme.default,
      ...this.collectedSettings,
      ...this.getStateSettings(),
      'insertButtons-altered': (
        JSON.stringify(this.collectedSettings.insertButtons) !==
        JSON.stringify(settings.scheme.default.insertButtons)
      ),
    };
  }

  /**
   * Update the control states.
   *
   * @protected
   */
  async updateAbilities() {
    const threadsEnabled = this.controls.enableThreads.input.isSelected();
    this.controls.collapseThreads.input.setDisabled(!threadsEnabled);
    this.controls.collapseThreadsLevel.input.setDisabled(
      !threadsEnabled || !this.controls.collapseThreads.input.isSelected()
    );
    this.controls.hideTimezone.input.setDisabled(
      this.controls.timestampFormat.input.findSelectedItem()?.getData() === 'relative'
    );
    this.controls.notifyCollapsedThreads.input.setDisabled(
      this.controls.desktopNotifications.input.findSelectedItem()?.getData() === 'none' &&
      this.controls.notifications.input.findSelectedItem()?.getData() === 'none'
    );
    this.controls.outdentLevel.input.setDisabled(!this.controls.outdent.input.isSelected());
    this.controls.showContribsLink.input.setDisabled(
      !this.controls.reformatComments.input.isSelected()
    );
    this.controls.useTemplateData.input.setDisabled(
      !(
        /** @type {import('./RadioOptionWidget').default} */ (
          this.controls.autocompleteTypes.input.findItemFromData('templates')
        ).isSelected()
      )
    );

    let valid = true;
    await Promise.all(
      Object.values(this.controls)
        .filter((control) => control.type === 'number')
        .map((control) => control.input.getValidity())
    ).catch(() => {
      valid = false;
    });

    const collectedSettings = this.collectSettings();
    this.actions.setAbilities({
      save: !areObjectsEqual(collectedSettings, this.loadedSettings) && valid,
      reset: !areObjectsEqual(
        Object.assign({}, collectedSettings),
        Object.assign(
          {},
          settings.scheme.default,
          settings.scheme.resetsTo,
          this.getStateSettings(),
        )
      ),
    });
  }

  /**
   * Handler of the event of change of the desktop notifications radio select.
   *
   * @param {OO.ui.RadioOptionWidget} option
   * @protected
   */
  onDesktopNotificationsSelectChange = (option) => {
    if (typeof Notification === 'undefined') return;

    if (option.getData() !== 'none' && Notification.permission !== 'granted') {
      OO.ui.alert(cd.s('dn-grantpermission'));
      Notification.requestPermission((permission) => {
        if (permission !== 'granted') {
          this.controls.desktopNotifications.input.selectItemByData('none');
        }
      });
    }
  };

  /**
   * Remove script data as requested by the user after confirmation.
   *
   * @protected
   */
  removeData = async () => {
    if (confirm(cd.s('sd-removedata-confirm'))) {
      this.pushPending();

      try {
        await Promise.all([
          saveLocalOption(cd.g.localSettingsOptionName, null),
          saveLocalOption(cd.g.visitsOptionName, null),
          saveLocalOption(cd.g.subscriptionsOptionName, null),
          saveGlobalOption(cd.g.settingsOptionName, null),
        ]);
      } catch (error) {
        this.handleError(error, 'sd-error-removedata', false);
        return;
      }

      (new StorageItem('commentForms')).removeItem();
      (new StorageItem('thanks')).removeItem();
      (new StorageItem('seenRenderedChanges')).removeItem();
      (new StorageItem('collapsedThreads')).removeItem();
      (new StorageItem('mutedUsers')).removeItem();

      this.stack.setItem(this.dataDeletedPanel);
      this.actions.setMode('dataRemoved');

      this.popPending();
    }
  }
}

es6ClassToOoJsClass(SettingsDialog);

export default SettingsDialog;
