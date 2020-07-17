/**
 * Wrappers for MediaWiki action API requests ({@link
 * https://www.mediawiki.org/wiki/API:Main_page}). See also the {@link module:Page Page class}
 * methods for functions regarding concrete page names.
 *
 * @module apiWrappers
 */

import lzString from 'lz-string';

import CdError from './CdError';
import cd from './cd';
import userRegistry from './userRegistry';
import { defined, handleApiReject } from './util';
import { unpackVisits, unpackWatchedSections } from './options';

let cachedUserInfoRequest;
let currentAutocompletePromise;

const autocompleteTimeout = 100;

/**
 * Make a request that isn't subject to throttling when the tab is in the background (google "Chrome
 * throttles background tabs").
 *
 * @param {object} params
 * @param {string} method
 * @returns {Promise}
 */
export function makeRequestNoTimers(params, method = 'get') {
  return new Promise((resolve, reject) => {
    cd.g.api[method](params, {
      success: (resp) => {
        if (resp.error) {
          reject('api', resp);
        } else {
          resolve(resp);
        }
      },
      error: (jqXHR, textStatus) => {
        reject('http', textStatus);
      },
    });
  });
}

/**
 * Make a parse request with arbitrary code. We assume that if something is parsed, it will be
 * shown, so we automatically load modules.
 *
 * @param {string} code
 * @param {object} options
 * @returns {Promise}
 * @throws {CdError}
 */
export async function parseCode(code, options) {
  const defaultOptions = {
    action: 'parse',
    text: code,
    prop: ['text', 'modules'],
    pst: true,
    disablelimitreport: true,
    formatversion: 2,
  };
  return cd.g.api.post(Object.assign({}, defaultOptions, options)).then(
    (resp) => {
      const html = resp && resp.parse && resp.parse.text;
      if (html) {
        mw.loader.load(resp.parse.modules);
        mw.loader.load(resp.parse.modulestyles);
      } else {
        throw new CdError({
          type: 'api',
          code: 'noData',
        });
      }

      const parsedSummary = resp.parse.parsedsummary;

      return { html, parsedSummary };
    },
    handleApiReject
  );
}

/**
 * Make a userinfo request (see {@link https://www.mediawiki.org/wiki/API:Userinfo}).
 *
 * @param {boolean} [reuse=false] Reuse the previous request if present.
 * @returns {Promise} Promise for an object containing the full options object, visits, watched
 *   sections, and rights.
 * @throws {CdError}
 */
export function getUserInfo(reuse = false) {
  if (reuse && cachedUserInfoRequest) {
    return cachedUserInfoRequest;
  }

  // We never use timers here as this request can be reused while checking for new messages in the
  // background which requires using timers (?), setting the process on hold if the browser
  // throttles background tabs.
  cachedUserInfoRequest = makeRequestNoTimers({
    action: 'query',
    meta: 'userinfo',
    uiprop: ['options', 'rights'],
    formatversion: 2,
  }).then(
    (resp) => {
      const userinfo = resp && resp.query && resp.query.userinfo;
      const options = userinfo && userinfo.options;
      const rights = userinfo && userinfo.rights;
      if (!options || !rights) {
        throw new CdError({
          type: 'api',
          code: 'noData',
        });
      }

      const visitsCompressed = options[cd.g.VISITS_OPTION_FULL_NAME];
      const visitsString = visitsCompressed ?
        lzString.decompressFromEncodedURIComponent(visitsCompressed) :
        '';
      const visits = unpackVisits(visitsString);

      const watchedSectionsCompressed = options[cd.g.WATCHED_SECTIONS_OPTION_FULL_NAME];
      const watchedSectionsString = watchedSectionsCompressed ?
        lzString.decompressFromEncodedURIComponent(watchedSectionsCompressed) :
        '';
      const watchedSections = unpackWatchedSections(watchedSectionsString);

      cd.g.CURRENT_USER_RIGHTS = rights;

      return { options, visits, watchedSections, rights };
    },
    handleApiReject
  );

  return cachedUserInfoRequest;
}

/**
 * Generate an error text for an unknown error.
 *
 * @param {string} errorCode
 * @param {string} [errorInfo]
 * @returns {string}
 * @private
 */
export async function unknownApiErrorText(errorCode, errorInfo) {
  let text;
  if (errorCode) {
    text = cd.s('error-api', errorCode) + ' ';
    if (errorInfo) {
      try {
        const { html } = await parseCode(errorInfo);
        text += html;
      } catch (e) {
        text += errorInfo;
      }
    }
  }

  return text;
}

/**
 * Get page titles for an array of page IDs.
 *
 * @param {number[]} pageIds
 * @returns {object[]}
 * @throws {CdError}
 */
export async function getPageTitles(pageIds) {
  const allPages = [];

  const limit = cd.g.CURRENT_USER_RIGHTS && cd.g.CURRENT_USER_RIGHTS.includes('apihighlimits') ?
    500 :
    50;

  let nextPageIds;
  while ((nextPageIds = pageIds.splice(0, limit).join('|'))) {
    const resp = await cd.g.api.post({
      action: 'query',
      pageids: nextPageIds,
      formatversion: 2,
    }).catch(handleApiReject);

    if (resp.error) {
      throw new CdError({
        type: 'api',
        code: 'error',
        apiData: resp,
      });
    }

    const query = resp && resp.query;
    const pages = query && query.pages;
    if (!pages) {
      throw new CdError({
        type: 'api',
        code: 'noData',
      });
    }

    allPages.push(...pages);
  }

  return allPages;
}

/**
 * Get page IDs for an array of page titles.
 *
 * @param {string[]} pageTitles
 * @returns {object[]}
 * @throws {CdError}
 */
export async function getPageIds(pageTitles) {
  const allPages = [];
  const allNormalized = [];
  const allRedirects = [];

  const limit = cd.g.CURRENT_USER_RIGHTS && cd.g.CURRENT_USER_RIGHTS.includes('apihighlimits') ?
    500 :
    50;

  let nextPageTitles;
  while ((nextPageTitles = pageTitles.splice(0, limit).join('|'))) {
    const resp = await cd.g.api.post({
      action: 'query',
      titles: nextPageTitles,
      redirects: true,
      formatversion: 2,
    }).catch(handleApiReject);

    if (resp.error) {
      throw new CdError({
        type: 'api',
        code: 'error',
        apiData: resp,
      });
    }

    const query = resp && resp.query;
    const pages = query && query.pages;
    if (!pages) {
      throw new CdError({
        type: 'api',
        code: 'noData',
      });
    }

    const normalized = query.normalized || [];
    const redirects = query.redirects || [];

    allNormalized.push(...normalized);
    allRedirects.push(...redirects);
    allPages.push(...pages);
  }

  return {
    pages: allPages,
    normalized: allNormalized,
    redirects: allRedirects,
  };
}

/**
 * Generic function for setting an option.
 *
 * @param {string} name
 * @param {string} value
 * @param {string} action
 * @private
 */
async function setOption(name, value, action) {
  if (value.length > 65535) {
    throw new CdError({
      type: 'internal',
      code: 'sizeLimit',
      details: { action },
    });
  }

  const resp = await cd.g.api.postWithEditToken(cd.g.api.assertCurrentUser({
    action: action,
    optionname: name,
    optionvalue: value,
  })).catch(handleApiReject);

  if (!resp || resp[action] !== 'success') {
    throw new CdError({
      type: 'api',
      code: 'noSuccess',
      details: { action },
    });
  }
}

/**
 * Set an option value. See {@link https://www.mediawiki.org/wiki/API:Options}.
 *
 * @param {string} name
 * @param {string} value
 * @throws {CdError}
 */
export async function setLocalOption(name, value) {
  await setOption(name, value, 'options');
}

/**
 * Set a global preferences' option value. See {@link
 * https://www.mediawiki.org/wiki/Extension:GlobalPreferences/API}.
 *
 * @param {string} name
 * @param {string} value
 * @throws {CdError}
 */
export async function setGlobalOption(name, value) {
  await setOption(name, value, 'globalpreferences');
}

/**
 * Request genders of a list of users. A gender may be `'male'`, `'female'`, or `'unknown'`.
 *
 * @param {User[]} users
 * @param {object} [options={}]
 * @param {boolean} [options.noTimers=false] Don't use timers (they can set the process on hold in
 *   background tabs if the browser throttles them).
 * @throws {CdError}
 */
export async function getUserGenders(users, { noTimers = false } = {}) {
  const usersToRequest = users
    .filter((user) => !user.gender)
    .map((user) => user.name);
  const limit = cd.g.CURRENT_USER_RIGHTS && cd.g.CURRENT_USER_RIGHTS.includes('apihighlimits') ?
    500 :
    50;
  let nextUsers;
  while ((nextUsers = usersToRequest.splice(0, limit).join('|'))) {
    const params = {
      action: 'query',
      list: 'users',
      ususers: nextUsers,
      usprop: 'gender',
      formatversion: 2,
    };
    const resp = await (noTimers ? makeRequestNoTimers(params, 'post') : cd.g.api.post(params))
      .catch(handleApiReject);
    const users = resp && resp.query && resp.query.users;
    if (!users) {
      throw new CdError({
        type: 'api',
        code: 'noData',
      });
    }
    users.forEach((user) => {
      userRegistry.getUser(user.name).gender = user.gender;
    });
  }
}

/**
 * Get a list of 10 user names matching the specified search text. User names are sorted as {@link
 * https://www.mediawiki.org/wiki/API:Opensearch OpenSearch} sorts them. Only users with a talk page
 * existent are included. Redirects are resolved.
 *
 * Reuses the existing request if available.
 *
 * @param {string} text
 * @returns {Promise} Promise for a string array.
 * @throws {CdError}
 */
export function getRelevantUserNames(text) {
  const promise = new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        if (promise !== currentAutocompletePromise) {
          throw new CdError();
        }

        cd.g.api.get({
          action: 'opensearch',
          search: text,
          namespace: 3,
          redirects: 'resolve',
          limit: 10,
          formatversion: 2,
        }).then(
          (resp) => {
            const users = (
              resp &&
              resp[1] &&
              resp[1]
                .map((name) => (name.match(cd.g.USER_NAMESPACES_REGEXP) || [])[1])
                .filter(defined)
                .filter((name) => !name.includes('/'))
            );

            if (!users) {
              throw new CdError({
                type: 'api',
                code: 'noData',
              });
            }

            resolve(users);
          },
          (e) => {
            handleApiReject(e);
          }
        );
      } catch (e) {
        reject(e);
      }
    }, autocompleteTimeout);
  });
  currentAutocompletePromise = promise;

  return promise;
}

/**
 * Get a list of 10 page names matching the specified search text. Page names are sorted as {@link
 * https://www.mediawiki.org/wiki/API:Opensearch OpenSearch} sorts them. Redirects are not resolved.
 *
 * Reuses the existing request if available.
 *
 * @param {string} text
 * @returns {Promise} Promise for a string array.
 * @throws {CdError}
 */
export function getRelevantPageNames(text) {
  const promise = new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        if (promise !== currentAutocompletePromise) {
          throw new CdError();
        }

        cd.g.api.get({
          action: 'opensearch',
          search: text,
          redirects: 'return',
          limit: 10,
          formatversion: 2,
        }).then(
          (resp) => {
            const matchingFirstLetterRegexp = new RegExp('^' + mw.util.escapeRegExp(text[0]), 'i');
            const pages = (
              resp &&
              resp[1] &&
              resp[1].map((name) => name.replace(matchingFirstLetterRegexp, () => text[0]))
            );

            if (!pages) {
              throw new CdError({
                type: 'api',
                code: 'noData',
              });
            }

            resolve(pages);
          },
          (e) => {
            handleApiReject(e);
          }
        );
      } catch (e) {
        reject(e);
      }
    }, autocompleteTimeout);
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
 * @returns {Promise} Promise for a string array.
 * @throws {CdError}
 */
export function getRelevantTemplateNames(text) {
  const promise = new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        if (promise !== currentAutocompletePromise) {
          throw new CdError();
        }

        cd.g.api.get({
          action: 'opensearch',
          search: text.startsWith(':') ? text.slice(1) : 'Template:' + text,
          redirects: 'return',
          limit: 10,
          formatversion: 2,
        }).then(
          (resp) => {
            const matchingFirstLetterRegexp = new RegExp('^' + mw.util.escapeRegExp(text[0]), 'i');
            const templates = (
              resp &&
              resp[1] &&
              resp[1]
                .filter((name) => !name.endsWith('/doc'))
                .map((name) => text.startsWith(':') ? name : name.slice(name.indexOf(':') + 1))
                .map((name) => name.replace(matchingFirstLetterRegexp, () => text[0]))
            );

            if (!templates) {
              throw new CdError({
                type: 'api',
                code: 'noData',
              });
            }

            resolve(templates);
          },
          (e) => {
            handleApiReject(e);
          }
        );
      } catch (e) {
        reject(e);
      }
    }, autocompleteTimeout);
  });
  currentAutocompletePromise = promise;

  return promise;
}
