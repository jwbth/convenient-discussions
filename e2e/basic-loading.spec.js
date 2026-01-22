// @ts-check
const { test, expect } = require('@playwright/test')

const { TEST_PAGES } = require('./helpers/test-utils')

/**
 * Basic test to verify Convenient Discussions script loading and page parsing lifecycle.
 * This test validates that:
 * 1. The script loads from the development server
 * 2. The isRunning flag becomes true
 * 3. The BootProcess executes and parses the page
 * 4. The pageReady hook fires
 * 5. No critical errors occur during initialization
 */

test.describe('Basic Script Loading and Page Parsing', () => {
	test('should successfully load script, parse page, and fire pageReady hook', async ({ page }) => {
		console.log('🚀 Starting basic loading test')

		// Set up console message capture
		/** @type {{ type: string; text: string }[]} */
		const consoleMessages = []
		page.on('console', (msg) => {
			const type = msg.type()
			const text = msg.text()
			consoleMessages.push({ type, text })

			// Log errors and warnings immediately for debugging
			if (type === 'error') {
				console.log(`❌ Browser Error: ${text}`)
			} else if (type === 'warning') {
				console.log(`⚠️ Browser Warning: ${text}`)
			}
		})

		// Set up page error capture
		page.on('pageerror', (error) => {
			console.log(`💥 Page Error: ${error.message}`)
			consoleMessages.push({ type: 'pageerror', text: error.message })
		})

		// Navigate to the lightweight test page
		await page.goto(TEST_PAGES.JWBTH_TEST)
		console.log('📄 Navigated to test page:', TEST_PAGES.JWBTH_TEST)

		// Wait for page to load completely
		await page.waitForLoadState('networkidle')
		console.log('🌐 Page loaded')

		// Wait for MediaWiki globals to be available
		await page.waitForFunction(() => window.mw && window.$ && window.OO, { timeout: 10_000 })
		console.log('⚙️ MediaWiki globals loaded')

		// Set up hook listener BEFORE injecting the script
		const pageReadyPromise = page.evaluate(
			() =>
				new Promise((resolve) => {
					// @ts-expect-error - cd is the convenientDiscussions object
					window.mw.hook('convenientDiscussions.pageReady').add((cd) => {
						resolve({
							hookFired: true,
							hasComments: !!cd.comments,
							commentsCount: cd.comments?.length || 0,
							hasSections: !!cd.sections,
							sectionsCount: cd.sections?.length || 0,
						})
					})
				}),
		)

		// Inject the development script from localhost:9000
		await page.addScriptTag({
			type: 'module',
			url: 'http://localhost:9000/src/loader/startup.js',
		})
		console.log('💉 Development script injected from localhost:9000')

		// Wait for isRunning to become true
		await page.waitForFunction(
			() => window.convenientDiscussions && window.convenientDiscussions.isRunning === true,
			{ timeout: 10_000 },
		)
		console.log('✅ cd.isRunning is true')

		// Wait for the pageReady hook to fire (with timeout)
		const pageReadyResult = await Promise.race([
			pageReadyPromise,
			new Promise((resolve) =>
				setTimeout(() => resolve({ hookFired: false, timeout: true }), 20_000),
			),
		])

		console.log('📊 Page ready result:', pageReadyResult)

		// Collect final state information
		const finalState = await page.evaluate(() => ({
			isRunning: window.convenientDiscussions?.isRunning,
			hasComments: !!window.convenientDiscussions?.comments,
			commentsCount: window.convenientDiscussions?.comments?.length || 0,
			hasSections: !!window.convenientDiscussions?.sections,
			sectionsCount: window.convenientDiscussions?.sections?.length || 0,
			hasSettings: !!window.convenientDiscussions?.settings,
			hasG: !!window.convenientDiscussions?.g,
			currentPage: window.convenientDiscussions?.g?.CURRENT_PAGE?.name,
		}))

		console.log('📋 Final state:', finalState)

		// Count errors and warnings
		const errors = consoleMessages.filter((msg) => msg.type === 'error' || msg.type === 'pageerror')
		const warnings = consoleMessages.filter((msg) => msg.type === 'warning')

		console.log(`🔍 Console summary: ${errors.length} errors, ${warnings.length} warnings`)

		if (errors.length > 0) {
			console.log('❌ Errors found:')
			errors.forEach((err, i) => console.log(`  ${i + 1}. ${err.text}`))
		}

		if (warnings.length > 0) {
			console.log('⚠️ Warnings found:')
			warnings.forEach((warn, i) => console.log(`  ${i + 1}. ${warn.text}`))
		}

		// Assertions
		expect(pageReadyResult.hookFired, 'pageReady hook should have fired').toBe(true)
		expect(pageReadyResult.timeout, 'pageReady hook should not have timed out').toBeUndefined()
		expect(finalState.isRunning, 'cd.isRunning should be true').toBe(true)
		expect(finalState.hasComments, 'cd.comments should exist').toBe(true)
		expect(finalState.commentsCount, 'Should have found comments on the page').toBeGreaterThan(0)
		expect(finalState.hasSections, 'cd.sections should exist').toBe(true)
		expect(finalState.hasSettings, 'cd.settings should exist').toBe(true)
		expect(finalState.hasG, 'cd.g should exist').toBe(true)

		// No critical errors should have occurred
		expect(errors.length, 'Should have no console errors').toBe(0)

		console.log('✅ All assertions passed!')
	})
})
