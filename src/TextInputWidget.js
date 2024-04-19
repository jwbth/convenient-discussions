import { convertHtmlToWikitext } from './utils-api';
import { tweakUserOoUiClass } from './utils-oojs';
import { getElementFromPasteHtml, cleanUpPasteDom, isElementConvertibleToWikitext } from './utils-window';

/**
 * An input was changed manually.
 *
 * @param {*} value Value of the input.
 */

/**
 * Class that extends {@link external:OO.ui.TextInputWidget OO.ui.TextInputWidget} and has some
 * features we need.
 *
 * @augments external:OO.ui.TextInputWidget
 */
class TextInputWidget extends OO.ui.TextInputWidget {
  /**
   * Create a text input widget.
   *
   * @param  {...any} args
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
   * @returns {TextInputWidget}
   */
  cdInsertContent(text) {
    this.cdFocus();
    if (!document.execCommand('insertText', false, text)) {
      this.insertContent(text);
    }

    return this;
  }

  /**
   * Get around the bug of Firefox 56 and probably some other browsers where the caret doesn't
   * appear in the input after focusing.
   *
   * @returns {TextInputWidget}
   */
  cdFocus() {
    this.$input[0].focus();

    return this;
  }

  /**
   * Given a selection, get its content as wikitext.
   *
   * @returns {Promise.<string>}
   */
  getWikitextFromSelection() {
    const div = document.createElement('div');
    div.appendChild(window.getSelection().getRangeAt(0).cloneContents());
    return this.maybeConvertElementToWikitext(cleanUpPasteDom(div, this.$element[0]));
  }

  /**
   * Convert HTML code of a paste into wikitext.
   *
   * @param {string} html Pasted HTML.
   * @returns {string}
   */
  getWikitextFromPaste(html) {
    return this.maybeConvertElementToWikitext(
      cleanUpPasteDom(getElementFromPasteHtml(html), this.$element[0])
    );
  }

  /**
   * Given the return value of {@link module:utilsWindow.cleanUpPasteDom}, convert the HTML to
   * wikitext if necessary.
   *
   * @param {object} data Return value of {@link module:utilsWindow.cleanUpPasteDom}.
   * @returns {string}
   */
  async maybeConvertElementToWikitext({ element, text, syntaxHighlightLanguages }) {
    if (!isElementConvertibleToWikitext(element)) {
      return text;
    }

    this.pushPending().setDisabled(true);
    const wikitext = await convertHtmlToWikitext(element.innerHTML, syntaxHighlightLanguages);
    this.popPending().setDisabled(false);

    return wikitext;
  }
}

tweakUserOoUiClass(TextInputWidget);

export default TextInputWidget;
