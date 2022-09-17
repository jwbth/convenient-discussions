import CdError from './CdError';
import cd from './cd';
import { ElementsAndTextTreeWalker, ElementsTreeWalker } from './treeWalker';
import {
  generateFixedPosTimestamp,
  isHeadingNode,
  isInline,
  isMetadataNode,
  spacesToUnderlines,
  unique,
} from './utils';

/**
 * Class containing the main properties of a comment. It is extended by {@link Comment}. This class
 * is the only one used in the worker context for comments.
 *
 * @class
 */
class CommentSkeleton {
  /**
   * Create a comment skeleton instance.
   *
   * @param {import('./Parser').default} parser
   * @param {object} signature Signature object returned by {@link Parser#findSignatures}.
   * @param {object[]} targets
   * @throws {CdError}
   */
  constructor(parser, signature, targets) {
    this.parser = parser;

    const signatureIndex = targets.indexOf(signature);

    /**
     * Is the comment preceded by a heading.
     *
     * @type {boolean}
     */
    this.followsHeading = targets[signatureIndex - 1]?.type === 'heading';

    const precedingHeadingElement = this.followsHeading ?
      targets[signatureIndex - 1].element :
      undefined;

    /**
     * _For internal use._ Comment signature element.
     *
     * @type {Element|external:Element}
     */
    this.signatureElement = signature.element;

    /**
     * Comment signature text.
     *
     * @type {string}
     */
    this.signatureText = signature.element.textContent;

    // Identify all comment nodes and save a path to them.
    this.collectParts(precedingHeadingElement);

    // Remove parts contained by other parts.
    this.removeNestedParts();

    // We may need to enclose sibling sequences in a <div> tag in order for them not to be bare (we
    // can't get a bounding client rectangle for text nodes, can't specify margins for them etc.).
    this.encloseInlineParts();

    // At this point, we can safely remove unnecessary nodes.
    this.filterParts();

    this.parts.reverse();

    // <dd>, <li> instead of <dl>, <ul>, <ol> where appropriate.
    this.replaceListsWithItems();

    // Wrap <ol> into <div> or <dl> & <dd> if the comment starts with numbered list items.
    this.wrapNumberedList();

    /**
     * Comment index. Same as the comment's index in
     * {@link convenientDiscussions.comments convenientDiscussions.comments}.
     *
     * @type {number}
     */
    this.index = cd.comments.length;

    /**
     * Comment date.
     *
     * @type {?Date}
     */
    this.date = signature.date || null;

    // Double spaces are from removed dir marks.
    /**
     * Comment timestamp as originally present on the page.
     *
     * @type {string}
     */
    this.timestamp = signature.timestampText?.replace(/ {2,}/g, ' ');

    /**
     * _For internal use._ Comment author name.
     *
     * @type {string}
     */
    this.authorName = signature.authorName;

    /**
     * _For internal use._ Comment timestamp element.
     *
     * @type {Element|external:Element}
     */
    this.timestampElement = signature.timestampElement;

    /**
     * Additional signatures in this comment (that go after the "official" signature).
     *
     * @type {object[]}
     */
    this.extraSignatures = signature.extraSignatures;

    /**
     * _For internal use._ User page (in the "User" namespace) link element.
     *
     * @type {Element|external:Element}
     */
    this.authorLink = signature.authorLink;

    /**
     * _For internal use._ User talk page (in the "User talk" namespace) link element.
     *
     * @type {Element|external:Element}
     */
    this.authorTalkLink = signature.authorTalkLink;

    /**
     * Does the comment belong to the current user.
     *
     * @type {boolean}
     */
    this.isOwn = this.authorName === cd.g.userName;

    /**
     * Comment ID.
     *
     * @type {?string}
     */
    this.id = CommentSkeleton.generateId(this.date, this.authorName, parser.existingCommentIds);

    /**
     * Is the comment unsigned or not properly signed (an unsigned template class is present).
     *
     * Not used anywhere in the script yet.
     *
     * @type {boolean}
     */
    this.isUnsigned = signature.isUnsigned;

    /**
     * _For internal use._ Elements containing all parts of the comment.
     *
     * @type {Element[]|external:Element[]}
     */
    this.elements = this.parts.map((part) => part.node);

    this.setHighlightables();
    this.setLevels();

    if (this.parts[0].isHeading && this.level !== 0) {
      this.parts.shift();
      this.elements.shift();
    }

    if (this.parts[0].isHeading) {
      /**
       * Does the comment open a section (has a heading as the first element and is placed at the
       * zeroth level).
       *
       * @type {boolean}
       */
      this.isOpeningSection = true;

      const headingLevelMatch = this.parts[0].node.tagName.match(/^H([1-6])$/);
      this.openingSectionOfLevel = headingLevelMatch && Number(headingLevelMatch[1]);
    } else {
      this.isOpeningSection = false;
    }

    this.addAttributes();

    /**
     * Section that the comment is directly in (the section with lowest level / the biggest level
     * number).
     *
     * @type {?import('./Section').default}
     */
    this.section = null;

    /**
     * Is the comment outdented with the `{{outdent}}` template.
     *
     * @type {boolean}
     */
    this.isOutdented = false;

    signature.comment = this;
  }

  /**
   * Get nodes to start the traversal from.
   *
   * @param {ElementsAndTextTreeWalker} treeWalker
   * @returns {Array.<object[]|Element>}
   * @private
   */
  getStartNodes(treeWalker) {
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
      while (
        (
          !treeWalker.currentNode.nextSibling ||
          ![Node.ELEMENT_NODE, Node.TEXT_NODE].includes(treeWalker.currentNode.nextSibling.nodeType)
        ) &&
        treeWalker.parentNode()
      );
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
        this.signatureElement.parentNode.contains(firstForeignComponentAfter)
      ) ||

      // Cases when the comment has no wrapper that contains only that comment (for example,
      // https://ru.wikipedia.org/wiki/Project:Форум/Архив/Технический/2020/10#202010140847_AndreiK).
      // The second parameter of getElementsByClassName() is an optimization for the worker context.
      this.signatureElement.parentNode.getElementsByClassName('cd-signature', 2).length > 1 ||

      !this.isElementEligible(this.signatureElement.parentNode, treeWalker, 'start')
    ) {
      // Collect inline parts after the signature
      treeWalker.currentNode = this.signatureElement;
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

      treeWalker.currentNode = this.signatureElement;
    } else {
      treeWalker.currentNode = this.signatureElement.parentNode;
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
    for (let n = element; !table && n !== this.parser.context.rootElement; n = n.parentNode) {
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
        this.parser.foreignComponentClasses.some((name) => element.classList.contains(name)) ||

        // Talk page message box
        (step !== 'up' && cd.g.namespaceNumber % 2 === 1 && element.classList.contains('tmbox'))
      ) ||

      element.tagName === 'META' && element.getAttribute('property') === 'mw:PageProp/toc' ||
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
        this.parser.context.getElementByClassName(element.previousElementSibling, 'cd-signature')
      ) ||

      (
        step !== 'up' &&
        this.parser.context.areThereOutdents &&
        this.parser.context.getElementByClassName(element, cd.config.outdentClass)
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
        isHeadingNode(previousElement) &&
        nextElement &&
        !['DL', 'OL'].includes(nextElement.tagName) &&

        // Helps at https://ru.wikipedia.org/wiki/Википедия:Форум/Архив/Общий/2019/11#201911201924_Vcohen
        !this.isPartOfList(lastPartNode, true) &&

        // Helps at
        // https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#202110061810_Example
        !this.parser.context.getElementByClassName(element, 'cd-signature')
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
      const elementLevelsPassed = this.parser.getTopElementsWithText(element).levelsPassed;
      const nextElementLevelsPassed = this.parser.getTopElementsWithText(nextElement).levelsPassed;
      result = (
        nextElementLevelsPassed > elementLevelsPassed ||

        // https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#Joint_statements
        (
          elementLevelsPassed === 1 &&
          nextElementLevelsPassed === elementLevelsPassed &&
          element[this.parser.context.childElementsProp].length > 1 &&
          tagName !== nextElement.tagName
        )
      );
    }

    return result;
  }

  /**
   * Given a comment part (a node), tell if it is a part of a bulleted or unbulleted (but not
   * numbered) list.
   *
   * @param {Element|external:Element} node
   * @param {boolean} isDefinitionListOnly
   * @returns {boolean}
   */
  isPartOfList(node, isDefinitionListOnly) {
    /*
      * The checks for DD help in cases like
        https://ru.wikipedia.org/wiki/Project:Форум/Архив/Общий/2019/11#201911201924_Vcohen
      ** A complex case where it messes up things:
        https://commons.wikimedia.org/wiki/Commons:Translators%27_noticeboard/Archive/2020#202011151417_Ameisenigel
      * The check for DL helps in cases like
        https://ru.wikipedia.org/wiki/Project:Форум/Архив/Общий/2020/03#202003090945_Serhio_Magpie
        (see the original HTML source)
     */
    const tagNames = ['DD', 'DL'];
    if (!isDefinitionListOnly) {
      tagNames.push('LI', 'UL');
    }
    return node && (tagNames.includes(node.tagName) || tagNames.includes(node.parentNode.tagName));
  }

  /**
   * Identify cases like:
   *
   * ```html
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
   * @param {Element|external:Element} [options.lastPartNode]
   * @param {Element|external:Element} [options.previousPart]
   * @returns {boolean}
   */
  isIntro({ step, stage, node, nextNode, lastPartNode, previousPart }) {
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
              nextNode.parentNode !== this.parser.context.rootElement &&
              nextNode.parentNode.parentNode !== this.parser.context.rootElement
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
        nextNode[this.parser.context.childElementsProp].length > 1 &&
        !nextNode[this.parser.context.childElementsProp][0].contains(this.signatureElement)
      )
    );
  }

  /**
   * Traverse the DOM, collecting comment parts.
   *
   * @param {object[]} parts
   * @param {ElementsAndTextTreeWalker} treeWalker
   * @param {Element|external:Element} firstForeignComponentAfter
   * @param {Element|external:Element} precedingHeadingElement
   * @returns {object[]}
   * @private
   */
  traverseDom(parts, treeWalker, firstForeignComponentAfter, precedingHeadingElement) {
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
        previousPart,
      });
      if (isIntro) break;

      const isTextNode = node.nodeType === Node.TEXT_NODE;
      let isHeading = null;
      let hasCurrentSignature = null;
      let hasForeignComponents = null;
      if (!isTextNode) {
        if (!this.isElementEligible(node, treeWalker, step)) break;

        isHeading = isHeadingNode(node);
        hasCurrentSignature = node.contains(this.signatureElement);

        // The second parameter of getElementsByClassName() is an optimization for the worker
        // context.
        const signatureCount = node
          .getElementsByClassName('cd-signature', Number(hasCurrentSignature) + 1)
          .length;

        hasForeignComponents = Boolean(
          // Without checking for blockness, the beginning of the comment at
          // https://ru.wikipedia.org/w/index.php?title=Википедия:Форум/Новости&oldid=125481598#c-Oleg_Yunakov-20220830173400-Iniquity-20220830171400
          // will be left out of the comment.
          !isInline(node) &&

          (
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
            !this.parser.elementsToExclude.some((el) => el.contains(node))
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
   * @param {Element|external:Element} precedingHeadingElement
   */
  collectParts(precedingHeadingElement) {
    const treeWalker = new ElementsAndTextTreeWalker(
      this.signatureElement,
      this.parser.context.rootElement
    );
    let [parts, firstForeignComponentAfter] = this.getStartNodes(treeWalker);
    parts = this.traverseDom(
      parts,
      treeWalker,
      firstForeignComponentAfter,
      precedingHeadingElement
    );

    /**
     * Comment parts. They are not guaranteed to match the elements after some point (due to
     * {@link CommentSkeleton#wrapHighlightables}, {@link CommentSkeleton#fixEndLevel}) calls.
     *
     * @type {object[]}
     */
    this.parts = parts;
  }

  /**
   * _For internal use._ Remove comment parts that are inside of other parts.
   */
  removeNestedParts() {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const part = this.parts[i];
      if (part.step === 'up' && !part.hasForeignComponents) {
        let nextDiveElementIndex = 0;
        for (let j = i - 1; j > 0; j--) {
          if (this.parts[j].step === 'dive') {
            nextDiveElementIndex = j;
            break;
          }
        }
        this.parts.splice(nextDiveElementIndex, i - nextDiveElementIndex);
        i = nextDiveElementIndex;
      }
    }
  }

  /**
   * _For internal use._ Wrap text and inline nodes into block elements.
   *
   * @returns {object[]}
   */
  encloseInlineParts() {
    const sequencesToBeEnclosed = [];
    let start = null;
    let encloseThis = false;
    for (let i = 0; i <= this.parts.length; i++) {
      const part = this.parts[i];
      if (
        part &&
        (start === null || (['back', 'start'].includes(part.step))) &&
        !part.hasForeignComponents &&
        !part.isHeading
      ) {
        if (start === null) {
          // Don't enclose nodes whose parent is an inline element.
          if (isInline(part.node.parentNode)) {
            for (let j = i + 1; j < this.parts.length; j++) {
              if (this.parts[j].step === 'up') {
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
      const wrapper = document.createElement('div');
      const nextSibling = this.parts[sequence.start].node.nextSibling;
      const parent = this.parts[sequence.start].node.parentNode;
      for (let j = sequence.end; j >= sequence.start; j--) {
        wrapper.appendChild(this.parts[j].node);
      }
      parent.insertBefore(wrapper, nextSibling);
      const newPart = {
        node: wrapper,
        isTextNode: false,
        isHeading: false,
        hasCurrentSignature: wrapper.contains(this.signatureElement),
        hasForeignComponents: false,
        step: 'replaced',
      };
      this.parts.splice(sequence.start, sequence.end - sequence.start + 1, newPart);
    }

    return this.parts;
  }

  /**
   * _For internal use._ Remove unnecessary and incorrect parts from the collection.
   */
  filterParts() {
    this.parts = this.parts.filter((part) => !part.hasForeignComponents && !part.isTextNode);

    // "style" and "link" tags at the beginning. Also "references" tags and {{reflist-talk}}
    // templates (will need to generalize this, possibly via wiki configuration, if other wikis
    // employ a differently named class).
    for (let i = this.parts.length - 1; i > 0; i--) {
      const node = this.parts[i].node;
      if (
        (
          node.tagName === 'P' &&
          !node.textContent.trim() &&
          [...node.children].every((child) => child.tagName === 'BR')
        ) ||
        isMetadataNode(node) ||
        Array.from(node.classList).some((name => ['references', 'reflist-talk'].includes(name)))
      ) {
        this.parts.splice(i, 1);
      } else {
        break;
      }
    }

    // When the first comment part starts with <br>
    const firstNode = this.parts[this.parts.length - 1]?.node;
    if (firstNode.tagName === 'P') {
      if (firstNode.firstChild?.tagName === 'BR') {
        firstNode.parentNode.insertBefore(firstNode.firstChild, firstNode);
      }
    }

    if (this.parts.length > 1) {
      let startNode;
      for (let i = this.parts.length - 1; i >= 1; i--) {
        const part = this.parts[i];
        if (part.isHeading) continue;

        if (!startNode) {
          startNode = part.node;
          if (
            ['DL', 'UL', 'OL', 'DD', 'LI'].includes(startNode.tagName) &&
            !this.isIntroList(startNode, true, this.parts[0].node)
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
          lastPartNode: this.parts[0].node,
        });
        if (isIntro) {
          this.parts.splice(i);
        }
      }
    }
  }

  /**
   * Check whether a node is a comment level node.
   *
   * @param {number} i Current part index.
   * @param {Node|external:Node} lastPartNode Node of the last part.
   * @returns {boolean}
   * @private
   */
  isCommentLevel(i, lastPartNode) {
    const part = this.parts[i];
    return (
      // 'DD', 'LI' are in this list too for this kind of structures:
      // https://ru.wikipedia.org/w/index.php?diff=103584477.
      ['DL', 'UL', 'OL', 'DD', 'LI'].includes(part.node.tagName) &&

      !this.isGallery(part.node) &&

      // Exclude lists that are parts of the comment, like at
      // https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#Comments_starting_with_a_list
      // (this has an effect on 18:20 and 18:30 comments).
      !(
        part.step === 'up' &&
        this.parts[i + 1] &&

        // Watch these cases that are similar in DOM but should behave differently ("→" means the
        // next part):
        // * https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#c-Example-2021-10-13T18:20:00.000Z-Example-2021-10-13T18:00:00.000Z
        // ** ol "up" → div "replaced"
        // ** The condition should be true.
        // * https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#c-Example-2021-10-13T18:40:00.000Z-Example-2021-10-13T18:00:00.000Z
        // ** dl "up" → dd "back"
        // ** The condition should be true.
        // * https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#c-Example-2020-09-22T20:10:00.000Z-Example-2020-09-22T20:00:00.000Z
        // ** ul "up" → ol "back"
        // ** The condition should be false.
        // * https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#c-Example-2021-10-14T19:10:00.000Z-Example-2021-10-14T19:00:00.000Z
        // ** ul "up" → div "replaced"
        // ** The condition should be false.
        // * https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#c-Example-2019-01-15T12:00:00.000Z-Example-2019-01-15T11:50:00.000Z
        // ** ul "up" → dd "replaced"
        // ** The condition should be false.
        // * https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#c-Example-2021-10-14T20:10:00.000Z-Example-2021-10-14T20:00:00.000Z
        // ** ul "up" → dd "back"
        // ** The condition should be false.
        // * https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#c-Example-2019-10-07T08:10:00.000Z-List_inside_a_comment
        // ** ul "up" → div "replaced"
        // ** The condition should be true.
        // * https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#c-Example-2019-10-07T08:40:00.000Z-List_inside_a_comment
        // ** ul "up" → dd "start"
        // ** The condition should be true.
        // * https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#c-Example-2020-09-22T20:05:00.000Z-Example-2020-09-22T20:04:00.000Z
        // ** dl "up" → blockquote "back"
        // ** The condition should be false.
        // * https://en.wikipedia.org/wiki/Wikipedia:Village_pump_(technical)/Archive_191#c-Snævar-2021-07-15T16:19:00.000Z-Klein_Muçi-2021-07-15T12:15:00.000Z
        // ** dl "up" → li "replaced"
        // ** The condition should be false.
        (
          (
            part.node.tagName !== 'UL' &&
            (this.isPartOfList(this.parts[i + 1].node) && this.parts[i + 1].step !== 'replaced')
          ) ||
          part.node.children.length > 1
        ) &&

        this.isPartOfList(lastPartNode, true)
      ) &&

      (
        // Exclude lists that are parts of the comment.
        (part.step === 'up' && (!this.parts[i - 1] || this.parts[i - 1].step !== 'back')) ||

        (
          this.isPartOfList(lastPartNode, true) &&

          // Cases like
          // https://ru.wikipedia.org/wiki/Обсуждение_шаблона:Графема#Навигация_со_стрелочками
          // (the whole thread).
          !(part.step === 'back' && ['LI', 'DD'].includes(part.node.tagName)) &&

          // Cases like
          // https://commons.wikimedia.org/wiki/Commons:Translators%27_noticeboard/Archive/2020#202011151417_Ameisenigel,
          //
          !(
            i !== 0 &&
            ['UL', 'OL'].includes(part.node.tagName) &&
            ['DL', 'UL'].includes(part.node.previousElementSibling?.tagName)
          )
        ) ||

        // Cases like
        // https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#202110061830_Example
        (
          part.node.tagName === 'UL' &&
          part.node[this.parser.context.childElementsProp].length === 1 &&
          this.isPartOfList(lastPartNode, false)
        )
      )
    );
  }

  /**
   * _For internal use._ Replace list elements with collections of their items if appropriate.
   */
  replaceListsWithItems() {
    const lastPartNode = this.parts[this.parts.length - 1].node;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const part = this.parts[i];
      if (this.isCommentLevel(i, lastPartNode)) {
        const commentElements = this.parser.getTopElementsWithText(part.node).nodes;
        if (commentElements.length > 1) {
          const newParts = commentElements.map((el) => ({
            node: el,
            isTextNode: false,
            hasCurrentSignature: el.contains(this.signatureElement),
            hasForeignComponents: false,
            step: 'replaced',
          }));
          this.parts.splice(i, 1, ...newParts);
        } else if (commentElements[0] !== part.node) {
          Object.assign(part, {
            node: commentElements[0],
            step: 'replaced',
          });
        }
      }
    }
  }

  /**
   * _For internal use._ Wrap numbered list into a `<div>` or `<dl>` & `<dd>` if the comment starts
   * with numbered list items.
   */
  wrapNumberedList() {
    if (this.parts.length > 1) {
      const parent = this.parts[0].node.parentNode;

      if (parent.tagName === 'OL') {
        // 0 or 1
        const currentSignatureCount = Number(parent.contains(this.signatureElement));

        // A foreign signature can be found with just `.cd-signature` search; example:
        // https://commons.wikimedia.org/?diff=566673258.
        if (parent.getElementsByClassName('cd-signature').length - currentSignatureCount === 0) {
          const listItems = this.parts.filter((part) => part.node.parentNode === parent);

          // Is `#` used as an indentation character instead of `:` or `*`, or is the comments just
          // starts with a list and ends on a correct level (without `#`)?
          const isNumberedListUsedAsIndentation = !this.parts.some((part) => (
            part.node.parentNode !== parent &&
            part.node.parentNode.contains(parent)
          ));
          let outerWrapper;
          let innerWrapper;
          const nextSibling = parent.nextSibling;
          const parentParent = parent.parentNode;
          if (isNumberedListUsedAsIndentation) {
            innerWrapper = document.createElement('dd');
            outerWrapper = document.createElement('dl');
            outerWrapper.appendChild(innerWrapper);
          } else {
            innerWrapper = document.createElement('div');
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
          this.parts.splice(0, listItems.length, newPart);
        }
      }
    }
  }

  /**
   * Set the {@link CommentSkeleton#highlightables} property.
   * {@link CommentSkeleton#wrapHighlightables Wrap highlightables if required}.
   *
   * @private
   */
  setHighlightables() {
    const isHighlightable = (el) => (
      !isHeadingNode(el) &&
      !isMetadataNode(el) &&
      !cd.g.unhighlightableElementClasses.some((name) => el.classList.contains(name)) &&

      // Can't access stylesheets from the worker context, so we do it only in
      // Comment#reviewHighlightables, and here we look at the style attribute only.
      !/float: *(?:left|right)|display: *none/.test(el.getAttribute('style'))
    );

    /**
     * Comment elements that are highlightable.
     *
     * Keep in mind that elements may be replaced, and property values will need to be updated. See
     * {@link Comment#replaceElement}.
     *
     * @type {Element[]|external:Element[]}
     */
    this.highlightables = this.elements.filter(isHighlightable);

    // There shouldn't be comments without highlightables.
    if (!this.highlightables.length) {
      throw new CdError();
    }

    this.wrapHighlightables();
  }

  /**
   * Prevent an inappropriate element from being the first or last highlightable (this is used for
   * when comments are reformatted, but we do it always to have a uniform parsing result). In the
   * worker context, this will allow to correctly update edited comments (unless
   * {@link Comment#reviewHighlightables} alters the highlightables afterwards).
   *
   * @private
   */
  wrapHighlightables() {
    [this.highlightables[0], this.highlightables[this.highlightables.length - 1]]
      .filter(unique)
      .filter((el) => (
        cd.g.badHighlightableElements.includes(el.tagName) ||

        // Cases such as https://en.wikipedia.org/?diff=998431486. TODO: Do something with the
        // semantical correctness of the markup.
        (this.highlightables.length > 1 && el.tagName === 'LI' && el.parentNode.tagName === 'OL') ||

        el.className ||
        el.getAttribute('style')
      ))
      .forEach((el) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'cd-comment-replacedPart';
        el.parentNode.insertBefore(wrapper, el);
        this.elements.splice(this.elements.indexOf(el), 1, wrapper);
        this.highlightables.splice(this.highlightables.indexOf(el), 1, wrapper);
        wrapper.appendChild(el);
      });
  }

  /**
   * Add the necessary attributes to the comment's elements.
   *
   * @protected
   */
  addAttributes() {
    this.elements.forEach((el) => {
      el.classList.add('cd-comment-part');
      el.setAttribute('data-cd-comment-index', this.index);
    });
    this.highlightables[0].classList.add('cd-comment-part-first');
    this.highlightables[this.highlightables.length - 1].classList.add('cd-comment-part-last');
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
    const treeWalker = new ElementsTreeWalker(initialElement, this.parser.context.rootElement);
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
   * Finally review comment parts to make sure all "dives" (when the tree walker goes as deep as
   * possible through a tree after going back) are for actual comment parts and not for parts of
   * other comments.
   *
   * @returns {boolean} Are elements changed.
   * @private
   */
  reviewDives() {
    let areElementsChanged = false;

    // Parts can be dissynchronized with elements at this stage, so we just use this.parts for
    // reference.
    if (this.elements.length > 1 && this.parts.some((part) => part.step === 'dive')) {
      // Get level elements based on this.elements, not this.highlightables.
      const allLevelElements = this.elements.map(this.getListsUpTree.bind(this));

      const lastAncestors = allLevelElements[allLevelElements.length - 1];
      if (allLevelElements[0].length > lastAncestors.length) {
        let firstWrongElementIndex;
        let lastLowerLevelElement;
        for (let i = allLevelElements.length - 2; i >= 0; i--) {
          if (allLevelElements[i].length > lastAncestors.length) {
            firstWrongElementIndex = i;
            lastLowerLevelElement = this.elements[i];
            break;
          }
        }

        /*
          Situation like this:

            :::: Comment ended with a bare timestamp. 00:00, 1 January 2020 (UTC)
            Other comment. [signature]

          or this:

            :::: Comment ended with no timestamp. But still clearly a comment.
            :: Other comment. [signature]

          But! not this:

            :::: Comment start.
            Comment end. [signature]

          as in such cases it is most likely one comment, not two.
        */
        if (
          lastAncestors.length > 0 ||
          lastLowerLevelElement.lastElementChild?.classList.contains('cd-timestamp')
        ) {
          this.elements.splice(0, firstWrongElementIndex + 1);
          this.setHighlightables();
          areElementsChanged = true;
        }
      }
    }

    return areElementsChanged;
  }

  /**
   * Fix indentation holes by leveraging comment parts in them to the level of the comment.
   *
   * "Holes" here mean comment parts that are placed outside of list elements while the beginning
   * and ending of the comment are inside list elements. For example:
   *
   * ```html
   * ::: Comment start.
   * <blockquote>Some quote.</blockquote>
   * ::: Comment end. [signature]
   * ```
   *
   * @private
   */
  fixIndentationHoles() {
    if (!this.level || this.elements.length <= 2) return;

    // Get level elements based on this.elements, not this.highlightables.
    const allLevelElements = this.elements.map((el) => this.getListsUpTree(el, true));

    const groups = [];
    allLevelElements.slice(1, allLevelElements.length - 1).forEach((ancestors, i) => {
      if (!ancestors.length) {
        const lastGroup = groups[groups.length - 1];
        if (!lastGroup || lastGroup[lastGroup.length - 1] !== i) {
          groups.push([]);
        }
        groups[groups.length - 1].push(i + 1);
      }
    });
    groups.forEach((indexes) => {
      const levelElement = allLevelElements
        .slice(0, indexes[0])
        .reverse()
        .find((ancestors) => ancestors.length)
        ?.slice(-1)[0];
      if (levelElement) {
        const tagName = levelElement.tagName === 'DL' ? 'dd' : 'li';
        const itemElement = document.createElement(tagName);
        indexes.forEach((index) => {
          itemElement.appendChild(this.elements[index]);
        });
        levelElement.appendChild(itemElement);
      }
    });
  }

  /**
   * Fix the situation where a comment signature is placed inside the last item of the comment, like
   * this:
   *
   * ```html
   * List:
   * * Item 1.
   * * Item 2.
   * * Item 3. [signature]
   * ```
   *
   * @param {Array.<Element>|Array.<external:Element>} levelElements
   * @private
   */
  fixEndLevel(levelElements) {
    // Safety measure in case the element would turn out not to be a highlightable in
    // Comment#reviewHighlightables.
    if (this.highlightables[0].className) return;

    const lastAncestors = levelElements[levelElements.length - 1];
    if (levelElements[0].length === lastAncestors.length - 1) {
      const closestLevelElement = lastAncestors[lastAncestors.length - 1];

      // Split parent elements until we reach the level element.
      let parent = this.highlightables[this.highlightables.length - 1];
      while (parent !== closestLevelElement) {
        parent = this.parser.splitParentAfterNode(parent)[0];
      }

      let firstItemIndex = this.elements.length - 1;
      for (let i = this.elements.length - 2; i > 0; i--) {
        if (closestLevelElement.contains(this.elements[i])) {
          firstItemIndex = i;
        } else {
          break;
        }
      }
      this.elements.splice(
        firstItemIndex,
        this.elements.length - firstItemIndex,
        closestLevelElement
      );
      this.setHighlightables();
    }
  }

  /**
   * Set the necessary classes to parent elements of the comment's elements to make a visible tree
   * structure. While doing that, fix some markup.
   *
   * @param {boolean} [fixMarkup=true]
   * @protected
   */
  setLevels(fixMarkup = true) {
    // Make sure the level on the top and on the bottom of the comment are the same and add
    // appropriate classes.
    let levelElements = this.highlightables.map(this.getListsUpTree.bind(this));

    // Use the first and last elements, not all elements, to determine the level to deal with cases
    // like
    // https://ru.wikipedia.org/wiki/Википедия:К_удалению/17_марта_2021#Анжуйские_короли_Англии.

    /**
     * Comment level. A level is a number representing the number of indentation characters
     * preceding the comment (no indentation means zeroth level).
     *
     * @type {number}
     */
    this.level = Math.min(levelElements[0].length, levelElements[levelElements.length - 1].length);

    /**
     * {@link Comment#level Comment level} that takes into account `{{outdent}}` templates.
     *
     * @type {number}
     */
    this.logicalLevel = this.level;

    if (fixMarkup) {
      let areElementsChanged = this.reviewDives();
      if (areElementsChanged) {
        levelElements = this.highlightables.map(this.getListsUpTree.bind(this));
      }
      this.fixIndentationHoles();
      this.fixEndLevel(levelElements);
    }

    for (let i = 0; i < this.level; i++) {
      levelElements.forEach((ancestors) => {
        ancestors[i]?.classList.add('cd-commentLevel', `cd-commentLevel-${i + 1}`);
      });
    }
  }

  /**
   * Get the parent comment of the comment. This shouldn't run before sections are set on comments
   * which is done in the {@link SectionSkeleton SectionSkeleton} constructor.
   *
   * @param {boolean} [visual=false] Get the visual parent (according to the
   *   {@link Comment#level level} property, not {@link Comment#logicalLevel logicalLevel}).
   * @returns {?CommentSkeleton}
   */
  getParent(visual = false) {
    const prop = visual ? 'level' : 'logicalLevel';
    this.cachedParent ||= {};
    if (this.cachedParent[prop] === undefined) {
      // This can run many times during page load, so we better optimize.
      this.cachedParent[prop] = null;
      if (this[prop] !== 0) {
        for (let i = this.index - 1; i >= 0; i--) {
          const comment = cd.comments[i];
          if (comment.section !== this.section) break;
          if (comment[prop] === this[prop] && comment.cachedParent?.[prop]) {
            this.cachedParent[prop] = comment.cachedParent[prop];
            break;
          }
          if (comment[prop] < this[prop]) {
            this.cachedParent[prop] = comment;
            break;
          }
        }
      }
    }

    return this.cachedParent[prop];
  }

  /**
   * Get all replies to the comment.
   *
   * @param {boolean} [indirect=false] Whether to include children of children and so on (return
   *   descendants, in a word).
   * @param {boolean} [visual=false] Whether to use visual levels instead of logical.
   * @param {boolean} [allowSiblings=true] When `visual` is `true`, allow comments of the same
   *   level to be considered children (if they are outdented).
   * @returns {CommentSkeleton[]}
   */
  getChildren(indirect = false, visual = false, allowSiblings = true) {
    if (this.index === cd.comments.length - 1) {
      return [];
    }

    const children = [];
    const prop = visual ? 'level' : 'logicalLevel';
    cd.comments
      .slice(this.index + 1)
      .some((comment) => {
        if (
          comment.section === this.section &&
          (
            comment[prop] > this[prop] ||

            // This comment is visually a child, although it's of the same level as the parent:
            // https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#c-Example-2021-04-25T12:40:00.000Z-Example-2021-04-25T12:00:00.000Z
            (
              prop === 'level' &&
              allowSiblings &&
              comment[prop] === this[prop] &&
              comment.isOutdented
            )
          )
        ) {
          // `comment.getParent() === this` to allow comments mistakenly indented with more than one
          // level.
          if (comment[prop] === this[prop] + 1 || comment.getParent() === this || indirect) {
            children.push(comment);
          }
          return false;
        } else {
          return true;
        }
      });

    return children;
  }

  /**
   * Check if a string is a comment ID in the CD format.
   *
   * @param {string} [string]
   * @returns {boolean}
   */
  static isId(string) {
    return /^\d{12}_.+$/.test(string);
  }

  /**
   * Check whether a string is a comment ID in the DiscussionTools format.
   *
   * @param {string} [string]
   * @returns {boolean}
   */
  static isDtId(string) {
    return Boolean(string?.startsWith('c-'));
  }

  /**
   * Check whether a string is a comment ID in the CD or DiscussionTools format.
   *
   * @param {string} [string]
   * @returns {boolean}
   */
  static isAnyId(string) {
    return this.isId(string) || this.isDtId(string);
  }

  /**
   * Generate a comment ID from a date and author.
   *
   * @param {Date} [date]
   * @param {string} [author]
   * @param {string[]} [existingIds] IDs that collide with IDs in the array will get a `_<number>`
   *   postfix. The array will be appended to in that case.
   * @returns {?string}
   */
  static generateId(date, author, existingIds) {
    if (!date || !author) {
      return null;
    }

    let id = generateFixedPosTimestamp(date) + '_' + spacesToUnderlines(author);
    if (existingIds?.includes(id)) {
      let index = 2;
      const base = id;
      do {
        id = `${base}_${index}`;
        index++;
      } while (existingIds.includes(id));
    }
    existingIds?.push(id);

    return id;
  }

  /**
   * Update the width of the outdent template to match our thread style changes. Doesn't run in the
   * worker.
   *
   * @param {Element|external:Element} element
   */
  static updateOutdentWidth(element) {
    if (cd.isWorker) return;

    [...element.childNodes].forEach((child) => {
      const width = child.style?.width;
      if (width) {
        const [, number, unit] = width.match(/^([\d.]+)(.+)$/);
        if (number) {
          // 1.25 = 2em / 1.6em, where 2em is our margin and 1.6em is the default margin.
          child.style.width = `calc(${number * 1.25}${unit} + ${number * 1.25 / 2}px)`;
        }
      } else if (!child.children?.length && child.textContent.includes('─')) {
        child.textContent = child.textContent
          .replace(/─+/, (s) => '─'.repeat(Math.round(s.length * 1.25)));
      }
    });
  }

  /**
   * _For internal use._ Set {@link Comment#logicalLevel logical levels} to the comments taking into
   * account `{{outdent}}` templates.
   *
   * @param {import('./Parser').default} parser
   */
  static processOutdents(parser) {
    if (parser.context.areThereOutdents) {
      [...parser.context.rootElement.getElementsByClassName(cd.config.outdentClass)]
        .reverse()
        .forEach((element) => {
          let childComment;
          let parentComment;
          const treeWalker = new ElementsTreeWalker(element, parser.context.rootElement);
          while (treeWalker.nextNode() && !childComment) {
            let commentIndex = treeWalker.currentNode.getAttribute('data-cd-comment-index');
            if (commentIndex === '0') break;
            if (commentIndex === null) continue;

            commentIndex = Number(commentIndex);
            childComment = cd.comments[commentIndex];

            // Find an _actual_ parent of the comment in case the previous one is newer than the
            // child. Example:
            // https://en.wikipedia.org/w/index.php?title=Wikipedia:Village_pump_(technical)&oldid=1044759311#202108282226_Cryptic.
            for (let i = commentIndex - 1; i >= 0; i--) {
              const comment = cd.comments[i];
              if (comment.section !== childComment.section) break;
              if (childComment.date >= comment.date) {
                parentComment = comment;
                break;
              }
            }
            if (!parentComment) break;

            if (parentComment.index !== commentIndex - 1) {
              // Explicitly set the parent.
              childComment.cachedParent ||= {};
              childComment.cachedParent.logicalLevel = parentComment;
            }

            this.updateOutdentWidth(element);

            childComment.isOutdented = true;
            childComment.elements[0].classList.add('cd-comment-outdented');

            // Update levels for following comments.
            cd.comments.slice(commentIndex).some((comment) => {
              // Since we traverse templates from the last to the first, `childComment.level` at
              // this stage is the same as `childComment.logicalLevel` before we traverse the child
              // comments. The same for `parentComment`.
              if (
                comment.section !== parentComment.section ||
                comment.logicalLevel < childComment.level ||
                (comment !== childComment && comment.logicalLevel === childComment.level) ||
                comment.date < childComment.date
              ) {
                return true;
              }
              comment.logicalLevel = (
                (parentComment.level + 1) +
                (comment.logicalLevel - childComment.level)
              );
              return false;
            });
          }
        });
    }
  }
}

/**
 * Object with the same basic structure as {@link CommentSkeleton} has. (It comes from a web
 * worker so its constructor is lost.)
 *
 * @typedef {object} CommentSkeletonLike
 */

export default CommentSkeleton;
