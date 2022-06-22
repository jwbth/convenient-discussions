/**
 * Singleton for initializing the script, both on talk pages and on log pages such as the watchlist.
 * Includes setting constants as properties of the {@link convenientDiscussions.g} object, adding
 * CSS, loading site data, such as MediaWiki messages and configuration, and setting date formats
 * based on it.
 *
 * @module init
 */

import Comment from './Comment';
import CommentForm from './CommentForm';
import DATE_FORMATS from '../../data/dateFormats.json';
import DIGITS from '../../data/digits.json';
import LANGUAGE_FALLBACKS from '../../data/languageFallbacks.json';
import Section from './Section';
import cd from './cd';
import controller from './controller';
import jqueryExtensions from './jqueryExtensions';
import pageRegistry from './pageRegistry';
import settings from './settings';
import subscriptions from './subscriptions';
import updateChecker from './updateChecker';
import userRegistry from './userRegistry';
import { dateTokenToMessageNames, initDayjs } from './timestamp';
import {
  generatePageNamePattern,
  getContentLanguageMessages,
  hideText,
  mergeRegexps,
  skin$,
  transparentize,
  unhideText,
  unique,
} from './util';
import { setVisits, splitIntoBatches } from './apiWrappers';
import { showEditSubscriptionsDialog, showSettingsDialog } from './modal';

/**
 * Set the global variables related to date format.
 *
 * @private
 */
function setFormats() {
  const getFallbackLanguage = (lang) => (
    (LANGUAGE_FALLBACKS[lang] || ['en']).find((fallback) => DATE_FORMATS[fallback])
  );
  const languageOrFallback = (lang) => DATE_FORMATS[lang] ? lang : getFallbackLanguage(lang);

  const contentLanguage = languageOrFallback(mw.config.get('wgContentLanguage'));
  const userLanguage = languageOrFallback(mw.config.get('wgUserLanguage'));

  /**
   * Format of date in content language, as used by MediaWiki.
   *
   * @name CONTENT_DATE_FORMAT
   * @type {string}
   * @memberof convenientDiscussions.g
   */
  cd.g.CONTENT_DATE_FORMAT = DATE_FORMATS[contentLanguage];

  /**
   * Format of date in user (interface) language, as used by MediaWiki.
   *
   * @name UI_DATE_FORMAT
   * @type {string}
   * @memberof convenientDiscussions.g
   */
  cd.g.UI_DATE_FORMAT = DATE_FORMATS[userLanguage];

  /**
   * Regular expression matching a single digit in content language, e.g. `[0-9]`.
   *
   * @name CONTENT_DIGITS
   * @type {string}
   * @memberof convenientDiscussions.g
   */
  cd.g.CONTENT_DIGITS = mw.config.get('wgTranslateNumerals') ? DIGITS[contentLanguage] : null;

  /**
   * Regular expression matching a single digit in user (interface) language, e.g. `[0-9]`.
   *
   * @name UI_DIGITS
   * @type {string}
   * @memberof convenientDiscussions.g
   */
  cd.g.UI_DIGITS = mw.config.get('wgTranslateNumerals') ? DIGITS[userLanguage] : null;
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
 * _For internal use._ Load messages needed to parse and generate timestamps as well as some site
 * data.
 *
 * @returns {Promise[]} There should be at least one promise in the array.
 */
function loadSiteData() {
  setFormats();

  const contentDateTokensMessageNames = getUsedDateTokens(cd.g.CONTENT_DATE_FORMAT)
    .map((pattern) => dateTokenToMessageNames[pattern]);
  const contentLanguageMessageNames = [
    'word-separator', 'comma-separator', 'colon-separator', 'timezone-utc'
  ].concat(...contentDateTokensMessageNames);

  const uiDateTokensMessageNames = getUsedDateTokens(cd.g.UI_DATE_FORMAT)
    .map((pattern) => dateTokenToMessageNames[pattern]);
  const userLanguageMessageNames = [
    'parentheses', 'parentheses-start', 'parentheses-end', 'word-separator', 'comma-separator',
    'colon-separator', 'nextdiff', 'timezone-utc',
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
  cd.g.CONTENT_LANGUAGE_MESSAGES = {};

  const setContentLanguageMessages = (messages) => {
    Object.keys(messages).forEach((name) => {
      mw.messages.set('(content)' + name, messages[name]);
      cd.g.CONTENT_LANGUAGE_MESSAGES[name] = messages[name];
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
      .filter((name) => !cd.g.CONTENT_LANGUAGE_MESSAGES[name]);
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

  cd.g.SPECIAL_PAGE_ALIASES = Object.assign({}, cd.config.specialPageAliases);

  /**
   * Timezone of the wiki.
   *
   * @name CONTENT_TIMEZONE
   * @type {?string}
   * @memberof convenientDiscussions.g
   */
  cd.g.CONTENT_TIMEZONE = cd.config.timezone;

  if (
    !cd.g.SPECIAL_PAGE_ALIASES.Contributions ||
    !cd.g.SPECIAL_PAGE_ALIASES.Diff ||
    !cd.g.CONTENT_TIMEZONE
  ) {
    const request = controller.getApi().get({
      action: 'query',
      meta: 'siteinfo',
      siprop: ['specialpagealiases', 'general'],
    }).then((resp) => {
      resp.query.specialpagealiases
        .filter((alias) => ['Contributions', 'Diff'].includes(alias.realname))
        .forEach((alias) => {
          cd.g.SPECIAL_PAGE_ALIASES[alias.realname] = alias.aliases[0];
        });
      cd.g.CONTENT_TIMEZONE = resp.query.general.timezone;
    });
    requests.push(request);
  }

  return requests;
}

/**
 * Populate some global object properties related to archive pages.
 */
function setArchivePagesGlobals() {
  cd.g.ARCHIVE_PAGES_MAP = new Map();
  cd.g.SOURCE_PAGES_MAP = new Map();
  const pathToRegexp = (s, replacements, isArchivePath) => {
    let hidden = [];
    let pattern = hideText(s, /\\[$\\]/g, hidden);
    pattern = mw.util.escapeRegExp(pattern);
    if (replacements) {
      pattern = pattern
        .replace(/\\\$/, '$')
        .replace(/\$(\d+)/, (s, n) => {
          const replacement = replacements[n - 1];
          return replacement ? `(${replacement.source})` : s;
        });
    }
    pattern = '^' + pattern + (isArchivePath ? '.*' : '') + '$';
    pattern = unhideText(pattern, hidden);
    return new RegExp(pattern);
  };
  cd.config.archivePaths.forEach((entry) => {
    if (entry instanceof RegExp) {
      const archiveRegexp = new RegExp(entry.source + '.*');
      cd.g.SOURCE_PAGES_MAP.set(archiveRegexp, '');
    } else {
      const sourceRegexp = pathToRegexp(entry.source, entry.replacements);
      const archiveRegexp = pathToRegexp(entry.archive, entry.replacements, true);
      cd.g.ARCHIVE_PAGES_MAP.set(sourceRegexp, entry.archive);
      cd.g.SOURCE_PAGES_MAP.set(archiveRegexp, entry.source);
    }
  });
}

/**
 * Generate regexps, patterns (strings to be parts of regexps), selectors from config values.
 *
 * @private
 */
function patterns() {
  // Fix configuration values in wrong format
  cd.config.customTalkNamespaces = cd.config.customTalkNamespaces || [];

  const signatureEndingRegexpLastChar = cd.config.signatureEndingRegexp?.source?.slice(-1);
  if (signatureEndingRegexpLastChar && signatureEndingRegexpLastChar !== '$') {
    cd.config.signatureEndingRegexp = new RegExp(cd.config.signatureEndingRegexp.source + '$');
  }

  /**
   * Contributions page local name.
   *
   * @name CONTRIBS_PAGE
   * @type {string}
   * @memberof convenientDiscussions.g
   */
  cd.g.CONTRIBS_PAGE = (
    mw.config.get('wgFormattedNamespaces')[-1] +
    ':' +
    cd.g.SPECIAL_PAGE_ALIASES.Contributions
  );

  cd.g.CONTRIBS_PAGE_LINK_REGEXP = new RegExp(`^${cd.g.CONTRIBS_PAGE}/`);

  const anySpace = (s) => s.replace(/[ _]/g, '[ _]+').replace(/:/g, '[ _]*:[ _]*');

  const nsIds = mw.config.get('wgNamespaceIds');
  const userNssAliases = Object.keys(nsIds).filter((key) => nsIds[key] === 2 || nsIds[key] === 3);
  const userNssAliasesPattern = userNssAliases.map(anySpace).join('|');
  cd.g.USER_NAMESPACES_REGEXP = new RegExp(`(?:^|:)(?:${userNssAliasesPattern}):(.+)`, 'i');

  const userNsAliases = Object.keys(nsIds).filter((key) => nsIds[key] === 2);
  const userNsAliasesPattern = userNsAliases.map(anySpace).join('|');
  cd.g.USER_LINK_REGEXP = new RegExp(`^:?(?:${userNsAliasesPattern}):([^/]+)$`, 'i');
  cd.g.USER_SUBPAGE_LINK_REGEXP = new RegExp(`^:?(?:${userNsAliasesPattern}):.+?/`, 'i');

  const userTalkNsAliases = Object.keys(nsIds).filter((key) => nsIds[key] === 3);
  const userTalkNsAliasesPattern = userTalkNsAliases.map(anySpace).join('|');
  cd.g.USER_TALK_LINK_REGEXP = new RegExp(`^:?(?:${userTalkNsAliasesPattern}):([^/]+)$`, 'i');
  cd.g.USER_TALK_SUBPAGE_LINK_REGEXP = new RegExp(`^:?(?:${userTalkNsAliasesPattern}):.+?/`, 'i');

  const allNss = Object.keys(nsIds).filter((ns) => ns);
  const allNssPattern = allNss.join('|');
  cd.g.ALL_NAMESPACES_REGEXP = new RegExp(`^:?(?:${allNssPattern}):`, 'i');

  const contribsPagePattern = anySpace(cd.g.CONTRIBS_PAGE);
  cd.g.CAPTURE_USER_NAME_PATTERN = (
    `\\[\\[[ _]*:?(?:\\w*:){0,2}(?:(?:${userNssAliasesPattern})[ _]*:[ _]*|` +
    `(?:Special[ _]*:[ _]*Contributions|${contribsPagePattern})\\/[ _]*)([^|\\]/]+)(/)?`
  );

  if (cd.config.unsignedTemplates.length) {
    const pattern = cd.config.unsignedTemplates.map(generatePageNamePattern).join('|');
    cd.g.UNSIGNED_TEMPLATES_PATTERN = (
      `(\\{\\{ *(?:${pattern}) *\\| *([^}|]+?) *(?:\\| *([^}]+?) *)?\\}\\})`
    );
    cd.g.UNSIGNED_TEMPLATES_REGEXP = new RegExp(cd.g.UNSIGNED_TEMPLATES_PATTERN + '.*\\n', 'g');
  }

  let clearTemplatesPattern;
  if (cd.config.clearTemplates.length) {
    clearTemplatesPattern = cd.config.clearTemplates.map(generatePageNamePattern).join('|');
  }

  cd.g.KEEP_IN_SECTION_ENDING = cd.config.keepInSectionEnding.slice();
  if (clearTemplatesPattern) {
    const pattern = new RegExp(`\\n+\\{\\{ *(?:${clearTemplatesPattern}) *\\}\\}\\s*$`);
    cd.g.KEEP_IN_SECTION_ENDING.push(pattern);
  }

  cd.g.USER_SIGNATURE = settings.get('signaturePrefix') + cd.g.SIGN_CODE;

  const signatureContent = mw.user.options.get('nickname');
  const captureUserNameRegexp = new RegExp(cd.g.CAPTURE_USER_NAME_PATTERN, 'i');
  const authorInSignatureMatch = signatureContent.match(captureUserNameRegexp);
  if (authorInSignatureMatch) {
    // Extract signature contents before the user name - in order to cut it out from comment
    // endings when editing.
    const signaturePrefixPattern = settings.get('signaturePrefix') === ' ' ?
      '[ \n]' :
      mw.util.escapeRegExp(settings.get('signaturePrefix'));
    const signatureBeginning = mw.util.escapeRegExp(
      signatureContent.slice(0, authorInSignatureMatch.index)
    );
    cd.g.USER_SIGNATURE_PREFIX_REGEXP = new RegExp(
      signaturePrefixPattern +
      signatureBeginning +
      '$'
    );
  }

  const pieJoined = cd.g.POPULAR_INLINE_ELEMENTS.join('|');
  cd.g.PIE_PATTERN = `(?:${pieJoined})`;

  const pnieJoined = cd.g.POPULAR_NOT_INLINE_ELEMENTS.join('|');
  cd.g.PNIE_PATTERN = `(?:${pnieJoined})`;

  // TODO: Instead of removing only lines containing antipatterns from wikitext, hide entire
  // templates (see the "markerLength" parameter in wikitext.hideTemplatesRecursively) and tags?
  // But keep in mind that this code may still be part of comments.
  const commentAntipatternsPatternParts = [];
  if (
    cd.config.elementsToExcludeClasses.length ||
    cd.config.templatesToExclude.length ||
    cd.config.commentAntipatterns.length
  ) {
    if (cd.config.elementsToExcludeClasses) {
      const pattern = cd.config.elementsToExcludeClasses.join('\\b|\\b');
      commentAntipatternsPatternParts.push(`class=(['"])[^'"\\n]*(?:\\b${pattern}\\b)[^'"\\n]*\\1`);
    }
    if (cd.config.templatesToExclude.length) {
      const pattern = cd.config.templatesToExclude.map(generatePageNamePattern).join('|');
      commentAntipatternsPatternParts.push(`\\{\\{ *(?:${pattern}) *(?:\\||\\}\\})`);
    }
    if (cd.config.commentAntipatterns) {
      const sources = cd.config.commentAntipatterns.map((pattern) => pattern.source);
      commentAntipatternsPatternParts.push(...sources);
    }
    const pattern = commentAntipatternsPatternParts.join('|');
    cd.g.COMMENT_ANTIPATTERNS_REGEXP = new RegExp(`^.*(?:${pattern}).*$`, 'mg');
  }

  const articlePathPattern = mw.util.escapeRegExp(mw.config.get('wgArticlePath'))
    .replace('\\$1', '(.*)');
  cd.g.ARTICLE_PATH_REGEXP = new RegExp(articlePathPattern);

  const startsWithArticlePathPattern = (
    '^' +
    mw.util.escapeRegExp(mw.config.get('wgArticlePath')).replace('\\$1', '')
  );
  cd.g.STARTS_WITH_ARTICLE_PATH_REGEXP = new RegExp(startsWithArticlePathPattern);

  const scriptTitlePattern = '^' + mw.util.escapeRegExp(mw.config.get('wgScript') + '?title=');
  cd.g.STARTS_WITH_SCRIPT_TITLE = new RegExp(scriptTitlePattern);

  // Template names are not case-sensitive here for code simplicity.
  const quoteTemplateToPattern = (tpl) => '\\{\\{ *' + anySpace(mw.util.escapeRegExp(tpl));
  const quoteBeginningsPattern = ['<blockquote', '<q']
    .concat(cd.config.pairQuoteTemplates?.[0].map(quoteTemplateToPattern) || [])
    .join('|');
  const quoteEndingsPattern = ['</blockquote>', '</q>']
    .concat(cd.config.pairQuoteTemplates?.[1].map(quoteTemplateToPattern) || [])
    .join('|');
  cd.g.QUOTE_REGEXP = new RegExp(
    `(${quoteBeginningsPattern})([^]*?)(${quoteEndingsPattern})`,
    'ig'
  );

  const outdentTemplatesPattern = cd.config.outdentTemplates
    .map(generatePageNamePattern)
    .join('|');
  if (outdentTemplatesPattern) {
    const pattern = `^([:*]*) *\\{\\{ *(?:${outdentTemplatesPattern}) *(?:\\||\\}\\})`;
    cd.g.OUTDENT_TEMPLATES_REGEXP = new RegExp(pattern, 'g');
  }

  const closedDiscussionBeginningsPattern = (cd.config.closedDiscussionTemplates?.[0] || [])
    .map(generatePageNamePattern)
    .join('|');
  const closedDiscussionEndingsPattern = (cd.config.closedDiscussionTemplates?.[1] || [])
    .map(generatePageNamePattern)
    .join('|');
  if (closedDiscussionBeginningsPattern) {
    if (closedDiscussionEndingsPattern) {
      cd.g.CLOSED_DISCUSSION_PAIR_REGEXP = new RegExp(
        `\\{\\{ *(?:${closedDiscussionBeginningsPattern}) *(?=[|}])[^}]*\\}\\}\\s*([:*#]*)[^]*?\\{\\{ *(?:${closedDiscussionEndingsPattern}) *(?=[|}])[^}]*\\}\\}`,
        'g'
      );
    }
    cd.g.CLOSED_DISCUSSION_SINGLE_REGEXP = new RegExp(
      `\\{\\{ *(?:${closedDiscussionBeginningsPattern}) *\\|[^}]{0,50}?=\\s*([:*#]*)`,
      'g'
    );
  }

  cd.g.UNHIGHLIGHTABLE_ELEMENT_CLASSES = cd.g.UNHIGHLIGHTABLE_ELEMENT_CLASSES
    .concat(cd.config.customUnhighlightableElementClasses);

  const fileNss = Object.keys(nsIds).filter((key) => nsIds[key] === 6);
  const fileNssPattern = fileNss.map(anySpace).join('|');
  cd.g.FILE_PREFIX_PATTERN = `(?:${fileNssPattern}):`;

  // Actually, only text from "mini" format images should be captured, because in the standard
  // format the text is not displayed. See "img_thumbnail" in
  // https://ru.wikipedia.org/w/api.php?action=query&meta=siteinfo&siprop=magicwords&formatversion=2.
  // Unfortunately, that would add like 100ms to the server's response time.
  cd.g.FILE_EMBED_REGEXP = new RegExp(
    `\\[\\[${cd.g.FILE_PREFIX_PATTERN}[^\\]]+?(?:\\|[^\\]]+?\\|((?:\\[\\[[^\\]]+?\\]\\]|[^|\\]])+))?\\]\\]`,
    'ig'
  );

  const colonNss = Object.keys(nsIds).filter((key) => nsIds[key] === 6 || nsIds[key] === 14);
  const colonNssPattern = colonNss.map(anySpace).join('|');
  cd.g.COLON_NAMESPACES_PREFIX_REGEXP = new RegExp(`^:(?:${colonNssPattern}):`, 'i');

  cd.g.BAD_COMMENT_BEGINNINGS = cd.g.BAD_COMMENT_BEGINNINGS
    .concat(new RegExp(`^\\[\\[${cd.g.FILE_PREFIX_PATTERN}.+\\n*(?=[*:#])`, 'i'))
    .concat(cd.config.customBadCommentBeginnings);
  if (clearTemplatesPattern) {
    const pattern = new RegExp(`^\\{\\{ *(?:${clearTemplatesPattern}) *\\}\\} *\\n+`, 'i');
    cd.g.BAD_COMMENT_BEGINNINGS.push(pattern);
  }

  cd.g.ADD_TOPIC_SELECTOR = [
    '#ca-addsection a',
    'a[href*="section=new"]',
    '.commentbox input[type="submit"]',
    '.createbox input[type="submit"]',
  ]
    .concat(cd.config.customAddTopicLinkSelectors)
    .join(', ');

  cd.g.PAGES_WITHOUT_ARCHIVES_REGEXP = mergeRegexps(cd.config.pagesWithoutArchives);

  setArchivePagesGlobals();
}

/**
 * Add comment header element prototype to the prototype collection.
 *
 * @param {object} commentElementPrototypes
 * @private
 */
function addCommentHeaderPrototype(commentElementPrototypes) {
  // true, null
  if (settings.get('reformatComments') !== false) {
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
      const contribsLink = document.createElement('a');
      contribsLink.textContent = cd.s('comment-author-contribs');
      const separator = commentElementPrototypes.separator.cloneNode(true);
      authorLinksWrapper.append(separator, contribsLink);
    }

    authorLinksWrapper.append(cd.mws('parentheses-end'));
    authorWrapper.append(' ', authorLinksWrapper);

    commentElementPrototypes.headerElement = headerElement;
  }
}

/**
 * Add OOUI button prototypes to the prototype collection. Creating every button using the
 * constructor takes 15 times longer than cloning which is critical when creating really many of
 * them.
 *
 * @param {object} commentElementPrototypes
 * @private
 */
function addCommentOouiPrototypes(commentElementPrototypes) {
  if (settings.get('reformatComments') === true) return;

  commentElementPrototypes.getReplyButton = () => (
    new OO.ui.ButtonWidget({
      label: cd.s('cm-reply'),
      framed: false,
      classes: ['cd-button-ooui', 'cd-comment-button-ooui'],
    })
  );
  commentElementPrototypes.replyButton = commentElementPrototypes.getReplyButton().$element
    .get(0);

  commentElementPrototypes.getEditButton = () => (
    new OO.ui.ButtonWidget({
      label: cd.s('cm-edit'),
      framed: false,
      classes: ['cd-button-ooui', 'cd-comment-button-ooui'],
    })
  );
  commentElementPrototypes.editButton = commentElementPrototypes.getEditButton().$element
    .get(0);

  commentElementPrototypes.getThankButton = () => (
    new OO.ui.ButtonWidget({
      label: cd.s('cm-thank'),
      title: cd.s('cm-thank-tooltip'),
      framed: false,
      classes: ['cd-button-ooui', 'cd-comment-button-ooui'],
    })
  );
  commentElementPrototypes.thankButton = commentElementPrototypes.getThankButton().$element
    .get(0);

  commentElementPrototypes.getCopyLinkButton = () => (
    new OO.ui.ButtonWidget({
      label: cd.s('cm-copylink'),
      icon: 'link',
      title: cd.s('cm-copylink-tooltip'),
      framed: false,
      invisibleLabel: true,
      classes: ['cd-button-ooui', 'cd-comment-button-ooui', 'cd-comment-button-ooui-icon'],
    })
  );
  commentElementPrototypes.copyLinkButton = commentElementPrototypes.getCopyLinkButton()
    .$element.get(0);

  commentElementPrototypes.getGoToParentButton = () => (
    new OO.ui.ButtonWidget({
      label: cd.s('cm-gotoparent'),
      icon: 'upTriangle',
      title: cd.s('cm-gotoparent-tooltip'),
      framed: false,
      invisibleLabel: true,
      classes: ['cd-button-ooui', 'cd-comment-button-ooui', 'cd-comment-button-ooui-icon'],
    })
  );
  commentElementPrototypes.goToParentButton = commentElementPrototypes.getGoToParentButton()
    .$element.get(0);

  commentElementPrototypes.getGoToChildButton = () => (
    new OO.ui.ButtonWidget({
      label: cd.s('cm-gotochild'),
      icon: 'downTriangle',
      title: cd.s('cm-gotochild-tooltip'),
      framed: false,
      invisibleLabel: true,
      classes: ['cd-button-ooui', 'cd-comment-button-ooui', 'cd-comment-button-ooui-icon'],
    })
  );
  commentElementPrototypes.goToChildButton = commentElementPrototypes.getGoToChildButton()
    .$element.get(0);
}

/**
 * Add comment layer element prototypes to the prototype collection.
 *
 * @param {object} commentElementPrototypes
 * @private
 */
function addCommentLayerPrototypes(commentElementPrototypes) {
  const commentUnderlay = document.createElement('div');
  commentUnderlay.className = 'cd-comment-underlay';
  commentElementPrototypes.underlay = commentUnderlay;

  const commentOverlay = document.createElement('div');
  commentOverlay.className = 'cd-comment-overlay';
  commentElementPrototypes.overlay = commentOverlay;

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
function createCommentElementPrototypes() {
  const commentElementPrototypes = {};

  const separator = document.createElement('span');
  separator.innerHTML = cd.sParse('dot-separator');
  commentElementPrototypes.separator = separator;

  addCommentHeaderPrototype(commentElementPrototypes);
  addCommentOouiPrototypes(commentElementPrototypes);
  addCommentLayerPrototypes(commentElementPrototypes);

  cd.g.COMMENT_ELEMENT_PROTOTYPES = commentElementPrototypes;
}

/**
 * Create element prototypes for sections.
 *
 * @private
 */
function createSectionElementPrototypes() {
  const sectionElementPrototypes = {};

  sectionElementPrototypes.replyButton = new OO.ui.ButtonWidget({
    label: cd.s('section-reply'),
    framed: false,

    // Add the thread button class as it behaves as a thread button in fact, being positioned
    // inside a "cd-commentLevel" list.
    classes: ['cd-button-ooui', 'cd-section-button', 'cd-thread-button'],
  }).$element.get(0);

  sectionElementPrototypes.addSubsectionButton = new OO.ui.ButtonWidget({
    // Will be replaced
    label: ' ',

    framed: false,
    classes: ['cd-button-ooui', 'cd-section-button'],
  }).$element.get(0);

  cd.g.SECTION_ELEMENT_PROTOTYPES = sectionElementPrototypes;
}

/**
 * Create element prototypes for threads.
 *
 * @private
 */
function createThreadElementPrototypes() {
  let threadElementPrototypes = {};

  threadElementPrototypes.expandButton = new OO.ui.ButtonWidget({
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
  threadElementPrototypes.clickArea = threadClickArea;

  cd.g.THREAD_ELEMENT_PROTOTYPES = threadElementPrototypes;
}

/**
 * Initialize OOUI and comment layers-related objects.
 *
 * @private
 */
function oouiAndElementPrototypes() {
  createCommentElementPrototypes();
  createSectionElementPrototypes();
  createThreadElementPrototypes();
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
 * @param {string} language `'content'` or `'user'`.
 * @returns {string} Pattern to be a part of a regular expression.
 * @private
 * @author Bartosz Dziewoński <matma.rex@gmail.com>
 * @author Jack who built the house
 * @license MIT
 */
function getTimestampMainPartPattern(language) {
  const isContentLanguage = language === 'content';
  const format = isContentLanguage ? cd.g.CONTENT_DATE_FORMAT : cd.g.UI_DATE_FORMAT;
  const digits = isContentLanguage ? cd.g.CONTENT_DIGITS : cd.g.UI_DIGITS;
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
    if (!this.siteDataRequests) {
      this.siteDataRequests = loadSiteData();
    }

    return this.siteDataRequests;
  },

  /**
   * Get the site data requests without making them if there are none yet.
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
    cd.g.CONTENT_LINE_HEIGHT = parseFloat(controller.$content.css('line-height'));
    cd.g.CONTENT_FONT_SIZE = parseFloat(controller.$content.css('font-size'));

    // For Timeless, Vector-2022 skins
    cd.g.BODY_SCROLL_PADDING_TOP = parseFloat($('html, body').css('scroll-padding-top')) || 0;
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

    mw.loader.addStyleTag(`:root {
  --cd-comment-hovered-background-color: ${cd.g.COMMENT_HOVERED_BACKGROUND_COLOR};
  --cd-comment-target-marker-color: ${cd.g.COMMENT_TARGET_MARKER_COLOR};
  --cd-comment-target-background-color: ${cd.g.COMMENT_TARGET_BACKGROUND_COLOR};
  --cd-comment-target-hovered-background-color: ${cd.g.COMMENT_TARGET_HOVERED_BACKGROUND_COLOR};
  --cd-comment-new-marker-color: ${cd.g.COMMENT_NEW_MARKER_COLOR};
  --cd-comment-new-background-color: ${cd.g.COMMENT_NEW_BACKGROUND_COLOR};
  --cd-comment-new-hovered-background-color: ${cd.g.COMMENT_NEW_HOVERED_BACKGROUND_COLOR};
  --cd-comment-own-marker-color: ${cd.g.COMMENT_OWN_MARKER_COLOR};
  --cd-comment-own-background-color: ${cd.g.COMMENT_OWN_BACKGROUND_COLOR};
  --cd-comment-own-hovered-background-color: ${cd.g.COMMENT_OWN_HOVERED_BACKGROUND_COLOR};
  --cd-comment-deleted-marker-color: ${cd.g.COMMENT_DELETED_MARKER_COLOR};
  --cd-comment-deleted-background-color: ${cd.g.COMMENT_DELETED_BACKGROUND_COLOR};
  --cd-comment-deleted-hovered-background-color: ${cd.g.COMMENT_DELETED_HOVERED_BACKGROUND_COLOR};
  --cd-comment-fallback-side-margin: ${cd.g.COMMENT_FALLBACK_SIDE_MARGIN}px;
  --cd-thread-line-side-margin: ${cd.g.THREAD_LINE_SIDE_MARGIN}px;
  --cd-content-background-color: ${contentBackgroundColor};
  --cd-content-start-margin: ${controller.getContentColumnOffsets().startMargin}px;
  --cd-content-font-size: ${cd.g.CONTENT_FONT_SIZE}px;
  --cd-sidebar-color: ${sidebarColor};
  --cd-sidebar-transparent-color: ${transparentize(sidebarColor)};
}`);

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
   * Set a number of global object and controller properties.
   */
  globals() {
    cd.g.PHP_CHAR_TO_UPPER = mw.loader.moduleRegistry['mediawiki.Title'].script
      .files['phpCharToUpper.json'];

    /**
     * Current page's object.
     *
     * @name page
     * @type {Page}
     * @memberof convenientDiscussions
     */
    cd.page = pageRegistry.get(cd.g.PAGE_NAME, true);

    // TODO: Delete after all addons are updated.
    cd.g.PAGE = cd.page;

    /**
     * Current user's object.
     *
     * @name user
     * @type {module:userRegistry~User}
     * @memberof convenientDiscussions
     */
    cd.user = userRegistry.get(cd.g.USER_NAME);

    // {{gender:}} with at least two pipes in a selection of the affected strings.
    cd.g.GENDER_AFFECTS_USER_STRING = /\{\{ *gender *:[^}]+?\|[^}]+?\|/i.test(
      cd.sPlain('es-reply-to') +
      cd.sPlain('es-edit-comment-by') +
      cd.sPlain('thank-confirm') +
      cd.sPlain('thread-expand')
    );

    if (cd.config.tagName && cd.user.isRegistered()) {
      cd.g.SUMMARY_POSTFIX = '';
      cd.g.SUMMARY_LENGTH_LIMIT = mw.config.get('wgCommentCodePointLimit');
    } else {
      cd.g.SUMMARY_POSTFIX = ` ([[${cd.config.scriptPageWikilink}|${cd.s('script-name-short')}]])`;
      cd.g.SUMMARY_LENGTH_LIMIT = (
        mw.config.get('wgCommentCodePointLimit') -
        cd.g.SUMMARY_POSTFIX.length
      );
    }

    cd.g.CLIENT_PROFILE = $.client.profile();
    cd.g.CMD_MODIFIER = cd.g.CLIENT_PROFILE.platform === 'mac' ? 'Cmd' : 'Ctrl';

    cd.g.isIPv6Address = mw.util.isIPv6Address;

    cd.g.NOTIFICATION_AREA = document.querySelector('.mw-notification-area');

    cd.settings = settings;

    cd.tests.processPageInBackground = updateChecker.processPage;
    cd.tests.editSubscriptions = showEditSubscriptionsDialog;
    cd.tests.subscriptions = subscriptions;
    cd.tests.showSettingsDialog = showSettingsDialog;
    cd.tests.setVisits = setVisits;


    /* Some static methods for external use */

    /**
     * @see Comment.getById
     * @function getCommentById
     * @memberof convenientDiscussions.api
     */
    cd.api.getCommentById = Comment.getById;

    /**
     * @see Comment.getByDtId
     * @function getCommentByDtId
     * @memberof convenientDiscussions.api
     */
    cd.api.getCommentByDtId = Comment.getByDtId;

    /**
     * @see Section.getById
     * @function getSectionById
     * @memberof convenientDiscussions.api
     */
    cd.api.getSectionById = Section.getById;

    /**
     * @see Section.getByHeadline
     * @function getSectionsByHeadline
     * @memberof convenientDiscussions.api
     */
    cd.api.getSectionsByHeadline = Section.getByHeadline;

    /**
     * @see CommentForm.getLastActive
     * @function getLastActiveCommentForm
     * @memberof convenientDiscussions.api
     */
    cd.api.getLastActiveCommentForm = CommentForm.getLastActive;

    /**
     * @see CommentForm.getLastActiveAltered
     * @function getLastActiveAlteredCommentForm
     * @memberof convenientDiscussions.api
     */
    cd.api.getLastActiveAlteredCommentForm = CommentForm.getLastActiveAltered;

    /**
     * @see module:controller.reloadPage
     * @function reloadPage
     * @memberof convenientDiscussions.api
     */
    cd.api.reloadPage = controller.reload;

    /**
     * @see module:controller.rootElement
     * @type {Element}
     * @memberof convenientDiscussions.api
     */
    cd.api.rootElement = controller.rootElement;
  },

  /**
   * _For internal use._ Set the global object properties related to timestamp parsing.
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
       * @name CONTENT_TIMESTAMP_REGEXP
       * @type {RegExp}
       * @memberof convenientDiscussions.g
       */
      cd.g.CONTENT_TIMESTAMP_REGEXP = new RegExp(mainPartPattern + ' +' + timezonePattern);

      /**
       * Regular expression for parsing timestamps in content.
       *
       * @name PARSE_TIMESTAMP_CONTENT_REGEXP
       * @type {RegExp}
       * @memberof convenientDiscussions.g
       */
      cd.g.PARSE_TIMESTAMP_CONTENT_REGEXP = new RegExp(
        `^([^]*)(${cd.g.CONTENT_TIMESTAMP_REGEXP.source})(?!["»])`
      );

      /**
       * Regular expression for matching timestamps in content with no timezone at the end.
       *
       * @name CONTENT_TIMESTAMP_NO_TZ_REGEXP
       * @type {RegExp}
       * @memberof convenientDiscussions.g
       */
      cd.g.CONTENT_TIMESTAMP_NO_TZ_REGEXP = new RegExp(mainPartPattern);

      /**
       * Codes of date (in content language) components for the timestamp parser function.
       *
       * @name CONTENT_TIMESTAMP_MATCHING_GROUPS
       * @type {string[]}
       * @memberof convenientDiscussions.g
       */
      cd.g.CONTENT_TIMESTAMP_MATCHING_GROUPS = getMatchingGroups(cd.g.CONTENT_DATE_FORMAT);

      /**
       * Regular expression for matching timezone, with the global flag.
       *
       * @name TIMEZONE_REGEXP
       * @type {RegExp}
       * @memberof convenientDiscussions.g
       */
      cd.g.TIMEZONE_REGEXP = new RegExp(timezonePattern, 'g');
    } else {
      /**
       * Regular expression for matching timestamps in the interface with no timezone at the end.
       *
       * @name UI_TIMESTAMP_REGEXP
       * @type {RegExp}
       * @memberof convenientDiscussions.g
       */
      cd.g.UI_TIMESTAMP_REGEXP = new RegExp(getTimestampMainPartPattern('user'));

      /**
       * Regular expression for parsing timestamps in the interface.
       *
       * @name PARSE_TIMESTAMP_UI_REGEXP
       * @type {RegExp}
       * @memberof convenientDiscussions.g
       */
      cd.g.PARSE_TIMESTAMP_UI_REGEXP = new RegExp(
        new RegExp(`^([^]*)(${cd.g.UI_TIMESTAMP_REGEXP.source})`)
      );

      /**
       * Codes of date (in interface language) components for the timestamp parser function.
       *
       * @name UI_TIMESTAMP_MATCHING_GROUPS
       * @type {string[]}
       * @memberof convenientDiscussions.g
       */
      cd.g.UI_TIMESTAMP_MATCHING_GROUPS = getMatchingGroups(cd.g.UI_DATE_FORMAT);
    }

    const timezoneParts = mw.user.options.get('timecorrection')?.split('|');

    /**
     * Timezone per user preferences: standard timezone name or offset in minutes. `'UTC'` is always
     * used instead of `0`.
     *
     * @name UI_TIMEZONE
     * @type {?(string|number)}
     * @memberof convenientDiscussions.g
     */
    cd.g.UI_TIMEZONE = ((timezoneParts && timezoneParts[2]) || Number(timezoneParts[1])) ?? null;
    if (cd.g.UI_TIMEZONE === 0) {
      cd.g.UI_TIMEZONE = 'UTC';
    }

    /**
     * Timezone _offset_ in minutes per user preferences.
     *
     * @name UI_TIMEZONE_OFFSET
     * @type {?number}
     * @memberof convenientDiscussions.g
     */
    cd.g.UI_TIMEZONE_OFFSET = Number(timezoneParts[1]) ?? null;

    try {
      cd.g.ARE_UI_AND_LOCAL_TIMEZONE_SAME = (
        cd.g.UI_TIMEZONE === Intl.DateTimeFormat().resolvedOptions().timeZone
      );
    } catch {
      // Empty
    }

    if (language === 'content') {
      /**
       * Whether comment timestamps are altered somehow.
       *
       * @name ARE_TIMESTAMPS_ALTERED
       * @type {boolean|undefined}
       * @memberof convenientDiscussions.g
       */
      cd.g.ARE_TIMESTAMPS_ALTERED = (
        (settings.get('useUiTime') && cd.g.CONTENT_TIMEZONE !== cd.g.UI_TIMEZONE) ||
        settings.get('timestampFormat') !== 'default' ||
        mw.config.get('wgContentLanguage') !== cd.g.USER_LANGUAGE ||
        settings.get('hideTimezone')
      );
    }
  },

  /**
   * _For internal use._ Assign various global objects' (`convenientDiscussions`, `$`) properties
   * and methods that are needed for processing a talk page. Executed on the first run.
   */
  async talkPage() {
    await Promise.all(this.getSiteData());
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
     * @type {CommentForm[]}
     * @memberof convenientDiscussions
     */
    cd.commentForms = [];
  },
};
