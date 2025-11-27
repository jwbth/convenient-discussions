import ProcessDialogMixin from './ProcessDialogMixin'
import { es6ClassToOoJsClass, mixInClass } from './utils-oojs'

/**
 * Our class that extends {@link OO.ui.ProcessDialog OO.ui.ProcessDialog}, adding a couple
 * of methods to it.
 */
class ProcessDialog extends mixInClass(OO.ui.ProcessDialog, ProcessDialogMixin) {
	/**
	 * @type {string}
	 * @abstract
	 */
	static cdKey
}

es6ClassToOoJsClass(ProcessDialog)

export default ProcessDialog
