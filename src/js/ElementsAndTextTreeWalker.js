import TreeWalker from './TreeWalker';

/**
 * Tree walker that walks on both element and text nodes.
 *
 * @augments module:treeWalker.TreeWalker
 */
export default class ElementsAndTextTreeWalker extends TreeWalker {
  /**
   * Create an elements and text {@link module:treeWalker.TreeWalker tree walker}.
   *
   * @param {Node|external:Node} [startNode]
   * @param {Node|external:Node} [root]
   */
  constructor(startNode, root) {
    super(root, (node) => node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ELEMENT_NODE);
    if (startNode) {
      this.currentNode = startNode;
    }
  }
}
