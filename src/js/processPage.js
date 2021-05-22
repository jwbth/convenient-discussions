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
import Thread from './Thread';
import cd from './cd';
import commentLayers from './commentLayers';
import navPanel from './navPanel';
import pageNav from './pageNav';
import toc from './toc';
import updateChecker from './updateChecker';
import {
  addPreventUnloadCondition,
  handleGlobalKeyDown,
  handleScroll,
  handleWindowResize,
} from './eventHandlers';
import { confirmDialog, notFound } from './modal';
import { finishLoading, init, restoreCommentForms, saveSession } from './boot';
import { generateCommentAnchor, parseCommentAnchor, resetCommentAnchors } from './timestamp';
import { getSettings, getVisits, getWatchedSections } from './options';
import {
  replaceAnchorElement,
  restoreRelativeScrollPosition,
  saveRelativeScrollPosition,
} from './util';
import { setSettings, setVisits } from './options';

/**
 * Prepare (initialize or reset) various properties, mostly global ones. DOM preparations related to
 * comment layers are also made here.
 *
 * @param {PassedData} passedData
 * @param {Promise} siteDataRequests Promise returned by {@link module:siteData.loadSiteData}.
 * @private
 */
async function prepare(passedData, siteDataRequests) {
  if (passedData.html) {
    const div = document.createElement('div');
    div.innerHTML = passedData.html;
    cd.g.rootElement = div.firstChild;
    cd.g.$root = $(cd.g.rootElement);
  } else {
    cd.g.$root = cd.g.$content.children('.mw-parser-output');

    // 404 pages
    if (!cd.g.$root.length) {
      cd.g.$root = cd.g.$content;
    }

    cd.g.rootElement = cd.g.$root.get(0);
  }

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
 * Find closed discussions on the page and set to the global object property.
 *
 * @private
 */
function findClosedDiscussions() {
  const closedDiscussionsSelector = cd.config.closedDiscussionClasses
    .map((name) => `.${name}`)
    .join(', ');
  cd.g.closedDiscussionElements = cd.g.$root.find(closedDiscussionsSelector).get();
}

/**
 * Find outdent templates on the page and set to the global object property.
 *
 * @private
 */
function findOutdents() {
  cd.g.pageHasOutdents = Boolean(cd.g.$root.find('.outdent-template').length);
}

/**
 * Find floating and hidden (`display: none`) elements on the page and set to the global object
 * property.
 *
 * @private
 */
function findFloatingAndHiddenElements() {
  const tsSelectorsFloating = [];
  const tsSelectorsHidden = [];
  const filterRules = (rule) => {
    if (rule instanceof CSSStyleRule) {
      const style = rule.style;
      if (style.float === 'left' || style.float === 'right') {
        tsSelectorsFloating.push(rule.selectorText);
      }
      if (style.display === 'none') {
        tsSelectorsHidden.push(rule.selectorText);
      }
    }
  };
  Array.from(document.styleSheets)
    .filter((sheet) => sheet.href?.includes('site.styles'))
    .forEach((el) => {
      Array.from(el.cssRules).forEach(filterRules);
    });
  Array.from(cd.g.rootElement.querySelectorAll('style')).forEach((el) => {
    Array.from(el.sheet.cssRules).forEach(filterRules);
  });

  // Describe all floating elements on the page in order to calculate the correct border
  // (temporarily setting "overflow: hidden") for all comments that they intersect with.
  const floatingElementSelector = [...cd.g.FLOATING_ELEMENT_SELECTORS, ...tsSelectorsFloating]
    .join(', ');

  // Can't use jQuery here anyway, as .find() doesn't take into account ancestor elements, such as
  // .mw-parser-output, in selectors. Remove all known elements that never intersect comments from
  // the collection.
  cd.g.floatingElements = Array.from(cd.g.rootElement.querySelectorAll(floatingElementSelector))
    .filter((el) => !el.classList.contains('cd-ignoreFloating'));

  const hiddenElementSelector = [...tsSelectorsHidden].join(', ');
  cd.g.hiddenElements = Array.from(cd.g.rootElement.querySelectorAll(hiddenElementSelector));
}

/**
 * Replace an element with an identical one but with another tag name, i.e. move all child nodes,
 * attributes, and some bound events to a new node, and also reassign references in some variables
 * and properties to this element. Unfortunately, we can't just change the element's `tagName` to do
 * that.
 *
 * @param {Element} element
 * @param {string} newType
 * @returns {Element}
 * @private
 */
function changeElementType(element, newType) {
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

  replaceAnchorElement(element, newElement);

  return newElement;
}

/**
 * Combine two adjacent `.cd-commentLevel` elements into one, recursively going deeper in terms of
 * the nesting level.
 *
 * @private
 */
function mergeAdjacentCommentLevels() {
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
        const firstElementChild = currentBottomElement.firstElementChild;

        /*
          Avoid collapsing adjacent LIs and DDs if we deal with a structure like this:
          <li>
            <div>Comment</div>
            <ul>Replies</ul>
          </li>
          <li>
            <div>Comment</div>
            <ul>Replies</ul>
          </li>
         */
        if (['DL', 'DD', 'UL', 'LI'].includes(firstElementChild.tagName)) {
          while (currentBottomElement.childNodes.length) {
            let child = currentBottomElement.firstChild;
            if (child.nodeType === Node.ELEMENT_NODE) {
              if (bottomInnerTags[child.tagName]) {
                child = changeElementType(child, bottomInnerTags[child.tagName]);
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
 * Perform some DOM-related tasks after parsing comments.
 *
 * @private
 */
function adjustDom() {
  mergeAdjacentCommentLevels();
  mergeAdjacentCommentLevels();
  if (cd.g.rootElement.querySelector('.cd-commentLevel:not(ol) + .cd-commentLevel:not(ol)')) {
    console.warn('.cd-commentLevel adjacencies have left.');
  }

  cd.g.rootElement
    .querySelectorAll('dd.cd-comment-part-last + dd, li.cd-comment-part-last + li')
    .forEach((el) => {
      if (el.firstElementChild?.classList.contains('cd-commentLevel')) {
        el.classList.add('cd-connectToPreviousItem');
      }
    });

  cd.debug.startTimer('adjustDom separate');
  /*
    A very specific fix for cases when an indented comment starts with a list like this:

      : Comment. [signature]
      :* Item
      :* Item
      : Comment end. [signature]

    which gives the following DOM:

      <dd>
        <div>Comment. [signature]</div>
        <ul>
          <li>Item</li>
          <li>Item</li>
        </ul>
      </dd>
      <dd>Comment end. [signature]</dd>

    The code splits the parent item element ("dd" in this case) into two and puts the list in the
    second one. This fixes the thread feature behavior among other things.
   */
  cd.comments.slice(1).forEach((comment, i) => {
    const previousComment = cd.comments[i];
    const previousCommentLastElement = previousComment
      .elements[previousComment.elements.length - 1];
    const potentialItem = previousCommentLastElement.nextElementSibling?.firstElementChild;
    if (
      ['DD', 'LI'].includes(previousCommentLastElement.parentNode.tagName) &&
      comment.level === previousComment.level &&
      previousCommentLastElement.tagName === 'DIV' &&
      potentialItem === comment.elements[0] &&
      potentialItem.tagName === 'LI'
    ) {
      const parentElement = previousCommentLastElement.parentNode;
      const copyElement = document.createElement(parentElement.tagName);
      copyElement.appendChild(previousCommentLastElement.nextElementSibling);
      parentElement.parentNode.insertBefore(copyElement, parentElement.nextElementSibling);
      console.debug('Separated a list from a part of the previous comment.');
    }
  });
  cd.debug.stopTimer('adjustDom separate');
}

/**
 * Parse comments and modify related parts of the DOM.
 *
 * @param {Parser} parser
 * @private
 */
function processComments(parser) {
  const timestamps = parser.findTimestamps();
  const signatures = parser.findSignatures(timestamps);

  signatures.forEach((signature) => {
    try {
      cd.comments.push(parser.createComment(signature));
    } catch (e) {
      if (!(e instanceof CdError)) {
        console.error(e);
      }
    }
  });

  // Faster than doing it for every individual comment.
  cd.g.rootElement
    .querySelectorAll('table.cd-comment-part .cd-signature')
    .forEach((signature) => {
      const commentId = signature.closest('.cd-comment-part').dataset.commentId;
      cd.comments[commentId].isInSingleCommentTable = true;
    });

  adjustDom();

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
      cd.sections.push(parser.createSection(heading, watchedSectionsRequest));
    } catch (e) {
      if (!(e instanceof CdError)) {
        console.error(e);
      }
    }
  });

  Section.adjust();

  // Dependent on sections being set
  Comment.processOutdents();

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
      classes: ['cd-button-ooui', 'cd-section-button'],
    });
    cd.g.addSectionButton.on('click', () => {
      CommentForm.createAddSectionForm();
    });
    cd.g.$addSectionButtonContainer = $('<div>')
      .addClass('cd-section-button-container cd-addTopicButton-container')
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
      let pageName;
      if ($button.is('a')) {
        const href = $button.attr('href');
        const query = new mw.Uri(href).query;
        pageName = query.title;

        // There is more than one "title" parameter.
        if (typeof pageName === 'object') {
          pageName = pageName[pageName.length - 1];
        }
      } else if ($button.is('input')) {
        pageName = $button
          .closest('form')
          .find('input[name="title"][type="hidden"]')
          .val();
      } else {
        return false;
      }
      let page;
      try {
        page = new Page(pageName);
      } catch (e) {
        return false;
      }
      if (page.name !== cd.g.PAGE.name) {
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
      Comment.getByAnchor(anchor)?.scrollTo(true, true);
    });
}

/**
 * Highlight mentions of the current user.
 *
 * @param {JQuery} $content
 * @private
 */
function highlightMentions($content) {
  const contentElement = $content.get(0);
  if (!contentElement) return;

  const selector = [cd.settings.reformatComments ? 'cd-comment-author' : 'cd-signature']
    .concat(cd.config.elementsToExcludeClasses)
    .map((name) => `.${name}`)
    .join(', ');
  Array.from(contentElement.querySelectorAll(`.cd-comment-part a[title*=":${cd.g.USER_NAME}"]`))
    .filter((el) => (
      cd.g.USER_LINK_REGEXP.test(el.title) &&
      !el.closest(selector) &&
      getUserNameFromLink(el) === cd.g.USER_NAME
    ))
    .forEach((link) => {
      link.classList.add('cd-currentUserLink');
    });
}

/**
 * Perform fragment-related tasks, as well as comment anchor-related ones.
 *
 * @param {object} passedData
 * @private
 */
async function processFragment(passedData) {
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
    commentAnchor = passedData.commentAnchor;
  }

  let date;
  let author;
  let comment;
  if (commentAnchor) {
    ({ date, author } = parseCommentAnchor(commentAnchor) || {});
    comment = Comment.getByAnchor(commentAnchor);

    if (!passedData.commentAnchor && !comment) {
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
        comment.scrollTo(false, passedData.pushState);
      });
    }
  }

  if (passedData.sectionAnchor) {
    const section = Section.getByAnchor(passedData.sectionAnchor);
    if (section) {
      if (passedData.pushState) {
        history.pushState(history.state, '', '#' + section.anchor);
      }

      // setTimeout for Firefox, as above
      setTimeout(() => {
        section.$elements.first().cdScrollTo('top', false);
      });
    }
  }

  if (cd.g.isFirstRun && cd.g.isPageActive && decodedFragment) {
    const isTargetFound = (
      comment ||
      cd.config.idleFragments.includes(decodedFragment) ||
      decodedFragment.startsWith('/media/') ||
      $(':target').length ||
      $(`a[name="${escapedDecodedFragment}"]`).length ||
      $(`*[id="${escapedDecodedFragment}"]`).length ||
      $(`a[name="${escapedFragment}"]`).length ||
      $(`*[id="${escapedFragment}"]`).length
    );
    if (!isTargetFound) {
      await notFound(decodedFragment, date);
    }
  }
}

/**
 * Highlight new comments and update the navigation panel. A promise obtained from {@link
 * module:options.getVisits} should be provided.
 *
 * @param {Promise} visitsRequest
 * @param {PassedData} passedData
 * @fires newCommentsHighlighted
 * @private
 */
async function processVisits(visitsRequest, passedData) {
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
      passedData.markAsRead
    ) {
      currentPageVisits.splice(0, i);
      break;
    }
  }

  let haveMatchedTimeWithComment = false;
  if (currentPageVisits.length) {
    cd.comments.forEach((comment) => {
      comment.isNew = false;
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
          !passedData.unseenCommentAnchors?.some((anchor) => anchor === comment.anchor)
        );
      }
    });

    Comment.configureAndAddLayers(cd.comments.filter((comment) => comment.isNew));
    const unseenComments = cd.comments.filter((comment) => comment.isSeen === false);
    toc.addNewComments(Comment.groupBySection(unseenComments), passedData);
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
 * @typedef {object} PassedData
 * @property {string} [html] HTML code of the page content to replace the current content with.
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
 * @property {boolean} [didSubmitCommentForm] Did the user just submit a comment form.
 */

/**
 * Process the current web page.
 *
 * @param {PassedData} [passedData={}] Data passed from the previous page state.
 * @param {Promise} [siteDataRequests] Promise returned by {@link module:siteData.loadSiteData}.
 * @param {number} [cachedScrollY] Vertical scroll position (cached value to avoid reflow).
 * @fires beforeParse
 * @fires commentsReady
 * @fires sectionsReady
 * @fires pageReady
 * @fires pageReadyFirstTime
 */
export default async function processPage(passedData = {}, siteDataRequests, cachedScrollY) {
  if (cd.g.isFirstRun) {
    cd.debug.stopTimer('loading data');
  }
  cd.debug.startTimer('preparations');

  await prepare(passedData, siteDataRequests);

  if (cd.g.isFirstRun) {
    saveRelativeScrollPosition(cachedScrollY);
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
         revision. The "convenientDiscussions.g.isPageActive" property is true when the page is of
         this level. The navigation panel is added to such pages, new comments are highlighted.

    We need to be accurate regarding which functionality should be turned on on which level. We
    should also make sure we only add this functionality once. The
    "convenientDiscussions.g.isPageFirstParsed" property is used to reflect the run at which the
    page is parsed for the first time.
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
    watchedSectionsRequest = getWatchedSections(true, passedData);
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

    findClosedDiscussions();
    findOutdents();

    cd.debug.startTimer('process comments');

    parser = new Parser({
      CommentClass: Comment,
      SectionClass: Section,
      childElementsProp: 'children',
      document,
      follows: (el1, el2) => Boolean(
        el2.compareDocumentPosition(el1) & Node.DOCUMENT_POSITION_FOLLOWING
      ),
      getAllTextNodes,
      getElementByClassName: (node, className) => node.querySelector(`.${className}`),
    });

    try {
      processComments(parser);
    } catch (e) {
      console.error(e);
    }

    cd.debug.stopTimer('process comments');
  }

  // Reevaluate if this is likely a talk page.
  const isLikelyTalkPage = (
    cd.g.isEnabledInQuery ||
    !cd.g.isFirstRun ||
    cd.comments.length ||
    $('#ca-addsection').length ||
    cd.g.PAGE_WHITELIST_REGEXP?.test(cd.g.PAGE.name)
  );

  const isPageCommentable = cd.g.isPageActive || !articleId;
  cd.g.isPageFirstParsed = cd.g.isFirstRun || passedData.wasPageCreated;

  if (isLikelyTalkPage) {
    if (articleId) {
      cd.debug.startTimer('process sections');

      processSections(parser, watchedSectionsRequest);

      cd.debug.stopTimer('process sections');
    }

    cd.debug.startTimer('laying out HTML');
    if (passedData.html) {
      if (passedData.wasPageCreated) {
        cd.g.$content.empty();
      }
      cd.g.$content
        .children('.mw-parser-output')
        .first()
        .replaceWith(cd.g.$root);
    }
    cd.debug.stopTimer('laying out HTML');

    cd.debug.startTimer('add topic buttons');
    if (isPageCommentable) {
      addAddTopicButton();
      connectToAddTopicButtons();
    }
    cd.debug.stopTimer('add topic buttons');

    cd.debug.startTimer('mount navPanel');
    if (cd.g.isPageActive) {
      if (cd.g.isPageFirstParsed) {
        navPanel.mount();
      } else {
        navPanel.reset();
      }
    } else {
      if (navPanel.isMounted()) {
        navPanel.unmount();
      }
    }
    cd.debug.stopTimer('mount navPanel');

    cd.debug.stopTimer('main code');

    // Operations that need reflow, such as getBoundingClientRect(), and those dependent on them go
    // in this section.
    cd.debug.startTimer('final code and rendering');

    if (articleId) {
      // Should be below updating content on reload, as it requires the "sheet" property of "style"
      // elements. Should be above reviewing highlightables, as the reviewing relies on floating and
      // hidden elements.
      findFloatingAndHiddenElements();

      cd.debug.startTimer('reviewHighlightables');
      // Should be above all code that deals with comment highlightable elements and comment levels
      // as this may alter that.
      Comment.reviewHighlightables();
      cd.debug.stopTimer('reviewHighlightables');

      cd.debug.startTimer('reformatComments');
      Comment.reformatComments();
      cd.debug.stopTimer('reformatComments');

      // Restore the initial viewport position in terms of visible elements, which is how the user
      // sees it.
      cd.debug.startTimer('restore scroll position');
      restoreRelativeScrollPosition();
      cd.debug.stopTimer('restore scroll position');
    }

    if (isPageCommentable) {
      // Should be below the viewport position restoration as it may rely on elements that are made
      // invisible during the comment forms restoration. Should be below the navPanel mount/reset
      // methods as it calls navPanel.updateCommentFormButton() which depends on the navigation
      // panel being mounted.
      restoreCommentForms();

      const uri = new mw.Uri();
      if (Number(uri.query.cdaddtopic)) {
        CommentForm.createAddSectionForm();
        delete uri.query.cdaddtopic;
        history.replaceState(history.state, '', uri.toString());
      }

      if (cd.g.isPageFirstParsed) {
        const alwaysConfirmLeavingPage = (
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

    if (articleId) {
      // Should better be below the comment form restoration to avoid repositioning of layers after
      // the addition of comment forms.
      const commentsToAddLayers = cd.comments.filter((comment) => (
        comment.isOwn ||

        // Need to generate the gray line to close the gaps between adjacent list item elements. Do
        // it here, not after the comments parsing, to group all operations requiring reflow
        // together for performance reasons.
        comment.isLineGapped
      ));
      Comment.configureAndAddLayers(commentsToAddLayers);

      // Should be below the comment form restoration for threads to be expanded correctly and also
      // to avoid repositioning of threads after the addition of comment forms. Should be below the
      // viewport position restoration, as some elements may get hidden. Should be Should better be
      // above comment highlighting (processVisits(), Comment.configureAndAddLayers()) to avoid
      // spending time on comments in collapsed threads.
      Thread.init();

      // Should be below Thread.init() as it may want to scroll to a comment in a collapsed thread.
      processFragment(passedData);
    }

    if (cd.g.isPageActive) {
      processVisits(visitsRequest, passedData);

      // This should be below processVisits() because updateChecker.processRevisionsIfNeeded needs
      // cd.g.previousVisitUnixTime to be set.
      updateChecker.init(visitsRequest, passedData);
    }

    if (cd.g.isPageFirstParsed) {
      cd.debug.startTimer('pageNav mount');
      pageNav.mount();
      cd.debug.stopTimer('pageNav mount');

      if (!cd.settings.reformatComments) {
        // The "mouseover" event allows to capture the state when the cursor is not moving but ends
        // up above a comment but not above any comment parts (for example, as a result of
        // scrolling). The benefit may be low compared to the performance cost, but it's unexpected
        // when the user scrolls a comment and it suddenly stops being highlighted because the
        // cursor is between neighboring <p>'s.
        $(document).on('mousemove mouseover', Comment.highlightHovered);
      }

      // We need the visibilitychange event because many things may move while the document is
      // hidden, and the movements are not processed when the document is hidden.
      $(document).on('scroll visibilitychange', handleScroll);

      $(window).on('resize orientationchange', handleWindowResize);

      mw.hook('wikipage.content').add(highlightMentions, connectToCommentLinks);
      mw.hook('convenientDiscussions.previewReady').add(connectToCommentLinks);

      if (cd.settings.reformatComments && cd.comments.length) {
        cd.debug.startTimer('parse user links');
        // Should be above "mw.hook('wikipage.content').add" as the next such instruction will run
        // with "$('.cd-comment-author-wrapper')" as $content.
        mw.hook('wikipage.content').fire($('.cd-comment-author-wrapper'));
        cd.debug.stopTimer('parse user links');
      }

      const onPageMutations = () => {
        commentLayers.redrawIfNecessary();
        Thread.updateLines();

        // Could also run handleScroll() here, but not sure, as it will double the execution time
        // with rare effect.
      };

      // Mutation observer doesn't follow all possible comment position changes (for example,
      // initiated with adding new CSS) unfortunately.
      setInterval(() => {
        onPageMutations();
      }, 1000);

      const observer = new MutationObserver((records) => {
        const areLayersOnly = records
          .every((record) => /^cd-comment(Underlay|Overlay|Layers)/.test(record.target.className));
        if (areLayersOnly) return;

        onPageMutations();
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

      if (mw.user.options.get('discussiontools-betaenable')) {
        mw.notify(cd.util.wrap(cd.sParse('discussiontools-incompatible')), { autoHide: false });
      }
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

    if (cd.g.isFirstRun) {
      /**
       * The script has processed the page for the first time since the page load. Use this hook for
       * operations that should run only once.
       *
       * @event pageReadyFirstTime
       * @type {module:cd~convenientDiscussions}
       */
      mw.hook('convenientDiscussions.pageReadyFirstTime').fire(cd);
    }

    finishLoading();

    // The next line is needed to calculate the rendering time: it won't run until everything gets
    // rendered.
    cd.g.rootElement.getBoundingClientRect();

    cd.debug.stopTimer('final code and rendering');
  } else {
    cd.g.isPageActive = false;
    finishLoading();
    const $disableLink = $('#footer-places-togglecd a');
    if ($disableLink.length) {
      $disableLink
        .attr('href', $disableLink.attr('href').replace(/0$/, '1'))
        .text(cd.s('footer-runcd'));
    }
  }

  cd.g.isPageFirstParsed = false;

  cd.debug.stopTimer('total time');
  debugLog();
}
