import TreeWalker from './TreeWalker';

/**
 * Tree walker that walks only on element nodes.
 *
 * @augments TreeWalker<AcceptedNode>
 * @template {ElementLike} [AcceptedNode=ElementLike]
 */
class ElementsTreeWalker extends TreeWalker {
  /**
   * Create an {@link TreeWalker tree walker} that walks elements.
   *
   * @param {NodeLike} root
   * @param {AcceptedNode} [startNode]
   */
  constructor(root, startNode) {
    super(root, undefined, true, startNode);
  }
}

export default ElementsTreeWalker;
