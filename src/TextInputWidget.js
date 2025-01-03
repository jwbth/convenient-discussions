import { convertHtmlToWikitext } from './utils-api';
import { tweakUserOoUiClass } from './utils-oojs';
import { getElementFromPasteHtml, cleanUpPasteDom, isElementConvertibleToWikitext } from './utils-window';

/**
 * An input was changed manually.
 *
 * @param {*} value Value of the input.
 */

/**
 * Class that extends {@link OO.ui.TextInputWidget OO.ui.TextInputWidget} and adds some
 * features we need.
 *
 * @augments OO.ui.TextInputWidget
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
    this.focus();
    if (!document.execCommand('insertText', false, text)) {
      this.insertContent(text);
    }

    return this;
  }

  /**
   * Given a selection, get its content as wikitext.
   *
   * @returns {Promise<string>}
   */
  async getWikitextFromSelection() {
    const div = document.createElement('div');
    const selection = window.getSelection();
    if (selection.type === 'Range') {
      div.appendChild(window.getSelection().getRangeAt(0).cloneContents());

      return await this.maybeConvertElementToWikitext(cleanUpPasteDom(div, this.$element[0]));
    }

    return '';
  }

  /**
   * Convert HTML code of a paste into wikitext.
   *
   * @param {string} html Pasted HTML.
   * @returns {Promise<string>}
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
   * @param {Element} data.element
   * @param {string} data.text
   * @param {Array.<string|undefined>} data.syntaxHighlightLanguages
   * @returns {Promise<string>}
   */
  async maybeConvertElementToWikitext({ element, text, syntaxHighlightLanguages }) {
    if (!isElementConvertibleToWikitext(element)) {
      return text;
    }

    this.pushPending().setDisabled(true);
    const wikitext = await convertHtmlToWikitext(element.innerHTML, syntaxHighlightLanguages);
    this.popPending().setDisabled(false);

    return wikitext ?? text;
  }
}

tweakUserOoUiClass(TextInputWidget);

export default TextInputWidget;
