// @ts-check
const { test, expect } = require('@playwright/test');

const { setupConvenientDiscussions } = require('./helpers/test-utils');

/**
 * Debug test to understand comment initialization and why layers aren't being created
 */

test.describe('Debug Comment Initialization', () => {
  test('Check comment initialization and layer creation', async ({ page }) => {
    await setupConvenientDiscussions(page);

    // Wait a bit for everything to load and for bindEvents to be called
    await page.waitForTimeout(5000);

    // Check comment initialization
    const commentInfo = await page.evaluate(() => {
      const cd = window.convenientDiscussions;
      if (!cd?.comments) {
        return { error: 'CD not initialized or no comments' };
      }

      const firstComment = cd.comments[0];
      if (!firstComment) {
        return { error: 'No first comment found' };
      }

      return {
        commentsCount: cd.comments.length,
        firstCommentType: firstComment.constructor.name,
        firstCommentSpaciousProperty: firstComment.spacious,
        firstCommentIsReformatted: typeof firstComment.isReformatted === 'function' ? firstComment.isReformatted() : 'method not found',
        firstCommentHasLayers: !!firstComment.layers,
        firstCommentHasActions: !!firstComment.actions,
        firstCommentElements: firstComment.elements.length,
        firstCommentHighlightables: firstComment.highlightables.length,
        firstCommentIsActionable: firstComment.isActionable,
        settingsSpacious: cd.settings?.get('spaciousComments'),
        firstCommentBindEventsMethod: typeof firstComment.bindEvents,
        firstCommentHandleHover: typeof firstComment.handleHover,
        firstCommentCreateLayers: typeof firstComment.createLayers,
        firstCommentConfigureLayers: typeof firstComment.configureLayers,
      };
    });

    console.log('Comment initialization info:', JSON.stringify(commentInfo, null, 2));

    // Try to manually trigger hover on the first comment
    const firstCommentPart = page.locator('.cd-comment-part-first').first();
    await firstCommentPart.hover();
    await page.waitForTimeout(1000);

    // Check what happened after hover
    const afterHoverInfo = await page.evaluate(() => {
      const cd = window.convenientDiscussions;
      const firstComment = cd.comments[0];

      return {
        hasLayers: !!firstComment.layers,
        hasActions: !!firstComment.actions,
        isHovered: firstComment.isHovered,
        layersContainerExists: !!document.querySelector('.cd-commentLayersContainer'),
        underlayExists: !!document.querySelector('.cd-comment-underlay'),
        overlayExists: !!document.querySelector('.cd-comment-overlay'),
      };
    });

    console.log('After hover info:', JSON.stringify(afterHoverInfo, null, 2));

    // Try to manually call the layer creation methods
    const manualCreationInfo = await page.evaluate(() => {
      const cd = window.convenientDiscussions;
      const firstComment = cd.comments[0];

      try {
        // Try to manually trigger layer creation
        if (typeof firstComment.configureLayers === 'function') {
          const result = firstComment.configureLayers();

          return {
            configureLayersResult: result,
            hasLayersAfter: !!firstComment.layers,
            hasActionsAfter: !!firstComment.actions,
            error: null,
          };
        }

        return { error: 'configureLayers method not found' };
      } catch (error) {
        return { error: error.message };
      }
    });

    console.log('Manual creation info:', JSON.stringify(manualCreationInfo, null, 2));

    expect(true).toBe(true);
  });
});
