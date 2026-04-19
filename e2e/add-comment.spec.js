// @ts-check
import { test, expect } from '@playwright/test'

import {
	setupConvenientDiscussions,
	TEST_PAGES,
	getSectionButtonContainer,
} from './helpers/test-utils.js'

test.describe('Add comment workflow', () => {
	test.skip(!process.env.TEST_EDIT, 'Skipping editing test (use npm run test:browser:edit to run)')

	test.beforeEach(async ({ page }) => {
		await setupConvenientDiscussions(page, {
			url: TEST_PAGES.JWBTH_TEST,
		})
	})

	test('adding a comment to a section', async ({ page }) => {
		const headline = 'Section to add test comments'
		const sectionButtonContainer = getSectionButtonContainer(page, headline)

		const replyLink = sectionButtonContainer.locator('.cd-replyButtonWrapper a')
		await expect(replyLink).toBeVisible({ timeout: 10_000 })

		await replyLink.click()
		console.log('✅ Clicked section reply link')

		const commentForm = page.locator('.cd-commentForm')
		await expect(commentForm).toBeVisible({ timeout: 10_000 })
		console.log('✅ Comment form is visible')

		const randomNumber = Math.random()
		const commentText = `Test comment with random number ${randomNumber}`

		// Use type() instead of fill() so OO.ui's internal widget value stays in sync.
		// fill() sets the DOM value directly without firing input events, causing
		// commentInput.getValue() to return '' and triggering a confirm() dialog that
		// headless browsers auto-dismiss as false, silently cancelling the submit.
		const textarea = commentForm.locator('textarea.oo-ui-inputWidget-input').first()
		await textarea.click()
		await textarea.type(commentText)
		console.log(`✅ Typed comment: ${commentText}`)

		const startTime = Date.now()
		const submitButton = commentForm.locator('.cd-commentForm-submitButton a')

		await submitButton.click()
		console.log('✅ Clicked "Reply"')

		// Make sure the comment form disappears
		await expect(commentForm).not.toBeVisible({ timeout: 30_000 })
		console.log('✅ Comment form disappeared')

		// A new comment should appear with this number
		const newComment = page.locator('.cd-comment-part-first', { hasText: String(randomNumber) })
		await expect(newComment).toBeVisible({ timeout: 30_000 })
		const endTime = Date.now()
		console.log(`✅ New comment is visible. Time difference: ${endTime - startTime}ms`)

		// The comment should become highlighted (for a short period of time)
		const commentIndex = await newComment.getAttribute('data-cd-comment-index')
		const highlightedElement = page.locator(
			`.cd-comment-underlay-target[data-cd-comment-index="${commentIndex}"]`,
		)
		await expect(highlightedElement).toBeVisible({ timeout: 5000 })
		console.log('✅ New comment is highlighted')
	})
})
