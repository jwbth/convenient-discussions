/**
 * Web worker entry point.
 *
 * Note that currently there may be difficulties in testing the web worker in the "local" mode with
 * custom config functions such as {@link module:defaultConfig.checkForCustomForeignComponents} due
 * to the (unfortunate) use of `eval()` here and the fact that webpack renames some objects in some
 * contexts resulting in a lost tie between them.
 *
 * @module worker
 */

// Workaround to fix the error when trying to import unique() to CommentSkeleton.
import { unique } from './util';
void unique;

import CdError from './CdError';
import CommentSkeleton from './CommentSkeleton';
import Parser from './Parser';
import SectionSkeleton from './SectionSkeleton';
import cd from './cd';
import debug from './debug';
import { getAllTextNodes, parseDocument } from './htmlparser2Extended';
import { resetCommentAnchors } from './timestamp';

let firstRun = true;
const context = {
  CommentClass: CommentSkeleton,
  SectionClass: SectionSkeleton,
  childElementsProp: 'childElements',
  follows: (el1, el2) => el1.follows(el2),
  getAllTextNodes,
  getElementByClassName: (node, className) => {
    const elements = node.getElementsByClassName(className, 1);
    return elements[0] || null;
  },
};
let alarmTimeout;

self.cd = cd;
cd.debug = debug;
cd.debug.init();

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
 * DomHandler's node
 *
 * @external Node
 * @see
 *   https://github.com/fb55/domhandler/blob/c3232247c2350566cb6a0cba45d5e34177b3b811/src/node.ts#L18
 */

/**
 * DomHandler's data node
 *
 * @external DataNode
 * @see
 *   https://github.com/fb55/domhandler/blob/c3232247c2350566cb6a0cba45d5e34177b3b811/src/node.ts#L84
 */

/**
 * DomHandler's element
 *
 * @external Element
 * @see
 *   https://github.com/fb55/domhandler/blob/c3232247c2350566cb6a0cba45d5e34177b3b811/src/node.ts#L200
 */

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

  const num = comment.hiddenElementData.push({
    type,
    tagName: el.tagName,
    html: el.outerHTML,
  });
  const textNode = context.document.createTextNode(`\x01${num}_${type}\x02`);
  el.parentNode.insertBefore(textNode, el);
  el.remove();

  if (comment.elements.includes(el)) {
    comment.elements[comment.elements.indexOf(el)] = textNode;
    return textNode;
  }
}

/**
 * Keep only those values of an object whose names are not in the "dangerous" names list.
 *
 * @param {object} obj
 * @param {Array} dangerousKeys
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
 * Parse the page and send a message to the window.
 *
 * @private
 */
function parse() {
  cd.comments = [];
  cd.sections = [];
  resetCommentAnchors();

  cd.debug.startTimer('worker: parse comments');
  const parser = new Parser(context);
  const timestamps = parser.findTimestamps();
  const signatures = parser.findSignatures(timestamps);

  signatures.forEach((signature) => {
    try {
      cd.comments.push(parser.createComment(signature));
    } catch (e) {
      if (!(e instanceof CdError)) {
        console.error(e);
      }
    }
  });
  cd.debug.stopTimer('worker: parse comments');

  cd.debug.startTimer('worker: parse sections');
  parser.findHeadings().forEach((heading) => {
    try {
      cd.sections.push(parser.createSection(heading));
    } catch (e) {
      if (!(e instanceof CdError)) {
        console.error(e);
      }
    }
  });
  cd.debug.stopTimer('worker: parse sections');

  cd.debug.startTimer('worker: prepare comments and sections');
  CommentSkeleton.processOutdents();
  cd.comments.forEach((comment) => {
    comment.hiddenElementData = [];
    comment.elementHtmls = comment.elements.map((element) => {
      if (/^H[1-6]$/.test(element.tagName)) {
        // Keep only the headline, as other elements contain dynamic identificators.
        const headlineElement = element.getElementsByClassName('mw-headline')[0];
        if (headlineElement) {
          headlineElement.getElementsByClassName('mw-headline-number')[0]?.remove();

          // Use Array.from, as childNodes is a live collection, and when element is removed or
          // moved, indexes will change.
          Array.from(element.childNodes).forEach((el) => {
            el.remove();
          });
          Array.from(headlineElement.childNodes).forEach(element.appendChild.bind(element));
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

      if (element.classList.contains('references') || ['STYLE', 'LINK'].includes(element.tagName)) {
        const textNode = hideElement(element, comment);
        return textNode.textContent;
      } else {
        const elementsToHide = [
          ...element.getElementsByClassName('autonumber'),
          ...element.getElementsByClassName('reference'),
          ...element.getElementsByClassName('references'),

          // Note that getElementsByTagName's range in this implementation of DOM includes the root
          // element.
          ...element.getElementsByTagName('style'),
          ...element.getElementsByTagName('link'),
        ];
        elementsToHide.forEach((el) => {
          hideElement(el, comment);
        });
        return element.outerHTML;
      }
    });

    /*
      We can't use outerHTML for comparing comment revisions as the difference may be in div vs. dd
      (li) tags in this case: This creates a dd tag.

        : Comment. [signature]

      This creates a div tag for the first comment.

        : Comment. [signature]
        :: Reply. [signature]

      So the HTML is "<dd><div>...</div><dl>...</dl></dd>". A newline also appears before </div>, so
      we need to trim.
     */
    comment.comparedHtml = '';
    comment.textComparedHtml = '';
    comment.headingComparedHtml = '';
    comment.elements.forEach((el) => {
      let comparedHtml;
      if (el.tagName === 'DIV') {
        // Workaround the bug where the {{smalldiv}} output (or any <div> wrapper around the
        // comment) is treated differently depending on whether there are replies to that comment.
        // When there are no, a <li>/<dd> element containing the <div> wrapper is the only comment
        // part; when there are, the <div> wrapper is.
        el.classList.remove('cd-comment-part', 'cd-comment-part-first', 'cd-comment-part-last');
        if (!el.getAttribute('class')) {
          el.removeAttribute('class');
        }
        comparedHtml = Object.keys(el.attribs).length ? el.outerHTML : el.innerHTML;
      } else {
        comparedHtml = el.innerHTML || el.textContent;
      }

      comment.comparedHtml += comparedHtml + '\n';
      if (/^H[1-6]$/.test(el.tagName)) {
        comment.headingComparedHtml += comparedHtml;
      } else {
        comment.textComparedHtml += comparedHtml + '\n';
      }
    });
    comment.comparedHtml = comment.comparedHtml.trim();
    comment.textComparedHtml = comment.textComparedHtml.trim();
    comment.headingComparedHtml = comment.headingComparedHtml.trim();

    comment.signatureElement.remove();
    comment.text = comment.elements.map((el) => el.textContent).join('\n').trim();

    comment.elementNames = comment.elements.map((el) => el.tagName);
  });

  let commentDangerousKeys = [
    'authorLink',
    'authorTalkLink',
    'cachedParent',
    'elements',
    'highlightables',
    'parser',
    'parts',
    'signatureElement',
    'timestampElement',
  ];
  let sectionDangerousKeys = [
    'cachedAncestors',
    'elements',
    'headingElement',
    'headlineElement',
    'lastElementInFirstChunk',
    'parser',
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

  cd.sections.forEach((section) => {
    section.parent = section.getParent();
    section.ancestors = section.getAncestors().map((section) => section.headline);
    section.oldestCommentAnchor = section.oldestComment?.anchor;

    keepSafeValues(section, sectionDangerousKeys);
  });

  cd.debug.stopTimer('worker: prepare comments and sections');
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

  if (firstRun) {
    console.debug('Convenient Discussions\' web worker has been successfully loaded. Click the link with the file name and line number to open the source code in your debug tool.');
    firstRun = false;
  }

  if (message.type === 'setAlarm') {
    setAlarm(message.interval);
  }

  if (message.type === 'removeAlarm') {
    clearTimeout(alarmTimeout);
  }

  if (message.type === 'parse') {
    cd.debug.startTimer('worker');

    cd.g = message.g;
    cd.config = message.config;

    cd.config.checkForCustomForeignComponents = restoreFunc(
      cd.config.checkForCustomForeignComponents
    );
    cd.g.IS_IPv6_ADDRESS = restoreFunc(cd.g.IS_IPv6_ADDRESS);


    context.document = parseDocument(message.text, {
      withStartIndices: true,
      withEndIndices: true,
      decodeEntities: false,
    });
    cd.g.rootElement = context.document.childNodes[0];
    cd.g.pageHasOutdents = Boolean(
      cd.g.rootElement.getElementsByClassName(cd.config.outdentClass, 1).length
    );

    parse();

    postMessage({
      type: message.type,
      revisionId: message.revisionId,
      resolverId: message.resolverId,
      comments: cd.comments,
      sections: cd.sections,
    });

    cd.debug.stopTimer('worker');
    cd.debug.logAndResetEverything();
  }
}

self.onmessage = onMessageFromWindow;
