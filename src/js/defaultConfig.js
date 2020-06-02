/**
 * @module defaultConfig
 */

import cd from './cd';

export default {
  /**
   * Object with the names and texts of the messages required by the script as keys and values. Used to
   * avoid making additional requests. Get these messages by running
   * ```
   * new mw.Api().loadMessages(messageNames, { amlang: mw.config.get('wgContentLanguage') });
   * ```
   * (take messageNames from {@link module:dateFormat.loadMessages}) and
   * ```
   * new mw.Api().loadMessages(undefined, {
   *   amlang: mw.config.get('wgContentLanguage'),
   *   amincludelocal: 1,
   *   amfilter: 'timezone-',
   * });
   * ```
   * (only timezone abbreviations are needed).
   *
   * @type {object}
   * @default {}
   */
  messages: {},

  /**
   * Contributions page wikilink as appears in IP users' signatures.
   *
   * @type {?string}
   * @default null
   */
  contribsPage: null,

  /**
   * Local timezone offset in minutes. Get by a {@link https://www.mediawiki.org/wiki/API:Siteinfo}
   * request.
   *
   * @type {?number}
   * @default null
   */
  localTimezoneOffset: null,

  /**
   * Numbers of talk namespaces other than odd namespaces. If not set, the value of
   * `mw.config.get('wgExtraSignatureNamespaces')` will be used, excluding the 0th (article)
   * namespace. For example: `[4]` for Project.
   *
   * @type {number[]}
   * @default null
   */
  customTalkNamespaces: null,

  /**
   * Pages in the custom talk namespaces other than odd namespaces where the script should work. If
   * null, all pages will pass.
   *
   * @type {?RegExp}
   * @default null
   */
  pageWhiteListRegexp: null,

  /**
   * Pages where the script shouldn't run.
   *
   * @type {?RegExp}
   * @default null
   */
  pageBlackListRegexp: null,

  /**
   * Pages that match this pattern will be considered inactive, i.e. no replies can be left on such
   * pages.
   *
   * @type {?RegExp}
   * @default null
   */
  archivePathRegexp: null,

  /**
   * Pages that can never have archives on a subpage (page with a subtitle after "/"). If a section
   * specified in the URL fragment will not be found, a error message will suggest to search in
   * archives if the page name doesn't match this regexp.
   *
   * @type {?RegExp}
   */
  pagesWithoutArchivesRegexp: null,

  /**
   * Fragments that shouldn't trigger the "Section not found" dialog.
   *
   * @type {string[]}
   * @default []
   */
  idleFragments: [],

  /**
   * Character that should directly precede the comment text. Normally, `':'` or `'*'`. `'#'` is
   * used automatically in votings.
   *
   * @type {string}
   * @default ':'
   */
  defaultIndentationChar: ':',

  /**
   * Whether to put a space between the indentation char and the comment text.
   *
   * @type {boolean}
   * @default true
   */
  spaceAfterIndentationChar: true,

  /**
   * `'` is in the end alone so that normal markup in the end of comments doesn't get removed - like
   * this:
   * ```
   * ''Reply in italics.'' ~~~~
   * ```
   * Here, `''` is not a part of the signature.
   *
   * End the regexp with "$".
   *
   * @type {RegExp}
   * @default
   */
  signaturePrefixRegexp: /(?:\s+>+)?(?:·|-|–|—|―|~|\/|→|⇒|\s|&mdash;|&ndash;|&rarr;|&middot;|&nbsp;|&#32;)*'*$/,

  /**
   * Unchangable text (usually user talk page link) at the end of Mediawiki:Signature (visible text,
   * not wikitext). End the regexp with "$".
   *
   * @type {?RegExp}
   * @default null
   */
  signatureEndingRegexp: null,

  /**
   * Convenient Discussions tag according to Special:Tags. Needs to be added manually. Set to null
   * of there is no tag.
   *
   * @type {?string}
   * @default null
   */
  tagName: null,

  /**
   * Script code name. For example, for the `source` parameter of the thank request: {@link
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
   * Script help wikilink. Used in the watchlist and, if there is no tag, in summary.
   *
   * @type {string}
   * @default 'commons:User:JWBTH/CD'
   */
  helpWikilink: 'commons:User:JWBTH/CD',

  /**
   * Names of the templates that are analogs of {@link
   * https://en.wikipedia.org/wiki/Template:Unsigned}, {@link
   * https://en.wikipedia.org/wiki/Template:Unsigned_IP} **on sites where they are not
   * substituted**. If they are, they are not needed to be added. Please include aliases.
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
   * Quote templates that have a beginning and an ending template, like `{{Quote begin}}{{Quote
   * end}}`. So, this is an array of two string arrays.
   *
   * @type {string[]}
   * @default []
   */
  pairQuoteTemplates: [],

  /**
   * Name of the template that is an analog of {@link
   * https://ru.wikipedia.org/wiki/Шаблон:Block-small} / {@link
   * https://en.wikipedia.org/wiki/Template:Smalldiv}. Used for the "In small font" checkbox (with
   * some exceptions where `<small></small>` is used).
   *
   * @type {?string}
   * @default null
   */
  blockSmallTemplate: null,

  /**
   * Names of the templates that are analogs of {@link https://ru.wikipedia.org/wiki/Шаблон:Абзац}.
   * The first string will be used when posting comments.
   *
   * @type {string[]}
   * @default []
   */
  paragraphTemplates: [],

  /**
   * Name of a template that is an analog of {@link
   * https://en.wikipedia.org/wiki/Template:Reply_to}.
   *
   * @type {string}
   * @default 'ping'
   */
  pingTemplate: 'ping',

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
   * can still be parts of comments; for a way to prevent certain elements from becoming comment
   * parts, see {@link module:defaultConfig.customForeignComponentChecker}. When it comes to the
   * wikitext, all lines containing these classes are ignored.
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
   * @type {string[]}
   * @default []
   */
  commentAntipatterns: [],

  /**
   * Regexps for strings that should be cut out of comment beginnings (not considered parts of
   * them). This is in an addition to {@link module:staticGlobals.BAD_COMMENT_BEGINNINGS}. They
   * begin with `^` and usually end with ` *\n*` or ` *\n*(?=[*:#])`.
   *
   * @type {RegExp[]}
   * @default []
   */
  customBadCommentBeginnings: [],

  /**
   * Regexps for strings that should be kept in the section endings when adding a reply or
   * subsection (so that this reply or subsection is added _before_ them, not after). Usually begin
   * with `\n+`. The default value will keep HTML comments in the section endings.
   *
   * @type {RegExp[]}
   * @default <pre class="prettyprint source"><code>[
   *   /\n+(?:&lt;!--[^]*?--&gt;\s*)+$/,
   * ]</code></pre>
   */
  keepInSectionEnding: [
    /\n+(?:<!--[^]*?-->\s*)+$/,
  ],

  /**
   * How many displayed characters to go back from a timestamp looking for an author link.
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
   * `cd.g.specialElements.floating` to help performance.
   *
   * @type {string[]}
   * @default []
   */
  customFloatingElementsSelectors: [],

  /**
   * Classes of elements that are wrapped around closed discussions.
   *
   * @type {string[]}
   * @default []
   */
  closedDiscussionsClasses: [],

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
   * Default collection of insert buttons displayed under the text input in comment forms.
   *
   * @type {Array.<string|Array>}
   * @default <pre class="prettyprint source"><code>[
   *   ['{{ping|+}}'],
   *   ['{{tl|+}}'],
   *   ['{{+}}'],
   *   ['[[+]]'],
   *   ['&lt;+>&lt;/&gt;', '&lt;/&gt;'],
   *   ['&lt;blockquote&gt;+&lt;/blockquote&gt;', '&lt;blockquote /&gt;'],
   *   ['&lt;code&gt;+&lt;/code&gt;', '&lt;code /&gt;'],
   *   ['&lt;nowiki&gt;+&lt;/nowiki&gt;', '&lt;nowiki /&gt;'],
   *   ['&lt;syntaxhighlight lang="+"&gt;&lt;/syntaxhighlight&gt;', '&lt;syntaxhighlight /&gt;'],
   *   ['&lt;small&gt;+&lt;/small&gt;', '&lt;small /&gt;'],
   * ]</code></pre>
   */
  defaultInsertButtons: [
    ['{{ping|+}}'],
    ['{{tl|+}}'],
    ['{{+}}'],
    ['[[+]]'],
    ['<+></>', '</>'],
    ['<blockquote>+</blockquote>', '<blockquote />'],
    ['<code>+</code>', '<code />'],
    ['<nowiki>+</nowiki>', '<nowiki />'],
    ['<syntaxhighlight lang="+"></syntaxhighlight>', '<syntaxhighlight />'],
    ['<small>+</small>', '<small />'],
  ],

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
   * Comment having how many characters should be considered long. Comments having more characters
   * will need confirmation to be sent.
   *
   * @type {number}
   * @default 10000
   */
  longCommentThreshold: 10000,

  /**
   * How many bytes need to be added to the page to deem an edit a new comment.
   *
   * @type {number}
   * @default 50
   */
  bytesToDeemComment: 50,

  /**
   * How long a comment can be to put its whole context in the edit summary.
   *
   * @type {number}
   * @default 50
   */
  summaryCommentTextLengthLimit: 50,

  /**
   * Regular expression matching names of pages where an sending empty comment shouldn't be
   * confirmed.
   *
   * @type {?RegExp}
   * @default null
   */
  noConfirmPostEmptyCommentPageRegexp: null,

  /**
   * String to be put into a regular expression for matching indentation characters. Default:
   * `\\n*([:*#]+) *`.
   *
   * @type {?string}
   * @default null
   */
  customIndentationCharsPattern: null,

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
   * Reaction, i.e. an object specifying messages to be displayed when the user enters text that
   * matches a pattern.
   *
   * @typedef {object[]} Reaction
   * @property {RegExp} pattern
   * @property {string} message
   * @property {string} class
   * @property {string} [type='notice'] For example, `notice`.
   * @property {Function} [checkFunc] If the function returns false, no message is displayed.
   */

  /**
   * Custom reactions.
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
   * Load these modules on comment form creation, optionally if the condition specified inside the
   * `checkFunc` function is met.
   *
   * @type {Module[]}
   * @default []
   */
  customCommentFormModules: [],

  /**
   * Default type of comment link when copying. `'diff'`, `'wikilink'`, or `'link'`. You may use
   * `'wikilink'` if there is a code in your wiki that makes wikilinks work for all users.
   *
   * @type {string}
   * @default 'diff'
   */
  defaultCommentLinkType: 'diff',

  /**
   * Whether to show a placeholder in a comment input.
   *
   * If gender is needed to output the comment input placeholder, it could be better to set the
   * value to `true` to avoid displaying the placeholder altogether (a gender request would need
   * time to proceed hampering user experience).
   *
   * @type {boolean}
   * @default false
   */
  commentInputEmptyPlaceholder: false,

  /**
   * Function that generates an archive prefix without an ending slash for a given page title. It is
   * used for the feature that suggests to search in the archive if the section by the given
   * fragment is not found on the page. If `null`, the page title is used as an archive prefix.
   *
   * @type {?Function}
   * @kind function
   * @param {string} pageTitle
   * @returns {string}
   */
  getArchivePrefix: null,

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
   * Function that makes alterations to the comment code before it is sent. (An example would be
   * adding a closer template to all the closures by a user with the closer flag which is a
   * requirement in Russian Wikipedia.)
   *
   * @type {?Function}
   * @kind function
   * @param {string} code
   * @param {CommentForm} commentForm
   * @returns {string}
   * @default null
   */
  customCodeTransformations: null,

  /**
   * Function with code that will run before the page is parsed.
   *
   * @type {?Function}
   * @kind function
   * @default null
   */
  customBeforeParse: null,

  /**
   * Function that returns `true` for nodes that are not parts of comments and should terminate
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
  customForeignComponentChecker: null,

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
   */
  getMoveSourcePageCode: function (targetPageWikilink, signature, timestamp) {
    return cd.s('move-sourcepagecode', targetPageWikilink, signature, timestamp);
  },

  /**
   * Function that returns the code to insert in the beginning of the section moved from another
   * page. If `null`, no code will be added.
   *
   * @type {?Function}
   * @kind function
   * @param {string} targetPageWikilink
   * @param {string} signature
   * @returns {string}
   */
  getMoveTargetPageCode: function (targetPageWikilink, signature) {
    return cd.s('move-targetpagecode', targetPageWikilink, signature);
  },
};
