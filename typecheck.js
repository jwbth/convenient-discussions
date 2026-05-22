import { spawn } from 'node:child_process'

/**
 * @typedef {Object} Project
 * @property {string} config Path to jsconfig.json relative to cwd.
 * @property {(filePath: string) => boolean} [shouldKeep] Returns true if an error from this path
 *   should be reported.
 */

/** @type {Project[]} */
const projects = [
	{
		config: 'jsconfig.json',

		// include: ["*", "misc/**/*"], exclude: ["misc/convenientDiscussions-generateBasicConfig.js"]
		shouldKeep: (filePath) =>
			!filePath.includes('/') ||
			(filePath.startsWith('misc/') &&
				filePath !== 'misc/convenientDiscussions-generateBasicConfig.js'),
	},
	{
		config: 'src/jsconfig.json',
		shouldKeep: (filePath) => !filePath.startsWith('src/worker/'),
	},
	{
		config: 'src/worker/jsconfig.json',
		shouldKeep: (filePath) => filePath.startsWith('src/worker/'),
	},
	{
		config: 'src/shared/jsconfig.json',
		shouldKeep: (filePath) => filePath.startsWith('src/shared/'),
	},
	// {
	// 	config: 'tests/jsconfig.json',
	// 	shouldKeep: (filePath) => filePath.startsWith('tests/'),
	// },
	// {
	// 	config: 'e2e/jsconfig.json',
	// 	shouldKeep: (filePath) => filePath.startsWith('e2e/'),
	// },
]

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
					const keep =
						!filePath.includes('node_modules/') && (project.shouldKeep?.(filePath) ?? true)
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
