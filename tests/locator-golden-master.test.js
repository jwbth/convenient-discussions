/**
 * Golden master of locating comments and sections in wikitext and splicing into it, over the parser
 * test corpus. Every result must stay unchanged by refactoring: a snapshot diff is a bug in the
 * change, not a reason to update the snapshot.
 *
 * Each comment and section is recorded in two contexts: section context (the code of its own
 * section, as {@link Section#requestCode} returns it) and page context (the group's cases
 * concatenated). The functions that call the locator (`locateComment`, `locateSection`, and the
 * operations in `recordComment` and `recordSection`) are what a change to the locator's interface
 * adapts; the records they produce must not change.
 */

import { beforeAll, describe, expect, test } from 'vitest'

import cd from '../src/loader/cd'
import CdError from '../src/shared/CdError'

import { buildCorpusGroup, parseCorpus } from './utils-locatorCorpus'
import { initCommonsGlobals } from './utils-wikiGlobals'
import testGroups from './worker-test-cases.json'

/** @typedef {import('./utils-locatorCorpus').CorpusGroup} CorpusGroup */
/** @typedef {import('../src/Comment').default} Comment */
/** @typedef {import('../src/Section').default} Section */
/** @typedef {import('../src/CommentSource').default} CommentSource */
/** @typedef {import('../src/SectionSource').default} SectionSource */
/** @typedef {'section' | 'page'} Context */

const dummyReply = ': DUMMY REPLY ~~~~\n'
const dummyEdit = 'DUMMY EDIT ~~~~'
const dummyReplyInSection = ': DUMMY REPLY IN SECTION ~~~~\n'
const dummySubsection = '==== DUMMY SUBSECTION ====\nDUMMY TEXT ~~~~\n'

/** @type {Map<string, CorpusGroup>} */
const groups = new Map()

beforeAll(async () => {
	;(await parseCorpus(testGroups)).forEach((parsedGroup) => {
		groups.set(parsedGroup.name, buildCorpusGroup(parsedGroup))
	})

	initCommonsGlobals()
	cd.settings = /** @type {any} */ ({
		// Below the default of 15, so that the outdenting branch of reply placement is taken in the
		// corpus
		get: (/** @type {string} */ name) => ({ outdent: true, outdentLevel: 4 })[name],
	})
})

/**
 * Run a function and return its result, or the code of the error it threw.
 *
 * @template T
 * @param {() => T} func
 * @returns {T | { error: string }}
 */
function tryOrError(func) {
	try {
		return func()
	} catch (error) {
		if (error instanceof CdError) {
			return { error: error.getCode() || error.getType() }
		}
		throw error
	}
}

/**
 * @typedef {object} Hunk
 * @property {number} line Index of the first line of `before` that the hunk replaces.
 * @property {string[]} removed
 * @property {string[]} inserted
 */

/**
 * Describe how `after` differs from `before` as line hunks: the code after an operation, without
 * repeating the context code it was made in. Bespoke rather than a diff library, as a library
 * update could change the hunks and so the snapshot.
 *
 * @param {string} before
 * @param {string} after
 * @returns {Hunk[]}
 */
function describeChange(before, after) {
	const beforeLines = before.split('\n')
	const afterLines = after.split('\n')
	let start = 0
	while (
		start < beforeLines.length &&
		start < afterLines.length &&
		beforeLines[start] === afterLines[start]
	) {
		start++
	}
	let end = 0
	while (
		end < beforeLines.length - start &&
		end < afterLines.length - start &&
		beforeLines.at(-1 - end) === afterLines.at(-1 - end)
	) {
		end++
	}
	const a = beforeLines.slice(start, beforeLines.length - end)
	const b = afterLines.slice(start, afterLines.length - end)

	// Lengths of the longest common subsequences of the line suffixes
	const lcs = Array.from({ length: a.length + 1 }, () =>
		Array.from({ length: b.length + 1 }, () => 0),
	)
	for (let i = a.length - 1; i >= 0; i--) {
		for (let j = b.length - 1; j >= 0; j--) {
			lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
		}
	}

	/** @type {Hunk[]} */
	const hunks = []
	/** @type {Hunk | undefined} */
	let hunk
	let i = 0
	let j = 0
	while (i < a.length || j < b.length) {
		if (i < a.length && j < b.length && a[i] === b[j]) {
			hunk = undefined
			i++
			j++
			continue
		}
		if (!hunk) {
			hunk = { line: start + i, removed: [], inserted: [] }
			hunks.push(hunk)
		}
		if (j < b.length && (i === a.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
			hunk.inserted.push(b[j])
			j++
		} else {
			hunk.removed.push(a[i])
			i++
		}
	}

	return hunks
}

/**
 * Locate a comment the way {@link Comment#loadCode} does: in section context, after locating its
 * section in the same code. In page context, the section's source is reset, so that deleting an
 * opening comment locates the section in the page code rather than reusing a source left by an
 * earlier test.
 *
 * @param {Comment} comment
 * @param {Context} context
 * @returns {CommentSource}
 */
function locateComment(comment, context) {
	const section = /** @type {Section} */ (comment.section)
	if (context === 'section') {
		tryOrError(() => section.locateInCode(section.presumedCode))

		return comment.locateInCode(section.presumedCode)
	}

	section.source = undefined

	return comment.locateInCode()
}

/**
 * @param {Section} section
 * @param {Context} context
 * @returns {SectionSource}
 */
function locateSection(section, context) {
	return context === 'section' ? section.locateInCode(section.presumedCode) : section.locateInCode()
}

/**
 * @param {Section} section
 * @param {Context} context
 * @param {CorpusGroup} group
 * @returns {string}
 */
function getContextCode(section, context, group) {
	return context === 'section' ? /** @type {string} */ (section.presumedCode) : group.pageCode
}

/**
 * Record what the locator makes of a comment in a context. Each operation locates the comment
 * anew, as operations change the source.
 *
 * @param {Comment} comment
 * @param {Context} context
 * @param {CorpusGroup} group
 * @returns {object}
 */
function recordComment(comment, context, group) {
	const contextCode = getContextCode(/** @type {Section} */ (comment.section), context, group)
	const located = tryOrError(() => locateComment(comment, context))
	if ('error' in located) {
		return located
	}

	const source = /** @type {CommentSource} */ (located)

	return {
		startIndex: source.startIndex,
		endIndex: source.endIndex,
		lineStartIndex: source.lineStartIndex,
		signatureEndIndex: source.signatureEndIndex,
		indentation: source.indentation,
		replyIndentation: source.replyIndentation,
		headingCode: source.headingCode,
		signatureCode: source.signatureCode,
		detectedActualLevel: source.detectedActualLevel,
		inputValue: source.toInputValue(),
		inputValueAtDetectedLevel:
			source.detectedActualLevel === undefined
				? undefined
				: (() => {
						const reprocessedSource = locateComment(comment, context)
						const level = /** @type {number} */ (reprocessedSource.detectedActualLevel)
						reprocessedSource.reprocessWithLevel(level)

						return reprocessedSource.toInputValue(level)
					})(),
		reply: tryOrError(() => {
			const replySource = locateComment(comment, context)
			const { contextCode: codeAfter } = replySource.modifyContext({
				action: 'reply',
				commentCode: dummyReply,
			})

			return {
				index: codeAfter.indexOf(dummyReply),
				replyIndentation: replySource.replyIndentation,
				isReplyOutdented: replySource.isReplyOutdented,
				change: describeChange(contextCode, codeAfter),
			}
		}),
		edit: tryOrError(() =>
			describeChange(
				contextCode,
				locateComment(comment, context).modifyContext({
					action: 'edit',
					commentCode: dummyEdit,
				}).contextCode,
			),
		),
		delete: tryOrError(() =>
			describeChange(
				contextCode,
				locateComment(comment, context).modifyContext({
					action: 'edit',
					doDelete: true,
				}).contextCode,
			),
		),
	}
}

/**
 * Record what the locator makes of a section in a context.
 *
 * @param {Section} section
 * @param {Context} context
 * @param {CorpusGroup} group
 * @returns {object}
 */
function recordSection(section, context, group) {
	const contextCode = getContextCode(section, context, group)
	const located = tryOrError(() => locateSection(section, context))
	if ('error' in located) {
		return located
	}

	const source = /** @type {SectionSource} */ (located)

	return {
		startIndex: source.startIndex,
		endIndex: source.endIndex,
		contentStartIndex: source.contentStartIndex,
		contentEndIndex: source.contentEndIndex,
		firstChunkEndIndex: source.firstChunkEndIndex,
		firstChunkContentEndIndex: source.firstChunkContentEndIndex,
		headline: source.headline,
		lastCommentIndentation: Object.fromEntries(
			/** @type {const} */ (['ol', 'ul']).map((containerListType) => [
				containerListType,
				locateSection(section, context).extractLastCommentIndentation(containerListType),
			]),
		),
		replyInSection: tryOrError(() =>
			describeChange(
				contextCode,
				locateSection(section, context).modifyContext({
					action: 'replyInSection',
					commentCode: dummyReplyInSection,
				}).contextCode,
			),
		),
		addSubsection: tryOrError(() =>
			describeChange(
				contextCode,
				locateSection(section, context).modifyContext({
					action: 'addSubsection',
					commentCode: dummySubsection,
				}).contextCode,
			),
		),
	}
}

describe.each(testGroups.map((group) => group.name))('%s', (groupName) => {
	test.each(
		/** @type {{ headline: string }[]} */ (
			testGroups.find((group) => group.name === groupName)?.tests
		).map((testCase, i) => [testCase.headline, i]),
	)('%s', (_headline, caseIndex) => {
		const group = /** @type {CorpusGroup} */ (groups.get(groupName))
		const { comments, sections } = group.cases[/** @type {number} */ (caseIndex)]

		const result = {
			sections: sections.map((section) => ({
				headline: section.headline,
				section: recordSection(section, 'section', group),
				page: recordSection(section, 'page', group),
			})),
			comments: comments.map((comment) => ({
				author: comment.authorName,
				timestamp: comment.timestamp,
				section: recordComment(comment, 'section', group),
				page: recordComment(comment, 'page', group),
			})),
		}

		expect(result).toMatchSnapshot()
	})
})
