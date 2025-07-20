/**
 * Singleton used to obtain instances of the {@link Page} class while avoiding creating duplicates.
 *
 * @module pageRegistry
 */

import Page from './Page';
import cd from './cd';

/**
 * @exports pageRegistry
 */
const pageRegistry = {
  /**
   * Collection of pages.
   *
   * @type {object}
   * @private
   */
  items: {},

  /**
   * @overload
   * @param {string} nameOrMwTitle
   * @param {true} [isGendered=true]
   * @returns {?Page}
   *
   * @overload
   * @param {string|mw.Title} nameOrMwTitle
   * @param {false} [isGendered=true]
   * @returns {?Page}
   */

  /**
   * Get a page object for a page with the specified name (either a new one or already existing).
   *
   * @param {string | mw.Title} nameOrMwTitle
   * @param {boolean} [isGendered=true] Used to keep the gendered namespace name (`nameOrMwTitle`
   *   should be a string).
   * @returns {?Page}
   */
  get(nameOrMwTitle, isGendered = true) {
    const title = nameOrMwTitle instanceof mw.Title ?
      nameOrMwTitle :
      mw.Title.newFromText(nameOrMwTitle);
    if (!title) {
      return null;
    }

    const name = title.getPrefixedText();
    if (!this.items[name]) {
      this.items[name] = new Page(
        title,
        isGendered ? /** @type {string} */ (nameOrMwTitle) : undefined
      );
    } else if (isGendered) {
      this.items[name].name = nameOrMwTitle;
    }

    return this.items[name];
  },

  /**
   * Get the page the user is visiting.
   *
   * @returns {import('./CurrentPage').default}
   */
  getCurrent() {
    return /** @type {import('./CurrentPage').default} */ (this.get(cd.g.pageName, true));
  },
};

export default pageRegistry;
