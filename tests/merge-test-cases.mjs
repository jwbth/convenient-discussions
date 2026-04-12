import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read the input files
const testCasesPath = join(__dirname, 'worker-test-cases.json')
const expectedPath = join(__dirname, 'worker-test-cases-expected.json')

const testCases = JSON.parse(readFileSync(testCasesPath, 'utf-8'))
const expected = JSON.parse(readFileSync(expectedPath, 'utf-8'))

// Create a map of expected data by group name and test id
const expectedMap = new Map()

for (const [groupName, sections] of expected) {
	const sectionMap = new Map()
	for (const section of sections) {
		sectionMap.set(section.id, section)
	}
	expectedMap.set(groupName, sectionMap)
}

// Merge the data
const merged = testCases.map((group) => {
	const groupName = group.name
	const expectedSections = expectedMap.get(groupName)

	if (!expectedSections) {
		console.warn(`Warning: No expected data found for group "${groupName}"`)
		return group
	}

	const mergedTests = group.tests.map((test) => {
		const expectedData = expectedSections.get(test.id)

		if (!expectedData) {
			console.warn(
				`Warning: No expected data found for test "${test.id}" in group "${groupName}"`,
			)
			return test
		}

		// Merge the test case with expected data
		return {
			...test,
			...expectedData,
		}
	})

	return {
		...group,
		tests: mergedTests,
	}
})

// Write the merged output
const outputPath = join(__dirname, 'worker-test-cases-merged.json')
writeFileSync(outputPath, JSON.stringify(merged, null, '\t'))

console.log(`✓ Merged test cases written to ${outputPath}`)
console.log(`  Total groups: ${merged.length}`)
console.log(
	`  Total tests: ${merged.reduce((sum, group) => sum + group.tests.length, 0)}`,
)
