import { convertHtmlToWikitext } from './utils-api'
import { es6ClassToOoJsClass, getMixinBaseClassPrototype } from './utils-oojs-class'
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
	/**
	 * Whether the autocomplete menu is currently active. When active, the selected text
	 * should be immutable.
	 *
	 * @type {boolean}
	 * @private
	 */
	autocompleteMenuActive = false

	/**
	 * Text that was selected before typing an autocomplete trigger.
	 *
	 * @type {{selectedText: string, start: number} | undefined}
	 * @private
	 */
	autocompleteSavedSelection

	/**
	 * Autocomplete manager instance.
	 *
	 * @type {import('./AutocompleteManager').default | undefined}
	 */
	autocompleteManager

	// eslint-disable-next-line jsdoc/require-jsdoc
	constructor() {
		// Workaround to make this.constructor in methods to be type-checked correctly
		/** @type {typeof TextInputWidgetMixin} */
		// eslint-disable-next-line no-self-assign
		this.constructor = this.constructor
	}

	/**
	 * Handle selection changes in the document. Only updates the stored selection if the
	 * autocomplete menu is not active.
	 *
	 * @type {() => void}
	 * @private
	 */
	handleSelectionChange

	/**
	 * Construct the instance. A separate method is used to allow the class to be used as a mixin.
	 *
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	construct() {
		// Can't define it as a class field, because then this would be set to TextInputWidgetMixin and
		// not classes that extend it.
		this.handleSelectionChange = () => {
			if (document.activeElement === this.getEditableElement()[0] && !this.autocompleteMenuActive) {
				this.updateAutocompleteSavedSelection()
			}
		}
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
		// CodeMirror implements undo/redo with its own means. Using document.execCommand causes issues
		// in Firefox.
		if (
			('codeMirror' in this && this.codeMirror) ||
			// eslint-disable-next-line @typescript-eslint/no-deprecated
			!document.execCommand('insertText', false, content)
		) {
			// May be OO.ui.TextInputWidget or its subtype
			/** @type {OO.ui.TextInputWidget} */ getMixinBaseClassPrototype(
				this,
				'TextInputWidgetMixin',
			).insertContent.call(this, content)
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
	 * Convert the HTML code of a paste into wikitext.
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
	updateAutocompleteSavedSelection() {
		const element = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (
			this.getEditableElement()[0]
		)
		const start = element.selectionStart
		// We simulate selection and value properties for CodeMirror in OoUiInputCodeMirror, but this
		// can run early when they are undefined.
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (start === undefined) return

		const end = element.selectionEnd

		const selectedText =
			start !== null && end !== null ? element.value.substring(start, end).trimEnd() : ''

		const savedSelection = this.autocompleteSavedSelection
		if (
			!selectedText &&
			savedSelection &&
			this.autocompleteManager
				?.getTriggers()
				.some((trigger) => start === savedSelection.start + trigger.length)
		) {
			return
		}

		this.autocompleteSavedSelection =
			selectedText.length > 0 ? { selectedText, start: /** @type {number} */ (start) } : undefined
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
	 * Check if the autocomplete menu is currently active.
	 *
	 * @returns {boolean}
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	isAutocompleteMenuActive() {
		return this.autocompleteMenuActive
	}

	/**
	 * Get the text that was selected before typing an autocomplete trigger.
	 *
	 * @returns {{selectedText: string, start: number} | undefined} The selected text and its
	 *   start position, or undefined if none
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	getAutocompleteSavedSelection() {
		return this.autocompleteSavedSelection
	}

	/**
	 * Get the editable element of the input.
	 *
	 * @returns {JQuery}
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	getEditableElement() {
		return this.$input
	}

	/**
	 * Attach selection change listener.
	 *
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	addSelectionChangeListener() {
		document.addEventListener('selectionchange', this.handleSelectionChange)
	}

	/**
	 * Clean up selection change listener.
	 *
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	removeSelectionChangeListener() {
		document.removeEventListener(
			'selectionchange',
			/** @type {NonNullable<typeof this.handleSelectionChange>} */ (this.handleSelectionChange),
		)
	}

	/**
	 * Add autocomplete listeners.
	 *
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	addEventListeners() {
		const $element = this.getEditableElement()
		$element[0].cdInput = this
		$element
			.on('input.cd', () => {
				this.emit('manualChange', this.getValue())
			})
			.on('autocomplete-attached.cd', (_event, data) => {
				this.autocompleteManager = data.autocompleteManager
				this.addSelectionChangeListener()
			})
			.on('autocomplete-detached.cd', () => {
				this.removeSelectionChangeListener()
			})
			.on('tribute-active-true.cd', () => {
				// Set the autocomplete menu as active to make selected text immutable
				this.setAutocompleteMenuActive(true)
			})
			.on('tribute-active-false.cd', () => {
				// Set the autocomplete menu as inactive to allow selection changes again
				this.setAutocompleteMenuActive(false)
			})
	}
}

es6ClassToOoJsClass(TextInputWidgetMixin)

export default TextInputWidgetMixin
