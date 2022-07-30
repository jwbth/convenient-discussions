import CdError from './CdError';
import cd from './cd';
import { TreeWalker } from './treeWalker';
import { defined, isMetadataNode } from './util';

/**
 * Class containing the main properties of a section. This class is the only one used in the worker
 * context for sections.
 */
class SectionSkeleton {
  /**
   * Create a section skeleton instance.
   *
   * @param {Parser} parser
   * @param {object} heading
   * @param {object[]} targets
   */
  constructor(parser, heading, targets) {
    this.parser = parser;

    /**
     * Heading element.
     *
     * @type {Element|external:Element}
     */
    this.headingElement = heading.element;

    /**
     * Headline element.
     *
     * @type {Element|external:Element}
     */
    this.headlineElement = this.parser.context
      .getElementByClassName(this.headingElement, 'mw-headline');

    if (!this.headlineElement) {
      throw new CdError();
    }

    /**
     * Section id.
     *
     * @type {string}
     */
    this.id = this.headlineElement.getAttribute('id');

    this.parseHeadline();

    const levelMatch = this.headingElement.tagName.match(/^H([1-6])$/);

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

    const editSectionElement = this.parser.context
      .getElementByClassName(this.headingElement, 'mw-editsection');
    const menuLinks = editSectionElement ? [...editSectionElement.getElementsByTagName('a')] : [];

    // &action=edit, ?action=edit (couldn't figure out where this comes from, but at least one
    // user has such links), &veaction=editsource. We perhaps could catch veaction=edit, but
    // there's probably no harm in that.
    const editLink = menuLinks.find((link) => link.getAttribute('href')?.includes('action=edit'));

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
    }

    this.setContentProperties(heading, targets);

    /**
     * Section index. Same as the section index in
     * {@link convenientDiscussions.sections convenientDiscussions.sections}.
     *
     * @type {number}
     */
    this.index = cd.sections.length;
  }

  /**
   * Set some properties related to the content of the section (contained elements and comments).
   *
   * @param {object} heading
   * @param {object[]} targets
   * @private
   */
  setContentProperties(heading, targets) {
    const treeWalker = new TreeWalker(
      this.parser.context.rootElement,
      (node) => !isMetadataNode(node) && !node.classList.contains('cd-section-button-container'),
      true,
      this.headingElement
    );

    this.headingNestingLevel = 0;
    while (treeWalker.parentNode()) {
      this.headingNestingLevel++;
    }

    // Find the next heading element
    const headingIndex = targets.indexOf(heading);
    let nextHeadingIndex = targets
      .findIndex((target, i) => i > headingIndex && target.type === 'heading');
    if (nextHeadingIndex === -1) {
      nextHeadingIndex = undefined;
    }
    const nextHeadingElement = targets[nextHeadingIndex]?.element;

    // Find the next heading element whose section is not a descendant of this section
    const levelRegexp = new RegExp(`^H[1-${this.level}]$`);
    let nndheIndex = targets.findIndex((target, i) => (
      i > headingIndex &&
      target.type === 'heading' &&
      levelRegexp.test(target.element.tagName)
    ));
    if (nndheIndex === -1) {
      nndheIndex = undefined;
    }
    const nextNotDescendantHeadingElement = targets[nndheIndex]?.element;

    /**
     * Last element in the section.
     *
     * @type {Element|external:Element}
     */
    this.lastElement = this.getLastElement(nextNotDescendantHeadingElement, treeWalker);

    /**
     * Last element in the first chunk of the section, i.e. all elements up to the first subheading
     * if it is present or just all elements if it is not.
     *
     * @type {Element|external:Element}
     */
    this.lastElementInFirstChunk = nextHeadingElement === nextNotDescendantHeadingElement ?
      this.lastElement :
      this.getLastElement(nextHeadingElement, treeWalker);

    const targetsToComments = (targets) => (
      targets
        .filter((target) => target.type === 'signature')
        .map((target) => target.comment)
        .filter(defined)
    );

    this.comments = targetsToComments(targets.slice(headingIndex, nndheIndex));
    this.commentsInFirstChunk = targetsToComments(targets.slice(headingIndex, nextHeadingIndex));

    this.comments.forEach((comment) => {
      if (
        !this.oldestComment ||
        (comment.date && (!this.oldestComment.date || this.oldestComment.date > comment.date))
      ) {
        /**
         * Oldest comment in the section.
         *
         * @type {CommentSkeleton}
         */
        this.oldestComment = comment;
      }
    });

    /**
     * Comments contained in the section.
     *
     * @type {Comment[]}
     */
    this.comments ||= [];

    /**
     * Comments contained in the first chunk of the section, i.e. all elements up to the first
     * subheading if it is present, or all elements if it is not.
     *
     * @type {Comment[]}
     */
    this.commentsInFirstChunk ||= this.comments;

    this.commentsInFirstChunk.forEach((comment) => {
      comment.section = this;
    });
  }

  /**
   * Get the last element in the section based on a following (directly or not) section's heading
   * element.
   *
   * Sometimes sections are nested trickily in some kind of container elements, so a following
   * structure may take place:
   * ```html
   * == Heading 1 ==
   * <p>Paragraph 1.</p>
   * <div>
   *   <p>Paragraph 2.</p>
   *   == Heading 2 ==
   *   <p>Paragraph 3.</p>
   * </div>
   * <p>Paragraph 4.</p>
   * == Heading 3 ==
   * ```
   *
   * In this case, section 1 has paragraphs 1 and 2 as the first and last, and section 2 has
   * paragraphs 3 and 4 as such. Our code must capture that.
   *
   * @param {Element|external:Element|undefined} followingHeadingElement
   * @param {TreeWalker} treeWalker
   * @returns {Element|external:Element}
   */
  getLastElement(followingHeadingElement, treeWalker) {
    let lastElement;
    if (followingHeadingElement) {
      treeWalker.currentNode = followingHeadingElement;
      while (!treeWalker.previousSibling()) {
        if (!treeWalker.parentNode()) break;
      }
      lastElement = treeWalker.currentNode;
    } else {
      lastElement = this.parser.context.rootElement.lastElementChild;
    }
    while (lastElement.contains(this.headingElement) && lastElement !== this.headingElement) {
      lastElement = lastElement.lastElementChild;
    }
    return lastElement;
  }

  /**
   * _For internal use._ Parse the headline of the section and fill the
   * {@link Section#headline headline} property that contains no HTML tags.
   */
  parseHeadline() {
    const classesToFilter = ['mw-headline-number', ...cd.config.foreignElementInHeadlineClasses];
    const nodes = [...this.headlineElement.childNodes].filter((node) => (
      node.nodeType === Node.TEXT_NODE ||
      !(isMetadataNode(node) || classesToFilter.some((name) => node.classList.contains(name)))
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
        .slice(0, this.index)
        .reverse()
        .find((section) => section.level < this.level) ||
      null
    );
  }

  /**
   * Get the chain of ancestors of the section as an array, starting with the parent section.
   *
   * The returned value is cached, so don't change the array in-place. (That's ugly, need to check
   * if running .slice() on the array slows anything down. To be clear – this method is run very
   * frequently.)
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

/**
 * Object with the same basic structure as {@link SectionSkeleton} has. (It comes from a web
 * worker so its constructor is lost.)
 *
 * @typedef {object} SectionSkeletonLike
 */

export default SectionSkeleton;
