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
import navPanel from './navPanel';
import processPage from './processPage';
import {
  caseInsensitiveFirstCharPattern,
  firstCharToUpperCase,
  removeDuplicates,
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
    browserNotifications: 'unknown',
    defaultCommentLinkType: cd.config.defaultCommentLinkType || 'diff',
    defaultSectionLinkType: 'wikilink',
    highlightOwnComments: true,

    // If the user has never changed the insert buttons configuration, it should change with the
    // default configuration change.
    insertButtonsChanged: false,

    insertButtons: cd.config.defaultInsertButtons || [],
    // Minifier translates "~~\~~" and "'~~' + '~~'" into "~~~~".
    mySignature: '~~'.concat('~~'),
    notifications: 'all',
    notificationsBlacklist: [],
    // Not shown in the settings dialog
    showLoadingOverlay: true,
    showToolbar: true,
    watchSectionOnReply: true,
  };

  let nativeSettings;
  try {
    nativeSettings = JSON.parse(mw.user.options.get(cd.g.SETTINGS_OPTION_FULL_NAME)) || {};
  } catch (e) {
    nativeSettings = {};
  }

  Object.keys(cd.defaultSettings).forEach((name) => {
    // Settings in variables like "cdAlowEditOthersComments"
    const settingName = 'cd' + firstCharToUpperCase(name);
    if (settingName in window) {
      cd.settings[name] = window[settingName];
    }

    // Native settings rewrite those set via personal JS.
    if (
      nativeSettings[name] !== undefined &&
      typeof nativeSettings[name] === typeof cd.defaultSettings[name]
    ) {
      cd.settings[name] = nativeSettings[name];
    }
  });

  if (
    !cd.settings.insertButtonsChanged &&
    JSON.stringify(nativeSettings.insertButtons) !== JSON.stringify(cd.config.defaultInsertButtons)
  ) {
    cd.settings.insertButtons = cd.config.defaultInsertButtons;
  }

  cd.settings = Object.assign({}, cd.defaultSettings, cd.settings);

  if (JSON.stringify(cd.settings) !== mw.user.options.get(cd.g.SETTINGS_OPTION_FULL_NAME)) {
    try {
      setSettings();
    } catch (e) {
      console.error('Couldn\'t save the settings', e);
    }
  }
}

/**
 * Set CSS for talk pages.
 *
 * @private
 */
function initCss() {
  const bodyBackgroundColor = $('#content').length ?
    window.getComputedStyle($('#content').get(0)).backgroundColor :
    'white';
  cd.g.nanoCss.put(':root', {
    '--cd-comment-underlay-new-color': cd.g.COMMENT_UNDERLAY_NEW_COLOR,
    '--cd-comment-underlay-own-color': cd.g.COMMENT_UNDERLAY_OWN_COLOR,
    '--cd-comment-underlay-focused-color': cd.g.COMMENT_UNDERLAY_FOCUSED_COLOR,
    '--cd-comment-underlay-focused-transparent-color': (
      transparentize(cd.g.COMMENT_UNDERLAY_FOCUSED_COLOR)
    ),
  });
  cd.g.nanoCss.put('.cd-commentOverlay-gradient', {
    backgroundImage: `linear-gradient(to left, var(--cd-comment-underlay-focused-color), var(--cd-comment-underlay-focused-transparent-color))`,
  });
  cd.g.nanoCss.put('.cd-messageArea .cd-closeButton', { backgroundColor: bodyBackgroundColor });
}

/**
 * Initiate various global objects' (`convenientDiscussions`, `$`) properties and methods. Executed
 * at the first run.
 */
export async function init() {
  cd.g.api = cd.g.api || new mw.Api();

  await cd.g.messagesRequest || loadMessages();
  initCss();
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


  /* OOUI */

  createWindowManager();

  // OOUI button prototypes. Saves a little time.
  cd.g.COMMENT_ELEMENT_PROTOTYPES = {};
  cd.g.SECTION_ELEMENT_PROTOTYPES = {};

  cd.g.COMMENT_ELEMENT_PROTOTYPES.goToParentButton = new OO.ui.ButtonWidget({
    label: cd.s('cm-gotoparent'),
    title: cd.s('cm-gotoparent-tooltip'),
    framed: false,
    classes: ['cd-button', 'cd-commentButton'],
  }).$element.get(0);
  const defaultTypeProperty = (
    `cm-copylink-tooltip-${cd.settings.defaultCommentLinkType.toLowerCase()}`
  );
  cd.g.COMMENT_ELEMENT_PROTOTYPES.linkButton = new OO.ui.ButtonWidget({
    label: cd.s('cm-copylink'),
    title: cd.s('cm-copylink-tooltip', cd.s(defaultTypeProperty)),
    framed: false,
    classes: ['cd-button', 'cd-commentButton'],
  }).$element.get(0);
  cd.g.COMMENT_ELEMENT_PROTOTYPES.thankButton = new OO.ui.ButtonWidget({
    label: cd.s('cm-thank'),
    title: cd.s('cm-thank-tooltip'),
    framed: false,
    classes: ['cd-button', 'cd-commentButton'],
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
    label: cd.s('section-addsubsection'),
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
  // End OOUI button prototypes


  const currentUserSignature = mw.user.options.get('nickname');
  const authorInSignatureMatch = currentUserSignature.match(
    new RegExp(`\\s*${cd.g.CAPTURE_USER_NAME_PATTERN}`, 'i')
  );
  if (authorInSignatureMatch) {
    // Signature contents before the user name - in order to cut it out from comment endings when
    // editing.
    const textBeforeSignature = (
      cd.settings.mySignature !== cd.defaultSettings.mySignature &&
      // Minifier translates "~~\~~" and "'~~' + '~~'" into "~~~~".
      cd.settings.mySignature.includes('~~'.concat('~'))
    ) ?
      mw.util.escapeRegExp(
        // Minifier translates "~~\~~" and "'~~' + '~~'" into "~~~~".
        cd.settings.mySignature.slice(0, cd.settings.mySignature.indexOf('~~'.concat('~')))
      ) :
      '';
    const signatureBeginning = mw.util.escapeRegExp(
      currentUserSignature.slice(0, authorInSignatureMatch.index)
    );
    cd.g.CURRENT_USER_SIGNATURE_PREFIX_REGEXP = new RegExp(
      textBeforeSignature + signatureBeginning + '$'
    );
  }

  const pniePattern = cd.g.POPULAR_NOT_INLINE_ELEMENTS.join('|');
  cd.g.PNIE_PATTERN = `(?:${pniePattern})`;

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

  const file = removeDuplicates(['File', mw.msg('file-anchor-link')]).join('|');
  cd.g.BAD_COMMENT_BEGINNINGS = cd.g.BAD_COMMENT_BEGINNINGS
    .concat([new RegExp(`^\\[\\[(?:${file}):.*\\n*(?=[*:#])`)])
    .concat(cd.config.customBadCommentBeginnings);

  cd.g.ADD_TOPIC_SELECTORS = ['#ca-addsection a']
    .concat(cd.config.customAddTopicLinkSelectors)
    .join(', ');

  cd.g.REGULAR_LINE_HEIGHT = parseFloat(window.getComputedStyle(cd.g.rootElement).lineHeight);


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

  cd.g.$content.html(html);

  // We could say "let it crash", but, well, unforeseen errors in processPage() are just too likely
  // to go without a safeguard.
  try {
    await processPage(
      Object.assign({}, keptData, { unseenCommentAnchors: getUnseenCommentAnchors() })
    );
  } catch (e) {
    mw.notify(cd.s('error-reloadpage'), { type: 'error' });
    removeLoadingOverlay();
    console.error(e);
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
  cd.g.pageOverlayOn = true;
}

/**
 * Remove the loading overlay.
 */
export function removeLoadingOverlay() {
  if (!$loadingPopup || isShowLoadingOverlaySettingOff()) return;
  $loadingPopup.hide();
  cd.g.pageOverlayOn = false;
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

  // Save time by requesting options in advance.
  getUserInfo();

  let pageData;
  try {
    pageData = await getCurrentPageData();
  } catch (e) {
    removeLoadingOverlay();
    if (keptData.commentAnchor) {
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
      !data[key][0] ||
      data[key][0].saveUnixTime < Date.now() - cd.g.SECONDS_IN_A_DAY * 1000 * 30
    ) {
      delete data[key];
    }
  });
  return data;
}

/**
 * Save comment form data (so far) to the local storage. (Session storage doesn't allow to restore
 * when the browser has crashed.)
 */
export function saveSession() {
  const commentFormsData = cd.commentForms.map((commentForm) => {
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
      // onto a fake element.
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
      isSummaryAltered: commentForm.isSummaryAltered,
      lastFocused: commentForm.lastFocused,
      saveUnixTime: Date.now(),
    };
  });

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
 * Return saved comment forms to their places.
 */
export function restoreCommentForms() {
  const rescue = [];
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
      const commentFormsData = commentFormsDataAllPages[mw.config.get('wgPageName')] || [];
      commentFormsData.forEach((data) => {
        if (data.targetData && data.targetData.anchor) {
          const comment = Comment.getCommentByAnchor(data.targetData.anchor);
          if (comment) {
            comment[CommentForm.modeToProperty(data.mode)](data);
          } else {
            rescue.push(data);
          }
        } else if (data.targetData && data.targetData.headline) {
          const section = Section.search({
            headline: data.targetData.headline,
            firstCommentAnchor: data.targetData.firstCommentAnchor,
            index: data.targetData.index,
          });
          if (section) {
            section[CommentForm.modeToProperty(data.mode)](data);
          } else {
            rescue.push(data);
          }
        } else if (data.mode === 'addSection') {
          const $fakeA = $('<a>').attr('href', data.addSectionLinkHref);
          cd.g.addSectionForm = new CommentForm({
            mode: data.mode,
            $addSectionLink: $fakeA,
            dataToRestore: data,
          });
        }
      });
    }
  } else {
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
      }
    });
  }
  if (rescue.length) {
    rescueCommentFormsContent(rescue);
  }
  saveSession();
}
