/**
 * Class representing a wiki page.
 *
 * @module Page
 */

import CdError from './CdError';
import CommentForm from './CommentForm';
import TextMasker from './TextMasker';
import bootController from './bootController';
import cd from './cd';
import commentFormRegistry from './commentFormRegistry';
import commentRegistry from './commentRegistry';
import pageRegistry from './pageRegistry';
import sectionRegistry from './sectionRegistry';
import { handleApiReject, requestInBackground } from './utils-api';
import { areObjectsEqual, defined, isProbablyTalkPage, mergeRegexps } from './utils-general';
import { parseTimestamp } from './utils-timestamp';
import { findFirstTimestamp, maskDistractingCode } from './utils-wikitext';

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
 * @typedef {{ [key: string]: string }} StringsByKey
 */

/**
 * Class representing a wiki page (a page for which the
 * {@link https://www.mediawiki.org/wiki/Manual:Interface/JavaScript#All_pages_(user/page-specific) wgIsArticle}
 * config value is `true`) in both of its facets – a rendered instance (for the current page) and an
 * entry in the database with data and content.
 *
 * To create an instance, use {@link module:pageRegistry.get} (the constructor is only exported for
 * means of code completion).
 */
export default class Page {
  /** @readonly */
  TYPE = 'page';

  /**
   * User for polymorphism with Comment.
   */
  isOpeningSection = null;

  /**
   * Page ID on the wiki. Filled upon running {@link Page#loadCode} or {@link Page#edit}. In the
   * latter case, it is useful for newly created pages.
   *
   * @name pageId
   * @type {number|undefined}
   */
  pageId;

  /**
   * Page's source code (wikitext), ending with `\n`. Filled upon running {@link Page#loadCode}.
   *
   * @name code
   * @type {string|undefined}
   */
  code;

  /**
   * ID of the revision that has {@link Page#code}. Filled upon running {@link Page#loadCode}.
   *
   * @name revisionId
   * @type {number|undefined}
   */
  revisionId;

  /**
   * Page where {@link Page#name} redirects. Filled upon running {@link Page#loadCode}.
   *
   * @name redirectTarget
   * @type {?(string|undefined)}
   */
  redirectTarget;

  /**
   * If {@link Page#name} redirects to some other page, the value is that page. If not, the value is
   * the same as {@link Page#name}. Filled upon running {@link Page#loadCode}.
   *
   * @name realName
   * @type {string|undefined}
   */
  realName;

  /**
   * Time when {@link Page#code} was queried (as the server reports it). Filled upon running
   * {@link Page#loadCode}.
   *
   * @name queryTimestamp
   * @type {string|undefined}
   */
  queryTimestamp;

  /**
   * @type {JQuery}
   * @private
   */
  $archivingInfo;

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
    this.source = new PageSource(this);

    /**
     * Is the page actionable, i.e. you can add a section to it. Can be `true` only for the current
     * page.
     *
     * @type {boolean}
     */
    this.isActionable = Boolean(this.isCommentable());
  }

  /**
   * Check whether the page is the one the user is visiting.
   *
   * @returns {boolean}
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

    return bootController.isPageOfType('talk') && (this.isActive() || !this.exists());
  }

  /**
   * Check whether the current page exists (is not 404).
   *
   * @returns {?boolean}
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
   * This value is constant in most cases, but there are exceptions:
   *   1. The user may switch to another revision using
   *      {@link https://www.mediawiki.org/wiki/Extension:RevisionSlider RevisionSlider}.
   *   2. On a really rare occasion, an active page may become inactive if it becomes identified as
   *      an archive page. This was switched off when I wrote this.
   *
   * @returns {?boolean}
   */
  isActive() {
    if (!this.isCurrent()) {
      return null;
    }

    return (
      bootController.isPageOfType('talk') &&
      this.exists() &&
      bootController.isCurrentRevision() &&
      !this.isArchive()
    );
  }

  /**
   * Check whether the current page is an archive and the displayed revision the current one.
   *
   * @returns {boolean}
   */
  isCurrentArchive() {
    return bootController.isCurrentRevision() && this.isArchive();
  }

  /**
   * Get the URL of the page with the specified parameters.
   *
   * @param {object} [parameters]
   * @returns {string}
   */
  getUrl(parameters) {
    return mw.util.getUrl(this.name, parameters);
  }

  /**
   * Get a decoded URL with a fragment identifier.
   *
   * @param {?string} [fragment]
   * @param {boolean} [permanent=false] Get a permanent URL.
   * @returns {string}
   */
  getDecodedUrlWithFragment(fragment, permanent = false) {
    const decodedPageUrl = decodeURI(
      this.getUrl({
        ...(permanent ? { oldid: mw.config.get('wgRevisionId') } : {}),
      })
    );
    return cd.g.server + decodedPageUrl + (fragment ? `#${fragment}` : '');
  }

  /**
   * Find an archiving info element on the page.
   *
   * @returns {?JQuery}
   * @private
   */
  findArchivingInfoElement() {
    if (!this.isCurrent()) {
      return null;
    }

    // This is not reevaluated after page reloads. Since archive settings we need rarely change, the
    // reevaluation is unlikely to make any difference. `$root?` because the $root can not be set
    // when it runs from the addCommentLinks module.
    this.$archivingInfo ||= bootController.$root?.find('.cd-archivingInfo');

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
  isArchive() {
    let result = this.findArchivingInfoElement()?.data('isArchivePage');
    if (result === undefined || result === null) {
      result = false;
      const name = this.realName || this.name;
      for (const sourceRegexp of Page.getSourcePagesMap().keys()) {
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
    if (this.isArchive()) {
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
   * @param {boolean} [onlyExplicit=false]
   * @returns {?string}
   */
  getArchivePrefix(onlyExplicit = false) {
    if (!this.canHaveArchives()) {
      return null;
    }

    let result = this.findArchivingInfoElement()?.data('archivePrefix');
    const name = this.realName || this.name;
    if (!result) {
      for (const [sourceRegexp, replacement] of Page.getArchivePagesMap().entries()) {
        if (sourceRegexp.test(name)) {
          result = name.replace(sourceRegexp, replacement);
          break;
        }
      }
    }

    return result ? String(result) : onlyExplicit ? null : name + '/';
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
      for (const [archiveRegexp, replacement] of Page.getSourcePagesMap().entries()) {
        if (archiveRegexp.test(name)) {
          result = name.replace(archiveRegexp, replacement);
          break;
        }
      }
    }

    return (result && pageRegistry.get(String(result))) || this;
  }

  /**
   * @overload
   * @param {CommentForm} [_] Not used.
   * @param {true} [tolerateMissing=true] Return `null` if the page is missing instead of throwing
   *   an error.
   * @returns {Promise<?string>} A promise resolving to the wikitext of the page, or `null` if the
   * page is missing.
   *
   * @overload
   * @param {CommentForm} [_] Not used.
   * @param {false} tolerateMissing Return `null` if the page is missing instead of throwing an
   *   error.
   * @returns {Promise<string>} A promise resolving to the wikitext of the page.
   *
   * @overload
   * @param {CommentForm} [_] Not used.
   * @param {boolean} [tolerateMissing=true] Return `null` if the page is missing instead of
   *   throwing an error.
   * @returns {Promise<string>} A promise resolving to the wikitext of the page.
   */

  /**
   * Make a revision request (see {@link https://www.mediawiki.org/wiki/API:Revisions}) to load the
   * wikitext of the page, together with a few revision properties: the timestamp, redirect target,
   * and query timestamp (`curtimestamp`). Enrich the page instance with those properties. Also set
   * the `realName` property that indicates either the redirect target if it's present or the page
   * name.
   *
   * @param {CommentForm} [_] Not used.
   * @param {boolean} [tolerateMissing=true] Return `null` if the page is missing instead of
   *   throwing an error.
   * @returns {Promise<?string>}
   * @throws {CdError}
   */
  async loadCode(_, tolerateMissing = true) {
    const request = cd
      .getApi()
      .post({
        action: 'query',
        titles: this.name,
        prop: 'revisions',
        rvslots: 'main',
        rvprop: ['ids', 'content'],
        redirects: !(this.isCurrent() && mw.config.get('wgIsRedirect')),
        curtimestamp: true,
      })
      .catch(handleApiReject);
    const { query, curtimestamp: queryTimestamp } =
      /** @type {ApiResponseQuery<ApiResponseQueryContentPages>} */ (await request);

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
      this.code = '';
      this.revisionId = undefined;
      this.redirectTarget = undefined;
      this.realName = this.name;
      this.queryTimestamp = queryTimestamp;

      if (tolerateMissing) {
        return null;
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

    // It's more convenient to unify regexps to have \n as the last character of anything, not
    // (?:\n|$), and it doesn't seem to affect anything substantially.
    this.code = content + '\n';

    this.revisionId = revision.revid;
    this.redirectTarget = redirectTarget;
    this.realName = redirectTarget || this.name;
    this.queryTimestamp = /** @type {string} */ (queryTimestamp);

    return this.code;
  }

  /**
   * Make a parse request (see {@link https://www.mediawiki.org/wiki/API:Parsing_wikitext}).
   *
   * @param {object} [customOptions]
   * @param {boolean} [inBackground=false] Make a request that won't set the process on hold when
   *   the tab is in the background.
   * @param {boolean} [markAsRead=false] Mark the current page as read in the watchlist.
   * @returns {Promise.<import('./utils-api').ApiResponseParseContent>}
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
    const options = { ...defaultOptions, ...customOptions };

    // `page` and `oldid` can not be used together.
    if (customOptions?.oldid) {
      delete options.page;
    }

    const request = inBackground
      ? requestInBackground(options).catch(handleApiReject)
      : cd.getApi().post(options).catch(handleApiReject);
    const { parse } = /** @type {import('./utils-api').ApiResponseParse} */ (await request);
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
   * Get a list of revisions of the page (the `redirects` API parameter is set to `true` by
   * default).
   *
   * @param {object} [customOptions={}]
   * @param {boolean} [inBackground=false] Make a request that won't set the process on hold when
   *   the tab is in the background.
   * @returns {Promise.<Array>}
   */
  async getRevisions(customOptions = {}, inBackground = false) {
    const options = /** @type {import('types-mediawiki/api_params').ApiQueryRevisionsParams} */ ({
      action: 'query',
      titles: customOptions.revids ? undefined : this.name,
      rvslots: 'main',
      prop: 'revisions',
      redirects: !(this.isCurrent() && mw.config.get('wgIsRedirect')),
      ...customOptions,
    });

    const request = inBackground
      ? requestInBackground(options).catch(handleApiReject)
      : cd
          .getApi()
          .post(/** @type {import('types-mediawiki/mw/Api').UnknownApiParams} */ (options))
          .catch(handleApiReject);
    const response = /** @type {ApiResponseQuery<ApiResponseQueryContentPages>} */ (await request);
    const revisions = response.query?.pages?.[0]?.revisions;
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
    const options = cd.getApi().assertCurrentUser({
      action: 'edit',

      // If we know that this page is a redirect, use its target. Otherwise, use the regular name.
      title: this.realName || this.name,

      notminor: !customOptions.minor,

      // Should be `undefined` instead of `null`, otherwise will be interepreted as a string.
      tags: (cd.user.isRegistered() && cd.config.tagName) || undefined,

      ...cd.g.apiErrorFormatHtml,
      ...customOptions,
    });

    let response;
    try {
      const request = cd
        .getApi()
        .postWithEditToken(options, {
          // Beneficial when sending long unicode texts, which is what we do here.
          contentType: 'multipart/form-data',
        })
        .catch(handleApiReject);
      response = /** @type {ApiResponseEdit} */ (await request);
    } catch (error) {
      if (error instanceof CdError) {
        const { type, apiResponse } = error.data;
        if (type === 'network') {
          throw error;
        } else {
          const error = apiResponse?.errors[0];
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

            logMessage = [code, apiResponse];
          } else {
            logMessage = apiResponse;
          }

          throw new CdError({
            type: 'api',
            code: 'error',
            apiResponse: response,
            details: { code, message, isRawMessage, logMessage },
          });
        }
      } else {
        throw error;
      }
    }

    if (response.edit.result !== 'Success') {
      const code = response.edit.captcha ? 'captcha' : undefined;
      throw new CdError({
        type: 'api',
        code: 'error',
        apiResponse: response,
        details: {
          code,
          isRawMessage: true,
          logMessage: [code, response],
        },
      });
    }

    return response.edit.newtimestamp || 'nochange';
  }

  /**
   * {@link https://www.mediawiki.org/wiki/Manual:Purge Purge cache} of the page.
   */
  async purge() {
    await cd
      .getApi()
      .post({
        action: 'purge',
        titles: this.name,
      })
      .catch(() => {
        mw.notify(cd.s('error-purgecache'), { type: 'warn' });
      });
  }

  /**
   * Mark the page as read, optionally setting the revision to mark as read.
   *
   * @param {number} revisionId Revision to mark as read (setting all newer revisions unread).
   */
  async markAsRead(revisionId) {
    await cd.getApi().postWithEditToken({
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
        new OO.ui.ButtonWidget({
          label: cd.s('addtopic'),
          framed: false,
          classes: ['cd-button-ooui', 'cd-section-button'],
        }).on('click', () => {
          this.addSection();
        }).$element
      )

      // If appending to bootController.rootElement, it can land on a wrong place, like on 404 pages
      // with New Topic Tool enabled.
      .insertAfter(bootController.$root);
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
   * @param {object} [preloadConfig=CommentForm.getDefaultPreloadConfig()] See
   *   {@link CommentForm.getDefaultPreloadConfig}.
   * @param {boolean} [newTopicOnTop=false]
   * @returns {?import('./CommentForm').default}
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

        return null;
      }

      this.addSectionForm.$element.cdScrollIntoView('center');

      // Headline input may be missing if the `nosummary` preload parameter is truthy.
      (this.addSectionForm.headlineInput || this.addSectionForm.commentInput).focus();
    } else {
      /**
       * "Add section" form.
       *
       * @type {CommentForm|undefined}
       */
      this.addSectionForm = commentFormRegistry.setupCommentForm(
        this,
        {
          mode: 'addSection',
          preloadConfig,
          newTopicOnTop,
        },
        initialState,
        commentForm
      );

      this.$addSectionButtonContainer?.hide();
      if (!this.exists()) {
        bootController.$content.children('.noarticletext, .warningbox').hide();
      }
      $('#ca-addsection').addClass('selected');
      $('#ca-view').removeClass('selected');
      this.addSectionForm.on('teardown', () => {
        $('#ca-addsection').removeClass('selected');
        $('#ca-view').addClass('selected');
      });
    }

    return this.addSectionForm;
  }

  /**
   * Clean up traces of a comment form {@link CommentForm#getTarget targeted} at this page.
   *
   * @param {import('./CommentForm').CommentFormMode} mode
   * @param {import('./CommentForm').default} commentForm
   */
  addCommentFormToPage(mode, commentForm) {
    const firstSection = sectionRegistry.getByIndex(0);
    if (firstSection && commentForm.isNewTopicOnTop()) {
      firstSection.$heading.before(commentForm.$element);
    } else {
      bootController.$root.after(commentForm.$element);
    }
  }

  /**
   * Remove a comment form {@link CommentForm#getTarget targeted} at this page from the page.
   */
  cleanUpCommentFormTraces() {
    if (!this.exists()) {
      bootController.$content
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
   * @param {import('./CommentForm').CommentFormMode} mode
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
   * Get a diff between two revisions of the page.
   *
   * @param {number} revisionIdFrom
   * @param {number} revisionIdTo
   * @returns {Promise.<string>}
   */
  async compareRevisions(revisionIdFrom, revisionIdTo) {
    const request = cd
      .getApi()
      .post({
        action: 'compare',
        fromtitle: this.name,
        fromrev: revisionIdFrom,
        torev: revisionIdTo,
        prop: ['diff'],
      })
      .catch(handleApiReject);
    const response = /** @type {import('./utils-api').APIResponseCompare} */ (await request);

    return response?.compare?.body;
  }

  /**
   * Get the code of the first translusion of a certain template.
   *
   * @param {Page[]} pages Template pages
   * @returns {Promise<Map<Page, StringsByKey>>}
   */
  async getFirstTemplateTransclusion(pages) {
    let data;
    try {
      const request = cd
        .getApi()
        .post({
          action: 'parse',
          prop: 'parsetree',
          page: this.name,
        })
        .catch(handleApiReject);
      data = /** @type {import('./utils-api').ApiResponseParseTree} */ (await request);
    } catch (error) {
      if (
        error instanceof CdError &&
        ['missingtitle', 'notwikitext'].includes(error.data.apiError)
      ) {
        return new Map();
      } else {
        throw error;
      }
    }

    const $templates = $($.parseXML(data.parse.parsetree)).find('template');

    return new Map(
      pages
        .map((page) => {
          const parameters = $templates
            // Find the first <template> with a <title> child equal to the name
            .filter(
              (_, template) =>
                pageRegistry.get($(template).children('title').text().trim()) === page
            )
            .first()
            .find('comment')
            .remove()
            .end()

            // Process all <part> children to extract <name> and <value>
            .children('part')
            .get()
            ?.map((part) => {
              const $name = $(part).children('name');
              const value = $(part).children('value').text().trim();
              const key = /** @type {string} */ ($name.text().trim() || $name.attr('index'));

              return [key, value];
            });

          return parameters
            ? /** @type {[Page, StringsByKey]} */ ([page, Object.fromEntries(parameters)])
            : undefined;
        })
        .filter(defined)
    );
  }

  /**
   * Get the placeholder for the comment form's headline input.
   *
   * Used for polymorphism with {@link Comment#getCommentFormHeadlineInputPlaceholder} and
   * {@link Section#getCommentFormHeadlineInputPlaceholder}.
   *
   * @returns {string}
   */
  getCommentFormHeadlineInputPlaceholder() {
    return cd.s('cf-headline-topic');
  }

  /**
   * Get the placeholder for the comment form's comment input.
   *
   * Used for polymorphism with {@link Comment#getCommentFormCommentInputPlaceholder} and
   * {@link Section#getCommentFormCommentInputPlaceholder}.
   *
   * @returns {string}
   */
  getCommentFormCommentInputPlaceholder() {
    return cd.s('cf-comment-placeholder');
  }

  /**
   * Get the comment that is visually a target of the comment form that has the page as target.
   *
   * Used for polymorphism with {@link Comment#getCommentFormTargetComment} and
   * {@link Section#getCommentFormTargetComment}.
   *
   * @returns {null}
   */
  getCommentFormTargetComment() {
    return null;
  }

  /**
   * Set the {@link Page#redirectTarget} and {@link Page#realName} properties.
   *
   * @param {string | null | undefined} redirectTarget
   */
  setRedirectTarget(redirectTarget) {
    this.redirectTarget = redirectTarget;
    this.realName = redirectTarget || this.name;
  }

  /**
   * @typedef {object} PagesMap
   * @property {Map<RegExp, string>} source
   * @property {Map<RegExp, string>} archive
   */

  /**
   * @type {PagesMap}
   */
  static pagesMaps;

  /**
   * Set some map object variables related to archive pages.
   *
   * @private
   * @returns {PagesMap}
   */
  static getArchivePagesMaps() {
    const pagesMaps = {
      archive: new Map(),
      source: new Map(),
    };
    const pathToRegexp = (
      /** @type {string} */ s,
      /** @type {RegExp[]|undefined} */ replacements,
      /** @type {boolean} */ isArchivePath
    ) =>
      new RegExp(
        new TextMasker(s)
          .mask(/\\[$\\]/g)
          .withText((pattern) => {
            pattern = mw.util.escapeRegExp(pattern);
            if (replacements) {
              pattern = pattern.replace(/\\\$/, '$').replace(/\$(\d+)/, (s, n) => {
                const replacement = replacements[n - 1];

                return replacement ? `(${replacement.source})` : s;
              });
            }
            pattern = '^' + pattern + (isArchivePath ? '.*' : '') + '$';

            return pattern;
          })
          .unmask()
          .getText()
      );
    cd.config.archivePaths.forEach((entry) => {
      if (entry instanceof RegExp) {
        pagesMaps.source.set(new RegExp(entry.source + '.*'), '');
      } else {
        pagesMaps.archive.set(pathToRegexp(entry.source, entry.replacements), entry.archive);
        pagesMaps.source.set(pathToRegexp(entry.archive, entry.replacements, true), entry.source);
      }
    });

    return pagesMaps;
  }

  /**
   * Lazy initialization for archive pages map.
   *
   * @returns {Map<RegExp, string>}
   * @private
   */
  static getArchivePagesMap() {
    this.pagesMaps ||= this.getArchivePagesMaps();

    return this.pagesMaps.archive;
  }

  /**
   * Lazy initialization for source pages map.
   *
   * @returns {Map<RegExp, string>}
   * @private
   */
  static getSourcePagesMap() {
    this.pagesMaps ||= this.getArchivePagesMaps();

    return this.pagesMaps.source;
  }
}

/**
 * Class that keeps the methods and data related to the page's source code.
 */
export class PageSource {
  /**
   * Whether new topics go on top on this page. Filled upon running
   * {@link PageSource#guessNewTopicPlacement}.
   *
   * @type {boolean|undefined}
   */
  areNewTopicsOnTop;

  /**
   * The start index of the first section, if new topics are on top on this page. Filled upon
   * running {@link PageSource#guessNewTopicPlacement}.
   *
   * @type {number|undefined}
   */
  firstSectionStartIndex;

  /**
   * Create a comment's source object.
   *
   * @param {Page} page Page.
   */
  constructor(page) {
    this.page = page;
  }

  /**
   * Modify the page code string in accordance with an action. The `'addSection'` action is
   * presumed.
   *
   * @param {object} options
   * @param {string} [options.commentCode] Comment code, including trailing newlines and the
   *   signature. It is required (set to optional for polymorphism with CommentSource and
   *   SectionSource).
   * @param {CommentForm} options.commentForm Comment form that has the code.
   * @returns {{ contextCode: string; commentCode?: string;
   * }}
   */
  modifyContext({ commentCode, commentForm }) {
    const originalContextCode = this.page.code;
    if (!originalContextCode) {
      throw new CdError({
        type: 'internal',
        message: 'Context (page) code is not set.',
      });
    }

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
        (commentForm.isNewSectionApi() ? '' : (originalContextCode + '\n').trimStart()) +
        commentCode
      );
    }

    return { contextCode, commentCode };
  }

  /**
   * Enrich the page instance with the properties regarding whether new topics go on top on this
   * page (based on various factors) and, if new topics are on top, the start index of the first
   * section.
   *
   * @returns {{
   *   areNewTopicsOnTop: boolean;
   *   firstSectionStartIndex: number | undefined;
   * }}
   * @throws {CdError}
   * @private
   */
  guessNewTopicPlacement() {
    const page = this.page;

    if (page.code === undefined) {
      throw new CdError('Can\'t analyze the new topics placement: Page#code is undefined.');
    }

    let areNewTopicsOnTop = cd.config.areNewTopicsOnTop?.(page.name, page.code) || null;

    const adjustedCode = maskDistractingCode(page.code);
    const sectionHeadingRegexp = PageSource.getTopicHeadingRegexp();

    if (areNewTopicsOnTop === null) {
      // Detect the topic order: newest first or newest last.
      let previousDate;
      let difference = 0;
      let sectionHeadingMatch;
      while ((sectionHeadingMatch = sectionHeadingRegexp.exec(adjustedCode))) {
        const timestamp = findFirstTimestamp(page.code.slice(sectionHeadingMatch.index));
        const { date } = timestamp && parseTimestamp(timestamp) || {};
        if (date) {
          if (previousDate) {
            difference += date > previousDate ? -1 : 1;
          }
          previousDate = date;
        }
      }
      areNewTopicsOnTop = difference === 0 && mw.config.get('wgServerName') === 'ru.wikipedia.org' ?
        page.namespaceId % 2 === 0 :
        difference > 0;
    }

    return {
      areNewTopicsOnTop,

      // We only need the first section's index when new topics are on top.
      firstSectionStartIndex: areNewTopicsOnTop
        ? sectionHeadingRegexp.exec(adjustedCode)?.index
        : undefined,
    };
  }

  /**
   * Determine an offset in the code to insert a new/moved section into. If `referenceDate` is
   * specified, will take chronological order into account.
   *
   * @param {Date} [referenceDate=new Date()]
   * @returns {number}
   */
  findProperPlaceForSection(referenceDate = new Date()) {
    const { areNewTopicsOnTop, firstSectionStartIndex } = this.guessNewTopicPlacement();
    const code = /** @type {string} */ (this.page.code);

    if (!referenceDate) {
      return areNewTopicsOnTop ? firstSectionStartIndex || 0 : code.length;
    }

    const adjustedCode = maskDistractingCode(code);
    const sectionHeadingRegexp = PageSource.getTopicHeadingRegexp();
    let sectionHeadingMatch;
    const sections = [];
    while ((sectionHeadingMatch = sectionHeadingRegexp.exec(adjustedCode))) {
      const timestamp = findFirstTimestamp(code.slice(sectionHeadingMatch.index));
      const { date } = timestamp && parseTimestamp(timestamp) || {};
      sections.push({
        date,
        index: sectionHeadingMatch.index,
      });
    }

    const properPlaceIndex = sections.find(({ date }) =>
      (areNewTopicsOnTop && date && date < referenceDate) ||
      (!areNewTopicsOnTop && date && date > referenceDate)
    )?.index;

    return properPlaceIndex || code.length;
  }

  /**
   * Get the regexp for traversing topic headings.
   *
   * @returns {RegExp}
   */
  static getTopicHeadingRegexp() {
    return /^==[^=].*?==[ \t\x01\x02]*\n/gm;
  }
}
