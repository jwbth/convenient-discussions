import CommentActions from './CommentActions'
import CommentButton from './CommentButton'
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
	 * Create an edit widget for compact comments.
	 *
	 * @returns {OO.ui.ButtonWidget}
	 */
	createEditWidget = () =>
		new OO.ui.ButtonWidget({
			label: cd.s('cm-edit'),
			icon: 'edit',
			invisibleLabel: true,
			title: cd.s('cm-edit-tooltip'),
			framed: false,
			classes: [
				'cd-button-ooui',
				'cd-comment-button-ooui',
				'cd-comment-button-ooui-icon',
				'cd-comment-button-edit',
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
	 * Create a "Fix" button for compact comments.
	 *
	 * @override
	 * @param {import('./Button').Action} action The action to perform when clicked.
	 * @returns {CommentButton} The created button.
	 */
	createFixButton(action) {
		return new CommentButton({
			element: this.createFixWidget().$element[0],
			action,
			widgetConstructor: this.createFixWidget,
		})
	}

	/**
	 * Create a "Fix" widget for compact comments.
	 *
	 * @returns {OO.ui.ButtonWidget}
	 */
	createFixWidget = () =>
		new OO.ui.ButtonWidget({
			label: cd.s('cm-fix'),
			icon: 'fix',
			invisibleLabel: true,
			title: cd.s('cm-fix-tooltip'),
			framed: false,
			classes: [
				'cd-button-ooui',
				'cd-comment-button-ooui',
				'cd-comment-button-ooui-icon',
				'cd-comment-button-fix',
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
	addButton(button) {
		this.getOverlayMenu()?.append(button.element)
	}
}

export default CompactCommentActions
