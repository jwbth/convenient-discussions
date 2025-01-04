import cd from './cd';
import CdError from './CdError';
import sectionRegistry from './sectionRegistry';
import { calculateWordOverlap, genericGetOldestOrNewestByDateProp } from './utils-general';
import { endWithTwoNewlines, extractSignatures, normalizeCode, removeWikiMarkup } from './utils-wikitext';

/**
 * Class that keeps the methods and data related to a section's source code. Also used for section
 * source match candidates before a single match is chosen among them.
 */
class SectionSource {
  /**
   * Index of the first character of the section code.
   *
   * @type {number}
   */
  startIndex;

  /**
   * Index of the last character of the section code.
   *
   * @type {number}
   */
  endIndex;

  /**
   * Section code.
   *
   * @type {string}
   */
  code;

  /**
   * Index of the first character of the section content (i.e., everything after the section
   * heading).
   *
   * @type {number}
   */
  contentStartIndex;

  /**
   * Index of the last character of the section content, before the code that we intentionally keep
   * in section endings (see {@link convenientDiscussions.g.keepInSectionEnding}).
   *
   * @type {number}
   */
  contentEndIndex;

  /**
   * Index of the first character of the section content relative to the section code start.
   *
   * @type {number}
   */
  relativeContentStartIndex;

  /**
   * Index of the last character of the first chunk of the section code (i.e., everything before
   * the first section subdivision).
   *
   * @type {number}
   */
  firstChunkEndIndex;

  /**
   * Index of the last character of the first chunk of the section content (i.e., everything
   * before the first section subdivision).
   *
   * @type {number}
   */
  firstChunkContentEndIndex;

  /**
   * First chunk of the section code (i.e., everything before the first section subdivision).
   *
   * @type {string}
   */
  firstChunkCode;

  /**
   * Normalized section heading.
   *
   * @type {string}
   */
  headline;

  /**
   * Create a section's source object.
   *
   * @param {object} options
   * @param {import('./Section').default} options.section
   * @param {string[]} options.sectionHeadingMatch
   * @param {string} options.contextCode
   * @param {string} options.adjustedContextCode
   * @param {boolean} options.isInSectionContext
   */
  constructor({
    section,
    sectionHeadingMatch,
    contextCode,
    adjustedContextCode,
    isInSectionContext,
  }) {
    this.section = section;
    this.isInSectionContext = isInSectionContext;

    this.collectMatchData(sectionHeadingMatch, contextCode, adjustedContextCode);
    if (!this.code || !this.firstChunkCode) {
      console.warn(`Couldn't read the "${this.headline}" section contents.`);
      return;
    }
  }

  /**
   * _For internal use._ Extract the section's last comment's indentation characters if needed or a
   * vote / bulleted reply placeholder.
   *
   * @param {import('./CommentForm').default} commentForm
   * @returns {?string}
   */
  extractLastCommentIndentation(commentForm) {
    if (this.lastCommentIndentation === undefined) {
      const [, replyPlaceholder] = this.firstChunkCode.match(/\n([#*]) *\n+$/) || [];
      if (replyPlaceholder) {
        this.lastCommentIndentation = replyPlaceholder;
      } else {
        this.lastCommentIndentation = null;

        const lastComment = this.section.commentsInFirstChunk.slice(-1)[0];
        if (
          lastComment &&
          (commentForm.getContainerListType() === 'ol' || cd.config.indentationCharMode === 'mimic')
        ) {
          try {
            // TODO: get rid of "action at a distance" with the use of
            // commentForm.isSectionSubmitted()
            const source = lastComment.locateInCode(
              commentForm.isSectionSubmitted() ? this.section.presumedCode : undefined
            );

            if (
              !source.indentation.startsWith('#') ||

              // For now we use the workaround with commentForm.getContainerListType() to make
              // sure `#` is a part of comments organized in a numbered list, not of a numbered list
              // _in_ the target comment.
              commentForm.getContainerListType() === 'ol'
            ) {
              this.lastCommentIndentation = source.indentation;
            }
          } catch {
            // Empty
          }
        }
      }
    }

    return this.lastCommentIndentation;
  }

  /**
   * Modify a whole section or page code string related to the section in accordance with an action.
   *
   * @param {object} options
   * @param {import('./CommentForm').CommentFormMode} options.action `'replyInSection'` or
   *   `'addSubsection'`.
   * @param {string} [options.commentCode] Comment code, including trailing newlines and the
   *   signature. It is required (set to optional for polymorphism with CommentSource and
   *   PageSource).
   * @returns {{
   *   contextCode: string;
   *   commentCode: string;
   * }}
   */
  modifyContext({ action, commentCode }) {
    const originalContextCode = this.isInSectionContext ?
      this.section.presumedCode :
      this.section.getSourcePage().code;
    if (!originalContextCode) {
      throw new CdError({
        type: 'internal',
        message: 'Context (section or page) code is not set.',
      });
    }

    let contextCode;
    switch (action) {
      case 'replyInSection': {
        contextCode = (
          originalContextCode.slice(0, this.firstChunkContentEndIndex) +
          commentCode +
          originalContextCode.slice(this.firstChunkContentEndIndex)
        );
        break;
      }

      case 'addSubsection': {
        contextCode = (
          endWithTwoNewlines(originalContextCode.slice(0, this.contentEndIndex)) +
          commentCode +
          originalContextCode.slice(this.contentEndIndex).trim()
        );
        break;
      }
    }

    return {
      contextCode: /** @type {string} */ (contextCode),
      commentCode: /** @type {string} */ (commentCode),
    };
  }

  /**
   * Collect data for the match, including section text, first chunk text, indexes, etc.
   *
   * @param {object} sectionHeadingMatch
   * @param {string} contextCode
   * @param {string} adjustedContextCode
   * @private
   */
  collectMatchData(sectionHeadingMatch, contextCode, adjustedContextCode) {
    const fullHeadingMatch = sectionHeadingMatch[1];
    const equalSignsPattern = `={1,${sectionHeadingMatch[2].length}}`;
    const codeFromSection = contextCode.slice(sectionHeadingMatch.index);
    const adjustedCodeFromSection = adjustedContextCode.slice(sectionHeadingMatch.index);
    const sectionMatch = (
      adjustedCodeFromSection.match(new RegExp(
        // Will fail at "===" or the like.
        '(' +
        mw.util.escapeRegExp(fullHeadingMatch) +
        '[^]*?\\n)' +
        equalSignsPattern +
        '[^=].*=+[ \\t\\x01\\x02]*\\n'
      )) ||
      adjustedCodeFromSection.match(new RegExp(
        '(' +
        mw.util.escapeRegExp(fullHeadingMatch) +
        '[^]*$)'
      ))
    );

    // To simplify the workings of the `replyInSection` mode we don't consider terminating line
    // breaks to be a part of the first chunk of the section (i.e., the section subdivision before
    // the first heading).
    const firstChunkMatch = (
      adjustedCodeFromSection.match(new RegExp(
        // Will fail at "===" or the like.
        '(' +
        mw.util.escapeRegExp(fullHeadingMatch) +
        '[^]*?\\n)\\n*' +

        // Any next heading.
        '={1,6}' +

        '[^=].*=+[ \\t\\x01\\x02]*\\n'
      )) ||
      adjustedCodeFromSection.match(new RegExp(
        '(' +
        mw.util.escapeRegExp(fullHeadingMatch) +
        '[^]*$)'
      ))
    );

    const code = sectionMatch && codeFromSection.substr(sectionMatch.index, sectionMatch[1].length);
    const firstChunkCode = (
      firstChunkMatch &&
      codeFromSection.substr(firstChunkMatch.index, firstChunkMatch[1].length)
    );

    const startIndex = sectionHeadingMatch.index;
    const endIndex = startIndex + code.length;
    const contentStartIndex = sectionHeadingMatch.index + sectionHeadingMatch[0].length;
    const firstChunkEndIndex = startIndex + firstChunkCode.length;

    let firstChunkContentEndIndex = firstChunkEndIndex;
    let contentEndIndex = endIndex;
    cd.g.keepInSectionEnding.forEach((regexp) => {
      const firstChunkMatch = firstChunkCode.match(regexp);
      if (firstChunkMatch) {
        // `1` accounts for the first line break.
        firstChunkContentEndIndex -= firstChunkMatch[0].length - 1;
      }

      const match = code.match(regexp);
      if (match) {
        // `1` accounts for the first line break.
        contentEndIndex -= match[0].length - 1;
      }
    });

    /*
      Sections may have `#` or `*` as a placeholder for a vote or bulleted reply. In this case,
      we must use that `#` or `*` in the reply. As for the placeholder, perhaps we should remove
      it, but as for now, we keep it because if:

        * the placeholder character is `*`,
        * `cd.config.indentationCharMode` is `'unify'`,
        * `cd.config.defaultIndentationChar` is `':'`, and
        * there is more than one reply,

      the next reply would go back to `:`, not `*` as should be.
    */
    const placeholderMatch = firstChunkCode.match(/\n([#*] *\n+)$/);
    if (placeholderMatch) {
      firstChunkContentEndIndex -= placeholderMatch[1].length;
    }

    this.startIndex = startIndex;
    this.endIndex = endIndex;
    this.code = code;
    this.contentStartIndex = contentStartIndex;
    this.contentEndIndex = contentEndIndex;
    this.relativeContentStartIndex = contentStartIndex - startIndex;
    this.firstChunkEndIndex = firstChunkEndIndex;
    this.firstChunkContentEndIndex = firstChunkContentEndIndex;
    this.firstChunkCode = firstChunkCode;
    this.headline = normalizeCode(removeWikiMarkup(sectionHeadingMatch[3]));
  }

  /**
   * _For internal use._ Calculate and set a score for the match.
   *
   * @param {number} sectionIndex
   * @param {string} thisHeadline
   * @param {string[]} headlines
   * @returns {{
   *   source: SectionSource,
   *   score: number,
   * }}
   */
  calculateMatchScore(sectionIndex, thisHeadline, headlines) {
    const doesHeadlineMatch = thisHeadline.includes('{{') ? 0.5 : this.headline === thisHeadline;

    let doesSectionIndexMatch;
    let doPreviousHeadlinesMatch;
    if (this.isInSectionContext) {
      doesSectionIndexMatch = 0;
      doPreviousHeadlinesMatch = 0;
    } else {
      // Matching section index is one of the most unreliable ways to tell matching sections as
      // sections may be added and removed from the page, so we don't rely on it very much.
      doesSectionIndexMatch = this.section.index === sectionIndex;

      const previousHeadlinesToCheckCount = 3;
      const previousHeadlinesInCode = headlines
        .slice(-previousHeadlinesToCheckCount)
        .reverse();
      doPreviousHeadlinesMatch = sectionRegistry.getAll()
        .slice(Math.max(0, this.section.index - previousHeadlinesToCheckCount), this.section.index)
        .reverse()
        .map((section) => section.headline)
        .every((headline, i) => normalizeCode(headline) === previousHeadlinesInCode[i]);
    }

    headlines.push(this.headline);

    const oldestSig = genericGetOldestOrNewestByDateProp(
      extractSignatures(this.code),
      'oldest',
      true
    );
    const sectionOldestComment = this.section.oldestComment;
    const doesOldestCommentMatch = oldestSig ?
      Boolean(
        sectionOldestComment &&
        (
          oldestSig.timestamp === sectionOldestComment.timestamp &&
          oldestSig.author === sectionOldestComment.author
        )
      ) :

      // There's no comments neither in the code nor on the page.
      !sectionOldestComment;

    // Multiply by 0.5 to avoid situations like
    // https://commons.wikimedia.org/w/index.php?title=User_talk:Jack_who_built_the_house&oldid=956309089#Unwanted_pings_on_en.wikipedia,
    // even though they are not CD's fault
    let oldestCommentWordOverlap = Number(!this.section.oldestComment && !oldestSig) * 0.5;

    if (this.section.oldestComment && oldestSig) {
      // Use the comment text overlap factor due to this error
      // https://www.wikidata.org/w/index.php?diff=1410718962. The comment's source code is
      // extracted only superficially, without exluding the headline code and other operations
      // performed in Comment#adjustCommentBeginning.
      oldestCommentWordOverlap = calculateWordOverlap(
        this.section.oldestComment.getText(),
        removeWikiMarkup(this.code.slice(oldestSig.commentStartIndex, oldestSig.startIndex))
      );
    }

    // If changing this, change the maximal possible score in Section#searchInCode
    return {
      source: this,
      score: (
        Number(doesOldestCommentMatch) * 1 +
        oldestCommentWordOverlap +
        Number(doesHeadlineMatch) * 1 +
        Number(doesSectionIndexMatch) * 0.5 +

        // Shouldn't give too high a weight to this factor as it is true for every first section.
        Number(doPreviousHeadlinesMatch) * 0.25
      ),
    };
  }
}

export default SectionSource;
