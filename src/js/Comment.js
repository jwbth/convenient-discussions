/**
 * Comment class.
 *
 * @module Comment
 */

import CdError from './CdError';
import CommentForm from './CommentForm';
import CommentSkeleton from './CommentSkeleton';
import CommentStatic from './CommentStatic';
import CommentSubitemList from './CommentSubitemList';
import cd from './cd';
import commentLayers from './commentLayers';
import userRegistry from './userRegistry';
import { ElementTreeWalker, TreeWalker } from './treeWalker';
import {
  addToArrayIfAbsent,
  areObjectsEqual,
  calculateWordOverlap,
  caseInsensitiveFirstCharPattern,
  dealWithLoadingBug,
  defined,
  getExtendedRect,
  getFromLocalStorage,
  getObjectUrl,
  getVisibilityByRects,
  handleApiReject,
  isInline,
  saveToLocalStorage,
  unhideText,
} from './util';
import { copyLink } from './modal.js';
import {
  decodeHtmlEntities,
  extractSignatures,
  hideDistractingCode,
  hideSensitiveCode,
  hideTemplatesRecursively,
  normalizeCode,
  removeWikiMarkup,
} from './wikitext';
import { getUserGenders, parseCode } from './apiWrappers';
import { reloadPage } from './boot';

let thanks;

/**
 * Remove thanks older than 60 days.
 *
 * @param {object[]} data
 * @returns {object}
 * @private
 */
function cleanUpThanks(data) {
  const newData = Object.assign({}, data);
  Object.keys(newData).forEach((key) => {
    if (
      !newData[key].thankUnixTime ||
      newData[key].thankUnixTime < Date.now() - 60 * cd.g.SECONDS_IN_DAY * 1000
    ) {
      delete newData[key];
    }
  });
  return newData;
}

/**
 * Get bounding client rectangle for a comment part.
 *
 * @param {Element} el
 * @returns {object}
 * @private
 */
function getCommentPartRect(el) {
  let rect;
  // In most skins, <ul> and <ol> tags have markers in the margin, not padding, area, unlike in
  // native browser styles, so we include margins in the coordinates for them.
  if (['UL', 'OL'].includes(el.tagName)) {
    rect = getExtendedRect(el);
    rect.left = rect.outerLeft;
    rect.right = rect.outerRight;
  } else {
    rect = el.getBoundingClientRect();
  }
  return rect;
}

/**
 * Class representing a comment (any signed, and in some cases unsigned, text on a wiki talk page).
 *
 * @augments module:CommentSkeleton
 */
export default class Comment extends CommentSkeleton {
  /**
   * Create a comment object.
   *
   * @param {Parser} parser A relevant instance of {@link module:Parser Parser}.
   * @param {object} signature Signature object returned by {@link
   *   module:Parser#findSignatures}.
   */
  constructor(parser, signature) {
    super(parser, signature);

    this.elementPrototypes = cd.g.COMMENT_ELEMENT_PROTOTYPES;

    /**
     * Comment author {@link module:userRegistry~User user object}.
     *
     * @type {User}
     */
    this.author = userRegistry.getUser(this.authorName);

    /**
     * Comment signature element as a jQuery object.
     *
     * @type {JQuery}
     */
    this.$signature = $(signature.element);

    delete this.signatureElement;

    /**
     * Comment timestamp element as a jQuery object.
     *
     * @type {JQuery}
     */
    this.$timestamp = $(signature.timestampElement);

    /**
     * Is the comment actionable, i.e. you can reply to or edit it. A comment is actionable if it is
     * not in a closed discussion or an old diff page. (Previously the presence of an author was
     * also checked, but currently all comments should have an author.)
     *
     * @type {boolean}
     */
    this.isActionable = (
      cd.g.isPageActive &&
      !cd.g.closedDiscussionElements.some((el) => el.contains(this.elements[0]))
    );

    this.highlightables.forEach(this.bindEvents.bind(this));

    cd.debug.startTimer('anchorHighlightable');
    if (this.highlightables.length > 1) {
      const nestingLevels = [];
      const closestListTypes = [];
      const firstAndLastHighlightable = [
        this.highlightables[0],
        this.highlightables[this.highlightables.length - 1],
      ];
      firstAndLastHighlightable.forEach((highlightable, i) => {
        const treeWalker = new ElementTreeWalker(highlightable);
        nestingLevels[i] = 0;
        while (treeWalker.parentNode()) {
          nestingLevels[i]++;
          if (!closestListTypes[i] && ['DL', 'UL', 'OL'].includes(treeWalker.currentNode.tagName)) {
            closestListTypes[i] = treeWalker.currentNode.tagName.toLowerCase();
          }
        }
      });
      const minNestingLevel = Math.min(...nestingLevels);
      let anchorHighlightableIndex;
      for (let i = 0; i < 2; i++) {
        if (
          (nestingLevels[i] === minNestingLevel && anchorHighlightableIndex === undefined) ||
          (closestListTypes[anchorHighlightableIndex] === 'ol' && closestListTypes[i] !== 'ol')
        ) {
          anchorHighlightableIndex = i;
        }
      }
      this.anchorHighlightable = firstAndLastHighlightable[anchorHighlightableIndex];
    } else {
      this.anchorHighlightable = this.highlightables[0];
    }
    cd.debug.stopTimer('anchorHighlightable');

    const getContainerListType = (el) => {
      const treeWalker = new ElementTreeWalker(el);
      while (treeWalker.parentNode()) {
        if (treeWalker.currentNode.classList.contains('cd-commentLevel')) {
          return treeWalker.currentNode.tagName.toLowerCase();
        }
      }
    };

    cd.debug.startTimer('closest list');
    if (this.level !== 0) {
      /**
       * Name of the tag of the list that this comment is an item of. `'dl'`, `'ul'`, `'ol'`, or
       * `undefined`.
       *
       * @type {string|undefined}
       */
      this.containerListType = getContainerListType(this.highlightables[0]);

      this.ahContainerListType = getContainerListType(this.anchorHighlightable);
    }
    cd.debug.stopTimer('closest list');

    /**
     * Is the comment currently highlighted as the target comment.
     *
     * @type {boolean}
     */
    this.isTarget = false;

    /**
     * Is the comment currently hovered.
     *
     * @type {boolean}
     */
    this.isHovered = false;

    /**
     * Was the comment edited since the previous visit.
     *
     * @type {?boolean}
     */
    this.isEditedSincePreviousVisit = null;

    /**
     * Was the comment edited while the page was idle. (The new version may be rendered or may be
     * not, if the layout is too complex.)
     *
     * @type {?boolean}
     */
    this.isEdited = null;

    /**
     * Was the comment deleted while the page was idle.
     *
     * @type {?boolean}
     */
    this.isDeleted = null;

    /**
     * Should the comment be flashed as updated when it appears in sight.
     *
     * @type {?boolean}
     */
    this.willFlashNewOnSight = false;

    /**
     * Is the comment (or its signature) inside a table containing only one comment.
     *
     * @type {boolean}
     */
    this.isInSingleCommentTable = false;

    /**
     * Is the comment a part of a collapsed thread.
     *
     * @type {boolean}
     */
    this.isCollapsed = false;

    /**
     * List of the comment's {@link module:CommentSubitemList subitems}.
     *
     * @type {CommentSubitemList}
     */
    this.subitemList = new CommentSubitemList();
  }

  /**
   * Bind the standard events to a comment part. Executed on comment object creation and DOM
   * modifications affecting comment parts.
   *
   * @param {Element} element
   */
  bindEvents(element) {
    element.onmouseenter = this.highlightHovered.bind(this);
    element.onmouseleave = this.unhighlightHovered.bind(this);
    element.ontouchstart = this.highlightHovered.bind(this);
  }

  /**
   * Filter out floating and hidden elements from the comment's {@link
   * module:CommentSkeleton#highlightables}, change their attributes, and update the comment's level
   * and parent elements' level classes.
   */
  reviewHighlightables() {
    for (let i = 0; i < this.highlightables.length; i++) {
      const el = this.highlightables[i];
      if (Array.from(el.classList).some((name) => !name.startsWith('cd-'))) {
        const style = window.getComputedStyle(el);
        if (
          // Currently we can't have comments with no highlightable elements.
          this.highlightables.length > 1 &&

          (['left', 'right'].includes(style.float) || style.display === 'none')
        ) {
          if (el.classList.contains('cd-commentPart-first')) {
            el.classList.remove('cd-commentPart-first');
            this.highlightables[i + 1].classList.add('cd-commentPart-first');
          }
          if (el.classList.contains('cd-commentPart-last')) {
            el.classList.remove('cd-commentPart-last');
            this.highlightables[i - 1].classList.add('cd-commentPart-last');
          }
          delete el.dataset.commentId;
          this.highlightables.splice(i, 1);
          i--;
          this.setLevels();
        }
      }
    }
  }

  /**
   * Get the comment coordinates and set them as the `positions` comment property. If the comment is
   * invisible, positions are unset.
   *
   * Note that comment coordinates are not static, obviously, but we need to recalculate them only
   * occasionally.
   *
   * @param {object} [options={}]
   * @private
   */
  getPositions(options = {}) {
    if (options.considerFloating === undefined) {
      options.considerFloating = false;
    }

    this.positions = null;

    if (this.editForm) return;

    let rectTop = options.rectTop || getCommentPartRect(this.highlightables[0]);
    let rectBottom = (
      options.rectBottom ||
      (
        this.elements.length === 1 ?
        rectTop :
        getCommentPartRect(this.highlightables[this.highlightables.length - 1])
      )
    );

    if (!getVisibilityByRects(rectTop, rectBottom)) return;

    // Seems like caching this value significantly helps performance at least in Chrome. But need to
    // be sure the viewport can't jump higher when it is at the bottom point of the page because
    // some content becomes occupying less space.
    const scrollY = window.scrollY;

    const top = scrollY + rectTop.top;
    const bottom = scrollY + rectBottom.bottom;

    if (options.considerFloating) {
      const floatingRects = options.floatingRects || cd.g.floatingElements.map(getExtendedRect);
      let intersectsFloatingCount = 0;
      let bottomIntersectsFloating = false;
      floatingRects.forEach((rect) => {
        const floatingTop = scrollY + rect.outerTop;
        const floatingBottom = scrollY + rect.outerBottom;
        if (bottom > floatingTop && bottom < floatingBottom + cd.g.CONTENT_LINE_HEIGHT) {
          bottomIntersectsFloating = true;
        }
        if (bottom > floatingTop && top < floatingBottom + cd.g.CONTENT_LINE_HEIGHT) {
          intersectsFloatingCount++;
        }
      });

      // We calculate the left and right borders separately - in its case, we need to change the
      // `overflow` property to get the desired value, otherwise floating elements are not taken
      // into account.
      if (bottomIntersectsFloating) {
        const initialOverflows = [];
        this.elements.forEach((el, i) => {
          initialOverflows[i] = el.style.overflow;
          el.style.overflow = 'hidden';
        });

        rectTop = getCommentPartRect(this.highlightables[0]);
        rectBottom = this.elements.length === 1 ?
          rectTop :
          getCommentPartRect(this.highlightables[this.highlightables.length - 1]);

        // If the comment intersects more than one floating block, we better keep `overflow: hidden`
        // to avoid bugs like where there are two floating blocks to the right with different
        // leftmost positions and the layer is more narrow than the comment.
        if (intersectsFloatingCount === 1) {
          this.elements.forEach((el, i) => {
            el.style.overflow = initialOverflows[i];
          });
        }
      }
    }

    const left = window.scrollX + Math.min(rectTop.left, rectBottom.left);
    const right = window.scrollX + Math.max(rectTop.right, rectBottom.right);

    // A solution for comments that have the height bigger than the viewport height. In Chrome, the
    // scrolling step is 100 pixels.
    const downplayedBottom = bottom - top > (window.innerHeight - 200) ?
      top + (window.innerHeight - 200) :
      bottom;

    this.positions = { top, bottom, left, right, downplayedBottom };
  }

  getLayersMargins() {
    cd.debug.startTimer('getLayersMargins');

    let positions;
    let anchorElement;
    if (this.isCollapsed) {
      const rect = getCommentPartRect(this.thread.collapsedNote);
      positions = {
        left: window.scrollX + rect.left,
        right: window.scrollX + rect.right,
      };
      anchorElement = this.thread.collapsedNote;
    } else {
      positions = this.positions;
      anchorElement = this.anchorHighlightable;
    }

    let startMargin;
    let endMargin;

    /**
     * Is the start (left on LTR wikis, right on RTL wikis) side of the comment stretched to the
     * start of the content area.
     *
     * @type {boolean|undefined}
     */
    this.isStartStretched = false;

    /**
     * Is the end (right on LTR wikis, left on RTL wikis) side of the comment stretched to the end
     * of the content area.
     *
     * @type {boolean|undefined}
     */
    this.isEndStretched = false;

    if (this.level === 0) {
      const leftPosition = positions.left - cd.g.CONTENT_START_MARGIN;
      const rightPosition = positions.right + cd.g.CONTENT_START_MARGIN;
      this.isStartStretched = cd.g.CONTENT_DIR === 'ltr' ?
        leftPosition <= cd.g.CONTENT_COLUMN_START + 1 :
        rightPosition >= cd.g.CONTENT_COLUMN_START - 1;
      this.isEndStretched = cd.g.CONTENT_DIR === 'ltr' ?
        rightPosition >= cd.g.CONTENT_COLUMN_END - 1 :
        leftPosition <= cd.g.CONTENT_COLUMN_END + 1;
    }

    if (this.ahContainerListType === 'ol') {
      startMargin = cd.g.CONTENT_FONT_SIZE * 3.2;
    } else if (this.isStartStretched) {
      startMargin = cd.g.CONTENT_START_MARGIN;
    } else {
      if (
        ['LI', 'DD'].includes(anchorElement.tagName) &&
        anchorElement.parentNode.classList.contains('cd-commentLevel')
      ) {
        startMargin = -1;
      } else {
        startMargin = this.level === 0 ? cd.g.COMMENT_FALLBACK_SIDE_MARGIN : cd.g.CONTENT_FONT_SIZE;
      }
    }
    endMargin = this.isEndStretched ? cd.g.CONTENT_START_MARGIN : cd.g.COMMENT_FALLBACK_SIDE_MARGIN;

    const leftMargin = cd.g.CONTENT_DIR === 'ltr' ? startMargin : endMargin;
    const rightMargin = cd.g.CONTENT_DIR === 'ltr' ? endMargin : startMargin;

    cd.debug.stopTimer('getLayersMargins');

    return [leftMargin, rightMargin];
  }

  /**
   * Calculate the underlay and overlay positions and set them to the instance as properties.
   *
   * @param {object} [options={}]
   * @private
   */
  calculateLayersPositions(options = {}) {
    // Getting getBoundingClientRect() is a little costly, so we take the value that has already
    // been calculated where possible.

    this.getPositions(Object.assign({}, options, { considerFloating: true }));

    if (!this.positions) return;

    // This is to determine if the element has moved in future checks.
    this.firstHighlightableWidth = this.highlightables[0].offsetWidth;

    const [leftMargin, rightMargin] = this.getLayersMargins();

    this.layersTop = this.positions.top - options.layersContainerOffset.top;
    this.layersLeft = this.positions.left - leftMargin - options.layersContainerOffset.left;
    this.layersWidth = (this.positions.right + rightMargin) - (this.positions.left - leftMargin);
    this.layersHeight = this.positions.bottom - this.positions.top;
  }

  /**
   * Hide the comment menu (in fact, the comment overlay).
   *
   * @param {Event} [e]
   */
  hideMenu(e) {
    if (e) {
      e.preventDefault();
    }
    this.overlayInnerWrapper.style.display = 'none';
  }

  /**
   * Create the comment's underlay and overlay.
   *
   * @fires commentLayersCreated
   * @private
   */
  createLayers() {
    this.underlay = this.elementPrototypes.underlay.cloneNode(true);
    commentLayers.underlays.push(this.underlay);

    this.overlay = this.elementPrototypes.overlay.cloneNode(true);
    this.line = this.overlay.firstChild;
    this.marker = this.overlay.firstChild.nextSibling;
    this.overlayInnerWrapper = this.overlay.lastChild;

    // Hide the overlay on right click. It can block clicking the author page link.
    this.overlayInnerWrapper.oncontextmenu = this.hideMenu.bind(this);

    let mouseUpTimeout;
    const deferHideMenu = (e) => {
      // Ignore other than left button clicks.
      if (e.which !== 1) return;

      mouseUpTimeout = setTimeout(this.hideMenu.bind(this), 1500);
    };
    const dontHideMenu = () => {
      clearTimeout(mouseUpTimeout);
    };

    // Hide the overlay on long click/tap.
    this.overlayInnerWrapper.onmousedown = deferHideMenu;
    this.overlayInnerWrapper.onmouseup = dontHideMenu;

    this.overlayGradient = this.overlayInnerWrapper.firstChild;
    this.overlayContent = this.overlayInnerWrapper.lastChild;

    if (this.getParent()) {
      /**
       * "Go to the parent comment" button.
       *
       * @type {Element|undefined}
       */
      this.goToParentButton = this.elementPrototypes.goToParentButton.cloneNode(true);

      this.goToParentButton.firstChild.onclick = () => {
        this.goToParent();
      };
      this.overlayContent.appendChild(this.goToParentButton);
    }

    if (this.anchor) {
      /**
       * "Copy link" button.
       *
       * @type {Element|undefined}
       */
      this.linkButton = this.elementPrototypes.linkButton.cloneNode(true);

      this.linkButton.firstChild.onclick = this.copyLink.bind(this);
      this.overlayContent.appendChild(this.linkButton);
    }

    if (this.author.isRegistered() && this.date && !this.isOwn) {
      if (!thanks) {
        thanks = cleanUpThanks(getFromLocalStorage('thanks'));
        saveToLocalStorage('thanks', thanks);
      }

      const isThanked = Object.keys(thanks).some((key) => (
        this.anchor === thanks[key].anchor &&
        calculateWordOverlap(this.getText(), thanks[key].text) > 0.66
      ));
      if (isThanked) {
        this.thankButton = this.elementPrototypes.thankedButton.cloneNode(true);
      } else {
        /**
         * Thank button.
         *
         * @type {Element|undefined}
         */
        this.thankButton = this.elementPrototypes.thankButton.cloneNode(true);

        this.thankButton.firstChild.onclick = () => {
          this.thank();
        };
      }
      this.overlayContent.appendChild(this.thankButton);
    }

    if (this.isActionable) {
      if (this.isOwn || cd.settings.allowEditOthersComments) {
        /**
         * Edit button.
         *
         * @type {Element|undefined}
         */
        this.editButton = this.elementPrototypes.editButton.cloneNode(true);

        this.editButton.firstChild.onclick = () => {
          if (!this.editButton.classList.contains('oo-ui-widget-disabled')) {
            this.edit();
          }
        };
        this.overlayContent.appendChild(this.editButton);
      }

      /**
       * Reply button.
       *
       * @type {Element|undefined}
       */
      this.replyButton = this.elementPrototypes.replyButton.cloneNode(true);

      this.replyButton.firstChild.onclick = () => {
        if (this.replyForm) {
          this.replyForm.cancel();
        } else {
          if (!this.replyButton.classList.contains('oo-ui-widget-disabled')) {
            this.reply();
          }
        }
      };
      this.overlayContent.appendChild(this.replyButton);
    }

    this.updateLayersStyles();

    /**
     * Comment's underlay.
     *
     * @type {?(JQuery|undefined)}
     */
    this.$underlay = $(this.underlay);

    /**
     * Comment's overlay.
     *
     * @type {?(JQuery|undefined)}
     */
    this.$overlay = $(this.overlay);

    /**
     * Comment's side marker.
     *
     * @type {?(JQuery|undefined)}
     */
    this.$marker = $(this.marker);

    /**
     * Links container of the comment's overlay.
     *
     * @type {?(JQuery|undefined)}
     */
    this.$overlayContent = $(this.overlayContent);

    /**
     * Gradient element of the comment's overlay.
     *
     * @type {?(JQuery|undefined)}
     */
    this.$overlayGradient = $(this.overlayGradient);

    /**
     * Comment layers have been created.
     *
     * @event commentLayersReady
     * @type {module:cd~convenientDiscussions}
     */
    mw.hook('convenientDiscussions.commentLayersCreated').fire(this);
  }

  /**
   * Update the styles of the layers according to the comment's properties.
   */
  updateLayersStyles() {
    if (!this.underlay) return;

    if (this.isNew) {
      this.underlay.classList.add('cd-commentUnderlay-new');
      this.overlay.classList.add('cd-commentOverlay-new');
    }
    if (this.isOwn) {
      this.underlay.classList.add('cd-commentUnderlay-own');
      this.overlay.classList.add('cd-commentOverlay-own');
    }
    if (this.isDeleted) {
      this.underlay.classList.add('cd-commentUnderlay-deleted');
      this.overlay.classList.add('cd-commentOverlay-deleted');
      if (this.replyButton) {
        this.replyButton.classList.add('oo-ui-widget-disabled');
        this.replyButton.classList.remove('oo-ui-widget-enabled');
      }
      if (this.editButton) {
        this.editButton.classList.add('oo-ui-widget-disabled');
        this.editButton.classList.remove('oo-ui-widget-enabled');
      }
    } else if (this.underlay.classList.contains('cd-commentUnderlay-deleted')) {
      this.underlay.classList.remove('cd-commentUnderlay-deleted');
      this.overlay.classList.remove('cd-commentOverlay-deleted');
      if (this.replyButton) {
        this.replyButton.classList.remove('oo-ui-widget-disabled');
        this.replyButton.classList.add('oo-ui-widget-enabled');
      }
      if (this.editButton) {
        this.editButton.classList.remove('oo-ui-widget-disabled');
        this.editButton.classList.add('oo-ui-widget-enabled');
      }
    }
    if (this.isLineGapped) {
      this.line.classList.add('cd-commentOverlay-line-closingGap');
    }
    this.overlay.classList.toggle('cd-commentOverlay-stretchedStart', this.isStartStretched);
    this.overlay.classList.toggle('cd-commentOverlay-stretchedEnd', this.isEndStretched);
  }

  /**
   * Add the underlay and overlay if they are missing, update their styles, recalculate their
   * positions and redraw if the comment has been moved or do nothing if everything is right.
   *
   * @param {object} [options={}]
   * @param {boolean} [options.add=true] Add the layers in case they are created. If set to false,
   *   it is expected that the layers created during this procedure, if any, will be added
   *   afterwards (otherwise there would be layers without a parent element which would lead to
   *   bugs).
   * @param {boolean} [options.update=true] Update the layers' positions in case the comment is
   *   moved. If set to false, it is expected that the positions will be updated afterwards.
   * @param {object} [options.floatingRects] `Element#getBoundingClientRect` results for floating
   *   elements from `convenientDiscussions.g.floatingElements`. It may be calculated in advance for
   *   many elements in one sequence to save time.
   * @returns {?boolean} Was the comment moved.
   */
  configureLayers(options = {}) {
    if (options.add === undefined) {
      options.add = true;
    }
    if (options.update === undefined) {
      options.update = true;
    }

    if (this.editForm) {
      return null;
    }

    // FIXME: it is possible that a floating element that is on above in the DOM is below spacially.
    // In this case, rectTop and rectBottom will be swapped.
    options.rectTop = getCommentPartRect(this.highlightables[0]);
    options.rectBottom = this.elements.length === 1 ?
      options.rectTop :
      getCommentPartRect(this.highlightables[this.highlightables.length - 1]);

    if (!getVisibilityByRects(options.rectTop, options.rectBottom)) {
      this.layersTop = null;
      this.layersLeft = null;
      this.layersWidth = null;
      this.layersHeight = null;
      return null;
    }

    options.layersContainerOffset = this.getLayersContainerOffset();

    let isMoved = false;
    if (this.underlay) {
      const topChanged = (
        window.scrollY + options.rectTop.top !==
        options.layersContainerOffset.top + this.layersTop
      );
      const heightChanged = options.rectBottom.bottom - options.rectTop.top !== this.layersHeight;
      isMoved = (
        topChanged ||
        heightChanged ||
        this.highlightables[0].offsetWidth !== this.firstHighlightableWidth
      );
    }

    if (!this.underlay || isMoved) {
      this.calculateLayersPositions(options);
    }

    // Configure the layers only if they were unexistent or the comment position has changed, to
    // save time.
    if (this.underlay) {
      this.updateLayersStyles();
      if (isMoved && options.update) {
        this.updateLayersPositions();
      }
      return isMoved;
    } else {
      this.createLayers();
      if (options.add) {
        this.addLayers();
      }
      return false;
    }
  }

  /**
   * Add the (already existent) comment's layers to the DOM.
   */
  addLayers() {
    if (!this.underlay) return;

    this.updateLayersPositions();
    this.getLayersContainer().appendChild(this.underlay);
    this.getLayersContainer().appendChild(this.overlay);
  }

  /**
   * Transfer the `layers(Top|Left|Width|Height)` values to the style of the layers.
   */
  updateLayersPositions() {
    this.underlay.style.top = this.overlay.style.top = this.layersTop + 'px';
    this.underlay.style.left = this.overlay.style.left = this.layersLeft + 'px';
    this.underlay.style.width = this.overlay.style.width = this.layersWidth + 'px';
    this.underlay.style.height = this.overlay.style.height = this.layersHeight + 'px';
  }

  /**
   * Highlight the comment when it is hovered.
   *
   * @param {Event} e
   */
  highlightHovered(e) {
    if (this.isHovered || cd.util.isPageOverlayOn()) return;

    if (e && e.type === 'touchstart') {
      cd.comments
        .filter((comment) => comment.isHovered)
        .forEach((comment) => {
          comment.unhighlightHovered();
        });
    }

    this.$animatedBackground?.stop(false, true);
    const isMoved = this.configureLayers();

    // Add classes if the comment wasn't moved. If it was moved, the layers are removed and created
    // again when the next event fires.
    if (isMoved || !this.underlay) return;

    this.underlay.classList.add('cd-commentUnderlay-hover');
    this.overlay.classList.add('cd-commentOverlay-hover');
    this.isHovered = true;
  }

  /**
   * Unhighlight the comment when it has lost focus.
   */
  unhighlightHovered() {
    if (!this.isHovered) return;

    this.$animatedBackground?.stop(false, true);

    this.underlay.classList.remove('cd-commentUnderlay-hover');
    this.overlay.classList.remove('cd-commentOverlay-hover');
    this.overlayInnerWrapper.style.display = '';
    this.isHovered = false;
  }

  /**
   * Highlight the comment as a target (it is opened by a link, just posted, is the target of the
   * up/down comment buttons, or is scrolled to after pressing a navigation panel button).
   */
  highlightTarget() {
    this.isTarget = true;

    // We don't take the color from cd.g.COMMENT_TARGET_COLOR as it may be overriden by the user in
    // their personal CSS.
    this.flash('target', 2000, () => {
      this.isTarget = false;
    });
  }

  /**
   * Change the comment's background color to the provided color for the given number of
   * milliseconds, then smoothly change it back.
   *
   * @param {string} type
   * @param {number} delay
   * @param {Function} callback
   */
  flash(type, delay, callback) {
    this.configureLayers();
    if (!this.$underlay) {
      if (callback) {
        callback();
      }
      return;
    }

    cd.debug.startTimer('animatedBackground');
    /**
     * Comment underlay and some elements inside comment overlay whose colors are animated in some
     * events.
     *
     * @type {?(JQuery|undefined)}
     */
    this.$animatedBackground = this.$underlay.add(this.$overlayContent);
    cd.debug.stopTimer('animatedBackground');

    // Reset the animations and colors
    this.$animatedBackground.add(this.$marker).stop(false, true);

    // The "cd-commentUnderlay-forcedBackground" class helps to set background for a type even if
    // they user has switched off background highlighting for this type ("new", for example).
    this.underlay.classList.add(
      `cd-commentUnderlay-${type}`,
      'cd-commentUnderlay-forcedBackground'
    );
    this.overlay.classList.add(`cd-commentOverlay-${type}`, 'cd-commentOverlay-forcedBackground');

    this.$marker.css({ opacity: 1 });
    clearTimeout(this.unhighlightTimeout);
    this.unhighlightTimeout = setTimeout(() => {
      // TODO: disappeared check / animation / unhighlightTimeout stop()

      const markerColor = this.$marker.css('background-color');
      const backgroundColor = this.$underlay.css('background-color');

      this.underlay.classList.remove(
        `cd-commentUnderlay-${type}`,
        'cd-commentUnderlay-forcedBackground'
      );
      this.overlay.classList.remove(
        `cd-commentOverlay-${type}`,
        'cd-commentOverlay-forcedBackground'
      );
      const finalMarkerColor = this.$marker.css('background-color');
      let finalBackgroundColor = this.$underlay.css('background-color');

      // That's basically if the flash color is green (new, when a comment is updated after an edit)
      // and the comment itself is new and green, then animate to transparent, then set green back,
      // so that there is any animation at all.
      if (finalBackgroundColor === backgroundColor) {
        finalBackgroundColor = 'rgba(0, 0, 0, 0)';
      }

      this.$marker.css({
        backgroundColor: markerColor,
        opacity: 1,
      });
      this.$animatedBackground.css({ backgroundColor: backgroundColor })
      this.$overlayGradient.css({ backgroundImage: 'none' });

      const generateProperties = (backgroundColor) => {
        const properties = { backgroundColor };

        // jquery.color module can't animate to the transparent color.
        if (properties.backgroundColor === 'rgba(0, 0, 0, 0)') {
          properties.opacity = 0;
        }

        return properties;
      };
      const propertyDefaults = {
        backgroundColor: '',
        backgroundImage: '',
        opacity: '',
      };

      this.$marker.animate(generateProperties(finalMarkerColor), 400, 'swing', () => {
        this.$marker.css(propertyDefaults);
      });
      const comment = this;
      this.$animatedBackground.animate(
        generateProperties(finalBackgroundColor),
        400,
        'swing',
        function () {
          if (this !== comment.$overlayContent.get(0)) return;

          if (callback) {
            callback();
          }
          comment.$animatedBackground.add(comment.$overlayGradient).css(propertyDefaults);
        }
      );
    }, delay);
  }

  /**
   * Flash the comment as updated and add it to the seen rendered edits list kept in the local
   * storage.
   */
  flashNew() {
    this.flash('new', 1000);

    if (this.isEdited) {
      const seenRenderedEdits = getFromLocalStorage('seenRenderedEdits');
      const articleId = mw.config.get('wgArticleId');
      seenRenderedEdits[articleId] = seenRenderedEdits[articleId] || {};
      seenRenderedEdits[articleId][this.anchor] = {
        comparedHtml: this.comparedHtml,
        seenUnixTime: Date.now(),
      };
      saveToLocalStorage('seenRenderedEdits', seenRenderedEdits);
    }
  }

  /**
   * Flash the comment as updated when it appears in sight.
   */
  flashNewOnSight() {
    if (this.isInViewport()) {
      this.flashNew();
    } else {
      this.willFlashNewOnSight = true;
    }
  }

  /**
   * Update the comment's properties, add a small text next to the signature saying the comment has
   * been edited or deleted, and flash the comment as updated if it has been.
   *
   * @param {string} type Type of the mark: `'edited'`, `'editedSince'`, or `'deleted'`.
   * @param {boolean} [isNewVersionRendered] Has the new version of the comment been rendered.
   * @param {number} [comparedRevisionId] ID of the revision to compare with when the user clicks to
   *   see the diff.
   * @param {string} [commentsData] Data of the comments as of the current revision and the revision
   *   to compare with.
   */
  markAsEdited(type, isNewVersionRendered, comparedRevisionId, commentsData) {
    let stringName;
    switch (type) {
      case 'edited':
      default:
        this.isEdited = true;
        stringName = 'comment-edited';
        break;

      case 'editedSince':
        this.isEditedSincePreviousVisit = true;
        stringName = 'comment-editedsince';
        break;

      case 'deleted':
        this.isDeleted = true;
        stringName = 'comment-deleted';
        break;
    }

    this.$elements
      .last()
      .find('.cd-editMark')
      .remove();

    let $refreshLink;
    if (!isNewVersionRendered) {
      const keptData = type === 'deleted' ? {} : { commentAnchor: this.anchor };
      $refreshLink = $('<a>')
        .text(cd.s('comment-edited-refresh'))
        .on('click', () => {
          reloadPage(keptData);
        });
    }

    let $diffLink;
    if (type !== 'deleted' && this.getSourcePage().name === cd.g.PAGE.name) {
      $diffLink = $('<a>')
        .text(cd.s('comment-edited-diff'))
        .on('click', async (e) => {
          e.preventDefault();
          $diffLink.addClass('cd-link-pending');
          try {
            await this.showDiff(comparedRevisionId, commentsData);
          } catch (e) {
            let text = cd.s('comment-edited-diff-error');
            if (e instanceof CdError) {
              const { type, message } = e.data;
              if (message) {
                text = message;
              } else if (type === 'network') {
                text += ' ' + cd.sParse('error-network');
              }
            }
            mw.notify(text, { type: 'error' });
          }
          $diffLink.removeClass('cd-link-pending');
        });
    }

    const $editMark = $('<span>')
      .addClass('cd-editMark')
      .append(cd.sParse(stringName));
    if ($refreshLink) {
      $editMark.append(' ', $refreshLink);
    } else {
      $editMark.addClass('cd-editMark-newVersionRendered');
    }
    if ($diffLink) {
      $editMark.append($refreshLink ? cd.sParse('dot-separator') : ' ', $diffLink);
    }

    // Add the mark to the last block element, going as many nesting levels down as needed to avoid
    // it appearing after a block element.
    let $last;
    let $tested = this.$elements.last();
    do {
      $last = $tested;
      $tested = $last.children().last();
    } while ($tested.length && !isInline($tested.get(0)));

    if (!$last.find('.cd-beforeEditMark').length) {
      const $before = $('<span>').addClass('cd-beforeEditMark');
      $last.append(' ', $before);
    }
    $last.append($editMark);

    if (isNewVersionRendered) {
      this.flashNewOnSight();
    }

    // Layers are supposed to be updated (deleted comments background, repositioning) separately,
    // see updateChecker~checkForNewEdits, for example.
  }

  /**
   * Update the comment's properties, remove the edit mark added in {@link
   * module:Comment#markAsEdited} and flash the comment as updated if it has been (reset to the
   * original version, or unedited, in this case).
   *
   * @param {string} type Type of the mark: `'edited'` or `'deleted'`.
   */
  unmarkAsEdited(type) {
    switch (type) {
      case 'edited':
      default:
        this.isEdited = false;
        break;
      case 'deleted':
        this.isDeleted = false;

        // commentLayers.redrawIfNecessary(), that is called on DOM updates, could circumvent this
        // comment if it has no property signalling that it should be highlighted, so we update its
        // styles manually.
        this.updateLayersStyles();

        break;
    }

    this.$elements
      .last()
      .find('.cd-editMark')
      .remove();

    if (type === 'edited') {
      if (this.willFlashNewOnSight) {
        this.willFlashNewOnSight = false;
      } else {
        const seenRenderedEdits = getFromLocalStorage('seenRenderedEdits');
        const articleId = mw.config.get('wgArticleId');
        seenRenderedEdits[articleId] = seenRenderedEdits[articleId] || {};
        delete seenRenderedEdits[articleId][this.anchor];
        saveToLocalStorage('seenRenderedEdits', seenRenderedEdits);

        this.flashNewOnSight();
      }
    }
  }

  /**
   * Update the comment's content.
   *
   * @param {object} currentComment Data about the comment in the current revision as delivered by
   *   the worker.
   * @param {object} newComment Data about the comment in the new revision as delivered by the
   *   worker.
   * @returns {boolean} Was the update successful.
   */
  update(currentComment, newComment) {
    const elementTagNames = Array.from(this.$elements).map((el) => el.tagName);

    // References themselves may be out of the comment's HTML and might be edited.
    const areThereReferences = newComment.hiddenElementData
      .some((data) => data.type === 'reference');

    // If a style element is replaced with a link element, we can't replace HTML.
    const areStyleTagsKept = (
      !newComment.hiddenElementData.length ||
      newComment.hiddenElementData.every((data, i) => (
        data.type !== 'templateStyles' ||
        data.tagName === 'STYLE' ||
        currentComment.hiddenElementData[i].tagName !== 'STYLE'
      ))
    );

    if (
      !areThereReferences &&
      areStyleTagsKept &&
      areObjectsEqual(elementTagNames, newComment.elementTagNames)
    ) {
      const match = this.$elements.find('.autonumber').text().match(/\d+/);
      let currentAutonumber = match ? match[0] : 1;
      newComment.elementHtmls.forEach((html, i) => {
        html = html.replace(
          /\x01(\d+)_\w+\x02/g,
          (s, num) => newComment.hiddenElementData[num - 1].html
        );
        if (/^H[1-6]$/.test(elementTagNames[i])) {
          const $headline = this.$elements.eq(i).find('.mw-headline');
          if ($headline.length) {
            const $headlineNumber = $headline.find('.mw-headline-number');
            const $html = $(html);
            $headline
              .html($html.html())
              .prepend($headlineNumber);
            const section = this.section;
            if (section) {
              const originalHeadline = section.headline;
              section.parseHeadline();
              if (section.isWatched && section.headline !== originalHeadline) {
                section.watch(true, originalHeadline);
              }
              section.getTocItem()?.replaceText($html);
            }
          }
        } else {
          this.replaceElement(this.$elements.eq(i), html);
        }
      });
      this.$elements.find('.autonumber').each((i, el) => {
        $(el).text(`[${currentAutonumber}]`);
        currentAutonumber++;
      });
      this.$elements
        .attr('data-comment-id', this.id)
        .first()
        .attr('id', this.anchor);
      mw.hook('wikipage.content').add(this.$elements);

      delete this.cachedText;
      return true;
    } else {
      return false;
    }
  }

  /**
   * Scroll to the comment if it is not in the viewport.
   *
   * @param {string} alignment One of the values that {@link $.fn.cdScrollTo} accepts: `'top'`,
   *   `'center'`, or `'bottom'`.
   */
  scrollIntoView(alignment) {
    const $target = this.editForm ? this.editForm.$element : this.$elements;
    $target.cdScrollIntoView(alignment);
  }

  /**
   * Scroll to the comment and (by default) highlight it as a target.
   *
   * @param {boolean} [smooth=true] Use a smooth animation.
   * @param {boolean} [pushState=false] Whether to push a state to the history with the comment
   *   anchor as a fragment.
   * @param {boolean} highlight Whether to highlight the comment as target.
   * @param {Function} [callback] Callback to run after the animation has completed.
   */
  scrollTo(smooth = true, pushState = false, highlight = true, callback) {
    if (pushState) {
      history.pushState(history.state, '', '#' + this.anchor);
    }

    if (this.isCollapsed) {
      this.getVisibleCollapsedNote().cdScrollTo('top', smooth, callback);
      mw.notify(cd.s('navpanel-firstunseen-hidden'));
    } else {
      const $elements = this.editForm ? this.editForm.$element : this.$elements;
      const alignment = this.isOpeningSection || this.editForm ? 'top' : 'center';
      if (callback) {
        callback();
      }
      $elements.cdScrollIntoView(alignment, smooth, callback);
      if (highlight) {
        this.highlightTarget();
      }
    }
  }

  /**
   * Replace a button in the comment overlay with another.
   *
   * @param {Element} button
   * @param {Element} replacement
   * @param {string} buttonName
   * @private
   */
  replaceButton(button, replacement, buttonName) {
    this.overlayContent.insertBefore(replacement, button);
    button.remove();
    this[buttonName + 'Button'] = replacement;
  }

  /**
   * Scroll to the parent comment of the comment.
   */
  goToParent() {
    const parent = this.getParent();

    if (!parent) {
      console.error('This comment has no parent.');
      return;
    }

    parent.scrollTo();

    const goToChildButton = new OO.ui.ButtonWidget({
      label: cd.s('cm-gotochild'),
      icon: 'downTriangle',
      title: cd.s('cm-gotochild-tooltip'),
      framed: false,
      invisibleLabel: true,
      classes: ['cd-button', 'cd-commentButton', 'cd-commentButton-icon'],
    });
    goToChildButton.on('click', () => {
      parent.goToChild();
    });

    parent.configureLayers();

    if (parent.goToChildButton) {
      parent.goToChildButton.$element.remove();
    }
    parent.$overlayContent.prepend(goToChildButton.$element);
    parent.goToChildButton = goToChildButton;

    /**
     * Child comment that has sent the user to this comment using the "Go to parent" function.
     *
     * @name childToScrollBackTo
     * @type {Comment|undefined}
     * @instance
     */
    parent.childToScrollBackTo = this;
  }

  /**
   * Scroll to the child comment of the comment.
   */
  goToChild() {
    if (!this.childToScrollBackTo) {
      console.error('This comment has no child from which the user had navigated earlier.');
      return;
    }

    this.childToScrollBackTo.scrollTo();
  }

  /**
   * Copy a link to the comment or open a copy link dialog.
   *
   * @param {Event} e
   */
  async copyLink(e) {
    if (this.isLinkBeingCopied) return;
    const linkButton = this.linkButton;
    const pendingLinkButton = this.elementPrototypes.pendingLinkButton.cloneNode(true);
    this.replaceButton(this.linkButton, pendingLinkButton, 'link');
    await copyLink(this, e);
    this.replaceButton(this.linkButton, linkButton, 'link');
  }

  /**
   * Find the edit that added the comment.
   *
   * @returns {object}
   * @throws {CdError}
   */
  async findAddingEdit() {
    if (this.addingEdit) {
      return this.addingEdit;
    }

    // Search for the edit in the range of 2 minutes before to 2 minutes later.
    const rvstart = new Date(this.date.getTime() - cd.g.MILLISECONDS_IN_MINUTE * 2).toISOString();
    const rvend = new Date(this.date.getTime() + cd.g.MILLISECONDS_IN_MINUTE * 2).toISOString();
    const revisions = await this.getSourcePage().getArchivedPage().getRevisions({
      rvprop: ['ids', 'comment', 'parsedcomment', 'timestamp'],
      rvdir: 'newer',
      rvstart,
      rvend,
      rvuser: this.author.name,
      rvlimit: 500,
    });

    const compareRequests = revisions.map((revision) => cd.g.api.post({
      action: 'compare',
      fromtitle: this.getSourcePage().getArchivedPage().name,
      fromrev: revision.revid,
      torelative: 'prev',
      prop: ['diff'],
      formatversion: 2,
    }).catch(handleApiReject));

    const compareResps = await Promise.all(compareRequests);
    const regexp = /<td colspan="2" class="diff-empty">&#160;<\/td>\s*<td class="diff-marker">\+<\/td>\s*<td class="diff-addedline"><div>(?!=)(.+?)<\/div><\/td>\s*<\/tr>/g;
    const commentFullText = this.getText(false) + ' ' + this.$signature.get(0).innerText;
    const matches = [];
    for (let i = 0; i < compareResps.length; i++) {
      const diffBody = compareResps[i]?.compare?.body;
      if (!diffBody) continue;

      const revision = revisions[i];

      // Compare diff _parts_ with added text in case multiple comments were added with the edit.
      let match;
      let diffOriginalText = '';
      let diffText = '';
      let bestDiffPartWordOverlap = 0;
      while ((match = regexp.exec(diffBody))) {
        const diffPartText = removeWikiMarkup(decodeHtmlEntities(match[1]));
        const diffPartWordOverlap = calculateWordOverlap(diffPartText, commentFullText);
        if (diffPartWordOverlap > bestDiffPartWordOverlap) {
          bestDiffPartWordOverlap = diffPartWordOverlap;
        }
        diffText += diffPartText + '\n';
        diffOriginalText += match[1] + '\n';
      }
      if (!diffOriginalText.trim()) continue;

      revision.diffBody = diffBody;
      const timestamp = new Date(revision.timestamp).getTime();

      // Add 30 seconds to get better date proximity results since we don't see the seconds
      // number.
      const thisCommentTimestamp = this.date.getTime() + (30 * 1000);

      const dateProximity = Math.abs(thisCommentTimestamp - timestamp);
      const fullTextWordOverlap = calculateWordOverlap(diffText, commentFullText);
      let wordOverlap = Math.max(fullTextWordOverlap, bestDiffPartWordOverlap);

      if (wordOverlap < 1 && diffOriginalText.includes('{{')) {
        try {
          const html = (await parseCode(diffOriginalText, { title: cd.g.PAGE.name })).html;
          diffOriginalText = $('<div>').append(html).cdGetText();
        } catch (e) {
          throw new CdError({
            type: 'parse',
          });
        }
        wordOverlap = calculateWordOverlap(diffOriginalText, commentFullText);
      }

      matches.push({ revision, wordOverlap, dateProximity });
    }

    let bestMatch;
    matches.forEach((match) => {
      if (
        !bestMatch ||
        match.wordOverlap > bestMatch.wordOverlap ||
        (
          bestMatch &&
          match.wordOverlap === bestMatch.wordOverlap &&
          match.dateProximity > bestMatch.dateProximity
        )
      ) {
        bestMatch = match;
      }
    });

    if (!bestMatch) {
      throw new CdError({
        type: 'parse',
      });
    }

    // Cache a successful result.
    this.addingEdit = bestMatch.revision;

    return this.addingEdit;
  }

  /**
   * Get a diff link for the comment.
   *
   * @param {boolean} short Whether to return a short diff link.
   * @returns {string}
   */
  async getDiffLink(short) {
    const edit = await this.findAddingEdit();
    if (short) {
      return `https:${mw.config.get('wgServer')}/?diff=${edit.revid}`;
    } else {
      const urlEnding = decodeURI(cd.g.PAGE.getArchivedPage().getUrl({ diff: edit.revid }));
      return `https:${mw.config.get('wgServer')}${urlEnding}`;
    }
  }

  /**
   * Generate a JQuery object containing an edit summary, diff body, and link to the next diff.
   *
   * @returns {JQuery}
   * @private
   */
  async generateDiffView() {
    const edit = await this.findAddingEdit();
    const diffLink = await this.getDiffLink();
    const $nextDiffLink = $('<a>')
      .addClass('cd-diffView-nextDiffLink')
      .attr('href', diffLink.replace(/&diff=(\d+)/, '&oldid=$1&diff=next'))
      .attr('target', '_blank')
      .text(cd.mws('nextdiff'));
    const $above = $('<div>').append($nextDiffLink);
    if (edit.parsedcomment) {
      const $summaryText = cd.util.wrap(edit.parsedcomment, { targetBlank: true })
        .addClass('comment');
      $above.append(cd.sParse('cld-summary'), cd.mws('colon-separator'), $summaryText);
    }
    const $diffBody = cd.util.wrapDiffBody(edit.diffBody);
    return $('<div>')
      .addClass('cd-diffView-diff')
      .append($above, $diffBody);
  }

  /**
   * Process thank error.
   *
   * @param {CdError|Error} e
   * @param {Element} thankButton
   * @private
   */
  thankFail(e, thankButton) {
    const { type, code } = e.data;
    let text;
    switch (type) {
      case 'parse': {
        const url = this.getSourcePage().getArchivedPage().getUrl({ action: 'history' });
        text = cd.sParse('error-diffnotfound') + ' ' + cd.sParse('error-diffnotfound-history', url);
        break;
      }

      case 'api':
      default: {
        if (code === 'noData') {
          const url = this.getSourcePage().getArchivedPage().getUrl({ action: 'history' });
          text = (
            cd.sParse('error-diffnotfound') +
            ' ' +
            cd.sParse('error-diffnotfound-history', url)
          );
        } else {
          text = cd.sParse('thank-error');
          console.warn(e);
        }
        break;
      }

      case 'network': {
        text = cd.sParse('error-diffnotfound') + ' ' + cd.sParse('error-network');
        break;
      }
    }
    mw.notify(cd.util.wrap(text, { targetBlank: true }), { type: 'error' });
    this.replaceButton(this.thankButton, thankButton, 'thank');
  }

  /**
   * Find the edit that added the comment, ask for a confirmation, and send a "thank you"
   * notification.
   */
  async thank() {
    if (dealWithLoadingBug('mediawiki.diff.styles')) return;

    const thankButton = this.thankButton;
    const pendingThankButton = this.elementPrototypes.pendingThankButton.cloneNode(true);
    this.replaceButton(this.thankButton, pendingThankButton, 'thank');

    let genderRequest;
    if (cd.g.GENDER_AFFECTS_USER_STRING && this.author.isRegistered()) {
      genderRequest = getUserGenders([this.author]);
    }

    let edit;
    try {
      ([edit] = await Promise.all([
        this.findAddingEdit(),
        genderRequest,
        mw.loader.using('mediawiki.diff.styles'),
      ].filter(defined)));
    } catch (e) {
      this.thankFail(e, thankButton);
      return;
    }

    const url = this.getSourcePage().getArchivedPage().getUrl({ diff: edit.revid });
    const question = cd.sParse('thank-confirm', this.author.name, this.author, url);
    const $question = cd.util.wrap(question, {
      tagName: 'div',
      targetBlank: true,
    });
    const $diff = await this.generateDiffView();
    const $content = $('<div>').append($question, $diff);
    if (await OO.ui.confirm($content, { size: 'larger' })) {
      try {
        await cd.g.api.postWithEditToken(cd.g.api.assertCurrentUser({
          action: 'thank',
          rev: edit.revid,
          source: cd.config.scriptCodeName,
        })).catch(handleApiReject);
      } catch (e) {
        this.thankFail(e, thankButton);
        return;
      }

      mw.notify(cd.s('thank-success'));
      const thankedButton = this.elementPrototypes.thankedButton.cloneNode(true);
      this.replaceButton(this.thankButton, thankedButton, 'thank');

      thanks[edit.revid] = {
        anchor: this.anchor,
        text: this.getText(),
        thankUnixTime: Date.now(),
      };
      saveToLocalStorage('thanks', thanks);
    } else {
      this.replaceButton(this.thankButton, thankButton, 'thank');
    }
  }

  /**
   * Locate the comment in the page source code and, if no `pageCode` is passed, set the results to
   * the `inCode` property. Otherwise, return the result.
   *
   * @param {string} [pageCode] Page code, if different from the `code` property of {@link
   *   Comment#getSourcePage()}.
   * @param {string} [commentData] Comment data for comparison (can be set together with pageCode).
   * @returns {string|undefined}
   * @throws {CdError}
   */
  locateInCode(pageCode, commentData) {
    if (!pageCode) {
      this.inCode = null;
    }

    // Collect matches
    const matches = this.searchInCode(pageCode || this.getSourcePage().code, commentData);

    let bestMatch;
    matches.forEach((match) => {
      if (!bestMatch || match.score > bestMatch.score) {
        bestMatch = match;
      }
    });

    if (!bestMatch) {
      throw new CdError({
        type: 'parse',
        code: 'locateComment',
      });
    }

    const inCode = this.adjustCommentCodeData(bestMatch);
    if (pageCode) {
      return inCode;
    } else {
      this.inCode = inCode;
    }
  }

  /**
   * Create a {@link module:Comment#replyForm reply form} for the comment.
   *
   * @param {object|CommentForm} dataToRestore
   */
  reply(dataToRestore) {
    if (!this.replyForm) {
      /**
       * Reply form related to the comment.
       *
       * @type {CommentForm|undefined}
       */
      this.replyForm = dataToRestore instanceof CommentForm ?
        dataToRestore :
        new CommentForm({
          mode: 'reply',
          target: this,
          dataToRestore,
        });
    }
  }

  /**
   * Create an {@link module:Comment#editForm edit form} for the comment.
   *
   * @param {object|CommentForm} dataToRestore
   */
  edit(dataToRestore) {
    // "!this.editForm" check is in case the editing is called from a script of some kind (there is
    // no button to call it from CD when the form is displayed).
    if (!this.editForm) {
      /**
       * Edit form related to the comment.
       *
       * @type {CommentForm|undefined}
       */
      this.editForm = dataToRestore instanceof CommentForm ?
        dataToRestore :
        new CommentForm({
          mode: 'edit',
          target: this,
          dataToRestore,
        });
    }

    // We use a class here because there can be elements in the comment that are hidden from the
    // beginning and should stay so when reshowing the comment.
    this.$elements.addClass('cd-hidden');
    this.removeLayers();
  }

  /**
   * Convert the comment code as present in the `inCode` property to text to set as a value of the
   * form's comment input.
   *
   * @returns {string}
   */
  codeToText() {
    if (!this.inCode) {
      console.error('The Comment#inCode property should contain an object with the comment code data.');
      return;
    }
    let { code, indentationChars } = this.inCode;

    let hidden;
    ({ code, hidden } = hideSensitiveCode(code));

    let text = code;

    if (this.level === 0) {
      // Collapse random line breaks that do not affect text rendering but will transform into <br>
      // on posting. \x01 and \x02 mean the beginning and ending of sensitive code except for
      // tables. \x03 and \x04 mean the beginning and ending of a table. Note: This should be kept
      // coordinated with the reverse transformation code in CommentForm#commentTextToCode. Some
      // more comments are there.
      const entireLineRegexp = new RegExp(`^(?:\\x01\\d+_block.*\\x02) *$`, 'i');
      const fileRegexp = new RegExp(`^\\[\\[${cd.g.FILE_PREFIX_PATTERN}.+\\]\\]$`, 'i');
      const currentLineEndingRegexp = new RegExp(
        `(?:<${cd.g.PNIE_PATTERN}(?: [\\w ]+?=[^<>]+?| ?\\/?)>|<\\/${cd.g.PNIE_PATTERN}>|\\x04) *$`,
        'i'
      );
      const nextLineBeginningRegexp = new RegExp(
        `^(?:<\\/${cd.g.PNIE_PATTERN}>|<${cd.g.PNIE_PATTERN}|\\|)`,
        'i'
      );
      const entireLineFromStartRegexp = /^(=+).*\1[ \t]*$|^----/;
      text = text.replace(
        /^((?![:*#; ]).+)\n(?![\n:*#; \x03])(?=(.*))/gm,
        (s, currentLine, nextLine) => {
          const newlineOrSpace = (
            entireLineRegexp.test(currentLine) ||
            entireLineRegexp.test(nextLine) ||
            fileRegexp.test(currentLine) ||
            fileRegexp.test(nextLine) ||
            entireLineFromStartRegexp.test(currentLine) ||
            entireLineFromStartRegexp.test(nextLine) ||
            currentLineEndingRegexp.test(currentLine) ||
            nextLineBeginningRegexp.test(nextLine)
          ) ?
            '\n' :
            ' ';
          return currentLine + newlineOrSpace;
        }
      );
    }

    text = text
      // <br> → \n, except in list elements and <pre>'s created by a space starting the line.
      .replace(/^(?![:*# ]).*<br[ \n]*\/?>.*$/gmi, (s) => (
        s.replace(/<br[ \n]*\/?>\n? */gi, () => '\n')
      ))

      // Remove indentation characters
      .replace(/\n([:*#]*[:*])([ \t]*)/g, (s, chars, spacing) => {
        const newChars = chars.slice(indentationChars.length);
        return (
          '\n' +
          (
            chars.length >= indentationChars.length ?
            newChars + (chars.length > indentationChars.length ? spacing : '') :
            chars + spacing
          )
        );
      });

    text = unhideText(text, hidden);

    if (cd.config.paragraphTemplates.length) {
      const paragraphTemplatesPattern = cd.config.paragraphTemplates
        .map(caseInsensitiveFirstCharPattern)
        .join('|');
      const pattern = `\\{\\{(?:${paragraphTemplatesPattern})\\}\\}`;
      const regexp = new RegExp(pattern, 'g');
      const lineRegexp = new RegExp(`^(?![:*#]).*${pattern}`, 'gm');
      text = text.replace(lineRegexp, (s) => s.replace(regexp, '\n\n'));
    }

    if (this.level !== 0) {
      text = text.replace(/\n\n+/g, '\n\n');
    }

    return text.trim();
  }

  /**
   * Load the comment code.
   *
   * @throws {CdError|Error}
   */
  async getCode() {
    try {
      await this.getSourcePage().getCode();
      this.locateInCode();
    } catch (e) {
      if (e instanceof CdError) {
        throw new CdError(Object.assign({}, { message: cd.s('cf-error-getpagecode') }, e.data));
      } else {
        throw e;
      }
    }
  }

  /**
   * Mark the comment as seen, and also {@link module:Comment#flash flash} comments that are set to
   * flash.
   *
   * @param {string} [registerAllInDirection] Mark all comments in the forward (`'forward'`) or
   *   backward (`'backward'`) direction from this comment as seen.
   * @param {boolean} [highlight=false] Highlight the comment.
   */
  registerSeen(registerAllInDirection, highlight = false) {
    const isInVewport = !registerAllInDirection || this.isInViewport();
    if (this.isSeen === false && isInVewport) {
      this.isSeen = true;
      if (highlight) {
        this.highlightTarget();
      }
    }

    if (this.willFlashNewOnSight && isInVewport) {
      this.willFlashNewOnSight = false;
      this.flashNew();
    }

    const makesSenseToRegister = cd.comments
      .some((comment) => comment.isSeen || comment.willFlashNewOnSight);
    if (registerAllInDirection && makesSenseToRegister) {
      const change = registerAllInDirection === 'backward' ? -1 : 1;
      const nextComment = cd.comments[this.id + change];
      if (nextComment && nextComment.isInViewport() !== false) {
        nextComment.registerSeen(registerAllInDirection, highlight);
      }
    }
  }

  /**
   * Determine if the comment is in the viewport. Return `null` if we couldn't get the comment's
   * positions.
   *
   * @param {boolean} partially Return true even if only a part of the comment is in the viewport.
   * @returns {?boolean}
   */
  isInViewport(partially = false) {
    const viewportTop = window.scrollY + cd.g.BODY_SCROLL_PADDING_TOP;
    const viewportBottom = viewportTop + window.innerHeight;

    this.getPositions();

    if (!this.positions) {
      return null;
    }

    return partially ?
      this.positions.downplayedBottom > viewportTop && this.positions.top < viewportBottom :
      this.positions.top >= viewportTop && this.positions.downplayedBottom <= viewportBottom;
  }

  /**
   * Remove the comment's layers.
   */
  removeLayers() {
    if (!this.underlay) return;

    this.$animatedBackground?.stop();
    this.$marker.stop();
    commentLayers.underlays.splice(commentLayers.underlays.indexOf(this.underlay), 1);

    this.underlay.remove();
    this.underlay = null;
    this.$underlay = null;

    this.overlay.remove();
    this.overlay = null;
    this.$overlay = null;

    this.isHovered = false;
  }

  /**
   * Comment elements as a jQuery object.
   *
   * Uses a getter because elements of a comment can be altered after creating an instance, for
   * example with {@link module:Comment#replaceElement}. Using a getter also allows to save a little
   * time on running `$()`, although that alone is perhaps not enough to create it.
   *
   * @type {JQuery}
   */
  get $elements() {
    if (this.cached$elements === undefined) {
      this.cached$elements = $(this.elements);
    }
    return this.cached$elements;
  }

  set $elements(value) {
    this.cached$elements = value;
    this.elements = value.get();
  }

  /**
   * Replace an element that is one of the comment's elements with another element or HTML string.
   *
   * @param {Element|JQuery} element
   * @param {Element|string} newElementOrHtml
   */
  replaceElement(element, newElementOrHtml) {
    const nativeElement = element instanceof $ ? element.get(0) : element;
    let newElement;
    if (typeof newElementOrHtml === 'string') {
      const index = Array.from(nativeElement.parentNode.children).indexOf(nativeElement);
      const parentNode = nativeElement.parentNode;
      nativeElement.outerHTML = newElementOrHtml;
      newElement = parentNode.children[index];
    } else {
      newElement = newElementOrHtml;
      nativeElement.parentNode.replaceChild(newElement, element);
    }

    if (element instanceof $) {
      this.$elements = this.$elements
        .not(nativeElement)
        .add(newElement);
    } else {
      this.elements.splice(this.elements.indexOf(element), 1, newElementOrHtml);
    }

    if (this.highlightables.includes(nativeElement)) {
      this.highlightables.splice(this.highlightables.indexOf(nativeElement), 1, newElement);
      this.bindEvents(newElement);
    }
    if (this.anchorHighlightable === nativeElement) {
      this.anchorHighlightable = newElement;
    }
  }

  /**
   * Get the comment's text.
   *
   * @param {boolean} [cleanUp=true] Whether to clean up the signature.
   * @returns {string}
   */
  getText(cleanUp = true) {
    if (this.cachedText === undefined) {
      const $clone = this.$elements
        .not('h1, h2, h3, h4, h5, h6')
        .clone()
        .removeClass('cd-hidden');
      const $dummy = $('<div>').append($clone);
      const selectorParts = ['.cd-signature', '.cd-editMark'];
      if (cd.config.unsignedClass) {
        selectorParts.push(`.${cd.config.unsignedClass}`);
      }
      const selector = selectorParts.join(', ');
      $dummy.find(selector).remove();
      let text = $dummy.cdGetText();
      if (cleanUp) {
        if (cd.config.signatureEndingRegexp) {
          text = text.replace(new RegExp(cd.config.signatureEndingRegexp.source + '$'), '');
        }

        // FIXME: We use the same regexp to clean both wikitext and render. With the current default
        // config value the side effects seem to be negligable, but who knows...
        if (cd.config.signaturePrefixRegexp) {
          text = text.replace(cd.config.signaturePrefixRegexp, '');
        }
      }

      this.cachedText = text;
    }

    return this.cachedText;
  }

  /**
   * When searching for the comment in the code, adjust the index of the comment start point and
   * some related properties.
   *
   * @param {object} originalData
   * @returns {object}
   * @private
   */
  adjustCommentBeginning({ code, startIndex }) {
    // Identifying indentation characters
    let indentationChars = '';
    let lineStartIndex = startIndex;

    const headingMatch = code.match(/(^[^]*(?:^|\n))((=+)(.*?)\3[ \t\x01\x02]*\n)/);
    let headingCode;
    let headingStartIndex;
    let headingLevel;
    let headlineCode;
    if (headingMatch) {
      headingCode = headingMatch[2];
      headingStartIndex = startIndex + headingMatch[1].length;
      headingLevel = headingMatch[3].length;
      headlineCode = headingMatch[4].trim();
      startIndex += headingMatch[0].length;
      code = code.slice(headingMatch[0].length);

      // Try to edit the first comment at
      // https://ru.wikipedia.org/wiki/Википедия:Голосования/Отметки_статусных_статей_в_навигационных_шаблонах#Да
      // to see a bug happening if we don't check for `this.isOpeningSection`.
      lineStartIndex = this.isOpeningSection ? headingStartIndex : startIndex;
    } else {
      // Exclude the text of the previous comment that is ended with 3 or 5 tildes instead of 4.
      [cd.config.signatureEndingRegexp, cd.g.TIMEZONE_REGEXP]
        .filter(defined)
        .filter((regexp) => regexp !== null)
        .forEach((originalRegexp) => {
          const regexp = new RegExp(originalRegexp.source + '$', 'm');
          const linesRegexp = /^(.+)\n/gm;
          let lineMatch;
          let indent;
          while ((lineMatch = linesRegexp.exec(code))) {
            const line = lineMatch[1].replace(/\[\[:?(?:[^|[\]<>\n]+\|)?(.+?)\]\]/g, '$1');
            if (regexp.test(line)) {
              const testIndent = lineMatch.index + lineMatch[0].length;
              if (testIndent === code.length) {
                break;
              } else {
                indent = testIndent;
              }
            }
          }
          if (indent) {
            code = code.slice(indent);
            startIndex += indent;
            lineStartIndex += indent;
          }
        });

      // This should be before the "this.level > 0" block to account for cases like
      // https://ru.wikipedia.org/w/index.php?oldid=110033693&section=6&action=edit (a regexp
      // doesn't catch the comment because of a new line inside a "syntaxhighlight" element).
      cd.g.BAD_COMMENT_BEGINNINGS.forEach((pattern) => {
        if (pattern.source[0] !== '^') {
          console.debug('Regexps in cd.config.customBadCommentBeginnings should have "^" as the first character.');
        }
        const match = code.match(pattern);
        if (match) {
          code = code.slice(match[0].length);
          lineStartIndex = startIndex + match[0].lastIndexOf('\n') + 1;
          startIndex += match[0].length;
        }
      });

      // Exclude the indentation characters and any foreign code before them from the comment code.
      // Comments at the zero level sometimes start with ":" that is used to indent some side note.
      // It shouldn't be considered an indentation character.
      if (this.level > 0) {
        const replaceIndentationChars = (s, before, chars) => {
          indentationChars = chars;
          lineStartIndex = startIndex + before.length;
          startIndex += s.length;
          return '';
        };

        code = code.replace(
          new RegExp(`^()${cd.config.indentationCharsPattern}`),
          replaceIndentationChars
        );

        // See the comment "Without the following code, the section introduction..." in Parser.js.
        // Dangerous case:
        // https://ru.wikipedia.org/w/index.php?oldid=105936825&action=edit&section=1. This was
        // actually a mistake to put a signature at the first level, but if it was legit, only the
        // last sentence should have been interpreted as the comment.
        if (indentationChars === '') {
          code = code.replace(
            new RegExp(`(^[^]*?(?:^|\n))${cd.config.indentationCharsPattern}(?![^]*\\n[^:*#])`),
            replaceIndentationChars
          );
        }
      }
    }

    return {
      code,
      startIndex,
      lineStartIndex,
      headingMatch,
      headingCode,
      headingStartIndex,
      headingLevel,
      headlineCode,
      indentationChars,
    };
  }

  /**
   * While locating the comment in the source code, adjust the data related to the comment code.
   * This is mostly related to the signature code and indentation characters.
   *
   * @param {object} originalData
   * @returns {object}
   * @private
   */
  adjustCommentCodeData(originalData) {
    const data = Object.assign({}, originalData);

    const movePartToSignature = (s) => {
      data.signatureDirtyCode = s + data.signatureDirtyCode;
      data.endIndex -= s.length;
      return '';
    }

    if (this.isOwn && cd.g.USER_SIGNATURE_PREFIX_REGEXP) {
      data.code = data.code.replace(cd.g.USER_SIGNATURE_PREFIX_REGEXP, movePartToSignature);
    }

    const movePartsToSignature = (code, regexps) => {
      regexps.forEach((regexp) => {
        code = code.replace(regexp, movePartToSignature);
      });
      return code;
    };

    const tagRegexp = new RegExp(`(<${cd.g.PIE_PATTERN}(?: [\\w ]+?=[^<>]+?)?> *)+$`, 'i');

    // Why signaturePrefixRegexp three times? Well, the test case here is the MusikAnimal's
    // signature here: https://en.wikipedia.org/w/index.php?diff=next&oldid=946899148.
    data.code = movePartsToSignature(data.code, [
      cd.config.signaturePrefixRegexp,
      tagRegexp,
      cd.config.signaturePrefixRegexp,
      tagRegexp,
      new RegExp(`<small class="${cd.config.unsignedClass}">.*$`),
      /<!-- *Template:Unsigned.*$/,
      cd.config.signaturePrefixRegexp,
    ]);

    // Exclude <small></small> and template wrappers from the strings
    const smallWrappers = [{
      start: /^<small>/,
      end: /<\/small>[ \u00A0\t]*$/,
    }];
    if (cd.config.smallDivTemplates.length) {
      smallWrappers.push({
        start: new RegExp(
          `^(?:\\{\\{(${cd.config.smallDivTemplates.join('|')})\\|(?: *1 *= *|(?![^{]*=)))`,
          'i'
        ),
        end: /\}\}[ \u00A0\t]*$/,
      });
    }

    data.signatureCode = data.signatureDirtyCode;
    data.inSmallFont = false;
    smallWrappers.some((wrapper) => {
      if (wrapper.start.test(data.code) && wrapper.end.test(data.signatureCode)) {
        data.inSmallFont = true;
        data.code = data.code.replace(wrapper.start, '');
        data.signatureCode = data.signatureCode.replace(wrapper.end, '');
        return true;
      }
    });

    // If the comment contains different indentation character sets for different lines, then use
    // different sets depending on the mode (edit/reply).
    data.replyIndentationChars = data.indentationChars;
    if (!this.isOpeningSection) {
      // If the last line ends with "#", it's probably a numbered list _inside_ the comment, not two
      // comments in one, so we exclude such cases. The signature code is used because it may start
      // with a newline.
      const match = (data.code + data.signatureDirtyCode).match(/\n([:*#]*[:*]).*$/);
      if (match) {
        data.replyIndentationChars = match[1];

        // Cases where indentation characters on the first line don't denote a comment level but
        // serve some other purposes. Some strange example:
        // https://ru.wikipedia.org/w/index.php?diff=105978713.
        if (data.replyIndentationChars.length < data.indentationChars.length) {
          const prefix = data.indentationChars.slice(data.replyIndentationChars.length) + ' ';
          data.code = prefix + data.code;
          data.indentationChars = data.indentationChars.slice(0, data.replyIndentationChars.length);
          data.startIndex -= prefix.length;
        }
      }
    }
    data.replyIndentationChars += cd.config.defaultIndentationChar;

    return data;
  }

  /**
   * Search for the comment in the source code and return possible matches.
   *
   * @param {string} pageCode
   * @param {string} commentData
   * @returns {object}
   * @private
   */
  searchInCode(pageCode, commentData) {
    const signatures = extractSignatures(pageCode);
    // .startsWith() to account for cases where you can ignore the timezone string in the "unsigned"
    // templates (it may be present and may be not), but it appears on the page.
    const signatureMatches = signatures.filter((sig) => (
      (sig.author === this.author || sig.author === '<undated>') &&
      (
        this.timestamp === sig.timestamp ||
        (this.timestamp && this.timestamp.startsWith(sig.timestamp))
      )
    ));

    // Transform the signature object to a comment match object
    let matches = signatureMatches.map((match) => ({
      id: match.id,
      author: match.author,
      timestamp: match.timestamp,
      date: match.date,
      anchor: match.anchor,
      signatureDirtyCode: match.dirtyCode,
      startIndex: match.commentStartIndex,
      endIndex: match.startIndex,
      signatureEndIndex: match.startIndex + match.dirtyCode.length,
    }));

    // For the reserve method; the main method uses one date.
    const previousComments = commentData ?
      commentData.previousComments :
      cd.comments
        .slice(Math.max(0, this.id - 2), this.id)
        .reverse();

    const id = commentData ? commentData.id : this.id;

    let followsHeading;
    let sectionHeadline;
    if (commentData) {
      followsHeading = commentData.followsHeading;
      sectionHeadline = commentData.section?.headline;
    } else {
      followsHeading = this.followsHeading;
      sectionHeadline = this.section?.headline;
    }

    // Collect data for every match
    matches.forEach((match) => {
      match.code = pageCode.slice(match.startIndex, match.endIndex);

      match.hasIdMatched = id === match.id;

      if (previousComments.length) {
        match.hasPreviousCommentsDataMatched = false;
        match.hasPreviousCommentDataMatched = false;

        for (let i = 0; i < previousComments.length; i++) {
          const signature = signatures[match.id - 1 - i];
          if (!signature) break;

          // At least one coincided comment is enough if the second is unavailable.
          match.hasPreviousCommentsDataMatched = (
            signature.timestamp === previousComments[i].timestamp &&

            // Previous comment object may come from the worker, where it has only the authorName
            // property.
            signature.author.name === previousComments[i].authorName
          );

          // Many consecutive comments with the same author and timestamp.
          if (match.isPreviousCommentsDataEqual !== false) {
            match.isPreviousCommentsDataEqual = (
              match.timestamp === signature.timestamp &&
              match.author === signature.author
            );
          }

          if (i === 0) {
            match.hasPreviousCommentDataMatched = match.hasPreviousCommentsDataMatched;
          }
          if (!match.hasPreviousCommentsDataMatched) break;
        }
      } else {
        // If there is no previous comment both on the page and in the code, it's a match.
        match.hasPreviousCommentsDataMatched = match.id === 0;
        match.hasPreviousCommentDataMatched = match.id === 0;
      }

      match.isPreviousCommentsDataEqual = Boolean(match.isPreviousCommentsDataEqual);
      Object.assign(match, this.adjustCommentBeginning(match));
      if (followsHeading) {
        match.hasHeadlineMatched = match.headingMatch ?
          normalizeCode(removeWikiMarkup(match.headlineCode)) === normalizeCode(sectionHeadline) :
          -5;
      } else {
        match.hasHeadlineMatched = !match.headingMatch;
      }

      const commentText = commentData ? commentData.text : this.getText();
      match.wordOverlap = calculateWordOverlap(commentText, removeWikiMarkup(match.code));

      match.score = (
        (
          matches.length === 1 ||
          match.wordOverlap > 0.5 ||

          // The reserve method, if for some reason the text is not overlapping: by this and
          // previous two dates and authors. If all dates and authors are the same, that shouldn't
          // count (see [[Википедия:К удалению/22 сентября 2020#202009221158_Facenapalm_17]]).
          (
            id !== 0 &&
            match.hasPreviousCommentsDataMatched &&
            !match.isPreviousCommentsDataEqual
          ) ||

          // There are always problems with first comments as there are no previous comments to
          // compare the signatures of and it's harder to tell the match, so we use a bit ugly
          // solution here, although it should be quite reliable: the comment's firstness, matching
          // author, date, and headline. A false negative will take place when the comment is no
          // longer first. Another option is to look for next comments, not for previous.
          (id === 0 && match.hasPreviousCommentsDataMatched && match.hasHeadlineMatched)
        ) * 2 +
        match.wordOverlap +
        match.hasHeadlineMatched * 1 +
        match.hasPreviousCommentsDataMatched * 0.5 +
        match.hasIdMatched * 0.0001
      );
    });
    matches = matches.filter((match) => match.score > 2.5);

    return matches;
  }

  /**
   * Modify a page code string related to the comment in accordance with an action.
   *
   * @param {object} options
   * @param {string} options.pageCode
   * @param {string} options.action
   * @param {string} options.doDelete
   * @param {string} [options.thisInCode] Should be set if `commentCode` is set.
   * @param {string} [options.commentForm] `commentCode` or `commentForm` should be set.
   * @param {string} [options.commentCode] `commentCode` or `commentForm` should be set.
   * @returns {string}
   * @throws {CdError}
   */
  modifyCode({ pageCode, action, doDelete, commentForm, thisInCode, commentCode }) {
    thisInCode = thisInCode || this.inCode;

    let currentIndex;
    if (action === 'reply') {
      currentIndex = thisInCode.endIndex;

      let adjustedCode = hideDistractingCode(pageCode);
      if (cd.g.CLOSED_DISCUSSION_PAIR_REGEXP) {
        adjustedCode = adjustedCode
          .replace(cd.g.CLOSED_DISCUSSION_PAIR_REGEXP, (s, indentationChars) => (
            '\x01'.repeat(indentationChars.length) +
            ' '.repeat(s.length - indentationChars.length - 1) +
            '\x02'
          ));
      }
      if (cd.g.CLOSED_DISCUSSION_SINGLE_REGEXP) {
        let match;
        while ((match = cd.g.CLOSED_DISCUSSION_SINGLE_REGEXP.exec(adjustedCode))) {
          adjustedCode = (
            adjustedCode.slice(0, match.index) +
            hideTemplatesRecursively(adjustedCode.slice(match.index), null, match[1].length).code
          );
        }
      }

      const adjustedCodeAfter = adjustedCode.slice(currentIndex);

      const nextSectionHeadingMatch = adjustedCodeAfter.match(/\n+(=+).*?\1[ \t\x01\x02]*\n|$/);
      let chunkCodeAfterEndIndex = currentIndex + nextSectionHeadingMatch.index + 1;
      let chunkCodeAfter = pageCode.slice(currentIndex, chunkCodeAfterEndIndex);
      cd.config.keepInSectionEnding.forEach((regexp) => {
        const match = chunkCodeAfter.match(regexp);
        if (match) {
          // "1" accounts for the first line break.
          chunkCodeAfterEndIndex -= match[0].length - 1;
        }
      });
      const adjustedChunkCodeAfter = adjustedCode.slice(currentIndex, chunkCodeAfterEndIndex);

      const maxIndentationCharsLength = thisInCode.replyIndentationChars.length - 1;
      const properPlaceRegexp = new RegExp(
        '^([^]*?(?:' +
        mw.util.escapeRegExp(thisInCode.signatureCode) +
        '|' +
        cd.g.TIMESTAMP_REGEXP.source +
        '.*' +
        (cd.g.UNSIGNED_TEMPLATES_PATTERN ? `|${cd.g.UNSIGNED_TEMPLATES_PATTERN}.*` : '') +

        // "\x01" is from hiding closed discussions and HTML comments. TODO: Line can start with a
        // HTML comment in a <pre> tag, that doesn't mean we can put a comment after it. We perhaps
        // need to change `wikitext.hideDistractingCode`.
        '|(?:^|\\n)\\x01.+)\\n)\\n*(?:' +

        // "\n" is here to avoid putting the reply on a casual empty line. "\x01" is from hiding
        // closed discussions.
        `[:*#\\x01]{0,${maxIndentationCharsLength}}(?![:*#\\n\\x01])` +

        // This excludes the case where "#" is starting a numbered list inside a comment
        // (https://ru.wikipedia.org/w/index.php?diff=110482717).
        (
          maxIndentationCharsLength > 0 ?
          `|[:*#\\x01]{1,${maxIndentationCharsLength}}(?![:*\\n\\x01])` :
          ''
        ) +
        ')'
      );
      let [, adjustedCodeInBetween] = adjustedChunkCodeAfter.match(properPlaceRegexp) || [];

      if (adjustedCodeInBetween === undefined) {
        adjustedCodeInBetween = adjustedChunkCodeAfter;
      }

      // Hotfix for comments inside a table (barnstars, for example).
      if (
        this.isInSingleCommentTable &&
        adjustedChunkCodeAfter.slice(adjustedCodeInBetween.length).startsWith('|}\n')
      ) {
        adjustedCodeInBetween += '|}\n';
      }

      // If the comment is to be put after a comment with different indentation characters, use
      // these.
      const [, changedIndentationChars] = (
        adjustedCodeInBetween.match(/\n([:*#]{2,}|#[:*#]*).*\n$/) ||
        []
      );
      if (changedIndentationChars) {
        // Note the bug https://ru.wikipedia.org/w/index.php?diff=next&oldid=105529545 that was
        // possible here when we used ".slice(0, thisInCode.indentationChars.length + 1)" (due to
        // "**" as indentation characters in Bsivko's comment).
        thisInCode.replyIndentationChars = changedIndentationChars
          .slice(0, thisInCode.replyIndentationChars.length)
          .replace(/:$/, cd.config.defaultIndentationChar);
      }

      currentIndex += adjustedCodeInBetween.length;
    }

    if (!commentCode && commentForm && !doDelete) {
      commentCode = commentForm.commentTextToCode('submit');
    }

    let newPageCode;
    let codeBeforeInsertion;
    switch (action) {
      case 'reply': {
        codeBeforeInsertion = pageCode.slice(0, currentIndex);
        newPageCode = codeBeforeInsertion + commentCode + pageCode.slice(currentIndex);
        break;
      }

      case 'edit': {
        if (doDelete) {
          let startIndex;
          let endIndex;
          if (this.isOpeningSection && thisInCode.headingStartIndex !== undefined) {
            this.section.locateInCode();
            if (extractSignatures(this.section.inCode.code).length > 1) {
              throw new CdError({
                type: 'parse',
                code: 'delete-repliesInSection',
              });
            } else {
              // Deleting the whole section is safer as we don't want to leave any content in the
              // end anyway.
              ({ startIndex, contentEndIndex: endIndex } = this.section.inCode);
            }
          } else {
            endIndex = thisInCode.signatureEndIndex + 1;
            const succeedingText = pageCode.slice(thisInCode.endIndex);

            const repliesRegexp = new RegExp(
              `^.+\\n+[:*#]{${thisInCode.indentationChars.length + 1},}`
            );
            const repliesMatch = repliesRegexp.exec(succeedingText);

            if (repliesMatch) {
              throw new CdError({
                type: 'parse',
                code: 'delete-repliesToComment',
              });
            } else {
              startIndex = thisInCode.lineStartIndex;
            }
          }

          newPageCode = pageCode.slice(0, startIndex) + pageCode.slice(endIndex);
        } else {
          const startIndex = thisInCode.lineStartIndex;
          codeBeforeInsertion = pageCode.slice(0, startIndex);
          const codeAfterInsertion = pageCode.slice(thisInCode.signatureEndIndex);
          newPageCode = codeBeforeInsertion + commentCode + codeAfterInsertion;
        }
        break;
      }
    }

    return { newPageCode, codeBeforeInsertion, commentCode };
  }

  /**
   * Get and sometimes create the container for the comment's layers.
   *
   * @returns {Element}
   */
  getLayersContainer() {
    if (this.cachedLayersContainer === undefined) {
      let offsetParent;
      const treeWalker = new TreeWalker(document.body, null, true, this.elements[0]);
      while (treeWalker.parentNode()) {
        // These elements have "position: relative" for the purpose we know.
        if (treeWalker.currentNode.classList.contains('cd-connectToPreviousItem')) continue;

        let style = treeWalker.currentNode.conveneintDiscussionsStyle;
        if (!style) {
          // window.getComputedStyle is expensive, so we save the result to the node's property.
          style = window.getComputedStyle(treeWalker.currentNode);
          treeWalker.currentNode.conveneintDiscussionsStyle = style;
        }
        if (['absolute', 'relative'].includes(style.position)) {
          offsetParent = treeWalker.currentNode;
        }
        const backgroundColor = style.backgroundColor;
        if (backgroundColor.includes('rgb(') || style.backgroundImage !== 'none' && !offsetParent) {
          offsetParent = treeWalker.currentNode;
          offsetParent.classList.add('cd-commentLayersContainer-parent-relative');
        }
        if (offsetParent) break;
      }
      if (!offsetParent) {
        offsetParent = document.body;
      }
      offsetParent.classList.add('cd-commentLayersContainer-parent');
      let container = offsetParent.firstElementChild;
      if (!container.classList.contains('cd-commentLayersContainer')) {
        container = document.createElement('div');
        container.classList.add('cd-commentLayersContainer');
        offsetParent.insertBefore(container, offsetParent.firstChild);
      }
      this.cachedLayersContainer = container;

      addToArrayIfAbsent(commentLayers.layersContainers, container);
    }
    return this.cachedLayersContainer;
  }

  /**
   * @typedef {object} LayersContainerOffset
   * @property {number} top Top offset.
   * @property {number} left Left offset.
   */

  /**
   * Get the top and left offset of the layers container.
   *
   * @returns {LayersContainerOffset}
   */
  getLayersContainerOffset() {
    const container = this.getLayersContainer();
    let top = container.cdCachedLayersContainerTop;
    let left = container.cdCachedLayersContainerLeft;
    if (top === undefined || container.cdCouldHaveMoved) {
      const rect = container.getBoundingClientRect();
      top = rect.top + window.scrollY;
      left = rect.left + window.scrollX;
      container.cdCouldHaveMoved = false;
      container.cdCachedLayersContainerTop = top;
      container.cdCachedLayersContainerLeft = left;
    }
    return { top, left };
  }

  /**
   * Request the gender of the comment's author if it is absent and affects the user mention string
   * and do something when it's received.
   *
   * @param {Function} callback
   * @param {boolean} [runAlways=false] Whether to execute the callback even if the gender request
   *   is not needed.
   */
  requestAuthorGenderIfNeeded(callback, runAlways = false) {
    if (cd.g.GENDER_AFFECTS_USER_STRING && this.author.isRegistered() && !this.author.getGender()) {
      this.genderRequestCallbacks = this.genderRequestCallbacks || [];
      let errorCallback;
      if (!this.genderRequest) {
        this.genderRequest = getUserGenders([this.author]);
        errorCallback = (e) => {
          console.warn(`Couldn't get the gender of user ${this.author.name}.`, e);
        };
      }
      if (!this.genderRequestCallbacks.includes(callback)) {
        this.genderRequest.then(callback, errorCallback);
        this.genderRequestCallbacks.push(callback);
      }
    } else {
      if (runAlways) {
        setTimeout(callback);
      }
    }
  }

  /**
   * Get the wiki page that has the source code of the comment (may be different from the current
   * page if the comment is transcluded from another page).
   *
   * @type {Page}
   */
  getSourcePage() {
    return this.section ? this.section.getSourcePage() : cd.g.PAGE;
  }

  /**
   * Show a diff of changes in the comment between the current revision ID and the provided one.
   *
   * @param {number} comparedRevisionId
   * @param {object} commentsData
   * @throws {CdError}
   */
  async showDiff(comparedRevisionId, commentsData) {
    if (dealWithLoadingBug('mediawiki.diff.styles')) return;

    let revisionIdLesser = Math.min(mw.config.get('wgRevisionId'), comparedRevisionId);
    let revisionIdGreater = Math.max(mw.config.get('wgRevisionId'), comparedRevisionId);

    const revisionsRequest = cd.g.api.post({
      action: 'query',
      revids: [revisionIdLesser, revisionIdGreater],
      prop: 'revisions',
      rvslots: 'main',
      rvprop: ['ids', 'content'],
      redirects: !(this === cd.g.PAGE && mw.config.get('wgIsRedirect')),
      formatversion: 2,
    }).catch(handleApiReject);

    const compareRequest = cd.g.api.post({
      action: 'compare',
      fromtitle: this.getSourcePage().name,
      fromrev: revisionIdLesser,
      torev: revisionIdGreater,
      prop: ['diff'],
      formatversion: 2,
    }).catch(handleApiReject);

    let [revisionsResp, compareResp] = await Promise.all([
      revisionsRequest,
      compareRequest,
      mw.loader.using('mediawiki.diff.styles'),
    ]);

    const revisions = revisionsResp.query?.pages?.[0]?.revisions;
    if (!revisions) {
      throw new CdError({
        type: 'api',
        code: 'noData',
      });
    }

    const lineNumbers = [[], []];
    revisions.forEach((revision, i) => {
      const pageCode = revision.slots.main.content;
      const inCode = this.locateInCode(pageCode, commentsData[i]);
      const newlinesBeforeComment = pageCode.slice(0, inCode.lineStartIndex).match(/\n/g) || [];
      const newlinesInComment = (
        pageCode.slice(inCode.lineStartIndex, inCode.signatureEndIndex).match(/\n/g) ||
        []
      );
      const startLineNumber = newlinesBeforeComment.length + 1;
      const endLineNumber = startLineNumber + newlinesInComment.length;
      for (let j = startLineNumber; j <= endLineNumber; j++) {
        lineNumbers[i].push(j);
      }
    });

    const body = compareResp?.compare?.body;
    if (!body) {
      throw new CdError({
        type: 'api',
        code: 'noData',
      });
    }

    const $diff = $(cd.util.wrapDiffBody(body));
    let currentLineNumbers = [];
    let cleanDiffBody = '';
    $diff.find('tr').each((i, tr) => {
      const $tr = $(tr);
      const $lineNumbers = $tr.children('.diff-lineno');
      for (let j = 0; j < $lineNumbers.length; j++) {
        const match = $lineNumbers.eq(j).text().match(/\d+/);
        currentLineNumbers[j] = Number((match || [])[0]);
        if (!currentLineNumbers[j]) {
          throw new CdError({
            type: 'parse',
          });
        }
        if (j === 1) return;
      }
      if (!$tr.children('.diff-marker').length) return;
      let addToDiff = false;
      for (let j = 0; j < 2; j++) {
        if (!$tr.children().eq(j * 2).hasClass('diff-empty')) {
          if (lineNumbers[j].includes(currentLineNumbers[j])) {
            addToDiff = true;
          }
          currentLineNumbers[j]++;
        }
      }
      if (addToDiff) {
        cleanDiffBody += $tr.prop('outerHTML');
      }
    });
    const $cleanDiff = $(cd.util.wrapDiffBody(cleanDiffBody));
    if (!$cleanDiff.find('.diff-deletedline, .diff-addedline').length) {
      throw new CdError({
        type: 'parse',
        message: cd.s('comment-edited-diff-empty'),
      });
    }

    const $historyLink = $('<a>')
      .attr('href', this.getSourcePage().getUrl({ action: 'history' }))
      .attr('target', '_blank')
      .text(cd.s('comment-edited-history'));
    const $below = $('<div>')
      .addClass('cd-commentDiffView-below')
      .append($historyLink);

    const $message = $('<div>').append($cleanDiff, $below);
    OO.ui.alert($message, { size: 'larger' });
  }

  /**
   * For a comment in a collapsed thread, get the visible collapsed note. (Collapsed threads may be
   * nested, so there can be a number of invisible collapsed notes for a comment.) If the visible
   * collapsed note is unavailable, return the top invisible collapsed note.
   *
   * @returns {?JQuery}
   */
  getVisibleCollapsedNote() {
    if (!this.isCollapsed) {
      return null;
    }

    let $note;
    for (let t = this.collapsedThread; t; t = t.rootComment.getParent()?.collapsedThread) {
      $note = t.$collapsedNote;
      if ($note.is(':visible')) break;
    }
    return $note;
  }

  getUrl() {
    if (!this.cachedUrl) {
      this.cachedUrl = getObjectUrl(this.anchor);
    }

    return this.cachedUrl;
  }

  createSublevelItem(name, position, parentListType) {
    /*
      There are 3 basic cases that we account for:
      1.
          : Comment.
          [End of the thread.]
        We create a list and an item in it. We also create an item next to the existent item and
        wrap the list into it. We don't add the list to the existent item because that item can be
        entirely a comment part, so at least highlighting would be broken if we do.
      2.
          Comment.
          [No replies, no "Reply to section" button.]
        We create a list and an item in it.
      3.
          Comment.
          : Reply or "Reply to section" button.
        or
          : Comment.
          :: Reply.
        (this means <dl> next to <div> which is a similar case to the previous one)
        We create an item in the existent list.

      The lists can be of other type, not necessarily ":".

      The resulting structure is:
        Outer wrapper item element (dd, li, rarely div) - in case 1.
          Wrapping list element (ul) - in cases 1 and 2.
            Wrapping item element (li) - in cases 1, 2, and 3.
     */

    cd.debug.startTimer('createSublevelItem');

    let wrappingItemTag = 'li';
    let createList = true;
    let outerWrapperTag;

    const $lastOfTarget = this.$elements.last();
    let $nextToTarget = $lastOfTarget.next();
    const $nextToTargetFirstChild = $nextToTarget.children().first();
    if ($nextToTarget.is('dd, li') && $nextToTargetFirstChild.hasClass('cd-commentLevel')) {
      // A relatively rare case possible when two adjacent lists are merged, for example when
      // replying to
      // https://en.wikipedia.org/wiki/Wikipedia:Village_pump_(policy)#202103271157_Uanfala.
      $nextToTarget = $nextToTargetFirstChild;
    }
    if ($nextToTarget.is('dl, ul')) {
      createList = false;
      wrappingItemTag = $nextToTarget.is('ul') ? 'li' : 'dd';
      $nextToTarget.addClass(`cd-commentLevel cd-commentLevel-${this.level + 1}`);
    } else if ($lastOfTarget.is('li')) {
      // We need to avoid a number appearing next to the form in numbered lists, so we have <div>
      // in those cases. Which is unsemantic, yes :-(
      outerWrapperTag = parentListType === 'ol' ? 'div' : 'li';
    } else if ($lastOfTarget.is('dd')) {
      outerWrapperTag = 'dd';
    }

    const $wrappingItem = $(`<${wrappingItemTag}>`);
    let $wrappingList;
    if (createList) {
      $wrappingList = $('<dl>')
        .append($wrappingItem)
        .addClass(`cd-commentLevel cd-commentLevel-${this.level + 1}`);
    }

    let $outerWrapper;
    if (outerWrapperTag) {
      $outerWrapper = $(`<${outerWrapperTag}>`);

      cd.debug.startTimer('createSublevelItem slow selector');

      // Why ".cd-commentLevel >": reply to a pseudo-comment added with this diff with a mistake:
      // https://ru.wikipedia.org/?diff=113073013.
      if ($lastOfTarget.is('.cd-commentLevel:not(ol) > li, .cd-commentLevel > dd')) {
        $outerWrapper.addClass('cd-connectToPreviousItem');
      }

      cd.debug.stopTimer('createSublevelItem slow selector');

      $wrappingList.appendTo($outerWrapper);
    }

    if ($outerWrapper) {
      $outerWrapper.insertAfter($lastOfTarget);
    } else if ($wrappingList) {
      $wrappingList.insertAfter($lastOfTarget);
    } else {
      if (position === 'top') {
        $wrappingItem.prependTo($nextToTarget);
      } else {
        const $last = $nextToTarget.children().last();
        // "Reply to section" button should always be the last.
        if ($last.hasClass('cd-replyWrapper')) {
          $wrappingItem.insertBefore($last);
        } else {
          $wrappingItem.insertAfter($last);
        }
      }
    }

    this.subitemList.add(name, $wrappingItem);

    cd.debug.stopTimer('createSublevelItem');

    return [$wrappingItem, $wrappingList, $outerWrapper];
  }
}

Object.assign(Comment, CommentStatic);
