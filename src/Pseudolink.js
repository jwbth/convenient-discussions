import Button from './Button';
import cd from './loader/cd';

/**
 * @typedef {object} PseudoLinkConfig
 * @property {string} label
 * @property {string} [text]
 * @property {OO.ui.TextInputWidget} [input]
 */

/**
 * Button that inserts text in an input by click and looks like a link with a dashed underline.
 *
 * @private
 */
class Pseudolink extends Button {
  /**
   * Create a pseudolink.
   *
   * @param {PseudoLinkConfig} config
   */
  constructor(config) {
    super({
      element: document.createElement('div'),
      classes: ['cd-pseudolink-wrapper'],
      buttonClasses: ['cd-pseudolink'],
      tooltip: cd.s('pseudolink-tooltip'),
      label: config.label,
    });

    this.text = config.text;
    if (config.input) {
      this.setInput(config.input);
    }
  }

  /**
   * Set the input to insert text in.
   *
   * @param {OO.ui.TextInputWidget} input
   */
  setInput(input) {
    this.setAction(() => {
      input.setValue(this.text || this.labelElement.textContent).focus();
    });
  }
}

export default Pseudolink;
