import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'

import Comment from '../src/Comment'
import CommentFormInputTransformer from '../src/CommentFormInputTransformer'
import PageSource from '../src/PageSource'
import Section from '../src/Section'
import buildEdit from '../src/buildEdit'
import commentManager from '../src/commentManager'
import cd from '../src/loader/cd'
import userRegistry from '../src/userRegistry'

import { rejection } from './utils-rejection'
import { initCommonsGlobals } from './utils-wikiGlobals'

afterEach(() => {
	vi.restoreAllMocks()
})

beforeAll(() => {
	initCommonsGlobals()
	cd.g.userSignature = ' ~~~~'
	cd.settings = /** @type {any} */ ({
		get: (/** @type {string} */ name) => ({ outdent: false })[name],
	})
	CommentFormInputTransformer.init()
	cd.sParse = /** @type {any} */ ((/** @type {string} */ name) => name)
})

const topicCode = [
	'== Topic ==',
	'Opening text. [[User:Alice|Alice]] ([[User talk:Alice|talk]]) 10:00, 1 January 2024 (UTC)',
	': Reply text. [[User:Bob|Bob]] ([[User talk:Bob|talk]]) 11:00, 1 January 2024 (UTC)',
	'',
].join('\n')

const otherCode = [
	'== Other ==',
	'Other text. [[User:Carol|Carol]] ([[User talk:Carol|talk]]) 12:00, 1 January 2024 (UTC)',
	'',
].join('\n')

const pageCode = 'Intro.\n\n' + topicCode + '\n' + otherCode

/**
 * Build a page with the sections and comments of {@link pageCode}: `Comment` and `Section` objects
 * (prototype only, no constructor run) with the data locating them reads. Fetching is faked:
 * {@link Section#requestCode} returns the section's code from {@link pageCode} (or `sectionCode`
 * when given), {@link Page#loadCode} loads `loadedPageCode`.
 *
 * @param {object} [options]
 * @param {boolean} [options.hasLiveSectionNumber]
 * @param {string} [options.sectionCode] Section code to return instead of the section's code in
 *   the page code.
 * @param {string} [options.loadedPageCode]
 * @param {boolean} [options.pageExists]
 */
function makePage({
	hasLiveSectionNumber = true,
	sectionCode,
	loadedPageCode = pageCode,
	pageExists = true,
} = {}) {
	const page = /** @type {any} */ ({
		name: 'Talk:Test',
		revisionId: /** @type {number | undefined} */ (undefined),
		queryTimestamp: /** @type {string | undefined} */ (undefined),
		exists: () => pageExists,
		loadCode: vi.fn(async (/** @type {any} */ _, /** @type {boolean} */ tolerateMissing = true) => {
			page.queryTimestamp = '2024-01-02T00:00:00Z'
			if (!pageExists) {
				page.source.setCode('')
				page.revisionId = undefined
				if (!tolerateMissing) throw new Error('missing')

				return
			}
			page.source.setCode(loadedPageCode)
			page.revisionId = 100
		}),
	})
	page.source = new PageSource(page)
	cd.page = page

	/** @type {Comment[]} */
	const comments = []
	/** @type {Section[]} */
	const sections = []
	const commentManager = { getAll: () => comments }
	const sectionManager = { getAll: () => sections }

	/**
	 * @param {string} headline
	 * @param {number} index
	 * @param {string} code
	 * @returns {Section}
	 */
	const makeSection = (headline, index, code) => {
		const section = /** @type {Section} */ (
			Object.assign(Object.create(Section.prototype), {
				headline,
				level: 2,
				index,
				sourcePage: page,
				manager: sectionManager,
				liveSectionNumber: hasLiveSectionNumber ? index + 1 : undefined,
			})
		)
		section.requestCode = vi.fn(async () => {
			section.presumedCode = sectionCode ?? code
			section.revisionId = 200
			section.queryTimestamp = '2024-01-03T00:00:00Z'

			return section.presumedCode
		})
		sections.push(section)

		return section
	}

	/**
	 * @param {object} data
	 * @param {string} data.authorName
	 * @param {string} data.timestamp
	 * @param {number} data.level
	 * @param {string} data.text
	 * @param {Section} data.section
	 * @param {boolean} [data.openingSection]
	 * @returns {Comment}
	 */
	const makeComment = ({ authorName, timestamp, level, text, section, openingSection = false }) => {
		const comment = /** @type {Comment} */ (
			Object.assign(Object.create(Comment.prototype), {
				id: `${timestamp}_${authorName}`,
				authorName,
				author: userRegistry.get(authorName),
				timestamp,
				level,
				followsHeading: openingSection,
				openingSection,
				tableComment: false,
				elements: [],
				manager: commentManager,
				section,
			})
		)
		Object.assign(comment, {
			getText: () => text,
			hasFlag: () => false,
			getChildren: () => [],
		})
		comments.push(comment)

		return comment
	}

	const topic = makeSection('Topic', 0, topicCode)
	const other = makeSection('Other', 1, otherCode)
	const alice = makeComment({
		authorName: 'Alice',
		timestamp: '10:00, 1 January 2024 (UTC)',
		level: 0,
		text: 'Opening text.',
		section: topic,
		openingSection: true,
	})
	const bob = makeComment({
		authorName: 'Bob',
		timestamp: '11:00, 1 January 2024 (UTC)',
		level: 1,
		text: 'Reply text.',
		section: topic,
	})
	const carol = makeComment({
		authorName: 'Carol',
		timestamp: '12:00, 1 January 2024 (UTC)',
		level: 0,
		text: 'Other text.',
		section: other,
		openingSection: true,
	})
	Object.assign(topic, {
		comments: [alice, bob],
		commentsInFirstChunk: [alice, bob],
		oldestComment: alice,
	})
	Object.assign(other, {
		comments: [carol],
		commentsInFirstChunk: [carol],
		oldestComment: carol,
	})

	return { page, topic, other, alice, bob, carol }
}

/**
 * @template {import('../src/CommentForm').CommentFormMode} Mode
 * @param {Mode} mode
 * @param {Partial<import('../src/CommentForm').CommentFormValues<Mode>>} [values]
 * @returns {import('../src/CommentForm').CommentFormValues<Mode>}
 */
function makeValues(mode, values = {}) {
	return {
		mode,
		comment: '',
		headline: undefined,
		omitSignature: false,
		delete: false,
		newTopicOnTop: false,
		containerListType: undefined,
		commentTemplate: undefined,
		actualCommentLevel: undefined,
		commentForm: /** @type {any} */ ({}),
		...values,
	}
}

describe('buildEdit', () => {
	test('replies to a comment in its section code', async () => {
		const { bob } = makePage()

		expect(await buildEdit(makeValues('reply', { comment: 'Thanks.' }), bob, 'submit')).toEqual({
			api: 'edit',
			params: {
				text: topicCode + ':: Thanks. ~~~~\n',
				section: '1',
				baserevid: 200,
				starttimestamp: '2024-01-03T00:00:00Z',
			},
			diffBase: { code: topicCode },
			commentCode: ':: Thanks. ~~~~\n',
			isIndented: true,
		})
	})

	test('replies to a comment in the page code when the section has no live section number', async () => {
		const { bob } = makePage({ hasLiveSectionNumber: false })

		expect(await buildEdit(makeValues('reply', { comment: 'Thanks.' }), bob, 'submit')).toEqual({
			api: 'edit',
			params: {
				text: 'Intro.\n\n' + topicCode + ':: Thanks. ~~~~\n\n' + otherCode,
				baserevid: 100,
				starttimestamp: '2024-01-02T00:00:00Z',
			},
			diffBase: { revisionId: 100 },
			commentCode: ':: Thanks. ~~~~\n',
			isIndented: true,
		})
	})

	test('replies in a section', async () => {
		const { topic } = makePage()

		expect(
			await buildEdit(makeValues('replyInSection', { comment: 'Thanks.' }), topic, 'submit'),
		).toEqual({
			api: 'edit',
			params: {
				text: topicCode + ': Thanks. ~~~~\n',
				section: '1',
				baserevid: 200,
				starttimestamp: '2024-01-03T00:00:00Z',
			},
			diffBase: { code: topicCode },
			commentCode: ': Thanks. ~~~~\n',
			isIndented: true,
		})
	})

	test('edits a comment', async () => {
		const { bob } = makePage()

		const edit = await buildEdit(makeValues('edit', { comment: 'Edited.' }), bob, 'submit')

		expect(edit.api === 'edit' && edit.params.text).toBe(
			topicCode.replace('Reply text.', 'Edited.'),
		)
	})

	test("edits an opening comment's heading", async () => {
		const { alice } = makePage()

		const edit = await buildEdit(
			makeValues('edit', { comment: 'Opening edited.', headline: 'Renamed' }),
			alice,
			'submit',
		)

		expect(edit.api === 'edit' && edit.params.text).toBe(
			topicCode.replace('== Topic ==', '== Renamed ==').replace('Opening text.', 'Opening edited.'),
		)
	})

	test('deletes a comment', async () => {
		const { bob } = makePage()

		const edit = await buildEdit(
			makeValues('edit', { comment: 'Reply text.', delete: true }),
			bob,
			'submit',
		)

		expect(edit.api === 'edit' && edit.params.text).toBe(
			topicCode.replace(/^: Reply text\..*\n/m, ''),
		)
	})

	test('deletes the section with an opening comment that has no replies', async () => {
		const { carol } = makePage({ hasLiveSectionNumber: false })

		const edit = await buildEdit(
			makeValues('edit', { comment: 'Other text.', headline: 'Other', delete: true }),
			carol,
			'submit',
		)

		expect(edit.api === 'edit' && edit.params.text).toBe('Intro.\n\n' + topicCode + '\n')
	})

	test('adds a subsection', async () => {
		const { topic } = makePage()

		const edit = await buildEdit(
			makeValues('addSubsection', { comment: 'Sub text.', headline: 'Sub' }),
			topic,
			'submit',
		)

		expect(edit.api === 'edit' && edit.params.text).toBe(
			topicCode + '\n=== Sub ===\nSub text. ~~~~\n\n',
		)
	})

	describe('adds a topic', () => {
		test('through the new-section API', async () => {
			const { page } = makePage()

			expect(
				await buildEdit(
					makeValues('addSection', { comment: 'Topic text.', headline: ' New topic ' }),
					page,
					'submit',
				),
			).toEqual({
				api: 'edit',
				params: { text: 'Topic text. ~~~~\n', section: 'new', sectiontitle: 'New topic' },
				diffBase: { code: '' },
				commentCode: 'Topic text. ~~~~\n',
				isIndented: false,
			})
			expect(page.loadCode).not.toHaveBeenCalled()
		})

		test('with its heading for "View changes" through the new-section API', async () => {
			const { page } = makePage()

			const edit = await buildEdit(
				makeValues('addSection', { comment: 'Topic text.', headline: 'New topic' }),
				page,
				'viewChanges',
			)

			expect(edit.api === 'edit' && edit.params.text).toBe(
				'== New topic ==\n\nTopic text. ~~~~\n',
			)
		})

		test('appended to the page code when it has no headline', async () => {
			const { page } = makePage()

			expect(
				await buildEdit(
					makeValues('addSection', { comment: 'Topic text.', headline: '' }),
					page,
					'submit',
				),
			).toEqual({
				api: 'edit',
				params: {
					text: pageCode + '\nTopic text. ~~~~\n',
					baserevid: 100,
					starttimestamp: '2024-01-02T00:00:00Z',
				},
				diffBase: { revisionId: 100 },
				commentCode: 'Topic text. ~~~~\n',
				isIndented: false,
			})
		})

		test('on top', async () => {
			const { page } = makePage()

			const edit = await buildEdit(
				makeValues('addSection', {
					comment: 'Topic text.',
					headline: 'New topic',
					newTopicOnTop: true,
				}),
				page,
				'submit',
			)

			expect(edit.api === 'edit' && edit.params.text).toBe(
				'Intro.\n\n== New topic ==\n\nTopic text. ~~~~\n\n' + topicCode + '\n' + otherCode,
			)
		})

		test('creating the page when it does not exist', async () => {
			const { page } = makePage({ pageExists: false })

			expect(
				await buildEdit(
					makeValues('addSection', { comment: 'Topic text.', headline: '' }),
					page,
					'submit',
				),
			).toEqual({
				api: 'edit',
				params: { text: 'Topic text. ~~~~\n', starttimestamp: '2024-01-02T00:00:00Z' },
				diffBase: { code: '' },
				commentCode: 'Topic text. ~~~~\n',
				isIndented: false,
			})
		})

		test('with comment links appended to the page code, adding anchors to the linked comments', async () => {
			const { page, alice } = makePage()
			vi.spyOn(commentManager, 'getById').mockReturnValue(alice)

			const edit = await buildEdit(
				makeValues('addSection', {
					comment: 'See [[#202401011000_Alice]].',
					headline: 'New topic',
				}),
				page,
				'submit',
			)

			expect(edit).toEqual({
				api: 'edit',
				params: {
					text:
						pageCode.replace(
							'Opening text.',
							'<span id="202401011000_Alice"></span>Opening text.',
						) + '\n== New topic ==\n\nSee [[#202401011000_Alice]]. ~~~~\n',
					baserevid: 100,
					starttimestamp: '2024-01-02T00:00:00Z',
				},
				diffBase: { revisionId: 100 },
				commentCode: '== New topic ==\n\nSee [[#202401011000_Alice]]. ~~~~\n',
				isIndented: false,
			})
			expect(commentManager.getById).toHaveBeenCalledWith('202401011000_Alice')
		})
	})

	test("throws when the target isn't in the context code", async () => {
		const { bob } = makePage({ hasLiveSectionNumber: false, loadedPageCode: 'Intro.\n' })

		const error = await rejection(
			buildEdit(makeValues('reply', { comment: 'Thanks.' }), bob, 'submit'),
		)

		expect(error.getCode()).toBe('locateComment')
		expect(error.getMessage()).toBe('cf-error-getpagecode')
	})

	test("throws when a linked comment isn't on the page", async () => {
		const { bob } = makePage()
		vi.spyOn(commentManager, 'getById').mockReturnValue(undefined)

		const error = await rejection(
			buildEdit(makeValues('reply', { comment: 'See [[#202401011000_Dave]].' }), bob, 'submit'),
		)

		expect(error.getCode()).toBe('commentLinks-commentNotFound')
		expect(error.getDetails()).toEqual({ id: '202401011000_Dave' })
	})

	test('replies through the DiscussionTools API to a comment it can only locate', async () => {
		const { bob } = makePage({ hasLiveSectionNumber: false, loadedPageCode: 'Intro.\n' })
		bob.dtId = 'c-Bob-20240101110000'
		const get = vi.fn(async () => ({
			discussiontoolspageinfo: { transcludedfrom: { [/** @type {string} */ (bob.dtId)]: false } },
		}))
		cd.getApi = /** @type {any} */ (() => ({ get }))

		expect(
			await buildEdit(makeValues('reply', { comment: ' Thanks. ' }), bob, 'submit'),
		).toEqual({
			api: 'discussiontoolsedit',
			params: {
				paction: 'addcomment',
				page: 'Talk:Test',
				commentid: 'c-Bob-20240101110000',
				wikitext: ' Thanks. ',
			},
		})
	})

	test('applies the actual level the user accepted for a comment with broken indentation', async () => {
		const brokenTopicCode = topicCode.replace(': Reply text.', ':: Reply text.')
		const { bob } = makePage({ sectionCode: brokenTopicCode })
		bob.level = 0
		const values = makeValues('edit', { comment: 'Edited.' })

		const edit = await buildEdit({ ...values, actualCommentLevel: 2 }, bob, 'submit')

		expect(edit.api === 'edit' && edit.params.text).toBe(
			brokenTopicCode.replace('Reply text.', 'Edited.'),
		)
		const editWithoutLevel = await buildEdit(values, bob, 'submit')
		expect(editWithoutLevel.api === 'edit' && editWithoutLevel.params.text).not.toBe(
			brokenTopicCode.replace('Reply text.', 'Edited.'),
		)
	})
})
