/**
 * Main module.
 *
 * @module app
 */

import CONFIG_URLS from '../../config/urls.json';
import I18N_LIST from '../../data/i18nList.json';
import LANGUAGE_FALLBACKS from '../../data/languageFallbacks.json';
import Page from './Page';
import cd from './cd';
import commentLinks from './commentLinks';
import debug from './debug';
import defaultConfig from '../../config/default';
import g from './staticGlobals';
import processPage from './processPage';
import {
  buildEditSummary,
  isPageOverlayOn,
  isProbablyTalkPage,
  mergeRegexps,
  skin$,
  underlinesToSpaces,
  unique,
  wrap,
  wrapDiffBody,
} from './util';
import {
  finishLoading,
  isPageLoading,
  memorizeCssValues,
  setTalkPageCssVariables,
  startLoading,
} from './boot';
import { generateCommentAnchor, parseCommentAnchor } from './timestamp';
import { getUserInfo } from './apiWrappers';
import { loadSiteData } from './siteData';

let config;
if (IS_SINGLE) {
  try {
    config = require(`../../config/${CONFIG_FILE_NAME}`).default;
  } catch {
    // Empty
  }

  const replaceEntities = require('../../misc/util').replaceEntitiesInI18n;

  cd.i18n = {};
  cd.i18n.en = require('../../i18n/en.json');
  Object.keys(cd.i18n.en).forEach((name) => {
    cd.i18n.en[name] = replaceEntities(cd.i18n.en[name]);
  });
  if (LANG_CODE !== 'en') {
    cd.i18n[LANG_CODE] = require(`../../i18n/${LANG_CODE}.json`);
    const langObj = cd.i18n[LANG_CODE];
    Object.keys(cd.i18n[LANG_CODE])
      .filter((name) => typeof langObj[name] === 'string')
      .forEach((name) => {
        langObj[name] = replaceEntities(langObj[name]);
      });
    langObj.dayjsLocale = require(`dayjs/locale/${LANG_CODE}`);
    langObj.dateFnsLocale = require(`date-fns/locale`)[LANG_CODE];
  }
}

/**
 * Get a language string.
 *
 * @param {string} name String name.
 * @param {...*} [params] String parameters (substituted strings, also
 *   {@link module:userRegistry~User User} objects for use in `{{gender:}}`). The last parameter can
 *   be an object that can have a boolean property `plain` (should the message be returned in a
 *   plain, not substituted, form) or `parse` (should the message be returned in a parsed form). In
 *   the `parse` form, wikilinks are replaced with HTML tags, the code is sanitized. Use this for
 *   strings that have their raw HTML inserted into the page.
 * @returns {?string}
 * @memberof convenientDiscussions
 */
function s(name, ...params) {
  if (!name) {
    return null;
  }
  const fullName = `convenient-discussions-${name}`;
  let options = {};
  let lastParam = params[params.length - 1];
  if (
    typeof lastParam === 'object' &&

    // `mw.user`-like object to provide to {{gender:}}
    !lastParam.options
  ) {
    options = lastParam;
    params.splice(params.length - 1);
  }
  if (!cd.g.IS_QQX_MODE && typeof mw.messages.get(fullName) === 'string') {
    const message = mw.message(fullName, ...params);
    if (options.plain) {
      return message.plain();
    } else if (options.parse) {
      return message.parse();
    } else {
      return message.text();
    }
  } else {
    const paramsString = params.length ? `: ${params.join(', ')}` : '';
    return `(${fullName}${paramsString})`;
  }
}

/**
 * Get a language string in the "parse" format. Wikilinks are replaced with HTML tags, the code is
 * sanitized. Use this for strings that have their raw HTML inserted into the page.
 *
 *
 * @param {string} name String name.
 * @param {...*} [params] String parameters (substituted strings, also
 *   {@link module:userRegistry~User User} objects for use in `{{gender:}}`).
 * @returns {?string}
 * @memberof convenientDiscussions
 */
function sParse(name, ...params) {
  return s(name, ...params, { parse: true });
}

/**
 * Get a language string in the "plain" format, with no substitutions.
 *
 * @param {string} name String name.
 * @returns {?string}
 * @memberof convenientDiscussions
 */
function sPlain(name) {
  return s(name, { plain: true });
}

/**
 * A foolproof method to access MediaWiki messages intended to be used instead of `mw.msg` to
 * eliminate any possibility of an XSS injection. By a programmer's mistake some `mw.msg` value
 * could be inserted into a page in a raw HTML form. To prevent this, this function should be used,
 * so if the message contains an injection (for example, brought from Translatewiki or inserted by a
 * user who doesn't have the `editsitejs` right but does have the `editinterface` right), the
 * function would sanitize the value.
 *
 * @param {string} name String name.
 * @param {...*} [params] String parameters (substituted strings, also
 *   {@link module:userRegistry~User User} objects for use in {{gender:}}). The last parameter can
 *   be an object that can have a string property `language`. If `language` is `'content'`, the
 *   returned message will be in the content langage (not the interface language).
 * @returns {string}
 * @memberof convenientDiscussions
 */
function mws(name, ...params) {
  let options;
  let lastParam = params[params.length - 1];
  if (typeof lastParam === 'object') {
    options = lastParam;
    params.splice(params.length - 1);
  }
  if (options && options.language === 'content') {
    name = '(content)' + name;
  }
  return mw.message(name, ...params).parse();
}

/**
 * When on a Special:Search page, searching for a comment after choosing that option from the
 * "Couldn't find the comment" message, add comment links to the titles.
 *
 * @private
 */
function addCommentLinksToSpecialSearch() {
  const [, commentAnchor] = location.search.match(/[?&]cdcomment=([^&]+)(?:&|$)/) || [];
  if (commentAnchor) {
    mw.loader.using('mediawiki.api').then(
      async () => {
        await Promise.all(...loadSiteData());
        $('.mw-search-result-heading').each((i, el) => {
          const href = (
            $(el)
              .find('a')
              .first()
              .attr('href') +
            '#' +
            commentAnchor
          );
          const $a = $('<a>')
            .attr('href', href)
            .text(cd.s('deadanchor-search-gotocomment'));
          const $start = $('<span>').text(cd.mws('parentheses-start'));
          const $end = $('<span>').text(cd.mws('parentheses-end'));
          const $span = $('<span>')
            .addClass("cd-searchCommentLink")
            .append($start, $a, $end);
          $(el).append(' ', $span.clone());
        });
      },
      console.error
    );
  }
}

/**
 * Add a footer link to enable/disable CD on this page once.
 *
 * @param {boolean} enable
 * @private
 */
function addFooterLink(enable) {
  const url = new URL(location.href);
  url.searchParams.set('cdtalkpage', enable ? '1' : '0');
  const $li = $('<li>').attr('id', 'footer-places-togglecd');
  const $a = $('<a>')
    .attr('href', url.toString())
    .addClass('noprint')
    .text(cd.s(enable ? 'footer-runcd' : 'footer-dontruncd'))
    .appendTo($li);
  if (enable) {
    $a.on('click', (e) => {
      if (!e.ctrlKey && !e.shiftKey && !e.metaKey) {
        e.preventDefault();
        history.pushState(history.state, '', url.toString());
        $li.remove();
        go();
      }
    });
  }
  skin$({
    monobook: '#f-list',
    modern: '#footer-info',
    default: '#footer-places',
  }).append($li);
}

/**
 * Add the script's strings to `mw.messages`;
 *
 * @private
 */
function setStrings() {
  // Strings that should be displayed in the site language, not the user language.
  const contentStrings = [
    'es-',
    'cf-autocomplete-commentlinktext',
    'move-',
  ];

  if (!IS_SINGLE) {
    require('../../dist/convenientDiscussions-i18n/en.js');
  }
  const strings = {};
  Object.keys(cd.i18n.en).forEach((name) => {
    const relevantLang = contentStrings.some((contentStringName) => (
      name === contentStringName ||
      (contentStringName.endsWith('-') && name.startsWith(contentStringName))
    )) ?
      cd.g.CONTENT_LANGUAGE :
      cd.g.USER_LANGUAGE;
    strings[name] = cd.i18n[relevantLang]?.[name] || cd.i18n.en[name];
  });

  Object.keys(strings).forEach((name) => {
    mw.messages.set(`convenient-discussions-${name}`, strings[name]);
  });
}

/**
 * Function executed after the config and localization strings are ready.
 *
 * @fires preprocessed
 * @private
 */
async function go() {
  cd.debug.startTimer('start');

  // Avoid setting the global object properties if go() runs the second time (see addFooterLink()).
  if (!cd.g.SETTINGS_OPTION_NAME) {
    /**
     * Script configuration. The default configuration is in {@link module:defaultConfig}.
     *
     * @name config
     * @type {object}
     * @memberof convenientDiscussions
     */
    cd.config = Object.assign(defaultConfig, cd.config);

    setStrings();

    // For historical reasons, ru.wikipedia.org has 'cd'.
    const localOptionsPrefix = location.hostname === 'ru.wikipedia.org' ?
      'cd' :
      'convenientDiscussions';
    cd.g.SETTINGS_OPTION_NAME = 'userjs-convenientDiscussions-settings';
    cd.g.LOCAL_SETTINGS_OPTION_NAME = `userjs-${localOptionsPrefix}-localSettings`;
    cd.g.VISITS_OPTION_NAME = `userjs-${localOptionsPrefix}-visits`;

    // For historical reasons, ru.wikipedia.org has 'watchedTopics'.
    const wsonEnding = location.hostname === 'ru.wikipedia.org' ? 'watchedTopics' : 'watchedSections';
    cd.g.WATCHED_SECTIONS_OPTION_NAME = `userjs-${localOptionsPrefix}-${wsonEnding}`;

    const server = mw.config.get('wgServer');
    cd.g.SERVER = server.startsWith('//') ? location.protocol + server : server;

    cd.g.PAGE_NAME = underlinesToSpaces(mw.config.get('wgPageName'));
    cd.g.PAGE_TITLE = underlinesToSpaces(mw.config.get('wgTitle'));
    cd.g.NAMESPACE_NUMBER = mw.config.get('wgNamespaceNumber');

    // "<unregistered>" is a workaround for anonymous users (there are such!).
    cd.g.USER_NAME = mw.config.get('wgUserName') || '<unregistered>';

    cd.g.PAGE_WHITELIST_REGEXP = mergeRegexps(cd.config.pageWhitelist);
    cd.g.PAGE_BLACKLIST_REGEXP = mergeRegexps(cd.config.pageBlacklist);
    cd.g.CONTENT_DIR = document.body.classList.contains('sitedir-rtl') ? 'rtl' : 'ltr';
    cd.g.SKIN = mw.config.get('skin');
    if (cd.g.SKIN === 'vector' && document.body.classList.contains('skin-vector-legacy')) {
      cd.g.SKIN = 'vector-legacy';
    }
    cd.g.IS_DIFF_PAGE = mw.config.get('wgIsArticle') && /[?&]diff=[^&]/.test(location.search);
    cd.g.IS_QQX_MODE = /[?&]uselang=qqx(?=&|$)/.test(location.search);

    // Quite a rough check for mobile browsers, a mix of what is advised at
    // https://stackoverflow.com/a/24600597 (sends to
    // https://developer.mozilla.org/en-US/docs/Browser_detection_using_the_user_agent) and
    // https://stackoverflow.com/a/14301832.
    cd.g.IS_MOBILE = (
      /Mobi|Android/i.test(navigator.userAgent) ||
      typeof window.orientation !== 'undefined'
    );

    cd.g.$content = $('#mw-content-text');
  }

  // Not static: go() may run the second time, see addFooterLink().
  cd.g.isDisabledInQuery = /[?&]cdtalkpage=(0|false|no|n)(?=&|$)/.test(location.search);
  cd.g.isEnabledInQuery = /[?&]cdtalkpage=(1|true|yes|y)(?=&|$)/.test(location.search);

  // Process the page as a talk page
  const isPageEligible = (
    !mw.config.get('wgIsRedirect') &&
    !cd.g.$content.find('.cd-notTalkPage').length &&
    (
      isProbablyTalkPage(cd.g.PAGE_NAME, cd.g.NAMESPACE_NUMBER) ||
      $('#ca-addsection').length ||

      // .cd-talkPage is used as a last resort way to make CD parse the page, as opposed to using
      // the list of supported namespaces and page white/black list in the configuration. With this
      // method, there won't be "comment" links for edits on pages that list revisions such as the
      // watchlist.
      cd.g.$content.find('.cd-talkPage').length
    ) &&
    !(typeof cdOnlyRunByFooterLink !== 'undefined' && window.cdOnlyRunByFooterLink)
  );
  if (mw.config.get('wgIsArticle')) {
    if (!cd.g.isDisabledInQuery && (cd.g.isEnabledInQuery || isPageEligible)) {
      startLoading();

      cd.debug.stopTimer('start');
      cd.debug.startTimer('loading data');

      // Make some requests in advance if the API module is ready in order not to make 2 requests
      // sequentially. We don't make a userinfo request, because if there is more than one tab in
      // the background, this request is made and the execution stops at mw.loader.using, which
      // results in overriding the renewed visits setting of one tab by another tab (the visits are
      // loaded by one tab, then another tab, then written by one tab, then by another tab).
      let siteDataRequests = [];
      if (mw.loader.getState('mediawiki.api') === 'ready') {
        siteDataRequests = loadSiteData();

        // We are _not_ calling getUserInfo() here to avoid losing visits data updates from some
        // pages if more than one page is opened simultaneously. In this situation, visits could be
        // requested for multiple pages; updated and then saved for each of them with losing the
        // updates from the rest.
      }

      const modules = [
        'jquery.client',
        'jquery.color',
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
        'oojs-ui',
        'oojs-ui.styles.icons-alerts',
        'oojs-ui.styles.icons-content',
        'oojs-ui.styles.icons-editing-core',
        'oojs-ui.styles.icons-interactions',
        'oojs-ui.styles.icons-movement',
        'user.options',
      ];

      // mw.loader.using delays execution even if all modules are ready (if CD is used as a gadget
      // with preloaded dependencies, for example), so we use this trick.
      let modulesRequest;
      let cachedScrollY;
      if (modules.every((module) => mw.loader.getState(module) === 'ready')) {
        // If there is no data to load and, therefore, no period of time within which a reflow
        // (layout thrashing) could happen without impeding performance, we cache the value so that
        // it could be used in util.saveRelativeScrollPosition without causing a reflow.
        if (siteDataRequests?.every((request) => request.state() === 'resolved')) {
          cachedScrollY = window.scrollY;
        }
      } else {
        modulesRequest = mw.loader.using(modules);
      }

      Promise.all([modulesRequest, ...siteDataRequests]).then(
        async () => {
          try {
            await processPage(undefined, siteDataRequests, cachedScrollY);
          } catch (e) {
            mw.notify(cd.s('error-processpage'), { type: 'error' });
            console.error(e);
            finishLoading();
          }
        },
        (e) => {
          mw.notify(cd.s('error-loaddata'), { type: 'error' });
          console.error(e);
          finishLoading();
        }
      );

      // https://phabricator.wikimedia.org/T68598 "mw.loader state of module stuck at "loading" if
      // request was aborted"
      setTimeout(() => {
        if (isPageLoading()) {
          finishLoading(false);
          console.warn('The loading overlay stays for more than 10 seconds; removing it.');
        }
      }, 10000);

      cd.g.$contentColumn = skin$({
        timeless: '#mw-content',
        minerva: '#bodyContent',
        default: '#content',
      });

      /*
        Additions of CSS set a stage for a future reflow which delays operations dependent on
        rendering, so we run them now, not after the requests are fulfilled, to save time. The
        overall order is like this:
        1. Make network requests (above).
        2. Run operations dependent on rendering, such as window.getComputedStyle() and jQuery's
           .css() (below). Normally they would initiate a reflow, but, as we haven't changed the
           layout or added CSS yet, there is nothing to update.
        3. Run operations that create prerequisites for a reflow, such as adding CSS. Thanks to the
           fact that the network requests, if any, are already pending, we don't lose time.
       */
      memorizeCssValues();

      setTalkPageCssVariables();

      require('../less/global.less');
      require('../less/Comment.less');
      require('../less/CommentForm.less');
      require('../less/Section.less');
      require('../less/commentLayers.less');
      require('../less/navPanel.less');
      require('../less/pageNav.less');
      require('../less/skin.less');
      require('../less/talkPage.less');

      addFooterLink(false);
    } else {
      addFooterLink(true);
    }
  }

  const isRedLink = /[?&]redlink=1/.test(location.search);
  if (isPageEligible && mw.config.get('wgAction') === 'edit' && isRedLink) {
    const $addTopicLink = $('#ca-addsection a');
    const href = $addTopicLink.prop('href');
    if (href) {
      const url = new URL(href);
      url.searchParams.delete('action');
      url.searchParams.delete('section');
      url.searchParams.set('cdaddtopic', 1);
      $addTopicLink.attr('href', url);
    }
  }

  // Process the page as a log page
  const isEligibleSpecialPage = ['Watchlist', 'Contributions', 'Recentchanges']
    .includes(mw.config.get('wgCanonicalSpecialPageName'));
  const isEligibleHistoryPage = (
    mw.config.get('wgAction') === 'history' &&
    isProbablyTalkPage(cd.g.PAGE_NAME, cd.g.NAMESPACE_NUMBER)
  );
  if (isEligibleSpecialPage || isEligibleHistoryPage || cd.g.IS_DIFF_PAGE) {
    // Make some requests in advance if the API module is ready in order not to make 2 requests
    // sequentially.
    let siteDataRequests = [];
    if (mw.loader.getState('mediawiki.api') === 'ready') {
      siteDataRequests = loadSiteData();
      if (!cd.g.IS_DIFF_PAGE) {
        getUserInfo(true).catch((e) => {
          console.warn(e);
        });
      }
    }

    mw.loader.using([
      'mediawiki.Title',
      'mediawiki.api',
      'mediawiki.jqueryMsg',
      'mediawiki.user',
      'mediawiki.util',
      'oojs',
      'oojs-ui',
      'oojs-ui.styles.icons-alerts',
      'oojs-ui.styles.icons-editing-list',
      'oojs-ui.styles.icons-interactions',
      'user.options',
    ]).then(
      () => {
        commentLinks(siteDataRequests);

        // See the comment above: "Additions of CSS...".
        require('../less/global.less');
        require('../less/logPages.less');
      },
      (e) => {
        mw.notify(cd.s('error-loaddata'), { type: 'error' });
        console.error(e);
      }
    );
  }

  if (mw.config.get('wgCanonicalSpecialPageName') === 'Search') {
    addCommentLinksToSpecialSearch();
  }

  if (!isPageLoading()) {
    cd.debug.stopTimer('start');
  }

  /**
   * The page has been preprocessed (not parsed yet, but its type has been checked and some
   * important properties have been set).
   *
   * @event preprocessed
   * @param {object} cd {@link convenientDiscussions} object.
   */
  mw.hook('convenientDiscussions.preprocessed').fire(cd);
}

/**
 * Set language properties of the global object, taking fallback languages into account.
 *
 * @returns {boolean} Are fallbacks employed.
 * @private
 */
function setLanguages() {
  const languageOrFallback = (lang) => (
    I18N_LIST.includes(lang) ?
    lang :
    (LANGUAGE_FALLBACKS[lang] || []).find((fallback) => I18N_LIST.includes(fallback)) || 'en'
  );

  // This is the only place where mw.config.get('wgUserLanguage') is used.
  cd.g.USER_LANGUAGE = languageOrFallback(mw.config.get('wgUserLanguage'));

  // Should we use a fallback for the content language? Maybe, but in case of MediaWiki messages
  // used for signature parsing we will have to use the real content language (see
  // siteData.loadSiteData). As a result, we use cd.g.CONTENT_LANGUAGE only for the script's own
  // messages, not the native MediaWiki messages.
  cd.g.CONTENT_LANGUAGE = languageOrFallback(mw.config.get('wgContentLanguage'));

  return !(
    cd.g.USER_LANGUAGE === mw.config.get('wgUserLanguage') &&
    cd.g.CONTENT_LANGUAGE === mw.config.get('wgContentLanguage')
  );
}

/**
 * Load and execute the configuration script if available.
 *
 * @returns {Promise}
 * @private
 */
function getConfig() {
  return new Promise((resolve, reject) => {
    let key = location.hostname;
    if (IS_TEST) {
      key += '-test';
    }
    const configUrl = CONFIG_URLS[key] || CONFIG_URLS[location.hostname];
    if (configUrl) {
      const rejectWithMsg = (e) => {
        reject(['Convenient Discussions can\'t run: couldn\'t load the configuration.', e]);
      };

      const [, gadgetName] = configUrl.match(/modules=ext.gadget.([^?&]+)/) || [];
      if (gadgetName && mw.user.options.get(`gadget-${gadgetName}`)) {
        // A gadget is enabled on the wiki, and it should be loaded and executed without any
        // additional requests; we just wait until it happens.
        mw.loader.using(`ext.gadget.${gadgetName}`).then(() => {
          resolve();
        });
        return;
      }
      mw.loader.getScript(configUrl).then(
        () => {
          resolve();
        },
        rejectWithMsg
      );
    } else {
      resolve();
    }
  });
}

/**
 * Load and add localization strings to the `cd.i18n` object. Use fallback languages if default
 * languages are unavailable.
 *
 * @returns {Promise}
 * @private
 */
function getStrings() {
  const requests = [cd.g.USER_LANGUAGE, cd.g.CONTENT_LANGUAGE]
    .filter(unique)
    .filter((lang) => lang !== 'en' && !cd.i18n?.[lang])
    .map((lang) => {
      const url = `https://commons.wikimedia.org/w/index.php?title=User:Jack_who_built_the_house/convenientDiscussions-i18n/${lang}.js&action=raw&ctype=text/javascript`;
      return mw.loader.getScript(url);
    });

  // We assume it's OK to fall back to English if the translation is unavailable for any reason.
  return Promise.all(requests).catch(() => {});
}

/**
 * The main script function.
 *
 * @fires launched
 * @private
 */
async function app() {
  if (cd.isRunning) {
    console.warn('One instance of Convenient Discussions is already running.');
    return;
  }

  /**
   * Is the script running.
   *
   * @name isRunning
   * @type {boolean}
   * @memberof convenientDiscussions
   */
  cd.isRunning = true;

  if (
    /(^|\.)m\./.test(location.hostname) ||
    mw.config.get('wgPageContentModel') !== 'wikitext' ||
    mw.config.get('wgIsMainPage')
  ) {
    return;
  }

  if (IS_SINGLE) {
    cd.config = config;
  }

  cd.debug = debug;
  cd.g = g;
  cd.s = s;
  cd.sParse = sParse;
  cd.sPlain = sPlain;
  cd.mws = mws;

  /**
   * Collection of script state properties.
   *
   * @namespace state
   * @memberof convenientDiscussions
   */
  cd.state = {};

  /**
   * Script's publicly available API. Here there are some utilities that we believe should be
   * accessible for external use.
   *
   * If you need some internal method to be available publicly, contact the script's maintainer (or
   * just make a relevant pull request).
   *
   * @namespace api
   * @memberof convenientDiscussions
   */
  cd.api = {};

  /**
   * @name Page
   * @type {object}
   * @see Page
   * @memberof convenientDiscussions.api
   */
  cd.api.Page = Page;

  /**
   * @see module:timestamp.generateCommentAnchor
   * @function generateCommentAnchor
   * @memberof convenientDiscussions.api
   */
  cd.api.generateCommentAnchor = generateCommentAnchor;

  /**
   * @see module:timestamp.parseCommentAnchor
   * @function parseCommentAnchor
   * @memberof convenientDiscussions.api
   */
  cd.api.parseCommentAnchor = parseCommentAnchor;

  /**
   * @see module:util.buildEditSummary
   * @function buildEditSummary
   * @memberof convenientDiscussions.api
   */
  cd.api.buildEditSummary = buildEditSummary;

  /**
   * @see module:util.isPageOverlayOn
   * @function isPageOverlayOn
   * @memberof convenientDiscussions.api
   */
  cd.api.isPageOverlayOn = isPageOverlayOn;

  /**
   * @see module:util.wrap
   * @function wrap
   * @memberof convenientDiscussions.api
   */
  cd.api.wrap = wrap;

  /**
   * @see module:util.wrapDiffBody
   * @function wrapDiffBody
   * @memberof convenientDiscussions.api
   */
  cd.api.wrapDiffBody = wrapDiffBody;

  // TODO: Delete after all addons are updated.
  cd.util = cd.api;
  cd.g.Page = cd.api.Page;

  cd.debug.init();
  cd.debug.startTimer('total time');
  cd.debug.startTimer('loading config and strings');

  /**
   * The script has launched.
   *
   * @event launched
   * @param {object} cd {@link convenientDiscussions} object.
   */
  mw.hook('convenientDiscussions.launched').fire(cd);

  const areLanguageFallbacksEmployed = setLanguages();
  const getStringsPromise = areLanguageFallbacksEmployed ?
    getStrings() :

    // cd.getStringsPromise may be set in the configuration file.
    !cd.i18n && (cd.getStringsPromise || getStrings());

  try {
    await Promise.all([!cd.config && getConfig(), getStringsPromise]);
  } catch (e) {
    console.error(e);
    return;
  }

  cd.debug.stopTimer('loading config and strings');

  $(go);
}

app();
