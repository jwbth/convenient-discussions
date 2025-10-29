// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Debug test to see what's happening with Convenient Discussions initialization
 */

test.describe('Debug CD Initialization', () => {
  test('Check what happens after script injection', async ({ page }) => {
    console.log('🚀 Starting debug test');

    // Navigate to Wikipedia talk page
    await page.goto('https://en.wikipedia.org/wiki/Talk:Main_Page');
    console.log('📄 Navigated to Wikipedia page');

    // Wait for page to load completely
    await page.waitForLoadState('networkidle');
    console.log('🌐 Page loaded');

    // Wait for MediaWiki globals to be available
    await page.waitForFunction(() => window.mw && window.$ && window.OO, { timeout: 10_000 });
    console.log('⚙️ MediaWiki globals loaded');

    // Check what MediaWiki globals are available
    const mwInfo = await page.evaluate(() => ({
      hasMw: !!window.mw,
      hasJquery: !!window.$,
      hasOO: !!window.OO,
      mwConfig: window.mw ? Object.keys(window.mw.config.get()) : [],
      wgNamespaceNumber: window.mw ? window.mw.config.get('wgNamespaceNumber') : null,
      wgPageName: window.mw ? window.mw.config.get('wgPageName') : null,
    }));
    console.log('MediaWiki info:', mwInfo);

    // Inject your built Convenient Discussions script
    await page.addScriptTag({
      path: './dist/convenientDiscussions.js',
    });
    console.log('💉 Convenient Discussions script injected');

    // Wait a bit and check what's available
    await page.waitForTimeout(2000);

    const cdInfo = await page.evaluate(() => ({
      hasConvenientDiscussions: !!window.convenientDiscussions,
      cdKeys: window.convenientDiscussions ? Object.keys(window.convenientDiscussions) : [],
      hasComments: window.convenientDiscussions ? !!window.convenientDiscussions.comments : false,
      commentsLength: window.convenientDiscussions?.comments ? window.convenientDiscussions.comments.length : 0,
      hasSettings: window.convenientDiscussions ? !!window.convenientDiscussions.settings : false,
      hasG: window.convenientDiscussions ? !!window.convenientDiscussions.g : false,
      currentPage: window.convenientDiscussions?.g ? window.convenientDiscussions.g.CURRENT_PAGE : null,
      errors: window.console ? [] : 'No console access',
    }));
    console.log('CD info after injection:', cdInfo);

    // Check for any JavaScript errors
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Wait longer and check again
    await page.waitForTimeout(5000);

    const finalCdInfo = await page.evaluate(() => ({
      hasConvenientDiscussions: !!window.convenientDiscussions,
      hasComments: window.convenientDiscussions ? !!window.convenientDiscussions.comments : false,
      commentsLength: window.convenientDiscussions?.comments ? window.convenientDiscussions.comments.length : 0,
      isInitialized: window.convenientDiscussions ? window.convenientDiscussions.isInitialized : false,
    }));
    console.log('Final CD info:', finalCdInfo);
    console.log('JavaScript errors:', errors);

    // The test passes if we get this far - we're just debugging
    expect(true).toBe(true);
  });
});
