/**
 * Singleton responsible for checking for updates of the page in the background.
 *
 * @module updateChecker
 */

import CdError from './CdError';
import Comment from './Comment';
import Section from './Section';
import Thread from './Thread';
import cd from './cd';
import controller from './controller';
import navPanel from './navPanel';
import notifications from './notifications';
import settings from './settings';
import toc from './toc';
import userRegistry from './userRegistry';
import {
  calculateWordOverlap,
  getFromLocalStorage,
  keepWorkerSafeValues,
  saveToLocalStorage,
  wrap,
} from './util';
import { loadUserGenders } from './apiWrappers';

const revisionData = {};
const resolvers = {};

let commentsNotifiedAbout;
let isBackgroundCheckArranged;
let previousVisitRevisionId;
let submittedCommentId;

let lastCheckedRevisionId = null;
let relevantNewCommentIds = null;
let resolverCount = 0;
let newCommentsTitleMark = '';

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
  controller.getWorker().postMessage({
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
  controller.getWorker().postMessage({
    type: 'removeAlarm',
  });
}

/**
 * Perform a task in a web worker.
 *
 * @param {object} payload
 * @returns {Promise.<object>}
 * @private
 */
function runWorkerTask(payload) {
  return new Promise((resolve) => {
    const resolverId = resolverCount++;
    Object.assign(payload, { resolverId });
    controller.getWorker().postMessage(payload);
    resolvers[resolverId] = resolve;
  });
}

/**
 * _For internal use._ Process the current page in a web worker.
 *
 * @param {number} [revisionToParseId]
 * @returns {Promise.<object>}
 * @memberof module:updateChecker
 */
async function processPage(revisionToParseId) {
  if (revisionData[revisionToParseId]) {
    return revisionData[revisionToParseId];
  }

  const {
    text,
    revid: revisionId,
  } = await cd.page.parse({ oldid: revisionToParseId }, true) || {};

  const message = await runWorkerTask({
    type: 'parse',
    revisionId,
    text,
    g: keepWorkerSafeValues(cd.g, ['isIPv6Address']),
    config: keepWorkerSafeValues(cd.config, ['checkForCustomForeignComponents']),
  });

  if (!revisionData[message.revisionId]) {
    revisionData[message.revisionId] = message;
  }

  // Clean up revisionData from values that can't be reused as it may grow really big. (The newest
  // revision could be reused as the current revision; the current revision could be reused as the
  // previous visit revision.)
  Object.keys(revisionData).forEach((key) => {
    const revisionId = Number(key);
    if (
      revisionId !== message.revisionId &&
      revisionId !== lastCheckedRevisionId &&
      revisionId !== previousVisitRevisionId &&
      revisionId !== mw.config.get('wgRevisionId')
    ) {
      delete revisionData[key];
    }
  });

  return message;
}

/**
 * If the revision of the current visit and previous visit are different, process the said
 * revisions. (We need to process the current revision too to get the comments' inner HTML without
 * any elements that may be added by scripts.) The revisions' data will be finally processed by
 * `checkForChangesSincePreviousVisit()`.
 *
 * @private
 */
async function processRevisionsIfNeeded() {
  const revisions = await cd.page.getRevisions({
    rvprop: ['ids'],
    rvstart: new Date(controller.getBootProcess().getPreviousVisitUnixTime() * 1000).toISOString(),
    rvlimit: 1,
  }, true);

  previousVisitRevisionId = revisions[0]?.revid;
  const currentRevisionId = mw.config.get('wgRevisionId');

  if (previousVisitRevisionId && previousVisitRevisionId < currentRevisionId) {
    const { comments: oldComments } = await processPage(previousVisitRevisionId);
    const { comments: currentComments } = await processPage(currentRevisionId);
    if (isPageStillAtRevision(currentRevisionId)) {
      mapComments(currentComments, oldComments);
      checkForChangesSincePreviousVisit(currentComments);
    }
  }
}

/**
 * Remove seen rendered changes data older than 60 days.
 *
 * @param {object[]} data
 * @returns {object}
 * @private
 */
function cleanUpSeenRenderedChanges(data) {
  const newData = Object.assign({}, data);
  Object.keys(newData).forEach((key) => {
    const page = newData[key];
    const oldestUnixTime = Math.min(...Object.entries(page).map(([, data]) => data.seenUnixTime));
    if (!oldestUnixTime || oldestUnixTime < Date.now() - 60 * cd.g.MS_IN_DAY) {
      delete newData[key];
    }
  });
  return newData;
}

/**
 * Map sections obtained from a revision to the sections present on the page.
 *
 * @param {import('./SectionSkeleton').SectionSkeletonLike[]} otherSections
 * @private
 */
function mapSections(otherSections) {
  // Reset values set in the previous run.
  cd.sections.forEach((section) => {
    delete section.match;
    delete section.matchScore;
  });
  otherSections.forEach((otherSection) => {
    delete otherSection.match;
  });

  otherSections.forEach((otherSection) => {
    const { section, score } = Section.search(otherSection, true) || {};
    if (section && (!section.match || score > section.matchScore)) {
      if (section.match) {
        delete section.match.match;
      }
      section.match = otherSection;
      section.matchScore = score;
      otherSection.match = section;
    }
  });

  cd.sections.forEach((section) => {
    section.liveSectionNumber = section.match?.sectionNumber ?? null;
    section.liveSectionNumberRevisionId = lastCheckedRevisionId;
    delete section.code;
    delete section.revisionId;
    delete section.queryTimestamp;
  });
}

/**
 * Sort comments by match score, removing comments with score of 1.66 or less.
 *
 * @param {import('./CommentSkeleton').CommentSkeletonLike[]} candidates
 * @param {import('./CommentSkeleton').CommentSkeletonLike} target
 * @param {boolean} isTotalCountEqual
 * @returns {import('./CommentSkeleton').CommentSkeletonLike[]}
 * @private
 */
function sortCommentsByMatchScore(candidates, target, isTotalCountEqual) {
  return candidates
    .map((candidate) => {
      const doesParentIdMatch = candidate.parent?.id === target.parent?.id;
      const doesHeadlineMatch = candidate.section?.headline === target.section?.headline;

      // Taking matched ID into account makes sense only if the total number of comments coincides.
      const doesIndexMatch = candidate.index === target.index && isTotalCountEqual;

      const partsMatchedCount = candidate.elementHtmls
        .filter((html, i) => html === target.elementHtmls[i])
        .length;
      const partsMatchedProportion = (
        partsMatchedCount /
        Math.max(candidate.elementHtmls.length, target.elementHtmls.length)
      );
      const overlap = partsMatchedProportion === 1 ?
        1 :
        calculateWordOverlap(candidate.text, target.text);
      const score = (
        doesParentIdMatch * (candidate.parent?.id ? 1 : 0.75) +
        doesHeadlineMatch * 1 +
        partsMatchedProportion +
        overlap +
        doesIndexMatch * 0.25
      );
      return {
        comment: candidate,
        score,
      };
    })
    .filter((match) => match.score > 1.66)
    .sort((match1, match2) => {
      if (match2.score > match1.score) {
        return 1;
      } else if (match2.score < match1.score) {
        return -1;
      } else {
        return 0;
      }
    });
}

/**
 * Map comments obtained from the current revision to comments obtained from another revision (newer
 * or older) by adding the `match` property to the first ones. The function also adds the
 * `hasPoorMatch` property to comments that have possible matches that are not good enough to
 * confidently state a match.
 *
 * @param {import('./CommentSkeleton').CommentSkeletonLike[]} currentComments
 * @param {import('./CommentSkeleton').CommentSkeletonLike[]} otherComments
 * @private
 */
function mapComments(currentComments, otherComments) {
  // Reset values set in the previous run.
  currentComments.forEach((comment) => {
    delete comment.match;
    delete comment.matchScore;
    delete comment.hasPoorMatch;
    delete comment.parentMatch;
  });

  // We choose to traverse "other" (newer/older) comments in the top cycle, and current comments in
  // the bottom cycle, not vice versa. This way, if there are multiple match candidates for an
  // "other" comment, we choose the match between them. This is better than choosing a match for a
  // current comment between "other" comments, because if we determined a match for a current
  // comment and then see a better match for the "other" comment determined as a match, we would
  // have to set the "other" comment as a match to the new current comment, and the initial current
  // comment would lose its match. (...But is there any actual difference after all?..)
  otherComments.forEach((otherComment) => {
    const ccFiltered = currentComments.filter((currentComment) => (
      currentComment.authorName === otherComment.authorName &&
      currentComment.date &&
      otherComment.date &&
      currentComment.date.getTime() === otherComment.date.getTime()
    ));
    const isTotalCountEqual = currentComments.length === otherComments.length;
    if (ccFiltered.length === 1) {
      ccFiltered[0].match = ccFiltered[0].match ?
        sortCommentsByMatchScore(
          [ccFiltered[0].match, otherComment],
          ccFiltered[0],
          isTotalCountEqual
        )[0].comment :
        otherComment;
    } else if (ccFiltered.length > 1) {
      let found;
      sortCommentsByMatchScore(ccFiltered, otherComment, isTotalCountEqual).forEach((match) => {
        // If the current comment already has a match (from a previous iteration of the
        // otherComments cycle), compare their scores.
        if (!found && (!match.comment.match || match.comment.matchScore < match.score)) {
          match.comment.match = otherComment;
          match.comment.matchScore = match.score;
          delete match.comment.hasPoorMatch;
          found = true;
        } else {
          if (!match.comment.match) {
            // There is a poor match for a current comment. It is not used as a legitimate match
            // because it is a worse match for an "other" comment than some other match, but it is
            // still a possible match. If a better match is found for a current comment, this
            // property is deleted for it.
            match.comment.hasPoorMatch = true;
          }
        }
      });
    }
  });
}

/**
 * Check for new comments in a web worker, update the navigation panel, and schedule the next check.
 *
 * @private
 */
async function checkForUpdates() {
  if (!controller.isPageActive() || controller.isBooting()) return;

  // We need a value that wouldn't change during awaits.
  const documentHidden = document.hidden;

  if (documentHidden && !isBackgroundCheckArranged) {
    const onDocumentVisible = () => {
      $(document).off('visibilitychange', onDocumentVisible);
      isBackgroundCheckArranged = false;
      removeAlarmViaWorker();
      checkForUpdates();
    };
    $(document).on('visibilitychange', onDocumentVisible);

    const interval = Math.abs(cd.g.BACKGROUND_UPDATE_CHECK_INTERVAL - cd.g.UPDATE_CHECK_INTERVAL);
    setAlarmViaWorker(interval * 1000);
    isBackgroundCheckArranged = true;
    return;
  }

  try {
    const revisions = await cd.page.getRevisions({
      rvprop: ['ids'],
      rvlimit: 1,
    }, true);

    const currentRevisionId = mw.config.get('wgRevisionId');
    if (revisions.length && revisions[0].revid > (lastCheckedRevisionId || currentRevisionId)) {
      const { revisionId, comments: newComments, sections } = await processPage();
      if (isPageStillAtRevision(currentRevisionId)) {
        const { comments: currentComments } = await processPage(currentRevisionId);

        // We set the value here, not after the first "await", so that we are sure that
        // lastCheckedRevisionId corresponds to the versions of comments that are currently
        // rendered.
        lastCheckedRevisionId = revisionId;

        if (isPageStillAtRevision(currentRevisionId)) {
          mapSections(sections);
          toc.addNewSections(sections);
          mapComments(currentComments, newComments);

          // We check for changes before notifying about new comments to notify about changes in a
          // renamed section if it is watched.
          checkForNewChanges(currentComments);

          await processComments(newComments, currentComments, currentRevisionId);
        }
      }
    }
  } catch (e) {
    if (!(e instanceof CdError) || (e.data && e.data.type !== 'network')) {
      console.warn(e);
    }
  }

  if (documentHidden) {
    setAlarmViaWorker(cd.g.BACKGROUND_UPDATE_CHECK_INTERVAL * 1000);
    isBackgroundCheckArranged = true;
  } else {
    setAlarmViaWorker(cd.g.UPDATE_CHECK_INTERVAL * 1000);
  }
}

/**
 * Determine if the comment has changed (probably edited) based on the `textHtmlToCompare` and
 * `headingHtmlToCompare` properties (the comment may lose its heading because technical comment is
 * added between it and the heading).
 *
 * @param {import('./CommentSkeleton').CommentSkeletonLike[]} olderComment
 * @param {import('./CommentSkeleton').CommentSkeletonLike[]} newerComment
 * @returns {boolean}
 * @private
 */
function hasCommentChanged(olderComment, newerComment) {
  return (
    newerComment.textHtmlToCompare !== olderComment.textHtmlToCompare ||
    (
      newerComment.headingHtmlToCompare &&
      newerComment.headingHtmlToCompare !== olderComment.headingHtmlToCompare
    )
  );
}

/**
 * Check if there are changes made to the currently displayed comments since the previous visit.
 *
 * @param {import('./CommentSkeleton').CommentSkeletonLike[]} currentComments
 * @private
 */
function checkForChangesSincePreviousVisit(currentComments) {
  const seenRenderedChanges = cleanUpSeenRenderedChanges(
    getFromLocalStorage('seenRenderedChanges')
  );
  const articleId = mw.config.get('wgArticleId');

  const changeList = [];
  currentComments.forEach((currentComment) => {
    if (currentComment.id === submittedCommentId) return;

    const oldComment = currentComment.match;
    if (oldComment) {
      const seenHtmlToCompare = seenRenderedChanges[articleId]?.[currentComment.id]?.htmlToCompare;
      if (
        hasCommentChanged(oldComment, currentComment) &&
        seenHtmlToCompare !== currentComment.htmlToCompare
      ) {
        const comment = Comment.getById(currentComment.id);
        if (!comment) return;

        // Different indexes to supply one object both to the event and Comment#markAsChanged.
        const commentsData = {
          old: oldComment,
          current: currentComment,
          0: oldComment,
          1: currentComment,
        };

        comment.markAsChanged('changedSince', true, previousVisitRevisionId, commentsData);

        if (comment.isOpeningSection) {
          comment.section?.resubscribeToRenamed(currentComment, oldComment);
        }

        changeList.push({ comment, commentsData });
      }
    }
  });

  if (changeList.length) {
    /**
     * Existing comments have changed since the previous visit.
     *
     * @event changesSincePreviousVisit
     * @param {object[]} changeList
     * @param {Comment} changeList.comment
     * @param {object} changeList.commentsData
     * @global
     */
    mw.hook('convenientDiscussions.changesSincePreviousVisit').fire(changeList);
  }

  delete seenRenderedChanges[articleId];
  saveToLocalStorage('seenRenderedChanges', seenRenderedChanges);

  // TODO: Remove in November 2021 (3 months after renaming)
  mw.storage.remove('convenientDiscussions-seenRenderedEdits');
}

/**
 * Check if there are changes made to the currently displayed comments since they were rendered.
 *
 * @param {import('./CommentSkeleton').CommentSkeletonLike[]} currentComments
 * @private
 */
function checkForNewChanges(currentComments) {
  let isChangeMarkUpdated = false;
  const changeList = [];
  currentComments.forEach((currentComment) => {
    const newComment = currentComment.match;
    let comment;
    const events = {};

    // Different indexes to supply one object both to the event and Comment#markAsChanged.
    const commentsData = {
      current: currentComment,
      new: newComment,
      0: currentComment,
      1: newComment,
    };

    if (newComment) {
      comment = Comment.getById(currentComment.id);
      if (!comment) return;

      if (comment.isDeleted) {
        comment.unmarkAsChanged('deleted');
        isChangeMarkUpdated = true;
        events.undeleted = true;
      }
      if (hasCommentChanged(currentComment, newComment)) {
        // The comment may have already been updated previously.
        if (!comment.htmlToCompare || comment.htmlToCompare !== newComment.htmlToCompare) {
          const updateSuccess = comment.update(currentComment, newComment);

          // It is above the Comment#markAsChanged call, because it's used in Comment#flashChanged
          // called indirectly by Comment#markAsChanged.
          comment.htmlToCompare = newComment.htmlToCompare;

          comment.markAsChanged('changed', updateSuccess, lastCheckedRevisionId, commentsData);
          isChangeMarkUpdated = true;
          events.changed = { updateSuccess };
        }
      } else if (comment.isChanged) {
        comment.update(currentComment, newComment);
        comment.unmarkAsChanged('changed');
        isChangeMarkUpdated = true;
        events.unchanged = true;
      }
    } else if (!currentComment.hasPoorMatch) {
      comment = Comment.getById(currentComment.id);
      if (!comment || comment.isDeleted) return;

      comment.markAsChanged('deleted');
      isChangeMarkUpdated = true;
      events.deleted = true;
    }

    if (Object.keys(events).length) {
      changeList.push({ comment, events, commentsData });
    }
  });

  if (isChangeMarkUpdated) {
    // If the layers of deleted comments have been configured in Comment#unmarkAsChanged, they will
    // prevent layers before them from being updated due to the "stop at the first three unmoved
    // comments" optimization in Comment.redrawLayersIfNecessary. So we just do the whole job here.
    Comment.redrawLayersIfNecessary(false, true);

    // Thread start and end elements may be replaced, so we need to restart threads.
    Thread.init(false);
  }

  if (changeList.length) {
    /**
     * Existing comments have changed (probably edited).
     *
     * @event newChanges
     * @param {object[]} changeList
     * @param {Comment} changeList.comment
     * @param {object} changeList.events
     * @param {object} [changeList.events.changed]
     * @param {boolean} [changeList.events.changed.updateSuccess] Were the changes rendered.
     * @param {boolean} [changeList.events.unchanged]
     * @param {boolean} [changeList.events.deleted]
     * @param {boolean} [changeList.events.undeleted]
     * @param {object} changeList.commentsData
     * @global
     */
    mw.hook('convenientDiscussions.newChanges').fire(changeList);
  }
}

/**
 * Show an ordinary notification (`mediawiki.notification`) to the user.
 *
 * @param {import('./CommentSkeleton').CommentSkeletonLike[]} comments
 * @private
 */
function showOrdinaryNotification(comments) {
  let filteredComments = [];
  if (settings.get('notifications') === 'all') {
    filteredComments = comments;
  } else if (settings.get('notifications') === 'toMe') {
    filteredComments = comments.filter((comment) => comment.isToMe);
  }

  if (settings.get('notifications') !== 'none' && filteredComments.length) {
    // Combine with content of notifications that were displayed but are still open (i.e., the user
    // most likely didn't see them because the tab is in the background). In the past there could be
    // more than one notification, now there can be only one.
    const openNotification = notifications.get()
      .find((data) => data.comments && data.notification.isOpen);
    if (openNotification) {
      filteredComments.push(...openNotification.comments);
    }
  }

  if (filteredComments.length) {
    let html;
    const formsDataWillNotBeLost = cd.commentForms.some((commentForm) => commentForm.isAltered()) ?
      ' ' + cd.mws('parentheses', cd.s('notification-formdata')) :
      '';
    const reloadHtml = cd.sParse('notification-reload', formsDataWillNotBeLost);
    if (filteredComments.length === 1) {
      const comment = filteredComments[0];
      if (comment.isToMe) {
        const where = comment.sectionSubscribedTo ?
          (
            cd.mws('word-separator') +
            cd.s('notification-part-insection', comment.sectionSubscribedTo.headline)
          ) :
          cd.mws('word-separator') + cd.s('notification-part-onthispage');
        html = (
          cd.sParse('notification-toyou', comment.author.getName(), comment.author, where) +
          ' ' +
          reloadHtml
        );
      } else {
        html = (
          cd.sParse(
            'notification-insection',
            comment.author.getName(),
            comment.author,
            comment.sectionSubscribedTo.headline
          ) +
          ' ' +
          reloadHtml
        );
      }
    } else {
      const isCommonSection = filteredComments.every((comment) => (
        comment.sectionSubscribedTo === filteredComments[0].sectionSubscribedTo
      ));
      const section = isCommonSection ? filteredComments[0].sectionSubscribedTo : undefined;
      const where = (
        cd.mws('word-separator') +
        (
          section ?
            cd.s('notification-part-insection', section.headline) :
            cd.s('notification-part-onthispage')
        )
      );
      let mayBeRelevantString = cd.s('notification-newcomments-mayberelevant');
      if (!mayBeRelevantString.startsWith(',')) {
        mayBeRelevantString = cd.mws('word-separator') + mayBeRelevantString;
      }

      // "that may be relevant to you" text is not needed when the section is watched and the user
      // can clearly understand why they are notified.
      const mayBeRelevant = section ? '' : mayBeRelevantString;

      html = (
        cd.sParse('notification-newcomments', filteredComments.length, where, mayBeRelevant) +
        ' ' +
        reloadHtml
      );
    }

    const $body = wrap(html);
    const notification = notifications.add(
      $body,
      { tag: 'convenient-discussions-new-comments' },
      { comments: filteredComments }
    );
    notification.$notification.on('click', () => {
      controller.reload({ commentIds: filteredComments.map((comment) => comment.id) });
    });
  }
}

/**
 * Show a desktop notification to the user.
 *
 * @param {import('./CommentSkeleton').CommentSkeletonLike[]} comments
 * @private
 */
function showDesktopNotification(comments) {
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

  let body;
  const comment = filteredComments[0];
  if (filteredComments.length === 1) {
    if (comment.isToMe) {
      const where = comment.section?.headline ?
        cd.mws('word-separator') + cd.s('notification-part-insection', comment.section.headline) :
        '';
      body = cd.s(
        'notification-toyou-desktop',
        comment.author.getName(),
        comment.author,
        where,
        cd.page.name
      );
    } else {
      body = cd.s(
        'notification-insection-desktop',
        comment.author.getName(),
        comment.author,
        comment.section.headline,
        cd.page.name
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
      cd.mws('word-separator') + cd.s('notification-part-insection', section.headline) :
      '';
    let mayBeRelevantString = cd.s('notification-newcomments-mayberelevant');
    if (!mayBeRelevantString.startsWith(cd.mws('comma-separator'))) {
      mayBeRelevantString = cd.mws('word-separator') + mayBeRelevantString;
    }

    // "that may be relevant to you" text is not needed when the section is watched and the user can
    // clearly understand why they are notified.
    const mayBeRelevant = section ? '' : mayBeRelevantString;

    body = cd.s(
      'notification-newcomments-desktop',
      filteredComments.length,
      where,
      cd.page.name,
      mayBeRelevant
    );
  }

  const notification = new Notification(mw.config.get('wgSiteName'), {
    body,

    // We use a tag so that there aren't duplicate notifications when the same page is opened in
    // two tabs. (Seems it doesn't work? :-/)
    tag: 'convenient-discussions-' + filteredComments[filteredComments.length - 1].id,
  });
  notification.onclick = () => {
    parent.focus();

    // Just in case, old browsers. TODO: delete?
    window.focus();

    Comment.redrawLayersIfNecessary(false, true);

    controller.reload({
      commentIds: [comment.id],
      closeNotificationsSmoothly: false,
    });
  };
}

/**
 * Check if the page is still at the specified revision and nothing is loading.
 *
 * @param {number} revisionId
 * @returns {boolean}
 * @private
 */
function isPageStillAtRevision(revisionId) {
  return (
    revisionId === mw.config.get('wgRevisionId') &&
    !controller.isBooting() &&
    !cd.commentForms.some((commentForm) => commentForm.isBeingSubmitted())
  );
}

/**
 * Process the comments retrieved by a web worker.
 *
 * @param {import('./CommentSkeleton').CommentSkeletonLike[]} comments Comments in the recent
 *   revision.
 * @param {import('./CommentSkeleton').CommentSkeletonLike[]} currentComments Comments in the
 *   currently shown revision mapped to the comments in the recent revision.
 * @param {number} currentRevisionId
 * @private
 */
async function processComments(comments, currentComments, currentRevisionId) {
  comments.forEach((comment) => {
    comment.author = userRegistry.get(comment.authorName);
    if (comment.parent?.authorName) {
      comment.parent.author = userRegistry.get(comment.parent.authorName);
    }
  });

  const newComments = comments
    .filter((comment) => comment.id && !currentComments.some((mcc) => mcc.match === comment))

    // Detach comments in the "newComments" object from those in the "comments" object (so that the
    // last isn't polluted when it is reused).
    .map((comment) => {
      const newComment = Object.assign({}, comment);
      if (comment.parent) {
        const parentMatch = currentComments.find((mcc) => mcc.match === comment.parent);
        if (parentMatch?.id) {
          newComment.parentMatch = Comment.getById(parentMatch.id);
        }
      }
      return newComment;
    });

  // Extract relevant comments (that would make the new comments counter purple and might invoke
  // notifications). Keep in mind that we should account for the case where comments have been
  // removed. For example, the counter could be "+1" but then go back to displaying the refresh icon
  // which means 0 new comments.
  const relevantNewComments = newComments.filter((comment) => {
    if (!settings.get('notifyCollapsedThreads') && comment.logicalLevel !== 0) {
      let parentMatch;
      for (let c = comment; c && !parentMatch; c = c.parent) {
        parentMatch = c.parentMatch;
      }
      if (parentMatch?.isCollapsed) {
        return false;
      }
    }
    if (comment.isOwn || comment.author.isMuted()) {
      return false;
    }
    if (comment.isToMe) {
      return true;
    }
    if (comment.section) {
      // Is this section subscribed to by means of an upper level section?
      const section = comment.section.match;
      if (section) {
        const closestSectionSubscribedTo = section.getClosestSectionSubscribedTo(true);
        if (closestSectionSubscribedTo) {
          comment.sectionSubscribedTo = closestSectionSubscribedTo;
          return true;
        }
      }
    }
    return false;
  });

  if (cd.g.GENDER_AFFECTS_USER_STRING) {
    await loadUserGenders(newComments.map((comment) => comment.author), true);
  }

  if (!isPageStillAtRevision(currentRevisionId)) return;

  if (relevantNewComments[0]) {
    relevantNewCommentIds = relevantNewComments.map((comment) => comment.id);
  } else if (newComments[0]) {
    relevantNewCommentIds = newComments.map((comment) => comment.id);
  }

  const newCommentsBySection = Comment.groupBySection(newComments);
  const areThereRelevant = Boolean(relevantNewComments.length);
  navPanel.updateRefreshButton(newComments.length, newCommentsBySection, areThereRelevant);
  updateChecker.updatePageTitle(newComments.length, areThereRelevant);
  toc.addNewComments(newCommentsBySection);

  Comment.addNewCommentsNotes(newComments);

  const commentsToNotifyAbout = relevantNewComments
    .filter((comment) => !commentsNotifiedAbout.some((cna) => cna.id === comment.id));
  showOrdinaryNotification(commentsToNotifyAbout);
  showDesktopNotification(commentsToNotifyAbout);
  commentsNotifiedAbout.push(...commentsToNotifyAbout);
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
  } else {
    const resolverId = message.resolverId;
    delete message.resolverId;
    delete message.type;
    resolvers[resolverId](message);
    delete resolvers[resolverId];
  }
}

const updateChecker = {
  /**
   * _For internal use._ Initialize the update checker. Executed on each page reload.
   *
   * @memberof module:updateChecker
   */
  async init() {
    commentsNotifiedAbout = [];
    relevantNewCommentIds = null;
    isBackgroundCheckArranged = false;
    previousVisitRevisionId = null;

    if (controller.getWorker().onmessage) {
      removeAlarmViaWorker();
    } else {
      controller.getWorker().onmessage = onMessageFromWorker;
    }

    setAlarmViaWorker(cd.g.UPDATE_CHECK_INTERVAL * 1000);

    const bootProcess = controller.getBootProcess();

    // It is handled in BootProcess#processVisits.
    await bootProcess.getVisitsRequest();

    if (bootProcess.getPreviousVisitUnixTime()) {
      processRevisionsIfNeeded();
      if (bootProcess.data('wasCommentFormSubmitted') && bootProcess.data('commentIds')) {
        submittedCommentId = bootProcess.data('commentIds')[0];
      }
    }
  },

  /**
   * _For internal use._ Update the page title to show the number of comments added to the page
   * since it was loaded. If used without parameters, restore the previous value (if could be
   * changed by the browser when the "Back" button is clicked).
   *
   * @param {number} [newCommentsCount]
   * @param {boolean} [areThereRelevant]
   * @memberof module:updateChecker
   */
  updatePageTitle(newCommentsCount, areThereRelevant) {
    const title = document.title;
    if (newCommentsCount === undefined) {
      // A hack for Chrome (at least) for cases when the "Back" button of the browser is clicked.
      document.title = '';
    } else {
      const relevantMark = areThereRelevant ? '*' : '';
      newCommentsTitleMark = newCommentsCount ? `(${newCommentsCount}${relevantMark}) ` : '';
    }
    document.title = title.replace(/^(?:\(\d+\*?\) )?/, newCommentsTitleMark);
  },

  /**
   * Get the ID of the last revision checked for updates.
   *
   * @type {?string}
   * @memberof module:updateChecker
   */
  getLastCheckedRevisionId() {
    return lastCheckedRevisionId;
  },

  /**
   * Get the IDs of the comments that should be jumped to after reloading the page.
   *
   * @type {?(string[])}
   * @memberof module:updateChecker
   */
  getRelevantNewCommentIds() {
    return relevantNewCommentIds;
  }
};

// For tests
Object.assign(updateChecker, { processPage });

export default updateChecker;
