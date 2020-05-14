/**
 * The main function responsible for page processing goes here.
 *
 * @module processPage
 */

import CdError from './CdError';
import Comment from './Comment';
import CommentForm from './CommentForm';
import Parser, { findSpecialElements, windowGetAllTextNodes } from './Parser';
import Section from './Section';
import cd from './cd';
import commentLayers from './commentLayers';
import navPanel from './navPanel';
import { ElementsTreeWalker } from './treeWalker';
import {
  addPreventUnloadCondition,
  globalKeyDownHandler,
  highlightFocused,
  windowResizeHandler,
} from './eventHandlers';
import { adjustDom } from './modifyDom';
import { confirmDialog, editWatchedSections, notFound, settingsDialog } from './modal';
import { generateCommentAnchor, parseCommentAnchor, resetCommentAnchors } from './timestamp';
import { getSettings, getVisits, getWatchedSections } from './options';
import { init, removeLoadingOverlay, restoreCommentForms, saveSession } from './boot';
import { isInline } from './util';
import { setSettings } from './options';

/**
 * Prepare (initialize or reset) various properties, mostly global ones. DOM preparations related to
 * comment layers are also made here.
 *
 * @param {object} [data] Data passed from the main module.
 * @param {Promise} [data.messagesRequest] Promise returned by {@link
 *   module:dateFormat.loadMessages}.
 * @private
 */
async function prepare({ messagesRequest }) {
  cd.g.$root = cd.g.$content.children('.mw-parser-output');
  if (!cd.g.$root.length) {
    cd.g.$root = cd.g.$content;
  }
  cd.g.rootElement = cd.g.$root.get(0);

  /**
   * Collection of all comments on the page ordered the same way as they are ordered in the DOM.
   *
   * @name comments
   * @type {Comment[]}
   * @memberof module:cd~convenientDiscussions
   */
  cd.comments = [];

  /**
   * Collection of all sections on the page ordered the same way as they are ordered in the DOM.
   *
   * @name sections
   * @type {Section[]}
   * @memberof module:cd~convenientDiscussions
   */
  cd.sections = [];

  if (cd.g.firstRun) {
    await init({ messagesRequest });
  } else {
    resetCommentAnchors();
    commentLayers.reset();
  }
}

/**
 * @typedef {object} GetFirstVisibleElementDataReturn
 * @property {Element} element
 * @property {number} top
 */

/**
 * Identify the first visible element from the top of the page and its top offset.
 *
 * @returns {GetFirstVisibleElementDataReturn}
 * @private
 */
function getFirstVisibleElementData() {
  let element;
  let top;
  if (window.pageYOffset !== 0 && cd.g.rootElement.getBoundingClientRect().top <= 0) {
    const treeWalker = new ElementsTreeWalker(cd.g.rootElement.firstElementChild);
    while (true) {
      if (!isInline(treeWalker.currentNode.tagName)) {
        const rect = treeWalker.currentNode.getBoundingClientRect();
        if (rect.bottom >= 0 && rect.height !== 0) {
          element = treeWalker.currentNode;
          top = rect.top;
          if (treeWalker.firstChild()) {
            continue;
          } else {
            break;
          }
        }
      }
      if (!treeWalker.nextSibling()) break;
    }
  }
  return { element, top };
}

/**
 * Perform extra section-related tasks, including adding the `subsections` and `baseSection`
 * properties and binding events.
 *
 * @private
 */
function adjustSections() {
  cd.sections.forEach((section, i) => {
    section.subsections = [];
    cd.sections
      .slice(i + 1)
      .some((otherSection) => {
        if (otherSection.level > section.level) {
          section.subsections.push(otherSection);
          if (section.level === 2) {
            otherSection.baseSection = section;
          }
        } else {
          return true;
        }
      });

    if (section.level > 2) {
      cd.sections
        .slice(0, i)
        .reverse()
        .some((otherSection) => {
          if (otherSection.level < section.level) {
            section.parent = otherSection;
            return true;
          }
        });
    }

    if (!section.frozen && section.level === 2) {
      // Section with the last reply button
      const targetSection = section.subsections.length ?
        section.subsections[section.subsections.length - 1] :
        section;
      if (targetSection.$replyButtonLink) {
        targetSection.$replyButtonLink
          .on('mouseenter', section.replyButtonHoverHandler)
          .on('mouseleave', section.replyButtonUnhoverHandler);
      }
    }
  });
}

/**
 * Parse comments and modify related parts of the DOM.
 *
 * @param {Parser} parser
 * @param {object} firstVisibleElementData
 * @throws {CdError} If there is no comments.
 * @private
 */
function processComments(parser, firstVisibleElementData) {
  const timestamps = parser.findTimestamps();
  const signatures = parser.findSignatures(timestamps);

  signatures.forEach((signature) => {
    try {
      const comment = parser.createComment(signature);
      if (comment.highlightables.length) {
        cd.comments.push(comment);
      }
    } catch (e) {
      if (!(e instanceof CdError)) {
        console.error(e);
      }
    }
  });

  adjustDom(firstVisibleElementData);

  /**
   * The script has processed the comments.
   *
   * @event commentsReady
   * @type {module:cd~convenientDiscussions.comments}
   */
  mw.hook('convenientDiscussions.commentsReady').fire(cd.comments);
}

/**
 * Parse sections and modify some parts of them.
 *
 * @param {Parser} parser
 * @param {Promise} watchedSectionsRequest
 * @private
 */
function processSections(parser, watchedSectionsRequest) {
  const headings = parser.findHeadings();

  headings.forEach((heading) => {
    try {
      const section = parser.createSection(heading, watchedSectionsRequest);
      if (section.id !== undefined) {
        cd.sections.push(section);
      }
    } catch (e) {
      if (!(e instanceof CdError)) {
        console.error(e);
      }
    }
  });

  cd.sections.forEach((section, i) => {
    section.isLastSection = i === cd.sections.length - 1;
  });

  adjustSections();

  // Make section menus move to the next line without taking the last word of the heading with them.
  const $space = $('<span>')
    .addClass('cd-spaceBeforeSectionMenu')
    .text(' ');
  $('.mw-headline').each(function () {
    $(this).append($space.clone());
  });

  /**
   * The script has processed the sections.
   *
   * @event sectionsReady
   * @type {module:cd~convenientDiscussions.sections}
   */
  mw.hook('convenientDiscussions.sectionsReady').fire(cd.sections);
}

/**
 * Bind a click handler to every known "Add new topic" button.
 *
 * @private
 */
function connectToAddTopicLinks() {
  $(cd.g.ADD_TOPIC_SELECTORS)
    .off('click.cd')
    .on('click.cd', function (e) {
      const href = $(this).attr('href');

      // Ignore buttons that open an edit page with the "preload" parameter. TODO: Should we include
      // the "preload" parameter functionality in the script?
      if (e.ctrlKey || e.shiftKey || mw.util.getParamValue('preload', href)) return;

      e.preventDefault();

      const editintro = mw.util.getParamValue('editintro', href);

      if (cd.g.addSectionForm) {
        cd.g.addSectionForm.headlineInput.focus();
      } else {
        cd.g.addSectionForm = new CommentForm({
          mode: 'addSection',
          $addSectionLink: $(this),
          scrollIntoView: true,
          editintro,
        });
      }
    })
    .attr('title', cd.s('addtopicbutton-tooltip'));
}

/**
 * Perform fragment-related tasks, as well as comment anchor-related ones.
 *
 * @param {string} keptCommentAnchor
 * @param {string} keptSectionAnchor
 * @private
 */
async function processFragment(keptCommentAnchor, keptSectionAnchor) {
  let fragment;
  let decodedFragment;
  let escapedFragment;
  let escapedDecodedFragment;
  let commentAnchor;
  if (cd.g.firstRun) {
    fragment = location.hash.slice(1);
    try {
      decodedFragment = decodeURIComponent(fragment);
    } catch (e) {
      console.error(e);
    }
    escapedFragment = $.escapeSelector(fragment);
    escapedDecodedFragment = decodedFragment && $.escapeSelector(decodedFragment);
    if (/^\d{12}_.+$/.test(fragment)) {
      commentAnchor = decodedFragment;
    }
  } else {
    commentAnchor = keptCommentAnchor;
  }

  let date;
  let author;
  let comment;
  if (commentAnchor) {
    ({ date, author } = parseCommentAnchor(commentAnchor) || {});
    comment = Comment.getCommentByAnchor(commentAnchor);

    if (!keptCommentAnchor && !comment) {
      let commentAnchorToCheck;
      // There can be a time difference between the time we know (taken from the watchlist) and the
      // time on the page. We take it to be not higher than 5 minutes for the watchlist.
      for (let gap = 1; !comment && gap <= 5; gap++) {
        const dateToFind = new Date(date.getTime() - cd.g.MILLISECONDS_IN_A_MINUTE * gap);
        commentAnchorToCheck = generateCommentAnchor(dateToFind, author);
        comment = Comment.getCommentByAnchor(commentAnchorToCheck);
      }
    }

    if (comment) {
      // setTimeout is for Firefox - for some reason, without it Firefox positions the underlay
      // incorrectly.
      setTimeout(() => {
        comment.scrollToAndHighlightTarget(false);
      }, 0);
    }
  }

  if (keptSectionAnchor) {
    const section = Section.getSectionByAnchor(keptSectionAnchor);
    if (section) {
      section.$elements.first().cdScrollTo('top', false);
    }
  }

  if (cd.g.firstRun) {
    const fragmentHasNoTarget = (
      decodedFragment &&
      !comment &&
      !cd.config.idleFragments.includes(decodedFragment) &&
      !decodedFragment.startsWith('/media/') &&
      !$(':target').length &&
      !$(`a[name="${escapedDecodedFragment}"]`).length &&
      !$(`*[id="${escapedDecodedFragment}"]`).length &&
      !$(`a[name="${escapedFragment}"]`).length &&
      !$(`*[id="${escapedFragment}"]`).length
    );

    if (decodedFragment && fragmentHasNoTarget && !cd.g.pageIsInactive) {
      await notFound(decodedFragment, date);
    }
  }
}

/**
 * Highlight comments of the current user.
 *
 * @private
 */
function highlightOwnComments() {
  if (!cd.settings.highlightOwnComments) return;
  const myComments = cd.comments.filter((comment) => comment.own);
  const floatingRects = myComments.length ?
    cd.g.specialElements.floating.map((el) => el.getBoundingClientRect()) :
    undefined;
  myComments.forEach((comment) => comment.configureLayers(false, floatingRects));

  // Faster to add them in one sequence.
  myComments.forEach((comment) => {
    comment.addLayers();
  });
}

/**
 * Ask the user if he wants to receive desktop notifications on first run and ask for a permission
 * if it is default but the user has desktop notifications enabled (for example, if he/she is using
 * a browser different from where he/she has previously used).
 */
async function confirmDesktopNotifications() {
  if (cd.settings.desktopNotifications === 'unknown' && Notification.permission !== 'denied') {
    // Sometimes the setting value is cached.
    getSettings(true).then((settings) => {
      if (settings.desktopNotifications === 'unknown') {
        const actions = [
          {
            label: cd.s('confirm-desktopnotifications-yes'),
            action: 'accept',
            flags: 'primary',
          },
          {
            label: cd.s('confirm-desktopnotifications-no'),
            action: 'reject',
          },
        ];
        confirmDialog(cd.s('confirm-desktopnotifications'), {
          size: 'medium',
          actions,
        }).then((action) => {
          if (action === 'accept') {
            if (Notification.permission === 'default') {
              OO.ui.alert(cd.s('alert-grantpermission'));
              Notification.requestPermission((permission) => {
                if (permission === 'granted') {
                  cd.settings.desktopNotifications = settings.desktopNotifications = 'all';
                  setSettings(settings);
                } else if (permission === 'denied') {
                  cd.settings.desktopNotifications = settings.desktopNotifications = 'none';
                  setSettings(settings);
                }
              });
            } else if (Notification.permission === 'granted') {
              cd.settings.desktopNotifications = settings.desktopNotifications = 'all';
              setSettings(settings);
            }
          } else if (action === 'reject') {
            cd.settings.desktopNotifications = settings.desktopNotifications = 'none';
            setSettings(settings);
          }
        });
      }
    });
  }

  if (cd.settings.desktopNotifications !== 'unknown' && Notification.permission === 'default') {
    await OO.ui.alert(cd.s('alert-grantpermission-again'), { title: cd.s('script-name') });
    Notification.requestPermission();
  }
}

/**
 * Log debug data to the console.
 *
 * @private
 */
function debugLog() {
  const baseTime = (
    cd.debug.timerTotal['main code'] + cd.debug.timerTotal['final code and rendering']
  );
  const timePerComment = baseTime / cd.comments.length;

  cd.debug.logAndResetTimer('total time');
  console.debug(`number of comments: ${cd.comments.length}`);
  console.debug(`per comment: ${timePerComment.toFixed(2)}`);
  cd.debug.logAndResetEverything();
}

/**
 * Process the page.
 *
 * @param {object} [keptData={}] Data passed from the previous page state or the main module.
 * @param {string} [keptData.commentAnchor] Comment anchor to scroll to.
 * @param {string} [keptData.sectionAnchor] Section anchor to scroll to.
 * @param {boolean} [keptData.createdPage] The page was created while it was in the previous state.
 * @param {number} [keptData.scrollPosition] The page Y offset.
 * @param {object[]} [keptData.unseenCommentAnchors] Anchors of unseen comments on this page.
 * @param {string} [keptData.justWatchedSection] Section just watched so that there could be not
 *    enough time for it to be saved on the server.
 * @param {string} [keptData.justUnwatchedSection] Section just unwatched so that there could be not
 *    enough time for it to be saved on the server.
 * @param {Promise} [keptData.messagesRequest] Promise returned by {@link
 *   module:dateFormat.loadMessages}.
 * @fires commentsReady
 * @fires sectionsReady
 * @fires pageReady
 */
export default async function processPage(keptData = {}) {
  cd.debug.stopTimer(cd.g.firstRun ? 'loading data' : 'laying out HTML');
  cd.debug.startTimer('preparations');

  await prepare(keptData);

  const firstVisibleElementData = cd.g.firstRun ? getFirstVisibleElementData() : {};

  cd.debug.stopTimer('preparations');
  cd.debug.startTimer('main code');

  cd.g.IS_ARCHIVE_PAGE = Boolean(
    cd.config.archivePathRegexp &&
    cd.config.archivePathRegexp.test(cd.g.CURRENT_PAGE)
  );

  // This isn't static: a 404 page doesn't have an ID and is considered inactive, but if the user
  // adds a topic to it, it will become active and get an ID.
  cd.g.pageIsInactive = Boolean(
    !mw.config.get('wgArticleId') ||
    cd.g.IS_ARCHIVE_PAGE ||
    (
      (mw.util.getParamValue('diff') || mw.util.getParamValue('oldid')) &&
      mw.config.get('wgRevisionId') !== mw.config.get('wgCurRevisionId')
    )
  );

  // For testing
  cd.g.editWatchedSections = editWatchedSections;
  cd.g.settingsDialog = settingsDialog;

  let watchedSectionsRequest;
  if (mw.config.get('wgArticleId')) {
    watchedSectionsRequest = getWatchedSections(true, keptData);
    watchedSectionsRequest.catch((e) => {
      console.warn('Couldn\'t load the settings from the server.', e);
    });
  }
  const visitsRequest = !cd.g.pageIsInactive ? getVisits(true) : undefined;

  cd.g.specialElements = findSpecialElements();

  if (cd.config.customBeforeParse) {
    cd.config.customBeforeParse();
  }

  cd.debug.startTimer('process comments');

  const parser = new Parser({
    CommentClass: Comment,
    SectionClass: Section,
    childElementsProperty: 'children',
    document,
    follows: (el1, el2) => el1.compareDocumentPosition(el2) & Node.DOCUMENT_POSITION_PRECEDING,
    getAllTextNodes: windowGetAllTextNodes,
    getElementByClassName: (node, className) => node.querySelector(`.${className}`),
  });

  try {
    processComments(parser, firstVisibleElementData);
  } catch (e) {
    console.error(e);
  }

  cd.debug.stopTimer('process comments');
  cd.debug.startTimer('process sections');

  processSections(parser, watchedSectionsRequest);

  cd.debug.stopTimer('process sections');

  connectToAddTopicLinks();

  cd.debug.stopTimer('main code');
  // Operations that need reflow, such as getBoundingClientRect(), go in this section.
  cd.debug.startTimer('final code and rendering');

  // Restore the initial viewport position in terms of visible elements which is how the user sees
  // it.
  if (firstVisibleElementData.element || keptData.scrollPosition) {
    const y = firstVisibleElementData.element ?
      (
        window.pageYOffset + firstVisibleElementData.element.getBoundingClientRect().top -
        firstVisibleElementData.top
      ) :
      keptData.scrollPosition;
    window.scrollTo(0, y);
  }

  // This should be below viewport position restoration, as it may rely on elements that are made
  // invisible after comment forms restoration.
  restoreCommentForms();

  highlightOwnComments();

  processFragment(keptData.commentAnchor, keptData.sectionAnchor);

  // New comments highlighting and navigation
  if (!cd.g.pageIsInactive) {
    if (cd.g.firstRun || keptData.createdPage) {
      navPanel.mount();
    } else {
      navPanel.reset();
    }

    navPanel.processVisits(visitsRequest, keptData.unseenCommentAnchors);
  }

  if (cd.g.firstRun) {
    // `mouseover` allows to capture the event when the cursor is not moving but ends up above the
    // element (for example, as a result of scrolling).
    $(document).on('mousemove mouseover', highlightFocused);
    $(window).on('resize orientationchange', windowResizeHandler);
    addPreventUnloadCondition('commentForms', () => {
      saveSession(true);
      return (
        mw.user.options.get('useeditwarning') &&
        (
          CommentForm.getLastActiveAlteredCommentForm() ||
          (alwaysConfirmLeavingPage && cd.commentForms.length)
        )
      );
    });
  }

  if ((cd.g.firstRun && !cd.g.pageIsInactive) || keptData.createdPage) {
    $(document)
      .on('keydown', globalKeyDownHandler)
      .on('scroll resize orientationchange', () => {
        navPanel.registerSeenComments();
        navPanel.updateCommentFormButton();
      });

    // Mutation observer doesn't track all cases unfortunately.
    setInterval(() => {
      commentLayers.redrawIfNecessary();
    }, 1000);

    // Mutation observer. Delay for 500ms (arbitrary value) to avoid firing too many mutation events
    // while the script finishes to execute.
    setTimeout(() => {
      const observer = new MutationObserver((records) => {
        if (
          records.every((record) => /^cd-(underlay|overlay|layers)/.test(record.target.className))
        ) {
          return;
        }
        commentLayers.redrawIfNecessary();
      });
      observer.observe(cd.g.$content.get(0), {
        attributes: true,
        childList: true,
        subtree: true,
      });
    }, 500);
  }

  let alwaysConfirmLeavingPage = false;
  if (mw.user.options.get('editondblclick')) {
    mw.loader.using('mediawiki.action.view.dblClickEdit').then(() => {
      $('#ca-edit').off('click');
      alwaysConfirmLeavingPage = true;
    });
  }

  if (mw.user.options.get('editsectiononrightclick')) {
    mw.loader.using('mediawiki.action.view.rightClickEdit').then(() => {
      $('.mw-editsection a').off('click');
      alwaysConfirmLeavingPage = true;
    });
  }

  if (cd.g.firstRun) {
    confirmDesktopNotifications();
  }

  /**
   * The script has processed the page.
   *
   * @event pageReady
   * @type {module:cd~convenientDiscussions}
   */
  mw.hook('convenientDiscussions.pageReady').fire(cd);

  removeLoadingOverlay();

  cd.g.firstRun = false;

  // The next line is needed to calculate the rendering time: it won't run until everything gets
  // rendered.
  cd.g.rootElement.getBoundingClientRect();

  cd.debug.stopTimer('final code and rendering');
  cd.debug.stopTimer('total time');

  debugLog();
}
