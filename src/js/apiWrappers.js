/**
 * Wrappers for MediaWiki action API requests ({@link https://www.mediawiki.org/wiki/API:Main_page})
 * together with some user options handling functions. See also the {@link Page} class methods for
 * functions regarding concrete page names.
 *
 * @module apiWrappers
 */

import lzString from 'lz-string';

import CdError from './CdError';
import cd from './cd';
import controller from './controller';
import pageRegistry from './pageRegistry';
import subscriptions from './subscriptions';
import userRegistry from './userRegistry';
import { brsToNewlines, hideSensitiveCode } from './wikitext';
import { defined, sleep, ucFirst, unhideText, unique } from './utils';

const autocompleteTimeout = 100;

let cachedUserInfoRequest;
let currentAutocompletePromise;
let currentUserRights;

/**
 * Callback used in the `.catch()` parts of API requests.
 *
 * @param {string|Array} code
 * @param {object} resp
 * @throws {CdError}
 */
export function handleApiReject(code, resp) {
  // Native promises support only one parameter.
  if (Array.isArray(code)) {
    [code, resp] = code;
  }

  // See the parameters with which mw.Api() rejects:
  // https://phabricator.wikimedia.org/source/mediawiki/browse/master/resources/src/mediawiki.api/index.js;fbfa8f1a61c5ffba664e817701439affb4f6a388$245
  throw code === 'http' ?
    new CdError({ type: 'network' }) :
    new CdError({
      type: 'api',
      code: 'error',
      apiResp: resp,
    });
}

/**
 * Split an array into batches of 50 (500 if the user has the `apihighlimits` right) to use in API
 * requests.
 *
 * @param {Array.<*>} arr
 * @returns {Array.<Array.<*>>}
 */
export function splitIntoBatches(arr) {
  // `currentUserRights` is rarely set on first page load (when `getDtSubscriptions()` runs, for
  // example).
  const limit = (
    currentUserRights ?
      currentUserRights.includes('apihighlimits') :
      mw.config.get('wgUserGroups').includes('sysop')
  ) ?
    500 :
    50;
  return arr.reduce((result, item, index) => {
    const chunkIndex = Math.floor(index / limit);
    if (!result[chunkIndex]) {
      result[chunkIndex] = [];
    }
    result[chunkIndex].push(item);
    return result;
  }, []);
}


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
 * Pack the legacy subscriptions object into a string for further compression.
 *
 * @param {object} registry
 * @returns {string}
 */
export function packLegacySubscriptions(registry) {
  return Object.keys(registry)
    .filter((pageId) => Object.keys(registry[pageId]).length)
    .map((key) => ` ${key} ${Object.keys(registry[key]).join('\n')}\n`)
    .join('')
    .trim();
}

/**
 * Unpack the legacy subscriptions string into a visits object.
 *
 * @param {string} string
 * @returns {object}
 */
export function unpackLegacySubscriptions(string) {
  const registry = {};
  const pages = string.split(/(?:^|\n )(\d+) /).slice(1);
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
 * @typedef {object} GetVisitsReturn
 * @property {object} visits
 * @property {object} currentPageVisits
 */

/**
 * Request the pages visits data from the server.
 *
 * {@link https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.user-property-options mw.user.options}
 * is not used even on the first run because the script may not run immediately after the page has
 * loaded. In fact, when the page is loaded in a background tab, it can be throttled until it is
 * focused, so an indefinite amount of time can pass.
 *
 * @param {boolean} [reuse=false] Whether to reuse a cached userinfo request.
 * @returns {Promise.<GetVisitsReturn>}
 */
export async function getVisits(reuse = false) {
  let visits;
  let currentPageVisits;
  if (userRegistry.getCurrent().isRegistered()) {
    visits = await (
      (
        controller.getBootProcess().isFirstRun() &&
        mw.user.options.get(cd.g.visitsOptionName) === null
      ) ?
        Promise.resolve({}) :
        getUserInfo(reuse).then((options) => options.visits)
    );
    const articleId = mw.config.get('wgArticleId');
    visits[articleId] = visits[articleId] || [];
    currentPageVisits = visits[articleId];
  } else {
    visits = [];
    currentPageVisits = [];
  }

  Object.assign(cd.tests, { visits, currentPageVisits });

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
export async function saveVisits(visits) {
  if (!visits || !userRegistry.getCurrent().isRegistered()) return;

  const string = packVisits(visits);
  const compressed = lzString.compressToEncodedURIComponent(string);
  try {
    await saveLocalOption(cd.g.visitsOptionName, compressed);
  } catch (e) {
    if (e instanceof CdError) {
      const { type, code } = e.data;
      if (type === 'internal' && code === 'sizeLimit') {
        saveVisits(cleanUpVisits(visits));
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
 * {@link https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.user-property-options mw.user.options}
 * is not used even on first run because it appears to be cached sometimes which can be critical for
 * determining subscriptions.
 *
 * @param {boolean} [reuse=false] Whether to reuse a cached userinfo request.
 * @returns {Promise.<object>}
 */
export function getLegacySubscriptions(reuse = false) {
  return (
    controller.getBootProcess()?.isFirstRun() &&
    mw.user.options.get(cd.g.subscriptionsOptionName) === null
  ) ?
    Promise.resolve({}) :
    getUserInfo(reuse).then((options) => options.subscriptions);
}

/**
 * Save the legacy subscriptions to the server.
 *
 * @param {Promise.<object>} registry
 */
export async function saveLegacySubscriptions(registry) {
  await saveLocalOption(
    cd.g.subscriptionsOptionName,
    lzString.compressToEncodedURIComponent(packLegacySubscriptions(registry))
  );
}


/**
 * Make a request that won't set the process on hold when the tab is in the background.
 *
 * @param {object} params
 * @param {string} [method='post']
 * @returns {Promise.<object>}
 */
export function requestInBackground(params, method = 'post') {
  return new Promise((resolve, reject) => {
    controller.getApi()[method](params, {
      success: (resp) => {
        if (resp.error) {
          // Workaround for cases when an options request is made on an idle page whose tokens
          // expire. A re-request of such tokens results is generally successful, but _this_
          // callback is executed after each response, so we don't rejecting to avoid misleading
          // error messages being shown to the user.
          if (resp.error.code !== 'badtoken') {
            reject(['api', resp]);
          }
        } else {
          resolve(resp);
        }
      },
      error: (jqXHR, textStatus) => {
        reject(['http', textStatus]);
      },
    });
  });
}

/**
 * jQuery promise.
 *
 * @external jQueryPromise
 * @see https://api.jquery.com/Types/#Promise
 */

/**
 * Make a parse request with arbitrary code. We assume that if something is parsed, it will be
 * shown, so we automatically load modules.
 *
 * @async
 * @param {string} code
 * @param {object} [customOptions]
 * @returns {external:jQueryPromise.<object>}
 */
export function parseCode(code, customOptions) {
  const defaultOptions = {
    action: 'parse',
    text: code,
    contentmodel: 'wikitext',
    prop: ['text', 'modules', 'jsconfigvars'],
    pst: true,
    disabletoc: true,
    disablelimitreport: true,
    disableeditsection: true,
    preview: true,
  };
  const options = Object.assign({}, defaultOptions, customOptions);
  return controller.getApi().post(options).then(
    (resp) => {
      mw.loader.load(resp.parse.modules);
      mw.loader.load(resp.parse.modulestyles);
      return {
        html: resp.parse.text,
        parsedSummary: resp.parse.parsedsummary,
      };
    },
    handleApiReject
  );
}

/**
 * Make a userinfo request (see {@link https://www.mediawiki.org/wiki/API:Userinfo}).
 *
 * @param {boolean} [reuse=false] Whether to reuse a cached request.
 * @returns {Promise.<object>} Promise for an object containing the full options object, visits,
 *   subscription list, and rights.
 */
export function getUserInfo(reuse = false) {
  if (reuse && cachedUserInfoRequest) {
    return cachedUserInfoRequest;
  }

  cachedUserInfoRequest = controller.getApi().post({
    action: 'query',
    meta: 'userinfo',
    uiprop: ['options', 'rights'],
  }).then(
    (resp) => {
      const userinfo = resp.query.userinfo;
      const options = userinfo.options;
      const rights = userinfo.rights;

      const visits = unpackVisits(
        lzString.decompressFromEncodedURIComponent(options[cd.g.visitsOptionName]) ||
        ''
      );
      const subscriptions = unpackLegacySubscriptions(
        lzString.decompressFromEncodedURIComponent(options[cd.g.subscriptionsOptionName]) ||
        ''
      );
      currentUserRights = rights;

      return { options, visits, subscriptions, rights };
    },
    handleApiReject
  );

  return cachedUserInfoRequest;
}

/**
 * Get page titles for an array of page IDs.
 *
 * @param {number[]} pageIds
 * @returns {Promise.<object[]>}
 */
export async function getPageTitles(pageIds) {
  const pages = [];

  for (const nextPageIds of splitIntoBatches(pageIds)) {
    const resp = await controller.getApi().post({
      action: 'query',
      pageids: nextPageIds,
    }).catch(handleApiReject);

    pages.push(...resp.query.pages);
  }

  return pages;
}

/**
 * Get page IDs for an array of page titles.
 *
 * @param {string[]} titles
 * @returns {Promise.<object[]>}
 */
export async function getPageIds(titles) {
  const normalized = [];
  const redirects = [];
  const pages = [];
  for (const nextTitles of splitIntoBatches(titles)) {
    const resp = await controller.getApi().post({
      action: 'query',
      titles: nextTitles,
      redirects: true,
    }).catch(handleApiReject);

    const query = resp.query;
    normalized.push(...query.normalized || []);
    redirects.push(...query.redirects || []);
    pages.push(...query.pages);
  }

  return { normalized, redirects, pages };
}

/**
 * Generic function for saving user options to the server.
 *
 * @param {object} options Name-value pairs.
 * @param {boolean} [isGlobal=false] Whether to save the options globally (using
 *   {@link https://www.mediawiki.org/wiki/Extension:GlobalPreferences Extension:GlobalPreferences}).
 * @throws {CdError}
 */
export async function saveOptions(options, isGlobal = false) {
  const action = isGlobal ? 'globalpreferences' : 'options';
  if (Object.entries(options).some(([ , value]) => value && value.length > 65535)) {
    throw new CdError({
      type: 'internal',
      code: 'sizeLimit',
      details: { action },
    });
  }

  const resp = await requestInBackground(
    controller.getApi().assertCurrentUser({
      action,
      change: (
        '\x1f' +
        Object.entries(options)
          // Global options can't be deleted because of a bug
          // https://phabricator.wikimedia.org/T207448.
          .map(([name, value]) => name + (value === null && !isGlobal ? '' : '=') + (value ?? ''))

          .join('\x1f')
      ),
    }),
    'postWithEditToken'
  ).catch(handleApiReject);

  if (resp?.[action] !== 'success') {
    throw new CdError({
      type: 'api',
      code: 'noSuccess',
      details: { action },
    });
  }
}

/**
 * Save an option value to the server. See {@link https://www.mediawiki.org/wiki/API:Options}.
 *
 * @param {string} name
 * @param {string} value
 */
export async function saveLocalOption(name, value) {
  await saveOptions({ [name]: value });
}

/**
 * Save a global preferences' option value to the server. See
 * {@link https://www.mediawiki.org/wiki/Extension:GlobalPreferences/API}.
 *
 * @param {string} name
 * @param {string} value
 * @throws {CdError}
 */
export async function saveGlobalOption(name, value) {
  if (!cd.config.useGlobalPreferences) {
    // Normally, this won't run if cd.config.useGlobalPreferences is false. But it will run as part
    // of SettingsDialog#removeData in controller.showSettingsDialog, removing the option if it
    // existed, which may have a benificial effect if cd.config.useGlobalPreferences was true at
    // some stage and a local setting with cd.g.settingsOptionName name was created instead of a
    // global one, thus inviting the need to remove it upon removing all data.
    await saveLocalOption(name, value);

    return;
  }
  try {
    await saveOptions({ [name]: value }, true);
  } catch (e) {
    // The site doesn't support global preferences.
    if (e instanceof CdError && e.data.apiResp?.error.code === 'badvalue') {
      await saveLocalOption(name, value);
    } else {
      throw e;
    }
  }
}

/**
 * Request genders of a list of users and assign them as properties. A gender may be `'male'`,
 * `'female'`, or `'unknown'`.
 *
 * @param {import('./userRegistry').User[]} users
 * @param {boolean} [doRequestInBackground=false] Make a request that won't set the process on hold
 *   when the tab is in the background.
 */
export async function loadUserGenders(users, doRequestInBackground = false) {
  const usersToRequest = users
    .filter((user) => !user.getGender() && user.isRegistered())
    .filter(unique)
    .map((user) => user.getName());
  for (const nextUsers of splitIntoBatches(usersToRequest)) {
    const options = {
      action: 'query',
      list: 'users',
      ususers: nextUsers,
      usprop: 'gender',
    };
    const request = doRequestInBackground ?
      requestInBackground(options) :
      controller.getApi().post(options);
    (await request.catch(handleApiReject)).query.users
      .filter((user) => user.gender)
      .forEach((user) => {
        userRegistry.get(user.name).setGender(user.gender);
      });
  }
}

/**
 * Given a list of user IDs, return a list of users.
 *
 * @param {number[]|string[]} userIds List of user IDs.
 * @returns {Promise.<import('./userRegistry').User[]>}
 */
export async function getUsersByGlobalId(userIds) {
  const requests = userIds.map((id) => (
    controller.getApi().post({
      action: 'query',
      meta: 'globaluserinfo',
      guiid: id,
    }).catch(handleApiReject)
  ));
  return (await Promise.all(requests)).map((resp) => {
    const userInfo = resp.query.globaluserinfo;
    const user = userRegistry.get(userInfo.name);
    user.setGlobalId(userInfo.id);
    return user;
  });
}

/**
 * Get a list of 10 user names matching the specified search text. User names are sorted as
 * {@link https://www.mediawiki.org/wiki/API:Opensearch OpenSearch} sorts them. Only users with a
 * talk page existent are included. Redirects are resolved.
 *
 * Reuses the existing request if available.
 *
 * @param {string} text
 * @returns {Promise.<string[]>}
 * @throws {CdError}
 */
export function getRelevantUserNames(text) {
  text = ucFirst(text);
  // eslint-disable-next-line no-async-promise-executor
  const promise = new Promise(async (resolve, reject) => {
    await sleep(autocompleteTimeout);
    try {
      if (promise !== currentAutocompletePromise) {
        throw new CdError();
      }

      // First, try to use the search to get only users that have talk pages. Most legitimate
      // users do, while spammers don't.
      const resp = await controller.getApi().get({
        action: 'opensearch',
        search: text,
        namespace: 3,
        redirects: 'resolve',
        limit: 10,
      }).catch(handleApiReject);

      const users = resp[1]
        ?.map((name) => (name.match(cd.g.userNamespacesRegexp) || [])[1])
        .filter(defined)
        .filter((name) => !name.includes('/'));

      if (users.length) {
        resolve(users);
      } else {
        // If we didn't succeed with search, try the entire users database.
        const resp = await controller.getApi().get({
          action: 'query',
          list: 'allusers',
          auprefix: text,
        }).catch(handleApiReject);

        const users = resp.query.allusers.map((user) => user.name);
        resolve(users);
      }
    } catch (e) {
      reject(e);
    }
  });
  currentAutocompletePromise = promise;

  return promise;
}

/**
 * Get a list of 10 page names matching the specified search text. Page names are sorted as
 * {@link https://www.mediawiki.org/wiki/API:Opensearch OpenSearch} sorts them. Redirects are not
 * resolved.
 *
 * Reuses the existing request if available.
 *
 * @param {string} text
 * @returns {Promise.<string[]>}
 * @throws {CdError}
 */
export function getRelevantPageNames(text) {
  let colonPrefix = false;
  if (cd.g.colonNamespacesPrefixRegexp.test(text)) {
    text = text.slice(1);
    colonPrefix = true;
  }

  // eslint-disable-next-line no-async-promise-executor
  const promise = new Promise(async (resolve, reject) => {
    await sleep(autocompleteTimeout);
    try {
      if (promise !== currentAutocompletePromise) {
        throw new CdError();
      }

      controller.getApi().get({
        action: 'opensearch',
        search: text,
        redirects: 'return',
        limit: 10,
      }).then(
        (resp) => {
          const regexp = new RegExp('^' + mw.util.escapeRegExp(text[0]), 'i');
          const pages = resp[1]?.map((name) => (
            name
              .replace(regexp, () => text[0])
              .replace(/^/, colonPrefix ? ':' : '')
          ));

          resolve(pages);
        },
        (e) => {
          handleApiReject(e);
        }
      );
    } catch (e) {
      reject(e);
    }
  });
  currentAutocompletePromise = promise;

  return promise;
}

/**
 * Get a list of 10 template names matching the specified search text. Template names are sorted as
 * {@link https://www.mediawiki.org/wiki/API:Opensearch OpenSearch} sorts them. Redirects are not
 * resolved.
 *
 * Reuses the existing request if available.
 *
 * @param {string} text
 * @returns {Promise.<string[]>}
 * @throws {CdError}
 */
export function getRelevantTemplateNames(text) {
  // eslint-disable-next-line no-async-promise-executor
  const promise = new Promise(async (resolve, reject) => {
    await sleep(autocompleteTimeout);
    try {
      if (promise !== currentAutocompletePromise) {
        throw new CdError();
      }

      controller.getApi().get({
        action: 'opensearch',
        search: text.startsWith(':') ? text.slice(1) : 'Template:' + text,
        redirects: 'return',
        limit: 10,
      }).then(
        (resp) => {
          const regexp = new RegExp('^' + mw.util.escapeRegExp(text[0]), 'i');
          const templates = resp[1]
            ?.filter((name) => !/(\/doc|\.css)$/.test(name))
            .map((name) => text.startsWith(':') ? name : name.slice(name.indexOf(':') + 1))
            .map((name) => name.replace(regexp, () => text[0]));

          resolve(templates);
        },
        (e) => {
          handleApiReject(e);
        }
      );
    } catch (e) {
      reject(e);
    }
  });
  currentAutocompletePromise = promise;

  return promise;
}

/**
 * Get existence of a list of pages by title.
 *
 * @param {string[]} titles Titles to check existence of.
 * @returns {Promise.<object>}
 */
export async function getPagesExistence(titles) {
  const results = {};
  const normalized = [];
  const pages = [];
  for (const nextTitles of splitIntoBatches(titles)) {
    const resp = await controller.getApi().post({
      action: 'query',
      titles: nextTitles,
    }).catch(handleApiReject);

    const query = resp.query;
    normalized.push(...query.normalized || []);
    pages.push(...query.pages);
  }

  const normalizedToOriginal = {};
  normalized.forEach((page) => {
    normalizedToOriginal[page.to] = page.from;
  });
  pages.forEach((page) => {
    results[normalizedToOriginal[page.title] || page.title] = {
      exists: !page.missing,
      normalized: page.title,
    };
  });

  return results;
}

/**
 * Get a list of DiscussionTools subscriptions for a list of section IDs from the server.
 *
 * @param {string[]} ids List of section IDs.
 * @returns {Promise.<object>}
 */
export async function getDtSubscriptions(ids) {
  const subscriptions = {};
  for (const nextIds of splitIntoBatches(ids)) {
    Object.assign(
      subscriptions,
      (await controller.getApi().post({
        action: 'discussiontoolsgetsubscriptions',
        commentname: nextIds,
      }).catch(handleApiReject)).subscriptions
    );
  }
  return subscriptions;
}

/**
 * Send a request to subscribe to or unsubscribe from a topic in DisussionTools.
 *
 * @param {string} subscribeId Section's DiscussionTools ID.
 * @param {string} id Section's ID.
 * @param {boolean} subscribe Subscribe or unsubscribe.
 * @returns {Promise.<object>}
 */
export function dtSubscribe(subscribeId, id, subscribe) {
  return controller.getApi().postWithEditToken({
    action: 'discussiontoolssubscribe',
    page: pageRegistry.getCurrent().name + (id ? `#${id}` : ''),
    commentname: subscribeId,
    subscribe,
  }).catch(handleApiReject);
}

/**
 * Convert HTML into wikitext.
 *
 * @param {string} html
 * @param {external:OO.ui.TextInputWidget} input
 * @returns {Promise.<string>}
 */
export async function htmlToWikitext(html, input) {
  let wikitext;
  input.pushPending();
  input.setDisabled(true);
  try {
    wikitext = await $.post('/api/rest_v1/transform/html/to/wikitext', {
      html,
      scrub_wikitext: true,
    });
    wikitext = wikitext
      .replace(/(?:^ .*(?:\n|$))+/gm, (s) => (
        '<syntaxhighlight lang="">\n' +
        s
          .replace(/^ /gm, '')
          .replace(/[^\n]$/, '$0\n')
          .replace(/<nowiki>(.*?)<\/nowiki>/g, '$1') +
        '</syntaxhighlight>'
      ))
      .replace(/<br \/>/g, '<br>')
      .trim();
    let hidden;
    ({ code: wikitext, hidden } = hideSensitiveCode(wikitext));
    wikitext = brsToNewlines(wikitext);
    wikitext = unhideText(wikitext, hidden);
  } catch {
    // Empty
  }
  input.popPending();
  input.setDisabled(false);

  return wikitext;
}
