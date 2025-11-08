import CdError from './shared/CdError';

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
   * @returns {Promise<import('./BaseAutocomplete').default>} Autocomplete instance
   * @throws {CdError} If the type is unknown
   */
  async create(type, options = {}) {
    switch (type) {
      case 'mentions':
        // Lazy import to avoid circular dependencies
        return new ((await import('./MentionsAutocomplete')).default)(options);
      case 'wikilinks':
        return new ((await import('./WikilinksAutocomplete')).default)(options);
      case 'templates':
        return new ((await import('./TemplatesAutocomplete')).default)(options);
      case 'tags':
        return new ((await import('./TagsAutocomplete')).default)(options);
      case 'commentLinks':
        return new ((await import('./CommentLinksAutocomplete')).default)(options);
      default:
        throw new CdError({
          type: 'internal',
          message: `Unknown autocomplete type: ${String(type)}`,
        });
    }
  },

  /**
   * Get all supported autocomplete types.
   *
   * @returns {AutocompleteType[]} Array of supported types
   */
  getSupportedTypes() {
    return ['mentions', 'wikilinks', 'templates', 'tags', 'commentLinks'];
  },

  /**
   * Check if a type is supported.
   *
   * @param {string} type Type to check
   * @returns {type is AutocompleteType} Whether the type is supported
   */
  isTypeSupported(type) {
    return this.getSupportedTypes().includes(/** @type {AutocompleteType} */ (type));
  },
};

export default AutocompleteFactory;
