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

/**
 * Mark the actionsElement of a section with a data attribute, hover the hamburger button to
 * trigger lazy creation of the real OO.ui widget, then click it to open the dropdown.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} headline
 */
async function openSectionMoreMenu(page, headline) {
	const found = await page.evaluate((h) => {
		const section = window.convenientDiscussions.sections?.find((s) => s.headline === h)
		if (!section?.actionsElement) return false

		// Stamp actionsElement so we can scope our locators without relying on nth().
		section.actionsElement.dataset.testSectionActions = h

		return true
	}, headline)

	if (!found) {
		throw new Error(
			`Could not find the actions element for section "${headline}". ` +
				'Does it have the "More options" menu?',
		)
	}

	// Using a Playwright locator (not an ElementHandle) means it re-queries the DOM after hover
	// removes the dummy <a> and inserts the real OO.ui.ButtonMenuSelectWidget.
	const actionsContainer = page.locator(`[data-test-section-actions="${headline}"]`)
	const hamburger = actionsContainer.locator('.cd-section-bar-moremenu a')

	// Hover triggers the lazy widget-creation callback.
	await hamburger.hover()
	await page.waitForTimeout(300)

	// Click now finds the newly-inserted widget element.
	await hamburger.click()
}

test.describe('Section "More options" menu', () => {
	test.beforeEach(async ({ page }) => {
		await setupConvenientDiscussions(page, { url: TEST_PAGES.JWBTH_TEST })
	})

	test('clicking "Edit opening comment" opens a form with heading and comment text pre-filled', async ({
		page,
	}) => {
		await openSectionMoreMenu(page, SECTION_HEADLINE)
		console.log('✅ Opened "More options" dropdown menu')

		// The "Edit opening comment" item has an "edit" icon.
		const menuItem = page.locator('.oo-ui-menuSelectWidget .oo-ui-optionWidget').filter({
			has: page.locator('.oo-ui-icon-edit'),
		})
		await expect(menuItem).toBeVisible({ timeout: 5000 })
		await menuItem.click()
		console.log('✅ Clicked "Edit opening comment" menu item')

		await expect(page.locator('.cd-commentForm')).toBeVisible({ timeout: 10000 })
		console.log('✅ Comment form is visible')

		const { headlineText, commentText } = await waitForEditFormInputs(page)

		expect(headlineText).toBeTruthy()
		expect(headlineText).toContain(SECTION_HEADLINE)
		console.log(`✅ Headline input contains: "${headlineText}"`)

		expect(commentText).toBeTruthy()
		expect(commentText).toContain(OPENING_COMMENT_TEXT)
		console.log(`✅ Comment input contains: "${commentText}"`)
	})

	test('clicking "Add subsection" opens a form immediately before the next section heading', async ({
		page,
	}) => {
		await openSectionMoreMenu(page, SECTION_HEADLINE)
		console.log('✅ Opened "More options" dropdown menu')

		// The "Add subsection" item has a "speechBubbleAdd" icon.
		const menuItem = page.locator('.oo-ui-menuSelectWidget .oo-ui-optionWidget').filter({
			has: page.locator('.oo-ui-icon-speechBubbleAdd'),
		})
		await expect(menuItem).toBeVisible({ timeout: 5000 })
		await menuItem.click()
		console.log('✅ Clicked "Add subsection" menu item')

		// The form should appear immediately before the next h2 heading.
		const nextHeading = page.locator('.mw-heading2:has(#test4)')
		await expect(nextHeading).toBeVisible()

		// The "Add subsection" form is placed just before the next h2, so it should be its
		// immediately preceding sibling in the DOM.
		const formPrecedesHeading = await nextHeading.evaluate((heading) => {
			const prev = heading.previousElementSibling

			return (
				prev?.classList.contains('cd-commentForm') ||
				// The form may be wrapped in a cd-commentForm-outerWrapper <dd>/<li>.
				prev?.querySelector('.cd-commentForm') !== null
			)
		})

		expect(
			formPrecedesHeading,
			'Add subsection form should appear immediately before .mw-heading2:has(#test4)',
		).toBe(true)
		console.log('✅ Add subsection form is immediately before the next section heading')

		// The form should also have a visible headline input (for the subsection title).
		const headlineInput = page.locator('.cd-commentForm .cd-commentForm-headlineInput')
		await expect(headlineInput).toBeVisible({ timeout: 5000 })
		console.log('✅ Headline input is visible in the Add subsection form')
	})
})
