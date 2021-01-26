/* Convenient Discussion configuration.
 * Convenient Discussion created by [[User:Jack who built the house]].
 * Not yet desided values still have their Javadoc.
 *
 * @module defaultConfig
 */

export default {
  messages: {
    'sun': "א'",
    'mon': "ב'",
    'tue': "ג'",
    'wed': "ד'",
    'thu': "ה'",
    'fri': "ו'",
    'sat': "ש'",
    'sunday': "יום א'",
    'monday': "יום ב'",
    'tuesday': "יום ג'",
    'wednesday': "יום ד'",
    'thursday': "יום ה'",
    'friday': "יום ו',",
    'saturday': "שבת",
    'jan': "ינו'",
    'feb': "פבר'",
    'mar': "מרץ",
    'apr': "אפר'",
    'may': "מאי",
    'jun': "יוני",
    'jul': "יולי",
    'aug': "אוג'",
    'sep': "ספט'",
    'oct': "אוקט'",
    'nov': "נוב'",
    'dec': "דצמ'",
    'january': 'ינואר',
    'february': 'פברואר',
    'march': 'מרץ',
    'april': 'אפריל',
    'may_long': 'מאי',
    'june': 'יוני',
    'july': 'יולי',
    'august': 'אוגוסט',
    'september': 'ספטמבר',
    'october': 'אוקטובר',
    'november': 'נובמבר',
    'december': 'דצמבר',
    'january-gen': 'בינואר',
    'february-gen': 'בפברואר',
    'march-gen': 'במרץ',
    'april-gen': 'באפריל',
    'may-gen': 'במאי',
    'june-gen': 'ביוני',
    'july-gen': 'ביולי',
    'august-gen': 'באוגוסט',
    'september-gen': 'בספטמבר',
    'october-gen': 'באוקטובר',
    'november-gen': 'בנובמבר',
    'december-gen': 'בדצמבר',
    'parentheses': '($1)',
    'parentheses-start': '(',
    'parentheses-end': ')',
    'word-separator': ' ',
    'comma-separator': ', ',
    'colon-separator': ':',
  },

  contribsPage: 'מיוחד:תרומות',

  localTimezoneOffset: null,

  customTalkNamespaces: [4],

  pageWhitelist: null,

  pageBlacklist: [/\/פתיח/],

  archivePaths: [/\/ארכיון/],

  pagesWithoutArchives: [],

  idleFragments: [],

  defaultIndentationChar: ':',

  spaceAfterIndentationChars: true,

  indentationCharMode: 'mimic',

  /**
   * Text that is removed from the end of the comment text and transferred to the beginning of the
   * signature text when editing a comment.
   *
   * `'` is in the end alone so that normal markup in the end of comments doesn't get removed - like
   * this:
   * ```
   * ''Reply in italics.'' [signature]
   * ```
   * Here, `''` is not a part of the signature.
   *
   * End the regexp with `$`.
   *
   * @type {RegExp}
   * @default /(?:\s+>+)?(?:[·•\-–—―~/→⇒\s]|&amp;mdash;|&amp;ndash;|&amp;rarr;|&amp;middot;|&amp;nbsp;|&amp;#32;)*\(?'*$/
   */
  // signaturePrefixRegexp: /(?:\s+>+)?(?:[·•\-–—―~/→⇒\s]|&mdash;|&ndash;|&rarr;|&middot;|&nbsp;|&#32;)*\(?'*$/,

  /**
   * Unchangable text (usually user talk page link) at the end of Mediawiki:Signature (visible text,
   * not wikitext). End the regexp with `$`.
   *
   * @type {?RegExp}
   * @default null
   */
  // signatureEndingRegexp: null,

  tagName: 'דיונים נוחים',

  /**
   * Script code name. Used, for example, for the `source` parameter of the thank request: {@link
   * https://www.mediawiki.org/wiki/Extension:Thanks#API_documentation}.
   *
   * @type {string}
   * @default 'convenient-discussions'
   */
  // scriptCodeName: 'convenient-discussions',

  /**
   * Prefix for the script options saved to the MediaWiki server in addition to the standard
   * `userjs-`.
   *
   * @type {string}
   * @default 'convenientDiscussions'
   */
  // optionsPrefix: 'convenientDiscussions',

  /**
   * Wikilink to the script's page. Used in the watchlist and, if there is no tag, in summary.
   *
   * @type {string}
   * @default 'c:User:JWBTH/CD'
   */
  // scriptPageWikilink: 'c:User:JWBTH/CD',

  unsignedTemplates: ['לא חתם', 'שכח לחתום', 'אלמ'],

  /**
   * Name of the class that the unsigned templates set to its container element.
   *
   * @type {string}
   */
  unsignedClass: 'autosigned',

  // pairQuoteTemplates: [
  //  [],
  //  [],
  // ],

  smallDivTemplates: [],

  paragraphTemplates: ['ש'],

  quoteFormatting: ["{{ציטוטון|1=", "}}\n"],

  /**
   * Blocks with classes listed here wont't be considered legit comment timestamp containers. They
   * can still be parts of comments; for the way to prevent certain elements from becoming comment
   * parts, see {@link module:defaultConfig.checkForCustomForeignComponents}.
   *
   * When it comes to the wikitext, all lines containing these classes are ignored.
   *
   * @type {string[]}
   * @default []
   */
  // elementsToExcludeClasses: [],

  templatesToExclude: [],

  /**
   * All lines containing these patterns will be ignored when searching for comments in the
   * wikitext.
   *
   * @type {RegExp[]}
   * @default []
   */
  // commentAntipatterns: [],

  /**
   * Regexps for strings that should be cut out of comment beginnings (not considered parts of
   * them). This is in addition to {@link module:cd~convenientDiscussions.g.BAD_COMMENT_BEGINNINGS}.
   * They begin with `^` and usually end with ` *\n*` or ` *\n*(?=[*:#])`.
   *
   * @type {RegExp[]}
   * @default []
   */
  // customBadCommentBeginnings: [],

   /**
   * Regexps for strings that should be kept in the section endings when adding a reply or
   * subsection (so that this reply or subsection is added _before_ them, not after). Usually begin
   * with `\n+`. The default value will keep HTML comments placed after an empty line in the section
   * endings.
   *
   * @type {RegExp[]}
   * @default <pre class="prettyprint source"><code>[
   *   /\n{2,}(?:&lt;!--[^]*?--&gt;\s*)+$/,
   * ]</code></pre>
   */
  // keepInSectionEnding: [
  //  /\n{2,}(?:<!--[^]*?-->\s*)+$/,
  // ],

  signatureScanLimit: 127,

  /**
   * Classes of elements that should be ignored when extracting headline text.
   *
   * @type {string[]}
   * @default []
   */
  // foreignElementsInHeadlinesClasses: [],

  /**
   * Selectors of floating elements. This is needed to display the comment's underlay and overlay
   * correctly. You can also add the `cd-floating` class to such elements. You can also add the
   * `cd-ignoreFloating` class to floating elements that never intersect comments but end up in
   * `convenientDiscussions.g.floatingElements` to help performance.
   *
   * @type {string[]}
   * @default []
   */
  // customFloatingElementSelectors: [],

  /**
   * Names of the closed discussion templates. They can be single templates like {@link
   * https://en.wikipedia.org/wiki/Template:Closed} or pair templates like {@link
   * https://ru.wikipedia.org/wiki/Template:Закрыто} / {@link
   * https://ru.wikipedia.org/wiki/Template:Конец_закрытой_секции}. Include the closing part of the
   * pair templates in the second array, and the rest of the templates in the first array. These
   * templates are ignored when searching for a place to insert a comment in the wikitext.
   *
   * @type {Array.<Array.<string>>}
   * @default <pre class="prettyprint source"><code>[
   *   [],
   *   [],
   * ]</code></pre>
   */
  // closedDiscussionTemplates: [
  //   [],
  //   [],
  // ],

  /**
   * Classes of elements that are wrapped around closed discussions.
   *
   * @type {string[]}
   * @default []
   */
  // closedDiscussionClasses: [],

  /**
   * Classes of elements that shouldn't be highlighted.
   *
   * @type {string[]}
   * @default []
   */
  // customUnhighlightableElementClasses: [],

  /**
   * Selectors of links (buttons) that are used to add topics on this wiki.
   *
   * @type {string[]}
   * @default []
   */
  // customAddTopicLinkSelectors: [],

  defaultInsertButtons: [
    ['{{א|' + '+}}'],
    ['{{תב|+}}'],
    ['{{+}}'],
    ['[[+]]'],
    ['{{ציטוטון|+}}'],
    ['{{בעד}} +'],
    ['{{נגד}} +'],
    ['{{בעלי ידע|+}}'],
    ['{{אלמ}}+'],
    ['{{לא חתם|+}}'],
    ['{{שכח לחתום|+}}'],
    ['{{ש}}+'],
    ['{{לפני התנגשות}} +'],
    ['{{אחרי התנגשות}} +'],
    ['{{תודה רבה}}+'],
    ['{{בוצע}}+'],
    ['{{טופל}}+'],
    ['<code>+</code>', '<code />'],
    ['<nowiki>+</nowiki>', '<nowiki />'],
    ['<' + 'syntaxhighlight lang="+"></syntaxhighlight>', '<' + 'syntaxhighlight />'],
    ['<small>+</small>', '<small />'],
  ],

  /**
   * Data url of the script logo.
   *
   * @type {string}
   * @default
   * 'data:image/png;base64,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'
   */
  // logoDataUrl: 'data:image/png;base64,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',

  // logoWidth: '324px',

  // logoHeight: '40px',

  /**
   * How many characters should a comment have to be considered long. Comments having more
   * characters will need confirmation to be sent.
   *
   * @type {number}
   * @default 10000
   */
  // longCommentThreshold: 10000,

  /**
   * Lower limit of the number of bytes to be added to the page to deem an edit a new comment.
   *
   * @type {number}
   * @default 50
   */
  // bytesToDeemComment: 50,

  /**
   * Upper limit of the length of a comment to put its whole content in the edit summary.
   *
   * @type {number}
   * @default 50
   */
  // summaryCommentTextLengthLimit: 50,

  /**
   * Regular expression matching the names of the pages where an sending empty comment shouldn't be
   * confirmed (e.g., voting pages).
   *
   * @type {?RegExp}
   * @default null
   */
  // noConfirmPostEmptyCommentPageRegexp: null,

  /**
   * String to be put into a regular expression for matching indentation characters.
   *
   * @type {?string}
   * @default '\\n*([:*#]*) *'
   */
  // indentationCharsPattern: '\\n*([:*#]*) *',

  undoTexts: ['ביטול', 'בוטל', 'שחזור', 'שוחזר'],

  /**
   * Object specifying messages to be displayed when the user enters text that matches a pattern.
   *
   * @typedef {object} Reaction
   * @property {RegExp} pattern Pattern to match.
   * @property {string} message Message displayed to the user.
   * @property {string} name Latin letters, digits, `-`.
   * @property {string} [type='notice'] For example, `notice`.
   * @property {Function} [checkFunc] If the function returns false, no message is displayed.
   */

  /**
   * Custom reactions.
   *
   * @type {Reaction[]}
   * @default []
   */
  // customTextReactions: [],

  /**
   * @typedef {object} Module
   * @property {string} name Name of the module.
   * @property {Function} [checkFunc] Function that must return true for the module to be loaded (if
   *   it is present).
   */

  /**
   * Load these modules on comment form creation. See {@link module:defaultConfig~Module} for the
   * object structure. If `checkFunc` is set, the module will be loaded if the condition is met.
   *
   * @type {Module[]}
   * @default []
   */
  // customCommentFormModules: [],

  /**
   * Function that transforms the automatically generated summary text.
   *
   * @type {?Function}
   * @kind function
   * @param {string} summary
   * @returns {string}
   * @default null
   */
  // transformSummary: null,

  /**
   * Function that makes custom alterations to the comment code before it is processed and
   * submitted. See also {@link module:defaultConfig.postTransformCode}.
   *
   * @type {?Function}
   * @kind function
   * @param {string} code
   * @param {CommentForm} commentForm
   * @returns {string}
   * @default null
   */
  // preTransformCode: null,

  /**
   * Function that makes custom alterations to the comment code after it is processed and before it
   * is submitted. (An example would be adding a closer template to all the closures by a user with
   * the closer flag which is a requirement in Russian Wikipedia.) See also {@link
   * module:defaultConfig.preTransformCode}.
   *
   * @type {?Function}
   * @kind function
   * @param {string} code
   * @param {CommentForm} commentForm
   * @returns {string}
   * @default null
   */
  // postTransformCode: null,

  /**
   * Function that returns `true` for nodes that are not parts of comments and should terminate the
   * comment part collecting. These rules often need correspoding rules in {@link
   * module:defaultConfig.customBadCommentBeginnings}.
   *
   * The second parameter is a "context", i.e., a collection of classes, functions, and other
   * properties that perform the tasks we need in the current context (window or worker).
   *
   * @type {?Function}
   * @kind function
   * @param {Node} node
   * @param {object} context
   * @returns {boolean}
   * @default null
   */
  // checkForCustomForeignComponents: null,

  /**
   * Function that returns `true` if new topics are placed on top of the page.
   *
   * @type {?Function}
   * @kind function
   * @param {string} title
   * @param {string} code
   * @returns {boolean}
   * @default null
   */
  // areNewTopicsOnTop: null,

  getMoveSourcePageCode: function (targetPageWikilink, signature, timestamp) {
    return `{{הועבר|ל=${targetPageWikilink}} ${signature}\n`;
  },

  getMoveTargetPageCode: function (targetPageWikilink, signature) {
    return [`{{הועבר|מ=${targetPageWikilink}} ${signature}\n`,
            `{{הועבר|סוף}} ${signature}\n`];
  },

  /**
   * Code that creates an anchor on the page.
   *
   * @param {string} anchor
   * @returns {string}
   * @default <pre class="prettyprint source"><code>function (anchor) {
   *   return '&lt;span id="' + anchor + '>&lt;/span>';
   * }</code></pre>
   */
  // getAnchorCode: function (anchor) {
  //   return '<span id="' + anchor + '></span>';
  // },
};
