/**
 * Generalization and simplification of the
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/TreeWalker TreeWalker web API} for the
 * normal and worker contexts.
 */
class TreeWalker {
  /**
   * Create a tree walker.
   *
   * @param {Node|external:Node} root Node that limits where the tree walker can go within this
   *   document's tree: only the root node and its descendants.
   * @param {Function} [acceptNode] Function that returns `true` if the tree walker should accept
   *   the node and `false` if it should reject.
   * @param {boolean} [onlyElementNodes=false] Walk only on element nodes, ignoring nodes of other
   *   types.
   * @param {Node|external:Node} [startNode=root] Node to set as a current node.
   */
  constructor(root, acceptNode, onlyElementNodes = false, startNode = root) {
    this.acceptNode = acceptNode;
    this.root = root;
    this.currentNode = startNode;

    if (onlyElementNodes) {
      this.firstChildProp = 'firstElementChild';
      this.lastChildProp = 'lastElementChild';
      this.previousSiblingProp = 'previousElementSibling';
      this.nextSiblingProp = 'nextElementSibling';
    } else {
      this.firstChildProp = 'firstChild';
      this.lastChildProp = 'lastChild';
      this.previousSiblingProp = 'previousSibling';
      this.nextSiblingProp = 'nextSibling';
    }
  }

  /**
   * Try changing the current node to a node specified by the property.
   *
   * @param {string} prop
   * @returns {?Node}
   * @protected
   */
  tryMove(prop) {
    let node = this.currentNode;
    if (node === this.root && !prop.includes('Child')) {
      return null;
    }
    do {
      node = node[prop];
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
    return this.tryMove(this.firstChildProp);
  }

  /**
   * Go to the last child node.
   *
   * @returns {?Node}
   */
  lastChild() {
    return this.tryMove(this.lastChildProp);
  }

  /**
   * Go to the previous sibling node.
   *
   * @returns {?Node}
   */
  previousSibling() {
    return this.tryMove(this.previousSiblingProp);
  }

  /**
   * Go to the next sibling node.
   *
   * @returns {?Node}
   */
  nextSibling() {
    return this.tryMove(this.nextSiblingProp);
  }

  /**
   * Go to the next node (don't confuse with the next sibling).
   *
   * @returns {?Node}
   */
  nextNode() {
    let node = this.currentNode;
    do {
      if (node[this.firstChildProp]) {
        node = node[this.firstChildProp];
      } else {
        while (node && !node[this.nextSiblingProp] && node.parentNode !== this.root) {
          node = node.parentNode;
        }
        node &&= node[this.nextSiblingProp];
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
      if (node[this.previousSiblingProp]) {
        node = node[this.previousSiblingProp];
        while (node[this.lastChildProp]) {
          node = node[this.lastChildProp];
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

export default TreeWalker;
