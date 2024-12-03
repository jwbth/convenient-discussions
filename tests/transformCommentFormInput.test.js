window.mw = {
  util: {
    escapeRegExp: (str) => str.replace(/([\\{}()|.?*+\-^$[\]])/g, '\\$1'),
  },
  config: {
    values: {
      wgDiscussionToolsPageThreads: [],
    },
    get: (name) => mw.config.values[name],
  },
};

const CommentFormInputTransformer = require('../src/CommentFormInputTransformer').default;
const cd = require('../src/cd').default;

const defaultConfig = {
  defaultIndentationChar: ':',
  indentationCharMode: 'mimic',
  paragraphTemplates: ['pb', 'Paragraph break'],
  smallDivTemplates: ['smalldiv'],
  spaceAfterIndentationChars: true,
};
Object.assign(cd, {
  g: {
    filePrefixPattern: '(?:file|image):',
    quoteRegexp: /(<blockquote|<q)([^]*?)(<\/blockquote>|<\/q>)/gi,
    pniePattern: '(?:BLOCKQUOTE|DD|DIV|DL|DT|FORM|H1|H2|H3|H4|H5|H6|HR|INPUT|LI|LINK|OL|P|PRE|STYLE|TABLE|TBODY|TR|TH|TD|UL)',
    userSignature: ' ~~~~',
  },
  config: defaultConfig,
});

function testWithData(label, code, expected, commentForm, action = 'submit', config) {
  test(label, () => {
    commentForm.getMode = () => commentForm.mode;
    commentForm.getTarget = () => commentForm.target;
    commentForm.isNewSectionApi = () => commentForm.newSectionApi;

    if (config) {
      cd.config = Object.assign({}, cd.config, config);
    }

    const transformer = new CommentFormInputTransformer(code, commentForm, action);
    try {
      if (expected instanceof Error) {
        expect(() => {
          transformer.transform(code);
        }).toThrow(expected);
      } else {
        const method = typeof expected === 'string' ? 'toEqual' : 'toMatch';
        expect(transformer.transform(code))[method](expected);
      }
    } finally {
      if (config) {
        cd.config = defaultConfig;
      }
    }
  });
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
};

const firstCommentReplyForm = {
  mode: 'reply',
  target: {
    source: {
      indentation: '',
      replyIndentation: ':',
      headingLevel: 2,
    },
  },
  isOpeningSection: true,
};

const existingSignature = ' [[User:Example|Example]] 00:00, 1 October 2021 (UTC)';
const firstLevelEditForm = {
  mode: 'edit',
  target: {
    source: {
      indentation: ':',
      replyIndentation: '::',
      code: 'Text.',
      signatureCode: existingSignature,
    },
  },
};

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
    isOpeningSection: true,
  },
};

const replyInSectionForm = {
  mode: 'replyInSection',
  target: {
    source: {
      extractLastCommentIndentation: () => ':',
    },
  },
};

const voteForm = {
  mode: 'replyInSection',
  target: {
    source: {
      extractLastCommentIndentation: () => '#',
    },
  },
};

const addSectionForm = {
  mode: 'addSection',
  target: {},
  newSectionApi: true,
  headlineInput: {
    getValue: () => 'Headline',
  },
};

const addSectionFormNoHeadline = {
  mode: 'addSection',
  target: {},
  newSectionApi: false,
  headlineInput: {
    getValue: () => '',
  },
};

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
};

const addSubsectionForm = {
  mode: 'addSubsection',
  target: {
    level: 2,
  },
  headlineInput: {
    getValue: () => 'Headline',
  },
};


/* Test cases */

describe('Basic cases', () => {
  testWithData(
    'Reply to 0-level comment',
    'Text.',
    ': Text. ~~~~\n',
    firstCommentReplyForm
  );
  testWithData(
    'Reply to 1-level comment',
    'Text.',
    ':: Text. ~~~~\n',
    firstLevelReplyForm
  );
  testWithData(
    'Reply to 1-level comment, preview',
    'Text.',
    ': Text.<span class="cd-commentForm-signature"> ~~~~</span>\n',
    firstLevelReplyForm,
    'preview'
  );
  testWithData(
    'Edit 1-level comment',
    'Text.',
    ': Text.' + existingSignature,
    firstLevelEditForm
  );
  testWithData(
    'Edit 0-level comment',
    'Text.',
    '== Headline ==\n\nText.' + existingSignature,
    firstCommentEditForm
  );
  testWithData(
    'Reply in section',
    'Text.',
    ': Text. ~~~~\n',
    replyInSectionForm
  );
  testWithData(
    'Vote',
    'Text.',
    '# Text. ~~~~\n',
    voteForm
  );
  testWithData(
    'Add section',
    'Text.',
    'Text. ~~~~\n',
    addSectionForm
  );
  testWithData(
    'Add section, view changes',
    'Text.',
    '== Headline ==\n\nText. ~~~~\n',
    addSectionForm,
    'viewChanges'
  );
  testWithData(
    'Add section, omit signature',
    'Text.',
    'Text.\n',
    addSectionFormOmitSignature
  );
  testWithData(
    'Add section, no headline',
    'Text.',
    'Text. ~~~~\n',
    addSectionFormNoHeadline
  );
  testWithData(
    'Add subsection',
    'Text.',
    '=== Headline ===\nText. ~~~~\n',
    addSubsectionForm
  );
});

describe('Tricky markup', () => {
  testWithData(
    'Bulleted list',
    'List:\n* Item 1.\n* Item 2.\n* Item 3.\nEnd.',
    ': List:\n:* Item 1.\n:* Item 2.\n:* Item 3.\n: End. ~~~~\n',
    firstCommentReplyForm
  );
  testWithData(
    'Definition list',
    'List:\n: Item 1.\n: Item 2.\n: Item 3.\nEnd.',
    ': List:\n:: Item 1.\n:: Item 2.\n:: Item 3.\n: End. ~~~~\n',
    firstCommentReplyForm
  );
  testWithData(
    'Numbered list',
    'List:\n# Item 1.\n# Item 2.\n# Item 3.\nEnd.',
    ': List:\n:# Item 1.\n:# Item 2.\n:# Item 3.\n: End. ~~~~\n',
    firstCommentReplyForm
  );
  testWithData(
    'Bulleted list (add newline)',
    'List:\n* Item 1.\n* Item 2.\n* Item 3.',
    ': List:\n:* Item 1.\n:* Item 2.\n:* Item 3.\n: ~~~~\n',
    firstCommentReplyForm
  );
  testWithData(
    'Table',
    'Table:\n{|\n| Text.\n|}\nEnd.',
    ': Table:\n: {|\n| Text.\n|}\n: End. ~~~~\n',
    firstCommentReplyForm
  );
  testWithData(
    'File markup',
    'Start.\n[[File:Example.png]]\nEnd.',
    ': Start.<br> [[File:Example.png]]<br> End. ~~~~\n',
    firstCommentReplyForm
  );
  testWithData(
    'Whole comment is a gallery tag',
    '<gallery>\nGallery.\n</gallery>',
    /: ?\n<gallery>\nGallery\.\n<\/gallery>\n: ~~~~\n/,
    firstCommentReplyForm
  );
  testWithData(
    'Line break',
    'Start.\nEnd.',
    ': Start.<br> End. ~~~~\n',
    firstCommentReplyForm
  );
  testWithData(
    'Line break, comment not indented',
    'Start.\nEnd.',
    'Start.<br>\nEnd. ~~~~\n',
    addSectionForm
  );
  testWithData(
    'Paragraph',
    'Start.\n\nEnd.',
    ': Start.{{pb}}End. ~~~~\n',
    firstCommentReplyForm
  );
  testWithData(
    'Paragraph, comment not indented',
    'Start.\n\nEnd.',
    'Start.\n\nEnd. ~~~~\n',
    addSectionForm
  );
  testWithData(
    'Many newlines',
    'Start.\n\n\n\n\nEnd.',
    ': Start.{{pb}}End. ~~~~\n',
    firstCommentReplyForm
  );
  testWithData(
    'Many newlines, comment not indented',
    'Start.\n\n\n\n\nEnd.',
    'Start.\n\n\n\n\nEnd. ~~~~\n',
    addSectionForm
  );
  testWithData(
    'Remove spaces',
    '  Start.  \n   \n  End.  ',
    /: Start\.\s*\{\{pb\}\}End\. ~~~~\n/,
    firstCommentReplyForm
  );
  testWithData(
    'Add section, last line starts with a space',
    'Text.\n pre syntax.',
    'Text.\n pre syntax.\n~~~~\n',
    addSectionForm
  );
  testWithData(
    'Add section, last line starts with a heading',
    'Text.\n=== Heading ===',
    /Text\.(<br>)?\n=== Heading ===\n~~~~\n/,
    addSectionForm
  );
  testWithData(
    'Add section, horizontal line',
    'Text.\n----\nEnd.',
    /Text\.(<br>)?\n----\nEnd. ~~~~\n/,
    addSectionForm
  );
  testWithData(
    'Extra tildes are removed',
    'Text. ~~~~',
    ': Text. ~~~~\n',
    firstCommentReplyForm
  );
  testWithData(
    'Table in a vote',
    'Table:\n{|\n| Text.\n|}\nEnd.',
    new Error('parse/numberedList-table'),
    voteForm
  );
  testWithData(
    'List in a vote',
    'List:\n* Item 1.\n** Subitem 1.\n* Item 2.\nEnd.',
    '# List:<ul><li>Item 1.<ul><li>Subitem 1.</li></ul></li><li>Item 2.</li></ul>End. ~~~~\n',
    voteForm
  );
});

describe('Tags and templates', () => {
  testWithData(
    'Inline tag',
    'Text.\n<span>Text.</span>',
    ': Text.<br> <span>Text.</span> ~~~~\n',
    firstCommentReplyForm
  );
  testWithData(
    'Block tag',
    'Text.\n<blockquote>Text.</blockquote>',
    ': Text.<blockquote>Text.</blockquote> ~~~~\n',
    firstCommentReplyForm
  );
  testWithData(
    'Whole comment in <small>',
    '<small>Text.</small>',
    ': {{smalldiv|1=Text. ~~~~}}\n',
    firstCommentReplyForm
  );
  testWithData(
    'Whole comment in <small>, horizontal lines',
    '<small>[[Link|Label]]\n|\n<nowiki>|</nowiki>\nEnd.</small>',
    ': {{smalldiv|1=[[Link|Label]]<br> {{!}}<br> <nowiki>|</nowiki><br> End. ~~~~}}\n',
    firstCommentReplyForm
  );
  testWithData(
    'Whole comment in <small>, add section',
    '<small>Text.</small>',
    '<small>Text.</small> ~~~~\n',
    addSectionForm
  );
  testWithData(
    'Template fully occupying a line',
    'Quote:\n{{quote|Text.}}\nEnd.',
    ': Quote:{{quote|Text.}}End. ~~~~\n',
    firstCommentReplyForm
  );
  testWithData(
    'Two quotes with comments separated by a newline',
    'Quote:\n{{quote|Text.}}\nComment.\n{{quote|Text.}}\nComment.',
    ': Quote:{{quote|Text.}}Comment.{{quote|Text.}}Comment. ~~~~\n',
    firstCommentReplyForm
  );
  testWithData(
    'Two quotes with comments separated by a paragraph',
    'Quote:\n{{quote|Text.}}\nComment.\n\n{{quote|Text.}}\nComment.',
    ': Quote:{{quote|Text.}}Comment.{{pb}}{{quote|Text.}}Comment. ~~~~\n',
    firstCommentReplyForm
  );
  testWithData(
    'Template, add section',
    '{{Template 1}}\n{{Template 2}}\nEnd.',
    '{{Template 1}}\n{{Template 2}}\nEnd. ~~~~\n',
    addSectionForm
  );
  testWithData(
    'Newlines in a template',
    '{{tq|1=\nLine 1.\n\nLine 2.\nLine 3.\n}}<br> Text.',
    ': {{tq|1=Line 1.{{pb}}Line 2.<br> Line 3.}}<br> Text. ~~~~\n',
    firstCommentReplyForm
  );
  testWithData(
    'Newlines in a template, add section',
    '{{tq|1=\n\nLine 1.\n\nLine 2.\nLine 3.\n}}<br> Text.',
    '{{tq|1=\n\nLine 1.\n\nLine 2.<br>\nLine 3.\n}}<br> Text. ~~~~\n',
    addSectionForm
  );
  testWithData(
    'List in a tag',
    'Quoted list:\n<blockquote>\n* Item 1.\n** Subitem 1.\n* Item 2.\n</blockquote>\nEnd.',
    ': Quoted list:<blockquote><ul><li>Item 1.<ul><li>Subitem 1.</li></ul></li><li>Item 2.</li></ul></blockquote>End. ~~~~\n',
    firstCommentReplyForm
  );
  testWithData(
    'Definition list in a tag',
    'Quoted list:\n<blockquote>\n: Item 1.\n:: Subitem 1.\n: Item 2.\n</blockquote>\nEnd.',
    ': Quoted list:<blockquote><dl><dd>Item 1.<dl><dd>Subitem 1.</dd></dl></dd><dd>Item 2.</dd></dl></blockquote>End. ~~~~\n',
    firstCommentReplyForm
  );
  testWithData(
    'List in a template',
    'Quoted list:\n{{quote|1=\n* Item 1.\n** Subitem 1.\n* Item 2.\n}}\nEnd.',
    ': Quoted list:{{quote|1=<ul><li>Item 1.<ul><li>Subitem 1.</li></ul></li><li>Item 2.</li></ul>}}End. ~~~~\n',
    firstCommentReplyForm
  );
  testWithData(
    'List in a template without a newline before a named parameter\'s content',
    'Quoted list:\n{{quote|1=* Item 1.\n** Subitem 1.\n* Item 2.\n}}\nEnd.',
    ': Quoted list:{{quote|1=<ul><li>Item 1.<ul><li>Subitem 1.</li></ul></li><li>Item 2.</li></ul>}}End. ~~~~\n',
    firstCommentReplyForm
  );
  testWithData(
    'List in a template without a newline before a unnamed parameter\'s content',
    'Quoted list:\n{{quote|1=* Item 1.\n** Subitem 1.\n* Item 2.\n}}\nEnd.',
    ': Quoted list:{{quote|1=<ul><li>Item 1.<ul><li>Subitem 1.</li></ul></li><li>Item 2.</li></ul>}}End. ~~~~\n',
    firstCommentReplyForm
  );
  testWithData(
    'Gallery tag',
    'Start.\n<gallery>\nGallery.\n</gallery>\nEnd.',
    ': Start.\n<gallery>\nGallery.\n</gallery>\n: End. ~~~~\n',
    firstCommentReplyForm
  );
  testWithData(
    'Gallery tag in a vote',
    'Start.\n<gallery>\nGallery.\n</gallery>\nEnd.',
    new Error('parse/numberedList'),
    voteForm
  );
  testWithData(
    '<syntaxhighlight>',
    'Text.\n<syntaxhighlight lang="javascript">\nif (a) {\n\tdoSmth();\n}\n</syntaxhighlight>',
    ': Text.<syntaxhighlight lang="javascript">\nif (a) {\n\tdoSmth();\n}\n</syntaxhighlight> ~~~~\n',
    firstCommentReplyForm
  );
  testWithData(
    '<syntaxhighlight> at the end of a line with a newline after (common when editing)',
    'Text.<syntaxhighlight lang="javascript">\nif (a) {\n\tdoSmth();\n}\n</syntaxhighlight>\nEnd.',
    ': Text.<syntaxhighlight lang="javascript">\nif (a) {\n\tdoSmth();\n}\n</syntaxhighlight>End. ~~~~\n',
    firstCommentReplyForm
  );
  testWithData(
    '<nowiki>',
    'Text.\n<nowiki>  {{template}}  </nowiki>',
    ': Text.<br> <nowiki>  {{template}}  </nowiki> ~~~~\n',
    firstCommentReplyForm
  );
});

describe('Alternative config', () => {
  testWithData(
    'Paragraph (no template)',
    'Start.\n\nEnd.',
    ': Start.\n: End. ~~~~\n',
    firstCommentReplyForm,
    undefined,
    { paragraphTemplates: [] }
  );
  testWithData(
    'Paragraph (no template, comment wrapped in a tag)',
    '<div>Start.\n\nEnd.</div>',
    ': <div>Start.<br> End.</div> ~~~~\n',
    firstCommentReplyForm,
    undefined,
    { paragraphTemplates: [] }
  );
  testWithData(
    'Paragraph (no template, various tricky markup)',
    'Start.\nNew line\n\nEnd.\n\nList:\n* Item 1.\n* Item 2.\n* Item 3.\nContinuation.\n\n\nThree newlines.\nQuote 1:\n\n{{quote|Text.}}\n\nQuote 2:\n{{quote|Text.}}\nEnd',
    ': Start.<br> New line\n: End.\n: List:\n:* Item 1.\n:* Item 2.\n:* Item 3.\n: Continuation.\n: Three newlines.<br> Quote 1:\n: {{quote|Text.}}\n: Quote 2:{{quote|Text.}}End ~~~~\n',
    firstCommentReplyForm,
    undefined,
    { paragraphTemplates: [] }
  );
  testWithData(
    'Whole comment in <small> (no template)',
    '<small>Text.</small>',
    ': <small>Text. ~~~~</small>\n',
    firstCommentReplyForm,
    undefined,
    { smallDivTemplates: [] }
  );
  testWithData(
    'Asterisk as indentation char, no space after',
    'Text.',
    '*Text. ~~~~\n',
    replyInSectionForm,
    undefined,
    {
      defaultIndentationChar: '*',
      spaceAfterIndentationChars: false,
      indentationCharMode: 'unify',
    }
  );
  testWithData(
    'Mimic indentation',
    'Text.',
    ': Text. ~~~~\n',
    replyInSectionForm,
    undefined,
    { defaultIndentationChar: '*' }
  );
  testWithData(
    'Colon as indentation because of a table',
    '{|\n| Text.\n|}',
    ': {|\n| Text.\n|} ~~~~\n',
    firstCommentReplyForm,
    undefined,
    { defaultIndentationChar: '*' }
  );
  testWithData(
    'Colon as indentation because of a list',
    '* Item 1.\n* Item 2.\n* Item 3.\nEnd.',
    ':* Item 1.\n:* Item 2.\n:* Item 3.\n: End. ~~~~\n',
    firstCommentReplyForm,
    undefined,
    { defaultIndentationChar: '*' }
  );
});
