import { convertHtmlToWikitext } from './utils-api';
import { tweakUserOoUiClass } from './utils-ooui';
import { getElementFromPasteHtml, cleanUpPasteDom, isElementConvertibleToWikitext } from './utils-window';

/**
 * Our mixin that extends the {@link external:OO.ui.ProcessDialog} class
 *
 * Class that extends {@link external:OO.ui.TextInputWidget OO.ui.TextInputWidget} and has some
 * features we need.
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
   * Get around the Firefox 56 and probably some other browsers bug where the caret doesn't appear
   * in the input after focusing.
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
   * @param {Element} rootElement
   * @returns {Promise.<string>}
   */
  getWikitextFromSelection(rootElement) {
    const div = document.createElement('div');
    div.appendChild(window.getSelection().getRangeAt(0).cloneContents());
    return this.maybeConvertElementToWikitext(cleanUpPasteDom(div, rootElement));
  }

  /**
   * Convert HTML code of a paste into wikitext.
   *
   * @param {string} html Pasted HTML.
   * @param {Element} rootElement
   * @returns {string}
   */
  getWikitextFromPaste(html, rootElement) {
    return this.maybeConvertElementToWikitext(
      cleanUpPasteDom(getElementFromPasteHtml(html), rootElement)
    );
  }

  /**
   * Given the return value of {@link module:utils-window.processPasteDom}, convert the HTML to
   * wikitext if necessary.
   *
   * @param {object} data Return value of {@link module:utils-window.cleanUpPasteDom}.
   * @returns {string}
   */
  async maybeConvertElementToWikitext({ element, syntaxHighlightLanguages }) {
    if (!isElementConvertibleToWikitext(element)) {
      return element.innerText;
    }

    this.pushPending().setDisabled(true);
    const wikitext = await convertHtmlToWikitext(element.innerHTML, syntaxHighlightLanguages);
    this.popPending().setDisabled(false);

    return wikitext;
  }
}

tweakUserOoUiClass(TextInputWidget);
