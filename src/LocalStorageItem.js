import StorageItem from './StorageItem'

// See LocalStorageItemWithKeysAndSaveTime.js for the structure of storage items.

/**
 * Class meant to facilitate communication with the
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage local storage}.
 *
 * The methods support chaining.
 *
 * @template {{ [key: ValidKey]: any }} [EntryType = { [key: ValidKey]: any }]
 * @augments {StorageItem<EntryType>}
 */
class LocalStorageItem extends StorageItem {
	/**
	 * Create an instance of a storage item, getting its contents from the local storage. In case of
	 * an unexistent/falsy/corrupt value or the storage inaccessible, set an empty object.
	 *
	 * To reload the contents of the storage item after an idle period, run
	 * {@link LocalStorageItem#reload}. Note that the user may interact with the storage in other
	 * tabs.
	 *
	 * @param {string} key Local storage item key (will be prepended by
	 *   {@link LocalStorageItem.prefix}).
	 */
	constructor(key) {
		super(key, mw.storage)
	}
}

export default LocalStorageItem
