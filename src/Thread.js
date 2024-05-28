import Button from './Button';
import CdError from './CdError';
import ElementsTreeWalker from './ElementsTreeWalker';
import PrototypeRegistry from './PrototypeRegistry';
import StorageItem from './StorageItem';
import cd from './cd';
import commentRegistry from './commentRegistry';
import controller from './controller';
import settings from './settings';
import updateChecker from './updateChecker';
import { loadUserGenders } from './utils-api';
import { defined, flat, getCommonGender, isHeadingNode, removeFromArrayIfPresent, unique } from './utils-general';
import { getExtendedRect, getRangeContents, getVisibilityByRects, isCmdModifierPressed } from './utils-window';

/**
 * Class representing a comment thread object.
 */
class Thread {
  /**
   * Create a comment thread object.
   *
   * @param {import('./Comment').default} rootComment Root comment of the thread.
   */
  constructor(rootComment) {
    this.documentMouseMoveHandler = this.handleDocumentMouseMove.bind(this);

    /**
     * Root comment of the thread.
     *
     * @type {import('./Comment').default}
     * @private
     */
    this.rootComment = rootComment;

    /**
     * List of comments in the thread (logically, not visually).
     *
     * @type {import('./Comment').default}
     * @private
     */
    this.comments = [rootComment, ...rootComment.getChildren(true)];

    /**
     * Last comment of the thread (logically, not visually).
     *
     * @type {import('./Comment').default}
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
     * @type {import('./Comment').default}
     * @private
     */
    this.visualLastComment = this.hasOutdents ?
      rootComment.getChildren(true, true).slice(-1)[0] || rootComment :
      this.lastComment;

    /**
     * Fallback visual last comment. Used when `Thread#visualEndElement` may be hidden without
     * collapsing the thread. That usually means `Thread#visualEndElement` has the
     * `cd-connectToPreviousItem` class.
     *
     * @type {import('./Comment').default}
     * @private
     */
    this.visualLastCommentFallback = this.hasOutdents ?
      // `|| rootComment` part for a very weird case when an outdented comment is at the same level
      // as its parent.
      rootComment.getChildren(true, true, false).slice(-1)[0] || rootComment :

      this.lastComment;

    this.initBoundingElements();

    /**
     * Is the thread collapsed.
     *
     * @type {boolean}
     */
    this.isCollapsed = false;

    this.navMode = false;
  }

  /**
   * Set the `startElement`, `endElement`, `visualEndElement`, and `visualEndElementFallback`
   * properties.
   *
   * @throws {CdError}
   * @private
   */
  initBoundingElements() {
    let startElement;
    let endElement;
    let visualEndElement;
    let visualEndElementFallback;
    const firstNotHeadingElement = this.rootComment.elements.find((el) => !isHeadingNode(el));
    const highlightables = this.lastComment.highlightables;
    const visualHighlightables = this.visualLastComment.highlightables;
    const visualHighlightablesFallback = this.visualLastCommentFallback.highlightables;
    const nextForeignElement = commentRegistry.getByIndex(this.lastComment.index + 1)?.elements[0];

    if (this.rootComment.level === 0) {
      startElement = firstNotHeadingElement;
      visualEndElement = this.constructor.findEndElement(
        startElement,
        visualHighlightables,
        nextForeignElement
      );
      visualEndElementFallback = this.visualLastComment === this.visualLastCommentFallback ?
        visualEndElement :
        this.constructor.findEndElement(
          startElement,
          visualHighlightablesFallback,
          nextForeignElement
        );
      endElement = this.hasOutdents ?
        this.constructor.findEndElement(
          startElement,
          highlightables,
          nextForeignElement
        ) :
        visualEndElement;
    } else {
      // We could improve the positioning of the thread line to exclude the vertical space next to
      // an outdent template placed at a non-0 level by taking the first element as the start
      // element. But then we need to fix areTopAndBottomAligned() (calculate the last comment's
      // margins instead of using the first comment's) and utilsWindow.getRangeContents() (come up
      // with a treatment for the situation when the end element includes the start element).
      startElement = (
        this.constructor.findItemElement(
          firstNotHeadingElement,
          this.rootComment.level,
          nextForeignElement
        ) ||
        firstNotHeadingElement
      );
      const lastHighlightable = highlightables[highlightables.length - 1];

      if (this.hasOutdents) {
        const lastOutdentedComment = commentRegistry.getAll()
          .slice(0, this.lastComment.index + 1)
          .reverse()
          .find((comment) => comment.isOutdented);
        endElement = lastOutdentedComment.level === 0 ?
          this.constructor.findEndElement(
            startElement,
            highlightables,
            nextForeignElement
          ) :
          this.constructor.findItemElement(
            lastHighlightable,
            Math.min(lastOutdentedComment.level, this.rootComment.level),
            nextForeignElement
          );

        visualEndElement = this.constructor.findItemElement(
          visualHighlightables[visualHighlightables.length - 1],
          this.rootComment.level,
          nextForeignElement
        );
        visualEndElementFallback = this.visualLastComment === this.visualLastCommentFallback ?
          visualEndElement :
          this.constructor.findItemElement(
            visualHighlightablesFallback[visualHighlightablesFallback.length - 1],
            this.rootComment.level,
            nextForeignElement
          );
      } else {
        endElement = (
          this.constructor.findItemElement(
            lastHighlightable,
            this.rootComment.level,
            nextForeignElement
          ) ||
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
     * `cd-connectToPreviousItem` class.
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
   * Handle the `mousedown` event on the click area.
   *
   * @param {Event} e
   * @private
   */
  handleClickAreaMouseDown(e) {
    if (!this.clickArea.classList.contains('cd-thread-clickArea-hovered')) return;

    // Middle button
    if (!this.rootComment.isCollapsed && e.button === 1) {
      e.preventDefault();
      this.navMode = true;
      this.navFromY = e.clientY;

      // Prevent hitting document's mousedown.cd listener added below.
      e.stopPropagation();

      $(document)
        .on('mousemove.cd', this.documentMouseMoveHandler)
        .on('mouseup.cd mousedown.cd', this.quitNavMode.bind(this));
      $(document.body).addClass('cd-threadNavMode');
    }
  }

  /**
   * Handle the `mousemove` event when the navigation mode is active.
   *
   * @param {Event} e
   * @private
   */
  handleDocumentMouseMove(e) {
    if (e.clientY - this.navFromY < -15 && this.navScrolledTo !== 'root') {
      this.rootComment.scrollTo({ alignment: 'top' });
      this.navScrolledTo = 'root';
    } else if (e.clientY - this.navFromY > 15 && this.navScrolledTo !== 'last') {
      this.lastComment.scrollTo({ alignment: 'bottom' });
      this.navScrolledTo = 'last';
    }
  }

  /**
   * Quit navigation mode and remove its traces.
   *
   * @private
   */
  quitNavMode() {
    this.navMode = false;
    delete this.navFromY;
    delete this.navScrolledTo;
    $(document).off('mousemove.cd', this.documentMouseMoveHandler);
    $(document.body).removeClass('cd-threadNavMode');
  }

  /**
   * Handle the `click` event on the click area.
   *
   * @private
   */
  handleClickAreaClick() {
    if (!this.clickArea.classList.contains('cd-thread-clickArea-hovered')) return;

    this.quitNavMode();
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
    this.clickArea = this.constructor.prototypes.get('clickArea');

    this.clickArea.title = cd.s('thread-tooltip');

    // Add some debouncing so that the user is not annoyed by the cursor changing its form when
    // moving across thread lines.
    this.clickArea.onmouseenter = this.handleClickAreaHover.bind(this);
    this.clickArea.onmouseleave = this.handleClickAreaUnhover.bind(this);

    this.clickArea.onclick = this.handleClickAreaClick.bind(this);
    this.clickArea.onmousedown = this.handleClickAreaMouseDown.bind(this);

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
        const comment = commentRegistry.getByIndex(i);
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
   * Get the end element of the thread, revising it based on
   * {@link Comment#subitemList comment subitems}.
   *
   * @param {boolean} visual Use the visual thread end.
   * @returns {?Element} Logically, should never return `null`, unless something extraordinary
   *   happens that makes the return value of `Thread.findItemElement()` `null`.
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
      are handled by a different mechanism, see `Thread.findEndElement()`.)
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

        if (!getVisibilityByRects(endElement.getBoundingClientRect()) && this.rootComment.editForm) {
          endElement = this.rootComment.editForm.getOutermostElement();
        }
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
      this.constructor.findItemElement($lastSubitem[0], this.rootComment.level) :
      endElement;
  }

  /**
   * Get the top element of the thread or its replacement.
   *
   * @returns {Element}
   * @private
   */
  getAdjustedStartElement() {
    if (this.isCollapsed) {
      return this.expandNote;
    }

    if (this.startElement.classList.contains('cd-hidden') && this.rootComment.editForm) {
      return this.rootComment.editForm.getOutermostElement();
    }

    return this.startElement;
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
    const element = this.constructor.prototypes.get('expandButton');
    const button = new Button({
      tooltip: cd.s('thread-expand-tooltip', cd.g.cmdModifier),
      action: this.onExpandNoteClick.bind(this),
      element: element,
      buttonElement: element.firstChild,
      labelElement: element.querySelector('.oo-ui-labelElement-label'),
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
    if (cd.g.genderAffectsUserString) {
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
    if (firstElement.classList.contains('cd-connectToPreviousItem')) {
      expandNote.className += ' cd-connectToPreviousItem';
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
    this.$expandNote = $(expandNote);
  }

  /**
   * Handle clicking the expand note.
   *
   * @param {Event} e
   * @private
   */
  onExpandNoteClick(e) {
    if (isCmdModifierPressed(e)) {
      commentRegistry.getAll().slice().reverse().forEach((comment) => {
        if (comment.thread?.isCollapsed) {
          comment.thread.expand();
        }
      });
      this.comments[0].scrollTo();
    } else {
      this.expand();
    }
  }

  /**
   * Collapse the thread.
   *
   * @param {Promise.<undefined>} [loadUserGendersPromise]
   * @param {boolean} [auto=false] Automatic collapse - don't scroll anywhere and don't save
   *   collapsed threads.
   */
  collapse(loadUserGendersPromise, auto = false) {
    if (this.isCollapsed) return;

    /**
     * Nodes that are collapsed. These can change, at least due to comment forms showing up.
     *
     * @type {Node[]|undefined}
     * @private
     */
    this.collapsedRange = getRangeContents(
      this.getAdjustedStartElement(),
      this.getAdjustedEndElement(),
      controller.rootElement
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
      i = commentRegistry.getByIndex(i).collapse(this) ?? i;
    }

    this.addExpandNode(loadUserGendersPromise);

    if (!auto) {
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
          thread.line?.classList.remove('cd-thread-line-extended');
        }
      }
    }

    if (!auto) {
      this.constructor.saveCollapsedThreads();
    }
    this.constructor.updateLines();
    controller.handleScroll();
  }

  /**
   * Expand the thread.
   *
   * @param {boolean} [auto=false]
   */
  expand(auto = false) {
    if (!this.isCollapsed) return;

    this.collapsedRange.forEach((el) => {
      const $el = $(el);
      const roots = $el.data('cd-collapsed-thread-root-comments') || [];
      removeFromArrayIfPresent(roots, this.rootComment);
      $el.data('cd-collapsed-thread-root-comments', roots);
      if (!roots.length && !$el.data('cd-comment-form')) {
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
      const comment = commentRegistry.getByIndex(i);
      i = comment.expand() ?? i;
      if (comment.isOutdented) {
        areOutdentedCommentsShown = true;
      }
    }

    if (this.endElement !== this.visualEndElement && areOutdentedCommentsShown) {
      for (let c = this.rootComment; c; c = c.getParent()) {
        const thread = c.thread;
        if (thread && thread.endElement !== thread.visualEndElement) {
          thread.line?.classList.add('cd-thread-line-extended');
        }
      }
    }

    if (!auto) {
      this.constructor.saveCollapsedThreads();
    }
    this.constructor.updateLines();
    controller.handleScroll();
  }

  /**
   * Expand the thread if it's collapsed and collapse if it's expanded.
   *
   * @private
   */
  toggle() {
    if (this.isCollapsed) {
      this.expand();
    } else {
      this.collapse();
    }
  }

  /**
   * Calculate the offset of the thread line.
   *
   * @param {object} options
   * @param {Element[]} options.elementsToAdd
   * @param {Thread[]} options.threadsToUpdate
   * @param {number} options.scrollX
   * @param {number} options.scrollY
   * @param {object[]} options.floatingRects
   * @returns {boolean}
   * @private
   */
  updateLine({ elementsToAdd, threadsToUpdate, scrollX, scrollY, floatingRects }) {
    const getLeft = (rectOrOffset, commentMargins, dir) => {
      let offset;

      // Don't round - we need a subpixel-precise value
      const centerOffset = ((cd.g.commentMarkerWidth - 1) / 2) / cd.g.pixelDeviationRatio;

      if (dir === 'ltr') {
        offset = rectOrOffset.left - centerOffset;
        if (commentMargins) {
          offset -= commentMargins.left + 1;
        }
      } else {
        offset = (
          rectOrOffset.right -
          (cd.g.commentMarkerWidth / cd.g.pixelDeviationRatio) +
          centerOffset
        );
        if (commentMargins) {
          offset += commentMargins.right + 1;
        }
      }
      if (rectOrOffset instanceof DOMRect) {
        offset += scrollX;
      }
      return offset - cd.g.threadLineSidePadding;
    };
    const getTop = (rectOrOffset) => (
      rectOrOffset instanceof DOMRect ?
        scrollY + rectOrOffset.top :
        rectOrOffset.top
    );

    const comment = this.rootComment;

    if (comment.isCollapsed && !this.isCollapsed) {
      this.removeLine();
      return false;
    }

    const needCalculateMargins = (
      comment.level === 0 ||
      comment.containerListType === 'ol' ||

      // Occurs when part of a comment that is not in the thread is next to the start element, for
      // example
      // https://ru.wikipedia.org/wiki/Project:Запросы_к_администраторам/Архив/2021/04#202104081533_Macuser
      // - the next comment is not in the thread.
      this.startElement.tagName === 'DIV'
    );

    const rectTop = this.isCollapsed || !needCalculateMargins ?
      this.getAdjustedStartElement().getBoundingClientRect() :
      undefined;

    const rectOrOffset = rectTop || comment.getOffset({ floatingRects });

    // Should be below comment.getOffset() as Comment#isStartStretched is set inside that call.
    const commentMargins = needCalculateMargins ? comment.getMargins() : undefined;

    let top;
    let left;
    const dir = comment.getDirection();
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

    return false;
  }

  /**
   * Set the click area offset based on the `clickAreaOffset` property.
   *
   * @private
   */
  updateClickAreaOffset() {
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

  static isInited = false;

  /**
   * _For internal use._ Create element prototypes to reuse them instead of creating new elements
   * from scratch (which is more expensive).
   */
  static initPrototypes() {
    this.prototypes = new PrototypeRegistry();

    this.prototypes.add(
      'expandButton',
      (new OO.ui.ButtonWidget({
        // Isn't displayed
        label: 'Expand the thread',
        icon: 'expand',

        framed: false,
        classes: [
          'cd-button-ooui',
          'cd-button-expandNote',
          'cd-thread-button',
          'cd-thread-button-invisible',
        ],
      })).$element[0]
    );

    const threadClickArea = document.createElement('div');
    threadClickArea.className = 'cd-thread-clickArea';
    const line = document.createElement('div');
    line.className = 'cd-thread-line';
    threadClickArea.appendChild(line);
    this.prototypes.add('clickArea', threadClickArea);
  }

  /**
   * Create threads. Can be re-run if DOM elements are replaced.
   *
   * @param {boolean} [autocollapse=true] Autocollapse threads according to the settings and restore
   *   collapsed threads from the local storage.
   */
  static init(autocollapse = true) {
    this.enabled = settings.get('enableThreads');
    if (!this.enabled) {
      (new StorageItem('collapsedThreads')).removeItem();
      return;
    }

    this.updateLinesHandler = this.updateLines.bind(this);

    if (!this.isInited) {
      controller
        .on('resize', this.updateLinesHandler)
        .on('mutate', () => {
          // Update only on mouse move to prevent short freezings of a page when there is a comment
          // form in the beginning of a very long page and the input is changed so that everything
          // below the form shifts vertically.
          $(document)
            .off('mousemove.cd', this.updateLinesHandler)
            .one('mousemove.cd', this.updateLinesHandler);
        });
      $(document).on('visibilitychange', this.updateLinesHandler);
      updateChecker
        // Start and end elements of threads may be replaced, so we need to restart threads.
        .on('newChanges', this.init.bind(this, false));
    }

    this.collapseThreadsLevel = settings.get('collapseThreadsLevel');
    this.treeWalker = new ElementsTreeWalker(undefined, controller.rootElement);
    commentRegistry.getAll().forEach((rootComment) => {
      try {
        rootComment.thread?.expand(true);
        rootComment.thread = new Thread(rootComment);
      } catch {
        // Empty
      }
    });

    if (!this.threadLinesContainer) {
      this.threadLinesContainer = document.createElement('div');
      this.threadLinesContainer.className = 'cd-threadLinesContainer';
    } else {
      this.threadLinesContainer.innerHTML = '';
    }

    // We could choose not to update lines on initialization as it is a relatively costly operation
    // that can be delayed, but not sure it makes any difference at which point the page is blocked
    // for interactions.
    this.updateLines();

    if (!this.threadLinesContainer.parentNode) {
      document.body.appendChild(this.threadLinesContainer);
    }
    if (autocollapse) {
      this.autocollapseThreads();
    }
    this.isInited = true;
  }

  /**
   * Autocollapse threads starting from some level according to the setting value and restore
   * collapsed threads from the local storage.
   *
   * @private
   */
  static autocollapseThreads() {
    const collapsedThreadsStorageItem = (new StorageItem('collapsedThreads'))
      .cleanUp((entry) => (
        !(entry.collapsedThreads || entry.threads)?.length ||
        // FIXME: Remove `([keep] || entry.saveUnixTime)` after June 2024
        (entry.saveTime || entry.saveUnixTime) < Date.now() - 60 * cd.g.msInDay
      ));
    const data = collapsedThreadsStorageItem.get(mw.config.get('wgArticleId')) || {};

    const comments = [];

    // FIXME: Leave only data.collapsedThreads after June 2024
    (data.collapsedThreads || data.threads)?.forEach((thread) => {
      const comment = commentRegistry.getById(thread.id);
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
        // Remove IDs that have no corresponding comments or threads from the data. FIXME: Leave
        // only data.collapsedThreads after June 2024
        removeFromArrayIfPresent(data.collapsedThreads || data.threads, thread);
      }
    });

    if (this.collapseThreadsLevel !== 0) {
      // Don't precisely target comments of level this.collapseThreadsLevel in case there is a gap,
      // for example between the `(this.collapseThreadsLevel - 1)` level and the
      // `(this.collapseThreadsLevel + 1)` level (the user muse have replied to a comment at the
      // `(this.collapseThreadsLevel - 1)` level but inserted `::` instead of `:`).
      for (let i = 0; i < commentRegistry.getCount(); i++) {
        const comment = commentRegistry.getByIndex(i);
        if (!comment.thread) continue;

        if (comment.level >= this.collapseThreadsLevel) {
          // Exclude threads where the user participates at any level up and down the tree or that
          // the user has specifically expanded.
          if (![...comment.getAncestors(), ...comment.thread.comments].some((c) => c.isOwn)) {
            /**
             * Should the thread be automatically collapsed on page load if taking only comment
             * level into account and not remembering the user's previous actions.
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

    const loadUserGendersPromise = cd.g.genderAffectsUserString ?
      loadUserGenders(flat(comments.map((comment) => comment.thread.getUsersInThread()))) :
      undefined;

    // The reverse order is used for threads to be expanded correctly.
    comments
      .sort((c1, c2) => c1.index - c2.index)
      .forEach((comment) => {
        comment.thread.collapse(loadUserGendersPromise, true);
      });

    if (controller.isCurrentRevision()) {
      collapsedThreadsStorageItem
        .setWithTime(mw.config.get('wgArticleId'), data.collapsedThreads)
        .save();
    }
  }

  /**
   * Find the closest item element (`<li>`, `<dd>`) for an element.
   *
   * @param {Element} element
   * @param {number} level
   * @param {Element} nextForeignElement
   * @returns {?Element}
   * @private
   */
  static findItemElement(element, level, nextForeignElement) {
    this.treeWalker.currentNode = element;

    let item;
    let previousNode = element;
    do {
      if (this.treeWalker.currentNode.classList.contains('cd-commentLevel')) {
        const className = this.treeWalker.currentNode.getAttribute('class');
        const match = className.match(/cd-commentLevel-(\d+)/);
        if (match && Number(match[1]) === (level || 1)) {
          // If the level is 0 (outdented comment or subitem of a 0-level comment), we need the list
          // element, not the item element.
          item = level === 0 ? this.treeWalker.currentNode : previousNode;

          // The element can contain parts of a comment that is not in the thread, for example
          // https://ru.wikipedia.org/wiki/Википедия:К_оценке_источников#202104120830_RosssW_2.
          if (nextForeignElement && item.contains(nextForeignElement)) {
            return null;
          }

          break;
        }
      }
      previousNode = this.treeWalker.currentNode;
    } while (this.treeWalker.parentNode());

    return item || null;
  }

  /**
   * Find the thread's end element for a comment at the 0th level.
   *
   * @param {Element} startElement
   * @param {Element[]} highlightables
   * @param {Element} nextForeignElement
   * @returns {Element}
   * @private
   */
  static findEndElement(startElement, highlightables, nextForeignElement) {
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
   * _For internal use._ Calculate the offset and (if needed) add the thread lines to the container.
   */
  static updateLines() {
    if (!this.enabled || document.hidden) return;

    const elementsToAdd = [];
    const threadsToUpdate = [];
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    const floatingRects = controller.getFloatingElements().map(getExtendedRect);
    commentRegistry.getAll()
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
      thread.updateClickAreaOffset();
    });

    if (elementsToAdd.length) {
      this.threadLinesContainer.append(...elementsToAdd);
    }
  }

  /**
   * Save collapsed threads to the local storage.
   *
   * @private
   */
  static saveCollapsedThreads() {
    if (!controller.isCurrentRevision()) return;

    (new StorageItem('collapsedThreads'))
      .setWithTime(
        mw.config.get('wgArticleId'),
        commentRegistry
          .query((comment) => (
            comment.thread &&
            comment.thread.isCollapsed !== Boolean(comment.thread.isAutocollapseTarget)
          ))
          .map((comment) => ({
            id: comment.id,
            collapsed: comment.thread.isCollapsed,
          }))
      )
      .save();
  }
}

export default Thread;
