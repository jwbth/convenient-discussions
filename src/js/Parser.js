/**
 * Web page (not wikitext) parsing class. Parsing here means "extracting meaningful parts from the
 * page". Functions related to wikitext parsing go in {@link module:wikitext}.
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
let elementsToExclude;

/**
 * Get a page name from a URL.
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
    let title = uri.query.title;
    if (typeof title === 'object') {
      title = title[title.length - 1];
    }
    return title || null;
  }
}

/**
 * @typedef {object} ProcessLinkReturn
 * @param {string} 1 User name.
 * @param {?string} 2 Link type (`user`, `userTalk`, `contribs`, `userSubpage`, `userTalkSubpage`).
 * @private
 */

/**
 * _For internal use._ Get a user name from a link, along with some other data about a page name.
 *
 * @param {Element|external:Element} element
 * @returns {?ProcessLinkReturn}
 */
export function processLink(element) {
  const href = element.getAttribute('href');
  let userName;
  let linkType = null;
  if (href) {
    const pageName = getPageNameFromUrl(href);
    if (!pageName) {
      return null;
    }
    const match = pageName.match(cd.g.USER_NAMESPACES_REGEXP);
    if (match) {
      userName = match[1];
      if (cd.g.USER_LINK_REGEXP.test(pageName)) {
        linkType = 'user';
      } else if (cd.g.USER_TALK_LINK_REGEXP.test(pageName)) {
        linkType = 'userTalk';
      } else if (cd.g.USER_SUBPAGE_LINK_REGEXP.test(pageName)) {
        linkType = 'userSubpage';
      } else if (cd.g.USER_TALK_SUBPAGE_LINK_REGEXP.test(pageName)) {
        linkType = 'userTalkSubpage';
      }

      // Another alternative is a user link to another site where a prefix is specified before a
      // namespace. Enough to capture a user name from, not enough to make any inferences.
    } else if (pageName.startsWith(cd.g.CONTRIBS_PAGE + '/')) {
      userName = pageName.replace(cd.g.CONTRIBS_PAGE_LINK_REGEXP, '');
      if (cd.g.IS_IPv6_ADDRESS(userName)) {
        userName = userName.toUpperCase();
      }
      linkType = 'contribs';
    }
    if (userName) {
      userName = firstCharToUpperCase(underlinesToSpaces(userName.replace(/\/.*/, ''))).trim();
    }
  } else {
    if (
      element.classList.contains('mw-selflink') &&
      cd.g.NAMESPACE_NUMBER === 3 &&
      !cd.g.PAGE_NAME.includes('/')
    ) {
      // Comments of users that have only the user talk page link in their signature on their talk
      // page.
      userName = cd.g.PAGE_TITLE;
    } else {
      return null;
    }
  }
  return [userName, linkType];
}

/**
 * Determine whether the provided element is a cell of a table containing multiple signatures.
 *
 * @param {Element|external:Element} element
 * @returns {boolean}
 * @private
 */
function isCellOfMultiCommentTable(element) {
  if (element.tagName !== 'TD') {
    return false;
  }
  let table;
  for (let n = element; !table && n !== cd.g.rootElement; n = n.parentNode) {
    if (n.tagName === 'TABLE') {
      table = n;
    }
  }
  return !table || table.getElementsByClassName('cd-signature', 2).length > 1;
}

/**
 * Check whether the element is a node that contains introductory text (or other foreign entity,
 * like a gallery) despite being a list element.
 *
 * @param {Element} element
 * @returns {boolean}
 * @private
 */
function isIntroList(element) {
  const tagName = element.tagName;
  const pesTagName = element.previousElementSibling?.tagName;
  return (
    (tagName === 'DL' && element.firstChild && element.firstChild.tagName === 'DT') ||

    // Cases like the first comment here:
    // https://ru.wikipedia.org/wiki/Википедия:Выборы_арбитров/Лето_2021/Форум#Abiyoyo
    (['DL', 'UL'].includes(tagName) && pesTagName && /^H[1-6]$/.test(pesTagName)) ||

    (tagName === 'UL' && element.classList.contains('gallery'))
  );
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
      foreignComponentClasses = ['cd-comment-part', ...cd.config.closedDiscussionClasses];
      if (cd.g.pageHasOutdents) {
        foreignComponentClasses.push(cd.config.outdentClass);
      }
    }
  }

  /**
   * Create a comment instance.
   *
   * @param {Element|external:Element} signature
   * @returns {*}
   */
  createComment(signature) {
    return new this.context.CommentClass(this, signature);
  }

  /**
   * Create a section instance.
   *
   * @param {Element|external:Element} headingElement
   * @param {Promise} watchedSectionsRequest
   * @returns {*}
   */
  createSection(headingElement, watchedSectionsRequest) {
    return new this.context.SectionClass(this, headingElement, watchedSectionsRequest);
  }

  /**
   * @typedef {object} Timestamp
   * @property {Element|external:Element} element
   * @property {Date} date
   */

  /**
   * _For internal use._ Find timestamps under the root element.
   *
   * @returns {Timestamp[]}
   */
  findTimestamps() {
    const blockquotes = Array.from(cd.g.rootElement.getElementsByTagName('blockquote'));
    const elementsToExcludeByClass = cd.config.elementsToExcludeClasses
      .map((className) => Array.from(cd.g.rootElement.getElementsByClassName(className)));
    elementsToExclude = [...blockquotes, ...flat(elementsToExcludeByClass)];

    return this.context.getAllTextNodes()
      .map((node) => {
        const { date, match } = parseTimestamp(node.textContent) || {};
        if (date && !elementsToExclude.some((el) => el.contains(node))) {
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
        node.textContent = match[1];
        node.parentNode.insertBefore(element, node.nextSibling);
        if (afterNode) {
          node.parentNode.insertBefore(afterNode, element.nextSibling);
        }
        return { element, date };
      });
  }

  /**
   * Collect nodes related to signatures starting from timestamp nodes.
   *
   * @param {object[]} timestamps
   * @returns {object[]}
   * @private
   */
  timestampsToSignatures(timestamps) {
    return timestamps
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

        const cniaChildren = Array.from(closestNotInlineAncestor[this.context.childElementsProp]);
        const elementsTreeWalker = new ElementsTreeWalker(timestamp.element);

        while (
          elementsTreeWalker.nextNode() &&
          closestNotInlineAncestor.contains(elementsTreeWalker.currentNode) &&
          (
            !cniaChildren.includes(elementsTreeWalker.currentNode) ||
            isInline(elementsTreeWalker.currentNode)
          )
        ) {
          // Found other timestamp after this timestamp.
          if (elementsTreeWalker.currentNode.classList.contains('cd-timestamp')) return;
        }

        const startElement = unsignedElement || timestamp.element;
        const treeWalker = new ElementsAndTextTreeWalker(startElement);
        let authorName;
        let authorLink;
        let authorTalkLink;

        // Used only to make sure there are no two contribs links in a signature.
        let authorContribsLink;

        let length = 0;
        let firstSignatureElement;
        let signatureNodes = [];
        if (unsignedElement) {
          firstSignatureElement = startElement;
        } else {
          signatureNodes.push(startElement);
          treeWalker.previousSibling();
        }

        // Unsigned template may be of the "undated" kind - containing a timestamp but no author
        // name, so we need to walk the tree anyway.
        let newNode;
        do {
          const node = treeWalker.currentNode;
          length += node.textContent.length;
          if (node.tagName) {
            if (node.classList.contains('cd-timestamp')) break;
            let hasAuthorLinks = false;

            const processLinkData = ([userName, linkType], link) => {
              if (userName) {
                if (!authorName) {
                  authorName = userName;
                }
                if (authorName === userName) {
                  if (linkType === 'user') {
                    if (authorLink) {
                      return false;
                    }
                    authorLink = link;
                  } else if (linkType === 'userTalk') {
                    if (authorTalkLink) {
                      return false;
                    }
                    authorTalkLink = link;
                  } else if (linkType === 'contribs') {
                    if (authorContribsLink) {
                      return false;
                    }
                    authorContribsLink = link;
                  } else if (linkType === 'userSubpage') {
                    // A user subpage link after a user link - OK. A user subpage link before a user
                    // link - not OK (example: https://ru.wikipedia.org/?diff=112885854). Perhaps
                    // part of the comment.
                    if (authorLink) {
                      return false;
                    }
                  } else if (linkType === 'userTalkSubpage') {
                    // Same as with a user page above.
                    if (authorTalkLink) {
                      return false;
                    }
                  }
                  hasAuthorLinks = true;
                } else {
                  // Don't return false here in case the user mentioned a redirect to their user
                  // page here.
                }
              }
              return true;
            }

            if (node.tagName === 'A') {
              const linkData = processLink(node) || [];
              if (!processLinkData(linkData, node)) break;
            } else {
              const links = Array.from(node.getElementsByTagName('a')).reverse();
              for (const link of links) {
                // https://en.wikipedia.org/wiki/Template:Talkback and similar cases
                if (link.classList.contains('external')) continue;

                const linkData = processLink(link) || [];
                processLinkData(linkData, link);
              }
            }

            if (hasAuthorLinks) {
              firstSignatureElement = node;
            }
          }
          signatureNodes.push(node);

          newNode = treeWalker.previousSibling();
          if (!newNode && !firstSignatureElement) {
            newNode = treeWalker.parentNode();
            if (!newNode || !isInline(treeWalker.currentNode)) break;
            length = 0;
            signatureNodes = [];
          }

          // Users may cross out text ended with their signature and sign again
          // (https://ru.wikipedia.org/?diff=114726134). The strike element shouldn't be considered
          // a part of signature then.
          if (authorName && newNode?.tagName && ['S', 'STRIKE'].includes(newNode.tagName)) break;
        } while (newNode && length < cd.config.signatureScanLimit);

        if (!authorName) return;

        if (!signatureNodes.length) {
          signatureNodes = [startElement];
        }

        const fseIndex = signatureNodes.indexOf(firstSignatureElement);
        signatureNodes.splice(fseIndex === -1 ? 1 : fseIndex + 1);

        const anchor = generateCommentAnchor(timestamp.date, authorName, true);
        registerCommentAnchor(anchor);
        const signatureContainer = signatureNodes[0].parentNode;
        const startElementNextSibling = signatureNodes[0].nextSibling;
        const element = this.context.document.createElement('span');
        element.classList.add('cd-signature');
        signatureNodes.reverse().forEach(element.appendChild.bind(element));
        signatureContainer.insertBefore(element, startElementNextSibling);

        return {
          element,
          timestampElement,
          timestampText,
          date,
          authorLink,
          authorTalkLink,
          authorName,
          anchor,
          isUnsigned,
        };
      })
      .filter(defined);
  }

  /**
   * Find outputs of unsigned templates.
   *
   * @returns {object[]}
   */
  findUnsigneds() {
    const unsigneds = [];
    if (cd.config.unsignedClass) {
      Array.from(cd.g.rootElement.getElementsByClassName(cd.config.unsignedClass))
        .forEach((element) => {
          // Only templates with no timestamp interest us.
          if (!this.context.getElementByClassName(element, 'cd-timestamp')) {
            Array.from(element.getElementsByTagName('a')).some((link) => {
              const [authorName, linkType] = processLink(link) || {};
              if (authorName) {
                let authorLink;
                let authorTalkLink;
                if (linkType === 'user') {
                  authorLink = link;
                } else if (linkType === 'userTalk') {
                  authorTalkLink = link;
                }
                element.classList.add('cd-signature');
                const isUnsigned = true;
                unsigneds.push({
                  element,
                  authorName,
                  isUnsigned,
                  authorLink,
                  authorTalkLink,
                });
                return true;
              }
            });
          }
        });
    }

    return unsigneds;
  }

  /**
   * _For internal use._ Find signatures under the root element given timestamps.
   *
   * Characters before the author link, like "—", aren't considered a part of the signature.
   *
   * @param {object[]} timestamps
   * @returns {object[]}
   */
  findSignatures(timestamps) {
    let signatures = this.timestampsToSignatures(timestamps);
    const unsigneds = this.findUnsigneds();
    signatures.push(...unsigneds);

    // Sort signatures according to their position in the DOM. `sig1` and `sig2` are expected not to
    // be the same element.
    signatures.sort((sig1, sig2) => this.context.follows(sig1.element, sig2.element) ? 1 : -1);

    return signatures;
  }

  /**
   * Get nodes to start the traversal from.
   *
   * @param {Element} signatureElement
   * @param {ElementsAndTextTreeWalker} treeWalker
   * @returns {Array.<object[], Element>}
   * @private
   */
  getStartNodes(signatureElement, treeWalker) {
    const parts = [];
    let firstForeignComponentAfter;

    /*
      The code:

        * Smth. [signature]
        ** Smth.
        *: Smth. [signature]

      or

        ** Smth. [signature]
        ** Smth.
        *: Smth. [signature]

      produces a DOM where the second line is not a part of the first comment, but there is only
      the first comment's signature in the DOM subtree related to the second line. We need to
      acknowledge there is a foreign not inline element here to be able to tell comment boundaries
      accurately (inline elements in most cases are continuations of the same comment).
    */
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
      // https://ru.wikipedia.org/wiki/Project:Форум/Архив/Технический/2020/10#202010140847_AndreiK).
      // The second parameter of getElementsByClassName() is an optimization for the worker context.
      signatureElement.parentNode.getElementsByClassName('cd-signature', 2).length > 1 ||

      isCellOfMultiCommentTable(signatureElement.parentNode)
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

    return [parts, firstForeignComponentAfter];
  }

  /**
   * Check if an element is eligible to be a comment part.
   *
   * @param {Element} element
   * @param {ElementsAndTextTreeWalker} treeWalker
   * @param {Element} lastStep
   * @returns {boolean}
   * @private
   */
  isElementEligible(element, treeWalker, lastStep) {
    return !(
      element === treeWalker.root ||
      foreignComponentClasses.some((className) => element.classList.contains(className)) ||
      element.getAttribute('id') === 'toc' ||

      // Seems to be the best option given pages like
      // https://commons.wikimedia.org/wiki/Project:Graphic_Lab/Illustration_workshop. DLs with a
      // single DT that are not parts of comments are filtered out in Parser#filterParts.
      element.tagName === 'DT' ||

      isCellOfMultiCommentTable(element) ||

      // Horizontal lines sometimes separate different section blocks.
      (
        element.tagName === 'HR' &&
        element.previousElementSibling &&
        this.context.getElementByClassName(element.previousElementSibling, 'cd-signature')
      ) ||

      (
        cd.g.pageHasOutdents &&
        this.context.getElementByClassName(element, cd.config.outdentClass)
      ) ||

      // Talk page message box
      (
        cd.g.NAMESPACE_NUMBER % 2 === 1 &&
        element.classList.contains('tmbox') &&
        lastStep !== 'up'
      ) ||

      cd.config.checkForCustomForeignComponents?.(element, this.context)
    );
  }

  /**
   * Traverse the DOM, collecting comment parts.
   *
   * @param {object[]} parts
   * @param {Element} signatureElement
   * @param {ElementsAndTextTreeWalker} treeWalker
   * @param {Element} firstForeignComponentAfter
   * @returns {object[]}
   * @private
   */
  traverseDom(parts, signatureElement, treeWalker, firstForeignComponentAfter) {
    // 500 seems to be a safe enough value in case of any weird reasons for an infinite loop.
    for (let i = 0; i < 500; i++) {
      /*
        lastStep may be:
          * "start" (parts added at the beginning)
          * "back" (go to the previous sibling)
          * "up" (go to the parent element)
          * "dive" (recursively go to the last not inline/text child)
          * "replaced" (obtained as a result of manipulations after node traversal)
      */
      let lastStep;
      const previousPart = parts[parts.length - 1];

      if (!previousPart.hasCurrentSignature && previousPart.hasForeignComponents) {
        /*
          Here we dive to the bottom of the element subtree to find parts of the _current_ comment
          that may be present. This happens with code like this:

            :* Smth. [signature]
            :* Smth. <!-- The comment part that we need to grab while it's in the same element as the
                          signature above. -->
            :: Smth. [signature] <!-- The comment part we are at. -->
        */

        // Get the last not inline child of the current node.
        let parentNode;
        let haveDived = false;
        while ((parentNode = treeWalker.currentNode) && treeWalker.lastChild()) {
          if (isInline(treeWalker.currentNode, true)) {
            treeWalker.currentNode = parentNode;
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

      let isHeading = null;
      let hasCurrentSignature = null;
      let hasForeignComponents = null;
      if (!isTextNode) {
        if (!this.isElementEligible(node, treeWalker, lastStep)) break;

        isHeading = /^H[1-6]$/.test(node.tagName);
        hasCurrentSignature = node.contains(signatureElement);

        // The second parameter of getElementsByClassName() is an optimization for the worker
        // context.
        const signaturesCount = node
          .getElementsByClassName('cd-signature', Number(hasCurrentSignature) + 1)
          .length;
        hasForeignComponents = (
          signaturesCount - Number(hasCurrentSignature) > 0 ||
          (firstForeignComponentAfter && node.contains(firstForeignComponentAfter))
        );

        // This is a pretty weak mechanism, effective in a very narrow range of cases, so we might
        // drop it.
        if (!hasCurrentSignature) {
          // A trace from `~~~` at the end of the line most likely means an incorrectly signed
          // comment.
          if (
            !isInline(node, true) &&
            cd.config.signatureEndingRegexp?.test(node.textContent) &&
            !elementsToExclude.some((el) => el.contains(node))
          ) {
            break;
          }
        }
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
   * _For internal use._ Collect the parts of the comment given a signature element.
   *
   * @param {Element|external:Element} signatureElement
   * @returns {object[]}
   */
  collectParts(signatureElement) {
    const treeWalker = new ElementsAndTextTreeWalker(signatureElement);
    let [parts, firstForeignComponentAfter] = this.getStartNodes(signatureElement, treeWalker);
    parts = this.traverseDom(parts, signatureElement, treeWalker, firstForeignComponentAfter);

    return parts;
  }

  /**
   * _For internal use._ Remove comment parts that are inside of other parts.
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
   * _For internal use._ Wrap text and inline nodes into block elements.
   *
   * @param {object[]} parts
   * @param {Element|external:Element} signatureElement
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

        // We should only enclose if there is need: there is at least one inline or non-empty text
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
   * _For internal use._ Remove unnecessary and incorrect parts from the collection.
   *
   * @param {object[]} parts
   * @param {Element|external:Element} signatureElement
   * @returns {object[]}
   */
  filterParts(parts, signatureElement) {
    parts = parts.filter((part) => !part.hasForeignComponents && !part.isTextNode);

    // Empty paragraphs at the beginning
    for (let i = parts.length - 1; i > 0; i--) {
      const node = parts[i].node;
      if (
        node.tagName === 'P' &&
        !node.textContent.trim() &&
        Array.from(node.children).every((child) => child.tagName === 'BR')
      ) {
        parts.splice(i, 1);
      } else {
        break;
      }
    }

    /*
      Cases like:

        === Section title ===
        Section introduction. Not a comment.
        # Vote. [signature]

      Without the following code, the section introduction would be a part of the comment. The
      same may happen inside a discussion thread (often because one of the users didn't sign).

      (Do it here, not in Parser#collectParts, because text nodes are filtered out at this stage.)
    */
    if (parts.length > 1) {
      const startNode = parts[parts.length - 1].node;
      if (!['DL', 'OL', 'UL', 'DD', 'LI'].includes(startNode.tagName) || isIntroList(startNode)) {
        for (let i = parts.length - 1; i >= 1; i--) {
          const part = parts[i];
          const node = part.node;
          const nextElement = node.nextElementSibling;
          if (!nextElement) continue;

          const isIntro = (
            part.lastStep === 'back' &&
            ['DL', 'OL', 'UL'].includes(nextElement.tagName) &&

            // Exceptions like https://ru.wikipedia.org/w/index.php?diff=105007602
            (!['DL', 'OL', 'UL'].includes(node.tagName) || isIntroList(node)) &&

            nextElement[this.context.childElementsProp][0]?.contains(signatureElement)
          );

          if (isIntro) {
            parts.splice(i);
          }
        }
      }
    }

    return parts;
  }

  /**
   * _For internal use._ Replace list elements with collections of their items if appropriate.
   *
   * @param {object[]} parts
   * @param {Element|external:Element} signatureElement
   * @returns {object[]}
   */
  replaceListsWithItems(parts, signatureElement) {
    const lastPart = parts[parts.length - 1];
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      if (
        // 'DD', 'LI' are in this list too for this kind of structures:
        // https://ru.wikipedia.org/w/index.php?diff=103584477.
        ['DL', 'UL', 'OL', 'DD', 'LI'].includes(part.node.tagName) &&

        !(part.node.tagName === 'UL' && part.node.classList.contains('gallery')) &&

        /*
          * The checks for DD helps here:
            https://ru.wikipedia.org/wiki/Project:Форум/Архив/Общий/2019/11#201911201924_Vcohen
            * A complex case where it messes up things:
              https://commons.wikimedia.org/wiki/Commons:Translators'_noticeboard/Archive/2020#202011151417_Ameisenigel
          * The check for DL helps here:
            https://ru.wikipedia.org/wiki/Project:Форум/Архив/Общий/2020/03#202003090945_Serhio_Magpie
            (see the original HTML source)
          * The check for P helps here:
            https://ru.wikipedia.org/wiki/Википедия:Форум/Архив/Правила/2019/12#201910270736_S.m.46
          * The check "['LI', 'DD'].includes(part.node.tagName)" helps in cases like
            https://ru.wikipedia.org/wiki/Обсуждение_шаблона:Графема#Навигация_со_стрелочками
            (the whole thread)
         */
        (
          (part.lastStep === 'up' && (!parts[i - 1] || parts[i - 1].lastStep !== 'back')) ||
          (
            (
              lastPart.node.tagName === 'DD' ||
              lastPart.node.parentNode.tagName === 'DD' ||
              lastPart.node.tagName === 'DL'
            ) &&
            !parts.slice(i + 1).some((part) => part.node.tagName === 'P') &&
            !(part.lastStep === 'back' && ['LI', 'DD'].includes(part.node.tagName))
          )
        )
      ) {
        // We ignore all spaces as an easy way to ignore only whitespace text nodes between element
        // nodes (this is a bad idea if we deal with inline nodes, but here we deal with lists).
        const partTextNoSpaces = part.node.textContent.replace(/\s+/g, '');

        /*
          With code like this:

            * Smth. [signature]
            :: Smth. [signature]

          one comment (preceded by :: in this case) creates its own list tree, not a subtree,
          even though it's a reply to a reply. So we dive to the bottom of the hierarchy of nested
          lists to get the bottom node (and therefore draw comment layers more neatly). One of the
          most complex tree structures is this:

            * Smth. [signature]
            :* Smth.
            :: Smth. [signature]

          (seen here:
          https://ru.wikipedia.org/w/index.php?title=Википедия:Форум/Общий&oldid=103760740#201912010211_Mikhail_Ryazanov)
          It has a branchy structure that requires a tricky algorithm to be parsed correctly.
         */
        let current;
        let children = [part.node];
        do {
          current = children;
          children = current.reduce(
            (arr, element) => arr.concat(Array.from(element[this.context.childElementsProp])),
            []
          );
        } while (
          children.length &&
          children.every((child) => (
            ['DL', 'UL', 'OL', 'DD', 'LI'].includes(child.tagName) ||

            // An inline (e.g., <small>) tag wrapped around block tags can give that.
            (!child.textContent.trim() && isInline(child))
          )) &&
          (
            children.map((child) => child.textContent).join('').replace(/\s+/g, '') ===
            partTextNoSpaces
          )
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
   * _For internal use._ Wrap numbered list into a div or dl & dd if the comment starts with
   * numbered list items.
   *
   * @param {object[]} parts
   * @param {Element} signatureElement
   * @returns {object[]}
   */
  wrapNumberedList(parts, signatureElement) {
    if (parts.length > 1) {
      const parent = parts[0].node.parentNode;

      if (parent.tagName === 'OL') {
        // 0 or 1
        const currentSignatureCount = Number(parent.contains(signatureElement));

        // A foreign signature can be found with just `.cd-signature` search; example:
        // https://commons.wikimedia.org/?diff=566673258.
        if (parent.getElementsByClassName('cd-signature').length - currentSignatureCount === 0) {
          const listItems = parts.filter((part) => part.node.parentNode === parent);

          // Is `#` used as an indentation character instead of `:` or `*`, or is the comments just
          // starts with a list and ends on a correct level (without `#`)?
          const isNumberedListUsedAsIndentation = !parts.some((part) => (
            part.node.parentNode !== parent &&
            part.node.parentNode.contains(parent)
          ));
          let outerWrapper;
          let innerWrapper;
          const nextSibling = parent.nextSibling;
          const parentParent = parent.parentNode;
          if (isNumberedListUsedAsIndentation) {
            innerWrapper = this.context.document.createElement('dd');
            outerWrapper = this.context.document.createElement('dl');
            outerWrapper.appendChild(innerWrapper);
          } else {
            innerWrapper = this.context.document.createElement('div');
            outerWrapper = innerWrapper;
          }
          innerWrapper.appendChild(parent);
          parentParent.insertBefore(outerWrapper, nextSibling);

          const newNode = {
            node: innerWrapper,
            isTextNode: false,
            isHeading: false,
            hasCurrentSignature: true,
            hasForeignComponents: false,
            lastStep: 'replaced',
          };
          parts.splice(0, listItems.length, newNode);
        }
      }
    }

    return parts;
  }

  /**
   * _For internal use._ Get the `.cd-commentLevel` elements up the DOM tree.
   *
   * @param {Element|external:Element} initialElement
   * @returns {Element[]|external:Element[]}
   */
  getLevelsUpTree(initialElement) {
    const levelElements = [];
    const treeWalker = new ElementsTreeWalker(initialElement);
    while (treeWalker.parentNode()) {
      const el = treeWalker.currentNode;
      if (['DL', 'UL', 'OL'].includes(el.tagName)) {
        if (el.classList.contains('cd-commentLevel')) {
          const match = el.getAttribute('class').match(/cd-commentLevel-(\d+)/);
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
   * _For internal use._ Get all headings on the page.
   *
   * @returns {Element[]|external:Element[]}
   */
  findHeadings() {
    // The worker context doesn't support .querySelector(), so we have to use
    // .getElementsByTagName().
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
