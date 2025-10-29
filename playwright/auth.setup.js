// @ts-check
const { test: setup, expect } = require('@playwright/test');

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  // Get credentials from environment variables
  const username = process.env.WIKIPEDIA_USERNAME;
  const password = process.env.WIKIPEDIA_PASSWORD;

  if (!username || !password) {
    console.log('⚠️  No Wikipedia credentials provided. Skipping authentication setup.');
    console.log('   Set WIKIPEDIA_USERNAME and WIKIPEDIA_PASSWORD environment variables to enable authentication.');
    return;
  }

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
  const userMenu = page.locator('#pt-userpage');
  if (await userMenu.count() === 0) {
    throw new Error('Login failed - user menu not found');
  }

  console.log('✅ Successfully logged in to test.wikipedia.org');

  // Save authentication state
  await page.context().storageState({ path: authFile });
  console.log('💾 Authentication state saved to .auth/user.json');
});