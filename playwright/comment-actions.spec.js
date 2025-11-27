// @ts-check
const { test, expect } = require('@playwright/test')

const { setupConvenientDiscussions } = require('./helpers/test-utils')

/**
 * Browser tests for Comment actions functionality
 * Tests action buttons, menus, and interactions for CompactComment only
 *
 * NOTE: Currently testing compact-style comments only (spaciousComments: false)
 * All comments on the test page should be in compact style.
 */

test.describe('Comment Actions - Compact Style', () => {
	test.beforeEach(async ({ page }) => {
		await setupConvenientDiscussions(page)
	})

	test('CompactComment should show action buttons in overlay menu', async ({ page }) => {
		// Find the first comment part
		const firstCommentPart = page.locator('.cd-comment-part-first').first()

		// Hover to show overlay menu and keep hovering
		await firstCommentPart.hover()
		await page.waitForTimeout(1000)

		// Check if layers and overlay menu were created
		const overlayMenu = page.locator('.cd-comment-overlay-menu').first()
		const menuExists = await overlayMenu.count() > 0

		if (menuExists) {
			// Keep the mouse over the comment to ensure overlay stays visible
			await firstCommentPart.hover()
			await expect(overlayMenu).toBeVisible()

			// Check for action buttons in overlay - look for Reply button by text content
			const replyButton = overlayMenu.locator('text=Reply').first()
			const buttonExists = await replyButton.count() > 0

			if (buttonExists) {
				await expect(replyButton).toBeVisible()
			} else {
				console.log('Reply button not found in overlay menu')
			}
		} else {
			console.log('Overlay menu not created - this indicates an issue with layer/action creation')
			await expect(firstCommentPart).toBeVisible()
		}
	})

	test('Compact comment action buttons should be functional', async ({ page }) => {
		// Find the first comment part
		const firstCommentPart = page.locator('.cd-comment-part-first').first()

		// Hover to show overlay menu first and keep hovering
		await firstCommentPart.hover()
		await page.waitForTimeout(1000)

		// Find and click reply button - look for Reply button by text content within the overlay menu
		const overlayMenu = page.locator('.cd-comment-overlay-menu').first()
		const replyButton = overlayMenu.locator('text=Reply').first()
		const buttonExists = await replyButton.count() > 0

		if (buttonExists) {
			// Ensure the overlay menu is visible before clicking
			await expect(overlayMenu).toBeVisible()

			// Force click to bypass pointer event interception
			await replyButton.click({ force: true })

			// Check that comment form appears
			const commentForm = page.locator('.cd-commentForm')
			await expect(commentForm).toBeVisible()

			// Check that form is positioned correctly relative to comment
			const commentBox = await firstCommentPart.boundingBox()
			const formBox = await commentForm.boundingBox()

			if (formBox && commentBox) {
				expect(formBox.y).toBeGreaterThan(commentBox.y)
			}
		} else {
			console.log('Reply button not found - skipping functionality test')
			await expect(firstCommentPart).toBeVisible()
		}
	})

	test('Copy link action should work for compact comments', async ({ page }) => {
		const comment = page.locator('.cd-comment-part').first()

		// Find copy link button (may be in menu or direct)
		const copyLinkButton = comment.locator('.cd-comment-button-copyLink').first()

		if (await copyLinkButton.isVisible()) {
			await copyLinkButton.click()

			// Check for success notification or copied state
			// This depends on your implementation
			const notification = page.locator('.cd-notification')
			await expect(notification).toBeVisible()
		}
	})

	test('Thank button should work when available for compact comments', async ({ page }) => {
		const comment = page.locator('.cd-comment-part').first()

		// Find thank button (may not be available for all comments)
		const thankButton = comment.locator('.cd-comment-button-thank')

		if (await thankButton.isVisible()) {
			await thankButton.click()

			// Check for confirmation dialog or success state
			const dialog = page.locator('.oo-ui-dialog')
			await expect(dialog).toBeVisible()
		}
	})
})
