import CdError from './CdError';
import cd from './cd';
import { ElementsTreeWalker } from './treeWalker';
import { unique } from './util';

/**
 * Class containing the main properties of a comment. This class is the only one used in the worker
 * context for comments.
 *
 * @class
 */
class CommentSkeleton {
  /**
   * Create a comment skeleton instance.
   *
   * @param {Parser} parser
   * @param {object} signature Signature object returned by {@link Parser#findSignatures}.
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
    parts = this.parser.filterParts(parts, signature.element);

    parts.reverse();

    // dd, li instead of dl, ul, ol where appropriate.
    parts = this.parser.replaceListsWithItems(parts, signature.element);

    // Wrap ol into div or dl & dd if the comment starts with numbered list items.
    parts = this.parser.wrapNumberedList(parts, signature.element);

    /**
     * Comment ID. Same as the comment's index in
     * {@link convenientDiscussions.comments convenientDiscussions.comments}.
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
     * Comment timestamp as originally present on the page.
     *
     * @type {string}
     */
    this.timestamp = signature.timestampText;

    /**
     * _For internal use._ Comment author name.
     *
     * @type {string}
     */
    this.authorName = signature.authorName;

    /**
     * _For internal use._ Comment signature element.
     *
     * @type {Element|external:Element}
     */
    this.signatureElement = signature.element;

    /**
     * _For internal use._ Comment timestamp element.
     *
     * @type {Element|external:Element}
     */
    this.timestampElement = signature.timestampElement;

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
     * Comment parts. They are not guaranteed to match the elements after some point (due to
     * {@link CommentSkeleton#wrapHighlightables}, {@link CommentSkeleton#fixEndLevel}) calls.
     *
     * @type {object[]}
     */
    this.parts = parts;

    /**
     * Comment's elements.
     *
     * @type {Element[]|external:Element[]}
     */
    this.elements = this.parts.map((part) => part.node);

    this.setHighlightables();
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
     * Is the comment outdented with the `{{outdent}}` template.
     *
     * @type {boolean}
     */
    this.isOutdented = false;
  }

  /**
   * Set the {@link CommentSkeleton#highlightables} property.
   * {@link CommentSkeleton#wrapHighlightables Wrap highlightables if required}.
   *
   * @private
   */
  setHighlightables() {
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
        cd.g.BAD_HIGHLIGHTABLE_ELEMENTS.includes(el.tagName) ||

        // Such cases: https://en.wikipedia.org/?diff=998431486. TODO: Do something with the
        // semantical correctness of the markup.
        (this.highlightables.length > 1 && el.tagName === 'LI' && el.parentNode.tagName === 'OL') ||

        el.className ||
        el.getAttribute('style')
      ))
      .forEach((el) => {
        const wrapper = this.parser.context.document.createElement('div');
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
      el.setAttribute('data-comment-id', String(this.id));
    });
    this.highlightables[0].classList.add('cd-comment-part-first');
    this.highlightables[this.highlightables.length - 1].classList.add('cd-comment-part-last');
  }

  /**
   * Fix indentation holes by leveraging comment parts in them to the level of the comment.
   *
   * "Holes" here mean comment parts that are placed outside of list elements while the beginning
   * and ending of the comment are inside list elements. For example:
   *
   * ```
   * ::: Comment start.
   * <blockquote>Some quote.</blockquote>
   * ::: Comment end. ~~~~
   * ```
   */
  fixIndentationHoles() {
    if (this.level && this.elements.length > 2) {
      // Get level elements based on this.elements, not this.highlightables.
      const allLevelElements = this.elements.map(this.parser.getListsUpTree.bind(this.parser));

      const elementsInHolesIndexes = [];
      allLevelElements.slice(1, allLevelElements.length - 1).forEach((ancestors, i) => {
        if (!ancestors.length) {
          elementsInHolesIndexes.push(i + 1);
        }
      });
      elementsInHolesIndexes.forEach((index) => {
        const levelElement = allLevelElements
          .slice(0, index)
          .reverse()
          .find((ancestors) => ancestors.length)
          ?.slice(-1)[0];
        if (levelElement) {
          const tagName = levelElement.tagName === 'DL' ? 'dd' : 'li';
          const itemElement = this.parser.context.document.createElement(tagName);
          itemElement.appendChild(this.elements[index]);
          levelElement.appendChild(itemElement);
        }
      });
    }
  }

  /**
   * Fix the situation where a comment signature is placed inside the last item of the comment, like
   * this:
   *
   * ```
   * List:
   * * Item 1.
   * * Item 2.
   * * Item 3. ~~~~
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
      const closestLevelElement = lastAncestors[lastAncestors.length  - 1];

      // Split parent elements until we reach the level element.
      let parent = this.highlightables[this.highlightables.length - 1];
      let child;
      while (parent !== closestLevelElement) {
        child = parent;
        parent = parent.parentNode;
        const clone = parent.cloneNode();
        let lastChild;
        while ((lastChild = parent.lastChild) && lastChild !== child) {
          clone.insertBefore(lastChild, clone.firstChild);
        }
        parent.parentNode.insertBefore(clone, parent.nextSibling);
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
    const levelElements = this.highlightables.map(this.parser.getListsUpTree.bind(this.parser));

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
   * Get the parent comment of the comment.
   *
   * @param {boolean} [visual=false] Get the visual parent (according to the
   *   {@link Comment#level level} property, not {@link Comment#logicalLevel logicalLevel}).
   * @returns {?CommentSkeleton}
   */
  getParent(visual = false) {
    const prop = visual ? 'level' : 'logicalLevel';
    if (this.cachedParent === undefined) {
      this.cachedParent = {};
    }
    if (this.cachedParent[prop] === undefined) {
      // This can run many times during page load, so we better optimize.
      this.cachedParent[prop] = null;
      if (this[prop] !== 0) {
        for (let i = this.id - 1; i >= 0; i--) {
          const comment = cd.comments[i];
          if (comment.section === this.section && comment[prop] < this[prop]) {
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
   * @returns {CommentSkeleton[]}
   */
  getChildren(indirect = false, visual = false) {
    if (this.id === cd.comments.length - 1) {
      return [];
    }

    const children = [];
    const prop = visual ? 'level' : 'logicalLevel';
    cd.comments
      .slice(this.id + 1)
      .some((comment) => {
        if (comment.section === this.section && comment[prop] > this[prop]) {
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
   * _For internal use._ Set {@link Comment#logicalLevel logical levels} to the comments taking into
   * account `{{outdent}}` templates.
   */
  static processOutdents() {
    if (cd.g.pageHasOutdents) {
      Array.from(cd.g.rootElement.getElementsByClassName(cd.config.outdentClass))
        .reverse()
        .forEach((el) => {
          const treeWalker = new ElementsTreeWalker(el);
          while (treeWalker.nextNode()) {
            // `null` and `0` as the attribute value are both bad.
            let commentId = Number(treeWalker.currentNode.getAttribute('data-comment-id'));
            if (commentId !== 0) {
              const parentComment = cd.comments[commentId - 1];
              const childComment = cd.comments[commentId];

              // Since we traverse templates from the last to the first, `childComment.level` at
              // this stage is always the same as `childComment.logicalLevel`. The same for
              // `parentComment`.
              const childLevel = childComment.level;

              // Something is wrong.
              if (childComment.date < parentComment.date) break;

              childComment.isOutdented = true;
              cd.comments.slice(commentId).some((comment) => {
                if (
                  comment.section !== parentComment.section ||
                  comment.logicalLevel < childLevel ||

                  // If the child comment level is at least 2, we infer that the next comment on
                  // the same level is outdented together with the child comment. If it is 0 or 1,
                  // the next comment is more likely a regular reply.
                  (
                    comment.id === childComment.id + 1 &&
                    childComment.level < 2 &&
                    comment.level === childComment.level
                  ) ||

                  comment.date < childComment.date
                ) {
                  return true;
                }
                comment.logicalLevel = (
                  (parentComment.level + 1) +
                  (comment.logicalLevel - childLevel)
                );
                return false;
              });
              break;
            }
          }
        });
    }
  }
}

export default CommentSkeleton;
