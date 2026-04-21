import controller from './controller'
import cd from './loader/cd'
import pageRegistry from './pageRegistry'
import {
	definedAndNotNull,
	ensureArray,
	mergeMaps,
	areObjectsEqual,
	calculateWordOverlap,
	generateFixedPosTimestamp,
	spacesToUnderlines,
} from './shared/utils-general'
import { getExtendedRect, getVisibilityByRects } from './utils-window'
import visits from './visits'

/**
 * @typedef {{
 *   section: import('./Section').default;
 *   score: number;
 * }} SectionMatch
 */

/**
 * @typedef {object} ArchiveConfig
 * @property {string | undefined} path
 * @property {boolean} isSorted
 */

// TODO: Make it extend a generic registry.

/**
 * Singleton storing data about sections on the page and managing them.
 */
export class SectionManager {
	/**
	 * List of sections.
	 *
	 * @type {import('./Section').default[]}
	 * @private
	 */
	items = []

	/**
	 * Cached archive configuration.
	 *
	 * @type {Promise<ArchiveConfig | undefined> | undefined}
	 * @private
	 */
	archiveConfigPromise

	/**
	 * _For internal use._ Initialize the registry.
	 *
	 * @param {import('./Subscriptions').default} subscriptions
	 */
	init(subscriptions) {
		controller.on('viewportMove', this.maybeUpdateVisibility)
		subscriptions.on('process', this.addSubscribeButtons)
		visits.on('process', this.updateNewCommentsData)
	}

	/**
	 * _For internal use._ Perform some section-related operations when the registry is filled, in
	 * addition to those performed when each section is added to the registry. Set the
	 * {@link Section#isLastSection isLastSection} property, adding buttons, and binding events.
	 */
	setup() {
		this.items.forEach((section) => {
			section.isLastSection = section.index === this.items.length - 1

			// This should be above adding reply buttons so that the order is right.
			section.maybeAddAddSubsectionButtons()

			section.maybeAddReplyButton()
		})

		// Run this after running section.addReplyButton() for each section because reply buttons must
		// be in place for this.
		this.items.forEach((section) => {
			section.showAddSubsectionButtonsOnReplyButtonHover()
		})

		if (cd.settings.get('improvePerformance')) {
			// Unhide when the user opens a search box to allow searching the full page.
			// CAUTION! You may run into these events never triggered if debugging in Chrome with
			// Rendering (or Elements > Styles → :hov) → Emulate a focused page enabled.
			$(window)
				.off('focus.cd', this.maybeUpdateVisibility)
				.off('blur.cd', this.maybeUnhideAll)
				.on('focus.cd', this.maybeUpdateVisibility)
				.on('blur.cd', this.maybeUnhideAll)
		}
	}

	/**
	 * Add a section to the list.
	 *
	 * @param {import('./Section').default} item
	 */
	add(item) {
		this.items.push(item)
	}

	/**
	 * Get all sections on the page ordered the same way as in the DOM.
	 *
	 * @returns {import('./Section').default[]}
	 */
	getAll() {
		return this.items
	}

	/**
	 * Get a section by index.
	 *
	 * @param {number} index Use a negative index to count from the end.
	 * @returns {?import('./Section').default}
	 */
	getByIndex(index) {
		if (index < 0) {
			index = this.items.length + index
		}

		return this.items[index] || null
	}

	/**
	 * Get the number of sections.
	 *
	 * @returns {number}
	 */
	getCount() {
		return this.items.length
	}

	/**
	 * Get sections by a condition.
	 *
	 * @param {(section: import('./Section').default) => boolean} condition
	 * @returns {import('./Section').default[]}
	 */
	query(condition) {
		return this.items.filter(condition)
	}

	/**
	 * Reset the section list.
	 */
	reset() {
		this.items = []
	}

	/**
	 * Get a section by ID.
	 *
	 * @param {string} id
	 * @returns {?import('./Section').default}
	 */
	getById(id) {
		return (id && this.items.find((section) => section.id === id)) || null
	}

	/**
	 * Get sections by headline.
	 *
	 * @param {string} headline
	 * @returns {import('./Section').default[]}
	 */
	getByHeadline(headline) {
		return this.items.filter((section) => section.headline === headline)
	}

	/**
	 * Get sections by {@link Section#subscribeId subscribe ID}.
	 *
	 * @param {string} subscribeId
	 * @returns {import('./Section').default[]}
	 */
	getBySubscribeId(subscribeId) {
		return this.items.filter((section) => section.subscribeId === subscribeId)
	}

	/**
	 * Find a section with a similar name on the page (when the section with the exact name was not
	 * found).
	 *
	 * @param {string} sectionName
	 * @returns {?import('./Section').default}
	 */
	findByHeadlineParts(sectionName) {
		return (
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			this.items
				.map((section) => ({
					section,
					score: calculateWordOverlap(sectionName, section.headline),
				}))
				.filter((match) => match.score > 0.66)
				.sort((m1, m2) => m2.score - m1.score)[0]?.section || null
		)
	}

	/**
	 * Search for a section on the page based on several parameters: index, headline, id, ancestor
	 * sections' headlines, oldest comment data. At least two parameters must match, not counting
	 * index and id. The section that matches best is returned.
	 *
	 * @param {object} options
	 * @param {number} options.index
	 * @param {string} options.headline
	 * @param {string} options.id
	 * @param {string[]} [options.ancestors]
	 * @param {?string} [options.oldestCommentId]
	 * @returns {?SectionMatch}
	 */
	search({ index, headline, id, ancestors, oldestCommentId }) {
		/** @type {SectionMatch[]} */
		const matches = []
		this.items.some((section) => {
			// eslint-disable-next-line no-one-time-vars/no-one-time-vars
			const doesIndexMatch = section.index === index
			// eslint-disable-next-line no-one-time-vars/no-one-time-vars
			const doesHeadlineMatch = section.headline === headline
			// eslint-disable-next-line no-one-time-vars/no-one-time-vars
			const doesIdMatch = section.id === id
			// eslint-disable-next-line no-one-time-vars/no-one-time-vars
			const doAncestorsMatch = ancestors
				? areObjectsEqual(
						section.getAncestors().map((sect) => sect.headline),
						ancestors,
					)
				: false
			// eslint-disable-next-line no-one-time-vars/no-one-time-vars
			const doesOldestCommentMatch = section.oldestComment?.id === oldestCommentId

			const score =
				Number(doesHeadlineMatch) * 1 +
				Number(doAncestorsMatch) * 1 +
				Number(doesOldestCommentMatch) * 1 +
				Number(doesIdMatch) * 0.5 +
				Number(doesIndexMatch) * 0.001
			if (score >= 2) {
				matches.push({ section, score })
			}

			// 3.5 score means it's the best match for sure. Two sections can't have coinciding IDs, so
			// there can't be two sections with the 3.5 score. (We do this because there can be very many
			// sections on the page, so searching for a match for every section, e.g. in updateChecker.js,
			// can be expensive.)
			return score >= 3.5
		})

		return (
			matches.reduce(
				(best, match) => (!best || match.score > best.score ? match : best),
				/** @type {SectionMatch|undefined} */ (undefined),
			) || null
		)
	}

	/**
	 * Add a "Subscribe" / "Unsubscribe" button to each section's actions element.
	 *
	 * @private
	 */
	addSubscribeButtons = () => {
		if (!cd.user.isRegistered()) return

		controller.saveRelativeScrollPosition()
		this.items.forEach((section) => {
			section.addSubscribeButton()
		})
		controller.restoreRelativeScrollPosition()
	}

	/**
	 * Generate an DiscussionTools ID for a section.
	 *
	 * @param {string} author Author name.
	 * @param {Date} date Oldest comment date.
	 * @returns {string}
	 */
	generateDtSubscriptionId(author, date) {
		// FIXME: don't modify the parameter
		date.setSeconds(0)

		return `h-${spacesToUnderlines(author)}-${generateFixedPosTimestamp(date, '00')}`
	}

	/**
	 * _For internal use._ Add the metadata and actions elements below or to the right of each section
	 * heading.
	 */
	addMetadataAndActions() {
		this.items.forEach((section) => {
			section.addMetadataAndActions()
		})
	}

	/**
	 * _For internal use._ Update the new comments data for sections and render the updates.
	 */
	updateNewCommentsData = () => {
		this.items.forEach((section) => {
			section.updateNewCommentsData()
		})
	}

	/**
	 * _For internal use._ Get the top offset of the first section relative to the viewport.
	 *
	 * @param {number} [scrollY]
	 * @param {number} [tocOffset]
	 * @returns {number | undefined}
	 */
	getFirstSectionRelativeTopOffset(scrollY = window.scrollY, tocOffset) {
		if (scrollY <= controller.getBodyScrollPaddingTop()) return

		return this.items.reduce((result, section) => {
			if (result !== undefined) {
				return result
			}

			const rect = getExtendedRect(section.headingElement)

			// The third check to exclude the possibility that the first section is above the TOC, like
			// at https://commons.wikimedia.org/wiki/Project:Graphic_Lab/Illustration_workshop.
			return getVisibilityByRects(rect) && (!tocOffset || rect.outerTop > tocOffset)
				? rect.outerTop
				: undefined
		}, /** @type {number | undefined} */ (undefined))
	}

	/**
	 * Get the section currently positioned at the top of the viewport.
	 *
	 * @returns {?import('./Section').default}
	 */
	getCurrentSection() {
		const firstSectionTop = this.getFirstSectionRelativeTopOffset()

		return (
			(firstSectionTop !== undefined &&
				firstSectionTop < controller.getBodyScrollPaddingTop() + 1 &&
				this.items
					.slice()
					.reverse()
					.find((section) => {
						const extendedRect = getExtendedRect(section.headingElement)

						return (
							getVisibilityByRects(extendedRect) &&
							extendedRect.outerTop < controller.getBodyScrollPaddingTop() + 1
						)
					})) ||
			null
		)
	}

	/**
	 * Make sections visible or invisible to improve performance if the corresponding setting is
	 * enabled.
	 *
	 * @private
	 */
	maybeUpdateVisibility = () => {
		if (
			!cd.settings.get('improvePerformance') ||
			!this.items.length ||
			!controller.isLongPage() ||
			// When the document has no focus, all sections are visible (see .maybeUnhideAll()).
			!document.hasFocus()
		) {
			return
		}

		// Don't care about top scroll padding (the sticky header's height) here.
		const viewportTop = window.scrollY

		const threeScreens = window.innerHeight * 3

		/** @type {import('./Section').default | undefined} */
		let firstSectionToHide
		if (document.documentElement.scrollHeight - viewportTop > 20_000) {
			const currentSection = this.getCurrentSection()
			firstSectionToHide = this.items
				.filter((section) => !currentSection || section.index > currentSection.index)
				.find((section) => {
					const rect = section.headingElement.getBoundingClientRect()
					const blockSize = 10_000

					return (
						getVisibilityByRects(rect) &&
						rect.top >= threeScreens &&
						// Is in a different `blockSize`-pixel block than the viewport top. (threeScreens is
						// subtracted from its position to reduce the frequency of CSS manipulations, so in
						// practice the blocks are positioned somewhat like this: 0 - 12500, 12500 - 22500,
						// 22500 - 32500, etc.)
						Math.floor(viewportTop / blockSize) !==
							Math.floor((viewportTop + rect.top - threeScreens) / blockSize)
					)
				})
		}

		/** @type {import('./Section').default[]} */
		const subsectionsToHide = []
		if (firstSectionToHide) {
			this.items.slice(firstSectionToHide.index).some((section) => {
				if (section.level === 2) {
					return true
				}

				subsectionsToHide.push(section)

				return false
			})
		}
		this.items
			.filter(
				(section) => section.level === 2 || section.isHidden || subsectionsToHide.includes(section),
			)
			.forEach((section) => {
				section.updateVisibility(!(firstSectionToHide && section.index >= firstSectionToHide.index))
			})
	}

	/**
	 * _For internal use._ Unhide the sections.
	 *
	 * This is called when the "Try to improve performance" setting is enabled and the window is
	 * blurred.
	 */
	maybeUnhideAll = () => {
		if (!controller.isLongPage()) return

		this.items.forEach((section) => {
			section.updateVisibility(true)
		})
	}

	/**
	 * Load archive configuration for sections. This is cached so multiple sections can request it
	 * without making duplicate network requests.
	 *
	 * @param {import('./Section').default} section
	 * @returns {Promise<ArchiveConfig | undefined>}
	 */
	loadArchiveConfig(section) {
		if (!this.archiveConfigPromise) {
			this.archiveConfigPromise = this.fetchArchiveConfig(section)
		}

		return this.archiveConfigPromise
	}

	/**
	 * Fetch archive configuration from the server.
	 *
	 * @param {import('./Section').default} section
	 * @returns {Promise<ArchiveConfig | undefined>}
	 * @private
	 */
	async fetchArchiveConfig(section) {
		const sourcePage = section.getSourcePage()
		if (!sourcePage.canHaveArchives()) {
			return
		}

		const archivingConfigPages = [
			sourcePage,
			...(cd.config.archivingConfig.subpages || [])
				.map((subpage) => pageRegistry.get(sourcePage.name + '/' + subpage))
				.filter(definedAndNotNull),
		]

		const templatePages = (cd.config.archivingConfig.templates || [])
			.map((template) => pageRegistry.get(template.name))
			.filter(definedAndNotNull)

		try {
			const transclusions = await Promise.all(
				archivingConfigPages.map((page) => page.getFirstTemplateTransclusion(templatePages)),
			)

			return this.guessArchiveConfig(section, mergeMaps(transclusions))
		} catch {
			return
		}
	}

	/**
	 * Provided parameters of archiving templates present on the page, guess the archive path and
	 * other configuration for the section.
	 *
	 * @param {import('./Section').default} section
	 * @param {Map<import('./Page').default, StringsByKey>} templateToParameters
	 * @returns {ArchiveConfig | undefined}
	 */
	guessArchiveConfig(section, templateToParameters) {
		return Array.from(templateToParameters).reduce((config, [page, parameters]) => {
			if (config) {
				return config
			}

			const templateConfig = /** @type {import('../config/default').ArchivingTemplateEntry} */ (
				(cd.config.archivingConfig.templates || []).find(
					(template) => pageRegistry.get(template.name) === page,
				)
			)

			/**
			 * Find a parameter mentioned in the template config in the list of actual template
			 * parameters, do the regexp transformations, and return the result.
			 *
			 * @param {keyof typeof templateConfig} prop
			 * @returns {string | undefined}
			 */
			const findPresentParamAndReplaceAll = (prop) => {
				const replaceAll = (/** @type {string} */ value) =>
					Array.from(templateConfig.replacements || []).reduce(
						(v, [regexp, replacer]) =>
							v.replace(regexp, (...match) =>
								replacer(
									{
										counter:
											(templateConfig.counterParam && parameters[templateConfig.counterParam]) ||
											null,
										date: section.oldestComment?.date || null,
									},

									// Basically get all string matches. Use a complex expression in case JavaScript
									// evolves in the future to add more arguments.
									match.slice(
										0,
										match.findIndex((el) => typeof el !== 'string'),
									),
								),
							),
						value,
					)

				const presentPathParam = ensureArray(templateConfig[prop]).find(
					(pathParam) => pathParam && parameters[pathParam],
				)

				return presentPathParam ? replaceAll(parameters[presentPathParam]) : undefined
			}

			let path = findPresentParamAndReplaceAll('pathParam')
			if (!path) {
				path = findPresentParamAndReplaceAll('relativePathParam')
				if (path) {
					const [absolutePairKey, absolutePairValue] = templateConfig.absolutePathPair || []
					const absoluteParamValue = absolutePairKey && parameters[absolutePairKey]
					if (
						!(
							absoluteParamValue &&
							absolutePairValue &&
							absoluteParamValue.match(absolutePairValue)
						)
					) {
						path = cd.page.name + '/' + path
					}
				}
			}

			return {
				path,
				isSorted: cd.config.archivingConfig.areArchivesSorted || false,
			}
		}, /** @type {ArchiveConfig | undefined} */ (undefined))
	}
}

export default new SectionManager()
