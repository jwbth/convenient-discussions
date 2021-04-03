/**
 * Tree walker classes.
 *
 * @module treeWalker
 */

import cd from './cd';

/**
 * Generalization and simplification of the {@link
 * https://developer.mozilla.org/en-US/docs/Web/API/TreeWalker TreeWalker web API} for the normal
 * and worker contexts.
 */
export class TreeWalker {
  /**
   * Create a tree walker.
   *
   * @param {Node} root Node that limits where the tree walker can go within this document's tree:
   *   only the root node and its descendants.
   * @param {Function} [acceptNode] Function that returns `true` if the tree walker should accept
   *   the node, and `false` if it should reject.
   * @param {boolean} [onlyElementNodes=false] Walk only on element nodes, ignoring nodes of other
   *   types.
   * @param {Node} [startNode=root] Node to set as a current node.
   */
  constructor(root, acceptNode, onlyElementNodes = false, startNode = root) {
    this.acceptNode = acceptNode;
    this.root = root;
    this.currentNode = startNode;

    if (onlyElementNodes) {
      this.firstChildProperty = 'firstElementChild';
      this.lastChildProperty = 'lastElementChild';
      this.previousSiblingProperty = 'previousElementSibling';
      this.nextSiblingProperty = 'nextElementSibling';
    } else {
      this.firstChildProperty = 'firstChild';
      this.lastChildProperty = 'lastChild';
      this.previousSiblingProperty = 'previousSibling';
      this.nextSiblingProperty = 'nextSibling';
    }
  }

  /**
   * Try changing the current node to a node specified by the property.
   *
   * @param {string} property
   * @returns {?Node}
   * @private
   */
  tryMove(property) {
    let node = this.currentNode;
    if (node === this.root && !property.includes('Child')) {
      return null;
    }
    do {
      node = node[property];
    } while (node && this.acceptNode && !this.acceptNode(node));
    if (node) {
      this.currentNode = node;
    }
    return node || null;
  }

  /**
   * Go to the parent node.
   *
   * @returns {?Node}
   */
  parentNode() {
    return this.tryMove('parentNode');
  }

  /**
   * Go to the first child node.
   *
   * @returns {?Node}
   */
  firstChild() {
    return this.tryMove(this.firstChildProperty);
  }

  /**
   * Go to the last child node.
   *
   * @returns {?Node}
   */
  lastChild() {
    return this.tryMove(this.lastChildProperty);
  }

  /**
   * Go to the previous sibling node.
   *
   * @returns {?Node}
   */
  previousSibling() {
    return this.tryMove(this.previousSiblingProperty);
  }

  /**
   * Go to the next sibling node.
   *
   * @returns {?Node}
   */
  nextSibling() {
    return this.tryMove(this.nextSiblingProperty);
  }

  /**
   * Go to the next node (don't confuse with the next sibling).
   *
   * @returns {?Node}
   */
  nextNode() {
    let node = this.currentNode;
    do {
      if (node[this.firstChildProperty]) {
        node = node[this.firstChildProperty];
      } else {
        while (node && !node[this.nextSiblingProperty] && node.parentNode !== this.root) {
          node = node.parentNode;
        }
        if (node) {
          node = node[this.nextSiblingProperty];
        }
      }
    } while (node && this.acceptNode && !this.acceptNode(node));
    if (node) {
      this.currentNode = node;
    }
    return node;
  }

  /**
   * Go to the previous node (don't confuse with the previous sibling).
   *
   * @returns {?Node}
   */
  previousNode() {
    let node = this.currentNode;
    if (node === this.root) return;
    do {
      if (node[this.previousSiblingProperty]) {
        node = node[this.previousSiblingProperty];
        while (node[this.lastChildProperty]) {
          node = node[this.lastChildProperty];
        }
      } else {
        node = node.parentNode;
      }
    } while (node && this.acceptNode && !this.acceptNode(node));
    if (node) {
      this.currentNode = node;
    }
    return node;
  }
}

/**
 * Tree walker that walks only on element nodes of the current document under `cd.g.rootElement`.
 *
 * @augments module:treeWalker.TreeWalker
 */
export class ElementsTreeWalker extends TreeWalker {
  /**
   * Create an elements {@link module:treeWalker.TreeWalker tree walker}.
   *
   * @param {Node} [startNode]
   */
  constructor(startNode) {
    super(cd.g.rootElement, null, true);
    if (startNode) {
      this.currentNode = startNode;
    }
  }
}

/**
 * Tree walker that walks on both element and text nodes of the current document under
 * `cd.g.rootElement`.
 *
 * @augments module:treeWalker.TreeWalker
 */
export class ElementsAndTextTreeWalker extends TreeWalker {
  /**
   * Create an elements and text {@link module:treeWalker.TreeWalker tree walker}.
   *
   * @param {Node} [startNode]
   */
  constructor(startNode) {
    super(
      cd.g.rootElement,
      (node) => node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ELEMENT_NODE
    );
    if (startNode) {
      this.currentNode = startNode;
    }
  }
}
