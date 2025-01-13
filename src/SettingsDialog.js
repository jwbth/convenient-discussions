import ProcessDialog from './ProcessDialog';
import StorageItem from './StorageItem';
import cd from './cd';
import controller from './controller';
import settings from './settings';
import { saveGlobalOption, saveLocalOption } from './utils-api';
import { areObjectsEqual } from './utils-general';
import { createCheckboxField, createNumberField, createRadioField, createTextField, es6ClassToOoJsClass } from './utils-oojs';

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

  /** @type {ControlsByName} */
  controls;

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
   * @param {object} data.loadedSettings Loaded settings
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

      controller.addPreventUnloadCondition('dialog', () => this.isUnsaved());
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

        controller.removePreventUnloadCondition('dialog');

        this.stack.setItem(this.reloadPanel);
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
        this.confirmClose();
      });
    } else if (action === 'reset') {
      return new OO.ui.Process(() => {
        if (confirm(cd.s('sd-reset-confirm'))) {
          const currentPageName = /** @type {string} */ (this.bookletLayout.getCurrentPageName());
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
   * @protected
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
              ...data,
            });
            controls[name].input.on('change', this.updateAbilities.bind(this));
            break;

          case 'radio':
            controls[name] = createRadioField({
              selected: settingValues[name],
              ...data,
            });
            controls[name].select.on('select', this.updateAbilities.bind(this));
            break;

          case 'text':
            controls[name] = createTextField({
              value: settingValues[name],
              ...data,
            });
            controls[name].input.on('change', this.updateAbilities.bind(this));
            break;

          case 'number':
            controls[name] = createNumberField({
              value: settingValues[name],
              ...data,
            });
            controls[name].input.on('change', this.updateAbilities.bind(this));
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
            controls[name].multiselect.on('select', this.updateAbilities.bind(this));
            controls[name].field = new OO.ui.FieldLayout(controls[name].multiselect, {
              label: data.label,
              align: 'top',
            });
            break;

          case 'tags':
            controls[name] = {};
            controls[name].multiselect = new OO.ui.TagMultiselectWidget({
              placeholder: data.placeholder,
              allowArbitrary: true,
              inputPosition: 'outline',
              tagLimit: data.tagLimit,
              selected: (data.dataToUi || ((val) => val)).call(null, settingValues[name]),
            });
            controls[name].multiselect.on('change', this.updateAbilities.bind(this));
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
   * @returns {object}
   * @protected
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
          case 'tags':
            collectedSettings[name] = (data.uiToData || ((val) => val)).call(
              null,
              controls[name].multiselect.getValue()
            );
            break;
        }
      });
    });

    return Object.assign(
      {},
      settings.scheme.default,
      collectedSettings,
      this.getStateSettings(),
      {
        'insertButtons-altered': (
          JSON.stringify(collectedSettings.insertButtons) !==
          JSON.stringify(settings.scheme.default.insertButtons)
        ),
      },
    );
  }

  /**
   * Update the control states.
   *
   * @protected
   */
  async updateAbilities() {
    const controls = this.controls;

    const threadsEnabled = controls.enableThreads.input.isSelected();
    controls.collapseThreads.input.setDisabled(!threadsEnabled);
    controls.collapseThreadsLevel.input.setDisabled(
      !threadsEnabled || !controls.collapseThreads.input.isSelected()
    );
    controls.hideTimezone.input.setDisabled(
      controls.timestampFormat.select.findSelectedItem()?.getData() === 'relative'
    );
    controls.notifyCollapsedThreads.input.setDisabled(
      controls.desktopNotifications.select.findSelectedItem()?.getData() === 'none' &&
      controls.notifications.select.findSelectedItem()?.getData() === 'none'
    );
    controls.outdentLevel.input.setDisabled(!controls.outdent.input.isSelected());
    controls.showContribsLink.input.setDisabled(!controls.reformatComments.input.isSelected());
    controls.useTemplateData.input.setDisabled(
      !controls.autocompleteTypes.multiselect.findItemFromData('templates').isSelected()
    );

    let valid = true;
    await Promise.all(
      Object.values(controls)
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
  onDesktopNotificationsSelectChange(option) {
    if (typeof Notification === 'undefined') return;

    if (option.getData() !== 'none' && Notification.permission !== 'granted') {
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
   *
   * @protected
   */
  async removeData() {
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
