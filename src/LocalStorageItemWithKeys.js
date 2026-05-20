import StorageItemWithKeys from './StorageItemWithKeys'

/**
 * @template {any} EntryType
 * @typedef {{ [key: ValidKey]: EntryType }} EntryTypeByKey
 */

// See LocalStorageItemWithKeysAndSaveTime.js for the structure of storage items.

/**
 * {@link LocalStorageItem} with entries stored by key.
 *
 * @template {any} [EntryType = any]
 * @augments {StorageItemWithKeys<EntryType>}
 */
class LocalStorageItemWithKeys extends StorageItemWithKeys {
	/**
	 * Create a storage item with entries stored in keys.
	 *
	 * @param {string} key Local storage Item key (will be prepended by
	 *   {@link LocalStorageItem.prefix}).
	 */
	constructor(key) {
		super(key, mw.storage)
	}
}

export default LocalStorageItemWithKeys
