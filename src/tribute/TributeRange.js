// A replacement for unicode property escapes
// (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions/Unicode_Property_Escapes)
// while they are not supported in major browsers. https://github.com/slevithan/xregexp can be used
// also.
const PUNCTUATION_REGEXP = /[\s!-#%-\x2a,-/:;\x3f@\x5b-\x5d_\x7b}\u00a1\u00a7\u00ab\u00b6\u00b7\u00bb\u00bf\u037e\u0387\u055a-\u055f\u0589\u058a\u05be\u05c0\u05c3\u05c6\u05f3\u05f4\u0609\u060a\u060c\u060d\u061b\u061e\u061f\u066a-\u066d\u06d4\u0700-\u070d\u07f7-\u07f9\u0830-\u083e\u085e\u0964\u0965\u0970\u0af0\u0df4\u0e4f\u0e5a\u0e5b\u0f04-\u0f12\u0f14\u0f3a-\u0f3d\u0f85\u0fd0-\u0fd4\u0fd9\u0fda\u104a-\u104f\u10fb\u1360-\u1368\u1400\u166d\u166e\u169b\u169c\u16eb-\u16ed\u1735\u1736\u17d4-\u17d6\u17d8-\u17da\u1800-\u180a\u1944\u1945\u1a1e\u1a1f\u1aa0-\u1aa6\u1aa8-\u1aad\u1b5a-\u1b60\u1bfc-\u1bff\u1c3b-\u1c3f\u1c7e\u1c7f\u1cc0-\u1cc7\u1cd3\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205e\u207d\u207e\u208d\u208e\u2329\u232a\u2768-\u2775\u27c5\u27c6\u27e6-\u27ef\u2983-\u2998\u29d8-\u29db\u29fc\u29fd\u2cf9-\u2cfc\u2cfe\u2cff\u2d70\u2e00-\u2e2e\u2e30-\u2e3b\u3001-\u3003\u3008-\u3011\u3014-\u301f\u3030\u303d\u30a0\u30fb\ua4fe\ua4ff\ua60d-\ua60f\ua673\ua67e\ua6f2-\ua6f7\ua874-\ua877\ua8ce\ua8cf\ua8f8-\ua8fa\ua92e\ua92f\ua95f\ua9c1-\ua9cd\ua9de\ua9df\uaa5c-\uaa5f\uaade\uaadf\uaaf0\uaaf1\uabeb\ufd3e\ufd3f\ufe10-\ufe19\ufe30-\ufe52\ufe54-\ufe61\ufe63\ufe68\ufe6a\ufe6b\uff01-\uff03\uff05-\uff0a\uff0c-\uff0f\uff1a\uff1b\uff1f\uff20\uff3b-\uff3d\uff3f\uff5b\uff5d\uff5f-\uff65]/;

class TributeRange {
    constructor(tribute) {
        this.tribute = tribute
        this.tribute.range = this
    }

    positionMenuAtCaret(scrollTo) {
        let coordinates

        let info = this.getTriggerInfo(false, this.tribute.hasTrailingSpace, true, this.tribute.allowSpaces)

        if (typeof info !== 'undefined') {

            if(!this.tribute.positionMenu){
                this.tribute.menu.style.cssText = `display: block;`
                return
            }

            coordinates = this.getTextAreaOrInputUnderlinePosition(this.tribute.current.element,
                info.mentionPosition)

            this.tribute.menu.style.cssText = (
                `top: ${coordinates.top}${typeof coordinates.top === 'number' ? 'px' : ''}; ` +
                `left:${coordinates.left}${typeof coordinates.left === 'number' ? 'px' : ''}; ` +
                `right: ${coordinates.right}${typeof coordinates.right === 'number' ? 'px' : ''}; ` +
                `bottom: ${coordinates.bottom}${typeof coordinates.bottom === 'number' ? 'px' : ''}; ` +
                `position: absolute; ` +
                `display: block;`
            )

            // jwbth: Added this block.
            if (coordinates.additionalStyles) {
                this.tribute.menu.style.cssText += ' ' + coordinates.additionalStyles
            }

            if (scrollTo) this.scrollIntoView()

            // jwbth: Removed `setTimeout` part entirely as it seems to have no effect after other
            // changes.
        } else {
            this.tribute.menu.style.cssText = 'display: none'
        }
    }

    get menuContainerIsBody() {
        return this.tribute.menuContainer === document.body || !this.tribute.menuContainer
    }


    selectElement(targetElement, path, offset) {
        let range
        let elem = targetElement

        if (path) {
            for (var i = 0; i < path.length; i++) {
                elem = elem.childNodes[path[i]]
                if (elem === undefined) {
                    return
                }
                while (elem.length < offset) {
                    offset -= elem.length
                    elem = elem.nextSibling
                }
                if (elem.childNodes.length === 0 && !elem.length) {
                    elem = elem.previousSibling
                }
            }
        }
        let sel = window.getSelection()

        range = document.createRange()
        range.setStart(elem, offset)
        range.setEnd(elem, offset)
        range.collapse(true)

        try {
            sel.removeAllRanges()
        } catch (error) {
            console.warn(error)
        }

        sel.addRange(range)
        targetElement.focus()
    }

    replaceTriggerText(data, requireLeadingSpace, hasTrailingSpace, originalEvent, item) {
        let info = this.getTriggerInfo(true, hasTrailingSpace, requireLeadingSpace, this.tribute.allowSpaces)

        if (info !== undefined) {
            let context = this.tribute.current
            let replaceEvent = new CustomEvent('tribute-replaced', {
                detail: {
                    item: item,
                    instance: context,
                    context: info,
                    event: originalEvent,
                }
            })

            // jwbth: We use a `data` object instead of a string, to store the start/end/content
            // parts. The code processing these properties is added below.
            if (typeof data !== 'object') {
                data = { start: data }
            }
            data.end = data.end || ''
            let isCmdModifierPressed = navigator.platform.includes('Mac') ?
                originalEvent.metaKey :
                originalEvent.ctrlKey
            data.content = (
                (
                    !(
                        data.skipContentCheck?.(data) &&
                        !(originalEvent.shiftKey || originalEvent.altKey)
                    ) &&
                    data.content
                ) ||
                ''
            )
            if (isCmdModifierPressed && data.cmdModify) {
                data.cmdModify()
            }

            let myField = this.tribute.current.element

            // jwbth: Fixed this line to make it work with `replaceTextSuffix`es of length other
            // than 1.
            let endPos = info.mentionPosition + info.mentionText.length +
                info.mentionTriggerChar.length
            let ending = myField.value.substring(endPos, myField.value.length)

            if ((originalEvent.shiftKey || originalEvent.altKey) && data.shiftModify) {
                data.shiftModify()
            }

            if (originalEvent.altKey) {
                data.content = ending
                endPos += ending.length
                ending = ''
            }

            let startPos = info.mentionPosition

            myField.selectionStart = startPos
            myField.selectionEnd = endPos

            // jwbth: Made alterations to make the `keepAsEnd` config value work.
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
            let textSuffix = typeof this.tribute.replaceTextSuffix == 'string'
                ? this.tribute.replaceTextSuffix
                : ' '
            text += textSuffix

            // jwbth: Preserve the undo/redo functionality in browsers that support it.
            myField.focus()
            if (!document.execCommand('insertText', false, text)) {
                myField.value = myField.value.substring(0, startPos) + text + ending
            }

            // jwbth: Start offset is calculated from the start position of the inserted text.
            // Absent value means the selection start position should match with the end position
            // (i.e., no text should be selected).
            if (originalEvent.shiftKey || (data.typeContent && !data.content)) {
                myField.selectionEnd = startPos + text.length - data.end.length
                myField.selectionStart = startPos + data.start.length
            } else {
                myField.selectionEnd = startPos + text.length
                myField.selectionStart = myField.selectionEnd
            }

            context.element.dispatchEvent(new CustomEvent('input', { bubbles: true }))
            context.element.dispatchEvent(replaceEvent)
        }
    }

    getNodePositionInParent(element) {
        if (element.parentNode === null) {
            return 0
        }

        for (var i = 0; i < element.parentNode.childNodes.length; i++) {
            let node = element.parentNode.childNodes[i]

            if (node === element) {
                return i
            }
        }
    }

    getTextPrecedingCurrentSelection() {
        let text = ''

        let textComponent = this.tribute.current.element
        if (textComponent) {
            let startPos = textComponent.selectionStart
            if (textComponent.value && startPos >= 0) {
                text = textComponent.value.substring(0, startPos)
            }
        }

        return text
    }

    getTriggerInfo(menuAlreadyActive, hasTrailingSpace, requireLeadingSpace, allowSpaces) {
        let selected, path, offset

        selected = this.tribute.current.element

        let effectiveRange = this.getTextPrecedingCurrentSelection()

        if (effectiveRange !== undefined && effectiveRange !== null) {
            let mostRecentTriggerCharPos = -1
            let mostRecentTriggerCharLength = 0
            let triggerChar

            this.tribute.collection.forEach(config => {
                let c = config.trigger
                let idx = config.requireLeadingSpace ?
                    this.lastIndexWithLeadingSpace(effectiveRange, c) :
                    effectiveRange.lastIndexOf(c)

                if (
                    idx > mostRecentTriggerCharPos ||

                    // jwbth: Added this lines, as well as the `mostRecentTriggerCharLength`
                    // variable and operations with it, to have triggers like "[[#" be used instead
                    // of triggers like "[[" if both are present.
                    (
                        idx > -1 &&
                        idx === mostRecentTriggerCharPos &&
                        c.length > mostRecentTriggerCharLength
                    )
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
            let inputOk = (mostRecentTriggerCharPos >= 0 &&
                (
                    mostRecentTriggerCharPos === 0 ||
                    !requireLeadingSpace ||

                    // jwbth: Use punctuation instead of just whitespace characters.
                    PUNCTUATION_REGEXP.test(effectiveRange[mostRecentTriggerCharPos - 1])
                )
            )
            if (inputOk) {
                currentTriggerSnippet = effectiveRange.substring(mostRecentTriggerCharPos + triggerChar.length,
                    effectiveRange.length)

                // jwbth: Added this line and the declaration above.
                originalCurrentTriggerSnippet = currentTriggerSnippet

                triggerChar = effectiveRange.substring(mostRecentTriggerCharPos, mostRecentTriggerCharPos + triggerChar.length)
                let firstSnippetChar = currentTriggerSnippet.substring(0, 1)
                leadingSpace = currentTriggerSnippet.length > 0 &&
                    (
                        firstSnippetChar === ' ' ||
                        firstSnippetChar === '\xA0'
                    )
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
                this.tribute.dropMenu = true
                return
            } else {
                this.tribute.dropMenu = false
            }

            if (inputOk && !leadingSpace && (menuAlreadyActive || !regex.test(currentTriggerSnippet))) {
                return {
                    mentionPosition: mostRecentTriggerCharPos,
                    mentionText: currentTriggerSnippet,
                    mentionSelectedElement: selected,
                    mentionSelectedPath: path,
                    mentionSelectedOffset: offset,
                    mentionTriggerChar: triggerChar
                }
            }
        }
    }

    lastIndexWithLeadingSpace(str, trigger) {
        let reversedStr = str.split('').reverse().join('')
        let index = -1

        for (let cidx = 0, len = str.length; cidx < len; cidx++) {
            let firstChar = cidx === str.length - 1
            let leadingSpace = PUNCTUATION_REGEXP.test(reversedStr[cidx + 1])

            let match = true
            for (let triggerIdx = trigger.length - 1; triggerIdx >= 0; triggerIdx--) {
              if (trigger[triggerIdx] !== reversedStr[cidx-triggerIdx]) {
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

    isMenuOffScreen(coordinates, menuDimensions) {
        // jwbth: Replaced window.innerWidth and window.innerHeight with doc.clientWidth and
        // doc.clientHeight - the first ones include scrollbars. Removed some tweaks for
        // compatibility with old browsers.

        let doc = document.documentElement
        let windowLeft = window.scrollX - (doc.clientLeft || 0)
        let windowTop = window.scrollY - (doc.clientTop || 0)

        let menuTop = typeof coordinates.top === 'number' ?
            coordinates.top :
            windowTop + doc.clientHeight - coordinates.bottom - menuDimensions.height
        let menuRight = typeof coordinates.right === 'number' ?
            coordinates.right :
            coordinates.left + menuDimensions.width
        let menuBottom = typeof coordinates.bottom === 'number' ?
            coordinates.bottom :
            coordinates.top + menuDimensions.height
        let menuLeft = typeof coordinates.left === 'number' ?
            coordinates.left :
            windowLeft + doc.clientWidth - coordinates.right - menuDimensions.width

        return {
            top: menuTop < Math.floor(windowTop),
            right: menuRight > Math.ceil(windowLeft + doc.clientWidth),
            bottom: menuBottom > Math.ceil(windowTop + doc.clientHeight) - 3,
            left: menuLeft < Math.floor(windowLeft)
        }
    }

    getMenuDimensions() {
        // Width of the menu depends of its contents and position
        // We must check what its width would be without any obstruction
        // This way, we can achieve good positioning for flipping the menu
        let dimensions = {
            width: null,
            height: null
        }

        // jwbth: Fixed "visibility; hidden;".
        this.tribute.menu.style.cssText = `top: 0px;` +
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

    // jwbth: Added RTL support.
    getTextAreaOrInputUnderlinePosition(element, position) {
        // jwbth: Reuse the global object property.
        let properties = convenientDiscussions.g.inputPropsAffectingCoords;

        let div = document.createElement('div')
        div.id = 'input-textarea-caret-position-mirror-div'
        document.body.appendChild(div)

        let style = div.style
        let computed = window.getComputedStyle ? getComputedStyle(element) : element.currentStyle

        style.whiteSpace = 'pre-wrap'
        if (element.nodeName !== 'INPUT') {
            style.wordWrap = 'break-word'
        }

        // position off-screen
        style.position = 'absolute'
        style.visibility = 'hidden'

        // transfer the element's properties to the div
        properties.forEach(prop => {
            style[prop] = computed[prop]
        })

        // jwbth: replaced `parseInt` with `parseFloat`: `parseInt` can result in a wrongly
        // positioned menu due to a line break (have seen an example when edited
        // [[:en:Wikipedia:Village pump (proposals)#Allow fair use non-freely licensed photos of
        // politicians]]). Removed `isFirefox` condition as it was calculated incorrectly and was
        // always `true`.
        style.width = `${parseFloat(computed.width)}px`
        if (element.scrollHeight > parseFloat(computed.height))
            style.overflowY = 'scroll'

        div.textContent = element.value.substring(0, position)

        // jwbth: Removed replacing "\s" with ' ' as its function is unclear and negative effects
        // are likely (say, when replacing the tab character with the space that has different
        // width).

        let triggerSpan = document.createElement('span')
        triggerSpan.textContent = this.tribute.current.trigger

        let span = document.createElement('span')
        span.append(
            triggerSpan,
            element.value.substring(position + this.tribute.current.trigger.length) || ''
        )
        div.appendChild(span)

        let doc = document.documentElement

        // jwbth: Replaced `window.innerWidth` with `document.documentElement.clientWidth` here and
        // in other places to have the scrollbars counted.
        let windowWidth = doc.clientWidth
        let windowHeight = doc.clientHeight

        let rect = element.getBoundingClientRect()
        let windowLeft = (window.pageXOffset || doc.scrollLeft) - (doc.clientLeft || 0)
        let windowTop = (window.pageYOffset || doc.scrollTop) - (doc.clientTop || 0)

        let top = 0
        let left = 0
        let right = 0
        if (this.menuContainerIsBody) {
          top = rect.top
          left = rect.left
          right = rect.right
        }

        let coordinates = {
            top: top + windowTop + span.offsetTop + parseInt(computed.borderTopWidth) +
                parseInt(computed.fontSize) - element.scrollTop
        }
        if (this.tribute.direction === 'rtl') {
            const offsetRight = doc.dir === 'rtl' ? windowWidth : div.getBoundingClientRect().right
            coordinates.right = (windowWidth - right) +
                (offsetRight - span.getBoundingClientRect().right) + triggerSpan.offsetWidth
        } else {
            coordinates.left = windowLeft + left + span.offsetLeft + triggerSpan.offsetWidth + 1
        }

        let menuDimensions = this.getMenuDimensions()
        let menuIsOffScreen = this.isMenuOffScreen(coordinates, menuDimensions)

        if (this.tribute.direction === 'rtl') {
            if (menuIsOffScreen.left) {
                coordinates.left = 0
                coordinates.right = 'auto'
            }
        } else {
            if (menuIsOffScreen.right) {
                // jwbth: Simplified the positioning by putting `right` at 0.
                coordinates.right = 0
                coordinates.left = 'auto'
            }
        }

        if (menuIsOffScreen.bottom) {
            // jwbth: Removed the block setting `coordinates.bottom` as a reference point as well as
            // the `parentHeight` variable, added the block setting the height for the menu.
            const height = windowTop + windowHeight - coordinates.top -
                parseFloat(getComputedStyle(element).paddingTop) - 3
            coordinates.additionalStyles = `height: ${height}px; overflow-y: scroll;`
        }

        // jwbth: Removed the second check if the menu is off screen as it seems redundant after we
        // stopped flipping the menu.

        document.body.removeChild(div)
        return coordinates
    }

    scrollIntoView() {
        let reasonableBuffer = 20,
            clientRect
        let maxScrollDisplacement = 100
        let e = this.menu

        if (typeof e === 'undefined') return

        while (clientRect === undefined || clientRect.height === 0) {
            clientRect = e.getBoundingClientRect()

            if (clientRect.height === 0) {
                e = e.childNodes[0]
                if (e === undefined || !e.getBoundingClientRect) {
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


export default TributeRange;
