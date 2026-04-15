import BaseAutocomplete from './BaseAutocomplete'
import CrossSiteMwTitle from './CrossSiteMwTitle'
import cd from './loader/cd'
import { parseWikiUrl } from './shared/utils-general'
import { handleApiReject } from './utils-api'

/**
 * @typedef {object} WikilinkEntry
 * @property {CrossSiteMwTitle} title The resolved title object
 * @property {string} [pageName] The page name as returned from the API (for insertion)
 * @property {string} [fragment] Section fragment (without the `#`)
 * @property {boolean} [colonPrefix] Whether the user typed a leading `:` (e.g. `:Category:Foo`)
 * @property {string} [interwikiPrefix] The interwiki prefix portion (e.g. `"en:"` or `"w:en:"`)
 * @property {string} label The display string shown in the menu and used for searching
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
	 * Transform a wikilink entry into insertion data for the Tribute library.
	 *
	 * Inserts a leading `:` after `[[` when:
	 * - the page is in the Category namespace (namespace 14), or
	 * - the interwiki prefix is one of the known interlanguage prefixes.
	 *
	 * @override
	 * @param {WikilinkEntry} entry The wikilink entry to transform
	 * @param {string} [selectedText] Text that was selected before typing the autocomplete trigger
	 * @returns {import('./tribute/Tribute').InsertData & { end: string }}
	 */
	getInsertionFromEntry(entry, selectedText) {
		const { title, pageName, fragment, colonPrefix, interwikiPrefix = '' } = entry
		const pageNameForInsertion = pageName ?? title.getPrefixedText()
		const needsColon = !colonPrefix && this.needsColonPrefix(title, interwikiPrefix)
		const colonStr = colonPrefix ? ':' : needsColon ? ':' : ''
		const fragmentStr = fragment === undefined ? '' : '#' + fragment

		return {
			start: '[[' + colonStr + interwikiPrefix + pageNameForInsertion + fragmentStr,
			end: ']]',
			content: selectedText,
			shiftModify() {
				this.content ??= this.start.slice(2)
				this.start += '|'
			},
		}
	}

	/**
	 * Determine whether a leading `:` should be inserted after `[[` for the given title.
	 *
	 * Returns `true` when:
	 * - the namespace is 14 (Category), or
	 * - the interwiki prefix is one of the known interlanguage prefixes.
	 *
	 * @param {CrossSiteMwTitle} title
	 * @param {string} interwikiPrefix The interwiki prefix portion from the entry (e.g. `"en:"` or
	 *   `"w:en:"`)
	 * @returns {boolean}
	 * @private
	 */
	needsColonPrefix(title, interwikiPrefix) {
		if (title.getNamespaceId() === 14) {
			return true
		}

		return WikilinksAutocomplete.interwikiPrefixes.has(interwikiPrefix.split(':')[0])
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

		// Check if text after leading colon is a candidate interwiki
		const isCandidateInterwikiWithColon =
			/^:[a-z-]\w*:/.test(text) && !new RegExp(`^:(?:${allNssPattern}):`, 'i').test(text)

		const valid =
			text &&
			text !== ':' &&
			text.length <= 255 &&
			// 10 spaces in a page name seems too many.
			(text.match(new RegExp(cd.mws('word-separator', { language: 'content' }), 'g')) || [])
				.length <= 9 &&
			// Forbidden characters
			!/[#<>[\]|{}]/.test(text) &&
			// Interwikis: allow candidate interwiki prefixes through (with or without leading colon);
			// only reject colon-prefixed non-namespace strings that aren't candidate interwikis.
			!(
				text.startsWith(':') &&
				!isCandidateInterwikiWithColon &&
				!new RegExp(`^:?(?:${allNssPattern}):`, 'i').test(text)
			) &&
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
	 * @returns {Promise<WikilinkEntry[]>} Promise resolving to array of page name or section suggestions
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
		if (!window.getUrlFromInterwikiLink && cd.g.isProbablyWmfSulWiki) {
			if (!WikilinksAutocomplete.getUrlFromInterwikiLinkPromise) {
				WikilinksAutocomplete.getUrlFromInterwikiLinkPromise = mw.loader
					.getScript(
						// Documentation: https://en.wikipedia.org/wiki/User:Jack_who_built_the_house/getUrlFromInterwikiLink
						'https://en.wikipedia.org/w/index.php?title=User:Jack_who_built_the_house/getUrlFromInterwikiLink.js&action=raw&ctype=text/javascript',
					)
					.catch((/** @type {unknown} */ error) => {
						delete WikilinksAutocomplete.getUrlFromInterwikiLinkPromise
						throw error
					})
			}

			try {
				await WikilinksAutocomplete.getUrlFromInterwikiLinkPromise
			} catch {
				return
			}
		}

		if (!window.getUrlFromInterwikiLink) return

		if (!/^[a-z-]\w*:/.test(text)) return

		const allNssPattern = Object.keys(mw.config.get('wgNamespaceIds')).filter(Boolean).join('|')
		if (new RegExp(`^(?:${allNssPattern}):`, 'i').test(text)) return

		let url
		try {
			url = await window.getUrlFromInterwikiLink(text)
		} catch {
			return
		}

		if (!url) return

		const parsed = parseWikiUrl(url)
		if (!parsed || parsed.hostname === mw.config.get('wgServerName')) return

		return { hostname: parsed.hostname, pageName: parsed.pageName }
	}

	/**
	 * Get page name suggestions using OpenSearch API.
	 *
	 * @param {string} text The search text
	 * @returns {Promise<WikilinkEntry[]>} Promise resolving to array of page name suggestions
	 * @private
	 */
	async getPageSuggestions(text) {
		let colonPrefix = false
		let textForApi = text

		// Check for leading colon (for categories, files, or interwikis)
		if (text.startsWith(':')) {
			textForApi = text.slice(1)
			colonPrefix = true
		}

		// Attempt interwiki resolution for candidate prefixes (use stripped text)
		const interwiki = await this.resolveInterwikiPrefix(textForApi)

		if (interwiki) {
			return await this.getCrossSitePageSuggestions(textForApi, interwiki, colonPrefix)
		}

		const response = await BaseAutocomplete.makeOpenSearchRequest({
			search: textForApi,
			redirects: 'return',
		})

		return response[1].flatMap((/** @type {string} */ apiName) => {
			const title = CrossSiteMwTitle.newFromText(apiName)
			if (!title) return []

			// Only apply case fix for main namespace (no prefix)
			let pageName = apiName
			if (title.getNamespaceId() === 0) {
				const caseSensitiveNamespaces = mw.config.get('wgCaseSensitiveNamespaces')
				const isCaseSensitive =
					caseSensitiveNamespaces.length && caseSensitiveNamespaces.includes(0)
				if (!isCaseSensitive) {
					pageName = this.useOriginalFirstCharCase(apiName, textForApi)
				}
			}

			const label = (colonPrefix ? ':' : '') + pageName

			return /** @type {WikilinkEntry} */ ({ title, pageName, colonPrefix, label })
		})
	}

	/**
	 * Get page suggestions from a remote wiki using a ForeignApi OpenSearch request.
	 *
	 * @param {string} text The full input text including interwiki prefix(es)
	 * @param {InterwikiResolution} interwiki Resolved interwiki data
	 * @param {boolean} [colonPrefix] Whether the user typed a leading `:`
	 * @returns {Promise<WikilinkEntry[]>} Page name suggestions preserving the original interwiki prefix
	 * @private
	 */
	async getCrossSitePageSuggestions(text, interwiki, colonPrefix = false) {
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

		// The interwiki prefix is everything before the remote page name in the original text
		const interwikiPrefix = this.extractInterwikiPrefix(text, pageName)

		return response[1].flatMap((/** @type {string} */ apiName) => {
			const title = CrossSiteMwTitle.newFromText(apiName, undefined, hostname)
			if (!title) return []

			// For interwiki links, never apply case fix - use API name as-is
			const label = (colonPrefix ? ':' : '') + interwikiPrefix + apiName

			return /** @type {WikilinkEntry} */ ({
				title,
				pageName: apiName,
				colonPrefix,
				interwikiPrefix,
				label,
			})
		})
	}

	/**
	 * Get section suggestions for a page using the Parse API.
	 *
	 * @param {string} pageName The page to get sections from
	 * @param {string} fragmentQuery The partial section name to search
	 * @returns {Promise<WikilinkEntry[]>} Section suggestions
	 * @private
	 */
	async getSectionSuggestions(pageName, fragmentQuery) {
		// Strip leading colon if present (for categories, files, or interwikis)
		let colonPrefix = false
		let pageNameForApi = pageName
		if (pageName.startsWith(':')) {
			pageNameForApi = pageName.slice(1)
			colonPrefix = true
		}

		// Attempt interwiki resolution for cross-site pages (use stripped page name)
		const interwiki = await this.resolveInterwikiPrefix(pageNameForApi)

		/** @type {string} */
		let normalizedPageName
		/** @type {mw.ForeignApi | undefined} */
		let foreignApi
		/** @type {CrossSiteMwTitle | null} */
		let pageTitle

		if (interwiki) {
			const { hostname, pageName: remotePageName } = interwiki
			const wgScriptPath = mw.config.get('wgScriptPath')
			foreignApi = new mw.ForeignApi(`https://${hostname}${wgScriptPath}/api.php`, {
				anonymous: true,
			})
			await CrossSiteMwTitle.loadHostData(hostname, foreignApi)

			pageTitle = CrossSiteMwTitle.newFromText(remotePageName, undefined, hostname)
			if (!pageTitle) {
				return this.makeFallbackSectionEntry(pageName, fragmentQuery)
			}

			normalizedPageName = pageTitle.getPrefixedText()
		} else {
			pageTitle = CrossSiteMwTitle.newFromText(pageNameForApi)
			if (!pageTitle) {
				return this.makeFallbackSectionEntry(pageName, fragmentQuery)
			}

			normalizedPageName = pageTitle.getPrefixedText()
		}

		// The interwiki prefix is everything before the remote page name in the original pageNameForApi
		const interwikiPrefix = interwiki
			? this.extractInterwikiPrefix(pageNameForApi, interwiki.pageName)
			: undefined

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
				return this.makeFallbackSectionEntry(pageName, fragmentQuery)
			}
		}

		// At this point sections is guaranteed to be defined
		if (!sections) {
			return this.makeFallbackSectionEntry(pageName, fragmentQuery)
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
			.map((section) => {
				const pageNamePart = (colonPrefix ? ':' : '') + (interwikiPrefix ?? '') + normalizedPageName
				const label = pageNamePart + '#' + section.anchor

				return /** @type {WikilinkEntry} */ ({
					title: /** @type {CrossSiteMwTitle} */ (pageTitle),
					pageName: normalizedPageName,
					fragment: section.anchor,
					colonPrefix,
					interwikiPrefix,
					label,
				})
			})

		// If no matches or empty query, show all sections (up to limit)
		if (results.length === 0 && fragmentQuery === '') {
			results = sections.slice(0, 10).map((section) => {
				const pageNamePart = (colonPrefix ? ':' : '') + (interwikiPrefix ?? '') + normalizedPageName
				const label = pageNamePart + '#' + section.anchor

				return /** @type {WikilinkEntry} */ ({
					title: /** @type {CrossSiteMwTitle} */ (pageTitle),
					pageName: normalizedPageName,
					fragment: section.anchor,
					colonPrefix,
					interwikiPrefix,
					label,
				})
			})
		}

		return results
	}

	/**
	 * Create a fallback entry for when a page title can't be resolved, using a plain string label.
	 * The title is constructed from the page name as a best-effort local title.
	 *
	 * @param {string} pageName
	 * @param {string} fragment
	 * @returns {WikilinkEntry[]}
	 * @private
	 */
	makeFallbackSectionEntry(pageName, fragment) {
		const title =
			CrossSiteMwTitle.newFromText(pageName) || CrossSiteMwTitle.newFromText('Main_Page')
		if (!title) return []

		return [
			{
				title,
				pageName,
				fragment,
				label: pageName + '#' + fragment,
			},
		]
	}

	/**
	 * Extract the interwiki prefix from the original user input based on the number of colons
	 * preserved in the remote page name. We determine this by comparing colons rather than string
	 * length, since the URL-derived remote page name might have trailing spaces or underscores
	 * normalized, differing in length from the user input.
	 *
	 * @param {string} text The full user-typed text.
	 * @param {string} remotePageName The page name as resolved on the remote wiki, which has the
	 *   interwiki prefixes stripped.
	 * @returns {string} The interwiki prefix substring from `text`.
	 * @private
	 */
	extractInterwikiPrefix(text, remotePageName) {
		const colonsInText = (text.match(/:/g) || []).length
		const colonsInPageName = (remotePageName.match(/:/g) || []).length
		const prefixColonsCount = colonsInText - colonsInPageName

		if (prefixColonsCount <= 0) return ''

		let colonIndex = -1
		for (let i = 0; i < prefixColonsCount; i++) {
			colonIndex = text.indexOf(':', colonIndex + 1)
		}

		return text.slice(0, colonIndex + 1)
	}

	/**
	 * Extract the display label from a wikilink entry.
	 *
	 * @override
	 * @param {WikilinkEntry} entry The wikilink entry to extract label from
	 * @returns {string} The display label
	 */
	getLabelFromEntry(entry) {
		return entry.label
	}

	/**
	 * Search local entries by label. Overrides the base class to handle `WikilinkEntry` objects.
	 *
	 * @override
	 * @param {string} text Search text
	 * @param {WikilinkEntry[]} list List to search in
	 * @returns {WikilinkEntry[]} Matching entries
	 * @protected
	 */
	searchLocal(text, list) {
		if (list.length === 0) return []

		const containsRegexp = new RegExp(mw.util.escapeRegExp(text), 'i')
		const startsWithRegexp = new RegExp('^' + mw.util.escapeRegExp(text), 'i')

		return list
			.filter((entry) => containsRegexp.test(entry.label))
			.sort(
				(a, b) => Number(startsWithRegexp.test(b.label)) - Number(startsWithRegexp.test(a.label)),
			)
	}

	/**
	 * Process raw entries into {@link import('./BaseAutocomplete').Option} objects for Tribute.
	 * Deduplicates by label since entries are objects (not primitives). Also handles plain strings
	 * (e.g. the user-typed fallback from the base class) by converting them to `WikilinkEntry`
	 * objects on the fly.
	 *
	 * @override
	 * @param {Array<WikilinkEntry | string>} entries Raw entries to process
	 * @returns {import('./BaseAutocomplete').Option<WikilinkEntry>[]} Processed options
	 */
	getOptionsFromEntries(entries) {
		/** @type {Set<string>} */
		const seen = new Set()

		return entries.filter(Boolean).flatMap((entry) => {
			/** @type {WikilinkEntry} */
			let wikilinkEntry
			if (typeof entry === 'string') {
				const title = CrossSiteMwTitle.newFromText(entry)
				if (!title) return []
				wikilinkEntry = { title, pageName: entry, label: entry }
			} else {
				wikilinkEntry = entry
			}

			if (seen.has(wikilinkEntry.label)) return []
			seen.add(wikilinkEntry.label)

			return [{ label: wikilinkEntry.label, entry: wikilinkEntry, autocomplete: this }]
		})
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
			tabSelectsStartOnly: true,
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
		if (hashIndex === -1) return

		const pageName = text.slice(0, hashIndex)
		const fragment = text.slice(hashIndex + 1)

		// Only treat as section if page name is valid
		if (!pageName || !this.validatePageName(pageName)) return

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
	 * Cached promise for loading the getUrlFromInterwikiLink script. Shared across all instances to
	 * avoid parallel requests. Cleared on rejection to allow retrying.
	 *
	 * @type {JQuery.Promise<void> | undefined}
	 */
	static getUrlFromInterwikiLinkPromise

	/*
		To generate a new list, use this. See *interlanguage* prefixes at
		https://en.wikipedia.org/wiki/Special:Interwiki for the generated list.

		```
		const response = await fetch(
				'/w/api.php?action=query&meta=siteinfo&siprop=interwikimap&format=json&formatversion=2'
		)
		const data = await response.json()
		const interlanguagePrefixes = data.query.interwikimap
				.filter(entry => entry.language !== undefined)
				.map(entry => entry.prefix)
			// Couldn't figure out the logic why 'en-simple' is also an interlanguage prefix
			.concat('en-simple')
		console.log(JSON.stringify(interlanguagePrefixes))
		```
	*/
	static interwikiPrefixes = new Set([
		'aa',
		'ab',
		'ace',
		'ady',
		'af',
		'als',
		'alt',
		'am',
		'ami',
		'an',
		'ang',
		'ann',
		'anp',
		'ar',
		'arc',
		'ary',
		'arz',
		'as',
		'ast',
		'atj',
		'av',
		'avk',
		'awa',
		'ay',
		'az',
		'azb',
		'ba',
		'ban',
		'bar',
		'bat-smg',
		'bbc',
		'bcl',
		'bdr',
		'be',
		'be-tarask',
		'be-x-old',
		'bew',
		'bg',
		'bh',
		'bi',
		'bjn',
		'blk',
		'bm',
		'bn',
		'bo',
		'bpy',
		'br',
		'bs',
		'btm',
		'bug',
		'bxr',
		'ca',
		'cbk-zam',
		'cdo',
		'ce',
		'ceb',
		'ch',
		'cho',
		'chr',
		'chy',
		'ckb',
		'co',
		'cr',
		'crh',
		'cs',
		'csb',
		'cu',
		'cv',
		'cy',
		'da',
		'dag',
		'de',
		'dga',
		'din',
		'diq',
		'dsb',
		'dtp',
		'dty',
		'dv',
		'dz',
		'ee',
		'el',
		'eml',
		'en',
		'eo',
		'es',
		'et',
		'eu',
		'ext',
		'fa',
		'fat',
		'ff',
		'fi',
		'fiu-vro',
		'fj',
		'fo',
		'fon',
		'fr',
		'frp',
		'frr',
		'fur',
		'fy',
		'ga',
		'gag',
		'gan',
		'gcr',
		'gd',
		'gl',
		'glk',
		'gn',
		'gom',
		'gor',
		'got',
		'gpe',
		'gsw',
		'gu',
		'guc',
		'gur',
		'guw',
		'gv',
		'ha',
		'hak',
		'haw',
		'he',
		'hi',
		'hif',
		'ho',
		'hr',
		'hsb',
		'ht',
		'hu',
		'hy',
		'hyw',
		'hz',
		'ia',
		'iba',
		'id',
		'ie',
		'ig',
		'igl',
		'ii',
		'ik',
		'ilo',
		'inh',
		'io',
		'is',
		'it',
		'iu',
		'ja',
		'jam',
		'jbo',
		'jv',
		'ka',
		'kaa',
		'kab',
		'kai',
		'kaj',
		'kbd',
		'kbp',
		'kcg',
		'kg',
		'kge',
		'ki',
		'kj',
		'kk',
		'kl',
		'km',
		'kn',
		'knc',
		'ko',
		'koi',
		'kr',
		'krc',
		'ks',
		'ksh',
		'ku',
		'kus',
		'kv',
		'kw',
		'ky',
		'la',
		'lad',
		'lb',
		'lbe',
		'lez',
		'lfn',
		'lg',
		'li',
		'lij',
		'lld',
		'lmo',
		'ln',
		'lo',
		'lrc',
		'lt',
		'ltg',
		'lv',
		'lzh',
		'mad',
		'mai',
		'map-bms',
		'mdf',
		'mg',
		'mh',
		'mhr',
		'mi',
		'min',
		'mk',
		'ml',
		'mn',
		'mni',
		'mnw',
		'mo',
		'mos',
		'mr',
		'mrj',
		'ms',
		'mt',
		'mus',
		'mwl',
		'my',
		'myv',
		'mzn',
		'na',
		'nah',
		'nan',
		'nap',
		'nds',
		'nds-nl',
		'ne',
		'new',
		'ng',
		'nia',
		'nl',
		'nn',
		'no',
		'nov',
		'nqo',
		'nr',
		'nrm',
		'nso',
		'nup',
		'nv',
		'ny',
		'oc',
		'olo',
		'om',
		'or',
		'os',
		'pa',
		'pag',
		'pam',
		'pap',
		'pcd',
		'pcm',
		'pdc',
		'pfl',
		'pi',
		'pih',
		'pl',
		'pms',
		'pnb',
		'pnt',
		'ppl',
		'ps',
		'pt',
		'pwn',
		'qu',
		'rki',
		'rm',
		'rmy',
		'rn',
		'ro',
		'roa-rup',
		'roa-tara',
		'rsk',
		'ru',
		'rue',
		'rup',
		'rw',
		'sa',
		'sah',
		'sat',
		'sc',
		'scn',
		'sco',
		'sd',
		'se',
		'sg',
		'sgs',
		'sh',
		'shi',
		'shn',
		'shy',
		'si',
		'simple',
		'sk',
		'skr',
		'sl',
		'sm',
		'smn',
		'sn',
		'so',
		'sq',
		'sr',
		'srn',
		'ss',
		'st',
		'stq',
		'su',
		'sv',
		'sw',
		'syl',
		'szl',
		'szy',
		'ta',
		'tay',
		'tcy',
		'tdd',
		'te',
		'tet',
		'tg',
		'th',
		'ti',
		'tig',
		'tk',
		'tl',
		'tly',
		'tn',
		'to',
		'tok',
		'tpi',
		'tr',
		'trv',
		'ts',
		'tt',
		'tum',
		'tw',
		'ty',
		'tyv',
		'udm',
		'ug',
		'uk',
		'ur',
		'uz',
		've',
		'vec',
		'vep',
		'vi',
		'vls',
		'vo',
		'vro',
		'wa',
		'war',
		'wo',
		'wuu',
		'xal',
		'xh',
		'xmf',
		'yi',
		'yo',
		'yue',
		'za',
		'zea',
		'zgh',
		'zh',
		'zh-classical',
		'zh-min-nan',
		'zh-yue',
		'zu',
		'zh-cn',
		'zh-tw',
		'egl',
		'nb',
		'en-simple',
	])
}

export default WikilinksAutocomplete
