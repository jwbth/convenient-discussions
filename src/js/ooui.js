/**
 * Helpers for heavily used OOUI widgets.
 *
 * @module ooui
 */

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
 * @returns {CheckboxFieldReturn}
 */
export function checkboxField({ value, selected, disabled, label, help, tabIndex, title }) {
  const checkbox = new OO.ui.CheckboxInputWidget({ value, selected, disabled, tabIndex });
  const field = new OO.ui.FieldLayout(checkbox, {
    label,
    align: 'inline',
    help,
    helpInline: true,
    title,
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
