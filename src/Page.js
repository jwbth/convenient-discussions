/**
 * @typedef {object} ApiResponseEdit
 * @property {object} edit
 * @property {string} edit.result
 * @property {number} edit.pageid
 * @property {string} edit.title
 * @property {string} edit.contentmodel
 * @property {number} [edit.oldrevid]
 * @property {number} [edit.newrevid]
 * @property {string} [edit.newtimestamp]
 * @property {boolean} [edit.nochange]
 * @property {object} [edit.captcha]
 */

/**
 * @typedef {object} PagesMap
 * @property {Map<RegExp, string>} source
 * @property {Map<RegExp, string>} archive
 */

/**
 * @typedef {{[key: string]: string}} StringsByKey
 */

import cd from './cd';

/**
 * Class representing a wiki page (a page for which the
 * {@link https://www.mediawiki.org/wiki/Manual:Interface/JavaScript#All_pages_(user/page-specific) wgIsArticle}
 * config value is `true`) in both of its facets – a rendered instance (for the current page) and an
 * entry in the database with data and content.
 *
 * To create an instance, use {@link module:pageRegistry.get} (the constructor is only exported for
 * means of code completion).
 */
class Page {
  /** @readonly */
  TYPE = 'page';

  /**
   * Used for polymorphism with Comment.
   */
  isOpeningSection = null;

  /**
   * Page ID on the wiki. Filled upon running {@link Page#loadCode} or {@link Page#edit}. In the
   * latter case, it is useful for newly created pages.
   *
   * @type {number|undefined}
   */
  pageId;

  /**
   * Page's source code (wikitext), ending with `\n`. Filled upon running {@link Page#loadCode}.
   *
   * @type {string|undefined}
   */
  code;

  /**
   * ID of the revision that has {@link Page#code}. Filled upon running {@link Page#loadCode}.
   *
   * @type {number|undefined}
   */
  revisionId;

  /**
   * Create a page instance.
   *
   * @param {mw.Title} mwTitle
   * @param {string} [genderedName]
   * @throws {CdError} If the string in the first parameter is not a valid title.
   */
  constructor(mwTitle, genderedName) {
    // TODO: remove after uses by foreign scripts are replaced.
    if (!(mwTitle instanceof mw.Title)) {
      mwTitle = new mw.Title(mwTitle);
    }

    /**
     * Page's {@link mw.Title mw.Title} object.
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
     * {@link SectionSource}; the source code is in {@link Page#code}.
     *
     * @type {PageSource}
     */
    this.source = new PageSource();

    /**
     * Is the page actionable, i.e. you can add a section to it. Can be `true` only for the current
     * page.
     *
     * @type {boolean}
     */
    this.isActionable = Boolean(cd.g.isTalkPage);
  }

  /**
   * Checks if the page can be commented on.
   * 
   * @returns {boolean}
   */
  isCommentable() {
    return cd.g.isTalkPage;
  }
}

/**
 * Class that keeps the methods and data related to the page's source code.
 */
export class PageSource {
  /**
   * Create a new PageSource instance.
   */
  constructor() {
    // Initialize PageSource
  }
}

export default Page;