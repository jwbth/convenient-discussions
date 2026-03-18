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
	 * Create a reply widget for compact comments.
	 *
	 * @returns {OO.ui.ButtonWidget}
	 */
	createReplyWidget = () =>
		new OO.ui.ButtonWidget({
			label: cd.s('cm-reply'),
			framed: false,
			flags: ['progressive'],
			classes: ['cd-button-ooui', 'cd-comment-button-ooui'],
		})

	/**
	 * Create a reply button for compact comments.
	 *
	 * @override
	 * @param {import('./Button').Action} action The action to perform when clicked.
	 * @returns {CommentButton} The created button.
	 */
	createReplyButton(action) {
		return new CommentButton({
			element: this.createReplyWidget().$element[0],
			action,
			widgetConstructor: this.createReplyWidget,
		})
	}

	/**
	 * Create an edit widget for compact comments.
	 *
	 * @returns {OO.ui.ButtonWidget}
	 */
	createEditWidget = () =>
		new OO.ui.ButtonWidget({
			label: cd.s('cm-edit'),
			framed: false,
			classes: ['cd-button-ooui', 'cd-comment-button-ooui'],
		})

	/**
	 * Create an edit button for compact comments.
	 *
	 * @override
	 * @param {import('./Button').Action} action The action to perform when clicked.
	 * @returns {CommentButton} The created button.
	 */
	createEditButton(action) {
		return new CommentButton({
			element: this.createEditWidget().$element[0],
			action,
			widgetConstructor: this.createEditWidget,
		})
	}

	/**
	 * Create a thank widget for compact comments.
	 *
	 * @returns {OO.ui.ButtonWidget}
	 */
	createThankWidget = () =>
		new OO.ui.ButtonWidget({
			label: cd.s('cm-thank'),
			icon: 'heart',
			invisibleLabel: true,
			title: cd.s('cm-thank-tooltip'),
			framed: false,
			classes: [
				'cd-button-ooui',
				'cd-comment-button-ooui',
				'cd-comment-button-ooui-icon',
				'cd-comment-button-thank',
			],
		})

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
			element: this.createThankWidget().$element[0],
			action,
			widgetConstructor: this.createThankWidget,
		})
	}

	/**
	 * Create a copy link widget for compact comments.
	 *
	 * @returns {OO.ui.ButtonWidget}
	 */
	createCopyLinkWidget = () =>
		new OO.ui.ButtonWidget({
			label: cd.s('cm-copylink'),
			icon: 'link',
			invisibleLabel: true,
			title: cd.s('cm-copylink-tooltip'),
			framed: false,
			classes: [
				'cd-button-ooui',
				'cd-comment-button-ooui',
				'cd-comment-button-ooui-icon',
				'cd-comment-button-ooui-icon-copylink',
			],
		})

	/**
	 * Create a copy link button for compact comments.
	 *
	 * @override
	 * @param {import('./Button').Action} action The action to perform when clicked.
	 * @returns {CommentButton} The created button.
	 */
	createCopyLinkButton(action) {
		return new CommentButton({
			element: this.createCopyLinkWidget().$element[0],
			action,
			widgetConstructor: this.createCopyLinkWidget,
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
		return new CommentButton({
			element: this.createGoToParentWidget().$element[0],
			action,
			widgetConstructor: this.createGoToParentWidget,
		})
	}

	/**
	 * Create a "Go to parent" widget for compact comments.
	 *
	 * @returns {OO.ui.ButtonWidget}
	 */
	createGoToParentWidget = () =>
		new OO.ui.ButtonWidget({
			label: cd.s('cm-gotoparent-tooltip'),
			icon: 'upTriangle',
			invisibleLabel: true,
			title: cd.s('cm-gotoparent-tooltip'),
			framed: false,
			classes: [
				'cd-button-ooui',
				'cd-comment-button-ooui',
				'cd-comment-button-ooui-icon',
				'cd-comment-button-goToParent',
			],
		})

	/**
	 * Create a "Go to child" button for compact comments.
	 *
	 * @override
	 * @param {import('./Button').Action} action The action to perform when clicked.
	 * @returns {CommentButton} The created button.
	 */
	createGoToChildButton(action) {
		const element = this.createGoToChildWidget().$element[0]

		return new CommentButton({
			element,
			action,
			widgetConstructor: this.createGoToChildWidget,
		})
	}

	/**
	 * Create a "Go to child" widget for compact comments.
	 *
	 * @returns {OO.ui.ButtonWidget}
	 */
	createGoToChildWidget = () =>
		new OO.ui.ButtonWidget({
			label: cd.s('cm-gotochild'),
			icon: 'downTriangle',
			invisibleLabel: true,
			title: cd.s('cm-gotochild-tooltip'),
			framed: false,
			classes: [
				'cd-button-ooui',
				'cd-comment-button-ooui',
				'cd-comment-button-ooui-icon',
				'cd-comment-button-goToChild',
			],
		})

	/**
	 * Create a "Toggle child threads" button for compact comments.
	 *
	 * @override
	 * @param {import('./Button').Action} action The action to perform when clicked.
	 * @returns {CommentButton} The created button.
	 */
	createToggleChildThreadsButton(action) {
		const element = this.createToggleChildThreadsWidget().$element[0]

		return new CommentButton({
			element,
			iconElement: /** @type {HTMLElement} */ (element.querySelector('.oo-ui-iconElement-icon')),
			action,
			widgetConstructor: this.createToggleChildThreadsWidget,
			classes: ['cd-comment-button-toggleChildThreads'],
		})
	}

	/**
	 * Create a "Toggle child threads" widget for compact comments.
	 *
	 * @returns {OO.ui.ButtonWidget}
	 */
	createToggleChildThreadsWidget = () =>
		new OO.ui.ButtonWidget({
			label: cd.s('cm-togglechildthreads'),
			icon: this.comment.areChildThreadsCollapsed() ? 'add' : 'subtract',
			invisibleLabel: true,
			title: cd.s('cm-togglechildthreads-tooltip'),
			framed: false,
			classes: [
				'cd-button-ooui',
				'cd-comment-button-ooui',
				'cd-comment-button-ooui-icon',
				'cd-comment-button-toggleChildThreads',
			],
		})

	/**
	 * Get the overlay menu container.
	 *
	 * @override
	 * @returns {JQuery | undefined} The overlay menu jQuery object, or undefined if not available.
	 * @protected
	 */
	getOverlayMenu() {
		const layers = this.comment.layers
		if (layers && 'overlayMenu' in layers) {
			return layers.$overlayMenu
		}
	}

	/**
	 * Append a button to the comment overlay menu.
	 *
	 * @override
	 * @param {CommentButton} button The button to append.
	 */
	appendButton(button) {
		this.getOverlayMenu()?.append(button.element)
	}

	/**
	 * Add a button to the comment overlay menu.
	 *
	 * @override
	 * @param {CommentButton} button The button to add.
	 */
	addButton(button) {
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

		// Insert after "Go to parent/child" buttons if they exist
		const targetButton = this.goToParentButton || this.goToChildButton
		const $overlayMenu = this.getOverlayMenu()
		if (targetButton && $overlayMenu) {
			$overlayMenu[0].insertBefore(
				this.toggleChildThreadsButton.element,
				targetButton.element.nextSibling || null,
			)
		} else {
			this.addButton(this.toggleChildThreadsButton)
		}
	}

	/**
	 * Override to handle specific positioning for "Go to child" button.
	 *
	 * @override
	 */
	maybeAddGoToChildButton() {
		if (!this.comment.targetChild) return

		this.comment.configureLayers()
		if (this.goToChildButton?.isConnected()) return

		this.goToChildButton = this.createGoToChildButton(this.onGoToChildAction)
		this.addButton(this.goToChildButton)
	}

	/**
	 * Create a reply button and add it to the comment overlay menu.
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
	 * Create an edit button and add it to the comment overlay menu.
	 *
	 * @override
	 */
	addEditButton() {
		if (!this.comment.isEditable) return

		this.editButton = this.createEditButton(this.onEditAction)
		this.appendButton(this.editButton)
	}

	/**
	 * Create a thank button and add it to the comment overlay menu.
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
			// after migration is complete on June 1, 2026
			([id, thank]) =>
				this.comment.dtId === id ||
				this.comment.id === id ||
				// This comes from the local storage, the value may be corrupt
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
				this.comment.dtId === thank?.id ||
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
				this.comment.id === thank?.id,
		)

		this.thankButton = this.createThankButton(this.onThankAction, isThanked)
		this.appendButton(this.thankButton)

		if (isThanked) {
			this.setThanked()
		}
	}

	/**
	 * Create a "Go to parent" button and add it to the comment overlay menu.
	 *
	 * @override
	 */
	addGoToParentButton() {
		if (!this.comment.getParent()) return

		this.goToParentButton = this.createGoToParentButton(this.onGoToParentAction)
		this.appendButton(this.goToParentButton)
	}

	/**
	 * Create a "Copy link" button and add it to the comment overlay menu.
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
