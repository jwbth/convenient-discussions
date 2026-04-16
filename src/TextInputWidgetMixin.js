import cd from './loader/cd'
import { parseWikiUrl, sleep, underlinesToSpaces } from './shared/utils-general'
import { encodeLinkLabel, encodeWikilink } from './shared/utils-wikitext'
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

	/**
	 * Extract URL and label from paste/drop data.
	 *
	 * @param {DataTransfer} data
	 * @param {string} [selectedText]
	 * @returns {{ url: string; label: string | undefined } | null}
	 * @private
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	extractUrlFromData(data, selectedText) {
		let url
		let label

		// Extract URL and label from DataTransfer in priority order
		// 1. text/x-moz-url
		if (data.types.includes('text/x-moz-url')) {
			const mozUrl = data.getData('text/x-moz-url')
			const parts = mozUrl.split(/\r?\n/)
			url = parts[0]
			label = parts[1] || selectedText
		}
		// 2. text/html
		else if (data.types.includes('text/html')) {
			const html = data.getData('text/html')
			const tempDiv = document.createElement('div')
			tempDiv.innerHTML = html

			// Check if it's a single link
			const links = tempDiv.querySelectorAll('a')
			const textContent = (tempDiv.textContent || '').trim()

			if (links.length === 1 && textContent === (links[0].textContent || '').trim()) {
				url = links[0].href
				label = (links[0].textContent || '').trim() || selectedText
			}
		}
		// 3. text/uri-list
		else if (data.types.includes('text/uri-list')) {
			const uriList = data.getData('text/uri-list')
			const urls = uriList.split(/\r?\n/).filter((line) => line && !line.startsWith('#'))

			// Only process if it's a single URL
			if (urls.length === 1) {
				url = urls[0]
				label = selectedText
			} else if (urls.length > 1) {
				// Multiple URLs - don't convert
				return null
			}
		}
		// 4. text/plain
		else if (data.types.includes('text/plain')) {
			const plainText = data.getData('text/plain').trim()

			// Check if the entire text is a URL
			let isValidUrl = false
			try {
				// eslint-disable-next-line no-new
				new URL(plainText)
				isValidUrl = true
			} catch {
				// Not a valid URL
			}

			if (isValidUrl) {
				// Check for spaces - if present, don't convert
				if (plainText.includes(' ')) {
					return null
				}
				url = plainText
				label = selectedText
			} else {
				return null
			}
		}

		if (!url) {
			return null
		}

		// Trim the label if it exists
		if (label) {
			label = label.trim()
		}

		return { url, label }
	}

	/**
	 * Convert a URL to a wikilink or formatted link.
	 *
	 * @param {string} url
	 * @param {string | undefined} label
	 * @returns {Promise<string|null>} The converted link or null if conversion failed
	 * @private
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	async convertUrlToWikilink(url, label) {
		let urlObj
		try {
			urlObj = new URL(url)
		} catch {
			return null
		}

		// Check if URL has query parameters other than 'title'
		const params = new URLSearchParams(urlObj.search)
		const paramKeys = [...params.keys()]

		// Special case: red links have action=edit and redlink=1 parameters
		// These should be converted to wikilinks (title parameter contains the page name)
		const isRedLink =
			paramKeys.length === 3 &&
			params.get('action') === 'edit' &&
			params.get('redlink') === '1' &&
			params.has('title')

		const hasOtherParams = paramKeys.some(
			(key) => key !== 'title' && !(isRedLink && (key === 'action' || key === 'redlink')),
		)

		if (hasOtherParams) {
			// Can't convert to wikilink - use external link format
			return this.formatExternalLink(url, label)
		}

		// Load the interwiki prefix detection script if not already loaded
		if (!window.getInterwikiPrefixForHostname) {
			try {
				await mw.loader.getScript(
					'https://en.wikipedia.org/w/index.php?title=User:Jack_who_built_the_house/getUrlFromInterwikiLink.js&action=raw&ctype=text/javascript',
				)
			} catch {
				// Script failed to load - fall back to external link format
				return this.formatExternalLink(url, label)
			}
		}

		// Get interwiki prefix
		let interwikiPrefix
		try {
			if (!window.getInterwikiPrefixForHostname) {
				return this.formatExternalLink(url, label)
			}
			interwikiPrefix = await window.getInterwikiPrefixForHostname(urlObj.hostname, cd.g.serverName)
		} catch {
			// Failed to get prefix - fall back to external link format
			return this.formatExternalLink(url, label)
		}

		if (interwikiPrefix === null) {
			// No interwiki prefix available - use external link format
			return this.formatExternalLink(url, label)
		}

		// Parse the wiki URL
		const parsedUrl = parseWikiUrl(url)
		if (!parsedUrl) {
			// Can't parse - use external link format
			return this.formatExternalLink(url, label)
		}

		// Build the wikilink
		let wikilink = `[[${interwikiPrefix}${parsedUrl.pageName}`

		// Add fragment if present
		if (parsedUrl.fragment) {
			let fragment = decodeURIComponent(parsedUrl.fragment)
			fragment = underlinesToSpaces(fragment)
			fragment = encodeWikilink(fragment)
			wikilink += `#${fragment}`
		}

		// Add label if present
		if (label) {
			const encodedLabel = encodeLinkLabel(label)
			wikilink += `|${encodedLabel}`
		}

		wikilink += ']]'

		return wikilink
	}

	/**
	 * Format a URL as an external link.
	 *
	 * @param {string} url
	 * @param {string} [label]
	 * @returns {string}
	 * @private
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	formatExternalLink(url, label) {
		if (label) {
			return `[${url} ${label}]`
		}

		return url
	}

	/**
	 * Handle paste/drop events for URL conversion.
	 *
	 * @param {ClipboardEvent | DragEvent} event
	 * @returns {boolean} Whether URL conversion will happen
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	handleUrlConversion(event) {
		const data = 'clipboardData' in event ? event.clipboardData : event.dataTransfer
		if (!data) return false

		const isPaste = 'clipboardData' in event
		const insertedLength = data.getData('text/plain').length

		// Determine if text is selected (for paste events)
		let selectedText
		let selectionStart
		let selectionEnd
		if (isPaste) {
			;[selectionStart, selectionEnd] = this.$input.textSelection('getCaretPosition', {
				startAndEnd: true,
			})
			if (selectionStart !== selectionEnd) {
				selectedText = this.getValue().substring(selectionStart, selectionEnd)

				// If the selected text is itself a URL, don't use it as a label
				// (user is likely replacing one URL with another)
				try {
					// eslint-disable-next-line no-new
					new URL(selectedText.trim())
					selectedText = undefined
				} catch {
					// Not a URL, can be used as label
				}
			}
		}

		// Extract URL and label
		const extracted = this.extractUrlFromData(data, selectedText)
		if (!extracted) {
			return false
		}

		const { url, label } = extracted

		// If we have a label (selected text), trim leading/trailing spaces
		// by actually changing the selection BEFORE the paste happens
		if (selectedText && selectionStart !== undefined && selectionEnd !== undefined) {
			// Count leading spaces
			const leadingSpaces = selectedText.length - selectedText.trimStart().length
			// Count trailing spaces
			const trailingSpaces = selectedText.length - selectedText.trimEnd().length

			// Adjust selection boundaries to exclude spaces
			selectionStart += leadingSpaces
			selectionEnd -= trailingSpaces

			// Actually change the selection so the browser pastes into the trimmed range
			if (leadingSpaces > 0 || trailingSpaces > 0) {
				this.selectRange(selectionStart, selectionEnd)
			}
		}

		// Schedule the actual conversion
		this.performUrlConversion(url, label, isPaste, selectedText, selectionStart, insertedLength)

		return true
	}

	/**
	 * Perform the URL conversion after the paste/drop has completed.
	 *
	 * @param {string} url
	 * @param {string | undefined} label
	 * @param {boolean} isPaste
	 * @param {string | undefined} selectedText
	 * @param {number | undefined} selectionStart
	 * @param {number} insertedLength
	 * @private
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	async performUrlConversion(url, label, isPaste, selectedText, selectionStart, insertedLength) {
		// Wait for the paste/drop to complete naturally
		await sleep()

		// Force CodeMirror to create a history boundary (if CodeMirror is available)
		// This ensures the paste/drop is saved as a separate undo event before we convert it
		if ('codeMirror' in this && this.codeMirror) {
			const codeMirror =
				/** @type {InstanceType<ReturnType<typeof import('./OoUiInputCodeMirror').default>>} */ (
					this.codeMirror
				)
			const view = codeMirror.view
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			if (view) {
				const currentSelection = view.state.selection.main

				// Dispatch a selection change to the same range (preserves selection for drop events)
				// This creates a history boundary without changing the document
				view.dispatch({
					selection: { anchor: currentSelection.anchor, head: currentSelection.head },
				})
			}
		}

		// Get the current selection after paste
		const [newSelectionStart, _newSelectionEnd] = this.$input.textSelection('getCaretPosition', {
			startAndEnd: true,
		})

		// Try to convert the URL
		const convertedLink = await this.convertUrlToWikilink(url, label)
		if (!convertedLink) {
			return
		}

		// If the converted link is the same as the original URL (no label, couldn't convert to
		// wikilink), don't replace it - the browser already pasted it correctly. FIXME: maybe
		// convertUrlToWikilink() should just return null if there is no label and it can't convert to
		// a wikilink.
		if (convertedLink === url) {
			return
		}

		// Calculate where the pasted content is
		if (isPaste) {
			let insertedStart
			let insertedEnd
			if (selectedText) {
				// Text was selected and replaced
				insertedStart = selectionStart ?? 0
				insertedEnd = newSelectionStart
			} else {
				// Text was inserted at caret
				insertedStart = newSelectionStart - insertedLength
				insertedEnd = newSelectionStart
			}
			this.selectRange(insertedStart, insertedEnd)
		}

		// Select the pasted content and replace it with the converted link
		this.insertContent(convertedLink)
	}
}

es6ClassToOoJsClass(TextInputWidgetMixin)

export default TextInputWidgetMixin
