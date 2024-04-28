/**
 * Class meant to facilitate communication with the
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage local storage}.
 *
 * The methods support chaining.
 */
class StorageItem {
  /**
   * Prefix added to the name of the storage item.
   *
   * @type {string}
   */
  static prefix = 'convenientDiscussions';

  /**
   * Create an instance of a storage item, getting its contents from the local storage. In case of
   * an unexistent/falsy/corrupt value or the storage inaccessible, set an empty object.
   *
   * To reload the contents of the storage item after an idle period, run
   * {@link StorageItem#reload}. Note that the user may interact with the storage in other tabs.
   *
   * @param {string} key Local storage Item key (will be prepended by {@link StorageItem.prefix}).
   */
  constructor(key) {
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
   * @returns {StorageItem}
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
   * @returns {StorageItem}
   */
  removeItem() {
    mw.storage.remove(`${this.constructor.prefix}-${this.key}`);

    return this;
  }

  /**
   * Get an entry of the storage item by key.
   *
   * @param {string} key
   * @returns {*}
   */
  get(key) {
    return this.data[key];
  }

  /**
   * Get all entries in the storage item.
   *
   * @returns {*}
   */
  getAll() {
    return this.data;
  }

  /**
   * Set an entry of the storage item.
   *
   * @param {string} key
   * @param {*} value
   * @returns {StorageItem}
   */
  set(key, value) {
    this.data[key] = value;

    return this;
  }

  /**
   * Remove an entry of the storage item.
   *
   * @param {string} key
   * @returns {StorageItem}
   */
  remove(key) {
    delete this.data[key];

    return this;
  }

  /**
   * Save the data to the storage item.
   *
   * @returns {StorageItem}
   */
  save() {
    mw.storage.setObject(`${this.constructor.prefix}-${this.key}`, this.data);

    return this;
  }

  /**
   * Clean up entries (e.g. old ones), if callback returns `true` for an entry.
   *
   * @param {Function} removeCondition
   * @returns {StorageItem}
   */
  cleanUp(removeCondition) {
    Object.keys(this.data).forEach((key) => {
      if (removeCondition(this.data[key])) {
        this.remove(key);
      }
    });

    return this;
  }

  /**
   * Update a storage entry by page key (be it an article ID or page name): set and add a UNIX time.
   *
   * @param {string} pageKey
   * @param {*} pageData
   * @returns {StorageItem}
   */
  setWithTime(pageKey, pageData) {
    const isEmpty = !(
      Array.isArray(pageData) ?
        pageData.length :
        (
          $.isPlainObject(pageData) ?
            Object.keys(pageData).length :
            pageData
        )
    );
    this.set(
      pageKey,
      isEmpty ?
        undefined :
        {
          [this.key]: pageData,
          saveTime: Date.now(),
        }
    );

    return this;
  }
}

export default StorageItem;
