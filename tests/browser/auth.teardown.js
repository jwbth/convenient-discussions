// @ts-check
const { test as teardown } = require('@playwright/test');
const { clearAuthState } = require('./auth-helper');

/**
 * Cleanup authentication state after tests complete
 * This is optional - you might want to keep auth state between runs
 */

teardown('cleanup auth state', async () => {
  // Only clear auth state if explicitly requested
  if (process.env.CLEAR_AUTH_STATE === 'true') {
    clearAuthState();
  } else {
    console.log('🔐 Keeping authentication state for future test runs');
    console.log('   Set CLEAR_AUTH_STATE=true to clear auth state after tests');
  }
});