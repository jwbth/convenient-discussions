import Button from './Button';
import CdError from './CdError';
import Comment from './Comment';
import cd from './cd';
import controller from './controller';
import settings from './settings';
import { ElementsTreeWalker } from './treeWalker';
import {
  defined,
  flat,
  getCommonGender,
  getExtendedRect,
  getFromLocalStorage,
  getVisibilityByRects,
  isCmdModifierPressed,
  isHeadingNode,
  removeFromArrayIfPresent,
  saveToLocalStorage,
  unique,
} from './util';
import { loadUserGenders } from './apiWrappers';

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

        // The element can contain parts of a comment that is not in the thread, for example
        // https://ru.wikipedia.org/wiki/Википедия:К_оценке_источников#202104120830_RosssW_2.
        if (nextForeignElement && item.contains(nextForeignElement)) {
          return null;
        }

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

  let endElement = lastHighlightable;
  for (
    let n = endElement.parentNode;
    n !== commonAncestor && !(nextForeignElement && n.contains(nextForeignElement));
    n = n.parentNode
  ) {
    endElement = n;
  }

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
  if (!controller.isCurrentRevision()) return;

  const threads = cd.comments
    .filter((comment) => (
      comment.thread &&
      comment.thread.isCollapsed !== Boolean(comment.thread.isAutocollapseTarget)
    ))
    .map((comment) => ({
      id: comment.id,
      collapsed: comment.thread.isCollapsed,
    }));
  const saveUnixTime = Date.now();
  const data = threads.length ? { threads, saveUnixTime } : {};

  const dataAllPages = getFromLocalStorage('collapsedThreads');
  dataAllPages[mw.config.get('wgArticleId')] = data;
  saveToLocalStorage('collapsedThreads', dataAllPages);
}

/**
 * Autocollapse threads starting from some level according to the setting value and restore
 * collapsed threads from the local storage.
 *
 * @private
 */
function autocollapseThreads() {
  const dataAllPages = cleanUpCollapsedThreads(getFromLocalStorage('collapsedThreads'));
  const data = dataAllPages[mw.config.get('wgArticleId')] || {};

  let comments = [];

  data.threads?.forEach((thread) => {
    const comment = Comment.getById(thread.id);
    if (comment?.thread) {
      if (thread.collapsed) {
        comments.push(comment);
      } else {
        /**
         * Whether the thread should have been autocollapsed, but haven't been because the user
         * expanded it manually in previous sessions.
         *
         * @name wasManuallyExpanded
         * @type {boolean}
         * @memberof Thread
         * @instance
         * @private
         */
        comment.thread.wasManuallyExpanded = true;
      }
    } else {
      // Remove IDs that have no corresponding comments or threads from the data.
      data.threads.splice(data.threads.indexOf(thread.id), 1);
    }
  });

  const collapseThreadsLevel = settings.get('collapseThreadsLevel');
  if (collapseThreadsLevel !== 0) {
    // Don't precisely target comments of level collapseThreadsLevel in case there is a gap, for
    // example between the (collapseThreadsLevel - 1) level and the (collapseThreadsLevel + 1) level
    // (the user should have replied on the (collapseThreadsLevel - 1) level but inserted two "::"
    // instead of one).
    for (let i = 0; i < cd.comments.length; i++) {
      const comment = cd.comments[i];
      if (!comment.thread) continue;

      if (comment.level >= collapseThreadsLevel) {
        // Exclude threads where the user participates at any level up and down the tree or that the
        // user has specifically expanded.
        if (![...comment.getAncestors(), ...comment.thread.comments].some((c) => c.isOwn)) {
          /**
           * Should the thread be automatically collapsed on page load if taking only comment level
           * into account and not remembering the user's previous actions.
           *
           * @name isAutocollapseTarget
           * @type {boolean}
           * @memberof Thread
           * @instance
           * @private
           */
          comment.thread.isAutocollapseTarget = true;

          if (!comment.thread.wasManuallyExpanded) {
            comments.push(comment);
          }
        }

        i = comment.thread.lastComment.index;
      }
    }
  }

  const loadUserGendersPromise = cd.g.GENDER_AFFECTS_USER_STRING ?
    loadUserGenders(flat(comments.map((comment) => comment.thread.getUsersInThread()))) :
    undefined;

  // Reverse order is used for threads to be expanded correctly.
  comments
    .sort((c1, c2) => c1.index - c2.index)
    .forEach((comment) => {
      comment.thread.collapse(loadUserGendersPromise);
    });

  if (controller.isCurrentRevision()) {
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
  Object.keys(newData).forEach((key) => {
    const page = newData[key];
    if (!page.threads?.length || page.saveUnixTime < Date.now() - 60 * cd.g.MS_IN_DAY) {
      delete newData[key];
    }
  });
  return newData;
}

/**
 * Class used to create a comment thread object.
 */
class Thread {
  /**
   * Create a comment thread object.
   *
   * @param {Comment} rootComment Root comment of the thread.
   */
  constructor(rootComment) {
    this.handleClickAreaHover = this.handleClickAreaHover.bind(this);
    this.handleClickAreaUnhover = this.handleClickAreaUnhover.bind(this);
    this.handleToggleClick = this.handleToggleClick.bind(this);

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
     * List of comments in the thread (logically, not visually).
     *
     * @type {Comment}
     * @private
     */
    this.comments = [rootComment, ...rootComment.getChildren(true)];

    /**
     * Last comment of the thread (logically, not visually).
     *
     * @type {Comment}
     * @private
     */
    this.lastComment = this.comments.slice(-1)[0];

    /**
     * Number of comments in the thread.
     *
     * @type {number}
     * @private
     */
    this.commentCount = this.lastComment.index - this.rootComment.index + 1;

    /**
     * Whether the thread has outdented comments.
     *
     * @type {boolean}
     * @private
     */
    this.hasOutdents = (
      controller.areThereOutdents() &&
      this.comments.slice(1).some((comment) => comment.isOutdented)
    );

    /**
     * Last comment of the thread _visually_, not logically (differs from {@link Thread#lastComment}
     * if there are `{{outdent}}` templates in the thread).
     *
     * @type {Comment}
     * @private
     */
    this.visualLastComment = this.hasOutdents ?
      rootComment.getChildren(true, true).slice(-1)[0] || rootComment :
      this.lastComment;

    /**
     * Fallback visual last comment. Used when `Thread#visualEndElement` may be hidden without
     * collapsing the thread. That usually means `Thread#visualEndElement` has the
     * `cd-connectorToPreviousItem` class.
     *
     * @type {Comment}
     * @private
     */
    this.visualLastCommentFallback = this.hasOutdents ?
      // `|| rootComment` part for a very weird case when an outdented comment is at the same level
      // as its parent.
      rootComment.getChildren(true, true, false).slice(-1)[0] || rootComment :

      this.lastComment;

    this.setMarginalElementProperties();

    /**
     * Is the thread collapsed.
     *
     * @type {boolean}
     */
    this.isCollapsed = false;
  }

  /**
   * Set {@link Thread#startElement}, {@link Thread#endElement}, and {@link Thread#visualEndElement}
   * properties.
   *
   * @throws {CdError}
   * @private
   */
  setMarginalElementProperties() {
    let startElement;
    let endElement;
    let visualEndElement;
    let visualEndElementFallback;
    const firstNotHeadingElement = this.rootComment.elements.find((el) => !isHeadingNode(el));
    const highlightables = this.lastComment.highlightables;
    const visualHighlightables = this.visualLastComment.highlightables;
    const visualHighlightablesFallback = this.visualLastCommentFallback.highlightables;
    const nextForeignElement = cd.comments[this.lastComment.index + 1]?.elements[0];

    if (this.rootComment.level === 0) {
      startElement = firstNotHeadingElement;
      visualEndElement = getEndElement(startElement, visualHighlightables, nextForeignElement);
      visualEndElementFallback = this.visualLastComment === this.visualLastCommentFallback ?
        visualEndElement :
        getEndElement(startElement, visualHighlightablesFallback, nextForeignElement);
      endElement = this.hasOutdents ?
        getEndElement(startElement, highlightables, nextForeignElement) :
        visualEndElement;
    } else {
      // We could improve the positioning of the thread line to exclude the vertical space next to
      // an outdent template placed at a non-0 level by taking the first element as the start
      // element. But then we need to fix areTopAndBottomAligned() (calculate the last comment's
      // margins instead of using the first comment's) and controller.getRangeContents() (come up
      // with a treatment for the situation when the end element includes the start element).
      startElement = (
        findItemElement(firstNotHeadingElement, this.rootComment.level, nextForeignElement) ||
        firstNotHeadingElement
      );
      const lastHighlightable = highlightables[highlightables.length - 1];

      if (this.hasOutdents) {
        const lastOutdentedComment = cd.comments
          .slice(0, this.lastComment.index + 1)
          .reverse()
          .find((comment) => comment.isOutdented);
        endElement = lastOutdentedComment.level === 0 ?
          getEndElement(startElement, highlightables, nextForeignElement) :
          findItemElement(
            lastHighlightable,
            Math.min(lastOutdentedComment.level, this.rootComment.level),
            nextForeignElement
          );

        visualEndElement = findItemElement(
          visualHighlightables[visualHighlightables.length - 1],
          this.rootComment.level,
          nextForeignElement
        );
        visualEndElementFallback = this.visualLastComment === this.visualLastCommentFallback ?
          visualEndElement :
          findItemElement(
            visualHighlightablesFallback[visualHighlightablesFallback.length - 1],
            this.rootComment.level,
            nextForeignElement
          );
      } else {
        endElement = (
          findItemElement(lastHighlightable, this.rootComment.level, nextForeignElement) ||
          lastHighlightable
        );

        visualEndElementFallback = visualEndElement = endElement;
      }
    }

    if (!startElement || !endElement || !visualEndElement || !visualEndElementFallback) {
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
     * Bottom element of the thread _visually_, not logically (differs from
     * {@link Thread#endElement} if there are `{{outdent}}` templates in the thread).
     *
     * @type {Element}
     * @private
     */
    this.visualEndElement = visualEndElement;

    /**
     * Fallback visual end element. Used when `Thread#visualEndElement` may be hidden without
     * collapsing the thread. That usually means `Thread#visualEndElement` has the
     * `cd-connectorToPreviousItem` class.
     *
     * @type {Element}
     * @private
     */
    this.visualEndElementFallback = visualEndElementFallback;
  }

  /**
   * Handle the `mouseenter` event on the click area.
   *
   * @private
   */
  handleClickAreaHover() {
    this.highlightTimeout = setTimeout(() => {
      this.clickArea?.classList.add('cd-thread-clickArea-hovered');
    }, 75);
  }

  /**
   * Handle the `mouseleave` event on the click area.
   *
   * @private
   */
  handleClickAreaUnhover() {
    clearTimeout(this.highlightTimeout);
    this.clickArea?.classList.remove('cd-thread-clickArea-hovered');
  }

  /**
   * Handle the `click` event on the click area.
   *
   * @private
   */
  handleToggleClick() {
    if (!this.clickArea.classList.contains('cd-thread-clickArea-hovered')) return;

    this.toggle();
  }

  /**
   * Create a thread line with a click area around.
   *
   * @private
   */
  createLine() {
    /**
     * Click area of the thread line.
     *
     * @type {Element}
     * @private
     */
    this.clickArea = elementPrototypes.clickArea.cloneNode(true);

    this.clickArea.title = cd.s('thread-tooltip');

    if (this.rootComment.isStartStretched) {
      this.clickArea.classList.add('cd-thread-clickArea-stretchedStart');
    }

    // Add some debouncing so that the user is not annoyed by the cursor changing its form when
    // moving across thread lines.
    this.clickArea.onmouseenter = this.handleClickAreaHover;
    this.clickArea.onmouseleave = this.handleClickAreaUnhover;

    this.clickArea.onclick = this.handleToggleClick;

    /**
     * Thread line.
     *
     * @type {Element}
     * @private
     */
    this.line = this.clickArea.firstChild;

    if (this.endElement !== this.visualEndElement) {
      let areOutdentedCommentsShown = false;
      for (let i = this.rootComment.index; i <= this.lastComment.index; i++) {
        const comment = cd.comments[i];
        if (comment.isOutdented) {
          areOutdentedCommentsShown = true;
        }
        if (comment.thread?.isCollapsed) {
          i = comment.thread.lastComment.index;
          continue;
        }
      }
      if (areOutdentedCommentsShown) {
        this.line.classList.add('cd-thread-line-extended');
      }
    }
  }

  /**
   * Revise the end element of the thread based on {@link Comment#subitemList comment subitems}.
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
    let lastComment;
    let endElement;
    if (visual) {
      lastComment = this.visualLastComment;
      endElement = this.visualEndElement;
      if (
        endElement.classList.contains('cd-hidden') &&
        endElement.previousElementSibling?.classList.contains('cd-thread-expandNote')
      ) {
        endElement = endElement.previousElementSibling;
      }
      if (!getVisibilityByRects(endElement.getBoundingClientRect())) {
        endElement = this.visualEndElementFallback;
      }
    } else {
      lastComment = this.lastComment;
      endElement = this.endElement;
    }

    const $lastSubitem = (
      (
        this.rootComment.level >= 1 ||

        // Catch special cases when a section has no "Reply in section" and "There are new comments
        // in this thread" button or the thread isn't the last thread starting with a 0-level
        // comment in the section.
        !endElement.classList.contains('cd-section-button-container')
      ) &&
      (
        this.rootComment.subitemList.get('newCommentsNote') ||
        (this.rootComment === lastComment && this.rootComment.subitemList.get('replyForm'))
      ) ||
      undefined
    );

    return $lastSubitem?.is(':visible') ?
      findItemElement($lastSubitem.get(0), this.rootComment.level) :
      endElement;
  }

  /**
   * Get a list of users in the thread.
   *
   * @returns {import('./userRegistry').User[]}
   * @private
   */
  getUsersInThread() {
    return [this.rootComment, ...this.rootComment.getChildren(true)]
      .map((comment) => comment.author)
      .filter(unique);
  }

  /**
   * Add an expand note when collapsing a thread.
   *
   * @param {Promise.<undefined>} [loadUserGendersPromise]
   * @private
   */
  addExpandNode(loadUserGendersPromise) {
    const expandButton = elementPrototypes.expandButton.cloneNode(true);
    const button = new Button({
      tooltip: cd.s('thread-expand-tooltip', cd.g.CMD_MODIFIER),
      action: (e) => {
        if (isCmdModifierPressed(e)) {
          cd.comments.slice().reverse().forEach((comment) => {
            if (comment.thread?.isCollapsed) {
              comment.thread.expand();
            }
          });
        } else {
          this.expand();
        }
      },
      element: expandButton,
      labelElement: expandButton.querySelector('.oo-ui-labelElement-label'),
    });
    const usersInThread = this.getUsersInThread();
    const userList = usersInThread
      .map((author) => author.getName())
      .join(cd.mws('comma-separator'));
    const setLabel = (genderless) => {
      button.setLabel(cd.s(
        genderless ? 'thread-expand-label-genderless' : 'thread-expand-label',
        this.commentCount,
        usersInThread.length,
        userList,
        getCommonGender(usersInThread)
      ));
      button.element.classList.remove('cd-thread-button-invisible');
    };
    if (cd.g.GENDER_AFFECTS_USER_STRING) {
      (loadUserGendersPromise || loadUserGenders(usersInThread)).then(setLabel, () => {
        // Couldn't get the gender, use the genderless version.
        setLabel(true);
      });
    } else {
      setLabel();
    }

    const firstElement = this.collapsedRange[0];
    const tagName = ['LI', 'DD'].includes(firstElement.tagName) ? firstElement.tagName : 'DIV';
    const expandNote = document.createElement(tagName);
    expandNote.className = 'cd-thread-button-container cd-thread-expandNote';
    if (firstElement.classList.contains('cd-connectorToPreviousItem')) {
      expandNote.className += ' cd-connectorToPreviousItem';
    }
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

    /**
     * Note in place of a collapsed thread that has a button to expand the thread.
     *
     * @type {Element|undefined}
     * @private
     */
    this.expandNote = expandNote;

    /**
     * Note in place of a collapsed thread that has a button to expand the thread.
     *
     * @type {external:jQuery|undefined}
     */
    this.$expandNote = $(this.expandNote);
  }

  /**
   * Collapse the thread.
   *
   * @param {Promise.<undefined>} [loadUserGendersPromise]
   */
  collapse(loadUserGendersPromise) {
    /**
     * Nodes that are collapsed. These can change, at least due to comment forms showing up.
     *
     * @type {Node[]|undefined}
     * @private
     */
    this.collapsedRange = controller.getRangeContents(
      this.startElement,
      this.getAdjustedEndElement()
    );

    this.collapsedRange.forEach((el) => {
      // We use a class here because there can be elements in the comment that are hidden from the
      // beginning and should stay so when reshowing the comment.
      el.classList.add('cd-hidden');

      // An element can be in more than one collapsed range. So, we need to show it when expanding
      // a range only if no active collapsed ranges are left.
      const $el = $(el);
      const roots = $el.data('cd-collapsed-thread-root-comments') || [];
      roots.push(this.rootComment);
      $el.data('cd-collapsed-thread-root-comments', roots);
    });

    this.isCollapsed = true;

    for (let i = this.rootComment.index; i <= this.lastComment.index; i++) {
      const comment = cd.comments[i];
      if (comment.thread?.isCollapsed && comment.thread !== this) {
        i = comment.thread.lastComment.index;
        continue;
      }
      comment.isCollapsed = true;
      comment.collapsedThread = this;
      comment.removeLayers();
    }

    this.addExpandNode(loadUserGendersPromise);

    if (isInited) {
      this.$expandNote.cdScrollIntoView();
    }

    if (this.rootComment.isOpeningSection) {
      this.rootComment.section.actions.moreMenuSelect
        ?.getMenu()
        .findItemFromData('editOpeningComment')
        ?.setDisabled(true);
    }

    if (this.endElement !== this.visualEndElement) {
      for (let c = this.rootComment; c; c = c.getParent(true)) {
        const thread = c.thread;
        if (thread && thread.endElement !== thread.visualEndElement) {
          thread.line.classList.remove('cd-thread-line-extended');
        }
      }
    }

    saveCollapsedThreads();
    controller.handleScroll();
    Thread.updateLines();
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
      this.rootComment.section.actions.moreMenuSelect
        ?.getMenu()
        .findItemFromData('editOpeningComment')
        ?.setDisabled(false);
    }

    this.isCollapsed = false;
    let areOutdentedCommentsShown = false;
    for (let i = this.rootComment.index; i <= this.lastComment.index; i++) {
      const comment = cd.comments[i];
      if (comment.isOutdented) {
        areOutdentedCommentsShown = true;
      }
      if (comment.thread?.isCollapsed) {
        i = comment.thread.lastComment.index;
        continue;
      }
      comment.isCollapsed = false;
      comment.collapsedThread = null;
      comment.configureLayers();
    }

    if (this.endElement !== this.visualEndElement && areOutdentedCommentsShown) {
      for (let c = this.rootComment; c; c = c.getParent()) {
        const thread = c.thread;
        if (thread && thread.endElement !== thread.visualEndElement) {
          thread.line.classList.add('cd-thread-line-extended');
        }
      }
    }

    saveCollapsedThreads();
    controller.handleScroll();
    Thread.updateLines();
  }

  /**
   * Expand the thread if it's collapsed and collapse if it's expanded.
   *
   * @private
   */
  toggle() {
    this[this.isCollapsed ? 'expand' : 'collapse']();
  }

  /**
   * Calculate the offset of the thread line.
   *
   * @param {object} options
   * @returns {boolean}
   * @private
   */
  updateLine({
    elementsToAdd,
    threadsToUpdate,
    scrollX,
    scrollY,
    floatingRects,
  }) {
    const getLeft = (rectOrOffset, commentMargins, dir) => {
      let offset;
      if (dir === 'ltr') {
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

    const lineWidth = 3;
    const lineSideMargin = cd.g.THREAD_LINE_SIDE_MARGIN;
    const comment = this.rootComment;

    if (comment.isCollapsed && !this.isCollapsed) {
      this.removeLine();
      return false;
    }

    const needCalculateMargins = (
      comment.level === 0 ||
      comment.containerListType === 'ol' ||

      // Occurs when a part of a comment that is not in the thread is next to the start
      // element, for example
      // https://ru.wikipedia.org/wiki/Project:Запросы_к_администраторам/Архив/2021/04#202104081533_Macuser.
      this.startElement.tagName === 'DIV'
    );

    const rectTop = needCalculateMargins && !this.isCollapsed ?
      undefined :
      this[this.isCollapsed ? 'expandNote' : 'startElement'].getBoundingClientRect();

    floatingRects ||= controller.getFloatingElements().map(getExtendedRect);
    const rectOrOffset = rectTop || comment.getOffset({ floatingRects });

    // Should be below `comment.getOffset()` as `Comment#isStartStretched` is set inside that call.
    const commentMargins = needCalculateMargins ? comment.getMargins() : undefined;

    let top;
    let left;
    const dir = comment.getTextDirection();
    if (rectOrOffset) {
      top = getTop(rectOrOffset);
      left = getLeft(rectOrOffset, commentMargins, dir);
    }

    const rectBottom = this.isCollapsed ?
      rectTop :
      this.getAdjustedEndElement(true)?.getBoundingClientRect();

    const areTopAndBottomAligned = () => {
      // FIXME: We use the first comment part's margins for the bottom rectangle which can lead to
      // errors (need to check).
      const bottomLeft = getLeft(rectBottom, commentMargins, dir);

      return dir === 'ltr' ? bottomLeft >= left : bottomLeft <= left;
    };
    if (
      top === undefined ||
      !rectBottom ||
      !getVisibilityByRects(...[rectTop, rectBottom].filter(defined)) ||
      !areTopAndBottomAligned()
    ) {
      this.removeLine();
      return false;
    }

    const height = rectBottom.bottom - (top - scrollY);

    // Find the top comment that has its offset changed and stop at it.
    if (
      this.clickAreaOffset &&
      top === this.clickAreaOffset.top &&
      left === this.clickAreaOffset.left &&
      height === this.clickAreaOffset.height
    ) {
      // Opened/closed "Reply in section" comment form will change a 0-level thread line height,
      // so we may go a long way until we finally arrive at a 0-level comment (or a comment
      // without a parent).
      return !comment.getParent();
    }

    this.clickAreaOffset = { top, left, height };

    if (!this.line) {
      this.createLine();
    }

    threadsToUpdate.push(this);
    if (!this.clickArea.parentNode) {
      elementsToAdd.push(this.clickArea);
    }
  }

  /**
   * Set the click area offset based on the `clickAreaOffset` property.
   */
  setClickAreaOffset() {
    this.clickArea.style.left = this.clickAreaOffset.left + 'px';
    this.clickArea.style.top = this.clickAreaOffset.top + 'px';
    this.clickArea.style.height = this.clickAreaOffset.height + 'px';
  }

  /**
   * Remove the thread line if present and set the relevant properties to `null`.
   *
   * @private
   */
  removeLine() {
    if (!this.line) return;

    this.clickArea.remove();
    this.clickArea = this.clickAreaOffset = this.line = null;
  }

  /**
   * Create threads.
   *
   * @param {boolean} [autocollapse=true] Autocollapse threads according to the settings and restore
   *   collapsed threads from the local storage.
   */
  static init(autocollapse = true) {
    if (!settings.get('enableThreads')) return;

    isInited = false;
    treeWalker = new ElementsTreeWalker(undefined, controller.rootElement);
    cd.comments.forEach((rootComment) => {
      try {
        rootComment.thread = new Thread(rootComment);
      } catch {
        // Empty
      }
    });

    if (!threadLinesContainer) {
      threadLinesContainer = document.createElement('div');
      threadLinesContainer.className = 'cd-threadLinesContainer';
    } else {
      threadLinesContainer.innerHTML = '';
    }

    // We might not update lines on initialization as it is a relatively costly operation that can
    // be delayed, but not sure it makes any difference at which point the page is blocked for
    // interactions.
    Thread.updateLines();

    if (!threadLinesContainer.parentNode) {
      document.body.appendChild(threadLinesContainer);
    }
    if (autocollapse) {
      autocollapseThreads();
    }
    isInited = true;
  }

  /**
   * _For internal use._ Calculate the offset and (if needed) add the thread lines to the container.
   *
   * @param {object} [floatingRects]
   */
  static updateLines(floatingRects) {
    if (
      !settings.get('enableThreads') ||
      ((controller.isBooting() || document.hidden) && isInited)
    ) {
      return;
    }

    const elementsToAdd = [];
    const threadsToUpdate = [];
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    cd.comments
      .slice()
      .reverse()
      .some((comment) => (
        comment.thread?.updateLine({
          elementsToAdd,
          threadsToUpdate,
          scrollX,
          scrollY,
          floatingRects,
        }) ||
        false
      ));

    // Faster to update/add all elements in one batch.
    threadsToUpdate.forEach((thread) => {
      thread.setClickAreaOffset();
    });

    if (elementsToAdd.length) {
      threadLinesContainer.append(...elementsToAdd);
    }
  }
}

export default Thread;
