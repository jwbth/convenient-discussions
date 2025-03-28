/**
 * Singleton for settings-related methods and data.
 *
 * @module settings
 */

import TextMasker from './TextMasker';
import cd from './cd';
import controller from './controller';
import pageRegistry from './pageRegistry';
import { getUserInfo, saveGlobalOption, saveLocalOption } from './utils-api';
import { areObjectsEqual, defined, definedAndNotNull, ucFirst } from './utils-general';
import { showConfirmDialog } from './utils-oojs';
import { formatDateImproved, formatDateNative, formatDateRelative } from './utils-timestamp';
import { createSvg, getFooter, wrapHtml } from './utils-window';

export default {
  /**
   * Settings scheme.
   *
   * @property {object} default Default value for each property.
   * @property {string[]} local List of local setting names. Local settings are settings set for the
   *   current wiki only.
   * @property {object} undocumented Undocumented settings with their defaults. Undocumented
   *   settings are settings not shown in the settings dialog and not saved to the server.
   * @property {object} aliases List of aliases for each property for seamless transition when
   *   changing a setting name.
   * @property {string[]} states List of state setting names. States are values to be remembered, or
   *   settings to be removed if the time comes. It is, in fact, user data, despite that we don't
   *   have much of it.
   * @property {object} resetsTo For settings that are resetted not to their default values, those
   *   non-default values are specified here (used to determine whether the "Reset" button should be
   *   enabled).
   * @property {object[]} ui List of pages of the settings dialog, each with its control objects.
   */
  scheme: {
    local: ['insertButtons-altered', 'insertButtons', 'signaturePrefix'],

    undocumented: {
      defaultCommentLinkType: null,
      defaultSectionLinkType: null,
      showLoadingOverlay: true,
    },

    aliases: {
      'insertButtons-altered': ['haveInsertButtonsBeenAltered'],
      'improvePerformance-lastSuggested': ['improvePerformanceLastSuggested'],
      subscribeOnReply: ['watchSectionOnReply'],
    },

    states: [
      'authorsSort',
      'insertButtons-altered',
      'improvePerformance-lastSuggested',
      'manyForms-onboarded',
      'newTopicsSubscription-onboarded',
      'notificationsBlacklist',
      'upload-onboarded',
    ],

    resetsTo: {
      reformatComments: false,
    },
  },

  /**
   * Set the default settings to the settings scheme object.
   *
   * @private
   */
  initDefaults() {
    this.scheme.default = {
      'allowEditOthersComments': false,
      'alwaysExpandAdvanced': false,
      'authorsSort': 'abc',

      // The order should coincide with the order of checkboxes in the autocompleteTypes setting -
      // otherwise the "Save" and "Reset" buttons in the settings dialog won't work properly.
      'autocompleteTypes': ['mentions', 'commentLinks', 'wikilinks', 'templates', 'tags'],

      'autopreview': true,
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
      'newTopicsSubscription-onboarded': false,
      'notifications': 'all',
      'notifyCollapsedThreads': false,
      'notificationsBlacklist': [],
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

    const fortyThreeMinutesAgo = new Date(Date.now() - cd.g.msInMin * 43);
    const threeDaysAgo = new Date(Date.now() - cd.g.msInDay * 3.3);

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
            max: 9999999,
            buttonStep: 5,
            label: cd.s('sd-highlightnewinterval'),
            help: cd.s('sd-highlightnewinterval-help'),
          },
          {
            name: 'countEditsAsNewComments',
            type: 'checkbox',
            label: cd.s('sd-counteditsasnewcomments'),
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
            label: wrapHtml(cd.sParse('sd-outdentlevel', outdentTemplateUrl), { targetBlank: true }),
            help: wrapHtml(cd.sParse('sd-outdentlevel-help') + noOutdentTemplateNote),
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
            help: wrapHtml(cd.sParse('sd-insertbuttons-help') + ' ' + cd.sParse('sd-localsetting')),
            dataToUi: (value) => (
              value.map((button) => Array.isArray(button) ? button.join(';') : button)
            ),
            uiToData: (value) => (
              value
                .map((value) => {
                  const textMasker = new TextMasker(value).mask(/\\[+;\\]/g);
                  let [, snippet, label] = textMasker.getText().match(/^(.*?)(?:;(.+))?$/) || [];
                  if (!snippet?.replace(/^ +$/, '')) return;

                  snippet = textMasker.unmaskText(snippet);
                  label &&= textMasker.unmaskText(label);
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
            help: wrapHtml(cd.sParse('sd-signatureprefix-help') + ' ' + cd.sParse('sd-localsetting')),
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
            label: wrapHtml(
              cd.sParse('sd-useuitime', 'Special:Preferences#mw-prefsection-rendering-timeoffset'),
              { targetBlank: true }
            ),
          },
          {
            name: 'hideTimezone',
            type: 'checkbox',
            label: cd.s('sd-hidetimezone'),
          },
          {
            name: 'timestampFormat',
            type: 'radio',
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
            type: 'checkbox',
            label: wrapHtml(cd.sParse('sd-usetopicsubscription', mw.user), { targetBlank: true }),
            help: wrapHtml(cd.sParse('sd-usetopicsubscription-help'), { targetBlank: true }),
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
            help: cd.s('sd-notifications-help'),
          },
          {
            name: 'desktopNotifications',
            type: 'radio',
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
            help: wrapHtml(cd.sParse('sd-removedata-help'), { targetBlank: true }),
          },
        ],
      },
    ];
  },

  /**
   * _For internal use._ Initialize user settings, returning a promise, or return an existing one.
   *
   * @returns {Promise.<undefined>}
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

      this.set(Object.assign(
        {},
        this.scheme.default,

        // Settings in global variables like cdAllowEditOthersComments used before server-stored
        // settings were implemented and used for undocumented settings now.
        this.getSettingPropertiesOfObject(window, 'cd'),

        remoteSettings,
      ));

      // If the user has never changed the insert buttons configuration, it should change with the
      // default configuration change.
      if (
        !this.values['insertButtons-altered'] &&
        JSON.stringify(this.values.insertButtons) !== JSON.stringify(cd.config.defaultInsertButtons)
      ) {
        this.values.insertButtons = cd.config.defaultInsertButtons;
      }

      if (!areObjectsEqual(this.values, remoteSettings)) {
        this.save().catch((e) => {
          console.warn('Couldn\'t save the settings to the server.', e);
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
    } catch (e) {
      localSettings = {};
    }

    return Object.assign(
      {},
      this.getSettingPropertiesOfObject(globalSettings),
      this.getSettingPropertiesOfObject(localSettings),
      omitLocal ? this.getLocalOverrides() : {},
    );
  },

  /**
   * Get the properties of an object corresponding to settings with an optional prefix.
   *
   * @param {object} source
   * @param {string} [prefix]
   * @param {object} [defaults=this.scheme.default]
   * @returns {object}
   * @private
   */
  getSettingPropertiesOfObject(source, prefix, defaults = this.scheme.default) {
    return Object.keys(defaults).reduce((target, name) => {
      (this.scheme.aliases[name] || []).concat(name)
        .map((alias) => prefix ? prefix + ucFirst(alias) : alias)
        .filter((prop) => (
          source[prop] !== undefined &&
          (typeof source[prop] === typeof defaults[name] || defaults[name] === null)
        ))
        .forEach((prop) => {
          target[name] = source[prop];
        });
      return target;
    }, {});
  },

  /**
   * Get settings set in common.js that are meant to override native settings.
   *
   * @returns {object}
   * @private
   */
  getLocalOverrides() {
    return this.getSettingPropertiesOfObject(window, 'cdLocal');
  },

  /**
   * Change the value of a setting or a set of settings at once without saving to the server.
   *
   * @param {string|object} name
   * @param {string} value
   * @private
   */
  set(name, value) {
    this.values ||= {};
    Object.assign(this.values, typeof name === 'string' ? { [name]: value } : name);
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
        saveLocalOption(cd.g.localSettingsOptionName, JSON.stringify(localSettings)),
        saveGlobalOption(cd.g.settingsOptionName, JSON.stringify(globalSettings)),
      ]);
    } else {
      await saveLocalOption(cd.g.localSettingsOptionName, JSON.stringify(settings));
    }
  },

  /**
   * Update a setting value, saving it to the server and changing it for the current session as
   * well. This should be done cautiously, because many settings only have effect on page reload.
   *
   * @param {string} key The key of the settings to save.
   * @param {*} value The value to set.
   * @returns {Promise.<undefined>}
   */
  async saveSettingOnTheFly(key, value) {
    this.set(key, value);
    const settings = await this.load();
    settings[key] = value;
    return this.save(settings);
  },

  /**
   * Show a settings dialog.
   *
   * @param {string} [initalPageName]
   */
  showDialog(initalPageName) {
    if ($('.cd-dialog-settings').length) return;

    const dialog = new (require('./SettingsDialog').default)(initalPageName);
    controller.getWindowManager('settings').addWindows([dialog]);
    controller.getWindowManager('settings').openWindow(dialog);

    cd.tests.settingsDialog = dialog;
  },

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

    try {
      const reformatComments = action === 'accept';
      await this.saveSettingOnTheFly('reformatComments', reformatComments);
      return reformatComments;
    } catch (e) {
      mw.notify(cd.s('error-settings-save'), { type: 'error' });
      console.warn(e);
    }
  },

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
          } catch (e) {
            mw.notify(cd.s('error-settings-save'), { type: 'error' })
            console.warn(e);
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
  },

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
  },
};
