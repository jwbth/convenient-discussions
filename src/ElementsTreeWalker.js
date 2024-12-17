import TreeWalker from './TreeWalker';

/**
 * Tree walker that walks only on element nodes.
 *
 * @augments TreeWalker
 */
class ElementsTreeWalker extends TreeWalker {
  /**
   * Create an elements {@link TreeWalker tree walker}.
   *
   * @param {Node|import('domhandler').Node} [startNode]
   * @param {Node|import('domhandler').Node} [root]
   */
  constructor(startNode, root) {
    super(root, null, true);
    if (startNode) {
      this.currentNode = startNode;
    }
  }
}

export default ElementsTreeWalker;
