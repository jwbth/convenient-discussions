// @ts-check
const { test, expect } = require('@playwright/test');
const { setupConvenientDiscussions, TEST_PAGES } = require('./helpers/test-utils');

/**
 * Example showing different ways to set up browser tests
 */

test.describe('Setup Examples', () => {
  test.skip('Example: Default setup (Talk:Main_Page)', async ({ page }) => {
    // Uses the default test page
    await setupConvenientDiscussions(page);

    // Your test code here
    const comments = page.locator('.cd-comment');
    await expect(comments.first()).toBeVisible();
  });

  test.skip('Example: Custom test page', async ({ page }) => {
    // Use a specific test page with known comment structure
    await setupConvenientDiscussions(page, TEST_PAGES.CD_TEST_CASES);

    // Your test code here
    const comments = page.locator('.cd-comment');
    await expect(comments.first()).toBeVisible();
  });

  test.skip('Example: Any Wikipedia talk page', async ({ page }) => {
    // Use any Wikipedia talk page
    await setupConvenientDiscussions(page, 'https://en.wikipedia.org/wiki/Talk:JavaScript');

    // Your test code here
    const comments = page.locator('.cd-comment');
    await expect(comments.first()).toBeVisible();
  });
});