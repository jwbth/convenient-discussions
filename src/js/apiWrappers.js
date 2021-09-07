/**
 * Wrappers for MediaWiki action API requests
 * ({@link https://www.mediawiki.org/wiki/API:Main_page}). See also the {@link Page} class methods
 * for functions regarding concrete page names.
 *
 * @module apiWrappers
 */

import lzString from 'lz-string';

import CdError from './CdError';
import cd from './cd';
import userRegistry from './userRegistry';
import { createApi } from './boot';
import { defined, firstCharToUpperCase, handleApiReject, unique } from './util';
import { unpackVisits, unpackWatchedSections } from './options';

let cachedUserInfoRequest;
let currentAutocompletePromise;

const autocompleteTimeout = 100;

/**
 * Make a request that won't set the process on hold when the tab is in the background.
 *
 * @param {object} params
 * @param {string} [method='post']
 * @returns {Promise}
 */
export function makeBackgroundRequest(params, method = 'post') {
  return new Promise((resolve, reject) => {
    cd.g.mwApi[method](params, {
      success: (resp) => {
        if (resp.error) {
          reject(['api', resp]);
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
 * @throws {CdError}
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
  };
  const options = Object.assign({}, defaultOptions, customOptions);
  return cd.g.mwApi.post(options, {
    // Beneficial when sending long unicode texts, which is what we do here.
    contentType: 'multipart/form-data',
  }).then(
    (resp) => {
      const html = resp.parse?.text;
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
      if (customOptions?.summary && !parsedSummary) {
        throw new CdError({
          type: 'api',
          code: 'noData',
        });
      }

      return { html, parsedSummary };
    },
    handleApiReject
  );
}

/**
 * Make a userinfo request (see {@link https://www.mediawiki.org/wiki/API:Userinfo}).
 *
 * @param {boolean} [reuse=false] Whether to reuse a cached request.
 * @returns {Promise} Promise for an object containing the full options object, visits, watched
 *   sections, and rights.
 * @throws {CdError}
 */
export function getUserInfo(reuse = false) {
  if (reuse && cachedUserInfoRequest) {
    return cachedUserInfoRequest;
  }

  createApi();
  cachedUserInfoRequest = cd.g.mwApi.post({
    action: 'query',
    meta: 'userinfo',
    uiprop: ['options', 'rights'],
  }).then(
    (resp) => {
      const userinfo = resp.query?.userinfo;
      const options = userinfo?.options;
      const rights = userinfo?.rights;
      if (!options || !rights) {
        throw new CdError({
          type: 'api',
          code: 'noData',
        });
      }

      const visitsCompressed = options[cd.g.VISITS_OPTION_NAME];
      const visitsString = visitsCompressed ?
        lzString.decompressFromEncodedURIComponent(visitsCompressed) :
        '';
      const visits = unpackVisits(visitsString);

      const watchedSectionsCompressed = options[cd.g.WATCHED_SECTIONS_OPTION_NAME];
      const watchedSectionsString = watchedSectionsCompressed ?
        lzString.decompressFromEncodedURIComponent(watchedSectionsCompressed) :
        '';
      const watchedSections = unpackWatchedSections(watchedSectionsString);

      cd.g.USER_RIGHTS = rights;

      return { options, visits, watchedSections, rights };
    },
    handleApiReject
  );

  return cachedUserInfoRequest;
}

/**
 * _Method for internal use._ Generate an error text for an unknown error.
 *
 * @param {string} errorCode
 * @param {string} [errorInfo]
 * @returns {Promise.<string>}
 */
export async function generateUnknownApiErrorText(errorCode, errorInfo) {
  let text;
  if (errorCode) {
    text = cd.sParse('error-api', errorCode) + ' ';
    if (errorInfo) {
      try {
        text += (await parseCode(errorInfo)).html;
      } catch {
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
 * @returns {Promise.<object[]>}
 * @throws {CdError}
 */
export async function getPageTitles(pageIds) {
  const pages = [];
  const limit = cd.g.USER_RIGHTS?.includes('apihighlimits') ? 500 : 50;
  let nextPageIds;
  while ((nextPageIds = pageIds.splice(0, limit).join('|'))) {
    const resp = await cd.g.mwApi.post({
      action: 'query',
      pageids: nextPageIds,
    }).catch(handleApiReject);

    if (resp.error) {
      throw new CdError({
        type: 'api',
        code: 'error',
        apiData: resp,
      });
    }

    const query = resp.query;
    const pagesToAdd = query?.pages;
    if (!pagesToAdd) {
      throw new CdError({
        type: 'api',
        code: 'noData',
      });
    }

    pages.push(...pagesToAdd);
  }

  return pages;
}

/**
 * Get page IDs for an array of page titles.
 *
 * @param {string[]} pageTitles
 * @returns {Promise.<object[]>}
 * @throws {CdError}
 */
export async function getPageIds(pageTitles) {
  const normalized = [];
  const redirects = [];
  const pages = [];
  const limit = cd.g.USER_RIGHTS?.includes('apihighlimits') ? 500 : 50;
  let nextPageTitles;
  while ((nextPageTitles = pageTitles.splice(0, limit).join('|'))) {
    const resp = await cd.g.mwApi.post({
      action: 'query',
      titles: nextPageTitles,
      redirects: true,
    }).catch(handleApiReject);

    if (resp.error) {
      throw new CdError({
        type: 'api',
        code: 'error',
        apiData: resp,
      });
    }

    const query = resp.query;
    const pagesToAdd = query?.pages;
    if (!pagesToAdd) {
      throw new CdError({
        type: 'api',
        code: 'noData',
      });
    }

    normalized.push(...query.normalized || []);
    redirects.push(...query.redirects || []);
    pages.push(...pagesToAdd);
  }

  return { normalized, redirects, pages };
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
  if (value && value.length > 65535) {
    throw new CdError({
      type: 'internal',
      code: 'sizeLimit',
      details: { action },
    });
  }

  const resp = await makeBackgroundRequest(cd.g.mwApi.assertCurrentUser({
    action,
    optionname: name,

    // Global options can't be deleted because of the bug https://phabricator.wikimedia.org/T207448.
    optionvalue: value === undefined && action === 'globalpreferences' ? '' : value,
  }), 'postWithEditToken').catch(handleApiReject);

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
 * Set a global preferences' option value. See
 * {@link https://www.mediawiki.org/wiki/Extension:GlobalPreferences/API}.
 *
 * @param {string} name
 * @param {string} value
 * @throws {CdError}
 */
export async function setGlobalOption(name, value) {
  if (!cd.config.useGlobalPreferences) {
    // Normally, this won't run if cd.config.useGlobalPreferences is false. But it will run as part
    // of SettingsDialog#removeData in modal#showSettingsDialog, removing the option if it existed,
    // which may have a benificial effect if cd.config.useGlobalPreferences was true at some stage
    // and a local setting with cd.g.SETTINGS_OPTION_NAME name was created instead of a global one,
    // thus inviting the need to remove it upon removing all data.
    await setLocalOption(name, value);

    return;
  }
  try {
    await setOption(name, value, 'globalpreferences');
  } catch (e) {
    // The site doesn't support global preferences.
    if (e instanceof CdError && e.data.apiData && e.data.apiData.error.code === 'badvalue') {
      await setLocalOption(name, value);
    } else {
      throw e;
    }
  }
}

/**
 * Request genders of a list of users. A gender may be `'male'`, `'female'`, or `'unknown'`.
 *
 * @param {User[]} users
 * @param {boolean} [requestInBackground=false] Make a request that won't set the process on hold
 *   when the tab is in the background.
 * @throws {CdError}
 */
export async function getUserGenders(users, requestInBackground = false) {
  const usersToRequest = users
    .filter((user) => !user.getGender() && user.isRegistered())
    .filter(unique)
    .map((user) => user.name);
  const limit = cd.g.USER_RIGHTS?.includes('apihighlimits') ? 500 : 50;
  let nextUsers;
  while ((nextUsers = usersToRequest.splice(0, limit).join('|'))) {
    const options = {
      action: 'query',
      list: 'users',
      ususers: nextUsers,
      usprop: 'gender',
    };
    const request = requestInBackground ? makeBackgroundRequest(options) : cd.g.mwApi.post(options);
    const resp = await request.catch(handleApiReject);
    const users = resp.query?.users;
    if (!users) {
      throw new CdError({
        type: 'api',
        code: 'noData',
      });
    }
    users
      .filter((user) => user.gender)
      .forEach((user) => {
        userRegistry.getUser(user.name).setGender(user.gender);
      });
  }
}

/**
 * Get a list of 10 user names matching the specified search text. User names are sorted as
 * {@link https://www.mediawiki.org/wiki/API:Opensearch OpenSearch} sorts them. Only users with a
 * talk page existent are included. Redirects are resolved.
 *
 * Reuses the existing request if available.
 *
 * @param {string} text
 * @returns {Promise} Promise for a string array.
 * @throws {CdError}
 */
export function getRelevantUserNames(text) {
  text = firstCharToUpperCase(text);
  const promise = new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        if (promise !== currentAutocompletePromise) {
          throw new CdError();
        }

        // First, try to use the search to get only users that have talk pages. Most legitimate
        // users do, while spammers don't.
        const resp = cd.g.mwApi.get({
          action: 'opensearch',
          search: text,
          namespace: 3,
          redirects: 'resolve',
          limit: 10,
        }).catch(handleApiReject);

        const users = resp[1]
          ?.map((name) => (name.match(cd.g.USER_NAMESPACES_REGEXP) || [])[1])
          .filter(defined)
          .filter((name) => !name.includes('/'));
        if (!users) {
          throw new CdError({
            type: 'api',
            code: 'noData',
          });
        }

        if (users.length) {
          resolve(users);
        } else {
          // If we didn't succeed with search, try the entire users database.
          const resp = cd.g.mwApi.get({
            action: 'query',
            list: 'allusers',
            auprefix: text,
          }).catch(handleApiReject);

          const users = resp?.query?.allusers?.map((user) => user.name);
          if (!users) {
            throw new CdError({
              type: 'api',
              code: 'noData',
            });
          }

          resolve(users);
        }
      } catch (e) {
        reject(e);
      }
    }, autocompleteTimeout);
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
 * @returns {Promise} Promise for a string array.
 * @throws {CdError}
 */
export function getRelevantPageNames(text) {
  let colonPrefix = false;
  if (cd.g.COLON_NAMESPACES_PREFIX_REGEXP.test(text)) {
    text = text.slice(1);
    colonPrefix = true;
  }

  const promise = new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        if (promise !== currentAutocompletePromise) {
          throw new CdError();
        }

        cd.g.mwApi.get({
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

        cd.g.mwApi.get({
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
  const titlesToRequest = titles.slice();
  const limit = cd.g.USER_RIGHTS?.includes('apihighlimits') ? 500 : 50;
  let nextPages;
  while ((nextPages = titlesToRequest.splice(0, limit).join('|'))) {
    const resp = await cd.g.mwApi.post({
      action: 'query',
      titles: nextPages,
    }).catch(handleApiReject);

    if (resp.error) {
      throw new CdError({
        type: 'api',
        code: 'error',
        apiData: resp,
      });
    }

    const query = resp.query;
    const pagesToAdd = query?.pages;
    if (!pagesToAdd) {
      throw new CdError({
        type: 'api',
        code: 'noData',
      });
    }

    normalized.push(...query.normalized || []);
    pages.push(...pagesToAdd);
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
