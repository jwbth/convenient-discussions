// Node builtins only: setup-worktree.js runs this before node_modules exists.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export const mainCheckoutPort = 9000

const firstWorktreePort = 9001

/**
 * Get the common git dir if `dir` is a linked worktree (its `.git` is a file pointing into
 * `<common git dir>/worktrees/<name>`).
 *
 * @param {string} dir Checkout root.
 * @returns {string | undefined} `undefined` for the main checkout.
 */
export function getWorktreeCommonDir(dir) {
	const gitPath = path.join(dir, '.git')
	if (!fs.statSync(gitPath, { throwIfNoEntry: false })?.isFile()) return

	const gitDirMatch = /^gitdir: (.+)$/m.exec(fs.readFileSync(gitPath, 'utf8'))
	if (!gitDirMatch) return

	const gitDir = path.resolve(dir, gitDirMatch[1].trim())

	return path.resolve(gitDir, fs.readFileSync(path.join(gitDir, 'commondir'), 'utf8').trim())
}

/**
 * Check whether a process listens on the port. Both connect and bind are tried: connect sees
 * listeners on either loopback address, bind sees ports Windows reserves.
 *
 * @param {number} port
 * @returns {boolean}
 */
export function isPortBusy(port) {
	const script = `
		const net = require('node:net')
		const port = Number(process.argv[1])
		const connects = (host) => new Promise((resolve) => {
			const socket = net.connect({ port, host }, () => {
				socket.destroy()
				resolve(true)
			})
			socket.on('error', () => resolve(false))
		})
		const binds = () => new Promise((resolve) => {
			const server = net.createServer()
			server.once('error', () => resolve(false))
			server.listen({ port, host: 'localhost' }, () => server.close(() => resolve(true)))
		})
		Promise.all([connects('127.0.0.1'), connects('::1')]).then(async (results) => {
			process.exit(results.includes(true) || !(await binds()) ? 1 : 0)
		})
	`

	return spawnSync(process.execPath, ['-e', script, String(port)]).status !== 0
}

/**
 * @param {string} file
 * @returns {string | undefined}
 */
function readClaim(file) {
	try {
		return fs.readFileSync(file, 'utf8')
	} catch {
		return
	}
}

/**
 * Get the worktree's port claim from `claimsDir`, claiming the lowest free port from 9001 up if it
 * has none. A claim is a file named after the port that holds the claiming worktree's path; one
 * whose worktree directory no longer exists is stale and gets reclaimed.
 *
 * @param {string} claimsDir
 * @param {string} worktreeDir
 * @param {(port: number) => boolean} [isBusy]
 * @returns {number}
 */
export function claimPort(claimsDir, worktreeDir, isBusy = isPortBusy) {
	fs.mkdirSync(claimsDir, { recursive: true })
	const ownClaim = fs
		.readdirSync(claimsDir)
		.find((name) => readClaim(path.join(claimsDir, name)) === worktreeDir)
	if (ownClaim) {
		return Number(ownClaim)
	}

	for (let port = firstWorktreePort; ; port++) {
		const file = path.join(claimsDir, String(port))
		const owner = readClaim(file)
		if (owner !== undefined) {
			if (fs.existsSync(owner)) continue

			fs.rmSync(file, { force: true })
		}
		if (isBusy(port)) continue

		try {
			// Exclusive create, so that of two checkouts claiming at once, one gets the next port
			fs.writeFileSync(file, worktreeDir, { flag: 'wx' })

			return port
		} catch (error) {
			if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EEXIST') throw error
		}
	}
}

/**
 * Get the dev server port of the checkout: 9000 for the main one, the claimed one for a worktree.
 *
 * @param {string} dir Checkout root.
 * @returns {number}
 */
export function getCheckoutPort(dir) {
	const commonDir = getWorktreeCommonDir(dir)

	return commonDir ? claimPort(path.join(commonDir, 'cd-dev-ports'), dir) : mainCheckoutPort
}
