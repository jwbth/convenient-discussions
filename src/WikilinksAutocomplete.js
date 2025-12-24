import BaseAutocomplete from './BaseAutocomplete'
import cd from './loader/cd'
import { charAt, phpCharToUpper } from './shared/utils-general'
import { handleApiReject } from './utils-api'

/**
 * @typedef {string} WikilinkEntry
 */

/**
 * @typedef {object} SectionData
 * @property {string} pageName The page name before the #
 * @property {string} fragment The section fragment after the #
 */

/**
 * Autocomplete class for wikilinks (page links). Handles page name validation, OpenSearch API
 * integration, colon prefixes, namespace logic, case sensitivity, and section autocomplete.
 *
 * @augments BaseAutocomplete
 */
class WikilinksAutocomplete extends BaseAutocomplete {
	/**
	 * @override
	 * @returns {string}
	 */
	getLabel() {
		return cd.s('cf-autocomplete-wikilinks-label')
	}

	/**
	 * @override
	 * @returns {string}
	 */
	getTrigger() {
		return '[['
	}

	/**
	 * Transform a page name entry into insertion data for the Tribute library.
	 *
	 * @override
	 * @param {string} entry The page name to transform
	 * @param {string} [selectedText] Text that was selected before typing the autocomplete trigger
	 * @returns {import('./tribute/Tribute').InsertData & { end: string }}
	 */
	getInsertionFromEntry(entry, selectedText) {
		const pageName = entry.trim()

		return {
			start: '[[' + pageName,
			end: ']]',
			content: selectedText,
			shiftModify() {
				this.content ??= this.start.slice(2)
				this.start += '|'
			},
		}
	}

	/**
	 * @override
	 * @param {string} text The input text to validate
	 * @returns {boolean} Whether the input is valid for wikilinks
	 */
	validateInput(text) {
		const sectionData = this.detectSectionFragment(text)

		if (sectionData) {
			// Validate section fragment (less restrictive than page names)
			return this.validateSectionFragment(sectionData.fragment)
		}

		// Validate page name
		return this.validatePageName(text)
	}

	/**
	 * Validate a page name (without section fragment).
	 *
	 * @param {string} text The page name to validate
	 * @returns {boolean} Whether the page name is valid
	 * @private
	 */
	validatePageName(text) {
		const allNssPattern = Object.keys(mw.config.get('wgNamespaceIds')).filter(Boolean).join('|')

		const valid =
			text &&
			text !== ':' &&
			text.length <= 255 &&
			// 10 spaces in a page name seems too many.
			(text.match(new RegExp(cd.mws('word-separator', { language: 'content' }), 'g')) || [])
				.length <= 9 &&
			// Forbidden characters
			!/[#<>[\]|{}]/.test(text) &&
			// Interwikis
			!(
				(text.startsWith(':') || /^[a-z-]\w*:/.test(text)) &&
				!new RegExp(`^:?(?:${allNssPattern}):`, 'i').test(text)
			)

		return Boolean(valid)
	}

	/**
	 * Validate a section fragment.
	 *
	 * @param {string} fragment The section fragment to validate
	 * @returns {boolean} Whether the fragment is valid
	 * @private
	 */
	validateSectionFragment(fragment) {
		// Section fragments are less restrictive than page names
		// They can be empty (to show all sections) and have fewer forbidden characters
		return (
			fragment.length <= 255 &&
			// Forbidden characters in fragments
			!/[<>[\]|{}]/.test(fragment)
		)
	}

	/**
	 * @override
	 * @param {string} text The search text
	 * @returns {Promise<string[]>} Promise resolving to array of page name or section suggestions
	 */
	async makeApiRequest(text) {
		const sectionData = this.detectSectionFragment(text)

		if (sectionData) {
			return await this.getSectionSuggestions(sectionData.pageName, sectionData.fragment)
		}

		return await this.getPageSuggestions(text)
	}

	/**
	 * Get page name suggestions using OpenSearch API.
	 *
	 * @param {string} text The search text
	 * @returns {Promise<string[]>} Promise resolving to array of page name suggestions
	 * @private
	 */
	async getPageSuggestions(text) {
		let colonPrefix = false
		if (cd.g.colonNamespacesPrefixRegexp.test(text)) {
			text = text.slice(1)
			colonPrefix = true
		}

		const response = await BaseAutocomplete.makeOpenSearchRequest({
			search: text,
			redirects: 'return',
		})

		return response[1].map((/** @type {string} */ name) => {
			if (mw.config.get('wgCaseSensitiveNamespaces').length) {
				const title = mw.Title.newFromText(name)
				if (
					!title ||
					!mw.config.get('wgCaseSensitiveNamespaces').includes(title.getNamespaceId())
				) {
					name = this.useOriginalFirstCharCase(name, text)
				}
			} else {
				name = this.useOriginalFirstCharCase(name, text)
			}

			return name.replace(/^/, colonPrefix ? ':' : '')
		})
	}

	/**
	 * Get section suggestions for a page using the Parse API.
	 *
	 * @param {string} pageName The page to get sections from
	 * @param {string} fragmentQuery The partial section name to search
	 * @returns {Promise<string[]>} Section suggestions in format "PageName#Section"
	 * @private
	 */
	async getSectionSuggestions(pageName, fragmentQuery) {
		// Normalize page title
		const title = mw.Title.newFromText(pageName)
		if (!title) {
			// Invalid page name, return user's input as-is
			return [pageName + '#' + fragmentQuery]
		}

		const normalizedPageName = title.getPrefixedText()

		// Check cache for sections of this page
		const cacheKey = `sections:${normalizedPageName}`
		let sections = /** @type {Array<{ anchor: string, line: string }> | undefined} */ (
			this.cache.get(cacheKey)
		)

		if (!sections) {
			try {
				// Fetch sections from API
				const response = await BaseAutocomplete.createDelayedPromise(async (resolve) => {
					const apiResponse = await cd
						.getApi(BaseAutocomplete.apiConfig)
						.get({
							action: 'parse',
							page: normalizedPageName,
							prop: 'sections',
						})
						.catch(handleApiReject)

					if (BaseAutocomplete.currentPromise) {
						BaseAutocomplete.promiseIsNotSuperseded(BaseAutocomplete.currentPromise)
					}
					resolve(apiResponse)
				})

				const parsedSections = (response?.parse?.sections || []).map(
					(/** @type {any} */ section) => ({
						anchor: section.linkAnchor.replace(/_/g, ' '),
						line: section.line,
					}),
				)

				sections = parsedSections

				// Cache sections for this page (cast to any[] for cache compatibility)
				this.cache.set(cacheKey, /** @type {any[]} */ (parsedSections))
			} catch {
				// API error or page doesn't exist, return user's input as-is
				return [pageName + '#' + fragmentQuery]
			}
		}

		// At this point sections is guaranteed to be defined
		if (!sections) {
			return [pageName + '#' + fragmentQuery]
		}

		// Filter and format results
		const normalizedQuery = this.normalizeSectionName(fragmentQuery)
		let results = sections
			.filter((section) => this.normalizeSectionName(section.line).includes(normalizedQuery))
			.sort((a, b) => {
				// Prioritize prefix matches
				const aStarts = this.normalizeSectionName(a.line).startsWith(normalizedQuery)
				const bStarts = this.normalizeSectionName(b.line).startsWith(normalizedQuery)

				return Number(bStarts) - Number(aStarts)
			})
			.map((section) => `${pageName}#${section.anchor}`)

		// If no matches or empty query, show all sections (up to limit)
		if (results.length === 0 && fragmentQuery === '') {
			results = sections.slice(0, 10).map((section) => `${pageName}#${section.anchor}`)
		}

		return results
	}

	/**
	 * Extract the display label from a wikilink entry.
	 *
	 * @override
	 * @param {string} entry The wikilink entry to extract label from
	 * @returns {string} The display label
	 */
	getLabelFromEntry(entry) {
		return entry
	}

	/**
	 * Get collection-specific properties for Tribute configuration.
	 *
	 * @override
	 * @returns {Partial<import('./tribute/Tribute').TributeCollection>} Collection properties
	 */
	getCollectionProperties() {
		return {
			keepAsEnd: /^(?:\||\]\])/,
		}
	}

	/**
	 * Check if the input text contains a section fragment.
	 *
	 * @param {string} text The input text
	 * @returns {SectionData | undefined} Section data if fragment detected, undefined otherwise
	 * @private
	 */
	detectSectionFragment(text) {
		const hashIndex = text.indexOf('#')
		if (hashIndex === -1) return undefined

		const pageName = text.slice(0, hashIndex)
		const fragment = text.slice(hashIndex + 1)

		// Only treat as section if page name is valid
		if (!pageName || !this.validatePageName(pageName)) {
			return undefined
		}

		return { pageName, fragment }
	}

	/**
	 * Normalize section name for comparison (case-insensitive, underscores to spaces).
	 *
	 * @param {string} name Section name
	 * @returns {string} Normalized name
	 * @private
	 */
	normalizeSectionName(name) {
		return name.toLowerCase().replace(/_/g, ' ')
	}

	/**
	 * Use the original first character case from the query in the result.
	 *
	 * @param {string} result The result from API
	 * @param {string} query The original query
	 * @returns {string} Result with corrected first character case
	 * @private
	 */
	useOriginalFirstCharCase(result, query) {
		// But ignore cases with all caps in the first word like ABBA
		const firstWord = result.split(' ')[0]
		if (firstWord.length > 1 && firstWord.toUpperCase() === firstWord) {
			return result
		}

		const firstChar = charAt(query, 0)
		const firstCharUpperCase = phpCharToUpper(firstChar)

		return result.replace(
			new RegExp(
				// First character pattern
				'^' +
					(firstCharUpperCase === firstChar
						? mw.util.escapeRegExp(firstChar)
						: '[' + firstCharUpperCase + firstChar + ']'),
			),
			firstChar,
		)
	}
}

export default WikilinksAutocomplete
