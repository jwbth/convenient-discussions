import fs from 'node:fs'
import os from 'node:os'

import { ESLint } from 'eslint'
import ts from 'typescript'
import tseslint from 'typescript-eslint'

// Agents edit while other sessions lint; the machine stays responsive if the hooks yield.
os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL)

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

// Type information costs a TypeScript program per run, which doubles the hook's time and memory
// (measured 2026-10-12 on an idle machine: 2.7–3.6 s and 0.32–0.41 GB per file without it, 4.7–8.1 s
// and 0.53–0.84 GB with it).
// `npm run lint` still runs these rules.
const typeAwareRules = new Set(
	Object.entries(/** @type {import('eslint').ESLint.Plugin} */ (tseslint.plugin).rules ?? {})
		.filter(
			([, rule]) =>
				/** @type {{ requiresTypeChecking?: boolean } | undefined} */ (rule.meta?.docs)
					?.requiresTypeChecking,
		)
		.map(([name]) => `@typescript-eslint/${name}`),
)

const eslint = new ESLint({
	cache: true,
	fix: true,
	overrideConfig: { languageOptions: { parserOptions: { project: null } } },
	ruleFilter: ({ ruleId }) => !excludedRules.has(ruleId) && !typeAwareRules.has(ruleId),
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
