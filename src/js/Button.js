/**
 * Button class.
 *
 * @module Button
 */

let prototype;

/**
 * Class representing a generic button.
 */
export default class Button {
  /**
   * Create a button.
   *
   * @param {object} [config]
   * @param {Element} [config.element] Pre-created {@link module:Button#element element} (usually
   *   provided instead of config).
   * @param {Element} [config.linkElement] Pre-created {@link module:Button#linkElement link
   *   element}.
   * @param {Element} [config.labelElement] Pre-created {@link module:Button#labelElement label
   *   element}.
   * @param {string[]} [config.classes=[]] List of classes to add to the button element.
   * @param {string} [config.href] Value of the `href` parameter to add to the link element.
   * @param {string} [config.label] Label of the button.
   * @param {string} [config.tooltip] Tooltip for the button.
   * @param {Function} [config.action] Function to execute on click or Enter press.
   */
  constructor({
    element,
    linkElement,
    labelElement,
    classes = [],
    href,
    label,
    tooltip,
    action,
  } = {}) {
    if (!element) {
      if (!prototype) {
        prototype = Button.createPrototype();
      }
      element = prototype.cloneNode(true);
    }

    if (classes.length) {
      element.classList.add(...classes);
    }

    /**
     * Button element which can be the same as the {@link module:Button#linkElement link element} or
     * a wrapper around it.
     *
     * @type {Element}
     */
    this.element = element;

    /**
     * Button link element (an `'a'` element) which can be the same as the
     * {@link module:Button#element button element} or its descendant.
     *
     * @type {Element}
     */
    this.linkElement = linkElement || element;

    /**
     * Button label element which can be which can be the same as the
     * {@link module:Button#linkElement link element} or its descendant.
     *
     * @type {Element}
     */
    this.labelElement = labelElement || element;

    if (href !== undefined) {
      this.setHref(href);
    }
    if (label !== undefined) {
      this.setLabel(label);
    }
    if (tooltip !== undefined) {
      this.setTooltip(tooltip);
    }
    if (action !== undefined) {
      this.setAction(action);
    }
  }

  /**
   * Set the button disabled or not.
   *
   * @param {boolean} disabled
   * @returns {Button} This button.
   */
  setDisabled(disabled) {
    disabled = Boolean(disabled);
    this.element.classList.toggle('cd-button-disabled', disabled);
    this.linkElement.ariaDisabled = disabled;
    this.linkElement.tabIndex = disabled ? -1 : 0;

    return this;
  }

  /**
   * Set the button pending or not.
   *
   * @param {boolean} pending
   * @returns {Button} This button.
   */
  setPending(pending) {
    pending = Boolean(pending);
    this.setDisabled(pending);
    this.element.classList.toggle('cd-button-pending', pending);

    return this;
  }

  /**
   * Set the `href` attribute of the button.
   *
   * @param {string} href
   * @returns {Button} This button.
   */
  setHref(href) {
    this.linkElement.href = href;

    return this;
  }

  /**
   * Set the label of the button.
   *
   * @param {string} label
   * @returns {Button} This button.
   */
  setLabel(label) {
    this.labelElement.textContent = label;

    return this;
  }

  /**
   * Set the tooltip of the button.
   *
   * @param {string} tooltip
   * @returns {Button} This button.
   */
  setTooltip(tooltip) {
    this.linkElement.title = tooltip;

    return this;
  }

  /**
   * Set the action of the button. It will be executed on click or Enter press.
   *
   * @param {?Function} action
   * @returns {Button} This button.
   */
  setAction(action) {
    this.linkElement.onclick = action ?
      (e) => {
        if (!this.isDisabled()) {
          e.preventDefault();
          action(e);
        }
      } :
      action;
    this.linkElement.onkeydown = action ?
      (e) => {
        // Enter, Space
        if (!this.isDisabled() && [13, 32].includes(e.keyCode)) {
          e.preventDefault();
          action(e);
        }
      } :
      action;

    return this;
  }

  isDisabled() {
    return this.element.classList.contains('cd-button-disabled');
  }

  isPending() {
    return this.element.classList.contains('cd-button-pending');
  }

  hide() {
    this.element.style.display = 'none';
  }

  show() {
    this.element.style.display = '';
  }

  static createPrototype() {
    const prototype = document.createElement('a');
    prototype.tabIndex = 0;
    prototype.setAttribute('role', 'button');
    return prototype;
  }
}
