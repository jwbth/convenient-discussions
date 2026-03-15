// @ts-check
import { test, expect } from '@playwright/test'

import { setupConvenientDiscussions, TEST_PAGES } from './helpers/test-utils.js'

test.describe('Add subsection buttons', () => {
	test.beforeEach(async ({ page }) => {
		await setupConvenientDiscussions(page, {
			url: TEST_PAGES.JWBTH_TEST,
		})
	})

	test('hovering the section reply link reveals "Add subsection" buttons', async ({ page }) => {
		// Find the .cd-replyButtonWrapper that belongs to the section whose headline is "test3".
		// Each wrapper is placed after its section, so we scope the search to the heading's section.
		const replyLink = page
			.locator('h3')
			.filter({ hasText: 'test3' })
			.locator('~ .cd-replyButtonWrapper a')
			.first()
		await expect(replyLink).toBeVisible({ timeout: 10_000 })

		// Hover over the link for 1.5 s to trigger the "Add subsection" buttons to appear.
		await replyLink.hover()
		await page.waitForTimeout(1_500)

		// The subsection button container should now be visible.
		const container = page.locator('.cd-addSubsectionButtons-container')
		await expect(container).toBeVisible({ timeout: 5_000 })

		// Two <a> elements should be present with the expected labels.
		const buttons = container.locator('a')
		await expect(buttons).toHaveCount(2)

		await expect(buttons.nth(0)).toHaveText('Add subsection to "test3"')
		await expect(buttons.nth(1)).toHaveText('Add subsection "Section 1"')
		console.log('✅ Both "Add subsection" buttons are visible with expected labels')
	})
})
