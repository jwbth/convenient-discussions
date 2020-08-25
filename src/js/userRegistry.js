/**
 * User class and object `userRegistry` used to obtain its instances while avoiding creating
 * duplicates.
 *
 * @module userRegistry
 */

import cd from './cd';
import { firstCharToUpperCase, underlinesToSpaces } from './util';

export default {
  /**
   * Collection of users.
   *
   * @type {object}
   */
  users: {},

  /**
   * Get the user object for a user with the specified name (either a new one or already existing).
   *
   * @param {string} name
   * @returns {User}
   */
  getUser(name) {
    if (name.includes('#')) {
      name = name.slice(0, name.indexOf('#'));
    }
    if (mw.util.isIPv6Address(name)) {
      name = name.toUpperCase().trim();
    } else {
      name = underlinesToSpaces(firstCharToUpperCase(name)).trim();
    }

    if (!this.users[name]) {
      const options = name === cd.g.CURRENT_USER_NAME ? { gender: cd.g.CURRENT_USER_GENDER } : {};
      this.users[name] = new User(name, options);
    }

    return this.users[name];
  },
}

/**
 * Class representing a user. Is made similar to `mw.user` so that it is possible to pass it to
 * `mw.msg` and have `{{gender:}}` replaced.
 */
class User {
  /**
   * Create a user object.
   *
   * @param {string} name
   * @param {object} options
   */
  constructor(name, options = {}) {
    this.name = name;
    this.options = new mw.Map();

    Object.keys(options).forEach((name) => {
      this[name] = options[name];
    });
  }

  /**
   * Is the user registered (not an IP user).
   *
   * @type {boolean}
   */
  isRegistered() {
    if (this.cachedRegistered === undefined) {
      this.cachedRegistered = !mw.util.isIPAddress(this.name);
    }
    return this.cachedRegistered;
  }

  setGender(value) {
    this.options.set('gender', value);
  }

  /**
   * User's gender (must be obtained using {@link module:apiWrappers.getUserGenders}).
   *
   * @type {string}
   */
  getGender() {
    return this.options.get('gender');
  }
}
