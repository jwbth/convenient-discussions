/**
 * Web worker entry point.
 *
 * Note that currently there may be difficulties in testing the web worker in the "single" mode with
 * custom config functions such as {@link module:defaultConfig.rejectNode} due to the (unfortunate)
 * use of `eval()` here and the fact that webpack renames some objects in some contexts resulting in
 * a lost tie between them.
 *
 * @module worker
 */

import './domhandlerExtended';

import { isComment, isText } from 'domhandler';
import { parseDocument } from 'htmlparser2';

import CdError from '../CdError';
import CommentSkeleton from '../CommentSkeleton';
import Parser from '../Parser';
import cdTemp from '../cd';
import debug from '../debug';

import CommentWorker from './CommentWorker';
import SectionWorker from './SectionWorker';

let isFirstRun = true;
let alarmTimeout;
let rootElement;

/** @type {import('../cd').ConvenientDiscussionsWorker} */
const cd = cdTemp;

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
 * @returns {import('domhandler').Node[]}
 * @private
 */
function getAllTextNodes() {
  let nodes = [];
  rootElement.traverseSubtree((/** @type {import('domhandler').Node} */ node) => {
    if (isText(node)) {
      nodes.push(node);
    }

    // Remove DT reply button html comments as well to optimize.
    if (isComment(node) && node.data.startsWith('__DTREPLYBUTTONS__')) {
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
 * Find comment signatures and section headings on the page.
 *
 * @param {Parser} parser
 * @returns {object[]}
 * @private
 */
function findTargets(parser) {
  parser.init();
  parser.processAndRemoveDtMarkup();
  return /** @type {import('../Parser').Target[]} */ (parser.findHeadings())
    .concat(parser.findSignatures())
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
 * Keep only those values of an object whose names are not in the "dangerous" names list.
 *
 * @param {object} obj
 * @param {string[]} dangerousKeys
 * @private
 */
export function keepSafeValues(obj, dangerousKeys) {
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
  CommentWorker.tweakComments(cd.comments);
  SectionWorker.tweakSections(cd.sections);
}

/**
 * Parse the page and send a message to the window.
 *
 * @private
 */
function parse() {
  cd.comments = [];
  cd.sections = [];

  Parser.init();
  let areThereOutdents;
  const parser = new Parser({
    CommentClass: CommentWorker,
    SectionClass: SectionWorker,
    childElementsProp: 'childElements',
    follows: (el1, el2) => el1.follows(el2),
    getAllTextNodes,
    getElementByClassName: (el, className) => {
      const elements = el.getElementsByClassName(className, 1);
      return elements[0] || null;
    },
    rootElement,
    areThereOutdents: () => {
      areThereOutdents ??= Boolean(
        rootElement.getElementsByClassName(cd.config.outdentClass, 1).length
      );
      return areThereOutdents;
    },
    processAndRemoveDtElements: (/** @type {import('domhandler').Element[]} */ elements) => {
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
 * @param {?string} code
 * @returns {?Function}
 * @private
 */
function restoreFunc(code) {
  if (!code) {
    return null;
  }

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
 * @param {MessageEvent} event
 * @private
 */
function onMessageFromWindow(event) {
  /**
   * @typedef {object} Message
   * @property {string} type
   * @property {string} [revisionId]
   * @property {number} [resolverId]
   * @property {string} [text]
   * @property {import('../cd').ConvenientDiscussions['g']} [g]
   * @property {import('../cd').ConvenientDiscussions['config']} [config]
   * @property {number} [interval]
   */

  /**
   * @type {Message}
   */
  const message = event.data;

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
    const timerLabel = `worker: processing revision ${message.revisionId}`;
    debug.startTimer(timerLabel);

    cd.g = message.g;
    cd.config = message.config;

    cd.config.rejectNode = restoreFunc(
      /** @type {string} */ (/** @type {unknown} */ (cd.config.rejectNode))
    );
    cd.g.isIPv6Address = restoreFunc(
      /** @type {string} */ (/** @type {unknown} */ (cd.g.isIPv6Address))
    );

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

    debug.stopTimer(timerLabel);
    debug.logAndResetEverything();
  }
}

self.onmessage = onMessageFromWindow;
