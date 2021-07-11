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
  caseInsensitiveFirstCharPattern,
  firstCharToUpperCase,
  getFromLocalStorage,
  hideText,
  mergeRegexps,
  restoreScrollPosition,
  saveScrollPosition,
  saveToLocalStorage,
  skin$,
  spacesToUnderlines,
  transparentize,
  underlinesToSpaces,
  unhideText,
  wrap,
} from './util';
import { createWindowManager, showConfirmDialog } from './ooui';
import { editWatchedSections, rescueCommentFormsContent, showSettingsDialog } from './modal';
import { formatDateNative, initDayjs, initTimestampParsingTools } from './timestamp';
import { getLocalOverridingSettings, getSettings, setSettings } from './options';
import { getUserInfo } from './apiWrappers';
import { loadSiteData } from './siteData';

let notificationsData = [];
let saveSessionTimeout;
let saveSessionLastTime;

/**
 * _For internal use._ Initiate user settings.
 */
export async function initSettings() {
  /**
   * Script settings of the current user.
   *
   * @name settings
   * @type {object}
   * @memberof module:cd~convenientDiscussions
   */
  cd.settings = cd.settings || {};

  // We fill the settings after the modules are loaded so that the settings set via common.js had
  // less chance not to load.

  /**
   * Default settings.
   *
   * @name defaultSetings
   * @type {object}
   * @memberof module:cd~convenientDiscussions
   */
  cd.defaultSettings = {
    allowEditOthersComments: false,
    alwaysExpandAdvanced: false,

    // If the user has never changed the insert buttons configuration, it should change with the
    // default configuration change.
    haveInsertButtonsBeenAltered: false,

    // The order should coincide with the order of checkboxes in
    // `SettingsDialog#autocompleteTypesMultiselect` in modal.js (otherwise the "Save" and "Reset"
    // buttons in the settings dialog won't work properly.
    autocompleteTypes: ['mentions', 'commentLinks', 'wikilinks', 'templates', 'tags'],

    autopreview: true,
    desktopNotifications: 'unknown',
    defaultCommentLinkType: null,
    defaultSectionLinkType: null,
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
    useLocalTime: true,
    useTemplateData: true,
    watchOnReply: true,
    watchSectionOnReply: true,
  };

  // Settings set for the current wiki only.
  cd.localSettingNames = ['haveInsertButtonsBeenAltered', 'insertButtons', 'signaturePrefix'];

  // Settings not shown in the settings dialog.
  cd.internalSettingNames = [
    'defaultCommentLinkType',
    'defaultSectionLinkType',
    'showLoadingOverlay',
  ];

  // Aliases for seamless transition when changing a setting name.
  cd.settingAliases = {
    allowEditOthersComments: ['allowEditOthersMsgs'],
    alwaysExpandAdvanced: ['alwaysExpandSettings'],
    haveInsertButtonsBeenAltered: ['areInsertButtonsAltered', 'insertButtonsChanged'],
    desktopNotifications: ['browserNotifications'],
    signaturePrefix: ['mySig', 'mySignature'],
  };

  const options = {
    [cd.g.SETTINGS_OPTION_NAME]: mw.user.options.get(cd.g.SETTINGS_OPTION_NAME),
    [cd.g.LOCAL_SETTINGS_OPTION_NAME]: mw.user.options.get(cd.g.LOCAL_SETTINGS_OPTION_NAME),
  };

  // Settings in variables like "cdAlowEditOthersComments" used before server-stored settings
  // were implemented.
  Object.keys(cd.defaultSettings).forEach((name) => {
    (cd.settingAliases[name] || []).concat(name).forEach((alias) => {
      const varAlias = 'cd' + firstCharToUpperCase(alias);
      if (
        varAlias in window &&
        (
          typeof window[varAlias] === typeof cd.defaultSettings[name] ||
          cd.defaultSettings[name] === null
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
    if (!cd.internalSettingNames.includes(name)) {
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

  cd.settings = Object.assign({}, cd.defaultSettings, cd.settings);

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
  cd.g.api = cd.g.api || new mw.Api({
    ajax: {
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
    .files["phpCharToUpper.json"];
  cd.g.PAGE = new Page(cd.g.PAGE_NAME);
  cd.g.USER_GENDER = mw.user.options.get('gender');
  cd.g.USER = userRegistry.getUser(cd.g.USER_NAME);

  // {{gender:}} with at least two pipes in a selection of the affected strings.
  cd.g.GENDER_AFFECTS_USER_STRING = /\{\{ *gender *:[^}]+?\|[^}]+?\|/i.test(
    cd.sPlain('es-reply-to') +
    cd.sPlain('es-edit-comment-by') +
    cd.sPlain('thank-confirm') +
    cd.sPlain('thread-expand')
  );

  cd.g.QQX_MODE = mw.util.getParamValue('uselang') === 'qqx';

  if (cd.config.tagName && cd.g.USER.isRegistered()) {
    cd.g.SUMMARY_POSTFIX = '';
    cd.g.SUMMARY_LENGTH_LIMIT = mw.config.get('wgCommentCodePointLimit');
  } else {
    cd.g.SUMMARY_POSTFIX = ` ([[${cd.config.scriptPageWikilink}|${cd.s('script-name-short')}]])`;
    cd.g.SUMMARY_LENGTH_LIMIT = (
      mw.config.get('wgCommentCodePointLimit') -
      cd.g.SUMMARY_POSTFIX.length
    );
  }

  cd.g.IS_IPv6_ADDRESS = mw.util.isIPv6Address;

  cd.g.NOTIFICATION_AREA = document.querySelector('.mw-notification-area');

  // Page states
  cd.g.dontHandleScroll = false;
  cd.g.isAutoScrollInProgress = false;
  cd.g.activeAutocompleteMenu = null;
  cd.g.isPageBeingReloaded = false;
  cd.g.hasPageBeenReloaded = false;

  // Useful for testing
  cd.g.processPageInBackground = updateChecker.processPage;
  cd.g.editWatchedSections = editWatchedSections;
  cd.g.showSettingsDialog = showSettingsDialog;


  /* Some static methods for external use */

  /**
   * @see module:Comment.getByAnchor
   * @function getCommentByAnchor
   * @memberof module:cd~convenientDiscussions
   */
  cd.getCommentByAnchor = Comment.getByAnchor;

  /**
   * @see module:Section.getByAnchor
   * @function getSectionByAnchor
   * @memberof module:cd~convenientDiscussions
   */
  cd.getSectionByAnchor = Section.getByAnchor;

  /**
   * @see module:Section.getByHeadline
   * @function getSectionsByHeadline
   * @memberof module:cd~convenientDiscussions
   */
  cd.getSectionsByHeadline = Section.getByHeadline;

  /**
   * @see module:CommentForm.getLastActive
   * @function getLastActiveCommentForm
   * @memberof module:cd~convenientDiscussions
   */
  cd.getLastActiveCommentForm = CommentForm.getLastActive;

  /**
   * @see module:CommentForm.getLastActiveAltered
   * @function getLastActiveAlteredCommentForm
   * @memberof module:cd~convenientDiscussions
   */
  cd.getLastActiveAlteredCommentForm = CommentForm.getLastActiveAltered;
}

/**
 * Generate regexps, patterns (strings to be parts of regexps), selectors from config values.
 *
 * @private
 */
function initPatterns() {
  // Fix the configuration value that might be nullified.
  cd.config.customTalkNamespaces = cd.config.customTalkNamespaces || [];

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
    const pattern = cd.config.unsignedTemplates.join('|');
    cd.g.UNSIGNED_TEMPLATES_PATTERN = (
      `(\\{\\{ *(?:${pattern}) *\\| *([^}|]+?) *(?:\\| *([^}]+?) *)?\\}\\})`
    );
    cd.g.UNSIGNED_TEMPLATES_REGEXP = new RegExp(cd.g.UNSIGNED_TEMPLATES_PATTERN + '.*\\n', 'ig');
  }

  cd.g.KEEP_IN_SECTION_ENDING = cd.config.keepInSectionEnding.slice();
  if (cd.config.clearTemplates.length) {
    const pattern = cd.config.clearTemplates.join('|');
    cd.g.KEEP_IN_SECTION_ENDING.push(new RegExp(`\\n+\\{\\{(?:${pattern})\\}\\}\\s*$`, 'i'));
  }

  cd.g.USER_SIGNATURE = cd.settings.signaturePrefix + cd.g.SIGN_CODE;

  const signatureContent = mw.user.options.get('nickname');
  const authorInSignatureMatch = signatureContent.match(
    new RegExp(cd.g.CAPTURE_USER_NAME_PATTERN, 'i')
  );
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

  // TODO: instead of removing only lines containing antipatterns from wikitext, hide entire
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
      const pattern = cd.config.templatesToExclude.map(caseInsensitiveFirstCharPattern).join('|');
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

  const closedDiscussionBeginningsPattern = (cd.config.closedDiscussionTemplates?.[0] || [])
    .map(mw.util.escapeRegExp)
    .map(anySpace)
    .join('|');
  const closedDiscussionEndingsPattern = (cd.config.closedDiscussionTemplates?.[1] || [])
    .map(mw.util.escapeRegExp)
    .map(anySpace)
    .join('|');
  if (closedDiscussionBeginningsPattern) {
    if (closedDiscussionEndingsPattern) {
      cd.g.CLOSED_DISCUSSION_PAIR_REGEXP = new RegExp(
        `\\{\\{ *(?:${closedDiscussionBeginningsPattern}) *(?=[|}])[^}]*\\}\\}\\s*([:*#]*)[^]*?\\{\\{ *(?:${closedDiscussionEndingsPattern}) *(?=[|}])[^}]*\\}\\}`,
        'ig'
      );
    }
    cd.g.CLOSED_DISCUSSION_SINGLE_REGEXP = new RegExp(
      `\\{\\{ *(?:${closedDiscussionBeginningsPattern}) *\\|[^}]{0,50}?=\\s*([:*#]*)`,
      'ig'
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
  if (cd.config.clearTemplates.length) {
    const pattern = cd.config.clearTemplates.join('|');
    cd.g.BAD_COMMENT_BEGINNINGS.push(new RegExp(`^\\{\\{(?:${pattern})\\}\\} *\\n+`, 'i'));
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

    headerElement.appendChild(parenthesesEnd);

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
    overlayGradient.textContent = '\u00A0';
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
  createApi();
  await Promise.all(siteDataRequests.length ? siteDataRequests : loadSiteData());
  initGlobals();
  await initSettings();
  initTimestampParsingTools();
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
   * @memberof module:cd~convenientDiscussions
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
  } catch (e) {
    mw.notify(cd.s('error-processpage'), { type: 'error' });
    console.error(e);
    finishLoading();
  }

  mw.hook('wikipage.content').fire(cd.g.$content);
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
 * `convenientDiscussions.g.isFirstRun` and `convenientDiscussions.g.isPageBeingReloaded`.
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
     * @memberof module:cd~convenientDiscussions.g
     */
    cd.g.isPageBeingReloaded = true;
  } else {
    /**
     * Is the page processed for the first time after it was loaded (i.e., not reloaded using the
     * script's refresh functionality).
     *
     * @name isFirstRun
     * @type {boolean}
     * @memberof module:cd~convenientDiscussions.g
     */
    cd.g.isFirstRun = true;
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
    cd.g.isFirstRun = false;
    cd.g.isPageFirstParsed = false;
    cd.g.isPageBeingReloaded = false;
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
  return cd.g.isFirstRun || cd.g.isPageBeingReloaded;
}

/**
 * Reload the page via Ajax.
 *
 * @param {object} [passedData={}] Data passed from the previous page state.
 * @throws {CdError|Error}
 */
export async function reloadPage(passedData = {}) {
  if (cd.g.isPageBeingReloaded) return;

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

  // In case checkboxes were changed programmatically.
  saveSession();

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

  let parseData;
  try {
    parseData = await cd.g.PAGE.parse(null, false, true);
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

  LiveTimestamp.reset();

  // Detach comment forms to keep events.
  cd.commentForms.forEach((commentForm) => {
    commentForm.$outermostElement.detach();
  });

  passedData.unseenCommentAnchors = getUnseenCommentAnchors();

  passedData.html = parseData.text;
  mw.config.set({
    wgRevisionId: parseData.revid,
    wgCurRevisionId: parseData.revid,
  });
  mw.loader.load(parseData.modules);
  mw.loader.load(parseData.modulestyles);
  mw.config.set(parseData.jsconfigvars);

  // Remove the fragment
  history.replaceState(history.state, '', location.pathname + location.search);

  cd.g.hasPageBeenReloaded = true;

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
 * @param {JQuery} $content
 */
export function handleHookFirings($content) {
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
          target: cd.g.PAGE,
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
  if (cd.g.isFirstRun || isPageReloadedExternally) {
    // This is needed when the page is reload externally.
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
 * _For internal use._ Show a message at the top of the page that a section/comment was not found, a
 * link to search in the archive, and a link to the section/comment if it was found automatically.
 *
 * @param {string} decodedFragment Decoded fragment.
 * @param {Date} date Comment date, if there is a comment anchor in the fragment.
 */
export async function addNotFoundMessage(decodedFragment, date) {
  let label;
  let sectionName;
  if (date) {
    label = cd.s('deadanchor-comment-lead')
  } else {
    sectionName = underlinesToSpaces(decodedFragment);
    label = cd.s('deadanchor-section-lead', sectionName);
  }
  if (cd.g.PAGE.canHaveArchives()) {
    label += ' ';

    let sectionNameDotDecoded;
    if (date) {
      label += cd.s('deadanchor-comment-finding');
    } else {
      label += cd.s('deadanchor-section-finding');
      try {
        sectionNameDotDecoded = decodeURIComponent(sectionName.replace(/\.([0-9A-F]{2})/g, '%$1'));
      } catch (e) {
        sectionNameDotDecoded = sectionName;
      }
    }

    const token = date ? formatDateNative(date, cd.g.TIMEZONE) : sectionName.replace(/"/g, '');
    const archivePrefix = cd.g.PAGE.getArchivePrefix();
    let searchQuery = `"${token}"`
    if (sectionName && sectionName !== sectionNameDotDecoded) {
      const tokenDotDecoded = sectionNameDotDecoded.replace(/"/g, '');
      searchQuery += ` OR "${tokenDotDecoded}"`;
    }
    searchQuery += ` prefix:${archivePrefix}`;

    cd.g.api.get({
      action: 'query',
      list: 'search',
      srsearch: searchQuery,
      srprop: sectionName ? 'sectiontitle' : undefined,

      // List more recent archives first
      srsort: 'create_timestamp_desc',

      srlimit: '20'
    }).then((resp) => {
      const results = resp?.query?.search;

      if (results.length === 0) {
        let label;
        if (date) {
          label = cd.s('deadanchor-comment-lead') + ' ' + cd.s('deadanchor-comment-notfound');
        } else {
          label = (
            cd.s('deadanchor-section-lead', sectionName) +
            ' ' +
            cd.s('deadanchor-section-notfound')
          );
        }
        message.setLabel(label);
      } else {
        let pageTitle;

        // Will either be sectionName or sectionNameDotDecoded.
        let sectionNameFound = sectionName;

        if (sectionName) {
          // Obtain the first exact section title match (which would be from the most recent
          // archive). This loop iterates over just one item in the vast majority of cases.
          let sectionName_ = spacesToUnderlines(sectionName);
          let sectionNameDotDecoded_ = spacesToUnderlines(sectionNameDotDecoded);
          for (let [, result] of Object.entries(results)) {
            // sectiontitle in API output has spaces encoded as underscores.
            if (
              result.sectiontitle &&
              [sectionName_, sectionNameDotDecoded_].includes(result.sectiontitle)
            ) {
              pageTitle = result.title;
              sectionNameFound = underlinesToSpaces(result.sectiontitle);
              break;
            }
          }
        } else {
          if (results.length === 1) {
            pageTitle = results[0].title;
          }
        }

        let searchUrl = mw.util.getUrl('Special:Search', {
          search: searchQuery,
          sort: 'create_timestamp_desc',
          cdcomment: date && decodedFragment,
        });
        searchUrl = cd.g.SERVER + searchUrl;

        let label;
        if (pageTitle) {
          if (date) {
            label = cd.sParse(
              'deadanchor-comment-exactmatch',
              pageTitle + '#' + decodedFragment,
              searchUrl
            );
          } else {
            label = cd.sParse(
              'deadanchor-section-exactmatch',
              sectionNameFound,
              pageTitle + '#' + sectionNameFound,
              searchUrl
            );
          }
        } else {
          if (date) {
            label = cd.sParse('deadanchor-comment-inexactmatch', searchUrl);
          } else {
            label = cd.sParse('deadanchor-section-inexactmatch', sectionNameFound, searchUrl);
          }
        }

        message.setLabel(wrap(label));
      }
    });
  }

  const message = new OO.ui.MessageWidget({
    type: 'warning',
    inline: true,
    label,
    classes: ['cd-message-notFound'],
  });
  cd.g.$root.prepend(message.$element);
}
