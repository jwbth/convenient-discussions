// @ts-check
const { test, expect } = require('@playwright/test');

const { setupConvenientDiscussions } = require('./helpers/test-utils');

/**
 * Browser tests for Comment layers functionality
 * Tests visual layers, positioning, and hover behaviors for CompactComment and SpaciousComment
 */

test.describe('Comment Layers', () => {
  test.beforeEach(async ({ page }) => {
    await setupConvenientDiscussions(page);
  });

  test('CompactComment should show overlay menu on hover', async ({ page }) => {
    // Find a compact comment
    const compactComment = page.locator('.cd-comment:not(.cd-comment-reformatted)').first();

    // Hover over the comment
    await compactComment.hover();

    // Check that overlay menu appears
    const overlayMenu = compactComment.locator('.cd-comment-overlay-menu');
    await expect(overlayMenu).toBeVisible();

    // Check that overlay gradient is visible
    const overlayGradient = compactComment.locator('.cd-comment-overlay-gradient');
    await expect(overlayGradient).toBeVisible();
  });

  test('SpaciousComment should not have overlay menu', async ({ page }) => {
    // Find a spacious comment
    const spaciousComment = page.locator('.cd-comment.cd-comment-reformatted').first();

    // Hover over the comment
    await spaciousComment.hover();

    // Check that no overlay menu appears
    const overlayMenu = spaciousComment.locator('.cd-comment-overlay-menu');
    await expect(overlayMenu).not.toBeVisible();
  });

  test('Comment layers should be positioned correctly', async ({ page }) => {
    const comment = page.locator('.cd-comment').first();

    // Trigger layer creation (e.g., by highlighting)
    await comment.click();

    // Check that underlay exists and is positioned
    const underlay = comment.locator('.cd-comment-underlay');
    await expect(underlay).toBeVisible();

    // Check that overlay exists and is positioned
    const overlay = comment.locator('.cd-comment-overlay');
    await expect(overlay).toBeVisible();

    // Verify positioning - underlay should be behind comment, overlay in front
    const commentBox = await comment.boundingBox();
    const underlayBox = await underlay.boundingBox();
    const overlayBox = await overlay.boundingBox();

    expect(underlayBox).toBeTruthy();
    expect(overlayBox).toBeTruthy();
    expect(commentBox).toBeTruthy();

    // Basic positioning checks
    expect(Math.abs(underlayBox.x - commentBox.x)).toBeLessThan(5);
    expect(Math.abs(overlayBox.x - commentBox.x)).toBeLessThan(5);
  });

  test('Layer styles should update correctly', async ({ page }) => {
    const comment = page.locator('.cd-comment').first();

    // Trigger layer creation
    await comment.click();

    const underlay = comment.locator('.cd-comment-underlay');
    const overlay = comment.locator('.cd-comment-overlay');

    // Check initial styles
    await expect(underlay).toHaveCSS('position', 'absolute');
    await expect(overlay).toHaveCSS('position', 'absolute');

    // Trigger style update (e.g., window resize)
    await page.setViewportSize({ width: 1200, height: 800 });

    // Verify layers are still properly positioned
    await expect(underlay).toBeVisible();
    await expect(overlay).toBeVisible();
  });
});
