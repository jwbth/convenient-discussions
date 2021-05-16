/**
 * Helpers for heavily used OOUI widgets.
 *
 * @module ooui
 */

import cd from './cd';

/**
 * @typedef {object} OoUiFieldLayout
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.FieldLayout
 */

/**
 * @typedef {object} OoUiCheckboxInputWidget
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.CheckboxInputWidget
 */

/**
 * @typedef {Array} CheckboxFieldReturn
 * @property {OoUiFieldLayout} 0
 * @property {OoUiCheckboxInputWidget} 1
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
 * @returns {CheckboxFieldReturn}
 */
export function checkboxField({
  value,
  selected,
  disabled,
  label,
  help,
  tabIndex,
  title,
  classes,
}) {
  const checkbox = new OO.ui.CheckboxInputWidget({ value, selected, disabled, tabIndex });
  const field = new OO.ui.FieldLayout(checkbox, {
    label,
    align: 'inline',
    help,
    helpInline: true,
    title,
    classes,
  });
  return [field, checkbox];
}

/**
 * @typedef {object} OoUiRadioSelectWidget
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.RadioSelectWidget
 */

/**
 * @typedef {object} OoUiRadioOptionWidget
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.RadioOptionWidget
 */

/**
 * @typedef {object} RadioFieldReturn
 * @property {OoUiFieldLayout} 0
 * @property {OoUiRadioSelectWidget} 1
 * @property {OoUiRadioOptionWidget} 2
 */

/**
 * Create a radio select field.
 *
 * @param {object} options
 * @param {string} options.label
 * @param {boolean} [options.selected]
 * @param {string} [options.help]
 * @param {object[]} options.options
 * @returns {RadioFieldReturn}
 */
export function radioField({ label, selected, help, options }) {
  const items = options.map((config) => new OO.ui.RadioOptionWidget(config));
  const select = new OO.ui.RadioSelectWidget({ items });
  const field = new OO.ui.FieldLayout(select, {
    label,
    align: 'top',
    help,
    helpInline: true,
  });
  select.selectItemByData(selected);
  return [field, select, ...items];
}

/**
 * @typedef {object} OoUiActionFieldLayout
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.ActionFieldLayout
 */

/**
 * Create an action field for copying text from an input.
 *
 * @param {object} options
 * @param {object} options.label
 * @param {object} options.value
 * @param {object} [options.disabled]
 * @param {object} [options.help]
 * @param {object} options.copyCallback
 * @returns {OoUiActionFieldLayout}
 */
export function copyActionField({ label, value, disabled = false, help, copyCallback }) {
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
