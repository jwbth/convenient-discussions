/*
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

/** @type {import('jest').Config} */
export default {
	testEnvironment: 'jsdom',
	testMatch: ['**/tests/*.test.js'],
	moduleNameMapper: {
		'\\.(css|less)(\\?inline)?$': '<rootDir>/tests/styleMock.js',
		'^\\./(.*)/worker-gate\\?worker&inline-string$': '<rootDir>/tests/workerMock.js',
	},
}
