import Button from './Button';
import CdError from './CdError';
import CommentButton from './CommentButton';
import CommentForm from './CommentForm';
import CommentSkeleton from './CommentSkeleton';
import CommentStatic from './CommentStatic';
import CommentSubitemList from './CommentSubitemList';
import LiveTimestamp from './LiveTimestamp';
import cd from './cd';
import navPanel from './navPanel';
import updateChecker from './updateChecker';
import userRegistry from './userRegistry';
import { ElementsTreeWalker, TreeWalker } from './treeWalker';
import {
  addToArrayIfAbsent,
  areObjectsEqual,
  calculateWordOverlap,
  dealWithLoadingBug,
  defined,
  generatePageNamePattern,
  getExtendedRect,
  getFromLocalStorage,
  getUrlWithAnchor,
  getVisibilityByRects,
  handleApiReject,
  isInline,
  isPageOverlayOn,
  saveToLocalStorage,
  unhideText,
  unique,
  wrap,
  wrapDiffBody,
} from './util';
import {
  decodeHtmlEntities,
  extractSignatures,
  hideDistractingCode,
  hideSensitiveCode,
  hideTemplatesRecursively,
  normalizeCode,
  removeWikiMarkup,
} from './wikitext';
import { formatDate, formatDateNative } from './timestamp';
import { getUserGenders, parseCode } from './apiWrappers';
import { reloadPage } from './boot';
import { showCopyLinkDialog } from './modal.js';

let elementPrototypes;
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
 * If every changed comment on the page has been seen and there is no new comments on the page that
 * are not displayed, mark the page as read.
 *
 * @private
 */
function maybeMarkPageAsRead() {
  if (
    !navPanel.hiddenNewCommentCount &&
    cd.comments.every((comment) => !comment.willFlashChangedOnSight) &&
    updateChecker.lastCheckedRevisionId
  ) {
    cd.page.markAsRead(updateChecker.lastCheckedRevisionId);
  }
}

/**
 * Class representing a comment (any signed, and in some cases unsigned, text on a wiki talk page).
 *
 * @augments CommentSkeleton
 */
class Comment extends CommentSkeleton {
  /**
   * Create a comment object.
   *
   * @param {Parser} parser
   * @param {object} signature Signature object returned by {@link Parser#findSignatures}.
   * @param {object[]} targets
   */
  constructor(parser, signature, targets) {
    super(parser, signature, targets);

    if (!elementPrototypes) {
      elementPrototypes = cd.g.COMMENT_ELEMENT_PROTOTYPES;
    }

    /**
     * Comment author user object.
     *
     * @type {module:userRegistry~User}
     */
    this.author = userRegistry.getUser(this.authorName);

    /**
     * Comment signature element.
     *
     * @type {external:jQuery}
     */
    this.$signature = $(this.signatureElement);

    /**
     * Is the comment actionable, i.e. you can reply to or edit it. A comment is actionable if it is
     * not in a closed discussion or an old diff page. (Previously the presence of an author was
     * also checked, but currently all comments should have an author.)
     *
     * @type {boolean}
     */
    this.isActionable = (
      cd.state.isPageActive &&
      !cd.g.closedDiscussionElements.some((el) => el.contains(this.elements[0]))
    );

    this.highlightables.forEach(this.bindEvents.bind(this));

    this.setAnchorHighlightable();

    const getContainerListType = (el) => {
      const treeWalker = new ElementsTreeWalker(el);
      while (treeWalker.parentNode()) {
        if (treeWalker.currentNode.classList.contains('cd-commentLevel')) {
          return treeWalker.currentNode.tagName.toLowerCase();
        }
      }
    };

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

    /**
     * Is the comment new. Is set to boolean only on active pages (not archived, not old diffs)
     * excluding pages that are visited for the first time.
     *
     * @type {?boolean}
     */
    this.isNew = null;

    /**
     * Has the comment been seen if it is new. Is set only on active pages (not archived, not old
     * diffs) excluding pages that are visited for the first time. Check using `=== false` if you
     * need to know if the comment is highlighted as new and unseen.
     *
     * @type {?boolean}
     */
    this.isSeen = null;

    /**
     * Is the comment currently highlighted as a target comment.
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
     * Has the comment changed since the previous visit.
     *
     * @type {?boolean}
     */
    this.isChangedSincePreviousVisit = null;

    /**
     * Has the comment changed while the page was idle. (The new version may be rendered and may be
     * not, if the layout is too complex.)
     *
     * @type {?boolean}
     */
    this.isChanged = null;

    /**
     * Was the comment deleted while the page was idle.
     *
     * @type {?boolean}
     */
    this.isDeleted = null;

    /**
     * Should the comment be flashed as changed when it appears in sight.
     *
     * @type {?boolean}
     */
    this.willFlashChangedOnSight = false;

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
     * List of the comment's {@link CommentSubitemList subitems}.
     *
     * @type {CommentSubitemList}
     */
    this.subitemList = new CommentSubitemList();
  }

  /**
   * Set the {@link Comment#anchorHighlightable} element.
   *
   * @private
   */
  setAnchorHighlightable() {
    if (this.highlightables.length > 1) {
      const nestingLevels = [];
      const closestListTypes = [];
      const firstAndLastHighlightable = [
        this.highlightables[0],
        this.highlightables[this.highlightables.length - 1],
      ];
      firstAndLastHighlightable.forEach((highlightable, i) => {
        const treeWalker = new ElementsTreeWalker(highlightable);
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

      /**
       * A special {@link Comment#highlightables highlightable} used to
       * {@link Comment#getLayersMargins determine layers margins}.
       *
       * @type {Element}
       * @private
       */
      this.anchorHighlightable = firstAndLastHighlightable[anchorHighlightableIndex];
    } else {
      this.anchorHighlightable = this.highlightables[0];
    }
  }

  /**
   * Clean up the signature and elements in front of it.
   *
   * @private
   */
  cleanUpSignature() {
    const processNode = (n) => {
      if (!n) return;
      if (n.nodeType === Node.TEXT_NODE || !n.children.length) {
        n.textContent = n.textContent
          .replace(cd.config.signaturePrefixRegexp, '')
          .replace(cd.config.signaturePrefixRegexp, '');
      }

      // "noprint" class check is a workaround to avoid removing of templates such as {{citation
      // needed}}, for example https://en.wikipedia.org/?diff=1022999952.
      if (
        // <b> tags may be the output of templates like
        // https://meta.wikimedia.org/wiki/Template:Done.
        (n.tagName && !['B', 'STRONG'].includes(n.tagName)) &&

        (n.getAttribute('style') || ['SUP', 'SUB'].includes(n.tagName)) &&
        n.textContent.length < 30 &&

        // Templates like "citation needed" or https://ru.wikipedia.org/wiki/Template:-:
        !n.classList.length
      ) {
        n.remove();
      }
    };

    const previousNode = this.signatureElement.previousSibling;
    const previousPreviousNode = previousNode?.previousSibling;
    processNode(previousNode);
    if (
      previousNode &&
      previousPreviousNode &&
      (!previousNode.parentNode || !previousNode.textContent.trim())
    ) {
      const previousPreviousPreviousNode = previousPreviousNode.previousSibling;
      processNode(previousPreviousNode);

      // Rare cases like https://en.wikipedia.org/?diff=1022471527
      if (!previousPreviousNode.parentNode) {
        processNode(previousPreviousPreviousNode);
      }
    }
  }

  /**
   * @typedef {object[]} ReplaceSignatureWithHeaderReturn
   * @property {string} pageName
   * @property {Element} link
   * @global
   * @private
   */

  /**
   * Remove the comment signature, adding a comment header to the top highlightable instead.
   *
   * @returns {ReplaceSignatureWithHeaderReturn} Pages to check existence of.
   * @private
   */
  replaceSignatureWithHeader() {
    const pagesToCheckExistence = [];

    const headerElement = elementPrototypes.headerElement.cloneNode(true);

    const authorWrapper = headerElement.firstChild;
    const authorLink = authorWrapper.firstChild;
    const bdiElement = authorLink.firstChild;
    const authorTalkLink = authorLink.nextElementSibling;
    let contribsLink;
    if (cd.settings.showContribsLink) {
      contribsLink = authorTalkLink.nextElementSibling.nextElementSibling;
      if (!this.author.isRegistered()) {
        contribsLink.previousSibling.remove();
        contribsLink.remove();
      }
    }

    if (this.authorLink) {
      let beforeAuthorLinkParseReturn;
      if (cd.config.beforeAuthorLinkParse) {
        beforeAuthorLinkParseReturn = cd.config.beforeAuthorLinkParse(this.authorLink);
      }

      authorLink.parentNode.replaceChild(this.authorLink, authorLink);
      this.authorLink.classList.add('cd-comment-author');
      this.authorLink.innerHTML = '';
      this.authorLink.appendChild(bdiElement);

      if (cd.config.afterAuthorLinkParse) {
        cd.config.beforeAuthorLinkParse(this.authorLink, beforeAuthorLinkParseReturn);
      }
    } else {
      let pageName;
      if (this.author.isRegistered()) {
        pageName = 'User:' + this.author.name;
        pagesToCheckExistence.push({
          pageName,
          link: authorLink,
        });
      } else {
        pageName = `${cd.g.CONTRIBS_PAGE}/${this.author.name}`;
      }
      authorLink.title = pageName;
      authorLink.href = mw.util.getUrl(pageName);
    }

    if (this.authorTalkLink) {
      authorTalkLink.parentNode.replaceChild(this.authorTalkLink, authorTalkLink);
      this.authorTalkLink.textContent = cd.s('comment-author-talk');
    } else {
      const pageName = 'User talk:' + this.author.name;
      pagesToCheckExistence.push({
        pageName,
        link: authorTalkLink,
      });
      authorTalkLink.title = pageName;
      authorTalkLink.href = mw.util.getUrl(pageName);
    }

    bdiElement.textContent = this.author.name;

    if (cd.settings.showContribsLink && this.author.isRegistered()) {
      const pageName = `${cd.g.CONTRIBS_PAGE}/${this.author.name}`;
      contribsLink.title = pageName;
      contribsLink.href = mw.util.getUrl(pageName);
    }

    if (this.timestamp) {
      /**
       * "Copy link" button.
       *
       * @type {CommentButton}
       */
      this.copyLinkButton = new CommentButton({
        label: this.reformattedTimestamp || this.timestamp,
        tooltip: this.timestampTitle,
        classes: ['cd-comment-button-label', 'cd-comment-timestamp'],
        action: this.copyLink.bind(this),
      });

      headerElement.appendChild(this.copyLinkButton.element);
      this.timestampElement = this.copyLinkButton.labelElement;
      new LiveTimestamp(this.timestampElement, this.date, !cd.settings.hideTimezone);
    }

    this.headerElement = headerElement;

    /**
     * Comment header. Used when comment reformatting is enabled.
     *
     * @type {external:jQuery|undefined}
     */
    this.$header = $(this.headerElement);

    // This is usually done in the `CommentSkeleton` constructor, but if
    // `Comment#reviewHighlightables` has altered the highlightables, this will save the day.
    [this.highlightables[0], this.highlightables[this.highlightables.length - 1]]
      .filter(unique)
      .filter((el) => (
        cd.g.BAD_HIGHLIGHTABLE_ELEMENTS.includes(el.tagName) ||
        (this.highlightables.length > 1 && el.tagName === 'LI' && el.parentNode.tagName === 'OL') ||
        Array.from(el.classList).some((name) => !name.startsWith('cd-'))
      ))
      .forEach((el) => {
        const wrapper = document.createElement('div');
        const origEl = el;
        this.replaceElement(el, wrapper);
        wrapper.appendChild(origEl);

        this.addAttributes();
        origEl.classList.remove('cd-comment-part', 'cd-comment-part-first', 'cd-comment-part-last');
        delete origEl.dataset.commentId;
      });

    this.highlightables[0].insertBefore(headerElement, this.highlightables[0].firstChild);

    this.cleanUpSignature();
    this.signatureElement.remove();

    return pagesToCheckExistence;
  }

  /**
   * Add a menu to the bottom highlightable element of the comment and fill it with buttons. Used
   * when comment reformatting is enabled; otherwise {@link Comment#createLayers} is used.
   *
   * @private
   */
  addMenu() {
    const menuElement = document.createElement('div');
    menuElement.className = 'cd-comment-menu';
    this.menuElement = menuElement;

    /**
     * Comment menu. Used when comment reformatting is enabled; otherwise
     * {@link Comment#$overlayMenu} is used.
     *
     * @type {external:jQuery|undefined}
     */
    this.$menu = $(this.menuElement);

    this.createReplyButton();
    this.createEditButton();
    this.createThankButton();
    this.createGoToParentButton();

    this.highlightables[this.highlightables.length - 1].appendChild(this.menuElement);
  }

  /**
   * Create a {@link Comment#replyButton reply button} and add it to the comment menu
   * ({@link Comment#$menu} or {@link Comment#$overlayMenu}).
   *
   * @private
   */
  createReplyButton() {
    if (this.isActionable) {
      const action = this.replyButtonClick.bind(this);
      if (cd.settings.reformatComments) {
        /**
         * Reply button.
         *
         * @type {CommentButton}
         */
        this.replyButton = new CommentButton({
          label: cd.s('cm-reply'),
          classes: ['cd-comment-button-label'],
          action,
        });

        this.menuElement.appendChild(this.replyButton.element);
      } else {
        const element = elementPrototypes.replyButton.cloneNode(true);
        const widgetConstructor = elementPrototypes.getReplyButton;
        this.replyButton = new CommentButton({ element, action, widgetConstructor });
        this.overlayMenu.appendChild(this.replyButton.element);
      }
    }
  }

  /**
   * Create an {@link Comment#editButton edit button} and add it to the comment menu
   * ({@link Comment#$menu} or {@link Comment#$overlayMenu}).
   *
   * @private
   */
  createEditButton() {
    if (this.isActionable && (this.isOwn || cd.settings.allowEditOthersComments)) {
      const action = this.editButtonClick.bind(this);
      if (cd.settings.reformatComments) {
        /**
         * Edit button.
         *
         * @type {CommentButton}
         */
        this.editButton = new CommentButton({
          label: cd.s('cm-edit'),
          classes: ['cd-comment-button-label'],
          action,
        });

        this.menuElement.appendChild(this.editButton.element);
      } else {
        const element = elementPrototypes.editButton.cloneNode(true);
        const widgetConstructor = elementPrototypes.getEditButton;
        this.editButton = new CommentButton({ element, action, widgetConstructor });
        this.overlayMenu.appendChild(this.editButton.element);
      }
    }
  }

  /**
   * Create a {@link Comment#thankButton thank button} and add it to the comment menu
   * ({@link Comment#$menu} or {@link Comment#$overlayMenu}).
   *
   * @private
   */
  createThankButton() {
    if (this.author.isRegistered() && this.date && !this.isOwn) {
      if (!thanks) {
        thanks = cleanUpThanks(getFromLocalStorage('thanks'));
        saveToLocalStorage('thanks', thanks);
      }
      const isThanked = Object.keys(thanks).some((key) => (
        this.anchor === thanks[key].anchor &&
        calculateWordOverlap(this.getText(), thanks[key].text) > 0.66
      ));

      const action = this.thankButtonClick.bind(this);
      if (cd.settings.reformatComments) {
        /**
         * Edit button.
         *
         * @type {CommentButton}
         */
        this.thankButton = new CommentButton({
          label: cd.s(isThanked ? 'cm-thanked' : 'cm-thank'),
          tooltip: cd.s(isThanked ? 'cm-thanked-tooltip' : 'cm-thank-tooltip'),
          classes: ['cd-comment-button-label'],
          action,
        });

        this.menuElement.appendChild(this.thankButton.element);
      } else {
        const element = elementPrototypes.thankButton.cloneNode(true);
        const widgetConstructor = elementPrototypes.getThankButton;
        this.thankButton = new CommentButton({ element, action, widgetConstructor });
        this.overlayMenu.appendChild(this.thankButton.element);
      }

      if (isThanked) {
        this.setThanked();
      }
    }
  }

  /**
   * Create a {@link Comment#copyLinkButton copy link button} and add it to the comment menu
   * ({@link Comment#$overlayMenu}).
   *
   * @private
   */
  createCopyLinkButton() {
    if (this.anchor && !cd.settings.reformatComments) {
      const element = elementPrototypes.copyLinkButton.cloneNode(true);
      const widgetConstructor = elementPrototypes.getCopyLinkButton;
      this.copyLinkButton = new CommentButton({
        element,
        action: this.copyLink.bind(this),
        widgetConstructor,
      });
      this.overlayMenu.appendChild(this.copyLinkButton.element);
    }
  }

  /**
   * Create a {@link Comment#goToParentButton go to parent button} and add it to the comment header
   * ({@link Comment#$header} or {@link Comment#$overlayMenu}).
   *
   * @private
   */
  createGoToParentButton() {
    if (this.getParent()) {
      const action = this.goToParentButtonClick.bind(this);
      if (cd.settings.reformatComments) {
        /**
         * "Go to the parent comment" button.
         *
         * @type {CommentButton}
         */
        this.goToParentButton = new CommentButton({
          tooltip: cd.s('cm-gotoparent-tooltip'),
          classes: ['cd-comment-button-icon', 'cd-comment-button-goToParent'],
          action,
        });

        this.headerElement.appendChild(this.goToParentButton.element);
      } else {
        const element = elementPrototypes.goToParentButton.cloneNode(true);
        const widgetConstructor = elementPrototypes.getGoToParentButton;
        this.goToParentButton = new CommentButton({ element, action, widgetConstructor });
        this.overlayMenu.appendChild(this.goToParentButton.element);
      }
    }
  }

  /**
   * Create a {@link Comment#goToChildButton go to child button} and add it to the comment header
   * ({@link Comment#$header} or {@link Comment#$overlayMenu}).
   *
   * @private
   */
  createGoToChildButton() {
    if (cd.settings.reformatComments) {
      /**
       * "Go to the child comment" button.
       *
       * @type {CommentButton}
       */
      this.goToChildButton = new CommentButton({
        tooltip: cd.s('cm-gotochild-tooltip'),
        classes: ['cd-comment-button-icon', 'cd-comment-button-goToChild'],
      });

      const referenceNode = this.goToParentButton || this.copyLinkButton || this.authorLink;
      this.headerElement.insertBefore(this.goToChildButton.element, referenceNode?.nextSibling);
    } else {
      const element = elementPrototypes.goToChildButton;
      const widgetConstructor = elementPrototypes.getGoToChildButton;
      this.goToChildButton = new CommentButton({ element, widgetConstructor });
      this.$overlayMenu.prepend(element);
    }
  }

  /**
   * Change the format of the comment timestamp according to the settings.
   *
   * @private
   */
  reformatTimestamp() {
    if (!this.date) return;

    let newTimestamp;
    let title = '';
    if (cd.g.ARE_TIMESTAMPS_ALTERED) {
      newTimestamp = formatDate(this.date, !cd.settings.hideTimezone);
    }

    if (
      cd.settings.timestampFormat === 'relative' &&
      cd.settings.useUiTime &&
      cd.g.CONTENT_TIMEZONE !== cd.g.UI_TIMEZONE
    ) {
      title = formatDateNative(this.date, true) + '\n';
    }

    if (newTimestamp) {
      const originalTimestamp = this.timestampElement.textContent;
      title += originalTimestamp;
      this.reformattedTimestamp = newTimestamp;
      this.timestampTitle = title;
      if (!cd.settings.reformatComments) {
        this.timestampElement.textContent = this.reformattedTimestamp;
        this.timestampElement.title = this.timestampTitle;
        new LiveTimestamp(this.timestampElement, this.date, !cd.settings.hideTimezone);
      }
    }
  }

  /**
   * Bind the standard events to a comment part. Executed on comment object creation and DOM
   * modifications affecting comment parts.
   *
   * @param {Element} element
   * @private
   */
  bindEvents(element) {
    if (cd.settings.reformatComments) return;

    element.onmouseenter = this.highlightHovered.bind(this);
    element.onmouseleave = this.unhighlightHovered.bind(this);
    element.ontouchstart = this.highlightHovered.bind(this);
  }

  /**
   * Filter out floating and hidden elements from the comment's
   * {@link CommentSkeleton#highlightables}, change their attributes, and update the comment's level
   * and parent elements' level classes.
   *
   * @private
   */
  reviewHighlightables() {
    for (let i = 0; i < this.highlightables.length; i++) {
      const el = this.highlightables[i];
      const areThereClassedElements = Array.from(el.classList)
        .some((name) => !name.startsWith('cd-') || name === 'cd-comment-replacedPart');
      if (areThereClassedElements) {
        const isReplacement = i === 0 && el.classList.contains('cd-comment-replacedPart');
        const testElement = isReplacement ? el.firstChild : el;

        // Node that we could use window.getComputerStyle here, but avoid it to avoid the reflow.
        if (
          // Currently we can't have comments with no highlightable elements.
          this.highlightables.length > 1 &&

          (cd.g.floatingElements.includes(testElement) || cd.g.hiddenElements.includes(testElement))
        ) {
          if (el.classList.contains('cd-comment-part-first')) {
            el.classList.remove('cd-comment-part-first');
            this.highlightables[i + 1].classList.add('cd-comment-part-first');
          }
          if (el.classList.contains('cd-comment-part-last')) {
            el.classList.remove('cd-comment-part-last');
            this.highlightables[i - 1].classList.add('cd-comment-part-last');
          }
          delete el.dataset.commentId;
          this.highlightables.splice(i, 1);
          i--;
          this.setLevels(false);
          this.setAnchorHighlightable();

          // Update this.ahContainerListType here as well?
        }
      }
    }
  }

  /**
   * Hide the comment menu (in fact, the comment overlay's inner wrapper).
   *
   * @param {Event} [e]
   * @private
   */
  hideMenu(e) {
    if (e) {
      e.preventDefault();
    }
    this.overlayInnerWrapper.style.display = 'none';
  }

  /**
   * Handle the reply button click.
   *
   * @private
   */
  replyButtonClick() {
    if (this.replyForm) {
      this.replyForm.cancel();
    } else {
      this.reply();
    }
  }

  /**
   * Handle the edit button click.
   *
   * @private
   */
  editButtonClick() {
    this.edit();
  }

  /**
   * Handle the thank button click.
   *
   * @private
   */
  thankButtonClick() {
    this.thank();
  }

  /**
   * Handle the "Go to parent" button click.
   *
   * @private
   */
  goToParentButtonClick() {
    this.goToParent();
  }

  /**
   * @typedef {object} CommentOffset
   * @param {number} top
   * @param {number} bottom
   * @param {number} left
   * @param {number} right
   * @param {number} downplayedBottom
   * @global
   */

  /**
   * If `options.set` is `true`, set the offset to the `offset` (if `options.considerFloating` is
   * `true`) or `roughOffset` (if `options.considerFloating` is `false`) property.
   *
   * @param {?object} offset
   * @param {object} options
   * @private
   */
  setOffsetProperty(offset, options) {
    if (options.set) {
      if (options.considerFloating) {
        /**
         * The comment's coordinates.
         *
         * @type {?CommentOffset}
         */
        this.offset = offset;
      } else {
        /**
         * The comment's rough coordinates (without taking into account floating elements around the
         * comment).
         *
         * @type {?CommentOffset}
         */
        this.roughOffset = offset;
      }
    }
  }

  /**
   * Get the top and bottom rectangles of a comment while taking into account floating elements
   * around the comment.
   *
   * @param {object} rectTop Top rectangle that was got without taking into account floating
   *   elements around the comment.
   * @param {object} rectBottom Bottom rectangle that was got without taking into account floating
   *   elements around the comment.
   * @param {number} bottom Bottom coordonate of the comment (calculated without taking floating
   *   elements into account).
   * @param {object[]} [floatingRects=cd.g.floatingElements.map(getExtendedRect)]
   *   {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect Element#getBoundingClientRect}
   *   results for floating elements from `convenientDiscussions.g.floatingElements`. It may be
   *   calculated in advance for many elements in one sequence to save time.
   * @returns {object[]}
   * @private
   */
  getAdjustedRects(
    rectTop,
    rectBottom,
    bottom,
    floatingRects = cd.g.floatingElements.map(getExtendedRect)
  ) {
    // Check if the comment offset intersects the offset of floating elements on the page. (Only
    // then we would need altering comment styles to get the correct offset which is an expensive
    // operation.)
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
      this.highlightables.forEach((el, i) => {
        initialOverflows[i] = el.style.overflow;
        el.style.overflow = 'hidden';
      });

      rectTop = getCommentPartRect(this.highlightables[0]);
      rectBottom = this.elements.length === 1 ?
        rectTop :
        getCommentPartRect(this.highlightables[this.highlightables.length - 1]);

      // If the comment intersects more than one floating block, we better keep `overflow: hidden`
      // to avoid bugs like where there are two floating blocks to the right with different
      // leftmost offsets and the layer is more narrow than the comment.
      if (intersectsFloatingCount <= 1) {
        this.highlightables.forEach((el, i) => {
          el.style.overflow = initialOverflows[i];
        });
      } else {
        // Prevent issues with comments like this:
        // https://en.wikipedia.org/wiki/Wikipedia:Village_pump_(technical)#202107140040_SGrabarczuk_(WMF).
        this.highlightables.forEach((el, i) => {
          if (cd.g.floatingElements.some((floatingElement) => el.contains(floatingElement))) {
            el.style.overflow = initialOverflows[i];
          }
        });
      }
    }

    return [rectTop, rectBottom];
  }

  /**
   * Set the {@link Comment#isStartStretched isStartStretched} and
   * {@link Comment#isEndStretched isEndStretched} properties.
   *
   * @param {number} left Left offset.
   * @param {number} right Right offset.
   * @private
   */
  setStretchedProperties(left, right) {
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
      // 2 instead of 1 for Timeless
      const leftStretched = left - cd.g.CONTENT_START_MARGIN - 2;
      const rightStretched = right + cd.g.CONTENT_START_MARGIN + 2;

      this.isStartStretched = this.getDir() === 'ltr' ?
        leftStretched <= cd.g.CONTENT_COLUMN_START :
        rightStretched >= cd.g.CONTENT_COLUMN_START;
      this.isEndStretched = this.getDir() === 'ltr' ?
        rightStretched >= cd.g.CONTENT_COLUMN_END :
        leftStretched <= cd.g.CONTENT_COLUMN_END;
    }
  }

  /**
   * Get the coordinates of the comment. Optionally set them as the `offset` or `roughOffset`
   * property. Also set the {@link Comment#isStartStretched isStartStretched} and
   * {@link Comment#isEndStretched isEndStretched} properties (if `options.considerFloating` is
   * `true`).
   *
   * Note that comment coordinates are not static, obviously, but we need to recalculate them only
   * occasionally.
   *
   * @param {object} [options={}]
   * @param {object} [options.floatingRects]
   *   {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect Element#getBoundingClientRect}
   *   results for floating elements from `convenientDiscussions.g.floatingElements`. It may be
   *   calculated in advance for many elements in one sequence to save time.
   * @param {boolean} [options.considerFloating] Whether to take floating elements around the
   *   comment into account. Deemed `true` if `options.floatingRects` is set.
   * @param {boolean} [options.set=false] Whether to set the offset to the `offset` (if
   *   `options.considerFloating` is `true`) or `roughOffset` (if `options.considerFloating` is
   *   `false`) property. If `true`, the function will return a boolean value indicating if the
   *   comment is moved instead of the offset. Setting the `offset` property implies that the layers
   *   offset will be updated afterwards - otherwise, the next attempt to call this method to update
   *   the layers offset will return `false` meaning the comment isn't moved, and the layers offset
   *   will stay wrong.
   * @returns {?(CommentOffset|boolean)} Offset object. If the comment is not visible,
   *   returns `null`. If `options.set` is `true`, returns a boolean value indicating if the comment
   *   is moved instead of the offset.
   * @private
   */
  getOffset(options = {}) {
    if (options.considerFloating === undefined) {
      options.considerFloating = Boolean(options.floatingRects);
    }
    if (options.set === undefined) {
      options.set = false;
    }

    if (this.editForm) {
      this.setOffsetProperty(null, options);
      return null;
    }

    let rectTop = getCommentPartRect(this.highlightables[0]);
    let rectBottom = this.elements.length === 1 ?
      rectTop :
      getCommentPartRect(this.highlightables[this.highlightables.length - 1]);

    if (!getVisibilityByRects(rectTop, rectBottom)) {
      this.setOffsetProperty(null, options);
      return null;
    }

    // Seems like caching this value significantly helps performance at least in Chrome. But need to
    // be sure the viewport can't jump higher when it is at the bottom point of the page after some
    // content starts to occupy less space.
    const scrollY = window.scrollY;

    let isMoved;
    if (this.offset) {
      const isTopSame = scrollY + rectTop.top === this.offset.top;
      const isHeightSame = rectBottom.bottom - rectTop.top === this.offset.bottom - this.offset.top;
      const isFhWidthSame = this.highlightables[0].offsetWidth === this.firstHighlightableWidth;

      // This value will be `true` wrongly if the comment is around floating elements. But that
      // doesn't hurt much.
      isMoved = !isTopSame || !isHeightSame || !isFhWidthSame;
    } else {
      isMoved = true;
    }

    if (!isMoved) {
      // If floating elements aren't supposed to be taken into account but the comment isn't moved,
      // we still set/return the offset with floating elements taken into account because that
      // shouldn't do any harm.
      if (options.set && !options.considerFloating) {
        this.roughOffset = this.offset;
      }

      return options.set ? false : this.offset;
    }

    // This is to determine if the element is moved in future checks.
    this.firstHighlightableWidth = this.highlightables[0].offsetWidth;

    const top = scrollY + rectTop.top;
    const bottom = scrollY + rectBottom.bottom;

    if (options.considerFloating) {
      [rectTop, rectBottom] = this
        .getAdjustedRects(rectTop, rectBottom, bottom, options.floatingRects);
    }

    const scrollX = window.scrollX;
    const left = scrollX + Math.min(rectTop.left, rectBottom.left);
    const right = scrollX + Math.max(rectTop.right, rectBottom.right);

    if (options.considerFloating) {
      this.setStretchedProperties(left, right);
    }

    // A solution for comments that have the height bigger than the viewport height. In Chrome, the
    // scrolling step is 100 pixels.
    const downplayedBottom = bottom - top > (window.innerHeight - 200) ?
      top + (window.innerHeight - 200) :
      bottom;

    const offset = { top, bottom, left, right, downplayedBottom };
    this.setOffsetProperty(offset, options);

    return options.set ? true : offset;
  }

  /**
   * Get the comment text direction. It can be different from the text direction of the site's
   * content language on pages with text marked with the class `mw-content-ltr` or `mw-content-rtl`
   * inside the content.
   *
   * @returns {string}
   */
  getDir() {
    if (!this.cachedDir) {
      if (cd.g.areThereLtrRtlMixes) {
        // Take the last element because the first one may be the section heading which can have
        // another direction.
        const isLtr = this.elements[this.elements.length - 1]
          .closest('.mw-content-ltr, .mw-content-rtl')
          .classList
          .contains('mw-content-ltr');
        this.cachedDir = isLtr ? 'ltr' : 'rtl';
      } else {
        this.cachedDir = cd.g.CONTENT_DIR;
      }
    }

    return this.cachedDir;
  }

  /**
   * @typedef {object} CommentMargins
   * @property {number} left Left margin.
   * @property {number} right Right margin.
   * @global
   * @private
   */

  /**
   * Get the left and right margins of the comment layers or the expand note.
   * {@link Comment#isStartStretched isStartStretched} and
   * {@link Comment#isEndStretched isEndStretched} should have already been set.
   *
   * @returns {CommentMargins}
   */
  getMargins() {
    let startMargin;
    if (this.ahContainerListType === 'ol') {
      // "this.highlightables.length === 1" is a workaround for cases such as
      // https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#202005160911_Example.
      startMargin = this.highlightables.length === 1 ?
        cd.g.CONTENT_FONT_SIZE * 3.2 :
        cd.g.CONTENT_FONT_SIZE * 2.2 - 1;
    } else if (this.isStartStretched) {
      startMargin = cd.g.CONTENT_START_MARGIN;
    } else {
      const anchorElement = this.isCollapsed ? this.thread.expandNote : this.anchorHighlightable;
      if (
        ['DD', 'LI'].includes(anchorElement.tagName) &&
        anchorElement.parentNode.classList.contains('cd-commentLevel')
      ) {
        startMargin = -1;
      } else {
        startMargin = this.level === 0 ? cd.g.COMMENT_FALLBACK_SIDE_MARGIN : cd.g.CONTENT_FONT_SIZE;
      }
    }
    const endMargin = this.isEndStretched ?
      cd.g.CONTENT_START_MARGIN :
      cd.g.COMMENT_FALLBACK_SIDE_MARGIN;

    const left = this.getDir() === 'ltr' ? startMargin : endMargin;
    const right = this.getDir() === 'ltr' ? endMargin : startMargin;

    return { left, right };
  }

  /**
   * Calculate the underlay and overlay offset and set it to the instance as the `layersOffset`
   * property.
   *
   * @param {object} [options={}]
   * @returns {?boolean} Is the comment moved. `null` if it is invisible.
   * @private
   */
  setLayersOffsetProperty(options = {}) {
    const layersContainerOffset = this.getLayersContainerOffset();
    if (!layersContainerOffset) {
      return null;
    }

    const isMoved = this.getOffset(Object.assign({}, options, {
      considerFloating: true,
      set: true,
    }));

    if (this.offset) {
      const margins = this.getMargins();
      this.layersOffset = {
        top: this.offset.top - layersContainerOffset.top,
        left: this.offset.left - margins.left - layersContainerOffset.left,
        width: (this.offset.right + margins.right) - (this.offset.left - margins.left),
        height: this.offset.bottom - this.offset.top,
      };
    } else {
      this.layersOffset = null;
    }

    return isMoved;
  }

  /**
   * Create the comment's underlay and overlay with contents.
   *
   * @fires commentLayersCreated
   * @private
   */
  createLayers() {
    this.underlay = elementPrototypes.underlay.cloneNode(true);
    Comment.underlays.push(this.underlay);

    this.overlay = elementPrototypes.overlay.cloneNode(true);
    this.line = this.overlay.firstChild;
    this.marker = this.overlay.firstChild.nextSibling;

    if (!cd.settings.reformatComments) {
      this.overlayInnerWrapper = this.overlay.lastChild;
      this.overlayGradient = this.overlayInnerWrapper.firstChild;
      this.overlayMenu = this.overlayInnerWrapper.lastChild;

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

      this.createGoToParentButton();
      this.createCopyLinkButton();
      this.createThankButton();
      this.createEditButton();
      this.createReplyButton();
    }

    this.updateLayersStyles(true);

    /**
     * Comment's underlay.
     *
     * @type {?(external:jQuery|undefined)}
     */
    this.$underlay = $(this.underlay);

    /**
     * Comment's overlay.
     *
     * @type {?(external:jQuery|undefined)}
     */
    this.$overlay = $(this.overlay);

    /**
     * Comment's side marker.
     *
     * @type {external:jQuery|undefined}
     */
    this.$marker = $(this.marker);

    if (!cd.settings.reformatComments) {
      /**
       * Menu element in the comment's overlay.
       *
       * @type {external:jQuery|undefined}
       */
      this.$overlayMenu = $(this.overlayMenu);

      /**
       * Gradient element in the comment's overlay.
       *
       * @type {external:jQuery|undefined}
       */
      this.$overlayGradient = $(this.overlayGradient);
    }

    /**
     * Comment layers have been created for a comment.
     *
     * @event commentLayersCreated
     * @param {Comment} comment
     * @param {object} cd {@link convenientDiscussions} object.
     */
    mw.hook('convenientDiscussions.commentLayersCreated').fire(this, cd);
  }

  /**
   * Set classes to the underlay, overlay, and other elements according to a type.
   *
   * @param {string} type
   * @param {*} add
   * @private
   */
  updateClassesForType(type, add) {
    add = Boolean(add);
    if (this.underlay.classList.contains(`cd-comment-underlay-${type}`) !== add) {
      this.underlay.classList.toggle(`cd-comment-underlay-${type}`, add);
      this.overlay.classList.toggle(`cd-comment-overlay-${type}`, add);

      if (type === 'deleted') {
        this.replyButton?.setDisabled(add);
        this.editButton?.setDisabled(add);
      } else if (type === 'hovered' && !add) {
        this.overlayInnerWrapper.style.display = '';
      }
    }
  }

  /**
   * Update the styles of the layers according to the comment's properties.
   *
   * @param {boolean} [wereJustCreated=false] Were the layers just created.
   * @private
   */
  updateLayersStyles(wereJustCreated = false) {
    if (!this.underlay) return;

    this.updateClassesForType('new', this.isNew);
    this.updateClassesForType('own', this.isOwn);
    this.updateClassesForType('deleted', this.isDeleted);

    if (wereJustCreated) {
      if (this.isLineGapped) {
        this.line.classList.add('cd-comment-overlay-line-closingGap');
      }
      if (this.isStartStretched) {
        this.overlay.classList.add('cd-comment-overlay-stretchedStart');
      }
      if (this.isEndStretched) {
        this.overlay.classList.add('cd-comment-overlay-stretchedEnd');
      }
    }
  }

  /**
   * Add the underlay and overlay if they are missing, update their styles, recalculate their offset
   * and redraw if the comment has been moved or do nothing if everything is right.
   *
   * @param {object} [options={}]
   * @param {boolean} [options.add=true] Add the layers in case they are created. If set to `false`,
   *   it is expected that the layers created during this procedure, if any, will be added
   *   afterwards (otherwise there would be layers without a parent element which would lead to
   *   bugs).
   * @param {boolean} [options.update=true] Update the layers' offset in case the comment is moved.
   *   If set to `false`, it is expected that the offset will be updated afterwards.
   * @param {object} [options.floatingRects]
   *   {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect Element#getBoundingClientRect}
   *   results for floating elements from `convenientDiscussions.g.floatingElements`. It may be
   *   calculated in advance for many elements in one sequence to save time.
   * @param {boolean} [options.considerFloating] Whether to take floating elements around the
   *   comment into account. Deemed `true` if `options.floatingRects` is set.
   * @returns {?boolean} Is the comment moved or created. `null` if we couldn't determine (for
   *   example, if the element is invisible).
   */
  configureLayers(options = {}) {
    if (options.add === undefined) {
      options.add = true;
    }
    if (options.update === undefined) {
      options.update = true;
    }

    const isMoved = this.setLayersOffsetProperty(options);
    if (isMoved === null) {
      return null;
    }

    // Configure the layers only if they were unexistent or the comment position has changed, to
    // save time.
    if (this.underlay) {
      this.updateLayersStyles();
      if (isMoved && options.update) {
        this.updateLayersOffset();
      }
      return isMoved;
    } else {
      this.createLayers();
      if (options.add) {
        this.addLayers();
      }
      return true;
    }
  }

  /**
   * Add the (already existent) comment's layers to the DOM.
   *
   * @private
   */
  addLayers() {
    if (!this.underlay) return;

    this.updateLayersOffset();
    this.getLayersContainer().appendChild(this.underlay);
    this.getLayersContainer().appendChild(this.overlay);
  }

  /**
   * Transfer the `layers(Top|Left|Width|Height)` values to the style of the layers.
   *
   * @private
   */
  updateLayersOffset() {
    // The underlay can be absent if called from Comment.redrawLayersIfNecessary with redrawAll set
    // to true.
    if (!this.underlay) return;

    this.underlay.style.top = this.overlay.style.top = this.layersOffset.top + 'px';
    this.underlay.style.left = this.overlay.style.left = this.layersOffset.left + 'px';
    this.underlay.style.width = this.overlay.style.width = this.layersOffset.width + 'px';
    this.underlay.style.height = this.overlay.style.height = this.layersOffset.height + 'px';
  }

  /**
   * Remove the comment's layers.
   */
  removeLayers() {
    if (!this.underlay) return;

    this.$animatedBackground?.add(this.$marker).stop(true, true);
    Comment.underlays.splice(Comment.underlays.indexOf(this.underlay), 1);

    this.underlay.remove();
    this.underlay = null;
    this.$underlay = null;

    this.overlay.remove();
    this.overlay = null;
    this.$overlay = null;

    this.isHovered = false;
  }

  /**
   * Get and sometimes create the container for the comment's layers.
   *
   * @returns {Element}
   * @private
   */
  getLayersContainer() {
    if (this.cachedLayersContainer === undefined) {
      let offsetParent;

      // Use the last element, as in Comment#getDir().
      const lastElement = this.elements[this.elements.length - 1];
      const treeWalker = new TreeWalker(document.body, null, true, lastElement);

      while (treeWalker.parentNode()) {
        const node = treeWalker.currentNode;

        // These elements have "position: relative" for the purpose we know.
        if (node.classList.contains('cd-connectToPreviousItem')) continue;

        let style = node.conveneintDiscussionsStyle;
        if (!style) {
          // window.getComputedStyle is expensive, so we save the result to the node's property.
          style = window.getComputedStyle(node);
          node.conveneintDiscussionsStyle = style;
        }
        const classList = Array.from(node.classList);
        if (
          ['absolute', 'relative'].includes(style.position) ||
          (
            node !== cd.g.$content.get(0) &&
            (classList.includes('mw-content-ltr') || classList.includes('mw-content-rtl'))
          )
        ) {
          offsetParent = node;
        }
        const backgroundColor = style.backgroundColor;
        if (backgroundColor.includes('rgb(') || style.backgroundImage !== 'none' && !offsetParent) {
          offsetParent = node;
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

      addToArrayIfAbsent(Comment.layersContainers, container);
    }
    return this.cachedLayersContainer;
  }

  /**
   * @typedef {object} LayersContainerOffset
   * @property {number} top Top offset.
   * @property {number} left Left offset.
   * @global
   * @private
   */

  /**
   * Get the top and left offset of the layers container.
   *
   * @returns {?LayersContainerOffset}
   * @private
   */
  getLayersContainerOffset() {
    const container = this.getLayersContainer();
    let top = container.cdCachedLayersContainerTop;
    let left = container.cdCachedLayersContainerLeft;
    if (top === undefined || container.cdCouldHaveMoved) {
      const rect = container.getBoundingClientRect();
      if (!getVisibilityByRects(rect)) {
        return null;
      }
      top = rect.top + window.scrollY;
      left = rect.left + window.scrollX;
      container.cdCouldHaveMoved = false;
      container.cdCachedLayersContainerTop = top;
      container.cdCachedLayersContainerLeft = left;
    }
    return { top, left };
  }

  /**
   * Highlight the comment when it is hovered.
   *
   * @param {Event} e
   */
  highlightHovered(e) {
    if (this.isHovered || isPageOverlayOn() || cd.settings.reformatComments) return;

    if (e && e.type === 'touchstart') {
      cd.comments
        .filter((comment) => comment.isHovered)
        .forEach((comment) => {
          comment.unhighlightHovered();
        });
    }

    // Animation will be directed to wrong properties if we keep it going.
    this.$animatedBackground?.stop(true, true);

    const isMoved = this.configureLayers();

    // Add classes if the comment isn't moved. If it is moved, the layers are removed and created
    // again when the next event fires.
    if (isMoved || !this.underlay) return;

    this.updateClassesForType('hovered', true);
    this.isHovered = true;
  }

  /**
   * Unhighlight the comment when it has lost focus.
   */
  unhighlightHovered() {
    if (!this.isHovered || cd.settings.reformatComments) return;

    // Animation will be directed to wrong properties if we keep it going.
    this.$animatedBackground?.stop(true, true);

    this.updateClassesForType('hovered', false);
    this.isHovered = false;
  }

  /**
   * Animate the comment's background and marker color to the provided colors. (Called from
   * {@link Comment#animateBack}.)
   *
   * @param {string} markerColor
   * @param {string} backgroundColor
   * @param {Function} callback Function to run when the animation is concluded.
   * @private
   */
  animateToColors(markerColor, backgroundColor, callback) {
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

    const finalMarkerProperties = generateProperties(markerColor);
    this.$marker.animate(finalMarkerProperties, 400, 'swing', () => {
      this.$marker.css(propertyDefaults);
    });

    const comment = this;
    const finalBackgroundProperties = generateProperties(backgroundColor);
    this.$animatedBackground.animate(finalBackgroundProperties, 400, 'swing', function () {
      if (this !== comment.$animatedBackground.get(-1)) return;

      if (callback) {
        callback();
      }
      comment.$animatedBackground.add(comment.$overlayGradient).css(propertyDefaults);
    });
  }

  /**
   * Animate the comment's background and marker color back from the colors of a given type.
   *
   * @param {string} type
   * @param {Function} callback
   * @private
   */
  animateBack(type, callback) {
    this.animateBackBound = null;

    if (!this.$underlay?.parent().length) {
      if (callback) {
        callback();
      }
      return;
    }

    // Get the current colors
    const initialMarkerColor = this.$marker.css('background-color');
    const initialBackgroundColor = this.$underlay.css('background-color');

    // Reset the classes that produce these colors
    this.updateClassesForType(type, false);

    // Get the final (destination) colors
    const finalMarkerColor = this.$marker.css('background-color');
    let finalBackgroundColor = this.$underlay.css('background-color');

    // That's basically if the flash color is green (when a comment is changed after an edit) and
    // the comment itself is green. We animate to transparent, then set green back, so that there is
    // any animation at all.
    if (finalBackgroundColor === initialBackgroundColor) {
      finalBackgroundColor = 'rgba(0, 0, 0, 0)';
    }

    // Set back the colors previously produced by classes
    this.$marker.css({
      backgroundColor: initialMarkerColor,
      opacity: 1,
    });
    this.$animatedBackground.css({ backgroundColor: initialBackgroundColor })
    this.$overlayGradient?.css({ backgroundImage: 'none' });

    this.animateToColors(finalMarkerColor, finalBackgroundColor, callback);
  }

  /**
   * Change the comment's background and marker color to a color of the provided comment type for
   * the given number of milliseconds, then smoothly change it back.
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

    if (this.animateBackBound) {
      clearTimeout(this.unhighlightTimeout);
      this.animateBackBound();
    }

    /**
     * Comment underlay and menu, whose colors are animated in some events.
     *
     * @type {external:jQuery|undefined}
     */
    this.$animatedBackground = this.$underlay.add(this.$overlayMenu);

    // Reset animations and colors
    this.$animatedBackground.add(this.$marker).stop(true, true);

    this.updateClassesForType(type, true);

    this.animateBackBound = this.animateBack.bind(this, type, callback);
    this.unhighlightTimeout = setTimeout(this.animateBackBound, delay);
  }

  /**
   * Flash the comment as a target (it is opened by a link, just posted, is the target of the
   * up/down comment buttons, or is scrolled to after pressing a navigation panel button).
   */
  flashTarget() {
    this.isTarget = true;

    // We don't take the color from cd.g.COMMENT_TARGET_COLOR as it may be overriden by the user in
    // their personal CSS.
    this.flash('target', 1750, () => {
      this.isTarget = false;
    });
  }

  /**
   * Flash the comment as changed and add it to the seen rendered edits list kept in the local
   * storage.
   */
  flashChanged() {
    this.willFlashChangedOnSight = false;

    // Use the "changed" type, not "new", to get the "cd-comment-underlay-changed" class that helps
    // to set background if the user has switched off background highlighting for new comments.
    this.flash('changed', 1000);

    if (this.isChanged) {
      const seenRenderedChanges = getFromLocalStorage('seenRenderedChanges');
      const articleId = mw.config.get('wgArticleId');
      seenRenderedChanges[articleId] = seenRenderedChanges[articleId] || {};
      seenRenderedChanges[articleId][this.anchor] = {
        comparedHtml: this.comparedHtml,
        seenUnixTime: Date.now(),
      };
      saveToLocalStorage('seenRenderedChanges', seenRenderedChanges);
    }

    maybeMarkPageAsRead();
  }

  /**
   * Flash the comment as changed when it appears in sight.
   */
  flashChangedOnSight() {
    this.willFlashChangedOnSight = true;
    if (!document.hidden && this.isInViewport()) {
      this.flashChanged();
    }
  }

  /**
   * Show a diff of changes in the comment between the current revision ID and the provided one.
   *
   * @param {number} comparedRevisionId
   * @param {object} commentsData
   * @throws {CdError}
   * @private
   */
  async showDiff(comparedRevisionId, commentsData) {
    if (dealWithLoadingBug('mediawiki.diff.styles')) return;

    let revisionIdLesser = Math.min(mw.config.get('wgRevisionId'), comparedRevisionId);
    let revisionIdGreater = Math.max(mw.config.get('wgRevisionId'), comparedRevisionId);

    const revisionsRequest = cd.g.mwApi.post({
      action: 'query',
      revids: [revisionIdLesser, revisionIdGreater],
      prop: 'revisions',
      rvslots: 'main',
      rvprop: ['ids', 'content'],
      redirects: !mw.config.get('wgIsRedirect'),
    }).catch(handleApiReject);

    const compareRequest = cd.g.mwApi.post({
      action: 'compare',
      fromtitle: this.getSourcePage().name,
      fromrev: revisionIdLesser,
      torev: revisionIdGreater,
      prop: ['diff'],
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
    if (body === undefined) {
      throw new CdError({
        type: 'api',
        code: 'noData',
      });
    }

    const $diff = $(wrapDiffBody(body));
    const currentLineNumbers = [];
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
    const $cleanDiff = $(wrapDiffBody(cleanDiffBody));
    if (!$cleanDiff.find('.diff-deletedline, .diff-addedline').length) {
      throw new CdError({
        type: 'parse',
        message: cd.sParse('comment-diff-empty'),
      });
    }

    const $fullDiffLink = $('<a>')
      .attr('href', this.getSourcePage().getUrl({
        oldid: revisionIdLesser,
        diff: revisionIdGreater,
      }))
      .attr('target', '_blank')
      .text(cd.s('comment-diff-full'));
    const $historyLink = $('<a>')
      .attr('href', this.getSourcePage().getUrl({ action: 'history' }))
      .attr('target', '_blank')
      .text(cd.s('comment-diff-history'));
    const $below = $('<div>')
      .addClass('cd-commentDiffView-below')
      .append($fullDiffLink, cd.sParse('dot-separator'), $historyLink);

    const $message = $('<div>').append($cleanDiff, $below);
    OO.ui.alert($message, {
      title: cd.s('comment-diff-title'),
      size: 'larger',
    });
  }

  /**
   * Update the comment's properties, add a small text next to the signature saying the comment has
   * been changed or deleted, and change the comment's styling if it has been.
   *
   * @param {string} type Type of the mark: `'changed'`, `'changedSince'`, or `'deleted'`.
   * @param {boolean} [isNewVersionRendered] Has the new version of the comment been rendered.
   * @param {number} [comparedRevisionId] ID of the revision to compare with when the user clicks to
   *   see the diff.
   * @param {string} [commentsData] Data of the comments as of the current revision and the revision
   *   to compare with.
   */
  markAsChanged(type, isNewVersionRendered, comparedRevisionId, commentsData) {
    let stringName;
    switch (type) {
      case 'changed':
      default:
        this.isChanged = true;
        stringName = 'comment-changed';
        break;

      case 'changedSince':
        this.isChangedSincePreviousVisit = true;
        stringName = 'comment-changedsince';
        break;

      case 'deleted':
        this.isDeleted = true;
        stringName = 'comment-deleted';
        break;
    }

    let refreshLink;
    if (!isNewVersionRendered) {
      const passedData = type === 'deleted' ? {} : { commentAnchor: this.anchor };
      refreshLink = new Button({
        label: cd.s('comment-changed-refresh'),
        action: () => {
          reloadPage(passedData);
        },
      })
    }

    let diffLink;
    if (type !== 'deleted' && this.getSourcePage().name === cd.page.name) {
      diffLink = new Button({
        label: cd.s('comment-diff'),
        action: async () => {
          diffLink.setPending(true);
          try {
            await this.showDiff(comparedRevisionId, commentsData);
          } catch (e) {
            let text = cd.sParse('comment-diff-error');
            if (e instanceof CdError) {
              const { type, message } = e.data;
              if (message) {
                text = message;
              } else if (type === 'network') {
                text += ' ' + cd.sParse('error-network');
              }
            }
            mw.notify(wrap(text), { type: 'error' });
          }
          diffLink.setPending(false);
        },
      });
    }

    let refreshLinkSeparator;
    let diffLinkSeparator;
    if (cd.settings.reformatComments) {
      stringName += '-short';
      refreshLinkSeparator = diffLinkSeparator = cd.sParse('dot-separator');
    } else {
      refreshLinkSeparator = ' ';
      diffLinkSeparator = refreshLink ? cd.sParse('dot-separator') : ' ';
    }

    $(this.highlightables)
      .find('.cd-changeMark')
      .remove();

    const $changeMark = $('<span>')
      .addClass('cd-changeMark')
      .text(cd.s(stringName));
    if (refreshLink) {
      $changeMark.append(refreshLinkSeparator, refreshLink.element);
    } else {
      $changeMark.addClass('cd-changeMark-newVersionRendered');
    }
    if (diffLink) {
      $changeMark.append(diffLinkSeparator, diffLink.element);
    }

    if (cd.settings.reformatComments) {
      this.$header.append($changeMark);
    } else {
      // Add the mark to the last block element, going as many nesting levels down as needed to
      // avoid it appearing after a block element.
      let $last;
      let $tested = $(this.highlightables).last();
      do {
        $last = $tested;
        $tested = $last.children().last();
      } while ($tested.length && !isInline($tested.get(0)));

      if (!$last.find('.cd-beforeChangeMark').length) {
        const $before = $('<span>').addClass('cd-beforeChangeMark');
        $last.append(' ', $before);
      }
      $last.append($changeMark);
    }

    if (isNewVersionRendered) {
      this.flashChangedOnSight();
    }

    // Layers are supposed to be updated (deleted comments background, repositioning) separately,
    // see updateChecker~checkForNewChanges, for example.
  }

  /**
   * Update the comment's properties, remove the edit mark added in {@link Comment#markAsChanged}
   * and flash the comment as changed if it has been (reset to the original version, or unchanged,
   * in this case).
   *
   * @param {string} type Type of the mark: `'changed'` or `'deleted'`.
   */
  unmarkAsChanged(type) {
    switch (type) {
      case 'changed':
      default:
        this.isChanged = false;
        break;
      case 'deleted':
        this.isDeleted = false;

        // `Comment.redrawLayersIfNecessary()`, that is called on DOM updates, could circumvent this
        // comment if it has no property signalling that it should be highlighted, so we update its
        // styles manually.
        this.updateLayersStyles();

        break;
    }

    this.$elements
      .last()
      .find('.cd-changeMark')
      .remove();

    if (type === 'changed') {
      // The change was reverted and the user hasn't seen the change - no need to flash the comment.
      if (this.willFlashChangedOnSight) {
        this.willFlashChangedOnSight = false;
        maybeMarkPageAsRead();
      } else {
        const seenRenderedChanges = getFromLocalStorage('seenRenderedChanges');
        const articleId = mw.config.get('wgArticleId');
        seenRenderedChanges[articleId] = seenRenderedChanges[articleId] || {};
        delete seenRenderedChanges[articleId][this.anchor];
        saveToLocalStorage('seenRenderedChanges', seenRenderedChanges);

        this.flashChangedOnSight();
      }
    }
  }

  /**
   * _For internal use._ Update the comment's content.
   *
   * @param {object} currentComment Data about the comment in the current revision as delivered by
   *   the worker.
   * @param {object} newComment Data about the comment in the new revision as delivered by the
   *   worker.
   * @returns {boolean} Was the update successful.
   */
  update(currentComment, newComment) {
    const elementNames = Array.from(this.$elements).map((el) => el.tagName);

    // References themselves may be out of the comment's HTML and might be edited.
    const areThereReferences = newComment.hiddenElementsData
      .some((data) => data.type === 'reference');

    // If a style element is replaced with a link element, we can't replace HTML.
    const areStyleTagsKept = (
      !newComment.hiddenElementsData.length ||
      (
        newComment.hiddenElementsData.every((data) => (
          data.type !== 'templateStyles' ||
          data.tagName === 'STYLE'
        )) ||
        currentComment.hiddenElementsData.every((data) => (
          data.type !== 'templateStyles' ||
          data.tagName !== 'STYLE'
        ))
      )
    );

    if (
      !areThereReferences &&
      areStyleTagsKept &&
      areObjectsEqual(elementNames, newComment.elementNames)
    ) {
      const match = this.$elements.find('.autonumber').text().match(/\d+/);
      let currentAutonumber = match ? match[0] : 1;
      newComment.elementHtmls.forEach((html, i) => {
        html = html.replace(
          /\x01(\d+)_\w+\x02/g,
          (s, num) => newComment.hiddenElementsData[num - 1].html
        );
        if (/^H[1-6]$/.test(elementNames[i])) {
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
              if (cd.settings.modifyToc) {
                section.getTocItem()?.replaceText($html);
              }
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
      this.$elements.attr('data-comment-id', this.id);

      if (cd.settings.reformatComments) {
        this.signatureElement = this.$elements.find('.cd-signature').get(0);
        this.replaceSignatureWithHeader();
        this.addMenu();
      } else {
        this.timestampElement = this.$elements.find('.cd-timestamp').get(-1);
        this.reformatTimestamp();
      }

      mw.hook('wikipage.content').fire(this.$elements);

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
   * Scroll to the comment and (by default) flash it as a target.
   *
   * @param {boolean} [smooth=true] Use a smooth animation.
   * @param {boolean} [pushState=false] Whether to push a state to the history with the comment
   *   anchor as a fragment.
   * @param {boolean} [flash=true] Whether to flash the comment as target.
   * @param {Function} [callback] Callback to run after the animation has completed.
   */
  scrollTo(smooth = true, pushState = false, flash = true, callback) {
    if (pushState) {
      const newState = Object.assign({}, history.state, { cdJumpedToComment: true });
      history.pushState(newState, '', '#' + this.anchor);
    }

    if (this.isCollapsed) {
      this.getVisibleExpandNote().cdScrollTo('top', smooth, callback);
      mw.notify(cd.s('navpanel-firstunseen-hidden'), {
        title: cd.s('navpanel-firstunseen-hidden-title'),
      });
    } else {
      const $elements = this.editForm ? this.editForm.$element : this.$elements;
      const alignment = this.isOpeningSection || this.editForm ? 'top' : 'center';
      if (callback) {
        callback();
      }
      $elements.cdScrollIntoView(alignment, smooth, callback);
      if (flash) {
        this.flashTarget();
      }
    }
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
    parent.configureLayers();

    if (!parent.goToChildButton) {
      parent.createGoToChildButton();
    }
    parent.goToChildButton.setAction(() => {
      this.scrollTo();
    });
  }

  /**
   * _For internal use._ Generate a JQuery object containing an edit summary, diff body, and link to
   * the next diff.
   *
   * @returns {Promise.<external:jQuery>}
   */
  async generateDiffView() {
    const edit = await this.findEditThatAdded();
    const diffLink = await this.getDiffLink();
    const $nextDiffLink = $('<a>')
      .addClass('cd-diffView-nextDiffLink')
      .attr('href', diffLink.replace(/&diff=(\d+)/, '&oldid=$1&diff=next'))
      .attr('target', '_blank')
      .text(cd.mws('nextdiff'));
    const $above = $('<div>').append($nextDiffLink);
    if (edit.parsedcomment) {
      const $summaryText = wrap(edit.parsedcomment, { targetBlank: true }).addClass('comment');
      $above.append(cd.sParse('cld-summary'), cd.mws('colon-separator'), $summaryText);
    }
    const $diffBody = wrapDiffBody(edit.diffBody);
    return $('<div>')
      .addClass('cd-diffView-diff')
      .append($above, $diffBody);
  }

  /**
   * Open a copy link dialog (rarely, copy a link to the comment without opening a dialog).
   *
   * @param {Event} e
   */
  async copyLink(e) {
    if (this.isLinkBeingCopied) return;
    this.copyLinkButton.setPending(true);
    await showCopyLinkDialog(this, e);
    this.copyLinkButton.setPending(false);
  }

  /**
   * Find the edit that added the comment.
   *
   * @returns {Promise.<object>}
   * @throws {CdError}
   * @private
   */
  async findEditThatAdded() {
    if (this.editThatAdded) {
      return this.editThatAdded;
    }

    // Search for the edit in the range of 10 minutes before (in case the comment was edited with
    // timestamp replaced) to 3 minutes later (rare occasion where the diff timestamp is newer than
    // the comment timestamp).
    const rvstart = new Date(this.date.getTime() - cd.g.MILLISECONDS_IN_MINUTE * 10).toISOString();
    const rvend = new Date(this.date.getTime() + cd.g.MILLISECONDS_IN_MINUTE * 3).toISOString();
    const revisions = await this.getSourcePage().getArchivedPage().getRevisions({
      rvprop: ['ids', 'comment', 'parsedcomment', 'timestamp'],
      rvdir: 'newer',
      rvstart,
      rvend,
      rvuser: this.author.name,
      rvlimit: 500,
    });

    const compareRequests = revisions.map((revision) => cd.g.mwApi.post({
      action: 'compare',
      fromtitle: this.getSourcePage().getArchivedPage().name,
      fromrev: revision.revid,
      torelative: 'prev',
      prop: ['diff'],
    }).catch(handleApiReject));

    const compareResps = await Promise.all(compareRequests);

    // Only analyze added lines.
    const regexp = /<td colspan="2" class="diff-empty">&#160;<\/td>\s*<td class="diff-marker">\+<\/td>\s*<td class="diff-addedline"><div>(?!=)(.+?)<\/div><\/td>\s*<\/tr>/g;

    const commentEnding = cd.g.ARE_TIMESTAMPS_ALTERED ?
      this.timestamp :
      this.$signature.get(0).innerText;
    const commentFullText = this.getText(false) + ' ' + commentEnding;
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

      // Add 30 seconds to get better date proximity results since we don't see the seconds number.
      const thisCommentTimestamp = this.date.getTime() + (30 * 1000);

      const dateProximity = Math.abs(thisCommentTimestamp - timestamp);
      const fullTextWordOverlap = calculateWordOverlap(diffText, commentFullText);
      let wordOverlap = Math.max(fullTextWordOverlap, bestDiffPartWordOverlap);

      if (wordOverlap < 1 && diffOriginalText.includes('{{')) {
        try {
          const html = (await parseCode(diffOriginalText, { title: cd.page.name })).html;
          diffOriginalText = $('<div>').append(html).cdGetText();
        } catch {
          throw new CdError({
            type: 'parse',
          });
        }
        wordOverlap = calculateWordOverlap(diffOriginalText, commentFullText);
      }

      matches.push({ revision, wordOverlap, dateProximity });
    }

    const bestMatch = matches.sort((m1, m2) => (
      m1.wordOverlap === m2.wordOverlap ?
      m1.dateProximity - m2.dateProximity :
      m2.wordOverlap - m1.wordOverlap
    ))[0];
    if (!bestMatch) {
      throw new CdError({
        type: 'parse',
      });
    }

    // Cache a successful result.
    this.editThatAdded = bestMatch.revision;

    return this.editThatAdded;
  }

  /**
   * Get a diff link for the comment.
   *
   * @param {boolean} short Whether to return a short diff link.
   * @returns {Promise.<string>}
   */
  async getDiffLink(short) {
    const edit = await this.findEditThatAdded();
    if (short) {
      return `${cd.g.SERVER}/?diff=${edit.revid}`;
    } else {
      const urlEnding = decodeURI(cd.page.getArchivedPage().getUrl({ diff: edit.revid }));
      return `${cd.g.SERVER}${urlEnding}`;
    }
  }

  /**
   * Consider the comment thanked (rename the button and set other parameters).
   *
   * @private
   */
  setThanked() {
    this.thankButton
      .setPending(false)
      .setDisabled(true)
      .setLabel(cd.s('cm-thanked'))
      .setTooltip(cd.s('cm-thanked-tooltip'));
  }

  /**
   * Process thank error.
   *
   * @param {CdError|Error} e
   * @private
   */
  thankFail(e) {
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
    mw.notify(wrap(text, { targetBlank: true }), { type: 'error' });
    this.thankButton.setPending(false);
  }

  /**
   * Find the edit that added the comment, ask for a confirmation, and send a "thank you"
   * notification.
   */
  async thank() {
    if (dealWithLoadingBug('mediawiki.diff.styles')) return;

    this.thankButton.setPending(true);

    let genderRequest;
    if (cd.g.GENDER_AFFECTS_USER_STRING && this.author.isRegistered()) {
      genderRequest = getUserGenders([this.author]);
    }

    let edit;
    try {
      ([edit] = await Promise.all([
        this.findEditThatAdded(),
        genderRequest,
        mw.loader.using('mediawiki.diff.styles'),
      ].filter(defined)));
    } catch (e) {
      this.thankFail(e);
      return;
    }

    const url = this.getSourcePage().getArchivedPage().getUrl({ diff: edit.revid });
    const question = cd.sParse('thank-confirm', this.author.name, this.author, url);
    const $question = wrap(question, {
      tagName: 'div',
      targetBlank: true,
    });
    const $diff = await this.generateDiffView();
    const $content = $('<div>').append($question, $diff);
    if (await OO.ui.confirm($content, { size: 'larger' })) {
      try {
        await cd.g.mwApi.postWithEditToken(cd.g.mwApi.assertCurrentUser({
          action: 'thank',
          rev: edit.revid,
          source: cd.config.scriptCodeName,
        })).catch(handleApiReject);
      } catch (e) {
        this.thankFail(e);
        return;
      }

      mw.notify(cd.s('thank-success'));
      this.setThanked();

      thanks[edit.revid] = {
        anchor: this.anchor,
        text: this.getText(),
        thankUnixTime: Date.now(),
      };
      saveToLocalStorage('thanks', thanks);
    } else {
      this.thankButton.setPending(false);
    }
  }

  /**
   * Create a {@link Comment#replyForm reply form} for the comment.
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
   * Create an {@link Comment#editForm edit form} for the comment.
   *
   * @param {object|CommentForm} dataToRestore
   */
  edit(dataToRestore) {
    // We use a class here because there can be elements in the comment that are hidden from the
    // beginning and should stay so when reshowing the comment.
    this.$elements.addClass('cd-hidden');
    this.removeLayers();

    // "!this.editForm" check is in case the editing is initiated from a script of some kind (there
    // is no button to call it from CD when the form is displayed).
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
  }

  /**
   * Load the comment code.
   *
   * @throws {CdError|Error}
   */
  async getCode() {
    try {
      let useSectionCode = false;
      if (this.section && this.section.liveSectionNumber !== null) {
        try {
          await this.section.requestCode();
          useSectionCode = true;
        } catch (e) {
          if (e instanceof CdError && e.data.code === 'noSuchSection') {
            await this.getSourcePage().getCode();
          } else {
            throw e;
          }
        }
      } else {
        await this.getSourcePage().getCode();
      }
      this.locateInCode(useSectionCode);
    } catch (e) {
      if (e instanceof CdError) {
        throw new CdError(Object.assign({}, {
          message: cd.sParse('cf-error-getpagecode'),
        }, e.data));
      } else {
        throw e;
      }
    }
  }

  /**
   * Determine if the comment is in the viewport. Return `null` if we couldn't get the comment's
   * offset.
   *
   * @param {boolean} partially Return `true` even if only a part of the comment is in the viewport.
   * @param {object} [offset=this.getOffset()] Prefetched offset.
   * @returns {?boolean}
   */
  isInViewport(partially = false, offset = this.getOffset()) {
    if (!offset) {
      return null;
    }

    const viewportTop = window.scrollY + cd.g.BODY_SCROLL_PADDING_TOP;
    const viewportBottom = viewportTop + window.innerHeight;

    return partially ?
      offset.downplayedBottom > viewportTop && offset.top < viewportBottom :
      offset.top >= viewportTop && offset.downplayedBottom <= viewportBottom;
  }

  /**
   * Mark the comment as seen, and also {@link Comment#flash flash} comments that are set to flash.
   *
   * @param {string} [registerAllInDirection] Mark all comments in the forward (`'forward'`) or
   *   backward (`'backward'`) direction from this comment as seen.
   * @param {boolean} [flash=false] Whether to flash the comment as a target.
   */
  registerSeen(registerAllInDirection, flash = false) {
    const isInVewport = !registerAllInDirection || this.isInViewport();
    if (this.isSeen === false && isInVewport) {
      this.isSeen = true;
      if (flash) {
        this.flashTarget();
      }
    }

    if (this.willFlashChangedOnSight && isInVewport) {
      this.flashChanged();
    }

    const makesSenseToRegisterFurther = cd.comments
      .some((comment) => comment.isSeen || comment.willFlashChangedOnSight);
    if (registerAllInDirection && makesSenseToRegisterFurther) {
      const change = registerAllInDirection === 'backward' ? -1 : 1;
      const nextComment = cd.comments[this.id + change];
      if (nextComment && nextComment.isInViewport() !== false) {
        nextComment.registerSeen(registerAllInDirection, flash);
      }
    }
  }

  /**
   * Comment elements as a jQuery object.
   *
   * Uses a getter because elements of a comment can be altered after creating an instance, for
   * example with {@link Comment#replaceElement}. Using a getter also allows to save a little time
   * on running `$()`, although that alone is perhaps not enough to create it.
   *
   * @type {external:jQuery}
   */
  get $elements() {
    if (this.cached$elements === undefined) {
      this.cached$elements = $(this.elements);
    }
    return this.cached$elements;
  }

  // eslint-disable-next-line jsdoc/require-jsdoc
  set $elements(value) {
    this.cached$elements = value;
    this.elements = value.get();
  }

  /**
   * Replace an element that is one of the comment's elements with another element or HTML string.
   *
   * @param {Element|JQuery} element Element to replace. Provide a native element only if we're in
   *   the page processing phase (and {@link Comment#$elements} has not been requested, hence cached
   *   yet).
   * @param {Element|string} newElementOrHtml Element or HTML string to replace with.
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
      const selectorParts = ['.cd-signature', '.cd-changeMark'];
      if (cd.settings.reformatComments) {
        selectorParts.push('.cd-comment-header', '.cd-comment-menu');
      }
      if (cd.config.unsignedClass) {
        selectorParts.push(`.${cd.config.unsignedClass}`);
      }
      const selector = selectorParts.join(', ');
      $dummy.find(selector).remove();
      let text = $dummy.cdGetText();
      if (cleanUp) {
        if (cd.config.signatureEndingRegexp) {
          text = text.replace(cd.config.signatureEndingRegexp, '');
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
    let { code, originalIndentationChars } = this.inCode;

    let hidden;
    ({ code, hidden } = hideSensitiveCode(code));

    let text = code;

    if (this.level === 0) {
      // Collapse random line breaks that do not affect text rendering but will transform into <br>
      // on posting. \x01 and \x02 mean the beginning and ending of sensitive code except for
      // tables. \x03 and \x04 mean the beginning and ending of a table. Note: This should be kept
      // coordinated with the reverse transformation code in CommentForm#commentTextToCode. Some
      // more comments are there.
      const entireLineRegexp = new RegExp(/^(?:\x01\d+_(block|template).*\x02) *$/);
      const fileRegexp = new RegExp(`^\\[\\[${cd.g.FILE_PREFIX_PATTERN}.+\\]\\]$`, 'i');
      const currentLineEndingRegexp = new RegExp(
        `(?:<${cd.g.PNIE_PATTERN}(?: [\\w ]+?=[^<>]+?| ?\\/?)>|<\\/${cd.g.PNIE_PATTERN}>|\\x04|<br[ \\n]*\\/?>) *$`,
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
        s.replace(/<br[ \n]*\/?>(?![:*#;])\n? */gi, () => '\x01\n')
      ))

      // Templates occupying a whole line with <br> at the end get a special treatment too.
      .replace(/^((?:\x01\d+_template.*\x02) *)\x01$/gm, (s, m1) => m1 + '<br>')

      // Replace a temporary marker.
      .replace(/\x01\n/g, '\n')

      // Remove indentation characters
      .replace(/\n([:*#]*[:*])([ \t]*)/g, (s, chars, spacing) => {
        let newChars;
        if (chars.length >= originalIndentationChars.length) {
          newChars = chars.slice(originalIndentationChars.length);
          if (chars.length > originalIndentationChars.length) {
            newChars += spacing;
          }
        } else {
          newChars = chars + spacing;
        }
        return '\n' + newChars;
      });

    text = unhideText(text, hidden);

    if (cd.config.paragraphTemplates.length) {
      const paragraphTemplatesPattern = cd.config.paragraphTemplates
        .map(generatePageNamePattern)
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
   * When searching for the comment in the code, adjust the index of the comment start point and
   * some related properties.
   *
   * @param {object} originalData
   * @returns {object}
   * @private
   */
  adjustCommentBeginning({ code, startIndex }) {
    // Identifying indentation characters
    let originalIndentationChars = '';
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
      // to see the bug happening if we don't check for `this.isOpeningSection`.
      lineStartIndex = this.isOpeningSection ? headingStartIndex : startIndex;
    } else {
      // Exclude the text of the previous comment that is ended with 3 or 5 tildes instead of 4.
      [cd.config.signatureEndingRegexp, cd.g.TIMEZONE_REGEXP]
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
      // https://ru.wikipedia.org/w/index.php?oldid=110033693&section=6&action=edit (the regexp
      // doesn't catch the comment because of a newline inside the "syntaxhighlight" element).
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
    }

    // Exclude the indentation characters and any foreign code before them from the comment code.
    // Comments at the zero level sometimes start with ":" that is used to indent some side note.
    // It shouldn't be considered an indentation character.
    if (this.level > 0) {
      const replaceIndentationChars = (s, before, chars, after = '') => {
        if (typeof after === 'number') {
          after = '';
        }
        let remainder = '';
        let adjustedChars = chars;
        let startIndexShift = s.length;

        // We could just throw an error here, but instead will try to fix the markup.
        if (!before && code.includes('\n') && adjustedChars.endsWith('#')) {
          adjustedChars = adjustedChars.slice(0, -1);
          originalIndentationChars = adjustedChars;

          /*
            We can have this structure:
              : Comment. [signature]
              :# Item 1.
              :# Item 2.
              :: End of the comment. [signature]

            And we can have this:
              : Comment. [signature]
              ::# Item 1.
              ::# Item 2.
              :: End of the comment. [signature]

            The first is incorrect, and we need to add additional indentation for that case.
           */
          if (adjustedChars.length < this.level) {
            adjustedChars += ':';
          }
          startIndexShift -= 1 + after.length;

          remainder = '#' + after;
        } else {
          originalIndentationChars = chars;
        }

        indentationChars = adjustedChars;
        lineStartIndex = startIndex + before.length;
        startIndex += startIndexShift;
        return remainder;
      };

      code = code.replace(
        new RegExp(`^()${cd.config.indentationCharsPattern}`),
        replaceIndentationChars
      );

      // See the comment "Without the following code, the section introduction..." in Parser.js.
      // Dangerous case: the first section at
      // https://ru.wikipedia.org/w/index.php?oldid=105936825&action=edit. This was actually a
      // mistake to put a signature at the first level, but if it was legit, only the last sentence
      // should have been interpreted as the comment.
      if (indentationChars === '') {
        code = code.replace(
          new RegExp(`(^[^]*?\\n)${cd.config.indentationCharsPattern}(?![^]*\\n[^:*#])`),
          replaceIndentationChars
        );
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
      originalIndentationChars,
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
      /'+$/,
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
      end: /<\/small>[ \xa0\t]*$/,
    }];
    if (cd.config.smallDivTemplates.length) {
      smallWrappers.push({
        start: new RegExp(
          `^(?:\\{\\{(${cd.config.smallDivTemplates.join('|')})\\|(?: *1 *= *|(?![^{]*=)))`,
          'i'
        ),
        end: /\}\}[ \xa0\t]*$/,
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
    let replyIndentationChars = data.originalIndentationChars;
    if (!this.isOpeningSection) {
      // If the last line ends with "#", it's probably a numbered list _inside_ the comment, not two
      // comments in one, so we exclude such cases. The signature code is used because it may start
      // with a newline.
      const match = (data.code + data.signatureDirtyCode).match(/\n([:*#]*[:*]).*$/);
      if (match) {
        replyIndentationChars = match[1];

        // Cases where indentation characters on the first line don't denote a comment level but
        // serve some other purposes. Examples: https://en.wikipedia.org/?diff=998431486,
        // https://ru.wikipedia.org/w/index.php?diff=105978713 (this one is actually handled by
        // `replaceIndentationChars()` in Comment#adjustCommentBeginning).
        if (replyIndentationChars.length < data.originalIndentationChars.length) {
          // We better restore the original space or its absence here.
          const spaceOrNot = cd.config.spaceAfterIndentationChars ? ' ' : '';

          const prefix = (
            data.originalIndentationChars.slice(replyIndentationChars.length) +
            spaceOrNot
          );
          data.code = prefix + data.code;
          data.originalIndentationChars = data.originalIndentationChars
            .slice(0, replyIndentationChars.length);
          data.startIndex -= prefix.length;
        }
      }
    }
    replyIndentationChars += cd.config.defaultIndentationChar;
    data.replyIndentationChars = replyIndentationChars;

    return data;
  }

  /**
   * Search for the comment in the source code and return possible matches.
   *
   * @param {string} pageCode
   * @param {string} commentData
   * @param {boolean} isSectionCodeUsed
   * @returns {object}
   * @private
   */
  searchInCode(pageCode, commentData, isSectionCodeUsed) {
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

    let id;
    let previousComments;
    if (commentData) {
      id = commentData.id;

      // For the reserve method; the main method uses one date.
      previousComments = commentData.previousComments;
    } else {
      const comments = isSectionCodeUsed ? this.section.comments : cd.comments;
      id = comments.indexOf(this);
      previousComments = comments
        .slice(Math.max(0, id - 2), id)
        .reverse();
    }

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

      match.doesIdMatch = id === match.id;

      if (previousComments.length) {
        match.doesPreviousCommentsDataMatch = false;
        match.doesPreviousCommentDataMatch = false;

        for (let i = 0; i < previousComments.length; i++) {
          const signature = signatures[match.id - 1 - i];
          if (!signature) break;

          // At least one coincided comment is enough if the second is unavailable.
          match.doesPreviousCommentsDataMatch = (
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
            match.doesPreviousCommentDataMatch = match.doesPreviousCommentsDataMatch;
          }
          if (!match.doesPreviousCommentsDataMatch) break;
        }
      } else {
        // If there is no previous comment both on the page and in the code, it's a match.
        match.doesPreviousCommentsDataMatch = match.id === 0;
        match.doesPreviousCommentDataMatch = match.id === 0;
      }

      match.isPreviousCommentsDataEqual = Boolean(match.isPreviousCommentsDataEqual);
      Object.assign(match, this.adjustCommentBeginning(match));
      if (followsHeading) {
        match.doesHeadlineMatch = match.headingMatch ?
          normalizeCode(removeWikiMarkup(match.headlineCode)) === normalizeCode(sectionHeadline) :
          -5;
      } else {
        match.doesHeadlineMatch = !match.headingMatch;
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
          (id !== 0 && match.doesPreviousCommentsDataMatch && !match.isPreviousCommentsDataEqual) ||

          // There are always problems with first comments as there are no previous comments to
          // compare the signatures of and it's harder to tell the match, so we use a bit ugly
          // solution here, although it should be quite reliable: the comment's firstness, matching
          // author, date, and headline. A false negative will take place when the comment is no
          // longer first. Another option is to look for next comments, not for previous.
          (id === 0 && match.doesPreviousCommentsDataMatch && match.doesHeadlineMatch)
        ) * 2 +
        match.wordOverlap +
        match.doesHeadlineMatch * 1 +
        match.doesPreviousCommentsDataMatch * 0.5 +
        match.doesIdMatch * 0.0001
      );
    });
    matches = matches.filter((match) => match.score > 2.5);

    return matches;
  }

  /**
   * Locate the comment in the section or page source code and, if no `codeOrUseSectionCode` is
   * passed, set the results to the `inCode` property. Otherwise, return the result.
   *
   * It is expected that the section or page code is loaded (using {@link Page#getCode}) before this
   * method is called. Otherwise, the method will throw an error.
   *
   * @param {string|boolean} [codeOrUseSectionCode] Code that should have the comment (provided only
   *   if we need to perform operations on some code that is not the code of a section or page).
   *   Boolean `true` means to use the (prefetched) section code to locate the comment in.
   * @param {string} [commentData] Comment data for comparison (can be set together with `code`).
   * @returns {string|undefined}
   * @throws {CdError}
   */
  locateInCode(codeOrUseSectionCode, commentData) {
    let code;
    if (typeof codeOrUseSectionCode === 'string') {
      code = codeOrUseSectionCode;
    } else if (codeOrUseSectionCode === true) {
      code = this.section.code;
      this.inCode = null;
    } else {
      code = this.getSourcePage().code;
      this.inCode = null;
    }

    if (code === undefined) {
      throw new CdError({
        type: 'parse',
        code: 'noCode',
      });
    }

    const isSectionCodeUsed = codeOrUseSectionCode === true;
    const matches = this.searchInCode(code, commentData, isSectionCodeUsed);
    const bestMatch = matches.sort((m1, m2) => m2.score - m1.score)[0];
    if (!bestMatch) {
      throw new CdError({
        type: 'parse',
        code: 'locateComment',
      });
    }

    bestMatch.isSectionCodeUsed = isSectionCodeUsed;

    const inCode = this.adjustCommentCodeData(bestMatch);
    if (typeof codeOrUseSectionCode === 'string') {
      return inCode;
    } else {
      this.inCode = inCode;
    }
  }

  /**
   * Modify a section or page code string related to the comment in accordance with an action.
   *
   * @param {object} options
   * @param {string} options.action `'reply'` or `'edit'`.
   * @param {string} [options.commentCode] Comment code, including trailing newlines, indentation
   *   characters, and the signature. Can be not set if `doDelete` is `true`.
   * @param {boolean} [options.doDelete] Whether to delete the comment.
   * @param {string} [options.wholeCode] Code that has the comment. Usually not needed; provide it
   *   together with `thisInCode` only if you need to perform operations on some code that is not
   *   the code of a section or page).
   * @param {string} [options.thisInCode] Result of {@link Comment#locateInCode} called with code in
   *   the first parameter. Usually not needed; provide it together with `wholeCode` only if you
   *   need to perform operations on some code that is not the code of a section or page.
   * @returns {string} New code.
   * @throws {CdError}
   */
  modifyWholeCode({ action, commentCode, wholeCode, doDelete, thisInCode }) {
    thisInCode = thisInCode || this.inCode;
    if (!wholeCode) {
      wholeCode = thisInCode.isSectionCodeUsed ? this.section.code : this.getSourcePage().code;
    }

    let currentIndex;
    if (action === 'reply') {
      currentIndex = thisInCode.endIndex;

      let adjustedCode = hideDistractingCode(wholeCode);
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
          const codeBeforeMatch = adjustedCode.slice(0, match.index);
          const codeAfterMatch = adjustedCode.slice(match.index);
          const adjustedCam = hideTemplatesRecursively(codeAfterMatch, null, match[1].length).code;
          adjustedCode = codeBeforeMatch + adjustedCam;
        }
      }

      const adjustedCodeAfter = adjustedCode.slice(currentIndex);
      const nextSectionHeadingMatch = adjustedCodeAfter.match(/\n+(=+).*?\1[ \t\x01\x02]*\n|$/);
      let chunkCodeAfterEndIndex = currentIndex + nextSectionHeadingMatch.index + 1;
      let chunkCodeAfter = wholeCode.slice(currentIndex, chunkCodeAfterEndIndex);
      cd.g.KEEP_IN_SECTION_ENDING.forEach((regexp) => {
        const match = chunkCodeAfter.match(regexp);
        if (match) {
          // "1" accounts for the first line break.
          chunkCodeAfterEndIndex -= match[0].length - 1;
        }
      });
      const adjustedChunkCodeAfter = adjustedCode.slice(currentIndex, chunkCodeAfterEndIndex);

      if (/^ +\x02/.test(adjustedChunkCodeAfter)) {
        throw new CdError({
          type: 'parse',
          code: 'closed',
        });
      }

      const anySignaturePattern = (
        '^([^]*?(?:' +
        mw.util.escapeRegExp(thisInCode.signatureCode) +
        '|' +
        cd.g.CONTENT_TIMESTAMP_REGEXP.source +
        '.*' +
        (cd.g.UNSIGNED_TEMPLATES_PATTERN ? `|${cd.g.UNSIGNED_TEMPLATES_PATTERN}.*` : '') +

        // "\x01" is from hiding closed discussions and HTML comments. TODO: Line can start with a
        // HTML comment in a <pre> tag, that doesn't mean we can put a comment after it. We perhaps
        // need to change `wikitext.hideDistractingCode`.
        '|(?:^|\\n)\\x01.+)\\n)\\n*'
      );
      const maxIndentationCharsLength = thisInCode.replyIndentationChars.length - 1;
      const endOfThreadPattern = (
        '(?:' +

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
      const properPlaceRegexp = new RegExp(anySignaturePattern + endOfThreadPattern);
      let [, adjustedCodeBetween] = adjustedChunkCodeAfter.match(properPlaceRegexp) || [];

      if (adjustedCodeBetween === undefined) {
        adjustedCodeBetween = adjustedChunkCodeAfter;
      }

      if (cd.g.OUTDENT_TEMPLATES_REGEXP) {
        // If we met an "outdent" template, we insert our comment on the next line after the target
        // comment. That's the current logic; there could be a better one.
        const outdentMatch = adjustedChunkCodeAfter
          .slice(adjustedCodeBetween.length)
          .match(cd.g.OUTDENT_TEMPLATES_REGEXP);
        if (outdentMatch) {
          const [, outdentIndentationChars] = outdentMatch;
          if (
            !outdentIndentationChars ||
            outdentIndentationChars.length <= thisInCode.replyIndentationChars.length
          ) {
            const nextLineRegexp = new RegExp(anySignaturePattern);

            // If adjustedChunkCodeAfter matched properPlaceRegexp, should match nextLineRegexp too.
            const [, newAdjustedCodeBetween] = adjustedChunkCodeAfter.match(nextLineRegexp) || [];

            if (newAdjustedCodeBetween === adjustedCodeBetween) {
              // Can't insert a reply before an "outdent" template.
              throw new CdError({
                type: 'parse',
                code: 'findPlace',
              });
            } else {
              adjustedCodeBetween = newAdjustedCodeBetween;
            }
          }
        }
      }

      // Hotfix for comments inside a table (barnstars, for example).
      if (
        this.isInSingleCommentTable &&
        adjustedChunkCodeAfter.slice(adjustedCodeBetween.length).startsWith('|}\n')
      ) {
        adjustedCodeBetween += '|}\n';
      }

      // If the comment is to be put after a comment with different indentation characters, use
      // these.
      const changedIndentationCharsMatch = adjustedCodeBetween.match(/\n([:*#]{2,}|#[:*#]*).*\n$/);
      const [, changedIndentationChars] = changedIndentationCharsMatch || [];
      if (changedIndentationChars) {
        // Note the bug https://ru.wikipedia.org/w/index.php?diff=next&oldid=105529545 that was
        // possible here when we used `.slice(0, thisInCode.indentationChars.length + 1)` (due to
        // `**` as indentation characters in Bsivko's comment).
        thisInCode.replyIndentationChars = changedIndentationChars
          .slice(0, thisInCode.replyIndentationChars.length)
          .replace(/:$/, cd.config.defaultIndentationChar);
      }

      currentIndex += adjustedCodeBetween.length;
    }

    let newWholeCode;
    switch (action) {
      case 'reply': {
        const codeBefore = wholeCode.slice(0, currentIndex);
        const codeAfter = wholeCode.slice(currentIndex);
        newWholeCode = codeBefore + commentCode + codeAfter;
        break;
      }

      case 'edit': {
        if (doDelete) {
          let startIndex;
          let endIndex;
          if (this.isOpeningSection && thisInCode.headingStartIndex !== undefined) {
            if (!this.section.inCode) {
              this.section.locateInCode();
            }
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
            const succeedingText = wholeCode.slice(thisInCode.endIndex);

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

          newWholeCode = wholeCode.slice(0, startIndex) + wholeCode.slice(endIndex);
        } else {
          const startIndex = thisInCode.lineStartIndex;
          const codeBefore = wholeCode.slice(0, startIndex);
          const codeAfter = wholeCode.slice(thisInCode.signatureEndIndex);
          newWholeCode = codeBefore + commentCode + codeAfter;
        }
        break;
      }
    }

    return newWholeCode;
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
    return this.section ? this.section.getSourcePage() : cd.page;
  }

  /**
   * For a comment in a collapsed thread, get the visible collapsed note. (Collapsed threads may be
   * nested, so there can be a number of invisible collapsed notes for a comment.) If the visible
   * collapsed note is unavailable, return the top invisible collapsed note.
   *
   * @returns {?JQuery}
   * @private
   */
  getVisibleExpandNote() {
    if (!this.isCollapsed) {
      return null;
    }

    let $note;
    for (let t = this.collapsedThread; t; t = t.rootComment.getParent()?.collapsedThread) {
      $note = t.$expandNote;
      if ($note.is(':visible')) break;
    }
    return $note;
  }

  /**
   * Get a link to the comment with Unicode sequences decoded.
   *
   * @param {boolean} permanent Get a permanent URL.
   * @returns {string}
   */
  getUrl(permanent) {
    if (permanent) {
      return getUrlWithAnchor(this.anchor, true);
    } else {
      if (!this.cachedUrl) {
        this.cachedUrl = getUrlWithAnchor(this.anchor);
      }

      return this.cachedUrl;
    }
  }

  /**
   * @typedef {external:jQuery[]} AddSublevelItemReturn
   * @property {external:jQuery} $wrappingItem
   * @property {external:jQuery} [$wrappingList]
   * @property {external:jQuery} [$outerWrapper]
   * @global
   */

  /**
   * Add an item to the comment's {@link CommentSubitemList subitem list}.
   *
   * @param {string} name
   * @param {string} position
   * @returns {AddSublevelItemReturn}
   */
  addSublevelItem(name, position) {
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

    let wrappingItemTag = 'dd';
    let createList = true;
    let outerWrapperTag;

    let $lastOfTarget = this.$elements.last();
    let $existingWrappingList;

    if (position === 'bottom') {
      // The list can be broken, so we need to find the last list containing the children of the
      // comment.
      const descendants = this.getChildren(true);
      if (descendants.length) {
        const $test = descendants[descendants.length - 1].$elements
          .last()
          .closest(`.cd-commentLevel-${this.level + 1}`);

        // Logically, the element should always be there, but nevertheless.
        if ($test.length) {
          $existingWrappingList = $test;

          // Can be empty, but it doesn't matter to us. What matters is that $lastOfTarget is not an
          // item element.
          $lastOfTarget = $test.prev();
        }
      }
    }

    let $anchor = $existingWrappingList || $lastOfTarget.next();
    const $anchorFirstChild = $anchor.children().first();
    if ($anchor.is('dd, li') && $anchorFirstChild.hasClass('cd-commentLevel')) {
      // A relatively rare case possible when two adjacent lists are merged with
      // processPage~mergeAdjacentCommentLevels, for example when replying to
      // https://en.wikipedia.org/wiki/Wikipedia:Village_pump_(policy)#202103271157_Uanfala.
      $anchor = $anchorFirstChild;
    }
    if ($anchor.is('dl, ul')) {
      createList = false;
      wrappingItemTag = $anchor.is('ul') ? 'li' : 'dd';
      $anchor.addClass(`cd-commentLevel cd-commentLevel-${this.level + 1}`);
    } else if ($lastOfTarget.is('li')) {
      // We can't use Comment#containerListType as it contains the type for the _first_
      // (highlightable) element.
      const parentListType = $lastOfTarget.cdGetContainerListType();

      // We need to avoid a number appearing next to the form in numbered lists, so we have <div> in
      // those cases. Which is unsemantic, yes :-(
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

      // Why ".cd-commentLevel >": reply to a pseudo-comment added with this diff with a mistake:
      // https://ru.wikipedia.org/?diff=113073013.
      if ($lastOfTarget.is('.cd-commentLevel:not(ol) > li, .cd-commentLevel > dd')) {
        $outerWrapper.addClass('cd-connectToPreviousItem');
      }

      $wrappingList.appendTo($outerWrapper);
    }

    if ($outerWrapper) {
      $outerWrapper.insertAfter($lastOfTarget);
    } else if ($wrappingList) {
      $wrappingList.insertAfter($lastOfTarget);
    } else {
      if (position === 'top') {
        $wrappingItem.prependTo($anchor);
      } else {
        const $last = $anchor.children().last();

        // "Reply to section" button should always be the last.
        $wrappingItem[$last.hasClass('cd-replyWrapper') ? 'insertBefore' : 'insertAfter']($last);
      }
    }

    this.subitemList.add(name, $wrappingItem);

    return { $wrappingItem, $wrappingList, $outerWrapper };
  }
}

Object.assign(Comment, CommentStatic);

export default Comment;
