/**
 * Main module.
 *
 * @module app
 */

import { create as nanoCssCreate } from 'nano-css';

import Comment from './Comment';
import CommentForm from './CommentForm';
import Section from './Section';
import Worker from './worker';
import cd from './cd';
import commentLinks from './commentLinks';
import debug from './debug';
import defaultConfig from './defaultConfig';
import g from './staticGlobals';
import processPage from './processPage';
import util from './globalUtil';
import { defined, isProbablyTalkPage, underlinesToSpaces } from './util';
import { formatDate, parseCommentAnchor } from './timestamp';
import { getUserInfo } from './apiWrappers';
import { initTalkPageCss, removeLoadingOverlay, setLoadingOverlay } from './boot';
import { loadMessages } from './dateFormat';
import { setVisits } from './options';

let config;
let strings;
if (IS_LOCAL) {
  config = require(`../../config/${CONFIG_FILE_NAME}`).default;
  strings = require(`../../i18n/${LANG_FILE_NAME}`);
}

/**
 * Get a language string.
 *
 * @param {string} name
 * @param {...*} params
 * @returns {?string}
 * @memberof module:cd~convenientDiscussions
 */
function s(name, ...params) {
  if (!name) {
    return null;
  }
  const fullName = `convenientdiscussions-${name}`;
  if (!cd.g.QQX_MODE && typeof mw.messages.get(fullName) === 'string') {
    return mw.message(fullName, ...params).toString();
  } else {
    const paramsString = params.length ? `: ${params.join(', ')}` : '';
    return `(${fullName}${paramsString})`;
  }
}

/**
 * Function executed after the localization strings are ready.
 *
 * @private
 */
function go() {
  Object.keys(cd.strings).forEach((name) => {
    mw.messages.set(`convenientdiscussions-${name}`, cd.strings[name]);
  });

  cd.g.SETTINGS_OPTION_FULL_NAME = `userjs-${cd.config.optionsPrefix}-settings`;
  cd.g.VISITS_OPTION_FULL_NAME = `userjs-${cd.config.optionsPrefix}-visits`;

  // For historical reasons, ru.wikipedia.org has 'watchedTopics'.
  const watchedSectionsOptionName = location.host === 'ru.wikipedia.org' ?
    'watchedTopics' :
    'watchedSections';
  cd.g.WATCHED_SECTIONS_OPTION_FULL_NAME = (
    `userjs-${cd.config.optionsPrefix}-${watchedSectionsOptionName}`
  );

  cd.g.IS_DIFF_PAGE = mw.config.get('wgIsArticle') && /[?&]diff=[^&]/.test(location.search);
  cd.g.CURRENT_PAGE = underlinesToSpaces(mw.config.get('wgPageName'));
  cd.g.CURRENT_NAMESPACE_NUMBER = mw.config.get('wgNamespaceNumber');
  cd.g.CURRENT_USER_NAME = mw.config.get('wgUserName');

  cd.g.$content = $('#mw-content-text');

  if (!cd.config.customTalkNamespaces) {
    cd.config.customTalkNamespaces = mw.config.get('wgExtraSignatureNamespaces');
    if (cd.config.customTalkNamespaces.includes(0)) {
      cd.config.customTalkNamespaces.splice(cd.config.customTalkNamespaces.indexOf(0));
    }
  }

  // Go
  if (
    mw.config.get('wgIsArticle') &&
    (
      isProbablyTalkPage(cd.g.CURRENT_PAGE, cd.g.CURRENT_NAMESPACE_NUMBER) ||
      $('#ca-addsection').length ||
      // .cd-talkPage is used as a last resort way to make CD parse the page, as opposed to using
      // the list of supported namespaces and page white/black list in the configuration. With this
      // method, there won't be "comment" links for edits on pages that list revisions such as the
      // watchlist.
      cd.g.$content.find('.cd-talkPage').length
    )
  ) {
    cd.g.firstRun = true;

    cd.g.nanoCss = nanoCssCreate();
    cd.g.nanoCss.put('.cd-loadingPopup', {
      width: cd.config.logoWidth,
    });
    cd.g.nanoCss.put('.cd-loadingPopup-logo', {
      width: cd.config.logoWidth,
      height: cd.config.logoHeight,
    });

    setLoadingOverlay();

    cd.debug.stopTimer('start');
    cd.debug.startTimer('loading data');

    cd.g.worker = new Worker();

    // Make some requests in advance if the API module is ready in order not to make 2 requests
    // sequentially.
    let messagesRequest;
    if (mw.loader.getState('mediawiki.api') === 'ready') {
      cd.g.api = new mw.Api();
      messagesRequest = loadMessages();
      getUserInfo().catch((e) => {
        console.warn(e);
      });
    }

    // We use a jQuery promise as there is no way to know the state of native promises.
    const modulesRequest = $.when(...[
      mw.loader.using([
        'jquery.color',
        'jquery.client',
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
        'oojs-ui.styles.icons-interactions',
        'user.options',
      ]),
      messagesRequest,
    ].filter(defined)).then(
      () => {
        try {
          processPage({ messagesRequest });
        } catch (e) {
          mw.notify(cd.s('error-processpage'), { type: 'error' });
          removeLoadingOverlay();
          console.error(e);
        }
      },
      (e) => {
        mw.notify(cd.s('error-loaddata'), { type: 'error' });
        removeLoadingOverlay();
        console.warn(e);
      }
    );

    setTimeout(() => {
      // https://phabricator.wikimedia.org/T68598
      if (modulesRequest.state() !== 'resolved') {
        removeLoadingOverlay();
        console.warn('The promise is in the "pending" state for 10 seconds; removing the loading overlay.');
      }
    }, 10000);

    // Additions of CSS cause a reflow which delays operations dependent on rendering, so we run it
    // now, not after the requests are fulfilled, to save time. The overall order is like this:
    // 1. Make API requests (above).
    // 2. Run operations dependent on rendering, such as window.getComputedStyle().
    // 3. Run operations that initiate a reflow, such as adding CSS. Thanks to the fact that the API
    // requests are already running, we don't lose time.
    cd.g.REGULAR_LINE_HEIGHT = parseFloat(window.getComputedStyle(cd.g.$content.get(0)).lineHeight);

    initTalkPageCss();

    require('../less/global.less');
    require('../less/Comment.less');
    require('../less/CommentForm.less');
    require('../less/Section.less');
    require('../less/commentLayers.less');
    require('../less/navPanel.less');
    require('../less/skin.less');
    require('../less/talkPage.less');
  }

  if (
    ['Watchlist', 'Contributions', 'Recentchanges']
      .includes(mw.config.get('wgCanonicalSpecialPageName')) ||
    (
      mw.config.get('wgAction') === 'history' &&
      isProbablyTalkPage(cd.g.CURRENT_PAGE, cd.g.CURRENT_NAMESPACE_NUMBER)
    ) ||
    cd.g.IS_DIFF_PAGE
  ) {
    // Make some requests in advance if the API module is ready in order not to make 2 requests
    // sequentially.
    let messagesRequest;
    if (mw.loader.getState('mediawiki.api') === 'ready') {
      cd.g.api = new mw.Api();
      messagesRequest = loadMessages();
      getUserInfo().catch((e) => {
        console.warn(e);
      });
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
        commentLinks({ messagesRequest });

        // See the comment above: "Additions of CSS...".
        require('../less/global.less');
        require('../less/logPages.less');
      },
      (e) => {
        console.warn(e);
      }
    );
  }
}

/**
 * If localization strings are not available, load them.
 *
 * @param {string} lang
 * @private
 */
function loadStrings(lang) {
  mw.loader.getScript(`https://commons.wikimedia.org/w/index.php?title=User:Jack_who_built_the_house/convenientDiscussions/strings-${lang}.js&action=raw&ctype=text/javascript`)
    .then(
      () => {
        if (cd.strings) {
          go();
        } else if (lang !== 'en') {
          loadStrings('en');
        } else {
          console.warn('Convenient Discussions can\'t run: localization strings couldn\'t be found.');
        }
      },
      (e) => {
        console.warn(e);
      }
    );
}

/**
 * The main script function.
 *
 * @private
 * @fires launched
 */
function app() {
  // Doesn't work in mobile version, isn't needed on Structured Discussions pages.
  if (location.host.endsWith('.m.wikipedia.org') || $('.flow-board-page').length) return;

  if (cd.running) {
    console.warn('One instance of Convenient Discussions is already running.');
    return;
  }

  /**
   * Is the script running.
   *
   * @name running
   * @type {boolean}
   * @memberof module:cd~convenientDiscussions
   */
  cd.running = true;

  /**
   * Script configuration. Default configuration is at {@link module:defaultConfig}.
   *
   * @name config
   * @type {object}
   * @memberof module:cd~convenientDiscussions
   */
  cd.config = Object.assign(defaultConfig, cd.config);

  if (IS_LOCAL) {
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
  cd.util = util;

  /**
   * @see module:Comment.getCommentByAnchor Get a comment by anchor
   * @function getCommentByAnchor
   * @memberof module:cd~convenientDiscussions
   */
  cd.getCommentByAnchor = Comment.getCommentByAnchor;

  /**
   * @see module:Section.getSectionByAnchor Get a section by anchor
   * @function getSectionByAnchor
   * @memberof module:cd~convenientDiscussions
   */
  cd.getSectionByAnchor = Section.getSectionByAnchor;

  /**
   * @see module:Section.getSectionsByHeadline
   * @function getSectionsByHeadline
   * @memberof module:cd~convenientDiscussions
   */
  cd.getSectionsByHeadline = Section.getSectionsByHeadline;

  /**
   * @see module:CommentForm.getLastActiveCommentForm
   * @function getLastActiveCommentForm
   * @memberof module:cd~convenientDiscussions
   */
  cd.getLastActiveCommentForm = CommentForm.getLastActiveCommentForm;

  /**
   * @see module:CommentForm.getLastActiveAlteredCommentForm
   * @function getLastActiveAlteredCommentForm
   * @memberof module:cd~convenientDiscussions
   */
  cd.getLastActiveAlteredCommentForm = CommentForm.getLastActiveAlteredCommentForm;


  /* Some utilities that we believe should be global for external use. */

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
  cd.debug.startTimer('start');

  /**
   * The script has launched.
   *
   * @event launched
   * @type {module:cd~convenientDiscussions}
   */
  mw.hook('convenientDiscussions.launched').fire(cd);

  if (!cd.strings) {
    let match = location.host.match(/^([a-z-]+)\.(?:wikipedia|wikibooks|wikinews|wikiquote|wikisource|wikiversity|wikivoyage|wiktionary)\.org$/);
    if (!match) {
      // Chapters' sites
      match = location.host.match(/^([a-z]{2})\.wikimedia\.org$/);
    }
    const lang = match ? match[1] : 'en';
    loadStrings(lang);
  } else {
    go();
  }
}

$(app);
