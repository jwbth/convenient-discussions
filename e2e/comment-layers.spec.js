// @ts-check
import { test, expect } from '@playwright/test'

import { setupConvenientDiscussions } from './helpers/test-utils.js'

/**
 * Browser tests for Comment layers functionality
 * Tests visual layers, positioning, and hover behaviors for CompactComment only
 *
 * NOTE: Currently testing compact-style comments only (spaciousComments: false)
 * All comments on the test page should be in compact style.
 */

test.describe('Comment Layers - Compact Style', () => {
	test.beforeEach(async ({ page }) => {
		await setupConvenientDiscussions(page, { settings: { commentDisplay: 'compact' } })
	})

	test('CompactComment should show overlay menu on hover', async ({ page }) => {
		// Find the first comment part
		const firstCommentPart = page.locator('.cd-comment-part-first').first()

		// Get the comment index to access the Comment object
		const commentIndex = await firstCommentPart.getAttribute('data-cd-comment-index')
		console.log('Comment index:', commentIndex)

		// Hover over the comment part to trigger layer creation
		await firstCommentPart.hover()

		// Wait a bit for layers to be created
		await page.waitForTimeout(500)

		// Check if layers were created by looking for underlay and overlay elements
		const underlay = page.locator('.cd-comment-underlay').first()
		const overlay = page.locator('.cd-comment-overlay').first()

		// Check if the layers exist (they should be created on hover for compact comments)
		await expect(underlay, 'Underlay should be created').toBeVisible()
		await expect(overlay, 'Overlay should be created').toBeVisible()

		// Check for overlay menu elements specific to compact comments
		const overlayMenu = page.locator('.cd-comment-overlay-menu').first()
		const overlayGradient = page.locator('.cd-comment-overlay-gradient').first()

		await expect(overlayMenu, 'Overlay menu should be visible').toBeVisible()
		await expect(overlayGradient, 'Overlay gradient should be visible').toBeVisible()
	})

	test('Compact comment layers should be positioned correctly', async ({ page }) => {
		const firstCommentPart = page.locator('.cd-comment-part-first').first()

		// Trigger layer creation by hovering
		await firstCommentPart.hover()
		await page.waitForTimeout(500)

		// Check if layers were created
		const underlay = page.locator('.cd-comment-underlay').first()
		const overlay = page.locator('.cd-comment-overlay').first()

		// Check if layers were created
		await expect(underlay, 'Underlay should be visible').toBeVisible()
		await expect(overlay, 'Overlay should be visible').toBeVisible()

		// Verify positioning - underlay should be behind comment, overlay in front
		const commentBox = await firstCommentPart.boundingBox()
		const underlayBox = await underlay.boundingBox()
		const overlayBox = await overlay.boundingBox()

		expect(commentBox, 'Comment box should exist').not.toBeNull()
		expect(underlayBox, 'Underlay box should exist').not.toBeNull()
		expect(overlayBox, 'Overlay box should exist').not.toBeNull()

		if (underlayBox && overlayBox && commentBox) {
			// Basic positioning checks - layers should be positioned near the comment
			expect(Math.abs(underlayBox.x - commentBox.x)).toBeLessThan(50)
			expect(Math.abs(overlayBox.x - commentBox.x)).toBeLessThan(50)
			expect(Math.abs(underlayBox.y - commentBox.y)).toBeLessThan(50)
			expect(Math.abs(overlayBox.y - commentBox.y)).toBeLessThan(50)
		}
	})

	test('Compact comment layer styles should update correctly', async ({ page }) => {
		const firstCommentPart = page.locator('.cd-comment-part-first').first()

		// Trigger layer creation by hovering
		await firstCommentPart.hover()
		await page.waitForTimeout(500)

		const underlay = page.locator('.cd-comment-underlay').first()
		const overlay = page.locator('.cd-comment-overlay').first()

		await expect(underlay, 'Underlay should be visible').toBeVisible()
		await expect(overlay, 'Overlay should be visible').toBeVisible()

		// Check initial styles
		await expect(underlay).toHaveCSS('position', 'absolute')
		await expect(overlay).toHaveCSS('position', 'absolute')

		// Trigger style update (e.g., window resize)
		await page.setViewportSize({ width: 1200, height: 800 })
		await page.waitForTimeout(200)

		// Verify layers are still properly positioned
		await expect(underlay).toBeVisible()
		await expect(overlay).toBeVisible()
	})
})
