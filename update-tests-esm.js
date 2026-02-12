import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const testsDir = path.join(__dirname, 'tests')

const files = fs.readdirSync(testsDir).filter((f) => f.endsWith('.test.js'))

files.forEach((file) => {
	const filePath = path.join(testsDir, file)
	let content = fs.readFileSync(filePath, 'utf8')
	let changed = false

	// 1. Add @jest/globals import if missing
	if (!content.includes("from '@jest/globals'")) {
		const importStatement =
			"import { jest, describe, beforeEach, afterEach, test, expect } from '@jest/globals'\n"
		// Check for @jest-environment tag
		const hasEnvTag = content.includes('@jest-environment')
		if (hasEnvTag) {
			const lines = content.split('\n')
			let insertIndex = 0
			for (const [i, line] of lines.entries()) {
				if (line.includes('*/')) {
					insertIndex = i + 1
					break
				}
			}
			lines.splice(insertIndex, 0, importStatement)
			content = lines.join('\n')
		} else {
			content = importStatement + content
		}
		changed = true
	}

	// 2. Convert require calls to imports
	// Find all require('...') strings
	const requireRegex = /require\(['"]([^'"]+)['"]\)/g
	const matches = [...content.matchAll(requireRegex)]

	if (matches.length > 0) {
		const importsToAdd = new Map() // modulePath -> varName
		let importBlock = ''

		for (const match of matches) {
			const modulePath = match[1]
			if (!importsToAdd.has(modulePath)) {
				// Generate variable name
				// e.g. ../src/loader/cd -> mock_src_loader_cd
				// e.g. oojs -> mock_oojs
				let safeName = 'mock_' + modulePath.replace(/^(\.\.?\/)+/, '').replace(/[^a-zA-Z0-9]/g, '_')

				// Deduplicate
				const originalSafeName = safeName
				let counter = 1
				while ([...importsToAdd.values()].includes(safeName)) {
					safeName = originalSafeName + '_' + counter++
				}

				importsToAdd.set(modulePath, safeName)
			}
		}

		// Replace require calls with var usage
		// We must do replacement carefully to not break overlapping things, though matchAll gives exact positions?
		// Simpler: replace by string literal since we constructed the map from all occurrences

		// Sort keys by length desc to avoid prefix matching issues if any (unlikely with full string match)
		const sortedModules = [...importsToAdd.keys()].sort((a, b) => b.length - a.length)

		for (const mod of sortedModules) {
			const varName = importsToAdd.get(mod)
			// Replace all occurrences of require('mod')
			// Using split/join is safest for literal replacement
			content = content.split(`require('${mod}')`).join(varName)
			content = content.split(`require("${mod}")`).join(varName)
		}

		// Construct import statements
		for (const [mod, varName] of importsToAdd) {
			// If the module ends with .less, we don't need a var name strictly, but we mapped it to a var.
			// For styles, import '...' is enough, but our regex found require(...), so strictly speaking it was returning something.
			// However, for styles require('...less') usually returns empty object or string.
			// We will use `import * as varName` to be safe for all require usage.

			importBlock += `import * as ${varName} from '${mod}';\n`
		}

		// Insert imports after existing imports or after @jest/globals
		// Find where @jest/globals is
		const jestImportIndex = content.indexOf("from '@jest/globals'")
		if (jestImportIndex === -1) {
			// Should not happen as we added it, but just in case
			content = importBlock + content
		} else {
			const endOfLine = content.indexOf('\n', jestImportIndex)
			content = content.slice(0, endOfLine + 1) + importBlock + content.slice(endOfLine + 1)
		}
		changed = true
	}

	// 3. Special fix: if .default was accessed on the require result, and we changed it to `import * as name`,
	// then `name.default` is correct IF the module has default export.
	// But if the require logic was `require('...').default`, now it is `name.default`. This is preserved.
	// `require('...')` -> `name`
	// `require('...').default` -> `name.default`
	// This logic holds for CommonJS interop via `import *`.

	if (changed) {
		fs.writeFileSync(filePath, content)
		console.log(`Updated ${file}`)
	}
})
