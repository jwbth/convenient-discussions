import LZString from 'lz-string';

import CdError from './CdError';
import Subscriptions from './Subscriptions';
import cd from './cd';
import controller from './controller';
import sectionRegistry from './sectionRegistry';
import { getUserInfo, saveLocalOption } from './utils-api';
import { wrapHtml } from './utils-window';

/**
 * Class implementing CD's legacy section watching.
 *
 * @augments Subscriptions
 */
class LegacySubscriptions extends Subscriptions {
  subscribePromise = Promise.resolve();

  /** @type {{ [pageId: number]: import('./Subscriptions').SubscriptionsData }} */
  allPagesData;

  /** @type {string[]|undefined} */
  originalList;

  /**
   * Request the subscription list from the server and assign it to the instance.
   *
   * @param {import('./BootProcess').default} [bootProcess]
   * @param {boolean} [reuse=false] Reuse the existing request.
   * @returns {Promise.<undefined>}
   */
  async load(bootProcess, reuse = false) {
    if (!cd.user.isRegistered()) return;

    try {
      // mw.user.options is not used even on first run because it appears to be cached sometimes
      // which can be critical for determining subscriptions.
      this.unpack(await getUserInfo(reuse).then(({ subscriptions }) => subscriptions));
    } catch (error) {
      console.warn('Convenient Discussions: Couldn\'t load the settings from the server.', error);
      return;
    }

    const articleId = mw.config.get('wgArticleId');
    if (articleId) {
      // This naming, with `allPagesData` and `data`, instead of `data` and  `currentPageData`, is
      // on purpose for compatibility with the DtSubscriptions class (that doesn't keep data for all
      // pages).
      this.allPagesData[articleId] ||= {};
      this.data = this.allPagesData[articleId];

      if (bootProcess) {
        // Manually add/remove a section that was added/removed at the same moment the page was
        // reloaded last time, so when we requested the watched sections from server, this
        // section wasn't there yet most probably.
        this.updateLocally(bootProcess.passedData.justSubscribedToSection, true);
        this.updateLocally(bootProcess.passedData.justUnsubscribedFromSection, false);
        delete bootProcess.passedData.justSubscribedToSection;
        delete bootProcess.passedData.justUnsubscribedFromSection;
      }
    }
  }

  /**
   * Process subscriptions when they are
   * {@link LegacySubscriptions#loadToTalkPage loaded to a talk page}.
   */
  processOnTalkPage() {
    if (cd.page.exists()) {
      this.cleanUp();
    }

    super.processOnTalkPage();
  }

  /**
   * Test if the subscription list is loaded.
   *
   * @returns {boolean}
   */
  areLoaded() {
    return Boolean(this.allPagesData);
  }

  /**
   * Add a section present on the current page to the subscription list.
   *
   * @param {string} headline
   * @param {string} _id Unused.
   * @param {string} [unsubscribeHeadline] Headline of section to unsubscribe from (used when a
   *   section is renamed on the fly in {@link Comment#update} or {@link CommentForm#submit}).
   * @returns {Promise.<void>}
   * @throws {CdError}
   * @protected
   */
  actuallySubscribe(headline, _id, unsubscribeHeadline) {
    const subscribe = async () => {
      try {
        await this.load();
      } catch (error) {
        mw.notify(cd.s('error-settings-load'), { type: 'error' });
        throw error;
      }

      // We save the full subscription list, so we need to update the data first.
      const currentPageDataBackup = Object.assign({}, this.data);
      this.updateLocally(headline, true);
      this.updateLocally(unsubscribeHeadline, false);

      try {
        await this.save();
      } catch (error) {
        this.data = currentPageDataBackup;
        if (error instanceof CdError) {
          const { type, code } = error.data;
          if (type === 'internal' && code === 'sizeLimit') {
            const $body = wrapHtml(cd.sParse('section-watch-error-maxsize'), {
              callbacks: {
                // An old class name is kept for compatibility with strings.
                'cd-notification-editWatchedSections': () => {
                  controller.showEditSubscriptionsDialog();
                },
              },
            });
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
        throw error;
      }
    };

    // Don't run in parallel
    this.subscribePromise = this.subscribePromise.then(subscribe, subscribe);

    return this.subscribePromise;
  }

  /**
   * Remove a section present on the current page from the subscription list.
   *
   * @param {string} headline
   * @returns {Promise.<void>}
   * @throws {CdError}
   * @protected
   */
  actuallyUnsubscribe(headline) {
    const unsubscribe = async () => {
      try {
        await this.load();
      } catch (error) {
        mw.notify(cd.s('error-settings-load'), { type: 'error' });
        throw error;
      }

      const currentPageDataBackup = Object.assign({}, this.data);
      this.updateLocally(headline, false);

      try {
        await this.save();
      } catch (error) {
        this.data = currentPageDataBackup;
        mw.notify(cd.s('error-settings-save'), { type: 'error' });
        throw error;
      }
    };

    // Don't run in parallel
    this.subscribePromise = this.subscribePromise.then(unsubscribe, unsubscribe);

    return this.subscribePromise;
  }

  /**
   * Save the subscription list to the server as a user option.
   *
   * @param {object} [allPagesData]
   */
  async save(allPagesData) {
    await saveLocalOption(
      cd.g.subscriptionsOptionName,
      this.pack(allPagesData || this.allPagesData)
    );
  }

  /**
   * Convert a subscriptions object into an optimized string and compress it.
   *
   * @param {object} allPagesData
   * @returns {string}
   */
  pack(allPagesData) {
    // The format of the items:
    // <Space, except for the first item><Page ID> <List of sections separated by \n>\n
    return LZString.compressToEncodedURIComponent(
      Object.keys(allPagesData)
        .filter((pageId) => Object.keys(allPagesData[pageId]).length)
        .map((key) => ` ${key} ${Object.keys(allPagesData[key]).join('\n')}\n`)
        .join('')
        .trim()
    );
  }

  /**
   * Unpack a compressed subscriptions string into an object.
   *
   * @param {string} compressed
   */
  unpack(compressed) {
    this.allPagesData = {};
    if (!compressed) return;

    const string = LZString.decompressFromEncodedURIComponent(compressed);
    if (string) {
      // Page IDs alternating with section lists
      const pages = string.split(/(?:^|\n )(\d+) /).slice(1);

      for (let i = 1; i < pages.length; i += 2) {
        this.allPagesData[pages[i - 1]] = this.itemsToKeys(pages[i].split('\n'));
      }
    }
  }

  /**
   * Get the IDs of pages that have subscriptions.
   *
   * @returns {number[]}
   */
  getPageIds() {
    return Object.keys(this.allPagesData).map(Number);
  }

  /**
   * Get the subscription list for a page.
   *
   * @param {number} pageId
   * @returns {string[]}
   */
  getForPageId(pageId) {
    return Object.keys(this.allPagesData[pageId] || {});
  }

  /**
   * Get the subscription list for the current page.
   *
   * @returns {?(object[])}
   */
  getForCurrentPage() {
    return this.getForPageId(mw.config.get('wgArticleId'));
  }

  /**
   * Check whether the user was subscribed to a section when the page was loaded.
   *
   * @param {string} headline Headline.
   * @returns {boolean|undefined}
   */
  getOriginalState(headline) {
    return this.originalList?.includes(headline);
  }

  /**
   * Remove sections that can't be found on the page anymore from the legacy subscription list and
   * save it to the server.
   *
   * @private
   */
  cleanUp() {
    this.originalList = Object.keys(this.data);
    let updated = false;
    Object.keys(this.data)
      .filter((headline) => sectionRegistry.getAll().every((s) => s.headline !== headline))
      .forEach((headline) => {
        delete this.data[headline];
        updated = true;
      });

    if (updated) {
      this.save();
    }
  }

  /**
   * Update the subscription list by adding or removing a subscription. It's a local operation -
   * nothing is saved to the server.
   *
   * @param {string} [subscribeId] Section's subscribe ID (modern or legacy format).
   * @param {boolean} [subscribe=false] Subscribe or unsubscribe.
   * @protected
   */
  updateLocally(subscribeId, subscribe = false) {
    if (subscribeId === undefined) return;

    super.updateLocally(subscribeId, subscribe);

    if (!subscribe) {
      delete this.data[subscribeId];
    }
  }

  /**
   * Type guard for this class.
   *
   * @param {object} obj
   * @returns {obj is LegacySubscriptions}
   */
  static isInstance(obj) {
    return obj instanceof LegacySubscriptions;
  }
}

export default LegacySubscriptions;
