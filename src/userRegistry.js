/**
 * Singleton used to obtain instances of the `User` class while avoiding creating duplicates.
 *
 * @module userRegistry
 */

import StorageItem from './StorageItem';
import User from './User';
import cd from './loader/cd';
import CdError from './shared/CdError';
import { subtractDaysFromNow, ucFirst, underlinesToSpaces } from './shared/utils-general';
import { handleApiReject } from './utils-api';

export default {
  /**
   * Collection of users.
   *
   * @type {TypeByKey<User>}
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
      mw.util.isIPv6Address(name)
        ? name.toUpperCase()
        : underlinesToSpaces(ucFirst(name))
    ).trim();
    if (!(name in this.items)) {
      this.items[name] = new User(
        name,
        name === cd.g.userName ? { gender: mw.user.options.get('gender') } : {}
      );
    }

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
    const userIdList = /** @type {string} */ (mw.user.options.get('echo-notifications-blacklist'));
    if (!userIdList || !cd.config.useGlobalPreferences) return;

    /**
     * @typedef {object} MutedUsers
     * @property {StringsByKey} users
     * @property {number} saveTime
     */

    const userIds = userIdList.split('\n');
    const mutedUsersStorage = /** @type {StorageItem<MutedUsers>} */ (new StorageItem('mutedUsers'));
    const mutedUsers = mutedUsersStorage.getData();
    if (
      // This comes from the local storage, the value may be corrupt
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      !mutedUsers.users ||
      userIds.some((id) => !(id in mutedUsers.users)) ||

      // Users can be renamed, so we can cache for a week max.
      mutedUsers.saveTime < subtractDaysFromNow(7)
    ) {
      this.getUsersByGlobalId(userIds).then(
        (users) => {
          users.forEach((user) => {
            user.setMuted(true);
          });
          mutedUsersStorage
            .setData({
              users: /** @type {StringsByKey} */ (Object.assign({}, ...users.map((user) => ({
                [/** @type {number} */ (user.getGlobalId())]: user.getName(),
              }), {}))),
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
        (/** @type {unknown} */ error) => {
          console.error('Couldn\'t load the names of the muted users.', error);
        }
      );
    } else {
      const users = Object.entries(mutedUsers.users).map(([, name]) => this.get(name));
      users.forEach((user) => {
        user.setMuted(true);
      });
      mw.hook('convenientDiscussions.mutedUsers').fire(users);
    }
  },

  /**
   * Given a list of user IDs, return a list of users.
   *
   * @param {(number|string)[]} userIds List of user IDs.
   * @returns {Promise.<import('./User').default[]>}
   */
  async getUsersByGlobalId(userIds) {
    const responses = /** @type {ApiResponseQuery<ApiResponseQueryContentGlobalUserInfo[]>} */ (
      await Promise.all(
        userIds.map((id) =>
          cd
            .getApi()
            .post({
              action: 'query',
              meta: 'globaluserinfo',
              guiid: id,
            })
            .catch(handleApiReject)
        )
      )
    );

    return responses.map((response) => {
      const userInfo = response.query?.globaluserinfo;
      if (!userInfo) {
        throw new CdError({
          type: 'response',
          code: 'noData',
          apiResponse: response,
        });
      }

      const user = this.get(userInfo.name);
      user.setGlobalId(userInfo.id);

      return user;
    });
  },
};
