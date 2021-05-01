/**
 * Comment thread class.
 *
 * @module Thread
 */

import CdError from './CdError';
import Comment from './Comment';
import cd from './cd';
import { ElementsTreeWalker } from './treeWalker';
import {
  defined,
  getFromLocalStorage,
  getVisibilityByRects,
  removeFromArrayIfPresent,
  saveToLocalStorage,
} from './util';
import { getUserGenders } from './apiWrappers';
import { handleScroll } from './eventHandlers';
import { isPageLoading } from './boot';

let isInited;
let threadLinesContainer;
let treeWalker;

/**
 * Find the closest item element (`li`, `dd`) for an element.
 *
 * @param {Element} element
 * @param {number} level
 * @returns {?Element}
 */
function findItemElement(element, level) {
  treeWalker.currentNode = element;

  let item;
  let previousNode = element;
  do {
    if (treeWalker.currentNode.classList.contains('cd-commentLevel')) {
      const className = treeWalker.currentNode.getAttribute('class');
      const match = className.match(/cd-commentLevel-(\d+)/);
      if (match && Number(match[1]) === (level || 1)) {
        // Level can be 0 when we start from a comment form.
        item = level === 0 ? treeWalker.currentNode : previousNode;
        break;
      }
    }
    previousNode = treeWalker.currentNode;
  } while (treeWalker.parentNode());

  return item || null;
}

/**
 * Save collapsed threads to the local storage.
 *
 * @private
 */
function saveCollapsedThreads() {
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

  saveToLocalStorage('collapsedThreads', dataAllPages);
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

function getEndItem(startItem, highlightables) {
  let commonAncestor = startItem;
  const lastHighlightable = highlightables[highlightables.length - 1];
  let endItem = lastHighlightable;
  do {
    commonAncestor = commonAncestor.parentNode;
  } while (!commonAncestor.contains(lastHighlightable));
  while (endItem.parentNode !== commonAncestor) {
    endItem = endItem.parentNode;
  }
  const nextElement = endItem.nextElementSibling;
  if (
    nextElement &&
    nextElement.tagName === 'UL' &&
    nextElement.classList.contains('cd-sectionButton-container')
  ) {
    endItem = nextElement;
  }
  return endItem;
}

export default class Thread {
  /**
   * Create a comment thread object.
   *
   * @param {Comment} rootComment Root comment of the thread.
   */
  constructor(rootComment) {
    this.rootComment = rootComment;

    // Logically last comment
    const descendants = rootComment.getChildren(true);
    this.lastComment = descendants[descendants.length - 1] || rootComment;

    this.commentCount = this.lastComment.id - this.rootComment.id + 1;

    if (cd.g.pageHasOutdents) {
      cd.debug.startTimer('visualLastComment');
      // Visually last comment (if there are {{outdent}} templates)
      const visualDescendants = rootComment.getChildren(true, true);
      this.visualLastComment = visualDescendants[visualDescendants.length - 1] || rootComment;
      cd.debug.stopTimer('visualLastComment');
    } else {
      this.visualLastComment = this.lastComment;
    }

    let startItem;
    let visualEndItem;
    let endItem;
    const highlightables = this.lastComment.highlightables;
    const visualHighlightables = this.visualLastComment.highlightables;
    if (this.rootComment.level === 0) {
      startItem = this.rootComment.highlightables[0];
      visualEndItem = getEndItem(startItem, visualHighlightables);
      endItem = this.lastComment === this.visualLastComment ?
        visualEndItem :
        getEndItem(startItem, highlightables);

    } else {
      startItem = findItemElement(rootComment.highlightables[0], rootComment.level);
      const lastVisualHighlightable = visualHighlightables[visualHighlightables.length - 1];
      visualEndItem = findItemElement(lastVisualHighlightable, rootComment.level);

      if (this.lastComment === this.visualLastComment) {
        endItem = visualEndItem;
      } else {
        const outdentedComment = cd.comments
          .slice(0, this.lastComment.id + 1)
          .reverse()
          .find((comment) => comment.isOutdented);
        const lastHighlightable = highlightables[highlightables.length - 1];
        endItem = findItemElement(lastHighlightable, outdentedComment.level);
      }
    }

    if (startItem && endItem && visualEndItem) {
      this.startItem = startItem;
      this.endItem = endItem;
      this.visualEndItem = visualEndItem;
    } else {
      throw new CdError();
    }
  }

  createLine() {
    cd.debug.startTimer('threads createElement create');
    this.clickArea = cd.g.THREAD_ELEMENT_PROTOTYPES.clickArea.cloneNode(true);
    if (this.rootComment.isStartStretched) {
      this.clickArea.classList.add('cd-threadLine-clickArea-stretchedStart');
    }
    this.clickArea.onclick = () => {
      this.toggle();
    };
    this.line = this.clickArea.firstChild;
    if (this.endItem !== this.visualEndItem) {
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
        this.line.classList.add('cd-threadLine-extended');
      }
    }
    cd.debug.stopTimer('threads createElement create');
  }

  getAdjustedEndItem(isVisual) {
    const lastComment = isVisual ? this.visualLastComment : this.lastComment;
    const endItem = isVisual ? this.visualEndItem : this.endItem;
    const subitemList = lastComment.subitemList;
    const $subitem = subitemList.get('newRepliesNote') || subitemList.get('replyForm');
    const adjustedEndItem = $subitem?.is(':visible') ?
      findItemElement($subitem.get(0), lastComment.level) :
      endItem;
    return adjustedEndItem;
  }

  getRangeContents() {
    const range = document.createRange();
    range.setStart(this.startItem, 0);
    const rangeEnd = this.getAdjustedEndItem();
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

  collapse(getUserGendersPromise) {
    // The range contents can change, at least due to appearance of comment forms.
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
    const button = cd.g.THREAD_ELEMENT_PROTOTYPES.collapsedButton.cloneNode(true);
    cd.debug.stopTimer('thread collapse button create');
    button.firstChild.onclick = () => {
      this.expand();
    };
    const author = this.rootComment.author;
    const setLabel = (genderless) => {
      let messageName = genderless ? 'thread-expand-genderless' : 'thread-expand';
      const label = button.firstChild.firstChild.nextSibling;
      label.textContent = cd.s(messageName, this.commentCount, author.name, author);
      button.classList.remove('cd-threadButton-invisible');
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
    let tagName = this.collapsedRange[0].tagName;
    if (!['LI', 'DD'].includes(tagName)) {
      tagName = 'DIV';
    }
    const collapsedNote = document.createElement(tagName);
    collapsedNote.className = 'cd-threadButton-container cd-thread-collapsedNote';
    collapsedNote.appendChild(button);
    this.collapsedRange[0].parentNode.insertBefore(collapsedNote, this.collapsedRange[0]);
    cd.debug.stopTimer('thread collapse button note');

    this.collapsedNote = collapsedNote;
    this.$collapsedNote = $(this.collapsedNote);
    if (isInited) {
      this.$collapsedNote.cdScrollIntoView();
    }
    cd.debug.stopTimer('thread collapse button');

    if (this.rootComment.isOpeningSection) {
      const menu = this.rootComment.section.menu;
      if (menu) {
        menu.editOpeningComment.wrapper.style.display = 'none';
      }
    }

    if (this.endItem !== this.visualEndItem) {
      for (let c = this.rootComment; c; c = c.getParent()) {
        c.thread?.line.classList.remove('cd-threadLine-extended');
      }
    }

    cd.debug.startTimer('thread collapse end');
    saveCollapsedThreads();
    handleScroll();
    cd.debug.stopTimer('thread collapse end');
  }

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
    this.collapsedNote.remove();

    if (this.rootComment.isOpeningSection) {
      const menu = this.rootComment.section.menu;
      if (menu) {
        menu.editOpeningComment.wrapper.style.display = '';
      }
    }

    if (this.endItem !== this.visualEndItem && areOutdentedCommentsShown) {
      for (let c = this.rootComment; c; c = c.getParent()) {
        c.thread?.line.classList.add('cd-threadLine-extended');
      }
    }

    saveCollapsedThreads();
    handleScroll();
  }

  toggle() {
    this[this.isCollapsed ? 'expand' : 'collapse']();
  }

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
      threadLinesContainer.className = 'cd-threadLinesContainer';
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

  static updateLines() {
    if ((isPageLoading() || document.hidden) && isInited) return;

    cd.debug.startTimer('threads updateLines');
    cd.debug.startTimer('threads calculate');

    const elementsToAdd = [];
    const threadsToUpdate = [];
    let lastCheckedComment;
    cd.comments
      .slice()
      .reverse()
      .some((comment) => {
        if (!comment.thread) return;

        cd.debug.startTimer('threads getBoundingClientRect');

        const thread = comment.thread;
        let lineLeft;
        let lineTop;
        let lineHeight;
        let rectTop;
        if (thread.isCollapsed) {
          rectTop = thread.collapsedNote.getBoundingClientRect();
          if (comment.level === 0) {
            const [leftMargin] = comment.getLayersMargins();
            lineLeft = (window.scrollX + rectTop.left) - (leftMargin + 1);
            if (!comment.isStartStretched) {
              lineLeft -= cd.g.CONTENT_FONT_SIZE + 3;
            }
            lineTop = window.scrollY + rectTop.top;
          }
        } else {
          if (comment.level === 0) {
            cd.debug.startTimer('threads getBoundingClientRect 0');
            comment.getPositions();
            if (comment.positions) {
              const [leftMargin] = comment.getLayersMargins();
              lineLeft = comment.positions.left - (leftMargin + 1);
              if (!comment.isStartStretched) {
                lineLeft -= cd.g.CONTENT_FONT_SIZE + 3;
              }
              lineTop = comment.positions.top;
            }
            cd.debug.stopTimer('threads getBoundingClientRect 0');
          } else {
            cd.debug.startTimer('threads getBoundingClientRect other');
            rectTop = thread.startItem.getBoundingClientRect();
            cd.debug.stopTimer('threads getBoundingClientRect other');
          }
        }

        if (rectTop && comment.containerListType === 'ol') {
          const [leftMargin] = comment.getLayersMargins();
          lineTop = window.scrollY + rectTop.top;
          lineLeft = (
            (window.scrollX + rectTop.left) -
            (leftMargin + 1) -
            (cd.g.CONTENT_FONT_SIZE + 3)
          );
        }

        const elementBottom = thread.isCollapsed ?
          thread.collapsedNote :
          thread.getAdjustedEndItem(true);

        cd.debug.startTimer('threads getBoundingClientRect bottom');
        const rectBottom = elementBottom.getBoundingClientRect();
        cd.debug.stopTimer('threads getBoundingClientRect bottom');
        cd.debug.stopTimer('threads getBoundingClientRect');

        const rects = [rectTop, rectBottom].filter(defined);
        if (!getVisibilityByRects(...rects) || (!rectTop && lineLeft === undefined)) {
          if (thread.line) {
            thread.clickArea.remove();
            thread.clickArea = null;
            thread.line = null;
            thread.lineLeft = null;
            thread.lineTop = null;
            thread.lineHeight = null;
          }
          return false;
        }

        if (lineLeft === undefined) {
          lineLeft = (window.scrollX + rectTop.left) - (cd.g.CONTENT_FONT_SIZE + 3);
          lineTop = window.scrollY + rectTop.top;
          lineHeight = rectBottom.bottom - rectTop.top;
        } else {
          lineHeight = rectBottom.bottom - (lineTop - window.scrollY);
        }

        // Find the top comment that has its positions changed and stop at it.
        if (lineTop === thread.lineTop && lineHeight === thread.lineHeight) {
          // Opened/closed "reply in section" comment form will change the 0-level thread line
          // height, so we use only these conditions.
          return (
            comment.level === 0 ||
            (lastCheckedComment && comment.section !== lastCheckedComment.section)
          );
        }

        cd.debug.startTimer('threads createElement');

        thread.lineLeft = lineLeft;
        thread.lineTop = lineTop;
        thread.lineHeight = lineHeight;

        if (!thread.line) {
          thread.createLine();
        }

        threadsToUpdate.push(thread);
        if (!thread.clickArea.parentNode) {
          elementsToAdd.push(thread.clickArea);
        }

        cd.debug.stopTimer('threads createElement');

        lastCheckedComment = comment;

        return false;
      });

    cd.debug.stopTimer('threads calculate');
    cd.debug.startTimer('threads update');

    // Faster to update/add all elements in one batch.
    threadsToUpdate.forEach((thread) => {
      thread.clickArea.style.left = thread.lineLeft + 'px';
      thread.clickArea.style.top = thread.lineTop + 'px';
      thread.clickArea.style.height = thread.lineHeight + 'px';
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
