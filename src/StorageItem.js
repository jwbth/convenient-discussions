/**
 * @template {object} T
 * @typedef {{
 *   [key: string]: {
 *     key: T;
 *     saveTime: number;
 *   };
 * }} EntryTypeWithSaveTime
 */

/**
 * Class meant to facilitate communication with the
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage local storage}.
 *
 * The methods support chaining.
 *
 * @template {{ [key: string]: any }} [EntryType = { [key: string]: any }]
 * @template {string} [Key = string]
 */
class StorageItem {
  /**
   * See https://github.com/microsoft/TypeScript/issues/3841#issuecomment-337560146.
   *
   * @type {typeof StorageItem}
   * @readonly
   */
  ['constructor'];

  /**
   * Prefix added to the name of the storage item.
   *
   * @type {string}
   */
  static prefix = 'convenientDiscussions';

  /** @type {{ [key: ValidKey]: EntryType } | EntryType} */
  data;

  /**
   * Create an instance of a storage item, getting its contents from the local storage. In case of
   * an unexistent/falsy/corrupt value or the storage inaccessible, set an empty object.
   *
   * To reload the contents of the storage item after an idle period, run
   * {@link StorageItem#reload}. Note that the user may interact with the storage in other tabs.
   *
   * @param {Key} key Local storage Item key (will be prepended by {@link StorageItem.prefix}).
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
   * Get an entry of the storage item by key.
   *
   * @param {ValidKey} key
   * @returns {EntryType}
   */
  get(key) {
    return this.data[key];
  }

  /**
   * Set an entry of the storage item by key.
   *
   * @param {ValidKey} key
   * @param {any} value
   * @returns {this}
   */
  set(key, value) {
    this.data[key] = value;

    return this;
  }

  /**
   * Get all data in the storage item: as a single entry or arranged by key if they are used.
   *
   * @returns {{ [key: ValidKey]: EntryType } | EntryType}
   */
  getAll() {
    return this.data;
  }

  /**
   * Set all data in the storage item.
   *
   * @param {EntryType} value
   * @returns {this}
   */
  setAll(value) {
    this.data = value;

    return this;
  }

  /**
   * Remove an entry of the storage item.
   *
   * @param {ValidKey} key
   * @returns {this}
   */
  remove(key) {
    delete this.data[key];

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

  /**
   * Clean up entries (e.g. old ones), if callback returns `true` for an entry.
   *
   * @param {(data: EntryType) => boolean} removeCondition
   * @returns {this}
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
   * @param {ValidKey} pageKey
   * @param {EntryType[StorageItem['key']]} pageData
   * @returns {this}
   */
  setWithTime(pageKey, pageData) {
    pageKey = String(pageKey);
    const isEmpty = !(
      Array.isArray(pageData) ?
        pageData.length :
        ($.isPlainObject(pageData) ? Object.keys(pageData).length : pageData)
    );
    if (isEmpty) {
      this.remove(pageKey);
    } else {
      this.set(pageKey, {
        [this.key]: pageData,
        saveTime: Date.now(),
      });
    }

    return this;
  }
}

export default StorageItem;
