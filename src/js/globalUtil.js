/**
 * Utilities that go to the {@link module:cd~convenientDiscussions.util convenientDiscussions.util}
 * object. Some such utilities are defined in other modules (for example, {@link
 * module:cd~convenientDiscussions.util.parseCommentAnchor cd.util.parseCommentAnchor()}).
 *
 * @module globalUtil
 */

import cd from './cd';

/**
 * Properties of the `convenientDiscussions.util` object. Some of them are declared in {@link
 * module:globalUtil}.
 *
 * @namespace util
 * @memberof module:cd~convenientDiscussions
 */

export default {
  /**
   * Generate a `<span>` (or other element) suitable as an argument for `mw.notify()` from HTML
   * code.
   *
   * @param {string} html
   * @param {string} tagName
   * @returns {JQuery}
   * @memberof module:cd~convenientDiscussions.util
   */
  wrapInElement(html, tagName = 'span') {
    return $($.parseHTML(html))
      .wrapAll(`<${tagName}>`)
      .parent();
  },

  /**
   * Combine the section headline, summary text and, optionally, summary postfix to create an edit
   * summary.
   *
   * @param {object} options
   * @param {string} options.text Summary text. Can be clipped if there is not enough space.
   * @param {string} [options.optionalText] Optional text added to the end of the summary if there is
   *   enough space. Ignored if there is not.
   * @param {string} [options.section] Section name.
   * @param {boolean} [options.addPostfix=true] If to add cd.g.SUMMARY_POSTFIX to the summary.
   * @returns {string}
   * @memberof module:cd~convenientDiscussions.util
   */
  buildEditSummary(options) {
    if (options.addPostfix === undefined) {
      options.addPostfix = true;
    }

    let text = (options.section ? `/* ${options.section} */ ` : '') + options.text.trim();

    let wasOptionalTextAdded;
    if (options.optionalText) {
      let projectedText = text + options.optionalText;

      if (cd.config.transformSummary) {
        projectedText = cd.config.transformSummary(projectedText);
      }

      if (projectedText.length <= cd.g.SUMMARY_LENGTH_LIMIT) {
        text = projectedText;
        wasOptionalTextAdded = true;
      }
    }

    if (!wasOptionalTextAdded) {
      if (cd.config.transformSummary) {
        text = cd.config.transformSummary(text);
      }

      if (text.length > cd.g.SUMMARY_LENGTH_LIMIT) {
        text = text.slice(0, cd.g.SUMMARY_LENGTH_LIMIT - 1) + '…';
      }
    }

    if (options.addPostfix) {
      text += cd.g.SUMMARY_POSTFIX;
    }

    return text;
  },
};
