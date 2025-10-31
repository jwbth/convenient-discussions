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

    // Check if events are bound
    const eventsInfo = await page.evaluate(() => {
      const cd = window.convenientDiscussions;
      const firstComment = cd.comments[0];
      const firstHighlightable = firstComment.highlightables[0];

      return {
        hasHighlightables: firstComment.highlightables.length > 0,
        firstHighlightableTagName: firstHighlightable.tagName,
        firstHighlightableClasses: firstHighlightable.className,
        firstHighlightableId: firstHighlightable.id,
      };
    });

    console.log('Events info:', JSON.stringify(eventsInfo, null, 2));

    // Try to manually call handleHover to see if it works
    const manualHoverInfo = await page.evaluate(() => {
      const cd = window.convenientDiscussions;
      const firstComment = cd.comments[0];

      try {
        // Try to manually call handleHover
        firstComment.handleHover();

        return {
          isHoveredAfterManualCall: firstComment.isHovered,
          hasLayersAfterManualCall: !!firstComment.layers,
          hasActionsAfterManualCall: !!firstComment.actions,
          error: null,
        };
      } catch (error) {
        return { error: error.message };
      }
    });

    console.log('Manual hover info:', JSON.stringify(manualHoverInfo, null, 2));

    // Try to manually trigger hover on the first comment
    const firstCommentPart = page.locator('.cd-comment-part-first').first();
    await firstCommentPart.hover();
    await page.waitForTimeout(2000);

    // Check what happened after hover
    const afterHoverInfo = await page.evaluate(() => {
      const cd = window.convenientDiscussions;
      const firstComment = cd.comments[0];

      // Check the actual DOM structure of the overlay
      const overlay = document.querySelector('.cd-comment-overlay');
      let overlayStructure = null;
      if (overlay) {
        overlayStructure = {
          children: Array.from(overlay.children).map((child) => ({
            tagName: child.tagName,
            className: child.className,
            children: Array.from(child.children).map((grandchild) => ({
              tagName: grandchild.tagName,
              className: grandchild.className,
            })),
          })),
        };
      }

      return {
        hasLayers: !!firstComment.layers,
        hasActions: !!firstComment.actions,
        isHovered: firstComment.isHovered,
        layersContainerExists: !!document.querySelector('.cd-commentLayersContainer'),
        underlayExists: !!document.querySelector('.cd-comment-underlay'),
        overlayExists: !!document.querySelector('.cd-comment-overlay'),
        overlayMenuExists: !!document.querySelector('.cd-comment-overlay-menu'),
        overlayGradientExists: !!document.querySelector('.cd-comment-overlay-gradient'),
        overlayInnerWrapperExists: !!document.querySelector('.cd-comment-overlay-innerWrapper'),
        overlayStructure,
        layersType: firstComment.layers ? firstComment.layers.constructor.name : null,
        actionsType: firstComment.actions ? firstComment.actions.constructor.name : null,
        overlayMenuFromLayers: firstComment.layers?.overlayMenu ? firstComment.layers.overlayMenu.className : null,
        overlayMenuFromActions: firstComment.actions && typeof firstComment.actions.getOverlayMenu === 'function' ? (firstComment.actions.getOverlayMenu() ? 'found' : 'not found') : 'method not found',
        replyButtonExists: !!firstComment.actions?.replyButton,
        overlayMenuButtons: Array.from(document.querySelectorAll('.cd-comment-overlay-menu *')).map((el) => ({
          tagName: el.tagName,
          className: el.className,
          textContent: el.textContent.trim(),
        })),
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
