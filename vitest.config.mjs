import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
	test: {
		globals: true,
		environment: 'jsdom',
		setupFiles: ['./tests/setup.js'],
		include: ['tests/**/*.test.js'],
		alias: [
			{
				find: /.*\.(css|less)(\?inline)?$/,
				replacement: path.resolve(__dirname, 'tests/styleMock.js'),
			},
			{
				find: /.*worker-gate.*/,
				replacement: path.resolve(__dirname, 'tests/workerMock.js'),
			},
		],
	},
	define: {
		IS_DEV: true,
		IS_STAGING: false,
		IS_SINGLE: false,
		SINGLE_CONFIG_FILE_NAME: 'undefined',
		SINGLE_LANG_CODE: 'undefined',
		CACHE_BUSTER: JSON.stringify('test-cache-buster'),
	},
})
