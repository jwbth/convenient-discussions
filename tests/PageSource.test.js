import { beforeAll, describe, expect, test } from 'vitest'

import PageSource from '../src/PageSource'

import { initCommonsGlobals } from './utils-wikiGlobals'

beforeAll(() => {
	initCommonsGlobals()
})

const pageCode = ['Intro.', '', '== First ==', 'Text.', ''].join('\n')
const topicCode = '== New ==\nNew text.\n'

/**
 * @param {string} [code]
 * @param {boolean} [isArchive]
 * @returns {PageSource}
 */
function makeSource(code = pageCode, isArchive = false) {
	const source = new PageSource(
		/** @type {import('../src/Page').default} */ ({
			name: 'Test',
			namespaceId: 4,
			isArchive: () => isArchive,
		}),
	)
	source.setCode(code)

	return source
}

/**
 * Build page code with a topic per day of October 2026, in the given order.
 *
 * @param {number[]} days
 * @returns {string}
 */
function makeDatedCode(days) {
	return days
		.map(
			(day) =>
				`== Topic ${day} ==\nText. [[User:Example|Example]] ([[User talk:Example|talk]]) 12:00, ${day} October 2026 (UTC)\n`,
		)
		.join('\n')
}

describe('PageSource#modifyContext', () => {
	test('appends the topic when new topics go to the bottom', () => {
		expect(
			makeSource().modifyContext({
				commentCode: topicCode,
				isNewTopicOnTop: false,
				isNewSectionApi: false,
			}).contextCode,
		).toBe('Intro.\n\n== First ==\nText.\n\n== New ==\nNew text.\n')
	})

	test('puts the topic above the first section when new topics go on top', () => {
		expect(
			makeSource().modifyContext({
				commentCode: topicCode,
				isNewTopicOnTop: true,
				isNewSectionApi: false,
			}).contextCode,
		).toBe('Intro.\n\n== New ==\nNew text.\n\n== First ==\nText.\n')
	})

	test('appends the topic when new topics go on top but the page has no sections', () => {
		expect(
			makeSource('Intro.\n').modifyContext({
				commentCode: topicCode,
				isNewTopicOnTop: true,
				isNewSectionApi: false,
			}).contextCode,
		).toBe('Intro.\n\n== New ==\nNew text.\n')
	})

	test('returns the topic code alone with the new section API', () => {
		expect(
			makeSource().modifyContext({
				commentCode: topicCode,
				isNewTopicOnTop: false,
				isNewSectionApi: true,
			}).contextCode,
		).toBe(topicCode)
	})
})

describe('PageSource#findProperPlaceForSection', () => {
	test('puts the topic on top when topics clearly go newest first', () => {
		expect(makeSource(makeDatedCode([9, 8, 7, 6, 5])).findProperPlaceForSection()).toBe(0)
	})

	test('appends the topic when topics clearly go newest last', () => {
		const code = makeDatedCode([5, 6, 7, 8, 9])

		expect(makeSource(code).findProperPlaceForSection()).toBe(code.length)
	})

	test('appends the topic when the topic order is unclear', () => {
		// Two descending pairs against one ascending pair, the way an archiving bot leaves them
		const code = makeDatedCode([28, 10, 30, 16])

		expect(makeSource(code).findProperPlaceForSection()).toBe(code.length)
	})

	test('appends the topic to an unsorted archive whatever its topic order', () => {
		const code = makeDatedCode([9, 8, 7, 6, 5])

		expect(makeSource(code, true).findProperPlaceForSection()).toBe(code.length)
	})

	test('places the topic chronologically in an unsorted archive in ascending order', () => {
		const code = makeDatedCode([5, 9])

		expect(
			makeSource(code, true).findProperPlaceForSection(new Date('2026-10-07T00:00:00Z')),
		).toBe(code.indexOf('== Topic 9 =='))
	})
})
