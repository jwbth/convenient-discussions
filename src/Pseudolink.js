import Button from './Button';
import cd from './cd';

/**
 * Button that inserts text in an input by click and looks like a link with a dashed underline.
 *
 * @private
 */
class PseudoLink extends Button {
  /**
   * Create a pseudolink.
   *
   * @param {object} config
   */
  constructor(config) {
    super({
      element: document.createElement('div'),
      classes: ['cd-pseudolink-wrapper'],
      buttonClasses: ['cd-pseudolink'],
      tooltip: cd.s('pseudolink-tooltip'),
      label: config.label,
      action: () => {
        config.input.setValue(config.text || config.label).focus();
      },
    });
  }
}

export default PseudoLink;
