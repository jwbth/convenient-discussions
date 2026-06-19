import {
	cdxIconArrowUp,
	cdxIconArrowDown,
	cdxIconOngoingConversation,
	cdxIconReload,
	resolveIcon,
	shouldIconFlip,
} from '@wikimedia/codex-icons'

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
				controller.on('viewportMove', this.updateCommentFormButton).on('keyDown', (event) => {
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
				commentManager.on('updateSeen', this.updateFirstUnseenButton)
				commentManager.on('updateNew', this.updateNew)
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
			tooltip: cd.s('navpanel-previous') + cd.mws('word-separator') + cd.mws('parentheses', 'W'),
			action: () => {
				commentManager.goToPreviousNewComment()
			},
		}).hide()
		$(this.state.previousButton.element).append(this.createIcon(cdxIconArrowUp, 16))

		this.state.nextButton = new Button({
			tagName: 'div',
			classes: ['cd-navPanel-button', 'cd-icon'],
			id: 'cd-navPanel-nextButton',
			tooltip: cd.s('navpanel-next') + cd.mws('word-separator') + cd.mws('parentheses', 'S'),
			action: () => {
				commentManager.goToNextNewComment()
			},
		}).hide()
		$(this.state.nextButton.element).append(this.createIcon(cdxIconArrowDown, 16))

		this.state.firstUnseenButton = new Button({
			tagName: 'div',
			classes: ['cd-navPanel-button'],
			id: 'cd-navPanel-firstUnseenButton',
			tooltip: cd.s('navpanel-firstunseen') + cd.mws('word-separator') + cd.mws('parentheses', 'F'),
			action: () => {
				commentManager.goToFirstUnseenComment()
			},
		}).hide()

		this.state.commentFormButton = new Button({
			tagName: 'div',
			classes: ['cd-navPanel-button', 'cd-icon'],
			id: 'cd-navPanel-commentFormButton',
			tooltip: cd.s('navpanel-commentform') + cd.mws('word-separator') + cd.mws('parentheses', 'C'),
			action: () => {
				commentFormManager.goToNextCommentForm()
			},
		}).hide()
		$(this.state.commentFormButton.element).append(this.createIcon(cdxIconOngoingConversation, 16))

		this.$element.append(
			this.state.refreshButton.element,
			this.state.previousButton.element,
			this.state.nextButton.element,
			this.state.firstUnseenButton.element,
			this.state.commentFormButton.element,
		)
	}

	/**
	 * Create an `<svg>` element for a Codex icon, resolving its direction-specific variant and
	 * flipping it horizontally in RTL mode when the icon requires it.
	 *
	 * @param {import('@wikimedia/codex-icons').Icon} icon Codex icon.
	 * @param {number} size Rendered width and height of the icon in pixels.
	 * @returns {JQuery<SVGElement>}
	 * @private
	 */
	createIcon(icon, size) {
		const resolvedIcon = resolveIcon(icon, cd.g.contentLanguage, cd.g.contentDirection)
		const $svg = cd.utils
			.createSvg(size, size, 20, 20)
			.html(typeof resolvedIcon === 'string' ? resolvedIcon : `<path d="${resolvedIcon.path}" />`)
		if (cd.g.contentDirection === 'rtl' && shouldIconFlip(icon, cd.g.contentLanguage)) {
			$svg.css('transform', 'scaleX(-1)')
		}

		return $svg
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
	 * Update the navigation panel when the new flag is removed from comments.
	 *
	 * @private
	 */
	updateNew = () => {
		if (!this.state) return

		if (!commentManager.getAll().some((comment) => comment.hasFlag('new'))) {
			this.state.previousButton.hide()
			this.state.nextButton.hide()
		}
	}

	/**
	 * Perform routines at the refresh button click.
	 *
	 * @param {boolean} [markAsRead] Whether to mark all comments as read.
	 * @private
	 */
	refreshClick(markAsRead = false) {
		if (commentFormManager.getAll().some((commentForm) => commentForm.isBeingSubmitted())) return

		controller.rebootPage({
			commentIds: controller.getRelevantAddedCommentIds(),
			markAsRead,
			expandThreads: false,
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
					: this.createIcon(cdxIconReload, 16),
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
				cd.mws('word-separator') +
				cd.s('navpanel-newcomments-refresh') +
				cd.mws('word-separator') +
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
			tooltipText = cd.s('navpanel-refresh') + cd.mws('word-separator') + cd.mws('parentheses', 'R')
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

		const unseenCommentCount = commentManager.query((c) => c.isSeen() === false).length
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
