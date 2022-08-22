/**
 * Singleton for initializing the script, both on talk pages and on log pages such as the watchlist.
 * Includes setting constants as properties of the {@link convenientDiscussions.g} object, adding
 * CSS, loading site data, such as MediaWiki messages and configuration, and setting date formats
 * based on it.
 *
 * @module init
 */

import CommentFormStatic from './CommentFormStatic';
import CommentStatic from './CommentStatic';
import SectionStatic from './SectionStatic';
import cd from './cd';
import controller from './controller';
import dateFormatsData from '../../data/dateFormats.json';
import digitsData from '../../data/digits.json';
import jqueryExtensions from './jqueryExtensions';
import languageFallbacksData from '../../data/languageFallbacks.json';
import pageRegistry from './pageRegistry';
import settings from './settings';
import subscriptions from './subscriptions';
import updateChecker from './updateChecker';
import userRegistry from './userRegistry';
import { dateTokenToMessageNames, initDayjs } from './timestamp';
import {
  generatePageNamePattern,
  getContentLanguageMessages,
  skin$,
  transparentize,
  unique,
} from './utils';
import { setVisits, splitIntoBatches } from './apiWrappers';

let defaultFontSize;

/**
 * Set the global variables related to date format.
 *
 * @private
 */
function setFormats() {
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
  setFormats();

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
    'discussiontools-topicsubscription-button-subscribe',
    'discussiontools-topicsubscription-button-subscribe-tooltip',
    'discussiontools-topicsubscription-button-unsubscribe',
    'discussiontools-topicsubscription-button-unsubscribe-tooltip',
    'discussiontools-topicsubscription-notify-subscribed-title',
    'discussiontools-topicsubscription-notify-subscribed-body',
    'discussiontools-topicsubscription-notify-unsubscribed-title',
    'discussiontools-topicsubscription-notify-unsubscribed-body',
  ].concat(...uiDateTokensMessageNames);

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
  // Fix configuration values in wrong format
  cd.config.customTalkNamespaces ||= [];

  const signatureEndingRegexpLastChar = cd.config.signatureEndingRegexp?.source?.slice(-1);
  if (signatureEndingRegexpLastChar && signatureEndingRegexpLastChar !== '$') {
    cd.config.signatureEndingRegexp = new RegExp(cd.config.signatureEndingRegexp.source + '$');
  }

  /**
   * Contributions page local name.
   *
   * @name contribsPage
   * @type {string}
   * @memberof convenientDiscussions.g
   */
  cd.g.contribsPage = (
    mw.config.get('wgFormattedNamespaces')[-1] +
    ':' +
    cd.g.specialPageAliases.Contributions
  );

  const anySpace = (s) => s.replace(/[ _]/g, '[ _]+').replace(/:/g, '[ _]*:[ _]*');

  const nsIds = mw.config.get('wgNamespaceIds');
  const userNssAliases = Object.keys(nsIds).filter((key) => nsIds[key] === 2 || nsIds[key] === 3);
  const userNssAliasesPattern = userNssAliases.map(anySpace).join('|');
  cd.g.userNamespacesRegexp = new RegExp(`(?:^|:)(?:${userNssAliasesPattern}):(.+)`, 'i');

  const userNsAliases = Object.keys(nsIds).filter((key) => nsIds[key] === 2);
  const userNsAliasesPattern = userNsAliases.map(anySpace).join('|');
  cd.g.userLinkRegexp = new RegExp(`^:?(?:${userNsAliasesPattern}):([^/]+)$`, 'i');
  cd.g.userSubpageLinkRegexp = new RegExp(`^:?(?:${userNsAliasesPattern}):.+?/`, 'i');

  const userTalkNsAliases = Object.keys(nsIds).filter((key) => nsIds[key] === 3);
  const userTalkNsAliasesPattern = userTalkNsAliases.map(anySpace).join('|');
  cd.g.userTalkLinkRegexp = new RegExp(`^:?(?:${userTalkNsAliasesPattern}):([^/]+)$`, 'i');
  cd.g.userTalkSubpageLinkRegexp = new RegExp(`^:?(?:${userTalkNsAliasesPattern}):.+?/`, 'i');

  cd.g.contribsPageLinkRegexp = new RegExp(`^${cd.g.contribsPage}/`);

  const allNssPattern = Object.keys(nsIds)
    .filter((ns) => ns)
    .join('|');
  cd.g.allNamespacesRegexp = new RegExp(`^:?(?:${allNssPattern}):`, 'i');

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
        new RegExp(`\\n+\\{\\{ *(?:${clearTemplatesPattern}) *\\}\\}\\s*$`) :
        []
    );

  cd.g.userSignature = settings.get('signaturePrefix') + cd.g.signCode;

  const signatureContent = mw.user.options.get('nickname');
  const authorInSignatureMatch = signatureContent.match(
    new RegExp(cd.g.captureUserNamePattern, 'i')
  );
  if (authorInSignatureMatch) {
    // Extract signature contents before the user name - in order to cut it out from comment
    // endings when editing.
    const signaturePrefixPattern = settings.get('signaturePrefix') === ' ' ?
      '[ \n]' :
      mw.util.escapeRegExp(settings.get('signaturePrefix'));
    const signatureBeginning = mw.util.escapeRegExp(
      signatureContent.slice(0, authorInSignatureMatch.index)
    );
    cd.g.userSignaturePrefixRegexp = new RegExp(signaturePrefixPattern + signatureBeginning + '$');
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

  cd.g.unhighlightableElementClasses = cd.g.unhighlightableElementClasses
    .concat(cd.config.customUnhighlightableElementClasses);

  const fileNssPattern = Object.keys(nsIds)
    .filter((key) => nsIds[key] === 6)
    .map(anySpace)
    .join('|');
  cd.g.filePrefixPattern = `(?:${fileNssPattern}):`;

  const colonNssPattern = Object.keys(nsIds)
    .filter((key) => nsIds[key] === 6 || nsIds[key] === 14)
    .map(anySpace)
    .join('|');
  cd.g.colonNamespacesPrefixRegexp = new RegExp(`^:(?:${colonNssPattern}):`, 'i');

  cd.g.badCommentBeginnings = cd.g.badCommentBeginnings
    .concat(new RegExp(`^\\[\\[${cd.g.filePrefixPattern}.+\\n*(?=[*:#])`, 'i'))
    .concat(cd.config.customBadCommentBeginnings)
    .concat(
      clearTemplatesPattern ?
        new RegExp(`^\\{\\{ *(?:${clearTemplatesPattern}) *\\}\\} *\\n+`, 'i') :
        []
    );

  cd.g.pipeTrickRegexp = /(\[\[:?(?:[^|[\]<>\n:]+:)?([^|[\]<>\n]+)\|)(\]\])/g;
}

/**
 * Add comment header element prototype to the prototype collection.
 *
 * @param {object} prototypes
 * @private
 */
function addCommentHeaderPrototype(prototypes) {
  // Not true, null
  if (settings.get('reformatComments') === false) return;

  const headerElement = document.createElement('div');
  headerElement.className = 'cd-comment-header';

  const authorWrapper = document.createElement('span');
  authorWrapper.className = 'cd-comment-author-wrapper';
  headerElement.append(authorWrapper);

  const authorLink = document.createElement('a');
  authorLink.className = 'cd-comment-author mw-userlink';
  authorWrapper.append(authorLink);

  const bdiElement = document.createElement('bdi');
  authorLink.append(bdiElement);

  const authorLinksWrapper = document.createElement('span');
  authorLinksWrapper.className = 'cd-comment-author-links';

  const authorTalkLink = document.createElement('a');
  authorTalkLink.textContent = cd.s('comment-author-talk');
  authorLinksWrapper.append(cd.mws('parentheses-start'), authorTalkLink);

  if (settings.get('showContribsLink')) {
    const separator = document.createElement('span');
    separator.innerHTML = cd.sParse('dot-separator');

    const contribsLink = document.createElement('a');
    contribsLink.textContent = cd.s('comment-author-contribs');

    authorLinksWrapper.append(...separator.childNodes, contribsLink);
  }

  authorLinksWrapper.append(cd.mws('parentheses-end'));
  authorWrapper.append(' ', authorLinksWrapper);

  prototypes.headerElement = headerElement;
}

/**
 * Add OOUI button prototypes to the prototype collection. Creating every button using the
 * constructor takes 15 times longer than cloning which is critical when creating really many of
 * them.
 *
 * @param {object} prototypes
 * @private
 */
function addCommentOouiPrototypes(prototypes) {
  if (settings.get('reformatComments') === true) return;

  prototypes.getReplyButton = () => (
    new OO.ui.ButtonWidget({
      label: cd.s('cm-reply'),
      framed: false,
      classes: ['cd-button-ooui', 'cd-comment-button-ooui'],
    })
  );
  prototypes.replyButton = prototypes.getReplyButton().$element.get(0);

  prototypes.getEditButton = () => (
    new OO.ui.ButtonWidget({
      label: cd.s('cm-edit'),
      framed: false,
      classes: ['cd-button-ooui', 'cd-comment-button-ooui'],
    })
  );
  prototypes.editButton = prototypes.getEditButton().$element.get(0);

  prototypes.getThankButton = () => (
    new OO.ui.ButtonWidget({
      label: cd.s('cm-thank'),
      title: cd.s('cm-thank-tooltip'),
      framed: false,
      classes: ['cd-button-ooui', 'cd-comment-button-ooui'],
    })
  );
  prototypes.thankButton = prototypes.getThankButton().$element.get(0);

  prototypes.getCopyLinkButton = () => (
    new OO.ui.ButtonWidget({
      label: cd.s('cm-copylink'),
      icon: 'link',
      title: cd.s('cm-copylink-tooltip'),
      framed: false,
      invisibleLabel: true,
      classes: ['cd-button-ooui', 'cd-comment-button-ooui', 'cd-comment-button-ooui-icon'],
    })
  );
  prototypes.copyLinkButton = prototypes.getCopyLinkButton().$element.get(0);

  prototypes.getGoToParentButton = () => (
    new OO.ui.ButtonWidget({
      label: cd.s('cm-gotoparent'),
      icon: 'upTriangle',
      title: cd.s('cm-gotoparent-tooltip'),
      framed: false,
      invisibleLabel: true,
      classes: ['cd-button-ooui', 'cd-comment-button-ooui', 'cd-comment-button-ooui-icon'],
    })
  );
  prototypes.goToParentButton = prototypes.getGoToParentButton().$element.get(0);

  prototypes.getGoToChildButton = () => (
    new OO.ui.ButtonWidget({
      label: cd.s('cm-gotochild'),
      icon: 'downTriangle',
      title: cd.s('cm-gotochild-tooltip'),
      framed: false,
      invisibleLabel: true,
      classes: ['cd-button-ooui', 'cd-comment-button-ooui', 'cd-comment-button-ooui-icon'],
    })
  );
  prototypes.goToChildButton = prototypes.getGoToChildButton().$element.get(0);
}

/**
 * Add comment layer element prototypes to the prototype collection.
 *
 * @param {object} prototypes
 * @private
 */
function addCommentLayerPrototypes(prototypes) {
  const commentUnderlay = document.createElement('div');
  commentUnderlay.className = 'cd-comment-underlay';
  prototypes.underlay = commentUnderlay;

  const commentOverlay = document.createElement('div');
  commentOverlay.className = 'cd-comment-overlay';
  prototypes.overlay = commentOverlay;

  const overlayLine = document.createElement('div');
  overlayLine.className = 'cd-comment-overlay-line';
  commentOverlay.appendChild(overlayLine);

  const overlayMarker = document.createElement('div');
  overlayMarker.className = 'cd-comment-overlay-marker';
  commentOverlay.appendChild(overlayMarker);

  if (!settings.get('reformatComments')) {
    const overlayInnerWrapper = document.createElement('div');
    overlayInnerWrapper.className = 'cd-comment-overlay-innerWrapper';
    commentOverlay.appendChild(overlayInnerWrapper);

    const overlayGradient = document.createElement('div');
    overlayGradient.textContent = '\xa0';
    overlayGradient.className = 'cd-comment-overlay-gradient';
    overlayInnerWrapper.appendChild(overlayGradient);

    const overlayContent = document.createElement('div');
    overlayContent.className = 'cd-comment-overlay-content';
    overlayInnerWrapper.appendChild(overlayContent);
  }
}

/**
 * Create element prototypes for comments.
 *
 * @private
 */
function commentElementPrototypes() {
  const prototypes = {};

  addCommentHeaderPrototype(prototypes);
  addCommentOouiPrototypes(prototypes);
  addCommentLayerPrototypes(prototypes);

  cd.g.commentElementPrototypes = prototypes;
}

/**
 * Create element prototypes for sections.
 *
 * @private
 */
function sectionElementPrototypes() {
  const prototypes = {};

  prototypes.replyButton = new OO.ui.ButtonWidget({
    label: cd.s('section-reply'),
    framed: false,

    // Add the thread button class as it behaves as a thread button in fact, being positioned
    // inside a "cd-commentLevel" list.
    classes: ['cd-button-ooui', 'cd-section-button', 'cd-thread-button'],
  }).$element.get(0);

  prototypes.addSubsectionButton = new OO.ui.ButtonWidget({
    // Will be replaced
    label: ' ',

    framed: false,
    classes: ['cd-button-ooui', 'cd-section-button'],
  }).$element.get(0);

  prototypes.copyLinkButton = new OO.ui.ButtonWidget({
    framed: false,
    flags: ['progressive'],
    icon: 'link',
    label: cd.s('sm-copylink'),
    invisibleLabel: true,
    title: cd.s('sm-copylink-tooltip'),
    classes: ['cd-section-bar-button'],
  }).$element.get(0);

  prototypes.getMoreMenuSelect = () => (
    new OO.ui.ButtonMenuSelectWidget({
      framed: false,
      icon: 'ellipsis',
      label: cd.s('sm-more'),
      invisibleLabel: true,
      title: cd.s('sm-more'),
      menu: {
        horizontalPosition: 'end',
      },
      classes: ['cd-section-bar-button', 'cd-section-bar-moremenu'],
    })
  );
  prototypes.moreMenuSelect = prototypes.getMoreMenuSelect().$element.get(0);

  cd.g.sectionElementPrototypes = prototypes;
}

/**
 * Create element prototypes for threads.
 *
 * @private
 */
function threadElementPrototypes() {
  let prototypes = {};

  prototypes.expandButton = new OO.ui.ButtonWidget({
    // Isn't displayed
    label: 'Expand the thread',
    icon: 'expand',

    framed: false,
    classes: [
      'cd-button-ooui',
      'cd-button-expandNote',
      'cd-thread-button',
      'cd-thread-button-invisible',
    ],
  }).$element.get(0);

  const threadClickArea = document.createElement('div');
  threadClickArea.className = 'cd-thread-clickArea';
  const line = document.createElement('div');
  line.className = 'cd-thread-line';
  threadClickArea.appendChild(line);
  prototypes.clickArea = threadClickArea;

  cd.g.threadElementPrototypes = prototypes;
}

/**
 * Initialize OOUI and comment layers-related objects.
 *
 * @private
 */
function oouiAndElementPrototypes() {
  commentElementPrototypes();
  sectionElementPrototypes();
  threadElementPrototypes();
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

  let string = '\\b';

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
   * _For internal use._ Get the site data requests without making them if there are none yet.
   *
   * @returns {Promise[]}
   */
  getSiteDataRequests() {
    return this.siteDataRequests || [];
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
  },

  /**
   * _For internal use._ Set CSS for talk pages: set CSS variables, add static CSS.
   */
  addTalkPageCss() {
    const contentBackgroundColor = $('#content').css('background-color') || '#fff';

    const $backgrounded = skin$({
      timeless: '#mw-content-container',
      'vector-2022': '.mw-page-container',
      default: 'body',
    });
    const sidebarColor = $backgrounded.css('background-color');
    const metadataFontSize = parseFloat(
      ((13 / 14) * cd.g.contentFontSize / defaultFontSize).toFixed(7)
    );

    mw.loader.addStyleTag(`:root {
  --cd-comment-hovered-background-color: ${cd.g.commentHoveredBackgroundColor};
  --cd-comment-target-marker-color: ${cd.g.commentTargetMarkerColor};
  --cd-comment-target-background-color: ${cd.g.commentTargetBackgroundColor};
  --cd-comment-target-hovered-background-color: ${cd.g.commentTargetHoverBackgroundColor};
  --cd-comment-new-marker-color: ${cd.g.commentNewMarkerColor};
  --cd-comment-new-background-color: ${cd.g.commentNewBackgroundColor};
  --cd-comment-new-hovered-background-color: ${cd.g.commentNewHoveredBackgroundColor};
  --cd-comment-own-marker-color: ${cd.g.commentOwnMarkerColor};
  --cd-comment-own-background-color: ${cd.g.commentOwnBackgroundColor};
  --cd-comment-own-hovered-background-color: ${cd.g.commentOwnHoveredBackgroundColor};
  --cd-comment-deleted-marker-color: ${cd.g.commentDeletedMarkerColor};
  --cd-comment-deleted-background-color: ${cd.g.commentDeletedBackgroundColor};
  --cd-comment-deleted-hovered-background-color: ${cd.g.commentDeletedHoveredBackgroundColor};
  --cd-comment-fallback-side-margin: ${cd.g.commentFallbackSideMargin}px;
  --cd-thread-line-side-margin: ${cd.g.threadLineSideMargin}px;
  --cd-content-background-color: ${contentBackgroundColor};
  --cd-content-start-margin: ${controller.getContentColumnOffsets().startMargin}px;
  --cd-content-font-size: ${cd.g.contentFontSize}px;
  --cd-content-metadata-font-size: ${metadataFontSize}rem;
  --cd-sidebar-color: ${sidebarColor};
  --cd-sidebar-transparent-color: ${transparentize(sidebarColor)};
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
    require('../less/skin.less');
    require('../less/talkPage.less');
    require('../less/toc.less');
  },

  /**
   * _For internal use._ Set a number of {@link convenientDiscussions global object} properties.
   */
  globals() {
    if (cd.g.phpCharToUpper) return;

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

    // {{gender:}} with at least two pipes in a selection of the affected strings.
    cd.g.genderAffectsUserString = /\{\{ *gender *:[^}]+?\|[^}]+?\|/i.test(
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

    cd.g.apiErrorsFormatHtml = {
      errorformat: 'html',
      errorlang: cd.g.userLanguage,
      errorsuselocal: true,
    };

    cd.settings = settings;

    cd.tests.processPageInBackground = updateChecker.processPage.bind(updateChecker);
    cd.tests.showSettingsDialog = controller.showSettingsDialog.bind(controller);
    cd.tests.editSubscriptions = controller.showEditSubscriptionsDialog.bind(controller);
    cd.tests.setVisits = setVisits;
    cd.tests.subscriptions = subscriptions;


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
        `^([^]*)(${cd.g.contentTimestampRegexp.source})(?!["»])`
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
    await Promise.all(this.getSiteData());

    // This can have been executed from `addCommentLinks.prepare()`.
    this.globals();
    await settings.init();

    this.timestampParsingTools('content');
    patterns();
    oouiAndElementPrototypes();
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
