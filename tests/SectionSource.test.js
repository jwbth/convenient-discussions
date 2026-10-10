import { beforeAll, describe, expect, test } from 'vitest'

import SectionSource from '../src/SectionSource'
import userRegistry from '../src/userRegistry'

import { initCommonsGlobals } from './utils-wikiGlobals'

/** @typedef {import('../src/SectionSource').SectionData} SectionData */

beforeAll(() => {
	initCommonsGlobals()
})

const pageCode = [
	'== First ==',
	'First text. [[User:Alice|Alice]] ([[User talk:Alice|talk]]) 10:00, 1 January 2024 (UTC)',
	'',
	'== Second ==',
	'Second text. [[User:Bob|Bob]] ([[User talk:Bob|talk]]) 11:00, 1 January 2024 (UTC)',
	'# Vote. [[User:Alice|Alice]] ([[User talk:Alice|talk]]) 12:00, 1 January 2024 (UTC)',
	'',
	'=== Sub ===',
	'Sub text. [[User:Alice|Alice]] ([[User talk:Alice|talk]]) 13:00, 1 January 2024 (UTC)',
	'',
].join('\n')

/**
 * Section data of the "Second" section in {@link pageCode}.
 *
 * @returns {SectionData}
 */
function makeSecondData() {
	return {
		headline: 'Second',
		index: 1,
		previousHeadlines: ['First'],
		oldestComment: {
			author: userRegistry.get('Bob'),
			timestamp: '11:00, 1 January 2024 (UTC)',
			text: 'Second text.',
		},
		lastCommentData: {
			author: userRegistry.get('Alice'),
			timestamp: '12:00, 1 January 2024 (UTC)',
			index: 2,
			previousComments: [{ authorName: 'Bob', timestamp: '11:00, 1 January 2024 (UTC)' }],
			followsHeading: false,
			followsHeadingOnPage: false,
			sectionHeadline: 'Second',
			text: 'Vote.',
			level: 1,
			own: false,
			openingSection: false,
			tableComment: false,
			hasForeignTimestamps: false,
			hasPreWithElements: false,
			childLevels: [],
			hasValidReplies: false,
		},
	}
}

describe('SectionSource.locate', () => {
	test('locates a section in page code from plain section data', () => {
		const source = /** @type {SectionSource} */ (SectionSource.locate(pageCode, makeSecondData()))

		expect(source.headline).toBe('Second')
		expect(pageCode.slice(source.startIndex, source.firstChunkEndIndex)).toBe(
			[
				'== Second ==',
				'Second text. [[User:Bob|Bob]] ([[User talk:Bob|talk]]) 11:00, 1 January 2024 (UTC)',
				'# Vote. [[User:Alice|Alice]] ([[User talk:Alice|talk]]) 12:00, 1 January 2024 (UTC)',
				'',
			].join('\n'),
		)
	})

	test('locates nothing when no heading matches the data', () => {
		expect(
			SectionSource.locate(pageCode, {
				...makeSecondData(),
				headline: 'Missing',
				oldestComment: undefined,
				lastCommentData: undefined,
			}),
		).toBeUndefined()
	})
})

describe('extractLastCommentIndentation', () => {
	test("takes the last comment's indentation in a numbered list", () => {
		const source = /** @type {SectionSource} */ (SectionSource.locate(pageCode, makeSecondData()))

		expect(source.extractLastCommentIndentation('ol')).toBe('#')
	})

	test('ignores `#` outside a numbered list', () => {
		const source = /** @type {SectionSource} */ (SectionSource.locate(pageCode, makeSecondData()))

		expect(source.extractLastCommentIndentation('ul')).toBeNull()
	})
})
