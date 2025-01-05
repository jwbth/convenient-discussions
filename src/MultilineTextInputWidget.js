import TextInputWidget from './TextInputWidget';
import { mixInClass, es6ClassToOoJsClass } from './utils-oojs';

/**
 * OOUI multiline text input widget.
 *
 * @class MultilineTextInputWidget
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.MultilineTextInputWidget
 */

/**
 * Class that we use instead of
 * {@link OO.ui.MultilineTextInputWidget OO.ui.MultilineTextInputWidget} to include our
 * mixin.
 */
class MultilineTextInputWidget extends mixInClass(OO.ui.MultilineTextInputWidget, TextInputWidget) {}

es6ClassToOoJsClass(MultilineTextInputWidget);

export default MultilineTextInputWidget;
