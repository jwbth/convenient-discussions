import dateFormats from '../../data/dateFormats.json'
import digitsData from '../../data/digits.json'
import languageFallbacks from '../../data/languageFallbacks.json'
import addCommentLinksCss from '../addCommentLinks.less?inline'
import globalCss from '../global.less?inline'
import {
	defined,
	getQueryParamBooleanValue,
	isKeyOf,
	mergeRegexps,
	sleep,
	unique,
} from '../shared/utils-general'
import { dateTokenToMessageNames } from '../shared/utils-timestamp'
import { getUserInfo, splitIntoBatches } from '../utils-api'

import cd from './cd'

/**
 * Singleton for loading and managing page state related to booting and overlays. This goes to
 * `cd.loader`.
 *
 * @module convenientDiscussions.loader
 */
class Loader {
	/**
	 * @type {JQuery.Promise<void> | undefined}
	 * @private
	 */
	modulesRequest

	/**
	 * @type {Promise<void> | undefined}
	 * @private
	 */
	appRequest

	/**
	 * @type {Promise<void> | undefined}
	 * @private
	 */
	importAppRequest

	/**
	 * @type {boolean | undefined}
	 * @private
	 */
	queryTalkPage

	/**
	 * @type {boolean}
	 * @private
	 */
	queryIsTalkPage

	/**
	 * @type {boolean}
	 * @private
	 */
	queryIsNotTalkPage

	/**
	 * Regular expression for pages where the script should run.
	 *
	 * @type {RegExp | undefined}
	 */
	pageWhitelistRegexp

	/**
	 * Regular expression for pages where the script shouldn't run.
	 *
	 * @type {RegExp | undefined}
	 */
	pageBlacklistRegexp

	/**
	 * @typedef {object} PageTypes
	 * @property {boolean} talk The page is considered a talk page.
	 * @property {boolean} talkStrict The page meets strict criteria for being a talk page.
	 * @property {boolean} diff The page is a diff page.
	 * @property {boolean} watchlist The page is a watchlist page.
	 * @property {boolean} contributions The page is a contributions page.
	 * @property {boolean} history The page is a history page.
	 */

	/**
	 * @type {PageTypes}
	 * @private
	 */
	pageTypes

	/**
	 * See {@link Loader#isArticlePageOfTypeTalk}.
	 *
	 * @private
	 */
	articlePageOfTypeTalk = false

	/**
	 * @type {JQuery}
	 */
	$content = $('#mw-content-text')

	/**
	 * @type {JQuery | undefined}
	 * @private
	 */
	$bootingOverlay

	/**
	 * See {@link Loader#getSiteDataPromise}.
	 *
	 * @type {Promise<any[]> | undefined}
	 * @private
	 */
	siteDataPromise

	/**
	 * Is the page booting (the booting overlay is on).
	 *
	 * @type {boolean}
	 * @private
	 */
	booting = false

	/**
	 * Main app code content.
	 *
	 * @type {string | undefined}
	 * @private
	 */
	appCode

	/**
	 * Main app function. Assigned from app.js.
	 *
	 * @type {() => Promise<void>}
	 */
	app

	/**
	 * Add comment links function. Assigned from app.js.
	 *
	 * @type {() => Promise<void>}
	 */
	addCommentLinks

	/**
	 * Load modules required for talk pages or other specific page types, or not load. When this is
	 * called before the configuration file is certain to be loaded, we make a guess whether the
	 * modules are gonna be needed. This guess may be wrong in both ways (e.g. if a page turned out to
	 * be blacklisted/whitelisted).
	 *
	 * @returns {JQuery.Promise<any> | undefined}
	 */
	maybeLoadModules() {
		if (!this.modulesRequest) {
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			if (!this.pageTypes) {
				this.setPageTypes()
			}

			let modules

			// mw.loader.using() delays the execution even if all modules are ready (if CD is used as a
			// gadget with preloaded dependencies, for example), so we use this trick.
			if (this.shouldInitTalkPage()) {
				modules = [
					'ext.checkUser.styles',
					'ext.checkUser.userInfoCard',
					'jquery.client',
					'jquery.ui',
					'mediawiki.Title',
					'mediawiki.Uri',
					'mediawiki.api',
					'mediawiki.cookie',
					'mediawiki.interface.helpers.styles',
					'mediawiki.jqueryMsg',
					'mediawiki.notification',
					'mediawiki.storage',
					'mediawiki.user',
					'mediawiki.util',
					'oojs',
					'oojs-ui-core',
					'oojs-ui-widgets',
					'oojs-ui-windows',
					'oojs-ui.styles.icons-alerts',
					'oojs-ui.styles.icons-content',
					'oojs-ui.styles.icons-editing-advanced',
					'oojs-ui.styles.icons-editing-citation',
					'oojs-ui.styles.icons-editing-core',
					'oojs-ui.styles.icons-interactions',
					'oojs-ui.styles.icons-movement',
					'user.options',
				].filter(defined)

				// Non-blocking modules that we need to load for comment forms. We load them in parallel with
				// the main modules, but we don't wait for them to load before firing the "preprocessed"
				// hook and running the app, because they are not critical and we want to save time if they
				// are not needed.
				mw.loader.using(
					[
						'mediawiki.widgets.visibleLengthLimit',
						mw.loader.getState('ext.confirmEdit.CaptchaInputWidget')
							? 'ext.confirmEdit.CaptchaInputWidget'
							: undefined,
						// We need to instantiate our class based on the CodeMirror class, so we load it now,
						// not on comment form creation.
						...(cd.g.isCodeMirror6Installed
							? ['ext.CodeMirror.v6.WikiEditor', 'ext.CodeMirror.v6.mode.mediawiki']
							: []),
					].filter(defined),
				)
			} else if (this.shouldInitCommentLinks()) {
				modules = [
					'mediawiki.Title',
					'mediawiki.jqueryMsg',
					'mediawiki.util',
					'mediawiki.user',
					'user.options',

					// TODO: do a separate build for addCommentLinks(). addCommentLinks() doesn't need these
					// modules, but in Rolldown, all imports are moved to the top due to the way
					// https://rollupjs.org/configuration-options/#output-inlinedynamicimports works, so if we
					// do `class ProcessDialog extends OO.ui.ProcessDialog` in one of the modules, that would
					// throw an error if oojs-ui-windows is not loaded.
					'oojs',
					'oojs-ui-core',
					'oojs-ui-widgets',
					'oojs-ui-windows',
				]
			}

			this.modulesRequest = modules?.some((module) => mw.loader.getState(module) !== 'ready')
				? mw.loader.using(modules)
				: $.Deferred().resolve().promise()
		}

		return this.modulesRequest
	}

	/**
	 * Set page types.
	 *
	 * This is called two times: once in bootstrap() in startup.js before the configuration is certain
	 * to be loaded and once in Loader#maybeLoadTalkPageModules() after the configuration is certain
	 * to be loaded. The first call is provisional and used to determine whether to preload modules;
	 * the second call is to set the final values based on configuration data.
	 */
	setPageTypes() {
		// These values can change: start() in startup.js may run a second time from
		// maybeAddFooterSwitcher().
		this.queryTalkPage = getQueryParamBooleanValue('cdtalkpage')
		this.queryIsTalkPage = this.queryTalkPage === true
		this.queryIsNotTalkPage = this.queryTalkPage === false

		if ('config' in cd) {
			this.pageWhitelistRegexp = mergeRegexps(cd.config.pageWhitelist)
			this.pageBlacklistRegexp = mergeRegexps(cd.config.pageBlacklist)
		}

		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		this.pageTypes ??= /** @type {PageTypes} */ ({})
		this.pageTypes.talkStrict = Boolean(
			this.queryIsTalkPage ||
			// .cd-talkPage is used as a last resort way to make CD parse the page, as opposed to using
			// the list of supported namespaces and page white/black list in the configuration. With this
			// method, there won't be "comment" links for edits on pages that list revisions such as the
			// watchlist.
			this.$content.find('.cd-talkPage').length ||
			(($('#ca-addsection').length || this.pageWhitelistRegexp?.test(cd.g.pageName)) &&
				!this.pageBlacklistRegexp?.test(cd.g.pageName)),
		)

		this.articlePageOfTypeTalk =
			(!mw.config.get('wgIsRedirect') || !this.isCurrentRevision()) &&
			!this.$content.find('.cd-notTalkPage').length &&
			(this.pageTypes.talkStrict || this.isProbablyTalkPage(cd.g.pageName, cd.g.namespaceNumber)) &&
			// Undocumented setting
			!window.cdOnlyRunByFooterLink

		this.pageTypes.talk =
			mw.config.get('wgIsArticle') &&
			!this.queryIsNotTalkPage &&
			(this.queryIsTalkPage || this.articlePageOfTypeTalk)

		this.pageTypes.watchlist = this.isWatchlistPage()
		this.pageTypes.contributions = this.isContributionsPage()
		this.pageTypes.history = this.isHistoryPage()
		this.pageTypes.diff = /[?&]diff=[^&]/.test(location.search)
	}

	/**
	 * Check if the current page is of a specific type.
	 *
	 * @param {keyof Loader['pageTypes']} type
	 * @returns {boolean}
	 */
	isPageOfType(type) {
		return this.pageTypes[type]
	}

	/**
	 * Change the evaluation of whether the current page is of a specific type.
	 *
	 * @param {keyof Loader['pageTypes']} type
	 * @param {boolean} value
	 */
	setPageType(type, value) {
		this.pageTypes[type] = value
	}

	/**
	 * Check if the _article_ page (the one with `wgIsArticle` being true) of the current page is a
	 * talk page eligible for CD to run on.
	 *
	 * This is the case on edit, history pages, etc. However, the assessments of whether the page is
	 * eligible may be different on a history page and on an article page of the same title, since the
	 * page may contain elements with special classes that we can only access on the article page.
	 *
	 * @returns {boolean}
	 */
	isArticlePageOfTypeTalk() {
		return this.articlePageOfTypeTalk
	}

	/**
	 * Is the displayed revision the current (last known) revision of the page.
	 *
	 * @returns {boolean}
	 * @private
	 */
	isCurrentRevision() {
		// RevisionSlider may show a revision newer than the revision in wgCurRevisionId due to a bug
		// (when navigating forward, at least twice, from a revision older than the revision in
		// wgCurRevisionId after some revisions were added). Unfortunately, it doesn't update the
		// wgCurRevisionId value.
		return mw.config.get('wgRevisionId') >= mw.config.get('wgCurRevisionId')
	}

	/**
	 * Check if a page is probably a talk page. The namespace number is required.
	 *
	 * This function exists mostly because we can't be sure the {@link external:mediawiki.Title}
	 * module has loaded when the script has started executing (and can't use the {@link Page}
	 * constructor), and we need to make this check fast. So, in most cases,
	 * {@link Page#isProbablyTalkPage} should be used.
	 *
	 * @param {string} pageName
	 * @param {number} namespaceNumber
	 * @returns {boolean}
	 */
	isProbablyTalkPage(pageName, namespaceNumber) {
		return (
			(namespaceNumber % 2 === 1 ||
				this.pageWhitelistRegexp?.test(pageName) ||
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
				(!this.pageWhitelistRegexp && cd.config?.customTalkNamespaces.includes(namespaceNumber))) &&
			!this.pageBlacklistRegexp?.test(pageName)
		)
	}

	/**
	 * Check if the talk page initialization should run.
	 *
	 * @returns {boolean}
	 */
	shouldInitTalkPage() {
		return this.pageTypes.talk
	}

	/**
	 * Check if the comment links initialization should run.
	 *
	 * @returns {boolean}
	 */
	shouldInitCommentLinks() {
		return (
			this.pageTypes.watchlist ||
			this.pageTypes.contributions ||
			this.pageTypes.history ||
			this.pageTypes.diff ||
			this.articlePageOfTypeTalk ||
			// Instant Diffs script can be used on talk pages as well
			this.pageTypes.talk
		)
	}

	/**
	 * Set page types and initialize talk page or comment links page.
	 */
	async init() {
		this.setPageTypes()

		if (this.shouldInitTalkPage()) {
			await this.initTalkPage()
		}

		if (this.shouldInitCommentLinks()) {
			await this.initCommentLinks()
		}
	}

	/**
	 * Load the data required for the script to run on a talk page and execute the app function.
	 *
	 * @private
	 */
	async initTalkPage() {
		cd.debug.stopTimer('start')
		cd.debug.startTimer('load data')

		this.showBootingOverlay()

		sleep(15_000).then(() => {
			if (this.booting) {
				this.hideBootingOverlay()
				console.warn('The booting overlay stays for more than 15 seconds; removing it.')
			}
		})

		this.initCssValues()

		try {
			await Promise.all([
				this.maybeLoadModules(),
				this.loadApp(),
				this.loadStyles().then(() => {
					/*
						Additions of CSS set a stage for a future reflow which delays operations dependent on
						rendering, so we run them now, not after the requests are fulfilled, to save time. The
						overall order is like this:
						1. Make network requests (above).
						2. Run operations dependent on rendering, such as window.getComputedStyle() and jQuery's
						   .css() (below). Normally they would initiate a reflow, but, as we haven't changed the
						   layout or added CSS yet, there is nothing to update.
						3. Run operations that create prerequisites for a reflow, such as adding CSS (below).
						   Thanks to the fact that the network requests, if any, are already pending, we don't
						   waste time.
					*/
					this.addTalkPageCss()
				}),

				// Make some requests in advance if the API module is ready in order not to make 2 requests
				// sequentially. We don't make a `userinfo` request, because if there is more than one tab in
				// the background, this request is made and the execution stops at mw.loader.using, which
				// results in overriding the renewed visits setting of one tab by another tab (the visits are
				// loaded by one tab, then another tab, then written by one tab, then by another tab).
				mw.loader.getState('mediawiki.api') === 'ready'
					? this.getSiteDataPromise()
					: Promise.resolve(),

				// We are _not_ calling getUserInfo() here to avoid losing visit data updates from some pages
				// if several pages are opened simultaneously. In this situation, visits could be requested
				// for multiple pages; updated and then saved for each of them with losing the updates from
				// the rest.
			])

			await this.importApp()

			/**
			 * The page has been preprocessed (not parsed yet, but its type has been checked and some
			 * basic structures have been initialized).
			 *
			 * @event preprocessed
			 * @param {object} cd {@link convenientDiscussions} object.
			 * @global
			 */
			mw.hook('convenientDiscussions.preprocessed').fire(cd)

			this.app()
		} catch (error) {
			mw.notify(cd.s('error-loaddata'), { type: 'error' })
			console.error(error)
			this.hideBootingOverlay()
		}
	}

	/**
	 * _For internal use._ Load messages needed to parse and generate timestamps as well as some site
	 * data.
	 *
	 * @returns {Promise<any[]>} There should be at least one promise in the array.
	 */
	getSiteDataPromise() {
		this.siteDataPromise ??= this.getSiteData()

		return this.siteDataPromise
	}

	/**
	 * Load messages needed to parse and generate timestamps as well as some site data.
	 *
	 * @returns {Promise<any[]>} There should be at least one promise in the array.
	 * @private
	 */
	// eslint-disable-next-line max-lines-per-function
	getSiteData() {
		this.initFormats()

		const contentLanguageMessageNames = [
			'word-separator',
			'comma-separator',
			'colon-separator',
			'timezone-utc',
		].concat(
			// Message names for date tokens in content language
			...this.getUsedDateTokens(cd.g.timestampTools.content.dateFormat).map(
				(pattern) => dateTokenToMessageNames[pattern],
			),
		)

		const userLanguageMessageNames = [
			'parentheses',
			'parentheses-start',
			'parentheses-end',
			'word-separator',
			'comma-separator',
			'colon-separator',
			'nextdiff',
			'timezone-utc',
			'pagetitle',
		]
			.concat(
				cd.g.isDtInstalled
					? [
							'discussiontools-topicsubscription-button-subscribe',
							'discussiontools-topicsubscription-button-subscribe-tooltip',
							'discussiontools-topicsubscription-button-unsubscribe',
							'discussiontools-topicsubscription-button-unsubscribe-tooltip',
							'discussiontools-topicsubscription-notify-subscribed-title',
							'discussiontools-topicsubscription-notify-subscribed-body',
							'discussiontools-topicsubscription-notify-unsubscribed-title',
							'discussiontools-topicsubscription-notify-unsubscribed-body',
							'discussiontools-newtopicssubscription-button-subscribe-label',
							'discussiontools-newtopicssubscription-button-subscribe-tooltip',
							'discussiontools-newtopicssubscription-button-unsubscribe-label',
							'discussiontools-newtopicssubscription-button-unsubscribe-tooltip',
							'discussiontools-newtopicssubscription-notify-subscribed-title',
							'discussiontools-newtopicssubscription-notify-subscribed-body',
							'discussiontools-newtopicssubscription-notify-unsubscribed-title',
							'discussiontools-newtopicssubscription-notify-unsubscribed-body',
							'thanks-confirmation2',
							'checkuser-userinfocard-toggle-button-aria-label',
						]
					: [],
			)
			.concat(
				// Message names for date tokens in UI language
				...this.getUsedDateTokens(cd.g.timestampTools.user.dateFormat).map(
					(pattern) => dateTokenToMessageNames[pattern],
				),
			)

		const areLanguagesEqual = mw.config.get('wgContentLanguage') === mw.config.get('wgUserLanguage')
		if (areLanguagesEqual) {
			const userLanguageConfigMessages = /** @type {StringsByKey} */ ({})
			Object.keys(cd.config.messages)
				.filter((name) => userLanguageMessageNames.includes(name))
				.forEach((name) => {
					userLanguageConfigMessages[name] = cd.config.messages[name]
				})
			mw.messages.set(userLanguageConfigMessages)
		}

		const requestUserLanguageMessages = () =>
			splitIntoBatches(userLanguageMessageNames).map((nextNames) =>
				cd.getApi().loadMessagesIfMissing(nextNames),
			)

		// We need this object to pass it to the web worker.
		cd.g.contentLanguageMessages = {}

		const setContentLanguageMessages = (
			/** @type {{ [key: string]: string | undefined }} */ messages,
		) => {
			Object.keys(messages).forEach((name) => {
				if (messages[name] !== undefined) {
					mw.messages.set('(content)' + name, messages[name])
					cd.g.contentLanguageMessages[name] = messages[name]
				}
			})
		}

		const filterAndSetContentLanguageMessages = (/** @type {StringsByKey} */ messages) => {
			const contentLanguageMessages = /** @type {StringsByKey} */ ({})
			Object.keys(messages)
				.filter((name) => contentLanguageMessageNames.includes(name))
				.forEach((name) => {
					contentLanguageMessages[name] = messages[name]
				})
			setContentLanguageMessages(contentLanguageMessages)
		}
		filterAndSetContentLanguageMessages(cd.config.messages)

		cd.g.specialPageAliases = Object.entries({ ...cd.config.specialPageAliases }).reduce(
			(acc, [key, value]) => {
				acc[key] = typeof value === 'string' ? [value] : value

				return acc
			},
			/** @type {import('../../config/default').default['specialPageAliases']} */ ({}),
		)

		const content = cd.g.timestampTools.content
		content.timezone = cd.config.timezone ?? undefined

		const specialPages = ['Contributions', 'Diff', 'PermanentLink']

		// I hope we won't be scolded too much for making two message requests in parallel (if the user
		// and content language are different).
		return Promise.all(
			// eslint-disable-next-line unicorn/prefer-array-flat
			/** @type {JQuery.Promise<any>[]} */ ([])
				.concat(
					areLanguagesEqual
						? // We use splitIntoBatches() to request in parallel (see the note above), even though
							// .loadMessages() splits into batches automatically (but requests in sequence).
							splitIntoBatches(
								contentLanguageMessageNames.concat(userLanguageMessageNames).filter(unique),
							).map((nextNames) =>
								cd
									.getApi()
									.loadMessagesIfMissing(nextNames)
									.then(() => {
										filterAndSetContentLanguageMessages(mw.messages.get())
									}),
							)
						: [
								...splitIntoBatches(
									contentLanguageMessageNames.filter((name) => !cd.g.contentLanguageMessages[name]),
								).map((nextNames) =>
									cd
										.getApi()
										.getMessages(nextNames, {
											// cd.g.contentLanguage is not used here for the reasons described in
											// startup.js where it is declared.
											amlang: mw.config.get('wgContentLanguage'),
										})
										.then(setContentLanguageMessages),
								),
								...requestUserLanguageMessages(),
							],
				)
				.concat(
					specialPages.every(
						(page) => page in cd.g.specialPageAliases && cd.g.specialPageAliases[page].length,
					) && content.timezone
						? []
						: cd
								.getApi()
								.get({
									action: 'query',
									meta: 'siteinfo',
									siprop: ['specialpagealiases', 'general'],
								})
								.then((response) => {
									const specialPageAliases =
										/** @type {import('../utils-api').ApiResponseSiteInfoSpecialPageAliases[]} */ (
											response.query.specialpagealiases
										)
									specialPageAliases
										.filter((page) => specialPages.includes(page.realname))
										.forEach((page) => {
											cd.g.specialPageAliases[page.realname] = page.aliases.slice(
												0,
												page.aliases.indexOf(page.realname) + 1,
											)
										})

									content.timezone = response.query.general.timezone
								}),
				),
		)
	}

	/**
	 * Set the global variables related to date format.
	 *
	 * @private
	 */
	initFormats() {
		const getLanguageOrFallback = (/** @type {string} */ lang) =>
			cd.utils.getValidLanguageOrFallback(
				lang,
				(/** @type {string} */ l) => isKeyOf(l, dateFormats),
				languageFallbacks,
			)

		const contentLanguage = getLanguageOrFallback(mw.config.get('wgContentLanguage'))
		const userLanguage = getLanguageOrFallback(mw.config.get('wgUserLanguage'))

		cd.g.timestampTools.content.dateFormat = /** @type {StringsByKey} */ (dateFormats)[
			contentLanguage
		]
		cd.g.digits.content = mw.config.get('wgTranslateNumerals')
			? /** @type {StringsByKey} */ (digitsData)[contentLanguage]
			: undefined
		cd.g.timestampTools.user.dateFormat = /** @type {StringsByKey} */ (dateFormats)[userLanguage]
		cd.g.digits.user = mw.config.get('wgTranslateNumerals')
			? /** @type {StringsByKey} */ (digitsData)[userLanguage]
			: undefined
	}

	/**
	 * Get date tokens used in a format (to load only the needed tokens).
	 *
	 * @param {string} format
	 * @returns {('xg' | 'D' | 'l' | 'F' | 'M')[]}
	 * @private
	 * @author Bartosz Dziewoński <matma.rex@gmail.com>
	 * @license MIT
	 */
	getUsedDateTokens(format) {
		const tokens = /** @type {('xg' | 'D' | 'l' | 'F' | 'M')[]} */ ([])

		for (let p = 0; p < format.length; p++) {
			let code = format[p]
			if ((code === 'x' && p < format.length - 1) || (code === 'xk' && p < format.length - 1)) {
				code += format[++p]
			}

			if (['xg', 'D', 'l', 'F', 'M'].includes(code)) {
				tokens.push(/** @type {'xg' | 'D' | 'l' | 'F' | 'M'} */ (code))
			} else if (code === '\\' && p < format.length - 1) {
				++p
			}
		}

		return tokens
	}

	/**
	 * Load the main app script, preferably from disk cache.
	 *
	 * @returns {Promise<void>}
	 * @private
	 */
	async loadApp() {
		this.appRequest ??= (async () => {
			// In dev and single modes, use dynamic import to let Vite create a separate chunk. In
			// production, load from network.
			if (IS_DEV || IS_SINGLE) {
				return
			}

			this.appCode = await this.loadPreferablyFromDiskCache({
				domain: 'commons.wikimedia.org',
				pageName: `User:Jack who built the house/convenientDiscussions-main.js`,
				ttlInDays: 365,
				addCacheBuster: true,
				add: false,
			})
		})()

		return this.appRequest
	}

	/**
	 * Load the styles for the talk page functionality.
	 *
	 * @returns {Promise<void>}
	 * @private
	 */
	async loadStyles() {
		if (IS_SINGLE) {
			const styles = (await import('../styles.less?inline')).default
			mw.loader.addStyleTag(styles)

			return
		}

		if (IS_DEV) {
			await import('../styles.less')

			return
		}

		await this.loadPreferablyFromDiskCache({
			domain: 'commons.wikimedia.org',
			pageName: `User:Jack who built the house/convenientDiscussions.css`,
			ttlInDays: 365,
			addCacheBuster: true,
			ctype: 'text/css',
			add: true,
		})
	}

	/**
	 * Import the main app (i.e. create the main app script tag and add it to the page, making its
	 * exports available).
	 *
	 * @returns {Promise<void>}
	 * @private
	 */
	async importApp() {
		this.importAppRequest ??= (async () => {
			// In dev and single modes, use dynamic import to let Vite create a separate chunk. In
			// production, load from network.
			if (IS_DEV || IS_SINGLE) {
				await import('../app.js')
			} else if (this.appCode) {
				const scriptTag = document.createElement('script')
				scriptTag.innerHTML = this.appCode
				document.head.append(scriptTag)
			}
		})()

		return this.importAppRequest
	}

	/**
	 * Load a script or style using the following strategy:
	 * - If more than `ttlInDays` days have passed since caching, load from the server. E.g.
	 *   translations can be requested daily.
	 * - If `addCacheBuster` is `true`, load from server each time there is a new release (we "bust"
	 *   cache by adding a random string to the URL). This is for the main app and anything updated
	 *   together with it.
	 *
	 * @param {object} options
	 * @param {string} options.domain
	 * @param {string} options.pageName
	 * @param {number} options.ttlInDays
	 * @param {string} [options.ctype]
	 * @param {boolean} [options.addCacheBuster]
	 * @param {boolean} [options.add]
	 * @returns {Promise<string | undefined>}
	 */
	async loadPreferablyFromDiskCache({
		domain,
		pageName,
		ttlInDays,
		ctype = 'text/javascript',
		addCacheBuster = false,
		add = true,
	}) {
		if (IS_STAGING) {
			pageName = pageName.replace(/\.(js|css)$/, '.staging.$1')
		}

		const ttlInMs = ttlInDays * cd.g.msInDay
		const pageEncoded = encodeURIComponent(pageName)
		const cacheBusterOrNot = addCacheBuster ? '&' + CACHE_BUSTER : ''

		const apiResponse = await $.get(
			`https://${domain}/w/api.php?titles=${pageEncoded}&origin=*&format=json&formatversion=2&uselang=content&maxage=${ttlInMs}&smaxage=${ttlInMs}&action=query&prop=revisions|info&rvslots=main&rvprop=content&rvlimit=1${cacheBusterOrNot}`,
		)

		const apiPage = apiResponse.query.pages[0]
		if (apiPage.missing) {
			throw new Error(`Couldn't load ${pageName} from ${domain}`)
		}

		const content = apiPage.revisions[0].slots.main.content
		if (ctype === 'text/javascript' && apiPage.contentmodel === 'javascript') {
			if (add) {
				const scriptTag = document.createElement('script')
				scriptTag.innerHTML = content
				document.head.append(scriptTag)
			}

			return content
		} else if (ctype === 'text/css' && apiPage.contentmodel === 'css') {
			if (add) {
				mw.loader.addStyleTag(content)
			}

			return content
		}
	}

	/**
	 * Set some important skin-specific values to the global object.
	 *
	 * @private
	 */
	initCssValues() {
		cd.g.contentLineHeight = Number.parseFloat(this.$content.css('line-height'))
		cd.g.contentFontSize = Number.parseFloat(this.$content.css('font-size'))
		cd.g.defaultFontSize = Number.parseFloat($(document.documentElement).css('font-size'))
	}

	/**
	 * Set CSS for talk pages: set CSS variables, add static CSS.
	 *
	 * @private
	 */
	addTalkPageCss() {
		const contentBackgroundColor = $('#content').css('background-color') || 'rgba(0, 0, 0, 0)'
		const sidebarColor = cd.utils
			.skin$({
				'timeless': '#mw-content-container',
				'vector-2022': '.mw-page-container',
				'default': 'body',
			})
			.css('background-color')
		const metadataFontSize = Number.parseFloat(
			(cd.g.contentFontSize / cd.g.defaultFontSize).toFixed(7),
		)
		const sidebarTransparentColor = cd.utils.transparentize(sidebarColor)

		// `float: inline-start` is too new: it appeared in Chrome in October 2023.
		const floatContentStart = cd.g.contentDirection === 'ltr' ? 'left' : 'right'
		const floatContentEnd = cd.g.contentDirection === 'ltr' ? 'right' : 'left'
		const floatUserStart = cd.g.userDirection === 'ltr' ? 'left' : 'right'
		const floatUserEnd = cd.g.userDirection === 'ltr' ? 'right' : 'left'
		const gradientUserStart = cd.g.userDirection === 'ltr' ? 'to left' : 'to right'

		mw.loader.addStyleTag(`:root {
	--cd-comment-fallback-side-margin: ${cd.g.commentFallbackSideMargin}px;
	--cd-comment-marker-width: ${cd.g.commentMarkerWidth}px;
	--cd-thread-line-side-padding: ${cd.g.threadLineSidePadding}px;
	--cd-content-background-color: ${contentBackgroundColor};
	--cd-content-font-size: ${cd.g.contentFontSize}px;
	--cd-content-metadata-font-size: ${metadataFontSize}rem;
	--cd-sidebar-color: ${sidebarColor};
	--cd-sidebar-transparent-color: ${sidebarTransparentColor};
	--cd-direction-user: ${cd.g.userDirection};
	--cd-direction-content: ${cd.g.contentDirection};
	--cd-float-user-start: ${floatUserStart};
	--cd-float-user-end: ${floatUserEnd};
	--cd-float-content-start: ${floatContentStart};
	--cd-float-content-end: ${floatContentEnd};
	--cd-gradient-user-start: ${gradientUserStart};
	--cd-pixel-deviation-ratio: ${cd.g.pixelDeviationRatio};
	--cd-pixel-deviation-ratio-for-1px: ${cd.g.pixelDeviationRatioFor1px};
}`)
		if (cd.config.outdentClass) {
			mw.loader.addStyleTag(`.cd-parsed .${cd.config.outdentClass} {
	margin-top: 0.5em;
	margin-bottom: 0.5em;
}

.cd-reformattedComments .${cd.config.outdentClass} {
	margin-top: 0.75em;
	margin-bottom: 0.75em;
}`)
		}

		mw.util.addCSS(globalCss)
	}

	/**
	 * Initialize comment links on special pages as well sa talk pages and execute the addCommentLinks
	 * function.
	 *
	 * @returns {Promise<void>}
	 * @private
	 */
	async initCommentLinks() {
		// Make some requests in advance if the API module is ready in order not to make 2 requests
		// sequentially.
		if (mw.loader.getState('mediawiki.api') === 'ready') {
			this.getSiteDataPromise()

			// Loading user info on diff pages could lead to problems with saving visits when many pages
			// are opened, but not yet focused, simultaneously.
			if (!this.pageTypes.talk) {
				getUserInfo(true).catch((/** @type {unknown} */ error) => {
					console.warn(error)
				})
			}
		}

		try {
			await Promise.all([this.maybeLoadModules(), this.loadApp()])

			// See the comment above: "Additions of CSS...".
			mw.util.addCSS(globalCss)
			mw.util.addCSS(addCommentLinksCss)

			await this.importApp()
			this.addCommentLinks()
		} catch (error) {
			mw.notify(cd.s('error-loaddata'), { type: 'error' })
			console.error(error)
		}
	}

	/**
	 * Check whether the current page is a watchlist or recent changes page.
	 *
	 * @returns {boolean}
	 * @private
	 */
	isWatchlistPage() {
		return ['Recentchanges', 'Watchlist'].includes(
			mw.config.get('wgCanonicalSpecialPageName') || '',
		)
	}

	/**
	 * Check whether the current page is a contributions page.
	 *
	 * @returns {boolean}
	 * @private
	 */
	isContributionsPage() {
		return mw.config.get('wgCanonicalSpecialPageName') === 'Contributions'
	}

	/**
	 * Check whether the current page is a history page.
	 *
	 * @returns {boolean}
	 * @private
	 */
	isHistoryPage() {
		return (
			mw.config.get('wgAction') === 'history' &&
			this.isProbablyTalkPage(cd.g.pageName, cd.g.namespaceNumber)
		)
	}

	/**
	 * Show the booting overlay (a logo in the corner of the page).
	 */
	showBootingOverlay() {
		this.$bootingOverlay ??= $('<div>')
			.addClass('cd-bootingOverlay')
			.append(
				$('<div>')
					.addClass('cd-bootingOverlay-logo cd-icon')
					.append(
						$('<div>')
							.addClass('cd-bootingOverlay-logo-partBackground')
							.attr('title', cd.s('script-name')),
						cd.utils
							.createSvg(55, 55, 50, 50)
							.html(
								`<path fill-rule="evenodd" clip-rule="evenodd" d="M42.5 10H45C46.3261 10 47.5979 10.5268 48.5355 11.4645C49.4732 12.4021 50 13.6739 50 15V50L40 40H15C13.6739 40 12.4021 39.4732 11.4645 38.5355C10.5268 37.5979 10 36.3261 10 35V32.5H37.5C38.8261 32.5 40.0979 31.9732 41.0355 31.0355C41.9732 30.0979 42.5 28.8261 42.5 27.5V10ZM5 3.05176e-05H35C36.3261 3.05176e-05 37.5979 0.526815 38.5355 1.4645C39.4732 2.40218 40 3.67395 40 5.00003V25C40 26.3261 39.4732 27.5979 38.5355 28.5355C37.5979 29.4732 36.3261 30 35 30H10L0 40V5.00003C0 3.67395 0.526784 2.40218 1.46447 1.4645C2.40215 0.526815 3.67392 3.05176e-05 5 3.05176e-05ZM19.8 23C14.58 23 10.14 21.66 8.5 17H31.1C29.46 21.66 25.02 23 19.8 23ZM13.4667 7.50561C12.9734 7.17597 12.3933 7.00002 11.8 7.00002C11.0043 7.00002 10.2413 7.31609 9.6787 7.8787C9.11607 8.44131 8.8 9.20437 8.8 10C8.8 10.5934 8.97595 11.1734 9.30559 11.6667C9.6352 12.1601 10.1038 12.5446 10.6519 12.7717C11.2001 12.9987 11.8033 13.0581 12.3853 12.9424C12.9672 12.8266 13.5018 12.5409 13.9213 12.1213C14.3409 11.7018 14.6266 11.1672 14.7424 10.5853C14.8581 10.0033 14.7987 9.40015 14.5716 8.85197C14.3446 8.30379 13.9601 7.83526 13.4667 7.50561ZM27.8 7.00002C28.3933 7.00002 28.9734 7.17597 29.4667 7.50561C29.9601 7.83526 30.3446 8.30379 30.5716 8.85197C30.7987 9.40015 30.8581 10.0033 30.7424 10.5853C30.6266 11.1672 30.3409 11.7018 29.9213 12.1213C29.5018 12.5409 28.9672 12.8266 28.3853 12.9424C27.8033 13.0581 27.2001 12.9987 26.6519 12.7717C26.1038 12.5446 25.6352 12.1601 25.3056 11.6667C24.9759 11.1734 24.8 10.5934 24.8 10C24.8 9.20437 25.1161 8.44131 25.6787 7.8787C26.2413 7.31609 27.0043 7.00002 27.8 7.00002Z" />`,
							),
					),
			)
			.appendTo(document.body)

		this.$bootingOverlay.show()
	}

	/**
	 * Hide the booting overlay.
	 */
	hideBootingOverlay() {
		if (!this.$bootingOverlay || window.cdShowLoadingOverlay === false) return

		this.$bootingOverlay.hide()
	}

	/**
	 * Is there any kind of a page overlay present, like the OOUI/Codex modal overlay or CD loading
	 * overlay. This runs very frequently.
	 *
	 * @returns {boolean}
	 */
	isPageOverlayOn() {
		return this.$bootingOverlay?.[0].inert || this.booting
	}

	/**
	 * Set whether the page is booting.
	 *
	 * @param {boolean} value
	 */
	setBooting(value) {
		this.booting = value
	}

	/**
	 * @import {default as BootProcess} from '../BootProcess.js'
	 */

	/**
	 * Is the page booting. The {@link BootProcess} may not be running yet.
	 *
	 * @returns {boolean}
	 */
	isBooting() {
		return this.booting
	}
}

// Export a singleton instance. This is defensive in case the module is loaded multiple times in
// non-standard environments.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
if (!cd.loader) {
	cd.loader = new Loader()
}

export { Loader }
