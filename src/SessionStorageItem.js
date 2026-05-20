import StorageItem from './StorageItem'

/**
 * Class meant to facilitate communication with the
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage session storage}.
 *
 * The methods support chaining.
 *
 * @template {{ [key: ValidKey]: any }} [EntryType = { [key: ValidKey]: any }]
 * @augments {StorageItem<EntryType>}
 */
class SessionStorageItem extends StorageItem {
	/**
	 * Create an instance of a session storage item.
	 *
	 * @param {string} key Session storage item key (will be prepended by
	 *   {@link StorageItem.prefix}).
	 */
	constructor(key) {
		super(key, mw.storage.session)
	}
}

export default SessionStorageItem
