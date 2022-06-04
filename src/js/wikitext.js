/**
 * Wikitext parsing and processing utilities.
 *
 * @module wikitext
 */

import html_entity_decode from 'locutus/php/strings/html_entity_decode';

import cd from './cd';
import userRegistry from './userRegistry';
import { hideText } from './util';
import { parseTimestamp } from './timestamp';

/**
 * Generate a regular expression that searches for specified tags in the text (opening, closing, and
 * content between them).
 *
 * @param {string[]} tags
 * @returns {RegExp}
 */
export function generateTagsRegexp(tags) {
  const tagsJoined = tags.join('|');
  return new RegExp(`(<(${tagsJoined})(?: [\\w ]+(?:=[^<>]+?)?| *)>)([^]*?)(</\\2>)`, 'ig');
}

/**
 * Conceal HTML comments (`<!-- -->`), `<nowiki>`, `<syntaxhighlight>`,
 * `<source>`, and `<pre>` tags content, left-to-right and right-to-left marks, and also
 * newlines inside some tags (`<br\n>`) in the code.
 *
 * This is used to ignore comment contents (there could be section code examples for novices there
 * that could confuse search results) but get right positions and code in the result.
 *
 * @param {string} code
 * @returns {string}
 */
export function hideDistractingCode(code) {
  return code
    .replace(
      generateTagsRegexp(['nowiki', 'syntaxhighlight', 'source', 'pre']),
      (s, before, tagName, content, after) => before + ' '.repeat(content.length) + after
    )
    .replace(/<!--([^]*?)-->/g, (s, content) => '\x01' + ' '.repeat(content.length + 5) + '\x02')
    .replace(/[\u200e\u200f]/g, (s) => ' '.repeat(s.length))
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
 * Also replace multiple spaces with one and trim the input. The product of this function is usually
 * not for display (for example, it just removes template names making the resulting code look
 * silly), but for comparing purposes.
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
    .replace(cd.g.FILE_EMBED_REGEXP, '$1')

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

    // Remove opening and self-closing tags (won't work with <smth param=">">, but the native parser
    // fails too).
    .replace(/<\w+(?: [\w ]+(?:=[^<>]+?)?| *\/?)>/g, '')

    // Remove closing tags
    .replace(/<\/\w+(?: [\w ]+)? *>/g, '')

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
    .replace(/<(\w+(?: [\w ]+(?:=[^<>]+?)?| *\/?)|\/\w+(?: [\w ]+)? *)>/g, '%3C$1%3E')
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
 * @param {string} adjustedCode Adjusted page code.
 * @param {string} code Page code.
 * @returns {object[]}
 * @private
 */
function extractRegularSignatures(adjustedCode, code) {
  const ending = `(?:\\n*|$)`;
  const afterTimestamp = `(?!["»])(?:\\}\\}|</small>)?`;
  const timestampRegexp = new RegExp(
    `^((.*?)(${cd.g.CONTENT_TIMESTAMP_REGEXP.source})${afterTimestamp}).*${ending}`,
    'igm'
  );

  // After capturing the first signature with ".*?" we make another capture (with authorLinkRegexp)
  // to make sure we take the first link to the same author as the author in the last link. 251 is
  // not arbitrary: it's 255 (maximum allowed signature length) minus '[[u:a'.length plus ' '.length
  // (the space before the timestamp).
  const signatureScanLimit = 251;
  const signatureRegexp = new RegExp(
    /*
      Captures:
      1 - the whole line with the signature
      2 - text before the timestamp
      3 - text before the first user link
      4 - author name (inside cd.g.CAPTURE_USER_NAME_PATTERN)
      5 - sometimes, a slash appears here (inside cd.g.CAPTURE_USER_NAME_PATTERN)
      6 - timestamp
     */
    `^(((.*?)${cd.g.CAPTURE_USER_NAME_PATTERN}.{1,${signatureScanLimit}})(${cd.g.CONTENT_TIMESTAMP_REGEXP.source})${afterTimestamp}.*)${ending}`,
    'im'
  );
  const lastAuthorLinkRegexp = new RegExp(`^.*${cd.g.CAPTURE_USER_NAME_PATTERN}`, 'i');
  const authorLinkRegexp = new RegExp(cd.g.CAPTURE_USER_NAME_PATTERN, 'ig');

  let signatures = [];
  let timestampMatch;
  while ((timestampMatch = timestampRegexp.exec(adjustedCode))) {
    const line = timestampMatch[0];
    const lineStartIndex = timestampMatch.index;
    const authorTimestampMatch = line.match(signatureRegexp);

    let author;
    let timestamp;
    let startIndex;
    let endIndex;
    let nextCommentStartIndex;
    let dirtyCode;
    if (authorTimestampMatch) {
      // Extract the timestamp data
      const timestampStartIndex = lineStartIndex + authorTimestampMatch[2].length;
      const timestampEndIndex = timestampStartIndex + authorTimestampMatch[6].length;
      timestamp = code.slice(timestampStartIndex, timestampEndIndex);

      // Extract the signature data
      startIndex = lineStartIndex + authorTimestampMatch[3].length;
      endIndex = lineStartIndex + authorTimestampMatch[1].length;
      dirtyCode = code.slice(startIndex, endIndex);

      nextCommentStartIndex = lineStartIndex + authorTimestampMatch[0].length;

      // Find the first link to this author in the preceding text.

      let authorLinkMatch;
      authorLinkRegexp.lastIndex = 0;
      const commentEndingStartIndex = Math.max(
        0,
        timestampStartIndex - lineStartIndex - signatureScanLimit
      );
      const commentEnding = authorTimestampMatch[0].slice(commentEndingStartIndex);

      // Should always match logically.
      const [, lastAuthorLink] = commentEnding.match(lastAuthorLinkRegexp);
      author = userRegistry.get(decodeHtmlEntities(lastAuthorLink));

      // Rectify the author name if needed.
      while ((authorLinkMatch = authorLinkRegexp.exec(commentEnding))) {
        // Slash can be present in authorLinkMatch[2]. It often indicates a link to a page in the
        // author's userspace that is not part of the signature (while some such links are, and we
        // don't want to eliminate those cases).
        if (authorLinkMatch[2]) continue;

        const testAuthor = userRegistry.get(decodeHtmlEntities(authorLinkMatch[1]));
        if (testAuthor === author) {
          startIndex = lineStartIndex + commentEndingStartIndex + authorLinkMatch.index;
          dirtyCode = code.slice(startIndex, endIndex);
          break;
        }
      }
    } else {
      startIndex = lineStartIndex + timestampMatch[2].length;
      endIndex = lineStartIndex + timestampMatch[1].length;
      dirtyCode = code.slice(startIndex, endIndex);

      const timestampEndIndex = startIndex + timestampMatch[3].length;
      timestamp = code.slice(startIndex, timestampEndIndex);

      nextCommentStartIndex = lineStartIndex + timestampMatch[0].length;
    }

    signatures.push({ author, timestamp, startIndex, endIndex, dirtyCode, nextCommentStartIndex });
  }

  return signatures;
}

/**
 * Extract signatures that come from the unsigned templates from wikitext.
 *
 * @param {string} adjustedCode Adjusted page code.
 * @param {string} code Page code.
 * @param {object[]} signatures Existing signatures.
 * @returns {object[]}
 * @private
 */
function extractUnsigneds(adjustedCode, code, signatures) {
  const unsigneds = [];

  if (cd.g.UNSIGNED_TEMPLATES_REGEXP) {
    let match;
    while ((match = cd.g.UNSIGNED_TEMPLATES_REGEXP.exec(adjustedCode))) {
      let author;
      let timestamp;
      if (cd.g.CONTENT_TIMESTAMP_NO_TZ_REGEXP.test(match[2])) {
        timestamp = match[2];
        author = match[3];
      } else if (cd.g.CONTENT_TIMESTAMP_NO_TZ_REGEXP.test(match[3])) {
        timestamp = match[3];
        author = match[2];
      } else {
        author = match[2];
      }
      author = author && userRegistry.get(decodeHtmlEntities(author));

      // Append "(UTC)" to the `timestamp` of templates that allow to omit the timezone. The
      // timezone could be not UTC, but currently the timezone offset is taken from the wiki
      // configuration, so doesn't have effect.
      if (timestamp && !cd.g.CONTENT_TIMESTAMP_REGEXP.test(timestamp)) {
        timestamp += ' (UTC)';

        // Workaround for "undated" templates
        if (!author) {
          author = '<undated>';
        }
      }

      let startIndex = match.index;
      const endIndex = match.index + match[1].length;
      let dirtyCode = code.slice(startIndex, endIndex);
      const nextCommentStartIndex = match.index + match[0].length;

      // "[5 tildes] {{unsigned|...}}" cases. In these cases, both the signature and
      // {{unsigned|...}} are considered signatures and added to the array. We could combine them
      // but that would need corresponding code in Parser.js which could be tricky, so for now we
      // just remove the duplicate. That still allows to reply to the comment.
      const relevantSignatureIndex = (
        signatures.findIndex((sig) => sig.nextCommentStartIndex === nextCommentStartIndex)
      );
      if (relevantSignatureIndex !== -1) {
        signatures.splice(relevantSignatureIndex, 1);
      }

      unsigneds.push({ author, timestamp, startIndex, endIndex, dirtyCode, nextCommentStartIndex });
    }
  }

  return unsigneds;
}

/**
 * Extract signatures from wikitext.
 *
 * Only basic signature parsing is performed here; more precise signature text identification is
 * performed in {@link Comment#adjustCommentCodeData}. See also
 * {@link Comment#adjustCommentBeginning}, called before that.
 *
 * @param {string} code Code to extract signatures from.
 * @returns {object[]}
 */
export function extractSignatures(code) {
  // Hide HTML comments, quotes and lines containing antipatterns.
  const adjustedCode = hideDistractingCode(code)
    .replace(
      cd.g.QUOTE_REGEXP,
      (s, beginning, content, ending) => beginning + ' '.repeat(content.length) + ending
    )
    .replace(cd.g.COMMENT_ANTIPATTERNS_REGEXP, (s) => ' '.repeat(s.length));

  let signatures = extractRegularSignatures(adjustedCode, code);
  const unsigneds = extractUnsigneds(adjustedCode, code, signatures);
  signatures.push(...unsigneds);

  // This is for the procedure adding anchors to comments linked from the comment, see
  // CommentForm#prepareNewPageCode.
  const signatureIndex = adjustedCode.indexOf(cd.g.SIGN_CODE);
  if (signatureIndex !== -1) {
    const startIndex = signatureIndex;
    const nextCommentOffset = adjustedCode.slice(startIndex).indexOf('\n') + 1;
    signatures.push({
      author: cd.user.getName(),
      startIndex,
      nextCommentStartIndex: startIndex + nextCommentOffset,
    });
  }

  if (unsigneds.length || signatureIndex !== -1) {
    signatures.sort((sig1, sig2) => sig1.startIndex > sig2.startIndex ? 1 : -1);
  }

  signatures = signatures.filter((sig) => sig.author);
  signatures.forEach((sig, i) => {
    sig.commentStartIndex = i === 0 ? 0 : signatures[i - 1].nextCommentStartIndex;
  });
  signatures.forEach((sig, i) => {
    const { date } = sig.timestamp && parseTimestamp(sig.timestamp) || {};
    sig.id = i;
    sig.date = date;
    delete sig.nextCommentStartIndex;
  });

  return signatures;
}

/**
 * Decode HTML entities in a string.
 *
 * It should work as fast as possible, so we use
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/indexOf String#indexOf},
 * not
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/includes String#includes}.
 *
 * @param {string} string
 * @returns {string}
 */
export function decodeHtmlEntities(string) {
  if (string.indexOf('&') === -1) {
    return string;
  } else {
    let result = string;
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
 * @param {string[]} [hidden] Array with texts replaced by markers. Not required if
 *   `concealFirstMode` is `true`.
 * @param {number} [markerLength] Instead of putting markers in place of templates, fill the space
 *   that the first met template occupies with spaces, and put the specified number of marker
 *   characters at the first positions.
 * @param {Function} [handler] Function that processes the template code.
 * @returns {HideSensitiveCodeReturn}
 */
export function hideTemplatesRecursively(code, hidden, markerLength, handler) {
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
      let template = code.substring(left, right);
      if (handler) {
        template = handler(template);
      }
      const replacement = markerLength === undefined ?
        '\x01' + hidden.push(template) + '_template\x02' :
        ('\x01'.repeat(markerLength) + ' '.repeat(template.length - markerLength - 1) + '\x02');
      code = code.substring(0, left) + replacement + code.substr(right);
      pos = right - template.length;
    }
  } while (markerLength === undefined || stack.length);

  return { code, hidden };
}

/**
 * Replace code, that should not be modified when processing it, with placeholders.
 *
 * @param {string} code
 * @param {Function} [templateHandler]
 * @returns {HideSensitiveCodeReturn}
 */
export function hideSensitiveCode(code, templateHandler) {
  let hidden = [];

  const hide = (regexp, type, useGroups) => {
    code = hideText(code, regexp, hidden, type, useGroups);
  };
  const hideTags = (args, type) => {
    hide(generateTagsRegexp(args, false), type);
  };

  // Taken from
  // https://ru.wikipedia.org/w/index.php?title=MediaWiki:Gadget-wikificator.js&oldid=102530721
  const hideTemplates = () => {
    ({code, hidden} = hideTemplatesRecursively(code, hidden, undefined, templateHandler));
  };

  hideTags(['pre', 'source', 'syntaxhighlight'], 'block');
  hideTags(['gallery', 'poem'], 'gallery');
  hideTags(['nowiki'], 'inline');
  hideTemplates();
  hide(/^(:* *)(\{\|[^]*?\n\|\})/gm, 'table', true);

  return { code, hidden };
}

/**
 * Modify a string or leave it unchanged so that is has two newlines at the end of it.
 *
 * @param {string} code
 * @returns {string}
 */
export function endWithTwoNewlines(code) {
  return code.replace(/([^\n])\n?$/, '$1\n\n');
}

/**
 * Replace `<br>`s with `\n`, except in list elements and `<pre>`'s created by a space starting a
 * line.
 *
 * @param {string} code
 * @param {string} replacement
 * @returns {string}
 */
export function brsToNewlines(code, replacement = '\n') {
  return code.replace(/^(?![:*# ]).*<br[ \n]*\/?>.*$/gmi, (s) => (
    s.replace(/<br[ \n]*\/?>(?![:*#;])\n? */gi, () => replacement)
  ));
}
