/**
 * A singleton that controls the overall state of the page, initiating boot processes and reacting
 * to events.
 *
 * @module controller
 */

import BootProcess from './BootProcess';
import Comment from './Comment';
import CommentForm from './CommentForm';
import LiveTimestamp from './LiveTimestamp';
import Parser from './Parser';
import Section from './Section';
import Thread from './Thread';
import Worker from './worker-gate';
import addCommentLinks from './addCommentLinks';
import cd from './cd';
import debug from './debug';
import init from './init';
import navPanel from './navPanel';
import notifications from './notifications';
import pageNav from './pageNav';
import postponements from './postponements';
import settings from './settings';
import toc from './toc';
import updateChecker from './updateChecker';
import { ElementsTreeWalker } from './treeWalker';
import { brsToNewlines, hideSensitiveCode } from './wikitext';
import {
  copyText,
  defined,
  getExtendedRect,
  getLastArrayElementOrSelf,
  getVisibilityByRects,
  isCmdModifierPressed,
  isInline,
  isInputFocused,
  isProbablyTalkPage,
  keyCombination,
  skin$,
  unhideText,
} from './util';
import { getUserInfo } from './apiWrappers';

export default {
  state: {},
  content: {},
  scrollData: { offset: null },
  document: document.documentElement,
  autoScrolling: false,
  isUpdateThreadLinesHandlerAttached: false,
  lastScrollX: 0,

  /**
   * Assign some properties required by the controller - those which are not known from the
   * beginning.
   */
  setup() {
    this.isPageOverlayOn = this.isPageOverlayOn.bind(this);
    this.reload = this.reload.bind(this);
    this.getRootElement = this.getRootElement.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleWindowResize = this.handleWindowResize.bind(this);
    this.handleGlobalKeyDown = this.handleGlobalKeyDown.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
    this.handlePopState = this.handlePopState.bind(this);
    this.handleSelectionChange = this.handleSelectionChange.bind(this);
    this.handlePageMutations = this.handlePageMutations.bind(this);
    this.handleAddTopicButtonClick = this.handleAddTopicButtonClick.bind(this);
    this.handleWikipageContentHookFirings = this.handleWikipageContentHookFirings.bind(this);

    this.$content ||= $('#mw-content-text');

    if (cd.g.IS_MOBILE) {
      $(document.body).addClass('cd-mobile');
    }

    // Not constants: go() may run a second time, see addFooterLink().
    const isEnabledInQuery = /[?&]cdtalkpage=(1|true|yes|y)(?=&|$)/.test(location.search);
    const isDisabledInQuery = /[?&]cdtalkpage=(0|false|no|n)(?=&|$)/.test(location.search);

    // See controller.isDefinitelyTalkPage
    this.definitelyTalkPage = Boolean(
      isEnabledInQuery ||

      // .cd-talkPage is used as a last resort way to make CD parse the page, as opposed to using
      // the list of supported namespaces and page white/black list in the configuration. With this
      // method, there won't be "comment" links for edits on pages that list revisions such as the
      // watchlist.
      this.$content.find('.cd-talkPage').length ||

      (
        ($('#ca-addsection').length || cd.g.PAGE_WHITELIST_REGEXP?.test(cd.g.PAGE_NAME)) &&
        !cd.g.PAGE_BLACKLIST_REGEXP?.test(cd.g.PAGE_NAME)
      )
    );

    // See controller.isArticlePageTalkPage
    this.articlePageTalkPage = (
      (!mw.config.get('wgIsRedirect') || !this.isCurrentRevision()) &&
      !this.$content.find('.cd-notTalkPage').length &&
      (isProbablyTalkPage(cd.g.PAGE_NAME, cd.g.NAMESPACE_NUMBER) || this.definitelyTalkPage) &&

      // Undocumented setting
      !(typeof cdOnlyRunByFooterLink !== 'undefined' && window.cdOnlyRunByFooterLink)
    );

    // See controller.isDiffPage
    this.diffPage = /[?&]diff=[^&]/.test(location.search);

    this.talkPage = Boolean(
      mw.config.get('wgIsArticle') &&
      !isDisabledInQuery &&
      (isEnabledInQuery || this.articlePageTalkPage)
    );
  },

  /**
   * Reset the controller data and some page mechanisms. (Executed at every page reload.)
   *
   * @param {string} htmlToLayOut HTML to update the page with.
   */
  reset(htmlToLayOut) {
    this.content = {};

    // RevisionSlider replaces the #mw-content-text element.
    if (!this.$content.get(0).parentNode) {
      this.$content = $('#mw-content-text');
    }

    if (htmlToLayOut) {
      const div = document.createElement('div');
      div.innerHTML = htmlToLayOut;
      this.rootElement = div.firstChild;
      this.$root = $(this.rootElement);
    } else {
      this.$root = this.$content.children('.mw-parser-output');

      // 404 pages
      if (!this.$root.length) {
        this.$root = this.$content;
      }

      this.rootElement = this.$root.get(0);
    }

    // Add the class immediately to prevent the issue when any unexpected error prevents this from
    // being executed and then this.handleWikipageContentHookFirings is called with #mw-content-text
    // element for some reason, and the page goes into an infinite reloading loop.
    this.$root.addClass('cd-parse-started');
  },

  /**
   * Set whether the current page is a talk page.
   *
   * @param {boolean} value
   */
  setTalkPageness(value) {
    this.talkPage = Boolean(value);
  },

  /**
   * Check whether the current page is likely a talk page. See
   * {@link module:controller.isDefinitelyTalkPage} for the most strict criteria.
   *
   * @returns {boolean}
   */
  isTalkPage() {
    return this.talkPage;
  },

  /**
   * Check whether the current page is a watchlist or recent changes page.
   *
   * @returns {boolean}
   */
  isWatchlistPage() {
    return ['Recentchanges', 'Watchlist'].includes(mw.config.get('wgCanonicalSpecialPageName'));
  },

  /**
   * Check whether the current page is a contributions page.
   *
   * @returns {boolean}
   */
  isContributionsPage() {
    return mw.config.get('wgCanonicalSpecialPageName') === 'Contributions';
  },

  /**
   * Check whether the current page is a history page.
   *
   * @returns {boolean}
   */
  isHistoryPage() {
    return (
      mw.config.get('wgAction') === 'history' &&
      isProbablyTalkPage(cd.g.PAGE_NAME, cd.g.NAMESPACE_NUMBER)
    );
  },

  /**
   * Check whether the current page is a diff page.
   *
   * This is not a constant: the diff may be removed from the page (and the URL updated, see
   * `controller.cleanUpUrlAndDom`) when it's for the last revision and the page is reloaded
   * using the script. `wgIsArticle` config value is not taken into account: if the "Do not show
   * page content below diffs" MediaWiki setting is on, `wgIsArticle` is false.
   *
   * @returns {boolean}
   */
  isDiffPage() {
    return this.diffPage;
  },

  /**
   * Check whether the current page meets strict criteria for classifying as a talk page. See
   * {@link module:controller.isTalkPage} for approximate criteria.
   *
   * @returns {boolean}
   */
  isDefinitelyTalkPage() {
    return this.definitelyTalkPage;
  },

  /**
   * Check if the _article_ page (the one with `wgIsArticle` being true) of the current page is a
   * talk page eligible for CD. It can be `true` on edit, history pages etc. Although the
   * assessments may be different on a history page and on an article page of the same title, since
   * the page can contain elements with special classes that we can access only on the article page.
   *
   * @returns {boolean}
   */
  isArticlePageTalkPage() {
    return this.articlePageTalkPage;
  },

  /**
   * Check whether the current page exists (is not 404).
   *
   * @returns {boolean}
   */
  doesPageExist() {
    return Boolean(mw.config.get('wgArticleId'));
  },

  /**
   * Check whether the current page is an active talk page: existing, the current revision, not an
   * archive page.
   *
   * This value isn't static:
   *   1. A 404 page doesn't have an ID and is considered inactive, but if the user adds a topic to
   *      it, it will become active and get an ID.
   *   2. The user may switch to another revision using RevisionSlider.
   *   3. On a really rare occasion, an active page may become inactive if it becomes identified as
   *      an archive page. This possibility is currently switched off.
   *
   * @returns {boolean}
   */
  isPageActive() {
    return (
      this.talkPage &&
      this.doesPageExist() &&
      !cd.page.isArchivePage() &&
      this.isCurrentRevision()
    );
  },

  /**
   * Check whether the current page is eligible for submitting comments to.
   *
   * @returns {boolean}
   */
  isPageCommentable() {
    return this.talkPage && (this.isPageActive() || !this.doesPageExist());
  },

  /**
   * Set whether the viewport is currently automatically scrolled to some position.
   *
   * @param {boolean} value
   */
  toggleAutoScrolling(value) {
    this.autoScrolling = Boolean(value);
  },

  /**
   * Check whether the viewport is currently automatically scrolled to some position.
   *
   * @returns {boolean}
   */
  isAutoScrolling() {
    return this.autoScrolling;
  },

  /**
   * Memorize the section button container element.
   *
   * @param {external:jQuery} $container
   */
  setAddSectionButtonContainer($container) {
    this.$addSectionButtonContainer = $container;
  },

  /**
   * Memorize the active autocomplete menu element.
   *
   * @param {Element} menuElement
   */
  setActiveAutocompleteMenu(menuElement) {
    this.activeAutocompleteMenu = menuElement;
  },

  /**
   * Get the active autocomplete menu element.
   *
   * @returns {Element}
   */
  getActiveAutocompleteMenu() {
    return this.activeAutocompleteMenu;
  },

  /**
   * Forget the active autocomplete menu element (after it was deactivated).
   */
  forgetActiveAutocompleteMenu() {
    delete this.activeAutocompleteMenu;
  },

  /**
   * Get the sticky header element, if present.
   *
   * @returns {?Element}
   */
  getStickyHeader() {
    if (this.stickyHeader === undefined) {
      this.stickyHeader = $('#vector-sticky-header').get(0) || null;
    }
    return this.stickyHeader;
  },

  /**
   * Create an OOUI window manager or return an existing one.
   *
   * @param {string} [name='default'] Name of the window manager. We may need more than one if we,
   *   for some reason, want to have more than one window open at any moment.
   * @returns {external:OO.ui.WindowManager}
   */
  getWindowManager(name = 'default') {
    this.windowManagers ||= {};

    if (!this.windowManagers[name]) {
      this.windowManagers[name] = new OO.ui.WindowManager().on('closing', async (win, closed) => {
        // We don't have windows that can be reused.
        await closed;
        this.windowManagers[name].clearWindows();
      });

      $(document.body).append(this.windowManagers[name].$element);
    }

    return this.windowManagers[name];
  },

  /**
   * @class Api
   * @see https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.Api
   * @memberof external:mw
   */

  /**
   * Get a
   * {@link https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.Api mw.Api} instance.
   *
   * @returns {external:mw.Api}
   */
  getApi() {
    if (!this.api) {
      this.api = new mw.Api({
        parameters: {
          formatversion: 2,
          uselang: cd.g.USER_LANGUAGE,
        },
        ajax: {
          headers: {
            'Api-User-Agent': 'c:User:Jack who built the house/Convenient Discussions',
          },
        },
      });
    }

    return this.api;
  },

  /**
   * Get the worker object.
   *
   * @returns {Worker}
   */
  getWorker() {
    if (!this.worker) {
      this.worker = new Worker();
    }

    return this.worker;
  },

  /**
   * Get the offset data related to `controller.$contentColumn`.
   *
   * @param {boolean} reset Whether to bypass cache.
   * @returns {object}
   */
  getContentColumnOffsets(reset) {
    if (!this.contentColumnOffsets || reset) {
      const prop = cd.g.CONTENT_TEXT_DIRECTION === 'ltr' ? 'padding-left' : 'padding-right';
      let startMargin = Math.max(parseFloat(this.$contentColumn.css(prop)), cd.g.CONTENT_FONT_SIZE);

      // The content column in Timeless has no _borders_ as such, so it's wrong to penetrate the
      // surrounding area from the design point of view.
      if (cd.g.SKIN === 'timeless') {
        startMargin--;
      }

      const left = this.$contentColumn.offset().left;
      const width = this.$contentColumn.outerWidth();
      this.contentColumnOffsets = {
        startMargin,
        start: cd.g.CONTENT_TEXT_DIRECTION === 'ltr' ? left : left + width,
        end: cd.g.CONTENT_TEXT_DIRECTION === 'ltr' ? left + width : left,
      };

      // This is set only on window resize event. The initial value is set in init.addTalkPageCss()
      // through a style tag.
      if (reset) {
        $(this.document).css('--cd-content-start-margin', startMargin + 'px');
      }
    }

    return this.contentColumnOffsets;
  },

  /**
   * Is the displayed revision the current (last known) revision of the page.
   *
   * @returns {boolean}
   */
  isCurrentRevision() {
    // RevisionSlider may show a revision newer than the revision in `wgCurRevisionId` (when
    // navigating forward, at least twice, from a revision older than the revision in
    // `wgCurRevisionId` after some revisions were added). Unfortunately, it doesn't update the
    // `wgCurRevisionId` value.
    return mw.config.get('wgRevisionId') >= mw.config.get('wgCurRevisionId');
  },

  /**
   * Save the scroll position relative to the first element in the viewport looking from the top of
   * the page.
   *
   * @param {?object} [switchToAbsolute=null] If an object with the `saveTocHeight` property and the
   *   viewport is above the bottom of the table of contents, then use
   *   {@link module:controller.saveScrollPosition} (this allows for better precision).
   */
  saveRelativeScrollPosition(switchToAbsolute = null) {
    // Look for a cached value to avoid reflow.
    const scrollY = this.bootProcess.data('scrollY') || window.scrollY;

    // The viewport has the TOC bottom or is above it.
    if (
      switchToAbsolute &&
      !toc.isInSidebar() &&
      toc.isPresent() &&
      scrollY < toc.getBottomOffset()
    ) {
      this.saveScrollPosition(switchToAbsolute.saveTocHeight);
    } else {
      this.scrollData.element = null;
      this.scrollData.elementTop = null;
      this.scrollData.touchesBottom = false;
      this.scrollData.offsetBottom = this.document.scrollHeight - (scrollY + window.innerHeight);

      // The number 100 accounts for various content moves by scripts running on the page (like
      // HotCat that may add an empty category list).
      if (this.scrollData.offsetBottom < 100) {
        this.scrollData.touchesBottom = true;
      } else if (
        scrollY !== 0 &&
        this.rootElement.getBoundingClientRect().top <= cd.g.BODY_SCROLL_PADDING_TOP
      ) {
        const treeWalker = new ElementsTreeWalker(
          this.rootElement.firstElementChild,
          this.rootElement
        );
        while (true) {
          const node = treeWalker.currentNode;

          if (!isInline(node) && !this.getFloatingElements().includes(node)) {
            const rect = node.getBoundingClientRect();

            // By default, in a conversation between two people, replies are nested and there is no
            // way to isolate the parent comment from the child, which would be desirable to find a
            // good reference element. To work around this, we resort to this line, which stops the
            // search at the first element fully below the viewport top (if there is a reference
            // element already). Its shortcoming is that if 1) the only element we met with its
            // bottom below the viewport top is too large to be used as a reference, 2) the first
            // element small enough has its top below the viewport (i.e., there is a gap between it
            // and the previous element that has the viewport top right in the middle) - we end up
            // without a convenient reference element. To compensate for this, we use an offset of
            // cd.g.CONTENT_FONT_SIZE (we're unlikely to see a bigger gap between elements).
            if (
              rect.top > cd.g.BODY_SCROLL_PADDING_TOP + cd.g.CONTENT_FONT_SIZE &&
              this.scrollData.element
            ) {
              break;
            }

            if (rect.height !== 0 && rect.bottom >= cd.g.BODY_SCROLL_PADDING_TOP) {
              this.scrollData.element = node;
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
  },

  /**
   * Restore the scroll position saved in {@link module:controller.saveRelativeScrollPosition}.
   *
   * @param {boolean} [switchToAbsolute=false] Restore the absolute position using
   *   {@link module:controller.restoreScrollPosition} if
   *   {@link module:controller.saveScrollPosition} was previously used for saving the position.
   */
  restoreRelativeScrollPosition(switchToAbsolute = false) {
    if (switchToAbsolute && this.scrollData.offset !== null) {
      this.restoreScrollPosition();
    } else {
      if (this.scrollData.touchesBottom && window.scrollY !== 0) {
        const y = this.document.scrollHeight - window.innerHeight - this.scrollData.offsetBottom;
        window.scrollTo(0, y);
      } else if (this.scrollData.element) {
        const rect = this.scrollData.element.getBoundingClientRect();
        if (getVisibilityByRects(rect)) {
          window.scrollTo(0, window.scrollY + rect.top - this.scrollData.elementTop);
        } else {
          // In a collapsed thread?
          const closestHidden = this.scrollData.element.closest('.cd-hidden');
          if (closestHidden) {
            cd.comments
              .map((comment) => comment.thread)
              .filter(defined)
              .filter((thread) => thread.isCollapsed)
              .find((thread) => thread.collapsedRange.includes(closestHidden))
              ?.$expandNote
              .cdScrollTo('top', false);
          }
        }
      }
    }
  },

  /**
   * _For internal use._ Replace the element used for restoring saved relative scroll position with
   * a new element if it coincides with the provided element.
   *
   * @param {Element} element
   * @param {Element} newElement
   * @private
   */
  replaceScrollAnchorElement(element, newElement) {
    if (this.scrollData.element && element === this.scrollData.element) {
      this.scrollData.element = newElement;
    }
  },

  /**
   * Save the scroll position to restore it later with
   * {@link module:controller.restoreScrollPosition}.
   *
   * @param {boolean} [saveTocHeight=true] `false` is used for more fine control of scroll behavior
   *   when visits are loaded after a page reload.
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
  },

  /**
   * Restore the scroll position saved in {@link module:controller.saveScrollPosition}.
   *
   * @param {boolean} [resetTocHeight=true] `false` is used for more fine control of scroll behavior
   *   after page reloads.
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
  },

  /**
   * Find closed discussions on the page.
   *
   * @returns {Element[]}
   */
  getClosedDiscussions() {
    if (!this.content.closedDiscussions) {
      const closedDiscussionsSelector = cd.config.closedDiscussionClasses
        .map((name) => `.${name}`)
        .join(', ');
      this.content.closedDiscussions = this.$root.find(closedDiscussionsSelector).get();
    }

    return this.content.closedDiscussions;
  },

  /**
   * Check whether there is at least one outdent template on the page. (If there is no, we don't
   * need to run many expensive operations.)
   *
   * @returns {boolean}
   */
  areThereOutdents() {
    this.content.areThereOutdents ??= Boolean(this.$root.find('.' + cd.config.outdentClass).length);
    return this.content.areThereOutdents;
  },

  /**
   * Extract and memorize the classes mentioned in the TemplateStyles tags on the page.
   *
   * @private
   */
  extractTemplateStylesSelectors() {
    this.content.tsSelectorsFloating = [];
    this.content.tsSelectorsHidden = [];
    const filterRules = (rule) => {
      if (rule instanceof CSSStyleRule) {
        const style = rule.style;
        if (style.float === 'left' || style.float === 'right') {
          this.content.tsSelectorsFloating.push(rule.selectorText);
        }
        if (style.display === 'none') {
          this.content.tsSelectorsHidden.push(rule.selectorText);
        }
      } else if (rule instanceof CSSMediaRule) {
        [...rule.cssRules].forEach(filterRules);
      }
    };
    [...document.styleSheets]
      .filter((sheet) => sheet.href?.includes('site.styles'))
      .forEach((el) => {
        [...el.cssRules].forEach(filterRules);
      });
    [...this.rootElement.querySelectorAll('style')].forEach((el) => {
      [...el.sheet.cssRules].forEach(filterRules);
    });
  },

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

    return this.content.tsSelectorsFloating;
  },

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

    return this.content.tsSelectorsHidden;
  },

  /**
   * Find floating elements on the page.
   *
   * @returns {Element[]}
   */
  getFloatingElements() {
    if (!this.content.floatingElements) {
      // Describe all floating elements on the page in order to calculate the correct border
      // (temporarily setting "overflow: hidden") for all comments that they intersect with.
      const floatingElementSelector = [
        ...cd.g.FLOATING_ELEMENT_SELECTORS,
        ...this.getTsFloatingElementSelectors(),
      ].join(', ');

      // Can't use jQuery here anyway, as .find() doesn't take into account ancestor elements, such
      // as .mw-parser-output, in selectors. Remove all known elements that never intersect comments
      // from the collection.
      this.content.floatingElements = [
        ...this.rootElement.querySelectorAll(floatingElementSelector)
      ].filter((el) => !el.classList.contains('cd-ignoreFloating'));
    }

    return this.content.floatingElements;
  },

  /**
   * Find floating and hidden (`display: none`) elements on the page.
   *
   * @returns {Element[]}
   */
  getHiddenElements() {
    if (!this.hiddenElements) {
      const hiddenElementSelector = this.getTsHiddenElementSelectors().join(', ');
      this.hiddenElements = hiddenElementSelector ?
        [...this.rootElement.querySelectorAll(hiddenElementSelector)] :
        [];
    }

    return this.hiddenElements;
  },

  /**
   * Check whether there is "LTR inside RTL" or "RTL inside LTR" nesting on the page.
   *
   * @returns {boolean}
   */
  areThereLtrRtlMixes() {
    this.content.areThereLtrRtlMixes ??= Boolean(
      document.querySelector('.sitedir-ltr .mw-content-rtl, .sitedir-rtl .mw-content-ltr')
    );
    return this.content.areThereLtrRtlMixes;
  },

  /**
   * Get the popup overlay used for OOUI components.
   *
   * @returns {external:jQuery}
   */
  getPopupOverlay() {
    this.$popupOverlay ??= $('<div>')
      .addClass('cd-popupOverlay')
      .appendTo(document.body);
    return this.$popupOverlay;
  },

  /**
   * Add a condition preventing page unload.
   *
   * @param {string} name
   * @param {Function} condition
   */
  addPreventUnloadCondition(name, condition) {
    if (!this.beforeUnloadHandlers) {
      this.beforeUnloadHandlers = {};
    }
    this.beforeUnloadHandlers[name] = (e) => {
      if (condition()) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    $(window).on('beforeunload', this.beforeUnloadHandlers[name]);
  },

  /**
   * Remove a condition preventing page unload.
   *
   * @param {string} name
   */
  removePreventUnloadCondition(name) {
    if (this.beforeUnloadHandlers[name]) {
      $(window).off('beforeunload', this.beforeUnloadHandlers[name]);
      delete this.beforeUnloadHandlers[name];
    }
  },

  /**
   * _For internal use._ Handle a mouse move event (including `mousemove` and `mouseover`).
   *
   * @param {Event} e
   */
  handleMouseMove(e) {
    if (postponements.is('scroll') || this.isAutoScrolling() || this.isPageOverlayOn()) return;

    // Don't throttle. Without throttling performance is generally OK, while the "frame rate" is
    // about 50 (so, the reaction time is about 20ms). Lower values which should be less
    // comfortable.
    Comment.highlightHovered(e);
  },

  /**
   * _For internal use._ Handles the window `resize` event as well as `orientationchange`.
   */
  handleWindowResize() {
    // setTimeout, because it seems like sometimes it doesn't have time to update.
    setTimeout(() => {
      this.getContentColumnOffsets(true);
      Comment.redrawLayersIfNecessary(true);
      Thread.updateLines();
      pageNav.updateWidth();
      CommentForm.adjustLabels();
      this.handleScroll();
    }, cd.g.SKIN === 'vector-2022' ? 100 : 0);
  },

  /**
   * _For internal use._ Handles the document `keydown` event.
   *
   * @param {Event} e
   */
  handleGlobalKeyDown(e) {
    if (this.isPageOverlayOn()) return;

    if (
      // Ctrl+Alt+Q
      keyCombination(e, 81, ['cmd', 'alt']) ||

      // Q
      (keyCombination(e, 81) && !isInputFocused())
    ) {
      const lastActiveCommentForm = CommentForm.getLastActive();
      if (lastActiveCommentForm) {
        e.preventDefault();
        lastActiveCommentForm.quote(isCmdModifierPressed(e));
      } else {
        const comment = Comment.getSelectedComment();
        if (comment?.isActionable) {
          e.preventDefault();
          comment.reply();
        }
      }
    }

    if (navPanel.isMounted()) {
      // R
      if (keyCombination(e, 82) && !isInputFocused()) {
        navPanel.refreshClick();
      }

      // W
      if (keyCombination(e, 87) && !isInputFocused()) {
        navPanel.goToPreviousNewComment();
      }

      // S
      if (keyCombination(e, 83) && !isInputFocused()) {
        navPanel.goToNextNewComment();
      }

      // F
      if (keyCombination(e, 70) && !isInputFocused()) {
        navPanel.goToFirstUnseenComment();
      }

      // C
      if (keyCombination(e, 67) && !isInputFocused()) {
        e.preventDefault();
        navPanel.goToNextCommentForm(true);
      }
    }
  },

  /**
   * _For internal use._ Handle a document's `scroll` event: Register seen comments, update the
   * navigation panel's first unseen button, and update the current section block. Trigger the
   * `horizontalscroll` event.
   */
  handleScroll() {
    // Scroll will be handled when the autoscroll is finished.
    if (this.isAutoScrolling()) return;

    const actuallyHandle = () => {
      if (this.isAutoScrolling()) return;

      if (this.isPageActive()) {
        Comment.registerSeen();
        navPanel.updateCommentFormButton();
      }
      pageNav.update();
    };

    // Don't run this more than once in some period, otherwise scrolling may be slowed down. Also,
    // wait before running, otherwise comments may be registered as seen after a press of Page
    // Down/Page Up. One scroll in Chrome, Firefox with Page Up/Page Down takes a little less than
    // 200ms, but 200ms proved to be not enough, so we try 300ms.
    postponements.add('scroll', actuallyHandle, 300);

    if (window.scrollX !== this.lastScrollX) {
      $(document).trigger('horizontalscroll.cd');
    }
    this.lastScrollX = window.scrollX;

    if (settings.get('improvePerformance') && this.isLongPage()) {
      Section.updateVisibility();
    }
  },

  /**
   * _For internal use._ Handle a `horizontalscroll` event, triggered from
   * {@link module:controller.handleScroll}.
   */
  handleHorizontalScroll() {
    pageNav.updateWidth();
  },

  /**
   * _For internal use._ Handle a `popstate` event, including clicks on links pointing to comment
   * anchors.
   */
  handlePopState() {
    let fragment = location.hash.slice(1);
    if (Comment.isAnyId(fragment)) {
      // Don't jump to the comment if the user pressed Back/Forward in the browser or if
      // history.pushState() is called from Comment#scrollTo() (after clicks on added (gray) items
      // in the TOC). A marginal state of this happening is when a page with a comment ID in the
      // fragment is opened and then a link with the same fragment is clicked.
      if (history.state?.cdJumpedToComment) return;

      try {
        fragment = decodeURIComponent(fragment);
      } catch (e) {
        console.error(e);
        return;
      }
      Comment.getByAnyId(fragment, true)?.scrollTo();
    }

    // Make sure the title has no incorrect new comment count when the user presses the Back button
    // after a page reload.
    updateChecker.updatePageTitle();
  },

  /**
   * _For internal use._ Handle a `selectionChange` event.
   */
  handleSelectionChange() {
    postponements.add('selectionChange', Comment.getSelectedComment.bind(Comment), 200);
  },

  /**
   * _For internal use._ Handle page (content area) mutations.
   */
  handlePageMutations() {
    if (this.booting) return;

    const floatingRects = this.getFloatingElements().map(getExtendedRect);

    Comment.redrawLayersIfNecessary(false, false, floatingRects);

    const updateThreadLines = () => {
      Thread.updateLines(floatingRects);
      $(document).off('mousemove', updateThreadLines);
      this.isUpdateThreadLinesHandlerAttached = false;
    };

    if (!this.isUpdateThreadLinesHandlerAttached && settings.get('enableThreads')) {
      // Update only on mouse move to prevent short freezings of a page when there is a
      // comment form in the beginning of a very long page and the input is changed so that
      // everything below the form shifts vertically.
      $(document).on('mousemove', updateThreadLines);
      this.isUpdateThreadLinesHandlerAttached = true;
    }

    // Could also run handleScroll() here, but not sure, as it will double the execution
    // time with rare effect.
  },

  /**
   * Handle a click on an "Add topic" button.
   *
   * @param {Event} e
   */
  handleAddTopicButtonClick(e) {
    if (e.ctrlKey || e.shiftKey || e.metaKey) return;

    const $button = $(e.currentTarget);
    let preloadConfig;
    let newTopicOnTop = false;
    if ($button.is('a')) {
      const href = $button.attr('href');
      let query;

      // May crash if the URL contains undecodable "%" in the fragment.
      try {
        ({ query } = new mw.Uri(href));
      } catch {
        return;
      }
      preloadConfig = {
        editIntro: getLastArrayElementOrSelf(query.editintro),
        commentTemplate: getLastArrayElementOrSelf(query.preload),
        headline: getLastArrayElementOrSelf(query.preloadtitle),
        summary: getLastArrayElementOrSelf(query.summary)?.replace(/^.+?\*\/ */, ''),
        noHeadline: Boolean(getLastArrayElementOrSelf(query.nosummary)),
        omitSignature: Boolean(query.cdomitsignature),
      };
      newTopicOnTop = getLastArrayElementOrSelf(query.section) === '0';
    } else {
      // <input>
      const $form = $button.closest('form');
      preloadConfig = {
        editIntro: $form.find('input[name="editintro"]').val(),
        commentTemplate: $form.find('input[name="preload"]').val(),
        headline: $form.find('input[name="preloadtitle"]').val(),
        summary: $form.find('input[name="summary"]').val(),
        noHeadline: Boolean($form.find('input[name="nosummary"]').val()),
        omitSignature: false,
      };
    }

    e.preventDefault();
    CommentForm.createAddSectionForm(preloadConfig, newTopicOnTop);
  },

  /**
   * Is the page loading (the loading overlay is on).
   *
   * @returns {boolean}
   */
  isBooting() {
    return this.booting;
  },

  /**
   * Is there any kind of a page overlay present, like the OOUI modal overlay or CD loading overlay.
   * This runs very frequently.
   *
   * @returns {boolean}
   */
  isPageOverlayOn() {
    return document.body.classList.contains('oo-ui-windowManager-modal-active') || this.booting;
  },

  /**
   * Check if the `showLoadingOverlay` setting is off. We create a separate function for this
   * because this check has to be performed before the settings object is filled.
   *
   * @returns {boolean}
   * @private
   */
  isShowLoadingOverlaySettingOff() {
    return window.cdShowLoadingOverlay !== undefined && window.cdShowLoadingOverlay === false;
  },

  /**
   * Show the loading overlay (a logo in the corner of the page).
   *
   * @private
   */
  showLoadingOverlay() {
    if (this.isShowLoadingOverlaySettingOff()) return;

    if (!this.$loadingPopup) {
      this.$loadingPopup = $('<div>').addClass('cd-loadingPopup');
      const $logo = $('<div>')
        .addClass('cd-loadingPopup-logo')
        .appendTo(this.$loadingPopup);
      $('<div>')
        .addClass('cd-loadingPopup-logo-partBackground')
        .appendTo($logo);
      $('<img>')
        .attr('src', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADcAAAA3CAYAAACo29JGAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAewQAAHsEBw2lUUwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAK7SURBVGiB3Zq/axRBFMc/60VioQgW1yjEiwa0tdXiCkH9AwLaKCLY+Aek9CxUbGw9/wMbrYQgCIrEpEgUAimNmCAqapWAGL2wFrPr7R374739kZ3ZL7ziuHlv3mdndufN7MJQHaAPbAIDwK/ZBkEufeA4BXQB2LIAKMm2ghzV6lgOFgXsaOEeW5C41PpauE0LkpbahgbMw9y4LY1TjdoFJqSNPcwVcUmetOE+ZeA/wAqwhBnxvPoBvAY+FoghknS+vwNORPymgVWFf2h3gf1BDA+4Buwo/EuH+x3AjGsG+KtI7HlCDvfqhFtK8V9RJHY9IcaZKuCk99xOyn+aDtPiaNVlCJxYqkmn5bGYDk6iq0OfJSR6XxEjDi5qI6WaNOgyMBUJnveB0mN0rbqK7r7NggsBOxq4cAQXgQWK7Ry+Ai+BDzl8JXA+QamWN8G6TAq3oV3EXdLRJsO1pEXoe2C9ykyAi8ChsoNK5vmLsjsd02lMxV/mPecjDOgDZ6tj46kij1BdSVtp0E/AkQrAbipyqAzOB9YYXciL6gZmG2UFnA/8BG4x3Lbk0TS6qbhncKF9Ax4Cl4DDGTAecAozUvMUq27EcGUeM3wHvmBG1g+AJoE2ZiofKKmf8JihC7xKayg+bBGoHZg1cq1C2dU0dg3us6axa3DzmsYuwW0DDyK/J7McXIHbBmYxVVKoGYlj3vWmahtg3g08Iv793BtBDHFnPcmV2iNdQbjguwj2C0HekkX8DkO482VnKtQE5ij/MnBO45hGf1vR1kYTgzUGrhcDBnZ85VAILgkMzKO57oRzw6WBgTnFrTvhXHBZYGAWUxc+6xiBk4CFsv2DnP/WwuxsNXDrwBPMzroNHMSdGtV6zaGYli5KCuisJIBOKwvQeaUBNkJJgI1RHGCjNA7YOEUBG6k5gvKriXoLeP8AAFe0oEsY7eMAAAAASUVORK5CYII=')
        .appendTo($logo);
      $(document.body).append(this.$loadingPopup);
    } else {
      this.$loadingPopup.show();
    }
  },

  /**
   * Hide the loading overlay.
   *
   * @private
   */
  hideLoadingOverlay() {
    if (!this.$loadingPopup || this.isShowLoadingOverlaySettingOff()) return;

    this.$loadingPopup.hide();
  },

  /**
   * Run the {@link BootProcess boot process} and catch errors.
   *
   * @param {boolean} isReload Is the page reloaded.
   * @private
   */
  async tryExecuteBootProcess(isReload) {
    this.booting = true;

    // We could say "let it crash", but, well, unforeseen errors in BootProcess#execute() are just
    // too likely to go without a safeguard.
    try {
      await this.bootProcess.execute(isReload);
      if (isReload) {
        mw.hook('wikipage.content').fire(this.$content);
      }
    } catch (e) {
      mw.notify(cd.s('error-processpage'), { type: 'error' });
      console.error(e);
      this.hideLoadingOverlay();
    }

    this.booting = false;
  },

  /**
   * Get the current (or last available) boot process.
   *
   * @returns {BootProcess}
   */
  getBootProcess() {
    return this.bootProcess;
  },

  /**
   * Load the data required for the script to run on a talk page and, respectively, execute the
   * {@link BootProcess boot process}.
   */
  loadToTalkPage() {
    if (!this.talkPage) return;

    debug.stopTimer('start');
    debug.startTimer('loading data');

    this.bootProcess = new BootProcess();

    // Make some requests in advance if the API module is ready in order not to make 2 requests
    // sequentially. We don't make a userinfo request, because if there is more than one tab in
    // the background, this request is made and the execution stops at mw.loader.using, which
    // results in overriding the renewed visits setting of one tab by another tab (the visits are
    // loaded by one tab, then another tab, then written by one tab, then by another tab).
    if (mw.loader.getState('mediawiki.api') === 'ready') {
      init.getSiteData();

      // We are _not_ calling getUserInfo() here to avoid losing visits data updates from some
      // pages if more than one page is opened simultaneously. In this situation, visits could be
      // requested for multiple pages; updated and then saved for each of them with losing the
      // updates from the rest.
    }

    const modules = [
      'jquery.client',
      'jquery.ui',
      'mediawiki.Title',
      'mediawiki.Uri',
      'mediawiki.api',
      'mediawiki.cookie',
      'mediawiki.interface.helpers.styles',
      'mediawiki.jqueryMsg',
      'mediawiki.notification',
      'mediawiki.storage',
      'mediawiki.user',
      'mediawiki.util',
      'mediawiki.widgets.visibleLengthLimit',
      'oojs',
      'oojs-ui-core',
      'oojs-ui-widgets',
      'oojs-ui-windows',
      'oojs-ui.styles.icons-alerts',
      'oojs-ui.styles.icons-content',
      'oojs-ui.styles.icons-editing-core',
      'oojs-ui.styles.icons-interactions',
      'oojs-ui.styles.icons-movement',
      'user.options',
    ];

    // mw.loader.using delays execution even if all modules are ready (if CD is used as a gadget
    // with preloaded dependencies, for example), so we use this trick.
    let modulesRequest;
    if (modules.every((module) => mw.loader.getState(module) === 'ready')) {
      // If there is no data to load and, therefore, no period of time within which a reflow
      // (layout thrashing) could happen without impeding performance, we cache the value so that
      // it could be used in controller.saveRelativeScrollPosition without causing a reflow.
      if (init.getSiteDataRequests().every((request) => request.state() === 'resolved')) {
        this.bootProcess.passData('scrollY', window.scrollY);
      }
    } else {
      modulesRequest = mw.loader.using(modules);
    }

    this.showLoadingOverlay();
    Promise.all([modulesRequest, ...init.getSiteDataRequests()]).then(
      () => {
        this.tryExecuteBootProcess();
      },
      (e) => {
        mw.notify(cd.s('error-loaddata'), { type: 'error' });
        console.error(e);
        this.hideLoadingOverlay();
      }
    );

    // https://phabricator.wikimedia.org/T68598 "mw.loader state of module stuck at "loading" if
    // request was aborted"
    setTimeout(() => {
      if (this.booting) {
        this.hideLoadingOverlay();
        console.warn('The loading overlay stays for more than 15 seconds; removing it.');
      }
    }, 15000);

    this.$contentColumn = skin$({
      timeless: '#mw-content',
      minerva: '#bodyContent',
      default: '#content',
    });

    /*
      Additions of CSS set a stage for a future reflow which delays operations dependent on
      rendering, so we run them now, not after the requests are fulfilled, to save time. The overall
      order is like this:
      1. Make network requests (above).
      2. Run operations dependent on rendering, such as window.getComputedStyle() and jQuery's
         .css() (below). Normally they would initiate a reflow, but, as we haven't changed the
         layout or added CSS yet, there is nothing to update.
      3. Run operations that create prerequisites for a reflow, such as adding CSS. Thanks to the
         fact that the network requests, if any, are already pending, we don't lose time.
     */
    init.memorizeCssValues();
    init.addTalkPageCss();
  },

  /**
   * Reload the page via Ajax.
   *
   * @param {import('./BootProcess').PassedData} [passedData={}] Data passed from the previous page
   *   state. See {@link PassedData} for the list of possible properties. `html`, `unseenCommentIds`
   *   properties are set in this function.
   * @throws {import('./CdError').default|Error}
   */
  async reload(passedData = {}) {
    if (this.booting) return;

    const bootProcess = new BootProcess(passedData);

    // We reset the live timestamps only during the boot process, because we shouldn't dismount the
    // components of the current version of the page at least until a correct response to the parse
    // request is received. Otherwise, if the request fails, the user would be left with a
    // dysfunctional page.

    // Stop all animations, clear all timeouts.
    cd.comments.forEach((comment) => {
      comment.$animatedBackground?.add(comment.$marker).stop(true, true);
    });

    // If the page is reloaded externally, its content is already replaced, so we won't break
    // anything if we remove the layers containers. And we better do so to avoid comment layers
    // hanging around without their owner comments.
    if (bootProcess.data('isPageReloadedExternally')) {
      Comment.resetLayers();
    }

    // A check in light of the existence of RevisionSlider.
    if (this.isCurrentRevision()) {
      // In case checkboxes were changed programmatically.
      CommentForm.saveSession();
    }

    if (!bootProcess.data('commentIds') && !bootProcess.data('sectionId')) {
      this.saveScrollPosition();
    }

    notifications.close(bootProcess.data('closeNotificationsSmoothly') ?? true);

    debug.init();
    debug.startTimer('total time');
    debug.startTimer('getting HTML');

    this.showLoadingOverlay();

    // Save time by requesting the options in advance.
    getUserInfo().catch((e) => {
      console.warn(e);
    });

    let parseData;
    try {
      parseData = await cd.page.parse(null, false, true);
    } catch (e) {
      this.hideLoadingOverlay();
      if (bootProcess.data('wasCommentFormSubmitted')) {
        throw e;
      } else {
        mw.notify(cd.s('error-reloadpage'), { type: 'error' });
        console.warn(e);
        return;
      }
    }

    bootProcess.passData('html', parseData.text);
    bootProcess.passData('toc', parseData.sections);
    bootProcess.passData('hideToc', parseData.hidetoc);
    mw.config.set({
      wgRevisionId: parseData.revid,
      wgCurRevisionId: parseData.revid,
    });
    mw.loader.load(parseData.modules);
    mw.loader.load(parseData.modulestyles);
    mw.config.set(parseData.jsconfigvars);

    // Get IDs of unseen comments. This is used to arrange that they will still be there after
    // replying on or refreshing the page.
    const unseenCommentIds = cd.comments
      .filter((comment) => comment.isSeen === false)
      .map((comment) => comment.id);
    bootProcess.passData('unseenCommentIds', unseenCommentIds);

    // At this point, the boot process can't be interrupted, so we can remove all traces of the
    // current page state.
    this.bootProcess = bootProcess;

    CommentForm.detach();
    this.cleanUpUrlAndDom();
    LiveTimestamp.reset();
    this.mutationObserver?.disconnect();

    debug.stopTimer('getting HTML');

    await this.tryExecuteBootProcess(true);

    toc.possiblyHide();

    if (!this.bootProcess.data('commentIds') && !this.bootProcess.data('sectionId')) {
      this.restoreScrollPosition(false);
    }
  },

  /**
   * _For internal use._ Handle firings of the hook `'wikipage.content'` (by using
   * `mw.hook('wikipage.content').fire()`). This is performed by some user scripts, such as
   * QuickEdit.
   *
   * @param {external:jQuery} $content
   */
  handleWikipageContentHookFirings($content) {
    if (!$content.is('#mw-content-text')) return;

    const $root = $content.children('.mw-parser-output');
    if ($root.length && !$root.hasClass('cd-parse-started')) {
      this.reload({ isPageReloadedExternally: true });
    }
  },

  /**
   * Remove diff-related DOM elements and the added comment count from the title.
   *
   * @param {object} query
   * @private
   */
  cleanUpDom(query) {
    if (query.diff || query.oldid) {
      // Diff pages
      this.$content
        .children('.mw-revslider-container, .ve-init-mw-diffPage-diffMode, .diff, .oo-ui-element-hidden, .diff-hr, .diff-currentversion-title')
        .remove();

      // Revision navigation
      $('.mw-revision').remove();

      $('#firstHeading').text(cd.page.name);
      document.title = cd.mws('pagetitle', cd.page.name);
    } else {
      updateChecker.updatePageTitle(0, false);
    }
  },

  /**
   * Remove fragment and revision parameters from the URL.
   *
   * @param {object} query
   * @private
   */
  cleanUpUrl(query) {
    const newQuery = Object.assign({}, query);

    // Added automatically (after /wiki/ if possible, as a query parameter otherwise).
    delete newQuery.title;

    delete newQuery.curid;
    delete newQuery.action;
    delete newQuery.redlink;
    delete newQuery.section;
    delete newQuery.cdaddtopic;

    let methodName;
    if (newQuery.diff || newQuery.oldid) {
      methodName = 'pushState';

      delete newQuery.diff;
      delete newQuery.oldid;
      delete newQuery.diffmode;
      delete newQuery.type;

      // Make the "Back" browser button work.
      $(window).on('popstate', () => {
        const { query } = new mw.Uri();
        if (query.diff || query.oldid) {
          location.reload();
        }
      });

      this.diffPage = false;
    } else if (!this.bootProcess.data('pushState')) {
      // Don't reset the fragment if it will be set in the boot process from a comment ID or a
      // section ID, to avoid creating an extra history entry.
      methodName = 'replaceState';
    }

    if (methodName) {
      history[methodName](history.state, '', cd.page.getUrl(newQuery));
    }
  },

  /**
   * Remove fragment and revision parameters from the URL, remove DOM elements related to the diff.
   */
  cleanUpUrlAndDom() {
    const { query } = new mw.Uri();
    this.cleanUpDom(query);
    this.cleanUpUrl(query);
  },

  /**
   * Load the data required for the script to process the page as a log page and
   * {@link module:addCommentLinks process it}.
   */
  loadToCommentLinksPage() {
    if (
      !this.isWatchlistPage() &&
      !this.isContributionsPage() &&
      !this.isHistoryPage() &&
      !(this.diffPage && this.articlePageTalkPage) &&
      !this.talkPage
    ) {
      return;
    }

    // Make some requests in advance if the API module is ready in order not to make 2 requests
    // sequentially.
    if (mw.loader.getState('mediawiki.api') === 'ready') {
      init.getSiteData();

      // Loading user info on diff pages could lead to problems with saving visits when many pages
      // are opened, but not yet focused, simultaneously.
      if (!this.talkPage) {
        getUserInfo(true).catch((e) => {
          console.warn(e);
        });
      }
    }

    mw.loader.using([
      'jquery.client',
      'mediawiki.Title',
      'mediawiki.api',
      'mediawiki.jqueryMsg',
      'mediawiki.user',
      'mediawiki.util',
      'oojs',
      'oojs-ui',
      'oojs-ui.styles.icons-alerts',
      'oojs-ui.styles.icons-editing-list',
      'oojs-ui.styles.icons-interactions',
      'user.options',
    ]).then(
      () => {
        addCommentLinks();

        // See the comment above: "Additions of CSS...".
        require('../less/global.less');

        require('../less/logPages.less');
      },
      (e) => {
        mw.notify(cd.s('error-loaddata'), { type: 'error' });
        console.error(e);
      }
    );
  },

  /**
   * Convert a fragment of DOM into wikitext.
   *
   * @param {Element} div
   * @param {external:OO.ui.TextInputWidget} input
   * @returns {Promise.<string>}
   * @private
   */
  async domToWikitext(div, input) {
    // Get all styles from classes applied. If HTML is retrieved from a paste, this is not needed
    // (styles are added to elements themselves in the text/html format), but won't hurt.
    div.className = 'cd-hidden';

    // require, not import, to prevent adding controller to the worker build.
    this.rootElement.appendChild(div);

    const removeElement = (el) => el.remove();
    const replaceWithChildren = (el) => {
      if (['DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(el.tagName)) {
        el.after('\n');
      }
      el.replaceWith(...el.childNodes);
    };

    [...div.querySelectorAll('*')]
      .filter((el) => window.getComputedStyle(el).userSelect === 'none')
      .forEach(removeElement);

    // Should run after removing elements with "user-select: none", to remove their wrappers that now
    // have not content.
    [...div.querySelectorAll('*')]
      // Need to keep non-breaking spaces.
      .filter((el) => (
        (!['BR', 'HR'].includes(el.tagName) || el.classList.contains('Apple-interchange-newline')) &&
        !el.textContent.replace(/[ \n]+/g, ''))
      )

      .forEach(removeElement);

    [...div.querySelectorAll('style')].forEach(removeElement);

    // <syntaxhighlight>
    [...div.querySelectorAll('.mw-highlight')].forEach((el) => {
      const syntaxhighlight = this.changeElementType(el.firstElementChild, 'syntaxhighlight');
      const [, lang] = el.className.match(/\bmw-highlight-lang-(\w+)\b/) || [];
      if (lang) {
        syntaxhighlight.setAttribute('lang', lang);
      }
    });

    const topElements = new Parser({ childElementsProp: 'children' })
      .getTopElementsWithText(div, true).nodes;
    if (topElements[0] !== div) {
      div.innerHTML = '';
      div.append(...topElements);
    }

    [...div.querySelectorAll('div, span, h1, h2, h3, h4, h5, h6')].forEach(replaceWithChildren);

    const allowedTags = cd.g.ALLOWED_TAGS.concat('a', 'center', 'big', 'strike', 'tt');
    [...div.querySelectorAll('*')].forEach((el) => {
      if (!allowedTags.includes(el.tagName.toLowerCase())) {
        replaceWithChildren(el);
        return;
      }

      [...el.attributes]
        .filter((attr) => attr.name === 'class' || /^data-/.test(attr.name))
        .forEach((attr) => {
          el.removeAttribute(attr.name);
        });
    });

    [...div.children]
      // DDs out of DLs are likely comment parts that should not create `:` markup. (Bare LIs don't
      // create `*` markup in the API.)
      .filter((el) => el.tagName === 'DD')

      .forEach(replaceWithChildren);

    const allElements = [...div.querySelectorAll('*')];
    let wikitext;
    const parseHtml = !(
      !div.childElementCount ||
      (allElements.length === 1 && ['P', 'LI', 'DD'].includes(allElements[0].tagName))
    )
    if (parseHtml) {
      input.pushPending();
      input.setDisabled(true);
      try {
        wikitext = await $.post('/api/rest_v1/transform/html/to/wikitext', {
          html: div.innerHTML,
          scrub_wikitext: true,
        });
        wikitext = wikitext
          .trim()
          .replace(/(?:^ .*(?:\n|$))+/gm, (s) => {
            s = s
              .replace(/^ /gm, '')
              .replace(/[^\n]$/, '$0\n');
            return '<syntaxhighlight>\n' + s + '</syntaxhighlight>';
          })
          .replace(
            /(<syntaxhighlight[^>]*>)\s*<nowiki>(.*?)<\/nowiki>\s*(<\/syntaxhighlight>)/g,
            '$1$2$3'
          );
        let hidden;
        ({ code: wikitext, hidden } = hideSensitiveCode(wikitext));
        wikitext = brsToNewlines(wikitext);
        wikitext = unhideText(wikitext, hidden);
      } catch {
        // Empty
      }
      input.popPending();
      input.setDisabled(false);
    }

    div.remove();

    return wikitext ?? div.innerText;
  },

  /**
   * Given a selection, get its content as wikitext.
   *
   * @param {external:OO.ui.TextInputWidget} input
   * @returns {string}
   */
  async getWikitextFromSelection(input) {
    const contents = window.getSelection().getRangeAt(0).cloneContents();
    const div = document.createElement('div');
    div.appendChild(contents);
    return await this.domToWikitext(div, input);
  },

  /**
   * Given the HTML of a paste, get its content as wikitext.
   *
   * @param {string} originalHtml
   * @param {external:OO.ui.TextInputWidget} input
   * @returns {string}
   */
  async getWikitextFromPaste(originalHtml, input) {
    let html = originalHtml
      .replace(/^[^]*<!-- *StartFragment *-->/, '')
      .replace(/<!-- *EndFragment *-->[^]*$/, '');
    const div = document.createElement('div');
    div.innerHTML = html;
    [...div.querySelectorAll('[style]')].forEach((el) => {
      el.removeAttribute('style');
    });
    return await this.domToWikitext(div, input);
  },

  /**
   * Replace an element with an identical one but with another tag name, i.e. move all child nodes,
   * attributes, and some bound events to a new node, and also reassign references in some variables
   * and properties to this element. Unfortunately, we can't just change the element's `tagName` to
   * do that.
   *
   * @param {Element} element
   * @param {string} newType
   * @returns {Element}
   * @private
   */
  changeElementType(element, newType) {
    const newElement = document.createElement(newType);
    while (element.firstChild) {
      newElement.appendChild(element.firstChild);
    }
    [...element.attributes].forEach((attribute) => {
      newElement.setAttribute(attribute.name, attribute.value);
    });

    // If this element is a part of a comment, replace it in the Comment object instance.
    let commentIndex = element.getAttribute('data-cd-comment-index');
    if (commentIndex !== null) {
      commentIndex = Number(commentIndex);
      cd.comments[commentIndex].replaceElement(element, newElement);
    } else {
      element.parentNode.replaceChild(newElement, element);
    }

    this.replaceScrollAnchorElement(element, newElement);

    return newElement;
  },

  /**
   * Check whether the page qualifies to be considered a long page (which affects attempting
   * performance improvements).
   *
   * @returns {boolean}
   */
  isLongPage() {
    this.longPage ??= $(document).height() > 15000;
    return this.longPage;
  },

  /**
   * Get all nodes between the two specified, including them. This works equally well if they are at
   * different nesting levels. Descendants of nodes that are already included are not included.
   *
   * @param {Element} start
   * @param {Element} end
   * @returns {Element[]}
   * @private
   */
  getRangeContents(start, end) {
    // It makes more sense to place this function in the util module, but we can't import controller
    // there because of issues with the worker build and a cyclic dependency that emerges.

    // Fight infinite loops
    if (start.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_PRECEDING) return;

    let commonAncestor;
    for (let el = start; el; el = el.parentNode) {
      if (el.contains(end)) {
        commonAncestor = el;
        break;
      }
    }

    /*
      Here we should equally account for all cases of the start and end item relative position.

        <ul>         <!-- Say, may start anywhere from here... -->
          <li></li>
          <li>
            <div></div>
          </li>
          <li></li>
        </ul>
        <div></div>  <!-- ...to here. And, may end anywhere from here... -->
        <ul>
          <li></li>
          <li>
            <div></div>
          </li>
          <li></li>  <-- ...to here. -->
        </ul>
    */
    const rangeContents = [start];

    // The start container could contain the end container and be different from it in the case with
    // adjusted end items.
    if (!start.contains(end)) {
      const treeWalker = new ElementsTreeWalker(start, this.rootElement);

      while (treeWalker.currentNode.parentNode !== commonAncestor) {
        while (treeWalker.nextSibling()) {
          rangeContents.push(treeWalker.currentNode);
        }
        treeWalker.parentNode();
      }
      treeWalker.nextSibling();
      while (!treeWalker.currentNode.contains(end)) {
        rangeContents.push(treeWalker.currentNode);
        treeWalker.nextSibling();
      }

      // This step fixes some issues with `.cd-connectToPreviousItem` like wrong margins below the
      // expand note of the comment
      // https://commons.wikimedia.org/w/index.php?title=User_talk:Jack_who_built_the_house/CD_test_page&oldid=678031044#c-Example-2021-10-02T05:14:00.000Z-Example-2021-10-02T05:13:00.000Z
      // if you collapse its thread.
      while (end.parentNode.lastChild === end && treeWalker.currentNode.contains(end.parentNode)) {
        end = end.parentNode;
      }

      while (treeWalker.currentNode !== end) {
        treeWalker.firstChild();
        while (!treeWalker.currentNode.contains(end)) {
          rangeContents.push(treeWalker.currentNode);
          treeWalker.nextSibling();
        }
      }
      rangeContents.push(end);
    }

    return rangeContents;
  },

  /**
   * Get the content root element (`.mw-parser-output` or `#mw-content-text`). Supposed to be used
   * via {@link convenientDiscussions.api.getRootElement}; inside the script, direct reference to
   * `controller.rootElement` is practiced.
   *
   * @returns {Element}
   */
  getRootElement() {
    return this.rootElement;
  },

  /**
   * Show a settings dialog.
   *
   * @param {string} [initalPageName]
   */
  showSettingsDialog(initalPageName) {
    if ($('.cd-dialog-settings').length) return;

    const SettingsDialog = require('./SettingsDialog').default;

    const dialog = new SettingsDialog(initalPageName);
    this.getWindowManager('settings').addWindows([dialog]);
    this.getWindowManager('settings').openWindow(dialog);

    cd.tests.settingsDialog = dialog;
  },

  /**
   * Show an edit subscriptions dialog.
   */
  showEditSubscriptionsDialog() {
    if (this.isPageOverlayOn()) return;

    const EditSubscriptionsDialog = require('./EditSubscriptionsDialog').default;

    const dialog = new EditSubscriptionsDialog();
    this.getWindowManager().addWindows([dialog]);
    this.getWindowManager().openWindow(dialog);
  },

  /**
   * Show a copy link dialog.
   *
   * @param {Comment|Section} object Comment or section to copy a link to.
   * @param {Event} e
   */
  showCopyLinkDialog(object, e) {
    const fragment = object.getWikilinkFragment();
    const permalinkSpecialPageName = (
      mw.config.get('wgFormattedNamespaces')[-1] +
      ':' +
      cd.g.SPECIAL_PAGE_ALIASES.PermanentLink +
      '/' +
      mw.config.get('wgRevisionId')
    );
    const content = {
      fragment,
      wikilink: `[[${cd.page.name}#${fragment}]]`,
      currentPageWikilink: `[[#${fragment}]]`,
      permanentWikilink: `[[${permalinkSpecialPageName}#${fragment}]]`,
      link: object.getUrl(),
      permanentLink: object.getUrl(true),
      copyMessages: {
        success: cd.s('copylink-copied'),
        fail: cd.s('copylink-error'),
      },
    };

    // Undocumented feature allowing to copy a link of a default type without opening a dialog.
    const relevantSetting = object instanceof Comment ?
      settings.get('defaultCommentLinkType') :
      settings.get('defaultSectionLinkType');
    if (!e.shiftKey && relevantSetting) {
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

    const CopyLinkDialog = require('./CopyLinkDialog').default;

    const dialog = new CopyLinkDialog(object, content);
    this.getWindowManager().addWindows([dialog]);
    this.getWindowManager().openWindow(dialog);
  },

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
      if (callback) {
        callback();
      }
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
  },

  /**
   * Set up a
   * {@link https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver MutationObserver}
   * instance to handle page mutations.
   */
  setupMutationObserver() {
    // Create the mutation observer in the next event cycle - let most DOM changes by CD and scripts
    // attached to the hooks to be made first to reduce the number of times it runs in vain. But if
    // we set a long delay, users will see comment backgrounds mispositioned for some time.
    setTimeout(() => {
      this.mutationObserver = new MutationObserver((records) => {
        const layerClassRegexp = /^cd-comment(-underlay|-overlay|Layers)/;
        if (records.every((record) => layerClassRegexp.test(record.target.className))) return;

        this.handlePageMutations();
      });
      this.mutationObserver.observe(this.$content.get(0), {
        attributes: true,
        childList: true,
        subtree: true,
      });
    });
  },
};
