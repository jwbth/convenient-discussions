/**
 * Wrappers for MediaWiki action API requests ({@link
 * https://www.mediawiki.org/wiki/API:Main_page}).
 *
 * @module apiWrappers
 */

import lzString from 'lz-string';

import CdError from './CdError';
import cd from './cd';
import userRegistry from './userRegistry';
import { firstCharToUpperCase, handleApiReject } from './util';
import { unpackVisits, unpackWatchedSections } from './options';

let keptUserInfoRequest;
let keptUserNamesRequests = {};

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
 * @typedef {object} GetCurrentPageDataReturn
 * @property {string} html
 * @property {number} revisionId
 */

/**
 * Make a parse request (see {@link https://www.mediawiki.org/wiki/API:Parsing_wikitext}) regarding
 * the current page.
 *
 * @param {boolean} [markAsRead=false] Mark the current page as read in the watchlist.
 * @param {boolean} [noTimers=false] Don't use timers (they can set the process on hold in
 *   background tabs if the browser throttles them).
 * @returns {GetCurrentPageDataReturn}
 * @throws {CdError}
 */
export async function getCurrentPageData(markAsRead = false, noTimers = false) {
  const params = {
    action: 'parse',
    page: cd.g.CURRENT_PAGE,
    prop: ['text', 'revid', 'modules', 'jsconfigvars'],
    formatversion: 2,
  };
  const request = noTimers ?
    makeRequestNoTimers(params).catch(handleApiReject) :
    cd.g.api.get(params).catch(handleApiReject);

  if (markAsRead) {
    $.get(mw.util.getUrl(cd.g.CURRENT_PAGE));
  }
  const resp = await request;

  if (resp.parse === undefined) {
    throw new CdError({
      type: 'api',
      code: 'noData',
    });
  }

  return resp.parse;
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
 * Make a revision request (see {@link https://www.mediawiki.org/wiki/API:Revisions}) to load the
 * code of the specified page, together with few revision properties.
 *
 * @param {string|mw.Title} title
 * @returns {Promise} Promise resolved with an object containing the code, timestamp, redirect
 *   target, and query timestamp (curtimestamp).
 * @throws {CdError}
 */
export async function getLastRevision(title) {
  // The page doesn't exist.
  if (!mw.config.get('wgArticleId')) {
    return { code: '' };
  }

  const resp = await cd.g.api.get({
    action: 'query',
    titles: title.toString(),
    prop: 'revisions',
    rvprop: ['ids', 'content'],
    redirects: true,
    curtimestamp: true,
    formatversion: 2,
  }).catch(handleApiReject);

  const query = resp.query;
  const page = query && query.pages && query.pages[0];
  const revision = page && page.revisions && page.revisions[0];

  if (!query || !page) {
    throw new CdError({
      type: 'api',
      code: 'noData',
    });
  }
  if (page.missing) {
    throw new CdError({
      type: 'api',
      code: 'missing',
    });
  }
  if (page.invalid) {
    throw new CdError({
      type: 'api',
      code: 'invalid',
    });
  }
  if (!revision) {
    throw new CdError({
      type: 'api',
      code: 'noData',
    });
  }

  return {
    // It's more convenient to unify regexps to have \n as the last character of anything, not
    // (?:\n|$), and it doesn't seem to affect anything substantially.
    code: revision.content + '\n',

    revisionId: revision.revid,
    redirectTarget: query.redirects && query.redirects[0] && query.redirects[0].to,
    queryTimestamp: resp.curtimestamp,
  };
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
  if (reuse && keptUserInfoRequest) {
    return keptUserInfoRequest;
  }

  // We never use timers here as this request can be reused while checking for new messages in the
  // background which requires using timers (?), setting the process on hold if the browser
  // throttles background tabs.
  keptUserInfoRequest = makeRequestNoTimers({
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

  return keptUserInfoRequest;
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
 * Set an option value. See {@link https://www.mediawiki.org/wiki/API:Options}.
 *
 * @param {string} name
 * @param {string} value
 * @throws {CdError}
 */
export async function setOption(name, value) {
  if (value.length > 65535) {
    throw new CdError({
      type: 'internal',
      code: 'sizeLimit',
    });
  }

  const resp = await cd.g.api.postWithEditToken(cd.g.api.assertCurrentUser({
    action: 'options',
    optionname: name,
    optionvalue: value,
  })).catch(handleApiReject);

  if (!resp || resp.options !== 'success') {
    throw new CdError({
      type: 'api',
      code: 'noSuccess',
    });
  }
}

/**
 * Request genders of a list of users. A gender may be `'male'`, `'female'`, or `'unknown'`.
 *
 * @param {User[]} users
 * @param {boolean} [noTimers=false] Don't use timers (they can set the process on hold in
 *   background tabs if the browser throttles them).
 * @throws {CdError}
 */
export async function getUserGenders(users, noTimers = false) {
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
    const request = noTimers ?
      makeRequestNoTimers(params, 'post').catch(handleApiReject) :
      cd.g.api.post(params).catch(handleApiReject);

    const resp = await request;

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
 * Get a list of 11 usernames starting with the specified prefix. Reuses the existing request if
 * available.
 *
 * @param {string} prefix
 * @returns {Promise} Promise for a string array.
 */
export async function getUserNames(prefix) {
  prefix = firstCharToUpperCase(prefix);

  if (keptUserNamesRequests[prefix]) {
    return keptUserNamesRequests[prefix];
  }

  keptUserNamesRequests[prefix] = cd.g.api.get({
    action: 'query',
    list: 'allusers',
    auprefix: prefix,
    aulimit: 11,
    formatversion: 2,
  }).then(
    (resp) => {
      const users = (
        resp.query &&
        resp.query.allusers &&
        resp.query.allusers.map((user) => user.name)
      );

      if (!users) {
        keptUserNamesRequests[prefix] = null;
        throw new CdError({
          type: 'api',
          code: 'noData',
        });
      }

      return users;
    },
    (e) => {
      keptUserNamesRequests[prefix] = null;
      handleApiReject(e);
    }
  );

  return keptUserNamesRequests[prefix];
}
