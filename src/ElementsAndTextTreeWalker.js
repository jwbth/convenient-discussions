import TreeWalker from './TreeWalker';

/**
 * Tree walker that walks on both element and text nodes.
 *
 * @augments TreeWalker
 */
class ElementsAndTextTreeWalker extends TreeWalker {
  /** @type {ElementLike|TextLike} */
  currentNode;

  /**
   * Create an elements and text {@link TreeWalker tree walker}.
   *
   * @param {ElementLike|TextLike} root
   * @param {ElementLike|TextLike} [startNode]
   */
  constructor(root, startNode) {
    super(root, (node) => node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ELEMENT_NODE);
    if (startNode) {
      this.currentNode = startNode;
    }
  }
}

export default ElementsAndTextTreeWalker;
