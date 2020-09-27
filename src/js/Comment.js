/**
 * Comment class.
 *
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
  dealWithLoadingBug,
  defined,
  getFromLocalStorage,
  getTopAndBottomIncludingMargins,
  handleApiReject,
  reorderArray,
  saveToLocalStorage,
  unhideText,
  unique,
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

let thanks;

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
  const words1 = (s1.match(regexp) || []).filter(unique);
  const words2 = (s2.match(regexp) || []).filter(unique);
  if (!words1.length || !words2.length) {
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
 * Remove thanks older than 60 days.
 *
 * @param {object[]} data
 * @returns {object}
 * @private
 */
function cleanUpThanks(data) {
  const newData = Object.assign({}, data);
  Object.keys(newData).forEach((key) => {
    if (newData[key].thankUnixTime < Date.now() - 60 * cd.g.SECONDS_IN_A_DAY * 1000) {
      delete newData[key];
    }
  });
  return newData;
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
     * Not used in the Comment class.
     *
     * @name authorName
     * @type {undefined}
     * @instance module:Comment
     */
    delete this.authorName;

    /**
     * Comment signature element as a jQuery object.
     *
     * @type {JQuery}
     */
    this.$signature = $(signature.element);

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
    this.actionable = (
      cd.g.isPageActive &&
      !cd.g.specialElements.closedDiscussions.some((el) => el.contains(this.elements[0]))
    );

    this.highlightables.forEach((el) => {
      this.bindEvents(el);
    });

    /**
     * Is the comment currently highlighted as the target comment.
     *
     * @type {boolean}
     */
    this.isTarget = false;

    /**
     * Is the comment currently focused.
     *
     * @type {boolean}
     */
    this.isFocused = false;
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
   * @param {object} [options={}]
   * @private
   */
  getPositions(options = {}) {
    if (options.considerFloating === undefined) {
      options.considerFloating = false;
    }

    this.positions = null;

    if (this.editForm) return;

    let rectTop = options.rectTop || this.highlightables[0].getBoundingClientRect();
    let rectBottom = (
      options.rectBottom ||
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

    if (options.considerFloating) {
      const floatingRects = (
        options.floatingRects ||
        cd.g.specialElements.floating.map(getTopAndBottomIncludingMargins)
      );
      let intersectsFloatingCount = 0;
      let bottomIntersectsFloating = false;
      floatingRects.forEach((rect) => {
        const floatingTop = window.pageYOffset + rect.top;
        const floatingBottom = window.pageYOffset + rect.bottom;
        if (bottom > floatingTop && bottom < floatingBottom + cd.g.REGULAR_LINE_HEIGHT) {
          bottomIntersectsFloating = true;
        }
        if (bottom > floatingTop && top < floatingBottom + cd.g.REGULAR_LINE_HEIGHT) {
          intersectsFloatingCount++;
        }
      });

      // We calculate the right border separately - in its case, we need to change the `overflow`
      // property to get the desired value, otherwise floating elements are not taken into account.
      const initialOverflows = [];
      if (bottomIntersectsFloating) {
        this.elements.forEach((el, i) => {
          initialOverflows[i] = el.style.overflow;
          el.style.overflow = 'hidden';
        });
      }

      rectTop = this.highlightables[0].getBoundingClientRect();
      rectBottom = this.elements.length === 1 ?
        rectTop :
        this.highlightables[this.highlightables.length - 1].getBoundingClientRect();

      // If the comment intersects more than one floating block, we better keep `overflow: hidden`
      // to avoid bugs like where there are two floating block to the right with different leftmost
      // positions, and the layer is more narrow than the comment.
      if (intersectsFloatingCount === 1) {
        this.elements.forEach((el, i) => {
          el.style.overflow = initialOverflows[i];
        });
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
   * Calculate the underlay and overlay positions.
   *
   * @param {object} [options={}]
   * @returns {?object}
   * @private
   */
  calculateLayersPositions(options = {}) {
    // getBoundingClientRect() calculation is a little costly, so we take the value that has already
    // been calculated where possible.

    this.getPositions(Object.assign({}, options, { considerFloating: true }));

    if (!this.positions) {
      return null;
    }

    // This is to determine if the element has moved in future checks.
    this.firstHighlightableWidth = this.highlightables[0].offsetWidth;

    return {
      layersTop: this.positions.top - options.layersContainerOffset.top,
      layersLeft: (
        this.positions.left -
        cd.g.COMMENT_UNDERLAY_SIDE_MARGIN -
        options.layersContainerOffset.left
      ),
      layersWidth: (
        this.positions.right -
        this.positions.left +
        cd.g.COMMENT_UNDERLAY_SIDE_MARGIN * 2
      ),
      layersHeight: this.positions.bottom - this.positions.top,
    };
  }

  /**
   * Create the comment's underlay and overlay.
   *
   * @fires commentLayersCreated
   * @private
   */
  createLayers() {
    this.underlay = this.elementPrototypes.underlay.cloneNode(true);
    if (this.newness) {
      this.underlay.classList.add('cd-commentUnderlay-new');
    }
    if (cd.settings.highlightOwnComments && this.isOwn) {
      this.underlay.classList.add('cd-commentUnderlay-own');
    }
    commentLayers.underlays.push(this.underlay);

    this.overlay = this.elementPrototypes.overlay.cloneNode(true);
    this.overlayInnerWrapper = this.overlay.firstChild;
    // Hide the overlay on right click. It can block clicking the author page link.
    this.overlayInnerWrapper.oncontextmenu = (e) => {
      e.preventDefault();
      this.overlay.style.display = 'none';
    };
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
        thanks = cleanUpThanks(getFromLocalStorage('convenientDiscussions-thanks') || {});
        saveToLocalStorage('convenientDiscussions-thanks', thanks);
      }

      const isThanked = Object.keys(thanks).some((key) => (
        this.anchor === thanks[key].anchor &&
        calculateWordsOverlap(this.getText(), thanks[key].text) > 0.66
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

    if (this.actionable) {
      if (this.isOwn || cd.settings.allowEditOthersComments) {
        /**
         * Edit button.
         *
         * @type {Element|undefined}
         */
        this.editButton = this.elementPrototypes.editButton.cloneNode(true);
        this.editButton.firstChild.onclick = () => {
          this.edit();
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
          this.reply();
        }
      };
      this.overlayContent.appendChild(this.replyButton);
    }

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
   * Add the underlay and overlay if they are missing, recalculate their positions and redraw if
   * they have been moved, or do nothing if everything is right.
   *
   * @param {object} [options={}]
   * @param {boolean} [options.doAdd=true] Add the layers in case they are created. If set to
   *   false, it is expected that the layers created during this procedure, if any, will be added
   *   afterwards (otherwise there would be layers without a parent element which would lead to
   *   bugs).
   * @param {boolean} [options.doUpdate=true] Update the layers' positions in case the comment is
   *   moved. If set to false, it is expected that the positions will be updated afterwards.
   * @param {object} [options.floatingRects] `Element#getBoundingClientRect` results. It may be
   *   calculated in advance for many elements in one sequence to save time.
   * @returns {?boolean} Was the comment moved.
   */
  configureLayers(options = {}) {
    if (this.editForm) {
      return null;
    }

    if (options.doAdd === undefined) {
      options.doAdd = true;
    }
    if (options.doUpdate === undefined) {
      options.doUpdate = true;
    }

    options.rectTop = this.highlightables[0].getBoundingClientRect();
    options.rectBottom = this.elements.length === 1 ?
      options.rectTop :
      this.highlightables[this.highlightables.length - 1].getBoundingClientRect();
    options.layersContainerOffset = this.getLayersContainerOffset();

    const moved = (
      this.underlay &&
      (
        (
          window.pageYOffset + options.rectTop.top - options.layersContainerOffset.top !==
          this.layersTop
        ) ||
        options.rectBottom.bottom - options.rectTop.top !== this.layersHeight ||
        this.highlightables[0].offsetWidth !== this.firstHighlightableWidth
      )
    );

    if (!this.underlay || moved) {
      Object.assign(this, this.calculateLayersPositions(options));
    }

    // The comment is invisible.
    if (this.layersLeft === undefined) {
      return null;
    }

    // Configure the layers only if they were unexistent or the comment position has changed, to
    // save time.
    if (this.underlay) {
      if (this.newness && !this.underlay.classList.contains('cd-commentUnderlay-new')) {
        this.underlay.classList.add('cd-commentUnderlay-new');
      }
      if (moved && options.doUpdate) {
        this.updateLayersPositions();
      }
      return moved;
    } else {
      this.createLayers();
      if (options.doAdd) {
        this.addLayers();
      }
      return false;
    }
  }

  /**
   * Add the comment's layers to the DOM.
   */
  addLayers() {
    if (this.underlay) {
      this.updateLayersPositions();
      this.getLayersContainer().appendChild(this.underlay);
      this.getLayersContainer().appendChild(this.overlay);
    }
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
   * Highlight the comment when it is focused.
   */
  highlightFocused() {
    if (cd.util.isPageOverlayOn() || this.isFocused) return;

    const isMoved = this.configureLayers();

    // Add classes if the comment wasn't moved. If it was moved, the layers are removed and created
    // again when the next event fires.
    if (!isMoved && this.underlay) {
      this.underlay.classList.add('cd-commentUnderlay-focused');
      this.overlay.classList.add('cd-commentOverlay-focused');
      this.isFocused = true;
    }
  }

  /**
   * Unhighlight the comment when it has lost focus.
   */
  unhighlightFocused() {
    if (!this.isFocused) return;

    this.underlay.classList.remove('cd-commentUnderlay-focused');
    this.overlay.classList.remove('cd-commentOverlay-focused');
    this.overlay.style.display = '';
    this.isFocused = false;
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

    this.isTarget = true;

    $elementsToAnimate
      .stop()
      .css('background-color', targetColor);
    clearTimeout(this.unhighlightTimeout);
    this.unhighlightTimeout = setTimeout(() => {
      // We may not know from the beginning if the comment is new.
      if (this.newness) {
        initialColor = cd.g.COMMENT_UNDERLAY_NEW_COLOR;
      }
      $elementsToAnimate.animate(
        { backgroundColor: initialColor },
        400,
        'swing',
        () => {
          this.isTarget = false;
          $elementsToAnimate
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
    $elements.cdScrollIntoView(this.isOpeningSection || this.editForm ? 'top' : 'center', smooth);
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
    this.overlayContent.insertBefore(replacement, button);
    button.parentNode.removeChild(button);
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

    parent.scrollToAndHighlightTarget('center');

    const goToChildButton = new OO.ui.ButtonWidget({
      label: cd.s('cm-gotochild'),
      title: cd.s('cm-gotochild-tooltip'),
      framed: false,
      classes: ['cd-button', 'cd-commentButton'],
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
     * @instance module:Comment
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

    this.childToScrollBackTo.scrollToAndHighlightTarget('center');
  }

  /**
   * Copy a link to the comment or open a copy link dialog.
   *
   * @param {Event} e
   */
  copyLink(e) {
    if (this.isLinkBeingCopied) return;
    const linkButton = this.linkButton;
    this.replaceButton(
      this.linkButton,
      this.elementPrototypes.pendingLinkButton.cloneNode(true),
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
   * @param {boolean} requestGender Request the gender of the edit's author (to save time).
   * @returns {?object}
   * @throws {CdError}
   */
  async findAddingEdit(singleTimestamp = false, requestGender = false) {
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
      titles: this.getSourcePage().getArchivedPage().name,
      rvslots: 'main',
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

    const [revisionsResp] = await Promise.all([
      revisionsRequest,
      requestGender && this.author.isRegistered() ? getUserGenders([this.author]) : undefined,
    ].filter(defined));

    const revisions = revisionsResp?.query?.pages?.[0]?.revisions;
    if (!revisions) {
      throw new CdError({
        type: 'api',
        code: 'noData',
      });
    }

    const compareRequests = revisions.map((revision) => cd.g.api.get({
      action: 'compare',
      fromtitle: this.getSourcePage().getArchivedPage().name,
      fromrev: revision.revid,
      torelative: 'prev',
      prop: 'diff|diffsize',
      formatversion: 2,
    }).catch(handleApiReject));

    const compareData = await Promise.all(compareRequests);
    const regexp = /<td colspan="2" class="diff-empty">&#160;<\/td>\s*<td class="diff-marker">\+<\/td>\s*<td class="diff-addedline"><div>(?!=)(.+?)<\/div><\/td>\s*<\/tr>/g;
    let thisTextAndSignature = this.getText(false) + ' ' + this.$signature.get(0).innerText;
    const matches = [];
    for (let i = 0; i < compareData.length; i++) {
      const data = compareData[i];
      const body = data?.compare?.body;
      if (!body) continue;

      // Compare diff _parts_ with added text in case multiple comments were added with the edit.
      let match;
      let originalText = '';
      let text = '';
      let bestDiffPartOverlap = 0;
      while ((match = regexp.exec(body))) {
        const diffPartText = removeWikiMarkup(decodeHtmlEntities(match[1]));
        const diffPartOverlap = calculateWordsOverlap(diffPartText, thisTextAndSignature);
        if (diffPartOverlap > bestDiffPartOverlap) {
          bestDiffPartOverlap = diffPartOverlap;
        }
        text += diffPartText + '\n';
        originalText += match[1] + '\n';
      }
      if (!originalText.trim()) continue;

      revisions[i].diffBody = body;
      const timestamp = new Date(revisions[i].timestamp).getTime();

      // Add 30 seconds to get better date proximity results since we don't see the seconds
      // number.
      const thisCommentTimestamp = this.date.getTime() + (30 * 1000);

      let overlap = Math.max(
        calculateWordsOverlap(text, thisTextAndSignature),
        bestDiffPartOverlap
      );
      const timezoneMatch = text.match(cd.g.TIMEZONE_REGEXP);

      if (overlap < 0.66 && originalText.includes('{{')) {
        try {
          const parsed = (await parseCode(originalText, { title: cd.g.CURRENT_PAGE.name })).html;
          originalText = $('<div>').append(parsed).cdGetText();
        } catch (e) {
          throw new CdError({
            type: 'parse',
          });
        }
        overlap = calculateWordsOverlap(originalText, thisTextAndSignature);
      }

      if (overlap > 0.66) {
        matches.push({
          revision: revisions[i],
          overlap,
          dateProximity: Math.abs(thisCommentTimestamp - timestamp),
          minor: revisions[i].minor,
          moreThanOneTimestamp: text.includes('\n') && timezoneMatch && timezoneMatch.length > 1,
        });
      }
    }

    let bestMatch;
    matches.forEach((match) => {
      if (!bestMatch || match.overlap > bestMatch.overlap) {
        bestMatch = match;
      }
      if (bestMatch && match.overlap === bestMatch.overlap) {
        if (match.dateProximity > bestMatch.dateProximity) {
          bestMatch = match;
        } else if (match.dateProximity === bestMatch.dateProximity) {
          if (!match.minor && bestMatch.minor) {
            bestMatch = match;
          }
        }
      }
    });

    if (singleTimestamp && bestMatch?.moreThanOneTimestamp) {
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
    const urlEnding = decodeURI(cd.g.CURRENT_PAGE.getArchivedPage().getUrl({ diff: edit.revid }));
    return `https:${mw.config.get('wgServer')}${urlEnding}`;
  }

  /**
   * Process thank error.
   *
   * @param {CdError|Error} e
   * @param {Element} thankButton
   * @private
   */
  thankFail(e, thankButton) {
    const { type, code, data } = e.data;
    let text;
    switch (type) {
      case 'parse': {
        if (code === 'moreThanOneTimestamp') {
          const url = this.getSourcePage().getArchivedPage().getUrl({ diff: data.edit.revid });
          text = cd.util.wrap(cd.sParse('thank-error-multipletimestamps', url), {
            targetBlank: true,
          });
          OO.ui.alert(text);
          return;
        } else {
          const url = this.getSourcePage().getArchivedPage().getUrl({ action: 'history' });
          text = (
            cd.sParse('error-diffnotfound') +
            ' ' +
            cd.sParse('error-diffnotfound-history', url)
          );
        }
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
    const thankButton = this.thankButton;
    this.replaceButton(
      this.thankButton,
      this.elementPrototypes.pendingThankButton.cloneNode(true),
      'thank'
    );

    if (dealWithLoadingBug('mediawiki.diff.styles')) return;

    let edit;
    try {
      ([edit] = await Promise.all([
        this.findAddingEdit(true, cd.g.GENDER_AFFECTS_USER_STRING),
        mw.loader.using('mediawiki.diff.styles')
      ]));
    } catch (e) {
      this.thankFail(e, thankButton);
      return;
    }

    const url = this.getSourcePage().getArchivedPage().getUrl({ diff: edit.revid });
    const $question = cd.util.wrap(cd.sParse('thank-confirm', this.author.name, this.author, url), {
      tagName: 'div',
      targetBlank: true,
    });
    const $text = $('<div>').append($question, cd.util.wrapDiffBody(edit.diffBody));
    if (await OO.ui.confirm($text, { size: 'larger' })) {
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
      this.replaceButton(
        this.thankButton,
        this.elementPrototypes.thankedButton.cloneNode(true),
        'thank'
      );

      thanks[edit.revid] = {
        anchor: this.anchor,
        text: this.getText(),
      };
      saveToLocalStorage('convenientDiscussions-thanks', thanks);
    } else {
      this.replaceButton(this.thankButton, thankButton, 'thank');
    }
  }

  /**
   * Locate the comment in the page source code and, if no `pageCode` is passed, set the results to
   * the `inCode` property. Otherwise, return the result.
   *
   * @param {string} [pageCode] Page code, if different from `code` property of {@link
   *   Comment#getSourcePage()}.
   * @returns {string|undefined}
   * @throws {CdError}
   */
  locateInCode(pageCode) {
    if (!pageCode) {
      this.inCode = null;
    }

    // Collect matches
    const matches = this.searchInCode(pageCode || this.getSourcePage().code);

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
          (this.id === 0 && match.hasPreviousCommentsDataMatched && match.hasHeadlineMatched)
        ) &&
        (
          !bestMatch ||
          match.overlap > bestMatch.overlap ||
          (!bestMatch.hasHeadlineMatched && match.hasHeadlineMatched) ||
          (
            // null can be compared to false.
            Boolean(bestMatch.hasHeadlineMatched) === Boolean(match.hasHeadlineMatched) &&

            !bestMatch.hasPreviousCommentDataMatched &&
            match.hasPreviousCommentDataMatched
          )
        )
      ) {
        bestMatch = match;
      }
    });

    // The reserve method: by this & previous two dates & authors. If all dates and authors are the
    // same, that shouldn't count (see [[Википедия:К удалению/22 сентября
    // 2020#202009221158_Facenapalm_17]]).
    if (!bestMatch) {
      bestMatch = matches.find((match) => (
        this.id !== 0 &&
        match.hasPreviousCommentsDataMatched &&
        !match.isPreviousCommentsDataEqual
      ));
    }

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
      const entireLineRegexp = new RegExp(
        `^(?:\\x01.+?\\x02|\\[\\[${cd.g.FILE_PREFIX_PATTERN}.+\\]\\]) *$`,
        'i'
      );
      const thisLineEndingRegexp = new RegExp(
        `(?:<${cd.g.PNIE_PATTERN}(?: [\\w ]+?=[^<>]+?| ?\\/?)>|<\\/${cd.g.PNIE_PATTERN}>|\\x04) *$`,
        'i'
      );
      const nextLineBeginningRegexp = new RegExp(
        `^(?:<\\/${cd.g.PNIE_PATTERN}>|<${cd.g.PNIE_PATTERN}|\\|)`,
        'i'
      );
      const headingRegexp = /^(=+).*\1[ \t]*$/;
      text = text.replace(
        /^((?![:*# ]).+)\n(?![\n:*# \x03])(?=(.*))/gm,
        (s, thisLine, nextLine) => {
          const newlineOrSpace = (
            entireLineRegexp.test(thisLine) ||
            entireLineRegexp.test(nextLine) ||
            headingRegexp.test(thisLine) ||
            headingRegexp.test(nextLine) ||
            thisLineEndingRegexp.test(thisLine) ||
            nextLineBeginningRegexp.test(nextLine)
          ) ?
            '\n' :
            ' ';
          return thisLine + newlineOrSpace;
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

    if (registerAllInDirection && navPanel.getUnseenCount() !== 0) {
      const nextComment = cd.comments[this.id + (registerAllInDirection === 'forward' ? 1 : -1)];
      if (nextComment?.isInViewport(true)) {
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
    if (!this.underlay) return;

    commentLayers.underlays.splice(commentLayers.underlays.indexOf(this.underlay), 1);

    this.underlay.parentElement.removeChild(this.underlay);
    this.underlay = null;
    this.$underlay = null;

    this.overlay.parentElement.removeChild(this.overlay);
    this.overlay = null;
    this.$overlay = null;
  }

  /**
   * Comment elements as a jQuery object.
   *
   * Uses a getter because elements of a comment can be altered after creating an instance, for
   * example with `mergeAdjacentCommentLevels()` in {@link module:modifyDom}. Using a getter also
   * allows to save a little time on running `$()`, although that alone is perhaps not enough to
   * create it.
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
   * Get the parent comment of the comment.
   *
   * @returns {?Comment}
   */
  getParent() {
    if (this.cachedParent === undefined && this.id === 0) {
      this.cachedParent = null;
    }

    // Look for {{outdent}} templates
    if (this.cachedParent === undefined && cd.g.specialElements.pageHasOutdents) {
      const treeWalker = new ElementsTreeWalker(this.elements[0]);
      while (
        treeWalker.previousNode() &&
        !treeWalker.currentNode.classList.contains('cd-commentPart')
      ) {
        if (treeWalker.currentNode.classList.contains('outdent-template')) {
          this.cachedParent = cd.comments[this.id - 1];
          break;
        }
      }
    }

    if (this.cachedParent === undefined && this.level === 0) {
      this.cachedParent = null;
    }

    if (this.cachedParent === undefined) {
      this.cachedParent = (
        cd.comments
          .slice(0, this.id)
          .reverse()
          .find((comment) => (
            comment.getSection() === this.getSection() &&
            comment.level < this.level
          )) ||
        null
      );
    }

    return this.cachedParent;
  }

  /**
   * Get the comment's text without a signature.
   *
   * @param {boolean} [cleanUp=true]
   * @returns {string}
   * @private
   */
  getText(cleanUp = true) {
    if (this.cachedText === undefined) {
      const $clone = this.$elements
        .not('h1, h2, h3, h4, h5, h6')
        .clone()
        .removeClass('cd-hidden');
      const $dummy = $('<div>').append($clone);
      const selector = ['.cd-signature']
        .concat(cd.config.unsignedClass ? [`.${cd.config.unsignedClass}`] : [])
        .join(', ');
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
    }

    // Exclude the text of the previous comment that is ended with 3 tildes instead of 4.
    if (cd.config.signatureEndingRegexp) {
      const regexp = new RegExp(cd.config.signatureEndingRegexp.source, 'm');
      const linesRegexp = /^(.+)\n/gm;
      let line;
      let indent;
      while ((line = linesRegexp.exec(code))) {
        if (regexp.test(removeWikiMarkup(line[1]))) {
          const testIndent = line.index + line[0].length;
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
    }

    // Exclude the indentation characters and any foreign code before them from the comment code.
    // Comments at the zero level sometimes start with ":" that is used to indent some side note. It
    // shouldn't be considered an indentation character.
    if (this.level > 0) {
      const replaceIndentationChars = (s, before, chars) => {
        indentationChars = chars;
        lineStartIndex += before.length;
        startIndex += s.length;
        return '';
      };

      code = code.replace(
        new RegExp(`^()${cd.config.indentationCharsPattern}`),
        replaceIndentationChars
      );

      // See the comment "Without the following code, the section introduction..." in Parser.js.
      // Dangerous case: https://ru.wikipedia.org/w/index.php?oldid=105936825&action=edit&section=1.
      // This was actually a mistake to put a signature at the first level, but if it was legit,
      // only the last sentence should be interpreted as the comment.
      if (indentationChars === '') {
        code = code.replace(
          new RegExp(`(^[^]*?(?:^|\n))${cd.config.indentationCharsPattern}(?![^]*\\n[^:*#])`),
          replaceIndentationChars
        );
      }
    }

    cd.g.BAD_COMMENT_BEGINNINGS.forEach((pattern) => {
      if (pattern.source[0] !== '^') {
        console.debug('Regexps in cd.config.customBadCommentBeginnings should have "^" as the first character.');
      }
      const match = code.match(pattern);
      if (match) {
        startIndex += match[0].length;
        code = code.slice(match[0].length);
      }
    });

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

    if (this.isOwn && cd.g.CURRENT_USER_SIGNATURE_PREFIX_REGEXP) {
      data.code = data.code.replace(cd.g.CURRENT_USER_SIGNATURE_PREFIX_REGEXP, movePartToSignature);
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
      /<small class="autosigned">.*$/,
      /<!-- *Template:Unsigned.*$/,
      cd.config.signaturePrefixRegexp,
    ]);

    // Exclude <small></small> and template wrappers from the strings
    const smallWrappers = [{
      start: /^<small>/,
      end: /<\/small>[ \u00A0\t]*$/,
    }];
    if (cd.config.smallDivTemplate) {
      smallWrappers.push({
        start: new RegExp(`^(?:\\{\\{${cd.config.smallDivTemplate}\\|1=)`),
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
    // .startsWith() to account for cases where you can ignore the timezone string in the "unsigned"
    // templates (it may be present and may be not), but it appears on the page.
    const signatureMatches = signatures.filter((sig) => (
      (sig.author === this.author || sig.author === '<undated>') &&
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

    // Signature object to a comment match object
    const matches = signatureMatches.map((match) => ({
      id: match.id,
      author: match.author,
      timestamp: match.timestamp,
      date: match.date,
      anchor: match.anchor,
      signatureDirtyCode: match.dirtyCode,
      startIndex: match.commentStartIndex,
      endIndex: match.startIndex,
    }));

    // Collect data for every match
    matches.forEach((match) => {
      match.code = pageCode.slice(match.startIndex, match.endIndex);

      if (previousComments.length) {
        for (let i = 0; i < previousComments.length; i++) {
          const signature = signatures[match.id - 1 - i];
          // At least one coincided comment is enough if the second is unavailable.
          match.hasPreviousCommentsDataMatched = (
            signature &&
            signature.timestamp === previousComments[i].timestamp &&
            signature.author === previousComments[i].author
          );
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

      Object.assign(match, this.adjustCommentBeginning(match));
      match.hasHeadlineMatched = this.followsHeading ?
        (
          match.headingMatch &&
          this.getSection() &&
          this.getSection().headline &&
          (
            normalizeCode(removeWikiMarkup(match.headlineCode)) ===
            normalizeCode(this.getSection().headline)
          )
        ) :
        !match.headingMatch;

      const codeToCompare = removeWikiMarkup(match.code);
      match.overlap = calculateWordsOverlap(this.getText(), codeToCompare);
    });

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
        let closedDiscussionMatch;
        while ((closedDiscussionMatch = cd.g.CLOSED_DISCUSSION_SINGLE_REGEXP.exec(adjustedCode))) {
          adjustedCode = (
            adjustedCode.slice(0, closedDiscussionMatch.index) +
            hideTemplatesRecursively(
              adjustedCode.slice(closedDiscussionMatch.index),
              null,
              closedDiscussionMatch[1].length
            ).code
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

      const searchedIndentationCharsLength = thisInCode.replyIndentationChars.length - 1;
      const properPlaceRegexp = new RegExp(
        '^([^]*?(?:' +
        mw.util.escapeRegExp(thisInCode.signatureCode) +
        '|' +
        cd.g.TIMESTAMP_REGEXP.source +
        '.*' +
        (cd.g.UNSIGNED_TEMPLATES_PATTERN ? `|${cd.g.UNSIGNED_TEMPLATES_PATTERN}.*` : '') +

        // "\x01" and "\x02" is from hiding closed discussions and HTML comments.
        '|\\x02)\\n)\\n*' +
        (
          searchedIndentationCharsLength > 0 ?
          `[:*#\\x01]{0,${searchedIndentationCharsLength}}` :
          ''
        ) +

        // "\n" is here to avoid putting the reply on a casual empty line. "\x01" is from hiding
        // closed discussions.
        '(?![:*#\\n\\x01])'
      );
      let [, adjustedCodeInBetween] = adjustedChunkCodeAfter.match(properPlaceRegexp) || [];

      if (adjustedCodeInBetween === undefined) {
        throw new CdError({
          type: 'parse',
          code: 'findPlace',
        });
      }

      // If the comment is to be put after a comment with different indentation characters, use
      // these.
      const [, changedIndentationChars] = adjustedCodeInBetween.match(/\n([:*#]{2,}).*\n$/) || [];
      if (changedIndentationChars) {
        // Note a bug https://ru.wikipedia.org/w/index.php?diff=next&oldid=105529545 that was
        // possible here when we used "slice(0, thisInCode.indentationChars.length + 1)".
        thisInCode.replyIndentationChars = changedIndentationChars
          .slice(0, thisInCode.replyIndentationChars.length)
          .replace(/:$/, cd.config.defaultIndentationChar);
      }

      currentIndex += adjustedCodeInBetween.length;
    }

    if (!commentCode && commentForm && !doDelete) {
      ({ commentCode } = commentForm.commentTextToCode('submit'));
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
            this.getSection().locateInCode();
            if (extractSignatures(this.getSection().inCode.code).length > 1) {
              throw new CdError({
                type: 'parse',
                code: 'delete-repliesInSection',
              });
            } else {
              // Deleting the whole section is safer as we don't want to leave any content in the
              // end anyway.
              ({ startIndex, contentEndIndex: endIndex } = this.getSection().inCode);
            }
          } else {
            endIndex = thisInCode.endIndex + thisInCode.signatureDirtyCode.length + 1;
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
          const startIndex = (
            this.isOpeningSection && thisInCode.headingStartIndex !== undefined ?
            thisInCode.headingStartIndex :
            thisInCode.lineStartIndex
          );
          codeBeforeInsertion = pageCode.slice(0, startIndex);
          const codeAfterInsertion = (
            pageCode.slice(thisInCode.endIndex + thisInCode.signatureDirtyCode.length)
          );
          newPageCode = codeBeforeInsertion + commentCode + codeAfterInsertion;
        }
        break;
      }
    }

    return { newPageCode, codeBeforeInsertion, commentCode };
  }

  /**
   * Get and sometimes create the container for the comment's underlay.
   *
   * @returns {Element}
   */
  getLayersContainer() {
    if (this.cachedLayersContainer === undefined) {
      let offsetParent;
      const treeWalker = new TreeWalker(document.body, null, true, this.elements[0]);
      while (treeWalker.parentNode()) {
        let style = treeWalker.currentNode.cdStyle;
        if (!style) {
          // window.getComputedStyle is expensive, so we save the result to a node's property.
          style = window.getComputedStyle(treeWalker.currentNode);
          treeWalker.currentNode.cdStyle = style;
        }
        if (['absolute', 'relative'].includes(style.position)) {
          offsetParent = treeWalker.currentNode;
          break;
        }
        const backgroundColor = style.backgroundColor;
        if (backgroundColor.includes('rgb(')) {
          /**
           * Comment's background color if not default.
           *
           * @type {string|undefined}
           */
          this.backgroundColor = backgroundColor;

          offsetParent = treeWalker.currentNode;
          offsetParent.classList.add('cd-commentLayersContainerParent-relative');
          break;
        }
      }
      if (!offsetParent) {
        offsetParent = document.body;
      }
      offsetParent.classList.add('cd-commentLayersContainerParent');
      let container = offsetParent.firstElementChild;
      if (!container.classList.contains('cd-commentLayersContainer')) {
        container = document.createElement('div');
        container.classList.add('cd-commentLayersContainer');
        offsetParent.insertBefore(container, offsetParent.firstChild);
      }
      this.cachedLayersContainer = container;
      if (!commentLayers.layersContainers.includes(container)) {
        commentLayers.layersContainers.push(container);
      }
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
      let el = container;
      let offsetParent;
      top = 0;
      left = 0;
      while ((offsetParent = el.offsetParent)) {
        top += offsetParent.offsetTop;
        left += offsetParent.offsetLeft;
        el = offsetParent;
      }
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
    return this.getSection() ? this.getSection().getSourcePage() : cd.g.CURRENT_PAGE;
  }

  /**
   * Configure and add underlayers for a group of comments.
   *
   * @param {Comment[]} comments
   */
  static configureAndAddLayers(comments) {
    const floatingRects = comments.length ?
      cd.g.specialElements.floating.map(getTopAndBottomIncludingMargins) :
      undefined;

    comments.forEach((comment) => {
      comment.configureLayers({
        doAdd: false,
        doUpdate: false,
        floatingRects,
      });
    });

    // Faster to add them in one sequence.
    comments.forEach((comment) => {
      comment.addLayers();
    });
  }

  /**
   * Find any one comment inside the viewport.
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
      return Boolean(comment.positions);
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
          (viewportTop - higherTop) /
          ((lowerBottom - viewportBottom) + (viewportTop - higherTop))
        );
        if (proportion < 0 || proportion >= 1) {
          console.warn(
            'The proportion shouldn\'t be more than 0 or less or equal to 1.',
            'proportion', proportion,
            'searchArea', searchArea
          );
        }
        currentComment = cd.comments[Math.round(
          (searchArea.bottom.id - searchArea.top.id - 1) * proportion +
          searchArea.top.id +
          0.5
        )];
      }
    }

    return foundComment || null;
  }

  /**
   * Get a comment by anchor.
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
