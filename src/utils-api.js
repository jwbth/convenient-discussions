/**
 * Wrappers for MediaWiki action API requests ({@link https://www.mediawiki.org/wiki/API:Main_page})
 * together with some user options handling functions. See also the {@link Page} class methods for
 * API methods related to specific titles.
 *
 * @module utilsApi
 */

import CdError from './CdError';
import TextMasker from './TextMasker';
import cd from './cd';
import controller from './controller';
import userRegistry from './userRegistry';
import { unique } from './utils-general';
import { brsToNewlines } from './utils-wikitext';

let cachedUserInfoRequest;

/**
 * Callback used in the `.catch()` parts of API requests.
 *
 * @param {string|Array} code
 * @param {object} resp
 * @throws {CdError}
 */
export function handleApiReject(code, resp) {
  // Native promises support only one parameter when `reject()`ing.
  if (Array.isArray(code)) {
    [code, resp] = code;
  }

  // See the parameters with which mw.Api() rejects:
  // https://phabricator.wikimedia.org/source/mediawiki/browse/master/resources/src/mediawiki.api/index.js;137c7de7a44534704762105323192d2d1bfb5765$269
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
  // Current user's rights are only set on an `userinfo` request which is performed late (see "We
  // are _not_ calling..." in controller#loadToTalkPage()). For example, getDtSubscriptions() runs
  // earlier than that. In addition to that, cd.g.phpCharToUpper is empty until we make sure the
  // mediawiki.Title module is loaded.
  let currentUserRights;
  try {
    currentUserRights = cd.user.getRights();
  } catch {
    // Can throw a error when cd.g.phpCharToUpper is undefined, because it's set when the modules
    // are ready.
  }
  const limit = (
    currentUserRights ?
      currentUserRights.includes('apihighlimits') :
      mw.config.get('wgUserGroups').includes('sysop')
  ) ?
    500 :
    50;
  return arr.reduce((result, item, index) => {
    const chunkIndex = Math.floor(index / limit);
    result[chunkIndex] ||= [];
    result[chunkIndex].push(item);
    return result;
  }, []);
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
          // expire. A re-request of such tokens is generally successful, but _this_ callback is
          // executed after each response, so we aren't rejecting to avoid misleading error messages
          // being shown to the user.
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
export async function parseCode(code, customOptions) {
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
  const resp = await controller.getApi().post(options).catch(handleApiReject);

  mw.loader.load(resp.parse.modules);
  mw.loader.load(resp.parse.modulestyles);

  return {
    html: resp.parse.text,
    parsedSummary: resp.parse.parsedsummary,
  };
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
      const { options, rights } = resp.query.userinfo;
      const visits = options[cd.g.visitsOptionName];
      const subscriptions = options[cd.g.subscriptionsOptionName];
      try {
        cd.user.setRights(rights);
      } catch {
        // Can throw a error when cd.g.phpCharToUpper is undefined, because it's set when the
        // modules are ready
      }

      return { options, visits, subscriptions };
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
    pages.push(
      ...(
        await controller.getApi().post({
          action: 'query',
          pageids: nextPageIds,
        }).catch(handleApiReject)
      ).query.pages
    );
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
    const { query } = await controller.getApi().post({
      action: 'query',
      titles: nextTitles,
      redirects: true,
    }).catch(handleApiReject);

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
  if (Object.entries(options).some(([, value]) => value && value.length > 65535)) {
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
          .map(([name, value]) => name + (value === null ? '' : '=' + value))
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
    // of SettingsDialog#removeData() in settings.showDialog(), removing the option if it existed,
    // which may have a benificial effect if cd.config.useGlobalPreferences was true at some stage
    // and a local setting with cd.g.settingsOptionName name was created instead of a global one,
    // thus inviting the need to remove it upon removing all data.
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
 * Request a REST API to transform HTML to wikitext.
 *
 * @param {string} url URL of the API.
 * @param {string} html HTML to transform.
 * @returns {Promise.<string>}
 * @private
 */
function requestTransformApi(url, html) {
  return $.post(url, {
    html,
    scrub_wikitext: true,
  });
}

/**
 * Convert HTML into wikitext.
 *
 * @param {string} html
 * @param {Array.<string|undefined>} syntaxHighlightLanguages
 * @returns {Promise.<string>}
 */
export async function convertHtmlToWikitext(html, syntaxHighlightLanguages) {
  let wikitext;
  try {
    try {
      if (!cd.g.isProbablyWmfSulWiki) {
        throw undefined;
      }
      wikitext = await requestTransformApi('/api/rest_v1/transform/html/to/wikitext', html);
    } catch {
      wikitext = await requestTransformApi('https://en.wikipedia.org/api/rest_v1/transform/html/to/wikitext', html);
    }
    wikitext = wikitext
      .replace(
        /(?:^ .*(?:\n|$))+|<code dir="(?:ltr|rtl)">([^]*?)<\/code>/gm,
        (s, inlineCode) => {
          const lang = syntaxHighlightLanguages.shift() || 'wikitext';
          const code = (
            inlineCode === undefined ?
              '\n' +
              s
                .replace(/^ /gm, '')
                .replace(/[^\n]$/, '$0\n') :
              inlineCode
          ).replace(/<nowiki>([^]*?)<\/nowiki>/g, '$1');
          const inlineOrNot = inlineCode === undefined ? '' : ' inline';
          return `<syntaxhighlight lang="${lang}"${inlineOrNot}>${code}</syntaxhighlight>`;
        }
      )
      .replace(/<br \/>/g, '<br>')
      .trim();
    wikitext = (new TextMasker(wikitext))
      .maskSensitiveCode()
      .withText((text) => brsToNewlines(text))
      .unmask()
      .getText();
  } catch {
    // Empty
  }

  return wikitext;
}
