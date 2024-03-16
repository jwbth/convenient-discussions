/**
 * Utilities module. Some of the utilities are parts of the
 * {@link convenientDiscussions.api convenientDiscussions.api} object.
 *
 * @module util
 */

import html_entity_decode from 'locutus/php/strings/html_entity_decode';

import Button from './Button';
import CdError from './CdError';
import cd from './cd';

/**
 * @typedef {object} WrapCallbacks
 * @property {Function} *
 */

/**
 * Wrap a HTML string into a `<span>` (or other element) suitable as an argument for various
 * methods. It fills the same role as
 * {@link https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.HtmlSnippet.html OO.ui.HtmlSnippet}, but
 * works not only with OOUI widgets. Optionally, attach callback functions and `target="_blank"`
 * attribute to links with the provided class names. See also {@link external:$.cdMerge}.
 *
 * @param {string} html
 * @param {object} [options={}]
 * @param {WrapCallbacks} [options.callbacks]
 * @param {string} [options.tagName='span']
 * @param {boolean} [options.targetBlank]
 * @returns {external:jQuery}
 */
export function wrapHtml(html, options = {}) {
  const tagName = options.tagName || 'span';
  const $wrapper = $($.parseHTML(html)).wrapAll(`<${tagName}>`).parent();
  if (options.callbacks) {
    Object.keys(options.callbacks).forEach((className) => {
      const $linkWrapper = $wrapper.find(`.${className}`);
      let $link = $linkWrapper.find('a');
      if (/\$\d$/.test($link.attr('href'))) {
        // Dummy links we put into strings for translation so that translators understand this will
        // be a link.
        $link.attr('href', '').removeAttr('title');
      } else if (!$link.length) {
        $link = $linkWrapper.wrapInner('<a>').children().first();
      }
      new Button({
        element: $link.get(0),
        action: options.callbacks[className],
      });
    });
  }
  if (options.targetBlank) {
    $wrapper.find('a[href]').attr('target', '_blank');
  }
  return $wrapper;
}

/**
 * Combine the section headline, summary text, and, optionally, summary postfix to create an edit
 * summary.
 *
 * @param {object} options
 * @param {string} options.text Summary text. Can be clipped if there is not enough space.
 * @param {string} [options.optionalText] Optional text added to the end of the summary if there is
 *   enough space. Ignored if there is not.
 * @param {string} [options.section] Section name.
 * @param {boolean} [options.addPostfix=true] Whether to add `cd.g.summaryPostfix` to the summary.
 * @returns {string}
 */
export function buildEditSummary({ text, optionalText, section, addPostfix = true }) {
  let fullText = (section ? `/* ${section} */ ` : '') + text.trim();

  let wasOptionalTextAdded;
  if (optionalText) {
    let projectedText = fullText + optionalText;

    if (cd.config.transformSummary) {
      projectedText = cd.config.transformSummary(projectedText);
    }

    if (projectedText.length <= cd.g.summaryLengthLimit) {
      fullText = projectedText;
      wasOptionalTextAdded = true;
    }
  }

  if (!wasOptionalTextAdded) {
    if (cd.config.transformSummary) {
      fullText = cd.config.transformSummary(fullText);
    }

    if (fullText.length > cd.g.summaryLengthLimit) {
      fullText = fullText.slice(0, cd.g.summaryLengthLimit - 1) + '…';
    }
  }

  if (addPostfix) {
    fullText += cd.g.summaryPostfix;
  }

  return fullText;
}

/**
 * Wrap the response to the "compare" API request in a table.
 *
 * @param {string} body
 * @returns {string}
 */
export function wrapDiffBody(body) {
  const className = mw.user.options.get('editfont') === 'monospace' ?
    'diff diff-editfont-monospace' :
    'diff';
  return (
    `<table class="${className}">` +
    '<col class="diff-marker"><col class="diff-content">' +
    '<col class="diff-marker"><col class="diff-content">' +
    body +
    '</table>'
  );
}

/**
 * Callback for
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter Array#filter}
 * to remove duplicated elements from an array.
 *
 * @param {*} el
 * @param {number} i
 * @param {Array.<*>} arr
 * @returns {boolean}
 */
export function unique(el, i, arr) {
  return arr.indexOf(el) === i;
}

/**
 * Generate a transparent color for the given color to use it in a gradient.
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
      .replace('rgb', 'rgba')
      .replace(')', ', 0)');
}

/**
 * Check if a node is an element with `display: inline` or `display: inline-block` in the default
 * browser styles. As an option, it can also treat text nodes as inline elements.
 *
 * @param {Node|external:Node} node
 * @param {boolean} [countTextNodesAsInline=false]
 * @returns {?boolean}
 */
export function isInline(node, countTextNodesAsInline = false) {
  if (countTextNodesAsInline && node.nodeType === Node.TEXT_NODE) {
    return true;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  if (
    cd.g.popularInlineElements.includes(node.tagName) ||

    // `<meta property="mw:PageProp/toc">` is currently present in place of the TOC in Vector 2022.
    (node.tagName === 'META' && node.getAttribute('property') === 'mw:PageProp/toc')
  ) {
    return true;
  } else if (cd.g.popularNotInlineElements.includes(node.tagName)) {
    return false;
  } else {
    // This can be called from a worker.
    if (typeof window !== 'undefined') {
      console.warn('Expensive operation: isInline() called for:', node);

      // This is very expensive. Avoid by any means.
      return window.getComputedStyle(node).display.startsWith('inline');
    } else {
      return null;
    }
  }
}

/**
 * Generate a pattern for use in a regular expression for a page name. The generated pattern is
 * case-insensitive for the first character only, and has any number of any type of space (` ` or
 * `_`) in place of spaces. The first character is expected not to be a space.
 *
 * @param {string} string
 * @returns {string}
 */
export function generatePageNamePattern(string) {
  const firstChar = string[0];
  if (!firstChar) {
    return '';
  }

  const firstCharUpperCase = firstChar.toUpperCase();
  const firstCharLowerCase = firstChar.toLowerCase();

  // Could be issues, probably not very serious, resulting from the difference of PHP's
  // mb_strtoupper and JavaScript's String#toUpperCase, see ucFirst() and
  // https://phabricator.wikimedia.org/T141723#2513800.
  const fcPattern = firstCharUpperCase !== firstCharLowerCase ?
    '[' + firstCharUpperCase + firstCharLowerCase + ']' :
    mw.util.escapeRegExp(firstChar);

  return fcPattern + mw.util.escapeRegExp(string.slice(1)).replace(/[ _]+/g, '[ _]+');
}

/**
 * Check if a page is probably a talk page. The namespace number is required.
 *
 * This function exists mostly because we can't be sure the `mediawiki.Title` module has loaded when
 * the script has started executing (and can't use the {@link Page} constructor), and we need to
 * make this check fast. So, in most cases, {@link Page#isProbablyTalkPage} should be used.
 *
 * @param {string} pageName
 * @param {number} namespaceNumber
 * @returns {boolean}
 */
export function isProbablyTalkPage(pageName, namespaceNumber) {
  return (
    (
      namespaceNumber % 2 === 1 ||
      cd.g.pageWhitelistRegexp?.test(pageName) ||
      (!cd.g.pageWhitelistRegexp && cd.config.customTalkNamespaces.includes(namespaceNumber))
    ) &&
    !cd.g.pageBlacklistRegexp?.test(pageName)
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
 * Callback for
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter Array#filter}
 * to keep only defined values in an array.
 *
 * @param {*} el
 * @returns {boolean}
 */
export function defined(el) {
  return el !== undefined;
}

/**
 * Callback for
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter Array#filter}
 * to keep only defined and not `null` values in an array.
 *
 * @param {*} el
 * @returns {boolean}
 */
export function definedAndNotNull(el) {
  return el !== undefined && el !== null;
}

/**
 * Return an array with a changed start index (`[0, 1, 2, 3]` can be transformed into `[2, 3, 0,
 * 1]`) and optionally reversed while keeping the start index (`[0, 1, 2, 3]` can be transformed
 * into `[2, 1, 0, 3]`).
 *
 * @param {Array.<*>} arr
 * @param {number} startIndex
 * @param {boolean} [reverse=false]
 * @returns {Array.<*>}
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
 * Alternative to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/flat Array#flat(1)}.
 * That method is not yet supported by major browsers.
 *
 * @param {Array.<*>} arr
 * @returns {Array.<*>}
 */
export function flat(arr) {
  return [].concat(...arr);
}

/**
 * Transforms underlines to spaces in a string.
 *
 * @param {string} string
 * @returns {string}
 */
export function underlinesToSpaces(string) {
  return string.replace(/_/g, ' ');
}

/**
 * Transforms spaces to underlines in a string.
 *
 * @param {string} string
 * @returns {string}
 */
export function spacesToUnderlines(string) {
  return string.replace(/ /g, '_');
}

/**
 * Replaces sequences of spaces with single spaces.
 *
 * @param {string} string
 * @returns {string}
 */
export function removeDoubleSpaces(string) {
  return string.replace(/ {2,}/g, ' ');
}

/**
 * Like
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/charAt String#charAt},
 * but returns the pair of UTF-16 surrogates for characters outside of BMP.
 *
 * Borrowed from
 * https://phabricator.wikimedia.org/source/mediawiki/browse/master/resources/src/mediawiki.String.js;af9bbfe40f34c187c091230312273808028d990a$61.
 *
 * @param {string} string
 * @param {number} offset
 * @param {boolean} backwards
 * @returns {string}
 * @author Bartosz Dziewoński <matma.rex@gmail.com>
 * @license MIT
 * @private
 */
function charAt(string, offset, backwards) {
  const maybePair = backwards ?
    string.slice(offset - 1, offset + 1) :
    string.slice(offset, offset + 2);
  return /^[\uD800-\uDBFF][\uDC00-\uDFFF]$/.test(maybePair) ? maybePair : string.charAt(offset);
}

/**
 * Provide the
 * {@link https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.Title-method-phpCharToUpper mw.Title.phpCharToUpper}
 * functionality in the web worker context.
 *
 * @param {string} char
 * @returns {string}
 * @private
 */
function phpCharToUpper(char) {
  if (cd.g.phpCharToUpper[char] === 0) {
    return char;
  }
  return cd.g.phpCharToUpper[char] || char.toUpperCase();
}

/**
 * Transform the first letter of a string to upper case, for example: `'wikilink'` → `'Wikilink'`.
 * Do it in PHP, not JavaScript, fashion to match the MediaWiki behavior, see
 * {@link https://phabricator.wikimedia.org/T141723#2513800}.
 *
 * @param {string} string
 * @returns {string}
 */
export function ucFirst(string) {
  let firstChar = charAt(string, 0);
  return phpCharToUpper(firstChar) + string.slice(firstChar.length);
}

/**
 * _For internal use._ Get text of the localization messages for the content language.
 *
 * @param {string[]} messages
 * @returns {string[]}
 */
export function getContentLanguageMessages(messages) {
  return messages.map((name) => cd.g.contentLanguageMessages[name]);
}

/**
 * Check if an input or editable element is focused.
 *
 * @returns {boolean}
 */
export function isInputFocused() {
  const $active = $(document.activeElement);
  return $active.is(':input') || $active.prop('isContentEditable');
}

/**
 * Turn many regexps into one, putting it in `()` and separating individual expressions by `|`.
 *
 * @param {?(RegExp[]|string[])} arr
 * @returns {?RegExp}
 */
export function mergeRegexps(arr) {
  const pattern = (arr || [])
    .map((regexpOrString) => regexpOrString.source || regexpOrString)
    .join('|');
  return pattern ? new RegExp(`(${pattern})`) : null;
}

/**
 * Use a
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/race Promise.race()}
 * workaround to get the state of a native promise. Note that it works _only_ with native promises:
 * it doesn't work with jQuery promises (for example, ones that `new mw.Api()` returns).
 *
 * @param {Promise.<*>} promise
 * @returns {Promise.<string>}
 */
export async function getNativePromiseState(promise) {
  const obj = {};
  return Promise.race([promise, obj])
    .then((value) => value === obj ? 'pending' : 'resolved', () => 'rejected');
}

/**
 * Show a notification suggesting to reload the page if the specified module is in the `loading`
 * state. Also return `true` in such a case.
 *
 * For the details of the bug, see {@link https://phabricator.wikimedia.org/T68598} "mw.loader state
 * of module stuck at "loading" if request was aborted".
 *
 * @param {string} moduleName
 * @returns {boolean}
 */
export function dealWithLoadingBug(moduleName) {
  if (mw.loader.getState(moduleName) === 'loading') {
    const $body = wrapHtml(cd.sParse('error-needreloadpage'), {
      callbacks: {
        'cd-notification-reloadPage': () => {
          location.reload();
        },
      },
    });
    mw.notify($body, { type: 'error' });
    return true;
  }
  return false;
}

/**
 * Get the bounding client rectangle of an element, setting values that include margins to the
 * `outerTop`, `outerBottom`, `outerLeft`, and `outerRight` properties. The margins are cached.
 *
 * @param {Element} el
 * @returns {object}
 */
export function getExtendedRect(el) {
  if (el.cdMarginTop === undefined) {
    const style = window.getComputedStyle(el);
    el.cdMarginTop = parseFloat(style.marginTop);
    el.cdMarginBottom = parseFloat(style.marginBottom);
    el.cdMarginLeft = parseFloat(style.marginLeft);
    el.cdMarginRight = parseFloat(style.marginRight);
  }
  const rect = el.getBoundingClientRect();
  const isVisible = getVisibilityByRects(rect);
  return {
    top: rect.top,
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
    width: rect.width,
    height: rect.height,
    outerTop: rect.top - (isVisible ? el.cdMarginTop : 0),
    outerBottom: rect.bottom + (isVisible ? el.cdMarginBottom : 0),
    outerLeft: rect.left - (isVisible ? el.cdMarginLeft : 0),
    outerRight: rect.right + (isVisible ? el.cdMarginRight : 0),
  };
}

/**
 * Check if two objects are identical by value. Doesn't handle complex cases. `undefined` values are
 * treated as unexistent (this helps to compare values retrieved from the local storage as JSON:
 * `JSON.stringify()` removes all `undefined` values as well).
 *
 * @param {object} object1 First object.
 * @param {object} object2 Second object.
 * @returns {boolean}
 */
export function areObjectsEqual(object1, object2) {
  const isMultipartObject = (val) => (
    val !== null &&
    typeof val === 'object' &&
    !(
      val instanceof RegExp ||
      val instanceof Date ||

      // This can be used in the worker context, where Node is an object and Worker is undefined.
      (typeof Node === 'function' && val instanceof Node) ||
      (typeof Worker === 'function' && val instanceof Worker)
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

  const keys1 = Object.keys(object1).filter((key) => object1[key] !== undefined);
  const keys2 = Object.keys(object2).filter((key) => object2[key] !== undefined);

  return (
    keys1.length === keys2.length &&
    keys1.every((key) => areObjectsEqual(object1[key], object2[key]))
  );
}

/**
 * Helper to get the script's local storage item packed in JSON or an empty object in case of an
 * unexistent/falsy/corrupt value or the storage inaccessible.
 *
 * @param {string} name
 * @returns {object}
 */
export function getFromLocalStorage(name) {
  const obj = mw.storage.getObject(`convenientDiscussions-${name}`);
  if (obj === false) {
    console.error('Storage is unavailable.');
  }
  return obj || {};
}

/**
 * Helper to save an object to the local storage.
 *
 * @param {string} name
 * @param {object} obj
 */
export function saveToLocalStorage(name, obj) {
  mw.storage.setObject(`convenientDiscussions-${name}`, obj);
}

/**
 * Remove left-to-right and right-to-left marks that sometimes are copied from the edit history to
 * the timestamp (for example, https://meta.wikimedia.org/w/index.php?diff=20418518) and also appear
 * after →/← in edit summaries.
 *
 * @param {string} text Text to alter.
 * @param {boolean} replaceWithSpace Replace direction marks with a space instead of removing.
 * @returns {string}
 */
export function removeDirMarks(text, replaceWithSpace) {
  return text.replace(/[\u200e\u200f]/g, replaceWithSpace ? ' ' : '');
}

/**
 * Replace the selected text (if any) in an input (`<input>` or `<textarea>`) with the provided text
 * and keep the undo/redo functionality.
 *
 * @param {external:OO.ui.TextInputWidget} input Input to set replace the selection in.
 * @param {string} text Text to replace the selection with.
 */
export function insertText(input, text) {
  focusInput(input);
  if (!document.execCommand('insertText', false, text)) {
    input.insertContent(text);
  }
}

/**
 * _For internal use._ Filter out values of an object that can't be safely passed to worker (see
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm}).
 *
 * @param {object} obj
 * @param {string[]} [allowedFuncNames=[]] Names of the properties that should be passed to the
 *   worker despite their values are functions (they are passed in a stringified form).
 * @returns {object}
 */
export function keepWorkerSafeValues(obj, allowedFuncNames = []) {
  const newObj = Object.assign({}, obj);
  Object.keys(newObj).forEach((key) => {
    const val = newObj[key];
    if (
      typeof val === 'object' &&
      val !== null &&
      !(val instanceof RegExp || val instanceof Date)
    ) {
      try {
        if (!areObjectsEqual(val, JSON.parse(JSON.stringify(val)))) {
          delete newObj[key];
        }
      } catch {
        delete newObj[key];
      }
    } else if (typeof val === 'function') {
      if (allowedFuncNames.includes(key)) {
        newObj[key] = val.toString();
      } else {
        delete newObj[key];
      }
    }
  });
  return newObj;
}

/**
 * Calculate the proportion of elements matched between arrays to the overall count of array
 * elements.
 *
 * @param {Array.<*>} arr1
 * @param {Array.<*>} arr2
 * @returns {number}
 * @private
 */
function calculateArrayOverlap(arr1, arr2) {
  if (!arr1.length || !arr2.length) {
    return 0;
  }

  let total = arr2.length;
  let overlap = 0;
  arr1.forEach((el1) => {
    if (arr2.includes(el1)) {
      overlap++;
    } else {
      total++;
    }
  });

  return overlap / total;
}

/**
 * Calculates the proportion of the number of words (minimum 2 characters long) present in both
 * strings to the total words count.
 *
 * @param {string} s1
 * @param {string} s2
 * @param {boolean} caseInsensitive
 * @returns {number}
 */
export function calculateWordOverlap(s1, s2, caseInsensitive) {
  const regexp = new RegExp(`[${cd.g.letterPattern}]{2,}`, 'g');
  const strToArr = (s) => (
    ((caseInsensitive ? s.toLowerCase() : s).match(regexp) || []).filter(unique)
  );
  return calculateArrayOverlap(strToArr(s1), strToArr(s2));
}

/**
 * Check if the provided key combination is pressed given an event.
 *
 * @param {Event} e
 * @param {number} keyCode
 * @param {Array.<'cmd'|'shift'|'alt'|'meta'>} [modifiers=[]] Use `'cmd'` instead of `'ctrl'`.
 * @returns {boolean}
 */
export function keyCombination(e, keyCode, modifiers = []) {
  if (modifiers.includes('cmd')) {
    removeFromArrayIfPresent(modifiers, 'cmd');
    // In Chrome on Windows, e.metaKey corresponds to the Windows key, so we better check for a
    // platform.
    modifiers.push(cd.g.clientProfile.platform === 'mac' ? 'meta' : 'ctrl');
  }
  return (
    e.keyCode === keyCode &&
    ['ctrl', 'shift', 'alt', 'meta'].every((mod) => modifiers.includes(mod) === e[mod + 'Key'])
  );
}

/**
 * Get around the Firefox 56 and probably some other browsers bug where the caret doesn't appear in
 * the input after focusing.
 *
 * @param {external:OO.ui.TextInputWidget} input
 */
export function focusInput(input) {
  input.$input.get(0).focus();
}

/**
 * Get elements using the right selector for the current skin given an object with skin names as
 * keys and selectors as values. If no value for the skin is provided, the `default` value is used.
 *
 * @param {object} selectors
 * @returns {external:jQuery}
 */
export function skin$(selectors) {
  return $(selectors[cd.g.skin] || selectors.default || selectors.vector);
}

/**
 * Get the footer element.
 *
 * @returns {external:jQuery}
 */
export function getFooter() {
  return skin$({
    monobook: '#f-list',
    modern: '#footer-info',
    default: '#footer-places',
  });
}

/**
 * Helper to add an element to the array if the array doesn't already include the element. Doesn't
 * add `undefined` elements.
 *
 * @param {Array.<*>} arr
 * @param {*} el
 */
export function addToArrayIfAbsent(arr, el) {
  if (el !== undefined && !arr.includes(el)) {
    arr.push(el);
  }
}

/**
 * Helper to remove an element from the array if the array includes the element. Doesn't remove
 * `undefined` elements.
 *
 * @param {Array.<*>} arr
 * @param {*} el
 */
export function removeFromArrayIfPresent(arr, el) {
  if (el !== undefined && arr.includes(el)) {
    arr.splice(arr.indexOf(el), 1);
  }
}

/**
 * Given bounding client rectangle(s), determine whether the element is visible.
 *
 * @param {...object} rects
 * @returns {boolean} `true` if visible, `false` if not.
 */
export function getVisibilityByRects(...rects) {
  // If the element has 0 as the left position and height, it's probably invisible for some reason.
  return !rects.some((rect) => rect.left === 0 && rect.height === 0);
}

/**
 * Get the gender that is common for a list of users (`'unknown'` is treated as `'male'`) or
 * `'unknown'` if there is no such.
 *
 * @param {import('./userRegistry').User[]} users
 * @returns {string}
 */
export function getCommonGender(users) {
  const genders = users.map((user) => user.getGender());
  let commonGender;
  if (genders.every((gender) => gender === 'female')) {
    commonGender = 'female';
  } else if (genders.every((gender) => gender !== 'female')) {
    commonGender = 'male';
  } else {
    commonGender = 'unknown';
  }
  return commonGender;
}

/**
 * Given a {@link https://developer.mozilla.org/en-US/docs/Web/API/Selection selection}, get a
 * node and offset that are higher in the document, regardless if they belong to an anchor node or
 * focus node.
 *
 * @param {Selection} selection
 * @returns {object}
 */
export function getHigherNodeAndOffsetInSelection(selection) {
  if (!selection.anchorNode) {
    return null;
  }

  const isAnchorHigher = (
    selection.anchorNode.compareDocumentPosition(selection.focusNode) &
    Node.DOCUMENT_POSITION_FOLLOWING
  );
  const higherNode = isAnchorHigher ? selection.anchorNode : selection.focusNode;
  const higherOffset = isAnchorHigher ? selection.anchorOffset : selection.focusOffset;
  return { higherNode, higherOffset };
}

/**
 * Whether a command modifier is pressed. On Mac, this means the Cmd key. On Windows, this means the
 * Ctrl key.
 *
 * @param {Event} e
 * @returns {boolean}
 */
export function isCmdModifierPressed(e) {
  // In Chrome on Windows, e.metaKey corresponds to the Windows key, so we better check for a
  // platform.
  return cd.g.clientProfile.platform === 'mac' ? e.metaKey : e.ctrlKey;
}

/**
 * Copy text and notify whether the operation was successful.
 *
 * @param {string} text Text to copy.
 * @param {object} messages
 * @param {string|external:jQuery} messages.success Success message.
 * @param {string|external:jQuery} messages.fail Fail message.
 * @private
 */
export function copyText(text, { success, fail }) {
  const $textarea = $('<textarea>')
    .val(text)
    .appendTo(document.body)
    .select();
  const successful = document.execCommand('copy');
  $textarea.remove();

  if (text && successful) {
    mw.notify(success);
  } else {
    mw.notify(fail, { type: 'error' });
  }
}

/**
 * Pad a number with zeros like this: `4` → `04` or `0004`.
 *
 * @param {number} number Number to pad.
 * @param {number} length Length of the resultant string.
 * @returns {string}
 * @private
 */
export function zeroPad(number, length) {
  return ('0000' + number).slice(-length);
}

/**
 * If the argument is an array, return its last element. Otherwise, return the value. (To process
 * {@link https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.Uri-property-query mw.Uri#query}.
 * If there is more than one parameter with some name, its property becomes an array in
 * `mw.Uri#query`. This is also why `mw.Uri` is used and not native
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/URL URL} - in MediaWiki, the second value
 * of the parameter is used, while with `URL` it is the first one.)
 *
 * @param {string|string[]} value
 * @returns {string}
 */
export function getLastArrayElementOrSelf(value) {
  return Array.isArray(value) ? value[value.length - 1] : value;
}

/**
 * Check whether the provided node is a heading node (`.mw-heading` or `<h1>` - `<h6>`).
 *
 * @param {Node} node
 * @param {boolean} [onlyHElements=false]
 * @returns {boolean}
 */
export function isHeadingNode(node, onlyHElements = false) {
  return (
    (!onlyHElements && node.classList?.contains('mw-heading')) ||
    ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(node.tagName)
  );
}

/**
 * Get the level of a {@link module:util.isHeadingNode heading node} (`.mw-heading` or `<h1>` -
 * `<h6>`).
 *
 * @param {Node|object} node Node or object with `tagName` and `className` properties.
 * @returns {?number}
 */
export function getHeadingLevel(node) {
  if (!node.tagName || node.className === undefined) {
    return null;
  }

  return (
    Number(
      ((node.tagName.match(/^H([1-6])$/) || node.className.match(/\bmw-heading([1-6])\b/)) || [])[1]
    ) ||
    null
  );
}

/**
 * Check whether the provided node is a metadata node (`<style>`, `<link>`).
 *
 * @param {Node} node
 * @returns {boolean}
 */
export function isMetadataNode(node) {
  return ['STYLE', 'LINK'].includes(node.tagName);
}

/**
 * Decode HTML entities in a string.
 *
 * It should work as fast as possible, so we use
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/indexOf String#indexOf},
 * not
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/includes String#includes}.
 *
 * @param {string} string
 * @returns {string}
 */
export function decodeHtmlEntities(string) {
  if (string.indexOf('&') === -1) {
    return string;
  } else {
    let result = string;
    if (result.indexOf('&#38;amp;') !== -1) {
      result = result.replace(/&#38;amp;/g, '&amp;amp;')
    }
    if (result.indexOf('&#') !== -1) {
      result = result.replace(/&#(\d+);/g, (s, code) => String.fromCharCode(code));
    }
    if (result.indexOf('&') !== -1) {
      result = html_entity_decode(result);
    }
    return result;
  }
}

/**
 * Get the timestamp of the current day.
 *
 * @returns {number}
 */
export function getDayTimestamp() {
  return Math.floor(Date.now() / cd.g.msInDay);
}

/**
 * Generate a timestamp for a date, where string positions for the year, month, etc. are fixed.
 *
 * @param {Date} date
 * @param {string} [seconds] `'00'` for DiscussionTools timestamp.
 * @returns {string}
 */
export function generateFixedPosTimestamp(date, seconds) {
  return (
    zeroPad(date.getUTCFullYear(), 4) +
    zeroPad(date.getUTCMonth() + 1, 2) +
    zeroPad(date.getUTCDate(), 2) +
    zeroPad(date.getUTCHours(), 2) +
    zeroPad(date.getUTCMinutes(), 2) +
    (seconds || '')
  );
}

/**
 * Count occurences of a regexp in a string.
 *
 * @param {string} string
 * @param {RegExp} regexp Regexp. Must have the `g` flag.
 * @returns {number}
 * @throws {CdError}
 */
export function countOccurrences(string, regexp) {
  if (!regexp.global) {
    throw new CdError('The regexp supplied to countOccurrences() must have the "g" flag.');
  }
  return (string.match(regexp) || []).length;
}

/**
 * Wait for a specified number of milliseconds (a wrapper around
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/setTimeout setTimeout()}).
 *
 * @param {number} [ms] Nubmer of milliseconds to sleep.
 * @returns {Promise}
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get the database name for a canonical hostname of a WMF wiki.
 *
 * @param {string} hostname Canonical hostname.
 * @returns {string}
 */
export function getDbnameForHostname(hostname) {
  /*
    To update the lists of special cases and non-chapter Wikimedia domains,
    1. Run a SQL query `select url, dbname from wiki`, export in the JSON format.
    2. Create a `hostnameAndDbname` variable, set it to the result rows.
    3. Run
        const wikimediaNonChapters = [];
        const specialCases = Object.fromEntries(
          Object.entries(hostnameToDbname).filter(([hostname, dbname]) => {
            let [, subdomain, languagedProject] = hostname.match(/^([^.]+)\.(wikibooks|wikinews|wikiquote|wikisource|wikiversity|wikivoyage|wikipedia|wiktionary|wikimedia)\./) || [];
            if (!languagedProject) {
              return true;
            }
            subdomain = subdomain.replace(/-/g, '_');
            if (languagedProject === 'wikipedia') {
              languagedProject = 'wiki';
            }
            if (dbname !== `${subdomain}${languagedProject}`) {
              if (languagedProject === 'wikimedia' && dbname === subdomain + 'wiki') {
                wikimediaNonChapters.push(subdomain);
                return false;
              }
              return true;
            }
          })
        );
        console.log(`/^(${wikimediaNonChapters.join('|')})$/`);
        console.log(JSON.stringify(specialCases));
   */
  const specialCases = {
    'api.wikimedia.org': 'apiportalwiki',
    'be-tarask.wikipedia.org': 'be_x_oldwiki',
    'ee.wikimedia.org': 'etwikimedia',
    'wikitech.wikimedia.org': 'labswiki',
    'www.mediawiki.org': 'mediawikiwiki',
    'wikisource.org': 'sourceswiki',
    'test-commons.wikimedia.org': 'testcommonswiki',
    'test.wikidata.org': 'testwikidatawiki',
    'www.wikidata.org': 'wikidatawiki',
    'www.wikifunctions.org': 'wikifunctionswiki',
  };
  const languagedProjectsRegexp = /^([^.]+)\.(wikibooks|wikinews|wikiquote|wikisource|wikiversity|wikivoyage|wiktionary|wikimedia|wikipedia)\./;
  const wikimediaNonChaptersRegexp = /^(advisory|commons|donate|foundation|incubator|login|meta|outreach|quality|species|strategy|usability|vote)$|^wikimania/;
  if (specialCases[hostname]) {
    return specialCases[hostname];
  }
  let [, subdomain, languagedProject] = hostname.match(languagedProjectsRegexp) || [];
  subdomain = subdomain.replace(/-/g, '_');
  if (
    languagedProject === 'wikipedia' ||
    (languagedProject === 'wikimedia' && wikimediaNonChaptersRegexp.test(subdomain))
  ) {
    languagedProject = 'wiki';
  }
  return subdomain + languagedProject;
}
