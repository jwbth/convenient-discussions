/**
 * Utilities module. Some of the utilities are parts of the
 * {@link convenientDiscussions.api convenientDiscussions.api} object.
 *
 * @module util
 */

import Button from './Button';
import CdError from './CdError';
import Parser from './Parser';
import cd from './cd';
import { ElementsTreeWalker } from './treeWalker';
import { brsToNewlines, hideSensitiveCode } from './wikitext';

const scrollData = { offset: null };
const postponements = {};
let notificationsData = [];

/**
 * @typedef {object} WrapCallbacks
 * @property {Function} *
 */

/**
 * @typedef {object} WrapComplexReturn
 * @property {external:jQuery} $wrapper
 * @property {Button[]} buttons
 */

/**
 * Generate a `<span>` (or other element) suitable as an argument for various methods for displaying
 * HTML. Optionally, attach callback functions and `target="_blank"` attribute to links with the
 * provided class names.
 *
 * @param {string|JQuery} htmlOrJquery
 * @param {object} [options={}]
 * @param {WrapCallbacks} [options.callbacks]
 * @param {string} [options.tagName='span']
 * @param {boolean} [options.targetBlank]
 * @returns {external:jQuery|WrapComplexReturn} If `options.callbacks` is supplied,
 *   returns an array containing a wrapper and an array of buttons. Otherwise, returns a wrapper
 *   alone.
 */
export function wrap(htmlOrJquery, options = {}) {
  const $wrapper = (htmlOrJquery instanceof $ ? htmlOrJquery : $($.parseHTML(htmlOrJquery)))
    .wrapAll(`<${options.tagName || 'span'}>`)
    .parent();
  const buttons = [];
  if (options.callbacks) {
    Object.keys(options.callbacks).forEach((className) => {
      const $linkWrapper = $wrapper.find(`.${className}`);
      if (!$linkWrapper.find('a').length) {
        $linkWrapper.wrapInner('<a>');
      }
      const button = new Button({
        element: $linkWrapper.find('a').get(0),
        action: options.callbacks[className],
      });
      buttons.push(button);
    });
  }
  if (options.targetBlank) {
    $wrapper.find('a[href]').attr('target', '_blank');
  }
  return buttons.length ? { $wrapper, buttons } : $wrapper;
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
 * @param {boolean} [options.addPostfix=true] Whether to add `cd.g.SUMMARY_POSTFIX` to the summary.
 * @returns {string}
 */
export function buildEditSummary(options) {
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
}

/**
 * Is there any kind of a page overlay present, like the OOUI modal overlay or CD loading overlay.
 * This runs very frequently.
 *
 * @returns {boolean}
 */
export function isPageOverlayOn() {
  return (
    document.body.classList.contains('oo-ui-windowManager-modal-active') ||

    // The following code constitutes boot.isPageLoading, but we avoid using that because importing
    // it here will increase the size of the worker build dramatically.
    cd.state.isFirstRun ||
    cd.state.isPageBeingReloaded
  );
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
 * @param {*} item
 * @param {number} i
 * @param {Array} arr
 * @returns {boolean}
 */
export function unique(item, i, arr) {
  return arr.indexOf(item) === i;
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

  if (cd.g.POPULAR_INLINE_ELEMENTS.includes(node.tagName)) {
    return true;
  } else if (cd.g.POPULAR_NOT_INLINE_ELEMENTS.includes(node.tagName)) {
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
 * @param {string} s
 * @returns {string}
 */
export function generatePageNamePattern(s) {
  const firstChar = s[0];
  if (!firstChar) {
    return '';
  }

  const fcUpperCase = firstChar.toUpperCase();
  const fcLowerCase = firstChar.toLowerCase();

  // Could be issues, probably not very serious, resulting from the difference of PHP's
  // mb_strtoupper and JavaScript's String#toUpperCase, see firstCharToUpperCase() and
  // https://phabricator.wikimedia.org/T141723#2513800.
  const fcPattern = fcUpperCase !== fcLowerCase ?
    '[' + fcUpperCase + fcLowerCase + ']' :
    mw.util.escapeRegExp(firstChar);

  return fcPattern + mw.util.escapeRegExp(s.slice(1)).replace(/[ _]+/g, '[ _]+');
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
      cd.g.PAGE_WHITELIST_REGEXP?.test(pageName) ||
      (!cd.g.PAGE_WHITELIST_REGEXP && cd.config.customTalkNamespaces.includes(namespaceNumber))
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
 * Alternative to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/flat Array#flat(1)}.
 * That method is not yet supported by major browsers.
 *
 * @param {Array} arr
 * @returns {Array}
 */
export function flat(arr) {
  return [].concat(...arr);
}

/**
 * Callback used in the `.catch()` parts of API requests.
 *
 * @param {string|Array} code
 * @param {object} data
 * @throws {CdError}
 */
export function handleApiReject(code, data) {
  // Native promises support only one parameter.
  if (Array.isArray(code)) {
    [code, data] = code;
  }

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
 * Provide the `mw.Title.phpCharToUpper` functionality in the web worker context.
 *
 * @param {string} char
 * @returns {string}
 * @private
 */
function phpCharToUpper(char) {
  if (cd.g.PHP_CHAR_TO_UPPER_JSON[char] === '') {
    return char;
  }
  return cd.g.PHP_CHAR_TO_UPPER_JSON[char] || char.toUpperCase();
}

/**
 * Transform the first letter of a string to upper case, for example: `'wikilink'` → `'Wikilink'`.
 * Do it in PHP, not JavaScript, fashion to match the MediaWiki behavior, see
 * {@link https://phabricator.wikimedia.org/T141723#2513800}.
 *
 * @param {string} s
 * @returns {string}
 */
export function firstCharToUpperCase(s) {
  return s.length ? phpCharToUpper(s[0]) + s.slice(1) : '';
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
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/findIndex Array#findIndex}
 * analog that looks for the _last_ index.
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
 * @param {string} type Should consist only of alphanumeric characters.
 * @param {boolean} [useGroups=false] Use groups in the regexp as the `preText` and `textToHide`
 *   parameters.
 * @returns {string}
 */
export function hideText(text, regexp, hidden, type, useGroups = false) {
  return text.replace(regexp, (s, preText, textToHide) => {
    if (!useGroups) {
      preText = null;
      textToHide = null;
    }

    // Handle tables separately.
    return (
      (preText || '') +
      (type === 'table' ? '\x03' : '\x01') +
      hidden.push(textToHide || s) +
      (type ? '_' + type : '') +
      (type === 'table' ? '\x04' : '\x02')
    );
  });
}

/**
 * Replace placeholders created by {@link module:util.hideText}.
 *
 * @param {string} text
 * @param {string[]} hidden
 * @param {string} type
 * @returns {string}
 */
export function unhideText(text, hidden, type) {
  const regexp = type ?
    new RegExp(`(?:\\x01|\\x03)(\\d+)(?:_${type})?(?:\\x02|\\x04)`, 'g') :
    /(?:\x01|\x03)(\d+)(?:_\w+)?(?:\x02|\x04)/g;
  while (regexp.test(text)) {
    text = text.replace(regexp, (s, num) => hidden[num - 1]);
  }

  return text;
}

/**
 * Save the scroll position relative to the first element in the viewport looking from the top of
 * the page.
 *
 * @param {?object} [switchToAbsolute=null] If an object with the `saveTocHeight` property and the
 *   viewport is above the bottom of the table of contents, then use
 *   {@link module:util.saveScrollPosition} (this allows for better precision).
 * @param {number} [scrollY=window.scrollY] Vertical scroll position (cached value to avoid reflow).
 */
export function saveRelativeScrollPosition(switchToAbsolute = null, scrollY = window.scrollY) {
  // The viewport has the TOC bottom or is above it.
  if (switchToAbsolute && cd.g.$toc.length && scrollY < getTocBottomOffset()) {
    saveScrollPosition(switchToAbsolute.saveTocHeight);
  } else {
    scrollData.element = null;
    scrollData.elementTop = null;
    scrollData.touchesBottom = false;
    scrollData.offsetBottom = (
      document.documentElement.scrollHeight - (scrollY + window.innerHeight)
    );

    // 100 accounts for various content moves by scripts running on the page (like HotCat that may
    // add an empty category list).
    if (scrollData.offsetBottom < 100) {
      scrollData.touchesBottom = true;
    } else if (scrollY !== 0 && cd.g.rootElement.getBoundingClientRect().top <= 0) {
      const treeWalker = new ElementsTreeWalker(cd.g.rootElement.firstElementChild);
      while (true) {
        const node = treeWalker.currentNode;

        if (!isInline(node) && !cd.g.floatingElements.includes(node)) {
          const rect = node.getBoundingClientRect();
          if (rect.bottom >= 0 && rect.height !== 0) {
            scrollData.element = node;
            scrollData.elementTop = rect.top;
            if (treeWalker.firstChild()) {
              continue;
            } else {
              break;
            }
          }
        }
        if (!treeWalker.nextSibling()) break;
      }
    }
  }
}

/**
 * Restore the scroll position saved in {@link module:util.saveRelativeScrollPosition}.
 *
 * @param {boolean} [switchToAbsolute=false] Restore the absolute position using
 *   {@link module:util.restoreScrollPosition} if {@link module:util.saveScrollPosition} was
 *   previously used for saving the position.
 */
export function restoreRelativeScrollPosition(switchToAbsolute = false) {
  if (switchToAbsolute && scrollData.offset !== null) {
    restoreScrollPosition();
  } else {
    if (scrollData.touchesBottom && window.scrollY !== 0) {
      const y = (
        document.documentElement.scrollHeight - window.innerHeight - scrollData.offsetBottom
      );
      window.scrollTo(0, y);
    } else if (scrollData.element) {
      const rect = scrollData.element.getBoundingClientRect();
      if (getVisibilityByRects(rect)) {
        window.scrollTo(0, window.scrollY + rect.top - scrollData.elementTop);
      }
    }
  }
}

/**
 * _For internal use._ Replace the "anchor" element used for restoring saved relative scroll
 * position with a new element if it coincides with the provided element.
 *
 * @param {Element} element
 * @param {Element} newElement
 */
function replaceAnchorElement(element, newElement) {
  if (scrollData.element && element === scrollData.element) {
    scrollData.element = newElement;
  }
}

/**
 * Replace an element with an identical one but with another tag name, i.e. move all child nodes,
 * attributes, and some bound events to a new node, and also reassign references in some variables
 * and properties to this element. Unfortunately, we can't just change the element's `tagName` to do
 * that.
 *
 * @param {Element} element
 * @param {string} newType
 * @returns {Element}
 * @private
 */
export function changeElementType(element, newType) {
  const newElement = document.createElement(newType);
  while (element.firstChild) {
    newElement.appendChild(element.firstChild);
  }
  [...element.attributes].forEach((attribute) => {
    newElement.setAttribute(attribute.name, attribute.value);
  });

  // If this element is a part of a comment, replace it in the Comment object instance.
  let commentId = element.getAttribute('data-cd-comment-id');
  if (commentId !== null) {
    commentId = Number(commentId);
    cd.comments[commentId].replaceElement(element, newElement);
  } else {
    element.parentNode.replaceChild(newElement, element);
  }

  replaceAnchorElement(element, newElement);

  return newElement;
}

/**
 * Get the bottom offset of the table of contents.
 *
 * @returns {number}
 * @private
 */
function getTocBottomOffset() {
  return cd.g.$toc.offset().top + cd.g.$toc.outerHeight();
}

/**
 * Save the scroll position to restore it later with {@link module:util.restoreScrollPosition}.
 *
 * @param {boolean} [saveTocHeight=true] `false` is used for more fine control of scroll behavior
 *   when visits are loaded after a page reload.
 */
export function saveScrollPosition(saveTocHeight = true) {
  scrollData.offset = window.scrollY;
  scrollData.tocHeight = (
    (saveTocHeight || scrollData.tocHeight) &&
    cd.g.$toc.length &&
    !cd.g.isTocFloating &&
    window.scrollY !== 0 &&

    // There is some content below the TOC in the viewport.
    getTocBottomOffset() < window.scrollY + window.innerHeight
  ) ?
    cd.g.$toc.outerHeight() :
    null;
}

/**
 * Restore the scroll position saved in {@link module:util.saveScrollPosition}.
 *
 * @param {boolean} [resetTocHeight=true] `false` is used for more fine control of scroll behavior
 *   after page reloads.
 */
export function restoreScrollPosition(resetTocHeight = true) {
  if (scrollData.offset === null) return;

  if (scrollData.tocHeight) {
    scrollData.offset += (cd.g.$toc.outerHeight() || 0) - scrollData.tocHeight;
  }
  window.scrollTo(0, scrollData.offset);

  scrollData.offset = null;
  if (resetTocHeight) {
    scrollData.tocHeight = null;
  }
}

/**
 * Use a
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/race Promise.race()}
 * workaround to get the state of a native promise. Note that it works _only_ with native promises:
 * it doesn't work with jQuery promises (for example, ones that `new mw.Api()` returns).
 *
 * @param {Promise} promise
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
    const $body = wrap(cd.sParse('error-needreloadpage'), {
      callbacks: {
        'cd-notification-reloadPage': () => {
          location.reload();
        },
      },
    }).$wrapper;
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
  if (el.convenientDiscussionsMarginTop === undefined) {
    const style = window.getComputedStyle(el);
    el.convenientDiscussionsMarginTop = parseFloat(style.marginTop);
    el.convenientDiscussionsMarginBottom = parseFloat(style.marginBottom);
    el.convenientDiscussionsMarginLeft = parseFloat(style.marginLeft);
    el.convenientDiscussionsMarginRight = parseFloat(style.marginRight);
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
    outerTop: rect.top - (isVisible ? el.convenientDiscussionsMarginTop : 0),
    outerBottom: rect.bottom + (isVisible ? el.convenientDiscussionsMarginBottom : 0),
    outerLeft: rect.left - (isVisible ? el.convenientDiscussionsMarginLeft : 0),
    outerRight: rect.right + (isVisible ? el.convenientDiscussionsMarginRight : 0),
  };
}

/**
 * Check if two objects are identical by value. Doesn't handle complex cases. `undefined` values are
 * treated as unexistent (this helps to compare values retrieved from the local storage as JSON:
 * `JSON.stringify()` removes all `undefined` values as well).
 *
 * @param {object} object1 First object.
 * @param {object} object2 Second object.
 * @param {boolean} [includes=false] Test if all the keys of the first object are contained in
 *   the second object instead of checking that all the keys are the same.
 * @returns {boolean}
 */
export function areObjectsEqual(object1, object2, includes = false) {
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
    (keys1.length === keys2.length || includes) &&
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
 * @param {Array} [allowedFuncNames=[]] Names of the properties that should be passed to the worker
 *   despite their values are functions (they are passed in a stringified form).
 * @param {Array} [disallowedNames=[]] Names of the properties that should be filtered out without
 *   checking (allows to save time on greedy operations).
 * @returns {object}
 */
export function keepWorkerSafeValues(obj, allowedFuncNames = [], disallowedNames = []) {
  const newObj = Object.assign({}, obj);
  Object.keys(newObj).forEach((key) => {
    if (disallowedNames.includes(key)) {
      delete newObj[key];
      return;
    }
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
 * Calculates the proportion of the number of words (minimum 2 characters long) present in both
 * strings to the total words count.
 *
 * @param {string} s1
 * @param {string} s2
 * @returns {number}
 */
export function calculateWordOverlap(s1, s2) {
  const regexp = new RegExp(`[${cd.g.LETTER_PATTERN}]{2,}`, 'g');
  const words1 = (s1.match(regexp) || []).filter(unique);
  const words2 = (s2.match(regexp) || []).filter(unique);
  if (!words1.length || !words2.length) {
    return 0;
  }

  let total = words2.length;
  let overlap = 0;
  words1.forEach((word1) => {
    if (words2.some((word2) => word2 === word1)) {
      overlap++;
    } else {
      total++;
    }
  });

  return overlap / total;
}

/**
 * Check if the provided key combination is pressed given an event.
 *
 * @param {Event} e
 * @param {number} keyCode
 * @param {Array} [modificators=[]]
 * @returns {boolean}
 */
export function keyCombination(e, keyCode, modificators = []) {
  return (
    e.keyCode === keyCode &&
    ['ctrl', 'shift', 'alt', 'meta'].every((mod) => modificators.includes(mod) === e[mod + 'Key'])
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
 * keys and selectors as values. New Vector goes as `vector`, classic Vector goes as
 * `vector-legacy`. If no value for the skin is provided, the `default` value is used.
 *
 * @param {object} selectors
 * @returns {external:jQuery}
 */
export function skin$(selectors) {
  return $(selectors[cd.g.SKIN] || selectors.default || selectors.vector);
}

/**
 * Helper to add an element to the array if the array doesn't already include the element. Doesn't
 * add `undefined` elements.
 *
 * @param {Array} arr
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
 * @param {Array} arr
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
 * Get a decoded URL with anchor.
 *
 * @param {string} anchor
 * @param {boolean} permanent Get a permanent URL.
 * @returns {string}
 */
export function getUrlWithAnchor(anchor, permanent) {
  let params = {};
  if (permanent) {
    params.oldid = mw.config.get('wgRevisionId');
  }
  const decodedPageUrl = decodeURI(cd.page.getUrl(params));
  return `${cd.g.SERVER}${decodedPageUrl}#${anchor}`;
}

/**
 * Get the gender that is common for a list of users (`'unknown'` is treated as `'male'`) or
 * `'unknown'` if there is no such.
 *
 * @param {User[]} users
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
 * Notification object created by running `mw.notification.notify(...)`.
 *
 * @typedef {object} Notification
 * @see https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.Notification_
 * @global
 */

/**
 * Show a notificaition and add it to the registry. This is used to be able to keep track of shown
 * notifications and close them all at once if needed. Most notifications are shown using simple
 * `mw.notify` or `mw.notification.notify`.
 *
 * @param {string|external:Query} message Message text.
 * @param {object} [options]
 * @param {object} [data={}] Additional data related to the notification.
 * @returns {Notification}
 */
export function addNotification(message, options, data = {}) {
  const notification = mw.notification.notify(message, options);
  notificationsData.push(Object.assign(data, { notification }));
  return notification;
}

/**
 * Get all notifications added to the registry (including already hidden). The
 * {@link https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.Notification_ mw.Notification}
 * object will be in the `notification` property.
 *
 * @returns {object[]}
 */
export function getNotifications() {
  return notificationsData;
}

/**
 * Close all notifications added to the registry immediately.
 *
 * @param {boolean} [smooth] Don't use a smooth animation.
 */
export function closeNotifications(smooth = true) {
  notificationsData.forEach((data) => {
    if (!smooth) {
      data.notification.$notification.hide();
    }
    data.notification.close();
  });
  notificationsData = [];
}

/**
 * Convert a fragment of DOM into wikitext.
 *
 * @param {Element} div
 * @param {external:OO.ui.TextInputWidget} input
 * @returns {Promise.<string>}
 * @private
 */
async function domToWikitext(div, input) {
  // Get all styles from classes applied. If HTML is retrieved from a paste, this is not needed
  // (styles are added to elements themselves in the text/html format), but won't hurt.
  div.className = 'cd-hidden';
  cd.g.rootElement.appendChild(div);

  const removeElement = (el) => el.remove();
  const replaceWithChildren = (el) => {
    if (['DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(el.tagName)) {
      el.after('\n');
    }
    el.replaceWith(...el.childNodes);
  };

  [...div.querySelectorAll('*')]
    .filter((el) => window.getComputedStyle(el).userSelect === 'none')
    .forEach(removeElement);

  // Should run after removing elements with "user-select: none", to remove their wrappers that now
  // have not content.
  [...div.querySelectorAll('*')]
    // Need to keep non-breaking spaces.
    .filter((el) => (
      (!['BR', 'HR'].includes(el.tagName) || el.classList.contains('Apple-interchange-newline')) &&
      !el.textContent.replace(/[ \n]+/g, ''))
    )

    .forEach(removeElement);

  [...div.querySelectorAll('style')].forEach(removeElement);

  // <syntaxhighlight>
  [...div.querySelectorAll('.mw-highlight')].forEach((el) => {
    const syntaxhighlight = changeElementType(el.firstElementChild, 'syntaxhighlight');
    const [, lang] = el.className.match(/\bmw-highlight-lang-(\w+)\b/) || [];
    if (lang) {
      syntaxhighlight.setAttribute('lang', lang);
    }
  });

  const topElements = new Parser({ childElementsProp: 'children' })
    .getTopElementsWithText(div, true).nodes;
  if (topElements[0] !== div) {
    div.innerHTML = '';
    div.append(...topElements);
  }

  [...div.querySelectorAll('div, span, h1, h2, h3, h4, h5, h6')].forEach(replaceWithChildren);

  const allowedTags = cd.g.ALLOWED_TAGS.concat('a', 'center', 'big', 'strike', 'tt');
  [...div.querySelectorAll('*')].forEach((el) => {
    if (!allowedTags.includes(el.tagName.toLowerCase())) {
      replaceWithChildren(el);
      return;
    }

    [...el.attributes]
      .filter((attr) => attr.name === 'class' || /^data-/.test(attr.name))
      .forEach((attr) => {
        el.removeAttribute(attr.name);
      });
  });

  [...div.children]
    // DDs out of DLs are likely comment parts that should not create `:` markup. (Bare LIs don't
    // create `*` markup in the API.)
    .filter((el) => el.tagName === 'DD')

    .forEach(replaceWithChildren);

  const allElements = [...div.querySelectorAll('*')];
  let wikitext;
  const parseHtml = !(
    !div.childElementCount ||
    (allElements.length === 1 && ['P', 'LI', 'DD'].includes(allElements[0].tagName))
  )
  if (parseHtml) {
    input.pushPending();
    input.setDisabled(true);
    try {
      wikitext = await $.post('/api/rest_v1/transform/html/to/wikitext', {
        html: div.innerHTML,
        scrub_wikitext: true,
      });
      wikitext = wikitext
        .trim()
        .replace(/(?:^ .*(?:\n|$))+/gm, (s) => {
          s = s
            .replace(/^ /gm, '')
            .replace(/[^\n]$/, '$0\n');
          return '<syntaxhighlight>\n' + s + '</syntaxhighlight>';
        })
        .replace(
          /(<syntaxhighlight[^>]*>)\s*<nowiki>(.*?)<\/nowiki>\s*(<\/syntaxhighlight>)/g,
          '$1$2$3'
        );
      let hidden;
      ({ code: wikitext, hidden } = hideSensitiveCode(wikitext));
      wikitext = brsToNewlines(wikitext);
      wikitext = unhideText(wikitext, hidden);
    } catch {
      // Empty
    }
    input.popPending();
    input.setDisabled(false);
  }

  div.remove();

  return wikitext ?? div.innerText;
}

/**
 * Given a selection, get its content as wikitext.
 *
 * @param {external:OO.ui.TextInputWidget} input
 * @returns {string}
 */
export async function getWikitextFromSelection(input) {
  const contents = window.getSelection().getRangeAt(0).cloneContents();
  const div = document.createElement('div');
  div.appendChild(contents);
  return await domToWikitext(div, input);
}

/**
 * Given the HTML of a paste, get its content as wikitext.
 *
 * @param {string} originalHtml
 * @param {external:OO.ui.TextInputWidget} input
 * @returns {string}
 */
export async function getWikitextFromPaste(originalHtml, input) {
  let html = originalHtml
    .replace(/^[^]*<!-- *StartFragment *-->/, '')
    .replace(/<!-- *EndFragment *-->[^]*$/, '');
  const div = document.createElement('div');
  div.innerHTML = html;
  [...div.querySelectorAll('[style]')].forEach((el) => {
    el.removeAttribute('style');
  });
  return await domToWikitext(div, input);
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
 * Basic throttling implementation. Postpones the execution of some function. If it is already
 * postponed, don't create a second postponement.
 *
 * @param {string} label
 * @param {Function} func
 * @param {number} delay
 */
export function postpone(label, func, delay) {
  if (postponements[label]) return;

  postponements[label] = true;
  setTimeout(() => {
    postponements[label] = false;
    func();
  }, delay);
}

/**
 * Check whether some task is postponed.
 *
 * @param {string} label
 * @returns {boolean}
 */
export function isPostponed(label) {
  return postponements[label];
}
