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
 * Find the closest item (`<li>`, `<dd>`) element for a comment part.
 *
 * @param {Element} commentPartElement
 * @param {number} level
 * @returns {?Element}
 */
function findItemElement(commentPartElement, level) {
  if (!treeWalker) {
    treeWalker = new ElementsTreeWalker();
  }
  treeWalker.currentNode = commentPartElement;

  let item;
  let previousNode = commentPartElement;
  do {
    if (treeWalker.currentNode.classList.contains('cd-commentLevel')) {
      const className = treeWalker.currentNode.getAttribute('class');
      const match = className.match(/cd-commentLevel-(\d+)/);
      if (match && Number(match[1]) === level) {
        item = previousNode;
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

export default class Thread {
  /**
   * Create a comment thread object.
   *
   * @param {Comment} rootComment Root comment of the thread.
   */
  constructor(rootComment) {
    this.rootComment = rootComment;

    const nextToLastCommentId = cd.comments
      .slice(rootComment.id + 1)
      .find((comment) => (
        comment.level <= rootComment.level ||
        comment.section !== rootComment.section
      ))
      ?.id;
    const lastCommentId = nextToLastCommentId ? nextToLastCommentId - 1 : cd.comments.length - 1;
    this.lastComment = cd.comments[lastCommentId];
    this.commentCount = lastCommentId - this.rootComment.id + 1;

    let startItem;
    let endItem;
    if (this.rootComment.level === 0) {
      startItem = this.rootComment.highlightables[0];
      let commonAncestor = startItem;
      const lastHighlightable = this.lastComment
        .highlightables[this.lastComment.highlightables.length - 1];
      endItem = lastHighlightable;
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
    } else {
      startItem = findItemElement(rootComment.highlightables[0], rootComment.level);
      endItem = findItemElement(
        this.lastComment.highlightables[this.lastComment.highlightables.length - 1],
        rootComment.level
      );
    }

    if (startItem && endItem) {
      this.startItem = startItem;
      this.endItem = endItem;
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
    cd.debug.stopTimer('threads createElement create');
  }

  getRangeContents() {
    const range = document.createRange();
    range.setStart(this.startItem, 0);
    const rangeEnd = this.lastComment.replyForm?.$element.is(':visible') ?
      findItemElement(this.lastComment.replyForm.$element.get(0), this.lastComment.level) :
      this.endItem;
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
    if (!treeWalker) {
      treeWalker = new ElementsTreeWalker();
    }
    const rangeContents = [range.startContainer];
    if (range.startContainer !== range.endContainer) {
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
    const rangeContents = this.getRangeContents();

    cd.debug.stopTimer('thread collapse traverse');

    cd.debug.startTimer('thread collapse range');
    this.$collapsedRange = $(rangeContents)
      // We use a class here because there can be elements in the comment that are hidden from the
      // beginning and should stay so when reshowing the comment.
      .addClass('cd-hidden')

      .each((i, el) => {
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
    let tagName = rangeContents[0].tagName;
    if (!['LI', 'DD'].includes(tagName)) {
      tagName = 'DIV';
    }
    this.collapsedNote = document.createElement(tagName);
    this.collapsedNote.className = 'cd-thread-collapsedNote';
    this.collapsedNote.appendChild(button);
    rangeContents[0].parentNode.insertBefore(this.collapsedNote, rangeContents[0]);
    cd.debug.stopTimer('thread collapse button note');

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

    cd.debug.startTimer('thread collapse end');
    saveCollapsedThreads();
    handleScroll();
    cd.debug.stopTimer('thread collapse end');
  }

  expand() {
    this.$collapsedRange.each((i, el) => {
      const $el = $(el);
      const roots = $el.data('cd-collapsed-thread-root-comments') || [];
      removeFromArrayIfPresent(roots, this.rootComment);
      $el.data('cd-collapsed-thread-root-comments', roots);
      if (!roots.length) {
        $el.removeClass('cd-hidden');
      }
    });

    this.isCollapsed = false;
    for (let i = this.rootComment.id; i <= this.lastComment.id; i++) {
      const comment = cd.comments[i];
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

    cd.debug.startTimer('threads update');
    cd.debug.startTimer('threads calculate');

    const elementsToAdd = [];
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
              lineLeft -= cd.g.CONTENT_FONT_SIZE;
            }
            lineTop = window.scrollY + rectTop.top;
          }
        } else {
          if (comment.level === 0) {
            comment.getPositions();
            if (comment.positions) {
              const [leftMargin] = comment.getLayersMargins();
              lineLeft = comment.positions.left - (leftMargin + 1);
              if (!comment.isStartStretched) {
                lineLeft -= cd.g.CONTENT_FONT_SIZE;
              }
              lineTop = comment.positions.top;
            }
          } else {
            rectTop = thread.startItem.getBoundingClientRect();
          }
        }

        let elementBottom;
        if (thread.isCollapsed) {
          elementBottom = thread.collapsedNote;
        } else {
          if (thread.lastComment.replyForm?.$element.is(':visible')) {
            elementBottom = findItemElement(
              thread.lastComment.replyForm.$element.get(0),
              thread.lastComment.level
            );
          } else {
            elementBottom = thread.endItem;
          }
        }

        const rectBottom = elementBottom.getBoundingClientRect();
        cd.debug.stopTimer('threads getBoundingClientRect');

        const rects = [rectTop, rectBottom].filter(defined);
        if (!getVisibilityByRects(...rects) || (rects.length < 2 && lineLeft === undefined)) {
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
          lineLeft = (window.scrollX + rectTop.left) - cd.g.CONTENT_FONT_SIZE;
          lineTop = window.scrollY + rectTop.top;
          lineHeight = rectBottom.bottom - rectTop.top;
        } else {
          lineHeight = rectBottom.bottom - (lineTop - window.scrollY);
        }

        // Find the top comment that has its positions changed and stop at it.
        if (lineTop === thread.lineTop && lineHeight === thread.lineHeight) {
          // Opened/closed "reply in section" comment form will change the thread line height, so we
          // use only this condition.
          return comment.level === 0;
        }

        cd.debug.startTimer('threads createElement');

        thread.lineLeft = lineLeft;
        thread.lineTop = lineTop;
        thread.lineHeight = lineHeight;

        if (!thread.line) {
          thread.createLine();
        }

        thread.clickArea.style.left = thread.lineLeft + 'px';
        thread.clickArea.style.top = thread.lineTop + 'px';
        thread.clickArea.style.height = thread.lineHeight + 'px';

        if (!thread.clickArea.parentNode) {
          elementsToAdd.push(thread.clickArea);
        }

        cd.debug.stopTimer('threads createElement');

        return false;
      });

    cd.debug.stopTimer('threads calculate');
    cd.debug.startTimer('threads append');

    // Faster to add all elements in one batch.
    if (elementsToAdd.length) {
      threadLinesContainer.append(...elementsToAdd);
    }

    cd.debug.stopTimer('threads append');
    cd.debug.stopTimer('threads update');
  }
}
