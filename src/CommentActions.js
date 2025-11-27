import cd from './loader/cd'
import commentManager from './commentManager'

/**
 * @typedef {import('./CommentButton').default} CommentButton
 */

/**
 * Base class for managing comment action buttons and functionality.
 * This class handles the creation and management of action buttons like reply, edit, thank, etc.
 */
class CommentActions {
	/**
	 * Create a CommentActions instance.
	 *
	 * @param {import('./Comment').default} comment The comment this actions instance belongs to.
	 */
	constructor(comment) {
		/**
		 * The comment this actions instance belongs to.
		 *
		 * @type {import('./Comment').default}
		 */
		this.comment = comment

		/**
		 * Reply button.
		 *
		 * @type {CommentButton | undefined}
		 */
		this.replyButton = undefined

		/**
		 * Edit button.
		 *
		 * @type {CommentButton | undefined}
		 */
		this.editButton = undefined

		/**
		 * Thank button.
		 *
		 * @type {CommentButton | undefined}
		 */
		this.thankButton = undefined

		/**
		 * Copy link button.
		 *
		 * @type {CommentButton | undefined}
		 */
		this.copyLinkButton = undefined

		/**
		 * "Go to parent" button.
		 *
		 * @type {CommentButton | undefined}
		 */
		this.goToParentButton = undefined

		/**
		 * "Go to child" button.
		 *
		 * @type {CommentButton | undefined}
		 */
		this.goToChildButton = undefined

		/**
		 * "Toggle child threads" button.
		 *
		 * @type {CommentButton | undefined}
		 */
		this.toggleChildThreadsButton = undefined
	}

	/**
	 * Create and add all appropriate action buttons for this comment.
	 */
	create() {
		this.addReplyButton()
		this.addEditButton()
		this.addThankButton()
		this.addGoToParentButton()
	}

	/**
	 * Reusable action for reply button.
	 */
	onReplyAction = () => {
		if (this.comment.replyForm) {
			this.comment.replyForm.cancel()
		} else {
			this.comment.reply()
		}
	}

	/**
	 * Reusable action for edit button.
	 */
	onEditAction = () => {
		this.comment.edit()
	}

	/**
	 * Reusable action for thank button.
	 */
	onThankAction = () => {
		this.comment.thank()
	}

	/**
	 * Reusable action for copy link button.
	 *
	 * @param {MouseEvent | KeyboardEvent} event The event object.
	 */
	onCopyLinkAction = (event) => {
		this.comment.copyLink(event)
	}

	/**
	 * Reusable action for go to parent button.
	 */
	onGoToParentAction = () => {
		this.comment.goToParent()
	}

	/**
	 * Reusable action for go to child button.
	 */
	onGoToChildAction = () => {
		/** @type {import('./Comment').default} */ (this.comment.targetChild).scrollTo({ pushState: true })
	}

	/**
	 * Reusable action for toggle child threads button.
	 */
	onToggleChildThreadsAction = () => {
		this.comment.toggleChildThreads()
	}

	/**
	 * Create a reply button and add it to the appropriate container.
	 *
	 * This method should be overridden by subclasses for specific styling.
	 */
	addReplyButton() {
		if (!this.comment.isActionable) return

		this.replyButton = this.createReplyButton(this.onReplyAction)
		this.appendButton(this.replyButton)

		// Check if reply should be disabled due to outdented comments
		if (
			commentManager.getByIndex(this.comment.index + 1)?.isOutdented &&
			(
				!this.comment.section ||
				// Probably shouldn't add a comment to a numbered list
				this.comment.elements[0].matches('ol *')
			)
		) {
			this.replyButton.setDisabled(true)
			this.replyButton.setTooltip(cd.s('cm-reply-outdented-tooltip'))
		}
	}

	/**
	 * Create an edit button and add it to the appropriate container.
	 *
	 * This method should be overridden by subclasses for specific styling.
	 */
	addEditButton() {
		if (!this.comment.isEditable) return

		this.editButton = this.createEditButton(this.onEditAction)
		this.appendButton(this.editButton)
	}

	/**
	 * Create a thank button and add it to the appropriate container.
	 *
	 * This method should be overridden by subclasses for specific styling.
	 */
	addThankButton() {
		if (
			!cd.user.isRegistered() ||
			!this.comment.author.isRegistered() ||
			!this.comment.date ||
			this.comment.isOwn
		)
			return

		const isThanked = Object.entries(commentManager.getThanksStorage().getData()).some(
			// TODO: Remove `|| this.comment.dtId === thank.id || this.comment.id === thank.id` part
			// after migration is complete on January 1, 2026
			([id, thank]) =>
				this.comment.dtId === id || this.comment.id === id ||
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
				this.comment.dtId === thank?.id || this.comment.id === thank.id
		)

		this.thankButton = this.createThankButton(this.onThankAction, isThanked)
		this.appendButton(this.thankButton)

		if (isThanked) {
			this.setThanked()
		}
	}

	/**
	 * Create a copy link button and add it to the appropriate container.
	 *
	 * This method should be overridden by subclasses for specific styling.
	 */
	addCopyLinkButton() {
		if (!this.comment.id) return

		this.copyLinkButton = this.createCopyLinkButton(this.onCopyLinkAction)
		this.appendButton(this.copyLinkButton)
	}

	/**
	 * Create a "Go to parent" button and add it to the appropriate container.
	 *
	 * This method should be overridden by subclasses for specific styling.
	 */
	addGoToParentButton() {
		if (!this.comment.getParent()) return

		this.goToParentButton = this.createGoToParentButton(this.onGoToParentAction)
		this.appendButton(this.goToParentButton)
	}

	/**
	 * Create a "Go to child" button and add it to the appropriate container.
	 *
	 * This method should be overridden by subclasses for specific styling.
	 */
	maybeAddGoToChildButton() {
		if (!this.comment.targetChild) return

		this.comment.configureLayers()
		if (this.goToChildButton?.isConnected()) return

		this.goToChildButton = this.createGoToChildButton(this.onGoToChildAction)
		this.prependButton(this.goToChildButton)
	}

	/**
	 * Create a "Toggle child threads" button and add it to the appropriate container.
	 *
	 * This method should be overridden by subclasses for specific styling.
	 */
	addToggleChildThreadsButton() {
		if (
			!this.comment.getChildren().some((child) => child.thread) ||
			this.toggleChildThreadsButton?.isConnected()
		) {
			return
		}

		this.toggleChildThreadsButton = this.createToggleChildThreadsButton(this.onToggleChildThreadsAction)
		this.appendButton(this.toggleChildThreadsButton)

		this.toggleChildThreadsButton.element.addEventListener('mouseenter', () => {
			this.comment.maybeOnboardOntoToggleChildThreads()
		})
	}

	/**
	 * Set the thank button to thanked state.
	 */
	setThanked() {
		if (this.thankButton) {
			this.thankButton
				.setDisabled(true)
				.setLabel(cd.s('cm-thanked'))
				.setTooltip(cd.s('cm-thanked-tooltip'))
		}
	}

	/**
	 * Create a reply button. To be overridden by subclasses.
	 *
	 * @param {import('./Button').Action} _action The action to perform when clicked.
	 * @returns {CommentButton} The created button.
	 * @abstract
	 */
	createReplyButton(_action) {
		throw new Error('createReplyButton must be implemented by subclasses')
	}

	/**
	 * Create an edit button. To be overridden by subclasses.
	 *
	 * @param {import('./Button').Action} _action The action to perform when clicked.
	 * @returns {CommentButton} The created button.
	 * @abstract
	 */
	createEditButton(_action) {
		throw new Error('createEditButton must be implemented by subclasses')
	}

	/**
	 * Create a thank button. To be overridden by subclasses.
	 *
	 * @param {import('./Button').Action} _action The action to perform when clicked.
	 * @param {boolean} _isThanked Whether the comment is already thanked.
	 * @returns {CommentButton} The created button.
	 * @abstract
	 */
	createThankButton(_action, _isThanked) {
		throw new Error('createThankButton must be implemented by subclasses')
	}

	/**
	 * Create a copy link button. To be overridden by subclasses.
	 *
	 * @param {import('./Button').Action} _action The action to perform when clicked.
	 * @returns {CommentButton} The created button.
	 * @abstract
	 */
	createCopyLinkButton(_action) {
		throw new Error('createCopyLinkButton must be implemented by subclasses')
	}

	/**
	 * Create a "Go to parent" button. To be overridden by subclasses.
	 *
	 * @param {import('./Button').Action} _action The action to perform when clicked.
	 * @returns {CommentButton} The created button.
	 * @abstract
	 */
	createGoToParentButton(_action) {
		throw new Error('createGoToParentButton must be implemented by subclasses')
	}

	/**
	 * Create a "Go to child" button. To be overridden by subclasses.
	 *
	 * @param {import('./Button').Action} _action The action to perform when clicked.
	 * @returns {CommentButton} The created button.
	 * @abstract
	 */
	createGoToChildButton(_action) {
		throw new Error('createGoToChildButton must be implemented by subclasses')
	}

	/**
	 * Create a "Toggle child threads" button. To be overridden by subclasses.
	 *
	 * @param {import('./Button').Action} _action The action to perform when clicked.
	 * @returns {CommentButton} The created button.
	 * @abstract
	 */
	createToggleChildThreadsButton(_action) {
		throw new Error('createToggleChildThreadsButton must be implemented by subclasses')
	}

	/**
	 * Append a button to the appropriate container. To be overridden by subclasses.
	 *
	 * @param {CommentButton} _button The button to append.
	 * @abstract
	 */
	appendButton(_button) {
		throw new Error('appendButton must be implemented by subclasses')
	}

	/**
	 * Prepend a button to the appropriate container. To be overridden by subclasses.
	 *
	 * @param {CommentButton} _button The button to prepend.
	 * @abstract
	 */
	prependButton(_button) {
		throw new Error('prependButton must be implemented by subclasses')
	}

	/**
	 * Get the overlay menu container if available.
	 * This provides a clean abstraction for accessing overlay menu functionality.
	 *
	 * @returns {JQuery | undefined} The overlay menu jQuery object, or undefined if not available.
	 * @protected
	 */
	getOverlayMenu() {
		// Default implementation returns undefined - overlay menu is not available for all comment types
		return undefined
	}

	/**
	 * Check if overlay menu is available for this comment type.
	 *
	 * @returns {boolean} True if overlay menu is available.
	 * @protected
	 */
	hasOverlayMenu() {
		return Boolean(this.getOverlayMenu())
	}
}

export default CommentActions
