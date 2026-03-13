// @ts-check
import { test, expect } from '@playwright/test'
import { setupConvenientDiscussions } from './helpers/test-utils.js'

test.describe('First comment overlay', () => {
	test.beforeEach(async ({ page }) => {
		await setupConvenientDiscussions(page)
	})

	test('Overlay should appear when hovering the second comment', async ({ page }) => {
		const secondCommentPart = page.locator('.cd-comment-part').nth(1)

		// Check console messages for setup errors
		const consoleMessages = await page.evaluate(() => window.consoleMessages || [])
		console.log('CONSOLE:', consoleMessages)
		expect(consoleMessages.filter(m => m.type === 'pageerror')).toHaveLength(0)

		// Get layers info for first and second comment
		const debugInfo = await page.evaluate(() => {
			const c1 = window.convenientDiscussions.comments[0]
			const c2 = window.convenientDiscussions.comments[1]
			
			// Force layer configuration
			c1.configureLayers()
			c2.configureLayers()
			
			return {
				c1: {
					container: c1.layers?.getContainer()?.tagName + '.' + c1.layers?.getContainer()?.className,
					offset: c1.layers?.getContainerOffset(),
					isVisible: c1.layers?.getContainer() ? window.getComputedStyle(c1.layers.getContainer()).display !== 'none' : false
				},
				c2: {
					container: c2.layers?.getContainer()?.tagName + '.' + c2.layers?.getContainer()?.className,
					offset: c2.layers?.getContainerOffset(),
					isVisible: c2.layers?.getContainer() ? window.getComputedStyle(c2.layers.getContainer()).display !== 'none' : false
				}
			}
		})
		
		console.log(debugInfo)

		await secondCommentPart.hover()
		await page.waitForTimeout(1000)

		const overlayMenu = page.locator('.cd-comment-overlay-menu').nth(1)
		await expect(overlayMenu).toBeVisible()
	})
})
