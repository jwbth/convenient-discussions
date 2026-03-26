import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import chalk from 'chalk'
import createDOMPurify from 'dompurify'
// @ts-ignore: jsdom has no types
import { JSDOM } from 'jsdom'
import { rimraf } from 'rimraf'

import { replaceEntitiesInI18n } from './misc/utils.mjs'

const DOMPurify = createDOMPurify(
	/** @type {import('dompurify').WindowLike} */ (
		/** @type {unknown} */ (new JSDOM('').window)
	),
)

const warning = (/** @type {string} */ text) => {
	console.log(chalk.yellowBright(text))
}
const code = chalk.inverse
const keyword = chalk.cyan

const ALLOWED_TAGS = [
	'b',

	// Haven't met in practice yet, but perhaps these tags could be helpful for RTL languages?
	'bdi',
	'bdo',

	'code',
	'em',
	'i',
	'kbd',
	'li',
	'nowiki',
	'ol',
	'p',
	'pre',
	'span',
	'strong',
	'syntaxhighlight',
	'ul',
	'var',
]

const DAYJS_LOCALES_TEMP_DIR_NAME = 'dist/dayjs-locales-temp'
const DATE_FNS_LOCALES_TEMP_DIR_NAME = 'dist/date-fns-locales-temp'

/**
 * Hides all occurrences of a pattern in a string.
 *
 * @param {string} text
 * @param {RegExp} regexp
 * @param {string[]} hidden
 * @returns {string}
 */
function hideText(text, regexp, hidden) {
	return text.replace(
		regexp,
		(s) => '\u0001' + String(hidden.push(s)) + '\u0002',
	)
}

/**
 * Unhides all occurrences of a pattern in a string.
 *
 * @param {string} text
 * @param {string[]} hidden
 * @returns {string}
 */
function unhideText(text, hidden) {
	while (text.match(/\u0001\d+\u0002/)) {
		text = text.replace(/\u0001(\d+)\u0002/g, (_s, num) => hidden[num - 1])
	}

	return text
}

/**
 * @template T
 * @typedef {Record<string, T>} AnyByKey
 */

/**
 * @typedef {AnyByKey<string>} StringsByKey
 */

/**
 * @typedef {{ dirName: string, localeName: string }} LocaleNames
 */

/**
 * @typedef {import('dompurify').Config & { filename: string, stringName: string, lang: string }} SanitizeConfig
 */

/**
 * Builds dayjs locales for the given i18n with fallbacks.
 *
 * @param {AnyByKey<StringsByKey>} i18nWithFallbacks
 * @returns {string[]}
 */
function buildDayjsLocales(i18nWithFallbacks) {
	// Create a temporary folder.
	fs.mkdirSync(DAYJS_LOCALES_TEMP_DIR_NAME, { recursive: true })

	// Add temporary language files to that folder that import respective locales if they exist.
	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const dayjsLocales = JSON.parse(
		fs.readFileSync('./node_modules/dayjs/locale.json', 'utf8'),
	)
	const locales = new Set(
		dayjsLocales.map((/** @type {StringsByKey} */ locale) => locale.key),
	)
	/** @type {string[]} */
	const langsHavingLocale = []
	Object.keys(i18nWithFallbacks).forEach((lang) => {
		const localLangName = lang
			.replace(/^zh-hans$/, 'zh-cn')
			.replace(/^zh-hant$/, 'zh-tw')

		// The English locale is built-in.
		if (lang !== 'en' && locales.has(localLangName)) {
			langsHavingLocale.push(lang)

			fs.writeFileSync(
				`${DAYJS_LOCALES_TEMP_DIR_NAME}/${lang}.js`,
				`import dayjsLocale from 'dayjs/locale/${localLangName}';
convenientDiscussions.i18n['${lang}'].dayjsLocale = dayjsLocale;
`,
			)
		}
	})

	// Build the locales.
	if (langsHavingLocale.length) {
		fs.mkdirSync(`${DAYJS_LOCALES_TEMP_DIR_NAME}/dist`, { recursive: true })

		// Build each locale file separately since Vite doesn't support multiple entries with IIFE
		langsHavingLocale.forEach((lang) => {
			fs.writeFileSync(
				`${DAYJS_LOCALES_TEMP_DIR_NAME}/vite.config.${lang}.js`,
				`import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	build: {
		outDir: path.resolve(__dirname, 'dist'),
		emptyOutDir: false,
		lib: {
			entry: path.resolve(__dirname, '${lang}.js'),
			formats: ['iife'],
			name: 'convenientDiscussions',
			fileName: () => '${lang}.js',
		},
	},
});
`,
			)
			execSync(
				`node ./node_modules/vite/bin/vite.js build --config "${DAYJS_LOCALES_TEMP_DIR_NAME}/vite.config.${lang}.js"`,
				{ stdio: 'inherit' },
			)
		})
	}

	return langsHavingLocale
}

/**
 * Builds date-fns locales for the given i18n with fallbacks.
 *
 * @param {AnyByKey<StringsByKey>} i18nWithFallbacks
 * @returns {string[]}
 */
function buildDateFnsLocales(i18nWithFallbacks) {
	// Create a temporary folder.
	fs.mkdirSync(DATE_FNS_LOCALES_TEMP_DIR_NAME, { recursive: true })

	/** @type {Record<string, LocaleNames>} */
	const langNames = {}
	Object.keys(i18nWithFallbacks).forEach((lang) => {
		langNames[lang] = { dirName: '', localeName: '' }
		const names = langNames[lang]
		names.dirName = lang
			.replace(/^zh-hans$/, 'zh-cn')
			.replace(/^zh-hant$/, 'zh-tw')
			.replace(/-.+$/, (s) => s.toUpperCase())
		names.localeName = names.dirName.replace(/-/g, '')
	})

	for (const [, names] of Object.entries(langNames)) {
		if (
			fs.existsSync(`node_modules/date-fns/locale/${names.dirName}/index.js`)
		) {
			// We only need data for the formatDistance function.
			let indexJsText = fs.readFileSync(
				`node_modules/date-fns/esm/locale/${names.dirName}/index.js`,
				'utf8',
			)
			indexJsText = indexJsText.replace(/\n\s+formatLong:[^}]+\}/g, '')
			fs.writeFileSync(
				`node_modules/date-fns/esm/locale/${names.dirName}/index.js`,
				indexJsText,
			)
		}
	}

	// Add temporary language files to the temporary folder that import respective locales if they
	// exist.
	const langsHavingLocale = []
	for (const [lang, names] of Object.entries(langNames)) {
		// The English locale is built-in.
		if (
			lang !== 'en' &&
			fs.existsSync(`node_modules/date-fns/locale/${names.dirName}/index.js`)
		) {
			langsHavingLocale.push(lang)

			fs.writeFileSync(
				`${DATE_FNS_LOCALES_TEMP_DIR_NAME}/${lang}.js`,
				`import lang from 'date-fns/locale/${names.dirName}';
convenientDiscussions.i18n['${lang}'].dateFnsLocale = lang;
`,
			)
		}
	}

	// Build the locales.
	if (langsHavingLocale.length) {
		fs.mkdirSync(`${DATE_FNS_LOCALES_TEMP_DIR_NAME}/dist`, { recursive: true })

		// Build each locale file separately since Vite doesn't support multiple entries with IIFE
		langsHavingLocale.forEach((lang) => {
			fs.writeFileSync(
				`${DATE_FNS_LOCALES_TEMP_DIR_NAME}/vite.config.${lang}.js`,
				`import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	build: {
		outDir: path.resolve(__dirname, 'dist'),
		emptyOutDir: false,
		lib: {
			entry: path.resolve(__dirname, '${lang}.js'),
			formats: ['iife'],
			name: 'convenientDiscussions',
			fileName: () => '${lang}.js',
		},
	},
});
`,
			)
			execSync(
				`node ./node_modules/vite/bin/vite.js build --config "${DATE_FNS_LOCALES_TEMP_DIR_NAME}/vite.config.${lang}.js"`,
				{ stdio: 'inherit' },
			)
		})
	}

	return langsHavingLocale
}

DOMPurify.addHook('uponSanitizeElement', (currentNode, data, config) => {
	const sanitizeConfig = /** @type {SanitizeConfig} */ (config)
	const element = /** @type {Element} */ (/** @type {unknown} */ (currentNode))
	if (
		!Object.keys(data.allowedTags).includes(data.tagName) &&
		!['body', '#comment'].includes(data.tagName)
	) {
		// `< /li>` qualifies as `#comment` and has content available under `currentNode.textContent`.
		warning(
			`Disallowed tag found and sanitized in the string "${keyword(sanitizeConfig.stringName)}" in ${keyword(sanitizeConfig.filename)}: ${code(element.outerHTML || currentNode.textContent)}. See\nhttps://translatewiki.net/wiki/Wikimedia:Convenient-discussions-${sanitizeConfig.stringName}/${sanitizeConfig.lang}.`,
		)
		console.log(element.outerHTML, currentNode.textContent, element.tagName)
	}
})

DOMPurify.addHook(
	'uponSanitizeAttribute',
	(_currentNode, hookEvent, config) => {
		const sanitizeConfig = /** @type {SanitizeConfig} */ (config)
		if (
			!Object.keys(hookEvent.allowedAttributes).includes(hookEvent.attrName)
		) {
			warning(
				`Disallowed attribute found and sanitized in the string "${keyword(sanitizeConfig.stringName)}" in ${keyword(sanitizeConfig.filename)}: ${code(hookEvent.attrName)} with value "${hookEvent.attrValue}". See\nhttps://translatewiki.net/wiki/Wikimedia:Convenient-discussions-${sanitizeConfig.stringName}/${sanitizeConfig.lang}.`,
			)
		}
	},
)

/** @type {AnyByKey<StringsByKey>} */
const i18n = {}
fs.readdirSync('./i18n/')
	.filter(
		(filename) => path.extname(filename) === '.json' && filename !== 'qqq.json',
	)
	.forEach((filename) => {
		const [, lang] = path.basename(filename).match(/^(.+)\.json$/) || []
		const strings = JSON.parse(fs.readFileSync(`./i18n/${filename}`, 'utf8'))
		Object.keys(strings)
			.filter((name) => typeof strings[name] === 'string')
			.forEach((stringName) => {
				/** @type {string[]} */
				const hidden = []
				let sanitized = hideText(
					strings[stringName],
					/<nowiki(?: [\w ]+(?:=[^<>]+?)?| *)>([^]*?)<\/nowiki *>/g,
					hidden,
				)

				sanitized = DOMPurify.sanitize(
					sanitized,
					/** @type {SanitizeConfig} */ ({
						ALLOWED_TAGS,
						ALLOWED_ATTR: ['class', 'dir', 'href', 'target', 'style'],
						ALLOW_DATA_ATTR: false,
						filename,
						stringName,
						lang,
					}),
				)

				sanitized = unhideText(sanitized, hidden)

				// Just in case dompurify or jsdom gets outdated or the repository gets compromised, we will
				// just manually check that only allowed tags are present.
				for (const [, tagName] of sanitized.matchAll(/<(\w+)/g)) {
					if (!ALLOWED_TAGS.includes(tagName.toLowerCase())) {
						warning(
							`Disallowed tag ${code(tagName)} found in ${keyword(filename)} at the late stage: ${keyword(sanitized)}. The string has been removed altogether.`,
						)
						delete strings[stringName]

						return
					}
				}

				// The same with suspicious strings containing what seems like the "javascript:" prefix or
				// one of the "on..." attributes.
				if (
					/javascript:/i.test(sanitized.replace(/&\w+;|\s+/g, '')) ||
					/\bon\w+\s*=/i.test(sanitized)
				) {
					warning(
						`Suspicious code found in ${keyword(filename)} at the late stage: ${keyword(
							sanitized,
						)}. The string has been removed altogether.`,
					)
					delete strings[stringName]

					return
				}

				strings[stringName] = sanitized
			})

		i18n[lang] = strings
	})

/** @type {AnyByKey<StringsByKey>} */
const i18nWithFallbacks = {}

if (Object.keys(i18n).length) {
	// Use language fallbacks data to fill missing messages. When the fallbacks need to be updated,
	// they can be collected using
	// https://phabricator.wikimedia.org/source/mediawiki/browse/master/languages/messages/?grep=fallback%20%3D.
	/** @type {Record<string, string[]>} */
	const fallbackData = JSON.parse(
		fs.readFileSync('./data/languageFallbacks.json', 'utf8'),
	)
	Object.keys(i18n).forEach((lang) => {
		const fallbacks = fallbackData[lang]
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		i18nWithFallbacks[lang] = fallbacks
			? Object.assign(
					{},
					...fallbacks.map((fbLang) => i18n[fbLang]).reverse(),
					i18n[lang],
				)
			: i18n[lang]
	})

	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const langsHavingDayjsLocale = buildDayjsLocales(i18nWithFallbacks)
	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const langsHavingDateFnsLocale = buildDateFnsLocales(i18nWithFallbacks)

	// Create i18n files that combine translations with dayjs locales.
	for (const [lang, json] of Object.entries(i18nWithFallbacks)) {
		let jsonText = replaceEntitiesInI18n(JSON.stringify(json, null, '\t'))

		if (lang === 'en') {
			// Prevent creating "</nowiki>" character sequences when building the main script file.
			jsonText = jsonText.replace(/<\/nowiki>/g, '</" + String("") + "nowiki>')
		}

		let text = `window.convenientDiscussions = /** @type {import('../../src/loader/cd').ConvenientDiscussions} */ (window.convenientDiscussions || {});
convenientDiscussions.i18n = convenientDiscussions.i18n || {};
convenientDiscussions.i18n['${lang}'] = ${jsonText};
`

		let dayjsLocaleText
		if (langsHavingDayjsLocale.includes(lang)) {
			dayjsLocaleText = fs.readFileSync(
				`./${DAYJS_LOCALES_TEMP_DIR_NAME}/dist/${lang}.js`,
				'utf8',
			)
			text += `
// This assigns a day.js locale object to \`convenientDiscussions.i18n['${lang}'].dayjsLocale\`.
${dayjsLocaleText}
`
		}

		let dateFnsLocaleText
		if (langsHavingDateFnsLocale.includes(lang)) {
			dateFnsLocaleText = fs.readFileSync(
				`./${DATE_FNS_LOCALES_TEMP_DIR_NAME}/dist/${lang}.js`,
				'utf8',
			)
			text += `
// This assigns a date-fns locale object to \`convenientDiscussions.i18n['${lang}'].dateFnsLocale\`.
${dateFnsLocaleText}
`
		}

		fs.mkdirSync('dist/convenientDiscussions-i18n', { recursive: true })
		fs.writeFileSync(`dist/convenientDiscussions-i18n/${lang}.js`, text)
	}

	rimraf.sync(DAYJS_LOCALES_TEMP_DIR_NAME)
	rimraf.sync(DATE_FNS_LOCALES_TEMP_DIR_NAME)
}

fs.mkdirSync('data', { recursive: true })
fs.writeFileSync(
	'data/i18nList.json',
	JSON.stringify(Object.keys(i18n), null, '\t') + '\n',
)

console.log('Internationalization files have been built successfully.')
