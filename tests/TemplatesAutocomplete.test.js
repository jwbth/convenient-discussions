import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cdMock = vi.hoisted(() => ({
	g: { msInMin: 60_000, phpCharToUpper: {} },
	debug: { logWarn: () => {} },
	s: (/** @type {string} */ key) => key,
	mws: (/** @type {string} */ key) => (key === 'word-separator' ? ' ' : key),
	getApi: vi.fn(),
}))

vi.mock('../src/loader/cd', () => ({ default: cdMock }))
vi.mock('../src/shared/cd', () => ({ default: cdMock }))
vi.mock('../src/utils-api', () => ({
	handleApiReject: (/** @type {unknown} */ error) => {
		throw error
	},
}))

import BaseAutocomplete from '../src/BaseAutocomplete'
import TemplatesAutocomplete from '../src/TemplatesAutocomplete'

/** @type {TemplatesAutocomplete} */
let autocomplete

beforeEach(() => {
	autocomplete = new TemplatesAutocomplete()
})

afterEach(() => {
	autocomplete.destroy()
	vi.restoreAllMocks()
})

describe('TemplatesAutocomplete.getInsertionFromEntry', () => {
	it('wraps the trimmed name in braces', () => {
		expect(autocomplete.getInsertionFromEntry(' Foo ')).toMatchObject({
			start: '{{Foo',
			end: '}}',
			content: undefined,
		})
	})

	it('puts the selected text inside the template', () => {
		expect(autocomplete.getInsertionFromEntry('Foo', 'bar')).toMatchObject({
			start: '{{Foo',
			end: '}}',
			content: 'bar',
		})
	})

	it('adds a pipe after the name on Shift', () => {
		const insertion = autocomplete.getInsertionFromEntry('Foo')
		insertion.shiftModify?.()

		expect(insertion.start).toBe('{{Foo|')
	})
})

describe('TemplatesAutocomplete.validateInput', () => {
	it.each([
		['Foo', true],
		['Foo/bar', true],
		['', false],
		['a'.repeat(255), true],
		['a'.repeat(256), false],
		['a b c d e f g h i j', true],
		['a b c d e f g h i j k', false],
		...[...'#<>[]|{}'].map((char) => [`Foo${char}`, false]),
	])('%j → %s', (text, expected) => {
		expect(autocomplete.validateInput(/** @type {string} */ (text))).toBe(expected)
	})
})

describe('TemplatesAutocomplete.getCollectionProperties', () => {
	it('keeps an existing pipe or closing braces after the caret, and Tab inserts the name only', () => {
		const { keepAsEnd, tabSelectsStartOnly } = autocomplete.getCollectionProperties()

		expect(keepAsEnd?.test('|param}}')).toBe(true)
		expect(keepAsEnd?.test('}}')).toBe(true)
		expect(keepAsEnd?.test('} ')).toBe(false)
		expect(tabSelectsStartOnly).toBe(true)
	})

	describe('selectTemplate', () => {
		/**
		 * @param {{ useTemplateData?: boolean, selectedText?: string }} [options]
		 */
		const setUpManager = ({ useTemplateData = true, selectedText } = {}) => {
			const selectionData = selectedText
				? { selectedText, selections: [{ selectedText, start: 0, leadingSpaces: '', trailingSpaces: '' }] }
				: undefined
			autocomplete.manager = /** @type {any} */ ({
				useTemplateData,
				tribute: { current: { element: { cdInput: {} } } },
				getSelectedTextForInsertion: vi.fn(() => selectionData),
				applySelectionDataToInsertion: vi.fn((insertion, data) => {
					if (data) {
						insertion.autocompleteSelections = data.selections
					}
				}),
			})
		}

		const option = /** @type {any} */ ({ original: { entry: 'Foo', label: 'Foo' } })

		beforeEach(() => {
			vi.useFakeTimers()
		})

		afterEach(() => {
			vi.useRealTimers()
		})

		it('returns an empty string when there is no option', () => {
			const { selectTemplate } = autocomplete.getCollectionProperties()

			expect(selectTemplate?.(undefined, /** @type {any} */ ({}))).toBe('')
		})

		it('builds the insertion around the saved selection', () => {
			setUpManager({ selectedText: 'bar' })
			const { selectTemplate } = autocomplete.getCollectionProperties()
			const insertion = /** @type {any} */ (selectTemplate?.(option, /** @type {any} */ ({ shiftKey: false })))

			expect(insertion).toMatchObject({ start: '{{Foo', end: '}}', content: 'bar' })
			expect(insertion.autocompleteSelections).toHaveLength(1)
		})

		it.each([
			[{ shiftKey: true, altKey: false }, true, true],
			[{ shiftKey: true, altKey: true }, true, false],
			[{ shiftKey: false, altKey: false }, true, false],
			[{ shiftKey: true, altKey: false }, false, false],
		])('with keys %j and useTemplateData=%s, inserts TemplateData: %s', (event, useTemplateData, expected) => {
			setUpManager({ useTemplateData })
			const insertTemplateData = vi.spyOn(autocomplete, 'insertTemplateData').mockResolvedValue()
			autocomplete.getCollectionProperties().selectTemplate?.(option, /** @type {any} */ (event))
			vi.runAllTimers()

			expect(insertTemplateData).toHaveBeenCalledTimes(expected ? 1 : 0)
		})
	})
})

describe('TemplatesAutocomplete.makeApiRequest', () => {
	/**
	 * @param {string[]} titles
	 * @returns {import('vitest').MockInstance}
	 */
	const mockSearch = (titles) =>
		vi.spyOn(BaseAutocomplete, 'makeTitleSearchRequest').mockResolvedValue({
			pages: titles.map((title, id) => ({ id, key: '', title })),
		})

	beforeEach(() => {
		mw.config.set('wgFormattedNamespaces', { 10: 'Template' })
		mw.config.set('wgCaseSensitiveNamespaces', [])
	})

	it('searches the Template namespace, strips the prefix, and keeps the typed first-letter case', async () => {
		const search = mockSearch(['Template:Foo bar', 'Template:Foo/doc', 'Template:Foo/documentation', 'Template:Foo/styles.css'])

		expect(await autocomplete.makeApiRequest('foo')).toEqual(['foo bar'])
		expect(search).toHaveBeenCalledWith('Template:foo')
	})

	it('keeps the first-letter case of results in a case-sensitive Template namespace', async () => {
		mw.config.set('wgCaseSensitiveNamespaces', [10])
		mockSearch(['Template:Foo'])

		expect(await autocomplete.makeApiRequest('foo')).toEqual(['Foo'])
	})

	it('treats an explicit Template: prefix as implicit', async () => {
		const search = mockSearch(['Template:Foo'])

		expect(await autocomplete.makeApiRequest('Template:Foo')).toEqual(['Foo'])
		expect(search).toHaveBeenCalledWith('Template:Foo')
	})

	it('keeps other namespace prefixes', async () => {
		const search = mockSearch(['User:Foo/sig'])

		expect(await autocomplete.makeApiRequest('User:Foo')).toEqual(['User:Foo/sig'])
		expect(search).toHaveBeenCalledWith('User:Foo')
	})

	it('searches the main namespace for a leading colon and keeps the colon', async () => {
		const search = mockSearch(['Foo'])

		expect(await autocomplete.makeApiRequest(':Foo')).toEqual([':Foo'])
		expect(search).toHaveBeenCalledWith('Foo')
	})
})

describe('TemplatesAutocomplete.insertTemplateData', () => {
	/**
	 * @param {number} caret Caret position after the insertion
	 */
	const createInput = (caret = 100) => {
		/** @type {any} */
		const input = {}
		;['setDisabled', 'pushPending', 'popPending', 'focus', 'insertContent', 'selectRange'].forEach(
			(method) => {
				input[method] = vi.fn(() => input)
			},
		)
		input.getRange = () => ({ to: caret })

		return input
	}

	/**
	 * @param {any} response
	 */
	const mockApi = (response) => {
		const get = vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)))
		cdMock.getApi.mockReturnValue({ get })

		return get
	}

	/**
	 * @param {string} label
	 * @returns {any}
	 */
	const option = (label) => ({ original: { label, entry: label } })

	it('inserts required and suggested inline parameters and selects the first value slot', async () => {
		const get = mockApi({
			pages: {
				1: {
					paramOrder: ['1', 'name', 'opt', 'date'],
					params: {
						1: { required: true },
						name: { suggested: true },
						opt: {},
						date: { required: true },
					},
				},
			},
		})
		const input = createInput(100)
		await autocomplete.insertTemplateData(option('Foo'), input)

		expect(get).toHaveBeenCalledWith(expect.objectContaining({ action: 'templatedata', titles: 'Template:Foo' }))
		expect(input.insertContent).toHaveBeenCalledWith('|name=|date=')
		expect(input.selectRange).toHaveBeenCalledWith(100 - '|name=|date='.length)
		expect(input.popPending).toHaveBeenCalled()
	})

	it('selects the value slot of the first named parameter', async () => {
		mockApi({ pages: { 1: { params: { name: { required: true } } } } })
		const input = createInput(100)
		await autocomplete.insertTemplateData(option('Foo'), input)

		expect(input.insertContent).toHaveBeenCalledWith('name=')
		expect(input.selectRange).toHaveBeenCalledWith(100)
	})

	it.fails('does not produce an empty positional parameter ("||") in block format (slice(1) strips "\\n", not "|")', async () => {
		mockApi({
			pages: { 1: { format: 'block', params: { a: { required: true }, b: { suggested: true } } } },
		})
		const input = createInput()
		await autocomplete.insertTemplateData(option('Foo'), input)

		expect(input.insertContent.mock.calls[0][0]).not.toMatch(/^\|/)
	})

	it.fails('requests TemplateData for the page itself when the entry has an explicit namespace', async () => {
		const get = mockApi({ pages: { 1: { params: {} } } })
		await autocomplete.insertTemplateData(option('User:Foo/sig'), createInput())

		expect(get).toHaveBeenCalledWith(expect.objectContaining({ titles: 'User:Foo/sig' }))
	})

	it.each([
		['the template is missing', { pages: {} }],
		['the request fails', new Error('network')],
	])('re-enables the input without inserting anything when %s', async (_description, response) => {
		mockApi(response)
		const input = createInput()
		await autocomplete.insertTemplateData(option('Foo'), input)

		expect(input.insertContent).not.toHaveBeenCalled()
		expect(input.setDisabled).toHaveBeenLastCalledWith(false)
		expect(input.focus).toHaveBeenCalled()
		expect(input.popPending).toHaveBeenCalled()
	})
})
