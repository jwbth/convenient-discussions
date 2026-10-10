// Makes a git worktree runnable by borrowing from the main checkout. The worktree has no
// node_modules of its own: inside the main checkout, Node, npm and TypeScript find the main one by
// walking up. Linking it instead would be unsafe on Windows: `git worktree remove` follows a junction
// and empties its target.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getWorktreeCommonDir } from './dev-port-claim.js'

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const commonDir = getWorktreeCommonDir(rootDir)

if (commonDir) {
	const mainDir = path.dirname(commonDir)
	const inRoot = (/** @type {string} */ name) => path.join(rootDir, name)

	if (path.relative(mainDir, rootDir).startsWith('..')) {
		throw new Error(`The worktree must be inside the main checkout (${mainDir}) to use its node_modules.`)
	}

	if (!fs.existsSync(inRoot('.env')) && fs.existsSync(path.join(mainDir, '.env'))) {
		fs.copyFileSync(path.join(mainDir, '.env'), inRoot('.env'))
	}

	if (
		!fs.existsSync(inRoot('dist/convenientDiscussions-i18n/en.js')) ||
		!fs.existsSync(inRoot('data/i18n-list.json'))
	) {
		execSync('npm run i18n', { cwd: rootDir, stdio: 'inherit' })
	}
}
