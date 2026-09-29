import { afterEach, describe, expect, it, vi } from 'vitest'

const cdMock = vi.hoisted(() => ({
	g: { msInMin: 60_000, phpCharToUpper: {} },
	debug: { logWarn: () => {} },
	s: (/** @type {string} */ key, /** @type {string[]} */ ...args) =>
		key === 'ellipsis' ? '…' : [key, ...args].join('|'),
	mws: (/** @type {string} */ key) =>
		/** @type {{ [key: string]: string }} */ ({
			'word-separator': ' ',
			'colon-separator': ': ',
			'comma-separator': ', ',
		})[key],
}))

vi.mock('../src/loader/cd', () => ({ default: cdMock }))
vi.mock('../src/shared/cd', () => ({ default: cdMock }))

import CommentLinksAutocomplete from '../src/CommentLinksAutocomplete'

/**
 * @param {{ urlFragment?: string, author?: string, timestamp?: string, text?: string }} options
 * @returns {any}
 */
const createComment = ({ urlFragment = 'c-Author-20250101000000', author = 'Author', timestamp, text = 'Hi' }) => ({
	getUrlFragment: () => urlFragment,
	author: { getName: () => author },
	timestamp,
	getText: () => text,
})

/** @type {CommentLinksAutocomplete[]} */
let instances = []

/**
 * @param {{ comments?: any[], sections?: any[] }} data
 * @returns {CommentLinksAutocomplete}
 */
const create = (data) => {
	const autocomplete = new CommentLinksAutocomplete({ data })
	instances.push(autocomplete)

	return autocomplete
}

afterEach(() => {
	instances.forEach((autocomplete) => {
		autocomplete.destroy()
	})
	instances = []
})

describe('CommentLinksAutocomplete entries', () => {
	it('labels comments with author, timestamp, and text, and skips comments without a URL fragment', () => {
		const autocomplete = create({
			comments: [
				createComment({ timestamp: '12:00, 1 January 2025', text: 'Hello' }),
				createComment({ urlFragment: '', text: 'Ghost' }),
				createComment({ urlFragment: 'c-B', author: 'B', text: 'No date' }),
			],
		})

		expect(autocomplete.getDefaultEntries().map((entry) => entry.label)).toEqual([
			'Author, 12:00, 1 January 2025: Hello',
			'B: No date',
		])
	})

	it('lists sections after comments, with underscores in IDs turned into spaces', () => {
		const autocomplete = create({
			comments: [createComment({})],
			sections: [{ id: 'Some_section', headline: 'Some section' }],
		})

		expect(autocomplete.getDefaultEntries()[1]).toEqual({
			label: 'Some section',
			urlFragment: 'Some section',
			headline: 'Some section',
		})
	})

	const word = 'word '
	const longText = word.repeat(20)

	it('truncates long comment text at a word boundary with a tight ellipsis after a letter', () => {
		const label = create({ comments: [createComment({ text: longText })] }).getDefaultEntries()[0].label

		expect(label).toBe(`Author: ${word.repeat(16).trim()}…`)
	})

	it('separates the ellipsis with a space after punctuation', () => {
		const label = create({ comments: [createComment({ text: 'word, '.repeat(20) })] }).getDefaultEntries()[0]
			.label

		expect(label).toMatch(/word, …$/)
	})
})

describe('CommentLinksAutocomplete.getInsertionFromEntry', () => {
	const autocomplete = create({})

	it('links to a comment with an author-and-date text', () => {
		expect(
			autocomplete.getInsertionFromEntry({
				label: '',
				urlFragment: 'c-A-1',
				authorName: 'A',
				timestamp: '12:00',
			}),
		).toEqual({
			start: '[[#c-A-1|',
			end: ']]',
			content: 'cf-autocomplete-commentlinks-text|A|12:00',
		})
	})

	it('links to a section with its headline as the text', () => {
		expect(
			autocomplete.getInsertionFromEntry({ label: 'Foo bar', urlFragment: 'Foo bar', headline: 'Foo bar' }).content,
		).toBe('Foo bar')
	})

	it('uses the selected text as the link text', () => {
		expect(
			autocomplete.getInsertionFromEntry({ label: 'Foo', urlFragment: 'Foo', headline: 'Foo' }, 'see here')
				.content,
		).toBe('see here')
	})
})

it('searches entries by label anywhere, case-insensitively', async () => {
	const autocomplete = create({
		comments: [createComment({ author: 'Alice', text: 'About cats' })],
		sections: [{ id: 'Dogs', headline: 'Dogs' }],
	})
	/** @type {string[]} */
	let labels = []
	await autocomplete.getValues('CATS', (options) => {
		labels = options.map((option) => option.label)
	})

	expect(labels).toEqual(['Alice: About cats'])
})

it.each([
	['Some section', true],
	...[...'#<>[]|{}'].map((char) => [`Foo${char}`, false]),
])('validates %j as %s', (text, expected) => {
	expect(create({}).validateInput(/** @type {string} */ (text))).toBe(expected)
})

it('keeps existing closing brackets after the caret', () => {
	const { keepAsEnd } = create({}).getCollectionProperties()

	expect(keepAsEnd?.test(']]')).toBe(true)
	expect(keepAsEnd?.test(']')).toBe(false)
})
