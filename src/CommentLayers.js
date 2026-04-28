import PrototypeRegistry from './PrototypeRegistry'
import commentManager from './commentManager'
import { sleep } from './shared/utils-general.js'

/**
 * Base class for managing comment visual layers (underlay and overlay).
 * Handles layer creation, destruction, positioning, and styling.
 */
class CommentLayers {
	/**
	 * Registry for element prototypes to reuse instead of creating new elements from scratch.
	 *
	 * @type {PrototypeRegistry<{
	 *   underlay: HTMLElement
	 *   overlay: HTMLElement
	 * }>}
	 */
	static prototypes = new PrototypeRegistry()

	/**
	 * Comment's underlay as a native (non-jQuery) element.
	 *
	 * @type {HTMLElement}
	 */
	underlay

	/**
	 * Comment's overlay.
	 *
	 * @type {HTMLElement}
	 */
	overlay

	/**
	 * Line element in comment's overlay.
	 *
	 * @type {HTMLElement}
	 */
	line

	/**
	 * Comment's side marker.
	 *
	 * @type {HTMLElement}
	 */
	marker

	/**
	 * Comment's underlay as jQuery object.
	 *
	 * @type {JQuery}
	 */
	$underlay

	/**
	 * Comment's overlay as jQuery object.
	 *
	 * @type {JQuery}
	 */
	$overlay

	/**
	 * Comment's side marker as jQuery object.
	 *
	 * @type {JQuery}
	 */
	$marker

	/**
	 * Reference to the parent comment.
	 *
	 * @type {import('./Comment').default}
	 */
	comment

	/**
	 * The comment's layers offset.
	 *
	 * @type {{ top: number; left: number; width: number; height: number } | undefined}
	 */
	offset

	/**
	 * Comment underlay and menu, whose colors are animated in some events.
	 *
	 * @type {JQuery | undefined}
	 */
	$animatedBackground

	/**
	 * Deferred object for unhighlighting animations.
	 *
	 * @type {JQuery.Deferred<void> | undefined}
	 */
	unhighlightDeferred

	/**
	 * Create a CommentLayers instance.
	 *
	 * @param {import('./Comment').default} comment The parent comment.
	 */
	constructor(comment) {
		this.comment = comment
	}

	/**
	 * Create the layer elements (underlay, overlay, line, marker).
	 */
	create() {
		// Create underlay (same for all comment types)
		this.underlay = CommentLayers.prototypes.get('underlay')
		commentManager.underlays.push(this.underlay)

		// Create overlay (may be customized by subclasses)
		this.overlay = this.getOverlayPrototype()
		this.line = /** @type {HTMLElement} */ (this.overlay.firstChild)
		this.marker = /** @type {HTMLElement} */ (
			/** @type {HTMLElement} */ (this.overlay.firstChild).nextSibling
		)

		this.updateStyles(true)
		if (!this.offset) {
			this.computeAndSaveOffset()
		}

		// Create jQuery wrappers
		this.$underlay = $(this.underlay)
		this.$overlay = $(this.overlay)
		this.$marker = $(this.marker)

		this.underlay.dataset.cdCommentIndex = String(this.comment.index)
		this.overlay.dataset.cdCommentIndex = String(this.comment.index)

		// Allow subclasses to set up additional elements
		this.setupAdditionalElements()
	}

	/**
	 * Get the overlay prototype for this comment type.
	 *
	 * @returns {HTMLElement} The overlay prototype element.
	 * @protected
	 */
	getOverlayPrototype() {
		return CommentLayers.prototypes.get('overlay')
	}

	/**
	 * Set up additional elements after basic layers are created.
	 *
	 * Subclasses can override this to add custom elements and event listeners.
	 *
	 * @protected
	 */
	setupAdditionalElements() {
		// Base implementation - no additional elements
	}

	/**
	 * Destroy the layer elements and clean up references.
	 */
	destroy() {
		this.underlay.remove()
		this.overlay.remove()
	}

	/**
	 * Update layer styles and positioning.
	 *
	 * This method should be overridden by subclasses for specific styling needs.
	 *
	 * @param {boolean} wereJustCreated Whether the layers were just created.
	 */
	updateStyles(wereJustCreated = false) {
		// Apply common layer styling
		const styleFlags = this.comment.getStyleFlags()
		styleFlags.forEach(({ name, value }) => {
			this.comment.updateClassesForFlag(name, value)
		})

		if (wereJustCreated && this.comment.isLineGapped()) {
			this.line.classList.add('cd-comment-overlay-line-gapCloser')
		}
	}

	/**
	 * Set classes to the underlay, overlay, and other elements according to a comment flag.
	 *
	 * @param {import('./CommentFlagSet').CommentFlag} flag
	 * @param {boolean} add Whether to add or remove the class.
	 */
	updateClassesForFlag(flag, add) {
		if (this.underlay.classList.contains(`cd-comment-underlay-${flag}`) === add) return

		this.underlay.classList.toggle(`cd-comment-underlay-${flag}`, add)
		this.overlay.classList.toggle(`cd-comment-overlay-${flag}`, add)

		const thisTyped = /** @type {any} */ (this)
		if (flag === 'hovered' && !add && thisTyped.overlayInnerWrapper) {
			thisTyped.overlayInnerWrapper.style.display = ''
		}
	}

	/**
	 * Hide the comment menu. Base implementation does nothing.
	 *
	 * Overriden in subclasses that have menu functionality.
	 *
	 * @param {Event} [_event] The event that triggered the hide action.
	 */
	hideMenu(_event) {
		// Base implementation - no menu to hide
	}

	/**
	 * Defer hiding the menu. Base implementation does nothing.
	 *
	 * Overriden in subclasses that have menu functionality.
	 *
	 * @param {MouseEvent} _event The mousedown event.
	 */
	deferHideMenu(_event) {
		// Base implementation - no menu to defer hiding
	}

	/**
	 * Cancel the deferred menu hiding. Base implementation does nothing.
	 *
	 * Overriden in subclasses that have menu functionality.
	 */
	dontHideMenu() {
		// Base implementation - no timeout to clear
	}

	/**
	 * Add the (already existent) comment's layers to the DOM.
	 */
	add() {
		this.updateOffset()
		this.comment.getLayersContainer().append(this.underlay, this.overlay)
	}

	/**
	 * _For internal use._ Transfer the `layers(Top|Left|Width|Height)` values to the style of the
	 * layers.
	 */
	updateOffset() {
		// The underlay can be absent if called from commentManager.maybeRedrawLayers() with redrawAll
		// set to `true`. layersOffset can be absent in some rare cases when the comment became
		// invisible.
		if (!this.offset) return

		this.underlay.style.top = this.overlay.style.top = String(this.offset.top) + 'px'
		this.underlay.style.left = this.overlay.style.left = String(this.offset.left) + 'px'
		this.underlay.style.width = this.overlay.style.width = String(this.offset.width) + 'px'
		this.underlay.style.height = this.overlay.style.height = String(this.offset.height) + 'px'

		this.comment.toggleChildThreadsPopup?.position()
	}

	/**
	 * Calculate the underlay and overlay offset and set it to the `layersOffset` property.
	 *
	 * @param {object} [options]
	 * @returns {boolean | undefined} Was the comment displaced. `undefined` if it is invisible.
	 */
	computeAndSaveOffset(options = {}) {
		const containerOffset = this.comment.getLayersContainerOffset()
		if (!containerOffset) return

		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const displaced = this.comment.getAndOrSaveOffset({
			...options,
			considerFloating: true,
			save: true,
		})

		if (this.comment.offset) {
			const margins = this.comment.getMargins()
			this.offset = {
				top: this.comment.offset.top - containerOffset.top,
				left: this.comment.offset.left - margins.left - containerOffset.left,
				width:
					this.comment.offset.right + margins.right - (this.comment.offset.left - margins.left),
				height: this.comment.offset.bottom - this.comment.offset.top,
			}
		} else {
			this.offset = undefined
		}

		return displaced
	}

	/**
	 * Animate the comment's background and marker color to the provided colors. (Called from
	 * {@link CommentLayers#animateBack}.)
	 *
	 * @param {string} markerColor
	 * @param {string} backgroundColor
	 * @param {() => void} [callback] Function to run when the animation is concluded.
	 */
	animateToColors(markerColor, backgroundColor, callback) {
		const generateProperties = (/** @type {string} */ color) => {
			const properties = /** @type {CSSStyleDeclaration} */ ({ backgroundColor: color })

			// jquery.color module can't animate to the transparent color.
			if (properties.backgroundColor === 'rgba(0, 0, 0, 0)') {
				properties.opacity = '0'
			}

			return properties
		}
		const propertyDefaults = {
			backgroundColor: '',
			backgroundImage: '',
			opacity: '',
		}

		this.$marker.animate(generateProperties(markerColor), 400, 'swing', () => {
			this.$marker.css(propertyDefaults)
		})

		const $background = /** @type {JQuery} */ (this.$animatedBackground)
		const layers = this
		$background.animate(generateProperties(backgroundColor), 400, 'swing', function complete() {
			if (this !== $background.get(-1)) return

			callback?.()
			// Check if this is a CompactCommentLayers instance by checking for $overlayGradient property
			$background.add(/** @type {any} */ (layers).$overlayGradient || $()).css(propertyDefaults)
		})
	}

	/**
	 * Animate the comment's background and marker color back from the colors of a given comment flag.
	 *
	 * @param {import('./CommentFlagSet').CommentFlag} flag
	 */
	animateBack(flag) {
		if (!this.$underlay.parent().length) return

		// Get the current colors
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const initialMarkerColor = this.$marker.css('background-color')
		const initialBackgroundColor = this.$underlay.css('background-color')

		// Reset the classes that produce these colors
		this.updateClassesForFlag(flag, false)

		// Get the final (destination) colors
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const finalMarkerColor = this.$marker.css('background-color')
		let finalBackgroundColor = this.$underlay.css('background-color')

		// That's basically if the flash color is green (when a comment is changed after an edit) and
		// the comment itself is green. We animate to transparent, then set green back, so that there is
		// any animation at all.
		if (finalBackgroundColor === initialBackgroundColor) {
			finalBackgroundColor = 'rgba(0, 0, 0, 0)'
		}

		// Set back the colors previously produced by classes
		this.$marker.css({
			backgroundColor: initialMarkerColor,
			opacity: 1,
		})
		const animatedBackgroundTyped = /** @type {JQuery} */ (this.$animatedBackground)
		animatedBackgroundTyped.css({
			backgroundColor: initialBackgroundColor,
		})
		// Check if this is a CompactCommentLayers instance by checking for $overlayGradient property
		if (/** @type {any} */ (this).$overlayGradient) {
			const thisTyped = /** @type {any} */ (this)
			thisTyped.$overlayGradient.css({ backgroundImage: 'none' })
		}

		this.animateToColors(finalMarkerColor, finalBackgroundColor, () => {
			this.comment.removeFlag(flag)
		})
	}

	/**
	 * Change the comment's background and marker color to a color of the provided comment flag for
	 * the given number of milliseconds, then smoothly change it back.
	 *
	 * @param {import('./CommentFlagSet').CommentFlag} flag
	 * @param {number} delay
	 */
	flash(flag, delay) {
		// If there was an animation scheduled, cancel it and animate back immediately. Then that
		// animation is stopped which triggers the callback removing the flag.
		this.unhighlightDeferred?.reject()
		this.comment.stopAnimations()

		// TODO: This should better reside in Comment, but we need to add the flag *after* rejecting the
		// deferred and stopping the animation because that would remove the flag.
		this.comment.addFlag(flag, true)

		this.$animatedBackground = this.$underlay.add(/** @type {any} */ (this).$overlayMenu || $())

		const deferred = (this.unhighlightDeferred = $.Deferred())
		deferred.always(() => {
			this.animateBack(flag)
		})

		sleep(delay).then(() => {
			deferred.resolve()
		})
	}

	/**
	 * Have the prototypes been initialized.
	 *
	 * @type {boolean}
	 */
	static prototypesInitted = false

	/**
	 * _For internal use._ Create element prototypes to reuse them instead of creating new elements
	 * from scratch (which is more expensive).
	 * Creates shared prototypes (underlay, overlay) that are common to all comment types.
	 */
	static initPrototypes() {
		if (this.prototypesInitted) return

		// Create shared layer elements (underlay, overlay)
		const commentUnderlay = document.createElement('div')
		commentUnderlay.className = 'cd-comment-underlay'

		const commentOverlay = document.createElement('div')
		commentOverlay.className = 'cd-comment-overlay'

		const overlayLine = document.createElement('div')
		overlayLine.className = 'cd-comment-overlay-line'
		commentOverlay.append(overlayLine)

		const overlayMarker = document.createElement('div')
		overlayMarker.className = 'cd-comment-overlay-marker'
		commentOverlay.append(overlayMarker)

		this.prototypes.add('underlay', commentUnderlay)
		this.prototypes.add('overlay', commentOverlay)

		this.prototypesInitted = true
	}
}

export default CommentLayers
