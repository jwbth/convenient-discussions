import { beforeAll, describe, expect, test } from 'vitest'

import CommentSource from '../src/CommentSource'
import SectionSource from '../src/SectionSource'
import cd from '../src/loader/cd'
import userRegistry from '../src/userRegistry'

import { initCommonsGlobals } from './utils-wikiGlobals'

/** @typedef {import('../src/CommentSource').CommentData} CommentData */

beforeAll(() => {
	initCommonsGlobals()
	cd.settings = /** @type {any} */ ({
		get: (/** @type {string} */ name) => ({ outdent: false })[name],
	})
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

	test('needs the section source when the span has the heading', () => {
		const code = ['== Topic ==', openingLine, '', '== Next ==', 'Next text.', ''].join('\n')
		const source = /** @type {CommentSource} */ (CommentSource.locate(code, makeOpeningCommentData()))

		expect(source.deletesWholeSection()).toBe(true)
		expect(() => source.modifyContext({ action: 'edit', doDelete: true })).toThrow(
			'The section source is not set.',
		)
	})

	test('deletes only its lines, with no section source, when the span has no heading', () => {
		const code = [openingLine, '', 'Other text.', ''].join('\n')
		const source = /** @type {CommentSource} */ (CommentSource.locate(code, makeOpeningCommentData()))

		expect(source.deletesWholeSection()).toBe(false)
		expect(source.modifyContext({ action: 'edit', doDelete: true }).contextCode).toBe(
			'\nOther text.\n',
		)
	})
})

/**
 * Signature as Commons users sign, on 1 January 2024.
 *
 * @param {string} name
 * @param {string} time
 * @returns {string}
 */
function sign(name, time) {
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
function makeData(name, time, overrides = {}) {
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
function makeOpeningCommentData() {
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
function locate(code, data) {
	const source = CommentSource.locate(code, data, true)
	expect(source).toBeDefined()

	return /** @type {CommentSource} */ (source)
}

/**
 * Run a function and return the code of the error it threw.
 *
 * @param {() => unknown} func
 * @returns {string | undefined}
 */
function getErrorCode(func) {
	try {
		func()
	} catch (error) {
		return /** @type {import('../src/shared/CdError').default} */ (error).getCode()
	}
}

describe('reply place', () => {
	test('is found before a long run of spaces without catastrophic backtracking', () => {
		// The outdent template regexp runs over the code after the reply place, so whitespace runs
		// there must be matched in linear time; a regexp backtracking over them quadratically took 4 s
		// on this code (measured 2026-10-10 on the dev machine).
		const code = [
			'== Topic ==',
			`Opening text. ${sign('Alice', '10:00')}`,
			`: Reply text. ${sign('Bob', '11:00')}`,
			' '.repeat(60_000) + 'Text after spaces.',
			'',
		].join('\n')
		const source = locate(code, makeData('Bob', '11:00'))

		const start = performance.now()
		const replyPlace = source.findReplyPlace()

		expect(performance.now() - start).toBeLessThan(1000)
		expect(code.slice(0, replyPlace).endsWith(`${sign('Bob', '11:00')}\n`)).toBe(true)
	})

	test("can't be found right before an outdent template", () => {
		const code = [
			'== Topic ==',
			`Opening text. ${sign('Alice', '10:00')}`,
			`: Reply text. ${sign('Bob', '11:00')}`,
			`{{od}} Outdented text. ${sign('Alice', '12:00')}`,
			'',
		].join('\n')
		const source = locate(code, makeData('Bob', '11:00'))

		expect(getErrorCode(() => source.findReplyPlace())).toBe('findPlace')
	})

	test("can't be found inside a closed discussion", () => {
		const code = [
			'== Topic ==',
			'{{Closed|Done.}}',
			`Opening text. ${sign('Alice', '10:00')}`,
			`: Reply text. ${sign('Bob', '11:00')}`,
			'{{End closed}}',
			'',
		].join('\n')
		const source = locate(code, makeData('Bob', '11:00'))

		expect(getErrorCode(() => source.findReplyPlace())).toBe('closed')
	})
})

describe('unsigned templates', () => {
	test.each([
		['with a timezone', '{{unsigned|Bob|11:00, 1 January 2024 (UTC)}}'],
		['without a timezone', '{{unsigned|Bob|11:00, 1 January 2024}}'],
	])('sign a comment that is located %s', (_name, template) => {
		const line = `: Reply text. ${template}`
		const code = ['== Topic ==', `Opening text. ${sign('Alice', '10:00')}`, line, ''].join('\n')
		const source = locate(code, makeData('Bob', '11:00'))

		expect(code.slice(source.lineStartIndex, source.signatureEndIndex)).toBe(line)
		expect(source.toInputValue()).toBe('Reply text.')
	})

	test('end the thread a reply to an earlier comment goes after', () => {
		const unsignedLine = ': Reply text. {{unsigned|Bob|11:00, 1 January 2024}}'
		const nextLine = `Unrelated text. ${sign('Alice', '12:00')}`
		const code = [
			'== Topic ==',
			`Opening text. ${sign('Alice', '10:00')}`,
			unsignedLine,
			nextLine,
			'',
		].join('\n')
		const source = locate(code, makeOpeningCommentData())
		const { contextCode } = source.modifyContext({
			action: 'reply',
			commentCode: ': Answer. ~~~~\n',
			replyPlace: source.findReplyPlace(),
		})

		expect(contextCode).toBe(
			[
				'== Topic ==',
				`Opening text. ${sign('Alice', '10:00')}`,
				unsignedLine,
				': Answer. ~~~~',
				nextLine,
				'',
			].join('\n'),
		)
	})
})

describe('many consecutive comments with the same author and timestamp', () => {
	const code = [
		'== Topic ==',
		`Apples are red. ${sign('Alice', '10:00')}`,
		`: Bananas are yellow. ${sign('Alice', '10:00')}`,
		`: Cherries are dark. ${sign('Alice', '10:00')}`,
		'',
	].join('\n')
	const previousComments = [
		{ authorName: 'Alice', timestamp: '10:00, 1 January 2024 (UTC)' },
		{ authorName: 'Alice', timestamp: '10:00, 1 January 2024 (UTC)' },
	]

	test('are told apart by their text', () => {
		const source = locate(
			code,
			makeData('Alice', '10:00', { index: 1, previousComments, text: 'Bananas are yellow.' }),
		)

		expect(source.toInputValue()).toBe('Bananas are yellow.')
	})

	test("aren't told apart by their previous comments alone", () => {
		expect(
			CommentSource.locate(
				code,
				makeData('Alice', '10:00', { index: 2, previousComments, text: 'Durians smell.' }),
				true,
			),
		).toBeUndefined()
	})
})

describe('editing an opening comment', () => {
	const code = [
		'== Topic ==',
		`Opening text. ${sign('Alice', '10:00')}`,
		`: Reply text. ${sign('Bob', '11:00')}`,
		'',
	].join('\n')

	test('keeps the heading out of the input value', () => {
		const source = locate(code, makeOpeningCommentData())

		expect(source.headingCode).toBe('== Topic ==\n')
		expect(source.toInputValue()).toBe('Opening text.')
	})

	test.each(['noinclude', 'includeonly', 'onlyinclude'])(
		'keeps newlines inside <%s> in the input value',
		(tag) => {
			const source = locate(
				[
					'== Topic ==',
					`{{Notice}}<${tag}>`,
					`{{Help}}</${tag}>`,
					'Opening',
					`text. ${sign('Alice', '10:00')}`,
					`: Reply text. ${sign('Bob', '11:00')}`,
					'',
				].join('\n'),
				makeOpeningCommentData(),
			)

			expect(source.toInputValue()).toBe(
				`{{Notice}}<${tag}>\n{{Help}}</${tag}> Opening text.`,
			)
		},
	)

	test('replaces the heading together with the comment', () => {
		const source = locate(code, makeOpeningCommentData())

		expect(
			source.modifyContext({
				action: 'edit',
				commentCode: `${source.headingCode}Edited text.${source.signatureCode}`,
			}).contextCode,
		).toBe(
			[
				'== Topic ==',
				`Edited text. ${sign('Alice', '10:00')}`,
				`: Reply text. ${sign('Bob', '11:00')}`,
				'',
			].join('\n'),
		)
	})
})

describe('deleting', () => {
	test('is refused for a comment with replies', () => {
		const code = [
			'== Topic ==',
			`Opening text. ${sign('Alice', '10:00')}`,
			`: Reply text. ${sign('Bob', '11:00')}`,
			`:: Answer. ${sign('Alice', '12:00')}`,
			'',
		].join('\n')
		const source = locate(code, makeData('Bob', '11:00'))

		expect(getErrorCode(() => source.modifyContext({ action: 'edit', doDelete: true }))).toBe(
			'delete-repliesToComment',
		)
	})

	describe('the opening comment of a section', () => {

		/**
		 * Section data of the "Topic" section.
		 *
		 * @returns {import('../src/SectionSource').SectionData}
		 */
		function makeTopicData() {
			return {
				headline: 'Topic',
				index: 0,
				previousHeadlines: [],
				oldestComment: {
					author: userRegistry.get('Alice'),
					timestamp: '10:00, 1 January 2024 (UTC)',
					text: 'Opening text.',
				},
			}
		}

		test('deletes the whole section when it has no replies', () => {
			const code = [
				'== Topic ==',
				`Opening text. ${sign('Alice', '10:00')}`,
				'',
				'== Next ==',
				`Next text. ${sign('Bob', '11:00')}`,
				'',
			].join('\n')
			const source = locate(code, makeOpeningCommentData())

			expect(
				source.modifyContext({
					action: 'edit',
					doDelete: true,
					sectionSource: SectionSource.locate(code, makeTopicData()),
				}).contextCode,
			).toBe(['== Next ==', `Next text. ${sign('Bob', '11:00')}`, ''].join('\n'))
		})

		test('is refused when the section has replies', () => {
			const code = [
				'== Topic ==',
				`Opening text. ${sign('Alice', '10:00')}`,
				`: Reply text. ${sign('Bob', '11:00')}`,
				'',
			].join('\n')
			const source = locate(code, makeOpeningCommentData())

			expect(
				getErrorCode(() =>
					source.modifyContext({
						action: 'edit',
						doDelete: true,
						sectionSource: SectionSource.locate(code, makeTopicData(), true),
					}),
				),
			).toBe('delete-repliesInSection')
		})
	})
})

describe('broken indentation', () => {
	const code = [
		'== Topic ==',
		`Opening text. ${sign('Alice', '10:00')}`,
		`:: Reply text. ${sign('Bob', '11:00')}`,
		'',
	].join('\n')
	const makeBrokenData = () => makeData('Bob', '11:00', { level: 0 })

	test('is applied when reprocessing with the detected level', () => {
		const source = locate(code, makeBrokenData())
		source.reprocessWithLevel(/** @type {number} */ (source.detectedActualLevel))

		expect(source.indentation).toBe('::')
		expect(source.toInputValue(source.detectedActualLevel)).toBe('Reply text.')
	})

	test.each(
		/** @type {[string, Partial<CommentData>][]} */ ([
			['has children but no valid replies', { childLevels: [1], hasValidReplies: false }],
			['has valid replies all deeper than the detected level', { childLevels: [3], hasValidReplies: true }],
		]),
	)('can be fixed when the comment %s', (_name, overrides) => {
		expect(locate(code, { ...makeBrokenData(), ...overrides }).detectedActualLevel).toBe(2)
	})

	test.each(
		/** @type {[string, Partial<CommentData>][]} */ ([
			['has valid replies not deeper than the detected level', { childLevels: [1, 3], hasValidReplies: true }],
			['has `<pre>` blocks with elements', { hasPreWithElements: true }],
		]),
	)("can't be fixed when the comment %s", (_name, overrides) => {
		expect(locate(code, { ...makeBrokenData(), ...overrides }).detectedActualLevel).toBeUndefined()
	})

	test("can't be fixed when a line of the comment starts with a template", () => {
		const templateCode = [
			'== Topic ==',
			`Opening text. ${sign('Alice', '10:00')}`,
			':: Reply text.',
			`{{Navbox}} ${sign('Bob', '11:00')}`,
			'',
		].join('\n')

		expect(locate(templateCode, makeBrokenData()).detectedActualLevel).toBeUndefined()
	})
})
