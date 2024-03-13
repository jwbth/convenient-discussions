/**
 * Singleton related to the postpone functionality which is a basic throttling implementation.
 *
 * @module postponements
 */

import { sleep } from './utils';

export default {
  items: {},

  /**
   * Postpone the execution of some function. If it is already postponed, don't create a second
   * postponement.
   *
   * @param {string} label
   * @param {Function} func
   * @param {number} delay
   */
  async add(label, func, delay) {
    if (this.items[label]) return;

    this.items[label] = true;
    await sleep(delay);
    this.items[label] = false;
    func();
  },

  /**
   * Check whether some task is postponed.
   *
   * @param {string} label
   * @returns {boolean}
   */
  is(label) {
    return this.items[label];
  },
};
