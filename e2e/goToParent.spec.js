// @ts-check
import { test, expect } from '@playwright/test'

import { setupConvenientDiscussions } from './helpers/test-utils.js'

test.describe('Go to parent highlighting', () => {
	test.beforeEach(async ({ page }) => {
		// Using the test page provided by the user
		await setupConvenientDiscussions(
			page,
			'https://test.wikipedia.org/wiki/User_talk:JWBTH/CD_test_page',
			{
				settings: { commentDisplay: 'compact' },
			},
		)
	})

	test('should highlight parent comment on first click of "Go to parent"', async ({ page }) => {
		// Find the first comment on the 1st level (so, above the 0th)
		const commentInfo = await page.evaluate(() => {
			const comment = window.convenientDiscussions.comments.find((c) => c.level === 1)
			if (!comment) return null

			return {
				index: comment.index,
				parentIndex: comment.getParent()?.index,
			}
		})

		if (!commentInfo) {
			throw new Error('Could not find a level 1 comment on the page')
		}

		if (commentInfo.parentIndex === undefined) {
			throw new Error('Level 1 comment has no parent')
		}

		console.log(
			`Testing comment index ${commentInfo.index}, parent index ${commentInfo.parentIndex}`,
		)

		// Hover over the comment to show the menu
		const commentPart = page.locator(
			`.cd-comment-part-first[data-cd-comment-index="${commentInfo.index}"]`,
		)
		await commentPart.hover()

		// Wait for the overlay to appear
		const overlay = page.locator(
			`.cd-comment-overlay[data-cd-comment-index="${commentInfo.index}"]`,
		)
		await expect(overlay).toBeVisible()

		// Click "Go to parent" in the menu
		// The "Go to parent" button has a specific class or icon.
		// Based on CommentActions.js, it's created by createGoToParentButton.
		// In compact mode, it's likely a button in the overlay menu.
		const goToParentButton = overlay.locator('.cd-comment-button-goToParent')
		const buttonInfo = await goToParentButton.evaluate(el => ({
			className: el.className,
			isConnected: el.isConnected,
			tagName: el.tagName,
			innerHTML: el.innerHTML.substring(0, 100)
		}))
		console.log('🔘 Button Info:', JSON.stringify(buttonInfo))

		await goToParentButton.click()
		console.log('✅ Clicked "Go to parent" button')

		// Check if the parent comment is highlighted
		// The parent comment index is commentInfo.parentIndex
		const parentUnderlay = page.locator(
			`.cd-comment-underlay[data-cd-comment-index="${commentInfo.parentIndex}"]`,
		)

		// The class cd-comment-underlay-target is added when highlighted
		await expect(parentUnderlay).toHaveClass(/cd-comment-underlay-target/)
	})

	test('should keep highlighting for full duration after second quick click of "Go to parent"', async ({ page }) => {
		// Find the first comment on the 1st level (so, above the 0th)
		const commentInfo = await page.evaluate(() => {
			const comment = window.convenientDiscussions.comments.find((c) => c.level === 1)
			if (!comment) return null

			return {
				index: comment.index,
				parentIndex: comment.getParent()?.index,
			}
		})

		if (!commentInfo) {
			throw new Error('Could not find a level 1 comment on the page')
		}

		if (commentInfo.parentIndex === undefined) {
			throw new Error('Level 1 comment has no parent')
		}

		console.log(
			`Testing comment index ${commentInfo.index}, parent index ${commentInfo.parentIndex}`,
		)

		// Hover over the comment to show the menu
		const commentPart = page.locator(
			`.cd-comment-part-first[data-cd-comment-index="${commentInfo.index}"]`,
		)
		await commentPart.hover()

		// Wait for the overlay to appear
		const overlay = page.locator(
			`.cd-comment-overlay[data-cd-comment-index="${commentInfo.index}"]`,
		)
		await expect(overlay).toBeVisible()

		const goToParentButton = overlay.locator('.cd-comment-button-goToParent')

		// Click "Go to parent" once
		await goToParentButton.click()
		console.log('✅ Clicked "Go to parent" button (first time)')

		// Wait a short period to simulate a quick second click
		await page.waitForTimeout(100)

		// Click "Go to parent" a second time
		await goToParentButton.click()
		console.log('✅ Clicked "Go to parent" button (second time)')

		const parentUnderlay = page.locator(
			`.cd-comment-underlay[data-cd-comment-index="${commentInfo.parentIndex}"]`,
		)

		// Immediately after the second click, the parent should be highlighted
		await expect(parentUnderlay).toHaveClass(/cd-comment-underlay-target/)
		console.log('✅ Parent highlighted immediately after second click')

		// Wait for the full highlighting duration (1500ms)
		await page.waitForTimeout(1500)

		// The parent should still be highlighted after the full duration from the second click
		await expect(parentUnderlay).toHaveClass(/cd-comment-underlay-target/)
		console.log('✅ Parent still highlighted after full duration from second click')

		// Wait a little longer to ensure the highlighting is removed
		await page.waitForTimeout(100)

		// The parent should no longer be highlighted
		await expect(parentUnderlay).not.toHaveClass(/cd-comment-underlay-target/)
		console.log('✅ Parent highlighting removed after duration expired')
	})
})
