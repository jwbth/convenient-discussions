/**
 * Script to analyze circular dependencies in the project
 */

const fs = require('node:fs')
const path = require('node:path')

const srcDir = path.join(__dirname, 'src')
const visited = new Set()
const stack = []
const cycles = []

/**
 * Extract import statements from a file
 *
 * @param {string} filePath
 * @returns {string[]} Array of imported file paths
 */
function extractImports(filePath) {
	const content = fs.readFileSync(filePath, 'utf8')
	const imports = []

	// Match: import ... from './...' or import ... from "../..."
	const importRegex = /import\s+(?:[\w{},\s*]+\s+from\s+)?['"]([^'"]+)['"]/g

	let match
	while ((match = importRegex.exec(content)) !== null) {
		const importPath = match[1]

		// Only process relative imports (starting with ./ or ../)
		if (importPath.startsWith('.')) {
			const dir = path.dirname(filePath)
			let resolvedPath = path.resolve(dir, importPath)

			// Add .js extension if not present
			if (!resolvedPath.endsWith('.js')) {
				resolvedPath += '.js'
			}

			// Check if file exists
			if (fs.existsSync(resolvedPath)) {
				imports.push(resolvedPath)
			}
		}
	}

	return imports
}

/**
 * Recursively analyze dependencies
 *
 * @param {string} filePath
 */
function analyzeDependencies(filePath) {
	const normalizedPath = path.normalize(filePath)

	// Check if we're revisiting a file in the current stack (circular dependency)
	const stackIndex = stack.indexOf(normalizedPath)
	if (stackIndex !== -1) {
		// Found a cycle!
		const cycle = [...stack.slice(stackIndex), normalizedPath]
		const cycleStr = cycle.map((p) => path.relative(srcDir, p)).join(' → ')

		// Check if we already found this cycle (or its reverse)
		const isDuplicate = cycles.some(
			(existingCycle) =>
				existingCycle === cycleStr || existingCycle.split(' → ').reverse().join(' → ') === cycleStr,
		)

		if (!isDuplicate) {
			cycles.push(cycleStr)
		}

		return
	}

	// Skip if already fully visited
	if (visited.has(normalizedPath)) {
		return
	}

	// Add to stack
	stack.push(normalizedPath)

	// Get imports
	const imports = extractImports(normalizedPath)

	// Recursively analyze each import
	for (const importPath of imports) {
		analyzeDependencies(importPath)
	}

	// Remove from stack and mark as visited
	stack.pop()
	visited.add(normalizedPath)
}

// Start analysis from app.js
const appPath = path.join(srcDir, 'app.js')

console.log('Analyzing circular dependencies starting from app.js...\n')

analyzeDependencies(appPath)

if (cycles.length > 0) {
	console.log(`Found ${cycles.length} circular dependencies:\n`)
	cycles.forEach((cycle, index) => {
		console.log(`${index + 1}. ${cycle}`)
	})
} else {
	console.log('No circular dependencies found!')
}
