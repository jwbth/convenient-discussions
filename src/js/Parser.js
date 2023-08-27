// Here, we use vanilla JavaScript for recurring operations that together take up a lot of time.

import CommentSkeleton from './CommentSkeleton';
import cd from './cd';
import { ElementsAndTextTreeWalker, ElementsTreeWalker } from './treeWalker';
import { defined, isInline, isMetadataNode, ucFirst, underlinesToSpaces } from './utils';
import { parseTimestamp } from './timestamp';

let punctuationRegexp;

/**
 * @typedef {object} GetPageNameFromUrlReturn
 * @property {string} pageName
 * @property {string} domain
 * @property {string} fragment
 * @memberof Parser
 * @inner
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
  let domain = cd.g.hostname;
  let fragment;
  let pageName = url
    .replace(/^(?:https?:)?\/\/([^/]+)/, (s, m1) => {
      domain = m1;
      return '';
    })
    .replace(cd.g.startsWithArticlePathRegexp, '')
    .replace(cd.g.startsWithScriptTitleRegexp, '')
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
 * @typedef {object} Context
 * @property {Function} CommentClass
 * @property {Function} SectionClass
 * @property {string} childElementsProp
 * @property {Function} follows
 * @property {Function} getAllTextNodes
 * @property {Function} getElementByClassName
 * @property {Element|external:Element} rootElement
 * @property {boolean} areThereOutdents
 * @property {Function} handleDtMarkup
 * @property {Function} removeDtButtonHtmlComments
 */

/**
 * Generalization of a web page (not wikitext) parser for the window and worker contexts. Parsing
 * here means "extracting meaningful parts from the page" such as comments, sections, etc. Functions
 * related to wikitext parsing go in {@link module:wikitext}.
 */
class Parser {
  /**
   * Create a page parser in the provided context.
   *
   * @param {Context} context Collection of classes, functions, and other properties that perform
   *   the tasks we need in the current context (window or worker).
   */
  constructor(context) {
    this.timestampToSignature = this.timestampToSignature.bind(this);

    this.context = context;
    this.existingCommentIds = [];
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
   * disabled DT) in `BootProcess#processTargets`. Unless the elements prove useful to
   * CD or other scripts, it's better to get rid of them rather than deal with them one by one while
   * parsing.
   */
  processAndRemoveDtMarkup() {
    const elements = [...this.context.rootElement.getElementsByTagName('span')]
      .filter((el) => (
        el.hasAttribute('data-mw-comment-start') ||
        el.hasAttribute('data-mw-comment-end')
      ))
      .concat(
        [...this.context.rootElement.getElementsByClassName('ext-discussiontools-init-replylink-buttons')]
      );
    this.context.handleDtMarkup(elements);
    this.context.removeDtButtonHtmlComments();
  }

  /**
   * Set some properties required for parsing comments.
   *
   * @private
   */
  initCommentParsing() {
    // "Ombox" for templates like https://ru.wikipedia.org/wiki/Template:Сложное_обсуждение
    // (perhaps they need to be "tmbox" too?).
    this.rejectClasses = [
      'cd-comment-part',
      'ombox',
      ...cd.config.closedDiscussionClasses,
      cd.config.outdentClass,
    ];

    const classSelector = cd.g.noSignatureClasses.map((name) => `.${name}`).join(', ');

    // Example of a comment in a figure element:
    // https://ru.wikipedia.org/w/index.php?title=Википедия%3AФорум%2FНовости&diff=prev&oldid=131939933
    const tagSelector = ['blockquote', 'q', 'cite', 'figure'].join(', ');

    this.noSignatureElements = [
      ...this.context.rootElement.querySelectorAll(`${tagSelector}, ${classSelector}`),
    ];
  }

  /**
   * Handle outdent character sequences added by
   * {@link https://en.wikipedia.org/wiki/User:Alexis_Jazz/Factotum Factotum}.
   *
   * @param {string} text
   * @param {Node|external:Node} node
   * @private
   */
  handleFactotumOutdents(text, node) {
    const span = document.createElement('span');
    span.className = cd.config.outdentClass;
    span.textContent = text;
    if (node.nextSibling?.tagName === 'BR') {
      node.nextSibling.remove();
    }

    // Don't have `Node#replaceChild` in the worker.
    node.parentNode.insertBefore(span, node);
    node.remove();
  }

  /**
   * @typedef {object} Timestamp
   * @property {Element|external:Element} element
   * @property {Date} date
   * @property {object} [match]
   * @memberof Parser
   * @inner
   */

  /**
   * _For internal use._ Find timestamps under the root element.
   *
   * @returns {Timestamp[]}
   * @private
   */
  findTimestamps() {
    this.initCommentParsing();

    return this.context.getAllTextNodes()
      .map((node) => {
        const text = node.textContent;

        // While we're here, wrap outdents inserted by Factotum into a span.
        if (
          /^┌─*┘$/.test(text) &&
          !node.parentNode.classList.contains(cd.config.outdentClass) &&
          !node.parentNode.parentNode.classList.contains(cd.config.outdentClass)
        ) {
          this.handleFactotumOutdents(text, node);
        }

        const { date, match } = parseTimestamp(text) || {};
        if (date && !this.noSignatureElements.some((el) => el.contains(node))) {
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
        const afterNode = remainedText ? document.createTextNode(remainedText) : undefined;
        node.textContent = match[1];
        node.parentNode.insertBefore(element, node.nextSibling);
        if (afterNode) {
          node.parentNode.insertBefore(afterNode, element.nextSibling);
        }
        return { element, date };
      });
  }

  /**
   * Given a link node, enrich the author data and return a boolean denoting whether the node is a
   * part of the signature.
   *
   * @param {Element|external:Element} link
   * @param {object} authorData
   * @returns {boolean}
   * @private
   */
  processLinkData(link, authorData) {
    const { userName, linkType } = Parser.processLink(link) || {};
    if (userName) {
      authorData.name ||= userName;
      if (authorData.name === userName) {
        if (['user', 'userForeign'].includes(linkType)) {
          // Break only when the second user link is a link to another wiki (but not the other way
          // around, see an example: https://en.wikipedia.org/?diff=1012665097).
          if (authorData.notForeignLink && linkType === 'userForeign') {
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
          // `authorData.contribsNotForeignLink` is used only to make sure there are no two contribs
          // links to the current domain in a signature.
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
   * @param {object} timestamp
   * @returns {object}
   * @private
   */
  timestampToSignature(timestamp) {
    punctuationRegexp ||= new RegExp(`(?:^|${cd.g.letterPattern})[.!?…] `);

    let unsignedElement;
    let el = timestamp.element;
    while (!unsignedElement && (el = el.parentNode) && isInline(el)) {
      if (el.classList.contains(cd.config.unsignedClass)) {
        unsignedElement = el;
      }
    }

    // If the closest block-level timestamp element ancestor has more than one signature, we choose
    // the first signature to consider it the signature of the comment author while keeping the
    // last. There is no point for us to parse them as distinct comments as a reply posted using our
    // script will go below all of them anyway.
    let isExtraSignature = false;
    const elementsTreeWalker = new ElementsTreeWalker(timestamp.element);
    while (
      elementsTreeWalker.previousNode() &&
      (isInline(elementsTreeWalker.currentNode) || isMetadataNode(elementsTreeWalker.currentNode))
    ) {
      if (elementsTreeWalker.currentNode.classList.contains('cd-signature')) {
        isExtraSignature = true;
        break;
      }
    }

    const startElement = unsignedElement || timestamp.element;
    const treeWalker = new ElementsAndTextTreeWalker(startElement, this.context.rootElement);
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

    // Unsigned template may be of the "undated" kind - containing a timestamp but no author name,
    // so we need to walk the tree anyway.
    let node = treeWalker.currentNode;
    do {
      length += node.textContent.length;
      if (node.tagName) {
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

      node = treeWalker.previousSibling();
      if (!node && !firstSignatureElement) {
        node = treeWalker.parentNode();
        if (!node || !isInline(node)) break;
        length = 0;
        signatureNodes = [];
      }
    } while (
      node &&
      length < cd.config.signatureScanLimit &&
      !(
        (
          authorData.name &&
          (
            // Users may cross out the text ended with their signature and sign again
            // (https://ru.wikipedia.org/?diff=114726134). The strike element shouldn't be considered
            // a part of the signature then.
            (node.tagName && ['S', 'STRIKE', 'DEL'].includes(node.tagName)) ||

            // Cases like
            // https://ru.wikipedia.org/wiki/Википедия:Заявки_на_статус_администратора/Obersachse_3#c-Obersachse-2012-03-11T08:03:00.000Z-Итог
            // Note that this is currently unsupported by the wikitext parser. When edited, such a
            // comment will be cut at the first user link. You would need to discern ". " inside
            // outside of links or even tags, and this is much work for little gain. This is the
            // cost of us not relying on a DOM -> wikitext correspondence and processing those parts
            // separately.
            (!node.tagName && punctuationRegexp.test(node.textContent))
          )
        ) ||
        (
          node.tagName &&
          (
            node.classList.contains('cd-timestamp') ||

            // Workaround for cases like https://en.wikipedia.org/?diff=1042059387 (those should be
            // extremely rare).
            (['S', 'STRIKE', 'DEL'].includes(node.tagName) && length >= 30)
          )
        )
      )
    );

    if (!authorData.name) return;

    if (!signatureNodes.length) {
      signatureNodes = [startElement];
    }

    const fseIndex = signatureNodes.indexOf(firstSignatureElement);
    signatureNodes.splice(fseIndex === -1 ? 1 : fseIndex + 1);

    const signatureContainer = signatureNodes[0].parentNode;
    const startElementNextSibling = signatureNodes[0].nextSibling;
    const element = document.createElement('span');
    element.classList.add('cd-signature');
    signatureNodes.reverse().forEach(element.appendChild.bind(element));
    signatureContainer.insertBefore(element, startElementNextSibling);

    return {
      element,
      timestampElement: timestamp.element,
      timestampText: timestamp.element.textContent,
      date: timestamp.date,
      authorLink: authorData.link,
      authorTalkLink: authorData.talkLink,
      authorName: authorData.name,
      isUnsigned: Boolean(unsignedElement),
      isExtraSignature,
    };
  }

  /**
   * Find outputs of unsigned templates.
   *
   * @returns {object[]}
   */
  findUnsigneds() {
    if (!cd.config.unsignedClass) {
      return [];
    }

    const unsigneds = [];
    [...this.context.rootElement.getElementsByClassName(cd.config.unsignedClass)]
      .filter((element) => {
        // Only templates with no timestamp interest us.
        if (this.context.getElementByClassName(element, 'cd-timestamp')) {
          return false;
        }

        // Cases like https://ru.wikipedia.org/?diff=84883816
        for (let el = element; el && el !== this.context.rootElement; el = el.parentNode) {
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

    return unsigneds;
  }

  /**
   * _For internal use._ Find signatures under the root element.
   *
   * Characters before the author link, like "—", aren't considered a part of the signature.
   *
   * @returns {object[]}
   */
  findSignatures() {
    let signatures = this.findTimestamps()
      .map(this.timestampToSignature)
      .filter(defined);
    signatures.push(...this.findUnsigneds());

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
   * ```html
   *   * Smth. [signature]
   *   :: Smth. [signature]
   * ```
   *
   * one comment (preceded by :: in this case) creates its own list tree, not a subtree, even though
   * it's a reply to a reply. So we dive as deep to the bottom of the hierarchy of nested lists as
   * we can to get the top nodes with comment content (and therefore draw comment layers more
   * accurately). One of the most complex tree structures is this:
   *
   * ```html
   *    * Smth. [signature]
   *    :* Smth.
   *    :: Smth. [signature]
   * ```
   *
   * (seen here:
   * {@link https://ru.wikipedia.org/w/index.php?title=Википедия:Форум/Общий&oldid=103760740#201912010211_Mikhail_Ryazanov})
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
      ...this.context.rootElement.getElementsByTagName('h1'),
      ...this.context.rootElement.getElementsByTagName('h2'),
      ...this.context.rootElement.getElementsByTagName('h3'),
      ...this.context.rootElement.getElementsByTagName('h4'),
      ...this.context.rootElement.getElementsByTagName('h5'),
      ...this.context.rootElement.getElementsByTagName('h6'),
    ]
      .filter((el) => el.getAttribute('id') !== 'mw-toc-heading')
      .map((element) => ({
        type: 'heading',
        element,
      }));
  }

  /**
   * Turn a structure like this
   * ```html
   * <dd>
   *   <div>Comment. [signature]</div>
   *   <ul>...</ul>
   * </dd>
   * ```
   * into a structure like this
   * ```html
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
   * @returns {Array.<Element|external:Element>} The parent nodes resultant from the split (at least
   *   one).
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
   * @property {string} userName User name.
   * @property {?string} linkType Link type (`user`, `userTalk`, `contribs`, `userSubpage`,
   *   `userTalkSubpage`, or any of this `Foreign` at the end).
   * @memberof Parser
   * @inner
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
      if (!pageName || CommentSkeleton.isAnyId(fragment)) {
        return null;
      }
      const match = pageName.match(cd.g.userNamespacesRegexp);
      if (match) {
        userName = match[1];
        if (cd.g.userLinkRegexp.test(pageName)) {
          linkType = 'user';
        } else if (cd.g.userTalkLinkRegexp.test(pageName)) {
          linkType = 'userTalk';
        } else if (cd.g.userSubpageLinkRegexp.test(pageName)) {
          linkType = 'userSubpage';
        } else if (cd.g.userTalkSubpageLinkRegexp.test(pageName)) {
          linkType = 'userTalkSubpage';
        }

        // Another alternative is a user link to another site where a prefix is specified before a
        // namespace. Enough to capture a user name from, not enough to make any inferences.
      } else if (pageName.startsWith(cd.g.contribsPage + '/')) {
        userName = pageName.replace(cd.g.contribsPageLinkRegexp, '');
        if (cd.g.isIPv6Address(userName)) {
          userName = userName.toUpperCase();
        }
        linkType = 'contribs';
      }
      if (domain !== cd.g.hostname) {
        linkType += 'Foreign';
      }
      userName &&= ucFirst(underlinesToSpaces(userName.replace(/\/.*/, ''))).trim();
    } else {
      if (
        element.classList.contains('mw-selflink') &&
        cd.g.namespaceNumber === 3 &&
        !cd.g.pageName.includes('/')
      ) {
        // Comments of users that have only the user talk page link in their signature on their talk
        // page.
        userName = cd.g.pageTitle;
      } else {
        return null;
      }
    }
    return { userName, linkType };
  }
}

export default Parser;
