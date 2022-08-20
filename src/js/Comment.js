import Button from './Button';
import CdError from './CdError';
import CommentButton from './CommentButton';
import CommentForm from './CommentForm';
import CommentSkeleton from './CommentSkeleton';
import CommentStatic from './CommentStatic';
import CommentSubitemList from './CommentSubitemList';
import LiveTimestamp from './LiveTimestamp';
import cd from './cd';
import controller from './controller';
import navPanel from './navPanel';
import pageRegistry from './pageRegistry';
import settings from './settings';
import updateChecker from './updateChecker';
import userRegistry from './userRegistry';
import { ElementsTreeWalker, TreeWalker } from './treeWalker';
import {
  addToArrayIfAbsent,
  areObjectsEqual,
  calculateWordOverlap,
  countOccurrences,
  dealWithLoadingBug,
  decodeHtmlEntities,
  defined,
  generatePageNamePattern,
  getExtendedRect,
  getFromLocalStorage,
  getHigherNodeAndOffsetInSelection,
  getVisibilityByRects,
  isInline,
  notNull,
  saveToLocalStorage,
  unhideText,
  unique,
  wrap,
  wrapDiffBody,
} from './utils';
import {
  brsToNewlines,
  extractSignatures,
  hideDistractingCode,
  hideSensitiveCode,
  hideTemplatesRecursively,
  normalizeCode,
  removeWikiMarkup,
} from './wikitext';
import { formatDate, formatDateNative } from './timestamp';
import { handleApiReject, loadUserGenders, parseCode } from './apiWrappers';
import { showConfirmDialog } from './ooui';

let elementPrototypes;
let thanks;
let closedDiscussionPairRegexp;
let closedDiscussionSingleRegexp;
let outdentTemplatesRegexp;

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
    const thank = newData[key];
    if (!thank.thankUnixTime || thank.thankUnixTime < Date.now() - 60 * cd.g.msInDay) {
      delete newData[key];
    }
  });
  return newData;
}

/**
 * Get the bounding client rectangle for a comment part.
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
    !navPanel.getHiddenNewCommentCount() &&
    CommentStatic.getAll().every((comment) => !comment.willFlashChangedOnSight) &&
    updateChecker.getLastCheckedRevisionId()
  ) {
    pageRegistry.getCurrent().markAsRead(updateChecker.getLastCheckedRevisionId());
  }
}

/**
 * Get the code of the section chunk after the specified index with concealed irrelevant parts.
 *
 * @param {number} currentIndex
 * @param {string} wholeCode
 * @returns {string}
 * @private
 */
function getAdjustedChunkCodeAfter(currentIndex, wholeCode) {
  let adjustedCode = hideDistractingCode(wholeCode);

  if (cd.config.closedDiscussionTemplates[0][0]) {
    if (!closedDiscussionSingleRegexp) {
      const closedDiscussionBeginningsPattern = cd.config.closedDiscussionTemplates[0]
        .map(generatePageNamePattern)
        .join('|');
      const closedDiscussionEndingsPattern = cd.config.closedDiscussionTemplates[1]
        .map(generatePageNamePattern)
        .join('|');
      if (closedDiscussionEndingsPattern) {
        closedDiscussionPairRegexp = new RegExp(
          (
            `\\{\\{ *(?:${closedDiscussionBeginningsPattern}) *(?=[|}])[^}]*\\}\\}\\s*([:*#]*)[^]*?` +
            `\\{\\{ *(?:${closedDiscussionEndingsPattern}) *(?=[|}])[^}]*\\}\\}`
          ),
          'g'
        );
      }
      closedDiscussionSingleRegexp = new RegExp(
        `\\{\\{ *(?:${closedDiscussionBeginningsPattern}) *\\|[^}]{0,50}?=\\s*([:*#]*)`,
        'g'
      );
    }

    if (closedDiscussionPairRegexp) {
      adjustedCode = adjustedCode.replace(closedDiscussionPairRegexp, (s, indentation) => (
        '\x01'.repeat(indentation.length) + ' '.repeat(s.length - indentation.length - 1) + '\x02'
      ));
    }

    let match;
    while ((match = closedDiscussionSingleRegexp.exec(adjustedCode))) {
      const codeBeforeMatch = adjustedCode.slice(0, match.index);
      const codeAfterMatch = adjustedCode.slice(match.index);
      const adjustedCam = hideTemplatesRecursively(codeAfterMatch, null, match[1].length).code;
      adjustedCode = codeBeforeMatch + adjustedCam;
    }
  }

  const adjustedCodeAfter = adjustedCode.slice(currentIndex);
  const nextSectionHeadingMatch = adjustedCodeAfter.match(/\n+(=+).*\1[ \t\x01\x02]*\n|$/);
  let chunkCodeAfterEndIndex = currentIndex + nextSectionHeadingMatch.index + 1;
  let chunkCodeAfter = wholeCode.slice(currentIndex, chunkCodeAfterEndIndex);
  cd.g.keepInSectionEnding.forEach((regexp) => {
    const match = chunkCodeAfter.match(regexp);
    if (match) {
      // `1` accounts for the first line break.
      chunkCodeAfterEndIndex -= match[0].length - 1;
    }
  });

  return adjustedCode.slice(currentIndex, chunkCodeAfterEndIndex);
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
   * @param {import('./Parser').default} parser
   * @param {object} signature Signature object returned by {@link Parser#findSignatures}.
   * @param {object[]} targets
   */
  constructor(parser, signature, targets) {
    super(parser, signature, targets);

    this.bindEvents = this.bindEvents.bind(this);
    this.replyButtonClick = this.replyButtonClick.bind(this);
    this.editButtonClick = this.editButtonClick.bind(this);
    this.thankButtonClick = this.thankButtonClick.bind(this);
    this.copyLink = this.copyLink.bind(this);
    this.goToParentButtonClick = this.goToParentButtonClick.bind(this);
    this.highlightHovered = this.highlightHovered.bind(this);
    this.unhighlightHovered = this.unhighlightHovered.bind(this);
    this.hideMenu = this.hideMenu.bind(this);
    this.deferHideMenu = this.deferHideMenu.bind(this);
    this.dontHideMenu = this.dontHideMenu.bind(this);

    elementPrototypes = cd.g.commentElementPrototypes;

    /**
     * Comment author user object.
     *
     * @type {import('./userRegistry').User}
     */
    this.author = userRegistry.get(this.authorName);

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
      controller.isPageActive() &&
      !controller.getClosedDiscussions().some((el) => el.contains(this.elements[0]))
    );

    this.highlightables.forEach(this.bindEvents);

    this.setAnchorHighlightable();

    const getContainerListType = (el) => {
      const treeWalker = new ElementsTreeWalker(el, controller.rootElement);
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
     * If the comment is collapsed, that's the closest collapsed thread that this comment related
     * to.
     *
     * @type {import('./Thread').default}
     */
    this.collapsedThread = null;

    /**
     * List of the comment's {@link CommentSubitemList subitems}.
     *
     * @type {CommentSubitemList}
     */
    this.subitemList = new CommentSubitemList();

    this.genderRequestCallbacks = [];
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
        const treeWalker = new ElementsTreeWalker(highlightable, controller.rootElement);
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
   * Process a possible signature node or a node that contains text which is part of a signature.
   *
   * @param {Node} n
   * @private
   */
  processPossibleSignatureNode(n) {
    if (!n) return;

    // Remove text at the end of the element that looks like a part of the signature.
    if (n.nodeType === Node.TEXT_NODE || !n.children.length) {
      n.textContent = n.textContent
        .replace(cd.config.signaturePrefixRegexp, '')
        .replace(cd.config.signaturePrefixRegexp, '');
    }

    // Remove the entire element.
    if (
      n.tagName &&
      (n.getAttribute('style') || ['SUP', 'SUB'].includes(n.tagName)) &&
      n.textContent.length < 30 &&

      (
        !(
          // Templates like "citation needed" or https://ru.wikipedia.org/wiki/Template:-:
          n.classList.length ||

          // <b> tags may be the output of templates like
          // https://meta.wikimedia.org/wiki/Template:Done. Some opinion templates may have <b>,
          // <strong> inside another tag.
          ['B', 'STRONG'].includes(n.tagName) ||
          n.querySelector('b, strong')
        ) ||

        // Cases like https://ru.wikipedia.org/?diff=119667594
        n.textContent.toLowerCase() === this.author.getName().toLowerCase()
      )
    ) {
      n.remove();
    }
  }

  /**
   * Clean up the signature and elements in front of it.
   *
   * @private
   */
  cleanUpSignature() {
    let previousNode = this.signatureElement.previousSibling;

    // Cases like https://ru.wikipedia.org/?diff=117350706
    if (!previousNode) {
      const parentNode = this.signatureElement.parentNode;
      const parentPreviousNode = parentNode.previousSibling;
      if (parentPreviousNode && isInline(parentPreviousNode, true)) {
        const parentPreviousElementNode = parentNode.previousElementSibling;

        // Make sure we don't erase some blockquote with little content.
        if (!parentPreviousElementNode || isInline(parentPreviousElementNode)) {
          previousNode = parentPreviousNode;
        }
      }
    }

    const previousPreviousNode = previousNode?.previousSibling;
    this.processPossibleSignatureNode(previousNode);
    if (
      previousNode &&
      previousPreviousNode &&
      (!previousNode.parentNode || !previousNode.textContent.trim())
    ) {
      const previousPreviousPreviousNode = previousPreviousNode.previousSibling;
      this.processPossibleSignatureNode(previousPreviousNode);

      // Rare cases like https://en.wikipedia.org/?diff=1022471527
      if (!previousPreviousNode.parentNode) {
        this.processPossibleSignatureNode(previousPreviousPreviousNode);
      }
    }
  }

  /**
   * Do nearly the same thing as {@link Comment#reviewHighlightables} for the second time: if
   * {@link Comment#reviewHighlightables} has altered the highlightables, this will save the day.
   *
   * @private
   */
  rewrapHighlightables() {
    [this.highlightables[0], this.highlightables[this.highlightables.length - 1]]
      .filter(unique)
      .filter((el) => (
        cd.g.badHighlightableElements.includes(el.tagName) ||
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
        delete origEl.dataset.cdCommentIndex;
      });
  }

  /**
   * @typedef {object[]} ReplaceSignatureWithHeaderReturn
   * @property {string} pageName
   * @property {Element} link
   * @memberof Comment
   * @inner
   */

  /**
   * _For internal use._ Add a comment header to the top highlightable element. Remove the comment
   * signature unless there is more than one of them.
   *
   * @returns {ReplaceSignatureWithHeaderReturn} Pages to check existence of.
   */
  replaceSignatureWithHeader() {
    const pagesToCheckExistence = [];

    this.headerElement = elementPrototypes.headerElement.cloneNode(true);
    const authorWrapper = this.headerElement.firstChild;
    const authorLink = authorWrapper.firstChild;
    const authorLinksWrapper = authorLink.nextElementSibling;
    const bdiElement = authorLink.firstChild;
    const authorTalkLink = authorLinksWrapper.firstElementChild;
    let contribsLink;
    if (settings.get('showContribsLink')) {
      contribsLink = authorLinksWrapper.lastElementChild;
      if (!this.author.isRegistered()) {
        contribsLink.previousSibling.remove();
        contribsLink.remove();
      }
    }

    if (this.authorLink) {
      // Move the existing author link to the header.

      if (this.extraSignatures.length) {
        this.authorLink = this.authorLink.cloneNode(true);
      }

      const beforeAuthorLinkParseReturn = cd.config.beforeAuthorLinkParse ?
        cd.config.beforeAuthorLinkParse(this.authorLink) :
        undefined;
      authorLink.parentNode.replaceChild(this.authorLink, authorLink);
      this.authorLink.classList.add('cd-comment-author');
      this.authorLink.innerHTML = '';
      this.authorLink.appendChild(bdiElement);

      if (cd.config.afterAuthorLinkParse) {
        cd.config.beforeAuthorLinkParse(this.authorLink, beforeAuthorLinkParseReturn);
      }
    } else {
      // Use the bootstrap author link.
      this.authorLink = authorLink;
      let pageName;
      if (this.author.isRegistered()) {
        pageName = 'User:' + this.author.getName();
        pagesToCheckExistence.push({
          pageName,
          link: this.authorLink,
        });
      } else {
        pageName = `${cd.g.contribsPage}/${this.author.getName()}`;
      }
      this.authorLink.title = pageName;
      this.authorLink.href = mw.util.getUrl(pageName);
    }

    if (this.authorTalkLink) {
      // Move the existing author talk link to the header.
      if (this.extraSignatures.length) {
        this.authorTalkLink = this.authorTalkLink.cloneNode(true);
      }
      authorTalkLink.parentNode.replaceChild(this.authorTalkLink, authorTalkLink);
      this.authorTalkLink.textContent = cd.s('comment-author-talk');
    } else {
      // Use the bootstrap author talk link.
      this.authorTalkLink = authorTalkLink;
      const pageName = 'User talk:' + this.author.getName();
      pagesToCheckExistence.push({
        pageName,
        link: this.authorTalkLink,
      });
      this.authorTalkLink.title = pageName;
      this.authorTalkLink.href = mw.util.getUrl(pageName);
    }

    bdiElement.textContent = this.author.getName();

    if (settings.get('showContribsLink') && this.author.isRegistered()) {
      const pageName = `${cd.g.contribsPage}/${this.author.getName()}`;
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
        action: this.copyLink,
        href: this.dtId && '#' + this.dtId,
      });

      this.headerElement.appendChild(this.copyLinkButton.element);
      this.timestampElement = this.copyLinkButton.labelElement;
      (new LiveTimestamp(this.timestampElement, this.date, !settings.get('hideTimezone'))).init();
    }

    /**
     * Comment header. Used when comment reformatting is enabled.
     *
     * @type {external:jQuery|undefined}
     */
    this.$header = $(this.headerElement);

    this.rewrapHighlightables();

    this.highlightables[0].insertBefore(this.headerElement, this.highlightables[0].firstChild);

    if (!this.extraSignatures.length) {
      this.cleanUpSignature();
      this.signatureElement.remove();
    }

    return pagesToCheckExistence;
  }

  /**
   * _For internal use._ Add a menu to the bottom highlightable element of the comment and fill it
   * with buttons. Used when comment reformatting is enabled; otherwise `Comment#createLayers` is
   * used.
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

    this.addReplyButton();
    this.addEditButton();
    this.addThankButton();
    this.addGoToParentButton();

    this.highlightables[this.highlightables.length - 1].appendChild(this.menuElement);
  }

  /**
   * Create a {@link Comment#replyButton reply button} and add it to the comment menu
   * ({@link Comment#$menu} or {@link Comment#$overlayMenu}).
   *
   * @private
   */
  addReplyButton() {
    if (!this.isActionable) return;

    const action = this.replyButtonClick;
    if (settings.get('reformatComments')) {
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

    if (CommentStatic.getByIndex(this.index + 1)?.isOutdented) {
      this.replyButton.setDisabled(true);
      this.replyButton.setTooltip(cd.s('cm-reply-outdented-tooltip'));
    }
  }

  /**
   * Create an {@link Comment#editButton edit button} and add it to the comment menu
   * ({@link Comment#$menu} or {@link Comment#$overlayMenu}).
   *
   * @private
   */
  addEditButton() {
    if (this.isActionable && (this.isOwn || settings.get('allowEditOthersComments'))) {
      const action = this.editButtonClick;
      if (settings.get('reformatComments')) {
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
  addThankButton() {
    if (this.author.isRegistered() && this.date && !this.isOwn) {
      if (!thanks) {
        thanks = cleanUpThanks(getFromLocalStorage('thanks'));
        saveToLocalStorage('thanks', thanks);
      }
      const isThanked = Object.keys(thanks).some((key) => (
        this.id === thanks[key].id &&
        calculateWordOverlap(this.getText(), thanks[key].text) > 0.66
      ));

      const action = this.thankButtonClick;
      if (settings.get('reformatComments')) {
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
  addCopyLinkButton() {
    if (this.id && !settings.get('reformatComments')) {
      const element = elementPrototypes.copyLinkButton.cloneNode(true);
      const widgetConstructor = elementPrototypes.getCopyLinkButton;
      const href = this.dtId ? '#' + this.dtId : undefined;
      this.copyLinkButton = new CommentButton({
        element,
        action: this.copyLink,
        widgetConstructor,
        href,
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
  addGoToParentButton() {
    if (this.getParent()) {
      const action = this.goToParentButtonClick;
      if (settings.get('reformatComments')) {
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
  addGoToChildButton() {
    if (settings.get('reformatComments')) {
      /**
       * "Go to the child comment" button.
       *
       * @type {CommentButton}
       */
      this.goToChildButton = new CommentButton({
        tooltip: cd.s('cm-gotochild-tooltip'),
        classes: ['cd-comment-button-icon', 'cd-comment-button-goToChild'],
      });

      const referenceNode = this.headerElement.lastChild;
      this.headerElement.insertBefore(this.goToChildButton.element, referenceNode?.nextSibling);
    } else {
      const element = elementPrototypes.goToChildButton;
      const widgetConstructor = elementPrototypes.getGoToChildButton;
      this.goToChildButton = new CommentButton({ element, widgetConstructor });
      this.$overlayMenu.prepend(element);
    }
  }

  /**
   * Given a date, format it as per user settings, and prepare a title (tooltip) too.
   *
   * @param {Date} date
   * @param {string} originalTimestamp
   * @returns {object}
   */
  formatTimestamp(date, originalTimestamp) {
    let timestamp;
    let title = '';
    if (cd.g.areTimestampsAltered) {
      timestamp = formatDate(date, !settings.get('hideTimezone'));
    }

    if (
      settings.get('timestampFormat') === 'relative' &&
      settings.get('useUiTime') &&
      cd.g.contentTimezone !== cd.g.uiTimezone
    ) {
      title = formatDateNative(date, true) + '\n';
    }

    title += originalTimestamp;

    return { timestamp, title };
  }

  /**
   * _For internal use._ Change the format of the comment timestamp according to the settings. Do
   * the same with extra timestamps in the comment.
   */
  reformatTimestamp() {
    if (!this.date) return;

    const { timestamp, title } = this.formatTimestamp(this.date, this.timestampElement.textContent);
    if (timestamp) {
      this.reformattedTimestamp = timestamp;
      this.timestampTitle = title;
      if (!settings.get('reformatComments') || this.extraSignatures.length) {
        this.timestampElement.textContent = timestamp;
        this.timestampElement.title = title;
        (new LiveTimestamp(this.timestampElement, this.date, !settings.get('hideTimezone'))).init();
        this.extraSignatures.forEach((sig) => {
          const { timestamp, title } = this.formatTimestamp(sig.date, sig.timestampText);
          sig.timestampElement.textContent = timestamp;
          sig.timestampElement.title = title;
          (new LiveTimestamp(sig.timestampElement, sig.date, !settings.get('hideTimezone'))).init();
        });
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
    if (settings.get('reformatComments')) return;

    element.onmouseenter = this.highlightHovered;
    element.onmouseleave = this.unhighlightHovered;
    element.ontouchstart = this.highlightHovered;
  }

  /**
   * _For internal use._ Filter out floating and hidden elements from the comment's
   * {@link CommentSkeleton#highlightables highlightables}, change their attributes, and update the
   * comment's level and parent elements' level classes.
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

          (
            controller.getFloatingElements().includes(testElement) ||
            controller.getHiddenElements().includes(testElement)
          )
        ) {
          if (el.classList.contains('cd-comment-part-first')) {
            el.classList.remove('cd-comment-part-first');
            this.highlightables[i + 1].classList.add('cd-comment-part-first');
          }
          if (el.classList.contains('cd-comment-part-last')) {
            el.classList.remove('cd-comment-part-last');
            this.highlightables[i - 1].classList.add('cd-comment-part-last');
          }
          delete el.dataset.commentIndex;
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
   * @property {number} top
   * @property {number} bottom
   * @property {number} left
   * @property {number} right
   * @property {number} downplayedBottom
   * @memberof Comment
   * @inner
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

        // This is to determine if the element is moved in future checks.
        this.firstHighlightableWidth = this.highlightables[0].offsetWidth;
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
   * @param {object[]} [floatingRects=controller.getFloatingElements().map(getExtendedRect)]
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
    floatingRects = controller.getFloatingElements().map(getExtendedRect)
  ) {
    // Check if the comment offset intersects the offset of floating elements on the page. (Only
    // then we would need altering comment styles to get the correct offset which is an expensive
    // operation.)
    let intersectsFloatingCount = 0;
    let bottomIntersectsFloating = false;
    floatingRects.forEach((rect) => {
      const floatingTop = scrollY + rect.outerTop;
      const floatingBottom = scrollY + rect.outerBottom;
      if (bottom > floatingTop && bottom < floatingBottom + cd.g.contentLineHeight) {
        bottomIntersectsFloating = true;
      }
      if (bottom > floatingTop && top < floatingBottom + cd.g.contentLineHeight) {
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
          if (controller.getFloatingElements().some((floatingEl) => el.contains(floatingEl))) {
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
    const isTopLayersContainer = this.getLayersContainer()
      .convenientDiscussionsIsTopLayersContainer;

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

    if (!isTopLayersContainer) return;

    if (this.level === 0) {
      const offsets = controller.getContentColumnOffsets();

      // 2 instead of 1 for Timeless
      const leftStretched = left - offsets.startMargin - 2;
      const rightStretched = right + offsets.startMargin + 2;

      this.isStartStretched = this.getTextDirection() === 'ltr' ?
        leftStretched <= offsets.start :
        rightStretched >= offsets.start;
      this.isEndStretched = this.getTextDirection() === 'ltr' ?
        rightStretched >= offsets.end :
        leftStretched <= offsets.end;
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
   *   comment is moved instead of the offset. (This value can be used to stop recalculating comment
   *   offsets if a number of comments in a row have not moved for optimization purposes.) Setting
   *   the `offset` property implies that the layers offset will be updated afterwards - otherwise,
   *   the next attempt to call this method to update the layers offset will return `false` meaning
   *   the comment isn't moved, and the layers offset will stay wrong.
   * @returns {?(CommentOffset|boolean)} Offset object. If the comment is not visible, returns
   *   `null`. If `options.set` is `true`, returns a boolean value indicating if the comment is
   *   moved instead of the offset.
   */
  getOffset(options = {}) {
    options.considerFloating ??= Boolean(options.floatingRects);
    options.set ??= false;

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
      // With scale other than 100% values of less than 0.001 appear in Chrome and Firefox.
      const isTopSame = Math.abs(scrollY + rectTop.top - this.offset.top) < 0.01;
      const isHeightSame = (
        Math.abs((rectBottom.bottom - rectTop.top) - (this.offset.bottom - this.offset.top)) < 0.01
      );
      const isFhWidthSame = (
        Math.abs(this.highlightables[0].offsetWidth - this.firstHighlightableWidth) < 0.01
      );

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
   * Get the comment's text direction. It can be different from the text direction of the site's
   * content language on pages with text marked with the class `mw-content-ltr` or `mw-content-rtl`
   * inside the content.
   *
   * @returns {string}
   */
  getTextDirection() {
    if (!this.textDirection) {
      if (controller.areThereLtrRtlMixes()) {
        // Take the last element because the first one may be the section heading which can have
        // another direction.
        const isLtr = this.elements[this.elements.length - 1]
          .closest('.mw-content-ltr, .mw-content-rtl')
          .classList
          .contains('mw-content-ltr');
        this.textDirection = isLtr ? 'ltr' : 'rtl';
      } else {
        this.textDirection = cd.g.contentTextDirection;
      }
    }

    return this.textDirection;
  }

  /**
   * @typedef {object} CommentMargins
   * @property {number} left Left margin.
   * @property {number} right Right margin.
   * @memberof Comment
   * @inner
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
      // https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#202005160930_Example.
      startMargin = this.highlightables.length === 1 ?
        cd.g.contentFontSize * 3.2 :
        cd.g.contentFontSize * 2.2 - 1;
    } else if (this.isStartStretched) {
      startMargin = controller.getContentColumnOffsets().startMargin;
    } else {
      const anchorElement = this.isCollapsed ? this.thread.expandNote : this.anchorHighlightable;
      if (anchorElement.parentNode.classList.contains('cd-commentLevel')) {
        startMargin = -1;
      } else {
        if (
          this.offset &&
          anchorElement.parentNode.parentNode.classList.contains('cd-commentLevel')
        ) {
          const prop = this.getTextDirection() === 'ltr' ? 'left' : 'right';
          startMargin = (
            Math.abs(this.offset[prop] - anchorElement.parentNode.getBoundingClientRect()[prop]) - 1
          );
        } else {
          startMargin = this.level === 0 ? cd.g.commentFallbackSideMargin : cd.g.contentFontSize;
        }
      }
    }
    const endMargin = this.isEndStretched ?
      controller.getContentColumnOffsets().startMargin :
      cd.g.commentFallbackSideMargin;

    const left = this.getTextDirection() === 'ltr' ? startMargin : endMargin;
    const right = this.getTextDirection() === 'ltr' ? endMargin : startMargin;

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
   * Set a timeout for hiding the menu.
   *
   * @param {Event} e
   * @private
   */
  deferHideMenu(e) {
    // Ignore other than left button clicks.
    if (e.which !== 1) return;

    this.hideMenuTimeout = setTimeout(this.hideMenu, 1200);
  }

  /**
   * Remove timeout for hiding the menu set in {@link Comment#deferHideMenu}.
   *
   * @private
   */
  dontHideMenu() {
    clearTimeout(this.hideMenuTimeout);
  }

  /**
   * Create the comment's underlay and overlay with contents.
   *
   * @fires commentLayersCreated
   * @private
   */
  createLayers() {
    /**
     * _For internal use._ Comment's underlay as a native (non-jQuery) element.
     *
     * @type {?(Element|undefined)}
     */
    this.underlay = elementPrototypes.underlay.cloneNode(true);

    CommentStatic.underlays.push(this.underlay);

    /**
     * Comment's overlay.
     *
     * @type {?(Element|undefined)}
     * @private
     */
    this.overlay = elementPrototypes.overlay.cloneNode(true);

    /**
     * Line element in comment's overlay.
     *
     * @type {Element|undefined}
     * @private
     */
    this.line = this.overlay.firstChild;

    /**
     * Comment's side marker.
     *
     * @type {Element|undefined}
     * @private
     */
    this.marker = this.overlay.firstChild.nextSibling;

    if (!settings.get('reformatComments')) {
      /**
       * Inner wrapper in comment's overlay.
       *
       * @type {Element|undefined}
       * @private
       */
      this.overlayInnerWrapper = this.overlay.lastChild;

      /**
       * Gradient element in comment's overlay.
       *
       * @type {Element|undefined}
       * @private
       */
      this.overlayGradient = this.overlayInnerWrapper.firstChild;

      /**
       * Menu element in comment's overlay.
       *
       * @type {Element|undefined}
       * @private
       */
      this.overlayMenu = this.overlayInnerWrapper.lastChild;

      // Hide the overlay on right click. It can block clicking the author page link.
      this.overlayInnerWrapper.oncontextmenu = this.hideMenu;

      // Hide the overlay on long click/tap.
      this.overlayInnerWrapper.onmousedown = this.deferHideMenu;
      this.overlayInnerWrapper.onmouseup = this.dontHideMenu;

      this.addGoToParentButton();
      this.addCopyLinkButton();
      this.addThankButton();
      this.addEditButton();
      this.addReplyButton();
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

    if (!settings.get('reformatComments')) {
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
     * An underlay and overlay have been created for a comment.
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
    if (this.underlay.classList.contains(`cd-comment-underlay-${type}`) === add) return;

    this.underlay.classList.toggle(`cd-comment-underlay-${type}`, add);
    this.overlay.classList.toggle(`cd-comment-overlay-${type}`, add);

    if (type === 'deleted') {
      this.replyButton?.setDisabled(add);
      this.editButton?.setDisabled(add);
    } else if (type === 'hovered' && !add) {
      this.overlayInnerWrapper.style.display = '';
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
    options.add ??= true;
    options.update ??= true;

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
   * _For internal use._ Add the (already existent) comment's layers to the DOM.
   */
  addLayers() {
    if (!this.underlay) return;

    this.updateLayersOffset();
    this.getLayersContainer().appendChild(this.underlay);
    this.getLayersContainer().appendChild(this.overlay);
  }

  /**
   * _For internal use._ Transfer the `layers(Top|Left|Width|Height)` values to the style of the
   * layers.
   */
  updateLayersOffset() {
    // The underlay can be absent if called from `CommentStatic.maybeRedrawLayers` with `redrawAll`
    // set to `true`.
    if (!this.underlay) return;

    this.underlay.style.top = this.overlay.style.top = this.layersOffset.top + 'px';
    this.underlay.style.left = this.overlay.style.left = this.layersOffset.left + 'px';
    this.underlay.style.width = this.overlay.style.width = this.layersOffset.width + 'px';
    this.underlay.style.height = this.overlay.style.height = this.layersOffset.height + 'px';
  }

  /**
   * Remove the comment's underlay and overlay.
   */
  removeLayers() {
    if (!this.underlay) return;

    this.$animatedBackground?.add(this.$marker).stop(true, true);
    CommentStatic.underlays.splice(CommentStatic.underlays.indexOf(this.underlay), 1);

    this.dontHideMenu();

    this.underlay.remove();
    this.underlay = null;
    this.$underlay = null;

    this.overlay.remove();
    this.overlay = null;
    this.$overlay = null;

    this.isHovered = false;
  }

  /**
   * _For internal use._ Get and sometimes create the container for the comment's underlay and
   * overlay.
   *
   * @returns {Element}
   */
  getLayersContainer() {
    if (this.layersContainer === undefined) {
      let offsetParent;

      // Use the last element, as in Comment#getTextDirection().
      const lastElement = this.elements[this.elements.length - 1];
      const treeWalker = new TreeWalker(document.body, null, true, lastElement);

      while (treeWalker.parentNode()) {
        const node = treeWalker.currentNode;

        // These elements have "position: relative" for the purpose we know.
        if (node.classList.contains('cd-connectToPreviousItem')) continue;

        let style = node.convenientDiscussionsStyle;
        if (!style) {
          // window.getComputedStyle is expensive, so we save the result to the node's property.
          style = window.getComputedStyle(node);
          node.convenientDiscussionsStyle = style;
        }
        const classList = Array.from(node.classList);
        if (
          ['absolute', 'relative'].includes(style.position) ||
          (
            node !== controller.$content.get(0) &&
            (classList.includes('mw-content-ltr') || classList.includes('mw-content-rtl'))
          )
        ) {
          offsetParent = node;
        }
        if (
          style.backgroundColor.includes('rgb(') ||
          style.backgroundImage !== 'none' &&
          !offsetParent
        ) {
          offsetParent = node;
          offsetParent.classList.add('cd-commentLayersContainer-parent-relative');
        }
        if (offsetParent) break;
      }
      offsetParent ||= document.body;
      offsetParent.classList.add('cd-commentLayersContainer-parent');
      let container = offsetParent.firstElementChild;
      if (!container.classList.contains('cd-commentLayersContainer')) {
        container = document.createElement('div');
        container.classList.add('cd-commentLayersContainer');
        offsetParent.insertBefore(container, offsetParent.firstChild);

        container.convenientDiscussionsIsTopLayersContainer = !container.parentNode.parentNode
          .closest('.cd-commentLayersContainer-parent');
      }
      this.layersContainer = container;

      addToArrayIfAbsent(CommentStatic.layersContainers, container);
    }

    return this.layersContainer;
  }

  /**
   * @typedef {object} LayersContainerOffset
   * @property {number} top Top offset.
   * @property {number} left Left offset.
   * @memberof Comment
   * @inner
   */

  /**
   * _For internal use._ Get the top and left offset of the layers container.
   *
   * @returns {?LayersContainerOffset}
   */
  getLayersContainerOffset() {
    const container = this.getLayersContainer();
    let top = container.convenientDiscussionsCachedLayersContainerTop;
    let left = container.convenientDiscussionsCachedLayersContainerLeft;
    if (top === undefined || container.convenientDiscussionsCouldHaveMoved) {
      const rect = container.getBoundingClientRect();
      if (!getVisibilityByRects(rect)) {
        return null;
      }
      top = rect.top + window.scrollY;
      left = rect.left + window.scrollX;
      container.convenientDiscussionsCouldHaveMoved = false;
      container.convenientDiscussionsCachedLayersContainerTop = top;
      container.convenientDiscussionsCachedLayersContainerLeft = left;
    }
    return { top, left };
  }

  /**
   * Highlight the comment when it is hovered.
   *
   * @param {Event} e
   */
  highlightHovered(e) {
    if (this.isHovered || controller.isPageOverlayOn() || settings.get('reformatComments')) return;

    if (e && e.type === 'touchstart') {
      CommentStatic.getAll()
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
    if (!this.isHovered || settings.get('reformatComments')) return;

    // Animation will be directed to wrong properties if we keep it going.
    this.$animatedBackground?.stop(true, true);

    this.dontHideMenu();

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
   * Flash the comment as a target (it is opened by a link, is the target of the up/down comment
   * buttons, is scrolled to after pressing a navigation panel button, etc.).
   */
  flashTarget() {
    this.isTarget = true;

    this.flash('target', 1500, () => {
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
      seenRenderedChanges[articleId][this.id] = {
        htmlToCompare: this.htmlToCompare,
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
   * Keep only those lines of a diff that a related to the comment.
   *
   * @param {string} body
   * @param {object[]} revisions
   * @param {object[]} commentsData
   * @returns {external:jQuery}
   */
  scrubDiff(body, revisions, commentsData) {
    const lineNumbers = [[], []];
    revisions.forEach((revision, i) => {
      const pageCode = revision.slots.main.content;
      const inCode = this.locateInCode(pageCode, commentsData[i]);
      const startLineNumber = countOccurrences(pageCode.slice(0, inCode.lineStartIndex), /\n/g) + 1;
      const endLineNumber = (
        startLineNumber +
        countOccurrences(pageCode.slice(inCode.lineStartIndex, inCode.signatureEndIndex), /\n/g)
      );
      for (let j = startLineNumber; j <= endLineNumber; j++) {
        lineNumbers[i].push(j);
      }
    });

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

    return $(wrapDiffBody(cleanDiffBody));
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

    const revisionsRequest = controller.getApi().post({
      action: 'query',
      revids: [revisionIdLesser, revisionIdGreater],
      prop: 'revisions',
      rvslots: 'main',
      rvprop: ['ids', 'content'],
      redirects: !mw.config.get('wgIsRedirect'),
    }).catch(handleApiReject);

    const compareRequest = controller.getApi().post({
      action: 'compare',
      fromtitle: this.getSourcePage().name,
      fromrev: revisionIdLesser,
      torev: revisionIdGreater,
      prop: ['diff'],
    }).catch(handleApiReject);

    let [revisionsResp, compareResp] = await Promise.all([
      revisionsRequest,
      compareRequest,
      mw.loader.using(['mediawiki.diff', 'mediawiki.diff.styles']),
    ]);

    const revisions = revisionsResp.query?.pages?.[0]?.revisions;
    const body = compareResp?.compare?.body;
    if (!revisions || body === undefined) {
      throw new CdError({
        type: 'api',
        code: 'noData',
      });
    }

    const $cleanDiff = this.scrubDiff(body, revisions, commentsData);
    if (!$cleanDiff.find('.diff-deletedline, .diff-addedline').length) {
      throw new CdError({
        type: 'parse',
        code: 'emptyDiff',
        message: cd.sParse('comment-diff-empty'),
      });
    }

    const $fullDiffLink = $('<a>')
      .attr('href', this.getSourcePage().getUrl({
        oldid: revisionIdLesser,
        diff: revisionIdGreater,
      }))
      .attr('target', '_blank')

      // Make it work in https://ru.wikipedia.org/wiki/User:Serhio_Magpie/instantDiffs.js
      .attr('data-instantdiffs-link', 'link')

      .text(cd.s('comment-diff-full'));
    const $historyLink = $('<a>')
      .attr('href', this.getSourcePage().getUrl({ action: 'history' }))
      .attr('target', '_blank')
      .text(cd.s('comment-diff-history'));
    const $below = $('<div>')
      .addClass('cd-commentDiffView-below')
      .append($fullDiffLink, cd.sParse('dot-separator'), $historyLink);

    const $message = $('<div>').append($cleanDiff, $below);
    mw.hook('wikipage.content').fire($message);
    OO.ui.alert($message, {
      title: cd.s('comment-diff-title'),
      size: 'larger',
    });
  }

  /**
   * Update the comment's properties, add a small text next to the signature saying the comment has
   * been changed or deleted, and change the comment's styling if it has been.
   *
   * @param {'changed'|'changedSince'|'deleted'} type Type of the mark.
   * @param {boolean} [isNewVersionRendered] Has the new version of the comment been rendered.
   * @param {number} [comparedRevisionId] ID of the revision to compare with when the user clicks to
   *   see the diff.
   * @param {object} [commentsData] Data of the comments as of the current revision and the revision
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

    const refreshLink = isNewVersionRendered ?
      undefined :
      new Button({
        label: cd.s('comment-changed-refresh'),
        action: () => {
          controller.reload(type === 'deleted' ? {} : { commentIds: [this.id] });
        },
      });

    const diffLink = type === 'deleted' || this.getSourcePage() !== pageRegistry.getCurrent() ?
      undefined :
      new Button({
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
            mw.notify(wrap(text), { type: e.data?.code === 'emptyDiff'? 'info' : 'error' });
          }
          diffLink.setPending(false);
        },
      });

    let refreshLinkSeparator;
    let diffLinkSeparator;
    if (settings.get('reformatComments')) {
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

    if (settings.get('reformatComments')) {
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

      if (!$last.find('.cd-changeMark-before').length) {
        const $before = $('<span>').addClass('cd-changeMark-before');
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
   * @param {'changed'|'deleted'} type Type of the mark.
   */
  unmarkAsChanged(type) {
    switch (type) {
      case 'changed':
      default:
        this.isChanged = false;
        break;
      case 'deleted':
        this.isDeleted = false;

        // `Comments.maybeRedrawLayers()`, that is called on DOM updates, could circumvent this
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
        delete seenRenderedChanges[articleId][this.id];
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
    const elementNames = [...this.$elements].map((el) => el.tagName);

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
              if (
                !settings.get('useTopicSubscription') &&
                section.subscriptionState &&
                section.headline !== originalHeadline
              ) {
                section.subscribe('quiet', originalHeadline);
              }
              if (settings.get('modifyToc')) {
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
      this.$elements.attr('data-cd-comment-index', this.index);

      if (settings.get('reformatComments')) {
        this.signatureElement = this.$elements.find('.cd-signature').get(0);
        this.replaceSignatureWithHeader();
        this.addMenu();
      } else {
        this.timestampElement = this.$elements.find('.cd-signature .cd-timestamp').get(0);
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
   * @param {'top'|'center'|'bottom'} alignment Where should the element be positioned relative to
   *   the viewport.
   */
  scrollIntoView(alignment) {
    const $target = this.editForm ? this.editForm.$element : this.$elements;
    $target.cdScrollIntoView(alignment);
  }

  /**
   * Scroll to the comment and (by default) flash it as a target.
   *
   * @param {object} [options]
   * @param {boolean} [options.smooth=true] Use a smooth animation.
   * @param {boolean} [options.expandThreads=false] Whether to expand the threads down to the
   *   comment (to avoid the notification "The comment is in a collapsed thread").
   * @param {boolean} [options.flash] Whether to flash the comment as target.
   * @param {boolean} [options.pushState=false] Whether to push a state to the history with the
   *   comment ID as a fragment.
   * @param {Function} [options.callback] Callback to run after the animation has completed.
   */
  scrollTo({
    smooth = true,
    expandThreads = false,
    flash = true,
    pushState = false,
    callback,
  } = {}) {
    if (expandThreads) {
      this.expandAllThreadsDownTo();
    }

    const id = this.dtId || this.id;
    if (pushState && id) {
      const newState = Object.assign({}, history.state, { cdJumpedToComment: true });
      history.pushState(newState, '', `#${id}`);
    }

    if (this.isCollapsed) {
      this.getVisibleExpandNote().cdScrollTo('top', smooth, callback);
      const notification = mw.notification.notify(wrap(cd.sParse('navpanel-firstunseen-hidden'), {
        callbacks: {
          'cd-notification-expandThread': () => {
            this.scrollTo({
              smooth,
              expandThreads: true,
              flash,
              pushState,
              callback,
            });
            notification.close();
          },
        },
      }), {
        title: cd.s('navpanel-firstunseen-hidden-title'),
      });
    } else {
      const $elements = this.editForm ? this.editForm.$element : this.$elements;
      const offset = this.getOffset({ considerFloating: true });
      const alignment = (
        this.isOpeningSection ||
        this.editForm ||
        offset.bottom !== offset.downplayedBottom
      ) ?
        'top' :
        'center';
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

    parent.scrollTo({ pushState: true });
    parent.configureLayers();

    if (!parent.goToChildButton) {
      parent.addGoToChildButton();
    }
    parent.goToChildButton.setAction(() => {
      this.scrollTo({ pushState: true });
    });
  }

  /**
   * _For internal use._ Generate a JQuery object containing an edit summary, diff body, and link to
   * the next diff.
   *
   * @returns {Promise.<external:jQuery>}
   */
  async generateDiffView() {
    const edit = await this.findEdit();
    const diffLink = await this.getDiffLink();
    const $nextDiffLink = $('<a>')
      .addClass('cd-diffView-nextDiffLink')
      .attr('href', diffLink.replace(/&diff=(\d+)/, '&oldid=$1&diff=next'))
      .attr('target', '_blank')

      // Make it work in https://ru.wikipedia.org/wiki/User:Serhio_Magpie/instantDiffs.js
      .attr('data-instantdiffs-link', 'link')

      .text(cd.mws('nextdiff'));
    const $above = $('<div>').append($nextDiffLink);
    const $summaryText = wrap(edit.parsedcomment, { targetBlank: true }).addClass('comment');
    $above.append(cd.sParse('cld-summary'), cd.mws('colon-separator'), $summaryText);
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
    if (controller.isPageOverlayOn()) return;

    controller.showCopyLinkDialog(this, e);
  }

  /**
   * Find matches of the comment with diffs that might have added it.
   *
   * @param {string[]} compareBodies
   * @param {object[]} revisions
   * @returns {object}
   */
  async findDiffMatches(compareBodies, revisions) {
    // Only analyze added lines except for headings.
    const regexp = /<td [^>]*class="[^"]*\bdiff-empty\b[^"]*"[^>]*>\s*<\/td>\s*<td [^>]*class="[^"]*\bdiff-marker\b[^"]*"[^>]*>\s*<\/td>\s*<td [^>]*class="[^"]*\bdiff-addedline\b[^"]*"[^>]*>\s*<div[^>]*>(?!=)(.+?)<\/div>\s*<\/td>/g;

    const commentFullText = this.getText(false) + ' ' + this.signatureText;
    const matches = [];
    for (let i = 0; i < compareBodies.length; i++) {
      const diffBody = compareBodies[i];

      // Currently even empty diffs have newlines and a comment.
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

      // Parse wikitext if there is no full overlap and there are templates inside.
      if (wordOverlap < 1 && diffOriginalText.includes('{{')) {
        try {
          const html = (await parseCode(diffOriginalText, {
            title: pageRegistry.getCurrent().name
          })).html;
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

    return matches;
  }

  /**
   * Find the edit that added the comment.
   *
   * @returns {Promise.<object>}
   * @throws {CdError}
   * @private
   */
  async findEdit() {
    if (!this.addingEdit) {
      // Search for the edit in the range of 10 minutes before (in case the comment was edited with
      // timestamp replaced) to 3 minutes after (a rare occasion where the diff timestamp is newer
      // than the comment timestamp).
      const revisions = await this.getSourcePage().getArchivedPage().getRevisions({
        rvprop: ['ids', 'comment', 'parsedcomment', 'timestamp'],
        rvdir: 'newer',
        rvstart: new Date(this.date.getTime() - cd.g.msInMin * 10).toISOString(),
        rvend: new Date(this.date.getTime() + cd.g.msInMin * 3).toISOString(),
        rvuser: this.author.getName(),
        rvlimit: 500,
      });

      const compareRequests = revisions.map((revision) => controller.getApi().post({
        action: 'compare',
        fromtitle: this.getSourcePage().getArchivedPage().name,
        fromrev: revision.revid,
        torelative: 'prev',
        prop: ['diff'],
      }).catch(handleApiReject));
      const compareBodies = (await Promise.all(compareRequests)).map((resp) => resp.compare.body);
      const matches = await this.findDiffMatches(compareBodies, revisions);
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
      this.addingEdit = bestMatch.revision;
    }

    return this.addingEdit;
  }

  /**
   * Get a diff link for the comment.
   *
   * @param {'standard'|'short'|'wikilink'} [format='standard'] Format to get the link in.
   * @returns {Promise.<string>}
   */
  async getDiffLink(format = 'standard') {
    const edit = await this.findEdit();
    if (format === 'standard') {
      const urlEnding = decodeURI(
        pageRegistry.getCurrent().getArchivedPage().getUrl({ diff: edit.revid })
      );
      return `${cd.g.server}${urlEnding}`;
    } else if (format === 'short') {
      return `${cd.g.server}/?diff=${edit.revid}`;
    } else if (format === 'wikilink') {
      const specialPageName = (
        mw.config.get('wgFormattedNamespaces')[-1] +
        ':' +
        cd.g.specialPageAliases.Diff
      );
      return `[[${specialPageName}/${edit.revid}]]`;
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

    const genderRequest = cd.g.genderAffectsUserString && this.author.isRegistered() ?
      loadUserGenders([this.author]) :
      undefined;

    let edit;
    try {
      ([edit] = await Promise.all([
        this.findEdit(),
        genderRequest,
        mw.loader.using(['mediawiki.diff', 'mediawiki.diff.styles']),
      ].filter(defined)));
    } catch (e) {
      this.thankFail(e);
      return;
    }

    const url = this.getSourcePage().getArchivedPage().getUrl({ diff: edit.revid });
    const question = cd.sParse('thank-confirm', this.author.getName(), this.author, url);
    const $question = wrap(question, {
      tagName: 'div',
      targetBlank: true,
    });
    $question.find('a').attr('data-instantdiffs-link', 'link');
    const $diff = await this.generateDiffView();
    const $content = $('<div>').append($question, $diff);
    mw.hook('wikipage.content').fire($content);

    if (await showConfirmDialog($content, { size: 'larger' }) === 'accept') {
      try {
        await controller.getApi().postWithEditToken(controller.getApi().assertCurrentUser({
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
        id: this.id,
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
   * @param {object|CommentForm} initialState
   */
  reply(initialState) {
    if (!this.replyForm) {
      let isSelectionRelevant = false;
      if (!initialState) {
        isSelectionRelevant = CommentStatic.getSelectedComment() === this;
        if (isSelectionRelevant) {
          initialState = { focus: false };

          let endBoundary;
          if (settings.get('reformatComments')) {
            endBoundary = this.$menu.get(0);
          } else {
            endBoundary = document.createElement('span');
            this.$elements.last().append(endBoundary);
          }

          const selection = window.getSelection();
          const { higherNode, higherOffset } = getHigherNodeAndOffsetInSelection(selection);
          if (selection.containsNode(endBoundary, true)) {
            selection.setBaseAndExtent(higherNode, higherOffset, endBoundary, 0);
          }

          if (!settings.get('reformatComments')) {
            endBoundary.remove();
          }
        }
      }

      /**
       * Reply form related to the comment.
       *
       * @type {CommentForm|undefined}
       */
      this.replyForm = initialState instanceof CommentForm ?
        initialState :
        new CommentForm({
          mode: 'reply',
          target: this,
          initialState,
        });

      if (isSelectionRelevant) {
        this.replyForm.quote();
      }
    }
  }

  /**
   * Create an {@link Comment#editForm edit form} for the comment.
   *
   * @param {object|CommentForm} initialState
   */
  edit(initialState) {
    // We use a class here because there can be elements in the comment that are hidden from the
    // beginning and should stay so when reshowing the comment.
    this.$elements.addClass('cd-hidden');
    this.removeLayers();
    if (this.isOpeningSection) {
      $(this.section.barElement).addClass('cd-hidden');
    }

    // "!this.editForm" check is in case the editing is initiated from a script of some kind (there
    // is no button to call it from CD when the form is displayed).
    if (!this.editForm) {
      /**
       * Edit form related to the comment.
       *
       * @type {CommentForm|undefined}
       */
      this.editForm = initialState instanceof CommentForm ?
        initialState :
        new CommentForm({
          mode: 'edit',
          target: this,
          initialState,
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
   * @param {object} [offset={@link Comment#getOffset this.getOffset()}] Prefetched offset.
   * @returns {?boolean}
   */
  isInViewport(partially = false, offset = this.getOffset()) {
    if (!offset) {
      return null;
    }

    const scrollY = window.scrollY;
    const viewportTop = scrollY + cd.g.bodyScrollPaddingTop;
    const viewportBottom = scrollY + window.innerHeight;

    return partially ?
      offset.downplayedBottom > viewportTop && offset.top < viewportBottom :
      offset.top >= viewportTop && offset.downplayedBottom <= viewportBottom;
  }

  /**
   * Mark the comment as seen, and also {@link Comment#flash flash} comments that are set to flash.
   *
   * @param {'forward'|'backward'} [registerAllInDirection] Mark all comments in the forward or
   *   backward direction from this comment as seen.
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

    const makesSenseToRegisterFurther = CommentStatic.getAll()
      .some((comment) => comment.isSeen || comment.willFlashChangedOnSight);
    if (registerAllInDirection && makesSenseToRegisterFurther) {
      const change = registerAllInDirection === 'backward' ? -1 : 1;
      const nextComment = CommentStatic.getByIndex(this.index + change);
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
    this.cached$elements ??= $(this.elements);
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
   * @param {Element|external:jQuery} element Element to replace. Provide a native element only if
   *   we're in the page processing phase (and {@link Comment#$elements} has not been requested,
   *   hence cached yet).
   * @param {Element|string} newElementOrHtml Element or HTML string to replace with.
   */
  replaceElement(element, newElementOrHtml) {
    const nativeElement = element instanceof $ ? element.get(0) : element;
    let newElement;
    if (typeof newElementOrHtml === 'string') {
      const index = [...nativeElement.parentNode.children].indexOf(nativeElement);
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
   * @param {boolean} [cleanUpSignature=true] Whether to clean up the signature.
   * @returns {string}
   */
  getText(cleanUpSignature = true) {
    if (this.cachedText === undefined) {
      const $clone = this.$elements
        .not('h1, h2, h3, h4, h5, h6')
        .clone()
        .removeClass('cd-hidden');
      const $dummy = $('<div>').append($clone);
      const selectorParts = ['.cd-signature', '.cd-changeMark', '.noprint'];
      if (settings.get('reformatComments')) {
        selectorParts.push('.cd-comment-header', '.cd-comment-menu');
      }
      if (cd.config.unsignedClass) {
        selectorParts.push(`.${cd.config.unsignedClass}`);
      }
      const selector = selectorParts.join(', ');
      $dummy.find(selector).remove();
      let text = $dummy.cdGetText();
      if (cleanUpSignature) {
        if (cd.config.signatureEndingRegexp) {
          text = text.replace(cd.config.signatureEndingRegexp, '');
        }

        // FIXME: We use the same regexp to clean both the wikitext and the render. With the current
        // default config value the side effects seem to be negligable, but who knows...
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
    let { code, originalIndentation } = this.inCode;

    let hidden;
    ({ code, hidden } = hideSensitiveCode(code));

    let text = code;

    if (this.level === 0) {
      // Collapse random line breaks that do not affect text rendering but will transform into <br>
      // on posting. \x01 and \x02 mean the beginning and ending of sensitive code except for
      // tables. \x03 and \x04 mean the beginning and ending of a table. Note: This should be kept
      // coordinated with the reverse transformation code in CommentForm#commentTextToCode. Some
      // more comments are there.
      const entireLineRegexp = new RegExp(/^(?:\x01\d+_(block|template)\x02) *$/);
      const fileRegexp = new RegExp(`^\\[\\[${cd.g.filePrefixPattern}.+\\]\\]$`, 'i');
      const currentLineEndingRegexp = new RegExp(
        `(?:<${cd.g.pniePattern}(?: [\\w ]+?=[^<>]+?| ?\\/?)>|<\\/${cd.g.pniePattern}>|\\x04|<br[ \\n]*\\/?>) *$`,
        'i'
      );
      const nextLineBeginningRegexp = new RegExp(
        `^(?:<\\/${cd.g.pniePattern}>|<${cd.g.pniePattern}|\\||!)`,
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

    text = brsToNewlines(text, '\x01\n')
      // Templates occupying a whole line with <br> at the end get a special treatment too.
      .replace(/^((?:\x01\d+_template.*\x02) *)\x01$/gm, (s, m1) => m1 + '<br>')

      // Replace a temporary marker.
      .replace(/\x01\n/g, '\n')

      // Remove indentation characters
      .replace(/\n([:*#]*)([ \t]*)/g, (s, chars, spacing) => {
        let newChars;
        if (chars.length >= originalIndentation.length) {
          newChars = chars.slice(originalIndentation.length);
          if (chars.length > originalIndentation.length) {
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
   * While {@link Comment#adjustCommentBeginning adjusting the comment code data}, exclude the
   * heading code and/or some known "bad beginnings" (such as badly signed comments and code
   * captured by {@link convenientDiscussions.g.badCommentBeginnings}).
   *
   * @param {object} data
   * @returns {object}
   */
  excludeBadBeginnings(data) {
    if (data.headingMatch) {
      data.headingCode = data.headingMatch[2];
      data.headingStartIndex = data.startIndex + data.headingMatch[1].length;
      data.headingLevel = data.headingMatch[3].length;
      data.headlineCode = data.headingMatch[4].trim();
      data.startIndex += data.headingMatch[0].length;
      data.code = data.code.slice(data.headingMatch[0].length);

      // Try to edit the first comment at
      // https://ru.wikipedia.org/wiki/Википедия:Голосования/Отметки_статусных_статей_в_навигационных_шаблонах#Да
      // to see the bug happening if we don't check for `this.isOpeningSection`.
      data.lineStartIndex = this.isOpeningSection ? data.headingStartIndex : data.startIndex;
    } else {
      // Dirty workaround to tell if there are foreign timestamps inside the comment.
      const areThereForeignTimestamps = this.elements.some((el) => {
        const timestamp = el.querySelector('.cd-timestamp');
        return timestamp && !timestamp.closest('.cd-signature');
      });

      // Exclude the text of the previous comment that is ended with 3 or 5 tildes instead of 4 and
      // foreign timestamps. The foreign timestamp part can be moved out of the `!headingMatch`
      // condition together with `cd.g.badCommentBeginnings` check to allow to apply to cases like
      // https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#Start_of_section,_comment_with_timestamp_but_without_author,_newline_inside_comment,_HTML_comments_before_reply,
      // but this can create problems with removing stuff from the opening comment.
      [cd.config.signatureEndingRegexp, areThereForeignTimestamps ? null : cd.g.timezoneRegexp]
        .filter(notNull)
        .forEach((originalRegexp) => {
          const regexp = new RegExp(originalRegexp.source + '$', 'm');
          const linesRegexp = /^(.+)\n/gm;
          let lineMatch;
          let indent;
          while ((lineMatch = linesRegexp.exec(data.code))) {
            const line = lineMatch[1].replace(/\[\[:?(?:[^|[\]<>\n]+\|)?(.+?)\]\]/g, '$1');
            if (regexp.test(line)) {
              const testIndent = lineMatch.index + lineMatch[0].length;
              if (testIndent === data.code.length) {
                break;
              } else {
                indent = testIndent;
              }
            }
          }
          if (indent) {
            data.code = data.code.slice(indent);
            data.startIndex += indent;
            data.lineStartIndex += indent;
          }
        });

      // This should be before the `this.level > 0` block to account for cases like
      // https://ru.wikipedia.org/w/index.php?oldid=110033693&section=6&action=edit (the regexp
      // doesn't catch the comment because of a newline inside the `syntaxhighlight` element).
      cd.g.badCommentBeginnings.forEach((pattern) => {
        if (pattern.source[0] !== '^') {
          console.debug('Regexps in cd.config.customBadCommentBeginnings should have "^" as the first character.');
        }
        let match;
        while ((match = data.code.match(pattern))) {
          data.code = data.code.slice(match[0].length);
          data.lineStartIndex = data.startIndex + match[0].lastIndexOf('\n') + 1;
          data.startIndex += match[0].length;
        }
      });
    }

    return data;
  }

  /**
   * While {@link Comment#adjustCommentBeginning adjusting the comment code data}, exclude the
   * indentation characters and any foreign code (such as section intro) before them from the
   * comment code. Comments at the zero level sometimes start with `:` that is used to indent some
   * side note. It shouldn't be considered an indentation character.
   *
   * @param {object} data
   * @returns {object}
   * @private
   */
  excludeIndentationAndIntro(data) {
    if (this.level === 0) {
      return data;
    }

    const replaceIndentation = (s, before, chars, after = '') => {
      if (typeof after === 'number') {
        after = '';
      }
      let remainder = '';
      let adjustedChars = chars;
      let startIndexShift = s.length;

      // We could just throw an error here, but instead will try to fix the markup.
      if (
        !before &&
        countOccurrences(data.code, /(^|\n)[:*#]/g) >= 2 &&
        adjustedChars.endsWith('#')
      ) {
        adjustedChars = adjustedChars.slice(0, -1);
        data.originalIndentation = adjustedChars;

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

          The first is incorrect, and we need to add additional indentation in that case. Examples:
          https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#c-Example-2020-05-16T09:10:00.000Z-Example-2020-05-16T09:00:00.000Z
          https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#c-Example-2020-05-16T09:20:00.000Z-Example-2020-05-16T09:10:00.000Z
          But make sure replying to
          https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#No_intro_text,_empty_line_before_the_first_vote
          works correctly.
          */
        if (adjustedChars.length < this.level) {
          adjustedChars += ':';
        }
        startIndexShift -= 1 + after.length;

        remainder = '#' + after;
      } else {
        data.originalIndentation = chars;
      }

      data.indentation = adjustedChars;
      data.lineStartIndex = data.startIndex + before.length;
      data.startIndex += startIndexShift;
      return remainder;
    };

    const indentationPattern = `\\n*${cd.config.indentationCharsPattern}`;

    data.code = data.code.replace(new RegExp(`^()${indentationPattern}`), replaceIndentation);

    // See the comment "Without treatment of such cases, the section introduction..." in
    // CommentSkeleton.js. Dangerous case: the first section at
    // https://ru.wikipedia.org/w/index.php?oldid=105936825&action=edit. This was actually a mistake
    // to put a signature at the first level, but if it was legit, only the last sentence should
    // have been interpreted as the comment.
    if (data.indentation === '') {
      data.code = data.code.replace(
        new RegExp(`(^[^]*?\\n)${indentationPattern}(?![^]*\\n[^:*#])`),
        replaceIndentation
      );
    }

    // Workaround to remove code of a preceding comment or intro with no proper signature
    if (data.indentation.length < this.level && countOccurrences(data.code, /\n/g)) {
      data.code = data.code.replace(
        new RegExp(`^([^]+?\\n)([:*#]{${this.level}})( *)`),
        replaceIndentation
      );
    }

    return data;
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
    let data = {
      code,
      startIndex,
      lineStartIndex: startIndex,
      headingMatch: code.match(/(^[^]*(?:^|\n))((=+)(.*)\3[ \t\x01\x02]*\n)/),
      originalIndentation: '',
      indentation: '',
    };

    data = this.excludeBadBeginnings(data);
    data = this.excludeIndentationAndIntro(data);

    return data;
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

    if (this.isOwn && cd.g.userSignaturePrefixRegexp) {
      data.code = data.code.replace(cd.g.userSignaturePrefixRegexp, movePartToSignature);
    }

    const movePartsToSignature = (code, regexps) => {
      regexps.forEach((regexp) => {
        code = code.replace(regexp, movePartToSignature);
      });
      return code;
    };

    const tagRegexp = new RegExp(`(<${cd.g.piePattern}(?: [\\w ]+?=[^<>]+?)?> *)+$`, 'i');

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
    let replyIndentation = data.indentation;
    if (!this.isOpeningSection) {
      // If the last line ends with "#", it's probably a numbered list _inside_ the comment, not two
      // comments in one, so we exclude such cases. The signature code is used because it may start
      // with a newline.
      const match = (data.code + data.signatureDirtyCode).match(/\n([:*#]*[:*])(?!:*#).*$/);
      if (match) {
        replyIndentation = match[1];

        // Cases where indentation characters on the first line don't denote a comment level but
        // serve some other purposes. Examples: https://en.wikipedia.org/?diff=998431486,
        // https://ru.wikipedia.org/w/index.php?diff=105978713 (this one is actually handled by
        // `replaceIndentation()` in Comment#adjustCommentBeginning).
        if (replyIndentation.length < data.originalIndentation.length) {
          // We better restore the original space or its absence here.
          const spaceOrNot = cd.config.spaceAfterIndentationChars ? ' ' : '';

          const prefix = data.originalIndentation.slice(replyIndentation.length) + spaceOrNot;
          data.code = prefix + data.code;
          data.indentation = data.originalIndentation = data.originalIndentation
            .slice(0, replyIndentation.length);
          data.startIndex -= prefix.length;
        }
      }
    }
    replyIndentation += cd.config.defaultIndentationChar;
    data.replyIndentation = replyIndentation;

    return data;
  }

  /**
   * Get the score for a match.
   *
   * @param {object} match Match object.
   * @param {object} thisData Data about the current comment.
   * @param {object[]} signatures List of signatures extracted from wikitext.
   * @param {object[]} matches List of all matches.
   * @returns {object}
   * @private
   */
  getMatchScore(match, thisData, signatures, matches) {
    const doesIndexMatch = thisData.index === match.index;
    let doesPreviousCommentsDataMatch = false;
    let isPreviousCommentsDataEqual;
    let doesHeadlineMatch;
    if (thisData.previousComments.length) {
      for (let i = 0; i < thisData.previousComments.length; i++) {
        const signature = signatures[match.index - 1 - i];
        if (!signature) break;

        // At least one coincided comment is enough if the second is unavailable.
        doesPreviousCommentsDataMatch = (
          signature.timestamp === thisData.previousComments[i].timestamp &&

          // Previous comment object may come from the worker, where it has only the authorName
          // property.
          signature.author.getName() === thisData.previousComments[i].authorName
        );

        // Many consecutive comments with the same author and timestamp.
        if (isPreviousCommentsDataEqual !== false) {
          isPreviousCommentsDataEqual = (
            match.timestamp === signature.timestamp &&
            match.author === signature.author
          );
        }
        if (!doesPreviousCommentsDataMatch) break;
      }
    } else {
      // If there is no previous comment both on the page and in the code, it's a match.
      doesPreviousCommentsDataMatch = match.index === 0;
    }

    isPreviousCommentsDataEqual = Boolean(isPreviousCommentsDataEqual);
    Object.assign(match, this.adjustCommentBeginning(match));
    if (thisData.followsHeading) {
      doesHeadlineMatch = match.headingMatch ?
        (
          normalizeCode(removeWikiMarkup(match.headlineCode)) ===
          normalizeCode(thisData.sectionHeadline)
        ) :
        -5;
    } else {
      doesHeadlineMatch = !match.headingMatch;
    }

    const wordOverlap = calculateWordOverlap(thisData.commentText, removeWikiMarkup(match.code));
    match.score = (
      // This condition _must_ be true.
      (
        matches.length === 1 ||
        wordOverlap > 0.5 ||

        // There are always problems with first comments as there are no previous comments to
        // compare the signatures of and it's harder to tell the match, so we use a bit ugly
        // solution here, although it should be quite reliable: the comment's firstness, matching
        // author, date, and headline. A false negative will take place when the comment is no
        // longer first. Another option is to look for next comments, not for previous.
        (thisData.index === 0 && doesPreviousCommentsDataMatch && doesHeadlineMatch) ||

        // The reserve method, if for some reason the text is not overlapping: by this and
        // previous two dates and authors. If all dates and authors are the same, that shouldn't
        // count (see [[Википедия:К удалению/22 сентября 2020#202009221158_Facenapalm_17]]).
        (thisData.index !== 0 && doesPreviousCommentsDataMatch && !isPreviousCommentsDataEqual)
      ) * 2 +

      wordOverlap +
      doesHeadlineMatch * 1 +
      doesPreviousCommentsDataMatch * 0.5 +
      doesIndexMatch * 0.0001
    );

    return match;
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
    let thisData;
    if (commentData) {
      thisData = {
        index: commentData.index,

        // For the reserve method; the main method uses one date.
        previousComments: commentData.previousComments,

        followsHeading: commentData.followsHeading,
        sectionHeadline: commentData.section?.headline,
        commentText: commentData.text,
      };
    } else {
      const comments = isSectionCodeUsed ? this.section.comments : CommentStatic.getAll();
      const index = comments.indexOf(this);
      thisData = {
        index,
        previousComments: comments
          .slice(Math.max(0, index - 2), index)
          .reverse(),
        followsHeading: this.followsHeading,
        sectionHeadline: this.section?.headline,
        commentText: this.getText(),
      };
    }

    const signatures = extractSignatures(pageCode);
    return signatures
      .filter((sig) => (
        (sig.author === this.author || sig.author === '<undated>') &&
        (
          this.timestamp === sig.timestamp ||

          // .startsWith() to account for cases where you can ignore the timezone string in
          // "unsigned" templates (it may be present and may be not), but it appears on the page.
          (this.timestamp && this.timestamp.startsWith(sig.timestamp))
        )
      ))

      // Transform the signature object into a comment match object.
      .map((signature) => ({
        index: signature.index,
        author: signature.author,
        timestamp: signature.timestamp,
        date: signature.date,
        signatureDirtyCode: signature.dirtyCode,
        startIndex: signature.commentStartIndex,
        endIndex: signature.startIndex,
        signatureEndIndex: signature.startIndex + signature.dirtyCode.length,
        code: pageCode.slice(signature.commentStartIndex, signature.startIndex),
      }))

      .map((match, i, matches) => this.getMatchScore(match, thisData, signatures, matches))
      .filter((match) => match.score > 2.5);
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
   * Apply regular expressions to determine a proper place in the code to insert a reply to the
   * comment into while taking outdent templates into account.
   *
   * @param {object} thisInCode
   * @param {string} adjustedChunkCodeAfter
   * @returns {object}
   */
  matchProperPlaceRegexps(thisInCode, adjustedChunkCodeAfter) {
    const anySignaturePattern = (
      '^(' +
      (this.isInSingleCommentTable ? '[^]*?(?:(?:\\s*\\n\\|\\})+|</table>).*\\n' : '') +
      '[^]*?(?:' +
      mw.util.escapeRegExp(thisInCode.signatureCode) +
      '|' +
      cd.g.contentTimestampRegexp.source +
      '.*' +
      (cd.g.unsignedTemplatesPattern ? `|${cd.g.unsignedTemplatesPattern}.*` : '') +

      // `\x01` is from hiding closed discussions and HTML comments. TODO: Line can start with a
      // HTML comment in a <pre> tag, that doesn't mean we can put a comment after it. We perhaps
      // need to change `wikitext.hideDistractingCode`.
      '|(?:^|\\n)\\x01.+)\\n)\\n*'
    );
    const maxIndentationLength = thisInCode.replyIndentation.length - 1;
    const endOfThreadPattern = (
      '(' +

      // `\n` is here to prevent putting the reply on a casual empty line. `\x01` is from hiding
      // closed discussions.
      '(?![:*#\\x01\\n])' +

      /*
        This excludes cases where:
        1) `#` is starting a numbered list inside a comment (reply put in a wrong place:
           https://ru.wikipedia.org/w/index.php?diff=110482717). Can't do that to `*` as well since
           `*` can be an indentation character at a position other than 0 whereas `#` at such
           position can't be an indentation character; it can only start a line.
        2) An indentation character is followed by a newline (`\\n` removed).
       */
      (maxIndentationLength > 0 ? `|[:*#\\x01]{1,${maxIndentationLength}}(?![:*\\x01])` : '') +
      ')'
    );

    const properPlaceRegexp = new RegExp(anySignaturePattern + endOfThreadPattern);
    const match = adjustedChunkCodeAfter.match(properPlaceRegexp) || [];
    let adjustedCodeBetween = match[1] ?? adjustedChunkCodeAfter;
    let indentationAfter = match[match.length - 1];
    let isNextLine = countOccurrences(adjustedCodeBetween, /\n/g) === 1;

    if (cd.config.outdentTemplates.length) {
      if (!outdentTemplatesRegexp) {
        const pattern = cd.config.outdentTemplates
          .map(generatePageNamePattern)
          .join('|');
        outdentTemplatesRegexp = new RegExp(
          `^\\s*([:*#]*)[ \t]*\\{\\{ *(?:${pattern}) *(?:\\||\\}\\})`
        );
      }

      /*
        If there is an "outdent" template next to the insertion place:
        * If the outdent template is right next to the comment replied to, we throw an error.
        * If not, we insert the reply on the next line after the target comment.
       */
      const [, outdentIndentation] = (
        adjustedChunkCodeAfter
          .slice(adjustedCodeBetween.length)
          .match(outdentTemplatesRegexp) ||
        []
      );
      if (outdentIndentation !== undefined) {
        if (isNextLine) {
          // Can't insert a reply before an "outdent" template.
          throw new CdError({
            type: 'parse',
            code: 'findPlace',
          });
        } else if ((outdentIndentation || '').length <= thisInCode.replyIndentation.length) {
          const nextLineRegexp = new RegExp(anySignaturePattern);

          // If `adjustedChunkCodeAfter` matched `properPlaceRegexp`, it should match
          // `nextLineRegexp` too.
          [, adjustedCodeBetween] = adjustedChunkCodeAfter.match(nextLineRegexp) || [];
        }
      }
    }

    return { adjustedCodeBetween, indentationAfter, isNextLine };
  }

  /**
   * Determine an offset in the code to insert a reply to the comment into.
   *
   * @param {object} thisInCode
   * @param {string} wholeCode
   * @returns {string}
   * @private
   */
  findProperPlaceForReply(thisInCode, wholeCode) {
    let currentIndex = thisInCode.endIndex;

    const adjustedChunkCodeAfter = getAdjustedChunkCodeAfter(currentIndex, wholeCode);
    if (/^ +\x02/.test(adjustedChunkCodeAfter)) {
      throw new CdError({
        type: 'parse',
        code: 'closed',
      });
    }

    const {
      adjustedCodeBetween,
      indentationAfter,
      isNextLine,
    } = this.matchProperPlaceRegexps(thisInCode, adjustedChunkCodeAfter);

    if (
      cd.config.outdentTemplates.length &&
      settings.get('outdentLevel') &&
      thisInCode.replyIndentation.length >= settings.get('outdentLevel') &&
      isNextLine
    ) {
      thisInCode.isReplyOutdented = true;
      thisInCode.replyIndentation = (
        thisInCode.replyIndentation.slice(0, Math.max(indentationAfter.length, 1)) +
        cd.config.defaultIndentationChar
      );
    }

    // If the comment is to be put after a comment with different indentation characters, use these.
    // `#[:*#]*` is to use `#` as an indentation character when, say, replying to a comment and the
    // last reply uses `#`.
    const [, changedIndentation] = adjustedCodeBetween.match(/\n([:*#]{2,}|#[:*#]*).*\n$/) || [];
    if (changedIndentation) {
      // Note the bug https://ru.wikipedia.org/w/index.php?diff=next&oldid=105529545 that was
      // possible here when we used `.slice(0, thisInCode.indentation.length + 1)` (due to `**` as
      // indentation characters in Bsivko's comment).
      thisInCode.replyIndentation = changedIndentation
        .slice(0, thisInCode.replyIndentation.length)
        .replace(/:$/, cd.config.defaultIndentationChar);
    }

    currentIndex += adjustedCodeBetween.length;

    return currentIndex;
  }

  /**
   * Modify a whole section or page code string related to the comment in accordance with an action.
   *
   * @param {object} options
   * @param {'reply'|'edit'} options.action
   * @param {'submit'|'viewChanged'|'preview'} options.formAction
   * @param {string} [options.commentCode] Comment code, including trailing newlines, indentation
   *   characters, and the signature. Can be not set if `commentForm` is set or `doDelete` is
   *   `true`.
   * @param {boolean} [options.doDelete] Whether to delete the comment.
   * @param {string} [options.wholeCode] Code that has the comment. Usually not needed; provide it
   *   together with `thisInCode` only if you need to perform operations on some code that is not
   *   the code of a section or page).
   * @param {string} [options.thisInCode] Result of {@link Comment#locateInCode} called with code in
   *   the first parameter. Usually not needed; provide it together with `wholeCode` only if you
   *   need to perform operations on some code that is not the code of a section or page.
   * @param {CommentForm} [options.commentForm] Comment form that has the code. Can be not set if
   *   `commentCode` is set or `action` is `'edit'`.
   * @returns {object}
   * @throws {CdError}
   */
  modifyWholeCode({
    action,
    formAction,
    commentCode,
    wholeCode,
    doDelete,
    thisInCode,
    commentForm,
  }) {
    thisInCode ||= this.inCode;
    wholeCode ||= thisInCode.isSectionCodeUsed ? this.section.code : this.getSourcePage().code;

    let newWholeCode;
    switch (action) {
      case 'reply': {
        const currentIndex = this.findProperPlaceForReply(thisInCode, wholeCode);
        commentCode ??= commentForm.commentTextToCode(formAction);
        newWholeCode = (
          wholeCode.slice(0, currentIndex) +
          commentCode +
          wholeCode.slice(currentIndex)
        );
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
            const repliesMatch = wholeCode
              .slice(thisInCode.endIndex)
              .match(new RegExp(`^.+\\n+[:*#]{${thisInCode.indentation.length + 1},}`));
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
          commentCode ??= commentForm.commentTextToCode(formAction);
          newWholeCode = (
            wholeCode.slice(0, thisInCode.lineStartIndex) +
            commentCode +
            wholeCode.slice(thisInCode.signatureEndIndex)
          );
        }
        break;
      }
    }

    return {
      wholeCode: newWholeCode,
      commentCode,
    };
  }

  /**
   * Request the gender of the comment's author if it is absent and affects the user mention string
   * and do something when it's received.
   *
   * @param {Function} callback
   * @param {boolean} [runAlways=false] Whether to execute the callback even if the gender request
   *   is not needed.
   */
  maybeRequestAuthorGender(callback, runAlways = false) {
    if (cd.g.genderAffectsUserString && this.author.isRegistered() && !this.author.getGender()) {
      let errorCallback;
      if (!this.genderRequest) {
        this.genderRequest = loadUserGenders([this.author]);
        errorCallback = (e) => {
          console.warn(`Couldn't get the gender of user ${this.author.getName()}.`, e);
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
   * @returns {import('./pageRegistry').Page}
   */
  getSourcePage() {
    return this.section ? this.section.getSourcePage() : pageRegistry.getCurrent();
  }

  /**
   * For a comment in a collapsed thread, get the visible collapsed note. (Collapsed threads may be
   * nested, so there can be a number of invisible collapsed notes for a comment.) If the visible
   * collapsed note is unavailable, return the top invisible collapsed note.
   *
   * @returns {?external:jQuery}
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
    return pageRegistry.getCurrent().getDecodedUrlWithFragment(this.dtId || this.id, permanent);
  }

  /**
   * @typedef {object} AddSubitemReturn
   * @property {external:jQuery} $wrappingItem
   * @property {external:jQuery} [$wrappingList]
   * @property {external:jQuery} [$outerWrapper]
   * @memberof Comment
   * @inner
   */

  /**
   * Add an item to the comment's {@link CommentSubitemList subitem list}.
   *
   * @param {string} name
   * @param {'top' | 'bottom'} position
   * @returns {AddSubitemReturn}
   */
  addSubitem(name, position) {
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
        Outer wrapper item element (<dd>, <li>, rarely <div>) - in case 1.
          Wrapping list element (<ul>) - in cases 1 and 2.
            Wrapping item element (<li>) - in cases 1, 2, and 3.
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
      // BootProcess#mergeAdjacentCommentLevels, for example when replying to
      // https://en.wikipedia.org/wiki/Wikipedia:Village_pump_(policy)#202103271157_Uanfala.
      $anchor = $anchorFirstChild;
    }
    if ($anchor.is('dl, ul')) {
      createList = false;
      wrappingItemTag = $anchor.is('ul') ? 'li' : 'dd';
      $anchor.addClass(`cd-commentLevel cd-commentLevel-${this.level + 1}`);
    } else if ($lastOfTarget.is('li')) {
      outerWrapperTag = 'li';
    } else if ($lastOfTarget.is('dd')) {
      outerWrapperTag = 'dd';
    }

    const $wrappingItem = $(`<${wrappingItemTag}>`);
    const $wrappingList = createList ?
      $('<dl>')
        .append($wrappingItem)
        .addClass(`cd-commentLevel cd-commentLevel-${this.level + 1}`) :
      undefined;

    let $outerWrapper;
    if (outerWrapperTag) {
      $outerWrapper = $(`<${outerWrapperTag}>`);

      // Why `.cd-commentLevel >`: reply to a pseudo-comment added with this diff with a mistake:
      // https://ru.wikipedia.org/?diff=113073013.
      if ($lastOfTarget.is('.cd-commentLevel:not(ol) > li, .cd-commentLevel > dd')) {
        $outerWrapper.addClass('cd-connectToPreviousItem');
      }

      $wrappingList.appendTo($outerWrapper);
    }

    if ($outerWrapper) {
      $outerWrapper.insertAfter($lastOfTarget);

      if ($lastOfTarget.closest('dl, ul, ol').is('ol')) {
        $outerWrapper.addClass('cd-skip');
        const $next = $outerWrapper.next();

        // Layout bug where not all children are `li`s:
        // https://ru.wikipedia.org/wiki/Википедия:Заявки_на_статус_администратора/Евгений_Юрьев#Против
        const index = [...$outerWrapper.parent().children('li:not(.cd-skip)')]
          .indexOf($next.get(0));

        $next.attr('value', index + 1);
      }
    } else if ($wrappingList) {
      $wrappingList.insertAfter($lastOfTarget);
    } else {
      if (position === 'top') {
        $wrappingItem.prependTo($anchor);
      } else {
        const $last = $anchor.children().last();

        // "Reply to section" button should always be the last.
        if ($last.hasClass('cd-replyButtonWrapper')) {
          $wrappingItem.insertBefore($last);
        } else {
          $wrappingItem.insertAfter($last);
        }
      }
    }

    this.subitemList.add(name, $wrappingItem);

    return { $wrappingItem, $wrappingList, $outerWrapper };
  }

  /**
   * Get a section relevant to this comment which means the same value as
   * {@link Section#getSection}. (Used for polymorphism with {@link Comment#getRelevantSection}.)
   *
   * @returns {?import('./Section').default}
   */
  getRelevantSection() {
    return this.section || null;
  }

  /**
   * Get a comment relevant to this comment which means the comment itself. (Used for polymorphism
   * with {@link Section#getRelevantComment}.)
   *
   * @returns {Comment}
   */
  getRelevantComment() {
    return this;
  }

  /**
   * Get the data identifying the comment when restoring a comment form. (Used for polymorphism with
   * {@link Section#getIdentifyingData}.)
   *
   * @returns {object}
   */
  getIdentifyingData() {
    return { id: this.id };
  }

  /**
   * Get the fragment for use in a comment wikilink.
   *
   * @returns {string}
   */
  getWikilinkFragment() {
    return this.dtId || this.id;
  }

  /**
   * Get the chain of ancestors of the comment as an array, starting with the parent comment.
   *
   * @returns {Comment[]}
   */
  getAncestors() {
    const cachedAncestors = [];
    let comment = this;
    while ((comment = comment.getParent())) {
      cachedAncestors.push(comment);
    }
    return cachedAncestors;
  }

  /**
   * Recursively expand threads if the comment is in a collapsed thread.
   */
  expandAllThreadsDownTo() {
    [this, ...this.getAncestors()]
      .filter((comment) => comment.thread?.isCollapsed)
      .forEach((comment) => {
        comment.thread.expand();
      });
  }

  /**
   * Set the {@link Comment#isNew} and {@link Comment#isSeen} properties for the comment given the
   * list of the current page visits.
   *
   * @param {number[]} currentPageVisits
   * @param {number} currentUnixTime
   * @param {boolean} isUnseenStatePassed
   * @returns {boolean} Whether there is a time conflict.
   */
  setNewAndSeenProperties(currentPageVisits, currentUnixTime, isUnseenStatePassed) {
    // Let's take 3 minutes as tolerable time discrepancy.
    const isDateInFuture = this.date && this.date.getTime() > Date.now() + cd.g.msInMin * 3;

    if (!this.date || isDateInFuture) {
      this.isNew = false;
      this.isSeen = true;
      return false;
    }

    const commentUnixTime = Math.floor(this.date.getTime() / 1000);

    const isNewerThanFirstRememberedVisit = commentUnixTime + 60 > currentPageVisits[0];
    const isOlderThanPreviousVisit = (
      commentUnixTime + 60 <= currentPageVisits[currentPageVisits.length - 1]
    );
    this.isNew = Boolean(isNewerThanFirstRememberedVisit || isUnseenStatePassed);
    this.isSeen = Boolean(
      (
        !isNewerThanFirstRememberedVisit ||
        (settings.get('highlightNewInterval') && isOlderThanPreviousVisit) ||
        this.isOwn
      ) &&
      !isUnseenStatePassed
    );

    return commentUnixTime <= currentUnixTime && currentUnixTime < commentUnixTime + 60;
  }

  /**
   * _For internal use._ Apply a very specific fix for cases when an indented comment starts with a
   * list like this:
   *
   * ```html
   * : Comment. [signature]
   * :* Item
   * :* Item
   * : Comment end. [signature]
   * ```
   *
   * which gives the following DOM:
   *
   * ```html
   * <dd>
   *   <div>Comment. [signature]</div>
   *   <ul>
   *     <li>Item</li>
   *     <li>Item</li>
   *   </ul>
   * </dd>
   * <dd>Comment end. [signature]</dd>
   * ```
   *
   * The code splits the parent item element (`dd` in this case) into two and puts the list in the
   * second one. This fixes the thread feature behavior among other things.
   */
  maybeSplitParent() {
    const previousComment = CommentStatic.getByIndex(this.index - 1);
    if (this.level !== previousComment.level) return;

    const previousCommentLastElement = previousComment
      .elements[previousComment.elements.length - 1];
    const potentialElement = previousCommentLastElement.nextElementSibling;
    if (
      ['DD', 'LI'].includes(previousCommentLastElement.parentNode.tagName) &&
      previousCommentLastElement.tagName === 'DIV' &&
      potentialElement === this.elements[0] &&
      potentialElement.tagName === 'DIV'
    ) {
      previousComment.parser.splitParentAfterNode(potentialElement.previousSibling);
    }
  }
}

export default Comment;
