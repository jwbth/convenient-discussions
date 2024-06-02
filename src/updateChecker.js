/**
 * Singleton responsible for polling for updates of the page in the background.
 *
 * @module updateChecker
 */

import CdError from './CdError';
import StorageItem from './StorageItem';
import cd from './cd';
import commentFormRegistry from './commentFormRegistry';
import commentRegistry from './commentRegistry';
import controller from './controller';
import sectionRegistry from './sectionRegistry';
import settings from './settings';
import userRegistry from './userRegistry';
import { loadUserGenders } from './utils-api';
import { calculateWordOverlap, keepWorkerSafeValues } from './utils-general';
import visits from './visits';

// FIXME: Make this into a singleton (object) without inner module variables, so that it emits with
// this.emit(). Move worker-related stuff to controller.

const revisionData = {};
const resolvers = {};

let isBackgroundCheckArranged;
let previousVisitRevisionId;
let lastCheckedRevisionId;
let resolverCount = 0;

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
 * Process the current page in a web worker.
 *
 * @param {number} [revisionToParseId]
 * @returns {Promise.<object>}
 * @private
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
    config: keepWorkerSafeValues(cd.config, ['rejectNode']),
  });

  revisionData[message.revisionId] ??= message;

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
 * @param {number} previousVisitTime
 * @param {number} [submittedCommentId]
 * @private
 */
async function maybeProcessRevisionsAtLoad(previousVisitTime, submittedCommentId) {
  previousVisitRevisionId = (
    await cd.page.getRevisions({
      rvprop: ['ids'],
      rvstart: new Date(previousVisitTime * 1000).toISOString(),
      rvlimit: 1,
    }, true)
  )[0]?.revid;
  const currentRevisionId = mw.config.get('wgRevisionId');

  if (previousVisitRevisionId && previousVisitRevisionId < currentRevisionId) {
    const { comments: oldComments } = await processPage(previousVisitRevisionId);
    const { comments: currentComments } = await processPage(currentRevisionId);
    if (isPageStillAtRevision(currentRevisionId)) {
      mapComments(currentComments, oldComments);
      checkForChangesSincePreviousVisit(currentComments, submittedCommentId);
    }
  }
}

/**
 * Map sections obtained from a revision to the sections present on the page.
 *
 * @param {import('./SectionSkeleton').SectionSkeletonLike[]} otherSections
 * @private
 */
function mapSections(otherSections) {
  // Reset values set in the previous run.
  sectionRegistry.getAll().forEach((section) => {
    delete section.match;
    delete section.matchScore;
  });
  otherSections.forEach((otherSection) => {
    delete otherSection.match;
  });

  otherSections.forEach((otherSection) => {
    const { section, score } = sectionRegistry.search(otherSection) || {};
    if (section && (!section.match || score > section.matchScore)) {
      if (section.match) {
        delete section.match.match;
      }
      section.match = otherSection;
      section.matchScore = score;
      otherSection.match = section;
    }
  });

  sectionRegistry.getAll().forEach((section) => {
    section.liveSectionNumber = section.match?.sectionNumber ?? null;
    section.liveSectionNumberRevisionId = lastCheckedRevisionId;
    delete section.presumedCode;
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
    .sort((match1, match2) => match2.score - match1.score);
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
  if (!cd.page.isActive() || controller.isBooting()) return;

  // We need a value that wouldn't change during `await`s.
  const documentHidden = document.hidden;

  if (documentHidden && !isBackgroundCheckArranged) {
    $(document).one('visibilitychange', () => {
      isBackgroundCheckArranged = false;
      removeAlarmViaWorker();
      checkForUpdates();
    });

    const interval = Math.abs(cd.g.backgroundUpdateCheckInterval - cd.g.updateCheckInterval);
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
      const {
        revisionId,
        comments: newComments,
        sections,
      } = await processPage();
      if (isPageStillAtRevision(currentRevisionId)) {
        const { comments: currentComments } = await processPage(currentRevisionId);

        // We set the value here, not after the first `await`, so that we are sure that
        // lastCheckedRevisionId corresponds to the versions of comments that are currently
        // rendered.
        lastCheckedRevisionId = revisionId;
        updateChecker.emit('check', lastCheckedRevisionId);

        if (isPageStillAtRevision(currentRevisionId)) {
          mapSections(sections);
          mapComments(currentComments, newComments);

          updateChecker.emit('sectionsUpdate', sections);

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
    setAlarmViaWorker(cd.g.backgroundUpdateCheckInterval * 1000);
    isBackgroundCheckArranged = true;
  } else {
    setAlarmViaWorker(cd.g.updateCheckInterval * 1000);
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
 * @param {number} submittedCommentId
 * @private
 */
function checkForChangesSincePreviousVisit(currentComments, submittedCommentId) {
  const seenStorageItem = (new StorageItem('seenRenderedChanges'))
    .cleanUp((entry) => (
      // FIXME: Remove `|| data.seenUnixTime` after June 2024
      (Math.min(...Object.values(entry).map((data) => data.seenTime || data.seenUnixTime)) || 0) <
      Date.now() - 60 * cd.g.msInDay
    ));
  const seen = seenStorageItem.get(mw.config.get('wgArticleId'));

  const changeList = [];
  const markAsChangedData = [];
  currentComments.forEach((currentComment) => {
    if (currentComment.id === submittedCommentId) return;

    const oldComment = currentComment.match;
    if (oldComment) {
      const seenHtmlToCompare = seen?.[currentComment.id]?.htmlToCompare;
      if (
        hasCommentChanged(oldComment, currentComment) &&
        seenHtmlToCompare !== currentComment.htmlToCompare
      ) {
        const comment = commentRegistry.getById(currentComment.id);
        if (!comment) return;

        // Different indexes to supply one object both to the event and Comment#markAsChanged.
        const commentsData = {
          old: oldComment,
          current: currentComment,
          0: oldComment,
          1: currentComment,
        };

        markAsChangedData.push({
          comment,
          isNewRevisionRendered: true,
          comparedRevisionId: previousVisitRevisionId,
          commentsData,
        });

        if (comment.isOpeningSection) {
          comment.section?.resubscribeIfRenamed(currentComment, oldComment);
        }

        changeList.push({ comment, commentsData });
      }
    }
  });

  markCommentsAsChanged(
    'changedSince',
    markAsChangedData,
    previousVisitRevisionId,
    mw.config.get('wgRevisionId')
  );

  if (changeList.length) {
    /**
     * Existing comments have changed since the previous visit.
     *
     * @event changesSincePreviousVisit
     * @param {object[]} changeList
     * @param {import('./Comment').default} changeList.comment
     * @param {object} changeList.commentsData
     * @global
     */
    mw.hook('convenientDiscussions.changesSincePreviousVisit').fire(changeList);
  }

  seenStorageItem
    .remove(mw.config.get('wgArticleId'))
    .save();
}

/**
 * Check if there are changes made to the currently displayed comments since they were rendered.
 *
 * @param {import('./CommentSkeleton').CommentSkeletonLike[]} currentComments
 * @private
 */
function checkForNewChanges(currentComments) {
  const changeList = [];
  const markAsChangedData = [];
  currentComments.forEach((currentComment) => {
    const newComment = currentComment.match;
    let comment;
    const events = {};

    // Different indexes to supply one object both to the event and Comment#markAsChanged().
    const commentsData = {
      current: currentComment,
      new: newComment,
      0: currentComment,
      1: newComment,
    };

    if (newComment) {
      comment = commentRegistry.getById(currentComment.id);
      if (!comment) return;

      if (comment.isDeleted) {
        comment.unmarkAsChanged('deleted');
        events.undeleted = true;
      }
      if (hasCommentChanged(currentComment, newComment)) {
        // The comment may have already been updated previously.
        if (!comment.htmlToCompare || comment.htmlToCompare !== newComment.htmlToCompare) {
          const updateSuccess = comment.update(currentComment, newComment);

          // It is above the Comment#markAsChanged() call, because it's used in
          // Comment#flashChanged() called indirectly by Comment#markAsChanged().
          comment.htmlToCompare = newComment.htmlToCompare;

          markAsChangedData.push({
            comment,
            isNewRevisionRendered: updateSuccess,
            comparedRevisionId: lastCheckedRevisionId,
            commentsData,
          });
          events.changed = { updateSuccess };
        }
      } else if (comment.isChanged) {
        comment.update(currentComment, newComment);
        comment.unmarkAsChanged('changed');
        events.unchanged = true;
      }
    } else if (!currentComment.hasPoorMatch) {
      comment = commentRegistry.getById(currentComment.id);
      if (!comment || comment.isDeleted) return;

      comment.markAsChanged('deleted');
      events.deleted = true;
    }

    if (Object.keys(events).length) {
      changeList.push({ comment, events, commentsData });
    }
  });

  markCommentsAsChanged(
    'changed',
    markAsChangedData,
    mw.config.get('wgRevisionId'),
    lastCheckedRevisionId
  );

  if (changeList.length) {
    updateChecker.emit('newChanges', changeList);

    /**
     * Existing comments have changed (probably edited).
     *
     * @event newChanges
     * @param {object[]} changeList
     * @param {import('./Comment').default} changeList.comment
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
 * Data needed to mark the comment as changed
 *
 * @typedef {object} MarkAsChangedData
 * @property {import('./Comment').default} comment
 * @property {boolean} updateSuccess
 * @property {object} commentsData
 * @private
 */

/**
 * Mark comments as changed, verifying diffs if possible to decide whether to show the diff link.
 *
 * @param {'changed'|'changedSince'|'deleted'} type
 * @param {MarkAsChangedData[]} data
 * @param {number} revisionIdLesser
 * @param {number} revisionIdGreater
 */
async function markCommentsAsChanged(type, data, revisionIdLesser, revisionIdGreater) {
  if (!data.length) return;

  const currentRevisionId = mw.config.get('wgRevisionId');

  // Don't process >20 diffs, that's too much and probably means something is broken
  const verifyDiffs = (
    data.length <= 20 &&
    data.some(({ comment }) => comment.getSourcePage().isCurrent())
  );

  let revisions;
  let compareBody;
  if (verifyDiffs) {
    try {
      revisions = await cd.page.getRevisions({
        revids: [revisionIdLesser, revisionIdGreater],
        rvprop: ['content'],
      });
      compareBody = await cd.page.compareRevisions(revisionIdLesser, revisionIdGreater);
    } catch {
      // Empty
    }
  }
  if (!isPageStillAtRevision(currentRevisionId)) return;

  data.forEach(({ comment, isNewRevisionRendered, comparedRevisionId, commentsData }) => {
    comment.markAsChanged(
      type,
      isNewRevisionRendered,
      comparedRevisionId,
      commentsData,
      verifyDiffs && compareBody !== undefined && revisions !== undefined ?
        Boolean(
          comment.scrubDiff(compareBody, revisions, commentsData)
            .find('.diff-deletedline, .diff-addedline')
            .length
        ) :
        true
    );
  });

  commentRegistry.emit('registerSeen');
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
    !commentFormRegistry.getAll().some((commentForm) => commentForm.isBeingSubmitted())
  );
}

/**
 * Process the comments retrieved by a web worker.
 *
 * @param {import('./CommentSkeleton').CommentSkeletonLike[]} comments Comments in the recent
 *   revision.
 * @param {import('./CommentSkeleton').CommentSkeletonLike[]} currentComments Comments in the
 *   currently shown revision mapped to the comments in the recent revision.
 * @param {number} currentRevisionId ID of the revision that can be seen on the page.
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

    // Detach comments in the newComments object from those in the `comments` object (so that the
    // last isn't polluted when it is reused).
    .map((comment) => {
      const newComment = Object.assign({}, comment);
      if (comment.parent) {
        const parentMatch = currentComments.find((mcc) => mcc.match === comment.parent);
        if (parentMatch?.id) {
          newComment.parentMatch = commentRegistry.getById(parentMatch.id);
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

  if (cd.g.genderAffectsUserString) {
    await loadUserGenders(newComments.map((comment) => comment.author), true);
  }

  if (!isPageStillAtRevision(currentRevisionId)) return;

  updateChecker.emit('commentsUpdate', newComments, relevantNewComments);
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

/**
 * @exports updateChecker
 */
const updateChecker = {
  /**
   * _For internal use._ Initialize the update checker.
   */
  init() {
    visits
      .on('process', (currentPageData) => {
        const bootProcess = controller.getBootProcess();
        this.setup(
          currentPageData.length >= 2 ?
            Number(currentPageData[currentPageData.length - 2]) :
            undefined,
          (
            (
              bootProcess.passedData.wasCommentFormSubmitted &&
              bootProcess.passedData.commentIds?.[0]
            ) ||
            undefined
          )
        );
      });
  },

  /**
   * _For internal use._ Set up the update checker. Executed on each page reload.
   *
   * @param {string} previousVisitTime
   * @param {number} submittedCommentId
   */
  async setup(previousVisitTime, submittedCommentId) {
    isBackgroundCheckArranged = false;
    previousVisitRevisionId = null;

    const worker = controller.getWorker();
    if (worker.onmessage) {
      removeAlarmViaWorker();
    } else {
      worker.onmessage = onMessageFromWorker;
    }

    setAlarmViaWorker(cd.g.updateCheckInterval * 1000);

    if (previousVisitTime) {
      maybeProcessRevisionsAtLoad(previousVisitTime, submittedCommentId);
    }
  },
};

export default updateChecker;
export { processPage };
