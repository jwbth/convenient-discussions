// @ts-check
const { test, expect } = require('@playwright/test');
const { setupConvenientDiscussions, TEST_PAGES } = require('./helpers/test-utils');

/**
 * Check what comments are available on different pages
 */

test.describe('Check Comments Availability', () => {
  test('Check what comments exist on sandbox page', async ({ page }) => {
    await setupConvenientDiscussions(page, TEST_PAGES.SANDBOX);

    // Check what comments CD found
    const cdInfo = await page.evaluate(() => {
      return {
        commentsLength: window.convenientDiscussions.comments.length,
        sectionsLength: window.convenientDiscussions.sections.length,
        commentElements: document.querySelectorAll('.cd-comment').length,
        allCommentClasses: Array.from(document.querySelectorAll('[class*="cd-comment"]')).map(el => el.className),
        hasDiscussionContent: !!document.querySelector('.mw-parser-output'),
        hasSignatures: document.querySelectorAll('.mw-parser-output a[title*="User:"], .mw-parser-output a[title*="User talk:"]').length,
      };
    });

    console.log('CD Comments Info:', cdInfo);

    // Check if there are any discussion-like elements
    const discussionElements = await page.evaluate(() => {
      const elements = [];
      // Look for common discussion patterns
      const signatures = document.querySelectorAll('a[title*="User:"], a[title*="User talk:"]');
      const timestamps = document.querySelectorAll('a[href*="oldid="]');
      const indentedContent = document.querySelectorAll('.mw-parser-output dd, .mw-parser-output dl');

      return {
        signatures: signatures.length,
        timestamps: timestamps.length,
        indentedContent: indentedContent.length,
        pageContent: document.querySelector('.mw-parser-output')?.textContent?.substring(0, 500) || 'No content'
      };
    });

    console.log('Discussion Elements:', discussionElements);

    // The test passes - we're just checking what's available
    expect(true).toBe(true);
  });

  test('Check Village Pump page', async ({ page }) => {
    await setupConvenientDiscussions(page, TEST_PAGES.VILLAGE_PUMP);

    const cdInfo = await page.evaluate(() => {
      return {
        commentsLength: window.convenientDiscussions.comments.length,
        sectionsLength: window.convenientDiscussions.sections.length,
        commentElements: document.querySelectorAll('.cd-comment').length,
      };
    });

    console.log('Village Pump CD Info:', cdInfo);
    expect(true).toBe(true);
  });
});