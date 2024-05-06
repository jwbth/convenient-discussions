/**
 * Singleton used to obtain instances of the {@link Page} class while avoiding creating duplicates.
 *
 * @module pageRegistry
 */

import CdError from './CdError';
import CommentForm from './CommentForm';
import TextMasker from './TextMasker';
import cd from './cd';
import commentFormRegistry from './commentFormRegistry';
import commentRegistry from './commentRegistry';
import controller from './controller';
import sectionRegistry from './sectionRegistry';
import { handleApiReject, requestInBackground } from './utils-api';
import { areObjectsEqual, isProbablyTalkPage, mergeRegexps } from './utils-general';
import { parseTimestamp } from './utils-timestamp';
import { findFirstTimestamp, maskDistractingCode } from './utils-wikitext';

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

// Export for the sake of VS Code IntelliSense. FIXME: make the class of the current page extend the
// page's class? The current page has more methods effectively.

/**
 * Class representing a wiki page (a page for which the
 * {@link https://www.mediawiki.org/wiki/Manual:Interface/JavaScript#All_pages_(user/page-specific) wgIsArticle}
 * config value is `true`) in both of its facets – a rendered instance (for the current page) and
 * an entry in the database with data and content.
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
     * {@link SectionSource}; the source code is in {@link Page#code}.
     *
     * @type {PageSource}
     */
    this.source = new PageSource(this);

    /**
     * Is the page actionable, i.e. you can add a section to it. Can be `true` only for the current
     * page.
     *
     * @type {boolean}
     */
    this.isActionable = this.isCurrent() ? this.isCommentable() : false;
  }

  /**
   * Check whether the page is the one the user is visiting.
   *
   * @returns {boolean}
   * @private
   */
  isCurrent() {
    return this.name === cd.g.pageName;
  }

  /**
   * Check whether the page is the user's own talk page.
   *
   * @returns {boolean}
   */
  isOwnTalkPage() {
    return mw.config.get('wgNamespaceNumber') === 3 && this.title === cd.user.getName();
  }

  /**
   * Check whether the current page is eligible for submitting comments to.
   *
   * @returns {?boolean}
   */
  isCommentable() {
    if (!this.isCurrent()) {
      return null;
    }

    return controller.isTalkPage() && (this.isActive() || !this.exists());
  }

  /**
   * Check whether the current page exists (is not 404).
   *
   * @returns {boolean}
   */
  exists() {
    if (!this.isCurrent()) {
      return null;
    }

    return Boolean(mw.config.get('wgArticleId'));
  }

  /**
   * Check whether the current page is an active talk page: existing, the current revision, not an
   * archive page.
   *
   * This value isn't static:
   *   1. A 404 page doesn't have an ID and is considered inactive, but if the user adds a topic to
   *      it, it will become active and get an ID.
   *   2. The user may switch to another revision using RevisionSlider.
   *   3. On a really rare occasion, an active page may become inactive if it becomes identified as
   *      an archive page. This possibility is currently switched off.
   *
   * @returns {?boolean}
   */
  isActive() {
    if (!this.isCurrent()) {
      return null;
    }

    return (
      controller.isTalkPage() &&
      this.exists() &&
      controller.isCurrentRevision() &&
      !this.isArchivePage()
    );
  }

  /**
   * Check whether the current page is an archive and the displayed revision the current one.
   *
   * @returns {boolean}
   */
  isCurrentArchive() {
    return controller.isCurrentRevision() && this.isArchivePage();
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
    const decodedPageUrl = decodeURI(
      this.getUrl({
        ...(permanent ? { oldid: mw.config.get('wgRevisionId') } : {})
      })
    );
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

    // This is not reevaluated after page reloads. Since archive settings we need rarely change, the
    // reevaluation is unlikely to make any difference. `$root?` because the `$root` can not be set
    // when it runs from the `addCommentLinks` module.
    this.$archivingInfo ||= controller.$root?.find('.cd-archivingInfo');

    return this.$archivingInfo;
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
    let result = this.findArchivingInfoElement()?.data('isArchivePage');
    if (result === undefined || result === null) {
      result = false;
      const name = this.realName || this.name;
      for (const sourceRegexp of this.constructor.getSourcePagesMap().keys()) {
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
    let result = this.findArchivingInfoElement()?.data('canHaveArchives');
    if (result === undefined || result === null) {
      result = !mergeRegexps(cd.config.pagesWithoutArchives)?.test(this.realName || this.name);
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

    let result = this.findArchivingInfoElement()?.data('archivePrefix');
    const name = this.realName || this.name;
    if (!result) {
      for (const [sourceRegexp, replacement] of this.constructor.getArchivePagesMap().entries()) {
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
   * the page itself if it is not an archive page. Relies on
   * {@link module:defaultConfig.archivePaths} and/or, for the current page, elements with the class
   * `cd-archivingInfo` and attribute `data-archived-page`.
   *
   * @returns {Page}
   */
  getArchivedPage() {
    let result = this.findArchivingInfoElement()?.data('archivedPage');
    if (!result) {
      const name = this.realName || this.name;
      for (const [archiveRegexp, replacement] of this.constructor.getSourcePagesMap().entries()) {
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
   * and query timestamp (`curtimestamp`). Enrich the page instance with those properties. Also set
   * the `realName` property that indicates either the redirect target if it's present or the page
   * name.
   *
   * @param {boolean} [tolerateMissing=true] Assign `''` to the `code` property if the page is
   *   missing instead of throwing an error.
   *
   * @throws {CdError}
   */
  async loadCode(tolerateMissing = true) {
    const { query, curtimestamp: queryTimestamp } = await controller.getApi().post({
      action: 'query',
      titles: this.name,
      prop: 'revisions',
      rvslots: 'main',
      rvprop: ['ids', 'content'],
      redirects: !(this.isCurrent() && mw.config.get('wgIsRedirect')),
      curtimestamp: true,
    }).catch(handleApiReject);

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
        queryTimestamp,
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
     * @memberof module:pageRegistry.Page
     * @instance
     */

    /**
     * Page's source code (wikitext), ending with `\n`. Filled upon running {@link Page#loadCode}.
     *
     * @name code
     * @type {string|undefined}
     * @memberof module:pageRegistry.Page
     * @instance
     */

    /**
     * ID of the revision that has {@link Page#code}. Filled upon running {@link Page#loadCode}.
     *
     * @name revisionId
     * @type {number|undefined}
     * @memberof module:pageRegistry.Page
     * @instance
     */

    /**
     * Page where {@link Page#name} redirects. Filled upon running {@link Page#loadCode}.
     *
     * @name redirectTarget
     * @type {?(string|undefined)}
     * @memberof module:pageRegistry.Page
     * @instance
     */

    /**
     * If {@link Page#name} redirects to some other page, the value is that page. If not, the value
     * is the same as {@link Page#name}. Filled upon running {@link Page#loadCode}.
     *
     * @name realName
     * @type {string|undefined}
     * @memberof module:pageRegistry.Page
     * @instance
     */

    /**
     * Time when {@link Page#code} was queried (as the server reports it). Filled upon running
     * {@link Page#loadCode}.
     *
     * @name queryTimestamp
     * @type {string|undefined}
     * @memberof module:pageRegistry.Page
     * @instance
     */

    Object.assign(this, {
      // It's more convenient to unify regexps to have \n as the last character of anything, not
      // (?:\n|$), and it doesn't seem to affect anything substantially.
      code: content + '\n',

      revisionId: revision.revid,
      redirectTarget,
      realName: redirectTarget || this.name,
      queryTimestamp,
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
      prop: ['text', 'revid', 'modules', 'jsconfigvars', 'sections', 'subtitle', 'categorieshtml'],
      parsoid: cd.g.isParsoidUsed,
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
        tags: cd.user.isRegistered() && cd.config.tagName || undefined,

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

    if (resp.edit.result !== 'Success') {
      const code = resp.edit.captcha ? 'captcha' : undefined;
      throw new CdError({
        type: 'api',
        code: 'error',
        apiResp: resp,
        details: {
          code,
          isRawMessage: true,
          logMessage: [code, resp],
        },
      })
    }

    return resp.edit.newtimestamp || 'nochange';
  }

  /**
   * Enrich the page instance with the properties regarding whether new topics go on top on this
   * page (based on various factors) and, if new topics are on top, the start index of the first
   * section.
   *
   * @throws {CdError}
   */
  guessNewTopicPlacement() {
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
     * {@link Page#guessNewTopicPlacement}.
     *
     * @name areNewTopicsOnTop
     * @type {boolean|undefined}
     * @memberof module:pageRegistry.Page
     * @instance
     */

    /**
     * The start index of the first section, if new topics are on top on this page. Filled upon
     * running {@link Page#guessNewTopicPlacement}.
     *
     * @name firstSectionStartIndex
     * @type {number|undefined}
     * @memberof module:pageRegistry.Page
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
   * _For internal use._ Add an "Add topic" button to the bottom of the page if there is an "Add
   * topic" tab. (Otherwise, it may be added to a wrong place.)
   */
  addAddTopicButton() {
    if (
      !$('#ca-addsection').length ||

      // There is a special welcome text in New Topic Tool for 404 pages.
      (cd.g.isDtNewTopicToolEnabled && !this.exists())
    ) {
      return;
    }

    this.$addSectionButtonContainer = $('<div>')
      .addClass('cd-section-button-container cd-addTopicButton-container')
      .append(
        (new OO.ui.ButtonWidget({
          label: cd.s('addtopic'),
          framed: false,
          classes: ['cd-button-ooui', 'cd-section-button'],
        })).on('click', () => {
          this.addSection();
        }).$element
      )

      // If appending to `this.rootElement`, it can land on a wrong place, like on 404 pages with
      // New Topic Tool enabled.
      .insertAfter(controller.$root);
  }

  /**
   * Add an "Add section" form or not on page load depending on the URL and presence of a
   * DiscussionTools' "New topic" form.
   *
   * @param {object} dtFormData
   */
  autoAddSection(dtFormData) {
    const { searchParams } = new URL(location.href);

    // &action=edit&section=new when DT's New Topic Tool is enabled.
    if (
      searchParams.get('section') === 'new' ||
      Number(searchParams.get('cdaddtopic')) ||
      dtFormData
    ) {
      this.addSection(dtFormData);
    }
  }

  /**
   * Create an add section form if not existent.
   *
   * @param {object} [initialState]
   * @param {import('./CommentForm').default} [commentForm]
   * @param {object} [preloadConfig={@link CommentForm.getDefaultPreloadConfig CommentForm.getDefaultPreloadConfig()}]
   * @param {boolean} [newTopicOnTop=false]
   */
  addSection(
    initialState,
    commentForm,
    preloadConfig = CommentForm.getDefaultPreloadConfig(),
    newTopicOnTop = false
  ) {
    if (this.addSectionForm) {
      // Sometimes there is more than one "Add section" button on the page, and they lead to opening
      // forms with different content.
      if (!areObjectsEqual(preloadConfig, this.addSectionForm.getPreloadConfig())) {
        mw.notify(cd.s('cf-error-formconflict'), { type: 'error' });
        return;
      }

      this.addSectionForm.$element.cdScrollIntoView('center');

      // Headline input may be missing if the `nosummary` preload parameter is truthy.
      (this.addSectionForm.headlineInput || this.addSectionForm.commentInput).cdFocus();
    } else {
      /**
       * "Add section" form.
       *
       * @type {CommentForm|undefined}
       */
      this.addSectionForm = commentFormRegistry.setupCommentForm(this, {
        mode: 'addSection',
        preloadConfig,
        newTopicOnTop,
      }, initialState, commentForm);

      this.$addSectionButtonContainer?.hide();
      if (!this.exists()) {
        controller.$content.children('.noarticletext, .warningbox').hide();
      }
      $('#ca-addsection').addClass('selected');
      $('#ca-view').removeClass('selected');
      this.addSectionForm.on('unregister', () => {
        $('#ca-addsection').removeClass('selected');
        $('#ca-view').addClass('selected');
      });
    }
  }

  /**
   * Add a comment form targeted at this page to the page.
   *
   * @param {string} mode
   * @param {import('./CommentForm').default} commentForm
   */
  addCommentFormToPage(mode, commentForm) {
    if (commentForm.isNewTopicOnTop() && sectionRegistry.getByIndex(0)) {
      sectionRegistry.getByIndex(0).$heading.before(commentForm.$element);
    } else {
      controller.$root.after(commentForm.$element);
    }
  }

  /**
   * Remove a comment form targeted at this page from the page.
   */
  removeCommentFormFromPage() {
    if (!this.exists()) {
      controller.$content
        // In case DT's new topic tool is enabled. This is responsible for correct styles being set.
        .removeClass('ext-discussiontools-init-replylink-open')

        .children('.noarticletext, .warningbox')
        .show();
    }

    this.$addSectionButtonContainer?.show();
  }

  /**
   * Get the name of the page's method creating a comment form with the specified mode. Used for
   * polymorphism with {@link Section}.
   *
   * @param {string} mode
   * @returns {string}
   */
  getCommentFormMethodName(mode) {
    return mode;
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

  /**
   * If a new section is added to the page, get the comment that will end up directly above the
   * section.
   *
   * @param {import('./CommentForm').default} commentForm
   * @returns {?import('./Comment').default}
   */
  getCommentAboveReply(commentForm) {
    return commentForm.isNewTopicOnTop() ? null : commentRegistry.getByIndex(-1);
  }

  /**
   * Used for polymorphism with {@link Comment} and {@link Section}.
   *
   * @returns {Page}
   */
  findNewSelf() {
    return this;
  }

  /**
   * Set some map object variables related to archive pages.
   *
   * @private
   */
  static initArchivePagesMaps() {
    this.archivePagesMap = new Map();
    this.sourcePagesMap = new Map();
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
        this.sourcePagesMap.set(new RegExp(entry.source + '.*'), '');
      } else {
        this.archivePagesMap.set(pathToRegexp(entry.source, entry.replacements), entry.archive);
        this.sourcePagesMap.set(pathToRegexp(entry.archive, entry.replacements, true), entry.source);
      }
    });
  }

  /**
   * Lazy initialization for archive pages map.
   *
   * @returns {Map}
   * @private
   */
  static getArchivePagesMap() {
    if (!this.archivePagesMap) {
      this.initArchivePagesMaps();
    }

    return this.archivePagesMap;
  }

  /**
   * Lazy initialization for source pages map.
   *
   * @returns {Map}
   * @private
   */
  static getSourcePagesMap() {
    if (!this.sourcePagesMap) {
      this.initArchivePagesMaps();
    }

    return this.sourcePagesMap;
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
   * @param {CommentForm} options.commentForm Comment form that has the code.
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
        (commentForm.isNewSectionApi() ? '' : (originalContextCode + '\n').trimLeft()) +
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
