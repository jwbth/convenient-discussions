import Button from './Button';

/**
 * @typedef {object} CommentButtonConfig
 * @augments import('./Button').ButtonConfig
 * @property {Function} [config.widgetConstructor] Function that creates an OOUI widget that is the
 *   original source of this button (for OOUI buttons). It is run when we need to "hydrate" the
 *   button that is originally created by cloning a prototype, bringing some original behaviors to
 *   it.
 */

/**
 * Class representing a comment button, be it a simple link or an OOUI button depending on user
 * settings.
 *
 * @augments Button
 */
class CommentButton extends Button {
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

    if (config.element) {
      // Not used
      delete this.labelElement;
    }

    this.element.classList.add('cd-comment-button');

    /**
     * Constructor for the button's OOUI widget (if that's an OOUI button).
     *
     * @type {Function}
     */
    this.widgetConstructor = config.widgetConstructor;
  }

  /**
   * Create an OOUI widget (for an OOUI button) using {@link CommentButton#widgetConstructor}.
   *
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
    this.element.parentNode.replaceChild(element, this.element);
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
      if (!this.buttonWidget) {
        this.createWidget();
      }
      this.buttonWidget.setDisabled(disabled);
    }

    return this;
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
      if (!this.buttonWidget) {
        this.createWidget();
      }
      this.buttonWidget.setLabel(label);
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
      if (!this.buttonWidget) {
        this.createWidget();
      }
      this.buttonWidget.setTitle(tooltip);
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

    /**
     * Function executed by clicking or pressing Enter on the button.
     *
     * @type {import('./Button').Action}
     * @private
     */
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
