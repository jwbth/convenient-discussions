// @ts-check
import { test, expect } from '@playwright/test'

import { setupConvenientDiscussions, TEST_PAGES } from './helpers/test-utils.js'

test.describe('Copy section link', () => {
	test('copying section link', async ({ page, context }) => {
		// Grant clipboard permissions to the browser context
		await context.grantPermissions(['clipboard-read', 'clipboard-write'])

		await setupConvenientDiscussions(page, {
			url: TEST_PAGES.JWBTH_TEST,
		})

		const found = await page.evaluate((headline) => {
			const section = window.convenientDiscussions.sections?.find((s) => s.headline === headline)
			if (!section?.actionsElement) return false
			section.actionsElement.dataset.testSectionActions = headline

			return true
		}, 'Section 1')

		expect(found).toBe(true)

		const actionsContainer = page.locator('[data-test-section-actions="Section 1"]')
		const copyLinkButton = actionsContainer.locator('.oo-ui-buttonElement-button', {
			hasText: 'Copy link',
		})
		await expect(copyLinkButton).toBeVisible({ timeout: 5000 })
		await copyLinkButton.click()

		// Wait for the copy link dialog to appear.
		const dialog = page.locator('.cd-dialog-copyLink')
		await expect(dialog).toBeVisible({ timeout: 10_000 })

		// Check title
		await expect(dialog.locator('.oo-ui-messageDialog-title')).toHaveText('Copy section link')

		// Check fields
		const wikilinkInput = dialog.locator('.oo-ui-fieldLayout:has-text("Wikilink") input').first()
		await expect(wikilinkInput).toHaveValue('[[User talk:JWBTH/CD test page#Section 1]]')

		const wikilinkSamePageInput = dialog
			.locator('.oo-ui-fieldLayout:has-text("Wikilink from the same page") input')
			.first()
		await expect(wikilinkSamePageInput).toHaveValue('[[#Section 1]]')

		const permanentWikilinkInput = dialog
			.locator('.oo-ui-fieldLayout:has-text("Permanent wikilink") input')
			.first()
		await expect(permanentWikilinkInput).toHaveValue(/\[\[Special:PermanentLink\/\d+#Section 1\]\]/)

		const regularLinkInput = dialog
			.locator('.oo-ui-fieldLayout:has-text("Regular link") input')
			.first()
		await expect(regularLinkInput).toHaveValue(
			'https://test.wikipedia.org/wiki/User_talk:JWBTH/CD_test_page#Section_1',
		)

		const permanentLinkInput = dialog
			.locator('.oo-ui-fieldLayout:has-text("Permanent link") input')
			.first()
		await expect(permanentLinkInput).toHaveValue(
			/https:\/\/test\.wikipedia\.org\/w\/index\.php\?title=User_talk:JWBTH\/CD_test_page&oldid=\d+#Section_1/,
		)

		// Click the first "Copy" button (for Wikilink)
		const firstCopyButton = dialog
			.locator('.oo-ui-fieldLayout:has-text("Wikilink") .oo-ui-buttonElement-button')
			.first()
		await firstCopyButton.click()

		// Notification appears
		const notification = page.locator('.mw-notification')
		await expect(notification).toBeVisible({ timeout: 5000 })
		await expect(notification).toHaveText('The link has been copied to the clipboard.')

		// Dialog disappears
		await expect(dialog).toBeHidden()

		// Clipboard should have Wikilink
		const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
		expect(clipboardText).toBe('[[User talk:JWBTH/CD test page#Section 1]]')
	})

	test('copying comment link', async ({ page }) => {
		await setupConvenientDiscussions(page, { url: TEST_PAGES.JWBTH_TEST })

		const commentInfo = await page.evaluate((text) => {
			const comment = window.convenientDiscussions.comments?.find((c) => {
				if (!c.elements) return false

				return c.elements.some((/** @type {HTMLElement} */ el) => el.textContent.includes(text))
			})
			if (!comment?.elements?.[0]) return null

			return { index: comment.index, id: comment.id }
		}, 'reply 1')

		if (!commentInfo) throw new Error('Comment not found')

		// Hover over the comment
		await page
			.locator(`.cd-comment-part-first[data-cd-comment-index="${commentInfo.index}"]`)
			.hover()

		const copyLinkButton = page
			.locator(
				`.cd-comment-overlay[data-cd-comment-index="${commentInfo.index}"] .cd-comment-button-ooui-icon-copylink, ` +
					`.cd-comment-part[data-cd-comment-index="${commentInfo.index}"] .cd-comment-timestamp`,
			)
			.first()

		await expect(copyLinkButton).toBeVisible({ timeout: 5000 })
		await copyLinkButton.click()

		// Wait for the copy link dialog to appear.
		const dialog = page.locator('.cd-dialog-copyLink')
		await expect(dialog).toBeVisible({ timeout: 10_000 })

		// Check title
		await expect(dialog.locator('.oo-ui-messageDialog-title')).toHaveText('Copy comment link')

		// Check initial fields
		const wikilinkInput = dialog.locator('.oo-ui-fieldLayout:has-text("Wikilink") input').first()
		await expect(wikilinkInput).toHaveValue(
			'[[User talk:JWBTH/CD test page#c-Jack_who_built_the_house-20250827060900-Test_account_8-20241120024100]]',
		)

		const wikilinkSamePageInput = dialog
			.locator('.oo-ui-fieldLayout:has-text("Wikilink from the same page") input')
			.first()
		await expect(wikilinkSamePageInput).toHaveValue(
			'[[#c-Jack_who_built_the_house-20250827060900-Test_account_8-20241120024100]]',
		)

		const permanentWikilinkInput = dialog
			.locator('.oo-ui-fieldLayout:has-text("Permanent wikilink") input')
			.first()
		await expect(permanentWikilinkInput).toHaveValue(
			'[[Special:GoToComment/c-Jack_who_built_the_house-20250827060900-Test_account_8-20241120024100]]',
		)

		const regularLinkInput = dialog
			.locator('.oo-ui-fieldLayout:has-text("Regular link") input')
			.first()
		await expect(regularLinkInput).toHaveValue(
			'https://test.wikipedia.org/wiki/User_talk:JWBTH/CD_test_page#c-Jack_who_built_the_house-20250827060900-Test_account_8-20241120024100',
		)

		const permanentLinkInput = dialog
			.locator('.oo-ui-fieldLayout:has-text("Permanent link") input')
			.first()
		await expect(permanentLinkInput).toHaveValue(
			'https://test.wikipedia.org/wiki/Special:GoToComment/c-Jack_who_built_the_house-20250827060900-Test_account_8-20241120024100',
		)

		// Wait for the "Diff link" button to be enabled
		const diffButton = dialog.locator('.cd-dialog-copyLink-diffButton')
		await expect(diffButton).toHaveClass(/oo-ui-widget-disabled/) // Should be disabled initially
		await expect(diffButton).toHaveClass(/oo-ui-widget-enabled/, { timeout: 10_000 }) // Should eventually become enabled

		// Click "Diff link" button
		await diffButton.click()

		// Check diff fields
		const diffLinkInput = dialog.locator('.oo-ui-fieldLayout:has-text("Diff link") input').first()
		await expect(diffLinkInput).toHaveValue(
			'https://test.wikipedia.org/w/index.php?title=User_talk:JWBTH/CD_test_page&diff=672403',
		)

		const shortDiffLinkInput = dialog
			.locator('.oo-ui-fieldLayout:has-text("Short diff link") input')
			.first()
		await expect(shortDiffLinkInput).toHaveValue('https://test.wikipedia.org/?diff=672403')

		const diffWikilinkInput = dialog
			.locator('.oo-ui-fieldLayout:has-text("Diff wikilink") input')
			.first()
		await expect(diffWikilinkInput).toHaveValue('[[Special:Diff/672403]]')

		// Check diff view elements
		const diffView = dialog.locator('.cd-diffView-diff')
		await expect(diffView).toBeVisible()
		await expect(diffView.locator('.cd-diffView-nextDiffLink')).toBeVisible()
		await expect(diffView.locator('.diff')).toBeVisible()
	})
})
