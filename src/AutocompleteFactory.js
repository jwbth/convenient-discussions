import CommentLinksAutocomplete from './CommentLinksAutocomplete'
import MentionsAutocomplete from './MentionsAutocomplete'
import TagsAutocomplete from './TagsAutocomplete'
import TemplatesAutocomplete from './TemplatesAutocomplete'
import WikilinksAutocomplete from './WikilinksAutocomplete'
import CdError from './shared/CdError'

/**
 * @typedef {'mentions' | 'commentLinks' | 'wikilinks' | 'templates' | 'tags'} AutocompleteType
 */

/**
 * @import {AutocompleteConfigShared} from './AutocompleteManager';
 */

/**
 * Factory class for creating appropriate autocomplete instances based on type.
 */
const AutocompleteFactory = {
	/**
	 * Create an autocomplete instance of the specified type.
	 *
	 * @param {AutocompleteType} type The autocomplete type to create
	 * @param {AutocompleteConfigShared} [options] Configuration options
	 * @returns {import('./BaseAutocomplete').default} Autocomplete instance
	 * @throws {CdError} If the type is unknown
	 */
	create(type, options = {}) {
		switch (type) {
			case 'mentions':
				// Lazy import to avoid circular dependencies
				return new MentionsAutocomplete(options)
			case 'wikilinks':
				return new WikilinksAutocomplete(options)
			case 'templates':
				return new TemplatesAutocomplete(options)
			case 'tags':
				return new TagsAutocomplete(options)
			case 'commentLinks':
				return new CommentLinksAutocomplete(options)
			default:
				throw new CdError({
					type: 'internal',
					message: `Unknown autocomplete type: ${String(type)}`,
				})
		}
	},

	/**
	 * Get all supported autocomplete types.
	 *
	 * @returns {AutocompleteType[]} Array of supported types
	 */
	getSupportedTypes() {
		return ['mentions', 'wikilinks', 'templates', 'tags', 'commentLinks']
	},

	/**
	 * Check if a type is supported.
	 *
	 * @param {string} type Type to check
	 * @returns {type is AutocompleteType} Whether the type is supported
	 */
	isTypeSupported(type) {
		return this.getSupportedTypes().includes(/** @type {AutocompleteType} */ (type))
	},
}

export default AutocompleteFactory
