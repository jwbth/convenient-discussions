// @ts-check
const { test, expect } = require('@playwright/test');

const { setupConvenientDiscussions } = require('./helpers/test-utils');

/**
 * Browser tests for Comment actions functionality
 * Tests action buttons, menus, and interactions for CompactComment and SpaciousComment
 */

test.describe('Comment Actions', () => {
  test.beforeEach(async ({ page }) => {
    await setupConvenientDiscussions(page);
  });

  test('SpaciousComment should show action buttons in structured layout', async ({ page }) => {
    // Find a spacious comment
    const spaciousComment = page.locator('.cd-comment.cd-comment-reformatted').first();

    // Check for action buttons container
    const actionsContainer = spaciousComment.locator('.cd-comment-actions');
    await expect(actionsContainer).toBeVisible();

    // Check for specific action buttons
    const replyButton = actionsContainer.locator('.cd-comment-button-reply');
    const editButton = actionsContainer.locator('.cd-comment-button-edit');

    await expect(replyButton).toBeVisible();
    // Edit button may not be visible depending on permissions
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

  test('Action buttons should be functional', async ({ page }) => {
    const comment = page.locator('.cd-comment').first();

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

  test('Copy link action should work', async ({ page }) => {
    const comment = page.locator('.cd-comment').first();

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

  test('Thank button should work when available', async ({ page }) => {
    const comment = page.locator('.cd-comment').first();

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
