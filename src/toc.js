/**
 * Table of contents singleton.
 *
 * @module toc
 */

import Comment from './Comment'
import LiveTimestamp from './LiveTimestamp'
import TocItem from './TocItem'
import commentManager from './commentManager'
import controller from './controller'
import cd from './loader/cd'
import sectionManager from './sectionManager'
import settings from './settings'
import CdError from './shared/CdError'
import SectionSkeleton from './shared/SectionSkeleton'
import { defined } from './shared/utils-general'
import updateChecker from './updateChecker'
import { formatDate, formatDateNative, getLinkedAnchor } from './utils-window'
import visits from './visits'

/**
 * @typedef {Pick<TocItem, 'level' | 'number' | '$element'>} TocItemShort
 */

/**
 * Table of contents class.
 */
class Toc {
	/** @type {JQuery | undefined} */
	$element

	/** @type {TocItem[] | undefined} */
	items

	/** @type {boolean | undefined} */
	floating

	/** @type {boolean} */
	canBeModified = false

	/** @type {Promise<void> | undefined} */
	visitsPromise

	/** @type {Promise<void> | undefined} */
	updateTocSectionsPromise

	/** @type {(() => void) | undefined} */
	resolveUpdateTocSectionsPromise

	/**
	 * _For internal use._ Initialize the TOC. (Executed only once.)
	 *
	 * @param {import('./Subscriptions').default} subscriptions
	 */
	init(subscriptions) {
		mw.hook('wikipage.tableOfContents.vector').add(() => {
			this.resolveUpdateTocSectionsPromise?.()
		})

		visits
			.on('process', () => {
				// If all the comments on the page are unseen, don't add them to the TOC - the user would
				// definitely prefer to read the names of the topics easily. (But still consider them new -
				// otherwise the user can be confused, especially if there are few topics on an unpopular
				// page.)
				if (
					commentManager.query((c) => c.isSeen === false || !c.date).length !==
					commentManager.getCount()
				) {
					this.addNewComments(
						Comment.groupBySection(commentManager.query((c) => c.isSeen === false)),
						controller.getBootProcess()
					)
				}
				this.addCommentCount()
			})
		subscriptions
			.on('process', this.markSubscriptions)
		controller
			.on('reboot', this.maybeHide)
		updateChecker
			.on('commentsUpdate', ({ bySection }) => {
				this.addNewComments(bySection)
			})
			.on('sectionsUpdate', this.addNewSections)
	}

	/**
	 * Hide the TOC if the relevant cookie is set. This method duplicates
	 * {@link https://phabricator.wikimedia.org/source/mediawiki/browse/master/resources/src/mediawiki.toc/toc.js the native MediaWiki function}
	 * and exists because we may need to hide the TOC earlier than the native method does it.
	 *
	 * @private
	 */
	maybeHide = () => {
		if (this.isInSidebar() || !this.isPresent()) return

		if (mw.cookie.get('hidetoc') === '1') {
			/** @type {HTMLInputElement} */ (this.$element.find('.toctogglecheckbox')[0]).checked = true
		}
	}

	/**
	 * _For internal use._ Setup the TOC data and, for sidebar TOC, update its content. (Executed at
	 * every page load.)
	 *
	 * @param {AnyByKey[]} [sections] TOC sections object.
	 * @param {boolean} [hideToc] Whether the TOC should be hidden.
	 */
	setup(sections, hideToc) {
		this.$element = this.isInSidebar() ? $('.vector-toc') : controller.$root.find('.toc')
		this.items = undefined
		this.floating = undefined
		this.visitsPromise = new Promise((resolve) => {
			visits.once('process', () => {
				resolve()
			})
		})

		if (this.isInSidebar() && sections) {
			// Update the section list of the TOC
			mw.hook('wikipage.tableOfContents').fire(hideToc ? [] : sections)

			this.updateTocSectionsPromise = new Promise((resolve) => {
				this.resolveUpdateTocSectionsPromise = resolve
			})
		}
	}

	/**
	 * Get a TOC item by ID.
	 *
	 * @param {string} id
	 * @returns {TocItem | undefined}
	 */
	getItem(id) {
		if (!this.isPresent()) return

		if (!this.items) {
			try {
				// It is executed first time before added (gray) sections are added to the TOC, so we use a
				// simple algorithm to obtain items.
				this.items = /** @type {HTMLAnchorElement[]} */ ([
					...this.$element[0].querySelectorAll('li > a[href]'),
				])
					.filter((link) => link.getAttribute('href') !== '#')
					.map((link) => new TocItem(link, this))
			} catch (error) {
				console.error("Couldn't find an element for an item of the table of contents.", error)
				this.items = []
			}
		}

		return this.items.find((item) => item.id === id)
	}

	/**
	 * Mark sections that the user is subscribed to.
	 *
	 * @private
	 */
	markSubscriptions = async () => {
		if (!this.isPresent()) return

		// Ensure the bell icons are added after the TOC is updated and the comment counts are added in
		// visits#process().
		await Promise.all([this.visitsPromise, this.updateTocSectionsPromise].filter(defined))

		sectionManager
			.query((section) => section.subscriptionState || this.isInSidebar())
			.forEach((section) => {
				section.updateTocLink()
			})
	}

	/**
	 * Add the number of comments to each section link.
	 */
	async addCommentCount() {
		// We add the comment count even if the "Modify TOC" setting is off.
		if (!this.isPresent()) return

		await this.updateTocSectionsPromise

		let usedFullForm = false
		sectionManager.getAll().forEach((section) => {
			const item = section.getTocItem()
			if (!item) return

			const count = section.comments.length
			if (!count) return

			const beforeSpan = document.createElement('span')
			beforeSpan.className = 'cd-toc-commentCount-before'

			const span = document.createElement('span')
			span.className = 'cd-toc-commentCount'

			const bdi = document.createElement('bdi')
			const unseenCount = section.newComments?.length
			if (unseenCount) {
				bdi.textContent = cd.s(
					usedFullForm ? 'toc-commentcount-new' : 'toc-commentcount-new-full',
					String(count),
					String(unseenCount)
				)
			} else {
				bdi.textContent = usedFullForm
					? String(count)
					: cd.s('toc-commentcount-full', String(count))
			}

			span.append(bdi)
			item.$text.append(beforeSpan, span)

			usedFullForm = true
		})

		if (cd.g.isDtVisualEnhancementsEnabled) {
			this.$element.find('.ext-discussiontools-init-sidebar-meta').remove()
		}
	}

	/**
	 * Handle a click on an added section link.
	 *
	 * @param {MouseEvent | KeyboardEvent} event
	 * @private
	 */
	handleSectionClick = (event) => {
		event.preventDefault()
		controller.rebootPage({
			sectionId:
				getLinkedAnchor(/** @type {HTMLAnchorElement} */ (event.currentTarget)) || undefined,
			pushState: true,
		})
	}

	/**
	 * Add a collapse/expand toggle to a 2-level section.
	 *
	 * @param {Element} ul
	 * @param {TocItemShort} upperLevelMatch
	 * @param {string[]} newSectionTocIds
	 * @private
	 */
	addToggleToSidebarToc(ul, upperLevelMatch, newSectionTocIds) {
		// Don't bother with ARIA attributes since chances that somebody will interact with
		// collapsed subsections with their help tend to zero, I believe, although this may
		// change.
		const button = document.createElement('button')
		button.className =
			'cdx-button cdx-button--weight-quiet cdx-button--icon-only vector-toc-toggle'
		button.setAttribute('ariaExpanded', 'true')
		button.setAttribute('ariaControls', ul.id)

		const span = document.createElement('span')
		span.className = 'vector-icon vector-icon--x-small mw-ui-icon-wikimedia-expand'
		button.append(span)

		upperLevelMatch.$element.append(button)

		// Expand the section.
		button.click()

		// If this section was previously added by us, the TOC will remember its state and try to
		// switch it on click, so we need to click again to get it back.
		if (newSectionTocIds.includes(upperLevelMatch.$element.attr('id') || '')) {
			button.click()
		}
	}

	/**
	 * Add a new, not yet rendered section (loaded in the background) section to the table of
	 * contents.
	 *
	 * @param {import('./updateChecker').SectionWorkerMatched} section
	 * @param {TocItemShort[]} currentTree
	 * @param {JQuery} $topUl
	 * @param {string[]} [newSectionTocIds]
	 * @private
	 */
	addNewSection(section, currentTree, $topUl, newSectionTocIds) {
		let item = /** @type {TocItemShort|undefined} */ (section.match?.getTocItem())
		const level = /** @type {number} */ (section.tocLevel)
		if (!item) {
			const currentLevelMatch = currentTree.at(level - 1)
			const upperLevelMatch = currentLevelMatch ? undefined : currentTree.at(-1)

			const li = document.createElement('li')
			li.id = `toc-${section.id}`
			const levelClass = this.isInSidebar()
				? `vector-toc-list-item vector-toc-level-${level}`
				: `toclevel-${level}`
			li.className = `${levelClass} cd-toc-addedSection`

			const a = document.createElement('a')
			a.href = `#${section.id}`
			if (this.isInSidebar()) {
				a.className = 'vector-toc-link cd-toc-link-sidebar'
			}
			a.addEventListener('click', this.handleSectionClick)

			let number
			if (currentLevelMatch) {
				number = currentLevelMatch.number
			} else if (upperLevelMatch) {
				number = upperLevelMatch.number + '.1'
			} else {
				number = '1'
			}
			const numberSpan = document.createElement('span')
			const numberClass = this.isInSidebar() ? 'vector-toc-numb' : 'tocnumber'
			numberSpan.className = `${numberClass} cd-toc-hiddenTocNumber`
			numberSpan.textContent = number
			a.append(numberSpan)

			if (this.isInSidebar()) {
				const textDiv = document.createElement('div')
				textDiv.className = 'vector-toc-text'
				textDiv.append(document.createTextNode(section.headline))
				a.append(textDiv)
				li.append(a)
			} else {
				const textSpan = document.createElement('span')
				textSpan.className = 'toctext'
				textSpan.textContent = section.headline
				a.append(textSpan)
				li.append(a)
			}

			if (currentLevelMatch) {
				currentLevelMatch.$element.after(li)
			} else if (upperLevelMatch) {
				const ul = document.createElement('ul')
				ul.id = `toc-${section.id}-sublist`
				ul.className = 'vector-toc-list'
				ul.append(li)

				if (
					this.isInSidebar() &&
					level === 2 &&
					!upperLevelMatch.$element.find('.vector-toc-toggle').length
				) {
					// Ideally, it should also be removed when an added subsection is removed, but really not
					// important.
					this.addToggleToSidebarToc(
						ul,
						upperLevelMatch,
						/** @type {string[]} */ (newSectionTocIds)
					)
				}

				upperLevelMatch.$element.append(ul)
			} else if (this.isInSidebar()) {
				$topUl.children('#toc-mw-content-text').after(li)
			} else {
				$topUl.prepend(li)
			}

			item = {
				level,
				number,
				$element: $(li),
			}
		}

		currentTree[level - 1] = item
		currentTree.splice(level)
	}

	/**
	 * Add links to new, not yet rendered sections (loaded in the background) to the table of
	 * contents.
	 *
	 * Note that this method may also add the `match` property to the section elements containing a
	 * matched {@link Section} object.
	 *
	 * @param {import('./updateChecker').SectionWorkerMatched[]} sections All sections present on the
	 *   new revision of the page.
	 * @private
	 */
	addNewSections = (sections) => {
		if (!settings.get('modifyToc') || !this.isPresent()) return

		if (!this.isInSidebar()) {
			controller.saveRelativeScrollPosition(true)
		}

		const $addedSections = this.$element.find('.cd-toc-addedSection')
		const newSectionTocIds = this.isInSidebar()
			? $addedSections
					.filter('.vector-toc-level-1')
					.get()
					.map((/** @type {HTMLElement} */ sectionElement) => sectionElement.id)
			: undefined
		$addedSections.remove()

		/*
			Note the case when the page starts with sections of levels lower than the base level, like
			this:

				=== Section 1 ===
				==== Section 2 ====
				== Section 3 ==

			In this case, the TOC will look like this:

				1 Section 1
					1.1 Section 2
				2 Section 3

			The other possible case when the level on the page is different from the level in the TOC
			is when there is a gap between the levels on the page. For example:

				== Section ==
				==== Subsection ====

			will be displayed like this in the TOC:

				1 Section
					1.1 Subsection
		 */
		sections.forEach((section) => {
			// Update `parent` from SectionWorker to SectionWorkerMatched type
			section.parent = /** @type {import('./updateChecker').SectionWorkerMatched | undefined} */ (
				SectionSkeleton.prototype.getParent.call(
					section,
					true,
					/** @type {import('./shared/SectionSkeleton').default[]} */ (
					/** @type {unknown} */ (sections)
					)
				)
			)
		})
		sections.forEach((section) => {
			section.tocLevel = section.parent
				? /** @type {number} */ (
					// eslint-disable-next-line @typescript-eslint/restrict-plus-operands
					/** @type {import('./updateChecker').SectionWorkerMatched} */ (section.parent).tocLevel
					) + 1
				: 1
		})

		/** @type {TocItemShort[]} */
		const currentTree = []
		const $topUl = this.$element.children('ul')
		sections.forEach((section) => {
			this.addNewSection(section, currentTree, $topUl, newSectionTocIds)
		})

		if (!this.isInSidebar()) {
			controller.restoreRelativeScrollPosition(true)
		}
	}

	/**
	 * Get the element to add a comment list after for a section.
	 *
	 * @param {import('./Section').default | import('./updateChecker').SectionWorkerMatched} section Section.
	 * @returns {HTMLElement | undefined}
	 * @private
	 */
	getTargetElementForSection(section) {
		// There could be a collision of hrefs between the existing section and not yet rendered
		// section, so we compose the selector carefully.
		let $target
		if ('getTocItem' in section) {
			$target = section.getTocItem()?.$link
		} else {
			/** @type {JQuery | undefined} */
			let $sectionLink
			if (section.match) {
				$sectionLink = section.match.getTocItem()?.$link
			} else {
				const id = CSS.escape(section.id)
				$sectionLink = /** @type {JQuery} */ (this.$element).find(
					`.cd-toc-addedSection a[href="#${id}"]`
				)
			}

			if ($sectionLink?.length) {
				// We need to place the not-rendered-comment list below the rendered-comment list.
				$target = $sectionLink
				const $next = $sectionLink.next('.cd-toc-newCommentList')
				if ($next.length) {
					$target = $next
				}
			}
		}

		return $target?.[0]
	}

	/**
	 * Handle a click on a comment link.
	 *
	 * @param {KeyboardEvent | MouseEvent} event
	 * @private
	 */
	handleCommentClick = (event) => {
		event.preventDefault()
		const id = getLinkedAnchor(/** @type {HTMLAnchorElement} */ (event.currentTarget))
		if (!id) {
			throw new CdError()
		}

		const comment = commentManager.getByAnyId(id)
		if (comment) {
			comment.scrollTo({
				smooth: false,
				pushState: true,
			})
		} else {
			controller.rebootPage({
				commentIds: [id],
				pushState: true,
			})
		}
	}

	/**
	 * Add a comment list (an `ul` element) to a section.
	 *
	 * @param {import('./Comment').default[] | import('./updateChecker').CommentWorkerNew[]} comments
	 *   Comment list.
	 * @param {Element} [target] Target element.
	 * @private
	 */
	addCommentList(comments, target) {
		// Should never be the case
		if (!target) return

		const ITEM_LIMIT = 3

		// jQuery is too expensive here given that very many comments may be added.
		const ul = document.createElement('ul')

		// Check for the Section type without importing Section
		ul.className = 'getParent' in comments[0] ? 'cd-toc-newCommentList' : 'cd-toc-addedCommentList'

		// Tooltip text will have items that didn't fit in the limit
		const tooltipText = comments.reduce((tooltipTextAcc, comment, i) => {
			const parent = 'getParent' in comment ? comment.getParent() : comment.parent

			// Add as item, not as tooltip text. If there are `itemLimit + 1` comments or less, show all
			// of them. If there are more, show itemLimit and "N more". (Because showing itemLimit and
			// then "1 more" is stupid.)
			const addAsItem = i < ITEM_LIMIT || comments.length === ITEM_LIMIT + 1

			/** @type {string} */
			let date
			/** @type {string} */
			let nativeDate
			if (comment.date) {
				nativeDate = formatDateNative(comment.date)
				date =
					settings.get('timestampFormat') === 'default' || !addAsItem
						? nativeDate
						: formatDate(comment.date)
			} else {
				nativeDate = date = cd.s('navpanel-newcomments-unknowndate')
			}

			const dateIfNative = settings.get('timestampFormat') === 'default' ? date : ''
			const text =
			// Names
				(
					parent?.author && comment.level > 1
						? cd.s('navpanel-newcomments-names', comment.author.getName(), parent.author.getName())
						: comment.author.getName()
				) +

				// RTL mark if needed
				(cd.g.contentDirection === 'rtl' ? '\u200F' : '') +

				cd.mws('comma-separator') +
				dateIfNative

			if (addAsItem) {
				const li = document.createElement('li')
				ul.append(li)

				const a = document.createElement('a')
				const id = /** @type {string} */ ('dtId' in comment ? comment.dtId : comment.id)
				a.href = `#${id}`
				if (this.isInSidebar()) {
					a.className = 'vector-toc-link cd-toc-link-sidebar'
				}
				a.addEventListener('click', this.handleCommentClick)

				let timestampSpan
				if (settings.get('timestampFormat') !== 'default' && comment.date) {
					timestampSpan = document.createElement('span')
					timestampSpan.textContent = date
					timestampSpan.title = /** @type {string} */ (nativeDate)
					new LiveTimestamp(timestampSpan, comment.date, false).init()
				}

				if (this.isInSidebar()) {
					const textDiv = document.createElement('div')
					textDiv.className = 'vector-toc-text cd-toc-commentLinkText-sidebar'
					textDiv.textContent = text
					if (timestampSpan) {
						textDiv.append(timestampSpan)
					}
					a.append(textDiv)
					li.append(a)
				} else {
					const bulletSpan = document.createElement('span')
					const numberClass = this.isInSidebar() ? 'vector-toc-numb' : 'tocnumber'
					bulletSpan.className = `${numberClass} cd-toc-bullet`
					bulletSpan.innerHTML = cd.sParse('bullet')
					li.append(bulletSpan)

					const textSpan = document.createElement('span')
					textSpan.className = 'toctext'
					a.textContent = text
					if (timestampSpan) {
						a.append(timestampSpan)
					}
					textSpan.append(a)
					li.append(textSpan)
				}
			} else {
				// In the tooltip, always show the date in the default format - we won't be auto-updating
				// relative dates there due to low benefit.
				tooltipTextAcc += text + (dateIfNative ? '' : nativeDate) + '\n'
			}

			return tooltipTextAcc
		}, '')

		if (comments.length > ITEM_LIMIT + 1) {
			const span = document.createElement('span')
			span.className = 'cd-toc-more'
			span.title = tooltipText.trim()
			span.textContent = cd.s('toc-more', String(comments.length - ITEM_LIMIT))

			const li = document.createElement('li')
			li.append(span)
			ul.append(li)
		}

		/** @type {HTMLElement} */ (target.parentElement).insertBefore(ul, target.nextSibling)
	}

	/**
	 * Add links to new comments (either already displayed or loaded in the background) to the table
	 * of contents.
	 *
	 * @param {import('./Comment').CommentsBySection} commentsBySection
	 * @param {import('./BootProcess').default} [bootProcess]
	 * @private
	 */
	async addNewComments(commentsBySection, bootProcess) {
		if (!settings.get('modifyToc') || !this.isPresent()) return

		await this.updateTocSectionsPromise
		this.$element.find('.cd-toc-addedCommentList').remove()
		if (!this.isInSidebar()) {
			controller.saveRelativeScrollPosition(
				Boolean(
					// When unrendered (in gray) comments are added. (Boot process is also not specified at
					// those times.)
					!bootProcess ||

					bootProcess.isFirstRun() ||

					// When the comment or section is opened by a link from the TOC
					bootProcess.passedData.commentIds ||
					bootProcess.passedData.sectionId
				)
			)
		}

		commentsBySection.forEach((comments, section) => {
			if (!section) return

			this.addCommentList(comments, this.getTargetElementForSection(section))
		})

		if (!this.isInSidebar()) {
			controller.restoreRelativeScrollPosition(true)
		}
	}

	/**
	 * Is the table of contents located in the sidebar.
	 *
	 * @returns {boolean}
	 */
	isInSidebar() {
		return cd.g.skin === 'vector-2022'
	}

	/**
	 * Is the table of contents floating (it or its parent has a `float` CSS).
	 *
	 * This should be called after the HTML content has been laid out.
	 *
	 * @returns {boolean}
	 */
	isFloating() {
		if (this.floating === undefined) {
			this.floating = Boolean(
				!this.isInSidebar() &&
				this.isPresent() &&
				this.$element.closest($(controller.getFloatingElements())).length
			)
		}

		return this.floating
	}

	/**
	 * Is the table of contents present on the page.
	 *
	 * @returns {this is { $element: JQuery<HTMLElement> }}
	 */
	isPresent() {
		return Boolean(this.$element?.length)
	}

	/**
	 * Get the bottom offset of the table of contents.
	 *
	 * @returns {number|undefined}
	 */
	getBottomOffset() {
		if (!this.isPresent()) return

		return (
		/** @type {JQuery.Coordinates} */ (this.$element.offset()).top +
			// eslint-disable-next-line @typescript-eslint/restrict-plus-operands
			/** @type {number} */ (this.$element.outerHeight())
		)
	}
}

export default new Toc()
