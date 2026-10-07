// Backstop for bin/eslint-fix-edit.js, run from .githooks/pre-commit: a file written by a shell
// command reaches the index without passing through the edit hook.

import { execFileSync } from 'node:child_process'

import { eslintFixFile } from './eslint-fix-file.js'

const staged = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACM', '-z'], {
	encoding: 'utf8',
})
	.split('\0')
	.filter(Boolean)

for (const file of staged) {
	// Without re-staging, the commit carries the unfixed text. A partially staged file gets committed
	// in full as a result.
	if (await eslintFixFile(file)) execFileSync('git', ['add', '--', file])
}
