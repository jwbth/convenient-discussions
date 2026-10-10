import { describe, it, expect, vi } from 'vitest'

vi.mock('../src/utils-window', () => ({
	interlanguagePrefixes: new Set(),
	allowedTags: [],
}))
vi.mock('../src/loader/cd', () => ({
	default: {
		settings: { get: () => [] },
		g: {},
		mws: (/** @type {string} */ key) => (key === 'colon-separator' ? ': ' : ''),
	},
}))
vi.mock('../src/userRegistry', () => ({
	default: {
		get: () => ({ getNamespaceAlias: () => 'User', isRegistered: () => true }),
	},
}))

import MentionsAutocomplete from '../src/MentionsAutocomplete'
import TagsAutocomplete from '../src/TagsAutocomplete'
import TemplatesAutocomplete from '../src/TemplatesAutocomplete'
import WikilinksAutocomplete from '../src/WikilinksAutocomplete'
import { getReplacements } from '../src/autocompleteInsertion'

const wikilinks = new WikilinksAutocomplete()
const templates = new TemplatesAutocomplete()
const tags = new TagsAutocomplete()
const mentions = new MentionsAutocomplete()


/** @typedef {import('../src/autocompleteInsertion').InsertionSource} InsertionSource */

/**
 * @param {string} pageName A main-namespace page name.
 * @param {string} [fragment]
 * @returns {InsertionSource}
 */
const wikilinkInsertion = (pageName, fragment) => (keys) =>
	wikilinks.getInsertionFromEntry(
		/** @type {any} */ ({
			title: { getNamespaceId: () => 0, getMainText: () => pageName },
			pageName,
			fragment,
		}),
		keys,
	)

/**
 * @param {string} name
 * @returns {InsertionSource}
 */
const templateInsertion = (name) => (keys) => templates.getInsertionFromEntry(name, keys)

/**
 * @param {import('../src/TagsAutocomplete').TagEntry} entry
 * @returns {InsertionSource}
 */
const tagInsertion = (entry) => (keys) => tags.getInsertionFromEntry(entry, keys)

/**
 * @param {string} name
 * @returns {InsertionSource}
 */
const mentionInsertion = (name) => (keys) => mentions.getInsertionFromEntry(name, keys)

/**
 * @param {string} selectedText
 * @param {number} start
 * @param {string} [leadingSpaces]
 * @param {string} [trailingSpaces]
 * @returns {import('../src/autocompleteInsertion').SavedSelection}
 */
const savedSelection = (selectedText, start, leadingSpaces = '', trailingSpaces = '') => ({
	selectedText,
	start,
	leadingSpaces,
	trailingSpaces,
})

/**
 * Complete the trigger text that ends `before` in `before + after`, with Tribute's caret right
 * after `before`, and apply the Replacements.
 *
 * @param {object} options
 * @param {string} options.before Text before the caret, ending with the trigger and query.
 * @param {string} [options.after]
 * @param {string} options.trigger
 * @param {InsertionSource | import('../src/autocompleteInsertion').Insertion} options.insertion
 *   A plain Insertion stands for a source that returns it whatever the keys.
 * @param {import('../src/autocompleteInsertion').InsertionTraits} [options.traits]
 * @param {import('../src/autocompleteInsertion').KeyState} [options.event]
 * @param {boolean} [options.isMac]
 * @param {number[]} [options.carets] Caret positions of all selection ranges.
 * @param {import('../src/autocompleteInsertion').SavedSelection[]} [options.savedSelections]
 * @param {number} [options.triggerPos] Defaults to the position of the trigger.
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
	savedSelections = [],
	triggerPos,
}) {
	const text = before + after
	const mentionPosition = before.lastIndexOf(trigger)
	const replacements = getReplacements({
		getInsertion: typeof insertion === 'function' ? insertion : () => insertion,
		event,
		isMac,
		traits,
		context: {
			triggerText: trigger,
			query: before.slice(mentionPosition + trigger.length),
			mentionPosition,
			triggerPos: triggerPos ?? mentionPosition,
		},
		text,
		selectionRanges: carets.map((caret) => ({ from: caret, to: caret })),
		savedSelections,
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
				getInsertion: () => ({ start: '[[Main', end: ']]' }),
				event: {},
				isMac: false,
				traits: {},
				context: { triggerText: '[[', query: 'Ma', mentionPosition: 0 },
				text: 'xx[[Ma',
				selectionRanges: [],
				savedSelections: [],
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
			complete({ before: '[[Main Pa', after, trigger: '[[', insertion, traits: wikilinks, event })

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
					insertion: wikilinkInsertion('Foo', 'New'),
					traits: wikilinks,
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
					traits: wikilinks,
				}).result,
			).toBe('[[Foo bar#Old]]')
		})

		it('pipes a link with selected text without Shift and puts the caret after it', () => {
			const { result, replacements } = complete({
				before: '[[Main Pa',
				trigger: '[[',
				insertion: wikilinkInsertion('Main Page'),
				traits: wikilinks,
				savedSelections: [savedSelection('label', 0)],
			})

			expect(result).toBe('[[Main Page|label]]')
			expect(replacements[0].selection).toBeUndefined()
		})
	})

	describe('templates: keepAsEnd with a capture group', () => {
		/** @param {string} after */
		const completeFoo = (after) =>
			complete({
				before: '{{Fo',
				after,
				trigger: '{{',
				insertion: templateInsertion('Foo'),
				traits: templates,
			}).result

		it('uses the group as the end: `}}`', () => {
			expect(completeFoo('}} text')).toBe('{{Foo}} text')
		})

		it('uses the group as the end: `|`', () => {
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
				traits: templates,
				event: { key: 'Enter', shiftKey: true },
			})

			expect(result).toBe('{{Foo|}}')
			expect(replacements[0].selection).toEqual({ from: 6, to: 6 })
		})
	})

	describe('tags: keepAsEnd without a capture group', () => {
		it('swallows the match but keeps the own end, with the caret between the tags', () => {
			const { result, selected, replacements } = complete({
				before: '<sm',
				after: '>',
				trigger: '<',
				insertion: tagInsertion('small'),
				traits: tags,
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
				traits: wikilinks,
				event: tab,
			})

			expect(result).toBe('[[Main Page (old tail)]] after')
			expect(replacements[0].selection).toBeUndefined()
		})

		it('does not select even with Shift or selectContent', () => {
			expect(
				complete({
					before: '{{Fo',
					trigger: '{{',
					insertion: (keys) => ({ ...templateInsertion('Foo')(keys), selectContent: true }),
					traits: templates,
					event: { key: 'Tab', shiftKey: true },
				}).replacements[0].selection,
			).toBeUndefined()
		})

		it('drops a previously selected text instead of wrapping it', () => {
			expect(
				complete({
					before: 'a [[Main Pa',
					after: 'b',
					trigger: '[[',
					insertion: wikilinkInsertion('Main Page'),
					traits: wikilinks,
					event: tab,
					savedSelections: [savedSelection('foo', 2, ' ', ' ')],
				}).result,
			).toBe('a  [[Main Page b')
		})

		it('ignores the Shift, Alt, and Ctrl modifiers', () => {
			const getInsertion = vi.fn(templateInsertion('Foo'))

			expect(
				complete({
					before: '{{Fo',
					trigger: '{{',
					insertion: getInsertion,
					traits: templates,
					event: { key: 'Tab', shiftKey: true, altKey: true, ctrlKey: true },
					savedSelections: [savedSelection('foo', 0)],
				}).result,
			).toBe('{{Foo')
			expect(getInsertion).toHaveBeenCalledExactlyOnceWith({ shift: false, alt: false, cmd: false })
		})

		it('acts like Enter without tabSelectsStartOnly', () => {
			expect(
				complete({
					before: '<sm',
					trigger: '<',
					insertion: tagInsertion('small'),
					traits: tags,
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
		const completeLink = (before, after, pageName = 'Foo (bar)', event) =>
			complete({
				before,
				after,
				trigger: '[[',
				insertion: wikilinkInsertion(pageName),
				traits: wikilinks,
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
			expect(
				complete({
					before: '<sm',
					trigger: '<',
					insertion: { start: '<small>', content: 'x', end: '</small>', selectContent: true },
				}).replacements[0].selection,
			).toBeUndefined()
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
					insertion: wikilinkInsertion('Main Page'),
					traits: wikilinks,
					savedSelections: [savedSelection('foo', 2, ' ', '  ')],
				}).result,
			).toBe('a  [[Main Page|foo]]  b')
		})

		/**
		 * @param {import('../src/autocompleteInsertion').SavedSelection[]} savedSelections
		 * @param {number} [triggerPos]
		 */
		const completeLink = (savedSelections, triggerPos) =>
			complete({
				before: 'a [[',
				trigger: '[[',
				insertion: wikilinkInsertion('Main Page'),
				traits: wikilinks,
				savedSelections,
				triggerPos,
			}).result

		it('is ignored when it does not start at the trigger', () => {
			expect(completeLink([savedSelection('foo', 5)])).toBe('a [[Main Page]]')
		})

		it('skips the start check when there are several', () => {
			expect(completeLink([savedSelection('a', 10), savedSelection('b', 20)])).toBe(
				'a [[Main Page|a]]',
			)
		})

		it('is ignored when it contains the trigger', () => {
			expect(completeLink([savedSelection('a [[b]]', 2)])).toBe('a [[Main Page]]')
		})

		it('is ignored when any of several contains the trigger', () => {
			expect(completeLink([savedSelection('a', 1), savedSelection('[[b]]', 9)])).toBe(
				'a [[Main Page]]',
			)
		})

		it('contains the trigger when the autocomplete allows nesting', () => {
			expect(
				complete({
					before: 'a <',
					trigger: '<',
					insertion: tagInsertion('small'),
					traits: tags,
					savedSelections: [savedSelection('<b>x</b>', 2)],
				}).result,
			).toBe('a <small><b>x</b></small>')
		})

		it('is ignored by an Insertion without an end', () => {
			const { result, selected } = complete({
				before: 'a <',
				after: ' b',
				trigger: '<',
				insertion: tagInsertion(['references', '<references />']),
				traits: tags,
				savedSelections: [savedSelection('foo', 2, '', ' ')],
			})

			expect(result).toBe('a <references /> b')
			expect(selected).toBe('')
		})
	})

	describe('keys', () => {
		/**
		 * @param {import('../src/autocompleteInsertion').KeyState} event
		 * @param {boolean} [isMac]
		 */
		const completeMention = (event, isMac = false) =>
			complete({ before: 'Hi @Ex', trigger: '@', insertion: mentionInsertion('Example'), event, isMac })

		it('uses the pipe trick for a mention without Shift', () => {
			expect(completeMention({ key: 'Enter' }).result).toBe('Hi @[[User:Example|]]')
		})

		it('spells out the mentioned name and selects it with Shift', () => {
			const { result, selected } = completeMention({ key: 'Enter', shiftKey: true })

			expect(result).toBe('Hi @[[User:Example|Example]]')
			expect(selected).toBe('Example')
		})

		it('appends a colon to a mention with Alt', () => {
			expect(completeMention({ key: 'Enter', altKey: true }).result).toBe(
				'Hi @[[User:Example|]]: ',
			)
		})

		describe('Ctrl/Meta', () => {
			it('Ctrl appends a colon outside Mac', () => {
				expect(completeMention({ ctrlKey: true }).result).toBe('Hi @[[User:Example|]]: ')
			})

			it('Meta does not append a colon outside Mac', () => {
				expect(completeMention({ metaKey: true }).result).toBe('Hi @[[User:Example|]]')
			})

			it('Meta appends a colon on Mac', () => {
				expect(completeMention({ metaKey: true }, true).result).toBe('Hi @[[User:Example|]]: ')
			})

			it('Ctrl does not append a colon on Mac', () => {
				expect(completeMention({ ctrlKey: true }, true).result).toBe('Hi @[[User:Example|]]')
			})
		})

		it('calls the insertion source once with the keys and the saved selection text', () => {
			const getInsertion = vi.fn(wikilinkInsertion('Main Page'))
			complete({
				before: '[[',
				trigger: '[[',
				insertion: getInsertion,
				traits: wikilinks,
				event: { key: 'Enter', shiftKey: true, altKey: true, metaKey: true },
				isMac: true,
				savedSelections: [savedSelection('foo', 0)],
			})

			expect(getInsertion).toHaveBeenCalledExactlyOnceWith({
				shift: true,
				alt: true,
				cmd: true,
				selectedText: 'foo',
			})
		})
	})

	describe('multiple selection ranges', () => {
		it('replaces at every range, sorted by position, with a selection per range', () => {
			expect(
				complete({
					before: 'x {{ y {{',
					trigger: '{{',
					insertion: templateInsertion('Foo'),
					traits: templates,
					savedSelections: [savedSelection('a', 2), savedSelection('b', 7, '', ' ')],
					carets: [9, 4],
				}).replacements,
			).toEqual([
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
				traits: templates,
				carets: [8, 4],
			})

			expect(replacements).toHaveLength(1)
			expect(result).toBe('x {{Foo}} y {')
		})

		it('falls back to the single caret when some range is not collapsed', () => {
			expect(
				getReplacements({
					getInsertion: templateInsertion('Foo'),
					event: {},
					isMac: false,
					traits: templates,
					context: { triggerText: '{{', query: '', mentionPosition: 7 },
					text: 'x {{ y {{',
					selectionRanges: [
						{ from: 2, to: 4 },
						{ from: 9, to: 9 },
					],
					savedSelections: [],
				}),
			).toEqual([{ from: 7, to: 9, insert: '{{Foo}}', selection: undefined }])
		})

		it('falls back to the single caret when the trigger text would start before the text', () => {
			expect(
				complete({
					before: '[[Ma',
					trigger: '[[',
					insertion: wikilinkInsertion('Main'),
					traits: wikilinks,
					carets: [1, 4],
				}).replacements,
			).toEqual([{ from: 0, to: 4, insert: '[[Main]]', selection: undefined }])
		})

		it('takes the single caret path for one range', () => {
			expect(
				getReplacements({
					getInsertion: templateInsertion('Foo'),
					event: {},
					isMac: false,
					traits: templates,
					context: { triggerText: '{{', query: '', mentionPosition: 7 },
					text: 'x {{ y {{',
					selectionRanges: [{ from: 4, to: 4 }],
					savedSelections: [],
				}),
			).toEqual([{ from: 7, to: 9, insert: '{{Foo}}', selection: undefined }])
		})
	})
})
