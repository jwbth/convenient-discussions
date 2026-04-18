import { inputPropsAffectingCoords } from '../utils-window'

// A replacement for unicode property escapes
// (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions/Unicode_Property_Escapes)
// while they are not supported in major browsers. https://github.com/slevithan/xregexp can be used
// also.
const PUNCTUATION_REGEXP =
	/[\s!-#%-\u002A,-/:;\u003F@\u005B-\u005D_\u007B}\u00A1\u00A7\u00AB\u00B6\u00B7\u00BB\u00BF\u037E\u0387\u055A-\u055F\u0589\u058A\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0609\u060A\u060C\u060D\u061B\u061E\u061F\u066A-\u066D\u06D4\u0700-\u070D\u07F7-\u07F9\u0830-\u083E\u085E\u0964\u0965\u0970\u0AF0\u0DF4\u0E4F\u0E5A\u0E5B\u0F04-\u0F12\u0F14\u0F3A-\u0F3D\u0F85\u0FD0-\u0FD4\u0FD9\u0FDA\u104A-\u104F\u10FB\u1360-\u1368\u1400\u166D\u166E\u169B\u169C\u16EB-\u16ED\u1735\u1736\u17D4-\u17D6\u17D8-\u17DA\u1800-\u180A\u1944\u1945\u1A1E\u1A1F\u1AA0-\u1AA6\u1AA8-\u1AAD\u1B5A-\u1B60\u1BFC-\u1BFF\u1C3B-\u1C3F\u1C7E\u1C7F\u1CC0-\u1CC7\u1CD3\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205E\u207D\u207E\u208D\u208E\u2329\u232A\u2768-\u2775\u27C5\u27C6\u27E6-\u27EF\u2983-\u2998\u29D8-\u29DB\u29FC\u29FD\u2CF9-\u2CFC\u2CFE\u2CFF\u2D70\u2E00-\u2E2E\u2E30-\u2E3B\u3001-\u3003\u3008-\u3011\u3014-\u301F\u3030\u303D\u30A0\u30FB\uA4FE\uA4FF\uA60D-\uA60F\uA673\uA67E\uA6F2-\uA6F7\uA874-\uA877\uA8CE\uA8CF\uA8F8-\uA8FA\uA92E\uA92F\uA95F\uA9C1-\uA9CD\uA9DE\uA9DF\uAA5C-\uAA5F\uAADE\uAADF\uAAF0\uAAF1\uABEB\uFD3E\uFD3F\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE61\uFE63\uFE68\uFE6A\uFE6B\uFF01-\uFF03\uFF05-\uFF0A\uFF0C-\uFF0F\uFF1A\uFF1B\uFF1F\uFF20\uFF3B-\uFF3D\uFF3F\uFF5B\uFF5D\uFF5F-\uFF65]/

class TributeRange {
	/**
	 * @param {import('./Tribute').default} tribute
	 */
	constructor(tribute) {
		/**
		 * @type {import('./Tribute').default}
		 */
		this.tribute = tribute
	}

	/**
	 * @param {boolean} scrollTo
	 */
	positionMenuAtCaret(scrollTo) {
		let info = this.getTriggerInfo(
			false,
			this.tribute.hasTrailingSpace,
			true,
			this.tribute.allowSpaces,
		)

		if (typeof info === 'undefined') {
			this.tribute.menu.style.cssText = 'display: none'
		} else {
			if (!this.tribute.positionMenu) {
				this.tribute.menu.style.cssText = `display: block;`
				return
			}

			let positionStyle = this.getElementUnderlinePositionStyle(
				this.tribute.current.element,
				info.mentionPosition,
			)

			this.tribute.menu.style.cssText = positionStyle + ' position: absolute; display: block;'

			if (scrollTo) this.scrollIntoView()

			// jwbth: Removed setTimeout part entirely as it seems to have no effect after other
			// changes.
		}
	}

	get menuContainerIsBody() {
		return this.tribute.menuContainer === document.body || !this.tribute.menuContainer
	}

	/**
	 * @param {string | import('./Tribute').Insertion} data
	 * @param {boolean} requireLeadingSpace
	 * @param {boolean} hasTrailingSpace
	 * @param {KeyboardEvent | MouseEvent} originalEvent
	 * @param {any} item
	 */
	replaceTriggerText(data, requireLeadingSpace, hasTrailingSpace, originalEvent, item) {
		let info = this.getTriggerInfo(
			true,
			hasTrailingSpace,
			requireLeadingSpace,
			this.tribute.allowSpaces,
		)

		if (info !== undefined) {
			let context = this.tribute.current

			// jwbth: We use a `data` object instead of a string, to store the start/end/content
			// parts. The code processing these properties is added below.
			if (typeof data !== 'object') {
				data = { start: data }
			}
			// jwbth: When Tab is pressed and the collection opts into it, only insert data.start
			// (no content/end wrapping).
			const isTab = originalEvent.key === 'Tab' && context.collection.tabSelectsStartOnly
			data.end = isTab ? '' : data.end || ''
			data.content = isTab
				? ''
				: (!(data.omitContentCheck?.() && !originalEvent.shiftKey) && data.content) || ''
			if (!isTab) {
				if (originalEvent.altKey && data.altModify) {
					data.altModify()
				}
				let isCmdModifierPressed = navigator.platform.includes('Mac')
					? originalEvent.metaKey
					: originalEvent.ctrlKey
				if (isCmdModifierPressed && data.cmdModify) {
					data.cmdModify()
				}
			}

			let myField = /** @type {HTMLElement} */ (this.tribute.current.element)

			// jwbth: Fixed this line to make it work with `replaceTextSuffix`es of length other
			// than 1.
			let endPos = info.mentionPosition + info.mentionText.length + info.mentionTriggerChar.length
			let ending = myField.value.substring(endPos, myField.value.length)

			if (!isTab && (originalEvent.shiftKey || data.content) && data.shiftModify) {
				data.shiftModify()
			}

			let startPos = info.mentionPosition

			myField.selectionStart = startPos
			myField.selectionEnd = endPos

			// jwbth: Made alterations to make the keepAsEnd config value work.
			if (context.collection.keepAsEnd) {
				const [end] = ending.match(context.collection.keepAsEnd) || []
				if (end) {
					ending = ending.slice(end.length)
					myField.selectionEnd += end.length
					if (context.collection.replaceEnd) {
						data.end = end
					}
				}
			}

			let text = data.start + data.content + data.end
			let textSuffix =
				typeof this.tribute.replaceTextSuffix == 'string' ? this.tribute.replaceTextSuffix : ' '
			text += textSuffix

			// jwbth: Preserve the undo/redo functionality in browsers that support it.
			const $myField = $(
				myField.classList.contains('cm-content')
					? /** @type {HTMLElement} */ (myField.parentElement.parentElement.previousSibling)
					: myField,
			)
			$myField
				.focus()
				.textSelection(
					'setContents',
					$myField.textSelection('getContents').substring(0, startPos) + text + ending,
				)

			// jwbth: Start offset is calculated from the start position of the inserted text.
			// Absent value means the selection start position should match with the end position
			// (i.e., no text should be selected).
			if (!isTab && (originalEvent.shiftKey || (data.selectContent && !data.content))) {
				$myField.textSelection('setSelection', {
					start: startPos + data.start.length,
					end: startPos + text.length - data.end.length,
				})
			} else {
				$myField.textSelection('setSelection', { start: startPos + text.length })
			}

			let replaceEvent = new CustomEvent('tribute-replaced', {
				detail: {
					item: item,
					instance: context,
					context: info,
					event: originalEvent,
				},
			})

			context.element.dispatchEvent(new CustomEvent('input', { bubbles: true }))
			context.element.dispatchEvent(replaceEvent)
		}
	}

	getTextPrecedingCurrentSelection() {
		let text = ''

		let textComponent = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (
			this.tribute.current.element
		)
		if (textComponent) {
			let startPos = textComponent.selectionStart
			if (textComponent.value && startPos >= 0) {
				text = textComponent.value.substring(0, startPos)
			}
		}

		return text
	}

	/**
	 * @typedef {object} TriggerInfo
	 * @property {number} mentionPosition
	 * @property {string} mentionText
	 * @property {HTMLElement} mentionSelectedElement
	 * @property {number[]} mentionSelectedPath
	 * @property {number} mentionSelectedOffset
	 * @property {string} mentionTriggerChar
	 */

	/**
	 * @param {boolean} menuAlreadyActive
	 * @param {boolean} hasTrailingSpace
	 * @param {boolean} requireLeadingSpace
	 * @param {boolean} allowSpaces
	 * @returns {TriggerInfo | undefined}
	 */
	getTriggerInfo(menuAlreadyActive, hasTrailingSpace, requireLeadingSpace, allowSpaces) {
		let selected = this.tribute.current.element

		let effectiveRange = this.getTextPrecedingCurrentSelection()

		if (effectiveRange !== undefined && effectiveRange !== null) {
			let mostRecentTriggerCharPos = -1
			let mostRecentTriggerCharLength = 0
			let triggerChar

			this.tribute.collection.forEach((config) => {
				let c = config.trigger
				let idx = config.requireLeadingSpace
					? this.lastIndexWithLeadingSpace(effectiveRange, c)
					: effectiveRange.lastIndexOf(c)

				if (
					idx > mostRecentTriggerCharPos ||
					// jwbth: Added this lines, as well as the mostRecentTriggerCharLength
					// variable and operations with it, to have triggers like "[[#" be used instead
					// of triggers like "[[" if both are present.
					(idx > -1 && idx === mostRecentTriggerCharPos && c.length > mostRecentTriggerCharLength)
				) {
					mostRecentTriggerCharPos = idx
					mostRecentTriggerCharLength = c.length
					triggerChar = c
					requireLeadingSpace = config.requireLeadingSpace
				}
			})

			let currentTriggerSnippet
			let originalCurrentTriggerSnippet
			let leadingSpace
			let regex
			let inputOk =
				mostRecentTriggerCharPos >= 0 &&
				(mostRecentTriggerCharPos === 0 ||
					!requireLeadingSpace ||
					// jwbth: Use punctuation instead of just whitespace characters.
					PUNCTUATION_REGEXP.test(effectiveRange[mostRecentTriggerCharPos - 1]))
			if (inputOk) {
				currentTriggerSnippet = effectiveRange.substring(
					mostRecentTriggerCharPos + triggerChar.length,
					effectiveRange.length,
				)

				// jwbth: Added this line and the declaration above.
				originalCurrentTriggerSnippet = currentTriggerSnippet

				triggerChar = effectiveRange.substring(
					mostRecentTriggerCharPos,
					mostRecentTriggerCharPos + triggerChar.length,
				)
				let firstSnippetChar = currentTriggerSnippet.substring(0, 1)
				leadingSpace =
					currentTriggerSnippet.length > 0 &&
					(firstSnippetChar === ' ' || firstSnippetChar === '\u00A0')
				if (hasTrailingSpace) {
					currentTriggerSnippet = currentTriggerSnippet.trim()
				}

				regex = allowSpaces ? /[^\S ]/g : /\s/g

				this.tribute.hasTrailingSpace = regex.test(currentTriggerSnippet)
			}

			/*
				jwbth: Added this block, breaking the block starting with `inputOk` check into two
				parts, as we need to have the menu removed when:
				- there is no valid trigger before the caret position,
				- typing a space after "@" or "##",
				- there are newlines before the caret position and the trigger position,
				- there is a selection.
			*/
			if (
				mostRecentTriggerCharPos === -1 ||
				(originalCurrentTriggerSnippet && !originalCurrentTriggerSnippet[0].trim()) ||
				originalCurrentTriggerSnippet.includes('\n') ||
				selected.selectionStart !== selected.selectionEnd ||
				// When pressed backspace in "[[#" and faced the trigger "[["
				(this.tribute.current.trigger && triggerChar !== this.tribute.current.trigger)
			) {
				this.tribute.willHideMenu = true
				return
			} else {
				this.tribute.willHideMenu = false
			}

			if (inputOk && !leadingSpace && (menuAlreadyActive || !regex.test(currentTriggerSnippet))) {
				return {
					mentionPosition: mostRecentTriggerCharPos,
					mentionText: currentTriggerSnippet,
					mentionSelectedElement: selected,
					mentionSelectedPath: undefined,
					mentionSelectedOffset: undefined,
					mentionTriggerChar: triggerChar,
				}
			}
		}
	}

	/**
	 * @param {string} str
	 * @param {string} trigger
	 * @returns {number}
	 */
	lastIndexWithLeadingSpace(str, trigger) {
		let reversedStr = str.split('').reverse().join('')
		let index = -1

		for (let cidx = 0, len = str.length; cidx < len; cidx++) {
			let firstChar = cidx === str.length - 1
			let leadingSpace = PUNCTUATION_REGEXP.test(reversedStr[cidx + 1])

			let match = true
			for (let triggerIdx = trigger.length - 1; triggerIdx >= 0; triggerIdx--) {
				if (trigger[triggerIdx] !== reversedStr[cidx - triggerIdx]) {
					match = false
					break
				}
			}

			if (match && (firstChar || leadingSpace)) {
				index = str.length - 1 - cidx
				break
			}
		}

		return index
	}

	/**
	 * @param {Coordinates} coordinates
	 * @param {{ width: number | null, height: number | null }} menuDimensions
	 * @returns {{ top: boolean, right: boolean, bottom: boolean, left: boolean }}
	 */
	isMenuOffScreen(coordinates, menuDimensions) {
		// jwbth: Replaced window.innerWidth and window.innerHeight with doc.clientWidth and
		// doc.clientHeight - the first ones include scrollbars. Removed some tweaks for
		// compatibility with old browsers.

		let doc = document.documentElement
		let windowLeft = window.scrollX - (doc.clientLeft || 0)
		let windowTop = window.scrollY - (doc.clientTop || 0)

		let menuTop =
			typeof coordinates.top === 'number'
				? coordinates.top
				: windowTop + doc.clientHeight - coordinates.bottom - menuDimensions.height
		let menuRight =
			typeof coordinates.right === 'number'
				? coordinates.right
				: coordinates.left + menuDimensions.width
		let menuBottom = coordinates.top + menuDimensions.height
		let menuLeft =
			typeof coordinates.left === 'number'
				? coordinates.left
				: windowLeft + doc.clientWidth - coordinates.right - menuDimensions.width

		return {
			top: menuTop < Math.floor(windowTop),
			right: menuRight > Math.ceil(windowLeft + doc.clientWidth),
			bottom: menuBottom > Math.ceil(windowTop + doc.clientHeight) - 3,
			left: menuLeft < Math.floor(windowLeft),
		}
	}

	getMenuDimensions() {
		// Width of the menu depends of its contents and position
		// We must check what its width would be without any obstruction
		// This way, we can achieve good positioning for flipping the menu
		let dimensions = /** @type {{ width: number, height: number }} */ ({})

		// jwbth: Fixed "visibility; hidden;".
		this.tribute.menu.style.cssText =
			`top: 0px;` +
			`left: 0px;` +
			`right: auto;` +
			`position: fixed;` +
			`display: block;` +
			`visibility: hidden;`
		dimensions.width = this.tribute.menu.offsetWidth
		dimensions.height = this.tribute.menu.offsetHeight

		this.tribute.menu.style.cssText = `display: none;`

		return dimensions
	}

	/**
	 * @typedef {{
	 * 	 top: number;
	 * 	 left: number | undefined | 'auto';
	 * 	 right: number | undefined | 'auto';
	 * }} Coordinates
	 */

	// jwbth: Added RTL support.
	/**
	 * @param {HTMLInputElement | HTMLTextAreaElement} element
	 * @param {number} position
	 * @returns {string}
	 */
	getElementUnderlinePositionStyle(element, position) {
		let doc = document.documentElement

		// jwbth: Replaced window.innerWidth with document.documentElement.clientWidth here and in
		// other places to have the scrollbars counted.
		let windowWidth = doc.clientWidth
		let windowHeight = doc.clientHeight

		let windowLeft = (window.scrollX || doc.scrollLeft) - (doc.clientLeft || 0)
		let windowTop = (window.scrollY || doc.scrollTop) - (doc.clientTop || 0)

		let elementComputedStyle = getComputedStyle(element)

		let top = 0
		let left = 0
		let right = 0

		if (element.cdCodeMirrorUpdate) {
			const update = element.cdCodeMirrorUpdate
			const rect = update.view.coordsAtPos(position + this.tribute.current.trigger.length)
			if (rect) {
				const doc = document.documentElement
				const windowLeft = (window.scrollX || doc.scrollLeft) - (doc.clientLeft || 0)
				const windowTop = (window.scrollY || doc.scrollTop) - (doc.clientTop || 0)
				top = windowTop + rect.top
				left = windowLeft + rect.left
				right = windowLeft + rect.right
			}
		} else {
			// jwbth: Reuse the global object property.
			let properties = inputPropsAffectingCoords

			let mirrorDiv = document.createElement('div')
			mirrorDiv.className = 'tribute-mirrorDiv'
			document.body.append(mirrorDiv)

			let style = mirrorDiv.style

			style.whiteSpace = 'pre-wrap'
			if (element.nodeName !== 'INPUT') {
				style.overflowWrap = 'break-word'
			}

			// position off-screen
			style.position = 'absolute'
			style.visibility = 'hidden'

			// transfer the element's properties to the div
			properties.forEach((prop) => {
				// @ts-ignore
				style[prop] = elementComputedStyle[prop]
			})

			// jwbth: replaced parseInt with parseFloat: parseInt can result in a wrongly positioned
			// menu due to a line break (have seen an example when edited [[:en:Wikipedia:Village pump
			// (proposals)#Allow fair use non-freely licensed photos of politicians]]). Removed
			// isFirefox condition as it was calculated incorrectly and was always `true`.
			style.width = `${Number.parseFloat(elementComputedStyle.width)}px`
			if (element.scrollHeight > Number.parseFloat(elementComputedStyle.height))
				style.overflowY = 'scroll'

			mirrorDiv.textContent = element.value.substring(0, position)

			// jwbth: Removed replacing `\s` with `' '` as its function is unclear and negative effects
			// are likely (say, when replacing the tab character with the space that has different
			// width).

			let triggerSpan = document.createElement('span')
			triggerSpan.textContent = this.tribute.current.trigger

			let endingSpan = document.createElement('span')
			endingSpan.append(
				triggerSpan,
				element.value.substring(position + this.tribute.current.trigger.length) || '',
			)
			mirrorDiv.append(endingSpan)

			let rect = element.getBoundingClientRect()

			if (this.menuContainerIsBody) {
				top = rect.top
				left = rect.left
				right = rect.right
			}

			top =
				windowTop +
				top +
				endingSpan.offsetTop +
				Number.parseInt(elementComputedStyle.borderTopWidth) -
				element.scrollTop

			if (this.tribute.direction === 'rtl') {
				const offsetRight =
					doc.dir === 'rtl' ? windowWidth : mirrorDiv.getBoundingClientRect().right
				right =
					windowWidth -
					right +
					(offsetRight - endingSpan.getBoundingClientRect().right) +
					triggerSpan.offsetWidth
			} else {
				left = windowLeft + left + endingSpan.offsetLeft + triggerSpan.offsetWidth + 1
			}

			mirrorDiv.remove()
		}

		let coordinates = /** @type {Coordinates} */ ({
			top: top + Number.parseInt(elementComputedStyle.fontSize),
			left: this.tribute.direction === 'rtl' ? 'auto' : left,
			right: this.tribute.direction === 'rtl' ? right : 'auto',
		})

		let menuIsOffScreen = this.isMenuOffScreen(coordinates, this.getMenuDimensions())

		if (this.tribute.direction === 'rtl') {
			if (menuIsOffScreen.left) {
				coordinates.left = 0
				coordinates.right = 'auto'
			}
		} else {
			if (menuIsOffScreen.right) {
				// jwbth: Simplified positioning by putting `right` at 0.
				coordinates.right = 0
				coordinates.left = 'auto'
			}
		}

		let additionalStyles = ''
		if (menuIsOffScreen.bottom) {
			// jwbth: Removed the block setting coordinates.bottom as a reference point as well as
			// the parentHeight variable, added the block setting the height for the menu.
			const height =
				windowTop +
				windowHeight -
				coordinates.top -
				Number.parseFloat(getComputedStyle(element).paddingTop) -
				3
			additionalStyles = `height: ${height}px; overflow-y: scroll;`
		}

		// jwbth: Removed the second check if the menu is off screen as it seems redundant after we
		// stopped flipping the menu.

		return (
			`top: ${coordinates.top}${typeof coordinates.top === 'number' ? 'px' : ''}; ` +
			`left:${coordinates.left}${typeof coordinates.left === 'number' ? 'px' : ''}; ` +
			`right: ${coordinates.right}${typeof coordinates.right === 'number' ? 'px' : ''}; ` +
			additionalStyles
		)
	}

	scrollIntoView() {
		let reasonableBuffer = 20,
			clientRect
		let maxScrollDisplacement = 100
		let element = this.tribute.menu

		if (typeof element === 'undefined') return

		while (clientRect === undefined || clientRect.height === 0) {
			clientRect = element.getBoundingClientRect()

			if (clientRect.height === 0) {
				element = element.childNodes[0]
				if (element === undefined || !element.getBoundingClientRect) {
					return
				}
			}
		}

		let elemTop = clientRect.top
		let elemBottom = elemTop + clientRect.height

		if (elemTop < 0) {
			window.scrollTo(0, window.pageYOffset + clientRect.top - reasonableBuffer)
		} else if (elemBottom > window.innerHeight) {
			let maxY = window.pageYOffset + clientRect.top - reasonableBuffer

			if (maxY - window.pageYOffset > maxScrollDisplacement) {
				maxY = window.pageYOffset + maxScrollDisplacement
			}

			let targetY = window.pageYOffset - (window.innerHeight - elemBottom)

			if (targetY > maxY) {
				targetY = maxY
			}

			window.scrollTo(0, targetY)
		}
	}
}

export default TributeRange
