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

  cd.debug.startTimer('worker: parse comments');
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
  cd.debug.stopTimer('worker: parse comments');

  cd.debug.startTimer('worker: parse sections');
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
  cd.debug.stopTimer('worker: parse sections');

  cd.debug.startTimer('worker: prepare comments and sections');
  cd.sections.forEach((section) => {
    section.parentTree = section.getParentTree().map((section) => section.headline);
    section.firstCommentAnchor = section.comments[0]?.anchor;
  });

  let commentDangerousKeys = [
    'cachedSection',
    'elements',
    'highlightables',
    'parent',
    'parser',
    'parts',
    'signatureElement',
  ];
  let sectionDangerousKeys = [
    'cachedParentTree',
    // 'comments' property is removed below individually.
    'commentsInFirstChunk',
    'elements',
    'headlineElement',
    'lastElementInFirstChunk',
    'parser',
  ];
  const keepSafeValues = (obj, dangerousKeys) => {
    const newObj = Object.assign({}, obj);
    Object.keys(newObj).forEach((key) => {
      if (dangerousKeys.includes(key)) {
        delete newObj[key];
      }
    });
    return newObj;
  };

  cd.sections = cd.sections.map((section) => keepSafeValues(section, sectionDangerousKeys));

  cd.comments.forEach((comment) => {
    comment.getChildren().forEach((reply) => {
      reply.parent = comment;
    });
    const section = comment.getSection();
    comment.section = section || null;
    if (comment.parent) {
      comment.parentAuthorName = comment.parent.authorName;
      comment.parentAnchor = comment.parent.anchor;
      comment.toMe = comment.parent.isOwn;
    }
    comment.elements[0].removeAttribute('id');
    comment.hiddenElementData = [];
    comment.elementHtmls = comment.elements.map((element) => {
      element.removeAttribute('data-comment-id');

      if (/^H[1-6]$/.test(element.tagName)) {
        // Keep only the headline, as other elements contain dynamic identificators.
        const headlineElement = element.getElementsByClassName('mw-headline')[0];
        if (headlineElement) {
          headlineElement.getElementsByClassName('mw-headline-number')[0]?.remove();
          element.children
            .slice()
            .reverse()
            .forEach((element) => {
              element.remove();
            });
          headlineElement.childNodes
            .slice()
            .reverse()
            .forEach((child) => {
              element.appendChild(child);
            });
        }
      }

      const elementsToHide = [
        ...element.getElementsByClassName('autonumber'),
        ...element.getElementsByClassName('reference'),
        ...element.getElementsByClassName('references'),
        ...element.getElementsByTagName('style'),
        ...element.getElementsByTagName('link'),
      ];
      elementsToHide.forEach((element) => {
        let type;
        if (element.classList.contains('reference')) {
          type = 'reference';
        } else if (element.classList.contains('references')) {
          type = 'references';
        } else if (element.classList.contains('autonumber')) {
          type = 'autonumber';
        }

        const num = comment.hiddenElementData.push({
          type,
          tagName: element.tagName,
          html: element.outerHTML,
        });
        const textNode = context.document.createTextNode(`\x01${num}_${type}\x02`);
        element.parentNode.insertBefore(textNode, element);
        element.remove();
      });

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

    comment.signatureElement.remove();
    comment.text = comment.elements.map((element) => element.textContent).join('\n');

    comment.elementTagNames = comment.elements.map((element) => element.tagName);
  });

  cd.sections.forEach((section) => {
    delete section.comments;
  });
  cd.comments = cd.comments.map((comment) => keepSafeValues(comment, commentDangerousKeys));
  cd.comments.forEach((comment, i) => {
    comment.previousComments = cd.comments
      .slice(Math.max(0, i - 2), i)
      .reverse();
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

  if (message.type.startsWith('parse')) {
    cd.debug.startTimer('worker');

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

    context.document = new Document(dom);
    cd.g.rootElement = context.document.children[0];
    cd.g.specialElements = {
      pageHasOutdents: Boolean(
        cd.g.rootElement.getElementsByClassName('outdent-template', 1).length
      ),
    };

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

onmessage = onMessageFromWindow;
