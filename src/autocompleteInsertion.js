/**
 * @import {TextReplacement, SelectionRange} from './TextInputWidgetMixin';
 * @import {TriggerContext} from './tribute/Tribute';
 */

/**
 * @typedef {object} Insertion
 * @property {string} start Start text
 * @property {string} [end] End text
 * @property {string} [content] Text between start and end
 * @property {boolean} [selectContent] Whether to select content, or put caret at its place if it's
 *   empty (this is done automatically when Shift is held)
 * @property {RegExp} [keepAsEnd] Regex matching the text after the caret that the insertion
 *   swallows. If its first capture group matches, the group's text becomes the end; otherwise the
 *   insertion keeps its own end.
 */

/**
 * The keys held when an option is chosen, and the text it wraps. Each defaults to false or none.
 *
 * @typedef {object} InsertionKeys
 * @property {boolean} [shift]
 * @property {boolean} [alt]
 * @property {boolean} [cmd] Meta on Mac, Ctrl elsewhere
 * @property {string} [selectedText] Text of the saved selection that the Insertion wraps
 */

/**
 * @typedef {(keys: Required<Pick<InsertionKeys, 'shift' | 'alt' | 'cmd'>> & Pick<InsertionKeys, 'selectedText'>) => Insertion} InsertionSource
 */

/**
 * @typedef {object} SavedSelection
 * @property {string} selectedText
 * @property {number} start
 * @property {string} leadingSpaces
 * @property {string} trailingSpaces
 */

/**
 * @typedef {object} InsertionTraits
 * @property {boolean} [tabSelectsStartOnly] Whether Tab inserts only the start, unlike Enter
 * @property {boolean} [allowNesting] Whether a saved selection containing the trigger is wrapped
 */

/**
 * @typedef {object} KeyState
 * @property {string} [key]
 * @property {boolean} [shiftKey]
 * @property {boolean} [altKey]
 * @property {boolean} [ctrlKey]
 * @property {boolean} [metaKey]
 */

const closingBrackets = /** @type {const} */ ({
	'(': ')',
	'[': ']',
	'{': '}',
	'"': '"',
	"'": "'",
})

/**
 * Get the closers that an editor auto-closing brackets (like CodeMirror) has put after the caret
 * while the text was typed, innermost first.
 *
 * @param {string} text
 * @returns {string[]}
 */
function getAutoClosers(text) {
	return Array.from(text)
		.reduce((/** @type {string[]} */ stack, char) => {
			if (stack.at(-1) === char) {
				stack.pop()
			} else if (char in closingBrackets) {
				stack.push(closingBrackets[/** @type {keyof typeof closingBrackets} */ (char)])
			}

			return stack
		}, [])
		.reverse()
}

/**
 * Compute the Replacements that a chosen autocomplete option makes in the input.
 *
 * @param {object} options
 * @param {InsertionSource} options.getInsertion Called once.
 * @param {KeyState} options.event The event that chose the option.
 * @param {boolean} options.isMac Whether the Command key is Meta rather than Ctrl.
 * @param {InsertionTraits} options.traits
 * @param {TriggerContext} options.context
 * @param {string} options.text The input's text.
 * @param {SelectionRange[]} options.selectionRanges The input's selection ranges.
 * @param {SavedSelection[]} options.savedSelections The input's saved selections.
 * @returns {TextReplacement[]} Empty when nothing can be replaced.
 */
export function getReplacements({
	getInsertion,
	event,
	isMac,
	traits: { tabSelectsStartOnly = false, allowNesting = false },
	context,
	text,
	selectionRanges,
	savedSelections: allSavedSelections,
}) {
	const isTab = event.key === 'Tab' && tabSelectsStartOnly
	const applicableSelections =
		Boolean(allSavedSelections.length) &&
		(allSavedSelections.length > 1 || allSavedSelections[0].start === context.triggerPos) &&
		(allowNesting ||
			allSavedSelections.every((selection) => !selection.selectedText.includes(context.triggerText)))
			? allSavedSelections
			: []
	const chosenInsertion = isTab
		? getInsertion({ shift: false, alt: false, cmd: false })
		: getInsertion({
				shift: Boolean(event.shiftKey),
				alt: Boolean(event.altKey),
				cmd: Boolean(isMac ? event.metaKey : event.ctrlKey),
				selectedText: applicableSelections[0]?.selectedText,
			})

	// Only an Insertion with an end can wrap text, as self-closing tags like `<references />` can't.
	const savedSelections = chosenInsertion.end ? applicableSelections : []
	const insertion = {
		...chosenInsertion,
		end: isTab ? '' : chosenInsertion.end || '',
		content: isTab ? '' : chosenInsertion.content || '',
	}

	const triggerText = context.triggerText + context.query

	/**
	 * @param {SelectionRange} range
	 * @param {SavedSelection} [savedSelection]
	 * @returns {TextReplacement | undefined}
	 */
	const getReplacement = (range, savedSelection) => {
		const endPos = range.to
		const startPos = endPos - triggerText.length
		if (range.from !== range.to || startPos < 0 || text.substring(startPos, endPos) !== triggerText) {
			return
		}

		const start = savedSelection ? savedSelection.leadingSpaces + insertion.start : insertion.start

		// Tab inserts only the start, so the text typed over is dropped rather than wrapped.
		const content = savedSelection && !isTab ? savedSelection.selectedText : insertion.content
		let end = savedSelection ? insertion.end + savedSelection.trailingSpaces : insertion.end
		let to = endPos

		// The typed text ends up inside the insertion, so the closers auto-inserted for it go too.
		for (const closer of getAutoClosers(context.query)) {
			if (text[to] !== closer) break

			to++
		}

		const keptMatch = !isTab && insertion.keepAsEnd && text.substring(to).match(insertion.keepAsEnd)
		if (keptMatch) {
			to += keptMatch[0].length
			end = keptMatch.at(1) ?? end
		}

		const insert = start + content + end

		return {
			from: startPos,
			to,
			insert,
			selection:
				!isTab && (event.shiftKey || (insertion.selectContent && !content))
					? { from: start.length, to: insert.length - end.length }
					: undefined,
		}
	}

	if (selectionRanges.length > 1) {
		const replacements = [...selectionRanges]
			.sort((a, b) => a.from - b.from)
			.map((range, index) => getReplacement(range, savedSelections[index]))
		if (replacements.every((replacement) => replacement !== undefined)) {
			return replacements
		}
	}

	const endPos = context.mentionPosition + triggerText.length
	const replacement = getReplacement({ from: endPos, to: endPos }, savedSelections[0])

	return replacement ? [replacement] : []
}
