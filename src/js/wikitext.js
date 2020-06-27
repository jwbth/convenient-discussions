/**
 * Wikitext parsing and processing functions.
 *
 * @module wikitext
 */

import html_entity_decode from 'locutus/php/strings/html_entity_decode';

import cd from './cd';
import userRegistry from './userRegistry';
import {
  generateCommentAnchor,
  parseTimestamp,
  registerCommentAnchor,
  resetCommentAnchors,
} from './timestamp';

/**
 * Conceal HTML comments (`<!-- -->`) in the code.
 *
 * This is used to ignore comment contents (there could be section code examples for novices there
 * that could confuse search results) but get right positions and code in the result.
 *
 * @param {string} code
 * @returns {string}
 */
export function hideHtmlComments(code) {
  return code
    .replace(/<!--([^]*?)-->/g, (s, content) => '<!--' + ' '.repeat(content.length) + '-->');
}

/**
 * Find the first timestamp related to a comment in the code.
 *
 * @param {string} code
 * @returns {?string}
 */
export function findFirstTimestamp(code) {
  const signatures = extractSignatures(code);
  return signatures.length ? signatures[0].timestamp : null;
}

/**
 * Remove certain kinds of wiki markup from code, such as formatting, links, tags, and comments.
 * Also replace multiple spaces with one and trim the input. The product of this function is not for
 * display (for example, it just removes template names making the resulting code look silly), but
 * for comparing purposes.
 *
 * @param {string} code
 * @returns {string}
 */
export function removeWikiMarkup(code) {
  return code
    // Remove comments
    .replace(/<!--[^]*?-->/g, '')
    // Pipe trick
    .replace(/(\[\[:?(?:[^|[\]<>\n:]+:)?([^|[\]<>\n]+)\|)(\]\])/g, '$1$2$3')
    // Extract displayed text from [[wikilinks]]
    .replace(/\[\[:?(?:[^|[\]<>\n]+\|)?(.+?)\]\]/g, '$1')
    // For optimization purposes, remove template names
    .replace(/\{\{:?(?:[^|{}<>\n]+)(?:\|(.+?))?\}\}/g, '$1')
    // Extract displayed text from [links]
    .replace(/\[https?:\/\/[^[\]<>"\n ]+ *([^\]]*)\]/g, '$1')
    // Remove bold
    .replace(/'''(.+?)'''/g, '$1')
    // Remove italics
    .replace(/''(.+?)''/g, '$1')
    // Replace <br> with a space
    .replace(/<br ?\/?>/g, ' ')
    // Remove opening tags (won't work with <smth param=">">, but wikiparser fails too)
    .replace(/<\w+(?: [\w ]+?=[^<>]+?| ?\/?)>/g, '')
    // Remove closing tags
    .replace(/<\/\w+ ?>/g, '')
    // Replace multiple spaces with one space
    .replace(/ {2,}/g, ' ')
    .trim();
}

/**
 * Replace HTML entities with corresponding characters. Also replace different kinds of spaces,
 * including multiple, with one normal space. For the most part, it's a reverse of {@link
 * module:wikitext.encodeWikilink}.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeCode(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#91;/g, '[')
    .replace(/&#93;/g, ']')
    .replace(/&#123;/g, '{')
    .replace(/&#124;/g, '|')
    .replace(/&#125;/g, '}')
    .replace(/\s+/g, ' ');
}

/**
 * Encode link text to put it in a `[[wikilink]]`. For the most part, it's a reverse of {@link
 * module:wikitext.normalizeCode}.
 *
 * @param {string} link
 * @returns {string}
 */
export function encodeWikilink(link) {
  return link
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\[/g, '&#91;')
    .replace(/\]/g, '&#93;')
    .replace(/\{/g, '&#123;')
    .replace(/\|/g, '&#124;')
    .replace(/\}/g, '&#125;')
    .replace(/\s+/g, ' ');
}

/**
 * Extract signatures from wikitext.
 *
 * Only basic signature parsing is performed here; more precise signature text identification is
 * performed in {@link module:Comment#adjustCommentCodeData}. See also {@link
 * module:Comment#adjustCommentBeginning}, called before that.
 *
 * @param {string} code Code to extract signatures from.
 * @param {boolean} generateCommentAnchors Whether to generate and register comment anchors.
 * @returns {object[]}
 */
export function extractSignatures(code, generateCommentAnchors) {
  // Hide HTML comments, quotes and lines containing antipatterns.
  const adjustedCode = hideHtmlComments(code)
    .replace(cd.g.QUOTE_REGEXP, (s, beginning, content, ending) => (
      beginning + ' '.repeat(content.length) + ending
    ))
    .replace(cd.g.COMMENT_ANTIPATTERNS_REGEXP, (s) => ' '.repeat(s.length));

  const timestampRegexp = new RegExp(
    `^((.*)(${cd.g.TIMESTAMP_REGEXP.source})(?:\\}\\}|</small>)?).*(?:\n*|$)`,
    'igm'
  );

  // ".*" helps to get the last author link. But after that we make another capture to make sure we
  // take the first link to the comment author. 251 is not arbitrary: it's 255 (maximum allowed
  // signature length) minus '[[u:a'.length plus ' '.length (the space before the timestamp).
  const signatureScanLimitWikitext = 251;
  const signatureRegexp = new RegExp(
    `^((.*)(${cd.g.CAPTURE_USER_NAME_PATTERN}.{1,${signatureScanLimitWikitext}}((${cd.g.TIMESTAMP_REGEXP.source})(?:\\}\\}|</small>)?)).*)(\n*|$)`,
    'igm'
  );
  const authorLinkRegexp = new RegExp(cd.g.CAPTURE_USER_NAME_PATTERN, 'ig');

  let signatures = [];
  let timestampMatch;
  while ((timestampMatch = timestampRegexp.exec(adjustedCode))) {
    const line = timestampMatch[0];
    signatureRegexp.lastIndex = 0;
    const authorTimestampMatch = signatureRegexp.exec(line);

    let author;
    let timestamp;
    let startIndex;
    let endIndex;
    let nextCommentStartIndex;
    let dirtyCode;
    if (authorTimestampMatch) {
      author = userRegistry.getUser(decodeHtmlEntities(authorTimestampMatch[4]));
      timestamp = authorTimestampMatch[7];

      startIndex = timestampMatch.index + authorTimestampMatch[2].length;
      endIndex = timestampMatch.index + authorTimestampMatch[1].length;
      nextCommentStartIndex = timestampMatch.index + authorTimestampMatch[0].length;
      dirtyCode = authorTimestampMatch[3];
      let authorLinkMatch;
      authorLinkRegexp.lastIndex = 0;
      const commentEndingStartIndex = Math.max(
        0,
        authorTimestampMatch[0].length - authorTimestampMatch[6].length -
        authorTimestampMatch[authorTimestampMatch.length - 1].length - signatureScanLimitWikitext
      );
      const commentEnding = authorTimestampMatch[0].slice(commentEndingStartIndex);
      while ((authorLinkMatch = authorLinkRegexp.exec(commentEnding))) {
        // Slash can be present in authorLinkMatch[2]. It often indicates a link to a page in the
        // author's userspace that is not part of the signature (while some such links are, and we
        // don't want to eliminate those cases).
        if (authorLinkMatch[2]) continue;
        const testAuthor = userRegistry.getUser(decodeHtmlEntities(authorLinkMatch[1]));
        if (testAuthor === author) {
          startIndex = timestampMatch.index + commentEndingStartIndex + authorLinkMatch.index;
          dirtyCode = code.slice(startIndex, endIndex);
          break;
        }
      }
    } else {
      timestamp = timestampMatch[3];

      startIndex = timestampMatch.index + timestampMatch[2].length;
      endIndex = timestampMatch.index + timestampMatch[1].length;
      nextCommentStartIndex = timestampMatch.index + timestampMatch[0].length;
      dirtyCode = timestamp;
    }

    signatures.push({
      author,
      timestamp,
      startIndex,
      endIndex,
      dirtyCode,
      nextCommentStartIndex,
    });
  }

  if (cd.g.UNSIGNED_TEMPLATES_REGEXP) {
    let match;
    while ((match = cd.g.UNSIGNED_TEMPLATES_REGEXP.exec(adjustedCode))) {
      let author;
      let timestamp;
      if (cd.g.TIMESTAMP_REGEXP_NO_TIMEZONE.test(match[2])) {
        timestamp = match[2];
        author = match[3];
      } else if (cd.g.TIMESTAMP_REGEXP_NO_TIMEZONE.test(match[3])) {
        timestamp = match[3];
        author = match[2];
      } else {
        author = match[2];
      }
      author = userRegistry.getUser(decodeHtmlEntities(author));
      signatures.push({
        author,
        timestamp,
        startIndex: match.index,
        endIndex: match.index + match[1].length,
        dirtyCode: match[1],
        nextCommentStartIndex: match.index + match[0].length,
      });
    }

    signatures.sort((sig1, sig2) => sig1.startIndex > sig2.startIndex ? 1 : -1);
  }

  signatures.forEach((sig, i) => {
    sig.commentStartIndex = i === 0 ? 0 : signatures[i - 1].nextCommentStartIndex;
  });
  signatures = signatures.filter((sig) => sig.author);
  if (generateCommentAnchors) {
    resetCommentAnchors();
  }
  signatures.forEach((sig, i) => {
    const { date } = sig.timestamp ? (parseTimestamp(sig.timestamp) || {}) : {};
    sig.id = i;
    sig.date = date;
    delete sig.nextCommentStartIndex;

    if (generateCommentAnchors) {
      const anchor = date ? generateCommentAnchor(date, sig.author.name, true) : undefined;
      sig.anchor = anchor;
      registerCommentAnchor(anchor);
    }
  });

  return signatures;
}

/**
 * Decode HTML entities in a string.
 *
 * @param {string} s
 * @returns {string}
 */
export function decodeHtmlEntities(s) {
  if (s.indexOf('&') === -1) {
    return s;
  } else {
    let result = s;
    if (result.indexOf('&#38;amp;') !== -1) {
      result = result.replace(/&#38;amp;/g, '&amp;amp;')
    }
    result = result.indexOf('&#') === -1 ?
      result :
      result.replace(/&#(\d+);/g, (s, code) => String.fromCharCode(code));
    return result.indexOf('&') === -1 ? result : html_entity_decode(result);
  }
}

/**
 * @typedef {object} HideSensitiveCodeReturn
 * @property {string} code
 * @property {string[]} hidden
 */

/**
 * Replace code that should not be modified when processing it with placeholders.
 *
 * @param {string} code
 * @returns {HideSensitiveCodeReturn}
 */
export function hideSensitiveCode(code) {
  const hidden = [];

  const hide = (regexp, isTable) => {
    code = code.replace(regexp, (s, pre, textToHide) => {
      // If there is no groups, the offset is the second argument.
      if (typeof pre === 'number') {
        pre = '';
        textToHide = '';
      }
      // Handle tables separately
      return (
        (pre || '') + (isTable ? '\x03' : '\x01') + hidden.push(textToHide || s) +
        (isTable ? '\x04' : '\x02')
      );
    });
  };

  // Taken from
  // https://ru.wikipedia.org/w/index.php?title=MediaWiki:Gadget-wikificator.js&oldid=102530721
  const hideTemplates = () => {
    // Simple function for hiding templates that have no nested ones.
    hide(/\{\{(?:[^{]\{?)+?\}\}/g);

    let pos = 0;
    const stack = [];
    let template;
    let left;
    let right;
    while (true) {
      left = code.indexOf('{{', pos);
      right = code.indexOf('}}', pos);
      if (left === -1 && right === -1 && !stack.length) {
        break;
      }
      if (left !== -1 && (left < right || right === -1)) {
        stack.push(left);
        pos = left + 2;
      } else {
        left = stack.pop();
        if (typeof left === 'undefined') {
          if (right === -1) {
            pos += 2;
            continue;
          } else {
            left = 0;
          }
        }
        if (right === -1) {
          right = code.length;
        }
        right += 2;
        template = code.substring(left, right);
        code = (
          code.substring(0, left) +
          '\x01' + hidden.push(template) + '\x02' +
          code.substr(right)
        );
        pos = right - template.length;
      }
    }
  };

  const hideTags = (...args) => {
    args.forEach((arg) => {
      hide(new RegExp(`<${arg}(?: [^>]+)?>[\\s\\S]+?<\\/${arg}>`, 'gi'));
    });
  };

  hideTemplates();

  // Hide tables
  hide(/^(:* *)(\{\|[^]*?\n\|\})/gm, true);

  hideTags('nowiki', 'pre', 'source', 'syntaxhighlight');

  return { code, hidden };
}

/**
 * Replace placeholders created by {@link module:wikitext.hideSensitiveCode}.
 *
 * @param {string} code
 * @param {string[]} hidden
 * @returns {string}
 */
export function unhideSensitiveCode(code, hidden) {
  while (code.match(/(?:\x01|\x03)\d+(?:\x02|\x04)/)) {
    code = code.replace(/(?:\x01|\x03)(\d+)(?:\x02|\x04)/g, (s, num) => hidden[num - 1]);
  }

  return code;
}
