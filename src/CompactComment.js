import Comment from './Comment'
import CommentLayers from './CommentLayers'
import CompactCommentActions from './CompactCommentActions'
import CompactCommentLayers from './CompactCommentLayers'
import LiveTimestamp from './LiveTimestamp'
import PrototypeRegistry from './PrototypeRegistry'
import commentManager from './commentManager'
import cd from './loader/cd'
import { isInline } from './shared/utils-general'

/**
 * A compact comment class that handles compact MediaWiki talk page formatting
 * with traditional layout and overlay menu-based actions.
 *
 * @template {boolean} [OpeningSection=boolean]
 * @augments Comment<OpeningSection>
 */
class CompactComment extends Comment {
	/**
	 * Comment layers for compact comments.
	 *
	 * @type {CompactCommentLayers | undefined}
	 * @override
	 */
	// @ts-expect-error: Narrowing parent type
	layers

	/**
	 * Comment actions for compact comments.
	 *
	 * @type {CompactCommentActions | undefined}
	 * @override
	 */
	// @ts-expect-error: Narrowing parent type
	actions

	isHovered = false

	/**
	 * Create the comment's underlay and overlay with contents for compact comments.
	 *
	 * @fires commentLayersCreated
	 * @protected
	 * @override
	 */
	createLayers() {
		// Create compact layers
		this.layers = new CompactCommentLayers(this)
		this.layers.create()

		// Create compact actions
		this.actions = new CompactCommentActions(this)
		this.actions.create()

		/**
		 * An underlay and overlay have been created for a comment.
		 *
		 * @event commentLayersCreated
		 * @param {Comment} comment
		 * @param {object} cd {@link convenientDiscussions} object.
		 */
		mw.hook('convenientDiscussions.commentLayersCreated').fire(this, cd)
	}

	/**
	 * Bind the standard events to a comment part.
	 * For compact comments, handles hover events for overlay menu display.
	 *
	 * @param {HTMLElement} element
	 * @protected
	 * @override
	 */
	bindEvents(element) {
		element.addEventListener('mouseenter', this.handleHover)
		element.addEventListener('mouseleave', () => {
			this.handleUnhover()
		})
		element.addEventListener('touchstart', this.handleHover)
	}

	/**
	 * Implementation-specific logic for adding change note to compact comments. Adds the note to the
	 * last block element.
	 *
	 * @param {JQuery} $changeNote
	 * @protected
	 * @override
	 */
	addChangeNoteImpl($changeNote) {
		// Add the mark to the last block element, going as many nesting levels down as needed to
		// avoid it appearing after a block element.
		let $last
		let $tested = $(this.highlightables).last()
		do {
			$last = $tested
			$tested = $last.children().last()
		} while ($tested.length && !isInline($tested[0]))

		if (!$last.find('.cd-changeNote-before').length) {
			$last.append(' ', $('<span>').addClass('cd-changeNote-before'))
		}
		$last.append($changeNote)
	}

	/**
	 * Get the start point for selection range in compact comments.
	 * Uses the beginning of first element.
	 *
	 * @returns {{ startNode: Node, startOffset: number }}
	 * @protected
	 * @override
	 */
	getSelectionStartPoint() {
		return {
			startNode: this.elements[0],
			startOffset: 0,
		}
	}

	/**
	 * Get the end point for selection range in compact comments.
	 * Uses the beginning of signature element.
	 *
	 * @returns {{ endNode: Node, endOffset: number }}
	 * @protected
	 * @override
	 */
	getSelectionEndPoint() {
		return {
			endNode: this.signatureElement,
			endOffset: 0,
		}
	}

	/**
	 * Get the end boundary element for compact comments.
	 * Creates a temporary boundary element.
	 *
	 * @returns {Element}
	 * @protected
	 * @override
	 */
	getSelectionEndBoundary() {
		const dummyEndBoundary = document.createElement('span')
		this.$elements.last().append(dummyEndBoundary)

		return dummyEndBoundary
	}

	/**
	 * Clean up the temporary boundary element for compact comments.
	 *
	 * @param {Element} endBoundary
	 * @protected
	 * @override
	 */
	cleanupSelectionEndBoundary(endBoundary) {
		endBoundary.remove()
	}

	/**
	 * Update the toggle child threads button implementation for compact comments.
	 * Uses OOUI icons.
	 *
	 * @this {this & { actions: { toggleChildThreadsButton: { element: HTMLElement } } }}
	 * @override
	 */
	updateToggleChildThreadsButtonImpl() {
		this.actions.toggleChildThreadsButton.setIcon(
			this.areChildThreadsCollapsed() ? 'add' : 'subtract',
		)
	}

	/**
	 * Update the main timestamp element for compact comments.
	 * Always updates since compact comments don't use headers.
	 *
	 * @param {string} timestamp
	 * @param {string} title
	 * @override
	 */
	updateMainTimestampElement(timestamp, title) {
		this.timestampElement.textContent = timestamp
		this.timestampElement.title = title
		new LiveTimestamp(
			this.timestampElement,
			/** @type {Date} */ (this.date),
			!this.hideTimezone,
		).init()
	}

	/**
	 * Get separators for change note links in compact comments.
	 * Uses space separators with conditional dot separator for diff link.
	 *
	 * @param {string} stringName
	 * @param {import('./Button').default} [refreshLink]
	 * @returns {{ noteText: string, refreshLinkSeparator: string, diffLinkSeparator: string }}
	 * @override
	 */
	getChangeNoteSeparators(stringName, refreshLink) {
		return {
			noteText: cd.s(stringName),
			refreshLinkSeparator: ' ',
			diffLinkSeparator: refreshLink ? cd.sParse('dot-separator') : ' ',
		}
	}

	/**
	 * Implementation-specific structure initialization for compact comments.
	 * Sets up timestamp element and reformats timestamp.
	 *
	 * @override
	 */
	initializeCommentStructureImpl() {
		this.timestampElement = this.$elements.find('.cd-signature .cd-timestamp')[0]
		this.reformatTimestamp()
	}

	/**
	 * Handle hover event for compact comments.
	 * Shows the underlay and overlay when the comment is hovered.
	 *
	 * @param {MouseEvent | TouchEvent} [event] The triggering event
	 * @override
	 */
	handleHover = (event) => {
		if (this.isHovered || cd.loader.isPageOverlayOn()) return

		if (event?.type === 'touchstart') {
			if (this.layers?.wasMenuHidden) {
				this.layers.wasMenuHidden = false

				return
			}

			// FIXME: decouple
			const commentManagerTyped =
				/** @type {import('./commentManager').default<CompactComment>} */ (commentManager)
			commentManagerTyped
				.query((comment) => comment.isHovered)
				.forEach((comment) => {
					comment.handleUnhover()
				})
		}

		// Animation will be directed to wrong properties if we keep it going.
		this.layers?.$animatedBackground?.stop(true, true)

		// Configure layers (create if they don't exist, update if they do)
		const layersResult = this.configureLayers()

		// If configureLayers returns undefined, it means the comment is invisible or there was an error
		if (layersResult === undefined) {
			return
		}

		// If layers still don't exist after configuration, something went wrong
		if (!this.layers) {
			return
		}

		this.isHovered = true
		this.updateClassesForFlag('hovered', true)
	}

	/**
	 * Handle unhover event for compact comments. Cleans up hover state and hides menu.
	 *
	 * @param {boolean} [force] Unhover even if the "Toggle child threads" popup is open.
	 * @override
	 */
	handleUnhover(force = false) {
		if (!this.isHovered || (this.toggleChildThreadsPopup && !force)) return

		// Animation will be directed to wrong properties if we keep it going.
		this.layers?.$animatedBackground?.stop(true, true)

		this.layers?.dontHideMenu()

		this.updateClassesForFlag('hovered', false)
		this.isHovered = false

		this.teardownOnboardOntoToggleChildThreadsPopup()
	}

	/**
	 * Update the comment's hover state based on a `mousemove` event.
	 * Only applicable to compact comments that use hover interactions.
	 *
	 * @param {MouseEvent | JQuery.MouseMoveEvent | JQuery.MouseOverEvent} event
	 * @param {boolean} isObstructingElementHovered
	 */
	updateHoverState(event, isObstructingElementHovered) {
		const layersOffset = this.layers?.offset
		const layersContainerOffset = this.layers?.getContainerOffset()
		if (!layersOffset || !layersContainerOffset) {
			// Something has happened with the comment (or the layers container); it disappeared.
			this.removeLayers()

			return
		}
		if (
			!isObstructingElementHovered &&
			event.pageY >= layersOffset.top + layersContainerOffset.top &&
			event.pageY <= layersOffset.top + layersOffset.height + layersContainerOffset.top &&
			event.pageX >= layersOffset.left + layersContainerOffset.left &&
			event.pageX <= layersOffset.left + layersOffset.width + layersContainerOffset.left
		) {
			this.handleHover()
		} else {
			this.handleUnhover()
		}
	}

	/**
	 * @type {PrototypeRegistry<{
	 *   underlay: HTMLElement
	 *   overlay: HTMLElement
	 * }>}
	 */
	static prototypes = new PrototypeRegistry()

	/**
	 * Initialize prototypes for compact comments.
	 *
	 * @override
	 */
	static initPrototypes() {
		// Initialize shared layer prototypes (underlay, overlay)
		CommentLayers.initPrototypes()

		// Initialize compact-specific layer prototypes
		CompactCommentLayers.initPrototypes()
	}
}

export default CompactComment
