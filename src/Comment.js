import Button from './Button'
import CommentFlagSet from './CommentFlagSet'
import CommentSource from './CommentSource'
import CommentSubitemList from './CommentSubitemList'
import EventEmitter from './EventEmitter'
import LiveTimestamp from './LiveTimestamp'
import StorageItemWithKeys from './StorageItemWithKeys'
import commentFormManager from './commentFormManager'
import commentManager from './commentManager'
import controller from './controller'
import cd from './loader/cd'
import pageRegistry from './pageRegistry'
import CdError from './shared/CdError'
import CommentSkeleton from './shared/CommentSkeleton'
import ElementsTreeWalker from './shared/ElementsTreeWalker'
import {
	addToArrayIfAbsent,
	areObjectsEqual,
	calculateWordOverlap,
	countOccurrences,
	decodeHtmlEntities,
	defined,
	getHeadingLevel,
	removeFromArrayIfPresent,
	sleep,
	underlinesToSpaces,
	unique,
} from './shared/utils-general'
import { extractNumeralAndConvertToNumber, removeWikiMarkup } from './shared/utils-wikitext'
import userRegistry from './userRegistry'
import { handleApiReject, loadUserGenders, parseCode } from './utils-api'
import { formatDate, formatDateNative } from './utils-date'
import { showConfirmDialog } from './utils-oojs'
import { mixIntoClass } from './utils-oojs-class'
import {
	extractSignatures,
	getExtendedRect,
	isVisible,
	limitSelectionAtEndBoundary,
	mergeJquery,
	wrapDiffBody,
	wrapHtml,
} from './utils-window'

/**
 * @typedef {object} CommentOffset
 * @property {number} top
 * @property {number} bottom
 * @property {number} left
 * @property {number} right
 * @property {number} bottomForVisibility A solution for comments that have the height bigger than
 *   the viewport height. In Chrome, the scrolling step is 100 pixels.
 * @property {number} firstHighlightableWidth First highlightable's width to determine if the
 *   element is moved in future checks.
 * @memberof Comment
 * @inner
 */

/**
 * @typedef {object} CommentMargins
 * @property {number} left Left margin.
 * @property {number} right Right margin.
 * @memberof Comment
 * @inner
 */

/**
 * @typedef {object} ScrollToConfig
 * @property {boolean} [smooth=true] Use a smooth animation.
 * @property {boolean} [expandThreads=false] Whether to expand the threads down to the
 *   comment (to avoid the notification "The comment is in a collapsed thread").
 * @property {boolean} [flash] Whether to flash the comment as target.
 * @property {boolean} [pushState=false] Whether to push a state to the history with the
 *   comment ID as a fragment.
 * @property {() => void} [callback] Callback to run after the animation has completed.
 * @property {'top'|'center'|'bottom'} [alignment] Where should the element be positioned
 *   relative to the viewport.
 */

/**
 * @typedef {Map<
 *   import('./updateChecker').SectionWorkerMatched | import('./Section').default | undefined,
 *   import('./updateChecker').CommentWorkerNew[] | Comment[]
 * >} CommentsBySection
 */

/**
 * @typedef {object} EventMap
 * @property {[import('./Page').default | boolean]} transclusionFound
 */

/**
 * A comment (any signed, and in some cases unsigned, text on a wiki talk page) in the window (not
 * the web worker) context.
 *
 * @template {boolean} [OpeningSection=boolean]
 */
class Comment extends mixIntoClass(
	/** @type {typeof CommentSkeleton<Node>} */ (CommentSkeleton),
	/** @type {typeof EventEmitter<EventMap>} */ (EventEmitter),
) {
	/** @readonly */
	TYPE = 'comment'

	/**
	 * Flags helper for comment state that is used by styling logic.
	 *
	 * @type {CommentFlagSet}
	 */
	flags

	/**
	 * @override
	 * @type {HTMLElement}
	 */
	// @ts-expect-error: TS incorrectly flags this as circular, but parent fields initialize first
	signatureElement = this.signatureElement

	/**
	 * @override
	 * @type {HTMLElement | undefined}
	 */
	// @ts-expect-error: TS incorrectly flags this as circular, but parent fields initialize first
	timestampElement = this.timestampElement

	/**
	 * @override
	 * @type {HTMLAnchorElement | undefined}
	 */
	// @ts-expect-error: TS incorrectly flags this as circular, but parent fields initialize first
	authorLink = this.authorLink

	/**
	 * @override
	 * @type {HTMLAnchorElement | undefined}
	 */
	// @ts-expect-error: TS incorrectly flags this as circular, but parent fields initialize first
	authorTalkLink = this.authorTalkLink

	/**
	 * @override
	 * @type {HTMLElement[]}
	 */
	// @ts-expect-error: TS incorrectly flags this as circular, but parent fields initialize first
	elements = this.elements

	/**
	 * @override
	 * @type {HTMLElement[]}
	 */
	// @ts-expect-error: TS incorrectly flags this as circular, but parent fields initialize first
	highlightables = this.highlightables

	/**
	 * @override
	 * @type {import('./shared/Parser').SignatureTarget<Node>[]}
	 */
	// @ts-expect-error: TS incorrectly flags this as circular, but parent fields initialize first
	extraSignatures = this.extraSignatures

	/**
	 * @type {boolean}
	 * @private
	 */
	spacious

	/** @type {Direction | undefined} */
	direction

	/**
	 * A special {@link Comment#highlightables highlightable} used to
	 * {@link Comment#getLayersMargins determine layers margins}.
	 *
	 * @type {HTMLElement}
	 * @private
	 */
	marginHighlightable

	/**
	 * Layers composition for managing comment visual layers.
	 *
	 * @type {import('./CommentLayers').default | undefined}
	 */
	layers

	/**
	 * Actions composition for managing comment action buttons.
	 *
	 * @type {import('./CommentActions').default | undefined}
	 */
	actions

	/**
	 * Container for the comment's layers.
	 *
	 * @type {Element | undefined}
	 */
	layersContainer

	/**
	 * Has the comment been seen if it is new. Is set only on active pages (not archived, not old
	 * diffs) excluding pages that are visited for the first time. Check using `=== false` if you
	 * need to know if the comment is highlighted as new and unseen.
	 *
	 * @type {boolean | undefined}
	 */
	isSeen

	/**
	 * Has the comment changed since the previous visit.
	 *
	 * @type {boolean | undefined}
	 */
	isChangedSincePreviousVisit

	/**
	 * Adds a comment flag.
	 *
	 * @param {import('./CommentFlagSet').CommentFlag} flag
	 */
	addFlag(flag) {
		this.flags.add(flag)
		this.updateClassesForFlag(flag, true)
	}

	/**
	 * Removes a comment flag.
	 *
	 * @param {import('./CommentFlagSet').CommentFlag} flag
	 */
	removeFlag(flag) {
		this.flags.remove(flag)
		this.updateClassesForFlag(flag, false)
	}

	/**
	 * Returns whether a comment has a specific flag.
	 *
	 * @param {import('./CommentFlagSet').CommentFlag} flag
	 * @returns {boolean}
	 */
	hasFlag(flag) {
		return this.flags.has(flag)
	}

	/**
	 * Should the comment be flashed as changed when it appears in sight.
	 *
	 * @type {boolean | undefined}
	 */
	willFlashChangedOnSight = false

	/**
	 * Is the comment (or its signature) inside a table containing only one comment.
	 *
	 * @type {boolean}
	 */
	isTableComment = false

	/**
	 * Is the comment a part of a collapsed thread.
	 *
	 * @type {boolean}
	 */
	isCollapsed = false

	/**
	 * If the comment is collapsed, that's the closest collapsed thread that this comment is related
	 * to.
	 *
	 * @type {import('./Thread').default | undefined}
	 */
	collapsedThread

	/**
	 * List of the comment's {@link CommentSubitemList subitems}.
	 *
	 * @type {CommentSubitemList}
	 */
	subitemList = new CommentSubitemList()

	/** @type {Array<() => void>} */
	genderRequestCallbacks = []

	/**
	 * Is there a "gap" in the comment between {@link Comment#highlightable highlightables} that needs
	 * to be closed visually so that the comment looks like one comment and not several.
	 *
	 * @type {boolean}
	 */
	isLineGapped

	/**
	 * Has the comment been seen before it was changed.
	 *
	 * @type {boolean | undefined}
	 * @private
	 */
	isSeenBeforeChanged

	/** @type {import('./Thread').default | undefined} */
	thread

	/** @type {string|undefined} */
	dtId

	/** @type {import('./Page').default | boolean | undefined} */
	dtTranscludedFrom

	/**
	 * The comment's coordinates.
	 *
	 * @type {CommentOffset | undefined}
	 */
	offset

	/**
	 * The comment's rough coordinates (without taking into account floating elements around the
	 * comment).
	 *
	 * @type {CommentOffset | undefined}
	 */
	roughOffset

	/**
	 * @override
	 * @type {OpeningSection extends true ? import('./Section').default : import('./Section').default | undefined}
	 */
	// @ts-expect-error: TS incorrectly flags this as circular, but parent fields initialize first
	section = this.section

	/**
	 * Does the comment open a section (has a heading as the first element and is placed at the
	 * zeroth level).
	 *
	 * @override
	 * @type {OpeningSection}
	 * @protected
	 */
	// @ts-expect-error: TS incorrectly flags this as circular, but parent fields initialize first
	openingSection = this.openingSection

	/**
	 * Comment's source code object.
	 *
	 * @type {CommentSource|undefined}
	 */
	source

	/**
	 * Is the comment selected.
	 *
	 * @type {boolean}
	 */
	isSelected = false

	/**
	 * Was the menu hidden (used for compact comments).
	 *
	 * @type {boolean | undefined}
	 */
	wasMenuHidden

	/** @type {import('./commentManager').CommentManager} */
	manager

	/**
	 * Create a comment object.
	 *
	 * @param {import('./shared/Parser').default<Node>} parser
	 * @param {import('./shared/Parser').SignatureTarget<Node>} signature Signature object returned by
	 *   {@link Parser#findSignatures}.
	 * @param {import('./shared/Parser').Target<Node>[]} targets Sorted target objects returned by
	 *   {@link Parser#findSignatures} + {@link Parser#findHeadings}.
	 * @param {import('./commentManager').CommentManager} manager
	 */
	constructor(parser, signature, targets, manager) {
		super(parser, signature, targets)

		this.manager = manager

		this.flags = new CommentFlagSet()
		if (this.isOwn) {
			this.addFlag('own')
		}

		this.showContribsLink = cd.settings.get('showContribsLink')
		this.hideTimezone = cd.settings.get('hideTimezone')
		this.timestampFormat = cd.settings.get('timestampFormat')
		this.useUiTime = cd.settings.get('useUiTime')
		this.countEditsAsNewComments = cd.settings.get('countEditsAsNewComments')

		/**
		 * Comment author user object.
		 *
		 * @type {import('./User').default}
		 */
		this.author = userRegistry.get(this.authorName)

		/**
		 * Comment signature element.
		 *
		 * @type {JQuery}
		 */
		this.$signature = $(this.signatureElement)

		/**
		 * Is the comment actionable, i.e. you can reply to or edit it. A comment is actionable if it is
		 * not in a closed discussion or an old diff page. (Previously the presence of an author was
		 * also checked, but currently all comments should have an author.)
		 *
		 * @type {boolean}
		 */
		this.isActionable =
			cd.page.isActive() &&
			!controller.getClosedDiscussions().some((el) => el.contains(this.elements[0]))

		this.isEditable =
			this.isActionable && (this.hasFlag('own') || cd.settings.get('allowEditOthersComments'))

		// Delay bindEvents call until after construction is complete
		setTimeout(() => {
			this.highlightables.forEach((element) => {
				this.bindEvents(element)
			})
		}, 0)

		this.updateMarginHighlightable()

		/**
		 * Get the type of the list that `el` is an item of. This function traverses the ancestors of `el`
		 * and returns the tag name of the first ancestor that has the class `cd-commentLevel`.
		 *
		 * @param {Element} el
		 * @returns {ListType | undefined}
		 * @private
		 */
		const getContainerListType = (el) => {
			const treeWalker = new ElementsTreeWalker(controller.rootElement, el)
			while (treeWalker.parentNode()) {
				if (treeWalker.currentNode.classList.contains('cd-commentLevel')) {
					return /** @type {ListType} */ (treeWalker.currentNode.tagName.toLowerCase())
				}
			}

			return
		}

		if (this.level !== 0) {
			/**
			 * Name of the tag of the list that this comment is an item of. `'dl'`, `'ul'`, `'ol'`, or
			 * `null`.
			 *
			 * @type {ListType | undefined}
			 */
			this.containerListType = getContainerListType(this.highlightables[0])

			this.mhContainerListType = getContainerListType(this.marginHighlightable)
		}
	}

	/**
	 * Set the {@link Comment#marginHighlightable} element.
	 *
	 * @private
	 */
	updateMarginHighlightable() {
		if (this.highlightables.length > 1) {
			const nestingLevels = /** @type {number[]} */ ([])
			const closestListTypes = /** @type {ListType[]} */ ([])
			const firstAndLastHighlightable = [
				this.highlightables[0],
				this.highlightables[this.highlightables.length - 1],
			]
			firstAndLastHighlightable.forEach((highlightable, i) => {
				const treeWalker = new ElementsTreeWalker(controller.rootElement, highlightable)
				nestingLevels[i] = 0
				while (treeWalker.parentNode()) {
					nestingLevels[i]++
					if (!closestListTypes[i] && ['DL', 'UL', 'OL'].includes(treeWalker.currentNode.tagName)) {
						closestListTypes[i] = /** @type {ListType} */ (
							treeWalker.currentNode.tagName.toLowerCase()
						)
					}
				}
			})
			let marginHighlightableIndex
			for (let i = 0; i < 2; i++) {
				if (
					marginHighlightableIndex === undefined
						? nestingLevels[i] === Math.min(...nestingLevels)
						: closestListTypes[marginHighlightableIndex] === 'ol' && closestListTypes[i] !== 'ol'
				) {
					marginHighlightableIndex = i
				}
			}

			this.marginHighlightable =
				firstAndLastHighlightable[/** @type {number} */ (marginHighlightableIndex)]
		} else {
			this.marginHighlightable = this.highlightables[0]
		}
	}

	/**
	 * Do nearly the same thing as {@link Comment#reviewHighlightables} for the second time: if
	 * {@link Comment#reviewHighlightables} has altered the highlightables, this will save the day.
	 *
	 * @protected
	 */
	rewrapHighlightables() {
		;[this.highlightables[0], this.highlightables[this.highlightables.length - 1]]
			.filter(unique)
			.filter(
				(el) =>
					cd.g.badHighlightableElements.includes(el.tagName) ||
					(this.highlightables.length > 1 &&
						el.tagName === 'LI' &&
						el.parentElement?.tagName === 'OL') ||
					Array.from(el.classList).some((name) => !name.startsWith('cd-')),
			)
			.forEach((el) => {
				const wrapper = document.createElement('div')
				const origEl = el
				this.replaceElement(el, wrapper)
				wrapper.append(origEl)

				this.addAttributes()
				origEl.classList.remove('cd-comment-part', 'cd-comment-part-first', 'cd-comment-part-last')
				delete origEl.dataset.cdCommentIndex
			})
	}

	/**
	 * Check whether the comment can be edited.
	 *
	 * @returns {boolean}
	 */
	canBeEdited() {
		return this.isEditable
	}

	/**
	 * Set the comment to go to when the "Go to the child comment" button is clicked.
	 *
	 * @param {Comment} targetChild
	 */
	setTargetChild(targetChild) {
		this.targetChild = targetChild
	}

	/**
	 * Create a {@link Comment#goToChildButton "Go to child" button} and add it to the comment header
	 * ({@link Comment#$header} or the overlay menu from layers), if it was not already added.
	 *
	 * @private
	 */
	maybeAddGoToChildButton() {
		this.actions?.maybeAddGoToChildButton()
	}

	/**
	 * _For internal use._ Create a
	 * {@link Comment#toggleChildThreadsButton "Toggle child threads" button} and add it to the
	 * comment header. Don't add to the overlay menu of the classic design - it occupies valuable
	 * space there. The user may use Shift+click on a thread line instead.
	 */
	addToggleChildThreadsButton() {
		this.actions?.addToggleChildThreadsButton()
	}

	/**
	 * Update the look of the "Toggle children" button.
	 */
	updateToggleChildThreadsButton() {
		if (!this.actions?.toggleChildThreadsButton) return

		// This will be handled by subclass implementations
		this.updateToggleChildThreadsButtonImpl()
	}

	/**
	 * Update the toggle child threads button implementation.
	 * This method should be overridden by subclasses.
	 */
	updateToggleChildThreadsButtonImpl() {
		// Default implementation - will be overridden by subclasses
	}

	/**
	 * _For internal use._ Update the main timestamp element.
	 *
	 * This method should be overridden by subclasses.
	 *
	 * @param {string} timestamp
	 * @param {string} title
	 */
	updateMainTimestampElement(timestamp, title) {
		if (!this.hasTimestamp()) return

		this.timestampElement.textContent = timestamp
		this.timestampElement.title = title
	}

	/**
	 * _For internal use._ Update extra signature timestamps (common logic).
	 */
	updateExtraSignatureTimestamps() {
		this.extraSignatures.forEach((sig) => {
			if (!Comment.hasTimestamp(sig)) return

			const { timestamp: extraSigTimestamp, title: extraSigTitle } = this.formatTimestamp(
				sig.date,
				sig.timestampText,
			)
			sig.timestampElement.textContent = extraSigTimestamp
			sig.timestampElement.title = extraSigTitle
			new LiveTimestamp(sig.timestampElement, sig.date, !this.hideTimezone).init()
		})
	}

	/**
	 * Get separators for change note links.
	 * This method should be overridden by subclasses.
	 *
	 * @param {string} _stringName
	 * @param {Button} [_refreshLink]
	 * @returns {{ noteText: string, refreshLinkSeparator: string, diffLinkSeparator: string }}
	 * @protected
	 * @abstract
	 */
	getChangeNoteSeparators(_stringName, _refreshLink) {
		throw new Error('getChangeNoteSeparators must be implemented by subclasses')
	}

	/**
	 * Initialize comment structure after parsing (when live-updating a comment with a new version).
	 * Finds signature element, then delegates to subclass implementation.
	 */
	initializeCommentStructure() {
		this.signatureElement = this.$elements.find('.cd-signature')[0]
		this.initializeCommentStructureImpl()
	}

	/**
	 * Implementation-specific comment structure initialization.
	 *
	 * This method should be overridden by subclasses.
	 */
	initializeCommentStructureImpl() {
		// Default implementation - will be overridden by subclasses
	}

	/**
	 * Check whether all child comments' threads are collapsed.
	 *
	 * @returns {boolean}
	 */
	areChildThreadsCollapsed() {
		return this.getChildren().every((child) => !child.thread || child.thread.isCollapsed)
	}

	/**
	 * Show a popup onboarding onto the "Toggle child threads" feature.
	 */
	async maybeOnboardOntoToggleChildThreads() {
		if (!this.shouldOnboardOntoToggleChildThreads()) return

		await sleep(100)
		if (!this.shouldOnboardOntoToggleChildThreads()) return

		// When comments are spacious, wait for jumpy stuff on the page to jump to prevent
		// repositioning (e.g. the subscribe button). This is only to mitigate; too tricky to track all
		// possible events here, and it's not critical.
		//
		// When comments are not spacious, wait some time to be sure this isn't an accidental
		// hovering.

		const button = new OO.ui.ButtonWidget({
			label: cd.s('educationpopup-dismiss'),
			flags: ['progressive', 'primary'],
		})
		button.on('click', () => {
			const toggleChildThreadsPopupTyped = /** @type {OO.ui.PopupWidget} */ (
				this.toggleChildThreadsPopup
			)
			toggleChildThreadsPopupTyped.toggle(false)
		})
		this.toggleChildThreadsPopup = new OO.ui.PopupWidget({
			icon: 'newspaper',
			label: cd.s('togglechildthreads-popup-title'),
			$content: mergeJquery(
				wrapHtml(cd.sParse('togglechildthreads-popup-text'), {
					callbacks: {
						'cd-notification-settings-togglechildthreads': (_event, btn) => {
							cd.settings.showDialogOnButtonClick(
								btn,
								'talkPage',
								'.cd-setting-collapseThreadsLevel input',
							)
						},
					},
				}).children(),
				$('<p>').append(button.$element),
			),
			head: true,
			$floatableContainer: $(this.actions.toggleChildThreadsButton.element),
			$container: $(document.body),
			position: 'below',
			padded: true,
			classes: ['cd-popup-onboarding'],
		})
		$(document.body).append(this.toggleChildThreadsPopup.$element)
		this.toggleChildThreadsPopup.toggle(true)
		this.toggleChildThreadsPopup.on('closing', () => {
			cd.settings.saveSettingOnTheFly('toggleChildThreads-onboarded', true)
			this.teardownOnboardOntoToggleChildThreadsPopup()
		})
		controller.once('startReboot', this.teardownOnboardOntoToggleChildThreadsPopup)
	}

	/**
	 * Check if a popup onboarding onto the "Toggle child threads" feature should be shown.
	 *
	 * @returns {this is { actions: { toggleChildThreadsButton: import('./CommentButton').default } }}
	 */
	shouldOnboardOntoToggleChildThreads() {
		const element = this.actions?.toggleChildThreadsButton?.element

		return Boolean(
			element?.matches(':hover') &&
			// There is some bug with the popup positioned at 0, 0; I couldn't find the cause, so maybe
			// checkVisibility() would help.
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			(!element.checkVisibility || element.checkVisibility()) &&
			!cd.settings.get('toggleChildThreads-onboarded') &&
			!this.areChildThreadsCollapsed() &&
			!this.manager.query((c) => Boolean(c.toggleChildThreadsPopup)).length,
		)
	}

	teardownOnboardOntoToggleChildThreadsPopup = () => {
		if (!this.toggleChildThreadsPopup) return

		this.toggleChildThreadsPopup.$element.remove()
		this.toggleChildThreadsPopup = undefined
	}

	/**
	 * _For internal use._ Change the format of the comment timestamp according to the settings. Do
	 * the same with extra timestamps in the comment.
	 *
	 */
	reformatTimestamp() {
		if (!this.hasTimestamp()) return

		const { timestamp, title } = this.formatTimestamp(this.date, this.timestampElement.textContent)
		if (timestamp) {
			this.reformattedTimestamp = timestamp
			this.timestampTitle = title
			this.updateTimestampElements(timestamp, title)
		}
	}

	/**
	 * Given a date, format it as per user settings, and build a title (tooltip) too.
	 *
	 * @param {Date} date
	 * @param {string} originalTimestamp
	 * @returns {{ timestamp: string; title: string }}
	 */
	formatTimestamp(date, originalTimestamp) {
		let timestamp
		let title = ''
		if (!this.manager.areTimestampsDefault()) {
			timestamp = formatDate(date, !this.hideTimezone)
		}

		if (
			this.timestampFormat === 'relative' &&
			this.useUiTime &&
			cd.g.timestampTools.content.timezone !== cd.g.timestampTools.user.timezone
		) {
			title = formatDateNative(date, true) + '\n'
		}

		title += originalTimestamp

		return {
			timestamp: timestamp || '',
			title,
		}
	}

	/**
	 * _For internal use._ Update timestamp elements with formatted timestamp and title.
	 *
	 * Handles main timestamp update, then processes extra signatures.
	 *
	 * @param {string} timestamp
	 * @param {string} title
	 */
	updateTimestampElements(timestamp, title) {
		// Let subclass handle main timestamp element
		this.updateMainTimestampElement(timestamp, title)

		// Handle extra signatures (common logic)
		this.updateExtraSignatureTimestamps()
	}

	/**
	 * Bind the standard events to a comment part. Executed on comment object creation and DOM
	 * modifications affecting comment parts.
	 * This method can be overridden by subclasses.
	 *
	 * @param {HTMLElement} _element
	 * @protected
	 */
	bindEvents(_element) {
		// Default implementation - can be overridden by subclasses
	}

	/**
	 * Handle hover event for the comment.
	 * This method can be overridden by subclasses that need hover behavior.
	 *
	 * @param {MouseEvent | TouchEvent} [_event] The triggering event
	 * @protected
	 */
	handleHover(_event) {
		// Default implementation - can be overridden by subclasses
	}

	/**
	 * Handle unhover event for the comment.
	 * This method can be overridden by subclasses that need hover behavior.
	 *
	 * @param {boolean} [_force] Force unhover even if conditions would normally prevent it
	 * @protected
	 */
	handleUnhover(_force = false) {
		// Default implementation - can be overridden by subclasses
	}

	/**
	 * _For internal use._ Filter out floating and hidden elements from the comment's
	 * {@link CommentSkeleton#highlightables highlightables}, change their attributes, and update the
	 * comment's level and parent elements' level classes.
	 */
	reviewHighlightables() {
		for (let i = 0; i < this.highlightables.length; i++) {
			const el = this.highlightables[i]

			if (
				// Are there any elements with classes not added by CD?
				Array.from(el.classList).some(
					(name) => !name.startsWith('cd-') || name === 'cd-comment-replacedPart',
				)
			) {
				const testElement = /** @type {HTMLElement} */ (
					i === 0 && el.classList.contains('cd-comment-replacedPart') ? el.firstChild : el
				)

				// Node that we could use window.getComputerStyle here, but avoid it to avoid the reflow.
				if (
					// Currently we can't have comments with no highlightable elements.
					this.highlightables.length > 1 &&
					(controller.getFloatingElements().includes(testElement) ||
						controller.getHiddenElements().includes(testElement))
				) {
					if (el.classList.contains('cd-comment-part-first')) {
						el.classList.remove('cd-comment-part-first')
						this.highlightables[i + 1].classList.add('cd-comment-part-first')
					}
					if (el.classList.contains('cd-comment-part-last')) {
						el.classList.remove('cd-comment-part-last')
						this.highlightables[i - 1].classList.add('cd-comment-part-last')
					}
					delete el.dataset.commentIndex
					this.highlightables.splice(i, 1)
					i--
					this.updateLevels(false)
					this.updateMarginHighlightable()

					// Update this.ahContainerListType here as well?
				}
			}
		}
	}

	/**
	 * Handle the reply button click.
	 *
	 * @private
	 */
	replyButtonClick() {
		if (this.replyForm) {
			this.replyForm.cancel()
		} else {
			this.reply()
		}
	}

	/**
	 * Handle the edit button click.
	 *
	 * @private
	 */
	editButtonClick() {
		this.edit()
	}

	/**
	 * Handle the thank button click.
	 *
	 * @private
	 */
	thankButtonClick() {
		this.thank()
	}

	/**
	 * Handle the "Go to parent" button click.
	 *
	 * @private
	 */
	goToParentButtonClick() {
		this.goToParent()
	}

	/**
	 * Handle the "Toggle child threads" button click.
	 *
	 * @private
	 */
	toggleChildThreadsButtonClick() {
		this.toggleChildThreads()
	}

	/**
	 * @template {boolean} [Save=false]
	 * @typedef {object} ManageOffsetOptions
	 * @property {import('./utils-window').ExtendedDOMRect[]} [floatingRects]
	 *   {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect Element#getBoundingClientRect}
	 *   results for floating elements from `convenientDiscussions.g.floatingElements`. It may be
	 *   calculated in advance for many elements in one sequence to save time.
	 * @property {boolean} [considerFloating] Whether to take floating elements around the comment
	 *   into account. Deemed `true` if `floatingRects` is set.
	 * @property {Save} [save] Whether to set the offset to the `offset` (if `considerFloating` is
	 *   `true`) or `roughOffset` (if `considerFloating` is `false`) property. If `true`, the function
	 *   will return a boolean value indicating if the comment was displaced instead of the offset.
	 *   (This value can be used to stop recalculating comment offsets if a number of comments in a
	 *   row have not moved for optimization purposes.) Setting the `offset` property implies that the
	 *   layers offset will be updated afterwards (see {@link CommentLayers#updateOffset}) -
	 *   otherwise, the next attempt to call this method to update the layers offset will return
	 *   `false` meaning the comment wasn't displaced, and the layers offset will stay wrong.
	 */

	/**
	 * @overload
	 * @param {ManageOffsetOptions} [options]
	 * @returns {CommentOffset | undefined}
	 *
	 * @overload
	 * @param {ManageOffsetOptions<true>} [options]
	 * @returns {boolean | undefined}
	 */

	/**
	 * Get the coordinates of the comment. Optionally save them as the `offset` or `roughOffset`
	 * property. Also set the {@link Comment#isStartStretched isStartStretched} and
	 * {@link Comment#isEndStretched isEndStretched} properties (if `options.considerFloating` is
	 * `true`).
	 *
	 * Note that comment coordinates are not static, obviously, but we need to recalculate them only
	 * occasionally.
	 *
	 * @param {ManageOffsetOptions<boolean>} [options]
	 * @returns {CommentOffset|boolean|undefined} If the comment is not visible, returns `undefined`.
	 *   If `options.save` is `true`, returns a boolean value indicating if the comment was displaced
	 *   instead of the offset. Otherwise, returns the offset object.
	 */
	manageOffset(options = {}) {
		options.considerFloating ??= Boolean(options.floatingRects)
		options.save ??= false

		let firstElement
		let lastElement
		if (this.editForm) {
			firstElement = lastElement = this.editForm.getOutermostElement()
		} else {
			firstElement = this.highlightables[0]
			lastElement = this.highlightables[this.highlightables.length - 1]
		}

		let rectTop = Comment.getCommentPartRect(firstElement)
		let rectBottom = this.elements.length === 1 ? rectTop : Comment.getCommentPartRect(lastElement)

		if (!isVisible(firstElement, lastElement)) {
			this.maybeSaveOffset(undefined, options)

			return
		}

		// Seems like caching this value significantly helps performance at least in Chrome. But need to
		// be sure the viewport can't jump higher when it is at the bottom point of the page after some
		// content starts to occupy less space.
		const scrollY = window.scrollY

		// Has the comment's position stayed the same (i.e. it wasn't displaced)? This value will be
		// `true` wrongly if the comment is around floating elements, but that doesn't hurt much.
		if (
			this.offset &&
			// Has the top stayed the same? With scale other than 100% values of less than 0.001 appear
			// in Chrome and Firefox.
			Math.abs(scrollY + rectTop.top - this.offset.top) < 0.01 &&
			// Has the height stayed the same?
			Math.abs(rectBottom.bottom - rectTop.top - (this.offset.bottom - this.offset.top)) < 0.01 &&
			// Has the width of the first highlightable stayed the same?
			Math.abs(this.highlightables[0].offsetWidth - this.offset.firstHighlightableWidth) < 0.01
		) {
			// If floating elements aren't supposed to be taken into account but the comment wasn't
			// displaced, we still set or return the offset with floating elements taken into account
			// because that shouldn't do any harm.
			this.maybeSaveOffset(this.offset, options)

			return options.save ? false : this.offset
		}

		const top = scrollY + rectTop.top
		const bottom = scrollY + rectBottom.bottom

		if (options.considerFloating) {
			;[rectTop, rectBottom] = this.getAdjustedRects(
				rectTop,
				rectBottom,
				top,
				bottom,
				options.floatingRects,
			)
		}

		const scrollX = window.scrollX
		const left = scrollX + Math.min(rectTop.left, rectBottom.left)
		const right = scrollX + Math.max(rectTop.right, rectBottom.right)

		if (options.considerFloating) {
			this.updateStretched(left, right)
		}

		const offset = {
			top,
			bottom,
			left,
			right,
			bottomForVisibility:
				bottom - top > window.innerHeight - 250 ? top + (window.innerHeight - 250) : bottom,
			firstHighlightableWidth: firstElement.offsetWidth,
		}
		this.maybeSaveOffset(offset, options)

		return options.save ? true : offset
	}

	/**
	 * If `options.save` is `true`, set the offset to the `offset` (if `options.considerFloating` is
	 * `true`) or `roughOffset` (if `options.considerFloating` is `false`) property.
	 *
	 * @param {CommentOffset|undefined} offset
	 * @param {ManageOffsetOptions<boolean>} options
	 * @private
	 */
	maybeSaveOffset(offset, options) {
		if (!options.save) return

		if (options.considerFloating) {
			this.offset = offset
		} else {
			this.roughOffset = offset
		}
	}

	/**
	 * Get the top and bottom rectangles of a comment while taking into account floating elements
	 * around the comment.
	 *
	 * @param {import('./utils-window').AnyDOMRect} rectTop Top rectangle that was got without taking
	 *   into account floating elements around the comment.
	 * @param {import('./utils-window').AnyDOMRect} rectBottom Bottom rectangle that was got without
	 *   taking into account floating elements around the comment.
	 * @param {number} top Top coordonate of the comment (calculated without taking floating elements
	 *   into account).
	 * @param {number} bottom Bottom coordonate of the comment (calculated without taking floating
	 *   elements into account).
	 * @param {import('./utils-window').ExtendedDOMRect[]} [floatingRects]
	 *   {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect Element#getBoundingClientRect}
	 *   results for floating elements from `convenientDiscussions.g.floatingElements`. It may be
	 *   calculated in advance for many elements in one sequence to save time.
	 * @returns {[import('./utils-window').AnyDOMRect, import('./utils-window').AnyDOMRect]}
	 * @private
	 */
	getAdjustedRects(
		rectTop,
		rectBottom,
		top,
		bottom,
		floatingRects = controller.getFloatingElements().map(getExtendedRect),
	) {
		// Check if the comment offset intersects the offsets of floating elements on the page. (Only
		// then would we need altering comment styles to get the correct offset which is an expensive
		// operation.)
		let intersectsFloatingCount = 0
		// We calculate the left and right borders separately - in its case, we need to change the
		// `overflow` property to get the desired value, otherwise floating elements are not taken
		// into account.
		if (
			// Does the comment's bottom intersect the vertical space of any floating element?
			floatingRects.reduce((result, rect) => {
				const floatingTop = scrollY + rect.outerTop
				const floatingBottom = scrollY + rect.outerBottom
				if (bottom > floatingTop && bottom < floatingBottom + cd.g.contentLineHeight) {
					result = true
				}
				if (bottom > floatingTop && top < floatingBottom + cd.g.contentLineHeight) {
					intersectsFloatingCount++
				}

				return result
			}, false)
		) {
			const initialOverflows = /** @type {string[]} */ ([])
			this.highlightables.forEach((el, i) => {
				initialOverflows[i] = el.style.overflow
				el.style.overflow = 'hidden'
			})

			rectTop = Comment.getCommentPartRect(this.highlightables[0])
			rectBottom =
				this.elements.length === 1
					? rectTop
					: Comment.getCommentPartRect(this.highlightables[this.highlightables.length - 1])

			// If the comment intersects more than one floating block, we better keep `overflow: hidden`
			// to avoid bugs like where there are two floating blocks to the right with different
			// leftmost offsets and the layer is more narrow than the comment.
			if (intersectsFloatingCount <= 1) {
				this.highlightables.forEach((el, i) => {
					el.style.overflow = initialOverflows[i]
				})
			} else {
				// Prevent issues with comments like this:
				// https://en.wikipedia.org/wiki/Wikipedia:Village_pump_(technical)#202107140040_SGrabarczuk_(WMF).
				this.highlightables.forEach((el, i) => {
					if (controller.getFloatingElements().some((floatingEl) => el.contains(floatingEl))) {
						el.style.overflow = initialOverflows[i]
					}
				})
			}
		}

		return [rectTop, rectBottom]
	}

	/**
	 * Update the {@link Comment#isStartStretched isStartStretched} and
	 * {@link Comment#isEndStretched isEndStretched} properties.
	 *
	 * @param {number} left Left offset.
	 * @param {number} right Right offset.
	 * @private
	 */
	updateStretched(left, right) {
		/**
		 * Is the start (left on LTR wikis, right on RTL wikis) side of the comment stretched to the
		 * start of the content area.
		 *
		 * @type {boolean|undefined}
		 */
		this.isStartStretched = false

		/**
		 * Is the end (right on LTR wikis, left on RTL wikis) side of the comment stretched to the end
		 * of the content area.
		 *
		 * @type {boolean|undefined}
		 */
		this.isEndStretched = false

		if (!this.getLayersContainer().cdIsTopLayersContainer) return

		if (this.level === 0) {
			const offsets = controller.getContentColumnOffsets()

			// 2 instead of 1 for Timeless
			const leftStretched = left - offsets.startMargin - 2
			const rightStretched = right + offsets.startMargin + 2

			this.isStartStretched =
				this.getDirection() === 'ltr'
					? leftStretched <= offsets.start
					: rightStretched >= offsets.start
			this.isEndStretched =
				this.getDirection() === 'ltr' ? rightStretched >= offsets.end : leftStretched <= offsets.end
		}
	}

	/**
	 * Get the comment's text direction. It can be different from the text direction of the site's
	 * content language on pages with text marked with the class `mw-content-ltr` or `mw-content-rtl`
	 * inside the content.
	 *
	 * @returns {Direction}
	 */
	getDirection() {
		this.direction ??= controller.areThereLtrRtlMixes()
			? // Take the last element because the first one may be the section heading which can have
				// another direction.
				this.elements[this.elements.length - 1]
					.closest('.mw-content-ltr, .mw-content-rtl')
					?.classList.contains('mw-content-rtl')
				? 'rtl'
				: 'ltr'
			: cd.g.contentDirection

		return this.direction
	}

	/**
	 * @typedef {object} LayersContainerOffset
	 * @property {number} top Top offset.
	 * @property {number} left Left offset.
	 * @memberof Comment
	 * @inner
	 */

	/**
	 * _For internal use._ Get the top and left offset of the layers container.
	 *
	 * @returns {LayersContainerOffset | undefined}
	 */
	getLayersContainerOffset() {
		const container = this.getLayersContainer()
		if (!container.cdCachedLayersContainerOffset || container.cdCouldHaveBeenDisplaced) {
			const rect = container.getBoundingClientRect()
			if (!isVisible(container)) return

			container.cdCouldHaveBeenDisplaced = false
			container.cdCachedLayersContainerOffset = {
				top: rect.top + window.scrollY,
				left: rect.left + window.scrollX,
			}
		}

		return container.cdCachedLayersContainerOffset
	}

	/**
	 * _For internal use._ Get and sometimes create the container for the comment's underlay and
	 * overlay.
	 *
	 * @returns {Element}
	 */
	getLayersContainer() {
		if (this.layersContainer === undefined) {
			let offsetParent

			const treeWalker = new ElementsTreeWalker(
				document.body,

				// Start with the first or last element dependent on which is higher in the DOM hierarchy in
				// terms of nesting level. There were issues with RTL in LTR (and vice versa) when we
				// started with the first element, see
				// https://github.com/jwbth/convenient-discussions/commit/9fcad9226a7019d6a643d7b17f1e824657302ebd.
				// On the other hand, if we start with the first/last element, we get can in trouble when
				// the start/end of the comment is inside a container while the end/start is not. A good
				// example that combines both cases (press "up" on the "comments" "These images are too
				// monochrome" and "So my suggestion is just, to..."):
				// https://en.wikipedia.org/w/index.php?title=Wikipedia:Village_pump_(technical)&oldid=1217857130#c-Example-20240401111100-Indented_tables.
				// This is a error, of course, that quoted comments are treated as real, but we can't do
				// anything here.
				this.elements.length === 1 ||
					this.parser.getNestingLevel(this.elements[0]) <=
						this.parser.getNestingLevel(this.elements[this.elements.length - 1])
					? this.elements[0]
					: this.elements[this.elements.length - 1],
			)

			while (treeWalker.parentNode()) {
				const node = treeWalker.currentNode

				// These elements have `position: relative` for the purpose we know.
				if (node.classList.contains('cd-connectToPreviousItem')) continue

				let style = node.cdStyle
				if (!style) {
					// window.getComputedStyle is expensive, so we save the result to the node's property.
					style = window.getComputedStyle(node)
					node.cdStyle = style
				}
				const classList = new Set(Array.from(node.classList))
				if (
					['absolute', 'relative'].includes(style.position) ||
					(node !== cd.loader.$content[0] &&
						(classList.has('mw-content-ltr') || classList.has('mw-content-rtl')))
				) {
					offsetParent = node
				}
				if (
					style.backgroundColor.includes('rgb(') ||
					(style.backgroundImage !== 'none' && !offsetParent)
				) {
					offsetParent = node
					offsetParent.classList.add('cd-commentLayersContainer-parent-relative')
				}
				if (offsetParent) break
			}
			offsetParent ??= document.body
			offsetParent.classList.add('cd-commentLayersContainer-parent')
			let container = /** @type {HTMLElement} */ (offsetParent.firstElementChild)
			if (!container.classList.contains('cd-commentLayersContainer')) {
				container = document.createElement('div')
				container.classList.add('cd-commentLayersContainer')
				offsetParent.insertBefore(container, offsetParent.firstChild)

				container.cdIsTopLayersContainer = !container.parentElement?.parentElement?.closest(
					'.cd-commentLayersContainer-parent',
				)
			}
			this.layersContainer = container

			addToArrayIfAbsent(this.manager.layersContainers, container)
		}

		return this.layersContainer
	}

	/**
	 * Get the left and right margins of the comment layers or the expand note.
	 * {@link Comment#isStartStretched isStartStretched} and
	 * {@link Comment#isEndStretched isEndStretched} should have already been set.
	 *
	 * @returns {CommentMargins}
	 */
	getMargins() {
		let startMargin
		if (this.mhContainerListType === 'ol') {
			// `this.highlightables.length === 1` is a workaround for cases such as
			// https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#202005160930_Example.
			startMargin =
				this.highlightables.length === 1
					? cd.g.contentFontSize * 3.2
					: cd.g.contentFontSize * 2.2 - 1
		} else if (this.isStartStretched) {
			startMargin = controller.getContentColumnOffsets().startMargin
		} else {
			const marginElement = this.thread?.$expandNote?.[0] || this.marginHighlightable
			if (marginElement.parentElement?.classList.contains('cd-commentLevel')) {
				startMargin = -1 / cd.g.pixelDeviationRatioFor1px
			} else if (
				this.offset &&
				marginElement.parentElement?.parentElement?.classList.contains('cd-commentLevel')
			) {
				const prop = this.getDirection() === 'ltr' ? 'left' : 'right'
				startMargin =
					Math.abs(this.offset[prop] - marginElement.parentElement.getBoundingClientRect()[prop]) -
					1 / cd.g.pixelDeviationRatioFor1px
			} else {
				startMargin = this.level === 0 ? cd.g.commentFallbackSideMargin : cd.g.contentFontSize
			}
		}
		const endMargin = this.isEndStretched
			? controller.getContentColumnOffsets().startMargin
			: cd.g.commentFallbackSideMargin

		return {
			left: this.getDirection() === 'ltr' ? startMargin : endMargin,
			right: this.getDirection() === 'ltr' ? endMargin : startMargin,
		}
	}

	/**
	 * @typedef {object} ConfigureLayersOptionsExtension
	 * @property {boolean} [add=true] Add the layers in case they are created. If set to `false`, it
	 *   is expected that the layers created during this procedure, if any, will be added afterwards
	 *   (otherwise there would be layers without a parent element which would lead to bugs).
	 * @property {boolean} [update=true] Update the layers' offset in case the comment was displaced.
	 *   If set to `false`, it is expected that the offset will be updated afterwards.
	 * @property {import('./utils-window').ExtendedDOMRect[]} [floatingRects]
	 *   {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect Element#getBoundingClientRect}
	 *   results for floating elements from `convenientDiscussions.g.floatingElements`. It may be
	 *   calculated in advance for many elements in one sequence to save time.
	 */

	/**
	 * @typedef {ManageOffsetOptions & ConfigureLayersOptionsExtension} ConfigureLayersOptions
	 */

	/**
	 * Add the underlay and overlay if they are missing, update their styles, recalculate their offset
	 * and redraw if the comment was displaced or do nothing if everything is right.
	 *
	 * @param {ConfigureLayersOptions} [options]
	 * @returns {boolean | undefined} Was the comment displaced or created. `undefined` if we couldn't
	 *   determine (for example, if the element is invisible).
	 */
	configureLayers = (options = {}) => {
		options.add ??= true
		options.update ??= true

		// If layers don't exist, create them
		if (!this.layers) {
			this.createLayers()
			if (options.add) {
				this.addLayers()
			}

			return true
		}

		const displaced = this.layers.computeAndSaveOffset(options)
		if (displaced === undefined) return

		this.layers.updateStyles()
		if (displaced && options.update) {
			this.layers.updateOffset()
		}

		return displaced
	}

	/**
	 * Create the comment's underlay and overlay with contents.
	 * This method should be implemented by subclasses to create their specific layers and actions.
	 *
	 * @fires commentLayersCreated
	 * @abstract
	 * @protected
	 */
	createLayers() {
		throw new Error('createLayers must be implemented by subclasses')
	}

	/**
	 * _For internal use._ Add the (already existent) comment's layers to the DOM.
	 */
	addLayers() {
		this.layers?.add()
	}

	/**
	 * Set classes to the underlay, overlay, and other elements according to a comment flag.
	 *
	 * @param {import('./CommentFlagSet').CommentFlag} flag
	 * @param {boolean} add
	 * @protected
	 */
	updateClassesForFlag(flag, add) {
		this.layers?.updateClassesForFlag(flag, add)
	}

	/**
	 * Remove the comment's underlay and overlay.
	 */
	removeLayers() {
		if (!this.layers) return

		this.stopAnimations()
		this.handleUnhover(true)

		// TODO: add add/remove methods to commentManager.underlays
		removeFromArrayIfPresent(this.manager.underlays, this.layers.underlay)

		this.layers.destroy()
		const thisTyped = /** @type {any} */ (this)
		thisTyped.layers = undefined
	}

	/**
	 * Change the comment's background and marker color to a color of the provided comment flag for
	 * the given number of milliseconds, then smoothly change it back.
	 *
	 * @param {import('./CommentFlagSet').CommentFlag} flag
	 * @param {number} delay
	 */
	flash(flag, delay) {
		this.configureLayers()
		if (!this.layers) return

		this.layers.flash(flag, delay)
	}

	/**
	 * Flash the comment as a target (it is opened by a link, is the target of the up/down comment
	 * buttons, is scrolled to after pressing a navigation panel button, etc.).
	 */
	flashTarget() {
		this.flash('target', 1500)
	}

	/**
	 * Mark the comment as linked (opened via URL fragment) with persistent highlighting.
	 */
	markAsLinked() {
		this.addFlag('linked')
		this.configureLayers()
	}

	/**
	 * Flash the comment as changed and add it to the seen rendered edits list kept in the local
	 * storage.
	 */
	flashChanged() {
		this.willFlashChangedOnSight = false

		// Use the `changed` flag, not `new`, to get the `cd-comment-underlay-changed` class that helps
		// to set background if the user has switched off background highlighting for new comments.
		this.flash('changed', 1000)

		/**
		 * @typedef {object} SeenRenderedChange
		 * @property {string} htmlToCompare HTML content used for comparison.
		 * @property {number} seenTime Timestamp when the comment was seen, in milliseconds since the
		 *   Unix epoch.
		 */

		/**
		 * @typedef {{ [commentId: string]: SeenRenderedChange }} SeenRenderedChanges
		 */

		if (this.hasFlag('changed') && this.id) {
			const seenStorageItem = /** @type {StorageItemWithKeys<SeenRenderedChanges>} */ (
				new StorageItemWithKeys('seenRenderedChanges')
			)
			const seen = seenStorageItem.get(mw.config.get('wgArticleId')) || {}
			seen[this.id] = {
				htmlToCompare: /** @type {string} */ (this.htmlToCompare),
				seenTime: Date.now(),
			}
			seenStorageItem.set(mw.config.get('wgArticleId'), seen).save()
		}

		controller.maybeMarkPageAsRead()
	}

	/**
	 * Flash the comment as changed when it appears in sight.
	 */
	flashChangedOnSight() {
		this.willFlashChangedOnSight = true
		if (!document.hidden && this.isInViewport()) {
			this.flashChanged()
		}
	}

	/**
	 * _For internal use._ Stop all animations on the comment.
	 */
	stopAnimations() {
		if (!this.layers) return

		this.layers.$animatedBackground?.stop(true, true)
		this.layers.$marker.stop(true, true)
	}

	/**
	 * _For internal use._ Keep only those lines of a diff that are related to the comment.
	 *
	 * @param {string} body
	 * @param {Revision<['content']>[]} revisions
	 * @param {import('./updateChecker').CommentsData} commentsData
	 * @returns {JQuery}
	 */
	scrubDiff(body, revisions, commentsData) {
		/**
		 * @type {number[][]}
		 */
		const lineNumbers = [[], []]
		revisions.forEach((revision, i) => {
			const pageCode = /** @type {NonNullable<typeof revision.slots>} */ (revision.slots).main
				.content
			let source
			try {
				source = this.locateInCode(undefined, pageCode, commentsData[/** @type {0 | 1} */ (i)])
			} catch {
				return
			}
			const startLineNumber = countOccurrences(pageCode.slice(0, source.lineStartIndex), /\n/g) + 1
			// eslint-disable-next-line no-one-time-vars/no-one-time-vars
			const endLineNumber =
				startLineNumber +
				countOccurrences(pageCode.slice(source.lineStartIndex, source.signatureEndIndex), /\n/g)
			for (let j = startLineNumber; j <= endLineNumber; j++) {
				lineNumbers[i].push(j)
			}
		})

		/** @type {number[]} */
		const currentLineNumbers = []
		let cleanDiffBody = ''
		$(wrapDiffBody(body))
			.find('tr')
			.each((_, tr) => {
				const $tr = $(tr)
				const $lineNumbers = $tr.children('.diff-lineno')
				for (let j = 0; j < Math.min($lineNumbers.length, 2); j++) {
					currentLineNumbers[j] = extractNumeralAndConvertToNumber(
						$lineNumbers.eq(j).text(),
						cd.g.digits.user,
					)
					if (!currentLineNumbers[j]) {
						throw new CdError({
							type: 'parse',
						})
					}
				}
				if (!$tr.children('.diff-marker').length) return

				let addToDiff = false
				for (let j = 0; j < 2; j++) {
					if (
						!$tr
							.children()
							.eq(j * 2)
							.hasClass('diff-empty')
					) {
						if (lineNumbers[j].includes(currentLineNumbers[j])) {
							addToDiff = true
						}
						currentLineNumbers[j]++
					}
				}
				if (addToDiff) {
					cleanDiffBody += $tr[0].outerHTML
				}
			})

		return $(wrapDiffBody(cleanDiffBody))
	}

	/**
	 * Show a diff of changes in the comment between the current revision ID and the provided one.
	 *
	 * @param {number} olderRevisionId
	 * @param {number} newerRevisionId
	 * @param {import('./updateChecker').CommentsData} commentsData
	 * @throws {CdError}
	 * @private
	 */
	async showDiff(olderRevisionId, newerRevisionId, commentsData) {
		const [revisions, body] = await Promise.all([
			this.getSourcePage().getRevisions({
				revids: [olderRevisionId, newerRevisionId],
				rvprop: ['content'],
			}),
			this.getSourcePage().compareRevisions(olderRevisionId, newerRevisionId),
			mw.loader.using(['mediawiki.diff', 'mediawiki.diff.styles']),
		])
		if (!revisions) {
			throw new CdError({
				type: 'response',
				message: cd.sParse('comment-diff-error'),
			})
		}

		const $cleanDiff = this.scrubDiff(body, revisions, commentsData)
		if (!$cleanDiff.find('.diff-deletedline, .diff-addedline').length) {
			throw new CdError({
				type: 'parse',
				code: 'emptyDiff',
				message: cd.sParse('comment-diff-empty'),
			})
		}

		const $message = $('<div>')
			.append(
				$cleanDiff,
				$('<div>')
					.addClass('cd-commentDiffView-below')
					.append(
						$('<a>')
							.attr(
								'href',
								cd.page.getUrl({
									oldid: olderRevisionId,
									diff: newerRevisionId,
								}),
							)
							.attr('target', '_blank')

							// Make it work in https://www.mediawiki.org/wiki/Instant_Diffs
							.attr('data-instantdiffs-link', 'event')

							.text(cd.s('comment-diff-full')),
						cd.sParse('dot-separator'),
						$('<a>')
							.attr('href', cd.page.getUrl({ action: 'history' }))
							.attr('target', '_blank')
							.text(cd.s('comment-diff-history')),
					),
			)
			.children()
		OO.ui.alert($message, {
			title: cd.s('comment-diff-title'),
			size: 'larger',
		})

		// FIXME: "wikipage.content hook should not be fired on unattached content".
		mw.hook('wikipage.content').fire($message)
	}

	/**
	 * @overload
	 * @param {'changed' | 'changedSince'} type
	 * @param {boolean} isNewVersionRendered
	 * @param {number} comparedRevisionId
	 * @param {import('./updateChecker').CommentsData} commentsData
	 * @returns {void}
	 *
	 * @overload
	 * @param {'deleted'} type
	 * @returns {void}
	 */

	/**
	 * Update the comment's properties, add a small note next to the signature saying the comment has
	 * been changed or deleted, and change the comment's styling if it has been.
	 *
	 * @param {'changed' | 'changedSince' | 'deleted'} type Type of the mark.
	 * @param {boolean} [isNewVersionRendered] Is the new version of the comment rendered
	 *   (successfully updated or, for `changedSince` type, has been a new one from the beginning).
	 * @param {number} [comparedRevisionId] ID of the revision to compare with when the user clicks to
	 *   see the diff.
	 * @param {import('./updateChecker').CommentsData} [commentsData] Data of the comments as of the
	 *   current revision and the revision to compare with.
	 */
	markAsChanged(type, isNewVersionRendered, comparedRevisionId, commentsData) {
		let stringName
		switch (type) {
			case 'changed':
			default:
				this.addFlag('changed')
				stringName = 'comment-changed'
				break

			case 'changedSince':
				this.isChangedSincePreviousVisit = true
				stringName = 'comment-changedsince'
				break

			case 'deleted':
				this.addFlag('deleted')
				stringName = 'comment-deleted'
				break
		}
		const refreshLink = isNewVersionRendered
			? undefined
			: new Button({
					label: cd.s('comment-changed-refresh'),
					action: () => {
						controller.rebootPage(type === 'deleted' || !this.id ? {} : { commentIds: [this.id] })
					},
				})

		const currentRevisionId = mw.config.get('wgRevisionId')
		const diffLink =
			this.getSourcePage().isCurrent() && type !== 'deleted'
				? new Button({
						label: cd.s('comment-diff'),
						action: async () => {
							const diffLinkTyped = /** @type {Button} */ (diffLink)
							diffLinkTyped.setPending(true)
							try {
								await this.showDiff(
									/** @type {number} */ (
										type === 'changedSince' ? comparedRevisionId : currentRevisionId
									),
									/** @type {number} */ (
										type === 'changedSince' ? currentRevisionId : comparedRevisionId
									),
									/** @type {NonNullable<typeof commentsData>} */ (commentsData),
								)
							} catch (error) {
								let text = cd.sParse('comment-diff-error')
								/** @type {string | undefined} */
								let code
								if (error instanceof CdError) {
									const message = error.getMessage()
									if (message) {
										text = message
									} else if (error.getType() === 'network') {
										text += ' ' + cd.sParse('error-network')
									}
									code = error.getCode()
								}
								mw.notify(wrapHtml(text), { type: code === 'emptyDiff' ? 'info' : 'error' })
							}
							diffLinkTyped.setPending(false)
						},
					})
				: undefined

		const { noteText, refreshLinkSeparator, diffLinkSeparator } = this.getChangeNoteSeparators(
			stringName,
			refreshLink,
		)

		this.$changeNote?.remove()

		const $changeNote = $('<span>').addClass('cd-changeNote').text(noteText)
		if (refreshLink) {
			$changeNote.append(refreshLinkSeparator, refreshLink.element)
		} else {
			$changeNote.addClass('cd-changeNote-newVersionRendered')
		}
		if (diffLink) {
			$changeNote.append(diffLinkSeparator, diffLink.element)
		}

		this.addChangeNote($changeNote)

		if (isNewVersionRendered) {
			this.flashChangedOnSight()
		}

		if (this.countEditsAsNewComments && (type === 'changed' || type === 'changedSince')) {
			this.isSeenBeforeChanged ??= this.isSeen
			this.isSeen = false
			this.manager.registerSeen()
		}

		// Layers are supposed to be updated (deleted comments background, repositioning) separately,
		// see updateChecker~checkForNewChanges(), for example.
	}

	/**
	 * Add a note that the comment has been changed. Handles common setup, then delegates to subclass
	 * implementation.
	 *
	 * @param {JQuery} $changeNote
	 * @private
	 */
	addChangeNote($changeNote) {
		this.$changeNote = $changeNote
		this.addChangeNoteImpl($changeNote)
	}

	/**
	 * Implementation-specific logic for adding change note.
	 * This method should be overridden by subclasses.
	 *
	 * @param {JQuery} _$changeNote
	 * @protected
	 */
	addChangeNoteImpl(_$changeNote) {
		// Default implementation - will be overridden by subclasses
	}

	/**
	 * Update the comment's properties, remove the edit mark added in {@link Comment#markAsChanged}
	 * and flash the comment as changed if it has been (reset to the original version, or unchanged,
	 * in this case).
	 *
	 * @param {'changed'|'deleted'} type Type of the mark.
	 */
	unmarkAsChanged(type) {
		switch (type) {
			case 'changed':
			default:
				this.removeFlag('changed')
				break
			case 'deleted':
				this.removeFlag('deleted')

				// commentManager.maybeRedrawLayers(), that is called on DOM updates, could circumvent
				// this comment if it has no property signalling that it should be highlighted, so we update
				// its styles manually.
				this.layers?.updateStyles()

				break
		}

		this.$changeNote?.remove()
		delete this.$changeNote

		if (
			this.countEditsAsNewComments &&
			this.isSeen === false &&
			this.isSeenBeforeChanged === true
		) {
			this.isSeen = true
			this.isSeenBeforeChanged = undefined
			this.manager.emit('registerSeen')
		}

		if (type === 'changed') {
			// The change was reverted and the user hasn't seen the change - no need to flash the comment.
			if (this.willFlashChangedOnSight) {
				this.willFlashChangedOnSight = false
				controller.maybeMarkPageAsRead()
			} else if (this.id) {
				const seenStorageItem = new StorageItemWithKeys('seenRenderedChanges')
				const seen = seenStorageItem.get(mw.config.get('wgArticleId')) || {}
				delete seen[this.id]
				seenStorageItem.set(mw.config.get('wgArticleId'), seen).save()

				this.flashChangedOnSight()
			}
		}
	}

	/**
	 * _For internal use._ Live-update the comment's content.
	 *
	 * @param {import('./updateChecker').CommentWorkerMatched} currentComment Data about the comment
	 *   in the current revision as delivered by the worker.
	 * @param {import('./updateChecker').CommentWorkerMatched} newComment Data about the comment in
	 *   the new revision as delivered by the worker.
	 * @returns {boolean} Was the update successful.
	 */
	liveUpdate(currentComment, newComment) {
		this.htmlToCompare = newComment.htmlToCompare

		const elementNames = [...this.$elements].map((el) => el.tagName)
		const elementClassNames = [...this.$elements].map((el) => el.className)

		if (
			// Are there references? References themselves may be out of the comment's HTML and might be
			// edited.
			!newComment.hiddenElementsData.some((data) => data.type === 'reference') &&
			// Are style tags kept? If a style element is replaced with a link element, we can't replace
			// HTML.
			(!newComment.hiddenElementsData.length ||
				newComment.hiddenElementsData.every(
					(data) => data.type !== 'templateStyles' || data.tagName === 'STYLE',
				) ||
				currentComment.hiddenElementsData.every(
					(data) => data.type !== 'templateStyles' || data.tagName !== 'STYLE',
				)) &&
			areObjectsEqual(elementNames, newComment.elementNames)
		) {
			// TODO: support non-Arabic digits (e.g. fa.wikipedia.org). Also not sure square brackets are
			// the same everywhere.
			const match = this.$elements.find('.autonumber').text().match(/\d+/)
			let currentAutonumber = match ? Number(match[0]) : 1
			newComment.elementHtmls.forEach((html, i) => {
				html = html.replace(
					/\u0001(\d+)_\w+\u0002/g,
					(_, num) => newComment.hiddenElementsData[num - 1].html,
				)
				if (
					getHeadingLevel({
						tagName: elementNames[i],
						className: elementClassNames[i],
					})
				) {
					const $headline = this.$elements.eq(i).find('.mw-headline, :header')
					if ($headline.length) {
						const $html = $(html)
						$headline.html($html.html())
						this.section?.update($html)
					}
				} else {
					const $element = this.$elements.eq(i)
					// eslint-disable-next-line no-one-time-vars/no-one-time-vars
					const newElement = this.replaceElement($element, html)
					if ($element.hasClass('cd-hidden')) {
						$(newElement).addClass('cd-hidden')
					}
				}
			})
			this.$elements.find('.autonumber').each((_, el) => {
				$(el).text(`[${currentAutonumber}]`)
				currentAutonumber++
			})
			this.$elements.attr('data-cd-comment-index', this.index)

			this.teardownOnboardOntoToggleChildThreadsPopup()
			this.initializeCommentStructure()

			mw.hook('wikipage.content').fire(this.$elements)

			delete this.cachedText
			delete this.$changeNote

			return true
		}

		return false
	}

	/**
	 * Scroll to the comment if it is not in the viewport. See also {@link Comment#scrollTo}.
	 *
	 * @param {'top'|'center'|'bottom'} alignment Where should the element be positioned relative to
	 *   the viewport.
	 */
	scrollIntoView = (alignment) => {
		;(this.editForm?.$element || this.$elements).cdScrollIntoView(alignment)
	}

	/**
	 * Scroll to the comment and (by default) flash it as a target. See also
	 * {@link Comment#scrollIntoView}.
	 *
	 * @param {ScrollToConfig} [options]
	 */
	scrollTo({
		smooth = true,
		expandThreads = false,
		flash = true,
		pushState = false,
		callback,
		alignment,
	} = {}) {
		if (expandThreads) {
			this.expandAllThreadsDownTo()
		}

		const id = this.getUrlFragment()
		if (pushState && id) {
			history.pushState({ ...history.state, cdLinkedComment: false, cdTargetComment: true }, '')
		}

		if (this.isCollapsed) {
			const visibleExpandNote = /** @type {JQuery} */ (this.getVisibleExpandNote())
			visibleExpandNote.cdScrollIntoView(alignment || 'top', smooth, callback)
			const $message = wrapHtml(cd.sParse('navpanel-firstunseen-hidden', '$1'), {
				callbacks: {
					'cd-notification-expandThread': () => {
						this.scrollTo({
							smooth,
							expandThreads: true,
							flash,
							pushState,
							callback,
						})
						notification.close()
					},
					'cd-notification-markThreadAsRead': () => {
						const threadTyped = /** @type {import('./Thread').default} */ (this.thread)
						threadTyped.getComments().forEach((comment) => {
							comment.isSeen = true
						})
						this.manager.emit('registerSeen')
						this.manager.goToFirstUnseenComment()
						notification.close()
					},
				},
			})
			if (this.isSeen) {
				$message.find('.cd-notification-markThreadAsRead').remove()
			}
			const notification = mw.notification.notify($message, {
				title: cd.s('navpanel-firstunseen-hidden-title'),
				tag: 'cd-commentInCollapsedThread',
			})
		} else {
			const offset = this.manageOffset({ considerFloating: true })
			;(this.editForm?.$element || this.$elements).cdScrollIntoView(
				alignment ||
					(this.isOpeningSection() ||
					this.editForm ||
					(offset && offset.bottom !== offset.bottomForVisibility)
						? 'top'
						: 'center'),
				smooth,
				callback,
			)
			if (flash) {
				this.flashTarget()
			}
		}
	}

	/**
	 * Scroll to the parent comment of the comment.
	 */
	goToParent() {
		const parent = this.getParent()

		if (!parent) {
			cd.debug.logError('This comment has no parent.')

			return
		}

		parent.scrollTo({ pushState: true })
		parent.setTargetChild(this)
		parent.maybeAddGoToChildButton()
	}

	/**
	 * Collapse children comments' threads if they are expanded (at least one of them); expand if
	 * collapsed.
	 */
	toggleChildThreads() {
		this.getChildren().at(0)?.thread?.toggleWithSiblings()
	}

	/**
	 * _For internal use._ Generate a JQuery object containing an edit summary, diff body, and link to
	 * the next diff.
	 *
	 * @returns {Promise<JQuery>}
	 */
	async generateDiffView() {
		const edit = await this.findEdit()
		const diffLink = await this.getDiffLink()

		return $('<div>')
			.addClass('cd-diffView-diff')
			.append(
				$('<div>')
					.append(
						$('<a>')
							.addClass('cd-diffView-nextDiffLink')
							.attr('href', diffLink.replace(/&diff=(\d+)/, '&oldid=$1&diff=next'))
							.attr('target', '_blank')

							// Make it work in https://www.mediawiki.org/wiki/Instant_Diffs
							.attr('data-instantdiffs-link', 'event')

							.text(cd.mws('nextdiff')),
					)
					.append(
						cd.sParse('cld-summary'),
						cd.mws('colon-separator'),
						wrapHtml(edit.revision.parsedcomment, { targetBlank: true }).addClass('comment'),
					),
				wrapDiffBody(edit.diffBody),
			)
	}

	/**
	 * Open a copy link dialog (rarely, copy a link to the comment without opening a dialog).
	 *
	 * @param {JQuery.TriggeredEvent | MouseEvent | KeyboardEvent} event
	 */
	copyLink = (event) => {
		controller.showCopyLinkDialog(this, event)
	}

	/**
	 * Find the edit that added the comment.
	 *
	 * @returns {Promise<DiffMatch>}
	 * @throws {CdError}
	 * @private
	 */
	async findEdit() {
		if (!this.addingEdit) {
			if (!this.hasTimestamp()) {
				throw new CdError({
					type: 'internal',
				})
			}

			// Search for the edit in the range of 10 minutes before (in case the comment was edited with
			// timestamp replaced) to 3 minutes after (a rare occasion where the diff timestamp is newer
			// than the comment timestamp).
			const revisions = await this.getSourcePage()
				.getArchivedPage()
				.getRevisions({
					rvprop: ['ids', 'comment', 'parsedcomment', 'timestamp'],
					rvdir: 'newer',
					rvstart: new Date(this.date.getTime() - cd.g.msInMin * 10).toISOString(),
					rvend: new Date(this.date.getTime() + cd.g.msInMin * 3).toISOString(),
					rvuser: this.author.getName(),
					rvlimit: 500,
				})

			if (!revisions) {
				throw new CdError({
					type: 'response',
				})
			}

			/**
			 * @typedef {object} ApiResponseCompare
			 * @property {object} compare
			 * @property {string} compare.body
			 */

			const responses = /** @type {ApiResponseCompare[]} */ (
				await Promise.all(
					// "Compare" requests
					revisions.map((revision) =>
						cd
							.getApi()
							.post({
								action: 'compare',
								fromtitle: this.getSourcePage().getArchivedPage().name,
								fromrev: revision.revid,
								torelative: 'prev',
								prop: ['diff'],
							})
							.catch(handleApiReject),
					),
				)
			)
			const diffMatches = await this.findDiffMatches(
				responses.map((resp) => resp.compare.body),
				revisions,
			)
			diffMatches.sort((m1, m2) =>
				m1.wordOverlap === m2.wordOverlap
					? m1.dateProximity - m2.dateProximity
					: m2.wordOverlap - m1.wordOverlap,
			)
			if (
				!diffMatches.length ||
				(diffMatches[0].wordOverlap === diffMatches[1]?.wordOverlap &&
					diffMatches[0].dateProximity === diffMatches[1].dateProximity)
			) {
				throw new CdError({
					type: 'parse',
				})
			}

			// Cache the successful result.
			this.addingEdit = diffMatches[0]
		}

		return this.addingEdit
	}

	/**
	 * @typedef {object} DiffMatch
	 * @property {Revision<['ids', 'comment', 'parsedcomment', 'timestamp']>} revision
	 * @property {string} diffBody
	 * @property {number} wordOverlap
	 * @property {number} dateProximity
	 */

	/**
	 * Find matches of the comment with diffs that might have added it.
	 *
	 * @param {string[]} compareBodies
	 * @param {Revision<['ids', 'comment', 'parsedcomment', 'timestamp']>[]} revisions
	 * @returns {Promise<DiffMatch[]>}
	 */
	async findDiffMatches(compareBodies, revisions) {
		// Only analyze added lines except for headings. `diff-empty` is not always present, so we stick
		// to colspan="2" as an indicator.
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const regexp =
			/<td [^>]*colspan="2" class="[^"]*\bdiff-side-deleted\b[^"]*"[^>]*>\s*<\/td>\s*<td [^>]*class="[^"]*\bdiff-marker\b[^"]*"[^>]*>\s*<\/td>\s*<td [^>]*class="[^"]*\bdiff-addedline\b[^"]*"[^>]*>\s*<div[^>]*>(?!=)(.+?)<\/div>\s*<\/td>/g

		const commentFullText = this.getText(false) + ' ' + this.signatureText
		const matches = []
		for (const [i, diffBody] of compareBodies.entries()) {
			// Currently even empty diffs have newlines and a comment.
			if (!diffBody) continue

			const revision = revisions[i]

			// Compare diff _parts_ with added text in case multiple comments were added with the edit.
			let match
			let diffOriginalText = ''
			let diffText = ''
			let bestDiffPartWordOverlap = 0
			while ((match = regexp.exec(diffBody))) {
				const diffPartText = removeWikiMarkup(decodeHtmlEntities(match[1]))
				const diffPartWordOverlap = calculateWordOverlap(diffPartText, commentFullText)
				if (diffPartWordOverlap > bestDiffPartWordOverlap) {
					bestDiffPartWordOverlap = diffPartWordOverlap
				}
				diffText += diffPartText + '\n'
				diffOriginalText += match[1] + '\n'
			}
			if (!diffOriginalText.trim()) continue

			let wordOverlap = Math.max(
				calculateWordOverlap(diffText, commentFullText),
				bestDiffPartWordOverlap,
			)

			// Parse wikitext if there is no full overlap and there are templates inside.
			if (wordOverlap < 1 && diffOriginalText.includes('{{')) {
				try {
					const parseCodeResponse = await parseCode(diffOriginalText, { title: cd.page.name })
					diffOriginalText = $('<div>').append(parseCodeResponse.html).cdGetText()
				} catch {
					throw new CdError({
						type: 'parse',
					})
				}
				wordOverlap = calculateWordOverlap(diffOriginalText, commentFullText)
			}

			matches.push({
				revision,
				diffBody,
				wordOverlap,
				dateProximity: Math.abs(
					/** @type {Date} */ (this.date).getTime() - new Date(revision.timestamp).setSeconds(0),
				),
			})
		}

		return matches
	}

	/**
	 * Get a diff link for the comment.
	 *
	 * @param {'standard'|'short'|'wikilink'} [format] Format to get the link in.
	 * @returns {Promise.<string>}
	 */
	async getDiffLink(format = 'standard') {
		const editRevisionId = (await this.findEdit()).revision.revid
		if (format === 'standard') {
			const urlEnding = decodeURI(cd.page.getArchivedPage().getUrl({ diff: editRevisionId }))

			return `${cd.g.server}${urlEnding}`
		} else if (format === 'short') {
			return `${cd.g.server}/?diff=${editRevisionId}`
		}

		const specialPageName =
			mw.config.get('wgFormattedNamespaces')[-1] + ':' + cd.g.specialPageAliases.Diff[0]

		return `[[${specialPageName}/${editRevisionId}]]`
	}

	/**
	 * Consider the comment thanked (rename the button and set other parameters).
	 *
	 * @private
	 */
	setThanked() {
		this.actions?.setThanked()
	}

	/**
	 * Process thank error.
	 *
	 * @param {CdError|Error} error
	 * @private
	 */
	thankFail(error) {
		let type
		let code
		if (error instanceof CdError) {
			type = error.getType()
			code = error.getCode()
		}
		/** @type {string} */
		let text
		const historyUrl = this.getSourcePage().getArchivedPage().getUrl({ action: 'history' })
		switch (type) {
			case 'parse': {
				text =
					cd.sParse('error-diffnotfound') +
					' ' +
					cd.sParse('error-diffnotfound-history', historyUrl)
				break
			}

			case 'network': {
				text = cd.sParse('error-diffnotfound') + ' ' + cd.sParse('error-network')
				break
			}

			default: {
				if (code === 'noData') {
					text =
						cd.sParse('error-diffnotfound') +
						' ' +
						cd.sParse('error-diffnotfound-history', historyUrl)
				} else {
					text = cd.sParse('thank-error')
					cd.debug.logWarn(error)
				}
				break
			}
		}

		mw.notify(wrapHtml(text, { targetBlank: true }), { type: 'error' })
		const thankButtonTyped = /** @type {import('./CommentButton').default} */ (
			this.actions?.thankButton
		)
		thankButtonTyped.setPending(false)
	}

	/**
	 * Thank for the comment using the DiscussionTools' thank API if available and the regular thank
	 * API if not.
	 */
	async thank() {
		const id = this.getUrlFragment()
		if (!this.actions?.thankButton || !id) return

		this.actions.thankButton.setPending(true)
		let accepted
		try {
			const versionMatch = /^(\d+\.\d+).*/.exec(mw.config.get('wgVersion'))
			accepted = await (!this.dtId || (versionMatch && Number(versionMatch[1]) < 1.43)
				? this.thankLegacy()
				: this.thankStandard())
		} catch (error) {
			this.thankFail(/** @type {Error|CdError} */ (error))

			return
		} finally {
			this.actions.thankButton.setPending(false)
		}

		if (accepted) {
			mw.notify(cd.s('thank-success'), { type: 'success', autoHide: true })
			this.setThanked()

			this.manager
				.getThanksStorage()
				.set(id, {
					thankTime: Date.now(),
				})
				.save()
		}
	}

	/**
	 * For DiscussionTools versions that don't support the thank API: Find the edit that added the
	 * comment, ask for a confirmation, and send a "thank you" notification.
	 *
	 * @returns {Promise<boolean>}
	 */
	async thankLegacy() {
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const loadThanksExtensionPromise = mw.loader.using('ext.thanks')
		const [edit] = await Promise.all([
			this.findEdit(),
			cd.g.genderAffectsUserString ? loadUserGenders([this.author]) : Promise.resolve(),
			mw.loader.using(['mediawiki.diff', 'mediawiki.diff.styles']),
		])
		const editRevisionId = edit.revision.revid

		const $question = wrapHtml(
			cd.sParse(
				'thank-confirm',
				this.author.getName(),
				this.author,
				this.getSourcePage().getArchivedPage().getUrl({ diff: editRevisionId }),
				mw.user,
			),
			{
				tagName: 'div',
				targetBlank: true,
			},
		)
		$question.find('a').attr('data-instantdiffs-link', 'event')
		const $diffView = await this.generateDiffView()

		const accepted =
			!cd.settings.get('confirmThanks') ||
			(await showConfirmDialog(mergeJquery($question, $diffView), { size: 'larger' })) === 'accept'
		if (accepted) {
			await cd
				.getApi()
				.postWithEditToken(
					cd.getApi().assertCurrentUser({
						action: 'thank',
						rev: editRevisionId,
						source: cd.config.scriptCodeName,
					}),
				)
				.catch(handleApiReject)

			// This isn't critical (affects only the "thanked" label in history), so we don't do anything
			// in case of an error
			loadThanksExtensionPromise.then(() => {
				mw.thanks.thanked.push(editRevisionId)
			})
		}

		return accepted
	}

	/**
	 * Ask for a confirmation to thank for the comment, and send a "thank you" notification if
	 * confirmed.
	 *
	 * @returns {Promise<boolean>}
	 */
	async thankStandard() {
		const accepted =
			!cd.settings.get('confirmThanks') ||
			(await showConfirmDialog(wrapHtml(cd.mws('thanks-confirmation2', mw.user)))) === 'accept'
		if (accepted) {
			/**
			 * @typedef {object} ApiResponseDtThank
			 * @property {object} result
			 * @property {boolean} result.success
			 * @property {string} result.error
			 */

			/** @type {ApiResponseDtThank} */
			const response = await cd
				.getApi()
				.postWithEditToken(
					cd.getApi().assertCurrentUser({
						action: 'discussiontoolsthank',
						page: cd.page.name,
						commentid: this.dtId,
					}),
				)
				.catch(handleApiReject)

			if (!response.result.success) {
				throw new CdError({
					type: 'response',
					details: { error: response.result.error },
				})
			}
		}

		return accepted
	}

	/**
	 * Create a {@link Comment#replyForm reply form} for the comment.
	 *
	 * @param {object} [initialState]
	 * @param {import('./CommentForm').default} [commentForm]
	 */
	reply(initialState, commentForm) {
		if (this.replyForm) return

		if (this.manager.getByIndex(this.index + 1)?.isOutdented && this.section) {
			let replyForm = this.section.replyForm
			if (replyForm?.targetWithOutdentedReplies === this) {
				replyForm.$element.cdScrollIntoView('center')
				replyForm.commentInput.focus()
			} else {
				if (!replyForm) {
					replyForm = this.section.reply({ targetWithOutdentedReplies: this })
				}
				const selection = window.getSelection()
				if (selection.type !== 'Range') {
					const range = this.createSelectionRange()
					selection.removeAllRanges()
					selection.addRange(range)
				}
				replyForm.quote(true, this, true)
			}

			return
		}

		/**
		 * Reply form related to the comment.
		 *
		 * @type {import('./CommentForm').default|undefined}
		 */
		this.replyForm = commentFormManager.setupCommentForm(
			this,
			{
				mode: 'reply',
			},
			initialState,
			commentForm,
		)
	}

	/**
	 * Create a selection range for the comment.
	 * Uses template method pattern to get start and end points from subclasses.
	 *
	 * @returns {Range}
	 */
	createSelectionRange() {
		const range = document.createRange()
		const { startNode, startOffset } = this.getSelectionStartPoint()
		const { endNode, endOffset } = this.getSelectionEndPoint()

		range.setStart(startNode, startOffset)
		range.setEnd(endNode, endOffset)

		return range
	}

	/**
	 * Get the start point for selection range.
	 * This method should be overridden by subclasses.
	 *
	 * @returns {{ startNode: Node, startOffset: number }}
	 * @protected
	 */
	getSelectionStartPoint() {
		// Default implementation - will be overridden by subclasses
		return { startNode: document.body, startOffset: 0 }
	}

	/**
	 * Get the end point for selection range.
	 * This method should be overridden by subclasses.
	 *
	 * @returns {{ endNode: Node, endOffset: number }}
	 * @protected
	 */
	getSelectionEndPoint() {
		// Default implementation - will be overridden by subclasses
		return { endNode: document.body, endOffset: 0 }
	}

	/**
	 * Make sure the selection doesn't include any subsequent text even though it doesn't look like
	 * this (e.g. Chrome includes subsequent text on triple click; if you try quotting the last
	 * comment on the page without running fixSelection(), the `NewPP limit report` comment will be
	 * included).
	 */
	fixSelection() {
		const endBoundary = this.getSelectionEndBoundary()
		if (endBoundary) {
			limitSelectionAtEndBoundary(endBoundary)
			this.cleanupSelectionEndBoundary(endBoundary)
		}
	}

	/**
	 * Get the end boundary element for selection limiting.
	 * This method should be overridden by subclasses.
	 *
	 * @returns {Element | undefined}
	 * @protected
	 */
	getSelectionEndBoundary() {
		// Default implementation - will be overridden by subclasses
		return undefined
	}

	/**
	 * Clean up the end boundary element after selection limiting.
	 * This method can be overridden by subclasses if cleanup is needed.
	 *
	 * @param {Element} _endBoundary
	 * @protected
	 */
	cleanupSelectionEndBoundary(_endBoundary) {
		// Default implementation - no cleanup needed
	}

	/**
	 * Create an {@link Comment#editForm edit form} for the comment.
	 *
	 * @param {object} [initialState] See {@link CommentForm}'s constructor.
	 * @param {import('./CommentForm').default} [commentForm]
	 * @returns {import('./CommentForm').default}
	 */
	edit(initialState, commentForm) {
		// Check for existence in case the editing is initiated from a script of some kind (there is no
		// button to call it from CD when the form is displayed).
		if (!this.editForm) {
			/**
			 * Edit form related to the comment.
			 *
			 * @type {import('./CommentForm').default|undefined}
			 */
			this.editForm = commentFormManager.setupCommentForm(
				this,
				{
					mode: 'edit',
				},
				initialState,
				commentForm,
			)
		}

		return this.editForm
	}

	/**
	 * Load the comment's source code.
	 *
	 * @param {import('./CommentForm').default} [commentForm] Comment form, if it is submitted or code
	 *   changes are viewed.
	 * @returns {Promise<CommentSource | undefined>}
	 * @throws {CdError|Error}
	 */
	async loadCode(commentForm) {
		let source
		let isSectionSubmitted = false
		try {
			if (commentForm && this.section?.liveSectionNumber !== undefined) {
				try {
					const sectionCode = await this.section.requestCode()
					this.section.locateInCode(sectionCode)
					source = this.locateInCode(sectionCode)
					isSectionSubmitted = true
				} catch (error) {
					if (
						!(
							error instanceof CdError &&
							['noSuchSection', 'locateSection', 'locateComment'].includes(error.getCode() || '')
						)
					) {
						throw error
					}
				}
			}
			try {
				if (!isSectionSubmitted) {
					await this.getSourcePage().loadCode()
					source = this.locateInCode()
				}
			} catch (error) {
				if (
					!commentForm ||
					!commentForm.isCommentTarget() ||
					!this.dtId ||
					!(
						error instanceof CdError &&
						['noSuchSection', 'locateSection', 'locateComment'].includes(error.getCode() || '')
					)
				) {
					throw error
				}

				// Try DiscussionTools API fallback
				source = await this.locateUsingDiscussionTools()
			}
		} catch (error) {
			if (error instanceof CdError) {
				error.setMessage(cd.sParse('cf-error-getpagecode'))
			}
			throw error
		}
		commentForm?.setSectionSubmitted(isSectionSubmitted)

		return source
	}

	/**
	 * Make sure the comment is known on a page using the DiscussionTools API as a fallback.
	 *
	 * @throws {CdError}
	 * @returns {Promise<CommentSource | undefined>}
	 * @private
	 */
	async locateUsingDiscussionTools() {
		/**
		 * @typedef {object} ApiResponseDtPageInfo
		 * @property {object} discussiontoolspageinfo
		 * @property {Partial<{ [id: string]: boolean | string }>} discussiontoolspageinfo.transcludedfrom
		 */

		/** @type {ApiResponseDtPageInfo} */
		const response = await cd
			.getApi()
			.get({
				action: 'discussiontoolspageinfo',
				page: cd.page.name,
				oldid: mw.config.get('wgRevisionId'),
			})
			.catch(handleApiReject)

		const transcludedFrom =
			response.discussiontoolspageinfo.transcludedfrom[/** @type {string} */ (this.dtId)]
		if (transcludedFrom === undefined) {
			throw new CdError({
				type: 'response',
				code: 'noData',
			})
		}

		const dtTranscludedFrom =
			typeof transcludedFrom === 'boolean'
				? transcludedFrom
				: /** @type {import('./Page').default} */ (pageRegistry.get(transcludedFrom))

		try {
			if (dtTranscludedFrom === true) {
				throw new CdError({
					type: 'parse',
					code: 'cantReply',
				})
			}
			if (dtTranscludedFrom === false) return

			// Load the transcluded page code. Shouldn't use dtTranscludedFrom (without `this.`) here to
			// prevent a race condition if this.dtTranscludedFrom suddenly gets overriden elsewhere.
			await dtTranscludedFrom.loadCode()
			try {
				this.source = this.locateInCode(undefined, dtTranscludedFrom.source.getCode())

				return this.source
			} catch {
				throw new CdError({
					type: 'parse',
					code: 'locateComment',
				})
			}
		} finally {
			// Set the property and emit the event only after we obtained or not obtained the source to
			// make sure Comment#dtTranscludedFrom (used in Comment#getSourcePage()) is 100% synced with
			// CommentForm#targetPage. Otherwise, the current page may end up rewritten with the
			// transcluded one. We should also watch out that there is no awaiting between
			// Comment#modifyContext() (which uses Comment#dtTranscludedFrom as the context page) and
			// submitting the form (which edits CommentForm#targetPage; but could just as well edit
			// Comment#dtTranscludedFrom if we choose to refactor) since if we emit the event right in the
			// middle of the awaiting, that would result in dissynchronization. Different stuff may want
			// run the current method at different times, e.g. a reply form and an edit form opened for
			// the same comment.
			this.dtTranscludedFrom = dtTranscludedFrom
			this.emit('transclusionFound', dtTranscludedFrom)
		}
	}

	/**
	 * Add a comment form {@link CommentForm#getTarget targeted} at this comment to the page.
	 *
	 * @param {import('./CommentForm').CommentFormMode} mode
	 * @param {import('./CommentForm').default} commentForm
	 */
	addCommentFormToPage(mode, commentForm) {
		if (mode === 'reply') {
			const { $wrappingItem } = this.addSubitem('replyForm', 'top')
			$wrappingItem.append(commentForm.$element)
		} else if (mode === 'edit') {
			// We use a class, not .hide(), here because there can be elements in the comment that are
			// hidden from the beginning and should stay so when reshowing the comment.
			this.$elements.addClass('cd-hidden').data('cd-comment-form', commentForm)
			this.handleUnhover()
			if (this.isOpeningSection()) {
				this.section.hideBar()
			}

			commentForm.$element.toggleClass(
				'cd-commentForm-highlighted',
				this.hasFlag('new') || this.hasFlag('own'),
			)

			let $outermostElement
			const $first = this.$elements.first()
			if ($first.is('dd, li')) {
				const outerWrapperTag = $first[0].tagName.toLowerCase()
				$outermostElement = $(`<${outerWrapperTag}>`).addClass('cd-commentForm-outerWrapper')
				$outermostElement.append(commentForm.$element)
			} else {
				$outermostElement = commentForm.$element
			}

			// We insert the form before the comment so that if the comment ends on a wrong level, the
			// form is on a right one. The exception is comments that open a section (otherwise a bug will
			// be introduced that will manifest when opening an "Add subsection" form of the previous
			// section).
			if (this.isOpeningSection()) {
				this.$elements.last().after($outermostElement)
			} else {
				this.$elements.first().before($outermostElement)
			}
		}
	}

	/**
	 * Clean up traces of a comment form {@link CommentForm#getTarget targeted} at this comment from
	 * the page.
	 *
	 * @param {import('./CommentForm').CommentFormMode} mode
	 * @param {import('./CommentForm').default} commentForm
	 */
	cleanUpCommentFormTraces(mode, commentForm) {
		if (mode === 'reply') {
			this.subitemList.remove('replyForm')
			this.scrollIntoView('top')
		} else if (mode === 'edit') {
			commentForm.$element.parent('.cd-commentForm-outerWrapper').remove()
			this.$elements.removeClass('cd-hidden').removeData('cd-comment-form')
			if (this.isOpeningSection()) {
				this.section.$bar?.removeClass('cd-hidden')
			}

			// Wait until the comment form is removed - its presence can e.g. affect the presence of a
			// scrollbar, therefore the comment's offset.
			setTimeout(this.configureLayers)

			// Wait until the comment form is unregistered
			setTimeout(() => {
				this.scrollIntoView('top')
			})
		}
	}

	/**
	 * Determine if the comment is in the viewport. Return `null` if we couldn't get the comment's
	 * offset.
	 *
	 * @param {boolean} partially Return `true` even if only a part of the comment is in the viewport.
	 * @param {CommentOffset | undefined} [offset] Prefetched offset.
	 * @returns {boolean | undefined}
	 */
	isInViewport(partially = false, offset = this.manageOffset()) {
		if (!offset) {
			return
		}

		const scrollY = window.scrollY
		const viewportTop = scrollY + controller.getBodyScrollPaddingTop()
		const viewportBottom = scrollY + window.innerHeight

		return partially
			? offset.bottomForVisibility > viewportTop && offset.top < viewportBottom
			: offset.top >= viewportTop && offset.bottomForVisibility <= viewportBottom
	}

	/**
	 * Mark the comment as seen, and also {@link Comment#flash flash} comments that are set to flash.
	 *
	 * @param {'forward'|'backward'} [registerAllInDirection] Mark all comments in the forward or
	 *   backward direction from this comment as seen.
	 * @param {boolean} [flash] Whether to flash the comment as a target.
	 */
	registerSeen(registerAllInDirection, flash = false) {
		const isInVewport = !registerAllInDirection || this.isInViewport()
		if (this.isSeen === false && isInVewport) {
			this.isSeen = true
			if (flash) {
				this.flashTarget()
			}
		}

		if (this.willFlashChangedOnSight && isInVewport) {
			this.flashChanged()
		}

		if (
			registerAllInDirection &&
			// Makes sense to register further?
			this.manager.getAll().some((comment) => comment.isSeen || comment.willFlashChangedOnSight)
		) {
			// eslint-disable-next-line no-one-time-vars/no-one-time-vars
			const change = registerAllInDirection === 'backward' ? -1 : 1
			const nextComment = this.manager.getByIndex(this.index + change)
			if (nextComment && nextComment.isInViewport() !== false) {
				nextComment.registerSeen(registerAllInDirection, flash)
			}
		}
	}

	/**
	 * Comment elements as a jQuery object.
	 *
	 * Uses a getter because elements of a comment can be altered after creating an instance, for
	 * example with {@link Comment#replaceElement}. Using a getter also allows to save a little time
	 * on running `$()`, although that alone is perhaps not enough to create it.
	 *
	 * @type {JQuery}
	 */
	get $elements() {
		this.cached$elements ??= $(this.elements)

		return this.cached$elements
	}

	// eslint-disable-next-line jsdoc/require-jsdoc
	set $elements(value) {
		this.cached$elements = value
		this.elements = value.get()
	}

	/**
	 * @overload
	 * @param {HTMLElement} element
	 * @param {HTMLElement} newElementOrHtml
	 * @returns {HTMLElement}
	 *
	 * @overload
	 * @param {JQuery} element
	 * @param {HTMLElement|string} newElementOrHtml
	 * @returns {HTMLElement}
	 */

	/**
	 * Replace an element that is one of the comment's elements with another element or HTML string.
	 *
	 * @param {HTMLElement|JQuery} element Element to replace. Provide a native element only if we're
	 *   in the page processing phase (and {@link Comment#$elements} has not been requested, hence
	 *   cached yet).
	 * @param {HTMLElement|string} newElementOrHtml Element or HTML string to replace with.
	 * @returns {HTMLElement}
	 */
	replaceElement(element, newElementOrHtml) {
		const nativeElement = element instanceof HTMLElement ? element : element[0]
		let newElement
		if (typeof newElementOrHtml === 'string') {
			// eslint-disable-next-line no-one-time-vars/no-one-time-vars
			const index = [.../** @type {HTMLElement} */ (nativeElement.parentElement).children].indexOf(
				nativeElement,
			)
			// eslint-disable-next-line no-one-time-vars/no-one-time-vars
			const parentElement = /** @type {HTMLElement} */ (nativeElement.parentElement)
			nativeElement.outerHTML = newElementOrHtml
			newElement = /** @type {HTMLElement} */ (parentElement.children[index])
		} else {
			newElement = newElementOrHtml
			nativeElement.replaceWith(newElement)
		}

		// When we set .$elements, the setter automatically sets .elements. But not vice versa except
		// when .$elements is not ready yet.
		if (element instanceof HTMLElement) {
			this.elements.splice(this.elements.indexOf(element), 1, newElement)
		} else {
			this.$elements = this.$elements.not(nativeElement).add(newElement)
		}

		if (this.highlightables.includes(nativeElement)) {
			this.highlightables.splice(this.highlightables.indexOf(nativeElement), 1, newElement)
			this.bindEvents(newElement)
		}
		if (this.marginHighlightable === nativeElement) {
			this.marginHighlightable = newElement
		}

		return newElement
	}

	/**
	 * Get the comment's text.
	 *
	 * @param {boolean} [cleanUpSignature] Whether to clean up the signature.
	 * @returns {string}
	 */
	getText(cleanUpSignature = true) {
		if (this.cachedText === undefined) {
			const $dummy = $('<div>').append(
				this.$elements.not(':header, .mw-heading').clone().removeClass('cd-hidden'),
			)
			const selectorParts = [
				'.cd-signature',
				'.cd-changeNote',
				'.noprint',
				'.cd-comment-header',
				'.cd-comment-menu',
			]
			if (cd.config.unsignedClass) {
				selectorParts.push(`.${cd.config.unsignedClass}`)
			}
			$dummy.find(selectorParts.join(', ')).remove()
			let text = $dummy.cdGetText()
			if (cleanUpSignature) {
				if (cd.g.signatureEndingRegexp) {
					text = text.replace(cd.g.signatureEndingRegexp, '')
				}

				// FIXME: We use the same regexp to clean both the wikitext and the render. With the current
				// default config value the side effects seem to be negligable, but who knows...
				if (cd.config.signaturePrefixRegexp) {
					text = text.replace(cd.config.signaturePrefixRegexp, '')
				}
			}

			this.cachedText = text
		}

		return this.cachedText
	}

	/**
	 * Search for the comment in the source code and return possible matches.
	 *
	 * @param {string} contextCode
	 * @param {import('./updateChecker').CommentWorkerBase} [commentData]
	 * @param {boolean} [isInSectionContext]
	 * @returns {CommentSource|undefined}
	 * @private
	 */
	searchInCode(contextCode, commentData, isInSectionContext = false) {
		let thisData
		if (commentData) {
			thisData = {
				index: commentData.index,

				// For the reserve method; the main method uses one date.
				previousComments: commentData.previousComments,

				followsHeading: commentData.followsHeading,
				sectionHeadline: commentData.section?.headline,
				commentText: commentData.text,
			}
		} else {
			const comments = isInSectionContext
				? /** @type {import('./Section').default} */ (this.section).comments
				: this.manager.getAll()
			const index = comments.indexOf(this)
			thisData = {
				index,
				previousComments: comments.slice(Math.max(0, index - 2), index).reverse(),
				followsHeading: this.followsHeading,
				sectionHeadline: this.section?.headline,
				commentText: this.getText(),
			}
		}

		const signatures = extractSignatures(contextCode)

		return signatures
			.filter(
				(signature) =>
					(signature.author === this.author || signature.author.getName() === '<undated>') &&
					(this.timestamp === signature.timestamp ||
						// .startsWith() to account for cases where you can ignore the timezone string in
						// "unsigned" templates (it may be present and may be not), but it appears on the page.

						(this.timestamp &&
							signature.timestamp &&
							this.timestamp.startsWith(signature.timestamp))),
			)
			.map((signature) => new CommentSource(this, signature, contextCode, isInSectionContext))
			.map((source, _, sources) => source.calculateMatchScore(thisData, sources, signatures))
			.filter((sourcesWithScores) => sourcesWithScores.score > 2.5)
			.sort((s1, s2) => s2.score - s1.score)[0]?.source
	}

	/**
	 * @overload
	 * @param {string|undefined} [sectionCode]
	 * @returns {CommentSource}
	 *
	 * @overload
	 * @param {undefined} [sectionCode]
	 * @param {string} code
	 * @param {import('./updateChecker').CommentWorkerMatched} [commentData]
	 * @returns {CommentSource}
	 */

	/**
	 * Locate the comment in the section or page source code and, if no `codeOrUseSectionCode` is
	 * passed, set the resultant {@link CommentSource} object to the {@link Comment#source} property.
	 * Otherwise, return the result.
	 *
	 * It is expected that the section or page code is loaded (using {@link Page#loadCode}) before
	 * this method is called. Otherwise, the method will throw an error.
	 *
	 * @param {string|undefined} [sectionCode] Section code to use instead of the page code, to locate
	 *   the comment in.
	 * @param {string} [code] Wikitext that should have the comment (provided only if we need to
	 *   perform operations on some code that is not the code of a section or page). Implies
	 *   `sectionCode` is not set.
	 * @param {import('./updateChecker').CommentWorkerMatched} [commentData] Comment data for
	 *   comparison (can be set together with `code`).
	 * @returns {CommentSource}
	 * @throws {CdError}
	 */
	locateInCode(sectionCode, code, commentData) {
		const customCodePassed = typeof code === 'string'
		if (!customCodePassed) {
			code = sectionCode || this.getSourcePage().source.getCode()
			this.source = undefined
		}

		if (code === undefined) {
			throw new CdError({
				type: 'parse',
				code: 'noCode',
			})
		}

		const source = this.searchInCode(code, commentData, Boolean(sectionCode))
		if (!source) {
			throw new CdError({
				type: 'parse',
				code: 'locateComment',
			})
		}

		if (!customCodePassed) {
			this.source = source
		}

		return source
	}

	/**
	 * Request the gender of the comment's author if it is absent and affects the user mention string
	 * and do something when it's received.
	 *
	 * @param {() => void} callback
	 * @param {boolean} [runAlways] Whether to execute the callback even if the gender request
	 *   is not needed.
	 */
	async maybeRequestAuthorGender(callback, runAlways = false) {
		if (cd.g.genderAffectsUserString && this.author.isRegistered() && !this.author.getGender()) {
			let errorCallback
			if (!this.genderRequest) {
				this.genderRequest = loadUserGenders([this.author])
				errorCallback = (/** @type {Error} */ error) => {
					cd.debug.logWarn(`Couldn't get the gender of user ${this.author.getName()}.`, error)
				}
			}
			if (!this.genderRequestCallbacks.includes(callback)) {
				this.genderRequest.then(callback, errorCallback)
				this.genderRequestCallbacks.push(callback)
			}
		} else if (runAlways) {
			await sleep()
			callback()
		}
	}

	/**
	 * Get the wiki page that has the source code of the comment (may be different from the current
	 * page if the comment is transcluded from another page).
	 *
	 * @returns {import('./Page').default}
	 */
	getSourcePage() {
		return typeof this.dtTranscludedFrom !== 'boolean' && this.dtTranscludedFrom !== undefined
			? this.dtTranscludedFrom
			: this.section
				? this.section.getSourcePage()
				: cd.page
	}

	/**
	 * For a comment in a collapsed thread, get the visible collapsed note. (Collapsed threads may be
	 * nested, so there can be a number of invisible collapsed notes for a comment.) If the visible
	 * collapsed note is unavailable, return the top invisible collapsed note.
	 *
	 * @returns {JQuery | undefined}
	 * @private
	 */
	getVisibleExpandNote() {
		if (!this.isCollapsed) {
			return
		}

		let $note
		for (let t = this.collapsedThread; t; t = t.rootComment.getParent()?.collapsedThread) {
			$note = t.$expandNote
			if ($note?.is(':visible')) break
		}

		return $note
	}

	/**
	 * Get a link to the comment with Unicode sequences decoded.
	 *
	 * @param {boolean} [permanent] Get a permanent URL.
	 * @returns {string | undefined}
	 */
	getUrl(permanent = false) {
		const id = this.getUrlFragment()

		return id ? cd.page.getDecodedUrlWithFragment(id, permanent) : undefined
	}

	/**
	 * The elements are structured this way:
	 * - Outer wrapper item element (`<dd>`, `<li>`, rarely `<div>`) - present sometimes.
	 *   - Wrapping list element (`<ul>`) - present sometimes.
	 *     - Wrapping item element (`<li>`) - present always.
	 *
	 * See the comment inside the method for details.
	 *
	 * @typedef {object} SubitemElements
	 * @property {JQuery} $wrappingItem
	 * @property {JQuery} [$wrappingList]
	 * @property {JQuery} [$outerWrapper]
	 * @memberof Comment
	 * @inner
	 */

	/**
	 * Add an item to the comment's {@link CommentSubitemList subitem list}.
	 *
	 * @param {string} name
	 * @param {'top'|'bottom'} position
	 * @returns {SubitemElements}
	 */
	addSubitem(name, position) {
		/*
		 * There are 3 basic cases that we account for:
		 * 1.   : Comment.
		 *      [End of thread]
		 *    We create a list and an item in it. We also create an item next to the existent item and
		 *    wrap the list in it. We don't add the list to the existent item because that item can be a
		 *    comment part in its entirety, so at least highlighting would be broken if we do.
		 * 2.   Comment.
		 *      [No replies, no "Reply to section" button]
		 *    We create a list and an item in it.
		 * 3.   Comment.
		 *      : Reply or "Reply to section" button.
		 *    or
		 *      : Comment.
		 *      :: Reply.
		 *    (this means `<dl>` next to `<div>` which is a similar case to the previous one).
		 *    We create an item in the existent list.
		 *
		 * The lists can be of other type, not necessarily `:`.
		 *
		 * The resulting structure is:
		 *   Outer wrapper item element (`<dd>`, `<li>`, rarely `<div>`) - in case 1.
		 *     Wrapping list element (`<ul>`) - in cases 1 and 2.
		 *       Wrapping item element (`<li>`) - in cases 1, 2, and 3.
		 */

		let $lastOfTarget = this.$elements.last()
		let $existingWrappingList

		if (position === 'bottom') {
			// The list can be broken, so we need to find the last list containing the children of the
			// comment.
			const descendants = this.getChildren(true)
			const $test = descendants
				.at(-1)
				?.$elements.last()
				.closest(`.cd-commentLevel-${this.level + 1}`)

			// Logically, the element should always be there when there are descendants, but nevertheless.
			if ($test?.length) {
				$existingWrappingList = $test

				// Can be empty, but it doesn't matter to us. What matters is that $lastOfTarget is not an
				// item element.
				$lastOfTarget = $test.prev()
			}
		}

		let wrappingItemTag = 'dd'
		let createList = true
		let outerWrapperTag

		let $anchor = $existingWrappingList || $lastOfTarget.next()
		const $anchorFirstChild = $anchor.children().first()
		if ($anchor.is('dd, li') && $anchorFirstChild.hasClass('cd-commentLevel')) {
			// A relatively rare case possible when two adjacent lists are merged with
			// Comment#mergeAdjacentCommentLevels, for example when replying to
			// https://en.wikipedia.org/wiki/Wikipedia:Village_pump_(policy)#202103271157_Uanfala.
			$anchor = $anchorFirstChild
		}
		if ($anchor.is('dl, ul, ol')) {
			createList = false
			wrappingItemTag = $anchor.is('dl') ? 'dd' : 'li'
			$anchor.addClass(`cd-commentLevel cd-commentLevel-${this.level + 1}`)
		} else if ($lastOfTarget.is('li, dd')) {
			outerWrapperTag = $lastOfTarget[0].tagName.toLowerCase()
		}

		const $wrappingItem = $(`<${wrappingItemTag}>`)
		const $wrappingList = createList
			? $('<dl>')
					.append($wrappingItem)
					.addClass(`cd-commentLevel cd-commentLevel-${this.level + 1}`)
			: undefined

		let $outerWrapper
		if (outerWrapperTag) {
			$outerWrapper = $(`<${outerWrapperTag}>`)

			// Why `.cd-commentLevel >`: reply to a pseudo-comment added with this diff with a mistake:
			// https://ru.wikipedia.org/?diff=113073013.
			if ($lastOfTarget.is('.cd-commentLevel:not(ol) > li, .cd-commentLevel > dd')) {
				$outerWrapper.addClass('cd-connectToPreviousItem')
			}

			const wrappingListTyped = /** @type {JQuery} */ ($wrappingList)
			wrappingListTyped.appendTo($outerWrapper)
		}

		if ($outerWrapper) {
			$outerWrapper.insertAfter($lastOfTarget)

			if ($lastOfTarget.closest('dl, ul, ol').is('ol')) {
				$outerWrapper.addClass('cd-skip')
				const $next = $outerWrapper.next()

				// Layout bug where not all children are `li`s:
				// https://ru.wikipedia.org/wiki/Википедия:Заявки_на_статус_администратора/Евгений_Юрьев#Против
				$next.attr(
					'value',
					[...$outerWrapper.parent().children('li:not(.cd-skip)')].indexOf($next[0]) + 1,
				)
			}
		} else if ($wrappingList) {
			$wrappingList.insertAfter($lastOfTarget)
		} else if (position === 'top') {
			$wrappingItem.addClass('cd-skip').attr('value', 0).prependTo($anchor)
		} else {
			const $last = $anchor.children().last()

			// "Reply to section" button should always be the last.
			if ($last.hasClass('cd-replyButtonWrapper')) {
				$wrappingItem.insertBefore($last)
			} else {
				$wrappingItem.insertAfter($last)
			}
		}

		this.subitemList.add(name, $wrappingItem)

		return { $wrappingItem, $wrappingList, $outerWrapper }
	}

	/**
	 * Get a section relevant to this comment which means the same value as {@link Comment#section}.
	 * (Used for polymorphism with {@link Section#getRelevantSection} and
	 * {@link Page#getRelevantSection}.)
	 *
	 * @returns {import('./Section').default | undefined}
	 */
	getRelevantSection() {
		return this.section
	}

	/**
	 * Get a comment relevant to this comment which means the comment itself. (Used for polymorphism
	 * with {@link Section#getRelevantComment} and {@link Page#getRelevantComment}.)
	 *
	 * @returns {Comment}
	 */
	getRelevantComment() {
		return this
	}

	/**
	 * Get the data identifying the comment when restoring a comment form. (Used for polymorphism with
	 * {@link Section#getIdentifyingData} and {@link Page#getIdentifyingData}.)
	 *
	 * @returns {AnyByKey}
	 */
	getIdentifyingData() {
		return { id: this.id }
	}

	/**
	 * Get the fragment for use in URLs and wikilinks for this comment. It's DT's ID, if it's
	 * available, of CD's standard ID (still used in links from pages listing edits and for comments
	 * that weren't recognized by DT).
	 *
	 * @returns {string | undefined}
	 */
	getUrlFragment() {
		return this.dtId || this.id
	}

	/**
	 * Get the chain of ancestors of the comment as an array, starting with the parent comment.
	 *
	 * @returns {Comment[]}
	 */
	getAncestors() {
		const ancestors = []
		for (
			let /** @type {Comment | undefined} */ comment = this;
			comment;
			comment = comment.getParent()
		) {
			ancestors.push(comment)
		}

		return ancestors.slice(1)
	}

	/**
	 * Recursively expand threads if the comment is in a collapsed thread.
	 */
	expandAllThreadsDownTo() {
		;[this, ...this.getAncestors()]
			.map((comment) => comment.thread)
			.filter(defined)
			.filter((thread) => thread.isCollapsed)
			.forEach((thread) => {
				thread.expand()
			})
	}

	/**
	 * Set the `new` {@link CommentFlagSet comment} and {@link Comment#isSeen} property for the
	 * comment given the list of the current page visits.
	 *
	 * @param {string[]} currentPageVisits
	 * @param {number} currentTime
	 * @param {Comment} [unseenComment] Unseen comment with the same ID as this one passed from the
	 *   previous session.
	 * @returns {boolean} Whether there is a time conflict.
	 */
	initNewAndSeen(currentPageVisits, currentTime, unseenComment) {
		// Let's take 3 minutes as a tolerable time discrepancy.
		if (
			!this.date ||
			// Is the comment date in the future?
			this.date.getTime() > Date.now() + cd.g.msInMin * 3
		) {
			this.removeFlag('new')
			this.isSeen = true

			return false
		}

		const commentTime = Math.floor(this.date.getTime() / 1000)

		// Add 60 seconds to the comment time because it doesn't have seconds whereas the visit time
		// has. See also timeConflict in BootProcess#processVisits(). Unseen comment might be not new if
		// it's a *changed* old comment.
		if (commentTime + 60 > Number(currentPageVisits[0]) || unseenComment?.hasFlag('new')) {
			this.addFlag('new')
		} else {
			this.removeFlag('new')
		}
		this.isSeen =
			(commentTime + 60 <= Number(currentPageVisits[currentPageVisits.length - 1]) ||
				this.hasFlag('own')) &&
			!unseenComment

		if (unseenComment?.isChangedSincePreviousVisit && unseenComment.$changeNote) {
			this.addChangeNote(unseenComment.$changeNote)
			if (unseenComment.willFlashChangedOnSight) {
				this.flashChangedOnSight()
			}
		}

		return commentTime <= currentTime && currentTime < commentTime + 60
	}

	/**
	 * _For internal use._ Apply a very specific fix for cases when an indented comment starts with a
	 * list like this:
	 *
	 * ```html
	 * : Comment. [signature]
	 * :* Item
	 * :* Item
	 * : Comment end. [signature]
	 * ```
	 *
	 * which gives the following DOM:
	 *
	 * ```html
	 * <dd>
	 *   <div>Comment. [signature]</div>
	 *   <ul>
	 *     <li>Item</li>
	 *     <li>Item</li>
	 *   </ul>
	 * </dd>
	 * <dd>Comment end. [signature]</dd>
	 * ```
	 *
	 * The code splits the parent item element (`dd` in this case) into two and puts the list in the
	 * second one. This fixes the thread feature behavior among other things.
	 */
	maybeSplitParent() {
		if (this.index === 0) return

		const previousComment = /** @type {Comment} */ (this.manager.getByIndex(this.index - 1))
		if (this.level !== previousComment.level) return

		const previousCommentLastElement = previousComment.elements[previousComment.elements.length - 1]
		const potentialElement = previousCommentLastElement.nextElementSibling
		if (
			previousCommentLastElement.parentElement &&
			['DD', 'LI'].includes(previousCommentLastElement.parentElement.tagName) &&
			previousCommentLastElement.tagName === 'DIV' &&
			potentialElement === this.elements[0] &&
			potentialElement.tagName === 'DIV'
		) {
			previousComment.parser.splitParentAfterNode(
				/** @type {Node} */ (potentialElement.previousSibling),
			)
		}
	}

	/**
	 * If this comment is replied to, get the comment that will end up directly above the reply.
	 *
	 * @returns {Comment}
	 */
	getCommentAboveCommentToBeAdded() {
		return this.getChildren(true).at(-1) || this
	}

	/**
	 * After the page is reloaded and this instance doesn't relate to a rendered comment on the page,
	 * get the instance of this comment that does.
	 *
	 * @returns {Comment | undefined}
	 */
	findNewSelf() {
		if (!this.id) {
			return
		}

		return this.manager.getById(this.id)
	}

	/**
	 * Get the name of the comment's method creating a comment form with the specified mode. Used for
	 * polymorphism with {@link Section}.
	 *
	 * @param {import('./CommentForm').CommentFormMode} mode
	 * @returns {string}
	 */
	getCommentFormMethodName(mode) {
		return mode
	}

	/**
	 * Collapse the comment in a thread.
	 *
	 * @param {import('./Thread').default} thread
	 * @returns {number | undefined} If the comment is already collapsed, the index of the last comment in the
	 *   collapsed thread.
	 */
	collapse(thread) {
		if (this.thread?.isCollapsed && this.thread !== thread) {
			return this.thread.lastComment.index
		}
		this.isCollapsed = true
		this.collapsedThread = thread
		this.removeLayers()

		return
	}

	/**
	 * Expand the comment in a thread.
	 *
	 * @returns {number | undefined} If the comment is collapsed, the index of the last comment in the collapsed
	 *   thread.
	 */
	expand() {
		if (this.thread?.isCollapsed) {
			return this.thread.lastComment.index
		}
		this.isCollapsed = false
		this.collapsedThread = undefined
		this.configureLayers()

		return
	}

	/**
	 * _For internal use._ Change the selected state of the comment: is text in it selected or not.
	 *
	 * @param {boolean} selected
	 */
	setSelected(selected) {
		this.isSelected = selected
		if (selected && this.isActionable) {
			this.configureLayers()
		}
	}

	/**
	 * _For internal use._ Remove DT's event listener from its comment link and attach ours.
	 */
	handleDtTimestampClick() {
		if (!this.id) return

		this.$elements.find('.ext-discussiontools-init-timestamplink').off().on('click', this.copyLink)
	}

	/**
	 * Get the sibling comments - all children of a parent, whether the parent is a comment or
	 * section.
	 *
	 * @returns {Comment[]}
	 */
	getSiblingsAndSelf() {
		return (
			this.getParent()?.getChildren() ||
			(this.section
				? this.section.commentsInFirstChunk.filter((comment) => !comment.getParent())
				: // Parentless comments in the lead section
					this.manager.query((comment) => !comment.section && !comment.getParent()))
		)
	}

	/**
	 * Get the placeholder for the comment form's headline input.
	 *
	 * Used for polymorphism with {@link Section#getCommentFormHeadlineInputPlaceholder} and
	 * {@link Page#getCommentFormHeadlineInputPlaceholder}.
	 *
	 * @param {import('./CommentForm').CommentFormMode} mode
	 * @returns {string}
	 */
	getCommentFormHeadlineInputPlaceholder(mode) {
		const parentSection = this.section?.getParent()
		if (mode === 'edit' && parentSection) {
			return cd.s('cf-headline-subsection', parentSection.headline)
		}

		return cd.s('cf-headline-topic')
	}

	/**
	 * Get the placeholder for the comment form's comment input.
	 *
	 * Used for polymorphism with {@link Section#getCommentFormCommentInputPlaceholder} and
	 * {@link Page#getCommentFormCommentInputPlaceholder}.
	 *
	 * @param {import('./CommentForm').CommentFormMode} mode
	 * @param {() => void} callback
	 * @returns {string | undefined}
	 */
	getCommentFormCommentInputPlaceholder(mode, callback) {
		if (mode === 'edit') {
			return ''
		}

		if (this.isOpeningSection()) {
			return cd.s('cf-comment-placeholder-replytosection', this.section.headline)
		}

		this.maybeRequestAuthorGender(callback, true)

		return
	}

	/**
	 * Check if the comment is deletable.
	 *
	 * @returns {boolean}
	 */
	isDeletable() {
		return this.isOpeningSection() ? this.section.comments.length === 1 : !this.getChildren().length
	}

	/**
	 * Get the comment that is visually a target of the comment form that has the comment as target.
	 *
	 * Used for polymorphism with {@link Section#getCommentFormTargetComment} and
	 * {@link Page#getCommentFormTargetComment}.
	 *
	 * @returns {this | undefined}
	 */
	getCommentFormTargetComment() {
		return this
	}

	// hasTimestamp() is inherited from CommentSkeleton

	/**
	 * Check if this comment opens a section and has a reference to it.
	 *
	 * @returns {this is Comment<true>}
	 */
	isOpeningSection() {
		return this.openingSection
	}

	/**
	 * Check if the comment has any flags that indicate it should be highlighted.
	 *
	 * @returns {boolean}
	 */
	hasAnyFlag() {
		return this.flags.hasAny()
	}

	/**
	 * Get the flags that affect the comment's visual styling.
	 *
	 * @returns {Array<{name: import('./CommentFlagSet').CommentFlag, value: boolean}>}
	 */
	getStyleFlags() {
		return this.flags.getStyleFlags()
	}

	/** @type {RegExp} */
	static dtIdRegexp

	static {
		// Doesn't account for cases when the section headline ends with -<number>.
		const newDtTimestampPattern = String.raw`(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})\d{2}`
		const oldDtTimestampPattern = String.raw`(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z)`

		this.dtIdRegexp = new RegExp(
			`^c-` +
				`(?:(.+?)-(?:${newDtTimestampPattern}|${oldDtTimestampPattern}))` +
				`(?:-(?:(.+?)-(?:${newDtTimestampPattern}|${oldDtTimestampPattern})|(.+?))` +
				`(?:-(\\d+))?)?$`,
		)
	}

	/**
	 * Clear the linked state by removing URL parameters and clearing linked comments.
	 */
	static clearLinkedState = () => {
		const url = new URL(location.href)
		if (
			url.hash ||
			url.searchParams.has('dtnewcomments') ||
			url.searchParams.has('dtnewcommentssince')
		) {
			url.searchParams.delete('dtnewcomments')
			url.searchParams.delete('dtnewcommentssince')
			url.searchParams.delete('dtinthread')
			url.searchParams.delete('dtsincethread')
			url.hash = ''
			history.pushState(null, '', url)
		}

		commentManager.clearLinkedComments()
	}

	/**
	 * Mark a group of comments as linked on load, optionally scrolling to the first and replacing the URL state.
	 *
	 * @param {Comment[]} comments The comments to mark as linked.
	 * @param {boolean} [scroll] Whether to scroll to the first comment.
	 * @param {boolean} [replaceState] Whether to replace the URL fragment with the first comment's dtId.
	 */
	static async markAsLinkedOnLoad(comments, scroll = true, replaceState = true) {
		if (!comments.length) return

		// sleep() is for Firefox - for some reason, without it Firefox positions the underlay
		// incorrectly. (TODO: does it still? Need to check.)
		await sleep()

		comments.forEach((comment) => {
			comment.markAsLinked()
		})

		if (scroll) {
			comments[0].scrollTo({
				smooth: false,
				expandThreads: true,
				flash: false,
			})
		}

		// Replace CD's comment ID in the fragment with DiscussionTools' if available. In any case, add
		// the state.
		if (replaceState) {
			history.replaceState(
				{ ...history.state, cdTargetComment: false, cdLinkedComment: true },
				'',
				comments[0].dtId ? `#${comments[0].dtId}` : undefined,
			)
		}

		document.body.addEventListener('click', this.clearLinkedState, { once: true })
	}

	/**
	 * Create the user info card button element.
	 *
	 * @returns {HTMLAnchorElement} The created button element
	 */
	static createUserInfoCardButton() {
		const button = document.createElement('a')

		// Set attributes
		button.role = 'button'
		button.setAttribute('tabindex', '0')
		button.setAttribute('aria-label', cd.mws('checkuser-userinfocard-toggle-button-aria-label'))
		button.setAttribute('aria-haspover', 'dialog')
		button.className =
			'ext-checkuser-userinfocard-button cdx-button cdx-button--action-default cdx-button--weight-quiet cdx-button--fake-button cdx-button--fake-button--enabled cdx-button--icon-only cd-comment-author-userInfoCard-button'

		// Create and append the icon span
		const iconSpan = document.createElement('span')
		iconSpan.className =
			'cdx-button__icon ext-checkuser-userinfocard-button__icon ext-checkuser-userinfocard-button__icon--userAvatar'
		button.append(iconSpan)

		return button
	}

	/**
	 * Get the bounding client rectangle for a comment part.
	 *
	 * @param {Element} el
	 * @returns {import('./utils-window').AnyDOMRect}
	 * @private
	 */
	static getCommentPartRect(el) {
		let rect
		// In most skins, <ul> and <ol> tags have markers in the margin, not padding, area, unlike in
		// native browser styles, so we include margins in the coordinates for them.
		if (['UL', 'OL'].includes(el.tagName)) {
			rect = getExtendedRect(el)
			rect.left = rect.outerLeft
			rect.right = rect.outerRight
		} else {
			rect = el.getBoundingClientRect()
		}

		return rect
	}

	/**
	 * @typedef {Map<
	 *   import('./shared/SectionSkeleton').SectionBase | undefined,
	 *   import('./shared/CommentSkeleton').CommentBase[]
	 * >} MapFromSectionToComments
	 */

	/**
	 * Turn a Comment[] into a map with Section as keys.
	 *
	 * @overload
	 * @param {Comment[]} comments
	 * @returns {Map<import('./Section').default | undefined, Comment[]>}
	 */

	/**
	 * Turn a CommentWorkerMatched[] into a map with SectionWorkerMatched as keys.
	 *
	 * @overload
	 * @param {import('./updateChecker').CommentWorkerMatched[]} comments
	 * @returns {import('./updateChecker').AddedComments['bySection']}
	 */

	/**
	 * Turn a comment array into an object with sections or their IDs as keys.
	 *
	 * @param {import('./shared/CommentSkeleton').CommentBase[]} comments
	 * @returns {MapFromSectionToComments}
	 */
	static groupBySection(comments) {
		const map = /** @type {MapFromSectionToComments} */ (new Map())
		for (const comment of comments) {
			if (!map.has(comment.section)) {
				map.set(comment.section, [])
			}
			const sectionComments = /** @type {import('./shared/CommentSkeleton').CommentBase[]} */ (
				map.get(comment.section)
			)
			sectionComments.push(comment)
		}

		return map
	}

	/**
	 * @typedef {Map<Comment | import('./Section').default, import('./updateChecker').CommentWorkerNew[]>} WorkerCommentsByRenderedParent
	 */

	/**
	 * Turn an array of comments that came from the web worker into a map with their parent comments
	 * or sections (the actual ones on the page, not the ones from the web worker) as keys.
	 *
	 * @param {import('./updateChecker').CommentWorkerNew[]} comments
	 * @returns {WorkerCommentsByRenderedParent}
	 */
	static groupByParent(comments) {
		const commentsByParent = /** @type {WorkerCommentsByRenderedParent} */ (new Map())
		comments.forEach((comment) => {
			let key
			if (comment.parent) {
				key = comment.parentMatch
			} else {
				// If there is no section match, use the ancestor sections' section match.
				for (
					let s = /** @type {import('./updateChecker').SectionWorkerMatched | undefined} */ (
						comment.section
					);
					s && !key;
					s = s.parent
				) {
					key = s.match
				}
			}

			// Indirect comment children and comments out of section
			if (!key) return

			if (!commentsByParent.get(key)) {
				commentsByParent.set(key, [])
			}
			const parentComments = /** @type {import('./updateChecker').CommentWorkerNew[]} */ (
				commentsByParent.get(key)
			)
			parentComments.push(comment)
		})

		return commentsByParent
	}

	/**
	 * @typedef {object} ParseIdReturn
	 * @property {Date} date
	 * @property {string} author
	 * @inner
	 */

	/**
	 * Extract a date and author from a comment ID. Currently doesn't extract the index (if there are
	 * multiple comments with the same timestamp on the page), but it hasn't been needed yet in the
	 * script.
	 *
	 * @param {string} id
	 * @returns {ParseIdReturn | undefined}
	 */
	static parseId(id) {
		const match = id.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})_(.+)$/)
		if (!match) {
			return
		}

		return {
			date: new Date(
				Date.UTC(
					Number(match[1]),
					Number(match[2]) - 1,
					Number(match[3]),
					Number(match[4]),
					Number(match[5]),
				),
			),
			author: underlinesToSpaces(match[6]),
		}
	}

	/**
	 * Parse a comment ID in the DiscussionTools format.
	 *
	 * @param {string} id Comment ID in the DiscussionTools format.
	 * @returns {{
	 *   author: string
	 *   date: Date
	 *   parentAuthor?: string
	 *   parentDate?: Date
	 *   sectionIdBeginning: string
	 *   index?: number
	 * } | undefined}
	 */
	static parseDtId(id) {
		const match = id.match(this.dtIdRegexp)
		if (!match) {
			return
		}

		const parseTimestamp = (/** @type {number} */ startIndex) => ({
			author: underlinesToSpaces(match[startIndex]),
			date: match[startIndex + 1]
				? new Date(
						Date.UTC(
							Number(match[startIndex + 1]),
							Number(match[startIndex + 2]) - 1,
							Number(match[startIndex + 3]),
							Number(match[startIndex + 4]),
							Number(match[startIndex + 5]),
						),
					)
				: new Date(match[startIndex + 6]),
		})

		const { author, date } = parseTimestamp(1)
		const { author: parentAuthor, date: parentDate } = match[8] ? parseTimestamp(8) : {}

		return {
			author,
			date,
			parentAuthor,
			parentDate,
			sectionIdBeginning: match[15],
			index: match[16] ? Number(match[16]) : undefined,
		}
	}

	/**
	 * _For internal use._ Initialize prototypes of elements and OOUI widgets.
	 *
	 * This method is intended to be overridden by subclasses.
	 */
	static initPrototypes() {
		// Does nothing by default.
	}

	/**
	 * Scroll to the first comment in the list, but flash all of them.
	 *
	 * @param {Comment[]} comments
	 * @param {ScrollToConfig} [scrollToConfig]
	 */
	static scrollToFirstFlashAll(comments, scrollToConfig) {
		comments[0].scrollTo({
			flash: false,
			pushState: true,
			callback: () => {
				comments.forEach((comment) => {
					comment.flashTarget()
				})
			},
			...scrollToConfig,
		})
	}
}

export default Comment
