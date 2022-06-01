import cd from './cd';
import { areObjectsEqual, calculateWordOverlap, spacesToUnderlines } from './util';

export default {
  /**
   * Get a section by ID.
   *
   * @param {string} id
   * @returns {?Section}
   * @memberof Section
   */
  getById(id) {
    if (!cd.sections || !id) {
      return null;
    }
    return cd.sections.find((section) => section.id === id) || null;
  },

  /**
   * Get sections by headline.
   *
   * @param {string} headline
   * @returns {Section[]}
   * @memberof Section
   */
  getByHeadline(headline) {
    return cd.sections.filter((section) => section.headline === headline);
  },

  /**
   * Get sections by {@link Section#subscribeId subscribe ID}.
   *
   * @param {string} subscribeId
   * @returns {Section[]}
   * @memberof Section
   */
  getBySubscribeId(subscribeId) {
    return cd.sections.filter((section) => section.subscribeId === subscribeId);
  },

  /**
   * Find a section with a similar name on the page (when the section with the exact name was not
   * found).
   *
   * @param {string} sectionName
   * @returns {?Section}
   */
  findByHeadlineParts(sectionName) {
    const matches = cd.sections
      .map((section) => {
        const score = calculateWordOverlap(sectionName, section.headline);
        return { section, score };
      })
      .filter((match) => match.score > 0.66);
    const bestMatch = matches.sort((m1, m2) => m2.score - m1.score)[0];
    return bestMatch ? bestMatch.section : null;
  },

  /**
   * Search for a section on the page based on several parameters: index, headline, id, ancestor
   * sections' headlines, oldest comment data. At least two parameters must match, not counting
   * index and id. The section that matches best is returned.
   *
   * @param {object} options
   * @param {number} options.index
   * @param {string} options.headline
   * @param {string} options.id
   * @param {string[]} options.ancestors
   * @param {string} options.oldestCommentId
   * @param {boolean} [returnScore]
   * @returns {?Section}
   * @memberof Section
   */
  search({ index, headline, id, ancestors, oldestCommentId }, returnScore) {
    const matches = [];
    cd.sections.some((section) => {
      const doesIndexMatch = section.index === index;
      const doesHeadlineMatch = section.headline === headline;
      const doesIdMatch = section.id === id;
      let doAncestorsMatch;
      if (ancestors) {
        const sectionAncestors = section.getAncestors().map((section) => section.headline);
        doAncestorsMatch = areObjectsEqual(sectionAncestors, ancestors);
      } else {
        doAncestorsMatch = false;
      }
      const doesOldestCommentMatch = section.oldestComment?.id === oldestCommentId;
      const score = (
        doesHeadlineMatch * 1 +
        doAncestorsMatch * 1 +
        doesOldestCommentMatch * 1 +
        doesIdMatch * 0.5 +
        doesIndexMatch * 0.001
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
   * _For internal use._ Perform extra section-related tasks, including adding the
   * {@link Section#isLastSection isLastSection} property, adding buttons, and binding events.
   *
   * @memberof Section
   */
  adjust() {
    cd.sections.forEach((section, i) => {
      /**
       * Is the section the last section on the page.
       *
       * @name isLastSection
       * @type {boolean}
       * @memberof Section
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
          section.comments[0] &&
          section.comments[0].level === 0 &&
          section.comments.every((comment) => !comment.isActionable)
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

        // The same for the "Reply" button, but as this button is added to the end of the first
        // chunk, we look at just the next section, not necessarily of the same level.
        const isFirstChunkClosed = (
          section.commentsInFirstChunk[0] &&
          section.commentsInFirstChunk[0].level === 0 &&
          section.commentsInFirstChunk.every((comment) => !comment.isActionable)
        );
        if (
          !isFirstChunkClosed &&

          // The subsection heading doesn't directly follow the section heading.
          !(
            section.lastElement !== section.lastElementInFirstChunk &&
            section.lastElementInFirstChunk === section.$heading.get(0)
          ) &&

          // May mean complex formatting, so we better keep out.
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
          $(targetSection.replyButton.buttonElement)
            .on('mouseenter', section.replyButtonHoverHandler)
            .on('mouseleave', section.replyButtonUnhoverHandler);
        }
      });
  },

  /**
   * Add a "subscribe" menu item to each section menu.
   */
  addSubscribeMenuItems() {
    cd.sections.forEach((section) => {
      section.addSubscribeMenuItem();
    });
  },

  /**
   * Generate an DiscussionTools ID for a section.
   *
   * @param {string} author Author name.
   * @param {Date} timestamp Oldest comment date.
   * @returns {string}
   */
  generateDtSubscriptionId(author, timestamp) {
    const date = new Date(timestamp);
    date.setSeconds(0);
    return `h-${spacesToUnderlines(author)}-${date.toISOString()}`;
  },
};
