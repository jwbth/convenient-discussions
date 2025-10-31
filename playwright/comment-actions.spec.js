// @ts-check
const { test, expect } = require('@playwright/test');

const { setupConvenientDiscussions } = require('./helpers/test-utils');

/**
 * Browser tests for Comment actions functionality
 * Tests action buttons, menus, and interactions for CompactComment only
 *
 * NOTE: Currently testing compact-style comments only (spaciousComments: false)
 * All comments on the test page should be in compact style.
 */

test.describe('Comment Actions - Compact Style', () => {
  test.beforeEach(async ({ page }) => {
    await setupConvenientDiscussions(page);
  });

  test('CompactComment should show action buttons in overlay menu', async ({ page }) => {
    // Find a compact comment
    const compactComment = page.locator('.cd-comment:not(.cd-comment-reformatted)').first();

    // Hover to show overlay menu
    await compactComment.hover();

    // Check for overlay menu with actions
    const overlayMenu = compactComment.locator('.cd-comment-overlay-menu');
    await expect(overlayMenu).toBeVisible();

    // Check for action buttons in overlay
    const replyButton = overlayMenu.locator('.cd-comment-button-reply');
    await expect(replyButton).toBeVisible();
  });

  test('Compact comment action buttons should be functional', async ({ page }) => {
    // Find a compact comment
    const comment = page.locator('.cd-comment:not(.cd-comment-reformatted)').first();

    // Find and click reply button
    const replyButton = comment.locator('.cd-comment-button-reply').first();
    await replyButton.click();

    // Check that comment form appears
    const commentForm = page.locator('.cd-commentForm');
    await expect(commentForm).toBeVisible();

    // Check that form is positioned correctly relative to comment
    const commentBox = await comment.boundingBox();
    const formBox = await commentForm.boundingBox();

    expect(formBox.y).toBeGreaterThan(commentBox.y);
  });

  test('Copy link action should work for compact comments', async ({ page }) => {
    const comment = page.locator('.cd-comment:not(.cd-comment-reformatted)').first();

    // Find copy link button (may be in menu or direct)
    const copyLinkButton = comment.locator('.cd-comment-button-copyLink').first();

    if (await copyLinkButton.isVisible()) {
      await copyLinkButton.click();

      // Check for success notification or copied state
      // This depends on your implementation
      const notification = page.locator('.cd-notification');
      await expect(notification).toBeVisible();
    }
  });

  test('Thank button should work when available for compact comments', async ({ page }) => {
    const comment = page.locator('.cd-comment:not(.cd-comment-reformatted)').first();

    // Find thank button (may not be available for all comments)
    const thankButton = comment.locator('.cd-comment-button-thank');

    if (await thankButton.isVisible()) {
      await thankButton.click();

      // Check for confirmation dialog or success state
      const dialog = page.locator('.oo-ui-dialog');
      await expect(dialog).toBeVisible();
    }
  });
});
