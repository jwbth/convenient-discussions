/**
 * Utilities that go to the {@link module:cd~convenientDiscussions.util convenientDiscussions.util}
 * object. Some such utilities are defined in other modules (for example, {@link
 * module:cd~convenientDiscussions.util.parseCommentAnchor cd.util.parseCommentAnchor()}).
 *
 * @module globalUtil
 */

import cd from './cd';
import { isPageLoading } from './boot';

/**
 * Properties of the `convenientDiscussions.util` object. Some of them are declared in {@link
 * module:globalUtil}.
 *
 * @namespace util
 * @memberof module:cd~convenientDiscussions
 */

export default {
  /**
   * @typedef {object} Callbacks
   * @property {Function} *
   * @memberof module:cd~convenientDiscussions.util
   */

  /**
   * Generate a `<span>` (or other element) suitable as an argument for various methods for
   * displaying HTML. Optionally, attach callback functions and `target="_blank"` attribute to links
   * with the provided class names.
   *
   * @param {string|JQuery} htmlOrJquery
   * @param {object} [options={}]
   * @param {Callbacks} [options.callbacks]
   * @param {string} [options.tagName='span']
   * @param {boolean} [options.targetBlank]
   * @returns {JQuery}
   * @memberof module:cd~convenientDiscussions.util
   */
  wrap(htmlOrJquery, options = {}) {
    const $wrapper = $(htmlOrJquery instanceof $ ? htmlOrJquery : $.parseHTML(htmlOrJquery))
      .wrapAll(`<${options.tagName || 'span'}>`)
      .parent();
    if (options) {
      if (options.callbacks) {
        Object.keys(options.callbacks).forEach((className) => {
          const $linkWrapper = $wrapper.find(`.${className}`);
          if (!$linkWrapper.find('a').length) {
            $linkWrapper.wrapInner('<a>');
          }
          $linkWrapper.find('a').on('click', options.callbacks[className]);
        });
      }
      if (options.targetBlank) {
        $wrapper.find('a[href]').attr('target', '_blank');
      }
    }
    return $wrapper;
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

  /**
   * Is there any kind of a page overlay present, like OOUI modal overlay or CD loading overlay.
   * This runs very frequently, so we use the fastest way.
   *
   * @returns {boolean}
   * @memberof module:cd~convenientDiscussions.util
   */
  isPageOverlayOn() {
    return document.body.classList.contains('oo-ui-windowManager-modal-active') || isPageLoading();
  },

  /**
   * Wrap the response to the "compare" API request in a table.
   *
   * @param {string} body
   * @returns {string}
   * @memberof module:cd~convenientDiscussions.util
   */
  wrapDiffBody(body) {
    return (
      '<table class="diff">' +
      '<col class="diff-marker"><col class="diff-content">' +
      '<col class="diff-marker"><col class="diff-content">' +
      body +
      '</table>'
    );
  }
};
