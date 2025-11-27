import AutocompleteCache from './AutocompleteCache'
import cd from './loader/cd'
import CdError from './shared/CdError'
import { definedAndNotNull, removeDoubleSpaces, sleep, unique } from './shared/utils-general'
import { handleApiReject } from './utils-api'

/**
 * @import {AutocompleteConfigShared} from './AutocompleteManager';
 */

/**
 * @template {any} [T=any]
 * @typedef {object} Option
 * @property {string} label Text searched against and displayed
 * @property {T} entry
 * @property {import('./BaseAutocomplete').default} [autocomplete] Reference to the autocomplete instance
 */

/**
 * @typedef {object} PerformanceMetrics
 * @property {string} type
 * @property {import('./AutocompleteCache').CacheStats & { memoryUsage: number }} cache
 * @property {number} defaultEntriesCount
 * @property {number} lastEntriesCount
 * @property {string} lastQuery
 */

/**
 * Abstract base class for all autocomplete types. Provides shared functionality for caching,
 * validation, result processing, and API request handling.
 *
 * @abstract
 */
class BaseAutocomplete {
	/**
	 * Advanced cache for storing API results by query text.
	 *
	 * @type {AutocompleteCache}
	 */
	cache

	/**
	 * Entries from the last API request.
	 *
	 * @type {string[]}
	 */
	lastApiResults = []

	/**
	 * The last query text that was processed.
	 *
	 * @type {string}
	 */
	lastQuery = ''

	/**
	 * Default entries to search across (may be more narrow than all potential values).
	 *
	 * @type {any[] | undefined}
	 */
	defaultEntries

	/**
	 * Function for lazy loading of default entries.
	 *
	 * @type {(() => any[]) | undefined}
	 */
	defaultLazy

	/**
	 * Additional data used by autocomplete methods.
	 *
	 * @type {{ [x: string]: any }}
	 */
	data = {}

	/**
	 * Reference to the AutocompleteManager instance.
	 *
	 * @type {import('./AutocompleteManager').default | undefined}
	 */
	manager

	/**
	 * API configuration for requests.
	 *
	 * @type {{ ajax: { timeout: number } }}
	 */
	static apiConfig = { ajax: { timeout: 1000 * 5 } }

	/**
	 * Delay before making API requests to avoid excessive requests.
	 *
	 * @type {number}
	 */
	static delay = 100

	/**
	 * Current promise for tracking superseded requests.
	 *
	 * @type {Promise<any> | undefined}
	 */
	static currentPromise

	/**
	 * Create a base autocomplete instance.
	 *
	 * @param {AutocompleteConfigShared} [config] Configuration options
	 */
	constructor(config = {}) {
		Object.assign(this, config)

		// Initialize advanced cache if not provided
		this.cache = new AutocompleteCache({
			maxSize: config.cacheMaxSize || 500,
			ttl: config.cacheTtl || 5 * 60_000,
			maxMemory: config.cacheMaxMemory || 5 * 1024 * 1024,  // 5MB
		})
	}

	/**
	 * Get the display label for this autocomplete type.
	 *
	 * @abstract
	 * @returns {string}
	 */
	getLabel() {
		throw new CdError({
			type: 'internal',
			message: 'getLabel() must be implemented by subclass',
		})
	}

	/**
	 * Get the trigger character(s) for this autocomplete type.
	 *
	 * @abstract
	 * @returns {string}
	 */
	getTrigger() {
		throw new CdError({
			type: 'internal',
			message: 'getTrigger() must be implemented by subclass',
		})
	}

	/**
	 * Transform an entry into insertion data for the Tribute library.
	 *
	 * @abstract
	 * @param {any} _entry The entry to transform
	 * @param {string} [_selectedText] Text that was selected before typing the autocomplete trigger
	 * @returns {import('./tribute/Tribute').InsertData}
	 */
	getInsertionFromEntry(_entry, _selectedText) {
		throw new CdError({
			type: 'internal',
			message: 'getInsertionFromEntry() must be implemented by subclass',
		})
	}

	/**
	 * Extract the display label from an entry.
	 *
	 * @abstract
	 * @param {any} _entry The entry to extract label from
	 * @returns {string} The display label
	 */
	getLabelFromEntry(_entry) {
		throw new CdError({
			type: 'internal',
			message: 'getLabelFromEntry() must be implemented by subclass',
		})
	}

	/**
	 * Validate input text for this autocomplete type.
	 *
	 * @abstract
	 * @param {string} _text The input text to validate
	 * @returns {boolean} Whether the input is valid
	 */
	validateInput(_text) {
		throw new CdError({
			type: 'internal',
			message: 'validateInput() must be implemented by subclass',
		})
	}

	/**
	 * Make an API request to get autocomplete suggestions.
	 *
	 * @abstract
	 * @param {string} _text The search text
	 * @returns {Promise<string[]>} Promise resolving to array of suggestions
	 */
	// eslint-disable-next-line @typescript-eslint/require-await
	async makeApiRequest(_text) {
		throw new CdError({
			type: 'internal',
			message: 'makeApiRequest() must be implemented by subclass',
		})
	}

	/**
	 * Get autocomplete values for the given text. This is the main method called by Tribute.
	 *
	 * @param {string} text The search text
	 * @param {import('./AutocompleteManager').ProcessOptions} callback Callback function to call with
	 *   options
	 * @returns {Promise<void>}
	 */
	async getValues(text, callback) {
		text = this.preprocessText(text)

		// Check if this is a simple local-only autocomplete
		const localMatches = this.getLocalMatches(text)

		if (this.isLocalOnly() || !this.validateInput(text)) {
			callback(this.getOptionsFromEntries(localMatches))

			return
		}

		// Complex autocomplete with caching and API requests
		await this.getValuesWithApiSupport(text, callback, localMatches)
	}

	/**
	 * Preprocess the input text. Subclasses can override for custom preprocessing.
	 *
	 * @param {string} text The input text
	 * @returns {string} Preprocessed text
	 * @protected
	 */
	preprocessText(text) {
		return removeDoubleSpaces(text)
	}

	/**
	 * Check if this autocomplete type only uses local data (no API requests).
	 * Subclasses should override this to return true for local-only types.
	 *
	 * @returns {boolean} Whether this is a local-only autocomplete
	 * @protected
	 */
	isLocalOnly() {
		return false
	}

	/**
	 * Get local matches for the given text. Subclasses can override for custom matching logic.
	 *
	 * @param {string} text The search text
	 * @returns {any[]} Matching entries
	 * @protected
	 */
	getLocalMatches(text) {
		return this.searchLocal(text, this.getDefaultEntries())
	}

	/**
	 * Handle autocomplete with API support, caching, and fallbacks.
	 *
	 * @param {string} text The search text
	 * @param {import('./AutocompleteManager').ProcessOptions} callback Callback function
	 * @param {any[]} localMatches
	 * @returns {Promise<void>}
	 * @private
	 */
	async getValuesWithApiSupport(text, callback, localMatches) {
		// Reset entries if query doesn't start with last query
		if (this.lastQuery && !text.startsWith(this.lastQuery)) {
			this.lastApiResults = []
		}
		this.lastQuery = text

		// Check cache first
		const cachedEntries = this.handleCache(text)
		if (cachedEntries) {
			callback(this.getOptionsFromEntries(cachedEntries))

			return
		}

		let values = localMatches.slice()

		// If no local matches, include previous entries
		if (!localMatches.length) {
			values.push(...this.lastApiResults)
		}
		values = this.searchLocal(text, values)

		// Add user-typed text as last option
		const trimmedText = text.trim()
		if (trimmedText) {
			values.push(trimmedText)
		}

		callback(this.getOptionsFromEntries(values))

		// Make API request if needed
		if (!localMatches.length) {
			try {
				const apiResults = await this.makeApiRequest(text)

				// Check if request is still current
				if (this.lastQuery !== text) return

				this.lastApiResults = apiResults.slice()

				// Add user-typed text as last option
				if (trimmedText) {
					apiResults.push(trimmedText)
				}

				this.updateCache(text, apiResults)
				callback(this.getOptionsFromEntries(apiResults))
			} catch {
				// Silently handle API errors to avoid disrupting user experience. This currently runs even
				// when just overriding request promises with new ones, so it's not really an error
				// console.warn('Autocomplete API request failed:', error);
			}
		}
	}

	/**
	 * Process raw entries into {@link Option} objects for Tribute.
	 *
	 * @param {any[]} entries Raw entries to process
	 * @returns {Option[]} Processed options
	 */
	getOptionsFromEntries(entries) {
		return entries
			.filter(definedAndNotNull)
			.filter(unique)
			.map((entry) => /** @type {Option} */ ({
				label: this.getLabelFromEntry(entry),
				entry,
				autocomplete: this,
			}))
	}

	/**
	 * Search for text in a local list of entries.
	 *
	 * @param {string} text Search text
	 * @param {any[]} list List to search in
	 * @returns {any[]} Matching entries
	 * @protected
	 */
	searchLocal(text, list) {
		// Handle empty lists
		if (list.length === 0) {
			return []
		}

		if (this.isStringList(list)) {
			return this.searchStringList(text, list)
		}

		// For non-string lists, subclasses should override this method
		// But we can provide a basic implementation for objects with 'label' property
		if (typeof list[0] === 'object' && 'label' in list[0]) {
			return this.searchLabeledEntries(text, list)
		}

		throw new CdError({
			type: 'internal',
			message: 'Entry types other than string or labeled objects are not supported. searchLocal() must be implemented by subclass',
		})
	}

	/**
	 * Search for text in a list of strings.
	 *
	 * @param {string} text Search text
	 * @param {string[]} list List to search in
	 * @returns {string[]} Matching entries
	 * @protected
	 */
	searchStringList(text, list) {
		const containsRegexp = new RegExp(mw.util.escapeRegExp(text), 'i')
		const startsWithRegexp = new RegExp('^' + mw.util.escapeRegExp(text), 'i')

		return list
			.filter((entry) => containsRegexp.test(entry))
			.sort(
				(entry1, entry2) =>
					Number(startsWithRegexp.test(entry2)) - Number(startsWithRegexp.test(entry1))
			)
	}

	/**
	 * Search for text in a list of entries with 'label' property.
	 *
	 * @param {string} text Search text
	 * @param {Array<{label: string}>} list List to search in
	 * @returns {Array<{label: string}>} Matching entries
	 * @protected
	 */
	searchLabeledEntries(text, list) {
		const searchRegex = new RegExp(mw.util.escapeRegExp(text), 'i')

		return list.filter((entry) => searchRegex.test(entry.label))
	}

	/**
	 * Check if the list is a string list.
	 *
	 * @param {any[]} list
	 * @returns {list is string[]}
	 */
	isStringList(list) {
		return typeof list[0] === 'string'
	}

	/**
	 * Check cache for existing entries.
	 *
	 * @param {string} text Search text
	 * @returns {string[] | undefined} Cached entries or `undefined` if not found
	 */
	handleCache(text) {
		return this.cache.get(text)
	}

	/**
	 * Update cache with new entries.
	 *
	 * @param {string} text Search text
	 * @param {string[]} entries Entries to cache
	 */
	updateCache(text, entries) {
		this.cache.set(text, entries)
	}

	/**
	 * Get default entries, using lazy loading if available.
	 *
	 * @returns {any[]} Default entries
	 */
	getDefaultEntries() {
		this.defaultEntries ??= this.defaultLazy?.() || []

		return this.defaultEntries
	}

	/**
	 * Get collection-specific properties for Tribute configuration. Subclasses can override this to
	 * provide type-specific properties.
	 *
	 * @returns {Partial<import('./tribute/Tribute').TributeCollection>} Collection properties
	 */
	getCollectionProperties() {
		return {}
	}

	/**
	 * Check if the specified promise is not the current promise to detect superseded requests.
	 *
	 * @param {Promise<any>} promise Promise to check
	 * @throws {CdError} If promise is superseded
	 */
	static promiseIsNotSuperseded(promise) {
		if (promise !== this.currentPromise) {
			throw new CdError()
		}
	}

	/**
	 * Create a promise with delay and supersession checking.
	 *
	 * @param {AsyncPromiseExecutor<any>} executor Promise executor function
	 * @returns {Promise<any>} Promise with delay and checking
	 */
	static createDelayedPromise(executor) {
		// eslint-disable-next-line no-async-promise-executor
		const promise = new Promise(async (resolve, reject) => {
			try {
				await sleep(this.delay)
				this.promiseIsNotSuperseded(promise)
				await executor(resolve, reject)
			} catch (error) {
				reject(error)
			}
		})
		this.currentPromise = promise

		return promise
	}

	/**
	 * Make an OpenSearch API request.
	 *
	 * @param {import('types-mediawiki/api_params').UnknownApiParams} params API parameters
	 * @returns {Promise<import('./AutocompleteManager').OpenSearchResults>} OpenSearch results
	 */
	static async makeOpenSearchRequest(params) {
		return this.createDelayedPromise(async (resolve) => {
			const response = /** @type {import('./AutocompleteManager').OpenSearchResults} */ (await cd
				.getApi(this.apiConfig)
				.get({
					action: 'opensearch',
					limit: 10,
					...params,
				})
				.catch(handleApiReject))

			if (this.currentPromise) {
				this.promiseIsNotSuperseded(this.currentPromise)
			}
			resolve(response)
		})
	}

	/**
	 * Get performance metrics for this autocomplete instance.
	 *
	 * @returns {PerformanceMetrics} Performance metrics
	 */
	getPerformanceMetrics() {
		const cacheStats = this.cache.getStats()

		return {
			type: this.constructor.name,
			cache: cacheStats,
			defaultEntriesCount: this.getDefaultEntries().length,
			lastEntriesCount: this.lastApiResults.length,
			lastQuery: this.lastQuery,
		}
	}

	/**
	 * Optimize cache by removing least used entries.
	 */
	optimizeCache() {
		// The AutocompleteCache handles optimization automatically, but we can trigger manual cleanup
		// if needed
		this.cache.cleanup()
	}

	/**
	 * Prefetch data for common queries to improve performance.
	 *
	 * @param {string[]} commonQueries Array of common query strings
	 * @returns {Promise<void>}
	 */
	async prefetchCommonQueries(commonQueries) {
		await this.cache.prefetch(commonQueries, async (query) => {
			if (this.validateInput(query)) {
				return await this.makeApiRequest(query)
			}

			return []
		})
	}

	/**
	 * Destroy the autocomplete instance and clean up resources.
	 */
	destroy() {
		this.cache.destroy()
	}
}

export default BaseAutocomplete
