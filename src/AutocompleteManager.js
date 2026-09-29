import AutocompleteFactory from './AutocompleteFactory'
import cd from './loader/cd'
import Tribute from './tribute/Tribute'

/**
 * @import {AutocompleteType} from './AutocompleteFactory';
 */

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
 * @property {() => import('./tribute/Tribute').Insertion} [getInsertionFromEntry] Function
 *   that transforms the entry into the insertion data that is actually inserted
 * @property {AnyByKey} [data] Any additional data to be used by methods
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
	 */
	constructor({ types, inputs, typeConfigs = {} }) {
		/** @type {AutocompleteType[]} @private */
		this.types = cd.settings.get('autocompleteTypes')

		/** @type {boolean} */
		this.useTemplateData = cd.settings.get('useTemplateData')

		types = types.filter((type) => this.types.includes(type))

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
			if (cd.settings.get('useNativeAutocomplete') && input.isCodeMirrorActive()) {
				return []
			}

			const $element = input.getEditableElement()
			this.tribute.attach($element[0])
			$element
				.trigger('autocomplete-attached', { autocompleteManager: this })
				.on('tribute-active-true', () => {
					AutocompleteManager.activeMenu = this.tribute.menu
				})
				.on('tribute-active-false', () => {
					delete AutocompleteManager.activeMenu
				})
			if (input instanceof OO.ui.MultilineTextInputWidget) {
				input.on('resize', () => {
					this.tribute.menuEvents.windowResizeEvent?.()
				})
			}

			return [$element[0]]
		})
	}

	/**
	 * Remove event handlers.
	 */
	terminate() {
		this.elements.forEach((element) => {
			this.tribute.detach(element)
			$(element).trigger('autocomplete-detached.cd', { autocompleteManager: this })
		})
	}

	/**
	 * Get the list of collections for all configured autocomplete types.
	 *
	 * @returns {import('./tribute/Tribute').TributeCollection[]}
	 * @private
	 */
	getCollections() {
		const collections = []

		for (const instance of this.autocompleteInstances.values()) {
			collections.push(
				/** @type {import('./tribute/Tribute').TributeCollection<import('./BaseAutocomplete').Option>} */ ({
					lookup: 'label',
					label: instance.getLabel(),
					trigger: instance.getTrigger(),
					searchOpts: { skip: true },
					selectTemplate: this.onOptionChoose,
					values: async (/** @type {string} */ text, /** @type {ProcessOptions} */ callback) => {
						await instance.getValues(text, callback)
					},

					// Add type-specific properties from the instance
					...instance.getCollectionProperties(),
				}),
			)
		}

		return collections
	}

	/**
	 * Get all the triggers for all the autocomplete types registered for this instance.
	 *
	 * @returns {string[]}
	 */
	getTriggers() {
		return Array.from(this.autocompleteInstances.values()).map((instance) => instance.getTrigger())
	}

	/**
	 * Get the selected text from the input widget if it should be used for autocomplete insertion.
	 *
	 * @param {import('./tribute/Tribute').TributeSearchResults<import('./BaseAutocomplete').Option<any>>} option
	 * @returns {{selectedText: string, selections: Array<{selectedText: string, start: number, leadingSpaces: string, trailingSpaces: string}>} | undefined}
	 */
	getSelectedTextForInsertion(option) {
		const autocomplete = option.original.autocomplete
		const element = autocomplete.manager?.tribute.current.element
		const savedSelections =
			element?.cdInput && typeof element.cdInput.getAutocompleteSavedSelection === 'function'
				? element.cdInput.getAutocompleteSavedSelection()
				: undefined
		const insertion = autocomplete.getInsertionFromEntry(option.original.entry)

		if (
			savedSelections?.length &&
			(savedSelections.length > 1 ||
				savedSelections[0].start === autocomplete.manager?.tribute.current.triggerPos) &&
			savedSelections.every(
				(selection) =>
					!selection.selectedText.includes(autocomplete.getTrigger()) ||
					autocomplete.manager?.tribute.current.collection?.allowNesting,
			) &&
			// Self-closing tags like `<references />` don't have `end`
			insertion.end
		) {
			const [firstSelection] = savedSelections

			return {
				selectedText: firstSelection.selectedText,
				selections: savedSelections,
			}
		}
	}

	/**
	 * Handle the option choose event.
	 *
	 * @param {import('./tribute/Tribute').TributeSearchResults<import('./BaseAutocomplete').Option<any>> | undefined} option
	 * @returns {import('./tribute/Tribute').Insertion | string}
	 */
	onOptionChoose = (option) => {
		const autocomplete = option?.original.autocomplete
		if (!autocomplete) {
			return ''
		}

		const selectionData = this.getSelectedTextForInsertion(
			/** @type {NonNullable<typeof option>} */ (option),
		)

		/** @type {import('./tribute/Tribute').Insertion} */
		const insertion = autocomplete.getInsertionFromEntry(
			/** @type {NonNullable<typeof option>} */ (option).original.entry,
			selectionData?.selectedText,
		)

		this.applySelectionDataToInsertion(insertion, selectionData)

		return insertion
	}

	/**
	 * Apply saved selection data to insertion data.
	 *
	 * @param {import('./tribute/Tribute').Insertion} insertion Insertion data.
	 * @param {{selections: Array<{selectedText: string, start: number, leadingSpaces: string, trailingSpaces: string}>} | undefined} selectionData Selection data.
	 */
	applySelectionDataToInsertion(insertion, selectionData) {
		if (!selectionData) return

		insertion.autocompleteSelections = selectionData.selections
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
