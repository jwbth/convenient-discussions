import cd from './loader/cd'
import CdError from './shared/CdError'
import { parseTimestamp } from './shared/utils-timestamp'
import { maskDistractingCode } from './shared/utils-wikitext'
import { findFirstTimestamp } from './utils-window'

/**
 * Class that keeps the methods and data related to the page's source code.
 */
export default class PageSource {
	/**
	 * Page's source code (wikitext), ending with `\n`. Filled upon running {@link Page#loadCode}.
	 *
	 * @type {string | undefined}
	 */
	code

	/**
	 * Whether new topics go on top on this page. Filled upon running
	 * {@link PageSource#guessNewTopicPlacement}.
	 *
	 * @type {boolean|undefined}
	 */
	areNewTopicsOnTop

	/**
	 * The start index of the first section, if new topics are on top on this page. Filled upon
	 * running {@link PageSource#guessNewTopicPlacement}.
	 *
	 * @type {number|undefined}
	 */
	firstSectionStartIndex

	/**
	 * Create a comment's source object.
	 *
	 * @param {import('./Page').default} page Page.
	 */
	constructor(page) {
		this.page = page
	}

	/**
	 * Set the page's source code.
	 *
	 * @param {string} code
	 */
	setCode(code) {
		this.code = code
	}

	/**
	 * Throw an error if the page code is not set.
	 *
	 * @returns {string} code
	 * @throws {CdError}
	 */
	getCode() {
		this.assertCode()

		return this.code
	}

	/**
	 * Get the page's source code.
	 *
	 * @param {string} [message]
	 * @returns {asserts this is { code: string }}
	 * @throws {CdError}
	 */
	assertCode(message) {
		if (this.code === undefined) {
			throw new CdError({
				type: 'internal',
				message: message || 'Page code is not set.',
			})
		}
	}

	/**
	 * Modify the page code string in accordance with an action. The `'addSection'` action is
	 * presumed.
	 *
	 * @param {object} options
	 * @param {string} [options.commentCode] Comment code, including trailing newlines and the
	 *   signature. NOTE: It is required (set to optional for polymorphism with CommentSource and
	 *   SectionSource).
	 * @param {import('./CommentForm').default} options.commentForm Comment form that has the code.
	 * @returns {{
	 *   contextCode: string;
	 *   commentCode?: string;
	 * }}
	 * @throws {CdError}
	 */
	modifyContext({ commentCode, commentForm }) {
		let contextCode
		if (commentForm.isNewTopicOnTop()) {
			this.assertCode('Can\'t modify the context: context (page) code is not set.')

			const firstSectionStartIndex = maskDistractingCode(this.code)
				.search(/^(=+).*\1[ \t\u0001\u0002]*$/m)
			contextCode =
				(
					firstSectionStartIndex === -1
						? this.code
							? this.code + '\n'
							: ''
						: this.code.slice(0, firstSectionStartIndex)
				) +
				// eslint-disable-next-line @typescript-eslint/restrict-plus-operands
				/** @type {string} */ (commentCode) +
				'\n' +
				this.code.slice(firstSectionStartIndex)
		} else if (commentForm.isNewSectionApi()) {
			contextCode = /** @type {string} */ (commentCode)
		} else {
			this.assertCode('Can\'t modify the context: context (page) code is not set.')

			// eslint-disable-next-line @typescript-eslint/restrict-plus-operands
			contextCode = (this.code + '\n').trimStart() + /** @type {string} */ (commentCode)
		}

		return { contextCode, commentCode }
	}

	/**
	 * Enrich the page instance with the properties regarding whether new topics go on top on this
	 * page (based on various factors) and, if new topics are on top, the start index of the first
	 * section.
	 *
	 * @returns {{
	 *   areNewTopicsOnTop: boolean;
	 *   firstSectionStartIndex: number | undefined;
	 * }}
	 * @throws {CdError}
	 * @private
	 */
	guessNewTopicPlacement() {
		this.assertCode('Can\'t analyze the placement of new topics: page code is not set.')

		let areNewTopicsOnTop = cd.config.areNewTopicsOnTop?.(this.page.name, this.code)

		const adjustedCode = maskDistractingCode(this.code)
		const sectionHeadingRegexp = PageSource.getTopicHeadingRegexp()

		if (areNewTopicsOnTop === undefined || areNewTopicsOnTop === null) {
			// Detect the topic order: newest first or newest last.
			let previousDate
			let difference = 0
			let sectionHeadingMatch
			while ((sectionHeadingMatch = sectionHeadingRegexp.exec(adjustedCode))) {
				const timestamp = findFirstTimestamp(this.code.slice(sectionHeadingMatch.index))
				const { date } = (timestamp && parseTimestamp(timestamp)) || {}
				if (date) {
					if (previousDate) {
						difference += date > previousDate ? -1 : 1
					}
					previousDate = date
				}
			}
			areNewTopicsOnTop = difference === 0 && mw.config.get('wgServerName') === 'ru.wikipedia.org'
				? this.page.namespaceId % 2 === 0
				: difference > 0
		}

		return {
			areNewTopicsOnTop,

			// We only need the first section's index when new topics are on top.
			firstSectionStartIndex: areNewTopicsOnTop
				? sectionHeadingRegexp.exec(adjustedCode)?.index
				: undefined,
		}
	}

	/**
	 * Determine an offset in the code to insert a new/moved section into. If `referenceDate` is
	 * specified, will take chronological order into account.
	 *
	 * @param {Date} [referenceDate]
	 * @returns {number}
	 * @throws {CdError}
	 */
	findProperPlaceForSection(referenceDate) {
		this.assertCode('Can\'t find the proper place for a section: page code is not set.')

		const { areNewTopicsOnTop, firstSectionStartIndex } = this.guessNewTopicPlacement()

		if (!referenceDate) {
			return areNewTopicsOnTop ? firstSectionStartIndex || 0 : this.code.length
		}

		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const adjustedCode = maskDistractingCode(this.code)
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const sectionHeadingRegexp = PageSource.getTopicHeadingRegexp()
		let sectionHeadingMatch
		const sections = []
		while ((sectionHeadingMatch = sectionHeadingRegexp.exec(adjustedCode))) {
			const timestamp = findFirstTimestamp(this.code.slice(sectionHeadingMatch.index))
			const { date } = (timestamp && parseTimestamp(timestamp)) || {}
			sections.push({
				date,
				index: sectionHeadingMatch.index,
			})
		}

		return (
		// Proper place index
			sections.find(
				({ date }) => date && (areNewTopicsOnTop ? date < referenceDate : date > referenceDate)
			)?.index ||

			this.code.length
		)
	}

	/**
	 * Get the regexp for traversing topic headings.
	 *
	 * @returns {RegExp}
	 */
	static getTopicHeadingRegexp() {
		return /^==[^=].*?==[ \t\u0001\u0002]*\n/gm
	}
}
