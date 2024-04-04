import { tweakUserOoUiClass } from './utils-ooui';

/**
 * Class that extends
 * {@link https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.LabelWidget.html OO.ui.LabelWidget} and
 * uses `<div>` tag instead of `<label>`.
 *
 * @returns {Function}
 */
class DivLabelWidget extends OO.ui.LabelWidget {
  static tagName = 'div';
}

tweakUserOoUiClass(DivLabelWidget);

export default DivLabelWidget;
