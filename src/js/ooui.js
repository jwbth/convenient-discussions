/**
 * Helpers for heavily used OOUI widgets and dialogs.
 *
 * @module ooui
 */

import CdError from './CdError';
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
 * OOUI action field layout.
 *
 * @class ActionFieldLayout
 * @memberof external:OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.ActionFieldLayout
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
 * OOUI multiline text input widget.
 *
 * @class MultilineTextInputWidget
 * @memberof external:OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.MultilineTextInputWidget
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
 * OOUI button menu select widget.
 *
 * @class ButtonMenuSelectWidget
 * @memberof external:OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.ButtonMenuSelectWidget
 */

/**
 * Display an OOUI message dialog where user is asked to confirm something. Compared to
 * {@link https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/OO.ui-method-confirm OO.ui.confirm},
 * returns an action string, not a boolean (which helps to differentiate between more than two types
 * of answer and also a window close by pressing Esc).
 *
 * @param {external:jQuery|string} message
 * @param {object} [options={}]
 * @returns {Promise.<Array>}
 */
export async function showConfirmDialog(message, options = {}) {
  const defaultOptions = {
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
  };

  const dialog = new OO.ui.MessageDialog({ classes: ['cd-dialog-confirm'] });
  controller.getWindowManager().addWindows([dialog]);
  const windowInstance = controller.getWindowManager().openWindow(
    dialog,
    Object.assign({}, defaultOptions, options)
  );

  return (await windowInstance.closed)?.action;
}

/**
 * Check if there are unsaved changes in a process dialog.
 *
 * @param {external:OO.ui.ProcessDialog} dialog
 * @returns {boolean}
 * @private
 */
export function isDialogUnsaved(dialog) {
  const saveButton = dialog.actions.get({ actions: 'save' })[0];
  return saveButton && saveButton.isVisible() && !saveButton.isDisabled();
}

/**
 * Confirm closing a process dialog.
 *
 * @param {external:OO.ui.ProcessDialog} dialog
 * @param {string} dialogCode
 */
export function confirmCloseDialog(dialog, dialogCode) {
  if (!isDialogUnsaved(dialog) || confirm(cd.s(`${dialogCode}-close-confirm`))) {
    dialog.close({ action: 'close' });
    controller.removePreventUnloadCondition('dialog');
  }
}

/**
 * Standard process dialog error handler.
 *
 * @param {external:OO.ui.ProcessDialog} dialog
 * @param {CdError|Error} e
 * @param {string} messageName
 * @param {boolean} recoverable
 */
export function handleDialogError(dialog, e, messageName, recoverable) {
  let error;
  if (e instanceof CdError) {
    const { type } = e.data;
    let message = cd.s(messageName);
    if (type === 'network') {
      message += ' ' + cd.s('error-network');
    }
    error = new OO.ui.Error(message, { recoverable });
  } else {
    error = new OO.ui.Error(cd.s('error-javascript'), { recoverable: false });
  }

  dialog.showErrors(error);
  console.warn(e);
  dialog.$errors
    .find('.oo-ui-buttonElement:not(.oo-ui-flaggedElement-primary) > .oo-ui-buttonElement-button')
    .on('click', () => {
      if (recoverable) {
        dialog.updateSize();
      } else {
        dialog.close();
      }
    });

  dialog.actions.setAbilities({ close: true });

  dialog.updateSize();
  dialog.popPending();
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
 * @param {string} options.value
 * @param {string} options.label
 * @param {string} [options.maxLength]
 * @param {string} [options.help]
 * @param {string} [options.title]
 * @returns {CreateTextFieldReturn}
 */
export function createTextField({
  value,
  maxLength,
  label,
  help,
  title,
}) {
  const input = new OO.ui.TextInputWidget({ value, maxLength });
  const field = new OO.ui.FieldLayout(input, {
    label,
    align: 'top',
    help,
    helpInline: true,
    title,
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
 * @param {string} [options.step]
 * @param {string} [options.help]
 * @param {string} [options.title]
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
  title,
  classes,
}) {
  const input = new OO.ui.NumberInputWidget({
    input: { value },
    step: 1,
    buttonStep,
    min,
    max,
    classes: [ 'cd-numberInput' ],
  });
  const field = new OO.ui.FieldLayout(input, {
    label,
    align: 'top',
    help,
    helpInline: true,
    title,
    classes,
  });
  return { field, input };
}

/**
 * @typedef {object} CreateCheckboxFieldReturn
 * @property {external:OO.ui.FieldLayout} field
 * @property {external:OO.ui.CheckboxInputWidget} input
 */

/**
 * Create a checkbox field.
 *
 * @param {object} options
 * @param {string} options.value
 * @param {string} options.label
 * @param {boolean} [options.selected]
 * @param {string} [options.help]
 * @param {string} [options.tabIndex]
 * @param {string} [options.title]
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
  title,
  classes,
}) {
  const input = new OO.ui.CheckboxInputWidget({ value, selected, disabled, tabIndex });
  const field = new OO.ui.FieldLayout(input, {
    label,
    align: 'inline',
    help,
    helpInline: true,
    title,
    classes,
  });
  return { field, input };
}

/**
 * @typedef {object} CreateRadioFieldReturn
 * @property {external:OO.ui.FieldLayout} field
 * @property {external:OO.ui.RadioSelectWidget} select
 * @property {external:OO.ui.RadioOptionWidget[]} items
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
  const items = options.map((config) => new OO.ui.RadioOptionWidget(config));
  const select = new OO.ui.RadioSelectWidget({ items });
  const field = new OO.ui.FieldLayout(select, {
    label,
    align: 'top',
    help,
    helpInline: true,
  });
  select.selectItemByData(selected);
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
 * @returns {external:OO.ui.ActionFieldLayout}
 */
export function createCopyActionField({ label, value, disabled = false, help, copyCallback }) {
  const input = new OO.ui.TextInputWidget({ value, disabled });
  const button = new OO.ui.ButtonWidget({
    label: cd.s('copy'),
    icon: 'articles',
    disabled,
  });
  button.on('click', () => {
    copyCallback(input.getValue());
  });
  return new OO.ui.ActionFieldLayout(input, button, {
    align: 'top',
    label,
    help,
    helpInline: Boolean(help),
  });
}

/**
 * Add some properties to the inheritor class that the (ES5)
 * {@link https://www.mediawiki.org/wiki/OOjs/Inheritance OOUI inheritance mechanism} uses. It
 * partly replicates the operations made in
 * {@link https://doc.wikimedia.org/oojs/master/OO.html#.inheritClass OO.inheritClass}.
 *
 * @param {Function} targetClass Inheritor class.
 * @param {Function} originClass Inherited class.
 */
export function tweakUserOoUiClass(targetClass, originClass) {
  targetClass.parent = targetClass.super = originClass;

  OO.initClass(originClass);
  targetClass.static = Object.create(originClass.static);
  Object.keys(targetClass).forEach((key) => {
    targetClass.static[key] = targetClass[key];
  });
}
