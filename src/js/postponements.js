/**
 * Singleton related to the postpone functionality which is a basic throttling implementation.
 *
 * @module notifications
 */

export default {
  list: {},

  /**
   * Postpone the execution of some function. If it is already postponed, don't create a second
   * postponement.
   *
   * @param {string} label
   * @param {Function} func
   * @param {number} delay
   */
  add(label, func, delay) {
    if (this.list[label]) return;

    this.list[label] = true;
    setTimeout(() => {
      this.list[label] = false;
      func();
    }, delay);
  },

  /**
   * Check whether some task is postponed.
   *
   * @param {string} label
   * @returns {boolean}
   */
  is(label) {
    return this.list[label];
  },
};
