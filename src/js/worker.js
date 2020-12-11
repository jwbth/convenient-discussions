/**
 * Web worker entry point.
 *
 * Note that currently there may be difficulties in testing the web worker in the "local" mode with
 * custom config functions such as {@link module:defaultConfig.checkForCustomForeignComponents} due to
 * the (unfortunate) use of `eval()` here and the fact that webpack renames some objects in some
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
import g from './staticGlobals';
import { getAllTextNodes, parseDOM } from './htmlparser2Extended';
import { keepWorkerSafeValues } from './util';
import { resetCommentAnchors } from './timestamp';

let firstRun = true;
const context = {
  CommentClass: CommentSkeleton,
  SectionClass: SectionSkeleton,
  childElementsProperty: 'childElements',
  follows: (el1, el2) => el1.follows(el2),
  getAllTextNodes,
  getElementByClassName: (node, className) => {
    const elements = node.getElementsByClassName(className, 1);
    return elements[0] || null;
  },
};
let alarmTimeout;

self.cd = cd;
cd.g = g;
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
 * Parse the page and send a message to the window.
 *
 * @private
 */
function parse() {
  cd.comments = [];
  cd.sections = [];
  resetCommentAnchors();

  const parser = new Parser(context);
  const timestamps = parser.findTimestamps();
  const signatures = parser.findSignatures(timestamps);

  signatures.forEach((signature) => {
    try {
      const comment = parser.createComment(signature);
      if (comment.id !== undefined) {
        cd.comments.push(comment);
      }
    } catch (e) {
      if (!(e instanceof CdError)) {
        console.error(e);
      }
    }
  });

  parser.findHeadings().forEach((heading) => {
    try {
      const section = parser.createSection(heading);
      if (section.id !== undefined) {
        cd.sections.push(section);
      }
    } catch (e) {
      if (!(e instanceof CdError)) {
        console.error(e);
      }
    }
  });

  cd.debug.startTimer('prepare comments and sections');
  cd.sections.forEach((section) => {
    section.parentTree = section.getParentTree();
    section.firstCommentAnchor = section.comments[0]?.anchor;
  });

  cd.comments.forEach((comment) => {
    comment.getChildren().forEach((reply) => {
      reply.parent = comment;
    });
    const section = comment.getSection();
    comment.section = section ? keepWorkerSafeValues(section) : null;
    if (comment.parent) {
      comment.parentAuthorName = comment.parent.authorName;
      comment.parentAnchor = comment.parent.anchor;
      comment.toMe = comment.parent.isOwn;
    }
    comment.text = comment.elements.map((element) => element.textContent).join('\n');
    comment.elementHtmls = comment.elements
      .map((element) => {
        element.removeAttribute('id');
        element.removeAttribute('data-comment-id');
        return element.outerHTML;
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
    comment.innerHtml = comment.elements.map((element) => element.innerHTML).join('\n').trim();

    comment.elementTagNames = comment.elements.map((element) => element.tagName);
  });
  cd.debug.logAndResetTimer('prepare comments and sections');
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

  if (message.type.startsWith('parse')) {
    cd.debug.startTimer('worker operations');

    Object.assign(cd.g, message.g);
    cd.config = message.config;

    cd.config.checkForCustomForeignComponents = restoreFunc(
      cd.config.checkForCustomForeignComponents
    );
    cd.g.TIMESTAMP_PARSER = restoreFunc(cd.g.TIMESTAMP_PARSER);
    cd.g.IS_IPv6_ADDRESS = restoreFunc(cd.g.IS_IPv6_ADDRESS);

    const dom = parseDOM(message.text, {
      withStartIndices: true,
      withEndIndices: true,
    });

    cd.g.rootElement = new Document(dom);
    context.document = cd.g.rootElement;
    cd.g.specialElements = {
      pageHasOutdents: Boolean(
        cd.g.rootElement.getElementsByClassName('outdent-template', 1).length
      ),
    };

    parse();

    postMessage({
      type: message.type,
      revisionId: message.revisionId,
      comments: cd.comments.map(keepWorkerSafeValues),
      sections: cd.sections.map(keepWorkerSafeValues),
    });

    cd.debug.stopTimer('worker operations');
    cd.debug.logAndResetEverything();
  }
}

onmessage = onMessageFromWindow;
