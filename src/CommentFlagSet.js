/**
 * Comment flag types:
 * - `new`: The comment is new. Set to a boolean only on active pages (not archived pages, not old
 *   diffs) excluding pages that are visited for the first time.
 * - `own`: The comment is authored by the current user.
 * - `target`: The comment is currently highlighted as a target comment.
 * - `hovered`: The comment is currently being hovered over.
 * - `deleted`: The comment was deleted while the page was idle.
 * - `changed`: The comment has changed while the page was idle. (The new version may be rendered
 *   and may be not, if the layout is too complex.)
 * - `linked`: The comment is currently highlighted as a linked comment (opened via URL fragment).
 *
 * @typedef {'new' | 'own' | 'target' | 'hovered' | 'deleted' | 'changed' | 'linked'} CommentFlag
 */

/**
 * Manages flags for a comment.
 *
 * @private
 */
export default class CommentFlagSet {
	/**
	 * Flags that affect the comment overlay/underlay styles.
	 *
	 * @type {CommentFlag[]}
	 */
	static styleFlagNames = ['new', 'own', 'target', 'hovered', 'deleted', 'changed', 'linked']

	/**
	 * @param {CommentFlag[]|undefined} [initialFlags]
	 */
	constructor(initialFlags) {
		this.set = new Set(initialFlags || [])
	}

	/**
	 * @param {CommentFlag} flag
	 * @returns {boolean}
	 */
	has(flag) {
		return this.set.has(flag)
	}

	/**
	 * @param {CommentFlag} flag
	 * @returns {void}
	 */
	add(flag) {
		this.set.add(flag)
	}

	/**
	 * @param {CommentFlag} flag
	 * @returns {void}
	 */
	remove(flag) {
		this.set.delete(flag)
	}

	/**
	 * @param {CommentFlag} flag
	 * @param {boolean} value
	 * @returns {void}
	 */
	toggle(flag, value) {
		if (value) {
			this.add(flag)
		} else {
			this.remove(flag)
		}
	}

	/**
	 * @returns {boolean}
	 */
	hasAny() {
		return this.set.size > 0
	}

	/**
	 * @returns {CommentFlag[]}
	 */
	toArray() {
		return [...this.set]
	}

	/**
	 * @returns {Array<{name: CommentFlag, value: boolean}>}
	 */
	getStyleFlags() {
		return CommentFlagSet.styleFlagNames.map((flagName) => ({
			name: flagName,
			value: this.has(flagName),
		}))
	}
}
