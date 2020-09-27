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
import { hideText } from './util';

/**
 * Conceal HTML comments (`<!-- -->`), left-to-right and right-to-left marks, and also newlines
 * inside some tags (<br\n>) in the code.
 *
 * This is used to ignore comment contents (there could be section code examples for novices there
 * that could confuse search results) but get right positions and code in the result.
 *
 * @param {string} code
 * @returns {string}
 */
export function hideDistractingCode(code) {
  return code
    .replace(/<!--([^]*?)-->/g, (s, content) => '\x01' + ' '.repeat(content.length + 5) + '\x02')
    .replace(/[\u200E\u200F]/g, (s) => ' '.repeat(s.length))
    .replace(
      /(<\/?(?:br|p)\b.*)(\n+)(>)/g,
      (s, before, newline, after) => before + ' '.repeat(newline.length) + after
    );
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
    // Remove text hidden by the script (for example, in wikitext.hideDistractingCode)
    .replace(/\x01 *\x02/g, '')
    // Pipe trick
    .replace(/(\[\[:?(?:[^|[\]<>\n:]+:)?([^|[\]<>\n]+)\|)(\]\])/g, '$1$2$3')
    // Extract displayed text from file embeddings
    .replace(cd.g.FILE_LINK_REGEXP, '$1')
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
    // Remove opening tags (won't work with <smth param=">">, but wikiparser fails too). This
    // includes tags containing spaces, like <math chem>.
    .replace(/<\w+(?: [\w ]+(?:=[^<>]+?)?| ?\/?)>/g, '')
    // Remove closing tags
    .replace(/<\/\w+(?: \w+)? ?>/g, '')
    // Replace multiple spaces with one space
    .replace(/ {2,}/g, ' ')
    .trim();
}

/**
 * Replace HTML entities with corresponding characters. Also replace different kinds of spaces,
 * including multiple, with one normal space.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeCode(text) {
  return decodeHtmlEntities(text).replace(/\s+/g, ' ').trim();
}

/**
 * Encode text to put it in a `[[wikilink]]`. This is meant for section links as the characters that
 * this function encodes are forbidden in page titles anyway, so page titles containing them are not
 * valid titles.
 *
 * @param {string} link
 * @returns {string}
 */
export function encodeWikilink(link) {
  return link
    // Tags
    .replace(/<(\w+(?: [\w ]+(?:=[^<>]+?)?| ?\/?)|\/\w+(?: \w+)? ?)>/g, '%3C$1%3E')
    .replace(/\[/g, '%5B')
    .replace(/\]/g, '%5D')
    .replace(/\{/g, '%7B')
    .replace(/\|/g, '%7C')
    .replace(/\}/g, '%7D')
    .replace(/\s+/g, ' ');
}

/**
 * Extract signatures that don't come from the unsigned templates from wikitext.
 *
 * @param {string} code
 * @returns {object[]}
 * @private
 */
function extractRegularSignatures(code) {
  const timestampRegexp = new RegExp(
    `^((.*)(${cd.g.TIMESTAMP_REGEXP.source})(?:\\}\\}|</small>)?).*(?:\n*|$)`,
    'igm'
  );

  // ".*" helps to get the last author link. But after that we make another capture to make sure we
  // take the first link to the comment author. 251 is not arbitrary: it's 255 (maximum allowed
  // signature length) minus '[[u:a'.length plus ' '.length (the space before the timestamp).
  const signatureScanLimitWikitext = 251;
  const signatureRegexp = new RegExp(
    /*
      Captures:
      1 - the whole line with the signature
      2 - text before the last user link
      3 - unprocessed signature
      4 - author name (inside cd.g.CAPTURE_USER_NAME_PATTERN)
      5 - sometimes, a slash appears here (inside cd.g.CAPTURE_USER_NAME_PATTERN)
      6 - timestamp + small template ending characters / ending small tag
      7 - timestamp
      8 - new line characters or empty string
     */
    `^((.*)(${cd.g.CAPTURE_USER_NAME_PATTERN}.{1,${signatureScanLimitWikitext}}((${cd.g.TIMESTAMP_REGEXP.source})(?:\\}\\}|</small>)?)).*)(\n*|$)`,
    'igm'
  );
  const authorLinkRegexp = new RegExp(cd.g.CAPTURE_USER_NAME_PATTERN, 'ig');

  let signatures = [];
  let timestampMatch;
  while ((timestampMatch = timestampRegexp.exec(code))) {
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

      // Find the first link to this author in the preceding text.
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

    signatures.push({ author, timestamp, startIndex, endIndex, dirtyCode, nextCommentStartIndex });
  }

  return signatures;
}

/**
 * Extract signatures that come from the unsigned templates from wikitext.
 *
 * @param {string} code Page code.
 * @param {object[]} signatures Existing signatures.
 * @returns {object[]}
 * @private
 */
function extractUnsigneds(code, signatures) {
  const unsigneds = [];

  if (cd.g.UNSIGNED_TEMPLATES_REGEXP) {
    let match;
    while ((match = cd.g.UNSIGNED_TEMPLATES_REGEXP.exec(code))) {
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
      author = author && userRegistry.getUser(decodeHtmlEntities(author));

      // Append "(UTC)" to the `timestamp` of templates that allow to omit the timezone. The
      // timezone could be not UTC, but currently the timezone offset is taken from the wiki
      // configuration, so doesn't have effect.
      if (timestamp && !cd.g.TIMESTAMP_REGEXP.test(timestamp)) {
        timestamp += ' (UTC)';

        // Workaround for "undated" templates
        if (!author) {
          author = '<undated>';
        }
      }

      let startIndex = match.index;
      const endIndex = match.index + match[1].length;
      let dirtyCode = match[1];
      const nextCommentStartIndex = match.index + match[0].length;

      // "[5 tildes] {{unsigned|}}" cases. In these cases, both the signature and {{unsigned|}} are
      // considered signatures and added to the array. We could combine them but that would need
      // corresponding code in Parser.js which could be tricky, so for now we just remove the
      // duplicate. That still allows to reply to the comment.
      const relevantSignatureIndex = (
        signatures.findIndex((sig) => sig.nextCommentStartIndex === nextCommentStartIndex)
      );
      if (relevantSignatureIndex !== -1) {
        signatures.splice(relevantSignatureIndex, 1);
      }

      unsigneds.push({
        author,
        timestamp,
        startIndex,
        endIndex,
        dirtyCode,
        nextCommentStartIndex,
      });
    }
  }

  return unsigneds;
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
  const adjustedCode = hideDistractingCode(code)
    .replace(
      cd.g.QUOTE_REGEXP,
      (s, beginning, content, ending) => beginning + ' '.repeat(content.length) + ending
    )
    .replace(cd.g.COMMENT_ANTIPATTERNS_REGEXP, (s) => ' '.repeat(s.length));

  let signatures = extractRegularSignatures(adjustedCode);
  const unsigneds = extractUnsigneds(adjustedCode, signatures);
  signatures.push(...unsigneds);

  if (unsigneds.length) {
    signatures.sort((sig1, sig2) => sig1.startIndex > sig2.startIndex ? 1 : -1);
  }

  signatures = signatures.filter((sig) => sig.author);
  signatures.forEach((sig, i) => {
    sig.commentStartIndex = i === 0 ? 0 : signatures[i - 1].nextCommentStartIndex;
  });
  if (generateCommentAnchors) {
    resetCommentAnchors();
  }
  signatures.forEach((sig, i) => {
    const { date } = sig.timestamp && parseTimestamp(sig.timestamp) || {};
    sig.id = i;
    sig.date = date;
    delete sig.nextCommentStartIndex;

    if (generateCommentAnchors) {
      const anchor = date && generateCommentAnchor(date, sig.author.name, true);
      sig.anchor = anchor;
      registerCommentAnchor(anchor);
    }
  });

  return signatures;
}

/**
 * Decode HTML entities in a string.
 *
 * It should work as fast as possible, so we use String#indexOf, not String#includes.
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
    if (result.indexOf('&#') !== -1) {
      result = result.replace(/&#(\d+);/g, (s, code) => String.fromCharCode(code));
    }
    if (result.indexOf('&') !== -1) {
      result = html_entity_decode(result);
    }
    return result;
  }
}

/**
 * @typedef {object} HideSensitiveCodeReturn
 * @property {string} code
 * @property {string[]} hidden
 */

/**
 * Hide templates taking into account nested ones.
 *
 * @param {string} code
 * @param {Array} [hidden] Array with texts replaced by markers. Not required if `concealFirstMode`
 *   is `true`.
 * @param {boolean} [concealFirstMarkerLength] Instead of putting markers in place of templates,
 *   fill the space that the first met template occupies with spaces, and put the specified number
 *   of marker characters at the first positions.
 * @returns {HideSensitiveCodeReturn}
 */
export function hideTemplatesRecursively(code, hidden, concealFirstMarkerLength) {
  let pos = 0;
  const stack = [];
  do {
    let left = code.indexOf('{{', pos);
    let right = code.indexOf('}}', pos);
    if (left === -1 && right === -1 && !stack.length) break;
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
      const template = code.substring(left, right);
      const replacement = concealFirstMarkerLength === undefined ?
        '\x01' + hidden.push(template) + '\x02' :
        (
          '\x01'.repeat(concealFirstMarkerLength) +
          ' '.repeat(template.length - concealFirstMarkerLength - 1) +
          '\x02'
        );
      code = code.substring(0, left) + replacement + code.substr(right);
      pos = right - template.length;
    }
  } while (concealFirstMarkerLength === undefined || stack.length);

  return { code, hidden };
}

/**
 * Replace code that should not be modified when processing it with placeholders.
 *
 * @param {string} code
 * @returns {HideSensitiveCodeReturn}
 */
export function hideSensitiveCode(code) {
  let hidden = [];

  const hide = (regexp, isTable) => {
    code = hideText(code, regexp, hidden, isTable);
  };

  // Taken from
  // https://ru.wikipedia.org/w/index.php?title=MediaWiki:Gadget-wikificator.js&oldid=102530721
  const hideTemplates = () => {
    // Simple regexp for hiding templates that have no nested ones.
    hide(/\{\{(?:[^{]\{?)+?\}\}/g);
    ({code, hidden} = hideTemplatesRecursively(code, hidden));
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
 * Modify or leave unchanged the string to have two newlines in the end of it.
 *
 * @param {string} code
 * @returns {string}
 */
export function endWithTwoNewlines(code) {
  return code.replace(/([^\n])\n?$/, '$1\n\n');
}
