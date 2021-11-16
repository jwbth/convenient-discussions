import cd from './cd';
import { areObjectsEqual } from './util';

export default {
  /**
   * Get a section by anchor.
   *
   * @param {string} anchor
   * @returns {?Section}
   * @memberof Section
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
   * @memberof Section
   */
  search({ id, headline, anchor, ancestors, oldestCommentAnchor }, returnScore) {
    const matches = [];
    cd.sections.some((section) => {
      const doesIdMatch = section.id === id;
      const doesHeadlineMatch = section.headline === headline;
      const doesAnchorMatch = section.anchor === anchor;
      let doAncestorsMatch;
      if (ancestors) {
        const sectionAncestors = section.getAncestors().map((section) => section.headline);
        doAncestorsMatch = areObjectsEqual(sectionAncestors, ancestors);
      } else {
        doAncestorsMatch = false;
      }
      const doesOldestCommentMatch = section.oldestComment?.anchor === oldestCommentAnchor;
      const score = (
        doesHeadlineMatch * 1 +
        doAncestorsMatch * 1 +
        doesOldestCommentMatch * 1 +
        doesAnchorMatch * 0.5 +
        doesIdMatch * 0.001
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

  addSubscribeMenuItems() {
    cd.sections.forEach((section) => {
      section.addSubscribeMenuItem();
    });
  }
};
