// @ts-check
import { test, expect } from '@playwright/test'

import { setupConvenientDiscussions, TEST_PAGES } from './helpers/test-utils.js'

const COMMENT_TO_REPLY_TO_TEXT = 'comment to be edited'

/**
 * Find the index of the comment whose text contains {@link COMMENT_TO_REPLY_TO_TEXT}.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>}
 */
async function findCommentToReplyToIndex(page) {
	const index = await page.evaluate((searchText) => {
		const comment = window.convenientDiscussions.comments.find((c) =>
			c.getText?.()?.includes(searchText),
		)

		return comment?.index ?? -1
	}, COMMENT_TO_REPLY_TO_TEXT)

	if (index === -1) {
		throw new Error(`Could not find a comment containing "${COMMENT_TO_REPLY_TO_TEXT}"`)
	}

	return index
}

test.describe('Reply to comment – compact mode (CompactComment / CompactCommentActions)', () => {
	test.beforeEach(async ({ page }) => {
		await setupConvenientDiscussions(page, {
			url: TEST_PAGES.JWBTH_TEST,
			settings: { commentDisplay: 'compact' },
		})
	})

	test('clicking "Reply" opens a comment form', async ({ page }) => {
		const commentIndex = await findCommentToReplyToIndex(page)
		console.log(`📝 Found comment to reply to at index ${commentIndex}`)

		// In compact mode, action buttons live inside the overlay that appears on hover.
		const commentPart = page.locator(
			`.cd-comment-part-first[data-cd-comment-index="${commentIndex}"]`,
		)

		// Hover over the comment to show the overlay with action buttons.
		await commentPart.hover()

		// Wait for the overlay to become visible.
		const overlay = page.locator(`.cd-comment-overlay[data-cd-comment-index="${commentIndex}"]`)
		await expect(overlay).toBeVisible({ timeout: 5_000 })

		// Click the "Reply" button via its element reference — avoids matching against
		// the localized label text.
		const replyButtonHandle = await page.evaluateHandle(
			(index) => window.convenientDiscussions.comments[index].actions.replyButton?.element,
			commentIndex,
		)
		const replyButtonElement = replyButtonHandle.asElement()
		if (!replyButtonElement) {
			throw new Error('Reply button element not found')
		}
		await replyButtonElement.click()
		console.log('✅ Clicked "Reply" button in compact overlay menu')

		// A comment form should have appeared on the page.
		await expect(page.locator('.cd-commentForm')).toBeVisible({ timeout: 10_000 })
		console.log('✅ Comment form is visible')
	})
})

test.describe('Reply to comment – spacious mode (SpaciousComment / SpaciousCommentActions)', () => {
	test.beforeEach(async ({ page }) => {
		await setupConvenientDiscussions(page, {
			url: TEST_PAGES.JWBTH_TEST,
			settings: { commentDisplay: 'spacious' },
		})
	})

	test('clicking "Reply" opens a comment form', async ({ page }) => {
		const commentIndex = await findCommentToReplyToIndex(page)
		console.log(`📝 Found comment to reply to at index ${commentIndex}`)

		// In spacious mode, the "Reply" button lives in the always-visible .cd-comment-menu at the
		// bottom of the comment. Click it directly via its element reference.
		const replyButtonHandle = await page.evaluateHandle(
			(index) => window.convenientDiscussions.comments[index].actions.replyButton?.element,
			commentIndex,
		)
		const replyButtonElement = replyButtonHandle.asElement()
		if (!replyButtonElement) {
			throw new Error('Reply button element not found')
		}
		await replyButtonElement.click()
		console.log('✅ Clicked "Reply" button in spacious comment menu')

		// A comment form should have appeared on the page.
		await expect(page.locator('.cd-commentForm')).toBeVisible({ timeout: 10_000 })
		console.log('✅ Comment form is visible')
	})
})
