// Runs `npm run lint` and `lint:fix` one at a time machine-wide: type-aware linting builds a
// TypeScript program of 0.8–1.5 GB (measured 2026-10-12), and several of them at once from parallel
// sessions and worktrees push the machine into swap. Taking turns is faster than thrashing together.
//
// Usage: node bin/with-lint-lock.js "<shell command>"

import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

import lockfile from 'proper-lockfile'

const lockPath = path.join(os.tmpdir(), 'convenient-discussions-lint')
const lockOptions = { realpath: false }

if (await lockfile.check(lockPath, lockOptions)) {
	console.error('Waiting for another lint run to finish…')
}

// The lock stays fresh only while the event loop runs, hence `spawn` below, not `spawnSync`.
const release = await lockfile.lock(lockPath, {
	...lockOptions,
	retries: { forever: true, minTimeout: 1000, maxTimeout: 1000 },
})

// Children inherit the priority, so the rest of the machine stays responsive during the run.
os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL)

process.exitCode = await new Promise((resolve) => {
	spawn(process.argv[2], { shell: true, stdio: 'inherit' }).on('close', (code) => {
		resolve(code ?? 1)
	})
})
await release()
