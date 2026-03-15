// @ts-check
import { test, expect } from '@playwright/test'

import { setupConvenientDiscussions, TEST_PAGES } from './helpers/test-utils.js'

const SECTION_HEADLINE = 'Section 1'
const OPENING_COMMENT_TEXT = 'first section comment'

/**
 * Wait until an edit comment form with a headline input appears, and both its headline and comment
 * inputs have been populated from the server.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} timeoutMs
 * @returns {Promise<{ headlineText: string, commentText: string }>}
 */
async function waitForEditFormInputs(page, timeoutMs = 20000) {
	const handle = await page.waitForFunction(
		() => {
			const commentForm = window.convenientDiscussions.commentForms?.find(
				(cf) => cf.mode === 'edit',
			)
			const headlineVal = commentForm?.headlineInput?.getValue()
			const commentVal = commentForm?.commentInput?.getValue()

			// Both inputs must be non-empty before we consider loading done.
			if (headlineVal && commentVal) {
				return { headlineText: headlineVal, commentText: commentVal }
			}

			return undefined
		},
		{ timeout: timeoutMs },
	)

	return /** @type {{ headlineText: string, commentText: string }} */ (await handle.jsonValue())
}

test.describe('Edit opening comment via section "More options" menu', () => {
	test.beforeEach(async ({ page }) => {
		await setupConvenientDiscussions(page, { url: TEST_PAGES.JWBTH_TEST })
	})

	test('clicking "Edit opening comment" opens a form with heading and comment text pre-filled', async ({
		page,
	}) => {
		// 1. Mark the actionsElement of "Section 1" with a data attribute so we can scope our
		//    locators to it. Using locators (not element handles) means Playwright will re-query
		//    the DOM automatically after hover replaces the dummy button with the real OO.ui widget.
		const found = await page.evaluate((headline) => {
			const section = window.convenientDiscussions.sections?.find(
				(s) => s.headline === headline,
			)
			if (!section?.actionsElement) return false

			section.actionsElement.dataset.testSectionActions = headline

			return true
		}, SECTION_HEADLINE)

		if (!found) {
			throw new Error(
				`Could not find the actions element for section "${SECTION_HEADLINE}". ` +
					'Does it have the "More options" menu?',
			)
		}
		console.log(`📝 Found section "${SECTION_HEADLINE}" actions element`)

		// 2. Hover the hamburger <a> to trigger lazy creation of the real OO.ui.ButtonMenuSelectWidget.
		//    Using a Playwright locator (not an ElementHandle) means it will re-query after the DOM
		//    mutation, preventing the "Element is not attached to DOM" error.
		const actionsContainer = page.locator(
			`[data-test-section-actions="${SECTION_HEADLINE}"]`,
		)
		const hamburger = actionsContainer.locator('.cd-section-bar-moremenu a')
		await hamburger.hover()

		// Give the widget a moment to be created in place of the dummy.
		await page.waitForTimeout(300)

		// 3. Click to open the dropdown menu. The locator re-queries, so it picks up the new element.
		await hamburger.click()
		console.log('✅ Opened "More options" dropdown menu')

		// 4. Click the "Edit opening comment" menu item.
		//    It has an "edit" icon class on the icon element inside the option widget.
		const menuItem = page.locator('.oo-ui-menuSelectWidget .oo-ui-optionWidget').filter({
			has: page.locator('.oo-ui-icon-edit'),
		})
		await expect(menuItem).toBeVisible({ timeout: 5000 })
		await menuItem.click()
		console.log('✅ Clicked "Edit opening comment" menu item')

		// 5. The comment form should appear.
		await expect(page.locator('.cd-commentForm')).toBeVisible({ timeout: 10000 })
		console.log('✅ Comment form is visible')

		// 6. Wait for the server to return the source and populate both inputs.
		const { headlineText, commentText } = await waitForEditFormInputs(page)

		expect(headlineText).toBeTruthy()
		expect(headlineText).toContain(SECTION_HEADLINE)
		console.log(`✅ Headline input contains: "${headlineText}"`)

		expect(commentText).toBeTruthy()
		expect(commentText).toContain(OPENING_COMMENT_TEXT)
		console.log(`✅ Comment input contains: "${commentText}"`)
	})
})
