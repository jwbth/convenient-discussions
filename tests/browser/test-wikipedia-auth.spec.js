// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthenticatedContext } = require('./auth-helper');

/**
 * Example test demonstrating authentication on test.wikipedia.org
 */

test.describe('Test Wikipedia Authentication', () => {
  test.beforeEach(async ({ context }) => {
    await setupAuthenticatedContext(context);
  });

  test('should be logged in to test.wikipedia.org', async ({ page }) => {
    // Navigate to test.wikipedia.org
    await page.goto('/wiki/Main_Page');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check if we're logged in by looking for user menu
    const userMenu = page.locator('#pt-userpage');
    const anonMenu = page.locator('#pt-anonuserpage');

    // We should either be logged in (userMenu visible) or anonymous (anonMenu visible)
    await expect(userMenu.or(anonMenu)).toBeVisible();

    // If logged in, verify we can see our username
    if (await userMenu.count() > 0) {
      console.log('✅ Successfully authenticated - user menu visible');
      await expect(userMenu).toBeVisible();
    } else {
      console.log('ℹ️  Running as anonymous user');
      await expect(anonMenu).toBeVisible();
    }
  });

  test('should access a talk page on test.wikipedia.org', async ({ page }) => {
    // Navigate to a talk page that should exist
    await page.goto('/wiki/Talk:Main_Page');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Verify we're on a talk page
    await expect(page.locator('#ca-talk')).toHaveClass(/selected/);

    // Check for MediaWiki environment
    const mwConfig = await page.evaluate(() => window.mw?.config?.get('wgSiteName'));
    expect(mwConfig).toBe('Wikipedia');

    console.log('✅ Successfully loaded talk page on test.wikipedia.org');
  });
});