// @ts-check
import { test, expect } from '@playwright/test'

import { setupConvenientDiscussions, TEST_PAGES } from './helpers/test-utils.js'

test.describe('Button order – spacious mode', () => {
	test.beforeEach(async ({ page }) => {
		await setupConvenientDiscussions(page, {
			url: TEST_PAGES.JWBTH_TEST,
			settings: { commentDisplay: 'spacious' },
		})
	})

	test('buttons are ordered correctly in header and footer', async ({ page }) => {
		// Find the parent comment index
		const parentCommentIndex = await page.evaluate(() => {
			const cd = window.convenientDiscussions;
			if (!cd || !cd.comments) return -1;
			const comment = cd.comments.find((c) =>
				c.getText?.()?.includes('comment to test buttons'),
			)
			return comment?.index ?? -1
		})

		if (parentCommentIndex === -1) {
			throw new Error('Could not find the parent comment "comment to test buttons"')
		}

		// Find a child comment that has its own children (to have toggleChildThreads button)
		const childCommentIndex = await page.evaluate((parentIndex) => {
			const cd = window.convenientDiscussions;
			if (!cd || !cd.comments) return -1;
			const parent = cd.comments[parentIndex]
			const children = parent.getChildren()
			const childWithChildren = children.find((c) => c.getChildren().length > 0)
			return childWithChildren?.index ?? children[0]?.index ?? -1
		}, parentCommentIndex)

		if (childCommentIndex === -1) {
			throw new Error('Could not find a child comment of "comment to test buttons"')
		}

		console.log(`📝 Parent comment index: ${parentCommentIndex}`)
		console.log(`📝 Child comment index: ${childCommentIndex}`)

		// Force all buttons to be present for order verification
		await page.evaluate((index) => {
			const cd = window.convenientDiscussions;
			const comment = cd.comments[index];

			// 1. Enable editing others' comments to show BOTH Edit and Thank
			cd.settings.set('allowEditOthersComments', true);

			// 2. Mock as not own but actionable/editable/thankable
			comment.isOwn = false;
			comment.isEditable = true;
			comment.isActionable = true;
			if (!comment.timestamp) comment.timestamp = '12:00, 22 March 2026 (UTC)';

			// 3. Clear existing buttons and re-create them to ensure they appear in the right order
			comment.menuElement.innerHTML = '';
			comment.headerElement.querySelectorAll('.cd-comment-button').forEach(el => el.remove());

			comment.actions.replyButton = undefined;
			comment.actions.editButton = undefined;
			comment.actions.thankButton = undefined;
			comment.actions.toggleChildThreadsButton = undefined;
			comment.actions.goToParentButton = undefined;
			comment.actions.goToChildButton = undefined;

			comment.actions.create();

			// 4. Ensure Go to child button is there (must be after actions.create() so it's not cleared)
			const targetChild = cd.comments.find(c => c.index > index && c.section === comment.section);
			if (targetChild) {
				comment.setTargetChild(targetChild);
				comment.maybeAddGoToChildButton();
			}
		}, childCommentIndex);

		// Use .cd-comment-part-first as the base locator
		const childCommentPart = page.locator(`.cd-comment-part-first[data-cd-comment-index="${childCommentIndex}"]`)
		await expect(childCommentPart).toBeVisible()

		// The test says: "press the 'Go to parent' button in the header of that comment"
		const goToParentButton = childCommentPart.locator('.cd-comment-button-goToParent')
		await expect(goToParentButton).toBeVisible()
		await goToParentButton.click()
		console.log('✅ Clicked "Go to parent" button')

		await page.waitForTimeout(500)

		// Check header button order
		const header = childCommentPart.locator('.cd-comment-header')
		await expect(header).toBeVisible()

		const headerButtonClasses = await header
			.locator('.cd-comment-button')
			.evaluateAll((buttons) =>
				buttons
					.map((btn) => {
						const classes = Array.from(btn.classList)
						if (classes.includes('cd-comment-button-toggleChildThreads'))
							return '.cd-comment-button-toggleChildThreads'
						if (classes.includes('cd-comment-button-goToParent'))
							return '.cd-comment-button-goToParent'
						if (classes.includes('cd-comment-button-goToChild'))
							return '.cd-comment-button-goToChild'
						return null
					})
					.filter((c) => c !== null),
			)

		console.log('🔍 Header button order:', headerButtonClasses)

		expect(headerButtonClasses[0]).toBe('.cd-comment-button-toggleChildThreads')
		expect(headerButtonClasses[1]).toBe('.cd-comment-button-goToParent')
		expect(headerButtonClasses[2]).toBe('.cd-comment-button-goToChild')

		// Check footer (menu) button order
		const lastPart = page.locator(`.cd-comment-part-last[data-cd-comment-index="${childCommentIndex}"]`)
		const menu = lastPart.locator('.cd-comment-menu')
		await expect(menu).toBeVisible()

		// Buttons in menu don't have .cd-button-label wrapper in spacious mode by default
		const menuButtonTexts = await menu
			.locator('.cd-comment-button')
			.evaluateAll((buttons) => buttons.map((btn) => btn.textContent?.trim()))

		console.log('🔍 Menu button texts:', menuButtonTexts)

		// Expected order: Reply, Edit, Thank
		expect(menuButtonTexts[0]).toBe('Reply')
		expect(menuButtonTexts[1]).toBe('Edit')
		expect(menuButtonTexts[2]).toBe('Thank')
	})
})
