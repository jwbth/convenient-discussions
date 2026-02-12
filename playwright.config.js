import 'dotenv/config'
// @ts-check

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const authFile = path.join(__dirname, 'playwright', '.auth', 'user.json')

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
	testDir: './e2e',
	/* Run tests in files in parallel */
	fullyParallel: true,
	/* Fail the build on CI if you accidentally left test.only in the source code. */
	forbidOnly: !!process.env.CI,
	/* Retry on CI only */
	retries: process.env.CI ? 2 : 0,
	/* Opt out of parallel tests on CI. */
	workers: process.env.CI ? 1 : undefined,
	/* Reporter to use. See https://playwright.dev/docs/test-reporters */
	reporter: [['html', { open: 'never' }], ['list']],
	/* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
	use: {
		/* Base URL for test.wikipedia.org */
		baseURL: 'https://test.wikipedia.org',

		/* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
		trace: 'on-first-retry',

		/* Use authentication state if available */
		storageState: fs.existsSync(authFile) ? authFile : undefined,

		launchOptions: {
			args: [
				// Disables the CORS/PNA checks entirely
				'--disable-web-security',
			],
		},
	},

	/* Configure projects for major browsers */
	projects: [
		// Setup project for authentication
		{
			name: 'setup',
			testMatch: /.*\.setup\.js/,
		},

		// Main test project - Chromium only for now
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],

	/* Build the script before running tests */
	// globalSetup: './e2e/global-setup.js',

	/* Run your local dev server before starting the tests */
	webServer: {
		command: 'npm run start',
		reuseExistingServer: !process.env.CI,
	},
})
