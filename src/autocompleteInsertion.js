/**
 * @import {TextReplacement, SelectionRange} from './TextInputWidgetMixin';
 * @import {TriggerContext} from './tribute/Tribute';
 */

/**
 * An Insertion along with some modification logic.
 *
 * @typedef {object} Insertion
 * @property {string} start Start text
 * @property {string} [end] End text
 * @property {string} [content] Text between start and end
 * @property {() => boolean} [omitContentCheck] Function that checks whether to omit
 *   {@link Insertion#content}. This can be done so that the inserted text ends up having a pipe
 *   trick (e.g. `[[User:Example|]]` that would be saved as `[[User:Example|Example]]`)
 * @property {boolean} [selectContent] Whether to select content, or put caret at its place if it's
 *   empty (this is done automatically when Shift is held)
 * @property {RegExp} [keepAsEnd] Overrides {@link InsertionTraits#keepAsEnd} for this insertion
 * @property {() => void} [altModify] Function that modifies this insertion if the Alt key is held
 * @property {() => void} [shiftModify] Function that modifies this insertion if the Shift key is
 *   held
 * @property {() => void} [cmdModify] Function that modifies this insertion if the Command key is
 *   held
 * @property {SavedSelection[]} [autocompleteSelections] Saved selections that the insertion wraps.
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
 * @property {RegExp} [keepAsEnd] Regex matching the text after the caret that the insertion
 *   replaces. With `replaceEnd`, the first capture group (or, absent it, the whole match) becomes the
 *   insertion's end.
 * @property {boolean} [replaceEnd=true] Whether the text matched by `keepAsEnd` becomes the end
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
 * @param {Insertion} options.insertion
 * @param {KeyState} options.event The event that chose the option.
 * @param {boolean} options.isMac Whether the Command key is Meta rather than Ctrl.
 * @param {InsertionTraits} options.traits
 * @param {TriggerContext} options.context
 * @param {string} options.text The input's text.
 * @param {SelectionRange[]} options.selectionRanges The input's selection ranges.
 * @returns {TextReplacement[]} Empty when nothing can be replaced.
 */
export function getReplacements({
	insertion,
	event,
	isMac,
	traits: { tabSelectsStartOnly = false, keepAsEnd: traitKeepAsEnd, replaceEnd = true },
	context,
	text,
	selectionRanges,
}) {
	const isTab = event.key === 'Tab' && tabSelectsStartOnly
	const data = {
		...insertion,
		end: isTab ? '' : insertion.end || '',
		content: isTab
			? ''
			: (!(insertion.omitContentCheck?.() && !event.shiftKey) && insertion.content) || '',
	}
	if (!isTab) {
		if (event.altKey) {
			data.altModify?.()
		}
		if (isMac ? event.metaKey : event.ctrlKey) {
			data.cmdModify?.()
		}
		if (event.shiftKey || data.content) {
			data.shiftModify?.()
		}
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

		const start = savedSelection ? savedSelection.leadingSpaces + data.start : data.start

		// Tab inserts only the start, so the text typed over is dropped rather than wrapped.
		const content = savedSelection && !isTab ? savedSelection.selectedText : data.content
		let end = savedSelection ? data.end + savedSelection.trailingSpaces : data.end
		let to = endPos

		// The typed text ends up inside the insertion, so the closers auto-inserted for it go too.
		for (const closer of getAutoClosers(context.query)) {
			if (text[to] !== closer) break

			to++
		}

		const keepAsEnd = data.keepAsEnd || traitKeepAsEnd
		if (keepAsEnd && !isTab) {
			const [keptEnd, keptDelimiter = keptEnd] = text.substring(to).match(keepAsEnd) || ['']
			if (keptEnd) {
				to += keptEnd.length
				if (replaceEnd) {
					end = keptDelimiter
				}
			}
		}

		const insert = start + content + end

		return {
			from: startPos,
			to,
			insert,
			selection:
				!isTab && (event.shiftKey || (data.selectContent && !content))
					? { from: start.length, to: insert.length - end.length }
					: undefined,
		}
	}

	if (selectionRanges.length > 1) {
		const replacements = [...selectionRanges]
			.sort((a, b) => a.from - b.from)
			.map((range, index) => getReplacement(range, data.autocompleteSelections?.[index]))
		if (replacements.every((replacement) => replacement !== undefined)) {
			return replacements
		}
	}

	const endPos = context.mentionPosition + triggerText.length
	const replacement = getReplacement({ from: endPos, to: endPos }, data.autocompleteSelections?.[0])

	return replacement ? [replacement] : []
}
