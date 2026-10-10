/**
 * Module that populates the {@link convenientDiscussions} object. It is run in the window context
 * and is passed partially to the worker context.
 *
 * @module convenientDiscussions
 */

import { getQueryParamBooleanValue, underlinesToSpaces } from '../shared/utils-general'

import './convenientDiscussions.debug'
import './convenientDiscussions.loader'
import './convenientDiscussions.utils'
import { createBaseGlobals } from './baseGlobals'
import cd from './cd'

const mwStringsCache = /** @type {StringsByKey} */ ({})
/** @type {boolean | undefined} */
let isQqxMode

const serverName = mw.config.get('wgServerName')

// For historical reasons, ru.wikipedia.org has 'cd'.
const localOptionsPrefix = serverName === 'ru.wikipedia.org' ? 'cd' : 'convenientDiscussions'

// For historical reasons, ru.wikipedia.org has 'watchedTopics'.
const subscriptionsOptionNameEnding =
	serverName === 'ru.wikipedia.org' ? 'watchedTopics' : 'watchedSections'

let server = mw.config.get('wgServer')
if (server.startsWith('//')) {
	server = location.protocol + server
}
const bodyClassList = document.body.classList

const dpr = window.devicePixelRatio

// The divisor steps through 1, 5/3, 2, 8/3, 3, 11/3, 4, … — every third point on the 1/3 grid
// (where the numerator ≡ 1 mod 3) is skipped, matching physical-pixel boundaries in the UI. We
// round dpr down to the nearest such point, with min 1.
const dprX3Floored = Math.floor(dpr * 3)

const convenientDiscussionsWindow = {
	/**
	 * @type {{
	 *   [key: string]: OO.ui.WindowManager;
	 * }}
	 * @private
	 */
	windowManagers: {},

	/** @type {mw.Api | undefined} */
	mwApi: undefined,

	/**
	 * @typedef {object} SOptions
	 * @property {boolean} [parse=false] Whether the message should be returned in a parsed form.
	 */

	/**
	 * @typedef {SOptions | import('types-mediawiki/mw/user').User | import('../User').default | undefined} SLastArg
	 */

	/**
	 * @typedef {import('../User').default} User
	 */

	/**
	 * Get a language string.
	 *
	 * @param {string} name String name.
	 * @param {...(string | undefined | SLastArg)} args String parameters (substituted strings,
	 *   also {@link User} objects for use in `{{gender:}}`). The last parameter can be an object that
	 *   can have a boolean property `parse` (should the message be returned in a parsed form). In the
	 *   `parse` form, wikilinks are replaced with HTML tags, the code is sanitized. Use this for
	 *   strings that have their raw HTML inserted into the page.
	 * @returns {string}
	 * @memberof convenientDiscussions
	 */
	s(name, ...args) {
		const fullName = `convenient-discussions-${name}`
		let options = /** @type {SOptions} */ ({})
		const lastParam = args.at(-1)

		// lastParam.options can be a `mw.user`-like object to provide to {{gender:}}
		if (typeof lastParam === 'object' && !('options' in lastParam)) {
			options = lastParam
			args.splice(-1)
		}
		const params = /** @type {string[]} */ (args)

		isQqxMode ??= /[?&]uselang=qqx(?=&|$)/.test(location.search)
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (!isQqxMode && mw.messages.get(fullName) !== null) {
			return mw.message(fullName, ...params)[options.parse ? 'parse' : 'text']()
		}
		const paramsString = params.length ? `: ${params.join(', ')}` : ''

		return `(${fullName}${paramsString})`
	},

	/**
	 * Get a language string in the "parse" format. Wikilinks are replaced with HTML tags, the code is
	 * sanitized. Use this for strings that have their raw HTML inserted into the page.
	 *
	 * @param {string} name String name.
	 * @param {...*} params String parameters (substituted strings, also
	 *   {@link module:userRegistry.User User} objects for use in `{{gender:}}`).
	 * @returns {string}
	 * @memberof convenientDiscussions
	 */
	sParse(name, ...params) {
		if (params.some((param) => /[<>]/.test(param))) {
			// mw.message().parse() escapes tags in parameters - work around that.
			mw.messages.set('convenient-discussions-parsehack', cd.s(name, ...params))

			return mw.message('convenient-discussions-parsehack').parse()
		}

		return cd.s(name, ...params, { parse: true })
	},

	/**
	 * Prepend the script name to an error message string. Uses the appropriate word separator for the
	 * language.
	 *
	 * @param {string} message Error message string.
	 * @returns {string}
	 * @memberof convenientDiscussions
	 */
	prependScriptName(message) {
		return cd.s('script-name') + cd.mws('colon-separator') + message
	},

	/**
	 * A foolproof method to access MediaWiki messages intended to be used instead of
	 * {@link https://doc.wikimedia.org/mediawiki-core/master/js/mw.html#.msg mw.msg()} to eliminate
	 * any possibility of an XSS injection. By programmer's mistake some `mw.msg()` value could be
	 * inserted into a page in a raw HTML form. To prevent this, this function should be used, so if
	 * the message contains an injection (for example, brought from Translatewiki or inserted by a
	 * user who doesn't have the `editsitejs` right but does have the `editinterface` right), the
	 * function would sanitize the value.
	 *
	 * @param {string} name String name.
	 * @param {...*} params String parameters (substituted strings, also
	 *   {@link module:userRegistry.User User} objects for use in {{gender:}}). The last parameter can
	 *   be an object that can have a string property `language`. If `language` is `'content'`, the
	 *   returned message will be in the content langage (not the interface language).
	 * @returns {string}
	 * @memberof convenientDiscussions
	 */
	mws(name, ...params) {
		let options
		const lastParam = params.at(-1)
		if (typeof lastParam === 'object') {
			options = lastParam
			params.splice(-1)
		}
		if (options?.language === 'content') {
			name = '(content)' + name
		}
		if (!params.length && mwStringsCache[name]) {
			return mwStringsCache[name]
		}

		const message =
			/^(discussiontools|visualeditor)-/.test(name) && !mw.messages.exists(name)
				? cd.sParse(name.slice(name.indexOf('-') + 1))
				: mw.message(name, ...params).parse()
		if (!params.length && !message.startsWith('⧼')) {
			// Use cache since in some places a message could be requested very frequently. Don't cache
			// missing messages (they can come from dialogs opened with a network error, like
			// UploadDialog; messages can still be accessed for some silly reason).
			mwStringsCache[name] = message
		}

		return message
	},

	/**
	 * Get a
	 * {@link https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.Api mw.Api} instance.
	 *
	 * @param {mw.Api.Options} [config]
	 * @returns {mw.Api}
	 */
	getApi(config) {
		if (config) {
			return new mw.Api({ ...cd.getApiConfig(), ...config })
		}

		this.mwApi ??= new mw.Api(cd.getApiConfig())

		return this.mwApi
	},

	getApiConfig() {
		return {
			parameters: {
				formatversion: 2,
				uselang: cd.g.userLanguage,
			},
			ajax: {
				headers: {
					'Api-User-Agent': 'c:User:Jack who built the house/Convenient Discussions',
				},
			},
		}
	},

	/**
	 * Create an OOUI window manager or return an existing one.
	 *
	 * @param {string} [name] Name of the window manager. We may need more than one if we,
	 *   for some reason, want to have more than one window open at any moment.
	 * @returns {OO.ui.WindowManager}
	 */
	getWindowManager(name = 'default') {
		if (!(name in this.windowManagers)) {
			const windowManager = new OO.ui.WindowManager()
			windowManager.on('closing', async (_, closed) => {
				// We don't have windows that can be reused.
				await closed
				windowManager.clearWindows()
			})

			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			$(OO.ui.getTeleportTarget?.() || document.body).append(windowManager.$element)
			this.windowManagers[name] = windowManager
		}

		return this.windowManagers[name]
	},

	g: {},

	/** @type {{ [key: string]: any }} */
	tests: {},
}

/**
 * Collection of properties accessible from anywhere in the script that are not grouped in any other
 * way. This is an incomplete list. "g" is for "global".
 *
 * @namespace g
 * @memberof convenientDiscussions
 */
const globalProperties = {
	// These are properties known from the beginning. We assume that there is no point to make them
	// subject to change by site administrators although this may be disputable. Some of them are
	// extensible in the configuration file (such as noHighlightClasses).

	debug: getQueryParamBooleanValue('cddebug') ?? IS_DEV,

	isArchive: getQueryParamBooleanValue('cdarchive'),

	/**
	 * Whether the script is running in development mode.
	 *
	 * @memberof convenientDiscussions.g
	 */
	isDev: IS_DEV,

	/**
	 * Whether the script is running in single-file mode.
	 *
	 * @memberof convenientDiscussions.g
	 */
	isSingle: IS_SINGLE,

	/**
	 * Left and right margins of comment layers used as a fallback (when a comment is placed
	 * somewhere where we don't know how to position the layers).
	 *
	 * @memberof convenientDiscussions.g
	 */
	commentFallbackSideMargin: /** @type {const} */ (7),

	/**
	 * Left and right padding of thread lines.
	 *
	 * @memberof convenientDiscussions.g
	 */
	threadLineSidePadding: /** @type {const} */ (5),

	/**
	 * Width (thickness) of comment markers and thread lines when you hover over them.
	 *
	 * @memberof convenientDiscussions.g
	 */
	commentMarkerWidth: /** @type {const} */ (3),

	// Some users increase the font size (zoom), which leads to some short distances jumping between 3
	// and 4 physical pixels and similar. With the help of pixelDeviationRatio, we can make all widths
	// look the same by using a variable that stores deviation from standard values. Also unround
	// device pixel ratios (like 1.75) may have the same effect (not sure; need to confirm).
	pixelDeviationRatio:
		dpr / Math.max((dprX3Floored % 3 === 1 ? dprX3Floored - 1 : dprX3Floored) / 3, 1),

	pixelDeviationRatioFor1px: dpr / Math.max(Math.floor(dpr), 1),

	...createBaseGlobals(),

	settingsOptionName: /** @type {const} */ ('userjs-convenientDiscussions-settings'),
	localSettingsOptionName: /** @type {const} */ (`userjs-${localOptionsPrefix}-localSettings`),
	visitsOptionName: /** @type {const} */ (`userjs-${localOptionsPrefix}-visits`),
	subscriptionsOptionName: /** @type {const} */ (
		`userjs-${localOptionsPrefix}-${subscriptionsOptionNameEnding}`
	),
	server,
	serverName,
	pageName: underlinesToSpaces(mw.config.get('wgPageName')),
	pageTitle: mw.config.get('wgTitle'),
	namespaceNumber: mw.config.get('wgNamespaceNumber'),

	// Check for mw.user.isNamed() to treat temporary accounts as unregistered (we can't save
	// options for them anyway). `<unregistered>` is a workaround for anonymous users (there are
	// such!).
	userName:
		((!('isNamed' in mw.user) || mw.user.isNamed()) && mw.config.get('wgUserName')) ||
		'<unregistered>',

	contentDirection: /** @type {Direction} */ (
		bodyClassList.contains('sitedir-rtl') ? 'rtl' : 'ltr'
	),
	userDirection: /** @type {Direction} */ (bodyClassList.contains('rtl') ? 'rtl' : 'ltr'),
	skin: mw.config.get('skin'),

	// Quite a rough check for mobile browsers, a mix of what is advised at
	// https://stackoverflow.com/a/24600597 (sends to
	// https://developer.mozilla.org/en-US/docs/Browser_detection_using_the_user_agent) and
	// https://stackoverflow.com/a/14301832.
	isMobileClient:
		// eslint-disable-next-line @typescript-eslint/no-deprecated
		/Mobi|Android/i.test(navigator.userAgent) || typeof window.orientation !== 'undefined',

	isDtInstalled: Boolean(mw.loader.getState('ext.discussionTools.init')),
	isDtReplyToolEnabled: bodyClassList.contains('ext-discussiontools-replytool-enabled'),
	isDtNewTopicToolEnabled: bodyClassList.contains('ext-discussiontools-newtopictool-enabled'),
	isDtTopicSubscriptionEnabled: bodyClassList.contains(
		'ext-discussiontools-topicsubscription-enabled',
	),
	isDtVisualEnhancementsEnabled: bodyClassList.contains(
		'ext-discussiontools-visualenhancements-enabled',
	),
	isCodeMirror6Installed: Boolean(
		// We check for ext.CodeMirror.modes as well because otherwise it can be CodeMirror v5 which we
		// won't support
		mw.loader.getState('ext.CodeMirror.WikiEditor') && mw.loader.getState('ext.CodeMirror.modes'),
	),

	isParsoidUsed: $('#mw-content-text > .mw-parser-output')
		.contents()
		.get()
		// NB: not _our_ Comment, the global one
		.filter((node) => node instanceof window.Comment)
		.some((c) => c.textContent.trim().startsWith('Parsoid')),
}

// This is defensive in case the module is loaded multiple times.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
if (!('g' in cd)) {
	Object.assign(cd, convenientDiscussionsWindow)
	// @ts-ignore
	Object.assign(cd.g, globalProperties)

	// @ts-ignore
	if (cd.g.debug) {
		window.cd = cd
	}
}

export { convenientDiscussionsWindow, globalProperties }
