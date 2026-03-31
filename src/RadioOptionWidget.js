import DivLabelWidget from './DivLabelWidget'
import { es6ClassToOoJsClass } from './utils-oojs-class'

/**
 * @typedef {OO.ui.RadioOptionWidget.ConfigOptions & { help?: string | JQuery }} RadioOptionWidgetConfig
 */

/**
 * Class that extends {@link OO.ui.RadioOptionWidget OO.ui.RadioOptionWidget} and allows to
 * add help notes to radio options widgets.
 *
 * @augments OO.ui.RadioOptionWidget
 */
class RadioOptionWidget extends OO.ui.RadioOptionWidget {
	/**
	 * Create a radio input widget.
	 *
	 * @param {RadioOptionWidgetConfig} config
	 */
	constructor(config) {
		super(config)

		this.$help = config.help ? this.createHelpElement(config.help) : $()
		this.$label.append(this.$help)
	}

	/**
	 * Create a help element.
	 *
	 * @param {string | JQuery} content Help content.
	 * @returns {JQuery}
	 */
	createHelpElement(content) {
		const helpWidget = new DivLabelWidget({
			label: content,
			classes: ['oo-ui-inline-help'],
		})
		this.radio.$input.attr('aria-describedby', helpWidget.getElementId())

		return helpWidget.$element
	}
}

es6ClassToOoJsClass(RadioOptionWidget)

export default RadioOptionWidget
