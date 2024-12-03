import CdError from './CdError';
import TextMasker from './TextMasker';
import cd from './cd';
import { escapePipesOutsideLinks, generateTagsRegexp } from './utils-wikitext';

/**
 * Class that processes the comment form input and prepares the wikitext to insert into the page.
 *
 * @augments TextMasker
 */
class CommentFormInputTransformer extends TextMasker {
  /**
   * Create a comment form input processor.
   *
   * @param {string} text
   * @param {import('./CommentForm').default} commentForm
   * @param {string} action
   */
  constructor(text, commentForm, action) {
    super(text.trim());
    this.initialText = this.text;
    this.commentForm = commentForm;
    this.target = commentForm.getTarget();
    this.action = action;

    this.initIndentationData();
  }

  /**
   * Set the properties related to indentation.
   *
   * @private
   */
  initIndentationData() {
    const targetSource = this.target.source;
    switch (this.commentForm.getMode()) {
      case 'reply': {
        this.indentation = targetSource.replyIndentation;
        break;
      }
      case 'edit': {
        this.indentation = targetSource.indentation;
        break;
      }
      case 'replyInSection': {
        const lastCommentIndentation = targetSource.extractLastCommentIndentation(this.commentForm);
        this.indentation = (
          lastCommentIndentation &&
          (lastCommentIndentation[0] === '#' || cd.config.indentationCharMode === 'mimic')
        ) ?
          lastCommentIndentation[0] :
          cd.config.defaultIndentationChar;
        break;
      }
      default: {
        this.indentation = '';
      }
    }

    if (this.indentation) {
      // In the preview mode, imitate a list so that the user will see where it would break on a
      // real page. This pseudolist's margin is made invisible by CSS.
      this.restLinesIndentation = this.action === 'preview' ?
        ':' :
        this.indentation.replace(/\*/g, ':');
    }
  }

  /**
   * Check whether the comment will be indented.
   *
   * @returns {boolean}
   */
  isIndented() {
    return Boolean(this.indentation);
  }

  /**
   * The main method that actually processes the code and returns the result.
   *
   * @returns {string}
   */
  transform() {
    return this
      .processAndMaskSensitiveCode()
      .findWrappers()
      .initSignatureAndFixCode()
      .processAllCode()
      .addHeadline()
      .addSignature()
      .addOutdent()
      .addTrailingNewline()
      .addIntentationChars()
      .unmask()
      .getText();
  }

  /**
   * Process (with {@link CommentFormInputTransformer#processCode}) and mask sensitive code,
   * updating {@link CommentFormInputTransformer#text}.
   *
   * @returns {CommentFormInputTransformer}
   * @private
   */
  processAndMaskSensitiveCode() {
    return this.maskSensitiveCode((code) => this.processCode(code, true));
  }

  /**
   * Find tags in the code and do something about them.
   *
   * @returns {CommentFormInputTransformer}
   * @private
   */
  findWrappers() {
    // Find tags around potential markup.
    if (this.indentation) {
      const tagMatches = this.text.match(generateTagsRegexp(['[a-z]+'])) || [];
      const quoteMatches = this.text.match(cd.g.quoteRegexp) || [];
      const matches = tagMatches.concat(quoteMatches);
      this.areThereTagsAroundMultipleLines = matches.some((match) => match.includes('\n'));
      this.areThereTagsAroundListMarkup = matches.some((match) => /\n[:*#;]/.test(match));
    }

    // If the user wrapped the comment in <small></small>, remove the tags to later wrap the
    // comment together with the signature into the tags and possibly ensure the correct line
    // spacing.
    this.wrapInSmall = false;
    if (!this.commentForm.headlineInput) {
      this.text = this.text.replace(/^<small>([^]*)<\/small>$/i, (s, content) => {
        // Filter out <small>text</small><small>text</small>
        if (/<\/small>/i.test(content)) {
          return s;
        }
        this.wrapInSmall = true;
        return content;
      });
    }

    return this;
  }

  /**
   * Set the `signature` property. Also fix the code according to it.
   *
   * @returns {CommentFormInputTransformer}
   * @private
   */
  initSignatureAndFixCode() {
    if (this.commentForm.omitSignatureCheckbox?.isSelected()) {
      this.signature = '';
    } else {
      this.signature = this.commentForm.getMode() === 'edit' ?
        this.target.source.signatureCode :
        cd.g.userSignature;
    }

    // Make so that the signature doesn't turn out to be at the end of the last item of the list if
    // the comment contains one.
    if (
      this.signature &&

      // The existing signature doesn't start with a newline.
      !(this.commentForm.getMode() == 'edit' && /^[ \t]*\n/.test(this.signature)) &&

      /(^|\n)[:*#;].*$/.test(this.text)
    ) {
      this.text += '\n';
    }

    return this;
  }

  /**
   * Replace list markup (`:*#;`) with respective tags.
   *
   * @param {string} code
   * @returns {string}
   * @private
   */
  listMarkupToTags(code) {
    return this.constructor.listToTags(this.constructor.linesToLists(
      code
        .split('\n')
        .map((line) => ({
          type: '',
          text: line,
        }))
    ));
  }

  /**
   * Perform operations with code in an indented comment.
   *
   * @param {string} code
   * @param {boolean} isWrapped Is the code wrapped.
   * @param {boolean} isInTemplate
   * @returns {string}
   * @private
   */
  handleIndentedComment(code, isWrapped, isInTemplate) {
    if (!this.indentation) {
      return code;
    }

    // Remove spaces at the beginning of lines.
    code = code.replace(/^ +/gm, '');

    // Replace list markup (`:*#;`) with respective tags if otherwise layout will be broken.
    if (/^[:*#;]/m.test(code) && (isWrapped || this.restLinesIndentation === '#')) {
      if (isInTemplate) {
        // Handle cases with no newline before a parameter's content that has a list. This can give
        // rare false positives when there is simultaneously a list and a parameter starting with
        // `[:^#;]` of a different nature in a template, e.g.
        // `{{quote|link=#Section|1=* Item 1.\n* Item 2.\n}}`. Putting that parameter at the end
        // will work.
        code = code.replace(/\|(?:[^|=}]*=)?(?=[:*#;])/, '$&\n');
      }
      code = this.listMarkupToTags(code);
    }

    code = code.replace(
      // Lines with the list and table markup as well as lines wholly occupied by the file markup
      new RegExp(
        `(\\n+)([:*#;\\x03]|${this.constructor.filePatternEnd})`,
        'gmi'
      ),

      // Add indentation characters. File markup is tricky because, depending on the alignment and
      // line breaks, the result can be very different. The safest way to fight that is to use
      // indentation.
      (s, newlines, nextLine) => (
        // Newline sequences will be replaced with a paragraph template below. It could help
        // visual formatting. If there is no paragraph template, there won't be multiple newlines,
        // as they will have been removed above.
        (newlines.length > 1 ? '\n\n\n' : '\n') +

        this.constructor.prependIndentationToLine(this.restLinesIndentation, nextLine)
      )
    );

    // Add newlines before and after gallery (yes, even if the comment starts with it).
    code = code
      .replace(/(^|[^\n])(\x01\d+_gallery\x02)/g, (s, before, m) => before + '\n' + m)
      .replace(/\x01\d+_gallery\x02(?=(?:$|[^\n]))/g, (s) => s + '\n');

    // Table markup is OK only with colons as indentation characters.
    if (this.restLinesIndentation.includes('#') && code.includes('\x03')) {
      throw new CdError({
        type: 'parse',
        code: 'numberedList-table',
      });
    }

    if (this.restLinesIndentation === '#') {
      if (this.constructor.galleryRegexp.test(code)) {
        throw new CdError({
          type: 'parse',
          code: 'numberedList',
        });
      }
    }

    code = code.replace(
      // Lines following lines with the list, table, and gallery markup
      /^((?:[:*#;\x03].+|\x01\d+_gallery\x02))(\n+)(?![:#])/mg,

      // Add indentation characters
      (s, previousLine, newlines) => (
        previousLine +
        '\n' +
        this.constructor.prependIndentationToLine(
          this.restLinesIndentation,

          // Newline sequences will be replaced with a paragraph template below. If there is no
          // paragraph template, there wouldn't be multiple newlines, as they would've been removed
          // above.
          newlines.length > 1 ? '\n\n' : ''
        )
      )
    );

    // We we only check for `:` here, not other markup, because we only add `:` in those places.
    code = code.replace(
      /^(.*)\n\n+(?!:)/gm,
      cd.config.paragraphTemplates.length ?
        `$1{{${cd.config.paragraphTemplates[0]}}}\n` :
        (
          this.areThereTagsAroundMultipleLines ?
            `$1<br> \n` :
            (s, m1) => (
              m1 + '\n' + this.constructor.prependIndentationToLine(this.restLinesIndentation, '')
            )
        )
    );

    return code;
  }

  /**
   * Process newlines by adding or not adding `<br>` and keeping or not keeping the newline. `\x01`
   * and `\x02` mean the beginning and ending of sensitive code except for tables. `\x03` and `\x04`
   * mean the beginning and ending of a table. Note: This should be kept coordinated with the
   * reverse transformation code in {@link CommentSource#toInput}.
   *
   * @param {string} code
   * @param {boolean} isInTemplate
   * @returns {string} code
   */
  processNewlines(code, isInTemplate = false) {
    const entireLineRegexp = new RegExp(/^\x01\d+_(block|template)\x02 *$/);
    const entireLineFromStartRegexp = /^(=+).*\1[ \t]*$|^----/;
    const fileRegexp = new RegExp('^' + this.constructor.filePatternEnd, 'i');

    let currentLineInTemplates = '';
    let nextLineInTemplates = '';
    if (isInTemplate) {
      currentLineInTemplates = '|=';
      nextLineInTemplates = '|\\||}}';
    }
    const paragraphTemplatePattern = mw.util.escapeRegExp(`{{${cd.config.paragraphTemplates[0]}}}`);
    const currentLineEndingRegexp = new RegExp(
      `(?:<${cd.g.pniePattern}(?: [\\w ]+?=[^<>]+?| ?\\/?)>|<\\/${cd.g.pniePattern}>|\\x01\\d+_block\\x02|\\x04|<br[ \\n]*\\/?>|${paragraphTemplatePattern}${currentLineInTemplates}) *$`,
      'i'
    );
    const nextLineBeginningRegexp = new RegExp(
      `^(?:<\\/${cd.g.pniePattern}>|<${cd.g.pniePattern}${nextLineInTemplates})`,
      'i'
    );

    const newlinesRegexp = this.indentation ?
      /^(.+)\n(?![:#])(?=(.*))/gm :
      /^((?![:*#; ]).+)\n(?![\n:*#; \x03])(?=(.*))/gm;
    code = code.replace(newlinesRegexp, (s, currentLine, nextLine) => {
      // Remove if it is confirmed that this isn't happening (November 2024)
      if (this.indentation && !cd.config.paragraphTemplates.length) {
        console.error(`Convenient Discussions: Processing a newline in "${s}" which should be unreachable. You shouldn't be seeing this. If you do, please report to https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/Convenient_Discussions.`)
      }

      const lineBreakOrNot = (
        entireLineRegexp.test(currentLine) ||
        entireLineRegexp.test(nextLine) ||
        (
          !this.indentation &&
          (entireLineFromStartRegexp.test(currentLine) || entireLineFromStartRegexp.test(nextLine))
        ) ||
        fileRegexp.test(currentLine) ||
        fileRegexp.test(nextLine) ||
        this.constructor.galleryRegexp.test(currentLine) ||
        this.constructor.galleryRegexp.test(nextLine) ||

        // Removing <br>s after block elements is not a perfect solution as there would be no
        // newlines when editing such a comment, but this way we would avoid empty lines in cases
        // like `</div><br>`.
        currentLineEndingRegexp.test(currentLine) ||
        nextLineBeginningRegexp.test(nextLine)
      ) ?
        '' :
        '<br>' + (this.indentation ? ' ' : '');

      // Current line can match galleryRegexp only if the comment will not be indented.
      const newlineOrNot = this.indentation && !this.constructor.galleryRegexp.test(nextLine) ?
        '' :
        '\n';

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
    code = this.handleIndentedComment(
      code,
      isInTemplate || this.areThereTagsAroundListMarkup,
      isInTemplate
    );
    code = this.processNewlines(code, isInTemplate);
    return code;
  }

  /**
   * Make the core code transformations with all code.
   *
   * @returns {CommentFormInputTransformer}
   * @private
   */
  processAllCode() {
    this.text = this.processCode(this.text);
    return this;
  }

  /**
   * Add the headline to the code.
   *
   * @returns {CommentFormInputTransformer}
   * @private
   */
  addHeadline() {
    const headline = this.commentForm.headlineInput?.getValue().trim();
    if (!headline || (this.commentForm.isNewSectionApi() && this.action === 'submit')) {
      return this;
    }

    let level;
    if (this.commentForm.getMode() === 'addSection') {
      level = 2;
    } else if (this.commentForm.getMode() === 'addSubsection') {
      level = this.target.level + 1;
    } else {  // 'edit'
      level = this.target.source.headingLevel;
    }
    const equalSigns = '='.repeat(level);

    if (
      this.commentForm.getMode() === 'addSection' ||

      // To have pretty diffs.
      (
        this.commentForm.getMode() === 'edit' &&
        this.commentForm.getTarget().isOpeningSection &&
        /^\n/.test(this.target.source.code)
      )
    ) {
      this.text = '\n' + this.text;
    }
    this.text = `${equalSigns} ${headline} ${equalSigns}\n${this.text}`;

    return this;
  }

  /**
   * Add the signature to the code.
   *
   * @returns {CommentFormInputTransformer}
   * @private
   */
  addSignature() {
    if (!this.commentForm.omitSignatureCheckbox?.isSelected()) {
      // Remove signature tildes from the end of the comment.
      this.text = this.text.replace(/\s*~{3,}$/, '');
    }

    if (this.action === 'preview' && this.signature) {
      this.signature = `<span class="cd-commentForm-signature">${this.signature}</span>`;
    }

    // A space in the beggining of the last line, creating <pre>, or a heading.
    if (!this.indentation && /(^|\n)[ =].*$/.test(this.text)) {
      this.text += '\n';
    }

    // Remove starting spaces if the line starts with the signature.
    if (!this.text || this.text.endsWith('\n') || this.text.endsWith(' ')) {
      this.signature = this.signature.trimLeft();
    }

    // Process the small font wrappers, add the signature.
    if (this.wrapInSmall) {
      const before = /^[:*#; ]/.test(this.text) ?
        '\n' + (this.indentation ? this.restLinesIndentation : '') :
        '';
      if (cd.config.smallDivTemplates.length && !/^[:*#;]/m.test(this.text)) {
        const escapedCodeWithSignature = (
          escapePipesOutsideLinks(this.text.trim(), this.maskedTexts) +
          this.signature
        );
        this.text = `{{${cd.config.smallDivTemplates[0]}|1=${escapedCodeWithSignature}}}`;
      } else {
        this.text = `<small>${before}${this.text}${this.signature}</small>`;
      }
    } else {
      this.text += this.signature;
    }

    return this;
  }

  /**
   * Add an outdent template to the beginning of the comment.
   *
   * @returns {CommentFormInputTransformer}
   * @private
   */
  addOutdent() {
    if (this.action === 'preview' || !this.target.source?.isReplyOutdented) {
      return this;
    }

    const outdentDifference = this.target.level - this.target.source.replyIndentation.length;
    this.text = (
      `{{${cd.config.outdentTemplates[0]}|${outdentDifference}}}` +
      (/^[:*#]+/.test(this.text) ? '\n' : ' ') +
      this.text
    );

    return this;
  }

  /**
   * Add a newline to the code.
   *
   * @returns {CommentFormInputTransformer}
   * @private
   */
  addTrailingNewline() {
    if (this.commentForm.getMode() !== 'edit') {
      this.text += '\n';
    }

    return this;
  }

  /**
   * Add the indentation characters to the code.
   *
   * @returns {CommentFormInputTransformer}
   * @private
   */
  addIntentationChars() {
    // If the comment starts with a list or table, replace all asterisks in the indentation
    // characters with colons to have the comment HTML generated correctly.
    if (this.indentation && this.action !== 'preview' && /^[*#;\x03]/.test(this.text)) {
      this.indentation = this.restLinesIndentation;
    }

    if (this.action !== 'preview') {
      this.text = this.constructor.prependIndentationToLine(this.indentation, this.text);

      if (this.mode === 'addSubsection') {
        this.text += '\n';
      }
    } else if (this.action === 'preview' && this.indentation && this.initialText) {
      this.text = this.constructor.prependIndentationToLine(':', this.text);
    }

    return this;
  }

  static galleryRegexp = /^\x01\d+_gallery\x02$/m;

  static listTags = {
    ':': 'dl',
    ';': 'dl',
    '*': 'ul',
    '#': 'ol',
  };
  static itemTags = {
    ':': 'dd',
    ';': 'dt',
    '*': 'li',
    '#': 'li',
  };

  /**
   * Initialize the class.
   */
  static init() {
    this.filePatternEnd = `\\[\\[${cd.g.filePrefixPattern}.+\\]\\]$`;
  }

  /**
   * Transform line objects so that they represent lists.
   *
   * @param {object[]} lines
   * @param {boolean} [isNested=false]
   * @returns {object[]}
   * @private
   */
  static linesToLists(lines, isNested = false) {
    let list = { items: [] };
    for (let i = 0; i <= lines.length; i++) {
      if (i === lines.length) {
        if (list.type) {
          this.lineToList(lines, i, list, isNested);
        }
      } else {
        const text = lines[i].text;
        const firstChar = text[0] || '';
        const listType = this.listTags[firstChar];
        if (list.type && listType !== list.type) {
          const itemsCount = list.items.length;
          this.lineToList(lines, i, list, isNested);
          i -= itemsCount - 1;
          list = { items: [] };
        }
        if (listType) {
          list.type = listType;
          list.items.push({
            type: this.itemTags[firstChar],
            text: text.slice(1),
          });
        }
      }
    }
    return lines;
  }

  /**
   * Transform one line object, indexed `i`, so that it represents a list. Recursively do the same
   * with the lines of that list.
   *
   * @param {object[]} lines
   * @param {number} i
   * @param {object} list
   * @param {boolean} [isNested=false]
   * @private
   */
  static lineToList(lines, i, list, isNested = false) {
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
    this.linesToLists(list.items, true);
  }

  /**
   * Convert a list object to a string with HTML tags.
   *
   * @param {object[]} lines
   * @param {boolean} [isNested=false]
   * @returns {string}
   * @private
   */
  static listToTags(lines, isNested = false) {
    let text = '';
    lines.forEach((line, i) => {
      if (line.text === undefined) {
        const itemsText = line.items
          .map((item) => {
            const itemText = item.text === undefined ?
              this.listToTags(item.items, true) :
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
  }

  /**
   * Add indentation chars to the start of a line.
   *
   * @param {string} indentation
   * @param {string} line
   * @returns {string}
   */
  static prependIndentationToLine(indentation, line) {
    return (
      indentation +
      (indentation && cd.config.spaceAfterIndentationChars && !/^[:*#;]/.test(line) ? ' ' : '') +
      line
    );
  }
}

export default CommentFormInputTransformer;
