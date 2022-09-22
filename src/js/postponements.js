/**
 * Singleton related to the postpone functionality which is a basic throttling implementation.
 *
 * @module postponements
 */

import { sleep } from './utils';

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
  async add(label, func, delay) {
    if (this.list[label]) return;

    this.list[label] = true;
    await sleep(delay);
    this.list[label] = false;
    func();
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
