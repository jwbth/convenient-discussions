/**
 * Talk page (DOM, not wikitext) processing module. Its only export, `processPage()`, is executed
 * after {@link module:app the main module} on first run and as part of {@link
 * module:boot.reloadPage} on subsequent runs.
 *
 * @module processPage
 */

import CdError from './CdError';
import Comment from './Comment';
import CommentForm from './CommentForm';
import Page from './Page';
import Parser, { getUserNameFromLink } from './Parser';
import Section from './Section';
import cd from './cd';
import commentLayers from './commentLayers';
import navPanel from './navPanel';
import pageNav from './pageNav';
import toc from './toc';
import updateChecker from './updateChecker';
import { ElementsTreeWalker } from './treeWalker';
import {
  addPreventUnloadCondition,
  handleGlobalKeyDown,
  handleScroll,
  handleWindowResize,
} from './eventHandlers';
import { confirmDialog, notFound } from './modal';
import { generateCommentAnchor, parseCommentAnchor, resetCommentAnchors } from './timestamp';
import { getSettings, getVisits, getWatchedSections } from './options';
import { init, removeLoadingOverlay, restoreCommentForms, saveSession } from './boot';
import { isInline } from './util';
import { setSettings, setVisits } from './options';

/**
 * Prepare (initialize or reset) various properties, mostly global ones. DOM preparations related to
 * comment layers are also made here.
 *
 * @param {Promise} siteDataRequests Promise returned by {@link module:siteData.loadSiteData}.
 * @private
 */
async function prepare(siteDataRequests) {
  cd.g.$root = cd.g.$content.children('.mw-parser-output');
  if (!cd.g.$root.length) {
    cd.g.$root = cd.g.$content;
  }
  cd.g.rootElement = cd.g.$root.get(0);

  toc.reset();

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
    await init(siteDataRequests);
  } else {
    resetCommentAnchors();
    commentLayers.reset();
  }
}

/**
 * @typedef {object} GetFirstElementInViewportDataReturn
 * @property {Element} element
 * @property {number} top
 * @private
 */

/**
 * Find the first element in the viewport looking from the top of the page and its top offset.
 *
 * @param {number} [scrollY=window.scrollY] Vertical scroll position (cached value to avoid reflow).
 * @returns {?GetFirstElementInViewportDataReturn}
 * @private
 */
function getFirstElementInViewportData(scrollY = window.scrollY) {
  let element;
  let top;
  if (scrollY !== 0 && cd.g.rootElement.getBoundingClientRect().top <= 0) {
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
 * Get all text nodes under the root element in the window (not worker) context.
 *
 * @returns {Node[]}
 * @private
 */
function getAllTextNodes() {
  const result = document.evaluate(
    // './/text()' doesn't work in Edge.
    './/descendant::text()',

    cd.g.rootElement,
    null,
    XPathResult.ANY_TYPE,
    null
  );
  const textNodes = [];
  let node;
  while ((node = result.iterateNext())) {
    textNodes.push(node);
  }
  return textNodes;
}

/**
 * Find some types of special elements on the page (floating elements, closed discussions, outdent
 * templates).
 *
 * @private
 */
function findSpecialElements() {
  // Describe all floating elements on the page in order to calculate the right border (temporarily
  // setting "overflow: hidden") for all comments that they intersect with.
  const floatingElementSelector = [
    ...cd.g.FLOATING_ELEMENT_SELECTORS,
    ...cd.config.customFloatingElementSelectors,
  ]
    .join(', ');
  cd.g.floatingElements = cd.g.$root
    .find(floatingElementSelector)
    .get()

    // Remove all known elements that never intersect comments from the collection.
    .filter((el) => !el.classList.contains('cd-ignoreFloating'));

  const closedDiscussionsSelector = cd.config.closedDiscussionClasses
    .map((name) => `.${name}`)
    .join(', ');
  cd.g.closedDiscussionElements = cd.g.$root.find(closedDiscussionsSelector).get();

  cd.g.pageHasOutdents = Boolean(cd.g.$root.find('.outdent-template').length);
}

/**
 * Replace an element with an identical one but with another tag name, i.e. move all child nodes,
 * attributes, and some bound events to a new node, and also reassign references in some variables
 * and properties to this element. Unfortunately, we can't just change the element's `tagName` to do
 * that.
 *
 * Not a pure function; it alters `feivData`.
 *
 * @param {Element} element
 * @param {string} newType
 * @param {object|undefined} feivData
 * @returns {Element}
 * @private
 */
function changeElementType(element, newType, feivData) {
  const newElement = document.createElement(newType);
  while (element.firstChild) {
    newElement.appendChild(element.firstChild);
  }
  Array.from(element.attributes).forEach((attribute) => {
    newElement.setAttribute(attribute.name, attribute.value);
  });

  // If this element is a part of a comment, replace it in the Comment object instance.
  let commentId = element.getAttribute('data-comment-id');
  if (commentId !== null) {
    commentId = Number(commentId);
    cd.comments[commentId].replaceElement(element, newElement);
  } else {
    element.parentNode.replaceChild(newElement, element);
  }

  if (feivData && element === feivData.element) {
    feivData.element = newElement;
  }

  return newElement;
}

/**
 * Combine two adjacent ".cd-commentLevel" elements into one, recursively going deeper in terms of
 * the nesting level.
 *
 * @param {object|undefined} feivData
 * @private
 */
function mergeAdjacentCommentLevels(feivData) {
  const levels = (
    cd.g.rootElement.querySelectorAll('.cd-commentLevel:not(ol) + .cd-commentLevel:not(ol)')
  );
  if (!levels.length) return;

  const isOrHasCommentLevel = (el) => (
    (el.classList.contains('cd-commentLevel') && el.tagName !== 'OL') ||
    el.querySelector('.cd-commentLevel:not(ol)')
  );

  Array.from(levels).forEach((bottomElement) => {
    const topElement = bottomElement.previousElementSibling;
    // If the previous element was removed in this cycle. (Or it could be absent for some other
    // reason? I can confirm that I witnessed a case where the element was absent, but didn't pay
    // attention why unfortunately.)
    if (!topElement) return;
    let currentTopElement = topElement;
    let currentBottomElement = bottomElement;
    do {
      const topTag = currentTopElement.tagName;
      const bottomInnerTags = {};
      if (topTag === 'UL') {
        bottomInnerTags.DD = 'LI';
      } else if (topTag === 'DL') {
        bottomInnerTags.LI = 'DD';
      }

      let firstMoved;
      if (isOrHasCommentLevel(currentTopElement)) {
        while (currentBottomElement.childNodes.length) {
          let child = currentBottomElement.firstChild;
          if (child.nodeType === Node.ELEMENT_NODE) {
            if (bottomInnerTags[child.tagName]) {
              child = changeElementType(child, bottomInnerTags[child.tagName], feivData);
            }
            if (firstMoved === undefined) {
              firstMoved = child;
            }
          } else {
            if (firstMoved === undefined && child.textContent.trim()) {
              // Don't fill the "firstMoved" variable which is used further to merge elements if
              // there is a non-empty text node between. (An example that is now fixed:
              // https://ru.wikipedia.org/wiki/Википедия:Форум/Архив/Викиданные/2018/1_полугодие#201805032155_NBS,
              // but other can be on the loose.) Instead, wrap the text node into an element to
              // prevent it from being ignored when searching next time for adjacent .commentLevel
              // elements. This could be seen only as an additional precaution, since it doesn't fix
              // the source of the problem: the fact that a bare text node is (probably) a part of
              // the reply. It shouldn't be happening.
              firstMoved = null;
              const newChild = document.createElement('span');
              newChild.appendChild(child);
              child = newChild;
            }
          }
          currentTopElement.appendChild(child);
        }
        currentBottomElement.remove();
      }

      currentBottomElement = firstMoved;
      currentTopElement = firstMoved?.previousElementSibling;
    } while (
      currentTopElement &&
      currentBottomElement &&
      isOrHasCommentLevel(currentBottomElement)
    );
  });
}

/**
 * Perform some DOM-related taskes after parsing comments.
 *
 * @param {object|undefined} feivData
 * @private
 */
function adjustDom(feivData) {
  mergeAdjacentCommentLevels(feivData);
  mergeAdjacentCommentLevels(feivData);
  if (cd.g.rootElement.querySelector('.cd-commentLevel:not(ol) + .cd-commentLevel:not(ol)')) {
    console.warn('.cd-commentLevel adjacencies have left.');
  }

  $('dl').has('dt').each((i, el) => {
    Array.from(el.classList)
      .filter((className) => className.startsWith('cd-commentLevel'))
      .forEach((className) => el.classList.remove(className));
  });
}

/**
 * Parse comments and modify related parts of the DOM.
 *
 * @param {Parser} parser
 * @param {object|undefined} feivData
 * @throws {CdError} If there are no comments.
 * @private
 */
function processComments(parser, feivData) {
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

  // Faster than dping it for every individual comment.
  cd.g.rootElement
    .querySelectorAll('table.cd-commentPart .cd-signature')
    .forEach((signature) => {
      const commentId = signature.closest('.cd-commentPart').dataset.commentId;
      cd.comments[commentId].isInSingleCommentTable = true;
    });

  adjustDom(feivData);

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

  Section.adjust();

  watchedSectionsRequest.then(() => {
    Section.cleanUpWatched();
    toc.highlightWatchedSections();
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
      CommentForm.createAddSectionForm();
    });
    cd.g.$addSectionButtonContainer = $('<div>')
      .addClass('cd-addTopicButton-container cd-sectionButton-container')
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
  $(cd.g.ADD_TOPIC_SELECTOR)
    .filter(function () {
      const $button = $(this);
      if ($button.is('a')) {
        const href = $button.attr('href');
        const query = new mw.Uri(href).query;
        let pageName = query.title;
        if (!pageName) {
          return false;
        }
        if (typeof pageName === 'object') {
          pageName = pageName[pageName.length - 1];
        }
        const page = new Page(pageName);
        if (page.name !== cd.g.PAGE.name) {
          return false;
        }
      } else if ($button.is('input')) {
        const pageName = $button
          .closest('form')
          .find('input[name="title"]')
          .val();
        const page = new Page(pageName);
        if (page.name !== cd.g.PAGE.name) {
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
          omitSignature: false,
        };
      }

      e.preventDefault();
      CommentForm.createAddSectionForm(preloadConfig, isNewTopicOnTop);
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
      const anchor = $(this).attr('href').slice(1);
      Comment.getByAnchor(anchor)?.scrollToAndHighlightTarget(true, true);
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
 * Highlight mentions of the current user.
 *
 * @param {JQuery} $content
 * @private
 */
function highlightMentions($content) {
  const selector = ['cd-signature']
    .concat(cd.config.elementsToExcludeClasses)
    .map((name) => `.${name}`)
    .join(', ');
  Array.from($content.get(0).querySelectorAll(`.cd-commentPart a[title*=":${cd.g.USER_NAME}"]`))
    .filter((el) => (
      cd.g.USER_NAMESPACE_ALIASES_REGEXP.test(el.title) &&
      !el.parentNode.closest(selector) &&
      getUserNameFromLink(el) === cd.g.USER_NAME
    ))
    .forEach((link) => {
      link.classList.add('cd-currentUserLink');
    });
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
    comment = Comment.getByAnchor(commentAnchor);

    if (!keptData.commentAnchor && !comment) {
      let commentAnchorToCheck;
      // There can be a time difference between the time we know (taken from the watchlist) and the
      // time on the page. We take it to be not higher than 5 minutes for the watchlist.
      for (let gap = 1; !comment && gap <= 5; gap++) {
        const dateToFind = new Date(date.getTime() - cd.g.MILLISECONDS_IN_MINUTE * gap);
        commentAnchorToCheck = generateCommentAnchor(dateToFind, author);
        comment = Comment.getByAnchor(commentAnchorToCheck);
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
    const section = Section.getByAnchor(keptData.sectionAnchor);
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

  if (cd.g.isFirstRun && cd.g.isPageActive && decodedFragment) {
    const wasTargetFound = (
      comment ||
      cd.config.idleFragments.includes(decodedFragment) ||
      decodedFragment.startsWith('/media/') ||
      $(':target').length ||
      $(`a[name="${escapedDecodedFragment}"]`).length ||
      $(`*[id="${escapedDecodedFragment}"]`).length ||
      $(`a[name="${escapedFragment}"]`).length ||
      $(`*[id="${escapedFragment}"]`).length
    );
    if (!wasTargetFound) {
      await notFound(decodedFragment, date);
    }
  }
}

/**
 * Highlight new comments and update the navigation panel. A promise obtained from {@link
 * module:options.getVisits} should be provided.
 *
 * @param {Promise} visitsRequest
 * @param {object} keptData
 * @fires newCommentsHighlighted
 * @private
 */
async function processVisits(visitsRequest, keptData) {
  let visits;
  let currentPageVisits;
  try {
    ({ visits, currentPageVisits } = await visitsRequest);
  } catch (e) {
    console.warn('Couldn\'t load the settings from the server.', e);
    return;
  }

  if (cd.g.currentPageVisits.length >= 1) {
    cd.g.previousVisitUnixTime = Number(cd.g.currentPageVisits[cd.g.currentPageVisits.length - 1]);
  }

  const currentUnixTime = Math.floor(Date.now() / 1000);

  // Cleanup
  for (let i = currentPageVisits.length - 1; i >= 0; i--) {
    if (
      currentPageVisits[i] < currentUnixTime - 60 * cd.g.HIGHLIGHT_NEW_COMMENTS_INTERVAL ||
      keptData.markAsRead
    ) {
      currentPageVisits.splice(0, i);
      break;
    }
  }

  let haveMatchedTimeWithComment = false;
  if (currentPageVisits.length) {
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
      if (commentUnixTime + 60 > currentPageVisits[0]) {
        comment.isNew = true;
        comment.isSeen = (
          (
            commentUnixTime + 60 <= currentPageVisits[currentPageVisits.length - 1] ||
            comment.isOwn
          ) &&
          !keptData.unseenCommentAnchors?.some((anchor) => anchor === comment.anchor)
        );
      }
    });

    Comment.configureAndAddLayers(cd.comments.filter((comment) => comment.isNew));
    const unseenComments = cd.comments.filter((comment) => comment.isSeen === false);
    toc.addNewComments(Comment.groupBySection(unseenComments), keptData);
  }

  // Reduce the probability that we will wrongfully mark a seen comment as unseen/new by adding a
  // minute to the current time if there is a comment with matched time. (Previously, the comment
  // time needed to be less than the current time which could result in missed comments if a comment
  // was sent the same minute when the page was loaded but after that moment.)
  currentPageVisits.push(String(currentUnixTime + haveMatchedTimeWithComment * 60));

  setVisits(visits);

  Comment.registerSeen();
  navPanel.fill();

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

  if (
    !['unknown', 'none'].includes(cd.settings.desktopNotifications) &&
    Notification.permission === 'default'
  ) {
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
 *   enough time for it to be saved to the server.
 * @property {string} [justUnwatchedSection] Section just unwatched so that there could be not
 *   enough time for it to be saved to the server.
 * @property {boolean} [didSubmitCommentForm] Did the user just submitted a comment form.
 */

/**
 * Process the current web page.
 *
 * @param {KeptData} [keptData={}] Data passed from the previous page state.
 * @param {Promise} [siteDataRequests] Promise returned by {@link module:siteData.loadSiteData}.
 * @param {number} [cachedScrollY] Vertical scroll position (cached value to avoid reflow).
 * @fires beforeParse
 * @fires commentsReady
 * @fires sectionsReady
 * @fires pageReady
 */
export default async function processPage(keptData = {}, siteDataRequests, cachedScrollY) {
  cd.debug.stopTimer(cd.g.isFirstRun ? 'loading data' : 'laying out HTML');
  cd.debug.startTimer('preparations');

  await prepare(siteDataRequests);

  let feivData;
  if (cd.g.isFirstRun) {
    feivData = getFirstElementInViewportData(cachedScrollY);
  }

  cd.debug.stopTimer('preparations');
  cd.debug.startTimer('main code');

  const articleId = mw.config.get('wgArticleId');

  /*
    To make things systematized, we have 4 possible assessments of page activeness as a talk page,
    sorted by the scope of enabled features. Each level includes the next ones; 3 is the
    intersection of 2.1 and 2.2.
      1. The page is a wikitext page.
      2. The page is likely a talk page. The "isLikelyTalkPage" variable is used to reflect that. We
         may reevaluate page as being not a talk page if we don't find any comments on it and
         several other criteria are not met.  Likely talk pages are divided into two categories:
      2.1. The page is eligible to create comment forms on. (This includes 404 pages where the user
           could create a section, but excludes archive pages and old revisions.) The
           "isPageCommentable" variable is used to reflect this level.
      2.2. The page exists (not a 404 page). (This includes archive pages and old revisions, which
           are not eligible to create comment forms on.) Such pages are parsed, the page navigation
           block is added to them.
      3. The page is active. This means, it's not a 404 page, not an archive page, and not an old
         revision. The "cd.g.isPageActive" property is true when the page is of this level. The
         navigation panel is added to such pages, new comments are highlighted.

    We need to be accurate regarding which functionality should be turned on on which level. We
    should also make sure we only add this functionality once. The "isPageFirstParsed" variable is
    used to reflect the run at which the page is parsed for the first time.
   */

  // This property isn't static: a 404 page doesn't have an ID and is considered inactive, but if
  // the user adds a topic to it, it will become active and get an ID. At the same time (on a really
  // rare occasion), an active page may become inactive if it becomes identified as an archive page.
  cd.g.isPageActive = (
    articleId &&
    !cd.g.PAGE.isArchivePage() &&
    mw.config.get('wgRevisionId') === mw.config.get('wgCurRevisionId')
  );

  let watchedSectionsRequest;
  let visitsRequest;
  let parser;
  if (articleId) {
    watchedSectionsRequest = getWatchedSections(true, keptData);
    watchedSectionsRequest.catch((e) => {
      console.warn('Couldn\'t load the settings from the server.', e);
    });

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

    findSpecialElements();

    cd.debug.startTimer('process comments');

    parser = new Parser({
      CommentClass: Comment,
      SectionClass: Section,
      childElementsProperty: 'children',
      document,
      follows: (el1, el2) => Boolean(
        el2.compareDocumentPosition(el1) & Node.DOCUMENT_POSITION_FOLLOWING
      ),
      getAllTextNodes,
      getElementByClassName: (node, className) => node.querySelector(`.${className}`),
    });

    try {
      processComments(parser, feivData);
    } catch (e) {
      console.error(e);
    }

    cd.debug.stopTimer('process comments');
  }

  // Reevaluate if this is likely a talk page.
  const isLikelyTalkPage = (
    !cd.g.isFirstRun ||
    cd.comments.length ||
    $('#ca-addsection').length ||
    cd.g.PAGE_WHITELIST_REGEXP?.test(cd.g.PAGE.name)
  );

  const isPageCommentable = cd.g.isPageActive || !articleId;
  const isPageFirstParsed = cd.g.isFirstRun || keptData.wasPageCreated;

  if (isLikelyTalkPage) {
    if (articleId) {
      cd.debug.startTimer('process sections');

      processSections(parser, watchedSectionsRequest);

      cd.debug.stopTimer('process sections');
    }

    if (isPageCommentable) {
      addAddTopicButton();
      connectToAddTopicButtons();
    }

    cd.debug.stopTimer('main code');

    // Operations that need reflow, such as getBoundingClientRect(), go in this section.
    cd.debug.startTimer('final code and rendering');

    if (articleId) {
      // Restore the initial viewport position in terms of visible elements which is how the user sees
      // it.
      if (feivData) {
        const y = window.scrollY + feivData.element.getBoundingClientRect().top - feivData.top;
        window.scrollTo(0, y);
      }

      highlightOwnComments();

      processFragment(keptData);
    }

    if (cd.g.isPageActive) {
      if (isPageFirstParsed) {
        navPanel.mount();
      } else {
        navPanel.reset();
      }

      // New comments highlighting
      processVisits(visitsRequest, keptData);

      // This should be below processVisits() because of updateChecker.processRevisionsIfNeeded.
      updateChecker.init(visitsRequest, keptData);
    } else {
      if (navPanel.isMounted()) {
        navPanel.unmount();
      }
    }

    if (isPageCommentable) {
      // This should be below the viewport position restoration and own comments highlighting as it
      // may rely on the elements that are made invisible during the comment forms restoration. It
      // should also be below the navPanel mount/reset methods as it runs
      // navPanel.updateCommentFormButton() which depends on the navPanel being mounted.
      restoreCommentForms();

      if (isPageFirstParsed) {
        const alwaysConfirmLeavingPage =  (
          mw.user.options.get('editondblclick') ||
          mw.user.options.get('editsectiononrightclick')
        );
        addPreventUnloadCondition('commentForms', () => {
          saveSession(true);
          return (
            mw.user.options.get('useeditwarning') &&
            (
              CommentForm.getLastActiveAltered() ||
              (alwaysConfirmLeavingPage && cd.commentForms.length)
            )
          );
        });
      }
    }

    // keptData.wasPageCreated? articleId? но resize + adjustLabels ok на 404. resize
    // orientationchange у document + window
    if (isPageFirstParsed) {
      pageNav.mount();

      $(document)
        // `mouseover` allows to capture the event when the cursor is not moving but ends up above
        // the element (for example, as a result of scrolling).
        .on('mousemove mouseover', Comment.highlightFocused)

        .on('scroll', handleScroll);
      $(window).on('resize orientationchange', handleWindowResize);

      mw.hook('wikipage.content').add(highlightMentions, connectToCommentLinks);
      mw.hook('convenientDiscussions.previewReady').add(connectToCommentLinks);

      // Mutation observer doesn't follow all possible cases (for example, initiated with adding new
      // CSS) of comment position changing unfortunately.
      setInterval(() => {
        commentLayers.redrawIfNecessary();
      }, 1000);

      const observer = new MutationObserver((records) => {
        const areLayers = records
          .every((record) => /^cd-comment(Underlay|Overlay|Layers)/.test(record.target.className));
        if (!areLayers) {
          commentLayers.redrawIfNecessary();
        }
      });
      observer.observe(cd.g.$content.get(0), {
        attributes: true,
        childList: true,
        subtree: true,
      });
    } else {
      pageNav.update();
    }

    if (cd.g.isFirstRun) {
      confirmDesktopNotifications();
    }

    if (isPageCommentable) {
      $(document).on('keydown', handleGlobalKeyDown);
    }

    /**
     * The script has processed the page.
     *
     * @event pageReady
     * @type {module:cd~convenientDiscussions}
     */
    mw.hook('convenientDiscussions.pageReady').fire(cd);

    removeLoadingOverlay();

    // The next line is needed to calculate the rendering time: it won't run until everything gets
    // rendered.
    cd.g.rootElement.getBoundingClientRect();

    cd.debug.stopTimer('final code and rendering');
  } else {
    cd.g.isPageActive = false;
    removeLoadingOverlay();
  }

  cd.g.isFirstRun = false;

  cd.debug.stopTimer('total time');
  debugLog();
}
