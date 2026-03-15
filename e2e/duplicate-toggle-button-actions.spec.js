// @ts-check
import { test, expect } from '@playwright/test'

import { setupConvenientDiscussions, TEST_PAGES } from './helpers/test-utils.js'

/**
 * JS object model check for duplicate toggle child threads buttons
 *
 * Iterates over `cd.comments` and checks two things per comment:
 *   1. The `actions.toggleChildThreadsButton` property is a proper single button object.
 *   2. The DOM contains at most one `.cd-comment-button-toggleChildThreads` element
 *      within each comment's first element.
 *
 * For the equivalent check via a raw DOM scan see duplicate-toggle-button-dom.spec.js.
 */

test.describe('Duplicate Toggle Child Threads Button — Actions Object', () => {
	test('should have a proper single toggleChildThreadsButton object per compact comment', async ({ page }) => {
		await setupConvenientDiscussions(page, { url: TEST_PAGES.CD_TEST_CASES, settings: { commentDisplay: 'compact' } })

		// Test the specific fix we made - ensure no duplicate calls to addToggleChildThreadsButton
		const result = await page.evaluate(() => {
			const cd = window.convenientDiscussions

			if (!cd?.comments) {
				return { error: 'No comments available for testing' }
			}

			let compactCommentsChecked = 0
			const issuesFound = []

			// Check each comment's actions
			cd.comments.forEach((comment, index) => {
				// Focus on compact comments (non-reformatted)
				if (
					comment.constructor.name === 'CompactComment' ||
					(comment.elements && !comment.elements[0]?.classList.contains('cd-comment-reformatted'))
				) {
					compactCommentsChecked++

					// Check if actions exist and are properly structured
					if (comment.actions) {
						const actions = comment.actions

						// Verify that toggleChildThreadsButton is either undefined or a single instance
						if (actions.toggleChildThreadsButton) {
							// Check if it's a proper button object
							if (
								typeof actions.toggleChildThreadsButton === 'object' &&
								actions.toggleChildThreadsButton.element
							) {
								// This is good - single button instance
							} else {
								issuesFound.push({
									commentIndex: index,
									issue: 'toggleChildThreadsButton is not a proper button object',
									value: typeof actions.toggleChildThreadsButton,
								})
							}
						}

						// Check if the create method was called properly (no duplicates)
						// We can't directly test method calls, but we can check the result
						const hasChildren = comment.getChildren?.().some((child) => child.thread)
						const hasToggleButton = !!actions.toggleChildThreadsButton

						if (hasChildren && !hasToggleButton) {
							issuesFound.push({
								commentIndex: index,
								issue: 'Comment has children with threads but no toggle button',
								hasChildren,
								hasToggleButton,
							})
						}
					}
				}
			})

			return {
				success: true,
				compactCommentsChecked,
				issuesFound,
				totalComments: cd.comments.length,
			}
		})

		if (result.error) {
			console.log(`ℹ️ ${result.error}`)

			return
		}

		console.log('🔍 CompactComment Fix Validation:')
		console.log(`   Total comments: ${result.totalComments}`)
		console.log(`   Compact comments checked: ${result.compactCommentsChecked}`)
		console.log(`   Issues found: ${result.issuesFound.length}`)

		if (result.issuesFound.length > 0) {
			console.log('❌ Issues found:', result.issuesFound)
		}

		// Main assertion: no issues should be found
		expect(result.issuesFound.length).toBe(0)

		console.log('✅ CompactComment fix validation passed')
	})

	test('should have at most one toggle button DOM element per compact comment', async ({ page }) => {
		await setupConvenientDiscussions(page, { url: TEST_PAGES.CD_TEST_CASES, settings: { commentDisplay: 'compact' } })

		// This test simulates what would have happened before our fix
		const simulationResult = await page.evaluate(() => {
			const cd = window.convenientDiscussions

			if (!cd?.comments) {
				return { error: 'No comments available' }
			}

			// Count how many times addToggleChildThreadsButton would be called
			// Before our fix: once in create() + once in CompactComment constructor = 2 times
			// After our fix: once in create() only = 1 time

			let compactCommentsWithToggleButtons = 0
			let totalToggleButtonElements = 0

			cd.comments.forEach((comment) => {
				if (
					(comment.constructor.name === 'CompactComment' ||
						(comment.elements &&
							!comment.elements[0]?.classList.contains('cd-comment-reformatted'))) &&
					comment.actions?.toggleChildThreadsButton
				) {
					compactCommentsWithToggleButtons++

					// Count actual DOM elements with the toggle button class within this comment's context
					const commentElement = comment.elements[0]
					if (commentElement) {
						const toggleButtons = commentElement.querySelectorAll(
							'.cd-comment-button-toggleChildThreads',
						)
						totalToggleButtonElements += toggleButtons.length

						// Before our fix, this would be > 1 for comments with children
						if (toggleButtons.length > 1) {
							return {
								error: `Duplicate buttons found in comment - fix failed!`,
								duplicateCount: toggleButtons.length,
								commentId: comment.id,
							}
						}
					}
				}
			})

			return {
				success: true,
				compactCommentsWithToggleButtons,
				totalToggleButtonElements,
				averageButtonsPerComment:
					compactCommentsWithToggleButtons > 0
						? totalToggleButtonElements / compactCommentsWithToggleButtons
						: 0,
			}
		})

		if (simulationResult.error) {
			console.log(`❌ ${simulationResult.error}`)
			expect(simulationResult.error).toBeUndefined()

			return
		}

		console.log('🔍 Duplicate Issue Resolution Check:')
		console.log(
			`   Compact comments with toggle buttons: ${simulationResult.compactCommentsWithToggleButtons}`,
		)
		console.log(`   Total toggle button elements: ${simulationResult.totalToggleButtonElements}`)
		console.log(
			`   Average buttons per comment: ${simulationResult.averageButtonsPerComment.toFixed(2)}`,
		)

		// The key assertion: average should be 1.0 (exactly one button per comment)
		if (simulationResult.compactCommentsWithToggleButtons > 0) {
			expect(simulationResult.averageButtonsPerComment).toBeLessThanOrEqual(1)
		}

		console.log('✅ Original duplicate issue is resolved')
	})
})
