import fs from 'node:fs'

import { ESLint } from 'eslint'
import ts from 'typescript'

// The rules whose fixes need a human eye live in .vscode/settings.json, where fix-on-save reads them
// too. TypeScript's parser because the file is JSONC.
const excludedRules = new Set(
	/** @type {string[]} */ (
		ts.parseConfigFileTextToJson(
			'settings.json',
			fs.readFileSync(new URL('../.vscode/settings.json', import.meta.url), 'utf8'),
		).config['eslint.codeActionsOnSave.rules']
	)
		.filter((rule) => rule.startsWith('!'))
		.map((rule) => rule.slice(1)),
)

const eslint = new ESLint({
	cache: true,
	fix: (message) => !message.ruleId || !excludedRules.has(message.ruleId),
})

/**
 * Apply ESLint's automatic fixes to one file in place. Returns whether it changed.
 *
 * @param {string} file
 * @returns {Promise<boolean>}
 */
export async function eslintFixFile(file) {
	if (await eslint.isPathIgnored(file)) return false

	const [result] = await eslint.lintFiles([file])
	if (result.output === undefined) return false
	await ESLint.outputFixes([result])
	return true
}
