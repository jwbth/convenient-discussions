/**
 * @module defaultConfig
 */

export default {
  /**
   * Object with the names and texts of the messages required by the script as keys and values. Used
   * to avoid making additional requests on every script run. Get these messages by running
   * {@link https://commons.wikimedia.org/wiki/User:Jack_who_built_the_house/convenientDiscussions-generateBasicConfig.js}
   * in your browser's console while the page of your wiki is open.
   *
   * @type {object}
   * @default {}
   */
  messages: {},

  /**
   * Localized aliases of several special pages. Get by running
   * {@link https://commons.wikimedia.org/wiki/User:Jack_who_built_the_house/convenientDiscussions-generateBasicConfig.js}
   * in your browser's console while the page of your wiki is open.
   *
   * @type {object}
   * @default []
   */
  specialPageAliases: {},

  /**
   * Localized aliases of the `subst:` magic word. Get by running
   * {@link https://commons.wikimedia.org/wiki/User:Jack_who_built_the_house/convenientDiscussions-generateBasicConfig.js}
   * in your browser's console while the page of your wiki is open.
   *
   * @type {string[]}
   * @default []
   */
  substAliases: [],

  /**
   * Timezone. Get by running
   * {@link https://commons.wikimedia.org/wiki/User:Jack_who_built_the_house/convenientDiscussions-generateBasicConfig.js}
   * in your browser's console while the page of your wiki is open.
   *
   * @type {?string}
   * @default null
   */
  timezone: null,

  /**
   * Whether to store some of the preferences globally. Requires the
   * {@link https://www.mediawiki.org/wiki/Extension:GlobalPreferences GlobalPreferences extension}
   * to be enabled.
   *
   * @type {?boolean}
   * @default true
   */
  useGlobalPreferences: true,

  /**
   * Numbers of talk namespaces other than odd namespaces. If not set, the value of
   * `mw.config.get('wgExtraSignatureNamespaces')` will be used. For example: `[4]` for Project.
   *
   * **Warning:** This value is overriden by {@link module:defaultConfig.pageWhitelist}:
   * `customTalkNamespaces` is used only if `pageWhitelist` is `[]` or `null`.
   *
   * Note that this value is used in the script as a "soft" value. I.e., the script can decide
   * (based on the presence of the "Add section" button, existence of comments on the page and
   * possibly other factors) that the page is not a talk page after all. Use
   * {@link module:defaultConfig.pageWhitelist} to indicate pages where the script should work in any
   * circumstances. (For example, you can specify the entire namespace, e.g., `/^Wikipedia:/`).
   *
   * @type {number[]}
   * @default mw.config.get('wgExtraSignatureNamespaces')
   */
  customTalkNamespaces: mw.config.get('wgExtraSignatureNamespaces'),

  /**
   * Pages where the script should run. If `[]`, all pages in the namespaces listed in
   * {@link module:defaultConfig.customTalkNamespaces} will pass.
   *
   * **If you add at least one value, {@link module:defaultConfig.customTalkNamespaces} will not be
   * used.** This means you will probably need to specify the namespaces listed in that value here
   * as regexps, partly or entirely. For example, to specify the entire "Wikipedia" namespace in
   * this value, add `/^Wikipedia:/` to the array.
   *
   * The blacklist has priority over the whitelist.
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
   * If the user namespace uses different aliases based on gender, include them here. Unfortunately,
   * we can't get this using API, see {@link https://phabricator.wikimedia.org/T204610}.
   *
   * @type {?UserNamespacesByGender}
   * @example
   * // If only the female form differs from the standard name)
   * {
   *   female: 'Участница',
   * }
   */
  userNamespacesByGender: null,

  /**
   * If the user namespace uses different aliases based on gender, but it has an alias that is
   * gender-neutral, specify it here.
   *
   * @type {?string}
   * @example
   * // Russian Wikipedia
   * 'У'
   * @example
   * // Possible option
   * 'User'
   */
  genderNeutralUserNamespaceAlias: null,

  /**
   * Object that connects active (source) talk page names with their archive pages prefixes and vice
   * versa: archive page names with their source page names.
   *
   * @typedef {object} ArchivePathEntry
   * @property {string} source Source path. Dynamic parts should be replaced with tokens such as
   *   `$1`, `$2`, etc. Regular expressions for these tokens, if any, should be defined in the
   *   `replacements` array.
   * @property {string} archive Archive prefix. Should use the same tokens as in `source`.
   * @property {RegExp[]} [replacements] Array of replacements for `$1`, `$2` tokens in
   *   `source` and `archive`. Note that the regexp should, if put into the `archive` pattern,
   *   capture only the part that is common for the source page and the archive page<u>s</u>. E.g.,
   *   in "Wikipedia:Village pump/Archive/General/2020/07", it should capture "General", but not
   *   "General/2020/07". So, you shouldn't use `/.+/` here and use, for example, `/[^/]+/` instead.
   */

  /**
   * Collection of archive paths, (sometimes) with correspondent source pages paths. It is used in
   * multiple purposes:
   * - to identify pages that will be considered inactive, i.e. no replies can be left on them;
   * - to suggest to search in the archive if the section/comment by a given fragment is not found
   *   on the page;
   * - to make diff/thank links work on archive pages.
   *
   * Each of the array elements can be an object with defined structure (see
   * {@link ArchivePathEntry} for details) or a regexp. In the latter case, if a page name matches
   * the regexp, it will be considered an archive page, and the name of the source page for that
   * page will be obtained by removing everything that starts with the pattern in the page name
   * (i.e., the actually used regexp will end with `.*`).
   *
   * The entries are applied in the order of their presence in the array. So, if a page name fits
   * two patterns, the one closer to the beginning of the array is used.
   *
   * @type {Array.<ArchivePathEntry|RegExp>}
   * @default []
   * @example
   * [
   *   {
   *     source: 'Wikipedia:Village pump/Geography',
   *     archive: 'Wikipedia:Village pump/Geography/Archives/',
   *   },
   *   {
   *     source: 'Wikipedia:Village pump/$1',
   *     archive: 'Wikipedia:Village pump/Archive/$1/',
   *     replacements: [/[^/]+/],
   *   },
   *   /\/Archive/,
   * ]
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
   * (`'mimic'` mode), or should the script use the default indentation character in
   * {@link module:defaultConfig.defaultIndentationChar} in all cases (`'unify'` mode). Note that if
   * the last comment of the section uses `#` as the first indentation character, the script will
   * use it for the comment independent of this value.
   *
   * @type {'mimic'|'unify'}
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
   * End the regexp with `$`.
   *
   * `'` is removed independently in the script so that normal markup at the end of comments doesn't
   * get removed - like this:
   * ```html
   * ''Reply in italics.'' [signature]
   * ```
   * Here, `''` is not a part of the signature.
   *
   * `(?:\s[-–−—―]+\xa0?[A-Z][A-Za-z-_]*)?` is for cases like
   * {@link https://en.wikipedia.org/?diff=1033395227}.
   *
   * @type {RegExp}
   * @default
   * /(?:\s[-–−—―]+\xa0?[A-Z][A-Za-z-_]*)?(?:\s+>+)?(?:[·•\-‑–−—―─~⁓/→⇒\s\u200e\u200f]|&amp;\w+;|&amp;#\d+;)*$/
   */
  signaturePrefixRegexp: /(?:\s[-–−—―]+\xa0?[A-Z][A-Za-z-_]*)?(?:\s+>+)?(?:[·•\-‑–−—―─~⁓/→⇒\s\u200e\u200f]|&\w+;|&#\d+;)*(?:\s+\()?$/,

  /**
   * Unchangable text (usually a user talk page link) at the end of Mediawiki:Signature (visible
   * text, not wikitext). Used to detect comments where the user has forgotten the forth tilde.
   * Don't set if this string is not unique enough (i.e. can be met at the end of regular comments.)
   *
   * Should end with `$`.
   *
   * @type {?RegExp}
   * @default null
   * @example / \(talk\)$/
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
   * Script code name. Used, for example, for the `source` parameter of the thank request:
   * {@link https://www.mediawiki.org/wiki/Extension:Thanks#API_documentation}.
   *
   * @type {string}
   * @default 'convenient-discussions'
   */
  scriptCodeName: 'convenient-discussions',

  /**
   * Wikilink to the script's page. Used in the watchlist and, if there is no
   * {@link module:defaultConfig.tagName tag}, in summary.
   *
   * @type {string}
   * @default 'c:User:JWBTH/CD'
   */
  scriptPageWikilink: 'c:Special:MyLanguage/User:JWBTH/CD',

  /**
   * Name of the hook to fire with author link wrappers after reformatting comments. Used to run
   * scripts such as "Mark administrators" and "Mark blocked users" for those links.
   *
   * It's advisable to create a distinct hook for parsing userlinks, such as `'global.userlinks'`.
   * Using the `'wikipage.content'` hook could theoretically disrupt code that needs to process the
   * whole page content if it runs later than CD. But typically CD runs relatively late.
   *
   * @type {string}
   * @default 'wikipage.content'
   */
  hookToFireWithAuthorWrappers: 'wikipage.content',

  /**
   * Names of the templates that are analogs of
   * {@link https://en.wikipedia.org/wiki/Template:Unsigned},
   * {@link https://en.wikipedia.org/wiki/Template:Unsigned_IP}. Please include aliases.
   *
   * @type {string[]}
   * @default [
   *   'unsigned',
   *   'unsignedIP',
   *   'unsigned2',
   *   'unsignedIP2',
   * ]
   */
  unsignedTemplates: [
    'unsigned',
    'unsignedIP',
    'unsigned2',
    'unsignedIP2',
  ],

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
   * @default [
   *   [],
   *   [],
   * ]
   */
  pairQuoteTemplates: [
    [],
    [],
  ],

  /**
   * Name of the templates that are analogs of
   * {@link https://en.wikipedia.org/wiki/Template:Smalldiv}. Used when the whole comment is wrapped
   * in `<small></small>` (with some exceptions when that could break the layout).
   *
   * @type {string[]}
   * @default []
   */
  smallDivTemplates: [],

  /**
   * Names of the templates that are analogs of
   * {@link https://en.wikipedia.org/wiki/Template:Paragraph_break}. The first string will be used
   * when posting comments.
   *
   * @type {string[]}
   * @default []
   */
  paragraphTemplates: [],

  /**
   * Names of the templates that are analogs of
   * {@link https://en.wikipedia.org/wiki/Template:Outdent}. The first string _may_ be used when
   * posting comments if this feature is implemented.
   *
   * @type {string[]}
   * @default []
   */
  outdentTemplates: [],

  /**
   * Name of the class that the outdent templates set to its container element.
   *
   * @type {string}
   */
  outdentClass: 'outdent-template',

  /**
   * Names of the templates that are analogs of
   * {@link https://en.wikipedia.org/wiki/Template:Clear}.
   *
   * @type {string[]}
   */
  clearTemplates: [],

  /**
   * Character used to trigger user mention (ping) autocomplete.
   *
   * @type {string}
   */
  mentionCharacter: '@',

  /**
   * Should there be a leading space (or other punctuation) before
   * {@link module:defaultConfig.mentionCharacter the mention character} to trigger autocomplete.
   *
   * @type {boolean}
   */
  mentionRequiresLeadingSpace: true,

  /**
   * Object specifying quote formatting for singleline and multiline quotes.
   *
   * @typedef {object} QuoteFormatting
   * @property {string[]} singleline Starting and ending strings for singleline quotes.
   * @property {string[]} multiline Starting and ending strings for multiline quotes.
   */

  /**
   * Array of two strings to insert before and after the selection when quote function is activated
   * (by the toolbar button or Ctrl+Alt+Q / Q). If you add template markup, you might want to use
   * `1=` before the parameter content to allow the `=` character inside a quotation, for example
   * `['{{tq|1=', '}}']`.
   *
   * @type {string[]|QuoteFormatting}
   * @default ["> ''", "''\n"]
   */
  quoteFormatting: ["> ''", "''"],

  /**
   * Blocks with classes listed here wont't be considered legit comment timestamp containers. They
   * can still be parts of comments; for the way to prevent certain elements from becoming comment
   * parts, see {@link module:defaultConfig.checkForCustomForeignComponents}. This value can have a
   * wikitext counterpart (although it may not be necessary),
   * {@link module:defaultConfig.templatesToExclude}, for classes that are specified inside
   * templates.
   *
   * When it comes to the wikitext, all lines containing these classes are ignored.
   *
   * @type {string[]}
   * @default ['cd-moveMark']
   */
  elementsToExcludeClasses: ['cd-moveMark'],

  /**
   * Blocks with templates listed here won't be considered legit comment timestamp containers. All
   * lines containing these templates are ignored when searching for timestamps in the wikitext.
   * This value can have a web page counterpart,
   * {@link module:defaultConfig.elementsToExcludeClasses}.
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
   * Regexps for strings that should be cut out of comment beginnings (not considered parts of them)
   * when editing comments. This is in addition to
   * {@link convenientDiscussions.g.BAD_COMMENT_BEGINNINGS}. They begin with `^` and usually end
   * with ` *\n+` or ` *\n+(?=[*:#])`. They _should_ match a newline character at the end for the
   * script to work properly.
   *
   * @type {RegExp[]}
   * @default []
   * @example
   * [
   *   // But comments are cut out of comment beginnings by default, so you won't need to specify it.
   *   /^<!--[^]*?--> *\n+/,
   * ]
   */
  customBadCommentBeginnings: [],

  /**
   * Regexps for strings that should be kept in section endings when adding a reply or subsection
   * (so that this reply or subsection is added _before_ them, not after). Should begin with at
   * least one `\n` and allow a newline character at the end (for example, by using `\s*`).
   *
   * @type {RegExp[]}
   * @default [
   *   /\n{2,}(?:&lt;!--[^]*?--&gt;\s*)+$/,
   *   /\n+(?:&lt;!--[^]*?--&gt;\s*)*&lt;\/?(?:section|onlyinclude)(?: [\w ]+(?:=[^&lt;&gt;]+?)?)? *\/?&gt;\s*(?:&lt;!--[^]*?--&gt;\s*)*$/i,
   *   /\n+&lt;noinclude&gt;([^]*?)&lt;\/noinclude&gt;\s*$/i,
   * ]
   */
  keepInSectionEnding: [
    /\n{2,}(?:<!--[^]*?-->\s*)+$/,
    /\n+(?:<!--[^]*?-->\s*)*<\/?(?:section|onlyinclude)(?: [\w ]+(?:=[^<>]+?)?)? *\/?>\s*(?:<!--[^]*?-->\s*)*$/i,
    /\n+<noinclude>([^]*?)<\/noinclude>\s*$/i,
  ],

  /**
   * How many displayed (not wikitext) characters to go back from a timestamp looking for an author
   * link.
   *
   * @type {number}
   * @default 100
   */
  signatureScanLimit: 100,

  /**
   * Classes of elements that should be ignored when extracting headline text.
   *
   * @type {string[]}
   * @default []
   */
  foreignElementInHeadlineClasses: [],

  /**
   * Names of the closed discussion templates. They can be single templates like
   * {@link https://en.wikipedia.org/wiki/Template:Closed} or pair templates like
   * {@link https://ru.wikipedia.org/wiki/Template:Закрыто} /
   * {@link https://ru.wikipedia.org/wiki/Template:Конец_закрытой_секции}. Include the closing part
   * of the pair templates in the second array, and the rest of the templates in the first array.
   * These templates are ignored when searching for a place to insert a comment in the wikitext.
   *
   * @type {Array.<Array.<string>>}
   * @default [
   *   [],
   *   [],
   * ]
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
  customUnhighlightableElementClasses: [],

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
   * String to be put into a regular expression for matching indentation characters. The start of
   * the pattern will match the beginning of a line (but `^` will be prepended automatically). The
   * first group should contain indentation characters, the second - characters after them (usually
   * spacing).
   *
   * @type {?string}
   * @default '([:*#]+)( *)'
   */
  indentationCharsPattern: '([:*#]+)( *)',

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
   * @property {'notice'|'error'|'warning'|'success'} [type='notice'] The value is one of
   *   {@link https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/OO.ui.MessageWidget-cfg-type OO.ui.MessageWidget}'s
   *   types.
   * @property {Function} [checkFunc] If this function returns `false`, no message is displayed.
   */

  /**
   * Custom {@link Reaction reactions}.
   *
   * @type {Reaction[]}
   * @default []
   */
  customTextReactions: [],

  /**
   * @typedef {object} Module
   * @property {string} name Name of the module.
   * @property {Function} [checkFunc] Function that must return `true` for the module to be loaded
   *   (if it is present).
   */

  /**
   * Load these modules on comment form creation. See {@link Module} for the object structure. If
   * `checkFunc` is set, the module will be loaded if the condition is met.
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
   * @param {import('./CommentForm').default} commentForm
   * @returns {string}
   * @default null
   */
  preTransformCode: null,

  /**
   * Function that makes custom alterations to the comment code after it is processed and before it
   * is submitted. (An example would be adding a closer template to all the closures by a user with
   * the closer flag which is a requirement in Russian Wikipedia.) See also
   * {@link module:defaultConfig.preTransformCode}.
   *
   * @type {?Function}
   * @kind function
   * @param {string} code
   * @param {import('./CommentForm').default} commentForm
   * @returns {string}
   * @default null
   */
  postTransformCode: null,

  /**
   * Function that returns `true` for nodes that are not parts of comments and should terminate the
   * comment part collecting. These rules often need correspoding rules in
   * {@link module:defaultConfig.customBadCommentBeginnings}.
   *
   * The second parameter is a "context", i.e., a collection of classes, functions, and other
   * properties that perform the tasks we need in the current context (window or worker). Examples
   * are the name of the child elements property (the worker context uses `childElements` instead of
   * `children`) and the document element. Contexts are predefined in the script like
   * {@link https://github.com/jwbth/convenient-discussions/blob/c6b177bce7588949b46e0e8d52c5e0f4e76cb3ee/src/js/processPage.js#L885
   * this}.
   *
   * @type {?Function}
   * @kind function
   * @param {Node|external:Node} node
   * @param {import('./../src/js/Parser').Context} context
   * @returns {boolean}
   * @default null
   */
  checkForCustomForeignComponents: null,

  /**
   * Function that runs when the "Reformat comments" setting is enabled before parsing the author
   * link. May return some data that will eventually supplied to the
   * {@link module:defaultConfig.afterAuthorLinkParse} function (for example, an element). It
   * accepts the author link (a link to the author's user page) as it was encountered on the page.
   *
   * This function, together with {@link module:defaultConfig.afterAuthorLinkParse}, can be used to
   * optimize the script's performance with different kinds of "Mark administrators" gadget. See the
   * example at
   * {@link https://commons.wikimedia.org/wiki/User:Jack_who_built_the_house/convenientDiscussions-commonsConfig.js}.
   *
   * @type {?Function}
   * @kind function
   * @param {Element} authorLink
   * @returns {*}
   * @default null
   */
  beforeAuthorLinkParse: null,

  /**
   * Function that runs when the "Reformat comments" setting is enabled after parsing the author
   * link. May return (for example, an element). It accepts the author link (a link to the author's
   * user page) as it was encountered on the page and the return value of
   * {@link module:defaultConfig.beforeAuthorLinkParse} that could be called previously.
   *
   * This function, together with {@link module:defaultConfig.beforeAuthorLinkParse}, can be used to
   * optimize the script's performance with different kinds of "Mark administrators" gadget. See the
   * example at
   * {@link https://commons.wikimedia.org/wiki/User:Jack_who_built_the_house/convenientDiscussions-commonsConfig.js}.
   *
   * @type {?Function}
   * @kind function
   * @param {Element} authorLink
   * @param {*} data
   * @returns {Element}
   * @default null
   */
  afterAuthorLinkParse: null,

  /**
   * Function that returns `true` if new topics are placed on top of the page.
   *
   * @type {?Function}
   * @kind function
   * @param {string} title
   * @param {string} code
   * @returns {?boolean}
   * @default null
   */
  areNewTopicsOnTop: null,

  /**
   * Function that returns the code to insert in the place of a section moved to another page. The
   * string normally ends with `\n`. If `null`, the section is just removed from the page.
   *
   * @type {?Function}
   * @kind function
   * @param {string} targetPageWikilink
   * @param {string} signature
   * @param {string} [timestamp]
   * @returns {string}
   * @default function (targetPageWikilink, signature, timestamp) {
   *   return (
   *     convenientDiscussions.s('move-sourcepagecode', targetPageWikilink, signature, timestamp) +
   *     '\n'
   *   );
   * }
   */
  getMoveSourcePageCode: function (targetPageWikilink, signature, timestamp) {
    return (
      '<div class="cd-moveMark">' +
      convenientDiscussions.s('move-sourcepagecode', targetPageWikilink, signature, timestamp) +
      '</div>\n'
    );
  },

  /**
   * Function that returns the code to insert in the beginning of the section moved from another
   * page _or_ an array of two strings to insert in the beginning and ending of the section
   * respectively. The strings normally end with `\n`. If `null`, no code will be added.
   *
   * @type {?Function}
   * @kind function
   * @param {string} targetPageWikilink
   * @param {string} signature
   * @returns {string|Array.<string, string>}
   * @default function (targetPageWikilink, signature) {
   *   return convenientDiscussions.s('move-targetpagecode', targetPageWikilink, signature) + '\n';
   * }
   */
  getMoveTargetPageCode: function (targetPageWikilink, signature) {
    return (
      '<div class="cd-moveMark">' +
      convenientDiscussions.s('move-targetpagecode', targetPageWikilink, signature) +
      '</div>\n'
    );
  },

  /**
   * Code that creates an anchor on the page.
   *
   * @type {Function}
   * @kind function
   * @param {string} id
   * @returns {string}
   * @default function (id) {
   *   return '&lt;span id="' + id + '"&gt;&lt;/span&gt;';
   * }
   */
  getAnchorCode: function (id) {
    return '<span id="' + id + '"></span>';
  },
};
