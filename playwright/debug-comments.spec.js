// @ts-check
const { test, expect } = require('@playwright/test');

const { setupConvenientDiscussions } = require('./helpers/test-utils');

/**
 * Debug test to see what comments are available on the page
 */

test.describe('Debug Comments', () => {
  test('Check what comments exist on the page', async ({ page }) => {
    await setupConvenientDiscussions(page);

    // Wait a bit for everything to load
    await page.waitForTimeout(3000);

    // Check what comment elements exist
    const commentInfo = await page.evaluate(() => {
      const allComments = document.querySelectorAll('[class*="cd-comment"]');
      const cdComments = document.querySelectorAll('.cd-comment');
      const compactComments = document.querySelectorAll('.cd-comment:not(.cd-comment-reformatted)');

      return {
        allCommentsCount: allComments.length,
        allCommentsClasses: Array.from(allComments).map(el => el.className),
        cdCommentsCount: cdComments.length,
        cdCommentsClasses: Array.from(cdComments).map(el => el.className),
        compactCommentsCount: compactComments.length,
        compactCommentsClasses: Array.from(compactComments).map(el => el.className),
        hasConvenientDiscussions: !!window.convenientDiscussions,
        commentsLength: window.convenientDiscussions?.comments ? window.convenientDiscussions.comments.length : 0,
        isInitialized: window.convenientDiscussions ? window.convenientDiscussions.isInitialized : false,
      };
    });

    console.log('Comment info:', JSON.stringify(commentInfo, null, 2));

    // Check if there are any elements with cd-comment class
    const cdCommentElements = await page.locator('.cd-comment').count();
    console.log('CD comment elements found:', cdCommentElements);

    // Check if there are any comment-like elements
    const commentLikeElements = await page.locator('[class*="comment"]').count();
    console.log('Comment-like elements found:', commentLikeElements);

    // Check the page content structure
    const pageStructure = await page.evaluate(() => {
      const content = document.querySelector('#mw-content-text');
      if (!content) return 'No content area found';

      const children = Array.from(content.children).map(el => ({
        tagName: el.tagName,
        className: el.className,
        id: el.id,
        textContent: el.textContent?.substring(0, 100) + '...'
      }));

      return children;
    });

    console.log('Page structure:', JSON.stringify(pageStructure, null, 2));

    expect(true).toBe(true);
  });
});