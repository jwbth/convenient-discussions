import CdError from './CdError';
import TextMasker from './TextMasker';
import cd from './cd';
import settings from './settings';
import { calculateWordOverlap, countOccurrences, definedAndNotNull, generatePageNamePattern } from './utils-general';
import { brsToNewlines, extractSignatures, maskDistractingCode, normalizeCode, removeWikiMarkup } from './utils-wikitext';

/**
 * Class that keeps the methods and data related to a comment's source code. Also used for comment
 * source match candidates before a single match is chosen among them.
 */
class CommentSource {
  /** @type {number} */
  lineStartIndex;

  /** @type {string} */
  originalIndentation;

  /** @type {string} */
  indentation;

  /** @type {string} */
  replyIndentation;

  /**
   * Create a comment's source object.
   *
   * @param {import('./Comment').default} comment Comment.
   * @param {import('./utils-wikitext').SignatureInWikitext} signature Data about the source code of
   *   the signature.
   * @param {string} contextCode Wikitext used as a reference point for the indexes.
   * @param {boolean} isInSectionContext Is the source code of the section (not page) used.
   */
  constructor(comment, signature, contextCode, isInSectionContext) {
    this.comment = comment;
    this.index = signature.index;
    this.author = signature.author;
    this.timestamp = signature.timestamp;
    this.date = signature.date;
    this.signatureDirtyCode = signature.dirtyCode;
    this.startIndex = signature.commentStartIndex;
    this.endIndex = signature.startIndex;
    this.signatureEndIndex = signature.startIndex + signature.dirtyCode.length;
    this.code = contextCode.slice(signature.commentStartIndex, signature.startIndex);
    this.isInSectionContext = isInSectionContext;

    this.adjust();
  }

  /**
   * While locating the comment in the source code, adjust the data related to the comment's source
   * code.
   *
   * @private
   */
  adjust() {
    this.lineStartIndex = this.startIndex;

    // Ignore heading markup inside <nowiki>, <syntaxhighlight>, etc.
    this.code = (new TextMasker(this.code))
      .maskSensitiveCode()
      .withText((text, textMasker) => {
        this.headingMatch = text.match(/(^[^]*(?:^|\n))((=+)(.*)\3[ \t\x01\x02]*\n)/);
        this.headingMatch?.forEach((group, i) => {
          /** @type {RegExpMatchArray} */ (this.headingMatch)[i] = textMasker.unmaskText(group);
        });
        return text;
      })
      .unmask()
      .getText();
    this.originalIndentation = '';
    this.indentation = '';

    this.excludeBadBeginnings();
    this.excludeIndentationAndIntro();
    this.adjustSignature();
    this.adjustIndentation();
  }

  /**
   * While {@link CommentSource#adjust adjusting the comment's source code data}, exclude the
   * heading code and/or some known "bad beginnings" (such as badly signed comments and code
   * captured by {@link convenientDiscussions.g.badCommentBeginnings}).
   *
   * @private
   */
  excludeBadBeginnings() {
    if (this.headingMatch) {
      this.headingCode = this.headingMatch[2];
      this.headingStartIndex = this.startIndex + this.headingMatch[1].length;
      this.headingLevel = this.headingMatch[3].length;
      this.headlineCode = this.headingMatch[4].trim();
      this.startIndex += this.headingMatch[0].length;
      this.code = this.code.slice(this.headingMatch[0].length);

      // Try to edit the first comment at
      // https://ru.wikipedia.org/wiki/Википедия:Голосования/Отметки_статусных_статей_в_навигационных_шаблонах#Да
      // to see the bug happening if we don't check for this.comment.isOpeningSection.
      this.lineStartIndex = this.comment.isOpeningSection ?
        this.headingStartIndex :
        this.startIndex;
    } else {
      // Dirty workaround to tell if there are foreign timestamps inside the comment.
      const areThereForeignTimestamps = this.comment.elements.some((el) => {
        const timestamp = el.querySelector('.cd-timestamp');
        return timestamp && !timestamp.closest('.cd-signature');
      });

      // Exclude the text of the previous comment that is ended with 3 or 5 tildes instead of 4 and
      // foreign timestamps. The foreign timestamp part can be moved out of the !headingMatch
      // condition together with cd.g.badCommentBeginnings check to allow to apply to cases like
      // https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#Start_of_section,_comment_with_timestamp_but_without_author,_newline_inside_comment,_HTML_comments_before_reply,
      // but this can create problems with removing stuff from the opening comment.
      [cd.g.signatureEndingRegexp, areThereForeignTimestamps ? null : cd.g.timezoneRegexp]
        .filter(definedAndNotNull)
        .forEach((originalRegexp) => {
          const regexp = new RegExp(originalRegexp.source + '$', 'm');
          const linesRegexp = /^(.+)\n/gm;
          let lineMatch;
          let indent;
          while ((lineMatch = linesRegexp.exec(this.code))) {
            const line = lineMatch[1].replace(/\[\[:?(?:[^|[\]<>\n]+\|)?(.+?)\]\]/g, '$1');
            if (regexp.test(line)) {
              const testIndent = lineMatch.index + lineMatch[0].length;
              if (testIndent === this.code.length) {
                break;
              } else {
                indent = testIndent;
              }
            }
          }
          if (indent) {
            this.code = this.code.slice(indent);
            this.startIndex += indent;
            this.lineStartIndex += indent;
          }
        });

      // This should be before the `this.comment.level > 0` block to account for cases like
      // https://ru.wikipedia.org/w/index.php?oldid=110033693&section=6&action=edit (the regexp
      // doesn't catch the comment because of a newline inside the `syntaxhighlight` element).
      cd.g.badCommentBeginnings.forEach((regexp) => {
        if (regexp.source[0] !== '^') {
          console.debug('Regexps in cd.config.badCommentBeginnings should have "^" as the first character.');
        }
        let match;
        while ((match = this.code.match(regexp))) {
          this.code = this.code.slice(match[0].length);
          this.lineStartIndex = this.startIndex + match[0].lastIndexOf('\n') + 1;
          this.startIndex += match[0].length;
        }
      });
    }
  }

  /**
   * While {@link CommentSource#adjust adjusting the comment's source code data}, exclude the
   * indentation characters and any foreign code (such as section intro) before them from the
   * comment's coude code. Comments at the zero level sometimes start with `:` that is used to
   * indent some side note. It shouldn't be considered an indentation character.
   *
   * @private
   */
  excludeIndentationAndIntro() {
    if (this.comment.level === 0) return;

    const replaceIndentation = (s, before, chars, after = '') => {
      if (typeof after === 'number') {
        after = '';
      }
      let remainder = '';
      let adjustedChars = chars;
      let startIndexShift = s.length;

      // We could just throw an error here, but instead will try to fix the markup.
      if (
        !before &&
        countOccurrences(this.code, /(^|\n)[:*#]/g) >= 2 &&
        adjustedChars.endsWith('#')
      ) {
        adjustedChars = adjustedChars.slice(0, -1);
        this.originalIndentation = adjustedChars;

        /*
          We can have this structure:
            : Comment. [signature]
            :# Item 1.
            :# Item 2.
            :: End of the comment. [signature]

          And we can have this:
            : Comment. [signature]
            ::# Item 1.
            ::# Item 2.
            :: End of the comment. [signature]

          The first is incorrect, and we need to add additional indentation in that case. Examples:
          https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#c-Example-2020-05-16T09:10:00.000Z-Example-2020-05-16T09:00:00.000Z
          https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#c-Example-2020-05-16T09:20:00.000Z-Example-2020-05-16T09:10:00.000Z
          But make sure replying to
          https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases#No_intro_text,_empty_line_before_the_first_vote
          works correctly.
          */
        if (adjustedChars.length < this.comment.level) {
          adjustedChars += ':';
        }
        startIndexShift -= 1 + after.length;

        remainder = '#' + after;
      } else {
        this.originalIndentation = chars;
      }

      this.indentation = adjustedChars;
      this.lineStartIndex = this.startIndex + before.length;
      this.startIndex += startIndexShift;
      this.indentationSpacing = after;
      return remainder;
    };

    const indentationPattern = `\\n*${cd.config.indentationCharsPattern}`;

    this.code = this.code.replace(new RegExp(`^()${indentationPattern}`), replaceIndentation);

    // See the comment "Without treatment of such cases, the section introduction..." in
    // CommentSkeleton.js. Dangerous case: the first section at
    // https://ru.wikipedia.org/w/index.php?oldid=105936825&action=edit. This was actually a mistake
    // to put a signature at the first level, but if it was legit, only the last sentence should
    // have been interpreted as the comment.
    if (this.indentation === '') {
      this.code = this.code.replace(
        new RegExp(`(^[^]*?\\n)${indentationPattern}(?![^]*\\n[^:*#])`),
        replaceIndentation
      );
    }

    // Workaround to remove code of a preceding comment or intro with no proper signature
    if (this.indentation.length < this.comment.level && countOccurrences(this.code, /\n/g)) {
      this.code = this.code.replace(
        new RegExp(`^([^]+?\\n)([:*#]{${this.comment.level}})( *)`),
        replaceIndentation
      );
    }
  }

  /**
   * While {@link CommentSource#adjust adjusting the comment's source code data}, adjust the
   * signature code.
   *
   * @private
   */
  adjustSignature() {
    const movePartToSignature = (s) => {
      this.signatureDirtyCode = s + this.signatureDirtyCode;
      this.endIndex -= s.length;

      return '';
    };
    const movePartsToSignature = (regexps) => {
      regexps.forEach((regexp) => {
        this.code = this.code.replace(regexp, movePartToSignature);
      });
    };
    const tagRegexp = new RegExp(`(<${cd.g.piePattern}(?: [\\w ]+?=[^<>]+?)?> *)+$`, 'i');

    // Why signaturePrefixRegexp three times? Well, the test case here is the MusikAnimal's
    // signature here: https://en.wikipedia.org/w/index.php?diff=next&oldid=946899148.
    movePartsToSignature([
      this.comment.isOwn ? cd.g.userSignaturePrefixRegexp : undefined,
      /'+$/,
      cd.config.signaturePrefixRegexp,
      tagRegexp,
      cd.config.signaturePrefixRegexp,
      tagRegexp,
      /\s+'+$/,  // https://en.wikipedia.org/wiki/Wikipedia:Village_pump_(technical)#c-Acroterion-20240423134900-History_indexing
      new RegExp(`<small class="${cd.config.unsignedClass}">.*$`),
      /<!-- *Template:Unsigned.*$/,
      cd.config.signaturePrefixRegexp,
    ].filter(definedAndNotNull));

    // Exclude <small></small> and template wrappers from the strings
    const smallWrappers = [{
      start: /^<small>/,
      end: /<\/small>[ \xa0\t]*$/,
    }];
    if (cd.config.smallDivTemplates.length) {
      smallWrappers.push({
        start: new RegExp(
          `^(?:\\{\\{(${cd.config.smallDivTemplates.join('|')})\\|(?: *1 *= *|(?![^{]*=)))`,
          'i'
        ),
        end: /\}\}[ \xa0\t]*$/,
      });
    }

    this.signatureCode = this.signatureDirtyCode;
    this.inSmallFont = false;
    smallWrappers.some((wrapper) => {
      if (wrapper.start.test(this.code) && wrapper.end.test(this.signatureCode)) {
        this.inSmallFont = true;
        this.code = this.code.replace(wrapper.start, '');
        this.signatureCode = this.signatureCode.replace(wrapper.end, '');
        return true;
      }
    });
  }

  /**
   * While {@link CommentSource#adjust adjusting the comment's source code data}, adjust the
   * indentation characters.
   *
   * @private
   */
  adjustIndentation() {
    // If the comment contains different indentation character sets for different lines, then use
    // different sets depending on the mode (edit/reply).
    let replyIndentation = this.indentation;
    if (!this.comment.isOpeningSection) {
      // If the last line ends with `#`, it's probably a numbered list _inside_ the comment, not two
      // comments in one, so we exclude such cases. The signature code is used because it may start
      // with a newline.
      const match = (this.code + this.signatureDirtyCode).match(/\n([:*#]*[:*])(?!:*#).*$/);
      if (match) {
        replyIndentation = match[1];

        // Cases where indentation characters on the first line don't denote a comment level but
        // serve some other purposes. Examples: https://en.wikipedia.org/?diff=998431486,
        // https://ru.wikipedia.org/w/index.php?diff=105978713 (this one is actually handled by
        // replaceIndentation() in .excludeIndentationAndIntro()).
        if (replyIndentation.length < this.originalIndentation.length) {
          const prefix = (
            this.originalIndentation.slice(replyIndentation.length) +
            this.indentationSpacing
          );
          this.code = prefix + this.code;
          this.indentation = this.originalIndentation = this.originalIndentation
            .slice(0, replyIndentation.length);
          this.startIndex -= prefix.length;
        }
      }
    }
    replyIndentation += cd.config.defaultIndentationChar;
    this.replyIndentation = replyIndentation;
  }

  /**
   * @typedef {object} CommentData
   * @property {number} index
   * @property {import('./updateChecker').CommentWorkerMatched[]|import('./Comment').default[]} previousComments
   * @property {boolean} followsHeading
   * @property {string} [sectionHeadline]
   * @property {string} commentText
   */

  /**
   * _For internal use._ Calculate and set a score for the match.
   *
   * @param {CommentData} commentData Data about the comment.
   * @param {CommentSource[]} sources List of all matches.
   * @param {import('./utils-wikitext').SignatureInWikitext[]} signatures List of signatures
   *   extracted from wikitext.
   * @returns {{
   *   source: CommentSource,
   *   score: number,
   * }}
   */
  calculateMatchScore(commentData, sources, signatures) {
    const doesIndexMatch = commentData.index === this.index;
    let doesPreviousCommentsDataMatch = false;
    let isPreviousCommentsDataEqual;
    let doesHeadlineMatch;
    if (commentData.previousComments.length) {
      for (let i = 0; i < commentData.previousComments.length; i++) {
        const signature = signatures[this.index - 1 - i];
        if (!signature) break;

        // At least one coincided comment is enough if the second is unavailable.
        doesPreviousCommentsDataMatch = (
          signature.timestamp === commentData.previousComments[i].timestamp &&

          // Previous comment object may come from the worker, where it has only the authorName
          // property.
          signature.author.getName() === commentData.previousComments[i].authorName
        );

        // Many consecutive comments with the same author and timestamp.
        if (isPreviousCommentsDataEqual !== false) {
          isPreviousCommentsDataEqual = (
            this.timestamp === signature.timestamp &&
            this.author === signature.author
          );
        }
        if (!doesPreviousCommentsDataMatch) break;
      }
    } else {
      // If there is no previous comment both on the page and in the code, it's a match.
      doesPreviousCommentsDataMatch = this.index === 0;
    }

    isPreviousCommentsDataEqual = Boolean(isPreviousCommentsDataEqual);
    if (commentData.sectionHeadline !== undefined) {
      doesHeadlineMatch = this.headlineCode !== undefined ?
        (
          normalizeCode(removeWikiMarkup(this.headlineCode)) ===
          normalizeCode(commentData.sectionHeadline)
        ) :
        -0.4999;
    } else {
      doesHeadlineMatch = !this.headingMatch;
    }

    const wordOverlap = calculateWordOverlap(commentData.commentText, removeWikiMarkup(this.code));
    return {
      source: this,
      score: (
        // This condition _must_ be true.
        Number(
          sources.length === 1 ||
          wordOverlap > 0.5 ||

          // There are always problems with first comments as there are no previous comments to
          // compare the signatures of and it's harder to tell the match, so we use a bit ugly
          // solution here, although it should be quite reliable: the comment's firstness, matching
          // author, date, and headline. A false negative will take place when the comment is no
          // longer first. Another option is to look for next comments, not for previous.
          (commentData.index === 0 && doesPreviousCommentsDataMatch && doesHeadlineMatch) ||

          // The reserve method, if for some reason the text is not overlapping: by this and
          // previous two dates and authors. If all dates and authors are the same, that shouldn't
          // count (see [[Википедия:К удалению/22 сентября 2020#202009221158_Facenapalm_17]]).
          (commentData.index !== 0 && doesPreviousCommentsDataMatch && !isPreviousCommentsDataEqual)
        ) * 2 +

        wordOverlap +
        Number(doesHeadlineMatch) * 1 +
        Number(doesPreviousCommentsDataMatch) * 0.5 +
        Number(doesIndexMatch) * 0.0001
      ),
    };
  }

  /**
   * Convert the comment's source code to code to set as a value of an input (practically, to the
   * {@link CommentForm#commentInput comment form's input}).
   *
   * @returns {string}
   */
  toInput() {
    const originalIndentationLength = this.originalIndentation.length;
    let code = new TextMasker(this.code)
      .maskSensitiveCode()
      .withText((code) => {
        if (this.comment.level === 0) {
          // Collapse random line breaks that do not affect text rendering but would otherwise
          // transform into <br> on posting. \x01 and \x02 mean the beginning and ending of
          // sensitive code except for tables. \x03 and \x04 mean the beginning and ending of a
          // table. Note: This should be kept coordinated with the reverse transformation code in
          // CommentForm#inputToCode. Some more comments are there.
          const entireLineRegexp = /^(?:\x01\d+_(block|template)\x02) *$/;

          const fileRegexp = new RegExp(`^\\[\\[${cd.g.filePrefixPattern}.+\\]\\]$`, 'i');
          const currentLineEndingRegexp = new RegExp(
            `(?:<${cd.g.pniePattern}(?: [\\w ]+?=[^<>]+?| ?\\/?)>|<\\/${cd.g.pniePattern}>|\\x04) *$`,
            'i'
          );
          const nextLineBeginningRegexp = new RegExp(
            `^(?:<\\/${cd.g.pniePattern}>|<${cd.g.pniePattern}|\\||!)`,
            'i'
          );
          const entireLineFromStartRegexp = /^(=+).*\1[ \t]*$|^----/;
          code = code.replace(
            /^((?![:*#; ]).+)\n(?![\n:*#; \x03])(?=(.*))/gm,
            (s, currentLine, nextLine) => {
              const newlineOrSpace = (
                entireLineRegexp.test(currentLine) ||
                entireLineRegexp.test(nextLine) ||
                fileRegexp.test(currentLine) ||
                fileRegexp.test(nextLine) ||
                entireLineFromStartRegexp.test(currentLine) ||
                entireLineFromStartRegexp.test(nextLine) ||
                currentLineEndingRegexp.test(currentLine) ||
                nextLineBeginningRegexp.test(nextLine)
              ) ?
                '\n' :
                ' ';
              return currentLine + newlineOrSpace;
            }
          );
        }

        code = brsToNewlines(code, '\x01\n')
          // Templates occupying a whole line with <br> at the end get a special treatment.
          .replace(/^((?:\x01\d+_template.*\x02) *)\x01$/gm, (s, m1) => m1 + '<br>')

          // Two templates in a row is likely a paragraph template + other template. This is a
          // workaround; may need to look specifically for paragraph templates and mark them as
          // such.
          .replace(
            /((?:\x01\d+_template.*\x02){2} *)\x01/g,
            (s, m1) => cd.config.paragraphTemplates.length ? m1 + '<br>' : s
          )

          // Replace the temporary marker.
          .replace(/\x01\n/g, '\n')

          // Remove indentation characters
          .replace(/\n([:*#]*)([ \t]*)/g, (s, chars, spacing) => {
            let newChars;
            if (chars.length >= originalIndentationLength) {
              newChars = chars.slice(originalIndentationLength);
              if (chars.length > originalIndentationLength) {
                newChars += spacing;
              }
            } else {
              newChars = chars + spacing;
            }
            return '\n' + newChars;
          });

        if (cd.config.paragraphTemplates.length) {
          const paragraphTemplatesPattern = cd.config.paragraphTemplates
            .map(generatePageNamePattern)
            .join('|');
          const pattern = `\\{\\{(?:${paragraphTemplatesPattern})\\}\\}`;
          const regexp = new RegExp(pattern, 'g');
          const lineRegexp = new RegExp(`^(?![:*#]).*${pattern}`, 'gm');
          code = code.replace(lineRegexp, (s) => s.replace(regexp, '\n\n'));
        }

        if (this.comment.level !== 0) {
          code = code.replace(/\n\n+/g, '\n\n');
        }

        return code;
      })
      .unmask()
      .getText();

    return code.trim();
  }

  /**
   * Apply regular expressions to determine a proper place in the code to insert a reply to the
   * comment into while taking outdent templates into account.
   *
   * @param {string} adjustedChunkCodeAfter
   * @returns {object}
   * @private
   */
  matchProperPlaceRegexps(adjustedChunkCodeAfter) {
    const anySignaturePattern = (
      '^(' +
      (this.comment.isTableComment ? '[^]*?(?:(?:\\s*\\n\\|\\})+|</table>).*\\n' : '') +
      '[^]*?(?:' +
      mw.util.escapeRegExp(this.signatureCode) +
      '|' +
      cd.g.contentTimestampRegexp.source +
      '.*' +
      (cd.g.unsignedTemplatesPattern ? `|${cd.g.unsignedTemplatesPattern}.*` : '') +

      // \x01 is from hiding closed discussions and HTML comments. TODO: Line can start with a
      // HTML comment in a <pre> tag, that doesn't mean we can put a comment after it. We perhaps
      // need to change wikitext.maskDistractingCode.
      '|(?:^|\\n)\\x01.+)\\n)\\n*'
    );
    const maxIndentationLength = this.replyIndentation.length - 1;
    const endOfThreadPattern = (
      '(' +

      // \n is here to prevent putting the reply on a casual empty line. \x01 is from hiding closed
      // discussions.
      '(?![:*#\\x01\\n])' +

      /*
        This excludes cases where:
        1. `#` is starting a numbered list inside a comment (reply put in a wrong place:
           https://ru.wikipedia.org/w/index.php?diff=110482717). Can't do that to `*` as well since
           `*` can be an indentation character at a position other than 0 whereas `#` at such
           position can't be an indentation character; it can only start a line.
        2. An indentation character is followed by a newline (`\\n` removed).
       */
      (maxIndentationLength > 0 ? `|[:*#\\x01]{1,${maxIndentationLength}}(?![:*\\x01])` : '') +
      ')'
    );

    const properPlaceMatch =
      adjustedChunkCodeAfter.match(new RegExp(anySignaturePattern + endOfThreadPattern)) || [];
    let adjustedCodeBetween = properPlaceMatch[1] ?? adjustedChunkCodeAfter;
    let indentationAfter = properPlaceMatch[properPlaceMatch.length - 1];
    let isNextLine = countOccurrences(adjustedCodeBetween, /\n/g) === 1;

    if (cd.config.outdentTemplates.length) {
      const outdentTemplatesPattern = cd.config.outdentTemplates
        .map(generatePageNamePattern)
        .join('|');
      const outdentTemplatesRegexp = new RegExp(
        `^\\s*([:*#]*)[ \t]*\\{\\{ *(?:${outdentTemplatesPattern}) *(?:\\||\\}\\})`
      );

      /*
        If there is an "outdent" template next to the insertion place:
        * If the outdent template is right next to the comment replied to, we throw an error.
        * If not, we insert the reply on the next line after the target comment.
       */
      const [, outdentIndentation] =
        adjustedChunkCodeAfter
          .slice(adjustedCodeBetween.length)
          .match(outdentTemplatesRegexp) ||
        [];
      if (outdentIndentation !== undefined) {
        if (isNextLine) {
          // Can't insert a reply before an "outdent" template.
          throw new CdError({
            type: 'parse',
            code: 'findPlace',
          });
        } else if ((outdentIndentation || '').length <= this.replyIndentation.length) {
          // Matches code up to the next newline, to insert the reply in violation of chronological
          // order. If there was a properPlaceMatch, there should be a match here too.
          [, adjustedCodeBetween] = (
            adjustedChunkCodeAfter.match(new RegExp(anySignaturePattern)) ||
            []
          );
        }
      }
    }

    return { adjustedCodeBetween, indentationAfter, isNextLine };
  }

  /**
   * Determine an offset in the code to insert a reply to the comment into.
   *
   * @param {string} contextCode
   * @returns {number}
   * @private
   */
  findProperPlaceForReply(contextCode) {
    let currentIndex = this.endIndex;

    const adjustedChunkCodeAfter = CommentSource.getAdjustedChunkCodeAfter(
      currentIndex,
      contextCode
    );
    if (/^ +\x02/.test(adjustedChunkCodeAfter)) {
      throw new CdError({
        type: 'parse',
        code: 'closed',
      });
    }

    const { adjustedCodeBetween, indentationAfter, isNextLine } = this.matchProperPlaceRegexps(
      adjustedChunkCodeAfter
    );

    if (
      cd.config.outdentTemplates.length &&
      settings.get('outdentLevel') &&
      this.replyIndentation.length >= settings.get('outdentLevel') &&
      this.indentation.length > indentationAfter.length &&
      isNextLine
    ) {
      this.isReplyOutdented = true;
      this.replyIndentation = (
        this.replyIndentation.slice(0, Math.max(indentationAfter.length, 1)) +
        cd.config.defaultIndentationChar
      );
    }

    // If the comment is to be put after a comment with different indentation characters, use these,
    // unless it's a 1-level comment; then, there are options if indentationCharMode is `unify`.
    const manyCharsPart = (
      this.replyIndentation.length === 1 &&
      cd.config.indentationCharMode === 'unify'
    ) ?
      '' :
      '[:*#]{2,}|';
    const firstChar = cd.config.indentationCharMode === 'mimic' ? '[#*:]' : '#';
    const [, changedIndentation] = (
      adjustedCodeBetween.match(new RegExp(`\\n(${manyCharsPart}${firstChar}[:*#]*).*\\n$`)) ||
      []
    );
    if (changedIndentation) {
      // Note the bug https://ru.wikipedia.org/w/index.php?diff=next&oldid=105529545 that was
      // possible here when we used `.slice(0, this.indentation.length + 1)` (due to `**` as
      // indentation characters in Bsivko's comment).
      this.replyIndentation = changedIndentation
        .slice(0, this.replyIndentation.length)

        // Don't replace `*` with `:`, as a comment indented with `:` after one indented with `*`
        // may misleadingly look like a continuation of the previous comment.
        .replace(/:$/, cd.config.defaultIndentationChar);
    }

    currentIndex += adjustedCodeBetween.length;

    return currentIndex;
  }

  /**
   * @overload
   * @param {object} options
   * @param {'edit'} options.action
   * @param {string} options.commentCode
   * @param {boolean} [options.doDelete]
   * @param {string} [options.contextCode]
   * @returns {{
   *   contextCode: string;
   *   commentCode: string;
   * }}
   *
   * @overload
   * @param {object} options
   * @param {'edit'} options.action
   * @param {true} options.doDelete
   * @param {string} [options.contextCode]
   * @returns {{
   *   contextCode: string;
   * }}
   *
   * @overload
   * @param {object} options
   * @param {'reply'} options.action
   * @param {string} [options.commentCode]
   * @param {string} [options.contextCode]
   * @returns {{
   *   contextCode: string;
   *   commentCode: string;
   * }}
   *
   * @overload
   * @param {object} options
   * @param {import('./CommentForm').CommentFormMode} options.action
   * @param {string} [options.commentCode]
   * @param {boolean} [options.doDelete]
   * @param {string} [options.contextCode]
   * @param {import('./CommentForm').default} options.commentForm
   * @param {import('./CommentForm').CommentFormAction} options.commentFormAction
   * @returns {{
   *   contextCode: string;
   *   commentCode: string;
   * }}
   */

  /**
   * Modify the code of a whole section or page related to the comment in accordance with an action.
   *
   * @param {object} options
   * @param {import('./CommentForm').CommentFormMode} options.action `'reply'` or `'edit'`.
   * @param {string} [options.commentCode] Comment code, including trailing newlines, indentation
   *   characters, and the signature. Omit when `doDelete` is `true`. Can omit when `action` is
   *   `'reply'` and `commentForm` and `commentFormAction` are set.
   * @param {boolean} [options.doDelete] Whether to delete the comment.
   * @param {string} [options.contextCode] Code that has the comment. Usually not needed; provide it
   *   only if you need to perform operations on some code that is not the code of a section or
   *   page).
   * @param {import('./CommentForm').default} [options.commentForm] Comment form that has the code.
   *   Can be not set if `commentCode` is set or `action` is `'edit'`.
   * @param {import('./CommentForm').CommentFormAction} [options.commentFormAction] Comment form
   *   action. Can be not set if `commentCode` is set or `action` is `'edit'`.
   * @returns {{
   *   contextCode: string;
   *   commentCode?: string;
   * }}
   * @throws {CdError}
   */
  modifyContext({
    action,
    commentFormAction,
    commentCode,
    contextCode: originalContextCode = this.isInSectionContext
      ? /** @type {import('./Section').default} */ (this.comment.section).presumedCode
      : this.comment.getSourcePage().code,
    doDelete,
    commentForm,
  }) {
    if (!originalContextCode) {
      throw new CdError({
        type: 'internal',
        message: 'Context (section or page) code is not set.',
      });
    }

    let contextCode;
    switch (/** @type {'reply' | 'edit'} */ (action)) {
      case 'reply': {
        // This also sets .isReplyOutdented which CommentForm#inputToCode() will need. TODO:
        // refactor this "action at a distance".
        const currentIndex = this.findProperPlaceForReply(originalContextCode);

        commentCode ??= /** @type {import('./CommentForm').default} */ (commentForm).inputToCode(
          /** @type {import('./CommentForm').CommentFormAction} */ (commentFormAction)
        );
        contextCode = (
          originalContextCode.slice(0, currentIndex) +
          commentCode +
          originalContextCode.slice(currentIndex)
        );
        break;
      }

      case 'edit': {
        if (doDelete) {
          let startIndex;
          let endIndex;
          if (this.comment.isOpeningSection && this.headingStartIndex !== undefined) {
            // Usually, `.source` is set in CommentForm#buildSource(), but sometimes it's not.
            const source = /** @type {import('./Section').default} */ (
              this.comment.section
            ).getSource();

            if (extractSignatures(source.code).length > 1) {
              throw new CdError({
                type: 'parse',
                code: 'delete-repliesInSection',
              });
            } else {
              // Deleting the whole section is safer as we don't want to leave any content in the
              // end anyway.
              ({ startIndex, contentEndIndex: endIndex } = source);
            }
          } else {
            endIndex = this.signatureEndIndex + 1;
            if (
              originalContextCode
                .slice(this.endIndex)
                .match(new RegExp(`^.+\\n+[:*#]{${this.indentation.length + 1},}`))
            ) {
              throw new CdError({
                type: 'parse',
                code: 'delete-repliesToComment',
              });
            } else {
              startIndex = this.lineStartIndex;
            }
          }

          contextCode = (
            originalContextCode.slice(0, startIndex) +
            originalContextCode.slice(endIndex)
          );
        } else {
          contextCode = (
            originalContextCode.slice(0, this.lineStartIndex) +
            commentCode +
            originalContextCode.slice(this.signatureEndIndex)
          );
        }
        break;
      }
    }

    return { contextCode, commentCode };
  }

  /**
   * Get the code of the section chunk after the specified index with masked irrelevant parts.
   *
   * @param {number} currentIndex
   * @param {string} contextCode
   * @returns {string}
   * @private
   */
  static getAdjustedChunkCodeAfter(currentIndex, contextCode) {
    let adjustedCode = maskDistractingCode(contextCode);

    if (cd.config.closedDiscussionTemplates[0][0]) {
      let closedDiscussionPairRegexp;
      const closedDiscussionBeginningsPattern = cd.config.closedDiscussionTemplates[0]
        .map(generatePageNamePattern)
        .join('|');
      const closedDiscussionEndingsPattern = cd.config.closedDiscussionTemplates[1]
        .map(generatePageNamePattern)
        .join('|');
      if (closedDiscussionEndingsPattern) {
        closedDiscussionPairRegexp = new RegExp(
          (
            `\\{\\{ *(?:${closedDiscussionBeginningsPattern}) *(?=[|}])[^}]*\\}\\}\\s*([:*#]*)[^]*?` +
            `\\{\\{ *(?:${closedDiscussionEndingsPattern}) *(?=[|}])[^}]*\\}\\}`
          ),
          'g'
        );
      }
      const closedDiscussionSingleRegexp = new RegExp(
        `\\{\\{ *(?:${closedDiscussionBeginningsPattern}) *\\|[^}]{0,50}?=\\s*([:*#]*)`,
        'g'
      );

      // \x01 are later used in CommentSource#matchProperPlaceRegexps. \x02 is not used, it's
      // just for consistency
      const makeIndentationMarkers = (indentationLength, totalLength) => (
        '\x01'.repeat(indentationLength) + ' '.repeat(totalLength - indentationLength - 1) + '\x02'
      );

      if (closedDiscussionPairRegexp) {
        adjustedCode = adjustedCode.replace(
          closedDiscussionPairRegexp,
          (s, indentation) => makeIndentationMarkers(indentation.length, s.length)
        );
      }

      let match;
      while ((match = closedDiscussionSingleRegexp.exec(adjustedCode))) {
        adjustedCode = (
          adjustedCode.slice(0, match.index) +

          // Fill the space that the first met template occupies with spaces, and put the specified
          // number of marker characters at the first positions. This will be later used in
          // CommentSource#matchProperPlaceRegexps.
          (new TextMasker(adjustedCode.slice(match.index)))
            .maskTemplatesRecursively(undefined, true)
            .withText((code) => (
              code.replace(
                /\x01\d+_template_(\d+)\x02/,  // No global flag - we only need the first occurrence
                (m, n) => makeIndentationMarkers(match[1].length, n.length)
              )
            ))
            .unmask()
            .getText()
        );
      }
    }

    const adjustedCodeAfter = adjustedCode.slice(currentIndex);

    // Logically, there should always be a match
    const nextSectionHeadingMatchIndex = /** @type {number} */ (
      /** @type {RegExpMatchArray} */ (adjustedCodeAfter.match(/\n+(=+).*\1[ \t\x01\x02]*\n|$/))
        .index
    );

    let chunkCodeAfterEndIndex = currentIndex + nextSectionHeadingMatchIndex + 1;
    const chunkCodeAfter = contextCode.slice(currentIndex, chunkCodeAfterEndIndex);
    cd.g.keepInSectionEnding.forEach((regexp) => {
      const match = chunkCodeAfter.match(regexp);
      if (match) {
        // `1` accounts for the first line break.
        chunkCodeAfterEndIndex -= match[0].length - 1;
      }
    });

    return adjustedCode.slice(currentIndex, chunkCodeAfterEndIndex);
  }
}

export default CommentSource;
