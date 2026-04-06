import cd from './cd'

const utils = {
	/**
	 * Get the first fallback language that exists in the collection if it passes the validity check.
	 *
	 * @param {string} lang
	 * @param {{ [key: string]: string[] }} fallbacks
	 * @param {(lang: string) => boolean} isValid
	 * @returns {string}
	 */
	getValidFallbackLanguage(lang, fallbacks, isValid) {
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		return fallbacks[lang]?.find(isValid) || 'en'
	},

	/**
	 * Get a language or its fallback if the language is not valid.
	 *
	 * @param {string} lang
	 * @param {(lang: string) => boolean} isValid
	 * @param { {[key: string]: string[] }} fallbacks
	 * @returns {string}
	 */
	getValidLanguageOrFallback(lang, isValid, fallbacks) {
		return isValid(lang) ? lang : this.getValidFallbackLanguage(lang, fallbacks, isValid)
	},

	/**
	 * Check if the displayed revision is the current (last known) revision of the page.
	 *
	 * @returns {boolean}
	 */
	isCurrentRevision() {
		// RevisionSlider may show a revision newer than the revision in wgCurRevisionId due to a bug
		// (when navigating forward, at least twice, from a revision older than the revision in
		// wgCurRevisionId after some revisions were added). Unfortunately, it doesn't update the
		// wgCurRevisionId value.
		return mw.config.get('wgRevisionId') >= mw.config.get('wgCurRevisionId')
	},

	/**
	 * Get the footer element.
	 *
	 * @returns {JQuery}
	 */
	getFooter() {
		return this.skin$({
			monobook: '#f-list',
			modern: '#footer-info',
			default: '#footer-places',
		})
	},

	/**
	 * Generate a transparent color for the given color to use it in a gradient.
	 *
	 * @param {string} color
	 * @returns {string}
	 */
	transparentize(color) {
		const dummyElement = document.createElement('span')
		dummyElement.style.color = color
		color = dummyElement.style.color

		return color.includes('rgba')
			? color.replace(/\d+(?=\))/, '0')
			: color.replace('rgb', 'rgba').replace(')', ', 0)')
	},

	/**
	 * Create a `<svg>` element.
	 *
	 * @param {number | string} width
	 * @param {number | string} height
	 * @param {number | string} [viewBoxWidth]
	 * @param {number | string} [viewBoxHeight]
	 * @returns {JQuery<SVGElement>}
	 */
	createSvg(width, height, viewBoxWidth = width, viewBoxHeight = height) {
		return (
			$(document.createElementNS('http://www.w3.org/2000/svg', 'svg'))
				.attr('width', width)
				.attr('height', height)
				.attr('viewBox', `0 0 ${viewBoxWidth} ${viewBoxHeight}`)
				.attr('aria-hidden', 'true')

				// https://en.wikipedia.org/wiki/Project:Dark_mode_(gadget)
				.addClass('mw-invert')
		)
	},

	/**
	 * Get elements using the right selector for the current skin given an object with skin names as
	 * keys and selectors as values. If no value for the skin is provided, the `default` value is used.
	 *
	 * @param {StringsByKey} selectors
	 * @returns {JQuery}
	 */
	skin$(selectors) {
		return $(selectors[cd.g.skin] || selectors.default || selectors.vector)
	},
}

// This is defensive in case the module is loaded multiple times.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
if (!cd.utils) {
	cd.utils = utils

	// people might try to use `cd.util` as an analogy of `mw.util`, hehe
	Object.defineProperty(cd, 'util', {
		configurable: true,
		enumerable: false,
		get() {
			console.error('cd.util is not a thing. Did you mean cd.utils?')

			return cd.utils
		},
	})
}

export { utils }
