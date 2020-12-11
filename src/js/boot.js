/**
 * Initialization, page loading, reloading, and session-related functions.
 *
 * @module boot
 */

import { create as nanoCssCreate } from 'nano-css';

import CdError from './CdError';
import Comment from './Comment';
import CommentForm from './CommentForm';
import Page from './Page';
import Section from './Section';
import Worker from './worker-gate';
import cd from './cd';
import jqueryExtensions from './jqueryExtensions';
import navPanel from './navPanel';
import processPage from './processPage';
import toc from './toc';
import updateChecker from './updateChecker';
import {
  areObjectsEqual,
  caseInsensitiveFirstCharPattern,
  firstCharToUpperCase,
  getFromLocalStorage,
  hideText,
  mergeRegexps,
  restoreScrollPosition,
  saveScrollPosition,
  saveToLocalStorage,
  transparentize,
  unhideText,
} from './util';
import { createWindowManager, rescueCommentFormsContent } from './modal';
import { getLocalOverridingSettings, getSettings, setSettings } from './options';
import { getUserInfo } from './apiWrappers';
import { initTimestampParsingTools } from './dateFormat';
import { loadData } from './dateFormat';

let notificationsData = [];

/**
 * Initiate user settings.
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
    defaultCommentLinkType: 'diff',
    defaultSectionLinkType: 'wikilink',
    highlightOwnComments: true,
    insertButtons: cd.config.defaultInsertButtons || [],
    notifications: 'all',
    notificationsBlacklist: [],

    // Not shown in the settings dialog
    showLoadingOverlay: true,

    showToolbar: true,
    signaturePrefix: cd.config.defaultSignaturePrefix,
    modifyToc: true,
    useTemplateData: true,
    watchOnReply: true,
    watchSectionOnReply: true,
  };

  cd.localSettingNames = ['haveInsertButtonsBeenAltered', 'insertButtons', 'signaturePrefix'];

  const options = {
    [cd.g.SETTINGS_OPTION_NAME]: mw.user.options.get(cd.g.SETTINGS_OPTION_NAME),
    [cd.g.LOCAL_SETTINGS_OPTION_NAME]: mw.user.options.get(cd.g.LOCAL_SETTINGS_OPTION_NAME),
  }

  // Aliases for seamless transition when changing a setting name.
  cd.settingAliases = {
    allowEditOthersComments: ['allowEditOthersMsgs'],
    alwaysExpandAdvanced: ['alwaysExpandSettings'],
    haveInsertButtonsBeenAltered: ['areInsertButtonsAltered', 'insertButtonsChanged'],
    desktopNotifications: ['browserNotifications'],
    signaturePrefix: ['mySig', 'mySignature'],
  };

  // Settings in variables like "cdAlowEditOthersComments" used before server-stored settings
  // were implemented.
  Object.keys(cd.defaultSettings).forEach((name) => {
    (cd.settingAliases[name] || []).concat(name).forEach((alias) => {
      const varAlias = 'cd' + firstCharToUpperCase(alias);
      if (varAlias in window && typeof window[varAlias] === typeof cd.defaultSettings[name]) {
        cd.settings[name] = window[varAlias];
      }
    });
  });

  const remoteSettings = await getSettings({
    options,
    omitLocal: true,
  });
  cd.settings = Object.assign(cd.settings, remoteSettings);

  // Seamless transition from mySignature.
  if (cd.settings.signaturePrefix !== undefined) {
    // eslint-disable-next-line no-useless-escape
    cd.settings.signaturePrefix = cd.settings.signaturePrefix.replace(/~~\~~/, '')
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
 * Set CSS for talk pages.
 *
 * @private
 */
export function initTalkPageCss() {
  cd.g.nanoCss = nanoCssCreate();
  cd.g.nanoCss.put(':root', {
    '--cd-comment-underlay-focused-color': cd.g.COMMENT_UNDERLAY_FOCUSED_COLOR,
    '--cd-comment-underlay-target-color': cd.g.COMMENT_UNDERLAY_TARGET_COLOR,
    '--cd-comment-underlay-new-color': cd.g.COMMENT_UNDERLAY_NEW_COLOR,
    '--cd-comment-underlay-own-color': cd.g.COMMENT_UNDERLAY_OWN_COLOR,
    '--cd-comment-underlay-deleted-color': cd.g.COMMENT_UNDERLAY_DELETED_COLOR,
  });

  // Set the transparent color for the "focused" color. The user may override the CSS variable value
  // in their personal styles, so we get the existing value first.
  const focusedColor = $(document.documentElement).css('--cd-comment-underlay-focused-color');
  cd.g.nanoCss.put(':root', {
    '--cd-comment-underlay-focused-transparent-color': transparentize(focusedColor),
  });

  cd.g.nanoCss.put('.ltr .cd-commentOverlay-gradient', {
    backgroundImage: 'linear-gradient(to left, var(--cd-comment-underlay-focused-color), var(--cd-comment-underlay-focused-transparent-color))',
  });
  cd.g.nanoCss.put('.rtl .cd-commentOverlay-gradient', {
    backgroundImage: 'linear-gradient(to right, var(--cd-comment-underlay-focused-color), var(--cd-comment-underlay-focused-transparent-color))',
  });

  // Vector, Monobook, Minerva
  const contentBackgroundColor = $('#content').css('background-color') || '#fff';

  cd.g.nanoCss.put('.cd-messageArea .cd-closeButton', {
    backgroundColor: contentBackgroundColor,
  });
}

/**
 * Initialize a number of the global object properties.
 */
function initGlobals() {
  cd.g.PHP_CHAR_TO_UPPER_JSON = mw.loader.moduleRegistry['mediawiki.Title'].script
    .files["phpCharToUpper.json"];
  cd.g.CURRENT_PAGE = new Page(cd.g.CURRENT_PAGE_NAME);
  cd.g.CURRENT_USER_GENDER = mw.user.options.get('gender');

  // {{gender:}} with at least two pipes in a selection of the affected strings.
  cd.g.GENDER_AFFECTS_USER_STRING = /\{\{ *gender *:[^}]+?\|[^}]+?\|/i
    .test(cd.sPlain('es-reply-to') + cd.sPlain('es-edit-comment-by') + cd.sPlain('thank-confirm'));

  cd.g.QQX_MODE = mw.util.getParamValue('uselang') === 'qqx';

  if (cd.config.tagName) {
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

  cd.g.dontHandleScroll = false;
  cd.g.autoScrollInProgress = false;
  cd.g.activeAutocompleteMenu = null;
  cd.g.hasPageBeenReloaded = false;

  // Useful for testing
  cd.g.processPageInBackground = updateChecker.processPage;


  /* Some static methods for external use */

  /**
   * @see module:Comment.getCommentByAnchor
   * @function getCommentByAnchor
   * @memberof module:cd~convenientDiscussions
   */
  cd.getCommentByAnchor = Comment.getCommentByAnchor;

  /**
   * @see module:Section.getSectionByAnchor
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
}

/**
 * Generate regexps, patterns (strings to be parts of regexps), selectors from config values.
 *
 * @private
 */
function initPatterns() {
  cd.g.CONTRIBS_PAGE_LINK_REGEXP = new RegExp(`^${cd.g.CONTRIBS_PAGE}/`);

  const anySpace = (s) => s.replace(/[ _]/g, '[ _]+').replace(/:/g, '[ _]*:[ _]*');

  const namespaceIds = mw.config.get('wgNamespaceIds');
  const userNamespaces = Object.keys(namespaceIds)
    .filter((key) => [2, 3].includes(namespaceIds[key]));
  const userNamespacesPattern = userNamespaces.map(anySpace).join('|');
  cd.g.USER_NAMESPACES_REGEXP = new RegExp(`(?:^|:)(?:${userNamespacesPattern}):(.+)`, 'i');

  const allNamespaces = Object.keys(namespaceIds);
  const allNamespacesPattern = allNamespaces.join('|');
  cd.g.ALL_NAMESPACES_REGEXP = new RegExp(`(?:^|:)(?:${allNamespacesPattern}):`, 'i');

  const contribsPagePattern = anySpace(cd.g.CONTRIBS_PAGE);
  cd.g.CAPTURE_USER_NAME_PATTERN = (
    `\\[\\[[ _]*:?(?:\\w*:){0,2}(?:(?:${userNamespacesPattern})[ _]*:[ _]*|` +
    `(?:Special[ _]*:[ _]*Contributions|${contribsPagePattern})\\/[ _]*)([^|\\]/]+)(/)?`
  );

  const userNamespaceAliases = Object.keys(namespaceIds).filter((key) => namespaceIds[key] === 2);
  const userNamespaceAliasesPattern = userNamespaceAliases.map(anySpace).join('|');
  cd.g.USER_NAMESPACE_ALIASES_REGEXP = new RegExp(
    `^:?(?:${userNamespaceAliasesPattern}):([^/]+)$`,
    'i'
  );

  if (cd.config.unsignedTemplates.length) {
    const unsignedTemplatesPattern = cd.config.unsignedTemplates.join('|');
    cd.g.UNSIGNED_TEMPLATES_PATTERN = (
      `(\\{\\{ *(?:${unsignedTemplatesPattern}) *\\| *([^}|]+?) *(?:\\| *([^}]+?) *)?\\}\\})`
    );
    cd.g.UNSIGNED_TEMPLATES_REGEXP = new RegExp(cd.g.UNSIGNED_TEMPLATES_PATTERN + '.*\\n', 'ig');
  }

  cd.g.CURRENT_USER_SIGNATURE = cd.settings.signaturePrefix + cd.g.SIGN_CODE;

  const signatureContent = mw.user.options.get('nickname');
  const authorInSignatureMatch = signatureContent.match(
    new RegExp(cd.g.CAPTURE_USER_NAME_PATTERN, 'i')
  );
  if (authorInSignatureMatch) {
    // Extract signature contents before the user name - in order to cut it out from comment endings
    // when editing.
    const signaturePrefixPattern = mw.util.escapeRegExp(cd.settings.signaturePrefix);
    const signatureBeginning = mw.util.escapeRegExp(
      signatureContent.slice(0, authorInSignatureMatch.index)
    );
    cd.g.CURRENT_USER_SIGNATURE_PREFIX_REGEXP = new RegExp(
      signaturePrefixPattern +
      signatureBeginning +
      '$'
    );
  }

  const pieJoined = cd.g.POPULAR_INLINE_ELEMENTS.join('|');
  cd.g.PIE_PATTERN = `(?:${pieJoined})`;

  const pnieJoined = cd.g.POPULAR_NOT_INLINE_ELEMENTS.join('|');
  cd.g.PNIE_PATTERN = `(?:${pnieJoined})`;

  const commentAntipatternsPatternParts = [];
  if (
    cd.config.elementsToExcludeClasses.length ||
    cd.config.templatesToExclude.length ||
    cd.config.commentAntipatterns.length
  ) {
    if (cd.config.elementsToExcludeClasses) {
      const elementsToExcludeClassesPattern = cd.config.elementsToExcludeClasses.join('\\b|\\b');
      commentAntipatternsPatternParts.push(
        `class=(['"])[^'"\\n]*(?:\\b${elementsToExcludeClassesPattern}\\b)[^'"\\n]*\\1`
      );
    }
    if (cd.config.templatesToExclude.length) {
      const templatesToExcludePattern = cd.config.templatesToExclude
        .map(caseInsensitiveFirstCharPattern)
        .join('|');
      commentAntipatternsPatternParts.push(
        `\\{\\{ *(?:${templatesToExcludePattern}) *(?:\\||\\}\\})`
      );
    }
    if (cd.config.commentAntipatterns) {
      commentAntipatternsPatternParts.push(
        ...cd.config.commentAntipatterns.map((pattern) => pattern.source)
      );
    }
    const commentAntipatternPattern = commentAntipatternsPatternParts.join('|');
    cd.g.COMMENT_ANTIPATTERNS_REGEXP = new RegExp(`^.*(?:${commentAntipatternPattern}).*$`, 'mg');
  }

  cd.g.ARTICLE_PATH_REGEXP = new RegExp(
    mw.util.escapeRegExp(mw.config.get('wgArticlePath')).replace(mw.util.escapeRegExp('$1'), '(.*)')
  );

  const quoteBeginningsPattern = ['<blockquote>', '<q>']
    .concat(
      cd.config.pairQuoteTemplates?.[0]
        .map((template) => '\\{\\{ *' + anySpace(mw.util.escapeRegExp(template))) ||
      []
    )
    .join('|');
  const quoteEndingsPattern = ['</blockquote>', '</q>']
    .concat(
      cd.config.pairQuoteTemplates?.[1]
        .map((template) => '\\{\\{ *' + anySpace(mw.util.escapeRegExp(template))) ||
      []
    )
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
        `\\s*\\{\\{ *(?:${closedDiscussionBeginningsPattern})[^]*?\\}\\}\\s*([:*#]*)[^]*?\\{\\{ *(?:${closedDiscussionEndingsPattern})[^}]*\\}\\}`,
        'ig'
      );
    }
    cd.g.CLOSED_DISCUSSION_SINGLE_REGEXP = new RegExp(
      `\\s*\\{\\{ *(?:${closedDiscussionBeginningsPattern}) *\\|[^]*?=\\s*([:*#]*)`,
      'ig'
    );
  }

  cd.g.UNHIGHLIGHTABLE_ELEMENT_CLASSES = cd.g.UNHIGHLIGHTABLE_ELEMENT_CLASSES
    .concat(cd.config.customUnhighlightableElementClasses);

  const fileNamespaces = Object.keys(namespaceIds).filter((key) => 6 === namespaceIds[key]);
  const fileNamespacesPattern = fileNamespaces.map(anySpace).join('|');
  cd.g.FILE_PREFIX_PATTERN = `(?:${fileNamespacesPattern}):`;

  // Actually, only text from "mini" format images should be captured, as in the standard format,
  // the text is not displayed. See "img_thumbnail" in
  // https://ru.wikipedia.org/w/api.php?action=query&meta=siteinfo&siprop=magicwords&formatversion=2.
  // Unfortunately, that would add like 100ms to the server's response time.
  cd.g.FILE_LINK_REGEXP = new RegExp(
    `\\[\\[${cd.g.FILE_PREFIX_PATTERN}[^]+?(?:\\|[^]+?\\|((?:\\[\\[[^]+?\\]\\]|[^|])+?))?\\]\\]`,
    'ig'
  );

  const colonNamespaces = Object.keys(namespaceIds)
    .filter((key) => [6, 14].includes(namespaceIds[key]));
  const colonNamespacesPattern = colonNamespaces.map(anySpace).join('|');
  cd.g.COLON_NAMESPACES_PREFIX_REGEXP = new RegExp(`^:(?:${colonNamespacesPattern}):`, 'i');

  cd.g.BAD_COMMENT_BEGINNINGS = cd.g.BAD_COMMENT_BEGINNINGS
    .concat(new RegExp(`^\\[\\[${cd.g.FILE_PREFIX_PATTERN}.+\\n*(?=[*:#])`))
    .concat(cd.config.customBadCommentBeginnings);

  cd.g.ADD_TOPIC_SELECTORS = [
    '#ca-addsection a',
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
  cd.g.COMMENT_ELEMENT_PROTOTYPES = {};
  cd.g.SECTION_ELEMENT_PROTOTYPES = {};

  cd.g.COMMENT_ELEMENT_PROTOTYPES.goToParentButton = new OO.ui.ButtonWidget({
    label: cd.s('cm-gotoparent'),
    title: cd.s('cm-gotoparent-tooltip'),
    framed: false,
    classes: ['cd-button', 'cd-commentButton'],
  }).$element.get(0);

  const stringName = `cm-copylink-tooltip-${cd.settings.defaultCommentLinkType.toLowerCase()}`;
  cd.g.COMMENT_ELEMENT_PROTOTYPES.linkButton = new OO.ui.ButtonWidget({
    label: cd.s('cm-copylink'),
    title: cd.s(stringName) + ' ' + cd.s('cld-invitation'),
    framed: false,
    classes: ['cd-button', 'cd-commentButton'],
  }).$element.get(0);
  cd.g.COMMENT_ELEMENT_PROTOTYPES.pendingLinkButton = new OO.ui.ButtonWidget({
    label: cd.s('cm-copylink'),
    title: cd.s(stringName) + ' ' + cd.s('cld-invitation'),
    framed: false,
    disabled: true,
    classes: ['cd-button', 'cd-commentButton', 'cd-button-pending'],
  }).$element.get(0);

  cd.g.COMMENT_ELEMENT_PROTOTYPES.thankButton = new OO.ui.ButtonWidget({
    label: cd.s('cm-thank'),
    title: cd.s('cm-thank-tooltip'),
    framed: false,
    classes: ['cd-button', 'cd-commentButton'],
  }).$element.get(0);
  cd.g.COMMENT_ELEMENT_PROTOTYPES.pendingThankButton = new OO.ui.ButtonWidget({
    label: cd.s('cm-thank'),
    title: cd.s('cm-thank-tooltip'),
    framed: false,
    disabled: true,
    classes: ['cd-button', 'cd-commentButton', 'cd-button-pending'],
  }).$element.get(0);
  cd.g.COMMENT_ELEMENT_PROTOTYPES.thankedButton = new OO.ui.ButtonWidget({
    label: cd.s('cm-thanked'),
    title: cd.s('cm-thanked-tooltip'),
    framed: false,
    disabled: true,
    classes: ['cd-button', 'cd-commentButton'],
  }).$element.get(0);

  cd.g.COMMENT_ELEMENT_PROTOTYPES.editButton = new OO.ui.ButtonWidget({
    label: cd.s('cm-edit'),
    framed: false,
    classes: ['cd-button', 'cd-commentButton'],
  }).$element.get(0);

  cd.g.COMMENT_ELEMENT_PROTOTYPES.replyButton = new OO.ui.ButtonWidget({
    label: cd.s('cm-reply'),
    framed: false,
    classes: ['cd-button', 'cd-commentButton'],
  }).$element.get(0);

  cd.g.SECTION_ELEMENT_PROTOTYPES.replyButton = new OO.ui.ButtonWidget({
    label: cd.s('section-reply'),
    framed: false,
    classes: ['cd-button', 'cd-sectionButton'],
  }).$element.get(0);

  cd.g.SECTION_ELEMENT_PROTOTYPES.addSubsectionButton = new OO.ui.ButtonWidget({
    // Will be replaced
    label: ' ',

    framed: false,
    classes: ['cd-button', 'cd-sectionButton'],
  }).$element.get(0);

  cd.g.COMMENT_ELEMENT_PROTOTYPES.underlay = document.createElement('div');
  cd.g.COMMENT_ELEMENT_PROTOTYPES.underlay.className = 'cd-commentUnderlay';

  cd.g.COMMENT_ELEMENT_PROTOTYPES.overlay = document.createElement('div');
  cd.g.COMMENT_ELEMENT_PROTOTYPES.overlay.className = 'cd-commentOverlay';

  const overlayInnerWrapper = document.createElement('div');
  overlayInnerWrapper.className = 'cd-commentOverlay-innerWrapper';
  cd.g.COMMENT_ELEMENT_PROTOTYPES.overlay.appendChild(overlayInnerWrapper);

  const overlayGradient = document.createElement('div');
  overlayGradient.textContent = '\u00A0';
  overlayGradient.className = 'cd-commentOverlay-gradient';
  overlayInnerWrapper.appendChild(overlayGradient);

  const overlayContent = document.createElement('div');
  overlayContent.className = 'cd-commentOverlay-content';
  overlayInnerWrapper.appendChild(overlayContent);
}

/**
 * Create various global objects' (`convenientDiscussions`, `$`) properties and methods. Executed at
 * the first run.
 *
 * @param {object} [data] Data passed from the main module.
 * @param {Promise} [data.messagesRequest] Promise returned by {@link module:dateFormat.loadData}.
 */
export async function init({ messagesRequest }) {
  cd.g.api = cd.g.api || new mw.Api();
  cd.g.worker = new Worker();

  await (messagesRequest || loadData());
  initGlobals();
  await initSettings();
  initTimestampParsingTools();

  /**
   * Collection of all comment forms on the page in the order of their creation.
   *
   * @name commentForms
   * @type {CommentForm[]}
   * @memberof module:cd~convenientDiscussions
   */
  cd.commentForms = [];

  initPatterns();
  initOouiAndElementPrototypes();
  $.fn.extend(jqueryExtensions);
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
 * @param {string} html
 * @param {object} keptData
 * @private
 */
async function updatePageContent(html, keptData) {
  cd.debug.stopTimer('getting HTML');
  cd.debug.startTimer('laying out HTML');

  cd.g.$content.children('.mw-parser-output').remove();
  if (keptData.wasPageCreated) {
    cd.g.$content.empty();
  }

  cd.g.$content.append(html);

  // We could say "let it crash", but, well, unforeseen errors in processPage() are just too likely
  // to go without a safeguard.
  try {
    await processPage(
      Object.assign({}, keptData, { unseenCommentAnchors: getUnseenCommentAnchors() })
    );
  } catch (e) {
    mw.notify(cd.s('error-processpage'), { type: 'error' });
    console.error(e);
    removeLoadingOverlay();
  }

  mw.hook('wikipage.content').fire(cd.g.$content);
}

let $loadingPopup;

/**
 * Check if the "showLoadingOverlay" setting is off. We create a separate function for this because
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
 * Set the loading overlay.
 */
export function setLoadingOverlay() {
  if (isShowLoadingOverlaySettingOff()) return;
  if (!$loadingPopup) {
    $loadingPopup = $('<div>').addClass('cd-loadingPopup');
    const $logoContainer = $('<div>')
      .addClass('cd-loadingPopup-logo')
      .appendTo($loadingPopup);
    $('<div>')
      .addClass('cd-loadingPopup-logo-partBackground')
      .css('background-color', $(document.body).css('background-color'))
      .appendTo($logoContainer);
    $('<img>')
      .attr('src', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADcAAAA3CAYAAACo29JGAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAewQAAHsEBw2lUUwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAK7SURBVGiB3Zq/axRBFMc/60VioQgW1yjEiwa0tdXiCkH9AwLaKCLY+Aek9CxUbGw9/wMbrYQgCIrEpEgUAimNmCAqapWAGL2wFrPr7R374739kZ3ZL7ziuHlv3mdndufN7MJQHaAPbAIDwK/ZBkEufeA4BXQB2LIAKMm2ghzV6lgOFgXsaOEeW5C41PpauE0LkpbahgbMw9y4LY1TjdoFJqSNPcwVcUmetOE+ZeA/wAqwhBnxvPoBvAY+FoghknS+vwNORPymgVWFf2h3gf1BDA+4Buwo/EuH+x3AjGsG+KtI7HlCDvfqhFtK8V9RJHY9IcaZKuCk99xOyn+aDtPiaNVlCJxYqkmn5bGYDk6iq0OfJSR6XxEjDi5qI6WaNOgyMBUJnveB0mN0rbqK7r7NggsBOxq4cAQXgQWK7Ry+Ai+BDzl8JXA+QamWN8G6TAq3oV3EXdLRJsO1pEXoe2C9ykyAi8ChsoNK5vmLsjsd02lMxV/mPecjDOgDZ6tj46kij1BdSVtp0E/AkQrAbipyqAzOB9YYXciL6gZmG2UFnA/8BG4x3Lbk0TS6qbhncKF9Ax4Cl4DDGTAecAozUvMUq27EcGUeM3wHvmBG1g+AJoE2ZiofKKmf8JihC7xKayg+bBGoHZg1cq1C2dU0dg3us6axa3DzmsYuwW0DDyK/J7McXIHbBmYxVVKoGYlj3vWmahtg3g08Iv793BtBDHFnPcmV2iNdQbjguwj2C0HekkX8DkO482VnKtQE5ij/MnBO45hGf1vR1kYTgzUGrhcDBnZ85VAILgkMzKO57oRzw6WBgTnFrTvhXHBZYGAWUxc+6xiBk4CFsv2DnP/WwuxsNXDrwBPMzroNHMSdGtV6zaGYli5KCuisJIBOKwvQeaUBNkJJgI1RHGCjNA7YOEUBG6k5gvKriXoLeP8AAFe0oEsY7eMAAAAASUVORK5CYII=')
      .appendTo($logoContainer);
    $(document.body).append($loadingPopup);
  } else {
    $loadingPopup.show();
  }
}

/**
 * Remove the loading overlay.
 */
export function removeLoadingOverlay() {
  if (!$loadingPopup || isShowLoadingOverlaySettingOff()) return;
  $loadingPopup.hide();
}

/**
 * Is the loading overlay on. This runs very frequently, so we use the fastest way.
 *
 * @returns {boolean}
 */
export function isLoadingOverlayOn() {
  return Boolean($loadingPopup && $loadingPopup[0] && $loadingPopup[0].style.display === 'block');
}

/**
 * Reload the page via Ajax.
 *
 * @param {object} [keptData={}] Data passed from the previous page state.
 * @throws {CdError|Error}
 */
export async function reloadPage(keptData = {}) {
  // In case checkboxes were changed programmatically.
  saveSession();

  saveScrollPosition();

  closeNotifications(keptData.closeNotificationsSmoothly ?? true);

  cd.debug.init();
  cd.debug.startTimer('total time');
  cd.debug.startTimer('getting HTML');

  setLoadingOverlay();

  // Save time by requesting the options in advance.
  getUserInfo().catch((e) => {
    console.warn(e);
  });

  let parseData;
  try {
    parseData = await cd.g.CURRENT_PAGE.parse({ markAsRead: true });
  } catch (e) {
    removeLoadingOverlay();
    if (keptData.didSubmitCommentForm) {
      throw e;
    } else {
      mw.notify(cd.s('error-reloadpage'), { type: 'error' });
      console.warn(e);
      return;
    }
  }

  cd.commentForms.forEach((commentForm) => {
    commentForm.$outermostElement.detach();
  });

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
  await updatePageContent(parseData.text, keptData);

  toc.possiblyHide();

  if (!keptData.commentAnchor && !keptData.sectionAnchor) {
    restoreScrollPosition(false);
  }
}

/**
 * Remove sessions older than 30 days.
 *
 * @param {object[]} data
 * @returns {object}
 * @private
 */
function cleanUpSessions(data) {
  const newData = Object.assign({}, data);
  Object.keys(newData).forEach((key) => {
    if (
      !newData[key].forms?.length ||
      newData[key].saveUnixTime < Date.now() - 30 * cd.g.SECONDS_IN_A_DAY * 1000
    ) {
      delete newData[key];
    }
  });
  return newData;
}

/**
 * Save comment form data to the local storage. (Session storage doesn't allow to restore when the
 * browser has crashed.)
 */
export function saveSession() {
  const forms = cd.commentForms
    .filter((commentForm) => commentForm.isAltered())
    .map((commentForm) => {
      let targetData;
      const target = commentForm.target;
      if (commentForm.target instanceof Comment) {
        targetData = { anchor: target.anchor };
      } else if (target instanceof Section) {
        targetData = {
          headline: target.headline,
          firstCommentAnchor: target.comments[0]?.anchor,
          id: target.id,
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
  const commentFormsData = forms.length ? { forms, saveUnixTime } : {};

  const dataAllPages = getFromLocalStorage('commentForms');
  dataAllPages[mw.config.get('wgPageName')] = commentFormsData;
  saveToLocalStorage('commentForms', dataAllPages);
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
  commentFormsData.forms.forEach((data) => {
    const property = CommentForm.modeToProperty(data.mode);
    if (data.targetData?.anchor) {
      const comment = Comment.getCommentByAnchor(data.targetData.anchor);
      if (comment?.isActionable && !comment[`${property}Form`]) {
        try {
          comment[property](data);
          haveRestored = true;
        } catch (e) {
          console.warn(e);
          rescue.push(data);
        }
      } else {
        rescue.push(data);
      }
    } else if (data.targetData?.headline) {
      const section = Section.search({
        headline: data.targetData.headline,
        firstCommentAnchor: data.targetData.firstCommentAnchor,

        // TODO: remove "data.targetData.index ||" after February 2021, when old values in users'
        // local storages will die for good.
        id: data.targetData.index || data.targetData.id,

        // Can't provide parentTree as cd.sections has already changed; will need to add a
        // workaround if parentTree proves needed.
      });
      if (section?.isActionable && !section[`${property}Form`]) {
        try {
          section[property](data);
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
          target: cd.g.CURRENT_PAGE,
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
    saveSession();
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
 * Return saved comment forms to their places.
 */
export function restoreCommentForms() {
  if (cd.g.isFirstRun) {
    const dataAllPages = cleanUpSessions(getFromLocalStorage('commentForms'));
    saveToLocalStorage('commentForms', dataAllPages);
    const data = dataAllPages[mw.config.get('wgPageName')] || {};
    if (data.forms) {
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
          const comment = Comment.getCommentByAnchor(target.anchor);
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
          firstCommentAnchor: target.comments[0]?.anchor,
          id: target.id,

          // Can't provide parentTree as cd.sections has already changed; will need to add a
          // workaround if parentTree proves needed.
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

  // Navigation panel doesn't appear on non-existent pages, but sessions are saved and restored on
  // them.
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
 * Get all notifications added to the registry (including already hidden). The {@link
 * https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.Notification_ Notification} object
 * will be in the `notification` property.
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
