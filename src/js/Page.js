/**
 * Page class.
 *
 * @module Page
 */

import CdError from './CdError';
import cd from './cd';
import { findFirstTimestamp, hideDistractingCode } from './wikitext';
import { generateUnknownApiErrorText, makeBackgroundRequest, parseCode } from './apiWrappers';
import { handleApiReject, isProbablyTalkPage } from './util';
import { parseTimestamp } from './timestamp';

/**
 * Class representing a wiki page (a page for which the `wgIsArticle` config value is `true`).
 *
 * @module Page
 */
export default class Page {
  /**
   * Create a page instance.
   *
   * @param {string|mw.Title} nameOrMwTitle
   * @param {boolean} [normalizeNamespace=true] Whether to normalize the namespace name for the
   *   {@link module:Page#name name} property (usually used to keep the gendered namespace name).
   * @throws {CdError}
   */
  constructor(nameOrMwTitle, normalizeNamespace = true) {
    const title = nameOrMwTitle instanceof mw.Title ?
      nameOrMwTitle :
      new mw.Title(nameOrMwTitle);

    /**
     * Page title, with no namespace name. The word separator is a space, not an underline.
     *
     * @type {string}
     */
    this.title = title.getMainText();

    /**
     * Page name, with a canonical namespace name. The word separator is a space, not an underline.
     *
     * @type {string}
     */
    this.canonicalName = title.getPrefixedText();

    /**
     * Page name, with a namespace name. The word separator is a space, not an underline.
     *
     * @type {string}
     */
    this.name = normalizeNamespace && typeof nameOrMwTitle === 'string' ?
      this.canonicalName :
      nameOrMwTitle;

    /**
     * Namespace number.
     *
     * @type {number}
     */
    this.namespaceId = title.getNamespaceId();
  }

  /**
   * Get the URL of the page with the specified parameters.
   *
   * @param {object} parameters
   * @returns {string}
   */
  getUrl(parameters) {
    return mw.util.getUrl(this.name, parameters);
  }

  /**
   * Check if the page is probably a talk page.
   *
   * @returns {boolean}
   */
  isProbablyTalkPage() {
    return isProbablyTalkPage(this.realName || this.name, this.namespaceId);
  }

  /**
   * Check if the page is an archive page. Relies on {@link module:defaultConfig.archivePaths}
   * and/or, for the current page, elements with the class `cd-archivingInfo` and attribute
   * `data-is-archive-page`.
   *
   * @returns {boolean}
   */
  isArchivePage() {
    let result;
    if (this === cd.g.PAGE) {
      result = cd.g.$root.find('.cd-archivingInfo').data('isArchivePage');
    }
    if (result === undefined) {
      result = false;
      const name = this.realName || this.name;
      const iterator = cd.g.SOURCE_PAGES_MAP.keys();
      for (const sourceRegexp of iterator) {
        if (sourceRegexp.test(name)) {
          result = true;
          break;
        }
      }
    }
    return Boolean(result);
  }

  /**
   * Check if this page can have archives. If the page is an archive page, returns `false`. Relies
   * on {@link module:defaultConfig.pagesWithoutArchives} and
   * {@link module:defaultConfig.archivePaths} and/or, for the current page, elements with the class
   * `cd-archivingInfo` and attribute `data-can-have-archives`.
   *
   * @returns {?boolean}
   */
  canHaveArchives() {
    if (this.isArchivePage()) {
      return false;
    }
    let result;
    if (this === cd.g.PAGE) {
      result = cd.g.$root.find('.cd-archivingInfo').data('canHaveArchives');
    }
    if (result === undefined) {
      const name = this.realName || this.name;
      result = !cd.g.PAGES_WITHOUT_ARCHIVES_REGEXP?.test(name);
    }
    return Boolean(result);
  }

  /**
   * Get the archive prefix for the page. If no prefix is found based on
   * {@link module:defaultConfig.archivePaths} and/or, for the current page, elements with the class
   * `cd-archivingInfo` and attribute `data-archive-prefix`, returns the current page's name. If the
   * page is an archive page or can't have archives, returns `null`.
   *
   * @returns {?string}
   */
  getArchivePrefix() {
    if (!this.canHaveArchives()) {
      return null;
    }
    let result;
    if (this === cd.g.PAGE) {
      result = cd.g.$root.find('.cd-archivingInfo').data('archivePrefix');
    }
    const name = this.realName || this.name;
    if (!result) {
      const iterator = cd.g.ARCHIVE_PAGES_MAP.entries();
      for (const [sourceRegexp, replacement] of iterator) {
        if (sourceRegexp.test(name)) {
          result = name.replace(sourceRegexp, replacement);
          break;
        }
      }
    }
    return String(result) || name + '/';
  }

  /**
   * Get the source page for the page (i.e., the page from which archiving is happening). Returns
   * the page itself if it is not an archive page. Relies on
   * {@link module:defaultConfig.archivePaths} and/or, for the current page, elements with the class
   * `cd-archivingInfo` and attribute `data-archived-page`.
   *
   * @returns {Page}
   */
  getArchivedPage() {
    let result;
    if (this === cd.g.PAGE) {
      result = cd.g.$root.find('.cd-archivingInfo').data('archivedPage');
    }
    if (!result) {
      const name = this.realName || this.name;
      const iterator = cd.g.SOURCE_PAGES_MAP.entries();
      for (const [archiveRegexp, replacement] of iterator) {
        if (archiveRegexp.test(name)) {
          result = name.replace(archiveRegexp, replacement);
          break;
        }
      }
    }
    return result ? new Page(String(result)) : this;
  }

  /**
   * Make a revision request (see {@link https://www.mediawiki.org/wiki/API:Revisions}) to load the
   * code of the page, together with a few revision properties: the timestamp, redirect target, and
   * query timestamp (curtimestamp). Enrich the Page instance with those properties. Also set the
   * `realName` property that indicates either the redirect target if it's present or the page name.
   *
   * @param {boolean} [tolerateMissing=true] Assign `''` to the `code` property if the page is
   *   missing instead of throwing an error.
   *
   * @throws {CdError}
   */
  async getCode(tolerateMissing = true) {
    const resp = await cd.g.api.post({
      action: 'query',
      titles: this.name,
      prop: 'revisions',
      rvslots: 'main',
      rvprop: ['ids', 'content'],
      redirects: !(this === cd.g.PAGE && mw.config.get('wgIsRedirect')),
      curtimestamp: true,
      formatversion: 2,
    }).catch(handleApiReject);

    const query = resp.query;
    const page = query?.pages?.[0];
    const revision = page?.revisions?.[0];
    const content = revision?.slots?.main?.content;

    if (!query || !page) {
      throw new CdError({
        type: 'api',
        code: 'noData',
      });
    }

    if (page.missing) {
      if (tolerateMissing) {
        Object.assign(this, {
          code: '',
          realName: this.name,
          queryTimestamp: resp.curtimestamp,
        });
        return;
      } else {
        throw new CdError({
          type: 'api',
          code: 'missing',
        });
      }
    }
    if (page.invalid) {
      throw new CdError({
        type: 'api',
        code: 'invalid',
      });
    }

    if (!revision || content === undefined) {
      throw new CdError({
        type: 'api',
        code: 'noData',
      });
    }

    const redirectTarget = query.redirects?.[0]?.to || null;

    /**
     * Page ID on the wiki. Filled upon running {@link module:Page#getCode} or
     * {@link module:Page#edit}. In the latter case, it is useful for newly created pages.
     *
     * @name pageId
     * @type {number|undefined}
     * @instance
     */

    /**
     * Page code. Filled upon running {@link module:Page#getCode}.
     *
     * @name code
     * @type {string|undefined}
     * @instance
     */

    /**
     * ID of the revision that has {@link module:Page#code}. Filled upon running
     * {@link module:Page#getCode}.
     *
     * @name revisionId
     * @type {number|undefined}
     * @instance
     */

    /**
     * Page where {@link module:Page#name} redirects. Filled upon running
     * {@link module:Page#getCode}.
     *
     * @name redirectTarget
     * @type {?(string|undefined)}
     * @instance
     */

    /**
     * If {@link module:Page#name} redirects to some other page, the value is that page. If not, the
     * value is the same as {@link module:Page#name}. Filled upon running
     * {@link module:Page#getCode}.
     *
     * @name realName
     * @type {string|undefined}
     * @instance
     */

    /**
     * Time when {@link module:Page#code} was queried (as the server reports it). Filled upon
     * running {@link module:Page#getCode}.
     *
     * @name queryTimestamp
     * @type {string|undefined}
     * @instance
     */

    Object.assign(this, {
      pageId: page.pageid,

      // It's more convenient to unify regexps to have \n as the last character of anything, not
      // (?:\n|$), and it doesn't seem to affect anything substantially.
      code: content + '\n',

      revisionId: revision.revid,
      redirectTarget,
      realName: redirectTarget || this.name,
      queryTimestamp: resp.curtimestamp,
    });
  }

  /**
   * Make a parse request (see {@link https://www.mediawiki.org/wiki/API:Parsing_wikitext}).
   *
   * @param {boolean} [customOptions]
   * @param {boolean} [requestInBackground=false] Make a request that won't set the process on hold
   *   when the tab is in the background.
   * @param {boolean} [markAsRead=false] Mark the current page as read in the watchlist.
   * @returns {Promise.<object>}
   * @throws {CdError}
   */
  async parse(customOptions, requestInBackground = false, markAsRead = false) {
    const defaultOptions = {
      action: 'parse',

      // If we know that this page is a redirect, use its target. Otherwise, use the regular name.
      page: this.realName || this.name,

      redirects: true,
      prop: ['text', 'revid', 'modules', 'jsconfigvars'],
      formatversion: 2,
    };
    const options = Object.assign({}, defaultOptions, customOptions);

    // "page" and "oldid" can not be used together.
    if (customOptions?.oldid) {
      delete options.page;
    }

    let request = requestInBackground ? makeBackgroundRequest(options) : cd.g.api.post(options);
    request = request.catch(handleApiReject);

    const parse = (await request).parse;
    if (parse?.text === undefined) {
      throw new CdError({
        type: 'api',
        code: 'noData',
      });
    }

    if (markAsRead) {
      this.markAsRead(parse.revid);
    }

    return parse;
  }

  /**
   * Get a list of revisions of the page ("redirects" is set to true by default).
   *
   * @param {object} [customOptions={}]
   * @param {boolean} [requestInBackground=false] Make a request that won't set the process on hold
   *   when the tab is in the background.
   * @returns {Promise.<Array>}
   */
  async getRevisions(customOptions = {}, requestInBackground = false) {
    const defaultOptions = {
      action: 'query',
      titles: this.name,
      rvslots: 'main',
      prop: 'revisions',
      redirects: !(this === cd.g.PAGE && mw.config.get('wgIsRedirect')),
      formatversion: 2,
    };
    const options = Object.assign({}, defaultOptions, customOptions);

    let request = requestInBackground ? makeBackgroundRequest(options) : cd.g.api.post(options);
    request = request.catch(handleApiReject);

    const revisions = (await request).query?.pages?.[0]?.revisions;
    if (!revisions) {
      throw new CdError({
        type: 'api',
        code: 'noData',
      });
    }

    return revisions;
  }

  /**
   * Modify a page code string in accordance with an action. The `'addSection'` action is presumed.
   *
   * @param {object} options
   * @param {string} options.commentCode Comment code.
   * @param {CommentForm} options.commentForm Comment form that has the code.
   * @returns {string}
   */
  modifyWholeCode({ commentCode, commentForm }) {
    const wholeCode = this.code;
    let newWholeCode;
    if (commentForm.isNewTopicOnTop) {
      const adjustedPageCode = hideDistractingCode(wholeCode);
      const firstSectionStartIndex = adjustedPageCode.search(/^(=+).*\1[ \t\x01\x02]*$/m);
      let codeBefore;
      if (firstSectionStartIndex === -1) {
        codeBefore = wholeCode ? wholeCode + '\n' : '';
      } else {
        codeBefore = wholeCode.slice(0, firstSectionStartIndex);
      }
      const codeAfter = wholeCode.slice(firstSectionStartIndex);
      newWholeCode = codeBefore + commentCode + '\n' + codeAfter;
    } else {
      const codeBefore = commentForm.submitSection ? '' : (wholeCode + '\n').trimLeft();
      newWholeCode = codeBefore + commentCode;
    }

    return newWholeCode;
  }

  /**
   * Make an edit API request ({@link https://www.mediawiki.org/wiki/API:Edit}).
   *
   * @param {object} customOptions See {@link https://www.mediawiki.org/wiki/API:Edit}. At least
   *   `text` should be set. `summary` is recommended. `baserevid` and `starttimestamp` are needed
   *   to avoid edit conflicts. `baserevid` can be taken from {@link module:Page#revisionId};
   *   `starttimestamp` can be taken from {@link module:Page#queryTimestamp}.
   * @returns {Promise.<number|string>} Unix time of the edit or `'nochange'` if nothing has
   * changed.
   */
  async edit(customOptions) {
    const defaultOptions = {
      action: 'edit',

      // If we know that this page is a redirect, use its target. Otherwise, use the regular name.
      title: this.realName || this.name,

      notminor: !customOptions.minor,
      tags: cd.g.USER.isRegistered() ? cd.config.tagName : undefined,
      formatversion: 2,
    };
    const options = cd.g.api.assertCurrentUser(Object.assign({}, defaultOptions, customOptions));

    let resp;
    try {
      resp = await cd.g.api.postWithEditToken(options).catch(handleApiReject);
    } catch (e) {
      if (e instanceof CdError) {
        const { type, apiData } = e.data;
        if (type === 'network') {
          throw e;
        } else {
          const error = apiData?.error;
          let message;
          let isRawMessage = false;
          let logMessage;
          let code;
          if (error) {
            code = error.code;
            switch (code) {
              case 'spamblacklist': {
                message = cd.sParse('error-spamblacklist', error.spamblacklist.matches[0]);
                break;
              }

              case 'titleblacklist': {
                message = cd.sParse('error-titleblacklist');
                break;
              }

              case 'abusefilter-warning':
              case 'abusefilter-disallowed': {
                await cd.g.api.loadMessagesIfMissing([code]);
                const description = mw.message(code, error.abusefilter.description).plain();
                try {
                  message = (await parseCode(description)).html;
                } catch (e) {
                  console.warn('Couldn\'t parse the error code.');
                }
                if (message) {
                  isRawMessage = true;
                } else {
                  message = cd.sParse('error-abusefilter', error.abusefilter.description);
                }
                break;
              }

              case 'editconflict': {
                message = cd.sParse('error-editconflict');
                break;
              }

              case 'blocked': {
                message = cd.sParse('error-blocked');
                break;
              }

              case 'missingtitle': {
                message = cd.sParse('error-pagedeleted');
                break;
              }

              default: {
                message = (
                  cd.sParse('error-pagenotedited') +
                  ' ' +
                  (await generateUnknownApiErrorText(code, error.info))
                );
              }
            }

            logMessage = [code, apiData];
          } else {
            logMessage = apiData;
          }

          throw new CdError({
            type: 'api',
            code: 'error',
            apiData: resp,
            details: { code, message, isRawMessage, logMessage },
          });
        }
      } else {
        throw e;
      }
    }

    this.pageId = resp.edit.pageid;

    return resp.edit.newtimestamp || 'nochange';
  }

  /**
   * Enrich the page instance with the properties regarding whether new topics go on top on this
   * page (based on the various factors) and, if new topics are on top, the start index of the first
   * section.
   *
   * @throws {CdError}
   */
  analyzeNewTopicPlacement() {
    if (this.code === undefined) {
      throw new CdError('Can\'t analyze the new topics placement: Page#code is undefined.');
    }

    let areNewTopicsOnTop = cd.config.areNewTopicsOnTop?.(this.name, this.code);

    const adjustedCode = hideDistractingCode(this.code);
    const sectionHeadingRegexp = /^==[^=].*?==[ \t\x01\x02]*\n/gm;
    let firstSectionStartIndex;
    let sectionHeadingMatch;

    // Search for the first section's index. If areNewTopicsOnTop is false, we don't need it.
    if (areNewTopicsOnTop !== false) {
      sectionHeadingMatch = sectionHeadingRegexp.exec(adjustedCode);
      firstSectionStartIndex = sectionHeadingMatch?.index;
      sectionHeadingRegexp.lastIndex = 0;
    }

    if (areNewTopicsOnTop === undefined) {
      // Detect the topic order: newest first or newest last.
      let previousDate;
      let difference = 0;
      while ((sectionHeadingMatch = sectionHeadingRegexp.exec(adjustedCode))) {
        const timestamp = findFirstTimestamp(this.code.slice(sectionHeadingMatch.index));
        const { date } = timestamp && parseTimestamp(timestamp) || {};
        if (date) {
          if (previousDate) {
            difference += date > previousDate ? -1 : 1;
          }
          previousDate = date;
        }
      }
      areNewTopicsOnTop = difference === 0 ? this.namespaceId % 2 === 0 : difference > 0;
    }

    /**
     * Whether new topics go on top on this page. Filled upon running
     * {@link module:Page#analyzeNewTopicPlacement}.
     *
     * @name areNewTopicsOnTop
     * @type {boolean|undefined}
     * @instance
     */

    /**
     * The start index of the first section, if new topics are on top on this page. Filled upon
     * running {@link module:Page#analyzeNewTopicPlacement}.
     *
     * @name firstSectionStartIndex
     * @type {number|undefined}
     * @instance
     */
    Object.assign(this, { areNewTopicsOnTop, firstSectionStartIndex });
  }

  /**
   * {@link https://www.mediawiki.org/wiki/Manual:Purge Purge cache} of the page.
   */
  async purge() {
    await cd.g.api.post({
      action: 'purge',
      titles: this.name,
    }).catch(() => {
      mw.notify(cd.s('error-purgecache'), { type: 'error' });
    });
  }

  /**
   * Mark the page as read, optionally setting the revision to mark as read.
   *
   * @param {number} revisionId Revision to mark as read (setting all newer revisions unread).
   */
  async markAsRead(revisionId) {
    await cd.g.api.postWithEditToken({
      action: 'setnotificationtimestamp',
      titles: this.name,
      newerthanrevid: revisionId,
      formatversion: 2,
    });
  }
}
