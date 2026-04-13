/**
 * Regenerate expected test data by running the actual parser
 *
 * Run with: npm run test:regenerate
 */

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, test, beforeEach, vi, afterEach } from 'vitest'

import defaultPayload from './worker-default-payload'
import testGroupsOriginal from './worker-test-cases-merged.json'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Skip this test when running all tests, only run when targeted directly
// Set REGENERATE=1 environment variable to run this test
const isDirectRun = process.env.REGENERATE === '1'

describe.skipIf(!isDirectRun)('Regenerate expected test data', () => {
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

	test('regenerate all test cases', () => {
		// Clone the test groups to avoid modifying the original
		const testGroups = JSON.parse(JSON.stringify(testGroupsOriginal))

		let totalTests = 0
		let processedTests = 0

		console.log('\n\nRegenerating expected test data...\n')

		for (const group of testGroups) {
			console.log(`\nProcessing group: ${group.name}`)

			for (const testCase of group.tests) {
				totalTests++
				console.log(`  - ${testCase.headline}`)

				try {
					// Clear previous calls
					postMessageSpy.mockClear()

					// Create payload
					const payload = structuredClone(defaultPayload)
					payload.text = testCase.html

					// Dispatch the message event
					window.dispatchEvent(new MessageEvent('message', { data: payload }))

					// Find the parse result
					const msg = postMessageSpy.mock.calls.find((call) => call[0]?.task === 'parse')

					if (!msg) {
						console.log(`    ⚠ No parse result returned`)
						continue
					}

					const parseResult = msg[0]

					// Update sections - keep only the primary section for this test case
					const primarySection = parseResult.sections.find((s) => s.headline === testCase.headline)

					if (primarySection) {
						testCase.sections = [
							{
								headline: primarySection.headline,
							},
						]
					} else if (parseResult.sections.length > 0) {
						// If primary not found, keep the first section
						testCase.sections = [
							{
								headline: parseResult.sections[0].headline,
							},
						]
					} else {
						testCase.sections = []
					}

					// Update comments with actual parser output
					testCase.comments = parseResult.comments.map((comment) => {
						const expectedComment = {
							level: comment.level,
							authorName: comment.authorName,
							text: comment.text,
							followsHeading: comment.followsHeading,
						}

						// Add date if present
						if (comment.date) {
							expectedComment.date = comment.date.toISOString()
						}

						return expectedComment
					})

					// Drop isActionable from test case itself
					delete testCase.isActionable

					processedTests++
					console.log(
						`    ✓ Updated (${parseResult.comments.length} comments, ${parseResult.sections.length} sections found, ${testCase.sections.length} kept)`,
					)
				} catch (error) {
					console.log(`    ✗ Error: ${error.message}`)
					console.error(error)
				}
			}
		}

		console.log(`\n\nProcessed ${processedTests}/${totalTests} test cases`)

		// Write the updated test cases back to file
		const outputPath = join(__dirname, 'worker-test-cases-merged-regenerated.json')
		writeFileSync(outputPath, JSON.stringify(testGroups, null, '\t'), 'utf-8')

		console.log(`\nWrote updated test cases to: ${outputPath}`)
		console.log(
			'\nReview the changes, then rename to worker-test-cases-merged.json if satisfied.\n',
		)
	})
})
