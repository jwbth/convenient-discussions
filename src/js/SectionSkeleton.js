import CdError from './CdError';
import cd from './cd';
import { TreeWalker } from './treeWalker';
import { defined } from './util';

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
     * Section anchor.
     *
     * @type {string}
     */
    this.anchor = this.headlineElement.getAttribute('id');

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

    let editSectionElement = this.parser.context
      .getElementByClassName(this.headingElement, 'mw-editsection');
    if (!editSectionElement) {
      editSectionElement = this.createSectionMenu();
    }
    const menuLinks = Array.from(editSectionElement.getElementsByTagName('a'));

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
     * Section ID. Same as the section index in
     * {@link convenientDiscussions.sections convenientDiscussions.sections}.
     *
     * @type {number}
     */
    this.id = cd.sections.length;
  }

  /**
   * Create a section menu if it was unexistent (on pages with `__NOEDITSECTION__`).
   *
   * @returns {Element|external:Element}
   */
  createSectionMenu() {
    const startBracket = document.createElement('span');
    startBracket.setAttribute('class', 'mw-editsection-bracket');
    startBracket.textContent = '[';
    const endBracket = document.createElement('span');
    endBracket.setAttribute('class', 'mw-editsection-bracket');
    endBracket.textContent = ']';
    const editSectionElement = document.createElement('span');
    editSectionElement.setAttribute('class', 'mw-editsection');
    editSectionElement.appendChild(startBracket);
    editSectionElement.appendChild(endBracket);
    this.headingElement.appendChild(editSectionElement);
    return editSectionElement;
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
      cd.g.rootElement,
      (node) => (
        !['STYLE', 'LINK'].includes(node.tagName) &&

        // .cd-section-button-container elements are added to level 2 sections, which means these
        // sections won't have them as elements but their last subsections can if they are included.
        // So we better don't include them at all.
        !node.classList.contains('cd-section-button-container')
      ),
      true,
      this.headingElement
    );

    this.headingNestingLevel = 0;
    while (treeWalker.parentNode()) {
      this.headingNestingLevel++;
    }

    const headingIndex = targets.indexOf(heading);
    let nextHeadingIndex = targets
      .findIndex((target, i) => i > headingIndex && target.type === 'heading');
    if (nextHeadingIndex === -1) {
      nextHeadingIndex = undefined;
    }
    const nextHeadingElement = targets[nextHeadingIndex]?.element;

    const levelRegexp = new RegExp(`^H[1-${this.level}]$`);

    // Next not descendant heading element index
    let nndheIndex = targets
      .findIndex((target, i) => (
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
  }

  /**
   * Get the last element in the section based on the next section's heading element.
   *
   * @param {Element|external:Element|undefined} nextHeadingElement
   * @param {TreeWalker} treeWalker
   * @returns {Element|external:Element}
   */
  getLastElement(nextHeadingElement, treeWalker) {
    let lastElement;
    if (nextHeadingElement) {
      treeWalker.currentNode = nextHeadingElement;
      while (!treeWalker.previousSibling()) {
        if (!treeWalker.parentNode()) break;
      }
      lastElement = treeWalker.currentNode;
    } else {
      lastElement = cd.g.rootElement.lastElementChild;
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
   * The returned value is cached, so don't change the array in-place.
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

export default SectionSkeleton;
