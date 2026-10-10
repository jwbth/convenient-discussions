import { execFileSync } from 'node:child_process'

import { devPort } from '../dev-port.js'

const isWindows = process.platform === 'win32'

/**
 * @returns {string[]}
 */
function getListenerPids() {
	if (isWindows) {
		return [
			...new Set(
				execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' })
					.split('\n')
					.map((line) => line.trim().split(/\s+/))
					.filter(
						([, local, , state]) => state === 'LISTENING' && local.endsWith(`:${devPort}`),
					)
					.map((fields) => fields[4]),
			),
		]
	}

	try {
		return execFileSync('lsof', ['-t', `-iTCP:${devPort}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
			.split('\n')
			.filter(Boolean)
	} catch {
		// lsof exits with 1 when nothing matches
		return []
	}
}

const pids = getListenerPids()
pids.forEach((pid) => {
	if (isWindows) {
		execFileSync('taskkill', ['/T', '/F', '/PID', pid], { stdio: 'inherit' })
	} else {
		process.kill(Number(pid))
	}
})

console.log(
	pids.length ? `Stopped the dev server on port ${devPort}.` : `Nothing listens on port ${devPort}.`,
)
