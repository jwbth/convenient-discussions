import CommentLinksAutocomplete from './CommentLinksAutocomplete'
import MentionsAutocomplete from './MentionsAutocomplete'
import TagsAutocomplete from './TagsAutocomplete'
import TemplatesAutocomplete from './TemplatesAutocomplete'
import WikilinksAutocomplete from './WikilinksAutocomplete'
import { getReplacements } from './autocompleteInsertion'
import cd from './loader/cd'
import Tribute from './tribute/Tribute'

/**
 * @typedef {'mentions' | 'commentLinks' | 'wikilinks' | 'templates' | 'tags'} AutocompleteType
 */

/** @type {Record<AutocompleteType, new (options: AutocompleteConfigShared) => import('./BaseAutocomplete').default>} */
const autocompleteClasses = {
	mentions: MentionsAutocomplete,
	commentLinks: CommentLinksAutocomplete,
	wikilinks: WikilinksAutocomplete,
	templates: TemplatesAutocomplete,
	tags: TagsAutocomplete,
}

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
 * @property {() => import('./autocompleteInsertion').Insertion} [getInsertionFromEntry] Function
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
			const instance = new autocompleteClasses[type](config)
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
	 * Get the Replacements that choosing an option makes in the input.
	 *
	 * @param {import('./tribute/Tribute').TributeSearchResults<import('./BaseAutocomplete').Option<any>> | undefined} option
	 * @param {KeyboardEvent | MouseEvent} event
	 * @param {import('./tribute/Tribute').TriggerContext} context
	 * @returns {import('./TextInputWidgetMixin').TextReplacement[]}
	 */
	onOptionChoose = (option, event, context) => {
		if (!option) {
			return []
		}

		const autocomplete = option.original.autocomplete

		const element = /** @type {HTMLTextAreaElement} */ (this.tribute.current.element)
		const input = this.inputs.find((candidate) => candidate.getEditableElement()[0] === element)
		const replacements = getReplacements({
			getInsertion: (keys) => autocomplete.getInsertionFromEntry(option.original.entry, keys),
			event,
			isMac: navigator.platform.includes('Mac'),
			traits: autocomplete,
			context,
			text: element.value,
			selectionRanges: input?.getSelectionRanges() || [],
			savedSelections: input?.getAutocompleteSavedSelection() || [],
		})
		autocomplete.afterOptionChoose(option, event, input)

		return replacements
	}

	// Static properties and methods for backward compatibility

	/** @type {HTMLElement|undefined} */
	static activeMenu

	/**
	 * Get the active autocomplete menu element.
	 *
	 * @returns {Element|undefined}
	 */
	static getActiveMenu() {
		return this.activeMenu
	}
}

export default AutocompleteManager
