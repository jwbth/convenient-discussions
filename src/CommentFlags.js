/**
 * @typedef {'new' | 'own' | 'target' | 'hovered' | 'deleted' | 'changed' | 'linked'} CommentFlag
 */

/**
 * Manages flags for a comment.
 *
 * @private
 */
export default class CommentFlags {
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
		this.flags = new Set(initialFlags || [])
	}

	/**
	 * @param {CommentFlag} flag
	 * @returns {boolean}
	 */
	has(flag) {
		return this.flags.has(flag)
	}

	/**
	 * @param {CommentFlag} flag
	 * @returns {void}
	 */
	add(flag) {
		this.flags.add(flag)
	}

	/**
	 * @param {CommentFlag} flag
	 * @returns {void}
	 */
	remove(flag) {
		this.flags.delete(flag)
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
		return this.flags.size > 0
	}

	/**
	 * @returns {CommentFlag[]}
	 */
	toArray() {
		return [...this.flags]
	}

	/**
	 * @returns {Array<{name: CommentFlag, value: boolean}>}
	 */
	getStyleFlags() {
		return CommentFlags.styleFlagNames.map((flagName) => ({
			name: flagName,
			value: this.has(flagName),
		}))
	}
}
