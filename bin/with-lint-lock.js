// Runs `npm run lint` and `lint:fix` one at a time machine-wide: type-aware linting builds a
// TypeScript program of 0.8–1.5 GB (measured 2026-10-12), and several of them at once from parallel
// sessions and worktrees push the machine into swap. Taking turns is faster than thrashing together.
//
// Usage: node bin/with-lint-lock.js "<shell command>"

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const lockPath = path.join(os.tmpdir(), 'convenient-discussions-lint.lock')

/**
 * @param {number} pid
 * @returns {boolean}
 */
function isAlive(pid) {
	try {
		process.kill(pid, 0)

		return true
	} catch (error) {
		// EPERM: the process exists but belongs to another user
		return /** @type {NodeJS.ErrnoException} */ (error).code === 'EPERM'
	}
}

/**
 * @returns {number | undefined} `undefined` if the lock was released meanwhile.
 */
function readHolder() {
	try {
		return Number(fs.readFileSync(lockPath, 'utf8')) || undefined
	} catch {
		return undefined
	}
}

/**
 * Wait until no other live process holds the lock, then take it.
 */
async function acquire() {
	let isAnnounced = false
	for (;;) {
		try {
			fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' })

			return
		} catch (error) {
			if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EEXIST') throw error
		}

		// A holder killed without cleanup (e.g. the process tree killed by Ctrl+C on Windows) leaves its
		// PID behind.
		const holder = readHolder()
		if (holder && !isAlive(holder)) {
			fs.rmSync(lockPath, { force: true })
			continue
		}

		if (!isAnnounced) {
			console.error(`Waiting for another lint run${holder ? ` (PID ${holder})` : ''} to finish…`)
			isAnnounced = true
		}
		await sleep(1000)
	}
}

await acquire()
process.on('exit', () => {
	if (readHolder() === process.pid) {
		fs.rmSync(lockPath, { force: true })
	}
})

// Children inherit the priority, so the rest of the machine stays responsive during the run.
os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL)

process.exitCode = spawnSync(process.argv[2], { shell: true, stdio: 'inherit' }).status ?? 1
