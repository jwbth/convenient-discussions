import CommentFormInputTransformer from './CommentFormInputTransformer'
import commentManager from './commentManager'
import cd from './loader/cd'
import CdError from './shared/CdError'

/**
 * @typedef {object} EditApiParams
 * @property {string} text
 * @property {string} [section]
 * @property {string} [sectiontitle]
 * @property {number} [baserevid]
 * @property {string} [starttimestamp]
 */

/**
 * Edit sent through the edit API, or through its new-section mode.
 *
 * @typedef {object} EditApiEdit
 * @property {'edit'} api
 * @property {EditApiParams} params
 * @property {{ revisionId: number } | { code: string }} diffBase What "View changes" compares the
 *   new code with.
 * @property {string} commentCode
 * @property {boolean} isIndented
 */

/**
 * Reply sent through the DiscussionTools API, for a comment CD can't locate but DiscussionTools
 * knows.
 *
 * @typedef {object} DtApiEdit
 * @property {'discussiontoolsedit'} api
 * @property {{ paction: 'addcomment'; page: string; commentid: string; wikitext: string }} params
 */

/**
 * @typedef {EditApiEdit | DtApiEdit} Edit
 */

/**
 * Extract IDs from comment links in the code.
 *
 * @param {string} code
 * @returns {string[]}
 */
function extractCommentIds(code) {
	// Russian Wikipedia's Wikificator may mangle these links, replacing `_` with ` `, so we search
	// for both characters.
	return [...code.matchAll(/\[\[#(\d{12}[_ ][^|\]]+)/g)].map((match) => match[1])
}

/**
 * Add anchor code to comments linked from the comment.
 *
 * @param {string} originalContextCode
 * @param {string[]} commentIds
 * @returns {string} New context code.
 * @throws {CdError}
 */
function addAnchorsToComments(originalContextCode, commentIds) {
	let contextCode = originalContextCode
	commentIds.forEach((id) => {
		const comment = commentManager.getById(id)
		if (comment) {
			const commentSource = comment.locateInCode(undefined, contextCode)
			const anchorCode = cd.config.getAnchorCode(id)
			if (commentSource.code.includes(anchorCode)) return

			const commentCodePart = CommentFormInputTransformer.prependIndentationToLine(
				commentSource.indentation,
				commentSource.code,
			)
			const commentTextIndex = /** @type {RegExpMatchArray} */ (
				commentCodePart.match(/^[:*#]* */)
			)[0].length
			;({ contextCode } = commentSource.modifyContext({
				action: 'edit',
				commentCode:
					(commentSource.headingCode || '') +
					commentCodePart.slice(0, commentTextIndex) +
					anchorCode +
					commentCodePart.slice(commentTextIndex) +
					commentSource.signatureDirtyCode,
				contextCode,
			}))
		} else if (!$('#' + id).length) {
			throw new CdError({
				type: 'parse',
				code: 'commentLinks-commentNotFound',
				details: { id },
			})
		}
	})

	return contextCode
}

/**
 * Load the target's context code and locate the target in it.
 *
 * @param {import('./CommentForm').CommentFormMode} mode
 * @param {import('./CommentForm').CommentFormTarget} target
 * @returns {Promise<import('./loadContextCode').LoadContextCodeResult<import('./CommentForm').Source>>}
 * @throws {CdError|Error}
 */
export async function loadTarget(mode, target) {
	if (mode === 'addSection') {
		const page = /** @type {import('./CurrentPage').default} */ (target)
		await page.loadCode(undefined, !page.exists())

		return { source: page.source, isInSectionContext: false, needsDtApi: false }
	}

	return mode === 'reply' || mode === 'edit'
		? /** @type {import('./Comment').default} */ (target).loadCode({ useDtFallback: true })
		: /** @type {import('./Section').default} */ (target).loadCode()
}

/**
 * Build a comment form's edit: load the target's context code, locate the target, build the
 * comment code, splice it, and add anchors to linked comments. Loads fresh context code on every
 * call, except for the new-section API, which needs no context code.
 *
 * @template {import('./CommentForm').CommentFormMode} Mode
 * @param {import('./CommentForm').CommentFormValues<Mode>} values
 * @param {import('./CommentForm').TypedTarget<Mode>} target
 * @param {'submit'|'viewChanges'} action
 * @returns {Promise<Edit>}
 * @throws {CdError|Error}
 */
export default async function buildEdit(values, target, action) {
	const commentIds = extractCommentIds(values.comment)
	const isNewSectionApi = Boolean(
		values.mode === 'addSection' &&
		!values.newTopicOnTop &&
		values.headline?.trim() &&
		!commentIds.length,
	)

	const { source, isInSectionContext, needsDtApi } = isNewSectionApi
		? {
				source: /** @type {import('./CurrentPage').default} */ (target).source,
				isInSectionContext: false,
				needsDtApi: false,
			}
		: await loadTarget(values.mode, target)

	if (needsDtApi) {
		const comment = /** @type {import('./Comment').default} */ (target)

		return {
			api: 'discussiontoolsedit',
			params: {
				paction: 'addcomment',
				page: comment.getSourcePage().name,
				commentid: /** @type {string} */ (comment.dtId),
				wikitext: values.comment,
			},
		}
	}

	const locatedSource = /** @type {import('./CommentForm').Source} */ (source)
	if (values.actualCommentLevel !== undefined && 'reprocessWithLevel' in locatedSource) {
		// The user accepted fixing the comment's broken indentation.
		locatedSource.reprocessWithLevel(values.actualCommentLevel)
	}

	// The reply place sets the reply indentation and the outdent flag, which building the comment
	// code reads.
	const replyPlace =
		values.mode === 'reply'
			? /** @type {import('./CommentSource').default} */ (locatedSource).findReplyPlace()
			: undefined
	const { code: commentCode, isIndented } = CommentFormInputTransformer.inputToCode(
		values,
		target,
		action,
		isNewSectionApi,
	)
	let { contextCode } = locatedSource.modifyContext({
		action: values.mode,
		commentCode,
		doDelete: values.delete,
		replyPlace,
		sectionSource:
			values.delete &&
			/** @type {import('./CommentSource').default} */ (locatedSource).deletesWholeSection()
				? /** @type {import('./Section').default} */ (
						/** @type {import('./Comment').default} */ (target).section
					).getSource()
				: undefined,
		isNewTopicOnTop: values.newTopicOnTop,
		isNewSectionApi,
	})
	contextCode = addAnchorsToComments(contextCode, commentIds)

	const targetPage =
		values.mode === 'addSection'
			? /** @type {import('./CurrentPage').default} */ (target)
			: /** @type {import('./Comment').default | import('./Section').default} */ (
					target
				).getSourcePage()
	const section = isInSectionContext
		? /** @type {import('./Section').default} */ (target.getRelevantSection())
		: undefined
	const sectionOrPage = isNewSectionApi ? undefined : section || targetPage

	return {
		api: 'edit',
		params: {
			text: contextCode,
			section: isNewSectionApi
				? 'new'
				: typeof section?.liveSectionNumber === 'number'
					? String(section.liveSectionNumber)
					: undefined,
			sectiontitle: isNewSectionApi ? values.headline?.trim() : undefined,
			baserevid: sectionOrPage?.revisionId,
			starttimestamp: sectionOrPage?.queryTimestamp,
		},
		diffBase: section
			? { code: /** @type {string} */ (section.presumedCode) }
			: isNewSectionApi || !targetPage.revisionId
				? { code: '' }
				: { revisionId: targetPage.revisionId },
		commentCode,
		isIndented,
	}
}
