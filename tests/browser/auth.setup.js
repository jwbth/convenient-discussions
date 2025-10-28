// @ts-check
const { chromium } = require('@playwright/test');

/**
 * Authentication setup for test.wikipedia.org
 * This creates a reusable authentication state that can be used by all tests
 */

/**
 * Setup authentication for test.wikipedia.org
 * @param {string} username - Wikipedia username
 * @param {string} password - Wikipedia password
 * @returns {Promise<void>}
 */
async function setupAuth(username, password) {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('🔐 Setting up authentication for test.wikipedia.org...');

    // Navigate to test.wikipedia.org login page
    await page.goto('https://test.wikipedia.org/wiki/Special:UserLogin');

    // Wait for login form to be visible
    await page.waitForSelector('#wpName1', { timeout: 10000 });

    // Fill in credentials
    await page.fill('#wpName1', username);
    await page.fill('#wpPassword1', password);

    // Click login button
    await page.click('#wpLoginAttempt');

    // Wait for successful login (redirect or user menu appears)
    await page.waitForSelector('#pt-userpage, #pt-anonuserpage', { timeout: 15000 });

    // Verify we're logged in by checking for user menu
    const userMenu = await page.locator('#pt-userpage');
    if (await userMenu.count() === 0) {
      throw new Error('Login failed - user menu not found');
    }

    console.log('✅ Successfully logged in to test.wikipedia.org');

    // Save authentication state
    await context.storageState({ path: 'tests/browser/auth-state.json' });
    console.log('💾 Authentication state saved to auth-state.json');

  } catch (error) {
    console.error('❌ Authentication setup failed:', error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

module.exports = { setupAuth };