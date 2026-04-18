import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		globals: true,
		environment: 'jsdom',
		setupFiles: ['./tests/setup.js'],
		include: ['tests/**/*.test.js'],
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
