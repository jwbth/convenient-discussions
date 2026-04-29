// @ts-nocheck
class TributeEvents {
	/**
	 * @param {import('./Tribute').default} tribute
	 */
	constructor(tribute) {
		/** @type {import('./Tribute').default} */
		this.tribute = tribute
	}

	/*
		jwbth: Removed:
		- "space" - it causes the menu not to change or hide when a space was typed;
		- "delete" - it causes the menu not to appear when backspace is pressed and a character
			preventing the menu to appear is removed (for example, ">" in "<small>").
	 */
	static keys() {
		return [
			{
				key: 9,
				value: 'TAB',
			},
			{
				key: 13,
				value: 'ENTER',
			},
			{
				key: 27,
				value: 'ESCAPE',
			},
			{
				key: 38,
				value: 'UP',
			},
			{
				key: 40,
				value: 'DOWN',
			},
		]
	}

	/**
	 * @param {HTMLInputElement | HTMLTextAreaElement} element
	 */
	bind(element) {
		// const selectionChangeHandler = (event) => this.selectionchange(event, element)
		// this.selectionHandlerMap = new WeakMap()
		// this.selectionHandlerMap.set(element, selectionChangeHandler)

		// Use capture to get ahead of CodeMirror's keydown handler. Note that there may be a duplicate
		// event dispatched by the textarea in CodeMirror#domEventHandlersExtension.
		element.addEventListener('keydown', this.keydown, { capture: true })
		element.addEventListener('keyup', this.keyup)
		// document.addEventListener('selectionchange', selectionChangeHandler)
		element.addEventListener('input', this.input)
	}

	/**
	 * @param {HTMLInputElement | HTMLTextAreaElement} element
	 */
	unbind(element) {
		element.removeEventListener('keydown', this.keydown, { capture: true })
		element.removeEventListener('keyup', this.keyup)
		// document.removeEventListener('selectionchange', this.selectionHandlerMap.get(element))
		element.removeEventListener('input', this.input)
		// this.selectionHandlerMap.delete(element)
	}

	/**
	 * @param {KeyboardEvent} event
	 */
	keydown = (event) => {
		const element = event.currentTarget

		// jwbth: Removed shouldDeactivate() fixing the disappearing of the menu when a part of a
		// mention is typed and the user presses any command key.

		this.commandEvent = false

		// Ctrl+Space forces the autocomplete menu to show when at a trigger position, even after
		// the menu was dismissed with Escape or the user navigated back to a trigger.
		if (event.ctrlKey && event.key === ' ') {
			event.preventDefault()
			this.tribute.lastCanceledTriggerPos = null
			this.tribute.lastCanceledTriggerChar = null
			this.inputEvent = true
			this.keyup(event, element)

			return
		}

		TributeEvents.keys().forEach((o) => {
			if (o.key === event.keyCode) {
				this.commandEvent = true
				this.callbacks()[o.value.toLowerCase()](event, element)
			}
		})
	}

	/**
	 * @param {Event} event
	 */
	input = (event) => {
		this.inputEvent = true

		this.keyup(event)
	}

	// /**
	//  * @param {Event} event
	//  * @param {HTMLInputElement | HTMLTextAreaElement} element
	//  */
	// selectionchange = (event, element) => {
	// 	if (document.activeElement === element) {
	// 		this.keyup(event, element)
	// 	}
	// }

	/**
	 * @param {MouseEvent} event
	 */
	click = (event) => {
		// jwbth: Ignore non-left button clicks.
		if (event.which !== 1) return

		let tribute = this.tribute
		if (tribute.menu && tribute.menu.contains(event.target)) {
			let li = event.target
			event.preventDefault()
			event.stopPropagation()
			while (li.nodeName.toLowerCase() !== 'li') {
				li = li.parentNode
				if (!li || li === tribute.menu) {
					// jwbth: Replaced the error throw with return, as there is nothing wrong when a user
					// clicks the scroll bar.
					return
				}
			}

			// jwbth: Added this.
			if (li.classList.contains('tribute-label')) return

			tribute.selectItemAtIndex(li.getAttribute('data-index'), event)
			tribute.hideMenu()

			// TODO: should fire with externalTrigger and target is outside of menu
		}
	}

	/**
	 * @param {MouseEvent} event
	 */
	mousedown = (event) => {
		// jwbth: Ignore non-left button clicks.
		if (event.which !== 1) return

		let tribute = this.tribute
		if (tribute.menu && tribute.menu.contains(event.target)) return

		if (
			tribute.current.element &&
			!tribute.current.externalTrigger //&&
			//!tribute.current.element.contains(event.target)
		) {
			tribute.current.externalTrigger = false
			setTimeout(() => tribute.hideMenu())
		}
	}

	/**
	 * @param {Event} event
	 * @param {HTMLInputElement | HTMLTextAreaElement} element
	 */
	keyup = (event, element = event.currentTarget) => {
		// jwbth: Added this and replaces the usages below.
		const tribute = this.tribute

		// jwbth: Added this to avoid appearing-disappearing of the menu when moving the caret.
		if (!this.inputEvent && !tribute.isActive) return

		if (this.inputEvent) {
			this.inputEvent = false
		}
		this.updateSelection(element)

		// Esc
		if (event.keyCode === 27) return

		// jwbth: Added this.
		if (
			tribute.lastCanceledTriggerChar &&
			tribute.current.triggerPos === tribute.lastCanceledTriggerPos &&
			tribute.current.triggerChar === tribute.lastCanceledTriggerChar
		) {
			return
		}
		tribute.lastCanceledTriggerPos = null
		tribute.lastCanceledTriggerChar = null

		if (!tribute.allowSpaces && tribute.hasTrailingSpace) {
			tribute.hasTrailingSpace = false
			this.commandEvent = true
			return
		}

		// jwbth: Added this block (search for willHideMenu for the explanation).
		if (tribute.willHideMenu || tribute.current.mentionText === undefined) {
			tribute.isActive = false
			tribute.hideMenu()
			tribute.willHideMenu = false
			return
		}

		if (!tribute.isActive) {
			// jwbth: Removed the block and made `trigger` be filled from tribute.current.triggerChar to
			// account for triggers with the same first character.
			let trigger = tribute.current.triggerChar

			if (typeof trigger !== 'undefined') {
				this.callbacks().triggerChar(event, element, trigger)
			}
		}

		if (tribute.current.mentionText.length < tribute.current.collection.menuShowMinLength) return

		if (
			/*
				jwbth: "=== false" is replaced with "!== true" to fix the issue with the autocomplete menu
				not appearing. This issue appears because of the check
				"triggerChar !== this.tribute.current.trigger" I added to TributeRange.js to fix another
				issue.
					Steps to reproduce in Convenient Discussions: open a reply form, paste a wikilink using
				the context menu, press "@".
					Expected: An autocomplete menu appears.
					Actual: Does not.
					This is because "this.commandEvent = false" is executed only on keydown event that
				lacks when pasting from the context menu.
			 */
			(tribute.current.trigger && this.commandEvent !== true) ||
			(tribute.isActive && event.keyCode === 8)
		) {
			tribute.showMenuFor(element, true)
		}
	}

	// jwbth: Removed shouldDeactivate, getKeyCode as it is redundant.

	updateSelection(el) {
		this.tribute.current.element = el
		let info = this.tribute.range.getTriggerInfo(
			false,
			this.tribute.hasTrailingSpace,
			true,
			this.tribute.allowSpaces,
		)

		if (info) {
			this.tribute.current.selectedPath = info.mentionSelectedPath
			this.tribute.current.mentionText = info.mentionText
			this.tribute.current.selectedOffset = info.mentionSelectedOffset

			// jwbth: Added this line to use this property in keyup().
			this.tribute.current.triggerChar = info.mentionTriggerChar

			const current = this.tribute.current
			const pre = current.element.value.slice(0, current.element.selectionStart)
			current.triggerPos = pre.lastIndexOf(current.triggerChar)
		} else {
			// jwbth: Added this block.
			const current = this.tribute.current
			delete current.selectedPath
			delete current.mentionText
			delete current.selectedOffset
			delete current.triggerChar
			delete current.triggerPos
		}
	}

	callbacks() {
		// jwbth: Removed `delete` and `space` keys from here, see keys().
		return {
			triggerChar: (_, el, trigger) => {
				let tribute = this.tribute
				tribute.current.trigger = trigger

				let collectionItem = tribute.collection.find((item) => {
					return item.trigger === trigger
				})

				tribute.current.collection = collectionItem

				if (
					tribute.current.mentionText.length >= tribute.current.collection.menuShowMinLength &&
					tribute.inputEvent
				) {
					tribute.showMenuFor(el, true)
				}
			},
			enter: (e) => {
				// choose selection
				if (this.tribute.isActive && this.tribute.current.filteredItems) {
					e.preventDefault()
					e.stopPropagation()

					// jwbth: Removed setTimeout, as for that period filteredItems could reset.
					this.tribute.selectItemAtIndex(this.tribute.menuSelected, e)
					this.tribute.hideMenu()
				}
			},
			escape: (e) => {
				if (this.tribute.isActive) {
					e.preventDefault()
					e.stopPropagation()

					// jwbth: Added this block.
					this.tribute.lastCanceledTriggerPos = this.tribute.current.triggerPos
					this.tribute.lastCanceledTriggerChar = this.tribute.current.triggerChar

					this.tribute.isActive = false
					this.tribute.hideMenu()
				}
			},
			tab: (e, el) => {
				// choose first match
				if (!e.shiftKey) {
					this.callbacks().enter(e, el)
				}
			},
			up: (e) => {
				// navigate up ul
				if (this.tribute.isActive && this.tribute.current.filteredItems) {
					e.preventDefault()
					e.stopPropagation()
					let count = this.tribute.current.filteredItems.length,
						selected = this.tribute.menuSelected

					if (count > selected && selected > 0) {
						this.tribute.menuSelected--
						this.setActiveLi()
					} else if (selected === 0) {
						this.tribute.menuSelected = count - 1
						this.setActiveLi()
						this.tribute.menu.scrollTop = this.tribute.menu.scrollHeight
					}
				}
			},
			down: (e) => {
				// navigate down ul
				if (this.tribute.isActive && this.tribute.current.filteredItems) {
					e.preventDefault()
					e.stopPropagation()
					let count = this.tribute.current.filteredItems.length - 1,
						selected = this.tribute.menuSelected

					if (count > selected) {
						this.tribute.menuSelected++
						this.setActiveLi()
					} else if (count === selected) {
						this.tribute.menuSelected = 0
						this.setActiveLi()
						this.tribute.menu.scrollTop = 0
					}
				}
			},
		}
	}

	setActiveLi(index) {
		// jwbth: Replaced this part.
		let lis = this.tribute.menu.getElementsByClassName('tribute-item'),
			length = lis.length >>> 0

		if (index) this.tribute.menuSelected = parseInt(index)

		for (let i = 0; i < length; i++) {
			let li = lis[i]
			if (i === this.tribute.menuSelected) {
				li.classList.add(this.tribute.current.collection.selectClass)

				let liClientRect = li.getBoundingClientRect()
				let menuClientRect = this.tribute.menu.getBoundingClientRect()

				if (liClientRect.bottom > menuClientRect.bottom) {
					let scrollDistance = liClientRect.bottom - menuClientRect.bottom
					this.tribute.menu.scrollTop += scrollDistance
				} else if (liClientRect.top < menuClientRect.top) {
					let scrollDistance = menuClientRect.top - liClientRect.top
					this.tribute.menu.scrollTop -= scrollDistance
				}
			} else {
				li.classList.remove(this.tribute.current.collection.selectClass)
			}
		}
	}

	getFullHeight(elem, includeMargin) {
		let height = elem.getBoundingClientRect().height

		if (includeMargin) {
			let style = elem.currentStyle || window.getComputedStyle(elem)
			return height + parseFloat(style.marginTop) + parseFloat(style.marginBottom)
		}

		return height
	}
}

export default TributeEvents
