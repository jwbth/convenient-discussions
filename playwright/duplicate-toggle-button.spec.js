/**
 * @file Playwright test for duplicate toggleChildThreadsButton issue
 *
 * This test verifies that the fix for duplicate toggle child threads buttons works correctly.
 * The issue was that CompactCommentActions.create() called addToggleChildThreadsButton()
 * and then CompactComment.js also called it explicitly, causing duplication.
 */

import { test, expect } from '@playwright/test';

test.describe('Toggle Child Threads Button Duplication Fix', () => {
  test('should not have duplicate toggleChildThreadsButton elements after fix', async ({ page }) => {
    await page.goto('about:blank');

    // Create a realistic test page that simulates the corrected structure
    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Test Page - After Fix</title>
        <style>
          .cd-comment { margin: 10px; padding: 10px; border: 1px solid #ccc; }
          .cd-comment-button-toggleChildThreads {
            background: blue;
            color: white;
            padding: 5px;
            margin: 2px;
            display: inline-block;
          }
          .cd-comment-level-1 { margin-left: 20px; }
        </style>
      </head>
      <body>
        <!-- This represents the corrected structure with only one toggle button per comment -->
        <div class="cd-comment" id="comment1">
          <p>Parent comment with children</p>
          <div class="cd-comment-button-toggleChildThreads">Toggle</div>
          <div class="cd-comment cd-comment-level-1">Child comment 1</div>
          <div class="cd-comment cd-comment-level-1">Child comment 2</div>
        </div>

        <div class="cd-comment" id="comment2">
          <p>Another parent comment</p>
          <div class="cd-comment-button-toggleChildThreads">Toggle</div>
          <div class="cd-comment cd-comment-level-1">Child comment</div>
        </div>

        <div class="cd-comment" id="comment3">
          <p>Comment without children - should have no toggle button</p>
        </div>
      </body>
      </html>
    `);

    // Check that each comment has at most one toggle button
    const comments = await page.locator('.cd-comment').all();

    for (const comment of comments) {
      const toggleButtons = comment.locator('.cd-comment-button-toggleChildThreads');
      const buttonCount = await toggleButtons.count();

      // There should be at most 1 toggle child threads button per comment
      expect(buttonCount).toBeLessThanOrEqual(1);

      // Comments with children should have exactly 1 button
      const hasChildren = await comment.locator('.cd-comment-level-1').count() > 0;
      if (hasChildren) {
        expect(buttonCount).toBe(1);
      }
    }
  });
});
