import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../src/utils-window', () => ({
	inputPropsAffectingCoords: [],
	interlanguagePrefixes: new Set(),
	allowedTags: [],
}))
vi.mock('../src/AutocompleteFactory', () => ({ default: { create: vi.fn() } }))
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
import TemplatesAutocomplete from '../src/TemplatesAutocomplete'
import WikilinksAutocomplete from '../src/WikilinksAutocomplete'
import TributeRange from '../src/tribute/TributeRange'

const { default: Tribute } = /** @type {typeof import('../src/tribute/Tribute')} */ (
	await vi.importActual('../src/tribute/Tribute')
)

const wikilinks = new WikilinksAutocomplete()
const templates = new TemplatesAutocomplete()
const tags = new TagsAutocomplete()

// Skips `mw.util.addCSS`, which the test environment lacks.
Tribute.cssInjected = true

// Collections as Tribute normalizes the autocompletes' `getCollectionProperties()`.
const [wikilinksCollection, templatesCollection, tagsCollection] = new Tribute({
	collection: [wikilinks, templates, tags].map(
		(autocomplete) =>
			/** @type {import('../src/tribute/Tribute').TributeCollection} */ (
				autocomplete.getCollectionProperties()
			),
	),
}).collection

/**
 * @param {string} pageName A main-namespace page name.
 * @param {string} [selectedText]
 */
const wikilinkInsertion = (pageName, selectedText) =>
	wikilinks.getInsertionFromEntry(
		/** @type {any} */ ({
			title: { getNamespaceId: () => 0, getMainText: () => pageName },
			pageName,
		}),
		selectedText,
	)

/**
 * @param {string} name
 * @param {string} [selectedText]
 */
const templateInsertion = (name, selectedText) => templates.getInsertionFromEntry(name, selectedText)

/**
 * @param {import('../src/TagsAutocomplete').TagEntry} entry
 * @param {string} [selectedText]
 */
const tagInsertion = (entry, selectedText) => tags.getInsertionFromEntry(entry, selectedText)

/**
 * Run `prepareTriggerTextReplacement` for a caret placed right after `before` in `before + after`,
 * with `trigger + mentionText` being the tail of `before`, and apply the result.
 *
 * @param {object} options
 * @param {string} options.before
 * @param {string} [options.after]
 * @param {string} options.trigger
 * @param {object} options.data Normalized as `replaceTriggerText` does: `end` and `content` are strings.
 * @param {object} [options.collection]
 * @param {object} [options.event]
 * @param {boolean} [options.isTab]
 * @param {string} [options.textSuffix]
 * @param {object} [options.autocompleteSelection]
 */
function prepare({
	before,
	after = '',
	trigger,
	data,
	collection = {},
	event = {},
	isTab = false,
	textSuffix = '',
	autocompleteSelection,
}) {
	const value = before + after
	const mentionPosition = before.lastIndexOf(trigger)
	const info = {
		mentionTriggerChar: trigger,
		mentionText: before.slice(mentionPosition + trigger.length),
		mentionPosition,
	}
	const replacement = TributeRange.prototype.prepareTriggerTextReplacement(
		{ from: before.length, to: before.length },
		info,
		{ content: '', end: '', ...data },
		{ collection },
		event,
		isTab,
		value,
		textSuffix,
		autocompleteSelection,
	)

	return {
		replacement,
		result:
			replacement &&
			value.slice(0, replacement.from) + replacement.insert + value.slice(replacement.to),
		selected:
			replacement?.selection &&
			replacement.insert.slice(replacement.selection.from, replacement.selection.to),
	}
}

describe('TributeRange#prepareTriggerTextReplacement', () => {
	it('replaces the trigger text with start + content + end + suffix', () => {
		const { replacement, result } = prepare({
			before: 'Hi @Us',
			after: ' there',
			trigger: '@',
			data: { start: '[[User:', content: 'Foo', end: ']]' },
			textSuffix: ' ',
		})

		expect(replacement).toEqual({ from: 3, to: 6, insert: '[[User:Foo]] ', selection: undefined })
		expect(result).toBe('Hi [[User:Foo]]  there')
	})

	it('returns nothing when the text before the caret is not the trigger text', () => {
		const replacement = TributeRange.prototype.prepareTriggerTextReplacement(
			{ from: 5, to: 5 },
			{ mentionTriggerChar: '[[', mentionText: 'Ma', mentionPosition: 0 },
			{ start: '[[Main', content: '', end: ']]' },
			{ collection: {} },
			{},
			false,
			'xx[[Ma',
			'',
		)

		expect(replacement).toBeUndefined()
	})

	it('returns nothing for a non-collapsed range', () => {
		const replacement = TributeRange.prototype.prepareTriggerTextReplacement(
			{ from: 2, to: 4 },
			{ mentionTriggerChar: '[[', mentionText: '', mentionPosition: 2 },
			{ start: '[[Main', content: '', end: ']]' },
			{ collection: {} },
			{},
			false,
			'ab[[',
			'',
		)

		expect(replacement).toBeUndefined()
	})

	it('returns nothing when the trigger text would start before the value', () => {
		const replacement = TributeRange.prototype.prepareTriggerTextReplacement(
			{ from: 1, to: 1 },
			{ mentionTriggerChar: '[[', mentionText: 'Ma', mentionPosition: 0 },
			{ start: '[[Main', content: '', end: ']]' },
			{ collection: {} },
			{},
			false,
			'[[Ma',
			'',
		)

		expect(replacement).toBeUndefined()
	})

	describe('wikilinks: keepAsEnd with a capture group', () => {
		const data = { start: '[[Main Page', end: ']]' }

		it('completes a new link', () => {
			expect(
				prepare({ before: '[[Main Pa', trigger: '[[', data, collection: wikilinksCollection })
					.result,
			).toBe('[[Main Page]]')
		})

		it('replaces the rest of the link target', () => {
			expect(
				prepare({
					before: '[[Main Pa',
					after: ' (old tail)]] after',
					trigger: '[[',
					data,
					collection: wikilinksCollection,
				}).result,
			).toBe('[[Main Page]] after')
		})

		it('keeps the label', () => {
			expect(
				prepare({
					before: '[[Main Pa',
					after: ' (old tail)|label]]',
					trigger: '[[',
					data,
					collection: wikilinksCollection,
				}).result,
			).toBe('[[Main Page|label]]')
		})

		it('keeps the fragment', () => {
			expect(
				prepare({
					before: '[[Main Pa',
					after: ' (old tail)#Fragment]]',
					trigger: '[[',
					data,
					collection: wikilinksCollection,
				}).result,
			).toBe('[[Main Page#Fragment]]')
		})

		it('leaves a tail over 50 characters intact', () => {
			const tail = ' and then some unrelated text that runs on for well over fifty characters'

			expect(
				prepare({
					before: '[[Main Pa',
					after: tail + ']]',
					trigger: '[[',
					data,
					collection: wikilinksCollection,
				}).result,
			).toBe(`[[Main Page]]${tail}]]`)
		})

		it('consumes a tail of exactly 50 characters', () => {
			const tail = 'x'.repeat(50)

			expect(
				prepare({
					before: '[[Main Pa',
					after: tail + ']]',
					trigger: '[[',
					data,
					collection: wikilinksCollection,
				}).result,
			).toBe('[[Main Page]]')
		})

		it('does not consume across a newline', () => {
			expect(
				prepare({
					before: '[[Main Pa',
					after: ' text\nmore]]',
					trigger: '[[',
					data,
					collection: wikilinksCollection,
				}).result,
			).toBe('[[Main Page]] text\nmore]]')
		})

		it('does not consume into another link', () => {
			expect(
				prepare({
					before: '[[Main Pa',
					after: ' see [[Other]]',
					trigger: '[[',
					data,
					collection: wikilinksCollection,
				}).result,
			).toBe('[[Main Page]] see [[Other]]')
		})

		it('with Shift, pipes the link and selects the label', () => {
			const shifted = { ...data, content: 'Main Page', start: '[[Main Page|' }
			const { result, selected, replacement } = prepare({
				before: '[[Main Pa',
				after: ' (old)]] after',
				trigger: '[[',
				data: shifted,
				collection: wikilinksCollection,
				event: { shiftKey: true },
			})

			expect(result).toBe('[[Main Page|Main Page]] after')
			expect(selected).toBe('Main Page')
			expect(replacement?.selection).toEqual({ from: 12, to: 21 })
		})
	})

	describe('templates: keepAsEnd without a capture group', () => {
		const data = { start: '{{Foo', end: '}}' }

		it('uses the whole match as the end: `}}`', () => {
			expect(
				prepare({
					before: '{{Fo',
					after: '}} text',
					trigger: '{{',
					data,
					collection: templatesCollection,
				}).result,
			).toBe('{{Foo}} text')
		})

		it('uses the whole match as the end: `|`', () => {
			expect(
				prepare({
					before: '{{Fo',
					after: '|a=1}}',
					trigger: '{{',
					data,
					collection: templatesCollection,
				}).result,
			).toBe('{{Foo|a=1}}')
		})

		it('keeps the own end when nothing matches', () => {
			expect(
				prepare({
					before: '{{Fo',
					after: 'o}}',
					trigger: '{{',
					data,
					collection: templatesCollection,
				}).result,
			).toBe('{{Foo}}o}}')
		})
	})

	describe('tags: keepAsEnd with replaceEnd: false', () => {
		it('consumes the matched text but keeps the own end', () => {
			const { result, selected, replacement } = prepare({
				before: '<di',
				after: '>',
				trigger: '<',
				data: { start: '<div>', end: '</div>', selectContent: true },
				collection: tagsCollection,
			})

			expect(result).toBe('<div></div>')
			expect(selected).toBe('')
			expect(replacement?.selection).toEqual({ from: 5, to: 5 })
		})
	})

	describe('Tab', () => {
		it('inserts start only and does not consume the tail', () => {
			const { result, replacement } = prepare({
				before: '[[Main Pa',
				after: ' (old tail)]] after',
				trigger: '[[',
				data: { start: '[[Main Page', end: '' },
				collection: wikilinksCollection,
				isTab: true,
			})

			expect(result).toBe('[[Main Page (old tail)]] after')
			expect(replacement?.selection).toBeUndefined()
		})

		it('does not select even with Shift or selectContent', () => {
			const { replacement } = prepare({
				before: '{{Fo',
				trigger: '{{',
				data: { start: '{{Foo', end: '', selectContent: true },
				collection: templatesCollection,
				event: { shiftKey: true },
				isTab: true,
			})

			expect(replacement?.selection).toBeUndefined()
		})

		it('drops a previously selected text instead of wrapping it', () => {
			const { result } = prepare({
				before: 'a [[Main Pa',
				after: 'b',
				trigger: '[[',
				data: { start: '[[Main Page', end: '' },
				collection: wikilinksCollection,
				autocompleteSelection: {
					selectedText: 'foo',
					start: 2,
					leadingSpaces: ' ',
					trailingSpaces: ' ',
				},
				isTab: true,
			})

			expect(result).toBe('a  [[Main Page b')
		})
	})

	describe('auto-closed brackets', () => {
		const data = { start: '[[Foo (bar)', end: ']]' }

		it('replaces a closer auto-inserted for the query', () => {
			expect(
				prepare({ before: '[[Foo (', after: ')', trigger: '[[', data, collection: wikilinksCollection })
					.result,
			).toBe('[[Foo (bar)]]')
		})

		it('replaces a closer auto-inserted for the query on Tab', () => {
			expect(
				prepare({
					before: '[[Foo (',
					after: ')',
					trigger: '[[',
					data: { start: '[[Foo (bar)', end: '' },
					collection: wikilinksCollection,
					isTab: true,
				}).result,
			).toBe('[[Foo (bar)')
		})

		it('replaces the closers and then the rest of the link', () => {
			expect(
				prepare({ before: '[[Foo (', after: ')]] x', trigger: '[[', data, collection: wikilinksCollection })
					.result,
			).toBe('[[Foo (bar)]] x')
		})

		it('replaces nested closers innermost first', () => {
			expect(
				prepare({
					before: '[[Foo ("',
					after: '")',
					trigger: '[[',
					data: { start: '[[Foo ("bar")', end: ']]' },
					collection: wikilinksCollection,
				}).result,
			).toBe('[[Foo ("bar")]]')
		})

		it('keeps a closer for a bracket closed in the query', () => {
			expect(
				prepare({ before: '[[Foo (b)', after: ')', trigger: '[[', data, collection: wikilinksCollection })
					.result,
			).toBe('[[Foo (bar)]])')
		})

		it('keeps a closer other than the expected one', () => {
			expect(
				prepare({ before: '[[Foo (', after: ']', trigger: '[[', data, collection: wikilinksCollection })
					.result,
			).toBe('[[Foo (bar)]]]')
		})
	})

	describe('selection', () => {
		it('selects content with selectContent when there is no content', () => {
			const { selected, replacement } = prepare({
				before: '<sm',
				trigger: '<',
				data: { start: '<small>', end: '</small>', selectContent: true },
			})

			expect(selected).toBe('')
			expect(replacement?.selection).toEqual({ from: 7, to: 7 })
		})

		it('does not select with selectContent when there is content', () => {
			const { replacement } = prepare({
				before: '<sm',
				trigger: '<',
				data: { start: '<small>', content: 'x', end: '</small>', selectContent: true },
			})

			expect(replacement?.selection).toBeUndefined()
		})

		it('selects content with Shift', () => {
			const { selected } = prepare({
				before: '{{Fo',
				trigger: '{{',
				data: { start: '{{Foo|', content: 'bar', end: '}}' },
				event: { shiftKey: true },
			})

			expect(selected).toBe('bar')
		})

		// The selection end is computed as `insert.length - end.length`, which lands inside `end`
		// when the suffix is not empty. CD uses an empty suffix, so this doesn't show there.
		it.fails('selects exactly the content with a non-empty text suffix', () => {
			const { selected } = prepare({
				before: '{{Fo',
				trigger: '{{',
				data: { start: '{{Foo|', content: 'bar', end: '}}' },
				event: { shiftKey: true },
				textSuffix: ' ',
			})

			expect(selected).toBe('bar')
		})
	})

	describe('wrapping a previously selected text', () => {
		const autocompleteSelection = {
			selectedText: 'foo',
			start: 0,
			leadingSpaces: ' ',
			trailingSpaces: '  ',
		}

		it('puts the selected text as content and the spaces outside', () => {
			expect(
				prepare({
					before: 'a [[',
					after: 'b',
					trigger: '[[',
					data: { start: '[[Main Page|', content: 'ignored', end: ']]' },
					autocompleteSelection,
				}).result,
			).toBe('a  [[Main Page|foo]]  b')
		})
	})
})

describe('TributeRange#replaceTriggerText', () => {
	/** @type {HTMLTextAreaElement} */
	let field
	/** @type {TributeRange} */
	let range

	beforeEach(() => {
		vi.stubGlobal('$', (/** @type {HTMLTextAreaElement} */ element) => {
			const $element = {
				focus: () => $element,
				textSelection: (/** @type {string} */ command, /** @type {any} */ arg) => {
					switch (command) {
						case 'getContents':
							return element.value
						case 'setContents':
							element.value = arg
							return $element
						case 'setSelection':
							element.setSelectionRange(arg.start, arg.end ?? arg.start)
							return $element
					}
				},
			}

			return $element
		})
		field = document.createElement('textarea')
		document.body.append(field)
	})

	afterEach(() => {
		vi.unstubAllGlobals()
		field.remove()
	})

	/**
	 * @param {string} before Text before the caret, ending with the trigger text.
	 * @param {string} after
	 * @param {string} trigger
	 * @param {object} collection
	 */
	function setUp(before, after, trigger, collection) {
		field.value = before + after
		field.setSelectionRange(before.length, before.length)
		const mentionPosition = before.lastIndexOf(trigger)
		range = new TributeRange(
			/** @type {any} */ ({
				current: { element: field, collection },
				replaceTextSuffix: '',
				allowSpaces: true,
			}),
		)
		vi.spyOn(range, 'getTriggerInfo').mockReturnValue(
			/** @type {any} */ ({
				mentionPosition,
				mentionText: before.slice(mentionPosition + trigger.length),
				mentionTriggerChar: trigger,
			}),
		)
	}

	/**
	 * @param {any} data
	 * @param {object} [event]
	 */
	function replace(data, event = {}) {
		range.replaceTriggerText(data, true, true, /** @type {any} */ (event), {})
	}

	const selectedText = () => field.value.slice(field.selectionStart, field.selectionEnd)

	it('accepts a string as start and puts the caret after the insertion', () => {
		setUp('Hi @Us', ' there', '@', {})
		replace('[[User:Foo]]')

		expect(field.value).toBe('Hi [[User:Foo]] there')
		expect(field.selectionStart).toBe(15)
		expect(field.selectionEnd).toBe(15)
	})

	it('dispatches input and tribute-replaced events', () => {
		setUp('@Us', '', '@', {})
		const onInput = vi.fn()
		const onReplaced = vi.fn()
		field.addEventListener('input', onInput)
		field.addEventListener('tribute-replaced', onReplaced)
		replace('X')

		expect(onInput).toHaveBeenCalledOnce()
		expect(onReplaced).toHaveBeenCalledOnce()
	})

	it('Enter replaces the rest of the link target', () => {
		setUp('[[Main Pa', ' (old tail)]] after', '[[', wikilinksCollection)
		replace(wikilinkInsertion('Main Page'), { key: 'Enter' })

		expect(field.value).toBe('[[Main Page]] after')
		expect(field.selectionStart).toBe(13)
	})

	it('Tab with tabSelectsStartOnly inserts start only', () => {
		setUp('[[Main Pa', ' (old tail)]] after', '[[', wikilinksCollection)
		replace(wikilinkInsertion('Main Page'), { key: 'Tab' })

		expect(field.value).toBe('[[Main Page (old tail)]] after')
		expect(field.selectionStart).toBe(11)
	})

	it('Tab without tabSelectsStartOnly inserts the full text', () => {
		setUp('<sm', '', '<', {})
		replace(tagInsertion('small'), { key: 'Tab' })

		expect(field.value).toBe('<small></small>')
	})

	it('Tab skips the Shift, Alt, and Ctrl modifiers', () => {
		setUp('[[Main Pa', '', '[[', wikilinksCollection)
		const data = {
			...wikilinkInsertion('Main Page'),
			altModify: vi.fn(),
			cmdModify: vi.fn(),
		}
		const shiftModify = vi.spyOn(data, 'shiftModify')
		replace(data, { key: 'Tab', shiftKey: true, altKey: true, ctrlKey: true })

		expect(shiftModify).not.toHaveBeenCalled()
		expect(data.altModify).not.toHaveBeenCalled()
		expect(data.cmdModify).not.toHaveBeenCalled()
		expect(field.value).toBe('[[Main Page')
	})

	it('Shift runs shiftModify and selects the content', () => {
		setUp('[[Main Pa', ' (old)]] after', '[[', wikilinksCollection)
		replace(wikilinkInsertion('Main Page'), { key: 'Enter', shiftKey: true })

		expect(field.value).toBe('[[Main Page|Main Page]] after')
		expect(selectedText()).toBe('Main Page')
	})

	it('Shift replaces the label and fragment of an existing link', () => {
		setUp('[[Main Pa', ' (old)#Sec|label]] after', '[[', wikilinksCollection)
		replace(wikilinkInsertion('Main Page'), { key: 'Enter', shiftKey: true })

		expect(field.value).toBe('[[Main Page|Main Page]] after')
		expect(selectedText()).toBe('Main Page')
	})

	it('a section completion replaces the fragment and keeps the label', () => {
		setUp('[[Foo#Ne', 'w old|label]]', '[[', wikilinksCollection)
		replace(
			wikilinks.getInsertionFromEntry(
				/** @type {any} */ ({
					title: { getNamespaceId: () => 0, getMainText: () => 'Foo' },
					pageName: 'Foo',
					fragment: 'New',
				}),
			),
			{ key: 'Enter' },
		)

		expect(field.value).toBe('[[Foo#New|label]]')
	})

	it('a page completion keeps the fragment of an existing section link', () => {
		setUp('[[Fo', 'o#Old]]', '[[', wikilinksCollection)
		replace(wikilinkInsertion('Foo bar'), { key: 'Enter' })

		expect(field.value).toBe('[[Foo bar#Old]]')
	})

	it('Shift on a template puts the caret after the pipe', () => {
		setUp('{{Fo', '', '{{', templatesCollection)
		replace(templateInsertion('Foo'), { key: 'Enter', shiftKey: true })

		expect(field.value).toBe('{{Foo|}}')
		expect(field.selectionStart).toBe(6)
		expect(field.selectionEnd).toBe(6)
	})

	it('existing content triggers shiftModify without Shift and is not selected', () => {
		setUp('[[Main Pa', '', '[[', wikilinksCollection)
		replace(wikilinkInsertion('Main Page', 'label'), { key: 'Enter' })

		expect(field.value).toBe('[[Main Page|label]]')
		expect(field.selectionStart).toBe(field.selectionEnd)
		expect(field.selectionStart).toBe(19)
	})

	it('omitContentCheck drops content unless Shift is held', () => {
		setUp('[[Main Pa', '', '[[', {})
		replace({ start: '[[Main Page|', content: 'X', end: ']]', omitContentCheck: () => true })

		expect(field.value).toBe('[[Main Page|]]')

		setUp('[[Main Pa', '', '[[', {})
		replace(
			{ start: '[[Main Page|', content: 'X', end: ']]', omitContentCheck: () => true },
			{ shiftKey: true },
		)

		expect(field.value).toBe('[[Main Page|X]]')
	})

	it('Alt runs altModify', () => {
		setUp('@Us', '', '@', {})
		replace({
			start: 'A',
			altModify() {
				this.start = 'B'
			},
		}, { altKey: true })

		expect(field.value).toBe('B')
	})

	describe('Ctrl/Meta', () => {
		const data = () => ({
			start: 'A',
			cmdModify() {
				this.start = 'C'
			},
		})

		afterEach(() => {
			vi.restoreAllMocks()
		})

		it('Ctrl runs cmdModify outside Mac', () => {
			vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32')
			setUp('@Us', '', '@', {})
			replace(data(), { ctrlKey: true })

			expect(field.value).toBe('C')
		})

		it('Meta does not run cmdModify outside Mac', () => {
			vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32')
			setUp('@Us', '', '@', {})
			replace(data(), { metaKey: true })

			expect(field.value).toBe('A')
		})

		it('Meta runs cmdModify on Mac', () => {
			vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel')
			setUp('@Us', '', '@', {})
			replace(data(), { metaKey: true })

			expect(field.value).toBe('C')
		})

		it('Ctrl does not run cmdModify on Mac', () => {
			vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel')
			setUp('@Us', '', '@', {})
			replace(data(), { ctrlKey: true })

			expect(field.value).toBe('A')
		})
	})

	it('selectContent puts the caret between the tags', () => {
		setUp('<sm', '>', '<', tagsCollection)
		replace(tagInsertion('small'), { key: 'Enter' })

		expect(field.value).toBe('<small></small>')
		expect(field.selectionStart).toBe(7)
		expect(field.selectionEnd).toBe(7)
	})

	it('wraps a previously selected text', () => {
		setUp('a [[', 'b', '[[', wikilinksCollection)
		replace(
			{
				...wikilinkInsertion('Main Page', 'foo'),
				autocompleteSelections: [
					{ selectedText: 'foo', start: 2, leadingSpaces: ' ', trailingSpaces: ' ' },
				],
			},
			{ key: 'Enter' },
		)

		expect(field.value).toBe('a  [[Main Page|foo]] b')
	})

	it('does nothing without trigger info', () => {
		setUp('@Us', '', '@', {})
		vi.mocked(range.getTriggerInfo).mockReturnValue(undefined)
		replace('X')

		expect(field.value).toBe('@Us')
	})

	describe('multiple selections', () => {
		/** @type {ReturnType<typeof vi.fn>} */
		let replaceSelections

		/**
		 * @param {string} value
		 * @param {number[]} carets Caret positions, the last of which is the one Tribute tracks.
		 * @param {string} trigger
		 */
		function setUpMulti(value, carets, trigger) {
			const caret = carets.at(-1)
			setUp(value.slice(0, caret), value.slice(caret), trigger, {})
			replaceSelections = vi.fn()
			Object.assign(field, {
				cdSelectionRanges: carets.map((c) => ({ from: c, to: c })),
				cdInput: { replaceSelections },
			})
		}

		it('replaces at every range, sorted by position, with a selection per range', () => {
			setUpMulti('x {{ y {{', [9, 4], '{{')
			replace(
				{
					...templateInsertion('Foo', 'a'),
					autocompleteSelections: [
						{ selectedText: 'a', start: 2, leadingSpaces: '', trailingSpaces: '' },
						{ selectedText: 'b', start: 7, leadingSpaces: '', trailingSpaces: ' ' },
					],
				},
				{ key: 'Enter' },
			)

			expect(replaceSelections).toHaveBeenCalledWith([
				{ from: 2, to: 4, insert: '{{Foo|a}}', selection: undefined },
				{ from: 7, to: 9, insert: '{{Foo|b}} ', selection: undefined },
			])
		})

		it('falls back to the single caret when some range lacks the trigger text', () => {
			setUpMulti('x {{ y {', [8, 4], '{{')
			replace(templateInsertion('Foo'), { key: 'Enter' })

			expect(replaceSelections).not.toHaveBeenCalled()
			expect(field.value).toBe('x {{Foo}} y {')
		})

		it('uses the single caret path for one range', () => {
			setUpMulti('x {{', [4], '{{')
			replace(templateInsertion('Foo'), { key: 'Enter' })

			expect(replaceSelections).not.toHaveBeenCalled()
			expect(field.value).toBe('x {{Foo}}')
		})
	})
})

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
	 * @param {(entry: any, selectedText?: string) => any} [options.getInsertionFromEntry]
	 * @param {any} [options.entry]
	 */
	function makeOption({
		savedSelections,
		triggerPos = 2,
		allowNesting = false,
		trigger = '[[',
		getInsertionFromEntry = wikilinkInsertion,
		entry = 'Main Page',
	}) {
		manager.tribute.current = /** @type {any} */ ({
			triggerPos,
			collection: { allowNesting },
			element: {
				cdInput: savedSelections && { getAutocompleteSavedSelection: () => savedSelections },
			},
		})

		return /** @type {any} */ ({
			original: {
				entry,
				autocomplete: { manager, getTrigger: () => trigger, getInsertionFromEntry },
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
		it('returns an empty string without an option', () => {
			expect(manager.onOptionChoose(undefined)).toBe('')
		})

		it('builds the insertion from the entry without a selection', () => {
			const insertion = manager.onOptionChoose(makeOption({}))

			expect(insertion).toMatchObject({ start: '[[Main Page', end: ']]', content: undefined })
			expect(insertion).not.toHaveProperty('autocompleteSelections')
		})

		it('passes the selected text and attaches the selections', () => {
			const selections = [selection()]
			const insertion = manager.onOptionChoose(makeOption({ savedSelections: selections }))

			expect(insertion).toMatchObject({
				start: '[[Main Page',
				content: 'foo',
				autocompleteSelections: selections,
			})
		})
	})

	describe('applySelectionDataToInsertion', () => {
		it('does nothing without selection data', () => {
			const insertion = { start: 'a' }
			manager.applySelectionDataToInsertion(insertion, undefined)

			expect(insertion).toEqual({ start: 'a' })
		})

		it('sets autocompleteSelections', () => {
			const insertion = { start: 'a' }
			const selections = [selection()]
			manager.applySelectionDataToInsertion(insertion, { selections })

			expect(insertion.autocompleteSelections).toBe(selections)
		})
	})
})
