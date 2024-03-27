import Button from './Button';
import cd from './cd';
import { removeFromArrayIfPresent } from './utils';

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
        element: $link[0],
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
 * Check if an input or editable element is focused.
 *
 * @returns {boolean}
 */
export function isInputFocused() {
  const $active = $(document.activeElement);
  return $active.is(':input') || $active.prop('isContentEditable');
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
