import { spawn } from 'node:child_process'

const projects = [
	{
		config: 'src/jsconfig.json',
		keepOnly: null,
		ignore: ['src/worker/', 'node_modules/'],
	},
	{
		config: 'src/worker/jsconfig.json',
		keepOnly: ['src/worker/'],
		ignore: ['node_modules/'],
	},
	{
		config: 'src/shared/jsconfig.json',
		keepOnly: ['src/shared/'],
		ignore: ['node_modules/'],
	},
]

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
					let keep = true
					if (project.keepOnly) {
						keep = project.keepOnly.some((pattern) => filePath.includes(pattern))
					}
					if (keep && project.ignore?.some((pattern) => filePath.includes(pattern))) {
						keep = false
					}

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
		console.error(
			`Unknown project: ${args[0]}. Valid options are 'worker', 'shared', or 'jsconfig'.`,
		)
		process.exit(1)
	}
}

let hasErrors = false
for (const project of projectsToRun) {
	console.log(`Running type check for ${project.config}...`)
	try {
		const errors = await checkProject(project)
		if (errors.length > 0) {
			console.error(`\nErrors found in ${project.config}:`)
			console.error(errors.join('\n'))
			hasErrors = true
		} else {
			console.log(`Passed successfully for ${project.config}.`)
		}
	} catch (error) {
		console.error(`\nFailed running type check for ${project.config}:`, error.message)
		hasErrors = true
	}
}

if (hasErrors) {
	process.exit(1)
} else {
	console.log('\nAll type checks passed successfully!')
	process.exit(0)
}
/* eslint-enable unicorn/no-process-exit */
