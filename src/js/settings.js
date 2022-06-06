import cd from './cd';
import { areObjectsEqual, ucFirst } from './util';
import { getUserInfo, setGlobalOption, setLocalOption } from './apiWrappers';

export default {
  /**
   * Settings scheme: default, undocumented, local settings, aliases.
   */
  scheme: {
    // Settings set for the current wiki only.
    local: ['haveInsertButtonsBeenAltered', 'insertButtons', 'signaturePrefix'],

    // Settings not shown in the settings dialog.
    undocumented: [
      'defaultCommentLinkType',
      'defaultSectionLinkType',
      'showLoadingOverlay',
    ],

    // Aliases for seamless transition when changing a setting name.
    aliases: {
      allowEditOthersComments: ['allowEditOthersMsgs'],
      alwaysExpandAdvanced: ['alwaysExpandSettings'],
      haveInsertButtonsBeenAltered: ['areInsertButtonsAltered', 'insertButtonsChanged'],
      desktopNotifications: ['browserNotifications'],
      signaturePrefix: ['mySig', 'mySignature'],
      subscribeOnReply: ['watchSectionOnReply'],
    },
  },

  /**
   * Set the default settings to the settings scheme object.
   *
   * @private
   */
  setDefaults() {
    this.scheme.default = {
      allowEditOthersComments: false,
      alwaysExpandAdvanced: false,

      // If the user has never changed the insert buttons configuration, it should change with the
      // default configuration change.
      haveInsertButtonsBeenAltered: false,

      // The order should coincide with the order of checkboxes in
      // `SettingsDialog#autocompleteTypesMultiselect` in modal.js - otherwise the "Save" and
      // "Reset" buttons in the settings dialog won't work properly.
      autocompleteTypes: ['mentions', 'commentLinks', 'wikilinks', 'templates', 'tags'],

      autopreview: true,
      desktopNotifications: 'unknown',
      defaultCommentLinkType: null,
      defaultSectionLinkType: null,
      enableThreads: true,
      hideTimezone: false,
      insertButtons: cd.config.defaultInsertButtons || [],
      notifications: 'all',
      notifyCollapsedThreads: false,
      notificationsBlacklist: [],
      reformatComments: null,
      showContribsLink: false,
      showLoadingOverlay: true,
      showToolbar: true,
      signaturePrefix: cd.config.defaultSignaturePrefix,
      timestampFormat: 'default',
      topicSubscriptionSeenNotice: false,
      modifyToc: true,
      useBackgroundHighlighting: true,
      useTemplateData: true,
      useTopicSubscription: Boolean(mw.loader.getState('ext.discussionTools.init')),
      useUiTime: true,
      watchOnReply: true,
      subscribeOnReply: true,
    };
  },

  /**
   * _For internal use._ Initiate user settings.
   */
  async init() {
    // We fill the settings after the modules are loaded so that the settings set via common.js had
    // less chance not to load.

    this.setDefaults();

    const values = {};

    const options = {
      [cd.g.SETTINGS_OPTION_NAME]: mw.user.options.get(cd.g.SETTINGS_OPTION_NAME),
      [cd.g.LOCAL_SETTINGS_OPTION_NAME]: mw.user.options.get(cd.g.LOCAL_SETTINGS_OPTION_NAME),
    };

    // Settings in variables like "cdAlowEditOthersComments" used before server-stored settings
    // were implemented.
    Object.keys(this.scheme.default).forEach((name) => {
      (this.scheme.aliases[name] || []).concat(name).forEach((alias) => {
        const varAlias = 'cd' + ucFirst(alias);
        if (
          varAlias in window &&
          (
            typeof window[varAlias] === typeof this.scheme.default[name] ||
            this.scheme.default[name] === null
          )
        ) {
          values[name] = window[varAlias];
        }
      });
    });

    const remoteSettings = await this.load({
      options,
      omitLocal: true,
    });
    Object.keys(remoteSettings).forEach((name) => {
      if (!this.scheme.undocumented.includes(name)) {
        values[name] = remoteSettings[name];
      }
    });

    // Seamless transition from "mySignature". TODO: Remove at some point (this was introduced in
    // November 2020).
    if (values.signaturePrefix !== undefined) {
      values.signaturePrefix = values.signaturePrefix.replace(cd.g.SIGN_CODE, '');
    }

    if (
      !values.haveInsertButtonsBeenAltered &&
      JSON.stringify(values.insertButtons) !== JSON.stringify(cd.config.defaultInsertButtons)
    ) {
      values.insertButtons = cd.config.defaultInsertButtons;
    }

    this.set(Object.assign({}, this.scheme.default, values));

    if (!areObjectsEqual(this.values, remoteSettings)) {
      this.save().catch((e) => {
        console.warn('Couldn\'t save the settings to the server.', e);
      });
    }

    // Settings in variables like "cdLocal..." override all other and are not saved to the server.
    this.set(this.getLocalOverrides());
  },

  /**
   * Request the settings from the server, or extract the settings from the existing options
   * strings.
   *
   * @param {object} [options={}]
   * @param {object} [options.options] Object containing strings with the local and global settings.
   * @param {boolean} [options.omitLocal=false] Whether to omit variables set via `cdLocal...`
   *   variables (they shouldn't need to be saved to the server).
   * @param {boolean} [options.reuse=false] If `options` is not set, reuse the cached user info
   *   request.
   * @returns {Promise.<object>}
   */
  async load({
    options,
    omitLocal = false,
    reuse = false,
  } = {}) {
    if (!options?.[cd.g.SETTINGS_OPTION_NAME]) {
      ({ options } = await getUserInfo(reuse));
    }

    let globalSettings;
    try {
      globalSettings = JSON.parse(options[cd.g.SETTINGS_OPTION_NAME]) || {};
    } catch {
      globalSettings = {};
    }

    let localSettings;
    try {
      localSettings = JSON.parse(options[cd.g.LOCAL_SETTINGS_OPTION_NAME]) || {};
    } catch (e) {
      localSettings = {};
    }

    let settings = {};
    Object.keys(this.scheme.default).forEach((name) => {
      (this.scheme.aliases[name] || []).concat(name).forEach((alias) => {
        // Global settings override those set via personal JS.
        if (
          globalSettings[alias] !== undefined &&
          (
            typeof globalSettings[alias] === typeof this.scheme.default[name] ||
            this.scheme.default[name] === null
          )
        ) {
          settings[name] = globalSettings[alias];
        }

        // Local settings override global.
        if (
          localSettings[alias] !== undefined &&
          (
            typeof localSettings[alias] === typeof this.scheme.default[name] ||
            this.scheme.default[name] === null
          )
        ) {
          settings[name] = localSettings[alias];
        }
      });
    });

    if (!omitLocal) {
      Object.assign(settings, this.getLocalOverrides());
    }

    return settings;
  },

  /**
   * _For internal use._ Get settings set in common.js that are meant to override native settings.
   *
   * @returns {object}
   */
  getLocalOverrides() {
    const settings = {};
    Object.keys(this.scheme.default).forEach((name) => {
      (this.scheme.aliases[name] || []).concat(name).forEach((alias) => {
        const varLocalAlias = 'cdLocal' + ucFirst(alias);
        if (
          varLocalAlias in window &&
          (
            typeof window[varLocalAlias] === typeof this.scheme.default[name] ||
            this.scheme.default[name] === null
          )
        ) {
          settings[name] = window[varLocalAlias];
        }
      });
    });
    return settings;
  },

  /**
   * Change the value of a setting or a set of settings at once.
   *
   * @param {string|object} name
   * @param {string} value
   */
  set(name, value) {
    this.values = this.values || {};
    const values = typeof name === 'string' ? { [name]: value } : name;
    Object.assign(this.values, values);
  },

  /**
   * Get the value of a setting.
   *
   * @param {string} name
   * @returns {*}
   */
  get(name) {
    return name ? this.values[name] : this.values;
  },

  /**
   * Save the settings to the server. This function will split the settings into the global and
   * local ones and make two respective requests.
   *
   * @param {object} [settings=this.values] Settings to save.
   */
  async save(settings = this.values) {
    if (!cd.user.isRegistered()) return;

    if (cd.config.useGlobalPreferences) {
      const globalSettings = {};
      const localSettings = {};
      Object.keys(settings).forEach((key) => {
        if (this.scheme.local.includes(key)) {
          localSettings[key] = settings[key];
        } else {
          globalSettings[key] = settings[key];
        }
      });

      await Promise.all([
        setLocalOption(cd.g.LOCAL_SETTINGS_OPTION_NAME, JSON.stringify(localSettings)),
        setGlobalOption(cd.g.SETTINGS_OPTION_NAME, JSON.stringify(globalSettings))
      ]);
    } else {
      await setLocalOption(cd.g.LOCAL_SETTINGS_OPTION_NAME, JSON.stringify(settings));
    }
  },
};
