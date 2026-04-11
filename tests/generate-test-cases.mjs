#!/usr/bin/env node

/**
 * Script to fetch test cases from the CD test page and convert them to JSON format.
 * Level 2 sections (h2) are test groups, and bottom-level nested sections are test cases.
 */

function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms)
	})
}

const TEST_PAGE = 'User_talk:Jack_who_built_the_house/CD_test_cases'
const API_URL = 'https://commons.wikimedia.org/w/api.php'

/**
 * Make a MediaWiki API request.
 *
 * @param {object} params API parameters
 * @returns {Promise<any>}
 */
async function apiRequest(params) {
	const url = new URL(API_URL)
	url.search = new URLSearchParams({
		format: 'json',
		origin: '*',
		formatversion: '2',
		...params,
	}).toString()

	const response = await fetch(url)
	if (!response.ok) {
		throw new Error(`API request failed: ${response.statusText}`)
	}

	return response.json()
}

/**
 * Convert wikitext to HTML using MediaWiki API.
 *
 * @param {string} wikitext Wikitext to convert
 * @returns {Promise<string>}
 */
async function parseCode(wikitext) {
	const data = await apiRequest({
		action: 'parse',
		text: wikitext,
		contentmodel: 'wikitext',
		prop: 'text',
		pst: true,
		disabletoc: true,
		disablelimitreport: true,
		disableeditsection: true,
		preview: true,
		formatversion: 2,
	})

	return data.parse.text
}

/**
 * Get the section tree for a page.
 *
 * @param {string} title Page title
 * @returns {Promise<Array>}
 */
async function getSections(title) {
	const data = await apiRequest({
		action: 'parse',
		page: title,
		prop: 'sections',
	})

	return data.parse.sections
}

/**
 * Get wikitext for a specific section.
 *
 * @param {string} title Page title
 * @param {number} section Section index
 * @returns {Promise<string>}
 */
async function getSectionWikitext(title, section) {
	const data = await apiRequest({
		action: 'parse',
		page: title,
		section,
		prop: 'wikitext',
	})

	return data.parse.wikitext
}

/**
 * Check if a section has child sections.
 *
 * @param {Array} sections All sections
 * @param {number} index Current section index
 * @returns {boolean}
 */
function hasChildren(sections, index) {
	const currentSection = sections[index]
	const currentLevel = Number.parseInt(currentSection.toclevel)

	// Check if the next section exists and has a higher level (is a child)
	if (index + 1 < sections.length) {
		const nextLevel = Number.parseInt(sections[index + 1].toclevel)

		return nextLevel > currentLevel
	}

	return false
}

/**
 * Build URL for editing a specific section.
 *
 * @param {string} sectionIndex Section index
 * @returns {string}
 */
function buildSectionUrl(sectionIndex) {
	return `https://commons.wikimedia.org/w/index.php?title=${TEST_PAGE}&action=edit&section=${sectionIndex}`
}

/**
 * Main function to generate test cases.
 *
 * @param {number} [limit] Limit number of test groups to process (for testing)
 * @param {string} [outputFile] Optional output file path
 * @returns {Promise<Array>}
 */
async function generateTestCases(limit, outputFile) {
	console.log(`Fetching sections from ${TEST_PAGE}...`)

	const sections = await getSections(TEST_PAGE)
	console.log(`Found ${sections.length} sections`)

	const testGroups = []
	let currentGroup = null
	let processedGroups = 0

	for (let i = 0; i < sections.length; i++) {
		const section = sections[i]
		const level = Number.parseInt(section.toclevel)

		// Level 1 (h2) sections are test groups
		if (level === 1) {
			if (limit && processedGroups >= limit) {
				break
			}

			// Save previous group if it exists
			if (currentGroup) {
				testGroups.push(currentGroup)
			}

			// Start new test group
			currentGroup = {
				name: section.line,
				url: buildSectionUrl(section.index),
				tests: [],
			}

			console.log(`\nTest group: ${section.line}`)
			processedGroups++
			continue
		}

		// Skip if we haven't started a group yet
		if (!currentGroup) {
			continue
		}

		// Skip sections that have children (they're intermediate groupings, not actual tests)
		if (hasChildren(sections, i)) {
			continue
		}

		// This is a bottom-level section - it's a test case
		console.log(`  Processing test ${section.index}: ${section.line}`)

		try {
			const wikitext = await getSectionWikitext(TEST_PAGE, section.index)

			// Convert wikitext to HTML using parseCode
			const html = await parseCode(wikitext)

			currentGroup.tests.push({
				headline: section.line,
				level: Number.parseInt(section.level),
				url: buildSectionUrl(section.index),
				wikitext: wikitext.trim(),
				html: html.trim(),
			})
		} catch (error) {
			console.error(
				`  Error processing section ${section.index}:`,
				error.message,
			)
		}

		// MediaWiki API is rate-limited, so we need to wait between requests
		await sleep(2000)
	}

	// Don't forget to add the last group
	if (currentGroup) {
		testGroups.push(currentGroup)
	}

	const totalTests = testGroups.reduce(
		(sum, group) => sum + group.tests.length,
		0,
	)
	console.log(
		`\nProcessed ${testGroups.length} test groups with ${totalTests} total tests`,
	)

	if (outputFile) {
		const fs = await import('node:fs/promises')
		await fs.writeFile(outputFile, JSON.stringify(testGroups, null, 2), 'utf-8')
		console.log(`\nSaved to ${outputFile}`)
	}

	return testGroups
}

// Run the script
;(async () => {
	try {
		const args = process.argv.slice(2)
		const limit =
			args[0] && !args[0].endsWith('.json')
				? Number.parseInt(args[0])
				: undefined
		const outputFile = args.find((arg) => arg.endsWith('.json'))

		const testGroups = await generateTestCases(limit, outputFile)

		if (!outputFile) {
			console.log('\n--- Test Groups JSON ---')
			console.log(JSON.stringify(testGroups, null, 2))
		}
	} catch (error) {
		console.error('Error:', error)
		process.exit(1)
	}
})()
