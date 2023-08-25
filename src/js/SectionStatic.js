/**
 * Static {@link Section section} methods and properties.
 *
 * @module SectionStatic
 */

import cd from './cd';
import controller from './controller';
import settings from './settings';
import {
  areObjectsEqual,
  calculateWordOverlap,
  flat,
  generateFixedPosTimestamp,
  getExtendedRect,
  getVisibilityByRects,
  spacesToUnderlines,
} from './utils';

export default {
  /**
   * List of sections.
   *
   * @type {import('./Section').default[]}
   * @private
   */
  items: [],

  /**
   * Get the list of DiscussionTools threads that are related to subscribable (2-level) threads.
   * This is updated on page reload.
   *
   * @returns {object[]}
   */
  getDtSubscribableThreads() {
    if (!this.dtSubscribableThreads) {
      this.dtSubscribableThreads = mw.config.get('wgDiscussionToolsPageThreads')
        ?.concat(
          flat(
            mw.config.get('wgDiscussionToolsPageThreads')
              .filter((thread) => thread.headingLevel === 1)
              .map((thread) => thread.replies)
          )
        )
        .filter((thread) => thread.headingLevel === 2);
    }
    return this.dtSubscribableThreads;
  },

  /**
   * Add a section to the list.
   *
   * @param {import('./Section').default} item
   */
  add(item) {
    this.items.push(item);
  },

  /**
   * Get all sections on the page ordered the same way as in the DOM.
   *
   * @returns {import('./Section').default[]}
   */
  getAll() {
    return this.items;
  },

  /**
   * Get a section by index.
   *
   * @param {number} index Use a negative index to count from the end.
   * @returns {?import('./Section').default}
   */
  getByIndex(index) {
    if (index < 0) {
      index = this.items.length + index;
    }
    return this.items[index] || null;
  },

  /**
   * Get the number of sections.
   *
   * @returns {number}
   */
  getCount() {
    return this.items.length;
  },

  /**
   * Reset the section list.
   */
  reset() {
    this.items = [];
    delete this.dtSubscribableThreads;
  },

  /**
   * Get a section by ID.
   *
   * @param {string} id
   * @returns {?import('./Section').default}
   */
  getById(id) {
    return id && this.items.find((section) => section.id === id) || null;
  },

  /**
   * Get sections by headline.
   *
   * @param {string} headline
   * @returns {import('./Section').default[]}
   */
  getByHeadline(headline) {
    return this.items.filter((section) => section.headline === headline);
  },

  /**
   * Get sections by {@link Section#subscribeId subscribe ID}.
   *
   * @param {string} subscribeId
   * @returns {import('./Section').default[]}
   */
  getBySubscribeId(subscribeId) {
    return this.items.filter((section) => section.subscribeId === subscribeId);
  },

  /**
   * Find a section with a similar name on the page (when the section with the exact name was not
   * found).
   *
   * @param {string} sectionName
   * @returns {?import('./Section').default}
   */
  findByHeadlineParts(sectionName) {
    const matches = this.items
      .map((section) => ({
        section,
        score: calculateWordOverlap(sectionName, section.headline, true),
      }))
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
   * @returns {?import('./Section').default}
   */
  search({ index, headline, id, ancestors, oldestCommentId }, returnScore) {
    const matches = [];
    this.items.some((section) => {
      const doesIndexMatch = section.index === index;
      const doesHeadlineMatch = section.headline === headline;
      const doesIdMatch = section.id === id;
      const doAncestorsMatch = ancestors ?
        areObjectsEqual(section.getAncestors().map((section) => section.headline), ancestors) :
        false;
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
   */
  adjust() {
    this.items.forEach((section) => {
      /**
       * Is the section the last section on the page.
       *
       * @name isLastSection
       * @type {boolean}
       * @memberof Section
       * @instance
       */
      section.isLastSection = section.index === this.items.length - 1;

      section.addAddSubsectionButton();
      section.addReplyButton();
    });

    // Run this after running `section.addReplyButton()` for each section because reply buttons must
    // be in place for this.
    this.items
      .filter((section) => section.addSubsectionButton)
      .forEach((section) => {
        // Section with the last reply button
        (section.getChildren(true).slice(-1)[0] || section)
          .showAddSubsectionButtonOnReplyButtonHover(section);
      });
  },

  /**
   * _For internal use._ Add a "Subscribe" / "Unsubscribe" button to each section's actions element.
   */
  addSubscribeButtons() {
    controller.saveRelativeScrollPosition();
    this.items.forEach((section) => {
      section.addSubscribeButton();
    });
    controller.restoreRelativeScrollPosition();
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
    return `h-${spacesToUnderlines(author)}-${generateFixedPosTimestamp(date, true)}`;
  },

  /**
   * _For internal use._ Add the metadata and actions elements below or to the right of each section
   * heading.
   */
  addMetadataAndActions() {
    this.items.forEach((section) => {
      section.addMetadataAndActions();
    });
  },

  /**
   * _For internal use._ Update the new comments data for sections and render the updates.
   */
  updateNewCommentsData() {
    this.items.forEach((section) => {
      section.updateNewCommentsData();
    });
  },

  /**
   * _For internal use._ Get the top offset of the first section relative to the viewport.
   *
   * @param {number} [scrollY=window.scrollY]
   * @param {number} [tocOffset]
   * @returns {number}
   */
  getFirstSectionRelativeTopOffset(scrollY = window.scrollY, tocOffset) {
    if (scrollY <= cd.g.bodyScrollPaddingTop) return;

    let top;
    this.items.some((section) => {
      const rect = getExtendedRect(section.headingElement);

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
   * @returns {?import('./Section').default}
   */
  getCurrentSection() {
    const firstSectionTop = this.getFirstSectionRelativeTopOffset();
    return (
      firstSectionTop !== undefined &&
      firstSectionTop < cd.g.bodyScrollPaddingTop + 1 &&
      this.items
        .slice()
        .reverse()
        .find((section) => {
          const extendedRect = getExtendedRect(section.headingElement);
          return (
            getVisibilityByRects(extendedRect) &&
            extendedRect.outerTop < cd.g.bodyScrollPaddingTop + 1
          );
        }) ||
      null
    );
  },

  /**
   * _For internal use._ Make sections visible or invisible to improve performance if the relevant
   * setting is enabled.
   */
  maybeUpdateVisibility() {
    if (!settings.get('improvePerformance') || !this.items.length || !controller.isLongPage()) {
      return;
    }

    // Don't care about top scroll padding (the sticky header's height) here.
    const viewportTop = window.scrollY;

    const pageHeight = document.documentElement.scrollHeight;
    const threeScreens = window.innerHeight * 3;

    let firstSectionToHide;
    if (pageHeight - viewportTop > 20000) {
      const currentSection = this.getCurrentSection();
      firstSectionToHide = this.items
        .filter((section) => !currentSection || section.index > currentSection.index)
        .find((section) => {
          const rect = section.headingElement.getBoundingClientRect();
          let blockSize = 10000;
          return (
            getVisibilityByRects(rect) &&
            rect.top >= threeScreens &&

            // Is in a different `blockSize`-pixel block than the viewport top. (`threeScreens` is
            // subtracted from its position to reduce the frequency of CSS manipulations, so in
            // practice the blocks are positioned somewhat like this: 0 - 12500, 12500 - 22500,
            // 22500 - 32500, etc.)
            (
              Math.floor(viewportTop / blockSize) !==
              Math.floor((viewportTop + rect.top - threeScreens) / blockSize)
            )
          );
        });
    }

    const subsectionsToHide = [];
    if (firstSectionToHide) {
      this.items
        .slice(firstSectionToHide.index)
        .some((section) => {
          if (section.level === 2) {
            return true;
          }
          subsectionsToHide.push(section);
          return false;
        });
    }
    this.items
      .filter((section) => (
        section.level === 2 ||
        section.isHidden ||
        subsectionsToHide.includes(section)
      ))
      .forEach((section) => {
        section.updateVisibility(
          !(firstSectionToHide && section.index >= firstSectionToHide.index)
        );
      });
  },

  /**
   * _For internal use._ Unhide the sections.
   *
   * This is called when the "Try to improve performance" setting is enabled and the window is
   * blurred.
   */
  maybeUnhideAll() {
    if (!controller.isLongPage()) return;

    this.items.forEach((section) => {
      section.updateVisibility(true);
    });
  },
};
