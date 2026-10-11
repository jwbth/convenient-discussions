/**
 * Make comment form values of an empty form, overridden by the values provided.
 *
 * @template {import('../src/CommentForm').CommentFormMode} Mode
 * @param {Mode} mode
 * @param {Partial<import('../src/CommentForm').CommentFormValues<Mode>>} [values]
 * @returns {import('../src/CommentForm').CommentFormValues<Mode>}
 */
export function makeCommentFormValues(mode, values = {}) {
	return {
		mode,
		comment: '',
		headline: undefined,
		omitSignature: false,
		delete: false,
		newTopicOnTop: false,
		containerListType: undefined,
		actualCommentLevel: undefined,
		commentForm: /** @type {any} */ ({}),
		...values,
	}
}
