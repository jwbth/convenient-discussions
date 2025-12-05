import { isText } from 'domhandler'

import CommentSkeleton from '../shared/CommentSkeleton'
import { isElement, isHeadingNode, isMetadataNode } from '../shared/utils-general'

import { keepSafeKeys } from './worker'

/**
 * Comment class used in the worker scope.
 *
 * @augments {CommentSkeleton<import('domhandler').Node>}
 */
export default class CommentWorker extends CommentSkeleton {
	/**
	 * @typedef {object} HiddenElementData
	 * @property {string} type
	 * @property {string} tagName
	 * @property {string} html
	 */

	/** @type {HiddenElementData[]} */
	hiddenElementsData

	/** @type {string[]} */
	elementHtmls

	/** @type {string} */
	htmlToCompare

	/** @type {string} */
	textHtmlToCompare

	/** @type {string} */
	headingHtmlToCompare

	/** @type {string} */
	text

	/** @type {string[]} */
	elementNames

	/** @type {string[]} */
	elementClassNames

	/** @type {CommentWorker[]} */
	children

	/** @type {CommentWorker[]} */
	previousComments

	/** @type {CommentWorker|undefined} */
	parent

	/** @type {boolean|undefined} */
	isToMe

	/**
	 * @override
	 * @type {import('./SectionWorker').default | undefined}
	 */
	// @ts-expect-error: TS incorrectly flags this as circular, but parent fields initialize first
	section = this.section

	/**
	 * @override
	 * @type {import('domhandler').Element}
	 */
	// @ts-expect-error: TS incorrectly flags this as circular, but parent fields initialize first
	signatureElement = this.signatureElement

	/**
	 * @override
	 * @type {import('domhandler').Element[]}
	 */
	// @ts-expect-error: TS incorrectly flags this as circular, but parent fields initialize first
	elements = this.elements

	/**
	 * Remove unnecessary content, hide dynamic content in a comment.
	 */
	filterCommentContent() {
		this.hiddenElementsData = []
		this.elementHtmls = this.elements.map((/** @type {import('domhandler').Element} */ element) => {
			if (isHeadingNode(element)) {
				// Keep only the headline, as other elements contain dynamic identifiers.
				this.processHeadingElement(element)
			}

			// Data attributes may include dynamic components, for example
			// https://ru.wikipedia.org/wiki/Проект:Знаете_ли_вы/Подготовка_следующего_выпуска.
			this.processElementAttributes(element)

			if (element.classList.contains('references') || isMetadataNode(element)) {
				return /** @type {import('domhandler').Element} */ (this.hideElement(element)).textContent
			}
			this.processReferenceElements(element)

			return element.outerHTML
		})
	}

	/**
	 * Add properties to a comment that will be used to compare its content to the content of a
	 * comment in another revision.
	 */
	addCompareHelperProperties() {
		/*
			One of the reasons for the existence of this function is that we can't use `outerHTML` for
			comparing comment revisions as the difference may be in <div> vs. <dd> (<li>) tags in this case:

			This creates a <dd> tag:

				: Comment. [signature]

			This creates a <div> tag for the first comment:

				: Comment. [signature] :: Reply. [signature]

			So the HTML is `<dd><div>...</div><dl>...</dl></dd>`. A newline also appears before `</div>`, so
			we need to trim.
		*/
		this.initializeCompareProperties()

		this.elements.forEach((element) => {
			this.processSvgElements(element)
			this.processTimestampElements(element)
			this.updateCompareProperties(element, this.getElementHtmlToCompare(element))
		})

		this.finalizeCompareProperties()
	}

	/**
	 * Process a heading element by keeping only the headline, as other elements contain dynamic identifiers.
	 *
	 * @param {import('domhandler').Element} element
	 * @private
	 */
	processHeadingElement(element) {
		let headlineElement = [...element.getElementsByClassName('mw-headline', 1)].at(0)
		if (!headlineElement) {
			headlineElement = [...element.querySelectorAll('h1, h2, h3, h4, h5, h6')].at(0)
		}
		if (headlineElement) {
			// Was removed in 2021, see T284921. Keep this for some time.
			headlineElement.getElementsByClassName('mw-headline-number', 1)[0]?.remove()

			// Use `[...iterable]`, as childNodes is a live collection, and when an element is removed
			// or moved, indexes will change.
			;[...element.childNodes].forEach((el) => {
				el.remove()
			})
			;[...headlineElement.childNodes].forEach(element.appendChild.bind(element))
		}
	}

	/**
	 * Remove the element's attributes whose names start with `data-` and IDs added by Parsoid. Also
	 * remove empty comment anchors and comment nodes.
	 *
	 * @param {import('domhandler').Element} element
	 * @private
	 */
	processElementAttributes(element) {
		CommentWorker.removeDataAndParsoidAttributes(element)
		element
			.getElementsByAttribute(/^data-|^id$/)
			.forEach(CommentWorker.removeDataAndParsoidAttributes)

		// Empty comment anchors, in most cases added by the script.
		element
			.querySelectorAll('span')
			.filter((el) => el.attribs.id && Object.keys(el.attribs).length === 1 && !el.textContent)
			.forEach((el) => {
				el.remove()
			})

		// Remove comment nodes
		element
			.filterRecursively((node) => node.nodeType === Node.COMMENT_NODE)
			.forEach((node) => {
				node.remove()
			})
	}

	/**
	 * Hide reference, autonumber, and metadata nodes recursively.
	 *
	 * @param {import('domhandler').Element} element
	 * @private
	 */
	processReferenceElements(element) {
		const filteredElements = /** @type {import('domhandler').Element[]} */ (
			element.filterRecursively(
				(node) =>
					isElement(node) &&
					(['autonumber', 'reference', 'references'].some((name) =>
						node.classList.contains(name),
					) ||
						isMetadataNode(node)),
			)
		)
		filteredElements.forEach((el) => {
			this.hideElement(el)
		})
	}

	/**
	 * Initialize properties used for comparison.
	 *
	 * @private
	 */
	initializeCompareProperties() {
		this.htmlToCompare = ''
		this.textHtmlToCompare = ''
		this.headingHtmlToCompare = ''
	}

	/**
	 * Remove SVG elements (Extension:Charts uses dynamically generated class names).
	 *
	 * @param {import('domhandler').Element} element
	 * @private
	 */
	processSvgElements(element) {
		element.getElementsByTagName('svg').forEach((svg) => {
			svg.remove()
		})
	}

	/**
	 * Remove attributes from timestamp links that may change (`href`, `title`).
	 *
	 * @param {import('domhandler').Element} element
	 * @private
	 */
	processTimestampElements(element) {
		element.getElementsByClassName('ext-discussiontools-init-timestamplink').forEach((link) => {
			// The link may change
			link.removeAttribute('href')

			// There is a relative date in the tooltip
			link.removeAttribute('title')
		})
	}

	/**
	 * Get HTML to compare for an element.
	 *
	 * @param {import('domhandler').Element} element
	 * @returns {string}
	 * @private
	 */
	getElementHtmlToCompare(element) {
		if (element.tagName === 'DIV' && !element.classList.contains('mw-heading')) {
			// Workaround the bug where the {{smalldiv}} output (or any <div> wrapper around the
			// comment) is treated differently depending on whether there are replies to that comment.
			// When there are no, a <li>/<dd> element containing the <div> wrapper is the only comment
			// part; when there are, the <div> wrapper is.
			element.classList.remove('cd-comment-part', 'cd-comment-part-first', 'cd-comment-part-last')
			if (!element.getAttribute('class')) {
				element.removeAttribute('class')
			}
			if (Object.keys(element.attribs).length && element.className !== 'cd-comment-replacedPart') {
				if (element.lastChild && isText(element.lastChild) && element.lastChild.data === '\n') {
					element.lastChild.remove()
				}

				return element.outerHTML
			}

			return element.innerHTML
		}

		return element.innerHTML || element.textContent
	}

	/**
	 * Update comparison properties with element HTML.
	 *
	 * @param {import('domhandler').Element} element
	 * @param {string} htmlToCompare
	 * @private
	 */
	updateCompareProperties(element, htmlToCompare) {
		this.htmlToCompare += htmlToCompare + '\n'
		if (isHeadingNode(element)) {
			this.headingHtmlToCompare += htmlToCompare
		} else {
			this.textHtmlToCompare += htmlToCompare + '\n'
		}
	}

	/**
	 * Finalize comparison properties.
	 *
	 * @private
	 */
	finalizeCompareProperties() {
		this.htmlToCompare = this.htmlToCompare.trim()
		this.textHtmlToCompare = this.textHtmlToCompare.trim()
		this.headingHtmlToCompare = this.headingHtmlToCompare.trim()

		this.signatureElement.remove()

		this.text = this.elements
			.map((el) => el.textContent)
			.join('\n')
			.trim()

		this.elementNames = this.elements.map((el) => el.tagName)
		this.elementClassNames = this.elements.map((el) => el.className)
	}

	/**
	 * Replace a comment element with a marker.
	 *
	 * @param {import('domhandler').Element} element
	 * @returns {import('domhandler').Element | undefined}
	 * @private
	 */
	hideElement(element) {
		if (!this.elements.includes(element)) {
			return
		}

		let type
		if (element.classList.contains('reference')) {
			type = 'reference'
		} else if (element.classList.contains('references')) {
			type = 'references'
		} else if (element.classList.contains('autonumber')) {
			type = 'autonumber'
		} else {
			type = 'templateStyles'
		}

		const num = /** @type {HiddenElementData[]} */ (this.hiddenElementsData).push({
			type,
			tagName: element.tagName,
			html: element.outerHTML,
		})
		const span = document.createElement('span')
		span.textContent = `\u0001${num}_${type}\u0002`
		// span.before(element);
		element.remove()

		this.elements[this.elements.indexOf(element)] = span

		return span
	}

	/**
	 * Remove the element's attributes whose names start with `data-` and IDs added by Parsoid.
	 *
	 * @param {import('domhandler').Element} element
	 * @private
	 */
	static removeDataAndParsoidAttributes = (element) => {
		Object.keys(element.attribs).forEach((name) => {
			if (name.startsWith('data-') || (name === 'id' && /^mw.{2,3}$/.test(element.attribs[name]))) {
				element.removeAttribute(name)
			}
		})
	}

	/**
	 * Prepare comments for transferring to the main process.
	 *
	 * @param {CommentWorker[]} comments
	 */
	static tweakComments(comments) {
		comments.forEach((comment) => {
			comment.filterCommentContent()
			comment.addCompareHelperProperties()
		})

		comments.forEach((comment, i) => {
			comment.children = comment.getChildren()
			comment.children.forEach((reply) => {
				reply.parent = comment
				reply.isToMe = comment.isOwn
			})

			comment.previousComments = comments.slice(Math.max(0, i - 2), i).reverse()

			keepSafeKeys(comment, [
				'authorLink',
				'authorTalkLink',
				'cachedParent',
				'elements',
				'extraSignatures',
				'highlightables',
				'parser',
				'parts',
				'signatureElement',
				'timestampElement',
				'getListsUpTree',
			])
		})
	}
}
