import AutocompleteFactory from './AutocompleteFactory'
import AutocompletePerformanceMonitor from './AutocompletePerformanceMonitor'
import MultilineTextInputWidget from './MultilineTextInputWidget'
import cd from './loader/cd'
import CdError from './shared/CdError'
import { typedEntries } from './shared/utils-general'
import Tribute from './tribute/Tribute'
import { handleApiReject } from './utils-api'

/**
 * @import {AutocompleteType} from './AutocompleteFactory';
 */

/** @typedef {[string, string[], string[], string[]]} OpenSearchResults */

/**
 * @typedef {Parameters<
 *   Exclude<
 *     import('./tribute/Tribute').TributeCollectionSpecific<import('./BaseAutocomplete').Option>['values'],
 *     import('./BaseAutocomplete').Option[]
 *   >
 * >[1]} ProcessOptions
 */

/**
 * @typedef {object} AutocompleteConfigShared
 * @property {any[]} [default] Default set of entries to search across (may be more narrow than the
 *   list of all potential values, as in the case of user names)
 * @property {(() => any[])} [defaultLazy] Function for lazy loading of the defaults
 * @property {() => import('./tribute/Tribute').InsertData} [getInsertionFromEntry] Function
 *   that transforms the entry into the insertion data that is actually inserted
 * @property {AnyByKey} [data] Any additional data to be used by methods
 * @property {number} [cacheMaxSize]
 * @property {number} [cacheTtl]
 * @property {number} [cacheMaxMemory]
 */

/**
 * Autocomplete manager class that coordinates type-specific autocomplete instances. This class
 * replaces the monolithic Autocomplete class with a cleaner architecture that delegates to
 * specialized autocomplete classes for each type.
 */
class AutocompleteManager {
	/**
	 * Maximum number of displayed autocomplete items.
	 */
	itemLimit = 10

	/**
	 * Target elements of the inputs.
	 *
	 * @type {HTMLElement[]}
	 * @private
	 */
	elements = []

	/**
	 * Create an autocomplete manager instance. An instance is a set of settings and inputs to which
	 * these settings apply.
	 *
	 * @param {object} options
	 * @param {AutocompleteType[]} options.types Which values should be autocompleted.
	 * @param {import('./TextInputWidget').default[]} options.inputs Inputs to attach the autocomplete
	 *   to. Please note that these should be CD's {@link TextInputWidget}s, not
	 *   {@link OO.ui.TextInputWidget OO.ui.TextInputWidget}s, since we use CD's method
	 *   {@link TextInputWidget#cdInsertContent} on the inputs here. This is not essential, so if you
	 *   borrow the source code, you can replace it with native
	 *   {@link OO.ui.TextInputWidget#insertContent OO.ui.TextInputWidget#insertContent}.
	 * @param {Partial<Record<AutocompleteType, object>>} [options.typeConfigs] Configuration objects
	 *   for each autocomplete type, passed to the autocomplete factory when creating instances.
	 * @param {boolean} [options.enablePerformanceMonitoring] Whether to enable performance monitoring
	 */
	constructor({ types, inputs, typeConfigs = {}, enablePerformanceMonitoring = false }) {
		/** @type {AutocompleteType[]} @private */
		this.types = cd.settings.get('autocompleteTypes')

		/** @type {boolean} */
		this.useTemplateData = cd.settings.get('useTemplateData')

		types = types.filter((type) => this.types.includes(type))

		/**
		 * Performance monitor for tracking autocomplete performance.
		 *
		 * @type {AutocompletePerformanceMonitor | undefined}
		 * @private
		 */
		this.performanceMonitor = enablePerformanceMonitoring
			? new AutocompletePerformanceMonitor({
					enabled: true,
					maxMetrics: 500,
					reportInterval: 0, // Disable automatic reporting
				})
			: undefined

		/**
		 * Map of autocomplete type to autocomplete instance.
		 *
		 * @type {Map<AutocompleteType, import('./BaseAutocomplete').default>}
		 * @private
		 */
		this.autocompleteInstances = new Map()

		// Create type-specific autocomplete instances
		this.createAutocompleteInstances(types, typeConfigs)

		/**
		 * {@link https://github.com/zurb/tribute Tribute} object.
		 *
		 * @type {Tribute}
		 */
		this.tribute = new Tribute({
			collection: this.getCollections(),
			allowSpaces: true,
			menuItemLimit: this.itemLimit,
			noMatchTemplate: () => null,
			containerClass: 'tribute-container cd-autocompleteContainer',
			replaceTextSuffix: '',
			direction: cd.g.contentDirection,
		})

		/**
		 * Inputs that have the autocomplete attached.
		 *
		 * @type {import('./TextInputWidget').default[]}
		 * @private
		 */
		this.inputs = inputs
	}

	/**
	 * Create autocomplete instances for the specified types.
	 *
	 * @param {AutocompleteType[]} types Types to create instances for
	 * @param {Partial<Record<AutocompleteType, any>>} typeConfigs Configuration objects for each type
	 * @private
	 */
	createAutocompleteInstances(types, typeConfigs) {
		types.forEach((type) => {
			const config = typeConfigs[type] || {}
			const instance = AutocompleteFactory.create(type, config)
			instance.manager = this
			this.autocompleteInstances.set(type, instance)
		})
	}

	/**
	 * Initialize autocomplete for the inputs.
	 */
	init() {
		this.elements = this.inputs.flatMap((input) => {
			if (
				cd.settings.get('useNativeAutocomplete') &&
				input instanceof MultilineTextInputWidget &&
				input.codeMirror
			) {
				return []
			}

			const element = input.getEditableElement()
			this.tribute.attach(element)
			element.cdInput = input
			element.addEventListener('tribute-active-true', () => {
				AutocompleteManager.activeMenu = this.tribute.menu
				// Set the autocomplete menu as active to make selected text immutable
				input.setAutocompleteMenuActive(true)
			})
			element.addEventListener('tribute-active-false', () => {
				delete AutocompleteManager.activeMenu
				// Set the autocomplete menu as inactive to allow selection changes again
				input.setAutocompleteMenuActive(false)
			})
			if (input instanceof OO.ui.MultilineTextInputWidget) {
				input.on('resize', () => {
					this.tribute.menuEvents.windowResizeEvent?.()
				})
			}

			return [element]
		})
	}

	/**
	 * Remove event handlers.
	 */
	terminate() {
		this.elements.forEach((element) => {
			this.tribute.detach(element)
		})

		// Clean up autocomplete instances
		for (const instance of this.autocompleteInstances.values()) {
			if (typeof instance.destroy === 'function') {
				instance.destroy()
			}
		}

		// Clean up performance monitor
		if (this.performanceMonitor) {
			this.performanceMonitor.destroy()
			this.performanceMonitor = undefined
		}
	}

	/**
	 * Get the list of collections for all configured autocomplete types.
	 *
	 * @returns {import('./tribute/Tribute').TributeCollection[]}
	 * @private
	 */
	getCollections() {
		const collections = []

		for (const [type, instance] of this.autocompleteInstances) {
			collections.push(
				/** @type {import('./tribute/Tribute').TributeCollection<import('./BaseAutocomplete').Option>} */ ({
					lookup: 'label',
					label: instance.getLabel(),
					trigger: instance.getTrigger(),
					searchOpts: { skip: true },
					selectTemplate: this.onOptionChoose,
					values: async (/** @type {string} */ text, /** @type {ProcessOptions} */ callback) => {
						// Start performance monitoring if enabled
						const perfContext = this.performanceMonitor?.startOperation('getValues', type, text)

						try {
							// Check if result will come from cache
							const cacheHit = instance.handleCache(text) !== undefined

							await instance.getValues(text, (results) => {
								// End performance monitoring
								if (perfContext) {
									perfContext.end(results.length, cacheHit)
								}
								callback(results)
							})
						} catch (error) {
							// End performance monitoring on error
							if (perfContext) {
								perfContext.end(0, false)
							}
							throw error
						}
					},

					// Add type-specific properties from the instance
					...instance.getCollectionProperties(),
				}),
			)
		}

		return collections
	}

	/**
	 * Handle the option choose event.
	 *
	 * @param {import('./tribute/Tribute').TributeSearchResults<import('./BaseAutocomplete').Option<any>> | undefined} option
	 * @returns {import('./tribute/Tribute').InsertData | string}
	 */
	onOptionChoose = (option) => {
		if (!option?.original.autocomplete) {
			return ''
		}

		// Get the selected text from the input widget if available
		const element = this.tribute.current.element
		const selectedText =
			element?.cdInput && typeof element.cdInput.getSelectedTextForAutocomplete === 'function'
				? element.cdInput.getSelectedTextForAutocomplete()
				: undefined

		return option.original.autocomplete.getInsertionFromEntry(option.original.entry, selectedText)
	}

	/**
	 * Get autocomplete data for a template.
	 *
	 * @param {import('./tribute/Tribute').TributeSearchResults<import('./BaseAutocomplete').Option<string>>} option
	 * @param {import('./TextInputWidget').default} input
	 * @returns {Promise<void>}
	 */
	async insertTemplateData(option, input) {
		input.setDisabled(true).pushPending()

		/** @type {APIResponseTemplateData} */
		let response
		/** @type {TemplateData | undefined} */
		let template
		try {
			response = await cd
				.getApi(AutocompleteManager.apiConfig)
				.get({
					action: 'templatedata',
					titles: `Template:${option.original.label}`,
					redirects: true,
				})
				.catch(handleApiReject)
			template = Object.values(response.pages).at(0)
			if (!template) {
				throw new CdError('Template missing.')
			}
		} catch {
			input.setDisabled(false).focus().popPending()

			return
		}

		const params = template.params || {}

		// Parameter names
		const result = (template.paramOrder || Object.keys(params))
			.filter((param) => params[param].required || params[param].suggested)
			.reduce((paramAcc, param) => {
				const addition =
					template.format === 'block'
						? `\n| ${param} = `
						: Number.isNaN(Number(param))
							? `|${param}=`
							: `|`
				firstValueIndex ||= paramAcc.length + addition.length

				return paramAcc + addition
			}, '')

		let firstValueIndex = 0
		input
			.setDisabled(false)

			// Remove leading `|` with `slice(1)`
			.insertContent((result + (template.format === 'block' && result ? '\n' : '')).slice(1))

			// `input.getRange().to` is the current caret index
			.selectRange(/** @type {number} */ (input.getRange().to || 0) + firstValueIndex - 1)

			.popPending()
	}

	// Static properties and methods for backward compatibility

	static delay = 100

	static apiConfig = { ajax: { timeout: 1000 * 5 } }

	/** @type {HTMLElement|undefined} */
	static activeMenu

	/** @type {Promise<any> | undefined} */
	static currentPromise

	/**
	 * Get the active autocomplete menu element.
	 *
	 * @returns {Element|undefined}
	 */
	static getActiveMenu() {
		return this.activeMenu
	}

	/**
	 * Use the original first character case if the result is not a redirect.
	 *
	 * @param {string} result
	 * @param {string} query
	 * @returns {string}
	 */
	static useOriginalFirstCharCase(result, query) {
		// But ignore cases with all caps in the first word like ABBA
		const firstWord = result.split(' ')[0]
		if (
			firstWord.toUpperCase() !== firstWord &&
			result.charAt(0).toLowerCase() === query.charAt(0).toLowerCase()
		) {
			result = query.charAt(0) + result.slice(1)
		}

		return result
	}

	/**
	 * @typedef {object} CombinedPerformanceMetrics
	 * @property {object} manager
	 * @property {number} manager.instanceCount
	 * @property {AutocompleteType[]} manager.types
	 * @property {boolean} manager.monitoringEnabled
	 * @property {TypeByStringKey<import('./BaseAutocomplete').PerformanceMetrics>} instances
	 * @property {import('./AutocompletePerformanceMonitor').PerformanceSummary} [monitor]
	 */

	/**
	 * Get performance metrics for all autocomplete instances.
	 *
	 * @returns {CombinedPerformanceMetrics} Combined performance metrics
	 */
	getPerformanceMetrics() {
		const metrics = /** @type {CombinedPerformanceMetrics} */ ({
			manager: {
				instanceCount: this.autocompleteInstances.size,
				types: Array.from(this.autocompleteInstances.keys()),
				monitoringEnabled: this.performanceMonitor !== undefined,
			},
			instances:
				/** @type {TypeByStringKey<import('./BaseAutocomplete').PerformanceMetrics>} */ ({}),
			monitor: undefined,
		})

		// Get metrics from each instance
		for (const [type, instance] of this.autocompleteInstances) {
			if (typeof instance.getPerformanceMetrics === 'function') {
				metrics.instances[type] = instance.getPerformanceMetrics()
			}
		}

		// Get monitor metrics if available
		if (this.performanceMonitor) {
			metrics.monitor = this.performanceMonitor.generateSummary()
		}

		return metrics
	}

	/**
	 * Generate a performance report.
	 *
	 * @returns {string} Formatted performance report
	 */
	generatePerformanceReport() {
		if (!this.performanceMonitor) {
			return 'Performance monitoring is not enabled.'
		}

		return this.performanceMonitor.generateReport()
	}

	/**
	 * Optimize all autocomplete instances.
	 */
	optimizePerformance() {
		for (const instance of this.autocompleteInstances.values()) {
			if (typeof instance.optimizeCache === 'function') {
				instance.optimizeCache()
			}
		}
	}

	/**
	 * Prefetch common queries for all instances.
	 *
	 * @param {Record<AutocompleteType, string[]>} commonQueriesByType Object mapping type to array of
	 *   common queries
	 * @returns {Promise<void>}
	 */
	async prefetchCommonQueries(commonQueriesByType) {
		const promises = []

		for (const [type, queries] of typedEntries(commonQueriesByType)) {
			const instance = this.autocompleteInstances.get(type)
			if (instance?.prefetchCommonQueries) {
				promises.push(instance.prefetchCommonQueries(queries))
			}
		}

		await Promise.all(promises)
	}

	/**
	 * Enable performance monitoring.
	 */
	enablePerformanceMonitoring() {
		if (this.performanceMonitor) {
			this.performanceMonitor.enable()
		} else {
			this.performanceMonitor = new AutocompletePerformanceMonitor({
				enabled: true,
				maxMetrics: 500,
				reportInterval: 0,
			})
		}
	}

	/**
	 * Disable performance monitoring.
	 */
	disablePerformanceMonitoring() {
		if (this.performanceMonitor) {
			this.performanceMonitor.disable()
		}
	}

	/**
	 * Search for a string in a list of strings. Return the matching strings.
	 *
	 * @param {string} string
	 * @param {string[]} list
	 * @returns {string[]}
	 */
	static search(string, list) {
		const containsRegexp = new RegExp(mw.util.escapeRegExp(string), 'i')
		const startsWithRegexp = new RegExp('^' + mw.util.escapeRegExp(string), 'i')

		return list
			.filter((item) => containsRegexp.test(item))
			.sort((item1, item2) => {
				const item1StartsWith = startsWithRegexp.test(item1)
				const item2StartsWith = startsWithRegexp.test(item2)
				if (item1StartsWith && !item2StartsWith) {
					return -1
				} else if (!item1StartsWith && item2StartsWith) {
					return 1
				}

				return 0
			})
	}
}

export default AutocompleteManager
