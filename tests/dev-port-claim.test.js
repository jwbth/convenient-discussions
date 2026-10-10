// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { claimPort, getWorktreeCommonDir } from '../bin/dev-port-claim.js'

/** @type {string} */
let tmpDir
/** @type {string} */
let claimsDir

const makeWorktreeDir = (/** @type {string} */ name) => {
	const dir = path.join(tmpDir, name)
	fs.mkdirSync(dir)

	return dir
}
const neverBusy = () => false

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-dev-port-'))
	claimsDir = path.join(tmpDir, 'cd-dev-ports')
})

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('claimPort', () => {
	it('claims the lowest free port and records the worktree', () => {
		const a = makeWorktreeDir('a')
		expect(claimPort(claimsDir, a, neverBusy)).toBe(9001)
		expect(fs.readFileSync(path.join(claimsDir, '9001'), 'utf8')).toBe(a)
	})

	it('returns the existing claim', () => {
		const a = makeWorktreeDir('a')
		claimPort(claimsDir, a, neverBusy)
		expect(claimPort(claimsDir, a, () => true)).toBe(9001)
	})

	it("skips other worktrees' claims", () => {
		claimPort(claimsDir, makeWorktreeDir('a'), neverBusy)
		expect(claimPort(claimsDir, makeWorktreeDir('b'), neverBusy)).toBe(9002)
	})

	it('skips ports another process listens on', () => {
		expect(claimPort(claimsDir, makeWorktreeDir('a'), (port) => port < 9003)).toBe(9003)
	})

	it('reclaims a claim whose worktree is gone', () => {
		const a = makeWorktreeDir('a')
		claimPort(claimsDir, a, neverBusy)
		fs.rmSync(a, { recursive: true })
		const b = makeWorktreeDir('b')
		expect(claimPort(claimsDir, b, neverBusy)).toBe(9001)
		expect(fs.readFileSync(path.join(claimsDir, '9001'), 'utf8')).toBe(b)
	})

	it('moves on when another checkout creates the claim first', () => {
		const other = makeWorktreeDir('other')
		const isBusy = (/** @type {number} */ port) => {
			// Simulates a concurrent claim between the check and the exclusive create
			if (port === 9001) {
				fs.writeFileSync(path.join(claimsDir, '9001'), other)
			}

			return false
		}
		expect(claimPort(claimsDir, makeWorktreeDir('a'), isBusy)).toBe(9002)
		expect(fs.readFileSync(path.join(claimsDir, '9001'), 'utf8')).toBe(other)
	})
})

describe('getWorktreeCommonDir', () => {
	it('returns undefined for the main checkout', () => {
		const main = makeWorktreeDir('main')
		fs.mkdirSync(path.join(main, '.git'))
		expect(getWorktreeCommonDir(main)).toBeUndefined()
	})

	it('resolves the common git dir of a worktree', () => {
		const commonDir = path.join(makeWorktreeDir('main'), '.git')
		const gitDir = path.join(commonDir, 'worktrees', 'wt')
		fs.mkdirSync(gitDir, { recursive: true })
		fs.writeFileSync(path.join(gitDir, 'commondir'), '../..\n')
		const worktree = makeWorktreeDir('wt')
		fs.writeFileSync(path.join(worktree, '.git'), `gitdir: ${gitDir}\n`)
		expect(getWorktreeCommonDir(worktree)).toBe(commonDir)
	})
})
