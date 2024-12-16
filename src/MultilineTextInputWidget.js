import TextInputWidget from './TextInputWidget';
import { mixinUserOoUiClass, tweakUserOoUiClass } from './utils-oojs';

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
 *
 * @augments OO.ui.MultilineTextInputWidget
 */
class MultilineTextInputWidget extends OO.ui.MultilineTextInputWidget {}

tweakUserOoUiClass(MultilineTextInputWidget);

// We can't make OO.ui.MultilineTextInputWidget extend our TextInputWidget, but we can mixin
// TextInputWidget into a class that extends OO.ui.MultilineTextInputWidget.
mixinUserOoUiClass(MultilineTextInputWidget, TextInputWidget);

export default MultilineTextInputWidget;
