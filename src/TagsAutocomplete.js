import BaseAutocomplete from './BaseAutocomplete'
import cd from './loader/cd'
import { ensureArray } from './shared/utils-general'

/**
 * @typedef {string | [string, string, string?]} TagEntry
 */

/**
 * Autocomplete class for HTML tags. Handles both simple tags and complex tag structures
 * with parameters.
 */
class TagsAutocomplete extends BaseAutocomplete {
	/**
	 * Create the default lazy loading function for tags.
	 *
	 * @returns {TagEntry[]} The default tag entries
	 * @override
	 */
	defaultLazy = () => {
		/** @type {TagEntry[]} */
		const tagAdditions = [
			// An element can be an array of a string to display and strings to insert before and after
			// the caret.
			['br', '<br>'],

			// Use .join() because otherwise the closing </nowiki> would get onto the wiki page and have
			// undesirable effects
			['codenowiki', '<code><nowiki>', ['</', 'nowiki></code>'].join('')],

			['hr', '<hr>'],
			['wbr', '<wbr>'],
			['gallery', '<gallery>\n', '\n</gallery>'],
			['references', '<references />'],
			['section', '<section />'],
			['syntaxhighlight lang=""', '<syntaxhighlight lang="">\n', '\n</syntaxhighlight>'],
			['syntaxhighlight inline lang=""', '<syntaxhighlight inline lang="">', '</syntaxhighlight>'],
			['syntaxhighlight', '<syntaxhighlight>\n', '\n</syntaxhighlight>'],
			['templatestyles', '<templatestyles src="', '" />'],
		]

		return /** @type {Array<TagEntry>} */ (cd.g.allowedTags)
			.filter((tagString) => !tagAdditions.some((tagArray) => tagArray[0] === tagString))
			.concat(tagAdditions)
			.sort((item1, item2) => (ensureArray(item1)[0] > ensureArray(item2)[0] ? 1 : -1))
	}

	/** @override */
	allowNesting = true

	/**
	 * Get the display label for tags autocomplete.
	 *
	 * @override
	 * @returns {string}
	 */
	getLabel() {
		return cd.s('cf-autocomplete-tags-label')
	}

	/**
	 * Get the trigger character for tags autocomplete.
	 *
	 * @override
	 * @returns {string}
	 */
	getTrigger() {
		return '<'
	}

	/**
	 * Transform a tag entry into insertion data for the Tribute library.
	 *
	 * @override
	 * @param {TagEntry} entry The tag entry to transform
	 * @param {string} [selectedText] Text that was selected before typing the autocomplete trigger
	 * @returns {import('./tribute/Tribute').InsertData}
	 */
	getInsertionFromEntry(entry, selectedText) {
		return {
			start: Array.isArray(entry) ? entry[1] : `<${entry}>`,
			end: Array.isArray(entry) ? entry[2] : `</${entry}>`,
			content: selectedText,
			selectContent: !selectedText,
		}
	}

	/**
	 * Validate input text for tags autocomplete.
	 *
	 * @override
	 * @param {string} text The input text to validate
	 * @returns {boolean} Whether the input is valid
	 */
	validateInput(text) {
		// Tags autocomplete only works with alphabetic characters
		return Boolean(text && /^[a-z]+$/i.test(text))
	}

	/**
	 * Tags autocomplete doesn't make API requests - it only uses predefined lists.
	 *
	 * @override
	 * @param {string} _text The search text (unused)
	 * @returns {Promise<string[]>} Empty array since no API requests are made
	 */
	// eslint-disable-next-line @typescript-eslint/require-await
	async makeApiRequest(_text) {
		return []
	}

	/**
	 * Check if this is a local-only autocomplete (no API requests).
	 *
	 * @override
	 * @returns {boolean}
	 * @protected
	 */
	isLocalOnly() {
		return true
	}

	/**
	 * Get local matches for tags using custom regex matching.
	 *
	 * @override
	 * @param {string} text The search text
	 * @returns {TagEntry[]} Matching tag entries
	 * @protected
	 */
	getLocalMatches(text) {
		// Filter tags that start with the input text
		const regexp = new RegExp('^' + mw.util.escapeRegExp(text), 'i')

		return this.getDefaultEntries().filter((tag) => regexp.test(Array.isArray(tag) ? tag[0] : tag))
	}

	/**
	 * Extract the display label from a tag entry.
	 *
	 * @override
	 * @param {TagEntry} entry The tag entry to extract label from
	 * @returns {string} The display label
	 */
	getLabelFromEntry(entry) {
		return Array.isArray(entry) ? entry[0] : entry
	}

	/**
	 * Get collection-specific properties for Tribute configuration.
	 *
	 * @override
	 * @returns {Partial<import('./tribute/Tribute').TributeCollection>} Collection properties
	 */
	getCollectionProperties() {
		return {
			keepAsEnd: /^>/,
			replaceEnd: false,
		}
	}
}

export default TagsAutocomplete
