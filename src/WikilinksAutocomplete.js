import BaseAutocomplete from './BaseAutocomplete'
import CrossSiteMwTitle from './CrossSiteMwTitle'
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
 * @typedef {object} InterwikiResolution
 * @property {string} hostname The resolved remote hostname
 * @property {string} pageName The page name without the interwiki prefix
 */

/**
 * Autocomplete class for wikilinks (page links). Handles page name validation, OpenSearch API
 * integration, colon prefixes, namespace logic, case sensitivity, section autocomplete, and
 * interwiki prefix resolution.
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

		// A candidate interwiki prefix: matches `prefix:rest` where prefix is not a known namespace.
		// These are allowed through so that interwiki resolution can be attempted.
		const isCandidateInterwiki =
			/^[a-z-]\w*:/.test(text) && !new RegExp(`^(?:${allNssPattern}):`, 'i').test(text)

		const valid =
			text &&
			text !== ':' &&
			text.length <= 255 &&
			// 10 spaces in a page name seems too many.
			(text.match(new RegExp(cd.mws('word-separator', { language: 'content' }), 'g')) || [])
				.length <= 9 &&
			// Forbidden characters
			!/[#<>[\]|{}]/.test(text) &&
			// Interwikis: allow candidate interwiki prefixes through; only reject colon-prefixed
			// non-namespace strings that aren't candidate interwikis.
			!(text.startsWith(':') && !new RegExp(`^:?(?:${allNssPattern}):`, 'i').test(text)) &&
			// Reject explicit non-namespace colon prefixes that aren't interwiki candidates
			!(
				!isCandidateInterwiki &&
				/^[a-z-]\w*:/.test(text) &&
				!new RegExp(`^(?:${allNssPattern}):`, 'i').test(text)
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
	 * Attempt to resolve a candidate interwiki prefix in the given text using
	 * `getUrlFromInterwikiLink`. Returns the resolved hostname and the page name portion (after all
	 * interwiki prefixes), or `undefined` if the text is not an interwiki link or resolution fails.
	 *
	 * @param {string} text The input text potentially containing an interwiki prefix
	 * @returns {Promise<InterwikiResolution | undefined>}
	 * @private
	 */
	async resolveInterwikiPrefix(text) {
		if (!window.getUrlFromInterwikiLink) {
			try {
				await mw.loader.getScript(
					'https://en.wikipedia.org/w/index.php?title=User:Jack_who_built_the_house/getUrlFromInterwikiLink.js&action=raw&ctype=text/javascript',
				)
			} catch {
				return undefined
			}
		}

		if (!window.getUrlFromInterwikiLink) {
			return undefined
		}

		const allNssPattern = Object.keys(mw.config.get('wgNamespaceIds')).filter(Boolean).join('|')
		const isCandidateInterwiki =
			/^[a-z-]\w*:/.test(text) && !new RegExp(`^(?:${allNssPattern}):`, 'i').test(text)

		if (!isCandidateInterwiki) {
			return undefined
		}

		// Collect all prefix boundary positions (e.g. "ru:wikt:Foo" → ["ru:", "ru:wikt:"]).
		// We try each from shortest to longest: the first one that resolves to a different host is
		// the actual interwiki prefix. Everything after it is the page name (which may itself contain
		// namespace prefixes valid on the target wiki, e.g. "ru:mediawiki:Foo" → pageName
		// "mediawiki:Foo" on ru.wikipedia.org).
		const prefixBoundaries = []
		const prefixRe = /[a-z-]\w*:/gi
		let m
		while ((m = prefixRe.exec(text)) !== null) {
			const boundary = m.index + m[0].length
			// Stop once we've consumed non-prefix characters
			if (m.index !== (prefixBoundaries.length === 0 ? 0 : prefixBoundaries.at(-1))) {
				break
			}
			prefixBoundaries.push(boundary)
		}

		if (!prefixBoundaries.length) {
			return undefined
		}

		const currentHostname = mw.config.get('wgServerName')

		for (const boundary of prefixBoundaries) {
			const candidate = text.slice(0, boundary)
			let url
			try {
				// Use a sentinel page name so getUrlFromInterwikiLink can resolve the prefix
				url = await window.getUrlFromInterwikiLink(`${candidate}X`)
			} catch {
				continue
			}

			if (!url) {
				continue
			}

			const resolvedHostname = new URL(url, cd.g.server).hostname
			if (resolvedHostname !== currentHostname) {
				return { hostname: resolvedHostname, pageName: text.slice(boundary) }
			}
		}

		return undefined
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

		// Attempt interwiki resolution for candidate prefixes
		const interwiki = await this.resolveInterwikiPrefix(text)

		if (interwiki) {
			return await this.getCrossSitePageSuggestions(text, interwiki)
		}

		const response = await BaseAutocomplete.makeOpenSearchRequest({
			search: text,
			redirects: 'return',
		})

		return response[1].map((/** @type {string} */ name) => {
			const caseSensitiveNamespaces = mw.config.get('wgCaseSensitiveNamespaces')
			if (caseSensitiveNamespaces.length) {
				const title = CrossSiteMwTitle.newFromText(name)
				if (!title || !caseSensitiveNamespaces.includes(title.getNamespaceId())) {
					name = this.useOriginalFirstCharCase(name, text)
				}
			} else {
				name = this.useOriginalFirstCharCase(name, text)
			}

			return name.replace(/^/, colonPrefix ? ':' : '')
		})
	}

	/**
	 * Get page suggestions from a remote wiki using a ForeignApi OpenSearch request.
	 *
	 * @param {string} text The full input text including interwiki prefix(es)
	 * @param {InterwikiResolution} interwiki Resolved interwiki data
	 * @returns {Promise<string[]>} Page name suggestions preserving the original interwiki prefix
	 * @private
	 */
	async getCrossSitePageSuggestions(text, interwiki) {
		const { hostname, pageName } = interwiki
		const wgScriptPath = mw.config.get('wgScriptPath')
		const foreignApi = new mw.ForeignApi(`https://${hostname}${wgScriptPath}/api.php`, {
			anonymous: true,
		})

		await CrossSiteMwTitle.loadHostData(hostname, foreignApi)

		const response = /** @type {import('./AutocompleteManager').OpenSearchResults} */ (
			await BaseAutocomplete.createDelayedPromise(async (resolve) => {
				const apiResponse = await foreignApi
					.get({
						action: 'opensearch',
						search: pageName,
						redirects: 'return',
						limit: 10,
					})
					.catch(handleApiReject)

				if (BaseAutocomplete.currentPromise) {
					BaseAutocomplete.promiseIsNotSuperseded(BaseAutocomplete.currentPromise)
				}
				resolve(apiResponse)
			})
		)

		// Reconstruct the full interwiki-prefixed name from the result
		const prefixPart = text.slice(0, text.length - pageName.length)

		return response[1].map((/** @type {string} */ name) => {
			const caseSensitiveNamespaces = CrossSiteMwTitle.getHostData(hostname).caseSensitiveNamespaces
			if (caseSensitiveNamespaces.length) {
				const title = CrossSiteMwTitle.newFromText(name, undefined, hostname)
				if (!title || !caseSensitiveNamespaces.includes(title.getNamespaceId())) {
					name = this.useOriginalFirstCharCase(name, pageName)
				}
			} else {
				name = this.useOriginalFirstCharCase(name, pageName)
			}

			return prefixPart + name
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
		// Attempt interwiki resolution for cross-site pages
		const interwiki = await this.resolveInterwikiPrefix(pageName)

		/** @type {string} */
		let normalizedPageName
		/** @type {mw.ForeignApi | undefined} */
		let foreignApi

		if (interwiki) {
			const { hostname, pageName: remotePageName } = interwiki
			const wgScriptPath = mw.config.get('wgScriptPath')
			foreignApi = new mw.ForeignApi(`https://${hostname}${wgScriptPath}/api.php`, {
				anonymous: true,
			})
			await CrossSiteMwTitle.loadHostData(hostname, foreignApi)

			const title = CrossSiteMwTitle.newFromText(remotePageName, undefined, hostname)
			if (!title) {
				return [pageName + '#' + fragmentQuery]
			}

			normalizedPageName = title.getPrefixedText()
		} else {
			const title = CrossSiteMwTitle.newFromText(pageName)
			if (!title) {
				return [pageName + '#' + fragmentQuery]
			}

			normalizedPageName = title.getPrefixedText()
		}

		// Check cache for sections of this page
		const cacheKey = `sections:${normalizedPageName}`
		let sections = /** @type {Array<{ anchor: string, line: string }> | undefined} */ (
			this.cache.get(cacheKey)
		)

		if (!sections) {
			try {
				// Fetch sections from API (local or foreign)
				const response = await BaseAutocomplete.createDelayedPromise(async (resolve) => {
					const api = foreignApi || cd.getApi(BaseAutocomplete.apiConfig)
					const apiResponse = await api
						.get({
							action: 'parse',
							page: normalizedPageName,
							prop: 'sections',
							redirects: true,
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
