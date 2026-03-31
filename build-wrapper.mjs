#!/usr/bin/env node
/// <reference types="vite/client" />

import { execSync } from 'node:child_process'

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

const argv = yargs(hideBin(process.argv))
	.help(false)
	.version(false)
	.parserConfiguration({
		'camel-case-expansion': false,
	})
	.parseSync()

const isStaging =
	argv.mode === 'staging' || argv.staging || process.env.VITE_STAGING === '1'
const isSingle =
	argv.mode === 'single' || argv.single || process.env.VITE_SINGLE === '1'

const mode = isSingle
	? 'single'
	: isStaging
		? 'staging'
		: String(argv.mode || '')
const commandParts = ['vite build']

if (mode) {
	commandParts.push(`--mode ${mode}`)
}

const wrapperFlags = new Set(['mode', 'staging', 'single'])
const extraArgs = []
const envVars = []

for (const [key, value] of Object.entries(argv)) {
	if (key === '_' || key === '$0') continue

	if (isSingle) {
		const envKey = key.startsWith('VITE_') ? key : `VITE_${key.toUpperCase()}`
		envVars.push(`${envKey}="${String(value)}"`)
	} else if (!wrapperFlags.has(key)) {
		if (value === true) {
			extraArgs.push(`--${key}`)
		} else if (value === false) {
			extraArgs.push(`--no-${key}`)
		} else {
			extraArgs.push(`--${key}=${String(value)}`)
		}
	}
}

if (isSingle) {
	if (envVars.length > 0) {
		commandParts.unshift('cross-env', ...envVars)
	}

	const command = [...commandParts, ...extraArgs].filter(Boolean).join(' ')

	try {
		execSync(command, { stdio: 'inherit' })
	} catch (error) {
		// @ts-ignore
		process.exitCode = error.status ?? 1
	}
} else {
	const loaderCommandParts = [
		'cross-env',
		'VITE_BUILD_PART="loader"',
		...envVars,
		...commandParts,
	]
	const loaderCommand = [...loaderCommandParts, ...extraArgs]
		.filter(Boolean)
		.join(' ')

	const stylesCommandParts = [
		'cross-env',
		'VITE_BUILD_PART="styles"',
		...envVars,
		...commandParts,
	]
	const stylesCommand = [...stylesCommandParts, ...extraArgs]
		.filter(Boolean)
		.join(' ')

	const mainCommandParts = [
		'cross-env',
		'VITE_BUILD_PART="main"',
		...envVars,
		...commandParts,
	]
	const mainCommand = [...mainCommandParts, ...extraArgs]
		.filter(Boolean)
		.join(' ')

	try {
		execSync(loaderCommand, { stdio: 'inherit' })
		execSync(stylesCommand, { stdio: 'inherit' })
		execSync(mainCommand, { stdio: 'inherit' })
	} catch (error) {
		// @ts-ignore
		process.exitCode = error.status ?? 1
	}
}
