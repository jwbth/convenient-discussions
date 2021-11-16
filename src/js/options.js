/**
 * MediaWiki's user options handling functions.
 *
 * @module options
 */

import lzString from 'lz-string';

import CdError from './CdError';
import cd from './cd';
import subscriptions from './subscriptions';
import { firstCharToUpperCase } from './util';
import { getUserInfo, setGlobalOption, setLocalOption } from './apiWrappers';
import { settingsScheme } from './boot';

/**
 * Pack the visits object into a string for further compression.
 *
 * @param {object} visits
 * @returns {string}
 */
export function packVisits(visits) {
  return Object.keys(visits)
    .map((key) => `${key},${visits[key].join(',')}\n`)
    .join('')
    .trim();
}

/**
 * Unpack the visits string into a visits object.
 *
 * @param {string} visitsString
 * @returns {object}
 */
export function unpackVisits(visitsString) {
  const visits = {};
  // " *" fixes a error previously made. Not needed for new sites.
  const regexp = /^(\d+), *(.+)$/gm;
  let match;
  while ((match = regexp.exec(visitsString))) {
    visits[match[1]] = match[2].split(',');
  }
  return visits;
}

/**
 * Pack the subscriptions object into a string for further compression.
 *
 * @param {object} registry
 * @returns {string}
 */
export function packSubscriptions(registry) {
  return Object.keys(registry)
    .filter((pageId) => Object.keys(registry[pageId]).length)
    .map((key) => ` ${key} ${Object.keys(registry[key]).join('\n')}\n`)
    .join('')
    .trim();
}

/**
 * Unpack the subscriptions string into a visits object.
 *
 * @param {string} s
 * @returns {object}
 */
export function unpackSubscriptions(s) {
  const registry = {};
  const pages = s.split(/(?:^|\n )(\d+) /).slice(1);
  let pageId;
  for (
    let i = 0, isPageId = true;
    i < pages.length;
    i++, isPageId = !isPageId
  ) {
    if (isPageId) {
      pageId = pages[i];
    } else {
      const pagesArr = pages[i].split('\n');
      registry[pageId] = subscriptions.itemsToKeys(pagesArr);
    }
  }
  return registry;
}

/**
 * Request the settings from the server, or extract the settings from the existing options strings.
 *
 * @param {object} [options={}]
 * @param {object} [options.options] Object containing strings with the local and global settings.
 * @param {boolean} [options.omitLocal=false] Whether to omit variables set via `cdLocal...`
 *   variables (they shouldn't need to be saved to the server).
 * @param {boolean} [options.reuse=false] If `options` is not set, reuse the cached user info
 *   request.
 * @returns {Promise.<object>}
 */
export async function getSettings({
  options,
  omitLocal = false,
  reuse = false,
} = {}) {
  if (!options || !options[cd.g.SETTINGS_OPTION_NAME]) {
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
  Object.keys(settingsScheme.default).forEach((name) => {
    (settingsScheme.aliases[name] || []).concat(name).forEach((alias) => {
      // Global settings override those set via personal JS.
      if (
        globalSettings[alias] !== undefined &&
        (
          typeof globalSettings[alias] === typeof settingsScheme.default[name] ||
          settingsScheme.default[name] === null
        )
      ) {
        settings[name] = globalSettings[alias];
      }

      // Local settings override global.
      if (
        localSettings[alias] !== undefined &&
        (
          typeof localSettings[alias] === typeof settingsScheme.default[name] ||
          settingsScheme.default[name] === null
        )
      ) {
        settings[name] = localSettings[alias];
      }
    });
  });

  if (!omitLocal) {
    Object.assign(settings, getLocalOverridingSettings());
  }

  return settings;
}

/**
 * _For internal use._ Get settings set in common.js that are meant to override native settings.
 *
 * @returns {object}
 */
export function getLocalOverridingSettings() {
  const settings = {};
  Object.keys(settingsScheme.default).forEach((name) => {
    (settingsScheme.aliases[name] || []).concat(name).forEach((alias) => {
      const varLocalAlias = 'cdLocal' + firstCharToUpperCase(alias);
      if (
        varLocalAlias in window &&
        (
          typeof window[varLocalAlias] === typeof settingsScheme.default[name] ||
          settingsScheme.default[name] === null
        )
      ) {
        settings[name] = window[varLocalAlias];
      }
    });
  });
  return settings;
}

/**
 * Save the settings to the server. This function will split the settings into the global and local
 * ones and make two respective requests.
 *
 * @param {object} [settings=cd.settings] Settings to save.
 */
export async function setSettings(settings = cd.settings) {
  if (!cd.user.isRegistered()) return;

  if (cd.config.useGlobalPreferences) {
    const globalSettings = {};
    const localSettings = {};
    Object.keys(settings).forEach((key) => {
      if (settingsScheme.local.includes(key)) {
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
}

/**
 * @typedef {object} GetVisitsReturn
 * @property {object} visits
 * @property {object} currentPageVisits
 */

/**
 * Request the pages visits data from the server.
 *
 * `mw.user.options` is not used even on the first run because the script may not run immediately
 * after the page has loaded. In fact, when the page is loaded in a background tab, it can be
 * throttled until it is focused, so an indefinite amount of time can pass.
 *
 * @param {boolean} [reuse=false] Whether to reuse a cached userinfo request.
 * @returns {Promise.<GetVisitsReturn>}
 */
export async function getVisits(reuse = false) {
  let visits;
  let currentPageVisits;
  if (cd.user.name === '<unregistered>') {
    visits = [];
    currentPageVisits = [];
  } else {
    const isOptionSet = mw.user.options.get(cd.g.VISITS_OPTION_NAME) !== null;
    const promise = cd.state.isPageFirstParsed && !isOptionSet ?
      Promise.resolve({}) :
      getUserInfo(reuse).then((options) => options.visits);
    visits = await promise;
    const articleId = mw.config.get('wgArticleId');

    // This should always true; this check should be performed before.
    if (articleId) {
      visits[articleId] = visits[articleId] || [];
      currentPageVisits = visits[articleId];
    }
  }

  // These variables are not used anywhere in the script but can be helpful for testing purposes.
  cd.g.visits = visits;
  cd.g.currentPageVisits = currentPageVisits;

  return { visits, currentPageVisits };
}

/**
 * Remove the oldest 10% of visits when the size limit is hit.
 *
 * @param {object} originalVisits
 * @returns {object}
 * @private
 */
function cleanUpVisits(originalVisits) {
  const visits = Object.assign({}, originalVisits);
  const timestamps = Object.keys(visits).reduce((acc, key) => acc.concat(visits[key]), []);
  timestamps.sort();
  const boundary = timestamps[Math.floor(timestamps.length / 10)];
  Object.keys(visits).forEach((key) => {
    visits[key] = visits[key].filter((visit) => visit >= boundary);
    if (!visits[key].length) {
      delete visits[key];
    }
  });
  return visits;
}

/**
 * Save the pages visits data to the server.
 *
 * @param {object} visits
 */
export async function setVisits(visits) {
  if (!visits || !cd.user.isRegistered()) return;

  const s = packVisits(visits);
  const compressed = lzString.compressToEncodedURIComponent(s);
  try {
    await setLocalOption(cd.g.VISITS_OPTION_NAME, compressed);
  } catch (e) {
    if (e instanceof CdError) {
      const { type, code } = e.data;
      if (type === 'internal' && code === 'sizeLimit') {
        setVisits(cleanUpVisits(visits));
      } else {
        console.error(e);
      }
    } else {
      console.error(e);
    }
  }
}

/**
 * Request the legacy subscriptions from the server.
 *
 * `mw.user.options` is not used even on first run because it appears to be cached sometimes which
 * can be critical for determining subscriptions.
 *
 * @param {boolean} [reuse=false] Whether to reuse a cached userinfo request.
 * @returns {Promise.<object>}
 */
export async function getLegacySubscriptions(reuse = false) {
  const isOptionSet = mw.user.options.get(cd.g.SUBSCRIPTIONS_OPTION_NAME) !== null;
  const promise = cd.state.isPageFirstParsed && !isOptionSet ?
    Promise.resolve({}) :
    getUserInfo(reuse).then((options) => options.subscriptions);
  const registry = await promise;

  return registry;
}

/**
 * Save the watched sections to the server.
 *
 * @param {Promise.<object>} registry
 */
export async function setLegacySubscriptions(registry) {
  const s = packSubscriptions(registry);
  const compressed = lzString.compressToEncodedURIComponent(s);
  await setLocalOption(cd.g.SUBSCRIPTIONS_OPTION_NAME, compressed);
}
