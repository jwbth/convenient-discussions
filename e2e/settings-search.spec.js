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
