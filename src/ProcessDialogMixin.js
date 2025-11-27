import controller from './controller'
import cd from './loader/cd'
import CdError from './shared/CdError'

/**
 * Mixin that adds process dialog functionality.
 */
class ProcessDialogMixin {
	/**
	 * Initialize the mixin.
	 *
	 * @this {ProcessDialogMixin & OO.ui.ProcessDialog}
	 */
	construct() {
		// Workaround to make this.constructor in methods to be type-checked correctly
		/** @type {any} */
		// eslint-disable-next-line no-self-assign
		this.constructor = this.constructor
	}

	/**
	 * Check if there are unsaved changes.
	 *
	 * @returns {boolean}
	 * @this {ProcessDialogMixin & OO.ui.ProcessDialog}
	 */
	isUnsaved() {
		const saveButton = this.actions.get({ actions: 'save' })[0]

		return saveButton.isVisible() && !saveButton.isDisabled()
	}

	/**
	 * Confirm closing the dialog.
	 *
	 * @this {ProcessDialogMixin & OO.ui.ProcessDialog}
	 */
	confirmClose() {
		const cdKey = /** @type {string} */ (this.constructor.cdKey) || 'dialog'
		if (!this.isUnsaved() || confirm(cd.s(`${cdKey}-close-confirm`))) {
			this.close({ action: 'close' })
			controller.removePreventUnloadCondition('dialog')
		}
	}

	/**
	 * Handle a error, displaying a message with the provided name and popping the pending state. If
	 * the error is not recoverable, the dialog is closed on "Dismiss".
	 *
	 * @param {unknown} error
	 * @param {string} [messageName]
	 * @param {boolean} [recoverable]
	 * @protected
	 * @this {ProcessDialogMixin & OO.ui.ProcessDialog}
	 */
	handleError(error, messageName, recoverable) {
		let errorInstance
		if (error instanceof CdError) {
			let message = cd.s(/** @type {string} */ (messageName))
			if (error.getType() === 'network') {
				message += ' ' + cd.s('error-network')
			}
			errorInstance = new OO.ui.Error(message, { recoverable })
		} else {
			errorInstance = new OO.ui.Error(cd.s('error-javascript'), { recoverable: false })
		}

		this.showErrors(errorInstance)
		console.warn(error)
		this.$errors
			.find('.oo-ui-buttonElement:not(.oo-ui-flaggedElement-primary) > .oo-ui-buttonElement-button')
			.on('click', () => {
				if (recoverable) {
					this.updateSize()
				} else {
					this.close()
				}
			})

		this.actions.setAbilities({ close: true })
		this.updateSize()
		this.popPending()
	}
}

export default ProcessDialogMixin
