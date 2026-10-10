// Makes a git worktree runnable by borrowing from the main checkout. Node builtins only: it runs
// before node_modules exists.
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

	if (!fs.existsSync(inRoot('node_modules'))) {
		fs.symlinkSync(path.join(mainDir, 'node_modules'), inRoot('node_modules'), 'junction')
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
