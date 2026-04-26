import TextInputWidgetMixin from './TextInputWidgetMixin'
import { es6ClassToOoJsClass, mixIntoClass } from './utils-oojs-class'

/**
 * OOUI multiline text input widget.
 *
 * @class MultilineTextInputWidget
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.MultilineTextInputWidget
 */

/**
 * Class that we use instead of
 * {@link OO.ui.MultilineTextInputWidget OO.ui.MultilineTextInputWidget} to include our
 * mixin.
 */
class MultilineTextInputWidget extends mixIntoClass(
	OO.ui.MultilineTextInputWidget,
	TextInputWidgetMixin,
) {
	/**
	 * @param {OO.ui.MultilineTextInputWidget.ConfigOptions & import('./TextInputWidget').TextInputWidgetExtension} [config]
	 */
	// eslint-disable-next-line @typescript-eslint/no-useless-constructor
	constructor(config) {
		super(config)
	}

	/**
	 * Focus the input and select a specified range within the text.
	 *
	 * @param {number} start Select from offset
	 * @param {number} [end] Select to offset
	 * @returns {this} The widget, for chaining
	 * @override
	 */
	selectRange(start, end = start) {
		this.focus()
		this.$input.textSelection('setSelection', { start, end })

		return this
	}

	/**
	 * Get an object describing the current selection range in a directional manner.
	 *
	 * @returns {{ from: number, to: number }}
	 * @override
	 */
	getRange() {
		const caretPosition = this.$input.textSelection('getCaretPosition', { startAndEnd: true })
		const start = caretPosition[0]
		const end = caretPosition[1]

		return {
			from: Math.min(start, end),
			to: Math.max(start, end),
		}
	}

	/**
	 * Set the correspondent CodeMirror instance.
	 *
	 * @param {InstanceType<ReturnType<typeof import('./OoUiInputCodeMirror').default>>} codeMirror
	 */
	setCodeMirror(codeMirror) {
		/** @type {InstanceType<ReturnType<typeof import('./OoUiInputCodeMirror').default>> | undefined} */
		this.codeMirror = codeMirror

		this.updateCodeMirrorPendingClass()
	}

	/**
	 * Focus this element.
	 *
	 * @override
	 * @returns {this}
	 */
	focus() {
		if (this.codeMirror?.isActive) {
			this.codeMirror.view.focus()

			return this
		}

		return super.focus()
	}

	/**
	 * Check if the widget is focused.
	 *
	 * @returns {boolean}
	 */
	isFocused() {
		return this.codeMirror?.isActive
			? this.codeMirror.container.contains(document.activeElement)
			: this.$input.is(':focus')
	}

	/**
	 * @override
	 */
	pushPending() {
		super.pushPending()
		this.updateCodeMirrorPendingClass()

		return this
	}

	/**
	 * @override
	 */
	popPending() {
		super.popPending()
		this.updateCodeMirrorPendingClass()

		return this
	}

	/**
	 * Update the pending status of the CodeMirror instance.
	 */
	updateCodeMirrorPendingClass() {
		if (!this.codeMirror) return

		this.getEditableElement().toggleClass('oo-ui-pendingElement-pending', this.pending > 0)
	}

	/**
	 * Get the editable element of the input.
	 *
	 * @returns {JQuery}
	 * @override
	 */
	getEditableElement() {
		return $(this.codeMirror?.isActive ? this.codeMirror.view.contentDOM : this.$input)
	}

	/**
	 * Set the disabled state of the input, including the CodeMirror instance if present.
	 *
	 * @param {boolean} disabled
	 * @returns {this}
	 * @override
	 */
	setDisabled(disabled) {
		super.setDisabled(disabled)
		this.codeMirror?.updateDisabled(disabled)

		return this
	}

	/**
	 * Update the placeholder text.
	 *
	 * @param {string} text
	 */
	updatePlaceholder(text) {
		this.$input.attr('placeholder', text)
		this.codeMirror?.updatePlaceholder(text)
	}
}

es6ClassToOoJsClass(MultilineTextInputWidget)

export default MultilineTextInputWidget
