import TextMasker from './TextMasker';
import cd from './cd';
import pageRegistry from './pageRegistry';
import { getUserInfo, saveGlobalOption, saveLocalOption } from './utils-api';
import { areObjectsEqual, defined, definedAndNotNull, subtractDaysFromNow, typedKeysOf, ucFirst } from './utils-general';
import { showConfirmDialog } from './utils-oojs';
import { formatDateImproved, formatDateNative, formatDateRelative } from './utils-timestamp';
import { createSvg, getFooter, wrapHtml } from './utils-window';

/**
 * @typedef {object} SettingsValues
 * @property {boolean} allowEditOthersComments
 * @property {boolean} alwaysExpandAdvanced
 * @property {'name'|'count'|'date'} authorsSort
 * @property {import('./Autocomplete').AutocompleteType[]} autocompleteTypes
 * @property {boolean} autopreview
 * @property {boolean} collapseThreads
 * @property {number} collapseThreadsLevel
 * @property {boolean} countEditsAsNewComments
 * @property {'all'|'toMe'|'none'|'unknown'} desktopNotifications
 * @property {boolean} enableThreads
 * @property {boolean} hideTimezone
 * @property {number} highlightNewInterval
 * @property {boolean} improvePerformance
 * @property {number|null} improvePerformance-lastSuggested
 * @property {Array.<string|[string, string]>} insertButtons
 * @property {boolean} insertButtons-altered
 * @property {boolean} manyForms-onboarded
 * @property {boolean} modifyToc
 * @property {boolean} toggleChildThreads-onboarded
 * @property {'all'|'toMe'|'none'} notifications
 * @property {boolean} notifyCollapsedThreads
 * @property {boolean} outdent
 * @property {number} outdentLevel
 * @property {boolean|null} reformatComments
 * @property {boolean} showContribsLink
 * @property {boolean} showToolbar
 * @property {string} signaturePrefix
 * @property {boolean} subscribeOnReply
 * @property {import('./LiveTimestamp').TimestampFormat} timestampFormat
 * @property {boolean} upload-onboarded
 * @property {boolean} useBackgroundHighlighting
 * @property {boolean} useTemplateData
 * @property {boolean} useTopicSubscription
 * @property {boolean} useUiTime
 * @property {boolean} watchOnReply
 * @property {'wikilink'|'link'|null} defaultCommentLinkType Undocumented setting.
 * @property {'wikilink'|'link'|null} defaultSectionLinkType Undocumented setting.
 * @property {boolean} showLoadingOverlay Undocumented setting.
 */

/**
 * @typedef {keyof SettingsValues} SettingName
 */

/**
 * @typedef {(
 *   & import('./utils-oojs').ControlOptionsBase
 *   & { name: SettingName | 'removeData' }
 *   & { [x: string]: any }
 * )} UiControlData
 */

/**
 * @typedef {object} UiPageData
 * @property {string} name
 * @property {string} label
 * @property {UiControlData[]} controls
 */

/**
 * Singleton for settings-related methods and data.
 */
class Settings {
  /**
   * @type {SettingsValues}
   * @private
   */
  values = /** @type {SettingsValues} */ ({});

  /**
   * @type {Promise<void>}
   * @private
   */
  initPromise;

  /**
   * @typedef {'defaultCommentLinkType'|'defaultSectionLinkType'|'showLoadingOverlay'} UndocumentedSettingName
   */

  /**
   * @typedef {Omit<SettingsValues, UndocumentedSettingName>} DocumentedSettingsValues
   */

  /**
   * @typedef {object} Scheme
   * @property {DocumentedSettingsValues} default Default value for each property.
   * @property {SettingName[]} local List of local setting names. Local settings are settings set
   *   for the current wiki only.
   * @property {Pick<SettingsValues, UndocumentedSettingName>} undocumented Undocumented settings
   *   with their defaults. Undocumented settings are settings not shown in the settings dialog and
   *   not saved to the server.
   * @property {{ [name in keyof Partial<SettingsValues>]: string[] }} aliases List of aliases for
   *   each property for seamless transition when changing a setting name.
   * @property {SettingName[]} states List of state setting names. States are values to be
   *   remembered, or settings to be removed if the time comes. It is, in fact, user data, despite
   *   that we don't have much of it.
   * @property {Partial<SettingsValues>} resetsTo For settings that are resetted not to their
   *   default values, those non-default values are specified here (used to determine whether the
   *   "Reset" button should be enabled).
   * @property {{ [name: string]: ControlType }} controlTypes Types of controls for settings that
   *   are present in the settings dialog.
   * @property {UiPageData[]} ui List of pages of the settings dialog, each with its control
   *   objects.
   */

  /**
   * Settings scheme.
   */
  scheme = {
    /**
     * List of local setting names. Local settings are settings set for the current wiki only.
     *
     * @type {SettingName[]}
     */
    local: ['insertButtons-altered', 'insertButtons', 'signaturePrefix'],

    /**
     * Undocumented settings with their defaults. Undocumented settings are settings not shown in
     * the settings dialog and not saved to the server.
     *
     * @type {Pick<SettingsValues, UndocumentedSettingName>}
     */
    undocumented: {
      defaultCommentLinkType: null,
      defaultSectionLinkType: null,
      showLoadingOverlay: true,
    },

    /**
     * List of aliases for each property for seamless transition when changing a setting name.
     *
     * @type {{ [name in keyof Partial<SettingsValues>]: string[] }}
     */
    aliases: {
      'insertButtons-altered': ['haveInsertButtonsBeenAltered'],
      'improvePerformance-lastSuggested': ['improvePerformanceLastSuggested'],
      'subscribeOnReply': ['watchSectionOnReply'],
    },

    /**
     * List of state setting names. States are values to be remembered, or settings to be removed
     * if the time comes. It is, in fact, user data, despite that we don't have much of it.
     *
     * @type {SettingName[]}
     */
    states: [
      'authorsSort',
      'insertButtons-altered',
      'improvePerformance-lastSuggested',
      'manyForms-onboarded',
      'toggleChildThreads-onboarded',
      'upload-onboarded',
    ],

    /**
     * For settings that are resetted not to their default values, those non-default values are
     * specified here (used to determine whether the "Reset" button should be enabled).
     *
     * @type {Partial<SettingsValues>}
     */
    resetsTo: {
      reformatComments: false,
    },

    /**
     * Types of controls for settings that are present in the settings dialog.
     */
    controlTypes: /** @type {const} */ ({
      allowEditOthersComments: 'checkbox',
      alwaysExpandAdvanced: 'checkbox',
      autopreview: 'checkbox',
      autocompleteTypes: 'multicheckbox',
      collapseThreads: 'checkbox',
      collapseThreadsLevel: 'number',
      countEditsAsNewComments: 'checkbox',
      desktopNotifications: 'radio',
      enableThreads: 'checkbox',
      hideTimezone: 'checkbox',
      highlightNewInterval: 'number',
      improvePerformance: 'checkbox',
      insertButtons: 'multitag',
      modifyToc: 'checkbox',
      notifications: 'radio',
      notifyCollapsedThreads: 'checkbox',
      outdent: 'checkbox',
      outdentLevel: 'number',
      reformatComments: 'checkbox',
      removeData: 'button',
      showContribsLink: 'checkbox',
      showToolbar: 'checkbox',
      signaturePrefix: 'text',
      subscribeOnReply: 'checkbox',
      timestampFormat: 'radio',
      useBackgroundHighlighting: 'checkbox',
      useTemplateData: 'checkbox',
      useTopicSubscription: 'checkbox',
      useUiTime: 'checkbox',
      watchOnReply: 'checkbox',
    }),

    /**
     * Default value for each property.
     *
     * @type {DocumentedSettingsValues}
     */
    default: /** @type {DocumentedSettingsValues} */ ({}),

    /**
     * List of pages of the settings dialog, each with its control objects.
     *
     * @type {UiPageData[]}
     */
    ui: [],
  };

  /**
   * Set the default settings to the settings scheme object.
   *
   * @private
   */
  initDefaults() {
    this.scheme.default = {
      'allowEditOthersComments': false,
      'alwaysExpandAdvanced': false,
      'authorsSort': 'name',

      // The order should coincide with the order of checkboxes in the autocompleteTypes setting -
      // otherwise the "Save" and "Reset" buttons in the settings dialog won't work properly.
      'autocompleteTypes': ['mentions', 'commentLinks', 'wikilinks', 'templates', 'tags'],

      'autopreview': true,
      'collapseThreads': true,
      'collapseThreadsLevel': 10,
      'countEditsAsNewComments': false,
      'desktopNotifications': 'unknown',
      'enableThreads': true,
      'hideTimezone': false,
      'highlightNewInterval': 15,
      'improvePerformance': false,
      'improvePerformance-lastSuggested': null,
      'insertButtons': cd.config.defaultInsertButtons || [],
      'insertButtons-altered': false,
      'manyForms-onboarded': false,
      'modifyToc': true,
      'toggleChildThreads-onboarded': false,
      'notifications': 'all',
      'notifyCollapsedThreads': false,
      'outdent': true,
      'outdentLevel': 15,
      'reformatComments': null,
      'showContribsLink': false,
      'showToolbar': true,
      'signaturePrefix': cd.config.defaultSignaturePrefix,
      'subscribeOnReply': true,
      'timestampFormat': 'default',
      'upload-onboarded': false,
      'useBackgroundHighlighting': true,
      'useTemplateData': true,
      'useTopicSubscription': Boolean(mw.loader.getState('ext.discussionTools.init')),
      'useUiTime': true,

      // On wikis where there is no topic subscriptions, watching pages on replying is the
      // alternative to keep track of discussions.
      'watchOnReply': !mw.loader.getState('ext.discussionTools.init'),
    };
  }

  /**
   * _For internal use._ Initialize the configuration of the UI for the
   * {@link SettingsDialog settings dialog}}. This is better called each time the UI is rendered
   * because some content is date-dependent.
   */
  initUi() {
    // eslint-disable-next-line no-one-time-vars/no-one-time-vars
    const outdentTemplateUrl =
      (
        cd.config.outdentTemplates.length &&
        pageRegistry.get(`Template:${cd.config.outdentTemplates[0]}`)?.getUrl()
      ) ||
      'https://en.wikipedia.org/wiki/Template:Outdent';

    const fortyThreeMinutesAgo = new Date(Date.now() - cd.g.msInMin * 43);
    const threeDaysAgo = new Date(subtractDaysFromNow(3.3));

    // eslint-disable-next-line no-one-time-vars/no-one-time-vars
    const exampleDefault = formatDateNative(fortyThreeMinutesAgo);
    // eslint-disable-next-line no-one-time-vars/no-one-time-vars
    const exampleImproved1 = formatDateImproved(fortyThreeMinutesAgo);
    // eslint-disable-next-line no-one-time-vars/no-one-time-vars
    const exampleImproved2 = formatDateImproved(threeDaysAgo);
    // eslint-disable-next-line no-one-time-vars/no-one-time-vars
    const exampleRelative1 = formatDateRelative(fortyThreeMinutesAgo);
    // eslint-disable-next-line no-one-time-vars/no-one-time-vars
    const exampleRelative2 = formatDateRelative(threeDaysAgo);

    this.scheme.ui = [
      {
        name: 'talkPage',
        label: cd.s('sd-page-talkpage'),
        controls: [
          {
            name: 'reformatComments',
            type: this.scheme.controlTypes.reformatComments,
            label: cd.s('sd-reformatcomments'),
          },
          {
            name: 'showContribsLink',
            type: this.scheme.controlTypes.showContribsLink,
            label: cd.s('sd-showcontribslink'),
            classes: ['cd-setting--indented'],
          },
          {
            name: 'allowEditOthersComments',
            type: this.scheme.controlTypes.allowEditOthersComments,
            label: cd.s('sd-alloweditotherscomments'),
          },
          {
            name: 'enableThreads',
            type: this.scheme.controlTypes.enableThreads,
            label: cd.s('sd-enablethreads'),
          },
          {
            name: 'collapseThreads',
            type: this.scheme.controlTypes.collapseThreads,
            label: cd.s('sd-collapsethreadslevel'),
            classes: ['cd-setting--indented'],
          },
          {
            name: 'collapseThreadsLevel',
            type: this.scheme.controlTypes.collapseThreadsLevel,
            min: 0,
            max: 999,
            classes: ['cd-setting--indented-twice', 'cd-setting-collapseThreadsLevel'],
          },
          {
            name: 'modifyToc',
            type: this.scheme.controlTypes.modifyToc,
            label: cd.s('sd-modifytoc'),
          },
          {
            name: 'useBackgroundHighlighting',
            type: this.scheme.controlTypes.useBackgroundHighlighting,
            label: cd.s('sd-usebackgroundhighlighting'),
          },
          {
            name: 'highlightNewInterval',
            type: this.scheme.controlTypes.highlightNewInterval,
            min: 0,
            max: 9999999,
            buttonStep: 5,
            label: cd.s('sd-highlightnewinterval'),
            help: cd.s('sd-highlightnewinterval-help'),
          },
          {
            name: 'countEditsAsNewComments',
            type: this.scheme.controlTypes.countEditsAsNewComments,
            label: cd.s('sd-counteditsasnewcomments'),
          },
          {
            name: 'improvePerformance',
            type: this.scheme.controlTypes.improvePerformance,
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
            type: this.scheme.controlTypes.autopreview,
            label: cd.s('sd-autopreview'),
          },
          {
            name: 'watchOnReply',
            type: this.scheme.controlTypes.watchOnReply,
            label: cd.s('sd-watchonreply', mw.user),
          },
          {
            name: 'subscribeOnReply',
            type: this.scheme.controlTypes.subscribeOnReply,
            label: cd.s('sd-watchsectiononreply', mw.user),
            help: cd.s('sd-watchsectiononreply-help'),
          },
          {
            name: 'showToolbar',
            type: this.scheme.controlTypes.showToolbar,
            label: cd.s('sd-showtoolbar'),
          },
          {
            name: 'alwaysExpandAdvanced',
            type: this.scheme.controlTypes.alwaysExpandAdvanced,
            label: cd.s('sd-alwaysexpandadvanced'),
          },
          {
            name: 'outdent',
            type: this.scheme.controlTypes.outdent,
            label: wrapHtml(cd.sParse('sd-outdentlevel', outdentTemplateUrl), {
              targetBlank: true,
            }),
          },
          {
            name: 'outdentLevel',
            type: this.scheme.controlTypes.outdentLevel,
            min: 0,
            max: 999,
            help: wrapHtml(cd.sParse('sd-outdentlevel-help-notemplate')),
            classes: ['cd-setting--indented'],
          },
          {
            name: 'autocompleteTypes',
            type: this.scheme.controlTypes.autocompleteTypes,
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
            type: this.scheme.controlTypes.useTemplateData,
            label: cd.s('sd-usetemplatedata'),
            help: cd.s('sd-usetemplatedata-help'),
          },
          {
            name: 'insertButtons',
            type: this.scheme.controlTypes.insertButtons,
            placeholder: cd.s('sd-insertbuttons-multiselect-placeholder'),
            tagLimit: 100,
            label: cd.s('sd-insertbuttons'),
            help: wrapHtml(cd.sParse('sd-insertbuttons-help') + ' ' + cd.sParse('sd-localsetting')),
            dataToUi: (/** @type {Array<string|string[]>} */ value) =>
              value.map((button) => (Array.isArray(button) ? button.join(';') : button)),
            uiToData: (/** @type {string[]} */ value) =>
              value
                .map((value) => {
                  const textMasker = new TextMasker(value).mask(/\\[+;\\]/g);
                  let [, snippet, label] = textMasker.getText().match(/^(.*?)(?:;(.+))?$/) || [];
                  if (!snippet?.replace(/^ +$/, '')) return;

                  snippet = textMasker.unmaskText(snippet);
                  label &&= textMasker.unmaskText(label);

                  return [snippet, label].filter(defined);
                })
                .filter(defined),
          },
          {
            name: 'signaturePrefix',
            type: this.scheme.controlTypes.signaturePrefix,
            maxLength: 100,
            label: cd.s('sd-signatureprefix'),
            help: wrapHtml(
              cd.sParse('sd-signatureprefix-help') + ' ' + cd.sParse('sd-localsetting')
            ),
          },
        ],
      },
      {
        name: 'timestamps',
        label: cd.s('sd-page-timestamps'),
        controls: [
          {
            name: 'useUiTime',
            type: this.scheme.controlTypes.useUiTime,
            label: wrapHtml(
              cd.sParse('sd-useuitime', 'Special:Preferences#mw-prefsection-rendering-timeoffset'),
              { targetBlank: true }
            ),
          },
          {
            name: 'hideTimezone',
            type: this.scheme.controlTypes.hideTimezone,
            label: cd.s('sd-hidetimezone'),
          },
          {
            name: 'timestampFormat',
            type: this.scheme.controlTypes.timestampFormat,
            label: cd.s('sd-timestampformat'),
            options: [
              {
                data: 'default',
                label: cd.s('sd-timestampformat-radio-default', exampleDefault),
              },
              {
                data: 'improved',
                label: cd.s(
                  'sd-timestampformat-radio-improved',
                  exampleImproved1,
                  exampleImproved2
                ),
              },
              {
                data: 'relative',
                label: cd.s(
                  'sd-timestampformat-radio-relative',
                  exampleRelative1,
                  exampleRelative2
                ),
              },
            ],
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
            type: this.scheme.controlTypes.useTopicSubscription,
            label: wrapHtml(cd.sParse('sd-usetopicsubscription', mw.user), { targetBlank: true }),
            help: wrapHtml(cd.sParse('sd-usetopicsubscription-help'), { targetBlank: true }),
          },
          {
            name: 'notifications',
            type: this.scheme.controlTypes.notifications,
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
            help: cd.s('sd-notifications-help'),
          },
          {
            name: 'desktopNotifications',
            type: this.scheme.controlTypes.desktopNotifications,
            label: cd.s('sd-desktopnotifications'),
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
            help: cd.s('sd-desktopnotifications-help', cd.g.serverName),
          },
          {
            name: 'notifyCollapsedThreads',
            type: this.scheme.controlTypes.notifyCollapsedThreads,
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
            type: this.scheme.controlTypes.removeData,
            label: cd.s('sd-removedata'),
            flags: ['destructive'],
            fieldLabel: cd.s('sd-removedata-description'),
            help: wrapHtml(cd.sParse('sd-removedata-help'), { targetBlank: true }),
          },
        ],
      },
    ];
  }

  /**
   * _For internal use._ Initialize user settings, returning a promise, or return an existing one.
   *
   * @returns {Promise.<void>}
   */
  init() {
    this.initPromise ||= (async () => {
      // We fill the settings after the modules are loaded so that the settings set via common.js
      // have less chance not to load.

      this.initDefaults();

      const options = {
        [cd.g.settingsOptionName]: mw.user.options.get(cd.g.settingsOptionName),
        [cd.g.localSettingsOptionName]: mw.user.options.get(cd.g.localSettingsOptionName),
      };

      const remoteSettings = await this.load({
        options,
        omitLocal: true,
      });

      this.set({
        ...this.scheme.default,

        // Settings in global variables like cdAllowEditOthersComments used before server-stored
        // settings were implemented and used for undocumented settings now.
        ...this.getSettingPropertiesOfObject(window, 'cd'),

        ...remoteSettings,
      });

      // If the user has never changed the insert buttons configuration, it should change with the
      // default configuration change.
      if (
        !this.values['insertButtons-altered'] &&
        JSON.stringify(this.values.insertButtons) !== JSON.stringify(cd.config.defaultInsertButtons)
      ) {
        this.values.insertButtons = cd.config.defaultInsertButtons;
      }

      // Migrate users to the new schema where 0 doesn't mean autocollapse for collapseThreadsLevel
      // and outdentLevel. Instead, you need to check a box.
      if (remoteSettings.outdent === undefined) {
        if (this.values.outdentLevel === 0) {
          this.values.outdentLevel = this.scheme.default.outdentLevel;
          this.values.outdent = false;
        }
        if (this.values.collapseThreadsLevel === 0) {
          this.values.collapseThreadsLevel = this.scheme.default.collapseThreadsLevel;
          this.values.collapseThreads = false;
        }
      }

      if (!areObjectsEqual(this.values, remoteSettings)) {
        this.save().catch((error) => {
          console.warn('Couldn\'t save the settings to the server.', error);
        });
      }

      // Undocumented settings and settings in variables `cd...` and `cdLocal...` override all other
      // and are not saved to the server.
      this.set(Object.assign(
        {},
        this.scheme.undocumented,
        this.getSettingPropertiesOfObject(window, 'cd', this.scheme.undocumented),
        this.getLocalOverrides(),
      ));
    })();

    return this.initPromise;
  }

  /**
   * Request the settings from the server, or extract the settings from the existing options
   * strings.
   *
   * @param {object} [options={}]
   * @param {{ [key: string]: string }} [options.options] Object containing strings with the local
   *   and global settings.
   * @param {boolean} [options.omitLocal=false] Whether to omit variables set via `cdLocal...`
   *   variables (they shouldn't be saved to the server).
   * @param {boolean} [options.reuse=false] If `options` is not set, reuse the cached user info
   *   request.
   * @returns {Promise.<Partial<SettingsValues>>}
   */
  async load({
    options,
    omitLocal = false,
    reuse = false,
  } = {}) {
    if (!options?.[cd.g.settingsOptionName]) {
      ({ options } = await getUserInfo(reuse));
    }

    let globalSettings;
    try {
      globalSettings = JSON.parse(options[cd.g.settingsOptionName]) || {};
    } catch {
      globalSettings = {};
    }

    let localSettings;
    try {
      localSettings = JSON.parse(options[cd.g.localSettingsOptionName]) || {};
    } catch (error) {
      localSettings = {};
    }

    return {
      ...this.getSettingPropertiesOfObject(globalSettings),
      ...this.getSettingPropertiesOfObject(localSettings),
      ...(omitLocal ? this.getLocalOverrides() : {}),
    };
  }

  /**
   * Get the properties of an object corresponding to settings with an optional prefix.
   *
   * @param {{ [key: string]: any }} source
   * @param {string} [prefix]
   * @param {Partial<SettingsValues>} [defaults=this.scheme.default]
   * @returns {Partial<SettingsValues>}
   * @private
   */
  getSettingPropertiesOfObject(source, prefix, defaults = this.scheme.default) {
    return typedKeysOf(defaults).reduce((target, name) => {
      (this.scheme.aliases[name] || [])
        .concat(name)
        .map((alias) => prefix ? prefix + ucFirst(alias) : alias)
        .filter((prop) => (
          source[prop] !== undefined &&
          (typeof source[prop] === typeof defaults[name] || defaults[name] === null)
        ))
        .forEach((prop) => {
          target[name] = source[prop];
        });

      return target;
    }, /** @type {Partial<SettingsValues>} */ ({}));
  }

  /**
   * Get settings set in common.js that are meant to override native settings.
   *
   * @returns {Partial<SettingsValues>}
   * @private
   */
  getLocalOverrides() {
    return this.getSettingPropertiesOfObject(window, 'cdLocal');
  }

  /**
   * @overload
   * @param {string} name
   * @param {any} value
   *
   * @overload
   * @param {object} values
   * @returns {void}
   */

  /**
   * Change the value of a setting or a set of settings at once without saving to the server.
   *
   * @param {string|object} name
   * @param {string} [value]
   * @private
   */
  set(name, value) {
    Object.assign(this.values, typeof name === 'string' ? { [name]: value } : name);
  }

  /**
   * @template {SettingName} Name
   * @overload
   * @param {Name} name The name of the setting.
   * @returns {SettingsValues[Name]} The value of the setting.
   *
   * @overload
   * @param {string} name The name of the setting.
   * @returns {undefined} If the setting is not found.
   *
   * @overload
   * @returns {SettingsValues} An object containing all settings.
   */

  /**
   * Get the value of a setting without loading from the server.
   *
   * @param {string} [name]
   * @returns {SettingsValues[SettingName]|undefined|SettingsValues}
   */
  get(name) {
    return name ? ((name in this.values) ? this.values[name] : undefined) : this.values;
  }

  /**
   * Save the settings to the server. This function will split the settings into the global and
   * local ones and make two respective requests.
   *
   * @param {Partial<DocumentedSettingsValues>} [settings=this.values] Settings to save.
   */
  async save(settings = this.values) {
    if (!cd.user.isRegistered()) return;

    if (cd.config.useGlobalPreferences) {
      const globalSettings = {};
      const localSettings = {};
      typedKeysOf(settings).forEach((key) => {
        if (this.scheme.local.includes(key)) {
          localSettings[key] = settings[key];
        } else {
          globalSettings[key] = settings[key];
        }
      });

      await Promise.all([
        saveLocalOption(cd.g.localSettingsOptionName, JSON.stringify(localSettings)),
        saveGlobalOption(cd.g.settingsOptionName, JSON.stringify(globalSettings)),
      ]);
    } else {
      await saveLocalOption(cd.g.localSettingsOptionName, JSON.stringify(settings));
    }
  }

  /**
   * Update a setting value, saving it to the server and changing it for the current session as
   * well. This should be done cautiously, because many settings only have effect on page reload.
   *
   * @param {string} key The key of the settings to save.
   * @param {*} value The value to set.
   * @returns {Promise.<void>}
   */
  async saveSettingOnTheFly(key, value) {
    this.set(key, value);
    const settings = await this.load();
    settings[key] = value;

    this.save(settings);
  }

  /**
   * Show a settings dialog.
   *
   * @param {string} [initalPageName]
   * @param {string} [focusSelector]
   * @returns {Promise.<void>}
   */
  async showDialog(initalPageName, focusSelector) {
    if (this.dialogPromise) return;

    this.dialogPromise = Promise.all([
      this.load({ omitLocal: true }),
    ]);

    let loadedSettings;
    try {
      [loadedSettings] = await this.dialogPromise;
    } catch {
      mw.notify(cd.s('error-settings-load'), { type: 'error' });
      return;
    } finally {
      delete this.dialogPromise;
    }

    const dialog = new (require('./SettingsDialog').default)(initalPageName, focusSelector);
    const windowManager = cd.getWindowManager('settings');
    windowManager.addWindows([dialog]);
    windowManager.openWindow(dialog, { loadedSettings });

    cd.tests.settingsDialog = dialog;
  }

  /**
   * Show a popup asking the user if they want to enable the new comment formatting. Save the
   * settings after they make the choice.
   *
   * @returns {Promise.<boolean>} Did the user enable comment reformatting.
   */
  async maybeSuggestEnableCommentReformatting() {
    if (this.get('reformatComments') !== null) {
      return false;
    }

    const { reformatComments } = await this.load({ reuse: true });
    if (definedAndNotNull(reformatComments)) {
      return false;
    }

    const action = await showConfirmDialog(
      $('<div>')
        .append(
          $('<img>')
            .attr('width', 626)
            .attr('height', 67)
            .attr('src', '//upload.wikimedia.org/wikipedia/commons/0/08/Convenient_Discussions_comment_-_old_format.png')
            .addClass('cd-rcnotice-img'),
          $('<div>')
            .addClass('cd-rcnotice-img cd-rcnotice-arrow cd-icon')
            .append(
              createSvg(30, 30, 20, 20).html(
                `<path d="M16.58 8.59L11 14.17L11 2L9 2L9 14.17L3.41 8.59L2 10L10 18L18 10L16.58 8.59Z" />`
              )
            ),
          $('<img>')
            .attr('width', 626)
            .attr('height', 118)
            .attr('src', '//upload.wikimedia.org/wikipedia/commons/d/da/Convenient_Discussions_comment_-_new_format.png')
            .addClass('cd-rcnotice-img'),
          $('<div>')
            .addClass('cd-rcnotice-text')
            .append(
              wrapHtml(cd.sParse('rc-suggestion'), {
                callbacks: {
                  'cd-notification-settings': () => {
                    this.showDialog();
                  },
                },
              }).children()
            ),
        )
        .children(),
      {
        size: 'large',
        actions: [
          {
            label: cd.s('rc-suggestion-yes'),
            action: 'accept',
            flags: 'primary',
          },
          {
            label: cd.s('rc-suggestion-no'),
            action: 'reject',
          },
        ],
      }
    );

    // Escape key press
    if (!action) {
      return false;
    }

    const accepted = action === 'accept';
    try {
      await this.saveSettingOnTheFly('reformatComments', accepted);
    } catch (error) {
      mw.notify(cd.s('error-settings-save'), { type: 'error' });
      console.warn(error);
    }
    return accepted;
  }

  /**
   * Show a popup asking the user if they want to receive desktop notifications, or ask for a
   * permission if it has not been granted but the user has desktop notifications enabled (for
   * example, if they are using a browser different from where they have previously used). Save the
   * settings after they make the choice.
   */
  async maybeConfirmDesktopNotifications() {
    if (typeof Notification === 'undefined') return;

    if (this.get('desktopNotifications') === 'unknown' && Notification.permission !== 'denied') {
      // Avoid using the setting kept in mw.user.options, as it may be outdated. Also don't reuse
      // the previous settings request, as the settings might be changed in
      // this.maybeSuggestEnableCommentReformatting().
      const { desktopNotifications } = await this.load();
      if (['unknown', undefined].includes(desktopNotifications)) {
        const action = await showConfirmDialog(cd.s('dn-confirm'), {
          size: 'medium',
          actions: [
            {
              label: cd.s('dn-confirm-yes'),
              action: 'accept',
              flags: 'primary',
            },
            {
              label: cd.s('dn-confirm-no'),
              action: 'reject',
            },
          ],
        });
        let promise;
        if (action === 'accept') {
          if (Notification.permission === 'default') {
            OO.ui.alert(cd.s('dn-grantpermission'));
            Notification.requestPermission((permission) => {
              if (permission === 'granted') {
                promise = this.saveSettingOnTheFly('desktopNotifications', 'all');
              } else if (permission === 'denied') {
                promise = this.saveSettingOnTheFly('desktopNotifications', 'none');
              }
            });
          } else if (Notification.permission === 'granted') {
            promise = this.saveSettingOnTheFly('desktopNotifications', 'all');
          }
        } else if (action === 'reject') {
          promise = this.saveSettingOnTheFly('desktopNotifications', 'none');
        }
        if (promise) {
          try {
            await promise;
          } catch (error) {
            mw.notify(cd.s('error-settings-save'), { type: 'error' })
            console.warn(error);
          }
        }
      }
    }

    if (
      !['unknown', 'none'].includes(this.get('desktopNotifications')) &&
      Notification.permission === 'default'
    ) {
      await OO.ui.alert(cd.s('dn-grantpermission-again'), { title: cd.s('script-name') });
      Notification.requestPermission();
    }
  }

  /**
   * Add a settings link to the page footer.
   */
  addLinkToFooter() {
    getFooter().append(
      $('<li>').append(
        $('<a>')
          .text(cd.s('footer-settings'))
          .on('click', () => {
            this.showDialog();
          })
      )
    );
  }
}

export default new Settings();
