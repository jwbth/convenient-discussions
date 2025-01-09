import Button from './Button';

/**
 * @typedef {object} ButtonExtension
 * @property {() => OO.ui.ButtonWidget} [widgetConstructor] Function that creates an OOUI widget
 *   that is the original source of this button (for OOUI buttons). It is run when we need to
 *   "hydrate" the button that is originally created by cloning a prototype, bringing some original
 *   behaviors to it.
 */

/**
 * @typedef {import('./Button').ButtonConfig & ButtonExtension} CommentButtonConfig
 */

/**
 * Class representing a comment button, be it a simple link or an OOUI button depending on user
 * settings.
 *
 * @augments Button
 */
class CommentButton extends Button {
  /**
   * Function executed by clicking or pressing Enter on the button.
   *
   * @type {?import('./Button').Action}
   * @private
   */
  action;

  /**
   * Create a comment button.
   *
   * @param {CommentButtonConfig} config Button config, see the details at {@link Button}.
   */
  constructor(config) {
    // OOUI button
    if (config.element) {
      config.buttonElement = /** @type {HTMLElement} */ (config.element.firstChild);
    }

    super(config);

    // Don't hide the menu on right button click.
    if (config.href) {
      this.buttonElement.oncontextmenu = CommentButton.stopPropagation;
    }

    this.element.classList.add('cd-comment-button');

    /**
     * Constructor for the button's OOUI widget (if that's an OOUI button).
     *
     * @type {(() => OO.ui.ButtonWidget) | undefined}
     */
    this.widgetConstructor = config.widgetConstructor;
  }

  /**
   * Create an OOUI widget (for an OOUI button) using {@link CommentButton#widgetConstructor}.
   *
   * @returns {OO.ui.ButtonWidget}
   * @private
   */
  createWidget() {
    const originalHref = this.buttonElement.getAttribute('href');

    /**
     * Button's OOUI widget object. Initially OOUI buttons don't have widgets created for them for
     * performance reasons (every other button is just cloned as an element). When their state is
     * changed anyhow, the widget is created.
     *
     * @type {OO.ui.ButtonWidget}
     */
    this.buttonWidget = this.widgetConstructor();

    const element = this.buttonWidget.$element[0];
    this.element.replaceWith(element);
    this.element = element;
    this.buttonElement = /** @type {HTMLElement} */ (element.firstChild);
    if (this.action) {
      this.setAction(this.action);
    }
    if (originalHref) {
      this.buttonWidget.setHref(originalHref);

      // Don't hide the menu on right button click.
      this.buttonElement.oncontextmenu = CommentButton.stopPropagation;
    }

    return this.buttonWidget;
  }

  /**
   * Set the button disabled or not.
   *
   * @param {boolean} disabled
   * @returns {CommentButton} This button.
   */
  setDisabled(disabled) {
    disabled = Boolean(disabled);
    if (!this.widgetConstructor) {
      super.setDisabled(disabled);
    } else {
      this.getButtonWidget().setDisabled(disabled);
    }

    return this;
  }

  /**
   * Get the widget for the OOUI button, creating it if it doesn't exist.
   *
   * @returns {OO.ui.ButtonWidget}
   */
  getButtonWidget() {
    return this.buttonWidget || this.createWidget();
  }

  /**
   * Set the button pending or not.
   *
   * @param {boolean} pending
   * @returns {CommentButton} This button.
   */
  setPending(pending) {
    super.setPending(pending);

    return this;
  }

  /**
   * Set the label of the button.
   *
   * @param {string} label
   * @returns {CommentButton} This button.
   */
  setLabel(label) {
    if (!this.widgetConstructor) {
      super.setLabel(label);
    } else {
      this.getButtonWidget().setLabel(label);
    }

    return this;
  }

  /**
   * Set the tooltip of the button.
   *
   * @param {string} tooltip
   * @returns {CommentButton} This button.
   */
  setTooltip(tooltip) {
    if (!this.widgetConstructor) {
      super.setTooltip(tooltip);
    } else {
      this.getButtonWidget().setTitle(tooltip);
    }

    return this;
  }

  /**
   * Set the action of the button. It will be executed on click or Enter press.
   *
   * @param {?import('./Button').Action} action
   * @returns {Button} This button.
   */
  setAction(action) {
    // OOUI widgets don't pass the event object to the handler, so we use the traditional method of
    // handling events.
    super.setAction(action);
    this.action = action;

    return this;
  }

  /**
   * Check whether the button is disabled.
   *
   * @returns {boolean}
   */
  isDisabled() {
    return this.widgetConstructor ? Boolean(this.buttonWidget?.isDisabled()) : super.isDisabled();
  }

  /**
   * Stop propagation of an event.
   *
   * @param {Event} event
   * @private
   */
  static stopPropagation(event) {
    event.stopPropagation();
  }
}

export default CommentButton;
