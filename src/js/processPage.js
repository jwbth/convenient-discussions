/**
 * Talk page (DOM, not wikitext) processing module. Its only export, `processPage()`, is executed
 * after {@link module:app the main module} on first run and as part of
 * {@link module:boot.reloadPage} on subsequent runs.
 *
 * @module processPage
 */

import CdError from './CdError';
import Comment from './Comment';
import CommentForm from './CommentForm';
import Page from './Page';
import Parser from './Parser';
import Section from './Section';
import Thread from './Thread';
import cd from './cd';
import navPanel from './navPanel';
import pageNav from './pageNav';
import toc from './toc';
import updateChecker from './updateChecker';
import {
  addNotFoundMessage,
  confirmDesktopNotifications,
  finishLoading,
  handleWikipageContentHookFirings,
  init,
  isCurrentRevision,
  reloadPage,
  restoreCommentForms,
  saveSession,
  suggestDisableDiscussionTools,
  suggestEnableCommentReformatting,
} from './boot';
import {
  addPreventUnloadCondition,
  handleGlobalKeyDown,
  handleHashChange,
  handleScroll,
  handleWindowResize,
} from './eventHandlers';
import {
  generateCommentAnchor,
  isCommentAnchor,
  parseCommentAnchor,
  parseDtCommentId,
  resetCommentAnchors,
} from './timestamp';
import {
  getExtendedRect,
  replaceAnchorElement,
  restoreRelativeScrollPosition,
  saveRelativeScrollPosition,
} from './util';
import { getVisits, getWatchedSections, setVisits } from './options';

/**
 * Prepare (initialize or reset) various properties, mostly global ones. Some DOM preparations are
 * also made here.
 *
 * @param {import('./commonTypedefs').PassedData} passedData
 * @param {Promise[]} siteDataRequests Array of requests returned by
 *   {@link module:siteData.loadSiteData}.
 * @private
 */
async function prepare(passedData, siteDataRequests) {
  // RevisionSlider replaces the #mw-content-text element.
  if (!cd.g.$content.get(0).parentNode) {
    cd.g.$content = $('#mw-content-text');
  }

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

  // Do it immediately to prevent the issue when any unexpected error prevents this from being
  // executed and then boot.handleWikipageContentHookFirings is called with #mw-content-text element
  // for some reason, and the page goes into an infinite reloading loop.
  cd.g.$root.data('cd-parsed', true);

  toc.reset();

  /**
   * Collection of all comments on the page ordered the same way as in the DOM.
   *
   * @name comments
   * @type {Comment[]}
   * @memberof convenientDiscussions
   */
  cd.comments = [];

  /**
   * Collection of all sections on the page ordered the same way as in the DOM.
   *
   * @name sections
   * @type {Section[]}
   * @memberof convenientDiscussions
   */
  cd.sections = [];

  if (cd.state.isFirstRun) {
    await init(siteDataRequests);
  } else {
    cd.g.$addSectionButtonContainer?.remove();

    // Just submitted form. Forms that should stay are detached in boot.reloadPage().
    $('.cd-commentForm-addSection').remove();

    resetCommentAnchors();
    Comment.resetLayers();
  }
}

/**
 * Get all text nodes under the root element in the window (not worker) context.
 *
 * @returns {Node[]}
 * @private
 */
function getAllTextNodes() {
  const treeWalker = document.createTreeWalker(cd.g.rootElement, NodeFilter.SHOW_TEXT);
  let node;
  const textNodes = [];
  while ((node = treeWalker.nextNode())) {
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
  cd.g.pageHasOutdents = Boolean(cd.g.$root.find('.' + cd.config.outdentClass).length);
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
    } else if (rule instanceof CSSMediaRule) {
      Array.from(rule.cssRules).forEach(filterRules);
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
  cd.g.hiddenElements = hiddenElementSelector ?
    Array.from(cd.g.rootElement.querySelectorAll(hiddenElementSelector)) :
    [];
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
            if (child.tagName) {
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
}

/**
 * Parse the comments and modify the related parts of the DOM.
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

  Comment.reformatTimestamps();

  // Faster than doing it for every individual comment.
  cd.g.rootElement
    .querySelectorAll('table.cd-comment-part .cd-signature')
    .forEach((signature) => {
      const commentId = signature.closest('.cd-comment-part').dataset.commentId;
      cd.comments[commentId].isInSingleCommentTable = true;
    });

  adjustDom();

  /**
   * The script has processed the comments, except for reformatting them in
   * {@link Comment.reformatComments} if the user opted in for that.
   *
   * @event commentsReady
   * @param {object} comments {@link convenientDiscussions.comments} object.
   * @param {object} cd {@link convenientDiscussions} object.
   */
  mw.hook('convenientDiscussions.commentsReady').fire(cd.comments, cd);
}

/**
 * Parse the sections and modify some parts of them.
 *
 * @param {Parser} parser
 * @param {Promise} watchedSectionsRequest
 * @private
 */
function processSections(parser, watchedSectionsRequest) {
  parser.findHeadings().forEach((heading, i, headings) => {
    try {
      const [, level] = heading.tagName.match(/^H([1-6])$/);
      const levelRegexp = new RegExp(`^H[1-${level}]$`);
      const nextRelevantHeading = headings
        .slice(i + 1)
        .find((heading) => levelRegexp.test(heading.tagName));
      const section = parser.createSection(heading, watchedSectionsRequest, nextRelevantHeading);
      cd.sections.push(section);
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
   * @param {object} sections {@link convenientDiscussions.sections} object.
   * @param {object} cd {@link convenientDiscussions} object.
   */
  mw.hook('convenientDiscussions.sectionsReady').fire(cd.sections, cd);
}

/**
 * If a DT's comment form is present (for example, on `&action=edit&section=new` pages), remove it
 * and later replace it with ours, keeping the input.
 *
 * @returns {?object}
 */
function hideDtNewTopicForm() {
  if (!mw.user.options.get('discussiontools-newtopictool')) {
    return null;
  }

  let headline;
  let comment;
  const $dtNewTopicForm = $('.ext-discussiontools-ui-newTopic');
  if ($dtNewTopicForm.length) {
    const $headline = $dtNewTopicForm
      .find('.ext-discussiontools-ui-newTopic-sectionTitle input[type="text"]');
    headline = $headline.val();
    $headline.val('');

    const $comment = $dtNewTopicForm.find('textarea');
    comment = $comment.textSelection('getContents');
    $comment.textSelection('setContents', '');

    // DT's comment form produces errors after opening a CD's comment form because of hard code in
    // WikiEditor that relies on $('#wpTextbox1'). So we create a dummy textarea high in the code
    // that would distract WikiEditor from DT's dummy textarea. We can't simply delete DT's dummy
    // textarea because it can show up unexpectedly right before WikiEditor's code is executed where
    // it's hard for us to wedge in.
    const $dummyTextarea = $('<textarea>').attr('id', 'wpTextbox1');
    const $dummyContainer = $('<div>')
      .append($dummyTextarea)
      .addClass('cd-dummyTextareaContainer')
      .hide();
    cd.g.$content.prepend($dummyContainer);

    // Don't outright remove the element so that DT has time to save the draft as empty.
    $dtNewTopicForm.hide();

    // This looks like it regulates adding a new topic form on DT init. This is for future page
    // updates.
    mw.config.set('wgDiscussionToolsStartNewTopicTool', false);

    return {
      headline,
      comment,
      didReplaceDtForm: true,
    };
  } else {
    return null;
  }
}

/**
 * Add an "Add topic" button to the bottom of the page if there is an "Add topic" tab.
 *
 * @private
 */
function addAddTopicButton() {
  if (
    $('#ca-addsection').length &&
    !(mw.user.options.get('discussiontools-newtopictool') && !mw.config.get('wgArticleId'))
  ) {
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

      // If appending to cd.g.rootElement, it can land on a wrong place, like on 404 pages with New
      // Topic Tool enabled.
      .appendTo(cd.g.$content);
  }
}

/**
 * If the argument is an array, return its last element. Otherwise, return the value. (To process
 * {@link https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.Uri-property-query mw.Uri#query}.
 * If there is no than one parameter with some name, its property becomes an array in
 * `mw.Uri#query`.)
 *
 * @param {string|string[]} value
 * @returns {string}
 * @private
 */
function getLastElementOrSelf(value) {
  return Array.isArray(value) ? value[value.length - 1] : value;
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
      // When DT's new topic tool is enabled
      if (
        mw.util.getParamValue('section') === 'new' &&
        $button.parent().attr('id') !== 'ca-addsection' &&
        !$button.closest(cd.g.$root).length
      ) {
        return false;
      }

      let pageName;
      if ($button.is('a')) {
        const href = $button.attr('href');
        let query;

        // May crash if the current URL contains undecodable "%" in the fragment.
        try {
          query = new mw.Uri(href).query;
        } catch {
          return;
        }
        pageName = getLastElementOrSelf(query.title);
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
      if (page.name !== cd.page.name) {
        return false;
      }
      return true;
    })

    // DT may add its handler (as adds to a "Start new discussion" button on 404 pages). DT's "Add
    // topic" button click handler is trickier, see below.
    .off('click')

    .on('click.cd', function (e) {
      if (e.ctrlKey || e.shiftKey || e.metaKey) return;

      const $button = $(this);
      let preloadConfig;
      let isNewTopicOnTop = false;
      if ($button.is('a')) {
        const href = $button.attr('href');
        let query;

        // May crash if the current URL contains undecodable "%" in the fragment.
        try {
          query = new mw.Uri(href).query;
        } catch {
          return;
        }
        preloadConfig = {
          editIntro: getLastElementOrSelf(query.editintro),
          commentTemplate: getLastElementOrSelf(query.preload),
          headline: getLastElementOrSelf(query.preloadtitle),
          summary: getLastElementOrSelf(query.summary)?.replace(/^.+?\*\/ */, ''),
          noHeadline: Boolean(getLastElementOrSelf(query.nosummary)),
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

  // In case DT's new topic tool is enabled, remove the handler of the "Add topic" button.
  const dtHandler = $._data(document.body).events.click
    ?.find((event) => event.selector?.includes('data-mw-comment'))
    ?.handler;
  if (dtHandler) {
    $(document.body).off('click', dtHandler);
  }
}

/**
 * Highlight mentions of the current user.
 *
 * @param {external:jQuery} $content
 * @private
 */
function highlightMentions($content) {
  if (!$content.is('#mw-content-text, .cd-comment-part')) return;

  const selector = $content.hasClass('cd-comment-part') ?
    `a[title$=":${cd.user.name}"], a[title*=":${cd.user.name} ("]` :
    `.cd-comment-part a[title$=":${cd.user.name}"], .cd-comment-part a[title*=":${cd.user.name} ("]`;
  const excludeSelector = [cd.settings.reformatComments ? 'cd-comment-author' : 'cd-signature']
    .concat(cd.config.elementsToExcludeClasses)
    .map((name) => `.${name}`)
    .join(', ');
  $content
    .find(selector)
    .filter(function () {
      return (
        cd.g.USER_LINK_REGEXP.test(this.title) &&
        !this.closest(excludeSelector) &&
        Parser.processLink(this)?.userName === cd.user.name
      );
    })
    .each((i, link) => {
      link.classList.add('cd-currentUserLink');
    });
}

/**
 * Perform URL fragment-related tasks, as well as comment or section anchor-related ones.
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
  let date;
  let author;
  let parentDate;
  let parentAuthor;
  let sectionAnchorBeginning;
  if (cd.state.isFirstRun) {
    fragment = location.hash.slice(1);
    escapedFragment = $.escapeSelector(fragment);
    try {
      decodedFragment = decodeURIComponent(fragment);
      escapedDecodedFragment = decodedFragment && $.escapeSelector(decodedFragment);
      if (isCommentAnchor(fragment)) {
        commentAnchor = decodedFragment;
      } else {
        ({
          date,
          author,
          parentDate,
          parentAuthor,
          sectionAnchorBeginning,
        } = parseDtCommentId(decodedFragment) || {});
      }
    } catch (e) {
      console.error(e);
    }
  } else {
    commentAnchor = passedData.commentAnchor;
  }

  let comment;
  if (commentAnchor) {
    ({ date, author } = parseCommentAnchor(commentAnchor) || {});
    comment = Comment.getByAnchor(commentAnchor, !passedData.commentAnchor);
  } else if (date) {
    const comments = cd.comments.filter((comment) => (
      comment.date.getTime() === date.getTime() &&
      comment.author.name === author
    ));
    comment = comments.length === 1 ?
      comments[0] :
      comments.find((comment) => (
        comment.getParent()?.date.getTime() === parentDate?.getTime() &&
        comment.getParent()?.author.name === parentAuthor &&
        (!sectionAnchorBeginning || comment.section?.anchor.startsWith(sectionAnchorBeginning))
      ));
    if (!comment) {
      commentAnchor = generateCommentAnchor(date, author);
    }
  }

  if (comment) {
    // setTimeout is for Firefox - for some reason, without it Firefox positions the underlay
    // incorrectly.
    setTimeout(() => {
      comment.scrollTo(false, passedData.pushState);
    });
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

  if (cd.state.isFirstRun && cd.state.isPageActive && decodedFragment) {
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
      await addNotFoundMessage(decodedFragment, date, author);
    }
  }
}

/**
 * Highlight new comments and update the navigation panel. A promise obtained from
 * {@link module:options.getVisits} should be provided.
 *
 * @param {Promise} visitsRequest
 * @param {import('./commonTypedefs').PassedData} passedData
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

  if (currentPageVisits.length >= 1) {
    cd.g.previousVisitUnixTime = Number(currentPageVisits[currentPageVisits.length - 1]);
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
   * @param {object} cd {@link convenientDiscussions} object.
   */
  mw.hook('convenientDiscussions.newCommentsHighlighted').fire(cd);
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
 * _For internal use._ Process the current web page.
 *
 * @param {import('./commonTypedefs').PassedData} [passedData={}] Data passed from the previous page
 *   state.
 * @param {Promise[]} [siteDataRequests] Array of requests returned by
 *   {@link module:siteData.loadSiteData}.
 * @param {number} [cachedScrollY] Vertical scroll position (cached value to avoid reflow).
 * @fires beforeParse
 * @fires commentsReady
 * @fires sectionsReady
 * @fires pageReady
 * @fires pageReadyFirstTime
 */
export default async function processPage(passedData = {}, siteDataRequests, cachedScrollY) {
  if (cd.state.isFirstRun) {
    cd.debug.stopTimer('loading data');
  }
  cd.debug.startTimer('preparations');

  await prepare(passedData, siteDataRequests);

  if (cd.state.isFirstRun) {
    saveRelativeScrollPosition(null, cachedScrollY);
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
         revision. The "convenientDiscussions.state.isPageActive" property is true when the page is
         of this level. The navigation panel is added to such pages, new comments are highlighted.

    We need to be accurate regarding which functionality should be turned on on which level. We
    should also make sure we only add this functionality once. The
    "convenientDiscussions.g.isPageFirstParsed" property is used to reflect the run at which the
    page is parsed for the first time.
   */

   /*
    This property isn't static:
      1. A 404 page doesn't have an ID and is considered inactive, but if the user adds a topic to
         it, it will become active and get an ID.
      2. The user may switch to another revision using RevisionSlider.
      3. On a really rare occasion, an active page may become inactive if it becomes identified as
         an archive page.
  */
  cd.state.isPageActive = articleId && !cd.page.isArchivePage() && isCurrentRevision();

  let watchedSectionsRequest;
  let visitsRequest;
  let parser;
  if (articleId) {
    watchedSectionsRequest = getWatchedSections(true, passedData);
    watchedSectionsRequest.catch((e) => {
      console.warn('Couldn\'t load the settings from the server.', e);
    });

    if (cd.state.isPageActive) {
      visitsRequest = getVisits(true);
    }

    /**
     * The script is going to parse the page for comments, sections, etc.
     *
     * @event beforeParse
     * @param {object} cd {@link convenientDiscussions} object.
     */
    mw.hook('convenientDiscussions.beforeParse').fire(cd);

    findClosedDiscussions();
    findOutdents();
    cd.g.areThereLtrRtlMixes = Boolean(
      document.querySelector('.sitedir-ltr .mw-content-rtl, .sitedir-rtl .mw-content-ltr')
    );

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

    parser.removeDtMarkup();

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
    !cd.state.isFirstRun ||
    cd.comments.length ||
    cd.g.PAGE_WHITELIST_REGEXP?.test(cd.page.name) ||
    $('#ca-addsection').length
  );

  const isPageCommentable = cd.state.isPageActive || !articleId;
  cd.state.isPageFirstParsed = cd.state.isFirstRun || passedData.wasPageCreated;

  let showPopups;
  if (isLikelyTalkPage) {
    if (articleId) {
      cd.debug.startTimer('process sections');

      processSections(parser, watchedSectionsRequest);

      cd.debug.stopTimer('process sections');
    }

    if (passedData.html) {
      cd.debug.startTimer('laying out HTML');
      if (passedData.wasPageCreated) {
        cd.g.$content
          .empty()
          .append(cd.g.$root);
      } else {
        cd.g.$content
          .children('.mw-parser-output')
          .first()
          .replaceWith(cd.g.$root);
      }
      cd.debug.stopTimer('laying out HTML');
    }

    const dataToRestoreFromDtForm = hideDtNewTopicForm();

    if (isPageCommentable) {
      addAddTopicButton();
      connectToAddTopicButtons();
    }

    if (cd.state.isPageActive) {
      // Can be mounted not only on first parse, if using RevisionSlider, for example.
      if (!navPanel.isMounted()) {
        navPanel.mount();
      } else {
        navPanel.reset();
      }
    } else {
      if (navPanel.isMounted()) {
        navPanel.unmount();
      }
    }

    cd.debug.stopTimer('main code');

    // Operations that need reflow, such as getBoundingClientRect(), and those dependent on them go
    // in this section.
    cd.debug.startTimer('final code and rendering');

    if (articleId) {
      // Should be below updating content on reload, as it requires the "sheet" property of "style"
      // elements. Should be above reviewing highlightables, as the reviewing relies on floating and
      // hidden elements.
      findFloatingAndHiddenElements();

      // Should be above all code that deals with comment highlightable elements and comment levels
      // as this may alter that.
      Comment.reviewHighlightables();

      Comment.reformatComments();

      // Restore the initial viewport position in terms of visible elements, which is how the user
      // sees it.
      restoreRelativeScrollPosition();
    }

    if (isPageCommentable) {
      // Should be below the viewport position restoration as it may rely on elements that are made
      // hidden during the comment forms restoration. Should be below the navPanel mount/reset
      // methods as it calls navPanel.updateCommentFormButton() which depends on the navigation
      // panel being mounted.
      restoreCommentForms(passedData.isPageReloadedExternally);

      // May crash if the current URL contains undecodable "%" in the fragment.
      try {
        const uri = new mw.Uri();
        const query = uri.query;

        // &action=edit&section=new when DT's New Topic Tool is enabled.
        if (query.section === 'new' || Number(query.cdaddtopic) || dataToRestoreFromDtForm) {
          CommentForm.createAddSectionForm(undefined, undefined, dataToRestoreFromDtForm);

          delete query.action;
          delete query.section;
          delete query.cdaddtopic;
          history.replaceState(history.state, '', uri.toString());
        }
      } catch {
        // Empty
      }

      if (cd.state.isPageFirstParsed) {
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

        // Need to generate a gray line to close the gaps between adjacent list item elements. Do
        // it here, not after the comments parsing, to group all operations requiring reflow
        // together for performance reasons.
        comment.isLineGapped
      ));
      Comment.configureAndAddLayers(commentsToAddLayers);

      // Should be below the comment form restoration for threads to be expanded correctly and also
      // to avoid repositioning threads after the addition of comment forms. Should be below the
      // viewport position restoration as it may rely on elements that are made hidden during the
      // thread initialization. Should better be above comment highlighting (`processVisits()`,
      // `Comment.configureAndAddLayers()`) to avoid spending time on comments in collapsed threads.
      Thread.init();

      // Should be below Thread.init() as it may want to scroll to a comment in a collapsed thread.
      processFragment(passedData);

      if (cd.state.isPageActive) {
        processVisits(visitsRequest, passedData);

        // This should be below processVisits() because updateChecker.processRevisionsIfNeeded needs
        // cd.g.previousVisitUnixTime to be set.
        updateChecker.init(visitsRequest, passedData);
      }

      if (cd.state.isPageFirstParsed) {
        pageNav.mount();

        if (!cd.settings.reformatComments) {
          // The "mouseover" event allows to capture the state when the cursor is not moving but
          // ends up above a comment but not above any comment parts (for example, as a result of
          // scrolling). The benefit may be low compared to the performance cost, but it's
          // unexpected when the user scrolls a comment and it suddenly stops being highlighted
          // because the cursor is between neighboring <p>'s.
          $(document).on('mousemove mouseover', Comment.highlightHovered);
        }

        // We need the visibilitychange event because many things may move while the document is
        // hidden, and the movements are not processed when the document is hidden.
        $(document).on('scroll visibilitychange', handleScroll);

        $(window)
          .on('resize orientationchange', handleWindowResize)
          .on('hashchange', handleHashChange);

        // Should be above "mw.hook('wikipage.content').fire" so that it runs for the whole page
        // content as opposed to "$('.cd-comment-author-wrapper')".
        mw.hook('wikipage.content').add(highlightMentions);

        let updateThreadLinesHandlerAttached = false;
        const handlePageMutations = () => {
          const floatingRects = cd.g.floatingElements.map(getExtendedRect);
          Comment.redrawLayersIfNecessary(false, false, floatingRects);

          const updateThreadLines = () => {
            Thread.updateLines(floatingRects);
            $(document).off('mousemove', updateThreadLines);
            updateThreadLinesHandlerAttached = false;
          };

          if (!updateThreadLinesHandlerAttached && cd.settings.enableThreads) {
            // Update only on mouse move to prevent short page freezings when there is a comment
            // form in the beginning of a very long page and the input is changed so that everything
            // below the form shifts vertically.
            $(document).on('mousemove', updateThreadLines);
            updateThreadLinesHandlerAttached = true;
          }

          // Could also run handleScroll() here, but not sure, as it will double the execution time
          // with rare effect.
        };

        // Mutation observer doesn't follow all possible comment position changes (for example,
        // initiated with adding new CSS) unfortunately.
        setInterval(() => {
          handlePageMutations();
        }, 1000);

        const observer = new MutationObserver((records) => {
          const layerClassRegexp = /^cd-comment(-underlay|-overlay|Layers)/;
          const areLayersOnly = records.every((record) => layerClassRegexp.test(record.target.className));
          if (areLayersOnly) return;

          handlePageMutations();
        });
        observer.observe(cd.g.$content.get(0), {
          attributes: true,
          childList: true,
          subtree: true,
        });
      } else {
        pageNav.update();
      }

      if (cd.settings.reformatComments && cd.comments.length) {
        // Hardcode for ruwiki where there is such a hook. The hook for other domains could
        // theoretically disrupt code that needs to process the whole page content, if it runs later
        // than CD. But typically CD runs relatively late.
        const hookName = location.hostname === 'ru.wikipedia.org' ?
          'global.userlinks' :
          'wikipage.content';
        mw.hook(hookName).fire($('.cd-comment-author-wrapper'));
      }
    }

    if (isPageCommentable) {
      $(document).on('keydown', handleGlobalKeyDown);
    }

    showPopups = cd.state.isFirstRun && cd.state.isPageActive && cd.user.name !== '<unregistered>';

    /**
     * The script has processed the page.
     *
     * @event pageReady
     * @param {object} cd {@link convenientDiscussions} object.
     */
    mw.hook('convenientDiscussions.pageReady').fire(cd);

    if (cd.state.isFirstRun) {
      /**
       * The script has processed the page for the first time since the page load. Use this hook for
       * operations that should run only once.
       *
       * @event pageReadyFirstTime
       * @param {object} cd {@link convenientDiscussions} object.
       */
      mw.hook('convenientDiscussions.pageReadyFirstTime').fire(cd);
    }

    if (cd.state.isPageFirstParsed) {
      mw.hook('wikipage.content').add(handleWikipageContentHookFirings);
    }

    finishLoading();

    // The next line is needed to calculate the rendering time: it won't run until everything gets
    // rendered.
    cd.g.rootElement.getBoundingClientRect();

    cd.debug.stopTimer('final code and rendering');
  } else {
    cd.debug.stopTimer('main code');

    cd.state.isPageActive = false;

    const $disableLink = $('#footer-places-togglecd a');
    if ($disableLink.length) {
      $disableLink
        .attr('href', $disableLink.attr('href').replace(/0$/, '1'))
        .text(cd.s('footer-runcd'));
    }

    finishLoading();
  }

  cd.debug.stopTimer('total time');
  debugLog();

  if (showPopups) {
    if (mw.user.options.get('discussiontools-replytool')) {
      suggestDisableDiscussionTools();
    }

    const didEnableCommentReformatting = await suggestEnableCommentReformatting();
    await confirmDesktopNotifications();
    if (didEnableCommentReformatting) {
      reloadPage();
      return;
    }
  }
}
