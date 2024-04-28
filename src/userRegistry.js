/**
 * A singleton used to obtain instances of the `User` class while avoiding creating duplicates.
 *
 * @module userRegistry
 */

import StorageItem from './StorageItem';
import cd from './cd';
import controller from './controller';
import { handleApiReject } from './utils-api';
import { ucFirst, underlinesToSpaces } from './utils-general';

/**
 * Class representing a user. Is made similar to
 * {@link https://doc.wikimedia.org/mediawiki-core/master/js/mw.user.html mw.user} so that it is
 * possible to pass it to
 * {@link https://doc.wikimedia.org/mediawiki-core/master/js/mw.html#.msg mw.msg()} and have
 * `{{gender:}}` replaced.
 *
 * To create an instance, use {@link module:userRegistry.get} (the constructor is only exported for
 * means of code completion).
 */
export class User {
  options = new mw.Map();

  /**
   * Create a user object.
   *
   * @param {string} name
   * @param {object} options
   */
  constructor(name, options = {}) {
    this.name = name;
    Object.keys(options).forEach((name) => {
      this.options.set(name, options[name]);
    });
  }

  /**
   * Is the user registered (not an IP user).
   * {@link https://www.mediawiki.org/wiki/Help:Temporary_accounts Temporary accounts} are
   * considered registered users.
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
   * User's gender (must be obtained using {@link module:utilsApi.loadUserGenders}).
   *
   * @returns {'male'|'female'|'unknown'}
   */
  getGender() {
    return this.options.get('gender');
  }

  /**
   * Set the user's rights.
   *
   * @param {string[]} rights
   */
  setRights(rights) {
    this.rights = rights;
  }

  /**
   * Get the user's rights (must be obtained using {@link module:utilsApi.getUserInfo}).
   *
   * @type {?(string[])}
   */
  getRights() {
    return this.rights?.slice() || null;
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
   * @returns {User}
   */
  get(name) {
    if (name.includes('#')) {
      name = name.slice(0, name.indexOf('#'));
    }
    name = (
      mw.util.isIPv6Address(name) ?
        name.toUpperCase() :
        underlinesToSpaces(ucFirst(name))
    ).trim();
    this.items[name] ||= new User(
      name,
      name === cd.g.userName ? { gender: mw.user.options.get('gender') } : {}
    );

    return this.items[name];
  },

  /**
   * Get a user object for the current user.
   *
   * @returns {User}
   */
  getCurrent() {
    return this.get(cd.g.userName);
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
    const mutedUsersStorage = new StorageItem('mutedUsers');
    const mutedUsersData = mutedUsersStorage.getAll();
    if (
      !mutedUsersData.users ||
      userIds.some((id) => !mutedUsersData.users[id]) ||

      // Users can be renamed, so we can cache for a week max.
      // FIXME: Remove `([keep] || mutedUsersData.saveUnixTime)` after June 2024
      (mutedUsersData.saveTime || mutedUsersData.saveUnixTime) < Date.now() - 7 * cd.g.msInDay
    ) {
      this.getUsersByGlobalId(userIds).then(
        (users) => {
          users.forEach((user) => {
            user.setMuted(true);
          });
          mutedUsersStorage
            .set('mutedUsers', {
              users: Object.assign({}, ...users.map((user) => ({
                [user.getGlobalId()]: user.getName(),
              }), {})),
              saveTime: Date.now(),
            })
            .save();

          /**
           * The list of muted users has been obtained from the server or local storage.
           *
           * @event mutedUsers
           * @param {User[]} users
           * @global
           */
          mw.hook('convenientDiscussions.mutedUsers').fire(users);
        },
        (e) => {
          console.error('Couldn\'t load the names of the muted users.', e);
        }
      );
    } else {
      const users = Object.entries(mutedUsersData.users).map(([, name]) => this.get(name));
      users.forEach((user) => user.setMuted(true));
      mw.hook('convenientDiscussions.mutedUsers').fire(users);
    }
  },

  /**
   * Given a list of user IDs, return a list of users.
   *
   * @param {number[]|string[]} userIds List of user IDs.
   * @returns {Promise.<import('./userRegistry').User[]>}
   */
  async getUsersByGlobalId(userIds) {
    const requests = userIds.map((id) => (
      controller.getApi().post({
        action: 'query',
        meta: 'globaluserinfo',
        guiid: id,
      }).catch(handleApiReject)
    ));
    return (await Promise.all(requests)).map((resp) => {
      const userInfo = resp.query.globaluserinfo;
      const user = this.get(userInfo.name);
      user.setGlobalId(userInfo.id);
      return user;
    });
  },
};
