// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Example of how to handle authentication in browser tests
 * This is for future reference - not needed for basic Comment testing
 */

test.describe('Authentication Example', () => {
  test.skip('Example: Login with cookies', async ({ page }) => {
    // This is an example of how you could handle login in the future
    // Skip this test for now since CD works without login

    // Set Wikipedia session cookies (you'd get these from your browser)
    await page.context().addCookies([
      {
        name: 'enwikiUserID',
        value: 'your-user-id',
        domain: '.wikipedia.org',
        path: '/',
      },
      {
        name: 'enwikiUserName',
        value: 'YourUsername',
        domain: '.wikipedia.org',
        path: '/',
      },
      {
        name: 'enwiki_session',
        value: 'your-session-token',
        domain: '.wikipedia.org',
        path: '/',
      },
    ]);

    // Navigate to Wikipedia
    await page.goto('https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases');

    // Check if logged in
    const userMenu = page.locator('#pt-userpage');
    await expect(userMenu).toBeVisible();
  });

  test.skip('Example: Login with credentials', async ({ page }) => {
    // Alternative: Login through the login form
    await page.goto('https://en.wikipedia.org/wiki/Special:UserLogin');

    await page.fill('#wpName1', 'your-username');
    await page.fill('#wpPassword1', 'your-password');
    await page.click('#wpLoginAttempt');

    // Wait for redirect after login
    await page.waitForURL(/.*wikipedia\.org.*/);

    // Now navigate to test page
    await page.goto('https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases');
  });
});
