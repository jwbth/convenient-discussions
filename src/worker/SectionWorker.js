import SectionSkeleton from '../shared/SectionSkeleton'

import { keepSafeKeys } from './worker'

/**
 * Section class used in the worker scope.
 *
 * @augments {SectionSkeleton<import('domhandler').Node>}
 */
export default class SectionWorker extends SectionSkeleton {
	/** @type {SectionWorker|undefined} */
	parent

	/** @type {string[]} */
	ancestors

	/** @type {string|undefined} */
	oldestCommentId

	/**
	 * Prepare sections for transferring to the main process.
	 *
	 * @param {SectionWorker[]} sections
	 */
	static tweakSections(sections) {
		sections.forEach((section) => {
			section.parent = section.getParent()
			section.ancestors = section.getAncestors().map((sect) => sect.headline)
			section.oldestCommentId = section.oldestComment?.id

			keepSafeKeys(section, [
				'cachedAncestors',
				'headingElement',
				'hElement',
				'headlineElement',
				'lastElement',
				'lastElementInFirstChunk',
				'parser',
			])
		})
	}
}
