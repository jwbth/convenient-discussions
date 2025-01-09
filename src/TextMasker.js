import { generateTagsRegexp } from './utils-wikitext';

/**
 * Class for replacing parts of a text that shouldn't be modified, with a placeholder, in order to
 * ignore it when performing certain text replacement operations and then replace the placeholders
 * back with the original text.
 *
 * After creating an instance and masking some text using {@link TextMasker#mask} or its derivative
 * methods like {@link TextMasker#maskTemplatesRecursively}, there are two ways to use this class
 * based on your needs:
 * 1. Use {@link TextMasker#withText} to make further transformations to the text, unmask it using
 *    {@link TextMasker#unmask} (as opposed to {@link TextMasker#unmaskText}), and get the result
 *    using {@link TextMasker#getText}.
 * 2. Get the text using {@link TextMasker#getText}, work with it, and in the end, unmask it using
 *    {@link TextMasker#unmaskText}.
 *
 * Note that the methods support chaining, so you can sometimes successfully fit all transformations
 * in one chain.
 */
class TextMasker {
  /**
   * Create a text masker.
   *
   * @param {string} text
   * @param {string[]} [maskedTexts] Array of masked texts to reuse. Use this when you are using the
   *   class with a string that already has masked parts, or you will run into problems.
   */
  constructor(text, maskedTexts) {
    /**
     * Text parts of which are masked.
     *
     * @type {string}
     */
    this.text = text;

    /**
     * Array of masked texts. Its indexes correspond to marker indexes.
     *
     * @type {string[]}
     */
    this.maskedTexts = maskedTexts || [];
  }

  /**
   * Replace text matched by a regexp with placeholders.
   *
   * @param {RegExp} regexp
   * @param {string} [type] Should consist only of alphanumeric characters.
   * @param {boolean} [useGroups=false] Use the first two capturing groups in the regexp as the
   *   `preText` and `textToMask` parameters. (Used for processing table code.)
   * @returns {this}
   */
  mask(regexp, type, useGroups = false) {
    if (type && !type.match(/^\w+$/)) {
      console.warn('TextMasker.mask: the `type` argument should match `^\\w+$/`. Proceeding nevertheless.');
    }

    this.text = this.text.replace(regexp, (s, preText, textToMask) => {
      if (!useGroups) {
        preText = null;
        textToMask = null;
      }

      // Handle tables separately.
      return (
        (preText || '') +
        (type === 'table' ? '\x03' : '\x01') +
        this.maskedTexts.push(textToMask || s) +
        (type ? '_' + type : '') +
        (type === 'table' ? '\x04' : '\x02')
      );
    });
    return this;
  }

  /**
   * In a provided string, replace placeholders added by {@link TextMasker#mask} with their text.
   *
   * @param {string} text
   * @param {string} [type]
   * @returns {string}
   */
  unmaskText(text, type) {
    const regexp = type ?
      new RegExp(`(?:\\x01|\\x03)(\\d+)(?:_${type}(?:_\\d+)?)?(?:\\x02|\\x04)`, 'g') :
      /(?:\x01|\x03)(\d+)(?:_\w+)?(?:\x02|\x04)/g;
    while (regexp.test(text)) {
      text = text.replace(regexp, (s, num) => this.maskedTexts[num - 1]);
    }
    return text;
  }

  /**
   * Replace placeholders added by {@link TextMasker#mask} with their text.
   *
   * @param {string} [type]
   * @returns {this}
   */
  unmask(type) {
    this.text = this.unmaskText(this.text, type);
    return this;
  }

  /**
   * Mask templates taking into account nested ones.
   *
   * Borrowed from
   * https://ru.wikipedia.org/w/index.php?title=MediaWiki:Gadget-wikificator.js&oldid=102530721
   *
   * @param {(code: string) => string} [handler] Function that processes the template code.
   * @param {boolean} [addLengths=false] Add lengths of the masked templates to markers.
   * @returns {this}
   * @author Putnik
   * @author Jack who built the house
   */
  maskTemplatesRecursively(handler, addLengths = false) {
    let pos = 0;
    const stack = [];
    while (true) {
      let left = this.text.indexOf('{{', pos);
      let right = this.text.indexOf('}}', pos);

      if (left !== -1 && left < right) {
        // Memorize the wrapper's start position; will search the wrapped next
        stack.push(left);
        pos = left + 2;
      } else {
        // Nothing more found _inside_ the wrapper; time to go up the hierarchy

        // Get back to the wrapper
        let stackLeft = stack.pop();

        // No wrappers left - we're at the outermost level
        if (stackLeft === undefined) break;

        // Handle unclosed `{{` and unopened `}}`
        if (typeof stackLeft === 'undefined') {
          if (right === -1) {
            pos += 2;
            continue;
          } else {
            stackLeft = 0;
          }
        }
        if (right === -1) {
          right = this.text.length;
        }

        // Mask the template
        right += 2;
        let template = this.text.substring(stackLeft, right);
        if (handler) {
          template = handler(template);
        }
        const lengthOrNot = addLengths ?
          '_' + template.replace(/\x01\d+_template_(\d+)\x02/g, (m, n) => ' '.repeat(n)).length :
          '';
        this.text = (
          this.text.substring(0, stackLeft) +
          '\x01' +
          this.maskedTexts.push(template) +
          '_template' +
          lengthOrNot +
          '\x02' +
          this.text.substr(right)
        );

        // Synchronize the position
        pos = right - template.length;
      }
    }

    return this;
  }

  /**
   * Mask HTML tags in the text.
   *
   * @param {string[]} tags
   * @param {string} type
   * @returns {this}
   */
  maskTags(tags, type) {
    return this.mask(generateTagsRegexp(tags), type);
  }

  /**
   * Replace code, that should not be modified when processing it, with placeholders.
   *
   * @param {(code: string) => string} [templateHandler]
   * @returns {this}
   */
  maskSensitiveCode(templateHandler) {
    return this
      .maskTags(['pre', 'source', 'syntaxhighlight'], 'block')
      .maskTags(['gallery', 'poem'], 'gallery')
      .maskTags(['nowiki'], 'inline')
      .maskTemplatesRecursively(templateHandler)
      .mask(/^(:* *)(\{\|[^]*?\n\|\})/gm, 'table', true)

      // Tables with a signature inside that are clipped on comment editing.
      .mask(/^(:* *)(\{\|[^]*\n\|)/gm, 'table', true);
  }

  /**
   * Run a certain function for the text.
   *
   * @param {(text: string, masker: this) => string} func
   * @returns {this}
   */
  withText(func) {
    this.text = func(this.text, this);

    return this;
  }

  /**
   * Get the text in its current (masked/unmasked) state.
   *
   * @returns {string}
   */
  getText() {
    return this.text;
  }

  /**
   * Get the masked texts.
   *
   * @returns {string[]}
   */
  getMaskedTexts() {
    return this.maskedTexts;
  }
}

export default TextMasker;
