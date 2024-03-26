/**
 * Class meant to facilitate communication with the local storage.
 */
export default class StorageItem {
  /**
   * Create a storage instance, get the storage item and set it to the instance. In case of an
   * unexistent/falsy/corrupt value or the storage inaccessible, set an empty object.
   *
   * To update the storage item after an idle period, run {@link #reload}. Note that the user may
   * interact with the storage in other tabs.
   *
   * @param {string} key Local storage Item key (will be prepended by `convenientDiscussions-`).
   */
  constructor(key) {
    this.key = key;

    this.reload();
  }

  /**
   * Get the storage item and set it to the instance. In case of an unexistent/falsy/corrupt
   * value or the storage inaccessible, set an empty object.
   *
   * Run this every time you use the storage after an idle period: the user may interact with the
   * storage in other tabs in the same time frame.
   *
   * @returns {StorageItem}
   */
  reload() {
    const obj = mw.storage.getObject(`convenientDiscussions-${this.key}`);
    if (obj === false) {
      console.error('Storage is unavailable.');
    }
    this.data = obj || {};

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
        delete this.data[key];
      }
    });

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
   * Delete an entry of the storage item.
   *
   * @param {string} key
   * @returns {StorageItem}
   */
  delete(key) {
    delete this.data[key];

    return this;
  }

  /**
   * Save the data to the storage item.
   *
   * @returns {StorageItem}
   */
  save() {
    mw.storage.setObject(`convenientDiscussions-${this.key}`, this.data);
    console.log(this.data);

    return this;
  }

  /**
   * Update a storage entry by page key (be it an article ID or page name): set and add a UNIX time.
   *
   * @param {string} pageKey
   * @param {object} pageData
   * @returns {StorageItem}
   */
  setForPage(pageKey, pageData) {
    this.set(
      pageKey,
      pageData.length ?
        {
          [this.key]: pageData,
          saveUnixTime: Date.now(),
        } :
        {}
    );

    return this;
  }
}
