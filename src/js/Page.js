/**
 * Page class.
 *
 * @module Page
 */

import CdError from './CdError';
import cd from './cd';
import { findFirstTimestamp, hideDistractingCode } from './wikitext';
import { handleApiReject, isProbablyTalkPage } from './util';
import { makeRequestNoTimers, parseCode, unknownApiErrorText } from './apiWrappers';
import { parseTimestamp } from './timestamp';

/**
 * Class representing a page. It contains a few properties and methods compared to {@link
 * module:Comment Comment} and {@link module:Section Section}.
 *
 * @module Page
 */
export default class Page {
  /**
   * Create a page instance.
   *
   * @param {string|mw.Title} nameOrMwTitle
   * @throws {CdError}
   */
  constructor(nameOrMwTitle) {
    const title = nameOrMwTitle instanceof mw.Title ?
      nameOrMwTitle :
      mw.Title.newFromText(nameOrMwTitle);

    if (!title) {
      throw new CdError();
    }

    /**
     * Page title, with no namespace name. The word separator is a space, not an underline.
     *
     * @type {number}
     */
    this.title = title.getMainText();

    /**
     * Page name, with a namespace name. The word separator is a space, not an underline.
     *
     * @type {number}
     */
    this.name = title.getPrefixedText();

    /**
     * Namespace number.
     *
     * @type {number}
     */
    this.namespace = title.getNamespaceId();
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
    return isProbablyTalkPage(this.realName || this.name, this.namespace);
  }

  /**
   * Whether the page is an archive page. Relies on {@link module:defaultConfig.archivePaths} and/or
   * elements with the class `cd-archivingInfo` and attribute `data-is-archive-page`.
   *
   * @returns {boolean}
   */
  isArchivePage() {
    if (this.cachedIsArchivePage !== undefined) {
      return this.cachedIsArchivePage;
    }
    let result = $('.cd-archivingInfo').data('isArchivePage');
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
    this.cachedIsArchivePage = Boolean(result);
    return result;
  }

  /**
   * Whether this page can have archives. If the page is an archive page, returns `false`. Relies on
   * {@link module:defaultConfig.pagesWithoutArchives} and {@link module:defaultConfig.archivePaths}
   * and/or elements with the class `cd-archivingInfo` and attribute `data-can-have-archives`.
   *
   * @returns {?boolean}
   */
  canHaveArchives() {
    if (this.isArchivePage()) {
      return false;
    }
    let result = $('.cd-archivingInfo').data('canHaveArchives');
    if (result === undefined) {
      const name = this.realName || this.name;
      result = !cd.g.PAGES_WITHOUT_ARCHIVES_REGEXP?.test(name);
    }
    return Boolean(result);
  }

  /**
   * Get the archive prefix for the page. If no prefix is found based on {@link
   * module:defaultConfig.archivePaths} and/or elements with the class `cd-archivingInfo` and
   * attribute `data-archive-prefix`, returns the current page's name. If the page is an archive
   * page or can't have archives, returns `null`.
   *
   * @returns {?string}
   */
  getArchivePrefix() {
    if (!this.canHaveArchives()) {
      return null;
    }
    let result = $('.cd-archivingInfo').data('archivePrefix');
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
    return String(result || name);
  }

  /**
   * Get the source page for the page (i.e., the page from which the archiving is happening).
   * Returns the page itself if it is not an archive page. Relies on {@link
   * module:defaultConfig.archivePaths} and/or elements with the class `cd-archivingInfo` and
   * attribute `data-source-page`.
   *
   * @returns {Page}
   */
  getArchivedPage() {
    let result = $('.cd-archivingInfo').data('sourcePage');
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
   * @throws {CdError}
   */
  async getCode() {
    // The page doesn't exist.
    if (!mw.config.get('wgArticleId')) {
      Object.assign(this, { code: '' });
      return;
    }

    const resp = await cd.g.api.post({
      action: 'query',
      titles: this.name,
      prop: 'revisions',
      rvslots: 'main',
      rvprop: ['ids', 'content'],
      redirects: true,
      curtimestamp: true,
      formatversion: 2,
    }).catch(handleApiReject);

    const query = resp.query;
    const page = query?.pages?.[0];
    const revision = page?.revisions?.[0];
    const content = revision?.slots?.main?.content;

    if (!query || !page || !revision || content === undefined) {
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

    const redirectTarget = query.redirects?.[0]?.to || null;

    /**
     * Page ID on the wiki. Filled upon running {@link module:Page#getCode} or {@link
     * module:Page#edit}. In the latter case, it is useful for newly created pages.
     *
     * @name pageId
     * @type {number|undefined}
     * @instance module:Page
     */

    /**
     * Page code. Filled upon running {@link module:Page#getCode}.
     *
     * @name code
     * @type {string|undefined}
     * @instance module:Page
     */

    /**
     * ID of the revision that has {@link module:Page#code}. Filled upon running {@link
     * module:Page#getCode}.
     *
     * @name revisionId
     * @type {string|undefined}
     * @instance module:Page
     */

    /**
     * Page where {@link module:Page#name} redirects. Filled upon running {@link
     * module:Page#getCode}.
     *
     * @name redirectTarget
     * @type {?(string|undefined)}
     * @instance module:Page
     */

    /**
     * If {@link module:Page#name} redirects to some other page, the value is that page. If not, the
     * value is the same as {@link module:Page#name}. Filled upon running {@link
     * module:Page#getCode}.
     *
     * @name realName
     * @type {string|undefined}
     * @instance module:Page
     */

    /**
     * Time when {@link module:Page#code} was queried (as the server reports it). Filled upon
     * running {@link module:Page#getCode}.
     *
     * @name queryTimestamp
     * @type {string|undefined}
     * @instance module:Page
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
   * @param {object} [options={}]
   * @param {boolean} [options.noTimers=false] Don't use timers (they can set the process on hold in
   *   background tabs if the browser throttles them).
   * @param {boolean} [options.markAsRead=false] Mark the current page as read in the watchlist.
   * @returns {object}
   * @throws {CdError}
   */
  async parse({
    noTimers = false,
    markAsRead = false,
  } = {}) {
    const params = {
      action: 'parse',

      // If we know that this page is a redirect, use its target. Otherwise, use the regular name.
      page: this.realName || this.name,

      prop: ['text', 'revid', 'modules', 'jsconfigvars'],
      formatversion: 2,
    };
    const request = noTimers ?
      makeRequestNoTimers(params).catch(handleApiReject) :
      cd.g.api.post(params).catch(handleApiReject);

    // We make the GET request that marks the page as read at the same time with the parse request,
    // not after it, to minimize the chance that the page will get new revisions that we will
    // erroneously mark as read.
    if (markAsRead) {
      $.get(this.getUrl());
    }

    const parse = (await request).parse;
    if (parse?.text === undefined) {
      throw new CdError({
        type: 'api',
        code: 'noData',
      });
    }

    return parse;
  }

  /**
   * Modify a page code string in accordance with an action. The `'addSection'` action is presumed.
   *
   * @param {object} options
   * @param {string} options.pageCode
   * @param {CommentForm} options.commentForm
   * @returns {string}
   */
  modifyCode({ pageCode, commentForm }) {
    const { commentCode } = commentForm.commentTextToCode('submit');

    let newPageCode;
    let codeBeforeInsertion;
    if (commentForm.isNewTopicOnTop) {
      const adjustedPageCode = hideDistractingCode(pageCode);
      const firstSectionStartIndex = adjustedPageCode.search(/^(=+).*\1[ \t\x01\x02]*$/m);
      codeBeforeInsertion = pageCode.slice(0, firstSectionStartIndex);
      const codeAfterInsertion = pageCode.slice(firstSectionStartIndex);
      newPageCode = codeBeforeInsertion + commentCode + '\n' + codeAfterInsertion;
    } else {
      codeBeforeInsertion = (pageCode + '\n').trimLeft();
      newPageCode = codeBeforeInsertion + commentCode;
    }

    return { newPageCode, codeBeforeInsertion, commentCode };
  }

  /**
   * Make an edit API request ({@link https://www.mediawiki.org/wiki/API:Edit}).
   *
   * @param {object} options
   * @returns {number|undefined} editTimestamp
   */
  async edit(options) {
    let resp;
    try {
      resp = await cd.g.api.postWithEditToken(cd.g.api.assertCurrentUser(Object.assign(options, {
        // If we know that this page is a redirect, use its target. Otherwise, use the regular name.
        title: this.realName || this.name,

        action: 'edit',
        formatversion: 2,
      }))).catch(handleApiReject);
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
                  (await unknownApiErrorText(code, error.info))
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

    return resp.edit.newtimestamp;
  }

  /**
   * Enrich the page instance with the properties regarding whether new topics go on top on this
   * page (based on the various factors) and, if new topics are on top, the start index of the first
   * section.
   *
   * @throws {CdError}
   */
  inferNewTopicPlacement() {
    if (this.code === undefined) {
      throw new CdError('Can\'t infer if new topics are on top: Page#code is undefined.');
    }

    let areNewTopicsOnTop;
    if (cd.config.areNewTopicsOnTop) {
      areNewTopicsOnTop = cd.config.areNewTopicsOnTop(this.name, this.code);
    }

    const adjustedCode = hideDistractingCode(this.code);
    const sectionHeadingRegexp = /^==[^=].*?==[ \t\x01\x02]*\n/gm;
    let firstSectionStartIndex;
    let sectionHeadingMatch;

    // Search for the first section's index. If areNewTopicsOnTop is true, we don't need it.
    if (areNewTopicsOnTop !== false) {
      sectionHeadingMatch = sectionHeadingRegexp.exec(adjustedCode);
      firstSectionStartIndex = sectionHeadingMatch?.index;
      sectionHeadingRegexp.lastIndex = 0;
    }

    if (areNewTopicsOnTop === undefined) {
      // Detect the topic order: newest first or newest last.
      cd.debug.startTimer('areNewTopicsOnTop');
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
      areNewTopicsOnTop = difference === 0 ? this.namespace % 2 === 0 : difference > 0;
      cd.debug.logAndResetTimer('areNewTopicsOnTop');
    }

    /**
     * Whether new topics go on top on this page. Filled upon running {@link
     * module:Page#inferNewTopicPlacement}.
     *
     * @name areNewTopicsOnTop
     * @type {boolean|undefined}
     * @instance module:Page
     */

    /**
     * The start index of the first section, if new topics are on top on this page. Filled upon
     * running {@link module:Page#inferNewTopicPlacement}.
     *
     * @name firstSectionStartIndex
     * @type {number|undefined}
     * @instance module:Page
     */
    Object.assign(this, { areNewTopicsOnTop, firstSectionStartIndex });
  }
}
