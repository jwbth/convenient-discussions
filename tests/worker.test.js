import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest'

import defaultPayload from './worker-default-payload'
import testGroups from './worker-test-cases.json'

describe('worker - merged test cases', () => {
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

	// Run all tests
	testGroups.forEach((group) => {
		describe(group.name, () => {
			group.tests.forEach((testCase) => {
				test(`${testCase.headline}`, () => {
					const payload = structuredClone(defaultPayload)
					payload.text = testCase.html

					window.dispatchEvent(new MessageEvent('message', { data: payload }))

					expect(postMessageSpy).toHaveBeenCalled()

					const msg = postMessageSpy.mock.calls.find((call) => call[0]?.task === 'parse')
					expect(msg).toBeDefined()
					const parseResult = msg[0]

					// Verify sections - check if primary section exists
					if (testCase.sections && testCase.sections.length > 0) {
						const expectedHeadline = testCase.sections[0].headline
						const primarySection = parseResult.sections.find((s) => s.headline === expectedHeadline)
						expect(primarySection).toBeDefined()
						expect(primarySection.headline).toBe(expectedHeadline)
					} else {
						// No sections expected
						expect(parseResult.sections).toHaveLength(0)
					}

					// Verify comments
					expect(parseResult.comments).toHaveLength(testCase.comments.length)

					testCase.comments.forEach((expectedComment, index) => {
						const actualComment = parseResult.comments[index]

						// Check level
						expect(actualComment.level).toBe(expectedComment.level)

						// Check author name
						expect(actualComment.authorName).toBe(expectedComment.authorName)

						// Check date if present
						if (expectedComment.date) {
							expect(actualComment.date?.toISOString()).toBe(expectedComment.date)
						} else {
							expect(actualComment.date).toBeUndefined()
						}

						// Check text (trimmed for comparison)
						expect(actualComment.text?.trim()).toBe(expectedComment.text?.trim())

						// Check followsHeading
						expect(actualComment.followsHeading).toBe(expectedComment.followsHeading)
					})
				})
			})
		})
	})
})
