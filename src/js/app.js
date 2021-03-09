/**
 * Main module.
 *
 * @module app
 */

import cd from './cd';
import commentLinks from './commentLinks';
import configUrls from './../../config/urls.json';
import debug from './debug';
import defaultConfig from '../../config/default';
import g from './staticGlobals';
import processPage from './processPage';
import util from './globalUtil';
import { formatDate, parseCommentAnchor } from './timestamp';
import { getUserInfo } from './apiWrappers';
import {
  isLoadingOverlayOn,
  removeLoadingOverlay,
  setLoadingOverlay,
  setTalkPageCssVariables,
} from './boot';
import {
  isProbablyTalkPage,
  mergeRegexps,
  nativePromiseState,
  skin$,
  underlinesToSpaces,
  unique,
} from './util';
import { loadSiteData } from './siteData';
import { setVisits } from './options';

let config;
let strings;
if (IS_SNIPPET) {
  config = require(`../../config/${CONFIG_FILE_NAME}`).default;

  const replaceEntities = (s) => (
    s
      .replace(/&nbsp;/g, ' ')
      .replace(/&#32;/g, ' ')
  );

  cd.i18n = {};
  cd.i18n.en = require('../../i18n/en.json');
  Object.keys(cd.i18n.en).forEach((name) => {
    cd.i18n.en[name] = replaceEntities(cd.i18n.en[name]);
  });
  if (LANG_CODE !== 'en') {
    cd.i18n[LANG_CODE] = require(`../../i18n/${LANG_CODE}.json`);
    Object.keys(cd.i18n[LANG_CODE])
      .filter((name) => typeof cd.i18n[LANG_CODE][name] === 'string')
      .forEach((name) => {
        cd.i18n[LANG_CODE][name] = replaceEntities(cd.i18n[LANG_CODE][name]);
      });
  }
}

/**
 * Get a language string.
 *
 * @param {string} name String name.
 * @param {...*} [params] String parameters (substituted strings, also {@link
 *   module:userRegistry~User User} objects for the use in {{gender:}}).
 * @param {object} [options]
 * @param {boolean} [options.plain] Should the message be returned in a plain, not substituted,
 *   form.
 * @param {boolean} [options.parse] Should the message be returned in a parsed form. Wikilinks
 *   are replaced with HTML tags, the code is sanitized. Use this for strings that have their raw
 *   HTML inserted into the page.
 * @returns {?string}
 * @memberof module:cd~convenientDiscussions
 */
function s(name, ...params) {
  if (!name) {
    return null;
  }
  const fullName = `convenient-discussions-${name}`;
  if (!cd.g.QQX_MODE && typeof mw.messages.get(fullName) === 'string') {
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
 * @param {...*} [params] String parameters (substituted strings, also {@link
 *   module:userRegistry~User User} objects for the use in {{gender:}}).
 * @returns {?string}
 * @memberof module:cd~convenientDiscussions
 */
function sParse(...args) {
  return s(...args, { parse: true });
}

/**
 * Get a language string in the "plain" format, with no substitutions replace.
 *
 * @param {string} name String name.
 * @returns {?string}
 * @memberof module:cd~convenientDiscussions
 */
function sPlain(name) {
  return s(name, { plain: true });
}

/**
 * A foolproof method to access MediaWiki messages intended to be used instead of `mw.msg` to
 * eliminate any possibility of an XSS injection. By a programmer's mistake some `mw.msg` value
 * could be inserted into a page in a raw HTML form. To prevent it, this function should be used, so
 * if the message contains an injection (for example, brought from Translatewiki or inserted by a
 * user who doesn't have the `editsitejs` right, but does have the `editinterface` right), the
 * function would sanitize the value.
 *
 * @param {string} name String name.
 * @param {...*} [params] String parameters (substituted strings, also {@link
 *   module:userRegistry~User User} objects for the use in {{gender:}}).
 * @param {object} [options]
 * @returns {string}
 * @memberof module:cd~convenientDiscussions
 */
function mws(...args) {
  return mw.message(...args).parse();
}

/**
 * When searching for a comment after clicking "OK" in a "Comment not found" dialog, add comment
 * links to the titles.
 *
 * @private
 */
function addCommentLinksToSpecialSearch() {
  const [, commentAnchor] = location.search.match(/[?&]cdcomment=([^&]+)(?:&|$)/) || [];
  if (commentAnchor) {
    mw.loader.using('mediawiki.api').then(
      async () => {
        await loadSiteData();
        $('.mw-search-result-heading').each((i, el) => {
          const $a = $('<a>')
            .attr(
              'href',
              (
                $(el)
                  .find('a')
                  .first()
                  .attr('href') +
                '#' +
                commentAnchor
              )
            )
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
  $('<a>')
    .attr('href', url.toString())
    .addClass('noprint')
    .text(cd.s(enable ? 'footer-runcd' : 'footer-dontruncd'))
    .appendTo($li);
  skin$({
    monobook: '#f-list',
    modern: '#footer-info',
    default: '#footer-places',
  }).append($li);
}

/**
 * Set the `cd.strings` object values.
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

  if (!IS_SNIPPET) {
    require('../../dist/convenientDiscussions-i18n/en.js');
  }
  cd.strings = {};
  Object.keys(cd.i18n.en).forEach((name) => {
    const relevantLang = contentStrings.some((contentStringName) => (
      name === contentStringName ||
      contentStringName.endsWith('-') && name.startsWith(contentStringName)
    )) ?
      mw.config.get('wgContentLanguage') :
      mw.config.get('wgUserLanguage');
    cd.strings[name] = cd.i18n[relevantLang]?.[name] || cd.i18n.en[name];
  });

  Object.keys(cd.strings).forEach((name) => {
    mw.messages.set(`convenient-discussions-${name}`, cd.strings[name]);
  });
}

/**
 * Function executed after the config and localization strings are ready.
 *
 * @private
 */
function go() {
  cd.debug.startTimer('start');

  /**
   * Script configuration. The default configuration is at {@link module:defaultConfig}.
   *
   * @name config
   * @type {object}
   * @memberof module:cd~convenientDiscussions
   */
  cd.config = Object.assign(defaultConfig, cd.config);

  setStrings();

  cd.g.SETTINGS_OPTION_NAME = `userjs-convenientDiscussions-settings`;
  cd.g.LOCAL_SETTINGS_OPTION_NAME = `userjs-${cd.config.optionsPrefix}-localSettings`;
  cd.g.VISITS_OPTION_NAME = `userjs-${cd.config.optionsPrefix}-visits`;

  // For historical reasons, ru.wikipedia.org has 'watchedTopics'.
  const wsonEnding = location.hostname === 'ru.wikipedia.org' ? 'watchedTopics' : 'watchedSections';
  cd.g.WATCHED_SECTIONS_OPTION_NAME = `userjs-${cd.config.optionsPrefix}-${wsonEnding}`;

  cd.g.IS_DIFF_PAGE = mw.config.get('wgIsArticle') && /[?&]diff=[^&]/.test(location.search);
  cd.g.CURRENT_PAGE_NAME = underlinesToSpaces(mw.config.get('wgPageName'));
  cd.g.CURRENT_PAGE_TITLE = underlinesToSpaces(mw.config.get('wgTitle'));
  cd.g.CURRENT_NAMESPACE_NUMBER = mw.config.get('wgNamespaceNumber');
  cd.g.CURRENT_USER_NAME = mw.config.get('wgUserName');
  cd.g.PAGE_WHITELIST_REGEXP = mergeRegexps(cd.config.pageWhitelist);
  cd.g.PAGE_BLACKLIST_REGEXP = mergeRegexps(cd.config.pageBlacklist);
  cd.g.CONTENT_DIR = document.body.classList.contains('sitedir-rtl') ? 'rtl' : 'ltr';

  // Quite a rough check for mobile browsers, a mix of what is advised at
  // https://stackoverflow.com/a/24600597 (sends to
  // https://developer.mozilla.org/en-US/docs/Browser_detection_using_the_user_agent) and
  // https://stackoverflow.com/a/14301832.
  cd.g.IS_MOBILE = (
    /Mobi|Android/i.test(navigator.userAgent) ||
    typeof window.orientation !== 'undefined'
  );

  cd.g.$content = $('#mw-content-text');

  const enabledInQuery = /[?&]cdtalkpage=(1|true|yes|y)(?=&|$)/.test(location.search);

  // Process the page as a talk page
  if (mw.config.get('wgIsArticle')) {
    if (
      !/[?&]cdtalkpage=(0|false|no|n)(?=&|$)/.test(location.search) &&
      (
        (!mw.config.get('wgIsRedirect') && !cd.g.$content.find('.cd-notTalkPage').length) ||
        enabledInQuery
      ) &&
      (
        isProbablyTalkPage(cd.g.CURRENT_PAGE_NAME, cd.g.CURRENT_NAMESPACE_NUMBER) ||
        $('#ca-addsection').length ||

        // .cd-talkPage is used as a last resort way to make CD parse the page, as opposed to using
        // the list of supported namespaces and page white/black list in the configuration. With
        // this method, there won't be "comment" links for edits on pages that list revisions such
        // as the watchlist.
        cd.g.$content.find('.cd-talkPage').length ||

        enabledInQuery
      )
    ) {
      /**
       * Is the page processed for the first time after it was loaded (i.e., not reloaded using the
       * script's refresh functionality).
       *
       * @type {CommentForm|undefined}
       * @memberof module:cd~convenientDiscussions.g
       */
      cd.g.isFirstRun = true;

      setLoadingOverlay();

      cd.debug.stopTimer('start');
      cd.debug.startTimer('loading data');

      // Make some requests in advance if the API module is ready in order not to make 2 requests
      // sequentially. We don't make a userinfo request, because if there is more than one tab in
      // the background, this request is made and the execution stops at mw.loader.using, which
      // results in overriding the renewed visits setting of one tab by another tab (the visits are
      // loaded by one tab, then another tab, then written by one tab, then by another tab).
      let siteDataRequest;
      if (mw.loader.getState('mediawiki.api') === 'ready') {
        siteDataRequest = loadSiteData();
      }

      const modules = [
        'jquery.client',
        'jquery.color',
        'mediawiki.Title',
        'mediawiki.api',
        'mediawiki.cookie',
        'mediawiki.jqueryMsg',
        'mediawiki.notification',
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
      if (!modules.every((module) => mw.loader.getState(module) === 'ready')) {
        modulesRequest = mw.loader.using(modules);
      }

      Promise.all([modulesRequest, siteDataRequests]).then(
        async () => {
          try {
            await processPage(undefined, siteDataRequest);
          } catch (e) {
            mw.notify(cd.s('error-processpage'), { type: 'error' });
            removeLoadingOverlay();
            console.error(e);
          }
        },
        (e) => {
          mw.notify(cd.s('error-loaddata'), { type: 'error' });
          removeLoadingOverlay();
          console.error(e);
        }
      );

      // https://phabricator.wikimedia.org/T68598 "mw.loader state of module stuck at "loading" if
      // request was aborted"
      setTimeout(() => {
        if (isLoadingOverlayOn()) {
          removeLoadingOverlay();
          console.warn('The loading overlay stays for more than 10 seconds; removing it.');
        }
      }, 10000);

      cd.g.SKIN = mw.config.get('skin');
      if (cd.g.SKIN === 'vector' && document.body.classList.contains('skin-vector-legacy')) {
        cd.g.SKIN = 'vector-legacy';
      }

      /*
        Additions of CSS cause a reflow which delays operations dependent on rendering, so we run
        it now, not after the requests are fulfilled, to save time. The overall order is like this:
        1. Make API requests (above).
        2. Run operations dependent on rendering, such as window.getComputedStyle().
        3. Run operations that initiate a reflow, such as adding CSS. Thanks to the fact that the
        API requests are already running, we don't lose time.
       */
      cd.g.REGULAR_LINE_HEIGHT = parseFloat(cd.g.$content.css('line-height'));

      // For the Timeless skin
      cd.g.BODY_SCROLL_PADDING_TOP = parseFloat($(document.body).css('scroll-padding-top')) || 0;

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

  // Process the page as a log page
  if (
    ['Watchlist', 'Contributions', 'Recentchanges']
      .includes(mw.config.get('wgCanonicalSpecialPageName')) ||
    (
      mw.config.get('wgAction') === 'history' &&
      isProbablyTalkPage(cd.g.CURRENT_PAGE_NAME, cd.g.CURRENT_NAMESPACE_NUMBER)
    ) ||
    cd.g.IS_DIFF_PAGE
  ) {
    // Make some requests in advance if the API module is ready in order not to make 2 requests
    // sequentially.
    let siteDataRequest;
    if (mw.loader.getState('mediawiki.api') === 'ready') {
      siteDataRequest = loadSiteData();
      if (!cd.g.IS_DIFF_PAGE) {
        getUserInfo(true).catch((e) => {
          console.warn(e);
        });
      }
    }

    mw.loader.using([
      'user.options',
      'mediawiki.Title',
      'mediawiki.api',
      'mediawiki.jqueryMsg',
      'mediawiki.util',
      'mediawiki.user',
      'oojs',
      'oojs-ui',
      'oojs-ui.styles.icons-interactions',
      'oojs-ui.styles.icons-editing-list',
      'oojs-ui.styles.icons-alerts',
    ]).then(
      () => {
        commentLinks(siteDataRequest);

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
}

/**
 * Load and execute the configuration script if available.
 *
 * @returns {Promise}
 * @private
 */
function getConfig() {
  return new Promise((resolve, reject) => {
    if (configUrls[location.hostname]) {
      const rejectWithMsg = (e) => {
        reject(['Convenient Discussions can\'t run: couldn\'t load the configuration.', e]);
      };
      const getScript = (url, emptyResponseCallback) => {
        mw.loader.getScript(url).then(
          (data) => {
            if (data === '') {
              emptyResponseCallback();
            } else {
              resolve();
            }
          },
          rejectWithMsg
        );
      };

      const url = IS_DEV ?
        configUrls[location.hostname].replace('.js', '-dev.js') :
        configUrls[location.hostname];
      getScript(url, () => {
        if (IS_DEV) {
          getScript(configUrls[location.hostname], () => {
            rejectWithMsg('Empty response.');
          });
        } else {
          rejectWithMsg('Empty response.');
        }
      });
    } else {
      resolve();
    }
  });
}

/**
 * Load and add localization strings.
 *
 * @returns {Promise}
 * @private
 */
function getStrings() {
  const requests = [mw.config.get('wgUserLanguage'), mw.config.get('wgContentLanguage')]
    .filter(unique)
    .filter((lang) => lang !== 'en')
    .map((lang) => mw.loader.getScript(`https://commons.wikimedia.org/w/index.php?title=User:Jack_who_built_the_house/convenientDiscussions-i18n/${lang}.js&action=raw&ctype=text/javascript`));
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
   * @memberof module:cd~convenientDiscussions
   */
  cd.isRunning = true;

  if (
    /(^|\.)m\./.test(location.hostname) ||
    mw.config.get('wgPageContentModel') !== 'wikitext' ||
    mw.config.get('wgIsMainPage')
  ) {
    return;
  }

  if (IS_SNIPPET) {
    cd.config = Object.assign(defaultConfig, config);
    cd.strings = strings;
  }

  /**
   * @see module:debug
   * @name debug
   * @type {object}
   * @memberof module:cd~convenientDiscussions
   */
  cd.debug = debug;

  cd.g = g;
  cd.s = s;
  cd.sParse = sParse;
  cd.sPlain = sPlain;
  cd.mws = mws;
  cd.util = util;


  /* Some utilities that we believe should be global for external use */

  /**
   * @see module:timestamp.parseCommentAnchor
   * @function parseCommentAnchor
   * @memberof module:cd~convenientDiscussions.util
   */
  cd.util.parseCommentAnchor = parseCommentAnchor;

  /**
   * @see module:timestamp.formatDate
   * @function formatDate
   * @memberof module:cd~convenientDiscussions.util
   */
  cd.util.formatDate = formatDate;

  /**
   * @see module:options.setVisits
   * @function setVisits
   * @memberof module:cd~convenientDiscussions.util
   */
  cd.util.setVisits = setVisits;

  cd.debug.init();
  cd.debug.startTimer('total time');
  cd.debug.startTimer('loading config and strings');

  /**
   * The script has launched.
   *
   * @event launched
   * @type {module:cd~convenientDiscussions}
   */
  mw.hook('convenientDiscussions.launched').fire(cd);

  try {
    await Promise.all([
      !cd.config && getConfig(),

      // cd.getStringsPromise may be set in the configuration file.
      !cd.i18n && (cd.getStringsPromise || getStrings()),
    ]);
  } catch (e) {
    console.error(e);
    return;
  }

  cd.debug.stopTimer('loading config and strings');

  go();
}

$(app);
