/**
 * Module responsible for checking for updates of the page in background.
 *
 * @module updateChecker
 */

import CdError from './CdError';
import Comment from './Comment';
import Section from './Section';
import cd from './cd';
import navPanel from './navPanel';
import toc from './toc';
import userRegistry from './userRegistry';
import { addNotification, closeNotifications, getNotifications, reloadPage } from './boot';
import { getUserGenders, makeRequestNoTimers } from './apiWrappers';
import { handleApiReject, isCommentEdit, keepWorkerSafeValues, unique } from './util';

let newRevisions;
let notifiedAbout;
let isBackgroundCheckArranged;

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
 * Remove an alarm set in `setAlarmViaWorker()`.
 *
 * @private
 */
function removeAlarmViaWorker() {
  cd.g.worker.postMessage({ type: 'removeAlarm' });
}

/**
 * Check for new comments in a web worker, update the navigation panel, and schedule the next check.
 *
 * @private
 */
async function checkForUpdates() {
  if (document.hidden && !isBackgroundCheckArranged) {
    const callback = () => {
      $(document).off('visibilitychange', callback);
      isBackgroundCheckArranged = false;
      removeAlarmViaWorker();
      checkForUpdates();
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

    const revisions = resp.query?.pages?.[0]?.revisions;
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
      await updateChecker.processPage();
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
 * Send ordinary and desktop notifications to the user.
 *
 * @param {CommentSkeletonLike[]} comments
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
      let section;
      if (isCommonSection) {
        section = notifyAboutOrdinary[0].watchedSectionHeadline;
      }
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
      const mayBeInteresting = section && cd.g.thisPageWatchedSections?.includes(section) ?
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
      let section;
      if (isCommonSection) {
        section = notifyAboutDesktop[0].watchedSectionHeadline;
      }
      const where = section ?
        cd.mws('word-separator') + cd.s('notification-part-insection', section) :
        '';
      let mayBeInterestingString = cd.s('notification-newcomments-maybeinteresting');
      if (!mayBeInterestingString.startsWith(cd.mws('comma-separator'))) {
        mayBeInterestingString = cd.mws('word-separator') + mayBeInterestingString;
      }

      // "that may be interesting to you" text is not needed when the section is watched and the
      // user can clearly understand why they are notified.
      const mayBeInteresting = section && cd.g.thisPageWatchedSections?.includes(section) ?
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
 * Object with the same structure as {@link module:CommentSkeleton} has. (It comes from a web worker
 * so its constuctor is lost.)
 *
 * @typedef {object} CommentSkeletonLike
 */

/**
 * Process the comments retrieved by a web worker.
 *
 * @param {CommentSkeletonLike[]} comments
 * @private
 */
async function processComments(comments) {
  comments.forEach((comment) => {
    comment.author = userRegistry.getUser(comment.authorName);
    delete comment.authorName;
    if (comment.parentAuthorName) {
      comment.parent = {
        author: userRegistry.getUser(comment.parentAuthorName),
      };
      delete comment.parentAuthorName;
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
    updateChecker.relevantNewCommentAnchor = interestingNewComments[0].anchor;
  } else if (newComments[0]) {
    updateChecker.relevantNewCommentAnchor = newComments[0].anchor;
  }

  const newCommentsBySection = Comment.groupBySection(newComments);
  navPanel.updateRefreshButton(
    newComments.length,
    newCommentsBySection,
    Boolean(interestingNewComments.length)
  );
  updateChecker.updatePageTitle(newComments.length, Boolean(interestingNewComments.length));
  toc.addNewComments(newCommentsBySection);

  const authors = newComments
    .map((comment) => comment.author)
    .filter(unique);
  await getUserGenders(authors, { noTimers: true });

  Section.addNewCommentsNotifications(newComments);
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
    checkForUpdates();
  }

  if (message.type === 'parse') {
    const { comments, sections } = message;
    toc.addNewSections(sections);
    processComments(comments);
  }
}

const updateChecker = {
  /**
   * Anchor of the comment that should be jumped to after reloading the page.
   *
   * @type {?string}
   * @memberof module:updateChecker
   */
  relevantNewCommentAnchor: null,

  /**
   * Initialize the update checker.
   *
   * @memberof module:updateChecker
   */
  init() {
    if (!cd.g.worker) return;

    newRevisions = [];
    notifiedAbout = [];
    this.relevantNewCommentAnchor = null;
    isBackgroundCheckArranged = false;

    if (cd.g.worker.onmessage) {
      removeAlarmViaWorker();
    } else {
      cd.g.worker.onmessage = onMessageFromWorker;
    }

    setAlarmViaWorker(cd.g.NEW_COMMENTS_CHECK_INTERVAL * 1000);
  },

  /**
   * Process the current page in the worker context.
   *
   * @memberof module:updateChecker
   */
  async processPage() {
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
  },

  /**
   * Update the page title to show the number of comments added to the page since it was loaded.
   *
   * @param {number} newCommentsCount
   * @param {boolean} areThereInteresting
   * @memberof module:updateChecker
   */
  updatePageTitle(newCommentsCount, areThereInteresting) {
    const interestingMark = areThereInteresting ? '*' : '';
    const s = newCommentsCount ? `(${newCommentsCount}${interestingMark}) ` : '';
    document.title = document.title.replace(/^(?:\(\d+\*?\) )?/, s);
  },
};

export default updateChecker;
