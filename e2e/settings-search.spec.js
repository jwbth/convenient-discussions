// @ts-check
import { test, expect } from '@playwright/test'

import { setupConvenientDiscussions, TEST_PAGES } from './helpers/test-utils.js'

test('settings search groups live controls and edits enable Save', async ({ page }) => {
	await setupConvenientDiscussions(page, `${TEST_PAGES.JWBTH_TEST}?uselang=en`)
	await page.evaluate(() => window.convenientDiscussions.tests.showSettingsDialog())

	const dialog = page.getByRole('dialog', { name: 'Convenient Discussions settings' })
	const search = dialog.getByRole('searchbox', { name: 'Search settings' })
	await expect(search).toHaveValue('')
	await expect(search).not.toBeFocused()
	await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()

	await search.fill('  CoMmEnTs  ')
	const results = dialog.locator('.cd-settings-searchResults')
	await expect(results.getByRole('heading')).toHaveText([
		'Talk page',
		'Notifications',
		'Data deletion',
	])
	await expect(dialog.locator('.oo-ui-outlineSelectWidget')).toBeVisible()
	await expect(dialog.locator('.oo-ui-outlineOptionWidget.oo-ui-optionWidget-selected')).toHaveCount(0)
	await results
		.getByRole('checkbox', { name: "Show a button to edit other users' comments", exact: true })
		.click()
	await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
})

test('settings search matches option help and keeps the whole setting', async ({ page }) => {
	await setupConvenientDiscussions(page, `${TEST_PAGES.JWBTH_TEST}?uselang=en`)
	await page.evaluate(() => window.convenientDiscussions.tests.showSettingsDialog())

	const dialog = page.getByRole('dialog', { name: 'Convenient Discussions settings' })
	await dialog.getByRole('searchbox', { name: 'Search settings' }).fill('overlay menu')
	const results = dialog.locator('.cd-settings-searchResults')
	await expect(results.getByRole('heading')).toHaveText(['Talk page'])
	await expect(results.locator('input[type="radio"]')).toHaveCount(2)
	await expect(results.getByText('Spacious')).toBeVisible()
	await expect(results.getByText('Compact')).toBeVisible()
})

test('settings search ignores input values and keeps the requested initial focus', async ({ page }) => {
	await setupConvenientDiscussions(page, `${TEST_PAGES.JWBTH_TEST}?uselang=en`)
	await page.evaluate(() =>
		window.convenientDiscussions.tests.showSettingsDialog('commentForm', 'input[maxlength="100"]'),
	)

	const dialog = page.getByRole('dialog', { name: 'Convenient Discussions settings' })
	const signaturePrefix = dialog.getByRole('textbox', { name: /^Signature prefix/ })
	await expect(signaturePrefix).toBeFocused()
	await signaturePrefix.fill('quartzsignature')
	await dialog.getByRole('searchbox', { name: 'Search settings' }).fill('quartzsignature')
	await expect(dialog.locator('.cd-settings-searchResults .oo-ui-fieldLayout')).toHaveCount(0)
})

test('settings search keeps dependent settings disabled without adding their controller', async ({ page }) => {
	await setupConvenientDiscussions(page, `${TEST_PAGES.JWBTH_TEST}?uselang=en`)
	await page.evaluate(() => window.convenientDiscussions.tests.showSettingsDialog())

	const dialog = page.getByRole('dialog', { name: 'Convenient Discussions settings' })
	await dialog.getByRole('checkbox', { name: 'Allow to collapse threads', exact: true }).uncheck()
	await dialog.getByRole('searchbox', { name: 'Search settings' }).fill('autocollapse')
	const results = dialog.locator('.cd-settings-searchResults')
	await expect(results.getByRole('heading')).toHaveText(['Talk page'])
	await expect(results.getByRole('checkbox')).toHaveCount(2)
	await expect(results.getByRole('checkbox').nth(0)).toBeDisabled()
	await expect(results.getByRole('checkbox').nth(1)).toBeDisabled()
})

test('settings search highlights matching substrings and preserves links as the query changes', async ({ page }) => {
	await setupConvenientDiscussions(page, `${TEST_PAGES.JWBTH_TEST}?uselang=en`)
	await page.evaluate(() => window.convenientDiscussions.tests.showSettingsDialog())

	const dialog = page.getByRole('dialog', { name: 'Convenient Discussions settings' })
	const search = dialog.getByRole('searchbox', { name: 'Search settings' })
	const results = dialog.locator('.cd-settings-searchResults')
	await search.fill('  MY WIKI PREF  ')
	const preferencesLink = results.getByRole('link', { name: 'my wiki preferences' })
	await expect(preferencesLink.locator('.cd-searchHighlight')).toHaveText('my wiki pref')
	await expect(preferencesLink).toHaveAttribute('href', /Special:Preferences/)

	await search.fill('overlay menu')
	await expect(results.locator('.cd-searchHighlight')).toHaveText(['overlay menu'])
	await expect(dialog.locator('.cd-searchHighlight .cd-searchHighlight')).toHaveCount(0)

	await search.fill('')
	await expect(dialog.locator('.cd-searchHighlight')).toHaveCount(0)
})

test('settings search shows every setting when the settings page name matches', async ({ page }) => {
	await setupConvenientDiscussions(page, `${TEST_PAGES.JWBTH_TEST}?uselang=en`)
	await page.evaluate(() => window.convenientDiscussions.tests.showSettingsDialog())

	const dialog = page.getByRole('dialog', { name: 'Convenient Discussions settings' })
	await dialog.getByRole('searchbox', { name: 'Search settings' }).fill('notifications')
	const results = dialog.locator('.cd-settings-searchResults')
	await expect(results.getByRole('heading').locator('.cd-searchHighlight')).toHaveText([
		'Notifications',
	])
	await expect(results.getByRole('checkbox', { name: 'Notify about comments in collapsed threads' })).toBeVisible()
	await expect(results.locator('input[type="radio"]')).toHaveCount(6)
})

test('settings search reports when no settings match', async ({ page }) => {
	await setupConvenientDiscussions(page, `${TEST_PAGES.JWBTH_TEST}?uselang=en`)
	await page.evaluate(() => window.convenientDiscussions.tests.showSettingsDialog())

	const dialog = page.getByRole('dialog', { name: 'Convenient Discussions settings' })
	const search = dialog.getByRole('searchbox', { name: 'Search settings' })
	const results = dialog.locator('.cd-settings-searchResults')
	await search.fill('quartzpenguin')
	await expect(results.getByText('No settings match', { exact: true })).toBeVisible()
	await expect(results.getByRole('heading')).toHaveCount(0)
	await expect(results.locator('.oo-ui-fieldLayout')).toHaveCount(0)

	await search.fill('toolbar')
	await expect(results.getByText('No settings match', { exact: true })).toHaveCount(0)
	await expect(results.getByRole('checkbox', { name: 'Show the editing toolbar' })).toBeVisible()
})

test('selecting a settings page ends the search and shows that page', async ({ page }) => {
	await setupConvenientDiscussions(page, `${TEST_PAGES.JWBTH_TEST}?uselang=en`)
	await page.evaluate(() => window.convenientDiscussions.tests.showSettingsDialog())

	const dialog = page.getByRole('dialog', { name: 'Convenient Discussions settings' })
	const search = dialog.getByRole('searchbox', { name: 'Search settings' })
	await search.fill('comments')
	await dialog.getByRole('option', { name: 'Comment form', exact: true }).click()

	await expect(search).toHaveValue('')
	await expect(dialog.locator('.cd-settings-searchResults')).toBeHidden()
	await expect(dialog.getByRole('textbox', { name: /^Signature prefix/ })).toBeVisible()
	await expect(dialog.getByRole('option', { name: 'Comment form', exact: true })).toHaveAttribute(
		'aria-selected', 'true',
	)
})

test('Escape clears a search before confirming close with unsaved changes', async ({ page }) => {
	await setupConvenientDiscussions(page, `${TEST_PAGES.JWBTH_TEST}?uselang=en`)
	await page.evaluate(() => window.convenientDiscussions.tests.showSettingsDialog('commentForm'))

	const dialog = page.getByRole('dialog', { name: 'Convenient Discussions settings' })
	const search = dialog.getByRole('searchbox', { name: 'Search settings' })
	await search.fill('toolbar')
	await dialog.getByRole('checkbox', { name: 'Show the editing toolbar' }).click()
	await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
	const confirmations = []
	page.on('dialog', async (confirmation) => {
		confirmations.push(confirmation.message())
		await confirmation.dismiss()
	})

	await search.press('Escape')
	await expect(search).toHaveValue('')
	await expect(dialog).toBeVisible()
	await expect(dialog.getByRole('textbox', { name: /^Signature prefix/ })).toBeVisible()
	expect(confirmations).toEqual([])

	await Promise.all([page.waitForEvent('dialog'), search.press('Escape')])
	expect(confirmations).toEqual([
		'The settings were not saved. Are you sure you want to close the window?',
	])
	await expect(dialog).toBeVisible()
})

test('Reset keeps the search and shows reset values in rebuilt controls', async ({ page }) => {
	await setupConvenientDiscussions(page, {
		url: `${TEST_PAGES.JWBTH_TEST}?uselang=en`,
		settings: { showToolbar: true },
	})
	await page.evaluate(() => window.convenientDiscussions.tests.showSettingsDialog('timestamps'))

	const dialog = page.getByRole('dialog', { name: 'Convenient Discussions settings' })
	const search = dialog.getByRole('searchbox', { name: 'Search settings' })
	const results = dialog.locator('.cd-settings-searchResults')
	await search.fill('toolbar')
	await results.getByRole('checkbox', { name: 'Show the editing toolbar' }).uncheck()
	page.once('dialog', (confirmation) => confirmation.accept())
	await dialog.getByRole('button', { name: 'Reset settings (in all sections)', exact: true }).click()

	await expect(search).toHaveValue('toolbar')
	await expect(results).toBeVisible()
	await expect(results.getByRole('heading')).toHaveText(['Comment form'])
	await expect(results.getByRole('checkbox', { name: 'Show the editing toolbar' })).toBeChecked()
	await expect(results.locator('.cd-searchHighlight')).toHaveText(['toolbar'])
	await expect(dialog.locator('.oo-ui-outlineOptionWidget.oo-ui-optionWidget-selected')).toHaveCount(0)

	await search.fill('')
	await expect(dialog.getByRole('option', { name: 'Timestamps', exact: true })).toHaveAttribute(
		'aria-selected', 'true',
	)
	await expect(dialog.locator('.cd-searchHighlight')).toHaveCount(0)
})

for (const clearMethod of ['typing', 'clear indicator']) {
	test(`clearing settings search by ${clearMethod} restores settings pages and keeps edits`, async ({ page }) => {
		await setupConvenientDiscussions(page, {
			url: `${TEST_PAGES.JWBTH_TEST}?uselang=en`,
			settings: { showToolbar: true },
		})
		await page.evaluate(() => window.convenientDiscussions.tests.showSettingsDialog())

		const dialog = page.getByRole('dialog', { name: 'Convenient Discussions settings' })
		const pageNames = ['Talk page', 'Comment form', 'Timestamps', 'Notifications', 'Data deletion']
		const fieldCounts = new Map()
		for (const name of pageNames) {
			await dialog.getByRole('option', { name, exact: true }).click()
			fieldCounts.set(name, await dialog.locator('.oo-ui-pageLayout:visible > .oo-ui-fieldLayout').count())
		}
		await dialog.getByRole('option', { name: 'Timestamps', exact: true }).click()
		const search = dialog.getByRole('searchbox', { name: 'Search settings' })
		await search.fill('a')
		await dialog.locator('.cd-settings-searchResults')
			.getByRole('checkbox', { name: 'Show the editing toolbar', exact: true }).uncheck()
		if (clearMethod === 'typing') {
			await search.fill('')
		} else {
			await dialog.locator('.cd-settings-search .oo-ui-indicator-clear').click()
		}

		await expect(search).toHaveValue('')
		await expect(dialog.getByRole('option', { name: 'Timestamps', exact: true })).toHaveAttribute(
			'aria-selected', 'true',
		)
		await expect(dialog.locator('.cd-settings-searchResults')).toBeHidden()
		await expect(dialog.locator('.cd-searchHighlight')).toHaveCount(0)
		for (const name of pageNames) {
			await dialog.getByRole('option', { name, exact: true }).click()
			await expect(dialog.locator('.oo-ui-pageLayout:visible > .oo-ui-fieldLayout')).toHaveCount(fieldCounts.get(name))
			if (name === 'Comment form') {
				await expect(dialog.getByRole('checkbox', { name: 'Show the editing toolbar' })).not.toBeChecked()
			}
		}
	})
}
