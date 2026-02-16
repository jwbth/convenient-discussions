/*
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

/** @type {import('jest').Config} */
export default {
	testEnvironment: 'jsdom',
	testMatch: ['**/tests/*.test.js'],
	setupFiles: ['<rootDir>/tests/setup.js'],
	moduleNameMapper: {
		'\\.(css|less)(\\?inline)?$': '<rootDir>/tests/styleMock.js',
		'/worker-gate$': '<rootDir>/tests/workerMock.js',
	},
}
