import { DataNode, Document, Element, Node, NodeWithChildren, Text } from 'domhandler';
import { DomUtils } from 'htmlparser2';

import { decodeHtmlEntities } from '../utils-general';

self.Node = Node;

Node.ELEMENT_NODE = 1;
Node.TEXT_NODE = 3;
Node.COMMENT_NODE = 8;

/**
 * @param {Node} referenceNode
 */
Node.prototype.after = function (referenceNode) {
  DomUtils.append(referenceNode, this);
};

/**
 * @param {Node} referenceNode
 */
Node.prototype.before = function (referenceNode) {
  DomUtils.prepend(referenceNode, this);
};

Node.prototype.remove = function () {
  DomUtils.removeElement(this);
};

/**
 * @param {Node} node
 * @returns {boolean}
 */
Node.prototype.follows = function (node) {
  return Boolean(DomUtils.compareDocumentPosition(this, node) & DomUtils.DocumentPosition.FOLLOWING);
};

Object.defineProperty(Node.prototype, 'textContent', {
  /**
   * @returns {''}
   */
  get() {
    return '';
  },
});

Object.defineProperty(Node.prototype, 'parentElement', {
  /**
   * @this {Node}
   * @returns {?Element}
   */
  get() {
    return this.parentNode instanceof Element ? this.parentNode : null;
  },
});

Object.defineProperty(DataNode.prototype, 'textContent', {
  /**
   * @returns {string}
   */
  get() {
    return decodeHtmlEntities(this.data);
  },

  /**
   * @this {DataNode}
   * @param {string} value
   */
  set(value) {
    this.data = value;
  },
});

/**
 * @param {Node} node
 * @returns {boolean}
 */
NodeWithChildren.prototype.contains = function (node) {
  if (node === this) {
    return true;
  }

  if (!this.childNodes.length) {
    return false;
  }

  for (let /** @type {?Node} */ n = node; n; n = n.parentNode) {
    if (n === this) {
      return true;
    }
  }

  return false;
};

/**
 * @param {(node: Node) => boolean} callback
 * @param {boolean} [checkSelf=false]
 * @returns {boolean}
 */
NodeWithChildren.prototype.traverseSubtree = function (callback, checkSelf = false) {
 if (checkSelf && callback(this)) {
   return true;
 }

  for (let n = this.firstChild; n; n = n.nextSibling) {
    if (n instanceof NodeWithChildren && n.traverseSubtree(callback, true)) {
      return true;
    }
  }

  return false;
};

/**
 * @param {(node: Node) => boolean} callback Callback function that takes a node and returns true if
 *   it should be included in the result.
 * @param {number} [limit] Maximum number of nodes to include in the result.
 * @returns {Node[]} Array of nodes that passed the callback function.
 */
NodeWithChildren.prototype.filterRecursively = function (callback, limit) {
  const nodes = [];
  this.traverseSubtree((node) => {
    if (callback(node)) {
      nodes.push(node);
      return Boolean(limit && nodes.length === limit);
    }

    return false;
  });

  return nodes;
};

/**
 * @param {Node} node
 */
Element.prototype.appendChild = function (node) {
  DomUtils.appendChild(this, node);
};

/**
 * @param {Node} node
 */
Element.prototype.removeChild = function (node) {
  if (node.parentNode === this) {
    DomUtils.removeElement(node);
  }
};

/**
 * @param {Node} node
 * @param {Node|undefined} referenceNode
 * @returns {Node}
 */
Element.prototype.insertBefore = function (node, referenceNode) {
  if (referenceNode) {
    DomUtils.prepend(referenceNode, node);
  } else {
    this.appendChild(node);
  }

  return node;
};

Element.prototype.getElementsByClassName = function (name, limit) {
  return /** @type {Element[]} */ (this.filterRecursively(
    (node) => node instanceof Element && node.classList.contains(name),
    limit
  ));
};

/**
 * @param {RegExp} regexp
 * @returns {Element[]}
 */
Element.prototype.getElementsByAttribute = function (regexp) {
  return /** @type {Element[]} */ (this.filterRecursively(
    (node) => node instanceof Element && Object.keys(node.attribs).some((name) => regexp.test(name))
  ));
};

/**
 * @param {string} selector
 * @returns {Element[]}
 */
Element.prototype.querySelectorAll = function (selector) {
  const tokens = selector.split(/ *, */);
  const tagNames = tokens
    .filter((token) => !token.startsWith('.'))
    .map((name) => name.toUpperCase());
  const classNames = tokens
    .filter((token) => token.startsWith('.'))
    .map((name) => name.slice(1));

  return /** @type {Element[]} */ (this.filterRecursively((node) =>
    node instanceof Element &&
    (
      tagNames.includes(node.tagName) ||
      classNames.some((name) => node.classList.contains(name))
    )
  ));
};

Element.prototype.getElementsByTagName = function (name) {
  return DomUtils.getElementsByTagName(name, this);
};

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
    return this.childNodes.filter((node) => node instanceof Element);
  },
});

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
        return n;
      }
    }

    return null;
  },
});

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
        return n;
      }
    }

    return null;
  },
});

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
    let element;
    for (let n = this.firstChild; n; n = n.nextSibling) {
      if (n instanceof Element) {
        element = n;
      }
    }

    return element || null;
  },
});

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
    let element;
    for (let n = this.lastChild; n; n = n.previousSibling) {
      if (n instanceof Element) {
        element = n;
      }
    }

    return element || null;
  },
});

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
      ''
    );
  },

  set(value) {
    this.childNodes.forEach((node) => {
      node.remove();
    });
    this.appendChild(new Text(value || ''));
  },
});

Object.defineProperty(Element.prototype, 'innerHTML', {
  get() {
    // decodeEntities acts opposite to its value ¯\_(ツ)_/¯
    return DomUtils.getInnerHTML(this, { decodeEntities: false });
  },
});

Object.defineProperty(Element.prototype, 'outerHTML', {
  get() {
    // decodeEntities acts opposite to its value ¯\_(ツ)_/¯
    return DomUtils.getOuterHTML(this, { decodeEntities: false });
  },
});

/**
 * @param {string} name
 * @returns {boolean}
 * @readonly
 */
Element.prototype.hasAttribute = function (name) {
  return this.attribs[name] !== undefined;
};

/**
 * @param {string} name
 * @returns {?string}
 * @readonly
 */
Element.prototype.getAttribute = function (name) {
  let value = this.attribs[name] || null;
  if (value && typeof value === 'string' && value.indexOf('&') !== -1) {
    value = value
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"');
  }

  return value;
};

/**
 * @param {string} name
 * @param {string} value
 */
Element.prototype.setAttribute = function (name, value) {
  if (value && typeof value === 'string') {
    if (value.indexOf('&') !== -1) {
      value = value.replace(/&/g, '&amp;');
    }
    if (value.indexOf('"') !== -1) {
      value = value.replace(/"/g, '&quot;');
    }
  }
  this.attribs[name] = String(value) || '';
};

/**
 * @param {string} name
 */
Element.prototype.removeAttribute = function (name) {
  delete this.attribs[name];
};

Object.defineProperty(Element.prototype, 'tagName', {
  get() {
    return this.name.toUpperCase();
  },
});

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
   * manipulation.
   */
  get() {
    if (!this._classList) {
      /** @private */
      this._classList = /** @type {import('domhandler').TokenList} */ (/** @type {string[]} */ ([]));

      this._classList.movedFromClassAttr = false;

      this._classList.moveFromClassAttr = (/** @type {string|undefined} */ classAttr) => {
        this._classList.push(...(classAttr || '').split(' '));
        this._classList.movedFromClassAttr = true;
      };

      this._classList.add = (/** @type {string[]} */ ...names) => {
        names.forEach((name) => {
          let classAttr = this.getAttribute('class') || '';
          if (classAttr) {
            classAttr += ' ';
          }
          classAttr += name;
          this.setAttribute('class', classAttr);
          if (this._classList.movedFromClassAttr) {
            this._classList.push(name);
          } else {
            this._classList.moveFromClassAttr(classAttr);
          }
        });
      };

      this._classList.remove = (/** @type {string[]} */...names) => {
        names.forEach((name) => {
          let classAttr = this.getAttribute('class') || '';
          const index = ` ${classAttr} `.indexOf(` ${name} `);
          if (index !== -1) {
            classAttr = (
              classAttr.slice(0, index) + classAttr.slice(index + name.length + 1)
            ).trim();
            this.setAttribute('class', classAttr);
            if (this._classList.movedFromClassAttr) {
              this._classList.push(name);
            } else {
              this._classList.moveFromClassAttr(classAttr);
            }
          }
        });
      };

      this._classList.contains = (/** @type {string} */ name) => {
        const classAttr = this.getAttribute('class');
        if (!classAttr) {
          return false;
        }

        if (!this._classList.movedFromClassAttr) {
          this._classList.moveFromClassAttr(classAttr);
        }

        // This can run tens of thousand times, so we microoptimize it (don't use template strings
        // and String#includes()).
        const returnValue = Boolean(this._classList.length) && this._classList.indexOf(name) !== -1;

        return returnValue;
      };
    }

    return this._classList;
  },
});

Object.defineProperty(Element.prototype, 'className', {
  get() {
    return this.getAttribute('class');
  },

  set(value) {
    this.setAttribute('class', value);
  },
});

// We need the Document class to imitate window.document for the code to be more easily ported to
// other library if needed.

/**
 * @param {string} name Tag name of the element.
 * @returns {Element} The created element.
 */
Document.prototype.createElement = function (name) {
  return new Element(name, {});
};

/**
 * @param {string} [content='']
 * @returns {Text}
 */
Document.prototype.createTextNode = function (content = '') {
  return new Text(content);
};

Document.prototype.getElementsByClassName = Element.prototype.getElementsByClassName;
Document.prototype.querySelectorAll = Element.prototype.querySelectorAll;

export { DataNode, Document, Element, Node, NodeWithChildren, Text };
