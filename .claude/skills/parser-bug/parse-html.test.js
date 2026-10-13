// Feedback loop for parser bugs. Copy to `tests/zz-parse-html.test.js` and run:
//
//   PARSE_HTML=<path to .html> npx vitest run tests/zz-parse-html.test.js
//
// Then sharpen the expectation to the reported symptom.

import fs from 'node:fs'

import { test, expect, vi } from 'vitest'

import defaultPayload from './worker-default-payload'

test('parse', async () => {
	vi.stubGlobal('Worker', class Worker {})
	// Let debug logs through; everything else stays silent
	vi.spyOn(console, 'info').mockImplementation((...args) => {
		process.stdout.write(args.join(' ') + '\n')
	})
	vi.spyOn(console, 'log').mockImplementation(() => {})
	vi.spyOn(console, 'warn').mockImplementation(() => {})
	vi.spyOn(console, 'error').mockImplementation(() => {})
	vi.spyOn(console, 'debug').mockImplementation(() => {})
	const postMessageSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {})
	await import('../src/worker/worker')

	const payload = structuredClone(defaultPayload)
	payload.text = fs.readFileSync(/** @type {string} */ (process.env.PARSE_HTML), 'utf8')
	window.dispatchEvent(new MessageEvent('message', { data: payload }))
	const { comments } = postMessageSpy.mock.calls.find((call) => call[0]?.task === 'parse')[0]

	for (const c of comments) {
		process.stdout.write(
			`[parse] ${c.authorName} ${c.date?.toISOString()} L${c.level}: ${JSON.stringify(c.text.slice(0, 100))}\n`,
		)
	}

	const comment = comments.find(
		(c) => c.authorName === 'Example' && c.date?.toISOString() === '2026-01-01T00:00:00.000Z',
	)
	expect(comment.text).toContain('Expected text')
})
