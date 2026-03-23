# Authentication Setup Guide for test.wikipedia.org

This guide explains how to set up and use authentication for Playwright tests on test.wikipedia.org following Playwright's recommended authentication patterns.

## Quick Start

### 1. Set Environment Variables

**IMPORTANT**: Never put credentials in files that might be committed to git. Use environment variables only:

```bash
# Windows (Command Prompt)
set WIKIPEDIA_USERNAME=YourTestUsername
set WIKIPEDIA_PASSWORD=YourTestPassword

# Windows (PowerShell)
$env:WIKIPEDIA_USERNAME="YourTestUsername"
$env:WIKIPEDIA_PASSWORD="YourTestPassword"

# Linux/Mac
export WIKIPEDIA_USERNAME=YourTestUsername
export WIKIPEDIA_PASSWORD=YourTestPassword
```

**Security Note**: The `.env` file and `playwright/.auth/` directory are both in `.gitignore` to prevent accidental credential exposure.

### 2. Run Tests

```bash
# Run all tests (authentication will be set up automatically)
npx playwright test

# Run specific test to verify auth
npx playwright test e2e/test-wikipedia-auth.spec.js
```

## How It Works

### Authentication Flow

1. **Setup Phase**: Before any tests run, `auth.setup.js` checks for credentials
2. **Login Process**: If credentials are provided, it logs into test.wikipedia.org
3. **State Saving**: Authentication cookies and session data are saved to `.auth/user.json`
4. **Test Execution**: All tests automatically use the saved authentication state
5. **Reuse**: Authentication state persists between test runs until manually cleared

### File Structure

```
playwright/
└── .auth/
    └── user.json             # Generated auth state (gitignored)

e2e/
├── auth.setup.js             # Playwright auth setup (follows official pattern)
├── test-wikipedia-auth.spec.js # Example authenticated test
└── helpers/
    └── auth-state.js         # Helper functions for auth management
```

## Configuration

### Playwright Config

The `playwright.config.js` is configured to:

- Use `https://test.wikipedia.org` as base URL
- Automatically load authentication state if available
- Run setup project before main tests
- Support all major browsers with authentication

### Environment Variables

| Variable             | Required | Description                             |
| -------------------- | -------- | --------------------------------------- |
| `WIKIPEDIA_USERNAME` | No       | Your test.wikipedia.org username        |
| `WIKIPEDIA_PASSWORD` | No       | Your test.wikipedia.org password        |
| `CLEAR_AUTH_STATE`   | No       | Set to `true` to clear auth after tests |

## Usage in Tests

### Basic Usage

```javascript
const { test, expect } = require('@playwright/test')
const { setupAuthenticatedContext } = require('./helpers/auth-state')

test.describe('My Tests', () => {
  test.beforeEach(async ({ context }) => {
    await setupAuthenticatedContext(context)
  })

  test('my test', async ({ page }) => {
    await page.goto('/wiki/Talk:Main_Page')
    // Test runs with authentication if available
  })
})
```

### Checking Authentication Status

```javascript
test('check if logged in', async ({ page }) => {
  await page.goto('/wiki/Main_Page')

  const userMenu = page.locator('#pt-userpage, #pt-userpage-2')
  const anonMenu = page.locator('#pt-anonuserpage')

  if ((await userMenu.count()) > 0) {
    console.log('Running as authenticated user')
  } else {
    console.log('Running as anonymous user')
  }
})
```

## Anonymous vs Authenticated Testing

### Anonymous Mode (Default)

- No credentials needed
- Tests basic functionality that works for all users
- Cannot test features requiring login (editing, preferences, etc.)

### Authenticated Mode

- Requires test.wikipedia.org account
- Can test all user features
- Recommended for comprehensive testing

## Security Best Practices

### Credentials Management

- **Never commit credentials to git**
- Use environment variables or secure credential storage
- Consider using test-specific accounts
- Rotate passwords regularly

### Test Account Setup

1. Create a dedicated account on test.wikipedia.org
2. Use a strong, unique password
3. Don't use your personal Wikipedia account
4. Consider the account disposable

## Troubleshooting

### Common Issues

#### Authentication Fails

```
❌ Authentication setup failed: Login failed - user menu not found
```

**Solutions:**

- Verify credentials are correct
- Check if account exists on test.wikipedia.org (not en.wikipedia.org)
- Ensure account is not blocked or restricted

#### No Auth State Found

```
⚠️ No authentication state found. Run auth setup first
```

**Solutions:**

- Set environment variables correctly
- Run tests once to generate auth state
- Check if `auth-state.json` was created

#### Tests Run as Anonymous

```
ℹ️ Running as anonymous user
```

**This is normal if:**

- No credentials provided (tests still work)
- Credentials are invalid
- Auth state expired

### Debug Authentication

```bash
# Run auth test specifically
npx playwright test test-wikipedia-auth --headed

# Clear auth state and retry
rm -rf playwright/.auth
npx playwright test

# Run only the auth setup
npx playwright test --project=setup
```

### Manual Auth State Management

```javascript
const { clearAuthState, hasAuthState } = require('./helpers/auth-state')

// Check if authenticated
if (hasAuthState()) {
  console.log('Auth state exists')
}

// Clear auth state
clearAuthState()
```

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Run Playwright tests
  env:
    WIKIPEDIA_USERNAME: ${{ secrets.WIKIPEDIA_USERNAME }}
    WIKIPEDIA_PASSWORD: ${{ secrets.WIKIPEDIA_PASSWORD }}
  run: npx playwright test
```

### Local Development

```bash
# Set credentials for session
export WIKIPEDIA_USERNAME=TestUser
export WIKIPEDIA_PASSWORD=TestPass

# Run tests
npm run test:browser
```

## Advanced Usage

### Custom Authentication Logic

```javascript
// Custom auth setup for specific tests
test('admin features', async ({ page }) => {
  // Override default auth for admin testing
  await page.context().addCookies([
    // Admin-specific cookies
  ])

  await page.goto('/wiki/Special:AdminPage')
})
```

### Multiple User Testing

```javascript
// Test with different user roles
const users = {
  admin: { username: 'AdminUser', password: 'AdminPass' },
  regular: { username: 'RegularUser', password: 'RegularPass' },
}

test.describe('Multi-user tests', () => {
  for (const [role, credentials] of Object.entries(users)) {
    test(`test as ${role}`, async ({ browser }) => {
      const context = await browser.newContext()
      // Setup specific user auth...
    })
  }
})
```
