/**
 * Startup/loader entry point.
 *
 * @module startup
 */

// Import polyfills for a bunch of ES2022+ features
import '../shared/polyfills'

import './convenientDiscussions'
import '../../dist/convenientDiscussions-i18n/en'

import defaultConfig from '../../config/default'
import configUrls from '../../config/urls.json'
import i18nList from '../../data/i18nList.json'
import languageFallbacks from '../../data/languageFallbacks.json'
import { unique } from '../shared/utils-general'

import cd from './cd'

// Dummy comment to prevent Prettier from killing the empty line
// eslint-disable-next-line unicorn/prefer-top-level-await
;(async () => {
	try {
		await bootstrap()
		$(start)
	} catch (error) {
		if (error instanceof Error && error.cause) {
			console.error(error.cause)
		}
	}
})()

/**
 * The function that is called first.
 *
 * @fires started
 */
async function bootstrap() {
	if (cd.isRunning) {
		console.warn('One instance of Convenient Discussions is already running.')

		throw new Error('One instance of Convenient Discussions is already running.')
	}

	/**
	 * Is the script running.
	 *
	 * @name isRunning
	 * @type {boolean}
	 * @memberof convenientDiscussions
	 */
	cd.isRunning = true

	if (
		mw.config.get('wgMFMode') ||
		/[?&]cdenable=(0|false|no|n)(?=&|$)/.test(location.search) ||
		mw.config.get('wgPageContentModel') !== 'wikitext' ||
		// Liquid Threads; for example,
		// https://en.wiktionary.org/wiki/MediaWiki_talk:Gadget-NewEntryWizard.js/LQT_Archive
		$('.lqt-talkpage').length ||
		mw.config.get('wgIsMainPage')
	) {
		throw new Error("Convenient Discussions can't run on this page.")
	}

	cd.debug.init()
	cd.debug.startTimer('total time')
	cd.debug.startTimer('bootstrap')

	/**
	 * The script has started.
	 *
	 * @event started
	 * @param {object} cd {@link convenientDiscussions} object.
	 * @global
	 */
	mw.hook('convenientDiscussions.started').fire(cd)

	setEssentials()
	cd.loader.maybeLoadTalkPageModules()
	cd.loader.maybeLoadCommentLinksModules()

	try {
		await Promise.all([
			/** @type {any} */ (cd).config ? Promise.resolve() : getConfig(),
			getStringsPromise(),
		])
	} catch (error) {
		console.error(error)

		throw new Error(`Couldn't load config and/or strings.`, { cause: error })
	}

	cd.debug.stopTimer('bootstrap')
}

/**
 * Replace HTML entities with their corresponding characters.
 *
 * @param {string} string
 * @returns {string}
 */
function replaceEntities(string) {
	return string
		.replace(/&nbsp;/g, '\u00A0')
		.replace(/&#32;/g, ' ')
		.replace(/&rlm;/g, '\u200F')
		.replace(/&lrm;/g, '\u200E')
}

/**
 * Load the i18n file for the single language code. This function shouldn't run or be present in
 * production mode.
 *
 * @param {string} lang
 */
async function loadSingleLangInDevMode(lang) {
	const langModule = await import(/* @vite-ignore */ `../../i18n/${lang}.json`)
	const langObj = langModule.default
	Object.keys(langObj)
		.filter((name) => typeof langObj[name] === 'string')
		.forEach((name) => {
			langObj[name] = replaceEntities(langObj[name])
		})
	cd.i18n[lang] = langObj

	if (lang !== 'en') {
		const dayjsLang = lang.replace(/^zh-hans$/, 'zh-cn').replace(/^zh-hant$/, 'zh-tw')
		const dayjsModule = await import(
			/* @vite-ignore */ `../../node_modules/dayjs/esm/locale/${dayjsLang}.js`
		)
		langObj.dayjsLocale = dayjsModule.default

		const dateFnsLang = dayjsLang.replace(/-.+$/, (s) => s.toUpperCase())
		const dateFnsModule = await import(
			/* @vite-ignore */ `../../node_modules/date-fns/locale/${dateFnsLang}.js`
		)
		langObj.dateFnsLocale = dateFnsModule.default || dateFnsModule[dateFnsLang.replace(/-/g, '')]
	}
}

/**
 * Set some essential stuff:
 * - Language properties of the global object, taking fallback languages into account
 * - Page types
 * - Merge config with the default config IF it's already available
 */
function setEssentials() {
	const getLanguageOrFallback = (/** @type {string} */ lang) =>
		cd.utils.getValidLanguageOrFallback(lang, (l) => i18nList.includes(l), languageFallbacks)

	cd.g.userLanguage = getLanguageOrFallback(mw.config.get('wgUserLanguage'))

	// Should we use a fallback for the content language? Maybe, but in case of MediaWiki messages
	// used for signature parsing we have to use the real content language (see init.loadSiteData()).
	// As a result, we use cd.g.contentLanguage only for the script's own messages, not the native
	// MediaWiki messages.
	cd.g.contentLanguage = getLanguageOrFallback(mw.config.get('wgContentLanguage'))

	if ('config' in cd) {
		makeSureConfigIsSet()
	}

	cd.loader.setPageTypes()
}

/**
 * Load and execute the configuration script if available.
 *
 * @returns {Promise<void>}
 */
function getConfig() {
	return new Promise((resolve, reject) => {
		let key = mw.config.get('wgServerName')
		if (IS_STAGING) {
			key += '.staging'
		}
		const configUrl =
			/** @type {StringsByKey} */ (configUrls)[key] ||
			/** @type {StringsByKey} */ (configUrls)[mw.config.get('wgServerName')]
		if (configUrl) {
			const rejectWithMsg = (/** @type {unknown} */ error) => {
				reject(
					new Error(`Convenient Discussions can't run: couldn't load the configuration.`, {
						cause: error,
					}),
				)
			}

			const [, gadgetName] = configUrl.match(/modules=ext.gadget.([^?&]+)/) || []
			if (gadgetName && mw.user.options.get(`gadget-${gadgetName}`)) {
				// A gadget is enabled on the wiki, and it should be loaded and executed without any
				// additional requests; we just wait until it happens.
				mw.loader.using(`ext.gadget.${gadgetName}`).then(() => {
					resolve()
				})

				return
			}
			mw.loader.getScript(configUrl).then(() => {
				resolve()
			}, rejectWithMsg)
		} else {
			resolve()
		}
	})
}

/**
 * Get the promise that resolves when the language strings are ready. If the strings are already
 * available, the promise resolves immediately.
 *
 * @returns {Promise<any[] | void>}
 */
export function getStringsPromise() {
	return cd.g.userLanguage === mw.config.get('wgUserLanguage') &&
		cd.g.contentLanguage === mw.config.get('wgContentLanguage')
		? // If no language fallbacks are employed, we can do without requesting additional i18ns.
			// cd.getStringsPromise may be set in the configuration file.
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			cd.g.userLanguage in cd.i18n
			? Promise.resolve()
			: cd.getStringsPromise || getStrings()
		: getStrings()
}

/**
 * Load and add localization strings to the {@link module:cd.i18n} object. Use fallback languages
 * if default languages are unavailable.
 *
 * @returns {Promise<any[] | void>}
 */
async function getStrings() {
	// We assume it's OK to fall back to English if the translation is unavailable for any reason.
	return Promise.all(
		[cd.g.userLanguage, cd.g.contentLanguage]
			.filter(unique)
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			.filter((lang) => lang !== 'en' && (!cd.i18n || !(lang in cd.i18n)))
			.map((lang) => {
				if (IS_DEV) {
					return loadSingleLangInDevMode(lang)
				}

				return cd.loader.loadPreferablyFromDiskCache({
					domain: 'commons.wikimedia.org',
					pageName: `User:Jack who built the house/convenientDiscussions-i18n/${lang}.js`,

					// Load every hour until things settle down after a release. TODO: Replace with 1 after
					// April 30, 2026
					ttlInDays: 0.0417,
				})
			}),
	)
}

/**
 * Function executed after the script has been bootstrapped; config and localization strings are
 * ready. It can run a second time when called from maybeAddFooterSwitcher().
 *
 * @fires preprocessed
 */
function start() {
	cd.debug.startTimer('start')

	// MAIN TASKS

	makeSureConfigIsSet()
	makeSureStringsAreSet()
	cd.loader.init()

	// ADDITIONAL TWEAKS

	if (mw.config.get('wgIsArticle')) {
		addFooterSwitcher()
	}
	tweakAddTopicButton()
	addCommentLinksIfOnSpecialSearch()

	// TRIVIA

	if (!cd.loader.isBooting()) {
		cd.debug.stopTimer('start')
	}
}

/**
 * Merge the loaded configuration with the default configuration if not already.
 */
function makeSureConfigIsSet() {
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (cd.config?._mergedWithDefault) return

	cd.config = { ...defaultConfig, ...cd.config, _mergedWithDefault: true }
}

/**
 * Add the script's strings to
 * {@link https://doc.wikimedia.org/mediawiki-core/master/js/mw.html#.messages mw.messages} if not
 * already.
 */
function makeSureStringsAreSet() {
	if (Object.keys(mw.messages.get()).some((key) => key.startsWith('convenient-discussions-')))
		return

	// Strings that should be displayed in the site language, not the user language.
	const contentStrings = ['es-', 'cf-autocomplete-commentlinktext', 'move-']

	const strings = Object.keys(cd.i18n.en).reduce((acc, name) => {
		const lang = contentStrings.some(
			(contentStringName) =>
				name === contentStringName ||
				(contentStringName.endsWith('-') && name.startsWith(contentStringName)),
		)
			? cd.g.contentLanguage
			: cd.g.userLanguage
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		acc[name] = cd.i18n[lang]?.[name] ?? cd.i18n.en[name]

		return acc
	}, /** @type {StringsByKey} */ ({}))

	Object.keys(strings).forEach((name) => {
		mw.messages.set(`convenient-discussions-${name}`, strings[name])
	})
}

/**
 * Add a footer link to enable/disable CD on this page once.
 */
function addFooterSwitcher() {
	const enable = !cd.loader.isPageOfType('talk')
	const url = new URL(location.href)
	url.searchParams.set('cdtalkpage', enable ? '1' : '0')
	const $li = $('<li>').attr('id', 'footer-togglecd')
	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const $a = $('<a>')
		.attr('href', url.toString())
		.addClass('noprint')
		.text(cd.s(enable ? 'footer-runcd' : 'footer-dontruncd'))
		.appendTo($li)
	if (enable) {
		$a.on('click', (event) => {
			if (event.ctrlKey || event.shiftKey || event.metaKey) return

			event.preventDefault()
			history.pushState(history.state, '', url.toString())
			$li.remove()
			start()
		})
	}
	cd.utils.getFooter().append($li)
}

/**
 * Change the destination of the "Add topic" button to redirect topic creation to the script's form.
 * This is not done on `action=view` pages to make sure the user can open the classic form in a new
 * tab. The exception is when the new topic tool is enabled with the "Offer to add a new topic"
 * setting: in that case, the classic form doesn't open anyway. So we add `dtenable=0` to the
 * button.
 */
function tweakAddTopicButton() {
	const dtCreatePage =
		cd.g.isDtNewTopicToolEnabled && mw.user.options.get('discussiontools-newtopictool-createpage')
	if (
		!cd.loader.isArticlePageOfTypeTalk() ||
		(mw.config.get('wgAction') === 'view' && !dtCreatePage)
	)
		return

	const $button = $('#ca-addsection a')
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	const href = /** @type {HTMLAnchorElement | undefined} */ ($button[0])?.href
	if (href) {
		const url = new URL(href)
		if (dtCreatePage) {
			url.searchParams.set('dtenable', '0')
		}
		if (!dtCreatePage || mw.config.get('wgAction') !== 'view') {
			url.searchParams.delete('action')
			url.searchParams.delete('section')
			url.searchParams.set('cdaddtopic', '1')
		}
		$button.attr('href', url.toString())
	}
}

/**
 * _For internal use._ When on the Special:Search page, searching for a comment after choosing that
 * option from the "Couldn't find the comment" message, add comment links to titles.
 */
function addCommentLinksIfOnSpecialSearch() {
	if (mw.config.get('wgCanonicalSpecialPageName') !== 'Search') return

	const [, commentId] = location.search.match(/[?&]cdcomment=([^&]+)(?:&|$)/) || []
	if (commentId) {
		mw.loader.using('mediawiki.api').then(async () => {
			await cd.loader.getSiteDataPromise()
			$('.mw-search-result-heading').each((_, el) => {
				const originalHref = $(el).find('a').first().attr('href')
				if (!originalHref) return

				$(el).append(
					' ',
					$('<span>')
						.addClass('cd-searchCommentLink')
						.append(
							document.createTextNode(cd.mws('parentheses-start')),
							$('<a>')
								.attr('href', `${originalHref}#${commentId}`)
								.text(cd.s('deadanchor-search-gotocomment')),
							document.createTextNode(cd.mws('parentheses-end')),
						),
				)
			})
		}, console.error)
	}
}
