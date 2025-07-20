import { es6ClassToOoJsClass } from './utils-oojs';

/**
 * Class that extends {@link OO.ui.RadioOptionWidget OO.ui.RadioOptionWidget} and allows to
 * add help notes to radio options widgets.
 *
 * @augments OO.ui.RadioOptionWidget
 */
class RadioOptionWidget extends OO.ui.RadioOptionWidget {
  /**
   * Create a radio input widget.
   *
   * @param {object} config
   */
  constructor(config) {
    super(config);

    this.$help = config.help ?
      this.createHelpElement(config.help) :
      $();
    this.$label.append(this.$help);
  }

  /**
   * Create a help element.
   *
   * @param {string} text
   * @returns {JQuery}
   */
  createHelpElement(text) {
    const helpWidget = new (require('./DivLabelWidget').default)({
      label: text,
      classes: ['oo-ui-inline-help'],
    });
    this.radio.$input.attr('aria-describedby', helpWidget.getElementId());

    return helpWidget.$element;
  }
}

es6ClassToOoJsClass(RadioOptionWidget);

export default RadioOptionWidget;
