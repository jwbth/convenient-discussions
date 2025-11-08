import AutocompleteManager from './AutocompleteManager';
import Comment from './Comment';
import CommentForm from './CommentForm';
import CopyLinkDialog from './CopyLinkDialog';
import DtSubscriptions from './DtSubscriptions';
import EventEmitter from './EventEmitter';
import LegacySubscriptions from './LegacySubscriptions';
import Thread from './Thread';
import bootManager from './bootManager';
import cd from './cd';
import commentFormManager from './commentFormManager';
import commentManager from './commentManager';
import navPanel from './navPanel';
import notifications from './notifications';
import pageRegistry from './pageRegistry';
import sectionManager from './sectionManager';
import settings from './settings';
import ElementsTreeWalker from './shared/ElementsTreeWalker';
import Parser from './shared/Parser';
import { defined, definedAndNotNull, getLastArrayElementOrSelf, isHeadingNode, isInline, sleep } from './shared/utils-general';
import toc from './toc';
import updateChecker from './updateChecker';
import { copyText, getVisibilityByRects, skin$, wrapHtml } from './utils-window';

/**
 * @typedef {object} EventMap
 * @property {[]} boot
 * @property {[event: MouseEvent | JQuery.MouseMoveEvent | JQuery.MouseOverEvent]} mouseMove
 * @property {[]} resize
 * @property {[event: KeyboardEvent | JQuery.KeyDownEvent]} keyDown
 * @property {[]} scroll
 * @property {[]} horizontalScroll
 * @property {[fragment: string]} popState
 * @property {[]} selectionChange
 * @property {[]} mutate
 * @property {[passedData: import('./TalkPageBootProcess').PassedData]} beforeReboot
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
class PageController extends EventEmitter {
  /**
   * @type {JQuery}
   */
  $root;

  /**
   * @type {HTMLElement}
   */
  rootElement;

  /** @type {JQuery} */
  $contentColumn = skin$({
    timeless: '#mw-content',
    minerva: '#bodyContent',
    default: '#content',
  });

  /**
   * @typedef {object} ContentColumnOffsets
   * @property {number} startMargin The left margin of the content column.
   * @property {number} start The left offset of the content column.
   * @property {number} end The right offset of the content column.
   */

  /**
   * @type {ContentColumnOffsets | undefined}
   * @private
   */
  contentColumnOffsets;

  /**
   * @type {JQuery | undefined}
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
   * @type {import('./Subscriptions').default | undefined}
   */
  subscriptionsInstance;

  /**
   * @type {mw.DiscussionToolsHeading[]|undefined}
   * @private
   */
  dtSubscribableThreads;

  /**
   * @type {HTMLElement | undefined}
   * @private
   */
  notificationArea;

  /**
   * @type {HTMLElement | undefined}
   * @private
   */
  tocButton;

  /**
   * @type {HTMLElement | undefined}
   * @private
   */
  stickyHeader;

  /**
   * @type {HTMLElement | undefined}
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
   * @type {(() => void) | undefined}
   * @private
   */
  throttledHandleScroll;

  /**
   * @type {(() => void) | undefined}
   * @private
   */
  throttledHandleSelectionChange;

  /**
   * @type {{
   *   offset?: number | undefined;
   *   element?: Element | undefined;
   *   elementTop?: number | undefined;
   *   touchesBottom?: boolean;
   *   offsetBottom?: number | undefined;
   *   tocHeight?: number | undefined;
   * }}
   */
  scrollData = {};

  autoScrolling = false;
  isUpdateThreadLinesHandlerAttached = false;
  lastScrollX = 0;
  originalPageTitle = document.title;

  /** @type {number | undefined} */
  lastCheckedRevisionId;

  addedCommentCount = 0;
  areRelevantCommentsAdded = false;

  /** @type {string[] | undefined} */
  relevantAddedCommentIds;

  /** @type {import('./updateChecker').CommentWorkerMatched[]} */
  commentsNotifiedAbout = [];

  isObstructingElementHoveredCached = false;

  /**
   * @type {number | undefined}
   * @private
   */
  bodyScrollPaddingTop;

  /**
   * Set up the boot manager for use in the current boot process. (Executed at every page load.)
   *
   * @param {string} [pageHtml] HTML to update the page with.
   */
  setup(pageHtml) {
    // RevisionSlider replaces the #mw-content-text element.
    if (!bootManager.$content.get(0)?.parentNode) {
      bootManager.$content = $('#mw-content-text');
    }

    if (pageHtml) {
      const div = document.createElement('div');
      div.innerHTML = pageHtml;
      this.rootElement = /** @type {HTMLElement} */ (div.firstChild);
      this.$root = $(this.rootElement);
    } else {
      // There can be more than one .mw-parser-output child, e.g. on talk pages of IP editors.
      this.$root = bootManager.$content.children('.mw-parser-output').first();

      // 404 pages
      if (!this.$root.length) {
        this.$root = bootManager.$content;
      }

      this.rootElement = this.$root[0];
    }

    // Add the class immediately, not at the end of the boot process, to prevent the issue when any
    // unexpected error prevents this from being executed. Then, when
    // this.handleWikipageContentHookFirings() is called with #mw-content-text element for some
    // reason, the page can go into an infinite rebooting loop.
    this.$root.addClass('cd-parse-started');

    // this.backgroundHighlightingCss = require('./Comment.layers.optionalBackgroundHighlighting.less');
    // if (settings.get('useBackgroundHighlighting')) {
    //   const a = await import('./Comment.layers.optionalBackgroundHighlighting.less');
    //   console.log(a);
    // }
  }

  /**
   * Get the content root element (`.mw-parser-output` or `#mw-content-text`). Supposed to be used
   * via {@link convenientDiscussions.api.getRootElement}; inside the script, direct reference to
   * `pageController.rootElement` is practiced.
   *
   * @returns {Element}
   */
  getRootElement() {
    return this.rootElement;
  }

  /**
   * Get the offset data related to `.$contentColumn`.
   *
   * @param {boolean} [bypassCache] Whether to bypass cache.
   * @returns {ContentColumnOffsets}
   */
  getContentColumnOffsets(bypassCache = false) {
    if (!this.contentColumnOffsets || bypassCache) {
      let startMargin = Math.max(
        Number.parseFloat(
          this.$contentColumn.css(
            cd.g.contentDirection === 'ltr' ? 'padding-left' : 'padding-right'
          )
        ),
        cd.g.contentFontSize
      );

      // The content column in Timeless has no _borders_ as such, so it's wrong to penetrate the
      // surrounding area from the design point of view.
      if (cd.g.skin === 'timeless') {
        startMargin--;
      }

      const left = /** @type {JQuery.Coordinates} */ (this.$contentColumn.offset()).left;
      const width = /** @type {number} */ (this.$contentColumn.outerWidth());
      this.contentColumnOffsets = {
        startMargin,
        start: cd.g.contentDirection === 'ltr' ? left : left + width,
        end: cd.g.contentDirection === 'ltr' ? left + width : left,
      };
    }

    return this.contentColumnOffsets;
  }

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
   * @param {boolean | undefined} [switchToAbsolute] If this value is `true` or `false` and the viewport
   *   is above the bottom of the table of contents, then use
   *   {@link PageController#saveScrollPosition} (this allows for better precision).
   * @param {number} scrollY Cached horizontal scroll value used to avoid reflow.
   */
  saveRelativeScrollPosition(switchToAbsolute, scrollY = window.scrollY) {
    // The viewport has the TOC bottom or is above it.
    if (
      switchToAbsolute !== undefined &&
      !toc.isInSidebar() &&
      toc.isPresent() &&
      scrollY < /** @type {number} */ (toc.getBottomOffset())
    ) {
      this.saveScrollPosition(switchToAbsolute);
    } else {
      this.scrollData.element = undefined;
      this.scrollData.elementTop = undefined;
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
        this.rootElement.getBoundingClientRect().top <= this.getBodyScrollPaddingTop()
      ) {
        const treeWalker = new ElementsTreeWalker(
          this.rootElement,
          this.rootElement.firstElementChild || undefined,
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
              rect.top > this.getBodyScrollPaddingTop() + cd.g.contentFontSize &&
              this.scrollData.element &&
              !isHeadingNode(el)
            ) {
              break;
            }

            if (rect.height !== 0 && rect.bottom >= this.getBodyScrollPaddingTop()) {
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
   * Restore the scroll position saved in {@link PageController#saveRelativeScrollPosition}.
   *
   * @param {boolean} [switchToAbsolute] Restore the absolute position using
   *   {@link PageController#restoreScrollPosition} if
   *   {@link PageController#saveScrollPosition} was previously used for saving the position.
   */
  restoreRelativeScrollPosition(switchToAbsolute = false) {
    if (switchToAbsolute && this.scrollData.offset !== undefined) {
      this.restoreScrollPosition();
    } else if (this.scrollData.touchesBottom && window.scrollY !== 0) {
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
        const closestHidden = /** @type {HTMLElement | undefined} */ (
          this.scrollData.element.closest('[hidden]')
        );
        if (closestHidden) {
          commentManager.getAll()
            .map((comment) => comment.thread)
            .filter(defined)
            .filter((thread) => thread.isCollapsed)
            .find((thread) =>
            /** @type {HTMLElement[]} */ (thread.collapsedRange).includes(closestHidden)
            )
            ?.$expandNote
            ?.cdScrollTo('top', false);
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
   * {@link PageController#restoreScrollPosition}.
   *
   * @param {boolean} [saveTocHeight] `false` is used for more fine control of scroll behavior
   *   when visits are loaded after a page reboot.
   */
  saveScrollPosition(saveTocHeight = true) {
    this.scrollData.offset = window.scrollY;
    this.scrollData.tocHeight =
      (saveTocHeight || this.scrollData.tocHeight) &&
      !toc.isInSidebar() &&
      toc.isPresent() &&
      !toc.isFloating() &&
      window.scrollY !== 0 &&

      // There is some content below the TOC in the viewport.
      /** @type {number} */ (toc.getBottomOffset()) < window.scrollY + window.innerHeight
        ? toc.$element.outerHeight()
        : undefined;
  }

  /**
   * Restore the scroll position saved in {@link PageController#saveScrollPosition}.
   *
   * @param {boolean} [resetTocHeight] `false` is used for more fine control of scroll behavior
   *   after page reboots.
   */
  restoreScrollPosition(resetTocHeight = true) {
    if (this.scrollData.offset === undefined) return;

    if (this.scrollData.tocHeight) {
      this.scrollData.offset +=
        (/** @type {JQuery} */ (toc.$element).outerHeight() || 0) - this.scrollData.tocHeight;
    }
    window.scrollTo(0, this.scrollData.offset);

    this.scrollData.offset = undefined;
    if (resetTocHeight) {
      this.scrollData.tocHeight = undefined;
    }
  }

  /**
   * Find closed discussions on the page.
   *
   * @returns {HTMLElement[]}
   */
  getClosedDiscussions() {
    this.content.closedDiscussions ??= this.$root
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
  areThereOutdents = () => {
    this.content.areThereOutdents ??= Boolean(
      this.$root.find('.' + cd.config.outdentClass).length
    );

    return this.content.areThereOutdents;
  };

  /**
   * Find floating elements on the page.
   *
   * @returns {Element[]}
   */
  getFloatingElements() {
    if (!this.content.floatingElements) {
      // Describe all floating elements on the page in order to calculate the correct border
      // (temporarily setting `overflow: hidden`) for all comments they intersect with.
      // eslint-disable-next-line no-one-time-vars/no-one-time-vars
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
        [...this.rootElement.querySelectorAll(floatingElementSelector)].filter(
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
      this.hiddenElements = hiddenElementSelector
        ? [...this.rootElement.querySelectorAll(hiddenElementSelector)]
        : [];
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
    const floating = /** @type {string[]} */ ([]);
    const hidden = /** @type {string[]} */ ([]);
    const extractSelectors = (/** @type {CSSRule} */ rule) => {
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
    [...this.rootElement.querySelectorAll('style')].forEach((el) => {
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
   * @param {MouseEvent | JQuery.MouseMoveEvent | JQuery.MouseOverEvent} event
   */
  handleMouseMove(event) {
    if (this.mouseMoveBlocked || this.isAutoScrolling() || bootManager.isPageOverlayOn()) return;

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
          AutocompleteManager.getActiveMenu(),
          navPanel.$element?.[0],
          ...document.body.querySelectorAll('.oo-ui-popupWidget:not(.oo-ui-element-hidden)'),
          $(document.body).children('dialog')[0],
          this.stickyHeader,
          sectionManager.getAll()
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
  handleWindowResize = async () => {
    // sleep(), because it seems like sometimes it doesn't have time to update.
    await sleep(cd.g.skin === 'vector-2022' ? 100 : 0);

    this.emit('resize');
    this.handleScroll();
  };

  /**
   * Handles `keydown` event on the document.
   *
   * @param {KeyboardEvent | JQuery.KeyDownEvent} event
   * @private
   */
  handleGlobalKeyDown = (event) => {
    if (bootManager.isPageOverlayOn()) return;

    this.emit('keyDown', event);
  };

  /**
   * _For internal use._ Handle a document's `scroll` event: Register seen comments, update the
   * navigation panel's first unseen button, and update the current section block. Trigger the
   * `horizontalscroll` event.
   */
  handleScroll = () => {
    // Scroll will be handled when the autoscroll is finished.
    if (this.isAutoScrolling()) return;

    this.mouseMoveBlocked = true;

    // Throttle handling scroll to run not more than once in 300ms. Wait before running, otherwise
    // comments may be registered as seen after a press of Page Down/Page Up. One scroll in Chrome,
    // Firefox with Page Up/Page Down takes a little less than 200ms, but 200ms proved to be not
    // enough, so we try 300ms.
    this.throttledHandleScroll ??= OO.ui.throttle(() => {
      this.mouseMoveBlocked = false;

      if (this.isAutoScrolling()) return;

      this.emit('scroll');
    }, 300);
    this.throttledHandleScroll();

    if (window.scrollX !== this.lastScrollX) {
      $(document).trigger('horizontalscroll.cd');
    }
    this.lastScrollX = window.scrollX;
  };

  /**
   * Handle a `horizontalscroll` event, triggered from {@link PageController#handleScroll}.
   *
   * @private
   */
  handleHorizontalScroll = () => {
    this.emit('horizontalScroll');
  };

  /**
   * Handle a `popstate` event, including clicks on links pointing to comment anchors.
   *
   * @private
   */
  handlePopState = () => {
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
  };

  /**
   * Handle a `selectionchange` event.
   *
   * @private
   */
  handleSelectionChange = () => {
    this.throttledHandleSelectionChange ??= OO.ui.throttle(() => {
      this.emit('selectionChange');
    }, 200);
    this.throttledHandleSelectionChange();
  };

  /**
   * Handle page (content area) mutations.
   *
   * @private
   */
  handlePageMutate = () => {
    if (bootManager.isBooting()) return;

    this.emit('mutate');

    // Could also run this.handleScroll() here, but not sure, as it would double the execution
    // time with rare effect.
  };

  /**
   * Handle a click on an "Add topic" button excluding those added by the script.
   *
   * @param {JQuery.TriggeredEvent} event
   * @private
   */
  handleAddTopicButtonClick = (event) => {
    if (event.ctrlKey || event.shiftKey || event.metaKey) return;

    const $button = $(/** @type {EventTarget} */ (event.currentTarget));
    let preloadConfig;
    let newTopicOnTop = false;
    if ($button.is('a')) {
      const { searchParams } = new URL(/** @type {HTMLAnchorElement} */ ($button[0]).href);
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
          .map((el) => /** @type {HTMLInputElement} */ (el).value),
        summary: $form.find('input[name="summary"]').val(),
        noHeadline: Boolean($form.find('input[name="nosummary"]').val()),
        omitSignature: false,
      };
    }

    event.preventDefault();
    cd.page.addSection(undefined, undefined, preloadConfig, newTopicOnTop);
  };

  /**
   * _For internal use._ Add event listeners to `window`, `document`, hooks.
   */
  addEventListeners() {
    if (settings.get('commentDisplay') !== 'spacious') {
      // The `mouseover` event allows to capture the state when the cursor is not moving but ends up
      // above a comment but not above any comment parts (for example, as a result of scrolling).
      // The benefit may be low compared to the performance cost, but it's unexpected when the user
      // scrolls a comment and it suddenly stops being highlighted because the cursor is between
      // neighboring <p>s.
      $(document).on('mousemove mouseover', (event) => {
        this.handleMouseMove(/** @type {JQuery.MouseMoveEvent | JQuery.MouseOverEvent} */ (event));
      });
    }

    // We need the `visibilitychange` event because many things may move while the document is
    // hidden, and movements are not processed when the document is hidden.
    $(document)
      .on('scroll visibilitychange', this.handleScroll)
      .on('horizontalscroll.cd visibilitychange', this.handleHorizontalScroll)
      .on('selectionchange', this.handleSelectionChange);

    $(window)
      .on('resize orientationchange', this.handleWindowResize)
      .on('popstate', this.handlePopState);

    // Should be above mw.hook('wikipage.content').fire so that it runs for the whole page content
    // as opposed to $('.cd-comment-author-wrapper').
    mw.hook('wikipage.content').add(
      this.connectToCommentLinks,
      this.highlightMentions
    );
    mw.hook('convenientDiscussions.previewReady').add(this.connectToCommentLinks);

    // Mutation observer doesn't follow all possible comment position changes (for example,
    // initiated with adding new CSS) unfortunately.
    setInterval(this.handlePageMutate, 1500);

    if (cd.page.isCommentable()) {
      $(document).on('keydown', this.handleGlobalKeyDown);
    }

    mw.hook('wikipage.content').add(bootManager.handleWikipageContentHookFirings);

    updateChecker
      .on('check', (revisionId) => {
        this.lastCheckedRevisionId = revisionId;
      })
      .on('commentsUpdate', this.updateAddedComments);

    Thread
      .on('toggle', this.handleScroll);
  }

  /**
   * Bind a click handler to comment links to make them work as in-script comment links.
   *
   * This method exists in addition to {@link PageController#handlePopState}. It's preferable to
   * have click events handled by this method instead of `.handlePopState()` because that method, if
   * encounters `cdJumpedToComment` in the history state, doesn't scroll to the comment which is a
   * wrong behavior when the user clicks a link.
   *
   * @param {JQuery} $content
   * @private
   */
  connectToCommentLinks = ($content) => {
    if (!$content.is('#mw-content-text, .cd-commentForm-previewArea')) return;

    const goToCommentUrl = mw.util.getUrl('Special:GoToComment/');
    const extractCommentId = (/** @type {HTMLElement} */ el) =>
      /** @type {string} */ ($(el).attr('href'))
        .replace(mw.util.escapeRegExp(goToCommentUrl), '#')
        .slice(1);
    $content
      .find(`a[href^="#"], a[href^="${goToCommentUrl}"]`)
      .filter((_, el) =>
        Boolean(
          !el.classList.contains('cd-clickHandled') &&
          commentManager.getByAnyId(extractCommentId(el), true)
        )
      )
      .on('click', function onCommentLinkClick(event) {
        event.preventDefault();
        commentManager
          .getByAnyId(extractCommentId(this), true)
          ?.scrollTo({
            expandThreads: true,
            pushState: true,
          });
      });
  };

  /**
   * Highlight mentions of the current user.
   *
   * @param {JQuery} $content
   * @private
   */
  highlightMentions = ($content) => {
    if (!$content.is('#mw-content-text, .cd-comment-part')) return;

    const currentUserName = cd.user.getName();
    const excludeSelector = [
      settings.get('commentDisplay') === 'spacious'
        ? 'cd-comment-author'
        : 'cd-signature',
    ]
      .concat(cd.config.noSignatureClasses)
      .map((name) => `.${name}`)
      .join(', ');
    $content
      .find(
        $content.hasClass('cd-comment-part')
          ? `a[title$=":${currentUserName}"], a[title*=":${currentUserName} ("]`
          : `.cd-comment-part a[title$=":${currentUserName}"], .cd-comment-part a[title*=":${currentUserName} ("]`
      )
      .filter(function filterMentions() {
        return (
          cd.g.userLinkRegexp.test(this.title) &&
          !this.closest(excludeSelector) &&
          Parser.processLink(this)?.userName === cd.user.getName()
        );
      })
      .each((_, link) => {
        link.classList.add('cd-currentUserLink');
      });
  };

  /**
   * _For internal use._ Update the page's HTML and certain configuration values.
   *
   * @param {import('./utils-api').ApiResponseParseContent} parseData
   */
  updatePageContents(parseData) {
    bootManager.$content.children('.mw-parser-output').first().replaceWith(this.$root);

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    mw.util.clearSubtitle?.();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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
   */
  reset() {
    bootManager.cleanUpUrlAndDom();
    this.mutationObserver?.disconnect();
    commentManager.reset();
    sectionManager.reset();
    CommentForm.forgetOnTarget(cd.page, 'addSection');
    this.$emulatedAddTopicButton?.remove();
    delete this.$addTopicButtons;
    this.content = {};
    this.addedCommentCount = 0;
    this.areRelevantCommentsAdded = false;
    this.relevantAddedCommentIds = undefined;
    delete this.dtSubscribableThreads;
    this.updatePageTitle();
  }

  /**
   * Set the page title to use as a base for possible transformations (like adding "Replying on"
   * when there is a reply form and "(1)" when there is 1 new comment).
   *
   * @param {string} title
   */
  updateOriginalPageTitle(title) {
    this.originalPageTitle = title;
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
    const lastActiveCommentForm = commentFormManager.getLastActive();
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
      this.addedCommentCount
        ? `(${this.addedCommentCount}${relevantMark}) `
        : ''
    );
  }

  /**
   * _For internal use._ Check whether the page qualifies to be considered a long page (which
   * affects attempting performance improvements).
   *
   * @returns {boolean}
   */
  isLongPage() {
    this.content.longPage ??= /** @type {number} */ ($(document).height()) > 15_000;

    return this.content.longPage;
  }

  /**
   * Show a copy link dialog.
   *
   * @param {import('./Comment').default|import('./Section').default} object Comment or section to copy a link to.
   * @param {JQuery.TriggeredEvent | MouseEvent | KeyboardEvent} event
   */
  showCopyLinkDialog(object, event) {
    if (bootManager.isPageOverlayOn()) return;

    event.preventDefault();

    const fragment = /** @type {string} */ (object.getUrlFragment());
    const permalinkSpecialPagePrefix =
      mw.config.get('wgFormattedNamespaces')[-1] +
      ':' +
      (
        object instanceof Comment
          ? 'GoToComment/'
          : cd.g.specialPageAliases.PermanentLink[0] +
            '/' +
            String(mw.config.get('wgRevisionId')) +
            '#'
      );

    /** @type {import('./CopyLinkDialog').CopyLinkDialogContent} */
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

      permanentLink: object instanceof Comment
        ? /** @type {import('./Page').default} */ (pageRegistry.get(
            mw.config.get('wgFormattedNamespaces')[-1] + ':' + 'GoToComment/' + fragment
          )).getDecodedUrlWithFragment()
        : object.getUrl(true),
      jsCall: object instanceof Comment
        ? `let c = convenientDiscussions.api.getCommentById('${object.id || ''}');`
        : `let s = convenientDiscussions.api.getSectionById('${object.id || ''}');`,
      jsBreakpoint: `this.id === '${object.id || ''}'`,
      jsBreakpointTimestamp: object instanceof Comment
        ? `timestamp.element.textContent === '${object.timestampText || ''}'`
        : undefined,
    };

    // Undocumented feature allowing to copy a link of a default type without opening a dialog.
    const relevantSetting = object instanceof Comment
      ? settings.get('defaultCommentLinkType')
      : settings.get('defaultSectionLinkType');
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

    const dialog = new CopyLinkDialog(object, content);
    const windowManager = cd.getWindowManager();
    windowManager.addWindows([dialog]);
    windowManager.openWindow(dialog);
  }

  /**
   * Scroll to a specified position vertically.
   *
   * @param {number} y
   * @param {boolean} [smooth]
   * @param {AnyFunction} [callback]
   */
  scrollToY(y, smooth = true, callback = undefined) {
    const onComplete = () => {
      this.toggleAutoScrolling(false);
      this.handleScroll();
      callback?.();
    };

    if (smooth) {
      $('body, html').animate({ scrollTop: y }, {
        complete() {
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
   * state, use {@link PageController#isAutoScrolling}.
   *
   * @param {boolean} value
   */
  toggleAutoScrolling(value) {
    this.autoScrolling = value;
  }

  /**
   * Check whether the viewport is currently automatically scrolled to some position. To set that
   * state, use {@link PageController#toggleAutoScrolling}.
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
      if (
        records.every(
          (record) =>
            record.target instanceof HTMLElement &&
            (
              /^cd-comment(-underlay|-overlay|Layers)/.test(record.target.className) ||

              // Fight infinite loop caused by `el.style.overflow = 'hidden';` in
              // Comment#getAdjustedRects()
              (
                record.target.className.startsWith('cd-comment-part') &&
                record.attributeName === 'style'
              )
            )
        )
      )
        return;

      this.handlePageMutate();
    });
    this.mutationObserver.observe(bootManager.$content[0], {
      attributes: true,
      childList: true,
      subtree: true,
    });
  }

  /**
   * Show a regular notification (`mw.notification`) to the user.
   *
   * @param {import('./updateChecker').CommentWorkerNew[]} comments
   * @private
   */
  showRegularNotification(comments) {
    /** @type {import('./updateChecker').CommentWorkerNew[]} */
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
        commentFormManager.maybeGetFormDataWontBeLostString()
      );
      if (filteredComments.length === 1) {
        const comment = filteredComments[0];
        html = comment.isToMe
          ? cd.sParse(
            'notification-toyou',
            comment.author.getName(),
            comment.author,

            (
              wordSeparator +

              // Where the comment is
              (
                comment.sectionSubscribedTo
                  ? cd.s('notification-part-insection', comment.sectionSubscribedTo.headline)
                  : cd.s('notification-part-onthispage')
              )
            )
          ) +
          wordSeparator +
          rebootHtml
          : cd.sParse(
            'notification-insection',
            comment.author.getName(),
            comment.author,
            /** @type {import('./Section').default} */ (comment.sectionSubscribedTo).headline
          ) +
          wordSeparator +
          rebootHtml;
      } else {
        const section =
        // Is there a common section?
          filteredComments.every(
            (comment) => comment.sectionSubscribedTo === filteredComments[0].sectionSubscribedTo
          )

            ? filteredComments[0].sectionSubscribedTo
            : undefined;

        let mayBeRelevantString = cd.s('notification-newcomments-mayberelevant');
        if (!mayBeRelevantString.startsWith(cd.mws('comma-separator'))) {
          mayBeRelevantString = wordSeparator + mayBeRelevantString;
        }

        html =
          cd.sParse(
            'notification-newcomments',
            filteredComments.length,

            wordSeparator +
            (
            // Where the comments are
              section
                ? cd.s('notification-part-insection', section.headline)
                : cd.s('notification-part-onthispage')
            ),

            // "that may be relevant to you" text is not needed when the section is watched and the
            // user can clearly understand why they are notified.
            section ? '' : mayBeRelevantString
          ) +
          wordSeparator +
          rebootHtml;
      }

      // eslint-disable-next-line no-one-time-vars/no-one-time-vars
      const notification = notifications.add(
        wrapHtml(html),
        { tag: 'cd-newComments' },
        { comments: filteredComments }
      );
      notification.$notification.on('click', () => {
        bootManager.rebootTalkPage({ commentIds: filteredComments.map((comment) => comment.id) });
      });
    }
  }

  /**
   * Show a desktop notification to the user.
   *
   * @param {import('./updateChecker').CommentWorkerNew[]} comments
   * @private
   */
  showDesktopNotification(comments) {
    /** @type {import('./updateChecker').CommentWorkerNew[]} */
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
      body = comment.isToMe
        ? cd.s(
            'notification-toyou-desktop',
            comment.author.getName(),
            comment.author,

            // Where the comment is
            comment.section?.headline
              ? wordSeparator + cd.s('notification-part-insection', comment.section.headline)
              : '',

            currentPageName
          )
        : cd.s(
            'notification-insection-desktop',
            comment.author.getName(),
            comment.author,
            /** @type {import('./updateChecker').SectionWorkerMatched} */ (comment.section).headline,
            currentPageName
          );
    } else {
      const section =
        // Is there a common section?
        filteredComments.every(
          (c) => c.sectionSubscribedTo === filteredComments[0].sectionSubscribedTo
        )

          ? filteredComments[0].sectionSubscribedTo
          : undefined;

      let mayBeRelevantString = cd.s('notification-newcomments-mayberelevant');
      if (!mayBeRelevantString.startsWith(cd.mws('comma-separator'))) {
        mayBeRelevantString = wordSeparator + mayBeRelevantString;
      }

      body = cd.s(
        'notification-newcomments-desktop',
        String(filteredComments.length),

        // Where the comments are
        section
          ? wordSeparator + cd.s('notification-part-insection', section.headline)
          : '',

        currentPageName,

        // "that may be relevant to you" text is not needed when the section is watched and the user
        // can clearly understand why they are notified.
        section ? '' : mayBeRelevantString
      );
    }

    // eslint-disable-next-line no-one-time-vars/no-one-time-vars
    const notification = new Notification(mw.config.get('wgSiteName'), {
      body,

      // We use a tag so that there aren't duplicate notifications when the same page is opened in
      // two tabs. (Seems it doesn't work? :-/)
      tag: 'cd-' + (filteredComments[filteredComments.length - 1].id || ''),
    });
    notification.addEventListener('click', () => {
      parent.focus();

      // Just in case, old browsers. TODO: delete?
      window.focus();

      this.emit('desktopNotificationClick');

      bootManager.rebootTalkPage({
        commentIds: [comment.id],
        closeNotificationsSmoothly: false,
      });
    });
  }

  /**
   * Update the data about added comments (new comments added while the page was idle), update page
   * components accordingly, show notifications.
   *
   * @param {import('./updateChecker').AddedComments} addedComments
   */
  updateAddedComments = ({ all, relevant }) => {
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
  };

  /**
   * Get the IDs of the comments that should be jumped to after rebooting the page.
   *
   * @returns {string[] | undefined}
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
      commentManager.getAll().every((comment) => !comment.willFlashChangedOnSight) &&
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
    this.subscriptionsInstance ??= new (
      settings.get('useTopicSubscription') ? DtSubscriptions : LegacySubscriptions
    )();

    return this.subscriptionsInstance;
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
          !$button.closest(this.$root).length
        ) {
          return false;
        }

        let pageName;
        /** @type {URL | undefined} */
        let url;
        if ($button.is('a')) {
          url = new URL(/** @type {HTMLAnchorElement} */ ($button[0]).href);
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

      .on('click.cd', this.handleAddTopicButtonClick)
      .filter((_, el) => (
        !cd.g.isDtNewTopicToolEnabled &&
        !($(el).is('a') && Number(mw.util.getParamValue('cdaddtopic', $(el).attr('href'))))
      ))
      .attr('title', cd.s('addtopicbutton-tooltip'));

    $('#ca-addsection a').updateTooltipAccessKeys();

    // In case DT's new topic tool is enabled, remove the handler of the "Add topic" button.
    const dtHandler = $._data(document.body, 'events').click?.find(
      (/** @type {JQuery.HandleObject<EventTarget, any>} */ event) =>
        event.selector?.includes('data-mw-comment')
    )?.handler;
    if (dtHandler) {
      $(document.body).off('click', dtHandler);
    }
  }

  /**
   * Get the list of DiscussionTools threads that are related to subscribable (2-level) threads.
   * This is updated on page reboot.
   *
   * @returns {mw.DiscussionToolsHeading[] | undefined}
   */
  getDtSubscribableThreads() {
    const threads = /** @type {mw.DiscussionToolsHeading[] | undefined} */ (
      mw.config.get('wgDiscussionToolsPageThreads')
    );
    this.dtSubscribableThreads ??= threads
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

  /**
   * Get the page's `scroll-padding-top` property as number.
   *
   * @returns {number}
   */
  getBodyScrollPaddingTop() {
    if (this.bodyScrollPaddingTop === undefined) {
      let bodyScrollPaddingTop = Number.parseFloat($('html, body').css('scroll-padding-top')) || 0;

      if (cd.g.skin === 'timeless') {
        bodyScrollPaddingTop -= 5;
      }
      if (cd.g.skin === 'vector-2022') {
        // When jumping to the parent comment that is opening a section, the active section shown in
        // the TOC is wrong. Probably some mechanisms in the scripts or the browser are out of sync.
        bodyScrollPaddingTop -= 1;
      }

      this.bodyScrollPaddingTop = bodyScrollPaddingTop;
    }

    return this.bodyScrollPaddingTop || 0;
  }
}

export { PageController };
export default new PageController();
