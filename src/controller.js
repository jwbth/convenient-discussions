/**
 * Singleton that stores and changes the overall state of the page, initiating boot processes and
 * reacting to events.
 *
 * @module controller
 */

import Autocomplete from './Autocomplete';
import BootProcess from './BootProcess';
import Comment from './Comment';
import CommentForm from './CommentForm';
import DtSubscriptions from './DtSubscriptions';
import ElementsTreeWalker from './ElementsTreeWalker';
import LegacySubscriptions from './LegacySubscriptions';
import LiveTimestamp from './LiveTimestamp';
import Parser from './Parser';
import Subscriptions from './Subscriptions';
import Thread from './Thread';
import addCommentLinks from './addCommentLinks';
import cd from './cd';
import commentFormRegistry from './commentFormRegistry';
import commentRegistry from './commentRegistry';
import debug from './debug';
import init from './init';
import navPanel from './navPanel';
import notifications from './notifications';
import pageRegistry from './pageRegistry';
import sectionRegistry from './sectionRegistry';
import settings from './settings';
import toc from './toc';
import updateChecker from './updateChecker';
import { getUserInfo } from './utils-api';
import { defined, definedAndNotNull, getLastArrayElementOrSelf, getQueryParamBooleanValue, isHeadingNode, isInline, isProbablyTalkPage, sleep } from './utils-general';
import { mixEventEmitterInObject } from './utils-oojs';
import { copyText, createSvg, getVisibilityByRects, skin$, wrapHtml } from './utils-window';
import visits from './visits';
import WebpackWorker from './worker/worker-gate';

export default {
  content: {},
  scrollData: { offset: null },
  autoScrolling: false,
  isUpdateThreadLinesHandlerAttached: false,
  lastScrollX: 0,
  originalPageTitle: document.title,
  lastCheckedRevisionId: null,
  addedCommentCount: 0,
  areRelevantCommentsAdded: false,
  relevantAddedCommentIds: null,
  commentsNotifiedAbout: [],
  isObstructingElementHoveredCached: false,

  /**
   * _For internal use._ Assign some properties required by the controller - those which are not
   * known from the beginning - and run the boot process (on talk page or comment links page).
   */
  init() {
    this.$content = $('#mw-content-text');

    if (cd.g.isMobile) {
      $(document.body).addClass('cd-mobile');
    }

    // Not constants: go() may run a second time, see app~maybeAddFooterSwitcher().
    const isEnabledInQuery = getQueryParamBooleanValue('cdtalkpage') === true;
    const isDisabledInQuery = getQueryParamBooleanValue('cdtalkpage') === false;

    // See .isDefinitelyTalkPage()
    this.definitelyTalkPage = Boolean(
      isEnabledInQuery ||

      // .cd-talkPage is used as a last resort way to make CD parse the page, as opposed to using
      // the list of supported namespaces and page white/black list in the configuration. With this
      // method, there won't be "comment" links for edits on pages that list revisions such as the
      // watchlist.
      this.$content.find('.cd-talkPage').length ||

      (
        ($('#ca-addsection').length || cd.g.pageWhitelistRegexp?.test(cd.g.pageName)) &&
        !cd.g.pageBlacklistRegexp?.test(cd.g.pageName)
      )
    );

    // See .isArticlePageTalkPage()
    this.articlePageTalkPage = (
      (!mw.config.get('wgIsRedirect') || !this.isCurrentRevision()) &&
      !this.$content.find('.cd-notTalkPage').length &&
      (isProbablyTalkPage(cd.g.pageName, cd.g.namespaceNumber) || this.definitelyTalkPage) &&

      // Undocumented setting
      !(typeof cdOnlyRunByFooterLink !== 'undefined' && window.cdOnlyRunByFooterLink)
    );

    // See .isDiffPage()
    this.diffPage = /[?&]diff=[^&]/.test(location.search);

    this.talkPage = Boolean(
      mw.config.get('wgIsArticle') &&
      !isDisabledInQuery &&
      (isEnabledInQuery || this.articlePageTalkPage)
    );

    this.bootOnTalkPage();
    this.bootOnCommentLinksPage();
  },

  /**
   * Load the data required for the script to run on a talk page and execute the
   * {@link BootProcess boot process}.
   *
   * @private
   */
  bootOnTalkPage() {
    if (!this.isTalkPage()) return;

    debug.stopTimer('start');
    debug.startTimer('load data');

    /**
     * Last boot process.
     *
     * @type {BootProcess|undefined}
     * @private
     */
    this.bootProcess = new BootProcess();

    let siteDataRequests = [];

    // Make some requests in advance if the API module is ready in order not to make 2 requests
    // sequentially. We don't make a `userinfo` request, because if there is more than one tab in
    // the background, this request is made and the execution stops at mw.loader.using, which
    // results in overriding the renewed visits setting of one tab by another tab (the visits are
    // loaded by one tab, then another tab, then written by one tab, then by another tab).
    if (mw.loader.getState('mediawiki.api') === 'ready') {
      siteDataRequests = init.getSiteData();

      // We are _not_ calling getUserInfo() here to avoid losing visit data updates from some pages
      // if several pages are opened simultaneously. In this situation, visits could be requested
      // for multiple pages; updated and then saved for each of them with losing the updates from
      // the rest.
    }

    const modules = [
      'jquery.client',
      'jquery.ui',
      'mediawiki.Title',
      'mediawiki.Uri',
      'mediawiki.api',
      'mediawiki.cookie',

      // span.comment
      'mediawiki.interface.helpers.styles',

      'mediawiki.jqueryMsg',
      'mediawiki.notification',
      'mediawiki.storage',
      'mediawiki.user',
      'mediawiki.util',
      'mediawiki.widgets.visibleLengthLimit',
      'oojs',
      'oojs-ui-core',
      'oojs-ui-widgets',
      'oojs-ui-windows',
      'oojs-ui.styles.icons-alerts',
      'oojs-ui.styles.icons-content',
      'oojs-ui.styles.icons-editing-advanced',
      'oojs-ui.styles.icons-editing-citation',
      'oojs-ui.styles.icons-editing-core',
      'oojs-ui.styles.icons-interactions',
      'oojs-ui.styles.icons-movement',
      'user.options',
      mw.loader.getState('ext.confirmEdit.CaptchaInputWidget') ?
        'ext.confirmEdit.CaptchaInputWidget' :
        undefined,
    ].filter(defined);

    // mw.loader.using() delays the execution even if all modules are ready (if CD is used as a
    // gadget with preloaded dependencies, for example), so we use this trick.
    let modulesRequest;
    if (modules.every((module) => mw.loader.getState(module) === 'ready')) {
      // If there is no data to load and, therefore, no period of time within which a reflow (layout
      // thrashing) could happen without impeding performance, we cache the value so that it could
      // be used in .saveRelativeScrollPosition() without causing a reflow.
      if (siteDataRequests.every((request) => request.state() === 'resolved')) {
        this.bootProcess.passedData = { scrollY: window.scrollY };
      }
    } else {
      modulesRequest = mw.loader.using(modules);
    }

    this.showLoadingOverlay();
    Promise.all([modulesRequest, ...siteDataRequests]).then(
      async () => {
        // Do it here because OO.EventEmitter can be unavailable when these modules are first
        // imported.
        mixEventEmitterInObject(this);
        mixEventEmitterInObject(visits);
        mixEventEmitterInObject(updateChecker);
        mixEventEmitterInObject(LiveTimestamp);
        mixEventEmitterInObject(commentFormRegistry);
        mixEventEmitterInObject(commentRegistry);
        mixEventEmitterInObject(Thread);
        OO.mixinClass(Subscriptions, OO.EventEmitter);
        OO.mixinClass(CommentForm, OO.EventEmitter);

        await this.tryExecuteBootProcess();
      },
      (e) => {
        mw.notify(cd.s('error-loaddata'), { type: 'error' });
        console.error(e);
        this.hideLoadingOverlay();
      }
    );

    sleep(15000).then(() => {
      if (this.booting) {
        this.hideLoadingOverlay();
        console.warn('The loading overlay stays for more than 15 seconds; removing it.');
      }
    });

    this.$contentColumn = skin$({
      timeless: '#mw-content',
      minerva: '#bodyContent',
      default: '#content',
    });

    /*
      Additions of CSS set a stage for a future reflow which delays operations dependent on
      rendering, so we run them now, not after the requests are fulfilled, to save time. The overall
      order is like this:
      1. Make network requests (above).
      2. Run operations dependent on rendering, such as window.getComputedStyle() and jQuery's
         .css() (below). Normally they would initiate a reflow, but, as we haven't changed the
         layout or added CSS yet, there is nothing to update.
      3. Run operations that create prerequisites for a reflow, such as adding CSS (below). Thanks
         to the fact that the network requests, if any, are already pending, we don't waste time.
     */
    init.memorizeCssValues();
    init.addTalkPageCss();
  },

  /**
   * @class Api
   * @memberof mw
   * @see https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.Api
   */

  /**
   * Get a
   * {@link https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.Api mw.Api} instance.
   *
   * @returns {mw.Api}
   */
  getApi() {
    this.api ||= new mw.Api(cd.getApiConfig());

    return this.api;
  },

  /**
   * _For internal use._ Get the worker object.
   *
   * @returns {Worker}
   */
  getWorker() {
    if (!this.worker) {
      this.worker = /** @type {Worker} */ (new WebpackWorker());
    }

    return this.worker;
  },

  /**
   * Create an OOUI window manager or return an existing one.
   *
   * @param {string} [name='default'] Name of the window manager. We may need more than one if we,
   *   for some reason, want to have more than one window open at any moment.
   * @returns {OO.ui.WindowManager}
   */
  getWindowManager(name = 'default') {
    this.windowManagers ||= {};

    if (!this.windowManagers[name]) {
      const windowManager = new OO.ui.WindowManager();
      windowManager.on('closing', async (win, closed) => {
        // We don't have windows that can be reused.
        await closed;
        windowManager.clearWindows();
      });

      $(OO.ui.getTeleportTarget?.() || document.body).append(windowManager.$element);
      this.windowManagers[name] = windowManager;
    }

    return this.windowManagers[name];
  },

  /**
   * Get the popup overlay used for OOUI components.
   *
   * @returns {JQuery}
   */
  getPopupOverlay() {
    this.$popupOverlay ??= $('<div>')
      .addClass('cd-popupOverlay')
      .appendTo(document.body);
    return this.$popupOverlay;
  },

  /**
   * Show the loading overlay (a logo in the corner of the page).
   *
   * @private
   */
  showLoadingOverlay() {
    if (window.cdShowLoadingOverlay === false) return;

    if (!this.$loadingPopup) {
      this.$loadingPopup = $('<div>')
        .addClass('cd-loadingPopup')
        .append(
          $('<div>')
            .addClass('cd-loadingPopup-logo cd-icon')
            .append(
              $('<div>').addClass('cd-loadingPopup-logo-partBackground'),
              createSvg(55, 55, 50, 50).html(
                `<path fill-rule="evenodd" clip-rule="evenodd" d="M42.5 10H45C46.3261 10 47.5979 10.5268 48.5355 11.4645C49.4732 12.4021 50 13.6739 50 15V50L40 40H15C13.6739 40 12.4021 39.4732 11.4645 38.5355C10.5268 37.5979 10 36.3261 10 35V32.5H37.5C38.8261 32.5 40.0979 31.9732 41.0355 31.0355C41.9732 30.0979 42.5 28.8261 42.5 27.5V10ZM5 3.05176e-05H35C36.3261 3.05176e-05 37.5979 0.526815 38.5355 1.4645C39.4732 2.40218 40 3.67395 40 5.00003V25C40 26.3261 39.4732 27.5979 38.5355 28.5355C37.5979 29.4732 36.3261 30 35 30H10L0 40V5.00003C0 3.67395 0.526784 2.40218 1.46447 1.4645C2.40215 0.526815 3.67392 3.05176e-05 5 3.05176e-05ZM19.8 23C14.58 23 10.14 21.66 8.5 17H31.1C29.46 21.66 25.02 23 19.8 23ZM13.4667 7.50561C12.9734 7.17597 12.3933 7.00002 11.8 7.00002C11.0043 7.00002 10.2413 7.31609 9.6787 7.8787C9.11607 8.44131 8.8 9.20437 8.8 10C8.8 10.5934 8.97595 11.1734 9.30559 11.6667C9.6352 12.1601 10.1038 12.5446 10.6519 12.7717C11.2001 12.9987 11.8033 13.0581 12.3853 12.9424C12.9672 12.8266 13.5018 12.5409 13.9213 12.1213C14.3409 11.7018 14.6266 11.1672 14.7424 10.5853C14.8581 10.0033 14.7987 9.40015 14.5716 8.85197C14.3446 8.30379 13.9601 7.83526 13.4667 7.50561ZM27.8 7.00002C28.3933 7.00002 28.9734 7.17597 29.4667 7.50561C29.9601 7.83526 30.3446 8.30379 30.5716 8.85197C30.7987 9.40015 30.8581 10.0033 30.7424 10.5853C30.6266 11.1672 30.3409 11.7018 29.9213 12.1213C29.5018 12.5409 28.9672 12.8266 28.3853 12.9424C27.8033 13.0581 27.2001 12.9987 26.6519 12.7717C26.1038 12.5446 25.6352 12.1601 25.3056 11.6667C24.9759 11.1734 24.8 10.5934 24.8 10C24.8 9.20437 25.1161 8.44131 25.6787 7.8787C26.2413 7.31609 27.0043 7.00002 27.8 7.00002Z" />`
              )
            )
        );
      $(document.body).append(this.$loadingPopup);
    } else {
      this.$loadingPopup.show();
    }
  },

  /**
   * Hide the loading overlay.
   *
   * @private
   */
  hideLoadingOverlay() {
    if (!this.$loadingPopup || window.cdShowLoadingOverlay === false) return;

    this.$loadingPopup.hide();
  },

  /**
   * Is there any kind of a page overlay present, like the OOUI modal overlay or CD loading overlay.
   * This runs very frequently.
   *
   * @returns {boolean}
   */
  isPageOverlayOn() {
    return document.body.classList.contains('oo-ui-windowManager-modal-active') || this.booting;
  },

  /**
   * Run the {@link BootProcess boot process} and catch errors.
   *
   * @param {boolean} isReload Is the page reloaded.
   * @private
   */
  async tryExecuteBootProcess(isReload) {
    this.booting = true;

    // We could say "let it crash", but unforeseen errors in BootProcess#execute() are just too
    // likely to go without a safeguard.
    try {
      await this.bootProcess.execute(isReload);
      if (isReload) {
        mw.hook('wikipage.content').fire(this.$content);
      }
      this.emit('boot');
    } catch (e) {
      mw.notify(cd.s('error-processpage'), { type: 'error' });
      console.error(e);
      this.hideLoadingOverlay();
    }

    this.booting = false;
  },

  /**
   * Get the offset data related to `.$contentColumn`.
   *
   * @param {boolean} [reset=false] Whether to bypass cache.
   * @returns {object}
   */
  getContentColumnOffsets(reset = false) {
    if (!this.contentColumnOffsets || reset) {
      const prop = cd.g.contentDirection === 'ltr' ? 'padding-left' : 'padding-right';
      let startMargin = Math.max(parseFloat(this.$contentColumn.css(prop)), cd.g.contentFontSize);

      // The content column in Timeless has no _borders_ as such, so it's wrong to penetrate the
      // surrounding area from the design point of view.
      if (cd.g.skin === 'timeless') {
        startMargin--;
      }

      const left = this.$contentColumn.offset().left;
      const width = this.$contentColumn.outerWidth();
      this.contentColumnOffsets = {
        startMargin,
        start: cd.g.contentDirection === 'ltr' ? left : left + width,
        end: cd.g.contentDirection === 'ltr' ? left + width : left,
      };

      // This is set only on window resize event. The initial value is set in
      // init.addTalkPageCss() through a style tag.
      if (reset) {
        $(document.documentElement).css('--cd-content-start-margin', startMargin + 'px');
      }
    }

    return this.contentColumnOffsets;
  },

  /**
   * Load the data required for the script to process the page as a log page and
   * {@link module:addCommentLinks process it}.
   *
   * @private
   */
  bootOnCommentLinksPage() {
    if (
      !this.isWatchlistPage() &&
      !this.isContributionsPage() &&
      !this.isHistoryPage() &&
      !(this.isDiffPage() && this.isArticlePageTalkPage()) &&

      // Instant Diffs script can be called on talk pages as well
      !this.isTalkPage()
    ) {
      return;
    }

    // Make some requests in advance if the API module is ready in order not to make 2 requests
    // sequentially.
    if (mw.loader.getState('mediawiki.api') === 'ready') {
      init.getSiteData();

      // Loading user info on diff pages could lead to problems with saving visits when many pages
      // are opened, but not yet focused, simultaneously.
      if (!this.isTalkPage()) {
        getUserInfo(true).catch((e) => {
          console.warn(e);
        });
      }
    }

    mw.loader.using([
      'jquery.client',
      'mediawiki.Title',
      'mediawiki.api',
      'mediawiki.jqueryMsg',
      'mediawiki.user',
      'mediawiki.util',
      'oojs',
      'oojs-ui-core',
      'oojs-ui-widgets',
      'oojs-ui-windows',
      'oojs-ui.styles.icons-alerts',
      'oojs-ui.styles.icons-editing-list',
      'oojs-ui.styles.icons-interactions',
      'user.options',
    ]).then(
      () => {
        addCommentLinks();

        // See the comment above: "Additions of CSS...".
        require('./global.less');

        require('./logPages.less');
      },
      (e) => {
        mw.notify(cd.s('error-loaddata'), { type: 'error' });
        console.error(e);
      }
    );
  },

  /**
   * Check whether the current page is likely a talk page. See
   * {@link module:controller.isDefinitelyTalkPage} for the most strict criteria.
   *
   * @returns {boolean}
   */
  isTalkPage() {
    return this.talkPage;
  },

  /**
   * Check whether the current page is a watchlist or recent changes page.
   *
   * @returns {boolean}
   */
  isWatchlistPage() {
    return ['Recentchanges', 'Watchlist'].includes(mw.config.get('wgCanonicalSpecialPageName'));
  },

  /**
   * Check whether the current page is a contributions page.
   *
   * @returns {boolean}
   */
  isContributionsPage() {
    return mw.config.get('wgCanonicalSpecialPageName') === 'Contributions';
  },

  /**
   * Check whether the current page is a history page.
   *
   * @returns {boolean}
   */
  isHistoryPage() {
    return cd.g.pageAction === 'history' && isProbablyTalkPage(cd.g.pageName, cd.g.namespaceNumber);
  },

  /**
   * Check whether the current page is a diff page.
   *
   * This is not a constant: the diff may be removed from the page (and the URL updated, see
   * `.cleanUpUrlAndDom()`) when it's for the last revision and the page is reloaded using the
   * script. `wgIsArticle` config value is not taken into account: if the "Do not show page content
   * below diffs" MediaWiki setting is on, `wgIsArticle` is false.
   *
   * @returns {boolean}
   */
  isDiffPage() {
    return this.diffPage;
  },

  /**
   * Check whether the current page meets strict criteria for classifying as a talk page. See
   * {@link module:controller.isTalkPage} for approximate criteria.
   *
   * @returns {boolean}
   */
  isDefinitelyTalkPage() {
    return this.definitelyTalkPage;
  },

  /**
   * Check if the _article_ page (the one with `wgIsArticle` being true) of the current page is a
   * talk page eligible for CD. It can be `true` on edit, history pages etc. Although the
   * assessments may be different on a history page and on an article page of the same title, since
   * the page can contain elements with special classes that we can access only on the article page.
   *
   * @returns {boolean}
   */
  isArticlePageTalkPage() {
    return this.articlePageTalkPage;
  },

  /**
   * Is the page loading (the loading overlay is on).
   *
   * @returns {boolean}
   */
  isBooting() {
    return this.booting;
  },

  /**
   * Get the current (or last available) boot process.
   *
   * @returns {?BootProcess}
   */
  getBootProcess() {
    return this.bootProcess || null;
  },

  /**
   * Set up the controller for use in the current boot process. (Executed at every page load.)
   *
   * @param {string} pageHtml HTML to update the page with.
   */
  setup(pageHtml) {
    // RevisionSlider replaces the #mw-content-text element.
    if (!this.$content[0]?.parentNode) {
      this.$content = $('#mw-content-text');
    }

    if (pageHtml) {
      const div = document.createElement('div');
      div.innerHTML = pageHtml;
      this.rootElement = div.firstChild;
      this.$root = $(this.rootElement);
    } else {
      // There can be more than one .mw-parser-output child, e.g. on talk pages of IP editors.
      this.$root = this.$content.children('.mw-parser-output').first();

      // 404 pages
      if (!this.$root.length) {
        this.$root = this.$content;
      }

      this.rootElement = this.$root[0];
    }

    // Add the class immediately, not at the end of the boot process, to prevent the issue when any
    // unexpected error prevents this from being executed. Then, when
    // this.handleWikipageContentHookFirings() is called with #mw-content-text element for some
    // reason, the page can go into an infinite reloading loop.
    this.$root.addClass('cd-parse-started');
  },

  /**
   * Set whether the current page is a talk page.
   *
   * @param {boolean} value
   */
  setTalkPageness(value) {
    this.talkPage = Boolean(value);
  },

  /**
   * Is the displayed revision the current (last known) revision of the page.
   *
   * @returns {boolean}
   */
  isCurrentRevision() {
    // RevisionSlider may show a revision newer than the revision in wgCurRevisionId due to a bug
    // (when navigating forward, at least twice, from a revision older than the revision in
    // wgCurRevisionId after some revisions were added). Unfortunately, it doesn't update the
    // wgCurRevisionId value.
    return mw.config.get('wgRevisionId') >= mw.config.get('wgCurRevisionId');
  },

  /**
   * Save the scroll position relative to the first element in the viewport looking from the top of
   * the page.
   *
   * @param {?boolean} [switchToAbsolute=null] If this value is `true` or `false` and the viewport
   *   is above the bottom of the table of contents, then use
   *   {@link module:controller.saveScrollPosition} (this allows for better precision).
   * @param {number} scrollY Cached horizontal scroll value used to avoid reflow.
   */
  saveRelativeScrollPosition(switchToAbsolute = null, scrollY = window.scrollY) {
    // The viewport has the TOC bottom or is above it.
    if (
      switchToAbsolute !== null &&
      !toc.isInSidebar() &&
      toc.isPresent() &&
      scrollY < toc.getBottomOffset()
    ) {
      this.saveScrollPosition(switchToAbsolute);
    } else {
      this.scrollData.element = null;
      this.scrollData.elementTop = null;
      this.scrollData.touchesBottom = false;
      this.scrollData.offsetBottom = (
        document.documentElement.scrollHeight - (scrollY + window.innerHeight)
      );

      // The number 100 accounts for various content moves by scripts running on the page (like
      // HotCat that may add an empty category list).
      if (this.scrollData.offsetBottom < 100) {
        this.scrollData.touchesBottom = true;
      } else if (
        scrollY !== 0 &&
        this.rootElement.getBoundingClientRect().top <= cd.g.bodyScrollPaddingTop
      ) {
        const treeWalker = new ElementsTreeWalker(
          this.rootElement.firstElementChild,
          this.rootElement
        );
        while (true) {
          const node = treeWalker.currentNode;

          if (!isInline(node) && !this.getFloatingElements().includes(node)) {
            const rect = node.getBoundingClientRect();

            // By default, in a conversation between two people, replies are nested and there is no
            // way to isolate the parent comment from the child, which would be desirable to find a
            // good reference element. To work around this, we resort to this line, which stops the
            // search at the first element fully below the viewport top (if there is a reference
            // element already). Its shortcoming is that if 1) the only element we met with its
            // bottom below the viewport top is too large to be used as a reference, 2) the first
            // element small enough has its top below the viewport (i.e., there is a gap between it
            // and the previous element that has the viewport top right in the middle) - we end up
            // without a convenient reference element. To compensate for this, we use an offset of
            // cd.g.contentFontSize (we're unlikely to see a bigger gap between elements).
            if (
              rect.top > cd.g.bodyScrollPaddingTop + cd.g.contentFontSize &&
              this.scrollData.element &&
              !isHeadingNode(node)
            ) {
              break;
            }

            if (rect.height !== 0 && rect.bottom >= cd.g.bodyScrollPaddingTop) {
              this.scrollData.element = node;
              this.scrollData.elementTop = rect.top;
              if (treeWalker.firstChild()) {
                continue;
              } else {
                break;
              }
            }
          }
          if (!treeWalker.nextSibling()) break;
        }
      }
    }
  },

  /**
   * Restore the scroll position saved in {@link module:controller.saveRelativeScrollPosition}.
   *
   * @param {boolean} [switchToAbsolute=false] Restore the absolute position using
   *   {@link module:controller.restoreScrollPosition} if
   *   {@link module:controller.saveScrollPosition} was previously used for saving the position.
   */
  restoreRelativeScrollPosition(switchToAbsolute = false) {
    if (switchToAbsolute && this.scrollData.offset !== null) {
      this.restoreScrollPosition();
    } else {
      if (this.scrollData.touchesBottom && window.scrollY !== 0) {
        window.scrollTo(
          0,
          document.documentElement.scrollHeight - window.innerHeight - this.scrollData.offsetBottom
        );
      } else if (this.scrollData.element) {
        const rect = this.scrollData.element.getBoundingClientRect();
        if (getVisibilityByRects(rect)) {
          window.scrollTo(0, window.scrollY + rect.top - this.scrollData.elementTop);
        } else {
          // In a collapsed thread?
          const closestHidden = this.scrollData.element.closest('.cd-hidden');
          if (closestHidden) {
            commentRegistry.getAll()
              .map((comment) => comment.thread)
              .filter(defined)
              .filter((thread) => thread.isCollapsed)
              .find((thread) => thread.collapsedRange.includes(closestHidden))
              ?.$expandNote
              .cdScrollTo('top', false);
          }
        }
      }
    }
  },

  /**
   * _For internal use._ Replace the element used for restoring saved relative scroll position with
   * a new element if it coincides with the provided element.
   *
   * @param {Element} element
   * @param {Element} newElement
   * @private
   */
  replaceScrollAnchorElement(element, newElement) {
    if (this.scrollData.element && element === this.scrollData.element) {
      this.scrollData.element = newElement;
    }
  },

  /**
   * Save the scroll position to restore it later with
   * {@link module:controller.restoreScrollPosition}.
   *
   * @param {boolean} [saveTocHeight=true] `false` is used for more fine control of scroll behavior
   *   when visits are loaded after a page reload.
   */
  saveScrollPosition(saveTocHeight = true) {
    this.scrollData.offset = window.scrollY;
    this.scrollData.tocHeight = (
      (saveTocHeight || this.scrollData.tocHeight) &&
      !toc.isInSidebar() &&
      toc.isPresent() &&
      !toc.isFloating() &&
      window.scrollY !== 0 &&

      // There is some content below the TOC in the viewport.
      toc.getBottomOffset() < window.scrollY + window.innerHeight
    ) ?
      toc.$element.outerHeight() :
      null;
  },

  /**
   * Restore the scroll position saved in {@link module:controller.saveScrollPosition}.
   *
   * @param {boolean} [resetTocHeight=true] `false` is used for more fine control of scroll behavior
   *   after page reloads.
   */
  restoreScrollPosition(resetTocHeight = true) {
    if (this.scrollData.offset === null) return;

    if (this.scrollData.tocHeight) {
      this.scrollData.offset += (toc.$element.outerHeight() || 0) - this.scrollData.tocHeight;
    }
    window.scrollTo(0, this.scrollData.offset);

    this.scrollData.offset = null;
    if (resetTocHeight) {
      this.scrollData.tocHeight = null;
    }
  },

  /**
   * Find closed discussions on the page.
   *
   * @returns {Element[]}
   */
  getClosedDiscussions() {
    this.content.closedDiscussions ||= this.$root
      .find(
        cd.config.closedDiscussionClasses
          .concat('mw-archivedtalk')
          .map((name) => `.${name}`)
          .join(', ')
      )
      .get();

    return this.content.closedDiscussions;
  },

  /**
   * Check whether there is at least one outdent template on the page. (If there is no, we don't
   * need to run many expensive operations.)
   *
   * @returns {boolean}
   */
  areThereOutdents() {
    this.content.areThereOutdents ??= Boolean(this.$root.find('.' + cd.config.outdentClass).length);
    return this.content.areThereOutdents;
  },

  /**
   * Find floating elements on the page.
   *
   * @returns {Element[]}
   */
  getFloatingElements() {
    if (!this.content.floatingElements) {
      // Describe all floating elements on the page in order to calculate the correct border
      // (temporarily setting `overflow: hidden`) for all comments they intersect with.
      const floatingElementSelector = [
        '.cd-floating',
        '.tleft',
        '.floatright',
        '.floatleft',
        '.mw-halign-right',
        '.mw-halign-left',
        '*[style*="float:right"]',
        '*[style*="float: right"]',
        '*[style*="float:left"]',
        '*[style*="float: left"]',
        'figure[typeof~="mw:File/Thumb"]',
        'figure[typeof~="mw:File/Frame"]',
        ...this.getTsFloatingElementSelectors(),
      ].join(', ');

      // Can't use jQuery here anyway, as .find() doesn't take into account ancestor elements, such
      // as .mw-parser-output, in selectors. Remove all known elements that never intersect comments
      // from the collection.
      this.content.floatingElements = [
        ...this.rootElement.querySelectorAll(floatingElementSelector)
      ].filter((el) => !el.classList.contains('cd-ignoreFloating'));
    }

    return this.content.floatingElements;
  },

  /**
   * Find floating and hidden (`display: none`) elements on the page.
   *
   * @returns {Element[]}
   */
  getHiddenElements() {
    if (!this.hiddenElements) {
      const hiddenElementSelector = this.getTsHiddenElementSelectors().join(', ');
      this.hiddenElements = hiddenElementSelector ?
        [...this.rootElement.querySelectorAll(hiddenElementSelector)] :
        [];
    }

    return this.hiddenElements;
  },

  /**
   * Get the selectors for floating elements mentioned in the TemplateStyles tags on the page.
   *
   * @returns {string[]}
   * @private
   */
  getTsFloatingElementSelectors() {
    if (!this.content.tsSelectorsFloating) {
      this.extractTemplateStylesSelectors();
    }

    return this.content.tsSelectorsFloating;
  },

  /**
   * Get the selectors for hidden elements mentioned in the TemplateStyles tags on the page.
   *
   * @returns {string[]}
   * @private
   */
  getTsHiddenElementSelectors() {
    if (!this.content.tsSelectorsHidden) {
      this.extractTemplateStylesSelectors();
    }

    return this.content.tsSelectorsHidden;
  },

  /**
   * Extract and memorize the classes mentioned in the TemplateStyles tags on the page.
   *
   * @private
   */
  extractTemplateStylesSelectors() {
    this.content.tsSelectorsFloating = [];
    this.content.tsSelectorsHidden = [];
    const extractSelectors = (rule) => {
      if (rule instanceof CSSStyleRule) {
        const style = rule.style;
        if (style.float === 'left' || style.float === 'right') {
          this.content.tsSelectorsFloating.push(rule.selectorText);
        }
        if (style.display === 'none') {
          this.content.tsSelectorsHidden.push(rule.selectorText);
        }
      } else if (rule instanceof CSSMediaRule) {
        [...rule.cssRules].forEach(extractSelectors);
      }
    };
    [...document.styleSheets]
      .filter((sheet) => sheet.href?.includes('site.styles'))
      .forEach((el) => {
        try {
          [...el.cssRules].forEach(extractSelectors);
        } catch {
          // CSS rules on other domains can be inaccessible
        }
      });
    [...this.rootElement.querySelectorAll('style')].forEach((el) => {
      [...el.sheet.cssRules].forEach(extractSelectors);
    });
  },

  /**
   * Check whether there is "LTR inside RTL" or "RTL inside LTR" nesting on the page.
   *
   * @returns {boolean}
   */
  areThereLtrRtlMixes() {
    this.content.areThereLtrRtlMixes ??= Boolean(
      document.querySelector('.mw-content-ltr .mw-content-rtl, .mw-content-rtl .mw-content-ltr')
    );
    return this.content.areThereLtrRtlMixes;
  },

  /**
   * Add a condition preventing page unload.
   *
   * @param {string} name
   * @param {Function} condition
   */
  addPreventUnloadCondition(name, condition) {
    this.beforeUnloadHandlers ||= {};
    this.beforeUnloadHandlers[name] = (e) => {
      if (!condition()) return;

      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    $(window).on('beforeunload', this.beforeUnloadHandlers[name]);
  },

  /**
   * Remove a condition preventing page unload.
   *
   * @param {string} name
   */
  removePreventUnloadCondition(name) {
    if (!this.beforeUnloadHandlers[name]) return;

    $(window).off('beforeunload', this.beforeUnloadHandlers[name]);
    delete this.beforeUnloadHandlers[name];
  },

  /**
   * _For internal use._ Handle a mouse move event (including `mousemove` and `mouseover`).
   *
   * @param {Event} e
   */
  handleMouseMove(e) {
    if (this.mouseMoveBlocked || this.isAutoScrolling() || this.isPageOverlayOn()) return;

    // Don't throttle. Without throttling, performance is generally OK, while the "frame rate" is
    // about 50 (so, the reaction time is about 20ms). Lower values would be less comfortable.
    this.emit('mouseMove', e);
  },

  /**
   * _For internal use._ Are there elements obstructing the content area, like popups or windows.
   *
   * @returns {boolean}
   */
  isObstructingElementHovered() {
    if (this.notificationArea === undefined) {
      this.notificationArea = $('.mw-notification-area')[0];
      this.tocButton = $('#vector-page-titlebar-toc')[0];
      this.stickyHeader = $('#vector-sticky-header')[0];
      this.tocContent = $('.vector-dropdown-content')[0];
    }

    OO.ui.throttle(() => {
      // We just list everything we know that can stand between the user and the content area where
      // comments reside. This is a very ugly method I resorted to because I honestly don't know the
      // alternatives. We can't put any element out there to check :hover on it because the
      // absence of such an element for comments is the reason why we need to check for obstructing
      // elements in the first place. On the other hand, if this incorrectly returns `false`, this
      // doesn't really affect anything important. It's just for better visual effects. Use vanilla
      // JS where possible.
      this.isObstructingElementHoveredCached = Boolean(
        [
          ...(this.notificationArea?.querySelectorAll('.mw-notification') || []),
          Autocomplete.getActiveMenu(),
          navPanel.$element?.[0],
          ...document.body.querySelectorAll('.oo-ui-popupWidget:not(.oo-ui-element-hidden)'),
          $(document.body).children('dialog')[0],
          this.stickyHeader,
          sectionRegistry.getAll()
            .map((section) => section.actions.moreMenuSelect?.getMenu())
            .find((menu) => menu?.isVisible())
            ?.$element[0],
          this.tocButton,
          this.tocContent,
        ]
          .filter(definedAndNotNull)
          .some((el) => el.matches(':hover')) ||

        // WikiEditor dialog
        $(document.body).children('.ui-dialog').not('[style*="display: none"]').length
      );
    }, 100)();

    return this.isObstructingElementHoveredCached;
  },

  /**
   * Handles the window `resize` event as well as `orientationchange`.
   *
   * @private
   */
  async handleWindowResize() {
    // sleep(), because it seems like sometimes it doesn't have time to update.
    await sleep(cd.g.skin === 'vector-2022' ? 100 : 0);

    this.getContentColumnOffsets(true);
    this.emit('resize');
    this.handleScroll();
  },

  /**
   * Handles `keydown` event on the document.
   *
   * @param {Event} e
   * @private
   */
  handleGlobalKeyDown(e) {
    if (this.isPageOverlayOn()) return;

    this.emit('keyDown', e);
  },

  /**
   * _For internal use._ Handle a document's `scroll` event: Register seen comments, update the
   * navigation panel's first unseen button, and update the current section block. Trigger the
   * `horizontalscroll` event.
   */
  handleScroll() {
    // Scroll will be handled when the autoscroll is finished.
    if (this.isAutoScrolling()) return;

    this.mouseMoveBlocked = true;

    // Throttle handling scroll to run not more than once in 300ms. Wait before running, otherwise
    // comments may be registered as seen after a press of Page Down/Page Up. One scroll in Chrome,
    // Firefox with Page Up/Page Down takes a little less than 200ms, but 200ms proved to be not
    // enough, so we try 300ms.
    this.throttledHandleScroll ||= OO.ui.throttle(() => {
      this.mouseMoveBlocked = false;

      if (this.isAutoScrolling()) return;

      this.emit('scroll');
    }, 300);
    this.throttledHandleScroll();

    if (window.scrollX !== this.lastScrollX) {
      $(document).trigger('horizontalscroll.cd');
    }
    this.lastScrollX = window.scrollX;
  },

  /**
   * Handle a `horizontalscroll` event, triggered from {@link module:controller.handleScroll}.
   *
   * @private
   */
  handleHorizontalScroll() {
    this.emit('horizontalScroll');
  },

  /**
   * Handle a `popstate` event, including clicks on links pointing to comment anchors.
   *
   * @private
   */
  handlePopState() {
    // Use `popstate`, not `hashchange`, because we need to handle cases when the user clicks a link
    // with the same fragment as is in the URL.
    try {
      this.emit('popState', decodeURIComponent(location.hash.slice(1)));
    } catch (e) {
      console.error(e);
    }

    // Make sure the title has no incorrect new comment count when the user presses the "Back"
    // button after an (internal) page reload.
    this.updatePageTitle();
  },

  /**
   * Handle a `selectionchange` event.
   *
   * @private
   */
  handleSelectionChange() {
    this.throttledHandleSelectionChange ||= OO.ui.throttle(() => {
      this.emit('selectionChange');
    }, 200);
    this.throttledHandleSelectionChange();
  },

  /**
   * Handle page (content area) mutations.
   *
   * @private
   */
  handlePageMutate() {
    if (this.booting) return;

    this.emit('mutate');

    // Could also run this.handleScroll() here, but not sure, as it would double the execution
    // time with rare effect.
  },

  /**
   * Handle a click on an "Add topic" button excluding those added by the script.
   *
   * @param {Event} e
   * @private
   */
  handleAddTopicButtonClick(e) {
    if (e.ctrlKey || e.shiftKey || e.metaKey) return;

    const $button = $(e.currentTarget);
    let preloadConfig;
    let newTopicOnTop = false;
    if ($button.is('a')) {
      const { searchParams } = new URL($button.prop('href'));
      preloadConfig = {
        editIntro: getLastArrayElementOrSelf(searchParams.getAll('editintro')),
        commentTemplate: getLastArrayElementOrSelf(searchParams.getAll('preload')),
        headline: getLastArrayElementOrSelf(searchParams.getAll('preloadtitle')),
        params: searchParams.getAll('preloadparams[]'),
        summary: getLastArrayElementOrSelf(searchParams.getAll('summary'))?.replace(/^.+?\*\/ */, ''),
        noHeadline: Boolean(getLastArrayElementOrSelf(searchParams.getAll('nosummary'))),
        omitSignature: Boolean(searchParams.get('cdomitsignature')),
      };
      newTopicOnTop = getLastArrayElementOrSelf(searchParams.getAll('section')) === '0';
    } else {
      // <input>
      const $form = $button.closest('form');
      preloadConfig = {
        editIntro: $form.find('input[name="editintro"]').val(),
        commentTemplate: $form.find('input[name="preload"]').val(),
        headline: $form.find('input[name="preloadtitle"]').val(),
        params: $form.find('input[name="preloadparams[]"]').get().map((el) => el.value),
        summary: $form.find('input[name="summary"]').val(),
        noHeadline: Boolean($form.find('input[name="nosummary"]').val()),
        omitSignature: false,
      };
    }

    e.preventDefault();
    cd.page.addSection(undefined, undefined, preloadConfig, newTopicOnTop);
  },

  /**
   * _For internal use._ Add event listeners to `window`, `document`, hooks.
   */
  addEventListeners() {
    if (!settings.get('reformatComments')) {
      // The `mouseover` event allows to capture the state when the cursor is not moving but ends up
      // above a comment but not above any comment parts (for example, as a result of scrolling).
      // The benefit may be low compared to the performance cost, but it's unexpected when the user
      // scrolls a comment and it suddenly stops being highlighted because the cursor is between
      // neighboring <p>s.
      $(document).on('mousemove mouseover', this.handleMouseMove.bind(this));
    }

    // We need the `visibilitychange` event because many things may move while the document is
    // hidden, and movements are not processed when the document is hidden.
    $(document)
      .on('scroll visibilitychange', this.handleScroll.bind(this))
      .on('horizontalscroll.cd visibilitychange', this.handleHorizontalScroll.bind(this))
      .on('selectionchange', this.handleSelectionChange.bind(this));

    $(window)
      .on('resize orientationchange', this.handleWindowResize.bind(this))
      .on('popstate', this.handlePopState.bind(this));

    // Should be above mw.hook('wikipage.content').fire so that it runs for the whole page content
    // as opposed to $('.cd-comment-author-wrapper').
    mw.hook('wikipage.content').add(
      this.connectToCommentLinks.bind(this),
      this.highlightMentions.bind(this)
    );
    mw.hook('convenientDiscussions.previewReady').add(this.connectToCommentLinks.bind(this));

    // Mutation observer doesn't follow all possible comment position changes (for example,
    // initiated with adding new CSS) unfortunately.
    setInterval(this.handlePageMutate.bind(this), 1000);

    if (cd.page.isCommentable()) {
      $(document).on('keydown', this.handleGlobalKeyDown.bind(this));
    }

    mw.hook('wikipage.content').add(this.handleWikipageContentHookFirings.bind(this));

    updateChecker
      .on('check', (revisionId) => {
        this.lastCheckedRevisionId = revisionId;
      })
      .on('commentsUpdate', this.updateAddedComments.bind(this));

    Thread
      .on('toggle', this.handleScroll.bind(this));
  },

  /**
   * Bind a click handler to comment links to make them work as in-script comment links.
   *
   * This method exists in addition to {@link module:controller.handlePopState}. It's preferable to
   * have click events handled by this method instead of `.handlePopState()` because that method, if
   * encounters `cdJumpedToComment` in the history state, doesn't scroll to the comment which is a
   * wrong behavior when the user clicks a link.
   *
   * @param {JQuery} $content
   * @private
   */
  connectToCommentLinks($content) {
    if (!$content.is('#mw-content-text, .cd-commentForm-previewArea')) return;

    const goToCommentUrl = mw.util.getUrl('Special:GoToComment/');
    const extractCommentId = (el) => (
      $(el).attr('href').replace(mw.util.escapeRegExp(goToCommentUrl), '#').slice(1)
    );
    $content
      .find(`a[href^="#"], a[href^="${goToCommentUrl}"]`)
      .filter((i, el) => (
        // Added by us in other places
        !el.onclick &&

        commentRegistry.getByAnyId(extractCommentId(el), true)
      ))
      .on('click', function (e) {
        e.preventDefault();
        commentRegistry.getByAnyId(extractCommentId(this), true)?.scrollTo({
          expandThreads: true,
          pushState: true,
        });
      });
  },

  /**
   * Highlight mentions of the current user.
   *
   * @param {JQuery} $content
   * @private
   */
  highlightMentions($content) {
    if (!$content.is('#mw-content-text, .cd-comment-part')) return;

    const currentUserName = cd.user.getName();
    const excludeSelector = [
      settings.get('reformatComments') ?
        'cd-comment-author' :
        'cd-signature'
    ]
      .concat(cd.config.noSignatureClasses)
      .map((name) => `.${name}`)
      .join(', ');
    $content
      .find(
        $content.hasClass('cd-comment-part') ?
          `a[title$=":${currentUserName}"], a[title*=":${currentUserName} ("]` :
          `.cd-comment-part a[title$=":${currentUserName}"], .cd-comment-part a[title*=":${currentUserName} ("]`
      )
      .filter(function () {
        return (
          cd.g.userLinkRegexp.test(this.title) &&
          !this.closest(excludeSelector) &&
          Parser.processLink(this)?.userName === cd.user.getName()
        );
      })
      .each((i, link) => {
        link.classList.add('cd-currentUserLink');
      });
  },

  /**
   * Handle firings of the hook
   * {@link https://doc.wikimedia.org/mediawiki-core/master/js/Hooks.html#~event:'wikipage.content' wikipage.content}
   * (by using `mw.hook('wikipage.content').fire()`). This is performed by some user scripts, such
   * as QuickEdit.
   *
   * @param {JQuery} $content
   * @private
   */
  handleWikipageContentHookFirings($content) {
    if (!$content.is('#mw-content-text')) return;

    const $root = $content.children('.mw-parser-output');
    if ($root.length && !$root.hasClass('cd-parse-started')) {
      this.reload({ isPageReloadedExternally: true });
    }
  },

  /**
   * Reload the page via Ajax.
   *
   * @param {import('./BootProcess').PassedData} [passedData={}] Data passed from the previous page
   *   state. See {@link PassedData} for the list of possible properties. `html`, `unseenComments`
   *   properties are set in this function.
   * @throws {import('./CdError').default|Error}
   */
  async reload(passedData = {}) {
    if (this.booting) return;

    passedData.isRevisionSliderRunning = Boolean(history.state?.sliderPos);
    const bootProcess = new BootProcess(passedData);

    // We reset the live timestamps only during the boot process, because we shouldn't dismount the
    // components of the current version of the page at least until a correct response to the parse
    // request is received. Otherwise, if the request fails, the user would be left with a
    // dysfunctional page.

    this.emit('beforeReload', bootProcess.passedData);

    if (!bootProcess.passedData.commentIds && !bootProcess.passedData.sectionId) {
      this.saveScrollPosition();
    }

    debug.init();
    debug.startTimer('total time');
    debug.startTimer('get HTML');

    this.showLoadingOverlay();

    // Save time by requesting the options in advance. This also resets the cache since the `reuse`
    // argument is `false`.
    getUserInfo().catch((e) => {
      console.warn(e);
    });

    try {
      bootProcess.passedData.parseData = await cd.page.parse(null, false, true);
    } catch (e) {
      this.hideLoadingOverlay();
      if (bootProcess.passedData.submittedCommentForm) {
        throw e;
      } else {
        mw.notify(cd.s('error-reloadpage'), { type: 'error' });
        console.warn(e);
        return;
      }
    }

    mw.loader.load(bootProcess.passedData.parseData.modules);
    mw.loader.load(bootProcess.passedData.parseData.modulestyles);

    // It would be perhaps more correct to set the config variables in
    // controller.updatePageContents(), but we need wgDiscussionToolsPageThreads from there before
    // that.
    mw.config.set(bootProcess.passedData.parseData.jsconfigvars);

    // Get IDs of unseen comments. This is used to arrange that they will still be there after
    // replying on or refreshing the page.
    bootProcess.passedData.unseenComments = commentRegistry
      .query((comment) => comment.isSeen === false);

    // At this point, the boot process can't be interrupted, so we can remove all traces of the
    // current page state.
    this.bootProcess = bootProcess;

    this.emit('startReload');

    // Just submitted "Add section" form (it is outside of the .$root element, so we must remove it
    // here). Forms that should stay are detached above.
    if (bootProcess.passedData.submittedCommentForm?.getMode() === 'addSection') {
      bootProcess.passedData.submittedCommentForm.teardown();
    }

    this.reset();

    debug.stopTimer('get HTML');

    await this.tryExecuteBootProcess(true);

    this.emit('reload');

    if (!bootProcess.passedData.commentIds && !bootProcess.passedData.sectionId) {
      this.restoreScrollPosition(false);
    }
  },

  /**
   * _For internal use._ Update the page's HTML and certain configuration values.
   *
   * @param {object} parseData
   */
  updatePageContents(parseData) {
    this.$content.children('.mw-parser-output').first().replaceWith(this.$root);

    mw.util.clearSubtitle?.();
    mw.util.addSubtitle?.(parseData.subtitle);

    if ($('#catlinks').length) {
      const $categories = $($.parseHTML(parseData.categorieshtml));
      mw.hook('wikipage.categories').fire($categories);
      $('#catlinks').replaceWith($categories);
    }

    mw.config.set({
      wgRevisionId: parseData.revid,
      wgCurRevisionId: parseData.revid,
    });
  },

  /**
   * Reset the controller data and state. (Executed between page loads.)
   *
   * @private
   */
  reset() {
    this.cleanUpUrlAndDom();
    this.mutationObserver?.disconnect();
    commentRegistry.reset();
    sectionRegistry.reset();
    CommentForm.forgetOnTarget(cd.page, 'addSection');
    this.$emulatedAddTopicButton?.remove();
    delete this.$addTopicButtons;
    this.content = {};
    this.addedCommentCount = 0;
    this.areRelevantCommentsAdded = false;
    this.relevantAddedCommentIds = null;
    delete this.dtSubscribableThreads;
    this.updatePageTitle();
  },

  /**
   * Remove fragment and revision parameters from the URL; remove DOM elements related to the diff.
   */
  cleanUpUrlAndDom() {
    if (this.bootProcess.passedData.isRevisionSliderRunning) return;

    const { searchParams } = new URL(location.href);
    this.cleanUpDom(searchParams);
    this.cleanUpUrl(searchParams);
  },

  /**
   * Remove diff-related DOM elements.
   *
   * @param {URLSearchParams} searchParams
   * @private
   */
  cleanUpDom(searchParams) {
    if (!searchParams.has('diff') && !searchParams.has('oldid')) return;

    // Diff pages
    this.$content
      .children('.mw-revslider-container, .mw-diff-table-prefix, .diff, .oo-ui-element-hidden, .diff-hr, .diff-currentversion-title')
      .remove();

    // Revision navigation
    $('.mw-revision').remove();

    $('#firstHeading').text(cd.page.name);
    document.title = cd.mws('pagetitle', cd.page.name);
    this.originalPageTitle = document.title;
  },

  /**
   * Remove fragment and revision parameters from the URL.
   *
   * @param {URLSearchParams} searchParams
   * @private
   */
  cleanUpUrl(searchParams) {
    const newQuery = Object.fromEntries(searchParams.entries());

    // `title` will be added automatically (after /wiki/ if possible, as a query parameter
    // otherwise).
    delete newQuery.title;

    delete newQuery.curid;
    delete newQuery.action;
    delete newQuery.redlink;
    delete newQuery.section;
    delete newQuery.cdaddtopic;
    delete newQuery.dtnewcommentssince;
    delete newQuery.dtinthread;

    let methodName;
    if (newQuery.diff || newQuery.oldid) {
      methodName = 'pushState';

      delete newQuery.diff;
      delete newQuery.oldid;
      delete newQuery.diffmode;
      delete newQuery.type;

      // Make the "Back" browser button work.
      $(window).on('popstate', () => {
        const { searchParams } = new URL(location.href);
        if (searchParams.has('diff') || searchParams.has('oldid')) {
          location.reload();
        }
      });

      this.diffPage = false;
    } else if (!this.bootProcess.passedData.pushState) {
      // Don't reset the fragment if it will be set in the boot process from a comment ID or a
      // section ID, to avoid creating an extra history entry.
      methodName = 'replaceState';
    }

    if (methodName) {
      history[methodName](history.state, '', cd.page.getUrl(newQuery));
    }
  },

  /**
   * _For internal use._ Update the page title to show:
   * - What state the page is in according to the user's action (replying, editing, starting a
   *   section or subsection, or none).
   * - The number of comments added to the page since it was loaded. If used without parameters,
   *   restore the previous value (if could be changed by the browser when the "Back" button is
   *   clicked).
   */
  updatePageTitle() {
    let title = this.originalPageTitle;
    const lastActiveCommentForm = commentFormRegistry.getLastActive();
    if (lastActiveCommentForm) {
      const ending = lastActiveCommentForm
        .getTarget()
        .getCommentFormMethodName(lastActiveCommentForm.getMode())
        .toLowerCase();
      title = cd.s(`page-title-${ending}`, title);
    }

    if (this.addedCommentCount === 0) {
      // A hack for Chrome (at least) for cases when the "Back" button of the browser is clicked.
      document.title = '';
    }

    const relevantMark = this.areRelevantCommentsAdded ? '*' : '';
    document.title = title.replace(
      /^(?:\(\d+\*?\) )?/,
      this.addedCommentCount ?
        `(${this.addedCommentCount}${relevantMark}) ` :
        ''
    );
  },

  /**
   * _For internal use._ Check whether the page qualifies to be considered a long page (which
   * affects attempting performance improvements).
   *
   * @returns {boolean}
   */
  isLongPage() {
    this.content.longPage ??= $(document).height() > 15000;
    return this.content.longPage;
  },

  /**
   * Get the content root element (`.mw-parser-output` or `#mw-content-text`). Supposed to be used
   * via {@link convenientDiscussions.api.getRootElement}; inside the script, direct reference to
   * `controller.rootElement` is practiced.
   *
   * @returns {Element}
   */
  getRootElement() {
    return this.rootElement;
  },

  /**
   * Show an edit subscriptions dialog.
   */
  showEditSubscriptionsDialog() {
    if (this.isPageOverlayOn()) return;

    const dialog = new (require('./EditSubscriptionsDialog').default)();
    this.getWindowManager().addWindows([dialog]);
    this.getWindowManager().openWindow(dialog);
  },

  /**
   * Show a copy link dialog.
   *
   * @param {Comment|import('./Section').default} object Comment or section to copy a link to.
   * @param {Event} e
   */
  showCopyLinkDialog(object, e) {
    if (this.isPageOverlayOn()) return;

    e.preventDefault();

    const fragment = object.getWikilinkFragment();
    const type = object instanceof Comment ? 'comment' : 'section';
    const permalinkSpecialPagePrefix = (
      mw.config.get('wgFormattedNamespaces')[-1] +
      ':' +
      (
        type === 'comment' ?
          'GoToComment/' :
          cd.g.specialPageAliases.PermanentLink[0] + '/' + mw.config.get('wgRevisionId') + '#'
      )
    );
    const content = {
      fragment,
      wikilink: `[[${cd.page.name}#${fragment}]]`,
      currentPageWikilink: `[[#${fragment}]]`,
      permanentWikilink: `[[${permalinkSpecialPagePrefix}${fragment}]]`,
      link: object.getUrl(),
      permanentLink: type === 'comment' ?
        pageRegistry.get(
          mw.config.get('wgFormattedNamespaces')[-1] +
          ':' +
          'GoToComment/'
          + fragment
        ).getDecodedUrlWithFragment() :
        object.getUrl(true),
      copyMessages: {
        success: cd.s('copylink-copied'),
        fail: cd.s('copylink-error'),
      },
      jsCall: type === 'comment' ?
        `let c = convenientDiscussions.api.getCommentById('${object.id}');` :
        `let s = convenientDiscussions.api.getSectionById('${object.id}');`,
      jsBreakpoint: `this.id === '${object.id}'`,
      jsBreakpointTimestamp: type === 'comment' ?
        `timestamp.element.textContent === '${object.timestampText}'` :
        undefined,
    };

    // Undocumented feature allowing to copy a link of a default type without opening a dialog.
    const relevantSetting = type === 'comment' ?
      settings.get('defaultCommentLinkType') :
      settings.get('defaultSectionLinkType');
    if (!e.shiftKey && relevantSetting) {
      switch (relevantSetting) {
        case 'wikilink':
          copyText(content.wikilink, content.copyMessages);
          break;
        case 'link':
          copyText(content.link, content.copyMessages);
          break;
      }
      return;
    }

    const dialog = new (require('./CopyLinkDialog').default)(object, type, content);
    this.getWindowManager().addWindows([dialog]);
    this.getWindowManager().openWindow(dialog);
  },

  /**
   * Scroll to a specified position vertically.
   *
   * @param {number} y
   * @param {boolean} [smooth=true]
   * @param {Function} [callback]
   */
  scrollToY(y, smooth = true, callback) {
    const onComplete = () => {
      this.toggleAutoScrolling(false);
      this.handleScroll();
      callback?.();
    };

    if (smooth) {
      $('body, html').animate({ scrollTop: y }, {
        complete: function () {
          if (this !== document.documentElement) return;
          onComplete();
        },
      });
    } else {
      window.scrollTo(window.scrollX, y);
      onComplete();
    }
  },

  /**
   * Set whether the viewport is currently automatically scrolled to some position. To get that
   * state, use {@link module:controller.isAutoScrolling}.
   *
   * @param {boolean} value
   */
  toggleAutoScrolling(value) {
    this.autoScrolling = Boolean(value);
  },

  /**
   * Check whether the viewport is currently automatically scrolled to some position. To set that
   * state, use {@link module:controller.toggleAutoScrolling}.
   *
   * @returns {boolean}
   */
  isAutoScrolling() {
    return this.autoScrolling;
  },

  /**
   * Set up a
   * {@link https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver MutationObserver}
   * instance to handle page mutations.
   */
  async setupMutationObserver() {
    // Create the mutation observer in the next event loop iteration - let most DOM changes by CD
    // and scripts attached to the hooks to be made first to reduce the number of times it runs in
    // vain. But if we set a long delay, users will see comment backgrounds mispositioned for some
    // time.
    await sleep();

    this.mutationObserver = new MutationObserver((records) => {
      const layerClassRegexp = /^cd-comment(-underlay|-overlay|Layers)/;
      if (records.every((record) => layerClassRegexp.test(record.target.className))) return;

      this.handlePageMutate();
    });
    this.mutationObserver.observe(this.$content[0], {
      attributes: true,
      childList: true,
      subtree: true,
    });
  },

  /**
   * Show a regular notification (`mw.notification`) to the user.
   *
   * @param {import('./CommentSkeleton').CommentSkeletonLike[]} comments
   * @private
   */
  showRegularNotification(comments) {
    let filteredComments = [];
    if (settings.get('notifications') === 'all') {
      filteredComments = comments;
    } else if (settings.get('notifications') === 'toMe') {
      filteredComments = comments.filter((comment) => comment.isToMe);
    }

    if (settings.get('notifications') !== 'none' && filteredComments.length) {
      // Combine with content of notifications that were displayed but are still open (i.e., the
      // user most likely didn't see them because the tab is in the background). In the past there
      // could be more than one notification, now there can be only one.
      const openNotification = notifications.get()
        .find((data) => data.comments && data.notification.isOpen);
      if (openNotification) {
        filteredComments.push(...openNotification.comments);
      }
    }

    const wordSeparator = cd.mws('word-separator');

    if (filteredComments.length) {
      let html;
      const reloadHtml = cd.sParse(
        'notification-reload',

        // Note about the form data
        commentFormRegistry.getAll().some((cf) => cf.isAltered()) ?
          wordSeparator + cd.mws('parentheses', cd.s('notification-formdata')) :
          ''
      );
      if (filteredComments.length === 1) {
        const comment = filteredComments[0];
        if (comment.isToMe) {
          const where = comment.sectionSubscribedTo ?
            (
              wordSeparator +
              cd.s('notification-part-insection', comment.sectionSubscribedTo.headline)
            ) :
            wordSeparator + cd.s('notification-part-onthispage');
          html = (
            cd.sParse('notification-toyou', comment.author.getName(), comment.author, where) +
            wordSeparator +
            reloadHtml
          );
        } else {
          html = (
            cd.sParse(
              'notification-insection',
              comment.author.getName(),
              comment.author,
              comment.sectionSubscribedTo.headline
            ) +
            wordSeparator +
            reloadHtml
          );
        }
      } else {
        const isCommonSection = filteredComments.every((comment) => (
          comment.sectionSubscribedTo === filteredComments[0].sectionSubscribedTo
        ));
        const section = isCommonSection ? filteredComments[0].sectionSubscribedTo : undefined;
        const where = (
          wordSeparator +
          (
            section ?
              cd.s('notification-part-insection', section.headline) :
              cd.s('notification-part-onthispage')
          )
        );
        let mayBeRelevantString = cd.s('notification-newcomments-mayberelevant');
        if (!mayBeRelevantString.startsWith(cd.mws('comma-separator'))) {
          mayBeRelevantString = wordSeparator + mayBeRelevantString;
        }

        // "that may be relevant to you" text is not needed when the section is watched and the user
        // can clearly understand why they are notified.
        const mayBeRelevant = section ? '' : mayBeRelevantString;

        html = (
          cd.sParse('notification-newcomments', filteredComments.length, where, mayBeRelevant) +
          wordSeparator +
          reloadHtml
        );
      }

      const notification = notifications.add(
        wrapHtml(html),
        { tag: 'cd-newComments' },
        { comments: filteredComments }
      );
      notification.$notification.on('click', () => {
        this.reload({ commentIds: filteredComments.map((comment) => comment.id) });
      });
    }
  },

  /**
   * Show a desktop notification to the user.
   *
   * @param {import('./CommentSkeleton').CommentSkeletonLike[]} comments
   * @private
   */
  showDesktopNotification(comments) {
    let filteredComments = [];
    if (settings.get('desktopNotifications') === 'all') {
      filteredComments = comments;
    } else if (settings.get('desktopNotifications') === 'toMe') {
      filteredComments = comments.filter((comment) => comment.isToMe);
    }

    if (
      typeof Notification === 'undefined' ||
      Notification.permission !== 'granted' ||
      !filteredComments.length ||
      document.hasFocus()
    ) {
      return;
    }

    const wordSeparator = cd.mws('word-separator');

    let body;
    const comment = filteredComments[0];
    const currentPageName = cd.page.name;
    if (filteredComments.length === 1) {
      if (comment.isToMe) {
        const where = comment.section?.headline ?
          wordSeparator + cd.s('notification-part-insection', comment.section.headline) :
          '';
        body = cd.s(
          'notification-toyou-desktop',
          comment.author.getName(),
          comment.author,
          where,
          currentPageName
        );
      } else {
        body = cd.s(
          'notification-insection-desktop',
          comment.author.getName(),
          comment.author,
          comment.section.headline,
          currentPageName
        );
      }
    } else {
      let section;
      const isCommonSection = filteredComments.every((comment) => (
        comment.sectionSubscribedTo === filteredComments[0].sectionSubscribedTo
      ));
      if (isCommonSection) {
        section = filteredComments[0].sectionSubscribedTo;
      }
      const where = section ?
        wordSeparator + cd.s('notification-part-insection', section.headline) :
        '';
      let mayBeRelevantString = cd.s('notification-newcomments-mayberelevant');
      if (!mayBeRelevantString.startsWith(cd.mws('comma-separator'))) {
        mayBeRelevantString = wordSeparator + mayBeRelevantString;
      }

      // "that may be relevant to you" text is not needed when the section is watched and the user
      // can clearly understand why they are notified.
      const mayBeRelevant = section ? '' : mayBeRelevantString;

      body = cd.s(
        'notification-newcomments-desktop',
        filteredComments.length,
        where,
        currentPageName,
        mayBeRelevant
      );
    }

    const notification = new Notification(mw.config.get('wgSiteName'), {
      body,

      // We use a tag so that there aren't duplicate notifications when the same page is opened in
      // two tabs. (Seems it doesn't work? :-/)
      tag: 'cd-' + filteredComments[filteredComments.length - 1].id,
    });
    notification.onclick = () => {
      parent.focus();

      // Just in case, old browsers. TODO: delete?
      window.focus();

      this.emit('desktopNotificationClick');

      this.reload({
        commentIds: [comment.id],
        closeNotificationsSmoothly: false,
      });
    };
  },

  /**
   * Update the data about added comments (new comments added while the page was idle), update page
   * components accordingly, show notifications.
   *
   * @param {import('./CommentSkeleton').CommentSkeletonLike[]} all
   * @param {import('./CommentSkeleton').CommentSkeletonLike[]} relevant
   */
  updateAddedComments(all, relevant) {
    this.addedCommentCount = all.length;
    this.areRelevantCommentsAdded = Boolean(relevant.length);
    if (relevant.length) {
      this.relevantAddedCommentIds = relevant.map((comment) => comment.id);
    } else if (all.length) {
      this.relevantAddedCommentIds = all.map((comment) => comment.id);
    }

    this.emit('addedCommentsUpdate', {
      all,
      relevant,
      bySection: Comment.groupBySection(all),
    });

    this.updatePageTitle();

    const commentsToNotifyAbout = relevant
      .filter((comment) => !this.commentsNotifiedAbout.some((cna) => cna.id === comment.id));
    this.showRegularNotification(commentsToNotifyAbout);
    this.showDesktopNotification(commentsToNotifyAbout);
    this.commentsNotifiedAbout.push(...commentsToNotifyAbout);
  },

  /**
   * Get the IDs of the comments that should be jumped to after reloading the page.
   *
   * @type {?(string[])}
   */
  getRelevantAddedCommentIds() {
    return this.relevantAddedCommentIds;
  },

  /**
   * _For internal use._ If every changed comment on the page has been seen and there are no new
   * comments on the page that are not displayed, mark the page as read.
   */
  maybeMarkPageAsRead() {
    if (
      !this.addedCommentCount &&
      commentRegistry.getAll().every((comment) => !comment.willFlashChangedOnSight) &&
      this.lastCheckedRevisionId
    ) {
      cd.page.markAsRead(this.lastCheckedRevisionId);
    }
  },

  /**
   * Create an appropriate {@link Subscriptions} singleton based on the user settings.
   *
   * @returns {import('./Subscriptions').default}
   */
  getSubscriptionsInstance() {
    this.subscriptionsInstance ||= new (
      settings.get('useTopicSubscription') ? DtSubscriptions : LegacySubscriptions
    )();

    return this.subscriptionsInstance;
  },

  /**
   * _For internal use._ Bind a click handler to every known "Add topic" button out of our
   * control (and update the behavior of the native "Add topic" button).
   */
  connectToAddTopicButtons() {
    this.$addTopicButtons = $(
      [
        '#ca-addsection a',
        '.cd-addTopicButton a',
        'a.cd-addTopicButton',
        'a[href*="section=new"]',
        'a[href*="Special:NewSection/"]',
        'a[href*="Special:Newsection/"]',
        'a[href*="special:newsection/"]',
        '.commentbox input[type="submit"]',
        '.createbox input[type="submit"]',
      ]
        .concat(cd.config.addTopicButtonSelectors)
        .join(', ')
    )
      .filter((i, el) => {
        const $button = $(el);

        // When DT's new topic tool is enabled
        if (
          mw.util.getParamValue('section') === 'new' &&
          $button.parent().attr('id') !== 'ca-addsection' &&
          !$button.closest(this.$root).length
        ) {
          return false;
        }

        let pageName;
        let url;
        if ($button.is('a')) {
          url = new URL($button.prop('href'));
          pageName = getLastArrayElementOrSelf(url.searchParams.getAll('title'))
            ?.replace(/^Special:NewSection\//i, '');
        } else if ($button.is('input')) {
          pageName = $button
            .closest('form')
            .find('input[name="title"][type="hidden"]')
            .val();
        }
        if (!pageName) {
          return false;
        }

        const page = pageRegistry.get(pageName);
        if (!page || page !== cd.page) {
          return false;
        }

        if ($button.is('a')) {
          url.searchParams.set('dtenable', 0);
          $button.attr('href', url);
        }

        return true;
      });

    if (!$('#ca-addsection a').length && this.$addTopicButtons.length === 1) {
      this.$emulatedAddTopicButton = $(mw.util.addPortletLink(
        'p-views',
        this.$addTopicButtons.attr('href'),
        cd.s('addtopic'),
        'ca-addsection',
        cd.s('addtopicbutton-tooltip'),
        '+',
        '#ca-history'
      ));
      this.$addTopicButtons = this.$addTopicButtons.add(
        this.$emulatedAddTopicButton.children()
      );
    }

    this.$addTopicButtons
      // DT may add its handler (as adds to a "Start new discussion" button on 404 pages). DT's "Add
      // topic" button click handler is trickier, see below.
      .off('click')

      .on('click.cd', this.handleAddTopicButtonClick.bind(this))
      .filter((i, el) => (
        !cd.g.isDtNewTopicToolEnabled &&
        !($(el).is('a') && Number(mw.util.getParamValue('cdaddtopic', $(el).attr('href'))))
      ))
      .attr('title', cd.s('addtopicbutton-tooltip'));

    $('#ca-addsection a').updateTooltipAccessKeys();

    // In case DT's new topic tool is enabled, remove the handler of the "Add topic" button.
    const dtHandler = $._data(document.body).events?.click
      ?.find((event) => event.selector?.includes('data-mw-comment'))
      ?.handler;
    if (dtHandler) {
      $(document.body).off('click', dtHandler);
    }
  },

  /**
   * Get the list of DiscussionTools threads that are related to subscribable (2-level) threads.
   * This is updated on page reload.
   *
   * @returns {object[]}
   */
  getDtSubscribableThreads() {
    this.dtSubscribableThreads ||= mw.config.get('wgDiscussionToolsPageThreads')
      ?.concat(
        mw.config.get('wgDiscussionToolsPageThreads')
          .filter((thread) => thread.headingLevel === 1)
          .flatMap((thread) => thread.replies)
      )
      .filter((thread) => thread.headingLevel === 2);

    return this.dtSubscribableThreads;
  },

  /**
   * Check whether subscribing is disabled on this page despite it being an active page (because
   * it's a user's own talk page).
   *
   * @returns {boolean}
   */
  isSubscribingDisabled() {
    return cd.page.isOwnTalkPage() && !['all', 'toMe'].includes(settings.get('desktopNotifications'));
  },
};
