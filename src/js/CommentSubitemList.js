/**
 * Class representing a list of the comment's subitems. There can be two types of subitems
 * currently: comment forms and "new replies" notes. They are managed with this class to handle the
 * removal of their parent list properly.
 */
class CommentSubitemList {
  /**
   * Create a comment subitem list.
   */
  constructor() {
    /**
     * List of subitems with names as keys.
     *
     * @type {object}
     */
    this.content = {};
  }

  /**
   * Add a subitem to the list.
   *
   * @param {string} name
   * @param {external:jQuery} $element
   */
  add(name, $element) {
    this.content[name] = $element;
  }

  /**
   * Remove a subitem both from the list and the page. Remove the list if has become empty.
   *
   * @param {string} name
   */
  remove(name) {
    const $element = this.content[name];
    if ($element) {
      delete this.content[name];
      const $wrappingList = $element.parent('dl, ul, ol');
      $element.remove();
      if ($wrappingList.is(':empty')) {
        const $outerWrapper = $wrappingList.parent('dd, li');
        if ($outerWrapper.length && $outerWrapper.children().length === 1) {
          $outerWrapper.remove();
        } else {
          $wrappingList.remove();
        }
      }
    }
  }

  /**
   * Get a subitem with the provided name.
   *
   * @param {string} name
   * @returns {?JQuery}
   */
  get(name) {
    return this.content[name] || null;
  }
}

export default CommentSubitemList;
