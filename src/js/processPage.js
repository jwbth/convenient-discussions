/**
 * Web page processing module. Its only export, `processPage()`, is executed after {@link module:app
 * the main module} on first run and as part of {@link module:boot.reloadPage} on subsequent runs.
 *
 * @module processPage
 */

import CdError from './CdError';
import Comment from './Comment';
import CommentForm from './CommentForm';
import Page from './Page';
import Parser, { findSpecialElements, windowGetAllTextNodes } from './Parser';
import Section from './Section';
import cd from './cd';
import commentLayers from './commentLayers';
import navPanel from './navPanel';
import toc from './toc';
import updateChecker from './updateChecker';
import { ElementsTreeWalker } from './treeWalker';
import {
  addPreventUnloadCondition,
  globalKeyDownHandler,
  highlightFocused,
  windowResizeHandler,
} from './eventHandlers';
import { adjustDom } from './modifyDom';
import { areObjectsEqual, isInline } from './util';
import { confirmDialog, editWatchedSections, notFound, settingsDialog } from './modal';
import { generateCommentAnchor, parseCommentAnchor, resetCommentAnchors } from './timestamp';
import { getSettings, getVisits, getWatchedSections, setWatchedSections } from './options';
import { init, removeLoadingOverlay, restoreCommentForms, saveSession } from './boot';
import { setSettings, setVisits } from './options';

/**
 * Prepare (initialize or reset) various properties, mostly global ones. DOM preparations related to
 * comment layers are also made here.
 *
 * @param {object} [data] Data passed from the main module.
 * @param {Promise} [data.messagesRequest] Promise returned by {@link module:dateFormat.loadData}.
 * @private
 */
async function prepare({ messagesRequest }) {
  cd.g.$root = cd.g.$content.children('.mw-parser-output');
  if (!cd.g.$root.length) {
    cd.g.$root = cd.g.$content;
  }
  cd.g.rootElement = cd.g.$root.get(0);

  cd.g.$toc = cd.g.$root.find('.toc');
  const $closestFloating = cd.g.$toc
    .closest('[style*="float: right"], [style*="float:right"], [style*="float: left"], [style*="float:left"]');
  cd.g.isTocFloating = Boolean($closestFloating.length && cd.g.$root.has($closestFloating).length);

  /**
   * Collection of all comments on the page ordered the same way as in the DOM.
   *
   * @name comments
   * @type {Comment[]}
   * @memberof module:cd~convenientDiscussions
   */
  cd.comments = [];

  /**
   * Collection of all sections on the page ordered the same way as in the DOM.
   *
   * @name sections
   * @type {Section[]}
   * @memberof module:cd~convenientDiscussions
   */
  cd.sections = [];

  if (cd.g.isFirstRun) {
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
 * @private
 */

/**
 * Identify the first visible element from the top of the page and its top offset.
 *
 * @returns {?GetFirstVisibleElementDataReturn}
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
  return element ? { element, top } : null;
}

/**
 * Parse comments and modify related parts of the DOM.
 *
 * @param {Parser} parser
 * @param {object|undefined} firstVisibleElementData
 * @throws {CdError} If there are no comments.
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
 * Remove sections that can't be found on the page anymore from the watched sections list and save
 * them to the server.
 *
 * @private
 */
function cleanUpWatchedSections() {
  if (!cd.sections) return;
  const initialSectionCount = cd.g.thisPageWatchedSections.length;
  cd.g.thisPageWatchedSections = cd.g.thisPageWatchedSections
    .filter((headline) => cd.sections.some((section) => section.headline === headline));
  cd.g.watchedSections[mw.config.get('wgArticleId')] = cd.g.thisPageWatchedSections;
  if (cd.g.thisPageWatchedSections.length !== initialSectionCount) {
    setWatchedSections();
  }
}

/**
 * Parse sections and modify some parts of them.
 *
 * @param {Parser} parser
 * @param {Promise} watchedSectionsRequest
 * @private
 */
function processSections(parser, watchedSectionsRequest) {
  parser.findHeadings().forEach((heading) => {
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

  Section.adjustSections();

  if (watchedSectionsRequest) {
    watchedSectionsRequest.then(() => {
      cleanUpWatchedSections();
      toc.highlightWatchedSections();
    });
  }

  /**
   * The script has processed the sections.
   *
   * @event sectionsReady
   * @type {module:cd~convenientDiscussions.sections}
   */
  mw.hook('convenientDiscussions.sectionsReady').fire(cd.sections);
}

/**
 * Create an add section form if not existent.
 *
 * @param {object} [preloadConfig={}]
 * @param {boolean} [isNewTopicOnTop=false]
 * @private
 */
function createAddSectionForm(preloadConfig = {}, isNewTopicOnTop = false) {
  const addSectionForm = cd.g.addSectionForm;
  if (addSectionForm) {
    // Sometimes there are more than one "Add section" button on the page, and they lead to
    // opening forms with different content.
    if (!areObjectsEqual(preloadConfig, addSectionForm.preloadConfig)) {
      mw.notify(cd.s('cf-error-formconflict'), { type: 'error' });
      return;
    }

    addSectionForm.$element.cdScrollIntoView('center');

    // headlineInput may be missing if the "nosummary" preload parameter is truthy.
    addSectionForm[addSectionForm.headlineInput ? 'headlineInput' : 'commentInput'].focus();
  } else {
    /**
     * Add section form.
     *
     * @type {CommentForm|undefined}
     * @memberof module:cd~convenientDiscussions.g
     */
    cd.g.addSectionForm = new CommentForm({
      mode: 'addSection',
      target: cd.g.CURRENT_PAGE,
      preloadConfig,
      isNewTopicOnTop,
    });
  }
}

/**
 * Add an "Add topic" button to the bottom of the page if there is an "Add topic" tab.
 *
 * @private
 */
function addAddTopicButton() {
  if ($('#ca-addsection').length) {
    cd.g.addSectionButton = new OO.ui.ButtonWidget({
      label: cd.s('addtopic'),
      framed: false,
      classes: ['cd-button', 'cd-sectionButton'],
    });
    cd.g.addSectionButton.on('click', () => {
      createAddSectionForm();
    });
    cd.g.$addSectionButtonContainer = $('<div>')
      .addClass('cd-addTopicButtonContainer')
      .addClass('cd-sectionButtonContainer')
      .append(cd.g.addSectionButton.$element)
      .appendTo(cd.g.rootElement);
  }
}

/**
 * Bind a click handler to every known "Add new topic" button.
 *
 * @private
 */
function connectToAddTopicButtons() {
  $(cd.g.ADD_TOPIC_SELECTORS)
    .filter(function () {
      const $button = $(this);
      if ($button.is('a')) {
        const href = $button.attr('href');
        const query = new mw.Uri(href).query;
        const pageName = query.title;
        const page = new Page(pageName);
        if (page.name !== cd.g.CURRENT_PAGE.name) {
          return false;
        }
      } else if ($button.is('input')) {
        const pageName = $button
          .closest('form')
          .find('input[name="title"]')
          .val();
        const page = new Page(pageName);
        if (page.name !== cd.g.CURRENT_PAGE.name) {
          return false;
        }
      } else {
        return false;
      }

      return true;
    })
    .off('click.cd')
    .on('click.cd', function (e) {
      if (e.ctrlKey || e.shiftKey || e.metaKey) return;

      const $button = $(this);
      let preloadConfig;
      let isNewTopicOnTop = false;
      if ($button.is('a')) {
        const href = $button.attr('href');
        const query = new mw.Uri(href).query;
        preloadConfig = {
          editIntro: query.editintro,
          commentTemplate: query.preload,
          headline: query.preloadtitle,
          summary: query.summary?.replace(/^.+?\*\/ */, ''),
          noHeadline: Boolean(query.nosummary),
          omitSignature: Boolean(query.cdomitsignature),
        };
        isNewTopicOnTop = query.section === '0';
      } else {
        // <input>
        const $form = $button.closest('form');
        preloadConfig = {
          editIntro: $form.find('input[name="editintro"]').val(),
          commentTemplate: $form.find('input[name="preload"]').val(),
          headline: $form.find('input[name="preloadtitle"]').val(),
          summary: $form.find('input[name="summary"]').val(),
          noHeadline: Boolean($form.find('input[name="nosummary"]').val()),
        };
      }

      e.preventDefault();

      // Clean up preloadConfig keys for possible future comparison using util.areObjectsEqual.
      Object.keys(preloadConfig).forEach((key) => {
        if (preloadConfig[key] === undefined) {
          delete preloadConfig[key];
        }
      });

      createAddSectionForm(preloadConfig, isNewTopicOnTop);
    })
    .attr('title', cd.s('addtopicbutton-tooltip'));
}

/**
 * Bind a click handler to comment links to make them work as in-script comment links.
 *
 * @param {JQuery} $content
 * @private
 */
function connectToCommentLinks($content) {
  $content
    .find(`a[href^="#"]`)
    .filter(function () {
      return /^#\d{12}_.+$/.test($(this).attr('href'));
    })
    .on('click', function (e) {
      e.preventDefault();
      const comment = Comment.getCommentByAnchor($(this).attr('href').slice(1));
      if (comment) {
        comment.scrollToAndHighlightTarget(true, true);
      }
    });
}

/**
 * Highlight comments of the current user.
 *
 * @private
 */
function highlightOwnComments() {
  if (!cd.settings.highlightOwnComments) return;

  Comment.configureAndAddLayers(cd.comments.filter((comment) => comment.isOwn));
}

/**
 * Perform fragment-related tasks, as well as comment anchor-related ones.
 *
 * @param {object} keptData
 * @private
 */
async function processFragment(keptData) {
  let fragment;
  let decodedFragment;
  let escapedFragment;
  let escapedDecodedFragment;
  let commentAnchor;
  if (cd.g.isFirstRun) {
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
    commentAnchor = keptData.commentAnchor;
  }

  let date;
  let author;
  let comment;
  if (commentAnchor) {
    ({ date, author } = parseCommentAnchor(commentAnchor) || {});
    comment = Comment.getCommentByAnchor(commentAnchor);

    if (!keptData.commentAnchor && !comment) {
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
        comment.scrollToAndHighlightTarget(false, keptData.pushState);
      });
    }
  }

  if (keptData.sectionAnchor) {
    const section = Section.getSectionByAnchor(keptData.sectionAnchor);
    if (section) {
      if (keptData.pushState) {
        history.pushState(history.state, '', '#' + section.anchor);
      }

      // setTimeout for Firefox, as above
      setTimeout(() => {
        section.$elements.first().cdScrollTo('top', false);
      });
    }
  }

  if (cd.g.isFirstRun) {
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

    if (decodedFragment && fragmentHasNoTarget && cd.g.isPageActive) {
      await notFound(decodedFragment, date);
    }
  }
}

/**
 * Highlight new comments and update the navigation panel. A promise obtained from {@link
 * module:options.getVisits} should be provided.
 *
 * @param {Promise} visitsRequest
 * @param {Comment[]} [memorizedUnseenCommentAnchors=[]]
 * @fires newCommentsHighlighted
 */
async function processVisits(visitsRequest, memorizedUnseenCommentAnchors = []) {
  let visits;
  let thisPageVisits;
  try {
    ({ visits, thisPageVisits } = await visitsRequest);
  } catch (e) {
    console.warn('Couldn\'t load the settings from the server.', e);
    return;
  }

  if (cd.g.thisPageVisits.length >= 1) {
    cd.g.previousVisitUnixTime = Number(cd.g.thisPageVisits[cd.g.thisPageVisits.length - 1]);
  }

  const currentUnixTime = Math.floor(Date.now() / 1000);

  // Cleanup
  for (let i = thisPageVisits.length - 1; i >= 0; i--) {
    if (thisPageVisits[i] < currentUnixTime - 60 * cd.g.HIGHLIGHT_NEW_COMMENTS_INTERVAL) {
      thisPageVisits.splice(0, i);
      break;
    }
  }

  let haveMatchedTimeWithComment = false;
  if (thisPageVisits.length) {
    cd.comments.forEach((comment) => {
      /**
       * Is the comment new. Set only on active pages (not archived, not old diffs) excluding pages
       * that are visited for the first time.
       *
       * @type {boolean|undefined}
       * @memberof module:Comment
       */
      comment.isNew = false;

      /**
       * Has the comment been seen. Set only on active pages (not archived, not old diffs) excluding
       * pages that are visited for the first time. Check using `=== false` if you need to know if
       * the comment is highlighted as new and unseen.
       *
       * @type {boolean|undefined}
       * @memberof module:Comment
       */
      comment.isSeen = true;

      if (!comment.date) return;

      const commentUnixTime = Math.floor(comment.date.getTime() / 1000);
      if (commentUnixTime <= currentUnixTime && currentUnixTime < commentUnixTime + 60) {
        haveMatchedTimeWithComment = true;
      }
      if (commentUnixTime + 60 > thisPageVisits[0]) {
        comment.isNew = true;
        comment.isSeen = (
          (commentUnixTime + 60 <= thisPageVisits[thisPageVisits.length - 1] || comment.isOwn) &&
          !memorizedUnseenCommentAnchors.some((anchor) => anchor === comment.anchor)
        );
      }
    });

    Comment.configureAndAddLayers(cd.comments.filter((comment) => comment.isNew));
    const unseenComments = cd.comments.filter((comment) => comment.isSeen === false);
    toc.addNewComments(Comment.groupBySection(unseenComments));
  }

  // Reduce the probability that we will wrongfully mark a seen comment as unseen/new by adding a
  // minute to the current time if there is a comment with matched time. (Previously, the comment
  // time needed to be less than the current time which could result in missed comments if a comment
  // was sent the same minute when the page was loaded but after that moment.)
  thisPageVisits.push(String(currentUnixTime + haveMatchedTimeWithComment * 60));

  setVisits(visits);

  navPanel.fill();
  navPanel.registerSeenComments();

  /**
   * New comments have been highlighted.
   *
   * @event newCommentsHighlighted
   * @type {module:cd~convenientDiscussions}
   */
  mw.hook('convenientDiscussions.newCommentsHighlighted').fire(cd);
}

/**
 * Ask the user if they want to receive desktop notifications on first run and ask for a permission
 * if it is default but the user has desktop notifications enabled (for example, if he/she is using
 * a browser different from where he/she has previously used).
 *
 * @private
 */
async function confirmDesktopNotifications() {
  if (cd.settings.desktopNotifications === 'unknown' && Notification.permission !== 'denied') {
    // Avoid using the setting kept in `mw.user.options`, as it may be outdated.
    getSettings({ reuse: true }).then((settings) => {
      if (settings.desktopNotifications === 'unknown') {
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
        confirmDialog(cd.s('dn-confirm'), {
          size: 'medium',
          actions,
        }).then((action) => {
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
            promise.catch((e) => {
              mw.notify(cd.s('error-settings-save'), { type: 'error' })
              console.warn(e);
            });
          }
        });
      }
    });
  }

  if (cd.settings.desktopNotifications !== 'unknown' && Notification.permission === 'default') {
    await OO.ui.alert(cd.s('dn-grantpermission-again'), { title: cd.s('script-name') });
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
    cd.debug.timerTotal['main code'] +
    cd.debug.timerTotal['final code and rendering']
  );
  const timePerComment = baseTime / cd.comments.length;

  cd.debug.logAndResetTimer('total time');
  console.debug(`number of comments: ${cd.comments.length}`);
  console.debug(`per comment: ${timePerComment.toFixed(2)}`);
  cd.debug.logAndResetEverything();
}

/**
 * @typedef {object} KeptData
 * @property {string} [commentAnchor] Comment anchor to scroll to.
 * @property {string} [sectionAnchor] Section anchor to scroll to.
 * @property {string} [pushState] Whether to replace the URL in the address bar adding the comment
 *   anchor to it if it's specified.
 * @property {boolean} [wasPageCreated] Whether the page was created while it was in the
 *   previous state. Affects navigation panel mounting and certain key press handlers adding.
 * @property {number} [scrollPosition] Page Y offset.
 * @property {object[]} [unseenCommentAnchors] Anchors of unseen comments on this page.
 * @property {string} [justWatchedSection] Section just watched so that there could be not
 *    enough time for it to be saved to the server.
 * @property {string} [justUnwatchedSection] Section just unwatched so that there could be not
 *    enough time for it to be saved to the server.
 * @property {Promise} [messagesRequest] Promise returned by {@link
 *   module:dateFormat.loadData}.
 */

/**
 * Process the current web page.
 *
 * @param {KeptData} [keptData={}] Data passed from the previous page state or the main module.
 * @fires beforeParse
 * @fires commentsReady
 * @fires sectionsReady
 * @fires pageReady
 */
export default async function processPage(keptData = {}) {
  cd.debug.stopTimer(cd.g.isFirstRun ? 'loading data' : 'laying out HTML');
  cd.debug.startTimer('preparations');

  await prepare(keptData);

  let firstVisibleElementData;
  if (cd.g.isFirstRun) {
    firstVisibleElementData = getFirstVisibleElementData();
  }

  cd.debug.stopTimer('preparations');
  cd.debug.startTimer('main code');

  // This property isn't static: a 404 page doesn't have an ID and is considered inactive, but if
  // the user adds a topic to it, it will become active and get an ID. At the same time (on a really
  // rare occasion), an active page may become inactive if it becomes identified as an archive page.
  cd.g.isPageActive = !(
    !mw.config.get('wgArticleId') ||
    cd.g.CURRENT_PAGE.isArchivePage() ||
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

  let visitsRequest;
  if (cd.g.isPageActive) {
    visitsRequest = getVisits(true);
  }

  /**
   * The script is going to parse the page.
   *
   * @event beforeParse
   * @type {module:cd~convenientDiscussions}
   */
  mw.hook('convenientDiscussions.beforeParse').fire(cd);

  cd.g.specialElements = findSpecialElements();

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

  // We change the evaluation of cd.g.isPageActive if there is no comments and no "Add section"
  // button.
  if (
    cd.g.isPageActive &&
    !cd.comments.length &&
    !$('#ca-addsection').length &&
    !cd.g.PAGE_WHITELIST_REGEXP?.test(cd.g.CURRENT_PAGE.name)
  ) {
    cd.g.isPageActive = false;
  }

  cd.debug.startTimer('process sections');

  processSections(parser, watchedSectionsRequest);

  cd.debug.stopTimer('process sections');

  addAddTopicButton();
  connectToAddTopicButtons();

  cd.debug.stopTimer('main code');

  // Operations that need reflow, such as getBoundingClientRect(), go in this section.
  cd.debug.startTimer('final code and rendering');

  // Restore the initial viewport position in terms of visible elements which is how the user sees
  // it.
  if (firstVisibleElementData) {
    const y = (
      window.pageYOffset +
      firstVisibleElementData.element.getBoundingClientRect().top -
      firstVisibleElementData.top
    );
    window.scrollTo(0, y);
  }

  highlightOwnComments();

  processFragment(keptData);

  if (cd.g.isPageActive) {
    if (cd.g.isFirstRun || keptData.wasPageCreated) {
      navPanel.mount();
    } else {
      navPanel.reset();
    }

    // New comments highlighting
    processVisits(visitsRequest, keptData.unseenCommentAnchors);

    // This should be below processVisits() because of updateChecker.processRevisionsIfNeeded.
    updateChecker.init(visitsRequest);
  } else {
    if (navPanel.isMounted()) {
      navPanel.unmount();
    }
  }

  if (cd.g.isPageActive || !mw.config.get('wgArticleId')) {
    // This should be below the viewport position restoration and own comments highlighting as it
    // may rely on the elements that are made invisible during the comment forms restoration. It
    // should also be below the navPanel mount/reset methods as it runs
    // navPanel.updateCommentFormButton() which depends on the navPanel being mounted.
    restoreCommentForms();
  }

  if (cd.g.isFirstRun) {
    // `mouseover` allows to capture the event when the cursor is not moving but ends up above the
    // element (for example, as a result of scrolling).
    $(document).on('mousemove mouseover', highlightFocused);
    $(window).on('resize orientationchange', windowResizeHandler);
    addPreventUnloadCondition('commentForms', () => {
      saveSession();
      return (
        mw.user.options.get('useeditwarning') &&
        (
          CommentForm.getLastActiveAlteredCommentForm() ||
          (alwaysConfirmLeavingPage && cd.commentForms.length)
        )
      );
    });

    mw.hook('wikipage.content').add(connectToCommentLinks);
    mw.hook('convenientDiscussions.previewReady').add(connectToCommentLinks);

    // Mutation observer doesn't follow all possible cases (for example, initiated with adding new
    // CSS) of comment position changing unfortunately.
    setInterval(() => {
      commentLayers.redrawIfNecessary();
    }, 1000);

    const observer = new MutationObserver((records) => {
      const areLayers = records
        .every((record) => /^cd-comment(Underlay|Overlay|Layers)/.test(record.target.className));
      if (areLayers) return;
      commentLayers.redrawIfNecessary();
    });
    observer.observe(cd.g.$content.get(0), {
      attributes: true,
      childList: true,
      subtree: true,
    });
  }

  if ((cd.g.isFirstRun && cd.g.isPageActive) || keptData.wasPageCreated) {
    $(document)
      .on('keydown', globalKeyDownHandler)
      .on('scroll resize orientationchange', () => {
        navPanel.registerSeenComments();
        navPanel.updateCommentFormButton();
      });
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

  if (cd.g.isFirstRun) {
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

  cd.g.isFirstRun = false;

  // The next line is needed to calculate the rendering time: it won't run until everything gets
  // rendered.
  cd.g.rootElement.getBoundingClientRect();

  cd.debug.stopTimer('final code and rendering');
  cd.debug.stopTimer('total time');

  debugLog();
}
