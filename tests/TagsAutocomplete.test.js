import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cdMock = vi.hoisted(() => ({
	g: { msInMin: 60_000, phpCharToUpper: {} },
	debug: { logWarn: () => {} },
	s: (/** @type {string} */ key) => key,
}))

vi.mock('../src/loader/cd', () => ({ default: cdMock }))
vi.mock('../src/shared/cd', () => ({ default: cdMock }))
vi.mock('../src/utils-window', () => ({
	allowedTags: ['b', 'br', 'code', 'gallery', 'references', 'syntaxhighlight', 'u'],
}))

import TagsAutocomplete from '../src/TagsAutocomplete'

/** @type {TagsAutocomplete} */
let autocomplete

beforeEach(() => {
	autocomplete = new TagsAutocomplete()
})

afterEach(() => {
	autocomplete.destroy()
})

/**
 * @param {string} text
 * @returns {Promise<string[]>} Labels passed to the callback.
 */
const getLabels = async (text) => {
	/** @type {string[]} */
	let labels = []
	await autocomplete.getValues(text, (options) => {
		labels = options.map((option) => option.label)
	})

	return labels
}

describe('TagsAutocomplete default entries', () => {
	it('replaces allowed tags that have custom markup with that markup, sorted by label', () => {
		const entries = autocomplete.getDefaultEntries()
		const labels = entries.map((entry) => autocomplete.getLabelFromEntry(entry))

		expect(labels).toEqual([...labels].sort())
		expect(labels.filter((label) => label === 'br')).toHaveLength(1)
		expect(entries).toContainEqual(['br', '<br>'])
		expect(entries).toContain('b')
		expect(labels).toContain('codenowiki')
	})
})

describe('TagsAutocomplete.getInsertionFromEntry', () => {
	it('wraps a plain tag around the caret and asks to select the content', () => {
		expect(autocomplete.getInsertionFromEntry('b')).toEqual({
			start: '<b>',
			end: '</b>',
			content: undefined,
			selectContent: true,
		})
	})

	it('wraps a plain tag around the selected text without selecting it', () => {
		expect(autocomplete.getInsertionFromEntry('b', 'bold')).toEqual({
			start: '<b>',
			end: '</b>',
			content: 'bold',
			selectContent: false,
		})
	})

	it('has no end for a self-closing tag', () => {
		expect(autocomplete.getInsertionFromEntry(['br', '<br>']).end).toBeUndefined()
	})

	it('uses custom start and end markup', () => {
		const entry = autocomplete.getDefaultEntries().find((item) => item[0] === 'gallery')

		expect(autocomplete.getInsertionFromEntry(/** @type {any} */ (entry), 'File:A.png')).toMatchObject({
			start: '<gallery>\n',
			end: '\n</gallery>',
			content: 'File:A.png',
		})
	})
})

describe('TagsAutocomplete search', () => {
	it('matches tags by label prefix, case-insensitively, including custom-markup variants', async () => {
		expect(await getLabels('SYN')).toEqual([
			'syntaxhighlight',
			'syntaxhighlight inline lang=""',
			'syntaxhighlight lang=""',
		])
	})

	it('does not match in the middle of a label', async () => {
		expect(await getLabels('ode')).toEqual([])
	})

	it('treats regexp special characters in the query literally', async () => {
		expect(await getLabels('.')).toEqual([])
	})
})

it.each([
	['b', true],
	['Syntax', true],
	['', false],
	['b c', false],
])('validates %j as %s', (text, expected) => {
	expect(autocomplete.validateInput(text)).toBe(expected)
})

it('keeps an existing ">" after the caret, keeps the rest of the text, and allows nesting', () => {
	const { keepAsEnd, replaceEnd, allowNesting } = autocomplete.getCollectionProperties()

	expect(keepAsEnd?.test('>')).toBe(true)
	expect(keepAsEnd?.test('a>')).toBe(false)
	expect(replaceEnd).toBe(false)
	expect(allowNesting).toBe(true)
})
