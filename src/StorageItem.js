// See StorageItemWithKeysAndSaveTime.js for the structure of storage items.

/**
 * Class meant to facilitate communication with the
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage local storage}.
 *
 * The methods support chaining.
 *
 * @template {{ [key: ValidKey]: any }} [EntryType = { [key: ValidKey]: any }]
 */
class StorageItem {
  /**
   * Prefix added to the name of the storage item.
   *
   * @type {string}
   */
  static prefix = 'convenientDiscussions';

  /** @type {EntryType} */
  data;

  /**
   * Create an instance of a storage item, getting its contents from the local storage. In case of
   * an unexistent/falsy/corrupt value or the storage inaccessible, set an empty object.
   *
   * To reload the contents of the storage item after an idle period, run
   * {@link StorageItem#reload}. Note that the user may interact with the storage in other tabs.
   *
   * @param {string} key Local storage item key (will be prepended by {@link StorageItem.prefix}).
   */
  constructor(key) {
    // Workaround to make this.constructor in methods to be type checked correctly
    this.constructor = StorageItem;

    this.key = key;

    this.reload();
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
    const obj = mw.storage.getObject(`${this.constructor.prefix}-${this.key}`);
    if (obj === false) {
      console.error('Storage is unavailable.');
    }
    this.data = obj || {};

    return this;
  }

  /**
   * Delete the entire item from the storage.
   *
   * @returns {this}
   */
  removeItem() {
    mw.storage.remove(`${this.constructor.prefix}-${this.key}`);

    return this;
  }

  /**
   * Get all data in the storage item: as a single entry or arranged by key if they are used.
   *
   * @returns {EntryType}
   */
  getData() {
    return this.data;
  }

  /**
   * Set all data in the storage item.
   *
   * @param {EntryType} value
   * @returns {this}
   */
  setData(value) {
    this.data = value;

    return this;
  }

  /**
   * Save the data to the storage item.
   *
   * @returns {this}
   */
  save() {
    mw.storage.setObject(`${this.constructor.prefix}-${this.key}`, this.data);

    return this;
  }
}

export default StorageItem;
