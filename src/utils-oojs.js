/**
 * Helpers for heavily used OOUI widgets and dialogs.
 *
 * @module utilsOoui
 */

import cd from './cd';
import controller from './controller';

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
 * @memberof external:OO
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui
 */

/**
 * OOjs event emitter.
 *
 * @namespace EventEmitter
 * @memberof external:OO
 * @see https://doc.wikimedia.org/oojs/master/OO.EventEmitter.html
 */

/**
 * OOUI window manager.
 *
 * @class WindowManager
 * @memberof external:OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.WindowManager
 */

/**
 * OOUI field layout.
 *
 * @class FieldLayout
 * @memberof external:OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.FieldLayout
 */

/**
 * OOUI checkbox input widget.
 *
 * @class CheckboxInputWidget
 * @memberof external:OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.CheckboxInputWidget
 */

/**
 * OOUI radio select widget.
 *
 * @class RadioSelectWidget
 * @memberof external:OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.RadioSelectWidget
 */

/**
 * OOUI radio option widget.
 *
 * @class RadioOptionWidget
 * @memberof external:OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.RadioOptionWidget
 */

/**
 * OOUI copy text layout.
 *
 * @class CopyTextLayout
 * @memberof external:OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.CopyTextLayout
 */

/**
 * OOUI text input widget.
 *
 * @class TextInputWidget
 * @memberof external:OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.TextInputWidget
 */

/**
 * OOUI process dialog.
 *
 * @class ProcessDialog
 * @memberof external:OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.ProcessDialog
 */

/**
 * OOUI process.
 *
 * @class Process
 * @memberof external:OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.Process
 */

/**
 * OOUI page layout.
 *
 * @class PageLayout
 * @memberof external:OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.PageLayout
 */

/**
 * OOUI horizontal layout.
 *
 * @class HorizontalLayout
 * @memberof external:OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.HorizontalLayout
 */

/**
 * OOUI button widget.
 *
 * @class ButtonWidget
 * @memberof external:OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.ButtonWidget
 */

/**
 * OOUI popup button widget.
 *
 * @class PopupButtonWidget
 * @memberof external:OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.PopupButtonWidget
 */

/**
 * OOUI popup widget.
 *
 * @class PopupWidget
 * @memberof external:OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.PopupWidget
 */

/**
 * OOUI button menu select widget.
 *
 * @class ButtonMenuSelectWidget
 * @memberof external:OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.ButtonMenuSelectWidget
 */

/**
 * Display an OOUI message dialog where user is asked to confirm something. Compared to
 * {@link https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.html#.confirm OO.ui.confirm}, returns an
 * action string, not a boolean (which helps to differentiate between more than two types of answer
 * and also a window close by pressing Esc).
 *
 * @param {external:jQuery|string} message
 * @param {object} [options={}]
 * @returns {Promise.<Array>}
 */
export async function showConfirmDialog(message, options = {}) {
  const dialog = new OO.ui.MessageDialog({ classes: ['cd-dialog-confirm'] });
  controller.getWindowManager().addWindows([dialog]);
  const windowInstance = controller.getWindowManager().openWindow(
    dialog,
    Object.assign(
      // Default options
      {
        message,

        // OO.ui.MessageDialog standard
        actions: [
          {
            action: 'accept',
            label: OO.ui.deferMsg('ooui-dialog-message-accept'),
            flags: 'primary',
          },
          {
            action: 'reject',
            label: OO.ui.deferMsg('ooui-dialog-message-reject'),
            flags: 'safe',
          },
        ],
      },
      options
    )
  );

  return (await windowInstance.closed)?.action;
}

/**
 * @typedef {object} CreateTextFieldReturn
 * @property {external:OO.ui.FieldLayout} field
 * @property {external:OO.ui.TextInputWidget} input
 */

/**
 * Create a text input field.
 *
 * @param {object} options
 * @param {string} [options.value]
 * @param {string} options.label
 * @param {string} [options.required]
 * @param {string} [options.classes]
 * @param {string} [options.maxLength]
 * @param {string} [options.help]
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
 * @property {external:OO.ui.FieldLayout} field
 * @property {external:OO.ui.TextInputWidget} input
 */

/**
 * Create a number input field.
 *
 * @param {object} options
 * @param {string} options.value
 * @param {string} options.label
 * @param {string} [options.min]
 * @param {string} [options.max]
 * @param {string} [options.buttonStep]
 * @param {string} [options.help]
 * @param {string[]} [options.classes]
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
  const field = new OO.ui.FieldLayout(input, {
    label,
    align: 'top',
    help,
    helpInline: true,
    classes,
  });
  return { field, input };
}

/**
 * @typedef {object} CreateCheckboxFieldReturn
 * @property {external:OO.ui.FieldLayout} field
 * @property {import('./CheckboxInputWidget').default} input
 */

/**
 * Create a checkbox field.
 *
 * @param {object} options
 * @param {string} options.value
 * @param {string} options.label
 * @param {boolean} [options.selected]
 * @param {boolean} [options.disabled]
 * @param {string} [options.help]
 * @param {string} [options.tabIndex]
 * @param {string[]} [options.classes]
 * @returns {CreateCheckboxFieldReturn}
 */
export function createCheckboxField({
  value,
  selected,
  disabled,
  label,
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
    align: 'inline',
    help,
    helpInline: true,
    classes,
  });
  return { field, input };
}

/**
 * @typedef {object} CreateRadioFieldReturn
 * @property {external:OO.ui.FieldLayout} field
 * @property {external:OO.ui.RadioSelectWidget} select
 * @property {RadioOptionWidget[]} items
 */

/**
 * Create a radio select field.
 *
 * @param {object} options
 * @param {string} options.label
 * @param {boolean} [options.selected]
 * @param {string} [options.help]
 * @param {object[]} options.options
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
 * @param {object} options
 * @param {object} options.label
 * @param {object} options.value
 * @param {object} [options.disabled]
 * @param {object} [options.help]
 * @param {object} options.copyCallback
 * @returns {external:OO.ui.CopyTextLayout|external:OO.ui.ActionFieldLayout}
 */
export function createCopyTextField({ label, value, disabled = false, help, copyCallback }) {
  let field;
  if (OO.ui.CopyTextLayout) {
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
      copyCallback(successful, field);
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
 * Add some properties to the inheritor class that the (ES5)
 * {@link https://www.mediawiki.org/wiki/OOjs/Inheritance OOUI inheritance mechanism} uses. It
 * partly replicates the operations made in
 * {@link https://doc.wikimedia.org/oojs/master/OO.html#.inheritClass OO.inheritClass}.
 *
 * @param {Function} targetClass Inheritor class.
 * @returns {Function}
 */
export function tweakUserOoUiClass(targetClass) {
  const originClass = Object.getPrototypeOf(targetClass);
  OO.initClass(originClass);
  targetClass.static = Object.create(originClass.static);
  Object.keys(targetClass)
    .filter((key) => key !== 'static')
    .forEach((key) => {
      targetClass.static[key] = targetClass[key];
    });
  targetClass.parent = targetClass.super = originClass;
  return targetClass;
}

/**
 * Mix in a user class into a target OOUI class.
 *
 * @param {Function} targetClass
 * @param {Function} originClass
 */
export function mixinUserOoUiClass(targetClass, originClass) {
  OO.mixinClass(targetClass, originClass);

  Object.getOwnPropertyNames(originClass.prototype)
    .filter((key) => key !== 'constructor')
    .forEach((key) => {
      targetClass.prototype[key] = originClass.prototype[key];
    });
}

/**
 * Add {@link external:OO.EventEmitter OO.EventEmitter}'s methods to an arbitrary object itself, not
 * its prototype. Can be used for singletons or classes. In the latter case, the methods will be
 * added as static.
 *
 * @param {object} obj
 */
export function mixEventEmitterIntoObject(obj) {
  const dummy = { prototype: {} };
  OO.mixinClass(dummy, OO.EventEmitter);
  Object.assign(obj, dummy.prototype);
  OO.EventEmitter.call(obj);
}
