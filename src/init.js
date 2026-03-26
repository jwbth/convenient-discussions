/**
 * Initialization functions for global state and timestamp tools.
 * Extracted from app.js to avoid circular dependencies.
 *
 * @module init
 */

import cd from './loader/cd'
import pageRegistry from './pageRegistry'
import { getContentLanguageMessages } from './shared/utils-general'
import { dateTokenToMessageNames } from './shared/utils-timestamp'
import userRegistry from './userRegistry'

/**
 * Set a number of {@link convenientDiscussions global object} properties.
 */
export function initGlobals() {
	// Halt if already initialized
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (cd.page) return

	const script = mw.loader.moduleRegistry['mediawiki.Title'].script
	cd.g.phpCharToUpper =
		(script &&
			typeof script === 'object' &&
			'files' in script &&
			script.files['phpCharToUpper.json']) ||
		{}

	cd.page = pageRegistry.getCurrent()
	cd.user = userRegistry.getCurrent()

	// Is there {{gender:}} with at least two pipes in the selection of affected strings?
	cd.g.genderAffectsUserString = /\{\{ *gender *:[^}]+?\|[^} ]+?\|/i.test(
		Object.entries(mw.messages.get())
			.filter(([key]) => key.startsWith('convenient-discussions'))
			.map(([, value]) => value)
			.join(','),
	)

	if (cd.config.tagName && cd.user.isRegistered()) {
		cd.g.summaryPostfix = ''
		cd.g.summaryLengthLimit = mw.config.get('wgCommentCodePointLimit')
	} else {
		cd.g.summaryPostfix = ` ([[${cd.config.scriptPageWikilink}|${cd.s('script-name-short')}]])`
		cd.g.summaryLengthLimit = mw.config.get('wgCommentCodePointLimit') - cd.g.summaryPostfix.length
	}

	// We don't need it in the script - keep it for now for compatibility with `s-ru` config
	cd.g.clientProfile = $.client.profile()

	cd.g.cmdModifier = $.client.profile().platform === 'mac' ? 'Cmd' : 'Ctrl'

	cd.g.isIPv6Address = mw.util.isIPv6Address

	cd.g.apiErrorFormatHtml = {
		errorformat: 'html',
		errorlang: cd.g.userLanguage,
		errorsuselocal: true,
	}
}

/**
 * Set the {@link convenientDiscussions} properties related to timestamp parsing.
 *
 * This should run after getSiteData() so that cd.g.timestampTools.content.timezone is available.
 */
export function initTimestampTools() {
	// Halt if already initialized
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (cd.g.timestampTools.user.regexp) return

	const timestampTools = cd.g.timestampTools
	const content = timestampTools.content
	const user = timestampTools.user

	const [type, offset, timezoneName] =
		/** @type {string | undefined} */ (mw.user.options.get('timecorrection'))?.split('|') || []
	user.timezone =
		type === 'System'
			? content.timezone
			: type === 'Offset' || (type === 'ZoneInfo' && !timezoneName)
				? offset === '0'
					? 'UTC'
					: Number(offset)
				: type === 'ZoneInfo'
					? timezoneName
					: undefined

	try {
		user.isSameAsLocalTimezone = user.timezone === Intl.DateTimeFormat().resolvedOptions().timeZone
	} catch {
		// Empty
	}

	const mainPartPattern = getTimestampMainPartPattern('content')
	const utcPattern = mw.util.escapeRegExp(mw.message('(content)timezone-utc').parse())
	const timezonePattern = `\\((?:${utcPattern}|[A-Z]{1,5}|[+-]\\d{0,4})\\)`

	content.regexp = new RegExp(mainPartPattern + ' +' + timezonePattern)
	content.parseRegexp = new RegExp(`^([^]*(?:^|[^=])(?:\\b| ))(${content.regexp.source})(?![»"])`)
	content.noTzRegexp = new RegExp(mainPartPattern)
	content.matchingGroups = getMatchingGroups(content.dateFormat)
	content.timezoneRegexp = new RegExp(timezonePattern, 'g')

	user.regexp = new RegExp(getTimestampMainPartPattern('user'))
	user.parseRegexp = new RegExp(`^([^]*)(${user.regexp.source})`)
	user.matchingGroups = getMatchingGroups(user.dateFormat)
}

/**
 * Get a regexp that matches timestamps (without timezone at the end).
 *
 * Helper for initTimestampTools().
 *
 * @param {LanguageTarget} languageTarget
 * @returns {string}
 * @private
 */
function getTimestampMainPartPattern(languageTarget) {
	const format = cd.g.timestampTools[languageTarget].dateFormat
	const digits = cd.g.digits[languageTarget]
	const digitsPattern = digits ? `[${digits}]` : String.raw`\d`

	const regexpGroup = (/** @type {string} */ regexp) => '(' + regexp + ')'
	const regexpAlternateGroup = (/** @type {string[]} */ arr) =>
		'(' + arr.map(mw.util.escapeRegExp).join('|') + ')'

	let string = ''

	for (let p = 0; p < format.length; p++) {
		/** @type {string|false} */
		let num = false
		let code = format[p]
		if ((code === 'x' && p < format.length - 1) || (code === 'xk' && p < format.length - 1)) {
			code += format[++p]
		}

		switch (code) {
			case 'xx':
				string += 'x'
				break
			case 'xg':
			case 'D':
			case 'l':
			case 'F':
			case 'M': {
				string += regexpAlternateGroup(
					languageTarget === 'content'
						? getContentLanguageMessages(dateTokenToMessageNames[code])
						: dateTokenToMessageNames[code].map((token) => mw.msg(token)),
				)
				break
			}
			case 'd':
			case 'H':
			case 'i':
				num = '2'
				break
			case 'j':
			case 'n':
			case 'G':
				num = '1,2'
				break
			case 'Y':
			case 'xkY':
				num = '4'
				break
			case '\\':
				string += p < format.length - 1 ? format[++p] : '\\'
				break
			case '"':
				if (p < format.length - 1) {
					const endQuote = format.indexOf('"', p + 1)
					if (endQuote === -1) {
						string += '"'
					} else {
						string += format.substr(p + 1, endQuote - p - 1)
						p = endQuote
					}
				} else {
					string += '"'
				}
				break
			default:
				string += mw.util.escapeRegExp(format[p])
		}
		if (num !== false) {
			string += regexpGroup(digitsPattern + '{' + num + '}')
		}
	}

	return string
}

/**
 * Get codes of date components for timestamp parsing.
 *
 * Helper for initTimestampTools().
 *
 * @param {string} format
 * @returns {string[]}
 * @private
 */
function getMatchingGroups(format) {
	const matchingGroups = []
	for (let p = 0; p < format.length; p++) {
		let code = format[p]
		if ((code === 'x' && p < format.length - 1) || (code === 'xk' && p < format.length - 1)) {
			code += format[++p]
		}

		switch (code) {
			case 'xx':
				break
			case 'xg':
			case 'd':
			case 'j':
			case 'D':
			case 'l':
			case 'F':
			case 'M':
			case 'n':
			case 'Y':
			case 'xkY':
			case 'G':
			case 'H':
			case 'i':
				matchingGroups.push(code)
				break
			case '\\':
				if (p < format.length - 1) {
					++p
				}
				break
			case '"':
				if (p < format.length - 1) {
					const endQuote = format.indexOf('"', p + 1)
					if (endQuote !== -1) {
						p = endQuote
					}
				}
				break
			default:
				break
		}
	}

	return matchingGroups
}
