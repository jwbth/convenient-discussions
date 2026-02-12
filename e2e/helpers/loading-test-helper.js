// @ts-check
const { expect } = require('@playwright/test')

const { ensureAuthenticated } = require('./auth')

/**
 * Shared logic for basic loading tests.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {object} [options]
 * @param {boolean} [options.authenticated]
 */
async function runBasicLoadingTest(page, url, options = {}) {
	const { authenticated = false } = options

	console.log(
		`🚀 Starting basic loading test for ${authenticated ? 'AUTHENTICATED' : 'ANONYMOUS'} user: ${url}`,
	)

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

	if (authenticated) {
		// Ensure the user is authenticated on this page
		await ensureAuthenticated(page)
	}

	// Wait for page to load completely (in case login redirected us)
	await page.waitForLoadState('networkidle')
	console.log('🌐 Page ready')

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
						commentsCount: cd.comments?.length || 0,
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
		commentsCount: window.convenientDiscussions?.comments?.length || 0,
		sectionsCount: window.convenientDiscussions?.sections?.length || 0,
		hasSettings: !!window.convenientDiscussions?.settings,
		hasG: !!window.convenientDiscussions?.g,
	}))

	console.log('📋 Final state:', finalState)

	// Assertions
	expect(pageReadyResult.hookFired, 'pageReady hook should have fired').toBe(true)
	expect(pageReadyResult.timeout, 'pageReady hook should not have timed out').toBeUndefined()
	expect(finalState.isRunning, 'cd.isRunning should be true').toBe(true)
	expect(finalState.commentsCount, 'Should have found comments on the page').toBeGreaterThan(0)
	expect(finalState.sectionsCount, 'Should have found sections on the page').toBeGreaterThan(0)
	expect(finalState.hasSettings, 'cd.settings should exist').toBe(true)
	expect(finalState.hasG, 'cd.g should exist').toBe(true)

	// No critical errors should have occurred
	const errors = consoleMessages.filter((msg) => msg.type === 'error' || msg.type === 'pageerror')
	expect(
		errors.length,
		`Should have no console errors (found: ${errors.map((e) => e.text).join(', ')})`,
	).toBe(0)

	console.log('✅ All assertions passed!')
}

module.exports = {
	runBasicLoadingTest,
}
