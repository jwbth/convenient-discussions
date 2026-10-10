import { describe, it, expect, vi } from 'vitest'

vi.mock('../src/utils-window', () => ({
	interlanguagePrefixes: new Set(),
	allowedTags: [],
}))
vi.mock('../src/loader/cd', () => ({
	default: { settings: { get: () => [] }, g: {} },
}))

import TagsAutocomplete from '../src/TagsAutocomplete'
import TemplatesAutocomplete from '../src/TemplatesAutocomplete'
import WikilinksAutocomplete from '../src/WikilinksAutocomplete'
import { getReplacements } from '../src/autocompleteInsertion'

const wikilinks = new WikilinksAutocomplete()
const templates = new TemplatesAutocomplete()
const tags = new TagsAutocomplete()

const wikilinksTraits = wikilinks.getCollectionProperties()
const templatesTraits = templates.getCollectionProperties()
const tagsTraits = tags.getCollectionProperties()

/**
 * @param {string} pageName A main-namespace page name.
 * @param {object} [options]
 * @param {string} [options.selectedText]
 * @param {string} [options.fragment]
 */
const wikilinkInsertion = (pageName, { selectedText, fragment } = {}) =>
	wikilinks.getInsertionFromEntry(
		/** @type {any} */ ({
			title: { getNamespaceId: () => 0, getMainText: () => pageName },
			pageName,
			fragment,
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
 * Complete the trigger text that ends `before` in `before + after`, with Tribute's caret right
 * after `before`, and apply the Replacements.
 *
 * @param {object} options
 * @param {string} options.before Text before the caret, ending with the trigger and query.
 * @param {string} [options.after]
 * @param {string} options.trigger
 * @param {import('../src/autocompleteInsertion').Insertion} options.insertion
 * @param {import('../src/autocompleteInsertion').InsertionTraits} [options.traits]
 * @param {import('../src/autocompleteInsertion').KeyState} [options.event]
 * @param {boolean} [options.isMac]
 * @param {number[]} [options.carets] Caret positions of all selection ranges.
 */
function complete({
	before,
	after = '',
	trigger,
	insertion,
	traits = {},
	event = { key: 'Enter' },
	isMac = false,
	carets = [before.length],
}) {
	const text = before + after
	const mentionPosition = before.lastIndexOf(trigger)
	const replacements = getReplacements({
		insertion,
		event,
		isMac,
		traits,
		context: {
			triggerText: trigger,
			query: before.slice(mentionPosition + trigger.length),
			mentionPosition,
		},
		text,
		selectionRanges: carets.map((caret) => ({ from: caret, to: caret })),
	})
	const [first] = replacements

	return {
		replacements,
		result: replacements.reduceRight(
			(result, { from, to, insert }) => result.slice(0, from) + insert + result.slice(to),
			text,
		),
		selected: first?.selection && first.insert.slice(first.selection.from, first.selection.to),
	}
}

describe('getReplacements', () => {
	it('replaces the trigger text with start + content + end and puts the caret after it', () => {
		const { replacements, result } = complete({
			before: 'Hi @Us',
			after: ' there',
			trigger: '@',
			insertion: { start: '[[User:', content: 'Foo', end: ']]' },
		})

		expect(replacements).toEqual([{ from: 3, to: 6, insert: '[[User:Foo]]', selection: undefined }])
		expect(result).toBe('Hi [[User:Foo]] there')
	})

	it('returns nothing when the text before the caret is not the trigger text', () => {
		expect(
			getReplacements({
				insertion: { start: '[[Main', end: ']]' },
				event: {},
				isMac: false,
				traits: {},
				context: { triggerText: '[[', query: 'Ma', mentionPosition: 0 },
				text: 'xx[[Ma',
				selectionRanges: [],
			}),
		).toEqual([])
	})

	describe('wikilinks: keepAsEnd', () => {
		const insertion = wikilinkInsertion('Main Page')

		/**
		 * @param {string} after
		 * @param {import('../src/autocompleteInsertion').KeyState} [event]
		 */
		const completeMainPage = (after, event) =>
			complete({ before: '[[Main Pa', after, trigger: '[[', insertion, traits: wikilinksTraits, event })

		it('completes a new link', () => {
			expect(completeMainPage('').result).toBe('[[Main Page]]')
		})

		it('replaces the rest of the link target', () => {
			expect(completeMainPage(' (old tail)]] after').result).toBe('[[Main Page]] after')
		})

		it('keeps the label', () => {
			expect(completeMainPage(' (old tail)|label]]').result).toBe('[[Main Page|label]]')
		})

		it('keeps the fragment', () => {
			expect(completeMainPage(' (old tail)#Fragment]]').result).toBe('[[Main Page#Fragment]]')
		})

		it('leaves a tail over 50 characters intact', () => {
			const tail = ' and then some unrelated text that runs on for well over fifty characters'

			expect(completeMainPage(tail + ']]').result).toBe(`[[Main Page]]${tail}]]`)
		})

		it('consumes a tail of exactly 50 characters', () => {
			expect(completeMainPage('x'.repeat(50) + ']]').result).toBe('[[Main Page]]')
		})

		it('does not consume across a newline', () => {
			expect(completeMainPage(' text\nmore]]').result).toBe('[[Main Page]] text\nmore]]')
		})

		it('does not consume into another link', () => {
			expect(completeMainPage(' see [[Other]]').result).toBe('[[Main Page]] see [[Other]]')
		})

		it('with Shift, pipes the link and selects the label', () => {
			const { result, selected, replacements } = completeMainPage(' (old)]] after', {
				key: 'Enter',
				shiftKey: true,
			})

			expect(result).toBe('[[Main Page|Main Page]] after')
			expect(selected).toBe('Main Page')
			expect(replacements[0].selection).toEqual({ from: 12, to: 21 })
		})

		it('with Shift, replaces the label and fragment of an existing link', () => {
			const { result, selected } = completeMainPage(' (old)#Sec|label]] after', {
				key: 'Enter',
				shiftKey: true,
			})

			expect(result).toBe('[[Main Page|Main Page]] after')
			expect(selected).toBe('Main Page')
		})

		it('a section completion replaces the fragment and keeps the label', () => {
			expect(
				complete({
					before: '[[Foo#Ne',
					after: 'w old|label]]',
					trigger: '[[',
					insertion: wikilinkInsertion('Foo', { fragment: 'New' }),
					traits: wikilinksTraits,
				}).result,
			).toBe('[[Foo#New|label]]')
		})

		it('a page completion keeps the fragment of an existing section link', () => {
			expect(
				complete({
					before: '[[Fo',
					after: 'o#Old]]',
					trigger: '[[',
					insertion: wikilinkInsertion('Foo bar'),
					traits: wikilinksTraits,
				}).result,
			).toBe('[[Foo bar#Old]]')
		})

		it('pipes a link with content without Shift and puts the caret after it', () => {
			const { result, replacements } = complete({
				before: '[[Main Pa',
				trigger: '[[',
				insertion: wikilinkInsertion('Main Page', { selectedText: 'label' }),
				traits: wikilinksTraits,
			})

			expect(result).toBe('[[Main Page|label]]')
			expect(replacements[0].selection).toBeUndefined()
		})
	})

	describe('templates: keepAsEnd without a capture group', () => {
		/** @param {string} after */
		const completeFoo = (after) =>
			complete({
				before: '{{Fo',
				after,
				trigger: '{{',
				insertion: templateInsertion('Foo'),
				traits: templatesTraits,
			}).result

		it('uses the whole match as the end: `}}`', () => {
			expect(completeFoo('}} text')).toBe('{{Foo}} text')
		})

		it('uses the whole match as the end: `|`', () => {
			expect(completeFoo('|a=1}}')).toBe('{{Foo|a=1}}')
		})

		it('keeps the own end when nothing matches', () => {
			expect(completeFoo('o}}')).toBe('{{Foo}}o}}')
		})

		it('with Shift, puts the caret after the pipe', () => {
			const { result, replacements } = complete({
				before: '{{Fo',
				trigger: '{{',
				insertion: templateInsertion('Foo'),
				traits: templatesTraits,
				event: { key: 'Enter', shiftKey: true },
			})

			expect(result).toBe('{{Foo|}}')
			expect(replacements[0].selection).toEqual({ from: 6, to: 6 })
		})
	})

	describe('tags: keepAsEnd with replaceEnd: false', () => {
		it('consumes the matched text but keeps the own end, with the caret between the tags', () => {
			const { result, selected, replacements } = complete({
				before: '<sm',
				after: '>',
				trigger: '<',
				insertion: tagInsertion('small'),
				traits: tagsTraits,
			})

			expect(result).toBe('<small></small>')
			expect(selected).toBe('')
			expect(replacements[0].selection).toEqual({ from: 7, to: 7 })
		})
	})

	describe('Tab', () => {
		const tab = { key: 'Tab' }

		it('inserts start only and does not consume the tail', () => {
			const { result, replacements } = complete({
				before: '[[Main Pa',
				after: ' (old tail)]] after',
				trigger: '[[',
				insertion: wikilinkInsertion('Main Page'),
				traits: wikilinksTraits,
				event: tab,
			})

			expect(result).toBe('[[Main Page (old tail)]] after')
			expect(replacements[0].selection).toBeUndefined()
		})

		it('does not select even with Shift or selectContent', () => {
			const { replacements } = complete({
				before: '{{Fo',
				trigger: '{{',
				insertion: { ...templateInsertion('Foo'), selectContent: true },
				traits: templatesTraits,
				event: { key: 'Tab', shiftKey: true },
			})

			expect(replacements[0].selection).toBeUndefined()
		})

		it('drops a previously selected text instead of wrapping it', () => {
			expect(
				complete({
					before: 'a [[Main Pa',
					after: 'b',
					trigger: '[[',
					insertion: {
						...wikilinkInsertion('Main Page', { selectedText: 'foo' }),
						autocompleteSelections: [
							{ selectedText: 'foo', start: 2, leadingSpaces: ' ', trailingSpaces: ' ' },
						],
					},
					traits: wikilinksTraits,
					event: tab,
				}).result,
			).toBe('a  [[Main Page b')
		})

		it('ignores the Shift, Alt, and Ctrl modifiers', () => {
			const insertion = {
				...wikilinkInsertion('Main Page'),
				altModify: vi.fn(),
				cmdModify: vi.fn(),
				shiftModify: vi.fn(),
			}
			const { result } = complete({
				before: '[[Main Pa',
				trigger: '[[',
				insertion,
				traits: wikilinksTraits,
				event: { key: 'Tab', shiftKey: true, altKey: true, ctrlKey: true },
			})

			expect(insertion.shiftModify).not.toHaveBeenCalled()
			expect(insertion.altModify).not.toHaveBeenCalled()
			expect(insertion.cmdModify).not.toHaveBeenCalled()
			expect(result).toBe('[[Main Page')
		})

		it('acts like Enter without tabSelectsStartOnly', () => {
			expect(
				complete({
					before: '<sm',
					trigger: '<',
					insertion: tagInsertion('small'),
					traits: tagsTraits,
					event: tab,
				}).result,
			).toBe('<small></small>')
		})
	})

	describe('auto-closed brackets', () => {
		/**
		 * @param {string} before
		 * @param {string} after
		 * @param {string} [pageName]
		 * @param {import('../src/autocompleteInsertion').KeyState} [event]
		 */
		const completeLink = (before, after, pageName = 'Foo (bar)', event = undefined) =>
			complete({
				before,
				after,
				trigger: '[[',
				insertion: wikilinkInsertion(pageName),
				traits: wikilinksTraits,
				event,
			}).result

		it('replaces a closer auto-inserted for the query', () => {
			expect(completeLink('[[Foo (', ')')).toBe('[[Foo (bar)]]')
		})

		it('replaces a closer auto-inserted for the query on Tab', () => {
			expect(completeLink('[[Foo (', ')', undefined, { key: 'Tab' })).toBe('[[Foo (bar)')
		})

		it('replaces the closers and then the rest of the link', () => {
			expect(completeLink('[[Foo (', ')]] x')).toBe('[[Foo (bar)]] x')
		})

		it('replaces nested closers innermost first', () => {
			expect(completeLink('[[Foo ("', '")', 'Foo ("bar")')).toBe('[[Foo ("bar")]]')
		})

		it('keeps a closer for a bracket closed in the query', () => {
			expect(completeLink('[[Foo (b)', ')')).toBe('[[Foo (bar)]])')
		})

		it('keeps a closer other than the expected one', () => {
			expect(completeLink('[[Foo (', ']')).toBe('[[Foo (bar)]]]')
		})
	})

	describe('selection', () => {
		it('selects content with selectContent when there is no content', () => {
			const { selected, replacements } = complete({
				before: '<sm',
				trigger: '<',
				insertion: { start: '<small>', end: '</small>', selectContent: true },
			})

			expect(selected).toBe('')
			expect(replacements[0].selection).toEqual({ from: 7, to: 7 })
		})

		it('does not select with selectContent when there is content', () => {
			const { replacements } = complete({
				before: '<sm',
				trigger: '<',
				insertion: { start: '<small>', content: 'x', end: '</small>', selectContent: true },
			})

			expect(replacements[0].selection).toBeUndefined()
		})

		it('selects content with Shift', () => {
			expect(
				complete({
					before: '{{Fo',
					trigger: '{{',
					insertion: { start: '{{Foo|', content: 'bar', end: '}}' },
					event: { key: 'Enter', shiftKey: true },
				}).selected,
			).toBe('bar')
		})
	})

	describe('saved selection', () => {
		it('wraps the selected text as content and puts the spaces outside', () => {
			expect(
				complete({
					before: 'a [[',
					after: 'b',
					trigger: '[[',
					insertion: {
						...wikilinkInsertion('Main Page', { selectedText: 'foo' }),
						autocompleteSelections: [
							{ selectedText: 'foo', start: 0, leadingSpaces: ' ', trailingSpaces: '  ' },
						],
					},
					traits: wikilinksTraits,
				}).result,
			).toBe('a  [[Main Page|foo]]  b')
		})
	})

	describe('modifier callbacks', () => {
		it('omitContentCheck drops content unless Shift is held', () => {
			const insertion = {
				start: '[[Main Page|',
				content: 'X',
				end: ']]',
				omitContentCheck: () => true,
			}

			expect(complete({ before: '[[Main Pa', trigger: '[[', insertion }).result).toBe(
				'[[Main Page|]]',
			)
			expect(
				complete({
					before: '[[Main Pa',
					trigger: '[[',
					insertion,
					event: { key: 'Enter', shiftKey: true },
				}).result,
			).toBe('[[Main Page|X]]')
		})

		it('Alt runs altModify', () => {
			expect(
				complete({
					before: '@Us',
					trigger: '@',
					insertion: {
						start: 'A',
						altModify() {
							this.start = 'B'
						},
					},
					event: { altKey: true },
				}).result,
			).toBe('B')
		})

		describe('Ctrl/Meta', () => {
			/**
			 * @param {import('../src/autocompleteInsertion').KeyState} event
			 * @param {boolean} isMac
			 */
			const completeCmd = (event, isMac) =>
				complete({
					before: '@Us',
					trigger: '@',
					insertion: {
						start: 'A',
						cmdModify() {
							this.start = 'C'
						},
					},
					event,
					isMac,
				}).result

			it('Ctrl runs cmdModify outside Mac', () => {
				expect(completeCmd({ ctrlKey: true }, false)).toBe('C')
			})

			it('Meta does not run cmdModify outside Mac', () => {
				expect(completeCmd({ metaKey: true }, false)).toBe('A')
			})

			it('Meta runs cmdModify on Mac', () => {
				expect(completeCmd({ metaKey: true }, true)).toBe('C')
			})

			it('Ctrl does not run cmdModify on Mac', () => {
				expect(completeCmd({ ctrlKey: true }, true)).toBe('A')
			})
		})

		it('leaves the passed Insertion unchanged', () => {
			const insertion = wikilinkInsertion('Main Page')
			const copy = { ...insertion }
			complete({
				before: '[[Main Pa',
				trigger: '[[',
				insertion,
				traits: wikilinksTraits,
				event: { key: 'Enter', shiftKey: true },
			})

			expect(insertion).toEqual(copy)
		})
	})

	describe('multiple selection ranges', () => {
		it('replaces at every range, sorted by position, with a selection per range', () => {
			const { replacements } = complete({
				before: 'x {{ y {{',
				trigger: '{{',
				insertion: {
					...templateInsertion('Foo', 'a'),
					autocompleteSelections: [
						{ selectedText: 'a', start: 2, leadingSpaces: '', trailingSpaces: '' },
						{ selectedText: 'b', start: 7, leadingSpaces: '', trailingSpaces: ' ' },
					],
				},
				traits: templatesTraits,
				carets: [9, 4],
			})

			expect(replacements).toEqual([
				{ from: 2, to: 4, insert: '{{Foo|a}}', selection: undefined },
				{ from: 7, to: 9, insert: '{{Foo|b}} ', selection: undefined },
			])
		})

		it('falls back to the single caret when some range lacks the trigger text', () => {
			const { replacements, result } = complete({
				before: 'x {{',
				after: ' y {',
				trigger: '{{',
				insertion: templateInsertion('Foo'),
				traits: templatesTraits,
				carets: [8, 4],
			})

			expect(replacements).toHaveLength(1)
			expect(result).toBe('x {{Foo}} y {')
		})

		it('falls back to the single caret when some range is not collapsed', () => {
			const replacements = getReplacements({
				insertion: templateInsertion('Foo'),
				event: {},
				isMac: false,
				traits: templatesTraits,
				context: { triggerText: '{{', query: '', mentionPosition: 7 },
				text: 'x {{ y {{',
				selectionRanges: [
					{ from: 2, to: 4 },
					{ from: 9, to: 9 },
				],
			})

			expect(replacements).toEqual([{ from: 7, to: 9, insert: '{{Foo}}', selection: undefined }])
		})

		it('falls back to the single caret when the trigger text would start before the text', () => {
			const { replacements } = complete({
				before: '[[Ma',
				trigger: '[[',
				insertion: wikilinkInsertion('Main'),
				traits: wikilinksTraits,
				carets: [1, 4],
			})

			expect(replacements).toEqual([{ from: 0, to: 4, insert: '[[Main]]', selection: undefined }])
		})

		it('takes the single caret path for one range', () => {
			const replacements = getReplacements({
				insertion: templateInsertion('Foo'),
				event: {},
				isMac: false,
				traits: templatesTraits,
				context: { triggerText: '{{', query: '', mentionPosition: 7 },
				text: 'x {{ y {{',
				selectionRanges: [{ from: 4, to: 4 }],
			})

			expect(replacements).toEqual([{ from: 7, to: 9, insert: '{{Foo}}', selection: undefined }])
		})
	})
})
