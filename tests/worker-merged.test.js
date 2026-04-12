import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest'

import defaultPayload from './worker-default-payload'
import testGroups from './worker-test-cases-merged.json'

describe('worker - merged test cases', () => {
	let postMessageSpy

	beforeEach(async () => {
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

	// Run tests for just the first 2 test groups with first 2 tests each
	testGroups.slice(0, 2).forEach((group) => {
		describe(group.name, () => {
			group.tests.slice(0, 2).forEach((testCase) => {
				test(`${testCase.headline}`, () => {
					const payload = structuredClone(defaultPayload)
					payload.text = testCase.html

					window.dispatchEvent(new MessageEvent('message', { data: payload }))

					expect(postMessageSpy).toHaveBeenCalled()

					const msg = postMessageSpy.mock.calls.find((call) => call[0]?.task === 'parse')
					expect(msg).toBeDefined()
					const parseResult = msg[0]

					// Log actual results for debugging
					console.log('=== Test:', testCase.headline)
					console.log('Sections found:', parseResult.sections.length)
					parseResult.sections.forEach((section, i) => {
						console.log(`  Section ${i}:`, {
							headline: section.headline,
							isActionable: section.isActionable,
						})
					})
					console.log('Comments found:', parseResult.comments.length)
					parseResult.comments.forEach((comment, i) => {
						console.log(`  Comment ${i}:`, {
							level: comment.level,
							authorName: comment.authorName,
							date: comment.date?.toISOString(),
							textLength: comment.text?.length,
							text: comment.text,
							followsHeading: comment.followsHeading,
							isActionable: comment.isActionable,
						})
					})

					// Verify sections
					const expectedSections = testCase.isActionable ? 1 : 0
					expect(parseResult.sections).toHaveLength(expectedSections)

					if (expectedSections > 0) {
						expect(parseResult.sections[0].headline).toBe(testCase.headline)
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

						// Check isActionable
						expect(actualComment.isActionable).toBe(expectedComment.isActionable)
					})
				})
			})
		})
	})
})
