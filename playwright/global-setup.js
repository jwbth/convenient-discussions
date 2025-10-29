// @ts-check
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Global setup for browser tests
 * Builds Convenient Discussions script before running tests
 */
async function globalSetup() {
  console.log('Building Convenient Discussions for browser tests...');

  try {
    // Build the script
    execSync('npm run build', {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    // Verify the built file exists
    const distPath = path.join(process.cwd(), 'dist', 'convenientDiscussions.js');
    if (!fs.existsSync(distPath)) {
      throw new Error('Built script not found at: ' + distPath);
    }

    console.log('✅ Convenient Discussions built successfully');

  } catch (error) {
    console.error('❌ Failed to build Convenient Discussions:', error.message);
    throw error;
  }
}

module.exports = globalSetup;