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
	 * Check if the current MediaWiki version is equal to or higher than the specified version.
	 * Useful for feature availability checks based on release versions. Supports partial versions
	 * (e.g., '1.35.6', '1.35', '1', '1.46.0-wmf.24').
	 *
	 * @param {string} requiredVersion The minimum version required (e.g., '1.35.6', '1.35', '1')
	 * @returns {boolean} True if current version >= required version, false otherwise
	 */
	isMwVersionEqualOrHigher(requiredVersion) {
		return this.compareMediaWikiVersions(mw.config.get('wgVersion'), requiredVersion) >= 0
	},

	/**
	 * Compare two MediaWiki version strings. Handles standard versions (e.g., 1.35.6),
	 * partial versions (e.g., 1.35, 1), and WMF versions (e.g., 1.46.0-wmf.24).
	 *
	 * @param {string} versionA
	 * @param {string} versionB
	 * @returns {number} Positive if versionA > versionB, 0 if equal, negative if versionA < versionB
	 */
	compareMediaWikiVersions(versionA, versionB) {
		// Parse versions into parts: [main, suffix] where suffix is optional (e.g., 'wmf.24')
		const parseVersion = (/** @type {string} */ version) => {
			const [main, suffix] = version.split('-')
			const parts = main.split('.').map((/** @type {string} */ part) => Number.parseInt(part, 10))

			return { parts, suffix: suffix || '' }
		}

		const a = parseVersion(versionA)
		const b = parseVersion(versionB)

		// Compare main version numbers (major, minor, patch, etc.)
		const maxLength = Math.max(a.parts.length, b.parts.length)

		for (let i = 0; i < maxLength; i++) {
			const aPart = a.parts[i] || 0
			const bPart = b.parts[i] || 0

			if (aPart !== bPart) {
				return aPart - bPart
			}
		}

		// Main versions are equal, compare suffixes
		// No suffix (release) > wmf versions
		if (!a.suffix && b.suffix) {
			return 1 // Release version is higher than WMF
		}

		if (a.suffix && !b.suffix) {
			return -1 // WMF version is lower than release
		}

		if (!a.suffix && !b.suffix) {
			return 0 // Both are releases
		}

		// Both have suffixes, compare them
		const aSuffixParts = a.suffix
			.split('.')
			.map((/** @type {string} */ part) =>
				Number.isNaN(Number.parseInt(part, 10)) ? part : Number.parseInt(part, 10),
			)
		const bSuffixParts = b.suffix
			.split('.')
			.map((/** @type {string} */ part) =>
				Number.isNaN(Number.parseInt(part, 10)) ? part : Number.parseInt(part, 10),
			)

		for (let i = 0; i < Math.max(aSuffixParts.length, bSuffixParts.length); i++) {
			const aPart = aSuffixParts[i] ?? ''
			const bPart = bSuffixParts[i] ?? ''

			// If both are numbers, compare numerically
			if (typeof aPart === 'number' && typeof bPart === 'number') {
				if (aPart !== bPart) {
					return aPart - bPart
				}

				// String comparison for non-numeric parts
			} else if (aPart !== bPart) {
				return String(aPart).localeCompare(String(bPart))
			}
		}

		return 0
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
