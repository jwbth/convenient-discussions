// @ts-check
import { test, expect } from '@playwright/test'

import { setupConvenientDiscussions, TEST_PAGES, getSectionButtonContainer } from './helpers/test-utils.js'

test.describe('Add subsection buttons', () => {
	test.beforeEach(async ({ page }) => {
		await setupConvenientDiscussions(page, {
			url: TEST_PAGES.JWBTH_TEST,
		})
	})

	test('hovering the section reply link reveals "Add subsection" buttons', async ({ page }) => {
		const sectionButtonContainer = getSectionButtonContainer(page, 'test3')

		const replyLink = sectionButtonContainer.locator('.cd-replyButtonWrapper a')
		await expect(replyLink).toBeVisible({ timeout: 10_000 })

		// Hover over the link for 1.5 s to trigger the "Add subsection" buttons to appear.
		await replyLink.hover()
		await page.waitForTimeout(1500)

		// The subsection button container should now be visible.
		const container = sectionButtonContainer.locator('+ .cd-addSubsectionButtons-container')
		await expect(container).toBeVisible({ timeout: 5000 })

		// Two <a> elements should be present with the expected labels.
		const buttons = container.locator('a')
		await expect(buttons).toHaveCount(2)

		await expect(buttons.nth(0)).toHaveText('Add subsection to "test3"')
		await expect(buttons.nth(1)).toHaveText('Add subsection to "Section 1"')
		console.log('✅ Both "Add subsection" buttons are visible with expected labels')
	})
})
