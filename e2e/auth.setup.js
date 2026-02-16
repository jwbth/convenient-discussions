// @ts-check
import { test as setup } from '@playwright/test'

import { ensureAuthenticated } from './helpers/login.js'

/**
 * Standalone authentication setup script.
 * Can be run manually with: npx playwright test e2e/auth.setup.js --project=setup
 */
setup('authenticate', async ({ page }) => {
	// Increase timeout for manual captcha solving
	setup.setTimeout(300_000) // 5 minutes

	console.log('🔐 Running standalone authentication setup...')

	// Navigate to a page to check login status
	await page.goto('https://test.wikipedia.org/wiki/Main_Page')

	// Use the shared helper to ensure authentication
	await ensureAuthenticated(page)
})
