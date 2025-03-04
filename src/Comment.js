/* eslint-disable no-self-assign */
import Button from './Button';
import CdError from './CdError';
import CommentButton from './CommentButton';
import CommentSkeleton from './CommentSkeleton';
import CommentSource from './CommentSource';
import CommentSubitemList from './CommentSubitemList';
import ElementsTreeWalker from './ElementsTreeWalker';
import LiveTimestamp from './LiveTimestamp';
import PrototypeRegistry from './PrototypeRegistry';
import StorageItemWithKeys from './StorageItemWithKeys';
import TreeWalker from './TreeWalker';
import bootController from './bootController';
import cd from './cd';
import commentFormRegistry from './commentFormRegistry';
import commentRegistry from './commentRegistry';
import navPanel from './navPanel';
import settings from './settings';
import talkPageController from './talkPageController';
import userRegistry from './userRegistry';
import { handleApiReject, loadUserGenders, parseCode } from './utils-api';
import { addToArrayIfAbsent, areObjectsEqual, calculateWordOverlap, countOccurrences, decodeHtmlEntities, defined, getHeadingLevel, isInline, removeFromArrayIfPresent, sleep, subtractDaysFromNow, underlinesToSpaces, unique } from './utils-general';
import { showConfirmDialog } from './utils-oojs';
import { formatDate, formatDateNative } from './utils-timestamp';
import { extractArabicNumeral, extractSignatures, removeWikiMarkup } from './utils-wikitext';
import { createSvg, getExtendedRect, getHigherNodeAndOffsetInSelection, getVisibilityByRects, mergeJquery, wrapDiffBody, wrapHtml } from './utils-window';

/**
 * @typedef {object} CommentOffset
 * @property {number} top
 * @property {number} bottom
 * @property {number} left
 * @property {number} right
 * @property {number} bottomForVisibility A solution for comments that have the height bigger than
 *   the viewport height. In Chrome, the scrolling step is 100 pixels.
 * @property {number} firstHighlightableWidth First highlightable's width to determine if the
 *   element is moved in future checks.
 * @memberof Comment
 * @inner
 */

/**
 * @typedef {object} CommentMargins
 * @property {number} left Left margin.
 * @property {number} right Right margin.
 * @memberof Comment
 * @inner
 */

/**
 * @typedef {object} ScrollToConfig
 * @property {boolean} [smooth=true] Use a smooth animation.
 * @property {boolean} [expandThreads=false] Whether to expand the threads down to the
 *   comment (to avoid the notification "The comment is in a collapsed thread").
 * @property {boolean} [flash] Whether to flash the comment as target.
 * @property {boolean} [pushState=false] Whether to push a state to the history with the
 *   comment ID as a fragment.
 * @property {() => void} [callback] Callback to run after the animation has completed.
 * @property {'top'|'center'|'bottom'} [alignment] Where should the element be positioned
 *   relative to the viewport.
 */

/**
 * @typedef {object[]} ReplaceSignatureWithHeaderReturn
 * @property {string} pageName
 * @property {HTMLAnchorElement} link
 */

/**
 * Class representing a comment (any signed, and in some cases unsigned, text on a wiki talk page).
 *
 * @template {boolean} Reformatted
 * @augments CommentSkeleton
 */
class Comment extends CommentSkeleton {
  /** @readonly */
  TYPE = 'comment';

  /**
   * @override
   * @type {HTMLElement}
   */
  signatureElement = this.signatureElement;

  /**
   * @override
   * @type {HTMLElement}
   */
  timestampElement = this.timestampElement;

  /**
   * @override
   * @type {HTMLAnchorElement}
   */
  authorLink = this.authorLink;

  /**
   * @override
   * @type {HTMLAnchorElement}
   */
  authorTalkLink = this.authorTalkLink;

  /**
   * @override
   * @type {HTMLElement[]}
   */
  elements = this.elements;

  /** @type {Reformatted} */
  reformatted;

  /** @type {Direction} */
  direction;

  /**
   * A special {@link Comment#highlightables highlightable} used to
   * {@link Comment#getLayersMargins determine layers margins}.
   *
   * @type {HTMLElement}
   * @private
   */
  marginHighlightable;

  /**
   * @typedef {this extends Comment<true> ? HTMLElement : undefined} HTMLElementIfReformatted
   */

  /**
   * @type {HTMLElementIfReformatted}
   */
  headerElement;

  /**
   * @type {HTMLElementIfReformatted}
   */
  menuElement;

  /**
   * @typedef {this extends Comment<true> ? JQuery<HTMLElementIfReformatted> : undefined} JQueryIfReformatted
   */

  /**
   * Comment header. Used when comment reformatting is enabled.
   *
   * @type {JQueryIfReformatted}
   */
  $header;

  /**
   * Comment menu. Used when comment reformatting is enabled; otherwise
   * {@link Comment#$overlayMenu} is used.
   *
   * @type {JQueryIfReformatted}
   */
  $menu;

  /**
   * _For internal use._ Comment's underlay as a native (non-jQuery) element.
   *
   * @type {?HTMLElement}
   */
  underlay;

  /**
   * Comment's overlay.
   *
   * @type {?HTMLElement}
   * @private
   */
  overlay;

  /**
   * Line element in comment's overlay.
   *
   * @type {HTMLElement}
   * @private
   */
  line;

  /**
   * Comment's side marker.
   *
   * @type {HTMLElement}
   * @private
   */
  marker;

  /**
   * Inner wrapper in comment's overlay.
   *
   * @type {HTMLElement}
   * @private
   */
  overlayInnerWrapper;

  /**
   * Gradient element in comment's overlay.
   *
   * @type {HTMLElement}
   * @private
   */
  overlayGradient;

  /**
   * Menu element in comment's overlay.
   *
   * @type {HTMLElement}
   * @private
   */
  overlayMenu;

  /**
   * Comment's underlay.
   *
   * @type {?JQuery}
   */
  $underlay;

  /**
   * Comment's overlay.
   *
   * @type {?JQuery}
   */
  $overlay;

  /**
   * Comment's side marker.
   *
   * @type {JQuery}
   */
  $marker;

  /**
   * Menu element in the comment's overlay.
   *
   * @type {JQuery}
   */
  $overlayMenu;

  /**
   * Gradient element in the comment's overlay.
   *
   * @type {JQuery}
   */
  $overlayGradient;

  /**
   * Is the comment new. Is set to boolean only on active pages (not archived, not old diffs)
   * excluding pages that are visited for the first time.
   *
   * @type {?boolean}
   */
  isNew = null;

  /**
   * Has the comment been seen if it is new. Is set only on active pages (not archived, not old
   * diffs) excluding pages that are visited for the first time. Check using `=== false` if you
   * need to know if the comment is highlighted as new and unseen.
   *
   * @type {?boolean}
   */
  isSeen = null;

  /**
   * Is the comment currently highlighted as a target comment.
   *
   * @type {boolean}
   */
  isTarget = false;

  /**
   * Is the comment currently hovered.
   *
   * @type {boolean}
   */
  isHovered = false;

  /**
   * Has the comment changed since the previous visit.
   *
   * @type {?boolean}
   */
  isChangedSincePreviousVisit = null;

  /**
   * Has the comment changed while the page was idle. (The new version may be rendered and may be
   * not, if the layout is too complex.)
   *
   * @type {?boolean}
   */
  isChanged = null;

  /**
   * Was the comment deleted while the page was idle.
   *
   * @type {?boolean}
   */
  isDeleted = null;

  /**
   * Should the comment be flashed as changed when it appears in sight.
   *
   * @type {?boolean}
   */
  willFlashChangedOnSight = false;

  /**
   * Is the comment (or its signature) inside a table containing only one comment.
   *
   * @type {boolean}
   */
  isTableComment = false;

  /**
   * Is the comment a part of a collapsed thread.
   *
   * @type {boolean}
   */
  isCollapsed = false;

  /**
   * If the comment is collapsed, that's the closest collapsed thread that this comment is related
   * to.
   *
   * @type {?import('./Thread').default}
   */
  collapsedThread = null;

  /**
   * List of the comment's {@link CommentSubitemList subitems}.
   *
   * @type {CommentSubitemList}
   */
  subitemList = new CommentSubitemList();

  wasMenuHidden = false;

  /** @type {Array<() => void>} */
  genderRequestCallbacks = [];

  /**
   * Is there a "gap" in the comment between {@link Comment#highlightable highlightables} that needs
   * to be closed visually so that the comment looks like one comment and not several.
   *
   * @type {boolean}
   */
  isLineGapped;

  /**
   * Has the comment been seen before it was changed.
   *
   * @type {?boolean}
   * @private
   */
  isSeenBeforeChanged = null;

  /** @type {import('./Thread').default} */
  thread;

  /** @type {string|undefined} */
  dtId;

  /**
   * The comment's coordinates.
   *
   * @type {?CommentOffset}
   */
  offset;

  /**
   * The comment's rough coordinates (without taking into account floating elements around the
   * comment).
   *
   * @type {?CommentOffset}
   */
  roughOffset;

  /** @type {?import('./Section').default} */
  section;

  /**
   * Comment's source code object.
   *
   * @type {?CommentSource|undefined}
   */
  source;

  /**
   * Create a comment object.
   *
   * @param {import('./Parser').default} parser
   * @param {import('./Parser').SignatureTarget} signature Signature object returned by
   *   {@link Parser#findSignatures}.
   * @param {import('./Parser').Target[]} targets Sorted target objects returned by
   *   {@link Parser#findSignatures} + {@link Parser#findHeadings}.
   */
  constructor(parser, signature, targets) {
    super(parser, signature, targets);

    /**
     * @see CommentSkeleton#highlightables
     */
    this.highlightables = /** @type {HTMLElement[]} */ (this.highlightables);

    this.reformatted = /** @type {Reformatted} */ (settings.get('reformatComments') || false);
    this.showContribsLink = settings.get('showContribsLink');
    this.hideTimezone = settings.get('hideTimezone');
    this.timestampFormat = settings.get('timestampFormat');
    this.useUiTime = settings.get('useUiTime');
    this.countEditsAsNewComments = settings.get('countEditsAsNewComments');

    /**
     * Comment author user object.
     *
     * @type {import('./userRegistry').User}
     */
    this.author = userRegistry.get(this.authorName);

    /**
     * Comment signature element.
     *
     * @type {JQuery}
     */
    this.$signature = $(this.signatureElement);

    /**
     * Is the comment actionable, i.e. you can reply to or edit it. A comment is actionable if it is
     * not in a closed discussion or an old diff page. (Previously the presence of an author was
     * also checked, but currently all comments should have an author.)
     *
     * @type {boolean}
     */
    this.isActionable = Boolean(
      cd.page.isActive() &&
        !talkPageController.getClosedDiscussions().some((el) => el.contains(this.elements[0]))
    );

    this.isEditable = this.isActionable && (this.isOwn || settings.get('allowEditOthersComments'));

    // @ts-ignore
    this.highlightables.forEach(this.bindEvents.bind(this));

    this.updateMarginHighlightable();

    /**
     * Get the type of the list that `el` is an item of. This function traverses the ancestors of `el`
     * and returns the tag name of the first ancestor that has the class `cd-commentLevel`.
     *
     * @param {Element} el
     * @returns {?ListType}
     * @private
     */
    const getContainerListType = (el) => {
      const treeWalker = new ElementsTreeWalker(talkPageController.rootElement, el);
      while (treeWalker.parentNode()) {
        if (treeWalker.currentNode.classList.contains('cd-commentLevel')) {
          return /** @type {ListType} */ (treeWalker.currentNode.tagName.toLowerCase());
        }
      }

      return null;
    };

    if (this.level !== 0) {
      /**
       * Name of the tag of the list that this comment is an item of. `'dl'`, `'ul'`, `'ol'`, or
       * `null`.
       *
       * @type {?ListType}
       */
      // @ts-ignore
      this.containerListType = getContainerListType(this.highlightables[0]);

      this.mhContainerListType = getContainerListType(this.marginHighlightable);
    }
  }

  /**
   * Check if the comment is reformatted.
   *
   * @returns {this is Comment<true>}
   */
  isReformatted() {
    return this.reformatted;
  }

  /**
   * Set the {@link Comment#marginHighlightable} element.
   *
   * @private
   */
  updateMarginHighlightable() {
    if (this.highlightables.length > 1) {
      const nestingLevels = [];
      const closestListTypes = [];
      const firstAndLastHighlightable = [
        this.highlightables[0],
        this.highlightables[this.highlightables.length - 1],
      ];
      firstAndLastHighlightable.forEach((highlightable, i) => {
        const treeWalker = new ElementsTreeWalker(talkPageController.rootElement, highlightable);
        nestingLevels[i] = 0;
        while (treeWalker.parentNode()) {
          nestingLevels[i]++;
          if (!closestListTypes[i] && ['DL', 'UL', 'OL'].includes(treeWalker.currentNode.tagName)) {
            closestListTypes[i] = treeWalker.currentNode.tagName.toLowerCase();
          }
        }
      });
      const minNestingLevel = Math.min(...nestingLevels);
      let marginHighlightableIndex;
      for (let i = 0; i < 2; i++) {
        if (
          marginHighlightableIndex === undefined
            ? nestingLevels[i] === minNestingLevel
            : closestListTypes[marginHighlightableIndex] === 'ol' && closestListTypes[i] !== 'ol'
        ) {
          marginHighlightableIndex = i;
        }
      }

      this.marginHighlightable =
        firstAndLastHighlightable[/** @type {number} */ (marginHighlightableIndex)];
    } else {
      this.marginHighlightable = this.highlightables[0];
    }
  }

  /**
   * Process a possible signature node or a node that contains text which is part of a signature.
   *
   * @param {?Node} node
   * @param {boolean} [isSpaced=false] Was the previously removed node start with a space.
   * @private
   */
  processPossibleSignatureNode(node, isSpaced = false) {
    if (!node) return;

    // Remove text at the end of the element that looks like a part of the signature.
    if (node instanceof Text || (node instanceof Element && !node.children.length)) {
      node.textContent = node.textContent
        .replace(cd.config.signaturePrefixRegexp, '')
        .replace(cd.config.signaturePrefixRegexp, '');
    }

    // Remove the entire element.
    if (
      node instanceof Element &&
      node.textContent.length < 30 &&
      ((!isSpaced &&
        (node.getAttribute('style') || ['SUP', 'SUB'].includes(node.tagName)) &&
        // Templates like "citation needed" or https://ru.wikipedia.org/wiki/Template:-:
        !node.classList.length) ||
        // Cases like https://ru.wikipedia.org/?diff=119667594
        (// https://ru.wikipedia.org/wiki/Обсуждение_участника:Adamant.pwn/Архив/2023#c-Adamant.pwn-20230722131600-Rampion-20230722130800
        (node.getAttribute('style') ||
          // https://en.wikipedia.org/?oldid=1220458782#c-Dxneo-20240423211700-Dilettante-20240423210300
          ['B', 'STRONG'].includes(node.tagName)) &&
          node.textContent.toLowerCase() === this.author.getName().toLowerCase()))
    ) {
      node.remove();
    }
  }

  /**
   * Clean up the signature and elements in front of it.
   *
   * @private
   */
  // @ts-ignore
  cleanUpSignature() {
    let previousNode = this.signatureElement.previousSibling;

    // Cases like https://ru.wikipedia.org/?diff=117350706
    if (!previousNode) {
      const parentElement = this.signatureElement.parentElement;
      const parentPreviousNode = parentElement?.previousSibling;
      if (parentPreviousNode && isInline(parentPreviousNode, true)) {
        const parentPreviousElementNode = parentElement?.previousElementSibling;

        // Make sure we don't erase some blockquote with little content.
        if (!parentPreviousElementNode || isInline(parentPreviousElementNode)) {
          previousNode = parentPreviousNode;
        }
      }
    }

    const previousPreviousNode = previousNode?.previousSibling;

    // Use this to tell the cases where a styled element should be kept
    // https://commons.wikimedia.org/?diff=850489596 from cases where it should be removed
    // https://en.wikipedia.org/?diff=1229675944
    const isPpnSpaced = previousNode?.textContent.startsWith(' ');

    this.processPossibleSignatureNode(previousNode);
    if (
      previousNode &&
      previousPreviousNode &&
      (!previousNode.parentNode || !previousNode.textContent.trim())
    ) {
      const previousPreviousPreviousNode = previousPreviousNode.previousSibling;
      const isPppnSpaced = previousPreviousNode?.textContent.startsWith(' ');
      this.processPossibleSignatureNode(previousPreviousNode, isPpnSpaced);

      // Rare cases like https://en.wikipedia.org/?diff=1022471527
      if (!previousPreviousNode.parentNode) {
        this.processPossibleSignatureNode(previousPreviousPreviousNode, isPppnSpaced);
      }
    }
  }

  /**
   * Do nearly the same thing as {@link Comment#reviewHighlightables} for the second time: if
   * {@link Comment#reviewHighlightables} has altered the highlightables, this will save the day.
   *
   * @private
   */
  // @ts-ignore
  rewrapHighlightables() {
    [this.highlightables[0], this.highlightables[this.highlightables.length - 1]]
      .filter(unique)
      .filter(
        (el) =>
          cd.g.badHighlightableElements.includes(el.tagName) ||
          (this.highlightables.length > 1 &&
            el.tagName === 'LI' &&
            el.parentElement?.tagName === 'OL') ||
          Array.from(el.classList).some((name) => !name.startsWith('cd-'))
      )
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
   * _For internal use._ Add a comment header to the top highlightable element. Remove the comment
   * signature unless there is more than one of them.
   *
   * @returns {ReplaceSignatureWithHeaderReturn} Pages to check existence of.
   * @throws {CdError}
   */
  replaceSignatureWithHeader() {
    if (!this.isReformatted()) {
      throw new CdError();
    }

    const pagesToCheckExistence = [];

    const headerWrapper = Comment.prototypes.get('headerWrapperElement');
    this.headerElement = /** @type {HTMLElementIfReformatted} */ (headerWrapper.firstChild);
    const authorWrapper = /** @type {HTMLElement} */ (this.headerElement.firstChild);
    const authorLink = /** @type {HTMLAnchorElement} */ (authorWrapper.firstChild);
    const authorLinksWrapper = /** @type {HTMLElement} */ (authorLink.nextElementSibling);
    const bdiElement = /** @type {HTMLElement} */ (authorLink.firstChild);
    const authorTalkLink = /** @type {HTMLAnchorElement} */ (authorLinksWrapper.firstElementChild);
    let contribsLink;
    if (this.showContribsLink) {
      contribsLink = /** @type {HTMLAnchorElement} */ (authorLinksWrapper.lastElementChild);
      if (!this.author.isRegistered()) {
        /** @type {HTMLElement} */ (contribsLink.previousSibling).remove();
        contribsLink.remove();
      }
    }

    if (this.authorLink) {
      // Move the existing author link to the header.

      if (this.extraSignatures.length) {
        this.authorLink = /** @type {HTMLAnchorElement} */ (this.authorLink.cloneNode(true));
      }

      const beforeAuthorLinkParseReturn = cd.config.beforeAuthorLinkParse?.(
        this.authorLink,
        authorLink
      );
      authorLink.replaceWith(this.authorLink);
      this.authorLink.classList.add('cd-comment-author');
      this.authorLink.innerHTML = '';
      this.authorLink.appendChild(bdiElement);

      cd.config.afterAuthorLinkParse?.(this.authorLink, beforeAuthorLinkParseReturn);
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
        pageName = `${cd.g.contribsPages[0]}/${this.author.getName()}`;
      }
      this.authorLink.title = pageName;
      this.authorLink.href = mw.util.getUrl(pageName);
    }

    if (this.authorTalkLink) {
      // Move the existing author talk link to the header.
      if (this.extraSignatures.length) {
        this.authorTalkLink = /** @type {HTMLAnchorElement} */ (
          this.authorTalkLink.cloneNode(true)
        );
      }
      authorTalkLink.replaceWith(this.authorTalkLink);
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

    if (contribsLink && this.author.isRegistered()) {
      const pageName = `${cd.g.contribsPages[0]}/${this.author.getName()}`;
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
        classes: ['cd-comment-button-label', 'cd-comment-timestamp', 'mw-selflink-fragment'],
        action: this.copyLink.bind(this),
        href: this.dtId && '#' + this.dtId,
      });

      this.headerElement.appendChild(this.copyLinkButton.element);
      this.timestampElement = this.copyLinkButton.labelElement;
      if (this.date) {
        new LiveTimestamp(this.timestampElement, this.date, !this.hideTimezone).init();
      }
    }

    this.$header = /** @type {JQueryIfReformatted} */ ($(this.headerElement));

    this.rewrapHighlightables();
    this.highlightables[0].insertBefore(headerWrapper, this.highlightables[0].firstChild);

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
   *
   * @throws {CdError}
   */
  addMenu() {
    if (!this.isReformatted()) {
      throw new CdError();
    }

    const menuElement = /** @type {HTMLElement} */ (document.createElement('div'));
    menuElement.className = 'cd-comment-menu';
    this.menuElement = /** @type {HTMLElementIfReformatted} */ (menuElement);
    this.$menu = /** @type {JQueryIfReformatted} */ ($(menuElement));

    this.addReplyButton();
    this.addEditButton();
    this.addThankButton();
    this.addGoToParentButton();

    // The menu may be re-added (after a comment's content is updated). We need to restore
    // something.
    if (this.targetChild) {
      this.addGoToChildButton(this.targetChild);
    }

    // We need a wrapper to ensure correct positioning in LTR-in-RTL situations and vice versa.
    const menuWrapper = document.createElement('div');
    menuWrapper.className = 'cd-comment-menu-wrapper';
    menuWrapper.appendChild(this.menuElement);

    this.highlightables[this.highlightables.length - 1].appendChild(menuWrapper);
  }

  /**
   * Create a {@link Comment#replyButton reply button} and add it to the comment menu
   * ({@link Comment#$menu} or {@link Comment#$overlayMenu}).
   *
   * @private
   */
  addReplyButton() {
    if (!this.isActionable) return;

    const action = this.replyButtonClick.bind(this);
    if (this.isReformatted()) {
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
      this.replyButton = new CommentButton({
        buttonElement: Comment.prototypes.get('replyButton'),
        action,
        widgetConstructor: /** @type {() => OO.ui.ButtonWidget} */ (
          Comment.prototypes.getWidget('replyButton')
        ),
      });
      this.overlayMenu.appendChild(this.replyButton.element);
    }

    if (
      commentRegistry.getByIndex(this.index + 1)?.isOutdented &&
      (!this.section ||
        // Probably shouldn't add a comment to a numbered list
        this.elements[0].matches('ol *'))
    ) {
      this.replyButton.setDisabled(true);
      this.replyButton.setTooltip(cd.s('cm-reply-outdented-tooltip'));
    }
  }

  /**
   * Check whether the comment can be edited.
   *
   * @returns {boolean}
   */
  canBeEdited() {
    return this.isEditable;
  }

  /**
   * Create an {@link Comment#editButton edit button} and add it to the comment menu
   * ({@link Comment#$menu} or {@link Comment#$overlayMenu}).
   *
   * @private
   */
  addEditButton() {
    if (!this.isEditable) return;

    const action = this.editButtonClick.bind(this);
    if (this.isReformatted()) {
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
      this.editButton = new CommentButton({
        buttonElement: Comment.prototypes.get('editButton'),
        action,
        widgetConstructor: /** @type {() => OO.ui.ButtonWidget} */ (
          Comment.prototypes.getWidget('editButton')
        ),
      });
      this.overlayMenu.appendChild(this.editButton.element);
    }
  }

  /**
   * Create a {@link Comment#thankButton thank button} and add it to the comment menu
   * ({@link Comment#$menu} or {@link Comment#$overlayMenu}).
   *
   * @private
   */
  addThankButton() {
    if (!cd.user.isRegistered() || !this.author.isRegistered() || !this.date || this.isOwn) return;

    const isThanked = Object.values(Comment.thanksStorage.getData()).some(
      (thank) => this.dtId === thank.id || this.id === thank.id
    );

    const action = this.thankButtonClick.bind(this);
    if (this.isReformatted()) {
      /**
       * Thank button.
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
      this.thankButton = new CommentButton({
        buttonElement: Comment.prototypes.get('thankButton'),
        action,
        widgetConstructor: /** @type {() => OO.ui.ButtonWidget} */ (
          Comment.prototypes.getWidget('thankButton')
        ),
      });
      this.overlayMenu.appendChild(this.thankButton.element);
    }

    if (isThanked) {
      this.setThanked();
    }
  }

  /**
   * Create a {@link Comment#copyLinkButton copy link button} and add it to the comment menu
   * ({@link Comment#$overlayMenu}).
   *
   * @private
   */
  addCopyLinkButton() {
    if (!this.id || this.isReformatted()) return;

    this.copyLinkButton = new CommentButton({
      buttonElement: Comment.prototypes.get('copyLinkButton'),
      action: this.copyLink.bind(this),
      widgetConstructor: /** @type {() => OO.ui.ButtonWidget} */ (
        Comment.prototypes.getWidget('copyLinkButton')
      ),
      href: this.dtId && '#' + this.dtId,
    });
    this.overlayMenu.appendChild(this.copyLinkButton.element);
  }

  /**
   * Create a {@link Comment#goToParentButton "Go to parent" button} and add it to the comment
   * header ({@link Comment#$header} or {@link Comment#$overlayMenu}).
   *
   * @private
   */
  addGoToParentButton() {
    if (!this.getParent()) return;

    const action = this.goToParentButtonClick.bind(this);
    if (this.isReformatted()) {
      /**
       * "Go to the parent comment" button.
       *
       * @type {CommentButton}
       */
      this.goToParentButton = new CommentButton({
        tooltip: cd.s('cm-gotoparent-tooltip'),
        classes: ['cd-comment-button-icon', 'cd-comment-button-goToParent', 'cd-icon'],
        action,
      });

      this.goToParentButton.element.appendChild(Comment.prototypes.get('goToParentButtonSvg'));

      this.headerElement.appendChild(this.goToParentButton.element);
    } else {
      this.goToParentButton = new CommentButton({
        buttonElement: Comment.prototypes.get('goToParentButton'),
        action,
        widgetConstructor: /** @type {() => OO.ui.ButtonWidget} */ (
          Comment.prototypes.getWidget('goToParentButton')
        ),
      });
      this.overlayMenu.appendChild(this.goToParentButton.element);
    }
  }

  /**
   * Create a {@link Comment#goToChildButton "Go to child" button} and add it to the comment header
   * ({@link Comment#$header} or {@link Comment#$overlayMenu}).
   *
   * @param {Comment} child Child comment to go to.
   * @private
   */
  addGoToChildButton(child) {
    this.targetChild = child;

    this.configureLayers();

    if (!this.goToChildButton?.isConnected()) {
      const action = () => {
        /** @type {Comment} */ (this.targetChild).scrollTo({ pushState: true });
      };

      if (this.isReformatted()) {
        /**
         * "Go to the child comment" button.
         *
         * @type {CommentButton}
         */
        this.goToChildButton = new CommentButton({
          tooltip: cd.s('cm-gotochild-tooltip'),
          classes: ['cd-comment-button-icon', 'cd-comment-button-goToChild', 'cd-icon'],
          action,
        });
        $(this.goToChildButton.element).append(
          createSvg(16, 16, 20, 20).html(`<path d="M10 15L2 5h16z" />`)
        );

        this.headerElement.insertBefore(
          this.goToChildButton.element,
          (this.goToParentButton?.element || this.timestampElement)?.nextSibling
        );
      } else if (this.$overlayMenu) {
        const buttonElement = Comment.prototypes.get('goToChildButton');
        this.goToChildButton = new CommentButton({
          element: buttonElement,
          widgetConstructor: /** @type {() => OO.ui.ButtonWidget} */ (
            Comment.prototypes.getWidget('goToChildButton')
          ),
          action,
        });
        this.$overlayMenu.prepend(buttonElement);
      }
    }
  }

  /**
   * _For internal use._ Create a
   * {@link Comment#toggleChildThreadsButton "Toggle child threads" button} and add it to the
   * comment header. Don't add to the overlay menu of the classic design - it occupies valuable
   * space there. The user may use Shift+click on a thread line instead.
   */
  addToggleChildThreadsButton() {
    if (
      !this.isReformatted() ||
      !this.getChildren().some((child) => child.thread) ||
      this.toggleChildThreadsButton?.isConnected()
    ) {
      return;
    }

    /**
     * "Toggle children comments" button.
     *
     * @type {CommentButton}
     */
    this.toggleChildThreadsButton = new CommentButton({
      tooltip: cd.s('cm-togglechildthreads-tooltip'),
      classes: ['cd-comment-button-icon', 'cd-comment-button-toggleChildThreads', 'cd-icon'],
      action: this.toggleChildThreadsButtonClick.bind(this),
    });
    this.updateToggleChildThreadsButton();

    this.headerElement.insertBefore(
      this.toggleChildThreadsButton.element,
      this.$changeNote?.[0] || null
    );
  }

  /**
   * Update the look of the "Toggle children" button.
   */
  updateToggleChildThreadsButton() {
    if (!this.toggleChildThreadsButton) return;

    const childrenCollapsed = this.areChildThreadsCollapsed();
    this.toggleChildThreadsButton.element.innerHTML = '';
    this.toggleChildThreadsButton.element.appendChild(
      childrenCollapsed
        ? Comment.prototypes.get('expandChildThreadsButtonSvg')
        : Comment.prototypes.get('collapseChildThreadsButtonSvg')
    );
  }

  /**
   * Check whether all child comments' threads are collapsed.
   *
   * @returns {boolean}
   */
  areChildThreadsCollapsed() {
    return this.getChildren().every((child) => !child.thread || child.thread.isCollapsed);
  }

  /**
   * Given a date, format it as per user settings, and build a title (tooltip) too.
   *
   * @param {Date} date
   * @param {string} originalTimestamp
   * @returns {object}
   */
  formatTimestamp(date, originalTimestamp) {
    let timestamp;
    let title = '';
    if (!cd.g.areTimestampsDefault) {
      timestamp = formatDate(date, !this.hideTimezone);
    }

    if (
      this.timestampFormat === 'relative' &&
      this.useUiTime &&
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
      if (!this.isReformatted() || this.extraSignatures.length) {
        this.timestampElement.textContent = timestamp;
        this.timestampElement.title = title;
        new LiveTimestamp(this.timestampElement, this.date, !this.hideTimezone).init();
        this.extraSignatures.forEach((sig) => {
          const { timestamp, title } = this.formatTimestamp(sig.date, sig.timestampText);
          sig.timestampElement.textContent = timestamp;
          sig.timestampElement.title = title;
          new LiveTimestamp(sig.timestampElement, sig.date, !this.hideTimezone).init();
        });
      }
    }
  }

  /**
   * Bind the standard events to a comment part. Executed on comment object creation and DOM
   * modifications affecting comment parts.
   *
   * @param {HTMLElement} element
   * @private
   */
  bindEvents(element) {
    if (this.isReformatted()) return;

    element.onmouseenter = this.highlightHovered.bind(this);
    element.onmouseleave = this.unhighlightHovered.bind(this);
    element.ontouchstart = this.highlightHovered.bind(this);
  }

  /**
   * _For internal use._ Filter out floating and hidden elements from the comment's
   * {@link CommentSkeleton#highlightables highlightables}, change their attributes, and update the
   * comment's level and parent elements' level classes.
   */
  reviewHighlightables() {
    for (let i = 0; i < this.highlightables.length; i++) {
      const el = this.highlightables[i];
      const areThereClassedElements = Array.from(el.classList).some(
        (name) => !name.startsWith('cd-') || name === 'cd-comment-replacedPart'
      );
      if (areThereClassedElements) {
        const isReplacement = i === 0 && el.classList.contains('cd-comment-replacedPart');
        const testElement = /** @type {HTMLElement} */ (isReplacement ? el.firstChild : el);

        // Node that we could use window.getComputerStyle here, but avoid it to avoid the reflow.
        if (
          // Currently we can't have comments with no highlightable elements.
          this.highlightables.length > 1 &&
          (talkPageController.getFloatingElements().includes(testElement) ||
            talkPageController.getHiddenElements().includes(testElement))
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
          this.updateLevels(false);
          this.updateMarginHighlightable();

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
      if (this.isSelected) {
        this.fixSelection();
        this.replyForm.quote(true, this);
      } else {
        this.replyForm.cancel();
      }
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
   * Handle the "Toggle child threads" button click.
   *
   * @private
   */
  // @ts-ignore
  toggleChildThreadsButtonClick() {
    this.toggleChildThreads();
  }

  /**
   * @template {boolean} [Set=false]
   * @typedef {object} GetOffsetOptions
   * @property {import('./utils-window').ExtendedDOMRect[]} [options.floatingRects]
   *   {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect Element#getBoundingClientRect}
   *   results for floating elements from `convenientDiscussions.g.floatingElements`. It may be
   *   calculated in advance for many elements in one sequence to save time.
   * @property {boolean} [options.considerFloating] Whether to take floating elements around the
   *   comment into account. Deemed `true` if `options.floatingRects` is set.
   * @property {Set} [options.set] Whether to set the offset to the `offset` (if
   *   `options.considerFloating` is `true`) or `roughOffset` (if `options.considerFloating` is
   *   `false`) property. If `true`, the function will return a boolean value indicating if the
   *   comment is moved instead of the offset. (This value can be used to stop recalculating comment
   *   offsets if a number of comments in a row have not moved for optimization purposes.) Setting
   *   the `offset` property implies that the layers offset will be updated afterwards (see
   *   {@link Comment#updateLayersOffset}) - otherwise, the next attempt to call this method to
   *   update the layers offset will return `false` meaning the comment isn't moved, and the layers
   *   offset will stay wrong.
   */

  /**
   * @overload
   * @param {GetOffsetOptions} [options]
   * @returns {?CommentOffset}
   *
   * @overload
   * @param {GetOffsetOptions<true>} [options]
   * @returns {?boolean}
   */

  /**
   * Get the coordinates of the comment. Optionally set them as the `offset` or `roughOffset`
   * property. Also set the {@link Comment#isStartStretched isStartStretched} and
   * {@link Comment#isEndStretched isEndStretched} properties (if `options.considerFloating` is
   * `true`).
   *
   * Note that comment coordinates are not static, obviously, but we need to recalculate them only
   * occasionally.
   *
   * @param {GetOffsetOptions<boolean>} [options={}]
   * @returns {?(CommentOffset|boolean)} Offset object. If the comment is not visible, returns
   *   `null`. If `options.set` is `true`, returns a boolean value indicating if the comment is
   *   moved instead of the offset.
   */
  getOffset(options = {}) {
    options.considerFloating ??= Boolean(options.floatingRects);
    options.set ??= false;

    let firstElement;
    let lastElement;
    if (this.editForm) {
      firstElement = lastElement = this.editForm.getOutermostElement();
    } else {
      firstElement = this.highlightables[0];
      lastElement = this.highlightables[this.highlightables.length - 1];
    }

    let rectTop = Comment.getCommentPartRect(firstElement);
    let rectBottom = this.elements.length === 1 ? rectTop : Comment.getCommentPartRect(lastElement);

    if (!getVisibilityByRects(rectTop, rectBottom)) {
      this.setOffset(null, options);
      return null;
    }

    // Seems like caching this value significantly helps performance at least in Chrome. But need to
    // be sure the viewport can't jump higher when it is at the bottom point of the page after some
    // content starts to occupy less space.
    const scrollY = window.scrollY;

    const isMoved = this.offset
      ? // This value will be `true` wrongly if the comment is around floating elements. But that
        // doesn't hurt much.
        // Has the top changed. With scale other than 100% values of less than 0.001 appear in
        // Chrome and Firefox.
        !(Math.abs(scrollY + rectTop.top - this.offset.top) < 0.01) ||
        // Has the height changed
        !(
          Math.abs(rectBottom.bottom - rectTop.top - (this.offset.bottom - this.offset.top)) < 0.01
        ) ||
        // Has the width of the first highlightable changed
        !(Math.abs(this.highlightables[0].offsetWidth - this.offset.firstHighlightableWidth) < 0.01)
      : true;
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
      [rectTop, rectBottom] = this.getAdjustedRects(
        rectTop,
        rectBottom,
        top,
        bottom,
        options.floatingRects
      );
    }

    const scrollX = window.scrollX;
    const left = scrollX + Math.min(rectTop.left, rectBottom.left);
    const right = scrollX + Math.max(rectTop.right, rectBottom.right);

    if (options.considerFloating) {
      this.updateStretched(left, right);
    }

    const offset = {
      top,
      bottom,
      left,
      right,
      bottomForVisibility:
        bottom - top > window.innerHeight - 250 ? top + (window.innerHeight - 250) : bottom,
      firstHighlightableWidth: firstElement.offsetWidth,
    };
    this.setOffset(offset, options);

    return options.set ? true : offset;
  }

  /**
   * If `options.set` is `true`, set the offset to the `offset` (if `options.considerFloating` is
   * `true`) or `roughOffset` (if `options.considerFloating` is `false`) property.
   *
   * @param {?CommentOffset} offset
   * @param {GetOffsetOptions<boolean>} options
   * @private
   */
  setOffset(offset, options) {
    if (!options.set) return;

    if (options.considerFloating) {
      this.offset = offset;
    } else {
      this.roughOffset = offset;
    }
  }

  /**
   * Get the top and bottom rectangles of a comment while taking into account floating elements
   * around the comment.
   *
   * @param {import('./utils-window').AnyDOMRect} rectTop Top rectangle that was got without taking
   *   into account floating elements around the comment.
   * @param {import('./utils-window').AnyDOMRect} rectBottom Bottom rectangle that was got without
   *   taking into account floating elements around the comment.
   * @param {number} top Top coordonate of the comment (calculated without taking floating elements
   *   into account).
   * @param {number} bottom Bottom coordonate of the comment (calculated without taking floating
   *   elements into account).
   * @param {object[]} [floatingRects=controller.getFloatingElements().map(getExtendedRect)]
   *   {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect Element#getBoundingClientRect}
   *   results for floating elements from `convenientDiscussions.g.floatingElements`. It may be
   *   calculated in advance for many elements in one sequence to save time.
   * @returns {[import('./utils-window').AnyDOMRect, import('./utils-window').AnyDOMRect]}
   * @private
   */
  getAdjustedRects(
    rectTop,
    rectBottom,
    top,
    bottom,
    floatingRects = talkPageController.getFloatingElements().map(getExtendedRect)
  ) {
    // Check if the comment offset intersects the offsets of floating elements on the page. (Only
    // then would we need altering comment styles to get the correct offset which is an expensive
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

      rectTop = Comment.getCommentPartRect(this.highlightables[0]);
      rectBottom =
        this.elements.length === 1
          ? rectTop
          : Comment.getCommentPartRect(this.highlightables[this.highlightables.length - 1]);

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
          if (talkPageController.getFloatingElements().some((floatingEl) => el.contains(floatingEl))) {
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
  updateStretched(left, right) {
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

    if (!this.getLayersContainer().cdIsTopLayersContainer) return;

    if (this.level === 0) {
      const offsets = bootController.getContentColumnOffsets();

      // 2 instead of 1 for Timeless
      const leftStretched = left - offsets.startMargin - 2;
      const rightStretched = right + offsets.startMargin + 2;

      this.isStartStretched =
        this.getDirection() === 'ltr'
          ? leftStretched <= offsets.start
          : rightStretched >= offsets.start;
      this.isEndStretched =
        this.getDirection() === 'ltr'
          ? rightStretched >= offsets.end
          : leftStretched <= offsets.end;
    }
  }

  /**
   * Get the comment's text direction. It can be different from the text direction of the site's
   * content language on pages with text marked with the class `mw-content-ltr` or `mw-content-rtl`
   * inside the content.
   *
   * @returns {Direction}
   */
  getDirection() {
    if (!this.direction) {
      this.direction = talkPageController.areThereLtrRtlMixes()
        ? this.elements
            // Take the last element because the first one may be the section heading which can have
            // another direction.
            .slice(-1)[0]
            .closest('.mw-content-ltr, .mw-content-rtl')
            ?.classList.contains('mw-content-rtl')
          ? 'rtl'
          : 'ltr'
        : cd.g.contentDirection;
    }

    return this.direction;
  }

  /**
   * Get the left and right margins of the comment layers or the expand note.
   * {@link Comment#isStartStretched isStartStretched} and
   * {@link Comment#isEndStretched isEndStretched} should have already been set.
   *
   * @returns {CommentMargins}
   */
  getMargins() {
    let startMargin;
    if (this.mhContainerListType === 'ol') {
      // `this.highlightables.length === 1` is a workaround for cases such as
      // https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#202005160930_Example.
      startMargin =
        this.highlightables.length === 1
          ? cd.g.contentFontSize * 3.2
          : cd.g.contentFontSize * 2.2 - 1;
    } else if (this.isStartStretched) {
      startMargin = bootController.getContentColumnOffsets().startMargin;
    } else {
      const marginElement = this.thread.$expandNote?.[0] || this.marginHighlightable;
      if (marginElement.parentElement?.classList.contains('cd-commentLevel')) {
        startMargin = -1;
      } else {
        if (
          this.offset &&
          marginElement.parentElement?.parentElement?.classList.contains('cd-commentLevel')
        ) {
          const prop = this.getDirection() === 'ltr' ? 'left' : 'right';
          startMargin =
            Math.abs(
              this.offset[prop] - marginElement.parentElement?.getBoundingClientRect()[prop]
            ) - 1;
        } else {
          startMargin = this.level === 0 ? cd.g.commentFallbackSideMargin : cd.g.contentFontSize;
        }
      }
    }
    const endMargin = this.isEndStretched
      ? bootController.getContentColumnOffsets().startMargin
      : cd.g.commentFallbackSideMargin;

    const left = this.getDirection() === 'ltr' ? startMargin : endMargin;
    const right = this.getDirection() === 'ltr' ? endMargin : startMargin;

    return { left, right };
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
   * @param {object[]} [options.floatingRects]
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

    const isMoved = this.computeLayersOffset(options);
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
   * Calculate the underlay and overlay offset and set it to the `layersOffset` property.
   *
   * @param {GetOffsetOptions} [options={}]
   * @returns {?boolean} Is the comment moved. `null` if it is invisible.
   * @private
   */
  computeLayersOffset(options = {}) {
    const layersContainerOffset = this.getLayersContainerOffset();
    if (!layersContainerOffset) {
      return null;
    }

    const isMoved = this.getOffset({
      ...options,
      considerFloating: true,
      set: true,
    });

    if (this.offset) {
      const margins = this.getMargins();
      this.layersOffset = {
        top: this.offset.top - layersContainerOffset.top,
        left: this.offset.left - margins.left - layersContainerOffset.left,
        width: this.offset.right + margins.right - (this.offset.left - margins.left),
        height: this.offset.bottom - this.offset.top,
      };
    } else {
      this.layersOffset = null;
    }

    return isMoved;
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
   * _For internal use._ Get and sometimes create the container for the comment's underlay and
   * overlay.
   *
   * @returns {Element}
   */
  getLayersContainer() {
    if (this.layersContainer === undefined) {
      let offsetParent;

      const treeWalker = new TreeWalker(
        document.body,
        undefined,
        true,

        // Start with the first or last element dependent on which is higher in the DOM hierarchy in
        // terms of nesting level. There were issues with RTL in LTR (and vice versa) when we
        // started with the first element, see
        // https://github.com/jwbth/convenient-discussions/commit/9fcad9226a7019d6a643d7b17f1e824657302ebd.
        // On the other hand, if we start with the first/last element, we get can in trouble when
        // the start/end of the comment is inside a container while the end/start is not. A good
        // example that combines both cases (press "up" on the "comments" "These images are too
        // monochrome" and "So my suggestion is just, to..."):
        // https://en.wikipedia.org/w/index.php?title=Wikipedia:Village_pump_(technical)&oldid=1217857130#c-Example-20240401111100-Indented_tables.
        // This is a error, of course, that quoted comments are treated as real, but we can't do
        // anything here.
        this.elements.length === 1 ||
        this.parser.getNestingLevel(this.elements[0]) <=
          this.parser.getNestingLevel(this.elements.slice(-1)[0])
          ? this.elements[0]
          : this.elements.slice(-1)[0]
      );

      while (treeWalker.parentNode()) {
        const node = treeWalker.currentNode;

        // These elements have `position: relative` for the purpose we know.
        if (node.classList.contains('cd-connectToPreviousItem')) continue;

        let style = node.cdStyle;
        if (!style) {
          // window.getComputedStyle is expensive, so we save the result to the node's property.
          style = window.getComputedStyle(node);
          node.cdStyle = style;
        }
        const classList = Array.from(node.classList);
        if (
          ['absolute', 'relative'].includes(style.position) ||
          (node !== talkPageController.$content[0] &&
            (classList.includes('mw-content-ltr') || classList.includes('mw-content-rtl')))
        ) {
          offsetParent = node;
        }
        if (
          style.backgroundColor.includes('rgb(') ||
          (style.backgroundImage !== 'none' && !offsetParent)
        ) {
          offsetParent = node;
          offsetParent.classList.add('cd-commentLayersContainer-parent-relative');
        }
        if (offsetParent) break;
      }
      offsetParent ||= document.body;
      offsetParent.classList.add('cd-commentLayersContainer-parent');
      let container = /** @type {HTMLElement} */ (offsetParent.firstElementChild);
      if (!container.classList.contains('cd-commentLayersContainer')) {
        container = document.createElement('div');
        container.classList.add('cd-commentLayersContainer');
        offsetParent.insertBefore(container, offsetParent.firstChild);

        container.cdIsTopLayersContainer = !container.parentElement?.parentElement?.closest(
          '.cd-commentLayersContainer-parent'
        );
      }
      this.layersContainer = container;

      addToArrayIfAbsent(commentRegistry.layersContainers, container);
    }

    return this.layersContainer;
  }

  /**
   * Create the comment's underlay and overlay with contents.
   *
   * @fires commentLayersCreated
   * @private
   */
  createLayers() {
    this.underlay = Comment.prototypes.get('underlay');
    commentRegistry.underlays.push(this.underlay);

    this.overlay = Comment.prototypes.get('overlay');
    this.line = /** @type {HTMLElement} */ (this.overlay.firstChild);
    this.marker = /** @type {HTMLElement} */ (
      /** @type {HTMLElement} */ (this.overlay.firstChild).nextSibling
    );

    if (!this.isReformatted()) {
      this.overlayInnerWrapper = /** @type {HTMLElement} */ (this.overlay.lastChild);
      this.overlayGradient = /** @type {HTMLElement} */ (this.overlayInnerWrapper.firstChild);
      this.overlayMenu = /** @type {HTMLElement} */ (this.overlayInnerWrapper.lastChild);

      // Hide the overlay on right click. It can block clicking the author page link.
      this.overlayInnerWrapper.oncontextmenu = this.hideMenu.bind(this);

      // Hide the overlay on long click/tap.
      this.overlayInnerWrapper.onmousedown = this.deferHideMenu.bind(this);
      this.overlayInnerWrapper.onmouseup = this.dontHideMenu.bind(this);

      this.addGoToParentButton();
      this.addCopyLinkButton();
      this.addThankButton();
      this.addEditButton();
      this.addReplyButton();
    }

    this.overlayInnerWrapper;

    this.updateLayersStyles(true);

    /**
     * Comment's underlay.
     *
     * @type {?JQuery}
     */
    this.$underlay = $(this.underlay);

    /**
     * Comment's overlay.
     *
     * @type {?JQuery}
     */
    this.$overlay = $(this.overlay);

    /**
     * Comment's side marker.
     *
     * @type {JQuery}
     */
    this.$marker = $(this.marker);

    if (!this.isReformatted()) {
      /**
       * Menu element in the comment's overlay.
       *
       * @type {JQuery}
       */
      this.$overlayMenu = $(this.overlayMenu);

      /**
       * Gradient element in the comment's overlay.
       *
       * @type {JQuery}
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
   * Set a timeout for hiding the menu.
   *
   * @param {MouseEvent} event
   * @private
   */
  deferHideMenu(event) {
    // Ignore other than left button clicks.
    if (event.which !== 1) return;

    this.hideMenuTimeout = setTimeout(this.hideMenu.bind(this), 1200);
  }

  /**
   * Hide the comment menu (in fact, the comment overlay's inner wrapper).
   *
   * @param {MouseEvent} [event]
   * @private
   */
  hideMenu(event) {
    event?.preventDefault();
    this.overlayInnerWrapper.style.display = 'none';
    this.wasMenuHidden = true;
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
        this.line.classList.add('cd-comment-overlay-line-gapCloser');
      }
    }
  }

  /**
   * Set classes to the underlay, overlay, and other elements according to a type.
   *
   * @param {string} type
   * @param {*} add
   * @private
   */
  updateClassesForType(type, add) {
    if (!this.underlay) return;

    add = Boolean(add);
    if (this.underlay.classList.contains(`cd-comment-underlay-${type}`) === add) return;

    this.underlay.classList.toggle(`cd-comment-underlay-${type}`, add);
    /** @type {HTMLElement} */ (this.overlay).classList.toggle(`cd-comment-overlay-${type}`, add);

    if (type === 'deleted') {
      this.replyButton?.setDisabled(add);
      this.editButton?.setDisabled(add);
    } else if (type === 'hovered' && !add) {
      this.overlayInnerWrapper.style.display = '';
    }
  }

  /**
   * _For internal use._ Add the (already existent) comment's layers to the DOM.
   */
  addLayers() {
    if (!this.underlay) return;

    this.updateLayersOffset();
    this.getLayersContainer().appendChild(this.underlay);
    this.getLayersContainer().appendChild(/** @type {HTMLElement} */ (this.overlay));
  }

  /**
   * _For internal use._ Transfer the `layers(Top|Left|Width|Height)` values to the style of the
   * layers.
   */
  updateLayersOffset() {
    // The underlay can be absent if called from commentRegistry.maybeRedrawLayers() with redrawAll
    // set to `true`. layersOffset can be absent in some rare cases when the comment became
    // invisible.
    if (!this.underlay || !this.layersOffset) return;

    const overlay = /** @type {HTMLElement} */ (this.overlay);
    this.underlay.style.top = overlay.style.top = this.layersOffset.top + 'px';
    this.underlay.style.left = overlay.style.left = this.layersOffset.left + 'px';
    this.underlay.style.width = overlay.style.width = this.layersOffset.width + 'px';
    this.underlay.style.height = overlay.style.height = this.layersOffset.height + 'px';
  }

  /**
   * Remove the comment's underlay and overlay.
   */
  removeLayers() {
    if (!this.underlay) return;

    this.$animatedBackground?.add(this.$marker).stop(true, true);

    // TODO: add add/remove methods to commentRegistry.underlays
    removeFromArrayIfPresent(commentRegistry.underlays, this.underlay);

    this.dontHideMenu();

    this.underlay.remove();
    this.underlay = null;
    this.$underlay = null;

    /** @type {HTMLElement} */ (this.overlay).remove();
    this.overlay = null;
    this.$overlay = null;

    this.isHovered = false;
  }

  /**
   * _For internal use._ Update the comment's hover state based on a `mousemove` event.
   *
   * @param {MouseEvent} event
   * @param {boolean} isObstructingElementHovered
   */
  updateHoverState(event, isObstructingElementHovered) {
    const layersOffset = this.layersOffset;
    const layersContainerOffset = this.getLayersContainerOffset();
    if (!layersOffset || !layersContainerOffset) {
      // Something has happened with the comment (or the layers container); it disappeared.
      this.removeLayers();
      return;
    }
    if (
      !isObstructingElementHovered &&
      event.pageY >= layersOffset.top + layersContainerOffset.top &&
      event.pageY <= layersOffset.top + layersOffset.height + layersContainerOffset.top &&
      event.pageX >= layersOffset.left + layersContainerOffset.left &&
      event.pageX <= layersOffset.left + layersOffset.width + layersContainerOffset.left
    ) {
      this.highlightHovered();
    } else {
      this.unhighlightHovered();
    }
  }

  /**
   * Highlight the comment when it is hovered.
   *
   * @param {MouseEvent | TouchEvent} [event]
   */
  highlightHovered(event) {
    if (this.isHovered || bootController.isPageOverlayOn() || this.isReformatted()) return;

    if (event?.type === 'touchstart') {
      if (this.wasMenuHidden) {
        this.wasMenuHidden = false;
        return;
      }

      // FIXME: decouple
      commentRegistry
        .query((comment) => comment.isHovered)
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
    if (!this.isHovered || this.isReformatted()) return;

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
    const generateProperties = (/** @type {string} */ backgroundColor) => {
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

    this.$marker.animate(generateProperties(markerColor), 400, 'swing', () => {
      this.$marker.css(propertyDefaults);
    });

    const comment = this;
    const $background = /** @type {JQuery} */ (this.$animatedBackground);
    $background.animate(generateProperties(backgroundColor), 400, 'swing', function () {
      if (this !== $background.get(-1)) return;

      callback?.();
      $background.add(comment.$overlayGradient).css(propertyDefaults);
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
    if (!this.$underlay?.parent().length) {
      callback?.();
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
    /** @type {JQuery} */ (this.$animatedBackground).css({
      backgroundColor: initialBackgroundColor,
    });
    this.$overlayGradient?.css({ backgroundImage: 'none' });

    this.animateToColors(finalMarkerColor, finalBackgroundColor, callback);
  }

  /**
   * Change the comment's background and marker color to a color of the provided comment type for
   * the given number of milliseconds, then smoothly change it back.
   *
   * @param {string} type
   * @param {number} delay
   * @param {Function} [callback]
   */
  flash(type, delay, callback) {
    this.configureLayers();
    if (!this.$underlay) {
      callback?.();
      return;
    }

    /**
     * Comment underlay and menu, whose colors are animated in some events.
     *
     * @type {JQuery|undefined}
     */
    this.$animatedBackground = this.$underlay.add(this.$overlayMenu);

    // Reset animations and colors
    this.$animatedBackground.add(this.$marker).stop(true, true);

    this.updateClassesForType(type, true);

    // If there was an animation scheduled, run it first
    this.unhighlightDeferred?.resolve();

    this.unhighlightDeferred = $.Deferred();
    this.unhighlightDeferred.then(this.animateBack.bind(this, type, callback));
    sleep(delay).then(this.unhighlightDeferred.resolve);
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

    // Use the `changed` type, not `new`, to get the `cd-comment-underlay-changed` class that helps
    // to set background if the user has switched off background highlighting for new comments.
    this.flash('changed', 1000);

    /**
     * @typedef {object} SeenRenderedChange
     * @property {StringsByKey} users
     * @property {number} saveTime
     */

    if (this.isChanged && this.id) {
      const seenStorageItem = /** @type {StorageItemWithKeys<SeenRenderedChange>} */ (
        new StorageItemWithKeys('seenRenderedChanges')
      );
      const seen = seenStorageItem.get(mw.config.get('wgArticleId')) || {};
      seen[this.id] = {
        htmlToCompare: this.htmlToCompare,
        seenTime: Date.now(),
      };
      seenStorageItem.set(mw.config.get('wgArticleId'), seen).save();
    }

    talkPageController.maybeMarkPageAsRead();
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
   * _For internal use._ Stop all animations on the comment.
   */
  stopAnimations() {
    this.$animatedBackground?.add(this.$marker).stop(true, true);
  }

  /**
   * _For internal use._ Keep only those lines of a diff that are related to the comment.
   *
   * @param {string} body
   * @param {object[]} revisions
   * @param {import('./updateChecker').CommentWorkerMatched[]} commentsData
   * @returns {JQuery}
   */
  scrubDiff(body, revisions, commentsData) {
    /**
     * @type {number[][]}
     */
    const lineNumbers = [[], []];
    revisions.forEach((revision, i) => {
      const pageCode = revision.slots.main.content;
      let source;
      try {
        source = this.locateInCode(undefined, pageCode, commentsData[i]);
      } catch {
        return;
      }
      const startLineNumber = countOccurrences(pageCode.slice(0, source.lineStartIndex), /\n/g) + 1;
      const endLineNumber =
        startLineNumber +
        countOccurrences(pageCode.slice(source.lineStartIndex, source.signatureEndIndex), /\n/g);
      for (let j = startLineNumber; j <= endLineNumber; j++) {
        lineNumbers[i].push(j);
      }
    });

    const currentLineNumbers = [];
    let cleanDiffBody = '';
    $(wrapDiffBody(body))
      .find('tr')
      .each((_, tr) => {
        const $tr = $(tr);
        const $lineNumbers = $tr.children('.diff-lineno');
        for (let j = 0; j < $lineNumbers.length; j++) {
          currentLineNumbers[j] = extractArabicNumeral($lineNumbers.eq(j).text(), cd.g.uiDigits);
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
          if (
            !$tr
              .children()
              .eq(j * 2)
              .hasClass('diff-empty')
          ) {
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
   * @param {number} olderRevisionId
   * @param {number} newerRevisionId
   * @param {object} commentsData
   * @throws {CdError}
   * @private
   */
  async showDiff(olderRevisionId, newerRevisionId, commentsData) {
    const [revisions, body] = await Promise.all([
      this.getSourcePage().getRevisions({
        revids: [olderRevisionId, newerRevisionId],
        rvprop: ['content'],
      }),
      this.getSourcePage().compareRevisions(olderRevisionId, newerRevisionId),
      mw.loader.using(['mediawiki.diff', 'mediawiki.diff.styles']),
    ]);
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

    const $message = $('<div>')
      .append(
        $cleanDiff,
        $('<div>')
          .addClass('cd-commentDiffView-below')
          .append(
            $('<a>')
              .attr(
                'href',
                cd.page.getUrl({
                  oldid: olderRevisionId,
                  diff: newerRevisionId,
                })
              )
              .attr('target', '_blank')

              // Make it work in https://commons.wikimedia.org/wiki/User:Serhio_Magpie/instantDiffs.js
              .attr('data-instantdiffs-link', 'link')

              .text(cd.s('comment-diff-full')),
            cd.sParse('dot-separator'),
            $('<a>')
              .attr('href', cd.page.getUrl({ action: 'history' }))
              .attr('target', '_blank')
              .text(cd.s('comment-diff-history'))
          )
      )
      .children();
    OO.ui.alert($message, {
      title: cd.s('comment-diff-title'),
      size: 'larger',
    });

    // FIXME: "wikipage.content hook should not be fired on unattached content".
    mw.hook('wikipage.content').fire($message);
  }

  /**
   * @overload
   * @param {'changed'|'changedSince'} type
   * @param {boolean} isNewVersionRendered
   * @param {number} comparedRevisionId
   * @param {object} commentsData
   *
   * @overload
   * @param {'deleted'} type
   */

  /**
   * Update the comment's properties, add a small note next to the signature saying the comment has
   * been changed or deleted, and change the comment's styling if it has been.
   *
   * @param {'changed'|'changedSince'|'deleted'} type Type of the mark.
   * @param {boolean} [isNewVersionRendered] Is the new version of the comment rendered
   *   (successfully updated or, for `changedSince` type, has been a new one from the beginning).
   * @param {number} [comparedRevisionId] ID of the revision to compare with when the user clicks to
   *   see the diff.
   * @param {object} [commentsData] Data of the comments as of the current revision and the revision
   *   to compare with.
   */
  async markAsChanged(type, isNewVersionRendered, comparedRevisionId, commentsData) {
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

    const refreshLink = isNewVersionRendered
      ? undefined
      : new Button({
          label: cd.s('comment-changed-refresh'),
          action: () => {
            talkPageController.reboot(type === 'deleted' || !this.id ? {} : { commentIds: [this.id] });
          },
        });

    const currentRevisionId = mw.config.get('wgRevisionId');
    const diffLink =
      this.getSourcePage().isCurrent() && type !== 'deleted'
        ? new Button({
            label: cd.s('comment-diff'),
            action: async () => {
              /** @type {Button} */ (diffLink).setPending(true);
              try {
                await this.showDiff(
                  /** @type {number} */ (
                    type === 'changedSince' ? comparedRevisionId : currentRevisionId
                  ),
                  /** @type {number} */ (
                    type === 'changedSince' ? currentRevisionId : comparedRevisionId
                  ),
                  commentsData
                );
              } catch (error) {
                let text = cd.sParse('comment-diff-error');
                if (error instanceof CdError) {
                  const { type, message } = error.data;
                  if (message) {
                    text = message;
                  } else if (type === 'network') {
                    text += ' ' + cd.sParse('error-network');
                  }
                }
                mw.notify(wrapHtml(text), {
                  type: error.data?.code === 'emptyDiff' ? 'info' : 'error',
                });
              }
              /** @type {Button} */ (diffLink).setPending(false);
            },
          })
        : undefined;

    let refreshLinkSeparator;
    let diffLinkSeparator;
    if (this.isReformatted()) {
      stringName += '-short';
      refreshLinkSeparator = diffLinkSeparator = cd.sParse('dot-separator');
    } else {
      refreshLinkSeparator = ' ';
      diffLinkSeparator = refreshLink ? cd.sParse('dot-separator') : ' ';
    }

    this.$changeNote?.remove();

    const $changeNote = $('<span>').addClass('cd-changeNote').text(cd.s(stringName));
    if (refreshLink) {
      $changeNote.append(refreshLinkSeparator, refreshLink.element);
    } else {
      $changeNote.addClass('cd-changeNote-newVersionRendered');
    }
    if (diffLink) {
      $changeNote.append(diffLinkSeparator, diffLink.element);
    }

    this.addChangeNote($changeNote);

    if (isNewVersionRendered) {
      this.flashChangedOnSight();
    }

    if (this.countEditsAsNewComments && (type === 'changed' || type === 'changedSince')) {
      this.isSeenBeforeChanged ??= this.isSeen;
      this.isSeen = false;
      commentRegistry.registerSeen();
    }

    // Layers are supposed to be updated (deleted comments background, repositioning) separately,
    // see updateChecker~checkForNewChanges(), for example.
  }

  /**
   * Add a note that the comment has been changed.
   *
   * @param {JQuery} $changeNote
   * @private
   */
  addChangeNote($changeNote) {
    this.$changeNote = $changeNote;

    if (this.isReformatted()) {
      /** @type {JQuery} */ (this.$header).append(this.$changeNote);
    } else {
      // Add the mark to the last block element, going as many nesting levels down as needed to
      // avoid it appearing after a block element.
      let $last;
      let $tested = $(this.highlightables).last();
      do {
        $last = $tested;
        $tested = $last.children().last();
      } while ($tested.length && !isInline($tested[0]));

      if (!$last.find('.cd-changeNote-before').length) {
        $last.append(' ', $('<span>').addClass('cd-changeNote-before'));
      }
      $last.append($changeNote);
    }
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

        // commentRegistry.maybeRedrawLayers(), that is called on DOM updates, could circumvent
        // this comment if it has no property signalling that it should be highlighted, so we update
        // its styles manually.
        this.updateLayersStyles();

        break;
    }

    this.$changeNote?.remove();
    delete this.$changeNote;

    if (
      this.countEditsAsNewComments &&
      this.isSeen === false &&
      this.isSeenBeforeChanged === true
    ) {
      this.isSeen = true;
      this.isSeenBeforeChanged = null;
      commentRegistry.emit('registerSeen');
    }

    if (type === 'changed') {
      // The change was reverted and the user hasn't seen the change - no need to flash the comment.
      if (this.willFlashChangedOnSight) {
        this.willFlashChangedOnSight = false;
        talkPageController.maybeMarkPageAsRead();
      } else if (this.id) {
        const seenStorageItem = new StorageItemWithKeys('seenRenderedChanges');
        const seen = seenStorageItem.get(mw.config.get('wgArticleId')) || {};
        delete seen[this.id];
        seenStorageItem.set(mw.config.get('wgArticleId'), seen).save();

        this.flashChangedOnSight();
      }
    }
  }

  /**
   * _For internal use._ Live-update the comment's content.
   *
   * @param {import('./updateChecker').CommentWorkerMatched} currentComment Data about the comment
   *   in the current revision as delivered by the worker.
   * @param {import('./updateChecker').CommentWorkerMatched} newComment Data about the comment in
   *   the new revision as delivered by the worker.
   * @returns {boolean} Was the update successful.
   */
  update(currentComment, newComment) {
    this.htmlToCompare = newComment.htmlToCompare;

    const elementNames = [...this.$elements].map((el) => el.tagName);
    const elementClassNames = [...this.$elements].map((el) => el.className);

    // References themselves may be out of the comment's HTML and might be edited.
    const areThereReferences = newComment.hiddenElementsData.some(
      (data) => data.type === 'reference'
    );

    // If a style element is replaced with a link element, we can't replace HTML.
    const areStyleTagsKept =
      !newComment.hiddenElementsData.length ||
      newComment.hiddenElementsData.every(
        (data) => data.type !== 'templateStyles' || data.tagName === 'STYLE'
      ) ||
      currentComment.hiddenElementsData.every(
        (data) => data.type !== 'templateStyles' || data.tagName !== 'STYLE'
      );

    if (
      !areThereReferences &&
      areStyleTagsKept &&
      areObjectsEqual(elementNames, newComment.elementNames)
    ) {
      // TODO: support non-Arabic digits (e.g. fa.wikipedia.org). Also not sure square brackets are
      // the same everywhere.
      const match = this.$elements.find('.autonumber').text().match(/\d+/);
      let currentAutonumber = match ? Number(match[0]) : 1;
      newComment.elementHtmls.forEach((html, i) => {
        html = html.replace(
          /\x01(\d+)_\w+\x02/g,
          // @ts-ignore
          (s, num) => newComment.hiddenElementsData[num - 1].html
        );
        if (
          getHeadingLevel({
            tagName: elementNames[i],
            className: elementClassNames[i],
          })
        ) {
          const $headline = this.$elements.eq(i).find('.mw-headline, :header');
          if ($headline.length) {
            const $html = $(html);
            $headline.html($html.html());
            this.section?.update($html);
          }
        } else {
          const $element = this.$elements.eq(i);
          const isHidden = $element.hasClass('cd-hidden');
          const newElement = this.replaceElement($element, html);
          if (isHidden) {
            $(newElement).addClass('cd-hidden');
          }
        }
      });
      // @ts-ignore
      this.$elements.find('.autonumber').each((_, el) => {
        $(el).text(`[${currentAutonumber}]`);
        currentAutonumber++;
      });
      this.$elements.attr('data-cd-comment-index', this.index);

      if (this.isReformatted()) {
        this.signatureElement = this.$elements.find('.cd-signature')[0];
        this.replaceSignatureWithHeader();
        this.addMenu();
      } else {
        this.timestampElement = this.$elements.find('.cd-signature .cd-timestamp')[0];
        this.reformatTimestamp();
      }

      mw.hook('wikipage.content').fire(this.$elements);

      delete this.cachedText;
      delete this.$changeNote;

      return true;
    } else {
      return false;
    }
  }

  /**
   * Scroll to the comment if it is not in the viewport. See also {@link Comment#scrollTo}.
   *
   * @param {'top'|'center'|'bottom'} alignment Where should the element be positioned relative to
   *   the viewport.
   */
  scrollIntoView(alignment) {
    (this.editForm?.$element || this.$elements).cdScrollIntoView(alignment);
  }

  /**
   * Scroll to the comment and (by default) flash it as a target. See also
   * {@link Comment#scrollIntoView}.
   *
   * @param {ScrollToConfig} [options]
   */
  scrollTo({
    smooth = true,
    expandThreads = false,
    flash = true,
    pushState = false,
    callback,
    alignment,
  } = {}) {
    if (expandThreads) {
      this.expandAllThreadsDownTo();
    }

    const id = this.dtId || this.id;
    if (pushState && id) {
      const newState = { ...history.state, cdJumpedToComment: true };
      history.pushState(newState, '', `#${id}`);
    }

    if (this.isCollapsed) {
      /** @type {JQuery} */ (this.getVisibleExpandNote()).cdScrollIntoView(
        alignment || 'top',
        smooth,
        callback
      );
      const $message = wrapHtml(cd.sParse('navpanel-firstunseen-hidden', '$1'), {
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
          'cd-notification-markThreadAsRead': () => {
            this.thread.getComments().forEach((comment) => {
              comment.isSeen = true;
            });
            commentRegistry.emit('registerSeen');
            notification.close();
            navPanel.goToFirstUnseenComment();
          },
        },
      });
      if (this.isSeen) {
        $message.find('.cd-notification-markThreadAsRead').remove();
      }
      const notification = mw.notification.notify($message, {
        title: cd.s('navpanel-firstunseen-hidden-title'),
        tag: 'cd-commentInCollapsedThread',
      });
    } else {
      const offset = this.getOffset({ considerFloating: true });
      (this.editForm?.$element || this.$elements).cdScrollIntoView(
        alignment ||
          (this.isOpeningSection ||
          this.editForm ||
          (offset && offset.bottom !== offset.bottomForVisibility)
            ? 'top'
            : 'center'),
        smooth,
        callback
      );
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
    parent.addGoToChildButton(this);
  }

  /**
   * Collapse children comments' threads if they are expanded (at least one of them); expand if
   * collapsed.
   */
  toggleChildThreads() {
    this.getChildren()[0].thread.toggleWithSiblings();
  }

  /**
   * _For internal use._ Generate a JQuery object containing an edit summary, diff body, and link to
   * the next diff.
   *
   * @returns {Promise.<JQuery>}
   */
  async generateDiffView() {
    const edit = await this.findEdit();
    const diffLink = await this.getDiffLink();
    return $('<div>')
      .addClass('cd-diffView-diff')
      .append(
        $('<div>')
          .append(
            $('<a>')
              .addClass('cd-diffView-nextDiffLink')
              .attr('href', diffLink.replace(/&diff=(\d+)/, '&oldid=$1&diff=next'))
              .attr('target', '_blank')

              // Make it work in https://ru.wikipedia.org/wiki/User:Serhio_Magpie/instantDiffs.js
              .attr('data-instantdiffs-link', 'link')

              .text(cd.mws('nextdiff'))
          )
          .append(
            cd.sParse('cld-summary'),
            cd.mws('colon-separator'),
            wrapHtml(edit.parsedcomment, { targetBlank: true }).addClass('comment')
          ),
        wrapDiffBody(edit.diffBody)
      );
  }

  /**
   * Open a copy link dialog (rarely, copy a link to the comment without opening a dialog).
   *
   * @param {MouseEvent | KeyboardEvent} event
   */
  async copyLink(event) {
    talkPageController.showCopyLinkDialog(this, event);
  }

  /**
   * @typedef {object} DiffMatch
   * @property {object} revision
   * @property {number} wordOverlap
   * @property {number} dateProximity
   */

  /**
   * Find matches of the comment with diffs that might have added it.
   *
   * @param {string[]} compareBodies
   * @param {object[]} revisions
   * @returns {Promise.<DiffMatch[]>}
   */
  async findDiffMatches(compareBodies, revisions) {
    // Only analyze added lines except for headings. `diff-empty` is not always present, so we stick
    // to colspan="2" as an indicator.
    const regexp =
      /<td [^>]*colspan="2" class="[^"]*\bdiff-side-deleted\b[^"]*"[^>]*>\s*<\/td>\s*<td [^>]*class="[^"]*\bdiff-marker\b[^"]*"[^>]*>\s*<\/td>\s*<td [^>]*class="[^"]*\bdiff-addedline\b[^"]*"[^>]*>\s*<div[^>]*>(?!=)(.+?)<\/div>\s*<\/td>/g;

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
      const timestamp = new Date(revision.timestamp).setSeconds(0);
      const dateProximity = Math.abs(/** @type {Date} */ (this.date).getTime() - timestamp);
      let wordOverlap = Math.max(
        calculateWordOverlap(diffText, commentFullText),
        bestDiffPartWordOverlap
      );

      // Parse wikitext if there is no full overlap and there are templates inside.
      if (wordOverlap < 1 && diffOriginalText.includes('{{')) {
        try {
          diffOriginalText = $('<div>')
            .append((await parseCode(diffOriginalText, { title: cd.page.name })).html)
            .cdGetText();
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
      if (!this.date) {
        throw new CdError({
          type: 'internal',
        });
      }

      // Search for the edit in the range of 10 minutes before (in case the comment was edited with
      // timestamp replaced) to 3 minutes after (a rare occasion where the diff timestamp is newer
      // than the comment timestamp).
      const revisions = await this.getSourcePage()
        .getArchivedPage()
        .getRevisions({
          rvprop: ['ids', 'comment', 'parsedcomment', 'timestamp'],
          rvdir: 'newer',
          rvstart: new Date(this.date.getTime() - cd.g.msInMin * 10).toISOString(),
          rvend: new Date(this.date.getTime() + cd.g.msInMin * 3).toISOString(),
          rvuser: this.author.getName(),
          rvlimit: 500,
        });

      /**
       * @typedef {object} ApiResponseCompare
       * @property {object} compare
       * @property {string} compare.body
       */
      const compareRequests = revisions.map((revision) => {
        const request = cd.getApi().post({
          action: 'compare',
          fromtitle: this.getSourcePage().getArchivedPage().name,
          fromrev: revision.revid,
          torelative: 'prev',
          prop: ['diff'],
        });

        return request.catch(handleApiReject);
      });
      const response = /** @type {ApiResponseCompare[]} */ (await Promise.all(compareRequests));
      const compareBodies = response.map((resp) => resp.compare.body);
      const matches = (await this.findDiffMatches(compareBodies, revisions)).sort((m1, m2) =>
        m1.wordOverlap === m2.wordOverlap
          ? m1.dateProximity - m2.dateProximity
          : m2.wordOverlap - m1.wordOverlap
      );
      if (
        !matches.length ||
        (matches[1] &&
          matches[0].wordOverlap === matches[1].wordOverlap &&
          matches[0].dateProximity === matches[1].dateProximity)
      ) {
        throw new CdError({
          type: 'parse',
        });
      }

      // Cache a successful result.
      this.addingEdit = matches[0].revision;
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
      const urlEnding = decodeURI(cd.page.getArchivedPage().getUrl({ diff: edit.revid }));

      return `${cd.g.server}${urlEnding}`;
    } else if (format === 'short') {
      return `${cd.g.server}/?diff=${edit.revid}`;
    }

    const specialPageName =
      mw.config.get('wgFormattedNamespaces')[-1] + ':' + cd.g.specialPageAliases.Diff[0];

    return `[[${specialPageName}/${edit.revid}]]`;
  }

  /**
   * Consider the comment thanked (rename the button and set other parameters).
   *
   * @private
   */
  setThanked() {
    /** @type {import('./CommentButton').default} */ (this.thankButton)
      .setPending(false)
      .setDisabled(true)
      .setLabel(cd.s('cm-thanked'))
      .setTooltip(cd.s('cm-thanked-tooltip'));
  }

  /**
   * Process thank error.
   *
   * @param {CdError|Error} error
   * @private
   */
  thankFail(error) {
    const { type, code } = error instanceof CdError ? error.data : {};
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
          text =
            cd.sParse('error-diffnotfound') + ' ' + cd.sParse('error-diffnotfound-history', url);
        } else {
          text = cd.sParse('thank-error');
          console.warn(error);
        }
        break;
      }

      case 'network': {
        text = cd.sParse('error-diffnotfound') + ' ' + cd.sParse('error-network');
        break;
      }
    }
    mw.notify(wrapHtml(text, { targetBlank: true }), { type: 'error' });
    /** @type {import('./CommentButton').default} */ (this.thankButton).setPending(false);
  }

  /**
   * Find the edit that added the comment, ask for a confirmation, and send a "thank you"
   * notification.
   */
  async thank() {
    /** @type {import('./CommentButton').default} */ (this.thankButton).setPending(true);

    let edit;
    try {
      [edit] = await Promise.all(
        [
          this.findEdit(),
          cd.g.genderAffectsUserString ? loadUserGenders([this.author]) : undefined,
          mw.loader.using(['mediawiki.diff', 'mediawiki.diff.styles']),
        ].filter(defined)
      );
    } catch (error) {
      this.thankFail(error);
      return;
    }

    const $question = wrapHtml(
      cd.sParse(
        'thank-confirm',
        this.author.getName(),
        this.author,
        this.getSourcePage().getArchivedPage().getUrl({ diff: edit.revid })
      ),
      {
        tagName: 'div',
        targetBlank: true,
      }
    );
    $question.find('a').attr('data-instantdiffs-link', 'link');
    const $content = mergeJquery($question, await this.generateDiffView());

    if ((await showConfirmDialog($content, { size: 'larger' })) === 'accept') {
      try {
        await cd
          .getApi()
          .postWithEditToken(
            cd.getApi().assertCurrentUser({
              action: 'thank',
              rev: edit.revid,
              source: cd.config.scriptCodeName,
            })
          )
          .catch(handleApiReject);
      } catch (error) {
        this.thankFail(error);
        return;
      }

      mw.notify(cd.s('thank-success'));
      this.setThanked();

      Comment.thanksStorage
        .set(edit.revid, {
          id: /** @type {string} */ (this.dtId || this.id),
          thankTime: Date.now(),
        })
        .save();

      try {
        await mw.loader.using('ext.thanks');
        mw.thanks.thanked.push(edit.revid);
      } catch {
        // This isn't critical (affects only the "thanked" label in history), so we don't do
        // anything
      }
    } else {
      /** @type {import('./CommentButton').default} */ (this.thankButton).setPending(false);
    }
  }

  /**
   * Create a {@link Comment#replyForm reply form} for the comment.
   *
   * @param {object} [initialState]
   * @param {import('./CommentForm').default} [commentForm]
   */
  reply(initialState, commentForm) {
    if (this.replyForm) return;

    let isSelectionRelevant = false;
    if (!initialState && !commentForm) {
      isSelectionRelevant = commentRegistry.getSelectedComment() === this;
      if (isSelectionRelevant) {
        initialState = { focus: false };
        this.fixSelection();
      }
    }

    if (commentRegistry.getByIndex(this.index + 1)?.isOutdented && this.section) {
      let replyForm = this.section.replyForm;
      if (replyForm && replyForm.targetWithOutdentedReplies === this) {
        replyForm.$element.cdScrollIntoView('center');
        replyForm.commentInput.focus();
      } else {
        if (!replyForm) {
          replyForm = this.section.reply({ targetWithOutdentedReplies: this });
        }
        let selection = window.getSelection();
        if (selection.type !== 'Range') {
          const range = document.createRange();
          if (this.isReformatted()) {
            range.setStart(this.headerElement, this.headerElement.childNodes.length);
          } else {
            range.setStart(this.elements[0], 0);
          }
          if (this.isReformatted()) {
            range.setEnd(this.menuElement, 0);
          } else {
            range.setEnd(this.signatureElement, 0);
          }
          selection.removeAllRanges();
          selection.addRange(range);
        }
        replyForm.quote(true, this, true);
      }

      return;
    }

    /**
     * Reply form related to the comment.
     *
     * @type {import('./CommentForm').default|undefined}
     */
    this.replyForm = commentFormRegistry.setupCommentForm(
      this,
      {
        mode: 'reply',
      },
      initialState,
      commentForm
    );

    if (isSelectionRelevant) {
      this.replyForm.quote(true, this);
    }
  }

  /**
   * Make sure the selection will not include the comment form itself when it appears.
   *
   * @private
   */
  fixSelection() {
    let endBoundary;
    if (this.isReformatted()) {
      endBoundary = this.menuElement;
    } else {
      endBoundary = document.createElement('span');
      this.$elements.last().append(endBoundary);
    }

    const selection = window.getSelection();
    if (selection.containsNode(endBoundary, true)) {
      const { higherNode, higherOffset } = getHigherNodeAndOffsetInSelection(selection);
      selection.setBaseAndExtent(higherNode, higherOffset, endBoundary, 0);
    }

    if (!this.isReformatted()) {
      endBoundary.remove();
    }
  }

  /**
   * Create an {@link Comment#editForm edit form} for the comment.
   *
   * @param {object} [initialState] See {@link CommentForm}'s constructor.
   * @param {import('./CommentForm').default} [commentForm]
   * @returns {import('./CommentForm').default}
   */
  edit(initialState, commentForm) {
    // Check for existence in case the editing is initiated from a script of some kind (there is no
    // button to call it from CD when the form is displayed).
    if (!this.editForm) {
      /**
       * Edit form related to the comment.
       *
       * @type {import('./CommentForm').default|undefined}
       */
      this.editForm = commentFormRegistry.setupCommentForm(
        this,
        {
          mode: 'edit',
        },
        initialState,
        commentForm
      );
    }

    return this.editForm;
  }

  /**
   * Load the comment's source code.
   *
   * @param {import('./CommentForm').default} [commentForm] Comment form, if it is submitted or code
   *   changes are viewed.
   * @returns {Promise<CommentSource>}
   * @throws {CdError|Error}
   */
  async loadCode(commentForm) {
    let source;

    let isSectionSubmitted = false;
    try {
      if (commentForm && this.section && this.section.liveSectionNumber !== null) {
        try {
          const sectionCode = await this.section.requestCode();
          this.section.locateInCode(sectionCode);
          source = this.locateInCode(sectionCode);
          isSectionSubmitted = true;
        } catch (error) {
          if (
            !(
              error instanceof CdError &&
              error.data.code &&
              ['noSuchSection', 'locateSection', 'locateComment'].includes(error.data.code)
            )
          ) {
            throw error;
          }
        }
      }
      if (!isSectionSubmitted) {
        await this.getSourcePage().loadCode();
        source = this.locateInCode();
      }
    } catch (error) {
      if (error instanceof CdError) {
        throw new CdError({
          message: cd.sParse('cf-error-getpagecode'),
          ...error.data,
        });
      } else {
        throw error;
      }
    }
    commentForm?.setSectionSubmitted(isSectionSubmitted);

    return /** @type {CommentSource} */ (source);
  }

  /**
   * Add a comment form {@link CommentForm#getTarget targeted} at this comment to the page.
   *
   * @param {import('./CommentForm').CommentFormMode} mode
   * @param {import('./CommentForm').default} commentForm
   */
  addCommentFormToPage(mode, commentForm) {
    if (mode === 'reply') {
      const { $wrappingItem, $outerWrapper } = this.addSubitem('replyForm', 'top');
      ($wrappingItem || $outerWrapper).append(commentForm.$element);
    } else if (mode === 'edit') {
      // We use a class here because there can be elements in the comment that are hidden from the
      // beginning and should stay so when reshowing the comment.
      this.$elements.addClass('cd-hidden').data('cd-comment-form', commentForm);
      this.unhighlightHovered();
      if (this.isOpeningSection) {
        /** @type {import('./Section').default} */ (this.section).hideBar();
      }

      commentForm.$element.toggleClass('cd-commentForm-highlighted', this.isNew || this.isOwn);

      let $outermostElement;
      const $first = this.$elements.first();
      if ($first.is('dd, li')) {
        const outerWrapperTag = $first.prop('tagName').toLowerCase();
        $outermostElement = $(`<${outerWrapperTag}>`).addClass('cd-commentForm-outerWrapper');
        $outermostElement.append(commentForm.$element);
      } else {
        $outermostElement = commentForm.$element;
      }

      // We insert the form before the comment so that if the comment ends on a wrong level, the
      // form is on a right one. The exception is comments that open a section (otherwise a bug will
      // be introduced that will manifest when opening an "Add subsection" form of the previous
      // section).
      if (this.isOpeningSection) {
        this.$elements.last().after($outermostElement);
      } else {
        this.$elements.first().before($outermostElement);
      }
    }
  }

  /**
   * Clean up traces of a comment form {@link CommentForm#getTarget targeted} at this comment from
   * the page.
   *
   * @param {import('./CommentForm').CommentFormMode} mode
   * @param {import('./CommentForm').default} commentForm
   */
  cleanUpCommentFormTraces(mode, commentForm) {
    if (mode === 'reply') {
      this.subitemList.remove('replyForm');
      this.scrollIntoView('top');
    } else if (mode === 'edit') {
      commentForm.$element.parent('.cd-commentForm-outerWrapper').remove();
      this.$elements.removeClass('cd-hidden').removeData('cd-comment-form');
      if (this.isOpeningSection) {
        /** @type {JQuery} */ (
          /** @type {import('./Section').default} */ (this.section).$bar
        ).removeClass('cd-hidden');
      }

      // Wait until the comment form is removed - its presence can e.g. affect the presence of a
      // scrollbar, therefore the comment's offset.
      setTimeout(this.configureLayers.bind(this));

      // Wait until the comment form is unregistered
      setTimeout(this.scrollIntoView.bind(this, 'top'));
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

    const scrollY = window.scrollY;
    const viewportTop = scrollY + cd.g.bodyScrollPaddingTop;
    const viewportBottom = scrollY + window.innerHeight;

    return partially
      ? offset.bottomForVisibility > viewportTop && offset.top < viewportBottom
      : offset.top >= viewportTop && offset.bottomForVisibility <= viewportBottom;
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

    const makesSenseToRegisterFurther = commentRegistry
      .getAll()
      .some((comment) => comment.isSeen || comment.willFlashChangedOnSight);
    if (registerAllInDirection && makesSenseToRegisterFurther) {
      const change = registerAllInDirection === 'backward' ? -1 : 1;
      const nextComment = commentRegistry.getByIndex(this.index + change);
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
   * @type {JQuery}
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
   * @overload
   * @param {HTMLElement} element
   * @param {HTMLElement} newElementOrHtml
   *
   * @overload
   * @param {JQuery} element
   * @param {HTMLElement|string} newElementOrHtml
   */

  /**
   * Replace an element that is one of the comment's elements with another element or HTML string.
   *
   * @param {HTMLElement|JQuery} element Element to replace. Provide a native element only if we're
   *   in the page processing phase (and {@link Comment#$elements} has not been requested, hence
   *   cached yet).
   * @param {HTMLElement|string} newElementOrHtml Element or HTML string to replace with.
   * @returns {HTMLElement}
   */
  replaceElement(element, newElementOrHtml) {
    const nativeElement = element instanceof HTMLElement ? element : element[0];
    let newElement;
    if (typeof newElementOrHtml === 'string') {
      const index = [.../** @type {HTMLElement} */ (nativeElement.parentElement).children].indexOf(
        nativeElement
      );
      const parentElement = /** @type {HTMLElement} */ (nativeElement.parentElement);
      nativeElement.outerHTML = newElementOrHtml;
      newElement = /** @type {HTMLElement} */ (parentElement.children[index]);
    } else {
      newElement = newElementOrHtml;
      /** @type {HTMLElement} */ (nativeElement.parentElement).replaceChild(
        newElement,
        /** @type {HTMLElement} */ (element)
      );
    }

    // When we set .$elements, the setter automatically sets .elements. But not vice versa except
    // when .$elements is not ready yet.
    if (element instanceof HTMLElement) {
      this.elements.splice(this.elements.indexOf(element[0]), 1, newElement);
    } else {
      this.$elements = this.$elements.not(nativeElement).add(newElement);
    }

    if (this.highlightables.includes(nativeElement)) {
      this.highlightables.splice(this.highlightables.indexOf(nativeElement), 1, newElement);
      this.bindEvents(newElement);
    }
    if (this.marginHighlightable === nativeElement) {
      this.marginHighlightable = newElement;
    }

    return newElement;
  }

  /**
   * Get the comment's text.
   *
   * @param {boolean} [cleanUpSignature=true] Whether to clean up the signature.
   * @returns {string}
   */
  getText(cleanUpSignature = true) {
    if (this.cachedText === undefined) {
      const $clone = this.$elements.not(':header, .mw-heading').clone().removeClass('cd-hidden');
      const $dummy = $('<div>').append($clone);
      const selectorParts = [
        '.cd-signature',
        '.cd-changeNote',
        '.noprint',
        '.cd-comment-header',
        '.cd-comment-menu',
      ];
      if (cd.config.unsignedClass) {
        selectorParts.push(`.${cd.config.unsignedClass}`);
      }
      const selector = selectorParts.join(', ');
      $dummy.find(selector).remove();
      let text = $dummy.cdGetText();
      if (cleanUpSignature) {
        if (cd.g.signatureEndingRegexp) {
          text = text.replace(cd.g.signatureEndingRegexp, '');
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
   * Search for the comment in the source code and return possible matches.
   *
   * @param {string} contextCode
   * @param {import('./updateChecker').CommentWorkerMatched} [commentData]
   * @param {boolean} [isInSectionContext=false]
   * @returns {CommentSource|undefined}
   * @private
   */
  searchInCode(contextCode, commentData, isInSectionContext = false) {
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
      const comments = isInSectionContext
        ? /** @type {import('./Section').default} */ (this.section).comments
        : commentRegistry.getAll();
      const index = comments.indexOf(this);
      thisData = {
        index,
        previousComments: comments.slice(Math.max(0, index - 2), index).reverse(),
        followsHeading: this.followsHeading,
        sectionHeadline: this.section?.headline,
        commentText: this.getText(),
      };
    }

    const signatures = extractSignatures(contextCode);
    return signatures
      .filter(
        (signature) =>
          (signature.author === this.author || signature.author.getName() === '<undated>') &&
          (this.timestamp === signature.timestamp ||
            // .startsWith() to account for cases where you can ignore the timezone string in
            // "unsigned" templates (it may be present and may be not), but it appears on the page.
            (this.timestamp &&
              signature.timestamp &&
              this.timestamp.startsWith(signature.timestamp)))
      )
      .map((signature) => new CommentSource(this, signature, contextCode, isInSectionContext))
      .map((source, _, sources) => source.calculateMatchScore(thisData, sources, signatures))
      .filter((sourcesWithScores) => sourcesWithScores.score > 2.5)
      .sort((s1, s2) => s2.score - s1.score)[0]?.source;
  }

  /**
   * @overload
   * @param {string|undefined} [sectionCode]
   * @returns {CommentSource}
   *
   * @overload
   * @param {undefined} [sectionCode]
   * @param {string} code
   * @param {import('./updateChecker').CommentWorkerMatched} [commentData]
   * @returns {CommentSource}
   */

  /**
   * Locate the comment in the section or page source code and, if no `codeOrUseSectionCode` is
   * passed, set the resultant {@link CommentSource} object to the {@link Comment#source} property.
   * Otherwise, return the result.
   *
   * It is expected that the section or page code is loaded (using {@link Page#loadCode}) before
   * this method is called. Otherwise, the method will throw an error.
   *
   * @param {string|undefined} [sectionCode] Section code to use instead of the page code, to locate
   *   the comment in.
   * @param {string} [code] Wikitext that should have the comment (provided only if we need to
   *   perform operations on some code that is not the code of a section or page). Implies
   *   `sectionCode` is not set.
   * @param {import('./updateChecker').CommentWorkerMatched} [commentData] Comment data for
   *   comparison (can be set together with `code`).
   * @returns {CommentSource}
   * @throws {CdError}
   */
  locateInCode(sectionCode, code, commentData) {
    const customCodePassed = typeof code === 'string';
    if (!customCodePassed) {
      code = sectionCode || this.getSourcePage().code;
      this.source = null;
    }

    if (code === undefined) {
      throw new CdError({
        type: 'parse',
        code: 'noCode',
      });
    }

    const source = this.searchInCode(code, commentData, Boolean(sectionCode));
    if (!source) {
      throw new CdError({
        type: 'parse',
        code: 'locateComment',
      });
    }

    if (!customCodePassed) {
      this.source = source;
    }

    return source;
  }

  /**
   * Request the gender of the comment's author if it is absent and affects the user mention string
   * and do something when it's received.
   *
   * @param {() => void} callback
   * @param {boolean} [runAlways=false] Whether to execute the callback even if the gender request
   *   is not needed.
   */
  async maybeRequestAuthorGender(callback, runAlways = false) {
    if (cd.g.genderAffectsUserString && this.author.isRegistered() && !this.author.getGender()) {
      let errorCallback;
      if (!this.genderRequest) {
        this.genderRequest = loadUserGenders([this.author]);
        errorCallback = (/** @type {Error} */ error) => {
          console.warn(`Couldn't get the gender of user ${this.author.getName()}.`, error);
        };
      }
      if (!this.genderRequestCallbacks.includes(callback)) {
        this.genderRequest.then(callback, errorCallback);
        this.genderRequestCallbacks.push(callback);
      }
    } else {
      if (runAlways) {
        await sleep();
        callback();
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

    let $note = null;
    for (let t = this.collapsedThread; t; t = t.rootComment.getParent()?.collapsedThread || null) {
      $note = /** @type {JQuery} */ (t.$expandNote);
      if ($note.is(':visible')) break;
    }

    return $note;
  }

  /**
   * Get a link to the comment with Unicode sequences decoded.
   *
   * @param {boolean} [permanent=false] Get a permanent URL.
   * @returns {?string}
   */
  getUrl(permanent = false) {
    const id = this.dtId || this.id;

    return id ? cd.page.getDecodedUrlWithFragment(id, permanent) : null;
  }

  /**
   * @typedef {object} AddSubitemReturn
   * @property {JQuery} $wrappingItem
   * @property {JQuery} [$wrappingList]
   * @property {JQuery} [$outerWrapper]
   * @memberof Comment
   * @inner
   */

  /**
   * Add an item to the comment's {@link CommentSubitemList subitem list}.
   *
   * @param {string} name
   * @param {'top'|'bottom'} position
   * @returns {AddSubitemReturn}
   */
  addSubitem(name, position) {
    /*
      There are 3 basic cases that we account for:
      1.  : Comment.
          [End of the thread.]
        We create a list and an item in it. We also create an item next to the existent item and
        wrap the list into it. We don't add the list to the existent item because that item can be
        entirely a comment part, so at least highlighting would be broken if we do.
      2.  Comment.
          [No replies, no "Reply to section" button.]
        We create a list and an item in it.
      3.  Comment.
          : Reply or "Reply to section" button.
        or
          : Comment.
          :: Reply.
        (this means `<dl>` next to `<div>` which is a similar case to the previous one).
        We create an item in the existent list.

      The lists can be of other type, not necessarily `:`.

      The resulting structure is:
        Outer wrapper item element (`<dd>`, `<li>`, rarely `<div>`) - in case 1.
          Wrapping list element (`<ul>`) - in cases 1 and 2.
            Wrapping item element (`<li>`) - in cases 1, 2, and 3.
     */

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

    let wrappingItemTag = 'dd';
    let createList = true;
    let outerWrapperTag;

    let $anchor = $existingWrappingList || $lastOfTarget.next();
    const $anchorFirstChild = $anchor.children().first();
    if ($anchor.is('dd, li') && $anchorFirstChild.hasClass('cd-commentLevel')) {
      // A relatively rare case possible when two adjacent lists are merged with
      // Comment#mergeAdjacentCommentLevels, for example when replying to
      // https://en.wikipedia.org/wiki/Wikipedia:Village_pump_(policy)#202103271157_Uanfala.
      $anchor = $anchorFirstChild;
    }
    if ($anchor.is('dl, ul, ol')) {
      createList = false;
      wrappingItemTag = $anchor.is('dl') ? 'dd' : 'li';
      $anchor.addClass(`cd-commentLevel cd-commentLevel-${this.level + 1}`);
    } else if ($lastOfTarget.is('li, dd')) {
      outerWrapperTag = $lastOfTarget.prop('tagName').toLowerCase();
    }

    const $wrappingItem = $(`<${wrappingItemTag}>`);
    const $wrappingList = createList
      ? $('<dl>')
          .append($wrappingItem)
          .addClass(`cd-commentLevel cd-commentLevel-${this.level + 1}`)
      : undefined;

    let $outerWrapper;
    if (outerWrapperTag) {
      $outerWrapper = $(`<${outerWrapperTag}>`);

      // Why `.cd-commentLevel >`: reply to a pseudo-comment added with this diff with a mistake:
      // https://ru.wikipedia.org/?diff=113073013.
      if ($lastOfTarget.is('.cd-commentLevel:not(ol) > li, .cd-commentLevel > dd')) {
        $outerWrapper.addClass('cd-connectToPreviousItem');
      }

      /** @type {JQuery} */ ($wrappingList).appendTo($outerWrapper);
    }

    if ($outerWrapper) {
      $outerWrapper.insertAfter($lastOfTarget);

      if ($lastOfTarget.closest('dl, ul, ol').is('ol')) {
        $outerWrapper.addClass('cd-skip');
        const $next = $outerWrapper.next();

        // Layout bug where not all children are `li`s:
        // https://ru.wikipedia.org/wiki/Википедия:Заявки_на_статус_администратора/Евгений_Юрьев#Против
        const index = [...$outerWrapper.parent().children('li:not(.cd-skip)')].indexOf($next[0]);

        $next.attr('value', index + 1);
      }
    } else if ($wrappingList) {
      $wrappingList.insertAfter($lastOfTarget);
    } else {
      if (position === 'top') {
        $wrappingItem.addClass('cd-skip').attr('value', 0).prependTo($anchor);
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
   * Get a section relevant to this comment which means the same value as {@link Comment#section}.
   * (Used for polymorphism with {@link Section#getRelevantSection} and
   * {@link Page#getRelevantSection}.)
   *
   * @returns {?import('./Section').default}
   */
  getRelevantSection() {
    return this.section;
  }

  /**
   * Get a comment relevant to this comment which means the comment itself. (Used for polymorphism
   * with {@link Section#getRelevantComment} and {@link Page#getRelevantComment}.)
   *
   * @returns {Comment}
   */
  getRelevantComment() {
    return this;
  }

  /**
   * Get the data identifying the comment when restoring a comment form. (Used for polymorphism with
   * {@link Section#getIdentifyingData} and {@link Page#getIdentifyingData}.)
   *
   * @returns {{ [key: string]: any }}
   */
  getIdentifyingData() {
    return { id: this.id };
  }

  /**
   * Get the fragment for use in a comment wikilink.
   *
   * @returns {?string}
   */
  getWikilinkFragment() {
    return this.dtId || this.id || null;
  }

  /**
   * Get the chain of ancestors of the comment as an array, starting with the parent comment.
   *
   * @returns {Comment[]}
   */
  getAncestors() {
    const ancestors = [];
    let comment;
    for (comment = this; comment; comment = comment.getParent()) {
      ancestors.push(comment);
    }

    return ancestors.slice(1);
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
   * @param {number} currentTime
   * @param {Comment} [unseenComment] Unseen comment passed from the previous session.
   * @returns {boolean} Whether there is a time conflict.
   */
  initNewAndSeen(currentPageVisits, currentTime, unseenComment) {
    // Let's take 3 minutes as a tolerable time discrepancy.
    const isDateInFuture = this.date && this.date.getTime() > Date.now() + cd.g.msInMin * 3;

    if (!this.date || isDateInFuture) {
      this.isNew = false;
      this.isSeen = true;
      return false;
    }

    const commentTime = Math.floor(this.date.getTime() / 1000);

    // Add 60 seconds to the comment time because it doesn't have seconds whereas the visit time
    // has. See also timeConflict in BootProcess#processVisits(). Unseen comment might be not new if
    // it's a changed old comment.
    this.isNew = Boolean(commentTime + 60 > currentPageVisits[0] || unseenComment?.isNew);
    this.isSeen = Boolean(
      (commentTime + 60 <= currentPageVisits[currentPageVisits.length - 1] || this.isOwn) &&
        !unseenComment
    );

    if (unseenComment?.isChangedSincePreviousVisit && unseenComment.$changeNote) {
      this.addChangeNote(unseenComment.$changeNote);
      if (unseenComment.willFlashChangedOnSight) {
        this.flashChangedOnSight();
      }
    }

    return commentTime <= currentTime && currentTime < commentTime + 60;
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
    if (this.index === 0) return;

    const previousComment = /** @type {Comment} */ (commentRegistry.getByIndex(this.index - 1));
    if (this.level !== previousComment.level) return;

    const previousCommentLastElement = previousComment.elements.slice(-1)[0];
    const potentialElement = previousCommentLastElement.nextElementSibling;
    if (
      previousCommentLastElement.parentElement &&
      ['DD', 'LI'].includes(previousCommentLastElement.parentElement.tagName) &&
      previousCommentLastElement.tagName === 'DIV' &&
      potentialElement === this.elements[0] &&
      potentialElement.tagName === 'DIV'
    ) {
      previousComment.parser.splitParentAfterNode(
        /** @type {Node} */ (potentialElement.previousSibling)
      );
    }
  }

  /**
   * If this comment is replied to, get the comment that will end up directly above the reply.
   *
   * @returns {Comment}
   */
  getCommentAboveReply() {
    return this.getChildren(true).slice(-1)[0] || this;
  }

  /**
   * After the page is reloaded and this instance doesn't relate to a rendered comment on the page,
   * get the instance of this comment that does.
   *
   * @returns {?Comment}
   */
  findNewSelf() {
    if (!this.id) {
      return null;
    }

    return commentRegistry.getById(this.id);
  }

  /**
   * Get the name of the comment's method creating a comment form with the specified mode. Used for
   * polymorphism with {@link Section}.
   *
   * @param {import('./CommentForm').CommentFormMode} mode
   * @returns {string}
   */
  getCommentFormMethodName(mode) {
    return mode;
  }

  /**
   * Collapse the comment in a thread.
   *
   * @param {import('./Thread').default} thread
   * @returns {?number} If the comment is already collapsed, the index of the last comment in the
   *   collapsed thread.
   */
  collapse(thread) {
    if (this.thread?.isCollapsed && this.thread !== thread) {
      return this.thread.lastComment.index;
    }
    this.isCollapsed = true;
    this.collapsedThread = thread;
    this.removeLayers();

    return null;
  }

  /**
   * Expand the comment in a thread.
   *
   * @returns {?number} If the comment is collapsed, the index of the last comment in the collapsed
   *   thread.
   */
  expand() {
    if (this.thread?.isCollapsed) {
      return this.thread.lastComment.index;
    }
    this.isCollapsed = false;
    this.collapsedThread = null;
    this.configureLayers();

    return null;
  }

  /**
   * _For internal use._ Change the selected state of the comment: is text in it selected or not.
   *
   * @param {boolean} selected
   */
  setSelected(selected) {
    if (selected) {
      if (this.isActionable) {
        this.isSelected = true;
        this.configureLayers();
        this.replyButton?.setLabel(cd.s('cm-quote'));
      }
    } else {
      this.isSelected = false;
      this.replyButton?.setLabel(cd.s('cm-reply'));
    }
  }

  /**
   * _For internal use._ Remove DT's event listener from its comment link and attach ours.
   */
  handleDtTimestampClick() {
    if (!this.id) return;

    this.$elements
      .find('.ext-discussiontools-init-timestamplink')
      .off()
      .on('click', this.copyLink.bind(this));
  }

  /**
   * Get the sibling comments - all children of a parent, whether the parent is a comment or
   * section.
   *
   * @returns {Comment[]}
   */
  getSiblingsAndSelf() {
    let comments = /** @type {Comment[]|undefined} */ (this.getParent()?.getChildren());
    if (!comments) {
      if (this.section) {
        comments = this.section.commentsInFirstChunk.filter((comment) => !comment.getParent());
      } else {
        // Parentless comments in the lead section
        comments = commentRegistry.query((comment) => !comment.section && !comment.getParent());
      }
    }

    return comments;
  }

  /**
   * Get the placeholder for the comment form's headline input.
   *
   * Used for polymorphism with {@link Section#getCommentFormHeadlineInputPlaceholder} and
   * {@link Page#getCommentFormHeadlineInputPlaceholder}.
   *
   * @param {import('./CommentForm').CommentFormMode} mode
   * @returns {string}
   */
  getCommentFormHeadlineInputPlaceholder(mode) {
    const parentSection = this.section?.getParent();
    if (mode === 'edit' && parentSection) {
      return cd.s('cf-headline-subsection', parentSection.headline);
    }

    return cd.s('cf-headline-topic');
  }

  /**
   * Get the placeholder for the comment form's comment input.
   *
   * Used for polymorphism with {@link Section#getCommentFormCommentInputPlaceholder} and
   * {@link Page#getCommentFormCommentInputPlaceholder}.
   *
   * @param {import('./CommentForm').CommentFormMode} mode
   * @param {() => void} callback
   * @returns {?string}
   */
  getCommentFormCommentInputPlaceholder(mode, callback) {
    if (mode === 'edit') {
      return '';
    }

    if (this.isOpeningSection) {
      return cd.s(
        'cf-comment-placeholder-replytosection',
        /** @type {import('./Section').default} */ (this.section).headline
      );
    }

    this.maybeRequestAuthorGender(callback, true);

    return null;
  }

  /**
   * Check if the comment is deletable.
   *
   * @returns {boolean}
   */
  isDeletable() {
    return this.isOpeningSection
      ? /** @type {import('./Section').default} */ (this.section).comments.length === 1
      : !this.getChildren().length;
  }

  /**
   * Get the comment that is visually a target of the comment form that has the comment as target.
   *
   * Used for polymorphism with {@link Section#getCommentFormTargetComment} and
   * {@link Page#getCommentFormTargetComment}.
   *
   * @returns {?this}
   */
  getCommentFormTargetComment() {
    return this;
  }

  /**
   * Type checking helper.
   *
   * @returns {this is Comment}
   */
  isComment() {
    return true;
  }

  /**
   * Check whether the command has a date.
   *
   * @returns {this is { date: Date }}
   */
  hasDate() {
    return Boolean(this.date);
  }

  static prototypes = new PrototypeRegistry();

  /**
   * @typedef {object} ThanksData
   * @property {string} id
   * @property {number} thankTime
   */

  /** @type {StorageItemWithKeys<ThanksData>} */
  static thanksStorage = new StorageItemWithKeys('thanks')
    .cleanUp((entry) => (entry.thankTime || 0) < subtractDaysFromNow(60))
    .save();

  /** @type {RegExp} */
  static dtIdRegexp;

  static {
    // Doesn't account for cases when the section headline ends with -<number>.
    const newDtTimestampPattern = '(\\d{4})(\\d{2})(\\d{2})(\\d{2})(\\d{2})\\d{2}';
    const oldDtTimestampPattern = '(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}.\\d{3}Z)';

    this.dtIdRegexp = new RegExp(
      `^c-` +
        `(?:(.+?)-(?:${newDtTimestampPattern}|${oldDtTimestampPattern}))` +
        `(?:-(?:(.+?)-(?:${newDtTimestampPattern}|${oldDtTimestampPattern})|(.+?))` +
        `(?:-(\\d+))?)?$`
    );
  }

  /**
   * _For internal use._ Create element prototypes to reuse them instead of creating new elements
   * from scratch (which is more expensive).
   */
  static initPrototypes() {
    /* Comment header element */
    if (settings.get('reformatComments') !== false) {
      // true, null
      const headerElement = document.createElement('div');
      headerElement.className = 'cd-comment-header';

      const authorWrapper = document.createElement('div');
      authorWrapper.className = 'cd-comment-author-wrapper';
      headerElement.append(authorWrapper);

      const authorLink = document.createElement('a');
      authorLink.className = 'cd-comment-author mw-userlink';
      authorWrapper.append(authorLink);

      const bdiElement = document.createElement('bdi');
      authorLink.append(bdiElement);

      const authorLinksWrapper = document.createElement('span');
      authorLinksWrapper.className = 'cd-comment-author-links';

      const authorTalkLink = document.createElement('a');
      authorTalkLink.textContent = cd.s('comment-author-talk');
      authorLinksWrapper.append(cd.mws('parentheses-start'), authorTalkLink);

      if (settings.get('showContribsLink')) {
        const separator = document.createElement('span');
        separator.innerHTML = cd.sParse('dot-separator');

        const contribsLink = document.createElement('a');
        contribsLink.textContent = cd.s('comment-author-contribs');

        authorLinksWrapper.append(separator, contribsLink);
      }

      authorLinksWrapper.append(cd.mws('parentheses-end'));
      authorWrapper.append(' ', authorLinksWrapper);

      // We need a wrapper to ensure correct positioning in LTR-in-RTL situations and vice versa.
      const headerWrapper = document.createElement('div');
      headerWrapper.className = 'cd-comment-header-wrapper';
      headerWrapper.appendChild(headerElement);

      this.prototypes.add('headerWrapperElement', headerWrapper);

      this.prototypes.add(
        'goToParentButtonSvg',
        createSvg(16, 16, 20, 20).html(`<path d="M10 5l8 10H2z" />`)[0]
      );
      this.prototypes.add(
        'collapseChildThreadsButtonSvg',
        createSvg(16, 16, 20, 20).html(`<path d="M4 9h12v2H4z" />`)[0]
      );
      this.prototypes.add(
        'expandChildThreadsButtonSvg',
        createSvg(16, 16, 20, 20).html(`<path d="M11 9V4H9v5H4v2h5v5h2v-5h5V9z" />`)[0]
      );
    }

    /* OOUI buttons. Creating every OOUI button using the constructor takes 15 times longer than
    cloning */
    if (settings.get('reformatComments') !== true) {
      this.prototypes.addWidget(
        'replyButton',
        () =>
          new OO.ui.ButtonWidget({
            label: cd.s('cm-reply'),
            framed: false,
            classes: ['cd-button-ooui', 'cd-comment-button-ooui'],
          })
      );

      this.prototypes.addWidget(
        'editButton',
        () =>
          new OO.ui.ButtonWidget({
            label: cd.s('cm-edit'),
            framed: false,
            classes: ['cd-button-ooui', 'cd-comment-button-ooui'],
          })
      );

      this.prototypes.addWidget(
        'thankButton',
        () =>
          new OO.ui.ButtonWidget({
            label: cd.s('cm-thank'),
            title: cd.s('cm-thank-tooltip'),
            framed: false,
            classes: ['cd-button-ooui', 'cd-comment-button-ooui'],
          })
      );

      this.prototypes.addWidget(
        'copyLinkButton',
        () =>
          new OO.ui.ButtonWidget({
            label: cd.s('cm-copylink'),
            icon: 'link',
            title: cd.s('cm-copylink-tooltip'),
            framed: false,
            invisibleLabel: true,
            classes: ['cd-button-ooui', 'cd-comment-button-ooui', 'cd-comment-button-ooui-icon'],
          })
      );

      this.prototypes.addWidget(
        'goToParentButton',
        () =>
          new OO.ui.ButtonWidget({
            label: cd.s('cm-gotoparent'),
            icon: 'upTriangle',
            title: cd.s('cm-gotoparent-tooltip'),
            framed: false,
            invisibleLabel: true,
            classes: ['cd-button-ooui', 'cd-comment-button-ooui', 'cd-comment-button-ooui-icon'],
          })
      );

      this.prototypes.addWidget(
        'goToChildButton',
        () =>
          new OO.ui.ButtonWidget({
            label: cd.s('cm-gotochild'),
            icon: 'downTriangle',
            title: cd.s('cm-gotochild-tooltip'),
            framed: false,
            invisibleLabel: true,
            classes: ['cd-button-ooui', 'cd-comment-button-ooui', 'cd-comment-button-ooui-icon'],
          })
      );
    }

    /* Comment layer elements */
    const commentUnderlay = document.createElement('div');
    commentUnderlay.className = 'cd-comment-underlay';

    const commentOverlay = document.createElement('div');
    commentOverlay.className = 'cd-comment-overlay';

    const overlayLine = document.createElement('div');
    overlayLine.className = 'cd-comment-overlay-line';
    commentOverlay.appendChild(overlayLine);

    const overlayMarker = document.createElement('div');
    overlayMarker.className = 'cd-comment-overlay-marker';
    commentOverlay.appendChild(overlayMarker);

    if (!settings.get('reformatComments')) {
      const overlayInnerWrapper = document.createElement('div');
      overlayInnerWrapper.className = 'cd-comment-overlay-innerWrapper';
      commentOverlay.appendChild(overlayInnerWrapper);

      const overlayGradient = document.createElement('div');
      overlayGradient.textContent = '\xa0';
      overlayGradient.className = 'cd-comment-overlay-gradient';
      overlayInnerWrapper.appendChild(overlayGradient);

      const overlayContent = document.createElement('div');
      overlayContent.className = 'cd-comment-overlay-content';
      overlayInnerWrapper.appendChild(overlayContent);
    }

    this.prototypes.add('underlay', commentUnderlay);
    this.prototypes.add('overlay', commentOverlay);
  }

  /**
   * Get the bounding client rectangle for a comment part.
   *
   * @param {Element} el
   * @returns {import('./utils-window').AnyDOMRect}
   * @private
   */
  static getCommentPartRect(el) {
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
   * Turn a comment array into an object with sections or their IDs as keys.
   *
   * @param {import('./updateChecker').CommentWorkerMatched[]|Comment[]} comments
   * @returns {import('./updateChecker').AddedComments['bySection']}
   */
  static groupBySection(comments) {
    const map = new Map();
    for (const comment of comments) {
      if (!map.has(comment.section)) {
        map.set(comment.section, []);
      }
      map.get(comment.section).push(comment);
    }

    return map;
  }

  /**
   * @typedef {object} ParseIdReturn
   * @property {Date} date
   * @property {string} author
   * @inner
   */

  /**
   * Extract a date and author from a comment ID. Currently doesn't extract the index (if there are
   * multiple comments with the same timestamp on the page), but it hasn't been needed yet in the
   * script.
   *
   * @param {string} id
   * @returns {?ParseIdReturn}
   */
  static parseId(id) {
    const match = id.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})_(.+)$/);
    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const hours = Number(match[4]);
    const minutes = Number(match[5]);
    const author = underlinesToSpaces(match[6]);

    const date = new Date(Date.UTC(year, month, day, hours, minutes));

    return { date, author };
  }

  /**
   * Parse a comment ID in the DiscussionTools format.
   *
   * @param {string} id Comment ID in the DiscussionTools format.
   * @returns {?object}
   */
  static parseDtId(id) {
    const match = id.match(this.dtIdRegexp);
    if (!match) {
      return null;
    }

    const parseTimestamp = (startIndex) => {
      const author = underlinesToSpaces(match[startIndex]);
      let date;
      if (match[startIndex + 1]) {
        const year = Number(match[startIndex + 1]);
        const month = Number(match[startIndex + 2]) - 1;
        const day = Number(match[startIndex + 3]);
        const hours = Number(match[startIndex + 4]);
        const minutes = Number(match[startIndex + 5]);
        date = new Date(Date.UTC(year, month, day, hours, minutes));
      } else {
        date = new Date(match[startIndex + 6]);
      }
      return [author, date];
    };

    const [author, date] = parseTimestamp(1);
    const [parentAuthor, parentDate] = match[8] ? parseTimestamp(8) : [];
    const sectionIdBeginning = match[15];
    const index = match[16] ? Number(match[16]) : undefined;

    return { author, date, parentAuthor, parentDate, sectionIdBeginning, index };
  }

  /**
   * Scroll to the first comment in the list, but flash all of them.
   *
   * @param {Comment[]} comments
   * @param {ScrollToConfig} [scrollToConfig]
   */
  static scrollToFirstFlashAll(comments, scrollToConfig) {
    comments[0].scrollTo({
      flash: false,
      pushState: true,
      callback: () => {
        comments.forEach((comment) => comment.flashTarget());
      },
      ...scrollToConfig,
    });
  }
}

export default Comment;
