/**
 * jQuery extensions. See {@link JQuery.fn jQuery.fn}.
 *
 * @module jqueryExtensions
 */

import controller from './controller'
import cd from './loader/cd'
import { isMetadataNode, sleep } from './shared/utils-general'
import { isHiddenByUntilFound } from './utils-window'

/**
 * jQuery. See {@link JQuery.fn jQuery.fn} for extensions.
 *
 * @external jQuery
 * @type {object}
 * @see https://jquery.com/
 * @global
 */

/**
 * jQuery extensions.
 *
 * @namespace fn
 * @memberof JQuery
 */
export default {
	/**
	 * Remove non-element nodes and metadata elements (`'STYLE'`, `'LINK'`) from a jQuery collection.
	 *
	 * @returns {JQuery}
	 * @memberof JQuery
	 * @this {JQuery}
	 */
	cdRemoveNonElementNodes() {
		return this.filter((_, el) => Boolean(el.tagName && !isMetadataNode(el)))
	},

	/**
	 * Scroll to the element.
	 *
	 * @param {'top'|'center'|'bottom'} [alignment] Where should the element be positioned
	 *   relative to the viewport.
	 * @param {boolean} [smooth] Whether to use a smooth animation.
	 * @param {(() => void)} [callback] Callback to run after the animation has
	 *   completed.
	 * @returns {JQuery}
	 * @memberof JQuery
	 * @this {JQuery}
	 */
	cdScrollTo(alignment = 'top', smooth = true, /** @type {() => void | undefined} */ callback) {
		const defaultScrollPaddingTop = 7
		const $elements = this.cdRemoveNonElementNodes()

		// Filter out elements like .mw-empty-elt
		const findFirstVisibleElementOffset = (
			/** @type {JQuery} */ $els,
			/** @type {'backward' | 'forward'} */ direction,
		) => {
			const elements = $els.get()
			if (direction === 'backward') {
				elements.reverse()
			}
			for (const el of elements) {
				const offset = /** @type {JQuery.Coordinates} */ ($(el).offset())
				if (!(offset.top === 0 && offset.left === 0)) {
					return offset
				}
			}
		}

		let offsetFirst = findFirstVisibleElementOffset($elements, 'forward')
		let offsetLast = findFirstVisibleElementOffset($elements, 'backward')
		if (!offsetFirst || !offsetLast) {
			// Find closest visible ancestor
			const $firstVisibleAncestor = $elements.first().closest(':visible')
			if ($firstVisibleAncestor.length && !$firstVisibleAncestor.is(controller.$root)) {
				offsetFirst = findFirstVisibleElementOffset($firstVisibleAncestor, 'forward')
				offsetLast = offsetFirst
				mw.notify(cd.s('error-elementhidden-container'), {
					tag: 'cd-elementhidden-container',
				})
			}

			if (!offsetFirst || !offsetLast) {
				mw.notify(cd.s('error-elementhidden'), {
					type: 'error',
					tag: 'cd-elementhidden',
				})

				return /** @type {JQuery} */ (/** @type {unknown} */ (this))
			}
		}

		// eslint-disable-next-line @typescript-eslint/restrict-plus-operands
		const offsetBottom = offsetLast.top + /** @type {number} */ ($elements.last().outerHeight())

		let top
		if (alignment === 'center') {
			top = Math.min(
				offsetFirst.top,
				offsetFirst.top +
					(offsetBottom - offsetFirst.top) * 0.5 -
					/** @type {number} */ ($(window).height()) * 0.5,
			)
		} else if (alignment === 'bottom') {
			top = offsetBottom - /** @type {number} */ ($(window).height()) + defaultScrollPaddingTop
		} else {
			top = offsetFirst.top - (controller.getBodyScrollPaddingTop() || defaultScrollPaddingTop)
		}

		controller.toggleAutoScrolling(true)
		controller.scrollToY(top, smooth, callback)

		return /** @type {JQuery} */ (/** @type {unknown} */ (this))
	},

	/**
	 * Check if the element is in the viewport. Elements hidden with `display: none` are checked as if
	 * they were visible. Elements inside other hidden elements return `false`.
	 *
	 * This method is not supposed to be used on element collections that are partially visible,
	 * partially hidden, as it can't remember their state.
	 *
	 * @param {boolean} partially Return `true` even if only a part of the element is in the viewport.
	 * @returns {?boolean}
	 * @memberof JQuery
	 * @this {JQuery}
	 */
	cdIsInViewport(partially = false) {
		const $elements = this.cdRemoveNonElementNodes()
		if (!$elements.length) {
			return null
		}

		// Workaround for hidden elements (use cases like checking if the add section form is in the
		// viewport).
		const wasHidden = $elements.get().every((el) => el.style.display === 'none')
		if (wasHidden) {
			$elements.show()
		}

		const elementTop = /** @type {JQuery.Coordinates} */ ($elements.first().offset()).top
		const elementBottom =
			/** @type {JQuery.Coordinates} */ ($elements.last().offset()).top +
			// eslint-disable-next-line @typescript-eslint/restrict-plus-operands
			/** @type {number} */ ($elements.last().height())

		// The element is hidden.
		if (elementTop === 0 && elementBottom === 0) {
			return false
		}

		if (wasHidden) {
			$elements.hide()
		}

		// The element is inside a hidden="until-found" ancestor.
		if (isHiddenByUntilFound($elements.first()[0])) {
			return false
		}

		const scrollTop = /** @type {number} */ ($(window).scrollTop())
		const viewportTop = scrollTop + controller.getBodyScrollPaddingTop()
		// eslint-disable-next-line @typescript-eslint/restrict-plus-operands
		const viewportBottom = scrollTop + /** @type {number} */ ($(window).height())

		return partially
			? elementBottom > viewportTop && elementTop < viewportBottom
			: elementTop >= viewportTop && elementBottom <= viewportBottom
	},

	/**
	 * Scroll to the element if it is not in the viewport.
	 *
	 * @param {'top'|'center'|'bottom'} [alignment] Where should the element be positioned
	 *   relative to the viewport.
	 * @param {boolean} [smooth] Whether to use a smooth animation.
	 * @param {() => void} [callback] Callback to run after the animation has completed.
	 * @returns {JQuery}
	 * @memberof JQuery
	 * @this {JQuery}
	 */
	cdScrollIntoView(alignment = 'top', smooth = true, callback) {
		if (this.cdIsInViewport()) {
			callback?.()
		} else if (callback) {
			// Add sleep() for a more smooth animation in case there is .focus() in the callback.
			sleep().then(() => {
				this.cdScrollTo(alignment, smooth, callback)
			})
		} else {
			this.cdScrollTo(alignment, smooth, callback)
		}

		return /** @type {JQuery} */ (/** @type {unknown} */ (this))
	},

	/**
	 * Get the element text as it is rendered in the browser, i.e. line breaks, paragraphs etc. are
	 * taken into account. **This function is expensive.**
	 *
	 * @returns {string}
	 * @memberof JQuery
	 * @this {JQuery}
	 */
	cdGetText() {
		const dummyElement = document.createElement('div')
		;[...this[0].childNodes].forEach((node) => {
			dummyElement.append(node.cloneNode(true))
		})
		document.body.append(dummyElement)
		const text = dummyElement.innerText
		dummyElement.remove()

		return text
	},

	/**
	 * Add a close button to the element.
	 *
	 * @returns {JQuery}
	 * @memberof JQuery
	 * @this {JQuery}
	 */
	cdAddCloseButton() {
		if (this.find('.cd-closeButton').length) {
			return /** @type {JQuery} */ (/** @type {unknown} */ (this))
		}

		this.prepend(
			// Close button
			$('<a>')
				.attr('title', cd.s('cf-block-close'))
				.append(
					cd.utils.createSvg(20, 20).html(
						// Don't use self-closing tags for old jQuery support
						`<path d="M4.34 2.93l12.73 12.73-1.41 1.41L2.93 4.35z"></path><path d="M17.07 4.34L4.34 17.07l-1.41-1.41L15.66 2.93z"></path>`,
					),
				)
				.addClass('cd-closeButton cd-icon')
				.on('click', () => {
					this.empty()
				}),
		)

		return /** @type {JQuery} */ (/** @type {unknown} */ (this))
	},

	/**
	 * Remove the close button from the element.
	 *
	 * @returns {JQuery}
	 * @memberof JQuery
	 * @this {JQuery}
	 */
	cdRemoveCloseButton() {
		this.find('.cd-closeButton').remove()

		return /** @type {JQuery} */ (/** @type {unknown} */ (this))
	},
}
