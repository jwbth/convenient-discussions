// @ts-check
const { test: setup } = require('@playwright/test')

const authFile = 'playwright/.auth/user.json'

setup('authenticate', async ({ page }) => {
	// Increase timeout for manual captcha solving
	setup.setTimeout(300_000) // 5 minutes
	// Get credentials from environment variables
	const username = process.env.WIKIPEDIA_USERNAME
	const password = process.env.WIKIPEDIA_PASSWORD

	if (!username || !password) {
		console.log('⚠️  No Wikipedia credentials provided. Skipping authentication setup.')
		console.log(
			'   Set WIKIPEDIA_USERNAME and WIKIPEDIA_PASSWORD environment variables to enable authentication.',
		)

		return
	}

	console.log('🔐 Setting up authentication for test.wikipedia.org...')

	// Check if already logged in (Playwright uses storageState from config if it exists)
	console.log('🔍 Checking for an existing session...')
	await page.goto('https://test.wikipedia.org/wiki/Main_Page')
	const userMenuCheck = page.locator('#pt-userpage, #pt-userpage-2')
	if ((await userMenuCheck.count()) > 0) {
		console.log('✅ Already authenticated - skipping login')
		await page.context().storageState({ path: authFile })

		return
	}

	console.log('🔑 Not authenticated. Proceeding to login page...')

	// Navigate to test.wikipedia.org login page
	await page.goto('https://test.wikipedia.org/wiki/Special:UserLogin')

	// Wait for login form to be visible
	await page.waitForSelector('#wpName1', { timeout: 10_000 })

	// Fill in credentials
	await page.fill('#wpName1', username)
	await page.fill('#wpPassword1', password)

	// Click login button
	await page.click('#wpLoginAttempt')

	// Wait for page to load after login attempt
	await page.waitForLoadState('networkidle', { timeout: 30_000 })

	// Check for captcha first
	const captcha = page.locator('.fancycaptcha-image, .captcha, #wpCaptchaWord')
	if ((await captcha.count()) > 0) {
		console.log('🤖 CAPTCHA detected! Please solve it manually in the browser window.')
		console.log('   The test will wait for you to complete the captcha and login.')

		// Wait for either successful login or error message
		await Promise.race([
			page.waitForSelector('#pt-userpage, #pt-userpage-2', { timeout: 120_000 }), // Wait up to 2 minutes
			page.waitForSelector('#pt-anonuserpage', { timeout: 120_000 }),
			page.waitForSelector('.errorbox', { timeout: 120_000 }),
		])
	}

	// Check for login errors
	const errorBox = page.locator('.errorbox')
	if ((await errorBox.count()) > 0) {
		const errorText = await errorBox.textContent()
		// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
		throw new Error(`Login failed: ${errorText}`)
	}

	// Verify we're logged in by checking for user menu
	const userMenu = page.locator('#pt-userpage, #pt-userpage-2')
	const anonMenu = page.locator('#pt-anonuserpage')

	if ((await userMenu.count()) > 0) {
		console.log('✅ Successfully logged in - user menu found')
	} else if ((await anonMenu.count()) > 0) {
		throw new Error('Login failed - still showing as anonymous user')
	} else {
		throw new Error('Login status unclear - neither user nor anonymous menu found')
	}

	console.log('✅ Successfully logged in to test.wikipedia.org')

	// Save authentication state
	await page.context().storageState({ path: authFile })
	console.log('💾 Authentication state saved to .auth/user.json')
})
