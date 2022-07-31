/**
 * A singleton used to obtain instances of the `User` class while avoiding creating duplicates.
 *
 * @module userRegistry
 */

import cd from './cd';
import { getFromLocalStorage, saveToLocalStorage, ucFirst, underlinesToSpaces } from './util';
import { getUsersByGlobalId } from './apiWrappers';

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
    this.registered ??= !mw.util.isIPAddress(this.name);
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
   * @param {'male'|'female'|'unknown'} value
   */
  setGender(value) {
    this.options.set('gender', value);
  }

  /**
   * User's gender (must be obtained using {@link module:apiWrappers.loadUserGenders}).
   *
   * @type {'male'|'female'|'unknown'}
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

  /**
   * Get the user's global ID according to the database if it was set before.
   *
   * @returns {number}
   */
  getGlobalId() {
    return this.globalId;
  }

  /**
   * Set the user's global ID according to the database.
   *
   * @param {number} value
   */
  setGlobalId(value) {
    this.globalId = Number(value);
  }

  /**
   * Check if the user is muted.
   *
   * @returns {boolean}
   */
  isMuted() {
    return this.muted;
  }

  /**
   * Set if the user is muted.
   *
   * @param {boolean} value
   */
  setMuted(value) {
    this.muted = Boolean(value);
  }
}

export default {
  /**
   * Collection of users.
   *
   * @type {object}
   * @private
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
    name = mw.util.isIPv6Address(name) ?
      name.toUpperCase().trim() :
      underlinesToSpaces(ucFirst(name)).trim();

    if (!this.items[name]) {
      const options = name === cd.g.USER_NAME ? { gender: mw.user.options.get('gender') } : {};
      this.items[name] = new User(name, options);
    }

    return this.items[name];
  },

  /**
   * Make an API request and assign the muted status to respective user objects.
   *
   * @fires mutedUsers
   */
  loadMuted() {
    const userIdList = mw.user.options.get('echo-notifications-blacklist');
    if (!userIdList) return;

    const userIds = userIdList.split('\n');
    const mutedUsersData = getFromLocalStorage('mutedUsers');
    if (
      !mutedUsersData.users ||
      userIds.some((id) => !mutedUsersData.users[id]) ||

      // Users can be renamed, so we can cache for a week max.
      mutedUsersData.saveUnixTime < Date.now() - 7 * cd.g.MS_IN_DAY
    ) {
      getUsersByGlobalId(userIds).then(
        (users) => {
          users.forEach((user) => {
            user.setMuted(true);
          });
          saveToLocalStorage('mutedUsers', {
            users: Object.assign({}, ...users.map((user) => ({
              [user.getGlobalId()]: user.getName(),
            }), {})),
            saveUnixTime: Date.now(),
          });

          /**
           * The list of muted users has been obtained from the server or local storage.
           *
           * @event mutedUsers
           * @param {module:userRegistry~User[]} users
           */
          mw.hook('convenientDiscussions.mutedUsers').fire(users);
        },
        (e) => {
          console.error('Couldn\'t load the names of the muted users.', e);
        }
      );
    } else {
      const users = Object.entries(mutedUsersData.users).map(([, name]) => this.get(name));
      users.forEach((user) => user.setMuted(true))
      mw.hook('convenientDiscussions.mutedUsers').fire(users);
    }
  },
};
