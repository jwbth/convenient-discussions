/**
 * DOM modification functions.
 *
 * @module modifyDom
 */

import cd from './cd';

/**
 * Replace an element with an identical one but with another tag name, i.e. move all child nodes,
 * attributes, and some bound events to a new node, and also reassign references in some variables
 * and properties to this element. Unfortunately, we can't just change the element's `tagName` to do
 * that.
 *
 * Not a pure function; it alters `firstVisibleElementData`.
 *
 * @param {Element} element
 * @param {string} newType
 * @param {object|undefined} firstVisibleElementData
 * @returns {Element}
 * @private
 */
function changeElementType(element, newType, firstVisibleElementData) {
  const newElement = document.createElement(newType);
  while (element.firstChild) {
    newElement.appendChild(element.firstChild);
  }
  Array.from(element.attributes).forEach((attribute) => {
    newElement.setAttribute(attribute.name, attribute.value);
  });

  // If this element is a part of a comment, replace it in the Comment object instance.
  let commentId = element.getAttribute('data-comment-id');
  if (commentId !== null) {
    commentId = Number(commentId);
    cd.comments[commentId].replaceElement(element, newElement);
  } else {
    element.parentNode.replaceChild(newElement, element);
  }

  if (firstVisibleElementData && element === firstVisibleElementData.element) {
    firstVisibleElementData.element = newElement;
  }

  return newElement;
}

/**
 * Combine two adjacent ".cd-commentLevel" elements into one, recursively going deeper in terms of
 * the nesting level.
 *
 * @param {object|undefined} firstVisibleElementData
 * @private
 */
function mergeAdjacentCommentLevels(firstVisibleElementData) {
  const levels = (
    cd.g.rootElement.querySelectorAll('.cd-commentLevel:not(ol) + .cd-commentLevel:not(ol)')
  );
  if (!levels.length) return;

  const isOrHasCommentLevel = (el) => (
    (el.classList.contains('cd-commentLevel') && el.tagName !== 'OL') ||
    el.querySelector('.cd-commentLevel:not(ol)')
  );

  Array.from(levels).forEach((bottomElement) => {
    const topElement = bottomElement.previousElementSibling;
    // If the previous element was removed in this cycle. (Or it could be absent for some other
    // reason? I can confirm that I witnessed a case where the element was absent, but didn't pay
    // attention why unfortunately.)
    if (!topElement) return;
    let currentTopElement = topElement;
    let currentBottomElement = bottomElement;
    do {
      const topTag = currentTopElement.tagName;
      const bottomInnerTags = {};
      if (topTag === 'UL') {
        bottomInnerTags.DD = 'LI';
      } else if (topTag === 'DL') {
        bottomInnerTags.LI = 'DD';
      }

      let firstMoved;
      if (isOrHasCommentLevel(currentTopElement)) {
        while (currentBottomElement.childNodes.length) {
          let child = currentBottomElement.firstChild;
          if (child.nodeType === Node.ELEMENT_NODE) {
            if (bottomInnerTags[child.tagName]) {
              child = changeElementType(
                child,
                bottomInnerTags[child.tagName],
                firstVisibleElementData
              );
            }
            if (firstMoved === undefined) {
              firstMoved = child;
            }
          } else {
            if (firstMoved === undefined && child.textContent.trim()) {
              // Don't fill the "firstMoved" variable which is used further to merge elements if
              // there is a non-empty text node between. (An example that is now fixed:
              // https://ru.wikipedia.org/wiki/Википедия:Форум/Архив/Викиданные/2018/1_полугодие#201805032155_NBS,
              // but other can be on the loose.) Instead, wrap the text node into an element to
              // prevent it from being ignored when searching next time for adjacent .commentLevel
              // elements. This could be seen only as an additional precaution, since it doesn't fix
              // the source of the problem: the fact that a bare text node is (probably) a part of
              // the reply. It shouldn't be happening.
              firstMoved = null;
              const newChild = document.createElement('span');
              newChild.appendChild(child);
              child = newChild;
            }
          }
          currentTopElement.appendChild(child);
        }
        currentBottomElement.parentNode.removeChild(currentBottomElement);
      }

      currentBottomElement = firstMoved;
      currentTopElement = firstMoved?.previousElementSibling;
    } while (
      currentTopElement &&
      currentBottomElement &&
      isOrHasCommentLevel(currentBottomElement)
    );
  });
}

/**
 * Perform some DOM-related taskes after parsing comments.
 *
 * @param {object|undefined} firstVisibleElementData
 */
export function adjustDom(firstVisibleElementData) {
  mergeAdjacentCommentLevels(firstVisibleElementData);
  mergeAdjacentCommentLevels(firstVisibleElementData);
  if (cd.g.rootElement.querySelector('.cd-commentLevel:not(ol) + .cd-commentLevel:not(ol)')) {
    console.warn('.cd-commentLevel adjacencies have left.');
  }

  $('dl').has('dt').each((i, element) => {
    Array.from(element.classList)
      .filter((className) => className.startsWith('cd-commentLevel'))
      .forEach((className) => element.classList.remove(className));
  });
}
