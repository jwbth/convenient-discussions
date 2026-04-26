import { urlToInterwikiLink } from './interwikiPrefixes'
import cd from './loader/cd'
import { parseWikiUrl, sleep, underlinesToSpaces } from './shared/utils-general'
import { encodeLinkLabel, encodeWikilink } from './shared/utils-wikitext'
import { convertHtmlToWikitext } from './utils-api'
import { es6ClassToOoJsClass, getMixinBaseClassPrototype } from './utils-oojs-class'
import {
	cleanUpPasteDom,
	getElementFromPasteHtml,
	interlanguagePrefixes,
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
	 * @type {{selectedText: string, start: number, leadingSpaces: string, trailingSpaces: string} | undefined}
	 * @private
	 */
	autocompleteSavedSelection

	/**
	 * Autocomplete manager instance.
	 *
	 * @type {import('./AutocompleteManager').default | undefined}
	 */
	autocompleteManager

	/**
	 * @type {typeof import('./controller').default}
	 * @private
	 */
	controller

	/**
	 * Whether this input supports external links (whether they will be turned into <a> tags or not).
	 * If false, external links that cannot be converted to wikilinks will be inserted as plain URLs.
	 *
	 * @type {boolean}
	 * @private
	 */
	supportsComplexMarkup = true

	constructor() {
		// NOTE: ths is *not* called. construct() is called instead.

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
	 * @param {object} config
	 * @param {typeof import('./controller').default} config.controller
	 * @param {boolean} [config.supportsComplexMarkup] Whether this input supports external
	 *   links. If false, external links that cannot be converted to wikilinks will be inserted as
	 *   plain URLs without labels.
	 */
	construct(config) {
		this.controller = config.controller
		this.supportsComplexMarkup = config.supportsComplexMarkup ?? true

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

		const rawSelectedText =
			start !== null && end !== null ? element.value.substring(start, end) : ''
		const selectedText = rawSelectedText.trimEnd()
		const leadingSpaces = rawSelectedText.substring(
			0,
			rawSelectedText.length - rawSelectedText.trimStart().length,
		)
		const trailingSpaces = rawSelectedText.substring(selectedText.length + leadingSpaces.length)

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
			selectedText.length > 0
				? {
						selectedText,
						start: /** @type {number} */ (start),
						leadingSpaces,
						trailingSpaces,
					}
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
	 * @returns {{selectedText: string, start: number, leadingSpaces: string, trailingSpaces: string} | undefined} The selected text and its
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
	 * @param {boolean} [addPasteDropListeners]
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	addEventListeners(addPasteDropListeners = true) {
		const $element = this.getEditableElement()
		$element[0].cdInput = this
		$element
			.on('input.cd', (event) => {
				this.emit('manualChange', this.getValue())
				this.handleBacktickInput(event)
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

		if (addPasteDropListeners) {
			const pasteDropHandler = this.createTextInputPasteDropHandler()
			$element[0].addEventListener('paste', pasteDropHandler, true)
			$element[0].addEventListener('drop', pasteDropHandler, true)
		}
	}

	/**
	 * Creates a handler for `paste` and `drop` events for text inputs (headline and summary).
	 *
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 * @returns {(event: ClipboardEvent | DragEvent) => void}
	 */
	createTextInputPasteDropHandler() {
		return (event) => {
			this.handleUrlConversion(event, this.controller.getIsShiftPressed())
		}
	}

	/**
	 * Handle backtick input for code markup conversion.
	 *
	 * @param {JQuery.TriggeredEvent} event Input event
	 * @private
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	handleBacktickInput(event) {
		if (!this.supportsComplexMarkup) return

		// Get the input data - either from originalEvent (native) or from the event itself (CodeMirror)
		const inputEvent = /** @type {InputEvent} */ (event.originalEvent || event)
		if (inputEvent.data !== '`') return

		const element = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (
			this.getEditableElement()[0]
		)
		const value = element.value
		const cursorPos = element.selectionStart
		if (cursorPos === null) return

		// Check if we just completed a triple backtick sequence
		// @ts-ignore
		if (this.allowLinebreaks && this.handleTripleBacktickInput(value, cursorPos)) {
			return
		}

		// Handle single backtick conversion
		this.handleSingleBacktickInput(value, cursorPos)
	}

	/**
	 * Handle triple backtick input for code block markup conversion.
	 *
	 * @param {string} value Current input value
	 * @param {number} cursorPos Current cursor position
	 * @returns {boolean} Whether triple backtick conversion was performed
	 * @private
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	handleTripleBacktickInput(value, cursorPos) {
		// Check if the just-typed backtick completes a triple backtick sequence
		// Look for ``` at cursor position - 3
		if (
			cursorPos >= 3 &&
			value[cursorPos - 1] === '`' &&
			value[cursorPos - 2] === '`' &&
			value[cursorPos - 3] === '`'
		) {
			// Make sure it's not part of a longer sequence (e.g., ````)
			// Check if there's a backtick before or after the triple backtick
			if (
				(cursorPos >= 4 && value[cursorPos - 4] === '`') ||
				(cursorPos < value.length && value[cursorPos] === '`')
			) {
				return false
			}

			// Find all triple backtick sequences in the content (exactly 3, not more)
			// Use a regex that matches exactly 3 backticks not preceded or followed by another backtick
			const tripleBacktickRegex = /(?<!`)```(?!`)/g
			const matches = [...value.matchAll(tripleBacktickRegex)]

			// If more than 2 pairs already exist, halt
			if (matches.length > 2) return false

			// Determine if this is the first or second triple backtick
			const beforeCursor = value.substring(0, cursorPos - 3)
			const afterCursor = value.substring(cursorPos)

			const tripleBackticksBeforeCursor = (beforeCursor.match(/(?<!`)```(?!`)/g) || []).length
			const tripleBackticksAfterCursor = (afterCursor.match(/(?<!`)```(?!`)/g) || []).length

			let firstTripleBacktickPos
			let secondTripleBacktickPos
			let cursorAfterOpening

			// Scenario 1: Exactly 1 triple backtick before, 0 after (typed closing triple backtick)
			if (tripleBackticksBeforeCursor === 1 && tripleBackticksAfterCursor === 0) {
				firstTripleBacktickPos = beforeCursor.lastIndexOf('```')
				// Verify it's exactly 3 backticks at this position
				if (
					(firstTripleBacktickPos > 0 && beforeCursor[firstTripleBacktickPos - 1] === '`') ||
					(firstTripleBacktickPos + 3 < beforeCursor.length &&
						beforeCursor[firstTripleBacktickPos + 3] === '`')
				) {
					return false
				}
				secondTripleBacktickPos = cursorPos - 3
				cursorAfterOpening = false
			}
			// Scenario 2: 0 triple backticks before, exactly 1 after (typed opening triple backtick)
			else if (tripleBackticksBeforeCursor === 0 && tripleBackticksAfterCursor === 1) {
				firstTripleBacktickPos = cursorPos - 3
				const afterMatch = afterCursor.match(/(?<!`)```(?!`)/)
				if (!afterMatch) return false
				secondTripleBacktickPos = afterCursor.indexOf(afterMatch[0]) + cursorPos
				cursorAfterOpening = true
			}
			// No valid pair found
			else {
				return false
			}

			// Extract content between the triple backticks
			let contentBetween = value.substring(firstTripleBacktickPos + 3, secondTripleBacktickPos)

			// Extract language if present (e.g., ```javascript\n...). If no language is specified but
			// there is a newline (```\n...), we still consider it a block and strip the newline.
			let lang = 'text'
			const langMatch = contentBetween.match(/^([^\s\n]*)\n/)
			if (langMatch) {
				lang = langMatch[1] || 'text'
				contentBetween = contentBetween.substring(langMatch[0].length)
			}

			const isBlock = Boolean(langMatch)
			const shouldSelectLang = !langMatch?.[1]

			const openTag = `<syntaxhighlight lang="${lang}">`
			const closeTag = '</syntaxhighlight>'

			// For blocks, ensure at least one newline after opening and before closing. If there is an
			// empty line between backticks, there are two newlines between tags. For one-liners, use
			// no newlines.
			const processedContent = isBlock
				? '\n' +
					contentBetween +
					(contentBetween === '' || contentBetween.endsWith('\n') ? '' : '\n')
				: contentBetween.trim()

			// Calculate new cursor position
			const newCursorPos = cursorAfterOpening
				? firstTripleBacktickPos + openTag.length + (isBlock ? 1 : 0)
				: firstTripleBacktickPos + openTag.length + processedContent.length + closeTag.length

			// Select the range to replace (both triple backticks and content between them)
			this.focus()
			this.$input.textSelection('setSelection', {
				start: firstTripleBacktickPos,
				end: secondTripleBacktickPos + 3,
			})

			// Insert the new content
			const replacement = openTag + processedContent + closeTag
			this.insertContent(replacement)

			// Set cursor position
			if (shouldSelectLang) {
				const langStart = firstTripleBacktickPos + '<syntaxhighlight lang="'.length
				this.$input.textSelection('setSelection', {
					start: langStart,
					end: langStart + lang.length,
				})
			} else {
				this.$input.textSelection('setSelection', { start: newCursorPos, end: newCursorPos })
			}

			return true
		}

		return false
	}

	/**
	 * Handle single backtick input for inline code markup conversion.
	 *
	 * @param {string} value Current input value
	 * @param {number} cursorPos Current cursor position
	 * @private
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	handleSingleBacktickInput(value, cursorPos) {
		// Find the current line boundaries
		const lineStart = value.lastIndexOf('\n', cursorPos - 1) + 1
		const lineEnd = value.indexOf('\n', cursorPos)
		const lineEndPos = lineEnd === -1 ? value.length : lineEnd

		// Get the line content and cursor position within the line
		const line = value.substring(lineStart, lineEndPos)
		const cursorInLine = cursorPos - lineStart

		// The just-typed backtick is at cursorInLine - 1
		// Find backticks before the just-typed backtick (excluding it)
		const beforeTypedBacktick = line.substring(0, cursorInLine - 1)
		const backticksBeforeTyped = beforeTypedBacktick.match(/`/g)

		// Find backticks after the just-typed backtick (excluding it)
		const afterTypedBacktick = line.substring(cursorInLine)
		const backticksAfterTyped = afterTypedBacktick.match(/`/g)

		let firstBacktickInLine
		let secondBacktickInLine
		let cursorAfterOpening

		// Scenario 1: Exactly 1 backtick before, 0 after (typed closing backtick)
		if (backticksBeforeTyped?.length === 1 && !backticksAfterTyped) {
			firstBacktickInLine = beforeTypedBacktick.lastIndexOf('`')
			secondBacktickInLine = cursorInLine - 1 // The just-typed backtick
			cursorAfterOpening = false // Cursor should be after closing tag

			// Check if there's a backtick immediately before or after to form ``
			if (
				(cursorInLine >= 2 && line[cursorInLine - 2] === '`') ||
				(cursorInLine < line.length && line[cursorInLine] === '`')
			) {
				return
			}
		}
		// Scenario 2: 0 backticks before, exactly 1 after (typed opening backtick)
		else if (!backticksBeforeTyped && backticksAfterTyped?.length === 1) {
			firstBacktickInLine = cursorInLine - 1 // The just-typed backtick
			secondBacktickInLine = cursorInLine + afterTypedBacktick.indexOf('`')
			cursorAfterOpening = true // Cursor should be after opening tag

			// Check if there's a backtick immediately before or after to form ``
			if (
				(cursorInLine >= 2 && line[cursorInLine - 2] === '`') ||
				(cursorInLine < line.length && line[cursorInLine] === '`')
			) {
				return
			}
		}
		// No valid pair found
		else {
			return
		}

		const firstBacktickPos = lineStart + firstBacktickInLine
		const secondBacktickPos = lineStart + secondBacktickInLine

		// Replace both backticks with code markup
		const openTag = '<code><nowiki>'
		const closeTag = '</nowiki></code>'

		// Calculate new cursor position
		const newCursorPos = cursorAfterOpening
			? firstBacktickPos + openTag.length
			: firstBacktickPos +
				openTag.length +
				(secondBacktickPos - firstBacktickPos - 1) +
				closeTag.length

		// Set the new value and cursor position
		// Select the range to replace (both backticks and content between them)
		this.focus()
		this.$input.textSelection('setSelection', {
			start: firstBacktickPos,
			end: secondBacktickPos + 1,
		})

		// Insert the new content (this makes it undoable with a single Ctrl+Z)
		const replacement =
			openTag + value.substring(firstBacktickPos + 1, secondBacktickPos) + closeTag
		this.insertContent(replacement)

		// Set cursor position
		this.$input.textSelection('setSelection', { start: newCursorPos, end: newCursorPos })
	}

	/**
	 * Extract URL and label from paste/drop data.
	 *
	 * @param {DataTransfer} data
	 * @param {string} [selectedText]
	 * @returns {{ url: string; label: string | undefined } | undefined}
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
				label = cleanUpPasteDom(links[0], this.$element[0]).text.trim() || selectedText
			}
		}

		// When dropping an image from a web page, text/html can be present but not contain an <a>
		// element, so we need to check for other types.
		if (!url) {
			// 3. text/uri-list
			if (data.types.includes('text/uri-list')) {
				const uriList = data.getData('text/uri-list')
				const urls = uriList.split(/\r?\n/).filter((line) => line && !line.startsWith('#'))

				// Only process if it's a single URL
				if (urls.length === 1) {
					url = urls[0]
					label = selectedText
				} else if (urls.length > 1) {
					// Multiple URLs - don't convert
					return
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
						return
					}
					url = plainText
					label = selectedText
				} else {
					return
				}
			}
		}

		if (!url) {
			return
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
	 * @param {string} [label]
	 * @param {boolean} [isShiftPressed] Whether Shift key is pressed
	 * @returns {Promise<string|undefined>} The converted link or undefined if conversion failed
	 * @private
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	async convertUrlToWikilink(url, label, isShiftPressed = false) {
		let urlObj
		try {
			urlObj = new URL(url)
		} catch {
			return
		}

		// Check if URL has query parameters other than 'title'
		const params = new URLSearchParams(urlObj.search)
		const paramKeys = [...params.keys()]

		// Try to get interwiki link directly from URL
		const interwikiLink = urlToInterwikiLink(url)
		if (interwikiLink) {
			return this.buildWikilink({
				target: interwikiLink.prefixedPageName,
				label,
				pageNameWithFragment: interwikiLink.pageName,
				isShiftPressed,
				hostname: urlObj.hostname,
			})
		}

		// Special case: red links have action=edit and redlink=1 parameters. These should be converted
		// to wikilinks (title parameter contains the page name)
		const isRedLink =
			paramKeys.length === 3 &&
			params.get('action') === 'edit' &&
			params.get('redlink') === '1' &&
			params.has('title')

		const hasOtherParams = paramKeys.some(
			(key) => key !== 'title' && !(isRedLink && (key === 'action' || key === 'redlink')),
		)

		if (hasOtherParams) {
			// Can't convert to wikilink - use external link format if supported
			if (!this.supportsComplexMarkup) {
				return
			}

			return this.formatExternalLink(url, label)
		}

		// Show pending state during async operations
		this.pushPending().setDisabled(true)

		try {
			// Check if the URL looks like a wiki URL before proceeding
			const looksLikeWikiUrl = cd.g.articlePathRegexp.test(urlObj.pathname) || params.has('title')

			if (!looksLikeWikiUrl) {
				// Doesn't look like a wiki URL - throw to fall back to external link format
				throw new Error('URL does not look like a wiki URL')
			}

			return await this.convertUrlToWikilinkWithPrefix(url, urlObj, params, label, isShiftPressed)
		} catch {
			// Fall back to external link format on any error (if supported)
			if (!this.supportsComplexMarkup) {
				return
			}

			return this.formatExternalLink(url, label)
		} finally {
			this.popPending().setDisabled(false).focus()
		}
	}

	/**
	 * Build a wikilink from a target and optional label.
	 *
	 * @param {object} options
	 * @param {string} options.target Target page name (may include interwiki prefix and fragment)
	 * @param {string} [options.label] Optional label for the link
	 * @param {string} [options.pageNameWithFragment] Page name without prefix but with fragment (for
	 *   Shift+paste label)
	 * @param {boolean} [options.isShiftPressed] Whether Shift key is pressed
	 * @param {string} [options.hostname] Hostname of the URL (for interwiki prefix detection)
	 * @returns {string}
	 * @private
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	buildWikilink({ target, label, pageNameWithFragment, isShiftPressed = false, hostname }) {
		let wikilink = `[[${target}`

		// If Shift is pressed and there's no existing label, and it's an interwiki link (different domain),
		// use the page name as the label
		if (
			isShiftPressed &&
			!label &&
			pageNameWithFragment &&
			hostname &&
			hostname !== cd.g.serverName
		) {
			label = pageNameWithFragment
		}

		if (label && underlinesToSpaces(label) !== target) {
			const encodedLabel = encodeLinkLabel(label)
			wikilink += `|${encodedLabel}`
		}

		wikilink += ']]'

		return wikilink
	}

	/**
	 * Convert a URL to a wikilink by determining the interwiki prefix.
	 *
	 * @param {string} url
	 * @param {URL} urlObj
	 * @param {URLSearchParams} _params
	 * @param {string} [label]
	 * @param {boolean} [isShiftPressed] Whether Shift key is pressed
	 * @returns {Promise<string>}
	 * @private
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	async convertUrlToWikilinkWithPrefix(url, urlObj, _params, label, isShiftPressed = false) {
		// Get interwiki prefix
		let interwikiPrefix

		// Same domain = empty interwiki prefix (no need to load external script)
		if (urlObj.hostname === cd.g.serverName) {
			interwikiPrefix = ''
		} else {
			// Load the interwiki prefix detection script if not already loaded
			if (!window.getInterwikiPrefixForHostname && cd.g.isProbablyWmfSulWiki) {
				try {
					await $.ajax(
						'https://en.wikipedia.org/w/index.php?title=User:Jack_who_built_the_house/getUrlFromInterwikiLink.js&action=raw&ctype=text/javascript',
						{
							dataType: 'script',
							cache: true,
							timeout: 5000,
						},
					)
				} catch {
					// Script failed to load - throw to fall back to external link format
					throw new Error('Failed to load interwiki script')
				}
			}

			if (!window.getInterwikiPrefixForHostname) {
				throw new Error('getInterwikiPrefixForHostname not available')
			}

			interwikiPrefix = await window.getInterwikiPrefixForHostname(urlObj.hostname, cd.g.serverName)

			if (interwikiPrefix === null) {
				// No interwiki prefix available - throw to fall back to external link format
				throw new Error('No interwiki prefix available')
			}
		}

		// Parse the wiki URL
		const parsedUrl = parseWikiUrl(url)
		if (!parsedUrl) {
			// Can't parse - throw to fall back to external link format
			throw new Error('Failed to parse wiki URL')
		}

		// Check if we need a leading colon (for interlanguage prefixes, File and Category pages). The
		// interwiki prefix already includes the trailing colon when present.
		let needsLeadingColon
		if (parsedUrl.hostname === cd.g.serverName) {
			const mwTitle = mw.Title.newFromText(parsedUrl.pageName)
			if (!mwTitle) {
				throw new Error('Failed to parse page name')
			}
			needsLeadingColon = mwTitle.getNamespaceId() === 6 || mwTitle.getNamespaceId() === 14
		} else {
			needsLeadingColon =
				interwikiPrefix && interlanguagePrefixes.has(interwikiPrefix.split(':')[0])
		}
		const leadingColon = needsLeadingColon ? ':' : ''

		// Build the target with fragment if present
		let target = interwikiPrefix + parsedUrl.pageName
		let pageNameWithFragment = parsedUrl.pageName
		if (parsedUrl.fragment) {
			let decodedFragment = mw.util.percentDecodeFragment(parsedUrl.fragment)
			if (!decodedFragment) {
				// Decoding failed - throw to fall back to external link format
				throw new Error('Failed to decode fragment')
			}
			decodedFragment = encodeWikilink(underlinesToSpaces(decodedFragment))
			target += `#${decodedFragment}`
			pageNameWithFragment += `#${decodedFragment}`
		}

		return this.buildWikilink({
			target: leadingColon + target,
			label,
			pageNameWithFragment,
			isShiftPressed,
			hostname: urlObj.hostname,
		})
	}

	/**
	 * Format a URL as an external link.
	 *
	 * @param {string} url
	 * @param {string} [label]
	 * @returns {string | undefined}
	 * @private
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	formatExternalLink(url, label) {
		const escapedLabel = label && encodeLinkLabel(label)

		return escapedLabel ? `[${url} ${escapedLabel}]` : undefined
	}

	/**
	 * Get the drop position from a drop event.
	 *
	 * @param {DragEvent} event
	 * @returns {number | undefined}
	 * @private
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	getDropPosition(event) {
		const element = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (
			this.getEditableElement()[0]
		)

		// For CodeMirror, we need to use its API
		if ('codeMirror' in this && this.codeMirror) {
			const codeMirror =
				/** @type {InstanceType<ReturnType<typeof import('./OoUiInputCodeMirror').default>>} */ (
					this.codeMirror
				)
			const view = codeMirror.view
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			if (view) {
				const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })

				return pos ?? undefined
			}
		}

		// For regular textarea/input, use document.caretPositionFromPoint or document.caretRangeFromPoint
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (document.caretPositionFromPoint) {
			const caretPosition = document.caretPositionFromPoint(event.clientX, event.clientY)
			if (caretPosition?.offsetNode === element) {
				return caretPosition.offset
			}
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-deprecated
		} else if (document.caretRangeFromPoint) {
			// eslint-disable-next-line @typescript-eslint/no-deprecated
			const range = document.caretRangeFromPoint(event.clientX, event.clientY)
			if (range?.startContainer === element) {
				return range.startOffset
			}
		}

		return undefined
	}

	/**
	 * Handle paste/drop events for URL conversion.
	 *
	 * @param {ClipboardEvent | DragEvent} event
	 * @param {boolean} [isShiftPressedForPaste] Whether Shift is pressed (for paste events)
	 * @returns {boolean} Whether URL conversion will happen
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	handleUrlConversion(event, isShiftPressedForPaste) {
		const data = 'clipboardData' in event ? event.clipboardData : event.dataTransfer
		if (!data) return false

		const isPaste = 'clipboardData' in event
		const insertedLength = data.getData('text/plain').length

		// Determine if Shift is pressed
		// For paste events, use the provided value (or default to false)
		// For drop events, check event.shiftKey
		const isShiftPressed = isPaste
			? (isShiftPressedForPaste ?? false)
			: /** @type {DragEvent} */ (event).shiftKey

		// Determine if text is selected and get the position
		let selectedText
		let selectionStart
		let selectionEnd
		if (isPaste) {
			;[selectionStart, selectionEnd] = this.$input.textSelection('getCaretPosition', {
				startAndEnd: true,
			})
			if (selectionStart !== selectionEnd) {
				selectedText = this.getValue().substring(selectionStart, selectionEnd)
			}
		} else {
			// For drop events, get the drop position
			const dropPosition = this.getDropPosition(/** @type {DragEvent} */ (event))
			if (dropPosition !== undefined) {
				selectionStart = dropPosition
				selectionEnd = dropPosition
			}
		}

		// Check if we're pasting/dropping inside existing link markup like [^ link label]
		const linkMarkupContext =
			selectionStart === undefined ? null : this.detectLinkMarkupContext(selectionStart)

		// Extract URL and label
		const extracted = this.extractUrlFromData(data, selectedText)
		if (!extracted) {
			return false
		}

		let { url, label } = extracted

		// If we're inside link markup, use the markup's label instead of the pasted link's label
		if (linkMarkupContext) {
			label = linkMarkupContext.label
		}

		// If the selected text (which would be used as label) is itself a URL, wikilink, or template,
		// don't use it as a label (user is likely replacing one with another)
		if (label && !linkMarkupContext) {
			const trimmedLabel = label.trim()

			// Check if it's a URL
			try {
				// eslint-disable-next-line no-new
				new URL(trimmedLabel)
				label = undefined
			} catch {
				// Not a URL, check for wikilinks, templates, and MediaWiki placeholders like [1]
				if (
					trimmedLabel.includes('[[') ||
					trimmedLabel.includes('{{') ||
					/^\[\d+\]$/.test(trimmedLabel)
				) {
					label = undefined
				}
			}
		}

		// Memorize leading/trailing spaces from selected text to add them back later
		// Don't change the selection now - let the native paste happen with spaces included
		let leadingSpaces = ''
		let trailingSpaces = ''
		if (selectedText) {
			const leadingSpaceCount = selectedText.length - selectedText.trimStart().length
			const trailingSpaceCount = selectedText.length - selectedText.trimEnd().length
			leadingSpaces = selectedText.substring(0, leadingSpaceCount)
			trailingSpaces = selectedText.substring(selectedText.length - trailingSpaceCount)
		}

		// Schedule the actual conversion
		this.performUrlConversion({
			url,
			label,
			isPaste,
			selectionStart,
			insertedLength,
			leadingSpaces,
			trailingSpaces,
			isShiftPressed,
			linkMarkupContext,
		})

		return true
	}

	/**
	 * Detect if the cursor is inside link markup like [^ link label].
	 *
	 * @param {number} position Cursor position
	 * @returns {{ label: string; start: number; end: number; hasClosingBracket: boolean } | null}
	 * @private
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	detectLinkMarkupContext(position) {
		const value = this.getValue()
		const lineStart = value.lastIndexOf('\n', position - 1) + 1
		const lineEnd = value.indexOf('\n', position)
		const line = value.substring(lineStart, lineEnd === -1 ? undefined : lineEnd)
		const positionInLine = position - lineStart

		// Check if there's an opening bracket before the cursor on the same line
		const openBracketIndex = line.lastIndexOf('[', positionInLine - 1)
		if (openBracketIndex === -1 || openBracketIndex !== positionInLine - 1) {
			return null
		}

		// Look for closing bracket on the same line
		const closeBracketIndex = line.indexOf(']', positionInLine)
		if (closeBracketIndex === -1) {
			// No closing bracket found - we'll "eat" the opening bracket if conversion succeeds
			return {
				label: '',
				start: lineStart + openBracketIndex,
				end: position,
				hasClosingBracket: false,
			}
		}

		// Extract the label between cursor and closing bracket
		const label = line.substring(positionInLine, closeBracketIndex).trim()

		return {
			label,
			start: lineStart + openBracketIndex,
			end: lineStart + closeBracketIndex + 1,
			hasClosingBracket: true,
		}
	}

	/**
	 * Perform the URL conversion after the paste/drop has completed.
	 *
	 * @param {object} options
	 * @param {string} options.url URL to convert
	 * @param {string} [options.label] Optional label for the link
	 * @param {boolean} options.isPaste Whether this is a paste (vs drop) event
	 * @param {number} [options.selectionStart] Selection start position (for paste events)
	 * @param {number} options.insertedLength Length of inserted text
	 * @param {string} options.leadingSpaces Leading spaces from selected text to preserve
	 * @param {string} options.trailingSpaces Trailing spaces from selected text to preserve
	 * @param {boolean} options.isShiftPressed Whether Shift key is pressed
	 * @param {{ label: string; start: number; end: number; hasClosingBracket: boolean } | null} [options.linkMarkupContext] Link markup context if pasting inside [^ label]
	 * @private
	 * @this {TextInputWidgetMixin & OO.ui.TextInputWidget}
	 */
	async performUrlConversion({
		url,
		label,
		isPaste,
		selectionStart,
		insertedLength,
		leadingSpaces,
		trailingSpaces,
		isShiftPressed,
		linkMarkupContext,
	}) {
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

		// Get the current selection after paste/drop
		const [newSelectionStart, newSelectionEnd] = this.$input.textSelection('getCaretPosition', {
			startAndEnd: true,
		})

		// Try to convert the URL
		const convertedLink = await this.convertUrlToWikilink(url, label, isShiftPressed)
		// If the converted link is the same as the original URL (no label, couldn't convert to
		// wikilink), don't replace it - the browser already pasted it correctly
		if (!convertedLink || convertedLink === url) {
			return
		}

		// Calculate where the pasted/dropped content is
		// - For paste: use the original selectionStart
		// - For drop: check if text is already selected (Chrome behavior) or calculate from cursor
		//   position (Firefox)
		let insertedStart
		let insertedEnd
		if (isPaste) {
			insertedStart = selectionStart ?? 0
			insertedEnd = insertedStart + insertedLength

			// For drop events, check if browser auto-selected the dropped text
		} else if (newSelectionEnd - newSelectionStart === insertedLength) {
			// Chrome: text is already selected
			insertedStart = newSelectionStart
			insertedEnd = newSelectionEnd
		} else {
			// Firefox: cursor is at end, work backwards
			insertedStart = newSelectionStart - insertedLength
			insertedEnd = newSelectionStart
		}

		// If we're inside link markup, handle it specially
		if (linkMarkupContext) {
			// Only proceed if conversion to wikilink was successful (starts with [[)
			if (!convertedLink.startsWith('[[')) {
				return
			}

			// After the native paste, the content has shifted. We need to adjust the positions.
			// The link was inserted at the position right after the opening bracket.
			// Calculate the shift: the inserted content length
			const shift = insertedLength

			// Adjust the markup positions based on where the content was inserted
			let adjustedStart
			let adjustedEnd

			if (linkMarkupContext.hasClosingBracket) {
				// We have [^ label] where ^ is where the link was inserted
				// After paste: [<inserted_url> label]
				// We want to replace from [ to ]
				adjustedStart = linkMarkupContext.start
				adjustedEnd = linkMarkupContext.end + shift
			} else {
				// We have [^ (no closing bracket) where ^ is where the link was inserted
				// After paste: [<inserted_url>
				// We want to replace from [ to the end of inserted content
				adjustedStart = linkMarkupContext.start
				adjustedEnd = insertedEnd
			}

			// Select the entire markup range (adjusted for the shift)
			this.selectRange(adjustedStart, adjustedEnd)

			// Insert the converted link (no spaces needed here)
			this.insertContent(convertedLink)

			return
		}

		// Normal case: not inside link markup
		// Select the pasted/dropped content
		this.selectRange(insertedStart, insertedEnd)

		// Add back the leading/trailing spaces that were in the original selection
		const linkWithSpaces = leadingSpaces + convertedLink + trailingSpaces

		// Select the pasted content and replace it with the converted link (with spaces)
		this.insertContent(linkWithSpaces)
	}
}

es6ClassToOoJsClass(TextInputWidgetMixin)

export default TextInputWidgetMixin
