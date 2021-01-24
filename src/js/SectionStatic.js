/**
 * Methods related to sections.
 *
 * @module SectionStatic
 */

import CdError from './CdError';
import cd from './cd';
import { areObjectsEqual, unique } from './util';
import { editWatchedSections } from './modal';
import { getWatchedSections, setWatchedSections } from './options';
import { reloadPage } from './boot';

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
      if (!cd.g.thisPageWatchedSections.includes(headline)) {
        cd.g.thisPageWatchedSections.push(headline);
      }

      if (unwatchHeadline && cd.g.thisPageWatchedSections.includes(unwatchHeadline)) {
        cd.g.thisPageWatchedSections.splice(
          cd.g.thisPageWatchedSections.indexOf(unwatchHeadline),
          1
        );
      }

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
      if (cd.g.thisPageWatchedSections.includes(headline)) {
        cd.g.thisPageWatchedSections.splice(cd.g.thisPageWatchedSections.indexOf(headline), 1);
      }

      if (!cd.g.thisPageWatchedSections.length) {
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
   */
  getByHeadline(headline) {
    return cd.sections.filter((section) => section.headline === headline);
  },

  /**
   * Get a section by several parameters: id (index), headline, anchor, parent tree, first comment
   * data. At least two parameters must match, not counting id and anchor.
   *
   * @param {object} options
   * @param {number} options.id
   * @param {string} options.headline
   * @param {string} options.anchor
   * @param {string} [options.parentTree]
   * @param {string} [options.firstCommentAnchor]
   * @returns {?Section}
   */
  search({ id, headline, anchor, parentTree, firstCommentAnchor }) {
    const matches = [];
    cd.sections.some((section) => {
      const hasIdMatched = section.id === id;
      const hasHeadlineMatched = section.headline === headline;
      const hasAnchorMatched = section.anchor === anchor;
      let hasParentTreeMatched;
      if (parentTree) {
        const sectionParentTree = section.getParentTree().map((section) => section.headline);
        hasParentTreeMatched = areObjectsEqual(sectionParentTree, parentTree);
      } else {
        hasParentTreeMatched = 0.25;
      }
      const hasFirstCommentMatched = section.comments[0]?.anchor === firstCommentAnchor;
      const score = (
        hasHeadlineMatched * 1 +
        hasParentTreeMatched * 1 +
        hasFirstCommentMatched * 1 +
        hasAnchorMatched * 0.5 +
        hasIdMatched * 0.001
      );
      if (score >= 2) {
        matches.push({ section, score });
      }

      // Score bigger than 3.5 means it's the best match for sure. Two sections can't have
      // coinciding anchors, so there can't be 2 sections with the score bigger than 3.5.
      return score >= 3.5;
    });

    let bestMatch;
    matches.forEach((match) => {
      if (!bestMatch || match.score > bestMatch.score) {
        bestMatch = match;
      }
    });
    return bestMatch ? bestMatch.section : null;
  },

  /**
   * Perform extra section-related tasks, including adding the `isLastSection` property, adding
   * buttons, and binding events.
   */
  adjustSections() {
    cd.sections.forEach((section, i) => {
      /**
       * Is the section the last section on the page.
       *
       * @name isLastSection
       * @type {boolean}
       * @instance module:Section
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
          !isClosed &&
          (
            !nextSameLevelSection ||
            nextSameLevelSection.headingNestingLevel === section.headingNestingLevel
          )
        ) {
          section.addAddSubsectionButton();
        } else {
          section.$heading.find('.cd-sectionLink-addSubsection').parent().remove();
        }

        const isFirstChunkClosed = (
          section.elements[1] === section.lastElementInFirstChunk &&
          cd.config.closedDiscussionClasses
            ?.some((className) => section.lastElementInFirstChunk.classList?.contains(className))
        );

        // The same for the "Reply" button, but as this button is added to the end of the first
        // chunk, we look at just the next section, not necessarily of the same level.
        if (
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
        if (targetSection.$replyButtonLink) {
          targetSection.$replyButtonLink
            .on('mouseenter', section.replyButtonHoverHandler)
            .on('mouseleave', section.replyButtonUnhoverHandler);
        }
      });
  },

  /**
   * Add new comments notifications to the end of each updated section.
   *
   * @param {Map} newCommentsBySection
   */
  addNewCommentsNotifications(newCommentsBySection) {
    $('.cd-refreshButtonContainer').remove();

    newCommentsBySection.forEach((comments, section) => {
      if (!section || typeof section === 'string') return;

      const authors = comments
        .map((comment) => comment.author)
        .filter(unique);
      const genders = authors.map((author) => author.getGender());
      let commonGender;
      if (genders.every((gender) => gender === 'female')) {
        commonGender = 'female';
      } else if (genders.every((gender) => gender !== 'female')) {
        commonGender = 'male';
      } else {
        commonGender = 'unknown';
      }
      const userList = authors.map((user) => user.name).join(', ');
      const button = new OO.ui.ButtonWidget({
        label: cd.s('section-newcomments', comments.length, authors.length, userList, commonGender),
        framed: false,
        classes: ['cd-button', 'cd-sectionButton'],
      });
      button.on('click', () => {
        const commentAnchor = comments[0].anchor;
        reloadPage({ commentAnchor });
      });

      let $lastElement;
      if (section.$addSubsectionButtonContainer && !section.getChildren().length) {
        $lastElement = section.$addSubsectionButtonContainer;
      } else if (section.$replyButton) {
        $lastElement = section.$replyButton.closest('ul, ol, dl');
      } else {
        $lastElement = section.$elements[section.$elements.length - 1];
      }
      $('<div>')
        .addClass('cd-refreshButtonContainer')
        .addClass('cd-sectionButtonContainer')
        .append(button.$element)
        .insertAfter($lastElement);
    });
  },

  /**
   * Generate HTML to use it in the TOC for the section. Only a limited number of HTML elements is
   * allowed in TOC.
   *
   * @param {JQuery} $headline
   * @returns {string}
   */
  generateTocItemHtml($headline) {
    return $headline
      .clone()
      .find('*')
      .each((i, el) => {
        if (['B', 'EM', 'I', 'S', 'STRIKE', 'STRONG', 'SUB', 'SUP'].includes(el.tagName)) {
          Array.from(el.attributes).forEach((attr) => {
            el.removeAttribute(attr.name);
          });
        } else {
          Array.from(el.childNodes).forEach((child) => {
            el.parentNode.insertBefore(child, el);
          });
          el.remove();
        }
      })
      .end()
      .html();
  },
};
