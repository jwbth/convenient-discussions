// @ts-check
import { test, expect } from '@playwright/test'

import {
	setupConvenientDiscussions,
	TEST_PAGES,
	openSectionMoreMenu,
} from './helpers/test-utils.js'

const SECTION_HEADLINE = 'Section for moving'
const TARGET_PAGE_1 = 'User_talk:JWBTH/CD_test_page_2'
const TARGET_PAGE_2 = 'User_talk:JWBTH/CD_test_page'
const TARGET_URL = 'https://test.wikipedia.org/wiki/User_talk:JWBTH/CD_test_page_2'

test.describe('Move section', () => {
	test.skip(!process.env.TEST_EDIT, 'Skipping editing test (use npm run test:browser:edit to run)')

	test('moving a section to another page and back', async ({ page }) => {
		// --- Phase 1: Move from CD_test_page to CD_test_page_2 ---
		await setupConvenientDiscussions(page, { url: TEST_PAGES.JWBTH_TEST })

		await openSectionMoreMenu(page, SECTION_HEADLINE)
		console.log('✅ Opened "More options" dropdown menu')

		// The "Move" item has an "arrowNext" icon.
		const moveItem = page.locator('.oo-ui-menuSelectWidget .oo-ui-optionWidget').filter({
			has: page.locator('.oo-ui-icon-arrowNext'),
		})
		await expect(moveItem).toBeVisible({ timeout: 5000 })
		await moveItem.click()
		console.log('✅ Clicked "Move" menu item')

		// Wait for the move dialog to appear.
		const dialog = page.locator('.oo-ui-processDialog')
		await expect(dialog).toBeVisible({ timeout: 10_000 })
		console.log('✅ Move dialog is visible')

		// Find the first text input and type the target page name.
		const pageInput = dialog.locator('input[type="text"]').first()
		await expect(pageInput).toBeVisible()
		// Clear existing text just in case (though it should be empty) and type target
		await pageInput.fill(TARGET_PAGE_1)

		// Uncheck "Keep a link to the new location".
		// In OO.ui, checkboxes are often visually hidden and wrapped in other elements,
		// but checking/unchecking the actual <input type="checkbox"> usually works with Playwright.
		const keepLinkCheckbox = dialog.locator('input[type="checkbox"]').first()
		await keepLinkCheckbox.uncheck({ force: true })

		// Press "Move". The button usually has a primary action class or specific label.
		const moveButton = dialog.locator(
			'.oo-ui-processDialog-actions-primary .oo-ui-buttonElement-button',
		)
		await moveButton.click()
		console.log('✅ Clicked "Move" button in the dialog')

		// Wait for the success message.
		const successMessage = dialog
			.locator('div', {
				hasText: 'The topic has been successfully moved',
			})
			.last()
		await expect(successMessage).toBeVisible({ timeout: 15_000 })
		console.log('✅ Success message is visible')

		// Click the link to the new location.
		const newLocationLink = successMessage.locator('a')
		await newLocationLink.click()
		console.log('✅ Clicked the link to the new location')

		// --- Phase 2: Verify on new page and move back ---
		// Playwright click might navigate the page, or we might need to wait for navigation.
		// Re-setup CD on the new page. The URL should now be targeting TARGET_URL with the fragment.
		await page.waitForURL(`**/${TARGET_PAGE_1}#*`)
		// Run CD init on the new page.
		await setupConvenientDiscussions(page, { url: page.url() })

		// Make sure there is a section named "Section for moving" on the page.
		const sectionExists = await page.evaluate(
			(headline) => !!window.convenientDiscussions.sections?.find((s) => s.headline === headline),
			SECTION_HEADLINE,
		)

		expect(sectionExists, `Section "${SECTION_HEADLINE}" should exist on the new page`).toBe(true)
		console.log(`✅ Section "${SECTION_HEADLINE}" exists on the new page`)

		// Move it back to the original page.
		await openSectionMoreMenu(page, SECTION_HEADLINE)

		const moveBackItem = page.locator('.oo-ui-menuSelectWidget .oo-ui-optionWidget').filter({
			has: page.locator('.oo-ui-icon-arrowNext'),
		})
		await expect(moveBackItem).toBeVisible({ timeout: 5000 })
		await moveBackItem.click()

		const dialogBack = page.locator('.oo-ui-processDialog')
		await expect(dialogBack).toBeVisible({ timeout: 10_000 })

		const pageInputBack = dialogBack.locator('input[type="text"]').first()
		await expect(pageInputBack).toBeVisible()
		await pageInputBack.fill(TARGET_PAGE_2)

		const keepLinkCheckboxBack = dialogBack.locator('input[type="checkbox"]').first()
		await keepLinkCheckboxBack.uncheck({ force: true })

		const moveButtonBack = dialogBack.locator(
			'.oo-ui-processDialog-actions-primary .oo-ui-buttonElement-button',
		)
		await moveButtonBack.click()

		const successMessageBack = dialogBack
			.locator('div', {
				hasText: 'The topic has been successfully moved',
			})
			.last()
		await expect(successMessageBack).toBeVisible({ timeout: 15_000 })
		console.log('✅ Topic successfully moved back')

		// Click the link to the original location.
		const originalLocationLink = successMessageBack.locator('a')
		await originalLocationLink.click()

		// --- Phase 3: Verify back on the original page ---
		await page.waitForURL(`**/${TARGET_PAGE_2}#*`)
		await setupConvenientDiscussions(page, { url: page.url() })

		const sectionExistsAgain = await page.evaluate(
			(headline) => !!window.convenientDiscussions.sections?.find((s) => s.headline === headline),
			SECTION_HEADLINE,
		)

		expect(
			sectionExistsAgain,
			`Section "${SECTION_HEADLINE}" should be back on the original page`,
		).toBe(true)
		console.log(`✅ Section "${SECTION_HEADLINE}" successfully moved back to the original page`)
	})
})
