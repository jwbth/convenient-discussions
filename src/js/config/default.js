/**
 * @module config/default
 */

export default {
  /**
   * Object with names and texts of messages as keys and values. Used to avoid making an additional
   * request. Get these messages by running
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
   * (only timezone abbreviatures are needed).
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
   * Numbers of talk namespaces other than odd namespaces if different from the value of
   * `mw.config.get('wgExtraSignatureNamespaces')`. For example: `[4]` for Project.
   *
   * @type {number[]}
   * @default []
   */
  customTalkNamespaces: mw.config.get('wgExtraSignatureNamespaces'),

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
   * @type {RegExp}
   * @default
   */
  signaturePrefixRegexp: /(?:\s+>+)?(?:·|-|–|—|~|\/|→|⇒|\s|&mdash;|&ndash;|&rarr;|&middot;|&nbsp;|&#32;)*'*$/,

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
   * @type {?string}
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
   * @default 'meta:User:JWBTH/CD'
   */
  helpWikilink: 'meta:User:JWBTH/CD',

  /**
   * Names of the templates that are analogs of {@link
   * https://en.wikipedia.org/wiki/Template:Unsigned}, {@link
   * https://en.wikipedia.org/wiki/Template:Unsigned_IP} on sites where they are not substituted. If
   * they are, they are not needed to be added. Please include aliases.
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
   * parts, see {@link module:config/default.customForeignComponentChecker}. When it comes to the
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
   * with `\n+`.
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
   * Function that deletes foreign text from the comment text. It may be the "(talk)" part of the
   * signatures (usually signatures are removed automatically, but there are exceptions). This helps
   * to compare the text on the web page and the text in the source more accurately.
   *
   * @type {?function(string): string}
   * @default null
   */
  cleanUpCommentText: null,

  /**
   * Function that generates an archive prefix without an ending slash for a given page title. It is
   * used for a feature that suggests to search in the archive if a section by the given fragment is
   * not found on the page. If null, the page title is used as an archive prefix.
   *
   * @type {?function(string): string}
   */
  getArchivePrefix: null,

  /**
   * Custom function to execute when a topic/comment specified in the fragment part of the URL is
   * not found. Takes a decoded fragment and a boolean indicating if the fragment is a comment
   * anchor.
   *
   * @type {?function(string, boolean): undefined}
   * @default null
   */
  customSectionNotFoundHandler: null,

  /**
   * Function that transforms an automatically generated summary text.
   *
   * @type {?function(string): string}
   * @default null
   */
  summaryTransformer: null,

  /**
   * Function that makes alterations to the comment code before it is sent. (An example would be
   * adding a closer template to all the closures by a user with the closer flag which is a
   * requirement in Russian Wikipedia.)
   *
   * @type {?function(string, CommentForm): string}
   * @default null
   */
  customCodeTransformations: null,

  /**
   * Function with code that will run before the page is parsed.
   *
   * @type {?function(): undefined}
   * @default null
   */
  customBeforeParse: null,

  /**
   * Function that returns `true` for nodes that are not parts of comments and should terminate
   * comment part collecting. These rules often need correspoding rules in {@link
   * module:config/default.customBadCommentBeginnings}.
   *
   * The second parameter is a "context", i.e., a collection of classes, functions, and other
   * properties that perform the tasks we need in the current context (window or worker).
   *
   * @type {?function(Node, object): boolean}
   * @default null
   */
  customForeignComponentChecker: null,

  /**
   * Function that should return `true` if new topics are placed on top of the page. The first
   * parameter is the title, the second is the code.
   *
   * @type {?function(string, string): boolean}
   * @default null
   */
  areNewTopicsOnTop: null,
};
