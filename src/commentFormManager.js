import CommentForm from './CommentForm'
import EventEmitter from './EventEmitter'
import StorageItemWithKeysAndSaveTime from './StorageItemWithKeysAndSaveTime'
import commentManager from './commentManager'
import controller from './controller'
import cd from './loader/cd'
import sectionManager from './sectionManager'
import {
	defined,
	removeFromArrayIfPresent,
	sleep,
	subtractDaysFromNow,
} from './shared/utils-general'
import { isCmdModifierPressed, keyCombination } from './utils-keyboard'
import { isInputFocused } from './utils-window'

// TODO: make into a class extending a generic registry.

/**
 * @typedef {object} EventMap
 * @property {[CommentForm]} teardown
 * @property {[CommentForm]} add
 * @property {[CommentForm]} remove
 */

/**
 * @typedef {[CommentForm, import('./loader/cd').ConvenientDiscussions]} CommentFormCreatedEvent
 */

/**
 * Singleton storing data about comment forms on the page and managing them.
 *
 * @augments EventEmitter<EventMap>
 */
class CommentFormManager extends EventEmitter {
	/**
	 * List of comment forms.
	 *
	 * @type {CommentForm[]}
	 * @private
	 */
	items = []

	/**
	 * @type {((...args: any[]) => any)|undefined}
	 */
	throttledSaveSession

	/**
	 * _For internal use._ Initialize the registry.
	 */
	init() {
		this.configureClosePageConfirmation()

		controller
			.on('beforeReboot', () => {
				// In case checkboxes were changed programmatically
				this.saveSession()
			})
			.on('startReboot', this.detach)
			.on('keyDown', (event) => {
				if (
					// Ctrl+Alt+Q
					keyCombination(event, 81, ['cmd', 'alt']) ||
					// Q
					(keyCombination(event, 81) && !isInputFocused())
				) {
					const lastActiveCommentForm = this.getLastActive()
					const comment = commentManager.getSelectedComment()
					if (lastActiveCommentForm) {
						event.preventDefault()
						lastActiveCommentForm.quote(isCmdModifierPressed(event), comment)
					} else if (comment?.isActionable()) {
						event.preventDefault()
						comment.reply()
					}
				}
			})
			.on('resize', this.adjustLabels)
		commentManager
			.on('select', () => {
				this.toggleQuoteButtonsHighlighting(true)
			})
			.on('unselect', () => {
				this.toggleQuoteButtonsHighlighting(false)
			})

		mw.hook('ext.CodeMirror.toggle').add((enabled, codeMirror) => {
			this.items.find((item) => item.commentInput.codeMirror === codeMirror)?.updateEventListeners()
			if (enabled !== cd.settings.get('useCodeMirror')) {
				cd.settings.saveSettingOnTheFly('useCodeMirror', enabled)
			}
		})

		mw.hook('ext.CodeMirror.ready').add(async (codeMirror) => {
			// Wait for codemirror.mediawiki.js in CodeMirror to register the autocomplete extension.
			await sleep()

			this.items
				.find((item) => item.commentInput.codeMirror === codeMirror)
				?.commentInput.codeMirror?.updateAutocompletePreference(
					cd.settings.get('useNativeAutocomplete'),
				)
		})
	}

	/**
	 * @typedef {Expand<
	 *   MakeRequired<
	 *     Partial<ConstructorParameters<typeof CommentForm>[0]>,
	 *     'mode'
	 *   >
	 * >} SetupCommentFormConfig
	 */

	/**
	 * Create a comment form and add it both to the registry and to the page. If it already exists,
	 * reattach it to the page.
	 *
	 * @param {import('./CommentForm').CommentFormTarget} target
	 * @param {SetupCommentFormConfig} config See {@link CommentForm}'s constructor.
	 * @param {import('./CommentForm').CommentFormInitialState} [initialState] See
	 *   {@link CommentForm}'s constructor.
	 * @param {import('./CommentForm').default} [commentForm]
	 * @returns {CommentForm}
	 * @fires commentFormCreated
	 */
	setupCommentForm(target, config, initialState, commentForm) {
		if (commentForm) {
			commentForm.setTargets(target)
			commentForm.initAutocomplete()
			target.addCommentFormToPage(config.mode, commentForm)
		} else {
			const cf = new CommentForm({ target, initialState, commentFormManager: this, ...config })
			target.addCommentFormToPage(config.mode, cf)
			cf.setup(initialState)
			this.items.push(cf)
			cf.on('change', this.saveSession)
				.on('unregister', () => {
					this.remove(cf)
				})
				.on('teardown', () => {
					controller.updatePageTitle()
					this.emit('teardown', cf)
				})
			this.emit('add', cf)

			commentForm = cf
		}

		controller.updatePageTitle()
		this.saveSession()

		/**
		 * A comment form has been created and added to the page.
		 *
		 * @event commentFormCreated
		 * @param {CommentForm} commentForm
		 * @param {object} cd {@link convenientDiscussions} object.
		 * @global
		 */
		mw.hook('convenientDiscussions.commentFormCreated').fire(commentForm, cd)

		return commentForm
	}

	/**
	 * Remove a comment form from the registry.
	 *
	 * @param {CommentForm} item
	 */
	remove(item) {
		removeFromArrayIfPresent(this.items, item)
		this.saveSession(true)
		this.emit('remove', item)
	}

	/**
	 * Get all comment forms.
	 *
	 * @returns {CommentForm[]}
	 */
	getAll() {
		return this.items
	}

	/**
	 * Get a comment form by index.
	 *
	 * @param {number} index Use a negative index to count from the end.
	 * @returns {?CommentForm}
	 */
	getByIndex(index) {
		if (index < 0) {
			index = this.items.length + index
		}

		return this.items[index] || null
	}

	/**
	 * Get the number of comment forms.
	 *
	 * @returns {number}
	 */
	getCount() {
		return this.items.length
	}

	/**
	 * Get comment forms by a condition.
	 *
	 * @param {(commentForm: CommentForm) => boolean} condition
	 * @returns {CommentForm[]}
	 */
	query(condition) {
		return this.items.filter(condition)
	}

	/**
	 * Reset the comment form list.
	 *
	 * @private
	 */
	reset() {
		this.items.length = 0
	}

	/**
	 * Get the last active comment form.
	 *
	 * @returns {?CommentForm}
	 */
	getLastActive() {
		return this.items.slice().sort(this.lastFocused)[0] || null
	}

	/**
	 * Get the last active comment form that has received an input. This includes altering text
	 * fields, not checkboxes.
	 *
	 * @returns {?CommentForm}
	 */
	getLastActiveAltered() {
		return (
			this.items
				.slice()
				.sort(this.lastFocused)
				.find((commentForm) => commentForm.isAltered()) || null
		)
	}

	/**
	 * Callback to be used in
	 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort Array#sort()}
	 * for comment forms.
	 *
	 * @param {CommentForm} cf1
	 * @param {CommentForm} cf2
	 * @returns {number}
	 * @private
	 */
	lastFocused = (cf1, cf2) =>
		(cf2.getLastFocused()?.getTime() || 0) - (cf1.getLastFocused()?.getTime() || 0)

	/**
	 * Adjust the button labels of all comment forms according to the form width: if the form is too
	 * narrow, the labels will shrink.
	 */
	adjustLabels = () => {
		this.items.forEach((commentForm) => {
			commentForm.adjustLabels()
		})
	}

	/**
	 * Detach the comment forms keeping events. Also reset some of their properties.
	 */
	detach = () => {
		this.items.forEach((commentForm) => {
			commentForm.detach()
		})
	}

	/**
	 * The method that does the actual work for {@link module:commentFormManager.saveSession}.
	 *
	 * @private
	 */
	actuallySaveSession = () => {
		new StorageItemWithKeysAndSaveTime('commentForms')
			.setWithTime(
				mw.config.get('wgPageName'),
				this.items
					.filter((commentForm) => commentForm.isAltered())
					.map((commentForm) => commentForm.getData()),
			)
			.save()
	}

	/**
	 * _For internal use._ Save comment form data to the local storage.
	 *
	 * @param {boolean} [force] Save session immediately, without regard for save frequency.
	 */
	saveSession = (force) => {
		// A check in light of the existence of RevisionSlider, see the method
		if (!cd.utils.isCurrentRevision()) return

		if (force) {
			this.actuallySaveSession()
		} else {
			// Don't save more often than once per 5 seconds.
			this.throttledSaveSession ??= OO.ui.throttle(
				/** @type {() => void} */ (this.actuallySaveSession),
				500,
			)
			this.throttledSaveSession()
		}
	}

	/**
	 * Restore comment forms using the data saved in the local storage.
	 * {@link module:commentFormManager.maybeShowRescueDialog Rescue} forms that couldn't be
	 * restored.
	 *
	 * @private
	 */
	restoreSessionFromStorage() {
		let haveRestored = /** @type {boolean} */ (false)

		this.maybeShowRescueDialog(
			/**
			 * @type {StorageItemWithKeysAndSaveTime<
			 *   import('./CommentForm').CommentFormData[],
			 *   'commentForms'
			 * >}
			 */ (new StorageItemWithKeysAndSaveTime('commentForms'))
				// This comes from the local storage, the value may be corrupt
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
				.cleanUp((entry) => !entry.commentForms?.length || entry.saveTime < subtractDaysFromNow(60))
				.save()
				.get(mw.config.get('wgPageName'))
				?.commentForms.filter((data) => {
					const target = this.getTargetByData(data.targetData)
					if (data.targetWithOutdentedRepliesData) {
						const dataTyped = /** @type {import('./CommentForm').CommentFormInitialState} */ (data)
						dataTyped.targetWithOutdentedReplies =
							/** @type {import('./Comment').default|undefined} */ (
								this.getTargetByData(data.targetWithOutdentedRepliesData)
							)
					}
					if (
						target?.isActionable() &&
						(!('canBeReplied' in target) || target.canBeReplied()) &&
						// Check if there is another form already
						!target[CommentForm.getPropertyNameOnTarget(target, data.mode)]
					) {
						try {
							const targetMethod = /** @type {import('./CommentForm').CommentFormAddingMethod} */ (
								target[
									/** @type {keyof typeof target} */ (target.getCommentFormMethodName(data.mode))
								]
							).bind(target)
							targetMethod(
								{ ...data, focus: false },
								undefined,
								data.preloadConfig,
								data.newTopicOnTop,
							)
							haveRestored = true
						} catch (error) {
							cd.debug.logWarn(error)

							return true
						}
					} else {
						return true
					}

					return false
				}),
		)

		if (haveRestored) {
			mw.notification
				.notify(cd.s('restore-restored-text'), {
					title: cd.s('restore-restored-title'),
				})
				.$notification.on('click', () => {
					this.items[0].goTo()
				})
		}
	}

	/**
	 * Given identifying data (created by e.g. {@link Comment#getIdentifyingData}), get a comment or
	 * section on the page or the page itself.
	 *
	 * @param {AnyByKey | undefined} targetData
	 * @returns {import('./CommentForm').CommentFormTarget | undefined}
	 * @private
	 */
	getTargetByData(targetData) {
		if (targetData?.headline) {
			// Section
			return sectionManager.search({
				headline: targetData.headline,
				oldestCommentId: targetData.oldestCommentId,
				index: targetData.index,
				id: targetData.id,
				ancestors: targetData.ancestors,
			})?.section
		} else if (targetData?.id) {
			// Comment
			return commentManager.getById(targetData.id)
		} // `data.mode === 'addSection'` or `targetData === undefined`

		// Page
		return cd.page
	}

	/**
	 * Restore comment forms using the data in {@link convenientDiscussions.commentForms}.
	 *
	 * @private
	 */
	restoreSessionDirectly() {
		this.maybeShowRescueDialog(
			this.items.map((commentForm) => commentForm.restore()).filter(defined),
		)
	}

	/**
	 * Show a modal with content of comment forms that we were unable to restore to the page (because
	 * their target comments/sections disappeared, for example).
	 *
	 * @param {object[]} [content]
	 * @param {string} [content[].headline]
	 * @param {string} content[].comment
	 * @param {string} content[].summary
	 * @private
	 */
	maybeShowRescueDialog(content) {
		if (!content?.length) return

		const dialog = new OO.ui.MessageDialog()
		const windowManager = cd.getWindowManager()
		windowManager.addWindows([dialog])
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const win = windowManager.openWindow(dialog, {
			message: new OO.ui.FieldLayout(
				new OO.ui.MultilineTextInputWidget({
					value: content
						.map(
							(data) =>
								(data.headline === undefined
									? ''
									: `${cd.s('rd-headline')}: ${data.headline}\n\n`) +
								`${cd.s('rd-comment')}: ${data.comment}\n\n${cd.s('rd-summary')}: ${data.summary}`,
						)
						.join('\n\n----\n'),
					rows: 20,
				}),
				{
					align: 'top',
					label: cd.s('rd-intro'),
				},
			).$element,
			actions: [
				{
					label: cd.s('rd-close'),
					action: 'close',
				},
			],
			size: 'large',
		})
		win.closed.then(() => {
			this.saveSession()
		})
	}

	/**
	 * Return saved comment forms to their places.
	 *
	 * @param {boolean} fromStorage Should the session be restored from the local storage instead of
	 *   directly from {@link convenientDiscussions.commentForms}.
	 */
	restoreSession(fromStorage) {
		if (fromStorage) {
			// This is needed when the page is reloaded externally.
			this.reset()

			this.restoreSessionFromStorage()
		} else {
			this.restoreSessionDirectly()
		}
	}

	/**
	 * Add a condition to show a confirmation when trying to close the page with active comment forms
	 * on it.
	 *
	 * @private
	 */
	configureClosePageConfirmation() {
		controller.addPreventUnloadCondition('commentForms', () => {
			// Check for altered comment forms - if there are none, don't save the session to decrease the
			// chance of the situation where a user had two same pages in different tabs and lost a form
			// in other tab after saving nothing in this tab.
			if (this.getLastActiveAltered()) {
				this.saveSession(true)
			}

			// We restore or rescue the forms anyway.
			return false
		})
	}

	/**
	 * Highlight or unhighlight the quote buttons of all comment forms.
	 *
	 * @param {boolean} highlight
	 */
	toggleQuoteButtonsHighlighting = (highlight) => {
		this.items.forEach((item) => {
			item.highlightQuoteButton(highlight)
		})
	}

	/**
	 * Go to the next comment form out of sight, or just the next comment form, if `inSight` is set to
	 * `true`.
	 *
	 * @param {boolean} [inSight]
	 */
	goToNextCommentForm(inSight) {
		this.query((commentForm) => inSight || !commentForm.commentInput.$element.cdIsInViewport(true))
			.map((commentForm) => {
				let top = commentForm.$element[0].getBoundingClientRect().top
				if (top < 0) {
					top += /** @type {number} */ ($(document).height()) * 2
				}

				return { commentForm, top }
			})
			.sort((data1, data2) => data1.top - data2.top)
			.map((data) => data.commentForm)[0]
			?.goTo()
	}

	/**
	 * Get the " (form data will not be lost)" string if there are altered forms.
	 *
	 * @returns {string}
	 */
	maybeGetFormDataWontBeLostString() {
		return this.getAll().some((cf) => cf.isAltered())
			? cd.mws('word-separator') + mw.msg('parentheses', cd.s('notification-formdata'))
			: ''
	}
}

export default new CommentFormManager()
