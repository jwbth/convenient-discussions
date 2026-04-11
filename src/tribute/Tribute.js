/**
 * Tribute.js
 * Native ES6 JavaScript @mention Plugin
 * Improved and adapted for use in the Convenient Discussions script. (There shoudln't be
 * any hardcode related to CD here.)
 *
 * @license
 * The MIT License (MIT)
 *
 * Copyright (c) 2020 Jack who built the house
 * Copyright (c) 2017-2020 ZURB, Inc.
 * Copyright (c) 2014 Jeff Collins
 * Copyright (c) 2012 Matt York
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 * and associated documentation files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or
 * substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
 * BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 * DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 **/

import TributeEvents from './TributeEvents'
import TributeMenuEvents from './TributeMenuEvents'
import TributeRange from './TributeRange'
import TributeSearch from './TributeSearch'
import tributeCss from './tribute.less?inline'

/**
 * Properties that are shared between global config and individual collections. Global config
 * properties serve as defaults that can be overridden at the collection level.
 *
 * @template {import('../BaseAutocomplete').Option} [Value=import('../BaseAutocomplete').Option]
 * @typedef {object} TributeSharedOptions
 * @property {string} [containerClass='tribute-container'] Class added to the menu container
 * @property {string} [fillAttr='value'] Column that contains the content to insert by default
 * @property {string} [itemClass=''] Class added to each list item
 * @property {string | ((item: Value, mentionText: string) => string)} [lookup='key'] Column to search
 *   against in the object
 * @property {number | null} [menuItemLimit=null] Limits the number of items in the menu
 * @property {number} [menuShowMinLength=0] Minimum number of characters that must be typed before
 *   menu appears
 * @property {object} [searchOpts={}] Customize the elements used to wrap matched strings within the
 *   results list
 * @property {string} [selectClass='highlight'] Class added in the flyout menu for active item
 * @property {string} [trigger='@'] Symbol or string that starts the lookup
 * @property {boolean} [tabSelectsStartOnly] Whether Tab inserts only `data.start` (no content/end
 *   wrapping), unlike Enter which inserts the full text
 * @property {boolean} [allowNesting=false] Whether this autocomplete type allows nesting of the
 *   same trigger
 */

/**
 * Properties unique to individual collections.
 *
 * @template {import('../BaseAutocomplete').Option} [Value=import('../BaseAutocomplete').Option]
 * @typedef {object} TributeCollectionSpecific
 * @property {string} label Collection identifier/label
 * @property {Value[] | ((text: string, callback: (arr: Value[]) => void) => void)} values Array of
 *   objects to search across or a function that takes a query text and calls a callback provided to
 *   it with that array
 * @property {RegExp} [keepAsEnd] Custom regex for end matching behavior
 * @property {(searchResults: TributeSearchResults<Value>) => string} [menuItemTemplate] Template
 *   for displaying item in menu
 * @property {boolean} [replaceEnd] Whether to replace text at the end
 * @property {boolean} [requireLeadingSpace] Specify whether a space is required before the trigger
 *   string
 * @property {(item: TributeSearchResults<Value> | undefined, event: KeyboardEvent | MouseEvent) =>
 *   string | InsertData} [selectTemplate] Function called on select that returns the content to
 *   insert
 */

/**
 * Properties unique to the global config.
 *
 * @typedef {object} TributeConfigSpecific
 * @property {TributeCollection[] | null} [collection=null] Array of collection objects
 * @property {'ltr' | 'rtl'} [direction='ltr'] Text direction for the menu
 * @property {boolean} [allowSpaces=false] Specify whether a space is allowed in the middle of
 *   mentions
 * @property {HTMLElement | null} [menuContainer=null] Alternative parent container for the menu
 * @property {string | ((value: string) => string | null) | null} [noMatchTemplate=null] Template
 *   for when no match is found
 * @property {boolean} [positionMenu=true] Specify whether the menu should be positioned
 * @property {string | null} [replaceTextSuffix=null] Custom suffix for the replace text
 */

/**
 * A collection object.
 *
 * @template {import('../BaseAutocomplete').Option} [Value=import('../BaseAutocomplete').Option]
 * @typedef {TributeSharedOptions<Value> & TributeCollectionSpecific<Value>} TributeCollection
 */

/**
 * A config object supplied to the constructor. It has some properties intended to be defaults for
 * all collections.
 *
 * @template {import('../BaseAutocomplete').Option} [Value=import('../BaseAutocomplete').Option]
 * @typedef {TributeSharedOptions<Value> & TributeConfigSpecific} TributeConfig
 */

/**
 * The strings used to wrap matched strings within the results list.
 *
 * @typedef {object} SearchOptions
 * @property {string} [pre] Opening tag for matched strings
 * @property {string} [post] Closing tag for matched strings
 * @property {boolean} [skip] Skip local search, useful if doing server-side search
 */

/**
 * Array items in the return value of {@link TributeSearch#filter}.
 *
 * @template {import('../BaseAutocomplete').Option} Value
 * @typedef {object} TributeSearchResults
 * @property {string} string Matched string value
 * @property {number} score Match score
 * @property {number} index Index of the matched item
 * @property {Value} original Original value object
 */

/**
 * Data to insert into the input along with some modification logic that can be supplied to
 * {@link TributeDange#replaceTriggerText} in addition to strings.
 *
 * @typedef {object} InsertData
 * @property {string} start Start text
 * @property {string} [end] End text
 * @property {string} [content] Text between start and end
 * @property {() => boolean} [omitContentCheck] Function that checks whether to omit
 *   {@link InsertData#content}. This can be done so that the inserted text ends up having a pipe
 *   trick (e.g. `[[User:Example|]]` that would be saved as `[[User:Example|Example]]`)
 * @property {boolean} [selectContent] Whether to select content, or put caret at its place if it's
 *   empty (this is done automatically when Shift is held)
 * @property {() => void} [altModify] Function that modifies this data if the Alt key is held
 * @property {() => void} [shiftModify] Function that modifies this data if the Shift key is held
 * @property {() => void} [cmdModify] Function that modifies this data if the Command key is held
 */

/**
 * @typedef {Element | NodeList | HTMLCollection | Element[] | JQuery} TributeElement
 */

class Tribute {
	static cssInjected = false

	constructor(
		/** @type {TributeConfig} */ {
			selectClass = 'highlight',
			containerClass = 'tribute-container',
			itemClass = '',
			trigger = '@',
			lookup = 'key',
			fillAttr = 'value',
			collection = null,
			menuContainer = null,
			noMatchTemplate = null,
			allowSpaces = false,
			replaceTextSuffix = null,
			positionMenu = true,
			searchOpts = {},
			menuItemLimit = null,
			menuShowMinLength = 0,
			direction = 'ltr',
			allowNesting = false,
			tabSelectsStartOnly = false,
		},
	) {
		if (!Tribute.cssInjected) {
			mw.util.addCSS(tributeCss)
			Tribute.cssInjected = true
		}

		/**
		 * @typedef {object} Current
		 * @property {TributeCollection} [collection]
		 * @property {string} [trigger]
		 * @property {boolean} [externalTrigger]
		 * @property {HTMLElement} [element]
		 * @property {number} [triggerPos]
		 * @property {string} [mentionText]
		 * @property {TributeSearchResults<any>[]} [filteredItems]
		 */

		/**
		 * @type {Current}
		 */
		this.current = {}
		this.inputEvent = false
		this.isActive = false
		this.menuContainer = menuContainer
		this.allowSpaces = allowSpaces
		this.replaceTextSuffix = replaceTextSuffix
		this.positionMenu = positionMenu
		this.hasTrailingSpace = false
		this.direction = direction

		if (!collection) {
			throw new Error('[Tribute] No collection specified.')
		}

		this.collection = collection.map((item) => {
			return {
				trigger: item.trigger || trigger,
				keepAsEnd: item.keepAsEnd || null,
				replaceEnd: item.replaceEnd === undefined ? true : item.replaceEnd,
				selectClass: item.selectClass || selectClass,
				containerClass: item.containerClass || containerClass,
				itemClass: item.itemClass || itemClass,
				selectTemplate: (item.selectTemplate || Tribute.defaultSelectTemplate).bind(this),
				menuItemTemplate: (item.menuItemTemplate || Tribute.defaultMenuItemTemplate).bind(this),
				// function called when menu is empty, disables hiding of menu.
				noMatchTemplate: ((t) => {
					if (typeof t === 'string') {
						if (t.trim() === '') return null
						return t
					}
					if (typeof t === 'function') {
						return t.bind(this)
					}

					return (
						noMatchTemplate ||
						function () {
							return '<li>No Match Found!</li>'
						}.bind(this)
					)
				})(noMatchTemplate),
				lookup: item.lookup || lookup,
				fillAttr: item.fillAttr || fillAttr,
				values: item.values,
				requireLeadingSpace: item.requireLeadingSpace,
				searchOpts: item.searchOpts || searchOpts,
				menuItemLimit: item.menuItemLimit || menuItemLimit,
				menuShowMinLength: item.menuShowMinLength || menuShowMinLength,
				label: item.label,
				allowNesting: item.allowNesting || allowNesting,
				tabSelectsStartOnly: item.tabSelectsStartOnly || tabSelectsStartOnly,
			}
		})

		this.range = new TributeRange(this)
		this.events = new TributeEvents(this)
		this.menuEvents = new TributeMenuEvents(this)
		this.search = new TributeSearch(this)

		/**
		 * @type {boolean | undefined}
		 */
		this.willHideMenu = undefined
	}

	/**
	 * @returns {boolean}
	 */
	get isActive() {
		return this._isActive
	}

	/**
	 * @param {boolean} val
	 */
	set isActive(val) {
		if (this._isActive != val) {
			this._isActive = val
			if (this.current.element) {
				let noMatchEvent = new CustomEvent(`tribute-active-${val}`)
				this.current.element.dispatchEvent(noMatchEvent)
			}
		}
	}

	/**
	 * @this {Tribute}
	 * @param {TributeSearchResults<any>} item
	 */
	static defaultSelectTemplate(item) {
		if (typeof item === 'undefined')
			return `${this.current.collection.trigger}${this.current.mentionText}`

		return this.current.collection.trigger + item.original[this.current.collection.fillAttr]
	}

	/**
	 * @this {Tribute}
	 * @param {TributeSearchResults<any>} matchItem
	 */
	static defaultMenuItemTemplate(matchItem) {
		return matchItem.string
	}

	static inputTypes() {
		return ['TEXTAREA', 'INPUT']
	}

	/**
	 * @returns {string[]}
	 */
	triggers() {
		return this.collection.map((config) => {
			return config.trigger
		})
	}

	/**
	 * @param {TributeElement} el
	 */
	attach(el) {
		if (!el) {
			throw new Error('[Tribute] Must pass in a DOM node or NodeList.')
		}

		// Check if it is a jQuery collection
		if (typeof $ !== 'undefined' && el instanceof $) {
			el = /** @type {JQuery} */ (el).get()
		}

		// Is el an Array/Array-like object?
		if (
			el.constructor === NodeList ||
			el.constructor === HTMLCollection ||
			el.constructor === Array
		) {
			let length = el.length
			for (var i = 0; i < length; ++i) {
				this._attach(el[i])
			}
		} else {
			this._attach(el)
		}
	}

	/**
	 * @param {Element} el
	 */
	_attach(el) {
		if (Object.hasOwn(el.dataset, 'tribute')) {
			console.warn('Tribute was already bound to ' + el.nodeName)
		}

		this.events.bind(el)
		el.dataset.tribute = 'true'
	}

	/**
	 * @param {string} containerClass
	 * @returns {HTMLElement}
	 */
	createMenu(containerClass) {
		let wrapper = document.createElement('div'),
			ul = document.createElement('ul')
		wrapper.className = containerClass

		if (this.direction === 'rtl') {
			wrapper.className += ' tribute-rtl'
		}

		wrapper.append(ul)

		if (this.menuContainer) {
			return this.menuContainer.appendChild(wrapper)
		}

		return document.body.appendChild(wrapper)
	}

	/**
	 * @param {Element} element
	 * @param {boolean} scrollTo
	 */
	showMenuFor(element, scrollTo) {
		const collection = /** @type {TributeCollection} */ (this.current.collection)
		const processValues = (values) => {
			// Tribute may not be active any more by the time the value callback returns
			if (!this.isActive) {
				return
			}

			let items = this.search.filter(this.current.mentionText, values, {
				// jwbth: Replaced "<span>" and "</span>" as default values with empty strings. Tags are
				// displayed as plain text currently anyway.
				pre: collection.searchOpts.pre || '',
				post: collection.searchOpts.post || '',
				skip: collection.searchOpts.skip,
				extract: (el) => {
					if (typeof collection.lookup === 'string') {
						return el[collection.lookup]
					} else if (typeof collection.lookup === 'function') {
						return collection.lookup(el, this.current.mentionText)
					} else {
						throw new TypeError('Invalid lookup attribute, lookup must be string or function.')
					}
				},
			})

			if (collection.menuItemLimit) {
				items = items.slice(0, collection.menuItemLimit)
			}

			this.current.filteredItems = items

			let ul = this.menu.querySelector('ul')

			this.range.positionMenuAtCaret(scrollTo)

			if (!items.length) {
				let noMatchEvent = new CustomEvent('tribute-no-match', {
					detail: this.menu,
				})
				this.current.element.dispatchEvent(noMatchEvent)
				if (
					(typeof collection.noMatchTemplate === 'function' && !collection.noMatchTemplate()) ||
					!collection.noMatchTemplate
				) {
					this.hideMenu()
				} else {
					typeof collection.noMatchTemplate === 'function'
						? (ul.innerHTML = collection.noMatchTemplate())
						: (ul.innerHTML = collection.noMatchTemplate)
				}

				return
			}

			ul.innerHTML = ''
			let fragment = document.createDocumentFragment()

			// jwbth: Added this part.
			if (collection.label) {
				let li = document.createElement('li')
				li.classList.add('tribute-label')
				li.textContent = collection.label
				fragment.append(li)
			}

			items.forEach((item, index) => {
				let li = document.createElement('li')
				li.dataset.index = index

				// jwbth: Replaced this part.
				li.classList.add('tribute-item')
				if (collection.itemClass) {
					li.classList.add(collection.itemClass)
				}

				li.addEventListener('mousemove', (event) => {
					let [, index] = this._findLiTarget(event.target)
					if (event.movementY !== 0) {
						this.events.setActiveLi(index)
					}
				})
				if (this.menuSelected === index) {
					li.classList.add(collection.selectClass)
				}
				// jwbth: Replaced innerHTML with textContent to prevent XSS injections.
				li.textContent = collection.menuItemTemplate(item)
				fragment.append(li)
			})
			ul.append(fragment)

			// jwbth: Added this line to make the menu redrawn when the bottom is off screen. TODO: Fix
			// this properly.
			this.range.positionMenuAtCaret(scrollTo)
		}

		// jwbth: Only proceed if the menu isn't already shown for the current element & mentionText.
		// This behavior has issues, see
		// https://github.com/jwbth/convenient-discussions/commit/14dc20cf1b23dff79c2592ff47431513890ab213,
		// so here we have even more workarounds. But otherwise `values` is called 3 times, Carl. That's
		// probably a problem of Tribute, but seems non-trivial to refactor it quickly.
		if (
			this.isActive &&
			this.current.element === element &&
			this.current.mentionText === this.snapshot.mentionText
		) {
			if (this.current.element.selectionStart !== this.snapshot.selectionStart) {
				processValues([])
			}
			return
		}
		this.snapshot = {
			mentionText: this.current.mentionText,
			selectionStart: this.current.element?.selectionStart,
		}

		// create the menu if it doesn't exist.
		if (!this.menu) {
			this.menu = this.createMenu(this.current.collection.containerClass)
			element.tributeMenu = this.menu
			this.menuEvents.bind(this.menu)
		}

		this.isActive = true
		this.menuSelected = 0
		this.lastCanceledTriggerChar = null
		this.lastCanceledTriggerPos = null

		if (!this.current.mentionText) {
			this.current.mentionText = ''
		}

		if (typeof collection.values === 'function') {
			collection.values(this.current.mentionText, processValues)
		} else {
			processValues(collection.values)
		}
	}

	/**
	 * @param {Element} el
	 * @returns {[Element, string] | []}
	 */
	_findLiTarget(el) {
		if (!el) return []
		const index = el.dataset.index
		return index ? [el, index] : this._findLiTarget(el.parentNode)
	}

	/**
	 * @param {Element} element
	 * @param {number} collectionIndex
	 */
	showMenuForCollection(element, collectionIndex) {
		if (element !== document.activeElement) {
			this.placeCaretAtEnd(element)
		}

		this.current.collection = this.collection[collectionIndex || 0]

		// jwbth: Added this to avert a JS error.
		this.current.trigger = this.current.collection.trigger

		this.current.externalTrigger = true
		this.current.element = element

		// jwbth: Added this.
		this.current.triggerPos = element.selectionStart

		if (!this.insertAtCaret(element, this.current.collection.trigger)) {
			this.showMenuFor(element)
		}
	}

	// TODO: make sure this works for inputs/textareas
	/**
	 * @param {Element} el
	 */
	placeCaretAtEnd(el) {
		el.focus()
		if (typeof window.getSelection != 'undefined' && typeof document.createRange != 'undefined') {
			var range = document.createRange()
			range.selectNodeContents(el)
			range.collapse(false)
			var sel = window.getSelection()
			sel.removeAllRanges()
			sel.addRange(range)
		} else if (typeof document.body.createTextRange != 'undefined') {
			var textRange = document.body.createTextRange()
			textRange.moveToElementText(el)
			textRange.collapse(false)
			textRange.select()
		}
	}

	/**
	 * @param {HTMLElement} element
	 * @param {string} text
	 * @returns {boolean}
	 */
	insertAtCaret(element, text) {
		var scrollPos = element.scrollTop
		var caretPos = element.selectionStart

		element.focus()

		// jwbth: Preserve the undo/redo functionality in browsers that support it.
		const hasInsertedViaCommand = document.execCommand('insertText', false, text)
		if (!hasInsertedViaCommand) {
			var front = element.value.substring(0, caretPos)
			var back = element.value.substring(element.selectionEnd, element.value.length)
			element.value = front + text + back
			caretPos += text.length
			element.selectionStart = caretPos
			element.selectionEnd = caretPos
		}
		element.scrollTop = scrollPos

		return hasInsertedViaCommand
	}

	/**
	 * Hide the autocomplete menu.
	 */
	hideMenu() {
		if (this.menu) {
			this.menu.style.cssText = 'display: none;'
			this.isActive = false
			this.menuSelected = 0
			this.current = {}
		}
	}

	/**
	 * @param {number} index
	 * @param {Event} originalEvent
	 */
	selectItemAtIndex(index, originalEvent) {
		index = Number.parseInt(index)
		if (typeof index !== 'number' || isNaN(index)) return
		let item = this.current.filteredItems[index]
		let data = this.current.collection.selectTemplate(item, originalEvent)
		if (data !== null) {
			this.replaceText(data, originalEvent, item)
		}
	}

	/**
	 * @param {any} data
	 * @param {Event} originalEvent
	 * @param {TributeSearchResults<any>} item
	 */
	replaceText(data, originalEvent, item) {
		this.range.replaceTriggerText(data, true, true, originalEvent, item)
	}

	/**
	 * @param {TributeCollection} collection
	 * @param {TributeSearchResults<any>[]} newValues
	 * @param {boolean} replace
	 */
	_append(collection, newValues, replace) {
		if (typeof collection.values === 'function') {
			throw new TypeError('Unable to append to values, as it is a function.')
		} else if (replace) {
			collection.values = newValues
		} else {
			collection.values = collection.values.concat(newValues)
		}
	}

	/**
	 * @param {string} collectionIndex
	 * @param {TributeSearchResults<any>[]} newValues
	 * @param {boolean} replace
	 */
	append(collectionIndex, newValues, replace) {
		let index = Number.parseInt(collectionIndex)
		if (typeof index !== 'number')
			throw new Error('please provide an index for the collection to update.')

		let collection = this.collection[index]

		this._append(collection, newValues, replace)
	}

	/**
	 * @param {TributeSearchResults<any>[]} newValues
	 * @param {boolean} replace
	 */
	appendCurrent(newValues, replace) {
		if (this.isActive) {
			this._append(this.current.collection, newValues, replace)
		} else {
			throw new Error('No active state. Please use append instead and pass an index.')
		}
	}

	/**
	 * @param {TributeElement} el
	 */
	detach(el) {
		if (!el) {
			throw new Error('[Tribute] Must pass in a DOM node or NodeList.')
		}

		// Check if it is a jQuery collection
		if (typeof $ !== 'undefined' && el instanceof $) {
			el = /** @type {JQuery} */ (el).get()
		}

		// Is el an Array/Array-like object?
		if (
			el.constructor === NodeList ||
			el.constructor === HTMLCollection ||
			el.constructor === Array
		) {
			let length = el.length
			for (var i = 0; i < length; ++i) {
				this._detach(el[i])
			}
		} else {
			this._detach(el)
		}
	}

	/**
	 * @param {Element} el
	 */
	_detach(el) {
		this.events.unbind(el)
		if (el.tributeMenu) {
			this.menuEvents.unbind(el.tributeMenu)
		}
		delete el.dataset.tribute
		this.isActive = false

		if (el.tributeMenu) {
			el.tributeMenu.remove()
		}
	}
	menuSelected = 0
}

export default Tribute
