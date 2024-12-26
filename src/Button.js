import { isCmdModifierPressed } from './utils-window';

/**
 * @callback Action
 * @param {MouseEvent | KeyboardEvent} event
 * @param {Button} [button]
 * @returns {void}
 */

/**
 * @typedef {object} ButtonConfig
 * @property {HTMLElement} [element] Pre-created {@link Button#element element}.
 * @property {HTMLElement} [buttonElement] Pre-created {@link Button#buttonElement button element}
 *   (can be provided instead of config).
 * @property {HTMLElement} [labelElement] Pre-created {@link Button#labelElement label element}.
 * @property {HTMLElement} [iconElement] Pre-created {@link Button#iconElement icon element}.
 * @property {string} [tagName='a'] Tag name of the button element.
 * @property {string[]} [classes=[]] List of classes to add to the main element.
 * @property {string[]} [buttonClasses=[]] List of classes to add to the button element.
 * @property {string} [id] ID attribute of the button.
 * @property {string} [href] Value of the `href` parameter to add to the button element.
 * @property {string} [label] Label of the button.
 * @property {string} [tooltip] Tooltip for the button.
 * @property {string[]} [flags] Flags to apply to an OOUI button.
 * @property {Action} [action] Function to execute on click or Enter press.
 */

/**
 * Class representing a generic button.
 */
class Button {
  /**
   * @type {((event: MouseEvent | KeyboardEvent) => void) | undefined}
   * @private
   */
  callback;

  /**
   * Create a button.
   *
   * @param {ButtonConfig} [config]
   */
  constructor({
    element,
    buttonElement,
    labelElement,
    iconElement,
    tagName = 'a',
    classes = [],
    buttonClasses = [],
    id,
    href,
    label,
    tooltip,
    flags,
    action,
  } = {}) {
    if (!buttonElement) {
      buttonElement = Button.cloneButtonPrototype(tagName);
      element?.append(buttonElement);
    }

    /**
     * Main element. It can be the same as the {@link Button#button button element} or a wrapper
     * around it.
     *
     * @type {HTMLElement}
     */
    this.element = element || buttonElement;

    if (id) {
      this.element.id = id;
    }
    if (classes.length) {
      this.element.classList.add(...classes);
    }


    /**
     * Button element (an `'a'` element by default). It can be the same as the
     * {@link Button#element main element} or its descendant.
     *
     * @type {HTMLElement}
     */
    this.buttonElement = buttonElement;

    if (buttonClasses.length) {
      this.buttonElement.classList.add(...buttonClasses);
    }

    /**
     * Button label element. It can be the same as the {@link Button#buttonElement button element}
     * or its descendant.
     *
     * May be removed if it's not used.
     *
     * @type {HTMLElement}
     */
    this.labelElement = labelElement || buttonElement;

    /**
     * Button icon element, a descendant of the {@link Button#buttonElement button element}.
     *
     * @type {HTMLElement|undefined}
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
    this.buttonElement.ariaDisabled = String(disabled);
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
    if ('href' in this.buttonElement) {
      this.buttonElement.href = href;
    }

    return this;
  }

  /**
   * Set the label of the button.
   *
   * @param {string} label
   * @returns {Button} This button.
   */
  setLabel(label) {
    this.labelElement ||= this.buttonElement;
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
   * Execute a pre-defined action if the button is conditions are met.
   *
   * @param {Action} action
   * @param {MouseEvent | KeyboardEvent} event
   * @protected
   */
  maybeExecuteAction(action, event) {
    if (
      !this.isDisabled() &&
      (
        (!isCmdModifierPressed(event) && !event.shiftKey) ||
        !(this.buttonElement instanceof HTMLAnchorElement && this.buttonElement.href)
      )
    ) {
      event.preventDefault();
      event.stopPropagation();
      action(event, this);
    }
  }

  /**
   * Set the action of the button. It will be executed on click or Enter press.
   *
   * @param {?Action} action
   * @returns {Button} This button.
   */
  setAction(action) {
    if (this.callback) {
      this.buttonElement.removeEventListener('click', this.callback);
      this.buttonElement.removeEventListener('keydown', this.callback);
      this.buttonElement.cdCallback = undefined;
      this.callback = undefined;
    }

    if (action) {
      this.callback = (event) => {
        if (
          !(event instanceof KeyboardEvent)
          || [OO.ui.Keys.ENTER, OO.ui.Keys.SPACE].includes(event.keyCode)
        ) {
          this.maybeExecuteAction(action, event);
        }
      };
      this.buttonElement.addEventListener('click', this.callback);
      this.buttonElement.addEventListener('keydown', this.callback);
      this.buttonElement.cdCallback = this.callback;
    }

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
   * Show or hide the button, depending on the parameter.
   *
   * @param {boolean} show Whether to show the button.
   * @returns {Button} This button.
   */
  toggle(show) {
    if (show) {
      this.show();
    } else {
      this.hide();
    }

    return this;
  }

  /**
   * Check whether the button's element is connected to the document.
   *
   * @returns {boolean}
   */
  isConnected() {
    return Boolean(this.element?.isConnected);
  }

  /**
   * Set the class to an OOUI icon to make it look like icons with the "progressive" flag do. Somehow
   * OOUI doesn't set it at the building stage.
   */
  setIconProgressive() {
    this.iconElement?.classList.add('oo-ui-image-progressive');
  }

  /**
   * @type {{ [name: string]: HTMLElement }}
   */
  static prototypes = {};

  /**
   * Clone a button prototype (a skeleton with few properties set) without recreating it if it already
   * exists. When these buttons are created en masse, this is marginally faster than creating a new
   * one from scratch.
   *
   * @param {string} tagName Tag name.
   * @returns {HTMLElement}
   * @private
   */
  static cloneButtonPrototype(tagName) {
    if (!this.prototypes[tagName]) {
      const prototype = document.createElement(tagName);
      prototype.tabIndex = 0;
      prototype.setAttribute('role', 'button');
      this.prototypes[tagName] = prototype;
    }

    return /** @type {HTMLElement} */ (this.prototypes[tagName].cloneNode(true));
  }
}

export default Button;
