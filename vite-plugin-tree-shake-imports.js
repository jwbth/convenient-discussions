/**
 * Vite plugin to tree-shake imports in startup.js for single builds.
 * This plugin replaces dynamic imports with static imports of pre-built i18n files.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Get list of available config files from config/wikis directory
 *
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
 * Get list of available i18n files from dist/convenientDiscussions-i18n directory
 *
 * @returns {string[]}
 */
function getAvailableI18ns() {
	const i18nDir = path.join(__dirname, 'dist', 'convenientDiscussions-i18n')

	return fs
		.readdirSync(i18nDir)
		.filter((file) => file.endsWith('.js'))
		.map((file) => file.replace(/\.js$/, ''))
}

/**
 * Convert config name to import variable name
 *
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
				throw new Error(`Language '${lang}' not found in dist/convenientDiscussions-i18n/`)
			}

			// Replace the import of English i18n with the pre-built version
			// This ensures entities are already replaced
			let transformedCode = code.replace(
				/import '\.\.\/\.\.\/dist\/convenientDiscussions-i18n\/en'/g,
				`import '../../dist/convenientDiscussions-i18n/en.js'`,
			)

			// If we have a specific language (not English), import it statically
			if (lang && lang !== 'en') {
				// Find the import section (after the English i18n import)
				const enImportLine = transformedCode.indexOf(
					`import '../../dist/convenientDiscussions-i18n/en.js'`,
				)

				if (enImportLine === -1) {
					console.error('❌ Could not find English i18n import line')

					return null
				}

				const nextLineAfterEn = transformedCode.indexOf('\n', enImportLine) + 1

				// Insert the language-specific i18n import
				transformedCode =
					transformedCode.slice(0, nextLineAfterEn) +
					`import '../../dist/convenientDiscussions-i18n/${lang}.js'\n` +
					transformedCode.slice(nextLineAfterEn)

				// Also ensure the i18n is available on cd object after the hook
				const hookMarker = "mw.hook('convenientDiscussions.started').fire(cd)"
				const hookIndex = transformedCode.indexOf(hookMarker)
				if (hookIndex === -1) {
					console.error('❌ Could not find hook marker for initialization')
				} else {
					const hookEndIndex = transformedCode.indexOf('\n', hookIndex)
					transformedCode =
						transformedCode.slice(0, hookEndIndex) +
						`\n\n\t// Ensure ${lang} i18n is available on cd object\n\tif (window.convenientDiscussions?.i18n?.['${lang}']) {\n\t\tcd.i18n = cd.i18n || {}\n\t\tcd.i18n['${lang}'] = window.convenientDiscussions.i18n['${lang}']\n\t}` +
						transformedCode.slice(hookEndIndex)
				}
			}

			// If we have a specific wiki config, import it statically
			if (wiki) {
				const defaultConfigLine = transformedCode.indexOf('import defaultConfig from')
				const nextLineAfterDefault = transformedCode.indexOf('\n', defaultConfigLine) + 1

				const varName = configToVarName(wiki)
				transformedCode =
					transformedCode.slice(0, nextLineAfterDefault) +
					`import ${varName} from '../../config/wikis/${wiki}.js'\n` +
					transformedCode.slice(nextLineAfterDefault)

				// Set cd.config to the imported config right after the mw.hook line
				const hookMarker = "mw.hook('convenientDiscussions.started').fire(cd)"
				const hookIndex = transformedCode.indexOf(hookMarker)
				if (hookIndex !== -1) {
					const hookEndIndex = transformedCode.indexOf('\n', hookIndex)
					transformedCode =
						transformedCode.slice(0, hookEndIndex) +
						`\n\n\tcd.config = ${varName}` +
						transformedCode.slice(hookEndIndex)
				}
			}

			// Remove the loadSingleLangInDevOrSingleMode function since we're importing pre-built i18n
			// This function is only used in dev mode, not in single builds
			transformedCode = transformedCode.replace(
				/\/\*\*\s*\n\s*\* Load the i18n file for the single language code\. This function is used in dev mode and\s*\n\s*\* single mode \(where it's replaced to just return Promise\.resolve\(\) by the tree-shake plugin\)\.\s*\n\s*\*\s*\n\s*\* @param \{string\} lang\s*\n\s*\*\/\s*\nasync function loadSingleLangInDevOrSingleMode\([^)]+\) \{[\s\S]*?\n\}/,
				'',
			)

			// Replace the IS_DEV || IS_SINGLE branch in getStrings() to remove dynamic imports
			// Since we're importing pre-built i18n files statically, we don't need the dynamic import logic
			transformedCode = transformedCode.replace(
				/if \(IS_DEV \|\| IS_SINGLE\) \{\s*return loadSingleLangInDevOrSingleMode\(lang\)\s*\}/g,
				`// In single mode, i18n is already loaded statically
				return Promise.resolve()`,
			)

			console.log(`✅ Tree-shaken startup.js for ${wiki} (${lang})`)

			return {
				code: transformedCode,
				map: null,
			}
		},
	}
}
