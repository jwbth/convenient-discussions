import CommentFormOperation from './CommentFormOperation'
import { removeFromArrayIfPresent } from './shared/utils-general'

/**
 * An operation registry: a storage of operations that a comment form currently undergoes, such as
 * `'load'` or `'submit'`.
 */
class CommentFormOperationRegistry {
	/**
	 * @type {CommentFormOperation[]}
	 */
	items = []

	/**
	 * Create an operation registry.
	 *
	 * @param {import('./CommentForm').default} commentForm
	 */
	constructor(commentForm) {
		this.commentForm = commentForm
	}

	/**
	 * Add an operation to the registry and open it.
	 *
	 * @param {'load'|'preview'|'viewChanges'|'submit'} type
	 * @param {import('./CommentFormOperation').CommentFormOperationOptions} [options]
	 * @param {boolean} [clearMessages] Whether to clear messages above the comment form.
	 * @returns {CommentFormOperation}
	 */
	add(type, options = {}, clearMessages = true) {
		const operation = new CommentFormOperation(this, type, options)
		this.items.push(operation)
		operation.open(clearMessages)

		return operation
	}

	/**
	 * Remove an operation from the registry.
	 *
	 * @param {CommentFormOperation} operation
	 */
	remove(operation) {
		removeFromArrayIfPresent(this.items, operation)
	}

	/**
	 * Close all registered operations.
	 */
	closeAll() {
		// Use .slice() because CommentFormOperationRegistry#close() also removes the operation from the
		// operation registry, this disrupting .forEach().
		this.items.slice().forEach((op) => {
			op.close()
		})
	}

	/**
	 * Find operations of the specified type in the registry.
	 *
	 * @param {'load'|'preview'|'viewChanges'|'submit'} type Operation type.
	 * @returns {CommentFormOperation[]}
	 */
	filterByType(type) {
		return this.items.filter((op) => op.getType() === type)
	}

	/**
	 * Find operations for which the specified callback returns a truthy value.
	 *
	 * @param {(operation: CommentFormOperation) => boolean} callback
	 * @returns {CommentFormOperation[]}
	 */
	query(callback) {
		return this.items.filter(callback)
	}
}

export default CommentFormOperationRegistry
