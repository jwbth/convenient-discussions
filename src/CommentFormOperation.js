/**
 * A single comment form operation.
 */

/**
 * @typedef {'load'|'preview'|'viewChanges'|'submit'} CommentFormOperationType
 */

/**
 * @typedef {object} CommentFormOperationOptions
 * @property {boolean} [affectsHeadline] Whether the operation affects the headline.
 * @property {boolean} [isAuto] Whether the operation is automatic.
 */

/**
 * A comment form operation.
 */
export default class CommentFormOperation {
	/**
	 * Create a comment form operation.
	 *
	 * @param {import('./CommentFormOperationRegistry').default} registry Operation registry.
	 * @param {CommentFormOperationType} type Operation type.
	 * @param {CommentFormOperationOptions} options
	 */
	constructor(registry, type, options) {
		this.registry = registry
		this.commentForm = registry.commentForm
		this.type = type
		this.options = options
	}

	/**
	 * Mark the operation as open. (Supposed to be called after its creation.)
	 *
	 * @param {boolean} clearMessages Whether to clear the messages above the comment form.
	 */
	open(clearMessages) {
		this.date = new Date()
		this.closed = false
		this.delayed = false

		if (this.type !== 'preview' || !this.options.isAuto) {
			if (clearMessages && !this.commentForm.captchaInput) {
				this.commentForm.$messageArea.empty()
			}
			this.commentForm.pushPending(
				['load', 'submit'].includes(this.type),
				this.options.affectsHeadline,
			)
		}
	}

	/**
	 * Mark the operation as closed if it is open and not closed; {@link
	 * CommentFormOperationRegistry#remove unregister} it. Should be called when the operation has
	 * finished (either successfully or not).
	 */
	close() {
		if (!this.isOpen() || this.isClosed()) return

		if (!(this.type === 'preview' && this.options.isAuto)) {
			this.commentForm.popPending(
				['load', 'submit'].includes(this.type),
				this.options.affectsHeadline,
			)
		}

		this.registry.remove(this)
		this.closed = true
	}

	/**
	 * Mark the operation as delayed.
	 */
	delay() {
		this.delayed = true
	}

	/**
	 * Unmark the operation as delayed.
	 */
	undelay() {
		this.delayed = false
	}

	/**
	 * Check for conflicts of the operation with other pending operations, and if there are such,
	 * {@link CommentFormOperationRegistry#close close} the operation and return `true` so that the
	 * caller can abort it.
	 *
	 * The rules are the following:
	 * - `preview` and `viewChanges` operations can be overriden with other of one of these types
	 *   (every new request replaces the old, although a new automatic preview request cannot be made
	 *   while the old is pending).
	 * - `submit` operations cannot be overriden (and are not checked by this function), but also
	 *   don't override existing `preview` and `viewChanges` operations (so that the user gets the
	 *   last autopreview even after they have sent the comment).
	 *
	 * For convenience, can also check for an arbitrary condition and close the operation if it is
	 * `true`.
	 *
	 * @returns {boolean}
	 */
	closeIfConflicted() {
		if (!this.isOpen()) {
			return false
		}

		if (this.isClosed()) {
			return true
		}

		if (
			this.registry.query(
				(op) =>
					op.isOpen() &&
					['preview', 'viewChanges'].includes(op.getType()) &&
					op.date > this.date &&
					// If we delete this line, then, with autopreview enabled, the preview will be updated only
					// when the user stops typing.
					!op.isDelayed(),
			).length
		) {
			this.close()

			return true
		}

		return false
	}

	/**
	 * Get the type of the operation.
	 *
	 * @returns {CommentFormOperationType}
	 */
	getType() {
		return this.type
	}

	/**
	 * Get the value of an option.
	 *
	 * @template {keyof CommentFormOperationOptions} T
	 * @param {T} name Option name.
	 * @returns {CommentFormOperationOptions[T]}
	 */
	getOptionValue(name) {
		return this.options[name]
	}

	/**
	 * Get the date of the operation.
	 *
	 * @returns {Date | undefined}
	 */
	getDate() {
		return this.date
	}

	/**
	 * Check whether the operation is open.
	 *
	 * @returns {this is { date: Date }}
	 */
	isOpen() {
		return Boolean(this.date)
	}

	/**
	 * Check whether the operation is closed (settled).
	 *
	 * @returns {this is { closed: true }}
	 */
	isClosed() {
		return Boolean(this.closed)
	}

	/**
	 * Check whether the operation is delayed.
	 *
	 * @returns {this is { delayed: true }}
	 */
	isDelayed() {
		return Boolean(this.delayed)
	}
}
