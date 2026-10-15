import { expect } from 'vitest'

import CommentSource from '../src/CommentSource'
import userRegistry from '../src/userRegistry'

/** @typedef {import('../src/CommentSource').CommentData} CommentData */

/**
 * Comment data of Bob's 11:00 reply to Alice's 10:00 opening comment of a "Topic" section.
 *
 * @returns {CommentData}
 */
export function makeReplyData() {
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

/**
 * Signature as Commons users sign, on 1 January 2024.
 *
 * @param {string} name
 * @param {string} time
 * @returns {string}
 */
export function sign(name, time) {
	return `[[User:${name}|${name}]] ([[User talk:${name}|talk]]) ${time}, 1 January 2024 (UTC)`
}

/**
 * Comment data of a comment in a "Topic" section, with the identification taken from the arguments.
 *
 * @param {string} name
 * @param {string} time
 * @param {Partial<CommentData>} [overrides]
 * @returns {CommentData}
 */
export function makeData(name, time, overrides = {}) {
	return {
		...makeReplyData(),
		author: userRegistry.get(name),
		timestamp: `${time}, 1 January 2024 (UTC)`,
		...overrides,
	}
}

/**
 * Comment data of Alice's opening comment of a "Topic" section.
 *
 * @returns {CommentData}
 */
export function makeOpeningCommentData() {
	return makeData('Alice', '10:00', {
		index: 0,
		previousComments: [],
		followsHeading: true,
		followsHeadingOnPage: true,
		text: 'Opening text.',
		level: 0,
		openingSection: true,
	})
}

/**
 * Locate a comment, failing the test if it isn't found.
 *
 * @param {string} code
 * @param {CommentData} data
 * @returns {CommentSource}
 */
export function locate(code, data) {
	const source = CommentSource.locate(code, data, true)
	expect(source).toBeDefined()

	return /** @type {CommentSource} */ (source)
}
