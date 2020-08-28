// Thanks to https://github.com/jeff-collins/ment.io
import "./utils";

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
            );

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
        return this.tribute.menuContainer === document.body || !this.tribute.menuContainer;
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

    replaceTriggerText(text, requireLeadingSpace, hasTrailingSpace, originalEvent, item) {
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

            let myField = this.tribute.current.element
            let textSuffix = typeof this.tribute.replaceTextSuffix == 'string'
                ? this.tribute.replaceTextSuffix
                : ' '
            text += textSuffix
            let startPos = info.mentionPosition

            // jwbth: Fixed this line to make it work with `replaceTextSuffix`es of length other
            // than 1.
            let endPos = info.mentionPosition + info.mentionText.length

            // jwbth: Fixed this line to make it work with `replaceTextSuffix`es of length other
            // than 1.
            endPos += info.mentionTriggerChar.length


            // jwbth: Made alterations to make `keepTextAfter` config value work.
            let ending = myField.value.substring(endPos, myField.value.length);
            if (ending.startsWith(context.collection.keepTextAfter)) {
                ending = ending.slice(context.collection.keepTextAfter.length);
            }
            myField.value = myField.value.substring(0, startPos) + text + ending;

            myField.selectionStart = startPos + text.length
            myField.selectionEnd = startPos + text.length

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

        let textComponent = this.tribute.current.element;
        if (textComponent) {
            let startPos = textComponent.selectionStart
            if (textComponent.value && startPos >= 0) {
                text = textComponent.value.substring(0, startPos)
            }
        }

        return text
    }

    getLastWordInText(text) {
        text = text.replace(/\u00A0/g, ' '); // https://stackoverflow.com/questions/29850407/how-do-i-replace-unicode-character-u00a0-with-a-space-in-javascript
        var wordsArray;
        if (this.tribute.autocompleteSeparator) {
            wordsArray = text.split(this.tribute.autocompleteSeparator);
        } else {
            wordsArray = text.split(/\s+/);
        }
        var worldsCount = wordsArray.length - 1;
        return wordsArray[worldsCount].trim();
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
            let leadingSpace
            let regex
            let inputOk = (mostRecentTriggerCharPos >= 0 &&
                (
                    mostRecentTriggerCharPos === 0 ||
                    !requireLeadingSpace ||
                    /[\xA0\s]/g.test(
                        effectiveRange.substring(
                            mostRecentTriggerCharPos - 1,
                            mostRecentTriggerCharPos)
                    )
                )
            )
            if (inputOk) {
                currentTriggerSnippet = effectiveRange.substring(mostRecentTriggerCharPos + triggerChar.length,
                    effectiveRange.length)

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

                regex = allowSpaces ? /[^\S ]/g : /[\xA0\s]/g;

                this.tribute.hasTrailingSpace = regex.test(currentTriggerSnippet);
            }

            /*
                jwbth: Added this block, breaking the block starting with `inputOk` check into two
                parts, as we need to have the menu removed when:
                - there is no valid trigger before the cursor position,
                - typing a space after "@" or "##",
                - there is a selection.
            */
            if (
                mostRecentTriggerCharPos === -1 ||
                (currentTriggerSnippet && !currentTriggerSnippet[0].trim()) ||
                selected.selectionStart !== selected.selectionEnd ||

                // When pressed backspace in "[[#" and faced the trigger "[["
                (this.tribute.current.trigger && triggerChar !== this.tribute.current.trigger)
            ) {
                this.tribute.doDropMenu = true;
                return;
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

    lastIndexWithLeadingSpace (str, trigger) {
        let reversedStr = str.split('').reverse().join('')
        let index = -1

        for (let cidx = 0, len = str.length; cidx < len; cidx++) {
            let firstChar = cidx === str.length - 1
            let leadingSpace = /\s/.test(reversedStr[cidx + 1])

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
        let windowWidth = window.innerWidth
        let windowHeight = window.innerHeight
        let doc = document.documentElement
        let windowLeft = (window.pageXOffset || doc.scrollLeft) - (doc.clientLeft || 0)
        let windowTop = (window.pageYOffset || doc.scrollTop) - (doc.clientTop || 0)

        let menuTop = typeof coordinates.top === 'number' ?
            coordinates.top :
            windowTop + windowHeight - coordinates.bottom - menuDimensions.height
        let menuRight = typeof coordinates.right === 'number' ?
            coordinates.right :
            coordinates.left + menuDimensions.width
        let menuBottom = typeof coordinates.bottom === 'number' ?
            coordinates.bottom :
            coordinates.top + menuDimensions.height
        let menuLeft = typeof coordinates.left === 'number' ?
            coordinates.left :
            windowLeft + coordinates.right - menuDimensions.width

        return {
            top: menuTop < Math.floor(windowTop),
            right: menuRight > Math.ceil(windowLeft + windowWidth),
            bottom: menuBottom > Math.ceil(windowTop + windowHeight),
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

        // jwbth: Fixed "visibility(;) hidden;".
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
        let properties = ['direction', 'boxSizing', 'width', 'height', 'overflowX',
            'overflowY', 'borderTopWidth', 'borderRightWidth',
            'borderBottomWidth', 'borderLeftWidth', 'paddingTop',
            'paddingRight', 'paddingBottom', 'paddingLeft',
            'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch',
            'fontSize', 'fontSizeAdjust', 'lineHeight', 'fontFamily',
            'textAlign', 'textTransform', 'textIndent',
            'textDecoration', 'letterSpacing', 'wordSpacing'
        ]

        let isFirefox = (window.mozInnerScreenX !== null)

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

        if (isFirefox) {
            // jwbth: replaced parseInt with parseFloat: can result in wrongly positioned menu (have
            // seen an example when edited [[:en:Wikipedia:Village pump (proposals)#Allow fair use
            // non-freely licensed photos of politicians]]).
            style.width = `${(parseFloat(computed.width) - 2)}px`
            if (element.scrollHeight > parseFloat(computed.height))
                style.overflowY = 'scroll'
        } else {
            style.overflow = 'hidden'
        }

        div.textContent = element.value.substring(0, position)

        if (element.nodeName === 'INPUT') {
            div.textContent = div.textContent.replace(/\s/g, ' ')
        }

        let span = document.createElement('span')
        span.textContent = element.value.substring(position) || '.'
        div.appendChild(span)

        let doc = document.documentElement

        // jwbth: Replaced `window.innerWidth` with `document.documentElement.clientWidth` here and
        // in other places to have the scrollbars counted.
        let windowWidth = doc.clientWidth
        let windowHeight = doc.clientHeight

        let rect = element.getBoundingClientRect()
        let windowLeft = (window.pageXOffset || doc.scrollLeft) - (doc.clientLeft || 0)
        let windowTop = (window.pageYOffset || doc.scrollTop) - (doc.clientTop || 0)

        let top = 0;
        let left = 0;
        if (this.menuContainerIsBody) {
          top = rect.top;
          left = rect.left;
        }

        let coordinates = {
            top: top + windowTop + span.offsetTop + parseInt(computed.borderTopWidth) +
                parseInt(computed.fontSize) - element.scrollTop
        }
        if (this.tribute.isRtl) {
            coordinates.right = windowWidth - (windowLeft + left + span.offsetLeft +
                span.offsetWidth + parseInt(computed.borderLeftWidth))
        } else {
            coordinates.left = windowLeft + left + span.offsetLeft +
                parseInt(computed.borderLeftWidth)
        }

        let menuDimensions = this.getMenuDimensions()
        let menuIsOffScreen = this.isMenuOffScreen(coordinates, menuDimensions)

        if (this.tribute.isRtl) {
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
                parseFloat(getComputedStyle(element).paddingTop)
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

        if (typeof e === 'undefined') return;

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
