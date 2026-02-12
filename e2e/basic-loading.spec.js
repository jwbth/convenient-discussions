// @ts-check
import { test } from '@playwright/test'

import { runBasicLoadingTest } from './helpers/loading-test-helper.js'
import { TEST_PAGES } from './helpers/test-utils.js'

/**
 * Basic tests to verify Convenient Discussions script loading and page parsing lifecycle
 * for an AUTHENTICATED user.
 */

test.describe('Authenticated Script Loading and Page Parsing', () => {
	test('should successfully load script for authenticated user (JWBTH_TEST)', async ({ page }) => {
		await runBasicLoadingTest(page, TEST_PAGES.JWBTH_TEST, { authenticated: true })
	})
})
