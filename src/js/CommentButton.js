/**
 * Comment button class.
 *
 * @module CommentButton
 */

import Button from './Button';
import cd from './cd';

/**
 * Class representing a comment button, be it a simple link or a OOUI button depending on user
 * settings.
 */
export default class CommentButton extends Button {
  /**
   * Create a comment button.
   *
   * @param {object} config Button config, see details at {@link module:Button}.
   * @param {Function} [config.widgetConstructor] Function that creates a OOUI widget that is the
   *   original source of this button (for OOUI buttons).
   */
  constructor(config) {
    // OOUI button
    if (config.element) {
      config.linkElement = config.element.firstChild;
    }

    super(config);

    if (config.element) {
      // Not used
      delete this.labelElement;
    }

    cd.debug.startTimer('add cd-comment-button');
    this.element.classList.add('cd-comment-button');
    cd.debug.stopTimer('add cd-comment-button');

    /**
     * Constructor for the button's OOUI widget (if that's a OOUI button).
     *
     * @type {Function}
     */
    this.widgetConstructor = config.widgetConstructor;
  }

  /**
   * Create a OOUI widget (for a OOUI button) using {@link module:CommentButton#widgetConstructor}.
   *
   * @private
   */
  createWidget() {
    /**
     * Button's OOUI widget object. Initially OOUI buttons don't have widgets created for them for
     * performance reasons (every other button is just cloned as an element). When their state is
     * changed anyhow, the widget is created.
     *
     * @type {external:OoUiButtonWidget}
     */
    this.buttonWidget = this.widgetConstructor();

    const element = this.buttonWidget.$element.get(0);
    this.element.parentNode.replaceChild(element, this.element);
    this.element = element;
    this.linkElement = element.firstChild;
    if (this.action) {
      this.setAction(this.action);
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
    if (cd.settings.reformatComments) {
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
    if (cd.settings.reformatComments) {
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
    if (cd.settings.reformatComments) {
      super.setTooltip(tooltip);
    } else {
      if (!this.buttonWidget) {
        this.createWidget();
      }
      this.buttonWidget.setTitle(tooltip);
    }

    return this;
  }

  setAction(action) {
    // OOUI widgets don't pass the event object to the handler, so we use the traditional method of
    // handling events.
    super.setAction(action);

    /**
     * Function executed by clicking or pressing Enter on the button.
     *
     * @type {Function}
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
    return cd.settings.reformatComments ?
      super.isDisabled() :
      Boolean(this.buttonWidget?.isDisabled());
  }

  /**
   * Check whether the button is pending.
   *
   * @returns {boolean}
   */
  isPending() {
    return cd.settings.reformatComments ?
      super.isPending() :
      Boolean(this.buttonWidget?.isPending());
  }
}
