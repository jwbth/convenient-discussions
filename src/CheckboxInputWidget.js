/**
 * Class that extends {@link OO.ui.CheckboxInputWidget OO.ui.CheckboxInputWidget} and emits
 * `manualChange` event when the input changes by user action.
 *
 * @augments OO.ui.CheckboxInputWidget
 */
class CheckboxInputWidget extends OO.ui.CheckboxInputWidget {
  // eslint-disable-next-line jsdoc/require-jsdoc
  constructor(...args) {
    super(...args);

    this.$input.on('change', () => {
      this.emit('manualChange', this.$input.prop('checked'));
    });
  }
}

export default CheckboxInputWidget;
