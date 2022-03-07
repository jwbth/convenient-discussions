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
   * @returns {*}
   */
  createSection(heading, targets) {
    return new this.context.SectionClass(this, heading, targets);
  }

  /**
   * _For internal use._ Remove some of the elements added by the DiscussionTools extension (even if
   * it is disabled in user preferences) or move them away if the topic subscriptions feature of DT
   * is enabled (to avoid errors being thrown in DT). Prior to that, extract data from them.
   *
   * CD already parses comment links from notifications (which seems to be this markup's purpose for
   * disabled DT) in {@link module:processPage.processFragment}. Unless the elements prove useful to
   * CD or other scripts, it's better to get rid of them rather than deal with them one by one while
   * parsing.
   */
  processAndRemoveDtMarkup() {
    if (!self.cdIsWorker) {
      cd.g.dtCommentIds = [];
    }

    // Reply Tool is officially incompatible with CD, so we don't care if it is enabled. New Topic
    // Tool doesn't seem to make difference for our purposes here.
    const moveNotRemove = !self.cdIsWorker && (
      cd.g.isDtTopicSubscriptionEnabled ||

      // DT enabled by default. Don't know how to capture that another way.
      mw.loader.getState('ext.discussionTools.init') === 'ready'
    );

    let dtMarkupHavenElement;
    if (moveNotRemove) {
      if (cd.state.isPageFirstParsed) {
        dtMarkupHavenElement = document.createElement('span');
        dtMarkupHavenElement.className = 'cd-dtMarkupHaven cd-hidden';
        cd.g.$content.append(dtMarkupHavenElement);
      } else {
        dtMarkupHavenElement = cd.g.$content.children('.cd-dtMarkupHaven').get(0);
      }
    }
    let elements = [...cd.g.rootElement.getElementsByTagName('span')]
      .filter((el) => (
        el.hasAttribute('data-mw-comment-start') ||
        el.hasAttribute('data-mw-comment-end')
      ))
      .concat(
        [...cd.g.rootElement.getElementsByClassName('ext-discussiontools-init-replylink-buttons')]
      );
    if (!self.cdIsWorker) {
      elements = elements.concat(
        [...cd.g.rootElement.getElementsByClassName('ext-discussiontools-init-highlight')]
      );
    }
    elements.forEach((el, i) => {
      if (!self.cdIsWorker && el.hasAttribute('data-mw-comment-start') && el.id?.startsWith('c-')) {
        cd.g.dtCommentIds.push(el.id);
      }
      if (moveNotRemove) {
        // DT gets the offset of all these elements upon initialization which can take a lot of
        // time if the elements aren't put into containers with less children.
        if (i % 10 === 0) {
          dtMarkupHavenElement.appendChild(document.createElement('span'));
        }
        dtMarkupHavenElement.lastChild.appendChild(el);
      } else {
        el.remove();
      }
    });
    if (!self.cdIsWorker && !moveNotRemove) {
      [...cd.g.rootElement.getElementsByTagName('span[data-mw-comment]')].forEach((el) => {
        el.removeAttribute('data-mw-comment');
      });
    }
  }

  /**
   * Set some properties required for parsing comments.
   *
   * @private
   */
  setPropertiesForCommentParsing() {
    // "Ombox" for templates like https://ru.wikipedia.org/wiki/Template:Сложное_обсуждение
    // (perhaps they need to be "tmbox" too?).
    this.foreignComponentClasses = [
      'cd-comment-part',
      'ombox',
      ...cd.config.closedDiscussionClasses,
    ];
    if (cd.g.pageHasOutdents) {
      this.foreignComponentClasses.push(cd.config.outdentClass);
    }

    const blockquotes = [...cd.g.rootElement.getElementsByTagName('blockquote')];
    const elementsToExcludeByClass = cd.config.elementsToExcludeClasses
      .map((className) => [...cd.g.rootElement.getElementsByClassName(className)]);
    this.elementsToExclude = [...blockquotes, ...flat(elementsToExcludeByClass)];
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
    this.setPropertiesForCommentParsing();

    return this.context.getAllTextNodes()
      .map((node) => {
        const { date, match } = parseTimestamp(node.textContent) || {};
        if (date && !this.elementsToExclude.some((el) => el.contains(node))) {
          return { node, date, match };
        }
      })
      .filter(defined)
      .map((finding) => {
        const { node, match, date } = finding;
        const element = document.createElement('span');
        element.classList.add('cd-timestamp');
        element.appendChild(document.createTextNode(match[2]));
        const remainedText = node.textContent.slice(match.index + match[0].length);
        let afterNode;
        if (remainedText) {
          afterNode = document.createTextNode(remainedText);
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
   * Given a link node, enrich the author data and return a boolean denoting whether the node is a part of the
   * signature.
   *
   * @param {Element|external:Element} link
   * @param {object} authorData
   * @returns {boolean}
   */
  processLinkData(link, authorData) {
    const { userName, linkType } = Parser.processLink(link) || {};
    if (userName) {
      if (!authorData.name) {
        authorData.name = userName;
      }
      if (authorData.name === userName) {
        if (['user', 'userForeign'].includes(linkType)) {
          // Don't just break on the second user link because of cases like this:
          // https://en.wikipedia.org/?diff=1012665097
          if (authorData.notForeignLink) {
            return false;
          }
          if (linkType !== 'userForeign') {
            authorData.notForeignLink = link;
          }
          authorData.link = link;
        } else if (['userTalk', 'userTalkForeign'].includes(linkType)) {
          if (authorData.talkNotForeignLink) {
            return false;
          }
          if (linkType !== 'userTalkForeign') {
            authorData.talkNotForeignLink = link;
          }
          authorData.talkLink = link;
        } else if (['contribs', 'contribsForeign'].includes(linkType)) {
          // authorData.contribsNotForeignLink is used only to make sure there are no two contribs
          // links on the current domain in a signature.
          if (authorData.contribsNotForeignLink && (authorData.link || authorData.talkLink)) {
            return false;
          }
          if (linkType !== 'contribsForeign') {
            authorData.contribsNotForeignLink = link;
          }
        } else if (['userSubpage', 'userSubpageForeign'].includes(linkType)) {
          // A user subpage link after a user link is OK. A user subpage link before a user link is
          // not OK (example: https://ru.wikipedia.org/?diff=112885854). Perhaps part of the
          // comment.
          if (authorData.link || authorData.talkLink) {
            return false;
          }
        } else if (['userTalkSubpage', 'userTalkSubpageForeign'].includes(linkType)) {
          // Same as with a user page above.
          if (authorData.link || authorData.talkLink) {
            return false;
          }
        } else {
          // Cases like https://ru.wikipedia.org/?diff=115909247
          if (authorData.link || authorData.talkLink) {
            return false;
          }
        }
        authorData.isLastLinkAuthorLink = true;
      } else {
        // Don't return false here in case the user mentioned a redirect to their user page here.
      }
    }
    return true;
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
        let isExtraSignature = false;

        // If the closest block-level timestamp element ancestor has more than one signature, we
        // choose the first signature to consider it the signature of the comment author while
        // keeping the last. There is no point for us to parse them as distinct comments as a reply
        // posted using our script will go below all of them anyway.
        let closestBlockAncestor;
        for (let el = timestamp.element; !closestBlockAncestor; el = el.parentNode) {
          if (isInline(el)) {
            // Simultaneously check if we are inside an unsigned template.
            if (el.classList.contains(cd.config.unsignedClass)) {
              unsignedElement = el;
            }
          } else {
            closestBlockAncestor = el;
          }
        }
        const elementsTreeWalker = new ElementsTreeWalker(timestamp.element, closestBlockAncestor);
        while (elementsTreeWalker.previousNode()) {
          if (elementsTreeWalker.currentNode.classList.contains('cd-signature')) {
            isExtraSignature = true;
            break;
          }
        }

        const isUnsigned = Boolean(unsignedElement);
        const startElement = unsignedElement || timestamp.element;
        const treeWalker = new ElementsAndTextTreeWalker(startElement);
        const authorData = {};

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
            authorData.isLastLinkAuthorLink = false;

            if (node.tagName === 'A') {
              if (!this.processLinkData(node, authorData)) break;
            } else {
              const links = [...node.getElementsByTagName('a')].reverse();
              for (const link of links) {
                // https://en.wikipedia.org/wiki/Template:Talkback and similar cases
                if (link.classList.contains('external')) continue;

                this.processLinkData(link, authorData);
              }
            }

            if (authorData.isLastLinkAuthorLink) {
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
            authorData.name &&
            newNode?.tagName &&
            ['S', 'STRIKE', 'DEL'].includes(newNode.tagName)
          ) {
            break;
          }
        } while (newNode && length < cd.config.signatureScanLimit);

        if (!authorData.name) return;

        if (!signatureNodes.length) {
          signatureNodes = [startElement];
        }

        const fseIndex = signatureNodes.indexOf(firstSignatureElement);
        signatureNodes.splice(fseIndex === -1 ? 1 : fseIndex + 1);

        const anchor = generateCommentAnchor(timestamp.date, authorData.name, true);
        registerCommentAnchor(anchor);
        const signatureContainer = signatureNodes[0].parentNode;
        const startElementNextSibling = signatureNodes[0].nextSibling;
        const element = document.createElement('span');
        element.classList.add('cd-signature');
        signatureNodes.reverse().forEach(element.appendChild.bind(element));
        signatureContainer.insertBefore(element, startElementNextSibling);

        return {
          element,
          timestampElement,
          timestampText,
          date,
          authorLink: authorData.link,
          authorTalkLink: authorData.talkLink,
          authorName: authorData.name,
          anchor,
          isUnsigned,
          isExtraSignature,
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
      [...cd.g.rootElement.getElementsByClassName(cd.config.unsignedClass)]
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
          [...element.getElementsByTagName('a')].some((link) => {
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

    // Move extra signatures (additional signatures for a comment, if there is more than one) to an
    // array which then assign to a relevant signature (the one which goes first).
    let extraSignatures = [];
    return signatures
      .slice()
      .reverse()
      .map((sig) => {
        if (sig.isExtraSignature) {
          extraSignatures.push(sig);
        } else {
          sig.extraSignatures = extraSignatures;
          extraSignatures = [];
        }
        return Object.assign({ type: 'signature' }, sig);
      })
      .filter((sig) => !sig.isExtraSignature);
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
   * @param {boolean} [onlyChildrenWithoutCommentLevel=false]
   * @returns {object}
   */
  getTopElementsWithText(element, onlyChildrenWithoutCommentLevel = false) {
    // We ignore all spaces as an easy way to ignore only whitespace text nodes between element
    // nodes (this is a bad idea if we deal with inline nodes, but here we deal with lists).
    const partTextNoSpaces = element.textContent.replace(/\s+/g, '');

    let nodes;
    let children = [element];
    let levelsPassed = 0;
    do {
      nodes = children;
      children = nodes.reduce(
        (arr, element) => arr.concat([...element[this.context.childElementsProp]]),
        []
      );
      if (['DL', 'UL', 'OL'].includes(nodes[0].tagName)) {
        levelsPassed++;
      }
    } while (
      children.length &&
      children.every((child) => (
        (
          ['DL', 'UL', 'OL', 'DD', 'LI'].includes(child.tagName) &&
          (
            !onlyChildrenWithoutCommentLevel ||
            ['DD', 'LI'].includes(child.tagName) ||
            child.classList.contains('cd-commentLevel')
          )
        ) ||

        // An inline (e.g., <small>) tag wrapped around block tags can give that (due to some errors
        // in the markup).
        (!child.textContent.trim() && isInline(child))
      )) &&
      children.map((child) => child.textContent).join('').replace(/\s+/g, '') === partTextNoSpaces
    );

    return { nodes, levelsPassed };
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
