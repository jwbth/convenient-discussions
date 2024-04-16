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
   * @param {Node|external:Node} [startNode]
   * @param {Node|external:Node} [root]
   */
  constructor(startNode, root) {
    super(root, null, true);
    if (startNode) {
      this.currentNode = startNode;
    }
  }
}

export default ElementsTreeWalker;
