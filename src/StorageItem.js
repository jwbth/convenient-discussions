import cd from './loader/cd'

/**
 * Class meant to facilitate communication with local or session storage.
 *
 * @template {{ [key: ValidKey]: any }} [EntryType = { [key: ValidKey]: any }]
 */
class StorageItem {
	/**
	 * Prefix added to the name of the storage item.
	 *
	 * @type {string}
	 */
	static prefix = 'convenientDiscussions'

	/** @type {EntryType} */
	data

	/**
	 * Create an instance of a storage item.
	 *
	 * @param {string} key Storage item key (will be prepended by {@link StorageItem.prefix}).
	 * @param {any} storage Storage interface to interact with.
	 */
	constructor(key, storage) {
		// Workaround to make this.constructor in methods to be type-checked correctly
		/** @type {typeof StorageItem} */
		// eslint-disable-next-line no-self-assign
		this.constructor = this.constructor

		this.key = key
		this.storage = storage

		this.reload()
	}

	/**
	 * Get the contents of the storage item and set it to the instance. In case of an
	 * unexistent/falsy/corrupt value or the storage inaccessible, set an empty object.
	 *
	 * Run this every time you use the storage after an idle period: the user may interact with the
	 * storage in other tabs in the same time frame.
	 *
	 * @returns {this}
	 */
	reload() {
		const obj = this.storage.getObject(`${this.constructor.prefix}-${this.key}`)
		if (obj === false) {
			cd.debug.logError('Storage is unavailable.')
		}
		this.data = obj || {}

		return this
	}

	/**
	 * Delete the entire item from the storage.
	 *
	 * @returns {this}
	 */
	removeItem() {
		this.storage.remove(`${this.constructor.prefix}-${this.key}`)

		return this
	}

	/**
	 * Get all data in the storage item: as a single entry or arranged by key if they are used.
	 *
	 * @returns {EntryType}
	 */
	getData() {
		return this.data
	}

	/**
	 * Set all data in the storage item.
	 *
	 * @param {EntryType} value
	 * @returns {this}
	 */
	setData(value) {
		this.data = value

		return this
	}

	/**
	 * Save the data to the storage item.
	 *
	 * @returns {this}
	 */
	save() {
		this.storage.setObject(`${this.constructor.prefix}-${this.key}`, this.data)

		return this
	}
}

export default StorageItem
