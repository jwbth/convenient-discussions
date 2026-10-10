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
		followsHeadingOnPage: false,
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

describe('broken indentation', () => {
	const brokenCode = [
		'== Topic ==',
		'Opening text. [[User:Alice|Alice]] ([[User talk:Alice|talk]]) 10:00, 1 January 2024 (UTC)',
		':: Reply text. [[User:Bob|Bob]] ([[User talk:Bob|talk]]) 11:00, 1 January 2024 (UTC)',
		'',
	].join('\n')

	test('is detected in a level-0 comment that starts with indentation characters', () => {
		const source = /** @type {CommentSource} */ (
			CommentSource.locate(brokenCode, { ...makeReplyData(), level: 0 }, true)
		)

		expect(source.detectedActualLevel).toBe(2)
	})

	test("isn't detected when the comment follows a heading on the page, whatever identifies it", () => {
		const source = /** @type {CommentSource} */ (
			CommentSource.locate(
				brokenCode,
				{ ...makeReplyData(), level: 0, followsHeading: false, followsHeadingOnPage: true },
				true,
			)
		)

		expect(source.detectedActualLevel).toBeUndefined()
	})
})

describe('deleting an opening comment', () => {
	const openingLine =
		'Opening text. [[User:Alice|Alice]] ([[User talk:Alice|talk]]) 10:00, 1 January 2024 (UTC)'

	/**
	 * Comment data of Alice's opening comment.
	 *
	 * @returns {CommentData}
	 */
	function makeOpeningData() {
		return {
			...makeReplyData(),
			author: userRegistry.get('Alice'),
			timestamp: '10:00, 1 January 2024 (UTC)',
			index: 0,
			previousComments: [],
			followsHeading: true,
			followsHeadingOnPage: true,
			text: 'Opening text.',
			level: 0,
			openingSection: true,
		}
	}

	test('needs the section source when the span has the heading', () => {
		const code = ['== Topic ==', openingLine, '', '== Next ==', 'Next text.', ''].join('\n')
		const source = /** @type {CommentSource} */ (CommentSource.locate(code, makeOpeningData()))

		expect(source.deletesWholeSection()).toBe(true)
		expect(() => source.modifyContext({ action: 'edit', doDelete: true })).toThrow(
			'The section source is not set.',
		)
	})

	test('deletes only its lines, with no section source, when the span has no heading', () => {
		const code = [openingLine, '', 'Other text.', ''].join('\n')
		const source = /** @type {CommentSource} */ (CommentSource.locate(code, makeOpeningData()))

		expect(source.deletesWholeSection()).toBe(false)
		expect(source.modifyContext({ action: 'edit', doDelete: true }).contextCode).toBe(
			'\nOther text.\n',
		)
	})
})
