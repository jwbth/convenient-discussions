/**
 * Web worker entry point.
 *
 * Note that currently there may be difficulties in testing the web worker in the "local" mode with
 * custom config functions such as {@link module:config/default.customForeignComponentChecker} due
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
import g from './staticGlobals';
import { ElementsTreeWalker } from './treeWalker';
import { getAllTextNodes, parseDOM } from './htmlparser2Extended';
import { resetCommentAnchors } from './timestamp';

self.cd = cd;
cd.g = g;
cd.debug = debug;
cd.debug.init();

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

  cd.debug.startTimer('processing comments');

  const parser = new Parser(context);

  cd.debug.startTimer('find timestamps');
  const timestamps = parser.findTimestamps();
  cd.debug.stopTimer('find timestamps');

  cd.debug.startTimer('find signatures');
  const signatures = parser.findSignatures(timestamps);
  cd.debug.stopTimer('find signatures');

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

  cd.debug.stopTimer('processing comments');
  cd.debug.startTimer('processing sections');

  const headings = parser.findHeadings();

  headings.forEach((heading) => {
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

  cd.comments.forEach((comment) => {
    // We need to determine which comments are replies to our comments. It would be too time-costly
    // to get a parent comment for every comment, so we go the opposite way: take our comments and
    // identify replies to them.
    if (comment.own && cd.comments[comment.id + 1]) {
      if (cd.g.specialElements.pageHasOutdents) {
        const treeWalker = new ElementsTreeWalker(comment.elements[comment.elements.length - 1]);
        let found;
        while (
          !found &&
          treeWalker.nextNode() &&
          !treeWalker.currentNode.classList.contains('cd-commentPart')
        ) {
          found = treeWalker.currentNode.classList.contains('outdent-template');
        }
        if (found) {
          cd.comments[comment.id + 1].toMe = true;
        }
      }

      if (!cd.comments[comment.id + 1].toMe) {
        cd.comments
          .slice(comment.id + 1)
          .some((otherComment) => {
            if (otherComment.section === comment.section && otherComment.level > comment.level) {
              if (
                otherComment.level === comment.level + 1 ||
                // Comments mistakenly indented more than one level
                otherComment.id === comment.id + 1
              ) {
                otherComment.toMe = true;
              }
            } else {
              return true;
            }
          });
      }
    }

    if (comment.section) {
      comment.sectionHeadline = comment.section.headline;
      comment.sectionAnchor = comment.section.anchor;
      delete comment.section;
    }
    delete comment.elements;
    delete comment.parts;
    delete comment.highlightables;
    delete comment.addAttributes;
    delete comment.setLevels;
    delete comment.getSection;
  });

  cd.debug.stopTimer('processing sections');
  cd.debug.startTimer('post message from the worker');

  postMessage({
    type: 'parse',
    comments: cd.comments,
  });

  cd.debug.stopTimer('post message from the worker');
  cd.debug.stopTimer('worker operations');
  console.debug('sent message from the worker', Date.now());
  cd.debug.logAndResetEverything();
}

/**
 * Callback for messages from the window.
 *
 * @param {Event} e
 * @private
 */
function onMessageFromWindow(e) {
  console.debug('received message from the main thread', Date.now());
  const message = e.data;

  if (message.type === 'setAlarm') {
    setAlarm(message.interval);
  }

  if (message.type === 'removeAlarm') {
    clearTimeout(alarmTimeout);
  }

  if (message.type === 'parse') {
    cd.debug.startTimer('worker operations');

    Object.assign(cd.g, message.g);
    cd.config = message.config;

    // FIXME: Any idea how to avoid using eval() here?
    let checker = cd.config.customForeignComponentChecker;
    if (checker && !/^ *function +/.test(checker) && !/^.+=>/.test(checker)) {
      checker = 'function ' + checker;
    }
    cd.config.customForeignComponentChecker = eval(checker);

    cd.g.TIMESTAMP_PARSER = eval(cd.g.TIMESTAMP_PARSER);

    cd.debug.startTimer('parse html');

    const dom = parseDOM(message.text, {
      withStartIndices: true,
      withEndIndices: true,
    });

    cd.debug.stopTimer('parse html');

    cd.g.rootElement = new Document(dom);
    context.document = cd.g.rootElement;
    cd.g.specialElements = {
      pageHasOutdents: Boolean(
        cd.g.rootElement.getElementsByClassName('outdent-template', 1).length
      ),
    };

    parse();
  }
}

onmessage = onMessageFromWindow;
