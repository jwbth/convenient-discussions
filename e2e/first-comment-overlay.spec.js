// @ts-check
import { test, expect } from '@playwright/test'

import { setupConvenientDiscussions } from './helpers/test-utils.js'

test.describe('First comment overlay', () => {
	test.beforeEach(async ({ page }) => {
		await setupConvenientDiscussions(page)
	})

	test('Overlay should appear when hovering the first comment', async ({ page }) => {
		const firstCommentPart = page.locator('.cd-comment-part-first').first()

		// Get layers info for first and second comment
		const debugInfo = await page.evaluate(() => {
			const c1 = window.convenientDiscussions.comments[0]
			const c2 = window.convenientDiscussions.comments[1]

			// Force layer configuration
			c1.configureLayers()
			c2.configureLayers()

			return {
				c1: {
					container: c1.layers.getContainer().tagName + '.' + c1.layers.getContainer().className,
					offset: c1.layers.getContainerOffset(),
					isVisible: window.getComputedStyle(c1.layers.getContainer()).display !== 'none',
				},
				c2: {
					container: c2.layers.getContainer().tagName + '.' + c2.layers.getContainer().className,
					offset: c2.layers.getContainerOffset(),
					isVisible: window.getComputedStyle(c2.layers.getContainer()).display !== 'none',
				},
			}
		})

		console.log(debugInfo)

		await firstCommentPart.hover()
		await page.waitForTimeout(1000)

		const overlayMenu = page.locator('.cd-comment-overlay-menu').first()
		await expect(overlayMenu).toBeVisible()
	})
})
