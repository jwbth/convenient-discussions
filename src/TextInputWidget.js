import TextInputWidgetMixin from './TextInputWidgetMixin'
import { es6ClassToOoJsClass, mixIntoClass } from './utils-oojs-class'

/**
 * An input was changed manually.
 *
 * @param {*} value Value of the input.
 */

/**
 * Class that extends {@link OO.ui.TextInputWidget OO.ui.TextInputWidget} and adds some
 * features we need.
 */
class TextInputWidget extends mixIntoClass(OO.ui.TextInputWidget, TextInputWidgetMixin) {}

es6ClassToOoJsClass(TextInputWidget)

export default TextInputWidget
