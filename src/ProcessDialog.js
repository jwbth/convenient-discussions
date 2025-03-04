import CdError from './CdError';
import bootController from './bootController';
import cd from './cd';
import { es6ClassToOoJsClass } from './utils-oojs';

/**
 * Our class that extends {@link OO.ui.ProcessDialog OO.ui.ProcessDialog}, adding a couple
 * of methods to it.
 *
 * @augments OO.ui.ProcessDialog
 */
class ProcessDialog extends OO.ui.ProcessDialog {
  /**
   * @type {string}
   * @abstract
   */
  static cdKey;

  /**
   * Create a process dialog.
   *
   * @param {OO.ui.ProcessDialog.ConfigOptions} [config]
   */
  constructor(config) {
    super(config);

    // Workaround to make this.constructor in methods to be type checked correctly
    this.constructor = ProcessDialog;
  }

  /**
   * Check if there are unsaved changes.
   *
   * @returns {boolean}
   */
  isUnsaved() {
    const saveButton = this.actions.get({ actions: 'save' })[0];
    return saveButton?.isVisible() && !saveButton.isDisabled();
  }

  /**
   * Confirm closing the dialog.
   */
  confirmClose() {
    if (!this.isUnsaved() || confirm(cd.s(`${this.constructor.cdKey}-close-confirm`))) {
      this.close({ action: 'close' });
      bootController.removePreventUnloadCondition('dialog');
    }
  }

  /**
   * Handle a error, displaying a message with the provided name and popping the pending state. If
   * the error is not recoverable, the dialog is closed on "Dismiss".
   *
   * @param {CdError|Error} error
   * @param {string} [messageName]
   * @param {boolean} [recoverable]
   * @protected
   */
  handleError(error, messageName, recoverable) {
    let errorInstance;
    if (error instanceof CdError) {
      const { type } = error.data;
      let message = cd.s(/** @type {string} */ (messageName));
      if (type === 'network') {
        message += ' ' + cd.s('error-network');
      }
      errorInstance = new OO.ui.Error(message, { recoverable });
    } else {
      errorInstance = new OO.ui.Error(cd.s('error-javascript'), { recoverable: false });
    }

    this.showErrors(errorInstance);
    console.warn(error);
    this.$errors
      .find('.oo-ui-buttonElement:not(.oo-ui-flaggedElement-primary) > .oo-ui-buttonElement-button')
      .on('click', () => {
        if (recoverable) {
          this.updateSize();
        } else {
          this.close();
        }
      });

    this.actions.setAbilities({ close: true });

    this.updateSize();
    this.popPending();
  }
}

es6ClassToOoJsClass(ProcessDialog);

export default ProcessDialog;
