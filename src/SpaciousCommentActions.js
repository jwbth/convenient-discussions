import CommentActions from './CommentActions'
import CommentButton from './CommentButton'
import PrototypeRegistry from './PrototypeRegistry'
import cd from './loader/cd'

/**
 * Actions management for spacious comments with menu-based styling.
 * Spacious comments display action buttons in a structured menu layout.
 */
class SpaciousCommentActions extends CommentActions {
	/**
	 * The comment this actions instance belongs to.
	 *
	 * @type {import('./SpaciousComment').default}
	 * @override
	 */
	// @ts-expect-error: TS incorrectly flags this as circular, but parent fields initialize first
	comment = this.comment

	/**
	 * @type {PrototypeRegistry<{
	 *   goToParentButtonSvg: SVGElement
	 *   goToChildButtonSvg: SVGElement
	 * }>}
	 */
	static prototypes = new PrototypeRegistry()
	/**
	 * Create a reply button for spacious comments.
	 *
	 * @override
	 * @param {import('./Button').Action} action The action to perform when clicked.
	 * @returns {CommentButton} The created button.
	 */
	createReplyButton(action) {
		return new CommentButton({
			label: cd.s('cm-reply'),
			classes: ['cd-comment-button-labeled'],
			// flags: ['progressive'],
			action,
		})
	}

	/**
	 * Create an edit button for spacious comments.
	 *
	 * @override
	 * @param {import('./Button').Action} action The action to perform when clicked.
	 * @returns {CommentButton} The created button.
	 */
	createEditButton(action) {
		return new CommentButton({
			label: cd.s('cm-edit'),
			classes: ['cd-comment-button-labeled'],
			action,
		})
	}

	/**
	 * Create a thank button for spacious comments.
	 *
	 * @override
	 * @param {import('./Button').Action} action The action to perform when clicked.
	 * @param {boolean} isThanked Whether the comment is already thanked.
	 * @returns {CommentButton} The created button.
	 */
	createThankButton(action, isThanked) {
		return new CommentButton({
			label: cd.s(isThanked ? 'cm-thanked' : 'cm-thank'),
			tooltip: cd.s(isThanked ? 'cm-thanked-tooltip' : 'cm-thank-tooltip'),
			classes: ['cd-comment-button-labeled'],
			action,
		})
	}

	/**
	 * Create a copy link button for spacious comments.
	 *
	 * @override
	 * @param {import('./Button').Action} action The action to perform when clicked.
	 * @returns {CommentButton} The created button.
	 */
	createCopyLinkButton(action) {
		return new CommentButton({
			label: cd.s('cm-copylink'),
			tooltip: cd.s('cm-copylink-tooltip'),
			classes: ['cd-comment-button-labeled'],
			action,
			href: this.comment.dtId && '#' + this.comment.dtId,
		})
	}

	/**
	 * Create a "Go to parent" button for spacious comments.
	 *
	 * @override
	 * @param {import('./Button').Action} action The action to perform when clicked.
	 * @returns {CommentButton} The created button.
	 */
	createGoToParentButton(action) {
		const button = new CommentButton({
			tooltip: cd.s('cm-gotoparent-tooltip'),
			classes: ['cd-comment-button-icon', 'cd-comment-button-goToParent', 'cd-icon'],
			action,
		})

		button.element.append(SpaciousCommentActions.prototypes.get('goToParentButtonSvg'))

		return button
	}

	/**
	 * Create a "Go to child" button for spacious comments.
	 *
	 * @override
	 * @param {import('./Button').Action} action The action to perform when clicked.
	 * @returns {CommentButton} The created button.
	 */
	createGoToChildButton(action) {
		const button = new CommentButton({
			tooltip: cd.s('cm-gotochild-tooltip'),
			classes: ['cd-comment-button-icon', 'cd-comment-button-goToChild', 'cd-icon'],
			action,
		})

		button.element.append(SpaciousCommentActions.prototypes.get('goToChildButtonSvg'))

		return button
	}

	/**
	 * Create a "Toggle child threads" button for spacious comments.
	 *
	 * @override
	 * @param {import('./Button').Action} action The action to perform when clicked.
	 * @returns {CommentButton} The created button.
	 */
	createToggleChildThreadsButton(action) {
		return new CommentButton({
			tooltip: cd.s('cm-togglechildthreads-tooltip'),
			classes: ['cd-comment-button-icon', 'cd-comment-button-toggleChildThreads', 'cd-icon'],
			action,
		})
	}

	/**
	 * Add a button to the spacious comment header or menu.
	 *
	 * @override
	 * @param {CommentButton} button The button to append.
	 */
	addButton(button) {
		// Some buttons go in the header; others go in the menu

		// eslint-disable-next-line unicorn/prefer-switch
		if (button === this.goToParentButton) {
			this.comment.headerElement.append(button.element)
		} else if (button === this.goToChildButton) {
			// Insert in header before change note
			this.comment.headerElement.insertBefore(button.element, this.comment.$changeNote?.[0] || null)
		} else if (button === this.toggleChildThreadsButton) {
			this.comment.headerElement.insertBefore(
				button.element,
				this.goToParentButton?.element || null,
			)
		} else {
			this.comment.menuElement?.append(button.element)
		}
	}

	/**
	 * Skip (copy link button is the timestamp).
	 *
	 * @override
	 */
	addCopyLinkButton() {}

	/**
	 * Override to add toggle child threads button to header instead of menu.
	 *
	 * @override
	 */
	addToggleChildThreadsButton() {
		super.addToggleChildThreadsButton()

		this.comment.updateToggleChildThreadsButton()
	}

	/**
	 * Have the prototypes been initialized.
	 *
	 * @type {boolean}
	 */
	static prototypesInitted = false

	/**
	 * Initialize prototypes for spacious comment actions.
	 *
	 * Creates SVG icon prototypes for navigation buttons.
	 */
	static initPrototypes() {
		if (this.prototypesInitted) return

		// Create SVG icon prototypes
		this.prototypes.add(
			'goToParentButtonSvg',
			cd.utils.createSvg(16, 16, 20, 20).html(`<path d="M10 5l8 10H2z" />`)[0],
		)
		this.prototypes.add(
			'goToChildButtonSvg',
			cd.utils.createSvg(16, 16, 20, 20).html(`<path d="M10 15L2 5h16z" />`)[0],
		)

		this.prototypesInitted = true
	}
}

export default SpaciousCommentActions
