import defaultConfig from '../config/default'
import commonsConfig from '../config/wikis/commons'
import dateFormats from '../data/date-formats.json'
import { initContentTimestampTools, initPatterns } from '../src/init'
import { createBaseGlobals } from '../src/loader/baseGlobals'
import cd from '../src/loader/cd'

/**
 * Commons' MediaWiki config values that {@link initPatterns} reads, as of 2026-10-10. Only the
 * namespaces the patterns use are listed.
 *
 * @type {import('../src/init').PatternsMwConfig}
 */
const commonsMwConfig = {
	wgFormattedNamespaces: {
		[-1]: 'Special',
		2: 'User',
		3: 'User talk',
		6: 'File',
		14: 'Category',
	},
	wgNamespaceIds: {
		special: -1,
		user: 2,
		user_talk: 3,
		file: 6,
		image: 6,
		category: 14,
		cat: 14,
	},
	wgArticlePath: '/wiki/$1',
	wgScript: '/w/index.php',
	wgActionPaths: {},
}

/**
 * Set `cd.config` and the wiki-dependent `cd.g` values the way the loader and the boot process set
 * them on Commons, short of the values that depend on the page or the user.
 *
 * @param {Partial<typeof defaultConfig>} [configOverrides] Values to put over Commons' configuration.
 */
export function initCommonsGlobals(configOverrides = {}) {
	cd.config = { ...defaultConfig, ...commonsConfig, ...configOverrides, _mergedWithDefault: true }

	// What the loader sets from the configuration, for a wiki whose configuration needs no site data
	// requests
	const baseGlobals = createBaseGlobals()
	cd.g = /** @type {typeof cd.g} */ ({
		...baseGlobals,
		contentLanguage: 'en',
		contentDirection: 'ltr',

		// MediaWiki's table lists only where PHP's uppercasing differs from JavaScript's, which no test
		// user name needs.
		phpCharToUpper: {},

		contentLanguageMessages: { ...cd.config.messages },
		specialPageAliases: Object.fromEntries(
			Object.entries(cd.config.specialPageAliases).map(([key, value]) => [
				key,
				typeof value === 'string' ? [value] : value,
			]),
		),
		timestampTools: {
			...baseGlobals.timestampTools,
			content: { dateFormat: dateFormats.en, timezone: cd.config.timezone ?? undefined },
		},
	})
	mw.messages.set(
		Object.fromEntries(
			Object.entries(cd.config.messages).map(([name, value]) => ['(content)' + name, value]),
		),
	)

	initContentTimestampTools()
	initPatterns(commonsMwConfig)
}
