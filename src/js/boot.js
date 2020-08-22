/**
 * Initialization, page loading, reloading, and session-related functions.
 *
 * @module boot
 */

import CdError from './CdError';
import Comment from './Comment';
import CommentForm from './CommentForm';
import Page from './Page';
import Section from './Section';
import Worker from './worker-gate';
import cd from './cd';
import jqueryExtensions from './jqueryExtensions';
import navPanel, { updatePageTitle } from './navPanel';
import processPage from './processPage';
import {
  caseInsensitiveFirstCharPattern,
  firstCharToUpperCase,
  hideText,
  mergeRegexps,
  saveScrollPosition,
  transparentize,
  underlinesToSpaces,
  unhideText,
} from './util';
import { createWindowManager, rescueCommentFormsContent } from './modal';
import { getLocalOverridingSettings, getSettings, setSettings } from './options';
import { getUserInfo, setLocalOption } from './apiWrappers';
import { initTimestampParsingTools } from './dateFormat';
import { loadData } from './dateFormat';

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
    alwaysExpandSettings: false,
    autopreview: true,
    desktopNotifications: 'unknown',
    defaultCommentLinkType: 'diff',
    defaultSectionLinkType: 'wikilink',
    highlightOwnComments: true,
    insertButtons: cd.config.defaultInsertButtons || [],

    // If the user has never changed the insert buttons configuration, it should change with the
    // default configuration change.
    insertButtonsChanged: false,

    signaturePrefix: '',
    notifications: 'all',
    notificationsBlacklist: [],

    // Not shown in the settings dialog
    showLoadingOverlay: true,

    showToolbar: true,
    watchOnReply: true,
    watchSectionOnReply: true,
  };

  cd.localSettingNames = ['insertButtons', 'insertButtonsChanged'];

  const options = {
    [cd.g.SETTINGS_OPTION_FULL_NAME]: mw.user.options.get(cd.g.SETTINGS_OPTION_FULL_NAME),
    [cd.g.LOCAL_SETTINGS_OPTION_FULL_NAME]: mw.user.options.get(
      cd.g.LOCAL_SETTINGS_OPTION_FULL_NAME
    ),
  }

  // Aliases for seamless transition when changing a setting name.
  cd.settingAliases = {
    allowEditOthersMsgs: ['allowEditOthersComments'],
    desktopNotifications: ['browserNotifications'],
    signaturePrefix: ['mySignature', 'mySig'],
  };

  // Settings in variables like "cdAlowEditOthersComments" used before server-stored settings
  // were implemented.
  Object.keys(cd.defaultSettings).forEach((name) => {
    (cd.settingAliases[name] || []).concat(name).forEach((alias) => {
      const varAlias = 'cd' + firstCharToUpperCase(alias);
      if (varAlias in window && typeof varAlias === typeof cd.defaultSettings[name]) {
        cd.settings[name] = window[alias];
      }
    });
  });

  const remoteSettings = await getSettings({
    options,
    omitLocal: true,
  });
  cd.settings = Object.assign(cd.settings, remoteSettings);

  // Seamless transition from mySignature.
  if (cd.settings.signaturePrefix) {
    // eslint-disable-next-line no-useless-escape
    cd.settings.signaturePrefix = cd.settings.signaturePrefix.replace(/~~\~~/, '')
  }

  if (
    !cd.settings.insertButtonsChanged &&
    JSON.stringify(cd.settings.insertButtons) !== JSON.stringify(cd.config.defaultInsertButtons)
  ) {
    cd.settings.insertButtons = cd.config.defaultInsertButtons;
  }

  cd.settings = Object.assign({}, cd.defaultSettings, cd.settings);

  const needToSetRemote = Object.keys(cd.settings)
    .some((key) => JSON.stringify(cd.settings[key]) !== JSON.stringify(remoteSettings[key]));
  if (needToSetRemote) {
    setSettings().catch((e) => {
      console.warn('Couldn\'t save the settings to the server.', e);
    });
  }

  // FIXME: Temporary, clean the setting with an old name for ruwiki beta version users.
  if (mw.user.options.get('userjs-cd-settings')) {
    setLocalOption('userjs-cd-settings', undefined);
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
  // Set the transparent color for the "focused" color. The user may override the CSS variable value
  // in his personal styles, so we get the existing value first.
  const focusedColor = window.getComputedStyle(document.documentElement)
    .getPropertyValue('--cd-comment-underlay-focused-color');

  // Vector, Monobook, Minerva
  const bodyBackgroundColor = $('#content').length ?
    window.getComputedStyle($('#content').get(0)).backgroundColor :
    'white';

  document.documentElement.style.setProperty(
    '--cd-comment-underlay-focused-transparent-color',
    transparentize(focusedColor || cd.g.COMMENT_UNDERLAY_FOCUSED_COLOR)
  );

  cd.g.nanoCss.put(':root', {
    '--cd-comment-underlay-focused-color': cd.g.COMMENT_UNDERLAY_FOCUSED_COLOR,
    '--cd-comment-underlay-target-color': cd.g.COMMENT_UNDERLAY_TARGET_COLOR,
    '--cd-comment-underlay-new-color': cd.g.COMMENT_UNDERLAY_NEW_COLOR,
    '--cd-comment-underlay-own-color': cd.g.COMMENT_UNDERLAY_OWN_COLOR,
  });
  cd.g.nanoCss.put('.cd-commentOverlay-gradient', {
    backgroundImage: 'linear-gradient(to left, var(--cd-comment-underlay-focused-color), var(--cd-comment-underlay-focused-transparent-color))',
  });
  cd.g.nanoCss.put('.cd-messageArea .cd-closeButton', {
    backgroundColor: bodyBackgroundColor,
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
  cd.g.GENDER_AFFECTS_USER_STRING = /\{\{ *gender *:[^}]+?\|[^}]+?\|/i.test(
    cd.s('es-reply-to', true) +
    cd.s('es-edit-comment-by', true) +
    cd.s('thank-confirm', true)
  );

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

  cd.g.dontHandleScroll = false;
  cd.g.autoScrollInProgress = false;
  cd.g.activeAutocompleteMenu = null;
}

/**
 * Generate regexps, patterns (strings to be parts of regexps), selectors from config values.
 *
 * @private
 */
function initPatterns() {
  cd.g.CONTRIBS_PAGE_LINK_REGEXP = new RegExp(`^${cd.g.CONTRIBS_PAGE}/`);

  const namespaceIds = mw.config.get('wgNamespaceIds');
  const userNamespaces = Object.keys(namespaceIds)
    .filter((key) => [2, 3].includes(namespaceIds[key]));
  const userNamespacesPattern = underlinesToSpaces(userNamespaces.join('|'));
  cd.g.USER_NAMESPACES_REGEXP = new RegExp(`(?:^|:)(?:${userNamespacesPattern}):(.+)`, 'i');

  const anySpace = (s) => s.replace(/:/g, ' : ').replace(/[ _]/g, '[ _]*');

  const allNamespaces = Object.keys(namespaceIds);
  const allNamespacesPattern = anySpace(allNamespaces.join('|'));
  cd.g.ALL_NAMESPACES_REGEXP = new RegExp(`(?:^|:)(?:${allNamespacesPattern}):`, 'i');

  const userNamespacesPatternAnySpace = anySpace(userNamespaces.join('|'));
  const contributionsPageAnySpace = anySpace(cd.g.CONTRIBS_PAGE);
  cd.g.CAPTURE_USER_NAME_PATTERN = (
    `\\[\\[[ _]*:?(?:\\w*:){0,2}(?:(?:${userNamespacesPatternAnySpace})[ _]*:[ _]*|` +
    `(?:Special[ _]*:[ _]*Contributions|${contributionsPageAnySpace})\\/[ _]*)([^|\\]/]+)(/)?`
  );

  const userNamespaceAliases = Object.keys(namespaceIds).filter((key) => namespaceIds[key] === 2);
  const userNamespaceAliasesPatternAnySpace = anySpace(userNamespaceAliases.join('|'));
  cd.g.USER_NAMESPACE_ALIASES_REGEXP = new RegExp(
    `^:?(?:${userNamespaceAliasesPatternAnySpace}):([^/]+)$`,
    'i'
  );

  if (cd.config.unsignedTemplates.length) {
    const unsignedTemplatesPattern = cd.config.unsignedTemplates.join('|');
    cd.g.UNSIGNED_TEMPLATES_PATTERN = (
      `(\\{\\{ *(?:${unsignedTemplatesPattern}) *\\|[ \\u200E]*([^}|]+?)[ \\u200E]*(?:\\|[ \\u200E]*([^}]+?)[ \\u200E]*)?\\}\\})`
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
      commentAntipatternsPatternParts.push(...cd.config.commentAntipatterns);
    }
    const commentAntipatternPattern = commentAntipatternsPatternParts.join('|');
    cd.g.COMMENT_ANTIPATTERNS_REGEXP = new RegExp(`^.*(?:${commentAntipatternPattern}).*$`, 'mg');
  }

  cd.g.ARTICLE_PATH_REGEXP = new RegExp(
    mw.util.escapeRegExp(mw.config.get('wgArticlePath')).replace(mw.util.escapeRegExp('$1'), '(.*)')
  );

  const quoteBeginnings = ['<blockquote>', '<q>'];
  const quoteEndings = ['</blockquote>', '</q>'];
  cd.config.pairQuoteTemplates?.[0].forEach((template) => {
    quoteBeginnings.push(`{{${template}`);
  });
  cd.config.pairQuoteTemplates?.[1].forEach((template) => {
    quoteEndings.push(`{{${template}`);
  });
  const quoteBeginningsPattern = quoteBeginnings.map(mw.util.escapeRegExp).join('|');
  const quoteEndingsPattern = quoteEndings.map(mw.util.escapeRegExp).join('|');
  cd.g.QUOTE_REGEXP = new RegExp(
    `(${quoteBeginningsPattern})([^]*?)(${quoteEndingsPattern})`,
    'ig'
  );

  cd.g.UNHIGHLIGHTABLE_ELEMENTS_CLASSES = cd.g.UNHIGHLIGHTABLE_ELEMENTS_CLASSES
    .concat(cd.config.customUnhighlightableElementsClasses);

  const fileNamespaces = Object.keys(namespaceIds).filter((key) => 6 === namespaceIds[key]);
  const fileNamespacesPatternAnySpace = anySpace(fileNamespaces.join('|'));
  cd.g.FILE_PREFIX_PATTERN = `(?:${fileNamespacesPatternAnySpace}):`;

  // Actually, only the text from "mini" format images should be captured, as in the standard
  // format, the text is not displayed. See "img_thumbnail" in
  // https://ru.wikipedia.org/w/api.php?action=query&meta=siteinfo&siprop=magicwords&formatversion=2.
  // Unfortunately, that would add like 100ms to the server's response time.
  cd.g.FILE_LINK_REGEXP = new RegExp(
    `\\[\\[${cd.g.FILE_PREFIX_PATTERN}[^]+?(?:\\|[^]+?\\|((?:\\[\\[[^]+?\\]\\]|[^|])+?))?\\]\\]`,
    'ig'
  );

  const colonNamespaces = Object.keys(namespaceIds)
    .filter((key) => [6, 14].includes(namespaceIds[key]));
  const colonNamespacesPatternAnySpace = anySpace(colonNamespaces.join('|'));
  cd.g.COLON_NAMESPACES_PREFIX_REGEXP = new RegExp(`^:(?:${colonNamespacesPatternAnySpace}):`, 'i');

  cd.g.BAD_COMMENT_BEGINNINGS = cd.g.BAD_COMMENT_BEGINNINGS
    .concat(new RegExp(`^\\[\\[${cd.g.FILE_PREFIX_PATTERN}.+\\n*(?=[*:#])`))
    .concat(cd.config.customBadCommentBeginnings);

  cd.g.ADD_TOPIC_SELECTORS = ['#ca-addsection a']
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
  cd.g.COMMENT_ELEMENT_PROTOTYPES.disabledThankButton = new OO.ui.ButtonWidget({
    label: cd.s('cm-thank'),
    title: cd.s('cm-thank-disabled-tooltip'),
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
    label: '',
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
    .filter((comment) => comment.newness === 'unseen')
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
    $('<img>')
      .addClass('cd-loadingPopup-logo')
      .attr('src', cd.config.logoDataUrl)
      .appendTo($loadingPopup);
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

  navPanel.closeAllNotifications();

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
    commentForm.$element.detach();
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

  updatePageTitle(0, false);
  updatePageContent(parseData.text, keptData);
}

/**
 * Remove sessions older than 30 days.
 *
 * @param {object[]} data
 * @returns {object}
 * @private
 */
function cleanUpSessions(data) {
  Object.keys(data).forEach((key) => {
    if (
      !data[key].forms?.length ||
      data[key].saveUnixTime < Date.now() - cd.g.SECONDS_IN_A_DAY * 1000 * 30
    ) {
      delete data[key];
    }
  });
  return data;
}

/**
 * Save comment form data to the local storage. (Session storage doesn't allow to restore when the
 * browser has crashed.)
 */
export function saveSession() {
  const forms = cd.commentForms.map((commentForm) => {
    let targetData;
    const target = commentForm.target;
    if (commentForm.target instanceof Comment) {
      targetData = { anchor: target.anchor };
    } else if (target instanceof Section) {
      targetData = {
        headline: target.headline,
        firstCommentAnchor: target.comments[0]?.anchor,
        index: target.id,
      };
    }
    return {
      mode: commentForm.mode,
      targetData,
      // OK, extracting a selector from an element would be too much, and likely unreliable, so we
      // extract a href (the only property that we use in the CommentForm constructor) to put it
      // onto a fake element when restoring the form.
      addSectionLinkHref: commentForm.$addSectionLink?.attr('href'),
      headline: commentForm.headlineInput?.getValue(),
      comment: commentForm.commentInput.getValue(),
      summary: commentForm.summaryInput.getValue(),
      minor: commentForm.minorCheckbox?.isSelected(),
      watch: commentForm.watchCheckbox?.isSelected(),
      watchSection: commentForm.watchSectionCheckbox?.isSelected(),
      noSignature: commentForm.noSignatureCheckbox?.isSelected(),
      delete: commentForm.deleteCheckbox?.isSelected(),
      originalHeadline: commentForm.originalHeadline,
      originalComment: commentForm.originalComment,
      summaryAltered: commentForm.summaryAltered,
      lastFocused: commentForm.lastFocused,
    };
  });
  const saveUnixTime = Date.now();
  const commentFormsData = forms.length ? { forms, saveUnixTime } : {};

  const commentFormsDataAllPagesJson = localStorage.getItem('convenientDiscussions-commentForms');
  let commentFormsDataAllPages;
  try {
    commentFormsDataAllPages = (
      // "||" in case of a falsy value.
      (commentFormsDataAllPagesJson && JSON.parse(commentFormsDataAllPagesJson)) ||
      {}
    );
  } catch (e) {
    console.error(e);
    commentFormsDataAllPages = {};
  }
  commentFormsDataAllPages[mw.config.get('wgPageName')] = commentFormsData;
  localStorage.setItem(
    'convenientDiscussions-commentForms',
    JSON.stringify(commentFormsDataAllPages)
  );
}

/**
 * Restore comment forms using the data saved in the local storage.
 *
 * @param {object} commentFormsData
 * @private
 */
function restoreCommentFormsFromData(commentFormsData) {
  let restored = false;
  const rescue = [];
  commentFormsData.forms.forEach((data) => {
    const property = CommentForm.modeToProperty(data.mode);
    if (data.targetData?.anchor) {
      const comment = Comment.getCommentByAnchor(data.targetData.anchor);
      if (comment?.actionable && !comment[`${property}Form`]) {
        try {
          comment[property](data);
          restored = true;
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
        index: data.targetData.index,
      });
      if (section?.actionable && !section[`${property}Form`]) {
        try {
          section[property](data);
          restored = true;
        } catch (e) {
          console.warn(e);
          rescue.push(data);
        }
      } else {
        rescue.push(data);
      }
    } else if (data.mode === 'addSection') {
      if (!cd.g.CURRENT_PAGE.addSectionForm) {
        const $fakeA = $('<a>').attr('href', data.addSectionLinkHref);
        cd.g.CURRENT_PAGE.addSectionForm = new CommentForm({
          target: cd.g.CURRENT_PAGE,
          mode: data.mode,
          $addSectionLink: $fakeA,
          dataToRestore: data,
        });
        restored = true;
      } else {
        rescue.push(data);
      }
    }
  });
  if (restored) {
    saveSession();
    const notification = mw.notification.notify(cd.s('restore-restored-text'), {
      title: cd.s('restore-restored-title'),
    });
    notification.$notification.on('click', () => {
      if (navPanel.isMounted()) {
        navPanel.goToNextCommentForm(true);
      }
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
  if (cd.g.firstRun) {
    const commentFormsDataAllPagesJson = localStorage.getItem('convenientDiscussions-commentForms');
    if (commentFormsDataAllPagesJson) {
      let commentFormsDataAllPages;
      try {
        // "||" in case of a falsy value.
        commentFormsDataAllPages = JSON.parse(commentFormsDataAllPagesJson) || {};
      } catch (e) {
        console.error(e);
        return;
      }
      commentFormsDataAllPages = cleanUpSessions(commentFormsDataAllPages);
      localStorage.setItem(
        'convenientDiscussions-commentForms',
        JSON.stringify(commentFormsDataAllPages)
      );
      const commentFormsData = commentFormsDataAllPages[mw.config.get('wgPageName')] || {};
      if (commentFormsData.forms) {
        restoreCommentFormsFromData(commentFormsData);
      }
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
    }

    cd.commentForms.forEach((commentForm) => {
      commentForm.checkCodeRequest = null;
      const target = commentForm.target;
      if (target instanceof Comment) {
        if (target.anchor) {
          const comment = Comment.getCommentByAnchor(target.anchor);
          if (comment?.actionable) {
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
          index: target.id,
        });
        if (section?.actionable) {
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
        cd.g.CURRENT_PAGE.addSectionForm = commentForm;
      }
    });
    if (rescue.length) {
      rescueCommentFormsContent(rescue);
    }
  }
  saveSession();

  // Navigation panel doesn't appear on non-existent pages, but sessions are saved and restored on
  // them.
  if (navPanel.isMounted()) {
    navPanel.updateCommentFormButton();
  }
}
