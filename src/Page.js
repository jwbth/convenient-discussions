/**
 * A wiki page (a page for which the
 * {@link https://www.mediawiki.org/wiki/Manual:Interface/JavaScript#All_pages_(user/page-specific) wgIsArticle}
 * config value is `true`).
 *
 * @module Page
 */

import PageSource from './PageSource'
import TextMasker from './TextMasker'
import cd from './loader/cd'
import CdError from './shared/CdError'
import { defined, mergeRegexps } from './shared/utils-general'
import { handleApiReject, requestInBackground } from './utils-api'

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
 * A wiki page (a page for which the
 * {@link https://www.mediawiki.org/wiki/Manual:Interface/JavaScript#All_pages_(user/page-specific) wgIsArticle}
 * config value is `true`) in both of its facets – a rendered instance in case of the current page
 * (see {@link CurrentPage}) and an entry in the database with data and content.
 *
 * To create an instance, use {@link module:pageRegistry.get}.
 */
export default class Page {
	/** @readonly */
	TYPE = 'page'

	/**
	 * Page ID on the wiki. Filled upon running {@link Page#loadCode} or {@link Page#edit}. In the
	 * latter case, it is useful for newly created pages.
	 *
	 * @name pageId
	 * @type {number|undefined}
	 */
	pageId

	/**
	 * ID of the revision that has {@link Page#code}. Filled upon running {@link Page#loadCode}.
	 *
	 * @name revisionId
	 * @type {number|undefined}
	 */
	revisionId

	/**
	 * Page where {@link Page#name} redirects. Filled upon running {@link Page#loadCode}.
	 *
	 * @name redirectTarget
	 * @type {string|null|undefined}
	 */
	redirectTarget

	/**
	 * If {@link Page#name} redirects to some other page, the value is that page. If not, the value is
	 * the same as {@link Page#name}. Filled upon running {@link Page#loadCode}.
	 *
	 * @name realName
	 * @type {string|undefined}
	 */
	realName

	/**
	 * Time when {@link Page#code} was queried (as the server reports it). Filled upon running
	 * {@link Page#loadCode}.
	 *
	 * @name queryTimestamp
	 * @type {string|undefined}
	 */
	queryTimestamp

	/**
	 * Create a page instance.
	 *
	 * @param {mw.Title} mwTitle
	 * @param {typeof import('./pageRegistry').default} pageRegistry
	 * @param {string} [genderedName]
	 * @throws {CdError} If the string in the first parameter is not a valid title.
	 */
	constructor(mwTitle, pageRegistry, genderedName) {
		this.registry = pageRegistry

		// TODO: remove after uses by foreign scripts are replaced.
		if (!(mwTitle instanceof mw.Title)) {
			mwTitle = new mw.Title(mwTitle)
		}

		/**
		 * Page's {@link mw.Title mw.Title} object.
		 */
		this.mwTitle = mwTitle

		/**
		 * Page name, with a namespace name, not necessarily normalized (not normalized if a gendered
		 * name is available). The word separator is space, not underline.
		 *
		 * @type {string}
		 */
		this.name = genderedName || mwTitle.getPrefixedText()

		/**
		 * Page title, with no namespace name, normalized. The word separator is a space, not an
		 * underline.
		 *
		 * @type {string}
		 */
		this.title = mwTitle.getMainText()

		/**
		 * Namespace number.
		 *
		 * @type {number}
		 */
		this.namespaceId = mwTitle.getNamespaceId()

		/**
		 * Page's source code object. This is mostly for polymorphism with {@link CommentSource} and
		 * {@link SectionSource}.
		 *
		 * @type {PageSource}
		 */
		this.source = new PageSource(this)

		/**
		 * Is the page actionable, i.e. you can add a section to it. Can be `true` only for the current
		 * page.
		 *
		 * @type {boolean}
		 */
		this.isActionable = false
	}

	/**
	 * Check whether the page is the one the user is visiting.
	 *
	 * @returns {boolean}
	 */
	isCurrent() {
		return this.mwTitle.getPrefixedText() === this.registry.getCanonicalCurrentPageName()
	}

	/**
	 * Set the gendered name of the page.
	 *
	 * @param {string} genderedName
	 */
	setGenderedName(genderedName) {
		this.name = genderedName
	}

	/**
	 * Check whether the page is the user's own talk page.
	 *
	 * @returns {boolean}
	 */
	isOwnTalkPage() {
		return mw.config.get('wgNamespaceNumber') === 3 && this.title === cd.user.getName()
	}

	/**
	 * Check if the page is probably a talk page.
	 *
	 * @returns {boolean}
	 */
	isProbablyTalkPage() {
		return cd.loader.isProbablyTalkPage(this.realName || this.name, this.namespaceId)
	}

	/**
	 * Check if the page is an archive page. Relies on {@link module:defaultConfig.archivePaths}
	 * and/or, for the current page, elements with the class `cd-archivingInfo` and attribute
	 * `data-is-archive-page`.
	 *
	 * @returns {boolean}
	 */
	isArchive() {
		let result = false
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const name = this.realName || this.name
		for (const sourceRegexp of Page.getSourcePagesMap().keys()) {
			if (sourceRegexp.test(name)) {
				result = true
				break
			}
		}

		return result
	}

	/**
	 * Check if this page can have archives. If the page is an archive page, returns `false`. Relies
	 * on {@link module:defaultConfig.pagesWithoutArchives} and
	 * {@link module:defaultConfig.archivePaths}.
	 *
	 * @returns {boolean | undefined}
	 */
	canHaveArchives() {
		if (this.isArchive()) {
			return false
		}

		return !mergeRegexps(cd.config.pagesWithoutArchives)?.test(this.realName || this.name)
	}

	/**
	 * Get the archive prefix for the page. If no prefix is found based on
	 * {@link module:defaultConfig.archivePaths}, returns the current page's name. If the page is an
	 * archive page or can't have archives, returns `null`.
	 *
	 * @param {boolean} [onlyExplicit]
	 * @returns {string | undefined}
	 */
	getArchivePrefix(onlyExplicit = false) {
		if (!this.canHaveArchives()) {
			return
		}

		let result
		const name = this.realName || this.name
		for (const [sourceRegexp, replacement] of Page.getArchivePagesMap().entries()) {
			if (sourceRegexp.test(name)) {
				result = name.replace(sourceRegexp, replacement)
				break
			}
		}

		return result ?? (onlyExplicit ? undefined : name + '/')
	}

	/**
	 * Get the source page for the page (i.e., the page from which archiving is happening). Returns
	 * the page itself if it is not an archive page. Relies on
	 * {@link module:defaultConfig.archivePaths}.
	 *
	 * @returns {Page}
	 */
	getArchivedPage() {
		let result
		const name = this.realName || this.name
		for (const [archiveRegexp, replacement] of Page.getSourcePagesMap().entries()) {
			if (archiveRegexp.test(name)) {
				result = name.replace(archiveRegexp, replacement)
				break
			}
		}

		return (result && this.registry.get(result)) || this
	}

	/**
	 * @overload
	 * @param {import('./CommentForm').default} [_] Not used.
	 * @param {true} [tolerateMissing] Return `undefined` if the page is missing instead of throwing
	 *   an error.
	 * @returns {Promise<PageSource | undefined>} A promise resolving to the wikitext of the page, or `undefined`
	 *   if the page is missing.
	 *
	 * @overload
	 * @param {import('./CommentForm').default} [_] Not used.
	 * @param {false} tolerateMissing Return `undefined` if the page is missing instead of throwing an
	 *   error.
	 * @returns {Promise<PageSource>} A promise resolving to the wikitext of the page.
	 *
	 * @overload
	 * @param {import('./CommentForm').default} [_] Not used.
	 * @param {boolean} [tolerateMissing] Return `null` if the page is missing instead of
	 *   throwing an error.
	 * @returns {Promise<PageSource>} A promise resolving to the wikitext of the page.
	 */

	/**
	 * Make a revision request (see {@link https://www.mediawiki.org/wiki/API:Revisions}) to load the
	 * wikitext of the page, together with a few revision properties: the timestamp, redirect target,
	 * and query timestamp (`curtimestamp`). Enrich the page instance with those properties. Also set
	 * the `realName` property that indicates either the redirect target if it's present or the page
	 * name.
	 *
	 * @param {import('./CommentForm').default} [_] Not used.
	 * @param {boolean} [tolerateMissing] Return `undefined` if the page is missing instead of
	 *   throwing an error.
	 * @returns {Promise<PageSource | undefined>}
	 * @throws {CdError}
	 */
	async loadCode(_, tolerateMissing = true) {
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
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
			.catch(handleApiReject)
		const { query, curtimestamp: queryTimestamp } =
			/** @type {ApiResponseQuery<ApiResponseQueryContentPages>} */ (await request)

		const page = query?.pages?.[0]
		const revision = page?.revisions?.[0]
		const content = revision?.slots?.main.content

		if (!query || !page) {
			throw new CdError({
				type: 'response',
				code: 'noData',
			})
		}

		if (page.missing) {
			this.source.setCode('')
			this.revisionId = undefined
			this.redirectTarget = undefined
			this.realName = this.name
			this.queryTimestamp = queryTimestamp

			if (tolerateMissing) {
				return
			}

			throw new CdError({
				type: 'response',
				code: 'missing',
			})
		}
		if (page.invalid) {
			throw new CdError({
				type: 'response',
				code: 'invalid',
			})
		}

		if (!revision || content === undefined) {
			throw new CdError({
				type: 'response',
				code: 'noData',
			})
		}

		const redirectTarget = query.redirects?.[0]?.to || null

		// It's more convenient to unify regexps to have \n as the last character of anything, not
		// (?:\n|$), and it doesn't seem to affect anything substantially.
		this.source.setCode(content + '\n')

		this.revisionId = revision.revid
		this.redirectTarget = redirectTarget
		this.realName = redirectTarget || this.name
		this.queryTimestamp = /** @type {string} */ (queryTimestamp)

		return this.source
	}

	/**
	 * Make a parse request (see {@link https://www.mediawiki.org/wiki/API:Parsing_wikitext}).
	 *
	 * @param {import('types-mediawiki/api_params').ApiParseParams} [customOptions]
	 * @param {boolean} [inBackground] Make a request that won't set the process on hold when
	 *   the tab is in the background.
	 * @param {boolean} [markAsRead] Mark the current page as read in the watchlist.
	 * @returns {Promise.<import('./utils-api').ApiResponseParseContent>}
	 * @throws {CdError}
	 */
	async parse(customOptions, inBackground = false, markAsRead = false) {
		const options = /** @type {import('types-mediawiki/api_params').ApiParseParams} */ ({
			action: 'parse',

			// If we know that this page is a redirect, use its target. Otherwise, use the regular name.
			page: this.realName || this.name,

			disabletoc: cd.g.skin === 'vector-2022',
			useskin: cd.g.skin,
			redirects: true,
			prop: ['text', 'revid', 'modules', 'jsconfigvars', 'sections', 'subtitle', 'categorieshtml'],
			parsoid: cd.g.isParsoidUsed,
			disablelimitreport: true,
			...cd.g.apiErrorFormatHtml,

			...customOptions,
		})

		// `page` and `oldid` can not be used together.
		if (customOptions?.oldid) {
			delete options.page
		}

		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const request = inBackground
			? requestInBackground(options).catch(handleApiReject)
			: cd.getApi().post(options).catch(handleApiReject)
		const { parse } = /** @type {import('./utils-api').ApiResponseParse} */ (await request)

		if (markAsRead) {
			this.markAsRead(parse.revid)
		}

		return parse
	}

	/**
	 * @template {string[]} T
	 * @typedef {object} GetRevisionsOptionsExtension
	 * @property {T} [rvprop]
	 */

	/**
	 * @template {string[]} [T=['ids', 'timestamp', 'flags', 'comment', 'user']]
	 * @typedef {GetRevisionsOptionsExtension<T> & import('types-mediawiki/api_params').ApiQueryRevisionsParams} GetRevisionsOptions
	 */

	/**
	 * Get a list of revisions of the page (the `redirects` API parameter is set to `true` by
	 * default).
	 *
	 * @template {string[]} [T=['ids', 'timestamp', 'flags', 'comment', 'user']]
	 * @param {GetRevisionsOptions<T>} [customOptions]
	 * @param {boolean} [inBackground] Make a request that won't set the process on hold when
	 *   the tab is in the background.
	 * @returns {Promise<Revision<T>[] | undefined>}
	 */
	async getRevisions(customOptions = {}, inBackground = false) {
		const options = /** @type {import('types-mediawiki/api_params').ApiQueryRevisionsParams} */ ({
			action: 'query',
			titles: customOptions.revids ? undefined : this.name,
			rvslots: 'main',
			prop: 'revisions',
			redirects: !(this.isCurrent() && mw.config.get('wgIsRedirect')),
			...customOptions,
		})

		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const request = inBackground
			? requestInBackground(options).catch(handleApiReject)
			: cd
					.getApi()
					.post(/** @type {import('types-mediawiki/api_params').UnknownApiParams} */ (options))
					.catch(handleApiReject)
		const response = /** @type {ApiResponseQuery<ApiResponseQueryContentPages>} */ (await request)

		return /** @type {Revision<T>[] | undefined} */ (response.query?.pages?.[0]?.revisions)
	}

	/**
	 * Make an edit API request ({@link https://www.mediawiki.org/wiki/API:Edit}).
	 *
	 * @param {import('types-mediawiki/api_params').ApiEditPageParams} customOptions See
	 *   {@link https://www.mediawiki.org/wiki/API:Edit}. At least `text` should be set. `summary` is
	 *   recommended. `baserevid` and `starttimestamp` are needed to avoid edit conflicts. `baserevid`
	 *   can be taken from {@link Page#revisionId}; `starttimestamp` can be taken from
	 *   {@link Page#queryTimestamp}.
	 * @returns {Promise.<string>} Timestamp of the edit in the ISO format or `'nochange'` if nothing
	 *   has changed.
	 */
	async edit(customOptions) {
		/** @type {ApiResponseEdit} */
		let response
		try {
			response = await cd
				.getApi()
				.postWithEditToken(
					cd.getApi().assertCurrentUser({
						action: 'edit',

						// If we know that this page is a redirect, use its target. Otherwise, use the regular
						// name.
						title: this.realName || this.name,

						notminor: !customOptions.minor,

						// Should be `undefined` instead of `null`, otherwise will be interepreted as a string.
						tags: (cd.user.isRegistered() && cd.config.tagName) || undefined,

						...cd.g.apiErrorFormatHtml,
						...customOptions,
					}),
					{
						// Beneficial when sending long unicode texts, which is what we do here.
						contentType: 'multipart/form-data',
					},
				)
				.catch(handleApiReject)
		} catch (error) {
			if (error instanceof CdError && error.isServerDefinedApiError()) {
				switch (error.getCode()) {
					case 'editconflict': {
						error.setMessage(cd.sParse('error-editconflict'))
						break
					}

					case 'missingtitle': {
						error.setMessage(cd.sParse('error-pagedeleted'))
						break
					}

					default: {
						const message = error.getHtml()
						if (message.includes('<table') || message.includes('<div')) {
							error.set$message($(message))
						} else {
							error.setMessage(message)
						}
					}
				}
			}

			throw error
		}

		if (response.edit.result !== 'Success') {
			throw new CdError({
				type: 'response',
				code: response.edit.captcha ? 'captcha' : 'fail',
				apiResponse: response,
			})
		}

		return response.edit.newtimestamp || 'nochange'
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
				mw.notify(cd.s('error-purgecache'), { type: 'warn' })
			})
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
		})
	}

	/**
	 * Get the URL of the page with the specified parameters.
	 *
	 * @param {import('types-mediawiki/mw/Uri').QueryParams} [parameters]
	 * @returns {string}
	 */
	getUrl(parameters) {
		return mw.util.getUrl(this.name, parameters)
	}

	/**
	 * Get a decoded URL with a fragment identifier.
	 *
	 * @param {string | undefined} [fragment]
	 * @param {boolean} [permanent] Get a permanent URL.
	 * @returns {string}
	 */
	getDecodedUrlWithFragment(fragment, permanent = false) {
		return (
			cd.g.server +
			decodeURI(this.getUrl(permanent ? { oldid: mw.config.get('wgRevisionId') } : {})) +
			(fragment ? `#${fragment}` : '')
		)
	}

	/**
	 * Get the code of the first translusion of a certain template.
	 *
	 * @param {Page[]} pages Template pages
	 * @returns {Promise<Map<Page, StringsByKey>>}
	 */
	async getFirstTemplateTransclusion(pages) {
		let data
		try {
			data = /** @type {import('./utils-api').ApiResponseParseTree} */ (
				await cd
					.getApi()
					.post({
						action: 'parse',
						prop: 'parsetree',
						page: this.name,
					})
					.catch(handleApiReject)
			)
		} catch (error) {
			if (
				error instanceof CdError &&
				['missingtitle', 'notwikitext'].includes(error.getCode() || '')
			) {
				return new Map()
			}
			throw error
		}

		const $templates = $($.parseXML(data.parse.parsetree)).find('template')

		return new Map(
			pages
				.map(
					(page) =>
						/** @type {[Page, StringsByKey]} */ ([
							page,
							Object.fromEntries(
								$templates
									// Find the first <template> with a <title> child equal to the name
									.filter(
										(_, template) =>
											this.registry.get($(template).children('title').text().trim()) === page,
									)
									.first()
									.find('comment')
									.remove()
									.end()

									// Process all <part> children to extract <name> and <value>
									.children('part')
									.get()
									.map((part) => {
										const $name = $(part).children('name')

										// Key, value
										return [
											$name.text().trim() || $name.attr('index'),
											$(part).children('value').text().trim(),
										]
									}),
							),
						]),
				)
				.filter(defined),
		)
	}

	/**
	 * Get a diff between two revisions of the page.
	 *
	 * @param {number} revisionIdFrom
	 * @param {number} revisionIdTo
	 * @returns {Promise.<string>}
	 */
	async compareRevisions(revisionIdFrom, revisionIdTo) {
		const response = /** @type {import('./utils-api').APIResponseCompare} */ (
			await cd
				.getApi()
				.post({
					action: 'compare',
					fromtitle: this.name,
					fromrev: revisionIdFrom,
					torev: revisionIdTo,
					prop: ['diff'],
				})
				.catch(handleApiReject)
		)

		return response.compare.body
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
		return cd.s('cf-headline-topic')
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
		return cd.s('cf-comment-placeholder')
	}

	/**
	 * Get the comment that is visually a target of the comment form that has the page as target.
	 *
	 * Used for polymorphism with {@link Comment#getCommentFormTargetComment} and
	 * {@link Section#getCommentFormTargetComment}.
	 *
	 * @returns {undefined}
	 */
	getCommentFormTargetComment() {
		return
	}

	/**
	 * Set the {@link Page#redirectTarget} and {@link Page#realName} properties.
	 *
	 * @param {string | null | undefined} redirectTarget
	 */
	setRedirectTarget(redirectTarget) {
		this.redirectTarget = redirectTarget
		this.realName = redirectTarget || this.name
	}

	/**
	 * @typedef {object} PagesMap
	 * @property {Map<RegExp, string>} source
	 * @property {Map<RegExp, string>} archive
	 */

	/**
	 * @type {PagesMap | undefined}
	 */
	static pagesMaps

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
		}
		const pathToRegexp = (
			/** @type {string} */ path,
			/** @type {RegExp[]|undefined} */ replacements,
			/** @type {boolean} */ isArchivePath,
		) =>
			new RegExp(
				new TextMasker(path)
					.mask(/\\[$\\]/g)
					.withText((pattern) => {
						pattern = mw.util.escapeRegExp(pattern)
						if (replacements) {
							pattern = pattern.replace(/\\\$/, '$').replace(/\$(\d+)/, (s, n) => {
								const replacement = replacements.at(n - 1)

								return replacement ? `(${replacement.source})` : s
							})
						}
						pattern = '^' + pattern + (isArchivePath ? '.*' : '') + '$'

						return pattern
					})
					.unmask()
					.getText(),
			)
		cd.config.archivePaths.forEach((entry) => {
			if (entry instanceof RegExp) {
				pagesMaps.source.set(new RegExp(entry.source + '.*'), '')
			} else {
				pagesMaps.archive.set(pathToRegexp(entry.source, entry.replacements, false), entry.archive)
				pagesMaps.source.set(pathToRegexp(entry.archive, entry.replacements, true), entry.source)
			}
		})

		return pagesMaps
	}

	/**
	 * Lazy initialization for archive pages map.
	 *
	 * @returns {Map<RegExp, string>}
	 * @private
	 */
	static getArchivePagesMap() {
		this.pagesMaps ??= this.getArchivePagesMaps()

		return this.pagesMaps.archive
	}

	/**
	 * Lazy initialization for source pages map.
	 *
	 * @returns {Map<RegExp, string>}
	 * @private
	 */
	static getSourcePagesMap() {
		this.pagesMaps ??= this.getArchivePagesMaps()

		return this.pagesMaps.source
	}

	/**
	 * Get the name of the page's method creating a comment form with the specified mode. Used for
	 * polymorphism with {@link Section}.
	 *
	 * @param {import('./CommentForm').CommentFormMode} mode
	 * @returns {string}
	 */
	getCommentFormMethodName(mode) {
		return mode
	}

	/**
	 * Get the section that a comment on the page belongs to. Used for debug output. Can return
	 * `undefined` when no section is found.
	 *
	 * @returns {undefined}
	 */
	getRelevantSection() {
		return
	}

	/**
	 * Get the comment that this comment is a reply to. Used for debug output.
	 *
	 * @returns {undefined}
	 */
	getRelevantComment() {
		return
	}

	/**
	 * Get the data that identifies this page. This can only be used for `addSection` comment forms
	 * which relate to the current page, so we don't actually need any meaningful data. Used for
	 * polymorphism with {@link Comment#getIdentifyingData} and {@link Section#getIdentifyingData}.
	 *
	 * @returns {undefined}
	 */
	getIdentifyingData() {
		return
	}

	/**
	 * If a new section is added to the page, get the comment that will end up directly above the
	 * section. This is only needed for the current page.
	 *
	 * @param {import('./CommentForm').default} _commentForm
	 * @returns {import('./Comment').default | undefined}
	 */
	getCommentAboveCommentToBeAdded(_commentForm) {
		return
	}

	/**
	 * Used for polymorphism with {@link Comment} and {@link Section}.
	 *
	 * @returns {Page}
	 */
	findNewSelf() {
		return this
	}
}
