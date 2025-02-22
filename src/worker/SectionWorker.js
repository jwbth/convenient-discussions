import SectionSkeleton from '../SectionSkeleton';

import { keepSafeValues } from './worker';

/**
 * Section class used in the worker scope.
 */
export default class SectionWorker extends SectionSkeleton {
  /** @type {SectionWorker|undefined} */
  parent;

  /** @type {string[]} */
  ancestors;

  /** @type {string|undefined} */
  oldestCommentId;

  /**
   * Prepare sections for transferring to the main process.
   *
   * @param {SectionWorker[]} sections
   */
  static tweakSections(sections) {
    sections.forEach((section) => {
      section.parent = /** @type {SectionWorker} */ (section.getParent());
      section.ancestors = section.getAncestors().map((section) => section.headline);
      section.oldestCommentId = section.oldestComment?.id;

      keepSafeValues(section, [
        'cachedAncestors',
        'headingElement',
        'hElement',
        'headlineElement',
        'lastElement',
        'lastElementInFirstChunk',
        'parser',
      ]);
    });
  }
}
