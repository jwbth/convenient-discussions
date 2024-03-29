import { DomUtils, parseDocument } from 'htmlparser2';

import { decodeHtmlEntities } from './utils-general';

self.Node = {
  ELEMENT_NODE: 1,
  TEXT_NODE: 3,
  COMMENT_NODE: 8,
};

/**
 * Iterate over child nodes, testing the node using the provided callback.
 *
 * Returns `true` to stop walking through subtree (after founding the required amounts for elements,
 * for instance).
 *
 * @param {external:Node} base
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

const dummyDocument = parseDocument('<a>a</a>');
const Document = dummyDocument.constructor;
const firstElement = dummyDocument.childNodes[0];
const Element = firstElement.constructor;
const Text = firstElement.childNodes[0].constructor;
const NodeConstructor = Object.getPrototypeOf(Object.getPrototypeOf(Text));

// Note that the Element class already has the "children" property containing all child nodes, which
// differs from what this property stands for in the browser DOM representation (only child nodes
// that are elements), but we can't replace it as it would intervene in the internal workings of the
// class. So we use the "childElements" property instead for this purpose.
Object.defineProperty(Element.prototype, 'childElements', {
  get: function () {
    return this.childNodes.filter((node) => node.tagName);
  },
});

Object.defineProperty(Element.prototype, 'previousElementSibling', {
  get: function () {
    for (let n = this.previousSibling; n; n = n.previousSibling) {
      if (n.tagName) {
        return n;
      }
    }
    return null;
  },
});

Object.defineProperty(Element.prototype, 'nextElementSibling', {
  get: function () {
    for (let n = this.nextSibling; n; n = n.nextSibling) {
      if (n.tagName) {
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
    let returnValue = '';

    // This runs pretty often, so we microoptimize it. Using `DomUtils.textContent` or `Array#map` +
    // `Array#join` would take longer.
    this.childNodes.forEach((node) => {
      returnValue += node.textContent;
    });

    return returnValue;
  },
  set: function (value) {
    this.childNodes.forEach((node) => {
      node.remove();
    });
    this.appendChild(new Text(value || ''));
  },
});

Object.defineProperty(Element.prototype, 'innerHTML', {
  get: function () {
    // decodeEntities acts opposite to its value ¯\_(ツ)_/¯
    return DomUtils.getInnerHTML(this, { decodeEntities: false });
  },
});

Object.defineProperty(Element.prototype, 'outerHTML', {
  get: function () {
    // decodeEntities acts opposite to its value ¯\_(ツ)_/¯
    return DomUtils.getOuterHTML(this, { decodeEntities: false });
  },
});

Element.prototype.hasAttribute = function (name) {
  return this.attribs[name] !== undefined;
};

Element.prototype.getAttribute = function (name) {
  let value = this.attribs[name] || null;
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
  DomUtils.appendChild(this, node);
};

Element.prototype.insertBefore = function (node, referenceNode) {
  if (referenceNode) {
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
  // This optimization is based on the assumption that elements existing in the document from the
  // beginning will never swap positions.
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

      // nodeTree must have at least 2 elements; this is guaranteed by the check "current === node"
      // above.
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
  return returnValue;
};

Object.defineProperty(Element.prototype, 'tagName', {
  get: function () {
    return this.name.toUpperCase();
  },
});

// We have to create a getter as there is no way to access an object from a method of that object's
// property (Element#classList.add and such in this case).
Object.defineProperty(Element.prototype, 'classList', {
  get: function () {
    if (this._classList) {
      return this._classList;
    } else {
      this._classList = [];
      this._classList.movedFromClassAttr = false;
      this._classList.moveFromClassAttr = (classAttr) => {
        this._classList.push(...(classAttr || '').split(' '));
        this._classList.movedFromClassAttr = true;
      };
      this._classList.add = (...names) => {
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
      this._classList.remove = (...names) => {
        names.forEach((name) => {
          let classAttr = this.getAttribute('class') || '';
          const index = ` ${classAttr} `.indexOf(` ${name} `);
          if (index !== -1) {
            classAttr = (
              classAttr.slice(0, index) + classAttr.slice(index + name.length + 1)
            ).trim();
            this.setAttribute('class', classAttr);
            if (this._classList.movedFromClassAttr) {
              this._classList.splice(name, this._classList.indexOf(name), 1);
            } else {
              this._classList.moveFromClassAttr(classAttr);
            }
          }
        });
      };
      this._classList.contains = (name) => {
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
          Boolean(this._classList.length) &&
          this._classList.indexOf(name) !== -1
        );
        return returnValue;
      };
      return this._classList;
    }
  },
});

Object.defineProperty(Element.prototype, 'className', {
  get: function () {
    return this.getAttribute('class');
  },

  set: function (value) {
    this.setAttribute('class', value);
  },
});

Element.prototype.filterRecursively = function (func, limit) {
  const nodes = [];
  walkThroughSubtree(this, (node) => {
    if (func(node)) {
      nodes.push(node);
      if (limit && nodes.length === limit) {
        return true;
      }
    }
  });
  return nodes;
};

Element.prototype.getElementsByClassName = function (name, limit) {
  return this.filterRecursively((node) => node.tagName && node.classList.contains(name), limit);
};

Element.prototype.getElementsByAttribute = function (regexp) {
  return this.filterRecursively((node) => (
    node.tagName &&
    Object.keys(node.attribs).some((name) => regexp.test(name))
  ));
};

// Supports only classes and tags
Element.prototype.querySelectorAll = function (selector) {
  const tokens = selector.split(/ *, */);
  const tagNames = tokens
    .filter((token) => !token.startsWith('.'))
    .map((name) => name.toUpperCase());
  const classNames = tokens
    .filter((token) => token.startsWith('.'))
    .map((name) => name.slice(1));
  return this.filterRecursively((node) => (
    node.tagName &&
    (
      tagNames.includes(node.tagName) ||
      classNames.some((name) => node.classList.contains(name))
    )
  ));
};

Element.prototype.getElementsByTagName = function (name) {
  return DomUtils.getElementsByTagName(name, this);
};

Element.prototype.cloneNode = function () {
  const clone = document.createElement(this.tagName);
  clone.attribs = Object.assign({}, this.attribs);
  return clone;
};

Object.defineProperty(Text.prototype, 'textContent', {
  get: function () {
    return decodeHtmlEntities(this.data);
  },
  set: function (value) {
    this.data = value;
  },
});

NodeConstructor.prototype.remove = function () {
  DomUtils.removeElement(this);
};

// We need the "Document" class to imitate window.document for the code to be more easily ported to
// other library if needed.
Document.prototype.createElement = (name) => {
  return new Element(name, {});
};

Document.prototype.createTextNode = (content) => {
  return new Text(content || '');
};

Document.prototype.getElementsByClassName = Element.prototype.getElementsByClassName;
Document.prototype.querySelectorAll = Element.prototype.querySelectorAll;

self.Document = Document;

export { walkThroughSubtree, parseDocument };
