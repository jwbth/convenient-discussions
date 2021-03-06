/**
 * Comment thread class.
 *
 * @module Thread
 */

import Button from './Button';
import CdError from './CdError';
import Comment from './Comment';
import cd from './cd';
import { ElementsTreeWalker } from './treeWalker';
import {
  defined,
  getExtendedRect,
  getFromLocalStorage,
  getVisibilityByRects,
  removeFromArrayIfPresent,
  saveToLocalStorage,
} from './util';
import { getUserGenders } from './apiWrappers';
import { handleScroll } from './eventHandlers';
import { isPageLoading } from './boot';

let elementPrototypes;
let isInited;
let threadLinesContainer;
let treeWalker;

/**
 * Find the closest item element (`li`, `dd`) for an element.
 *
 * @param {Element} element
 * @param {number} level
 * @param {Element} nextForeignElement
 * @returns {?Element}
 * @private
 */
function findItemElement(element, level, nextForeignElement) {
  treeWalker.currentNode = element;

  let item;
  let previousNode = element;
  do {
    if (treeWalker.currentNode.classList.contains('cd-commentLevel')) {
      const className = treeWalker.currentNode.getAttribute('class');
      const match = className.match(/cd-commentLevel-(\d+)/);
      if (match && Number(match[1]) === (level || 1)) {
        // If the level is 0 (outdented comment or subitem of a 0-level comment), we need the list
        // element, not the item element.
        item = level === 0 ? treeWalker.currentNode : previousNode;

        cd.debug.startTimer('threads nextForeignElement');
        // The element can contain parts of a comment that is not in the thread, for example
        // https://ru.wikipedia.org/wiki/Википедия:К_оценке_источников#202104120830_RosssW_2.
        if (nextForeignElement && item.contains(nextForeignElement)) {
          cd.debug.stopTimer('threads nextForeignElement');
          return null;
        }
        cd.debug.stopTimer('threads nextForeignElement');

        break;
      }
    }
    previousNode = treeWalker.currentNode;
  } while (treeWalker.parentNode());

  return item || null;
}

/**
 * Get a thread's end element for a comment at the 0th level.
 *
 * @param {Element} startElement
 * @param {Element[]} highlightables
 * @param {Element} nextForeignElement
 * @returns {Element}
 * @private
 */
function getEndElement(startElement, highlightables, nextForeignElement) {
  let commonAncestor = startElement;
  const lastHighlightable = highlightables[highlightables.length - 1];
  do {
    commonAncestor = commonAncestor.parentNode;
  } while (!commonAncestor.contains(lastHighlightable));

  cd.debug.startTimer('threads nextForeignElement');
  let endElement = lastHighlightable;
  for (
    let n = endElement.parentNode;
    n !== commonAncestor && !(nextForeignElement && n.contains(nextForeignElement));
    n = n.parentNode
  ) {
    endElement = n;
  }
  cd.debug.stopTimer('threads nextForeignElement');

  // "Reply in section", "There are new comments in this thread" button container
  for (
    let n = endElement.nextElementSibling;
    n && n.tagName === 'DL' && n.classList.contains('cd-section-button-container');
    n = n.nextElementSibling
  ) {
    endElement = n;
  }

  return endElement;
}

/**
 * Save collapsed threads to the local storage.
 *
 * @private
 */
function saveCollapsedThreads() {
  if (mw.config.get('wgRevisionId') !== mw.config.get('wgCurRevisionId')) return;

  const collapsedThreads = cd.comments
    .filter((comment) => comment.thread?.isCollapsed)
    .map((comment) => comment.anchor);
  const saveUnixTime = Date.now();
  const data = collapsedThreads.length ? { collapsedThreads, saveUnixTime } : {};

  const dataAllPages = getFromLocalStorage('collapsedThreads');
  dataAllPages[mw.config.get('wgArticleId')] = data;
  saveToLocalStorage('collapsedThreads', dataAllPages);
}

/**
 * Save collapsed threads to the local storage.
 *
 * @private
 */
function restoreCollapsedThreads() {
  const dataAllPages = cleanUpCollapsedThreads(getFromLocalStorage('collapsedThreads'));
  const data = dataAllPages[mw.config.get('wgArticleId')] || {};

  const comments = [];

  // Reverse order is used for threads to be expanded correctly.
  data.collapsedThreads?.reverse().forEach((anchor) => {
    const comment = Comment.getByAnchor(anchor);
    if (comment?.thread) {
      comments.push(comment);
    } else {
      // Remove anchors that have no corresponding comments or threads from data.
      data.collapsedThreads.splice(data.collapsedThreads.indexOf(anchor), 1);
    }
  });
  let getUserGendersPromise;
  if (cd.g.GENDER_AFFECTS_USER_STRING) {
    getUserGendersPromise = getUserGenders(comments.map((comment) => comment.author));
  }
  comments.forEach((comment) => comment.thread.collapse(getUserGendersPromise));

  if (mw.config.get('wgRevisionId') === mw.config.get('wgCurRevisionId')) {
    saveToLocalStorage('collapsedThreads', dataAllPages);
  }
}

/**
 * Clean up collapsed threads data older than 60 days.
 *
 * @param {object[]} data
 * @returns {object}
 * @private
 */
function cleanUpCollapsedThreads(data) {
  const newData = Object.assign({}, data);
  const interval = 60 * cd.g.SECONDS_IN_DAY * 1000;
  Object.keys(newData).forEach((key) => {
    const page = newData[key];
    if (!page.collapsedThreads?.length || page.saveUnixTime < Date.now() - interval) {
      delete newData[key];
    }
  });
  return newData;
}

/**
 * Class used to create a comment thread object.
 */
export default class Thread {
  /**
   * Create a comment thread object.
   *
   * @param {Comment} rootComment Root comment of the thread.
   */
  constructor(rootComment) {
    if (!elementPrototypes) {
      elementPrototypes = cd.g.THREAD_ELEMENT_PROTOTYPES;
    }

    /**
     * Root comment of the thread.
     *
     * @type {Comment}
     * @private
     */
    this.rootComment = rootComment;

    /**
     * Last comment of the thread (logically, not visually).
     *
     * @type {Comment}
     * @private
     */
    this.lastComment = rootComment.getChildren(true).slice(-1)[0] || rootComment;

    /**
     * Number of comments in the thread.
     *
     * @type {number}
     * @private
     */
    this.commentCount = this.lastComment.id - this.rootComment.id + 1;

    if (cd.g.pageHasOutdents) {
      // Visually last comment (if there are {{outdent}} templates)
      cd.debug.startTimer('visualLastComment');
      /**
       * Last comment of the thread _visually_, not logically.
       *
       * @type {Comment}
       * @private
       */
      this.visualLastComment = rootComment.getChildren(true, true).slice(-1)[0] || rootComment;

      cd.debug.stopTimer('visualLastComment');
    } else {
      this.visualLastComment = this.lastComment;
    }

    let startElement;
    let visualEndElement;
    let endElement;
    const highlightables = this.lastComment.highlightables;
    const visualHighlightables = this.visualLastComment.highlightables;
    const nextForeignElement = cd.comments[this.lastComment.id + 1]?.elements[0];
    if (this.rootComment.level === 0) {
      startElement = this.rootComment.highlightables[0];
      visualEndElement = getEndElement(startElement, visualHighlightables, nextForeignElement);
      endElement = this.lastComment === this.visualLastComment ?
        visualEndElement :
        getEndElement(startElement, highlightables, nextForeignElement);
    } else {
      startElement = (
        findItemElement(rootComment.highlightables[0], rootComment.level, nextForeignElement) ||
        rootComment.highlightables[0]
      );
      const lastHighlightable = highlightables[highlightables.length - 1];

      if (this.lastComment === this.visualLastComment) {
        endElement = (
          findItemElement(lastHighlightable, rootComment.level, nextForeignElement) ||
          lastHighlightable
        );

        visualEndElement = endElement;
      } else {
        const outdentedComment = cd.comments
          .slice(0, this.lastComment.id + 1)
          .reverse()
          .find((comment) => comment.isOutdented);
        endElement = outdentedComment.level === 0 ?
          getEndElement(startElement, highlightables, nextForeignElement) :
          findItemElement(lastHighlightable, outdentedComment.level, nextForeignElement);

        const lastVisualHighlightable = visualHighlightables[visualHighlightables.length - 1];
        visualEndElement = findItemElement(
          lastVisualHighlightable,
          rootComment.level,
          nextForeignElement
        );
      }
    }

    if (!startElement || !endElement || !visualEndElement) {
      throw new CdError();
    }

    /**
     * Top element of the thread.
     *
     * @type {Element}
     * @private
     */
    this.startElement = startElement;

    /**
     * Bottom element of the thread (logically, not visually).
     *
     * @type {Element}
     * @private
     */
    this.endElement = endElement;

    /**
     * Bottom element of the thread _visually_, not logically.
     *
     * @type {Element}
     * @private
     */
    this.visualEndElement = visualEndElement;
  }

  /**
   * Create a thread line with a click area around.
   *
   * @private
   */
  createLine() {
    cd.debug.startTimer('threads createElement create');

    /**
     * Click area of the thread line.
     *
     * @type {Element}
     * @private
     */
    this.clickArea = elementPrototypes.clickArea.cloneNode(true);

    if (this.rootComment.isStartStretched) {
      this.clickArea.classList.add('cd-thread-clickArea-stretchedStart');
    }

    this.clickArea.onmouseenter = () => {
      this.highlightTimeout = setTimeout(() => {
        this.clickArea.classList.add('cd-thread-clickArea-hover');
      }, 75);
    };
    this.clickArea.onmouseleave = () => {
      clearTimeout(this.highlightTimeout);
      this.clickArea.classList.remove('cd-thread-clickArea-hover');
    };
    this.clickArea.onclick = () => {
      if (this.clickArea.classList.contains('cd-thread-clickArea-hover')) {
        this.toggle();
      }
    };

    /**
     * Thread line.
     *
     * @type {Element}
     * @private
     */
    this.line = this.clickArea.firstChild;

    if (this.endElement !== this.visualEndElement) {
      let areOutdentedCommentsShown = false;
      for (let i = this.rootComment.id; i <= this.lastComment.id; i++) {
        const comment = cd.comments[i];
        if (comment.isOutdented) {
          areOutdentedCommentsShown = true;
        }
        if (comment.thread?.isCollapsed) {
          i = comment.thread.lastComment.id;
          continue;
        }
      }
      if (areOutdentedCommentsShown) {
        this.line.classList.add('cd-thread-line-extended');
      }
    }
    cd.debug.stopTimer('threads createElement create');
  }

  /**
   * Revise the end element of the thread based on {@link module:Comment#subitemList comment
   * subitems}.
   *
   * @param {boolean} visual Use the visual thread end.
   * @returns {?Element} Logically, should never return `null`, unless something extraordinary
   *   happens that makes the return value of `findItemElement()` `null`.
   * @private
   */
  getAdjustedEndElement(visual) {
    /*
      In a structure like this:

        Comment
          Reply
            Comment form 1
            Reply
              Reply
                Comment form 2
              New comments note 1
            New comments note 2

      - we need to calculate the end element accurately. In this case, it is "New comments note 2",
      despite the fact that it is not a subitem of the last comment. (Subitems of 0-level comments
      are handled by a different mechanism, see `getEndElement()`.)
    */
    const lastComment = visual ? this.visualLastComment : this.lastComment;
    const endElement = visual ? this.visualEndElement : this.endElement;

    // Catch special cases when a section has no "Reply in section" or "There are new comments in
    // this thread" button or the thread isn't the last thread starting with a 0-level comment in
    // the section.
    let threadHasSectionButton = endElement.classList.contains('cd-section-button-container');

    let $lastSubitem;
    if (this.rootComment.level >= 1 || !threadHasSectionButton) {
      const subitemList = this.rootComment.subitemList;
      const $newCommentsNote = (
        subitemList.get('newCommentsNote') ||
        (this.rootComment === lastComment && subitemList.get('replyForm'))
      );
      if ($newCommentsNote) {
        $lastSubitem = $newCommentsNote;
      }
    }

    return $lastSubitem?.is(':visible') ?
      findItemElement($lastSubitem.get(0), this.rootComment.level) :
      endElement;
  }

  /**
   * Get contents of the thread.
   *
   * @returns {Node[]}
   * @private
   */
  getRangeContents() {
    const range = document.createRange();
    range.setStart(this.startElement, 0);
    const rangeEnd = this.getAdjustedEndElement();
    range.setEnd(rangeEnd, rangeEnd.childNodes.length);

    /*
      Here we should equally account for all cases of the start and end item relative position.

        <ul>         <!-- Say, may start anywhere from here... -->
          <li></li>
          <li>
            <div></div>
          </li>
          <li></li>
        </ul>
        <div></div>  <!-- ...to here. And, may end anywhere from here... -->
        <ul>
          <li></li>
          <li>
            <div></div>
          </li>
          <li></li>  <-- ...to here. -->
        </ul>
     */
    cd.debug.startTimer('thread collapse traverse');
    const rangeContents = [range.startContainer];

    // The start container could contain the end container and be different from it in the case with
    // adjusted end items.
    if (!range.startContainer.contains(range.endContainer)) {
      treeWalker.currentNode = range.startContainer;

      while (treeWalker.currentNode.parentNode !== range.commonAncestorContainer) {
        while (treeWalker.nextSibling()) {
          rangeContents.push(treeWalker.currentNode);
        }
        treeWalker.parentNode();
      }
      treeWalker.nextSibling();
      while (!treeWalker.currentNode.contains(range.endContainer)) {
        rangeContents.push(treeWalker.currentNode);
        treeWalker.nextSibling();
      }
      while (treeWalker.currentNode !== range.endContainer) {
        treeWalker.firstChild();
        while (!treeWalker.currentNode.contains(range.endContainer)) {
          rangeContents.push(treeWalker.currentNode);
          treeWalker.nextSibling();
        }
      }
      rangeContents.push(range.endContainer);
    }

    return rangeContents;
  }

  /**
   * Collapse the thread.
   *
   * @param {Promise} [getUserGendersPromise]
   */
  collapse(getUserGendersPromise) {
    /**
     * Nodes that are collapsed. These can change, at least due to comment forms showing up.
     *
     * @type {Node[]|undefined}
     * @private
     */
    this.collapsedRange = this.getRangeContents();

    cd.debug.stopTimer('thread collapse traverse');

    cd.debug.startTimer('thread collapse range');
    this.collapsedRange.forEach((el) => {
      // We use a class here because there can be elements in the comment that are hidden from the
      // beginning and should stay so when reshowing the comment.
      el.classList.add('cd-hidden')

      // An element can be in more than one collapsed range. So, we need to show it when expanding
      // a range only if no active collapsed ranges are left.
      const $el = $(el);
      const roots = $el.data('cd-collapsed-thread-root-comments') || [];
      roots.push(this.rootComment);
      $el.data('cd-collapsed-thread-root-comments', roots);
    });
    cd.debug.stopTimer('thread collapse range');

    cd.debug.startTimer('thread collapse traverse comments');

    /**
     * Is the thread collapsed.
     *
     * @type {boolean}
     */
    this.isCollapsed = true;

    for (let i = this.rootComment.id; i <= this.lastComment.id; i++) {
      const comment = cd.comments[i];
      if (comment.thread?.isCollapsed && comment.thread !== this) {
        i = comment.thread.lastComment.id;
        continue;
      }
      comment.isCollapsed = true;
      comment.collapsedThread = this;
      comment.removeLayers();
    }
    cd.debug.stopTimer('thread collapse traverse comments');

    cd.debug.startTimer('thread collapse button');
    cd.debug.startTimer('thread collapse button create');
    const expandButton = elementPrototypes.expandButton.cloneNode(true);
    const button = new Button({
      action: () => {
        this.expand();
      },
      element: expandButton,
      labelElement: expandButton.querySelector('.oo-ui-labelElement-label'),
    });
    cd.debug.stopTimer('thread collapse button create');
    const author = this.rootComment.author;
    const setLabel = (genderless) => {
      let messageName = genderless ? 'thread-expand-genderless' : 'thread-expand';
      button.setLabel(cd.s(messageName, this.commentCount, author.name, author));
      button.element.classList.remove('cd-thread-button-invisible');
    };
    if (cd.g.GENDER_AFFECTS_USER_STRING) {
      cd.debug.startTimer('thread collapse button gender');
      (getUserGendersPromise || getUserGenders([author])).then(setLabel, () => {
        // Couldn't get the gender, use the genderless version.
        setLabel(true);
      });
      cd.debug.stopTimer('thread collapse button gender');
    } else {
      setLabel();
    }

    cd.debug.startTimer('thread collapse button note');
    const firstElement = this.collapsedRange[0];
    let tagName = firstElement.tagName;
    if (!['LI', 'DD'].includes(tagName)) {
      tagName = 'DIV';
    }
    const expandNote = document.createElement(tagName);
    expandNote.className = 'cd-thread-button-container cd-thread-expandNote';
    expandNote.appendChild(button.element);
    if (firstElement.parentNode.tagName === 'OL' && this.rootComment.ahContainerListType !== 'ol') {
      const container = document.createElement('ul');
      container.className = 'cd-commentLevel';
      container.appendChild(expandNote);
      firstElement.parentNode.parentNode.insertBefore(container, firstElement.parentNode);
      this.expandNoteContainer = container;
    } else {
      firstElement.parentNode.insertBefore(expandNote, firstElement);
    }
    cd.debug.stopTimer('thread collapse button note');

    /**
     * Note in place of a collapsed thread that has a button to expand the thread.
     *
     * @type {Element|undefined}
     * @private
     */
    this.expandNote = expandNote;

    /**
     * Note in place of a collapsed thread as a jQuery object.
     *
     * @type {JQuery|undefined}
     */
    this.$expandNote = $(this.expandNote);

    if (isInited) {
      this.$expandNote.cdScrollIntoView();
    }
    cd.debug.stopTimer('thread collapse button');

    if (this.rootComment.isOpeningSection) {
      const menu = this.rootComment.section.menu;
      if (menu) {
        menu.editOpeningComment?.setDisabled(true);
      }
    }

    if (this.endElement !== this.visualEndElement) {
      for (let c = this.rootComment; c; c = c.getParent(true)) {
        c.thread?.line.classList.remove('cd-thread-line-extended');
      }
    }

    cd.debug.startTimer('thread collapse end');
    saveCollapsedThreads();
    handleScroll();
    cd.debug.stopTimer('thread collapse end');
  }

  /**
   * Expand the thread.
   */
  expand() {
    this.collapsedRange.forEach((el) => {
      const $el = $(el);
      const roots = $el.data('cd-collapsed-thread-root-comments') || [];
      removeFromArrayIfPresent(roots, this.rootComment);
      $el.data('cd-collapsed-thread-root-comments', roots);
      if (!roots.length) {
        el.classList.remove('cd-hidden');
      }
    });

    this.expandNote.remove();
    this.expandNote = null;
    this.expandNoteContainer?.remove();
    this.expandNoteContainer = null;

    if (this.rootComment.isOpeningSection) {
      const menu = this.rootComment.section.menu;
      if (menu) {
        menu.editOpeningComment?.setDisabled(false);
      }
    }

    this.isCollapsed = false;
    let areOutdentedCommentsShown = false;
    for (let i = this.rootComment.id; i <= this.lastComment.id; i++) {
      const comment = cd.comments[i];
      if (comment.isOutdented) {
        areOutdentedCommentsShown = true;
      }
      if (comment.thread?.isCollapsed) {
        i = comment.thread.lastComment.id;
        continue;
      }
      comment.isCollapsed = false;
      delete comment.collapsedThread;
      comment.configureLayers();
    }

    if (this.endElement !== this.visualEndElement && areOutdentedCommentsShown) {
      for (let c = this.rootComment; c; c = c.getParent()) {
        c.thread?.line.classList.add('cd-thread-line-extended');
      }
    }

    saveCollapsedThreads();
    handleScroll();
  }

  /**
   * Expand the thread if it's collapsed and collapse if it's expanded.
   */
  toggle() {
    this[this.isCollapsed ? 'expand' : 'collapse']();
  }

  /**
   * Create threads.
   *
   * @param {boolean} [restoreCollapsed=true]
   */
  static init(restoreCollapsed = true) {
    cd.debug.startTimer('threads');
    cd.debug.startTimer('threads traverse');

    isInited = false;
    treeWalker = new ElementsTreeWalker();
    cd.comments.forEach((rootComment) => {
      try {
        rootComment.thread = new Thread(rootComment);
      } catch (e) {
        // Empty
      }
    });

    cd.debug.stopTimer('threads traverse');

    cd.debug.startTimer('threads reset');
    if (cd.g.isPageFirstParsed) {
      threadLinesContainer = document.createElement('div');
      threadLinesContainer.className = 'cd-thread-linesContainer';
    } else {
      threadLinesContainer.innerHTML = '';
    }
    cd.debug.stopTimer('threads reset');

    // We might not update lines on initialization as it is a relatively costly operation that can
    // be delayed, but not sure it makes any difference at which point the page is blocked for
    // interactions.
    Thread.updateLines();

    cd.debug.startTimer('threads append container');
    if (cd.g.isPageFirstParsed) {
      document.body.appendChild(threadLinesContainer);
    }
    cd.debug.stopTimer('threads append container');
    cd.debug.startTimer('threads restore');
    if (restoreCollapsed) {
      restoreCollapsedThreads();
    }
    cd.debug.stopTimer('threads restore');
    isInited = true;

    cd.debug.stopTimer('threads');
  }

  /**
   * _For internal use._ Calculate the offset and (if needed) add the thread lines to the container.
   *
   * @param {object} [floatingRects]
   */
  static updateLines(floatingRects) {
    if ((isPageLoading() || document.hidden) && isInited) return;

    cd.debug.startTimer('threads updateLines');
    cd.debug.startTimer('threads calculate');

    const getLeft = (rectOrOffset, commentMargins) => {
      let offset;
      if (cd.g.CONTENT_DIR === 'ltr') {
        offset = rectOrOffset.left;
        if (commentMargins) {
          offset -= commentMargins.left + 1;
        }
      } else {
        offset = rectOrOffset.right - lineWidth;
        if (commentMargins) {
          offset += commentMargins.right + 1;
        }
      }
      if (rectOrOffset instanceof DOMRect) {
        offset += scrollX;
      }
      return offset - lineSideMargin;
    };
    const getTop = (rectOrOffset) => (
      rectOrOffset instanceof DOMRect ?
      scrollY + rectOrOffset.top :
      rectOrOffset.top
    );

    const elementsToAdd = [];
    const threadsToUpdate = [];
    const lineSideMargin = cd.g.THREAD_LINE_SIDE_MARGIN;
    const lineWidth = 3;
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    cd.comments
      .slice()
      .reverse()
      .some((comment) => {
        const thread = comment.thread;
        if (!thread || (comment.isCollapsed && !thread.isCollapsed)) return;

        cd.debug.startTimer('threads getBoundingClientRect');

        const needCalculateMargins = (
          comment.level === 0 ||
          comment.containerListType === 'ol' ||

          // Occurs when a part of a comment that is not in the thread is next to the start
          // element, for example
          // https://ru.wikipedia.org/wiki/Project:Запросы_к_администраторам/Архив/2021/04#202104081533_Macuser.
          thread.startElement.tagName === 'DIV'
        );

        let top;
        let left;
        let rectTop;
        let commentMargins;
        if (!needCalculateMargins || thread.isCollapsed) {
          const prop = thread.isCollapsed ? 'expandNote' : 'startElement';
          rectTop = thread[prop].getBoundingClientRect();
        }
        floatingRects = floatingRects || cd.g.floatingElements.map(getExtendedRect);
        let rectOrOffset = rectTop || comment.getOffset({ floatingRects });
        if (needCalculateMargins) {
          // Should be below `comment.getOffset()` as `Comment#isStartStretched` is set inside that
          // call.
          commentMargins = comment.getMargins();
        }
        if (rectOrOffset) {
          top = getTop(rectOrOffset);
          left = getLeft(rectOrOffset, commentMargins);
        }

        const rectBottom = thread.isCollapsed ?
          rectTop :
          thread.getAdjustedEndElement(true)?.getBoundingClientRect();

        cd.debug.stopTimer('threads getBoundingClientRect');

        const areTopAndBottomMisaligned = () => {
          const bottomLeft = getLeft(rectBottom, commentMargins);
          return cd.g.CONTENT_DIR === 'ltr' ? bottomLeft < left : bottomLeft > left;
        };

        if (
          top === undefined ||
          !rectBottom ||
          !getVisibilityByRects(...[rectTop, rectBottom].filter(defined)) ||
          areTopAndBottomMisaligned()
        ) {
          if (thread.line) {
            thread.clickArea.remove();
            thread.clickArea = thread.clickAreaOffset = thread.line = null;
          }
          return false;
        }

        const height = rectBottom.bottom - (top - scrollY);

        // Find the top comment that has its offset changed and stop at it.
        if (
          thread.clickAreaOffset &&
          top === thread.clickAreaOffset.top &&
          height === thread.clickAreaOffset.height
        ) {
          // Opened/closed "Reply in section" comment form will change a 0-level thread line height,
          // so we may go a long way until we finally arrive at a 0-level comment (or a comment
          // without a parent).
          return !comment.getParent(true);
        }

        cd.debug.startTimer('threads createElement');

        thread.clickAreaOffset = { top, left, height };

        if (!thread.line) {
          thread.createLine();
        }

        threadsToUpdate.push(thread);
        if (!thread.clickArea.parentNode) {
          elementsToAdd.push(thread.clickArea);
        }

        cd.debug.stopTimer('threads createElement');

        return false;
      });

    cd.debug.stopTimer('threads calculate');
    cd.debug.startTimer('threads update');

    // Faster to update/add all elements in one batch.
    threadsToUpdate.forEach((thread) => {
      thread.clickArea.style.left = thread.clickAreaOffset.left + 'px';
      thread.clickArea.style.top = thread.clickAreaOffset.top + 'px';
      thread.clickArea.style.height = thread.clickAreaOffset.height + 'px';
    });

    cd.debug.stopTimer('threads update');
    cd.debug.startTimer('threads append');

    if (elementsToAdd.length) {
      threadLinesContainer.append(...elementsToAdd);
    }

    cd.debug.stopTimer('threads append');
    cd.debug.stopTimer('threads updateLines');
  }
}
