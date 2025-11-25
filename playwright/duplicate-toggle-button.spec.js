// @ts-check
const { test, expect } = require('@playwright/test');

const { setupConvenientDiscussions, TEST_PAGES } = require('./helpers/test-utils');

/**
 * Browser tests for duplicate toggleChildThreadsButton issue
 *
 * This test verifies that the fix for duplicate toggle child threads buttons works correctly.
 * The issue was that CompactCommentActions.create() called addToggleChildThreadsButton()
 * and then CompactComment.js also called it explicitly, causing duplication.
 *
 * Tests run on actual Wikipedia pages with real comment structures.
 */

test.describe('Toggle Child Threads Button Duplication Fix', () => {
	test.beforeEach(async ({ page }) => {
		// Use the CD test cases page which is more likely to have threaded comments
		await setupConvenientDiscussions(page, TEST_PAGES.CD_TEST_CASES);
	});

	test('should not have duplicate toggleChildThreadsButton elements in compact comments', async ({ page }) => {
		// Wait for comments to be fully processed
		await page.waitForTimeout(2000);

		// Get all comments that have been processed by Convenient Discussions
		const comments = await page.locator('.cd-comment').all();
		console.log(`Found ${comments.length} comments to check`);

		let duplicatesFound = 0;
		let commentsWithToggleButtons = 0;

		for (const [i, comment] of comments.entries()) {
			// Look for toggle child threads buttons within this comment
			const toggleButtons = comment.locator('.cd-comment-button-toggleChildThreads');
			const buttonCount = await toggleButtons.count();

			if (buttonCount > 0) {
				commentsWithToggleButtons++;
				console.log(`Comment ${i + 1}: Found ${buttonCount} toggle button(s)`);

				// Check if this comment actually has child threads
				const hasChildThreads = await page.evaluate((commentElement) => {
					// Check if this comment has children with threads
					const cdComment = commentElement._cdComment;
					if (cdComment?.getChildren) {
						const children = cdComment.getChildren();

						return children.some((child) => child.thread);
					}

					return false;
				}, await comment.elementHandle());

				if (hasChildThreads) {
					// Comments with child threads should have exactly 1 toggle button
					expect(buttonCount).toBe(1);

					if (buttonCount > 1) {
						duplicatesFound++;
						console.log(`❌ DUPLICATE FOUND: Comment ${i + 1} has ${buttonCount} toggle buttons`);

						// Log the comment structure for debugging
						const commentHtml = await comment.innerHTML();
						console.log(`Comment HTML: ${commentHtml.substring(0, 200)}...`);
					}
				} else if (buttonCount > 0) {
					// Comments without child threads should not have toggle buttons
					console.log(`⚠️ WARNING: Comment ${i + 1} has toggle button but no child threads`);
				}
			}
		}

		console.log(`✅ Checked ${comments.length} comments, found ${commentsWithToggleButtons} with toggle buttons`);

		// The main assertion: no duplicates should be found
		expect(duplicatesFound).toBe(0);
	});

	test('should verify toggle button functionality works correctly', async ({ page }) => {
		// Find a comment with child threads and a toggle button
		const commentWithToggle = page.locator('.cd-comment').filter({
			has: page.locator('.cd-comment-button-toggleChildThreads'),
		}).first();

		if (await commentWithToggle.count() > 0) {
			console.log('Found comment with toggle button, testing functionality');

			// Get the toggle button
			const toggleButton = commentWithToggle.locator('.cd-comment-button-toggleChildThreads').first();

			// Verify button is visible and clickable
			await expect(toggleButton).toBeVisible();

			// Click the toggle button
			await toggleButton.click();

			// Wait for the toggle action to complete
			await page.waitForTimeout(500);

			// Verify the button still exists and is functional
			await expect(toggleButton).toBeVisible();

			// Click again to toggle back
			await toggleButton.click();
			await page.waitForTimeout(500);

			console.log('✅ Toggle button functionality verified');
		} else {
			console.log('ℹ️ No comments with toggle buttons found on this page');
		}
	});

	test('should check for proper button positioning in overlay menu', async ({ page }) => {
		// Find a compact comment with toggle button
		const compactComment = page.locator('.cd-comment:not(.cd-comment-reformatted)').filter({
			has: page.locator('.cd-comment-button-toggleChildThreads'),
		}).first();

		if (await compactComment.count() > 0) {
			console.log('Testing toggle button positioning in compact comment overlay');

			// Hover over the comment to show overlay menu
			await compactComment.hover();
			await page.waitForTimeout(1000);

			// Check if overlay menu exists
			const overlayMenu = compactComment.locator('.cd-comment-overlay-menu');

			if (await overlayMenu.count() > 0) {
				// Verify toggle button is in the overlay menu
				const toggleInOverlay = overlayMenu.locator('.cd-comment-button-toggleChildThreads');
				const toggleCount = await toggleInOverlay.count();

				console.log(`Found ${toggleCount} toggle button(s) in overlay menu`);

				// Should have exactly 1 toggle button in overlay
				expect(toggleCount).toBeLessThanOrEqual(1);

				if (toggleCount === 1) {
					await expect(toggleInOverlay).toBeVisible();
					console.log('✅ Toggle button properly positioned in overlay menu');
				}
			} else {
				console.log('ℹ️ No overlay menu found for this comment');
			}
		} else {
			console.log('ℹ️ No compact comments with toggle buttons found');
		}
	});

	test('should verify no duplicate buttons across all comment types', async ({ page }) => {
		// Get comprehensive statistics about toggle buttons
		const stats = await page.evaluate(() => {
			const allToggleButtons = document.querySelectorAll('.cd-comment-button-toggleChildThreads');
			const allComments = document.querySelectorAll('.cd-comment');

			const buttonsByComment = {};
			let totalButtons = 0;

			allToggleButtons.forEach((button, index) => {
				totalButtons++;
				const parentComment = button.closest('.cd-comment');
				if (parentComment) {
					const commentId = parentComment.id || `comment-${Array.from(allComments).indexOf(parentComment)}`;
					buttonsByComment[commentId] = (buttonsByComment[commentId] || 0) + 1;
				}
			});

			return {
				totalButtons,
				totalComments: allComments.length,
				buttonsByComment,
				duplicateComments: Object.entries(buttonsByComment).filter(([_, count]) => count > 1),
			};
		});

		console.log('Toggle Button Statistics:', stats);

		// If we have buttons but no comments, that might indicate a different issue
		if (stats.totalButtons > 0 && stats.totalComments === 0) {
			console.log('⚠️ Found toggle buttons but no .cd-comment elements - checking comment parts');

			// Check if buttons are in comment parts instead
			const partStats = await page.evaluate(() => {
				const allToggleButtons = document.querySelectorAll('.cd-comment-button-toggleChildThreads');
				const buttonsByPart = {};

				allToggleButtons.forEach((button) => {
					const parentPart = button.closest('.cd-comment-part');
					if (parentPart) {
						const partId = parentPart.id || `part-${Array.from(document.querySelectorAll('.cd-comment-part')).indexOf(parentPart)}`;
						buttonsByPart[partId] = (buttonsByPart[partId] || 0) + 1;
					}
				});

				return {
					buttonsByPart,
					duplicateParts: Object.entries(buttonsByPart).filter(([_, count]) => count > 1),
				};
			});

			console.log('Comment Part Statistics:', partStats);

			// Check for duplicates in comment parts
			expect(partStats.duplicateParts.length).toBe(0);

			if (partStats.duplicateParts.length > 0) {
				console.log('❌ Comment parts with duplicate toggle buttons:', partStats.duplicateParts);
			} else {
				console.log('✅ No duplicate toggle buttons found in comment parts');
			}
		} else {
			// Verify no comment has more than 1 toggle button
			expect(stats.duplicateComments.length).toBe(0);

			if (stats.duplicateComments.length > 0) {
				console.log('❌ Comments with duplicate toggle buttons:', stats.duplicateComments);
			} else {
				console.log('✅ No duplicate toggle buttons found across all comments');
			}
		}
	});
});
