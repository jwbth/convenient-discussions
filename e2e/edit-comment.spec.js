// @ts-check
import { test, expect } from '@playwright/test'

import { setupConvenientDiscussions, TEST_PAGES } from './helpers/test-utils.js'

const COMMENT_TO_EDIT_TEXT = 'comment to be edited'

/**
 * Find the index of the comment whose text contains {@link COMMENT_TO_EDIT_TEXT}.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>}
 */
async function findCommentToEditIndex(page) {
	const index = await page.evaluate((searchText) => {
		const comment = window.convenientDiscussions.comments.find((c) =>
			c.getText?.()?.includes(searchText),
		)

		return comment?.index ?? -1
	}, COMMENT_TO_EDIT_TEXT)

	if (index === -1) {
		throw new Error(`Could not find a comment containing "${COMMENT_TO_EDIT_TEXT}"`)
	}

	return index
}

/**
 * Wait until an edit comment form appears and its input has non-empty content.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} timeoutMs
 * @returns {Promise<string>}
 */
async function waitForEditFormText(page, timeoutMs = 20_000) {
	const handle = await page.waitForFunction(
		() => {
			const commentForm = window.convenientDiscussions.commentForms?.find(
				(cf) => cf.mode === 'edit',
			)

			return commentForm?.commentInput?.getValue() || undefined
		},
		{ timeout: timeoutMs },
	)

	return /** @type {string} */ (await handle.jsonValue())
}

test.describe('Edit comment – compact mode (CompactComment / CompactCommentActions)', () => {
	test.beforeEach(async ({ page }) => {
		await setupConvenientDiscussions(page, {
			url: TEST_PAGES.JWBTH_TEST,
			settings: { commentDisplay: 'compact' },
		})
	})

	test('clicking "Edit" opens a comment form pre-populated with the comment text', async ({
		page,
	}) => {
		const commentIndex = await findCommentToEditIndex(page)
		console.log(`📝 Found comment to edit at index ${commentIndex}`)

		// In compact mode, action buttons live inside the overlay that appears on hover.
		const commentPart = page.locator(
			`.cd-comment-part-first[data-cd-comment-index="${commentIndex}"]`,
		)

		// Hover over the comment to show the overlay with action buttons.
		await commentPart.hover()

		// Wait for the overlay to become visible.
		const overlay = page.locator(`.cd-comment-overlay[data-cd-comment-index="${commentIndex}"]`)
		await expect(overlay).toBeVisible({ timeout: 5000 })

		// Click the "Edit" button via its element reference — avoids matching against
		// the localized label text.
		const editButtonHandle = await page.evaluateHandle(
			(index) => window.convenientDiscussions.comments[index].actions.editButton?.element,
			commentIndex,
		)
		const editButtonElement = editButtonHandle.asElement()
		if (!editButtonElement) {
			throw new Error('Edit button element not found – is the comment editable by this user?')
		}
		await editButtonElement.click()
		console.log('✅ Clicked "Edit" button in compact overlay menu')

		// The comment's elements are given the class cd-hidden when an edit form is open.
		await expect(commentPart).not.toBeVisible({ timeout: 10_000 })
		console.log('✅ Comment part is hidden after clicking "Edit"')

		// A comment form should have appeared on the page.
		await expect(page.locator('.cd-commentForm')).toBeVisible({ timeout: 10_000 })
		console.log('✅ Comment form is visible')

		// After loading from the server the wikitext appears in the comment input.
		const text = await waitForEditFormText(page)

		expect(text).toBeTruthy()
		expect(text).toContain(COMMENT_TO_EDIT_TEXT)
		console.log(`✅ Comment form contains expected text: "${text}"`)
	})
})

test.describe('Edit comment – spacious mode (SpaciousComment / SpaciousCommentActions)', () => {
	test.beforeEach(async ({ page }) => {
		await setupConvenientDiscussions(page, {
			url: TEST_PAGES.JWBTH_TEST,
			settings: { commentDisplay: 'spacious' },
		})
	})

	test('clicking "Edit" opens a comment form pre-populated with the comment text', async ({
		page,
	}) => {
		const commentIndex = await findCommentToEditIndex(page)
		console.log(`📝 Found comment to edit at index ${commentIndex}`)

		// In spacious mode, the "Edit" button lives in the always-visible .cd-comment-menu at the
		// bottom of the comment. Click it directly via its element reference.
		const editButtonHandle = await page.evaluateHandle(
			(index) => window.convenientDiscussions.comments[index].actions.editButton?.element,
			commentIndex,
		)
		const editButtonElement = editButtonHandle.asElement()
		if (!editButtonElement) {
			throw new Error('Edit button element not found – is the comment editable by this user?')
		}
		await editButtonElement.click()
		console.log('✅ Clicked "Edit" button in spacious comment menu')

		// The first part of the comment gets cd-hidden when the edit form replaces it.
		const commentPart = page.locator(
			`.cd-comment-part-first[data-cd-comment-index="${commentIndex}"]`,
		)
		await expect(commentPart).not.toBeVisible({ timeout: 10_000 })
		console.log('✅ Comment part is hidden after clicking "Edit"')

		// A comment form should have appeared on the page.
		await expect(page.locator('.cd-commentForm')).toBeVisible({ timeout: 10_000 })
		console.log('✅ Comment form is visible')

		// After loading from the server the wikitext appears in the comment input.
		const text = await waitForEditFormText(page)

		expect(text).toBeTruthy()
		expect(text).toContain(COMMENT_TO_EDIT_TEXT)
		console.log(`✅ Comment form contains expected text: "${text}"`)
	})
})
