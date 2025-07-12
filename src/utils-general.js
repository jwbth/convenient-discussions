/**
 * General utilities. Some of the utilities are parts of the
 * {@link convenientDiscussions.api convenientDiscussions.api} object.
 *
 * @module utilsGeneral
 */

import html_entity_decode from 'locutus/php/strings/html_entity_decode';

import CdError from './CdError';
import cd from './cd';

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
 * Check if a node is an element with `display: inline` or `display: inline-block` in the default
 * browser styles. Optionally, it can treat text nodes as such.
 *
 * @param {NodeLike} node
 * @param {boolean} [considerTextNodesAsInline=false]
 * @returns {?boolean}
 */
export function isInline(node, considerTextNodesAsInline = false) {
  if (considerTextNodesAsInline && isText(node)) {
    return true;
  }

  if (!isElement(node)) {
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
  }

  if (
    // Don't have `window` in web worker.
    !isDomHandlerNode(node) &&

    typeof node.cdIsInline !== 'boolean' &&
    node.isConnected
  ) {
    // This is very expensive. Avoid by any means.
    console.warn('Convenient Discussions: Expensive operation: isInline() called for:', node);
    node.cdIsInline = window
      .getComputedStyle(node)
      .display.startsWith('inline');
  }

  return node.cdIsInline ?? null;
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
  const firstCharPattern = firstCharUpperCase !== firstCharLowerCase ?
    '[' + firstCharUpperCase + firstCharLowerCase + ']' :
    mw.util.escapeRegExp(firstChar);

  return firstCharPattern + mw.util.escapeRegExp(string.slice(1)).replace(/[ _]+/g, '[ _]+');
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
  return Boolean(
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
  return Boolean(summary && cd.config.undoTexts.some((text) => summary.includes(text)));
}

/**
 * Callback for
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter Array#filter}
 * to keep only defined values in an array.
 *
 * @template T
 * @param {T | undefined} el
 * @returns {el is T}
 */
export function defined(el) {
  return el !== undefined;
}

/**
 * Callback for
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter Array#filter}
 * to keep only defined and not `null` values in an array.
 *
 * @template T
 * @param {?(T | undefined)} el
 * @returns {el is T}
 */
export function definedAndNotNull(el) {
  return el !== undefined && el !== null;
}

/**
 * Return an array with a changed start index (`[0, 1, 2, 3]` can be transformed into `[2, 3, 0,
 * 1]`) and optionally reversed while keeping the start index (`[0, 1, 2, 3]` can be transformed
 * into `[2, 1, 0, 3]`).
 *
 * @template T
 * @param {T[]} arr
 * @param {number} startIndex
 * @param {boolean} [reverse=false]
 * @returns {T[]}
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
 * @param {boolean} [backwards=false]
 * @returns {string}
 * @author Bartosz Dziewoński <matma.rex@gmail.com>
 * @license MIT
 * @private
 */
export function charAt(string, offset, backwards = false) {
  const maybePair = backwards ?
    string.slice(offset - 1, offset + 1) :
    string.slice(offset, offset + 2);
  return /^[\uD800-\uDBFF][\uDC00-\uDFFF]$/.test(maybePair) ? maybePair : string.charAt(offset);
}

/**
 * Provide the
 * {@link https://doc.wikimedia.org/mediawiki-core/master/js/mw.Title.html#.phpCharToUpper mw.Title.phpCharToUpper}
 * functionality in the web worker context.
 *
 * @param {string} char
 * @returns {string}
 * @private
 */
export function phpCharToUpper(char) {
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
  return Promise.race([promise, obj]).then(
    (value) => value === obj ? 'pending' : 'resolved',
    () => 'rejected'
  );
}

/**
 * Check if the argument is a primitive or convertible to a primitive.
 *
 * @param {*} val
 * @returns {boolean}
 */
function isConvertibleToPrimitiveValue(val) {
  return (
    val === null ||
    typeof val !== 'object' ||
    (
      val instanceof RegExp ||
      val instanceof Date ||

      // This can be used in the worker context, where Node is an object and Worker is undefined.
      (typeof Node === 'function' && val instanceof Node) ||
      (typeof Worker === 'function' && val instanceof Worker)
    )
  );
}

/**
 * Convert an object to a primitive if possible.
 *
 * @param {*} val
 * @returns {*}
 */
function toPrimitive(val) {
  return val instanceof RegExp || val instanceof Date ? val.toString() : val;
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
  if (isConvertibleToPrimitiveValue(object1) || isConvertibleToPrimitiveValue(object2)) {
    return toPrimitive(object1) === toPrimitive(object2);
  }

  const keys1 = Object.keys(object1).filter((key) => object1[key] !== undefined);
  const keys2 = Object.keys(object2).filter((key) => object2[key] !== undefined);

  return (
    // To avoid results where {} is equal to `new Map(['a', 1])`
    object1.constructor === object2.constructor &&

    keys1.length === keys2.length &&
    keys1.every((key) => areObjectsEqual(object1[key], object2[key]))
  );
}

/**
 * Remove left-to-right and right-to-left marks that sometimes are copied from the edit history to
 * the timestamp (for example, https://meta.wikimedia.org/w/index.php?diff=20418518) and also appear
 * after →/← in edit summaries.
 *
 * @param {string} text Text to alter.
 * @param {boolean} [replaceWithSpace=false] Replace direction marks with a space instead of
 *   removing.
 * @returns {string}
 */
export function removeDirMarks(text, replaceWithSpace = false) {
  return text.replace(/[\u200e\u200f]/g, replaceWithSpace ? ' ' : '');
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
 * @param {boolean} [caseInsensitive=false]
 * @returns {number}
 */
export function calculateWordOverlap(s1, s2, caseInsensitive = false) {
  const regexp = new RegExp(`[${cd.g.letterPattern}]{2,}`, 'g');
  const strToArr = (s) => (
    ((caseInsensitive ? s.toLowerCase() : s).match(regexp) || []).filter(unique)
  );
  return calculateArrayOverlap(strToArr(s1), strToArr(s2));
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
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams/getAll URLSearchParams#getAll}
 * return value. In MediaWiki, if there is more than one parameter with some name, the second value
 * of the parameter is used, while with `URLSearchParams#get` it is the first one.)
 *
 * @param {string|string[]} value
 * @returns {string}
 */
export function getLastArrayElementOrSelf(value) {
  return Array.isArray(value) ? value[value.length - 1] : value;
}

/**
 * If the argument is an array, return it. Otherwise, return an array containing the argument.
 *
 * @param {any|any[]} value
 * @returns {any[]}
 */
export function ensureArray(value) {
  return Array.isArray(value) ? value : [value];
}

/**
 * Check whether the provided node is a heading node (`.mw-heading` or `<h1>` - `<h6>`).
 *
 * @param {NodeLike} node
 * @param {boolean} [onlyHElements=false]
 * @returns {boolean}
 */
export function isHeadingNode(node, onlyHElements = false) {
  return (
    isElement(node) &&
    (
      (!onlyHElements && node.classList.contains('mw-heading')) ||
      ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(node.tagName)
    )
  );
}

/**
 * Get the level of a {@link module:util.isHeadingNode heading node} (`.mw-heading` or `<h1>` -
 * `<h6>`).
 *
 * @param {ElementLike|{ tagName: string; className: string }} node Element or object with `tagName`
 *   and `className` properties.
 * @returns {?number}
 */
export function getHeadingLevel(node) {
  return (
    Number(
      (
        node.tagName.match(/^H([1-6])$/) ||
        node.className.match(/\bmw-heading([1-6])\b/) ||
        []
      )[1]
    ) ||
    null
  );
}

/**
 * Checks if the argument is a text node.
 *
 * @param {?NodeLike} [node]
 * @returns {node is TextLike}
 */
export function isText(node) {
  return Boolean(node && node.nodeType === Node.TEXT_NODE);
}

/**
 * @overload
 * @param {Node} node
 * @returns {node is Element}
 */

/**
 * @overload
 * @param {import('./worker/domhandlerExtended').Node} node
 * @returns {node is import('./worker/domhandlerExtended').Element}
 */

/**
 * @overload
 * @param {?NodeLike} [node]
 * @returns {node is ElementLike}
 */

/**
 * Checks if the argument is an element.
 *
 * @param {?NodeLike} [node]
 * @returns {node is ElementLike}
 */
export function isElement(node) {
  return Boolean(node && node.nodeType === Node.ELEMENT_NODE);
}

/**
 * Checks if the argument is a node.
 *
 * @param {?NodeLike} [node]
 * @returns {node is NodeLike}
 */
export function isNode(node) {
  return Boolean(node);
}

/**
 * Checks if the argument is a node from the `domhandler` library.
 *
 * @param {NodeLike} [node]
 * @returns {node is import('./worker/domhandlerExtended').Node}
 */
export function isDomHandlerNode(node) {
  return Boolean(node && 'type' in node && 'parent' in node);
}

/**
 * Checks if the given node is a node from the `domhandler` library.
 *
 * @param {NodeLike} [node]
 * @returns {node is import('./worker/domhandlerExtended').Element}
 */
// eslint-disable-next-line no-unused-vars
export function isDomHandlerElement(node) {
  return Boolean(node && 'type' in node && 'attribs' in node);
}

/**
 * Check whether the provided node is a metadata node (`<style>`, `<link>`).
 *
 * @param {NodeLike} node
 * @returns {boolean}
 */
export function isMetadataNode(node) {
  return isElement(node) && ['STYLE', 'LINK'].includes(node.tagName);
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
      result = /** @type {string} */ (html_entity_decode(result));
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
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

/**
 * @typedef {object} ParsedWikiUrl
 * @property {string} pageName
 * @property {string} hostname
 * @property {string} [fragment]
 */

/**
 * Get the page name, host name and fragment from a URL in one of the standard formats (based on the
 * wgArticlePath, wgScript, and wgActionPaths config values).
 *
 * @param {string} url
 * @returns {?ParsedWikiUrl}
 */
export function parseWikiUrl(url) {
  let hostname = cd.g.serverName;
  let fragment;
  let pageName = url
    .replace(/^(?:https?:)?\/\/([^/]+)/, (s, m1) => {
      hostname = m1;

      return '';
    })

    // Could we just get by with `[&?]action=edit` (see below)?
    // .replace(cd.g.startsWithEditActionPathRegexp || '', '$1')

    .replace(cd.g.articlePathRegexp, '$1')
    .replace(cd.g.startsWithScriptTitleRegexp, '')
    .replace(/[&?]action=edit.*/, '')
    .replace(/#(.*)/, (s, m1) => {
      fragment = m1;

      return '';
    })
    .replace(/_/g, ' ');
  try {
    pageName = decodeURIComponent(pageName);
  } catch {
    return null;
  }

  return { pageName, hostname, fragment };
}

/**
 * Get the page name from a URL in the canonical format (`.../wiki/Page`).
 *
 * @param {string} url
 * @returns {string}
 */
export function canonicalUrlToPageName(url) {
  return decodeURIComponent(url.slice(url.indexOf('/wiki/') + 6)).replace(/_/g, ' ');
}

/**
 * Check if a URL query parameter is `true` (`1`, `yes`, `y`) or `false` (`0`, `no`, `n`).
 *
 * @param {string} param
 * @returns {?boolean}
 */
export function getQueryParamBooleanValue(param) {
  const match = location.search.match(new RegExp('[?&]' + param + '=([^&]+)'));
  if (match) {
    if (/1|true|yes|y/.test(match[1])) {
      return true;
    } else if (/0|false|no|n/.test(match[1])) {
      return false;
    }
  }

  return null;
}

/**
 * Merge
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map Map}
 * objects.
 *
 * @template {Map} M
 * @param {M[]} maps
 * @returns {M}
 */
export function mergeMaps(maps) {
  return /** @type {M} */ (new Map(maps.flatMap((map) => [...map])));
}

/**
 * @typedef {object} PossiblyWithDate
 * @property {?Date} [date]
 */

/**
 * Get the oldest or newest item by the `date` property that is implied to exist.
 *
 * @template {PossiblyWithDate} T
 * @template {boolean} AD
 * @param {T[]} items
 * @param {'oldest'|'newest'} which
 * @param {AD} allowDateless
 * @returns {?(T & (AD extends false ? { date: Date } : {}))}
 */
export function genericGetOldestOrNewestByDateProp(items, which, allowDateless) {
  return /** @type {?(T & (AD extends false ? { date: Date } : {}))} */ (items.reduce(
    (candidate, item) =>
      (
        ((item.date || allowDateless) && !candidate) ||
        (
          candidate &&
          item.date &&
          (
            !candidate.date ||
            (which === 'oldest' ? item.date < candidate.date : item.date > candidate.date)
          )
        )
      ) ?
        item :
        candidate,
    /** @type {?T} */ (null)
  ));
}

/**
 * Get the keys of an object as an array of its own enumerable properties, with the keys properly
 * typed.
 *
 * @template {{}} T
 * @param {T} obj The object whose keys are to be retrieved.
 * @returns {(keyof T)[]} The keys of the object, typed as `keyof T`.
 */
export function typedKeysOf(obj) {
  // Why this isn't in the native Object.keys type:
  // https://stackoverflow.com/questions/55012174/why-doesnt-object-keys-return-a-keyof-type-in-typescript
  return /** @type {(keyof T)[]} */ (Object.keys(obj));
}

/**
 * Get the UNIX time of the moment that is `number` of days before now.
 *
 * @param {number} number
 * @returns {number}
 */
export function subtractDaysFromNow(number) {
  return Date.now() - number * cd.g.msInDay;
}
