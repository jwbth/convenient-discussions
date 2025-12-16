/**
 * Utilities for the window context. DOM, rendering, visual effects, user input, etc.
 *
 * @module utilsWindow
 */

import { formatDistanceToNowStrict } from 'date-fns'
import { getTimezoneOffset } from 'date-fns-tz'
import dayjs from 'dayjs'
import dayJsTimezone from 'dayjs/plugin/timezone'
import dayJsUtc from 'dayjs/plugin/utc'

import Button from './Button'
import controller from './controller'
import cd from './loader/cd'
import settings from './settings'
import ElementsTreeWalker from './shared/ElementsTreeWalker'
import {
	decodeHtmlEntities,
	defined,
	generatePageNamePattern,
	isInline,
	parseWikiUrl,
	removeDirMarks,
	spacesToUnderlines,
} from './shared/utils-general'
import { dateTokenToMessageNames, parseTimestamp } from './shared/utils-timestamp'
import { maskDistractingCode } from './shared/utils-wikitext'
import userRegistry from './userRegistry'

/** @type {string | undefined} */
let utcString

/**
 * Generate a timezone postfix of a timestamp for an offset.
 *
 * @param {number} offset Offset in minutes.
 * @returns {string}
 */
export function generateTimezonePostfix(offset) {
	utcString ??= cd.mws('timezone-utc')
	let postfix = ` (${utcString}`

	if (offset !== 0) {
		// `offset` is not necessarily an integer
		postfix += (offset > 0 ? '+' : '-') + String(Math.abs(offset / 60))
	}
	postfix += ')'

	return postfix
}

/**
 * @typedef {{ [key: string]: import('./Button').Action }} WrapCallbacks
 */

/**
 * Wrap a HTML string into a `<span>` (or other element) suitable as an argument for various
 * methods. It fills the same role as
 * {@link https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.HtmlSnippet.html OO.ui.HtmlSnippet}, but
 * works not only with OOUI widgets. Optionally, attach callback functions and `target="_blank"`
 * attribute to links with the provided class names. See also
 * {@link mergeJquery}.
 *
 * @param {string} html
 * @param {object} [options]
 * @param {WrapCallbacks} [options.callbacks]
 * @param {string} [options.tagName]
 * @param {boolean} [options.targetBlank]
 * @returns {JQuery}
 */
export function wrapHtml(html, options = {}) {
	const tagName = options.tagName || 'span'
	const $wrapper = $($.parseHTML(html)).wrapAll(`<${tagName}>`).parent()
	const callbacks = options.callbacks
	if (callbacks) {
		Object.keys(callbacks).forEach((className) => {
			const $linkWrapper = $wrapper.find(`.${className}`)
			let $link = /** @type {JQuery} */ ($linkWrapper.find('a'))
			const href = $link.attr('href')
			if (href && /\$\d$/.test(href)) {
				// Handle dummy links we put into strings for translation so that translators understand
				// this will be a link.
				$link.removeAttr('href').removeAttr('title')
			} else if (!$link.length) {
				$link = $linkWrapper.wrapInner('<a>').children().first()
			}
			new Button({ buttonElement: $link[0] }).setAction(callbacks[className])
		})
	}
	if (options.targetBlank) {
		$wrapper.find('a[href]').attr('target', '_blank')
	}

	return $wrapper
}

/**
 * Wrap the response to the `compare` API request in a table.
 *
 * @param {string} body
 * @returns {string}
 */
export function wrapDiffBody(body) {
	const className = [
		'diff',
		mw.user.options.get('editfont') === 'monospace' ? 'diff-editfont-monospace' : undefined,
		'diff-contentalign-' + (cd.g.contentDirection === 'ltr' ? 'left' : 'right'),
	]
		.filter(defined)
		.join(' ')

	return (
		`<table class="${className}">` +
		'<col class="diff-marker"><col class="diff-content">' +
		'<col class="diff-marker"><col class="diff-content">' +
		body +
		'</table>'
	)
}

/**
 * Check if an input or editable element is focused.
 *
 * @returns {boolean}
 */
export function isInputFocused() {
	// Use document.activeElement instead of $(':input') for performance reasons - this runs very
	// often
	if (!document.activeElement) {
		return false
	}

	const $active = $(document.activeElement)

	return Boolean(
		$active.is(':input') || ('isContentEditable' in $active[0] && $active[0].isContentEditable),
	)
}

/**
 * @typedef {object} ExtendedDOMRect
 * @property {number} top
 * @property {number} bottom
 * @property {number} left
 * @property {number} right
 * @property {number} width
 * @property {number} height
 * @property {number} outerTop
 * @property {number} outerBottom
 * @property {number} outerLeft
 * @property {number} outerRight
 */

/**
 * @typedef {DOMRect | ExtendedDOMRect} AnyDOMRect
 */

/**
 * Get the bounding client rectangle of an element, setting values that include margins to the
 * `outerTop`, `outerBottom`, `outerLeft`, and `outerRight` properties. The margins are cached.
 *
 * @param {Element} el
 * @returns {ExtendedDOMRect}
 */
export function getExtendedRect(el) {
	if (el.cdMargin === undefined) {
		const style = window.getComputedStyle(el)
		el.cdMargin = {
			top: Number.parseFloat(style.marginTop),
			bottom: Number.parseFloat(style.marginBottom),
			left: Number.parseFloat(style.marginLeft),
			right: Number.parseFloat(style.marginRight),
		}
	}
	const rect = el.getBoundingClientRect()
	const visible = isVisible(el)

	return $.extend(
		{
			outerTop: rect.top - (visible ? el.cdMargin.top : 0),
			outerBottom: rect.bottom + (visible ? el.cdMargin.bottom : 0),
			outerLeft: rect.left - (visible ? el.cdMargin.left : 0),
			outerRight: rect.right + (visible ? el.cdMargin.right : 0),
		},
		rect,
	)
}

/**
 * Given bounding client rectangle(s), determine whether the element is fully visible (not
 * necessarily in the viewport).
 *
 * @param {...AnyDOMRect} rects
 * @returns {boolean} `true` if visible, `false` if not.
 */
export function getVisibilityByRects(...rects) {
	// If the element has 0 as the left position and height, it's probably invisible for some reason.
	return rects.every((rect) => rect.left !== 0 || rect.height !== 0)
}

/**
 * Check if elements are visible, using modern checkVisibility API when available, falling back to
 * rectangle-based and hidden="until-found" checks.
 *
 * @param {...Element} elements
 * @returns {boolean} `true` if all elements are visible, `false` otherwise.
 */
export function isVisible(...elements) {
	return elements.every((element) => {
		// Use modern checkVisibility API if available
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (element?.checkVisibility) {
			return element.checkVisibility()
		}

		// Fallback: check rectangles first
		const rect = element.getBoundingClientRect()
		if (!getVisibilityByRects(rect)) {
			return false
		}

		// Then check for hidden="until-found" ancestors
		return !isHiddenByUntilFound(element)
	})
}

/**
 * Check if an element is hidden by a `hidden="until-found"` ancestor.
 *
 * @param {Element} element The element to check
 * @returns {boolean}
 */
export function isHiddenByUntilFound(element) {
	let current = element.parentElement

	while (current) {
		if (current.getAttribute('hidden') === 'until-found') {
			return true
		}

		current = current.parentElement
	}

	return false
}

/**
 * Check if the provided key combination is pressed given an event.
 *
 * @param {JQuery.KeyDownEvent|KeyboardEvent} event
 * @param {number} keyCode
 * @param {('cmd' | 'shift' | 'alt' | 'meta' | 'ctrl')[]} modifiers Use `'cmd'` instead of `'ctrl'`
 *   to capture both Windows and Mac machines.
 * @returns {boolean}
 */
export function keyCombination(event, keyCode, modifiers = []) {
	if (modifiers.includes('cmd')) {
		modifiers.splice(
			modifiers.indexOf('cmd'),
			1,

			// In Chrome on Windows, e.metaKey corresponds to the Windows key, so we better check for a
			// platform.
			$.client.profile().platform === 'mac' ? 'meta' : 'ctrl',
		)
	}

	return (
		// eslint-disable-next-line @typescript-eslint/no-deprecated
		event.keyCode === keyCode &&
		/** @type {typeof modifiers} */ (['ctrl', 'shift', 'alt', 'meta']).every(
			(mod) => modifiers.includes(mod) === event[/** @type {keyof typeof event} */ (mod + 'Key')],
		)
	)
}

/**
 * Whether a command modifier is pressed. On Mac, this means the Cmd key. On Windows, this means the
 * Ctrl key.
 *
 * @param {MouseEvent | KeyboardEvent | JQuery.MouseEventBase | JQuery.KeyboardEventBase} event
 * @returns {boolean}
 */
export function isCmdModifierPressed(event) {
	// In Chrome on Windows, e.metaKey corresponds to the Windows key, so we better check for a
	// platform.
	return $.client.profile().platform === 'mac' ? event.metaKey : event.ctrlKey
}

/**
 * @typedef {{
 *   higherNode: Node;
 *   higherOffset: number;
 * }} HigherNodeAndOffsetInSelection
 */

/**
 * Given a {@link https://developer.mozilla.org/en-US/docs/Web/API/Selection selection}, get a
 * node and offset that are higher in the document, regardless if they belong to an anchor node or
 * focus node.
 *
 * @param {Selection} selection
 * @returns {HigherNodeAndOffsetInSelection | undefined}
 */
export function getHigherNodeAndOffsetInSelection(selection) {
	if (!selection.anchorNode) {
		return
	}

	const isAnchorHigher =
		selection.anchorNode.compareDocumentPosition(/** @type {Node} */ (selection.focusNode)) &
		Node.DOCUMENT_POSITION_FOLLOWING

	return {
		higherNode: isAnchorHigher ? selection.anchorNode : /** @type {Node} */ (selection.focusNode),
		higherOffset: isAnchorHigher ? selection.anchorOffset : selection.focusOffset,
	}
}

/**
 * @typedef {object} SuccessAndFailMessages
 * @property {string|JQuery} success Success message.
 * @property {string|JQuery} fail Fail message.
 */

/**
 * @overload
 * @param {string} text Text to copy.
 * @param {SuccessAndFailMessages} messages
 * @returns {void}
 *
 * @overload
 * @param {string} text Text to copy.
 * @returns {boolean}
 */

/**
 * Copy text and notify whether the operation was successful.
 *
 * @param {string} text Text to copy.
 * @param {SuccessAndFailMessages} [messages]
 * @returns {boolean|undefined}
 * @private
 */
export function copyText(text, messages) {
	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const $textarea = $('<textarea>').val(text).appendTo(document.body).trigger('select')
	// eslint-disable-next-line @typescript-eslint/no-deprecated
	const successful = document.execCommand('copy')
	$textarea.remove()

	if (messages) {
		if (text && successful) {
			mw.notify(messages.success)
		} else {
			mw.notify(messages.fail, { type: 'error' })
		}
	} else {
		return successful
	}
}

/**
 * Check whether there is something in the HTML that can be converted to wikitext.
 *
 * @param {string} html
 * @param {HTMLElement} containerElement
 * @returns {boolean}
 */
export function isHtmlConvertibleToWikitext(html, containerElement) {
	return isElementConvertibleToWikitext(
		cleanUpPasteDom(getElementFromPasteHtml(html), containerElement).element,
	)
}

/**
 * Check whether there is something in the element that can be converted to wikitext.
 *
 * @param {Element} element
 * @returns {boolean}
 */
export function isElementConvertibleToWikitext(element) {
	return Boolean(
		element.childElementCount &&
			!(
				[...element.querySelectorAll('*')].length === 1 &&
				element.childNodes.length === 1 &&
				['P', 'LI', 'DD'].includes(element.children[0].tagName)
			) &&
			![...element.querySelectorAll('*')].every((el) => el.tagName === 'BR'),
	)
}

/**
 * @typedef {object} CleanUpPasteDomReturn
 * @property {HTMLElement} element
 * @property {string} text
 * @property {(string|undefined)[]} syntaxHighlightLanguages
 */

/**
 * Clean up the contents of an element created based on the HTML code of a paste.
 *
 * @param {HTMLElement} element
 * @param {HTMLElement} containerElement
 * @returns {CleanUpPasteDomReturn}
 */
export function cleanUpPasteDom(element, containerElement) {
	// Get all styles (such as `user-select: none`) from classes applied when the element is added
	// to the DOM. If HTML is retrieved from a paste, this is not needed (styles are added to
	// elements themselves in the text/html format), but won't hurt.
	element.className = 'cd-commentForm-dummyElement'
	containerElement.append(element)

	const styledElements = /** @type {HTMLElement[]} */ ([
		...element.querySelectorAll('[style]:not(pre [style])'),
	])
	styledElements.forEach((el) => {
			if (el.style.textDecoration === 'underline' && !['U', 'INS', 'A'].includes(el.tagName)) {
				$(el).wrapInner('<u>')
			}
			if (
				el.style.textDecoration === 'line-through' &&
				!['STRIKE', 'S', 'DEL'].includes(el.tagName)
			) {
				$(el).wrapInner('<s>')
			}
			if (el.style.fontStyle === 'italic' && !['I', 'EM'].includes(el.tagName)) {
				$(el).wrapInner('<i>')
			}
			if (['bold', '700'].includes(el.style.fontWeight) && !['B', 'STRONG'].includes(el.tagName)) {
				$(el).wrapInner('<b>')
			}
			el.removeAttribute('style')
		},
	)

	const removeElement = (/** @type {Element} */ el) => {
		el.remove()
	}
	const replaceWithChildren = (/** @type {Element} */ el) => {
		if (
			['DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DD'].includes(el.tagName) &&
			(el.nextElementSibling ||
				// Cases like `<div><div>Quote</div>Text</div>`, e.g. created by
				// https://ru.wikipedia.org/wiki/Template:Цитата_сообщения
				el.nextSibling?.textContent.trim())
		) {
			el.after('\n')
		}
		el.replaceWith(...el.childNodes)
	}

	;[...element.querySelectorAll('*')]
		.filter((el) => window.getComputedStyle(el).userSelect === 'none')
		.forEach(removeElement)

	// Should run after removing elements with `user-select: none`, to remove their wrappers that
	// now have no content.
	;[...element.querySelectorAll('*')]
		.filter(
			(el) =>
				(!isInline(el) || el.classList.contains('Apple-interchange-newline')) &&
				// Need to keep non-breaking spaces.
				!el.textContent.replace(/[ \n]+/g, ''),
		)

		.forEach(removeElement)

	;[...element.querySelectorAll('style')].forEach(removeElement)

	const topElements = /** @type {Element[]} */ (
		controller.getBootProcess().parser.getTopElementsWithText(element, true).nodes
	)
	if (topElements[0] !== element) {
		element.innerHTML = ''
		element.append(...topElements)
	}

	;[...element.querySelectorAll('code.mw-highlight')].forEach((el) => {
		// eslint-disable-next-line no-self-assign
		el.textContent = el.textContent
	})

	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const syntaxHighlightLanguages = [...element.querySelectorAll('pre, code')].map(
		(el) =>
			((el.tagName === 'PRE' ? /** @type {HTMLElement} */ (el.parentElement) : el).className.match(
				'mw-highlight-lang-([0-9a-z_-]+)',
			) || [])[1],
	)

	;[...element.querySelectorAll('div, span, h1, h2, h3, h4, h5, h6')].forEach(replaceWithChildren)
	;[...element.querySelectorAll('p > br')].forEach((el) => {
		el.after('\n')
		el.remove()
	})

	// This will turn links to unexistent pages to actual red links. Should be above the removal of
	// classes.
	;[...element.querySelectorAll('a')]
		.filter((el) => el.classList.contains('new'))
		.forEach((el) => {
			const href = el.getAttribute('href')
			if (!href) return

			const urlData = parseWikiUrl(href)
			if (urlData && urlData.hostname === location.hostname) {
				el.setAttribute('href', mw.util.getUrl(urlData.pageName))
			}
		})

	const allowedTags = new Set(cd.g.allowedTags.concat('a', 'center', 'big', 'strike', 'tt'))
	;[...element.querySelectorAll('*')].forEach((el) => {
		if (!allowedTags.has(el.tagName.toLowerCase())) {
			replaceWithChildren(el)

			return
		}

		;[...el.attributes]
			.filter((attr) => attr.name === 'class' || attr.name.startsWith('data-'))
			.forEach((attr) => {
				el.removeAttribute(attr.name)
			})
	})

	;[...element.children]
		// <dd>s out of <dl>s are likely comment parts that should not create `:` markup. (Bare <li>s
		// don't create `*` markup in the API.)
		.filter((el) => el.tagName === 'DD')

		.forEach(replaceWithChildren)

	getAllTextNodes(element)
		.filter((node) => /** @type {HTMLElement} */ (node.parentElement).tagName !== 'PRE')
		.forEach((node) => {
			// Firefox adds newlines of unclear nature
			node.textContent = node.textContent.replace(/\n/g, ' ')
		})

	// Need to do it before removing the element; if we do it later, the literal textual content of
	// the elements equivalent to .textContent will be used instead of the rendered appearance.
	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const text = element.innerText

	element.remove()

	return { element, text, syntaxHighlightLanguages }
}

/**
 * Turn HTML code of a paste into an element.
 *
 * @param {string} html
 * @returns {HTMLElement}
 */
export function getElementFromPasteHtml(html) {
	const div = document.createElement('div')
	div.innerHTML = html
		.replace(/^[^]*<!-- *StartFragment *-->/, '')
		.replace(/<!-- *EndFragment *-->[^]*$/, '')

	return div
}

/**
 * Get all nodes between the two specified, including them. This works equally well if they are at
 * different nesting levels. Descendants of nodes that are already included are not included.
 *
 * For simplicity, consider the results `HTMLElement`s – we have yet to encounter a case where one
 * of the elements in a range is simply an `Element`.
 *
 * @param {HTMLElement} start
 * @param {?HTMLElement} end
 * @param {HTMLElement} rootElement
 * @returns {HTMLElement[] | undefined}
 */
export function getRangeContents(start, end, rootElement) {
	// Fight infinite loops
	if (!end || start.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_PRECEDING) {
		return
	}

	let commonAncestor
	for (let /** @type {HTMLElement | null} */ el = start; el; el = el.parentElement) {
		if (el.contains(end)) {
			commonAncestor = el
			break
		}
	}

	/*
		Here we should equally account for all cases of the start and end item relative position.

			<ul>         <!-- Say, may start anywhere from here... -->
				<li></li>
				<li>
					<div></div>
				</li>
				<li></li>
			</ul>
			<div></div>  <!-- ...to here. And, may end anywhere from here... -->
			<ul>
				<li></li>
				<li>
					<div></div>
				</li>
				<li></li>  <-- ...to here. -->
			</ul>
	*/
	const rangeContents = [start]

	// The start container could contain the end container and be different from it in the case with
	// adjusted end items.
	if (!start.contains(end)) {
		const treeWalker = new ElementsTreeWalker(rootElement, start)

		while (treeWalker.currentNode.parentNode !== commonAncestor) {
			while (treeWalker.nextSibling()) {
				rangeContents.push(treeWalker.currentNode)
			}
			treeWalker.parentNode()
		}
		treeWalker.nextSibling()
		while (!treeWalker.currentNode.contains(end)) {
			rangeContents.push(treeWalker.currentNode)
			treeWalker.nextSibling()
		}

		// This step fixes some issues with .cd-connectToPreviousItem like wrong margins below the
		// expand note of the comment
		// https://commons.wikimedia.org/w/index.php?title=User_talk:Jack_who_built_the_house/CD_test_page&oldid=678031044#c-Example-2021-10-02T05:14:00.000Z-Example-2021-10-02T05:13:00.000Z
		// if you collapse its thread.
		let parent
		while (
			(parent = end.parentElement) &&
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			parent &&
			parent.lastChild === end &&
			treeWalker.currentNode.contains(parent)
		) {
			end = parent
		}

		while (treeWalker.currentNode !== end) {
			treeWalker.firstChild()
			while (!treeWalker.currentNode.contains(end)) {
				rangeContents.push(treeWalker.currentNode)
				treeWalker.nextSibling()
			}
		}
		rangeContents.push(end)
	}

	return rangeContents
}

/**
 * Get all text nodes under the root element in the window (not worker) context.
 *
 * @param {Element} rootNode
 * @returns {Text[]}
 * @private
 */
export function getAllTextNodes(rootNode) {
	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const treeWalker = document.createNodeIterator(rootNode, NodeFilter.SHOW_TEXT)
	const nodes = []
	let node
	while ((node = /** @type {?Text} */ (treeWalker.nextNode()))) {
		nodes.push(node)
	}

	return nodes
}

/**
 * Check if an anchor is existent on the page (in an element ID or the `name` of an `<a>` element).
 *
 * @param {string} anchor
 * @param {boolean} [isWikilink] The anchor is part of a wikilink string (e.g. [[#test
 *   test]]). If so, we will replace spaces with underlines.
 * @returns {boolean | undefined}
 */
export function isExistentAnchor(anchor, isWikilink = false) {
	if (!anchor) {
		return
	}

	if (isWikilink) {
		anchor = spacesToUnderlines(anchor)
	}
	const escaped = CSS.escape(anchor)

	return Boolean($(`*[id="${escaped}"], a[name="${escaped}"]`).length)
}

/**
 * Merge many jQuery objects into one. Works like {@link https://api.jquery.com/add/ .add()}, but
 * accepts many parameters and is faster. Unlike `.add()`, only accepts jQuery objects though and
 * doesn't reorder elements based on their relative position in the DOM.
 *
 * @param {Array.<JQuery|undefined>} arrayOfJquery jQuery objects. Undefined values will be
 *   omitted.
 * @returns {JQuery} jQuery
 */
export function mergeJquery(...arrayOfJquery) {
	return $($.map(arrayOfJquery.filter(defined), ($object) => $object.get()))
}

/**
 * Get the name of the anchor in the `href` attribute of an anchor element. If anything is not
 * right, returns `null`.
 *
 * @param {HTMLAnchorElement} element
 * @returns {string | undefined}
 */
export function getLinkedAnchor(element) {
	const href = element.getAttribute('href')

	return href?.startsWith('#') ? href.slice(1) : undefined
}

/**
 * The object returned from `extractSignatures()`.
 *
 * @typedef {object} SignatureInWikitext
 * @property {import('./User').default} author The author name.
 * @property {number} index The array index of the signature (not the index of the signature's text
 *   in the code - excuse me the ambiguity here).
 * @property {string} [timestamp] The timestamp of the signature.
 * @property {Date} [date] The timestamp parsed to a Date object.
 * @property {number} startIndex The start index of the signature in the code.
 * @property {number} endIndex The end index of the signature in the code.
 * @property {number} commentStartIndex The start index of the signature's comment in the code.
 * @property {number} [nextCommentStartIndex] The start index of the next signature's comment in the
 *   code. This is temporary and deleted in `extractSignatures()`.
 * @property {string} dirtyCode The whole signature with all the wikitext.
 */

/**
 * @typedef {MakeOptional<
 *   Omit<SignatureInWikitext, 'commentStartIndex' | 'index' | 'date'> & {
 *     nextCommentStartIndex: NonNullable<SignatureInWikitext['nextCommentStartIndex']>
 *   },
 *   'author'
 * >} SignatureInWikitextDraft
 */

/**
 * Extract signatures from wikitext.
 *
 * Only basic signature parsing is performed here; more precise signature text identification is
 * performed in `CommentSource#adjustSignature()`. See also `CommentSource#adjust()`.
 *
 * @param {string} code Code to extract signatures from.
 * @returns {SignatureInWikitext[]}
 */
export function extractSignatures(code) {
	// TODO: Instead of removing only lines containing antipatterns from wikitext, hide entire
	// templates and tags?
	// But keep in mind that this code may still be part of comments.
	const noSignatureClassesPattern = cd.g.noSignatureClasses.join(String.raw`\b|\b`)
	const commentAntipatternsPatternParts = [
		`class=(['"])[^'"\\n]*(?:\\b${noSignatureClassesPattern}\\b)[^'"\\n]*\\1`,
	]
	if (cd.config.noSignatureTemplates.length) {
		const pattern = cd.config.noSignatureTemplates.map(generatePageNamePattern).join('|')
		commentAntipatternsPatternParts.push(`\\{\\{ *(?:${pattern}) *(?:\\||\\}\\})`)
	}
	commentAntipatternsPatternParts.push(
		...cd.config.commentAntipatterns.map((regexp) => regexp.source),
	)
	const commentAntipatternsPattern = commentAntipatternsPatternParts.join('|')

	// Hide HTML comments, quotes and lines containing antipatterns.
	const adjustedCode = maskDistractingCode(code)
		.replace(
			cd.g.quoteRegexp,
			/** @type {ReplaceCallback<4>} */
			(_, beginning, content, ending) => beginning + ' '.repeat(content.length) + ending,
		)
		.replace(new RegExp(`^.*(?:${commentAntipatternsPattern}).*$`, 'mg'), (s) =>
			' '.repeat(s.length),
		)

	const signatureDrafts = extractRegularSignatures(adjustedCode, code)
	const unsigneds = extractUnsigneds(adjustedCode, code, signatureDrafts)
	signatureDrafts.push(...unsigneds)

	// This is for the procedure adding anchors to comments linked from the comment in
	// CommentForm#addAnchorsToComments().
	const signatureIndex = adjustedCode.indexOf(cd.g.signCode)
	if (signatureIndex !== -1) {
		// Dummy signature
		signatureDrafts.push({
			author: cd.user,
			startIndex: signatureIndex,
			nextCommentStartIndex: signatureIndex + adjustedCode.slice(signatureIndex).indexOf('\n') + 1,

			// These are not used. Purely for the sake of type checking.
			endIndex: signatureIndex + cd.g.signCode.length,
			dirtyCode: cd.g.signCode,
			timestamp: '',
		})
	}

	if (unsigneds.length || signatureIndex !== -1) {
		signatureDrafts.sort((sig1, sig2) => (sig1.startIndex > sig2.startIndex ? 1 : -1))
	}

	const signatures = /** @type {SignatureInWikitext[]} */ (
		signatureDrafts.filter((sig) => sig.author)
	)
	signatures.forEach((sig, i) => {
		sig.commentStartIndex =
			i === 0 ? 0 : /** @type {number} */ (signatures[i - 1].nextCommentStartIndex)
	})
	signatures.forEach((sig, i) => {
		const { date } = (sig.timestamp && parseTimestamp(sig.timestamp)) || {}
		sig.index = i
		sig.date = date
		delete sig.nextCommentStartIndex
	})

	return signatures
}

/**
 * Extract signatures that don't come from the unsigned templates from wikitext.
 *
 * @param {string} adjustedCode Adjusted page code.
 * @param {string} code Page code.
 * @returns {SignatureInWikitextDraft[]}
 * @private
 */
function extractRegularSignatures(adjustedCode, code) {
	const timestampToolsContent = cd.g.timestampTools.content
	const ending = `(?:\\n*|$)`
	const afterTimestamp = `(?!["»])(?:\\}\\}|</small>)?`

	// Use (?:^|[^=]) to filter out timestamps in a parameter (in quote templates)
	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const timestampRegexp = new RegExp(
		`^((.*?(?:^|[^=]))(${timestampToolsContent.regexp.source})${afterTimestamp}).*${ending}`,
		'igm',
	)

	// After capturing the first signature with `.*?` we make another capture (with authorLinkRegexp)
	// to make sure we take the first link to the same author as the author in the last link. 251 is
	// not arbitrary: it's 255 (maximum allowed signature length) minus `'[[u:a'.length` plus
	// `' '.length` (the space before the timestamp).
	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const signatureScanLimit = 251
	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const signatureRegexp = new RegExp(
		/*
			Captures:
			1 - the whole line with the signature
			2 - text before the timestamp
			3 - text before the first user link
			4 - author name (inside `cd.g.captureUserNamePattern`)
			5 - sometimes, a slash appears here (inside `cd.g.captureUserNamePattern`)
			6 - timestamp
		 */
		`^(((.*?)${cd.g.captureUserNamePattern}.{1,${signatureScanLimit - 1}}?[^=])` +
			`(${timestampToolsContent.regexp.source})${afterTimestamp}.*)${ending}`,
		'im',
	)
	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const lastAuthorLinkRegexp = new RegExp(`^.*${cd.g.captureUserNamePattern}`, 'i')
	const authorLinkRegexp = new RegExp(cd.g.captureUserNamePattern, 'ig')

	const signatures = []
	let timestampMatch
	while ((timestampMatch = timestampRegexp.exec(adjustedCode))) {
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const line = timestampMatch[0]
		const lineStartIndex = timestampMatch.index
		const authorTimestampMatch = line.match(signatureRegexp)

		let author
		let timestamp
		let startIndex
		let endIndex
		let nextCommentStartIndex
		let dirtyCode
		if (authorTimestampMatch) {
			// Extract the timestamp data
			const timestampStartIndex = lineStartIndex + authorTimestampMatch[2].length
			// eslint-disable-next-line no-one-time-vars/no-one-time-vars
			const timestampEndIndex = timestampStartIndex + authorTimestampMatch[6].length
			timestamp = removeDirMarks(code.slice(timestampStartIndex, timestampEndIndex))

			// Extract the signature data
			startIndex = lineStartIndex + authorTimestampMatch[3].length
			endIndex = lineStartIndex + authorTimestampMatch[1].length
			dirtyCode = code.slice(startIndex, endIndex)

			nextCommentStartIndex = lineStartIndex + authorTimestampMatch[0].length

			// Find the first link to this author in the preceding text.

			let authorLinkMatch
			authorLinkRegexp.lastIndex = 0
			const commentEndingStartIndex = Math.max(0, timestampStartIndex - lineStartIndex - 255)
			const commentEnding = authorTimestampMatch[0].slice(commentEndingStartIndex)

			const [, lastAuthorLink] = commentEnding.match(lastAuthorLinkRegexp) || []

			// Locically it should always be non-empty. There is an unclear problem with
			// https://az.wikipedia.org/w/index.php?title=Vikipediya:Kənd_meydanı&diff=prev&oldid=7223881,
			// probably having something to do with difference between regular length and byte length.
			if (!lastAuthorLink) continue

			author = userRegistry.get(decodeHtmlEntities(lastAuthorLink))

			// Rectify the author name if needed.
			while ((authorLinkMatch = authorLinkRegexp.exec(commentEnding))) {
				// Slash can be present in authorLinkMatch[2]. It often indicates a link to a page in the
				// author's userspace that is not part of the signature (while some such links are, and we
				// don't want to eliminate those cases).
				if (authorLinkMatch[2]) continue

				if (userRegistry.get(decodeHtmlEntities(authorLinkMatch[1])) === author) {
					startIndex = lineStartIndex + commentEndingStartIndex + authorLinkMatch.index
					dirtyCode = code.slice(startIndex, endIndex)
					break
				}
			}
		} else {
			startIndex = lineStartIndex + timestampMatch[2].length
			endIndex = lineStartIndex + timestampMatch[1].length
			dirtyCode = code.slice(startIndex, endIndex)

			// eslint-disable-next-line no-one-time-vars/no-one-time-vars
			const timestampEndIndex = startIndex + timestampMatch[3].length
			timestamp = removeDirMarks(code.slice(startIndex, timestampEndIndex))

			nextCommentStartIndex = lineStartIndex + timestampMatch[0].length
		}

		signatures.push({ author, timestamp, startIndex, endIndex, dirtyCode, nextCommentStartIndex })
	}

	return signatures
}

/**
 * Extract signatures that come from the unsigned templates from wikitext.
 *
 * @param {string} adjustedCode Adjusted page code.
 * @param {string} code Page code.
 * @param {SignatureInWikitextDraft[]} signatures Existing signatures.
 * @returns {SignatureInWikitextDraft[]}
 * @private
 */
function extractUnsigneds(adjustedCode, code, signatures) {
	if (!cd.g.unsignedTemplatesPattern) {
		return []
	}

	const timestampTools = cd.g.timestampTools.content

	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const unsigneds = /** @type {SignatureInWikitextDraft[]} */ ([])
	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const unsignedTemplatesRegexp = new RegExp(cd.g.unsignedTemplatesPattern + String.raw`.*\n`, 'g')
	let match
	while ((match = unsignedTemplatesRegexp.exec(adjustedCode))) {
		let authorString
		let timestamp
		if (timestampTools.noTzRegexp.test(match[2])) {
			timestamp = match[2]
			authorString = match[3]
		} else if (timestampTools.noTzRegexp.test(match[3])) {
			timestamp = match[3]
			authorString = match[2]
		} else {
			authorString = match[2]
		}

		// Append "(UTC)" to the `timestamp` of templates that allow to omit the timezone. The timezone
		// could be not UTC, but currently the timezone offset is taken from the wiki configuration, so
		// it doesn't have effect.
		if (timestamp && !cd.g.timestampTools.content.regexp.test(timestamp)) {
			timestamp += ' (UTC)'

			// Workaround for "undated" templates. I think (need to recheck) in most cases that signature
			// would qualify as a regular signature, not an unsigned one, just with the timestamp in a
			// template. But when there is no author, we need to fill the author field.
			authorString ??= '<undated>'
		}

		// Double spaces
		timestamp = timestamp?.replace(/ +/g, ' ')

		const startIndex = match.index
		const endIndex = match.index + match[1].length
		const nextCommentStartIndex = match.index + match[0].length

		unsigneds.push({
			// A situation is also possible when we could parse neither the author nor the timestamp. (If
			// we could parse the timestamp, the author becomes `<undated>`). Let's assume that the
			// template still contains a signature and is not a "stray" template and still include it
			// (we'll filter out authorless signatures later anyway, but we need them now to figure out
			// where comments start).
			author: authorString ? userRegistry.get(decodeHtmlEntities(authorString)) : undefined,

			timestamp,
			startIndex,
			endIndex,
			dirtyCode: code.slice(startIndex, endIndex),
			nextCommentStartIndex,
		})

		// `[5 tildes] {{unsigned|...}}` cases. In these cases, both the signature and
		// {{unsigned|...}} are considered signatures and added to the array. We could combine them
		// but that would need corresponding code in Parser.js which could be tricky, so for now we just
		// remove the duplicate. That still allows to reply to the comment.
		const relevantSignatureIndex = signatures.findIndex(
			(sig) => sig.nextCommentStartIndex === nextCommentStartIndex,
		)
		if (relevantSignatureIndex !== -1) {
			signatures.splice(relevantSignatureIndex, 1)
		}
	}

	return unsigneds
}

/**
 * Find the first timestamp related to a comment in the code.
 *
 * @param {string} code
 * @returns {string | undefined}
 */
export function findFirstTimestamp(code) {
	return extractSignatures(code)[0]?.timestamp
}

/**
 * Get the gender that is common for a list of users (`'unknown'` is treated as `'male'`) or
 * `'unknown'` if there is no such.
 *
 * @param {import('./User').default[]} users
 * @returns {string}
 */
export function getCommonGender(users) {
	const genders = users.map((user) => user.getGender())
	let commonGender
	if (genders.every((gender) => gender === 'female')) {
		commonGender = 'female'
	} else if (genders.every((gender) => gender !== 'female')) {
		commonGender = 'male'
	} else {
		commonGender = 'unknown'
	}

	return commonGender
}

/**
 * _For internal use._ Prepare `dayjs` object for further use (add plugins and a locale).
 */
export function initDayjs() {
	if (/** @type {any} */ (dayjs).utc) return

	const locale = cd.g.userLanguage in cd.i18n ? cd.i18n[cd.g.userLanguage].dayjsLocale : undefined
	if (locale) {
		dayjs.locale(locale)
	}

	dayjs.extend(dayJsUtc)
	dayjs.extend(dayJsTimezone)
}

/**
 * Convert a date to a string in the format set in the settings.
 *
 * @param {Date} date
 * @param {boolean} [addTimezone]
 * @returns {string}
 */
export function formatDate(date, addTimezone = false) {
	let timestamp
	const timestampFormat = settings.get('timestampFormat')
	if (timestampFormat === 'default') {
		timestamp = formatDateNative(date, addTimezone)
	} else if (timestampFormat === 'improved') {
		timestamp = formatDateImproved(date, addTimezone)
	} else {
		// if (timestampFormat === 'relative')
		timestamp = formatDateRelative(date)
	}

	return timestamp
}

/**
 * Convert a date to a string in the default timestamp format.
 *
 * @param {Date} date
 * @param {boolean} [addTimezone] Add the timezone postfix (for example, "(UTC+2)").
 * @param {string} [timezone] Use the specified time zone no matter user settings.
 * @returns {string}
 */
export function formatDateNative(date, addTimezone = false, timezone = undefined) {
	const timestampToolsUser = cd.g.timestampTools.user
	let timezoneOffset
	let year
	let monthIdx
	let day
	let hours
	let minutes
	let dayOfWeek
	if (
		settings.get('useUiTime') &&
		!['UTC', 0, undefined].includes(timestampToolsUser.timezone) &&
		!timezone
	) {
		if (timestampToolsUser.isSameAsLocalTimezone) {
			timezoneOffset = -date.getTimezoneOffset()
		} else {
			timezoneOffset =
				typeof timestampToolsUser.timezone === 'number'
					? timestampToolsUser.timezone
					: // Using date-fns-tz's getTimezoneOffset is way faster than using day.js's methods.
						getTimezoneOffset(/** @type {string} */ (timestampToolsUser.timezone), date.getTime()) /
						cd.g.msInMin
		}
		date = new Date(date.getTime() + timezoneOffset * cd.g.msInMin)
	} else if (!timezone || timezone === 'UTC') {
		timezoneOffset = 0
	} else {
		const dayjsDate = dayjs(date).tz(timezone)
		timezoneOffset = dayjsDate.utcOffset()
		year = dayjsDate.year()
		monthIdx = dayjsDate.month()
		day = dayjsDate.date()
		hours = dayjsDate.hour()
		minutes = dayjsDate.minute()
		dayOfWeek = dayjsDate.day()
	}
	year ??= date.getUTCFullYear()
	monthIdx ??= date.getUTCMonth()
	day ??= date.getUTCDate()
	hours ??= date.getUTCHours()
	minutes ??= date.getUTCMinutes()
	dayOfWeek ??= date.getUTCDay()

	let string = ''
	const format = timestampToolsUser.dateFormat
	for (let p = 0; p < format.length; p++) {
		let code = format[p]
		if ((code === 'x' && p < format.length - 1) || (code === 'xk' && p < format.length - 1)) {
			code += format[++p]
		}

		switch (code) {
			case 'xx':
				string += 'x'
				break
			case 'xg':
			case 'F':
			case 'M':
				string += dateTokenToMessageNames[code].map((token) => mw.msg(token))[monthIdx]
				break
			case 'd':
				string += String(day).padStart(2, '0')
				break
			case 'D':
			case 'l': {
				string += dateTokenToMessageNames[code].map((token) => mw.msg(token))[dayOfWeek]
				break
			}
			case 'j':
				string += String(day)
				break
			case 'n':
				string += String(monthIdx + 1)
				break
			case 'Y':
				string += String(year)
				break
			case 'xkY':
				string += String(year + 543)
				break
			case 'G':
				string += String(hours)
				break
			case 'H':
				string += String(hours).padStart(2, '0')
				break
			case 'i':
				string += String(minutes).padStart(2, '0')
				break
			case '\\':
				// Backslash escaping
				string += p < format.length - 1 ? format[++p] : '\\'
				break
			case '"':
				// Quoted literal
				if (p < format.length - 1) {
					const endQuote = format.indexOf('"', p + 1)
					if (endQuote === -1) {
						// No terminating quote, assume literal "
						string += '"'
					} else {
						string += format.substr(p + 1, endQuote - p - 1)
						p = endQuote
					}
				} else {
					// Quote at end of string, assume literal "
					string += '"'
				}
				break
			default:
				string += format[p]
		}
	}

	if (addTimezone) {
		string += generateTimezonePostfix(timezoneOffset)
	}

	return string
}

/**
 * Format a date in the "improved" format.
 *
 * @param {Date} date
 * @param {boolean} addTimezone
 * @returns {string}
 */
export function formatDateImproved(date, addTimezone = false) {
	const timestampToolsUser = cd.g.timestampTools.user
	let now = new Date()
	let dayjsDate = dayjs(date)
	let timezoneOffset
	if (settings.get('useUiTime') && !['UTC', 0, undefined].includes(timestampToolsUser.timezone)) {
		if (timestampToolsUser.isSameAsLocalTimezone) {
			timezoneOffset = -date.getTimezoneOffset()
		} else {
			timezoneOffset =
				typeof timestampToolsUser.timezone === 'number'
					? timestampToolsUser.timezone
					: // Using date-fns-tz's getTimezoneOffset is way faster than using day.js's methods.
						getTimezoneOffset(/** @type {string} */ (timestampToolsUser.timezone), now.getTime()) /
						cd.g.msInMin

			dayjsDate = dayjsDate.utcOffset(timezoneOffset)
		}
		now = new Date(now.getTime() + timezoneOffset * cd.g.msInMin)
	} else {
		timezoneOffset = 0
		dayjsDate = dayjsDate.utc()
	}

	const day = dayjsDate.date()
	const monthIdx = dayjsDate.month()
	const year = dayjsDate.year()

	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const nowDay = now.getUTCDate()
	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const nowMonthIdx = now.getUTCMonth()
	const nowYear = now.getUTCFullYear()

	const yesterday = new Date(now)
	yesterday.setDate(yesterday.getDate() - 1)
	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const yesterdayDay = yesterday.getUTCDate()
	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const yesterdayMonthIdx = yesterday.getUTCMonth()
	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const yesterdayYear = yesterday.getUTCFullYear()

	let formattedDate
	if (day === nowDay && monthIdx === nowMonthIdx && year === nowYear) {
		formattedDate = dayjsDate.format(cd.s('comment-timestamp-today'))
	} else if (day === yesterdayDay && monthIdx === yesterdayMonthIdx && year === yesterdayYear) {
		formattedDate = dayjsDate.format(cd.s('comment-timestamp-yesterday'))
	} else if (year === nowYear) {
		formattedDate = dayjsDate.format(cd.s('comment-timestamp-currentyear'))
	} else {
		formattedDate = dayjsDate.format(cd.s('comment-timestamp-other'))
	}

	if (addTimezone) {
		formattedDate += generateTimezonePostfix(timezoneOffset)
	}

	return formattedDate
}

/**
 * Format a date in the "relative" format.
 *
 * @param {Date} date
 * @returns {string}
 */
export function formatDateRelative(date) {
	const now = Date.now()
	const ms = date.getTime()
	if (ms < now && ms > now - cd.g.msInMin) {
		return cd.s('comment-timestamp-lessthanminute')
	}

	// We have relative dates rounded down (1 hour 59 minutes rounded to 1 hour, not 2 hours), as is
	// the standard across the web, judging by Facebook, YouTube, Twitter, and also Google's guideline
	// on date formats: https://material.io/design/communication/data-formats.html. We also use
	// date-fns here as its locales always have strings with numbers ("1 day ago", not "a day ago"),
	// which, IMHO, are more likely to be perceived as "something in between 24 hours and 48 hours",
	// not "something around 24 hours" (jwbth).
	return formatDistanceToNowStrict(date, {
		addSuffix: true,
		roundingMethod: 'floor',
		locale: cd.i18n[cd.g.userLanguage].dateFnsLocale,
	})
}

/**
 * Provided an end boundary element, make sure the selection doesn't go beyond it.
 *
 * @param {Element} endBoundary
 */
export function limitSelectionAtEndBoundary(endBoundary) {
	const selection = window.getSelection()
	if (selection.containsNode(endBoundary, true)) {
		const { higherNode, higherOffset } = /** @type {HigherNodeAndOffsetInSelection} */ (
			getHigherNodeAndOffsetInSelection(selection)
		)
		selection.setBaseAndExtent(higherNode, higherOffset, endBoundary, 0)
	}
}

/**
 * Combine the section headline, summary text, and, optionally, summary postfix to create an edit
 * summary.
 *
 * @param {object} options
 * @param {string} options.text Summary text. Can be clipped if there is not enough space.
 * @param {string} [options.optionalText] Optional text added to the end of the summary if there is
 *   enough space. Ignored if there is not.
 * @param {string} [options.section] Section name.
 * @param {boolean} [options.addPostfix] Whether to add `cd.g.summaryPostfix` to the summary.
 * @returns {string}
 */
export function buildEditSummary({ text, optionalText, section, addPostfix = true }) {
	let fullText = (section ? `/* ${section} */ ` : '') + text.trim()

	let wasOptionalTextAdded
	if (optionalText) {
		let projectedText = fullText + optionalText

		if (cd.config.transformSummary) {
			projectedText = cd.config.transformSummary(projectedText)
		}

		if (projectedText.length <= cd.g.summaryLengthLimit) {
			fullText = projectedText
			wasOptionalTextAdded = true
		}
	}

	if (!wasOptionalTextAdded) {
		if (cd.config.transformSummary) {
			fullText = cd.config.transformSummary(fullText)
		}

		if (fullText.length > cd.g.summaryLengthLimit) {
			fullText = fullText.slice(0, cd.g.summaryLengthLimit - 1) + '…'
		}
	}

	if (addPostfix) {
		fullText += cd.g.summaryPostfix
	}

	return fullText
}
