// @ts-check
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const authFile = path.join(__dirname, '..', '..', 'playwright', '.auth', 'user.json')

/**
 * Ensures the user is authenticated on the current page.
 * If not authenticated, performs login using credentials from environment variables.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function ensureAuthenticated(page) {
	console.log(`🔍 Checking authentication on: ${page.url()}`)

	// Check if already logged in by looking for user menu
	const userMenu = page.locator('#pt-userpage, #pt-userpage-2')
	if ((await userMenu.count()) > 0) {
		console.log('✅ Already authenticated')

		return
	}

	console.log('🔑 Not authenticated. Redirecting to login page...')

	// Get credentials from environment variables
	const username = process.env.WIKIPEDIA_USERNAME
	const password = process.env.WIKIPEDIA_PASSWORD

	if (!username || !password) {
		throw new Error(
			'WIKIPEDIA_USERNAME and WIKIPEDIA_PASSWORD environment variables are required for authentication.',
		)
	}

	const currentUrl = page.url()
	const pageName = await page.evaluate(() => (window.mw ? mw.config.get('wgPageName') : null))

	// Navigate to login page, preserving the return to URL if possible. MediaWiki's returnto
	// parameter expects a page title, not a full URL.
	let loginUrl = 'https://test.wikipedia.org/w/index.php?title=Special:UserLogin'
	if (pageName && !pageName.includes('Special:UserLogin') && !pageName.includes('Special:CreateAccount')) {
		loginUrl += `&returnto=${encodeURIComponent(pageName)}`
		const url = new URL(currentUrl)
		const searchParams = new URLSearchParams(url.search)
		searchParams.delete('title')
		const query = searchParams.toString()
		if (query) {
			loginUrl += `&returntoquery=${encodeURIComponent(query)}`
		}
	}

	await page.goto(loginUrl)

	// Wait for either the login form or the user menu (in case of auto-login)
	await page.locator('#wpName1, #pt-userpage, #pt-userpage-2').first().waitFor({ timeout: 10_000 })

	// If already logged in (auto-login), just log it. Otherwise, perform manual login.
	if (await page.locator('#pt-userpage, #pt-userpage-2').isVisible()) {
		console.log('✅ Auto-authenticated after redirecting to login page')
	} else {
		// Fill in credentials
		await page.fill('#wpName1', username)
		await page.fill('#wpPassword1', password)

		// Click login button
		await page.click('#wpLoginAttempt')

		// Wait for redirection back or successful login indication
		await page.waitForLoadState('networkidle', { timeout: 30_000 })

		// Check for captcha
		const captcha = page.locator('.fancycaptcha-image, .captcha, #wpCaptchaWord')
		if ((await captcha.count()) > 0) {
			console.log('🤖 CAPTCHA detected! Please solve it manually (test will wait up to 2 minutes)')
			await Promise.race([
				page.waitForSelector('#pt-userpage, #pt-userpage-2', { timeout: 120_000 }),
				page.waitForSelector('.errorbox', { timeout: 120_000 }),
			])
		}

		// Check for login errors
		const errorBox = page.locator('.errorbox')
		if ((await errorBox.count()) > 0) {
			const errorText = await errorBox.textContent()
			throw new Error(`Login failed: ${errorText}`)
		}

		// Final verification
		if ((await page.locator('#pt-userpage, #pt-userpage-2').count()) === 0) {
			throw new Error('Login failed - user menu not found after login attempt')
		}

		console.log('✅ Successfully logged in manually')
	}

	// Save the storage state so subsequent tests can use it
	await page.context().storageState({ path: authFile })
	console.log(`💾 Authentication state saved to ${authFile}`)

	// Ensure we are back on the target page if login didn't redirect us
	if (page.url() !== currentUrl && !page.url().includes('Special:UserLogin')) {
		console.log(`↪️  Navigating back to target URL: ${currentUrl}`)
		await page.goto(currentUrl)
		await page.waitForLoadState('networkidle')
	}
}
