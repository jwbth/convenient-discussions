import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/utils-window', () => ({
	interlanguagePrefixes: new Set(),
	allowedTags: [],
}))
vi.mock('../src/loader/cd', () => ({
	default: { settings: { get: () => [] }, g: {} },
}))
vi.mock('../src/tribute/Tribute', () => ({
	default: class MockTribute {
		current = {}
	},
}))

import AutocompleteManager from '../src/AutocompleteManager'
import TagsAutocomplete from '../src/TagsAutocomplete'
import WikilinksAutocomplete from '../src/WikilinksAutocomplete'

const wikilinks = new WikilinksAutocomplete()
const tags = new TagsAutocomplete()

/**
 * @param {string} pageName A main-namespace page name.
 * @param {import('../src/autocompleteInsertion').InsertionKeys} [keys]
 */
const wikilinkInsertion = (pageName, keys) =>
	wikilinks.getInsertionFromEntry(
		/** @type {any} */ ({
			title: { getNamespaceId: () => 0, getMainText: () => pageName },
			pageName,
		}),
		keys,
	)

/**
 * @param {import('../src/TagsAutocomplete').TagEntry} entry
 * @param {import('../src/autocompleteInsertion').InsertionKeys} [keys]
 */
const tagInsertion = (entry, keys) => tags.getInsertionFromEntry(entry, keys)

describe('AutocompleteManager insertion', () => {
	/** @type {AutocompleteManager} */
	let manager

	beforeEach(() => {
		manager = new AutocompleteManager({ types: [], inputs: [] })
	})

	/**
	 * @param {object} options
	 * @param {any[]} [options.savedSelections]
	 * @param {number} [options.triggerPos]
	 * @param {boolean} [options.allowNesting]
	 * @param {string} [options.trigger]
	 * @param {(entry: any, keys?: import('../src/autocompleteInsertion').InsertionKeys) => any} [options.getInsertionFromEntry]
	 * @param {any} [options.entry]
	 * @param {string} [options.text] The input's text.
	 */
	function makeOption({
		savedSelections,
		triggerPos = 2,
		allowNesting = false,
		trigger = '[[',
		getInsertionFromEntry = wikilinkInsertion,
		entry = 'Main Page',
		text = '',
	}) {
		manager.tribute.current = /** @type {any} */ ({
			triggerPos,
			collection: { allowNesting, replaceEnd: true },
			element: {
				value: text,
				cdInput: {
					getAutocompleteSavedSelection: () => savedSelections,
					getSelectionRanges: () => [],
				},
			},
		})

		return /** @type {any} */ ({
			original: {
				entry,
				autocomplete: {
					manager,
					getTrigger: () => trigger,
					getInsertionFromEntry,
					afterOptionChoose: vi.fn(),
				},
			},
		})
	}

	const selection = (selectedText = 'foo', start = 2) => ({
		selectedText,
		start,
		leadingSpaces: '',
		trailingSpaces: '',
	})

	describe('getSelectedTextForInsertion', () => {
		it('returns the selected text when the selection starts at the trigger', () => {
			const selections = [selection()]

			expect(
				manager.getSelectedTextForInsertion(makeOption({ savedSelections: selections })),
			).toEqual({ selectedText: 'foo', selections })
		})

		it('returns nothing without saved selections', () => {
			expect(manager.getSelectedTextForInsertion(makeOption({}))).toBeUndefined()
			expect(
				manager.getSelectedTextForInsertion(makeOption({ savedSelections: [] })),
			).toBeUndefined()
		})

		it('returns nothing when the selection does not start at the trigger', () => {
			expect(
				manager.getSelectedTextForInsertion(
					makeOption({ savedSelections: [selection('foo', 5)] }),
				),
			).toBeUndefined()
		})

		it('skips the start check for multiple selections', () => {
			const selections = [selection('a', 10), selection('b', 20)]

			expect(
				manager.getSelectedTextForInsertion(makeOption({ savedSelections: selections })),
			).toEqual({ selectedText: 'a', selections })
		})

		it('returns nothing when the selection contains the trigger and nesting is not allowed', () => {
			expect(
				manager.getSelectedTextForInsertion(
					makeOption({ savedSelections: [selection('a [[b]]')] }),
				),
			).toBeUndefined()
		})

		it('returns nothing when any of multiple selections contains the trigger', () => {
			expect(
				manager.getSelectedTextForInsertion(
					makeOption({ savedSelections: [selection('a', 1), selection('[[b]]', 9)] }),
				),
			).toBeUndefined()
		})

		it('allows the trigger inside the selection with allowNesting', () => {
			expect(
				manager.getSelectedTextForInsertion(
					makeOption({
						savedSelections: [selection('<b>x</b>')],
						trigger: '<',
						allowNesting: true,
						getInsertionFromEntry: tagInsertion,
						entry: 'small',
					}),
				)?.selectedText,
			).toBe('<b>x</b>')
		})

		it('returns nothing when the insertion has no end', () => {
			expect(
				manager.getSelectedTextForInsertion(
					makeOption({
						savedSelections: [selection()],
						trigger: '<',
						getInsertionFromEntry: tagInsertion,
						entry: ['references', '<references />', ''],
					}),
				),
			).toBeUndefined()
		})
	})

	describe('onOptionChoose', () => {
		const event = /** @type {any} */ ({ key: 'Enter' })

		it('returns no replacements without an option', () => {
			expect(
				manager.onOptionChoose(undefined, event, {
					triggerText: '[[',
					query: '',
					mentionPosition: 0,
				}),
			).toEqual([])
		})

		it('replaces the trigger text with the insertion and calls the after-choice hook', () => {
			const option = makeOption({ text: 'a [[Ma' })

			expect(
				manager.onOptionChoose(option, event, {
					triggerText: '[[',
					query: 'Ma',
					mentionPosition: 2,
				}),
			).toEqual([{ from: 2, to: 6, insert: '[[Main Page]]', selection: undefined }])
			expect(option.original.autocomplete.afterOptionChoose).toHaveBeenCalledWith(
				option,
				event,
				manager.tribute.current.element?.cdInput,
			)
		})

		it('wraps the saved selection', () => {
			expect(
				manager.onOptionChoose(
					makeOption({ savedSelections: [selection()], text: 'a [[' }),
					event,
					{ triggerText: '[[', query: '', mentionPosition: 2 },
				),
			).toEqual([{ from: 2, to: 4, insert: '[[Main Page|foo]]', selection: undefined }])
		})
	})
})
