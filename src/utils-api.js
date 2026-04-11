/**
 * Wrappers for MediaWiki action API requests ({@link https://www.mediawiki.org/wiki/API:Main_page})
 * together with some user options handling functions. See also the {@link Page} class methods for
 * API methods related to specific titles.
 *
 * @module utilsApi
 */

import TextMasker from './TextMasker'
import cd from './loader/cd'
import CdError from './shared/CdError'
import { unique } from './shared/utils-general'
import { brsToNewlines } from './shared/utils-wikitext'
import userRegistry from './userRegistry'

/**
 * @typedef {object} ApiResponseParseContent
 * @property {string} text Text for the page.
 * @property {boolean} hidetoc Hide the table of contents.
 * @property {string} subtitle HTML for the page's subtitle (it comes with last comment data from
 *   DT).
 * @property {string} categorieshtml HTML for the page's categories.
 * @property {string} [parsedsummary] HTML for the summary that was supplied.
 * @property {AnyByKey[]} sections Section data for the page.
 * @property {number} revid
 * @property {string[]} modules
 * @property {string[]} modulestyles
 * @property {AnyByKey} jsconfigvars
 */

/**
 * @typedef {object} ApiResponseParse
 * @property {ApiResponseParseContent} parse
 */

/**
 * @typedef {object} ApiResponseDiscussionToolsPreview
 * @property {object} discussiontoolspreview
 * @property {ApiResponseParseContent} discussiontoolspreview.parse
 */

/**
 * @typedef {object} ApiResponseParseTree
 * @property {object} parse
 * @property {string} parse.parsetree
 */

/**
 * @typedef {object} APIResponseCompare
 * @property {Compare} compare
 */

/**
 * @typedef {object} Compare
 * @property {number} fromid
 * @property {number} fromrevid
 * @property {number} fromns
 * @property {string} fromtitle
 * @property {number} toid
 * @property {number} torevid
 * @property {number} tons
 * @property {string} totitle
 * @property {string} body
 */

/**
 * @typedef {object} ApiResponseUsers
 * @property {object} query
 * @property {ApiResponseUser[]} query.users
 */

/**
 * @typedef {object} ApiResponseUser
 * @property {number} userid
 * @property {string} name
 * @property {'male' | 'female' | 'unknown'} [gender]
 */

/**
 * @typedef {object} ApiResponseSiteInfoSpecialPageAliases
 * @property {string} realname
 * @property {string[]} aliases
 */

/** @type {JQuery.Promise<UserInfo> | undefined} */
let cachedUserInfoRequest

/**
 * @typedef {'http' | 'query-missing' | 'token-missing' | 'ok-but-empty' | string & {}} ApiErrorCode
 */

/**
 * Callback used in the `.catch()` parts of API requests. See the parameters with which `mw.Api()`
 * rejects:
 * https://phabricator.wikimedia.org/source/mediawiki/browse/master/resources/src/mediawiki.api/index.js;137c7de7a44534704762105323192d2d1bfb5765$269
 *
 * @param {ApiErrorCode | [ApiErrorCode, ApiRejectResponse]} codeOrArr
 * @param {ApiRejectResponse} [response]
 * @returns {never}
 * @throws {CdError}
 */
export function handleApiReject(codeOrArr, response) {
	let code

	// Native promises support only one parameter when `reject()`ing, so when we throw it while
	// rethrowing MediaWiki API's error, we pass it as a 2-tuple.
	if (Array.isArray(codeOrArr)) {
		;[code, response] = codeOrArr
	} else {
		code = codeOrArr
	}

	switch (code) {
		case 'http':
			throw new CdError({ type: 'network' })
		case 'ok-but-empty':
			throw new CdError({ type: 'response', code: 'noData' })
		case 'query-missing':
			throw new CdError({ type: 'internal', code })
		case 'token-missing':
			throw new CdError({ type: 'internal', code })
		default: {
			const apiResponse = /** @type {import('types-mediawiki/mw/Api').ApiResponse} */ (response)
			const error = apiResponse.error || apiResponse.errors?.[0]
			throw new CdError({
				type: 'api',
				// `error` or `errors` is chosen by the API depending on `errorformat` being 'html' in
				// requests.
				code: error.code,
				html: error.html,
				apiResponse,
			})
		}
	}
}

/**
 * Split an array into batches of 50 (500 if the user has the `apihighlimits` right) to use in API
 * requests.
 *
 * @template T
 * @param {T[]} arr
 * @returns {T[][]}
 */
export function splitIntoBatches(arr) {
	// Current user's rights are only set on an `userinfo` request which is performed late (see "We
	// are _not_ calling..." in Loader#initTalkPage()). For example, getDtSubscriptions() runs earlier
	// than that. In addition to that, cd.g.phpCharToUpper is empty until we make sure the
	// mediawiki.Title module is loaded.
	let currentUserRights
	try {
		currentUserRights = cd.user.getRights()
	} catch {
		// Can throw a error when cd.user is undefined, because it is set when the modules are ready.
	}
	const limit = (
		currentUserRights
			? currentUserRights.includes('apihighlimits')
			: // No idea why wgUserGroups is said to be `null` for non-logged-in users on
				// https://www.mediawiki.org/wiki/Manual:Interface/JavaScript#mw.config. I see it always
				// containing ['*'].
				(mw.config.get('wgUserGroups') || []).includes('sysop')
	)
		? 500
		: 50

	return arr.reduce((result, item, index) => {
		const chunkIndex = Math.floor(index / limit)
		result[chunkIndex] ??= []
		result[chunkIndex].push(item)

		return result
	}, /** @type {T[][]} */ ([]))
}

/**
 * Make a request that won't set the process on hold when the tab is in the background.
 *
 * @param {import('types-mediawiki/api_params').UnknownApiParams} params
 * @param {'get'|'post'|'postWithEditToken'} [method]
 * @returns {Promise.<import('types-mediawiki/mw/Api').ApiResponse>}
 */
export function requestInBackground(params, method = 'post') {
	return new Promise((resolve, reject) => {
		cd.getApi()[method](params, {
			success: (response) => {
				if (response.error) {
					// Workaround for cases when an options request is made on an idle page whose tokens
					// expire. A re-request of such tokens is generally successful, but _this_ callback is
					// executed after each response, so we aren't rejecting to avoid misleading error messages
					// being shown to the user.
					if (response.error.code !== 'badtoken') {
						reject(['api', response])
					}
				} else {
					resolve(response)
				}
			},
			error: (_, textStatus) => {
				reject(['http', textStatus])
			},
		})
	})
}

/**
 * Make a parse request with arbitrary code. We assume that if something is parsed, it will be
 * shown, so we automatically load modules.
 *
 * @async
 * @param {string} code
 * @param {object} [customOptions]
 * @returns {Promise<{
 *   html: string;
 *   parsedSummary: string;
 * }>}
 * @throws {CdError}
 */
export async function parseCode(code, customOptions) {
	const defaultOptions = {
		action: 'parse',
		text: code,
		contentmodel: 'wikitext',
		prop: ['text', 'modules', 'jsconfigvars'],
		pst: true,
		disabletoc: true,
		disablelimitreport: true,
		disableeditsection: true,
		preview: true,
	}

	const response = /** @type {ApiResponseParse} */ (
		await cd
			.getApi()
			.post({ ...defaultOptions, ...customOptions })
			.catch(handleApiReject)
	)

	mw.loader.load(response.parse.modules)
	mw.loader.load(response.parse.modulestyles)

	return {
		html: response.parse.text,
		parsedSummary: /** @type {string} */ (response.parse.parsedsummary),
	}
}

/**
 * Make a DiscussionTools preview request for transcluded comments. We assume that if something is
 * parsed, it will be shown, so we automatically load modules.
 *
 * @async
 * @param {string} code
 * @param {object} params
 * @param {string} params.page
 * @returns {Promise<string>}
 * @throws {CdError}
 */
export async function getDtPreview(code, { page }) {
	const response = /** @type {ApiResponseDiscussionToolsPreview} */ (
		await cd
			.getApi()
			.post({
				action: 'discussiontoolspreview',
				type: 'reply',
				page,
				wikitext: code,
				useskin: cd.g.skin,
			})
			.catch(handleApiReject)
	)

	const parse = response.discussiontoolspreview.parse
	mw.loader.load(parse.modules)
	mw.loader.load(parse.modulestyles)

	return parse.text
}

/**
 * @typedef {object} UserInfo
 * @property {AnyByKey} options
 * @property {string} visits
 * @property {string} subscriptions
 */

/**
 * Make a userinfo request (see {@link https://www.mediawiki.org/wiki/API:Userinfo}).
 *
 * @param {boolean} [reuse] Whether to reuse a cached request.
 * @returns {JQuery.Promise.<UserInfo>} Promise for an object containing the full options object,
 *   visits, subscription list, and rights.
 * @throws {CdError}
 */
export function getUserInfo(reuse = false) {
	if (reuse && cachedUserInfoRequest) {
		return cachedUserInfoRequest
	}

	cachedUserInfoRequest = cd
		.getApi()
		.post({
			action: 'query',
			meta: 'userinfo',
			uiprop: ['options', 'rights'],
		})
		.then((resp) => {
			const { options, rights } = resp.query.userinfo
			try {
				cd.user.setRights(rights)
			} catch {
				// Can throw a error when cd.g.phpCharToUpper is undefined, because it's set when the
				// modules are ready
			}

			return {
				options,
				visits: options[cd.g.visitsOptionName],
				subscriptions: options[cd.g.subscriptionsOptionName],
			}
		}, handleApiReject)

	return cachedUserInfoRequest
}

/**
 * Get page titles for an array of page IDs.
 *
 * @param {number[]} pageIds
 * @returns {Promise.<ApiResponseQueryPage[]>}
 * @throws {CdError}
 */
export async function getPageTitles(pageIds) {
	if (!pageIds.length) {
		return []
	}

	const pages = []
	for (const nextPageIds of splitIntoBatches(pageIds)) {
		const response = /** @type {ApiResponseQuery<ApiResponseQueryContentPages>} */ (
			await cd
				.getApi()
				.post({
					action: 'query',
					pageids: nextPageIds,
				})
				.catch(handleApiReject)
		)
		pages.push(...(response.query?.pages || []))
	}

	return pages
}

/**
 * @typedef {object} PageIds
 * @property {FromTo[]} normalized
 * @property {FromTo[]} redirects
 * @property {ApiResponseQueryPage[]} pages
 */

/**
 * Get page IDs for an array of page titles, along with the lists of normalizations and redirects.
 *
 * @param {string[]} titles
 * @returns {Promise.<PageIds>}
 * @throws {CdError}
 */
export async function getPageIds(titles) {
	const normalized = []
	const redirects = []
	const pages = []
	for (const nextTitles of splitIntoBatches(titles)) {
		const { query } = /** @type {ApiResponseQuery<ApiResponseQueryContentPages>} */ (
			await cd
				.getApi()
				.post({
					action: 'query',
					titles: nextTitles,
					redirects: true,
				})
				.catch(handleApiReject)
		)
		if (!query) break

		normalized.push(...(query.normalized || []))
		redirects.push(...(query.redirects || []))
		pages.push(...(query.pages || []))
	}

	return { normalized, redirects, pages }
}

/**
 * Generic function for saving user options to the server.
 *
 * @param {{ [key: string]: ?string }} options Name-value pairs.
 * @param {boolean} [isGlobal] Whether to save the options globally (using
 *   {@link https://www.mediawiki.org/wiki/Extension:GlobalPreferences Extension:GlobalPreferences}).
 * @throws {CdError}
 */
export async function saveOptions(options, isGlobal = false) {
	const action = isGlobal ? 'globalpreferences' : 'options'
	if (Object.entries(options).some(([, value]) => value && value.length > 65_535)) {
		throw new CdError({
			type: 'internal',
			code: 'sizeLimit',
			details: { action },
		})
	}

	const response = await requestInBackground(
		cd.getApi().assertCurrentUser({
			action,
			change:
				'\u001F' +
				Object.entries(options)
					.map(([name, value]) => name + (value === null ? '' : '=' + value))
					.join('\u001F'),
		}),
		'postWithEditToken',
	).catch(handleApiReject)

	if (response[action] !== 'success') {
		throw new CdError({
			type: 'response',
			code: 'fail',
			details: { action },
		})
	}
}

/**
 * Save an option value to the server. See {@link https://www.mediawiki.org/wiki/API:Options}.
 *
 * @param {string} name
 * @param {?string} value
 */
export async function saveLocalOption(name, value) {
	await saveOptions({ [name]: value })
}

/**
 * Save a global preferences' option value to the server. See
 * {@link https://www.mediawiki.org/wiki/Extension:GlobalPreferences/API}.
 *
 * @param {string} name
 * @param {?string} value
 * @throws {CdError}
 */
export async function saveGlobalOption(name, value) {
	if (!cd.config.useGlobalPreferences) {
		// Normally, this won't run if cd.config.useGlobalPreferences is false. But it will run as part
		// of SettingsDialog#removeData() in settings.showDialog(), removing the option if it existed,
		// which may have a benificial effect if cd.config.useGlobalPreferences was true at some stage
		// and a local setting with cd.g.settingsOptionName name was created instead of a global one,
		// thus inviting the need to remove it upon removing all data.
		await saveLocalOption(name, value)

		return
	}

	try {
		await saveOptions({ [name]: value }, true)
	} catch (error) {
		// The site doesn't support global preferences.
		if (error instanceof CdError && error.getCode() === 'badvalue') {
			await saveLocalOption(name, value)
		} else {
			throw error
		}
	}
}

/**
 * Request genders of a list of users and assign them as properties. A gender may be `'male'`,
 * `'female'`, or `'unknown'`.
 *
 * @param {import('./User').default[]} users
 * @param {boolean} [doRequestInBackground] Make a request that won't set the process on hold
 *   when the tab is in the background.
 * @returns {Promise<void>}
 */
export async function loadUserGenders(users, doRequestInBackground = false) {
	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const usersToRequest = users
		.filter((user) => !user.getGender() && user.isRegistered())
		.filter(unique)
		.map((user) => user.getName())
	for (const nextUsers of splitIntoBatches(usersToRequest)) {
		const options = {
			action: 'query',
			list: 'users',
			ususers: nextUsers,
			usprop: 'gender',
		}
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const request = doRequestInBackground
			? requestInBackground(options).catch(handleApiReject)
			: cd.getApi().post(options).catch(handleApiReject)
		const response = /** @type {ApiResponseUsers} */ (await request)
		response.query.users.forEach((user) => {
			if (user.gender) {
				userRegistry.get(user.name).setGender(user.gender)
			}
		})
	}
}

/**
 * Get existence of a list of pages by title.
 *
 * @param {string[]} titles Titles to check existence of.
 * @returns {Promise.<Results>}
 */
export async function getPagesExistence(titles) {
	/**
	 * @typedef {{
	 *   [title: string]: {
	 *     exists: boolean;
	 *     normalized: string;
	 *   };
	 * }} Results
	 */

	const results = /** @type {Results} */ ({})
	const normalized = []
	const pages = []
	for (const nextTitles of splitIntoBatches(titles)) {
		const response = /** @type {ApiResponseQuery<ApiResponseQueryContentPages>} */ (
			await cd
				.getApi()
				.post({
					action: 'query',
					titles: nextTitles,
				})
				.catch(handleApiReject)
		)

		const query = response.query
		if (!query) break

		normalized.push(...(query.normalized || []))
		pages.push(...(query.pages || []))
	}

	const normalizedToOriginal = /** @type {StringsByKey} */ ({})
	normalized.forEach((page) => {
		normalizedToOriginal[page.to] = page.from
	})
	pages.forEach((page) => {
		results[normalizedToOriginal[page.title] || page.title] = {
			exists: !page.missing,
			normalized: page.title,
		}
	})

	return results
}

/**
 * Make a request to a REST API to transform HTML to wikitext.
 *
 * @param {string} url URL of the API.
 * @param {string} html HTML to transform.
 * @returns {JQuery.jqXHR.<string>}
 * @private
 */
function callTransformApi(url, html) {
	return $.post(url, {
		html,
		scrub_wikitext: true,
	})
}

/**
 * Convert HTML into wikitext.
 *
 * @param {string} html
 * @param {Array.<string|undefined>} syntaxHighlightLanguages
 * @returns {Promise.<?string>}
 */
export async function convertHtmlToWikitext(html, syntaxHighlightLanguages) {
	let wikitext
	try {
		try {
			if (!cd.g.isProbablyWmfSulWiki) {
				throw new CdError()
			}
			wikitext = await callTransformApi('/api/rest_v1/transform/html/to/wikitext', html)
		} catch {
			wikitext = await callTransformApi(
				'https://en.wikipedia.org/api/rest_v1/transform/html/to/wikitext',
				html,
			)
		}
		wikitext = wikitext
			.replace(/(?:^ .*(?:\n|$))+|<code dir="(?:ltr|rtl)">([^]*?)<\/code>/gm, (s, inlineCode) => {
				const lang = syntaxHighlightLanguages.shift() || 'wikitext'
				const code = (
					typeof inlineCode === 'string'
						? inlineCode
						: '\n' + s.replace(/^ /gm, '').replace(/[^\n]$/, '$0\n')
				).replace(/<nowiki>([^]*?)<\/nowiki>/g, '$1')
				const inlineOrNot = inlineCode === undefined ? '' : ' inline'

				return `<syntaxhighlight lang="${lang}"${inlineOrNot}>${code}</syntaxhighlight>`
			})
			.replace(/<br \/>/g, '<br>')
			.trim()
		wikitext = new TextMasker(wikitext)
			.maskSensitiveCode()
			.withText((text) => brsToNewlines(text))
			.unmask()
			.getText()
	} catch {
		// Empty
	}

	return wikitext || null
}
