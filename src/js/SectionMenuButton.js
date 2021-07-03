/**
 * Section menu button class.
 *
 * @module SectionMenuButton
 */

import Button from './Button';

/**
 * Class representing a section menu button.
 */
export default class SectionMenuButton extends Button {
  /**
   * Create a comment button.
   *
   * @param {object} config Button config.
   */
  constructor(config) {
    super(config);

    const wrapperElement = document.createElement('span');
    wrapperElement.className = `cd-section-menu-button-wrapper cd-section-menu-button-wrapper-${name}`;
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
   */
  hide() {
    this.wrapperElement.style.display = 'none';
  }

  /**
   * Show the button.
   */
  show() {
    this.wrapperElement.style.display = '';
  }
}
