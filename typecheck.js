import { spawn } from 'node:child_process'
import path from 'node:path'

import ts from 'typescript'

/**
 * @typedef {Object} Project
 * @property {string} config Path to jsconfig.json relative to cwd.
 * @property {(filePath: string) => boolean} shouldKeep Returns true if an error from this path
 *   should be reported.
 */

const configPaths = [
	'jsconfig.json',
	'src/jsconfig.json',
	'src/worker/jsconfig.json',
	'src/shared/jsconfig.json',
	// 'tests/jsconfig.json',
	// 'e2e/jsconfig.json',
]

/**
 * Resolve a jsconfig's `include`/`exclude` (and its `extends` chain) to the set of files TypeScript
 * actually checks, using TypeScript's own parser so the semantics match `tsc` exactly. Paths are
 * normalized to forward slashes relative to cwd, matching the form used when filtering error lines.
 *
 * @param {string} configPath
 * @returns {Set<string>}
 */
function getOwnedFiles(configPath) {
	const absConfigPath = path.resolve(configPath)
	const { config, error } = ts.readConfigFile(absConfigPath, ts.sys.readFile)
	if (error) {
		throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'))
	}

	const { fileNames } = ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(absConfigPath))

	return new Set(
		fileNames.map((fileName) => path.relative(process.cwd(), fileName).replaceAll('\\', '/')),
	)
}

const ownedFilesByConfig = new Map(configPaths.map((config) => [config, getOwnedFiles(config)]))

/**
 * How specifically a config's directory contains a file: the depth of the config's directory when it
 * is an ancestor of the file, or -1 when it isn't (e.g. `src/worker/jsconfig.json` pulls in
 * `src/shared/*` via `../shared/**`, but its directory doesn't contain those files). A config that
 * contains the file is thus always preferred over one that merely references it from elsewhere.
 *
 * @param {string} config
 * @param {string} filePath
 * @returns {number}
 */
function getContainmentDepth(config, filePath) {
	const dir = path.dirname(config)
	if (dir === '.') {
		return 0
	}

	return filePath === dir || filePath.startsWith(dir + '/') ? dir.split('/').length : -1
}

/**
 * The configs sharing a file (e.g. `src/jsconfig.json` and `src/shared/jsconfig.json` both include
 * `src/shared/*`) all check it, so an error in it would otherwise be reported under each. The config
 * whose directory most specifically contains the file is the most specific one, so it owns the file
 * and reports it once.
 *
 * @param {string} filePath
 * @returns {string | undefined}
 */
function getOwnerConfig(filePath) {
	return configPaths
		.filter((config) => ownedFilesByConfig.get(config)?.has(filePath))
		.sort(
			(config1, config2) =>
				getContainmentDepth(config2, filePath) - getContainmentDepth(config1, filePath),
		)[0]
}

/** @type {Project[]} */
const projects = configPaths.map((config) => ({
	config,
	shouldKeep: (filePath) => getOwnerConfig(filePath) === config,
}))

/**
 * @param {Project} project
 * @returns {Promise<string[]>}
 */
function checkProject(project) {
	return new Promise((resolve, reject) => {
		const tscProcess = spawn('node', [
			'node_modules/typescript/bin/tsc',
			'-p',
			project.config,
			'--pretty',
			'false',
		])

		let stdout = ''
		let stderr = ''

		tscProcess.stdout.on('data', (data) => {
			stdout += String(data)
		})

		tscProcess.stderr.on('data', (data) => {
			stderr += String(data)
		})

		tscProcess.on('close', (_code) => {
			if (stderr) {
				reject(new Error(stderr))

				return
			}

			const lines = stdout.split(/\r?\n/)
			const filteredLines = []
			let isFiltering = false

			for (const line of lines) {
				if (!line.trim()) {
					continue
				}

				const fileErrorMatch = line.match(/^([^(]+)\(\d+,\d+\): error TS\d+:/)
				const globalErrorMatch = line.match(/^error TS\d+:/)

				if (fileErrorMatch) {
					const filePath = fileErrorMatch[1].replace(/\\/g, '/')
					const keep = !filePath.includes('node_modules/') && project.shouldKeep(filePath)
					isFiltering = !keep
					if (keep) {
						filteredLines.push(line)
					}
				} else if (globalErrorMatch) {
					isFiltering = false
					filteredLines.push(line)
				} else if (!isFiltering) {
					filteredLines.push(line)
				}
			}

			resolve(filteredLines)
		})
	})
}

const args = process.argv.slice(2)
let projectsToRun = projects

/* eslint-disable unicorn/no-process-exit */
if (args.length > 0) {
	const arg = args[0].toLowerCase()
	projectsToRun = projects.filter((p) => p.config.toLowerCase().includes(arg))
	if (projectsToRun.length === 0) {
		console.error(`Unknown project: ${args[0]}`)
		process.exit(1)
	}
}

let hasErrors = false
for (const project of projectsToRun) {
	console.log(`Running type check for ${project.config}...`)
	try {
		const errors = await checkProject(project)
		if (errors.length > 0) {
			console.error(`\n❌ Errors found in ${project.config}:`)
			console.error(errors.join('\n'))
			hasErrors = true
		} else {
			console.log(`✅ Passed successfully for ${project.config}.`)
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		console.error(`\n❌ Failed running type check for ${project.config}:`, errorMessage)
		hasErrors = true
	}

	if (projectsToRun.indexOf(project) < projectsToRun.length - 1) {
		console.log('\n----')
	}
}

if (hasErrors) {
	process.exit(1)
} else {
	console.log('\nAll type checks passed successfully!')
	process.exit(0)
}
/* eslint-enable unicorn/no-process-exit */
