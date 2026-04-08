import Button from './Button'
import LiveTimestamp from './LiveTimestamp'
import commentFormManager from './commentFormManager'
import commentManager from './commentManager'
import controller from './controller'
import cd from './loader/cd'
import { removeWikiMarkup } from './shared/utils-wikitext'
import updateChecker from './updateChecker'
import { formatDate } from './utils-date'
import { isCmdModifierPressed, keyCombination } from './utils-keyboard'
import { isInputFocused } from './utils-window'
import visits from './visits'

/**
 * Singleton representing the navigation panel.
 */
class NavPanel {
	/**
	 * Navigation panel element.
	 *
	 * @type {JQuery | undefined}
	 */
	$element

	/**
	 * Type of a property that keeps the state of a navigation panel button when it is mounted.
	 *
	 * @typedef {object} State
	 * @property {Button} refreshButton
	 * @property {Button} previousButton
	 * @property {Button} nextButton
	 * @property {Button} firstUnseenButton
	 * @property {Button} commentFormButton
	 * @property {number} cachedCommentCount
	 * @property {import('./updateChecker').AddedComments['bySection']} cachedCommentsBySection
	 */

	/**
	 * Navigation panel buttons.
	 *
	 * @type {State | undefined}
	 * @private
	 */
	state

	/**
	 * @type {number | undefined}
	 * @private
	 */
	utirbtTimeout

	/**
	 * _For internal use._ Mount, unmount or reset the navigation panel based on the context.
	 */
	setup() {
		if (cd.page.isActive()) {
			// Can be mounted not only on first parse, if using RevisionSlider, for example.
			if (this.isMounted()) {
				this.reset()
			} else {
				this.mount()
				controller.on('scroll', this.updateCommentFormButton).on('keyDown', (event) => {
					if (isInputFocused()) return

					// R
					if (keyCombination(event, 82)) {
						this.refreshClick()
					}

					// W
					if (keyCombination(event, 87)) {
						commentManager.goToPreviousNewComment()
					}

					// S
					if (keyCombination(event, 83)) {
						commentManager.goToNextNewComment()
					}

					// F
					if (keyCombination(event, 70)) {
						commentManager.goToFirstUnseenComment()
					}

					// C
					if (keyCombination(event, 67)) {
						event.preventDefault()
						commentFormManager.goToNextCommentForm(true)
					}
				})
				updateChecker.on('commentsUpdate', ({ all, relevant, bySection }) => {
					this.updateRefreshButton(all.length, bySection, Boolean(relevant.length))
				})
				commentFormManager
					.on('add', this.updateCommentFormButton)
					.on('remove', this.updateCommentFormButton)
				LiveTimestamp.on('updateImproved', this.updateTimestampsInRefreshButtonTooltip)
				visits.on('process', this.fill)
				commentManager.on('registerSeen', this.updateFirstUnseenButton)
			}
		} else if (this.isMounted()) {
			this.unmount()
		}
	}

	/**
	 * Render the navigation panel. This is done when the page is first loaded, or created using the
	 * script.
	 *
	 * @private
	 */
	mount() {
		this.$element = $('<div>').attr('id', 'cd-navPanel').addClass('noprint').appendTo(document.body)

		this.state = /** @type {State} */ ({})

		this.state.refreshButton = new Button({
			tagName: 'div',
			classes: ['cd-navPanel-button'],
			id: 'cd-navPanel-refreshButton',
			action: (event) => {
				this.refreshClick(isCmdModifierPressed(event))
			},
		})
		this.updateRefreshButton(0)

		this.state.previousButton = new Button({
			tagName: 'div',
			classes: ['cd-navPanel-button', 'cd-icon'],
			id: 'cd-navPanel-previousButton',
			tooltip: `${cd.s('navpanel-previous')} ${cd.mws('parentheses', 'W')}`,
			action: () => {
				commentManager.goToPreviousNewComment()
			},
		}).hide()
		$(this.state.previousButton.element).append(
			cd.utils
				.createSvg(16, 16, 20, 20)
				.html(`<path d="M1 13.75l1.5 1.5 7.5-7.5 7.5 7.5 1.5-1.5-9-9-9 9z" />`),
		)

		this.state.nextButton = new Button({
			tagName: 'div',
			classes: ['cd-navPanel-button', 'cd-icon'],
			id: 'cd-navPanel-nextButton',
			tooltip: `${cd.s('navpanel-next')} ${cd.mws('parentheses', 'S')}`,
			action: () => {
				commentManager.goToNextNewComment()
			},
		}).hide()
		$(this.state.nextButton.element).append(
			cd.utils
				.createSvg(16, 16, 20, 20)
				.html(`<path d="M19 6.25l-1.5-1.5-7.5 7.5-7.5-7.5L1 6.25l9 9 9-9z" />`),
		)

		this.state.firstUnseenButton = new Button({
			tagName: 'div',
			classes: ['cd-navPanel-button'],
			id: 'cd-navPanel-firstUnseenButton',
			tooltip: `${cd.s('navpanel-firstunseen')} ${cd.mws('parentheses', 'F')}`,
			action: () => {
				commentManager.goToFirstUnseenComment()
			},
		}).hide()

		this.state.commentFormButton = new Button({
			tagName: 'div',
			classes: ['cd-navPanel-button', 'cd-icon'],
			id: 'cd-navPanel-commentFormButton',
			tooltip: `${cd.s('navpanel-commentform')} ${cd.mws('parentheses', 'C')}`,
			action: () => {
				commentFormManager.goToNextCommentForm()
			},
		}).hide()
		$(this.state.commentFormButton.element).append(
			cd.utils
				.createSvg(16, 16, 20, 20)
				.html(
					cd.g.contentDirection === 'ltr'
						? `<path d="M18 0H2a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V2a2 2 0 00-2-2zM5 9.06a1.39 1.39 0 111.37-1.39A1.39 1.39 0 015 9.06zm5.16 0a1.39 1.39 0 111.39-1.39 1.39 1.39 0 01-1.42 1.39zm5.16 0a1.39 1.39 0 111.39-1.39 1.39 1.39 0 01-1.42 1.39z" />`
						: `<path d="M0 2v12c0 1.1.9 2 2 2h14l4 4V2c0-1.1-.9-2-2-2H2C.9 0 0 .9 0 2zm13.6 5.7c0-.8.6-1.4 1.4-1.4.8 0 1.4.6 1.4 1.4s-.6 1.4-1.4 1.4c-.8-.1-1.4-.7-1.4-1.4zM9.9 9.1s-.1 0 0 0c-.8 0-1.4-.6-1.4-1.4 0-.8.6-1.4 1.4-1.4.8 0 1.4.6 1.4 1.4s-.7 1.4-1.4 1.4zm-5.2 0c-.8 0-1.4-.6-1.4-1.4 0-.8.6-1.4 1.4-1.4.8 0 1.4.6 1.4 1.4 0 .7-.7 1.4-1.4 1.4z" />`,
				),
		)

		this.$element.append(
			this.state.refreshButton.element,
			this.state.previousButton.element,
			this.state.nextButton.element,
			this.state.firstUnseenButton.element,
			this.state.commentFormButton.element,
		)
	}

	/**
	 * Remove the navigation panel.
	 *
	 * @private
	 */
	unmount() {
		if (!this.isMounted()) return

		this.$element.remove()
		const thisTyped = /** @type {{ $element: undefined }} */ (this)
		thisTyped.$element = undefined
	}

	/**
	 * Check if the navigation panel is mounted. Is equivalent to checking the existence of
	 * {@link module:navPanel.$element}, and for most practical purposes, does the same as the
	 * {@link module:pageRegistry.Page#isActive} check.
	 *
	 * @returns {this is { $element: JQuery }}
	 */
	isMounted() {
		return Boolean(this.$element)
	}

	/**
	 * Reset the navigation panel to the initial state. This is done after page refreshes. (Comment
	 * forms are expected to be restored already.)
	 *
	 * @private
	 */
	reset() {
		if (!this.state) return

		this.updateRefreshButton(0)
		this.state.previousButton.hide()
		this.state.nextButton.hide()
		this.state.firstUnseenButton.hide()
		this.state.commentFormButton.hide()
		clearTimeout(this.utirbtTimeout)
	}

	/**
	 * Count the new and unseen comments on the page and update the navigation panel to reflect that.
	 *
	 * @private
	 */
	fill = () => {
		if (!this.state) return

		if (commentManager.getAll().some((comment) => comment.hasFlag('new'))) {
			this.updateRefreshButtonTooltip(0)
			this.state.previousButton.show()
			this.state.nextButton.show()
			this.updateFirstUnseenButton()
		}
	}

	/**
	 * Perform routines at the refresh button click.
	 *
	 * @param {boolean} [markAsRead] Whether to mark all comments as read.
	 * @private
	 */
	refreshClick(markAsRead = false) {
		controller.rebootPage({
			commentIds: controller.getRelevantAddedCommentIds(),
			markAsRead,
		})
	}

	/**
	 * Update the refresh button to show the number of comments added to the page since it was loaded.
	 *
	 * @param {number} commentCount
	 * @param {import('./updateChecker').AddedComments['bySection']} [commentsBySection]
	 * @param {boolean} [areThereRelevant]
	 * @private
	 */
	updateRefreshButton(commentCount, commentsBySection, areThereRelevant = false) {
		if (!this.state) return

		$(this.state.refreshButton.element)
			.empty()
			.append(
				commentCount
					? $('<span>')
							// Can't set the attribute to the button as its tooltip may have another direction.
							.attr('dir', 'ltr')

							.text(`+${commentCount}`)
					: cd.utils
							.createSvg(20, 20)
							.html(`<path d="M15.65 4.35A8 8 0 1017.4 13h-2.22a6 6 0 11-1-7.22L11 9h7V2z" />`),
			)
			.toggleClass('cd-navPanel-addedCommentCount', Boolean(commentCount))
			.toggleClass('cd-icon', !commentCount)
			.toggleClass('cd-navPanel-refreshButton-relevant', areThereRelevant)
		this.updateRefreshButtonTooltip(commentCount, commentsBySection)
	}

	/**
	 * Update the tooltip of the refresh button, displaying statistics of comments not yet displayed
	 * if there are such.
	 *
	 * @param {number} commentCount
	 * @param {import('./updateChecker').AddedComments['bySection']} [commentsBySection]
	 * @private
	 */
	updateRefreshButtonTooltip(commentCount, commentsBySection = new Map()) {
		if (!this.state) return

		// If the method was not called after a timeout and the timeout exists, clear it.
		clearTimeout(this.utirbtTimeout)

		this.state.cachedCommentCount = commentCount
		this.state.cachedCommentsBySection = commentsBySection

		/** @type {string} */
		let tooltipText
		const areThereNew = commentManager.getAll().some((comment) => comment.hasFlag('new'))
		if (commentCount) {
			tooltipText =
				cd.s('navpanel-newcomments-count', String(commentCount)) +
				' ' +
				cd.s('navpanel-newcomments-refresh') +
				' ' +
				cd.mws('parentheses', 'R')
			if (areThereNew && cd.settings.get('highlightNewInterval')) {
				tooltipText += '\n' + cd.s('navpanel-markasread', cd.g.cmdModifier)
			}
			const bullet = removeWikiMarkup(cd.s('bullet'))
			commentsBySection.forEach((comments, section) => {
				const headline = section?.headline
				tooltipText += headline ? `\n\n${headline}` : '\n'
				comments.forEach((comment) => {
					tooltipText += `\n`

					tooltipText +=
						bullet +
						' ' +
						// Names
						(comment.parent?.author && comment.level > 1
							? cd.s(
									'navpanel-newcomments-names',
									comment.author.getName(),
									comment.parent.author.getName(),
								)
							: comment.author.getName()) +
						// RTL mark if needed
						(cd.g.contentDirection === 'rtl' ? '\u200F' : '') +
						cd.mws('comma-separator') +
						// Date
						(comment.date ? formatDate(comment.date) : cd.s('navpanel-newcomments-unknowndate'))
				})
			})

			// When timestamps are relative, we need to update the tooltip manually every minute. When
			// `improved` timestamps are used, timestamps are updated in LiveTimestamp.updateImproved().
			if (cd.settings.get('timestampFormat') === 'relative') {
				this.utirbtTimeout = setTimeout(this.updateTimestampsInRefreshButtonTooltip, cd.g.msInMin)
			}
		} else {
			tooltipText = cd.s('navpanel-refresh') + ' ' + cd.mws('parentheses', 'R')
			if (areThereNew && cd.settings.get('highlightNewInterval')) {
				tooltipText += '\n' + cd.s('navpanel-markasread', cd.g.cmdModifier)
			}
		}

		this.state.refreshButton.setTooltip(tooltipText)
	}

	/**
	 * Update the tooltip of the {@link module:navPanel.buttons.refresh refresh button}. This is
	 * called to update timestamps in the text.
	 *
	 * @private
	 */
	updateTimestampsInRefreshButtonTooltip = () => {
		if (!this.state) return

		this.updateRefreshButtonTooltip(
			this.state.cachedCommentCount,
			this.state.cachedCommentsBySection,
		)
	}

	/**
	 * Update the state of the
	 * {@link module:navPanel.firstUnseenButton "Go to the first unseen comment"} button.
	 *
	 * @private
	 */
	updateFirstUnseenButton = () => {
		if (!this.state) return

		const unseenCommentCount = commentManager.query((c) => c.isSeen === false).length
		this.state.firstUnseenButton
			.toggle(Boolean(unseenCommentCount))
			.setLabel(String(unseenCommentCount))
	}

	/**
	 * Update the {@link module:navPanel.commentFormButton "Go to the next comment form out of sight"}
	 * button visibility.
	 *
	 * @private
	 */
	updateCommentFormButton = () => {
		if (!this.state || controller.isAutoScrolling()) return

		this.state.commentFormButton.toggle(
			commentFormManager.getAll().some((cf) => !cf.commentInput.$element.cdIsInViewport(true)),
		)
	}
}

export default new NavPanel()
