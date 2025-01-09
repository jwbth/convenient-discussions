/**
 * Helpers for heavily used OOUI widgets and dialogs.
 *
 * @module utilsOoui
 */

import cd from './cd';
import controller from './controller';
import { copyText } from './utils-window';

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
 * @param {JQuery|string} message
 * @param {{ [key: string]: any }} [options={}]
 * @returns {Promise.<'accept' | 'reject' | undefined>} `undefined` is possible when pressing Esc, I
 *   think.
 */
export async function showConfirmDialog(message, options = {}) {
  const dialog = new OO.ui.MessageDialog({ classes: ['cd-dialog-confirm'] });
  controller.getWindowManager().addWindows([dialog]);
  const win = controller.getWindowManager().openWindow(dialog, { message, ...options });
  win.opened.then(() => {
    if (message instanceof $) {
      mw.hook('wikipage.content').fire(message);
    }
  });
  const closeData = await win.closed;

  return closeData?.action;
}

/**
 * @typedef {object} CommonWidgetConfigProps
 * @property {string|JQuery} [label]
 * @property {string|JQuery} [help]
 * @property {string[]} [classes]
 * @property {boolean} [required]
 * @property {boolean} [disabled]
 */

/**
 * @typedef {CommonWidgetConfigProps & {
 *   type: 'text';
 *   value: string;
 *   maxLength: number;
 * }} TextFieldType
 */

/**
 * @typedef {CommonWidgetConfigProps & {
 *   type: 'number';
 *   value: string;
 *   min: number;
 *   max: number;
 *   buttonStep?: number;
 * }} NumberFieldType
 */

/**
 * @typedef {CommonWidgetConfigProps & {
 *   type: 'checkbox';
 *   value: string;
 *   selected: boolean;
 *   title?: string;
 *   tabIndex?: number;
 * }} CheckboxFieldType
 */

/**
 * @typedef {CommonWidgetConfigProps & {
 *   type: 'radio';
 *   selected?: string;
 *   options: Array<{
 *     data: any;
 *     label: string
 *   }>;
 * }} RadioFieldType
 */

/**
 * @typedef {CommonWidgetConfigProps & {
 *   type: 'multiline';
 *   value: string;
 *   maxLength: number;
 *   rows?: number;
 * }} MultilineTextFieldType
 */

/**
 * @typedef {CommonWidgetConfigProps & {
 *   type: 'tags';
 *   selected: string[];
 *   tagLimit: number;
 *   placeholder?: string;
 *   validate?: (...args: any[]) => any;
 * }} TagMultiselectFieldType
 */

/**
 * @typedef {CommonWidgetConfigProps & {
 *   value: string;
 *   copyCallback: (successful: boolean, field: OO.ui.CopyTextLayout) => void;
 * }} CopyTextFieldType
 */

/**
 * @typedef {object} CreateTextFieldReturn
 * @property {OO.ui.FieldLayout} field
 * @property {OO.ui.TextInputWidget} input
 */

/**
 * Create a text input field.
 *
 * @param {TextFieldType} options
 * @returns {CreateTextFieldReturn}
 */
export function createTextField({
  value,
  maxLength,
  required,
  classes,
  label,
  help,
}) {
  const input = new (require('./TextInputWidget').default)({ value, maxLength, required, classes });
  const field = new OO.ui.FieldLayout(input, {
    label,
    align: 'top',
    help,
    helpInline: true,
  });

  return { field, input };
}

/**
 * @typedef {object} CreateNumberFieldReturn
 * @property {OO.ui.FieldLayout} field
 * @property {OO.ui.NumberInputWidget} input
 */

/**
 * Create a number input field.
 *
 * @param {NumberFieldType} options
 * @returns {CreateNumberFieldReturn}
 */
export function createNumberField({
  value,
  label,
  min,
  max,
  buttonStep = 1,
  help,
  classes,
}) {
  const input = new OO.ui.NumberInputWidget({
    input: { value },
    step: 1,
    buttonStep,
    min,
    max,
    classes: ['cd-numberInput'],
  });
  // @ts-ignore: https://github.com/DefinitelyTyped/DefinitelyTyped/discussions/71513
  const field = new OO.ui.FieldLayout(input, {
    label,
    align: 'top',
    help,
    helpInline: true,
    classes,
  });
  if (!label) {
    field.$element.addClass('cd-field-no-label');
  }

  return { field, input };
}

/**
 * @typedef {object} CreateCheckboxFieldReturn
 * @property {OO.ui.FieldLayout} field
 * @property {import('./CheckboxInputWidget').default} input
 */

/**
 * Create a checkbox field.
 *
 * @param {CheckboxFieldType} options
 * @returns {CreateCheckboxFieldReturn}
 */
export function createCheckboxField({
  value,
  selected,
  disabled,
  label,
  title,
  help,
  tabIndex,
  classes,
}) {
  const input = new (require('./CheckboxInputWidget').default)({
    value,
    selected,
    disabled,
    tabIndex,
  });
  const field = new OO.ui.FieldLayout(input, {
    label,
    title,
    align: 'inline',
    help,
    helpInline: true,
    classes,
  });

  return { field, input };
}

/**
 * @typedef {object} CreateRadioFieldReturn
 * @property {OO.ui.FieldLayout} field
 * @property {OO.ui.RadioSelectWidget} select
 * @property {import('./RadioOptionWidget').default[]} items
 */

/**
 * Create a radio select field.
 *
 * @param {RadioFieldType} options
 * @returns {CreateRadioFieldReturn}
 */
export function createRadioField({ label, selected, help, options }) {
  const items = options.map((config) => new (require('./RadioOptionWidget').default)(config));
  const select = new OO.ui.RadioSelectWidget({ items });

  // Workarounds for T359920
  select.$element.off('mousedown');
  select.$focusOwner = $();

  const field = new OO.ui.FieldLayout(select, {
    label,
    align: 'top',
    help,
    helpInline: true,
  });

  if (selected !== undefined) {
    select.selectItemByData(selected);
  }

  return { field, select, items };
}

/**
 * Create an action field for copying text from an input.
 *
 * @param {CopyTextFieldType} options
 * @returns {OO.ui.CopyTextLayout|OO.ui.ActionFieldLayout}
 */
export function createCopyTextField({ label, value, disabled = false, help, copyCallback }) {
  let field;
  if ('CopyTextLayout' in OO.ui) {
    field = new OO.ui.CopyTextLayout({
      align: 'top',
      label,
      copyText: value,
      button: { disabled },
      textInput: { disabled },
      help,
      helpInline: Boolean(help),
    });
    field.on('copy', (successful) => {
      copyCallback(successful, /** @type {OO.ui.CopyTextLayout} */ field);
    });
  } else {
    // Older MediaWiki versions
    const input = new OO.ui.TextInputWidget({ value, disabled });
    const button = new OO.ui.ButtonWidget({
      label: cd.s('copy'),
      icon: 'copy',
      disabled,
    });
    button.on('click', () => {
      copyCallback(input.getValue());
    });
    field = new OO.ui.ActionFieldLayout(input, button, {
      align: 'top',
      label,
      help,
      helpInline: Boolean(help),
    });
  }

  return field;
}

/**
 * @typedef {object} OoJsClassSpecificProps
 * @property {OO.ConstructorLike} [parent] The parent constructor.
 * @property {OO.ConstructorLike} [super] The super constructor.
 * @property {object} static An object containing static properties.
 */

/**
 * @typedef {Constructor & OoJsClassSpecificProps} OoJsClassLike
 */

/**
 * Make a class conform to the structure used by OOjs' ES5-based classes, with its
 * {@link https://www.mediawiki.org/wiki/OOjs/Inheritance inheritance mechanism} and peculiar way to
 * store static properties. It partly replicates the operations made in
 * {@link https://doc.wikimedia.org/oojs/master/OO.html#.inheritClass OO.inheritClass}.
 *
 * @template {OoJsClassLike} T
 * @param {T} TargetClass
 * @returns {T}
 */
export function es6ClassToOoJsClass(TargetClass) {
  const OriginClass = Object.getPrototypeOf(TargetClass);
  TargetClass.parent = TargetClass.super = OriginClass;

  OO.initClass(OriginClass);
  TargetClass.static = Object.create(OriginClass.static);
  Object.keys(TargetClass)
    .filter((key) => !['parent', 'super', 'static'].includes(key))
    .forEach((key) => {
      TargetClass.static[key] = TargetClass[key];
    });

  return TargetClass;
}

/**
 * Add {@link OO.EventEmitter OO.EventEmitter}'s methods to an arbitrary object itself, not its
 * prototype. Can be used for singletons or classes. In the latter case, the methods will be added
 * as static.
 *
 * @param {object} obj
 */
export function mixEventEmitterInObject(obj) {
  const dummy = () => {};
  dummy.prototype = {};
  OO.mixinClass(dummy, OO.EventEmitter);
  Object.assign(obj, dummy.prototype);
  OO.EventEmitter.call(obj);
}

/**
 * Mix in a class into a target class.
 *
 * @template {Constructor} TBase
 * @template {Constructor} TMixin
 * @param {TBase} Base
 * @param {TMixin} Mixin
 * @returns {TBase & MixinType}
 */
export function mixInClass(Base, Mixin) {
  /**
   * @typedef {{
   *   new (...args: any[]): InstanceType<TMixin>;
   *   prototype: InstanceType<TMixin>;
   * }} MixinType
   */

  // eslint-disable-next-line jsdoc/require-jsdoc
  class Class extends Base {}
  OO.mixinClass(Class, Mixin);

  return /** @type {TBase & MixinType} */ (Class);
}

/**
 * Add a mixin's (e.g. {@link OO.EventEmitter OO.EventEmitter}) methods to an arbitrary object
 * itself (the static side), not its prototype.
 *
 * @template {{}} TBase
 * @template {Constructor} TMixin
 * @param {TBase} obj
 * @param {TMixin} Mixin
 * @returns {TBase & InstanceType<TMixin>}
 */
export function mixInObject(obj, Mixin) {
  const dummy = () => {};
  dummy.prototype = /** @type {InstanceType<TMixin>} */ ({});
  OO.mixinClass(dummy, Mixin);
  Object.assign(obj, {});
  Mixin.call(obj);

  return /** @type {TBase & InstanceType<TMixin>} */ (obj);
}
