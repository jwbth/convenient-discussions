import { es6ClassToOoJsClass } from './utils-oojs';

/**
 * OOUI label widget.
 *
 * @class LabelWidget
 * @memberof OO.ui
 * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.LabelWidget
 */

/**
 * Class that extends
 * {@link https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.LabelWidget.html OO.ui.LabelWidget} and
 * uses `<div>` tag instead of `<label>`.
 *
 * @augments OO.ui.LabelWidget
 */
class DivLabelWidget extends OO.ui.LabelWidget {
  static tagName = 'div';
}

es6ClassToOoJsClass(DivLabelWidget);

export default DivLabelWidget;
