import StorageItemWithKeys from './StorageItemWithKeys'

/**
 * @template {any} EntryType
 * @typedef {{ [key: ValidKey]: EntryType }} EntryTypeByKey
 */

/**
 * {@link SessionStorageItem} with entries stored by key.
 *
 * @template {any} [EntryType = any]
 * @augments {StorageItemWithKeys<EntryType>}
 */
class SessionStorageItemWithKeys extends StorageItemWithKeys {
	/**
	 * Create a session storage item with entries stored in keys.
	 *
	 * @param {string} key Session storage Item key (will be prepended by
	 *   {@link StorageItem.prefix}).
	 */
	constructor(key) {
		super(key, mw.storage.session)
	}
}

export default SessionStorageItemWithKeys
