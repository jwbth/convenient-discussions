/**
 * Singleton for initializing the script, both on talk pages and on log pages such as the watchlist.
 * Includes setting constants as properties of the {@link convenientDiscussions.g} object, adding
 * CSS, loading site data, such as MediaWiki messages and configuration, and setting date formats
 * based on it.
 *
 * @module init
 */

import dateFormatsData from '../../data/dateFormats.json';
import digitsData from '../../data/digits.json';
import languageFallbacksData from '../../data/languageFallbacks.json';

import Comment from './Comment';
import CommentFormStatic from './CommentFormStatic';
import CommentStatic from './CommentStatic';
import Section from './Section';
import SectionStatic from './SectionStatic';
import Thread from './Thread';
import cd from './cd';
import controller from './controller';
import jqueryExtensions from './jqueryExtensions';
import pageRegistry from './pageRegistry';
import settings from './settings';
import { processPage } from './updateChecker';
import userRegistry from './userRegistry';
import { splitIntoBatches } from './utils-api';
import { generatePageNamePattern, getContentLanguageMessages, unique } from './utils-general';
import { dateTokenToMessageNames, initDayjs } from './utils-timestamp';
import { skin$, transparentize } from './utils-window';

let defaultFontSize;

/**
 * Set the global variables related to date format.
 *
 * @private
 */
function initFormats() {
  const getFallbackLanguage = (lang) => (
    (languageFallbacksData[lang] || ['en']).find((fallback) => dateFormatsData[fallback])
  );
  const languageOrFallback = (lang) => dateFormatsData[lang] ? lang : getFallbackLanguage(lang);

  const contentLanguage = languageOrFallback(mw.config.get('wgContentLanguage'));
  const userLanguage = languageOrFallback(mw.config.get('wgUserLanguage'));

  /**
   * Format of date in content language, as used by MediaWiki.
   *
   * @name contentDateFormat
   * @type {string}
   * @memberof convenientDiscussions.g
   */
  cd.g.contentDateFormat = dateFormatsData[contentLanguage];

  /**
   * Format of date in user (interface) language, as used by MediaWiki.
   *
   * @name uiDateFormat
   * @type {string}
   * @memberof convenientDiscussions.g
   */
  cd.g.uiDateFormat = dateFormatsData[userLanguage];

  /**
   * Regular expression matching a single digit in content language, e.g. `[0-9]`.
   *
   * @name contentDigits
   * @type {string}
   * @memberof convenientDiscussions.g
   */
  cd.g.contentDigits = mw.config.get('wgTranslateNumerals') ? digitsData[contentLanguage] : null;

  /**
   * Regular expression matching a single digit in user (interface) language, e.g. `[0-9]`.
   *
   * @name uiDigits
   * @type {string}
   * @memberof convenientDiscussions.g
   */
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
function getUsedDateTokens(format) {
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
 * Load messages needed to parse and generate timestamps as well as some site data.
 *
 * @returns {Promise[]} There should be at least one promise in the array.
 * @private
 */
function loadSiteData() {
  initFormats();

  const contentDateTokensMessageNames = getUsedDateTokens(cd.g.contentDateFormat)
    .map((pattern) => dateTokenToMessageNames[pattern]);
  const contentLanguageMessageNames = [
    'word-separator', 'comma-separator', 'colon-separator', 'timezone-utc'
  ].concat(...contentDateTokensMessageNames);

  const uiDateTokensMessageNames = getUsedDateTokens(cd.g.uiDateFormat)
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

  const setContentLanguageMessages = (messages) => {
    Object.keys(messages).forEach((name) => {
      mw.messages.set('(content)' + name, messages[name]);
      cd.g.contentLanguageMessages[name] = messages[name];
    });
  };

  const filterAndSetContentLanguageMessages = (obj) => {
    const messages = {};
    Object.keys(obj)
      .filter((name) => contentLanguageMessageNames.includes(name))
      .forEach((name) => {
        messages[name] = obj[name];
      });
    setContentLanguageMessages(messages);
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
      const request = controller.getApi().loadMessagesIfMissing(nextNames).then(() => {
        filterAndSetContentLanguageMessages(mw.messages.get());
      });
      requests.push(request);
    }
  } else {
    const contentLanguageMessagesToRequest = contentLanguageMessageNames
      .filter((name) => !cd.g.contentLanguageMessages[name]);
    for (const nextNames of splitIntoBatches(contentLanguageMessagesToRequest)) {
      const request = controller.getApi().getMessages(nextNames, {
        // `cd.g.contentLanguage` is not used here for the reasons described in app.js where it is
        // declared.
        amlang: mw.config.get('wgContentLanguage'),
      }).then(setContentLanguageMessages);
      requests.push(request);
    }

    const userLanguageMessagesRequest = controller.getApi()
      .loadMessagesIfMissing(userLanguageMessageNames);
    requests.push(userLanguageMessagesRequest);
  }

  /**
   * Some special page aliases in the wiki's language.
   *
   * @name SPECIAL_PAGE_ALIASES
   * @type {string[]}
   * @memberof convenientDiscussions.g
   */
  cd.g.specialPageAliases = Object.assign({}, cd.config.specialPageAliases);

  /**
   * Timezone of the wiki.
   *
   * @name contentTimezone
   * @type {?string}
   * @memberof convenientDiscussions.g
   */
  cd.g.contentTimezone = cd.config.timezone;

  const specialPages = ['Contributions', 'Diff', 'PermanentLink'];
  if (specialPages.some((page) => !cd.g.specialPageAliases[page]) || !cd.g.contentTimezone) {
    const request = controller.getApi().get({
      action: 'query',
      meta: 'siteinfo',
      siprop: ['specialpagealiases', 'general'],
    }).then((resp) => {
      resp.query.specialpagealiases
        .filter((alias) => specialPages.includes(alias.realname))
        .forEach((alias) => {
          cd.g.specialPageAliases[alias.realname] = alias.aliases[0];
        });
      cd.g.contentTimezone = resp.query.general.timezone;
    });
    requests.push(request);
  }

  return requests;
}

/**
 * Generate regexps, patterns (strings to be parts of regexps), selectors from config values.
 *
 * @private
 */
function patterns() {
  const signatureEndingRegexp = cd.config.signatureEndingRegexp;
  cd.g.signatureEndingRegexp = signatureEndingRegexp ?
    new RegExp(
      signatureEndingRegexp.source + (signatureEndingRegexp.source.slice(-1) === '$' ? '' : '$'),
      signatureEndingRegexp.flags
    ) :
    null;

  const nss = mw.config.get('wgFormattedNamespaces');
  const nsIds = mw.config.get('wgNamespaceIds');

  /**
   * Contributions page local name.
   *
   * @name contribsPage
   * @type {string}
   * @memberof convenientDiscussions.g
   */
  cd.g.contribsPage = `${nss[-1]}:${cd.g.specialPageAliases.Contributions}`;

  const anySpace = (s) => s.replace(/[ _]/g, '[ _]+').replace(/:/g, '[ _]*:[ _]*');
  const joinNsNames = (...ids) => (
    Object.keys(nsIds)
      .filter((key) => ids.includes(nsIds[key]))

      // Sometimes `wgNamespaceIds` has a string that doesn't transform into one of the keys of
      // `wgFormattedNamespaces` when converting the first letter to uppercase, like in Azerbaijani
      // Wikipedia (compare `Object.keys(mw.config.get('wgNamespaceIds'))[4]` = `'i̇stifadəçi'` with
      // `mw.config.get('wgFormattedNamespaces')[2]` = `'İstifadəçi'`). We simply add the
      // `wgFormattedNamespaces` name separately.
      .concat(ids.map((id) => nss[id]))

      .map(anySpace)
      .join('|')
  );

  const userNssAliasesPattern = joinNsNames(2, 3);
  cd.g.userNamespacesRegexp = new RegExp(`(?:^|:)(?:${userNssAliasesPattern}):(.+)`, 'i');

  const userNsAliasesPattern = joinNsNames(2);
  cd.g.userLinkRegexp = new RegExp(`^:?(?:${userNsAliasesPattern}):([^/]+)$(?:)`, 'i');
  cd.g.userSubpageLinkRegexp = new RegExp(`^:?(?:${userNsAliasesPattern}):.+?/`, 'i');

  const userTalkNsAliasesPattern = joinNsNames(3);
  cd.g.userTalkLinkRegexp = new RegExp(`^:?(?:${userTalkNsAliasesPattern}):([^/]+)$(?:)`, 'i');
  cd.g.userTalkSubpageLinkRegexp = new RegExp(`^:?(?:${userTalkNsAliasesPattern}):.+?/`, 'i');

  cd.g.contribsPageLinkRegexp = new RegExp(`^${cd.g.contribsPage}/`);

  cd.g.isThumbRegexp = new RegExp(
    ['thumb', 'thumbnail']
      .concat(cd.config.thumbAliases)
      .map((alias) => `\\| *${alias} *[|\\]]`)
      .join('|')
  );

  const contribsPagePattern = anySpace(cd.g.contribsPage);
  cd.g.captureUserNamePattern = (
    `\\[\\[[ _]*:?(?:\\w*:){0,2}(?:(?:${userNssAliasesPattern})[ _]*:[ _]*|` +
    `(?:Special[ _]*:[ _]*Contributions|${contribsPagePattern})\\/[ _]*)([^|\\]/]+)(/)?`
  );

  if (cd.config.unsignedTemplates.length) {
    const pattern = cd.config.unsignedTemplates.map(generatePageNamePattern).join('|');
    cd.g.unsignedTemplatesPattern = (
      `(\\{\\{ *(?:${pattern}) *\\| *([^}|]+?) *(?:\\| *([^}]+?) *)?\\}\\})`
    );
  }

  const clearTemplatesPattern = cd.config.clearTemplates.length ?
    cd.config.clearTemplates.map(generatePageNamePattern).join('|') :
    undefined;

  cd.g.keepInSectionEnding = cd.config.keepInSectionEnding
    .slice()
    .concat(
      clearTemplatesPattern ?
        new RegExp(`\\n+\\{\\{ *(?:${clearTemplatesPattern}) *\\}\\}\\s*$(?:)`) :
        []
    );

  cd.g.userSignature = settings.get('signaturePrefix') + cd.g.signCode;

  const signatureContent = mw.user.options.get('nickname');
  const authorInSignatureMatch = signatureContent.match(
    new RegExp(cd.g.captureUserNamePattern, 'i')
  );
  if (authorInSignatureMatch) {
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
    cd.g.userSignaturePrefixRegexp = new RegExp(
      (
        settings.get('signaturePrefix') === ' ' ?
          '' :
          mw.util.escapeRegExp(settings.get('signaturePrefix'))
      ) +
      mw.util.escapeRegExp(signatureContent.slice(0, authorInSignatureMatch.index)) +
      '$'
    );
  }

  const pieJoined = cd.g.popularInlineElements.join('|');
  cd.g.piePattern = `(?:${pieJoined})`;

  const pnieJoined = cd.g.popularNotInlineElements.join('|');
  cd.g.pniePattern = `(?:${pnieJoined})`;

  cd.g.startsWithArticlePathRegexp = new RegExp(
    '^' + mw.util.escapeRegExp(mw.config.get('wgArticlePath')).replace('\\$1', '')
  );
  cd.g.startsWithScriptTitleRegexp = new RegExp(
    '^' + mw.util.escapeRegExp(mw.config.get('wgScript') + '?title=')
  );

  // Template names are not case-sensitive here for code simplicity.
  const quoteTemplateToPattern = (tpl) => '\\{\\{ *' + anySpace(mw.util.escapeRegExp(tpl));
  const quoteBeginningsPattern = ['<blockquote', '<q']
    .concat(cd.config.pairQuoteTemplates?.[0].map(quoteTemplateToPattern) || [])
    .join('|');
  const quoteEndingsPattern = ['</blockquote>', '</q>']
    .concat(cd.config.pairQuoteTemplates?.[1].map(quoteTemplateToPattern) || [])
    .join('|');
  cd.g.quoteRegexp = new RegExp(`(${quoteBeginningsPattern})([^]*?)(${quoteEndingsPattern})`, 'ig');

  cd.g.noSignatureClasses.push(...cd.config.noSignatureClasses);
  cd.g.noHighlightClasses.push(...cd.config.noHighlightClasses);

  const fileNssPattern = joinNsNames(6);
  cd.g.filePrefixPattern = `(?:${fileNssPattern}):`;

  const colonNssPattern = joinNsNames(6, 14);
  cd.g.colonNamespacesPrefixRegexp = new RegExp(`^:(?:${colonNssPattern}):`, 'i');

  cd.g.badCommentBeginnings = cd.g.badCommentBeginnings
    .concat(new RegExp(`^\\[\\[${cd.g.filePrefixPattern}.+\\n+(?=[*:#])`, 'i'))
    .concat(cd.config.badCommentBeginnings)
    .concat(
      clearTemplatesPattern ?
        new RegExp(`^\\{\\{ *(?:${clearTemplatesPattern}) *\\}\\} *\\n+`, 'i') :
        []
    );

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
function prototypes() {
  Comment.initPrototypes();
  Section.initPrototypes();
  Thread.initPrototypes();
}

/**
 * Get a regexp that matches timestamps (without timezone at the end) generated using the given date
 * format.
 *
 * This only supports format characters that are used by the default date format in any of
 * MediaWiki's languages, namely: D, d, F, G, H, i, j, l, M, n, Y, xg, xkY (and escape characters),
 * and only dates when MediaWiki existed, let's say 2000 onwards (Thai dates before 1941 are
 * complicated).
 *
 * @param {'content'|'user'} language
 * @returns {string} Pattern to be a part of a regular expression.
 * @private
 * @author Bartosz Dziewoński <matma.rex@gmail.com>
 * @author Jack who built the house
 * @license MIT
 */
function getTimestampMainPartPattern(language) {
  const isContentLanguage = language === 'content';
  const format = isContentLanguage ? cd.g.contentDateFormat : cd.g.uiDateFormat;
  const digits = isContentLanguage ? cd.g.contentDigits : cd.g.uiDigits;
  const digitsPattern = digits ? `[${digits}]` : '\\d';

  const regexpGroup = (regexp) => '(' + regexp + ')';
  const regexpAlternateGroup = (arr) => '(' + arr.map(mw.util.escapeRegExp).join('|') + ')';

  let string = '';

  for (let p = 0; p < format.length; p++) {
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
          dateTokenToMessageNames[code].map(mw.msg);
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
function getMatchingGroups(format) {
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

export default {
  /**
   * _For internal use._ Load messages needed to parse and generate timestamps as well as some site
   * data.
   *
   * @returns {Promise[]} There should be at least one promise in the array.
   */
  getSiteData() {
    this.siteDataRequests ||= loadSiteData();

    return this.siteDataRequests;
  },

  /**
   * _For internal use._ Assign some important skin-specific values to the properties of the global
   * object.
   */
  memorizeCssValues() {
    cd.g.contentLineHeight = parseFloat(controller.$content.css('line-height'));
    cd.g.contentFontSize = parseFloat(controller.$content.css('font-size'));
    defaultFontSize = parseFloat($(document.documentElement).css('font-size'));

    // For Timeless, Vector-2022 skins
    cd.g.bodyScrollPaddingTop = parseFloat($('html, body').css('scroll-padding-top')) || 0;
    if (cd.g.skin === 'timeless') {
      cd.g.bodyScrollPaddingTop -= 5;
    }
  },

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
    const metadataFontSize = parseFloat((cd.g.contentFontSize / defaultFontSize).toFixed(7));
    const contentStartMargin = controller.getContentColumnOffsets().startMargin;
    const sidebarTransparentColor = transparentize(sidebarColor);

    mw.loader.addStyleTag(`:root {
  --cd-comment-hovered-background-color: #f8f9fa;
  --cd-comment-target-marker-color: #fc3;
  --cd-comment-target-background-color: #fef6e7;
  --cd-comment-target-hovered-background-color: #fef2db;
  --cd-comment-new-marker-color: #00af89;
  --cd-comment-new-background-color: #edffed;
  --cd-comment-new-hovered-background-color: #e4ffe4;
  --cd-comment-own-marker-color: #9f33cc;
  --cd-comment-own-background-color: #faf3fc;
  --cd-comment-own-hovered-background-color: #f7edfb;
  --cd-comment-deleted-marker-color: #d33;
  --cd-comment-deleted-background-color: #fee7e6;
  --cd-comment-deleted-hovered-background-color: #fddbd9;
  --cd-comment-fallback-side-margin: ${cd.g.commentFallbackSideMargin}px;
  --cd-thread-line-side-margin: ${cd.g.threadLineSideMargin}px;
  --cd-content-background-color: ${contentBackgroundColor};
  --cd-content-start-margin: ${contentStartMargin}px;
  --cd-content-font-size: ${cd.g.contentFontSize}px;
  --cd-content-metadata-font-size: ${metadataFontSize}rem;
  --cd-sidebar-color: ${sidebarColor};
  --cd-sidebar-transparent-color: ${sidebarTransparentColor};
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

    require('../less/global.less');

    require('../less/Comment.less');
    require('../less/CommentForm.less');
    require('../less/Section.less');
    require('../less/commentLayers.less');
    require('../less/navPanel.less');
    require('../less/pageNav.less');
    require('../less/skins.less');
    require('../less/talkPage.less');
    require('../less/toc.less');
  },

  /**
   * _For internal use._ Set a number of {@link convenientDiscussions global object} properties.
   */
  globals() {
    if (cd.page) return;

    cd.g.phpCharToUpper = (
      mw.loader.moduleRegistry['mediawiki.Title'].script.files['phpCharToUpper.json'] ||
      {}
    );

    /**
     * Current page's object.
     *
     * @see module:pageRegistry.getCurrent
     * @name page
     * @type {import('./pageRegistry').Page}
     * @memberof convenientDiscussions
     */
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

    // Is there `{{gender:}}` with at least two pipes in the selection of affected strings?
    cd.g.genderAffectsUserString = /\{\{ *gender *:[^}]+?\|[^} ]+?\|/i.test(
      Object.entries(mw.messages.get())
        .filter(([key]) => key.startsWith('convenient-discussions'))
        .map(([, value]) => value)
        .join()
    );

    if (cd.config.tagName && userRegistry.getCurrent().isRegistered()) {
      cd.g.summaryPostfix = '';
      cd.g.summaryLengthLimit = mw.config.get('wgCommentCodePointLimit');
    } else {
      cd.g.summaryPostfix = ` ([[${cd.config.scriptPageWikilink}|${cd.s('script-name-short')}]])`;
      cd.g.summaryLengthLimit = (
        mw.config.get('wgCommentCodePointLimit') -
        cd.g.summaryPostfix.length
      );
    }

    cd.g.clientProfile = $.client.profile();
    cd.g.cmdModifier = cd.g.clientProfile.platform === 'mac' ? 'Cmd' : 'Ctrl';

    cd.g.isIPv6Address = mw.util.isIPv6Address;

    cd.g.apiErrorFormatHtml = {
      errorformat: 'html',
      errorlang: cd.g.userLanguage,
      errorsuselocal: true,
    };

    cd.settings = settings;

    cd.tests.processPageInBackground = processPage;
    cd.tests.showSettingsDialog = controller.showSettingsDialog.bind(controller);
    cd.tests.editSubscriptions = controller.showEditSubscriptionsDialog.bind(controller);


    /* Some static methods for external use */

    /**
     * @see module:CommentStatic.getById
     * @function getCommentById
     * @memberof convenientDiscussions.api
     */
    cd.api.getCommentById = CommentStatic.getById.bind(CommentStatic);

    /**
     * @see module:CommentStatic.getByDtId
     * @function getCommentByDtId
     * @memberof convenientDiscussions.api
     */
    cd.api.getCommentByDtId = CommentStatic.getByDtId.bind(CommentStatic);

    /**
     * @see module:SectionStatic.getById
     * @function getSectionById
     * @memberof convenientDiscussions.api
     */
    cd.api.getSectionById = SectionStatic.getById.bind(SectionStatic);

    /**
     * @see module:SectionStatic.getByHeadline
     * @function getSectionsByHeadline
     * @memberof convenientDiscussions.api
     */
    cd.api.getSectionsByHeadline = SectionStatic.getByHeadline.bind(SectionStatic);

    /**
     * @see module:CommentFormStatic.getLastActive
     * @function getLastActiveCommentForm
     * @memberof convenientDiscussions.api
     */
    cd.api.getLastActiveCommentForm = CommentFormStatic.getLastActive.bind(CommentFormStatic);

    /**
     * @see module:CommentFormStatic.getLastActiveAltered
     * @function getLastActiveAlteredCommentForm
     * @memberof convenientDiscussions.api
     */
    cd.api.getLastActiveAlteredCommentForm = CommentFormStatic.getLastActiveAltered
      .bind(CommentFormStatic);

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
  },

  /**
   * _For internal use._ Set the {@link convenientDiscussions} properties related to timestamp
   * parsing.
   *
   * @param {string} language
   */
  timestampParsingTools(language) {
    if (language === 'content') {
      const mainPartPattern = getTimestampMainPartPattern('content');
      const utcPattern = mw.util.escapeRegExp(mw.message('(content)timezone-utc').parse());
      const timezonePattern = '\\((?:' + utcPattern + '|[A-Z]{1,5}|[+-]\\d{0,4})\\)';

      /**
       * Regular expression for matching timestamps in content.
       *
       * ` +` to account for RTL and LTR marks replaced with a space.
       *
       * @name contentTimestampRegexp
       * @type {RegExp}
       * @memberof convenientDiscussions.g
       */
      cd.g.contentTimestampRegexp = new RegExp(mainPartPattern + ' +' + timezonePattern);

      /**
       * Regular expression for parsing timestamps in content.
       *
       * @name parseTimestampContentRegexp
       * @type {RegExp}
       * @memberof convenientDiscussions.g
       */
      cd.g.parseTimestampContentRegexp = new RegExp(
        // `\b` only captures Latin, so we also need `' '`.
        `^([^]*(?:^|[^=])(?:\\b| ))(${cd.g.contentTimestampRegexp.source})(?!["»])`
      );

      /**
       * Regular expression for matching timestamps in content with no timezone at the end.
       *
       * @name contentTimestampNoTzRegexp
       * @type {RegExp}
       * @memberof convenientDiscussions.g
       */
      cd.g.contentTimestampNoTzRegexp = new RegExp(mainPartPattern);

      /**
       * Codes of date (in content language) components for the timestamp parser function.
       *
       * @name contentTimestampMatchingGroups
       * @type {string[]}
       * @memberof convenientDiscussions.g
       */
      cd.g.contentTimestampMatchingGroups = getMatchingGroups(cd.g.contentDateFormat);

      /**
       * Regular expression for matching timezone, with the global flag.
       *
       * @name timezoneRegexp
       * @type {RegExp}
       * @memberof convenientDiscussions.g
       */
      cd.g.timezoneRegexp = new RegExp(timezonePattern, 'g');
    } else {
      /**
       * Regular expression for matching timestamps in the interface with no timezone at the end.
       *
       * @name uiTimestampRegexp
       * @type {RegExp}
       * @memberof convenientDiscussions.g
       */
      cd.g.uiTimestampRegexp = new RegExp(getTimestampMainPartPattern('user'));

      /**
       * Regular expression for parsing timestamps in the interface.
       *
       * @name parseTimestampUiRegexp
       * @type {RegExp}
       * @memberof convenientDiscussions.g
       */
      cd.g.parseTimestampUiRegexp = new RegExp(`^([^]*)(${cd.g.uiTimestampRegexp.source})`);

      /**
       * Codes of date (in interface language) components for the timestamp parser function.
       *
       * @name uiTimestampMatchingGroups
       * @type {string[]}
       * @memberof convenientDiscussions.g
       */
      cd.g.uiTimestampMatchingGroups = getMatchingGroups(cd.g.uiDateFormat);
    }

    const timezoneParts = mw.user.options.get('timecorrection')?.split('|');

    /**
     * Timezone per user preferences: standard timezone name or offset in minutes. `'UTC'` is always
     * used instead of `0`.
     *
     * @name uiTimezone
     * @type {?(string|number)}
     * @memberof convenientDiscussions.g
     */
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
      /**
       * Whether comment timestamps are altered somehow.
       *
       * @name areTimestampsAltered
       * @type {boolean|undefined}
       * @memberof convenientDiscussions.g
       */
      cd.g.areTimestampsAltered = (
        (settings.get('useUiTime') && cd.g.contentTimezone !== cd.g.uiTimezone) ||
        settings.get('timestampFormat') !== 'default' ||
        mw.config.get('wgContentLanguage') !== cd.g.userLanguage ||
        settings.get('hideTimezone')
      );
    }
  },

  /**
   * _For internal use._ Assign various global objects' ({@link convenientDiscussions},
   * {@link external:jQuery.fn}) properties and methods that are needed for processing a talk page.
   * Executed on the first run.
   */
  async talkPage() {
    // In most cases the site data is already loaded after being requested in
    // `controller.loadToTalkPage()`.
    await Promise.all(this.getSiteData());

    // This could have been executed from `addCommentLinks.prepare()` already.
    this.globals();
    await settings.init();

    this.timestampParsingTools('content');
    patterns();
    prototypes();
    if (settings.get('useBackgroundHighlighting')) {
      require('../less/commentLayers-optionalBackgroundHighlighting.less');
    }
    $.fn.extend(jqueryExtensions);
    initDayjs();

    /**
     * Collection of all comment forms on the page in the order of their creation.
     *
     * @name commentForms
     * @type {import('./CommentForm').default[]}
     * @see module:CommentFormStatic.getAll
     * @memberof convenientDiscussions
     */
    cd.commentForms = CommentFormStatic.getAll();
  },
};
