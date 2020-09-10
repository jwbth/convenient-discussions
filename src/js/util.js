/**
 * Utilities module. Utilities that go to the {@link module:cd~convenientDiscussions.util
 * convenientDiscussions.util} object are in {@link module:globalUtil}.
 *
 * @module util
 */

import CdError from './CdError';
import cd from './cd';

let keptScrollPosition = null;

/**
 * Callback for `Array#filter` to remove duplicated elements from an array.
 *
 * @param {*} item
 * @param {number} pos
 * @param {Array} arr
 * @returns {boolean}
 */
export function unique(item, pos, arr) {
  return arr.indexOf(item) === pos;
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
      // Could be issues, probably not very serious, resulting from the difference of PHP's
      // mb_strtoupper and JavaScript's String#toUpperCase, see firstCharToUpperCase() and
      // https://phabricator.wikimedia.org/T141723#2513800.
      firstChar.toUpperCase() !== firstChar.toLowerCase() ?
      '[' + firstChar.toUpperCase() + firstChar.toLowerCase() + ']' :
      mw.util.escapeRegExp(firstChar)
    ) +
    mw.util.escapeRegExp(s.slice(1))
  );
}

/**
 * Check if a page is probably a talk page. The namespace number is required.
 *
 * This function exists mostly because we can't be sure the `mediawiki.Title` module is loaded when
 * the script has started executing (and can't use the {@link module:Page Page} constructor), and we
 * need to make this check fast. So, in most cases, {@link module:Page#isProbablyTalkPage} should be
 * used.
 *
 * @param {string} pageName
 * @param {number} namespaceNumber
 * @returns {boolean}
 */
export function isProbablyTalkPage(pageName, namespaceNumber) {
  return (
    (
      namespaceNumber % 2 === 1 ||
      cd.g.PAGE_WHITELIST_REGEXP?.test(pageName) ||
      (!cd.g.PAGE_WHITELIST_REGEXP && cd.config.customTalkNamespaces?.includes(namespaceNumber))
    ) &&
    !cd.g.PAGE_BLACKLIST_REGEXP?.test(pageName)
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
 * Callback for `Array#filter` to keep only defined values in an array.
 *
 * @param {*} el
 * @returns {boolean}
 */
export function defined(el) {
  return el !== undefined;
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
  // See the parameters with which mw.Api() rejects:
  // https://phabricator.wikimedia.org/source/mediawiki/browse/master/resources/src/mediawiki.api/index.js;fbfa8f1a61c5ffba664e817701439affb4f6a388$245
  throw code === 'http' ?
    new CdError({ type: 'network' }) :
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
 * Replaces sequences of spaces with single spaces.
 *
 * @param {string} s
 * @returns {string}
 */
export function removeDoubleSpaces(s) {
  return s.replace(/ {2,}/g, ' ');
}

/**
 * Attach callback functions to links with the provided class names given HTML code, wrap in a
 * `<span>` element, and return the resultant jQuery object.
 *
 * @param {string|JQuery} html
 * @param {...ClassToCallback[]} classesToCallbacks
 * @returns {JQuery}
 */
export function animateLinks(html, ...classesToCallbacks) {
  const $link = html instanceof $ ? html : cd.util.wrapInElement(html);
  classesToCallbacks.forEach(([className, callback]) => {
    $link.find(`.${className}`).on('click', callback);
  });
  return $link;
}

/**
 * Provide `mw.Title.phpCharToUpper` functionality for the web worker context.
 *
 * @param {string} char
 * @returns {string}
 */
function phpCharToUpper(char) {
  if (cd.g.PHP_CHAR_TO_UPPER_JSON[char] === '') {
    return char;
  }
  return cd.g.PHP_CHAR_TO_UPPER_JSON[char] || char.toUpperCase();
}

/**
 * Transform the first letter of a string to upper case, for example: `'wikilink'` → `'Wikilink'`.
 * Do it in PHP, not JavaScript, fashion to match the MediaWiki behavior, see {@link
 * https://phabricator.wikimedia.org/T141723#2513800}.
 *
 * @param {string} s
 * @returns {string}
 */
export function firstCharToUpperCase(s) {
  return s.length ? phpCharToUpper(s[0]) + s.slice(1) : '';
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
 * Turn many regexps into one, putting it in `()` and separating individual expressions by `|`.
 *
 * @param {RegExp[]|string[]} arr
 * @returns {?RegExp}
 */
export function mergeRegexps(arr) {
  if (!arr) {
    return null;
  }
  const pattern = arr
    .map((regexpOrString) => regexpOrString.source || regexpOrString)
    .join('|');
  return pattern ? new RegExp(`(${pattern})`) : null;
}

/**
 * Replace text matched by a regexp with placeholders.
 *
 * @param {string} text
 * @param {RegExp} regexp
 * @param {string[]} hidden
 * @param {boolean} useAlternativeMarker
 * @returns {string}
 */
export function hideText(text, regexp, hidden, useAlternativeMarker) {
  return text.replace(regexp, (s, pre, textToHide) => {
    // If there is no groups, the offset is the second argument.
    if (typeof pre === 'number') {
      pre = '';
      textToHide = '';
    }
    // Handle tables separately
    return (
      (pre || '') +
      (useAlternativeMarker ? '\x03' : '\x01') +
      hidden.push(textToHide || s) +
      (useAlternativeMarker ? '\x04' : '\x02')
    );
  });
}

/**
 * Replace placeholders created by {@link module:util.hide}.
 *
 * @param {string} text
 * @param {string[]} hidden
 * @returns {string}
 */
export function unhideText(text, hidden) {
  while (text.match(/(?:\x01|\x03)\d+(?:\x02|\x04)/)) {
    text = text.replace(/(?:\x01|\x03)(\d+)(?:\x02|\x04)/g, (s, num) => hidden[num - 1]);
  }

  return text;
}

/**
 * Save the scroll position to restore it later with {@link module:util.restoreScrollPosition}.
 */
export function saveScrollPosition() {
  keptScrollPosition = window.pageYOffset;
}

/**
 * Restore the scroll position saved in {@link module:util.saveScrollPosition}.
 */
export function restoreScrollPosition() {
  if (keptScrollPosition === null) return;
  window.scrollTo(0, keptScrollPosition);
  keptScrollPosition = null;
}

/**
 * Use a {@link
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/race
 * Promise.race()} workaround to get the state of a native promise. Note that it works _only_ with
 * native promises: it doesn't work with jQuery promises (for example, ones that `mw.Api()` return).
 *
 * @param {Promise} promise
 * @returns {string}
 */
export async function nativePromiseState(promise) {
  const obj = {};
  return Promise.race([promise, obj])
    .then((value) => value === obj ? 'pending' : 'resolved', () => 'rejected');
}

/**
 * Show a notification suggesting to reload the page if the specified module is in the "loading"
 * state. Also return `true` in such a case.
 *
 * For the details of the bug, see https://phabricator.wikimedia.org/T68598 "mw.loader state of
 * module stuck at "loading" if request was aborted".
 *
 * @param {string} moduleName
 * @returns {boolean}
 */
export function dealWithLoadingBug(moduleName) {
  if (mw.loader.getState(moduleName) === 'loading') {
    const $body = animateLinks(cd.s('error-needreloadpage'), [
      'cd-notification-reloadPage',
      () => {
        location.reload();
      },
    ]);
    mw.notify($body, { type: 'error' });
    return true;
  }
  return false;
}

/**
 * Get the top and bottom positions of the bounding client rectangle of an element including margins
 * set with the `cdMarginTop` and `cdMarginBottom` properties.
 *
 * @param {Element} el
 * @returns {object}
 */
export function getTopAndBottomIncludingMargins(el) {
  const nativeRect = el.getBoundingClientRect();
  return {
    top: nativeRect.top - el.cdMarginTop,
    bottom: nativeRect.bottom + el.cdMarginBottom,
  };
}

/**
 * Whether two objects are the same by value. Doesn't handle complex cases.
 *
 * @param {object} object1
 * @param {object} object2
 * @returns {boolean}
 */
export function areObjectsEqual(object1, object2) {
  const isMultipartObject = (val) => (
    val !== null &&
    typeof val === 'object' &&
    !(
      val instanceof RegExp ||
      val instanceof Date ||
      val instanceof Node ||
      val instanceof Worker
    )
  );
  const toPrimitiveValue = (val) => (
    val instanceof RegExp || val instanceof Date ?
    val.toString() :
    val
  );

  if (!isMultipartObject(object1) || !isMultipartObject(object2)) {
    return toPrimitiveValue(object1) === toPrimitiveValue(object2);
  }

  const keys1 = Object.keys(object1);
  const keys2 = Object.keys(object2);

  return (
    keys1.length === keys2.length &&
    keys1.every((key) => areObjectsEqual(object1[key], object2[key]))
  );
}

/**
 * Helper to get a local storage item packed in JSON or an empty object in case or unexistent/falsy
 * falues. Returns `null` in case of a corrupt value.
 *
 * @param {string} name
 * @returns {?object}
 */
export function getFromLocalStorage(name) {
  const json = localStorage.getItem(name);
  let obj;
  if (json) {
    try {
      // "||" in case of a falsy value.
      obj = JSON.parse(json) || {};
    } catch (e) {
      console.error(e);
      return null;
    }
  }
  return obj || {};
}

/**
 * Helper to set a local storage item.
 *
 * @param {string} name
 * @param {object} obj
 */
export function saveToLocalStorage(name, obj) {
  localStorage.setItem(name, JSON.stringify(obj));
}

/**
 * Remove left-to-right and right-to-left marks that sometimes are copied from the edit history to
 * the timestamp (for example, https://meta.wikimedia.org/w/index.php?diff=20418518) and also appear
 * after →/← in edit summaries.
 *
 * @param {string} text
 * @returns {string}
 */
export function removeDirMarks(text) {
  return text.replace(/[\u200E\u200F]/g, '');
}
