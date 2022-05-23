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
import Thread from './Thread';
import Worker from './worker-gate';
import addCommentLinks from './addCommentLinks';
import cd from './cd';
import init from './init';
import navPanel from './navPanel';
import notifications from './notifications';
import pageNav from './pageNav';
import postponements from './postponements';
import sessions from './sessions';
import settings from './settings';
import toc from './toc';
import updateChecker from './updateChecker';
import { ElementsTreeWalker } from './treeWalker';
import { brsToNewlines, hideSensitiveCode } from './wikitext';
import {
  getExtendedRect,
  getLastArrayElementOrSelf,
  getVisibilityByRects,
  isCmdMofidicatorPressed,
  isInline,
  isInputFocused,
  isProbablyTalkPage,
  keyCombination,
  skin$,
  unhideText,
} from './util';
import { getUserInfo } from './apiWrappers';

/**
 * Get the bottom offset of the table of contents.
 *
 * @returns {number}
 * @private
 */
function getTocBottomOffset() {
  return toc.$element.offset().top + toc.$element.outerHeight();
}

export default {
  state: {},
  content: {},
  scrollData: { offset: null },
  document: document.documentElement,
  autoScrolling: false,
  isUpdateThreadLinesHandlerAttached: false,

  setup() {
    // Not constants: go() may run a second time, see addFooterLink().
    const isEnabledInQuery = /[?&]cdtalkpage=(1|true|yes|y)(?=&|$)/.test(location.search);
    const isDisabledInQuery = /[?&]cdtalkpage=(0|false|no|n)(?=&|$)/.test(location.search);

    this.$content = this.$content || $('#mw-content-text');
    this.definitelyTalkPage = Boolean(
      isEnabledInQuery ||
      cd.g.PAGE_WHITELIST_REGEXP?.test(cd.g.PAGE_NAME) ||
      $('#ca-addsection').length ||

      // .cd-talkPage is used as a last resort way to make CD parse the page, as opposed to using
      // the list of supported namespaces and page white/black list in the configuration. With this
      // method, there won't be "comment" links for edits on pages that list revisions such as the
      // watchlist.
      this.$content.find('.cd-talkPage').length
    );

    // This is the eligibility of the _article_ page (the one with wgIsArticle being true). So it
    // can be true even on edit, history pages etc. Although the assessments may be different on a
    // history page and on an article page of the same title, since the page can contain elements
    // with special classes (see the condition) that we can access only on the article page.
    this.articlePageTalkPage = (
      (!mw.config.get('wgIsRedirect') || !this.isCurrentRevision()) &&
      !this.$content.find('.cd-notTalkPage').length &&
      (isProbablyTalkPage(cd.g.PAGE_NAME, cd.g.NAMESPACE_NUMBER) || this.definitelyTalkPage) &&

      // Undocumented setting
      !(typeof cdOnlyRunByFooterLink !== 'undefined' && window.cdOnlyRunByFooterLink)
    );

    // Not a constant: the diff may be removed from the page (and the URL updated, see
    // this.cleanUpUrlAndDom) when it's for the last revision and the page is reloaded using the
    // script. wgIsArticle config value is not taken into account: if the "Do not show page content
    // below diffs" setting is on, wgIsArticle is off.
    this.diffPage = /[?&]diff=[^&]/.test(location.search);

    this.talkPage = Boolean(
      mw.config.get('wgIsArticle') &&
      !isDisabledInQuery &&
      (isEnabledInQuery || this.articlePageTalkPage)
    );

    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleWindowResize = this.handleWindowResize.bind(this);
    this.handleGlobalKeyDown = this.handleGlobalKeyDown.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
    this.handleHashChange = this.handleHashChange.bind(this);
    this.handleSelectionChange = this.handleSelectionChange.bind(this);
    this.handlePageMutations = this.handlePageMutations.bind(this);
    this.handleAddTopicButtonClick = this.handleAddTopicButtonClick.bind(this);
    this.handleWikipageContentHookFirings = this.handleWikipageContentHookFirings.bind(this);
  },

  reset(htmlToLayOut) {
    this.content = {};
    LiveTimestamp.reset();

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

    // Do it immediately to prevent the issue when any unexpected error prevents this from being
    // executed and then this.handleWikipageContentHookFirings is called with #mw-content-text
    // element for some reason, and the page goes into an infinite reloading loop.
    this.$root.data('cd-parsed', true);
  },

  setTalkPageness(value) {
    this.talkPage = Boolean(value);
  },

  isTalkPage() {
    return this.talkPage;
  },

  isWatchlistPage() {
    return ['Recentchanges', 'Watchlist'].includes(mw.config.get('wgCanonicalSpecialPageName'));
  },

  isContributionsPage() {
    return mw.config.get('wgCanonicalSpecialPageName') === 'Contributions';
  },

  isHistoryPage() {
    return (
      mw.config.get('wgAction') === 'history' &&
      isProbablyTalkPage(cd.g.PAGE_NAME, cd.g.NAMESPACE_NUMBER)
    );
  },

  isDiffPage() {
    return this.diffPage;
  },

  isDefinitelyTalkPage() {
    return this.definitelyTalkPage;
  },

  isArticlePageTalkPage() {
    return this.articlePageTalkPage;
  },

  doesPageExist() {
    return Boolean(mw.config.get('wgArticleId'));
  },

  isPageActive() {
    /*
      This value isn't static:
      1. A 404 page doesn't have an ID and is considered inactive, but if the user adds a topic to
         it, it will become active and get an ID.
      2. The user may switch to another revision using RevisionSlider.
      3. On a really rare occasion, an active page may become inactive if it becomes identified as
         an archive page. This possibility is currently switched off.
    */
    return (
      this.talkPage &&
      this.doesPageExist() &&
      !cd.page.isArchivePage() &&
      this.isCurrentRevision()
    );
  },

  isPageCommentable() {
    return this.talkPage && (this.isPageActive() || !this.doesPageExist());
  },

  toggleAutoScrolling(value) {
    this.autoScrolling = Boolean(value);
  },

  isAutoScrolling() {
    return this.autoScrolling;
  },

  setAddSectionButtonContainer($container) {
    this.$addSectionButtonContainer = $container;
  },

  setActiveAutocompleteMenu(menuElement) {
    this.activeAutocompleteMenu = menuElement;
  },

  getActiveAutocompleteMenu() {
    return this.activeAutocompleteMenu;
  },

  forgetActiveAutocompleteMenu() {
    delete this.activeAutocompleteMenu;
  },

  setAddSectionForm(commentForm) {
    this.addSectionForm = commentForm;
  },

  getAddSectionForm() {
    return this.addSectionForm;
  },

  /**
   * OOUI window manager.
   *
   * @class WindowManager
   * @memberof external:OO.ui
   * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.WindowManager
   */

  /**
   * Create a OOUI window manager or return an existing one.
   *
   * @returns {external:OO.ui.WindowManager}
   */
  getWindowManager() {
    if (!this.windowManager) {
      this.windowManager = new OO.ui.WindowManager().on('closing', async (win, closed) => {
        // We don't have windows that can be reused.
        await closed;
        this.windowManager.clearWindows();
      });

      $(document.body).append(this.windowManager.$element);
    }

    return this.windowManager;
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

  getWorker() {
    if (!this.worker) {
      this.worker = new Worker();
    }

    return this.worker;
  },

  /**
   * _For internal use._ Memorize the state related to `controller.$contentColumn`.
   *
   * @param {boolean} setCssVar Whether to set the `--cd-content-start-margin` CSS variable.
   */
  setContentColumnState(setCssVar) {
    const prop = cd.g.CONTENT_DIR === 'ltr' ? 'padding-left' : 'padding-right';
    let contentStartMargin = parseFloat(this.$contentColumn.css(prop));
    if (contentStartMargin < cd.g.CONTENT_FONT_SIZE) {
      contentStartMargin = cd.g.CONTENT_FONT_SIZE;
    }

    // The content column in Timeless has no _borders_ as such, so it's wrong to penetrate the
    // surrounding area from the design point of view.
    if (cd.g.SKIN === 'timeless') {
      contentStartMargin--;
    }

    this.contentStartMargin = contentStartMargin;
    if (setCssVar) {
      $(this.document).css('--cd-content-start-margin', contentStartMargin + 'px');
    }

    const left = this.$contentColumn.offset().left;
    const width = this.$contentColumn.outerWidth();
    this.contentColumnStart = cd.g.CONTENT_DIR === 'ltr' ? left : left + width;
    this.contentColumnEnd = cd.g.CONTENT_DIR === 'ltr' ? left + width : left;
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
    if (switchToAbsolute && toc.isPresent && scrollY < getTocBottomOffset()) {
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
      } else if (scrollY !== 0 && this.rootElement.getBoundingClientRect().top <= 0) {
        const treeWalker = new ElementsTreeWalker(
          this.rootElement.firstElementChild,
          this.rootElement
        );
        while (true) {
          const node = treeWalker.currentNode;

          if (!isInline(node) && !this.getFloatingElements().includes(node)) {
            const rect = node.getBoundingClientRect();
            if (rect.bottom >= 0 && rect.height !== 0) {
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
      toc.isPresent &&
      !toc.isFloating &&
      window.scrollY !== 0 &&

      // There is some content below the TOC in the viewport.
      getTocBottomOffset() < window.scrollY + window.innerHeight
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
   * Find outdent templates on the page.
   *
   * @returns {boolean}
   */
  areThereOutdents() {
    if (!this.content.areThereOutdents) {
      this.content.areThereOutdents = Boolean(this.$root.find('.' + cd.config.outdentClass).length);
    }

    return this.content.areThereOutdents;
  },

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

  getTsFloatingElementSelectors() {
    if (!this.content.tsSelectorsFloating) {
      this.extractTemplateStylesSelectors();
    }

    return this.content.tsSelectorsFloating;
  },

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

  areThereLtrRtlMixes() {
    if (!this.content.areThereLtrRtlMixes) {
      this.content.areThereLtrRtlMixes = Boolean(
        document.querySelector('.sitedir-ltr .mw-content-rtl, .sitedir-rtl .mw-content-ltr')
      );
    }

    return this.content.areThereLtrRtlMixes;
  },

  getPopupOverlay(create = true) {
    if (!this.$popupOverlay && create) {
      this.$popupOverlay = $('<div>')
        .addClass('cd-popupOverlay')
        .appendTo(document.body);
    }

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

  handleMouseMove(e) {
    if (postponements.is('scroll') || this.isAutoScrolling() || this.isPageOverlayOn()) return;

    Comment.highlightHovered(e);
  },

  /**
   * _Method for internal use._ Handles the window `resize` event as well as `orientationchange`.
   */
  handleWindowResize() {
    // Seems like sometimes it doesn't have time to update.
    setTimeout(() => {
      this.setContentColumnState(true);
      Comment.redrawLayersIfNecessary(true);
      Thread.updateLines();
      pageNav.updateWidth();
    });

    navPanel.updateCommentFormButton();
    cd.commentForms.forEach((commentForm) => {
      commentForm.adjustLabels();
    });
    this.handleScroll();
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
      keyCombination(e, 81, ['ctrl', 'alt']) ||

      // Q
      (keyCombination(e, 81) && !isInputFocused())
    ) {
      const lastActiveCommentForm = CommentForm.getLastActive();
      if (lastActiveCommentForm) {
        e.preventDefault();
        lastActiveCommentForm.quote(isCmdMofidicatorPressed(e));
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
        navPanel.goToNextCommentForm();
      }
    }
  },

  /**
   * _For internal use._ Register seen comments, update the navigation panel's first unseen button,
   * and update the current section block.
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
  },

  /**
   * Handle the `hashchange` event, including clicks on links pointing to comment anchors.
   */
  handleHashChange() {
    let fragment = location.hash.slice(1);
    if (Comment.isDtId(fragment) || Comment.isId(fragment)) {
      // Don't jump to the comment if the user pressed Back/Forward in the browser or if
      // history.pushState() is called from Comment#scrollTo().
      if (history.state?.cdJumpedToComment) return;

      try {
        fragment = decodeURIComponent(fragment);
      } catch (e) {
        console.error(e);
        return;
      }
      const comment = Comment.isDtId(fragment) ?
        Comment.getByDtId(fragment) :
        Comment.getById(fragment, true);
      comment?.scrollTo();
    }
  },

  handleSelectionChange() {
    postponements.add('selectionChange', Comment.getSelectedComment, 200);
  },

  handlePageMutations() {
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

  handleAddTopicButtonClick(e) {
    if (e.ctrlKey || e.shiftKey || e.metaKey) return;

    const $button = $(e.currentTarget);
    let preloadConfig;
    let isNewTopicOnTop = false;
    if ($button.is('a')) {
      const href = $button.attr('href');
      let query;

      // May crash if the current URL contains undecodable "%" in the fragment.
      try {
        query = new mw.Uri(href).query;
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
      isNewTopicOnTop = getLastArrayElementOrSelf(query.section) === '0';
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
    CommentForm.createAddSectionForm(preloadConfig, isNewTopicOnTop);
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

  loadToTalkPage() {
    cd.debug.stopTimer('start');
    cd.debug.startTimer('loading data');

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
      'jquery.color',
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
      'oojs-ui',
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
      if ((init.siteDataRequests || []).every((request) => request.state() === 'resolved')) {
        this.bootProcess.passData('scrollY', window.scrollY);
      }
    } else {
      modulesRequest = mw.loader.using(modules);
    }

    this.showLoadingOverlay();
    Promise.all([modulesRequest, ...(init.siteDataRequests || [])]).then(
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
        this.bootProcess.hideLoadingOverlay();
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

    init.setTalkPageCssVariables();

    require('../less/global.less');
    require('../less/Comment.less');
    require('../less/CommentForm.less');
    require('../less/Section.less');
    require('../less/commentLayers.less');
    require('../less/navPanel.less');
    require('../less/pageNav.less');
    require('../less/skin.less');
    require('../less/talkPage.less');
  },

  /**
   * Reload the page via Ajax.
   *
   * @param {import('./commonTypedefs').PassedData} [passedData={}] Data passed from the previous
   *   page state. See {@link module:commonTypedefs~PassedData} for the list of possible properties.
   *   `html`, `unseenCommentIds` properties are set in this function.
   * @throws {CdError|Error}
   */
  async reload(passedData = {}) {
    if (this.booting) return;

    const bootProcess = new BootProcess(passedData);

    // We shouldn't make the current version of the page dysfunctional at least until a correct
    // response to the parse request is received. Otherwise, if the request fails, the user would be
    // left with a dysfunctional page. This is why we reset the live timestamps only after the
    // request.

    // Stop all animations, clear all timeouts.
    cd.comments.forEach((comment) => {
      comment.$animatedBackground?.add(comment.$marker).stop(true, true);
    });

    // If the page is reloaded externally, its content is already replaced, so we won't break
    // anything is we remove the layers containers. And we better do so to avoid comment layers
    // hanging around without their owner comments.
    if (bootProcess.data('isPageReloadedExternally')) {
      Comment.resetLayers();
    }

    // A check in light of the existence of RevisionSlider.
    if (this.isCurrentRevision()) {
      // In case checkboxes were changed programmatically.
      sessions.save();
    }

    if (!bootProcess.data('commentId') && !bootProcess.data('sectionId')) {
      this.saveScrollPosition();
    }

    notifications.close(bootProcess.data('closeNotificationsSmoothly') ?? true);

    cd.debug.init();
    cd.debug.startTimer('total time');
    cd.debug.startTimer('getting HTML');

    this.showLoadingOverlay();

    // Save time by requesting the options in advance.
    getUserInfo().catch((e) => {
      console.warn(e);
    });

    if (!bootProcess.data('isPageReloadedExternally')) {
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
      mw.config.set({
        wgRevisionId: parseData.revid,
        wgCurRevisionId: parseData.revid,
      });
      mw.loader.load(parseData.modules);
      mw.loader.load(parseData.modulestyles);
      mw.config.set(parseData.jsconfigvars);
    }

    // Get IDs of unseen comments. This is used to arrange that they will still be there after
    // replying on or refreshing the page.
    const unseenCommentIds = cd.comments
      .filter((comment) => comment.isSeen === false)
      .map((comment) => comment.id);
    bootProcess.passData('unseenCommentIds', unseenCommentIds);

    // At this point, the boot process can't be interrupted, so we can remove all traces of the
    // current page state.
    this.bootProcess = bootProcess;

    // Detach the comment forms to keep events.
    cd.commentForms.forEach((commentForm) => {
      commentForm.$outermostElement.detach();
    });

    this.cleanUpUrlAndDom();
    updateChecker.updatePageTitle(0, false);

    cd.debug.stopTimer('getting HTML');

    await this.tryExecuteBootProcess(true);

    toc.possiblyHide();

    if (!this.bootProcess.data('commentId') && !this.bootProcess.data('sectionId')) {
      this.restoreScrollPosition(false);
    }
  },

  /**
   * _For internal use._ Handle firings of the hook `'wikipage.content'` (by using
   * `mw.hook('wikipage.content').fire()`).
   *
   * @param {external:jQuery} $content
   */
  handleWikipageContentHookFirings($content) {
    if (!$content.is('#mw-content-text')) return;

    const $root = $content.children('.mw-parser-output');
    if ($root.length && !$root.data('cd-parsed')) {
      this.reload({ isPageReloadedExternally: true });
    }
  },

  /**
   * Remove fragment and revision parameters from the URL, remove DOM elements related to the diff.
   *
   * @private
   */
  cleanUpUrlAndDom() {
    const uri = new mw.Uri();
    const query = uri.query;
    if (
      (uri.fragment || query.diff || query.oldid) &&
      !this.bootProcess.data('isPageReloadedExternally')
    ) {
      // Added automatically (after /wiki/ if possible, as a query parameter otherwise).
      delete query.title;

      delete query.curid;
      let methodName;
      if (query.diff || query.oldid) {
        methodName = 'pushState';

        delete query.diff;
        delete query.oldid;
        delete query.diffmode;
        delete query.type;

        // Diff pages
        this.$content
          .children('.mw-revslider-container, .ve-init-mw-diffPage-diffMode, .diff, .oo-ui-element-hidden, .diff-hr, .diff-currentversion-title')
          .remove();

        // Revision navigation
        $('.mw-revision').remove();

        $('#firstHeading').text(cd.page.name);

        // Make the "Back" browser button work.
        $(window).on('popstate', () => {
          if (mw.util.getParamValue('diff') || mw.util.getParamValue('oldid')) {
            location.reload();
          }
        });

        this.diffPage = false;
      } else {
        methodName = 'replaceState';
      }
      history[methodName](history.state, '', cd.page.getUrl(query));
    }
  },

  loadCommentLinks() {
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

    // require, not import, to prevent adding controller to the worker build.
    this.replaceScrollAnchorElement(element, newElement);

    return newElement;
  },
};
