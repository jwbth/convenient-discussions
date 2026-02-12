/*
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

/** @type {import('jest').Config} */
export default {
	testEnvironment: 'jsdom',
	testMatch: ['**/tests/*.test.js', '**/tests/*.test.cjs'],
	// moduleNameMapper: {
	// 	'\\.(css|less)$': '<rootDir>/tests/styleMock.js',
	// 	'^.*\\?worker&inline-string$': '<rootDir>/tests/workerMock.js',
	// },
}
