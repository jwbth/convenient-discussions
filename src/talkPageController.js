import Autocomplete from './Autocomplete';
import CommentForm from './CommentForm';
import ElementsTreeWalker from './ElementsTreeWalker';
import Parser from './Parser';
import Thread from './Thread';
import bootController from './bootController';
import cd from './cd';
import commentFormRegistry from './commentFormRegistry';
import commentRegistry from './commentRegistry';
import debug from './debug';
import navPanel from './navPanel';
import notifications from './notifications';
import pageRegistry from './pageRegistry';
import sectionRegistry from './sectionRegistry';
import settings from './settings';
import toc from './toc';
import updateChecker from './updateChecker';
import { getUserInfo } from './utils-api';
import { defined, definedAndNotNull, getLastArrayElementOrSelf, isHeadingNode, isInline, sleep } from './utils-general';
import { EventEmitter } from './utils-oojs';
import { copyText, getVisibilityByRects, wrapHtml } from './utils-window';

/**
 * @typedef {object} EventMap
 * @property {[]} boot
 * @property {[event: MouseEvent]} mouseMove
 * @property {[]} resize
 * @property {[event: KeyboardEvent]} keyDown
 * @property {[]} scroll
 * @property {[]} horizontalScroll
 * @property {[fragment: string]} popState
 * @property {[]} selectionChange
 * @property {[]} mutate
 * @property {[passedData: import('./BootProcess').PassedData]} beforeReboot
 * @property {[]} startReboot
 * @property {[]} reboot
 * @property {[]} desktopNotificationClick
 */

/**
 * Singleton that stores and changes the overall state of the page, initiating boot processes and
 * reacting to events.
 *
 * @augments EventEmitter<EventMap>
 */
class TalkPageController extends EventEmitter {
  /**
   * @type {JQuery}
   * @private
   */
  $popupOverlay;

  /**
   * @type {MutationObserver|undefined}
   * @private
   */
  mutationObserver;

  /**
   * @type {JQuery|undefined}
   * @private
   */
  $addTopicButtons;

  /**
   * @type {JQuery<HTMLLIElement>|undefined}
   * @private
   */
  $emulatedAddTopicButton;

  /**
   * @type {import('./Subscriptions').default}
   */
  subscriptionsInstance;

  /**
   * @type {mw.DiscussionToolsHeading[]|undefined}
   * @private
   */
  dtSubscribableThreads;

  /**
   * @type {HTMLElement}
   * @private
   */
  notificationArea;

  /**
   * @type {HTMLElement}
   * @private
   */
  tocButton;

  /**
   * @type {HTMLElement}
   * @private
   */
  stickyHeader;

  /**
   * @type {HTMLElement}
   * @private
   */
  tocContent;

  /**
   * @type {{
   *   closedDiscussions?: HTMLElement[];
   *   areThereOutdents?: boolean;
   *   floatingElements?: HTMLElement[];
   *   tsSelectorsFloating?: string[];
   *   tsSelectorsHidden?: string[];
   *   areThereLtrRtlMixes?: boolean;
   *   longPage?: boolean;
   * }}
   * @private
   */
  content = {};

  /**
   * @type {() => void}
   * @private
   */
  throttledHandleScroll;

  /**
   * @type {() => void}
   * @private
   */
  throttledHandleSelectionChange;

  /**
   * @type {{
   *   offset: ?number;
   *   element?: ?Element;
   *   elementTop?: ?number;
   *   touchesBottom?: boolean;
   *   offsetBottom?: ?number;
   *   tocHeight?: ?number;
   * }}
   */
  scrollData = { offset: null };

  autoScrolling = false;
  isUpdateThreadLinesHandlerAttached = false;
  lastScrollX = 0;
  originalPageTitle = document.title;

  /** @type {?number} */
  lastCheckedRevisionId = null;

  addedCommentCount = 0;
  areRelevantCommentsAdded = false;

  /** @type {?(string[])} */
  relevantAddedCommentIds = null;

  /** @type {import('./updateChecker').CommentWorkerMatched[]} */
  commentsNotifiedAbout = [];

  isObstructingElementHoveredCached = false;

  /**
   * Get the popup overlay used for OOUI components.
   *
   * @returns {JQuery}
   */
  getPopupOverlay() {
    this.$popupOverlay ??= $('<div>')
      .addClass('cd-popupOverlay')
      .appendTo(document.body);

    return this.$popupOverlay;
  }

  /**
   * Save the scroll position relative to the first element in the viewport looking from the top of
   * the page.
   *
   * @param {?boolean} [switchToAbsolute=null] If this value is `true` or `false` and the viewport
   *   is above the bottom of the table of contents, then use
   *   {@link TalkPageController#saveScrollPosition} (this allows for better precision).
   * @param {number} scrollY Cached horizontal scroll value used to avoid reflow.
   */
  saveRelativeScrollPosition(switchToAbsolute = null, scrollY = window.scrollY) {
    // The viewport has the TOC bottom or is above it.
    if (
      switchToAbsolute !== null &&
      !toc.isInSidebar() &&
      toc.isPresent() &&
      scrollY < toc.getBottomOffset()
    ) {
      this.saveScrollPosition(switchToAbsolute);
    } else {
      this.scrollData.element = null;
      this.scrollData.elementTop = null;
      this.scrollData.touchesBottom = false;
      this.scrollData.offsetBottom = (
        document.documentElement.scrollHeight - (scrollY + window.innerHeight)
      );

      // The number 100 accounts for various content moves by scripts running on the page (like
      // HotCat that may add an empty category list).
      if (this.scrollData.offsetBottom < 100) {
        this.scrollData.touchesBottom = true;
      } else if (
        scrollY !== 0 &&
        bootController.rootElement.getBoundingClientRect().top <= cd.g.bodyScrollPaddingTop
      ) {
        const treeWalker = new ElementsTreeWalker(
          bootController.rootElement,
          bootController.rootElement.firstElementChild || undefined,
        );
        while (true) {
          const el = treeWalker.currentNode;

          if (!isInline(el) && !this.getFloatingElements().includes(el)) {
            const rect = el.getBoundingClientRect();

            // By default, in a conversation between two people, replies are nested and there is no
            // way to isolate the parent comment from the child, which would be desirable to find a
            // good reference element. To work around this, we resort to this line, which stops the
            // search at the first element fully below the viewport top (if there is a reference
            // element already). Its shortcoming is that if 1) the only element we met with its
            // bottom below the viewport top is too large to be used as a reference, 2) the first
            // element small enough has its top below the viewport (i.e., there is a gap between it
            // and the previous element that has the viewport top right in the middle) - we end up
            // without a convenient reference element. To compensate for this, we use an offset of
            // cd.g.contentFontSize (we're unlikely to see a bigger gap between elements).
            if (
              rect.top > cd.g.bodyScrollPaddingTop + cd.g.contentFontSize &&
              this.scrollData.element &&
              !isHeadingNode(el)
            ) {
              break;
            }

            if (rect.height !== 0 && rect.bottom >= cd.g.bodyScrollPaddingTop) {
              this.scrollData.element = el;
              this.scrollData.elementTop = rect.top;
              if (treeWalker.firstChild()) {
                continue;
              } else {
                break;
              }
            }
          }
          if (!treeWalker.nextSibling()) break;
        }
      }
    }
  }

  /**
   * Restore the scroll position saved in {@link TalkPageController#saveRelativeScrollPosition}.
   *
   * @param {boolean} [switchToAbsolute=false] Restore the absolute position using
   *   {@link TalkPageController#restoreScrollPosition} if
   *   {@link TalkPageController#saveScrollPosition} was previously used for saving the position.
   */
  restoreRelativeScrollPosition(switchToAbsolute = false) {
    if (switchToAbsolute && this.scrollData.offset !== null) {
      this.restoreScrollPosition();
    } else {
      if (this.scrollData.touchesBottom && window.scrollY !== 0) {
        window.scrollTo(
          0,
          document.documentElement.scrollHeight -
            window.innerHeight -
            /** @type {number} */ (this.scrollData.offsetBottom)
        );
      } else if (this.scrollData.element) {
        const rect = this.scrollData.element.getBoundingClientRect();
        if (getVisibilityByRects(rect)) {
          window.scrollTo(
            0,
            window.scrollY + rect.top - /** @type {number} */ (this.scrollData.elementTop)
          );
        } else {
          // In a collapsed thread?
          const closestHidden = /** @type {?HTMLElement} */ (
            this.scrollData.element.closest('.cd-hidden')
          );
          if (closestHidden) {
            /** @type {JQuery} */ (
              commentRegistry.getAll()
                .map((comment) => comment.thread)
                .filter(defined)
                .filter((thread) => thread.isCollapsed)
                .find((thread) =>
                  /** @type {HTMLElement[]} */ (thread.collapsedRange).includes(closestHidden)
                )
                ?.$expandNote
            ).cdScrollTo('top', false);
          }
        }
      }
    }
  }

  /**
   * _For internal use._ Replace the element used for restoring saved relative scroll position with
   * a new element if it coincides with the provided element.
   *
   * @param {Element} element
   * @param {Element} newElement
   */
  replaceScrollAnchorElement(element, newElement) {
    if (this.scrollData.element && element === this.scrollData.element) {
      this.scrollData.element = newElement;
    }
  }

  /**
   * Save the scroll position to restore it later with
   * {@link TalkPageController#restoreScrollPosition}.
   *
   * @param {boolean} [saveTocHeight=true] `false` is used for more fine control of scroll behavior
   *   when visits are loaded after a page reboot.
   */
  saveScrollPosition(saveTocHeight = true) {
    this.scrollData.offset = window.scrollY;
    this.scrollData.tocHeight = (
      (saveTocHeight || this.scrollData.tocHeight) &&
      !toc.isInSidebar() &&
      toc.isPresent() &&
      !toc.isFloating() &&
      window.scrollY !== 0 &&

      // There is some content below the TOC in the viewport.
      toc.getBottomOffset() < window.scrollY + window.innerHeight
    ) ?
      toc.$element.outerHeight() :
      null;
  }

  /**
   * Restore the scroll position saved in {@link TalkPageController#saveScrollPosition}.
   *
   * @param {boolean} [resetTocHeight=true] `false` is used for more fine control of scroll behavior
   *   after page reboots.
   */
  restoreScrollPosition(resetTocHeight = true) {
    if (this.scrollData.offset === null) return;

    if (this.scrollData.tocHeight) {
      this.scrollData.offset += (toc.$element.outerHeight() || 0) - this.scrollData.tocHeight;
    }
    window.scrollTo(0, this.scrollData.offset);

    this.scrollData.offset = null;
    if (resetTocHeight) {
      this.scrollData.tocHeight = null;
    }
  }

  /**
   * Find closed discussions on the page.
   *
   * @returns {HTMLElement[]}
   */
  getClosedDiscussions() {
    this.content.closedDiscussions ||= bootController.$root
      .find(
        cd.config.closedDiscussionClasses
          .concat('mw-archivedtalk')
          .map((name) => `.${name}`)
          .join(', ')
      )
      .get();

    return this.content.closedDiscussions;
  }

  /**
   * Check whether there is at least one outdent template on the page. (If there is no, we don't
   * need to run many expensive operations.)
   *
   * @returns {boolean}
   */
  areThereOutdents() {
    this.content.areThereOutdents ??= Boolean(
      bootController.$root.find('.' + cd.config.outdentClass).length
    );

    return this.content.areThereOutdents;
  }

  /**
   * Find floating elements on the page.
   *
   * @returns {Element[]}
   */
  getFloatingElements() {
    if (!this.content.floatingElements) {
      // Describe all floating elements on the page in order to calculate the correct border
      // (temporarily setting `overflow: hidden`) for all comments they intersect with.
      const floatingElementSelector = [
        '.cd-floating',
        '.tleft',
        '.floatright',
        '.floatleft',
        '.mw-halign-right',
        '.mw-halign-left',
        '*[style*="float:right"]',
        '*[style*="float: right"]',
        '*[style*="float:left"]',
        '*[style*="float: left"]',
        'figure[typeof~="mw:File/Thumb"]',
        'figure[typeof~="mw:File/Frame"]',
        ...this.getTsFloatingElementSelectors(),
      ].join(', ');

      // Can't use jQuery here anyway, as .find() doesn't take into account ancestor elements, such
      // as .mw-parser-output, in selectors. Remove all known elements that never intersect comments
      // from the collection.
      this.content.floatingElements = /** @type {HTMLElement[]} */ (
        [...bootController.rootElement.querySelectorAll(floatingElementSelector)].filter(
          (el) => !el.classList.contains('cd-ignoreFloating')
        )
      );
    }

    return this.content.floatingElements;
  }

  /**
   * Find floating and hidden (`display: none`) elements on the page.
   *
   * @returns {Element[]}
   */
  getHiddenElements() {
    if (!this.hiddenElements) {
      const hiddenElementSelector = this.getTsHiddenElementSelectors().join(', ');
      this.hiddenElements = hiddenElementSelector ?
        [...bootController.rootElement.querySelectorAll(hiddenElementSelector)] :
        [];
    }

    return this.hiddenElements;
  }

  /**
   * Get the selectors for floating elements mentioned in the TemplateStyles tags on the page.
   *
   * @returns {string[]}
   * @private
   */
  getTsFloatingElementSelectors() {
    if (!this.content.tsSelectorsFloating) {
      this.extractTemplateStylesSelectors();
    }

    return /** @type {string[]} */ (this.content.tsSelectorsFloating);
  }

  /**
   * Get the selectors for hidden elements mentioned in the TemplateStyles tags on the page.
   *
   * @returns {string[]}
   * @private
   */
  getTsHiddenElementSelectors() {
    if (!this.content.tsSelectorsHidden) {
      this.extractTemplateStylesSelectors();
    }

    return /** @type {string[]} */ (this.content.tsSelectorsHidden);
  }

  /**
   * Extract and memorize the classes mentioned in the TemplateStyles tags on the page.
   *
   * @private
   */
  extractTemplateStylesSelectors() {
    const floating = [];
    const hidden = [];
    const extractSelectors = (rule) => {
      if (rule instanceof CSSStyleRule) {
        const style = rule.style;
        if (style.float === 'left' || style.float === 'right') {
          floating.push(rule.selectorText);
        }
        if (style.display === 'none') {
          hidden.push(rule.selectorText);
        }
      } else if (rule instanceof CSSMediaRule) {
        [...rule.cssRules].forEach(extractSelectors);
      }
    };
    [...document.styleSheets]
      .filter((sheet) => sheet.href?.includes('site.styles'))
      .forEach((el) => {
        try {
          [...el.cssRules].forEach(extractSelectors);
        } catch {
          // CSS rules on other domains can be inaccessible
        }
      });
    [...bootController.rootElement.querySelectorAll('style')].forEach((el) => {
      [...(el.sheet?.cssRules || [])].forEach(extractSelectors);
    });

    this.content.tsSelectorsFloating = floating;
    this.content.tsSelectorsHidden = hidden;
  }

  /**
   * Check whether there is "LTR inside RTL" or "RTL inside LTR" nesting on the page.
   *
   * @returns {boolean}
   */
  areThereLtrRtlMixes() {
    this.content.areThereLtrRtlMixes ??= Boolean(
      document.querySelector('.mw-content-ltr .mw-content-rtl, .mw-content-rtl .mw-content-ltr')
    );

    return this.content.areThereLtrRtlMixes;
  }

  /**
   * _For internal use._ Handle a mouse move event (including `mousemove` and `mouseover`).
   *
   * @param {MouseEvent} event
   */
  handleMouseMove(event) {
    if (this.mouseMoveBlocked || this.isAutoScrolling() || bootController.isPageOverlayOn()) return;

    // Don't throttle. Without throttling, performance is generally OK, while the "frame rate" is
    // about 50 (so, the reaction time is about 20ms). Lower values would be less comfortable.
    this.emit('mouseMove', event);
  }

  /**
   * _For internal use._ Are there elements obstructing the content area, like popups or windows.
   *
   * @returns {boolean}
   */
  isObstructingElementHovered() {
    if (this.notificationArea === undefined) {
      this.notificationArea = $('.mw-notification-area')[0];
      this.tocButton = $('#vector-page-titlebar-toc')[0];
      this.stickyHeader = $('#vector-sticky-header')[0];
      this.tocContent = $('.vector-dropdown-content')[0];
    }

    OO.ui.throttle(() => {
      // We just list everything we know that can stand between the user and the content area where
      // comments reside. This is a very ugly method I resorted to because I honestly don't know the
      // alternatives. We can't put any element out there to check :hover on it because the
      // absence of such an element for comments is the reason why we need to check for obstructing
      // elements in the first place. On the other hand, if this incorrectly returns `false`, this
      // doesn't really affect anything important. It's just for better visual effects. Use vanilla
      // JS where possible.
      this.isObstructingElementHoveredCached = Boolean(
        [
          ...(this.notificationArea?.querySelectorAll('.mw-notification') || []),
          Autocomplete.getActiveMenu(),
          navPanel.$element?.[0],
          ...document.body.querySelectorAll('.oo-ui-popupWidget:not(.oo-ui-element-hidden)'),
          $(document.body).children('dialog')[0],
          this.stickyHeader,
          sectionRegistry.getAll()
            .map((section) => section.actions.moreMenuSelect?.getMenu())
            .find((menu) => menu?.isVisible())
            ?.$element[0],
          this.tocButton,
          this.tocContent,
        ]
          .filter(definedAndNotNull)
          .some((el) => el.matches(':hover')) ||

        // WikiEditor dialog
        $(document.body).children('.ui-dialog').not('[style*="display: none"]').length
      );
    }, 100)();

    return this.isObstructingElementHoveredCached;
  }

  /**
   * Handles the window `resize` event as well as `orientationchange`.
   *
   * @private
   */
  async handleWindowResize() {
    // sleep(), because it seems like sometimes it doesn't have time to update.
    await sleep(cd.g.skin === 'vector-2022' ? 100 : 0);

    bootController.getContentColumnOffsets(true);
    this.emit('resize');
    this.handleScroll();
  }

  /**
   * Handles `keydown` event on the document.
   *
   * @param {KeyboardEvent} event
   * @private
   */
  handleGlobalKeyDown(event) {
    if (bootController.isPageOverlayOn()) return;

    this.emit('keyDown', event);
  }

  /**
   * _For internal use._ Handle a document's `scroll` event: Register seen comments, update the
   * * navigation panel's first unseen button, and update the current section block. Trigger the
   * `horizontalscroll` event.
   */
  handleScroll() {
    // Scroll will be handled when the autoscroll is finished.
    if (this.isAutoScrolling()) return;

    this.mouseMoveBlocked = true;

    // Throttle handling scroll to run not more than once in 300ms. Wait before running, otherwise
    // comments may be registered as seen after a press of Page Down/Page Up. One scroll in Chrome,
    // Firefox with Page Up/Page Down takes a little less than 200ms, but 200ms proved to be not
    // enough, so we try 300ms.
    this.throttledHandleScroll ||= OO.ui.throttle(() => {
      this.mouseMoveBlocked = false;

      if (this.isAutoScrolling()) return;

      this.emit('scroll');
    }, 300);
    this.throttledHandleScroll();

    if (window.scrollX !== this.lastScrollX) {
      $(document).trigger('horizontalscroll.cd');
    }
    this.lastScrollX = window.scrollX;
  }

  /**
   * Handle a `horizontalscroll` event, triggered from {@link TalkPageController#handleScroll}.
   *
   * @private
   */
  handleHorizontalScroll() {
    this.emit('horizontalScroll');
  }

  /**
   * Handle a `popstate` event, including clicks on links pointing to comment anchors.
   *
   * @private
   */
  handlePopState() {
    // Use `popstate`, not `hashchange`, because we need to handle cases when the user clicks a link
    // with the same fragment as is in the URL.
    try {
      this.emit('popState', decodeURIComponent(location.hash.slice(1)));
    } catch (error) {
      console.error(error);
    }

    // Make sure the title has no incorrect new comment count when the user presses the "Back"
    // button after an (internal) page reboot.
    this.updatePageTitle();
  }

  /**
   * Handle a `selectionchange` event.
   *
   * @private
   */
  handleSelectionChange() {
    this.throttledHandleSelectionChange ||= OO.ui.throttle(() => {
      this.emit('selectionChange');
    }, 200);
    this.throttledHandleSelectionChange();
  }

  /**
   * Handle page (content area) mutations.
   *
   * @private
   */
  handlePageMutate() {
    if (bootController.isBooting()) return;

    this.emit('mutate');

    // Could also run this.handleScroll() here, but not sure, as it would double the execution
    // time with rare effect.
  }

  /**
   * Handle a click on an "Add topic" button excluding those added by the script.
   *
   * @param {MouseEvent | KeyboardEvent} event
   * @private
   */
  handleAddTopicButtonClick(event) {
    if (event.ctrlKey || event.shiftKey || event.metaKey) return;

    const $button = $(/** @type {EventTarget} */ (event.currentTarget));
    let preloadConfig;
    let newTopicOnTop = false;
    if ($button.is('a')) {
      const { searchParams } = new URL($button.prop('href'));
      preloadConfig = {
        editIntro: getLastArrayElementOrSelf(searchParams.getAll('editintro')),
        commentTemplate: getLastArrayElementOrSelf(searchParams.getAll('preload')),
        headline: getLastArrayElementOrSelf(searchParams.getAll('preloadtitle')),
        params: searchParams.getAll('preloadparams[]'),
        summary: getLastArrayElementOrSelf(searchParams.getAll('summary'))?.replace(/^.+?\*\/ */, ''),
        noHeadline: Boolean(getLastArrayElementOrSelf(searchParams.getAll('nosummary'))),
        omitSignature: Boolean(searchParams.get('cdomitsignature')),
      };
      newTopicOnTop = getLastArrayElementOrSelf(searchParams.getAll('section')) === '0';
    } else {
      // <input>
      const $form = $button.closest('form');
      preloadConfig = {
        editIntro: $form.find('input[name="editintro"]').val(),
        commentTemplate: $form.find('input[name="preload"]').val(),
        headline: $form.find('input[name="preloadtitle"]').val(),
        params: $form
          .find('input[name="preloadparams[]"]')
          .get()
          .map((/** @type {HTMLInputElement} */ el) => el.value),
        summary: $form.find('input[name="summary"]').val(),
        noHeadline: Boolean($form.find('input[name="nosummary"]').val()),
        omitSignature: false,
      };
    }

    event.preventDefault();
    cd.page.addSection(undefined, undefined, preloadConfig, newTopicOnTop);
  }

  /**
   * _For internal use._ Add event listeners to `window`, `document`, hooks.
   */
  addEventListeners() {
    if (!settings.get('reformatComments')) {
      // The `mouseover` event allows to capture the state when the cursor is not moving but ends up
      // above a comment but not above any comment parts (for example, as a result of scrolling).
      // The benefit may be low compared to the performance cost, but it's unexpected when the user
      // scrolls a comment and it suddenly stops being highlighted because the cursor is between
      // neighboring <p>s.
      $(document).on('mousemove mouseover', this.handleMouseMove.bind(this));
    }

    // We need the `visibilitychange` event because many things may move while the document is
    // hidden, and movements are not processed when the document is hidden.
    $(document)
      .on('scroll visibilitychange', this.handleScroll.bind(this))
      .on('horizontalscroll.cd visibilitychange', this.handleHorizontalScroll.bind(this))
      .on('selectionchange', this.handleSelectionChange.bind(this));

    $(window)
      .on('resize orientationchange', this.handleWindowResize.bind(this))
      .on('popstate', this.handlePopState.bind(this));

    // Should be above mw.hook('wikipage.content').fire so that it runs for the whole page content
    // as opposed to $('.cd-comment-author-wrapper').
    mw.hook('wikipage.content').add(
      this.connectToCommentLinks.bind(this),
      this.highlightMentions.bind(this)
    );
    mw.hook('convenientDiscussions.previewReady').add(this.connectToCommentLinks.bind(this));

    // Mutation observer doesn't follow all possible comment position changes (for example,
    // initiated with adding new CSS) unfortunately.
    setInterval(this.handlePageMutate.bind(this), 1000);

    if (cd.page.isCommentable()) {
      $(document).on('keydown', this.handleGlobalKeyDown.bind(this));
    }

    mw.hook('wikipage.content').add(this.handleWikipageContentHookFirings.bind(this));

    updateChecker
      .on('check', (revisionId) => {
        this.lastCheckedRevisionId = revisionId;
      })
      .on('commentsUpdate', this.updateAddedComments.bind(this));

    Thread
      .on('toggle', this.handleScroll.bind(this));
  }

  /**
   * Bind a click handler to comment links to make them work as in-script comment links.
   *
   * This method exists in addition to {@link TalkPageController#handlePopState}. It's preferable to
   * have click events handled by this method instead of `.handlePopState()` because that method, if
   * encounters `cdJumpedToComment` in the history state, doesn't scroll to the comment which is a
   * wrong behavior when the user clicks a link.
   *
   * @param {JQuery} $content
   * @private
   */
  connectToCommentLinks($content) {
    if (!$content.is('#mw-content-text, .cd-commentForm-previewArea')) return;

    const goToCommentUrl = mw.util.getUrl('Special:GoToComment/');
    const extractCommentId = (/** @type {HTMLAnchorElement} */ el) =>
      /** @type {string} */ ($(el).attr('href'))
      .replace(mw.util.escapeRegExp(goToCommentUrl), '#')
      .slice(1);
    $content
      .find(`a[href^="#"], a[href^="${goToCommentUrl}"]`)
      .filter((_, /** @type {HTMLAnchorElement} */ el) =>
        Boolean(
          // `onclick` and `cdCallback` may be added by us in other places
          !el.onclick && !el.cdCallback && commentRegistry.getByAnyId(extractCommentId(el), true)
        )
      )
      // eslint-disable-next-line jsdoc/require-param
      .on('click', /** @this {HTMLAnchorElement} */ function (event) {
        event.preventDefault();
        commentRegistry.getByAnyId(extractCommentId(this), true)?.scrollTo({
          expandThreads: true,
          pushState: true,
        });
      });
  }

  /**
   * Highlight mentions of the current user.
   *
   * @param {JQuery} $content
   * @private
   */
  highlightMentions($content) {
    if (!$content.is('#mw-content-text, .cd-comment-part')) return;

    const currentUserName = cd.user.getName();
    const excludeSelector = [
      settings.get('reformatComments') ?
        'cd-comment-author' :
        'cd-signature'
    ]
      .concat(cd.config.noSignatureClasses)
      .map((name) => `.${name}`)
      .join(', ');
    $content
      .find(
        $content.hasClass('cd-comment-part') ?
          `a[title$=":${currentUserName}"], a[title*=":${currentUserName} ("]` :
          `.cd-comment-part a[title$=":${currentUserName}"], .cd-comment-part a[title*=":${currentUserName} ("]`
      )
      .filter(function () {
        return (
          cd.g.userLinkRegexp.test(this.title) &&
          !this.closest(excludeSelector) &&
          Parser.processLink(this)?.userName === cd.user.getName()
        );
      })
      .each((_, link) => {
        link.classList.add('cd-currentUserLink');
      });
  }

  /**
   * Handle firings of the hook
   * {@link https://doc.wikimedia.org/mediawiki-core/master/js/Hooks.html#~event:'wikipage.content' wikipage.content}
   * (by using `mw.hook('wikipage.content').fire()`). This is performed by some user scripts, such
   * as QuickEdit.
   *
   * @param {JQuery} $content
   * @private
   */
  handleWikipageContentHookFirings($content) {
    if (!$content.is('#mw-content-text')) return;

    const $root = $content.children('.mw-parser-output');
    if ($root.length && !$root.hasClass('cd-parse-started')) {
      this.reboot({ isPageReloadedExternally: true });
    }
  }

  /**
   * Reload the page via Ajax.
   *
   * (This method could have mostly been part of {@link bootController} (apart from
   * `saveScrollPosition()`, `restoreScrollPosition()`, and `reset()`), but is in
   * `talkPageController` because we need it to emit events which `bootController` can't do due to
   * the fact that `OO.EventEmitter` is not available before its module is loaded by
   * `bootController` itself.)
   *
   * @param {import('./BootProcess').PassedData} [passedData={}] Data passed from the previous page
   *   state. See {@link PassedData} for the list of possible properties. `html`, `unseenComments`
   *   properties are set in this function.
   * @throws {import('./CdError').default|Error}
   */
  async reboot(passedData = {}) {
    if (bootController.isBooting()) return;

    passedData.isRevisionSliderRunning = Boolean(history.state?.sliderPos);

    this.emit('beforeReboot', passedData);

    // We reset the live timestamps only during the boot process, because we shouldn't dismount the
    // components of the current version of the page at least until a correct response to the parse
    // request is received. Otherwise, if the request fails, the user would be left with a
    // dysfunctional page.

    if (!passedData.commentIds && !passedData.sectionId) {
      this.saveScrollPosition();
    }

    debug.init();
    debug.startTimer('total time');
    debug.startTimer('get HTML');

    // Save time by requesting the options in advance. This also resets the cache since the `reuse`
    // parameter is `false`.
    getUserInfo().catch((error) => {
      console.warn(error);
    });

    bootController.showLoadingOverlay();
    const bootProcess = bootController.createBootProcess(passedData);

    try {
      bootProcess.passedData.parseData = await cd.page.parse(undefined, false, true);
    } catch (error) {
      bootController.hideLoadingOverlay();
      if (bootProcess.passedData.submittedCommentForm) {
        throw error;
      } else {
        mw.notify(cd.s('error-reloadpage'), { type: 'error' });
        console.warn(error);
        return;
      }
    }

    mw.loader.load(bootProcess.passedData.parseData.modules);
    mw.loader.load(bootProcess.passedData.parseData.modulestyles);

    // It would be perhaps more correct to set the config variables in
    // controller.updatePageContents(), but we need wgDiscussionToolsPageThreads from there before
    // that.
    mw.config.set(bootProcess.passedData.parseData.jsconfigvars);

    // Get IDs of unseen comments. This is used to arrange that they will still be there after
    // replying on or refreshing the page.
    bootProcess.passedData.unseenComments = commentRegistry
      .query((comment) => comment.isSeen === false);

    // At this point, the boot process can't be interrupted, so we can remove all traces of the
    // current page state.
    bootController.setBootProcess(bootProcess);

    this.emit('startReboot');

    // Just submitted "Add section" form (it is outside of the .$root element, so we must remove it
    // here). Forms that should stay are detached above.
    if (bootProcess.passedData.submittedCommentForm?.getMode() === 'addSection') {
      bootProcess.passedData.submittedCommentForm.teardown();
    }

    this.reset();

    debug.stopTimer('get HTML');

    await bootController.tryBoot(true);

    this.emit('reboot');

    if (!bootProcess.passedData.commentIds && !bootProcess.passedData.sectionId) {
      this.restoreScrollPosition(false);
    }
  }

  /**
   * _For internal use._ Update the page's HTML and certain configuration values.
   *
   * @param {import('./utils-api').ApiResponseParseContent} parseData
   */
  updatePageContents(parseData) {
    bootController.$content.children('.mw-parser-output').first().replaceWith(bootController.$root);

    mw.util.clearSubtitle?.();
    mw.util.addSubtitle?.(parseData.subtitle);

    if ($('#catlinks').length) {
      const $categories = $(parseData.categorieshtml);
      mw.hook('wikipage.categories').fire($categories);
      $('#catlinks').replaceWith($categories);
    }

    mw.config.set({
      wgRevisionId: parseData.revid,
      wgCurRevisionId: parseData.revid,
    });
  }

  /**
   * Reset the controller data and state. (Executed between page loads.)
   *
   * @private
   */
  reset() {
    bootController.cleanUpUrlAndDom();
    this.originalPageTitle = document.title;
    this.mutationObserver?.disconnect();
    commentRegistry.reset();
    sectionRegistry.reset();
    CommentForm.forgetOnTarget(cd.page, 'addSection');
    this.$emulatedAddTopicButton?.remove();
    delete this.$addTopicButtons;
    this.content = {};
    this.addedCommentCount = 0;
    this.areRelevantCommentsAdded = false;
    this.relevantAddedCommentIds = null;
    delete this.dtSubscribableThreads;
    this.updatePageTitle();
  }

  /**
   * _For internal use._ Update the page title to show:
   * - What state the page is in according to the user's action (replying, editing, starting a
   *   section or subsection, or none).
   * - The number of comments added to the page since it was loaded. If used without parameters,
   *   restore the previous value (if could be changed by the browser when the "Back" button is
   *   clicked).
   */
  updatePageTitle() {
    let title = this.originalPageTitle;
    const lastActiveCommentForm = commentFormRegistry.getLastActive();
    if (lastActiveCommentForm) {
      const ending = lastActiveCommentForm
        .getTarget()
        .getCommentFormMethodName(lastActiveCommentForm.getMode())
        .toLowerCase();
      title = cd.s(`page-title-${ending}`, title);
    }

    if (this.addedCommentCount === 0) {
      // A hack for Chrome (at least) for cases when the "Back" button of the browser is clicked.
      document.title = '';
    }

    const relevantMark = this.areRelevantCommentsAdded ? '*' : '';
    document.title = title.replace(
      /^(?:\(\d+\*?\) )?/,
      this.addedCommentCount ?
        `(${this.addedCommentCount}${relevantMark}) ` :
        ''
    );
  }

  /**
   * _For internal use._ Check whether the page qualifies to be considered a long page (which
   * affects attempting performance improvements).
   *
   * @returns {boolean}
   */
  isLongPage() {
    this.content.longPage ??= /** @type {number} */ ($(document).height()) > 15000;

    return this.content.longPage;
  }

  /**
   * Show an edit subscriptions dialog.
   */
  showEditSubscriptionsDialog() {
    if (bootController.isPageOverlayOn()) return;

    const dialog = new (require('./EditSubscriptionsDialog').default)();
    cd.getWindowManager().addWindows([dialog]);
    cd.getWindowManager().openWindow(dialog);
  }

  /**
   * Show a copy link dialog.
   *
   * @param {import('./Comment').default|import('./Section').default} object Comment or section to copy a link to.
   * @param {MouseEvent | KeyboardEvent} event
   */
  showCopyLinkDialog(object, event) {
    if (bootController.isPageOverlayOn()) return;

    event.preventDefault();

    const fragment = object.getWikilinkFragment();
    const permalinkSpecialPagePrefix = (
      mw.config.get('wgFormattedNamespaces')[-1] +
      ':' +
      (
        object.isComment() ?
          'GoToComment/' :
          cd.g.specialPageAliases.PermanentLink[0] + '/' + mw.config.get('wgRevisionId') + '#'
      )
    );
    const content = {
      copyMessages: {
        success: cd.s('copylink-copied'),
        fail: cd.s('copylink-error'),
      },
      fragment,
      wikilink: `[[${cd.page.name}#${fragment}]]`,
      currentPageWikilink: `[[#${fragment}]]`,
      permanentWikilink: `[[${permalinkSpecialPagePrefix}${fragment}]]`,

      // This dialog should be shown only for comments that have a timestamp; therefore a date;
      // therefore an ID. In that case Comment#getUrl() returns a string.
      link: /** @type {string} */ (object.getUrl()),

      permanentLink: object.isComment() ?
        /** @type {import('./pageRegistry').Page} */ (pageRegistry.get(
          mw.config.get('wgFormattedNamespaces')[-1] + ':' + 'GoToComment/' + fragment
        )).getDecodedUrlWithFragment() :
        object.getUrl(true),
      jsCall: object.isComment() ?
        `let c = convenientDiscussions.api.getCommentById('${object.id}');` :
        `let s = convenientDiscussions.api.getSectionById('${object.id}');`,
      jsBreakpoint: `this.id === '${object.id}'`,
      jsBreakpointTimestamp: object.isComment() ?
        `timestamp.element.textContent === '${object.timestampText}'` :
        undefined,
    };

    // Undocumented feature allowing to copy a link of a default type without opening a dialog.
    const relevantSetting = object.isComment() ?
      settings.get('defaultCommentLinkType') :
      settings.get('defaultSectionLinkType');
    if (!event.shiftKey && relevantSetting) {
      switch (relevantSetting) {
        case 'wikilink':
          copyText(content.wikilink, content.copyMessages);
          break;
        case 'link':
          copyText(content.link, content.copyMessages);
          break;
      }
      return;
    }

    const dialog = new (require('./CopyLinkDialog').default)(object, content);
    cd.getWindowManager().addWindows([dialog]);
    cd.getWindowManager().openWindow(dialog);
  }

  /**
   * Scroll to a specified position vertically.
   *
   * @param {number} y
   * @param {boolean} [smooth=true]
   * @param {Function} [callback]
   */
  scrollToY(y, smooth = true, callback) {
    const onComplete = () => {
      this.toggleAutoScrolling(false);
      this.handleScroll();
      callback?.();
    };

    if (smooth) {
      $('body, html').animate({ scrollTop: y }, {
        complete: function () {
          if (this !== document.documentElement) return;
          onComplete();
        },
      });
    } else {
      window.scrollTo(window.scrollX, y);
      onComplete();
    }
  }

  /**
   * Set whether the viewport is currently automatically scrolled to some position. To get that
   * state, use {@link TalkPageController#isAutoScrolling}.
   *
   * @param {boolean} value
   */
  toggleAutoScrolling(value) {
    this.autoScrolling = Boolean(value);
  }

  /**
   * Check whether the viewport is currently automatically scrolled to some position. To set that
   * state, use {@link TalkPageController#toggleAutoScrolling}.
   *
   * @returns {boolean}
   */
  isAutoScrolling() {
    return this.autoScrolling;
  }

  /**
   * Set up a
   * {@link https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver MutationObserver}
   * instance to handle page mutations.
   */
  async setupMutationObserver() {
    // Create the mutation observer in the next event loop iteration - let most DOM changes by CD
    // and scripts attached to the hooks to be made first to reduce the number of times it runs in
    // vain. But if we set a long delay, users will see comment backgrounds mispositioned for some
    // time.
    await sleep();

    this.mutationObserver = new MutationObserver((records) => {
      const layerClassRegexp = /^cd-comment(-underlay|-overlay|Layers)/;
      if (
        records.every(
          (record) =>
            record.target instanceof HTMLElement && layerClassRegexp.test(record.target.className)
        )
      )
        return;

      this.handlePageMutate();
    });
    this.mutationObserver.observe(this.$content[0], {
      attributes: true,
      childList: true,
      subtree: true,
    });
  }

  /**
   * Show a regular notification (`mw.notification`) to the user.
   *
   * @param {import('./updateChecker').CommentWorkerMatched[]} comments
   * @private
   */
  showRegularNotification(comments) {
    let filteredComments = [];
    if (settings.get('notifications') === 'all') {
      filteredComments = comments;
    } else if (settings.get('notifications') === 'toMe') {
      filteredComments = comments.filter((comment) => comment.isToMe);
    }

    if (settings.get('notifications') !== 'none' && filteredComments.length) {
      // Combine with content of notifications that were displayed but are still open (i.e., the
      // user most likely didn't see them because the tab is in the background). In the past there
      // could be more than one notification, now there can be only one.
      const openNotification = notifications.get()
        .find((data) => data.comments && data.notification.isOpen);
      if (openNotification) {
        filteredComments.push(...openNotification.comments);
      }
    }

    const wordSeparator = cd.mws('word-separator');

    if (filteredComments.length) {
      let html;
      const rebootHtml = cd.sParse(
        'notification-reload',

        // Note about the form data
        commentFormRegistry.getAll().some((cf) => cf.isAltered()) ?
          wordSeparator + cd.mws('parentheses', cd.s('notification-formdata')) :
          ''
      );
      if (filteredComments.length === 1) {
        const comment = filteredComments[0];
        if (comment.isToMe) {
          const where = comment.sectionSubscribedTo ?
            (
              wordSeparator +
              cd.s('notification-part-insection', comment.sectionSubscribedTo.headline)
            ) :
            wordSeparator + cd.s('notification-part-onthispage');
          html = (
            cd.sParse('notification-toyou', comment.author.getName(), comment.author, where) +
            wordSeparator +
            rebootHtml
          );
        } else {
          html = (
            cd.sParse(
              'notification-insection',
              comment.author.getName(),
              comment.author,
              comment.sectionSubscribedTo.headline
            ) +
            wordSeparator +
            rebootHtml
          );
        }
      } else {
        const isCommonSection = filteredComments.every((comment) => (
          comment.sectionSubscribedTo === filteredComments[0].sectionSubscribedTo
        ));
        const section = isCommonSection ? filteredComments[0].sectionSubscribedTo : undefined;
        const where = (
          wordSeparator +
          (
            section ?
              cd.s('notification-part-insection', section.headline) :
              cd.s('notification-part-onthispage')
          )
        );
        let mayBeRelevantString = cd.s('notification-newcomments-mayberelevant');
        if (!mayBeRelevantString.startsWith(cd.mws('comma-separator'))) {
          mayBeRelevantString = wordSeparator + mayBeRelevantString;
        }

        // "that may be relevant to you" text is not needed when the section is watched and the user
        // can clearly understand why they are notified.
        const mayBeRelevant = section ? '' : mayBeRelevantString;

        html = (
          cd.sParse('notification-newcomments', filteredComments.length, where, mayBeRelevant) +
          wordSeparator +
          rebootHtml
        );
      }

      const notification = notifications.add(
        wrapHtml(html),
        { tag: 'cd-newComments' },
        { comments: filteredComments }
      );
      notification.$notification.on('click', () => {
        this.reboot({ commentIds: filteredComments.map((comment) => comment.id) });
      });
    }
  }

  /**
   * Show a desktop notification to the user.
   *
   * @param {import('./updateChecker').CommentWorkerMatched[]} comments
   * @private
   */
  showDesktopNotification(comments) {
    let filteredComments = [];
    if (settings.get('desktopNotifications') === 'all') {
      filteredComments = comments;
    } else if (settings.get('desktopNotifications') === 'toMe') {
      filteredComments = comments.filter((comment) => comment.isToMe);
    }

    if (
      typeof Notification === 'undefined' ||
      Notification.permission !== 'granted' ||
      !filteredComments.length ||
      document.hasFocus()
    ) {
      return;
    }

    const wordSeparator = cd.mws('word-separator');

    let body;
    const comment = filteredComments[0];
    const currentPageName = cd.page.name;
    if (filteredComments.length === 1) {
      if (comment.isToMe) {
        const where = comment.section?.headline ?
          wordSeparator + cd.s('notification-part-insection', comment.section.headline) :
          '';
        body = cd.s(
          'notification-toyou-desktop',
          comment.author.getName(),
          comment.author,
          where,
          currentPageName
        );
      } else {
        body = cd.s(
          'notification-insection-desktop',
          comment.author.getName(),
          comment.author,
          comment.section.headline,
          currentPageName
        );
      }
    } else {
      let section;
      const isCommonSection = filteredComments.every((comment) => (
        comment.sectionSubscribedTo === filteredComments[0].sectionSubscribedTo
      ));
      if (isCommonSection) {
        section = filteredComments[0].sectionSubscribedTo;
      }
      const where = section ?
        wordSeparator + cd.s('notification-part-insection', section.headline) :
        '';
      let mayBeRelevantString = cd.s('notification-newcomments-mayberelevant');
      if (!mayBeRelevantString.startsWith(cd.mws('comma-separator'))) {
        mayBeRelevantString = wordSeparator + mayBeRelevantString;
      }

      // "that may be relevant to you" text is not needed when the section is watched and the user
      // can clearly understand why they are notified.
      const mayBeRelevant = section ? '' : mayBeRelevantString;

      body = cd.s(
        'notification-newcomments-desktop',
        filteredComments.length,
        where,
        currentPageName,
        mayBeRelevant
      );
    }

    const notification = new Notification(mw.config.get('wgSiteName'), {
      body,

      // We use a tag so that there aren't duplicate notifications when the same page is opened in
      // two tabs. (Seems it doesn't work? :-/)
      tag: 'cd-' + filteredComments[filteredComments.length - 1].id,
    });
    notification.onclick = () => {
      parent.focus();

      // Just in case, old browsers. TODO: delete?
      window.focus();

      this.emit('desktopNotificationClick');

      this.reboot({
        commentIds: [comment.id],
        closeNotificationsSmoothly: false,
      });
    };
  }

  /**
   * Update the data about added comments (new comments added while the page was idle), update page
   * components accordingly, show notifications.
   *
   * @param {import('./updateChecker').CommentWorkerMatched[]} all
   * @param {import('./updateChecker').CommentWorkerMatched[]} relevant
   */
  updateAddedComments(all, relevant) {
    this.addedCommentCount = all.length;
    this.areRelevantCommentsAdded = Boolean(relevant.length);
    if (relevant.length) {
      this.relevantAddedCommentIds = relevant.map((comment) => comment.id).filter(definedAndNotNull);
    } else if (all.length) {
      this.relevantAddedCommentIds = all.map((comment) => comment.id).filter(definedAndNotNull);
    }

    this.updatePageTitle();

    const commentsToNotifyAbout = relevant
      .filter((comment) => !this.commentsNotifiedAbout.some((cna) => cna.id === comment.id));
    this.showRegularNotification(commentsToNotifyAbout);
    this.showDesktopNotification(commentsToNotifyAbout);
    this.commentsNotifiedAbout.push(...commentsToNotifyAbout);
  }

  /**
   * Get the IDs of the comments that should be jumped to after rebooting the page.
   *
   * @returns {string[]|null}
   */
  getRelevantAddedCommentIds() {
    return this.relevantAddedCommentIds;
  }

  /**
   * _For internal use._ If every changed comment on the page has been seen and there are no new
   * comments on the page that are not displayed, mark the page as read.
   */
  maybeMarkPageAsRead() {
    if (
      !this.addedCommentCount &&
      commentRegistry.getAll().every((comment) => !comment.willFlashChangedOnSight) &&
      this.lastCheckedRevisionId
    ) {
      cd.page.markAsRead(this.lastCheckedRevisionId);
    }
  }

  /**
   * Create an appropriate {@link Subscriptions} singleton based on the user settings.
   *
   * @returns {import('./Subscriptions').default}
   */
  getSubscriptionsInstance() {
    this.subscriptionsInstance ||= new (
      settings.get('useTopicSubscription')
        // Use `require()`, not `import`, to avoid a circular reference
        ? require('./DtSubscriptions').default
        : require('./LegacySubscriptions').default
    )();

    return this.subscriptionsInstance;
  }

  /**
   * Type guard for the {@link DtSubscriptions} class.
   *
   * @param {object} obj
   * @returns {obj is import('./DtSubscriptions').default}
   */
  isDtSubscriptions(obj) {
    // Use `require()`, not `import`, to avoid a circular reference
    return obj instanceof require('./DtSubscriptions').default;
  }

  /**
   * Type guard for the {@link LegacySubscriptions} class.
   *
   * @param {object} obj
   * @returns {obj is import('./LegacySubscriptions').default}
   */
  isLegacySubscriptions(obj) {
    // Use `require()`, not `import`, to avoid a circular reference
    return obj instanceof require('./LegacySubscriptions').default;
  }

  /**
   * _For internal use._ Bind a click handler to every known "Add topic" button out of our
   * control (and update the behavior of the native "Add topic" button).
   */
  connectToAddTopicButtons() {
    this.$addTopicButtons = $(
      [
        '#ca-addsection a',
        '.cd-addTopicButton a',
        'a.cd-addTopicButton',
        'a[href*="section=new"]',
        'a[href*="Special:NewSection/"]',
        'a[href*="Special:Newsection/"]',
        'a[href*="special:newsection/"]',
        '.commentbox input[type="submit"]',
        '.createbox input[type="submit"]',
      ]
        .concat(cd.config.addTopicButtonSelectors)
        .join(', ')
    )
      .filter((_, el) => {
        const $button = $(el);

        // When DT's new topic tool is enabled
        if (
          mw.util.getParamValue('section') === 'new' &&
          $button.parent().attr('id') !== 'ca-addsection' &&
          !$button.closest(bootController.$root).length
        ) {
          return false;
        }

        let pageName;
        let /** @type {URL|undefined} */ url;
        if ($button.is('a')) {
          url = new URL($button.prop('href'));
          pageName = getLastArrayElementOrSelf(url.searchParams.getAll('title'))
            ?.replace(/^Special:NewSection\//i, '');
        } else if ($button.is('input')) {
          pageName = /** @type {string} */ ($button
            .closest('form')
            .find('input[name="title"][type="hidden"]')
            .val());
        }
        if (!pageName) {
          return false;
        }

        const page = pageRegistry.get(pageName);
        if (!page || page !== cd.page) {
          return false;
        }

        if (url) {
          url.searchParams.set('dtenable', '0');
          $button.attr('href', url.toString());
        }

        return true;
      });

    if (!$('#ca-addsection a').length && this.$addTopicButtons.length === 1) {
      this.$emulatedAddTopicButton = $(/** @type {HTMLLIElement} */ (mw.util.addPortletLink(
        'p-views',
        this.$addTopicButtons.attr('href') || '#',
        cd.s('addtopic'),
        'ca-addsection',
        cd.s('addtopicbutton-tooltip'),
        '+',
        '#ca-history'
      )));
      this.$addTopicButtons = this.$addTopicButtons.add(
        /** @type {JQuery} */ (this.$emulatedAddTopicButton).children()
      );
    }

    this.$addTopicButtons
      // DT may add its handler (as adds to a "Start new discussion" button on 404 pages). DT's "Add
      // topic" button click handler is trickier, see below.
      .off('click')

      .on('click.cd', this.handleAddTopicButtonClick.bind(this))
      .filter((_, el) => (
        !cd.g.isDtNewTopicToolEnabled &&
        !($(el).is('a') && Number(mw.util.getParamValue('cdaddtopic', $(el).attr('href'))))
      ))
      .attr('title', cd.s('addtopicbutton-tooltip'));

    $('#ca-addsection a').updateTooltipAccessKeys();

    // In case DT's new topic tool is enabled, remove the handler of the "Add topic" button.
    const dtHandler = $._data(document.body, 'events').click
      ?.find((event) => event.selector?.includes('data-mw-comment'))
      ?.handler;
    if (dtHandler) {
      $(document.body).off('click', dtHandler);
    }
  }

  /**
   * Get the list of DiscussionTools threads that are related to subscribable (2-level) threads.
   * This is updated on page reboot.
   *
   * @returns {mw.DiscussionToolsHeading[]}
   */
  getDtSubscribableThreads() {
    const threads = /** @type {mw.DiscussionToolsHeading[]} */ (
      mw.config.get('wgDiscussionToolsPageThreads')
    );
    this.dtSubscribableThreads ||= threads
      ?.concat(
        threads
          .filter((thread) => thread.headingLevel === 1)
          .flatMap((thread) => thread.replies)
      )
      .filter((thread) => 'headingLevel' in thread && thread.headingLevel === 2);

    return this.dtSubscribableThreads;
  }

  /**
   * Check whether subscribing is disabled on this page despite it being an active page (because
   * it's a user's own talk page).
   *
   * @returns {boolean}
   */
  isSubscribingDisabled() {
    return (
      cd.page.isOwnTalkPage() &&
      !['all', 'toMe'].includes(settings.get('desktopNotifications'))
    );
  }
}

export default new TalkPageController();
