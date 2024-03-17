/**
 * Singleton used to obtain instances of the `Page` class while avoiding creating duplicates.
 *
 * @module pageRegistry
 */

import CdError from './CdError';
import TextMasker from './TextMasker';
import cd from './cd';
import controller from './controller';
import userRegistry from './userRegistry';
import { findFirstTimestamp, maskDistractingCode } from './wikitext';
import { handleApiReject, requestInBackground } from './apiWrappers';
import { isProbablyTalkPage, mergeRegexps } from './utils';
import { parseTimestamp } from './timestamp';

let pagesWithoutArchivesRegexp;
let $archivingInfo;
let archivePagesMap;
let sourcePagesMap;

/**
 * Set some map object variables related to archive pages.
 *
 * @private
 */
function initArchivePagesMaps() {
  archivePagesMap = new Map();
  sourcePagesMap = new Map();
  const pathToRegexp = (s, replacements, isArchivePath) => (
    new RegExp(
      (new TextMasker(s))
        .mask(/\\[$\\]/g)
        .withText((pattern) => {
          pattern = mw.util.escapeRegExp(pattern);
          if (replacements) {
            pattern = pattern
              .replace(/\\\$/, '$')
              .replace(/\$(\d+)/, (s, n) => {
                const replacement = replacements[n - 1];
                return replacement ? `(${replacement.source})` : s;
              });
          }
          pattern = '^' + pattern + (isArchivePath ? '.*' : '') + '$';
          return pattern;
        })
        .unmask()
        .getText()
    )
  );
  cd.config.archivePaths.forEach((entry) => {
    if (entry instanceof RegExp) {
      sourcePagesMap.set(new RegExp(entry.source + '.*'), '');
    } else {
      archivePagesMap.set(pathToRegexp(entry.source, entry.replacements), entry.archive);
      sourcePagesMap.set(pathToRegexp(entry.archive, entry.replacements, true), entry.source);
    }
  });
}

/**
 * Lazy initialization for archive pages map.
 *
 * @returns {Map}
 * @private
 */
function getArchivePagesMap() {
  if (!archivePagesMap) {
    initArchivePagesMaps();
  }

  return archivePagesMap;
}

/**
 * Lazy initialization for source pages map.
 *
 * @returns {Map}
 * @private
 */
function getSourcePagesMap() {
  if (!sourcePagesMap) {
    initArchivePagesMaps();
  }

  return sourcePagesMap;
}

/**
 * Main MediaWiki object.
 *
 * @external mw
 * @global
 * @see https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw
 */

/**
 * @class Title
 * @memberof external:mw
 * @see https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.Title
 */

// Export for the sake of VS Code IntelliSense

/**
 * Class representing a wiki page (a page for which the
 * {@link https://www.mediawiki.org/wiki/Manual:Interface/JavaScript#All_pages_(user/page-specific) wgIsArticle}
 * config value is `true`).
 *
 * To access the constructor, use {@link module:pageRegistry.get} (it is only exported for means of
 * code completion).
 */
export class Page {
  /**
   * Create a page instance.
   *
   * @param {external:mw.Title} mwTitle
   * @param {string} [genderedName]
   * @throws {CdError} If the string in the first parameter is not a valid title.
   */
  constructor(mwTitle, genderedName) {
    // TODO: remove after outside uses are replaced.
    if (!(mwTitle instanceof mw.Title)) {
      mwTitle = new mw.Title(mwTitle);
    }

    /**
     * Page's {@link external:mw.Title mw.Title} object.
     */
    this.mwTitle = mwTitle;

    /**
     * Page name, with a namespace name, not necessarily normalized (not normalized if a gendered
     * name is available). The word separator is a space, not an underline.
     *
     * @type {string}
     */
    this.name = genderedName || mwTitle.getPrefixedText();

    /**
     * Page title, with no namespace name, normalized. The word separator is a space, not an
     * underline.
     *
     * @type {string}
     */
    this.title = mwTitle.getMainText();

    /**
     * Namespace number.
     *
     * @type {number}
     */
    this.namespaceId = mwTitle.getNamespaceId();

    /**
     * Page's source code object. This is mostly for polymorphism with {@link CommentSource} and
     * {@link SectionSource}; the source code is in {@link Page.code}.
     *
     * @type {PageSource}
     */
    this.source = new PageSource(this);
  }

  /**
   * Check is the page the one the user is visiting.
   *
   * @returns {boolean}
   * @private
   */
  isCurrent() {
    return this.name === cd.g.pageName;
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
   * Get a decoded URL with a fragment identifier.
   *
   * @param {string} fragment
   * @param {boolean} permanent Get a permanent URL.
   * @returns {string}
   */
  getDecodedUrlWithFragment(fragment, permanent) {
    let params = {};
    if (permanent) {
      params.oldid = mw.config.get('wgRevisionId');
    }
    const decodedPageUrl = decodeURI(this.getUrl(params));
    return `${cd.g.server}${decodedPageUrl}#${fragment}`;
  }

  /**
   * Find an archiving info element on the page.
   *
   * @returns {?external:jQuery}
   * @private
   */
  findArchivingInfoElement() {
    if (!this.isCurrent()) {
      return null;
    }

    // For performance reasons, this is not reevaluated after page reloads. The reevaluation is
    // unlikely make any difference.
    $archivingInfo ||= controller.$root.find('.cd-archivingInfo');

    return $archivingInfo;
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
   * Check if the page is an archive page. Relies on {@link defaultConfig.archivePaths} and/or, for
   * the current page, elements with the class `cd-archivingInfo` and attribute
   * `data-is-archive-page`.
   *
   * @returns {boolean}
   */
  isArchivePage() {
    let result = this.findArchivingInfoElement()?.data('isArchivePage');
    if (result === undefined || result === null) {
      result = false;
      const name = this.realName || this.name;
      for (const sourceRegexp of getSourcePagesMap().keys()) {
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
   * on {@link defaultConfig.pagesWithoutArchives} and {@link defaultConfig.archivePaths} and/or,
   * for the current page, elements with the class `cd-archivingInfo` and attribute
   * `data-can-have-archives`.
   *
   * @returns {?boolean}
   */
  canHaveArchives() {
    if (this.isArchivePage()) {
      return false;
    }
    let result = this.findArchivingInfoElement()?.data('canHaveArchives');
    if (result === undefined || result === null) {
      const name = this.realName || this.name;
      if (pagesWithoutArchivesRegexp === undefined) {
        pagesWithoutArchivesRegexp = mergeRegexps(cd.config.pagesWithoutArchives);
      }
      result = !pagesWithoutArchivesRegexp?.test(name);
    }
    return Boolean(result);
  }

  /**
   * Get the archive prefix for the page. If no prefix is found based on
   * {@link defaultConfig.archivePaths} and/or, for the current page, elements with the class
   * `cd-archivingInfo` and attribute `data-archive-prefix`, returns the current page's name. If the
   * page is an archive page or can't have archives, returns `null`.
   *
   * @returns {?string}
   */
  getArchivePrefix() {
    if (!this.canHaveArchives()) {
      return null;
    }
    let result = this.findArchivingInfoElement()?.data('archivePrefix');
    const name = this.realName || this.name;
    if (!result) {
      for (const [sourceRegexp, replacement] of getArchivePagesMap().entries()) {
        if (sourceRegexp.test(name)) {
          result = name.replace(sourceRegexp, replacement);
          break;
        }
      }
    }
    return result ? String(result) : name + '/';
  }

  /**
   * Get the source page for the page (i.e., the page from which archiving is happening). Returns
   * the page itself if it is not an archive page. Relies on {@link defaultConfig.archivePaths}
   * and/or, for the current page, elements with the class `cd-archivingInfo` and attribute
   * `data-archived-page`.
   *
   * @returns {import('./pageRegistry').Page}
   */
  getArchivedPage() {
    let result = this.findArchivingInfoElement()?.data('archivedPage');
    if (!result) {
      const name = this.realName || this.name;
      for (const [archiveRegexp, replacement] of getSourcePagesMap().entries()) {
        if (archiveRegexp.test(name)) {
          result = name.replace(archiveRegexp, replacement);
          break;
        }
      }
    }
    return result ? pageRegistry.get(String(result)) : this;
  }

  /**
   * Make a revision request (see {@link https://www.mediawiki.org/wiki/API:Revisions}) to load the
   * wikitext of the page, together with a few revision properties: the timestamp, redirect target,
   * and query timestamp (curtimestamp). Enrich the page instance with those properties. Also set
   * the `realName` property that indicates either the redirect target if it's present or the page
   * name.
   *
   * @param {boolean} [tolerateMissing=true] Assign `''` to the `code` property if the page is
   *   missing instead of throwing an error.
   *
   * @throws {CdError}
   */
  async loadCode(tolerateMissing = true) {
    const resp = await controller.getApi().post({
      action: 'query',
      titles: this.name,
      prop: 'revisions',
      rvslots: 'main',
      rvprop: ['ids', 'content'],
      redirects: !(this.isCurrent() && mw.config.get('wgIsRedirect')),
      curtimestamp: true,
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
      Object.assign(this, {
        code: '',
        revisionId: undefined,
        redirectTarget: undefined,
        realName: this.name,
        queryTimestamp: resp.curtimestamp,
      });

      if (tolerateMissing) {
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
     * Page ID on the wiki. Filled upon running {@link Page#loadCode} or {@link Page#edit}. In the
     * latter case, it is useful for newly created pages.
     *
     * @name pageId
     * @type {number|undefined}
     * @memberof Page
     * @instance
     */

    /**
     * Page code. Filled upon running {@link Page#loadCode}.
     *
     * @name code
     * @type {string|undefined}
     * @memberof Page
     * @instance
     */

    /**
     * ID of the revision that has {@link Page#code}. Filled upon running {@link Page#loadCode}.
     *
     * @name revisionId
     * @type {number|undefined}
     * @memberof Page
     * @instance
     */

    /**
     * Page where {@link Page#name} redirects. Filled upon running {@link Page#loadCode}.
     *
     * @name redirectTarget
     * @type {?(string|undefined)}
     * @memberof Page
     * @instance
     */

    /**
     * If {@link Page#name} redirects to some other page, the value is that page. If not, the value
     * is the same as {@link Page#name}. Filled upon running {@link Page#loadCode}.
     *
     * @name realName
     * @type {string|undefined}
     * @memberof Page
     * @instance
     */

    /**
     * Time when {@link Page#code} was queried (as the server reports it). Filled upon running
     * {@link Page#loadCode}.
     *
     * @name queryTimestamp
     * @type {string|undefined}
     * @memberof Page
     * @instance
     */

    Object.assign(this, {
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
   * @param {boolean} [inBackground=false] Make a request that won't set the process on hold when
   *   the tab is in the background.
   * @param {boolean} [markAsRead=false] Mark the current page as read in the watchlist.
   * @returns {Promise.<object>}
   * @throws {CdError}
   */
  async parse(customOptions, inBackground = false, markAsRead = false) {
    const defaultOptions = {
      action: 'parse',

      // If we know that this page is a redirect, use its target. Otherwise, use the regular name.
      page: this.realName || this.name,

      disabletoc: cd.g.skin === 'vector-2022',
      useskin: cd.g.skin,
      redirects: true,
      prop: ['text', 'revid', 'modules', 'jsconfigvars', 'sections'],

      ...cd.g.apiErrorFormatHtml,
    };
    const options = Object.assign({}, defaultOptions, customOptions);

    // `page` and `oldid` can not be used together.
    if (customOptions?.oldid) {
      delete options.page;
    }

    const { parse } = await (
      inBackground ?
        requestInBackground(options) :
        controller.getApi().post(options)
    ).catch(handleApiReject);
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
   * Get a list of revisions of the page (the `redirects` parameter is set to `true` by default).
   *
   * @param {object} [customOptions={}]
   * @param {boolean} [inBackground=false] Make a request that won't set the process on hold when
   *   the tab is in the background.
   * @returns {Promise.<Array>}
   */
  async getRevisions(customOptions = {}, inBackground = false) {
    const options = Object.assign({}, {
      action: 'query',
      titles: this.name,
      rvslots: 'main',
      prop: 'revisions',
      redirects: !(this.isCurrent() && mw.config.get('wgIsRedirect')),
    }, customOptions);

    const revisions = (
      await (
        inBackground ?
          requestInBackground(options) :
          controller.getApi().post(options)
      ).catch(handleApiReject)
    ).query?.pages?.[0]?.revisions;
    if (!revisions) {
      throw new CdError({
        type: 'api',
        code: 'noData',
      });
    }

    return revisions;
  }

  /**
   * Make an edit API request ({@link https://www.mediawiki.org/wiki/API:Edit}).
   *
   * @param {object} customOptions See {@link https://www.mediawiki.org/wiki/API:Edit}. At least
   *   `text` should be set. `summary` is recommended. `baserevid` and `starttimestamp` are needed
   *   to avoid edit conflicts. `baserevid` can be taken from {@link Page#revisionId};
   *   `starttimestamp` can be taken from {@link Page#queryTimestamp}.
   * @returns {Promise.<string>} Timestamp of the edit in the ISO format or `'nochange'` if nothing
   *   has changed.
   */
  async edit(customOptions) {
    const options = controller.getApi().assertCurrentUser(
      Object.assign({}, {
        action: 'edit',

        // If we know that this page is a redirect, use its target. Otherwise, use the regular name.
        title: this.realName || this.name,

        notminor: !customOptions.minor,

        // Should be `undefined` instead of `null`, otherwise will be interepreted as a string.
        tags: userRegistry.getCurrent().isRegistered() && cd.config.tagName || undefined,

        ...cd.g.apiErrorFormatHtml,
      }, customOptions)
    );

    let resp;
    try {
      resp = await controller.getApi().postWithEditToken(options, {
        // Beneficial when sending long unicode texts, which is what we do here.
        contentType: 'multipart/form-data',
      }).catch(handleApiReject);
    } catch (e) {
      if (e instanceof CdError) {
        const { type, apiResp } = e.data;
        if (type === 'network') {
          throw e;
        } else {
          const error = apiResp?.errors[0];
          let message;
          let isRawMessage = false;
          let logMessage;
          let code;
          if (error) {
            code = error.code;
            switch (code) {
              case 'editconflict': {
                message = cd.sParse('error-editconflict');
                break;
              }

              case 'missingtitle': {
                message = cd.sParse('error-pagedeleted');
                break;
              }

              default: {
                message = error.html;
                isRawMessage = message.includes('<table') || message.includes('<div');
              }
            }

            logMessage = [code, apiResp];
          } else {
            logMessage = apiResp;
          }

          throw new CdError({
            type: 'api',
            code: 'error',
            apiResp: resp,
            details: { code, message, isRawMessage, logMessage },
          });
        }
      } else {
        throw e;
      }
    }

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

    let areNewTopicsOnTop = cd.config.areNewTopicsOnTop?.(this.name, this.code) || null;

    const adjustedCode = maskDistractingCode(this.code);
    const sectionHeadingRegexp = /^==[^=].*?==[ \t\x01\x02]*\n/gm;
    let firstSectionStartIndex;
    let sectionHeadingMatch;

    // Search for the first section's index. If areNewTopicsOnTop is false, we don't need it.
    if (areNewTopicsOnTop !== false) {
      sectionHeadingMatch = sectionHeadingRegexp.exec(adjustedCode);
      firstSectionStartIndex = sectionHeadingMatch?.index;
      sectionHeadingRegexp.lastIndex = 0;
    }

    if (areNewTopicsOnTop === null) {
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
     * {@link Page#analyzeNewTopicPlacement}.
     *
     * @name areNewTopicsOnTop
     * @type {boolean|undefined}
     * @memberof Page
     * @instance
     */

    /**
     * The start index of the first section, if new topics are on top on this page. Filled upon
     * running {@link Page#analyzeNewTopicPlacement}.
     *
     * @name firstSectionStartIndex
     * @type {number|undefined}
     * @memberof Page
     * @instance
     */
    Object.assign(this, { areNewTopicsOnTop, firstSectionStartIndex });
  }

  /**
   * {@link https://www.mediawiki.org/wiki/Manual:Purge Purge cache} of the page.
   */
  async purge() {
    await controller.getApi().post({
      action: 'purge',
      titles: this.name,
    }).catch(() => {
      mw.notify(cd.s('error-purgecache'), { type: 'warn' });
    });
  }

  /**
   * Mark the page as read, optionally setting the revision to mark as read.
   *
   * @param {number} revisionId Revision to mark as read (setting all newer revisions unread).
   */
  async markAsRead(revisionId) {
    await controller.getApi().postWithEditToken({
      action: 'setnotificationtimestamp',
      titles: this.name,
      newerthanrevid: revisionId,
    });
  }

  /**
   * Used for polymorphism with {@link Comment#getRelevantSection} and
   * {@link Section#getRelevantSection}.
   *
   * @returns {null}
   */
  getRelevantSection() {
    return null;
  }

  /**
   * Used for polymorphism with {@link Comment#getRelevantComment} and
   * {@link Section#getRelevantComment}.
   *
   * @returns {null}
   */
  getRelevantComment() {
    return null;
  }

  /**
   * Used for polymorphism with {@link Comment#getIdentifyingData} and
   * {@link Section#getIdentifyingData}.
   *
   * @returns {null}
   */
  getIdentifyingData() {
    return null;
  }
}

/**
 * Class that keeps the methods and data related to the page's source code.
 */
class PageSource {
  /**
   * Create a comment's source object.
   *
   * @param {Page} page Page.
   */
  constructor(page) {
    this.page = page;
  }

  /**
   * Modify a page code string in accordance with an action. The `'addSection'` action is presumed.
   *
   * @param {object} options
   * @param {string} options.commentCode Comment code, including trailing newlines and the
   *   signature.
   * @param {import('./CommentForm').default} options.commentForm Comment form that has the code.
   * @returns {object}
   */
  modifyContext({ commentCode, commentForm }) {
    const originalContextCode = this.page.code;
    let contextCode;
    if (commentForm.isNewTopicOnTop()) {
      const firstSectionStartIndex = maskDistractingCode(originalContextCode)
        .search(/^(=+).*\1[ \t\x01\x02]*$/m);
      contextCode = (
        (
          firstSectionStartIndex === -1 ?
            (originalContextCode ? originalContextCode + '\n' : '') :
            originalContextCode.slice(0, firstSectionStartIndex)
        ) +
        commentCode +
        '\n' +
        originalContextCode.slice(firstSectionStartIndex)
      );
    } else {
      contextCode = (
        (
          commentForm.isNewSectionApi() ?
            '' :
            (originalContextCode + '\n').trimLeft()
        ) +
        commentCode
      );
    }

    return { contextCode, commentCode };
  }
}

/**
 * @exports pageRegistry
 */
const pageRegistry = {
  /**
   * Collection of pages.
   *
   * @type {object}
   * @private
   */
  items: {},

  /**
   * Get a page object for a page with the specified name (either a new one or already existing).
   *
   * @param {string|external:mw.Title} nameOrMwTitle
   * @param {boolean} [isGendered=true] Used to keep the gendered namespace name (if `nameOrMwTitle`
   *   is a string).
   * @returns {Page}
   */
  get(nameOrMwTitle, isGendered) {
    const title = nameOrMwTitle instanceof mw.Title ?
      nameOrMwTitle :
      new mw.Title(nameOrMwTitle);
    const name = title.getPrefixedText();
    if (!this.items[name]) {
      this.items[name] = new Page(title, isGendered ? nameOrMwTitle : undefined);
    } else if (isGendered) {
      this.items[name].name = nameOrMwTitle;
    }

    return this.items[name];
  },

  /**
   * Get the page the user is visiting.
   *
   * @returns {Page}
   */
  getCurrent() {
    return this.get(cd.g.pageName, true);
  },
};

export default pageRegistry;
