/**
 * Class that extends {@link OO.ui.CheckboxInputWidget OO.ui.CheckboxInputWidget} and emits
 * `manualChange` event when the input changes by user action.
 *
 * @augments OO.ui.CheckboxInputWidget
 */
class CheckboxInputWidget extends OO.ui.CheckboxInputWidget {
	/**
	 * @param {OO.ui.CheckboxInputWidget.ConfigOptions} config
	 */
	constructor(config) {
		super(config);

		this.$input.on('change', () => {
			this.emit('manualChange', /** @type {HTMLInputElement} */ (this.$input[0]).checked);
		});
	}
}

export default CheckboxInputWidget;
