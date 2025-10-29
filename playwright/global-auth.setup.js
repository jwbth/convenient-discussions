// @ts-check
const { test: setup } = require('@playwright/test');
const { setupAuth } = require('./auth-core');
const { hasAuthState } = require('./auth-helper');

/**
 * Global authentication setup for test.wikipedia.org
 * This runs once before all tests to establish authentication
 */

setup('authenticate on test.wikipedia.org', async () => {
  // Skip if already authenticated
  if (hasAuthState()) {
    console.log('✅ Authentication state already exists, skipping setup');
    return;
  }

  // Get credentials from environment variables
  const username = process.env.WIKIPEDIA_USERNAME;
  const password = process.env.WIKIPEDIA_PASSWORD;

  if (!username || !password) {
    console.log('⚠️  No Wikipedia credentials provided. Tests will run as anonymous user.');
    console.log('   Set WIKIPEDIA_USERNAME and WIKIPEDIA_PASSWORD environment variables to enable authentication.');
    return;
  }

  // Perform authentication
  await setupAuth(username, password);
});