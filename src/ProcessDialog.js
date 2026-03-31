import ProcessDialogMixin from './ProcessDialogMixin'
import { es6ClassToOoJsClass, mixIntoClass } from './utils-oojs-class'

/**
 * Our class that extends {@link OO.ui.ProcessDialog OO.ui.ProcessDialog}, adding a couple
 * of methods to it.
 */
class ProcessDialog extends mixIntoClass(OO.ui.ProcessDialog, ProcessDialogMixin) {
	/**
	 * @type {string}
	 * @abstract
	 */
	static cdKey
}

es6ClassToOoJsClass(ProcessDialog)

export default ProcessDialog
