import CdError from './CdError';
import Comment from './Comment';
import CommentForm from './CommentForm';
import Parser from './Parser';
import Section from './Section';
import Thread from './Thread';
import cd from './cd';
import controller from './controller';
import debug from './debug';
import init from './init';
import navPanel from './navPanel';
import pageNav from './pageNav';
import pageRegistry from './pageRegistry';
import settings from './settings';
import subscriptions from './subscriptions';
import toc from './toc';
import updateChecker from './updateChecker';
import userRegistry from './userRegistry';
import { formatDateNative } from './timestamp';
import { getLastArrayElementOrSelf, notNull, underlinesToSpaces, wrap } from './util';
import { getVisits, handleApiReject, setVisits } from './apiWrappers';
import { removeWikiMarkup } from './wikitext';
import { showConfirmDialog } from './ooui';

/**
 * Get all text nodes under the root element in the window (not worker) context.
 *
 * @returns {Node[]}
 * @private
 */
function getAllTextNodes() {
  const treeWalker = document.createTreeWalker(controller.rootElement, NodeFilter.SHOW_TEXT);
  let node;
  const textNodes = [];
  while ((node = treeWalker.nextNode())) {
    textNodes.push(node);
  }
  return textNodes;
}

/**
 * Deal with (remove or move in the DOM) the markup added to the page by DiscussionTools. This
 * function can be executed in the worker context (which is why it uses
 * `controller.getBootProcess()` to get the boot process instead of referencing the instance
 * directly).
 *
 * @param {Element[]|external:Element[]} elements
 */
function handleDtMarkup(elements) {
  // Reply Tool is officially incompatible with CD, so we don't care if it is enabled. New Topic
  // Tool doesn't seem to make difference for our purposes here.
  const moveNotRemove = (
    cd.g.IS_DT_TOPIC_SUBSCRIPTION_ENABLED ||

    // DT enabled by default. Don't know how to capture that another way.
    mw.loader.getState('ext.discussionTools.init') === 'ready'
  );
  let dtMarkupHavenElement;
  if (moveNotRemove) {
    if (!controller.getBootProcess().isPageFirstParsed()) {
      dtMarkupHavenElement = controller.$content.children('.cd-dtMarkupHaven').get(0);
    }
    if (!dtMarkupHavenElement) {
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
        controller.getBootProcess().addDtCommentId(el.id);
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

  // Reset some interfering methods
  if (mw.loader.moduleRegistry['ext.discussionTools.init']?.packageExports['highlighter.js']) {
    mw.loader.moduleRegistry['ext.discussionTools.init'].packageExports['highlighter.js']
      .highlightTargetComment = () => {};
    mw.loader.moduleRegistry['ext.discussionTools.init'].packageExports['highlighter.js']
      .clearHighlightTargetComment = () => {};
  }
}

/**
 * Data passed from the previous page state.
 *
 * @typedef {object} PassedData
 * @property {string} [html] HTML code of the page content to replace the current content with.
 * @property {string} [commentId] ID of a comment to scroll to.
 * @property {string} [sectionId] ID of a section to scroll to.
 * @property {string} [pushState] Whether to replace the URL in the address bar adding the comment
 *   ID to it if it's specified.
 * @property {boolean} [wasPageCreated] Whether the page was created while it was in the previous
 *   state. Affects navigation panel mounting and addition of certain event handlers.
 * @property {number} [scrollY] Page's Y offset.
 * @property {object[]} [unseenCommentIds] IDs of unseen comments on this page.
 * @property {string} [justWatchedSection] Section just watched so that there could be not enough
 *   time for it to be saved to the server.
 * @property {string} [justUnwatchedSection] Section just unwatched so that there could be not
 *   enough time for it to be saved to the server.
 * @property {boolean} [wasCommentFormSubmitted] Did the user just submit a comment form.
 * @global
 */

/**
 * Class representing the process of loading or reloading CD onto an article page.
 */
export default class BootProcess {
  /**
   * Create a boot process.
   *
   * @param {PassedData} passedData
   */
  constructor(passedData) {
    this.connectToCommentLinks = this.connectToCommentLinks.bind(this);
    this.highlightMentions = this.highlightMentions.bind(this);

    this.passedData = passedData || {};
    this.dtCommentIds = [];
  }

  /**
   * Pass some data to the booting process before executing it.
   *
   * @param {string} name
   * @param {*} value
   */
  passData(name, value) {
    const data = typeof name === 'string' ? { [name]: value } : name;
    Object.assign(this.passedData, data);
  }

  /**
   * Get the value of some parameter related to the boot process.
   *
   * @param {string} [name]
   * @returns {*}
   */
  data(name) {
    return name ? this.passedData[name] : this.passedData;
  }

  /**
   * Add a comment ID to the registry.
   *
   * @param {string} id
   */
  addDtCommentId(id) {
    this.dtCommentIds.push(id);
  }

  /**
   * Get the visits request.
   *
   * @returns {Promise}
   */
  getVisitsRequest() {
    return this.visitsRequest;
  }

  /**
   * Get the unix time of the previous visit.
   *
   * @returns {number}
   */
  getPreviousVisitUnixTime() {
    return this.previousVisitUnixTime;
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
   * Check whether the page is parsed for the first time.
   *
   * @returns {boolean}
   */
  isPageFirstParsed() {
    return this.firstRun || this.data('wasPageCreated');
  }

  /**
   * _For internal use._ Show a popup asking the user if they want to enable the new comment
   * formatting. Save the settings after they make the choice.
   *
   * @returns {Promise.<boolean>} Did the user enable comment reformatting.
   */
  async maybeSuggestEnableCommentReformatting() {
    if (settings.get('reformatComments') !== null) {
      return false;
    }

    const loadedSettings = await settings.load({ reuse: true });
    if (![null, undefined].includes(loadedSettings.reformatComments)) {
      return false;
    }

    const actions = [
      {
        label: cd.s('rc-suggestion-yes'),
        action: 'accept',
        flags: 'primary',
      },
      {
        label: cd.s('rc-suggestion-no'),
        action: 'reject',
      },
    ];
    const $body = $('<div>');
    const $imgOld = $('<img>')
      .attr('width', 626)
      .attr('height', 67)
      .attr('src', '//upload.wikimedia.org/wikipedia/commons/0/08/Convenient_Discussions_comment_-_old_format.png')
      .addClass('cd-rcnotice-img');
    const $arrow = $('<img>')
      .attr('width', 30)
      .attr('height', 30)
      .attr('src', "data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M16.58 8.59L11 14.17L11 2L9 2L9 14.17L3.41 8.59L2 10L10 18L18 10L16.58 8.59Z' fill='black'/%3E%3C/svg%3E")
      .addClass('cd-rcnotice-img cd-rcnotice-arrow');
    const $imgNew = $('<img>')
      .attr('width', 626)
      .attr('height', 118)
      .attr('src', '//upload.wikimedia.org/wikipedia/commons/d/da/Convenient_Discussions_comment_-_new_format.png')
      .addClass('cd-rcnotice-img');
    const $div = $('<div>')
      .addClass('cd-rcnotice-text')
      .html(wrap(cd.sParse('rc-suggestion'), {
        callbacks: {
          'cd-notification-settings': () => {
            controller.showSettingsDialog();
          },
        },
      }).$wrapper);
    $body.append($imgOld, $arrow, $imgNew, $div);
    const action = await showConfirmDialog($body, {
      size: 'large',
      actions,
    });
    if (action) {
      const promise = settings.saveSettingOnTheFly(
        loadedSettings,
        'reformatComments',
        action === 'accept'
      );
      try {
        await promise;
        return loadedSettings.reformatComments;
      } catch (e) {
        mw.notify(cd.s('error-settings-save'), { type: 'error' });
        console.warn(e);
      }
    }
  }

  /**
   * _For internal use._ Show a popup asking the user if they want to receive desktop notifications,
   * or ask for a permission if it has not been granted but the user has desktop notifications
   * enabled (for example, if they are using a browser different from where they have previously
   * used). Save the settings after they make the choice.
   */
  async maybeConfirmDesktopNotifications() {
    if (typeof Notification === 'undefined') return;

    if (
      settings.get('desktopNotifications') === 'unknown' &&
      Notification.permission !== 'denied'
    ) {
      // Avoid using the setting kept in `mw.user.options`, as it may be outdated. Also don't reuse
      // the previous settings request, as the settings might be changed in
      // suggestEnableCommentReformatting().
      const loadedSettings = await settings.load();
      if (['unknown', undefined].includes(loadedSettings.desktopNotifications)) {
        const actions = [
          {
            label: cd.s('dn-confirm-yes'),
            action: 'accept',
            flags: 'primary',
          },
          {
            label: cd.s('dn-confirm-no'),
            action: 'reject',
          },
        ];
        const action = await showConfirmDialog(cd.s('dn-confirm'), {
          size: 'medium',
          actions,
        });
        let promise;
        if (action === 'accept') {
          if (Notification.permission === 'default') {
            OO.ui.alert(cd.s('dn-grantpermission'));
            Notification.requestPermission((permission) => {
              if (permission === 'granted') {
                promise = settings.saveSettingOnTheFly(
                  loadedSettings,
                  'desktopNotifications',
                  'all'
                );
              } else if (permission === 'denied') {
                promise = settings.saveSettingOnTheFly(
                  loadedSettings,
                  'desktopNotifications',
                  'none'
                );
              }
            });
          } else if (Notification.permission === 'granted') {
            promise = settings.saveSettingOnTheFly(loadedSettings, 'desktopNotifications', 'all');
          }
        } else if (action === 'reject') {
          promise = settings.saveSettingOnTheFly(loadedSettings, 'desktopNotifications', 'none');
        }
        if (promise) {
          try {
            await promise;
          } catch (e) {
            mw.notify(cd.s('error-settings-save'), { type: 'error' })
            console.warn(e);
          }
        }
      }
    }

    if (
      !['unknown', 'none'].includes(settings.get('desktopNotifications')) &&
      Notification.permission === 'default'
    ) {
      await OO.ui.alert(cd.s('dn-grantpermission-again'), { title: cd.s('script-name') });
      Notification.requestPermission();
    }
  }

  /**
   * Make a search request and update the
   * {@link BootProcess#maybeAddNotFoundMessage not found message}.
   *
   * @param {object} data
   */
  async searchForNotFoundItem({
    date,
    decodedFragment,
    message,
    previousCommentByTimeText,
    searchQuery,
    sectionName,
    sectionNameDotDecoded,
    sectionWithSimilarNameText,
    token,
  }) {
    const resp = await controller.getApi().get({
      action: 'query',
      list: 'search',
      srsearch: searchQuery,
      srprop: sectionName ? 'sectiontitle' : undefined,

      // List more recent archives first
      srsort: 'create_timestamp_desc',

      srlimit: '20'
    });

    const results = resp?.query?.search;

    let searchUrl = mw.util.getUrl('Special:Search', {
      search: searchQuery,
      sort: 'create_timestamp_desc',
      cdcomment: date && decodedFragment,
    });
    searchUrl = cd.g.SERVER + searchUrl;

    if (results.length === 0) {
      let label;
      if (date) {
        label = (
          cd.sParse('deadanchor-comment-lead') +
          ' ' +
          cd.sParse('deadanchor-comment-notfound', searchUrl) +
          previousCommentByTimeText
        );
      } else {
        let notFoundText = '';

        // Possible use of a template in the section title.
        if (!(sectionWithSimilarNameText && sectionName.includes('{{'))) {
          notFoundText = ' ' + cd.sParse('deadanchor-section-notfound', searchUrl);
        }

        label = (
          cd.sParse('deadanchor-section-lead', sectionName) +
          notFoundText +
          sectionWithSimilarNameText
        );
      }
      message.setLabel(wrap(label));
    } else {
      let pageTitle;

      // Will either be sectionName or sectionNameDotDecoded.
      let sectionNameFound = sectionName;

      if (sectionName) {
        // Obtain the first exact section title match (which would be from the most recent
        // archive). This loop iterates over just one item in the vast majority of cases.
        for (const [, result] of Object.entries(results)) {
          if (
            result.sectiontitle &&
            [sectionName, sectionNameDotDecoded].includes(result.sectiontitle)
          ) {
            pageTitle = result.title;
            sectionNameFound = underlinesToSpaces(result.sectiontitle);
            break;
          }
        }
      } else {
        const pageTitles = [];
        for (const [, result] of Object.entries(results)) {
          const snippetText = removeWikiMarkup(result.snippet);
          if (snippetText && snippetText.includes(token)) {
            pageTitles.push(result.title);
          }
        }
        if (pageTitles.length === 1) {
          pageTitle = pageTitles[0];
        }
      }

      let label;
      if (pageTitle) {
        const wikilink = pageTitle + '#' + (date ? decodedFragment : sectionNameFound);
        label = date ?
          (
            cd.sParse('deadanchor-comment-exactmatch', wikilink, searchUrl) +
            previousCommentByTimeText
          ) :
          cd.sParse('deadanchor-section-exactmatch', sectionNameFound, wikilink, searchUrl);
      } else {
        label = date ?
          cd.sParse('deadanchor-comment-inexactmatch', searchUrl) + previousCommentByTimeText :
          cd.sParse('deadanchor-section-inexactmatch', sectionNameFound, searchUrl);
      }

      message.setLabel(wrap(label));
    }
  }

  /**
   * _For internal use._ Show a message at the top of the page that a section/comment was not found,
   * a link to search in the archive, and a link to the section/comment if it was found
   * automatically.
   *
   * @param {string} decodedFragment Decoded fragment.
   * @param {Date} [date] Comment date, if there is a comment ID in the fragment.
   * @param {string} [author] Comment author, if there is a comment ID in the fragment.
   */
  async maybeAddNotFoundMessage(decodedFragment, date, author) {
    let label;
    let previousCommentByTimeText = '';
    let sectionName;
    let sectionWithSimilarNameText = '';
    if (date) {
      label = cd.sParse('deadanchor-comment-lead');
      const previousCommentByTime = Comment.findPreviousCommentByTime(date, author);
      if (previousCommentByTime) {
        previousCommentByTimeText = (
          ' ' +
          cd.sParse('deadanchor-comment-previous', '#' + previousCommentByTime.id)
        )
          // Until https://phabricator.wikimedia.org/T288415 is resolved and online on most wikis.
          .replace(cd.g.ARTICLE_PATH_REGEXP, '$1');
        label += previousCommentByTimeText;
      }
    } else {
      sectionName = underlinesToSpaces(decodedFragment);
      label = cd.sParse('deadanchor-section-lead', sectionName);
      const sectionMatch = Section.findByHeadlineParts(sectionName);
      if (sectionMatch) {
        sectionWithSimilarNameText = (
          ' ' +
          cd.sParse('deadanchor-section-similar', '#' + sectionMatch.id, sectionMatch.headline)
        )
          // Until https://phabricator.wikimedia.org/T288415 is resolved and online on most wikis.
          .replace(cd.g.ARTICLE_PATH_REGEXP, '$1');

        // Possible use of a template in the section title. In such a case, it's almost always the
        // real match, so we show it immediately.
        if (sectionName.includes('{{')) {
          label += sectionWithSimilarNameText;
        }
      }
    }

    let sectionNameDotDecoded;
    let token;
    let searchQuery;
    if (cd.page.canHaveArchives()) {
      label += ' ';

      let sectionNameDotDecoded;
      if (date) {
        label += cd.sParse('deadanchor-comment-finding');
      } else {
        label += cd.sParse('deadanchor-section-finding');
        try {
          sectionNameDotDecoded = decodeURIComponent(
            sectionName.replace(/\.([0-9A-F]{2})/g, '%$1')
          );
        } catch {
          sectionNameDotDecoded = sectionName;
        }
      }

      token = date ?
        formatDateNative(date, false, cd.g.CONTENT_TIMEZONE) :
        sectionName.replace(/"/g, '');
      searchQuery = `"${token}"`
      if (sectionName && sectionName !== sectionNameDotDecoded) {
        const tokenDotDecoded = sectionNameDotDecoded.replace(/"/g, '');
        searchQuery += ` OR "${tokenDotDecoded}"`;
      }
      if (date) {
        // There can be a time difference between the time we know (taken from the history) and the
        // time on the page. We take it to be not more than 3 minutes for the time on the page.
        for (let gap = 1; gap <= 3; gap++) {
          const adjustedDate = new Date(date.getTime() - cd.g.MS_IN_MIN * gap);
          const adjustedToken = formatDateNative(adjustedDate, false, cd.g.CONTENT_TIMEZONE);
          searchQuery += ` OR "${adjustedToken}"`;
        }
      }
      const archivePrefix = cd.page.getArchivePrefix();
      searchQuery += ` prefix:${archivePrefix}`;
    }

    const message = new OO.ui.MessageWidget({
      type: 'warning',
      inline: true,
      label: wrap(label),
      classes: ['cd-message-notFound'],
    });
    controller.$root.prepend(message.$element);

    if (cd.page.canHaveArchives()) {
      this.searchForNotFoundItem({
        date,
        decodedFragment,
        message,
        previousCommentByTimeText,
        searchQuery,
        sectionName,
        sectionNameDotDecoded,
        sectionWithSimilarNameText,
        token,
      });
    }
  }

  /**
   * Show a notification informing the user that CD is incompatible with DiscussionTools and
   * suggesting to disable DiscussionTools.
   */
  maybeSuggestDisableDiscussionTools() {
    if (!cd.g.IS_DT_REPLY_TOOL_ENABLED) return;

    const message = cd.sParse('discussiontools-incompatible');
    const { $wrapper: $message, buttons: [disableButton] } = wrap(message, {
      callbacks: {
        'cd-notification-disabledt': async () => {
          disableButton.setPending(true);
          try {
            await controller.getApi().saveOptions({
              'discussiontools-replytool': 0,
              'discussiontools-newtopictool': 0,
              'discussiontools-topicsubscription': 0,
              'discussiontools-visualenhancements': 0,
            }).catch(handleApiReject);
          } catch (e) {
            mw.notify(wrap(cd.sParse('error-settings-save')));
            return;
          } finally {
            disableButton.setPending(false);
          }
          notification.$notification.hide();
          const message = wrap(cd.sParse('discussiontools-disabled'), {
            callbacks: {
              'cd-notification-refresh': () => {
                location.reload();
              },
            }
          }).$wrapper;
          mw.notify(message);
        },
      },
    });
    const notification = mw.notification.notify($message, {
      type: 'warn',
      autoHide: false,
    });
  }

  /**
   * Initialize or reset various systems required for the boot process. Some DOM preparations are
   * also made here.
   *
   * @private
   */
  async setup() {
    controller.reset(this.data('html'));
    toc.reset(this.data('toc'), this.data('hidetoc'));

    /**
     * Collection of all comments on the page ordered the same way as in the DOM.
     *
     * @name comments
     * @type {Comment[]}
     * @memberof convenientDiscussions
     */
    cd.comments = [];

    /**
     * Collection of all sections on the page ordered the same way as in the DOM.
     *
     * @name sections
     * @type {Section[]}
     * @memberof convenientDiscussions
     */
    cd.sections = [];

    if (this.firstRun) {
      await init.talkPage();
    } else {
      controller.$addSectionButtonContainer?.remove();

      // Just submitted form. Forms that should stay are detached in controller.reload().
      $('.cd-commentForm-addSection').remove();

      Comment.resetLayers();
    }
  }

  /**
   * Find comment signatures and section headings on the page.
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
      getElementByClassName: (node, className) => node.querySelector(`.${className}`),
      cloneNode: (node) => node.cloneNode(),
      rootElement: controller.rootElement,
      areThereOutdents: controller.areThereOutdents(),
      handleDtMarkup,
    });

    this.parser.processAndRemoveDtMarkup();
    const headings = this.parser.findHeadings();
    const timestamps = this.parser.findTimestamps();
    const signatures = this.parser.findSignatures(timestamps);
    this.targets = headings
      .concat(signatures)
      .sort((t1, t2) => this.parser.context.follows(t1.element, t2.element) ? 1 : -1);
  }

  /**
   * Combine two adjacent `.cd-commentLevel` elements into one, recursively going deeper in terms of
   * the nesting level.
   *
   * @private
   */
  mergeAdjacentCommentLevels() {
    const levels = controller.rootElement
      .querySelectorAll('.cd-commentLevel:not(ol) + .cd-commentLevel:not(ol)');
    if (!levels.length) return;

    const isOrHasCommentLevel = (el) => (
      (el.classList.contains('cd-commentLevel') && el.tagName !== 'OL') ||
      el.querySelector('.cd-commentLevel:not(ol)')
    );

    [...levels].forEach((bottomElement) => {
      const topElement = bottomElement.previousElementSibling;

      // If the previous element was removed in this cycle. (Or it could be absent for some other
      // reason? I can confirm that I witnessed a case where the element was absent, but didn't pay
      // attention why unfortunately.)
      if (!topElement) return;

      let currentTopElement = topElement;
      let currentBottomElement = bottomElement;
      do {
        const topTag = currentTopElement.tagName;
        const bottomInnerTags = {};
        if (topTag === 'UL') {
          bottomInnerTags.DD = 'LI';
        } else if (topTag === 'DL') {
          bottomInnerTags.LI = 'DD';
        }

        let firstMoved;
        if (isOrHasCommentLevel(currentTopElement)) {
          const firstElementChild = currentBottomElement.firstElementChild;

          /*
            Avoid collapsing adjacent LIs and DDs if we deal with a structure like this:
            <li>
              <div>Comment</div>
              <ul>Replies</ul>
            </li>
            <li>
              <div>Comment</div>
              <ul>Replies</ul>
            </li>
          */
          if (['DL', 'DD', 'UL', 'LI'].includes(firstElementChild.tagName)) {
            while (currentBottomElement.childNodes.length) {
              let child = currentBottomElement.firstChild;
              if (child.tagName) {
                if (bottomInnerTags[child.tagName]) {
                  child = controller.changeElementType(child, bottomInnerTags[child.tagName]);
                }
                if (firstMoved === undefined) {
                  firstMoved = child;
                }
              } else {
                if (firstMoved === undefined && child.textContent.trim()) {
                  // Don't fill the "firstMoved" variable which is used further to merge elements if
                  // there is a non-empty text node between. (An example that is now fixed:
                  // https://ru.wikipedia.org/wiki/Википедия:Форум/Архив/Викиданные/2018/1_полугодие#201805032155_NBS,
                  // but other can be on the loose.) Instead, wrap the text node into an element to
                  // prevent it from being ignored when searching next time for adjacent
                  // .commentLevel elements. This could be seen only as an additional precaution,
                  // since it doesn't fix the source of the problem: the fact that a bare text node
                  // is (probably) a part of the reply. It shouldn't be happening.
                  firstMoved = null;
                  const newChild = document.createElement('span');
                  newChild.appendChild(child);
                  child = newChild;
                }
              }
              currentTopElement.appendChild(child);
            }
            currentBottomElement.remove();
          }
        }

        currentBottomElement = firstMoved;
        currentTopElement = firstMoved?.previousElementSibling;
      } while (
        currentTopElement &&
        currentBottomElement &&
        isOrHasCommentLevel(currentBottomElement)
      );
    });
  }

  /**
   * Add the `'cd-connectToPreviousItem'` class to some item elements to visually connect threads
   * broken by some intervention.
   *
   * @private
   */
  connectBrokenThreads() {
    const items = [];

    controller.rootElement
      .querySelectorAll('dd.cd-comment-part-last + dd, li.cd-comment-part-last + li')
      .forEach((el) => {
        if (el.firstElementChild?.classList.contains('cd-commentLevel')) {
          items.push(el);
        }
      });

    // https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#202009202110_Example
    controller.rootElement
      .querySelectorAll('.cd-comment-replacedPart.cd-comment-part-last')
      .forEach((el) => {
        const possibleItem = el.parentNode.nextElementSibling;
        if (possibleItem?.firstElementChild?.classList.contains('cd-commentLevel')) {
          items.push(possibleItem);
        }
      });

    // https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#Image_breaking_a_thread
    controller.rootElement
      .querySelectorAll('.cd-commentLevel + .thumb + .cd-commentLevel > li')
      .forEach((el) => {
        items.push(el);
      });

    items.forEach((item) => {
      item.classList.add('cd-connectToPreviousItem');
    });
  }

  /**
   * Perform some DOM-related tasks after parsing comments.
   *
   * @private
   */
  adjustDom() {
    this.mergeAdjacentCommentLevels();
    this.mergeAdjacentCommentLevels();
    if (
      controller.rootElement.querySelector('.cd-commentLevel:not(ol) + .cd-commentLevel:not(ol)')
    ) {
      console.warn('.cd-commentLevel adjacencies have left.');
    }

    this.connectBrokenThreads();

    /*
      A very specific fix for cases when an indented comment starts with a list like this:

        : Comment. [signature]
        :* Item
        :* Item
        : Comment end. [signature]

      which gives the following DOM:

        <dd>
          <div>Comment. [signature]</div>
          <ul>
            <li>Item</li>
            <li>Item</li>
          </ul>
        </dd>
        <dd>Comment end. [signature]</dd>

      The code splits the parent item element ("dd" in this case) into two and puts the list in the
      second one. This fixes the thread feature behavior among other things.
    */
    cd.comments.slice(1).forEach((comment, i) => {
      const previousComment = cd.comments[i];
      if (comment.level === previousComment.level) {
        const previousCommentLastElement = previousComment
          .elements[previousComment.elements.length - 1];
        const potentialElement = previousCommentLastElement.nextElementSibling;
        if (
          ['DD', 'LI'].includes(previousCommentLastElement.parentNode.tagName) &&
          previousCommentLastElement.tagName === 'DIV' &&
          potentialElement === comment.elements[0] &&
          potentialElement.tagName === 'DIV'
        ) {
          previousComment.parser.splitParentAfterNode(potentialElement.previousSibling);
        }
      }
    });
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
            cd.comments.push(this.parser.createComment(signature, this.targets));
          } catch (e) {
            if (!(e instanceof CdError)) {
              console.error(e);
            }
          }
        });

      Comment.reformatTimestamps();

      // Faster than doing it for every individual comment.
      controller.rootElement
        .querySelectorAll('table.cd-comment-part .cd-signature, .cd-comment-part > table .cd-signature')
        .forEach((signature) => {
          const commentIndex = signature.closest('.cd-comment-part').dataset.cdCommentIndex;
          cd.comments[commentIndex].isInSingleCommentTable = true;
        });

      this.adjustDom();
    } catch (e) {
      console.error(e);
    }

    /**
     * The script has processed the comments, except for reformatting them in
     * {@link Comment.reformatComments} if the user opted in for that.
     *
     * @event commentsReady
     * @param {object} comments {@link convenientDiscussions.comments} object.
     * @param {object} cd {@link convenientDiscussions} object.
     */
    mw.hook('convenientDiscussions.commentsReady').fire(cd.comments, cd);
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
          const section = this.parser.createSection(heading, this.targets);
          cd.sections.push(section);
        } catch (e) {
          if (!(e instanceof CdError)) {
            console.error(e);
          }
        }
      });

    // Can't do it earlier: we don't have section IDs until now.
    if (settings.get('useTopicSubscription')) {
      subscriptions.load();
    }

    Section.adjust();

    // Dependent on sections being set
    Comment.processOutdents(this.parser);

    // This runs after extracting sections because Comment#getParent needs sections to be set on
    // comments.
    Comment.setDtIds(this.dtCommentIds);

    // Depends on DT ID being set
    Section.addMetadataAndActions();

    subscriptions.getLoadRequest().then(() => {
      Section.addSubscribeButtons();
      subscriptions.cleanUp();
      toc.highlightSubscriptions();
    });

    /**
     * The script has processed the sections.
     *
     * @event sectionsReady
     * @param {object} sections {@link convenientDiscussions.sections} object.
     * @param {object} cd {@link convenientDiscussions} object.
     */
    mw.hook('convenientDiscussions.sectionsReady').fire(cd.sections, cd);
  }

  /**
   * Do the required transformations if the page turned out to be not a talk page after all.
   */
  retractTalkPageness() {
    debug.stopTimer('main code');

    controller.setTalkPageness(false);

    const $disableLink = $('#footer-places-togglecd a');
    if ($disableLink.length) {
      $disableLink
        .attr('href', $disableLink.attr('href').replace(/0$/, '1'))
        .text(cd.s('footer-runcd'));
    }

    controller.hideLoadingOverlay();
    this.debugLog();
  }

  /**
   * Update the page's HTML.
   */
  layOutHtml() {
    const selector = this.data('wasPageCreated') ?
      '.noarticletext, .warningbox' :
      '.mw-parser-output';
    controller.$content
      // Warning boxes may contain log excerpts on pages that were previously deleted.
      .children(selector)

      .remove();
    controller.$content.prepend(controller.$root);
  }

  /**
   * Add an "Add topic" button to the bottom of the page if there is an "Add topic" tab. (Otherwise,
   * it may be added to a wrong place.)
   *
   * @private
   */
  addAddTopicButton() {
    if (
      !$('#ca-addsection').length ||

      // There is a special welcome text in New Topic tool for 404 pages.
      (cd.g.IS_DT_NEW_TOPIC_TOOL_ENABLED && !controller.doesPageExist())
    ) {
      return;
    }

    const addSectionButton = new OO.ui.ButtonWidget({
      label: cd.s('addtopic'),
      framed: false,
      classes: ['cd-button-ooui', 'cd-section-button'],
    }).on('click', () => {
      CommentForm.createAddSectionForm();
    });
    const $container = $('<div>')
      .addClass('cd-section-button-container cd-addTopicButton-container')
      .append(addSectionButton.$element)

      // If appending to controller.rootElement, it can land on a wrong place, like on 404 pages
      // with New Topic Tool enabled.
      .appendTo(controller.$content);
    controller.setAddSectionButtonContainer($container);
  }

  /**
   * Bind a click handler to every known "Add new topic" button.
   *
   * @private
   */
  connectToAddTopicButtons() {
    $(cd.g.ADD_TOPIC_SELECTOR)
      .filter(function () {
        const $button = $(this);

        // When DT's new topic tool is enabled
        if (
          mw.util.getParamValue('section') === 'new' &&
          $button.parent().attr('id') !== 'ca-addsection' &&
          !$button.closest(controller.$root).length
        ) {
          return false;
        }

        let pageName;
        if ($button.is('a')) {
          const href = $button.attr('href');
          let query;

          // May crash if the current URL contains undecodable "%" in the fragment.
          try {
            query = new mw.Uri(href).query;
          } catch {
            return;
          }
          pageName = getLastArrayElementOrSelf(query.title);
        } else if ($button.is('input')) {
          pageName = $button
            .closest('form')
            .find('input[name="title"][type="hidden"]')
            .val();
        } else {
          return false;
        }
        let page;
        try {
          page = pageRegistry.get(pageName);
        } catch (e) {
          return false;
        }
        if (page !== cd.page) {
          return false;
        }
        return true;
      })

      // DT may add its handler (as adds to a "Start new discussion" button on 404 pages). DT's "Add
      // topic" button click handler is trickier, see below.
      .off('click')

      .on('click.cd', controller.handleAddTopicButtonClick)
      .filter(function () {
        const $button = $(this);
        return (
          !cd.g.IS_DT_NEW_TOPIC_TOOL_ENABLED &&
          !($button.is('a') && Number(mw.util.getParamValue('cdaddtopic', $button.attr('href'))))
        );
      })
      .attr('title', cd.s('addtopicbutton-tooltip'));

    // In case DT's new topic tool is enabled, remove the handler of the "Add topic" button.
    const dtHandler = $._data(document.body).events?.click
      ?.find((event) => event.selector?.includes('data-mw-comment'))
      ?.handler;
    if (dtHandler) {
      $(document.body).off('click', dtHandler);
    }
  }

  /**
   * _For internal use._ Show a modal with content of comment forms that we were unable to restore
   * to the page (because their target comments/sections disappeared, for example).
   *
   * @param {object[]} content
   * @param {string} [content[].headline]
   * @param {string} content[].comment
   * @param {string} content[].summary
   */
  rescueCommentFormsContent(content) {
    const text = content
      .map((data) => {
        let text = data.headline !== undefined ?
          `${cd.s('rd-headline')}: ${data.headline}\n\n` :
          '';
        text += `${cd.s('rd-comment')}: ${data.comment}\n\n${cd.s('rd-summary')}: ${data.summary}`;
        return text;
      })
      .join('\n\n----\n');

    const input = new OO.ui.MultilineTextInputWidget({
      value: text,
      rows: 20,
    });
    const field = new OO.ui.FieldLayout(input, {
      align: 'top',
      label: cd.s('rd-intro'),
    });

    const dialog = new OO.ui.MessageDialog();
    controller.getWindowManager().addWindows([dialog]);
    controller.getWindowManager().openWindow(dialog, {
      message: field.$element,
      actions: [
        {
          label: cd.s('rd-close'),
          action: 'close',
        },
      ],
      size: 'large',
    });
  }

  /**
   * If a DT's comment form is present (for example, on `&action=edit&section=new` pages), remove it
   * and later replace it with ours, keeping the input.
   */
  hideDtNewTopicForm() {
    if (!cd.g.IS_DT_NEW_TOPIC_TOOL_ENABLED) return;

    let headline;
    let comment;
    const $dtNewTopicForm = $('.ext-discussiontools-ui-newTopic');
    if ($dtNewTopicForm.length) {
      const $headline = $dtNewTopicForm
        .find('.ext-discussiontools-ui-newTopic-sectionTitle input[type="text"]');
      headline = $headline.val();
      $headline.val('');

      const $comment = $dtNewTopicForm.find('textarea');
      comment = $comment.textSelection('getContents');
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
        observer.observe(controller.$content.get(0), {
          childList: true,
          subtree: true,
        });
      }

      // Don't outright remove the element so that DT has time to save the draft as empty.
      $dtNewTopicForm.hide();

      // This looks like it regulates adding a new topic form on DT init. This is for future page
      // refreshes.
      mw.config.set('wgDiscussionToolsStartNewTopicTool', false);

      this.dtNewTopicFormData = {
        headline,
        comment,
        focus: true,
      };
    }
  }

  /**
   * Add an "Add section" form if needed.
   */
  maybeAddAddSectionForm() {
    // May crash if the current URL contains undecodable "%" in the fragment,
    // https://phabricator.wikimedia.org/T207365.
    try {
      const uri = new mw.Uri();
      const query = uri.query;

      // &action=edit&section=new when DT's New Topic Tool is enabled.
      if (query.section === 'new' || Number(query.cdaddtopic) || this.dtNewTopicFormData) {
        CommentForm.createAddSectionForm(undefined, undefined, this.dtNewTopicFormData);

        delete query.action;
        delete query.section;
        delete query.cdaddtopic;
        history.replaceState(history.state, '', uri.toString());
      }
    } catch {
      // Empty
    }
  }

  /**
   * Add a condition to show a confirmation when trying to close the page with active comment forms
   * on it.
   */
  configureActiveCommentFormsConfirmation() {
    const alwaysConfirmLeavingPage = (
      mw.user.options.get('editondblclick') ||
      mw.user.options.get('editsectiononrightclick')
    );
    controller.addPreventUnloadCondition('commentForms', () => {
      CommentForm.saveSession(true);
      return (
        mw.user.options.get('useeditwarning') &&
        (
          CommentForm.getLastActiveAltered() ||
          (alwaysConfirmLeavingPage && cd.commentForms.length)
        )
      );
    });
  }

  /**
   * Mount, unmount or reset the {@link navPanel navigation panel}.
   */
  setupNavPanel() {
    if (controller.isPageActive()) {
      // Can be mounted not only on first parse, if using RevisionSlider, for example.
      if (!navPanel.isMounted()) {
        navPanel.mount();
      } else {
        navPanel.reset();
      }
    } else {
      if (navPanel.isMounted()) {
        navPanel.unmount();
      }
    }
  }

  /**
   * Perform URL fragment-related tasks.
   *
   * @private
   */
  async processFragment() {
    if (!this.firstRun) return;

    const fragment = location.hash.slice(1);
    const escapedFragment = $.escapeSelector(fragment);
    let decodedFragment;
    let escapedDecodedFragment;
    let commentId;
    try {
      decodedFragment = decodeURIComponent(fragment);
      escapedDecodedFragment = decodedFragment && $.escapeSelector(decodedFragment);
      if (Comment.isId(fragment)) {
        commentId = decodedFragment;
      }
    } catch (e) {
      console.error(e);
    }

    let date;
    let author;
    let comment;
    if (commentId) {
      ({ date, author } = Comment.parseId(commentId) || {});
      comment = Comment.getById(commentId, true);
    } else if (decodedFragment) {
      ({ comment, date, author } = Comment.getByDtId(decodedFragment, true) || {});
    }

    if (comment) {
      // setTimeout is for Firefox - for some reason, without it Firefox positions the underlay
      // incorrectly. (TODO: does it still? Need to check.)
      setTimeout(() => {
        comment.scrollTo({
          smooth: false,
          expandThreads: true,
        });

        // Replace CD's comment ID in the fragment with DiscussionTools' if available.
        let newFragment;
        if (comment.dtId) {
          newFragment = `#${comment.dtId}`;
        }
        const newState = Object.assign({}, history.state, { cdJumpedToComment: true });
        history.replaceState(newState, '', newFragment);
      });
    }

    if (decodedFragment && controller.isPageActive()) {
      const isTargetFound = (
        comment ||
        cd.config.idleFragments.includes(decodedFragment) ||
        decodedFragment.startsWith('/media/') ||
        $(':target').length ||
        $(`a[name="${escapedDecodedFragment}"]`).length ||
        $(`*[id="${escapedDecodedFragment}"]`).length ||
        $(`a[name="${escapedFragment}"]`).length ||
        $(`*[id="${escapedFragment}"]`).length
      );
      if (!isTargetFound) {
        await this.maybeAddNotFoundMessage(decodedFragment, date, author);
      }
    }
  }

  /**
   * Process the data passed to the boot process related to target comments or section and perform
   * the relevant actions with it.
   *
   * @private
   */
  async processTargets() {
    const commentIds = this.data('commentIds');
    let comments;
    if (commentIds) {
      comments = commentIds.map((id) => Comment.getById(id)).filter(notNull);
    }

    if (comments) {
      // setTimeout is for Firefox - for some reason, without it Firefox positions the underlay
      // incorrectly. (TODO: does it still? Need to check.)
      setTimeout(() => {
        comments[0].scrollTo({
          smooth: false,
          pushState: this.data('pushState'),
          flash: this.data('wasCommentFormSubmitted'),
        });

        if (!this.data('wasCommentFormSubmitted')) {
          comments.forEach((comment) => comment.flashTarget());
        }
      });
    }

    if (this.data('sectionId')) {
      const section = Section.getById(this.data('sectionId'));
      if (section) {
        if (this.data('pushState')) {
          history.pushState(history.state, '', `#${section.id}`);
        }

        // setTimeout for Firefox, as above
        setTimeout(() => {
          section.$heading.cdScrollTo('top', false);
        });
      }
    }
  }

  /**
   * Highlight new comments and update the navigation panel. A promise obtained from
   * {@link module:options.getVisits} should be provided.
   *
   * @fires newCommentsHighlighted
   * @private
   */
  async processVisits() {
    let visits;
    let currentPageVisits;
    try {
      ({ visits, currentPageVisits } = await this.visitsRequest);
    } catch (e) {
      console.warn('Couldn\'t load the settings from the server.', e);
      return;
    }

    if (currentPageVisits.length >= 1) {
      this.previousVisitUnixTime = Number(currentPageVisits[currentPageVisits.length - 1]);
    }

    const currentUnixTime = Math.floor(Date.now() / 1000);

    // Cleanup
    for (let i = currentPageVisits.length - 1; i >= 0; i--) {
      if (
        !settings.get('highlightNewInterval') ||
        currentPageVisits[i] < currentUnixTime - 60 * settings.get('highlightNewInterval') ||
        this.data('markAsRead')
      ) {
        currentPageVisits.splice(0, i);
        break;
      }
    }

    let currentTimeMatchesWithComment = false;
    if (currentPageVisits.length) {
      cd.comments.forEach((comment) => {
        if (!comment.date) {
          comment.isNew = false;
          comment.isSeen = true;
          return;
        }

        const commentUnixTime = Math.floor(comment.date.getTime() / 1000);
        if (commentUnixTime <= currentUnixTime && currentUnixTime < commentUnixTime + 60) {
          currentTimeMatchesWithComment = true;
        }
        const isUnseenStatePassed = (
          this.data('unseenCommentIds')?.some((id) => id === comment.id) ||
          false
        );
        const isNewerThanFirstRememberedVisit = commentUnixTime + 60 > currentPageVisits[0];
        const isOlderThanPreviousVisit = (
          commentUnixTime + 60 <= currentPageVisits[currentPageVisits.length - 1]
        );
        comment.isNew = isNewerThanFirstRememberedVisit || isUnseenStatePassed;
        comment.isSeen = (
          (
            !isNewerThanFirstRememberedVisit ||
            (settings.get('highlightNewInterval') && isOlderThanPreviousVisit) ||
            comment.isOwn
          ) &&
          !isUnseenStatePassed
        );
      });

      Comment.configureAndAddLayers(cd.comments.filter((comment) => comment.isNew));

      const unseenComments = cd.comments.filter((comment) => comment.isSeen === false);
      toc.addNewComments(Comment.groupBySection(unseenComments));
    }

    // TODO: keep the scrolling position even if adding the comment count moves the content.
    // (Currently this is done in toc.addNewComments().)
    toc.addCommentCount();

    // Reduce the probability that we will wrongfully mark a seen comment as unseen/new by adding a
    // minute to the current time if there is a comment with matched time. (Previously, the comment
    // time needed to be less than the current time which could result in missed comments if a
    // comment was sent the same minute when the page was loaded but after that moment.)
    currentPageVisits.push(String(currentUnixTime + currentTimeMatchesWithComment * 60));

    setVisits(visits);

    // Should be before `Comment.registerSeen()` to include all new comments in the metadata, even
    // those seen.
    Section.addNewCommentCountMetadata();

    Comment.registerSeen();
    navPanel.fill();

    /**
     * New comments have been highlighted.
     *
     * @event newCommentsHighlighted
     * @param {object} cd {@link convenientDiscussions} object.
     */
    mw.hook('convenientDiscussions.newCommentsHighlighted').fire(cd);
  }

  /**
   * Bind a click handler to comment links to make them work as in-script comment links.
   *
   * This method exists in addition to {@link controller.handlePopState}. It's preferrable to have
   * click events handled by this method instead of `controller.handlePopState` because that method,
   * if encounters `cdJumpedToComment` in the history state, doesn't scroll to the comment which is
   * a wrong behavior when the user clicks a link.
   *
   * @param {JQuery} $content
   * @private
   */
  connectToCommentLinks($content) {
    if (!$content.is('#mw-content-text, .cd-previewArea')) return;

    $content
      .find(`a[href^="#"]`)
      .filter(function () {
        return Comment.isAnyId($(this).attr('href').slice(1));
      })
      .on('click', function (e) {
        e.preventDefault();
        Comment.getByAnyId($(this).attr('href').slice(1), true)?.scrollTo({
          expandThreads: true,
          pushState: true,
        });
      });
  }

  /**
   * Highlight mentions of the current user.
   *
   * @param {external:jQuery} $content
   * @private
   */
  highlightMentions($content) {
    if (!$content.is('#mw-content-text, .cd-comment-part')) return;

    const currentUserName = cd.user.getName();
    const selector = $content.hasClass('cd-comment-part') ?
      `a[title$=":${currentUserName}"], a[title*=":${currentUserName} ("]` :
      `.cd-comment-part a[title$=":${currentUserName}"], .cd-comment-part a[title*=":${currentUserName} ("]`;
    const authorClassName = settings.get('reformatComments') ? 'cd-comment-author' : 'cd-signature';
    const excludeSelector = [authorClassName]
      .concat(cd.config.elementsToExcludeClasses)
      .map((name) => `.${name}`)
      .join(', ');
    $content
      .find(selector)
      .filter(function () {
        return (
          cd.g.USER_LINK_REGEXP.test(this.title) &&
          !this.closest(excludeSelector) &&
          Parser.processLink(this)?.userName === cd.user.getName()
        );
      })
      .each((i, link) => {
        link.classList.add('cd-currentUserLink');
      });
  }

  /**
   * Set up
   * {@link https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver MutationObserver} to
   * handle page mutations.
   */
  setupMutationObserver() {
    // Mutation observer doesn't follow all possible comment position changes (for example,
    // initiated with adding new CSS) unfortunately.
    setInterval(() => {
      controller.handlePageMutations();
    }, 1000);

    // Create the mutation observer in the next event cycle - let most DOM changes by CD and scripts
    // attached to the hooks to be made first to reduce the number of times it runs in vain. But if
    // we set a long delay, users will see comment backgrounds mispositioned for some time.
    setTimeout(() => {
      const observer = new MutationObserver((records) => {
        const layerClassRegexp = /^cd-comment(-underlay|-overlay|Layers)/;
        const areLayersOnly = records
          .every((record) => layerClassRegexp.test(record.target.className));
        if (areLayersOnly) return;

        controller.handlePageMutations();
      });
      observer.observe(controller.$content.get(0), {
        attributes: true,
        childList: true,
        subtree: true,
      });
    });
  }

  /**
   * Add event listeners to `window`, `document`, hooks; set up MutationObserver.
   */
  addEventListeners() {
    if (!settings.get('reformatComments')) {
      // The "mouseover" event allows to capture the state when the cursor is not moving but ends up
      // above a comment but not above any comment parts (for example, as a result of scrolling).
      // The benefit may be low compared to the performance cost, but it's unexpected when the user
      // scrolls a comment and it suddenly stops being highlighted because the cursor is between
      // neighboring <p>'s.
      $(document).on('mousemove mouseover', controller.handleMouseMove);
    }

    // We need the visibilitychange event because many things may move while the document is hidden,
    // and the movements are not processed when the document is hidden.
    $(document)
      .on('scroll visibilitychange', controller.handleScroll)
      .on('horizontalscroll.cd visibilitychange', controller.handleHorizontalScroll)
      .on('selectionchange', controller.handleSelectionChange);

    $(window)
      .on('resize orientationchange', controller.handleWindowResize)
      .on('popstate', controller.handlePopState);

    // Should be above "mw.hook('wikipage.content').fire" so that it runs for the whole page content
    // as opposed to "$('.cd-comment-author-wrapper')".
    mw.hook('wikipage.content').add(this.connectToCommentLinks, this.highlightMentions);
    mw.hook('convenientDiscussions.previewReady').add(this.connectToCommentLinks);

    this.setupMutationObserver();

    if (controller.isPageCommentable()) {
      $(document).on('keydown', controller.handleGlobalKeyDown);
    }

    mw.hook('wikipage.content').add(controller.handleWikipageContentHookFirings);
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
    const timePerComment = baseTime / cd.comments.length;

    debug.logAndResetTimer('total time');
    console.debug(`number of comments: ${cd.comments.length}`);
    console.debug(`per comment: ${timePerComment.toFixed(2)}`);
    debug.logAndResetEverything();
  }

  /**
   * Show popups to the user if needed.
   */
  async showPopups() {
    this.maybeSuggestDisableDiscussionTools();

    const didEnableCommentReformatting = await this.maybeSuggestEnableCommentReformatting();
    await this.maybeConfirmDesktopNotifications();
    if (didEnableCommentReformatting) {
      controller.reload();
    }
  }

  /**
   * _For internal use._ Execute the process.
   *
   * @param {boolean} isReload
   * @fires beforeParse
   * @fires commentsReady
   * @fires sectionsReady
   * @fires pageReady
   * @fires pageReadyFirstTime
   */
  async execute(isReload) {
    this.firstRun = !isReload;
    if (this.firstRun) {
      debug.stopTimer('loading data');
    }

    debug.startTimer('preparations');
    await this.setup();
    debug.stopTimer('preparations');

    debug.startTimer('main code');

    if (this.firstRun) {
      controller.saveRelativeScrollPosition();

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
             controller.isPageCommentable() reflects this level.
        2.2. The page exists (not a 404 page). controller.doesPageExists() shows this. (This
             includes archive pages and old revisions, which are not eligible to create comment
             forms on.) Such pages are parsed, the page navigation block is added to them.
        3. The page is active. This means, it's not a 404 page, not an archive page, and not an old
           revision. controller.isPageActive() is true when the page is of this level. The
           navigation panel is added to such pages, new comments are highlighted.

      We need to be accurate regarding which functionality should be turned on on which level. We
      should also make sure we only add this functionality once. The BootProcess#isPageFirstParsed()
      output reflects if the page is parsed for the first time.
    */

    if (controller.doesPageExist()) {
      if (!settings.get('useTopicSubscription')) {
        subscriptions.load();
      }

      if (controller.isPageActive()) {
        this.visitsRequest = getVisits(true);
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

    if (this.firstRun && !controller.isDefinitelyTalkPage() && !cd.comments.length) {
      this.retractTalkPageness();
      return;
    }

    if (controller.doesPageExist()) {
      debug.startTimer('process sections');
      this.processSections();
      debug.stopTimer('process sections');
    }

    if (this.data('html')) {
      debug.startTimer('laying out HTML');
      this.layOutHtml();
      debug.stopTimer('laying out HTML');
    }

    this.setupNavPanel();

    debug.stopTimer('main code');

    // Operations that need reflow, such as getBoundingClientRect(), and those dependent on them go
    // in this section.
    debug.startTimer('final code and rendering');

    if (controller.doesPageExist()) {
      // Should be above all code that deals with comment highlightable elements and comment levels
      // as this may alter that.
      Comment.reviewHighlightables();

      Comment.reformatComments();
    }

    // This updates some styles, shifting the offsets.
    controller.$root.addClass('cd-parsed');

    if (controller.isPageCommentable()) {
      this.addAddTopicButton();
      this.connectToAddTopicButtons();

      // Should be below the viewport position restoration as it may rely on elements that are made
      // hidden during the comment forms restoration. Should be below this.setupNavPanel() as it
      // calls navPanel.updateCommentFormButton() which depends on the navigation panel being
      // mounted.
      CommentForm.restoreSession(this.firstRun || this.data('isPageReloadedExternally'));

      this.hideDtNewTopicForm();
      this.maybeAddAddSectionForm();

      if (this.isPageFirstParsed()) {
        this.configureActiveCommentFormsConfirmation();
      }
    }

    if (controller.doesPageExist()) {
      // Should be below the comment form restoration for threads to be expanded correctly and also
      // to avoid repositioning threads after the addition of comment forms. Should be above the
      // viewport position restoration as it may shift the layout (if the viewport position
      // restoration relies on elements that are made hidden when threads are collapsed, the
      // algorithm finds the expand note). Should better be above comment highlighting
      // (`Comment.configureAndAddLayers()`, `processVisits()`) to avoid spending time on comments
      // in collapsed threads.
      Thread.init();

      // Should better be below the comment form restoration to avoid repositioning of layers
      // after the addition of comment forms.
      const commentsToAddLayersFor = cd.comments.filter((comment) => (
        comment.isOwn ||

        // Need to generate a gray line to close the gaps between adjacent list item elements. Do it
        // here, not after processing comments, to group all operations requiring reflow
        // together for performance reasons.
        comment.isLineGapped
      ));
      Comment.configureAndAddLayers(commentsToAddLayersFor);

      // Should be below Thread.init() as these methods may want to scroll to a comment in a
      // collapsed thread.
      this.processFragment();
      this.processTargets();

      if (controller.isPageActive()) {
        this.processVisits();

        // This should be below this.processVisits() because updateChecker.processRevisionsIfNeeded
        // needs the "previousVisitUnixTime" state to be set.
        updateChecker.init();
      } else {
        toc.addCommentCount();
      }

      if (this.isPageFirstParsed()) {
        pageNav.mount();

        this.addEventListeners();
      } else {
        pageNav.update();
      }

      if (settings.get('reformatComments') && cd.comments.length) {
        // Using the "wikipage.content" hook could theoretically disrupt code that needs to
        // process the whole page content, if it runs later than CD. But typically CD runs
        // relatively late.
        mw.hook(cd.config.hookToFireWithAuthorWrappers).fire($('.cd-comment-author-wrapper'));
      }
    }

    if (this.firstRun) {
      // Restore the initial viewport position in terms of visible elements, which is how the user
      // sees it.
      controller.restoreRelativeScrollPosition();
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

    // The next line is needed to calculate the rendering time: it won't complete until everything
    // gets rendered.
    controller.rootElement.getBoundingClientRect();

    debug.stopTimer('final code and rendering');

    this.debugLog();

    if (this.firstRun && controller.isPageActive() && cd.user.isRegistered()) {
      this.showPopups();
    }
  }
}
