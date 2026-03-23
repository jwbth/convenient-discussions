// @ts-check
import { test, expect } from '@playwright/test'

import { setupConvenientDiscussions, TEST_PAGES } from './helpers/test-utils.js'

test.describe('Button order – spacious mode', () => {
	test.beforeEach(async ({ page }) => {
		await setupConvenientDiscussions(page, {
			url: TEST_PAGES.JWBTH_TEST,
			settings: { commentDisplay: 'spacious', allowEditOthersComments: true },
		})
	})

	test('buttons are ordered correctly in header and footer', async ({ page }) => {
		// Find the parent comment index
		const parentCommentIndex = await page.evaluate(() => {
			const cd = window.convenientDiscussions
			if (!cd.comments) return undefined
			const comment = cd.comments.find((c) => c.getText?.()?.includes('comment to test buttons'))

			return comment?.index
		})

		if (parentCommentIndex === undefined) {
			throw new Error('Could not find the parent comment "comment to test buttons"')
		}

		// Find a child comment that has its own children (to have toggleChildThreads button)
		const childCommentIndex = await page.evaluate((parentIndex) => {
			const cd = window.convenientDiscussions
			if (!cd.comments) return undefined
			const parent = cd.comments[parentIndex]
			const children = parent.getChildren()
			const childWithChildren = children.find((c) => c.getChildren().length > 0)

			return childWithChildren?.index ?? children[0]?.index
		}, parentCommentIndex)

		if (childCommentIndex === undefined) {
			throw new Error('Could not find a child comment of "comment to test buttons"')
		}

		console.log(`📝 Parent comment index: ${parentCommentIndex}`)
		console.log(`📝 Child comment index: ${childCommentIndex}`)

		// Use .cd-comment-part-first as the base locator
		const childCommentPart = page.locator(
			`.cd-comment-part-first[data-cd-comment-index="${childCommentIndex}"]`,
		)
		await expect(childCommentPart).toBeVisible()

		// The test says: "press the 'Go to parent' button in the header of that comment"
		const goToParentButton = childCommentPart.locator('.cd-comment-button-goToParent')
		await expect(goToParentButton).toBeVisible()
		await goToParentButton.click()
		console.log('✅ Clicked "Go to parent" button')

		await page.waitForTimeout(500)

		// Check header button order
		const parentCommentPart = page.locator(
			`.cd-comment-part-first[data-cd-comment-index="${parentCommentIndex}"]`,
		)
		await expect(parentCommentPart).toBeVisible()

		const header = parentCommentPart.locator('.cd-comment-header')
		await expect(header).toBeVisible()

		await expect(header.locator('.cd-comment-button')).toHaveClass([
			/cd-comment-timestamp/,
			/cd-comment-button-toggleChildThreads/,
			/cd-comment-button-goToParent/,
			/cd-comment-button-goToChild/,
		])

		// Check footer (menu) button order
		const lastPart = page.locator(
			`.cd-comment-part-last[data-cd-comment-index="${parentCommentIndex}"]`,
		)
		const menu = lastPart.locator('.cd-comment-menu')
		await expect(menu).toBeVisible()

		await expect(menu.locator('.cd-comment-button')).toHaveText([
			'Reply',
			'Edit',
			'Thank',
		])
	})
})
