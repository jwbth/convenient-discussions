import CdError from './CdError';
import CommentSkeleton from './CommentSkeleton';
import TreeWalker from './TreeWalker';
import cd from './cd';
import { defined, isElement, isHeadingNode, isMetadataNode, isText } from './utils-general';

/**
 * Class containing the main properties of a section and building it from a heading (we should
 * probably extract `SectionParser` from it). It is extended by {@link Section}. This class is the
 * only one used in the worker context for sections.
 */
class SectionSkeleton {
  /**
   * Section headline as it appears on the page.
   *
   * Foreign elements can get there, add the classes of these elements to
   * {@link module:defaultConfig.excludeFromHeadlineClasses} to filter them out.
   *
   * @type {string}
   */
  headline;

  /**
   * The name of the page the section is on in terms of wikitext.
   *
   * @type {?string}
   */
  sourcePageName = null;

  /**
   * Nesting level of the heading relative to the root element.
   *
   * @type {number}
   * @protected
   */
  headingNestingLevel;

  /**
   * Last element in the section.
   *
   * @type {ElementLike}
   */
  lastElement;

  /**
   * Last element in the first chunk of the section, i.e. all elements up to the first subheading
   * if it is present or just all elements if it is not.
   *
   * @type {ElementLike}
   */
  lastElementInFirstChunk;

  /**
   * Comments contained in the first chunk of the section, i.e. all elements up to the first
   * subheading if it is present, or all elements if it is not.
   *
   * @type {import('./CommentSkeleton').default[]}
   */
  commentsInFirstChunk;

  /**
   * Oldest comment in the section.
   *
   * @type {?import('./CommentSkeleton').default}
   */
  oldestComment;

  /**
   * Comments contained in the section.
   *
   * @type {import('./CommentSkeleton').default[]}
   */
  comments;

  /**
   * Create a section skeleton instance.
   *
   * @param {import('./Parser').default} parser
   * @param {import('./Parser').HeadingTarget} heading
   * @param {import('./Parser').Target[]} targets
   */
  constructor(parser, heading, targets) {
    this.parser = parser;

    /**
     * Heading element (`.mw-heading` or `<h1>` - `<h6>`).
     *
     * @type {ElementLike}
     */
    this.headingElement = heading.element;

    const returnNodeIfHNode = (/** @type {?ElementLike} */ node) =>
      node && isHeadingNode(node, true) ? node : null;


    /**
     * `<hN>` element of the section (`<h1>`-`<h6>`).
     *
     * @protected
     */
    this.hElement = (
      returnNodeIfHNode(this.headingElement) ||
      returnNodeIfHNode(this.headingElement.firstElementChild) ||

      // Russian Wikivoyage and anything with .mw-h2section (not to be confused with .mw-heading2).
      // Also, a precaution in case something in MediaWiki changes.
      this.headingElement.querySelectorAll('h1, h2, h3, h4, h5, h6')[0]
    );

    /**
     * Headline element.
     *
     * @type {ElementLike}
     * @protected
     */
    this.headlineElement = cd.g.isParsoidUsed ?
      this.hElement :

      // Presence of .mw-heading doesn't guarantee we have the new HTML for headings
      // (https://www.mediawiki.org/wiki/Heading_HTML_changes). We should test for the existence of
      // .mw-headline to make sure it's not there. (Could also check that .mw-editsection follows
      // hN.)
      (this.parser.context.getElementByClassName(this.hElement, 'mw-headline') || this.hElement);

    if (!this.headlineElement) {
      throw new CdError();
    }

    /**
     * Section id.
     *
     * @type {string}
     */
    this.id = /** @type {string} */ (this.headlineElement.getAttribute('id'));

    this.parseHeadline();

    /**
     * Section level. A level is a number representing the number of `=` characters in the section
     * heading's code.
     *
     * @type {number}
     */
    this.level = Number(
      /** @type {RegExpMatchArray} */ (this.hElement.tagName.match(/^H([1-6])$/))[1]
    );

    /**
     * Sequental number of the section at the time of the page load.
     *
     * @type {?number}
     */
    this.sectionNumber = null;

    const editLink = [
      ...(
        // Get menu links. Use two calls because our improvised .querySelectorAll() in
        // htmlparser2Extended doesn't support composite selectors.
        this.parser.context.getElementByClassName(this.headingElement, 'mw-editsection')
          ?.getElementsByTagName('a') ||
        []
      )
    ]
      // &action=edit, ?action=edit (couldn't figure out where this comes from, but at least one
      // user has such links), &veaction=editsource. We perhaps could catch veaction=edit, but
      // there's probably no harm in that.
      .find((link) => link.getAttribute('href')?.includes('action=edit'));

    if (editLink) {
      // `href` property with the full URL is not available in the worker context.
      const editUrl = new URL(cd.g.server + editLink.getAttribute('href'));
      if (editUrl) {
        const sectionParam = editUrl.searchParams.get('section');
        if (sectionParam && sectionParam.startsWith('T-')) {
          this.sourcePageName = editUrl.searchParams.get('title');
          this.sectionNumber = Number((sectionParam.match(/\d+/) || [])[0]);
        } else {
          this.sectionNumber = Number(sectionParam);
        }
        if (Number.isNaN(this.sectionNumber)) {
          this.sectionNumber = null;
        }

        /**
         * URL to edit the section.
         *
         * @type {string}
         */
        this.editUrl = editUrl.href;
      }
    }

    this.initContent(heading, targets);

    /**
     * Section index. Same as the index in the array returned by
     * {@link module:sectionRegistry.getAll}.
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
  initContent(heading, targets) {
    this.headingNestingLevel = this.parser.getNestingLevel(this.headingElement);

    // Find the next heading element
    const headingIndex = targets.indexOf(heading);
    let /** @type {number|undefined} */ nextHeadingIndex = targets
      .findIndex((target, i) => i > headingIndex && target.type === 'heading');
    let nextHeadingElement;
    if (nextHeadingIndex === -1) {
      nextHeadingIndex = undefined;
    } else {
      nextHeadingElement = targets[nextHeadingIndex]?.element;
    }

    // Find the next heading element whose section is not a descendant of this section
    let /** @type {number|undefined} */ nndheIndex = targets.findIndex((target, i) => (
      i > headingIndex &&
      target.type === 'heading' &&
      target.level <= this.level
    ));
    let nextNotDescendantHeadingElement;
    if (nndheIndex === -1) {
      nndheIndex = undefined;
    } else {
      nextNotDescendantHeadingElement = targets[nndheIndex]?.element;
    }

    /** @typedef {ElementLike} TreeWalkerAcceptedNode */
    const treeWalker = new TreeWalker(
      this.parser.context.rootElement,
      /** @type {(node: ElementLike) => node is TreeWalkerAcceptedNode} */ (node) =>
        !isMetadataNode(node) &&
        !node.classList.contains('cd-section-button-container'),
      true
    );

    this.lastElement = this.getLastElement(nextNotDescendantHeadingElement, treeWalker);

    this.lastElementInFirstChunk = nextHeadingElement === nextNotDescendantHeadingElement ?
      this.lastElement :
      this.getLastElement(nextHeadingElement, treeWalker);

    const targetsToComments = (/** @type {import('./Parser').Target[]} */ targets) => (
      targets
        .filter((target) => target.type === 'signature')
        .map((target) => target.comment)
        .filter(defined)
    );

    this.comments = targetsToComments(targets.slice(headingIndex, nndheIndex));
    this.commentsInFirstChunk = targetsToComments(targets.slice(headingIndex, nextHeadingIndex));
    this.oldestComment = CommentSkeleton.getOldest(this.comments, true);
    this.comments ||= [];
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
   * @param {ElementLike|undefined} followingHeadingElement
   * @param {import('./TreeWalker').default<ElementLike>} treeWalker
   * @returns {ElementLike}
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
      lastElement = /** @type {ElementLike} */ (this.parser.context.rootElement.lastElementChild);
    }

    // Some wrappers that include the section heading added by users
    while (
      lastElement &&
      lastElement.contains(this.headingElement) &&
      lastElement !== this.headingElement
    ) {
      lastElement = /** @type {ElementLike} */ (lastElement.lastElementChild);
    }

    if (cd.config.reflistTalkClasses.some((name) => lastElement.classList?.contains(name))) {
      lastElement = /** @type {ElementLike} */ (lastElement.previousElementSibling);
    }

    return lastElement;
  }

  /**
   * _For internal use._ Parse the headline of the section and fill the
   * {@link SectionSkeleton#headline headline} property that contains no HTML tags.
   */
  parseHeadline() {
    const classesToFilter = [
      // Was removed in 2021, see T284921. Keep this for some time.
      'mw-headline-number',

      'mw-editsection-like',
      ...cd.config.excludeFromHeadlineClasses,
    ];

    this.headline = [...this.headlineElement.childNodes]
      .filter((node) => (
        isText(node) ||
        (
          isElement(node) &&
          !(isMetadataNode(node) || classesToFilter.some((name) => node.classList.contains(name)))
        )
      ))
      .map((node) => node.textContent)
      .join('')
      .trim();
  }

  /**
   * Get the parent section of the section.
   *
   * @param {boolean} [ignoreFirstLevel=true] Don't consider sections of the first level parent
   *   sections; stop at second level sections.
   * @returns {?this}
   */
  getParent(ignoreFirstLevel = true) {
    if (ignoreFirstLevel && this.level <= 2) {
      return null;
    }

    return (
      /** @type {this} */ (cd.sections
        .slice(0, this.index)
        .reverse()
        .find((section) => section.level < this.level)) ||
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
   * @returns {this[]}
   */
  getAncestors() {
    if (!this.cachedAncestors) {
      this.cachedAncestors = /** @type {this[]} */ ([]);
      let section;
      for (section = this.getParent(); section; section = section.getParent()) {
        this.cachedAncestors.push(section);
      }
    }

    return this.cachedAncestors;
  }
}

export default SectionSkeleton;
