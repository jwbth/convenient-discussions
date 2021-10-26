// Here, we use vanilla JavaScript for recurring operations that together take up a lot of time.

import cd from './cd';
import { ElementsAndTextTreeWalker, ElementsTreeWalker } from './treeWalker';
import { defined, firstCharToUpperCase, flat, isInline, underlinesToSpaces } from './util';
import {
  generateCommentAnchor,
  isCommentAnchor,
  parseTimestamp,
  registerCommentAnchor,
} from './timestamp';

let foreignComponentClasses;
let elementsToExclude;

/**
 * @typedef {object} GetPageNameFromUrlReturn
 * @param {string} pageName
 * @param {string} domain
 * @param {string} fragment
 * @global
 * @private
 */

/**
 * Get a page name from a URL.
 *
 * @param {string} url
 * @returns {?GetPageNameFromUrlReturn}
 * @private
 */
function getPageNameFromUrl(url) {
  let domain = cd.g.HOSTNAME;
  let fragment;
  let pageName = url
    .replace(/^(?:https?:)?\/\/([^/]+)/, (s, m1) => {
      domain = m1;
      return '';
    })
    .replace(cd.g.STARTS_WITH_ARTICLE_PATH_REGEXP, '')
    .replace(cd.g.STARTS_WITH_SCRIPT_TITLE, '')
    .replace(/&action=edit.*/, '')
    .replace(/#(.*)/, (s, m1) => {
      fragment = m1;
      return '';
    })
    .replace(/_/g, ' ');
  try {
    pageName = decodeURIComponent(pageName);
  } catch (e) {
    return null;
  }
  return { pageName, domain, fragment };
}

/**
 * Generalization of a web page (not wikitext) parser for the window and worker contexts. Parsing
 * here means "extracting meaningful parts from the page". Functions related to wikitext parsing go
 * in {@link module:wikitext}.
 */
class Parser {
  /**
   * Create a page parser in the provided context.
   *
   * @param {object} context Collection of classes, functions, and other properties that perform the
   *   tasks we need in the current context (window or worker).
   */
  constructor(context) {
    this.context = context;

    if (!foreignComponentClasses) {
      // "Ombox" for templates like https://ru.wikipedia.org/wiki/Template:Сложное_обсуждение
      // (perhaps they need to be "tmbox" too?).
      foreignComponentClasses = ['cd-comment-part', 'ombox', ...cd.config.closedDiscussionClasses];
      if (cd.g.pageHasOutdents) {
        foreignComponentClasses.push(cd.config.outdentClass);
      }
    }
  }

  /**
   * Create a comment instance.
   *
   * @param {Element|external:Element} signature
   * @param {object[]} targets
   * @returns {*}
   */
  createComment(signature, targets) {
    return new this.context.CommentClass(this, signature, targets);
  }

  /**
   * Create a section instance.
   *
   * @param {object} heading
   * @param {object[]} targets
   * @param {Promise} watchedSectionsRequest
   * @returns {*}
   */
  createSection(heading, targets, watchedSectionsRequest) {
    return new this.context.SectionClass(this, heading, targets, watchedSectionsRequest);
  }

  /**
   * _For internal use._ Remove some of the elements added by the DiscussionTools extension (even if
   * it is disabled in user preferences) or move them away if the topic subscriptions feature of DT
   * is enabled (to avoid errors being thrown in DT).
   *
   * CD already parses comment links from notifications (which seems to be this markup's purpose for
   * disabled DT) in {@link module:processPage.processFragment}. Unless the elements prove useful to
   * CD or other scripts, it's better to get rid of them rather than deal with them one by one while
   * parsing.
   */
  removeDtMarkup() {
    const moveNotRemove = (
      typeof mw !== 'undefined' &&

      // Reply Tool is officially incompatible with CD, so we don't care if it is enabled. New Topic
      // Tool doesn't seem to make difference for our purposes here.
      cd.g.isDtTopicSubscriptionEnabled
    );
    let dtMarkupHavenElement;
    if (moveNotRemove) {
      if (cd.state.isPageFirstParsed) {
        dtMarkupHavenElement = this.context.document.createElement('span');
        dtMarkupHavenElement.className = 'cd-dtMarkupHaven cd-hidden';
        cd.g.$content.append(dtMarkupHavenElement);
      } else {
        dtMarkupHavenElement = cd.g.$content.children('.cd-dtMarkupHaven').get(0);
      }
    }
    let elements = Array.from(cd.g.rootElement.getElementsByTagName('span'))
      .filter((el) => (
        el.hasAttribute('data-mw-comment-start') ||
        el.hasAttribute('data-mw-comment-end')
      ))
      .concat(Array.from(
        cd.g.rootElement.getElementsByClassName('ext-discussiontools-init-replylink-buttons')
      ));
    if (typeof mw !== 'undefined') {
      elements = elements.concat(
        Array.from(cd.g.rootElement.getElementsByClassName('ext-discussiontools-init-highlight'))
      );
    }
    elements.forEach((el, i) => {
      if (moveNotRemove) {
        // DT gets the offset of all these elements upon initialization which can take a lot of
        // time if the elements aren't put into containers with less children.
        if (i % 10 === 0) {
          dtMarkupHavenElement.appendChild(this.context.document.createElement('span'));
        }
        dtMarkupHavenElement.lastChild.appendChild(el);
      } else {
        el.remove();
      }
    });
  }

  /**
   * @typedef {object} Timestamp
   * @property {Element|external:Element} element
   * @property {Date} date
   * @global
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
        element.appendChild(this.context.document.createTextNode(match[2]));
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
        const elementsTreeWalker = new ElementsTreeWalker(
          timestamp.element,
          closestNotInlineAncestor
        );

        // Workaround to exclude cases like https://en.wikipedia.org/?diff=1042059387, where the
        // last timestamp should be ignored.
        let metLink = false;
        while (
          elementsTreeWalker.nextNode() &&
          (
            // Optimization
            !cniaChildren.includes(elementsTreeWalker.currentNode) ||

            isInline(elementsTreeWalker.currentNode)
          )
        ) {
          if (elementsTreeWalker.currentNode.tagName === 'A') {
            metLink = true;
          }

          // Found other timestamp after this timestamp.
          if (elementsTreeWalker.currentNode.classList.contains('cd-timestamp') && metLink) return;
        }

        const startElement = unsignedElement || timestamp.element;
        const treeWalker = new ElementsAndTextTreeWalker(startElement);
        let authorName;
        let authorLink;
        let authorNotForeignLink;
        let authorTalkLink;
        let authorTalkNotForeignLink;

        // Used only to make sure there are no two contribs links on the current domain in a
        // signature.
        let authorContribsNotForeignLink;

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
            if (
              node.classList.contains('cd-timestamp') ||

              // Workaround for cases like https://en.wikipedia.org/?diff=1042059387 (those should
              // be extremely rare).
              (['S', 'STRIKE', 'DEL'].includes(node.tagName) && length >= 30)
            ) {
              break;
            }
            let hasAuthorLinks = false;

            const processLinkData = ({ userName, linkType }, link) => {
              if (userName) {
                if (!authorName) {
                  authorName = userName;
                }
                if (authorName === userName) {
                  if (['user', 'userForeign'].includes(linkType)) {
                    // Don't just break on the second user link because of cases like this:
                    // https://en.wikipedia.org/?diff=1012665097
                    if (authorNotForeignLink) {
                      return false;
                    }
                    if (linkType !== 'userForeign') {
                      authorNotForeignLink = link;
                    }
                    authorLink = link;
                  } else if (['userTalk', 'userTalkForeign'].includes(linkType)) {
                    if (authorTalkNotForeignLink) {
                      return false;
                    }
                    if (linkType !== 'userTalkForeign') {
                      authorTalkNotForeignLink = link;
                    }
                    authorTalkLink = link;
                  } else if (['contribs', 'contribsForeign'].includes(linkType)) {
                    if (authorContribsNotForeignLink && (authorLink || authorTalkLink)) {
                      return false;
                    }
                    if (linkType !== 'contribsForeign') {
                      authorContribsNotForeignLink = link;
                    }
                  } else if (['userSubpage', 'userSubpageForeign'].includes(linkType)) {
                    // A user subpage link after a user link is OK. A user subpage link before a
                    // user link is not OK (example: https://ru.wikipedia.org/?diff=112885854).
                    // Perhaps part of the comment.
                    if (authorLink || authorTalkLink) {
                      return false;
                    }
                  } else if (['userTalkSubpage', 'userTalkSubpageForeign'].includes(linkType)) {
                    // Same as with a user page above.
                    if (authorLink || authorTalkLink) {
                      return false;
                    }
                  } else {
                    // Cases like https://ru.wikipedia.org/?diff=115909247
                    if (authorLink || authorTalkLink) {
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
              const linkData = Parser.processLink(node) || {};
              if (!processLinkData(linkData, node)) break;
            } else {
              const links = Array.from(node.getElementsByTagName('a')).reverse();
              for (const link of links) {
                // https://en.wikipedia.org/wiki/Template:Talkback and similar cases
                if (link.classList.contains('external')) continue;

                const linkData = Parser.processLink(link) || {};
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
            if (!newNode || !isInline(newNode)) break;
            length = 0;
            signatureNodes = [];
          }

          // Users may cross out text ended with their signature and sign again
          // (https://ru.wikipedia.org/?diff=114726134). The strike element shouldn't be considered
          // a part of the signature then.
          if (
            authorName &&
            newNode?.tagName &&
            ['S', 'STRIKE', 'DEL'].includes(newNode.tagName)
          ) {
            break;
          }
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
        .filter((element) => {
          // Only templates with no timestamp interest us.
          if (this.context.getElementByClassName(element, 'cd-timestamp')) {
            return false;
          }

          // Cases like https://ru.wikipedia.org/?diff=84883816
          for (let el = element; el && el !== cd.g.rootElement; el = el.parentNode) {
            if (el.classList.contains('cd-signature')) {
              return false;
            }
          }

          return true;
        })
        .forEach((element) => {
          Array.from(element.getElementsByTagName('a')).some((link) => {
            const { userName: authorName, linkType } = Parser.processLink(link) || {};
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
    return signatures.map((sig) => Object.assign({ type: 'signature' }, sig));
  }

  /**
   * Get nodes to start the traversal from.
   *
   * @param {Element|external:Element} signatureElement
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

      !this.isElementEligible(signatureElement.parentNode, treeWalker, 'start')
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
            step: 'start',
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
      step: 'start',
    });

    return [parts, firstForeignComponentAfter];
  }

  /**
   * Determine whether the provided element is a cell of a table containing multiple signatures.
   *
   * @param {Element|external:Element} element
   * @returns {boolean}
   * @private
   */
  isCellOfMultiCommentTable(element) {
    if (!['TD', 'TH'].includes(element.tagName)) {
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
   * Check if an element is eligible to be a comment part.
   *
   * @param {Element|external:Element} element
   * @param {ElementsAndTextTreeWalker} treeWalker
   * @param {string} step
   * @returns {boolean}
   * @private
   */
  isElementEligible(element, treeWalker, step) {
    return !(
      element === treeWalker.root ||
      (
        foreignComponentClasses.some((name) => element.classList.contains(name)) ||

        // Talk page message box
        (step !== 'up' && cd.g.NAMESPACE_NUMBER % 2 === 1 && element.classList.contains('tmbox'))
      ) ||

      element.getAttribute('id') === 'toc' ||

      // Seems to be the best option given pages like
      // https://commons.wikimedia.org/wiki/Project:Graphic_Lab/Illustration_workshop. DLs with a
      // single DT that are not parts of comments are filtered out in Parser#filterParts.
      element.tagName === 'DT' ||

      this.isCellOfMultiCommentTable(element) ||

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

      cd.config.checkForCustomForeignComponents?.(element, this.context)
    );
  }

  /**
   * Check whether the element is a gallery created by the `<gallery` tag.
   *
   * @param {Element|external:Element} element
   * @returns {boolean}
   */
  isGallery(element) {
    return element.tagName === 'UL' && element.classList.contains('gallery');
  }

  /**
   * Check whether the element is a node that contains introductory text (or other foreign entity,
   * like a gallery) despite being a list element.
   *
   * @param {Element|external:Element} element
   * @param {boolean} checkNextElement
   * @param {boolean} [lastPartNode]
   * @returns {boolean}
   * @private
   */
  isIntroList(element, checkNextElement, lastPartNode) {
    const tagName = element.tagName;
    if (!['DL', 'UL', 'OL'].includes(tagName)) {
      return false;
    }
    const previousElement = element.previousElementSibling;
    const nextElement = element.nextElementSibling;
    let result = (
      (tagName === 'DL' && element.firstChild && element.firstChild.tagName === 'DT') ||

      // Cases like the first comment at
      // https://ru.wikipedia.org/wiki/Project:Выборы_арбитров/Лето_2021/Форум/Кандидаты#Abiyoyo.
      // But don't affect cases like the first comment at
      // https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#List_inside_a_comment.
      //
      (
        ['DL', 'UL'].includes(tagName) &&
        previousElement &&
        /^H[1-6]$/.test(previousElement.tagName) &&
        nextElement &&
        !['DL', 'OL'].includes(nextElement.tagName) &&

        // Helps at https://ru.wikipedia.org/wiki/Википедия:Форум/Архив/Общий/2019/11#201911201924_Vcohen
        !this.isPartOfList(lastPartNode, true) &&

        // Helps at
        // https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#202110061810_Example
        !this.context.getElementByClassName(element, 'cd-signature')
      ) ||

      this.isGallery(element)
    );

    // "tagName !== 'OL'" helps in cases like
    // https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#202005161120_Example.
    if (checkNextElement && !result && nextElement && tagName !== 'OL') {
      // Cases like https://en.wikipedia.org/?diff=1042059387 where, due to use of `::` in reply to
      // a `*` comment, Space4Time3Continuum2x could be interpreted as the author of the SPECIFICO's
      // comment. (Currently, to test this, you will need to remove timestamps from the SPECIFICO's
      // comment.)
      const elementLevelsPassed = this.getTopElementsWithText(element).levelsPassed;
      const nextElementLevelsPassed = this.getTopElementsWithText(nextElement).levelsPassed;
      result = (
        nextElementLevelsPassed > elementLevelsPassed ||

        // https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#Joint_statements
        (
          elementLevelsPassed === 1 &&
          nextElementLevelsPassed === elementLevelsPassed &&
          element[this.context.childElementsProp].length > 1 &&
          tagName !== nextElement.tagName
        )
      );
    }

    return result;
  }

  /**
   * Given a comment part (a node), tell if it is a part of a list.
   *
   * @param {Element|external:Element} node
   * @param {boolean} definitionList
   * @returns {boolean}
   */
  isPartOfList(node, definitionList) {
    /*
      * The checks for DD help in cases like
        https://ru.wikipedia.org/wiki/Project:Форум/Архив/Общий/2019/11#201911201924_Vcohen
        * A complex case where it messes up things:
        https://commons.wikimedia.org/wiki/Commons:Translators%27_noticeboard/Archive/2020#202011151417_Ameisenigel
      * The check for DL helps in cases like
        https://ru.wikipedia.org/wiki/Project:Форум/Архив/Общий/2020/03#202003090945_Serhio_Magpie
        (see the original HTML source)
     */
    const tagNames = ['DD', 'DL'];
    if (!definitionList) {
      tagNames.push('LI', 'UL');
    }
    return node && (tagNames.includes(node.tagName) || tagNames.includes(node.parentNode.tagName));
  }

  /**
   * Identify cases like:
   *
   * ```
   * === Section title ===
   * Section introduction. Not a comment.
   * # Vote. [signature]
   * ```
   *
   * and similar. Without treatment of such cases, the section introduction would be considered a
   * part of the comment. The same may happen inside a discussion thread (often because one of the
   * users didn't sign).
   *
   * @param {object} options
   * @param {string} options.step
   * @param {number} options.stage
   * @param {Element|external:Element} options.node
   * @param {Element|external:Element} options.nextNode
   * @param {Element|external:Element} options.signatureElement
   * @param {Element|external:Element} [options.lastPartNode]
   * @param {Element|external:Element} [options.previousPart]
   * @returns {boolean}
   */
  isIntro({ step, stage, node, nextNode, signatureElement, lastPartNode, previousPart }) {
    // Only the first stage code covers cases when there is only one comment part eventually (a list
    // item, for example), and only the second stage code fully covers comments indented with ":").

    return (
      step === 'back' &&
      (!previousPart || previousPart.step === 'up') &&
      (
        ['UL', 'OL'].includes(nextNode.tagName) ||

        /*
          Including DLs at stage 1 is dangerous because comments like this may be broken:

            : Comment beginning.
            <blockquote>Some quote.</blockquote>
            : Comment ending. [signature]

          But it's important that we do it some way because of the issue with discussions like
          https://ru.wikipedia.org/wiki/Обсуждение:Иванов,_Валентин_Дмитриевич#Источники where
          somebody responds in the middle of someone's comment, which is a not so uncommon
          pattern.
         */
        (
          nextNode.tagName === 'DL' &&
          (
            stage === 2 ||
            (
              nextNode.parentNode !== cd.g.rootElement &&
              nextNode.parentNode.parentNode !== cd.g.rootElement
            )
          )
        )
      ) &&

      // Exceptions like https://ru.wikipedia.org/w/index.php?diff=105007602#202002071806_G2ii2g.
      // Supplying `true` as the second parameter to this.isIntroList() at stage 1 is costly so we
      // do it only at stage 2.
      !(
        (
          ['DL', 'UL', 'OL'].includes(node.tagName) &&
          !this.isIntroList(node, stage === 2, lastPartNode)
        ) ||
        (
          // Note: Text nodes are filtered out as of stage 2.
          node.nodeType === Node.TEXT_NODE &&
          node.previousSibling &&
          ['DL', 'UL', 'OL'].includes(node.previousSibling.tagName) &&
          !this.isIntroList(node.previousSibling, false, lastPartNode)
        ) ||
        (lastPartNode && !this.isPartOfList(lastPartNode, false))
      ) &&

      // Don't confuse the comment with a list at the end of the comment.
      !(
        ['UL', 'OL'].includes(nextNode.tagName) &&
        nextNode[this.context.childElementsProp].length > 1 &&
        !nextNode[this.context.childElementsProp][0].contains(signatureElement)
      )
    );
  }

  /**
   * Traverse the DOM, collecting comment parts.
   *
   * @param {object[]} parts
   * @param {Element|external:Element} signatureElement
   * @param {ElementsAndTextTreeWalker} treeWalker
   * @param {Element|external:Element} firstForeignComponentAfter
   * @param {Element|external:Element} precedingHeadingElement
   * @returns {object[]}
   * @private
   */
  traverseDom(
    parts,
    signatureElement,
    treeWalker,
    firstForeignComponentAfter,
    precedingHeadingElement
  ) {
    // 500 seems to be a safe enough value in case of any weird reasons for an infinite loop.
    for (let i = 0; i < 500; i++) {
      /*
        `step` may be:
          * "start" (parts added at the beginning)
          * "back" (go to the previous sibling)
          * "up" (go to the parent element)
          * "dive" (recursively go to the last not inline/text child)
          * "replaced" (obtained as a result of manipulations after node traversal)
      */
      let step;
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
        while ((parentNode = treeWalker.currentNode) && treeWalker.lastChild()) {
          while (
            treeWalker.currentNode.nodeType === Node.TEXT_NODE &&
            !treeWalker.currentNode.textContent.trim() &&
            treeWalker.previousSibling()
          );
          if (isInline(treeWalker.currentNode, true)) {
            treeWalker.currentNode = parentNode;
            break;
          }
          step = 'dive';
        }
        if (step !== 'dive') break;
      } else if (treeWalker.previousSibling()) {
        step = 'back';
      } else {
        if (!treeWalker.parentNode()) break;
        step = 'up';
      }

      const node = treeWalker.currentNode;

      const isIntro = this.isIntro({
        step,
        stage: 1,
        node,
        nextNode: previousPart.node,
        signatureElement,
        previousPart,
      });
      if (isIntro) break;

      const isTextNode = node.nodeType === Node.TEXT_NODE;
      let isHeading = null;
      let hasCurrentSignature = null;
      let hasForeignComponents = null;
      if (!isTextNode) {
        if (!this.isElementEligible(node, treeWalker, step)) break;

        isHeading = /^H[1-6]$/.test(node.tagName);
        hasCurrentSignature = node.contains(signatureElement);

        // The second parameter of getElementsByClassName() is an optimization for the worker
        // context.
        const signatureCount = node
          .getElementsByClassName('cd-signature', Number(hasCurrentSignature) + 1)
          .length;

        hasForeignComponents = (
          signatureCount - Number(hasCurrentSignature) > 0 ||
          (
            firstForeignComponentAfter &&
            node.contains(firstForeignComponentAfter) &&

            // Cases like the table added at https://ru.wikipedia.org/?diff=115822931
            node.tagName !== 'TABLE'
          ) ||

          // A heading can be wrapped into an element, like at
          // https://meta.wikimedia.org/wiki/Community_Wishlist_Survey_2015/Editing/chy.
          (
            precedingHeadingElement &&
            node !== precedingHeadingElement &&
            node.contains(precedingHeadingElement)
          )
        );

        // This is a pretty weak mechanism, effective in a very narrow range of cases, so we might
        // drop it.
        if (!hasCurrentSignature) {
          // A trace from `~~~` at the end of the line most likely means an incorrectly signed
          // comment.
          if (
            !isInline(node) &&
            cd.config.signatureEndingRegexp?.test(node.textContent) &&
            !elementsToExclude.some((el) => el.contains(node))
          ) {
            break;
          }
        }
      }

      // We save all data related to the nodes on the path to reuse it.
      parts.push({ node, isTextNode, isHeading, hasCurrentSignature, hasForeignComponents, step });

      if (isHeading) break;
    }

    return parts;
  }

  /**
   * _For internal use._ Collect the parts of the comment given a signature element.
   *
   * @param {Element|external:Element} signatureElement
   * @param {Element|external:Element} precedingHeadingElement
   * @returns {object[]}
   */
  collectParts(signatureElement, precedingHeadingElement) {
    const treeWalker = new ElementsAndTextTreeWalker(signatureElement);
    let [parts, firstForeignComponentAfter] = this.getStartNodes(signatureElement, treeWalker);
    parts = this.traverseDom(
      parts,
      signatureElement,
      treeWalker,
      firstForeignComponentAfter,
      precedingHeadingElement
    );

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
      if (part.step === 'up' && !part.hasForeignComponents) {
        let nextDiveElementIndex = 0;
        for (let j = i - 1; j > 0; j--) {
          if (parts[j].step === 'dive') {
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
        (start === null || (['back', 'start'].includes(part.step))) &&
        !part.hasForeignComponents &&
        !part.isHeading
      ) {
        if (start === null) {
          // Don't enclose nodes whose parent is an inline element.
          if (isInline(part.node.parentNode)) {
            for (let j = i + 1; j < parts.length; j++) {
              if (parts[j].step === 'up') {
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
      const newPart = {
        node: wrapper,
        isTextNode: false,
        isHeading: false,
        hasCurrentSignature: wrapper.contains(signatureElement),
        hasForeignComponents: false,
        step: 'replaced',
      };
      parts.splice(sequence.start, sequence.end - sequence.start + 1, newPart);
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

    // "style" and "link" tags at the beginning. Also "references" tags and {{reflist-talk}}
    // templates (will need to generalize this, possibly via wiki configuration, if other wikis
    // employ a differently named class).
    for (let i = parts.length - 1; i > 0; i--) {
      const node = parts[i].node;
      if (
        (
          node.tagName === 'P' &&
          !node.textContent.trim() &&
          Array.from(node.children).every((child) => child.tagName === 'BR')
        ) ||
        node.tagName === 'STYLE' ||
        node.tagName === 'LINK' ||
        Array.from(node.classList).some((name => ['references', 'reflist-talk'].includes(name)))
      ) {
        parts.splice(i, 1);
      } else {
        break;
      }
    }

    // When the first comment part starts with <br>
    const firstNode = parts[parts.length - 1]?.node;
    if (firstNode.tagName === 'P') {
      if (firstNode.firstChild?.tagName === 'BR') {
        firstNode.parentNode.insertBefore(firstNode.firstChild, firstNode);
      }
    }

    if (parts.length > 1) {
      let startNode;
      for (let i = parts.length - 1; i >= 1; i--) {
        const part = parts[i];
        if (part.isHeading) continue;

        if (!startNode) {
          startNode = part.node;
          if (
            ['DL', 'UL', 'OL', 'DD', 'LI'].includes(startNode.tagName) &&
            !this.isIntroList(startNode, true, parts[0].node)
          ) {
            break;
          }
        }

        const nextElement = part.node.nextElementSibling;
        if (!nextElement) continue;

        const isIntro = this.isIntro({
          step: part.step,
          stage: 2,
          node: part.node,
          nextNode: nextElement,
          signatureElement,
          lastPartNode: parts[0].node,
        });
        if (isIntro) {
          parts.splice(i);
        }
      }
    }

    return parts;
  }

  /**
   * With code like this:
   *
   * ```
   *   * Smth. [signature]
   *   :: Smth. [signature]
   * ```
   *
   * one comment (preceded by :: in this case) creates its own list tree, not a subtree, even though
   * it's a reply to a reply. So we dive as deep to the bottom of the hierarchy of nested lists as
   * we can to get the top nodes with comment content (and therefore draw comment layers more
   * accurately). One of the most complex tree structures is this:
   *
   * ```
   *    * Smth. [signature]
   *    :* Smth.
   *    :: Smth. [signature]
   * ```
   *
   * (seen here:
   * https://ru.wikipedia.org/w/index.php?title=Википедия:Форум/Общий&oldid=103760740#201912010211_Mikhail_Ryazanov)
   * It has a branchy structure that requires a tricky algorithm to be parsed correctly.
   *
   * @param {Element|external:Element} element
   * @returns {object}
   */
  getTopElementsWithText(element) {
    // We ignore all spaces as an easy way to ignore only whitespace text nodes between element
    // nodes (this is a bad idea if we deal with inline nodes, but here we deal with lists).
    const partTextNoSpaces = element.textContent.replace(/\s+/g, '');

    let current;
    let children = [element];
    let levelsPassed = 0;
    do {
      current = children;
      children = current.reduce(
        (arr, element) => arr.concat(Array.from(element[this.context.childElementsProp])),
        []
      );
      if (['DL', 'UL', 'OL'].includes(current[0].tagName)) {
        levelsPassed++;
      }
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

    return {
      nodes: current,
      levelsPassed,
    };
  }

  /**
   * _For internal use._ Replace list elements with collections of their items if appropriate.
   *
   * @param {object[]} parts
   * @param {Element|external:Element} signatureElement
   * @returns {object[]}
   */
  replaceListsWithItems(parts, signatureElement) {
    const lastPartNode = parts[parts.length - 1].node;
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      const isCommentLevel = (
        // 'DD', 'LI' are in this list too for this kind of structures:
        // https://ru.wikipedia.org/w/index.php?diff=103584477.
        ['DL', 'UL', 'OL', 'DD', 'LI'].includes(part.node.tagName) &&

        !this.isGallery(part.node) &&

        // Exclude lists that are parts of the comment, like
        // https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#Comments_starting_with_a_list.
        !(
          part.step === 'up' &&
          parts[i + 1] &&
          ['replaced', 'start'].includes(parts[i + 1].step) &&
          this.isPartOfList(lastPartNode, true) &&

          // But don't affect things like
          // https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#201901151200_Example
          !(parts[i + 1].step === 'replaced' && ['DD', 'LI'].includes(parts[i + 1].node.tagName))
        ) &&

        (
          // Exclude lists that are parts of the comment.
          (part.step === 'up' && (!parts[i - 1] || parts[i - 1].step !== 'back')) ||

          (
            this.isPartOfList(lastPartNode, true) &&

            // Cases like
            // https://ru.wikipedia.org/wiki/Обсуждение_шаблона:Графема#Навигация_со_стрелочками
            // (the whole thread).
            !(part.step === 'back' && ['LI', 'DD'].includes(part.node.tagName)) &&

            // Cases like
            // https://commons.wikimedia.org/wiki/Commons:Translators%27_noticeboard/Archive/2020#202011151417_Ameisenigel
            !(
              i !== 0 &&
              ['UL', 'OL'].includes(part.node.tagName) &&
              part.node.previousElementSibling?.tagName === 'DL'
            )
          ) ||

          // Cases like
          // https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#202110061830_Example
          (
            part.node.tagName === 'UL' &&
            part.node[this.context.childElementsProp].length === 1 &&
            this.isPartOfList(lastPartNode, false)
          )
        )
      );
      if (isCommentLevel) {
        const commentElements = this.getTopElementsWithText(part.node).nodes;
        if (commentElements.length > 1) {
          const newParts = commentElements.map((el) => ({
            node: el,
            isTextNode: false,
            hasCurrentSignature: el.contains(signatureElement),
            hasForeignComponents: false,
            step: 'replaced',
          }));
          parts.splice(i, 1, ...newParts);
        } else if (commentElements[0] !== part.node) {
          Object.assign(part, {
            node: commentElements[0],
            step: 'replaced',
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
   * @param {Element|external:Element} signatureElement
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

          const newPart = {
            node: innerWrapper,
            isTextNode: false,
            isHeading: false,
            hasCurrentSignature: true,
            hasForeignComponents: false,
            step: 'replaced',
          };
          parts.splice(0, listItems.length, newPart);
        }
      }
    }

    return parts;
  }

  /**
   * _For internal use._ Get list elements up the DOM tree. They will then be assigned the class
   * `cd-commentLevel`.
   *
   * @param {Element|external:Element} initialElement
   * @param {boolean} [includeFirstMatch=false]
   * @returns {Element[]|external:Element[]}
   */
  getListsUpTree(initialElement, includeFirstMatch = false) {
    const listElements = [];
    const treeWalker = new ElementsTreeWalker(initialElement);
    while (treeWalker.parentNode()) {
      const el = treeWalker.currentNode;
      if (['DL', 'UL', 'OL'].includes(el.tagName)) {
        if (el.classList.contains('cd-commentLevel')) {
          const match = el.getAttribute('class').match(/cd-commentLevel-(\d+)/);
          if (match) {
            const elementsToAdd = Array(Number(match[1]));
            if (includeFirstMatch) {
              elementsToAdd[elementsToAdd.length - 1] = el;
            }
            listElements.unshift(...elementsToAdd);
          }
          return listElements;
        } else {
          listElements.unshift(el);
        }
      }
    }
    return listElements;
  }

  /**
   * _For internal use._ Get all headings on the page.
   *
   * @returns {object[]}
   */
  findHeadings() {
    // The worker context doesn't support .querySelector(), so we have to use
    // .getElementsByTagName().
    return [
      ...cd.g.rootElement.getElementsByTagName('h1'),
      ...cd.g.rootElement.getElementsByTagName('h2'),
      ...cd.g.rootElement.getElementsByTagName('h3'),
      ...cd.g.rootElement.getElementsByTagName('h4'),
      ...cd.g.rootElement.getElementsByTagName('h5'),
      ...cd.g.rootElement.getElementsByTagName('h6'),
    ]
      .filter((el) => el.getAttribute('id') !== 'mw-toc-heading')
      .map((element) => ({
        type: 'heading',
        element,
      }));
  }

  /**
   * Turn a structure like this
   * ```
   * <dd>
   *   <div>Comment. [signature]</div>
   *   <ul>...</ul>
   * </dd>
   * ```
   * into a structure like this
   * ```
   * <dd>
   *   <div>Comment. [signature]</div>
   * </dd>
   * <dd>
   *   <ul>...</ul>
   * </dd>
   * ```
   * by splitting the parent node of the given node, moving all the following nodes into the second
   * node resulting from the split. If there is no following nodes, don't perform the split.
   *
   * @param {Element|external:Element} node Reference node.
   * @returns {Array.<Element|external:Element, (Element|external:Element|undefined)>} The parent
   *   nodes resultant from the split (at least one).
   */
  splitParentAfterNode(node) {
    const parent = node.parentNode;
    const clone = parent.cloneNode();
    let lastChild;
    while ((lastChild = parent.lastChild) && lastChild !== node) {
      clone.insertBefore(lastChild, clone.firstChild);
    }
    if (clone[this.context.childElementsProp].length > 0) {
      parent.parentNode.insertBefore(clone, parent.nextSibling);
    }
    return [parent, clone];
  }

  /**
   * @typedef {string[]} ProcessLinkReturn
   * @param {string} userName User name.
   * @param {?string} linkType Link type (`user`, `userTalk`, `contribs`, `userSubpage`,
   *   `userTalkSubpage`, or any of this `Foreign` at the end).
   * @global
   * @private
   */

  /**
   * _For internal use._ Get a user name from a link, along with some other data about a page name.
   *
   * @param {Element|external:Element} element
   * @returns {?ProcessLinkReturn}
   */
  static processLink(element) {
    const href = element.getAttribute('href');
    let userName;
    let linkType = null;
    if (href) {
      const { pageName, domain, fragment } = getPageNameFromUrl(href) || {};
      if (!pageName || isCommentAnchor(fragment)) {
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
        if (cd.g.isIPv6Address(userName)) {
          userName = userName.toUpperCase();
        }
        linkType = 'contribs';
      }
      if (domain !== cd.g.HOSTNAME) {
        linkType += 'Foreign';
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
    return { userName, linkType };
  }
}

export default Parser;
