import { tweakUserOoUiClass } from './ooui';

/**
 * Our mixin that extends the {@link external:OO.ui.ProcessDialog} class
 *
 * Class that extends {@link external:OO.ui.TextInputWidget OO.ui.TextInputWidget} and has some
 * features we need.
 * * It emits `manualChange` event when the input changes by user action.
 * * It provides the `cdInsertContent` method that inserts text while keeping the undo/redo
 *   functionality.
 * * It provides the `cdFocus` method that gets around the Firefox 56 and probably some other
 *   browsers bug where the caret doesn't appear in the input after focusing.
 *
 * @augments external:OO.ui.TextInputWidget
 */
export default class TextInputWidget extends OO.ui.TextInputWidget {
  /**
   * Create an instance.
   *
   * @param  {...any} args
   * @fires manualChange The input changed by user action.
   */
  constructor(...args) {
    super(...args);

    this.$input.on('input', () => {
      this.emit('manualChange', this.getValue());
    });
  }

  /**
   * Insert text while keeping the undo/redo functionality.
   *
   * @param {string} text
   */
  cdInsertContent(text) {
    this.cdFocus();
    if (!document.execCommand('insertText', false, text)) {
      this.insertContent(text);
    }
  }

  /**
   * Get around the Firefox 56 and probably some other browsers bug where the caret doesn't appear
   * in the input after focusing.
   */
  cdFocus() {
    this.$input[0].focus();
  }
}

tweakUserOoUiClass(TextInputWidget);
