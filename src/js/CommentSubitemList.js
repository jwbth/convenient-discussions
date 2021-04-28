/**
 * Comment subitem list class.
 *
 * @module CommentSubitemList
 */

/**
 * Class representing a list of the comment's subitems. There can be two types of subitems: comment
 * forms and "new replies" notes. They are managed with the class to handle the removal of their
 * parent list properly.
 */
export default class CommentSubitemList {
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
   * @param {JQuery} $element
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
      if (Object.keys(this.content).length) {
        $element.remove();
      } else {
        const $wrappingList = $element.parent('dl, ul, ol');
        const $outerWrapper = $wrappingList.parent('dd, li');
        $wrappingList.remove();

        // If found
        $outerWrapper.remove();
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
