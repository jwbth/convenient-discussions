import Button from './Button'
import EventEmitter from './EventEmitter'
import PrototypeRegistry from './PrototypeRegistry'
import StorageItemWithKeysAndSaveTime from './StorageItemWithKeysAndSaveTime'
import commentManager from './commentManager'
import controller from './controller'
import cd from './loader/cd'
import CdError from './shared/CdError'
import ElementsTreeWalker from './shared/ElementsTreeWalker'
import {
	isHeadingNode,
	removeFromArrayIfPresent,
	subtractDaysFromNow,
	unique,
} from './shared/utils-general'
import updateChecker from './updateChecker'
import { loadUserGenders } from './utils-api'
import { isCmdModifierPressed } from './utils-keyboard'
import { mixInObject } from './utils-oojs-class'
import {
	getCommonGender,
	getExtendedRect,
	getRangeContents,
	getVisibilityByRects,
	isVisible,
} from './utils-window'

/**
 * @typedef {object} EventMap
 * @property {[]} init
 * @property {[]} toggle
 */

/**
 * A comment thread object.
 */
class Thread extends mixInObject(
	// eslint-disable-next-line jsdoc/require-jsdoc
	class {},
	/** @type {typeof EventEmitter<EventMap>} */ (EventEmitter),
) {
	/**
	 * Click area of the thread line.
	 *
	 * @type {HTMLElement | undefined}
	 * @private
	 */
	clickArea

	/**
	 * Thread line.
	 *
	 * @type {HTMLElement | undefined}
	 * @private
	 */
	line

	/**
	 * Note in place of a collapsed thread that has a button to expand the thread.
	 *
	 * @private
	 * @type {HTMLElement | undefined}
	 */
	expandNote

	/**
	 * `<ul>` element that contains the expand note.
	 *
	 * @private
	 * @type {HTMLUListElement | undefined}
	 */
	expandNoteContainer

	/**
	 * Note in place of a collapsed thread that has a button to expand the thread.
	 *
	 * @type {JQuery | undefined}
	 */
	$expandNote

	/**
	 * Top element of the thread.
	 *
	 * @type {HTMLElement}
	 * @private
	 */
	startElement

	/**
	 * Bottom element of the thread (logically, not visually).
	 *
	 * @type {HTMLElement}
	 * @private
	 */
	endElement

	/**
	 * Bottom element of the thread _visually_, not logically (differs from
	 * {@link Thread#endElement} if there are `{{outdent}}` templates in the thread).
	 *
	 * @type {HTMLElement}
	 * @private
	 */
	visualEndElement

	/**
	 * Fallback visual end element. Used when `Thread#visualEndElement` may be hidden without
	 * collapsing the thread. That usually means `Thread#visualEndElement` has the
	 * `cd-connectToPreviousItem` class.
	 *
	 * @type {HTMLElement}
	 * @private
	 */
	visualEndElementFallback

	/**
	 * Nodes that are collapsed. These can change, at least due to comment forms showing up.
	 *
	 * @type {HTMLElement[] | undefined}
	 */
	collapsedRange

	/**
	 * Whether the thread should have been autocollapsed, but haven't been because the user
	 * expanded it manually in previous sessions.
	 *
	 * @type {boolean}
	 * @private
	 */
	wasManuallyExpanded = false

	/**
	 * Should the thread be automatically collapsed on page load if taking only comment
	 * level into account and not remembering the user's previous actions.
	 *
	 * @type {boolean}
	 * @private
	 */
	isAutocollapseTarget = false

	/**
	 * Create a comment thread object.
	 *
	 * @param {import('./Comment').default} rootComment Root comment of the thread.
	 */
	constructor(rootComment) {
		super()

		/**
		 * Root comment of the thread.
		 *
		 * @type {import('./Comment').default}
		 */
		this.rootComment = rootComment

		/**
		 * List of comments in the thread (logically, not visually).
		 *
		 * @type {import('./Comment').default[]}
		 * @private
		 */
		this.comments = [rootComment, ...rootComment.getChildren(true)]

		/**
		 * Last comment of the thread (logically, not visually).
		 *
		 * @type {import('./Comment').default}
		 */
		this.lastComment = this.comments[this.comments.length - 1]

		/**
		 * Number of comments in the thread.
		 *
		 * @type {number}
		 * @private
		 */
		this.commentCount = this.lastComment.index - this.rootComment.index + 1

		/**
		 * Whether the thread has outdented comments.
		 *
		 * @type {boolean}
		 * @private
		 */
		this.hasOutdents =
			controller.areThereOutdents() && this.comments.slice(1).some((comment) => comment.isOutdented)

		/**
		 * Last comment of the thread _visually_, not logically (differs from {@link Thread#lastComment}
		 * if there are `{{outdent}}` templates in the thread).
		 *
		 * @type {import('./Comment').default}
		 * @private
		 */
		this.visualLastComment = this.hasOutdents
			? rootComment.getChildren(true, true).at(-1) || rootComment
			: this.lastComment

		/**
		 * Fallback visual last comment. Used when `Thread#visualEndElement` may be hidden without
		 * collapsing the thread. That usually means `Thread#visualEndElement` has the
		 * `cd-connectToPreviousItem` class.
		 *
		 * @type {import('./Comment').default}
		 * @private
		 */
		this.visualLastCommentFallback = this.hasOutdents
			? // `|| rootComment` part for a very weird case when an outdented comment is at the same level
				// as its parent.
				rootComment.getChildren(true, true, false).at(-1) || rootComment
			: this.lastComment

		this.initBoundingElements()

		/**
		 * Is the thread collapsed.
		 *
		 * @type {boolean}
		 */
		this.isCollapsed = false

		this.navMode = false
		this.blockClickEvent = false
	}

	/**
	 * Handle the beforematch event to expand collapsed threads when text is found.
	 *
	 * @param {Event} event
	 * @private
	 */
	handleBeforeMatch = (event) => {
		// Check if the event target is within this thread's collapsed range
		if (this.isCollapsed && this.collapsedRange) {
			const target = /** @type {HTMLElement} */ (event.target)
			const isInCollapsedRange = this.collapsedRange.some(
				(element) => element === target || element.contains(target),
			)

			if (isInCollapsedRange) {
				// Expand the thread to reveal the found text
				this.expand()
			}
		}
	}

	/**
	 * Set the `startElement`, `endElement`, `visualEndElement`, and `visualEndElementFallback`
	 * properties.
	 *
	 * @throws {CdError}
	 * @private
	 */
	initBoundingElements() {
		let startElement
		let endElement
		let visualEndElement
		let visualEndElementFallback
		const firstNotHeadingElement = /** @type {HTMLElement} */ (
			this.rootComment.elements.find((el) => !isHeadingNode(el))
		)
		const highlightables = this.lastComment.highlightables
		const visualHighlightables = this.visualLastComment.highlightables
		const visualHighlightablesFallback = this.visualLastCommentFallback.highlightables
		const nextForeignElement = commentManager.getByIndex(this.lastComment.index + 1)?.elements[0]

		if (this.rootComment.level === 0) {
			startElement = firstNotHeadingElement
			visualEndElement = Thread.findEndElementOfZeroLevelThread(
				startElement,
				visualHighlightables,
				nextForeignElement,
			)
			visualEndElementFallback =
				this.visualLastComment === this.visualLastCommentFallback
					? visualEndElement
					: Thread.findEndElementOfZeroLevelThread(
							startElement,
							visualHighlightablesFallback,
							nextForeignElement,
						)
			endElement = this.hasOutdents
				? Thread.findEndElementOfZeroLevelThread(startElement, highlightables, nextForeignElement)
				: visualEndElement
		} else {
			// We could improve the positioning of the thread line to exclude the vertical space next to
			// an outdent template placed at a non-0 level by taking the first element as the start
			// element. But then we need to fix areTopAndBottomAligned() (calculate the last comment's
			// margins instead of using the first comment's) and utilsWindow.getRangeContents() (come up
			// with a treatment for the situation when the end element includes the start element).
			startElement =
				Thread.findItemElement(
					firstNotHeadingElement,
					this.rootComment.level,
					nextForeignElement,
				) || firstNotHeadingElement
			const lastHighlightable = highlightables[highlightables.length - 1]

			const lastOutdentedComment =
				this.hasOutdents &&
				commentManager
					.getAll()
					.slice(0, this.lastComment.index + 1)
					.reverse()
					.find((comment) => comment.isOutdented)
			if (lastOutdentedComment) {
				endElement =
					lastOutdentedComment.level === 0
						? Thread.findEndElementOfZeroLevelThread(
								startElement,
								highlightables,
								nextForeignElement,
							)
						: Thread.findItemElement(
								lastHighlightable,
								Math.min(lastOutdentedComment.level, this.rootComment.level),
								nextForeignElement,
							)

				visualEndElement = Thread.findItemElement(
					visualHighlightables[visualHighlightables.length - 1],
					this.rootComment.level,
					nextForeignElement,
				)
				visualEndElementFallback =
					this.visualLastComment === this.visualLastCommentFallback
						? visualEndElement
						: Thread.findItemElement(
								visualHighlightablesFallback[visualHighlightablesFallback.length - 1],
								this.rootComment.level,
								nextForeignElement,
							)
			} else {
				endElement =
					Thread.findItemElement(lastHighlightable, this.rootComment.level, nextForeignElement) ||
					lastHighlightable

				visualEndElementFallback = visualEndElement = endElement
			}
		}

		if (!endElement || !visualEndElement || !visualEndElementFallback) {
			throw new CdError()
		}

		this.startElement = startElement
		this.endElement = endElement
		this.visualEndElement = visualEndElement
		this.visualEndElementFallback = visualEndElementFallback
	}

	/**
	 * Handle the `mouseenter` event on the click area.
	 *
	 * @param {MouseEvent} [_event]
	 * @param {boolean} [force]
	 * @private
	 */
	handleClickAreaHover = (_event, force = false) => {
		if (Thread.navMode && !force) return

		const highlight = () => {
			this.clickArea?.classList.add('cd-thread-clickArea-hovered')
		}

		if (force) {
			highlight()
		} else {
			this.highlightTimeout = setTimeout(highlight, 75)
		}
	}

	/**
	 * Handle the `mouseleave` event on the click area.
	 *
	 * @private
	 */
	handleClickAreaUnhover = () => {
		clearTimeout(this.highlightTimeout)
		this.clickArea?.classList.remove('cd-thread-clickArea-hovered')
	}

	/**
	 * Handle the `mousedown` event on the click area.
	 *
	 * @param {MouseEvent} event
	 * @private
	 */
	handleClickAreaMouseDown = (event) => {
		if (this.navMode) return

		// Middle button
		if (event.button === 1) {
			event.preventDefault()

			// Prevent hitting document's mousedown.cd listener we add in .enterNavMode().
			event.stopPropagation()

			this.enterNavMode(event.clientX, event.clientY)
		}

		// We also need the left button for touchpads, but need to wait until the user moves the
		// mouse.
		if (event.button === 0) {
			event.preventDefault()
			this.navFromY = event.clientY
			this.navFromX = event.clientX

			$(document).one('mouseup.cd', (ev) => {
				ev.preventDefault()
				delete this.navFromY
				delete this.navFromX
				$(document).off('mousemove.cd', this.handleDocumentMouseMove)
			})

			$(document).on('mousemove.cd', this.handleDocumentMouseMove)
		}
	}

	/**
	 * Handle the `mouseup` event on the click area.
	 *
	 * @param {MouseEvent} event
	 * @private
	 */
	handleClickAreaMouseUp = (event) => {
		if (this.navMode && event.button === 0) {
			// `mouseup` event comes before `click`, so we need to block collapsing the thread is the user
			// clicked the left button to navigate threads.
			this.blockClickEvent = true
		}

		// Middle or left button.
		if (event.button === 1 || event.button === 0) {
			this.handleClickAreaHover(undefined, true)
		}

		// Middle button
		if (event.button === 1 && this.navMode && !this.hasMouseMoved(event)) {
			this.rootComment.scrollTo({ alignment: 'top' })
		}
	}

	/**
	 * Has the mouse moved enough to consider it a navigation gesture and not a click with an
	 * insignificant mouse movement between pressing and releasing a button.
	 *
	 * @param {MouseEvent | JQuery.MouseMoveEvent} event
	 * @returns {boolean}
	 */
	hasMouseMoved(event) {
		return (
			Math.abs(event.clientX - /** @type {number} */ (this.navFromX)) >= 5 ||
			Math.abs(event.clientY - /** @type {number} */ (this.navFromY)) >= 5
		)
	}

	/**
	 * Enter the navigation mode.
	 *
	 * @param {number} fromX
	 * @param {number} fromY
	 * @param {boolean} grab Grab mode - reverse up and down (on touchpads).
	 * @private
	 */
	enterNavMode(fromX, fromY, grab = false) {
		this.handleClickAreaUnhover()
		Thread.navMode = this.navMode = true
		this.navFromY = fromY
		this.navFromX = fromX
		this.navGrab = grab

		delete this.navScrolledTo
		this.navDeltaForDelta = 0

		/** @type {number} */
		this.navCurrentThreadEscapeDirection = 0

		$(document)
			.on('mousemove.cd', this.handleDocumentMouseMove)
			.one('mouseup.cd mousedown.cd', this.quitNavMode)
		$(window).one('blur.cd', this.quitNavMode)
		$(document.body).addClass('cd-thread-navMode-updown')
	}

	/**
	 * Handle the `mousemove` event when the navigation mode is active.
	 *
	 * @param {JQuery.MouseMoveEvent} event
	 * @private
	 */
	handleDocumentMouseMove = (event) => {
		if (!this.navMode) {
			// This implies `this.navFromX !== undefined`; .navFromX is set in
			// .handleClickAreaMouseDown().

			if (this.hasMouseMoved(event)) {
				$(document).off('mousemove.cd', this.handleDocumentMouseMove)
				this.enterNavMode(
					/** @type {number} */ (this.navFromX),
					/** @type {number} */ (this.navFromY),
					true,
				)
			}

			return
		}

		const target = this.getNavTarget(event.clientY - /** @type {number} */ (this.navFromY))
		if (target && this.navScrolledTo !== target) {
			target.scrollTo({
				alignment: target.logicalLevel === this.rootComment.logicalLevel ? 'top' : 'bottom',
			})

			/** @type {import('./Comment').default} */
			this.navScrolledTo = target
		}
	}

	/**
	 * Update the document cursor based on its position relative to the initial position in navigation
	 * mode.
	 *
	 * @param {number} direction `-1`, `0`, or `1`.
	 * @private
	 */
	updateCursor(direction) {
		$(document.body)
			.toggleClass('cd-thread-navMode-up', direction === -1)
			.toggleClass('cd-thread-navMode-updown', direction === 0)
			.toggleClass('cd-thread-navMode-down', direction === 1)
	}

	/**
	 * Given the cursor position relative to the initial position, return the target comment to
	 * navigate to. Also update the cursor look.
	 *
	 * @param {number} delta
	 * @returns {import('./Comment').default | undefined}
	 * @private
	 */
	getNavTarget(delta) {
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const stepSize = 80
		const clearanceSize = 15

		if (this.navGrab) {
			delta *= -1
		}

		/*
			After a button is pressed, the mouse should leave the initial range to navigate to a comment.
			If clearanceSize is 15, it's -15...15. Once it is left, if stepSize is 100, the ranges of
			position deltas for scroll steps ("windows") become (by setting this.navDeltaForDelta to 15 or
			-15):

			* if scrolled up: -225...-115 (previous thread), -115...-15 (current thread), -15...85 (next
				thread / end of current thread);
			* if scrolled down: -85...15 (previous thread), 15...115 (current thread), 115...225 (next
				thread / end of current thread).

			This way the windows are even and the user experience is smooth. Also, once the target comment
			is one outside of the thread we started with, we stop scrolling to the end of the current
			thread and start switching between root comments of threads (unless it's the last thread in
			the sequence). This is to satisfy two usages: navigating to the start/end of the current
			thread, and navigating between threads. Compromises like this are often not good, but I'm not
			currently sure whether we should keep only one usage and which one.
		 */

		if (!this.navCurrentThreadEscapeDirection && -clearanceSize < delta && delta < clearanceSize) {
			this.updateCursor(0)

			return
		}

		const adjustedDelta = delta - /** @type {number} */ (this.navDeltaForDelta)
		const direction = Math.sign(adjustedDelta)

		// Shift windows (see above: "Initially, ..."). 0.5 so that adjustedDelta is never 0, thus "in
		// between" threads.
		this.navDeltaForDelta ||= direction * (clearanceSize - 0.5)

		const absoluteSteps = Math.abs(adjustedDelta / stepSize)
		if (!this.navCurrentThreadEscapeDirection && absoluteSteps < 1) {
			if (adjustedDelta < 0) {
				this.updateCursor(-1)

				return this.rootComment
			}

			this.updateCursor(1)

			return this.lastComment
		}

		const steps =
			direction *
			Math[
				// eslint-disable-next-line @typescript-eslint/no-unsafe-unary-minus
				direction === -(/** @type {number} */ (this.navCurrentThreadEscapeDirection))
					? 'ceil'
					: 'floor'
			](absoluteSteps)
		const comments = commentManager.getAll()
		let target = this.rootComment
		for (
			let i = this.rootComment.index + direction, step = 0;
			i >= 0 && i < comments.length && step !== steps;
			i += direction
		) {
			const comment = comments[i]
			if (
				// We need to check the logical level too, because there can be comments with no parents on
				// logical levels other than 0.
				this.rootComment.logicalLevel === comment.logicalLevel &&
				this.rootComment.getParent() === comment.getParent() &&
				(comment.logicalLevel === 0 ||
					this.rootComment.section?.getBase() === comment.section?.getBase())
			) {
				target = comment
				step += direction
			} else if (steps > 0 && comment === target.thread?.lastComment) {
				// Use the last comment of the last sibling thread as a fallback when scrolling down
				target = comment
			}
		}

		this.updateCursor(Math.sign(steps))

		if (!this.navCurrentThreadEscapeDirection && target !== this.rootComment) {
			this.navCurrentThreadEscapeDirection = Math.sign(steps)
		}

		return target
	}

	/**
	 * Quit navigation mode and remove its traces.
	 *
	 * @private
	 */
	quitNavMode = () => {
		Thread.navMode = this.navMode = false
		delete this.navFromY
		delete this.navFromX
		$(document)
			.off('mousemove.cd', this.handleDocumentMouseMove)
			.off('mouseup.cd mousedown.cd', this.quitNavMode)
		$(document.body).removeClass(
			'cd-thread-navMode-updown cd-thread-navMode-up cd-thread-navMode-down',
		)
	}

	/**
	 * Handle the `click` event on the click area.
	 *
	 * @param {MouseEvent} event
	 * @private
	 */
	handleClickAreaClick = (event) => {
		if (this.blockClickEvent) {
			this.blockClickEvent = false

			return
		}

		;[...new Map([['a', 'b']])].sort()

		if (
			!(
				/** @type {HTMLElement} */ (this.clickArea).classList.contains(
					'cd-thread-clickArea-hovered',
				)
			)
		)
			return

		this.onToggleClick(event)
	}

	/**
	 * Create a thread line with a click area around.
	 *
	 * @private
	 */
	createLine() {
		this.clickArea = Thread.prototypes.get('clickArea')

		this.clickArea.title = cd.s('thread-tooltip', cd.g.cmdModifier)

		// Add some debouncing so that the user is not annoyed by the cursor changing its form when
		// moving across thread lines.
		this.clickArea.addEventListener('mouseenter', this.handleClickAreaHover)
		this.clickArea.addEventListener('mouseleave', this.handleClickAreaUnhover)

		this.clickArea.addEventListener('click', this.handleClickAreaClick)
		this.clickArea.addEventListener('mousedown', this.handleClickAreaMouseDown)
		this.clickArea.addEventListener('mouseup', this.handleClickAreaMouseUp)

		this.line = /** @type {HTMLElement} */ (this.clickArea.firstChild)

		if (this.endElement !== this.visualEndElement) {
			let areOutdentedCommentsShown = false
			for (let i = this.rootComment.index; i <= this.lastComment.index; i++) {
				const comment = /** @type {import('./Comment').default} */ (commentManager.getByIndex(i))
				if (comment.isOutdented) {
					areOutdentedCommentsShown = true
				}
				if (comment.thread?.isCollapsed) {
					i = comment.thread.lastComment.index
					continue
				}
			}
			if (areOutdentedCommentsShown) {
				this.line.classList.add('cd-thread-line-extended')
			}
		}
	}

	/**
	 * Get the end element of the thread, revising it based on
	 * {@link Comment#subitemList comment subitems}.
	 *
	 * @param {boolean} [visual] Use the visual thread end.
	 * @returns {HTMLElement | undefined} Logically, should never return `undefined`, unless something extraordinary
	 *   happens that makes the return value of `Thread.findItemElement()` `undefined`.
	 * @private
	 */
	getAdjustedEndElement(visual = false) {
		/*
			In a structure like this:

				Comment
					Reply
						Comment form 1
						Reply
							Reply
								Comment form 2
							New comments note 1
						New comments note 2

			- we need to calculate the end element accurately. In this case, it is "New comments note 2",
			despite the fact that it is not a subitem of the last comment. (Subitems of 0-level comments
			are handled by a different mechanism, see `Thread.findEndElement()`.)
		*/
		let lastComment
		let endElement
		if (visual) {
			lastComment = this.visualLastComment
			endElement = this.visualEndElement
			if (
				endElement.hidden &&
				endElement.previousElementSibling?.classList.contains('cd-thread-expandNote')
			) {
				endElement = /** @type {HTMLElement} */ (endElement.previousElementSibling)
			}
			if (!isVisible(endElement)) {
				endElement = this.visualEndElementFallback

				if (!isVisible(endElement) && this.rootComment.editForm) {
					endElement = this.rootComment.editForm.getOutermostElement()
				}
			}
		} else {
			lastComment = this.lastComment
			endElement = this.endElement
		}

		const $lastSubitem =
			((this.rootComment.level >= 1 ||
				// Catch special cases when a section has no "Reply in section" and "There are new comments
				// in this thread" button or the thread isn't the last thread starting with a 0-level
				// comment in the section.
				!endElement.classList.contains('cd-section-button-container')) &&
				(this.rootComment.subitemList.get('newCommentsNote') ||
					(this.rootComment === lastComment && this.rootComment.subitemList.get('replyForm')))) ||
			undefined

		return $lastSubitem?.is(':visible')
			? Thread.findItemElement($lastSubitem[0], this.rootComment.level)
			: endElement
	}

	/**
	 * Get the top element of the thread or its replacement.
	 *
	 * @returns {HTMLElement}
	 * @private
	 */
	getAdjustedStartElement() {
		if (this.isCollapsed) {
			return /** @type {HTMLElement} */ (this.expandNote)
		}

		if (this.startElement.hidden && this.rootComment.editForm) {
			return this.rootComment.editForm.getOutermostElement()
		}

		return this.startElement
	}

	/**
	 * Get a list of users in the thread.
	 *
	 * @returns {import('./User').default[]}
	 * @private
	 */
	getUsers() {
		return [this.rootComment, ...this.rootComment.getChildren(true)]
			.map((comment) => comment.author)
			.filter(unique)
	}

	/**
	 * Add an expand note when collapsing a thread.
	 *
	 * @param {Promise.<void>} [loadUserGendersPromise]
	 * @private
	 */
	addExpandNote(loadUserGendersPromise) {
		const element = Thread.prototypes.get('expandButton')
		const button = new Button({
			tooltip: cd.s('thread-expand-tooltip', cd.g.cmdModifier),
			action: this.onToggleClick,
			element,
			buttonElement: /** @type {HTMLElement} */ (element.firstChild),
			labelElement: /** @type {HTMLElement} */ (element.querySelector('.oo-ui-labelElement-label')),
		})
		const usersInThread = this.getUsers()
		const userList = usersInThread.map((author) => author.getName()).join(cd.mws('comma-separator'))
		const setLabel = (/** @type {boolean} */ genderless) => {
			button.setLabel(
				cd.s(
					genderless ? 'thread-expand-label-genderless' : 'thread-expand-label',
					String(this.commentCount),
					String(usersInThread.length),
					userList,
					getCommonGender(usersInThread),
				),
			)
			button.element.classList.remove('cd-thread-button-invisible')
		}
		if (cd.g.genderAffectsUserString) {
			;(loadUserGendersPromise || loadUserGenders(usersInThread)).then(
				() => {
					setLabel(false)
				},
				() => {
					// Couldn't get the gender, use the genderless version.
					setLabel(true)
				},
			)
		} else {
			setLabel(false)
		}

		const firstElement = /** @type {HTMLElement[]} */ (this.collapsedRange)[0]
		const expandNote = document.createElement(
			['LI', 'DD'].includes(firstElement.tagName) ? firstElement.tagName : 'DIV',
		)
		expandNote.className = 'cd-thread-button-container cd-thread-expandNote'
		if (firstElement.classList.contains('cd-connectToPreviousItem')) {
			expandNote.className += ' cd-connectToPreviousItem'
		}
		expandNote.append(button.element)
		const parentElement = /** @type {HTMLElement} */ (firstElement.parentElement)
		if (parentElement.tagName === 'OL' && this.rootComment.mhContainerListType !== 'ol') {
			const container = document.createElement('ul')
			container.className = 'cd-commentLevel'
			container.append(expandNote)
			container.before(parentElement)
			this.expandNoteContainer = container
		} else {
			firstElement.before(expandNote)
		}

		this.expandNote = expandNote
		this.$expandNote = $(expandNote)
	}

	/**
	 * Handle clicking the expand note.
	 *
	 * @param {MouseEvent | KeyboardEvent} event
	 * @private
	 */
	onToggleClick = (event) => {
		if (isCmdModifierPressed(event)) {
			this.toggleAllOflevel()
		} else if (event.altKey) {
			this.toggleWithSiblings(true)
		} else {
			this.toggle()
		}
	}

	/**
	 * Expand or collapse all threads on the page. On expand, scroll to the root comment of this
	 * thread.
	 */
	toggleAllOflevel() {
		if (this.isCollapsed) {
			commentManager.expandAllThreadsOfLevel(this.rootComment.level)
			this.comments[0].scrollTo()
		} else {
			commentManager.collapseAllThreadsOfLevel(this.rootComment.level)
			Thread.emit('toggle')
		}
	}

	/**
	 * Expand the thread if it's collapsed and collapse if it's expanded, together with its sibling
	 * threads.
	 *
	 * @param {boolean} [clickedThread] Clicked the thread rather than a parent comment's
	 *   button.
	 */
	toggleWithSiblings(clickedThread = false) {
		const wasCollapsed = clickedThread
			? this.isCollapsed
			: Boolean(this.rootComment.getParent()?.areChildThreadsCollapsed())
		this.rootComment.getSiblingsAndSelf().forEach((sibling) => {
			sibling.thread?.toggle(wasCollapsed, undefined, true)
		})
		Thread.emit('toggle')
		this.rootComment.getParent()?.updateToggleChildThreadsButton()
		if (clickedThread && !wasCollapsed) {
			const expandNoteTyped = /** @type {JQuery} */ (this.$expandNote)
			expandNoteTyped.cdScrollIntoView()
		}
	}

	/**
	 * Expand the thread if it's collapsed and collapse if it's expanded.
	 *
	 * @param {boolean} [expand]
	 * @param {boolean} [auto]
	 * @param {boolean} [isBatchOperation]
	 * @private
	 */
	toggle(expand, auto, isBatchOperation) {
		if (expand || (expand === undefined && this.isCollapsed)) {
			this.expand(auto, isBatchOperation)
		} else {
			this.collapse(auto, isBatchOperation)
		}
	}

	/**
	 * Collapse the thread.
	 *
	 * @param {boolean} [auto] Automatic collapse - don't scroll anywhere and don't save
	 *   collapsed threads.
	 * @param {boolean} [isBatchOperation] Is this called as part of some batch operation (so, no
	 *   scrolling or updating the parent comment's "Toggle child threads" button look).
	 * @param {Promise.<void>} [loadUserGendersPromise]
	 */
	collapse(auto = false, isBatchOperation = auto, loadUserGendersPromise = undefined) {
		if (this.isCollapsed) return

		this.collapsedRange = getRangeContents(
			this.getAdjustedStartElement(),
			this.getAdjustedEndElement() || null,
			controller.rootElement,
		)
		if (!this.collapsedRange) return

		this.collapsedRange.forEach((element) => {
			this.hideElement(element)
		})
		this.updateEndOfCollapsedRange(controller.getClosedDiscussions())

		this.isCollapsed = true

		for (let i = this.rootComment.index; i <= this.lastComment.index; i++) {
			i =
				/** @type {import('./Comment').default} */ (commentManager.getByIndex(i)).collapse(this) ??
				i
		}

		this.addExpandNote(loadUserGendersPromise)

		if (!isBatchOperation) {
			const expandNoteTyped = /** @type {JQuery} */ (this.$expandNote)
			expandNoteTyped.cdScrollIntoView()
			this.rootComment.getParent()?.updateToggleChildThreadsButton()
		}

		if (this.rootComment.isOpeningSection()) {
			const editOpeningCommentItem = /** @type {OO.ui.MenuOptionWidget | undefined} */ (
				/** @type {import('./Section').default} */ (this.rootComment.section).actions.moreMenuSelect
					?.getMenu()
					.findItemFromData('editOpeningComment')
			)
			editOpeningCommentItem?.setDisabled(true)
		}

		if (this.endElement !== this.visualEndElement) {
			for (
				let /** @type {import('./Comment').default | undefined} */ c = this.rootComment;
				c;
				c = c.getParent(true)
			) {
				const thread = c.thread
				if (thread && thread.endElement !== thread.visualEndElement) {
					thread.line?.classList.remove('cd-thread-line-extended')
				}
			}
		}

		if (!auto) {
			Thread.saveCollapsedThreads()
		}
		if (!isBatchOperation) {
			Thread.emit('toggle')
		}
	}

	/**
	 * Expand the thread.
	 *
	 * @param {boolean} [auto] Automatic expand - don't save collapsed threads.
	 * @param {boolean} [isBatchOperation] Is this called as part of some batch operation (so, no
	 *   scrolling or updating the parent comment's "Toggle child threads" button look).
	 */
	expand(auto = false, isBatchOperation = auto) {
		if (!this.isCollapsed) return

		const collapsedRangeTyped = /** @type {HTMLElement[]} */ (this.collapsedRange)
		collapsedRangeTyped.forEach((element) => {
			this.maybeUnhideElement(element)
		})

		const expandNoteTyped = /** @type {HTMLElement} */ (this.expandNote)
		expandNoteTyped.remove()
		this.expandNote = undefined
		this.$expandNote = undefined
		this.expandNoteContainer?.remove()
		this.expandNoteContainer = undefined

		if (this.rootComment.isOpeningSection()) {
			const editOpeningCommentItem = /** @type {OO.ui.MenuOptionWidget | undefined} */ (
				this.rootComment.section.actions.moreMenuSelect
					?.getMenu()
					.findItemFromData('editOpeningComment')
			)
			editOpeningCommentItem?.setDisabled(false)
		}

		this.isCollapsed = false
		let areOutdentedCommentsShown = false
		for (let i = this.rootComment.index; i <= this.lastComment.index; i++) {
			const comment = /** @type {import('./Comment').default} */ (commentManager.getByIndex(i))
			i = comment.expand() ?? i
			if (comment.isOutdented) {
				areOutdentedCommentsShown = true
			}
		}

		if (!isBatchOperation) {
			this.rootComment.getParent()?.updateToggleChildThreadsButton()
		}

		if (this.endElement !== this.visualEndElement && areOutdentedCommentsShown) {
			for (
				let /** @type {import('./Comment').default | undefined} */ c = this.rootComment;
				c;
				c = c.getParent()
			) {
				const thread = c.thread
				if (thread && thread.endElement !== thread.visualEndElement) {
					thread.line?.classList.add('cd-thread-line-extended')
				}
			}
		}

		if (!auto) {
			Thread.saveCollapsedThreads()
		}
		if (!isBatchOperation) {
			Thread.emit('toggle')
		}
	}

	/**
	 * Hide an element when collapsing a thread.
	 *
	 * @param {HTMLElement} element
	 * @private
	 */
	hideElement(element) {
		element.classList.add('cd-hiddenUntilFound')

		// Use hidden="until-found" instead of .cd-hidden for better browser search support. If
		// unsupported, this would gracefully degrade to simply hiding the element.
		element.setAttribute('hidden', 'until-found')

		element.addEventListener('beforematch', this.handleBeforeMatch)

		// An element can be in more than one collapsed range. So, we need to show the element when
		// expanding a range only if no active collapsed ranges are left.
		const $el = $(element)
		const roots = $el.data('cd-collapsed-thread-root-comments') || []
		roots.push(this.rootComment)
		$el.data('cd-collapsed-thread-root-comments', roots)
	}

	/**
	 * Unhide (if appropriate) an element when expanding a thread.
	 *
	 * @param {HTMLElement} element
	 * @private
	 */
	maybeUnhideElement(element) {
		const $element = $(element)
		const roots = $element.data('cd-collapsed-thread-root-comments') || []
		removeFromArrayIfPresent(roots, this.rootComment)
		$element.data('cd-collapsed-thread-root-comments', roots)
		if (!roots.length && !$element.data('cd-comment-form')) {
			element.classList.remove('cd-hiddenUntilFound')
			element.removeAttribute('hidden')
			element.removeEventListener('beforematch', this.handleBeforeMatch)
		}
	}

	/**
	 * Update the collapsed range, taking into account closed discussions. (We can't do it before,
	 * because we need the elements to be hidden and rendered to access the innerText property with
	 * the new value).
	 *
	 * @param {HTMLElement[]} closedDiscussions
	 */
	updateEndOfCollapsedRange(closedDiscussions) {
		const collapsedRange = /** @type {HTMLElement[]} */ (this.collapsedRange)
		const end = collapsedRange[collapsedRange.length - 1]

		// Include a closed discussion template if the entirety of its contents is included but not the
		// start.
		const discussion = closedDiscussions.find((el) => el.contains(end))

		/** @type {(el: HTMLElement | undefined, child: HTMLElement | undefined) => boolean} */
		const isFinalChild = (parent, child) =>
			Boolean(
				parent &&
					child &&
					(parent.lastElementChild === child ||
						(parent.lastElementChild === child.nextElementSibling &&
							/** @type {HTMLElement} */ (child.nextElementSibling).classList.contains(
								'mw-notalk',
							))),
			)
		/** @type {(el: HTMLElement | undefined) => HTMLElement | undefined} */
		const getParentIfItsFinalChild = (el) =>
			el &&
			isFinalChild(
				/** @type {HTMLElement | undefined} */ (el.parentNode?.parentNode),
				/** @type {HTMLElement | undefined} */ (el.parentNode),
			)
				? /** @type {HTMLElement} */ (el.parentNode)
				: undefined
		/** @type {(ancestor: HTMLElement, descendant: HTMLElement | undefined, maxDepth: number) => boolean} */
		const isFinalDescendant = (ancestor, descendant, maxDepth) =>
			maxDepth > 0 &&
			(isFinalChild(ancestor, descendant) ||
				isFinalDescendant(ancestor, getParentIfItsFinalChild(descendant), maxDepth - 1))

		if (
			discussion &&
			!discussion.contains(collapsedRange[0]) &&
			// Catch cases like the closed discussion template at the end of this thread:
			// https://ru.wikipedia.org/wiki/Служебная:GoToComment/c-Stjn-20241201145700-Oleg_Yunakov-20241201143800
			// Caution: innerText causes a reflow. We do it because this part of code is rarely reached.
			(isFinalDescendant(discussion, end, 3) || !discussion.innerText)
		) {
			this.maybeUnhideElement(end)
			collapsedRange.splice(-1, 1, discussion)
			this.hideElement(discussion)
		}
	}

	/**
	 * @typedef {object} ClickAreaOffset
	 * @property {number} top
	 * @property {number} left
	 * @property {number} height
	 */

	/**
	 * Calculate the offset of the thread line.
	 *
	 * @param {object} options
	 * @param {HTMLElement[]} options.elementsToAdd
	 * @param {Thread[]} options.threadsToUpdate
	 * @param {number} options.scrollX
	 * @param {number} options.scrollY
	 * @param {import('./utils-window').ExtendedDOMRect[]} options.floatingRects
	 * @returns {boolean}
	 * @private
	 */
	updateLine({ elementsToAdd, threadsToUpdate, scrollX, scrollY, floatingRects }) {
		try {
			const comment = this.rootComment

			if (comment.isCollapsed && !this.isCollapsed) {
				throw new CdError()
			}

			const needCalculateMargins =
				comment.level === 0 ||
				comment.containerListType === 'ol' ||
				// Occurs when part of a comment that is not in the thread is next to the start element, for
				// example
				// https://ru.wikipedia.org/wiki/Project:Запросы_к_администраторам/Архив/2021/04#202104081533_Macuser
				// - the next comment is not in the thread.
				this.startElement.tagName === 'DIV'

			const elTop =
				this.isCollapsed || !needCalculateMargins ? this.getAdjustedStartElement() : undefined
			const elBottom = this.isCollapsed ? elTop : this.getAdjustedEndElement(true)

			let offsetTop
			if (elTop) {
				offsetTop = elTop.getBoundingClientRect()
			} else {
				offsetTop = comment.manageOffset({ floatingRects })
				if (offsetTop) {
					offsetTop.top -= scrollY
					offsetTop.bottom -= scrollY
					offsetTop.left -= scrollX
					offsetTop.right -= scrollX
				}
			}

			if (
				!offsetTop ||
				(elTop ? !isVisible(elTop) : !getVisibilityByRects(/** @type {DOMRect} */ (offsetTop))) ||
				!elBottom ||
				!isVisible(elBottom)
			) {
				throw new CdError()
			}

			const offsetBottom = elBottom.getBoundingClientRect()
			const commentMargins = needCalculateMargins ? comment.getMargins() : undefined
			const dir = comment.getDirection()
			const left = this.getThreadLineLeft(offsetTop, commentMargins, dir, scrollX)

			// FIXME: We use the first comment part's margins for the bottom rectangle which can lead to
			// errors (need to check).
			const bottomLeft = this.getThreadLineLeft(offsetBottom, commentMargins, dir, scrollX)

			// Are top and bottom aligned?
			if (dir === 'ltr' ? bottomLeft < left : bottomLeft > left) {
				throw new CdError()
			}

			const top = scrollY + offsetTop.top
			const height = offsetBottom.bottom - (top - scrollY)

			// Find the top comment that has its offset changed and stop at it.
			if (
				this.clickAreaOffset &&
				top === this.clickAreaOffset.top &&
				left === this.clickAreaOffset.left &&
				height === this.clickAreaOffset.height
			) {
				// Opened/closed "Reply in section" comment form will change a 0-level thread line height,
				// so we may go a long way until we finally arrive at a 0-level comment (or a comment
				// without a parent).
				return !comment.getParent()
			}

			/** @type {ClickAreaOffset} */
			// eslint-disable-next-line object-shorthand
			this.clickAreaOffset = { top, left, height }

			if (!this.line) {
				this.createLine()
			}

			threadsToUpdate.push(this)
			const clickArea = /** @type {HTMLElement} */ (this.clickArea)
			if (!clickArea.isConnected) {
				elementsToAdd.push(clickArea)
			}
		} catch {
			this.removeLine()
		}

		return false
	}

	/**
	 * Get the left offset of the thread line.
	 *
	 * @param {{ left: number, right: number }} offset
	 * @param {import('./Comment').CommentMargins | undefined} commentMargins
	 * @param {'rtl' | 'ltr'} dir
	 * @param {number} scrollX
	 * @returns {number}
	 * @private
	 */
	getThreadLineLeft(offset, commentMargins, dir, scrollX) {
		let left

		// This calculation is the same as in .cd-comment-overlay-marker, but without -1px - we don't
		// need it. Don't round - we need a subpixel-precise value.
		const centerLeft = -(
			(cd.g.commentMarkerWidth / cd.g.pixelDeviationRatio - 1 / cd.g.pixelDeviationRatioFor1px) /
			2
		)

		if (dir === 'ltr') {
			left = offset.left + centerLeft
			if (commentMargins) {
				left -= commentMargins.left + 1
			}
		} else {
			left = offset.right - cd.g.commentMarkerWidth / cd.g.pixelDeviationRatio - centerLeft
			if (commentMargins) {
				left += commentMargins.right + 1
			}
		}

		return left + scrollX - cd.g.threadLineSidePadding
	}

	/**
	 * Set the click area offset based on the `clickAreaOffset` property.
	 *
	 * @private
	 */
	updateClickAreaOffset() {
		const clickArea = /** @type {HTMLElement} */ (this.clickArea)
		const clickAreaOffset = /** @type {ClickAreaOffset} */ (this.clickAreaOffset)
		clickArea.style.left = String(clickAreaOffset.left) + 'px'
		clickArea.style.top = String(clickAreaOffset.top) + 'px'
		clickArea.style.height = String(clickAreaOffset.height) + 'px'
	}

	/**
	 * Remove the thread line if present and set the relevant properties to `undefined`.
	 *
	 * @private
	 */
	removeLine() {
		if (!this.line || !this.clickArea) return

		this.clickArea.remove()
		this.clickArea = this.clickAreaOffset = this.line = undefined
	}

	/**
	 * Get all comments in the thread.
	 *
	 * @returns {import('./Comment').default[]}
	 */
	getComments() {
		return commentManager.getAll().slice(this.rootComment.index, this.lastComment.index + 1)
	}

	/**
	 * @type {PrototypeRegistry<{
	 *   expandButton: HTMLElement
	 *   clickArea: HTMLElement
	 * }>}
	 * @private
	 */
	static prototypes = new PrototypeRegistry()

	/**
	 * @type {HTMLDivElement|undefined}
	 * @private
	 */
	static threadLinesContainer

	/**
	 * Whether threads have been initialized on first run.
	 *
	 * @private
	 */
	static isInited = false

	/**
	 * Whether the thread is in the navigation move (when the user holds the middle or left mouse
	 * button and moves the cursor up or down).
	 */
	static navMode = false

	/**
	 * Elements tree walker used during initialization.
	 *
	 * @type {ElementsTreeWalker<HTMLElement>}
	 */
	static treeWalker

	/**
	 * Have the prototypes been initialized.
	 *
	 * @type {boolean}
	 */
	static prototypesInitted = false

	/**
	 * _For internal use._ Create element prototypes to reuse them instead of creating new elements
	 * from scratch (which is more expensive).
	 */
	static initPrototypes() {
		if (this.prototypesInitted) return

		this.prototypes.add(
			'expandButton',
			new OO.ui.ButtonWidget({
				// Isn't displayed
				label: 'Expand the thread',
				icon: 'expand',

				framed: false,
				classes: [
					'cd-button-ooui',
					'cd-button-expandNote',
					'cd-thread-button',
					'cd-thread-button-invisible',
					'cd-icon',
				],
			}).$element[0],
		)

		const threadClickArea = document.createElement('div')
		threadClickArea.className = 'cd-thread-clickArea'
		const line = document.createElement('div')
		line.className = 'cd-thread-line'
		threadClickArea.append(line)
		this.prototypes.add('clickArea', threadClickArea)

		this.prototypesInitted = true
	}

	/**
	 * Create threads. Can be re-run if DOM elements are replaced.
	 *
	 * @param {boolean} [autocollapse] Autocollapse threads according to the settings and restore
	 *   collapsed threads from the local storage.
	 */
	static reset = (autocollapse = true) => {
		this.enabled = cd.settings.get('enableThreads')
		if (!this.enabled) {
			new StorageItemWithKeysAndSaveTime('collapsedThreads').removeItem()

			return
		}

		if (!this.isInited) {
			this.on('toggle', this.updateLines)
			controller.on('resize', this.updateLines).on('mutate', () => {
				// Update only on mouse move to prevent short freezings of a page when there is a comment
				// form in the beginning of a very long page and the input is changed so that everything
				// below the form shifts vertically.
				$(document).off('mousemove.cd', this.updateLines).one('mousemove.cd', this.updateLines)
			})
			$(document).on('visibilitychange', this.updateLines)
			updateChecker
				// Start and end elements of threads may be replaced, so we need to restart threads.
				.on('newChanges', () => {
					this.reset()
				})
		}

		this.collapseThreadsLevel = cd.settings.get('collapseThreadsLevel')
		this.treeWalker = new ElementsTreeWalker(controller.rootElement)
		commentManager.getAll().forEach((rootComment) => {
			try {
				rootComment.thread?.expand(true)
				rootComment.thread = new Thread(rootComment)
			} catch {
				// Empty
			}
		})

		if (this.threadLinesContainer) {
			this.threadLinesContainer.innerHTML = ''
		} else {
			this.threadLinesContainer = document.createElement('div')
			this.threadLinesContainer.className = 'cd-threadLinesContainer'
		}

		// We could choose not to update lines on initialization as it is a relatively costly operation
		// that can be delayed, but not sure it makes any difference at which point the page is blocked
		// for interactions.
		this.updateLines()

		if (!this.threadLinesContainer.parentNode) {
			document.body.append(this.threadLinesContainer)
		}
		if (autocollapse) {
			this.autocollapseThreads()
		}
		this.isInited = true
		this.emit('init')
	}

	/**
	 * Autocollapse threads starting from some level according to the setting value and restore
	 * collapsed threads from the local storage.
	 *
	 * @private
	 */
	static autocollapseThreads() {
		/**
		 * @typedef {object} CollapsedThreadsStorageItem
		 * @property {string} id
		 * @property {boolean} collapsed
		 * @property {boolean} wasManuallyExpanded
		 */

		const collapsedThreadsStorageItem =
			/** @type {StorageItemWithKeysAndSaveTime<CollapsedThreadsStorageItem[], 'collapsedThreads'>} */ (
				new StorageItemWithKeysAndSaveTime('collapsedThreads').cleanUp(
					(entry) => !entry.collapsedThreads.length || entry.saveTime < subtractDaysFromNow(60),
				)
			)

		const collapsedThreads = collapsedThreadsStorageItem.get(
			mw.config.get('wgArticleId'),
		)?.collapsedThreads

		/** @type {Thread[]} */
		const threads = []

		collapsedThreads?.forEach((threadItem) => {
			const comment = commentManager.getById(threadItem.id)
			if (comment?.thread) {
				if (threadItem.collapsed) {
					threads.push(comment.thread)
				} else {
					comment.thread.wasManuallyExpanded = true
				}
			} else {
				// Remove IDs that have no corresponding comments or threads from the data
				removeFromArrayIfPresent(collapsedThreads, threadItem)
			}
		})

		// Don't precisely target comments of level this.collapseThreadsLevel in case there is a gap,
		// for example between the `this.collapseThreadsLevel - 1` level and the
		// `this.collapseThreadsLevel + 1` level (the user muse have replied to a comment at the
		// `this.collapseThreadsLevel - 1` level but inserted `::` instead of `:`).
		for (let i = 0; i < commentManager.getCount(); i++) {
			const thread = /** @type {import('./Comment').default} */ (commentManager.getByIndex(i))
				.thread
			if (!thread) continue

			if (thread.rootComment.level >= /** @type {number} */ (this.collapseThreadsLevel)) {
				// Exclude threads where the user participates at any level up and down the tree or that
				// the user has specifically expanded.
				if (![...thread.rootComment.getAncestors(), ...thread.comments].some((c) => c.isOwn)) {
					thread.isAutocollapseTarget = true

					if (!thread.wasManuallyExpanded) {
						threads.push(thread)
					}
				}

				i = thread.lastComment.index
			}
		}

		const loadUserGendersPromise = cd.g.genderAffectsUserString
			? loadUserGenders(threads.flatMap((thread) => thread.getUsers()))
			: undefined

		// The reverse order is used for the threads to be expanded correctly.
		threads
			.sort((thread1, thread2) => thread1.rootComment.index - thread2.rootComment.index)
			.forEach((thread) => {
				thread.collapse(true, undefined, loadUserGendersPromise)
			})
		this.emit('toggle')

		if (cd.utils.isCurrentRevision() && collapsedThreads) {
			collapsedThreadsStorageItem.setWithTime(mw.config.get('wgArticleId'), collapsedThreads).save()
		}
	}

	/**
	 * Find the closest item element (`<li>`, `<dd>`) for an element.
	 *
	 * @param {HTMLElement} element
	 * @param {number} level
	 * @param {HTMLElement} [nextForeignElement]
	 * @returns {HTMLElement | undefined}
	 * @private
	 */
	static findItemElement(element, level, nextForeignElement) {
		this.treeWalker.currentNode = element

		let item
		let previousNode = element
		do {
			const currentNode = this.treeWalker.currentNode
			if (currentNode.classList.contains('cd-commentLevel')) {
				const match = /** @type {string} */ (currentNode.getAttribute('class')).match(
					/cd-commentLevel-(\d+)/,
				)
				if (match && Number(match[1]) === (level || 1)) {
					// If the level is 0 (outdented comment or subitem of a 0-level comment), we need the list
					// element, not the item element.
					item = level === 0 ? currentNode : previousNode

					// The element can contain parts of a comment that is not in the thread, for example
					// https://ru.wikipedia.org/wiki/Википедия:К_оценке_источников#202104120830_RosssW_2.
					if (nextForeignElement && item.contains(nextForeignElement)) {
						return
					}

					break
				}
			}
			previousNode = currentNode
		} while (this.treeWalker.parentNode())

		return item
	}

	/**
	 * Find the thread's end element given the root comment is at the 0th level.
	 *
	 * @param {HTMLElement} startElement
	 * @param {HTMLElement[]} highlightables
	 * @param {HTMLElement} [nextForeignElement]
	 * @returns {HTMLElement}
	 * @private
	 */
	static findEndElementOfZeroLevelThread(startElement, highlightables, nextForeignElement) {
		/** @type {HTMLElement | null} */
		let commonAncestor = startElement
		const lastHighlightable = highlightables[highlightables.length - 1]
		do {
			commonAncestor = /** @type {HTMLElement} */ (commonAncestor).parentElement
		} while (commonAncestor && !commonAncestor.contains(lastHighlightable))

		let endElement = lastHighlightable
		for (
			let n = endElement.parentElement;
			n && n !== commonAncestor && !(nextForeignElement && n.contains(nextForeignElement));
			n = n.parentElement
		) {
			endElement = n
		}

		// "Reply in section", "There are new comments in this thread" button container
		for (
			let n = endElement.nextElementSibling;
			n && n.tagName === 'DL' && n.classList.contains('cd-section-button-container');
			n = n.nextElementSibling
		) {
			endElement = /** @type {HTMLElement} */ (n)
		}

		return endElement
	}

	/**
	 * _For internal use._ Calculate the offset and (if needed) add the thread lines to the container.
	 */
	static updateLines = () => {
		if (!this.enabled || document.hidden) return

		/** @type {HTMLElement[]} */
		const elementsToAdd = []
		/** @type {Thread[]} */
		const threadsToUpdate = []
		const scrollX = window.scrollX
		const scrollY = window.scrollY

		const floatingRects = controller.getFloatingElements().map(getExtendedRect)
		commentManager
			.getAll()
			.slice()
			.reverse()
			.some((comment) =>
				comment.thread?.updateLine({
					elementsToAdd,
					threadsToUpdate,
					scrollX,
					scrollY,
					floatingRects,
				}),
			)

		// Faster to update/add all elements in one batch.
		threadsToUpdate.forEach((thread) => {
			thread.updateClickAreaOffset()
		})

		if (elementsToAdd.length) {
			const threadLinesContainerTyped = /** @type {HTMLDivElement} */ (this.threadLinesContainer)
			threadLinesContainerTyped.append(...elementsToAdd)
		}
	}

	/**
	 * Save collapsed threads to the local storage.
	 *
	 * @private
	 */
	static saveCollapsedThreads() {
		if (!cd.utils.isCurrentRevision()) return

		new StorageItemWithKeysAndSaveTime('collapsedThreads')
			.setWithTime(
				mw.config.get('wgArticleId'),
				commentManager
					.query((comment) =>
						Boolean(
							comment.thread && comment.thread.isCollapsed !== comment.thread.isAutocollapseTarget,
						),
					)
					.map((comment) => ({
						id: comment.id,
						collapsed: /** @type {Thread} */ (comment.thread).isCollapsed,
					})),
			)
			.save()
	}
}

export default Thread
