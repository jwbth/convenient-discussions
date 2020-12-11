import { DomUtils, parseDOM } from 'htmlparser2';

import cd from './cd';
import { decodeHtmlEntities } from './wikitext';

self.Node = {
  TEXT_NODE: 3,
  ELEMENT_NODE: 1,
};

/**
 * Iterate over child nodes, testing the node using the provided callback.
 *
 * Returns `true` to stop walking through subtree (after founding the required amounts for elements,
 * for instance).
 *
 * @param {Node} base
 * @param {Function} callback
 * @param {boolean} checkSelf
 * @returns {boolean}
 * @private
 */
function walkThroughSubtree(base, callback, checkSelf) {
  if (checkSelf && callback(base)) {
    return true;
  }
  for (let n = base.firstChild; n; n = n.nextSibling) {
    if (walkThroughSubtree(n, callback, true)) {
      return true;
    }
  }
}

/**
 * Get all text nodes under the root element.
 *
 * @returns {Array}
 * @private
 */
function getAllTextNodes() {
  let nodes = [];
  walkThroughSubtree(cd.g.rootElement, (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      nodes.push(node);
    }
  });
  return nodes;
}

const dummyDom = parseDOM('<a>a</a>');
const Element = dummyDom[0].constructor;
const DataNode = dummyDom[0].childNodes[0].constructor;
const NodeConstructor = Object.getPrototypeOf(DataNode);

// We extend the prototype after parsing the html (parsing goes a bit faster with the default
// setup).
Object.defineProperty(Element.prototype, 'childElements', {
  get: function () {
    return this.childNodes.filter((node) => node.nodeType === Node.ELEMENT_NODE);
  },
});

Object.defineProperty(Element.prototype, 'previousElementSibling', {
  get: function () {
    for (let n = this.previousSibling; n; n = n.previousSibling) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        return n;
      }
    }
    return null;
  },
});

Object.defineProperty(Element.prototype, 'nextElementSibling', {
  get: function () {
    for (let n = this.nextSibling; n; n = n.nextSibling) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        return n;
      }
    }
    return null;
  },
});

Object.defineProperty(Element.prototype, 'firstElementChild', {
  get: function () {
    let n;
    for (n = this.firstChild; n && n.nodeType !== Node.ELEMENT_NODE; n = n.nextSibling);
    return n || null;
  },
});

Object.defineProperty(Element.prototype, 'lastElementChild', {
  get: function () {
    let n;
    for (n = this.lastChild; n && n.nodeType !== Node.ELEMENT_NODE; n = n.previousSibling);
    return n || null;
  },
});

Object.defineProperty(Element.prototype, 'textContent', {
  get: function () {
    // const returnValue = DomUtils.getText(this);
    // const returnValue = this.childNodes.map((node) => node.textContent).join('');
    let returnValue = '';
    // This runs pretty often, so we microoptimize it.
    this.childNodes.forEach((node) => {
      returnValue += node.textContent;
    });
    return returnValue;
  },
});

Object.defineProperty(Element.prototype, 'innerHTML', {
  get: function () {
    return DomUtils.getInnerHTML(this);
  },
});

Object.defineProperty(Element.prototype, 'outerHTML', {
  get: function () {
    return DomUtils.getOuterHTML(this);
  },
});

Element.prototype.getAttribute = function (name) {
  let value = this.attribs[name];
  if (value && typeof value === 'string' && value.indexOf('&') !== -1) {
    value = value
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"');
  }
  return value;
};

Element.prototype.setAttribute = function (name, value) {
  if (value && typeof value === 'string') {
    if (value.indexOf('&') !== -1) {
      value = value.replace(/&/g, '&amp;');
    }
    if (value.indexOf('"') !== -1) {
      value = value.replace(/"/g, '&quot;');
    }
  }
  this.attribs[name] = value || '';
};

Element.prototype.removeAttribute = function (name) {
  delete this.attribs[name];
};

Element.prototype.appendChild = function (node) {
  if (node.parentNode) {
    node.remove();
  }
  DomUtils.appendChild(this, node);
};

Element.prototype.insertBefore = function (node, referenceNode) {
  if (referenceNode) {
    if (node.parentNode) {
      node.remove();
    }
    DomUtils.prepend(referenceNode, node);
  } else {
    this.appendChild(node);
  }
};

Element.prototype.removeChild = function (node) {
  if (node.parentNode === this) {
    DomUtils.removeElement(node);
  }
};

Element.prototype.contains = function (node) {
  if (node === this) {
    return true;
  }
  if (!this.childNodes.length) {
    return false;
  }
  for (let n = node; n; n = n.parentNode) {
    if (n === this) {
      return true;
    }
  }
  return false;
};

Element.prototype.follows = function (node) {
  if (this.startIndex && node.startIndex) {
    return this.startIndex > node.startIndex;
  }
  if (this === node) {
    return false;
  }

  const thisTree = [];
  const nodeTree = [];
  let sharedParent;
  let thisSharedParentChild;
  let nodeSharedParentChild;

  for (let current = this; current; current = current.parentNode) {
    if (current === node) {
      return true;
    }
    thisTree.unshift(current);
  }
  for (let current = node; current; current = current.parentNode) {
    nodeTree.unshift(current);
    if (thisTree.includes(current)) {
      sharedParent = current;
      thisSharedParentChild = thisTree[thisTree.indexOf(current) + 1];
      // nodeTree must have at least 2 elements, this is guaranteed by the check
      // "current === node" above.
      nodeSharedParentChild = nodeTree[1];
      break;
    }
  }
  const returnValue = (
    !sharedParent ||
    (
      sharedParent.childNodes.indexOf(thisSharedParentChild) >
      sharedParent.childNodes.indexOf(nodeSharedParentChild)
    )
  );
  // const returnValue = null;
  return returnValue;
};

Object.defineProperty(Element.prototype, 'tagName', {
  get: function () {
    return this.name.toUpperCase();
  },
});

// We have to create a getter as there is no way to access an object from a method of that object's
// property (Element#classList.add() and such in this case).
Object.defineProperty(Element.prototype, 'classList', {
  get: function () {
    if (this._classList) {
      return this._classList;
    } else {
      this._classList = {
        list: [],

        movedFromClassAttr: false,

        moveFromClassAttr(classAttr) {
          this.list = (classAttr || '').split(' ');
          this.movedFromClassAttr = true;
        },

        add: (...names) => {
          names.forEach((name) => {
            let classAttr = this.getAttribute('class') || '';
            if (classAttr) {
              classAttr += ' ';
            }
            classAttr += name;
            this.setAttribute('class', classAttr);
            if (this._classList.movedFromClassAttr) {
              this._classList.list.push(name);
            } else {
              this._classList.moveFromClassAttr(classAttr);
            }
          });
        },

        contains: (name) => {
          const classAttr = this.getAttribute('class');
          if (!classAttr) {
            return false;
          }
          if (!this._classList.movedFromClassAttr) {
            this._classList.moveFromClassAttr(classAttr);
          }

          // This can run tens of thousand times, so we microoptimize it (don't use template strings
          // and String#includes).
          const returnValue = (
            Boolean(this._classList.list.length) &&
            this._classList.list.indexOf(name) !== -1
          );
          return returnValue;
        },
      };
      return this._classList;
    }
  },
});

Element.prototype.getElementsByClassName = function (name, limit, our) {
  let nodes = [];
  walkThroughSubtree(this, (node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains(name, our)) {
      nodes.push(node);
      if (limit && nodes.length === limit) {
        return true;
      }
    }
  });
  return nodes;
};

Element.prototype.getElementsByTagName = function (name) {
  return DomUtils.getElementsByTagName(name, this);
};

Object.defineProperty(DataNode.prototype, 'textContent', {
  get: function () {
    return decodeHtmlEntities(this.data);
  },
  set: function (value) {
    this.data = value;
  },
});

NodeConstructor.prototype.remove = function () {
  // removeElement doesn't clean up "prev" and "next".
  DomUtils.removeElement(this);
  this.prev = null;
  this.next = null;
};

// We need the "Document" class to imitate window.document for the code to be more easily ported to
// other library if needed. Here, we also extend the prototype of the Element and DataNode classes
// that htmlparser2 library uses. Note that the Element class already has the "children" property
// containing all child nodes, which differs from what this property stands for in the browser DOM
// representation (only element children), but we can't replace it as it would intervene in the
// internal workings of the class. So we use the "childElements" property instead for this purpose.
class Document extends Element {
  constructor(dom) {
    super('body', {});
    for (const el of dom) {
      this.appendChild(el);
    }
  }

  createElement(name) {
    return new Element(name, {});
  }

  createTextNode(content) {
    return new DataNode('text', content);
  }
}

Document.prototype.getElementsByClassName = Element.prototype.getElementsByClassName;

self.Document = Document;

export { getAllTextNodes, parseDOM };
