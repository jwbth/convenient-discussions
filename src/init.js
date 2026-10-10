/**
 * Initialization functions for global state and timestamp tools.
 * Extracted from app.js to avoid circular dependencies.
 *
 * @module init
 */

import cd from './loader/cd'
import pageRegistry from './pageRegistry'
import {
	defined,
	generatePageNamePattern,
	getContentLanguageMessages,
	unique,
} from './shared/utils-general'
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

	cd.g.clientProfile = $.client.profile()

	cd.g.cmdModifier = $.client.profile().platform === 'mac' ? '⌘' : cd.s('key-ctrl')

	cd.g.isIPv6Address = mw.util.isIPv6Address

	cd.g.apiErrorFormatHtml = {
		errorformat: 'html',
		errorlang: cd.g.userLanguage,
		errorsuselocal: true,
	}

	if (cd.config.signaturePrefixRegexp) {
		cd.g.wholeStringSignaturePrefixRegexp = new RegExp('^' + cd.config.signaturePrefixRegexp.source)
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

	initContentTimestampTools()

	user.regexp = new RegExp(getTimestampMainPartPattern('user'))
	user.parseRegexp = new RegExp(`^([^]*)(${user.regexp.source})`)
	user.matchingGroups = getMatchingGroups(user.dateFormat)
}

/**
 * Set the {@link convenientDiscussions} properties related to parsing timestamps in content
 * language. Unlike the user language ones, they don't depend on user preferences, so tests can
 * build them from a wiki configuration.
 */
export function initContentTimestampTools() {
	const content = cd.g.timestampTools.content
	const mainPartPattern = getTimestampMainPartPattern('content')
	const utcPattern = mw.util.escapeRegExp(mw.message('(content)timezone-utc').parse())
	const timezonePattern = `\\((?:${utcPattern}|[A-Z]{1,5}|[+-]\\d{0,4})\\)`

	content.regexp = new RegExp(mainPartPattern + ' +' + timezonePattern)
	content.parseRegexp = new RegExp(`^([^]*(?:^|[^=])(?:\\b| ))(${content.regexp.source})(?![»"])`)
	content.noTzRegexp = new RegExp(mainPartPattern)
	content.matchingGroups = getMatchingGroups(content.dateFormat)
	content.timezoneRegexp = new RegExp(timezonePattern, 'g')
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

/**
 * @typedef {object} PatternsMwConfig
 * @property {Record<number, string>} wgFormattedNamespaces
 * @property {Record<string, number>} wgNamespaceIds
 * @property {string} wgArticlePath
 * @property {string} wgScript
 * @property {Record<string, string>} wgActionPaths
 */

/**
 * Generate regexps, patterns (strings to be parts of regexps), selectors from config values.
 *
 * Reads `cd.config` and the `cd.g` values the loader sets, but neither the page nor the live
 * `mw.config`, so that tests can build the patterns from a wiki configuration.
 *
 * @param {PatternsMwConfig} mwConfig MediaWiki config values the patterns depend on.
 */
export function initPatterns(mwConfig) {
	const signatureEndingRegexp = cd.config.signatureEndingRegexp
	cd.g.signatureEndingRegexp = signatureEndingRegexp
		? new RegExp(
				signatureEndingRegexp.source + (signatureEndingRegexp.source.endsWith('$') ? '' : '$'),
				signatureEndingRegexp.flags,
			)
		: undefined

	const nss = mwConfig.wgFormattedNamespaces
	const nsIds = mwConfig.wgNamespaceIds

	const anySpace = (/** @type {string} */ s) =>
		s.replace(/[ _]/g, '[ _]+').replace(/:/g, '[ _]*:[ _]*')
	const joinNsNames = (/** @type {number[]} */ ...ids) =>
		Object.keys(nsIds)
			.filter((key) => ids.includes(nsIds[key]))

			// Sometimes wgNamespaceIds has a string that doesn't transform into one of the keys of
			// wgFormattedNamespaces when converting the first letter to uppercase, like in Azerbaijani
			// Wikipedia (compare Object.keys(mw.config.get('wgNamespaceIds'))[4] = 'i̇stifadəçi' with
			// mw.config.get('wgFormattedNamespaces')[2] = 'İstifadəçi'). We simply add the
			// wgFormattedNamespaces name separately.
			.concat(ids.map((id) => nss[id]))
			.map(mw.util.escapeRegExp)

			.map(anySpace)
			.join('|')

	const userNssAliasesPattern = joinNsNames(2, 3)
	cd.g.userNamespacesRegexp = new RegExp(`(?:^|:)(?:${userNssAliasesPattern}):(.+)`, 'i')

	const userNsAliasesPattern = joinNsNames(2)
	cd.g.userLinkRegexp = new RegExp(`^:?(?:${userNsAliasesPattern}):([^/]+)$`, 'i')
	cd.g.userSubpageLinkRegexp = new RegExp(`^:?(?:${userNsAliasesPattern}):.+?/`, 'i')

	const userTalkNsAliasesPattern = joinNsNames(3)
	cd.g.userTalkLinkRegexp = new RegExp(`^:?(?:${userTalkNsAliasesPattern}):([^/]+)$`, 'i')
	cd.g.userTalkSubpageLinkRegexp = new RegExp(`^:?(?:${userTalkNsAliasesPattern}):.+?/`, 'i')

	const contribsTitleAliases = cd.g.specialPageAliases.Contributions.concat('Contributions')
	cd.g.contribsPages = contribsTitleAliases.filter(unique).map((alias) => `${nss[-1]}:${alias}`)

	const specialNsPattern = joinNsNames(-1)
	const contribsPagesTitlePattern = contribsTitleAliases.join('|')
	const contribsPagesLinkPattern = `(?:${specialNsPattern}):(?:${contribsPagesTitlePattern})/`
	cd.g.contribsPageLinkRegexp = new RegExp(`^${contribsPagesLinkPattern}`)

	cd.g.captureUserNamePattern =
		`\\[\\[[ _]*:?(?:\\w*:){0,2}(?:(?:${userNssAliasesPattern})[ _]*:[ _]*|` +
		`(?:${specialNsPattern})[ _]*:[ _]*(?:${contribsPagesTitlePattern})\\/[ _]*)([^|\\]/]+)(/)?`

	cd.g.isThumbRegexp = new RegExp(
		['thumb', 'thumbnail']
			.concat(cd.config.thumbAliases)
			.map((alias) => `\\| *${alias} *[|\\]]`)
			.join('|'),
	)

	const unsignedTemplatesPattern = cd.config.unsignedTemplates
		.map(generatePageNamePattern)
		.join('|')
	cd.g.unsignedTemplatesPattern = unsignedTemplatesPattern
		? `(\\{\\{ *(?:${unsignedTemplatesPattern}) *\\| *([^}|]+?) *(?:\\| *([^}]+?) *)?\\}\\})`
		: undefined

	const clearTemplatesPattern = cd.config.clearTemplates.map(generatePageNamePattern).join('|')
	const reflistTalkTemplatesPattern = cd.config.reflistTalkTemplates
		.map(generatePageNamePattern)
		.join('|')

	cd.g.keepInSectionEnding = [
		...cd.config.keepInSectionEnding,
		clearTemplatesPattern
			? new RegExp(`\\n+\\{\\{ *(?:${clearTemplatesPattern}) *\\}\\}\\s*$`)
			: undefined,
		reflistTalkTemplatesPattern
			? new RegExp(`\\n+\\{\\{ *(?:${reflistTalkTemplatesPattern}) *\\}\\}.*\\s*$`)
			: undefined,
	].filter(defined)

	const pieJoined = cd.g.popularInlineElements.join('|')
	cd.g.piePattern = `(?:${pieJoined})`

	const pnieJoined = cd.g.popularNotInlineElements.join('|')
	cd.g.pniePattern = `(?:${pnieJoined})`

	cd.g.articlePathRegexp = new RegExp(
		'^' + mw.util.escapeRegExp(mwConfig.wgArticlePath).replace(String.raw`\$1`, '(.*)'),
	)
	cd.g.startsWithScriptTitleRegexp = new RegExp(
		'^' + mw.util.escapeRegExp(mwConfig.wgScript + '?title='),
	)
	const editActionpath = mwConfig.wgActionPaths.edit
	if (editActionpath) {
		cd.g.startsWithEditActionPathRegexp = new RegExp(
			'^' + mw.util.escapeRegExp(editActionpath).replace(String.raw`\$1`, '(.*)') + '.*',
		)
	}

	// Template names are not case-sensitive here for code simplicity.
	const quoteTemplateToPattern = (/** @type {string} */ tpl) =>
		String.raw`\{\{ *` + anySpace(mw.util.escapeRegExp(tpl))
	const quoteBeginningsPattern = ['<blockquote', '<q']
		.concat(cd.config.pairQuoteTemplates[0].map(quoteTemplateToPattern))
		.join('|')
	const quoteEndingsPattern = ['</blockquote>', '</q>']
		.concat(cd.config.pairQuoteTemplates[1].map(quoteTemplateToPattern))
		.join('|')
	cd.g.quoteRegexp = new RegExp(
		`(${quoteBeginningsPattern})([^]*?)(${quoteEndingsPattern})`,
		'ig',
	)

	cd.g.noSignatureClasses.push(...cd.config.noSignatureClasses)
	cd.g.closedDiscussionClasses.push(...cd.config.closedDiscussionClasses)
	cd.g.noHighlightClasses.push(...cd.config.noHighlightClasses)

	const noSignatureClassesPattern = cd.g.noSignatureClasses.join(String.raw`\b|\b`)
	const noSignatureTemplatesPattern = cd.config.noSignatureTemplates
		.map(generatePageNamePattern)
		.join('|')
	cd.g.commentAntipatternsPattern = [
		`class=(['"])[^'"\\n]*(?:\\b${noSignatureClassesPattern}\\b)[^'"\\n]*\\1`,
		noSignatureTemplatesPattern
			? `\\{\\{ *(?:${noSignatureTemplatesPattern}) *(?:\\||\\}\\})`
			: undefined,
		...cd.config.commentAntipatterns.map((regexp) => regexp.source),
	]
		.filter(defined)
		.join('|')

	const fileNssPattern = joinNsNames(6)
	cd.g.filePrefixPattern = `(?:${fileNssPattern}):`

	const colonNssPattern = joinNsNames(6, 14)
	cd.g.colonNamespacesPrefixRegexp = new RegExp(`^:(?:${colonNssPattern}):`, 'i')

	cd.g.badCommentBeginnings = [
		...cd.g.badCommentBeginnings,
		new RegExp(`^\\[\\[${cd.g.filePrefixPattern}.+\\n+(?=[*:#])`, 'i'),
		...cd.config.badCommentBeginnings,
		// Mirrors `CommentSkeleton#filterParts()`, which drops elements like move marks at the
		// comment beginning
		new RegExp(`^.*(?:${cd.g.commentAntipatternsPattern}).*\\n+`),
		clearTemplatesPattern
			? new RegExp(`^\\{\\{ *(?:${clearTemplatesPattern}) *\\}\\} *\\n+`, 'i')
			: undefined,
	].filter(defined)

	cd.g.pipeTrickRegexp = /(\[\[:?(?:[^|[\]<>\n:]+:)?([^|[\]<>\n]+)\|)(\]\])/g
}
