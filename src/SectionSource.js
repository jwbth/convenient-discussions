import CommentSource from './CommentSource'
import cd from './loader/cd'
import CdError from './shared/CdError'
import { calculateWordOverlap, genericGetOldestOrNewestByDateProp } from './shared/utils-general'
import {
	endWithTwoNewlines,
	maskDistractingCode,
	normalizeCode,
	removeWikiMarkup,
} from './shared/utils-wikitext'
import { extractSignatures } from './utils-window'

/**
 * @typedef {object} SectionData
 * @property {string} headline
 * @property {number} index Index among the sections of the page.
 * @property {string[]} previousHeadlines Headlines of the sections before the section, nearest
 *   first.
 * @property {{ author: import('./User').default, timestamp?: string, text: string }} [oldestComment]
 *   Oldest comment of the section.
 * @property {import('./CommentSource').CommentData} [lastCommentData] Comment data of the last
 *   comment in the section's first chunk.
 */

/**
 * Class that keeps the methods and data related to a section's source code. Also used for section
 * source match candidates before a single match is chosen among them.
 */
class SectionSource {
	/**
	 * Section the source was located for, set by {@link Section#locateInCode}. Only the splice reads
	 * it.
	 *
	 * @type {import('./Section').default | undefined}
	 */
	section

	/**
	 * Indentation of the last comment in the section's first chunk or a reply placeholder, cached by
	 * {@link SectionSource#extractLastCommentIndentation}.
	 *
	 * @type {string | null | undefined}
	 */
	lastCommentIndentation

	/**
	 * Index of the first character of the section code.
	 *
	 * @type {number}
	 */
	startIndex

	/**
	 * Index of the last character of the section code.
	 *
	 * @type {number}
	 */
	endIndex

	/**
	 * Section code.
	 *
	 * @type {string}
	 */
	code

	/**
	 * Index of the first character of the section content (i.e., everything after the section
	 * heading).
	 *
	 * @type {number}
	 */
	contentStartIndex

	/**
	 * Index of the last character of the section content, before the code that we intentionally keep
	 * in section endings (see {@link convenientDiscussions.g.keepInSectionEnding}).
	 *
	 * @type {number}
	 */
	contentEndIndex

	/**
	 * Index of the first character of the section content relative to the section code start.
	 *
	 * @type {number}
	 */
	relativeContentStartIndex

	/**
	 * Index of the last character of the first chunk of the section code (i.e., everything before
	 * the first section subdivision).
	 *
	 * @type {number}
	 */
	firstChunkEndIndex

	/**
	 * Index of the last character of the first chunk of the section content (i.e., everything
	 * before the first section subdivision).
	 *
	 * @type {number}
	 */
	firstChunkContentEndIndex

	/**
	 * First chunk of the section code (i.e., everything before the first section subdivision).
	 *
	 * @type {string}
	 */
	firstChunkCode

	/**
	 * Normalized section heading.
	 *
	 * @type {string}
	 */
	headline

	/**
	 * Create a section's source object.
	 *
	 * @param {object} options
	 * @param {SectionData} options.sectionData
	 * @param {RegExpMatchArray} options.sectionHeadingMatch
	 * @param {string} options.contextCode
	 * @param {string} options.adjustedContextCode
	 * @param {boolean} options.isInSectionContext
	 * @private
	 */
	constructor({
		sectionData,
		sectionHeadingMatch,
		contextCode,
		adjustedContextCode,
		isInSectionContext,
	}) {
		this.sectionData = sectionData
		this.contextCode = contextCode
		this.isInSectionContext = isInSectionContext

		try {
			this.collectMatchData(sectionHeadingMatch, contextCode, adjustedContextCode)
		} catch (error) {
			cd.debug.logWarn(`Couldn't read the "${this.headline}" section contents.`, error)

			return
		}
	}

	/**
	 * _For internal use._ Extract the section's last comment's indentation characters if needed or a
	 * vote / bulleted reply placeholder.
	 *
	 * @param {ListType | undefined} containerListType Type of the list the comment form
	 *   is in.
	 * @returns {?string}
	 */
	extractLastCommentIndentation(containerListType) {
		if (this.lastCommentIndentation === undefined) {
			const [, replyPlaceholder] = this.firstChunkCode.match(/\n([#*]) *\n+$/) || []
			if (replyPlaceholder) {
				this.lastCommentIndentation = replyPlaceholder
			} else {
				this.lastCommentIndentation = null

				const { lastCommentData } = this.sectionData
				if (
					lastCommentData &&
					(containerListType === 'ol' || cd.config.indentationCharMode === 'mimic')
				) {
					const source = CommentSource.locate(
						this.contextCode,
						lastCommentData,
						this.isInSectionContext,
					)
					if (
						source &&
						(!source.indentation.startsWith('#') ||
							// For now we use the workaround with the container list type to make sure `#` is a
							// part of comments organized in a numbered list, not of a numbered list _in_ the
							// target comment.
							containerListType === 'ol')
					) {
						this.lastCommentIndentation = source.indentation
					}
				}
			}
		}

		return this.lastCommentIndentation
	}

	/**
	 * Modify a whole section or page code string related to the section in accordance with an action.
	 *
	 * @param {object} options
	 * @param {import('./CommentForm').CommentFormMode} options.action `'replyInSection'` or
	 *   `'addSubsection'`.
	 * @param {string} [options.commentCode] Comment code, including trailing newlines and the
	 *   signature. NOTE: It is required (set to optional for polymorphism with CommentSource and
	 *   PageSource).
	 * @returns {{
	 *   contextCode: string;
	 *   commentCode: string;
	 * }}
	 */
	modifyContext({ action, commentCode }) {
		const section = this.getSection()
		const originalContextCode = this.isInSectionContext
			? section.presumedCode
			: section.getSourcePage().source.getCode()
		if (!originalContextCode) {
			throw new CdError({
				type: 'internal',
				message: 'Context (section or page) code is not set.',
			})
		}

		let contextCode
		switch (/** @type {'replyInSection' | 'addSubsection'} */ (action)) {
			case 'replyInSection': {
				contextCode =
					originalContextCode.slice(0, this.firstChunkContentEndIndex) +
					// eslint-disable-next-line @typescript-eslint/restrict-plus-operands
					/** @type {string} */ (commentCode) +
					originalContextCode.slice(this.firstChunkContentEndIndex)
				break
			}

			case 'addSubsection': {
				contextCode =
					endWithTwoNewlines(originalContextCode.slice(0, this.contentEndIndex)) +
					// eslint-disable-next-line @typescript-eslint/restrict-plus-operands
					/** @type {string} */ (commentCode) +
					originalContextCode.slice(this.contentEndIndex).trim()
				break
			}
		}

		return {
			contextCode,
			// eslint-disable-next-line object-shorthand
			commentCode: /** @type {string} */ (commentCode),
		}
	}

	/**
	 * Collect data for the match, including section text, first chunk text, indexes, etc.
	 *
	 * @param {RegExpMatchArray} sectionHeadingMatch
	 * @param {string} contextCode
	 * @param {string} adjustedContextCode
	 * @throws {CdError}
	 * @private
	 */
	collectMatchData(sectionHeadingMatch, contextCode, adjustedContextCode) {
		const fullHeadingMatch = sectionHeadingMatch[1]
		const codeFromSection = contextCode.slice(sectionHeadingMatch.index)
		const adjustedCodeFromSection = adjustedContextCode.slice(sectionHeadingMatch.index)

		// Logically, should match since sectionHeadingMatch matched
		const sectionMatch =
			adjustedCodeFromSection.match(
				new RegExp(
					// Will fail at `===` or the like.
					'(' +
						mw.util.escapeRegExp(fullHeadingMatch) +
						String.raw`[^]*?\n)` +
						`={1,${sectionHeadingMatch[2].length}}` +
						String.raw`[^=].*=+[ \t\u0001\u0002]*\n`,
				),
			) ||
			adjustedCodeFromSection.match(
				new RegExp('(' + mw.util.escapeRegExp(fullHeadingMatch) + '[^]*$)'),
			)

		// To simplify the workings of the `replyInSection` mode we don't consider terminating line
		// breaks to be a part of the first chunk of the section (i.e., the section subdivision before
		// the first heading).
		const firstChunkMatch =
			adjustedCodeFromSection.match(
				new RegExp(
					// Will fail at "===" or the like.
					'(' +
						mw.util.escapeRegExp(fullHeadingMatch) +
						String.raw`[^]*?\n)\n*` +
						// Any next heading.
						'={1,6}' +
						String.raw`[^=].*=+[ \t\u0001\u0002]*\n`,
				),
			) ||
			adjustedCodeFromSection.match(
				new RegExp('(' + mw.util.escapeRegExp(fullHeadingMatch) + '[^]*$)'),
			)
		if (!sectionMatch || !firstChunkMatch) {
			throw new CdError()
		}

		const code = codeFromSection.substr(
			/** @type {number} */ (sectionMatch.index),
			sectionMatch[1].length,
		)
		const firstChunkCode = codeFromSection.substr(
			/** @type {number} */ (firstChunkMatch.index),
			firstChunkMatch[1].length,
		)

		const startIndex = /** @type {number} */ (sectionHeadingMatch.index)
		const endIndex = startIndex + code.length
		const contentStartIndex = startIndex + sectionHeadingMatch[0].length
		const firstChunkEndIndex = startIndex + firstChunkCode.length

		let firstChunkContentEndIndex = firstChunkEndIndex
		let contentEndIndex = endIndex
		cd.g.keepInSectionEnding.forEach((regexp) => {
			const firstChunkRegexpMatch = firstChunkCode.match(regexp)
			if (firstChunkRegexpMatch) {
				// `1` accounts for the first line break.
				firstChunkContentEndIndex -= firstChunkRegexpMatch[0].length - 1
			}

			const regexpMatch = code.match(regexp)
			if (regexpMatch) {
				// `1` accounts for the first line break.
				contentEndIndex -= regexpMatch[0].length - 1
			}
		})

		/*
			Sections may have `#` or `*` as a placeholder for a vote or bulleted reply. In this case,
			we must use that `#` or `*` in the reply. As for the placeholder, perhaps we should remove
			it, but as for now, we keep it because if:

			- the placeholder character is `*`,
			- `cd.config.indentationCharMode` is `'unify'`,
			- `cd.config.defaultIndentationChar` is `':'`, and
			- there is more than one reply,

			the next reply would go back to `:`, not `*` as should be.
		*/
		const placeholderMatch = firstChunkCode.match(/\n([#*] *\n+)$/)
		if (placeholderMatch) {
			firstChunkContentEndIndex -= placeholderMatch[1].length
		}

		this.startIndex = startIndex
		this.endIndex = endIndex
		this.code = code
		this.contentStartIndex = contentStartIndex
		this.contentEndIndex = contentEndIndex
		this.relativeContentStartIndex = contentStartIndex - startIndex
		this.firstChunkEndIndex = firstChunkEndIndex
		this.firstChunkContentEndIndex = firstChunkContentEndIndex
		this.firstChunkCode = firstChunkCode
		this.headline = normalizeCode(removeWikiMarkup(sectionHeadingMatch[3]))
	}

	/**
	 * Calculate and set a score for the match.
	 *
	 * @param {number} sectionIndex
	 * @param {string} thisHeadline
	 * @param {string[]} headlines
	 * @returns {{
	 *   source: SectionSource,
	 *   score: number,
	 * }}
	 * @private
	 */
	calculateMatchScore(sectionIndex, thisHeadline, headlines) {
		const { index, previousHeadlines, oldestComment } = this.sectionData
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const doesHeadlineMatch = thisHeadline.includes('{{') ? 0.5 : this.headline === thisHeadline

		let doesSectionIndexMatch
		let doPreviousHeadlinesMatch
		if (this.isInSectionContext) {
			doesSectionIndexMatch = 0
			doPreviousHeadlinesMatch = 0
		} else {
			// Matching section index is one of the most unreliable ways to tell matching sections as
			// sections may be added and removed from the page, so we don't rely on it very much.
			doesSectionIndexMatch = index === sectionIndex

			const previousHeadlinesToCheckCount = 3
			const previousHeadlinesInCode = headlines.slice(-previousHeadlinesToCheckCount).reverse()
			doPreviousHeadlinesMatch = previousHeadlines
				.slice(0, previousHeadlinesToCheckCount)
				.every((headline, i) => normalizeCode(headline) === previousHeadlinesInCode[i])
		}

		headlines.push(this.headline)

		const oldestSig = genericGetOldestOrNewestByDateProp(
			extractSignatures(this.code),
			'oldest',
			true,
		)
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const doesOldestCommentMatch = oldestSig
			? Boolean(
					oldestComment &&
						oldestSig.timestamp === oldestComment.timestamp &&
						oldestSig.author === oldestComment.author,
				)
			: // There's no comments neither in the code nor on the page.
				!oldestComment

		// Multiply by 0.5 to avoid situations like
		// https://commons.wikimedia.org/w/index.php?title=User_talk:Jack_who_built_the_house&oldid=956309089#Unwanted_pings_on_en.wikipedia,
		// even though they are not CD's fault
		let oldestCommentWordOverlap = Number(!oldestComment && !oldestSig) * 0.5

		if (oldestComment && oldestSig) {
			// Use the comment text overlap factor due to this error
			// https://www.wikidata.org/w/index.php?diff=1410718962. The comment's source code is
			// extracted only superficially, without exluding the headline code and other operations
			// performed in Comment#adjustCommentBeginning.
			oldestCommentWordOverlap = calculateWordOverlap(
				oldestComment.text,
				removeWikiMarkup(this.code.slice(oldestSig.commentStartIndex, oldestSig.startIndex)),
			)
		}

		// If changing this, change the maximal possible score in SectionSource.locate
		return {
			source: this,
			score:
				Number(doesOldestCommentMatch) * 1 +
				oldestCommentWordOverlap +
				Number(doesHeadlineMatch) * 1 +
				Number(doesSectionIndexMatch) * 0.5 +
				// Shouldn't give too high a weight to this factor as it is true for every first section.
				Number(doPreviousHeadlinesMatch) * 0.25,
		}
	}

	/**
	 * Locate a section in context code.
	 *
	 * @param {string} contextCode
	 * @param {SectionData} sectionData
	 * @param {boolean} [isInSectionContext] Whether the context code is the code of the section (not
	 *   page).
	 * @returns {SectionSource | undefined} The best-scoring candidate, if any scores enough.
	 */
	static locate(contextCode, sectionData, isInSectionContext = false) {
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const thisHeadline = normalizeCode(sectionData.headline)
		const adjustedContextCode = maskDistractingCode(contextCode, true)
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const sectionHeadingRegexp = /^((=+)(.*)\2[ \t\u0001\u0002]*)\n/gm

		const sourcesWithScores = []
		/** @type {string[]} */
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const headlines = []
		let sectionIndex = -1
		let sectionHeadingMatch
		while ((sectionHeadingMatch = sectionHeadingRegexp.exec(adjustedContextCode))) {
			sectionIndex++
			const sourceWithScore = new SectionSource({
				sectionData,
				sectionHeadingMatch,
				contextCode,
				adjustedContextCode,
				isInSectionContext,
			}).calculateMatchScore(sectionIndex, thisHeadline, headlines)
			if (sourceWithScore.score <= 1) continue

			sourcesWithScores.push(sourceWithScore)

			// Maximal possible score
			if (sourceWithScore.score === 3.75) break
		}

		return sourcesWithScores.sort((m1, m2) => m2.score - m1.score)[0]?.source
	}

	/**
	 * Get the section the source was located for.
	 *
	 * @returns {import('./Section').default}
	 * @throws {CdError}
	 * @private
	 */
	getSection() {
		if (!this.section) {
			throw new CdError({
				type: 'internal',
				message: 'The section source was located without a section.',
			})
		}

		return this.section
	}
}

export default SectionSource
