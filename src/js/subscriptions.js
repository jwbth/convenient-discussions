/**
 * Singleton related to the subscriptions feature, including the DisussionTools' topic subscription
 * and CD's legacy section watching.
 *
 * @class subscriptions
 */

import Button from './Button';
import CdError from './CdError';
import SectionStatic from './SectionStatic';
import cd from './cd';
import controller from './controller';
import settings from './settings';
import {
  dtSubscribe,
  getDtSubscriptions,
  getLegacySubscriptions,
  saveLegacySubscriptions,
} from './apiWrappers';
import { spacesToUnderlines, unique, wrap } from './utils';

let subscribeLegacyPromise = Promise.resolve();

export default {
  /**
   * _For internal use._ Setup the data for the native topic subscription feature (not the CD's
   * legacy section watching).
   */
  setupTopicSubscription() {
    this.pageSubscribeId = `p-topics-${cd.g.namespaceNumber}:${spacesToUnderlines(mw.config.get('wgTitle'))}`;
  },

  /**
   * Request the subscription list from the server and assign them to the `registry` (and
   * `allPagesRegistry` in case of the legacy subscriptions) property.
   *
   * @param {boolean} [reuse=false] For legacy subscriptions: Reuse the existing request.
   * @returns {Promise.<object>}
   */
  load(reuse = false) {
    this.loadRequest = (async () => {
      if (settings.get('useTopicSubscription')) {
        this.registry = await getDtSubscriptions(
          SectionStatic.getAll()
            .filter((section) => section.subscribeId)
            .map((section) => section.subscribeId)
            .filter(unique)
            .concat(this.pageSubscribeId || [])
        );
      } else {
        this.allPagesRegistry = await getLegacySubscriptions(reuse);

        const articleId = mw.config.get('wgArticleId');
        if (articleId) {
          this.allPagesRegistry[articleId] = this.allPagesRegistry[articleId] || {};
          this.registry = this.allPagesRegistry[articleId];

          const bootProcess = controller.getBootProcess();
          if (bootProcess) {
            // Manually add/remove a section that was added/removed at the same moment the page was
            // reloaded last time, so when we requested the watched sections from server, this
            // section wasn't there yet most probably.
            this.updateRegistry(bootProcess.data('justSubscribedToSection'), true);
            this.updateRegistry(bootProcess.data('justUnsubscribedFromSection'), false);
            bootProcess.deleteData('justSubscribedToSection');
            bootProcess.deleteData('justUnsubscribedFromSection');
          }
        }
      }
    })();

    return this.loadRequest;
  },

  /**
   * Get the request made in {@link subscriptions.load}.
   *
   * @returns {Promise.<undefined>}
   */
  getLoadRequest() {
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
   */
  async saveLegacy(registry) {
    if (settings.get('useTopicSubscription')) return;

    await saveLegacySubscriptions(registry || this.allPagesRegistry);
  },

  /**
   * Update the subscription list by adding or removing a subscription. It's a local operation -
   * nothing is saved to the server.
   *
   * @param {string} subscribeId Section's subscribe ID (modern or legact format).
   * @param {boolean} subscribe Subscribe or unsubscribe.
   * @private
   */
  updateRegistry(subscribeId, subscribe) {
    if (subscribeId === undefined) return;

    // `this.registry` can be not set on just created pages with DT subscriptions enabled.
    this.registry ||= {};

    this.registry[subscribeId] = Boolean(subscribe);

    if (!subscribe && !settings.get('useTopicSubscription')) {
      delete this.registry[subscribeId];
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
      await dtSubscribe(subscribeId, id, subscribe);
    } catch (e) {
      mw.notify(cd.s('error-settings-save'), { type: 'error' });
      throw e;
    }

    this.updateRegistry(subscribeId, subscribe);
    this.maybeShowNotice();
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

      // We save the full subscription list, so we need to update the registry first.
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
    subscribeLegacyPromise = subscribeLegacyPromise.then(subscribe, subscribe);

    return subscribeLegacyPromise;
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

      const backupRegistry = Object.assign({}, this.registry);
      this.updateRegistry(headline, false);

      try {
        await this.saveLegacy();
      } catch (e) {
        this.registry = backupRegistry;
        mw.notify(cd.s('error-settings-save'), { type: 'error' });
        throw e;
      }
    };

    // Don't run in parallel
    subscribeLegacyPromise = subscribeLegacyPromise.then(unsubscribe, unsubscribe);

    return subscribeLegacyPromise;
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
      mw.notify(wrap(body), { title, autoHideSeconds });
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
      mw.notify(wrap(body), { title, autoHideSeconds });
    }
  },

  /**
   * For legacy subscriptions: Get the IDs of the pages that have subscriptions.
   *
   * @returns {number[]}
   */
  getPageIds() {
    if (settings.get('useTopicSubscription') || !this.areLoaded()) {
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
    if (settings.get('useTopicSubscription') || !this.areLoaded()) {
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

    if (this.registry[subscribeId] === undefined) {
      return null;
    }

    return this.registry[subscribeId];
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
    if (settings.get('useTopicSubscription')) return;

    this.originalList = Object.keys(this.registry);

    let updated = false;
    Object.keys(this.registry)
      .filter((headline) => (
        SectionStatic.getAll().every((section) => section.headline !== headline)
      ))
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
   *
   * @private
   */
  maybeShowNotice() {
    if (!settings.get('useTopicSubscription') || settings.get('useTopicSubscription-seenNotice')) {
      return;
    }

    OO.ui.alert(
      $('<div>')
        .append(
          $('<img>')
            .attr('width', 512)
            .attr('height', 253)
            .attr('src', '//upload.wikimedia.org/wikipedia/commons/thumb/0/01/Screenshot_of_topic_subscription_prototype.png/512px-Screenshot_of_topic_subscription_prototype.png')
            .addClass('cd-tsnotice-img'),
          wrap(cd.sParse('topicsubscription-notice'), {
            callbacks: {
              'cd-notification-notificationSettings': () => {
                controller.showSettingsDialog('notifications');
              },
            },
            targetBlank: true,
            tagName: 'div',
          }).addClass('cd-tsnotice-text'),
        )
        .children(),
      { size: 'large' }
    );

    settings.saveSettingOnTheFly('useTopicSubscription-seenNotice', true);
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

  /**
   * _For internal use._ Add a page subscribe button (link) to the page actions menu.
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
      label: cd.s('newTopicsSubscription-popup-title'),
      $content: $('<div>').append(
        $('<p>').text(cd.s('newTopicsSubscription-popup-text')),
        $('<p>').append(button.$element),
      ).children(),
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
