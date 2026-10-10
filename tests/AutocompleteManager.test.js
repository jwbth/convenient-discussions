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
import WikilinksAutocomplete from '../src/WikilinksAutocomplete'

const wikilinks = new WikilinksAutocomplete()

describe('AutocompleteManager.onOptionChoose', () => {
	const event = /** @type {any} */ ({ key: 'Enter' })
	const context = { triggerText: '[[', query: '', mentionPosition: 2, triggerPos: 2 }

	/**
	 * Make a manager whose menu is attached to the second of its inputs.
	 *
	 * @param {string} text The text of the input the menu is attached to.
	 * @param {any[]} [savedSelections]
	 */
	function makeManager(text, savedSelections) {
		/** @param {any} element */
		const makeInput = (element) => ({
			getEditableElement: () => [element],
			getSelectionRanges: () => [],
			getAutocompleteSavedSelection: () => savedSelections,
		})
		const element = { value: text }
		const input = makeInput(element)
		const manager = new AutocompleteManager({
			types: [],
			inputs: /** @type {any} */ ([makeInput({ value: '' }), input]),
		})
		manager.tribute.current = /** @type {any} */ ({ element })

		return { manager, input }
	}

	const makeOption = () => {
		const autocomplete = Object.assign(Object.create(wikilinks), { afterOptionChoose: vi.fn() })

		return /** @type {any} */ ({
			original: {
				entry: {
					title: { getNamespaceId: () => 0, getMainText: () => 'Main Page' },
					pageName: 'Main Page',
				},
				autocomplete,
			},
		})
	}

	it('returns no replacements without an option', () => {
		expect(makeManager('a [[').manager.onOptionChoose(undefined, event, context)).toEqual([])
	})

	it('replaces the trigger text with the insertion and calls the after-choice hook', () => {
		const { manager, input } = makeManager('a [[')
		const option = makeOption()

		expect(manager.onOptionChoose(option, event, context)).toEqual([
			{ from: 2, to: 4, insert: '[[Main Page]]', selection: undefined },
		])
		expect(option.original.autocomplete.afterOptionChoose).toHaveBeenCalledWith(
			option,
			event,
			input,
		)
	})

	it("wraps the saved selection of the input the menu is attached to", () => {
		const { manager } = makeManager('a [[', [
			{ selectedText: 'foo', start: 2, leadingSpaces: '', trailingSpaces: '' },
		])

		expect(manager.onOptionChoose(makeOption(), event, context)).toEqual([
			{ from: 2, to: 4, insert: '[[Main Page|foo]]', selection: undefined },
		])
	})
})
