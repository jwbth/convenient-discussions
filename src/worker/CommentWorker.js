import { isText } from 'domhandler';

import CommentSkeleton from '../CommentSkeleton';
import { isDomHandlerElement, isHeadingNode, isMetadataNode } from '../utils-general';

import { keepSafeValues } from './worker';

/**
 * Comment class used in the worker scope.
 */
export default class CommentWorker extends CommentSkeleton {
  /** @type {import('domhandler').Element[]} */
  elements;

  /**
   * @typedef {object} HiddenElementData
   * @property {string} type
   * @property {string} tagName
   * @property {string} html
   */

  /** @type {HiddenElementData[]} */
  hiddenElementsData;

  /** @type {string[]} */
  elementHtmls;

  /** @type {string} */
  htmlToCompare;

  /** @type {string} */
  textHtmlToCompare;

  /** @type {string} */
  headingHtmlToCompare;

  /** @type {string} */
  text;

  /** @type {string[]} */
  elementNames;

  /** @type {string[]} */
  elementClassNames;

  /** @type {CommentWorker[]} */
  children;

  /** @type {CommentWorker[]} */
  previousComments;

  /** @type {CommentWorker|undefined} */
  parent;

  /** @type {boolean|undefined} */
  isToMe;

  /** @type {?import('./SectionWorker').default} */
  section;

  /**
   * Remove unnecessary content, hide dynamic content in a comment.
   */
  filterCommentContent() {
    this.hiddenElementsData = [];
    this.elementHtmls = this.elements
      .map((/** @type {import('domhandler').Element} */ element) => {
        if (isHeadingNode(element)) {
          // Keep only the headline, as other elements contain dynamic identifiers.
          let headlineElement = element.getElementsByClassName('mw-headline', 1)[0];
          if (!headlineElement) {
            headlineElement = element.querySelectorAll('h1, h2, h3, h4, h5, h6')[0];
          }
          if (headlineElement) {
            // Was removed in 2021, see T284921. Keep this for some time.
            headlineElement.getElementsByClassName('mw-headline-number', 1)[0]?.remove();

            // Use `[...iterable]`, as childNodes is a live collection, and when an element is removed
            // or moved, indexes will change.
            [...element.childNodes].forEach((el) => {
              el.remove();
            });
            [...headlineElement.childNodes].forEach(element.appendChild.bind(element));
          }
        }

        // Data attributes may include dynamic components, for example
        // https://ru.wikipedia.org/wiki/Проект:Знаете_ли_вы/Подготовка_следующего_выпуска.
        CommentWorker.removeDataAndParsoidAttributes(element);
        element
          .getElementsByAttribute(/^data-|^id$/)
          .forEach(CommentWorker.removeDataAndParsoidAttributes);

        // Empty comment anchors, in most cases added by the script.
        element.getElementsByTagName('span')
          .filter((el) => el.attribs.id && Object.keys(el.attribs).length === 1 && !el.textContent)
          .forEach((el) => {
            el.remove();
          });

        element
          .filterRecursively((node) => node.nodeType === Node.COMMENT_NODE)
          .forEach((node) => {
            node.remove();
          });

        if (element.classList.contains('references') || isMetadataNode(element)) {
          return this.hideElement(element).textContent;
        } else {
          element
            .filterRecursively((node) => (
              isDomHandlerElement(node) &&
              (
                ['autonumber', 'reference', 'references']
                  .some((name) => node.classList.contains(name)) ||

                // Note that filterRecursively()'s range includes the root element.
                isMetadataNode(node)
              )
            ))
            .forEach((/** @type {import('domhandler').Element} */ el) => {
              this.hideElement(el);
            });
          return element.outerHTML;
        }
      });
  }

  /**
   * Add properties to a comment that will be used to compare its content to the content of a
   * comment in another revision.
   */
  addCompareHelperProperties() {
    /*
      One of the reasons for the existence of this function is that we can't use `outerHTML` for
      comparing comment revisions as the difference may be in <div> vs. <dd> (<li>) tags in this case:

      This creates a <dd> tag:

        : Comment. [signature]

      This creates a <div> tag for the first comment:

        : Comment. [signature] :: Reply. [signature]

      So the HTML is `<dd><div>...</div><dl>...</dl></dd>`. A newline also appears before `</div>`, so
      we need to trim.
    */
    this.htmlToCompare = '';
    this.textHtmlToCompare = '';
    this.headingHtmlToCompare = '';
    this.elements.forEach((el) => {
      let htmlToCompare;
      el.getElementsByTagName?.('svg').forEach((svg) => {
        // Extension:Charts uses dynamically generated class names
        svg.remove();
      });
      el.getElementsByClassName?.('ext-discussiontools-init-timestamplink').forEach((link) => {
        // The link may change
        link.removeAttribute('href');
      });
      if (el.tagName === 'DIV' && !el.classList.contains('mw-heading')) {
        // Workaround the bug where the {{smalldiv}} output (or any <div> wrapper around the
        // comment) is treated differently depending on whether there are replies to that comment.
        // When there are no, a <li>/<dd> element containing the <div> wrapper is the only comment
        // part; when there are, the <div> wrapper is.
        el.classList.remove('cd-comment-part', 'cd-comment-part-first', 'cd-comment-part-last');
        if (!el.getAttribute('class')) {
          el.removeAttribute('class');
        }
        if (
          Object.keys(el.attribs).length

          // Fix comments with {{smalldiv}} ({{block-small}}) when they get replies, like after
          // https://ru.wikipedia.org/?diff=141768916
          && el.className !== 'cd-comment-replacedPart'
        ) {
          // https://ru.wikipedia.org/w/index.php?title=Википедия:Форум/Правила&oldid=125661313#c-Vladimir_Solovjev-20220921144700-D6194c-1cc-20220919200300
          // without children has no trailing newline, while, with children, it has.
          if (isText(el.lastChild) && el.lastChild.data === '\n') {
            el.lastChild.remove();
          }
          htmlToCompare = el.outerHTML;
        } else {
          htmlToCompare = el.innerHTML;
        }
      } else {
        htmlToCompare = el.innerHTML || el.textContent;
      }

      this.htmlToCompare += htmlToCompare + '\n';
      if (isHeadingNode(el)) {
        this.headingHtmlToCompare += htmlToCompare;
      } else {
        this.textHtmlToCompare += htmlToCompare + '\n';
      }
    });
    this.htmlToCompare = this.htmlToCompare.trim();
    this.textHtmlToCompare = this.textHtmlToCompare.trim();
    this.headingHtmlToCompare = this.headingHtmlToCompare.trim();

    this.signatureElement.remove();
    this.text = this.elements.map((el) => el.textContent).join('\n').trim();

    this.elementNames = this.elements.map((el) => el.tagName);
    this.elementClassNames = this.elements.map((el) => el.className);
  }

  /**
   * Replace a comment element with a marker.
   *
   * @param {import('domhandler').Element} el
   * @returns {?import('domhandler').DataNode}
   * @private
   */
  hideElement(el) {
    let type;
    if (el.classList.contains('reference')) {
      type = 'reference';
    } else if (el.classList.contains('references')) {
      type = 'references';
    } else if (el.classList.contains('autonumber')) {
      type = 'autonumber';
    } else {
      type = 'templateStyles';
    }

    const num = /** @type {HiddenElementData[]} */ (this.hiddenElementsData).push({
      type,
      tagName: el.tagName,
      html: el.outerHTML,
    });
    const textNode = document.createTextNode(`\x01${num}_${type}\x02`);
    textNode.before(el);
    el.remove();

    if (this.elements.includes(el)) {
      this.elements[this.elements.indexOf(el)] = textNode;
      return textNode;
    }

    return null;
  }

  /**
   * Remove the element's attributes whose names start with `data-` and IDs added by Parsoid.
   *
   * @param {import('domhandler').Element} element
   * @private
   */
  static removeDataAndParsoidAttributes(element) {
    Object.keys(element.attribs).forEach((name) => {
      if (/^data-/.test(name) || (name === 'id' && /^mw.{2,3}$/.test(element.attribs[name]))) {
        element.removeAttribute(name);
      }
    });
  }

  /**
   * Prepare comments for transferring to the main process.
   *
   * @param {CommentWorker[]} comments
   */
  static tweakComments(comments) {
    comments.forEach((comment) => {
      comment.filterCommentContent();
      comment.addCompareHelperProperties();
    });

    comments.forEach((comment, i) => {
      comment.children = /** @type {CommentWorker[]} */ (comment.getChildren());
      comment.children.forEach((reply) => {
        reply.parent = comment;
        reply.isToMe = comment.isOwn;
      });

      comment.previousComments = comments
        .slice(Math.max(0, i - 2), i)
        .reverse();

      keepSafeValues(comment, [
        'authorLink',
        'authorTalkLink',
        'cachedParent',
        'elements',
        'extraSignatures',
        'highlightables',
        'parser',
        'parts',
        'signatureElement',
        'timestampElement',
      ]);
    });
  }
}
