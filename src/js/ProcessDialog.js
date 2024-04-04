import CdError from './CdError';
import cd from './cd';
import controller from './controller';
import { tweakUserOoUiClass } from './utils-ooui';

/**
 * Our class that extends {@link external:OO.ui.ProcessDialog}, adding a couple of methods to it.
 *
 * @augments external:OO.ui.ProcessDialog
 */
class ProcessDialog extends OO.ui.ProcessDialog {
  /**
   * Check if there are unsaved changes.
   *
   * @returns {boolean}
   * @private
   */
  isUnsaved() {
    const saveButton = this.actions.get({ actions: 'save' })[0];
    return saveButton?.isVisible() && !saveButton.isDisabled();
  }

  /**
   * Confirm closing a dialog.
   */
  confirmClose() {
    if (!this.isUnsaved(this) || confirm(cd.s(`${this.constructor.cdKey}-close-confirm`))) {
      this.close({ action: 'close' });
      controller.removePreventUnloadCondition('dialog');
    }
  }

  /**
   * Handle a error, displaying a message with the provided name and popping the pending state. If
   * the error is not recoverable, the dialog is closed at "Dismiss".
   *
   * @param {CdError|Error} e
   * @param {string} messageName
   * @param {boolean} recoverable
   */
  handleError(e, messageName, recoverable) {
    let error;
    if (e instanceof CdError) {
      const { type } = e.data;
      let message = cd.s(messageName);
      if (type === 'network') {
        message += ' ' + cd.s('error-network');
      }
      error = new OO.ui.Error(message, { recoverable });
    } else {
      error = new OO.ui.Error(cd.s('error-javascript'), { recoverable: false });
    }

    this.showErrors(error);
    console.warn(e);
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

tweakUserOoUiClass(ProcessDialog);

export default ProcessDialog;
