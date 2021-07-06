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
 * Get an end element for a comment at the 0th level.
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
  let endElement = lastHighlightable;
  do {
    commonAncestor = commonAncestor.parentNode;
  } while (!commonAncestor.contains(lastHighlightable));
  cd.debug.startTimer('threads nextForeignElement');
  let n;
  for (
    n = endElement.parentNode;
    n !== commonAncestor && !(nextForeignElement && n.contains(nextForeignElement));
    n = n.parentNode
  ) {
    endElement = n;
  }
  cd.debug.stopTimer('threads nextForeignElement');
  const nextElement = endElement.nextElementSibling;
  if (
    nextElement &&
    nextElement.tagName === 'DL' &&
    nextElement.classList.contains('cd-section-button-container')
  ) {
    endElement = nextElement;
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
     * The root comment of the thread.
     *
     * @type {Comment}
     */
    this.rootComment = rootComment;

    const descendants = rootComment.getChildren(true);

    /**
     * The last comment of the thread (logically, not visually).
     *
     * @type {Comment}
     */
    this.lastComment = descendants[descendants.length - 1] || rootComment;

    /**
     * The number of comments in the thread.
     *
     * @type {number}
     */
    this.commentCount = this.lastComment.id - this.rootComment.id + 1;

    if (cd.g.pageHasOutdents) {
      // Visually last comment (if there are {{outdent}} templates)
      cd.debug.startTimer('visualLastComment');
      const visualDescendants = rootComment.getChildren(true, true);

      /**
       * The last comment of the thread _visually_, not logically.
       *
       * @type {Comment}
       */
      this.visualLastComment = visualDescendants[visualDescendants.length - 1] || rootComment;

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

    if (startElement && endElement && visualEndElement) {
      /**
       * The top element of the thread.
       *
       * @type {Element}
       */
      this.startElement = startElement;

      /**
       * The bottom element of the thread (logically, not visually).
       *
       * @type {Element}
       */
      this.endElement = endElement;

      /**
       * The bottom element of the thread _visually_, not logically.
       *
       * @type {Element}
       */
      this.visualEndElement = visualEndElement;
    } else {
      throw new CdError();
    }
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
   * @param {boolean} isVisual Use the visual thread end.
   * @returns {Element}
   * @private
   */
  getAdjustedEndElement(isVisual) {
    const lastComment = isVisual ? this.visualLastComment : this.lastComment;
    const endElement = isVisual ? this.visualEndElement : this.endElement;
    const subitemList = lastComment.subitemList;
    const $subitem = subitemList.get('newCommentsNote') || subitemList.get('replyForm');
    const adjustedEndElement = $subitem?.is(':visible') ?
      findItemElement($subitem.get(0), lastComment.level) :
      endElement;
    return adjustedEndElement;
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
    const buttonElement = elementPrototypes.expandButton.cloneNode(true);
    const button = new Button({
      action: () => {
        this.expand();
      },
      element: buttonElement,
      labelElement: buttonElement.querySelector('.oo-ui-labelElement-label'),
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
      for (let c = this.rootComment; c; c = c.getParent()) {
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
    this.expandNote.remove();
    this.expandNoteContainer?.remove();

    if (this.rootComment.isOpeningSection) {
      const menu = this.rootComment.section.menu;
      if (menu) {
        menu.editOpeningComment?.setDisabled(false);
      }
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
   */
  static init() {
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
    restoreCollapsedThreads();
    cd.debug.stopTimer('threads restore');
    isInited = true;

    cd.debug.stopTimer('threads');
  }

  /**
   * _For internal use._ Calculate the offset and (if needed) add the thread lines to the container.
   */
  static updateLines() {
    if ((isPageLoading() || document.hidden) && isInited) return;

    cd.debug.startTimer('threads updateLines');
    cd.debug.startTimer('threads calculate');

    const elementsToAdd = [];
    const threadsToUpdate = [];
    let lastUpdatedComment;
    let floatingRects;
    cd.comments
      .slice()
      .reverse()
      .some((comment) => {
        if (!comment.thread) return;

        const lineSideMargin = cd.g.THREAD_LINE_SIDE_MARGIN;
        const lineWidth = 3;

        cd.debug.startTimer('threads getBoundingClientRect');

        const thread = comment.thread;
        let top;
        let left;
        let height;
        let rectTop;
        if (thread.isCollapsed) {
          rectTop = thread.expandNote.getBoundingClientRect();
          if (
            getVisibilityByRects(rectTop) &&
            (comment.level === 0 || thread.expandNote.parentNode.tagName === 'OL')
          ) {
            const commentMargins = comment.getMargins();
            top = window.scrollY + rectTop.top;
            left = cd.g.CONTENT_DIR === 'ltr' ?
              (window.scrollX + rectTop.left) - (commentMargins.left + 1) - lineSideMargin :
              (
                (window.scrollX + rectTop.right) +
                (commentMargins.right + 1) -
                lineWidth -
                lineSideMargin
              );
          }
        } else {
          if (comment.level === 0) {
            cd.debug.startTimer('threads getBoundingClientRect 0');
            floatingRects = floatingRects || cd.g.floatingElements.map(getExtendedRect);
            comment.setOffsetProperty({ floatingRects });
            if (comment.offset) {
              const commentMargins = comment.getMargins();
              top = comment.offset.top;
              left = cd.g.CONTENT_DIR === 'ltr' ?
                comment.offset.left - (commentMargins.left + 1) - lineSideMargin :
                comment.offset.right + (commentMargins.right + 1) - lineWidth - lineSideMargin;
            }
            cd.debug.stopTimer('threads getBoundingClientRect 0');
          } else {
            cd.debug.startTimer('threads getBoundingClientRect other');
            rectTop = thread.startElement.getBoundingClientRect();
            if (
              comment.containerListType === 'ol' ||

              // Occurs when a part of a comment that is not in the thread is next to the start
              // item, for example
              // https://ru.wikipedia.org/wiki/Википедия:Запросы_к_администраторам#202104081533_Macuser.
              thread.startElement.tagName === 'DIV'
            ) {
              floatingRects = floatingRects || cd.g.floatingElements.map(getExtendedRect);
              comment.setOffsetProperty({ floatingRects });
              if (comment.offset) {
                const commentMargins = comment.getMargins();
                top = window.scrollY + rectTop.top;
                left = cd.g.CONTENT_DIR === 'ltr' ?
                  (
                    (window.scrollX + comment.offset.left) -
                    (commentMargins.left + 1) -
                    lineSideMargin
                   ) :
                  (
                    (window.scrollX + comment.offset.right) +
                    commentMargins.right -
                    lineWidth -
                    lineSideMargin
                  );
              }
            }
            cd.debug.stopTimer('threads getBoundingClientRect other');
          }
        }

        const elementBottom = thread.isCollapsed ?
          thread.expandNote :
          thread.getAdjustedEndElement(true);
        cd.debug.startTimer('threads getBoundingClientRect bottom');
        const rectBottom = elementBottom.getBoundingClientRect();
        cd.debug.stopTimer('threads getBoundingClientRect bottom');

        cd.debug.stopTimer('threads getBoundingClientRect');

        const rects = [rectTop, rectBottom].filter(defined);
        if (!getVisibilityByRects(...rects) || (!rectTop && top === undefined)) {
          if (thread.line) {
            thread.clickArea.remove();
            thread.clickArea = null;
            thread.clickAreaOffset = null;
            thread.line = null;
          }
          return false;
        }

        if (top === undefined) {
          top = window.scrollY + rectTop.top;
          left = cd.g.CONTENT_DIR === 'ltr' ?
            (window.scrollX + rectTop.left) - lineSideMargin :
            (window.scrollX + rectTop.right) - lineWidth - lineSideMargin;
          height = rectBottom.bottom - rectTop.top;
        } else {
          height = rectBottom.bottom - (top - window.scrollY);
        }

        // Find the top comment that has its offset changed and stop at it.
        if (
          thread.clickAreaOffset &&
          top === thread.clickAreaOffset.top &&
          height === thread.clickAreaOffset.height
        ) {
          // Opened/closed "reply in section" comment form will change the 0-level thread line
          // height, so we use only these conditions.
          const stop = (
            comment.level === 0 ||
            (lastUpdatedComment && comment.section !== lastUpdatedComment.section)
          );
          lastUpdatedComment = comment;

          return stop;
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

        lastUpdatedComment = comment;

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
