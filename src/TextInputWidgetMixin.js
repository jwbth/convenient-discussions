import { convertHtmlToWikitext } from './utils-api'
import { es6ClassToOoJsClass } from './utils-oojs'
import {
	cleanUpPasteDom,
	getElementFromPasteHtml,
	isElementConvertibleToWikitext,
} from './utils-window'

/**
 * Mixin that is intended to be used on classes that extend
 * {@link OO.ui.TextInputWidget OO.ui.TextInputWidget} and adds some features we need.
 */
class TextInputWidgetMixin {
	// eslint-disable-next-line jsdoc/require-jsdoc
	constructor() {
		// Workaround to make this.constructor in methods to be type-checked correctly
		/** @type {typeof TextInputWidgetMixin} */
		// eslint-disable-next-line no-self-assign
		this.constructor = this.constructor
	}

	/**
	 * Construct the instance. A separate method is used to allow the class to be used as a mixin.
	 *
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	construct() {
		/**
		 * Text that was selected before typing an autocomplete trigger.
		 *
		 * @type {string | undefined}
		 * @private
		 */
		this.selectedTextForAutocomplete = undefined

		/**
		 * Whether the autocomplete menu is currently active. When active, the selected text
		 * should be immutable.
		 *
		 * @type {boolean}
		 * @private
		 */
		this.autocompleteMenuActive = false

		this.$input.on('input', () => {
			this.emit('manualChange', this.getValue())
		})

		// Can't define it as a class field, because then this would be set to TextInputWidgetMixin
		/**
		 * Handle selection changes in the document. Only updates the stored selection if the autocomplete
		 * menu is not active.
		 *
		 * @type {() => void}
		 * @private
		 */
		this.handleSelectionChange = () => {
			// Only update selection if this input is focused and autocomplete menu is not active
			if (document.activeElement === this.$input[0] && !this.autocompleteMenuActive) {
				this.updateSelectedTextForAutocomplete()
			}
		}

		document.addEventListener('selectionchange', this.handleSelectionChange)
	}

	/**
	 * Insert text while keeping the undo/redo functionality.
	 *
	 * @param {string} content
	 * @returns {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	insertContent(content) {
		this.focus()
		// eslint-disable-next-line @typescript-eslint/no-deprecated
		if (!document.execCommand('insertText', false, content)) {
			Object.getPrototypeOf(Object.getPrototypeOf(this.constructor)).prototype.insertContent.call(
				this,
				content,
			)
		}

		return this
	}

	/**
	 * Given a selection, get its content as wikitext.
	 *
	 * @returns {Promise<string>}
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	async getWikitextFromSelection() {
		const div = document.createElement('div')
		const selection = window.getSelection()
		if (selection.type === 'Range') {
			div.append(selection.getRangeAt(0).cloneContents())

			return await this.maybeConvertElementToWikitext(cleanUpPasteDom(div, this.$element[0]))
		}

		return ''
	}

	/**
	 * Convert HTML code of a paste into wikitext.
	 *
	 * @param {string} html Pasted HTML.
	 * @returns {Promise<string>}
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	getWikitextFromPaste(html) {
		return this.maybeConvertElementToWikitext(
			cleanUpPasteDom(getElementFromPasteHtml(html), this.$element[0]),
		)
	}

	/**
	 * Given the return value of {@link module:utilsWindow.cleanUpPasteDom}, convert the HTML to
	 * wikitext if necessary.
	 *
	 * @param {object} data Return value of {@link module:utilsWindow.cleanUpPasteDom}.
	 * @param {Element} data.element
	 * @param {string} data.text
	 * @param {Array.<string|undefined>} data.syntaxHighlightLanguages
	 * @returns {Promise<string>}
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	async maybeConvertElementToWikitext({ element, text, syntaxHighlightLanguages }) {
		if (!isElementConvertibleToWikitext(element)) {
			return text
		}

		this.pushPending().setDisabled(true)
		const wikitext = await convertHtmlToWikitext(element.innerHTML, syntaxHighlightLanguages)
		this.popPending().setDisabled(false)

		return wikitext ?? text
	}

	/**
	 * Update the selected text for autocomplete based on current selection.
	 *
	 * @protected
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	updateSelectedTextForAutocomplete() {
		const element = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (this.$input[0])
		const start = element.selectionStart
		const end = element.selectionEnd

		// Only capture selection if there's actually selected text
		this.selectedTextForAutocomplete =
			start !== end && start !== null && end !== null
				? element.value.substring(start, end)
				: undefined
	}

	/**
	 * Set the autocomplete menu active state. When active, the selected text becomes immutable.
	 *
	 * @param {boolean} active Whether the autocomplete menu is active
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	setAutocompleteMenuActive(active) {
		this.autocompleteMenuActive = active
	}

	/**
	 * Get the text that was selected before typing an autocomplete trigger.
	 *
	 * @returns {string | undefined} The selected text, or undefined if none
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	getSelectedTextForAutocomplete() {
		return this.selectedTextForAutocomplete
	}

	/**
	 * Clean up event listeners when the widget is destroyed.
	 *
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	destroy() {
		document.removeEventListener(
			'selectionchange',
			/** @type {NonNullable<typeof this.handleSelectionChange>} */ (this.handleSelectionChange),
		)
	}
}

es6ClassToOoJsClass(TextInputWidgetMixin)

export default TextInputWidgetMixin
