import dateFormats from '../data/dateFormats.json';
import digitsData from '../data/digits.json';
import languageFallbacks from '../data/languageFallbacks.json';

import CommentLayersCss from './Comment.layers.less';
import CommentCss from './Comment.less';
import CommentFormCss from './CommentForm.less';
import SectionCss from './Section.less';
import globalCss from './global.less';
import cd from './loader/cd';
import debug from './loader/convenientDiscussions.debug';
import convenientDiscussionsUtil from './loader/convenientDiscussions.util';
import logPagesCss from './logPages.less';
import navPanelCss from './navPanel.less';
import pageNavCss from './pageNav.less';
import { defined, getQueryParamBooleanValue, isKeyOf, isProbablyTalkPage, sleep, unique } from './shared/utils-general';
import { dateTokenToMessageNames } from './shared/utils-timestamp';
import skinsCss from './skins.less';
import talkPageCss from './talkPage.less';
import tocCss from './toc.less';
import { getUserInfo, splitIntoBatches } from './utils-api';
import { createSvg, transparentize } from './utils-window';

/**
 * Singleton for loading and managing page state related to booting and overlays.
 * This handles populating the cd.loader interface with methods and properties.
 *
 * @module convenientDiscussions.loader
 */
class Loader {
  /**
   * @type {JQuery}
   */
  $content;

  /**
   * @type {JQuery | undefined}
   * @private
   */
  $bootingOverlay;

  /** @type {JQuery.Promise<any>[] | undefined} @private */
  siteDataPromises;

  /**
   * Is the page booting (the booting overlay is on).
   *
   * @type {boolean}
   */
  booting = false;

  /**
   * Main app function. Assigned from app.js.
   *
   * @type {((...args: any) => void) | undefined}
   */
  app;

  /**
   * Add comment links function. Assigned from app.js.
   *
   * @type {((...args: any) => void) | undefined}
   */
  addCommentLinks;

  /**
   * @typedef {object} PageTypes
   * @property {boolean} talkGuess The page is probably a talk page based on data available *before*
   *   the configuration file is loaded.
   * @property {boolean} talk The page is considered a talk page.
   * @property {boolean} talkStrict The page meets strict criteria for being a talk page.
   * @property {boolean} diff The page is a diff page.
   * @property {boolean} watchlist The page is a watchlist page.
   * @property {boolean} contributions The page is a contributions page.
   * @property {boolean} history The page is a history page.
   */

  /**
   * @type {PageTypes}
   */
  pageTypes = {
    talkGuess: false,
    talk: false,
    talkStrict: false,
    diff: false,
    watchlist: false,
    contributions: false,
    history: false,
  };

  /**
   * See {@link Loader#isArticlePageOfTypeTalk}.
   *
   * @private
   */
  articlePageOfTypeTalk = false;

  maybePreloadModules() {
    this.queryTalkPage = getQueryParamBooleanValue('cdtalkpage');

    // These values can change: start() may run a second time, see maybeAddFooterSwitcher().
    this.isTalkPageInQuery = this.queryTalkPage === true;
    this.isNotTalkPageInQuery = this.queryTalkPage === false;

    this.pageTypes.talkStrict = Boolean(
      this.isTalkPageInQuery ||

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

    this.articlePageOfTypeTalk =
      (!mw.config.get('wgIsRedirect') || !this.isCurrentRevision()) &&
      !this.$content.find('.cd-notTalkPage').length &&
      (this.pageTypes.talkStrict || isProbablyTalkPage(cd.g.pageName, cd.g.namespaceNumber)) &&

      // Undocumented setting
      !window.cdOnlyRunByFooterLink;

    this.pageTypes.talk =
      mw.config.get('wgIsArticle') &&
      !this.isTalkPageInQuery &&
      (this.isNotTalkPageInQuery || this.articlePageOfTypeTalk);

    this.pageTypes.talkGuess = Boolean(
      this.pageTypes.talkStrict ||
      isProbablyTalkPage(cd.g.pageName, cd.g.namespaceNumber)
    );

    const modules = [
      'ext.checkUser.styles',
      'ext.checkUser.userInfoCard',
      'jquery.client',
      'jquery.ui',
      'mediawiki.Title',
      'mediawiki.Uri',
      'mediawiki.api',
      'mediawiki.cookie',
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
      mw.loader.getState('ext.confirmEdit.CaptchaInputWidget')
        ? 'ext.confirmEdit.CaptchaInputWidget'
        : undefined,
    ].filter(defined);
  }

  /**
   * Check if the current page is of a specific type.
   *
   * @param {keyof Loader['pageTypes']} type
   * @returns {boolean}
   */
  isPageOfType(type) {
    return this.pageTypes[type];
  }

  /**
   * Change the evaluation of whether the current page is of a specific type.
   *
   * @param {keyof Loader['pageTypes']} type
   * @param {boolean} value
   */
  setPageType(type, value) {
    this.pageTypes[type] = value;
  }

  /**
   * Check if the _article_ page (the one with `wgIsArticle` being true) of the current page is a
   * talk page eligible for CD to run on.
   *
   * @returns {boolean}
   */
  isArticlePageOfTypeTalk() {
    return this.articlePageOfTypeTalk;
  }

  /**
   * _For internal use._ Load messages needed to parse and generate timestamps as well as some site
   * data.
   *
   * @returns {JQuery.Promise<any>[]} There should be at least one promise in the array.
   */
  getSiteDataPromises() {
    this.siteDataPromises ??= this.getSiteData();

    return this.siteDataPromises;
  }

  /**
   * Load messages needed to parse and generate timestamps as well as some site data.
   *
   * @returns {JQuery.Promise<any>[]} There should be at least one promise in the array.
   * @private
   */
  // eslint-disable-next-line max-lines-per-function
  getSiteData() {
    this.initFormats();

    const contentLanguageMessageNames = [
      'word-separator',
      'comma-separator',
      'colon-separator',
      'timezone-utc',
    ].concat(
      // Message names for date tokens in content language
      ...this.getUsedDateTokens(cd.g.timestampTools.content.dateFormat).map(
        (pattern) => dateTokenToMessageNames[pattern]
      )
    );

    const userLanguageMessageNames = [
      'parentheses',
      'parentheses-start',
      'parentheses-end',
      'word-separator',
      'comma-separator',
      'colon-separator',
      'nextdiff',
      'timezone-utc',
      'pagetitle',
    ]
      .concat(
        cd.g.isDtInstalled
          ? [
              'discussiontools-topicsubscription-button-subscribe',
              'discussiontools-topicsubscription-button-subscribe-tooltip',
              'discussiontools-topicsubscription-button-unsubscribe',
              'discussiontools-topicsubscription-button-unsubscribe-tooltip',
              'discussiontools-topicsubscription-notify-subscribed-title',
              'discussiontools-topicsubscription-notify-subscribed-body',
              'discussiontools-topicsubscription-notify-unsubscribed-title',
              'discussiontools-topicsubscription-notify-unsubscribed-body',
              'discussiontools-newtopicssubscription-button-subscribe-label',
              'discussiontools-newtopicssubscription-button-subscribe-tooltip',
              'discussiontools-newtopicssubscription-button-unsubscribe-label',
              'discussiontools-newtopicssubscription-button-unsubscribe-tooltip',
              'discussiontools-newtopicssubscription-notify-subscribed-title',
              'discussiontools-newtopicssubscription-notify-subscribed-body',
              'discussiontools-newtopicssubscription-notify-unsubscribed-title',
              'discussiontools-newtopicssubscription-notify-unsubscribed-body',
              'thanks-confirmation2',
              'checkuser-userinfocard-toggle-button-aria-label',
            ]
          : []
      )
      .concat(
        // Message names for date tokens in UI language
        ...this.getUsedDateTokens(cd.g.timestampTools.user.dateFormat).map(
          (pattern) => dateTokenToMessageNames[pattern]
        )
      );

    const areLanguagesEqual = mw.config.get('wgContentLanguage') === mw.config.get('wgUserLanguage');
    if (areLanguagesEqual) {
      const userLanguageConfigMessages = /** @type {StringsByKey} */ ({});
      Object.keys(cd.config.messages)
        .filter((name) => userLanguageMessageNames.includes(name))
        .forEach((name) => {
          userLanguageConfigMessages[name] = cd.config.messages[name];
        });
      mw.messages.set(userLanguageConfigMessages);
    }

    // We need this object to pass it to the web worker.
    cd.g.contentLanguageMessages = {};

    const setContentLanguageMessages = (/** @type {{ [key: string]: string | undefined }} */ messages) => {
      Object.keys(messages).forEach((name) => {
        if (messages[name] !== undefined) {
          mw.messages.set('(content)' + name, messages[name]);
          cd.g.contentLanguageMessages[name] = messages[name];
        }
      });
    };

    const filterAndSetContentLanguageMessages = (/** @type {StringsByKey} */ messages) => {
      const contentLanguageMessages = /** @type {StringsByKey} */ ({});
      Object.keys(messages)
        .filter((name) => contentLanguageMessageNames.includes(name))
        .forEach((name) => {
          contentLanguageMessages[name] = messages[name];
        });
      setContentLanguageMessages(contentLanguageMessages);
    };
    filterAndSetContentLanguageMessages(cd.config.messages);

    // I hope we won't be scolded too much for making two message requests in parallel (if the user
    // and content language are different).
    /** @type {JQuery.Promise<any>[]} */
    const requests = [];
    if (areLanguagesEqual) {
      // eslint-disable-next-line no-one-time-vars/no-one-time-vars
      const messagesToRequest = contentLanguageMessageNames
        .concat(userLanguageMessageNames)
        .filter(unique);
      for (const nextNames of splitIntoBatches(messagesToRequest)) {
        requests.push(
          cd
            .getApi()
            .loadMessagesIfMissing(nextNames)
            .then(() => {
              filterAndSetContentLanguageMessages(mw.messages.get());
            })
        );
      }
    } else {
      // eslint-disable-next-line no-one-time-vars/no-one-time-vars
      const contentLanguageMessagesToRequest = contentLanguageMessageNames
        .filter((name) => !cd.g.contentLanguageMessages[name]);
      for (const nextNames of splitIntoBatches(contentLanguageMessagesToRequest)) {
        requests.push(
          cd
            .getApi()
            .getMessages(nextNames, {
              // cd.g.contentLanguage is not used here for the reasons described in app.js where it
              // is declared.
              amlang: mw.config.get('wgContentLanguage'),
            })
            .then(setContentLanguageMessages)
        );
      }

      requests.push(cd.getApi().loadMessagesIfMissing(userLanguageMessageNames));
    }

    cd.g.specialPageAliases = Object.entries({
      ...cd.config.specialPageAliases,
    }).reduce((acc, [key, value]) => {
      acc[key] = typeof value === 'string' ? [value] : value;

      return acc;
    }, /** @type {import('../config/default').default['specialPageAliases']} */({}));

    const content = cd.g.timestampTools.content;
    content.timezone = cd.config.timezone ?? undefined;

    const specialPages = ['Contributions', 'Diff', 'PermanentLink'];
    if (
      !specialPages.every(
        (page) => page in cd.g.specialPageAliases && cd.g.specialPageAliases[page].length
      ) ||
      !content.timezone
    ) {
      requests.push(
        cd
          .getApi()
          .get({
            action: 'query',
            meta: 'siteinfo',
            siprop: ['specialpagealiases', 'general'],
          })
          .then((response) => {
            /** @type {import('./utils-api').ApiResponseSiteInfoSpecialPageAliases[]} */ (
              response.query.specialpagealiases
            )
              .filter((page) => specialPages.includes(page.realname))
              .forEach((page) => {
                cd.g.specialPageAliases[page.realname] = page.aliases.slice(
                  0,
                  page.aliases.indexOf(page.realname) + 1
                );
              });
            content.timezone = response.query.general.timezone;
          })
      );
    }

    return requests;
  }

  /**
   * Set the global variables related to date format.
   *
   * @private
   */
  initFormats() {
    const getLanguageOrFallback = (/** @type {string} */ lang) =>
      convenientDiscussionsUtil.getValidLanguageOrFallback(
        lang,
        (/** @type {string} */ l) => isKeyOf(l, dateFormats),
        languageFallbacks
      );

    const contentLanguage = getLanguageOrFallback(mw.config.get('wgContentLanguage'));
    const userLanguage = getLanguageOrFallback(mw.config.get('wgUserLanguage'));

    cd.g.timestampTools.content.dateFormat = /** @type {StringsByKey} */ (dateFormats)[
      contentLanguage
    ];
    cd.g.digits.content = mw.config.get('wgTranslateNumerals')
      ? /** @type {StringsByKey} */ (digitsData)[contentLanguage]
      : undefined;
    cd.g.timestampTools.user.dateFormat = /** @type {StringsByKey} */ (dateFormats)[userLanguage];
    cd.g.digits.user = mw.config.get('wgTranslateNumerals')
      ? /** @type {StringsByKey} */ (digitsData)[userLanguage]
      : undefined;
  }

  /**
   * Get date tokens used in a format (to load only the needed tokens).
   *
   * @param {string} format
   * @returns {('xg' | 'D' | 'l' | 'F' | 'M')[]}
   * @private
   * @author Bartosz Dziewoński <matma.rex@gmail.com>
   * @license MIT
   */
  getUsedDateTokens(format) {
    const tokens = /** @type {('xg' | 'D' | 'l' | 'F' | 'M')[]} */ ([]);

    for (let p = 0; p < format.length; p++) {
      let code = format[p];
      if ((code === 'x' && p < format.length - 1) || (code === 'xk' && p < format.length - 1)) {
        code += format[++p];
      }

      if (['xg', 'D', 'l', 'F', 'M'].includes(code)) {
        tokens.push(/** @type {'xg' | 'D' | 'l' | 'F' | 'M'} */(code));
      } else if (code === '\\' && p < format.length - 1) {
        ++p;
      }
    }

    return tokens;
  }

  /**
   * Set page types and initialize talk page or comment links page.
   */
  init() {
    this.$content = $('#mw-content-text');

    if (cd.g.isMobileClient) {
      $(document.body).addClass('cd-mobile-client');
    }

    this.isTalkPageInQuery = getQueryParamBooleanValue('cdtalkpage') === true;
    this.isNotTalkPageInQuery = getQueryParamBooleanValue('cdtalkpage') === false;

    this.pageTypes.talkStrict = Boolean(
      this.isTalkPageInQuery ||

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

    this.articlePageOfTypeTalk =
      (!mw.config.get('wgIsRedirect') || !this.isCurrentRevision()) &&
      !this.$content.find('.cd-notTalkPage').length &&
      (this.pageTypes.talkStrict || isProbablyTalkPage(cd.g.pageName, cd.g.namespaceNumber)) &&

      // Undocumented setting
      !window.cdOnlyRunByFooterLink;

    this.pageTypes.diff = /[?&]diff=[^&]/.test(location.search);

    this.pageTypes.talk =
      mw.config.get('wgIsArticle') &&
      !this.isNotTalkPageInQuery &&
      (this.isTalkPageInQuery || this.articlePageOfTypeTalk);
    this.pageTypes.watchlist = this.isWatchlistPage();
    this.pageTypes.contributions = this.isContributionsPage();
    this.pageTypes.history = this.isHistoryPage();

    this.loadOnTalkPage();
    this.loadOnCommentLinksPage();
  }

  /**
   * Load the data required for the script to run on a talk page and execute the app function.
   *
   * @private
   */
  loadOnTalkPage() {
    if (!this.pageTypes.talk) return;

    debug.stopTimer('start');
    debug.startTimer('load data');

    /** @type {JQuery.Promise<any>[]} */
    let siteDataRequests = [];

    // Make some requests in advance if the API module is ready in order not to make 2 requests
    // sequentially. We don't make a `userinfo` request, because if there is more than one tab in
    // the background, this request is made and the execution stops at mw.loader.using, which
    // results in overriding the renewed visits setting of one tab by another tab (the visits are
    // loaded by one tab, then another tab, then written by one tab, then by another tab).
    if (mw.loader.getState('mediawiki.api') === 'ready') {
      siteDataRequests = this.getSiteDataPromises();

      // We are _not_ calling getUserInfo() here to avoid losing visit data updates from some pages
      // if several pages are opened simultaneously. In this situation, visits could be requested
      // for multiple pages; updated and then saved for each of them with losing the updates from
      // the rest.
    }

    // mw.loader.using() delays the execution even if all modules are ready (if CD is used as a
    // gadget with preloaded dependencies, for example), so we use this trick.
    const modulesRequest = modules.some((module) => mw.loader.getState(module) !== 'ready')
      ? mw.loader.using(modules)
      : undefined;

    // If there is no data to load and, therefore, no period of time within which a reflow (layout
    // thrashing) could happen without impeding performance, we cache the value so that it could
    // be used in .saveRelativeScrollPosition() without causing a reflow.
    Promise.all([modulesRequest || Promise.resolve(), ...siteDataRequests]).then(
      () => {
        this.initCssValues();
        this.addTalkPageCss();
        this.app?.();
      },
      (/** @type {unknown} */ error) => {
        mw.notify(cd.s('error-loaddata'), { type: 'error' });
        console.error(error);
        this.hideBootingOverlay();
      }
    );

    this.showBootingOverlay();

    sleep(15_000).then(() => {
      if (this.booting) {
        this.hideBootingOverlay();
        console.warn('The booting overlay stays for more than 15 seconds; removing it.');
      }
    });
  }

  /**
   * Load the main app script, preferably from disk cache.
   *
   * @returns {Promise<void>}
   * @private
   */
  loadApp() {
    return this.loadPreferablyFromDiskCache({
      domain: 'commons.wikimedia.org',
      pageName: `User:Jack_who_built_the_house/convenientDiscussions-main.js`,
      ttlInDays: 365,
      addCacheBuster: true,
    });
  }

  /**
   * Load a script or style using the following strategy:
   * - If more than `ttlInDays` days have passed since caching, load from the server. E.g.
   *   translations can be requested daily.
   * - If `addCacheBuster` is `true`, load from server each time there is a new release (we "bust"
   *   cache by adding a random string to the URL). This is for the main app and anything updated
   *   together with it.
   *
   * @param {object} options
   * @param {string} options.domain
   * @param {string} options.pageName
   * @param {number} options.ttlInDays
   * @param {string} [options.ctype]
   * @param {boolean} [options.addCacheBuster]
   * @returns {Promise<void>}
   */
  async loadPreferablyFromDiskCache({
    domain, pageName, ttlInDays, ctype, addCacheBuster = false,
  }) {
    const ttlInMs = ttlInDays * cd.g.msInDay;
    const pageEncoded = encodeURIComponent(pageName);
    const cacheBusterOrNot = addCacheBuster ? '&' + CACHE_BUSTER : '';

    const apiResponse = await $.get(
      `https://${domain}/w/api.php?titles=${pageEncoded}&origin=*&format=json&formatversion=2&uselang=content&maxage=${ttlInMs}&smaxage=${ttlInMs}&action=query&prop=revisions|info&rvprop=content&rvlimit=1${cacheBusterOrNot}`
    );

    const apiPage = apiResponse.query.pages[0];
    if (!apiPage.missing) return;

    const content = apiPage.revisions[0].content;
    if (ctype === 'text/javascript' && apiPage.contentmodel === 'javascript') {
      const scriptTag = document.createElement('script');
      scriptTag.innerHTML = content;
      document.head.append(scriptTag);
    } else if (ctype === 'text/css' && apiPage.contentmodel === 'css') {
      mw.loader.addStyleTag(content);
    }
  }

  /**
   * _For internal use._ Set some important skin-specific values to the global object.
   *
   * @private
   */
  initCssValues() {
    cd.g.contentLineHeight = Number.parseFloat(this.$content.css('line-height'));
    cd.g.contentFontSize = Number.parseFloat(this.$content.css('font-size'));
    cd.g.defaultFontSize = Number.parseFloat($(document.documentElement).css('font-size'));
  }

  /**
   * _For internal use._ Set CSS for talk pages: set CSS variables, add static CSS.
   *
   * @private
   */
  addTalkPageCss() {
    const contentBackgroundColor = $('#content').css('background-color') || 'rgba(0, 0, 0, 0)';
    const skin$ = (/** @type {{ [key: string]: string }} */ obj) => {
      const skin = mw.config.get('skin');

      return $(obj[skin] || obj.default);
    };
    const sidebarColor = skin$({
      'timeless': '#mw-content-container',
      'vector-2022': '.mw-page-container',
      'default': 'body',
    }).css('background-color');
    const metadataFontSize = Number.parseFloat(
      (cd.g.contentFontSize / cd.g.defaultFontSize).toFixed(7)
    );
    const sidebarTransparentColor = transparentize(sidebarColor);

    // `float: inline-start` is too new: it appeared in Chrome in October 2023.
    const floatContentStart = cd.g.contentDirection === 'ltr' ? 'left' : 'right';
    const floatContentEnd = cd.g.contentDirection === 'ltr' ? 'right' : 'left';
    const floatUserStart = cd.g.userDirection === 'ltr' ? 'left' : 'right';
    const floatUserEnd = cd.g.userDirection === 'ltr' ? 'right' : 'left';
    const gradientUserStart = cd.g.userDirection === 'ltr' ? 'to left' : 'to right';

    mw.loader.addStyleTag(`:root {
  --cd-comment-fallback-side-margin: ${cd.g.commentFallbackSideMargin}px;
  --cd-comment-marker-width: ${cd.g.commentMarkerWidth}px;
  --cd-thread-line-side-padding: ${cd.g.threadLineSidePadding}px;
  --cd-content-background-color: ${contentBackgroundColor};
  --cd-content-font-size: ${cd.g.contentFontSize}px;
  --cd-content-metadata-font-size: ${metadataFontSize}rem;
  --cd-sidebar-color: ${sidebarColor};
  --cd-sidebar-transparent-color: ${sidebarTransparentColor};
  --cd-direction-user: ${cd.g.userDirection};
  --cd-direction-content: ${cd.g.contentDirection};
  --cd-float-user-start: ${floatUserStart};
  --cd-float-user-end: ${floatUserEnd};
  --cd-float-content-start: ${floatContentStart};
  --cd-float-content-end: ${floatContentEnd};
  --cd-gradient-user-start: ${gradientUserStart};
  --cd-pixel-deviation-ratio: ${cd.g.pixelDeviationRatio};
  --cd-pixel-deviation-ratio-for-1px: ${cd.g.pixelDeviationRatioFor1px};
}`);
    if (cd.config.outdentClass) {
      mw.loader.addStyleTag(`.cd-parsed .${cd.config.outdentClass} {
  margin-top: 0.5em;
  margin-bottom: 0.5em;
}

.cd-reformattedComments .${cd.config.outdentClass} {
  margin-top: 0.75em;
  margin-bottom: 0.75em;
}`);
    }

    mw.util.addCSS(globalCss);
    mw.util.addCSS(CommentCss);
    mw.util.addCSS(CommentFormCss);
    mw.util.addCSS(SectionCss);
    mw.util.addCSS(CommentLayersCss);
    mw.util.addCSS(navPanelCss);
    mw.util.addCSS(pageNavCss);
    mw.util.addCSS(skinsCss);
    mw.util.addCSS(talkPageCss);
    mw.util.addCSS(tocCss);
  }

  /**
   * Initialize comment links on special pages and execute the addCommentLinks function.
   *
   * @private
   */
  loadOnCommentLinksPage() {
    if (
      !this.isPageOfType('watchlist') &&
      !this.isPageOfType('contributions') &&
      !this.isPageOfType('history') &&
      !(this.isPageOfType('diff') && this.isArticlePageOfTypeTalk()) &&

      // Instant Diffs script can be called on talk pages as well
      !this.isPageOfType('talk')
    ) {
      return;
    }

    // Make some requests in advance if the API module is ready in order not to make 2 requests
    // sequentially.
    if (mw.loader.getState('mediawiki.api') === 'ready') {
      this.getSiteDataPromises();

      // Loading user info on diff pages could lead to problems with saving visits when many pages
      // are opened, but not yet focused, simultaneously.
      if (!this.isPageOfType('talk')) {
        getUserInfo(true).catch((/** @type {unknown} */ error) => {
          console.warn(error);
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
        this.addCommentLinks?.();

        // See the comment above: "Additions of CSS...".
        mw.util.addCSS(globalCss);

        mw.util.addCSS(logPagesCss);
      },
      (/** @type {unknown} */ error) => {
        mw.notify(cd.s('error-loaddata'), { type: 'error' });
        console.error(error);
      }
    );
  }

  /**
   * Is the displayed revision the current (last known) revision of the page.
   *
   * @returns {boolean}
   * @private
   */
  isCurrentRevision() {
    // RevisionSlider may show a revision newer than the revision in wgCurRevisionId due to a bug
    // (when navigating forward, at least twice, from a revision older than the revision in
    // wgCurRevisionId after some revisions were added). Unfortunately, it doesn't update the
    // wgCurRevisionId value.
    return mw.config.get('wgRevisionId') >= mw.config.get('wgCurRevisionId');
  }

  /**
   * Check whether the current page is a watchlist or recent changes page.
   *
   * @returns {boolean}
   * @private
   */
  isWatchlistPage() {
    return ['Recentchanges', 'Watchlist'].includes(
      mw.config.get('wgCanonicalSpecialPageName') || ''
    );
  }

  /**
   * Check whether the current page is a contributions page.
   *
   * @returns {boolean}
   * @private
   */
  isContributionsPage() {
    return mw.config.get('wgCanonicalSpecialPageName') === 'Contributions';
  }

  /**
   * Check whether the current page is a history page.
   *
   * @returns {boolean}
   * @private
   */
  isHistoryPage() {
    return cd.g.pageAction === 'history' && isProbablyTalkPage(cd.g.pageName, cd.g.namespaceNumber);
  }

  /**
   * Show the booting overlay (a logo in the corner of the page).
   */
  showBootingOverlay() {
    this.$bootingOverlay ??= $('<div>')
      .addClass('cd-bootingOverlay')
      .append(
        $('<div>')
          .addClass('cd-bootingOverlay-logo cd-icon')
          .append(
            $('<div>').addClass('cd-bootingOverlay-logo-partBackground'),
            createSvg(55, 55, 50, 50).html(
              `<path fill-rule="evenodd" clip-rule="evenodd" d="M42.5 10H45C46.3261 10 47.5979 10.5268 48.5355 11.4645C49.4732 12.4021 50 13.6739 50 15V50L40 40H15C13.6739 40 12.4021 39.4732 11.4645 38.5355C10.5268 37.5979 10 36.3261 10 35V32.5H37.5C38.8261 32.5 40.0979 31.9732 41.0355 31.0355C41.9732 30.0979 42.5 28.8261 42.5 27.5V10ZM5 3.05176e-05H35C36.3261 3.05176e-05 37.5979 0.526815 38.5355 1.4645C39.4732 2.40218 40 3.67395 40 5.00003V25C40 26.3261 39.4732 27.5979 38.5355 28.5355C37.5979 29.4732 36.3261 30 35 30H10L0 40V5.00003C0 3.67395 0.526784 2.40218 1.46447 1.4645C2.40215 0.526815 3.67392 3.05176e-05 5 3.05176e-05ZM19.8 23C14.58 23 10.14 21.66 8.5 17H31.1C29.46 21.66 25.02 23 19.8 23ZM13.4667 7.50561C12.9734 7.17597 12.3933 7.00002 11.8 7.00002C11.0043 7.00002 10.2413 7.31609 9.6787 7.8787C9.11607 8.44131 8.8 9.20437 8.8 10C8.8 10.5934 8.97595 11.1734 9.30559 11.6667C9.6352 12.1601 10.1038 12.5446 10.6519 12.7717C11.2001 12.9987 11.8033 13.0581 12.3853 12.9424C12.9672 12.8266 13.5018 12.5409 13.9213 12.1213C14.3409 11.7018 14.6266 11.1672 14.7424 10.5853C14.8581 10.0033 14.7987 9.40015 14.5716 8.85197C14.3446 8.30379 13.9601 7.83526 13.4667 7.50561ZM27.8 7.00002C28.3933 7.00002 28.9734 7.17597 29.4667 7.50561C29.9601 7.83526 30.3446 8.30379 30.5716 8.85197C30.7987 9.40015 30.8581 10.0033 30.7424 10.5853C30.6266 11.1672 30.3409 11.7018 29.9213 12.1213C29.5018 12.5409 28.9672 12.8266 28.3853 12.9424C27.8033 13.0581 27.2001 12.9987 26.6519 12.7717C26.1038 12.5446 25.6352 12.1601 25.3056 11.6667C24.9759 11.1734 24.8 10.5934 24.8 10C24.8 9.20437 25.1161 8.44131 25.6787 7.8787C26.2413 7.31609 27.0043 7.00002 27.8 7.00002Z" />`
            )
          )
      )
      .appendTo(document.body);

    this.$bootingOverlay.show();
  }

  /**
   * Hide the booting overlay.
   */
  hideBootingOverlay() {
    if (!this.$bootingOverlay || window.cdShowLoadingOverlay === false) return;

    this.$bootingOverlay.hide();
  }

  /**
   * Is there any kind of a page overlay present, like the OOUI/Codex modal overlay or CD loading
   * overlay. This runs very frequently.
   *
   * @returns {boolean}
   */
  isPageOverlayOn() {
    return this.$bootingOverlay?.[0].inert || this.booting;
  }

  /**
   * @import {default as BootProcess} from './BootProcess.js'
   */

  /**
   * Is the page booting (the booting overlay is on). The {@link BootProcess} may not be running
   * yet.
   *
   * @returns {boolean}
   */
  isBooting() {
    return this.booting;
  }
}

// Export a singleton instance
const loader = new Loader();

export default loader;
