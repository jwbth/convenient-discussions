/**
 * Web page (not wikitext) parsing module. Parsing here means "extracting meaningful parts from the
 * page". Functions that are more about modification of the DOM go in {@link module:modifyDom}.
 * Functions related to wikitext parsing go in {@link module:wikitext}.
 *
 * Here, we use vanilla JavaScript for recurring operations that together take up a lot of time.
 *
 * @module Parser
 */

import cd from './cd';
import { ElementsAndTextTreeWalker, ElementsTreeWalker } from './treeWalker';
import { defined, firstCharToUpperCase, flat, isInline, underlinesToSpaces } from './util';
import { generateCommentAnchor, parseTimestamp, registerCommentAnchor } from './timestamp';

let foreignComponentClasses;
let timezoneRegexp;
let signatureEndingRegexp;

/**
 * Get the page name from a URL.
 *
 * @param {string} url
 * @returns {?string}
 * @private
 */
function getPageNameFromUrl(url) {
  // Are only WMF wikis guaranteed to have the format we need?
  if (
    typeof mw === 'undefined' ||
    (mw.config.get('wgArticlePath') === '/wiki/$1' && mw.config.get('wgScript') === '/w/index.php')
  ) {
    let pageName = url
      .replace(/^(?:https?:)?\/\/[^/]+/, '')
      .replace(/^\/wiki\//, '')
      .replace(/^\/w\/index.php\?title=/, '')
      .replace(/&action=edit.*/, '')
      .replace(/#.*/, '')
      .replace(/_/g, ' ');
    try {
      pageName = decodeURIComponent(pageName);
    } catch (e) {
      return null;
    }
    return pageName;
  } else {
    let uri;
    try {
      uri = new mw.Uri(url);
    } catch (e) {
      return null;
    }
    const match = uri.path.match(cd.g.ARTICLE_PATH_REGEXP);
    if (match) {
      try {
        return decodeURIComponent(match[1]);
      } catch (e) {
        return null;
      }
    }
    return uri.query.title || null;
  }
}

/**
 * Get the user name from a link.
 *
 * @param {Element} element
 * @returns {string}
 * @private
 */
function getUserNameFromLink(element) {
  const href = element.getAttribute('href');
  let userName;
  if (href) {
    const pageName = getPageNameFromUrl(href);
    if (!pageName) {
      return null;
    }
    const match = pageName.match(cd.g.USER_NAMESPACES_REGEXP);
    if (match) {
      userName = match[1];
    } else if (pageName.startsWith(cd.g.CONTRIBS_PAGE + '/')) {
      userName = pageName.replace(cd.g.CONTRIBS_PAGE_LINK_REGEXP, '');
      if (cd.g.IS_IPv6_ADDRESS(userName)) {
        userName = userName.toUpperCase();
      }
    }
    userName = (
      userName &&
      firstCharToUpperCase(underlinesToSpaces(userName.replace(/\/.*/, ''))).trim()
    );
  } else {
    if (element.classList.contains('mw-selflink') && cd.g.CURRENT_NAMESPACE_NUMBER === 3) {
      // Comments of users that have only the user talk page link in their signature on their talk
      // page.
      userName = cd.g.CURRENT_PAGE_TITLE;
    } else {
      return null;
    }
  }
  return userName;
}

/**
 * Generalization of a page parser for the window and worker contexts.
 */
export default class Parser {
  /**
   * Create a page parser in the provided context.
   *
   * @param {object} context Collection of classes, functions, and other properties that perform the
   *   tasks we need in the current context (window or worker).
   */
  constructor(context) {
    this.context = context;

    if (!foreignComponentClasses) {
      foreignComponentClasses = ['cd-commentPart', ...cd.config.closedDiscussionClasses];
      if (cd.g.specialElements.pageHasOutdents) {
        foreignComponentClasses.push('outdent-template');
      }

      timezoneRegexp = new RegExp(cd.g.TIMEZONE_REGEXP.source + '\\s*$');

      if (cd.config.signatureEndingRegexp) {
        signatureEndingRegexp = new RegExp(cd.config.signatureEndingRegexp.source + '$');
      }
    }
  }

  /**
   * Create a comment instance.
   *
   * @param {Element} signature
   * @returns {*}
   */
  createComment(signature) {
    return new this.context.CommentClass(this, signature);
  }

  /**
   * Create a section instance.
   *
   * @param {Element} headingElement
   * @param {Promise} watchedSectionsRequest
   * @returns {*}
   */
  createSection(headingElement, watchedSectionsRequest) {
    return new this.context.SectionClass(this, headingElement, watchedSectionsRequest);
  }

  /**
   * @typedef {object} Timestamp
   * @property {Element} element
   * @property {Date} date
   */

  /**
   * @typedef {Timestamp[]} FindTimestampsReturn
   */

  /**
   * Find timestamps under the root element.
   *
   * @returns {FindTimestampsReturn}
   */
  findTimestamps() {
    const blocksToExclude = [
      ...Array.from(cd.g.rootElement.getElementsByTagName('blockquote')),
      ...flat(
        cd.config.elementsToExcludeClasses
          .map((className) => Array.from(cd.g.rootElement.getElementsByClassName(className)))
      ),
    ];

    return this.context.getAllTextNodes()
      .map((node) => {
        const text = node.textContent;
        const { date, match } = parseTimestamp(text) || {};
        if (date && !blocksToExclude.some((block) => block.contains(node))) {
          return { node, date, match };
        }
      })
      .filter(defined)
      .map((finding) => {
        const { node, match, date } = finding;
        const element = this.context.document.createElement('span');
        element.classList.add('cd-timestamp');
        const textNode = this.context.document.createTextNode(match[2]);
        element.appendChild(textNode);
        const remainedText = node.textContent.slice(match.index + match[0].length);
        let afterNode;
        if (remainedText) {
          afterNode = this.context.document.createTextNode(remainedText);
        }
        node.textContent = node.textContent.slice(0, match.index + match[1].length);
        node.parentNode.insertBefore(element, node.nextSibling);
        if (afterNode) {
          node.parentNode.insertBefore(afterNode, element.nextSibling);
        }
        return { element, date };
      });
  }

  /**
   * Find signatures under the root element given timestamps.
   *
   * Characters before the author link, like "—", aren't considered a part of the signature.
   *
   * @param {object[]} timestamps
   * @returns {object[]}
   */
  findSignatures(timestamps) {
    const signatures = timestamps
      .map((timestamp) => {
        const date = timestamp.date;
        const timestampElement = timestamp.element;
        const timestampText = timestamp.element.textContent;
        let unsignedElement;

        // If the closest not inline timestamp element ancestor has more than one signature, we
        // choose the last signature to consider it the signature of the comment author. There is no
        // point for us to parse them as distinct comments as a reply posted using our script will
        // go below all of them anyway.
        let closestNotInlineAncestor;
        for (let el = timestamp.element; !closestNotInlineAncestor; el = el.parentNode) {
          if (isInline(el)) {
            // Simultaneously check if we are inside an unsigned template.
            if (el.classList.contains(cd.config.unsignedClass)) {
              unsignedElement = el;
            }
          } else {
            closestNotInlineAncestor = el;
          }
        }
        const isUnsigned = Boolean(unsignedElement);

        if (closestNotInlineAncestor) {
          const cniaChildren = Array.from(
            closestNotInlineAncestor[this.context.childElementsProperty]
          );
          const treeWalker = new ElementsTreeWalker(timestamp.element);

          // Found other timestamp after this timestamp
          let found = false;

          while (
            !found &&
            treeWalker.nextNode() &&
            closestNotInlineAncestor.contains(treeWalker.currentNode) &&
            (!cniaChildren.includes(treeWalker.currentNode) || isInline(treeWalker.currentNode))
          ) {
            if (treeWalker.currentNode.classList.contains('cd-timestamp')) {
              found = true;
            }
          }
          if (found) return;
        }

        const startElement = unsignedElement || timestamp.element;
        const treeWalker = new ElementsAndTextTreeWalker(startElement);
        let authorName;
        let length = 0;
        let firstSignatureElement;
        const signatureNodes = [];
        if (unsignedElement) {
          firstSignatureElement = startElement;
        } else {
          signatureNodes.push(startElement);
          treeWalker.previousSibling();
        }

        // Unsigned template may be of the "undated" kind - containing a timestamp but no author
        // name, so we need to walk the tree anyway.
        do {
          const node = treeWalker.currentNode;
          length += node.textContent.length;
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.classList.contains('cd-timestamp')) break;
            let hasAuthorLinks = false;
            if (node.tagName === 'A') {
              const userName = getUserNameFromLink(node);
              if (userName) {
                if (!authorName) {
                  authorName = userName;
                }
                if (authorName === userName) {
                  // That's not some other user link that is not a part of the signature.
                  hasAuthorLinks = true;
                }
              }
            } else {
              const links = Array.from(node.getElementsByTagName('a')).reverse();
              links.some((link) => {
                const userName = getUserNameFromLink(link);
                if (userName) {
                  if (!authorName) {
                    authorName = userName;
                  }
                  if (authorName === userName) {
                    // That's not some other user link that is not a part of the signature.
                    hasAuthorLinks = true;
                    return true;
                  }
                }
              });
            }

            if (hasAuthorLinks) {
              firstSignatureElement = node;
            }
          }
          signatureNodes.push(node);

          // We may need using `previousNode()` here but currently the only known use case where it
          // helps is the "undated" templates when those are not marked by the class specificied in
          // the wiki configuration (which they should be).
        } while (treeWalker.previousSibling() && length < cd.config.signatureScanLimit);

        const firstSignatureElementIndex = signatureNodes.indexOf(firstSignatureElement);
        signatureNodes.splice(
          firstSignatureElementIndex === -1 ? 1 : firstSignatureElementIndex + 1
        );

        const anchor = generateCommentAnchor(timestamp.date, authorName, true);
        registerCommentAnchor(anchor);
        const signatureContainer = startElement.parentNode;
        const startElementNextSibling = startElement.nextSibling;
        const element = this.context.document.createElement('span');
        element.classList.add('cd-signature');
        signatureNodes
          .reverse()
          .forEach(element.appendChild.bind(element));
        signatureContainer.insertBefore(element, startElementNextSibling);

        // If there is no author, we add the class to prevent the element from being considered a
        // part of other comment but don't append to the list of signatures.
        if (!authorName) return;

        return { element, timestampElement, timestampText, date, authorName, anchor, isUnsigned };
      })
      .filter(defined);

    if (cd.config.unsignedClass) {
      Array.from(cd.g.rootElement.getElementsByClassName(cd.config.unsignedClass))
        .forEach((element) => {
          // Only templates with no timestamp interest us.
          if (!this.context.getElementByClassName(element, 'cd-timestamp')) {
            const links = Array.from(element.getElementsByTagName('a'));
            links.some((link) => {
              const authorName = getUserNameFromLink(link);
              if (authorName) {
                element.classList.add('cd-signature');
                const isUnsigned = true;
                signatures.push({ element, authorName, isUnsigned });
                return true;
              }
            });
          }
        });
    }

    // Sort signatures according to their position in the DOM. sig1 and sig2 are expected not to be
    // the same elements.
    signatures.sort((sig1, sig2) => this.context.follows(sig1.element, sig2.element) ? 1 : -1);

    return signatures;
  }

  /**
   * Collect the parts of the comment given a signature element.
   *
   * @param {Element} signatureElement
   * @returns {object[]}
   */
  collectParts(signatureElement) {
    const treeWalker = new ElementsAndTextTreeWalker(signatureElement);
    let parts = [];
    let firstForeignComponentAfter;

    // The code:
    // * Smth. [signature]
    // ** Smth.
    // *: Smth. [signature]
    // or
    // ** Smth. [signature]
    // ** Smth.
    // *: Smth. [signature]
    // produces a DOM where the second line is not a part of the first comment, but there is only
    // the first comment's signature in the DOM subtree related to the second line. We need to
    // acknowledge there is a foreign not inline element here to be able to tell comment boundaries
    // accurately (inline elements in most cases are continuations of the same comment).
    while (!firstForeignComponentAfter) {
      while (!treeWalker.currentNode.nextSibling && treeWalker.parentNode());
      if (!treeWalker.nextSibling()) break;
      if (!isInline(treeWalker.currentNode, true)) {
        firstForeignComponentAfter = treeWalker.currentNode;
      }
    }

    // As an optimization, avoid adding every text node of the comment to the array of its parts if
    // possible. Add their common container instead.
    if (
      (
        firstForeignComponentAfter &&
        signatureElement.parentNode.contains(firstForeignComponentAfter)
      ) ||

      // Cases when the comment has no wrapper that contains only that comment (for example,
      // https://ru.wikipedia.org/wiki/Википедия:Форум/Технический#202010140847_AndreiK). The second
      // parameter of getElementsByClassName() is an optimization for the worker context.
      signatureElement.parentNode.getElementsByClassName('cd-signature', 2).length > 1
    ) {
      // Collect inline parts after the signature
      treeWalker.currentNode = signatureElement;
      while (treeWalker.nextSibling()) {
        if (isInline(treeWalker.currentNode, true)) {
          parts.push({
            node: treeWalker.currentNode,
            isTextNode: treeWalker.currentNode.nodeType === Node.TEXT_NODE,
            isHeading: false,
            hasCurrentSignature: false,
            hasForeignComponents: false,
            lastStep: 'start',
          });
        } else {
          break;
        }
      }
      parts.reverse();

      treeWalker.currentNode = signatureElement;
    } else {
      treeWalker.currentNode = signatureElement.parentNode;
    }
    parts.push({
      node: treeWalker.currentNode,
      isTextNode: false,
      isHeading: false,
      hasCurrentSignature: true,
      hasForeignComponents: false,
      lastStep: 'start',
    });

    // 500 seems to be a safe enough value in case of any weird reasons for an infinite loop.
    for (let i = 0; i < 500; i++) {
      // lastStep may be:
      // * "start" (parts added at the beginning)
      // * "back" (go to the previous sibling)
      // * "up" (go to the parent element)
      // * "dive" (recursively go to the last not inline/text child)
      // * "replaced" (obtained as a result of manipulations after node traversal)
      let lastStep;
      const previousPart = parts[parts.length - 1];

      if (!previousPart.isTextNode && !previousPart.hasCurrentSignature) {
        // A simple check before we go: a timestamp or signature ending at the end of the line means
        // a foreign signature; nothing more to search for in that case.
        const text = previousPart.node.textContent;
        if (
          // Filter out additions to the end of a comment like:
          // https://ru.wikipedia.org/w/index.php?diff=107450915
          // https://ru.wikipedia.org/w/index.php?diff=107487558
          !isInline(previousPart.node, true) &&

          (timezoneRegexp.test(text) || signatureEndingRegexp?.test(text))
        ) {
          previousPart.hasForeignComponents = true;
          break;
        }
      }

      if (!previousPart.hasCurrentSignature && previousPart.hasForeignComponents) {
        // Here we dive to the bottom of the element subtree to find parts of the _current_ comment
        // that may be present. This happens with a code like this:
        // :* Smth. [signature]
        // :* Smth. <!-- The comment part that we need to grab while it's in the same element as the
        //               signature above. -->
        // :: Smth. [signature] <!-- The comment part we are at. -->

        // Get the last not inline child of the current node.
        let previousNode;
        let haveDived = false;
        while ((previousNode = treeWalker.currentNode) && treeWalker.lastChild()) {
          if (isInline(treeWalker.currentNode, true)) {
            treeWalker.currentNode = previousNode;
            break;
          }
          haveDived = true;
        }
        if (haveDived) {
          lastStep = 'dive';
        } else {
          break;
        }
      } else if (treeWalker.previousSibling()) {
        lastStep = 'back';
      } else {
        if (!treeWalker.parentNode()) break;
        lastStep = 'up';
      }

      const node = treeWalker.currentNode;
      const isTextNode = node.nodeType === Node.TEXT_NODE;

      /*
        Cases like:
          === Section title ===
          Section introduction. Not a comment.
          # Vote. [signature]
        Without the following code, the section introduction would be a part of the comment. The
        same may happen inside a discussion thread (often because one of the users didn't sign).
       */
      if (
        lastStep === 'back' &&
        ['OL', 'UL'].includes(previousPart.node.tagName) &&

        // Exceptions like https://ru.wikipedia.org/w/index.php?diff=105007602
        !(
          ['DL', 'OL', 'UL'].includes(node.tagName) ||
          (
            isTextNode &&
            node.previousSibling &&
            ['DL', 'OL', 'UL'].includes(node.previousSibling.tagName)
          )
        ) &&

        previousPart.node[this.context.childElementsProperty].length &&
        previousPart.node[this.context.childElementsProperty][0].contains(signatureElement)
      ) {
        break;
      }

      let isHeading = null;
      let hasCurrentSignature = null;
      let hasForeignComponents = null;
      if (!isTextNode) {
        if (
          foreignComponentClasses.some((className) => node.classList.contains(className)) ||
          node.getAttribute('id') === 'toc' ||
          node.tagName === 'TD' ||

          // Horizontal lines sometimes separate different section blocks.
          (
            node.tagName === 'HR' &&
            node.previousElementSibling &&
            this.context.getElementByClassName(node.previousElementSibling, 'cd-signature')
          ) ||

          (
            cd.g.specialElements.pageHasOutdents &&
            this.context.getElementByClassName(node, 'outdent-template')
          ) ||

          cd.config.checkForCustomForeignComponents?.(node, this.context)
        ) {
          break;
        }

        isHeading = /^H[1-6]$/.test(node.tagName);
        hasCurrentSignature = node.contains(signatureElement);

        // The second parameter of getElementsByClassName() is an optimization for the worker
        // context.
        const signaturesCount = (
          node.getElementsByClassName('cd-signature', Number(hasCurrentSignature) + 1).length
        );
        hasForeignComponents = (
          signaturesCount - Number(hasCurrentSignature) > 0 ||
          (firstForeignComponentAfter && node.contains(firstForeignComponentAfter))
        );
      }

      // We save all data related to the nodes on the path to reuse it.
      parts.push({
        node,
        isTextNode,
        isHeading,
        hasCurrentSignature,
        hasForeignComponents,
        lastStep,
      });

      if (isHeading) break;
    }

    return parts;
  }

  /**
   * Remove the comment parts that are inside of other parts.
   *
   * @param {object[]} parts
   * @returns {object[]}
   */
  removeNestedParts(parts) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      if (part.lastStep === 'up' && !part.hasForeignComponents) {
        let nextDiveElementIndex = 0;
        for (let j = i - 1; j > 0; j--) {
          if (parts[j].lastStep === 'dive') {
            nextDiveElementIndex = j;
            break;
          }
        }
        parts.splice(nextDiveElementIndex, i - nextDiveElementIndex);
        i = nextDiveElementIndex;
      }
    }

    return parts;
  }

  /**
   * Wrap the text and inline nodes into block elements.
   *
   * @param {object[]} parts
   * @param {Element} signatureElement
   * @returns {object[]}
   */
  encloseInlineParts(parts, signatureElement) {
    const sequencesToBeEnclosed = [];
    let start = null;
    let encloseThis = false;
    for (let i = 0; i <= parts.length; i++) {
      const part = parts[i];
      if (
        part &&
        (start === null || (['back', 'start'].includes(part.lastStep))) &&
        !part.hasForeignComponents &&
        !part.isHeading
      ) {
        if (start === null) {
          // Don't enclose nodes whose parent is an inline element.
          if (isInline(part.node.parentNode)) {
            for (let j = i + 1; j < parts.length; j++) {
              if (parts[j].lastStep === 'up') {
                i = j - 1;
                continue;
              }
            }
            break;
          } else {
            start = i;
          }
        }

        // We should only enclose if there is a need: there is at least one inline or non-empty text
        // node in the sequence.
        if (
          !encloseThis &&
          ((part.isTextNode && part.node.textContent.trim()) || isInline(part.node))
        ) {
          encloseThis = true;
        }
      } else {
        if (start !== null) {
          if (encloseThis) {
            const end = i - 1;
            sequencesToBeEnclosed.push({ start, end });
          }
          start = null;
          encloseThis = false;
        }
      }
    }

    for (let i = sequencesToBeEnclosed.length - 1; i >= 0; i--) {
      const sequence = sequencesToBeEnclosed[i];
      const wrapper = this.context.document.createElement('div');
      const nextSibling = parts[sequence.start].node.nextSibling;
      const parent = parts[sequence.start].node.parentNode;
      for (let j = sequence.end; j >= sequence.start; j--) {
        wrapper.appendChild(parts[j].node);
      }
      parent.insertBefore(wrapper, nextSibling);
      const newNode = {
        node: wrapper,
        isTextNode: false,
        isHeading: false,
        hasCurrentSignature: wrapper.contains(signatureElement),
        hasForeignComponents: false,
        lastStep: 'replaced',
      };
      parts.splice(sequence.start, sequence.end - sequence.start + 1, newNode);
    }

    return parts;
  }

  /**
   * Remove unnecessary and incorrect parts from the collection.
   *
   * @param {object[]} parts
   * @returns {object[]}
   */
  filterParts(parts) {
    parts = parts.filter((part) => !part.hasForeignComponents && !part.isTextNode);
    for (let i = parts.length - 1; i > 0; i--) {
      const part = parts[i];
      if (part.node.tagName === 'P' && !part.node.textContent.trim()) {
        parts.splice(i, 1);
      } else {
        break;
      }
    }

    return parts;
  }

  /**
   * Replace the list elements with collections of their items if appropriate.
   *
   * @param {object[]} parts
   * @param {Element} signatureElement
   * @returns {object[]}
   */
  replaceListsWithItems(parts, signatureElement) {
    const lastPart = parts[parts.length - 1];
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      if (
        // 'LI', 'DD' are in this list too for this kind of structures:
        // https://ru.wikipedia.org/w/index.php?diff=103584477.
        ['UL', 'DL', 'OL', 'LI', 'DD'].includes(part.node.tagName) &&
        // The check for 'DD' rescues us here:
        // https://ru.wikipedia.org/wiki/Википедия:Форум/Общий#201911201924_Vcohen.
        // The check for 'DL' rescues us here:
        // https://ru.wikipedia.org/wiki/Википедия:Форум/Общий#202003090945_Serhio_Magpie. The check
        // for 'P' rescues us here:
        // https://ru.wikipedia.org/wiki/Википедия:Форум/Правила#201910270736_S.m.46.
        // The check for "!parts[i + 1]..." rescues us here:
        // https://ru.wikipedia.org/wiki/Википедия:Технические_запросы#201912081049_Sunpriat.
        (
          (part.lastStep === 'up' && (!parts[i - 1] || parts[i - 1].lastStep !== 'back')) ||
          (
            (
              lastPart.node.tagName === 'DD' ||
              lastPart.node.parentNode.tagName === 'DD' ||
              lastPart.node.tagName === 'DL'
            ) &&
            !parts.slice(i + 1).some((part) => part.node.tagName === 'P')
          )
        )
      ) {
        // We ignore all spaces as an easy way to ignore only whitespace text nodes between element
        // nodes (this is a bad idea if we deal with inline nodes, but here we deal with lists).
        const partTextNoSpaces = part.node.textContent.replace(/\s+/g, '');

        let current = [part.node];
        let children;

        // With code like this:
        // * Smth. [signature]
        // :: Smth. [signature]
        // ...one comment (preceded by :: in this case) creates its own list tree, not a subtree,
        // even though it's a reply to a reply. So we dive to the bottom of the hierarchy of nested
        // lists to get the bottom node (and therefore draw the comment layers more neatly). One of
        // the most complex tree structures is this:
        // * Smth. [signature]
        // :* Smth.
        // :: Smth. [signature]
        // (seen here:
        // https://ru.wikipedia.org/w/index.php?title=Википедия:Форум/Общий&oldid=103760740#201912010211_Mikhail_Ryazanov)
        // It has a branchy structure that requires a tricky algorithm to be parsed correctly.
        do {
          children = current.reduce(
            (arr, element) => arr.concat(Array.from(element[this.context.childElementsProperty])),
            []
          );
        } while (
          children.length &&
          children.every((child) => ['UL', 'DL', 'OL', 'LI', 'DD'].includes(child.tagName)) &&
          (
            children.map((child) => child.textContent).join('').replace(/\s+/g, '') ===
            partTextNoSpaces
          ) &&
          (current = children)
        );

        if (current.length > 1) {
          const newParts = current.map((el) => ({
            node: el,
            isTextNode: false,
            hasCurrentSignature: el.contains(signatureElement),
            hasForeignComponents: false,
            lastStep: 'replaced',
          }));
          parts.splice(i, 1, ...newParts);
        } else if (current[0] !== part.node) {
          Object.assign(part, {
            node: current[0],
            lastStep: 'replaced',
          });
        }
      }
    }

    return parts;
  }

  /**
   * Get the ".cd-commentLevel" elements up the DOM tree.
   *
   * @param {Element} initialElement
   * @returns {Element[]}
   */
  getLevelsUpTree(initialElement) {
    const levelElements = [];
    const treeWalker = new ElementsTreeWalker(initialElement);
    while (treeWalker.parentNode()) {
      const el = treeWalker.currentNode;
      if (['UL', 'DL', 'OL'].includes(el.tagName)) {
        if (el.classList.contains('cd-commentLevel')) {
          const classAttr = el.getAttribute('class');
          const match = classAttr.match(/cd-commentLevel-(\d+)/);
          if (match) {
            levelElements.unshift(...Array(Number(match[1])));
          }
          return levelElements;
        } else {
          levelElements.unshift(el);
        }
      }
    }
    return levelElements;
  }

  /**
   * Get all headings on the page.
   *
   * @returns {Element[]}
   */
  // The worker context doesn't support .querySelector(), so we have to use .getElementsByTagName().
  findHeadings() {
    const headings = [
      ...cd.g.rootElement.getElementsByTagName('h1'),
      ...cd.g.rootElement.getElementsByTagName('h2'),
      ...cd.g.rootElement.getElementsByTagName('h3'),
      ...cd.g.rootElement.getElementsByTagName('h4'),
      ...cd.g.rootElement.getElementsByTagName('h5'),
      ...cd.g.rootElement.getElementsByTagName('h6'),
    ];
    headings.sort((heading1, heading2) => this.context.follows(heading1, heading2) ? 1 : -1);
    return headings;
  }
}

/**
 * Get all text nodes under the root element in the window (not worker) context.
 *
 * @returns {Node[]}
 */
export function windowGetAllTextNodes() {
  const result = document.evaluate(
    // './/text()' doesn't work in Edge.
    './/descendant::text()',
    cd.g.rootElement,
    null,
    XPathResult.ANY_TYPE,
    null
  );
  const textNodes = [];
  let node;
  while ((node = result.iterateNext())) {
    textNodes.push(node);
  }
  return textNodes;
}

/**
 * Find some types of special elements on the page (floating elements, closed discussions, outdent
 * templates).
 *
 * @returns {object}
 */
export function findSpecialElements() {
  // Describe all floating elements on the page in order to calculate the right border (temporarily
  // setting "overflow: hidden") for all comments that they intersect with.
  const floatingElementsSelector = [
    ...cd.g.FLOATING_ELEMENTS_SELECTORS,
    ...cd.config.customFloatingElementsSelectors,
  ]
    .join(', ');
  const floating = cd.g.$root
    .find(floatingElementsSelector)
    .get()
    // Remove all known elements that never intersect comments from the collection.
    .filter((el) => !el.classList.contains('cd-ignoreFloating'));
  floating.forEach((el) => {
    const style = window.getComputedStyle(el);
    el.cdMarginTop = parseFloat(style.marginTop);
    el.cdMarginBottom = parseFloat(style.marginBottom);
  });

  const closedDiscussionsSelector = cd.config.closedDiscussionClasses
    .map((name) => `.${name}`)
    .join(', ');
  const closedDiscussions = cd.g.$root.find(closedDiscussionsSelector).get();

  const pageHasOutdents = Boolean(cd.g.$root.find('.outdent-template').length);

  return { floating, closedDiscussions, pageHasOutdents };
}
