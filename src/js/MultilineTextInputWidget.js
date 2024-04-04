import TextInputWidget from './TextInputWidget';
import { mixinUserOoUiClass } from './utils-ooui';

/**
 * Class that we use instead of {@link external:OO.ui.MultilineTextInputWidget} to include our
 * mixin.
 *
 * @augments external:OO.ui.MultilineTextInputWidget
 */
class MultilineTextInputWidget extends OO.ui.MultilineTextInputWidget {}

// We can't make `OO.ui.MultilineTextInputWidget` extend our `TextInputWidget`, but we can mixin
// `TextInputWidget` into a class that extends `OO.ui.MultilineTextInputWidget`.
mixinUserOoUiClass(MultilineTextInputWidget, TextInputWidget);

export default MultilineTextInputWidget;
