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

	/**
	 * Get a page object for a template name as used in wikitext.
	 *
	 * Converts template syntax to page names:
	 * - `{{template}}` → `Template:Template`
	 * - `{{:template}}` → `Template` (main namespace)
	 * - `{{user:username/template}}` → `User:Username/template` (explicit namespace)
	 * - `{{prefix:template}}` where prefix is not a namespace → `Template:Prefix:template`
	 *
	 * @param {string} templateName Template name as it appears in wikitext (without `{{` and `}}`)
	 * @returns {import('./Page').default | undefined}
	 */
	getFromTemplateName(templateName) {
		const hasLeadingColon = templateName.startsWith(':')

		if (hasLeadingColon) {
			// Leading colon means main namespace or explicit namespace
			return this.get(templateName.slice(1))
		}

		// Try to parse as a title to detect if a namespace is specified
		const title = mw.Title.newFromText(templateName)
		if (title && title.getNamespaceId() !== 10 && title.getNamespaceId() !== 0) {
			// Namespace is specified and it's not the Template namespace (ID 10) or main namespace (ID 0)
			return this.get(templateName)
		}

		// If it's already in Template namespace, use as-is
		if (title?.getNamespaceId() === 10) {
			return this.get(templateName)
		}

		// No namespace - use default Template: prefix
		return this.get('Template:' + templateName)
	},
}

export default pageRegistry
