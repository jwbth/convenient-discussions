/**
 * Section skeleton class.
 *
 * @module SectionSkeleton
 */

import CdError from './CdError';
import cd from './cd';
import { TreeWalker } from './treeWalker';

/**
 * Class containing the main properties of a section. This class is the only one used in the worker
 * context for sections.
 */
export default class SectionSkeleton {
  /**
   * Create a section skeleton instance.
   *
   * @param {Parser} parser
   * @param {Element} headingElement
   */
  constructor(parser, headingElement) {
    this.parser = parser;

    /**
     * Headline element.
     *
     * @type {Element}
     */
    this.headlineElement = this.parser.context.getElementByClassName(headingElement, 'mw-headline');

    if (!this.headlineElement) {
      throw new CdError();
    }

    /**
     * Section anchor.
     *
     * @type {string}
     */
    this.anchor = this.headlineElement.getAttribute('id');

    const classesToFilter = ['mw-headline-number', ...cd.config.foreignElementsInHeadlinesClasses];
    const nodes = Array.from(this.headlineElement.childNodes).filter((node) => (
      node.nodeType !== Node.ELEMENT_NODE ||
      !classesToFilter.some((className) => node.classList.contains(className))
    ));

    /**
     * Section headline as it appears on the page.
     *
     * Foreign elements can get there, add the classes of these elements to {@link
     * module:defaultConfig.foreignElementsInHeadlinesClasses} to filter them out.
     *
     * @type {string}
     */
    this.headline = nodes
      .map((node) => node.textContent)
      .join('')
      .trim();

    const levelMatch = headingElement.tagName.match(/^H([1-6])$/);

    /**
     * Section level. A level is a number representing the number of `=` characters in the section
     * heading's code.
     *
     * @type {number}
     */
    this.level = levelMatch && Number(levelMatch[1]);

    const treeWalker = new TreeWalker(
      cd.g.rootElement,
      (node) => (
        !['STYLE', 'LINK'].includes(node.tagName) &&
        // .cd-sectionButtonContainer elements are added to level 2 sections, which means they won't
        // have them as elements but their last subsections can if they are included. So we better
        // don't include them at all.
        !node.classList.contains('cd-sectionButtonContainer')
      ),
      true,
      headingElement
    );

    this.headingNestingLevel = 0;
    while (treeWalker.parentNode()) {
      this.headingNestingLevel++;
    }

    treeWalker.currentNode = headingElement;
    const elements = [headingElement];
    const levelRegexp = new RegExp(`^H[1-${this.level}]$`);

    // The last element before the next heading if we start from the heading of this section. That
    // heading which may be a part of the next section of the same level, or the subsection of this
    // section.
    let hasSubsections = false;
    while (treeWalker.nextSibling() && !levelRegexp.test(treeWalker.currentNode.tagName)) {
      if (
        this.lastElementInFirstChunk === undefined &&
        /^H[2-6]$/.test(treeWalker.currentNode.tagName)
      ) {
        hasSubsections = true;
        this.lastElementInFirstChunk = elements[elements.length - 1];
      }
      elements.push(treeWalker.currentNode);
    }

    /**
     * Last element in the first chunk of the section, i.e. all elements up to the first subheading
     * if it is present, or all elements if it is not.
     *
     * @type {Element}
     */
    this.lastElementInFirstChunk = this.lastElementInFirstChunk || elements[elements.length - 1];

    // We only need the first and the last comment parts to determine comments in the section.
    let firstCommentPart;
    let lastCommentPart;
    if (elements[1]) {
      treeWalker.currentNode = elements[elements.length - 1];
      while (treeWalker.lastChild());
      const lastNode = treeWalker.currentNode;

      treeWalker.currentNode = elements[1];
      do {
        if (treeWalker.currentNode.classList.contains('cd-commentPart')) {
          firstCommentPart = treeWalker.currentNode;
        }
      } while (!firstCommentPart && treeWalker.currentNode !== lastNode && treeWalker.nextNode());

      treeWalker.currentNode = lastNode;
      do {
        if (treeWalker.currentNode.classList.contains('cd-commentPart')) {
          lastCommentPart = treeWalker.currentNode;
        }
      } while (
        !lastCommentPart &&
        treeWalker.currentNode !== elements[1] &&
        treeWalker.previousNode()
      );
    }

    if (firstCommentPart) {
      const firstCommentPartId = Number(firstCommentPart.getAttribute('data-comment-id'));
      const lastCommentPartId = Number(lastCommentPart.getAttribute('data-comment-id'));

      this.comments = cd.comments.slice(firstCommentPartId, lastCommentPartId + 1);
      if (hasSubsections) {
        const endIndex = this.comments.findIndex((comment) => !(
          this.parser.context.follows(this.lastElementInFirstChunk, comment.elements[0]) ||
          this.lastElementInFirstChunk.contains(comment.elements[0])
        ));
        this.commentsInFirstChunk = this.comments.slice(0, endIndex || 0);
      }

      this.comments[0].followsHeading = true;
    }

    /**
     * Section ID. Same as the section index in {@link module:cd~convenientDiscussions.sections
     * convenientDiscussions.sections}.
     *
     * @type {number}
     */
    this.id = cd.sections.length;

    /**
     * Comments contained in the section.
     *
     * @type {Comment[]}
     */
    this.comments = this.comments || [];

    /**
     * Comments contained in the first chunk of the section, i.e. all elements up to the first
     * subheading if it is present, or all elements if it is not.
     *
     * @type {Comment[]}
     */
    this.commentsInFirstChunk = this.commentsInFirstChunk || this.comments;

    /**
     * Section elements.
     *
     * @type {Element[]}
     */
    this.elements = elements;
  }

  /**
   * Get the parent section of the section.
   *
   * @param {boolean} [ignoreFirstLevel=true] Don't consider sections of the first level parent
   *   sections; stop at second level sections.
   * @returns {?SectionSkeleton}
   */
  getParent(ignoreFirstLevel = true) {
    if (ignoreFirstLevel && this.level <= 2) {
      return null;
    }
    return (
      cd.sections
        .slice(0, this.id)
        .reverse()
        .find((section) => section.level < this.level) ||
      null
    );
  }

  /**
   * Get the ancestors of the section as an array, starting with the parent section.
   *
   * @returns {Array}
   */
  getParentTree() {
    if (!this.cachedParentTree) {
      this.cachedParentTree = [];
      let section = this;
      while ((section = section.getParent(false))) {
        this.cachedParentTree.push(section);
      }
    }
    return this.cachedParentTree;
  }
}
