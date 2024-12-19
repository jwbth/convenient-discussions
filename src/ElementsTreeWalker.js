import TreeWalker from './TreeWalker';

/**
 * Tree walker that walks only on element nodes.
 *
 * @augments TreeWalker
 */
class ElementsTreeWalker extends TreeWalker {
  /** @type {ElementLike} */
  currentNode;

  /**
   * Create an {@link TreeWalker tree walker} that walks elements.
   *
   * @param {ElementLike} root
   * @param {ElementLike} [startElement]
   */
  constructor(root, startElement) {
    super(root, undefined, true);
    if (startElement) {
      this.currentNode = startElement;
    }
  }

  /**
   * Go to the parent node.
   *
   * @override
   * @returns {?ElementLike}
   */
  parentNode() {
    return /** @type {?ElementLike} */ (super.parentNode());
  }
}

export default ElementsTreeWalker;
