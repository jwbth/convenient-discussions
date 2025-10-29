// @ts-check
const { test, expect } = require('@playwright/test');

const { setupConvenientDiscussions } = require('./helpers/test-utils');

/**
 * Browser tests for Comment visual appearance and behavior
 * Tests visual regression and appearance consistency for CompactComment and SpaciousComment
 */

test.describe('Comment Visual Appearance', () => {
  test.beforeEach(async ({ page }) => {
    await setupConvenientDiscussions(page);
  });

  test('SpaciousComment should have correct visual structure', async ({ page }) => {
    const spaciousComment = page.locator('.cd-comment.cd-comment-reformatted').first();

    // Check for header elements
    const header = spaciousComment.locator('.cd-comment-header');
    await expect(header).toBeVisible();

    const author = spaciousComment.locator('.cd-comment-author');
    const timestamp = spaciousComment.locator('.cd-comment-timestamp');

    await expect(author).toBeVisible();
    await expect(timestamp).toBeVisible();

    // Check for content area
    const content = spaciousComment.locator('.cd-comment-content');
    await expect(content).toBeVisible();

    // Check for actions area
    const actions = spaciousComment.locator('.cd-comment-actions');
    await expect(actions).toBeVisible();
  });

  test('CompactComment should maintain MediaWiki appearance', async ({ page }) => {
    const compactComment = page.locator('.cd-comment:not(.cd-comment-reformatted)').first();

    // Should look like traditional MediaWiki comment
    // Check that it doesn't have spacious-specific elements
    const header = compactComment.locator('.cd-comment-header');
    await expect(header).not.toBeVisible();

    // Should have traditional signature inline with content
    const signature = compactComment.locator('.cd-comment-signature');
    await expect(signature).toBeVisible();
  });

  test('Comment highlighting should work correctly', async ({ page }) => {
    const comment = page.locator('.cd-comment').first();

    // Click to highlight comment
    await comment.click();

    // Check for highlight class
    await expect(comment).toHaveClass(/cd-comment-target/);

    // Check that layers are created and visible
    const underlay = comment.locator('.cd-comment-underlay');
    const overlay = comment.locator('.cd-comment-overlay');

    await expect(underlay).toBeVisible();
    await expect(overlay).toBeVisible();

    // Check highlight styling
    await expect(underlay).toHaveCSS('background-color', /.+/);
  });

  test('Comment threads should be visually structured', async ({ page }) => {
    // Find a comment with replies
    const parentComment = page.locator('.cd-comment').first();
    const thread = parentComment.locator('xpath=following-sibling::*[contains(@class, "cd-comment-thread")]');

    if (await thread.isVisible()) {
      // Check thread indentation
      const threadBox = await thread.boundingBox();
      const parentBox = await parentComment.boundingBox();

      // Thread should be indented relative to parent
      expect(threadBox.x).toBeGreaterThan(parentBox.x);
    }
  });

  test('Visual consistency between comment types', async ({ page }) => {
    // Get both comment types if available
    const spaciousComment = page.locator('.cd-comment.cd-comment-reformatted').first();
    const compactComment = page.locator('.cd-comment:not(.cd-comment-reformatted)').first();

    if (await spaciousComment.isVisible() && await compactComment.isVisible()) {
      // Both should have consistent font sizing for content
      const spaciousContent = spaciousComment.locator('.cd-comment-content');
      const compactContent = compactComment.locator('.cd-comment-content');

      const spaciousFontSize = await spaciousContent.evaluate((el) =>
        window.getComputedStyle(el).fontSize
      );
      const compactFontSize = await compactContent.evaluate((el) =>
        window.getComputedStyle(el).fontSize
      );

      expect(spaciousFontSize).toBe(compactFontSize);
    }
  });
});
