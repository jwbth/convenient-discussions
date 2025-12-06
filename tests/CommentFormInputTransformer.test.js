// TODO: use some interfaces for mocks and real objects alike?

window.mw = {
	/** @type {{ [key: string]: any }} */
	config: {
		values: {
			wgDiscussionToolsPageThreads: [],
		},
		get: (/** @type {string} */ name) => mw.config.values[name],
	},
	util: {
		escapeRegExp: (/** @type {string} */ s) =>
			s.replace(/([\\{}()|.?*+\-^$[\]])/g, String.raw`\$1`),
	},
}
// eslint-disable-next-line no-one-time-vars/no-one-time-vars
const mw = window.mw

const CommentFormInputTransformer = require('../src/CommentFormInputTransformer').default
const cd = require('../src/shared/cd').default

/** @type {Partial<typeof import('../config/default').default>} */
const defaultConfig = {
	defaultIndentationChar: ':',
	indentationCharMode: 'mimic',
	paragraphTemplates: ['pb', 'Paragraph break'],
	smallDivTemplates: ['smalldiv'],
	spaceAfterIndentationChars: true,
}
Object.assign(cd, {
	g: {
		filePrefixPattern: '(?:file|image):',
		quoteRegexp: /(<blockquote|<q)([^]*?)(<\/blockquote>|<\/q>)/gi,
		pniePattern:
			'(?:BLOCKQUOTE|DD|DIV|DL|DT|FORM|H1|H2|H3|H4|H5|H6|HR|INPUT|LI|LINK|OL|P|PRE|STYLE|TABLE|TBODY|TR|TH|TD|UL)',
		userSignature: ' ~~~~',
	},
	config: defaultConfig,
})

/**
 * Test {@link CommentFormInputTransformer#transform} with the data provided.
 *
 * @param {object} config
 * @param {string} config.label
 * @param {string} config.code
 * @param {string | RegExp | Error} config.expected
 * @param {any} config.commentForm
 * @param {import('../src/CommentForm').CommentFormAction} [config.action]
 * @param {Partial<typeof import('../config/default').default>} [config.config]
 */
function testWithData({ label, code, expected, commentForm, action = 'submit', config }) {
	test(label, () => {
		Object.assign(commentForm, {
			getMode: () => commentForm.mode,
			isMode: () => commentForm.mode === commentForm.mode,
			getTarget: () => commentForm.target,
			isNewSectionApi: () => commentForm.newSectionApi,
		})
		Object.assign(commentForm.target, {
			TYPE: ['addSection', 'addSubsection'].includes(commentForm.mode)
				? 'section'
				: ['reply', 'edit'].includes(commentForm.mode)
					? 'comment'
					: 'page',
			source: commentForm.target.source,
			isOpeningSection: () => commentForm.target.openingSection,
		})

		if (config) {
			cd.config = { ...cd.config, ...config }
		}

		const transformer = new CommentFormInputTransformer(code, commentForm, action)
		try {
			if (expected instanceof Error) {
				expect(() => {
					transformer.transform()
				}).toThrow(expected)
			} else {
				expect(transformer.transform())[typeof expected === 'string' ? 'toEqual' : 'toMatch'](
					expected,
				)
			}
		} finally {
			// Reset
			if (config) {
				cd.config = defaultConfig
			}
		}
	})
}

/* Forms for test cases */

const firstLevelReplyForm = {
	mode: 'reply',
	target: {
		source: {
			indentation: ':',
			replyIndentation: '::',
		},
	},
}

const firstCommentReplyForm = {
	mode: 'reply',
	target: {
		source: {
			indentation: '',
			replyIndentation: ':',
			headingLevel: 2,
		},
	},
	openingSection: true,
}

const existingSignature = ' [[User:Example|Example]] 00:00, 1 October 2021 (UTC)'

/**
 * @template {import('../src/CommentForm').CommentFormMode} [M=import('../src/CommentForm').CommentFormMode]
 * @typedef {object} CommentFormTestExtension
 * @property {M} mode
 * @property {any} target
 * @property {Partial<OO.ui.TextInputWidget>} [headlineInput]
 * @property {boolean} [sectionOpeningCommentEdited]
 * @property {boolean} [newSectionApi]
 */

/**
 * @typedef {Partial<Omit<import('../src/CommentForm').default, 'headlineInput' | 'target'>> & CommentFormTestExtension} CommentFormMock
 */

/** @type {CommentFormMock} */
const firstLevelEditForm = {
	mode: 'edit',
	target: {
		source: {
			indentation: ':',
			replyIndentation: '::',
			code: 'Text.',
			signatureCode: existingSignature,
		},
		openingSection: false,
	},
}

/** @type {CommentFormMock} */
const firstCommentEditForm = {
	mode: 'edit',
	sectionOpeningCommentEdited: true,
	headlineInput: {
		getValue: () => 'Headline',
	},
	target: {
		source: {
			indentation: '',
			replyIndentation: ':',
			code: '\nText.',
			signatureCode: existingSignature,
			headingLevel: 2,
		},
		openingSection: true,
	},
}

const replyInSectionForm = {
	mode: 'replyInSection',
	target: {
		source: {
			extractLastCommentIndentation: () => ':',
		},
	},
}

const voteForm = {
	mode: 'replyInSection',
	target: {
		source: {
			extractLastCommentIndentation: () => '#',
		},
	},
}

const addSectionForm = {
	mode: 'addSection',
	target: {},
	newSectionApi: true,
	headlineInput: {
		getValue: () => 'Headline',
	},
}

const addSectionFormNoHeadline = {
	mode: 'addSection',
	target: {},
	newSectionApi: false,
	headlineInput: {
		getValue: () => '',
	},
}

const addSectionFormOmitSignature = {
	mode: 'addSection',
	target: {},
	newSectionApi: true,
	headlineInput: {
		getValue: () => 'Headline',
	},
	omitSignatureCheckbox: {
		isSelected: () => true,
	},
}

const addSubsectionForm = {
	mode: 'addSubsection',
	target: {
		level: 2,
	},
	headlineInput: {
		getValue: () => 'Headline',
	},
}

/* Test cases */

describe('Basic cases', () => {
	testWithData({
		label: 'Reply to 0-level comment',
		code: 'Text.',
		expected: ': Text. ~~~~\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: 'Reply to 1-level comment',
		code: 'Text.',
		expected: ':: Text. ~~~~\n',
		commentForm: firstLevelReplyForm,
	})
	testWithData({
		label: 'Reply to 1-level comment, preview',
		code: 'Text.',
		expected: ': Text.<span class="cd-commentForm-signature"> ~~~~</span>\n',
		commentForm: firstLevelReplyForm,
		action: 'preview',
	})
	testWithData({
		label: 'Edit 1-level comment',
		code: 'Text.',
		expected: ': Text.' + existingSignature,
		commentForm: firstLevelEditForm,
	})
	testWithData({
		label: 'Edit 0-level comment',
		code: 'Text.',
		expected: '== Headline ==\n\nText.' + existingSignature,
		commentForm: firstCommentEditForm,
	})
	testWithData({
		label: 'Reply in section',
		code: 'Text.',
		expected: ': Text. ~~~~\n',
		commentForm: replyInSectionForm,
	})
	testWithData({
		label: 'Vote',
		code: 'Text.',
		expected: '# Text. ~~~~\n',
		commentForm: voteForm,
	})
	testWithData({
		label: 'Add section',
		code: 'Text.',
		expected: 'Text. ~~~~\n',
		commentForm: addSectionForm,
	})
	testWithData({
		label: 'Add section, view changes',
		code: 'Text.',
		expected: '== Headline ==\n\nText. ~~~~\n',
		commentForm: addSectionForm,
		action: 'viewChanges',
	})
	testWithData({
		label: 'Add section, omit signature',
		code: 'Text.',
		expected: 'Text.\n',
		commentForm: addSectionFormOmitSignature,
	})
	testWithData({
		label: 'Add section, no headline',
		code: 'Text.',
		expected: 'Text. ~~~~\n',
		commentForm: addSectionFormNoHeadline,
	})
	testWithData({
		label: 'Add subsection',
		code: 'Text.',
		expected: '=== Headline ===\nText. ~~~~\n\n',
		commentForm: addSubsectionForm,
	})
})

describe('Tricky markup', () => {
	testWithData({
		label: 'Bulleted list',
		code: 'List:\n* Item 1.\n* Item 2.\n* Item 3.\nEnd.',
		expected: ': List:\n:* Item 1.\n:* Item 2.\n:* Item 3.\n: End. ~~~~\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: 'Definition list',
		code: 'List:\n: Item 1.\n: Item 2.\n: Item 3.\nEnd.',
		expected: ': List:\n:: Item 1.\n:: Item 2.\n:: Item 3.\n: End. ~~~~\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: 'Numbered list',
		code: 'List:\n# Item 1.\n# Item 2.\n# Item 3.\nEnd.',
		expected: ': List:\n:# Item 1.\n:# Item 2.\n:# Item 3.\n: End. ~~~~\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: 'Bulleted list (add newline)',
		code: 'List:\n* Item 1.\n* Item 2.\n* Item 3.',
		expected: ': List:\n:* Item 1.\n:* Item 2.\n:* Item 3.\n: ~~~~\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: 'Table',
		code: 'Table:\n{|\n| Text.\n|}\nEnd.',
		expected: ': Table:\n: {|\n| Text.\n|}\n: End. ~~~~\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: 'File markup',
		code: 'Start.\n[[File:Example.png]]\nEnd.',
		expected: ': Start.<br> [[File:Example.png]]<br> End. ~~~~\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: 'Whole comment is a gallery tag',
		code: '<gallery>\nGallery.\n</gallery>',
		expected: /: ?\n<gallery>\nGallery\.\n<\/gallery>\n: ~~~~\n/,
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: 'Line break',
		code: 'Start.\nEnd.',
		expected: ': Start.<br> End. ~~~~\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: 'Line break, comment not indented',
		code: 'Start.\nEnd.',
		expected: 'Start.<br>\nEnd. ~~~~\n',
		commentForm: addSectionForm,
	})
	testWithData({
		label: 'Paragraph',
		code: 'Start.\n\nEnd.',
		expected: ': Start.{{pb}}End. ~~~~\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: 'Paragraph, comment not indented',
		code: 'Start.\n\nEnd.',
		expected: 'Start.\n\nEnd. ~~~~\n',
		commentForm: addSectionForm,
	})
	testWithData({
		label: 'Many newlines',
		code: 'Start.\n\n\n\n\nEnd.',
		expected: ': Start.{{pb}}End. ~~~~\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: 'Many newlines, comment not indented',
		code: 'Start.\n\n\n\n\nEnd.',
		expected: 'Start.\n\n\n\n\nEnd. ~~~~\n',
		commentForm: addSectionForm,
	})
	testWithData({
		label: 'Remove spaces',
		code: '  Start.  \n   \n  End.  ',
		expected: /: Start\.\s*\{\{pb\}\}End\. ~~~~\n/,
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: 'Add section, last line starts with a space',
		code: 'Text.\n pre syntax.',
		expected: 'Text.\n pre syntax.\n~~~~\n',
		commentForm: addSectionForm,
	})
	testWithData({
		label: 'Add section, last line starts with a heading',
		code: 'Text.\n=== Heading ===',
		expected: /Text\.(<br>)?\n=== Heading ===\n~~~~\n/,
		commentForm: addSectionForm,
	})
	testWithData({
		label: 'Add section, horizontal line',
		code: 'Text.\n----\nEnd.',
		expected: /Text\.(<br>)?\n----\nEnd. ~~~~\n/,
		commentForm: addSectionForm,
	})
	testWithData({
		label: 'Extra tildes are removed',
		code: 'Text. ~~~~',
		expected: ': Text. ~~~~\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: 'Table in a vote',
		code: 'Table:\n{|\n| Text.\n|}\nEnd.',
		expected: new Error('parse/numberedList-table'),
		commentForm: voteForm,
	})
	testWithData({
		label: 'List in a vote',
		code: 'List:\n* Item 1.\n** Subitem 1.\n* Item 2.\nEnd.',
		expected:
			'# List:<ul><li>Item 1.<ul><li>Subitem 1.</li></ul></li><li>Item 2.</li></ul>End. ~~~~\n',
		commentForm: voteForm,
	})
})

describe('Tags and templates', () => {
	testWithData({
		label: 'Inline tag',
		code: 'Text.\n<span>Text.</span>',
		expected: ': Text.<br> <span>Text.</span> ~~~~\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: 'Block tag',
		code: 'Text.\n<blockquote>Text.</blockquote>',
		expected: ': Text.<blockquote>Text.</blockquote> ~~~~\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: 'Whole comment in <small>',
		code: '<small>Text.</small>',
		expected: ': {{smalldiv|1=Text. ~~~~}}\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: 'Whole comment in <small>, horizontal lines',
		code: '<small>[[Link|Label]]\n|\n<nowiki>|</nowiki>\nEnd.</small>',
		expected: ': {{smalldiv|1=[[Link|Label]]<br> {{!}}<br> <nowiki>|</nowiki><br> End. ~~~~}}\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: 'Whole comment in <small>, add section',
		code: '<small>Text.</small>',
		expected: '<small>Text.</small> ~~~~\n',
		commentForm: addSectionForm,
	})
	testWithData({
		label: 'Template fully occupying a line',
		code: 'Quote:\n{{quote|Text.}}\nEnd.',
		expected: ': Quote:{{quote|Text.}}End. ~~~~\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: 'Two quotes with comments separated by a newline',
		code: 'Quote:\n{{quote|Text.}}\nComment.\n{{quote|Text.}}\nComment.',
		expected: ': Quote:{{quote|Text.}}Comment.{{quote|Text.}}Comment. ~~~~\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: 'Two quotes with comments separated by a paragraph',
		code: 'Quote:\n{{quote|Text.}}\nComment.\n\n{{quote|Text.}}\nComment.',
		expected: ': Quote:{{quote|Text.}}Comment.{{pb}}{{quote|Text.}}Comment. ~~~~\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: 'Template, add section',
		code: '{{Template 1}}\n{{Template 2}}\nEnd.',
		expected: '{{Template 1}}\n{{Template 2}}\nEnd. ~~~~\n',
		commentForm: addSectionForm,
	})
	testWithData({
		label: 'Newlines in a template',
		code: '{{tq|1=\nLine 1.\n\nLine 2.\nLine 3.\n}}<br> Text.',
		expected: ': {{tq|1=Line 1.{{pb}}Line 2.<br> Line 3.}}<br> Text. ~~~~\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: 'Newlines in a template, add section',
		code: '{{tq|1=\n\nLine 1.\n\nLine 2.\nLine 3.\n}}<br> Text.',
		expected: '{{tq|1=\n\nLine 1.\n\nLine 2.<br>\nLine 3.\n}}<br> Text. ~~~~\n',
		commentForm: addSectionForm,
	})
	testWithData({
		label: 'List in a tag',
		code: 'Quoted list:\n<blockquote>\n* Item 1.\n** Subitem 1.\n* Item 2.\n</blockquote>\nEnd.',
		expected:
			': Quoted list:<blockquote><ul><li>Item 1.<ul><li>Subitem 1.</li></ul></li><li>Item 2.</li></ul></blockquote>End. ~~~~\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: 'Definition list in a tag',
		code: 'Quoted list:\n<blockquote>\n: Item 1.\n:: Subitem 1.\n: Item 2.\n</blockquote>\nEnd.',
		expected:
			': Quoted list:<blockquote><dl><dd>Item 1.<dl><dd>Subitem 1.</dd></dl></dd><dd>Item 2.</dd></dl></blockquote>End. ~~~~\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: 'List in a template',
		code: 'Quoted list:\n{{quote|1=\n* Item 1.\n** Subitem 1.\n* Item 2.\n}}\nEnd.',
		expected:
			': Quoted list:{{quote|1=<ul><li>Item 1.<ul><li>Subitem 1.</li></ul></li><li>Item 2.</li></ul>}}End. ~~~~\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: "List in a template without a newline before a named parameter's content",
		code: 'Quoted list:\n{{quote|1=* Item 1.\n** Subitem 1.\n* Item 2.\n}}\nEnd.',
		expected:
			': Quoted list:{{quote|1=<ul><li>Item 1.<ul><li>Subitem 1.</li></ul></li><li>Item 2.</li></ul>}}End. ~~~~\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: "List in a template without a newline before a unnamed parameter's content",
		code: 'Quoted list:\n{{quote|1=* Item 1.\n** Subitem 1.\n* Item 2.\n}}\nEnd.',
		expected:
			': Quoted list:{{quote|1=<ul><li>Item 1.<ul><li>Subitem 1.</li></ul></li><li>Item 2.</li></ul>}}End. ~~~~\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: 'Gallery tag',
		code: 'Start.\n<gallery>\nGallery.\n</gallery>\nEnd.',
		expected: ': Start.\n<gallery>\nGallery.\n</gallery>\n: End. ~~~~\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: 'Gallery tag in a vote',
		code: 'Start.\n<gallery>\nGallery.\n</gallery>\nEnd.',
		expected: new Error('parse/numberedList'),
		commentForm: voteForm,
	})
	testWithData({
		label: '<syntaxhighlight>',
		code: 'Text.\n<syntaxhighlight lang="javascript">\nif (a) {\n\tdoSmth();\n}\n</syntaxhighlight>',
		expected:
			': Text.<syntaxhighlight lang="javascript">\nif (a) {\n\tdoSmth();\n}\n</syntaxhighlight> ~~~~\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: '<syntaxhighlight> at the end of a line with a newline after (common when editing)',
		code: 'Text.<syntaxhighlight lang="javascript">\nif (a) {\n\tdoSmth();\n}\n</syntaxhighlight>\nEnd.',
		expected:
			': Text.<syntaxhighlight lang="javascript">\nif (a) {\n\tdoSmth();\n}\n</syntaxhighlight>End. ~~~~\n',
		commentForm: firstCommentReplyForm,
	})
	testWithData({
		label: '<nowiki>',
		code: 'Text.\n<nowiki>  {{template}}  </nowiki>',
		expected: ': Text.<br> <nowiki>  {{template}}  </nowiki> ~~~~\n',
		commentForm: firstCommentReplyForm,
	})
})

describe('Alternative config', () => {
	testWithData({
		label: 'Paragraph (no template)',
		code: 'Start.\n\nEnd.',
		expected: ': Start.\n: End. ~~~~\n',
		commentForm: firstCommentReplyForm,
		config: { paragraphTemplates: [] },
	})
	testWithData({
		label: 'Paragraph (no template, comment wrapped in a tag)',
		code: '<div>Start.\n\nEnd.</div>',
		expected: ': <div>Start.<br> End.</div> ~~~~\n',
		commentForm: firstCommentReplyForm,
		config: { paragraphTemplates: [] },
	})
	testWithData({
		label: 'Paragraph (no template, various tricky markup)',
		code: 'Start.\nNew line\n\nEnd.\n\nList:\n* Item 1.\n* Item 2.\n* Item 3.\nContinuation.\n\n\nThree newlines.\nQuote 1:\n\n{{quote|Text.}}\n\nQuote 2:\n{{quote|Text.}}\nEnd',
		expected:
			': Start.<br> New line\n: End.\n: List:\n:* Item 1.\n:* Item 2.\n:* Item 3.\n: Continuation.\n: Three newlines.<br> Quote 1:\n: {{quote|Text.}}\n: Quote 2:{{quote|Text.}}End ~~~~\n',
		commentForm: firstCommentReplyForm,
		config: { paragraphTemplates: [] },
	})
	testWithData({
		label: 'Whole comment in <small> (no template)',
		code: '<small>Text.</small>',
		expected: ': <small>Text. ~~~~</small>\n',
		commentForm: firstCommentReplyForm,
		config: { smallDivTemplates: [] },
	})
	testWithData({
		label: 'Asterisk as indentation char, no space after',
		code: 'Text.',
		expected: '*Text. ~~~~\n',
		commentForm: replyInSectionForm,
		config: {
			defaultIndentationChar: '*',
			spaceAfterIndentationChars: false,
			indentationCharMode: 'unify',
		},
	})
	testWithData({
		label: 'Mimic indentation',
		code: 'Text.',
		expected: ': Text. ~~~~\n',
		commentForm: replyInSectionForm,
		config: { defaultIndentationChar: '*' },
	})
	testWithData({
		label: 'Colon as indentation because of a table',
		code: '{|\n| Text.\n|}',
		expected: ': {|\n| Text.\n|} ~~~~\n',
		commentForm: firstCommentReplyForm,
		config: { defaultIndentationChar: '*' },
	})
	testWithData({
		label: 'Colon as indentation because of a list',
		code: '* Item 1.\n* Item 2.\n* Item 3.\nEnd.',
		expected: ':* Item 1.\n:* Item 2.\n:* Item 3.\n: End. ~~~~\n',
		commentForm: firstCommentReplyForm,
		config: { defaultIndentationChar: '*' },
	})
})
