/**
 * Vite plugin to transform require() calls to static imports.
 *
 * This plugin converts CommonJS require() calls to ES module imports by:
 * 1. Finding all require() calls in the code
 * 2. Extracting them to static imports at the top of the file
 * 3. Replacing the require() calls with references to the imported modules
 *
 * Note: Does NOT transform mw.loader.require() (MediaWiki's module system)
 *
 * @returns {import('vite').Plugin}
 */
export function requireTransformPlugin() {
	return {
		name: 'require-transform',
		enforce: 'pre',

		transform(code, id) {
			// Skip node_modules and non-JS files
			if (id.includes('node_modules') || !id.endsWith('.js')) {
				return null
			}

			// Skip if no require() calls exist
			if (!code.includes('require(')) {
				return null
			}

			// Skip if only mw.loader.require() exists
			if (!code.match(/(?<!mw\.loader\.)require\(/)) {
				return null
			}

			let transformed = code
			let hasChanges = false

			// Track all imports we need to add
			/** @type {Map<string, string | null>} */
			const importsToAdd = new Map() // modulePath -> importName (null for side-effect imports)
			let importCounter = 0

			/**
			 * Normalize module path - add .js only if no extension exists.
			 *
			 * @param {string} modulePath
			 * @returns {string}
			 */
			function normalizeModulePath(modulePath) {
				// If path already has an extension (like .json, .js, .less), keep it
				if (modulePath.match(/\.\w+$/)) {
					return modulePath
				}

				// Otherwise add .js
				return `${modulePath}.js`
			}

			// Pattern 1: CSS/Less imports - convert to static imports
			// require('./styles.less') -> import './styles.less'
			const cssRequirePattern = /require\(['"]([^'"]+\.(?:less|css))['"]\);?/g
			transformed = transformed.replace(cssRequirePattern, (match, cssPath) => {
				// Skip mw.loader.require
				const matchIndex = transformed.indexOf(match)
				const beforeMatch = transformed.substring(
					Math.max(0, matchIndex - 15),
					matchIndex,
				)
				if (beforeMatch.includes('mw.loader.')) {
					return match
				}

				if (!importsToAdd.has(cssPath)) {
					importsToAdd.set(cssPath, null) // null means side-effect import
				}
				hasChanges = true

				return '/* CSS import hoisted */'
			})

			// Pattern 2: Module imports with .default
			// require('./Module').default -> _require_Module_default
			const moduleRequirePattern = /require\(['"]([^'"]+)['"]\)\.default/g
			let match
			while ((match = moduleRequirePattern.exec(code)) !== null) {
				const fullMatch = match[0]
				const modulePath = match[1]

				// Skip mw.loader.require
				const beforeMatch = code.substring(
					Math.max(0, match.index - 15),
					match.index,
				)
				if (beforeMatch.includes('mw.loader.')) {
					continue
				}

				// Normalize the module path
				const normalizedPath = normalizeModulePath(modulePath)
				let importName = importsToAdd.get(normalizedPath)

				if (!importName) {
					importName = `_require_${importCounter++}`
					importsToAdd.set(normalizedPath, importName)
				}

				// Replace the require() call with the import name
				transformed = transformed.replace(fullMatch, importName)
				hasChanges = true
			}

			// Pattern 3: Destructuring imports
			// const { foo, bar } = require('./Module') -> import * as _require_0 from './Module.js'
			const destructuringPattern =
				/const\s*{\s*([^}]+)\s*}\s*=\s*require\(['"]([^'"]+)['"]\)/g
			while ((match = destructuringPattern.exec(code)) !== null) {
				const fullMatch = match[0]
				const destructuredNames = match[1]
				const modulePath = match[2]

				// Skip mw.loader.require
				const beforeMatch = code.substring(
					Math.max(0, match.index - 15),
					match.index,
				)
				if (beforeMatch.includes('mw.loader.')) {
					continue
				}

				// Skip if it's a CSS file
				if (modulePath.endsWith('.less') || modulePath.endsWith('.css')) {
					continue
				}

				// Normalize the module path
				const normalizedPath = normalizeModulePath(modulePath)
				let importName = importsToAdd.get(normalizedPath)

				if (!importName) {
					importName = `_require_${importCounter++}`
					importsToAdd.set(normalizedPath, importName)
				}

				// Replace with destructuring from the namespace import
				const replacement = `const { ${destructuredNames} } = ${importName}`
				transformed = transformed.replace(fullMatch, replacement)
				hasChanges = true
			}

			// Pattern 4: Simple module imports without .default (whole module)
			// require('./Module') -> _require_Module
			const simpleRequirePattern =
				/require\(['"]([^'"]+(?<!\.less)(?<!\.css))['"]\)(?!\.default)/g
			while ((match = simpleRequirePattern.exec(code)) !== null) {
				const fullMatch = match[0]
				const modulePath = match[1]

				// Skip mw.loader.require
				const beforeMatch = code.substring(
					Math.max(0, match.index - 15),
					match.index,
				)
				if (beforeMatch.includes('mw.loader.')) {
					continue
				}

				// Skip if it's a CSS file (already handled)
				if (modulePath.endsWith('.less') || modulePath.endsWith('.css')) {
					continue
				}

				// Skip if it's part of a destructuring pattern (already handled)
				const beforeRequire = code.substring(
					Math.max(0, match.index - 30),
					match.index,
				)
				if (beforeRequire.match(/const\s*{\s*[^}]*\s*}\s*=\s*$/)) {
					continue
				}

				// Normalize the module path
				const normalizedPath = normalizeModulePath(modulePath)
				let importName = importsToAdd.get(normalizedPath)

				if (!importName) {
					importName = `_require_${importCounter++}`
					importsToAdd.set(normalizedPath, importName)
				}

				// Replace the require() call with the import name
				transformed = transformed.replace(fullMatch, importName)
				hasChanges = true
			}

			if (!hasChanges) {
				return null
			}

			// Generate import statements
			const importStatements = []
			for (const [modulePath, importName] of importsToAdd.entries()) {
				if (importName === null) {
					// Side-effect import (CSS)
					importStatements.push(`import '${modulePath}';`)
				} else {
					// Check if this import is used in a destructuring pattern
					const isDestructured =
						transformed.includes(`const { `) &&
						transformed.includes(`} = ${importName}`)

					if (isDestructured) {
						// Namespace import for destructuring
						importStatements.push(
							`import * as ${importName} from '${modulePath}';`,
						)
					} else {
						// Default import
						importStatements.push(`import ${importName} from '${modulePath}';`)
					}
				}
			}

			// Find where to insert imports (after existing imports or at the top)
			const existingImportMatch = transformed.match(
				/^((?:import\s+.*?;\s*\n)*)/,
			)
			const insertPos = existingImportMatch ? existingImportMatch[0].length : 0

			// Insert the new imports
			transformed =
				transformed.substring(0, insertPos) +
				importStatements.join('\n') +
				(importStatements.length > 0 ? '\n' : '') +
				transformed.substring(insertPos)

			return { code: transformed, map: null }
		},
	}
}
