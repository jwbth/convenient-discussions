import TextInputWidgetMixin from './TextInputWidgetMixin'
import { es6ClassToOoJsClass, mixIntoClass } from './utils-oojs-class'

/**
 * An input was changed manually.
 *
 * @param {*} value Value of the input.
 */

/**
 * @typedef {object} TextInputWidgetExtension
 * @property {typeof import('./controller').default} controller
 * @property {boolean} [supportsComplexMarkup] Whether this input supports external links. If false,
 *   external links that cannot be converted to wikilinks will be inserted as plain URLs without
 *   labels.
 */

/**
 * Class that extends {@link OO.ui.TextInputWidget OO.ui.TextInputWidget} and adds some
 * features we need.
 */
class TextInputWidget extends mixIntoClass(OO.ui.TextInputWidget, TextInputWidgetMixin) {
	/**
	 * @param {OO.ui.TextInputWidget.ConfigOptions & TextInputWidgetExtension} [config]
	 */
	// eslint-disable-next-line @typescript-eslint/no-useless-constructor
	constructor(config) {
		super(config)
	}
}

es6ClassToOoJsClass(TextInputWidget)

export default TextInputWidget
