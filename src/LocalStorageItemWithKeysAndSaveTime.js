import LocalStorageItemWithKeys from './LocalStorageItemWithKeys'

/*
	Structure of local storage items:

	* LocalStorageItemWithKeysAndSaveTime
			{
				[arbitrary key 1]: {
					[key named as the storage key]: [entry 2],
					saveTime: number,
				},
				[arbitrary key 1]: {
					[key named as the storage key]: [entry 2],
					saveTime: number,
				},
				// ...
			}
	* LocalStorageItemWithKeys
			{
				[arbitrary key 1]: [entry 1],
				[arbitrary key 2]: [entry 2],
				// ...
			}
	* LocalStorageItem
			[entry]
		(i.e. it's just an arbitrary value).
 */

/**
 * @template {any} EntryType
 * @template {string} Key
 * @typedef {{ [key in Key]: EntryType } & { saveTime: number }} EntryTypeWithSaveTime
 */

/**
 * {@link LocalStorageItem} with entries stored in keys and save time set for each entry.
 *
 * @template {any} [EntryType = any]
 * @template {string} [Key = string]
 * @augments {LocalStorageItemWithKeys<EntryTypeWithSaveTime<EntryType, Key>>}
 */
class LocalStorageItemWithKeysAndSaveTime extends LocalStorageItemWithKeys {
	/**
	 * @param {Key} key Local storage item key (will be prepended by {@link LocalStorageItem.prefix}).
	 * @abstract
	 */

	/**
	 * Get an entry of the storage item by key.
	 *
	 * @param {ValidKey} key
	 * @returns {EntryTypeWithSaveTime<EntryType, Key> | undefined}
	 * @override
	 */
	get(key) {
		return this.data[key]
	}

	/**
	 * Update a storage entry by page key (be it an article ID or page name): set and add a UNIX time.
	 *
	 * @param {ValidKey} pageKey
	 * @param {EntryType} pageData
	 * @returns {this}
	 */
	setWithTime(pageKey, pageData) {
		pageKey = String(pageKey)

		if (
			// Is pageData not empty
			Array.isArray(pageData)
				? pageData.length
				: $.isPlainObject(pageData)
					? Object.keys(/** @type {object} */ (pageData)).length
					: pageData
		) {
			this.set(
				pageKey,
				/** @type {EntryTypeWithSaveTime<EntryType, Key>} */ ({
					[this.key]: pageData,
					saveTime: Date.now(),
				}),
			)
		} else {
			this.remove(pageKey)
		}

		return this
	}
}

export default LocalStorageItemWithKeysAndSaveTime
