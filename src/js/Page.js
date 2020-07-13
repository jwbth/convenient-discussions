/**
 * Page class.
 *
 * @module Page
 */

import { underlinesToSpaces } from './util';
import { hideHtmlComments } from './wikitext';

/**
 * Class representing a page. It contains a few properties and methods compared to {@link
 * module:Comment Comment} and {@link module:Section Section}.
 *
 * @module Page
 */
export default class Page {
  constructor(name) {
    this.name = underlinesToSpaces(name);
    const title = mw.Title.newFromText(this.name);
    this.namespace = title.namespace;
    this.fragment = title.fragment;
  }

  /**
   * Get a URL of the page with the specified parameters.
   *
   * @param {object} parameters
   * @returns {string}
   */
  getUrl(parameters) {
    return mw.util.getUrl(parameters);
  }

  /**
   * Modify page code string in accordance with an action. The `'addSection'` action is presumed.
   *
   * @param {string} pageCode
   * @param {object} options
   * @param {string} [options.commentForm]
   * @returns {string}
   */
  modifyCode(pageCode, { commentForm }) {
    const { commentCode } = commentForm.commentTextToCode('submit');

    let newPageCode;
    let codeBeforeInsertion;
    if (commentForm.isNewTopicOnTop) {
      const adjustedPageCode = hideHtmlComments(pageCode);
      const firstSectionIndex = adjustedPageCode.search(/^(=+).*?\1/m);
      codeBeforeInsertion = pageCode.slice(0, firstSectionIndex);
      newPageCode = codeBeforeInsertion + commentCode + '\n' + pageCode.slice(firstSectionIndex);
    } else {
      codeBeforeInsertion = (pageCode + '\n').trimStart();
      newPageCode = codeBeforeInsertion + commentCode;
    }

    return { newPageCode, codeBeforeInsertion, commentCode };
  }

  toString() {
    return this.name;
  }
}
