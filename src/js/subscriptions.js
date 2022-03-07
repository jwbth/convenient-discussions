/**
 * Singleton related to the subscriptions feature, including the DisussionTools' topic subscription
 * and CD's legacy section watching.
 *
 * @module subscriptions
 */

import CdError from './CdError';
import cd from './cd';
import { dtSubscribe, getDtSubscriptions } from './apiWrappers';
import {
  getLegacySubscriptions,
  getSettings,
  setLegacySubscriptions,
  setSettings,
} from './options';
import { showEditSubscriptionsDialog, showSettingsDialog } from './modal';
import { unique, wrap } from './util';

let subscribeLegacyPromise = Promise.resolve();

export default {
  async makeLoadRequest(reuse, passedData) {
    if (this.useTopicSubscription) {
      const subscriptionIds = cd.sections
        .map((section) => section.subscribeId)
        .filter(unique);
      this.registry = await getDtSubscriptions(subscriptionIds);
    } else {
      this.allPagesRegistry = await getLegacySubscriptions(reuse);

      const articleId = mw.config.get('wgArticleId');
      if (articleId) {
        this.allPagesRegistry[articleId] = this.allPagesRegistry[articleId] || {};
        this.registry = this.allPagesRegistry[articleId];

        // Manually add/remove a section that was added/removed at the same moment the page was
        // reloaded last time, so when we requested the watched sections from server, this section
        // wasn't there yet most probably.
        this.updateRegistry(passedData.justSubscribedToSection, true);
        this.updateRegistry(passedData.justUnsubscribedFromSection, false);
      }
    }
  },

  /**
   * Request the subscriptions from the server and assign them to the `registry` (and
   * `allPagesRegistry` in case of the legacy subscriptions) property.
   *
   * @param {boolean} [reuse=false] Whether to reuse a cached userinfo request.
   * @param {object} [passedData={}]
   * @param {string} [passedData.justSubscribedToSection] Headline of the section that was
   *   subscribed to within seconds before making this request (it could be not enough time for it
   *   to appear in the response).
   * @param {string} [passedData.justUnsubscribedFromSection] Headline of the section that was
   *   unsubscribed from within seconds before making this request (it could be not enough time for
   *   it to appear in the response).
   * @returns {Promise.<object>}
   */
  load(reuse = false, passedData = {}) {
    this.useTopicSubscription = cd.settings.useTopicSubscription;
    this.seenNotice = cd.settings.topicSubscriptionSeenNotice;

    delete this.registry;
    if (this.allPagesRegistry) {
      delete this.allPagesRegistry;
    }

    this.loadRequest = this.makeLoadRequest(reuse, passedData);
    return this.loadRequest;
  },

  areLoaded() {
    return Boolean(this.registry || this.allPagesRegistry);
  },

  /**
   * Save the subscription list to the server as a user option.
   *
   * @param {object} registry
   * @returns {Promise}
   */
  async saveLegacy(registry) {
    if (this.useTopicSubscription) return;

    await setLegacySubscriptions(registry || this.allPagesRegistry);
  },

  updateRegistry(subscribeId, subscribe) {
    if (subscribeId === undefined) return;

    this.registry[subscribeId] = subscribe;

    if (!subscribe && !this.useTopicSubscription) {
      delete this.registry[subscribeId];
    }
  },

  async dtSubscribe(subscribeId, anchor, subscribe) {
    try {
      await dtSubscribe(subscribeId, anchor, subscribe);
      this.updateRegistry(subscribeId, subscribe);
    } catch (e) {
      mw.notify(cd.s('error-settings-save'), { type: 'error' });
    }
  },

  /**
   * Add a section present on the current page to the legacy subscription list.
   *
   * @param {string} headline
   * @param {string} [unsubscribeHeadline] Headline of section to unsubscribe from (used when a
   *   section is renamed on the fly in {@link Comment#update} or {@link CommentForm#submit}).
   * @returns {Promise}
   * @throws {CdError}
   * @memberof Section
   */
  subscribeLegacy(headline, unsubscribeHeadline) {
    const subscribe = async () => {
      try {
        await this.load();
      } catch (e) {
        mw.notify(cd.s('error-settings-load'), { type: 'error' });
        return;
      }

      const backupRegistry = Object.assign({}, this.registry);
      this.updateRegistry(headline, true);
      this.updateRegistry(unsubscribeHeadline, false);

      try {
        await this.saveLegacy();
      } catch (e) {
        this.registry = backupRegistry;
        if (e instanceof CdError) {
          const { type, code } = e.data;
          if (type === 'internal' && code === 'sizeLimit') {
            const $body = wrap(cd.sParse('section-watch-error-maxsize'), {
              callbacks: {
                // Class name is kept for compatibility with strings.
                'cd-notification-editWatchedSections': () => {
                  showEditSubscriptionsDialog();
                },
              },
            }).$wrapper;
            mw.notify($body, {
              type: 'error',
              autoHideSeconds: 'long',
            });
          } else {
            mw.notify(cd.s('error-settings-save'), { type: 'error' });
          }
        } else {
          mw.notify(cd.s('error-settings-save'), { type: 'error' });
        }
      }
    };

    // Don't run in parallel
    subscribeLegacyPromise = subscribeLegacyPromise.then(subscribe);

    return subscribeLegacyPromise;
  },

  /**
   * Remove a section present on the current page from the legacy subscription list.
   *
   * @param {string} headline
   * @returns {Promise}
   * @throws {CdError}
   * @memberof Section
   */
  unsubscribeLegacy(headline) {
    const unsubscribe = async () => {
      try {
        await this.load();
      } catch (e) {
        mw.notify(cd.s('error-settings-load'), { type: 'error' });
        return;
      }

      const backupRegistry = Object.assign({}, this.registry);
      this.updateRegistry(headline, false);

      try {
        await this.saveLegacy();
      } catch (e) {
        this.registry = backupRegistry;
        mw.notify(cd.s('error-settings-save'), { type: 'error' });
      }
    };

    // Don't run in parallel
    subscribeLegacyPromise = subscribeLegacyPromise.then(unsubscribe);

    return subscribeLegacyPromise;
  },

  subscribe(subscribeId, anchor, unsubscribeHeadline) {
    if (subscribeId === undefined) return;

    return this.useTopicSubscription ?
      this.dtSubscribe(subscribeId, anchor, true) :
      this.subscribeLegacy(subscribeId, unsubscribeHeadline);
  },

  unsubscribe(subscribeId) {
    if (subscribeId === undefined) return;

    return this.useTopicSubscription ?
      this.dtSubscribe(subscribeId, false) :
      this.unsubscribeLegacy(subscribeId);
  },

  getPageIds() {
    if (this.useTopicSubscription || !this.areLoaded()) {
      return null;
    }

    return Object.keys(this.allPagesRegistry);
  },

  getForPageId(pageId) {
    if (this.useTopicSubscription || !this.areLoaded()) {
      return null;
    }

    return Object.keys(this.allPagesRegistry[pageId] || {});
  },

  getForCurrentPage() {
    return this.getForPageId(mw.config.get('wgArticleId'));
  },

  /**
   *
   *
   * @param {string} subscribeId
   * @returns {?boolean}
   * @throws {CdError}
   */
  getState(subscribeId) {
    if (!this.areLoaded()) {
      throw new CdError();
    }

    if (this.registry[subscribeId]) {
      return true;
    } else if (this.registry[subscribeId] === undefined) {
      return null;
    } else {
      return false;
    }
  },

  getOriginalState(headline) {
    return this.originalList?.includes(headline);
  },

  /**
   * _For internal use._ Remove sections that can't be found on the page anymore from the watched
   * sections list and save them to the server.
   */
  cleanUp() {
    if (this.useTopicSubscription) return;

    this.originalList = Object.keys(this.registry);

    let updated = false;
    Object.keys(this.registry)
      .filter((headline) => cd.sections.every((section) => section.headline !== headline))
      .forEach((headline) => {
        delete this.registry[headline];
        updated = true;
      });

    if (updated) {
      this.saveLegacy();
    }
  },

  async maybeShowNotice() {
    if (!this.useTopicSubscription || this.seenNotice) return;

    const settings = await getSettings();
    const $body = $('<div>');
    const $img = $('<img>')
      .attr('width', 512)
      .attr('height', 253)
      .attr('src', '//upload.wikimedia.org/wikipedia/commons/thumb/0/01/Screenshot_of_topic_subscription_prototype.png/512px-Screenshot_of_topic_subscription_prototype.png')
      .addClass('cd-tsnotice-img');
    const $div = wrap(cd.sParse('topicsubscription-notice'), {
      callbacks: {
        'cd-notification-notificationSettings': () => {
          showSettingsDialog('notifications');
        },
      },
      targetBlank: true,
      tagName: 'div',
    }).$wrapper.addClass('cd-tsnotice-text');
    $body.append($img, $div);
    OO.ui.alert($body, { size: 'large' });
    cd.settings.topicSubscriptionSeenNotice = settings.topicSubscriptionSeenNotice = true;
    setSettings(settings);
  },

  itemsToKeys(arr) {
    return Object.assign({}, ...arr.map((page) => ({ [page]: true })));
  },
};
