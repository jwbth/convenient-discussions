/**
 * Module with the {@link convenientDiscussions.g} properties that depend on neither the wiki nor the
 * page, so that tests can have them without the loader.
 *
 * @module baseGlobals
 */

/**
 * Create the {@link convenientDiscussions.g} properties that depend on neither the wiki nor the
 * page. The arrays and objects are new on each call, because `initPatterns()` extends some of them
 * in place.
 *
 * @returns The properties, typed by inference.
 */
export function createBaseGlobals() {
	return {
		/**
		 * Number of milliseconds in a minute.
		 *
		 * @memberof convenientDiscussions.g
		 */
		msInMin: /** @type {const} */ (60_000),

		/**
		 * Number of milliseconds in a day.
		 *
		 * @memberof convenientDiscussions.g
		 */
		msInDay: /** @type {const} */ (86_400_000),

		/**
		 * Popular elements that can be met in page content and don't have the `display: inline` property
		 * in the default browser styles.
		 *
		 * @type {string[]}
		 * @memberof convenientDiscussions.g
		 */
		popularNotInlineElements: [
			'BLOCKQUOTE',
			'CAPTION',
			'CENTER',
			'DD',
			'DIV',
			'DL',
			'DT',
			'FIGURE',
			'FIGCAPTION',
			'FORM',
			'H1',
			'H2',
			'H3',
			'H4',
			'H5',
			'H6',
			'HR',
			'INPUT',
			'LI',
			'LINK',
			'META',
			'OL',
			'P',
			'PRE',
			'SECTION',
			'STYLE',
			'TABLE',
			'TBODY',
			'TD',
			'TEXTAREA',
			'TFOOT',
			'TH',
			'THEAD',
			'TR',
			'UL',
			'WIKI-CHART',
		],

		/**
		 * Popular elements that can be met in page content and do have the `display: inline` property in
		 * the default browser styles.
		 *
		 * @type {string[]}
		 * @memberof convenientDiscussions.g
		 */
		popularInlineElements: [
			'A',
			'ABBR',
			'B',
			'BDI',
			'BIG',
			'BR',
			'BUTTON',
			'CITE',
			'CODE',
			'DEL',
			'EM',
			'FONT',
			'I',
			'IMG',
			'INS',
			'KBD',
			'MARK',
			'MW:DT-TIMESTAMPLINK',
			'Q',
			'RT',
			'RP',
			'RUBY',
			'S',
			'SAMP',
			'SMALL',
			'SPAN',
			'STRIKE',
			'STRONG',
			'SUB',
			'SUP',
			'SVG',
			'TIME',
			'TT',
			'U',
			'VAR',
		],

		/**
		 * @typedef {typeof import('../../config/default').default} DefaultConfig
		 */

		/**
		 * Elements with classes listed here won't be considered legit comment timestamp containers. They
		 * can still be parts of comments; for the way to prevent certain elements from becoming comment
		 * parts, see {@link DefaultConfig.rejectNode}. This value can have a wikitext counterpart (though
		 * not necessarily), {@link DefaultConfig.noSignatureTemplates}, for classes that are specified
		 * inside templates.
		 *
		 * When it comes to the wikitext, all lines containing these classes are ignored.
		 *
		 * @type {string[]}
		 * @default []
		 * @memberof convenientDiscussions.g
		 */
		noSignatureClasses: ['mw-notalk', 'ext-discussiontools-emptystate', 'cd-moveMark'],

		closedDiscussionClasses: ['mw-archivedtalk'],

		/**
		 * Names of elements that shouldn't be the first or last highlightable element. CD wraps these
		 * elements into `<div>` containers. It allows for comment headers to be displayed correctly when
		 * the `commentDisplay` setting is set to "Spacious".
		 *
		 * @type {string[]}
		 * @memberof convenientDiscussions.g
		 */
		badHighlightableElements: ['BLOCKQUOTE', 'DL', 'FORM', 'HR', 'OL', 'PRE', 'TABLE', 'UL'],

		/**
		 * Classes of elements that shouldn't be highlighted. Only MediaWiki-assigned and native CD
		 * classes go here. Wiki-specific classes go in the configuration.
		 *
		 * @type {string[]}
		 * @memberof convenientDiscussions.g
		 */
		noHighlightClasses: [
			'mw-empty-elt',
			'tleft',
			'tright',
			'floatleft',
			'floatright',
			'cd-moveMark',
			'cd-noHighlight',
		],

		/**
		 * Regexps for strings that should be cut out of comment beginnings (not considered parts of
		 * comments) when editing comments.
		 *
		 * @type {RegExp[]}
		 * @memberof convenientDiscussions.g
		 */
		badCommentBeginnings: [
			/^<!--[^]*?--> *\n+/,
			/^(?:----+|<hr>) *\n+/i,
			/^\{\|.*?\|\} *\n+(?=[*:#])/,
		],

		/**
		 * Auxiliary property to keep the sign code: `'\~\~\~\~'`. If written as plain text, it gets
		 * transformed into the revision author's signature when saved. Note that the minifier
		 * translates `'~\~\\~'` and `'\~\~' + '\~'` into `'\~\~\~'`.
		 *
		 * @type {string}
		 * @memberof convenientDiscussions.g
		 */
		signCode: ['~~', '~~'].join(''),

		timestampTools: /** @type {import('../shared/cd').TimestampTools} */ ({
			content: {},
			user: {},
		}),

		/**
		 * @typedef {object} Digits
		 * @property {string | undefined} content Regular expression matching a single digit in content
		 *   language, e.g. `[0-9]`.
		 * @property {string | undefined} user Regular expression matching a single digit in user
		 *   (interface) language, e.g. `[0-9]`.
		 */

		/** @type {Digits} */
		digits: {
			content: undefined,
			user: undefined,
		},
	}
}
