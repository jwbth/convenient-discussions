/**
 * Singleton storing data about sections on the page and managing them.
 *
 * @module sectionRegistry
 */

import cd from './cd';
import controller from './controller';
import settings from './settings';
import { areObjectsEqual, calculateWordOverlap, generateFixedPosTimestamp, spacesToUnderlines } from './utils-general';
import { getExtendedRect, getVisibilityByRects } from './utils-window';
import visits from './visits';

// TODO: make into a class extending a generic registry.

export default {
  /**
   * List of sections.
   *
   * @type {import('./Section').default[]}
   * @private
   */
  items: [],

  /**
   * _For internal use._ Initialize the registry.
   *
   * @param {import('./Subscriptions').default} subscriptions
   */
  init(subscriptions) {
    this.improvePerformance = settings.get('improvePerformance');

    controller
      .on('scroll', this.maybeUpdateVisibility.bind(this));
    subscriptions
      .on('process', this.addSubscribeButtons.bind(this));
    visits
      .on('process', this.updateNewCommentsData.bind(this));

    if (this.improvePerformance) {
      // Unhide when the user opens a search box to allow searching the full page.
      $(window)
        .on('focus', this.maybeUpdateVisibility.bind(this))
        .on('blur', this.maybeUnhideAll.bind(this));
    }
  },

  /**
   * _For internal use._ Perform some section-related operations when the registry is filled, in
   * addition to those performed when each section is added to the registry. Set the
   * {@link Section#isLastSection isLastSection} property, adding buttons, and binding events.
   */
  setup() {
    this.items.forEach((section) => {
      section.isLastSection = section.index === this.items.length - 1;

      // This should be above adding reply buttons so that the order is right.
      section.maybeAddAddSubsectionButtons();

      section.maybeAddReplyButton();
    });

    // Run this after running section.addReplyButton() for each section because reply buttons must
    // be in place for this.
    this.items.forEach((section) => {
      section.showAddSubsectionButtonsOnReplyButtonHover();
    });
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
   * Get sections by a condition.
   *
   * @param {(section: import('./Section').default) => boolean} condition
   * @returns {import('./Section').default[]}
   */
  query(condition) {
    return this.items.filter(condition);
  },

  /**
   * Reset the section list.
   */
  reset() {
    this.items = [];
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
    return (
      this.items
        .map((section) => ({
          section,
          score: calculateWordOverlap(sectionName, section.headline),
        }))
        .filter((match) => match.score > 0.66)
        .sort((m1, m2) => m2.score - m1.score)[0]
        ?.section ||
      null
    );
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
   * @param {?string} [options.oldestCommentId]
   * @returns {?{
   *   section: import('./Section').default;
   *   score: number;
   * }}
   */
  search({ index, headline, id, ancestors, oldestCommentId }) {
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
        Number(doesHeadlineMatch) * 1 +
        Number(doAncestorsMatch) * 1 +
        Number(doesOldestCommentMatch) * 1 +
        Number(doesIdMatch) * 0.5 +
        Number(doesIndexMatch) * 0.001
      );
      if (score >= 2) {
        matches.push({ section, score });
      }

      // 3.5 score means it's the best match for sure. Two sections can't have coinciding IDs, so
      // there can't be two sections with the 3.5 score. (We do this because there can be very many
      // sections on the page, so searching for a match for every section, e.g. in updateChecker.js,
      // can be expensive.)
      return score >= 3.5;
    });

    let bestMatch;
    matches.forEach((match) => {
      if (!bestMatch || match.score > bestMatch.score) {
        bestMatch = match;
      }
    });

    return bestMatch || null;
  },

  /**
   * Add a "Subscribe" / "Unsubscribe" button to each section's actions element.
   *
   * @private
   */
  addSubscribeButtons() {
    if (!cd.user.isRegistered()) return;

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
   * @param {string} timestamp Oldest comment date.
   * @returns {string}
   */
  generateDtSubscriptionId(author, timestamp) {
    const date = new Date(timestamp);
    date.setSeconds(0);
    return `h-${spacesToUnderlines(author)}-${generateFixedPosTimestamp(date, '00')}`;
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
   * @returns {?number}
   */
  getFirstSectionRelativeTopOffset(scrollY = window.scrollY, tocOffset) {
    if (scrollY <= cd.g.bodyScrollPaddingTop) {
      return null;
    }

    return this.items.reduce((result, section) => {
      if (result !== null) {
        return result;
      }

      const rect = getExtendedRect(section.headingElement);

      // The third check to exclude the possibility that the first section is above the TOC, like
      // at https://commons.wikimedia.org/wiki/Project:Graphic_Lab/Illustration_workshop.
      return getVisibilityByRects(rect) && (!tocOffset || rect.outerTop > tocOffset) ?
        rect.outerTop :
        null;
    }, /** @type {?number} */ (null));
  },

  /**
   * Get the section currently positioned at the top of the viewport.
   *
   * @returns {?import('./Section').default}
   */
  getCurrentSection() {
    const firstSectionTop = this.getFirstSectionRelativeTopOffset();

    return (
      firstSectionTop !== null &&
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
   * Make sections visible or invisible to improve performance if the corresponding setting is
   * enabled.
   *
   * @private
   */
  maybeUpdateVisibility() {
    if (
      !this.improvePerformance ||
      !this.items.length ||
      !controller.isLongPage() ||

      // When the document has no focus, all sections are visible (see .maybeUnhideAll()).
      !document.hasFocus()
    ) {
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

            // Is in a different `blockSize`-pixel block than the viewport top. (threeScreens is
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
