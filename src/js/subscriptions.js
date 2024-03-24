/**
 * Singleton related to the subscriptions feature, including DisussionTools' topic subscription and
 * CD's legacy section watching.
 *
 * @module subscriptions
 */

import Button from './Button';
import CdError from './CdError';
import LZString from 'lz-string';
import SectionStatic from './SectionStatic';
import cd from './cd';
import controller from './controller';
import pageRegistry from './pageRegistry';
import settings from './settings';
import userRegistry from './userRegistry';
import { getUserInfo, handleApiReject, saveLocalOption, splitIntoBatches } from './apiWrappers';
import { spacesToUnderlines, unique, wrapHtml } from './utils';

const subscriptions = {
  subscribeLegacyPromise: Promise.resolve(),

  /**
   * Request the subscription list from the server and assign them to the `data` (and
   * `allPagesData` in case of the legacy subscriptions) property.
   *
   * @param {import('./BootProcess').default} [bootProcess]
   * @returns {Promise.<object>}
   */
  async load(bootProcess) {
    if (!userRegistry.getCurrent().isRegistered() || !settings.get('useTopicSubscription')) return;

    if (settings.get('useTopicSubscription')) {
      const title = spacesToUnderlines(mw.config.get('wgTitle'));
      this.pageSubscribeId ||= `p-topics-${cd.g.namespaceNumber}:${title}`;
      this.data = await this.getDtSubscriptions(
        SectionStatic.getAll()
          .filter((section) => section.subscribeId)
          .map((section) => section.subscribeId)
          .filter(unique)
          .concat(this.pageSubscribeId || [])
      );
    }

    this.process(bootProcess);
  },

  /**
   * Get a list of DiscussionTools subscriptions for a list of section IDs from the server.
   *
   * @param {string[]} ids List of section IDs.
   * @returns {Promise.<object>}
   */
  async getDtSubscriptions(ids) {
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
  },

  /**
   * Request the legacy subscription list from the server and assign them to the `data` and
   * `allPagesData` properties.
   *
   * @param {boolean} [reuse=false] Reuse the existing request.
   * @param {import('./BootProcess').default} [bootProcess]
   * @returns {Promise.<object>}
   */
  async loadLegacy(reuse = false, bootProcess) {
    if (!userRegistry.getCurrent().isRegistered() || settings.get('useTopicSubscription')) return;

    // `mw.user.options` is not used even on first run because it appears to be cached sometimes
    // which can be critical for determining subscriptions.
    this.allPagesData = (
      mw.user.options.get(cd.g.subscriptionsOptionName) !== null ||
      !bootProcess?.isFirstRun()
    ) ?
      this.unpackLegacy(await getUserInfo(reuse).then(({ subscriptions }) => subscriptions)) :
      {};

    const articleId = mw.config.get('wgArticleId');
    if (articleId) {
      this.allPagesData[articleId] ||= {};
      this.data = this.allPagesData[articleId];

      if (bootProcess) {
        // Manually add/remove a section that was added/removed at the same moment the page was
        // reloaded last time, so when we requested the watched sections from server, this
        // section wasn't there yet most probably.
        this.updateData(bootProcess.data('justSubscribedToSection'), true);
        this.updateData(bootProcess.data('justUnsubscribedFromSection'), false);
        bootProcess.deleteData('justSubscribedToSection');
        bootProcess.deleteData('justUnsubscribedFromSection');
      }
    }

    this.process(bootProcess);
  },

  /**
   * Get the request made in {@link .load}.
   *
   * @param {import('./BootProcess').default} [bootProcess]
   */
  process(bootProcess) {
    // FIXME: decouple

    if (controller.isTalkPage()) {
      if (controller.doesPageExist()) {
        SectionStatic.addSubscribeButtons();
        this.cleanUpLegacy();
      }
      if (bootProcess.isFirstRun()) {
        this.addPageSubscribeButton();
      }
    }
  },

  /**
   * Add a page subscribe button (link) to the page actions menu.
   *
   * @private
   */
  async addPageSubscribeButton() {
    if (!settings.get('useTopicSubscription')) return;

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
  },

  /**
   * Test if the subscription list is loaded.
   *
   * @returns {boolean}
   */
  areLoaded() {
    return Boolean(this.data || this.allPagesData);
  },

  /**
   * Update the subscription list by adding or removing a subscription. It's a local operation -
   * nothing is saved to the server.
   *
   * @param {string} subscribeId Section's subscribe ID (modern or legact format).
   * @param {boolean} subscribe Subscribe or unsubscribe.
   * @private
   */
  updateData(subscribeId, subscribe) {
    if (subscribeId === undefined) return;

    // `this.data` can be not set on newly created pages with DT subscriptions enabled.
    this.data ||= {};

    this.data[subscribeId] = Boolean(subscribe);

    if (!subscribe && !settings.get('useTopicSubscription')) {
      delete this.data[subscribeId];
    }
  },

  /**
   * Subscribe to a section.
   *
   * @param {string} subscribeId Section's DiscussionTools ID.
   * @param {string} id Section's ID.
   * @param {string} [unsubscribeHeadline] Headline of a section to unsubscribe from (at the same
   * time).
   * @param {boolean} [quiet=false] Don't show a success notification.
   */
  async subscribe(subscribeId, id, unsubscribeHeadline, quiet = false) {
    await (
      settings.get('useTopicSubscription') ?
        this.dtSubscribe(subscribeId, id, true) :
        this.subscribeLegacy(subscribeId, unsubscribeHeadline)
    );

    if (!quiet) {
      const title = subscribeId.startsWith('p-') ?
        cd.mws('discussiontools-newtopicssubscription-notify-subscribed-title') :
        cd.mws('discussiontools-topicsubscription-notify-subscribed-title');
      let body = subscribeId.startsWith('p-') ?
        cd.mws('discussiontools-newtopicssubscription-notify-subscribed-body') :
        cd.mws('discussiontools-topicsubscription-notify-subscribed-body');
      let autoHideSeconds;
      if (!settings.get('useTopicSubscription')) {
        body += ' ' + cd.sParse('section-watch-openpages');
        if ($('#ca-watch').length) {
          body += ' ' + cd.sParse('section-watch-pagenotwatched');
          autoHideSeconds = 'long';
        }
      }
      mw.notify(wrapHtml(body), { title, autoHideSeconds });
    }
  },

  /**
   * Unsubscribe from a section.
   *
   * @param {string} subscribeId Section's DiscussionTools ID.
   * @param {string} id Section's ID.
   * @param {boolean} [quiet=false] Don't show a success notification.
   * @param {import('./Section').default} [section] Section being unsubscribed from, if any, for
   *   legacy subscriptions.
   */
  async unsubscribe(subscribeId, id, quiet = false, section) {
    await (
      settings.get('useTopicSubscription') ?
        this.dtSubscribe(subscribeId, id, false) :
        this.unsubscribeLegacy(subscribeId)
    );

    const ancestorSubscribedTo = section?.getClosestSectionSubscribedTo();
    if (!quiet || ancestorSubscribedTo) {
      const title = subscribeId.startsWith('p-') ?
        cd.mws('discussiontools-newtopicssubscription-notify-unsubscribed-title') :
        cd.mws('discussiontools-topicsubscription-notify-unsubscribed-title');
      let body = subscribeId.startsWith('p-') ?
        cd.mws('discussiontools-newtopicssubscription-notify-unsubscribed-body') :
        cd.mws('discussiontools-topicsubscription-notify-unsubscribed-body');
      let autoHideSeconds;
      if (ancestorSubscribedTo) {
        body += ' ' + cd.sParse('section-unwatch-stillwatched', ancestorSubscribedTo.headline);
        autoHideSeconds = 'long';
      }
      mw.notify(wrapHtml(body), { title, autoHideSeconds });
    }
  },

  /**
   * Subscribe to or unsubscribe from a topic.
   *
   * @param {string} subscribeId Section's DiscussionTools ID.
   * @param {string} id Section's ID.
   * @param {boolean} subscribe Subscribe or unsubscribe.
   * @throws {CdError}
   * @private
   */
  async dtSubscribe(subscribeId, id, subscribe) {
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

    this.updateData(subscribeId, subscribe);
  },

  /**
   * Add a section present on the current page to the legacy subscription list.
   *
   * @param {string} headline
   * @param {string} [unsubscribeHeadline] Headline of section to unsubscribe from (used when a
   *   section is renamed on the fly in {@link Comment#update} or {@link CommentForm#submit}).
   * @returns {Promise.<undefined>}
   * @throws {CdError}
   * @private
   */
  subscribeLegacy(headline, unsubscribeHeadline) {
    const subscribe = async () => {
      try {
        await this.load();
      } catch (e) {
        mw.notify(cd.s('error-settings-load'), { type: 'error' });
        throw e;
      }

      // We save the full subscription list, so we need to update the data first.
      const dataBackup = Object.assign({}, this.data);
      this.updateData(headline, true);
      this.updateData(unsubscribeHeadline, false);

      try {
        await this.saveLegacy();
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
    this.subscribeLegacyPromise = this.subscribeLegacyPromise.then(subscribe, subscribe);

    return this.subscribeLegacyPromise;
  },

  /**
   * Remove a section present on the current page from the legacy subscription list.
   *
   * @param {string} headline
   * @returns {Promise.<undefined>}
   * @throws {CdError}
   * @private
   */
  unsubscribeLegacy(headline) {
    const unsubscribe = async () => {
      try {
        await this.load();
      } catch (e) {
        mw.notify(cd.s('error-settings-load'), { type: 'error' });
        throw e;
      }

      const dataBackup = Object.assign({}, this.data);
      this.updateData(headline, false);

      try {
        await this.saveLegacy();
      } catch (e) {
        this.data = dataBackup;
        mw.notify(cd.s('error-settings-save'), { type: 'error' });
        throw e;
      }
    };

    // Don't run in parallel
    this.subscribeLegacyPromise = this.subscribeLegacyPromise.then(unsubscribe, unsubscribe);

    return this.subscribeLegacyPromise;
  },

  /**
   * Save the subscription list to the server as a user option.
   *
   * @param {object} data
   */
  async saveLegacy(data) {
    if (settings.get('useTopicSubscription')) return;

    await saveLocalOption(
      cd.g.subscriptionsOptionName,
      LZString.compressToEncodedURIComponent(
        this.packLegacy(data || this.allPagesData)
      )
    );
  },

  /**
   * Pack the legacy subscriptions object into a string for further compression.
   *
   * @param {object} data
   * @returns {string}
   */
  packLegacy(data) {
    return Object.keys(data)
      .filter((pageId) => Object.keys(data[pageId]).length)
      .map((key) => ` ${key} ${Object.keys(data[key]).join('\n')}\n`)
      .join('')
      .trim();
  },

  /**
   * Unpack a legacy subscriptions string into an object.
   *
   * @param {string} string
   * @returns {object}
   */
  unpackLegacy(string) {
    const data = {};
    const pages = string.split(/(?:^|\n )(\d+) /).slice(1);
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
  },

  /**
   * For legacy subscriptions: Get the IDs of pages that have subscriptions.
   *
   * @returns {number[]}
   */
  getPageIds() {
    if (settings.get('useTopicSubscription') || !this.areLoaded()) {
      return null;
    }

    return Object.keys(this.allPagesData);
  },

  /**
   * For legacy subscriptions: Get the subscription list for a page.
   *
   * @param {number} pageId
   * @returns {?(object[])}
   */
  getForPageId(pageId) {
    if (settings.get('useTopicSubscription') || !this.areLoaded()) {
      return null;
    }

    return Object.keys(this.allPagesData[pageId] || {});
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
   * Get the subscription state of a section or the page.
   *
   * @param {string} subscribeId
   * @returns {?boolean}
   * @throws {CdError}
   */
  getState(subscribeId) {
    if (!this.areLoaded()) {
      throw new CdError();
    }

    if (this.data[subscribeId] === undefined) {
      return null;
    }

    return this.data[subscribeId];
  },

  /**
   * Check whether the user was subscribed to a section when the page was loaded.
   *
   * @param {string} headline Headline.
   * @returns {boolean}
   */
  getOriginalState(headline) {
    return this.originalList?.includes(headline);
  },

  /**
   * Remove sections that can't be found on the page anymore from the legacy subscription list and
   * save it to the server.
   *
   * @private
   */
  cleanUpLegacy() {
    if (settings.get('useTopicSubscription')) return;

    this.originalList = Object.keys(this.data);

    let updated = false;
    Object.keys(this.data)
      .filter((headline) => (
        SectionStatic.getAll().every((section) => section.headline !== headline)
      ))
      .forEach((headline) => {
        delete this.data[headline];
        updated = true;
      });

    if (updated) {
      this.saveLegacy();
    }
  },

  /**
   * _For internal use._ Convert the subscription list to the standard format, with section IDs as
   * keys instead of array elements, to store it.
   *
   * @param {string[]} arr Array of section IDs.
   * @returns {object[]}
   */
  itemsToKeys(arr) {
    return Object.assign({}, ...arr.map((page) => ({ [page]: true })));
  },

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
  },

  /**
   * Update the page subscription button label and tooltip.
   *
   * @private
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
  },
};

// tweakUserOoUiClass();
// mixinUserOoUiClass();

export default subscriptions;
