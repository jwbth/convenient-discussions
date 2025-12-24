import BaseAutocomplete from './BaseAutocomplete'
import cd from './loader/cd'
import { underlinesToSpaces } from './shared/utils-general'

/**
 * @typedef {object} CommentLinkEntry
 * @property {string} label
 * @property {string} urlFragment
 * @property {string} [authorName]
 * @property {string} [timestamp]
 * @property {string} [headline]
 */

/**
 * @typedef {object} ConfigExtension
 * @property {object} [data] Data object
 * @property {import('./Comment').default[]} [data.comments] List of comments for
 *   autocomplete
 * @property {import('./Section').default[]} [data.sections] List of sections for
 *   autocomplete
 */

/**
 * Autocomplete class for comment and section links. Handles [[# trigger for linking to comments
 * and sections on the current page.
 */
class CommentLinksAutocomplete extends BaseAutocomplete {
	/**
	 * Create a CommentLinksAutocomplete instance.
	 *
	 * @param {import('./AutocompleteManager').AutocompleteConfigShared & ConfigExtension} config
	 *   Configuration object
	 */
	// eslint-disable-next-line @typescript-eslint/no-useless-constructor
	constructor(config) {
		// The constructor is used to specify the type of the config parameter
		super(config)
	}

	/**
	 * Get the display label for comment links autocomplete.
	 *
	 * @override
	 * @returns {string}
	 */
	getLabel() {
		return cd.s('cf-autocomplete-commentlinks-label')
	}

	/**
	 * Get the trigger string for comment links autocomplete.
	 *
	 * @override
	 * @returns {string}
	 */
	getTrigger() {
		return '[[#'
	}

	/**
	 * Transform a comment links entry into insertion data for Tribute.
	 *
	 * @override
	 * @param {CommentLinkEntry} entry The comment links entry to transform
	 * @param {string} [selectedText] Text that was selected before typing the autocomplete trigger
	 * @returns {import('./tribute/Tribute').InsertData & { end: string, content: string }}
	 */
	getInsertionFromEntry(entry, selectedText) {
		// Use selected text if available, otherwise use the default content
		const defaultContent =
			'timestamp' in entry
				? cd.s('cf-autocomplete-commentlinks-text', entry.authorName, entry.timestamp)
				: /** @type {string} */ (entry.headline)

		return {
			start: `[[#${entry.urlFragment}|`,
			end: ']]',
			content: selectedText || defaultContent,
		}
	}

	/**
	 * Make an API request for comment links. This is not used since comment links
	 * are generated from local data only.
	 *
	 * @override
	 * @param {string} _text The search text
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
	 * Validate input text for comment links autocomplete.
	 *
	 * @override
	 * @param {string} text The input text to validate
	 * @returns {boolean} Whether the input is valid
	 */
	validateInput(text) {
		// Comment links autocomplete rejects input with forbidden characters
		return !/[#<>[\]|{}]/.test(text)
	}

	/**
	 * Extract the display label from a comment links entry.
	 *
	 * @override
	 * @param {CommentLinkEntry} entry The comment links entry to extract label from
	 * @returns {string} The display label
	 */
	getLabelFromEntry(entry) {
		return entry.label
	}

	/**
	 * Get collection-specific properties for Tribute configuration.
	 *
	 * @override
	 * @returns {Partial<import('./tribute/Tribute').TributeCollection>} Collection properties
	 */
	getCollectionProperties() {
		return {
			keepAsEnd: /^\]\]/,
		}
	}

	/**
	 * @override
	 */
	defaultLazy = () => this.generateCommentLinksData()

	/**
	 * Generate comment links data from comments and sections.
	 *
	 * @returns {CommentLinkEntry[]} Array of comment and section link entries
	 * @private
	 */
	generateCommentLinksData() {
		const comments = /** @type {import('./Comment').default[]} */ (this.data.comments || [])

		// Process comments into comment link items
		const commentItems = comments.reduce((acc, comment) => {
			const urlFragment = comment.getUrlFragment()
			if (!urlFragment) {
				return acc
			}

			const authorName = comment.author.getName()
			const timestamp = comment.timestamp

			// Generate comment snippet
			let snippet
			const snippetMaxLength = 80
			if (comment.getText().length > snippetMaxLength) {
				snippet = comment.getText().slice(0, snippetMaxLength)
				const spacePos = snippet.lastIndexOf(cd.mws('word-separator', { language: 'content' }))
				if (spacePos !== -1) {
					snippet = snippet.slice(0, spacePos)
					if (/[.…,;!?:-—–]/.test(snippet[snippet.length - 1])) {
						snippet += ' '
					}
					snippet += cd.s('ellipsis')
				}
			} else {
				snippet = comment.getText()
			}

			// Build display key
			let authorTimestamp = authorName
			if (timestamp) {
				authorTimestamp += cd.mws('comma-separator', { language: 'content' }) + timestamp
			}

			acc.push({
				label: authorTimestamp + cd.mws('colon-separator', { language: 'content' }) + snippet,
				urlFragment,
				authorName,
				timestamp,
			})

			return acc
		}, /** @type {CommentLinkEntry[]} */ ([]))

		const sections = /** @type {import('./Section').default[]} */ (this.data.sections || [])

		// Process sections into section link entries
		const sectionItems = sections.reduce((acc, section) => {
			acc.push({
				label: underlinesToSpaces(section.id),
				urlFragment: underlinesToSpaces(section.id),
				headline: section.headline,
			})

			return acc
		}, /** @type {CommentLinkEntry[]} */ ([]))

		return commentItems.concat(sectionItems)
	}
}

export default CommentLinksAutocomplete
