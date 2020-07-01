/**
 * Utilities module. Utilities that go to the {@link module:cd~convenientDiscussions.util
 * convenientDiscussions.util} object are in {@link module:globalUtil}.
 *
 * @module util
 */

import CdError from './CdError';
import cd from './cd';

/**
 * Removes duplicated elements from an array.
 *
 * @param {Array} arr
 * @returns {?Array}
 */
export function removeDuplicates(arr) {
  if (!arr || typeof arr !== 'object') {
    return null;
  }
  return arr.filter((value, i) => arr.indexOf(value) === i);
}

/**
 * Generates a transparent color for the given color to use it in a gradient.
 *
 * @param {string} color
 * @returns {string}
 */
export function transparentize(color) {
  const dummyElement = document.createElement('span');
  dummyElement.style.color = color;
  color = dummyElement.style.color;
  return color.includes('rgba') ?
    color.replace(/\d+(?=\))/, '0') :
    color
      .replace(/rgb/, 'rgba')
      .replace(/\)/, ', 0)');
}

/**
 * Check if a node is an element with `display: inline` in the default browser styles. As an option,
 * it can also treat text nodes as inline elements.
 *
 * @param {Node} node
 * @param {boolean} countTextNodesAsInline
 * @returns {?boolean}
 */
export function isInline(node, countTextNodesAsInline) {
  if (countTextNodesAsInline && node.nodeType === Node.TEXT_NODE) {
    return true;
  }

  // Precaution
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  if (cd.g.POPULAR_INLINE_ELEMENTS.includes(node.tagName)) {
    return true;
  } else if (cd.g.POPULAR_NOT_INLINE_ELEMENTS.includes(node.tagName)) {
    return false;
  } else {
    // This can be called from a worker.
    if (typeof window !== 'undefined') {
      console.warn('Expensive operation: isInline() called for:', node);

      // This is very expensive. Avoid by any means.
      return window.getComputedStyle(node).display === 'inline';
    } else {
      return null;
    }
  }
}

/**
 * Generate a pattern for use in a regular expression from a string that is case-insensitive for the
 * first character only.
 *
 * @param {string} s
 * @returns {string}
 */
export function caseInsensitiveFirstCharPattern(s) {
  const firstChar = s[0];
  return (
    (
      firstChar.toUpperCase() !== firstChar.toLowerCase() ?
      '[' + firstChar.toUpperCase() + firstChar.toLowerCase() + ']' :
      mw.util.escapeRegExp(firstChar)
    ) +
    mw.util.escapeRegExp(s.slice(1))
  );
}

/**
 * Check if the provided namespace is a talk namespace (an odd one or other specified in {@link
 * module:defaultConfig.customTalkNamespaces}).
 *
 * @param {number} namespaceNumber
 * @returns {boolean}
 */
export function isTalkNamespace(namespaceNumber) {
  return namespaceNumber % 2 === 1 || cd.config.customTalkNamespaces.includes(namespaceNumber);
}

/**
 * Check if the provided page is probably a talk page.
 *
 * If no namespace number is provided, the function will reconstruct it.
 *
 * @param {string} page
 * @param {number} [namespaceNumber]
 * @returns {boolean}
 */
export function isProbablyTalkPage(page, namespaceNumber) {
  if (namespaceNumber === undefined) {
    const title = new mw.Title.newFromText(page);
    namespaceNumber = title.namespace;
  }
  return (
    (
      isTalkNamespace(namespaceNumber) ||
      (cd.g.PAGE_WHITE_LIST_REGEXP && cd.g.PAGE_WHITE_LIST_REGEXP.test(page))
    ) &&
    (!cd.g.PAGE_BLACK_LIST_REGEXP || !cd.g.PAGE_BLACK_LIST_REGEXP.test(page))
  );
}

/**
 * Check by an edit summary if an edit is probably an edit of a comment.
 *
 * @param {string} summary
 * @returns {boolean}
 */
export function isCommentEdit(summary) {
  return (
    summary &&
    (
      summary.includes(`${cd.s('es-edit')} ${cd.s('es-reply-genitive')}`) ||
      summary.includes(`${cd.s('es-edit')} ${cd.s('es-addition-genitive')}`)
    )
  );
}

/**
 * Check by an edit summary if an edit is probably an undo.
 *
 * @param {string} summary
 * @returns {boolean}
 */
export function isUndo(summary) {
  return summary && cd.config.undoTexts.some((text) => summary.includes(text));
}

/**
 * Callback for `Array#filter` functions used with `Array#map`.
 *
 * @param {*} el
 * @returns {boolean}
 */
export function defined(el) {
  return el !== undefined;
}

/**
 * Callback for `Array#filter` functions used with `Array#map`.
 *
 * @param {*} el
 * @returns {boolean}
 */
export function notNull(el) {
  return el !== undefined && el !== null;
}

/**
 * Return an array with a changed start index (`[0, 1, 2, 3]` can be transformed into `[2, 3, 0,
 * 1]`) and optionally reversed while keeping the start index (`[0, 1, 2, 3]` can be transformed
 * into `[2, 1, 0, 3]`).
 *
 * @param {Array} arr
 * @param {number} startIndex
 * @param {boolean} [reverse=false]
 * @returns {Array}
 */
export function reorderArray(arr, startIndex, reverse = false) {
  return reverse ?
    arr
      .slice(startIndex + 1)
      .concat(arr.slice(0, startIndex + 1))
      .reverse() :
    arr
      .slice(startIndex)
      .concat(arr.slice(0, startIndex))
}

/**
 * Alternative to `Array#flat(1)`. That method is not yet supported by major browsers.
 *
 * @param {Array} arr
 * @returns {Array}
 */
export function flat(arr) {
  return [].concat(...arr);
}

/**
 * Callback used in the `.catch()` parts of `mw.Api` requests.
 *
 * @param {string} code
 * @param {object} data
 * @throws {CdError}
 */
export function handleApiReject(code, data) {
  throw code === 'http' ?
    new CdError({
      type: 'network',
    }) :
    new CdError({
      type: 'api',
      code: 'error',
      apiData: data,
    });
}

/**
 * Transforms underlines to spaces in a string.
 *
 * @param {string} s
 * @returns {string}
 */
export function underlinesToSpaces(s) {
  return s.replace(/_/g, ' ');
}

/**
 * Transforms spaces to underlines in a string.
 *
 * @param {string} s
 * @returns {string}
 */
export function spacesToUnderlines(s) {
  return s.replace(/ /g, '_');
}

/**
 * Attach callback functions to links with the provided class names given HTML code, wrap in a
 * `<span>` element, and return the resultant jQuery object.
 *
 * @param {string|JQuery} html
 * @param {...Array.<string, Function>} classToCallback
 * @returns {JQuery}
 */
export function animateLinks(html, ...classToCallback) {
  const $link = html instanceof $ ? html : cd.util.wrapInElement(html);
  classToCallback.forEach(([className, callback]) => {
    $link.find(`.${className}`).on('click', callback);
  });
  return $link;
}

/**
 * Transform the first letter of a string to upper case, for example: `'wikilink'` → `'Wikilink'`.
 *
 * @param {string} s
 * @returns {string}
 */
export function firstCharToUpperCase(s) {
  return s.length ? s[0].toUpperCase() + s.slice(1) : '';
}

/**
 * Get text of the localization messages.
 *
 * @param {string[]} messages
 * @returns {string[]}
 */
export function getMessages(messages) {
  return messages.map(mw.msg);
}

/**
 * `Array#findIndex` analog that looks for the _last_ index.
 *
 * @param {Array} arr
 * @param {Function} callback
 * @returns {?number}
 */
export function findLastIndex(arr, callback) {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (callback(arr[i])) {
      return i;
    }
  }
  return null;
}

/**
 * Check if an input or editable element is focused.
 *
 * @returns {boolean}
 */
export function isInputFocused() {
  return $(':focus:input').length || $(':focus').prop('isContentEditable');
}

/**
 * Turn many regexps into one, putting it in `()` and separating individual regexps by `|`.
 *
 * @param {RegExp[]|string[]} arr
 * @returns {?RegExp}
 */
export function mergeRegexps(arr) {
  const pattern = arr
    .map((regexpOrString) => regexpOrString.source || regexpOrString)
    .join('|');
  return pattern ? new RegExp(`(${pattern})`) : null;
}

/**
 * Replace text matched by a regexp with placeholders.
 *
 * @param {string} code
 * @param {RegExp} regexp
 * @param {string[]} hidden
 * @param {boolean} useAlternativeMarker
 * @returns {string}
 */
export function hideText(code, regexp, hidden, useAlternativeMarker) {
  return code.replace(regexp, (s, pre, textToHide) => {
    // If there is no groups, the offset is the second argument.
    if (typeof pre === 'number') {
      pre = '';
      textToHide = '';
    }
    // Handle tables separately
    return (
      (pre || '') + (useAlternativeMarker ? '\x03' : '\x01') + hidden.push(textToHide || s) +
      (useAlternativeMarker ? '\x04' : '\x02')
    );
  });
}

/**
 * Replace placeholders created by {@link module:util.hide}.
 *
 * @param {string} code
 * @param {string[]} hidden
 * @returns {string}
 */
export function unhideText(code, hidden) {
  while (code.match(/(?:\x01|\x03)\d+(?:\x02|\x04)/)) {
    code = code.replace(/(?:\x01|\x03)(\d+)(?:\x02|\x04)/g, (s, num) => hidden[num - 1]);
  }

  return code;
}
