import dateFormats from '../data/dateFormats.json';
import digitsData from '../data/digits.json';
import languageFallbacks from '../data/languageFallbacks.json';

import addCommentLinks from './addCommentLinks';
import cd from './cd';
import debug from './debug';
import jqueryExtensions from './jqueryExtensions';
import pageRegistry from './pageRegistry';
import settings from './settings';
import { processPage } from './updateChecker';
import userRegistry from './userRegistry';
import { getUserInfo, splitIntoBatches } from './utils-api';
import { defined, generatePageNamePattern, getContentLanguageMessages, getQueryParamBooleanValue, isProbablyTalkPage, sleep, unique } from './utils-general';
import { dateTokenToMessageNames, initDayjs } from './utils-timestamp';
import { createSvg, skin$, transparentize } from './utils-window';
import visits from './visits';

/**
 * Singleton for managing the booting, rebooting, and unbooting (unloading) of the page.
 *
 * It
 * * initializes the script, both on talk pages and on log pages such as the watchlist (TODO:
 *   investigate whether these cases two should better be split between different classes). Methods
 *   of the class set constants as properties of the {@link convenientDiscussions.g} object, add
 *   CSS, load site data, such as MediaWiki messages and configuration, and set date formats based
 *   on it;
 * * controls the reload (boot) process of *talk* pages;
 * * controls the behavior when the user tries to close the tab;
 * * holds some state common for talk pages and pages with comment links (e.g. `$content`, `$root`)
 *   that needs to be actualized on DOM updates. Global config (i.e. global data that doesn't change
 *   unlike state) goes in the {@link convenientDiscussions.g} object, and global methods go in
 *   {@link convenientDiscussions} itself.
 *
 * An important thing about this module is that it is imported when modules such as OOUI are not yet
 * available.
 */
class BootController {
  /** @type {JQuery} */
  $content;

  /** @type {JQuery} */
  $contentColumn;

  /**
   * @type {{
   *   startMargin: number;
   *   start: number;
   *   end: number;
   * }}
   * @private
   */
  contentColumnOffsets;

  /**
   * @type {JQuery}
   * @private
   */
  $loadingPopup;

  /**
   * The current (or last available) boot process.
   *
   * For simpler type checking, assume it's always set (we don't use it when it's not).
   *
   * @type {import('./BootProcess').default}
   * @private
   */
  bootProcess;

  /** @type {boolean} */
  definitelyTalkPage;

  /** @type {boolean} */
  articlePageTalkPage;

  /** @type {boolean} */
  diffPage;

  /** @type {boolean} */
  talkPage;

  /** @type {Array<Promise|JQuery.Promise>} */
  siteDataRequests;

  /**
   * Is the page loading (the loading overlay is on).
   *
   * @private
   */
  booting = false;

  /**
   * @type {{
   *   [key: string]: (event: JQuery.Event) => '' | undefined;
   * }}
   * @private
   */
  beforeUnloadHandlers = {};

  /**
   * @type {{
   *   definitelyTalk: boolean;
   *   articleTalk: boolean;
   *   diff: boolean;
   *   talk: boolean;
   *   watchlist: boolean;
   *   contributions: boolean;
   *   history: boolean;
   * }}
   */
  pageTypes = {
    /**
     * Is the current page likely a talk page. See `definitelyTalk` for the most strict criteria.
     */
    talk: false,

    /**
     * Does the current page meet strict criteria for classifying as a talk page. See `talk` for
     * approximate criteria.
     */
    definitelyTalk: false,

    /**
     * Is the _article_ page (the one with `wgIsArticle` being true) of the current page a talk page
     * eligible for CD. It can be `true` on edit, history pages etc. However, the assessments may be
     * different on a history page and on an article page of the same title, since the page can
     * contain elements with special classes that we can access only on the article page.
     */
    articleTalk: false,

    /**
     * Is the current page a diff page.
     *
     * This is not a constant: the diff may be removed from the page (and the URL updated, see
     * `.cleanUpUrlAndDom()`) when it's for the last revision and the page is reloaded using the
     * script. `wgIsArticle` config value is not taken into account: if the "Do not show page
     * content below diffs" MediaWiki setting is on, `wgIsArticle` is false.
     */
    diff: false,

    /**
     * Is the current page a watchlist or recent changes page.
     */
    watchlist: false,

    /**
     * Is the current page a contributions page.
     */
    contributions: false,

    /**
     * Is the current page a history page.
     */
    history: false,
  };

  /**
   * Check if the current page is of a specific type.
   *
   * @param {keyof BootController['pageTypes']} type
   * @returns {boolean}
   */
  isPageOfType(type) {
    return this.pageTypes[type];
  }

  /**
   * _For internal use._ Load messages needed to parse and generate timestamps as well as some site
   * data.
   *
   * @returns {Array<Promise|JQuery.Promise>} There should be at least one promise in the array.
   */
  getSiteData() {
    this.siteDataRequests ||= this.loadSiteData();

    return this.siteDataRequests;
  }

  /**
   * Load messages needed to parse and generate timestamps as well as some site data.
   *
   * @returns {JQuery.Promise[]} There should be at least one promise in the array.
   * @private
   */
  loadSiteData() {
    this.initFormats();

    const contentDateTokensMessageNames = this.getUsedDateTokens(cd.g.contentDateFormat)
      .map((pattern) => dateTokenToMessageNames[pattern]);
    const contentLanguageMessageNames = [
      'word-separator', 'comma-separator', 'colon-separator', 'timezone-utc'
    ].concat(...contentDateTokensMessageNames);

    const uiDateTokensMessageNames = this.getUsedDateTokens(cd.g.uiDateFormat)
      .map((pattern) => dateTokenToMessageNames[pattern]);
    const userLanguageMessageNames = [
      'parentheses', 'parentheses-start', 'parentheses-end', 'word-separator', 'comma-separator',
      'colon-separator', 'nextdiff', 'timezone-utc', 'pagetitle',
    ]
      .concat(
        mw.loader.getState('ext.discussionTools.init') ?
          [
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
          ] :
          []
      )
      .concat(
        mw.loader.getState('ext.visualEditor.core') ?
          ['visualeditor-educationpopup-dismiss'] :
          []
      )
      .concat(...uiDateTokensMessageNames);

    const areLanguagesEqual = mw.config.get('wgContentLanguage') === mw.config.get('wgUserLanguage');
    if (areLanguagesEqual) {
      const userLanguageConfigMessages = {};
      Object.keys(cd.config.messages)
        .filter((name) => userLanguageMessageNames.includes(name))
        .forEach((name) => {
          userLanguageConfigMessages[name] = cd.config.messages[name];
        });
      mw.messages.set(userLanguageConfigMessages);
    }

    // We need this object to pass it to the web worker.
    cd.g.contentLanguageMessages = {};

    const setContentLanguageMessages = (/** @type {StringsByKey} */ messages) => {
      Object.keys(messages).forEach((name) => {
        mw.messages.set('(content)' + name, messages[name]);
        cd.g.contentLanguageMessages[name] = messages[name];
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
    const requests = [];
    if (areLanguagesEqual) {
      const messagesToRequest = contentLanguageMessageNames
        .concat(userLanguageMessageNames)
        .filter(unique);
      for (const nextNames of splitIntoBatches(messagesToRequest)) {
        const request = cd.getApi().loadMessagesIfMissing(nextNames).then(() => {
          filterAndSetContentLanguageMessages(mw.messages.get());
        });
        requests.push(request);
      }
    } else {
      const contentLanguageMessagesToRequest = contentLanguageMessageNames
        .filter((name) => !cd.g.contentLanguageMessages[name]);
      for (const nextNames of splitIntoBatches(contentLanguageMessagesToRequest)) {
        const request = cd.getApi().getMessages(nextNames, {
          // cd.g.contentLanguage is not used here for the reasons described in app.js where it is
          // declared.
          amlang: mw.config.get('wgContentLanguage'),
        }).then(setContentLanguageMessages);
        requests.push(request);
      }

      const userLanguageMessagesRequest = cd.getApi()
        .loadMessagesIfMissing(userLanguageMessageNames);
      requests.push(userLanguageMessagesRequest);
    }

    cd.g.specialPageAliases = Object.assign({}, cd.config.specialPageAliases);

    Object.entries(cd.g.specialPageAliases).forEach(([key, value]) => {
      if (typeof value === 'string') {
        cd.g.specialPageAliases[key] = [value];
      }
    });

    cd.g.contentTimezone = cd.config.timezone;

    const specialPages = ['Contributions', 'Diff', 'PermanentLink'];
    if (specialPages.some((page) => !cd.g.specialPageAliases[page]?.length) || !cd.g.contentTimezone) {
      const request = cd.getApi().get({
        action: 'query',
        meta: 'siteinfo',
        siprop: ['specialpagealiases', 'general'],
      }).then((resp) => {
        resp.query.specialpagealiases
          .filter((page) => specialPages.includes(page.realname))
          .forEach((page) => {
            cd.g.specialPageAliases[page.realname] = page.aliases
              .slice(0, page.aliases.indexOf(page.realname) + 1);
          });
        cd.g.contentTimezone = resp.query.general.timezone;
      });
      requests.push(request);
    }

    return requests;
  }

  /**
   * Get codes of date components for the function that parses timestamps in the local date format
   * based on the result of matching the regexp set by `setTimestampRegexps()`.
   *
   * @param {string} format
   * @returns {string[]}
   * @private
   * @author Bartosz Dziewoński <matma.rex@gmail.com>
   * @author Jack who built the house
   * @license MIT
   */
  getMatchingGroups(format) {
    const matchingGroups = [];
    for (let p = 0; p < format.length; p++) {
      let code = format[p];
      if ((code === 'x' && p < format.length - 1) || (code === 'xk' && p < format.length - 1)) {
        code += format[++p];
      }

      switch (code) {
        case 'xx':
          break;
        case 'xg':
        case 'd':
        case 'j':
        case 'D':
        case 'l':
        case 'F':
        case 'M':
        case 'n':
        case 'Y':
        case 'xkY':
        case 'G':
        case 'H':
        case 'i':
          matchingGroups.push(code);
          break;
        case '\\':
          // Backslash escaping
          if (p < format.length - 1) {
            ++p;
          }
          break;
        case '"':
          // Quoted literal
          if (p < format.length - 1) {
            const endQuote = format.indexOf('"', p + 1)
            if (endQuote !== -1) {
              p = endQuote;
            }
          }
          break;
        default:
          break;
      }
    }

    return matchingGroups;
  }

  /**
   * Get a regexp that matches timestamps (without timezone at the end) generated using the given
   * date format.
   *
   * This only supports format characters that are used by the default date format in any of
   * MediaWiki's languages, namely: D, d, F, G, H, i, j, l, M, n, Y, xg, xkY (and escape
   * characters), and only dates when MediaWiki existed, let's say 2000 onwards (Thai dates before
   * 1941 are complicated).
   *
   * @param {'content'|'user'} language
   * @returns {string} Pattern to be a part of a regular expression.
   * @private
   * @author Bartosz Dziewoński <matma.rex@gmail.com>
   * @author Jack who built the house
   * @license MIT
   */
  getTimestampMainPartPattern(language) {
    const isContentLanguage = language === 'content';
    const format = isContentLanguage ? cd.g.contentDateFormat : cd.g.uiDateFormat;
    const digits = isContentLanguage ? cd.g.contentDigits : cd.g.uiDigits;
    const digitsPattern = digits ? `[${digits}]` : '\\d';

    const regexpGroup = (regexp) => '(' + regexp + ')';
    const regexpAlternateGroup = (arr) => '(' + arr.map(mw.util.escapeRegExp).join('|') + ')';

    let string = '';

    for (let p = 0; p < format.length; p++) {
      /** @type {string|false} */
      let num = false;
      let code = format[p];
      if ((code === 'x' && p < format.length - 1) || (code === 'xk' && p < format.length - 1)) {
        code += format[++p];
      }

      switch (code) {
        case 'xx':
          string += 'x';
          break;
        case 'xg':
        case 'D':
        case 'l':
        case 'F':
        case 'M': {
          const messages = isContentLanguage ?
            getContentLanguageMessages(dateTokenToMessageNames[code]) :
            dateTokenToMessageNames[code].map((token) => mw.msg(token));
          string += regexpAlternateGroup(messages);
          break;
        }
        case 'd':
        case 'H':
        case 'i':
          num = '2';
          break;
        case 'j':
        case 'n':
        case 'G':
          num = '1,2';
          break;
        case 'Y':
        case 'xkY':
          num = '4';
          break;
        case '\\':
          // Backslash escaping
          if (p < format.length - 1) {
            string += format[++p];
          } else {
            string += '\\';
          }
          break;
        case '"':
          // Quoted literal
          if (p < format.length - 1) {
            const endQuote = format.indexOf('"', p + 1)
            if (endQuote === -1) {
              // No terminating quote, assume literal "
              string += '"';
            } else {
              string += format.substr(p + 1, endQuote - p - 1);
              p = endQuote;
            }
          } else {
            // Quote at end of string, assume literal "
            string += '"';
          }
          break;
        default:
          string += mw.util.escapeRegExp(format[p]);
      }
      if (num !== false) {
        string += regexpGroup(digitsPattern + '{' + num + '}');
      }
    }

    return string;
  }

  /**
   * Set the global variables related to date format.
   *
   * @private
   */
  initFormats() {
    const getFallbackLanguage = (/** @type {string} */ lang) =>
      (languageFallbacks[lang] || ['en']).find(
        (/** @type {string} */ fallback) => dateFormats[fallback]
      );
    const languageOrFallback = (/** @type {string} */ lang) =>
      dateFormats[lang] ? lang : getFallbackLanguage(lang);

    const contentLanguage = languageOrFallback(mw.config.get('wgContentLanguage'));
    const userLanguage = languageOrFallback(mw.config.get('wgUserLanguage'));

    cd.g.contentDateFormat = dateFormats[contentLanguage];
    cd.g.uiDateFormat = dateFormats[userLanguage];
    cd.g.contentDigits = mw.config.get('wgTranslateNumerals') ? digitsData[contentLanguage] : null;
    cd.g.uiDigits = mw.config.get('wgTranslateNumerals') ? digitsData[userLanguage] : null;
  }

  /**
   * Get date tokens used in a format (to load only needed tokens).
   *
   * @param {string} format
   * @returns {string[]}
   * @private
   * @author Bartosz Dziewoński <matma.rex@gmail.com>
   * @license MIT
   */
  getUsedDateTokens(format) {
    const tokens = [];

    for (let p = 0; p < format.length; p++) {
      let code = format[p];
      if ((code === 'x' && p < format.length - 1) || (code === 'xk' && p < format.length - 1)) {
        code += format[++p];
      }

      if (['xg', 'D', 'l', 'F', 'M'].includes(code)) {
        tokens.push(code);
      } else if (code === '\\' && p < format.length - 1) {
        ++p;
      }
    }

    return tokens;
  }

  /**
   * _For internal use._ Assign some important skin-specific values to the properties of the global
   * object.
   */
  memorizeCssValues() {
    cd.g.contentLineHeight = parseFloat(this.$content.css('line-height'));
    cd.g.contentFontSize = parseFloat(this.$content.css('font-size'));
    cd.g.defaultFontSize = parseFloat($(document.documentElement).css('font-size'));

    // For Timeless, Vector-2022 skins
    cd.g.bodyScrollPaddingTop = parseFloat($('html, body').css('scroll-padding-top')) || 0;
    if (cd.g.skin === 'timeless') {
      cd.g.bodyScrollPaddingTop -= 5;
    }
    if (cd.g.skin === 'vector-2022') {
      // When jumping to the parent comment that is opening a section, the active section shown in
      // the TOC is wrong. Probably some mechanisms in the scripts or the browser are out of sync.
      cd.g.bodyScrollPaddingTop -= 1;
    }
  }

  /**
   * _For internal use._ Set CSS for talk pages: set CSS variables, add static CSS.
   */
  addTalkPageCss() {
    const contentBackgroundColor = $('#content').css('background-color') || 'rgba(0, 0, 0, 0)';
    const sidebarColor = skin$({
      timeless: '#mw-content-container',
      'vector-2022': '.mw-page-container',
      default: 'body',
    }).css('background-color');
    const metadataFontSize = parseFloat((cd.g.contentFontSize / cd.g.defaultFontSize).toFixed(7));
    const contentStartMargin = this.getContentColumnOffsets().startMargin;
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
  --cd-content-start-margin: ${contentStartMargin}px;
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

    require('./global.less');

    require('./Comment.less');
    require('./CommentForm.less');
    require('./Section.less');
    require('./Comment.layers.less');
    require('./navPanel.less');
    require('./pageNav.less');
    require('./skins.less');
    require('./talkPage.less');
    require('./toc.less');
  }

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

      const left = /** @type {JQuery.Coordinates} */ (this.$contentColumn.offset()).left;
      const width = /** @type {number} */ (this.$contentColumn.outerWidth());
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
  }

  /**
   * _For internal use._ Set a number of {@link convenientDiscussions global object} properties.
   */
  initGlobals() {
    if (cd.page) return;

    const script = mw.loader.moduleRegistry['mediawiki.Title'].script;
    cd.g.phpCharToUpper =
      (
        script &&
        typeof script === 'object' &&
        'files' in script &&
        script.files['phpCharToUpper.json']
      ) ||
      {};

    cd.page = pageRegistry.getCurrent();

    /**
     * Current user's object.
     *
     * @see module:userRegistry.getCurrent
     * @name user
     * @type {import('./userRegistry').User}
     * @memberof convenientDiscussions
     */
    cd.user = userRegistry.getCurrent();

    // Is there {{gender:}} with at least two pipes in the selection of affected strings?
    cd.g.genderAffectsUserString = /\{\{ *gender *:[^}]+?\|[^} ]+?\|/i.test(
      Object.entries(mw.messages.get())
        .filter(([key]) => key.startsWith('convenient-discussions'))
        .map(([, value]) => value)
        .join()
    );

    if (cd.config.tagName && cd.user.isRegistered()) {
      cd.g.summaryPostfix = '';
      cd.g.summaryLengthLimit = mw.config.get('wgCommentCodePointLimit');
    } else {
      cd.g.summaryPostfix = ` ([[${cd.config.scriptPageWikilink}|${cd.s('script-name-short')}]])`;
      cd.g.summaryLengthLimit = (
        mw.config.get('wgCommentCodePointLimit') -
        cd.g.summaryPostfix.length
      );
    }

    // We don't need it now. Keep it for now for compatibility with s-ru config
    cd.g.clientProfile = $.client.profile();

    cd.g.cmdModifier = $.client.profile().platform === 'mac' ? 'Cmd' : 'Ctrl';

    cd.g.isIPv6Address = mw.util.isIPv6Address;

    cd.g.apiErrorFormatHtml = {
      errorformat: 'html',
      errorlang: cd.g.userLanguage,
      errorsuselocal: true,
    };

    cd.settings = settings;

    const controller = require('./talkPageController').default;
    const commentRegistry = require('./commentRegistry').default;
    const sectionRegistry = require('./sectionRegistry').default;
    const commentFormRegistry = require('./commentFormRegistry').default;

    /**
     * Collection of all comment forms on the page in the order of their creation.
     *
     * @name commentForms
     * @type {import('./CommentForm').default[]}
     * @see module:commentFormRegistry.getAll
     * @memberof convenientDiscussions
     */
    cd.commentForms = commentFormRegistry.getAll();

    cd.tests.controller = controller,
    cd.tests.processPageInBackground = processPage;
    cd.tests.showSettingsDialog = settings.showDialog.bind(settings);
    cd.tests.editSubscriptions = controller.showEditSubscriptionsDialog.bind(controller);
    cd.tests.visits = visits;


    /* Some static methods for external use */

    /**
     * @see module:commentRegistry.getById
     * @function getCommentById
     * @memberof convenientDiscussions.api
     */
    cd.api.getCommentById = commentRegistry.getById.bind(commentRegistry);

    /**
     * @see module:commentRegistry.getByDtId
     * @function getCommentByDtId
     * @memberof convenientDiscussions.api
     */
    cd.api.getCommentByDtId = commentRegistry.getByDtId.bind(commentRegistry);

    /**
     * @see module:sectionRegistry.getById
     * @function getSectionById
     * @memberof convenientDiscussions.api
     */
    cd.api.getSectionById = sectionRegistry.getById.bind(sectionRegistry);

    /**
     * @see module:sectionRegistry.getByHeadline
     * @function getSectionsByHeadline
     * @memberof convenientDiscussions.api
     */
    cd.api.getSectionsByHeadline = sectionRegistry.getByHeadline.bind(sectionRegistry);

    /**
     * @see module:commentFormRegistry.getLastActive
     * @function getLastActiveCommentForm
     * @memberof convenientDiscussions.api
     */
    cd.api.getLastActiveCommentForm = commentFormRegistry.getLastActive.bind(commentFormRegistry);

    /**
     * @see module:commentFormRegistry.getLastActiveAltered
     * @function getLastActiveAlteredCommentForm
     * @memberof convenientDiscussions.api
     */
    cd.api.getLastActiveAlteredCommentForm = commentFormRegistry.getLastActiveAltered
      .bind(commentFormRegistry);

    /**
     * @see module:controller.reload
     * @function reloadPage
     * @memberof convenientDiscussions.api
     */
    cd.api.reloadPage = controller.reload.bind(controller);

    /**
     * @see module:controller.getRootElement
     * @function getRootElement
     * @memberof convenientDiscussions.api
     */
    cd.api.getRootElement = controller.getRootElement.bind(controller);
  }

  /**
   * _For internal use._ Set the {@link convenientDiscussions} properties related to timestamp
   * parsing.
   *
   * @param {string} language
   */
  initTimestampParsingTools(language) {
    if (language === 'content') {
      const mainPartPattern = this.getTimestampMainPartPattern('content');
      const utcPattern = mw.util.escapeRegExp(mw.message('(content)timezone-utc').parse());

      // Do we need non-Arabic digits here?
      const timezonePattern = `\\((?:${utcPattern}|[A-Z]{1,5}|[+-]\\d{0,4})\\)`;

      cd.g.contentTimestampRegexp = new RegExp(mainPartPattern + ' +' + timezonePattern);
      cd.g.parseTimestampContentRegexp = new RegExp(
        // \b only captures Latin, so we also need `' '`.
        `^([^]*(?:^|[^=])(?:\\b| ))(${cd.g.contentTimestampRegexp.source})(?!["»])`
      );
      cd.g.contentTimestampNoTzRegexp = new RegExp(mainPartPattern);
      cd.g.contentTimestampMatchingGroups = this.getMatchingGroups(cd.g.contentDateFormat);
      cd.g.timezoneRegexp = new RegExp(timezonePattern, 'g');
    } else {
      cd.g.uiTimestampRegexp = new RegExp(this.getTimestampMainPartPattern('user'));
      cd.g.parseTimestampUiRegexp = new RegExp(`^([^]*)(${cd.g.uiTimestampRegexp.source})`);
      cd.g.uiTimestampMatchingGroups = this.getMatchingGroups(cd.g.uiDateFormat);
    }

    const timezoneParts = mw.user.options.get('timecorrection')?.split('|');

    cd.g.uiTimezone = ((timezoneParts && timezoneParts[2]) || Number(timezoneParts[1])) ?? null;
    if (cd.g.uiTimezone === 0) {
      cd.g.uiTimezone = 'UTC';
    }

    try {
      cd.g.areUiAndLocalTimezoneSame = (
        cd.g.uiTimezone === Intl.DateTimeFormat().resolvedOptions().timeZone
      );
    } catch {
      // Empty
    }

    if (language === 'content') {
      cd.g.areTimestampsDefault = !(
        (settings.get('useUiTime') && cd.g.contentTimezone !== cd.g.uiTimezone) ||
        settings.get('timestampFormat') !== 'default' ||
        mw.config.get('wgContentLanguage') !== cd.g.userLanguage ||
        settings.get('hideTimezone')
      );
    }
  }

  /**
   * _For internal use._ Assign various global objects' ({@link convenientDiscussions},
   * {@link JQuery.fn jQuery.fn}) properties and methods that are needed for processing a
   * talk page. Executed on the first run.
   */
  async initTalkPage() {
    // In most cases the site data is already loaded after being requested in
    // BootController#initOnTalkPage().
    await Promise.all(this.getSiteData());

    // This could have been executed from addCommentLinks.prepare() already.
    this.initGlobals();
    await settings.init();

    this.initTimestampParsingTools('content');
    this.initPatterns();
    this.initPrototypes();
    if (settings.get('useBackgroundHighlighting')) {
      require('./Comment.layers.optionalBackgroundHighlighting.less');
    }
    $.fn.extend(jqueryExtensions);
    initDayjs();
  }

  /**
   * _For internal use._ Initialize the script: assign properties required by the controller - those
   * which are not known from the beginning - and run the boot process (on talk page or comment
   * links page).
   */
  bootScript() {
    this.$content = $('#mw-content-text');

    if (cd.g.isMobile) {
      $(document.body).addClass('cd-mobile');
    }

    // Not constants: go() may run a second time, see app~maybeAddFooterSwitcher().
    const isEnabledInQuery = getQueryParamBooleanValue('cdtalkpage') === true;
    const isDisabledInQuery = getQueryParamBooleanValue('cdtalkpage') === false;

    this.pageTypes.definitelyTalk = Boolean(
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

    this.pageTypes.articleTalk = (
      (!mw.config.get('wgIsRedirect') || !this.isCurrentRevision()) &&
      !this.$content.find('.cd-notTalkPage').length &&
      (isProbablyTalkPage(cd.g.pageName, cd.g.namespaceNumber) || this.pageTypes.definitelyTalk) &&

      // Undocumented setting
      !window.cdOnlyRunByFooterLink
    );

    this.pageTypes.diff = /[?&]diff=[^&]/.test(location.search);

    this.pageTypes.talk = Boolean(
      mw.config.get('wgIsArticle') &&
      !isDisabledInQuery &&
      (isEnabledInQuery || this.pageTypes.articleTalk)
    );

    this.pageTypes.watchlist = this.isWatchlistPage();
    this.pageTypes.contributions = this.isContributionsPage();
    this.pageTypes.history = this.isHistoryPage();

    this.initOnTalkPage();
    this.initOnCommentLinksPage();
  }

  /**
   * Change the evaluation of whether the current page is a talk page.
   *
   * @param {boolean} value
   */
  setPageTypeTalk(value) {
    this.pageTypes.talk = Boolean(value);
  }

  /**
   * Load the data required for the script to run on a talk page and execute the
   * {@link BootProcess boot process}.
   *
   * @private
   */
  initOnTalkPage() {
    if (!this.pageTypes.talk) return;

    debug.stopTimer('start');
    debug.startTimer('load data');

    let siteDataRequests = [];

    // Make some requests in advance if the API module is ready in order not to make 2 requests
    // sequentially. We don't make a `userinfo` request, because if there is more than one tab in
    // the background, this request is made and the execution stops at mw.loader.using, which
    // results in overriding the renewed visits setting of one tab by another tab (the visits are
    // loaded by one tab, then another tab, then written by one tab, then by another tab).
    if (mw.loader.getState('mediawiki.api') === 'ready') {
      siteDataRequests = this.getSiteData();

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
      this.bootProcess = this.createBootProcess(
        siteDataRequests.every((request) => request.state() === 'resolved')
          ? { scrollY: window.scrollY }
          : {}
      );
    } else {
      modulesRequest = mw.loader.using(modules);
    }

    this.showLoadingOverlay();
    Promise.all([modulesRequest, ...siteDataRequests]).then(
      () => this.tryBoot(false),
      (error) => {
        mw.notify(cd.s('error-loaddata'), { type: 'error' });
        console.error(error);
        this.hideLoadingOverlay();
      }
    );

    sleep(15000).then(() => {
      if (this.isBooting()) {
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
      this.memorizeCssValues();
      this.addTalkPageCss();
  }

  /**
   * Create a boot process.
   *
   * @param {import('./BootProcess').PassedData} [passedData={}]
   * @returns {import('./BootProcess').default}
   */
  createBootProcess(passedData = {}) {
    return new (require('./BootProcess').default)(passedData);
  }

  /**
   * Set a boot process as the current boot process.
   *
   * @param {import('./BootProcess').default} bootProcess
   */
  setBootProcess(bootProcess) {
    this.bootProcess = bootProcess;
  }

  /**
   * Get the current (or last available) boot process.
   *
   * For simpler type checking, assume it's always set (we don't use it when it's not).
   *
   * @returns {import('./BootProcess').default}
   */
  getBootProcess() {
    return this.bootProcess;
  }

  /**
   * Run the {@link BootProcess current boot process} and catch errors.
   *
   * @param {boolean} isReload Is the page reloaded, not booted the first time.
   */
  async tryBoot(isReload) {
    this.booting = true;

    // We could say "let it crash", but unforeseen errors in BootProcess#execute() are just too
    // likely to go without a safeguard.
    try {
      await this.bootProcess.execute(isReload);
      if (isReload) {
        mw.hook('wikipage.content').fire(this.$content);
      }
    } catch (error) {
      mw.notify(cd.s('error-processpage'), { type: 'error' });
      console.error(error);
      bootController.hideLoadingOverlay();
    }

    this.booting = false;
  }

  /**
   * Is the page loading (the loading overlay is on).
   *
   * @returns {boolean}
   */
  isBooting() {
    return this.booting;
  }

  /**
   * Remove fragment and revision parameters from the URL; remove DOM elements related to the diff.
   */
  cleanUpUrlAndDom() {
    if (this.bootProcess.passedData.isRevisionSliderRunning) return;

    const { searchParams } = new URL(location.href);
    this.cleanUpDom(searchParams);
    this.cleanUpUrl(searchParams);
  }

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
  }

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

      this.pageTypes.diff = false;
    } else if (!this.bootProcess.passedData.pushState) {
      // Don't reset the fragment if it will be set in the boot process from a comment ID or a
      // section ID, to avoid creating an extra history entry.
      methodName = 'replaceState';
    }

    if (methodName) {
      history[methodName](history.state, '', cd.page.getUrl(newQuery));
    }
  }

  /**
   * Show the loading overlay (a logo in the corner of the page).
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
  }

  /**
   * Hide the loading overlay.
   */
  hideLoadingOverlay() {
    if (!this.$loadingPopup || window.cdShowLoadingOverlay === false) return;

    this.$loadingPopup.hide();
  }

  /**
   * Is there any kind of a page overlay present, like the OOUI modal overlay or CD loading overlay.
   * This runs very frequently.
   *
   * @returns {boolean}
   */
  isPageOverlayOn() {
    return document.body.classList.contains('oo-ui-windowManager-modal-active') || this.booting;
  }

  /**
   * Load the data required for the script to process the page as a log page and
   * {@link module:addCommentLinks process it}.
   *
   * @private
   */
  initOnCommentLinksPage() {
    if (
      !this.isPageOfType('watchlist') &&
      !this.isPageOfType('contributions') &&
      !this.isPageOfType('history') &&
      !(this.isPageOfType('diff') && this.isPageOfType('articleTalk')) &&

      // Instant Diffs script can be called on talk pages as well
      !this.isPageOfType('talk')
    ) {
      return;
    }

    // Make some requests in advance if the API module is ready in order not to make 2 requests
    // sequentially.
    if (mw.loader.getState('mediawiki.api') === 'ready') {
      this.getSiteData();

      // Loading user info on diff pages could lead to problems with saving visits when many pages
      // are opened, but not yet focused, simultaneously.
      if (!this.isPageOfType('talk')) {
        getUserInfo(true).catch((error) => {
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
        addCommentLinks();

        // See the comment above: "Additions of CSS...".
        require('./global.less');

        require('./logPages.less');
      },
      (error) => {
        mw.notify(cd.s('error-loaddata'), { type: 'error' });
        console.error(error);
      }
    );
  }

  /**
   * Is the displayed revision the current (last known) revision of the page.
   *
   * @returns {boolean}
   */
  isCurrentRevision() {
    return mw.config.get('wgRevisionId') >= mw.config.get('wgCurRevisionId');
  }

  /**
   * Check whether the current page is a watchlist or recent changes page.
   *
   * @returns {boolean}
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
   */
  isContributionsPage() {
    return mw.config.get('wgCanonicalSpecialPageName') === 'Contributions';
  }

  /**
   * Check whether the current page is a history page.
   *
   * @returns {boolean}
   */
  isHistoryPage() {
    return cd.g.pageAction === 'history' && isProbablyTalkPage(cd.g.pageName, cd.g.namespaceNumber);
  }

  /**
   * Generate regexps, patterns (strings to be parts of regexps), selectors from config values.
   *
   * @private
   */
  initPatterns() {
    const signatureEndingRegexp = cd.config.signatureEndingRegexp;
    cd.g.signatureEndingRegexp = signatureEndingRegexp ?
      new RegExp(
        signatureEndingRegexp.source + (signatureEndingRegexp.source.slice(-1) === '$' ? '' : '$'),
        signatureEndingRegexp.flags
      ) :
      null;

    const nss = mw.config.get('wgFormattedNamespaces');
    const nsIds = mw.config.get('wgNamespaceIds');

    const anySpace = (s) => s.replace(/[ _]/g, '[ _]+').replace(/:/g, '[ _]*:[ _]*');
    const joinNsNames = (...ids) => (
      Object.keys(nsIds)
        .filter((key) => ids.includes(nsIds[key]))

        // Sometimes wgNamespaceIds has a string that doesn't transform into one of the keys of
        // wgFormattedNamespaces when converting the first letter to uppercase, like in Azerbaijani
        // Wikipedia (compare Object.keys(mw.config.get('wgNamespaceIds'))[4] = 'i̇stifadəçi' with
        // mw.config.get('wgFormattedNamespaces')[2] = 'İstifadəçi'). We simply add the
        // wgFormattedNamespaces name separately.
        .concat(ids.map((id) => nss[id]))

        .map(anySpace)
        .join('|')
    );

    const userNssAliasesPattern = joinNsNames(2, 3);
    cd.g.userNamespacesRegexp = new RegExp(`(?:^|:)(?:${userNssAliasesPattern}):(.+)`, 'i');

    const userNsAliasesPattern = joinNsNames(2);
    cd.g.userLinkRegexp = new RegExp(`^:?(?:${userNsAliasesPattern}):([^/]+)$`, 'i');
    cd.g.userSubpageLinkRegexp = new RegExp(`^:?(?:${userNsAliasesPattern}):.+?/`, 'i');

    const userTalkNsAliasesPattern = joinNsNames(3);
    cd.g.userTalkLinkRegexp = new RegExp(`^:?(?:${userTalkNsAliasesPattern}):([^/]+)$`, 'i');
    cd.g.userTalkSubpageLinkRegexp = new RegExp(`^:?(?:${userTalkNsAliasesPattern}):.+?/`, 'i');

    cd.g.contribsPages = cd.g.specialPageAliases.Contributions.map((alias) => `${nss[-1]}:${alias}`);

    const contribsPagesLinkPattern = cd.g.contribsPages.join('|');
    cd.g.contribsPageLinkRegexp = new RegExp(`^(?:${contribsPagesLinkPattern})/`);

    const contribsPagesPattern = anySpace(contribsPagesLinkPattern);
    cd.g.captureUserNamePattern = (
      `\\[\\[[ _]*:?(?:\\w*:){0,2}(?:(?:${userNssAliasesPattern})[ _]*:[ _]*|` +
      `(?:Special[ _]*:[ _]*Contributions|${contribsPagesPattern})\\/[ _]*)([^|\\]/]+)(/)?`
    );

    cd.g.isThumbRegexp = new RegExp(
      ['thumb', 'thumbnail']
        .concat(cd.config.thumbAliases)
        .map((alias) => `\\| *${alias} *[|\\]]`)
        .join('|')
    );

    const unsignedTemplatesPattern = cd.config.unsignedTemplates
      .map(generatePageNamePattern)
      .join('|');
    cd.g.unsignedTemplatesPattern = unsignedTemplatesPattern ?
      `(\\{\\{ *(?:${unsignedTemplatesPattern}) *\\| *([^}|]+?) *(?:\\| *([^}]+?) *)?\\}\\})`
      : null;

    const clearTemplatesPattern = cd.config.clearTemplates.map(generatePageNamePattern).join('|');
    const reflistTalkTemplatesPattern = cd.config.reflistTalkTemplates
      .map(generatePageNamePattern)
      .join('|');

    cd.g.keepInSectionEnding = [
      ...cd.config.keepInSectionEnding,
      clearTemplatesPattern
        ? new RegExp(`\\n+\\{\\{ *(?:${clearTemplatesPattern}) *\\}\\}\\s*$`)
        : undefined,
      reflistTalkTemplatesPattern
        ? new RegExp(`\\n+\\{\\{ *(?:${reflistTalkTemplatesPattern}) *\\}\\}.*\\s*$`)
        : undefined,
    ].filter(defined);

    cd.g.userSignature = settings.get('signaturePrefix') + cd.g.signCode;

    const signatureContent = mw.user.options.get('nickname');
    const authorInSignatureMatch = signatureContent.match(
      new RegExp(cd.g.captureUserNamePattern, 'i')
    );
    /*
      Extract signature contents before the user name - in order to cut it out from comment
      endings when editing.

      Use the signature prefix only if it is other than `' '` (the default value).
      * If it is `' '`, the prefix in real life may as well be `\n` or `--` if the user created some
        specific comment using the native editor instead of CD. So we would want to remove the
        signature from such comments correctly. The space would be included in the signature anyway
        using `cd.config.signaturePrefixRegexp`.
      * If it is other than `' '`, it is unpredictable, so it is safer to include it in the pattern.
    */
    cd.g.userSignaturePrefixRegexp = authorInSignatureMatch ?
      new RegExp(
        (
          settings.get('signaturePrefix') === ' ' ?
            '' :
            mw.util.escapeRegExp(settings.get('signaturePrefix'))
        ) +
        mw.util.escapeRegExp(signatureContent.slice(0, authorInSignatureMatch.index)) +
        '$'
      ) :
      null;

    const pieJoined = cd.g.popularInlineElements.join('|');
    cd.g.piePattern = `(?:${pieJoined})`;

    const pnieJoined = cd.g.popularNotInlineElements.join('|');
    cd.g.pniePattern = `(?:${pnieJoined})`;

    cd.g.articlePathRegexp = new RegExp(
      '^' +
      mw.util.escapeRegExp(mw.config.get('wgArticlePath')).replace('\\$1', '(.*)')
    );
    cd.g.startsWithScriptTitleRegexp = new RegExp(
      '^' +
      mw.util.escapeRegExp(mw.config.get('wgScript') + '?title=')
    );
    const editActionpath = mw.config.get('wgActionPaths').edit;
    if (editActionpath) {
      cd.g.startsWithEditActionPathRegexp = new RegExp(
        '^' +
        mw.util.escapeRegExp(editActionpath).replace('\\$1', '(.*)')
      );
    }

    // Template names are not case-sensitive here for code simplicity.
    const quoteTemplateToPattern = (/** @type {string} */ tpl) =>
      '\\{\\{ *' + anySpace(mw.util.escapeRegExp(tpl));
    const quoteBeginningsPattern = ['<blockquote', '<q']
      .concat(cd.config.pairQuoteTemplates?.[0].map(quoteTemplateToPattern) || [])
      .join('|');
    const quoteEndingsPattern = ['</blockquote>', '</q>']
      .concat(cd.config.pairQuoteTemplates?.[1].map(quoteTemplateToPattern) || [])
      .join('|');
    cd.g.quoteRegexp = new RegExp(
      `(${quoteBeginningsPattern})([^]*?)(${quoteEndingsPattern})`,
      'ig'
    );

    cd.g.noSignatureClasses.push(...cd.config.noSignatureClasses);
    cd.g.noHighlightClasses.push(...cd.config.noHighlightClasses);

    const fileNssPattern = joinNsNames(6);
    cd.g.filePrefixPattern = `(?:${fileNssPattern}):`;

    const colonNssPattern = joinNsNames(6, 14);
    cd.g.colonNamespacesPrefixRegexp = new RegExp(`^:(?:${colonNssPattern}):`, 'i');

    cd.g.badCommentBeginnings = [
      ...cd.g.badCommentBeginnings,
      new RegExp(`^\\[\\[${cd.g.filePrefixPattern}.+\\n+(?=[*:#])`, 'i'),
      ...cd.config.badCommentBeginnings,
      clearTemplatesPattern ?
        new RegExp(`^\\{\\{ *(?:${clearTemplatesPattern}) *\\}\\} *\\n+`, 'i') :
        undefined,
    ].filter(defined);

    cd.g.pipeTrickRegexp = /(\[\[:?(?:[^|[\]<>\n:]+:)?([^|[\]<>\n]+)\|)(\]\])/g;

    cd.g.isProbablyWmfSulWiki = (
      // Isn't true on diff, editing, history, and special pages, see
      // https://github.com/wikimedia/mediawiki-extensions-CentralNotice/blob/6100a9e9ef290fffe1edd0ccdb6f044440d41511/includes/CentralNoticeHooks.php#L398
      $('link[rel="dns-prefetch"]').attr('href') === '//meta.wikimedia.org' ||

      // Sites like wikitech.wikimedia.org, which is not a SUL wiki, will be included as well
      ['mediawiki.org', 'wikibooks.org', 'wikidata.org', 'wikifunctions.org', 'wikimedia.org', 'wikinews.org', 'wikipedia.org', 'wikiquote.org', 'wikisource.org', 'wikiversity.org', 'wikivoyage.org', 'wiktionary.org'].includes(
        mw.config.get('wgServerName').split('.').slice(-2).join('.')
      )
    );
  }

  /**
   * Initialize prototypes of elements and OOUI widgets.
   *
   * @private
   */
  initPrototypes() {
    require('./Comment').default.initPrototypes();
    require('./Section').default.initPrototypes();
    require('./Thread').default.initPrototypes();
  }

  /**
   * Add a condition preventing page unload.
   *
   * @param {string} name
   * @param {() => boolean} condition
   */
  addPreventUnloadCondition(name, condition) {
    this.beforeUnloadHandlers[name] = (/** @type {JQuery.Event} */ event) => {
      if (!condition()) return;

      event.preventDefault();
      // @ts-ignore
      event.returnValue = '1';

      return '';
    };
    $(window).on('beforeunload', this.beforeUnloadHandlers[name]);
  }

  /**
   * Remove a condition preventing page unload.
   *
   * @param {string} name
   */
  removePreventUnloadCondition(name) {
    if (!this.beforeUnloadHandlers[name]) return;

    $(window).off('beforeunload', (this.beforeUnloadHandlers[name]));
    delete this.beforeUnloadHandlers[name];
  }
}

// Export a singleton instance
const bootController = new BootController();
export default bootController;
