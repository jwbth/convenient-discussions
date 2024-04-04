import Button from './Button';
import CdError from './CdError';
import Subscriptions from './Subscriptions';
import cd from './cd';
import controller from './controller';
import pageRegistry from './pageRegistry';
import sectionRegistry from './sectionRegistry';
import settings from './settings';
import userRegistry from './userRegistry';
import { handleApiReject, splitIntoBatches } from './utils-api';
import { spacesToUnderlines, unique } from './utils-general';

/**
 * Class implementing DiscussionTools' topic subscriptions.
 */
class DtSubscriptions extends Subscriptions {
  type = 'dt';

  /**
   * Request the subscription list from the server and assign it to the instance.
   *
   * @returns {Promise.<undefined>}
   */
  async load() {
    if (!userRegistry.getCurrent().isRegistered()) return;

    const title = spacesToUnderlines(mw.config.get('wgTitle'));
    this.pageSubscribeId ||= `p-topics-${cd.g.namespaceNumber}:${title}`;
    this.data = await this.getSubscriptions(
      sectionRegistry.getAll()
        .filter((section) => section.subscribeId)
        .map((section) => section.subscribeId)
        .filter(unique)
        .concat(this.pageSubscribeId || [])
    );
  }

  /**
   * Process subscriptions when they are {@link .loadToTalkPage loaded to a talk page}.
   *
   * @param {import('./BootProcess').default} [bootProcess]
   * @param {Promise} [visitsPromise]
   */
  process(bootProcess, visitsPromise) {
    if (bootProcess?.isFirstRun()) {
      this.addPageSubscribeButton();
    }

    super.process(bootProcess, visitsPromise);
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
   * @returns {Promise.<object>}
   */
  async getSubscriptions(ids) {
    const subscriptions = {};
    for (const nextIds of splitIntoBatches(ids)) {
      Object.assign(
        subscriptions,
        (await controller.getApi().post({
          action: 'discussiontoolsgetsubscriptions',
          commentname: nextIds,
        }).catch(handleApiReject)).subscriptions
      );
    }
    return subscriptions;
  }

  /**
   * Add a page subscribe button (link) to the page actions menu.
   *
   * @private
   */
  async addPageSubscribeButton() {
    this.pageSubscribeButton = new Button({
      element: mw.util.addPortletLink(
        'p-cactions',
        mw.util.getUrl(cd.g.pageName, {
          action: this.getState(this.pageSubscribeId) ? 'dtunsubscribe' : 'dtsubscribe',
          commentname: this.pageSubscribeId,
        }),
        '',
        'ca-cd-page-subscribe'
      )?.firstElementChild,
      action: async () => {
        this.pageSubscribeButton.setPending(true);
        try {
          await this[this.getState(this.pageSubscribeId) ? 'unsubscribe' : 'subscribe'](
            this.pageSubscribeId,
            null
          );
          this.updatePageSubscribeButton();
        } finally {
          this.pageSubscribeButton.setPending(false);
        }
      },
    });
    this.updatePageSubscribeButton();
    this.onboardOntoPageSubscription();
  }

  /**
   * Subscribe to or unsubscribe from a topic.
   *
   * @param {string} subscribeId Section's DiscussionTools ID.
   * @param {string} id Section's ID.
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
        page: pageRegistry.getCurrent().name + (id ? `#${id}` : ''),
        commentname: subscribeId,
        subscribe,
      }).catch(handleApiReject);
    } catch (e) {
      mw.notify(cd.s('error-settings-save'), { type: 'error' });
      throw e;
    }

    this.updateLocally(subscribeId, subscribe);
  }

  /**
   * Add a section present on the current page to the subscription list.
   *
   * @param {string} subscribeId
   * @param {string} id Unused.
   * @returns {Promise.<undefined>}
   * @protected
   */
  actuallySubscribe(subscribeId, id) {
    return this.changeSubscription(subscribeId, id, true);
  }

  /**
   * Remove a section present on the current page from the subscription list.
   *
   * @param {string} subscribeId
   * @param {string} id Unused.
   * @returns {Promise.<undefined>}
   * @protected
   */
  actuallyUnsubscribe(subscribeId, id) {
    return this.changeSubscription(subscribeId, id, false);
  }

  /**
   * Show an popup onboarding onto the new topics subscription feature.
   *
   * @private
   */
  onboardOntoPageSubscription() {
    if (
      settings.get('newTopicsSubscription-onboarded') ||
      !this.pageSubscribeButton.element ||

      // Buggy
      (cd.g.skin.startsWith('vector') && window.scrollY > 70) ||

      // Left column hidden in Timeless
      (cd.g.skin === 'timeless' && window.innerWidth < 1100)
    ) {
      return;
    }

    const button = new OO.ui.ButtonWidget({
      label: cd.mws('visualeditor-educationpopup-dismiss'),
      flags: ['progressive', 'primary'],
    });
    button.on('click', () => {
      popup.toggle(false);
    });
    let $floatableContainer;
    const $vectorToolsDropdown = $('.vector-page-tools-dropdown');
    if (cd.g.skin === 'vector') {
      $floatableContainer = $('#p-cactions');
    } else if ($vectorToolsDropdown.is(':visible')) {
      $floatableContainer = $vectorToolsDropdown;
    } else {
      $floatableContainer = $(this.pageSubscribeButton.element);
    }
    const popup = new OO.ui.PopupWidget({
      icon: 'newspaper',
      label: cd.s('newtopicssubscription-popup-title'),
      $content: $.cdMerge(
        $('<p>').text(cd.s('newtopicssubscription-popup-text')),
        $('<p>').append(button.$element),
      ),
      head: true,
      $floatableContainer,
      $container: $(document.body),
      position: cd.g.skin === 'vector-2022' ? 'before' : 'below',
      padded: true,
      classes: ['cd-popup-onboarding', 'cd-popup-onboarding-newTopicsSubscription'],
    });
    $(document.body).append(popup.$element);
    popup.toggle(true);
    popup.on('closing', () => {
      settings.saveSettingOnTheFly('newTopicsSubscription-onboarded', true);
    });
  }
}

export default DtSubscriptions;
