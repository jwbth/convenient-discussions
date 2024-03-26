import CdError from './CdError';
import LZString from 'lz-string';
import SectionStatic from './SectionStatic';
import Subscriptions from './Subscriptions';
import cd from './cd';
import controller from './controller';
import userRegistry from './userRegistry';
import { getUserInfo, saveLocalOption } from './apiWrappers';
import { wrapHtml } from './utils';

/**
 * Class implementing CD's legacy section watching.
 */
export default class LegacySubscriptions extends Subscriptions {
  type = 'legacy';
  subscribePromise = Promise.resolve();

  /**
   * Request the subscription list from the server and assign it to the instance.
   *
   * @param {import('./BootProcess').default} [bootProcess]
   * @param {boolean} [reuse=false] Reuse the existing request.
   * @returns {Promise.<undefined>}
   */
  async load(bootProcess, reuse = false) {
    if (!userRegistry.getCurrent().isRegistered()) return;

    // `mw.user.options` is not used even on first run because it appears to be cached sometimes
    // which can be critical for determining subscriptions.
    this.allPagesData = (
      mw.user.options.get(cd.g.subscriptionsOptionName) !== null ||
      !bootProcess?.isFirstRun()
    ) ?
      this.unpack(await getUserInfo(reuse).then(({ subscriptions }) => subscriptions)) :
      {};

    const articleId = mw.config.get('wgArticleId');
    if (articleId) {
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
   * Process subscriptions when they are {@link .loadToTalkPage loaded to a talk page}.
   *
   * @param {...*} [args]
   */
  process(...args) {
    if (controller.doesPageExist()) {
      this.cleanUp();
    }

    super.process(...args);
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
   * @param {string} id Unused.
   * @param {string} [unsubscribeHeadline] Headline of section to unsubscribe from (used when a
   *   section is renamed on the fly in {@link Comment#update} or {@link CommentForm#submit}).
   * @returns {Promise.<undefined>}
   * @throws {CdError}
   * @protected
   */
  actuallySubscribe(headline, id, unsubscribeHeadline) {
    const subscribe = async () => {
      try {
        await this.load();
      } catch (e) {
        mw.notify(cd.s('error-settings-load'), { type: 'error' });
        throw e;
      }

      // We save the full subscription list, so we need to update the data first.
      const dataBackup = Object.assign({}, this.data);
      this.updateLocally(headline, true);
      this.updateLocally(unsubscribeHeadline, false);

      try {
        await this.save();
      } catch (e) {
        this.data = dataBackup;
        if (e instanceof CdError) {
          const { type, code } = e.data;
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
        throw e;
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
   * @returns {Promise.<undefined>}
   * @throws {CdError}
   * @private
   */
  actuallyUnsubscribe(headline) {
    const unsubscribe = async () => {
      try {
        await this.load();
      } catch (e) {
        mw.notify(cd.s('error-settings-load'), { type: 'error' });
        throw e;
      }

      const dataBackup = Object.assign({}, this.data);
      this.updateLocally(headline, false);

      try {
        await this.save();
      } catch (e) {
        this.data = dataBackup;
        mw.notify(cd.s('error-settings-save'), { type: 'error' });
        throw e;
      }
    };

    // Don't run in parallel
    this.subscribePromise = this.subscribePromise.then(unsubscribe, unsubscribe);

    return this.subscribePromise;
  }

  /**
   * Save the subscription list to the server as a user option.
   *
   * @param {object} data
   */
  async save(data) {
    await saveLocalOption(cd.g.subscriptionsOptionName, this.pack(data || this.allPagesData));
  }

  /**
   * Convert a subscriptions object into an optimized string and compress it.
   *
   * @param {object} data
   * @returns {string}
   */
  pack(data) {
    return LZString.compressToEncodedURIComponent(
      Object.keys(data)
        .filter((pageId) => Object.keys(data[pageId]).length)
        .map((key) => ` ${key} ${Object.keys(data[key]).join('\n')}\n`)
        .join('')
        .trim()
    );
  }

  /**
   * Unpack a compressed subscriptions string into an object.
   *
   * @param {string} compressed
   * @returns {object}
   */
  unpack(compressed) {
    const data = {};
    const pages = LZString.decompressFromEncodedURIComponent(compressed)
      .split(/(?:^|\n )(\d+) /)
      .slice(1);
    let pageId;
    for (
      let i = 0, isPageId = true;
      i < pages.length;
      i++, isPageId = !isPageId
    ) {
      if (isPageId) {
        pageId = pages[i];
      } else {
        const pagesArr = pages[i].split('\n');
        data[pageId] = this.itemsToKeys(pagesArr);
      }
    }

    return data;
  }

  /**
   * Get the IDs of pages that have subscriptions.
   *
   * @returns {number[]}
   */
  getPageIds() {
    return Object.keys(this.allPagesData);
  }

  /**
   * Get the subscription list for a page.
   *
   * @param {number} pageId
   * @returns {?(object[])}
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
   * @returns {boolean}
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
      .filter((headline) => SectionStatic.getAll().every((s) => s.headline !== headline))
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
   * @param {string} subscribeId Section's subscribe ID (modern or legacy format).
   * @param {boolean} subscribe Subscribe or unsubscribe.
   * @protected
   */
  updateLocally(subscribeId, subscribe) {
    super.updateLocally(subscribeId, subscribe);

    if (!subscribe) {
      delete this.data[subscribeId];
    }
  }
}
