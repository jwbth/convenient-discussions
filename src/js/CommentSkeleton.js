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

    // Identify all comment nodes and save a path to them.
    let parts = this.parser.collectParts(signature.element);

    // Remove parts contained by other parts.
    parts = this.parser.removeNestedParts(parts);

    // We may need to enclose sibling sequences in a <div> tag in order for them not to be bare (we
    // can't get a bounding client rectangle for text nodes, can't specify margins for them etc.).
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

    // This is for the worker context and quickly gets removed.
    this.signatureElement = signature.element;

    /**
     * Does the comment belong to the current user.
     *
     * @type {boolean}
     */
    this.isOwn = this.authorName === cd.g.USER_NAME;

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
    this.isUnsigned = signature.isUnsigned;

    /**
     * Comment parts.
     *
     * @type {object[]}
     */
    this.parts = parts;

    /**
     * Comment's elements.
     *
     * @type {Element[]}
     */
    this.elements = this.parts.map((part) => part.node);

    const isHighlightable = (el) => (
      !/^(H[1-6]|STYLE|LINK)$/.test(el.tagName) &&
      !cd.g.UNHIGHLIGHTABLE_ELEMENT_CLASSES.some((name) => el.classList.contains(name)) &&

      // Can't access stylesheets from the worker context, so we do it only in
      // Comment#reviewHighlightables, and here we look at the style attribute only.
      !/float: *(?:left|right)|display: *none/.test(el.getAttribute('style'))
    );

    /**
     * Comment elements that are highlightable.
     *
     * Keep in mind that the elements may be replaced, and the property values will need to be
     * updated. See {@link module:Comment#replaceElement}.
     *
     * @type {Element[]}
     */
    this.highlightables = this.elements.filter(isHighlightable);

    // That which cannot be highlighted should not be considered existent.
    if (!this.highlightables.length) {
      throw new CdError();
    }

    this.setLevels();

    /**
     * Is the comment preceded by a heading. Set to `true` in the {@link SectionSkeleton}
     * constructor if that's the case.
     *
     * @type {boolean}
     */
    this.followsHeading = false;

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
     * @type {?Section}
     */
    this.section = null;

    /**
     * Is the comment outdented with the {{outdent}} template.
     *
     * @type {boolean}
     */
    this.isOutdented = false;
  }

  /**
   * Add the necessary attributes to the comment's elements.
   *
   * @private
   */
  addAttributes() {
    this.highlightables[0].classList.add('cd-commentPart-first');
    this.highlightables[this.highlightables.length - 1].classList.add('cd-commentPart-last');
    this.elements.forEach((el) => {
      el.classList.add('cd-commentPart');
      el.setAttribute('data-comment-id', String(this.id));
    });
  }

  /**
   * Set the necessary classes to parent elements of the comment's elements to make a visible tree
   * structure.
   *
   * @private
   */
  setLevels() {
    // Make sure the level on the top and on the bottom of the comment are the same and add
    // appropriate classes.
    const levelElements = this.highlightables.map(this.parser.getLevelsUpTree.bind(this.parser));

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
     * Comment level that takes into account {{outdent}} templates.
     *
     * @type {number}
     */
    this.logicalLevel = this.level;

    for (let i = 0; i < this.level; i++) {
      levelElements.forEach((els) => {
        els[i]?.classList.add('cd-commentLevel', `cd-commentLevel-${i + 1}`);
      });
    }
  }

  /**
   * Get the parent comment of the comment.
   *
   * @returns {?CommentSkeleton}
   */
  getParent() {
    if (this.cachedParent === undefined) {
      this.cachedParent = (
        cd.comments
          .slice(0, this.id)
          .reverse()
          .find((comment) => (
            comment.section === this.section &&
            comment.logicalLevel < this.logicalLevel
          )) ||
        null
      );
    }

    return this.cachedParent;
  }

  /**
   * Get all replies to the comment.
   *
   * @param {boolean} [indirect=false] Whether to include children of children and so on.
   * @param {boolean} [visual=false] Whether to use visual levels instead of logical.
   * @returns {CommentSkeleton[]}
   */
  getChildren(indirect = false, visual = false) {
    if (this.id === cd.comments.length - 1) {
      return [];
    }

    const children = [];
    const property = visual ? 'level' : 'logicalLevel';
    cd.comments
      .slice(this.id + 1)
      .some((comment) => {
        if (comment.section === this.section && comment[property] > this[property]) {
          if (
            comment[property] === this[property] + 1 ||

            // Allow comments mistakenly indented with more than one level.
            comment.getParent() === this ||

            indirect
          ) {
            children.push(comment);
          }
          return false;
        } else {
          return true;
        }
      });

    return children;
  }

  static processOutdents() {
    // Look for {{outdent}} templates
    if (cd.g.pageHasOutdents) {
      Array.from(cd.g.rootElement.getElementsByClassName('outdent-template'))
        .reverse()
        .forEach((el) => {
          const treeWalker = new ElementsTreeWalker(el);
          while (treeWalker.nextNode()) {
            let commentId = treeWalker.currentNode.getAttribute('data-comment-id');
            if (commentId !== null) {
              commentId = Number(commentId);
              if (commentId !== 0) {
                const parentComment = cd.comments[commentId - 1];
                const childComment = cd.comments[commentId];
                const childLogicalLevel = childComment.logicalLevel;

                // Something is wrong.
                if (childComment.date < parentComment.date) break;

                childComment.isOutdented = true;
                cd.comments.slice(commentId).some((comment) => {
                  if (
                    comment.section !== parentComment.section ||
                    (comment.id !== commentId && comment.level <= childComment) ||
                    comment.date < parentComment.date
                  ) {
                    return true;
                  }
                  comment.logicalLevel = (
                    (parentComment.logicalLevel + 1) +
                    (comment.logicalLevel - childLogicalLevel)
                  );
                  return false;
                });
                break;
              }
            }
          }
        });
    }
  }
}
