import Button from './Button';

/**
 * Class representing a section menu button.
 *
 * @augments Button
 */
class SectionMenuButton extends Button {
  /**
   * Create a comment button.
   *
   * @param {object} config Button config.
   */
  constructor(config) {
    super(config);

    const wrapperElement = document.createElement('span');
    wrapperElement.className = `cd-section-menu-button-wrapper cd-section-menu-button-wrapper-${config.name}`;
    wrapperElement.appendChild(this.element);

    /**
     * Element that wraps the button and the preceding vertical bar.
     *
     * @type {Element}
     */
    this.wrapperElement = wrapperElement;

    if (!config.visible) {
      this.hide();
    }
  }

  /**
   * Hide the button.
   *
   * @returns {Button} This button.
   */
  hide() {
    this.wrapperElement.style.display = 'none';

    return this;
  }

  /**
   * Show the button.
   *
   * @returns {Button} This button.
   */
  show() {
    this.wrapperElement.style.display = '';

    return this;
  }
}

export default SectionMenuButton;
