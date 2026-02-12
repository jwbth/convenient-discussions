import CommentActions from './CommentActions'
import CommentButton from './CommentButton'
import commentManager from './commentManager'
import cd from './loader/cd'

/**
 * Actions management for compact comments with overlay-based styling.
 * Compact comments display action buttons in an overlay menu that appears on hover.
 */
class CompactCommentActions extends CommentActions {
	/**
	 * The comment this actions instance belongs to.
	 *
	 * @type {import('./CompactComment').default}
	 * @override
	 */
	// @ts-expect-error: TS incorrectly flags this as circular, but parent fields initialize first
	comment = this.comment

	/**
	 * Create and add all appropriate action buttons for compact comments.
	 * The order is specific for compact comments.
	 *
	 * @override
	 */
	create() {
		this.addGoToParentButton()
		this.addCopyLinkButton()
		this.addThankButton()
		this.addEditButton()
		this.addReplyButton()
		this.addToggleChildThreadsButton()
	}

	/**
	 * Create a reply button for compact comments.
	 *
	 * @override
	 * @param {import('./Button').Action} action The action to perform when clicked.
	 * @returns {CommentButton} The created button.
	 */
	createReplyButton(action) {
		return new CommentButton({
			element: this.comment.createReplyButton().$element[0],
			action,
			widgetConstructor: this.comment.createReplyButton,
		})
	}

	/**
	 * Create an edit button for compact comments.
	 *
	 * @override
	 * @param {import('./Button').Action} action The action to perform when clicked.
	 * @returns {CommentButton} The created button.
	 */
	createEditButton(action) {
		return new CommentButton({
			element: this.comment.createEditButton().$element[0],
			action,
			widgetConstructor: this.comment.createEditButton,
		})
	}

	/**
	 * Create a thank button for compact comments.
	 *
	 * @override
	 * @param {import('./Button').Action} action The action to perform when clicked.
	 * @param {boolean} _isThanked Whether the comment is already thanked.
	 * @returns {CommentButton} The created button.
	 */
	createThankButton(action, _isThanked) {
		return new CommentButton({
			element: this.comment.createThankButton().$element[0],
			action,
			widgetConstructor: this.comment.createThankButton,
		})
	}

	/**
	 * Create a copy link button for compact comments.
	 *
	 * @override
	 * @param {import('./Button').Action} action The action to perform when clicked.
	 * @returns {CommentButton} The created button.
	 */
	createCopyLinkButton(action) {
		const element = this.comment.createCopyLinkButton().$element[0]

		return new CommentButton({
			element,
			buttonElement: /** @type {HTMLElement} */ (element.firstChild),
			action,
			widgetConstructor: this.comment.createCopyLinkButton,
			href: this.comment.dtId && '#' + this.comment.dtId,
		})
	}

	/**
	 * Create a "Go to parent" button for compact comments.
	 *
	 * @override
	 * @param {import('./Button').Action} action The action to perform when clicked.
	 * @returns {CommentButton} The created button.
	 */
	createGoToParentButton(action) {
		const buttonElement = this.comment.createGoToParentButton().$element[0]

		return new CommentButton({
			buttonElement,
			action,
			widgetConstructor: this.comment.createGoToParentButton,
		})
	}

	/**
	 * Create a "Go to child" button for compact comments.
	 *
	 * @override
	 * @param {import('./Button').Action} action The action to perform when clicked.
	 * @returns {CommentButton} The created button.
	 */
	createGoToChildButton(action) {
		const element = this.comment.createGoToChildButton().$element[0]

		return new CommentButton({
			element,
			action,
			widgetConstructor: this.comment.createGoToChildButton,
		})
	}

	/**
	 * Create a "Toggle child threads" button for compact comments.
	 *
	 * @override
	 * @param {import('./Button').Action} action The action to perform when clicked.
	 * @returns {CommentButton} The created button.
	 */
	createToggleChildThreadsButton(action) {
		const element = this.comment.createToggleChildThreadsButton().$element[0]

		return new CommentButton({
			element,
			iconElement: /** @type {HTMLElement} */ (element.querySelector('.oo-ui-iconElement-icon')),
			action,
			widgetConstructor: this.comment.createToggleChildThreadsButton,
			classes: ['cd-comment-button-toggleChildThreads'],
		})
	}

	/**
	 * Get the overlay menu container for compact comments.
	 *
	 * @override
	 * @returns {JQuery | undefined} The overlay menu jQuery object, or undefined if not available.
	 * @protected
	 */
	getOverlayMenu() {
		const layers = this.comment.layers
		if (layers && 'overlayMenu' in layers) {
			return /** @type {import('./CompactCommentLayers').default} */ (layers).$overlayMenu
		}
	}

	/**
	 * Append a button to the compact comment overlay menu.
	 *
	 * @override
	 * @param {CommentButton} button The button to append.
	 */
	appendButton(button) {
		this.getOverlayMenu()?.append(button.element)
	}

	/**
	 * Prepend a button to the compact comment overlay menu.
	 *
	 * @override
	 * @param {CommentButton} button The button to prepend.
	 */
	prependButton(button) {
		this.getOverlayMenu()?.prepend(button.element)
	}

	/**
	 * Override to handle specific positioning for toggle child threads button.
	 *
	 * @override
	 */
	addToggleChildThreadsButton() {
		if (
			!this.comment.getChildren().some((child) => child.thread) ||
			this.toggleChildThreadsButton?.isConnected()
		) {
			return
		}

		this.toggleChildThreadsButton = this.createToggleChildThreadsButton(
			this.onToggleChildThreadsAction,
		)
		this.toggleChildThreadsButton.element.addEventListener('mouseenter', () => {
			this.comment.maybeOnboardOntoToggleChildThreads()
		})

		// Insert after go to parent/child buttons if they exist
		const targetButton = this.goToParentButton || this.goToChildButton
		const overlayMenu = this.getOverlayMenu()
		if (targetButton && overlayMenu) {
			overlayMenu[0].insertBefore(
				this.toggleChildThreadsButton.element,
				targetButton.element.nextSibling || null,
			)
		} else {
			this.prependButton(this.toggleChildThreadsButton)
		}
	}

	/**
	 * Override to handle specific positioning for go to child button.
	 *
	 * @override
	 */
	maybeAddGoToChildButton() {
		if (!this.comment.targetChild) return

		this.comment.configureLayers()
		if (this.goToChildButton?.isConnected()) return

		this.goToChildButton = this.createGoToChildButton(this.onGoToChildAction)
		this.prependButton(this.goToChildButton)
	}

	/**
	 * Override addReplyButton for compact comments.
	 *
	 * @override
	 */
	addReplyButton() {
		if (!this.comment.isActionable) return

		this.replyButton = this.createReplyButton(this.onReplyAction)
		this.appendButton(this.replyButton)

		// Check if reply should be disabled due to outdented comments
		if (
			commentManager.getByIndex(this.comment.index + 1)?.isOutdented &&
			(!this.comment.section ||
				// Probably shouldn't add a comment to a numbered list
				this.comment.elements[0].matches('ol *'))
		) {
			this.replyButton.setDisabled(true)
			this.replyButton.setTooltip(cd.s('cm-reply-outdented-tooltip'))
		}
	}

	/**
	 * Override addEditButton for compact comments.
	 *
	 * @override
	 */
	addEditButton() {
		if (!this.comment.isEditable) return

		this.editButton = this.createEditButton(this.onEditAction)
		this.appendButton(this.editButton)
	}

	/**
	 * Override addThankButton for compact comments.
	 *
	 * @override
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
				this.comment.dtId === id ||
				this.comment.id === id ||
				// This comes from the local storage, the value may be corrupt
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
				this.comment.dtId === thank?.id ||
				this.comment.id === thank?.id,
		)

		this.thankButton = this.createThankButton(this.onThankAction, isThanked)
		this.appendButton(this.thankButton)

		if (isThanked) {
			this.setThanked()
		}
	}

	/**
	 * Override addGoToParentButton for compact comments.
	 *
	 * @override
	 */
	addGoToParentButton() {
		if (!this.comment.getParent()) return

		this.goToParentButton = this.createGoToParentButton(this.onGoToParentAction)
		this.appendButton(this.goToParentButton)
	}

	/**
	 * Override addCopyLinkButton for compact comments.
	 *
	 * @override
	 */
	addCopyLinkButton() {
		if (!this.comment.id) return

		this.copyLinkButton = this.createCopyLinkButton(this.onCopyLinkAction)
		this.appendButton(this.copyLinkButton)
	}
}

export default CompactCommentActions
