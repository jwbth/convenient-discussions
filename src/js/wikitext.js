/**
 * Wikitext parsing and processing utilities.
 *
 * @module wikitext
 */

import TextMasker from './TextMasker';
import cd from './cd';
import userRegistry from './userRegistry';
import { decodeHtmlEntities, generatePageNamePattern, removeDirMarks } from './utils';
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
 * Replace HTML comments (`<!-- -->`), `<nowiki>`, `<syntaxhighlight>`, `<source>`, and `<pre>` tags
 * content, left-to-right and right-to-left marks, and also newlines inside some tags (`<br\n>`) in
 * the code with spaces.
 *
 * This is used to ignore comment contents (there could be section code examples for novices there
 * that could confuse search results) but get right positions and code in the result.
 *
 * @param {string} code
 * @returns {string}
 */
export function maskDistractingCode(code) {
  return code
    .replace(
      generateTagsRegexp(['nowiki', 'syntaxhighlight', 'source', 'pre']),
      (s, before, tagName, content, after) => before + ' '.repeat(content.length) + after
    )
    .replace(/<!--([^]*?)-->/g, (s, content) => '\x01' + ' '.repeat(content.length + 5) + '\x02')
    .replace(/[\u200e\u200f]/g, () => ' ')
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
  return extractSignatures(code)[0]?.timestamp || null;
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
  // Ideally, only text from images in the "thumb" format should be captured, because in the
  // standard format the text is not displayed. See `img_thumbnail` in
  // https://ru.wikipedia.org/w/api.php?action=query&meta=siteinfo&siprop=magicwords&formatversion=2.
  // Unfortunately, that would add like 100ms to the server's response time. So, we use it if it is
  // present in the config file.
  const fileEmbedRegexp = new RegExp(
    `\\[\\[${cd.g.filePrefixPattern}[^\\]]+?(?:\\|[^\\]]+?\\| *((?:\\[\\[[^\\]]+?\\]\\]|[^|\\]])+))? *\\]\\]`,
    'ig'
  );

  return code
    // Remove comments
    .replace(/<!--[^]*?-->/g, '')

    // Remove text hidden by the script (for example, in wikitext.maskDistractingCode)
    .replace(/\x01 *\x02/g, '')

    // Pipe trick
    .replace(cd.g.pipeTrickRegexp, '$1$2$3')

    // Extract displayed text from file embeddings
    .replace(fileEmbedRegexp, (s, m) => cd.g.isThumbRegexp.test(s) ? m : '')

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

  // Use `(?:^|[^=])` to filter out timestamps in a parameter (in quote templates)
  const timestampRegexp = new RegExp(
    `^((.*?(?:^|[^=]))(${cd.g.contentTimestampRegexp.source})${afterTimestamp}).*${ending}`,
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
      4 - author name (inside cd.g.captureUserNamePattern)
      5 - sometimes, a slash appears here (inside cd.g.captureUserNamePattern)
      6 - timestamp
     */
    (
      `^(((.*?)${cd.g.captureUserNamePattern}.{1,${signatureScanLimit - 1}}?[^=])` +
      `(${cd.g.contentTimestampRegexp.source})${afterTimestamp}.*)${ending}`
    ),
    'im'
  );
  const lastAuthorLinkRegexp = new RegExp(`^.*${cd.g.captureUserNamePattern}`, 'i');
  const authorLinkRegexp = new RegExp(cd.g.captureUserNamePattern, 'ig');

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
      timestamp = removeDirMarks(code.slice(timestampStartIndex, timestampEndIndex));

      // Extract the signature data
      startIndex = lineStartIndex + authorTimestampMatch[3].length;
      endIndex = lineStartIndex + authorTimestampMatch[1].length;
      dirtyCode = code.slice(startIndex, endIndex);

      nextCommentStartIndex = lineStartIndex + authorTimestampMatch[0].length;

      // Find the first link to this author in the preceding text.

      let authorLinkMatch;
      authorLinkRegexp.lastIndex = 0;
      const commentEndingStartIndex = Math.max(0, timestampStartIndex - lineStartIndex - 255);
      const commentEnding = authorTimestampMatch[0].slice(commentEndingStartIndex);

      const [, lastAuthorLink] = commentEnding.match(lastAuthorLinkRegexp) || [];

      // Locically it should always be non-empty. There is an unclear problem with
      // https://az.wikipedia.org/w/index.php?title=Vikipediya:Kənd_meydanı&diff=prev&oldid=7223881,
      // probably having something to do with difference between regular length and byte length.
      if (!lastAuthorLink) continue;

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
      timestamp = removeDirMarks(code.slice(startIndex, timestampEndIndex));

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
  if (!cd.config.unsignedTemplates.length) {
    return [];
  }

  const unsigneds = [];
  const unsignedTemplatesRegexp = new RegExp(cd.g.unsignedTemplatesPattern + '.*\\n', 'g');
  let match;
  while ((match = unsignedTemplatesRegexp.exec(adjustedCode))) {
    let author;
    let timestamp;
    if (cd.g.contentTimestampNoTzRegexp.test(match[2])) {
      timestamp = match[2];
      author = match[3];
    } else if (cd.g.contentTimestampNoTzRegexp.test(match[3])) {
      timestamp = match[3];
      author = match[2];
    } else {
      author = match[2];
    }
    author &&= userRegistry.get(decodeHtmlEntities(author));

    // Append "(UTC)" to the `timestamp` of templates that allow to omit the timezone. The timezone
    // could be not UTC, but currently the timezone offset is taken from the wiki configuration, so
    // doesn't have effect.
    if (timestamp && !cd.g.contentTimestampRegexp.test(timestamp)) {
      timestamp += ' (UTC)';

      // Workaround for "undated" templates
      author ||= '<undated>';
    }

    // Double spaces
    timestamp = timestamp?.replace(/ +/g, ' ');

    let startIndex = match.index;
    const endIndex = match.index + match[1].length;
    let dirtyCode = code.slice(startIndex, endIndex);
    const nextCommentStartIndex = match.index + match[0].length;

    // `[5 tildes] {{unsigned|...}}` cases. In these cases, both the signature and
    // `{{unsigned|...}}` are considered signatures and added to the array. We could combine them
    // but that would need corresponding code in Parser.js which could be tricky, so for now we just
    // remove the duplicate. That still allows to reply to the comment.
    const relevantSignatureIndex = (
      signatures.findIndex((sig) => sig.nextCommentStartIndex === nextCommentStartIndex)
    );
    if (relevantSignatureIndex !== -1) {
      signatures.splice(relevantSignatureIndex, 1);
    }

    unsigneds.push({ author, timestamp, startIndex, endIndex, dirtyCode, nextCommentStartIndex });
  }

  return unsigneds;
}

/**
 * Extract signatures from wikitext.
 *
 * Only basic signature parsing is performed here; more precise signature text identification is
 * performed in `CommentSource#adjustSignature`. See also `CommentSource#adjust`.
 *
 * @param {string} code Code to extract signatures from.
 * @returns {object[]}
 */
export function extractSignatures(code) {
  // TODO: Instead of removing only lines containing antipatterns from wikitext, hide entire
  // templates and tags?
  // But keep in mind that this code may still be part of comments.
  const noSignatureClassesPattern = cd.g.noSignatureClasses
    .concat('mw-notalk')
    .join('\\b|\\b');
  const commentAntipatternsPatternParts = [
    `class=(['"])[^'"\\n]*(?:\\b${noSignatureClassesPattern}\\b)[^'"\\n]*\\1`
  ];
  if (cd.config.noSignatureTemplates.length) {
    const pattern = cd.config.noSignatureTemplates.map(generatePageNamePattern).join('|');
    commentAntipatternsPatternParts.push(`\\{\\{ *(?:${pattern}) *(?:\\||\\}\\})`);
  }
  commentAntipatternsPatternParts.push(
    ...cd.config.commentAntipatterns.map((regexp) => regexp.source)
  );
  const commentAntipatternsPattern = commentAntipatternsPatternParts.join('|');
  const commentAntipatternsRegexp = new RegExp(`^.*(?:${commentAntipatternsPattern}).*$(?:)`, 'mg');

  // Hide HTML comments, quotes and lines containing antipatterns.
  const adjustedCode = maskDistractingCode(code)
    .replace(
      cd.g.quoteRegexp,
      (s, beginning, content, ending) => beginning + ' '.repeat(content.length) + ending
    )
    .replace(commentAntipatternsRegexp, (s) => ' '.repeat(s.length));

  let signatures = extractRegularSignatures(adjustedCode, code);
  const unsigneds = extractUnsigneds(adjustedCode, code, signatures);
  signatures.push(...unsigneds);

  // This is for the procedure adding anchors to comments linked from the comment, see
  // CommentForm#prepareNewPageCode.
  const signatureIndex = adjustedCode.indexOf(cd.g.signCode);
  if (signatureIndex !== -1) {
    signatures.push({
      author: userRegistry.getCurrent().getName(),
      startIndex: signatureIndex,
      nextCommentStartIndex: signatureIndex + adjustedCode.slice(signatureIndex).indexOf('\n') + 1,
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
    sig.index = i;
    sig.date = date;
    delete sig.nextCommentStartIndex;
  });

  return signatures;
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

/**
 * Mask links that have `|`, replace `|` with `{{!}}`, unmask links. If `maskedSensitiveCode` is not
 * provided, sensitive code will be masked as well.
 *
 * @param {string} code
 * @param {string[]} [maskedSensitiveCode]
 * @returns {string}
 */
export function escapePipesOutsideLinks(code, maskedSensitiveCode) {
  return (new TextMasker(code, maskedSensitiveCode))
    [maskedSensitiveCode ? 'valueOf' : 'maskSensitiveCode']()
    .mask(/\[\[[^\]|]+\|/g, 'link')
    .withText((text) => text.replace(/\|/g, '{{!}}'))
    .unmask('link')
    .getText();
}
