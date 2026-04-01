# Playwright Browser Tests

This directory contains Playwright end-to-end tests for Convenient Discussions, covering UI interactions, visual layers, hover behaviors, and other features that require a real browser environment.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Install Playwright browsers:

   ```bash
   npx playwright install
   ```

## Running Tests

```bash
# All tests
npx playwright test

# Specific file
npx playwright test e2e/comment-layers.spec.js

# Debug mode (Playwright Inspector)
npx playwright test --debug

# Headed mode
npx playwright test --headed
```

## How It Works

Tests run against live Wikipedia pages with the Convenient Discussions script injected from the local dev server (`http://localhost:9000`). Make sure the dev server is running before executing tests.

Each test calls `setupConvenientDiscussions(page)` from `helpers/test-utils.js`, which:

1. Navigates to a Wikipedia talk page
2. Waits for MediaWiki globals to be available
3. Injects the script from the dev server
4. Waits for CD to initialize

```javascript
import { setupConvenientDiscussions, TEST_PAGES } from './helpers/test-utils.js'

test.beforeEach(async ({ page }) => {
  // Uses the default test page
  await setupConvenientDiscussions(page)

  // Or specify a different page
  await setupConvenientDiscussions(page, TEST_PAGES.CD_TEST_CASES)

  // Or pass settings to apply before injection
  await setupConvenientDiscussions(page, {
    settings: { commentDisplay: 'compact' },
  })
})
```

## Authentication

Most tests work without login. For features that require authentication (editing, thanking, etc.), see `AUTH_SETUP_GUIDE.md`.

Set credentials via environment variables — never hardcode them:

```bash
export WIKIPEDIA_USERNAME=YourTestUsername
export WIKIPEDIA_PASSWORD=YourTestPassword
```

## Helpers

`helpers/test-utils.js` exports utilities for common operations:

- `setupConvenientDiscussions(page, urlOrOptions)` — main setup function
- `TEST_PAGES` — map of commonly used test page URLs
- `getCommentByIndex(page, index)` — get a comment locator by index
- `toggleCommentDisplay(page, display)` — switch between `'spacious'` and `'compact'`
- `openSectionMoreMenu(page, headline)` — open the "More options" menu for a section
- `getSectionButtonContainer(page, headline)` — get the button container for a section

## Debugging

### Screenshots and Traces

Playwright captures screenshots on failure. To enable video or trace recording, update `playwright.config.js`.

### Common Issues

- **Elements not found**: Use `page.pause()` or `--headed` to inspect the page state.
- **Flaky tests**: Add `waitFor` calls or increase timeouts for slow operations.
