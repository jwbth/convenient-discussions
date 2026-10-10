import { afterEach, describe, expect, test, vi } from 'vitest'

import Comment from '../src/Comment'
import cd from '../src/loader/cd'
import pageRegistry from '../src/pageRegistry'
import CdError from '../src/shared/CdError'

/** @typedef {import('../src/CommentSource').default} CommentSource */

const pageCode = 'PAGE CODE\n'
const transcludedCode = 'TRANSCLUDED CODE\n'
const dtId = 'c-Alice-20240101100000'

/**
 * @param {string} code
 * @returns {{ source?: { getCode: () => string }, loadCode: import('vitest').Mock }}
 */
function makePage(code) {
	const page = {
		source: /** @type {{ getCode: () => string } | undefined} */ (undefined),
		loadCode: vi.fn(async () => {
			page.source = { getCode: () => code }
		}),
	}

	return page
}

/**
 * Set up a comment that is in no section, that can't be located in the current page's code, and
 * that can be located only in {@link transcludedCode}; and the DiscussionTools API answering with
 * `transcludedFrom` for it.
 *
 * @param {object} options
 * @param {boolean | string} [options.transcludedFrom] What DiscussionTools reports; omitted means
 *   it doesn't know the comment.
 */
function setUp({ transcludedFrom }) {
	cd.page = /** @type {any} */ (makePage(pageCode))
	const transcludedPage = makePage(transcludedCode)
	vi.spyOn(pageRegistry, 'get').mockReturnValue(/** @type {any} */ (transcludedPage))
	const get = vi.fn(async () => ({
		discussiontoolspageinfo: {
			transcludedfrom: transcludedFrom === undefined ? {} : { [dtId]: transcludedFrom },
		},
	}))
	cd.getApi = /** @type {any} */ (() => ({ get }))

	const comment = /** @type {Comment} */ (Object.create(Comment.prototype))
	comment.dtId = dtId
	const source = /** @type {CommentSource} */ ({})
	comment.locateInCode = /** @type {any} */ (
		vi.fn(
			(
				/** @type {string | undefined} */ _sectionCode,
				/** @type {string | undefined} */ code,
			) => {
				if ((code ?? comment.getSourcePage().source.getCode()) !== transcludedCode) {
					throw new CdError({ type: 'parse', code: 'locateComment' })
				}

				return source
			},
		)
	)

	return { comment, source, transcludedPage, get }
}

/**
 * @param {Promise<unknown>} promise
 * @returns {Promise<CdError>}
 */
async function rejection(promise) {
	try {
		await promise
	} catch (error) {
		return /** @type {CdError} */ (error)
	}
	throw new Error('Expected a rejection')
}

cd.sParse = /** @type {any} */ ((/** @type {string} */ name) => name)

afterEach(() => {
	vi.restoreAllMocks()
})

test('Comment#loadCode locates the section in its code before the comment', async () => {
	const { comment, source } = setUp({})
	const sectionCode = 'SECTION CODE\n'
	const section = {
		liveSectionNumber: 1,
		requestCode: async () => sectionCode,
		locateInCode: vi.fn(),
		getSourcePage: () => cd.page,
	}
	comment.section = /** @type {any} */ (section)
	vi.mocked(comment.locateInCode).mockImplementation(() => {
		expect(section.locateInCode).toHaveBeenCalledWith(sectionCode)

		return source
	})

	expect(await comment.loadCode()).toEqual({ source, isInSectionContext: true, needsDtApi: false })
	expect(comment.locateInCode).toHaveBeenCalledWith(sectionCode)
})

describe('Comment#loadCode with the DiscussionTools fallback', () => {
	test('locates a transcluded comment in the page it is transcluded from', async () => {
		const { comment, source, transcludedPage } = setUp({ transcludedFrom: 'Talk:Other' })

		expect(await comment.loadCode({ useDtFallback: true })).toEqual({
			source,
			isInSectionContext: false,
			needsDtApi: false,
		})
		expect(pageRegistry.get).toHaveBeenCalledWith('Talk:Other')
		expect(comment.source).toBe(source)
		expect(comment.getSourcePage()).toBe(transcludedPage)
	})

	test('reports that the DiscussionTools API is needed when the comment is on this page', async () => {
		const { comment } = setUp({ transcludedFrom: false })

		expect(await comment.loadCode({ useDtFallback: true })).toEqual({
			source: undefined,
			isInSectionContext: false,
			needsDtApi: true,
		})
	})

	test("throws cantReply when the comment's source is unknown to DiscussionTools", async () => {
		const { comment } = setUp({ transcludedFrom: true })

		const error = await rejection(comment.loadCode({ useDtFallback: true }))

		expect(error.getCode()).toBe('cantReply')
		expect(error.getMessage()).toBe('cf-error-getpagecode')
	})

	test("throws noData when DiscussionTools doesn't know the comment", async () => {
		const { comment } = setUp({})

		expect((await rejection(comment.loadCode({ useDtFallback: true }))).getCode()).toBe('noData')
	})

	test("throws locateComment when the transcluded page's code doesn't have the comment", async () => {
		const { comment, transcludedPage } = setUp({ transcludedFrom: 'Talk:Other' })
		transcludedPage.loadCode.mockImplementation(async () => {
			transcludedPage.source = { getCode: () => pageCode }
		})

		expect((await rejection(comment.loadCode({ useDtFallback: true }))).getCode()).toBe(
			'locateComment',
		)
	})

	test('is not used unless enabled', async () => {
		const { comment, get } = setUp({ transcludedFrom: 'Talk:Other' })

		expect((await rejection(comment.loadCode())).getCode()).toBe('locateComment')
		expect(get).not.toHaveBeenCalled()
	})

	test('is not used for a comment without a DiscussionTools ID', async () => {
		const { comment, get } = setUp({ transcludedFrom: 'Talk:Other' })
		comment.dtId = undefined

		expect((await rejection(comment.loadCode({ useDtFallback: true }))).getCode()).toBe(
			'locateComment',
		)
		expect(get).not.toHaveBeenCalled()
	})
})
