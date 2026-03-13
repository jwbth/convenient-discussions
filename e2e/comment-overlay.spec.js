// @ts-check
import { test, expect } from '@playwright/test'

import { setupConvenientDiscussions, toggleCommentDisplay } from './helpers/test-utils.js'

test.describe('Comment overlay', () => {
	test.beforeEach(async ({ page }) => {
		await setupConvenientDiscussions(page)
		await toggleCommentDisplay(page, 'compact')
	})

	test('Overlay should appear when hovering the first comment', async ({ page }) => {
		const firstCommentPart = page.locator('.cd-comment-part-first').nth(0)

		const debugInfo = await page.evaluate(() => {
			const c1 = window.convenientDiscussions.comments[0]
			c1.configureLayers()

			return {
				c1: {
					container: c1.layers.getContainer().tagName + '.' + c1.layers.getContainer().className,
					offset: c1.layers.getContainerOffset(),
					isVisible: window.getComputedStyle(c1.layers.getContainer()).display !== 'none',
				},
			}
		})

		console.log(debugInfo)

		await firstCommentPart.hover()
		await page.waitForTimeout(1000)

		const overlayMenu = page.locator('.cd-comment-overlay-menu').first()
		await expect(overlayMenu).toBeVisible()
	})

	test('Overlay should appear when hovering the second comment', async ({ page }) => {
		const secondCommentPart = page.locator('.cd-comment-part-first').nth(1)

		const debugInfo = await page.evaluate(() => {
			const c2 = window.convenientDiscussions.comments[1]
			c2.configureLayers()

			return {
				c2: {
					container: c2.layers.getContainer().tagName + '.' + c2.layers.getContainer().className,
					offset: c2.layers.getContainerOffset(),
					isVisible: window.getComputedStyle(c2.layers.getContainer()).display !== 'none',
				},
			}
		})

		console.log(debugInfo)

		await secondCommentPart.hover()
		await page.waitForTimeout(1000)

		const overlayMenu = page.locator('.cd-comment-overlay-menu').nth(1)
		await expect(overlayMenu).toBeVisible()
	})
})
