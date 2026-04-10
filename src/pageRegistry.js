/**
 * Singleton used to obtain instances of the {@link Page} class while avoiding creating duplicates.
 *
 * @module pageRegistry
 */

import CurrentPage from './CurrentPage'
import Page from './Page'
import cd from './loader/cd'

/**
 * @exports pageRegistry
 */
const pageRegistry = {
	/**
	 * Collection of pages.
	 *
	 * @type {TypeByStringKey<import('./Page').default>}
	 * @private
	 */
	items: {},

	/**
	 * Canonical name of the current page.
	 *
	 * @type {string}
	 * @private
	 */
	canonicalCurrentPageName: /** @type {mw.Title} */ (
		mw.Title.newFromText(cd.g.pageName)
	).getPrefixedText(),

	/**
	 * @overload
	 * @param {string} nameOrMwTitle
	 * @param {true} [isGendered]
	 * @returns {import('./Page').default | undefined}
	 *
	 * @overload
	 * @param {string|mw.Title} nameOrMwTitle
	 * @param {false} [isGendered]
	 * @returns {import('./Page').default | undefined}
	 */

	/**
	 * Get a page object for a page with the specified name (either a new one or already existing).
	 *
	 * @param {string | mw.Title} nameOrMwTitle
	 * @param {boolean} [isGendered] Used to keep the gendered namespace name (`nameOrMwTitle`
	 *   should be a string).
	 * @returns {import('./Page').default | undefined}
	 */
	get(nameOrMwTitle, isGendered = false) {
		const title =
			nameOrMwTitle instanceof mw.Title ? nameOrMwTitle : mw.Title.newFromText(nameOrMwTitle)
		if (!title) {
			return
		}

		const name = title.getPrefixedText()
		if (!(name in this.items)) {
			this.items[name] = new (name === this.canonicalCurrentPageName ? CurrentPage : Page)(
				title,
				this,
				isGendered ? /** @type {string} */ (nameOrMwTitle) : undefined,
			)
		} else if (isGendered) {
			// Set the gendered name which could be missing for the page.
			this.items[name].setGenderedName(/** @type {string} */ (nameOrMwTitle))
		}

		return this.items[name]
	},

	/**
	 * Get the page the user is visiting.
	 *
	 * @returns {import('./CurrentPage').default}
	 */
	getCurrent() {
		return /** @type {import('./CurrentPage').default} */ (this.get(cd.g.pageName, true))
	},

	/**
	 * Get the canonical name of the current page.
	 *
	 * @returns {string}
	 */
	getCanonicalCurrentPageName() {
		return this.canonicalCurrentPageName
	},
}

export default pageRegistry
