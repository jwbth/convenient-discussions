import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		globals: true,
		environment: 'jsdom',
		setupFiles: ['./tests/setup.js'],
		include: ['tests/**/*.test.js'],

		// The worker tests' first import transforms the whole worker module graph, which under the
		// full suite's load can exceed the defaults (10 s for hooks, 5 s for tests).
		hookTimeout: 30_000,
		testTimeout: 30_000,
	},
	// define: {
	// 	IS_DEV: true,
	// 	IS_STAGING: false,
	// 	IS_SINGLE: false,
	// 	SINGLE_CONFIG_FILE_NAME: 'undefined',
	// 	SINGLE_LANG_CODE: 'undefined',
	// 	CACHE_BUSTER: JSON.stringify('test-cache-buster'),
	// },
})
