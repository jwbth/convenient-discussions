/**
 * Vite plugin to tree-shake imports in startup.js for single builds.
 * This plugin dynamically generates the entry point with only the needed imports.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Get list of available config files from config/wikis directory
 * @returns {string[]}
 */
function getAvailableConfigs() {
	const configDir = path.join(__dirname, 'config', 'wikis')
	return fs
		.readdirSync(configDir)
		.filter((file) => file.endsWith('.js'))
		.map((file) => file.replace(/\.js$/, ''))
}

/**
 * Get list of available i18n files from i18n directory
 * @returns {string[]}
 */
function getAvailableI18ns() {
	const i18nDir = path.join(__dirname, 'i18n')
	return fs
		.readdirSync(i18nDir)
		.filter((file) => file.endsWith('.json'))
		.map((file) => file.replace(/\.json$/, ''))
}

// Map i18n codes to dayjs locale codes
const dayjsMap = {
	'ar': 'ar',
	'az': 'az',
	'bn': 'bn',
	'de': 'de',
	'el': 'el',
	'es': 'es',
	'fa': 'fa',
	'fi': 'fi',
	'fr': 'fr',
	'ga': 'ga',
	'he': 'he',
	'hi': 'hi',
	'id': 'id',
	'it': 'it',
	'ja': 'ja',
	'ko': 'ko',
	'lb': 'lb',
	'lt': 'lt',
	'mk': 'mk',
	'nl': 'nl',
	'pl': 'pl',
	'pt-br': 'pt-br',
	'ru': 'ru',
	'sk': 'sk',
	'sl': 'sl',
	'sv': 'sv',
	'te': 'te',
	'th': 'th',
	'tr': 'tr',
	'uk': 'uk',
	'vi': 'vi',
	'zh-hans': 'zh-cn',
	'zh-hant': 'zh-tw',
}

// Map i18n codes to date-fns locale codes
const dateFnsMap = {
	'ar': 'ar',
	'az': 'az',
	'bn': 'bn',
	'de': 'de',
	'el': 'el',
	'es': 'es',
	'fa': 'fa-IR',
	'fi': 'fi',
	'fr': 'fr',
	'he': 'he',
	'hi': 'hi',
	'id': 'id',
	'it': 'it',
	'ja': 'ja',
	'ko': 'ko',
	'lb': 'lb',
	'lt': 'lt',
	'mk': 'mk',
	'nl': 'nl',
	'pl': 'pl',
	'pt-br': 'pt-BR',
	'ru': 'ru',
	'sk': 'sk',
	'sl': 'sl',
	'sv': 'sv',
	'te': 'te',
	'th': 'th',
	'tr': 'tr',
	'uk': 'uk',
	'vi': 'vi',
	'zh-hans': 'zh-CN',
	'zh-hant': 'zh-TW',
}

/**
 * Convert config name to import variable name
 * @param {string} config
 * @returns {string}
 */
function configToVarName(config) {
	return (
		'config' +
		config
			.split('-')
			.map((p) => p.charAt(0).toUpperCase() + p.slice(1))
			.join('')
	)
}

/**
 * Convert i18n code to import variable name
 * @param {string} lang
 * @returns {string}
 */
function i18nToVarName(lang) {
	return (
		'i18n' +
		lang
			.split('-')
			.map((p) => p.charAt(0).toUpperCase() + p.slice(1))
			.join('')
	)
}

/**
 * Convert locale code to import variable name
 * @param {string} locale
 * @returns {string}
 */
function localeToVarName(locale) {
	return (
		'dayjs' +
		locale
			.split('-')
			.map((p) => p.charAt(0).toUpperCase() + p.slice(1))
			.join('')
	)
}

/**
 * Convert date-fns locale code to import variable name
 * @param {string} locale
 * @returns {string}
 */
function dateFnsToVarName(locale) {
	return 'dateFns' + locale.replace(/-/g, '')
}

/**
 * @param {object} options
 * @param {boolean} options.isSingle
 * @param {string} [options.wiki]
 * @param {string} [options.lang]
 * @returns {import('vite').Plugin}
 */
export function treeShakeImportsPlugin({ isSingle, wiki, lang }) {
	return {
		name: 'tree-shake-imports',
		enforce: 'pre',

		transform(code, id) {
			// Only transform startup.js in single mode
			if (!isSingle || !id.includes('src/loader/startup.js')) {
				return null
			}

			console.log(`🌳 Tree-shaking imports for single build: ${wiki} (${lang})`)

			// Get available configs and i18n files
			const availableConfigs = getAvailableConfigs()
			const availableI18ns = getAvailableI18ns()

			// Validate wiki config exists
			if (wiki && !availableConfigs.includes(wiki)) {
				console.error(
					`❌ Config '${wiki}' not found. Available configs: ${availableConfigs.join(', ')}`,
				)
				throw new Error(`Config '${wiki}' not found in config/wikis/`)
			}

			// Validate language exists
			if (lang && !availableI18ns.includes(lang)) {
				console.error(
					`❌ Language '${lang}' not found. Available languages: ${availableI18ns.join(', ')}`,
				)
				throw new Error(`Language '${lang}' not found in i18n/`)
			}

			// Generate only the needed imports
			let imports = []

			// Always import these
			imports.push(`import '../shared/polyfills'`)
			imports.push(`import './convenientDiscussions'`)
			imports.push(`import '../../dist/convenientDiscussions-i18n/en'`)
			imports.push(`import defaultConfig from '../../config/default'`)
			imports.push(`import configUrls from '../../config/urls.json'`)
			imports.push(`import i18nList from '../../data/i18nList.json'`)
			imports.push(
				`import languageFallbacks from '../../data/languageFallbacks.json'`,
			)
			imports.push(`import { unique } from '../shared/utils-general'`)
			imports.push(`import cd from './cd'`)
			imports.push(``)

			// Import only the needed config
			if (wiki) {
				const varName = configToVarName(wiki)
				imports.push(`import ${varName} from '../../config/wikis/${wiki}.js'`)
			}

			// Import only the needed i18n files (always include 'en')
			const neededLangs = new Set(['en'])
			if (lang && lang !== 'en') {
				neededLangs.add(lang)
			}

			for (const l of neededLangs) {
				const varName = i18nToVarName(l)
				imports.push(`import ${varName} from '../../i18n/${l}.json'`)
			}

			// Import only the needed dayjs locales
			for (const l of neededLangs) {
				if (l !== 'en' && dayjsMap[l]) {
					const dayjsLocale = dayjsMap[l]
					const varName = localeToVarName(dayjsLocale)
					imports.push(
						`import ${varName} from '../../node_modules/dayjs/esm/locale/${dayjsLocale}.js'`,
					)
				}
			}

			// Import only the needed date-fns locales
			for (const l of neededLangs) {
				if (dateFnsMap[l]) {
					const dateFnsLocale = dateFnsMap[l]
					const varName = dateFnsToVarName(dateFnsLocale)
					imports.push(
						`import * as ${varName} from '../../node_modules/date-fns/locale/${dateFnsLocale}.js'`,
					)
				}
			}

			// Find the bootstrap function in the original code
			const bootstrapMarker = 'async function bootstrap() {'
			const bootstrapIndex = code.indexOf(bootstrapMarker)
			if (bootstrapIndex === -1) {
				console.error('❌ Could not find bootstrap function in startup.js')
				return null
			}

			// Find where to inject config/i18n initialization (after mw.hook line)
			const hookMarker = "mw.hook('convenientDiscussions.started').fire(cd)"
			const hookIndex = code.indexOf(hookMarker, bootstrapIndex)
			if (hookIndex === -1) {
				console.error('❌ Could not find hook marker in startup.js')
				return null
			}

			// Find the end of the hook line
			const hookEndIndex = code.indexOf('\n', hookIndex)

			// Generate initialization code for config
			let initCode = '\n\n'
			if (wiki) {
				const varName = configToVarName(wiki)
				initCode += `\tcd.config = ${varName}\n`
			}

			// Generate initialization code for i18n
			initCode += `\tcd.i18n = {}\n`
			for (const l of neededLangs) {
				const varName = i18nToVarName(l)
				initCode += `\tcd.i18n['${l}'] = ${varName}\n`

				// Add locale data for non-English languages
				if (l !== 'en' && dayjsMap[l]) {
					const dayjsLocale = dayjsMap[l]
					const dayjsVarName = localeToVarName(dayjsLocale)
					initCode += `\tcd.i18n['${l}'].dayjsLocale = ${dayjsVarName}\n`
				}

				if (dateFnsMap[l]) {
					const dateFnsLocale = dateFnsMap[l]
					const dateFnsVarName = dateFnsToVarName(dateFnsLocale)
					initCode += `\tcd.i18n['${l}'].dateFnsLocale = ${dateFnsVarName}\n`
				}
			}

			// Inject the initialization code after the hook line
			const beforeHook = code.slice(0, hookEndIndex)
			const afterHook = code.slice(hookEndIndex)

			// Find the start of the actual code (before bootstrap function)
			const codeStartMarker = ';(async () => {'
			const codeStartIndex = code.indexOf(codeStartMarker)
			if (codeStartIndex === -1) {
				console.error('❌ Could not find code start marker in startup.js')
				return null
			}

			// Replace the imports section and inject initialization
			const newCode =
				imports.join('\n') +
				'\n' +
				beforeHook.slice(codeStartIndex, hookEndIndex) +
				initCode +
				afterHook

			console.log(
				`✅ Tree-shaken startup.js: ${neededLangs.size} languages, 1 config`,
			)

			return {
				code: newCode,
				map: null,
			}
		},
	}
}
