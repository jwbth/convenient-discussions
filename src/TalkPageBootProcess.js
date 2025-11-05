import Comment from './Comment';
import CommentForm from './CommentForm';
import CommentFormInputTransformer from './CommentFormInputTransformer';
import CompactComment from './CompactComment';
import DtSubscriptions from './DtSubscriptions';
import LegacySubscriptions from './LegacySubscriptions';
import Section from './Section';
import SpaciousComment from './SpaciousComment';
import Thread from './Thread';
import bootManager from './bootManager';
import cd from './cd';
import commentFormManager from './commentFormManager';
import commentManager from './commentManager';
import debug from './debug';
import navPanel from './navPanel';
import notifications from './notifications';
import pageController from './pageController';
import pageNav from './pageNav';
import processFragment from './processFragment';
import sectionManager from './sectionManager';
import settings from './settings';
import Parser from './shared/Parser';
import { defined, definedAndNotNull, generatePageNamePattern, isElement, sleep, unique } from './shared/utils-general';
import toc from './toc';
import updateChecker from './updateChecker';
import userRegistry from './userRegistry';
import { handleApiReject, saveOptions } from './utils-api';
import { getAllTextNodes, wrapHtml } from './utils-window';
import visits from './visits';

/**
 * Remove all html comments added by DiscussionTools related to reply buttons.
 *
 * @private
 */
function removeDtButtonHtmlComments() {
  // eslint-disable-next-line no-one-time-vars/no-one-time-vars
  const treeWalker = document.createNodeIterator(
    pageController.rootElement,
    NodeFilter.SHOW_COMMENT
  );
  let node;
  while ((node = /** @type {globalThis.Comment | null} */ (treeWalker.nextNode()))) {
    if (node.textContent.startsWith('__DTREPLYBUTTONS__')) {
      node.remove();
    }
  }
}

/**
 * Deal with (remove or move in the DOM) the markup added to the page by DiscussionTools.
 *
 * @param {Element[]} elements
 * @private
 */
function processAndRemoveDtElements(elements) {
  // Reply Tool is officially incompatible with CD, so we don't care if it is enabled. New Topic
  // Tool doesn't seem to make difference for our purposes here.
  const moveNotRemove =
    cd.g.isDtTopicSubscriptionEnabled ||

    // DT enabled by default. Don't know how to capture that another way.
    !['registered', null].includes(mw.loader.getState('ext.discussionTools.init'));

  /** @type {HTMLSpanElement | undefined} */
  let dtMarkupHavenElement;
  if (moveNotRemove) {
    if (!bootManager.getTalkPageBootProcess().isFirstRun()) {
      dtMarkupHavenElement = bootManager.$content.children('.cd-dtMarkupHaven')[0];
    }
    if (dtMarkupHavenElement) {
      dtMarkupHavenElement.innerHTML = '';
    } else {
      dtMarkupHavenElement = document.createElement('span');
      dtMarkupHavenElement.className = 'cd-dtMarkupHaven cd-hidden';
      bootManager.$content.append(dtMarkupHavenElement);
    }
  }

  /** @type {HTMLElement[]} */ (
    elements.concat([
      ...pageController.rootElement.querySelectorAll('.ext-discussiontools-init-highlight'),
    ])
  ).forEach((el, i) => {
    if (Object.hasOwn(el.dataset, 'mwCommentStart') && Comment.isDtId(el.id)) {
      bootManager.getTalkPageBootProcess().addDtCommentId(el.id);
    }
    if (moveNotRemove) {
      // DT gets the DOM offset of each of these elements upon initialization which can take a lot
      // of time if the elements aren't put into containers with less children.
      if (i % 10 === 0) {
        /** @type {HTMLSpanElement} */ (dtMarkupHavenElement).append(
          document.createElement('span')
        );
      }
      /** @type {HTMLSpanElement} */ (
        /** @type {HTMLSpanElement} */ (dtMarkupHavenElement).lastChild
      ).append(el);
    } else {
      el.remove();
    }
  });
  if (!moveNotRemove) {
    [
      .../** @type {NodeListOf<HTMLSpanElement>} */ (
        pageController.rootElement.querySelectorAll('span[data-mw-comment]')
      ),
    ].forEach((el) => {
      delete el.dataset.mwComment;
    });
  }
}

/**
 * Data passed from the previous page state.
 *
 * @typedef {object} PassedData
 * @property {import('./utils-api').ApiResponseParseContent} [parseData] Response to the parse
 *   request from the API.
 * @property {(string | undefined)[]} [commentIds] ID of comments to highlight and/or scroll to.
 * @property {string} [sectionId] ID of a section to scroll to.
 * @property {boolean} [pushState] Whether to replace the URL in the address bar adding the comment
 *   ID to it if it's specified.
 * @property {number} [scrollY] Page's Y offset.
 * @property {Comment[]} [unseenComments] Unseen comments on this page.
 * @property {string} [justSubscribedToSection] Section just watched so that there could be not
 *   enough time for it to be saved to the server.
 * @property {string} [justUnsubscribedFromSection] Section just unwatched so that there could be
 *   not enough time for it to be saved to the server.
 * @property {CommentForm} [submittedCommentForm] Comment form the user just submitted.
 * @property {boolean} [isPageReloadedExternally] Whether the page was reloaded externally (e.g. by
 *   some script).
 * @property {boolean} [markAsRead] Whether to mark all previously shown comments on the page as
 *   read.
 * @property {boolean} [isRevisionSliderRunning] Whether RevisionSlider is currently active.
 * @property {boolean} [closeNotificationsSmoothly=true] Whether to close notifications smoothly.
 */

/**
 * A single process of booting or rebooting CD onto a talk page. In some sense, it is a (re-)builder
 * for {@link pageController}. On first run, it's a builder for {@link convenientDiscussions.g}.
 */
class TalkPageBootProcess {
  /** @type {boolean} */
  firstRun;

  /** @type {Parser<Node>} */
  parser;

  /** @type {import('./shared/Parser').Target<Node>[]} */
  targets;

  /** @type {import('./Subscriptions').default} */
  subscriptions;

  /**
   * Create a boot process.
   *
   * @param {PassedData} [passedData]
   */
  constructor(passedData = {}) {
    this.passedData = passedData;
    this.dtCommentIds = /** @type {string[]} */ ([]);
  }

  /**
   * _For internal use._ Execute the process.
   *
   * @param {boolean} isReload Is the page reloaded.
   * @fires beforeParse
   * @fires commentsReady
   * @fires sectionsReady
   * @fires pageReady
   * @fires pageReadyFirstTime
   */
  async execute(isReload) {
    this.firstRun = !isReload;
    if (this.firstRun) {
      debug.stopTimer('load data');
    }

    debug.startTimer('preparations');
    await this.init();
    debug.stopTimer('preparations');

    debug.startTimer('main code');

    if (this.firstRun) {
      pageController.saveRelativeScrollPosition(undefined, this.passedData.scrollY);

      userRegistry.loadMuted();
    }

    /*
      To make things systematized, we have 4 possible assessments of page activeness as a talk page,
      sorted by the scope of enabled features. Each level includes the next ones; 3 is the
      intersection of 2.1 and 2.2.
        1. The page is a wikitext (article) page.
        2. The page is likely a talk page. BootManager#isTalkPage() reflects that. We may reevaluate
           page as being not a talk page (see TalkPageBootProcess#retractTalkPageType()) if we don't
           find any comments on it and several other criteria are not met. Likely talk pages are
           divided into two categories:
        2.1. The page is eligible to create comment forms on. (This includes 404 pages where the
             user could create a section, but excludes archive pages and old revisions.)
             cd.page.isCommentable() reflects this level.
        2.2. The page exists (not a 404 page). cd.page.exists() shows this. (This includes archive
             pages and old revisions, which are not eligible to create comment forms on.) Such pages
             are parsed, the page navigation block is added to them.
        3. The page is active. This means, it's not a 404 page, not an archive page, and not an old
           revision. cd.page.isActive() is true when the page is of this level. The navigation panel
           is added to such pages, new comments are highlighted.

      We need to be accurate regarding which functionality should be turned on on which level. We
      should also make sure we only add this functionality once.
    */

    if (cd.page.exists()) {
      if (cd.page.isActive()) {
        visits.load(this, true);
      }

      if (this.subscriptions instanceof LegacySubscriptions) {
        this.subscriptions.loadToTalkPage(this, true);
      }

      /**
       * The script is going to parse the page for comments, sections, etc.
       *
       * @event beforeParse
       * @param {object} cd {@link convenientDiscussions} object.
       */
      mw.hook('convenientDiscussions.beforeParse').fire(cd);

      debug.startTimer('process comments');
      this.findTargets();
      this.processComments();
      debug.stopTimer('process comments');
    }

    if (
      this.firstRun &&
      !bootManager.isPageOfType('definitelyTalk') &&
      !commentManager.getCount()
    ) {
      this.retractTalkPageType();

      return;
    }

    if (cd.page.exists()) {
      debug.startTimer('process sections');
      this.processSections();
      debug.stopTimer('process sections');
    } else if (this.subscriptions instanceof DtSubscriptions) {
      this.subscriptions.loadToTalkPage(this);
    }

    if (this.passedData.parseData?.text) {
      debug.startTimer('update page contents');
      pageController.updatePageContents(this.passedData.parseData);
      debug.stopTimer('update page contents');
    }

    navPanel.setup();

    debug.stopTimer('main code');

    // Operations that need reflow, such as getBoundingClientRect(), and those dependent on them go
    // in this section.
    debug.startTimer('final code and rendering');

    // This should be done on rendering stage (would have resulted in unnecessary reflows were it
    // done earlier). Should be above all code that deals with highlightable elements of comments
    // and comment levels as this may alter that.
    commentManager.reviewHighlightables();

    commentManager.reformatComments();

    // This updates some styles, shifting the offsets.
    pageController.$root.addClass('cd-parsed');

    // Should be below navPanel.setup() as commentFormManager.restoreSession() indirectly calls
    // navPanel.updateCommentFormButton() which depends on the navigation panel being mounted.
    if (cd.page.isCommentable()) {
      if (this.firstRun) {
        cd.page.addAddTopicButton();
      }
      pageController.connectToAddTopicButtons();

      // If the viewport position restoration relies on elements that are made hidden during this
      // (when editing a comment), it can't be restored properly, but this is relatively minor
      // detail.
      commentFormManager.restoreSession(
        Boolean(this.firstRun || this.passedData.isPageReloadedExternally)
      );

      cd.page.autoAddSection(this.hideDtNewTopicForm());
    }

    if (cd.page.exists()) {
      // Should be below the comment form restoration for threads to be expanded correctly and also
      // to avoid repositioning threads after the addition of comment forms. Should be above the
      // viewport position restoration as it may shift the layout (if the viewport position
      // restoration relies on elements that are made hidden when threads are collapsed, the
      // algorithm finds the expand note). Should better be above comment highlighting
      // (commentManager.configureAndAddLayers(), visits#process()) to avoid spending time on
      // comments in collapsed threads.
      Thread.reset();

      // Should better be below the comment form restoration to avoid repositioning of layers
      // after the addition of comment forms.
      commentManager.configureAndAddLayers((c) => (
        c.isOwn ||

        // Need to generate a gray line to close the gaps between adjacent list item elements. Do it
        // here, not after processing comments, to group all operations requiring reflow
        // together for performance reasons.
        c.isLineGapped
      ));

      // Should be below Thread.init() as these functions may want to scroll to a comment in a
      // collapsed thread.
      if (this.firstRun) {
        this.deactivateDtHighlight();
        processFragment();
      }
      this.processPassedTargets();

      if (!cd.page.isActive()) {
        toc.addCommentCount();
      }

      pageNav.setup();

      if (this.firstRun) {
        pageController.addEventListeners();
      }

      // We set up the mutation observer at every reload because controller.$content may change
      // (e.g. RevisionSlider replaces it).
      pageController.setupMutationObserver();

      if (settings.get('commentDisplay') === 'spacious' && commentManager.getCount() && this.isFirstRun()) {
        // Using the wikipage.content hook could theoretically disrupt code that needs to process
        // the whole page content (#mw-content-text), if it runs later than CD which would override
        // the hook's argument below. But typically CD runs relatively late.
        mw.hook('wikipage.content').fire($('.cd-comment-author-wrapper'));
      }
    }

    if (this.firstRun) {
      // Restore the initial viewport position in terms of visible elements, which is how the user
      // sees it.
      pageController.restoreRelativeScrollPosition();

      settings.addLinkToFooter();
    }

    /**
     * The script has processed the page.
     *
     * @event pageReady
     * @param {object} cd {@link convenientDiscussions} object.
     */
    mw.hook('convenientDiscussions.pageReady').fire(cd);

    if (this.firstRun) {
      /**
       * The script has processed the page for the first time since the page load. Use this hook
       * for operations that should run only once.
       *
       * @event pageReadyFirstTime
       * @param {object} cd {@link convenientDiscussions} object.
       */
      mw.hook('convenientDiscussions.pageReadyFirstTime').fire(cd);
    }

    bootManager.hideLoadingOverlay();

    // This is needed to calculate the rendering time: it won't complete until everything gets
    // rendered.
    pageController.rootElement.getBoundingClientRect();

    debug.stopTimer('final code and rendering');

    this.debugLog();

    if (this.firstRun && cd.page.isActive() && cd.user.isRegistered()) {
      this.showPopups();
    }
  }

  /**
   * Initialize, set up, or reset various components required for the boot process. Some DOM
   * preparations are also made here.
   *
   * @private
   */
  async init() {
    if (this.firstRun) {
      await bootManager.setupTalkPage();
    } else {
      pageController.reset();
    }
    this.subscriptions = pageController.getSubscriptionsInstance();
    if (this.firstRun) {
      // The order of the subsequent calls matters because the modules depend on others in a certain
      // way.

      // Caution: Fragile code here - sectionManager.init() is placed above toc.init() and
      // commentManager.init(), to add event handlers for its methods quicker than `sectionManager`
      // and `toc` do for theirs:
      // 1. sectionManager.updateNewCommentsData() sets Section#newComments that is later used in
      //    toc.addCommentCount().
      // 2. sectionManager.updateNewCommentsData() must set Section#newComments before
      //    commentManager.registerSeen() registers them as seen (= not new, in section's
      //    terminology).
      sectionManager.init(this.subscriptions);

      updateChecker.init();
      toc.init(this.subscriptions);
      commentFormManager.init();
      commentManager.init();
      CommentForm.init();
      CommentFormInputTransformer.init();
      notifications.init();
      Parser.init();
    }
    pageController.setup(this.passedData.parseData?.text);
    toc.setup(this.passedData.parseData?.sections, this.passedData.parseData?.hidetoc);
    this.updateSignatureData();

    /**
     * Collection of all comments on the page ordered the same way as in the DOM.
     *
     * @see module:commentManager.getAll
     * @name comments
     * @type {Comment[]}
     * @memberof convenientDiscussions
     */
    cd.comments = commentManager.getAll();

    /**
     * Collection of all sections on the page ordered the same way as in the DOM.
     *
     * @see module:sectionManager.getAll
     * @name sections
     * @type {Section[]}
     * @memberof convenientDiscussions
     */
    cd.sections = sectionManager.getAll();
  }

  /**
   * Set some global variables related to the user signature.
   */
  updateSignatureData() {
    const signaturePrefix = settings.get('signaturePrefix');
    cd.g.userSignature = signaturePrefix + cd.g.signCode;

    const signatureContent = mw.user.options.get('nickname');
    const authorInSignatureMatch = signatureContent.match(
      new RegExp(cd.g.captureUserNamePattern, 'i')
    );
    /*
      Extract signature contents before the user name - in order to cut it out from comment
      endings when editing.

      Use the signature prefix only if it is other than `' '` (the default value).
      * If it is `' '`, the prefix in real life may as well be `\n` or `--` if the user created some
        specific comment using the native editor instead of CD. So we would want to remove the
        signature from such comments correctly. The space would be included in the signature anyway
        using `cd.config.signaturePrefixRegexp`.
      * If it is other than `' '`, it is unpredictable, so it is safer to include it in the pattern.
    */
    cd.g.userSignaturePrefixRegexp = authorInSignatureMatch
      ? new RegExp(
        (signaturePrefix === ' ' ? '' : mw.util.escapeRegExp(signaturePrefix)) +
        mw.util.escapeRegExp(signatureContent.slice(0, authorInSignatureMatch.index)) +
        '$'
      )
      : undefined;
  }

  /**
   * Generate regexps, patterns (strings to be parts of regexps), selectors from config values.
   */
  initPatterns() {
    const signatureEndingRegexp = cd.config.signatureEndingRegexp;
    cd.g.signatureEndingRegexp = signatureEndingRegexp
      ? new RegExp(
        signatureEndingRegexp.source + (signatureEndingRegexp.source.endsWith('$') ? '' : '$'),
        signatureEndingRegexp.flags
      )
      : undefined;

    const nss = mw.config.get('wgFormattedNamespaces');
    const nsIds = mw.config.get('wgNamespaceIds');

    const anySpace = (/** @type {string} */ s) => s.replace(/[ _]/g, '[ _]+').replace(/:/g, '[ _]*:[ _]*');
    const joinNsNames = (/** @type {number[]} */ ...ids) => (
      Object.keys(nsIds)
        .filter((key) => ids.includes(nsIds[key]))

        // Sometimes wgNamespaceIds has a string that doesn't transform into one of the keys of
        // wgFormattedNamespaces when converting the first letter to uppercase, like in Azerbaijani
        // Wikipedia (compare Object.keys(mw.config.get('wgNamespaceIds'))[4] = 'i̇stifadəçi' with
        // mw.config.get('wgFormattedNamespaces')[2] = 'İstifadəçi'). We simply add the
        // wgFormattedNamespaces name separately.
        .concat(ids.map((id) => nss[id]))

        .map(anySpace)
        .join('|')
    );

    const userNssAliasesPattern = joinNsNames(2, 3);
    cd.g.userNamespacesRegexp = new RegExp(`(?:^|:)(?:${userNssAliasesPattern}):(.+)`, 'i');

    const userNsAliasesPattern = joinNsNames(2);
    cd.g.userLinkRegexp = new RegExp(`^:?(?:${userNsAliasesPattern}):([^/]+)$`, 'i');
    cd.g.userSubpageLinkRegexp = new RegExp(`^:?(?:${userNsAliasesPattern}):.+?/`, 'i');

    const userTalkNsAliasesPattern = joinNsNames(3);
    cd.g.userTalkLinkRegexp = new RegExp(`^:?(?:${userTalkNsAliasesPattern}):([^/]+)$`, 'i');
    cd.g.userTalkSubpageLinkRegexp = new RegExp(`^:?(?:${userTalkNsAliasesPattern}):.+?/`, 'i');

    cd.g.contribsPages = cd.g.specialPageAliases.Contributions
      .concat('Contributions')
      .filter(unique)
      .map((alias) => `${nss[-1]}:${alias}`);

    const contribsPagesLinkPattern = cd.g.contribsPages.join('|');
    cd.g.contribsPageLinkRegexp = new RegExp(`^(?:${contribsPagesLinkPattern})/`);

    const contribsPagesPattern = anySpace(contribsPagesLinkPattern);
    cd.g.captureUserNamePattern = (
      `\\[\\[[ _]*:?(?:\\w*:){0,2}(?:(?:${userNssAliasesPattern})[ _]*:[ _]*|` +
      `(?:${contribsPagesPattern})\\/[ _]*)([^|\\]/]+)(/)?`
    );

    cd.g.isThumbRegexp = new RegExp(
      ['thumb', 'thumbnail']
        .concat(cd.config.thumbAliases)
        .map((alias) => `\\| *${alias} *[|\\]]`)
        .join('|')
    );

    const unsignedTemplatesPattern = cd.config.unsignedTemplates
      .map(generatePageNamePattern)
      .join('|');
    cd.g.unsignedTemplatesPattern = unsignedTemplatesPattern
      ? `(\\{\\{ *(?:${unsignedTemplatesPattern}) *\\| *([^}|]+?) *(?:\\| *([^}]+?) *)?\\}\\})`
      : undefined;

    const clearTemplatesPattern = cd.config.clearTemplates.map(generatePageNamePattern).join('|');
    const reflistTalkTemplatesPattern = cd.config.reflistTalkTemplates
      .map(generatePageNamePattern)
      .join('|');

    cd.g.keepInSectionEnding = [
      ...cd.config.keepInSectionEnding,
      clearTemplatesPattern
        ? new RegExp(`\\n+\\{\\{ *(?:${clearTemplatesPattern}) *\\}\\}\\s*$`)
        : undefined,
      reflistTalkTemplatesPattern
        ? new RegExp(`\\n+\\{\\{ *(?:${reflistTalkTemplatesPattern}) *\\}\\}.*\\s*$`)
        : undefined,
    ].filter(defined);

    const pieJoined = cd.g.popularInlineElements.join('|');
    cd.g.piePattern = `(?:${pieJoined})`;

    const pnieJoined = cd.g.popularNotInlineElements.join('|');
    cd.g.pniePattern = `(?:${pnieJoined})`;

    cd.g.articlePathRegexp = new RegExp(
      '^' +
      mw.util.escapeRegExp(mw.config.get('wgArticlePath')).replace(String.raw`\$1`, '(.*)')
    );
    cd.g.startsWithScriptTitleRegexp = new RegExp(
      '^' +
      mw.util.escapeRegExp(mw.config.get('wgScript') + '?title=')
    );
    const editActionpath = mw.config.get('wgActionPaths').edit;
    if (editActionpath) {
      cd.g.startsWithEditActionPathRegexp = new RegExp(
        '^' +
        mw.util.escapeRegExp(editActionpath).replace(String.raw`\$1`, '(.*)') +
        '.*'
      );
    }

    // Template names are not case-sensitive here for code simplicity.
    const quoteTemplateToPattern = (/** @type {string} */ tpl) =>
      String.raw`\{\{ *` + anySpace(mw.util.escapeRegExp(tpl));
    const quoteBeginningsPattern = ['<blockquote', '<q']
      .concat(cd.config.pairQuoteTemplates[0].map(quoteTemplateToPattern))
      .join('|');
    const quoteEndingsPattern = ['</blockquote>', '</q>']
      .concat(cd.config.pairQuoteTemplates[1].map(quoteTemplateToPattern))
      .join('|');
    cd.g.quoteRegexp = new RegExp(
      `(${quoteBeginningsPattern})([^]*?)(${quoteEndingsPattern})`,
      'ig'
    );

    cd.g.noSignatureClasses.push(...cd.config.noSignatureClasses);
    cd.g.noHighlightClasses.push(...cd.config.noHighlightClasses);

    const fileNssPattern = joinNsNames(6);
    cd.g.filePrefixPattern = `(?:${fileNssPattern}):`;

    const colonNssPattern = joinNsNames(6, 14);
    cd.g.colonNamespacesPrefixRegexp = new RegExp(`^:(?:${colonNssPattern}):`, 'i');

    cd.g.badCommentBeginnings = [
      ...cd.g.badCommentBeginnings,
      new RegExp(`^\\[\\[${cd.g.filePrefixPattern}.+\\n+(?=[*:#])`, 'i'),
      ...cd.config.badCommentBeginnings,
      clearTemplatesPattern
        ? new RegExp(`^\\{\\{ *(?:${clearTemplatesPattern}) *\\}\\} *\\n+`, 'i')
        : undefined,
    ].filter(defined);

    cd.g.pipeTrickRegexp = /(\[\[:?(?:[^|[\]<>\n:]+:)?([^|[\]<>\n]+)\|)(\]\])/g;

    cd.g.isProbablyWmfSulWiki =
      // Isn't true on diff, editing, history, and special pages, see
      // https://github.com/wikimedia/mediawiki-extensions-CentralNotice/blob/6100a9e9ef290fffe1edd0ccdb6f044440d41511/includes/CentralNoticeHooks.php#L398
      $('link[rel="dns-prefetch"]').attr('href') === '//meta.wikimedia.org' ||
      // Sites like wikitech.wikimedia.org, which is not a SUL wiki, will be included as well
      [
        'mediawiki.org',
        'wikibooks.org',
        'wikidata.org',
        'wikifunctions.org',
        'wikimedia.org',
        'wikinews.org',
        'wikipedia.org',
        'wikiquote.org',
        'wikisource.org',
        'wikiversity.org',
        'wikivoyage.org',
        'wiktionary.org',
      ].includes(
        mw.config.get('wgServerName')
          .split('.')
          .slice(-2)
          .join('.')
      );
  }

  /**
   * Initialize prototypes of elements and OOUI widgets.
   */
  initPrototypes() {
    // Initialize prototypes for the appropriate Comment class based on commentDisplay setting
    if (settings.get('commentDisplay') === 'spacious') {
      SpaciousComment.initPrototypes();
    } else {
      CompactComment.initPrototypes();
    }

    Section.initPrototypes();
    Thread.initPrototypes();
  }

  /**
   * Find comment signatures and section headings on the page.
   *
   * @private
   */
  findTargets() {
    const CommentClass =
      settings.get('commentDisplay') === 'spacious' ? SpaciousComment : CompactComment;

    this.parser = new Parser({
      CommentClass,
      SectionClass: Section,
      childElementsProp: 'children',
      follows: (n1, n2) =>
        Boolean(n2.compareDocumentPosition(n1) & Node.DOCUMENT_POSITION_FOLLOWING),
      getAllTextNodes: () => getAllTextNodes(pageController.rootElement),
      getElementByClassName: (el, className) => el.querySelector(`.${className}`),
      rootElement: pageController.rootElement,
      document,
      areThereOutdents: pageController.areThereOutdents,
      processAndRemoveDtElements,
      removeDtButtonHtmlComments,
    });
    this.parser.init();
    this.parser.processAndRemoveDtMarkup();
    this.targets = /** @type {import('./shared/Parser').Target<Node>[]} */ (
      this.parser.findHeadings()
    )
      .concat(this.parser.findSignatures())
      .sort((t1, t2) => this.parser.context.follows(t1.element, t2.element) ? 1 : -1);
  }

  /**
   * Parse the comments and modify the related parts of the DOM.
   *
   * @private
   */
  processComments() {
    try {
      this.targets
        .filter((target) => target.type === 'signature')
        .forEach((signature) => {
          try {
            commentManager.add(this.parser.createComment(signature, this.targets));
          } catch (error) {
            console.error(error);
          }
        });

      commentManager.setup();
    } catch (error) {
      console.error(error);
    }

    /**
     * The script has processed comments, except for reformatting them in
     * {@link commentManager.reformatComments} if the user opted in for that.
     *
     * @event commentsReady
     * @param {object} comments {@link convenientDiscussions.comments} object.
     * @param {object} cd {@link convenientDiscussions} object.
     */
    mw.hook('convenientDiscussions.commentsReady').fire(commentManager.getAll(), cd);
  }

  /**
   * Parse the sections and modify some parts of them.
   *
   * @private
   */
  processSections() {
    this.targets
      .filter((target) => target.type === 'heading')
      .forEach((heading) => {
        try {
          sectionManager.add(this.parser.createSection(heading, this.targets, this.subscriptions));
        } catch (error) {
          console.error(error);
        }
      });

    if (this.subscriptions instanceof DtSubscriptions) {
      // Can't do it earlier: we don't have section DT IDs until now.
      this.subscriptions.loadToTalkPage(this);
    }

    sectionManager.setup();

    // Dependent on sections being set
    Comment.processOutdents(this.parser);

    // Dependent on outdents being processed
    commentManager.connectBrokenThreads();

    // This runs after extracting sections because Comment#getParent needs sections to be set on
    // comments.
    commentManager.setDtIds(this.dtCommentIds);

    // Depends on DT IDs being set
    sectionManager.addMetadataAndActions();

    /**
     * The script has processed sections.
     *
     * @event sectionsReady
     * @param {object} sections {@link convenientDiscussions.sections} object.
     * @param {object} cd {@link convenientDiscussions} object.
     */
    mw.hook('convenientDiscussions.sectionsReady').fire(sectionManager.getAll(), cd);
  }

  /**
   * Do the required transformations if the page turned out to be not a talk page after all.
   *
   * @private
   */
  retractTalkPageType() {
    debug.stopTimer('main code');

    bootManager.setPageTypeTalk(false);

    const $disableLink = $('#footer-togglecd a');
    $disableLink
      .attr('href', /** @type {string} */ ($disableLink.attr('href')).replace(/0$/, '1'))
      .text(cd.s('footer-runcd'));

    bootManager.hideLoadingOverlay();
    this.debugLog();
  }

  /**
   * Disable some interfering methods in DiscussionTools to avoid double highlighting.
   *
   * @private
   */
  deactivateDtHighlight() {
    const deactivate = () => {
      const highlighter = mw.loader.getState('ext.discussionTools.init') === 'ready'
        ? mw.loader.moduleRegistry['ext.discussionTools.init'].packageExports['highlighter.js']
        : undefined;
      if (highlighter) {
        // Fake return value
        highlighter.highlightTargetComment = () => ({
          highlighted: [undefined],
          requested: [undefined],
        });

        highlighter.clearHighlightTargetComment = () => {};
      }
    };
    if (mw.loader.getState('ext.discussionTools.init') === 'loading') {
      mw.loader.using('ext.discussionTools.init').then(deactivate);
    } else {
      deactivate();
    }
  }

  /**
   * If a DT's comment form is present (for example, on `&action=edit&section=new` pages), remove it
   * and later replace it with ours, keeping the input.
   *
   * @returns {import('./CommentForm').CommentFormInitialState | undefined}
   * @private
   */
  hideDtNewTopicForm() {
    if (!cd.g.isDtNewTopicToolEnabled) return;

    // `:visible` to exclude the form hidden previously.
    const $dtNewTopicForm = $('.ext-discussiontools-ui-newTopic:visible');
    if (!$dtNewTopicForm.length) return;

    const $headline = $dtNewTopicForm
      .find('.ext-discussiontools-ui-newTopic-sectionTitle input[type="text"]');
    // eslint-disable-next-line no-one-time-vars/no-one-time-vars
    const headline = /** @type {string} */ ($headline.val());
    $headline.val('');

    const $comment = $dtNewTopicForm.find('textarea');
    // eslint-disable-next-line no-one-time-vars/no-one-time-vars
    const comment = $comment.textSelection('getContents');
    $comment.textSelection('setContents', '');

    // DT's comment form produces errors after opening a CD's comment form because of hard code in
    // WikiEditor that relies on $('#wpTextbox1'). We can't simply delete DT's dummy textarea
    // because it can show up unexpectedly right before WikiEditor's code is executed where it's
    // hard for us to wedge in.
    if ($('#wpTextbox1').length) {
      $('#wpTextbox1').remove();
    } else {
      const observer = new MutationObserver((records) => {
        const isReplyWidgetAdded = (/** @type {MutationRecord} */ record) =>
          [...record.addedNodes].some(
            (node) =>
              isElement(node) && node.classList.contains('ext-discussiontools-ui-replyWidget')
          );
        if (records.some(isReplyWidgetAdded)) {
          $('#wpTextbox1').remove();
          observer.disconnect();
        }
      });
      observer.observe(bootManager.$content[0], {
        childList: true,
        subtree: true,
      });
    }

    // Don't outright remove the element so that DT has time to save the draft as empty.
    $dtNewTopicForm.hide();

    // wgDiscussionToolsStartNewTopicTool looks like it regulates adding a new topic form on DT
    // init. This disables it for future page refreshes.
    mw.config.set('wgDiscussionToolsStartNewTopicTool', false);

    return {
      headline,
      comment,
      focus: true,
    };
  }

  /**
   * Process the data passed to the boot process related to target comments or section and perform
   * the relevant actions with it.
   *
   * @private
   */
  processPassedTargets() {
    const commentIds = this.passedData.commentIds;
    if (commentIds) {
      const comments = commentIds
        .map((id) => commentManager.getById(id))
        .filter(definedAndNotNull);
      if (comments.length) {
        // sleep() for Firefox, as above
        sleep().then(() => {
          Comment.scrollToFirstFlashAll(comments, {
            smooth: false,
            pushState: this.passedData.pushState,
          });
        });
      }
    } else if (this.passedData.sectionId) {
      const section = sectionManager.getById(this.passedData.sectionId);
      if (section) {
        if (this.passedData.pushState) {
          history.pushState(history.state, '', `#${section.id}`);
        }

        // sleep() for Firefox, as above
        sleep().then(() => {
          section.$heading.cdScrollTo('top', false);
        });
      }
    }
  }

  /**
   * Log debug data to the console.
   *
   * @private
   */
  debugLog() {
    debug.stopTimer('total time');

    const timePerComment = (
      (debug.getTimerTotal('main code') + debug.getTimerTotal('final code and rendering')) /
      commentManager.getCount()
    ).toFixed(2);

    debug.logAndResetTimer('total time');
    console.debug(`number of comments: ${commentManager.getCount()}`);
    console.debug(`per comment: ${timePerComment}`);
    debug.logAndResetEverything();
  }

  /**
   * Show popups to the user if needed.
   *
   * @private
   */
  async showPopups() {
    this.maybeSuggestDisableDt();

    await settings.maybeOnboardOntoSpaciousComments();
    await settings.maybeConfirmDesktopNotifications();
  }

  /**
   * Show a notification informing the user that CD is incompatible with DiscussionTools and
   * suggesting to disable DiscussionTools.
   *
   * @private
   */
  maybeSuggestDisableDt() {
    if (!cd.g.isDtReplyToolEnabled) return;

    const $message = wrapHtml(
      cd.sParse(
        'discussiontools-incompatible',
        'Special:Preferences#mw-prefsection-editing-discussion',
        'Special:GlobalPreferences#mw-prefsection-editing-discussion',
      ),
      {
        callbacks: {
          'cd-notification-disabledt': (_e, button) => {
            this.disableDt(false, button, notification);
          },
          'cd-notification-disableDtGlobally': (_e, button) => {
            this.disableDt(true, button, notification);
          },
        },
      }
    );
    if (!cd.config.useGlobalPreferences) {
      $message.find('.cd-notification-disableDtGlobally-wrapper').remove();
    }
    const notification = mw.notification.notify($message, {
      type: 'warn',
      autoHide: false,
    });
  }

  /**
   * Disable DT with a method supplied in a parameter.
   *
   * @param {boolean} globally
   * @param {import('./Button').default} button
   * @param {import('./notifications').Notification} notification
   * @private
   */
  async disableDt(globally, button, notification) {
    button.setPending(true);
    try {
      const options = {
        'discussiontools-replytool': '0',
        'discussiontools-newtopictool': '0',
        'discussiontools-topicsubscription': '0',
        'discussiontools-visualenhancements': '0',
      };

      // eslint-disable-next-line no-one-time-vars/no-one-time-vars
      const request = globally
        ? saveOptions(options, true).catch(handleApiReject)
        : cd
            .getApi()
            .saveOptions(options)
            .catch(handleApiReject);
      await request;
    } catch {
      mw.notify(wrapHtml(cd.sParse('error-settings-save')));

      return;
    } finally {
      button.setPending(false);
    }
    notification.$notification.hide();
    mw.notify(
      wrapHtml(cd.sParse('discussiontools-disabled'), {
        callbacks: {
          'cd-notification-refresh': () => {
            location.reload();
          },
        },
      })
    );
  }

  /**
   * Check if the page processed for the first time after it was loaded (i.e., not reloaded using
   * the script's refresh functionality).
   *
   * @returns {boolean}
   */
  isFirstRun() {
    return this.firstRun;
  }

  /**
   * _For internal use._ Add a comment ID to the registry.
   *
   * @param {string} id
   */
  addDtCommentId(id) {
    this.dtCommentIds.push(id);
  }
}

export default TalkPageBootProcess;
