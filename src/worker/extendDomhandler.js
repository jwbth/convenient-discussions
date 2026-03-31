/* eslint-disable unicorn/prefer-dom-node-append */
/* eslint-disable unicorn/prefer-includes */
import { DataNode, Document, Element, Node, NodeWithChildren, Text } from 'domhandler'
import { DomUtils } from 'htmlparser2'

import { decodeHtmlEntities } from '../shared/utils-general'

self.Node = Node

Node.ELEMENT_NODE = 1
Node.TEXT_NODE = 3
Node.COMMENT_NODE = 8

/**
 * @param {import('domhandler').ChildNode} referenceNode
 */
Node.prototype.after = function after(referenceNode) {
	DomUtils.append(referenceNode, /** @type {import('domhandler').ChildNode} */ (this))
}

/**
 * @param {import('domhandler').ChildNode} referenceNode
 */
Node.prototype.before = function before(referenceNode) {
	DomUtils.prepend(referenceNode, /** @type {import('domhandler').ChildNode} */ (this))
}

Node.prototype.remove = function remove() {
	DomUtils.removeElement(/** @type {import('domhandler').ChildNode} */ (this))
}

/**
 * @param {Node} node
 * @returns {boolean}
 */
Node.prototype.follows = function follows(node) {
	return Boolean(
		DomUtils.compareDocumentPosition(
			/** @type {import('domhandler').AnyNode} */ (this),
			/** @type {import('domhandler').AnyNode} */ (node),
		) & 4 /* FOLLOWING */,
	)
}

/**
 * @param {(node: Node) => boolean} callback
 * @param {boolean} [checkSelf]
 * @returns {boolean}
 */
Node.prototype.traverseSubtree = function traverseSubtree(callback, checkSelf = false) {
	if (checkSelf && callback(this)) {
		return true
	}

	if (this instanceof NodeWithChildren) {
		for (let n = this.firstChild; n; n = n.nextSibling) {
			if (n.traverseSubtree(callback, true)) {
				return true
			}
		}
	}

	return false
}

Object.defineProperty(Node.prototype, 'textContent', {
	/**
	 * @returns {''}
	 */
	get() {
		return ''
	},
})

Object.defineProperty(Node.prototype, 'parentElement', {
	/**
	 * @this {Node}
	 * @returns {?Element}
	 */
	get() {
		return this.parentNode instanceof Element ? this.parentNode : null
	},
})

Object.defineProperty(DataNode.prototype, 'textContent', {
	/**
	 * @returns {string}
	 */
	get() {
		return decodeHtmlEntities(this.data)
	},

	/**
	 * @this {DataNode}
	 * @param {string} value
	 */
	set(value) {
		this.data = value
	},
})

/**
 * @param {Node} node
 * @returns {boolean}
 */
NodeWithChildren.prototype.contains = function contains(node) {
	if (node === this) {
		return true
	}

	if (!this.childNodes.length) {
		return false
	}

	for (let /** @type {Node | null} */ n = node; n; n = n.parentNode) {
		if (n === this) {
			return true
		}
	}

	return false
}

/**
 * @param {(node: Node) => boolean} callback Callback function that takes a node and returns true if
 *   it should be included in the result.
 * @param {number} [limit] Maximum number of nodes to include in the result.
 * @returns {Node[]} Array of nodes that passed the callback function.
 */
NodeWithChildren.prototype.filterRecursively = function filterRecursively(callback, limit) {
	const nodes = /** @type {Node[]} */ ([])
	this.traverseSubtree((node) => {
		if (callback(node)) {
			nodes.push(node)

			return Boolean(limit && nodes.length === limit)
		}

		return false
	})

	return nodes
}

/**
 * @param {import('domhandler').ChildNode} node
 */
Element.prototype.appendChild = function appendChild(node) {
	DomUtils.appendChild(this, node)
}

/**
 * @param {import('domhandler').ChildNode} node
 * @param {import('domhandler').ChildNode|undefined} referenceNode
 * @returns {Node}
 */
Element.prototype.insertBefore = function insertBefore(node, referenceNode) {
	if (referenceNode) {
		DomUtils.prepend(referenceNode, node)
	} else {
		this.appendChild(node)
	}

	return node
}

/**
 * @param {string} name
 * @param {number} [limit]
 * @returns {Element[]}
 */
Element.prototype.getElementsByClassName = function getElementsByClassName(name, limit) {
	return /** @type {Element[]} */ (
		this.filterRecursively(
			(node) => node instanceof Element && node.classList.contains(name),
			limit,
		)
	)
}

/**
 * @param {RegExp} regexp
 * @returns {Element[]}
 */
Element.prototype.getElementsByAttribute = function getElementsByAttribute(regexp) {
	return /** @type {Element[]} */ (
		this.filterRecursively(
			(node) =>
				node instanceof Element && Object.keys(node.attribs).some((name) => regexp.test(name)),
		)
	)
}

/**
 * @param {string} selector
 * @returns {Element[]}
 */
Element.prototype.querySelectorAll = function querySelectorAll(selector) {
	const tokens = selector.split(/ *, */)
	const tagNames = new Set(
		tokens.filter((token) => !token.startsWith('.')).map((name) => name.toUpperCase()),
	)
	const classNames = tokens.filter((token) => token.startsWith('.')).map((name) => name.slice(1))

	return /** @type {Element[]} */ (
		this.filterRecursively(
			(node) =>
				node instanceof Element &&
				(tagNames.has(node.tagName) || classNames.some((name) => node.classList.contains(name))),
		)
	)
}

/**
 * @param {string} name
 * @returns {Element[]}
 */
Element.prototype.getElementsByTagName = function getElementsByTagName(name) {
	return DomUtils.getElementsByTagName(name, this)
}

// Note that the Element class already has the `children` property containing all child nodes, which
// differs from what this property stands for in the browser DOM representation (only child nodes
// that are elements), but we can't replace it as it would intervene in the internal workings of the
// class. So we use the `childElements` property instead for this purpose.
Object.defineProperty(Element.prototype, 'childElements', {
	/**
	 * Get all child nodes of the element that are elements themselves (not, for example, text nodes
	 * or comment nodes). This property is different from the `children` property, which, in the
	 * `domhandler` library, contains all child nodes including non-element nodes.
	 *
	 * @this {Element}
	 * @returns {Element[]}
	 * @readonly
	 */
	get() {
		return this.childNodes.filter((node) => node instanceof Element)
	},
})

Object.defineProperty(Element.prototype, 'previousElementSibling', {
	/**
	 * Get the previous sibling node of the element that is an element itself (not, for example, a
	 * text node or comment node).
	 *
	 * @this {Element}
	 * @returns {?Element}
	 * @readonly
	 */
	get() {
		for (let n = this.previousSibling; n; n = n.previousSibling) {
			if (n instanceof Element) {
				return n
			}
		}

		return null
	},
})

Object.defineProperty(Element.prototype, 'nextElementSibling', {
	/**
	 * Get the next sibling node of the element that is an element itself (not, for example, a text
	 * node or comment node).
	 *
	 * @this {Element}
	 * @returns {?Element}
	 * @readonly
	 */
	get() {
		for (let n = this.nextSibling; n; n = n.nextSibling) {
			if (n instanceof Element) {
				return n
			}
		}

		return null
	},
})

Object.defineProperty(Element.prototype, 'firstElementChild', {
	/**
	 * Get the first child node of the element that is an element itself (not, for example, a text
	 * node or comment node).
	 *
	 * @this {Element}
	 * @returns {?Element}
	 * @readonly
	 */
	get() {
		let element
		for (let n = this.firstChild; n; n = n.nextSibling) {
			if (n instanceof Element) {
				element = n
			}
		}

		return element || null
	},
})

Object.defineProperty(Element.prototype, 'lastElementChild', {
	/**
	 * Get the last child node of the element that is an element itself (not, for example, a text
	 * node or comment node).
	 *
	 * @this {Element}
	 * @returns {?Element}
	 * @readonly
	 */
	get() {
		let element
		for (let n = this.lastChild; n; n = n.previousSibling) {
			if (n instanceof Element) {
				element = n
			}
		}

		return element || null
	},
})

Object.defineProperty(Element.prototype, 'textContent', {
	/**
	 * Get the text content of the element (all child nodes, not only text nodes).
	 *
	 * @this {Element}
	 * @returns {string}
	 * @readonly
	 */
	get() {
		// This runs pretty often, so we microoptimize it. Using DomUtils.textContent or Array#map() +
		// Array#join() would take longer.
		return this.childNodes.reduce(
			(text, node) => text + ('textContent' in node ? node.textContent : ''),
			'',
		)
	},

	set(value) {
		this.childNodes.forEach((/** @type {Node} */ node) => {
			node.remove()
		})
		this.appendChild(new Text(value || ''))
	},
})

Object.defineProperty(Element.prototype, 'innerHTML', {
	get() {
		// decodeEntities acts opposite to its value ¯\_(ツ)_/¯
		return DomUtils.getInnerHTML(this, { decodeEntities: false })
	},
})

Object.defineProperty(Element.prototype, 'outerHTML', {
	get() {
		// decodeEntities acts opposite to its value ¯\_(ツ)_/¯
		return DomUtils.getOuterHTML(this, { decodeEntities: false })
	},
})

/**
 * @param {string} name
 * @returns {boolean}
 * @readonly
 */
Element.prototype.hasAttribute = function hasAttribute(name) {
	return typeof this.attribs[name] !== 'undefined'
}

/**
 * @param {string} name
 * @returns {?string}
 * @readonly
 */
Element.prototype.getAttribute = function getAttribute(name) {
	let value = this.attribs[name] || null
	if (value && typeof value === 'string' && value.includes('&')) {
		value = value.replace(/&amp;/g, '&').replace(/&quot;/g, '"')
	}

	return value
}

/**
 * @param {string} name
 * @param {string} value
 */
Element.prototype.setAttribute = function setAttribute(name, value) {
	if (value && typeof value === 'string') {
		if (value.includes('&')) {
			value = value.replace(/&/g, '&amp;')
		}
		if (value.includes('"')) {
			value = value.replace(/"/g, '&quot;')
		}
	}
	this.attribs[name] = value || ''
}

/**
 * @param {string} name
 */
Element.prototype.removeAttribute = function removeAttribute(name) {
	delete this.attribs[name]
}

Object.defineProperty(Element.prototype, 'tagName', {
	get() {
		return this.name.toUpperCase()
	},
})

// We have to create a getter as there is no way to access an object from a method of that object's
// property (Element#classList.add() and such in this case).
Object.defineProperty(Element.prototype, 'classList', {
	/**
	 * Retrieves or initializes the `_classList` property for the element. The `_classList` is an
	 * array that manages the class names of the element, providing methods to add, remove, and check
	 * for class names. If `_classList` is not already initialized, it sets up the methods:
	 *   - `moveFromClassAttr`: Moves class names from the `class` attribute to `_classList`.
	 *   - `add`: Adds one or more class names to the element.
	 *   - `remove`: Removes one or more class names from the element.
	 *   - `contains`: Checks if a class name exists in the element's class list.
	 *
	 * @this {Element}
	 * @returns {import('domhandler').TokenList} The `_classList` array with methods for class
	 *   manipulation.
	 */
	get() {
		if (!this._classList) {
			/** @private */
			this._classList = /** @type {import('domhandler').TokenList} */ (/** @type {string[]} */ ([]))
			const classList = this._classList

			classList.movedFromClassAttr = false

			classList.moveFromClassAttr = (/** @type {string|undefined} */ classAttr) => {
				classList.push(...(classAttr || '').split(' '))
				classList.movedFromClassAttr = true
			}

			classList.add = (/** @type {string[]} */ ...names) => {
				names.forEach((name) => {
					let classAttr = this.getAttribute('class') || ''
					if (classAttr) {
						classAttr += ' '
					}
					classAttr += name
					this.setAttribute('class', classAttr)
					if (classList.movedFromClassAttr) {
						classList.push(name)
					} else {
						classList.moveFromClassAttr(classAttr)
					}
				})
			}

			classList.remove = (/** @type {string[]} */ ...names) => {
				names.forEach((name) => {
					let classAttr = this.getAttribute('class') || ''
					const index = ` ${classAttr} `.indexOf(` ${name} `)
					if (index !== -1) {
						classAttr = (
							classAttr.slice(0, index) + classAttr.slice(index + name.length + 1)
						).trim()
						this.setAttribute('class', classAttr)
						if (classList.movedFromClassAttr) {
							classList.push(name)
						} else {
							classList.moveFromClassAttr(classAttr)
						}
					}
				})
			}

			classList.contains = (/** @type {string} */ name) => {
				const classAttr = this.getAttribute('class')
				if (!classAttr) {
					return false
				}

				if (!classList.movedFromClassAttr) {
					classList.moveFromClassAttr(classAttr)
				}

				// This can run tens of thousand times, so we microoptimize it (don't use template strings
				// and String#includes()).
				return Boolean(classList.length) && classList.includes(name)
			}
		}

		return this._classList
	},
})

Object.defineProperty(Element.prototype, 'className', {
	get() {
		return this.getAttribute('class')
	},

	set(value) {
		this.setAttribute('class', value)
	},
})

// We need the Document class to imitate window.document for the code to be more easily ported to
// other library if needed.

/**
 * @param {string} name Tag name of the element.
 * @returns {Element} The created element.
 */
Document.prototype.createElement = function createElement(name) {
	return new Element(name, {})
}

/**
 * @param {string} [content]
 * @returns {Text}
 */
Document.prototype.createTextNode = function createTextNode(content = '') {
	return new Text(content)
}

Document.prototype.getElementsByClassName = Element.prototype.getElementsByClassName.bind(Element)
Document.prototype.querySelectorAll = Element.prototype.querySelectorAll.bind(Element)
