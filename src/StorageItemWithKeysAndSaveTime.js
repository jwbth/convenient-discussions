import StorageItemWithKeys from './StorageItemWithKeys';

/**
 * @template {object} EntryType
 * @template {string} Key
 * @typedef {{ [key in Key]: EntryType } & { saveTime: number }} EntryTypeWithSaveTime
 */

/**
 * {@link StorageItem} with entries stored in keys and save time set for each entry.
 *
 * @template {any} [EntryType = any]
 * @template {string} [Key = string]
 * @augments {StorageItemWithKeys<EntryTypeWithSaveTime<EntryType, Key>>}
 */
class StorageItemWithKeysAndSaveTime extends StorageItemWithKeys {
  /**
   * @param {Key} key Local storage Item key (will be prepended by {@link StorageItem.prefix}).
   * @abstract
   */
  constructor(key) {
    super(key);
  }

  /**
   * Get an entry of the storage item by key.
   *
   * @param {ValidKey} key
   * @returns {EntryTypeWithSaveTime<EntryType, Key>}
   */
  get(key) {
    return this.data[key];
  }

  /**
   * Update a storage entry by page key (be it an article ID or page name): set and add a UNIX time.
   *
   * @param {ValidKey} pageKey
   * @param {EntryType} pageData
   * @returns {this}
   */
  setWithTime(pageKey, pageData) {
    pageKey = String(pageKey);
    const isEmpty = !(
      Array.isArray(pageData)
        ? pageData.length
        : $.isPlainObject(pageData)
          ? Object.keys(/** @type {object} */ (pageData)).length
          : pageData
    );
    if (isEmpty) {
      this.remove(pageKey);
    } else {
      this.set(pageKey, /** @type {EntryTypeWithSaveTime<EntryType, Key>} */ ({
        [this.key]: pageData,
        saveTime: Date.now(),
      }));
    }

    return this;
  }
}

export default StorageItemWithKeysAndSaveTime;
