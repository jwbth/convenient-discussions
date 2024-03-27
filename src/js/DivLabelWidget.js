import { tweakUserOoUiClass } from './ooui';

/**
 * Class that extends
 * {@link https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.LabelWidget.html OO.ui.LabelWidget} and
 * uses `<div>` tag instead of `<label>`.
 *
 * @returns {Function}
 */
export default class DivLabelWidget extends OO.ui.LabelWidget {
  static tagName = 'div';
}

tweakUserOoUiClass(DivLabelWidget);
