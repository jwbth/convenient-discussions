import { isElement, isNode } from './utils-general';

/**
 * @typedef {'firstElementChild'|'firstChild'} FirstChildProp
 */

/**
 * @typedef {'lastElementChild'|'lastChild'} LastChildProp
 */

/**
 * @typedef {'previousElementSibling'|'previousSibling'} PreviousSiblingProp
 */

/**
 * @typedef {'nextElementSibling'|'nextSibling'} NextSiblingProp
 */

/**
 * Generalization and simplification of the
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/TreeWalker TreeWalker web API} for the
 * normal and worker contexts.
 *
 * @template {NodeLike} [AcceptedNode=NodeLike]
 */
class TreeWalker {
  /** @type {AcceptedNode} */
  currentNode;

  /** @type {FirstChildProp} */
  firstChildProp;

  /** @type {LastChildProp} */
  lastChildProp;

  /** @type {PreviousSiblingProp} */
  previousSiblingProp;

  /** @type {NextSiblingProp} */
  nextSiblingProp;

  /**
   * @typedef {(node: NodeLike) => node is AcceptedNode} AcceptNode
   */

  /**
   * Create a tree walker.
   *
   * @param {NodeLike} root Node that limits where the tree walker can go within this document's
   *   tree: only the root node and its descendants.
   * @param {AcceptNode} [acceptNode] Function that returns `true` if the tree walker should accept
   *   the node and `false` if it should reject.
   * @param {boolean} [elementsOnly=false] Walk only on element nodes, ignoring nodes of other
   *   types.
   * @param {AcceptedNode} [startNode] Node to set as the current node. The current node is set to
   *   `root` if not specified and `root` node is accepted. Otherwise the current node is set to the
   *   first accepted node under the root. If such node is not found, an error is thrown. (This is
   *   to have `currentNode` never be `null` to simplify type checking.)
   * @throws {Error}
   */
  constructor(root, acceptNode, elementsOnly = false, startNode) {
    this.acceptNode = acceptNode || /** @type {AcceptNode} */ (elementsOnly ? isElement : isNode);

    this.root = root;
    let currentNode =
      startNode ||
      (elementsOnly && isElement(root) && this.acceptNode(root) ? root : null);
    if (!currentNode) {
      currentNode = this.nextNode(root);
    }
    if (!currentNode) {
      throw new Error('Cannot create TreeWalker without a start node.');
    }
    this.currentNode = currentNode;

    if (elementsOnly) {
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
   * @param {FirstChildProp | LastChildProp | PreviousSiblingProp | NextSiblingProp | 'parentNode'} prop
   * @returns {?AcceptedNode}
   * @protected
   */
  tryMove(prop) {
    /** @type {NodeLike | null} */
    let node = this.currentNode;
    if (node === this.root && !prop.includes('Child')) {
      return null;
    }

    do {
      node = node[prop];
    } while (node && !this.acceptNode(node));
    if (node) {
      this.currentNode = node;
    }

    return node || null;
  }

  /**
   * Go to the parent node.
   *
   * @returns {?AcceptedNode}
   */
  parentNode() {
    return this.tryMove('parentNode');
  }

  /**
   * Go to the first child node.
   *
   * @returns {?AcceptedNode}
   */
  firstChild() {
    return this.tryMove(this.firstChildProp);
  }

  /**
   * Go to the last child node.
   *
   * @returns {?AcceptedNode}
   */
  lastChild() {
    return this.tryMove(this.lastChildProp);
  }

  /**
   * Go to the previous sibling node.
   *
   * @returns {?AcceptedNode}
   */
  previousSibling() {
    return this.tryMove(this.previousSiblingProp);
  }

  /**
   * Go to the next sibling node.
   *
   * @returns {?AcceptedNode}
   */
  nextSibling() {
    return this.tryMove(this.nextSiblingProp);
  }

  /**
   * Go to the next node (don't confuse with the next sibling).
   *
   * @param {NodeLike} [startNode]
   * @returns {?AcceptedNode}
   */
  nextNode(startNode) {
    /** @type {NodeLike | null} */
    let node = startNode || this.currentNode;

    do {
      if (node[this.firstChildProp]) {
        node = node[this.firstChildProp];
      } else {
        while (node && !node[this.nextSiblingProp] && node.parentNode !== this.root) {
          node = node.parentNode;
        }
        node &&= node[this.nextSiblingProp];
      }
    } while (node && !this.acceptNode(node));
    if (node) {
      this.currentNode = node;
    }

    return node;
  }

  /**
   * Go to the previous node (don't confuse with the previous sibling).
   *
   * @returns {?AcceptedNode}
   */
  previousNode() {
    /** @type {NodeLike | null} */
    let node = this.currentNode;
    if (node === this.root) {
      return null;
    }

    do {
      let test = /** @type {NodeLike | null} */ (node[this.previousSiblingProp]);
      if (test) {
        node = test;
        while ((test = node[this.lastChildProp])) {
          node = test;
        }
      } else {
        node = node.parentNode;
      }
    } while (node && !this.acceptNode(node));
    if (node) {
      this.currentNode = node;
    }

    return node;
  }
}

export default TreeWalker;
