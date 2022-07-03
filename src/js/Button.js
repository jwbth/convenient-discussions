import { isCmdModifierPressed } from './util';

const prototypes = {};

/**
 * Get a button prototype (a skeleton with few properties set) without recreating it if it already
 * exists.
 *
 * @param {string} tagName Tag name.
 * @returns {Element}
 * @private
 */
function getButtonPrototype(tagName) {
  if (!prototypes[tagName]) {
    const prototype = document.createElement(tagName);
    prototype.tabIndex = 0;
    prototype.setAttribute('role', 'button');
    prototypes[tagName] = prototype;
  }
  return prototypes[tagName];
}

/**
 * Class representing a generic button.
 */
class Button {
  /**
   * Create a button.
   *
   * @param {object} [config]
   * @param {Element} [config.element] Pre-created {@link Button#element element} (usually provided
   *   instead of config).
   * @param {Element} [config.buttonElement] Pre-created {@link Button#buttonElement link element}.
   * @param {Element} [config.labelElement] Pre-created {@link Button#labelElement label element}.
   * @param {Element} [config.iconElement] Pre-created {@link Button#iconElement icon element}.
   * @param {string} [config.tagName='a'] Tag name of the button element.
   * @param {string[]} [config.classes=[]] List of classes to add to the button element.
   * @param {string} [config.href] Value of the `href` parameter to add to the link element.
   * @param {string} [config.label] Label of the button.
   * @param {string} [config.tooltip] Tooltip for the button.
   * @param {string[]} [config.flags] Flags to apply to an OOUI button.
   * @param {Function} [config.action] Function to execute on click or Enter press.
   */
  constructor({
    element,
    buttonElement,
    labelElement,
    iconElement,
    tagName = 'a',
    classes = [],
    id,
    href,
    label,
    tooltip,
    flags,
    action,
  } = {}) {
    if (!element) {
      element = getButtonPrototype(tagName).cloneNode(true);
    }

    if (id) {
      element.id = id;
    }
    if (classes.length) {
      element.classList.add(...classes);
    }

    /**
     * Main element which can be the same as the {@link Button#button link element} or a wrapper
     * around it.
     *
     * @type {Element}
     */
    this.element = element;

    /**
     * Button element (an `'a'` element by default) which can be the same as the
     * {@link Button#element main element} or its descendant.
     *
     * @type {Element}
     */
    this.buttonElement = buttonElement || element;

    /**
     * Button label element which can be the same as the {@link Button#buttonElement link element}
     * or its descendant.
     *
     * @type {Element}
     */
    this.labelElement = labelElement || element;

    /**
     * Button icon element, a descendant of the {@link Button#buttonElement link element}.
     *
     * @type {Element|undefined}
     */
    this.iconElement = iconElement;

    if (href !== undefined) {
      this.setHref(href);
    }
    if (label !== undefined) {
      this.setLabel(label);
    }
    if (tooltip !== undefined) {
      this.setTooltip(tooltip);
    }
    if (flags?.includes('progressive')) {
      this.setIconProgressive();
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
    this.buttonElement.ariaDisabled = disabled;
    this.buttonElement.tabIndex = disabled ? -1 : 0;

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
    this.buttonElement.href = href;

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
    this.buttonElement.title = tooltip;

    return this;
  }

  /**
   * Run a pre-defined action if the button is conditions are met.
   *
   * @param {Function} action
   * @param {Event} e
   */
  maybeRunAction(action, e) {
    if (
      !this.isDisabled() &&
      ((!isCmdModifierPressed(e) && !e.shiftKey) || !this.buttonElement.href)
    ) {
      e.preventDefault();
      action(e);
    }
  }

  /**
   * Set the action of the button. It will be executed on click or Enter press.
   *
   * @param {?Function} action
   * @returns {Button} This button.
   */
  setAction(action) {
    this.buttonElement.onclick = action ?
      (e) => {
        this.maybeRunAction(action, e);
      } :
      action;
    this.buttonElement.onkeydown = action ?
      (e) => {
        // Enter, Space
        if ([13, 32].includes(e.keyCode)) {
          this.maybeRunAction(action, e);
        }
      } :
      action;

    return this;
  }

  /**
   * Check whether the button is disabled.
   *
   * @returns {boolean}
   */
  isDisabled() {
    return this.element.classList.contains('cd-button-disabled');
  }

  /**
   * Check whether the button is pending.
   *
   * @returns {boolean}
   */
  isPending() {
    return this.element.classList.contains('cd-button-pending');
  }

  /**
   * Hide the button.
   *
   * @returns {Button} This button.
   */
  hide() {
    this.element.style.display = 'none';

    return this;
  }

  /**
   * Show the button.
   *
   * @returns {Button} This button.
   */
  show() {
    this.element.style.display = '';

    return this;
  }

  /**
   * Set the class to an OOUI icon to make it look like icons with the "progressive" flag do. Somehow
   * OOUI doesn't set it at the building stage.
   */
  setIconProgressive() {
    this.iconElement?.classList.add('oo-ui-image-progressive');
  }
}

export default Button;
