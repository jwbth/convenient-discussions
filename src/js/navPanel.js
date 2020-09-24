/**
 * Navigation panel and new comments-related functions and configuration.
 *
 * @module navPanel
 */

import CdError from './CdError';
import Comment from './Comment';
import Section from './Section';
import cd from './cd';
import userRegistry from './userRegistry';
import { addNotification, closeNotifications, getNotifications, reloadPage } from './boot';
import { areObjectsEqual, handleApiReject, isCommentEdit, reorderArray, unique } from './util';
import { getUserGenders, makeRequestNoTimers } from './apiWrappers';
import { setVisits } from './options';

let newCount;
let unseenCount;
let lastFirstTimeSeenCommentId;
let newRevisions = [];
let notifiedAbout = [];
let isBackgroundCheckArranged = false;
let relevantNewCommentAnchor;

/**
 * Tell the worker to wake the script up after a given interval.
 *
 * Chrome and probably other browsers throttle background tabs. To bypass this, we use a web worker
 * to wake the script up when we say, making it work as an alarm clock.
 *
 * @param {number} interval
 * @private
 */
function setAlarmViaWorker(interval) {
  if (Number.isNaN(Number(interval))) return;
  cd.g.worker.postMessage({
    type: 'setAlarm',
    interval,
  });
}

/**
 * Remove an alarm set in {@link module:navPanel#setAlarmViaWorker}.
 *
 * @private
 */
function removeAlarmViaWorker() {
  cd.g.worker.postMessage({ type: 'removeAlarm' });
}

/**
 * Filter out values of an object that can't be safely passed to worker (see {@link
 * https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm}}).
 *
 * @param {object} obj
 * @param {Array} allowedFuncNames Names of the properties that should be passed to the worker
 *   despite their values are functions (they are passed in a stringified form).
 * @returns {object}
 * @private
 */
function keepWorkerSafeValues(obj, allowedFuncNames = []) {
  const newObj = Object.assign({}, obj);
  Object.keys(newObj).forEach((key) => {
    const val = newObj[key];
    if (
      typeof val === 'object' &&
      val !== null &&
      !(val instanceof RegExp || val instanceof Date)
    ) {
      try {
        if (!areObjectsEqual(val, JSON.parse(JSON.stringify(val)))) {
          delete newObj[key];
        }
      } catch (e) {
        delete newObj[key];
      }
    } else if (typeof val === 'function') {
      if (allowedFuncNames.includes(key)) {
        newObj[key] = val.toString();
      } else {
        delete newObj[key];
      }
    }
  });
  return newObj;
}

/**
 * Process the current page in the worker context.
 */
export async function processPageInBackground() {
  const { text } = await cd.g.CURRENT_PAGE.parse({
    noTimers: true,
    markAsRead: false,
  }) || {};
  cd.g.worker.postMessage({
    type: 'parse',
    text,
    g: keepWorkerSafeValues(cd.g, ['IS_IPv6_ADDRESS', 'TIMESTAMP_PARSER']),
    config: keepWorkerSafeValues(cd.config, ['checkForCustomForeignComponents']),
  });
}

/**
 * Check for new comments in a web worker, update the navigation panel, and schedule the next check.
 *
 * @private
 */
async function checkForNewComments() {
  if (document.hidden && !isBackgroundCheckArranged) {
    const callback = () => {
      $(document).off('visibilitychange', callback);
      isBackgroundCheckArranged = false;
      removeAlarmViaWorker();
      checkForNewComments();
    };
    $(document).on('visibilitychange', callback);

    const interval = Math.abs(
      cd.g.BACKGROUND_NEW_COMMENTS_CHECK_INTERVAL -
      cd.g.NEW_COMMENTS_CHECK_INTERVAL
    );
    setAlarmViaWorker(interval * 1000);
    isBackgroundCheckArranged = true;
    return;
  }

  // Precaution
  isBackgroundCheckArranged = false;

  const rvstartid = newRevisions.length ?
    newRevisions[newRevisions.length - 1] :
    mw.config.get('wgRevisionId');

  try {
    const resp = await makeRequestNoTimers({
      action: 'query',
      titles: cd.g.CURRENT_PAGE.name,
      prop: 'revisions',
      rvprop: ['ids', 'flags', 'size', 'comment'],
      rvdir: 'newer',
      rvstartid,
      rvlimit: 500,
      redirects: true,
      formatversion: 2,
    }).catch(handleApiReject);

    const revisions = resp?.query?.pages?.[0]?.revisions;
    if (!revisions) {
      throw new CdError({
        type: 'api',
        code: 'noData',
      });
    }

    const addedNewRevisions = revisions
      .filter((revision, i) => (
        i !== 0 &&
        !revision.minor &&
        Math.abs(revision.size - revisions[i - 1].size) >= cd.config.bytesToDeemComment &&
        !isCommentEdit(revision.comment)
      ))
      .map((revision) => revision.revid);
    newRevisions.push(...addedNewRevisions);

    // Precaution
    newRevisions = newRevisions.filter(unique);

    if (addedNewRevisions.length) {
      await processPageInBackground();
    }
  } catch (e) {
    if (e?.data?.type !== 'network') {
      console.warn(e);
    }
  }

  if (document.hidden) {
    setAlarmViaWorker(cd.g.BACKGROUND_NEW_COMMENTS_CHECK_INTERVAL * 1000);
    isBackgroundCheckArranged = true;
  } else {
    setAlarmViaWorker(cd.g.NEW_COMMENTS_CHECK_INTERVAL * 1000);
  }
}

/**
 * Generate tooltip text displaying statistics of unseen or not yet displayed comments.
 *
 * @param {CommentSkeleton[]|Comment[]} comments
 * @param {string} mode Code of the action of the button: 'firstunseen' or 'refresh'.
 * @returns {?string}
 * @private
 */
function generateTooltipText(comments, mode) {
  let tooltipText = null;
  if (comments.length) {
    const commentsBySection = {};
    comments
      .slice(0, 30)
      .forEach((comment) => {
        const section = comment.section === undefined ? comment.getSection() : comment.section;
        if (!commentsBySection[section.anchor]) {
          commentsBySection[section.anchor] = [];
        }
        commentsBySection[section.anchor].push(comment);
      });

    tooltipText = (
      cd.s('navpanel-newcomments-count', comments.length) +
      ' ' +
      cd.s('navpanel-newcomments-' + mode) +
      ' ' +
      cd.mws('parentheses', 'R')
    );
    Object.keys(commentsBySection).forEach((anchor) => {
      const section = (
        commentsBySection[anchor][0].section ||
        commentsBySection[anchor][0].getSection()
      );
      const headline = section.headline ?
        cd.s('navpanel-newcomments-insection', section.headline) :
        cd.mws('parentheses', cd.s('navpanel-newcomments-outsideofsections'));
      tooltipText += `\n\n${headline}`;
      commentsBySection[anchor].forEach((comment) => {
        tooltipText += `\n`;
        const author = comment.targetCommentAuthor && comment.level > 1 ?
          cd.s(
            'newpanel-newcomments-reply',
            comment.author.name,
            comment.targetCommentAuthor.name
          ) :
          comment.author.name;
        const date = comment.date ?
          cd.util.formatDate(comment.date) :
          cd.s('navpanel-newcomments-unknowndate');
        tooltipText += (
          (comment.interesting ? cd.mws('parentheses', '*') + ' ' : '') +
          author +
          (document.body.classList.contains('sitedir-rtl') ? '\u200F' : '') +
          cd.mws('comma-separator') +
          date
        );
      });
    });
  } else if (mode === 'refresh') {
    tooltipText = `${cd.s('navpanel-refresh')} ${cd.mws('parentheses', 'R')}`;
  }

  return tooltipText;
}

/**
 * Update the page title to show the number of comments added to the page since it was loaded.
 *
 * @param {number} newCommentsCount
 * @param {boolean} areThereInteresting
 */
export function updatePageTitle(newCommentsCount, areThereInteresting) {
  const interestingMark = areThereInteresting ? '*' : '';
  const s = newCommentsCount ? `(${newCommentsCount}${interestingMark}) ` : '';
  document.title = document.title.replace(/^(?:\(\d+\*?\) )?/, s);
}

/**
 * Add new comments notifications to the end of each updated section.
 *
 * @param {CommentSkeleton[]} newComments
 * @private
 */
function addSectionNotifications(newComments) {
  $('.cd-refreshButtonContainer').remove();
  newComments
    .map((comment) => comment.section.anchor)
    .filter(unique)
    .forEach((anchor) => {
      const section = Section.getSectionByAnchor(anchor);
      if (!section) return;

      const sectionNewComments = newComments.filter((comment) => comment.section.anchor === anchor);
      const authors = sectionNewComments
        .map((comment) => comment.author)
        .filter(unique);
      const button = new OO.ui.ButtonWidget({
        label: cd.s(
          'section-newcomments',
          sectionNewComments.length,
          authors.length,
          authors.map((user) => user.name).join(', '),
          authors[0]
        ),
        framed: false,
        classes: ['cd-button', 'cd-sectionButton'],
      });
      button.on('click', () => {
        const commentAnchor = newComments
          .find((comment) => comment.section.anchor === anchor).anchor;
        reloadPage({ commentAnchor });
      });

      const $lastElement = section.$replyButton ?
        section.$replyButton.closest('ul, ol, dl') :
        section.$elements[section.$elements.length - 1];
      $('<div>')
        .addClass('cd-refreshButtonContainer')
        .addClass('cd-sectionButtonContainer')
        .append(button.$element)
        .insertAfter($lastElement);
    });
}

/**
 * Send ordinary and desktop notifications to the user.
 *
 * @param {CommentSkeleton[]} comments
 * @private
 */
async function sendNotifications(comments) {
  const notifyAbout = comments.filter((comment) => (
    !notifiedAbout.some((commentNotifiedAbout) => commentNotifiedAbout.anchor === comment.anchor)
  ));

  let notifyAboutDesktop = [];
  if (cd.settings.desktopNotifications === 'all') {
    notifyAboutDesktop = notifyAbout;
  } else if (cd.settings.desktopNotifications === 'toMe') {
    notifyAboutDesktop = notifyAbout.filter((comment) => comment.toMe);
  }

  let notifyAboutOrdinary = [];
  if (cd.settings.notifications === 'all') {
    notifyAboutOrdinary = notifyAbout;
  } else if (cd.settings.notifications === 'toMe') {
    notifyAboutOrdinary = notifyAbout.filter((comment) => comment.toMe);
  }
  if (cd.settings.notifications !== 'none' && notifyAboutOrdinary.length) {
    // Combine with content of notifications that were displayed but are still open (i.e., the user
    // most likely didn't see them because the tab is in the background). In the past there could be
    // more than one notification, now there can be only one.
    const openNotification = getNotifications()
      .find((data) => data.comments && data.notification.isOpen);
    if (openNotification) {
      notifyAboutOrdinary.push(...openNotification.comments);
    }
  }

  if (notifyAboutOrdinary.length) {
    let html;
    const formsDataWillNotBeLost = cd.commentForms.some((commentForm) => commentForm.isAltered()) ?
      ' ' + cd.mws('parentheses', cd.s('notification-formdata')) :
      '';
    const wikilink = (
      cd.g.CURRENT_PAGE.name +
      (notifyAboutOrdinary[0].anchor ? '#' + notifyAboutOrdinary[0].anchor : '')
    );
    const reloadLinkHtml = cd.sParse('notification-reload', wikilink, formsDataWillNotBeLost);
    if (notifyAboutOrdinary.length === 1) {
      const comment = notifyAboutOrdinary[0];
      if (comment.toMe) {
        const where = comment.watchedSectionHeadline ?
          (
            cd.mws('word-separator') +
            cd.s('notification-part-insection', comment.watchedSectionHeadline)
          ) :
          cd.mws('word-separator') + cd.s('notification-part-onthispage');
        html = (
          cd.sParse('notification-toyou', comment.author.name, comment.author, where) +
          ' ' +
          reloadLinkHtml
        );
      } else {
        html = (
          cd.sParse(
            'notification-insection',
            comment.author.name,
            comment.author,
            comment.watchedSectionHeadline
          ) +
          ' ' +
          reloadLinkHtml
        );
      }
    } else {
      const isCommonSection = notifyAboutOrdinary.every((comment) => (
        comment.watchedSectionHeadline === notifyAboutOrdinary[0].watchedSectionHeadline
      ));
      const section = isCommonSection ? notifyAboutOrdinary[0].watchedSectionHeadline : undefined;
      const where = (
        cd.mws('word-separator') +
        (
          section ?
          cd.s('notification-part-insection', section) :
          cd.s('notification-part-onthispage')
        )
      );
      let mayBeInterestingString = cd.s('notification-newcomments-maybeinteresting');
      if (!mayBeInterestingString.startsWith(',')) {
        mayBeInterestingString = cd.mws('word-separator') + mayBeInterestingString;
      }

      // "that may be interesting to you" text is not needed when the section is watched and the
      // user can clearly understand why they are notified.
      const mayBeInteresting = section && cd.g.thisPageWatchedSections.includes(section) ?
        '' :
        mayBeInterestingString;

      html = (
        cd.sParse('notification-newcomments', notifyAboutOrdinary.length, where, mayBeInteresting) +
        ' ' +
        reloadLinkHtml
      );
    }

    closeNotifications(false);
    const $body = cd.util.wrap(html, {
      callbacks: {
        'cd-notification-reloadPage': (e) => {
          e.preventDefault();
          reloadPage({ commentAnchor: notifyAboutOrdinary[0].anchor });
        },
      },
    });
    addNotification([$body], { comments: notifyAboutOrdinary });
  }

  if (
    !document.hasFocus() &&
    Notification.permission === 'granted' &&
    notifyAboutDesktop.length
  ) {
    let body;
    const comment = notifyAboutDesktop[0];
    if (notifyAboutDesktop.length === 1) {
      if (comment.toMe) {
        const where = comment.section.headline ?
          cd.mws('word-separator') + cd.s('notification-part-insection', comment.section.headline) :
          '';
        body = cd.s(
          'notification-toyou-desktop',
          comment.author.name,
          comment.author,
          where,
          cd.g.CURRENT_PAGE.name
        );
      } else {
        body = cd.s(
          'notification-insection-desktop',
          comment.author.name,
          comment.author,
          comment.section.headline,
          cd.g.CURRENT_PAGE.name
        );
      }
    } else {
      const isCommonSection = notifyAboutDesktop.every((comment) => (
        comment.watchedSectionHeadline === notifyAboutDesktop[0].watchedSectionHeadline
      ));
      const section = isCommonSection ? notifyAboutDesktop[0].watchedSectionHeadline : undefined;
      const where = section ?
        cd.mws('word-separator') + cd.s('notification-part-insection', section) :
        '';
      let mayBeInterestingString = cd.s('notification-newcomments-maybeinteresting');
      if (!mayBeInterestingString.startsWith(cd.mws('comma-separator'))) {
        mayBeInterestingString = cd.mws('word-separator') + mayBeInterestingString;
      }

      // "that may be interesting to you" text is not needed when the section is watched and the
      // user can clearly understand why they are notified.
      const mayBeInteresting = section && cd.g.thisPageWatchedSections.includes(section) ?
        '' :
        mayBeInterestingString;

      body = cd.s(
        'notification-newcomments-desktop',
        notifyAboutDesktop.length,
        where,
        cd.g.CURRENT_PAGE.name,
        mayBeInteresting
      );
    }

    const notification = new Notification(mw.config.get('wgSiteName'), {
      body,

      // We use a tag so that there aren't duplicate notifications when the same page is opened in
      // two tabs. (Seems it doesn't work? :-/)
      tag: 'convenient-discussions-' + notifyAboutDesktop[notifyAboutDesktop.length - 1].anchor,
    });
    notification.onclick = () => {
      parent.focus();

      // Just in case, old browsers. TODO: delete?
      window.focus();

      reloadPage({
        commentAnchor: comment.anchor,
        closeNotificationsSmoothly: false,
      });
    };
  }

  notifiedAbout.push(...notifyAbout);
}

/**
 * Process the comments retrieved by a web worker.
 *
 * @param {CommentSkeleton[]} comments
 * @private
 */
async function processComments(comments) {
  comments.forEach((comment) => {
    comment.author = userRegistry.getUser(comment.authorName);
    delete comment.authorName;
    if (comment.targetCommentAuthorName) {
      comment.targetCommentAuthor = userRegistry.getUser(comment.targetCommentAuthorName);
      delete comment.targetCommentAuthorName;
    }
  });

  // Extract "interesting" comments (that would make the new comments counter purple and might
  // invoke notifications). Keep in mind that we should account for the case where comments have
  // been removed. For example, the counter could be "+1" but then go back to displaying the refresh
  // icon which means 0 new comments.
  const newComments = comments
    .filter((comment) => comment.anchor && !Comment.getCommentByAnchor(comment.anchor));
  const interestingNewComments = newComments.filter((comment) => {
    if (
      comment.isOwn ||
      cd.settings.notificationsBlacklist.includes(comment.author.name) ||
      !cd.g.thisPageWatchedSections
    ) {
      return false;
    }
    if (comment.toMe) {
      comment.interesting = true;
      return true;
    }

    // Is this section watched by means of an upper level section?
    const sections = Section.getSectionsByHeadline(comment.section.headline);
    for (const section of sections) {
      const watchedAncestor = section.getWatchedAncestor(true);
      if (watchedAncestor) {
        comment.watchedSectionHeadline = watchedAncestor.headline;
        comment.interesting = true;
        return true;
      }
    }
  });

  if (interestingNewComments[0]) {
    relevantNewCommentAnchor = interestingNewComments[0].anchor;
  } else if (newComments[0]) {
    relevantNewCommentAnchor = newComments[0].anchor;
  }

  navPanel.updateRefreshButton(newComments, interestingNewComments.length);
  updatePageTitle(newComments.length, interestingNewComments.length);

  const authors = newComments
    .map((comment) => comment.author)
    .filter(unique);
  await getUserGenders(authors, { noTimers: true });

  addSectionNotifications(newComments);
  sendNotifications(interestingNewComments);
}

/**
 * Callback for messages from the worker.
 *
 * @param {Event} e
 * @private
 */
async function onMessageFromWorker(e) {
  const message = e.data;

  if (message.type === 'wakeUp') {
    checkForNewComments();
  }

  if (message.type === 'parse') {
    const { comments } = message;
    processComments(comments);
  }
}

const navPanel = {
  /**
   * Property indicating that the mouse is over the navigation panel.
   *
   * @type {boolean}
   * @memberof module:navPanel
   */
  mouseOverNavPanel: false,

  /**
   * Render the navigation panel. This is done when the page is first loaded or created.
   *
   * @memberof module:navPanel
   */
  async mount() {
    /**
     * Navigation panel element.
     *
     * @type {JQuery|undefined}
     */
    this.$element = $('<div>')
      .attr('id', 'cd-navPanel')
      .appendTo(document.body);
    this.$refreshButton = $('<div>')
      .addClass('cd-navPanel-button')
      .attr('id', 'cd-navPanel-refreshButton')
      .attr('title', `${cd.s('navpanel-refresh')} ${cd.mws('parentheses', 'R')}`)
      .on('click', () => {
        this.refreshClick();
      })
      .appendTo(this.$element);
    this.$previousButton = $('<div>')
      .addClass('cd-navPanel-button')
      .attr('id', 'cd-navPanel-previousButton')
      .attr('title', `${cd.s('navpanel-previous')} ${cd.mws('parentheses', 'W')}`)
      .on('click', () => {
        this.goToPreviousNewComment();
      })
      .hide()
      .appendTo(this.$element);
    this.$nextButton = $('<div>')
      .addClass('cd-navPanel-button')
      .attr('id', 'cd-navPanel-nextButton')
      .attr('title', `${cd.s('navpanel-next')} ${cd.mws('parentheses', 'S')}`)
      .on('click', () => {
        this.goToNextNewComment();
      })
      .hide()
      .appendTo(this.$element);
    this.$firstUnseenButton = $('<div>')
      .addClass('cd-navPanel-button')
      .attr('id', 'cd-navPanel-firstUnseenButton')
      .attr('title', `${cd.s('navpanel-firstunseen')} ${cd.mws('parentheses', 'F')}`)
      .on('click', () => {
        this.goToFirstUnseenComment();
      })
      .hide()
      .appendTo(this.$element);
    this.$commentFormButton = $('<div>')
      .addClass('cd-navPanel-button')
      .attr('id', 'cd-navPanel-commentFormButton')
      .attr('title', cd.s('navpanel-commentform'))
      .on('click', () => {
        this.goToNextCommentForm();
      })
      .hide()
      .appendTo(this.$element);

    if (cd.g.worker) {
      cd.g.worker.onmessage = onMessageFromWorker;
      setAlarmViaWorker(cd.g.NEW_COMMENTS_CHECK_INTERVAL * 1000);
    }
  },

  /**
   * Check if the navigation panel is mounted. Is equivalent to checking the existence of {@link
   * module:navPanel.$element}, and for most of the practical purposes, does the same as the
   * `convenientDiscussions.g.isPageActive` check.
   *
   * @returns {boolean}
   * @memberof module:navPanel
   */
  isMounted() {
    return Boolean(this.$element);
  },

  /**
   * Highlight new comments and update the navigation panel. A promise obtained from {@link
   * module:options.getVisits} should be provided.
   *
   * @param {Promise} visitsRequest
   * @param {Comment[]} [memorizedUnseenCommentAnchors=[]]
   * @fires newCommentsHighlighted
   * @memberof module:navPanel
   */
  async processVisits(visitsRequest, memorizedUnseenCommentAnchors = []) {
    let visits;
    let thisPageVisits;
    try {
      ({ visits, thisPageVisits } = await visitsRequest);
    } catch (e) {
      console.warn('Couldn\'t load the settings from the server.', e);
      return;
    }

    // These variables are not used anywhere in the script but can be helpful for testing purposes.
    cd.g.visits = visits;
    cd.g.thisPageVisits = thisPageVisits;

    const currentUnixTime = Math.floor(Date.now() / 1000);

    // Cleanup
    for (let i = thisPageVisits.length - 1; i >= 0; i--) {
      if (thisPageVisits[i] < currentUnixTime - 60 * cd.g.HIGHLIGHT_NEW_COMMENTS_INTERVAL) {
        thisPageVisits.splice(0, i);
        break;
      }
    }

    if (thisPageVisits.length) {
      const newComments = cd.comments.filter((comment) => {
        comment.newness = null;

        if (!comment.date) {
          return false;
        }

        const isUnseen = memorizedUnseenCommentAnchors.some((anchor) => anchor === comment.anchor);
        const commentUnixTime = Math.floor(comment.date.getTime() / 1000);
        if (commentUnixTime > thisPageVisits[0]) {
          comment.newness = (
            (commentUnixTime > thisPageVisits[thisPageVisits.length - 1] && !comment.isOwn) ||
            isUnseen
          ) ?
            'unseen' :
            'new';
          return true;
        }

        return false;
      });

      Comment.configureAndAddLayers(newComments);
    }

    thisPageVisits.push(String(currentUnixTime));

    setVisits(visits);

    this.fill();
    this.registerSeenComments();

    /**
     * New comments have been highlighted.
     *
     * @event newCommentsHighlighted
     * @type {module:cd~convenientDiscussions}
     */
    mw.hook('convenientDiscussions.newCommentsHighlighted').fire(cd);
  },

  /**
   * Reset the navigation panel to the initial state. This is done after page refreshes. (Comment
   * forms are expected to be restored already.)
   *
   * @memberof module:navPanel
   */
  reset() {
    lastFirstTimeSeenCommentId = null;
    newRevisions = [];
    notifiedAbout = [];
    relevantNewCommentAnchor = null;

    removeAlarmViaWorker();
    setAlarmViaWorker(cd.g.NEW_COMMENTS_CHECK_INTERVAL * 1000);
    isBackgroundCheckArranged = false;

    this.$refreshButton
      .empty()
      .attr('title', `${cd.s('navpanel-refresh')} ${cd.mws('parentheses', 'R')}`);
    this.$previousButton.hide();
    this.$nextButton.hide();
    this.$firstUnseenButton.hide();
    this.$commentFormButton.hide();
  },

  /**
   * Count new and unseen comments on the page, and update the navigation panel to reflect that.
   *
   * @memberof module:navPanel
   */
  fill() {
    newCount = cd.comments.filter((comment) => comment.newness).length;
    if (newCount) {
      this.$nextButton.show();
      this.$previousButton.show();
      unseenCount = cd.comments.filter((comment) => comment.newness === 'unseen').length;
      if (unseenCount) {
        this.updateFirstUnseenButton();
      }
    }
  },

  /**
   * Get the number of comments on the page that haven't been seen.
   *
   * @returns {boolean}
   * @memberof module:navPanel
   */
  getUnseenCount() {
    return unseenCount;
  },

  /**
   * Update the unseen comments count without recounting. We try to avoid recounting mostly because
   * {@link module:navPanel.registerSeenComments} that uses the unseen count is executed very
   * frequently (up to a hundred times a second).
   *
   * @memberof module:navPanel
   */
  decrementUnseenCommentCount() {
    unseenCount--;
  },

  /**
   * Update the state of the "Go to the first unseen comment" button.
   *
   * @memberof module:navPanel
   */
  updateFirstUnseenButton() {
    if (unseenCount) {
      const shownUnseenCommentsCount = Number(this.$firstUnseenButton.text());
      if (unseenCount !== shownUnseenCommentsCount) {
        const unseenComments = cd.comments.filter((comment) => comment.newness === 'unseen');
        this.$firstUnseenButton
          .show()
          .text(unseenCount)
          .attr('title', generateTooltipText(unseenComments, 'firstunseen'));
      }
    } else {
      this.$firstUnseenButton.hide();
    }
  },

  /**
   * Perform routines at the refresh button click.
   *
   * @memberof module:navPanel
   */
  refreshClick() {
    // There was reload confirmation here, but after session restore was introduced, the
    // confirmation seems to be no longer needed.
    reloadPage({ commentAnchor: relevantNewCommentAnchor });
  },

  /**
   * Scroll to the previous new comment.
   *
   * @memberof module:navPanel
   */
  goToPreviousNewComment() {
    if (cd.g.autoScrollInProgress) return;

    const commentInViewport = Comment.findInViewport('backward');
    if (!commentInViewport) return;

    // This will return invisible comments too in which case an error will be displayed.
    const comment = reorderArray(cd.comments, commentInViewport.id, true)
      .find((comment) => comment.newness && comment.isInViewport(true) !== true);
    if (comment) {
      comment.$elements.cdScrollTo('center', true, () => {
        comment.registerSeen('backward', true);
        this.updateFirstUnseenButton();
      });
    }
  },

  /**
   * Scroll to the next new comment.
   *
   * @memberof module:navPanel
   */
  goToNextNewComment() {
    if (cd.g.autoScrollInProgress) return;

    const commentInViewport = Comment.findInViewport('forward');
    if (!commentInViewport) return;

    // This will return invisible comments too in which case an error will be displayed.
    const comment = reorderArray(cd.comments, commentInViewport.id)
      .find((comment) => comment.newness && comment.isInViewport(true) !== true);
    if (comment) {
      comment.$elements.cdScrollTo('center', true, () => {
        comment.registerSeen('forward', true);
        this.updateFirstUnseenButton();
      });
    }
  },

  /**
   * Scroll to the first unseen comment.
   *
   * @memberof module:navPanel
   */
  goToFirstUnseenComment() {
    if (!unseenCount || cd.g.autoScrollInProgress) return;

    const comment = cd.comments
      .slice(lastFirstTimeSeenCommentId || 0)
      .find((comment) => comment.newness === 'unseen');
    if (comment) {
      comment.$elements.cdScrollTo('center', true, () => {
        comment.registerSeen('forward', true);
        this.updateFirstUnseenButton();
      });
      lastFirstTimeSeenCommentId = comment.id;
    }
  },

  /**
   * Go to the next comment form out of sight, or just the first comment form, if `justFirst` is set
   * to true.
   *
   * @param {boolean} [justFirst=false]
   * @memberof module:navPanel
   */
  goToNextCommentForm(justFirst = false) {
    const commentForm = cd.commentForms
      .filter((commentForm) => justFirst || !commentForm.$element.cdIsInViewport(true))
      .sort((commentForm1, commentForm2) => {
        let top1 = commentForm1.$element.get(0).getBoundingClientRect().top;
        if (top1 < 0) {
          top1 += $(document).height() * 2;
        }
        let top2 = commentForm2.$element.get(0).getBoundingClientRect().top;
        if (top2 < 0) {
          top2 += $(document).height() * 2;
        }
        return top1 - top2;
      })[0];
    if (commentForm) {
      commentForm.$element.cdScrollIntoView('center');
      commentForm.commentInput.focus();
    }
  },

  /**
   * Mark comments that are currently in the viewport as read.
   *
   * @memberof module:navPanel
   */
  registerSeenComments() {
    // Don't run this more than once in some period, otherwise scrolling may be slowed down. Also,
    // wait before running, otherwise comments may be registered as seen after a press of Page
    // Down/Page Up.
    if (
      !unseenCount ||
      cd.g.dontHandleScroll ||
      cd.g.autoScrollInProgress ||
      !navPanel.isMounted()
    ) {
      return;
    }

    cd.g.dontHandleScroll = true;

    // One scroll in Chrome/Firefox with Page Up/Page Down takes a little less than 200ms, but 200ms
    // proved to be not enough, so we try 300ms.
    setTimeout(() => {
      cd.g.dontHandleScroll = false;

      const commentInViewport = Comment.findInViewport();
      if (!commentInViewport) return;

      const registerSeenIfInViewport = (comment) => {
        const isInViewport = comment.isInViewport(true);
        if (isInViewport) {
          comment.registerSeen();
        } else if (isInViewport === false) {
          // isInViewport could also be null.
          return true;
        }
      };

      // Back
      cd.comments
        .slice(0, commentInViewport.id)
        .reverse()
        .some(registerSeenIfInViewport);

      // Forward
      cd.comments
        .slice(commentInViewport.id)
        .some(registerSeenIfInViewport);

      this.updateFirstUnseenButton();
    }, 300);
  },

  /**
   * Update the refresh button to show the number of comments added to the page since it was loaded.
   *
   * @param {CommentSkeleton[]} newComments
   * @param {boolean} areThereInteresting
   * @private
   * @memberof module:navPanel
   */
  updateRefreshButton(newComments, areThereInteresting) {
    // Can't set the attribute to $refreshButton as its tooltip may have another direction.
    const $span = $('<span>')
      .attr('dir', 'ltr')
      .text(newComments.length ? `+${newComments.length}` : '');
    this.$refreshButton
      .empty()
      .append($span)
      .attr('title', generateTooltipText(newComments, 'refresh'));
    if (areThereInteresting) {
      this.$refreshButton.addClass('cd-navPanel-refreshButton-interesting');
    } else {
      this.$refreshButton.removeClass('cd-navPanel-refreshButton-interesting');
    }
  },

  /**
   * Update the "Go to the next comment form out of sight" button visibility.
   *
   * @memberof module:navPanel
   */
  updateCommentFormButton() {
    if (cd.g.autoScrollInProgress || !navPanel.isMounted()) return;

    if (cd.commentForms.some((commentForm) => !commentForm.$element.cdIsInViewport(true))) {
      this.$commentFormButton.show();
    } else {
      this.$commentFormButton.hide();
    }
  },
};

export default navPanel;
