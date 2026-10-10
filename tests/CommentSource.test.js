import { beforeAll, describe, expect, test } from 'vitest'

import CommentSource from '../src/CommentSource'
import userRegistry from '../src/userRegistry'

import { initCommonsGlobals } from './utils-wikiGlobals'

/** @typedef {import('../src/CommentSource').CommentData} CommentData */

beforeAll(() => {
	initCommonsGlobals()
})

const sectionCode = [
	'== Topic ==',
	'Opening text. [[User:Alice|Alice]] ([[User talk:Alice|talk]]) 10:00, 1 January 2024 (UTC)',
	': Reply text. [[User:Bob|Bob]] ([[User talk:Bob|talk]]) 11:00, 1 January 2024 (UTC)',
	'',
].join('\n')

/**
 * Comment data of Bob's reply in {@link sectionCode}.
 *
 * @returns {CommentData}
 */
function makeReplyData() {
	return {
		author: userRegistry.get('Bob'),
		timestamp: '11:00, 1 January 2024 (UTC)',
		index: 1,
		previousComments: [{ authorName: 'Alice', timestamp: '10:00, 1 January 2024 (UTC)' }],
		followsHeading: false,
		sectionHeadline: 'Topic',
		text: 'Reply text.',
		level: 1,
		own: false,
		openingSection: false,
		tableComment: false,
		hasForeignTimestamps: false,
		hasPreWithElements: false,
		childLevels: [],
		hasValidReplies: false,
	}
}

describe('CommentSource.locate', () => {
	test('locates a comment from plain comment data', () => {
		const source = /** @type {CommentSource} */ (
			CommentSource.locate(sectionCode, makeReplyData(), true)
		)

		expect(sectionCode.slice(source.lineStartIndex, source.signatureEndIndex)).toBe(
			': Reply text. [[User:Bob|Bob]] ([[User talk:Bob|talk]]) 11:00, 1 January 2024 (UTC)',
		)
		expect(source.indentation).toBe(':')
		expect(source.replyIndentation).toBe('::')
		expect(source.toInputValue()).toBe('Reply text.')
	})

	test('locates nothing when no signature has the author and timestamp', () => {
		expect(
			CommentSource.locate(
				sectionCode,
				{ ...makeReplyData(), timestamp: '12:00, 1 January 2024 (UTC)' },
				true,
			),
		).toBeUndefined()
	})
})
