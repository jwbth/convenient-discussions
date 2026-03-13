// @ts-check

/**
 * Browser test utilities for Comment class testing
 */

/**
 * Wait for Convenient Discussions to be fully loaded
 *
 * @param {import('@playwright/test').Page} page
 */
async function waitForConvenientDiscussions(page) {
	await page.waitForFunction(
		() =>
			window.convenientDiscussions.comments &&
			window.convenientDiscussions.comments.length > 0 &&
			window.convenientDiscussions.settings,
		{ timeout: 15_000 },
	)
}

/**
 * Test page URLs for different scenarios
 */
const TEST_PAGES = {
	MAIN_PAGE: 'https://en.wikipedia.org/wiki/Talk:Main_Page',
	CD_TEST_CASES:
		'https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases',
	VILLAGE_PUMP: 'https://en.wikipedia.org/wiki/Wikipedia:Village_pump_(technical)',
	// Compact test page with few comments for quick testing
	JWBTH_TEST: 'https://test.wikipedia.org/wiki/User_talk:JWBTH',
}

/**
 * Complete setup for Convenient Discussions browser testing
 * Handles all preparation steps: navigation, MediaWiki loading, script injection, and CD initialization
 *
 * NOTE: Currently focused on compact-style comments only (spaciousComments: false)
 * The test account should have spaciousComments setting disabled for consistent testing.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url Wikipedia talk page URL (defaults to JWBTH test page)
 */
async function setupConvenientDiscussionsFromDevBuild(page, url = TEST_PAGES.JWBTH_TEST) {
	await internalSetup(page, url, async () => {
		// Inject your built Convenient Discussions script
		await page.addScriptTag({
			path: './dist/convenientDiscussions.dev.js',
		})
	})
}

/**
 * Common setup logic for Convenient Discussions browser testing.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {() => Promise<void>} injectScriptCallback
 */
async function internalSetup(page, url, injectScriptCallback) {
	console.log(`🚀 Setting up Convenient Discussions on: ${url}`)

	// Set up console message capture
	/** @type {{ type: string; text: string }[]} */
	const consoleMessages = []
	page.on('console', (msg) => {
		const type = msg.type()
		const text = msg.text()

		// Filter out common noise
		if (
			text.match(
				/deprecated ResourceLoader module|The stream mediawiki|CdxPopover|adjacencies have left/,
			)
		) {
			return
		}

		consoleMessages.push({ type, text })

		// Log errors and warnings immediately
		if (type === 'error') {
			console.log(`❌ Browser Error: ${text}`)
		} else if (type === 'warning') {
			console.log(`⚠️ Browser Warning: ${text}`)
		}
	})

	// Set up page error capture
	page.on('pageerror', (error) => {
		console.log(`💥 Page Error: ${error.stack || error.message}`)
		consoleMessages.push({ type: 'pageerror', text: error.stack || error.message })
		throw error
	})

	// Navigate to Wikipedia talk page
	await page.goto(url)
	console.log('📄 Navigated to Wikipedia page')

	// Wait for page to load completely
	await page.waitForLoadState('networkidle')
	console.log('🌐 Page loaded')

	// Wait for MediaWiki globals to be available
	await page.waitForFunction(() => window.mw && window.$, { timeout: 10_000 })
	console.log('⚙️ MediaWiki globals loaded')

	// Inject the script via callback
	await injectScriptCallback()
	console.log('💉 Convenient Discussions script injected')

	// Wait for CD to load
	try {
		await page.waitForFunction(
			() =>
				window.convenientDiscussions?.comments !== undefined &&
				window.convenientDiscussions.comments.length > 0 &&
				window.convenientDiscussions.settings,
			{ timeout: 15_000 },
		)
	} catch (e) {
		const pageErrors = consoleMessages.filter((m) => m.type === 'pageerror')
		if (pageErrors.length > 0) {
			throw new Error(
				'Page errors occurred during initialization:\n' +
					pageErrors.map((m) => m.text).join('\n\n'),
			)
		}
		throw e
	}
	console.log('🎯 Convenient Discussions initialized')

	// Additional wait for comments to be fully processed
	await page.waitForTimeout(2000)
	console.log('✅ Setup complete - ready for testing')

	// Log summary of console messages
	const errors = consoleMessages.filter((msg) => msg.type === 'error' || msg.type === 'pageerror')
	const warnings = consoleMessages.filter((msg) => msg.type === 'warning')

	if (errors.length > 0) {
		console.log(`🔍 Found ${errors.length} console errors during setup`)
	}
	if (warnings.length > 0) {
		console.log(`🔍 Found ${warnings.length} console warnings during setup`)
	}

	// Store console messages on the page for tests to access
	await page.evaluate((messages) => {
		window._testConsoleMessages = messages
	}, consoleMessages)
}

/**
 * Get a comment by index with proper typing
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} index
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function getCommentByIndex(page, index = 0) {
	await waitForConvenientDiscussions(page)

	return page.locator('.cd-comment').nth(index)
}

/**
 * Get a spacious comment
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} index
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function getSpaciousComment(page, index = 0) {
	await waitForConvenientDiscussions(page)

	return page.locator('.cd-comment.cd-comment-reformatted').nth(index)
}

/**
 * Get a compact comment
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} index
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function getCompactComment(page, index = 0) {
	await waitForConvenientDiscussions(page)

	return page.locator('.cd-comment:not(.cd-comment-reformatted)').nth(index)
}

/**
 * Toggle comment display
 *
 * @param {import('@playwright/test').Page} page
 * @param {'spacious' | 'compact'} display
 */
async function toggleCommentDisplay(page, display) {
	await page.evaluate((displayValue) => {
		window.convenientDiscussions.settings.set('commentDisplay', displayValue)
	}, display)

	// Wait for setting to take effect
	await page.waitForTimeout(100)
}

/**
 * Create a test comment for testing purposes
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} content
 * @param {boolean} spacious
 */
async function createTestComment(page, content = 'Test comment content', spacious = false) {
	await page.evaluate(
		({ contentValue, spaciousValue }) => {
			// This would need to be implemented based on your test setup
			// For now, this is a placeholder
			console.log('Creating test comment:', contentValue, spaciousValue)
		},
		{ contentValue: content, spaciousValue: spacious },
	)
}

/**
 * Check if comment has layers
 *
 * @param {import('@playwright/test').Locator} comment
 * @returns {Promise<boolean>}
 */
async function commentHasLayers(comment) {
	const underlay = comment.locator('.cd-comment-underlay')
	const overlay = comment.locator('.cd-comment-overlay')

	return (await underlay.count()) > 0 && (await overlay.count()) > 0
}

/**
 * Trigger comment highlighting
 *
 * @param {import('@playwright/test').Locator} comment
 */
async function highlightComment(comment) {
	await comment.click()

	// Wait for layers to be created
	await comment.locator('.cd-comment-underlay').waitFor({ state: 'visible' })
	await comment.locator('.cd-comment-overlay').waitFor({ state: 'visible' })
}

/**
 * Check comment positioning
 *
 * @param {import('@playwright/test').Locator} comment
 * @returns {Promise<{comment: any, underlay: any, overlay: any}>}
 */
async function getCommentPositioning(comment) {
	const commentBox = await comment.boundingBox()
	const underlayBox = await comment.locator('.cd-comment-underlay').boundingBox()
	const overlayBox = await comment.locator('.cd-comment-overlay').boundingBox()

	return {
		comment: commentBox,
		underlay: underlayBox,
		overlay: overlayBox,
	}
}

/**
 * Get console messages captured during setup
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{type: string, text: string}>>}
 */
async function getConsoleMessages(page) {
	return await page.evaluate(() => window._testConsoleMessages || [])
}

/**
 * Complete setup for Convenient Discussions browser testing using the development server.
 * This injects the script from localhost:9000 instead of the built dist file.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url Wikipedia talk page URL (defaults to JWBTH test page)
 */
async function setupConvenientDiscussions(page, url = TEST_PAGES.JWBTH_TEST) {
	await internalSetup(page, url, async () => {
		// Inject the development script from localhost:9000
		await page.addScriptTag({
			type: 'module',
			url: 'http://localhost:9000/src/loader/startup.js',
		})
	})
}

export {
	TEST_PAGES,
	waitForConvenientDiscussions,
	setupConvenientDiscussionsFromDevBuild,
	setupConvenientDiscussions,
	getCommentByIndex,
	getSpaciousComment,
	getCompactComment,
	toggleCommentDisplay,
	createTestComment,
	commentHasLayers,
	highlightComment,
	getCommentPositioning,
	getConsoleMessages,
}
