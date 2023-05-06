import SectionStatic from './SectionStatic';
import cd from './cd';
import { calculateWordOverlap } from './utils';
import { endWithTwoNewlines, extractSignatures, normalizeCode, removeWikiMarkup } from './wikitext';

/**
 * Class that keeps the methods and data related to the section's source code. Also used for section
 * source match candidates before a single match is chosen among them.
 */
export default class SectionSource {
  /**
   * Create a section's source object.
   *
   * @param {object} options
   */
  constructor({
    section,
    sectionHeadingMatch,
    contextCode,
    adjustedContextCode,
    thisHeadline,
    sectionIndex,
    headlines,
    isInSectionContext,
  }) {
    this.section = section;
    this.collectMatchData(sectionHeadingMatch, contextCode, adjustedContextCode);
    if (!this.code || !this.firstChunkCode) {
      console.warn(`Couldn't read the "${this.headline}" section contents.`);
      return;
    }

    this.calculateMatchScore(sectionIndex, thisHeadline, headlines);
    this.isInSectionContext = isInSectionContext;
  }

  /**
   * _For internal use._ Extract the section's last comment's indentation characters if needed or a
   * vote / bulleted reply placeholder.
   *
   * @param {import('./CommentForm').default} commentForm
   * @returns {string}
   */
  extractLastCommentIndentation(commentForm) {
    const [, replyPlaceholder] = this.firstChunkCode.match(/\n([#*]) *\n+$/) || [];
    if (replyPlaceholder) {
      return replyPlaceholder;
    }

    const lastComment = this.section.commentsInFirstChunk.slice(-1)[0];
    if (
      lastComment &&
      (commentForm.getContainerListType() === 'ol' || cd.config.indentationCharMode === 'mimic')
    ) {
      try {
        lastComment.locateInCode(commentForm.isSectionSubmitted());
      } catch {
        return;
      }
      if (
        !lastComment.source.indentation.startsWith('#') ||

        // For now we use the workaround with `commentForm.getContainerListType()` to make sure
        // `#` is a part of comments organized in a numbered list, not of a numbered list _in_ the
        // target comment.
        commentForm.getContainerListType() === 'ol'
      ) {
        return lastComment.source.indentation;
      }
    }
  }

  /**
   * Modify a whole section or page code string related to the section in accordance with an action.
   *
   * @param {object} options
   * @param {'replyInSection'|'addSubsection'} options.action
   * @param {string} options.commentCode Comment code, including trailing newlines and the
   *   signature.
   * @returns {object}
   */
  modifyContext({ action, commentCode }) {
    const originalContextCode = this.isInSectionContext ?
      this.section.code :
      this.section.getSourcePage().code;
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

    return { contextCode, commentCode };
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

    // To simplify the workings of the "replyInSection" mode we don't consider terminating line
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

        '[^=].*=+[ \\t\\x01\\x02]*\n'
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
    const relativeContentStartIndex = contentStartIndex - startIndex;

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

    Object.assign(this, {
      startIndex,
      endIndex,
      code,
      contentStartIndex,
      contentEndIndex,
      relativeContentStartIndex,
      firstChunkEndIndex,
      firstChunkContentEndIndex,
      firstChunkCode,
      headline: normalizeCode(removeWikiMarkup(sectionHeadingMatch[3])),
    });
  }

  /**
   * Calculate and set a score for the match.
   *
   * @param {number} sectionIndex
   * @param {string} thisHeadline
   * @param {string[]} headlines
   * @returns {number}
   * @private
   */
  calculateMatchScore(sectionIndex, thisHeadline, headlines) {
    // Matching section index is one of the most unreliable ways to tell matching sections as
    // sections may be added and removed from the page, so we don't rely on it very much.
    const doesSectionIndexMatch = this.section.index === sectionIndex;

    const doesHeadlineMatch = this.headline === thisHeadline;

    const previousHeadlinesToCheckCount = 3;
    const previousHeadlinesInCode = headlines
      .slice(-previousHeadlinesToCheckCount)
      .reverse();
    const previousHeadlines = SectionStatic.getAll()
      .slice(Math.max(0, this.section.index - previousHeadlinesToCheckCount), this.section.index)
      .reverse()
      .map((section) => section.headline);
    const doPreviousHeadlinesMatch = previousHeadlines
      .every((headline, i) => normalizeCode(headline) === previousHeadlinesInCode[i]);
    headlines.push(this.headline);

    let oldestSig;
    extractSignatures(this.code).forEach((sig) => {
      if (!oldestSig || (!oldestSig.date && sig.date) || oldestSig.date > sig.date) {
        oldestSig = sig;
      }
    });
    const sectionOldestComment = this.section.oldestComment;
    const doesOldestCommentMatch = oldestSig ?
      Boolean(
        sectionOldestComment &&
        (
          oldestSig.timestamp === sectionOldestComment.timestamp ||
          oldestSig.author === sectionOldestComment.author
        )
      ) :

      // There's no comments neither in the code nor on the page.
      !sectionOldestComment;

    let oldestCommentWordOverlap = Number(!this.section.oldestComment && !oldestSig);
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

    return (
      doesOldestCommentMatch * 1 +
      oldestCommentWordOverlap +
      doesHeadlineMatch * 1 +
      doesSectionIndexMatch * 0.5 +

      // Shouldn't give too high a weight to this factor as it is true for every first section.
      doPreviousHeadlinesMatch * 0.25
    );
  }
}
