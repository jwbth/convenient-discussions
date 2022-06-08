/**
 * User class and singleton `userRegistry` used to obtain its instances while avoiding creating
 * duplicates.
 *
 * @module userRegistry
 */

import cd from './cd';
import { ucFirst, underlinesToSpaces } from './util';

/**
 * Class representing a user. Is made similar to `mw.user` so that it is possible to pass it to
 * `mw.msg()` and have `{{gender:}}` replaced.
 *
 * The constructor is not accessible by means of import. Use {@link module:userRegistry.get}.
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
      this.options.set(name, options[name]);
    });
  }

  /**
   * Is the user registered (not an IP user).
   *
   * @type {boolean}
   */
  isRegistered() {
    if (this.name === '<unregistered>') {
      return false;
    }
    if (this.registered === undefined) {
      this.registered = !mw.util.isIPAddress(this.name);
    }
    return this.registered;
  }

  /**
   * Get the user name.
   *
   * @returns {string}
   */
  getName() {
    return this.name;
  }

  /**
   * Set a gender for the user.
   *
   * @param {string} value
   */
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

  /**
   * Get the preferred namespace alias, based on:
   * 1. the `genderNeutralUserNamespaceAlias` CD config value (first choice);
   * 2. the `userNamespacesByGender` CD config value, if the gender is known (second choice);
   * 3. the `wgFormattedNamespaces` MediaWiki config value (third choice).
   *
   * @returns {string}
   */
  getNamespaceAlias() {
    return (
      cd.config.genderNeutralUserNamespaceAlias ||
      cd.config.userNamespacesByGender?.[this.getGender()] ||
      mw.config.get('wgFormattedNamespaces')[2]
    );
  }
}

export default {
  /**
   * Collection of users.
   *
   * @type {object}
   */
  items: {},

  /**
   * Get a user object for a user with the specified name (either a new one or already existing).
   *
   * @param {string} name
   * @returns {module:userRegistry~User}
   */
  get(name) {
    if (name.includes('#')) {
      name = name.slice(0, name.indexOf('#'));
    }
    if (mw.util.isIPv6Address(name)) {
      name = name.toUpperCase().trim();
    } else {
      name = underlinesToSpaces(ucFirst(name)).trim();
    }

    if (!this.items[name]) {
      const options = name === cd.g.USER_NAME ? { gender: mw.user.options.get('gender') } : {};
      this.items[name] = new User(name, options);
    }

    return this.items[name];
  },
}
