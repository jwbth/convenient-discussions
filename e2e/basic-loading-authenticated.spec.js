// @ts-check
const { test, expect } = require('@playwright/test')
const { TEST_PAGES } = require('./helpers/test-utils')

/**
 * Basic test to verify Convenient Discussions script loading and page parsing lifecycle
 * for an AUTHENTICATED user.
 */

/**
 * Run basic loading test for a specific URL
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 */
async function runBasicLoadingTest(page, url) {
	console.log(`🚀 Starting basic loading test for AUTHENTICATED user: ${url}`)

	// Set up console message capture
	/** @type {{ type: string; text: string }[]} */
	const consoleMessages = []
	page.on('console', (msg) => {
		const type = msg.type()
		const text = msg.text()
		consoleMessages.push({ type, text })

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

	// Navigate to the test page
	await page.goto(url)
	console.log('📄 Navigated to test page:', url)

	// Wait for page to load completely
	await page.waitForLoadState('networkidle')
	console.log('🌐 Page loaded')

	// VERIFY AUTHENTICATION
	const userMenu = page.locator('#pt-userpage, #pt-userpage-2')
	const anonMenu = page.locator('#pt-anonuserpage')

	if ((await userMenu.count()) > 0) {
		console.log('✅ Verified: User is authenticated')
	} else {
		if ((await anonMenu.count()) > 0) {
			throw new Error('Verification failed: User is NOT authenticated (anonymous menu found)')
		} else {
			throw new Error('Verification failed: Could not determine authentication status')
		}
	}

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

	// Inject the built Convenient Discussions script
	await page.addScriptTag({
		type: 'module',
		url: 'http://localhost:9000/src/loader/startup.js',
	})
	console.log('💉 Convenient Discussions script injected from dev server')

	// Wait for isRunning to become true
	await page.waitForFunction(
		() => window.convenientDiscussions && window.convenientDiscussions.isRunning === true,
		{ timeout: 10_000 },
	)
	console.log('✅ cd.isRunning is true')

	// Wait for the pageReady hook to fire
	const pageReadyResult = await Promise.race([
		pageReadyPromise,
		new Promise((resolve) => {
			setTimeout(() => {
				resolve({ hookFired: false, timeout: true })
			}, 15_000)
		}),
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

	// Assertions
	expect(pageReadyResult.hookFired, 'pageReady hook should have fired').toBe(true)
	expect(finalState.isRunning, 'cd.isRunning should be true').toBe(true)
	expect(finalState.hasComments, 'cd.comments should exist').toBe(true)

	// No critical errors should have occurred
	const errors = consoleMessages.filter((msg) => msg.type === 'error' || msg.type === 'pageerror')
	expect(
		errors.length,
		`Should have no console errors (found: ${errors.map((e) => e.text).join(', ')})`,
	).toBe(0)

	console.log('✅ All assertions passed!')
}

test.describe('Authenticated Script Loading and Page Parsing', () => {
	test('should successfully load script for authenticated user (JWBTH_TEST)', async ({ page }) => {
		await runBasicLoadingTest(page, TEST_PAGES.JWBTH_TEST)
	})
})
