import TreeWalker from './TreeWalker';

/**
 * Tree walker that walks on both element and text nodes.
 *
 * @augments TreeWalker
 */
class ElementsAndTextTreeWalker extends TreeWalker {
  /**
   * Create an elements and text {@link TreeWalker tree walker}.
   *
   * @param {Node|import('domhandler').Node} [startNode]
   * @param {Node|import('domhandler').Node} [root]
   */
  constructor(startNode, root) {
    super(root, (node) => node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ELEMENT_NODE);
    if (startNode) {
      this.currentNode = startNode;
    }
  }
}

export default ElementsAndTextTreeWalker;
