import Button from './Button';
import CdError from './CdError';
import Subscriptions from './Subscriptions';
import cd from './cd';
import controller from './controller';
import sectionRegistry from './sectionRegistry';
import { handleApiReject, splitIntoBatches } from './utils-api';
import { definedAndNotNull, spacesToUnderlines, unique } from './utils-general';

/**
 * Class implementing DiscussionTools' topic subscriptions.
 *
 * @augments Subscriptions
 */
class DtSubscriptions extends Subscriptions {
  /** @type {string} */
  pageSubscribeId;

  /**
   * Request the subscription list from the server and assign it to the instance.
   *
   * @returns {Promise.<void>}
   */
  async load() {
    if (!cd.user.isRegistered()) return;

    const title = spacesToUnderlines(mw.config.get('wgTitle'));
    this.pageSubscribeId ||= `p-topics-${cd.g.namespaceNumber}:${title}`;
    this.data = await this.getSubscriptions(
      sectionRegistry
        .getAll()
        .map((section) => section.subscribeId)
        .filter(definedAndNotNull)
        .filter(unique)
        .concat(this.pageSubscribeId || [])
    );
  }

  /**
   * Process subscriptions when they are
   * {@link DtSubscriptions#loadToTalkPage loaded to a talk page}.
   *
   * @param {import('./BootProcess').default} [bootProcess]
   */
  processOnTalkPage(bootProcess) {
    if (bootProcess?.isFirstRun()) {
      this.addPageSubscribeButton();
    }

    super.processOnTalkPage();
  }

  /**
   * Test if the subscription list is loaded.
   *
   * @returns {boolean}
   */
  areLoaded() {
    return Boolean(this.data);
  }

  /**
   * Get a list of subscriptions for a list of section IDs from the server.
   *
   * @param {string[]} ids List of section IDs.
   * @returns {Promise.<import('./Subscriptions').SubscriptionsData>}
   */
  async getSubscriptions(ids) {
    if (!ids.length) {
      return {};
    }

    /**
     * @typedef {object} ApiDtSubscriptions
     * @property {{ [id: string]: 0 | 1 }} subscriptions
     */

    const intValuesToBoolean = (/** @type {ApiDtSubscriptions['subscriptions']} */ obj) =>
      Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, Boolean(value)]));

    const subscriptions = /** @type {import('./Subscriptions').SubscriptionsData} */ ({});
    for (const nextIds of splitIntoBatches(ids)) {
      const request = controller.getApi().post({
        action: 'discussiontoolsgetsubscriptions',
        commentname: nextIds,
      }).catch(handleApiReject);
      const response = /** @type {ApiDtSubscriptions} */ (await request);
      Object.assign(subscriptions, intValuesToBoolean(response.subscriptions));
    }

    return subscriptions;
  }

  /**
   * Add a page subscribe button (link) to the page actions menu.
   *
   * @private
   */
  async addPageSubscribeButton() {
    if (!cd.user.isRegistered() || cd.page.isArchive() || $('#ca-dt-page-subscribe').length) return;

    const portletLink = mw.util.addPortletLink(
      'p-cactions',
      mw.util.getUrl(cd.g.pageName, {
        action: this.getState(this.pageSubscribeId) ? 'dtunsubscribe' : 'dtsubscribe',
        commentname: this.pageSubscribeId,
      }),
      '',
      'ca-cd-page-subscribe'
    );
    if (!portletLink) return;

    this.pageSubscribeButton = new Button({
      buttonElement: /** @type {HTMLElement} */ (portletLink.firstElementChild),
      action: async () => {
        this.pageSubscribeButton.setPending(true);
        try {
          if (this.getState(this.pageSubscribeId)) {
            await this.unsubscribe(this.pageSubscribeId);
          } else {
            await this.subscribe(this.pageSubscribeId);
          }
          this.updatePageSubscribeButton();
        } finally {
          this.pageSubscribeButton.setPending(false);
        }
      },
    });
    this.updatePageSubscribeButton();
  }

  /**
   * Subscribe to or unsubscribe from a topic.
   *
   * @param {string} subscribeId Section's DiscussionTools ID.
   * @param {string|undefined} id Section's ID.
   * @param {boolean} subscribe Subscribe or unsubscribe.
   * @throws {CdError}
   * @private
   */
  async changeSubscription(subscribeId, id, subscribe) {
    if (subscribeId === undefined) {
      throw new CdError();
    }

    try {
      await controller.getApi().postWithEditToken({
        action: 'discussiontoolssubscribe',
        page: cd.page.name + (id ? `#${id}` : ''),
        commentname: subscribeId,
        subscribe,
      }).catch(handleApiReject);
    } catch (error) {
      mw.notify(cd.s('error-settings-save'), { type: 'error' });
      throw error;
    }

    this.updateLocally(subscribeId, subscribe);
  }

  /**
   * Add a section present on the current page to the subscription list.
   *
   * @param {string} subscribeId
   * @param {string} [id]
   * @returns {Promise.<void>}
   * @protected
   */
  actuallySubscribe(subscribeId, id) {
    return this.changeSubscription(subscribeId, id, true);
  }

  /**
   * Remove a section present on the current page from the subscription list.
   *
   * @param {string} subscribeId
   * @param {string} [id]
   * @returns {Promise.<void>}
   * @protected
   */
  actuallyUnsubscribe(subscribeId, id) {
    return this.changeSubscription(subscribeId, id, false);
  }

  /**
   * Update the page subscription button label and tooltip.
   *
   * @protected
   */
  updatePageSubscribeButton() {
    this.pageSubscribeButton
      .setLabel(
        this.getState(this.pageSubscribeId) ?
          cd.mws('discussiontools-newtopicssubscription-button-unsubscribe-label') :
          cd.mws('discussiontools-newtopicssubscription-button-subscribe-label')
      )
      .setTooltip(
        this.getState(this.pageSubscribeId) ?
          cd.mws('discussiontools-newtopicssubscription-button-unsubscribe-tooltip') :
          cd.mws('discussiontools-newtopicssubscription-button-subscribe-tooltip')
      );
  }
}

export default DtSubscriptions;
