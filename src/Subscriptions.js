import CdError from './CdError';
import cd from './cd';
import settings from './settings';
import { wrapHtml } from './utils-window';

/**
 * @typedef {{ [sectionId: string]: boolean }} SubscriptionsData
 */

/**
 * Implementation of the subscriptions feature in general terms. It is extended by
 * {@link DtSubscriptions DisussionTools' topic subscription} and
 * {@link LegacySubscriptions CD's legacy section watching}.
 */
class Subscriptions extends OO.EventEmitter {
  /** @type {SubscriptionsData} */
  data;

  /** @type {string|undefined} */
  type;

  /**
   * Do everything {@link .load} does and also perform manipulations with the talk page.
   *
   * @param {import('./BootProcess').default} [bootProcess]
   * @param {...*} args
   */
  async loadToTalkPage(bootProcess, ...args) {
    await this.load(bootProcess, ...args);

    this.processOnTalkPage();
  }

  /**
   * @param {...*} args
   * @abstract
   */
  // eslint-disable-next-line no-unused-vars
  async load(...args) {
    // This method is defined in subclasses.
  }

  /**
   * @param {...*} args
   * @abstract
   * @returns {boolean}
   */
  // eslint-disable-next-line no-unused-vars
  areLoaded(...args) {
    // This method is defined in subclasses.
    return true;
  }

  /**
   * @param {...*} args
   * @abstract
   * @protected
   */
  // eslint-disable-next-line no-unused-vars
  async actuallySubscribe(...args) {
    // This method is defined in subclasses.
  }

  /**
   * @param {...*} args
   * @abstract
   * @protected
   */
  // eslint-disable-next-line no-unused-vars
  async actuallyUnsubscribe(...args) {
    // This method is defined in subclasses.
  }

  /**
   * Process subscriptions when they are {@link Subscriptions#loadToTalkPage loaded to a talk page}.
   */
  processOnTalkPage() {
    this.emit('process');
  }

  /**
   * Update the subscription list by adding or removing a subscription, without saving anything to
   * the server.
   *
   * @param {string} subscribeId Section's subscribe ID (modern or legacy format).
   * @param {boolean} subscribe Subscribe or unsubscribe.
   * @protected
   */
  updateLocally(subscribeId, subscribe) {
    // this.data can be not set on newly created pages with DT subscriptions enabled.
    this.data ||= {};

    this.data[subscribeId] = Boolean(subscribe);
  }

  /**
   * Subscribe to a section.
   *
   * @param {string} subscribeId Section's DiscussionTools ID.
   * @param {string} [id] Section's ID. Not required for DiscussionTools subscriptions.
   * @param {boolean} [quiet=false] Don't show a success notification.
   * @param {string} [unsubscribeHeadline] Headline of a section to unsubscribe from (at the same
   * time).
   */
  async subscribe(subscribeId, id, quiet = false, unsubscribeHeadline) {
    await this.actuallySubscribe(subscribeId, id, unsubscribeHeadline);

    if (!quiet) {
      let body = subscribeId.startsWith('p-') ?
        cd.mws('discussiontools-newtopicssubscription-notify-subscribed-body') :
        cd.mws('discussiontools-topicsubscription-notify-subscribed-body');
      let /** @type {'long'|'short'|undefined} */ autoHideSeconds;
      if (!settings.get('useTopicSubscription')) {
        body += ' ' + cd.sParse('section-watch-openpages');
        if ($('#ca-watch').length) {
          body += ' ' + cd.sParse('section-watch-pagenotwatched');
          autoHideSeconds = 'long';
        }
      }
      mw.notify(wrapHtml(body), {
        title: subscribeId.startsWith('p-') ?
          cd.mws('discussiontools-newtopicssubscription-notify-subscribed-title') :
          cd.mws('discussiontools-topicsubscription-notify-subscribed-title'),
        autoHideSeconds,
      });
    }
  }

  /**
   * Unsubscribe from a section.
   *
   * @param {string} subscribeId Section's DiscussionTools ID.
   * @param {string} [id] Section's ID. Not required for DiscussionTools subscriptions.
   * @param {boolean} [quiet=false] Don't show a success notification.
   * @param {import('./Section').default} [section] Section being unsubscribed from, if any, for
   *   legacy subscriptions.
   */
  async unsubscribe(subscribeId, id, quiet = false, section) {
    await this.actuallyUnsubscribe(subscribeId, id);

    const ancestorSubscribedTo = section?.getClosestSectionSubscribedTo();
    if (!quiet || ancestorSubscribedTo) {
      const title = subscribeId.startsWith('p-') ?
        cd.mws('discussiontools-newtopicssubscription-notify-unsubscribed-title') :
        cd.mws('discussiontools-topicsubscription-notify-unsubscribed-title');
      let body = subscribeId.startsWith('p-') ?
        cd.mws('discussiontools-newtopicssubscription-notify-unsubscribed-body') :
        cd.mws('discussiontools-topicsubscription-notify-unsubscribed-body');
      let /** @type {'long'|'short'|undefined} */ autoHideSeconds;
      if (ancestorSubscribedTo) {
        body += ' ' + cd.sParse('section-unwatch-stillwatched', ancestorSubscribedTo.headline);
        autoHideSeconds = 'long';
      }
      mw.notify(wrapHtml(body), { title, autoHideSeconds });
    }
  }

  /**
   * Get the subscription state of a section or the page.
   *
   * @param {string} subscribeId
   * @returns {?boolean}
   * @throws {CdError}
   */
  getState(subscribeId) {
    if (!cd.user.isRegistered()) {
      return null;
    }

    if (!this.areLoaded()) {
      throw new CdError();
    }

    if (this.data[subscribeId] === undefined) {
      return null;
    }

    return this.data[subscribeId];
  }

  /**
   * _For internal use._ Convert the subscription list to the standard format, with section IDs as
   * keys instead of array elements, to store it.
   *
   * @param {string[]} arr Array of section IDs.
   * @returns {object[]}
   */
  itemsToKeys(arr) {
    return Object.assign({}, ...arr.map((page) => ({ [page]: true })));
  }
}

export default Subscriptions;
