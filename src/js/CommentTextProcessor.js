import CdError from './CdError';
import cd from './cd';
import { generateTagsRegexp, hideSensitiveCode } from './wikitext';
import { hideText, unhideText } from './util';

/**
 * Class that processes the text in the comment input of the comment form and prepares the wikitext
 * to insert into the page.
 */
class CommentTextProcessor {
  /**
   * Create a comment text processor.
   *
   * @param {CommentForm} commentForm
   * @param {string} action
   */
  constructor(commentForm, action) {
    this.commentForm = commentForm;
    this.target = commentForm.getTarget();
    this.action = action;

    this.filePatternEnd = `\\[\\[${cd.g.FILE_PREFIX_PATTERN}.+\\]\\]$`;
    this.galleryRegexp = /^\x01\d+_gallery\x02$/m;

    this.setIndentationData();
  }

  /**
   * Set the properties related to indentation.
   *
   * @private
   */
  setIndentationData() {
    switch (this.commentForm.getMode()) {
      case 'reply':
        this.indentationChars = this.target.inCode.replyIndentationChars;
        break;
      case 'edit':
        this.indentationChars = this.target.inCode.indentationChars;
        break;
      case 'replyInSection':
        this.indentationChars = (
          this.target.inCode.lastCommentIndentationChars &&
          (
            this.target.inCode.lastCommentIndentationChars[0] === '#' ||
            cd.config.indentationCharMode === 'mimic'
          )
        ) ?
          this.target.inCode.lastCommentIndentationChars[0] :
          cd.config.defaultIndentationChar;
        break;
      default:
        this.indentationChars = '';
    }

    this.indented = Boolean(
      ['reply', 'replyInSection'].includes(this.commentForm.getMode()) ||
      (this.commentForm.getMode() === 'edit' && this.indentationChars)
    );

    if (this.indented) {
      // In the preview mode, imitate a list so that the user will see where it would break on a
      // real page. This pseudolist's margin is made invisible by CSS.
      this.restLinesIndentationChars = this.action === 'preview' ?
        ':' :
        this.indentationChars.replace(/\*/g, ':');
    }
  }

  /**
   * Check whether the comment is indented.
   *
   * @returns {boolean}
   */
  isIndented() {
    return this.indented;
  }

  /**
   * The main method that actually processes the code.
   *
   * @param {string} code
   * @returns {string}
   */
  process(code) {
    this.initialCode = this.code = code.trim();

    this.processAndHideSensitiveCode();
    this.findWrappers();
    this.setSignature();
    this.processAllCode();
    this.addHeadline();
    this.addSignature();
    this.addOutdent();
    this.addTrailingNewline();
    this.addIntentationChars();
    this.unhideSensitiveCode();

    return this.code;
  }

  /**
   * Process (with {@link CommentTextProcessor#processCode}) and hide sensitive code, setting the
   * `hidden` property and updating `code`.
   *
   * @private
   */
  processAndHideSensitiveCode() {
    const templateHandler = (code) => this.processCode(code, true);
    Object.assign(this, hideSensitiveCode(this.code, templateHandler));
  }

  /**
   * Find tags in the code and do something about them.
   *
   * @private
   */
  findWrappers() {
    // Find tags around potential markup.
    if (this.indented) {
      const tagMatches = this.code.match(generateTagsRegexp(['[a-z]+'])) || [];
      const quoteMatches = this.code.match(cd.g.QUOTE_REGEXP) || [];
      const matches = tagMatches.concat(quoteMatches);
      this.areThereTagsAroundListMarkup = matches.some((match) => /\n[:*#;]/.test(match));
    }

    // If the user wrapped the comment in <small></small>, remove the tags to later wrap the
    // comment together with the signature into the tags and possibly ensure the correct line
    // spacing.
    this.wrapInSmall = false;
    if (!this.commentForm.headlineInput) {
      this.code = this.code.replace(/^<small>([^]*)<\/small>$/i, (s, content) => {
        this.wrapInSmall = true;
        return content;
      });
    }
  }

  /**
   * Set the `signature` property. Also fix the code according to it.
   *
   * @private
   */
  setSignature() {
    if (this.commentForm.omitSignatureCheckbox?.isSelected()) {
      this.signature = '';
    } else {
      this.signature = this.commentForm.getMode() === 'edit' ?
        this.target.inCode.signatureCode :
        cd.g.USER_SIGNATURE;
    }

    // Make so that the signature doesn't turn out to be at the end of the last item of the list if
    // the comment contains one.
    if (
      this.signature &&

      // The existing signature doesn't start with a newline.
      (this.commentForm.getMode() !== 'edit' || !/^[ \t]*\n/.test(this.signature)) &&

      /(^|\n)[:*#;].*$/.test(this.code)
    ) {
      this.code += '\n';
    }
  }

  /**
   * Replace list markup (`:*#;`) with respective tags.
   *
   * @param {string} code
   * @returns {string}
   * @private
   */
  listMarkupToTags(code) {
    const replaceLineWithList = (lines, i, list, isNested = false) => {
      if (isNested) {
        const previousItemIndex = i - list.items.length - 1;
        if (previousItemIndex >= 0) {
          const item = {
            type: lines[previousItemIndex].type,
            items: [lines[previousItemIndex], list],
          };
          lines.splice(previousItemIndex, list.items.length + 1, item);
        } else {
          const item = {
            type: lines[0].type,
            items: [list],
          };
          lines.splice(i - list.items.length, list.items.length, item);
        }
      } else {
        lines.splice(i - list.items.length, list.items.length, list);
      }
      parseLines(list.items, true);
    };

    const parseLines = (lines, isNested = false) => {
      let list = { items: [] };
      for (let i = 0; i <= lines.length; i++) {
        if (i === lines.length) {
          if (list.type) {
            replaceLineWithList(lines, i, list, isNested);
          }
        } else {
          const text = lines[i].text;
          const firstChar = text[0] || '';
          const listType = listTags[firstChar];
          if (list.type && listType !== list.type) {
            const itemsCount = list.items.length;
            replaceLineWithList(lines, i, list, isNested);
            i -= itemsCount - 1;
            list = { items: [] };
          }
          if (listType) {
            list.type = listType;
            list.items.push({
              type: itemTags[firstChar],
              text: text.slice(1),
            });
          }
        }
      }
      return lines;
    };

    const listToTags = (lines, isNested = false) => {
      let text = '';
      lines.forEach((line, i) => {
        if (line.text === undefined) {
          const itemsText = line.items
          .map((item) => {
            const itemText = item.text === undefined ?
              listToTags(item.items, true) :
              item.text.trim();
            return item.type ? `<${item.type}>${itemText}</${item.type}>` : itemText;
          })
          .join('');
          text += `<${line.type}>${itemsText}</${line.type}>`;
        } else {
          text += isNested ? line.text.trim() : line.text;
        }
        if (i !== lines.length - 1) {
          text += '\n';
        }
      });
      return text;
    };

    const listTags = {
      ':': 'dl',
      ';': 'dl',
      '*': 'ul',
      '#': 'ol',
    };
    const itemTags = {
      ':': 'dd',
      ';': 'dt',
      '*': 'li',
      '#': 'li',
    };

    let lines = code
      .split('\n')
      .map((line) => ({
        type: '',
        text: line,
      }));
    parseLines(lines);
    return listToTags(lines);
  }

  /**
   * Add indentation chars to the start of the line.
   *
   * @param {string} indentationChars
   * @param {string} line
   * @param {boolean} [addLine=true] Add the line itself.
   * @returns {string}
   * @private
   */
  prepareLineStart(indentationChars, line, addLine = true) {
    const addSpace = (
      indentationChars &&
      cd.config.spaceAfterIndentationChars &&
      !/^[:*#;]/.test(line)
    );
    return indentationChars + (addSpace ? ' ' : '') + (addLine ? line : '');
  }

  /**
   * Perform operations with code in an indented comment.
   *
   * @param {string} code
   * @param {boolean} isWrapped Is the code wrapped.
   * @returns {string}
   * @private
   */
  handleIndentedComment(code, isWrapped) {
    if (!this.indented) {
      return code;
    }

    // Remove spaces at the beginning of lines.
    code = code.replace(/^ +/gm, '');

    // Remove paragraphs if the wiki has no paragraph template.
    if (!cd.config.paragraphTemplates.length) {
      code = code.replace(/\n\n+/g, '\n');
    }

    // Replace list markup (`:*#;`) with respective tags if otherwise layout will be broken.
    if (/^[:*#;]/m.test(code) && (isWrapped || this.restLinesIndentationChars === '#')) {
      code = this.listMarkupToTags(code);
    }

    // Add indentation characters to lines with the list and table markup as well as lines wholly
    // occupied by the file markup. File markup is tricky because, depending on the alignment and
    // line breaks, the result can be very different. The safest way to fight that is to use
    // indentation.
    const lineStartMarkupRegexp = new RegExp(`(\\n+)([:*#;\\x03]|${this.filePatternEnd})`, 'gmi');
    code = code.replace(lineStartMarkupRegexp, (s, newlines, nextLine) => {
      // Many newlines will be replaced with a paragraph template below. It could help visual
      // formatting. If there is no paragraph template, there won't be multiple newlines, as they
      // will have been removed above.
      const newlinesToAdd = newlines.length > 1 ? '\n\n\n' : '\n';
      const line = this.prepareLineStart(this.restLinesIndentationChars, nextLine);

      return newlinesToAdd + line;
    });

    // Add newlines before and after gallery (yes, even if the comment starts with it).
    code = code
      .replace(/(^|[^\n])(\x01\d+_gallery\x02)/g, (s, before, m) => before + '\n' + m)
      .replace(/\x01\d+_gallery\x02(?=(?:$|[^\n]))/g, (s) => s + '\n');

    // Table markup is OK only with colons as indentation characters.
    if (this.restLinesIndentationChars.includes('#') && code.includes('\x03')) {
      throw new CdError({
        type: 'parse',
        code: 'numberedList-table',
      });
    }

    if (this.restLinesIndentationChars === '#') {
      if (this.galleryRegexp.test(code)) {
        throw new CdError({
          type: 'parse',
          code: 'numberedList',
        });
      }
    }

    // Add indentation characters to lines following the lines with the list, table, and gallery
    // markup.
    const followingLinesRegexp = /^((?:[:*#;\x03].+|\x01\d+_gallery\x02))(\n+)(?![:#])/mg;
    code = code.replace(followingLinesRegexp, (s, previousLine, newlines) => {
      // Many newlines will be replaced with a paragraph template below. If there is no
      // paragraph template, there wouldn't be multiple newlines, as they would've been removed
      // above.
      const newlinesToAdd = newlines.length > 1 ? '\n\n' : '';

      return (
        previousLine +
        '\n' +
        this.prepareLineStart(this.restLinesIndentationChars, newlinesToAdd)
      );
    });

    const paragraphCode = cd.config.paragraphTemplates.length ?
      `$1{{${cd.config.paragraphTemplates[0]}}}` :
      `$1<br>`;
    code = code.replace(/^(.*)\n\n+(?!:)/gm, paragraphCode);

    return code;
  }

  /**
   * Process newlines by adding or not adding `<br>` and keeping or not keeping the newline. `\x01`
   * and `\x02` mean the beginning and ending of sensitive code except for tables. `\x03` and `\x04`
   * mean the beginning and ending of a table. Note: This should be kept coordinated with the
   * reverse transformation code in {@link Comment#codeToText}.
   *
   * @param {string} code
   * @param {boolean} isInTemplate
   * @returns {string} code
   */
  processNewlines(code, isInTemplate = false) {
    const entireLineRegexp = new RegExp(/^(?:\x01\d+_(block|template)\x02) *$/);
    const entireLineFromStartRegexp = /^(=+).*\1[ \t]*$|^----/;
    const fileRegexp = new RegExp('^' + this.filePatternEnd, 'i');

    let currentLineInTemplates = '';
    let nextLineInTemplates = '';
    if (isInTemplate) {
      currentLineInTemplates = '|=';
      nextLineInTemplates = '|\\||}}';
    }
    const currentLineEndingRegexp = new RegExp(
      `(?:<${cd.g.PNIE_PATTERN}(?: [\\w ]+?=[^<>]+?| ?\\/?)>|<\\/${cd.g.PNIE_PATTERN}>|\\x04|<br[ \\n]*\\/?>${currentLineInTemplates}) *$`,
      'i'
    );
    const nextLineBeginningRegexp = new RegExp(
      `^(?:<\\/${cd.g.PNIE_PATTERN}>|<${cd.g.PNIE_PATTERN}${nextLineInTemplates})`,
      'i'
    );

    const newlinesRegexp = this.indented ?
      /^(.+)\n(?![:#])(?=(.*))/gm :
      /^((?![:*#; ]).+)\n(?![\n:*#; \x03])(?=(.*))/gm;
    code = code.replace(newlinesRegexp, (s, currentLine, nextLine) => {
      const lineBreakOrNot = (
        entireLineRegexp.test(currentLine) ||
        entireLineRegexp.test(nextLine) ||

        (
          !this.indented &&
          (entireLineFromStartRegexp.test(currentLine) || entireLineFromStartRegexp.test(nextLine))
        ) ||
        fileRegexp.test(currentLine) ||
        fileRegexp.test(nextLine) ||
        this.galleryRegexp.test(currentLine) ||
        this.galleryRegexp.test(nextLine) ||

        // Removing <br>s after block elements is not a perfect solution as there would be no
        // newlines when editing such a comment, but this way we would avoid empty lines in cases
        // like "</div><br>".
        currentLineEndingRegexp.test(currentLine) ||
        nextLineBeginningRegexp.test(nextLine)
      ) ?
        '' :
        '<br>';

      // Current line can match galleryRegexp only if the comment will not be indented.
      const newlineOrNot = this.indented && !this.galleryRegexp.test(nextLine) ? '' : '\n';

      return currentLine + lineBreakOrNot + newlineOrNot;
    });

    return code;
  }

  /**
   * Make the core code transformations.
   *
   * @param {string} code
   * @param {boolean} isInTemplate Is the code in a template.
   * @returns {string}
   * @private
   */
  processCode(code, isInTemplate) {
    code = this.handleIndentedComment(code, isInTemplate || this.areThereTagsAroundListMarkup);
    code = this.processNewlines(code, isInTemplate);
    return code;
  }

  /**
   * Make the core code transformations with all code.
   *
   * @private
   */
  processAllCode() {
    this.code = this.processCode(this.code);
  }

  /**
   * Add the headline to the code.
   *
   * @private
   */
  addHeadline() {
    const headline = this.commentForm.headlineInput?.getValue().trim();
    if (
      !headline ||
      (
        this.commentForm.getMode() === 'addSection' &&
        this.commentForm.isSectionSubmitted() &&
        this.action === 'submit'
      )
    ) {
      return;
    }

    let level;
    if (this.commentForm.getMode() === 'addSection') {
      level = 2;
    } else if (this.commentForm.getMode() === 'addSubsection') {
      level = this.target.level + 1;
    } else {
      // 'edit'
      level = this.target.inCode.headingLevel;
    }
    const equalSigns = '='.repeat(level);

    if (
      this.commentForm.getMode() === 'addSection' ||

      // To have pretty diffs.
      (
        this.commentForm.getMode() === 'edit' &&
        this.commentForm.getTarget().isOpeningSection &&
        /^\n/.test(this.target.inCode.code)
      )
    ) {
      this.code = '\n' + this.code;
    }
    this.code = `${equalSigns} ${headline} ${equalSigns}\n${this.code}`;
  }

  /**
   * Add the signature to the code.
   *
   * @private
   */
  addSignature() {
    if (!this.commentForm.omitSignatureCheckbox?.isSelected()) {
      // Remove signature tildes from the end of the comment.
      this.code = this.code.replace(/\s*~{3,}$/, '');
    }

    if (this.action === 'preview' && this.signature) {
      this.signature = `<span class="cd-commentForm-signature">${this.signature}</span>`;
    }

    // A space in the beggining of the last line, creating <pre>, or a heading.
    if (!this.indented && /(^|\n)[ =].*$/.test(this.code)) {
      this.code += '\n';
    }

    // Remove starting spaces if the line starts with the signature.
    if (!this.code || this.code.endsWith('\n') || this.code.endsWith(' ')) {
      this.signature = this.signature.trimLeft();
    }

    // Process the small font wrappers, add the signature.
    if (this.wrapInSmall) {
      let before;
      if (/^[:*#; ]/.test(this.code)) {
        before = '\n' + (this.indented ? this.restLinesIndentationChars : '');
      } else {
        before = '';
      }
      if (cd.config.smallDivTemplates.length && !/^[:*#;]/m.test(this.code)) {
        // Hide links that have "|", then replace "|" with "{{!}}", then wrap in a small div
        // template.
        const hiddenLinks = [];
        this.code = hideText(this.code.trim(), /\[\[[^\]|]+\|/g, hiddenLinks, 'link');
        this.code = this.code.replace(/\|/g, '{{!}}') + this.signature;
        this.code = unhideText(this.code, hiddenLinks, 'link');
        this.code = `{{${cd.config.smallDivTemplates[0]}|1=${this.code}}}`;
      } else {
        this.code = `<small>${before}${this.code}${this.signature}</small>`;
      }
    } else {
      this.code += this.signature;
    }
  }

  /**
   * Add an outdent template to the beginning of the comment.
   */
  addOutdent() {
    if (!this.target.inCode?.isReplyOutdented) return;

    const outdentDifference = this.target.level - this.target.inCode.replyIndentationChars.length;
    this.code = (
      `{{${cd.config.outdentTemplates[0]}|${outdentDifference}}}` +
      (/^[:*#]+/.test(this.code) ? '\n' : ' ') +
      this.code
    );
  }

  /**
   * Add a newline to the code.
   *
   * @private
   */
  addTrailingNewline() {
    if (this.commentForm.getMode() !== 'edit') {
      this.code += '\n';
    }
  }

  /**
   * Add the indentation characters to the code.
   *
   * @private
   */
  addIntentationChars() {
    // If the comment starts with a list or table, replace all asterisks in the indentation
    // characters with colons to have the comment HTML generated correctly.
    if (this.indented && this.action !== 'preview' && /^[*#;\x03]/.test(this.code)) {
      this.indentationChars = this.restLinesIndentationChars;
    }

    if (this.action !== 'preview') {
      this.code = this.prepareLineStart(this.indentationChars, this.code);

      if (this.mode === 'addSubsection') {
        this.code += '\n';
      }
    } else if (this.action === 'preview' && this.indented && this.initialCode) {
      this.code = this.prepareLineStart(':', this.code);
    }
  }

  /**
   * Restore the hidden sensitive code.
   *
   * @private
   */
  unhideSensitiveCode() {
    this.code = unhideText(this.code, this.hidden);
  }
}

export default CommentTextProcessor;
