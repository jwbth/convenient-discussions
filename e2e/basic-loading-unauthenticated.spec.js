// @ts-check
import { test } from '@playwright/test'

import { runBasicLoadingTest } from './helpers/loading-test-helper.js'
import { TEST_PAGES } from './helpers/test-utils.js'

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
