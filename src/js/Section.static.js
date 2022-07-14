import cd from './cd';
import controller from './controller';
import {
  areObjectsEqual,
  calculateWordOverlap,
  getExtendedRect,
  getVisibilityByRects,
  spacesToUnderlines,
} from './util';

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
    cd.sections.forEach((section) => {
      /**
       * Is the section the last section on the page.
       *
       * @name isLastSection
       * @type {boolean}
       * @memberof Section
       * @instance
       */
      section.isLastSection = section.index === cd.sections.length - 1;

      section.addAddSubsectionButton();
      section.addReplyButton();
    });

    // Run this after running section.addReplyButton() because reply buttons must be in place for
    // this.
    cd.sections
      .filter((section) => section.isActionable && section.level === 2)
      .forEach((section) => {
        // Section with the last reply button
        const subsections = section.getChildren(true);
        const targetSection = subsections.length ? subsections[subsections.length - 1] : section;
        targetSection.showAddSubsectionButtonOnReplyButtonHover();
      });
  },

  /**
   * _For internal use._ Add a "Subscribe" / "Unsubscribe" button to each section's actions element.
   *
   * @memberof Section
   */
  addSubscribeButtons() {
    cd.sections.forEach((section) => {
      section.addSubscribeButton();
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

  /**
   * _For internal use._ Add the metadata and actions elements below or to the right of each section
   * heading.
   *
   * @memberof Section
   */
  addMetadataAndActions() {
    cd.sections.forEach((section) => {
      section.addMetadataAndActions();
    });
  },

  /**
   * _For internal use._ Add the new comment count to the metadata elements of the sections.
   *
   * @memberof Section
   */
  addNewCommentCountMetadata() {
    cd.sections.forEach((section) => {
      section.addNewCommentCountMetadata();
    });
  },

  /**
   * _For internal use._ Get the top offset of the first section relative to the viewport.
   *
   * @param {number} [scrollY=window.scrollY]
   * @param {number} [tocOffset]
   * @returns {number}
   * @memberof Section
   */
  getFirstSectionRelativeTopOffset(scrollY = window.scrollY, tocOffset) {
    if (scrollY <= cd.g.BODY_SCROLL_PADDING_TOP) return;

    let top;
    cd.sections.some((section) => {
      const rect = getExtendedRect(section.firstElement);

      // The third check to exclude the possibility that the first section is above the TOC, like
      // at https://commons.wikimedia.org/wiki/Project:Graphic_Lab/Illustration_workshop.
      if (getVisibilityByRects(rect) && (!tocOffset || rect.outerTop > tocOffset)) {
        top = rect.outerTop;
      }

      return top !== undefined;
    });

    return top;
  },

  /**
   * Get the section currently positioned at the top of the viewport.
   *
   * @returns {?Section}
   * @memberof Section
   */
  getCurrentSection() {
    const firstSectionTop = this.getFirstSectionRelativeTopOffset();
    return (
      firstSectionTop !== undefined &&
      firstSectionTop < cd.g.BODY_SCROLL_PADDING_TOP + 1 &&
      cd.sections
        .slice()
        .reverse()
        .find((section) => {
          const extendedRect = getExtendedRect(section.headingElement);
          return (
            getVisibilityByRects(extendedRect) &&
            extendedRect.outerTop < cd.g.BODY_SCROLL_PADDING_TOP + 1
          );
        }) ||
      null
    );
  },

  /**
   * _For internal use._ Make sections visible or invisible to improve performance if the relevant
   * setting is enabled.
   */
  updateVisibility() {
    if (!cd.sections.length) return;

    // Don't care about top scroll padding (the sticky header's height) here.
    const viewportTop = window.scrollY;

    const pageHeight = document.documentElement.scrollHeight;
    const threeScreens = window.innerHeight * 3;

    let firstSectionToHide;
    if (pageHeight - viewportTop > 20000) {
      const currentSection = this.getCurrentSection()?.getBase(true);
      firstSectionToHide = cd.sections
        .filter((section) => (
          section.level === 2 &&
          (!currentSection || section.index >= currentSection.index)
        ))
        .find((section) => {
          const rect = section.firstElement.getBoundingClientRect();
          return (
            getVisibilityByRects(rect) &&
            rect.top >= threeScreens &&

            // Is in a different 12500px block than the viewport top. (`threeScreens` is subtracted
            // from its position to reduce the frequency of CSS manipulations.)
            (
              Math.floor(viewportTop / 12500) !==
              Math.floor((viewportTop + rect.top - threeScreens) / 12500)
            )
          );
        });
    }

    cd.sections
      .filter((section) => section.level === 2)
      .forEach((section) => {
        const shouldHide = Boolean(firstSectionToHide && section.index >= firstSectionToHide.index);
        if (shouldHide === section.isHidden) return;

        if (!section.elements) {
          section.elements = controller.getRangeContents(section.firstElement, section.lastElement);
        }
        section.isHidden = shouldHide;
        section.elements.forEach((el) => {
          el.classList.toggle('cd-section-hidden', shouldHide);
        });
      });
  },
};
