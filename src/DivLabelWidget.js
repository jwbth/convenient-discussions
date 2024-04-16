import { tweakUserOoUiClass } from './utils-oojs';

/**
 * OOUI label widget.
 *
 * @class LabelWidget
 * @memberof external:OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.LabelWidget
 */

/**
 * Class that extends
 * {@link https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.LabelWidget.html OO.ui.LabelWidget} and
 * uses `<div>` tag instead of `<label>`.
 *
 * @augments external:OO.ui.LabelWidget
 */
class DivLabelWidget extends OO.ui.LabelWidget {
  static tagName = 'div';
}

tweakUserOoUiClass(DivLabelWidget);

export default DivLabelWidget;
