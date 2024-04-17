const { tweakUserOoUiClass } = require('./utils-oojs');

/**
 * Class that extends {@link external:OO.ui.RadioOptionWidget OO.ui.RadioOptionWidget} and allows to
 * add help notes to radio options widgets.
 *
 * @augments external:OO.ui.RadioOptionWidget
 */
export default class RadioOptionWidget extends OO.ui.RadioOptionWidget {
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
   * @returns {external:jQuery}
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

tweakUserOoUiClass(RadioOptionWidget);
