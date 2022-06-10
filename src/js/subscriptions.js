/**
 * Singleton related to the subscriptions feature, including the DisussionTools' topic subscription
 * and CD's legacy section watching.
 *
 * @module subscriptions
 */

import CdError from './CdError';
import cd from './cd';
import controller from './controller';
import settings from './settings';
import {
  dtSubscribe,
  getDtSubscriptions,
  getLegacySubscriptions,
  setLegacySubscriptions,
} from './apiWrappers';
import { showEditSubscriptionsDialog, showSettingsDialog } from './modal';
import { unique, wrap } from './util';

let subscribeLegacyPromise = Promise.resolve();

export default {
  /**
   * Request the subscription list from the server.
   *
   * @param {boolean} reuse For legacy subscriptions: Reuse the existing request.
   * @private
   */
  async makeLoadRequest(reuse) {
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

        const bootProcess = controller.getBootProcess();
        if (bootProcess) {
          // Manually add/remove a section that was added/removed at the same moment the page was
          // reloaded last time, so when we requested the watched sections from server, this section
          // wasn't there yet most probably.
          this.updateRegistry(bootProcess.data('justSubscribedToSection'), true);
          this.updateRegistry(bootProcess.data('justUnsubscribedFromSection'), false);
        }
      }
    }
  },

  /**
   * Request the subscription list from the server and assign them to the `registry` (and
   * `allPagesRegistry` in case of the legacy subscriptions) property.
   *
   * @param {boolean} [reuse=false] Whether to reuse a cached userinfo request.
   * @returns {Promise.<object>}
   */
  load(reuse = false) {
    this.useTopicSubscription = settings.get('useTopicSubscription');

    delete this.registry;
    if (this.allPagesRegistry) {
      delete this.allPagesRegistry;
    }

    this.loadRequest = this.makeLoadRequest(reuse);
    return this.loadRequest;
  },

  /**
   * Test if the subscription list is loaded.
   *
   * @returns {boolean}
   */
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

  /**
   * Update the subscription list by adding or removing a subscription. It's a local operation -
   * nothing is saved to the server.
   *
   * @param {string} subscribeId Section's subscribe ID (modern or legact format).
   * @param {*} subscribe Subscribe or unsubscribe.
   * @private
   */
  updateRegistry(subscribeId, subscribe) {
    if (subscribeId === undefined) return;

    this.registry[subscribeId] = subscribe;

    if (!subscribe && !this.useTopicSubscription) {
      delete this.registry[subscribeId];
    }
  },

  /**
   * Subscribe to or unsubscribe from a topic.
   *
   * @param {string} subscribeId Section's DiscussionTools ID.
   * @param {string} id Section's ID.
   * @param {boolean} subscribe Subscribe or unsubscribe.
   * @private
   */
  async dtSubscribe(subscribeId, id, subscribe) {
    try {
      await dtSubscribe(subscribeId, id, subscribe);
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
   * @private
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
   * @private
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

  /**
   * Subscribe to a section.
   *
   * @param {string} subscribeId Section's DiscussionTools ID.
   * @param {string} id Section's ID.
   * @param {string} unsubscribeHeadline Headline of a section to unsubscribe from (at the same
   * time).
   * @returns {Promise}
   */
  subscribe(subscribeId, id, unsubscribeHeadline) {
    if (subscribeId === undefined) return;

    return this.useTopicSubscription ?
      this.dtSubscribe(subscribeId, id, true) :
      this.subscribeLegacy(subscribeId, unsubscribeHeadline);
  },

  /**
   * Unsubscribe from a section.
   *
   * @param {string} subscribeId Section's DiscussionTools ID.
   * @param {string} id Section's ID.
   * @returns {Promise}
   */
  unsubscribe(subscribeId, id) {
    if (subscribeId === undefined) return;

    return this.useTopicSubscription ?
      this.dtSubscribe(subscribeId, id, false) :
      this.unsubscribeLegacy(subscribeId);
  },

  /**
   * For legacy subscriptions: Get the IDs of the pages that have subscriptions.
   *
   * @returns {number[]}
   */
  getPageIds() {
    if (this.useTopicSubscription || !this.areLoaded()) {
      return null;
    }

    return Object.keys(this.allPagesRegistry);
  },

  /**
   * For legacy subscriptions: Get the subscription list for a page.
   *
   * @param {number} pageId
   * @returns {?(object[])}
   */
  getForPageId(pageId) {
    if (this.useTopicSubscription || !this.areLoaded()) {
      return null;
    }

    return Object.keys(this.allPagesRegistry[pageId] || {});
  },

  /**
   * For legacy subscriptions: Get the subscription list for the current page.
   *
   * @returns {?(object[])}
   */
  getForCurrentPage() {
    return this.getForPageId(mw.config.get('wgArticleId'));
  },

  /**
   * Get the subscription state of a section.
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

  /**
   * Check whether the user was subscribed to a section
   *
   * @param {string} headline Headline.
   * @returns {boolean}
   */
  getOriginalState(headline) {
    return this.originalList?.includes(headline);
  },

  /**
   * _For internal use._ Remove sections that can't be found on the page anymore from the
   * subscription list and save it to the server.
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

  /**
   * Show a message dialog informing the user about the new topic subscription feature.
   */
  async maybeShowNotice() {
    if (!this.useTopicSubscription || settings.get('topicSubscriptionSeenNotice')) return;

    const loadedSettings = await settings.load();
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

    loadedSettings.topicSubscriptionSeenNotice = true;
    settings.save(loadedSettings);
    settings.set('topicSubscriptionSeenNotice', true);
  },

  /**
   * _For internal use._ Convert subscription list to the standard format, with section IDs as keys
   * instead of array elements, to keep it in the registry.
   *
   * @param {string[]} arr Array of section IDs.
   * @returns {object[]}
   */
  itemsToKeys(arr) {
    return Object.assign({}, ...arr.map((page) => ({ [page]: true })));
  },
};
