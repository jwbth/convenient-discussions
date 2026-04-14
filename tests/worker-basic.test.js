import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest'

import defaultPayload from './worker-default-payload'

describe('worker', () => {
	let postMessageSpy

	beforeEach(async () => {
		// Silence console output
		vi.spyOn(console, 'log').mockImplementation(() => {})
		vi.spyOn(console, 'warn').mockImplementation(() => {})
		vi.spyOn(console, 'error').mockImplementation(() => {})
		vi.spyOn(console, 'info').mockImplementation(() => {})
		vi.spyOn(console, 'debug').mockImplementation(() => {})

		vi.stubGlobal(
			'Worker',
			class Worker {
				constructor() {}
			},
		)

		postMessageSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {})

		await import('../src/worker/worker')
	})

	afterEach(() => {
		vi.unstubAllGlobals()
		vi.restoreAllMocks()
	})

	test('parse identifies comment, author, and date correctly', () => {
		const text = `<div class="mw-content-ltr mw-parser-output" lang="en" dir="ltr"><div class="mw-heading mw-heading2"><h2 id="Section">Section</h2></div>\n<p>Comment. <a href="/wiki/User:Example" title="User:Example">Example</a> (<a href="/wiki/User_talk:Example" title="User talk:Example">talk</a>) 00:00, 1 January 2026 (UTC)\n</p></div>`

		const payload = structuredClone(defaultPayload)
		payload.text = text

		window.dispatchEvent(new MessageEvent('message', { data: payload }))

		expect(postMessageSpy).toHaveBeenCalled()

		const msg = postMessageSpy.mock.calls.find((call) => call[0]?.task === 'parse')
		expect(msg).toBeDefined()
		const parseResult = msg[0]

		// console.log(parseResult.comments[0])

		expect(parseResult.comments).toHaveLength(1)
		expect(parseResult.comments[0].authorName).toBe('Example')
		expect(parseResult.comments[0].date.toISOString()).toBe('2026-01-01T00:00:00.000Z')
		expect(parseResult.comments[0].text).toBe('Section\nComment.')
	})

	test('parse identifies sections correctly', () => {
		const text = `<div class="mw-content-ltr mw-parser-output" lang="en" dir="ltr"><div class="mw-heading mw-heading2"><h2 id="Section">Section</h2></div>\n<p>Comment. <a href="/wiki/User:Example" title="User:Example">Example</a> (<a href="/wiki/User_talk:Example" title="User talk:Example">talk</a>) 00:00, 1 January 2026 (UTC)\n</p></div>>`

		const payload = structuredClone(defaultPayload)
		payload.text = text

		window.dispatchEvent(new MessageEvent('message', { data: payload }))
		expect(postMessageSpy).toHaveBeenCalled()
		const msg = postMessageSpy.mock.calls.find((call) => call[0]?.task === 'parse')
		const parseResult = msg[0]

		expect(parseResult.sections).toHaveLength(1)
		expect(parseResult.sections[0].headline).toBe('Section')
		expect(parseResult.comments).toHaveLength(1)
		expect(parseResult.comments[0].authorName).toBe('Example')
	})
})
