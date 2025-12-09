#!/usr/bin/env node
/// <reference types="vite/client" />

import { execSync } from 'node:child_process'

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

const args = /** @type {YargsNonAwaited} */ (yargs(hideBin(process.argv)).argv)

let command = 'vite build'

if (
	args.mode === 'development' ||
	args.mode === 'dev' ||
	args.dev ||
	process.env.VITE_DEV === '1' ||
	process.env.NODE_ENV === 'development'
) {
	command += ' --mode development'
}

if (
	args.mode === 'staging' ||
	args.staging ||
	process.env.VITE_STAGING === '1'
) {
	command += ' --mode staging'
}

/**
 * Constructs the cross-platform command string using cross-env syntax.
 *
 * @param {Object} customEnv A key-value object of custom arguments.
 *   e.g., { ENV: 'staging', API_URL: 'https://api.com' }
 * @param {string} baseCommand The command to run after setting env vars (e.g., 'vite build').
 * @returns {string} The final command string ready for execution.
 */
function constructCrossEnvCommand(customEnv, baseCommand) {
	let crossEnvPrefix = ''

	// 1. Iterate over the parsed arguments to build the cross-env prefix
	for (const [key, value] of Object.entries(customEnv)) {
		// It's good practice to prefix with VITE_ if these are meant for client-side access
		const envKey = key.startsWith('VITE_') ? key : `VITE_${key.toUpperCase()}`

		// Add the cross-env call for each variable, ensuring value is quoted for safety
		crossEnvPrefix += `cross-env ${envKey}="${value}" `
	}

	// 2. Combine the prefix with the base command
	const finalCommand = `${crossEnvPrefix}${baseCommand}`

	return finalCommand.trim() // Trim trailing space
}

if (args.mode === 'single' || args.single || process.env.VITE_SINGLE === '1') {
	// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
	command = constructCrossEnvCommand(args, command) + ' --mode single'
}

try {
	execSync(command, { stdio: 'inherit' })
} catch (error) {
	// @ts-ignore
	process.exitCode = error.status ?? 1
}
