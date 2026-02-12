// @ts-check
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Helper functions for authentication in Playwright tests
 */

export const AUTH_STATE_PATH = path.join(__dirname, '..', '..', 'playwright', '.auth', 'user.json')

/**
 * Check if authentication state exists
 *
 * @returns {boolean}
 */
export function hasAuthState() {
	return fs.existsSync(AUTH_STATE_PATH)
}

/**
 * Get authentication state for use in test context
 *
 * @returns {string | undefined} Path to auth state file if it exists
 */
export function getAuthStatePath() {
	return hasAuthState() ? AUTH_STATE_PATH : undefined
}

/**
 * Setup authenticated context for a test
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @returns {Promise<void>}
 */
export async function setupAuthenticatedContext(context) {
	if (!hasAuthState()) {
		console.warn(
			'⚠️  No authentication state found. Run auth setup first or tests will run as anonymous user.',
		)

		return
	}

	// The context should already be created with storageState, but we can verify
	const cookies = await context.cookies('https://test.wikipedia.org')
	const hasSessionCookie = cookies.some(
		(cookie) => cookie.name.includes('session') || cookie.name.includes('UserID'),
	)

	if (hasSessionCookie) {
		console.log('✅ Using authenticated session for test.wikipedia.org')
	} else {
		console.warn('⚠️  Authentication state loaded but no session cookies found')
	}
}

/**
 * Clean up authentication state (for testing or reset)
 *
 * @returns {void}
 */
export function clearAuthState() {
	if (fs.existsSync(AUTH_STATE_PATH)) {
		fs.unlinkSync(AUTH_STATE_PATH)
		console.log('🗑️  Authentication state cleared')
	}
}
