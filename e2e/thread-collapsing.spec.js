// @ts-check
const { test, expect } = require('@playwright/test')

const {
	setupConvenientDiscussionsFromDevServer,
	TEST_PAGES,
	waitForConvenientDiscussions,
} = require('./helpers/test-utils')

/**
 * Tests for thread collapsing and expanding functionality.
 */
test.describe('Thread Collapsing', () => {
	test.beforeEach(async ({ page }) => {
		// Increase timeout for this test as setup might be slow
		test.setTimeout(60_000)

		// Use the JWBTH_TEST page as it's a compact test page, good for these tests.
		// We might want to use CD_TEST_CASES if JWBTH_TEST doesn't have suitable threaded comments.
		// Let's stick to JWBTH_TEST for now as it's used in other tests, but we should verify it has threads.
		// Actually, let's use CD_TEST_CASES if possible as it likely has more complex structures.
		// But the user guideline mentions "The user wants to find and run a test that logs into Wikipedia as user JWBTH and tests a page...".
		// The prompt says "Let's add a playwright test testing thread collapsing and expanding".
		// I'll use CD_TEST_CASES to be safe, assuming it exists and is public.
		// Re-reading test-utils.js: TEST_PAGES.CD_TEST_CASES is defined.
		await setupConvenientDiscussionsFromDevServer(page, TEST_PAGES.CD_TEST_CASES)
	})

	test('should collapse and expand a thread', async ({ page }) => {
		await waitForConvenientDiscussions(page)

		// Find the first thread's click area.
		// CD injects .cd-thread-clickArea elements for threads.
		const firstClickArea = page.locator('.cd-thread-clickArea').first()

		// Ensure there is at least one thread click area
		await expect(firstClickArea).toBeVisible()

		// Get the thread line element associated with this click area (it's inside it or related)
		// In Thread.js: this.line = this.clickArea.firstChild
		const threadLine = firstClickArea.locator('.cd-thread-line')
		await expect(threadLine).toBeVisible()

		// === COLLAPSE ===
		await firstClickArea.click()

		// Verify that the thread is collapsed.
		// When collapsed, CD usually hides the thread content and shows an expand note.
		// The expand note has class .cd-thread-expandNote
		const expandNote = page.locator('.cd-thread-expandNote').first()
		await expect(expandNote).toBeVisible()

		// The click area (and thus the line) might be hidden or removed when collapsed,
		// OR it might stay but the content is hidden.
		// Thread.js: this.clickArea is a wrapper. When collapsed, this.expandNote is created.
		// The original comments are hidden.
		// Let's check that the expand note appears.

		// === EXPAND ===
		// The expand note contains a button clearly.
		const expandButton = expandNote.getByRole('button')
		await expect(expandButton).toBeVisible()

		await expandButton.click()

		// Verify that the thread is expanded.
		// The expand note should be gone.
		await expect(expandNote).toBeHidden()
	})
})
