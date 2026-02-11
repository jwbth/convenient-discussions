// @ts-check
const { test } = require('@playwright/test')

const { runBasicLoadingTest } = require('./helpers/loading-test-helper')
const { TEST_PAGES } = require('./helpers/test-utils')

/**
 * Basic tests to verify Convenient Discussions script loading and page parsing lifecycle
 * for an ANONYMOUS user.
 */

// Ensure the tests in this file run in an anonymous state
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Basic Script Loading and Page Parsing (Anonymous)', () => {
	test('should successfully load script, parse page, and fire pageReady hook (JWBTH_TEST)', async ({
		page,
	}) => {
		await runBasicLoadingTest(page, TEST_PAGES.JWBTH_TEST)
	})

	test('should successfully load script, parse page, and fire pageReady hook (VILLAGE_PUMP)', async ({
		page,
	}) => {
		await runBasicLoadingTest(page, TEST_PAGES.VILLAGE_PUMP)
	})
})
