/**
 * Settings-related functions and data.
 *
 * @module settings
 */

import cd from './cd';
import pageRegistry from './pageRegistry';
import { areObjectsEqual, defined, hideText, ucFirst, unhideText, wrap } from './util';
import { formatDateImproved, formatDateNative, formatDateRelative } from './timestamp';
import { getUserInfo, setGlobalOption, setLocalOption } from './apiWrappers';

export default {
  /**
   * Settings scheme.
   *
   * @property {object} default Default value for each property.
   * @property {string[]} local List of local setting names. Local settings are settings set for the
   *   current wiki only.
   * @property {string[]} undocumented List of undocumented setting names. Undocumented settings are
   *   settings not shown in the settings dialog.
   * @property {object} aliases List of aliases for each property for seamless transition when
   *   changing a setting name.
   * @property {string[]} states List of state setting names. States are values to be remembered, or
   *   settings to be removed if the time comes. It is, in fact, user data, despite that we don't
   *   have much of it.
   * @property {object[]} ui List of pages of the settings dialog, each with its control objects.
   */
  scheme: {
    local: ['haveInsertButtonsBeenAltered', 'insertButtons', 'signaturePrefix'],

    undocumented: [
      'defaultCommentLinkType',
      'defaultSectionLinkType',
      'showLoadingOverlay',
    ],

    aliases: {
      allowEditOthersComments: ['allowEditOthersMsgs'],
      alwaysExpandAdvanced: ['alwaysExpandSettings'],
      haveInsertButtonsBeenAltered: ['areInsertButtonsAltered', 'insertButtonsChanged'],
      desktopNotifications: ['browserNotifications'],
      signaturePrefix: ['mySig', 'mySignature'],
      subscribeOnReply: ['watchSectionOnReply'],
    },

    states: [
      'haveInsertButtonsBeenAltered',
      'improvePerformanceLastSuggested',
      'notificationsBlacklist',
      'topicSubscriptionSeenNotice',
    ],
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

      // The order should coincide with the order of checkboxes in
      // `SettingsDialog#autocompleteTypesMultiselect` in modal.js - otherwise the "Save" and
      // "Reset" buttons in the settings dialog won't work properly.
      autocompleteTypes: ['mentions', 'commentLinks', 'wikilinks', 'templates', 'tags'],

      autopreview: true,
      collapseThreadsLevel: 10,
      desktopNotifications: 'unknown',
      defaultCommentLinkType: null,
      defaultSectionLinkType: null,
      enableThreads: true,

      // If the user has never changed the insert buttons configuration, it should change with the
      // default configuration change.
      haveInsertButtonsBeenAltered: false,

      hideTimezone: false,
      highlightNewInterval: 15,
      improvePerformance: false,
      improvePerformanceLastSuggested: null,
      insertButtons: cd.config.defaultInsertButtons || [],
      notifications: 'all',
      notifyCollapsedThreads: false,
      notificationsBlacklist: [],
      outdentLevel: 15,
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

      // On wikis where there is no topic subscriptions, watching pages on replying is the
      // alternative to keep track of discussions.
      watchOnReply: !mw.loader.getState('ext.discussionTools.init'),

      subscribeOnReply: true,
    };
  },

  /**
   * _For internal use._ Initialize the configuration of the UI for the
   * {@link SettingsDialog settings dialog}}. This is better called each time the UI is rendered
   * because some content is date-dependent.
   */
  initUi() {
    const outdentTemplateUrl = cd.config.outdentTemplates.length ?
      pageRegistry.get(`Template:${cd.config.outdentTemplates[0]}`).getUrl() :
      'https://en.wikipedia.org/wiki/Template:Outdent';
    const noOutdentTemplateNote = cd.config.outdentTemplates.length ?
      '' :
      ' ' + cd.sParse('sd-outdentlevel-help-notemplate');

    const fortyThreeMinutesAgo = new Date(Date.now() - cd.g.MS_IN_MIN * 43);
    const threeDaysAgo = new Date(Date.now() - cd.g.MS_IN_DAY * 3.3);

    const exampleDefault = formatDateNative(fortyThreeMinutesAgo);
    const exampleImproved1 = formatDateImproved(fortyThreeMinutesAgo);
    const exampleImproved2 = formatDateImproved(threeDaysAgo);
    const exampleRelative1 = formatDateRelative(fortyThreeMinutesAgo);
    const exampleRelative2 = formatDateRelative(threeDaysAgo);

    this.scheme.ui = [
      {
        name: 'talkPage',
        label: cd.s('sd-page-talkpage'),
        controls: [
          {
            name: 'reformatComments',
            type: 'checkbox',
            label: cd.s('sd-reformatcomments'),
          },
          {
            name: 'showContribsLink',
            type: 'checkbox',
            label: cd.s('sd-showcontribslink'),
            classes: ['cd-setting-indented'],
          },
          {
            name: 'allowEditOthersComments',
            type: 'checkbox',
            label: cd.s('sd-alloweditotherscomments'),
          },
          {
            name: 'enableThreads',
            type: 'checkbox',
            label: cd.s('sd-enablethreads'),
          },
          {
            name: 'collapseThreadsLevel',
            type: 'number',
            min: 0,
            max: 999,
            label: cd.s('sd-collapsethreadslevel'),
            help: cd.s('sd-collapsethreadslevel-help'),
            classes: ['cd-setting-indented'],
          },
          {
            name: 'modifyToc',
            type: 'checkbox',
            label: cd.s('sd-modifytoc'),
          },
          {
            name: 'useBackgroundHighlighting',
            type: 'checkbox',
            label: cd.s('sd-usebackgroundhighlighting'),
          },
          {
            name: 'highlightNewInterval',
            type: 'number',
            min: 0,
            max: 99999999,
            buttonStep: 5,
            label: cd.s('sd-highlightnewinterval'),
            help: cd.s('sd-highlightnewinterval-help'),
          },
          {
            name: 'improvePerformance',
            type: 'checkbox',
            label: cd.s('sd-improveperformance'),
            help: cd.s('sd-improveperformance-help'),
          },
        ],
      },
      {
        name: 'commentForm',
        label: cd.s('sd-page-commentform'),
        controls: [
          {
            name: 'autopreview',
            type: 'checkbox',
            label: cd.s('sd-autopreview'),
          },
          {
            name: 'watchOnReply',
            type: 'checkbox',
            label: cd.s('sd-watchonreply', mw.user),
          },
          {
            name: 'subscribeOnReply',
            type: 'checkbox',
            label: cd.s('sd-watchsectiononreply', mw.user),
            help: cd.s('sd-watchsectiononreply-help'),
          },
          {
            name: 'showToolbar',
            type: 'checkbox',
            label: cd.s('sd-showtoolbar'),
          },
          {
            name: 'alwaysExpandAdvanced',
            type: 'checkbox',
            label: cd.s('sd-alwaysexpandadvanced'),
          },
          {
            name: 'outdentLevel',
            type: 'number',
            min: 0,
            max: 999,
            label: wrap(cd.sParse('sd-outdentlevel', outdentTemplateUrl), { targetBlank: true }),
            help: wrap(cd.sParse('sd-outdentlevel-help') + noOutdentTemplateNote),
          },
          {
            name: 'autocompleteTypes',
            type: 'multicheckbox',
            label: cd.s('sd-autocompletetypes'),
            options: [
              {
                data: 'mentions',
                label: cd.s('sd-autocompletetypes-mentions'),
              },
              {
                data: 'commentLinks',
                label: cd.s('sd-autocompletetypes-commentlinks'),
              },
              {
                data: 'wikilinks',
                label: cd.s('sd-autocompletetypes-wikilinks'),
              },
              {
                data: 'templates',
                label: cd.s('sd-autocompletetypes-templates'),
              },
              {
                data: 'tags',
                label: cd.s('sd-autocompletetypes-tags'),
              },
            ],
            classes: ['cd-autocompleteTypesMultiselect'],
          },
          {
            name: 'useTemplateData',
            type: 'checkbox',
            label: cd.s('sd-usetemplatedata'),
            help: cd.s('sd-usetemplatedata-help'),
          },
          {
            name: 'insertButtons',
            type: 'multitag',
            placeholder: cd.s('sd-insertbuttons-multiselect-placeholder'),
            tagLimit: 100,
            label: cd.s('sd-insertbuttons'),
            help: wrap(cd.sParse('sd-insertbuttons-help') + ' ' + cd.sParse('sd-localsetting')),
            dataToUi: (value) => (
              value.map((button) => Array.isArray(button) ? button.join(';') : button)
            ),
            uiToData: (value) => (
              value
                .map((value) => {
                  const hidden = [];
                  value = hideText(value, /\\[+;\\]/g, hidden);
                  let [, snippet, label] = value.match(/^(.*?)(?:;(.+))?$/) || [];
                  if (!snippet?.replace(/^ +$/, '')) return;
                  snippet = unhideText(snippet, hidden);
                  label &&= unhideText(label, hidden);
                  return [snippet, label].filter(defined);
                })
                .filter(defined)
            ),
          },
          {
            name: 'signaturePrefix',
            type: 'text',
            maxLength: 100,
            label: cd.s('sd-signatureprefix'),
            help: wrap(cd.sParse('sd-signatureprefix-help') + ' ' + cd.sParse('sd-localsetting')),
          },
        ],
      },
      {
        name: 'timestamps',
        label: cd.s('sd-page-timestamps'),
        controls: [
          {
            name: 'useUiTime',
            type: 'checkbox',
            label: cd.s('sd-useuitime'),
          },
          {
            name: 'hideTimezone',
            type: 'checkbox',
            label: cd.s('sd-hidetimezone'),
          },
          {
            name: 'timestampFormat',
            type: 'radio',
            options: [
              {
                data: 'default',
                label: cd.s('sd-timestampformat-radio-default', exampleDefault),
              },
              {
                data: 'improved',
                label: cd.s('sd-timestampformat-radio-improved', exampleImproved1, exampleImproved2),
              },
              {
                data: 'relative',
                label: cd.s('sd-timestampformat-radio-relative', exampleRelative1, exampleRelative2),
              },
            ],
            label: cd.s('sd-timestampformat'),
            help: cd.s('sd-timestampformat-help'),
          },
        ],
      },
      {
        name: 'notifications',
        label: cd.s('sd-page-notifications'),
        controls: [
          {
            name: 'useTopicSubscription',
            type: 'checkbox',
            label: wrap(cd.sParse('sd-usetopicsubscription', mw.user), { targetBlank: true }),
            help: wrap(cd.sParse('sd-usetopicsubscription-help'), { targetBlank: true }),
          },
          {
            name: 'desktopNotifications',
            type: 'radio',
            options: [
              {
                data: 'all',
                label: cd.s('sd-desktopnotifications-radio-all', mw.user),
              },
              {
                data: 'toMe',
                label: cd.s('sd-desktopnotifications-radio-tome'),
              },
              {
                data: 'none',
                label: cd.s('sd-desktopnotifications-radio-none'),
              },
            ],
            label: cd.s('sd-desktopnotifications'),
            help: cd.s('sd-desktopnotifications-help', location.hostname),
          },
          {
            name: 'notifications',
            type: 'radio',
            label: cd.s('sd-notifications'),
            options: [
              {
                data: 'all',
                label: cd.s('sd-notifications-radio-all', mw.user),
              },
              {
                data: 'toMe',
                label: cd.s('sd-notifications-radio-tome'),
              },
              {
                data: 'none',
                label: cd.s('sd-notifications-radio-none'),
              },
            ],
          },
          {
            name: 'notifyCollapsedThreads',
            type: 'checkbox',
            label: cd.s('sd-notifycollapsedthreads'),
          },
        ],
      },
      {
        name: 'dataRemoval',
        label: cd.s('sd-page-dataremoval'),
        controls: [
          {
            name: 'removeData',
            type: 'button',
            label: cd.s('sd-removedata'),
            flags: ['destructive'],
            fieldLabel: cd.s('sd-removedata-description'),
            help: wrap(cd.sParse('sd-removedata-help'), { targetBlank: true }),
          },
        ],
      },
    ];
  },

  /**
   * Perform the actual procedure to initialize user settings.
   *
   * @private
   */
  async actuallyInit() {
    // We fill the settings after the modules are loaded so that the settings set via common.js have
    // less chance not to load.

    this.setDefaults();

    const values = {};

    const options = {
      [cd.g.SETTINGS_OPTION_NAME]: mw.user.options.get(cd.g.SETTINGS_OPTION_NAME),
      [cd.g.LOCAL_SETTINGS_OPTION_NAME]: mw.user.options.get(cd.g.LOCAL_SETTINGS_OPTION_NAME),
    };

    // Settings in variables like `cdAlowEditOthersComments` used before server-stored settings
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

    // Settings in variables like `cdLocal...` override all other and are not saved to the server.
    this.set(this.getLocalOverrides());
  },

  /**
   * _For internal use._ Initialize user settings, returning a promise, or return an existing one.
   *
   * @returns {Promise.<undefined>}
   */
  init() {
    this.initPromise ||= this.actuallyInit();

    return this.initPromise;
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
   * Change the value of a setting or a set of settings at once without saving to the server.
   *
   * @param {string|object} name
   * @param {string} value
   */
  set(name, value) {
    this.values ||= {};
    const values = typeof name === 'string' ? { [name]: value } : name;
    Object.assign(this.values, values);
  },

  /**
   * Get the value of a setting without loading from the server.
   *
   * @param {string} name
   * @returns {*}
   */
  get(name) {
    return name ? this.values[name] ?? null : this.values;
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

  /**
   * Update a setting value, saving it to the server and chainging it for the current session as
   * well.
   *
   * @param {?object} loadedSettings The values of the settings. If `null`, they will be loaded.
   * @param {string} key The key of the settings to save.
   * @param {*} value The value to set.
   * @returns {Promise.<undefined>}
   */
  async saveSettingOnTheFly(loadedSettings, key, value) {
    // Set the setting locally before loading the setting in case some part of the code needs the
    // updated setting.
    this.set(key, value);

    loadedSettings ||= await this.load();
    loadedSettings[key] = value;
    const promise = this.save(loadedSettings);
    return promise;
  },
};
