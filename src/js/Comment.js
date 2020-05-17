/**
 * @module Comment
 */

import CdError from './CdError';
import CommentForm from './CommentForm';
import CommentSkeleton from './CommentSkeleton';
import cd from './cd';
import commentLayers from './commentLayers';
import navPanel from './navPanel';
import userRegistry from './userRegistry';
import { ElementsTreeWalker, TreeWalker } from './treeWalker';
import {
  caseInsensitiveFirstCharPattern,
  defined,
  handleApiReject,
  notNull,
  removeDuplicates,
  reorderArray,
} from './util';
import { copyLink } from './modal.js';
import {
  decodeHtmlEntities,
  extractSignatures,
  hideSensitiveCode,
  normalizeCode,
  removeWikiMarkup,
  unhideSensitiveCode,
} from './wikitext';
import { getLastRevision, getUserGenders } from './apiWrappers';

/**
 * Calculates the proportion of the number of words (3 characters long minimum) present in both
 * strings to the total words count.
 *
 * @param {string} s1
 * @param {string} s2
 * @returns {number}
 * @private
 */
function calculateWordsOverlap(s1, s2) {
  const regexp = new RegExp(`[${cd.g.LETTER_PATTERN}]{3,}`, 'g');
  const words1 = removeDuplicates(s1.match(regexp));
  const words2 = removeDuplicates(s2.match(regexp));
  if (!words1 || !words2) {
    return 0;
  }

  let total = words2.length;
  let overlap = 0;
  words1.forEach((word1) => {
    if (words2.some((word2) => word2 === word1)) {
      overlap++;
    } else {
      total++;
    }
  });

  return overlap / total;
}

/**
 * Class representing a comment (any signed, and in some cases unsigned, text on a wiki talk page).
 *
 * @augments module:CommentSkeleton
 */
export default class Comment extends CommentSkeleton {
  #elementPrototypes
  #firstWidth
  #underlay
  #layersTop
  #layersLeft
  #layersWidth
  #layersHeight
  #overlay
  #overlayInnerWrapper
  #overlayContent
  #overlayGradient
  #unhighlightTimeout
  #cached$elements
  #cachedCommentText
  #cachedParent
  #cachedUnderlayContainer

  /**
   * Create a comment object.
   *
   * @param {Parser} parser A relevant instance of {@link module:Parser Parser}.
   * @param {object} signature Signature object returned by {@link
   *   module:Parser#findSignatures}.
   */
  constructor(parser, signature) {
    super(parser, signature);

    this.#elementPrototypes = cd.g.COMMENT_ELEMENT_PROTOTYPES;

    /**
     * Comment author {@link module:userRegistry~User user object}.
     *
     * @type {User}
     */
    this.author = userRegistry.getUser(this.authorName);

    /**
     * Not used in the Comment class.
     *
     * @name authorName
     * @type {undefined}
     * @instance module:Comment
     */
    delete this.authorName;

    /**
     * Comment signature element.
     *
     * @type {Element}
     */
    this.signatureElement = signature.element;

    /**
     * Comment timestamp element.
     *
     * @type {Element}
     */
    this.timestampElement = signature.timestampElement;

    const frozen = (
      !cd.g.isPageActive ||
      cd.g.specialElements.closedDiscussions.some((el) => el.contains(this.elements[0]))
    );

    /**
     * Is the comment actionable, i.e. is not in a closed discussion or an old diff page.
     * (Previously the presence of an author was also checked, but currently all comments should
     * have an author.)
     *
     * @type {boolean}
     */
    this.actionable = !frozen;

    this.highlightables.forEach((el) => {
      this.bindEvents(el);
    });
  }

  /**
   * Bind the standard events to a comment part. Executed on comment object creation and DOM
   * modifications affecting comment parts.
   *
   * @param {Element} el
   */
  bindEvents(el) {
    el.onmouseenter = this.highlightFocused.bind(this);
    el.onmouseleave = this.unhighlightFocused.bind(this);
    el.ontouchstart = this.highlightFocused.bind(this);
  }

  /**
   * Get the comment coordinates and set them as the `positions` comment property. If the comment is
   * invisible, positions are unset.
   *
   * Note that comment coordinates are not static, obviously, but we need to recalculate them only
   * occasionally.
   *
   * @param {object} [config={}]
   * @private
   */
  getPositions(config = {}) {
    if (config.considerFloating === undefined) {
      config.considerFloating = false;
    }

    this.positions = null;

    if (this.editForm) return;

    let rectTop = config.rectTop || this.highlightables[0].getBoundingClientRect();
    let rectBottom = (
      config.rectBottom ||
      (
        this.elements.length === 1 ?
        rectTop :
        this.highlightables[this.highlightables.length - 1].getBoundingClientRect()
      )
    );

    // If the comment has 0 as the left position, it's probably invisible for some reason.
    if (rectTop.left === 0) return;

    const top = window.pageYOffset + rectTop.top;
    const bottom = window.pageYOffset + rectBottom.bottom;

    if (config.considerFloating) {
      const floatingRects = (
        config.floatingRects ||
        cd.g.specialElements.floating.map((el) => {
          const nativeRect = el.getBoundingClientRect();
          return {
            top: nativeRect.top - Number(el.getAttribute('data-margin-top')),
            bottom: nativeRect.bottom + Number(el.getAttribute('data-margin-bottom')),
          };
        })
      );
      const intersectsFloating = floatingRects.some((rect) => {
        const floatingTop = window.pageYOffset + rect.top;
        const floatingBottom = window.pageYOffset + rect.bottom;
        return bottom > floatingTop && bottom < floatingBottom + cd.g.REGULAR_LINE_HEIGHT;
      });

      // We calculate the right border separately - in its case, we need to change the overflow
      // property to get the desired value, otherwise floating elements are not taken into account.
      const initialOverflows = [];
      if (intersectsFloating) {
        for (let i = 0; i < this.elements.length; i++) {
          initialOverflows[i] = this.elements[i].style.overflow;
          this.elements[i].style.overflow = 'hidden';
        }
      }

      rectTop = this.highlightables[0].getBoundingClientRect();
      rectBottom = this.elements.length === 1 ?
        rectTop :
        this.highlightables[this.highlightables.length - 1].getBoundingClientRect();

      if (intersectsFloating) {
        for (let i = 0; i < this.elements.length; i++) {
          this.elements[i].style.overflow = initialOverflows[i];
        }
      }
    }
    const left = window.pageXOffset + Math.min(rectTop.left, rectBottom.left);
    const right = window.pageXOffset + Math.max(rectTop.right, rectBottom.right);

    // A solution for comments that have the height bigger than the viewport height. In Chrome, the
    // scrolling step is 40 pixels.
    const downplayedBottom = bottom - top > (window.innerHeight - 200) ?
      top + (window.innerHeight - 200) :
      bottom;

    this.positions = { top, bottom, left, right, downplayedBottom };
  }

  /**
   * Calculate underlay positions.
   *
   * @param {object} [config={}]
   * @returns {?object}
   * @private
   */
  calculateLayersPositions(config = {}) {
    // getBoundingClientRect() calculation is a little costly, so we take the value that has already
    // been calculated in configuration where possible.

    this.getPositions(Object.assign({}, config, { considerFloating: true }));

    if (!this.positions) {
      return null;
    }

    // This is to determine if the element has moved in future checks.
    this.#firstWidth = this.highlightables[0].offsetWidth;

    const layersContainerOffset = this.getLayersContainerOffset();

    return {
      underlayTop: -layersContainerOffset.top + this.positions.top,
      underlayLeft: (
        -layersContainerOffset.left + this.positions.left - cd.g.COMMENT_UNDERLAY_SIDE_MARGIN
      ),
      underlayWidth: (
        this.positions.right - this.positions.left + cd.g.COMMENT_UNDERLAY_SIDE_MARGIN * 2
      ),
      underlayHeight: this.positions.bottom - this.positions.top,
    };
  }

  /**
   * Create the comment's underlay and overlay.
   *
   * @private
   */
  createLayers() {
    this.#underlay = this.#elementPrototypes.underlay.cloneNode(true);
    if (this.newness) {
      this.#underlay.classList.add('cd-commentUnderlay-new');
    }
    if (cd.settings.highlightOwnComments && this.own) {
      this.#underlay.classList.add('cd-commentUnderlay-own');
    }
    this.#underlay.cdTarget = this;
    commentLayers.underlays.push(this.#underlay);

    this.#overlay = this.#elementPrototypes.overlay.cloneNode(true);
    this.#overlayInnerWrapper = this.#overlay.firstChild;
    // Hide the overlay on right click. It can block clicking the author page link.
    this.#overlayInnerWrapper.oncontextmenu = (e) => {
      e.preventDefault();
      this.#overlay.style.display = 'none';
    };
    this.#overlayGradient = this.#overlayInnerWrapper.firstChild;
    this.#overlayContent = this.#overlayInnerWrapper.lastChild;

    if (this.parent) {
      /**
       * "Go to the parent comment" button.
       *
       * @type {Element|undefined}
       */
      this.goToParentButton = this.#elementPrototypes.goToParentButton.cloneNode(true);
      this.goToParentButton.firstChild.onclick = () => {
        this.goToParent();
      };
      this.#overlayContent.appendChild(this.goToParentButton);
    }

    if (
      this.anchor &&
      (!cd.g.IS_ARCHIVE_PAGE || cd.settings.defaultCommentLinkType !== 'diff')
    ) {
      /**
       * "Copy link" button.
       *
       * @type {Element|undefined}
       */
      this.linkButton = this.#elementPrototypes.linkButton.cloneNode(true);
      this.linkButton.firstChild.onclick = this.copyLink.bind(this);
      this.#overlayContent.appendChild(this.linkButton);
    }

    if (this.author.registered && this.date && !this.own && !cd.g.IS_ARCHIVE_PAGE) {
      /**
       * Thank button.
       *
       * @type {Element|undefined}
       */
      this.thankButton = this.#elementPrototypes.thankButton.cloneNode(true);
      this.thankButton.firstChild.onclick = () => {
        this.thank();
      };
      this.#overlayContent.appendChild(this.thankButton);
    }

    if (this.actionable) {
      if (this.own || cd.settings.allowEditOthersComments) {
        /**
         * Edit button.
         *
         * @type {Element|undefined}
         */
        this.editButton = this.#elementPrototypes.editButton.cloneNode(true);
        this.editButton.firstChild.onclick = () => {
          this.edit();
        };
        this.#overlayContent.appendChild(this.editButton);
      }

      /**
       * Reply button.
       *
       * @type {Element|undefined}
       */
      this.replyButton = this.#elementPrototypes.replyButton.cloneNode(true);
      this.replyButton.firstChild.onclick = () => {
        if (this.replyForm) {
          this.replyForm.cancel();
        } else {
          this.reply();
        }
      };
      this.#overlayContent.appendChild(this.replyButton);
    } else {
      const treeWalker = new ElementsTreeWalker(this.elements[this.elements.length - 1]);
      while (treeWalker.parentNode()) {
        const backgroundColor = window.getComputedStyle(treeWalker.currentNode).backgroundColor;
        if (backgroundColor.includes('rgb(')) {
          /**
           * Comment's background color if not default.
           *
           * @type {string|undefined}
           */
          this.backgroundColor = backgroundColor;
          break;
        }
      }
    }

    /**
     * Comment's underlay.
     *
     * @type {?(JQuery|undefined)}
     */
    this.$underlay = $(this.#underlay);

    /**
     * Comment's overlay.
     *
     * @type {?(JQuery|undefined)}
     */
    this.$overlay = $(this.#overlay);

    /**
     * Links container of the comment's overlay.
     *
     * @type {?(JQuery|undefined)}
     */
    this.$overlayContent = $(this.#overlayContent);

    /**
     * Gradient element of the comment's overlay.
     *
     * @type {?(JQuery|undefined)}
     */
    this.$overlayGradient = $(this.#overlayGradient);
  }

  /**
   * Add the underlay and overlay if they are missing, recalculate their positions and redraw if
   * they have been moved, or do nothing if everything is right.
   *
   * @param {boolean} [doSet=true] Change the layers' parameters in case they are moved or existent.
   *   If set to false, it is expected that the layers created during this procedure, if any, will
   *   be added afterwards (otherwise there would be layers without a parent element which would
   *   lead to bugs).
   * @param {object} [floatingRects] `getBoundingClientRect()` results. It may be calculated in
   *   advance for many elements in one sequence to save time.
   * @returns {?boolean} Was the comment moved.
   */
  configureLayers(doSet = true, floatingRects) {
    if (this.editForm) {
      return null;
    }

    const config = { doSet, floatingRects };
    config.rectTop = this.highlightables[0].getBoundingClientRect();
    config.rectBottom = (
      this.elements.length === 1 ?
      config.rectTop :
      this.highlightables[this.highlightables.length - 1].getBoundingClientRect()
    );

    const layersContainerOffset = this.getLayersContainerOffset();
    const isMoved = (
      this.#underlay &&
      (
        -layersContainerOffset.top + window.pageYOffset + config.rectTop.top !== this.#layersTop ||
        config.rectBottom.bottom - config.rectTop.top !== this.#layersHeight ||
        this.highlightables[0].offsetWidth !== this.#firstWidth
      )
    );

    if (!this.#underlay || isMoved) {
      const positions = this.calculateLayersPositions(config);

      if (positions) {
        this.#layersTop = positions.underlayTop;
        this.#layersLeft = positions.underlayLeft;
        this.#layersWidth = positions.underlayWidth;
        this.#layersHeight = positions.underlayHeight;
      }
    }

    if (this.#layersLeft === undefined) {
      return null;
    }

    // Configure the layers only if they were unexistent or the comment position has changed, to
    // save time.
    if (this.#underlay) {
      if (this.newness) {
        this.#underlay.classList.add('cd-commentUnderlay-new');
      }
      if (isMoved && config.doSet) {
        this.updateLayersPositions();
      }
      return isMoved;
    } else {
      this.createLayers();

      if (config.doSet) {
        this.addLayers();
      }

      return false;
    }
  }

  /**
   * Add the comment's layers to the DOM.
   */
  addLayers() {
    if (this.#underlay) {
      this.updateLayersPositions();
      this.getLayersContainer().appendChild(this.#underlay);
      this.getLayersContainer().appendChild(this.#overlay);
    }
  }

  /**
   * Transfer the `#layers(Top|Left|Width|Height)` values to the style of the layers.
   */
  updateLayersPositions() {
    this.#underlay.style.top = this.#overlay.style.top = this.#layersTop + 'px';
    this.#underlay.style.left = this.#overlay.style.left = this.#layersLeft + 'px';
    this.#underlay.style.width = this.#overlay.style.width = this.#layersWidth + 'px';
    this.#underlay.style.height = this.#overlay.style.height = this.#layersHeight + 'px';
  }

  /**
   * Highlight the comment when it is focused.
   */
  highlightFocused() {
    if (cd.g.pageOverlayOn) return;

    // Add classes if the comment wasn't moved. If it was moved, the layers are removed and created
    // again on the next event.
    if (!this.configureLayers() && this.#underlay) {
      this.#underlay.classList.add('cd-commentUnderlay-focused');
      this.#overlay.classList.add('cd-commentOverlay-focused');
    }
  }

  /**
   * Unhighlight the comment when it has lost focus.
   */
  unhighlightFocused() {
    if (!this.#underlay) return;

    this.#underlay.classList.remove('cd-commentUnderlay-focused');
    this.#overlay.classList.remove('cd-commentOverlay-focused');
    this.#overlay.style.display = '';
  }

  /**
   * Highlight the comment as a target (it is opened by a link, just posted, is the target of the
   * up/down comment buttons, or is scrolled to after pressing a navigation panel button).
   */
  highlightTarget() {
    this.configureLayers();
    if (!this.$underlay) return;

    const $elementsToAnimate = this.$underlay
      .add(this.$overlayContent)
      .add(this.$overlayGradient)
      .css('background-image', 'none')
      .css('background-color', '');

    let initialColor = window.getComputedStyle(this.$underlay.get(0)).backgroundColor;
    if (initialColor === 'rgba(0, 0, 0, 0)' && this.backgroundColor) {
      initialColor = this.backgroundColor;
    }

    this.$underlay.addClass('cd-commentUnderlay-target');
    // We don't take the color from cd.g.COMMENT_UNDERLAY_TARGET_COLOR as it may be overriden by the
    // user in their personal CSS.
    const targetColor = window.getComputedStyle(this.$underlay.get(0)).backgroundColor;
    this.$underlay.removeClass('cd-commentUnderlay-target');

    $elementsToAnimate
      .stop()
      .css('background-color', targetColor);
    clearTimeout(this.#unhighlightTimeout);
    this.#unhighlightTimeout = setTimeout(() => {
      // We may not know from the beginning if the comment is new.
      if (this.newness) {
        initialColor = cd.g.COMMENT_UNDERLAY_NEW_COLOR;
      }
      $elementsToAnimate.animate(
        { backgroundColor: initialColor },
        400,
        'swing',
        function () {
          $(this)
            .css('background-image', '')
            .css('background-color', '');
        }
      );
    }, 1500);
  }

  /**
   * Scroll to the comment if it is not in the viewport.
   *
   * @param {string} alignment One of the values that {@link $.fn.cdScrollTo}
   *   accepts: `'top'`, `'center'`, or `'bottom'`.
   */
  scrollIntoView(alignment) {
    const $target = this.editForm ? this.editForm.$element : this.$elements;
    $target.cdScrollIntoView(alignment);
  }

  /**
   * Scroll to the comment and highlight it as a target.
   *
   * @param {boolean} [smooth=true] Use a smooth animation.
   */
  scrollToAndHighlightTarget(smooth = true) {
    const $elements = this.editForm ? this.editForm.$element : this.$elements;
    $elements.cdScrollTo(this.isOpeningSection || this.editForm ? 'top' : 'center', smooth);
    this.highlightTarget();
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
    this.#overlayContent.insertBefore(replacement, button);
    button.parentNode.removeChild(button);
    this[buttonName + 'Button'] = replacement;
  }

  /**
   * Scroll to the parent comment of the comment.
   */
  goToParent() {
    if (!this.parent) {
      console.error('This comment has no parent.');
      return;
    }

    this.parent.scrollToAndHighlightTarget('center');

    const goToChildButton = new OO.ui.ButtonWidget({
      label: cd.s('cm-gotochild'),
      title: cd.s('cm-gotochild-tooltip'),
      framed: false,
      classes: ['cd-button', 'cd-commentButton'],
    });
    goToChildButton.on('click', () => {
      this.parent.goToChild();
    });

    if (!this.parent.$underlay) {
      this.parent.configureLayers();
    }
    if (this.parent.goToChildButton) {
      this.parent.goToChildButton.$element.remove();
    }
    this.parent.$overlayContent.prepend(goToChildButton.$element);
    this.parent.goToChildButton = goToChildButton;

    /**
     * Child comment that has sent the user to this comment using the "Go to parent" function.
     *
     * @name childToScrollBackTo
     * @type {Comment|undefined}
     * @instance module:Comment
     */
    this.parent.childToScrollBackTo = this;
  }

  /**
   * Scroll to the child comment of the comment.
   */
  goToChild() {
    if (!this.childToScrollBackTo) {
      console.error('This comment has no child from which the user has navigated earlier.');
      return;
    }

    this.childToScrollBackTo.scrollToAndHighlightTarget('center');
  }

  /**
   * Copy a link to the comment or open a copy link dialog.
   *
   * @param {Event} e
   */
  copyLink(e) {
    const linkButton = this.linkButton;
    this.replaceButton(
      this.linkButton,
      this.#elementPrototypes.pendingLinkButton.cloneNode(true),
      'link'
    );
    copyLink(this, e.shiftKey, () => {
      this.replaceButton(this.linkButton, linkButton, 'link');
    });
  }

  /**
   * Find the edit that added the comment.
   *
   * @param {boolean} [singleTimestamp=false] Whether the edit has to have not more than one
   *   timestamp (used to detect edits adding more than one comment).
   * @returns {?object}
   * @throws {CdError}
   */
  async findAddingEdit(singleTimestamp = false) {
    if (singleTimestamp && this.addingEditOneTimestamp) {
      return this.addingEditOneTimestamp;
    }
    if (!singleTimestamp && this.addingEdit) {
      return this.addingEdit;
    }

    // Search for the edit in the range of 2 minutes before to 2 minutes later.
    const rvstart = new Date(this.date.getTime() - cd.g.MILLISECONDS_IN_A_MINUTE * 2).toISOString();
    const rvend = new Date(this.date.getTime() + cd.g.MILLISECONDS_IN_A_MINUTE * 2).toISOString();
    const revisionsRequest = cd.g.api.get({
      action: 'query',
      titles: this.sourcePage,
      prop: 'revisions',
      rvprop: ['ids', 'flags', 'comment', 'timestamp'],
      rvdir: 'newer',
      rvstart,
      rvend,
      rvuser: this.author.name,
      rvlimit: 500,
      redirects: true,
      formatversion: 2,
    }).catch(handleApiReject);

    let [revisionsResp] = await Promise.all([
      revisionsRequest,
      this.author.registered ? getUserGenders([this.author]) : undefined,
    ].filter(defined));

    const revisions = (
      revisionsResp &&
      revisionsResp.query &&
      revisionsResp.query.pages &&
      revisionsResp.query.pages[0] &&
      revisionsResp.query.pages[0].revisions
    );
    if (!revisions) {
      throw new CdError({
        type: 'api',
        code: 'noData',
      });
    }

    const compareRequests = revisions.map((revision) => cd.g.api.get({
      action: 'compare',
      fromtitle: this.sourcePage,
      fromrev: revision.revid,
      torelative: 'prev',
      prop: 'diff|diffsize',
      formatversion: 2,
    }).catch(handleApiReject));

    const compareData = await Promise.all(compareRequests);
    const regexp = /<td colspan="2" class="diff-empty">&#160;<\/td>\s*<td class="diff-marker">\+<\/td>\s*<td class="diff-addedline"><div>(?!=)(.+?)<\/div><\/td>\s*<\/tr>/g;
    const thisTextAndSignature = this.getText(false) + ` ${this.signatureElement.innerText}`;
    const matches = compareData.map((data, i) => {
      const body = data && data.compare && data.compare.body;
      if (!body) {
        return null;
      }

      let match;
      let text = '';
      let bestDiffPartOverlap = 0;
      while ((match = regexp.exec(body))) {
        const diffPartText = removeWikiMarkup(decodeHtmlEntities(match[1]));
        const diffPartOverlap = calculateWordsOverlap(diffPartText, thisTextAndSignature);
        if (
          diffPartOverlap > 0.66 &&
          (!bestDiffPartOverlap || diffPartOverlap > bestDiffPartOverlap)
        ) {
          bestDiffPartOverlap = diffPartOverlap;
        }
        text += diffPartText + '\n';
      }
      text = text.trim();
      if (!text) {
        return null;
      }

      const timestamp = new Date(revisions[i].timestamp).getTime();
      // Add 30 seconds to get better date proximity results since we don't see the seconds
      // number.
      const thisCommentTimestamp = this.date.getTime() + (30 * 1000);
      const overlap = calculateWordsOverlap(text, thisTextAndSignature);
      const timezoneMatch = text.match(cd.g.TIMEZONE_REGEXP);

      return {
        revision: revisions[i],
        overlap: Math.max(bestDiffPartOverlap, overlap),
        dateProximity: Math.abs(thisCommentTimestamp - timestamp),
        minor: revisions[i].minor,
        moreThanOneTimestamp: text.includes('\n') && timezoneMatch && timezoneMatch.length > 1,
      };
    });

    let bestMatch;
    matches
      .filter(notNull)
      .forEach((match) => {
        if (match.overlap < 0.66) return;
        if (!bestMatch || match.overlap > bestMatch.overlap) {
          bestMatch = match;
        }
        if (bestMatch && match.overlap === bestMatch.overlap) {
          if (match.dateProximity > bestMatch.dateProximity) {
            bestMatch = match;
          }
          if (match.dateProximity === bestMatch.dateProximity) {
            if (!match.minor && bestMatch.minor) {
              bestMatch = match;
            }
          }
        }
      });

    if (singleTimestamp && bestMatch && bestMatch.moreThanOneTimestamp) {
      throw new CdError({
        type: 'parse',
        code: 'moreThanOneTimestamp',
        data: { edit: bestMatch.revision },
      });
    }

    if (!bestMatch) {
      throw new CdError({
        type: 'parse',
      });
    }

    const result = bestMatch.revision;

    // Cache successful results.
    if (singleTimestamp) {
      this.addingEditOneTimestamp = result;
    } else {
      this.addingEdit = result;
    }

    return result;
  }

  /**
   * Get a diff link for a comment.
   *
   * @returns {string}
   * @private
   */
  async getDiffLink() {
    const edit = await this.findAddingEdit();
    const urlEnding = decodeURI(mw.util.getUrl(cd.g.CURRENT_PAGE, { diff: edit.revid }));
    return `https:${mw.config.get('wgServer')}${urlEnding}`;
  }

  /**
   * Find the edit that added the comment, ask for a confirmation, and send a "thank you"
   * notification.
   */
  async thank() {
    const thankButton = this.thankButton;
    this.replaceButton(
      this.thankButton,
      this.#elementPrototypes.pendingThankButton.cloneNode(true),
      'thank'
    );

    const thankFail = (e) => {
      const { type, code, data } = e.data;
      let text;
      switch (type) {
        case 'parse': {
          if (code === 'moreThanOneTimestamp') {
            const url = mw.util.getUrl(this.sourcePage, { diff: data.edit.revid });
            text = cd.util.wrapInElement(cd.s('thank-error-multipletimestamps', url));
            OO.ui.alert(text);
            return;
          } else {
            const url = mw.util.getUrl(this.sourcePage, { action: 'history' });
            text = cd.s('thank-error-diffnotfound', url);
          }
          break;
        }

        case 'api':
        default: {
          if (code === 'noData') {
            const url = mw.util.getUrl(this.sourcePage, { action: 'history' });
            text = cd.s('thank-error-diffnotfound', url);
          } else {
            text = cd.s('thank-error');
          }
          break;
        }

        case 'network': {
          text = cd.s('thank-error-network');
          break;
        }
      }
      mw.notify(cd.util.wrapInElement(text), { type: 'error' });
      this.replaceButton(this.thankButton, thankButton, 'thank');
    };

    let edit;
    try {
      edit = await this.findAddingEdit(true);
    } catch (e) {
      thankFail(e);
      return;
    }

    const url = mw.util.getUrl(this.sourcePage, { diff: edit.revid });
    const text = cd.util.wrapInElement(cd.s('thank-confirm', this.author.name, this.author, url));
    if (await OO.ui.confirm(text)) {
      try {
        await cd.g.api.postWithEditToken({
          action: 'thank',
          rev: edit.revid,
          source: cd.config.scriptCodeName,
        }).catch(handleApiReject);
      } catch (e) {
        thankFail(e);
        return;
      }
    }

    mw.notify(cd.s('thank-success'));
    this.replaceButton(
      this.thankButton,
      this.#elementPrototypes.disabledThankButton.cloneNode(true),
      'thank'
    );
  }

  /**
   * Locate the comment in the page source code and set the results to the `inCode` property.
   *
   * @param {string} pageCode
   * @throws {CdError}
   */
  locateInCode(pageCode) {
    this.inCode = null;

    cd.debug.startTimer('locate comment');

    // Collect matches
    const matches = this.searchInCode(pageCode);

    // The main method: by the current & previous author & date & section headline & comment text
    // overlap. Necessary are the current author & date & comment text overlap.
    let bestMatch;
    matches.forEach((match) => {
      // There are always problems with the first comments as there are no previous comments to
      // compare to, and it's harder to tell the match, so we use a bit ugly solution here, although
      // it should be quite reliable: the comment firstness, matching author, date and headline.
      // Another option is to look for the next comments, not for the previous.
      // TODO: At the same time it's not reliable when getting the comment code to edit it, so we
      // need to come up a solution to it.
      if (
        (
          match.overlap > 0.66 ||
          (this.id === 0 && match.previousCommentsMatched && match.headlineMatched)
        ) &&
        (
          !bestMatch ||
          match.overlap > bestMatch.overlap ||
          (!bestMatch.headlineMatched && match.headlineMatched) ||
          (
            bestMatch.headlineMatched === match.headlineMatched &&
            !bestMatch.previousCommentMatched &&
            match.previousCommentMatched
          )
        )
      ) {
        bestMatch = match;
      }
    });

    // The reserve method: by this & previous two dates & authors.
    if (!bestMatch) {
      bestMatch = matches.find((match) => this.id !== 0 && match.previousCommentsMatched);
    }

    if (!bestMatch) {
      throw new CdError({
        type: 'parse',
        code: 'couldntLocateComment',
      });
    }

    let inCode = {
      lineStartIndex: bestMatch.lineStartIndex,
      startIndex: bestMatch.commentStartIndex,
      endIndex: bestMatch.signatureStartIndex,
      code: bestMatch.commentCode,
      dirtySignature: bestMatch.dirtySignature,
      indentationChars: bestMatch.indentationChars,
      headingStartIndex: bestMatch.headingStartIndex,
      headingLevel: bestMatch.headingLevel,
      headlineCode: bestMatch.headlineCode,
    };
    this.inCode = this.adjustCommentCodeData(inCode);

    cd.debug.stopTimer('locate comment');
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
      console.error('The Comment.prototype.inCode property should contain an object with the comment code data.');
      return;
    }
    let { code, indentationChars } = this.inCode;
    if (code === undefined || indentationChars === undefined) {
      console.error('No "code" or "indentationChars" property is set for Comment.prototype.inCode.');
      return;
    }

    let hidden;
    ({ code, hidden } = hideSensitiveCode(code));

    let text = code;

    if (this.level === 0) {
      // Collapse random line breaks that do not affect text rendering but will transform into <br>
      // on posting.
      text = text.replace(
        /^(.*[^}|>\n\x02\x04] *)\n(?![{|<:*# \n\x01\x03])/gm,
        (s, m1) => (
          m1 +
          (
            (
              /^[:*# ]/.test(m1) ||
              /(?:\x02|<\w+(?: [\w ]+?=[^<>]+?| ?\/?)>|<\/\w+ ?>)$/.test(m1)
            ) ?
            '\n' :
            ' '
          )
        )
      );
    }

    text = text
      // <br> → \n, except in list elements and <pre>'s created by a space starting the line.
      .replace(/^(?![:*# ]).*<br[ \n]*\/?>.*$/gmi, (s) => (
        s.replace(/<br[ \n]*\/?>\n? */gi, () => '\n')
      ))
      // Remove indentation characters
      .replace(/\n([:*#]*[:*])([ \t]*)/g, (s, m1, m2) => {
        return (
          '\n' +
          (
            m1.length >= indentationChars.length ?
            m1.slice(indentationChars.length) + (m1.length > indentationChars.length ? m2 : '') :
            m1 + m2
          )
        );
      });

    text = unhideSensitiveCode(text, hidden);

    if (cd.config.paragraphTemplates.length) {
      const pattern = cd.config.paragraphTemplates.map(caseInsensitiveFirstCharPattern).join('|');
      const regexp = new RegExp(`^((?!:|\\*|#).*)\\{\\{(?:${pattern})\\}\\}`, 'gm');
      text = text.replace(regexp, '$1\n\n');
    }

    return text.trim();
  }

  /**
   * @typedef {object} GetCodeReturn
   * @property {string} commentText
   * @property {string} headline
   */

  /**
   * Load the comment code.
   *
   * @returns {GetCodeReturn}
   * @throws {CdError|Error}
   */
  async getCode() {
    try {
      const page = await getLastRevision(this.sourcePage);
      this.locateInCode(page.code);
    } catch (e) {
      if (e instanceof CdError) {
        throw new CdError(Object.assign({}, { message: cd.s('cf-error-getpagecode') }, e.data));
      } else {
        throw e;
      }
    }

    return {
      commentText: this.codeToText(),
      headline: this.inCode.headlineCode,
    };
  }

  /**
   * Mark the comment as seen.
   *
   * @param {string} [registerAllInDirection] Mark all comments in the forward (`'forward'`) or
   *   backward (`'backward'`) direction from this comment as seen.
   * @param {boolean} [highlight=false] Highlight the comment.
   */
  registerSeen(registerAllInDirection, highlight = false) {
    if (this.newness === 'unseen') {
      /**
       * Comment's newness state: `undefined`, `'new'` or `'unseen'`.
       *
       * @type {string|undefined}
       */
      this.newness = 'new';
      navPanel.decrementUnseenCommentCount();
      if (highlight) {
        this.highlightTarget();
      }
    }

    if (registerAllInDirection && !navPanel.areAllCommentsSeen()) {
      const nextComment = cd.comments[this.id + (registerAllInDirection === 'forward' ? 1 : -1)];
      if (nextComment && nextComment.isInViewport(true)) {
        nextComment.registerSeen(registerAllInDirection, highlight);
      }
    }
  }

  /**
   * Determine if the comment is in the viewport. Return null if we couldn't get the comment
   * positions.
   *
   * @param {boolean} updatePositions Update the comment positions before determining the result.
   * @param {boolean} partially Return true even if only a part of the comment is in the viewport.
   * @returns {?boolean}
   */
  isInViewport(updatePositions = false, partially = false) {
    const viewportTop = window.pageYOffset;
    const viewportBottom = viewportTop + window.innerHeight;

    if (updatePositions || !this.positions) {
      this.getPositions();
    }
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
    if (!this.#underlay) return;

    commentLayers.underlays.splice(commentLayers.underlays.indexOf(this.#underlay), 1);

    this.#underlay.parentElement.removeChild(this.#underlay);
    this.#underlay = null;
    this.$underlay = null;

    this.#overlay.parentElement.removeChild(this.#overlay);
    this.#overlay = null;
    this.$overlay = null;
  }

  /**
   * Comment elements as a jQuery object.
   *
   * @type {JQuery}
   */
  // Using a getter allows to save a little time on running $().
  get $elements() {
    if (this.#cached$elements === undefined) {
      this.#cached$elements = $(this.elements);
    }
    return this.#cached$elements;
  }

  /**
   * Comment text.
   *
   * @type {string}
   */
  get text() {
    if (this.#cachedCommentText === undefined) {
      this.#cachedCommentText = this.getText();
    }
    return this.#cachedCommentText;
  }

  /**
   * Parent comment.
   *
   * @type {?Comment}
   */
  get parent() {
    if (this.#cachedParent === undefined) {
      this.#cachedParent = this.getParent();
    }
    return this.#cachedParent;
  }

  /**
   * Get the parent comment of the comment.
   *
   * This would work only if comments in cd.comments are in the order of their presence on the page
   * (which should be the case).
   *
   * @returns {?Comment}
   * @private
   */
  getParent() {
    let level = this.level;

    if (cd.g.specialElements.pageHasOutdents) {
      const treeWalker = new ElementsTreeWalker(this.elements[0]);
      let found;
      while (
        !found &&
        treeWalker.previousNode() &&
        !treeWalker.currentNode.classList.contains('cd-commentPart')
      ) {
        found = treeWalker.currentNode.classList.contains('outdent-template');
      }
      if (found && cd.comments[this.id - 1]) {
        return cd.comments[this.id - 1];
      }
    }

    if (level === 0) {
      return null;
    }

    return (
      cd.comments
        .slice(0, this.id)
        .reverse()
        .find((comment) => comment.section === this.section && comment.level < level) ||
      null
    );
  }

  /**
   * Get the comment's text without a signature.
   *
   * @param {boolean} [doCleanUp=true]
   * @returns {string}
   * @private
   */
  getText(doCleanUp = true) {
    const $clone = this.$elements
      .not('h1, h2, h3, h4, h5, h6')
      .clone()
      .removeClass('cd-hidden');
    const $dummy = $('<div>').append($clone);
    const selector = [
      '.cd-signature',
      cd.config.unsignedClass ? `.${cd.config.unsignedClass}` : undefined
    ]
      .filter(defined)
      .join(', ');
    $dummy.find(selector).remove();
    let text = $dummy.cdGetText();
    if (doCleanUp) {
      if (cd.config.cleanUpCommentText) {
        text = cd.config.cleanUpCommentText(text);
      }
      // FIXME: we use the same regexp for cleaning the wikitext and the render. With the current
      // default config value the side effects seem to be negligable, but who knows...
      if (cd.config.signaturePrefixRegexp) {
        text = text.replace(cd.config.signaturePrefixRegexp, '');
      }
    }

    return text;
  }

  /**
   * When searching for the comment, adjust the index of the comment beginning and some related
   * properties.
   *
   * @param {string} commentCode
   * @param {number} commentStartIndex
   * @returns {object}
   * @private
   */
  adjustCommentBeginning(commentCode, commentStartIndex) {
    // Identifying indentation characters
    let indentationChars = '';
    let lineStartIndex = commentStartIndex;

    const headingMatch = commentCode
      .match(/(^[^]*(?:^|\n))(=+)(.*?)\2[ \t]*(?:<!--[^]*?-->[ \t]*)*\n/);
    let headingStartIndex;
    let headingLevel;
    let headlineCode;
    if (headingMatch) {
      headingStartIndex = commentStartIndex + headingMatch[1].length;
      headingLevel = headingMatch[2].length;
      headlineCode = headingMatch[3].trim();
      commentStartIndex += headingMatch[0].length;
      commentCode = commentCode.slice(headingMatch[0].length);
    }

    // Exclude indentation characters and any foreign code before them from the comment code.
    // Comments at the zero level sometimes start with ":" that is used to indent some side note. It
    // shouldn't be considered an indentation character.
    if (this.level > 0) {
      const replaceIndentationChars = (s, m1, m2) => {
        indentationChars = m2;
        lineStartIndex += m1.length;
        commentStartIndex += s.length;
        return '';
      };

      const indentationCharsPattern = cd.config.customIndentationCharsPattern || '\\n*([:*#]*) *';
      commentCode = commentCode
        .replace(new RegExp(`^()${indentationCharsPattern}`), replaceIndentationChars);

      // See the comment "Without the following code, the section introduction..." in Parser.js.
      // Dangerous case: https://ru.wikipedia.org/w/index.php?oldid=105936825&action=edit&section=1.
      // This was actually a mistake to put a signature to the first level, but if it was legit,
      // only the last sentence should be interpreted as the comment.
      if (indentationChars === '') {
        commentCode = commentCode.replace(new RegExp(
          `(^[^]*?(?:^|\n))${indentationCharsPattern}(?![^]*\\n[^:*#])`),
          replaceIndentationChars
        );
      }
    }

    cd.g.BAD_COMMENT_BEGINNINGS.forEach((pattern) => {
      if (pattern.source[0] !== '^') {
        console.debug('Regexps in cd.config.customBadCommentBeginnings should have "^" as the first character.');
      }
      const match = commentCode.match(pattern);
      if (match) {
        commentStartIndex += match[0].length;
        commentCode = commentCode.slice(match[0].length);
      }
    });

    return {
      commentCode,
      lineStartIndex,
      commentStartIndex,
      headingMatch,
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
      data.dirtySignature = s + data.dirtySignature;
      data.endIndex -= s.length;
      return '';
    }

    if (this.own && cd.g.CURRENT_USER_SIGNATURE_PREFIX_REGEXP) {
      data.code = data.code
        .replace(cd.g.CURRENT_USER_SIGNATURE_PREFIX_REGEXP, movePartToSignature);
    }

    const tagRegexp = /(<(?:small|span|sup|sub)(?: [\w ]+?=[^<>]+?)?> *)+$/i;

    const movePartsToSignature = (code, regexps) => {
      regexps.forEach((regexp) => {
        code = code.replace(regexp, movePartToSignature);
      });
      return code;
    };

    // Why signaturePrefixRegexp three times? Well, the test case here is the MusikAnimal's
    // signature here: https://en.wikipedia.org/w/index.php?diff=next&oldid=946899148.
    data.code = movePartsToSignature(data.code, [
      cd.config.signaturePrefixRegexp,
      tagRegexp,
      cd.config.signaturePrefixRegexp,
      tagRegexp,
      /<small class="autosigned">.*$/,
      /<!-- *Template:Unsigned.*$/,
      cd.config.signaturePrefixRegexp,
    ]);

    // Exclude <small></small> and template wrappers from the strings
    const smallWrappers = [{
      start: /^<small>/,
      end: /<\/small>[ \u00A0\t]*$/,
    }];
    if (cd.config.blockSmallTemplate) {
      smallWrappers.push({
        start: new RegExp(`^(?:\\{\\{${cd.config.blockSmallTemplate}\\|1=)`),
        end: /\}\}[ \u00A0\t]*$/,
      });
    }

    data.signature = data.dirtySignature;
    data.inSmallFont = false;
    smallWrappers.some((wrapper) => {
      if (wrapper.start.test(data.code) && wrapper.end.test(data.signature)) {
        data.inSmallFont = true;
        data.code = data.code.replace(wrapper.start, '');
        data.signature = data.signature.replace(wrapper.end, '');
        return true;
      }
    });

    // If the comment contains different indentation character sets for different lines, then use
    // different sets depending on the mode (edit/reply).
    data.replyIndentationChars = data.indentationChars;
    if (!this.isOpeningSection) {
      // If the last line ends with "#", it's probably a numbered list _inside_ the comment, not two
      // comments in one, so we exclude such cases.
      const match = data.code.match(/\n([:*#]*[:*]).*$/);
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
   * @returns {object}
   * @private
   */
  searchInCode(pageCode) {
    const signatures = extractSignatures(pageCode);
    const matches = signatures
      // .startsWith() to account for cases where you can ignore timezone string in the "unsigned"
      // templates but it will appear on the page.
      .filter((sig) => (
        sig.author === this.author &&
        (
          this.timestamp === sig.timestamp ||
          (this.timestamp && this.timestamp.startsWith(sig.timestamp))
        )
      ));

    // For the reserve method; the main method uses one date.
    let previousTimestampsToCheckCount = 2;
    const previousComments = cd.comments
      .slice(Math.max(0, this.id - previousTimestampsToCheckCount), this.id)
      .reverse();

    // Collect data for every match
    matches.forEach((match) => {
      match.commentCode = pageCode.slice(match.commentStartIndex, match.signatureStartIndex);

      if (previousComments.length) {
        for (let i = 0; i < previousComments.length; i++) {
          const signature = signatures[match.id - 1 - i];
          // At least one coincided comment is enough if the second is unavailable.
          match.previousCommentsMatched = (
            signature &&
            signature.timestamp === previousComments[i].timestamp &&
            signature.author === previousComments[i].author
          );
          if (i === 0) {
            match.previousCommentMatched = match.previousCommentsMatched;
          }
          if (!match.previousCommentsMatched) break;
        }
      } else {
        // If there is no previous comment both on the page and in the code, it's a match.
        match.previousCommentsMatched = match.id === 0;
        match.previousCommentMatched = match.id === 0;
      }

      Object.assign(match, this.adjustCommentBeginning(match.commentCode, match.commentStartIndex));
      match.headlineMatched = this.followsHeading ?
        (
          match.headingMatch &&
          this.section &&
          this.section.headline &&
          (
            normalizeCode(removeWikiMarkup(match.headlineCode)) ===
            normalizeCode(this.section.headline)
          )
        ) :
        !match.headingMatch;

      const commentCodeToCompare = removeWikiMarkup(match.commentCode);
      match.overlap = calculateWordsOverlap(this.text, commentCodeToCompare);
    });

    return matches;
  }

  /**
   * Get and sometimes create a container for the comment's underlay.
   *
   * @returns {Element}
   */
  getLayersContainer() {
    if (this.#cachedUnderlayContainer === undefined) {
      let offsetParent;
      const treeWalker = new TreeWalker(document.body, null, true, this.elements[0]);
      while (treeWalker.parentNode()) {
        let style = treeWalker.currentNode.cdStyle;
        if (!style) {
          // window.getComputedStyle is expensive, so we save the result to a node property.
          style = window.getComputedStyle(treeWalker.currentNode);
          treeWalker.currentNode.cdStyle = style;
        }
        if (['absolute', 'relative'].includes(style.position)) {
          offsetParent = treeWalker.currentNode;
          break;
        }
        const backgroundColor = style.backgroundColor;
        if (backgroundColor.includes('rgb(')) {
          offsetParent = treeWalker.currentNode;
          offsetParent.classList.add('cd-layersContainerParent');
          break;
        }
      }
      if (!offsetParent) {
        offsetParent = document.body;
      }
      let container = offsetParent.firstElementChild;
      if (!container.classList.contains('cd-layersContainer')) {
        container = document.createElement('div');
        container.classList.add('cd-layersContainer');
        offsetParent.insertBefore(container, offsetParent.firstChild);
      }
      this.#cachedUnderlayContainer = container;
      if (!commentLayers.layersContainers.includes(container)) {
        commentLayers.layersContainers.push(container);
      }
    }
    return this.#cachedUnderlayContainer;
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
    const underlayContainer = this.getLayersContainer();
    let el = underlayContainer;
    let offsetParent;
    let top = 0;
    let left = 0;
    while ((offsetParent = el.offsetParent)) {
      top += offsetParent.offsetTop;
      left += offsetParent.offsetLeft;
      el = offsetParent;
    }
    return { top, left };
  }

  /**
   * Find any one comment inside the viewport.
   *
   * This would work only if comments in cd.comments are in the order of their presence on the page
   * (which should be the case).
   *
   * @param {string} [findClosestDirection] If there is no comment in the viewport, find the closest
   *   comment in the specified direction.
   * @returns {?Comment}
   */
  static findInViewport(findClosestDirection) {
    const viewportTop = window.pageYOffset;
    const viewportBottom = viewportTop + window.innerHeight;

    // Visibility in the sense that an element is visible on the page, not necessarily in the
    // viewport.
    const isVisible = (comment) => {
      comment.getPositions();
      return comment.positions;
    };
    const findVisible = (direction, startIndex = 0) => {
      const comments = reorderArray(cd.comments, startIndex, direction === 'backward');
      return comments.find(isVisible) || null;
    };

    const firstVisibleComment = findVisible('forward');
    const lastVisibleComment = findVisible('backward', cd.comments.length - 1);
    if (!firstVisibleComment) {
      return null;
    }
    let searchArea = {
      top: firstVisibleComment,
      bottom: lastVisibleComment,
    };
    let currentComment = searchArea.top;
    let foundComment;

    const findClosest = (direction, searchArea, reverse = false) => {
      if (direction === 'forward') {
        return findVisible(direction, reverse ? searchArea.top.id : searchArea.bottom.id);
      } else if (direction === 'backward') {
        return findVisible(direction, reverse ? searchArea.bottom.id : searchArea.top.id);
      }
      return null;
    };

    // Here, we don't iterate over cd.comments as it may look like. We narrow the search region by
    // getting a proportion of the distance between far away comments and the viewport and
    // calculating the ID of the next comment based on it; then, the position of that next comment
    // is checked, and so on. cd.comments.length value is used as an upper boundary for the number
    // of cycle steps. It's more of a protection against an infinite loop: the value is with a large
    // margin and not practically reachable, unless when there is only few comments. Usually the
    // cycle finishes after a few steps.
    for (let i = 0; i < cd.comments.length; i++) {
      if (currentComment.isInViewport(true)) {
        foundComment = currentComment;
        break;
      }

      if (
        currentComment.positions &&
        // The bottom edge of the viewport is above the first comment.
        (
          currentComment === firstVisibleComment &&
          viewportBottom < currentComment.positions.downplayedBottom
        ) ||
        // The top edge of the viewport is below the last comment.
        (currentComment === lastVisibleComment && viewportTop > currentComment.positions.top)
      ) {
        foundComment = findClosest(findClosestDirection, searchArea, true);
        break;
      }

      if (searchArea.top === searchArea.bottom) {
        foundComment = findClosest(findClosestDirection, searchArea);
        break;
      }

      if (!currentComment.positions) {
        // To avoid contriving a sophisticated algorithm for choosing which comment to pick next
        // (and avoid picking any previously picked) we just pick the comment next to the beginning
        // of the search area.
        currentComment = cd.comments[searchArea.top.id + 1];
        searchArea.top = currentComment;
        continue;
      }

      if (currentComment === firstVisibleComment) {
        currentComment = searchArea.bottom;
      } else {
        searchArea[viewportTop > currentComment.positions.top ? 'top' : 'bottom'] = currentComment;

        // There's not a single comment in the viewport.
        if (searchArea.bottom.id - searchArea.top.id <= 1) {
          foundComment = findClosest(findClosestDirection, searchArea);
          break;
        }

        // Determine the ID of the next comment to check.
        const higherTop = searchArea.top.positions.top;
        const lowerBottom = searchArea.bottom.positions.downplayedBottom;
        const proportion = (
          (viewportTop - higherTop) / ((lowerBottom - viewportBottom) + (viewportTop - higherTop))
        );
        if (proportion < 0 || proportion >= 1) {
          console.warn(
            'The proportion shouldn\'t be more than 0 or less or equal to 1.',
            'proportion', proportion,
            'searchArea', searchArea
          );
        }
        currentComment = cd.comments[Math.round(
          (searchArea.bottom.id - searchArea.top.id - 1) * proportion + searchArea.top.id + 0.5
        )];
      }
    }

    return foundComment || null;
  }

  /**
   * Get the comment by anchor.
   *
   * @param {string} anchor
   * @returns {?Comment}
   */
  static getCommentByAnchor(anchor) {
    if (!cd.comments || !anchor) {
      return null;
    }
    return cd.comments.find((comment) => comment.anchor === anchor) || null;
  }
}
