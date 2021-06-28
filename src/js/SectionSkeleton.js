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
   * @param {Element|external:Element} headingElement
   */
  constructor(parser, headingElement) {
    this.parser = parser;

    /**
     * Headline element.
     *
     * @type {Element|external:Element}
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

    this.parseHeadline();

    const levelMatch = headingElement.tagName.match(/^H([1-6])$/);

    /**
     * Section level. A level is a number representing the number of `=` characters in the section
     * heading's code.
     *
     * @type {number}
     */
    this.level = levelMatch && Number(levelMatch[1]);

    /**
     * Sequental number of the section at the time of the page load.
     *
     * @type {?number}
     */
    this.sectionNumber = null;

    const editSectionElement = headingElement.lastChild;
    if (editSectionElement.classList.contains('mw-editsection')) {
       const links = Array.from(editSectionElement.getElementsByTagName('a'));

      // &action=edit, ?action=edit (couldn't figure out where this comes from, but at least one
      // user has such links), &veaction=editsource. We perhaps could catch veaction=edit, but
      // there's probably no harm in that.
      const editLink = links.find((link) => link.getAttribute('href')?.includes('action=edit'));

      if (editLink) {
        const href = cd.g.SERVER + editLink.getAttribute('href');

        /**
         * URL to edit the section.
         *
         * @type {string}
         */
        this.editUrl = new URL(href);

        if (this.editUrl) {
          const sectionNumber = this.editUrl.searchParams.get('section');
          if (sectionNumber.startsWith('T-')) {
            this.sourcePageName = this.editUrl.searchParams.get('title');
            this.sectionNumber = Number(sectionNumber.match(/\d+/)[0]);
          } else {
            this.sectionNumber = Number(sectionNumber);
          }
          this.editUrl = this.editUrl.href;
        }
      } else {
        console.error('Edit link not found.', this);
      }
    }

    const treeWalker = new TreeWalker(
      cd.g.rootElement,
      (node) => (
        !['STYLE', 'LINK'].includes(node.tagName) &&

        // .cd-section-button-container elements are added to level 2 sections, which means these
        // sections won't have them as elements but their last subsections can if they are included.
        // So we better don't include them at all.
        !node.classList.contains('cd-section-button-container')
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
     * @type {Element|external:Element}
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
        if (treeWalker.currentNode.classList.contains('cd-comment-part')) {
          firstCommentPart = treeWalker.currentNode;
        }
      } while (!firstCommentPart && treeWalker.currentNode !== lastNode && treeWalker.nextNode());

      treeWalker.currentNode = lastNode;
      do {
        if (treeWalker.currentNode.classList.contains('cd-comment-part')) {
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

      this.comments.forEach((comment) => {
        if (
          !this.oldestComment ||
          (!this.oldestComment.date && comment.date) ||
          this.oldestComment.date > comment.date
        ) {
          /**
           * Oldest comment in the section.
           *
           * @type {CommentSkeleton}
           */
          this.oldestComment = comment;
        }
      });

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

    this.commentsInFirstChunk.forEach((comment) => {
      comment.section = this;
    });

    /**
     * Section elements.
     *
     * @type {Element[]|external:Element[]}
     */
    this.elements = elements;
  }

  /**
   * _For internal use._ Parse the headline of the section and fill the
   * {@link module:Section#headline headline} property that contains no HTML tags.
   */
  parseHeadline() {
    const classesToFilter = ['mw-headline-number', ...cd.config.foreignElementInHeadlineClasses];
    const nodes = Array.from(this.headlineElement.childNodes).filter((node) => (
      node.nodeType !== Node.ELEMENT_NODE ||
      !classesToFilter.some((className) => node.classList.contains(className))
    ));

    /**
     * Section headline as it appears on the page.
     *
     * Foreign elements can get there, add the classes of these elements to
     * {@link module:defaultConfig.foreignElementInHeadlineClasses} to filter them out.
     *
     * @type {string}
     */
    this.headline = nodes.map((node) => node.textContent).join('').trim();
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
   * Get the chain of ancestors of the section as an array, starting with the parent section.
   *
   * @returns {SectionSkeleton[]}
   */
  getAncestors() {
    if (!this.cachedAncestors) {
      this.cachedAncestors = [];
      let section = this;
      while ((section = section.getParent(false))) {
        this.cachedAncestors.push(section);
      }
    }
    return this.cachedAncestors;
  }
}
