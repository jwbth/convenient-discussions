// @ts-check
const { test, expect } = require('@playwright/test')

const { setupConvenientDiscussions } = require('./helpers/test-utils')

/**
 * Browser tests for Comment visual appearance and behavior
 * Tests visual regression and appearance consistency for CompactComment only
 *
 * NOTE: Currently testing compact-style comments only (spaciousComments: false)
 * All comments on the test page should be in compact style.
 */

test.describe('Comment Visual Appearance - Compact Style', () => {
	test.beforeEach(async ({ page }) => {
		await setupConvenientDiscussions(page)
	})

	test('CompactComment should maintain MediaWiki appearance', async ({ page }) => {
		const compactComment = page.locator('.cd-comment:not(.cd-comment-reformatted)').first()

		// Should look like traditional MediaWiki comment
		// Check that it doesn't have spacious-specific elements
		const header = compactComment.locator('.cd-comment-header')
		await expect(header).not.toBeVisible()

		// Should have traditional signature inline with content
		const signature = compactComment.locator('.cd-comment-signature')
		await expect(signature).toBeVisible()
	})

	test('Compact comment highlighting should work correctly', async ({ page }) => {
		const comment = page.locator('.cd-comment:not(.cd-comment-reformatted)').first()

		// Click to highlight comment
		await comment.click()

		// Check for highlight class
		await expect(comment).toHaveClass(/cd-comment-target/)

		// Check that layers are created and visible
		const underlay = comment.locator('.cd-comment-underlay')
		const overlay = comment.locator('.cd-comment-overlay')

		await expect(underlay).toBeVisible()
		await expect(overlay).toBeVisible()

		// Check highlight styling
		await expect(underlay).toHaveCSS('background-color', /.+/)
	})
})
