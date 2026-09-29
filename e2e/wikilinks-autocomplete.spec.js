// @ts-check
import { test, expect } from '@playwright/test'

import {
	setupConvenientDiscussions,
	TEST_PAGES,
	getSectionButtonContainer,
} from './helpers/test-utils.js'

/** @type {import('@playwright/test').Locator} */
let textarea

/** @type {import('@playwright/test').Locator} */
let highlightedItem

// Insertion logic, including the label, fragment, and tail-length cases, is unit-tested in
// tests/autocomplete.insertion.test.js. These tests check it end-to-end with real keystrokes.
test.describe('Wikilinks autocomplete', () => {
	test.beforeEach(async ({ page }) => {
		await setupConvenientDiscussions(page, { url: TEST_PAGES.JWBTH_TEST })

		const replyLink = getSectionButtonContainer(page, 'Section to add test comments').locator(
			'.cd-replyButtonWrapper a',
		)
		await expect(replyLink).toBeVisible({ timeout: 10_000 })
		await replyLink.click()

		const commentForm = page.locator('.cd-commentForm')
		await expect(commentForm).toBeVisible({ timeout: 10_000 })

		// type() rather than fill() keeps the OO.ui widget value in sync and fires the input events
		// Tribute listens to.
		textarea = commentForm.locator('textarea.oo-ui-inputWidget-input').first()
		await textarea.click()
		highlightedItem = page.locator('.tribute-container li.tribute-item.highlight')
	})

	test('replaces the rest of the link target', async () => {
		await textarea.type('[[Ma (old tail)]] after')
		await placeCaretAfter('[[Ma')
		await textarea.type('in Pa')
		const page = await chooseHighlighted()

		await expect(textarea).toHaveValue(`[[${page}]] after`)
	})

	test('replaces the rest of the link target when typing over a selection', async () => {
		await textarea.type('[[Main Px (old tail)]] after')
		await placeCaretAfter('[[Main P')
		await textarea.press('Shift+ArrowRight')
		await textarea.type('a')
		const page = await chooseHighlighted()

		await expect(textarea).toHaveValue(`[[${page}]] after`)
	})
})

/**
 * Put the caret at the end of the textarea value's first occurrence of `prefix`, using the keyboard
 * so that the widget sees ordinary caret movement.
 *
 * @param {string} prefix
 */
async function placeCaretAfter(prefix) {
	const value = await textarea.inputValue()
	await textarea.press('Home')
	for (let i = 0; i < value.indexOf(prefix) + prefix.length; i++) {
		await textarea.press('ArrowRight')
	}
}

/**
 * Wait for the suggestions, choose the highlighted one with Enter, and return its text.
 *
 * @returns {Promise<string>}
 */
async function chooseHighlighted() {
	await expect(highlightedItem).toBeVisible({ timeout: 10_000 })
	const text = (await highlightedItem.innerText()).trim()
	await textarea.press('Enter')
	await expect(highlightedItem).toBeHidden()

	return text
}
