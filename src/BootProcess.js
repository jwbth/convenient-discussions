import CdError from './CdError';
import Comment from './Comment';
import CommentForm from './CommentForm';
import CommentFormInputTransformer from './CommentFormInputTransformer';
import LiveTimestamp from './LiveTimestamp';
import Parser from './Parser';
import Section from './Section';
import Thread from './Thread';
import cd from './cd';
import commentFormRegistry from './commentFormRegistry';
import commentRegistry from './commentRegistry';
import controller from './controller';
import debug from './debug';
import init from './init';
import navPanel from './navPanel';
import notifications from './notifications';
import pageNav from './pageNav';
import processFragment from './processFragment';
import sectionRegistry from './sectionRegistry';
import settings from './settings';
import toc from './toc';
import updateChecker from './updateChecker';
import userRegistry from './userRegistry';
import { handleApiReject, saveOptions } from './utils-api';
import { definedAndNotNull, sleep } from './utils-general';
import { wrapHtml } from './utils-window';
import visits from './visits';

/**
 * Get all text nodes under the root element in the window (not worker) context.
 *
 * @returns {Node[]}
 * @private
 */
function getAllTextNodes() {
  const treeWalker = document.createNodeIterator(controller.rootElement, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while ((node = treeWalker.nextNode())) {
    nodes.push(node);
  }
  return nodes;
}

/**
 * Remove all html comments added by DiscussionTools related to reply buttons.
 *
 * @private
 */
function removeDtButtonHtmlComments() {
  const treeWalker = document.createNodeIterator(controller.rootElement, NodeFilter.SHOW_COMMENT);
  let node;
  while ((node = treeWalker.nextNode())) {
    if (node.textContent.startsWith('__DTREPLYBUTTONS__')) {
      node.remove();
    }
  }
}

/**
 * Deal with (remove or move in the DOM) the markup added to the page by DiscussionTools.
 *
 * @param {Element[]|external:Element[]} elements
 * @param {import('./BootProcess').default} [bootProcess]
 *
 * @private
 */
function processAndRemoveDtElements(elements, bootProcess) {
  // Reply Tool is officially incompatible with CD, so we don't care if it is enabled. New Topic
  // Tool doesn't seem to make difference for our purposes here.
  const moveNotRemove = (
    cd.g.isDtTopicSubscriptionEnabled ||

    // DT enabled by default. Don't know how to capture that another way.
    !['registered', null].includes(mw.loader.getState('ext.discussionTools.init'))
  );
  let dtMarkupHavenElement;
  if (moveNotRemove) {
    if (!bootProcess.isFirstRun()) {
      dtMarkupHavenElement = controller.$content.children('.cd-dtMarkupHaven')[0];
    }
    if (dtMarkupHavenElement) {
      dtMarkupHavenElement.innerHTML = '';
    } else {
      dtMarkupHavenElement = document.createElement('span');
      dtMarkupHavenElement.className = 'cd-dtMarkupHaven cd-hidden';
      controller.$content.append(dtMarkupHavenElement);
    }
  }

  elements
    .concat(
      [...controller.rootElement.getElementsByClassName('ext-discussiontools-init-highlight')]
    )
    .forEach((el, i) => {
      if (el.hasAttribute('data-mw-comment-start') && Comment.isDtId(el.id)) {
        bootProcess.addDtCommentId(el.id);
      }
      if (moveNotRemove) {
        // DT gets the DOM offset of each of these elements upon initialization which can take a lot
        // of time if the elements aren't put into containers with less children.
        if (i % 10 === 0) {
          dtMarkupHavenElement.appendChild(document.createElement('span'));
        }
        dtMarkupHavenElement.lastChild.appendChild(el);
      } else {
        el.remove();
      }
    });
  if (!moveNotRemove) {
    [...controller.rootElement.getElementsByTagName('span[data-mw-comment]')].forEach((el) => {
      el.removeAttribute('data-mw-comment');
    });
  }
}

/**
 * Data passed from the previous page state.
 *
 * @typedef {object} PassedData
 * @property {string} [parseData] Response to the parse request from the API.
 * @property {string} [commentId] ID of a comment to scroll to.
 * @property {string} [sectionId] ID of a section to scroll to.
 * @property {string} [pushState] Whether to replace the URL in the address bar adding the comment
 *   ID to it if it's specified.
 * @property {number} [scrollY] Page's Y offset.
 * @property {object[]} [unseenCommentIds] IDs of unseen comments on this page.
 * @property {string} [justWatchedSection] Section just watched so that there could be not enough
 *   time for it to be saved to the server.
 * @property {string} [justUnwatchedSection] Section just unwatched so that there could be not
 *   enough time for it to be saved to the server.
 * @property {boolean} [wasCommentFormSubmitted] Did the user just submit a comment form.
 */

/**
 * Class representing the process of loading or reloading CD onto an article page. In some sense, it
 * is a (re-)builder for {@link module:controller controller}.
 */
class BootProcess {
  /**
   * Create a boot process.
   *
   * @param {PassedData} [passedData={}]
   */
  constructor(passedData = {}) {
    this.passedData = passedData;
    this.dtCommentIds = [];
  }

  /**
   * Add a comment ID to the registry.
   *
   * @param {string} id
   * @private
   */
  addDtCommentId(id) {
    this.dtCommentIds.push(id);
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
        'discussiontools-replytool': 0,
        'discussiontools-newtopictool': 0,
        'discussiontools-topicsubscription': 0,
        'discussiontools-visualenhancements': 0,
      };
      if (globally) {
        await saveOptions(options, true).catch(handleApiReject);
      } else {
        await controller.getApi().saveOptions({
          'discussiontools-topicsubscription': 1,
        }).catch(handleApiReject);
      }
    } catch (e) {
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
          'cd-notification-disabledt': (e, button) => {
            this.disableDt(false, button, notification);
          },
          'cd-notification-disableDtGlobally': (e, button) => {
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
   * Setup various components required for the boot process. Some DOM preparations are also made
   * here.
   *
   * @private
   */
  async setup() {
    if (this.firstRun) {
      await init.talkPage();
    }
    this.subscriptions = controller.getSubscriptionsInstance();
    if (this.firstRun) {
      // The order of the subsequent calls matter because modules depend on others in a certain way.

      visits.init();

      // A little dirty code here - sectionRegistry.init() is placed above toc.init() and
      // commentRegistry.init(), to add event handlers for its methods quicker than
      // `sectionRegistry` and `toc` do for theirs:
      // 1. sectionRegistry.updateNewCommentsData() sets Section#newComments that is later used in
      //    toc.addCommentCount().
      // 2. sectionRegistry.updateNewCommentsData() must set Section#newComments before
      //    commentRegistry.registerSeen() registers them as seen (= not new, in section's
      //    terminology).
      sectionRegistry.init(this.subscriptions);

      updateChecker.init();
      toc.init(this.subscriptions);
      commentFormRegistry.init();
      commentRegistry.init();
      LiveTimestamp.init();
      CommentForm.init();
      CommentFormInputTransformer.init();
      notifications.init();
      Parser.init();
    }
    controller.setup(this.passedData.parseData?.text);
    toc.setup(this.passedData.parseData?.sections, this.passedData.parseData?.hidetoc);

    /**
     * Collection of all comments on the page ordered the same way as in the DOM.
     *
     * @see module:commentRegistry.getAll
     * @name comments
     * @type {Comment[]}
     * @memberof convenientDiscussions
     */
    cd.comments = commentRegistry.getAll();

    /**
     * Collection of all sections on the page ordered the same way as in the DOM.
     *
     * @see module:sectionRegistry.getAll
     * @name sections
     * @type {Section[]}
     * @memberof convenientDiscussions
     */
    cd.sections = sectionRegistry.getAll();
  }

  /**
   * Find comment signatures and section headings on the page.
   *
   * @private
   */
  findTargets() {
    this.parser = new Parser({
      CommentClass: Comment,
      SectionClass: Section,
      childElementsProp: 'children',
      follows: (el1, el2) => Boolean(
        el2.compareDocumentPosition(el1) & Node.DOCUMENT_POSITION_FOLLOWING
      ),
      getAllTextNodes,
      getElementByClassName: (el, className) => el.querySelector(`.${className}`),
      rootElement: controller.rootElement,
      areThereOutdents: controller.areThereOutdents.bind(controller),
      processAndRemoveDtElements,
      removeDtButtonHtmlComments,
    });
    this.parser.init();
    this.parser.processAndRemoveDtMarkup(this);
    this.targets = this.parser.findHeadings()
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
            commentRegistry.add(this.parser.createComment(signature, this.targets));
          } catch (e) {
            if (!(e instanceof CdError)) {
              console.error(e);
            }
          }
        });

      commentRegistry.setup();
    } catch (e) {
      console.error(e);
    }

    /**
     * The script has processed comments, except for reformatting them in
     * {@link commentRegistry.reformatComments} if the user opted in for that.
     *
     * @event commentsReady
     * @param {object} comments {@link convenientDiscussions.comments} object.
     * @param {object} cd {@link convenientDiscussions} object.
     */
    mw.hook('convenientDiscussions.commentsReady').fire(commentRegistry.getAll(), cd);
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
          sectionRegistry.add(this.parser.createSection(heading, this.targets, this.subscriptions));
        } catch (e) {
          if (!(e instanceof CdError)) {
            console.error(e);
          }
        }
      });

    if (this.subscriptions.getType() === 'dt') {
      // Can't do it earlier: we don't have section DT IDs until now.
      this.subscriptions.loadToTalkPage(this);
    }

    sectionRegistry.setup();

    // Dependent on sections being set
    Comment.processOutdents(this.parser);

    // Dependent on outdents being processed
    commentRegistry.connectBrokenThreads();

    // This runs after extracting sections because Comment#getParent needs sections to be set on
    // comments.
    commentRegistry.setDtIds(this.dtCommentIds);

    // Depends on DT IDs being set
    sectionRegistry.addMetadataAndActions();

    /**
     * The script has processed sections.
     *
     * @event sectionsReady
     * @param {object} sections {@link convenientDiscussions.sections} object.
     * @param {object} cd {@link convenientDiscussions} object.
     */
    mw.hook('convenientDiscussions.sectionsReady').fire(sectionRegistry.getAll(), cd);
  }

  /**
   * Do the required transformations if the page turned out to be not a talk page after all.
   *
   * @private
   */
  retractTalkPageness() {
    debug.stopTimer('main code');

    controller.setTalkPageness(false);

    const $disableLink = $('#footer-places-togglecd a');
    $disableLink
      .attr('href', $disableLink.attr('href').replace(/0$/, '1'))
      .text(cd.s('footer-runcd'));

    controller.hideLoadingOverlay();
    this.debugLog();
  }

  /**
   * Disable some interfering methods in DiscussionTools to avoid double highlighting.
   *
   * @private
   */
  deactivateDtHighlight() {
    const highlighter = mw.loader.moduleRegistry['ext.discussionTools.init']
      ?.packageExports['highlighter.js'];
    if (highlighter) {
      highlighter.highlightTargetComment = () => { };
      highlighter.clearHighlightTargetComment = () => { };
    }
  }

  /**
   * If a DT's comment form is present (for example, on `&action=edit&section=new` pages), remove it
   * and later replace it with ours, keeping the input.
   *
   * @returns {?object}
   * @private
   */
  hideDtNewTopicForm() {
    if (!cd.g.isDtNewTopicToolEnabled) {
      return null;
    }

    // `:visible` to exclude the form hidden previously.
    const $dtNewTopicForm = $('.ext-discussiontools-ui-newTopic:visible');
    if (!$dtNewTopicForm.length) {
      return null;
    }

    const $headline = $dtNewTopicForm
      .find('.ext-discussiontools-ui-newTopic-sectionTitle input[type="text"]');
    const headline = $headline.val();
    $headline.val('');

    const $comment = $dtNewTopicForm.find('textarea');
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
        const isReplyWidgetAdded = (record) => (
          [...record.addedNodes]
            .some((node) => node.classList?.contains('ext-discussiontools-ui-replyWidget'))
        );
        if (records.some(isReplyWidgetAdded)) {
          $('#wpTextbox1').remove();
          observer.disconnect();
        }
      });
      observer.observe(controller.$content[0], {
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
        .map((id) => commentRegistry.getById(id))
        .filter(definedAndNotNull);
      if (comments.length) {
        // sleep() for Firefox, as above
        sleep().then(() => {
          // A tricky case with flashing is when a comment is in a collapsed thread. In this case,
          // we must use Comment#scrollTo to make sure it is flashed when the thread is uncollapsed
          // by clicking a link in the notification.
          const flashOne = this.passedData.wasCommentFormSubmitted || this.passedData.pushState;
          comments[0].scrollTo({
            smooth: false,
            pushState: this.passedData.pushState,
            flash: flashOne,
          });
          if (!flashOne) {
            comments.forEach((comment) => comment.flashTarget());
          }
        });
      }
    } else if (this.passedData.sectionId) {
      const section = sectionRegistry.getById(this.passedData.sectionId);
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

    const baseTime = (
      debug.getTimerTotal('main code') +
      debug.getTimerTotal('final code and rendering')
    );
    const timePerComment = baseTime / commentRegistry.getCount();

    debug.logAndResetTimer('total time');
    console.debug(`number of comments: ${commentRegistry.getCount()}`);
    console.debug(`per comment: ${timePerComment.toFixed(2)}`);
    debug.logAndResetEverything();
  }

  /**
   * Show popups to the user if needed.
   *
   * @private
   */
  async showPopups() {
    this.maybeSuggestDisableDt();

    const didEnableCommentReformatting = await settings.maybeSuggestEnableCommentReformatting();
    await settings.maybeConfirmDesktopNotifications();
    if (didEnableCommentReformatting) {
      controller.reload();
    }
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
    await this.setup();
    debug.stopTimer('preparations');

    debug.startTimer('main code');

    if (this.firstRun) {
      controller.saveRelativeScrollPosition(undefined, this.passedData.scrollY);

      userRegistry.loadMuted();
    }

    /*
      To make things systematized, we have 4 possible assessments of page activeness as a talk page,
      sorted by the scope of enabled features. Each level includes the next ones; 3 is the
      intersection of 2.1 and 2.2.
        1. The page is a wikitext (article) page.
        2. The page is likely a talk page. controller.isTalkPage() reflects that. We may reevaluate
           page as being not a talk page (see BootProcess#retractTalkPageness()) if we don't find
           any comments on it and several other criteria are not met. Likely talk pages are divided
           into two categories:
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

      if (this.subscriptions.getType() === 'legacy') {
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

    if (this.firstRun && !controller.isDefinitelyTalkPage() && !commentRegistry.getCount()) {
      this.retractTalkPageness();
      return;
    }

    if (cd.page.exists()) {
      debug.startTimer('process sections');
      this.processSections();
      debug.stopTimer('process sections');
    } else {
      if (this.subscriptions.getType() === 'dt') {
        this.subscriptions.loadToTalkPage(this);
      }
    }

    if (this.passedData.parseData?.text) {
      debug.startTimer('update page contents');
      controller.updatePageContents(this.passedData.parseData);
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
    commentRegistry.reviewHighlightables();

    commentRegistry.reformatComments();

    // This updates some styles, shifting the offsets.
    controller.$root.addClass('cd-parsed');

    // Should be below navPanel.setup() as commentFormRegistry.restoreSession() indirectly calls
    // navPanel.updateCommentFormButton() which depends on the navigation panel being mounted.
    if (cd.page.isCommentable()) {
      if (this.firstRun) {
        cd.page.addAddTopicButton();
      }
      controller.connectToAddTopicButtons();

      // If the viewport position restoration relies on elements that are made hidden during this
      // (when editing a comment), it can't be restored properly, but this is relatively minor
      // detail.
      commentFormRegistry.restoreSession(this.firstRun || this.passedData.isPageReloadedExternally);

      cd.page.autoAddSection(this.hideDtNewTopicForm());
    }

    if (cd.page.exists()) {
      // Should be below the comment form restoration for threads to be expanded correctly and also
      // to avoid repositioning threads after the addition of comment forms. Should be above the
      // viewport position restoration as it may shift the layout (if the viewport position
      // restoration relies on elements that are made hidden when threads are collapsed, the
      // algorithm finds the expand note). Should better be above comment highlighting
      // (commentRegistry.configureAndAddLayers(), visits#process()) to avoid spending time on
      // comments in collapsed threads.
      Thread.init();

      // Should better be below the comment form restoration to avoid repositioning of layers
      // after the addition of comment forms.
      commentRegistry.configureAndAddLayers((c) => (
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

      pageNav.setup(this);

      if (this.firstRun) {
        controller.addEventListeners();
      }

      // We set up the mutation observer at every reload because controller.$content may change
      // (e.g. RevisionSlider replaces it).
      controller.setupMutationObserver();

      if (settings.get('reformatComments') && commentRegistry.getCount()) {
        // Using the wikipage.content hook could theoretically disrupt code that needs to process
        // the whole page content, if it runs later than CD. But typically CD runs relatively late.
        mw.hook(cd.config.hookToFireWithAuthorWrappers).fire($('.cd-comment-author-wrapper'));
      }
    }

    if (this.firstRun) {
      // Restore the initial viewport position in terms of visible elements, which is how the user
      // sees it.
      controller.restoreRelativeScrollPosition();

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

    controller.hideLoadingOverlay();

    // This is needed to calculate the rendering time: it won't complete until everything gets
    // rendered.
    controller.rootElement.getBoundingClientRect();

    debug.stopTimer('final code and rendering');

    this.debugLog();

    if (this.firstRun && cd.page.isActive() && cd.user.isRegistered()) {
      this.showPopups();
    }
  }
}

export default BootProcess;
