/**
 * Initialization, page loading, reloading, and session-related functions.
 *
 * @module boot
 */

import Comment from './Comment';
import CommentForm from './CommentForm';
import LiveTimestamp from './LiveTimestamp';
import Page from './Page';
import Section from './Section';
import Worker from './worker-gate';
import cd from './cd';
import jqueryExtensions from './jqueryExtensions';
import navPanel from './navPanel';
import processPage from './processPage';
import toc from './toc';
import updateChecker from './updateChecker';
import userRegistry from './userRegistry';
import {
  addCss,
  areObjectsEqual,
  calculateWordOverlap,
  firstCharToUpperCase,
  generatePageNamePattern,
  getFromLocalStorage,
  handleApiReject,
  hideText,
  mergeRegexps,
  restoreScrollPosition,
  saveScrollPosition,
  saveToLocalStorage,
  skin$,
  transparentize,
  underlinesToSpaces,
  unhideText,
  wrap,
} from './util';
import { createWindowManager, showConfirmDialog } from './ooui';
import { editWatchedSections, rescueCommentFormsContent, showSettingsDialog } from './modal';
import { formatDateNative, initDayjs, initTimestampParsingTools } from './timestamp';
import { getLocalOverridingSettings, getSettings, setSettings, setVisits } from './options';
import { getUserInfo } from './apiWrappers';
import { loadSiteData } from './siteData';
import { removeWikiMarkup } from './wikitext';

let notificationsData = [];
let saveSessionTimeout;
let saveSessionLastTime;

/**
 * Settings scheme: default, undocumented, local settings, aliases.
 */
export const settingsScheme = {
  // Settings set for the current wiki only.
  local: ['haveInsertButtonsBeenAltered', 'insertButtons', 'signaturePrefix'],

  // Settings not shown in the settings dialog.
  undocumented: [
    'defaultCommentLinkType',
    'defaultSectionLinkType',
    'showLoadingOverlay',
  ],

  // Aliases for seamless transition when changing a setting name.
  aliases: {
    allowEditOthersComments: ['allowEditOthersMsgs'],
    alwaysExpandAdvanced: ['alwaysExpandSettings'],
    haveInsertButtonsBeenAltered: ['areInsertButtonsAltered', 'insertButtonsChanged'],
    desktopNotifications: ['browserNotifications'],
    signaturePrefix: ['mySig', 'mySignature'],
  }
};

/**
 * _For internal use._ Initiate user settings.
 */
export async function initSettings() {
  // We fill the settings after the modules are loaded so that the settings set via common.js had
  // less chance not to load.

  settingsScheme.default = {
    allowEditOthersComments: false,
    alwaysExpandAdvanced: false,

    // If the user has never changed the insert buttons configuration, it should change with the
    // default configuration change.
    haveInsertButtonsBeenAltered: false,

    // The order should coincide with the order of checkboxes in
    // `SettingsDialog#autocompleteTypesMultiselect` in modal.js - otherwise the "Save" and "Reset"
    // buttons in the settings dialog won't work properly.
    autocompleteTypes: ['mentions', 'commentLinks', 'wikilinks', 'templates', 'tags'],

    autopreview: true,
    desktopNotifications: 'unknown',
    defaultCommentLinkType: null,
    defaultSectionLinkType: null,
    enableThreads: true,
    hideTimezone: false,
    insertButtons: cd.config.defaultInsertButtons || [],
    notifications: 'all',
    notifyCollapsedThreads: false,
    notificationsBlacklist: [],
    reformatComments: null,
    showContribsLink: false,
    showLoadingOverlay: true,
    showToolbar: true,
    signaturePrefix: cd.config.defaultSignaturePrefix,
    timestampFormat: 'default',
    modifyToc: true,
    useBackgroundHighlighting: true,
    useTemplateData: true,
    useUiTime: true,
    watchOnReply: true,
    watchSectionOnReply: true,
  };

  /**
   * Script settings of the current user.
   *
   * @name settings
   * @type {object}
   * @memberof convenientDiscussions
   */
  cd.settings = cd.settings || {};

  const options = {
    [cd.g.SETTINGS_OPTION_NAME]: mw.user.options.get(cd.g.SETTINGS_OPTION_NAME),
    [cd.g.LOCAL_SETTINGS_OPTION_NAME]: mw.user.options.get(cd.g.LOCAL_SETTINGS_OPTION_NAME),
  };

  // Settings in variables like "cdAlowEditOthersComments" used before server-stored settings
  // were implemented.
  Object.keys(settingsScheme.default).forEach((name) => {
    (settingsScheme.aliases[name] || []).concat(name).forEach((alias) => {
      const varAlias = 'cd' + firstCharToUpperCase(alias);
      if (
        varAlias in window &&
        (
          typeof window[varAlias] === typeof settingsScheme.default[name] ||
          settingsScheme.default[name] === null
        )
      ) {
        cd.settings[name] = window[varAlias];
      }
    });
  });

  const remoteSettings = await getSettings({
    options,
    omitLocal: true,
  });
  Object.keys(remoteSettings).forEach((name) => {
    if (!settingsScheme.undocumented.includes(name)) {
      cd.settings[name] = remoteSettings[name];
    }
  });

  // Seamless transition from "mySignature". TODO: remove at some point.
  if (cd.settings.signaturePrefix !== undefined) {
    cd.settings.signaturePrefix = cd.settings.signaturePrefix.replace(cd.g.SIGN_CODE, '');
  }

  if (
    !cd.settings.haveInsertButtonsBeenAltered &&
    JSON.stringify(cd.settings.insertButtons) !== JSON.stringify(cd.config.defaultInsertButtons)
  ) {
    cd.settings.insertButtons = cd.config.defaultInsertButtons;
  }

  cd.settings = Object.assign({}, settingsScheme.default, cd.settings);

  if (!areObjectsEqual(cd.settings, remoteSettings)) {
    setSettings().catch((e) => {
      console.warn('Couldn\'t save the settings to the server.', e);
    });
  }

  // Settings in variables like "cdLocal..." override all other and are not saved to the server.
  Object.assign(cd.settings, getLocalOverridingSettings());
}

/**
 * _For internal use._ Assign the properties related to `convenientDiscussions.g.$contentColumn`.
 *
 * @param {boolean} setCssVar Whether to set the `--cd-content-start-margin` CSS variable.
 */
export function setContentColumnGlobals(setCssVar) {
  const prop = cd.g.CONTENT_DIR === 'ltr' ? 'padding-left' : 'padding-right';
  cd.g.CONTENT_START_MARGIN = parseFloat(cd.g.$contentColumn.css(prop));
  if (cd.g.CONTENT_START_MARGIN < cd.g.CONTENT_FONT_SIZE) {
    cd.g.CONTENT_START_MARGIN = cd.g.CONTENT_FONT_SIZE;
  }

  // The content column in Timeless has no _borders_ as such, so it's wrong to penetrate the
  // surrounding area from the design point of view.
  if (cd.g.SKIN === 'timeless') {
    cd.g.CONTENT_START_MARGIN--;
  }

  if (setCssVar) {
    $(document.documentElement).css('--cd-content-start-margin', cd.g.CONTENT_START_MARGIN + 'px');
  }

  const left = cd.g.$contentColumn.offset().left;
  const width = cd.g.$contentColumn.outerWidth();
  cd.g.CONTENT_COLUMN_START = cd.g.CONTENT_DIR === 'ltr' ? left : left + width;
  cd.g.CONTENT_COLUMN_END = cd.g.CONTENT_DIR === 'ltr' ? left + width : left;
}

/**
 * _For internal use._ Assign some important skin-specific values to the properties of the global
 * object.
 */
export function memorizeCssValues() {
  cd.g.CONTENT_LINE_HEIGHT = parseFloat(cd.g.$content.css('line-height'));
  cd.g.CONTENT_FONT_SIZE = parseFloat(cd.g.$content.css('font-size'));

  // For the Timeless skin
  cd.g.BODY_SCROLL_PADDING_TOP = parseFloat($(document.body).css('scroll-padding-top')) || 0;

  setContentColumnGlobals();
}

/**
 * _For internal use._ Set CSS for talk pages.
 */
export function setTalkPageCssVariables() {
  const contentBackgroundColor = $('#content').css('background-color') || '#fff';

  const $backgrounded = skin$({
    timeless: '#mw-content-container',
    vector: '.mw-page-container',
    default: 'body',
  });
  const sidebarColor = $backgrounded.css('background-color');

  addCss(`:root {
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
  --cd-content-start-margin: ${cd.g.CONTENT_START_MARGIN}px;
  --cd-content-font-size: ${cd.g.CONTENT_FONT_SIZE}px;
  --cd-sidebar-color: ${sidebarColor};
  --cd-sidebar-transparent-color: ${transparentize(sidebarColor)};
}`);
}

/**
 * _For internal use._ Set a
 * {@link https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.Api mw.Api} instance to
 * `convenientDiscussions.g.api` if it's not already set.
 */
export function createApi() {
  cd.g.mwApi = cd.g.mwApi || new mw.Api({
    ajax: {
      // 60 seconds instead of default 30
      timeout: 60 * 1000,

      headers: {
        'Api-User-Agent': 'c:User:Jack who built the house/Convenient Discussions',
      },
    },
  });
}

/**
 * Initialize a number of the global object properties.
 *
 * @private
 */
function initGlobals() {
  cd.g.PHP_CHAR_TO_UPPER_JSON = mw.loader.moduleRegistry['mediawiki.Title'].script
    .files['phpCharToUpper.json'];

  /**
   * Current page's object.
   *
   * @name page
   * @type {Page}
   * @memberof convenientDiscussions
   */
  cd.page = new Page(cd.g.PAGE_NAME, false);

  // TODO: Delete after all addons are updated.
  cd.g.PAGE = cd.page;

  /**
   * Current user's object.
   *
   * @name user
   * @type {module:userRegistry~User}
   * @memberof convenientDiscussions
   */
  cd.user = userRegistry.getUser(cd.g.USER_NAME);

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

  cd.g.isIPv6Address = mw.util.isIPv6Address;
  cd.g.notificationArea = document.querySelector('.mw-notification-area');

  cd.state.dontHandleScroll = false;
  cd.state.isAutoScrollInProgress = false;
  cd.state.isPageBeingReloaded = false;
  cd.state.hasPageBeenReloaded = false;

  // Useful for debugging
  cd.g.processPageInBackground = updateChecker.processPage;
  cd.g.editWatchedSections = editWatchedSections;
  cd.g.showSettingsDialog = showSettingsDialog;
  cd.g.setVisits = setVisits;


  /* Some static methods for external use */

  /**
   * @see Comment.getByAnchor
   * @function getCommentByAnchor
   * @memberof convenientDiscussions.api
   */
  cd.api.getCommentByAnchor = Comment.getByAnchor;

  /**
   * @see Section.getByAnchor
   * @function getSectionByAnchor
   * @memberof convenientDiscussions.api
   */
  cd.api.getSectionByAnchor = Section.getByAnchor;

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
   * @see module:boot.reloadPage
   * @function reloadPage
   * @memberof convenientDiscussions.api
   */
  cd.api.reloadPage = reloadPage;
}

/**
 * Generate regexps, patterns (strings to be parts of regexps), selectors from config values.
 *
 * @private
 */
function initPatterns() {
  // Fix configuration values in wrong format
  cd.config.customTalkNamespaces = cd.config.customTalkNamespaces || [];

  const signatureEndingRegexpLastChar = cd.config.signatureEndingRegexp?.source?.slice(-1);
  if (signatureEndingRegexpLastChar && signatureEndingRegexpLastChar !== '$') {
    cd.config.signatureEndingRegexp = new RegExp(cd.config.signatureEndingRegexp.source + '$');
  }

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

  cd.g.USER_SIGNATURE = cd.settings.signaturePrefix + cd.g.SIGN_CODE;

  const signatureContent = mw.user.options.get('nickname');
  const captureUserNameRegexp = new RegExp(cd.g.CAPTURE_USER_NAME_PATTERN, 'i');
  const authorInSignatureMatch = signatureContent.match(captureUserNameRegexp);
  if (authorInSignatureMatch) {
    // Extract signature contents before the user name - in order to cut it out from comment endings
    // when editing.
    const signaturePrefixPattern = cd.settings.signaturePrefix === ' ' ?
      '[ \n]' :
      mw.util.escapeRegExp(cd.settings.signaturePrefix);
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
  // templates (see the "markerLength" parameter in wikitext.hideTemplatesRecursively) and tags? But
  // keep in mind that this code may still be part of comments.
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

  // Worker's location object doesn't have the host name set.
  cd.g.HOSTNAME = location.hostname;

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

  const outdentTemplatesPattern = cd.config.outdentTemplates.map(generatePageNamePattern).join('|');
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
      let archiveRegexp = new RegExp(entry.source + '.*');
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
 * Initialize OOUI and comment layers-related objects.
 *
 * @private
 */
function initOouiAndElementPrototypes() {
  createWindowManager();

  // OOUI button prototypes. Creating every button using the constructor takes 15 times longer than
  // cloning which is critical when creating really many of them.

  let commentElementPrototypes = {};

  const separator = document.createElement('span');
  separator.innerHTML = cd.sParse('dot-separator');
  commentElementPrototypes.separator = separator;

  // true, null
  if (cd.settings.reformatComments !== false) {
    const headerElement = document.createElement('div');
    headerElement.className = 'cd-comment-header';

    const authorWrapper = document.createElement('span');
    authorWrapper.className = 'cd-comment-author-wrapper';
    headerElement.appendChild(authorWrapper);

    const authorLink = document.createElement('a');
    authorLink.className = 'cd-comment-author mw-userlink';
    authorWrapper.appendChild(authorLink);

    const bdiElement = document.createElement('bdi');
    authorLink.appendChild(bdiElement);

    const parenthesesStart = document.createTextNode(' ' + cd.mws('parentheses-start'));
    const parenthesesEnd = document.createTextNode(cd.mws('parentheses-end'));

    const authorTalkLink = document.createElement('a');
    authorTalkLink.textContent = cd.s('comment-author-talk');
    authorWrapper.appendChild(parenthesesStart);
    authorWrapper.appendChild(authorTalkLink);

    if (cd.settings.showContribsLink) {
      const contribsLink = document.createElement('a');
      contribsLink.textContent = cd.s('comment-author-contribs');
      const separator = commentElementPrototypes.separator.cloneNode(true);
      authorWrapper.appendChild(separator);
      authorWrapper.appendChild(contribsLink);
    }

    authorWrapper.appendChild(parenthesesEnd);

    commentElementPrototypes.headerElement = headerElement;
  }

  if (cd.settings.reformatComments !== true) {
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
    commentElementPrototypes.editButton = commentElementPrototypes.getEditButton().$element.get(0);

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
    commentElementPrototypes.copyLinkButton = commentElementPrototypes.getCopyLinkButton().$element
      .get(0);

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

  if (!cd.settings.reformatComments) {
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
  cd.g.COMMENT_ELEMENT_PROTOTYPES = commentElementPrototypes;

  let sectionElementPrototypes = {};
  sectionElementPrototypes.replyButton = new OO.ui.ButtonWidget({
    label: cd.s('section-reply'),
    framed: false,

    // Add the thread button class as it behaves as a thread button in fact, being positioned inside
    // a "cd-commentLevel" list.
    classes: ['cd-button-ooui', 'cd-section-button', 'cd-thread-button'],
  }).$element.get(0);

  sectionElementPrototypes.addSubsectionButton = new OO.ui.ButtonWidget({
    // Will be replaced
    label: ' ',

    framed: false,
    classes: ['cd-button-ooui', 'cd-section-button'],
  }).$element.get(0);
  cd.g.SECTION_ELEMENT_PROTOTYPES = sectionElementPrototypes;

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
  threadClickArea.title = cd.s('thread-tooltip');
  const line = document.createElement('div');
  line.className = 'cd-thread-line';
  threadClickArea.appendChild(line);
  threadElementPrototypes.clickArea = threadClickArea;
  cd.g.THREAD_ELEMENT_PROTOTYPES = threadElementPrototypes;
}

/**
 * _For internal use._ Create various global objects' (`convenientDiscussions`, `$`)
 * properties and methods. Executed on the first run.
 *
 * @param {Promise[]} siteDataRequests Array of requests returned by
 *   {@link module:siteData.loadSiteData}.
 */
export async function init(siteDataRequests) {
  cd.g.worker = new Worker();
  createApi();
  await Promise.all(siteDataRequests.length ? siteDataRequests : loadSiteData());
  initGlobals();
  await initSettings();
  initTimestampParsingTools('content');
  initPatterns();
  initOouiAndElementPrototypes();
  if (cd.settings.useBackgroundHighlighting) {
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
}

/**
 * Get anchors of unseen comments. This is used to arrange that they will still be there after
 * replying on or refreshing the page.
 *
 * @returns {string[]}
 * @private
 */
function getUnseenCommentAnchors() {
  return cd.comments
    .filter((comment) => comment.isSeen === false)
    .map((comment) => comment.anchor);
}

/**
 * Replace the inner HTML of the content element and run the parse routine.
 *
 * @param {object} passedData
 * @private
 */
async function updatePageContent(passedData) {
  cd.debug.stopTimer('getting HTML');

  // We could say "let it crash", but, well, unforeseen errors in processPage() are just too likely
  // to go without a safeguard.
  try {
    await processPage(passedData);

    mw.hook('wikipage.content').fire(cd.g.$content);
  } catch (e) {
    mw.notify(cd.s('error-processpage'), { type: 'error' });
    console.error(e);
    finishLoading();
  }
}

let $loadingPopup;

/**
 * Check if the `showLoadingOverlay` setting is off. We create a separate function for this because
 * this check has to be performed before the settings object is filled.
 *
 * @returns {boolean}
 * @private
 */
function isShowLoadingOverlaySettingOff() {
  return (
    (cd.settings && cd.settings.showLoadingOverlay === false) ||
    (
      !cd.settings &&
      window.cdShowLoadingOverlay !== undefined &&
      window.cdShowLoadingOverlay === false
    )
  );
}

/**
 * _For internal use._ Set the loading overlay and assign `true` to
 * `convenientDiscussions.state.isFirstRun` and `convenientDiscussions.state.isPageBeingReloaded`.
 *
 * @param {boolean} [isReload=false] Whether the page is reloaded, not loaded the first time.
 */
export function startLoading(isReload = false) {
  if (isReload) {
    /**
     * Is the page being reloaded now.
     *
     * @name isPageBeingReloaded
     * @type {boolean}
     * @memberof convenientDiscussions.state
     */
    cd.state.isPageBeingReloaded = true;
  } else {
    /**
     * Is the page processed for the first time after it was loaded (i.e., not reloaded using the
     * script's refresh functionality).
     *
     * @name isFirstRun
     * @type {boolean}
     * @memberof convenientDiscussions.state
     */
    cd.state.isFirstRun = true;
  }

  if (isShowLoadingOverlaySettingOff()) return;
  if (!$loadingPopup) {
    $loadingPopup = $('<div>').addClass('cd-loadingPopup');
    const $logo = $('<div>')
      .addClass('cd-loadingPopup-logo')
      .appendTo($loadingPopup);
    $('<div>')
      .addClass('cd-loadingPopup-logo-partBackground')
      .appendTo($logo);
    $('<img>')
      .attr('src', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADcAAAA3CAYAAACo29JGAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAewQAAHsEBw2lUUwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAK7SURBVGiB3Zq/axRBFMc/60VioQgW1yjEiwa0tdXiCkH9AwLaKCLY+Aek9CxUbGw9/wMbrYQgCIrEpEgUAimNmCAqapWAGL2wFrPr7R374739kZ3ZL7ziuHlv3mdndufN7MJQHaAPbAIDwK/ZBkEufeA4BXQB2LIAKMm2ghzV6lgOFgXsaOEeW5C41PpauE0LkpbahgbMw9y4LY1TjdoFJqSNPcwVcUmetOE+ZeA/wAqwhBnxvPoBvAY+FoghknS+vwNORPymgVWFf2h3gf1BDA+4Buwo/EuH+x3AjGsG+KtI7HlCDvfqhFtK8V9RJHY9IcaZKuCk99xOyn+aDtPiaNVlCJxYqkmn5bGYDk6iq0OfJSR6XxEjDi5qI6WaNOgyMBUJnveB0mN0rbqK7r7NggsBOxq4cAQXgQWK7Ry+Ai+BDzl8JXA+QamWN8G6TAq3oV3EXdLRJsO1pEXoe2C9ykyAi8ChsoNK5vmLsjsd02lMxV/mPecjDOgDZ6tj46kij1BdSVtp0E/AkQrAbipyqAzOB9YYXciL6gZmG2UFnA/8BG4x3Lbk0TS6qbhncKF9Ax4Cl4DDGTAecAozUvMUq27EcGUeM3wHvmBG1g+AJoE2ZiofKKmf8JihC7xKayg+bBGoHZg1cq1C2dU0dg3us6axa3DzmsYuwW0DDyK/J7McXIHbBmYxVVKoGYlj3vWmahtg3g08Iv793BtBDHFnPcmV2iNdQbjguwj2C0HekkX8DkO482VnKtQE5ij/MnBO45hGf1vR1kYTgzUGrhcDBnZ85VAILgkMzKO57oRzw6WBgTnFrTvhXHBZYGAWUxc+6xiBk4CFsv2DnP/WwuxsNXDrwBPMzroNHMSdGtV6zaGYli5KCuisJIBOKwvQeaUBNkJJgI1RHGCjNA7YOEUBG6k5gvKriXoLeP8AAFe0oEsY7eMAAAAASUVORK5CYII=')
      .appendTo($logo);
    $(document.body).append($loadingPopup);
  } else {
    $loadingPopup.show();
  }
}

/**
 * _For internal use._ Remove the loading overlay and update some state properties of the global
 * object.
 *
 * @param {boolean} [updatePageState=true] Update the state properties of the global object.
 */
export function finishLoading(updatePageState = true) {
  if (updatePageState) {
    cd.state.isFirstRun = false;
    cd.state.isPageFirstParsed = false;
    cd.state.isPageBeingReloaded = false;
  }

  if (!$loadingPopup || isShowLoadingOverlaySettingOff()) return;
  $loadingPopup.hide();
}

/**
 * Is the page loading (the loading overlay is on).
 *
 * @returns {boolean}
 */
export function isPageLoading() {
  return cd.state.isFirstRun || cd.state.isPageBeingReloaded;
}

/**
 * Is the displayed revision the current (last known) revision of the page.
 *
 * @returns {boolean}
 */
export function isCurrentRevision() {
  return mw.config.get('wgRevisionId') === mw.config.get('wgCurRevisionId');
}

/**
 * Remove fragment and revision parameters, clear elements related to the diff.
 *
 * @param {import('./commonTypedefs').PassedData} passedData
 * @private
 */
function cleanUpUrlAndDom(passedData) {
  const uri = new mw.Uri();
  const query = uri.query;
  if ((uri.fragment || query.diff || query.oldid) && !passedData.isPageReloadedExternally) {
    // Added automatically (after /wiki/ if possible, as a query parameter otherwise).
    delete query.title;

    delete query.curid;
    if (query.diff || query.oldid) {
      delete query.diff;
      delete query.diffmode;
      delete query.oldid;

      // Diff pages
      cd.g.$content
        .children('.mw-revslider-container, .ve-init-mw-diffPage-diffMode, .diff, .oo-ui-element-hidden, .diff-hr, .diff-currentversion-title')
        .remove();

      // Revision navigation
      $('.mw-revision').remove();

      $('#firstHeading').text(cd.page.name);
    }
    history.replaceState(history.state, '', cd.page.getUrl(query));
  }
}

/**
 * Reload the page via Ajax.
 *
 * @param {import('./commonTypedefs').PassedData} [passedData={}] Data passed from the previous page
 *   state. See {@link module:commonTypedefs~PassedData} for the list of possible properties.
 *   `html`, `unseenCommentAnchors` properties are set in this function.
 * @throws {CdError|Error}
 */
export async function reloadPage(passedData = {}) {
  if (cd.state.isPageBeingReloaded) return;

  // We shouldn't make the current version of the page dysfunctional at least until a correct
  // response to the parse request is received. Otherwise, if the request fails, the user will be
  // left with a dysfunctional page. This is why we reset the live timestamps only after that
  // request.

  // Stop all animations, clear all timeouts.
  cd.comments.forEach((comment) => {
    comment.$animatedBackground?.add(comment.$marker).stop(true, true);
  });

  // If the page is reloaded externally, its content is already replaced, so we won't break anything
  // is we remove the layers containers. And we better do so to avoid comment layers hanging around
  // without their owner comments.
  if (passedData.isPageReloadedExternally) {
    Comment.resetLayers();
  }

  // A check in light of the existence of RevisionSlider.
  if (isCurrentRevision()) {
    // In case checkboxes were changed programmatically.
    saveSession();
  }

  if (!passedData.commentAnchor && !passedData.sectionAnchor) {
    saveScrollPosition();
  }

  closeNotifications(passedData.closeNotificationsSmoothly ?? true);

  cd.debug.init();
  cd.debug.startTimer('total time');
  cd.debug.startTimer('getting HTML');

  startLoading(true);

  // Save time by requesting the options in advance.
  getUserInfo().catch((e) => {
    console.warn(e);
  });

  if (!passedData.isPageReloadedExternally) {
    let parseData;
    try {
      parseData = await cd.page.parse(null, false, true);
    } catch (e) {
      finishLoading();
      if (passedData.wasCommentFormSubmitted) {
        throw e;
      } else {
        mw.notify(cd.s('error-reloadpage'), { type: 'error' });
        console.warn(e);
        return;
      }
    }

    passedData.html = parseData.text;
    mw.config.set({
      wgRevisionId: parseData.revid,
      wgCurRevisionId: parseData.revid,
    });
    mw.loader.load(parseData.modules);
    mw.loader.load(parseData.modulestyles);
    mw.config.set(parseData.jsconfigvars);
  }

  LiveTimestamp.reset();

  // Detach comment forms to keep events.
  cd.commentForms.forEach((commentForm) => {
    commentForm.$outermostElement.detach();
  });

  passedData.unseenCommentAnchors = getUnseenCommentAnchors();

  cleanUpUrlAndDom(passedData);

  cd.state.hasPageBeenReloaded = true;

  updateChecker.updatePageTitle(0, false);
  await updatePageContent(passedData);

  toc.possiblyHide();

  if (!passedData.commentAnchor && !passedData.sectionAnchor) {
    restoreScrollPosition(false);
  }
}

/**
 * _For internal use._ Handle firings of the hook `'wikipage.content'` (by using
 * `mw.hook('wikipage.content').fire()`).
 *
 * @param {external:jQuery} $content
 */
export function handleWikipageContentHookFirings($content) {
  if ($content.is('#mw-content-text')) {
    const $root = $content.children('.mw-parser-output');
    if ($root.length && !$root.data('cd-parsed')) {
      reloadPage({ isPageReloadedExternally: true });
    }
  }
}

/**
 * Remove sessions older than 60 days.
 *
 * @param {object[]} data
 * @returns {object}
 * @private
 */
function cleanUpSessions(data) {
  const newData = Object.assign({}, data);
  const interval = 60 * cd.g.SECONDS_IN_DAY * 1000;
  Object.keys(newData).forEach((key) => {
    if (!newData[key].commentForms?.length || newData[key].saveUnixTime < Date.now() - interval) {
      delete newData[key];
    }
  });
  return newData;
}

/**
 * _For internal use._ Save comment form data to the local storage. (Session storage doesn't allow
 * to restore when the browser has crashed.)
 *
 * @param {boolean} [force=true] Save session immediately, without regard for save frequency.
 */
export function saveSession(force) {
  const save = () => {
    const commentForms = cd.commentForms
      .filter((commentForm) => commentForm.isAltered())
      .map((commentForm) => {
        let targetData;
        const target = commentForm.target;
        if (commentForm.target instanceof Comment) {
          targetData = { anchor: target.anchor };
        } else if (target instanceof Section) {
          targetData = {
            headline: target.headline,
            oldestCommentAnchor: target.oldestComment?.anchor,
            id: target.id,
            anchor: target.anchor,
            ancestors: target.getAncestors().map((section) => section.headline),
          };
        }
        return {
          mode: commentForm.mode,
          targetData,
          preloadConfig: commentForm.preloadConfig,
          isNewTopicOnTop: commentForm.isNewTopicOnTop,
          headline: commentForm.headlineInput?.getValue(),
          comment: commentForm.commentInput.getValue(),
          summary: commentForm.summaryInput.getValue(),
          minor: commentForm.minorCheckbox?.isSelected(),
          watch: commentForm.watchCheckbox?.isSelected(),
          watchSection: commentForm.watchSectionCheckbox?.isSelected(),
          omitSignature: commentForm.omitSignatureCheckbox?.isSelected(),
          delete: commentForm.deleteCheckbox?.isSelected(),
          originalHeadline: commentForm.originalHeadline,
          originalComment: commentForm.originalComment,
          isSummaryAltered: commentForm.isSummaryAltered,
          lastFocused: commentForm.lastFocused,
        };
      });
    const saveUnixTime = Date.now();
    const data = commentForms.length ? { commentForms, saveUnixTime } : {};

    const dataAllPages = getFromLocalStorage('commentForms');
    dataAllPages[mw.config.get('wgPageName')] = data;
    saveToLocalStorage('commentForms', dataAllPages);

    saveSessionLastTime = Date.now();
  };

  const timeSinceLastSave = Date.now() - (saveSessionLastTime || 0);
  clearTimeout(saveSessionTimeout);
  if (force) {
    save();
  } else {
    saveSessionTimeout = setTimeout(save, Math.max(0, 5000 - timeSinceLastSave));
  }
}

/**
 * Restore comment forms using the data saved in the local storage.
 *
 * @param {object} commentFormsData
 * @private
 */
function restoreCommentFormsFromData(commentFormsData) {
  let haveRestored = false;
  const rescue = [];
  commentFormsData.commentForms.forEach((data) => {
    const prop = CommentForm.modeToProperty(data.mode);
    if (data.targetData?.headline) {
      const section = Section.search({
        headline: data.targetData.headline,
        oldestCommentAnchor: data.targetData.oldestCommentAnchor,
        id: data.targetData.id,
        anchor: data.targetData.anchor,
        ancestors: data.targetData.ancestors,
      });
      if (section?.isActionable && !section[`${prop}Form`]) {
        try {
          section[prop](data);
          haveRestored = true;
        } catch (e) {
          console.warn(e);
          rescue.push(data);
        }
      } else {
        rescue.push(data);
      }
    } else if (data.targetData?.anchor) {
      const comment = Comment.getByAnchor(data.targetData.anchor);
      if (comment?.isActionable && !comment[`${prop}Form`]) {
        try {
          comment[prop](data);
          haveRestored = true;
        } catch (e) {
          console.warn(e);
          rescue.push(data);
        }
      } else {
        rescue.push(data);
      }
    } else if (data.mode === 'addSection') {
      if (!cd.g.addSectionForm) {
        cd.g.addSectionForm = new CommentForm({
          target: cd.page,
          mode: data.mode,
          dataToRestore: data,
          preloadConfig: data.preloadConfig,
          isNewTopicOnTop: data.isNewTopicOnTop,
        });
        haveRestored = true;
      } else {
        rescue.push(data);
      }
    }
  });
  if (haveRestored) {
    const notification = mw.notification.notify(cd.s('restore-restored-text'), {
      title: cd.s('restore-restored-title'),
    });
    notification.$notification.on('click', () => {
      navPanel.goToNextCommentForm(true);
    });
  }
  if (rescue.length) {
    rescueCommentFormsContent(rescue);
  }
}

/**
 * _For internal use._ Return saved comment forms to their places.
 *
 * @param {boolean} isPageReloadedExternally Is the page reloaded due to a `'wikipage.content`
 *   firing.
 */
export function restoreCommentForms(isPageReloadedExternally) {
  if (cd.state.isFirstRun || isPageReloadedExternally) {
    // This is needed when the page is reloaded externally.
    cd.commentForms = [];

    const dataAllPages = cleanUpSessions(getFromLocalStorage('commentForms'));
    saveToLocalStorage('commentForms', dataAllPages);
    const data = dataAllPages[mw.config.get('wgPageName')] || {};
    if (data.commentForms) {
      restoreCommentFormsFromData(data);
    }
  } else {
    const rescue = [];
    const addToRescue = (commentForm) => {
      rescue.push({
        headline: commentForm.headlineInput?.getValue(),
        comment: commentForm.commentInput.getValue(),
        summary: commentForm.summaryInput.getValue(),
      });
      cd.commentForms.splice(cd.commentForms.indexOf(commentForm), 1);
    };

    cd.commentForms.forEach((commentForm) => {
      commentForm.checkCodeRequest = null;
      const target = commentForm.target;
      if (target instanceof Comment) {
        if (target.anchor) {
          const comment = Comment.getByAnchor(target.anchor);
          if (comment?.isActionable) {
            try {
              commentForm.setTargets(comment);
              comment[CommentForm.modeToProperty(commentForm.mode)](commentForm);
              commentForm.addToPage();
            } catch (e) {
              console.warn(e);
              addToRescue(commentForm);
            }
          } else {
            addToRescue(commentForm);
          }
        } else {
          addToRescue(commentForm);
        }
      } else if (target instanceof Section) {
        const section = Section.search({
          headline: target.headline,
          oldestCommentAnchor: target.oldestComment?.anchor,
          id: target.id,
          anchor: target.anchor,

          // We cache ancestors when saving the session, so this call will return the right value,
          // despite cd.sections has already changed.
          ancestors: target.getAncestors().map((section) => section.headline),
        });
        if (section?.isActionable) {
          try {
            commentForm.setTargets(section);
            section[CommentForm.modeToProperty(commentForm.mode)](commentForm);
            commentForm.addToPage();
          } catch (e) {
            console.warn(e);
            addToRescue(commentForm);
          }
        } else {
          addToRescue(commentForm);
        }
      } else if (commentForm.mode === 'addSection') {
        commentForm.addToPage();
        cd.g.addSectionForm = commentForm;
      }
    });
    if (rescue.length) {
      rescueCommentFormsContent(rescue);
    }
  }
  saveSession();
  navPanel.updateCommentFormButton();
}

/**
 * Notification object created by running `mw.notification.notify(...)`.
 *
 * @typedef {object} Notification
 * @see https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.Notification_
 * @global
 */

/**
 * Show a notificaition and add it to the registry. This is used to be able to keep track of shown
 * notifications and close them all at once if needed.
 *
 * @param {Array} params Parameters to apply to `mw.notification.notify`.
 * @param {object} [data={}] Additional data related to the notification.
 * @returns {Notification}
 */
export function addNotification(params, data = {}) {
  const notification = mw.notification.notify(...params);
  notificationsData.push(Object.assign(data, { notification }));
  return notification;
}

/**
 * Get all notifications added to the registry (including already hidden). The
 * {@link https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.Notification_ mw.Notification}
 * object will be in the `notification` property.
 *
 * @returns {object[]}
 */
export function getNotifications() {
  return notificationsData;
}

/**
 * Close all notifications added to the registry immediately.
 *
 * @param {boolean} [smooth=true] Use a smooth animation.
 */
export function closeNotifications(smooth = true) {
  notificationsData.forEach((data) => {
    if (!smooth) {
      data.notification.$notification.hide();
    }
    data.notification.close();
  });
  notificationsData = [];
}

/**
 * _For internal use._ Show a popup asking the user if they want to enable the new comment
 * formatting. Save the settings after they make the choice.
 *
 * @returns {Promise.<boolean>} Did the user enable comment reformatting.
 */
export async function suggestEnableCommentReformatting() {
  if (cd.settings.reformatComments === null) {
    const settings = await getSettings({ reuse: true });
    if ([null, undefined].includes(settings.reformatComments)) {
      const actions = [
        {
          label: cd.s('rc-suggestion-yes'),
          action: 'accept',
          flags: 'primary',
        },
        {
          label: cd.s('rc-suggestion-no'),
          action: 'reject',
        },
      ];
      const $body = $('<div>');
      const $imgOld = $('<img>')
        .attr('width', 626)
        .attr('height', 67)
        .attr('src', '//upload.wikimedia.org/wikipedia/commons/0/08/Convenient_Discussions_comment_-_old_format.png')
        .addClass('cd-rc-img');
      const $arrow = $('<img>')
        .attr('width', 30)
        .attr('height', 30)
        .attr('src', "data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M16.58 8.59L11 14.17L11 2L9 2L9 14.17L3.41 8.59L2 10L10 18L18 10L16.58 8.59Z' fill='black'/%3E%3C/svg%3E")
        .addClass('cd-rc-img cd-rc-arrow');
      const $imgNew = $('<img>')
        .attr('width', 626)
        .attr('height', 118)
        .attr('src', '//upload.wikimedia.org/wikipedia/commons/d/da/Convenient_Discussions_comment_-_new_format.png')
        .addClass('cd-rc-img');
      const $div = $('<div>')
        .addClass('cd-rc-text')
        .html(cd.sParse('rc-suggestion'));
      $body.append($imgOld, $arrow, $imgNew, $div);
      const action = await showConfirmDialog($body, {
        size: 'large',
        actions,
      });
      let promise;
      if (action === 'accept') {
        cd.settings.reformatComments = settings.reformatComments = true;
        promise = setSettings(settings);
      } else if (action === 'reject') {
        cd.settings.reformatComments = settings.reformatComments = false;
        promise = setSettings(settings);
      }
      if (promise) {
        try {
          await promise;
          return settings.reformatComments;
        } catch (e) {
          mw.notify(cd.s('error-settings-save'), { type: 'error' })
          console.warn(e);
        }
      }
    }
  }

  return false;
}

/**
 * _For internal use._ Show a popup asking the user if they want to receive desktop notifications,
 * or ask for a permission if it has not been granted but the user has desktop notifications enabled
 * (for example, if they are using a browser different from where they have previously used). Save
 * the settings after they make the choice.
 */
export async function confirmDesktopNotifications() {
  if (typeof Notification === 'undefined') return;

  if (cd.settings.desktopNotifications === 'unknown' && Notification.permission !== 'denied') {
    // Avoid using the setting kept in `mw.user.options`, as it may be outdated.
    const settings = getSettings({ reuse: true });
    if (['unknown', undefined].includes(settings.reformatComments)) {
      const actions = [
        {
          label: cd.s('dn-confirm-yes'),
          action: 'accept',
          flags: 'primary',
        },
        {
          label: cd.s('dn-confirm-no'),
          action: 'reject',
        },
      ];
      const action = await showConfirmDialog(cd.s('dn-confirm'), {
        size: 'medium',
        actions,
      });
      let promise;
      if (action === 'accept') {
        if (Notification.permission === 'default') {
          OO.ui.alert(cd.s('dn-grantpermission'));
          Notification.requestPermission((permission) => {
            if (permission === 'granted') {
              cd.settings.desktopNotifications = settings.desktopNotifications = 'all';
              promise = setSettings(settings);
            } else if (permission === 'denied') {
              cd.settings.desktopNotifications = settings.desktopNotifications = 'none';
              promise = setSettings(settings);
            }
          });
        } else if (Notification.permission === 'granted') {
          cd.settings.desktopNotifications = settings.desktopNotifications = 'all';
          promise = setSettings(settings);
        }
      } else if (action === 'reject') {
        cd.settings.desktopNotifications = settings.desktopNotifications = 'none';
        promise = setSettings(settings);
      }
      if (promise) {
        try {
          await promise;
        } catch (e) {
          mw.notify(cd.s('error-settings-save'), { type: 'error' })
          console.warn(e);
        }
      }
    }
  }

  if (
    !['unknown', 'none'].includes(cd.settings.desktopNotifications) &&
    Notification.permission === 'default'
  ) {
    await OO.ui.alert(cd.s('dn-grantpermission-again'), { title: cd.s('script-name') });
    Notification.requestPermission();
  }
}

/**
 * Find the previous comment by time by the specified author within a 1-day window.
 *
 * @param {string} anchor
 * @param {Date} date
 * @param {string} author
 * @returns {Comment}
 * @private
 */
function findPreviousCommentByTime(anchor, date, author) {
  return cd.comments
    .filter((comment) => (
      comment.author.name === author &&
      comment.date &&
      comment.date < date &&
      comment.date.getTime() > date.getTime() - cd.g.MILLISECONDS_IN_MINUTE * 60 * 24
    ))
    .sort((c1, c2) => c1.date.getTime() - c2.date.getTime())
    .slice(-1)[0];
}

/**
 * Find a section with a similar name on the page (when the section with the exact name was not
 * found).
 *
 * @param {string} sectionName
 * @returns {?Section}
 */
function findSectionByWords(sectionName) {
  const matches = cd.sections
    .map((section) => {
      const score = calculateWordOverlap(sectionName, section.headline);
      return { section, score };
    })
    .filter((match) => match.score > 0.66);
  const bestMatch = matches.sort((m1, m2) => m2.score - m1.score)[0];
  return bestMatch ? bestMatch.section : null;
}

/**
 * _For internal use._ Show a message at the top of the page that a section/comment was not found, a
 * link to search in the archive, and a link to the section/comment if it was found automatically.
 *
 * @param {string} decodedFragment Decoded fragment.
 * @param {Date} [date] Comment date, if there is a comment anchor in the fragment.
 * @param {string} [author] Comment author, if there is a comment anchor in the fragment.
 */
export async function addNotFoundMessage(decodedFragment, date, author) {
  let label;
  let previousCommentByTimeText = '';
  let sectionName;
  let sectionWithSimilarNameText = '';
  if (date) {
    label = cd.sParse('deadanchor-comment-lead');
    const previousCommentByTime = findPreviousCommentByTime(decodedFragment, date, author);
    if (previousCommentByTime) {
      previousCommentByTimeText = (
        ' ' +
        cd.sParse('deadanchor-comment-previous', '#' + previousCommentByTime.anchor)
      )
        // Until https://phabricator.wikimedia.org/T288415 is resolved and online on most wikis.
        .replace(cd.g.ARTICLE_PATH_REGEXP, '$1');
      label += previousCommentByTimeText;
    }
  } else {
    sectionName = underlinesToSpaces(decodedFragment);
    label = cd.sParse('deadanchor-section-lead', sectionName);
    const sectionMatch = findSectionByWords(sectionName);
    if (sectionMatch) {
      sectionWithSimilarNameText = (
        ' ' +
        cd.sParse('deadanchor-section-similar', '#' + sectionMatch.anchor, sectionMatch.headline)
      )
        // Until https://phabricator.wikimedia.org/T288415 is resolved and online on most wikis.
        .replace(cd.g.ARTICLE_PATH_REGEXP, '$1');

      // Possible use of a template in the section title. In such a case, it's almost always the
      // real match, so we show it immediately.
      if (sectionName.includes('{{')) {
        label += sectionWithSimilarNameText;
      }
    }
  }
  if (cd.page.canHaveArchives()) {
    label += ' ';

    let sectionNameDotDecoded;
    if (date) {
      label += cd.sParse('deadanchor-comment-finding');
    } else {
      label += cd.sParse('deadanchor-section-finding');
      try {
        sectionNameDotDecoded = decodeURIComponent(sectionName.replace(/\.([0-9A-F]{2})/g, '%$1'));
      } catch {
        sectionNameDotDecoded = sectionName;
      }
    }

    const token = date ?
      formatDateNative(date, false, cd.g.CONTENT_TIMEZONE) :
      sectionName.replace(/"/g, '');
    let searchQuery = `"${token}"`
    if (sectionName && sectionName !== sectionNameDotDecoded) {
      const tokenDotDecoded = sectionNameDotDecoded.replace(/"/g, '');
      searchQuery += ` OR "${tokenDotDecoded}"`;
    }
    if (date) {
      // There can be a time difference between the time we know (taken from the history) and the
      // time on the page. We take it to be not more than 3 minutes for the time on the page.
      for (let gap = 1; gap <= 3; gap++) {
        const adjustedDate = new Date(date.getTime() - cd.g.MILLISECONDS_IN_MINUTE * gap);
        const adjustedToken = formatDateNative(adjustedDate, false, cd.g.CONTENT_TIMEZONE);
        searchQuery += ` OR "${adjustedToken}"`;
      }
    }
    const archivePrefix = cd.page.getArchivePrefix();
    searchQuery += ` prefix:${archivePrefix}`;

    cd.g.mwApi.get({
      action: 'query',
      list: 'search',
      srsearch: searchQuery,
      srprop: sectionName ? 'sectiontitle' : undefined,

      // List more recent archives first
      srsort: 'create_timestamp_desc',

      srlimit: '20'
    }).then((resp) => {
      const results = resp?.query?.search;

      let searchUrl = mw.util.getUrl('Special:Search', {
        search: searchQuery,
        sort: 'create_timestamp_desc',
        cdcomment: date && decodedFragment,
      });
      searchUrl = cd.g.SERVER + searchUrl;

      if (results.length === 0) {
        let label;
        if (date) {
          label = (
            cd.sParse('deadanchor-comment-lead') +
            ' ' +
            cd.sParse('deadanchor-comment-notfound', searchUrl) +
            previousCommentByTimeText
          );
        } else {
          let notFoundText = '';

          // Possible use of a template in the section title.
          if (!(sectionWithSimilarNameText && sectionName.includes('{{'))) {
            notFoundText = ' ' + cd.sParse('deadanchor-section-notfound', searchUrl);
          }

          label = (
            cd.sParse('deadanchor-section-lead', sectionName) +
            notFoundText +
            sectionWithSimilarNameText
          );
        }
        message.setLabel(wrap(label));
      } else {
        let pageTitle;

        // Will either be sectionName or sectionNameDotDecoded.
        let sectionNameFound = sectionName;

        if (sectionName) {
          // Obtain the first exact section title match (which would be from the most recent
          // archive). This loop iterates over just one item in the vast majority of cases.
          for (const [, result] of Object.entries(results)) {
            if (
              result.sectiontitle &&
              [sectionName, sectionNameDotDecoded].includes(result.sectiontitle)
            ) {
              pageTitle = result.title;
              sectionNameFound = underlinesToSpaces(result.sectiontitle);
              break;
            }
          }
        } else {
          const pageTitles = [];
          for (const [, result] of Object.entries(results)) {
            const snippetText = removeWikiMarkup(result.snippet);
            if (snippetText && snippetText.includes(token)) {
              pageTitles.push(result.title);
            }
          }
          if (pageTitles.length === 1) {
            pageTitle = pageTitles[0];
          }
        }

        let label;
        if (pageTitle) {
          const wikilink = pageTitle + '#' + (date ? decodedFragment : sectionNameFound);
          label = date ?
            (
              cd.sParse('deadanchor-comment-exactmatch', wikilink, searchUrl) +
              previousCommentByTimeText
            ) :
            cd.sParse('deadanchor-section-exactmatch', sectionNameFound, wikilink, searchUrl);
        } else {
          label = date ?
            cd.sParse('deadanchor-comment-inexactmatch', searchUrl) + previousCommentByTimeText :
            cd.sParse('deadanchor-section-inexactmatch', sectionNameFound, searchUrl);
        }

        message.setLabel(wrap(label));
      }
    });
  }

  const message = new OO.ui.MessageWidget({
    type: 'warning',
    inline: true,
    label: wrap(label),
    classes: ['cd-message-notFound'],
  });
  cd.g.$root.prepend(message.$element);
}

/**
 * Show a notification informing the user that CD is incompatible with DiscussionTools and
 * suggesting to disable DiscussionTools.
 */
export function suggestDisableDiscussionTools() {
  const message = cd.sParse('discussiontools-incompatible');
  const { $wrapper: $message, buttons: [disableButton] } = wrap(message, {
    callbacks: {
      'cd-notification-disabledt': async () => {
        disableButton.setPending(true);
        try {
          await cd.g.mwApi.saveOption('discussiontools-betaenable', 0).catch(handleApiReject);
        } catch (e) {
          mw.notify(wrap(cd.sParse('error-settings-save')));
          return;
        } finally {
          disableButton.setPending(false);
        }
        notification.$notification.hide();
        const message = wrap(cd.sParse('discussiontools-disabled'), {
          callbacks: {
            'cd-notification-refresh': () => {
              location.reload();
            },
          }
        }).$wrapper;
        mw.notify(message);
      },
    },
  });
  const notification = mw.notification.notify($message, { autoHide: false });
}
