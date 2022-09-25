/**
 * Web worker entry point.
 *
 * Note that currently there may be difficulties in testing the web worker in the "single" mode with
 * custom config functions such as {@link module:defaultConfig.checkForCustomForeignComponents} due
 * to the (unfortunate) use of `eval()` here and the fact that webpack renames some objects in some
 * contexts resulting in a lost tie between them.
 *
 * @module worker
 */

import CdError from './CdError';
import CommentSkeleton from './CommentSkeleton';
import Parser from './Parser';
import SectionSkeleton from './SectionSkeleton';
import cd from './cd';
import debug from './debug';
import { isHeadingNode, isMetadataNode } from './utils';
import { parseDocument, walkThroughSubtree } from './htmlparser2Extended';

let isFirstRun = true;
let alarmTimeout;
let rootElement;

cd.isWorker = true;

cd.debug = debug;
debug.init();

/**
 * Send a "wake up" message to the window after the specified interval.
 *
 * @param {number} interval
 * @private
 */
function setAlarm(interval) {
  clearTimeout(alarmTimeout);
  alarmTimeout = setTimeout(() => {
    postMessage({ type: 'wakeUp' });
  }, interval);
}

/**
 * Get all text nodes under the root element.
 *
 * @returns {external:Node[]}
 * @private
 */
function getAllTextNodes() {
  let nodes = [];
  walkThroughSubtree(rootElement, (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      nodes.push(node);
    }

    // Remove comments DT reply button html comments as well to optimize.
    if (node.nodeType === Node.COMMENT_NODE && node.data.startsWith('__DTREPLYBUTTONS__')) {
      node.remove();
    }
  });
  return nodes;
}

/**
 * Remove all html comments added by DiscussionTools related to reply buttons.
 *
 * @private
 */
function removeDtButtonHtmlComments() {
  // See getAllTextNodes()
}

/**
 * DomHandler's node.
 *
 * @external Node
 * @see
 *   https://github.com/fb55/domhandler/blob/c3232247c2350566cb6a0cba45d5e34177b3b811/src/node.ts#L18
 */

/**
 * DomHandler's data node.
 *
 * @external DataNode
 * @see
 *   https://github.com/fb55/domhandler/blob/c3232247c2350566cb6a0cba45d5e34177b3b811/src/node.ts#L84
 */

/**
 * DomHandler's element.
 *
 * @external Element
 * @see
 *   https://github.com/fb55/domhandler/blob/c3232247c2350566cb6a0cba45d5e34177b3b811/src/node.ts#L200
 */

/**
 * Find comment signatures and section headings on the page.
 *
 * @param {Parser} parser
 * @returns {object[]}
 * @private
 */
function findTargets(parser) {
  parser.processAndRemoveDtMarkup();
  const headings = parser.findHeadings();
  const signatures = parser.findSignatures();
  return headings
    .concat(signatures)
    .sort((t1, t2) => parser.context.follows(t1.element, t2.element) ? 1 : -1);
}

/**
 * Parse the comments and modify the related parts of the DOM.
 *
 * @param {Parser} parser
 * @param {object[]} targets
 * @private
 */
function processComments(parser, targets) {
  targets
    .filter((target) => target.type === 'signature')
    .forEach((signature) => {
      try {
        cd.comments.push(parser.createComment(signature, targets));
      } catch (e) {
        if (!(e instanceof CdError)) {
          console.error(e);
        }
      }
    });
}

/**
 * Parse the sections and modify some parts of them.
 *
 * @param {Parser} parser
 * @param {object[]} targets
 * @private
 */
function processSections(parser, targets) {
  targets
    .filter((target) => target.type === 'heading')
    .forEach((heading) => {
      try {
        cd.sections.push(parser.createSection(heading, targets));
      } catch (e) {
        if (!(e instanceof CdError)) {
          console.error(e);
        }
      }
    });
}

/**
 * Remove the element's attributes whose names start with "data-".
 *
 * @param {external:Element} element
 * @private
 */
function removeDataAttributes(element) {
  Object.keys(element.attribs).forEach((name) => {
    if (/^data-/.test(name)) {
      element.removeAttribute(name);
    }
  });
}

/**
 * Replace a comment element with a marker.
 *
 * @param {external:Element} el
 * @param {CommentSkeleton} comment
 * @returns {external:DataNode|undefined}
 * @private
 */
function hideElement(el, comment) {
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

  const num = comment.hiddenElementsData.push({
    type,
    tagName: el.tagName,
    html: el.outerHTML,
  });
  const textNode = document.createTextNode(`\x01${num}_${type}\x02`);
  el.parentNode.insertBefore(textNode, el);
  el.remove();

  if (comment.elements.includes(el)) {
    comment.elements[comment.elements.indexOf(el)] = textNode;
    return textNode;
  }
}

/**
 * Remove unnecessary content, hide dynamic content in a comment.
 *
 * @param {CommentSkeleton} comment
 * @private
 */
function filterCommentContent(comment) {
  comment.hiddenElementsData = [];
  comment.elementHtmls = comment.elements.map((element) => {
    if (isHeadingNode(element)) {
      // Keep only the headline, as other elements contain dynamic identifiers.
      const headlineElement = element.getElementsByClassName('mw-headline', 1)[0];
      if (headlineElement) {
        headlineElement.getElementsByClassName('mw-headline-number', 1)[0]?.remove();

        // Use Array.from, as childNodes is a live collection, and when element is removed or
        // moved, indexes will change.
        [...element.childNodes].forEach((el) => {
          el.remove();
        });
        [...headlineElement.childNodes].forEach(element.appendChild.bind(element));
      }
    }

    // Data attributes may include dynamic components, for example
    // https://ru.wikipedia.org/wiki/Проект:Знаете_ли_вы/Подготовка_следующего_выпуска.
    removeDataAttributes(element);
    element.getElementsByAttribute(/^data-/).forEach(removeDataAttributes);

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
      return hideElement(element, comment).textContent;
    } else {
      element
        .filterRecursively((node) => (
          node.tagName &&
          (
            ['autonumber', 'reference', 'references']
              .some((name) => node.classList.contains(name)) ||

            // Note that filterRecursively's range includes the root element.
            isMetadataNode(node)
          )
        ))
        .forEach((el) => {
          hideElement(el, comment);
        });
      return element.outerHTML;
    }
  });
}

/**
 * Add properties to a comment that will be used to compare its content to the content of a comment
 * in another revision.
 *
 * @param {CommentSkeleton} comment
 * @private
 */
function addCompareHelperProperties(comment) {
  /*
    One of the reasons for the existing of this function is that we can't use `outerHTML` for
    comparing comment revisions as the difference may be in <div> vs. <dd> (<li>) tags in this case:

    This creates a <dd> tag:

      : Comment. [signature]

    This creates a <div> tag for the first comment:

      : Comment. [signature] :: Reply. [signature]

    So the HTML is `<dd><div>...</div><dl>...</dl></dd>`. A newline also appears before `</div>`, so
    we need to trim.
  */
  comment.htmlToCompare = '';
  comment.textHtmlToCompare = '';
  comment.headingHtmlToCompare = '';
  comment.elements.forEach((el) => {
    let htmlToCompare;
    if (el.tagName === 'DIV') {
      // Workaround the bug where the {{smalldiv}} output (or any <div> wrapper around the
      // comment) is treated differently depending on whether there are replies to that comment.
      // When there are no, a <li>/<dd> element containing the <div> wrapper is the only comment
      // part; when there are, the <div> wrapper is.
      el.classList.remove('cd-comment-part', 'cd-comment-part-first', 'cd-comment-part-last');
      if (!el.getAttribute('class')) {
        el.removeAttribute('class');
      }
      if (Object.keys(el.attribs).length) {
        // https://ru.wikipedia.org/w/index.php?title=Википедия:Форум/Правила&oldid=125661313#c-Vladimir_Solovjev-20220921144700-D6194c-1cc-20220919200300
        // without children has no trailing newline, while with children it has.
        if (el.lastChild?.data === '\n') {
          el.lastChild.remove();
        }
        htmlToCompare = el.outerHTML;
      } else {
        htmlToCompare = el.innerHTML;
      }
    } else {
      htmlToCompare = el.innerHTML || el.textContent;
    }

    comment.htmlToCompare += htmlToCompare + '\n';
    if (isHeadingNode(el)) {
      comment.headingHtmlToCompare += htmlToCompare;
    } else {
      comment.textHtmlToCompare += htmlToCompare + '\n';
    }
  });
  comment.htmlToCompare = comment.htmlToCompare.trim();
  comment.textHtmlToCompare = comment.textHtmlToCompare.trim();
  comment.headingHtmlToCompare = comment.headingHtmlToCompare.trim();

  comment.signatureElement.remove();
  comment.text = comment.elements.map((el) => el.textContent).join('\n').trim();

  comment.elementNames = comment.elements.map((el) => el.tagName);
}

/**
 * Keep only those values of an object whose names are not in the "dangerous" names list.
 *
 * @param {object} obj
 * @param {string[]} dangerousKeys
 * @private
 */
function keepSafeValues(obj, dangerousKeys) {
  // Use the same object, as creating a copy would kill the prototype.
  Object.keys(obj).forEach((key) => {
    if (dangerousKeys.includes(key)) {
      delete obj[key];
    }
  });
}

/**
 * Prepare comments and sections for transferring to the main process. Remove unnecessary content
 * and properties, hide dynamic content, add properties.
 *
 * @param {Parser} parser
 * @private
 */
function prepareCommentsAndSections(parser) {
  CommentSkeleton.processOutdents(parser);

  cd.comments.forEach((comment) => {
    filterCommentContent(comment);
    addCompareHelperProperties(comment);
  });

  let commentDangerousKeys = [
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
  ];

  cd.comments.forEach((comment, i) => {
    comment.children = comment.getChildren();
    comment.children.forEach((reply) => {
      reply.parent = comment;
      reply.isToMe = comment.isOwn;
    });

    comment.previousComments = cd.comments
      .slice(Math.max(0, i - 2), i)
      .reverse();

    keepSafeValues(comment, commentDangerousKeys);
  });

  let sectionDangerousKeys = [
    'cachedAncestors',
    'headingElement',
    'headlineElement',
    'lastElement',
    'lastElementInFirstChunk',
    'parser',
  ];

  cd.sections.forEach((section) => {
    section.parent = section.getParent();
    section.ancestors = section.getAncestors().map((section) => section.headline);
    section.oldestCommentId = section.oldestComment?.id;

    keepSafeValues(section, sectionDangerousKeys);
  });
}

/**
 * Parse the page and send a message to the window.
 *
 * @private
 */
function parse() {
  cd.comments = [];
  cd.sections = [];

  let areThereOutdents;
  const parser = new Parser({
    CommentClass: CommentSkeleton,
    SectionClass: SectionSkeleton,
    childElementsProp: 'childElements',
    follows: (el1, el2) => el1.follows(el2),
    getAllTextNodes,
    getElementByClassName: (node, className) => {
      const elements = node.getElementsByClassName(className, 1);
      return elements[0] || null;
    },
    rootElement,
    areThereOutdents: () => {
      areThereOutdents ??= Boolean(
        rootElement.getElementsByClassName(cd.config.outdentClass, 1).length
      );
      return areThereOutdents;
    },
    handleDtMarkup: (elements) => {
      elements.forEach((el) => {
        el.remove();
      });
    },
    removeDtButtonHtmlComments,
  });

  const targets = findTargets(parser);

  debug.startTimer('worker: process comments');
  processComments(parser, targets);
  debug.stopTimer('worker: process comments');

  debug.startTimer('worker: process sections');
  processSections(parser, targets);
  debug.stopTimer('worker: process sections');

  debug.startTimer('worker: prepare comments and sections');
  prepareCommentsAndSections(parser);
  debug.stopTimer('worker: prepare comments and sections');
}

/**
 * Restore function from its code.
 *
 * @param {string} code
 * @returns {Function}
 * @private
 */
function restoreFunc(code) {
  if (code) {
    if (!/^ *function\b/.test(code) && !/^.+=>/.test(code)) {
      code = 'function ' + code;
    }
    if (/^ *function *\(/.test(code)) {
      code = '(' + code + ')';
    }
  }

  // FIXME: Any idea how to avoid using eval() here?
  return eval(code);
}

/**
 * Callback for messages from the window.
 *
 * @param {Event} e
 * @private
 */
function onMessageFromWindow(e) {
  const message = e.data;

  if (isFirstRun) {
    console.debug('Convenient Discussions\' web worker has been successfully loaded. Click the link with the file name and line number to open the source code in your debug tool.');
    isFirstRun = false;
  }

  if (message.type === 'setAlarm') {
    setAlarm(message.interval);
  }

  if (message.type === 'removeAlarm') {
    clearTimeout(alarmTimeout);
  }

  if (message.type === 'parse') {
    debug.startTimer('worker');

    cd.g = message.g;
    cd.config = message.config;

    cd.config.checkForCustomForeignComponents = restoreFunc(
      cd.config.checkForCustomForeignComponents
    );
    cd.g.isIPv6Address = restoreFunc(cd.g.isIPv6Address);

    self.document = parseDocument(message.text, {
      withStartIndices: true,
      withEndIndices: true,
      decodeEntities: false,
    });
    rootElement = document.childNodes[0];

    parse();

    postMessage({
      type: message.type,
      revisionId: message.revisionId,
      resolverId: message.resolverId,
      comments: cd.comments,
      sections: cd.sections,
    });

    debug.stopTimer('worker');
    debug.logAndResetEverything();
  }
}

self.onmessage = onMessageFromWindow;
