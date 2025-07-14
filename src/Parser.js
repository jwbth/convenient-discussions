// Here, we use vanilla JavaScript for recurring operations that together take up a lot of time.

import CommentSkeleton from './CommentSkeleton';
import ElementsAndTextTreeWalker from './ElementsAndTextTreeWalker';
import ElementsTreeWalker from './ElementsTreeWalker';
import cd from './cd';
import { getHeadingLevel, parseWikiUrl, isHeadingNode, isInline, isMetadataNode, ucFirst, underlinesToSpaces, definedAndNotNull, unique, isDomHandlerElement, isElement } from './utils-general';
import { parseTimestamp } from './utils-timestamp';

/**
 * @typedef {object} Context
 * @property {Constructor} CommentClass
 * @property {Constructor} SectionClass
 * @property {string} childElementsProp
 * @property {(el1: NodeLike, el2: NodeLike) => boolean} follows
 * @property {() => TextLikeArray} getAllTextNodes
 * @property {(el: ElementLike, className: string) => ElementLike | null} getElementByClassName
 * @property {ElementLike} rootElement
 * @property {() => boolean} areThereOutdents
 * @property {(elements: ElementLikeArray, bootProcess?: import('./BootProcess').default) => void} processAndRemoveDtElements
 * @property {() => void} removeDtButtonHtmlComments
 */

/**
 * @typedef {object} HeadingTarget
 * @property {'heading'} type
 * @property {boolean} isWrapper
 * @property {number} level
 * @property {ElementLike} element
 */

/**
 * @typedef {object} SignatureTarget
 * @property {'signature'} type
 * @property {ElementLike} element
 * @property {ElementLike} element
 * @property {ElementLike} timestampElement
 * @property {string} timestampText
 * @property {Date} date
 * @property {ElementLike} authorLink
 * @property {ElementLike} authorTalkLink
 * @property {string} authorName
 * @property {boolean} isUnsigned
 * @property {boolean} isExtraSignature
 * @property {ElementLikeArray} extraSignatures
 * @property {CommentSkeleton} [comment]
 */

/**
 * @typedef {HeadingTarget|SignatureTarget} Target
 */

/**
 * Generalization of a web page (not wikitext) parser for the window and worker contexts. Parsing
 * here means "extracting meaningful parts from the page" such as comments, sections, etc. Functions
 * related to wikitext parsing go in {@link module:wikitext}.
 */
class Parser {
  /** @type {RegExp} */
  static punctuationRegexp;

  /** @type {ElementLikeArray} */
  noSignatureElements;

  /** @type {string[]} */
  rejectClasses;

  /**
   * Create a page parser in the provided context.
   *
   * @param {Context} context Collection of classes, functions, and other properties that perform
   *   the tasks we need in the current context (window or worker).
   */
  constructor(context) {
    this.context = context;
    this.existingCommentIds = [];
  }

  /**
   * _For internal use._ Set some properties and find some elements required for parsing.
   */
  init() {
    this.rejectClasses = [
      'cd-comment-part',

      // Extension:Translate
      'mw-pt-languages',

      // Likely won't have much effect, but won't hurt
      'mw-archivedtalk',

      // For templates like https://ru.wikipedia.org/wiki/Template:Сложное_обсуждение (perhaps they
      // need to be `tmbox` too?).
      'ombox',

      ...cd.config.closedDiscussionClasses,
      cd.config.outdentClass,
    ];

    // Example of a comment in a figure element:
    // https://ru.wikipedia.org/w/index.php?title=Википедия%3AФорум%2FНовости&diff=prev&oldid=131939933
    const tagSelector = ['blockquote', 'q', 'cite', 'figure', 'th'].join(', ');

    const classSelector = cd.g.noSignatureClasses.map((name) => `.${name}`).join(', ');

    this.noSignatureElements = /** @type {ElementLikeArray} */ ([
      ...this.context.rootElement.querySelectorAll(`${tagSelector}, ${classSelector}`),
    ]);
  }

  /**
   * Create a comment instance.
   *
   * @param {SignatureTarget} signature
   * @param {Target[]} targets
   * @returns {*}
   */
  createComment(signature, targets) {
    return new this.context.CommentClass(this, signature, targets);
  }

  /**
   * Create a section instance.
   *
   * @param {HeadingTarget} heading
   * @param {Target[]} targets
   * @param {import('./Subscriptions').default} [subscriptions]
   * @returns {*}
   */
  createSection(heading, targets, subscriptions) {
    return new this.context.SectionClass(this, heading, targets, subscriptions);
  }

  /**
   * _For internal use._ Remove some of the elements added by the DiscussionTools extension (even if
   * it is disabled in user preferences) or move them away if the topic subscriptions feature of DT
   * is enabled (to avoid errors being thrown in DT). Prior to that, extract data from them.
   *
   * CD already parses comment links from notifications (which seems to be this markup's purpose for
   * disabled DT) in `BootProcess#processTargets()`. Unless the elements prove useful to CD or other
   * scripts, it's better to get rid of them rather than deal with them one by one while parsing.
   *
   * @param {import('./BootProcess').default} [bootProcess]
   */
  processAndRemoveDtMarkup(bootProcess) {
    const elements = /** @type {ElementLikeArray} */ ([...this.context.rootElement.getElementsByTagName('span')]
      .filter((el) => (
        el.hasAttribute('data-mw-comment-start') ||
        el.hasAttribute('data-mw-comment-end') ||

        // This, in fact, targets the one span at the top of the page, out of sections which makes
        // comments taller (example:
        // https://commons.wikimedia.org/w/index.php?title=User_talk:Jack_who_built_the_house/CD_test_page&oldid=876639400).
        // Check for classes and content because in older DT versions, `data-mw-thread-id` was on
        // the .mw-headline element.
        (
          el.tagName === 'SPAN' &&
          el.hasAttribute('data-mw-thread-id') &&
          !el.classList.length &&
          !el.textContent
        )
      ))
      .concat(
        [...this.context.rootElement.getElementsByClassName('ext-discussiontools-init-replylink-buttons')]
      )
      .filter(unique));
    this.context.processAndRemoveDtElements(elements, bootProcess);
    this.context.removeDtButtonHtmlComments();
  }

  /**
   * Handle outdent character sequences added by
   * {@link https://en.wikipedia.org/wiki/User:Alexis_Jazz/Factotum Factotum}.
   *
   * @param {string} text
   * @param {TextLike} node
   * @private
   */
  handleFactotumOutdents(text, node) {
    if (
      !/^┌─*┘$/.test(text) ||
      node.parentElement?.classList.contains(cd.config.outdentClass) ||
      node.parentElement?.parentElement?.classList.contains(cd.config.outdentClass)
    ) {
      return;
    }

    const span = document.createElement('span');
    span.className = cd.config.outdentClass;
    span.textContent = text;
    if (isElement(node.nextSibling) && node.nextSibling.tagName === 'BR') {
      node.nextSibling.remove();
    }

    // Don't have Node#replaceChild() in the worker.
    node.parentElement?.insertBefore(span, node);
    node.remove();
  }

  /**
   * @typedef {object} Timestamp
   * @property {ElementLike} element
   * @property {Date} date
   * @property {object} [match]
   * @memberof Parser
   * @inner
   */

  /**
   * Find a timestamp in a text node.
   *
   * @param {TextLike} node
   * @returns {?Timestamp}
   * @private
   */
  findTimestamp(node) {
    const text = node.textContent;

    // While we're here, wrap outdents inserted by Factotum into a span.
    this.handleFactotumOutdents(text, node);

    const { date, match } = parseTimestamp(text) || {};
    if (
      !date ||
      this.noSignatureElements.some((/** @type {ElementLike} */ el) => el.contains(node))
    ) {
      return null;
    }

    const element = document.createElement('span');
    element.classList.add('cd-timestamp');
    element.appendChild(document.createTextNode(match[2]));
    const remainedText = node.textContent.slice(match.index + match[0].length);
    const afterNode = remainedText ? document.createTextNode(remainedText) : undefined;
    node.textContent = match[1];
    node.parentElement?.insertBefore(element, node.nextSibling);
    if (afterNode) {
      node.parentElement?.insertBefore(afterNode, element.nextSibling);
    }

    return { element, date };
  }

  /**
   * Collect nodes related to a signature starting from a timestamp node.
   *
   * @param {Timestamp} timestamp
   * @returns {?Omit<SignatureTarget, 'type' | 'extraSignatures'>}
   * @private
   */
  getSignatureFromTimestamp(timestamp) {
    let unsignedElement;
    {
      let /** @type {ElementLike | null} */ el = timestamp.element;
      while (!unsignedElement && (el = el.parentElement) && isInline(el) !== false) {
        if (el.classList.contains(cd.config.unsignedClass)) {
          unsignedElement = el;
        }
      }
    }

    // If the closest block-level timestamp element ancestor has more than one signature, we choose
    // the first signature to consider it the signature of the comment author while keeping the
    // last. There is no point for us to parse them as distinct comments as a reply posted using our
    // script will go below all of them anyway.
    let isExtraSignature = false;
    const elementsTreeWalker = new ElementsTreeWalker(this.context.rootElement, timestamp.element);
    while (
      elementsTreeWalker.previousNode() &&
      (
        isInline(elementsTreeWalker.currentNode) !== false ||
        isMetadataNode(elementsTreeWalker.currentNode)
      )
    ) {
      if (elementsTreeWalker.currentNode.classList.contains('cd-signature')) {
        isExtraSignature = true;
        break;
      }
    }

    const startElement = unsignedElement || timestamp.element;
    const treeWalker = new ElementsAndTextTreeWalker(this.context.rootElement, startElement);
    const authorData = {};

    let length = 0;
    let firstSignatureElement;
    /** @type {NodeLike[]} */
    let signatureNodes = [];
    if (unsignedElement) {
      firstSignatureElement = startElement;
    } else {
      signatureNodes.push(startElement);
      treeWalker.previousSibling();
    }

    // Unsigned template may be of the "undated" kind - containing a timestamp but no author name,
    // so we need to walk the tree anyway.
    let /** @type {ElementLike | TextLike | null} */ node = treeWalker.currentNode;
    do {
      length += node.textContent.length;
      if (isElement(node)) {
        authorData.isLastLinkAuthorLink = false;

        if (node.tagName === 'A') {
          if (!Parser.processLinkData(node, authorData)) break;
        } else {
          const links = [...node.getElementsByTagName('a')].reverse();
          for (const link of links) {
            // https://en.wikipedia.org/wiki/Template:Talkback and similar cases
            if (link.classList.contains('external')) continue;

            Parser.processLinkData(link, authorData);
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
        if (!node || isInline(node) === false) break;

        length = 0;
        signatureNodes = [];
      }
    } while (
      length < cd.config.signatureScanLimit &&
      node &&
      isInline(node, true) !== false &&
      !(
        (
          authorData.name &&
          (
            // Users may cross out the text ended with their signature and sign again
            // (https://ru.wikipedia.org/?diff=114726134). The strike element shouldn't be
            // considered a part of the signature then.
            (isElement(node) && ['S', 'STRIKE', 'DEL'].includes(node.tagName)) ||

            // Cases with a talk page link at the end of comment's text like
            // https://ru.wikipedia.org/wiki/Википедия:Заявки_на_статус_администратора/Obersachse_3#c-Obersachse-2012-03-11T08:03:00.000Z-Итог
            // Note that this is currently unsupported by our wikitext parser. When edited, such a
            // comment will be cut at the first user link. You would need to discern ". " inside and
            // outside of links or even tags, and this is much work for little gain. This is the
            // cost of us not relying on a DOM -> wikitext correspondence and processing these parts
            // separately.
            (!isElement(node) && Parser.punctuationRegexp.test(node.textContent)) ||

            (
              isElement(node) &&

              (
                // Invisible pings, like
                // https://he.wikipedia.org/w/index.php?title=שיחה:שפת_אמת&oldid=38365117#c-אייל-20240205174400-אייל-20240205172600
                /display: *none/.test(node.getAttribute('style') || '') ||

                this.noSignatureElements.some(
                  (/** @type {ElementLike} */ noSigEl) => noSigEl === node
                )
              )
            )
          )
        ) ||
        (
          isElement(node) &&
          (
            node.classList.contains('cd-timestamp') ||
            node.classList.contains('cd-signature') ||

            // Workaround for cases like https://en.wikipedia.org/?diff=1042059387 (those should be
            // extremely rare).
            (['S', 'STRIKE', 'DEL'].includes(node.tagName) && node.textContent.length >= 30) ||

            // Cases like
            // https://ru.wikipedia.org/?diff=141883529#c-Супер-Вики-Патруль-20241204140000-Stjn-20241204123400
            node.textContent.length >= cd.config.signatureScanLimit
          )
        )
      )
    );

    if (!authorData.name) {
      return null;
    }

    if (!signatureNodes.length) {
      signatureNodes = [startElement];
    }

    const fseIndex = firstSignatureElement ? signatureNodes.indexOf(firstSignatureElement) : -1;
    signatureNodes.splice(fseIndex === -1 ? 1 : fseIndex + 1);

    const signatureContainer = /** @type {ElementLike} */ (signatureNodes[0].parentNode);
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
   * Find outputs of unsigned templates that we weren't able to find using the standard procedure
   * (in which case they are treated as normal signatures).
   *
   * @returns {Partial<SignatureTarget>[]}
   */
  findRemainingUnsigneds() {
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
        for (
          let /** @type {ElementLike | null} */ el = element;
          el && el !== this.context.rootElement;
          el = el.parentElement
        ) {
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
            unsigneds.push({
              element,
              authorName,
              isUnsigned: true,
              authorLink,
              authorTalkLink,
            });

            return true;
          }

          return false;
        });
      });

    return unsigneds;
  }

  /**
   * _For internal use._ Find signatures under the root element.
   *
   * Characters before the author link, like "—", aren't considered a part of the signature.
   *
   * @returns {SignatureTarget[]}
   */
  findSignatures() {
    const signatures = this.context.getAllTextNodes()
      .map(this.findTimestamp.bind(this))
      .filter(definedAndNotNull)
      .map(this.getSignatureFromTimestamp.bind(this))
      .filter(definedAndNotNull)
      .concat(this.findRemainingUnsigneds());

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

        return { type: 'signature', ...sig };
      })
      .filter((sig) => !sig.isExtraSignature);
  }

  /**
   * With code like this:
   *
   * ```html
   * * Smth. [signature]
   * :: Smth. [signature]
   * ```
   *
   * one comment (preceded by :: in this case) creates its own list tree, not a subtree, even though
   * it's a reply to a reply. So we dive as deep to the bottom of the hierarchy of nested lists as
   * we can to get the top nodes with comment content (and therefore draw comment layers more
   * accurately). One of the most complex tree structures is this:
   *
   * ```html
   *  * Smth. [signature]
   *  :* Smth.
   *  :: Smth. [signature]
   * ```
   *
   * (seen here:
   * {@link https://ru.wikipedia.org/w/index.php?title=Википедия:Форум/Общий&oldid=103760740#201912010211_Mikhail_Ryazanov})
   * It has a branchy structure that requires a tricky algorithm to be parsed correctly.
   *
   * @param {ElementLike} element
   * @param {boolean} [onlyChildrenWithoutCommentLevel=false]
   * @returns {{
   *   nodes: ElementLike[];
   *   levelsPassed: number;
   * }}
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
        /** @type {ElementLikeArray} */ ([])
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
   * @returns {HeadingTarget[]}
   */
  findHeadings() {
    return [...this.context.rootElement.querySelectorAll('h1, h2, h3, h4, h5, h6')]
      .map((element) => {
        for (
          let /** @type {ElementLike | null} */ el = element;
          el && el !== this.context.rootElement;
          el = el.parentElement
        ) {
          if (el.classList.contains('mw-heading')) {
            return el;
          }
        }

        return element;
      })
      .filter(
        (element) =>
          element.getAttribute('id') !== 'mw-toc-heading' &&
          !this.noSignatureElements.some((/** @type {ElementLike} */ noSigEl) =>
            noSigEl.contains(element)
          )
      )
      .map((element) => ({
        type: 'heading',
        isWrapper: !isHeadingNode(element, true),
        level: /** @type {number} */ (getHeadingLevel(element)),
        element,
      }));
  }

  /**
   * Turn a structure like this
   *
   * ```html
   * <dd>
   *   <div>Comment. [signature]</div>
   *   <ul>...</ul>
   * </dd>
   * ```
   *
   * into a structure like this
   *
   * ```html
   * <dd>
   *   <div>Comment. [signature]</div>
   * </dd>
   * <dd>
   *   <ul>...</ul>
   * </dd>
   * ```
   *
   * by splitting the parent node of the given node, moving all the following nodes into the second
   * node resulting from the split. If there is no following nodes, don't perform the split.
   *
   * @param {NodeLike} node Reference node.
   * @returns {{
   *   parent: ElementLike,
   *   clone: ElementLike,
   * }} The parent nodes resultant from the split (at least one).
   */
  splitParentAfterNode(node) {
    const parent = /** @type {ElementLike} */ (node.parentElement);

    // TypeScript things...
    const clone = isDomHandlerElement(parent)
      ? parent.cloneNode()
      : /** @type {Element} */ (parent.cloneNode());

    let lastChild;
    while ((lastChild = parent.lastChild) && lastChild !== node) {
      const firstChild = /** @type {NodeLike} */ (clone.firstChild);
      clone.insertBefore(lastChild, firstChild);

      // if (isDomHandlerNode(clone) && isDomHandlerNode(lastChild) && isDomHandlerNode(firstChild)) {
      //   clone.insertBefore(lastChild, firstChild);
      // } else if (!isDomHandlerNode(clone) && !isDomHandlerNode(firstChild) && !isDomHandlerNode(lastChild)) {
      //   clone.insertBefore(lastChild, firstChild);
      // }
    }
    if (clone[this.context.childElementsProp].length > 0) {
      parent.parentElement?.insertBefore(clone, parent.nextSibling);
    }

    return { parent, clone };
  }

  /**
   * @typedef {'user' | 'userTalk' | 'contribs' | 'userSubpage' | 'userTalkSubpage' | 'userForeign' | 'userTalkForeign' | 'contribsForeign' | 'userSubpageForeign' | 'userTalkSubpageForeign' | 'unknown'} LinkType
   */

  /**
   * @typedef {object} ProcessLinkReturn
   * @property {string} userName User name.
   * @property {LinkType} linkType Link type.
   * @memberof Parser
   * @inner
   */

  /**
   * _For internal use._ Get a user name from a link, along with some other data about a page name.
   *
   * @param {ElementLike} element
   * @returns {?ProcessLinkReturn}
   */
  static processLink(element) {
    const href = element.getAttribute('href');
    let userName;
    /** @type {LinkType} */
    let linkType = 'unknown';
    if (href) {
      const { pageName, hostname, fragment } = parseWikiUrl(href) || {};
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

        // Another alternative is a user link to another site where the prefix is specified before
        // the namespace. Enough to capture the user name from, not enough to make any inferences.
      } else if (cd.g.contribsPageLinkRegexp.test(pageName)) {
        userName = pageName.replace(cd.g.contribsPageLinkRegexp, '');
        if (cd.g.isIPv6Address?.(userName)) {
          userName = userName.toUpperCase();
        }
        linkType = 'contribs';
      }
      if (hostname !== cd.g.serverName) {
        linkType += 'Foreign';

        // Some bug in type checking - can't do `linkType = /** @type {LinkType} */ (linkType +
        // 'Foreign');` so that linkType doesn't end up just a string.
        // eslint-disable-next-line no-self-assign
        linkType = /** @type {LinkType} */ (linkType);
      }
      if (!userName) {
        return null;
      }

      userName = ucFirst(underlinesToSpaces(userName.replace(/\/.*/, ''))).trim();
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

  /**
   * Given a link node, enrich the author data and return a boolean denoting whether the node is a
   * part of the signature.
   *
   * @param {ElementLike} link
   * @param {object} authorData
   * @returns {boolean}
   * @private
   */
  static processLinkData(link, authorData) {
    const result = this.processLink(link);
    if (result) {
      const { userName, linkType } = result;
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
          // authorData.contribsNotForeignLink is used only to make sure there are no two contribs
          // links to the current hostname in a signature.
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
   * Get a nesting level of an element relative to the root element.
   *
   * @param {ElementLike} element
   * @returns {number}
   */
  getNestingLevel(element) {
    const treeWalker = new ElementsTreeWalker(this.context.rootElement, element);
    let nestingLevel = 0;
    while (treeWalker.parentNode()) {
      nestingLevel++;
    }

    return nestingLevel;
  }

  /**
   * Initialize the class.
   */
  static init() {
    // Parenthesis for the case `smth). ~~~~`
    // https://ru.wikipedia.org/w/index.php?title=Википедия:Форум/Новости&oldid=138050961#c-Lesless-20240526055500-Deinocheirus-20240525165500
    // Non-Latin punctuation is collected manually from https://en.wikipedia.org/wiki/Full_stop and
    // other sources.
    this.punctuationRegexp = new RegExp(`(?:^|[${cd.g.letterPattern}])[)\\]]*(?:[.!?…।։။۔]+ |[。！？]+)`);
  }
}

export default Parser;
