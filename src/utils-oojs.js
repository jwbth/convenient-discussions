/**
 * Helpers for heavily used OOUI widgets and dialogs.
 *
 * @module utilsOoui
 */

import CheckboxInputWidget from './CheckboxInputWidget'
import RadioOptionWidget from './RadioOptionWidget'
import TextInputWidget from './TextInputWidget'
import cd from './loader/cd'
import { copyText } from './utils-window'

/**
 * OOjs namespace.
 *
 * @external OO
 * @global
 * @see https://doc.wikimedia.org/oojs/master/OO.html
 */

/**
 * Namespace for all classes, static methods and static properties of OOUI.
 *
 * @namespace ui
 * @memberof OO
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui
 */

/**
 * OOjs event emitter.
 *
 * @namespace EventEmitter
 * @memberof OO
 * @see https://doc.wikimedia.org/oojs/master/OO.EventEmitter.html
 */

/**
 * OOUI window manager.
 *
 * @class WindowManager
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.WindowManager
 */

/**
 * OOUI field layout.
 *
 * @class FieldLayout
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.FieldLayout
 */

/**
 * OOUI checkbox input widget.
 *
 * @class CheckboxInputWidget
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.CheckboxInputWidget
 */

/**
 * OOUI radio select widget.
 *
 * @class RadioSelectWidget
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.RadioSelectWidget
 */

/**
 * OOUI radio option widget.
 *
 * @class RadioOptionWidget
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.RadioOptionWidget
 */

/**
 * OOUI copy text layout.
 *
 * @class CopyTextLayout
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.CopyTextLayout
 */

/**
 * OOUI text input widget.
 *
 * @class TextInputWidget
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.TextInputWidget
 */

/**
 * OOUI process dialog.
 *
 * @class ProcessDialog
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.ProcessDialog
 */

/**
 * OOUI process.
 *
 * @class Process
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.Process
 */

/**
 * OOUI page layout.
 *
 * @class PageLayout
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.PageLayout
 */

/**
 * OOUI horizontal layout.
 *
 * @class HorizontalLayout
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.HorizontalLayout
 */

/**
 * OOUI button widget.
 *
 * @class ButtonWidget
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.ButtonWidget
 */

/**
 * OOUI popup button widget.
 *
 * @class PopupButtonWidget
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.PopupButtonWidget
 */

/**
 * OOUI popup widget.
 *
 * @class PopupWidget
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.PopupWidget
 */

/**
 * OOUI button menu select widget.
 *
 * @class ButtonMenuSelectWidget
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.ButtonMenuSelectWidget
 */

/**
 * Display an OOUI message dialog where user is asked to confirm something. Compared to
 * {@link https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.html#.confirm OO.ui.confirm}, returns an
 * action string, not a boolean (which helps to differentiate between more than two types of answer
 * and also a window close by pressing Esc).
 *
 * @param {string|JQuery} message
 * @param {AnyByKey} [options]
 * @returns {Promise.<'accept' | 'reject' | undefined>} `undefined` is possible when pressing Esc, I
 *   think.
 */
export async function showConfirmDialog(message, options = {}) {
	const dialog = new OO.ui.MessageDialog({ classes: ['cd-dialog-confirm'] })
	cd.getWindowManager().addWindows([dialog])
	const win = cd.getWindowManager().openWindow(dialog, { message, ...options })
	win.opened.then(() => {
		if (message instanceof $) {
			mw.hook('wikipage.content').fire(message)
		}
	})
	const closeData = await win.closed

	return closeData?.action
}

/**
 * @typedef {object} ControlOptionsBase
 * @property {string} [name]
 * @property {ControlType} [type]
 * @property {string|JQuery} [label]
 * @property {string|JQuery} [help]
 * @property {string[]} [classes]
 * @property {boolean} [required]
 * @property {boolean} [disabled]
 */

/**
 * @typedef {ControlOptionsBase & {
 *   flags?: string[];
 *   buttonLabel?: string;
 * }} ButtonControlOptions
 */

/**
 * @typedef {ControlOptionsBase & {
 *   value: string;
 *   selected?: boolean;
 *   title?: string;
 *   tabIndex?: number;
 *   accessKey?: string;
 * }} CheckboxControlOptions
 */

/**
 * @typedef {ControlOptionsBase & {
 *   value: string;
 *   copyCallback: (successful: boolean, input: OO.ui.TextInputWidget) => void;
 * }} CopyTextControlOptions
 */

/**
 * @typedef {ControlOptionsBase & {
 *   selected?: string[];
 *   options: Array<{
 *     data: any,
 *     label: string,
 *     help?: string|JQuery,
 *     selected?: boolean,
 *   }>;
 *   classes?: string[];
 * }} MulticheckboxControlOptions
 */

/**
 * @typedef {ControlOptionsBase & {
 *   value: string;
 *   maxLength: number;
 *   rows?: number;
 * }} MultilineTextControlOptions
 */

/**
 * @typedef {ControlOptionsBase & {
 *   selected?: string[];
 *   tagLimit?: number;
 *   placeholder?: string;
 *   dataToUi?: (value: Array<string|string[]>) => string[];
 *   uiToData?: (value: string[]) => (string|string[])[];
 * }} MultitagControlOptions
 */

/**
 * @typedef {ControlOptionsBase & {
 *   value: string;
 *   min: number;
 *   max: number;
 *   buttonStep?: number;
 * }} NumberControlOptions
 */

/**
 * @typedef {ControlOptionsBase & {
 *   selected?: string;
 *   options: (import('./RadioOptionWidget').RadioOptionWidgetConfig)[];
 * }} RadioControlOptions
 */

/**
 * @typedef {ControlOptionsBase & {
 *   value?: string;
 *   maxLength?: number;
 * }} TextControlOptions
 */

/**
 * @typedef {ControlOptionsBase & mw.widgets.TitleInputWidget.ConfigOptions & {
 *   label?: string;
 *   help?: string|JQuery;
 *   classes?: string[];
 * }} TitleControlOptions
 */

/**
 * Create a text input field.
 *
 * @param {TextControlOptions} options
 * @returns {TextControl}
 */
export function createTextControl({ value, maxLength, required, classes, label, help }) {
	return createGenericControl(
		'text',
		new TextInputWidget({ value, maxLength, required, classes }),
		{ label, help },
	)
}

/**
 * Create a number input field.
 *
 * @param {NumberControlOptions} options
 * @returns {NumberControl}
 */
export function createNumberControl({ value, label, min, max, buttonStep = 1, help, classes }) {
	return createGenericControl(
		'number',

		// See https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/oojs-ui#caveats for
		// why we need type casting here.
		/** @type {OO.ui.TextInputWidget} */ (
			/** @type {unknown} */ (
				new OO.ui.NumberInputWidget({
					input: { value },
					step: 1,
					buttonStep,
					min,
					max,
					classes: ['cd-numberInput'],
				})
			)
		),
		{ label, help, classes },
	)
}

/**
 * Create a checkbox field.
 *
 * @param {CheckboxControlOptions} options
 * @returns {CheckboxControl}
 */
export function createCheckboxControl({
	value,
	selected,
	disabled,
	label,
	title,
	help,
	tabIndex,
	classes,
	accessKey,
}) {
	return createGenericControl(
		'checkbox',
		new CheckboxInputWidget({
			value,
			selected,
			disabled,
			tabIndex,
			accessKey,
		}),
		{
			label,
			title,
			help,
			classes,
			align: 'inline',
		},
	)
}

/**
 * Create a radio select field.
 *
 * @param {RadioControlOptions} options
 * @returns {RadioControl}
 */
export function createRadioControl({ label, selected, help, options }) {
	const input = new OO.ui.RadioSelectWidget({
		items: options.map((config) => new RadioOptionWidget(config)),
	})

	// Workarounds for T359920
	input.$element.off('mousedown')
	input.$focusOwner = $()

	if (selected !== undefined) {
		input.selectItemByData(selected)
	}

	return createGenericControl('radio', input, { label, help })
}

/**
 * Create an action field for copying text from an input.
 *
 * @param {CopyTextControlOptions} options
 * @returns {CopyTextControl}
 */
export function createCopyTextControl({
	label,
	value,
	disabled = false,
	help,
	classes,
	copyCallback,
}) {
	if ('CopyTextLayout' in OO.ui) {
		const field = new OO.ui.CopyTextLayout({
			align: 'top',
			label,
			copyText: value,
			button: { disabled },
			textInput: { disabled },
			help,
			helpInline: Boolean(help),
			classes,
		})
		field.on('copy', (successful) => {
			copyCallback(successful, field.textInput)
		})

		return { type: 'copyText', field, input: field.textInput }
	}

	// MediaWiki versions before 1.34 do not have CopyTextLayout, so we use ActionFieldLayout instead
	const input = new OO.ui.TextInputWidget({ value, disabled })
	const button = new OO.ui.ButtonWidget({
		label: cd.s('copy'),
		icon: 'copy',
		disabled,
	})
	button.on('click', () => {
		copyCallback(copyText(input.getValue()), input)
	})

	return {
		type: 'copyText',
		field: new OO.ui.ActionFieldLayout(input, button, {
			align: 'top',
			label,
			help,
			helpInline: Boolean(help),
			classes,
		}),
		input,
	}
}

/**
 * Create a checkbox multiselect field.
 *
 * @param {MulticheckboxControlOptions} options
 * @returns {MulticheckboxControl}
 */
export function createMulticheckboxControl({ label, options, selected, classes }) {
	return createGenericControl(
		'multicheckbox',
		new OO.ui.CheckboxMultiselectWidget({
			items: options.map(
				(option) =>
					new OO.ui.CheckboxMultioptionWidget({
						data: option.data,
						selected: selected ? selected.includes(option.data) : option.selected,
						label: option.label,
					}),
			),
			classes,
		}),
		{ label },
	)
}

/**
 * Create a tag multiselect field.
 *
 * @param {MultitagControlOptions} options
 * @returns {MultitagControl}
 */
export function createMultitagControl({
	label,
	placeholder,
	tagLimit,
	selected,
	help,
	dataToUi,
	uiToData,
}) {
	return createGenericControl(
		'multitag',
		new OO.ui.TagMultiselectWidget({
			placeholder,
			allowArbitrary: true,
			inputPosition: 'outline',
			tagLimit,
			selected: (dataToUi || ((val) => val)).call(null, selected || []),
		}),
		{ label, help },
		{ uiToData },
	)
}

/**
 * Create a button field.
 *
 * @param {ButtonControlOptions} options
 * @returns {ButtonControl}
 */
export function createButtonControl({ label, flags, buttonLabel, help }) {
	return createGenericControl('button', new OO.ui.ButtonWidget({ label: buttonLabel, flags }), {
		label,
		help,
	})
}

/**
 * Create a title input field (using
 * {@link https://doc.wikimedia.org/mediawiki-core/master/js/mw.widgets.TitleInputWidget.html mw.widgets.TitleInputWidget}).
 *
 * @param {TitleControlOptions} options
 * @returns {TitleControl}
 */
export function createTitleControl(options) {
	const { label, help, classes, ...titleInputOptions } = options

	return createGenericControl('title', new mw.widgets.TitleInputWidget(titleInputOptions), {
		label,
		help,
		classes,
	})
}

/**
 * @typedef {object} GenericFieldOptions
 * @property {string|JQuery} [label]
 * @property {'top'|'inline'} [align='top']
 * @property {string|JQuery} [help]
 * @property {boolean} [helpInline]
 * @property {string[]} [classes]
 * @property {string} [title]
 */

/**
 * Create a generic control with a field layout.
 *
 * @template {ControlType} T
 * @param {T} type Control type identifier
 * @param {ControlTypeToWidget[T]} input The input widget
 * @param {GenericFieldOptions} [fieldOptions] Configuration for the field layout
 * @param {AnyByKey} [data] Additional data to attach to the control
 * @returns {GenericControl<T>}
 */
export function createGenericControl(type, input, fieldOptions = {}, data = {}) {
	const field = /** @type {OO.ui.FieldLayout<ControlTypeToWidget[T]>} */ (
		new OO.ui.FieldLayout(input, {
			align: 'top',
			helpInline: true,
			...fieldOptions,
		})
	)

	if (!fieldOptions.label) {
		field.$element.addClass('cd-field-labelless')
	}

	return { type, field, input, ...data }
}
