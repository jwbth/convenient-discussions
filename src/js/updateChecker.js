/**
 * Module responsible for checking for updates of the page in background.
 *
 * @module updateChecker
 */

import CdError from './CdError';
import Comment from './Comment';
import Section from './Section';
import Thread from './Thread';
import cd from './cd';
import navPanel from './navPanel';
import toc from './toc';
import userRegistry from './userRegistry';
import {
  addNotification,
  closeNotifications,
  getNotifications,
  isPageLoading,
  reloadPage,
} from './boot';
import {
  calculateWordOverlap,
  getFromLocalStorage,
  keepWorkerSafeValues,
  saveToLocalStorage,
  wrap,
} from './util';
import { getUserGenders } from './apiWrappers';

let lastCheckedRevisionId;
let commentsNotifiedAbout;
let isBackgroundCheckArranged;
let previousVisitRevisionId;
let submittedCommentAnchor;
let resolverCount = 0;

const revisionData = {};
const resolvers = {};

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
  // We need a value that wouldn't change during await's.
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
    const revisions = await cd.g.PAGE.getRevisions({
      rvprop: ['ids'],
      rvlimit: 1,
    }, true);

    const currentRevisionId = mw.config.get('wgRevisionId');
    if (revisions.length && revisions[0].revid > (lastCheckedRevisionId || currentRevisionId)) {
      const { revisionId, comments, sections } = await updateChecker.processPage();
      lastCheckedRevisionId = revisionId;

      if (isPageStillAtRevision(currentRevisionId)) {
        const { comments: currentComments } = await updateChecker.processPage(currentRevisionId);

        if (isPageStillAtRevision(currentRevisionId)) {
          mapSections(sections);
          toc.addNewSections(sections);
          mapComments(currentComments, comments);

          // We check for changes before notifying about new comments to notify about changes in a
          // renamed section if it is watched.
          checkForNewChanges(currentComments);

          await processComments(comments, currentComments, currentRevisionId);
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
 * If the revision of the current visit and previous visit are different, process the said
 * revisions. (We need to process the current revision too to get the comments' inner HTML without
 * any elements that may be added by scripts.) The revisions' data will finally processed by
 * {@link module:updateChecker~checkForChangesSincePreviousVisit checkForChangesSincePreviousVisit()}.
 *
 * @private
 */
async function processRevisionsIfNeeded() {
  const revisions = await cd.g.PAGE.getRevisions({
    rvprop: ['ids'],
    rvstart: new Date(cd.g.previousVisitUnixTime * 1000).toISOString(),
    rvlimit: 1,
  }, true);

  previousVisitRevisionId = revisions[0]?.revid;
  const currentRevisionId = mw.config.get('wgRevisionId');

  if (previousVisitRevisionId && previousVisitRevisionId < currentRevisionId) {
    const { comments: oldComments } = await updateChecker.processPage(previousVisitRevisionId);
    const { comments: currentComments } = await updateChecker.processPage(currentRevisionId);
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
    const seenUnixTime = page[Object.keys(page)[0]]?.seenUnixTime;
    if (!seenUnixTime || seenUnixTime < Date.now() - 60 * cd.g.SECONDS_IN_DAY * 1000) {
      delete newData[key];
    }
  });
  return newData;
}

/**
 * Object with the same basic structure as {@link module:SectionSkeleton} has. (It comes from a web
 * worker so its constructor is lost.)
 *
 * @typedef {object} SectionSkeletonLike
 * @private
 */

/**
 * Map sections obtained from a revision to the sections present on the page.
 *
 * @param {SectionSkeletonLike[]} otherSections
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
 * Object with the same basic structure as {@link module:CommentSkeleton} has. (It comes from a web
 * worker so its constructor is lost.)
 *
 * @typedef {object} CommentSkeletonLike
 * @private
 */

/**
 * Map comments obtained from the current revision to comments obtained from another revision (newer
 * or older) by adding the `match` property to the first ones. The function also adds the
 * `hasPoorMatch` property to comments that have possible matches that are not good enough to
 * confidently state a match.
 *
 * @param {CommentSkeletonLike[]} currentComments
 * @param {CommentSkeletonLike[]} otherComments
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

  const sortCommentsByMatchScore = (target, candidates) => (
    candidates
      .map((candidate) => {
        const doesParentAnchorMatch = candidate.parent?.anchor === target.parent?.anchor;
        const doesHeadlineMatch = candidate.section?.headline === target.section?.headline;

        // Taking matched ID into account makes sense only if the total number of comments
        // coincides.
        const doesIdMatch = (
          candidate.id === target.id &&
          currentComments.length === otherComments.length
        );

        const partsMatchedCount = candidate.elementHtmls
          .filter((html, i) => html === target.elementHtmls[i])
          .length;
        const partsMatchedProportion = partsMatchedCount / candidate.elementHtmls.length;
        const overlap = partsMatchedProportion === 1 ?
          1 :
          calculateWordOverlap(candidate.text, target.text);
        const score = (
          doesParentAnchorMatch * (candidate.parent?.anchor ? 1 : 0.75) +
          doesHeadlineMatch * 1 +
          partsMatchedProportion +
          overlap +
          doesIdMatch * 0.25
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
      })
  );

  // We choose to traverse "other" (newer/older) comments in the top cycle, not current. This way,
  // if there are multiple match candidates for an "other" comment, we choose the match between
  // them. This is better than choosing a match for a current comment between "other" comments,
  // because if we determined a match for a current comment and then see a better match for the
  // "other" comment determined as a match, we would have to set the "other" comment as a match to
  // the new current comment, and the initial current comment would lose its match.
  otherComments.forEach((otherComment) => {
    const ccFiltered = currentComments.filter((currentComment) => (
      currentComment.authorName === otherComment.authorName &&
      currentComment.date &&
      otherComment.date &&
      currentComment.date.getTime() === otherComment.date.getTime()
    ));
    if (ccFiltered.length === 1) {
      if (ccFiltered[0].match) {
        const candidates = [otherComment, ccFiltered[0].match];
        ccFiltered[0].match = sortCommentsByMatchScore(ccFiltered[0], candidates)[0].comment;
      } else {
        ccFiltered[0].match = otherComment;
      }
    } else if (ccFiltered.length > 1) {
      let found;
      sortCommentsByMatchScore(otherComment, ccFiltered).forEach((match) => {
        // If the current comment already has a match (from a previous iteration of otherComments
        // cycle), compare their scores.
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
 * Determine if the comment has changed (probably edited) based on the `textComparedHtml` and
 * `headingComparedHtml` properties (the comment may lose its heading because technical comment is
 * added between it and the heading).
 *
 * @param {CommentSkeletonLike[]} olderComment
 * @param {CommentSkeletonLike[]} newerComment
 * @returns {boolean}
 * @private
 */
function hasCommentChanged(olderComment, newerComment) {
  return (
    newerComment.textComparedHtml !== olderComment.textComparedHtml ||
    (
      newerComment.headingComparedHtml &&
      newerComment.headingComparedHtml !== olderComment.headingComparedHtml
    )
  );
}

/**
 * Check if there are changes made to the currently displayed comments since the previous visit.
 *
 * @param {CommentSkeletonLike[]} currentComments
 * @private
 */
function checkForChangesSincePreviousVisit(currentComments) {
  const seenRenderedChanges = cleanUpSeenRenderedChanges(
    getFromLocalStorage('seenRenderedChanges')
  );
  const articleId = mw.config.get('wgArticleId');

  const changeList = [];
  currentComments.forEach((currentComment) => {
    if (currentComment.anchor === submittedCommentAnchor) return;

    const oldComment = currentComment.match;
    if (oldComment) {
      const seenComparedHtml = seenRenderedChanges[articleId]?.[currentComment.anchor]
        ?.comparedHtml;
      if (
        hasCommentChanged(oldComment, currentComment) &&
        seenComparedHtml !== currentComment.comparedHtml
      ) {
        const comment = Comment.getByAnchor(currentComment.anchor);
        if (!comment) return;

        const commentsData = [oldComment, currentComment];
        comment.markAsChanged('changedSince', true, previousVisitRevisionId, commentsData);

        if (comment.isOpeningSection) {
          const section = comment.section;
          if (
            section &&
            !section.isWatched &&
            /^H[1-6]$/.test(currentComment.elementNames[0]) &&
            oldComment.elementNames[0] === currentComment.elementNames[0]
          ) {
            const html = oldComment.elementHtmls[0].replace(
              /\x01(\d+)_\w+\x02/g,
              (s, num) => currentComment.hiddenElementData[num - 1].html
            );
            const $dummy = $('<span>').html($(html).html());
            const oldSection = { headlineElement: $dummy.get(0) };
            Section.prototype.parseHeadline.call(oldSection);
            const newHeadline = section.headline;
            if (
              newHeadline &&
              oldSection.headline !== newHeadline &&
              cd.g.originalThisPageWatchedSections?.includes(oldSection.headline)
            ) {
              section.watch(true, oldSection.headline);
            }
          }
        }

        const commentData = {
          old: oldComment,
          current: currentComment,
        };
        changeList.push({ comment, commentData });
      }
    }
  });

  if (changeList.length) {
    /**
     * Existing comments have changed since the previous visit.
     *
     * @event changesSincePreviousVisit
     * @type {object}
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
 * @param {CommentSkeletonLike[]} currentComments
 * @private
 */
function checkForNewChanges(currentComments) {
  let isChangeMarkUpdated = false;
  const changeList = [];
  currentComments.forEach((currentComment) => {
    const newComment = currentComment.match;
    let comment;
    const events = {};
    if (newComment) {
      comment = Comment.getByAnchor(currentComment.anchor);
      if (!comment) return;

      if (comment.isDeleted) {
        comment.unmarkAsChanged('deleted');
        isChangeMarkUpdated = true;
        events.undeleted = true;
      }
      if (hasCommentChanged(currentComment, newComment)) {
        // The comment may have already been updated previously.
        if (!comment.comparedHtml || comment.comparedHtml !== newComment.comparedHtml) {
          const updateSuccess = comment.update(currentComment, newComment);

          // It is above the Comment#markAsChanged call, because it's used in Comment#flashChanged
          // called indirectly by Comment#markAsChanged.
          comment.comparedHtml = newComment.comparedHtml;

          const commentsData = [currentComment, newComment];
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
      comment = Comment.getByAnchor(currentComment.anchor);
      if (!comment || comment.isDeleted) return;

      comment.markAsChanged('deleted');
      isChangeMarkUpdated = true;
      events.deleted = true;
    }

    if (Object.keys(events).length) {
      const commentData = {
        current: currentComment,
        new: newComment,
      };
      changeList.push({ comment, events, commentData });
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
     * @type {object}
     */
    mw.hook('convenientDiscussions.newChanges').fire(changeList);
  }
}

/**
 * Show an ordinary notification (`mediawiki.notification`) to the user.
 *
 * @param {CommentSkeletonLike[]} comments
 * @private
 */
function showOrdinaryNotification(comments) {
  let filteredComments = [];
  if (cd.settings.notifications === 'all') {
    filteredComments = comments;
  } else if (cd.settings.notifications === 'toMe') {
    filteredComments = comments.filter((comment) => comment.isToMe);
  }

  if (cd.settings.notifications !== 'none' && filteredComments.length) {
    // Combine with content of notifications that were displayed but are still open (i.e., the user
    // most likely didn't see them because the tab is in the background). In the past there could be
    // more than one notification, now there can be only one.
    const openNotification = getNotifications()
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
        const where = comment.watchedSectionHeadline ?
          (
            cd.mws('word-separator') +
            cd.s('notification-part-insection', comment.watchedSectionHeadline)
          ) :
          cd.mws('word-separator') + cd.s('notification-part-onthispage');
        html = (
          cd.sParse('notification-toyou', comment.author.name, comment.author, where) +
          ' ' +
          reloadHtml
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
          reloadHtml
        );
      }
    } else {
      const isCommonSection = filteredComments.every((comment) => (
        comment.watchedSectionHeadline === filteredComments[0].watchedSectionHeadline
      ));
      let section;
      if (isCommonSection) {
        section = filteredComments[0].watchedSectionHeadline;
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
      const mayBeInteresting = section && cd.g.currentPageWatchedSections?.includes(section) ?
        '' :
        mayBeInterestingString;

      html = (
        cd.sParse('notification-newcomments', filteredComments.length, where, mayBeInteresting) +
        ' ' +
        reloadHtml
      );
    }

    closeNotifications(false);
    const $body = wrap(html);
    const notification = addNotification([$body], { comments: filteredComments });
    notification.$notification.on('click', () => {
      reloadPage({ commentAnchor: filteredComments[0].anchor });
    });
  }
}

/**
 * Show a desktop notification to the user.
 *
 * @param {CommentSkeletonLike[]} comments
 * @private
 */
function showDesktopNotification(comments) {
  let filteredComments = [];
  if (cd.settings.desktopNotifications === 'all') {
    filteredComments = comments;
  } else if (cd.settings.desktopNotifications === 'toMe') {
    filteredComments = comments.filter((comment) => comment.isToMe);
  }

  if (!document.hasFocus() && Notification.permission === 'granted' && filteredComments.length) {
    let body;
    const comment = filteredComments[0];
    if (filteredComments.length === 1) {
      if (comment.isToMe) {
        const where = comment.section?.headline ?
          cd.mws('word-separator') + cd.s('notification-part-insection', comment.section.headline) :
          '';
        body = cd.s(
          'notification-toyou-desktop',
          comment.author.name,
          comment.author,
          where,
          cd.g.PAGE.name
        );
      } else {
        body = cd.s(
          'notification-insection-desktop',
          comment.author.name,
          comment.author,
          comment.section?.headline,
          cd.g.PAGE.name
        );
      }
    } else {
      const isCommonSection = filteredComments.every((comment) => (
        comment.watchedSectionHeadline === filteredComments[0].watchedSectionHeadline
      ));
      let section;
      if (isCommonSection) {
        section = filteredComments[0].watchedSectionHeadline;
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
      const mayBeInteresting = section && cd.g.currentPageWatchedSections?.includes(section) ?
        '' :
        mayBeInterestingString;

      body = cd.s(
        'notification-newcomments-desktop',
        filteredComments.length,
        where,
        cd.g.PAGE.name,
        mayBeInteresting
      );
    }

    const notification = new Notification(mw.config.get('wgSiteName'), {
      body,

      // We use a tag so that there aren't duplicate notifications when the same page is opened in
      // two tabs. (Seems it doesn't work? :-/)
      tag: 'convenient-discussions-' + filteredComments[filteredComments.length - 1].anchor,
    });
    notification.onclick = () => {
      parent.focus();

      // Just in case, old browsers. TODO: delete?
      window.focus();

      Comment.redrawLayersIfNecessary(false, true);

      reloadPage({
        commentAnchor: comment.anchor,
        closeNotificationsSmoothly: false,
      });
    };
  }
}

/**
 * Check if the page is still at the specified revision and the content is not loading.
 *
 * @param {number} revisionId
 * @returns {boolean}
 * @private
 */
function isPageStillAtRevision(revisionId) {
  return revisionId === mw.config.get('wgRevisionId') && !isPageLoading();
}

/**
 * Process the comments retrieved by a web worker.
 *
 * @param {CommentSkeletonLike[]} comments Comments from the recent revision.
 * @param {CommentSkeletonLike[]} currentComments Comments from the currently shown revision
 *   mapped to the comments from the recent revision.
 * @param {number} currentRevisionId
 * @private
 */
async function processComments(comments, currentComments, currentRevisionId) {
  comments.forEach((comment) => {
    comment.author = userRegistry.getUser(comment.authorName);
    if (comment.parent?.authorName) {
      comment.parent.author = userRegistry.getUser(comment.parent.authorName);
    }
  });

  const newComments = comments
    .filter((comment) => comment.anchor && !currentComments.some((mcc) => mcc.match === comment))

    // Detach comments in the "newComments" object from those in the "comments" object (so that the
    // last isn't polluted when it is reused).
    .map((comment) => {
      const newComment = Object.assign({}, comment);
      if (comment.parent) {
        const parentMatch = currentComments.find((mcc) => mcc.match === comment.parent);
        if (parentMatch?.anchor) {
          newComment.parentMatch = Comment.getByAnchor(parentMatch.anchor);
        }
      }
      return newComment;
    });

  // Extract "interesting" comments (that would make the new comments counter purple and might
  // invoke notifications). Keep in mind that we should account for the case where comments have
  // been removed. For example, the counter could be "+1" but then go back to displaying the refresh
  // icon which means 0 new comments.
  const interestingNewComments = newComments.filter((comment) => {
    if (!cd.settings.notifyCollapsedThreads && comment.logicalLevel !== 0) {
      let parentMatch;
      for (let c = comment; c && !parentMatch; c = c.parent) {
        parentMatch = c.parentMatch;
      }
      if (parentMatch?.isCollapsed) {
        return false;
      }
    }
    if (comment.isOwn || cd.settings.notificationsBlacklist.includes(comment.author.name)) {
      return false;
    }
    if (comment.isToMe) {
      return true;
    }
    if (!cd.g.currentPageWatchedSections) {
      return false;
    }
    if (comment.section) {
      // Is this section watched by means of an upper level section?
      const section = comment.section.match;
      if (section) {
        const closestWatchedSection = section.getClosestWatchedSection(true);
        if (closestWatchedSection) {
          comment.watchedSectionHeadline = closestWatchedSection.headline;
          return true;
        }
      }
    }
    return false;
  });

  if (cd.g.GENDER_AFFECTS_USER_STRING) {
    await getUserGenders(newComments.map((comment) => comment.author), true);
  }

  if (!isPageStillAtRevision(currentRevisionId)) return;

  if (interestingNewComments[0]) {
    updateChecker.relevantNewCommentAnchor = interestingNewComments[0].anchor;
  } else if (newComments[0]) {
    updateChecker.relevantNewCommentAnchor = newComments[0].anchor;
  }

  const newCommentsBySection = Comment.groupBySection(newComments);
  const areThereInteresting = Boolean(interestingNewComments.length);
  navPanel.updateRefreshButton(newComments.length, newCommentsBySection, areThereInteresting);
  updateChecker.updatePageTitle(newComments.length, areThereInteresting);
  toc.addNewComments(newCommentsBySection);

  Comment.addNewCommentsNotes(newComments);

  const commentsToNotifyAbout = interestingNewComments
    .filter((comment) => !commentsNotifiedAbout.some((cna) => cna.anchor === comment.anchor));
  showOrdinaryNotification(commentsToNotifyAbout);
  showDesktopNotification(commentsToNotifyAbout);
  commentsNotifiedAbout.push(...commentsToNotifyAbout);
}

/**
 * Perform a task in a web worker.
 *
 * @param {object} payload
 * @returns {Promise}
 * @private
 */
function runWorkerTask(payload) {
  return new Promise((resolve) => {
    const resolverId = resolverCount++;
    Object.assign(payload, { resolverId });
    cd.g.worker.postMessage(payload);
    resolvers[resolverId] = resolve;
  });
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
   * Anchor of the comment that should be jumped to after reloading the page.
   *
   * @type {?string}
   * @memberof module:updateChecker
   */
  relevantNewCommentAnchor: null,

  /**
   * _For internal use._ Initialize the update checker.
   *
   * @param {Promise} visitsRequest
   * @param {object} passedData
   * @memberof module:updateChecker
   */
  async init(visitsRequest, passedData) {
    if (!cd.g.worker) return;

    commentsNotifiedAbout = [];
    this.relevantNewCommentAnchor = null;
    isBackgroundCheckArranged = false;
    previousVisitRevisionId = null;

    if (cd.g.worker.onmessage) {
      removeAlarmViaWorker();
    } else {
      cd.g.worker.onmessage = onMessageFromWorker;
    }

    setAlarmViaWorker(cd.g.UPDATE_CHECK_INTERVAL * 1000);

    // It is processed in processPage~processVisits.
    await visitsRequest;

    if (cd.g.previousVisitUnixTime) {
      processRevisionsIfNeeded();
      if (passedData.wasCommentFormSubmitted && passedData.commentAnchor) {
        submittedCommentAnchor = passedData.commentAnchor;
      }
    }
  },

  /**
   * _For internal use._ Process the current page in a web worker.
   *
   * @param {number} [revisionToParseId]
   * @returns {Promise.<object>}
   * @memberof module:updateChecker
   */
  async processPage(revisionToParseId) {
    if (revisionData[revisionToParseId]) {
      return revisionData[revisionToParseId];
    }

    const {
      text,
      revid: revisionId,
    } = await cd.g.PAGE.parse({ oldid: revisionToParseId }, true) || {};

    const disallowedNames = [
      '$content',
      '$root',
      '$toc',
      'rootElement',
      'visits',
      'watchedSections',
    ];

    const message = await runWorkerTask({
      type: 'parse',
      revisionId,
      text,
      g: keepWorkerSafeValues(cd.g, ['IS_IPv6_ADDRESS', 'TIMESTAMP_PARSER'], disallowedNames),
      config: keepWorkerSafeValues(cd.config, ['checkForCustomForeignComponents'], disallowedNames),
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
  },

  /**
   * _For internal use._ Update the page title to show the number of comments added to the page
   * since it was loaded.
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
