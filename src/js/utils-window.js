import Button from './Button';
import Parser from './Parser';
import cd from './cd';
import { ElementsTreeWalker } from './treeWalker';
import { removeFromArrayIfPresent } from './utils-general';

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

/**
 * Check whether there is something in the HTML to convert to wikitext.
 *
 * @param {string} html
 * @param {Element} rootElement
 * @returns {boolean}
 */
export function isConvertibleToWikitext(html, rootElement) {
  return processPasteDom(getElementFromPasteHtml(html), rootElement).isConvertible;
}

/**
 * Clean up the contents of an element created based on the HTML code of a paste and returns
 * 1. whether there is something in the HTML to convert to wikitext;
 * 2. HTML;
 * 3. wikitext.
 *
 * @param {Element} div
 * @param {Element} rootElement
 * @returns {object}
 */
export function processPasteDom(div, rootElement) {
  // Get all styles (such as `user-select: none`) from classes applied when the element is added
  // to the DOM. If HTML is retrieved from a paste, this is not needed (styles are added to
  // elements themselves in the text/html format), but won't hurt.
  div.className = 'cd-hidden';
  rootElement.appendChild(div);

  [...div.querySelectorAll('[style]')].forEach((el) => {
    el.removeAttribute('style');
  });

  const removeElement = (el) => el.remove();
  const replaceWithChildren = (el) => {
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

  [...div.querySelectorAll('*')]
    .filter((el) => window.getComputedStyle(el).userSelect === 'none')
    .forEach(removeElement);

  // Should run after removing elements with `user-select: none`, to remove their wrappers that
  // now have no content.
  [...div.querySelectorAll('*')]
    // Need to keep non-breaking spaces.
    .filter((el) => (
      (
        !['BR', 'HR'].includes(el.tagName) ||
        el.classList.contains('Apple-interchange-newline')
      ) &&
      !el.textContent.replace(/[ \n]+/g, ''))
    )

    .forEach(removeElement);

  [...div.querySelectorAll('style')].forEach(removeElement);

  const topElements = new Parser({ childElementsProp: 'children' })
    .getTopElementsWithText(div, true).nodes;
  if (topElements[0] !== div) {
    div.innerHTML = '';
    div.append(...topElements);
  }

  [...div.querySelectorAll('div, span, h1, h2, h3, h4, h5, h6')].forEach(replaceWithChildren);
  [...div.querySelectorAll('p > br')].forEach((el) => {
    el.after('\n');
    el.remove();
  });

  const allowedTags = cd.g.allowedTags.concat('a', 'center', 'big', 'strike', 'tt');
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

  div.remove();

  return {
    isConvertible: Boolean(
      div.childElementCount &&
      !(
        [...div.querySelectorAll('*')].length === 1 &&
        div.childNodes.length === 1 &&
        ['P', 'LI', 'DD'].includes(div.childNodes[0].tagName)
      )
    ),
    html: div.innerHTML,
    text: div.innerText,
  };
}

/**
 * Turn HTML code of a paste into an element.
 *
 * @param {string} html
 * @returns {Element}
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
 * @param {Element} start
 * @param {Element} end
 * @returns {Element[]}
 */
export function getRangeContents(start, end) {
  // It makes more sense to place this function in the `utils` module, but we can't import
  // `controller` there because of issues with the worker build and a cyclic dependency that
  // emerges.

  // Fight infinite loops
  if (start.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_PRECEDING) return;

  let commonAncestor;
  for (let el = start; el; el = el.parentNode) {
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
    const treeWalker = new ElementsTreeWalker(start, this.rootElement);

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

    // This step fixes some issues with `.cd-connectToPreviousItem` like wrong margins below the
    // expand note of the comment
    // https://commons.wikimedia.org/w/index.php?title=User_talk:Jack_who_built_the_house/CD_test_page&oldid=678031044#c-Example-2021-10-02T05:14:00.000Z-Example-2021-10-02T05:13:00.000Z
    // if you collapse its thread.
    while (end.parentNode.lastChild === end && treeWalker.currentNode.contains(end.parentNode)) {
      end = end.parentNode;
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
