import StorageItem from './StorageItem';

/**
 * @template {object} EntryType
 * @typedef {{ [key: ValidKey]: EntryType }} EntryTypeWithKey
 */

/**
 * {@link StorageItem} with entries stored in keys.
 *
 * @template {any} [EntryType = any]
 * @augments {StorageItem<EntryTypeWithKey<EntryType>>}
 */
class StorageItemWithKeys extends StorageItem {
  /** @type {EntryTypeWithKey<EntryType>} */
  data;

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
   * @param {EntryType} value
   * @returns {this}
   */
  set(key, value) {
    this.data[key] = value;

    return this;
  }

  /**
   * Remove an entry of the storage item by key.
   *
   * @param {ValidKey} key
   * @returns {this}
   */
  remove(key) {
    delete this.data[key];

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
}

export default StorageItemWithKeys;
