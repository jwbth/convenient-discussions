# Playwright Browser Testing

This directory contains Playwright browser tests for Convenient Discussions, specifically testing visual layers, hover behaviors, and UI interactions that require a real browser environment.

## Setup

### Prerequisites

1. Install dependencies:
   ```bash
   npm install
   ```

2. Install Playwright browsers:
   ```bash
   npx playwright install
   ```

### Running Tests

#### All Browser Tests
```bash
npm run test:browser
```

#### Specific Test File
```bash
npx playwright test comment-layers.spec.js
```

#### Debug Mode
```bash
npx playwright test --debug
```

#### Headed Mode (See Browser)
```bash
npx playwright test --headed
```

## Test Structure

### Test Files

- **comment-layers.spec.js** - Tests visual layers, positioning, and hover behaviors
- **comment-actions.spec.js** - Tests action buttons and menu interactions
- **comment-visual.spec.js** - Tests visual appearance and consistency

### Test Utilities

- **helpers/test-utils.js** - Common utilities for browser testing

## Test Requirements

These tests validate the requirements from the Comment class refactoring spec:

### Requirement 1: Class Hierarchy Restructuring
- Tests that SpaciousComment and CompactComment are created correctly
- Validates polymorphic behavior in browser environment

### Requirement 2: Layers Composition Pattern
- Tests layer creation, positioning, and destruction
- Validates hover behaviors for CompactComment overlay menus
- Tests layer style updates and responsiveness

### Requirement 6: Backward Compatibility
- Visual regression testing to ensure comments look identical
- Interaction testing to ensure all behaviors work as expected

### Requirement 8: Testing Coverage
- Browser-specific testing for UI functionality
- Visual validation that unit tests cannot provide

## Test Environment

The tests run against live Wikipedia pages with your Convenient Discussions script injected:

1. **Script Building**: Automatically builds your script before tests run
2. **Script Injection**: Injects `dist/convenientDiscussions.js` into Wikipedia pages
3. **Test Pages**: Uses live Wikipedia talk pages (e.g., Talk:Main_Page)
4. **Browser Support**: Tests run on Chromium, Firefox, and WebKit

### How It Works

1. **Global Setup**: Runs `npm run build` to create `dist/convenientDiscussions.js`
2. **Test Setup**: Each test calls `setupConvenientDiscussions(page)` which:
   - Navigates to a Wikipedia talk page
   - Waits for page and MediaWiki to load completely
   - Injects your built script using `page.addScriptTag()`
   - Waits for Convenient Discussions to initialize
   - Provides console logging for each step

### Centralized Setup

All test preparation is handled by a single function in `helpers/test-utils.js`:

```javascript
const { setupConvenientDiscussions, TEST_PAGES } = require('./helpers/test-utils');

test.beforeEach(async ({ page }) => {
  // Uses default test page (Talk:Main_Page)
  await setupConvenientDiscussions(page);

  // Or specify a different test page
  await setupConvenientDiscussions(page, TEST_PAGES.CD_TEST_CASES);
});

## Configuration

### Test Pages

The tests are configured to use live Wikipedia talk pages:
- **Default**: `https://en.wikipedia.org/wiki/Talk:Main_Page`
- **Alternative**: Any Wikipedia talk page with comments

### Authentication

For testing features that require login:
- See `AUTH_SETUP_GUIDE.md` for complete authentication setup
- See `auth-example.spec.js` for cookie-based authentication examples
- Most Comment functionality works without login
- Login is only needed for actions like editing, thanking, etc.

## Debugging

### VS Code Integration

Use the "Debug Playwright Tests" launch configuration in VS Code to debug tests with breakpoints.

### Playwright Inspector

Run with `--debug` flag to use Playwright's built-in inspector:
```bash
npx playwright test --debug comment-layers.spec.js
```

### Screenshots and Videos

Playwright automatically captures screenshots on failure. Enable video recording in `playwright.config.js` if needed.

## CI/CD Integration

The tests are configured to:
- Run in headless mode on CI
- Retry failed tests automatically
- Generate HTML reports
- Capture traces for debugging failures

## Troubleshooting

### Common Issues

1. **Tests timeout waiting for CD to load**
   - Check that the development server is running
   - Verify the test page has Convenient Discussions enabled
   - Check browser console for JavaScript errors

2. **Elements not found**
   - Verify CSS selectors match your implementation
   - Check that comments are actually rendered on the test page
   - Use `page.pause()` to inspect the page state

3. **Flaky tests**
   - Add appropriate `waitFor` calls
   - Use `page.waitForLoadState('networkidle')` if needed
   - Increase timeouts for slow operations

### Getting Help

- Check Playwright documentation: https://playwright.dev/
- Review test output and screenshots in `test-results/`
- Use browser dev tools during `--headed` runs