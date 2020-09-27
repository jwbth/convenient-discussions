/**
 * @module defaultConfig
 */

export default {
  /**
   * Object with the names and texts of the messages required by the script as keys and values. Used
   * to avoid making additional requests on every script run. Get these messages by running {@link
   * https://commons.wikimedia.org/wiki/User:Jack_who_built_the_house/convenientDiscussions-generateBasicConfig.js}
   * in your browser's console while the page of your wiki is open.
   *
   * @type {object}
   * @default {}
   */
  messages: {},

  /**
   * Contributions page wikilink as it appears in IP users' signatures (for example,
   * `Special:Contributions` for English Wikipedia).
   *
   * @type {?string}
   * @default null
   */
  contribsPage: null,

  /**
   * Local timezone offset in minutes. Get by running {@link
   * https://commons.wikimedia.org/wiki/User:Jack_who_built_the_house/convenientDiscussions-generateBasicConfig.js}
   * in your browser's console while the page of your wiki is open. Leave `null` if your wiki uses
   * daylight saving time (summer time).
   *
   * @type {?number}
   * @default null
   */
  localTimezoneOffset: null,

  /**
   * Numbers of talk namespaces other than odd namespaces. If not set, the value of
   * `mw.config.get('wgExtraSignatureNamespaces')` will be used. For example: `[4]` for Project.
   *
   * **Warning:** This value is overriden by {@link module:defaultConfig.pageWhitelist}:
   * `customTalkNamespaces` is used only if `pageWhitelist` is `[]` or `null`.
   *
   * Note that this value is used in the script as a "soft" value. I.e., the script can decide
   * (based on the presence of the "Add section" button, existence of comments on the page and
   * possibly other factors) that the page is not a talk page after all. Use {@link
   * module:defaultConfig.pageWhitelist} to indicate pages where the script should work in any
   * circumstances. (For example, you can specify the entire namespace, e.g., `/^Wikipedia:/`).
   *
   * @type {number[]}
   * @default mw.config.get('wgExtraSignatureNamespaces')
   */
  customTalkNamespaces: mw.config.get('wgExtraSignatureNamespaces'),

  /**
   * Pages where the script should run. If `[]`, all pages in the {@link
   * module:defaultConfig.customTalkNamespaces} namespaces will pass. If you add at least one value,
   * {@link module:defaultConfig.customTalkNamespaces} will not be used. In this case, you may
   * specify entire namespaces in this value, e.g., /^Wikipedia:/. The blacklist has priority over
   * the whitelist.
   *
   * @type {RegExp[]}
   * @default []
   */
  pageWhitelist: [],

  /**
   * Pages where the script shouldn't run. The blacklist has priority over the whitelist.
   *
   * @type {RegExp[]}
   * @default []
   */
  pageBlacklist: [],

  /**
   * @typedef {object} UserNamespacesByGender
   * @property {string} male
   * @property {string} female
   * @property {string} unknown
   */

  /**
   * If the user namespace uses different aliases based on gender, you may include them here.
   * Unfortunately, we can't get this using API, see {@link
   * https://phabricator.wikimedia.org/T204610}.
   *
   * Example (if only the female form differs from the standard name):
   * <pre class="prettyprint source"><code>{
   *   female: 'Участница',
   * }</code></pre>
   *
   * @type {?UserNamespacesByGender}
   */
  userNamespacesByGender: null,

  /**
   * Object that connects active (source) talk page names with their archive pages prefixes and vice
   * versa: archive page names with their source page names.
   *
   * @typedef {object} ArchivePathEntry
   * @property {string} source Source path. Dynamic parts should be replaced with tokens such as
   *   `$1`, `$2` etc. Regular expressions for these tokens, if any, should be defined in the
   *   `replacements` array.
   * @property {string} archive Archive prefix. Should use the same tokens as in `source`.
   * @property {RegExp[]|undefined} replacements Array of replacements for `$1`, `$2` tokens in
   *   `source` and `archive`. Note that the regexp should, if put into the `archive` pattern,
   *   capture only the part that is common for the source page and the archive page<u>s</u>. E.g.,
   *   in "Wikipedia:Discussion/Archive/General/2020/07", it should capture "General", but not
   *   "General/2020/07". So, you shouldn't use `/.+/` here and use, for example, `/[^/]+/` instead.
   */

  /**
   * Collection of archive paths, (sometimes) with correspondent source pages paths. It is used in
   * multiple purposes:
   * - to identify pages that will be considered inactive, i.e. no replies can be left on them;
   * - to suggest to search in the archive if the section/comment by a given fragment is not found
   * on the page;
   * - to make diff/thank links work on archive pages.
   *
   * Each of the array elements can be an object with the defined structure (see {@link
   * module:defaultConfig~ArchivePathEntry} for details) or a regexp. In the latter case, if a page
   * name matches the regexp, it will be considered an archive page, and the name of the source page
   * for that page will be obtained by removing everything that starts with the pattern in the page
   * name (i.e., the actually used regexp will end with `.*`).
   *
   * The entries are applied in the order of their presence in the array. So, if a page name fits
   * two patterns, the one closer to the beginning of the array is used.
   *
   * Example:
   * <pre class="prettyprint source"><code>[
   *   {
   *     source: 'Wikipedia:Discussion/Geography',
   *     archive: 'Wikipedia:Discussion/Geography/Archives/',
   *   },
   *   {
   *     source: 'Wikipedia:Discussion/$1',
   *     archive: 'Wikipedia:Discussion/Archive/$1/',
   *     replacements: [/[^/]+/],
   *   },
   *   /\/Archive/,
   * ]</code></pre>
   *
   *
   * @type {Array.<ArchivePathEntry|RegExp>}
   * @default []
   */
  archivePaths: [],

  /**
   * Pages that can never have archives on a subpage (a subpage is a page with a subtitle after
   * "/"). If the section specified in the URL fragment will not be found, an error message will
   * suggest to search in the archives if the page name doesn't match one of these regexps.
   *
   * @type {RegExp[]}
   * @default []
   */
  pagesWithoutArchives: [],

  /**
   * Fragments that shouldn't trigger the "Section not found" dialog.
   *
   * @type {string[]}
   * @default []
   */
  idleFragments: [],

  /**
   * Character that should directly precede the comment text. Normally, `':'` or `'*'`. In votings,
   * `'#'` is used automatically.
   *
   * @type {string}
   * @default ':'
   */
  defaultIndentationChar: ':',

  /**
   * Whether to put a space between the indentation chars and the comment text.
   *
   * @type {boolean}
   * @default true
   */
  spaceAfterIndentationChars: true,

  /**
   * Should a new comment at the first level repeat the previous comment's indentation style
   * (`'mimic'` mode), or should the script use the default indentation char in {@link
   * module:defaultConfig.checkForCustomForeignComponents} in all cases (`'unify'` mode). Note that
   * if the last comment of the section uses `#` as the first indentation character, the script will
   * use it for the comment independent of this value.
   *
   * @type {string}
   */
  indentationCharMode: 'mimic',

  /**
   * Signature prefix (the text added before the signature) used by default, including a space at
   * the beginning if it is needed.
   *
   * @type {string}
   */
  defaultSignaturePrefix: ' ',

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
  signaturePrefixRegexp: /(?:\s+>+)?(?:[·•\-–—―~/→⇒\s]|&mdash;|&ndash;|&rarr;|&middot;|&nbsp;|&#32;)*\(?'*$/,

  /**
   * Unchangable text (usually user talk page link) at the end of Mediawiki:Signature (visible text,
   * not wikitext). Used to detect comments where the user has forgotten the forth tilde. For
   * example: `/ \(talk\)$/`. End the regexp with `$`.
   *
   * @type {?RegExp}
   * @default null
   */
  signatureEndingRegexp: null,

  /**
   * Convenient Discussions tag according to Special:Tags. Needs to be added manually. Set to `null`
   * of there is no tag.
   *
   * @type {?string}
   * @default null
   */
  tagName: null,

  /**
   * Script code name. Used, for example, for the `source` parameter of the thank request: {@link
   * https://www.mediawiki.org/wiki/Extension:Thanks#API_documentation}.
   *
   * @type {string}
   * @default 'convenient-discussions'
   */
  scriptCodeName: 'convenient-discussions',

  /**
   * Prefix for the script options saved to the MediaWiki server in addition to the standard
   * `userjs-`.
   *
   * @type {string}
   * @default 'convenientDiscussions'
   */
  optionsPrefix: 'convenientDiscussions',

  /**
   * Wikilink to the script's page. Used in the watchlist and, if there is no {@link
   * module:defaultConfig.tagName tag}, in summary.
   *
   * @type {string}
   * @default 'c:User:JWBTH/CD'
   */
  scriptPageWikilink: 'c:User:JWBTH/CD',

  /**
   * Names of the templates that are analogs of {@link
   * https://en.wikipedia.org/wiki/Template:Unsigned}, {@link
   * https://en.wikipedia.org/wiki/Template:Unsigned_IP} **on sites where they are not
   * substituted**. If they are, don't add them. Please include aliases.
   *
   * @type {string[]}
   * @default []
   */
  unsignedTemplates: [],

  /**
   * Name of the class that the unsigned templates set to its container element.
   *
   * @type {string}
   */
  unsignedClass: 'autosigned',

  /**
   * There are quote template pairs where there is a beginning template and an ending template, like
   * `{{Quote begin}}{{Quote end}}`. So, this is an array of two arrays of strings: the first one
   * for beginning templates, the second one for ending templates.
   *
   * @type {Array.<Array.<string>>}
   * @default <pre class="prettyprint source"><code>[
   *   [],
   *   [],
   * ]</code></pre>
   */
  pairQuoteTemplates: [
    [],
    [],
  ],

  /**
   * Name of the template that is an analog of {@link
   * https://en.wikipedia.org/wiki/Template:Smalldiv}. Used when the whole comment is wrapped in
   * `<small></small>` (with some exceptions when that could break the layout).
   *
   * @type {?string}
   * @default null
   */
  smallDivTemplate: null,

  /**
   * Names of the templates that are analogs of {@link
   * https://en.wikipedia.org/wiki/Template:Paragraph_break}. The first string will be used when
   * posting comments.
   *
   * @type {string[]}
   * @default []
   */
  paragraphTemplates: [],

  /**
   * Character used for user mentions (pings).
   *
   * @type {string}
   */
  mentionCharacter: '@',

  /**
   * Array of two strings to insert before and after the selection when quote function is activated
   * (by the toolbar button or Ctrl+Alt+Q / Q).
   *
   * @type {string[]}
   * @default ["> ''", "''\n"]
   */
  quoteFormatting: ["> ''", "''\n"],

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
  elementsToExcludeClasses: [],

  /**
   * Blocks with templates listed here won't be considered legit comment timestamp containers. All
   * lines containing these templates are ignored when searching for timestamps in the wikitext.
   *
   * @type {string[]}
   * @default []
   */
  templatesToExclude: [],

  /**
   * All lines containing these patterns will be ignored when searching for comments in the
   * wikitext.
   *
   * @type {RegExp[]}
   * @default []
   */
  commentAntipatterns: [],

  /**
   * Regexps for strings that should be cut out of comment beginnings (not considered parts of
   * them). This is in addition to {@link module:cd~convenientDiscussions.g.BAD_COMMENT_BEGINNINGS}.
   * They begin with `^` and usually end with ` *\n*` or ` *\n*(?=[*:#])`.
   *
   * @type {RegExp[]}
   * @default []
   */
  customBadCommentBeginnings: [],

  /**
   * Regexps for strings that should be kept in section endings when adding a reply or subsection
   * (so that this reply or subsection is added _before_ them, not after). Should begin with at
   * least one `\n`. The default value will keep HTML comments placed after an empty line in section
   * endings.
   *
   * @type {RegExp[]}
   * @default <pre class="prettyprint source"><code>[
   *   /\n{2,}(?:&lt;!--[^]*?--&gt;\s*)+$/,
   * ]</code></pre>
   */
  keepInSectionEnding: [
    /\n{2,}(?:<!--[^]*?-->\s*)+$/,
  ],

  /**
   * How many displayed (not wikitext) characters to go back from a timestamp looking for an author
   * link.
   *
   * @type {number}
   * @default 80
   */
  signatureScanLimit: 80,

  /**
   * Classes of elements that should be ignored when extracting headline text.
   *
   * @type {string[]}
   * @default []
   */
  foreignElementsInHeadlinesClasses: [],

  /**
   * Selectors of floating elements. This is needed to display the comment's underlay and overlay
   * correctly. You can also add the `cd-floating` class to such elements. You can also add the
   * `cd-ignoreFloating` class to floating elements that never intersect comments but end up in
   * `convenientDiscussions.g.specialElements.floating` to help performance.
   *
   * @type {string[]}
   * @default []
   */
  customFloatingElementsSelectors: [],

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
  closedDiscussionTemplates: [
    [],
    [],
  ],

  /**
   * Classes of elements that are wrapped around closed discussions.
   *
   * @type {string[]}
   * @default []
   */
  closedDiscussionClasses: [],

  /**
   * Classes of elements that shouldn't be highlighted.
   *
   * @type {string[]}
   * @default []
   */
  customUnhighlightableElementsClasses: [],

  /**
   * Selectors of links (buttons) that are used to add topics on this wiki.
   *
   * @type {string[]}
   * @default []
   */
  customAddTopicLinkSelectors: [],

  /**
   * Default collection of insert buttons displayed under the comment input in comment forms.
   *
   * @type {Array.<string|Array>}
   * @default []
   */
  defaultInsertButtons: [],

  /**
   * Data url of the script logo.
   *
   * @type {string}
   * @default
   * 'data:image/png;base64,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'
   */
  logoDataUrl: 'data:image/png;base64,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',

  /**
   * Width of the logo.
   *
   * @type {string}
   * @default '324px'
   */
  logoWidth: '324px',

  /**
   * Height of the logo.
   *
   * @type {string}
   * @default '40px'
   */
  logoHeight: '40px',

  /**
   * How many characters should a comment have to be considered long. Comments having more
   * characters will need confirmation to be sent.
   *
   * @type {number}
   * @default 10000
   */
  longCommentThreshold: 10000,

  /**
   * Lower limit of the number of bytes to be added to the page to deem an edit a new comment.
   *
   * @type {number}
   * @default 50
   */
  bytesToDeemComment: 50,

  /**
   * Upper limit of the length of a comment to put its whole content in the edit summary.
   *
   * @type {number}
   * @default 50
   */
  summaryCommentTextLengthLimit: 50,

  /**
   * Regular expression matching the names of the pages where an sending empty comment shouldn't be
   * confirmed (e.g., voting pages).
   *
   * @type {?RegExp}
   * @default null
   */
  noConfirmPostEmptyCommentPageRegexp: null,

  /**
   * String to be put into a regular expression for matching indentation characters.
   *
   * @type {?string}
   * @default '\\n*([:*#]*) *'
   */
  indentationCharsPattern: '\\n*([:*#]*) *',

  /**
   * Strings present in edit summaries of undo/revert edits. Used to detect edits that shouldn't be
   * considered comments on log pages (watchlist, contributions, history). Displayed text, not
   * wikitext. Take from MediaWiki:Undo-summary, MediaWiki:Revertpage.
   *
   * @type {string[]}
   * @default []
   */
  undoTexts: [],

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
   * Custom {@link module:defaultConfig~Reaction reactions}.
   *
   * @type {Reaction[]}
   * @default []
   */
  customTextReactions: [],

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
  customCommentFormModules: [],

  /**
   * Function that transforms the automatically generated summary text.
   *
   * @type {?Function}
   * @kind function
   * @param {string} summary
   * @returns {string}
   * @default null
   */
  transformSummary: null,

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
  preTransformCode: null,

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
  postTransformCode: null,

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
  checkForCustomForeignComponents: null,

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
  areNewTopicsOnTop: null,

  /**
   * Function that returns the code to insert in the place of a section moved to another page. If
   * `null`, the section is just removed from the page.
   *
   * @type {?Function}
   * @kind function
   * @param {string} targetPageWikilink
   * @param {string} signature
   * @param {string} [timestamp]
   * @returns {string}
   * @default <pre class="prettyprint source">
   * <code>function (targetPageWikilink, signature, timestamp) {
   *   return (
   *     convenientDiscussions.s('move-sourcepagecode', targetPageWikilink, signature, timestamp) +
   *     '\n'
   *   );
   * }
   * </code></pre>
   */
  getMoveSourcePageCode: function (targetPageWikilink, signature, timestamp) {
    return (
      convenientDiscussions.s('move-sourcepagecode', targetPageWikilink, signature, timestamp) +
      '\n'
    );
  },

  /**
   * Function that returns the code to insert in the beginning of the section moved from another
   * page *or* an array of two strings to insert in the beginning and the ending of the section
   * respectively. If `null`, no code will be added.
   *
   * @type {?Function}
   * @kind function
   * @param {string} targetPageWikilink
   * @param {string} signature
   * @returns {string|Array<string, string>}
   * @default <pre class="prettyprint source"><code>function (targetPageWikilink, signature) {
   *   return convenientDiscussions.s('move-targetpagecode', targetPageWikilink, signature) + '\n';
   * }</code></pre>
   */
  getMoveTargetPageCode: function (targetPageWikilink, signature) {
    return convenientDiscussions.s('move-targetpagecode', targetPageWikilink, signature) + '\n';
  },

  /**
   * Code that creates an anchor on the page.
   *
   * @type {Function}
   * @kind function
   * @param {string} anchor
   * @returns {string}
   * @default <pre class="prettyprint source"><code>function (anchor) {
   *   return '&lt;span id="' + anchor + '>&lt;/span>';
   * }</code></pre>
   */
  getAnchorCode: function (anchor) {
    return '<span id="' + anchor + '></span>';
  },
};
