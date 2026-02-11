// @ts-check
const { test } = require('@playwright/test')

const { runBasicLoadingTest } = require('./helpers/loading-test-helper')
const { TEST_PAGES } = require('./helpers/test-utils')

/**
 * Basic tests to verify Convenient Discussions script loading and page parsing lifecycle
 * for an AUTHENTICATED user.
 */

test.describe('Authenticated Script Loading and Page Parsing', () => {
	test('should successfully load script for authenticated user (JWBTH_TEST)', async ({ page }) => {
		await runBasicLoadingTest(page, TEST_PAGES.JWBTH_TEST, { authenticated: true })
	})
})
