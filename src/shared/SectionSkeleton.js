import CommentSkeleton from './CommentSkeleton'
import TreeWalker from './TreeWalker'
import cd from './cd'
import { defined, isElement, isHeadingNode, isMetadataNode, isText } from './utils-general'

/**
 * Class containing the main properties of a section and building it from a heading (we should
 * probably extract `SectionParser` from it). It is extended by {@link Section}. This class is the
 * only one used in the worker context for sections.
 *
 * @template {AnyNode} [N=AnyNode]
 */
class SectionSkeleton {
	/**
	 * Section headline as it appears on the page.
	 *
	 * Foreign elements can get there, add the classes of these elements to
	 * {@link module:defaultConfig.excludeFromHeadlineClasses} to filter them out.
	 *
	 * @type {string}
	 */
	headline

	/**
	 * The name of the page the section is on in terms of wikitext.
	 *
	 * @type {string | undefined}
	 */
	sourcePageName

	/**
	 * Sequental number of the section at the time of the page load.
	 *
	 * @type {number | undefined}
	 */
	sectionNumber

	/**
	 * Nesting level of the heading relative to the root element.
	 *
	 * @type {number}
	 * @protected
	 */
	headingNestingLevel

	/**
	 * Last element in the section.
	 *
	 * @type {ElementFor<N>}
	 */
	lastElement

	/**
	 * Last element in the first chunk of the section, i.e. all elements up to the first subheading
	 * if it is present or just all elements if it is not.
	 *
	 * @type {ElementFor<N>}
	 */
	lastElementInFirstChunk

	/**
	 * Comments contained in the first chunk of the section, i.e. all elements up to the first
	 * subheading if it is present, or all elements if it is not.
	 *
	 * @type {import('./CommentSkeleton').default<N>[]}
	 */
	commentsInFirstChunk

	/**
	 * Oldest comment in the section.
	 *
	 * @type {import('./CommentSkeleton').default<N> | undefined}
	 */
	oldestComment

	/**
	 * Comments contained in the section.
	 *
	 * @type {import('./CommentSkeleton').default<N>[]}
	 */
	comments

	/**
	 * Create a section skeleton instance.
	 *
	 * @param {import('./Parser').default<N>} parser
	 * @param {import('./Parser').HeadingTarget<N>} heading
	 * @param {import('./Parser').Target<N>[]} targets
	 */
	constructor(parser, heading, targets) {
		this.parser = parser

		/**
		 * Heading element (`.mw-heading` or `<h1>` - `<h6>`).
		 *
		 * @type {ElementFor<N>}
		 */
		this.headingElement = heading.element

		/**
		 * @param {AnyNode} node
		 * @returns {AnyElement | null}
		 */
		const returnSelfIfHElement = (/** @type {?AnyNode} */ node) =>
			node && isHeadingNode(node, true) ? /** @type {ElementLike} */ (node) : null

		/**
		 * `<hN>` element of the section (`<h1>`-`<h6>`).
		 *
		 * @type {ElementFor<N>}
		 * @protected
		 */
		this.hElement = /** @type {ElementFor<N>} */ (
			returnSelfIfHElement(this.headingElement) ||
				returnSelfIfHElement(this.headingElement.firstElementChild) ||
				// Russian Wikivoyage and anything with .mw-h2section (not to be confused with .mw-heading2).
				// Also, a precaution in case something in MediaWiki changes.
				this.headingElement.querySelectorAll('h1, h2, h3, h4, h5, h6')[0]
		)

		/**
		 * Headline element.
		 *
		 * @type {ElementFor<N>}
		 */
		this.headlineElement = cd.g.isParsoidUsed
			? this.hElement
			: // Presence of .mw-heading doesn't guarantee we have the new HTML for headings
				// (https://www.mediawiki.org/wiki/Heading_HTML_changes). We should test for the existence of
				// .mw-headline to make sure it's not there. (Could also check that .mw-editsection follows
				// hN.)
				this.parser.context.getElementByClassName(this.hElement, 'mw-headline') || this.hElement

		/**
		 * Section id.
		 *
		 * @type {string}
		 */
		this.id = /** @type {string} */ (this.headlineElement.getAttribute('id'))

		this.parseHeadline()

		/**
		 * Section level. A level is a number representing the number of `=` characters in the section
		 * heading's code.
		 *
		 * @type {number}
		 */
		this.level = Number(
			/** @type {RegExpMatchArray} */ (this.hElement.tagName.match(/^H([1-6])$/))[1],
		)

		const editLink = [
			...// Get menu links. Use two calls because our improvised .querySelectorAll() in
			// htmlparser2Extended doesn't support composite selectors.
			(this.parser.context
				.getElementByClassName(this.headingElement, 'mw-editsection')
				?.getElementsByTagName('a') || []),
		]
			// &action=edit, ?action=edit (couldn't figure out where this comes from, but at least one
			// user has such links), &veaction=editsource. We perhaps could catch veaction=edit, but
			// there's probably no harm in that.
			.find((link) => link.getAttribute('href')?.includes('action=edit'))

		if (editLink) {
			// `href` property with the full URL is not available in the worker context.
			const href = editLink.getAttribute('href')
			if (href) {
				const editUrl = new URL(cd.g.server + href)
				const sectionParam = editUrl.searchParams.get('section')
				if (sectionParam?.startsWith('T-')) {
					this.sourcePageName = editUrl.searchParams.get('title') || undefined
					this.sectionNumber = Number((sectionParam.match(/\d+/) || [])[0])
				} else {
					this.sectionNumber = Number(sectionParam)
				}
				if (Number.isNaN(this.sectionNumber)) {
					this.sectionNumber = undefined
				}

				/**
				 * URL to edit the section.
				 *
				 * @type {string}
				 */
				this.editUrl = editUrl.href
			}
		}

		this.initContent(heading, targets)

		/**
		 * Section index. Same as the index in the array returned by
		 * {@link module:sectionManager.getAll}.
		 *
		 * @type {number}
		 */
		this.index = cd.sections.length
	}

	/**
	 * Set some properties related to the content of the section (contained elements and comments).
	 *
	 * @param {import('./Parser').HeadingTarget<N>} heading
	 * @param {import('./Parser').Target<N>[]} targets
	 * @private
	 */
	initContent(heading, targets) {
		this.headingNestingLevel = this.parser.getNestingLevel(this.headingElement)

		// Find the next heading element
		const headingIndex = targets.indexOf(heading)
		/** @type {number | undefined} */
		let nextHeadingIndex = targets.findIndex(
			(target, i) => i > headingIndex && target.type === 'heading',
		)
		let nextHeadingElement
		if (nextHeadingIndex === -1) {
			nextHeadingIndex = undefined
		} else {
			nextHeadingElement = targets[nextHeadingIndex]?.element
		}

		// Find the next heading element whose section is not a descendant of this section
		/** @type {number | undefined} */
		let nndheIndex = targets.findIndex(
			(target, i) =>
				i > headingIndex &&
				target.type === 'heading' &&
				/** @type {import('./Parser').HeadingTarget<N>} */ (target).level <= this.level,
		)
		let nextNotDescendantHeadingElement
		if (nndheIndex === -1) {
			nndheIndex = undefined
		} else {
			nextNotDescendantHeadingElement = targets[nndheIndex]?.element
		}

		/** @typedef {ElementLike} TreeWalkerAcceptedNode */
		const treeWalker = new TreeWalker(
			this.parser.context.rootElement,
			/** @type {(node: NodeLike) => node is TreeWalkerAcceptedNode} */ (node) =>
				!isMetadataNode(node) &&
				!(/** @type {ElementLike} */ (node).classList.contains('cd-section-button-container')),
			true,
		)

		this.lastElement = /** @type {ElementFor<N>} */ (
			this.getLastElement(nextNotDescendantHeadingElement, treeWalker)
		)

		this.lastElementInFirstChunk =
			nextHeadingElement === nextNotDescendantHeadingElement
				? this.lastElement
				: /** @type {ElementFor<N>} */ (this.getLastElement(nextHeadingElement, treeWalker))

		const targetsToComments = (/** @type {import('./Parser').Target<N>[]} */ targetsRange) =>
			targetsRange
				.filter((target) => target.type === 'signature')
				.map((target) => target.comment)
				.filter(defined)

		this.comments = targetsToComments(targets.slice(headingIndex, nndheIndex))
		this.commentsInFirstChunk = targetsToComments(targets.slice(headingIndex, nextHeadingIndex))
		this.commentsInFirstChunk.forEach((comment) => {
			comment.section = this
		})
		this.oldestComment = CommentSkeleton.getOldest(this.comments, true)
	}

	/**
	 * Get the last element in the section based on a following (directly or not) section's heading
	 * element.
	 *
	 * Sometimes sections are nested trickily in some kind of container elements, so a following
	 * structure may take place:
	 *
	 * ```html
	 * == Heading 1 ==
	 * <p>Paragraph 1.</p>
	 * <div>
	 *   <p>Paragraph 2.</p>
	 *   == Heading 2 ==
	 *   <p>Paragraph 3.</p>
	 * </div>
	 * <p>Paragraph 4.</p>
	 * == Heading 3 ==
	 * ```
	 *
	 * In this case, section 1 has paragraphs 1 and 2 as the first and last, and section 2 has
	 * paragraphs 3 and 4 as such. Our code must capture that.
	 *
	 * @param {ElementLike | undefined} followingHeadingElement
	 * @param {import('./TreeWalker').default<ElementLike>} treeWalker
	 * @returns {ElementLike}
	 * @private
	 */
	getLastElement(followingHeadingElement, treeWalker) {
		/** @type {ElementLike} */
		let lastElement
		if (followingHeadingElement) {
			treeWalker.currentNode = followingHeadingElement
			while (!treeWalker.previousSibling()) {
				if (!treeWalker.parentNode()) break
			}
			lastElement = treeWalker.currentNode
		} else {
			lastElement = /** @type {ElementLike} */ (this.parser.context.rootElement.lastElementChild)
		}

		// Some wrappers that include the section heading added by users
		while (
			this.parser.constructor.contains(lastElement, this.headingElement) &&
			lastElement !== this.headingElement
		) {
			lastElement = /** @type {ElementLike} */ (lastElement.lastElementChild)
		}

		if (cd.config.reflistTalkClasses.some((name) => lastElement.classList.contains(name))) {
			lastElement = /** @type {ElementLike} */ (lastElement.previousElementSibling)
		}

		return lastElement
	}

	/**
	 * _For internal use._ Parse the headline of the section and fill the
	 * {@link SectionSkeleton#headline headline} property that contains no HTML tags.
	 */
	parseHeadline() {
		const classesToFilter = [
			// Was removed in 2021, see T284921. Keep this for some time.
			'mw-headline-number',

			'mw-editsection-like',
			'ext-checkuser-tempaccount-reveal-ip-button',
			'ext-checkuser-tempaccount-reveal-ip',
			...cd.config.excludeFromHeadlineClasses,
		]

		this.headline = [...this.headlineElement.childNodes]
			.filter(
				(node) =>
					isText(node) ||
					(isElement(node) &&
						!(
							isMetadataNode(node) || classesToFilter.some((name) => node.classList.contains(name))
						)),
			)
			.map((node) => node.textContent)
			.join('')
			.trim()
	}

	/**
	 * Get the parent section of the section.
	 *
	 * @param {boolean} [ignoreFirstLevel] Don't consider sections of the first level parent
	 *   sections; stop at second level sections.
	 * @param {this[]} [sections]
	 * @returns {this | undefined}
	 */
	getParent(ignoreFirstLevel = true, sections = /** @type {this[]} */ (cd.sections)) {
		if (ignoreFirstLevel && this.level <= 2) {
			return
		}

		return sections
			.slice(0, this.index)
			.reverse()
			.find((section) => section.level < this.level)
	}

	/**
	 * Get the chain of ancestors of the section as an array, starting with the parent section.
	 *
	 * The returned value is cached, so don't change the array in-place. (That's ugly, need to check
	 * if running `.slice()` on the array slows anything down. To be clear – this method is run very
	 * frequently.)
	 *
	 * @returns {this[]}
	 */
	getAncestors() {
		if (!this.cachedAncestors) {
			/** @type {this[]} */
			this.cachedAncestors = []
			let section
			for (section = this.getParent(); section; section = section.getParent()) {
				this.cachedAncestors.push(section)
			}
		}

		return this.cachedAncestors
	}
}

// Parallel to import('../updateChecker').SectionWorkerCropped
/**
 * @typedef {Omit<RemoveMethods<SectionSkeleton>, 'parent'>} SectionBase
 */

export default SectionSkeleton
