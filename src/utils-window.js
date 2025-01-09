/**
 * Utilities for the window context. DOM, rendering, visual effects, user input, etc.
 *
 * @module utilsWindow
 */

import Button from './Button';
import ElementsTreeWalker from './ElementsTreeWalker';
import Parser from './Parser';
import cd from './cd';
import { parseWikiUrl, isInline, defined, spacesToUnderlines } from './utils-general';

/**
 * @typedef {Record<string, () => void>} WrapCallbacks
 */

/**
 * Wrap a HTML string into a `<span>` (or other element) suitable as an argument for various
 * methods. It fills the same role as
 * {@link https://doc.wikimedia.org/oojs-ui/master/js/OO.ui.HtmlSnippet.html OO.ui.HtmlSnippet}, but
 * works not only with OOUI widgets. Optionally, attach callback functions and `target="_blank"`
 * attribute to links with the provided class names. See also
 * {@link mergeJquery}.
 *
 * @param {string} html
 * @param {object} [options={}]
 * @param {WrapCallbacks} [options.callbacks]
 * @param {string} [options.tagName='span']
 * @param {boolean} [options.targetBlank]
 * @returns {JQuery}
 */
export function wrapHtml(html, options = {}) {
  const tagName = options.tagName || 'span';
  const $wrapper = $($.parseHTML(html)).wrapAll(`<${tagName}>`).parent();
  const callbacks = options.callbacks;
  if (callbacks) {
    Object.keys(callbacks).forEach((className) => {
      const $linkWrapper = $wrapper.find(`.${className}`);
      let $link = /** @type {JQuery} */ ($linkWrapper.find('a'));
      const href = $link.attr('href');
      if (href && /\$\d$/.test(href)) {
        // Handle dummy links we put into strings for translation so that translators understand
        // this will be a link.
        $link.removeAttr('href').removeAttr('title');
      } else if (!$link.length) {
        $link = $linkWrapper.wrapInner('<a>').children().first();
      }
      new Button({
        buttonElement: $link[0],
        action: callbacks[className],
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
  const className = [
    'diff',
    mw.user.options.get('editfont') === 'monospace' ? 'diff-editfont-monospace' : undefined,
    'diff-contentalign-' + (cd.g.contentDirection === 'ltr' ? 'left' : 'right'),
  ].filter(defined).join(' ');
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
  if (!document.activeElement) {
    return false;
  }

  const $active = $(document.activeElement);
  return $active.is(':input') || $active.prop('isContentEditable');
}

/**
 * @typedef {object} ExtendedDOMRect
 * @property {number} top
 * @property {number} bottom
 * @property {number} left
 * @property {number} right
 * @property {number} outerTop
 * @property {number} outerBottom
 * @property {number} outerLeft
 * @property {number} outerRight
 */

/**
 * @typedef {DOMRect|ExtendedDOMRect} AnyDOMRect
 */

/**
 * Get the bounding client rectangle of an element, setting values that include margins to the
 * `outerTop`, `outerBottom`, `outerLeft`, and `outerRight` properties. The margins are cached.
 *
 * @param {Element} el
 * @returns {ExtendedDOMRect}
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

  return $.extend({
    outerTop: rect.top - (isVisible ? el.cdMarginTop : 0),
    outerBottom: rect.bottom + (isVisible ? el.cdMarginBottom : 0),
    outerLeft: rect.left - (isVisible ? el.cdMarginLeft : 0),
    outerRight: rect.right + (isVisible ? el.cdMarginRight : 0),
  }, rect);
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
 * @param {JQuery.KeyDownEvent|KeyboardEvent} event
 * @param {number} keyCode
 * @param {Array.<'cmd' | 'shift' | 'alt' | 'meta' | 'ctrl'>} [modifiers=[]] Use `'cmd'` instead of
 *   `'ctrl'` to capture both Windows and Mac machines.
 * @returns {boolean}
 */
export function keyCombination(event, keyCode, modifiers = []) {
  if (modifiers.includes('cmd')) {
    modifiers.splice(
      modifiers.indexOf('cmd'),
      1,

      // In Chrome on Windows, e.metaKey corresponds to the Windows key, so we better check for a
      // platform.
      $.client.profile().platform === 'mac' ? 'meta' : 'ctrl'
    );
  }
  return (
    event.keyCode === keyCode &&
    ['ctrl', 'shift', 'alt', 'meta'].every(
      (/** @type {keyof modifiers} */ mod) => modifiers.includes(mod) === event[mod + 'Key']
    )
  );
}

/**
 * Whether a command modifier is pressed. On Mac, this means the Cmd key. On Windows, this means the
 * Ctrl key.
 *
 * @param {MouseEvent | KeyboardEvent} event
 * @returns {boolean}
 */
export function isCmdModifierPressed(event) {
  // In Chrome on Windows, e.metaKey corresponds to the Windows key, so we better check for a
  // platform.
  return $.client.profile().platform === 'mac' ? event.metaKey : event.ctrlKey;
}

/**
 * Get elements using the right selector for the current skin given an object with skin names as
 * keys and selectors as values. If no value for the skin is provided, the `default` value is used.
 *
 * @param {StringsByKey} selectors
 * @returns {JQuery}
 */
export function skin$(selectors) {
  return $(selectors[cd.g.skin] || selectors.default || selectors.vector);
}

/**
 * Get the footer element.
 *
 * @returns {JQuery}
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
    selection.anchorNode.compareDocumentPosition(/** @type {Node} */ (selection.focusNode)) &
    Node.DOCUMENT_POSITION_FOLLOWING
  );

  return {
    higherNode: isAnchorHigher ? selection.anchorNode : selection.focusNode,
    higherOffset: isAnchorHigher ? selection.anchorOffset : selection.focusOffset,
  };
}

/**
 * @typedef {object} SuccessAndFailMessages
 * @property {string|JQuery} messages.success Success message.
 * @property {string|JQuery} messages.fail Fail message.
 */

/**
 * @overload
 * @param {string} text Text to copy.
 * @param {SuccessAndFailMessages} messages
 * @returns {void}
 *
 * @overload
 * @param {string} text Text to copy.
 * @returns {boolean}
 */

/**
 * Copy text and notify whether the operation was successful.
 *
 * @param {string} text Text to copy.
 * @param {SuccessAndFailMessages} [messages]
 * @returns {boolean|undefined}
 * @private
 */
export function copyText(text, messages) {
  const $textarea = $('<textarea>')
    .val(text)
    .appendTo(document.body)
    .select();
  const successful = document.execCommand('copy');
  $textarea.remove();

  if (messages) {
    if (text && successful) {
      mw.notify(messages.success);
    } else {
      mw.notify(messages.fail, { type: 'error' });
    }
  } else {
    return successful;
  }
}

/**
 * Check whether there is something in the HTML that can be converted to wikitext.
 *
 * @param {string} html
 * @param {HTMLElement} containerElement
 * @returns {boolean}
 */
export function isHtmlConvertibleToWikitext(html, containerElement) {
  return isElementConvertibleToWikitext(
    cleanUpPasteDom(
      getElementFromPasteHtml(html),
      containerElement
    ).element
  );
}

/**
 * Check whether there is something in the element that can be converted to wikitext.
 *
 * @param {Element} element
 * @returns {boolean}
 */
export function isElementConvertibleToWikitext(element) {
  return Boolean(
    element.childElementCount &&
    !(
      [...element.querySelectorAll('*')].length === 1 &&
      element.childNodes.length === 1 &&
      ['P', 'LI', 'DD'].includes(element.children[0].tagName)
    ) &&
    ![...element.querySelectorAll('*')].every((el) => el.tagName === 'BR')
  );
}

/**
 * @typedef {object} CleanUpPasteDomReturn
 * @property {HTMLElement} element
 * @property {string} text
 * @property {(string|undefined)[]} syntaxHighlightLanguages
 */

/**
 * Clean up the contents of an element created based on the HTML code of a paste.
 *
 * @param {HTMLElement} element
 * @param {HTMLElement} containerElement
 * @returns {CleanUpPasteDomReturn}
 */
export function cleanUpPasteDom(element, containerElement) {
  // Get all styles (such as `user-select: none`) from classes applied when the element is added
  // to the DOM. If HTML is retrieved from a paste, this is not needed (styles are added to
  // elements themselves in the text/html format), but won't hurt.
  element.className = 'cd-commentForm-dummyElement';
  containerElement.appendChild(element);

  [...element.querySelectorAll('[style]:not(pre [style])')]
    .forEach((/** @type {HTMLElement} */ el) => {
      if (el.style.textDecoration === 'underline' && !['U', 'INS', 'A'].includes(el.tagName)) {
        $(el).wrapInner('<u>');
      }
      if (el.style.textDecoration === 'line-through' && !['STRIKE', 'S', 'DEL'].includes(el.tagName)) {
        $(el).wrapInner('<s>');
      }
      if (el.style.fontStyle === 'italic' && !['I', 'EM'].includes(el.tagName)) {
        $(el).wrapInner('<i>');
      }
      if (['bold', '700'].includes(el.style.fontWeight) && !['B', 'STRONG'].includes(el.tagName)) {
        $(el).wrapInner('<b>');
      }
      el.removeAttribute('style');
    });

  const removeElement = (/** @type {Element} */ el) => el.remove();
  const replaceWithChildren = (/** @type {Element} */ el) => {
    if (
      ['DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DD'].includes(el.tagName) &&
      (
        el.nextElementSibling ||

        // Cases like "<div><div>Quote</div>Text</div>", e.g. created by
        // https://ru.wikipedia.org/wiki/Template:Цитата_сообщения
        el.nextSibling?.textContent?.trim()
      )
    ) {
      el.after('\n');
    }
    el.replaceWith(...el.childNodes);
  };

  [...element.querySelectorAll('*')]
    .filter((el) => window.getComputedStyle(el).userSelect === 'none')
    .forEach(removeElement);

  // Should run after removing elements with `user-select: none`, to remove their wrappers that
  // now have no content.
  [...element.querySelectorAll('*')]
    // Need to keep non-breaking spaces.
    .filter((el) => (
      (!isInline(el) || el.classList.contains('Apple-interchange-newline')) &&
      !el.textContent.replace(/[ \n]+/g, ''))
    )

    .forEach(removeElement);

  [...element.querySelectorAll('style')]
    .forEach(removeElement);

  const topElements = Parser.prototype.getTopElementsWithText.call(
    { context: { childElementsProp: 'children' } },
    element,
    true
  ).nodes;
  if (topElements[0] !== element) {
    element.innerHTML = '';
    element.append(...topElements);
  }

  [...element.querySelectorAll('code.mw-highlight')].forEach((el) => {
    // eslint-disable-next-line no-self-assign
    el.textContent = el.textContent;
  });

  const syntaxHighlightLanguages = [...element.querySelectorAll('pre, code')].map((el) => (
    (
      (el.tagName === 'PRE' ? /** @type {HTMLElement} */ (el.parentElement) : el).className
        .match('mw-highlight-lang-([0-9a-z_-]+)') ||
      []
    )[1]
  ));

  [...element.querySelectorAll('div, span, h1, h2, h3, h4, h5, h6')]
    .forEach(replaceWithChildren);
  [...element.querySelectorAll('p > br')]
    .forEach((el) => {
      el.after('\n');
      el.remove();
    });

  // This will turn links to unexistent pages to actual red links. Should be above the removal of
  // classes.
  [...element.querySelectorAll('a')]
    .filter((el) => el.classList.contains('new'))
    .forEach((el) => {
      const href = el.getAttribute('href');
      if (!href) return;

      const urlData = parseWikiUrl(href);
      if (urlData && urlData.hostname === location.hostname) {
        el.setAttribute('href', mw.util.getUrl(urlData.pageName));
      }
    });

  const allowedTags = cd.g.allowedTags.concat('a', 'center', 'big', 'strike', 'tt');
  [...element.querySelectorAll('*')]
    .forEach((el) => {
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

  [...element.children]
    // <dd>s out of <dl>s are likely comment parts that should not create `:` markup. (Bare <li>s
    // don't create `*` markup in the API.)
    .filter((el) => el.tagName === 'DD')

    .forEach(replaceWithChildren);

  getAllTextNodes(element)
    .filter((node) => /** @type {HTMLElement} */ (node.parentElement).tagName !== 'PRE')
    .forEach((node) => {
      // Firefox adds newlines of unclear nature
      node.textContent = node.textContent.replace(/\n/g, ' ');
    });

  // Need to do it before removing the element; if we do it later, the literal textual content of
  // the elements equivalent to .textContent will be used instead of the rendered appearance.
  const text = element.innerText;

  element.remove();

  return { element, text, syntaxHighlightLanguages };
}

/**
 * Turn HTML code of a paste into an element.
 *
 * @param {string} html
 * @returns {HTMLElement}
 */
export function getElementFromPasteHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html
    .replace(/^[^]*<!-- *StartFragment *-->/, '')
    .replace(/<!-- *EndFragment *-->[^]*$/, '');
  return div;
}

/**
 * Get all nodes between the two specified, including them. This works equally well if they are at
 * different nesting levels. Descendants of nodes that are already included are not included.
 *
 * For simplicity, consider the results `HTMLElement`s – we have yet to encounter a case where one
 * of the elements in a range is simply an `Element`.
 *
 * @param {HTMLElement} start
 * @param {?HTMLElement} end
 * @param {HTMLElement} rootElement
 * @returns {?HTMLElement[]}
 */
export function getRangeContents(start, end, rootElement) {
  // It makes more sense to place this function in the `utils` module, but we can't import
  // `controller` there because of issues with the worker build and a cyclic dependency that
  // emerges.

  // Fight infinite loops
  if (!end || (start.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_PRECEDING)) {
    return null;
  }

  let commonAncestor;
  for (let el = /** @type {?HTMLElement} */ (start); el; el = el.parentElement) {
    if (el.contains(end)) {
      commonAncestor = el;
      break;
    }
  }

  /*
    Here we should equally account for all cases of the start and end item relative position.

      <ul>         <!-- Say, may start anywhere from here... -->
        <li></li>
        <li>
          <div></div>
        </li>
        <li></li>
      </ul>
      <div></div>  <!-- ...to here. And, may end anywhere from here... -->
      <ul>
        <li></li>
        <li>
          <div></div>
        </li>
        <li></li>  <-- ...to here. -->
      </ul>
  */
  const rangeContents = [start];

  // The start container could contain the end container and be different from it in the case with
  // adjusted end items.
  if (!start.contains(end)) {
    const treeWalker = new ElementsTreeWalker(rootElement, start);

    while (treeWalker.currentNode.parentNode !== commonAncestor) {
      while (treeWalker.nextSibling()) {
        rangeContents.push(treeWalker.currentNode);
      }
      treeWalker.parentNode();
    }
    treeWalker.nextSibling();
    while (!treeWalker.currentNode.contains(end)) {
      rangeContents.push(treeWalker.currentNode);
      treeWalker.nextSibling();
    }

    // This step fixes some issues with .cd-connectToPreviousItem like wrong margins below the
    // expand note of the comment
    // https://commons.wikimedia.org/w/index.php?title=User_talk:Jack_who_built_the_house/CD_test_page&oldid=678031044#c-Example-2021-10-02T05:14:00.000Z-Example-2021-10-02T05:13:00.000Z
    // if you collapse its thread.
    let parent;
    while (
      (parent = end.parentElement) &&
      parent &&
      parent.lastChild === end &&
      treeWalker.currentNode.contains(parent)
    ) {
      end = parent;
    }

    while (treeWalker.currentNode !== end) {
      treeWalker.firstChild();
      while (!treeWalker.currentNode.contains(end)) {
        rangeContents.push(treeWalker.currentNode);
        treeWalker.nextSibling();
      }
    }
    rangeContents.push(end);
  }

  return rangeContents;
}

/**
 * Create a `<svg>` element.
 *
 * @param {number} width
 * @param {number} height
 * @param {number} [viewBoxWidth=width]
 * @param {number} [viewBoxHeight=height]
 * @returns {JQuery<SVGElement>}
 */
export function createSvg(width, height, viewBoxWidth = width, viewBoxHeight = height) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

  return $(svg)
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${viewBoxWidth} ${viewBoxHeight}`)
    .attr('aria-hidden', 'true')

    // https://en.wikipedia.org/wiki/Project:Dark_mode_(gadget)
    .addClass('mw-invert');
}

/**
 * Get all text nodes under the root element in the window (not worker) context.
 *
 * @param {Element} rootNode
 * @returns {Text[]}
 * @private
 */
export function getAllTextNodes(rootNode) {
  const treeWalker = document.createNodeIterator(rootNode, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while ((node = /** @type {?Text} */ (treeWalker.nextNode()))) {
    nodes.push(node);
  }

  return nodes;
}

/**
 * Check if an anchor is existent on the page (in an element ID or the `name` of an `<a>` element).
 *
 * @param {string} anchor
 * @param {boolean} [isWikilink=false] The anchor is part of a wikilink string (e.g. [[#test
 *   test]]). If so, we will replace spaces with underlines.
 * @returns {?boolean}
 */
export function isExistentAnchor(anchor, isWikilink = false) {
  if (!anchor) {
    return null;
  }

  if (isWikilink) {
    anchor = spacesToUnderlines(anchor);
  }
  const escaped = CSS.escape(anchor);

  return Boolean($(`*[id="${escaped}"], a[name="${escaped}"]`).length);
}

/**
 * Merge many jQuery objects into one. Works like {@link https://api.jquery.com/add/ .add()}, but
 * accepts many parameters and is faster. Unlike `.add()`, only accepts jQuery objects though and
 * doesn't reorder elements based on their relative position in the DOM.
 *
 * @param {Array.<JQuery|undefined>} arrayOfJquery jQuery objects. Undefined values will be
 *   omitted.
 * @returns {JQuery} jQuery
 */
export function mergeJquery(...arrayOfJquery) {
  return $($.map(arrayOfJquery.filter(defined), ($object) => $object.get()));
}
