/**
 * Methods related to sections.
 *
 * @module SectionStatic
 */

import CdError from './CdError';
import cd from './cd';
import { addToArrayIfAbsent, areObjectsEqual, removeFromArrayIfPresent } from './util';
import { editWatchedSections } from './modal';
import { getWatchedSections, setWatchedSections } from './options';

let watchPromise = Promise.resolve();

export default {
  /**
   * Add a section present on the current page to the watched sections list.
   *
   * @param {string} headline
   * @param {string} [unwatchHeadline] Section to unwatch together with watching the specified
   *   section (used when a section is renamed on the fly in {@link module:Comment#update} or {@link
   *   module:CommentForm#submit}).
   * @returns {Promise}
   * @throws {CdError}
   * @memberof module:Section
   */
  watch(headline, unwatchHeadline) {
    const watch = async () => {
      try {
        await getWatchedSections();
      } catch (e) {
        mw.notify(cd.s('section-watch-error-load'), { type: 'error' });
        throw e;
      }

      // The section could be added to the watchlist in another tab.
      addToArrayIfAbsent(cd.g.currentPageWatchedSections, headline);
      removeFromArrayIfPresent(cd.g.currentPageWatchedSections, unwatchHeadline);

      try {
        await setWatchedSections();
      } catch (e) {
        if (e instanceof CdError) {
          const { type, code } = e.data;
          if (type === 'internal' && code === 'sizeLimit') {
            const $body = cd.util.wrap(cd.sParse('section-watch-error-maxsize'), {
              callbacks: {
                'cd-notification-editWatchedSections': () => {
                  editWatchedSections();
                },
              },
            });
            mw.notify($body, {
              type: 'error',
              autoHideSeconds: 'long',
            });
          } else {
            mw.notify(cd.s('section-watch-error-save'), { type: 'error' });
          }
        } else {
          mw.notify(cd.s('section-watch-error-save'), { type: 'error' });
        }
        throw e;
      }
    };

    watchPromise = watchPromise.then(watch, watch);
    return watchPromise;
  },

  /**
   * Add a section present on the current page to the watched sections list.
   *
   * @param {string} headline
   * @returns {Promise}
   * @throws {CdError}
   * @memberof module:Section
   */
  unwatch(headline) {
    const unwatch = async () => {
      try {
        await getWatchedSections();
      } catch (e) {
        mw.notify(cd.s('section-watch-error-load'), { type: 'error' });
        throw e;
      }

      // The section could be removed from the watchlist in another tab.
      removeFromArrayIfPresent(cd.g.currentPageWatchedSections, headline);

      if (!cd.g.currentPageWatchedSections.length) {
        delete cd.g.watchedSections[mw.config.get('wgArticleId')];
      }

      try {
        await setWatchedSections();
      } catch (e) {
        mw.notify(cd.s('section-watch-error-save'), { type: 'error' });
        throw e;
      }
    };

    watchPromise = watchPromise.then(unwatch, unwatch);
    return watchPromise;
  },

  /**
   * Get a section by anchor.
   *
   * @param {string} anchor
   * @returns {?Section}
   * @memberof module:Section
   */
  getByAnchor(anchor) {
    if (!cd.sections || !anchor) {
      return null;
    }
    return cd.sections.find((section) => section.anchor === anchor) || null;
  },

  /**
   * Get sections by headline.
   *
   * @param {string} headline
   * @returns {Section[]}
   * @memberof module:Section
   */
  getByHeadline(headline) {
    return cd.sections.filter((section) => section.headline === headline);
  },

  /**
   * Search for a section on the page based on several parameters: id (index), headline, anchor,
   * ancestor sections' headlines, oldest comment data. At least two parameters must match, not
   * counting id and anchor. The section that matches best is returned.
   *
   * @param {object} options
   * @param {number} options.id
   * @param {string} options.headline
   * @param {string} options.anchor
   * @param {string[]} options.ancestors
   * @param {string} options.oldestCommentAnchor
   * @param {boolean} [returnScore]
   * @returns {?Section}
   * @memberof module:Section
   */
  search({ id, headline, anchor, ancestors, oldestCommentAnchor }, returnScore) {
    const matches = [];
    cd.sections.some((section) => {
      const hasIdMatched = section.id === id;
      const hasHeadlineMatched = section.headline === headline;
      const hasAnchorMatched = section.anchor === anchor;
      let haveAncestorsMatched;
      if (ancestors) {
        const sectionAncestors = section.getAncestors().map((section) => section.headline);
        haveAncestorsMatched = areObjectsEqual(sectionAncestors, ancestors);
      } else {
        haveAncestorsMatched = false;
      }
      const hasOldestCommentMatched = section.oldestComment?.anchor === oldestCommentAnchor;
      const score = (
        hasHeadlineMatched * 1 +
        haveAncestorsMatched * 1 +
        hasOldestCommentMatched * 1 +
        hasAnchorMatched * 0.5 +
        hasIdMatched * 0.001
      );
      if (score >= 2) {
        matches.push({ section, score });
      }

      // Score bigger than 3.5 means it's the best match for sure. Two sections can't have
      // coinciding anchors, so there can't be two sections with the score bigger than 3.5.
      return score >= 3.5;
    });

    let bestMatch;
    matches.forEach((match) => {
      if (!bestMatch || match.score > bestMatch.score) {
        bestMatch = match;
      }
    });
    if (returnScore) {
      return bestMatch || null;
    } else {
      return bestMatch ? bestMatch.section : null;
    }
  },

  /**
   * Perform extra section-related tasks, including adding the {@link module:Section#isLastSection
   * isLastSection} property, adding buttons, and binding events.
   *
   * @memberof module:Section
   */
  adjust() {
    cd.sections.forEach((section, i) => {
      /**
       * Is the section the last section on the page.
       *
       * @name isLastSection
       * @type {boolean}
       * @memberof module:Section
       * @instance
       */
      section.isLastSection = i === cd.sections.length - 1;

      if (section.isActionable) {
        // If the next section of the same level has another nesting level (e.g., is inside a <div>
        // with a specific style), don't add the "Add subsection" button - it would appear in the
        // wrong place.
        const nextSameLevelSection = cd.sections
          .slice(i + 1)
          .find((otherSection) => otherSection.level === section.level);
        const isClosed = (
          section.elements.length === 2 &&
          cd.config.closedDiscussionClasses
            ?.some((className) => section.elements[1].classList?.contains(className))
        );
        if (
          isClosed ||
          (
            nextSameLevelSection &&
            nextSameLevelSection.headingNestingLevel !== section.headingNestingLevel
          )
        ) {
          const menu = section.menu;
          if (menu) {
            menu.addSubsection?.wrapperElement.remove();
            delete menu.addSubsection;
          }
        } else {
          section.addAddSubsectionButton();
        }

        const isFirstChunkClosed = (
          section.elements[1] === section.lastElementInFirstChunk &&
          cd.config.closedDiscussionClasses
            ?.some((className) => section.lastElementInFirstChunk.classList?.contains(className))
        );
        const firstContentElement = section.$elements.get(1);

        // The same for the "Reply" button, but as this button is added to the end of the first
        // chunk, we look at just the next section, not necessarily of the same level.
        if (
          // The first element is a heading of a subsection.
          (!firstContentElement || !/^H[1-6]$/.test(firstContentElement.tagName)) &&

          !isFirstChunkClosed &&
          (
            !cd.sections[i + 1] ||
            cd.sections[i + 1].headingNestingLevel === section.headingNestingLevel
          )
        ) {
          section.addReplyButton();
        }
      }
    });

    cd.sections
      .filter((section) => section.isActionable && section.level === 2)
      .forEach((section) => {
        // Section with the last reply button
        const subsections = section.getChildren(true);
        const targetSection = subsections.length ? subsections[subsections.length - 1] : section;
        if (targetSection.replyButton) {
          $(targetSection.replyButton.linkElement)
            .on('mouseenter', section.replyButtonHoverHandler)
            .on('mouseleave', section.replyButtonUnhoverHandler);
        }
      });
  },

  /**
   * Remove sections that can't be found on the page anymore from the watched sections list and save
   * them to the server.
   *
   * @memberof module:Section
   */
  cleanUpWatched() {
    if (!cd.sections) return;

    const initialSectionCount = cd.g.currentPageWatchedSections.length;
    cd.g.originalThisPageWatchedSections = cd.g.currentPageWatchedSections.slice();
    cd.g.currentPageWatchedSections = cd.g.currentPageWatchedSections
      .filter((headline) => cd.sections.some((section) => section.headline === headline));
    cd.g.watchedSections[mw.config.get('wgArticleId')] = cd.g.currentPageWatchedSections;
    if (cd.g.currentPageWatchedSections.length !== initialSectionCount) {
      setWatchedSections();
    }
  },
};
