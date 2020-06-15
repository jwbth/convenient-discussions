/**
 * Initialization, page loading, reloading, and session-related functions.
 *
 * @module boot
 */

import CdError from './CdError';
import Comment from './Comment';
import CommentForm from './CommentForm';
import Section from './Section';
import cd from './cd';
import jqueryExtensions from './jqueryExtensions';
import navPanel, { updatePageTitle } from './navPanel';
import processPage from './processPage';
import {
  caseInsensitiveFirstCharPattern,
  firstCharToUpperCase,
  transparentize,
  underlinesToSpaces,
} from './util';
import { createWindowManager, rescueCommentFormsContent } from './modal';
import { getCurrentPageData, getUserInfo } from './apiWrappers';
import { initTimestampParsingTools } from './dateFormat';
import { loadMessages } from './dateFormat';
import { setSettings } from './options';

/**
 * Initiate user settings.
 */
export function initSettings() {
  /**
   * Script settings of the current user.
   *
   * @name settings
   * @type {object}
   * @memberof module:cd~convenientDiscussions
   */
  cd.settings = cd.settings || {};

  /**
   * Default settings.
   *
   * @name defaultSetings
   * @type {object}
   * @memberof module:cd~convenientDiscussions
   */
  // We fill the settings after the modules are loaded so that the user settings had less chance not
  // to load.
  cd.defaultSettings = {
    allowEditOthersComments: false,
    alwaysExpandSettings: false,
    autopreview: true,
    desktopNotifications: 'unknown',
    defaultCommentLinkType: cd.config.defaultCommentLinkType || 'diff',
    defaultSectionLinkType: 'wikilink',
    highlightOwnComments: true,
    // If the user has never changed the insert buttons configuration, it should change with the
    // default configuration change.
    insertButtonsChanged: false,
    insertButtons: cd.config.defaultInsertButtons || [],
    signaturePrefix: '',
    notifications: 'all',
    notificationsBlacklist: [],
    // Not shown in the settings dialog
    showLoadingOverlay: true,
    showToolbar: true,
    watchSectionOnReply: true,
  };

  // Aliases for seamless transition when changing a setting name.
  const aliases = {
    allowEditOthersMsgs: ['allowEditOthersComments'],
    desktopNotifications: ['browserNotifications'],
    signaturePrefix: ['mySignature', 'mySig'],
  };

  let nativeSettings;
  try {
    nativeSettings = JSON.parse(mw.user.options.get(cd.g.SETTINGS_OPTION_FULL_NAME)) || {};
  } catch (e) {
    nativeSettings = {};
  }

  Object.keys(cd.defaultSettings).forEach((name) => {
    (aliases[name] || [])
      .concat(name)
      .forEach((alias) => {
        // Settings in variables like "cdAlowEditOthersComments"
        const varAlias = 'cd' + firstCharToUpperCase(alias);
        if (varAlias in window && typeof varAlias === typeof cd.defaultSettings[name]) {
          cd.settings[name] = nativeSettings[alias];
        }

        // Native settings rewrite those set via personal JS.
        if (
          nativeSettings[alias] !== undefined &&
          typeof nativeSettings[alias] === typeof cd.defaultSettings[name]
        ) {
          cd.settings[name] = nativeSettings[alias];
        }
      });
  });

  // Seamless transition from mySignature.
  if (cd.settings.signaturePrefix) {
    // eslint-disable-next-line no-useless-escape
    cd.settings.signaturePrefix = cd.settings.signaturePrefix.replace(/~~\~~/, '')
  }

  if (
    !cd.settings.insertButtonsChanged &&
    JSON.stringify(nativeSettings.insertButtons) !== JSON.stringify(cd.config.defaultInsertButtons)
  ) {
    cd.settings.insertButtons = cd.config.defaultInsertButtons;
  }

  cd.settings = Object.assign({}, cd.defaultSettings, cd.settings);

  if (JSON.stringify(cd.settings) !== mw.user.options.get(cd.g.SETTINGS_OPTION_FULL_NAME)) {
    setSettings().catch((e) => {
      console.warn('Couldn\'t save the settings to the server.', e);
    });
  }
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
 * Create various global objects' (`convenientDiscussions`, `$`) properties and methods. Executed at
 * the first run.
 *
 * @param {object} [data] Data passed from the main module.
 * @param {Promise} [data.messagesRequest] Promise returned by {@link
 *   module:dateFormat.loadMessages}.
 */
export async function init({ messagesRequest }) {
  cd.g.api = cd.g.api || new mw.Api();

  await (messagesRequest || loadMessages());
  initSettings();
  initTimestampParsingTools();

  if (cd.config.tagName) {
    cd.g.SUMMARY_POSTFIX = '';
    cd.g.SUMMARY_LENGTH_LIMIT = mw.config.get('wgCommentCodePointLimit');
  } else {
    cd.g.SUMMARY_POSTFIX = ` ([[${cd.config.helpWikilink}|${cd.s('script-name-short')}]])`;
    cd.g.SUMMARY_LENGTH_LIMIT = (
      mw.config.get('wgCommentCodePointLimit') - cd.g.SUMMARY_POSTFIX.length
    );
  }

  cd.g.CONTRIBS_PAGE_LINK_REGEXP = new RegExp(`^${cd.g.CONTRIBS_PAGE}/`);
  cd.g.CURRENT_USER_GENDER = mw.user.options.get('gender');
  cd.g.QQX_MODE = mw.util.getParamValue('uselang') === 'qqx';

  // {{gender:}} with at least two pipes in a selection of the affected strings.
  cd.g.GENDER_AFFECTS_USER_STRING = /\{\{ *gender *:[^}]+?\|[^}]+?\|/i
    .test(cd.s('es-reply-to') + cd.s('es-edit-comment-by') + cd.s('thank-confirm'));

  cd.g.dontHandleScroll = false;
  cd.g.autoScrollInProgress = false;

  /**
   * Collection of all comment forms on the page in the order of their creation.
   *
   * @name commentForms
   * @type {CommentForm[]}
   * @memberof module:cd~convenientDiscussions
   */
  cd.commentForms = [];


  /* Generate regexps, patterns (strings to be parts of regexps), selectors from config values */

  const namespaceIds = mw.config.get('wgNamespaceIds');
  const userNamespaces = Object.keys(namespaceIds)
    .filter((key) => [2, 3].includes(namespaceIds[key]));
  const userNamespacesPattern = underlinesToSpaces(userNamespaces.join('|'));
  cd.g.USER_NAMESPACES_REGEXP = new RegExp(`(?:^|:)(?:${userNamespacesPattern}):(.+)`, 'i');

  const anySpace = (s) => s.replace(/:/g, ' : ').replace(/[ _]/g, '[ _]*');

  const userNamespacesPatternAnySpace = anySpace(userNamespaces.join('|'));
  const contributionsPageAnySpace = anySpace(cd.g.CONTRIBS_PAGE);
  cd.g.CAPTURE_USER_NAME_PATTERN = (
    `\\[\\[[ _]*:?(?:\\w*:){0,2}(?:(?:${userNamespacesPatternAnySpace})[ _]*:[ _]*|` +
    `(?:Special[ _]*:[ _]*Contributions|${contributionsPageAnySpace})\\/[ _]*)([^|\\]/]+)(/)?`
  );

  if (cd.config.unsignedTemplates.length) {
    const unsignedTemplatesPattern = cd.config.unsignedTemplates
      .map(caseInsensitiveFirstCharPattern)
      .join('|');
    cd.g.UNSIGNED_TEMPLATES_REGEXP = new RegExp(`(\\{\\{ *(?:${unsignedTemplatesPattern}) *\\|[ \\u200E]*([^}|]+?)[ \\u200E]*(?:\\|[ \\u200E]*([^}]+?)[ \\u200E]*)?\\}\\}).*\\n`, 'g');
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
      signaturePrefixPattern + signatureBeginning + '$'
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
  cd.config.pairQuoteTemplates.forEach((template) => {
    quoteBeginnings.push(`{{${template[0]}`);
    quoteEndings.push(`{{${template[1]}`);
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

  cd.g.BAD_COMMENT_BEGINNINGS = cd.g.BAD_COMMENT_BEGINNINGS
    .concat([new RegExp(`^\\[\\[${cd.g.FILE_PREFIX_PATTERN}.+\\n*(?=[*:#])`)])
    .concat(cd.config.customBadCommentBeginnings);

  cd.g.ADD_TOPIC_SELECTORS = ['#ca-addsection a']
    .concat(cd.config.customAddTopicLinkSelectors)
    .join(', ');

  const mergeRegexps = (arr) => {
    const pattern = arr
      .map((regexpOrString) => regexpOrString.source || regexpOrString)
      .join('|');
    return pattern ? new RegExp(`(${pattern})`) : null;
  };

  cd.g.PAGE_WHITE_LIST_REGEXP = mergeRegexps(cd.config.pageWhiteList);
  cd.g.PAGE_BLACK_LIST_REGEXP = mergeRegexps(cd.config.pageBlackList);
  cd.g.ARCHIVE_PATHS_REGEXP = mergeRegexps(cd.config.archivePaths);
  cd.g.PAGES_WITHOUT_ARCHIVES_REGEXP = mergeRegexps(cd.config.pagesWithoutArchives);


  /* OOUI */

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


  /* Extensions */

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

  keptData.scrollPosition = window.pageYOffset;

  navPanel.closeAllNotifications();

  cd.debug.init();
  cd.debug.startTimer('total time');
  cd.debug.startTimer('getting HTML');

  setLoadingOverlay();

  // Save time by requesting the options in advance.
  getUserInfo().catch((e) => {
    console.warn(e);
  });

  let pageData;
  try {
    pageData = await getCurrentPageData(true);
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
    wgRevisionId: pageData.revid,
    wgCurRevisionId: pageData.revid,
  });
  mw.loader.load(pageData.modules);
  mw.loader.load(pageData.modulestyles);
  mw.config.set(pageData.jsconfigvars);

  // Remove the fragment
  history.replaceState(history.state, '', location.pathname + location.search);

  updatePageTitle(0, false);
  updatePageContent(pageData.text, keptData);
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
      !data[key].forms ||
      !data[key].forms.length ||
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
        firstCommentAnchor: target.comments[0] && target.comments[0].anchor,
        index: target.id,
      };
    }
    return {
      mode: commentForm.mode,
      targetData,
      // OK, extracting a selector from an element would be too much, and likely unreliable, so we
      // extract a href (the only property that we use in the CommentForm constructor) to put it
      // onto a fake element when restoring the form.
      addSectionLinkHref: commentForm.$addSectionLink && commentForm.$addSectionLink.attr('href'),
      headline: commentForm.headlineInput && commentForm.headlineInput.getValue(),
      comment: commentForm.commentInput.getValue(),
      summary: commentForm.summaryInput.getValue(),
      minor: commentForm.minorCheckbox && commentForm.minorCheckbox.isSelected(),
      watch: commentForm.watchCheckbox && commentForm.watchCheckbox.isSelected(),
      watchSection: (
        commentForm.watchSectionCheckbox && commentForm.watchSectionCheckbox.isSelected()
      ),
      ping: commentForm.pingCheckbox && commentForm.pingCheckbox.isSelected(),
      small: commentForm.smallCheckbox && commentForm.smallCheckbox.isSelected(),
      noSignature: commentForm.noSignatureCheckbox && commentForm.noSignatureCheckbox.isSelected(),
      delete: commentForm.deleteCheckbox && commentForm.deleteCheckbox.isSelected(),
      originalHeadline: commentForm.originalHeadline,
      originalComment: commentForm.originalComment,
      summaryAltered: commentForm.summaryAltered,
      lastFocused: commentForm.lastFocused,
    };
  });
  const commentFormsData = forms.length ?
    {
      forms,
      saveUnixTime: Date.now(),
    } :
    {};

  const commentFormsDataAllPagesJson = localStorage.getItem('convenientDiscussions-commentForms');
  let commentFormsDataAllPages;
  try {
    commentFormsDataAllPages = (
      commentFormsDataAllPagesJson &&
      // "||" in case of a falsy value.
      JSON.parse(commentFormsDataAllPagesJson) ||
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
  const restored = [];
  const rescue = [];
  commentFormsData.forms.forEach((data) => {
    const property = CommentForm.modeToProperty(data.mode);
    if (data.targetData && data.targetData.anchor) {
      const comment = Comment.getCommentByAnchor(data.targetData.anchor);
      if (comment && !comment[`${property}Form`]) {
        comment[property](data);
        restored.push(comment[`${property}Form`]);
      } else {
        rescue.push(data);
      }
    } else if (data.targetData && data.targetData.headline) {
      const section = Section.search({
        headline: data.targetData.headline,
        firstCommentAnchor: data.targetData.firstCommentAnchor,
        index: data.targetData.index,
      });
      if (section && !section[`${property}Form`]) {
        section[property](data);
        restored.push(section[`${property}Form`]);
      } else {
        rescue.push(data);
      }
    } else if (data.mode === 'addSection') {
      if (!cd.g.addSectionForm) {
        const $fakeA = $('<a>').attr('href', data.addSectionLinkHref);
        cd.g.addSectionForm = new CommentForm({
          mode: data.mode,
          $addSectionLink: $fakeA,
          dataToRestore: data,
        });
        restored.push(cd.g.addSectionForm);
      } else {
        rescue.push(data);
      }
    }
  });
  if (restored.length) {
    saveSession();
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
        mw.notify(cd.s('restore-restored-text'), { title: cd.s('restore-restored-title') });
      }
    }
  } else {
    const rescue = [];
    cd.commentForms.forEach((commentForm) => {
      commentForm.checkCodeRequest = null;
      const target = commentForm.target;
      if (target instanceof Comment) {
        if (target.anchor) {
          const comment = Comment.getCommentByAnchor(target.anchor);
          if (comment) {
            commentForm.setTargets(comment);
            comment[CommentForm.modeToProperty(commentForm.mode)](commentForm);
            commentForm.addToPage();
          } else {
            rescue.push({
              headline: commentForm.headlineInput && commentForm.headlineInput.getValue(),
              comment: commentForm.commentInput.getValue(),
              summary: commentForm.summaryInput.getValue(),
            });
          }
        }
      } else if (target instanceof Section) {
        const section = Section.search({
          headline: target.headline,
          firstCommentAnchor: target.comments[0] && target.comments[0].anchor,
          index: target.id,
        });
        if (section) {
          commentForm.setTargets(section);
          section[CommentForm.modeToProperty(commentForm.mode)](commentForm);
          commentForm.addToPage();
        } else {
          rescue.push({
            headline: commentForm.headlineInput && commentForm.headlineInput.getValue(),
            comment: commentForm.commentInput.getValue(),
            summary: commentForm.summaryInput.getValue(),
          });
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
  if (navPanel.isMounted()) {
    navPanel.updateCommentFormButton();
  }
}
