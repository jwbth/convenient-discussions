/**
 * Comment skeleton class.
 *
 * @module CommentSkeleton
 */

import CdError from './CdError';
import cd from './cd';
import { ElementsTreeWalker } from './treeWalker';

/**
 * Class containing the main properties of a comment. This class is the only one used in the worker
 * context for comments.
 *
 * @class
 */
export default class CommentSkeleton {
  /**
   * Create a comment skeleton instance.
   *
   * @param {Parser} parser
   * @param {object} signature Signature object returned by {@link module:Parser#findSignatures}.
   * @throws {CdError}
   */
  constructor(parser, signature) {
    this.parser = parser;

    // Identify all comment nodes and save the path to them.
    let parts = this.parser.collectParts(signature.element);

    // Remove parts contained by other parts
    parts = this.parser.removeNestedParts(parts);

    // We may need to enclose sibling sequences in a <div> tag in order for them not to be bare (we
    // can't get bounding client rectangle for text nodes, can't specify margins for them etc.).
    parts = this.parser.encloseInlineParts(parts, signature.element);

    // At this point, we can safely remove unnecessary nodes.
    parts = this.parser.filterParts(parts);

    parts.reverse();

    // dd, li instead of dl, ul, ol where appropriate.
    parts = this.parser.replaceListsWithItems(parts, signature.element);

    /**
     * Comment ID. Same as the comment index in {@link module:cd~convenientDiscussions.comments
     * convenientDiscussions.comments}.
     *
     * @type {number}
     */
    this.id = cd.comments.length;

    /**
     * Comment date.
     *
     * @type {?Date}
     */
    this.date = signature.date || null;

    /**
     * Comment timestamp as present on the page.
     *
     * @type {string}
     */
    this.timestamp = signature.timestampText;

    /**
     * Comment author name.
     *
     * @type {string}
     */
    this.authorName = signature.authorName;

    /**
     * Does the comment belong to the current user.
     *
     * @type {boolean}
     */
    this.own = this.authorName === cd.g.CURRENT_USER_NAME;

    /**
     * Comment anchor.
     *
     * @type {?string}
     */
    this.anchor = signature.anchor;

    /**
     * Is the comment unsigned or not properly signed (an unsigned template class is present).
     *
     * Not used anywhere in the script yet.
     *
     * @type {boolean}
     */
    this.unsigned = signature.unsigned;

    /**
     * Comment parts.
     *
     * @type {object[]}
     */
    this.parts = parts;

    /**
     * Comment elements.
     *
     * @type {Element[]}
     */
    this.elements = this.parts.map((part) => part.node);

    const isHighlightable = (el) => (
      !/^H[1-6]$/.test(el.tagName) &&
      !cd.g.UNHIGHLIGHTABLE_ELEMENTS_CLASSES.some((name) => el.classList.contains(name)) &&
      !/float: *(?:left|right)/.test(el.getAttribute('style'))
    );

    /**
     * Comment elements that are highlightable.
     *
     * Keep in mind that the elements may be replaced, and the property values will need to be
     * updated. See mergeAdjacentCommentLevels() in {@link module:modifyDom}.
     *
     * @type {Element[]}
     */
    this.highlightables = this.elements.filter(isHighlightable);

    // That which cannot be highlighted should not be considered existent.
    if (!this.highlightables.length) {
      throw new CdError();
    }

    this.addAttributes();

    this.setLevels();

    if (this.parts[0].isHeading) {
      /**
       * Is the comment followed by a heading.
       *
       * @type {boolean}
       */
      this.followsHeading = true;

      if (this.level !== 0) {
        this.parts.shift();
        this.elements.shift();
      }
    } else {
      this.followsHeading = true;
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
  }

  /**
   * Add necessary attributes to the comment elements.
   *
   * @private
   */
  addAttributes() {
    if (this.anchor && !this.elements[0].getAttribute('id')) {
      this.elements[0].setAttribute('id', this.anchor);
    }
    this.elements[0].classList.add('cd-commentPart-first');
    this.elements[this.elements.length - 1].classList.add('cd-commentPart-last');
    this.elements.forEach((el) => {
      el.classList.add('cd-commentPart');
      el.setAttribute('data-comment-id', String(this.id));
    });
  }

  /**
   * Set necessary classes to parent elements of the comment elements to make a visible tree
   * structure.
   *
   * @private
   */
  setLevels() {
    // We make sure the level on the top and on the bottom of the comment are the same, and add
    // corresponding classes.
    const levelElements = {};
    levelElements.top = this.parser.getLevelsUpTree(this.highlightables[0]);
    levelElements.bottom = this.highlightables.length > 1 ?
      this.parser.getLevelsUpTree(this.highlightables[this.highlightables.length - 1]) :
      levelElements.top;

    /**
     * Comment level. A level is a number representing the number of indentation characters
     * preceding the comment (no indentation means zeroth level).
     *
     * @type {number}
     */
    this.level = Math.min(levelElements.top.length, levelElements.bottom.length);
    for (let i = 0; i < this.level; i++) {
      if (levelElements.top[i]) {
        levelElements.top[i].classList.add('cd-commentLevel', `cd-commentLevel-${i + 1}`);
      }
      if (levelElements.bottom[i] && levelElements.bottom[i] !== levelElements.top[i]) {
        levelElements.bottom[i].classList.add('cd-commentLevel', `cd-commentLevel-${i + 1}`);
      }
    }
  }

  /**
   * Get the lowest level (= with the biggest level number) section that the comment is in.
   *
   * @returns {?Section}
   * @private
   */
  getSection() {
    cd.debug.startTimer('getSection');
    if (this.cachedSection === undefined) {
      this.cachedSection = (
        cd.sections
          .slice()
          .reverse()
          .find((section) => section.comments.includes(this)) ||
        null
      );
    }
    cd.debug.stopTimer('getSection');
    return this.cachedSection;
  }

  /**
   * Get all replies to the comment.
   *
   * @returns {CommentSkeleton[]}
   */
  getChildren() {
    if (this.id === cd.comments.length - 1) {
      return [];
    }

    if (cd.g.specialElements.pageHasOutdents) {
      const treeWalker = new ElementsTreeWalker(this.elements[this.elements.length - 1]);
      while (
        treeWalker.nextNode() &&
        !treeWalker.currentNode.classList.contains('cd-commentPart')
      ) {
        if (treeWalker.currentNode.classList.contains('outdent-template')) {
          return [cd.comments[this.id + 1]];
        }
      }
    }

    const children = [];
    cd.comments
      .slice(this.id + 1)
      .some((otherComment) => {
        if (otherComment.getSection() === this.getSection() && otherComment.level > this.level) {
          if (
            otherComment.level === this.level + 1 ||
            // Comments mistakenly indented more than one level
            otherComment.id === this.id + 1
          ) {
            children.push(otherComment);
          }
        } else {
          return true;
        }
      });

    return children;
  }
}
