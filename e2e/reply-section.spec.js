// @ts-check
import { test, expect } from '@playwright/test'

import { setupConvenientDiscussions, TEST_PAGES } from './helpers/test-utils.js'

test.describe('Reply to section', () => {
	test.beforeEach(async ({ page }) => {
		await setupConvenientDiscussions(page, {
			url: TEST_PAGES.JWBTH_TEST,
		})
	})

	test('clicking the section reply button opens a comment form', async ({ page }) => {
		// Each section ends with a .cd-replyButtonWrapper containing a reply link.
		const replyWrapper = page.locator('.cd-replyButtonWrapper').first()
		await expect(replyWrapper).toBeVisible({ timeout: 10_000 })

		await replyWrapper.locator('a').click()
		console.log('✅ Clicked section reply link')

		// A comment form should have appeared on the page.
		await expect(page.locator('.cd-commentForm')).toBeVisible({ timeout: 10_000 })
		console.log('✅ Comment form is visible')
	})
})
