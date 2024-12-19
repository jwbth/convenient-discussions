/**
 * Generalization and simplification of the
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/TreeWalker TreeWalker web API} for the
 * normal and worker contexts.
 *
 * @template {boolean} [T=false]
 */
class TreeWalker {
  /** @type {T extends true ? ElementLike : NodeLike} */
  currentNode;

  /** @type {'firstElementChild'|'firstChild'} */
  firstChildProp;

  /** @type {'lastElementChild'|'lastChild'} */
  lastChildProp;

  /** @type {'previousElementSibling'|'previousSibling'} */
  previousSiblingProp;

  /** @type {'nextElementSibling'|'nextSibling'} */
  nextSiblingProp;

  /**
   * Create a tree walker.
   *
   * @param {NodeLike} root Node that limits where the tree walker can go within this document's
   *   tree: only the root node and its descendants.
   * @param {(node: T extends true ? ElementLike : NodeLike) => boolean} [acceptNode] Function that
   *   returns `true` if the tree walker should accept the node and `false` if it should reject.
   * @param {T} [onlyElements] Walk only on element nodes, ignoring nodes of other types.
   * @param {NodeLike} [startNode=root] Node to set as the current node.
   */
  constructor(root, acceptNode, onlyElements, startNode = root) {
    this.acceptNode = acceptNode;
    this.root = root;
    this.currentNode = /** @type {T extends true ? ElementLike : NodeLike} */ (startNode);

    if (onlyElements) {
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
   * @returns {?NodeLike}
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
   * @returns {?NodeLike}
   */
  parentNode() {
    return this.tryMove('parentNode');
  }

  /**
   * Go to the first child node.
   *
   * @returns {?NodeLike}
   */
  firstChild() {
    return this.tryMove(this.firstChildProp);
  }

  /**
   * Go to the last child node.
   *
   * @returns {?NodeLike}
   */
  lastChild() {
    return this.tryMove(this.lastChildProp);
  }

  /**
   * Go to the previous sibling node.
   *
   * @returns {?NodeLike}
   */
  previousSibling() {
    return this.tryMove(this.previousSiblingProp);
  }

  /**
   * Go to the next sibling node.
   *
   * @returns {?NodeLike}
   */
  nextSibling() {
    return this.tryMove(this.nextSiblingProp);
  }

  /**
   * Go to the next node (don't confuse with the next sibling).
   *
   * @returns {?NodeLike}
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
   * @returns {?NodeLike}
   */
  previousNode() {
    let node = this.currentNode;
    if (node === this.root) {
      return null;
    }
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
