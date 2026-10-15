import { beforeAll, describe, expect, test } from 'vitest'

import CommentFormInputTransformer from '../src/CommentFormInputTransformer'
import cd from '../src/loader/cd'

import { makeCommentFormValues } from './utils-commentFormValues'
import { locate, makeData, makeOpeningCommentData, sign } from './utils-commentSource'
import { initCommonsGlobals } from './utils-wikiGlobals'

/** @typedef {import('../src/CommentSource').default} CommentSource */

beforeAll(() => {
	initCommonsGlobals()
	cd.g.userSignature = ' ~~~~'
	CommentFormInputTransformer.init()
})

const aliceSignature = sign('Alice', '10:00')
const bobSignature = sign('Bob', '11:00')

/**
 * Locate Alice's opening comment, at level 0, with the code provided.
 *
 * @param {string} code Code of the comment short of its signature
 * @returns {CommentSource}
 */
function locateOpening(code) {
	return locate(
		`== Topic ==\n${code} ${aliceSignature}\n: Reply. ${bobSignature}\n`,
		makeOpeningCommentData(),
	)
}

/**
 * Locate Bob's reply, at level 1, with the code provided.
 *
 * @param {string} code Code of the comment short of its indentation and signature
 * @param {string} [after] Code after the signature
 * @returns {CommentSource}
 */
function locateReply(code, after = '') {
	return locate(
		`== Topic ==\nOpening. ${aliceSignature}\n: ${code} ${bobSignature}${after}\n`,
		makeData('Bob', '11:00'),
	)
}

/**
 * Code that {@link editUnchanged} returns for a comment located with {@link locateOpening} or
 * {@link locateReply}.
 *
 * @param {string} code
 * @param {number} level Level 0 or 1
 * @returns {string}
 */
function originalCode(code, level) {
	return level === 0 ? `== Topic ==\n${code} ${aliceSignature}` : `: ${code} ${bobSignature}`
}

/**
 * Code that {@link editUnchanged} returns for a comment with the code {@link post} returned.
 *
 * @param {string} code
 * @param {number} level Level 0 or 1
 * @returns {string}
 */
function postedCode(code, level) {
	return (
		(level === 0 ? '== Topic ==\n' : '') +
		code.replace('~~~~', level === 0 ? aliceSignature : bobSignature).replace(/\n$/, '')
	)
}

/**
 * Convert the comment form input to code the way submitting the comment form does.
 *
 * @param {import('../src/CommentForm').CommentFormMode} mode
 * @param {string} input
 * @param {object} target
 * @param {Partial<import('../src/CommentForm').CommentFormValues>} [values]
 * @returns {string}
 */
function inputToCode(mode, input, target, values = {}) {
	return CommentFormInputTransformer.inputToCode(
		makeCommentFormValues(mode, { comment: input, ...values }),
		/** @type {any} */ (target),
		'submit',
		mode === 'addSection',
	).code
}

/**
 * Load a comment into the comment form and submit it unchanged.
 *
 * @param {CommentSource} source
 * @returns {string} Code of the comment, with its indentation and signature
 */
function editUnchanged(source) {
	const isOpening = source.commentData.openingSection

	return inputToCode(
		'edit',
		source.toInputValue(),
		{ TYPE: 'comment', isOpeningSection: () => isOpening, source },
		{ headline: isOpening ? 'Topic' : undefined },
	)
}

/**
 * Post a comment at level 0 or 1, then locate it as it ended up on the page.
 *
 * @param {string} input
 * @param {number} level Level 0 or 1
 * @returns {{ code: string; source: CommentSource }} The posted code and the posted comment's source
 */
function post(input, level) {
	if (level === 0) {
		const code = inputToCode('addSection', input, { TYPE: 'section' }, { headline: 'Topic' })

		return {
			code,
			source: locate(
				`== Topic ==\n${code.replace('~~~~', aliceSignature)}: Reply. ${bobSignature}\n`,
				makeOpeningCommentData(),
			),
		}
	}

	const code = inputToCode('reply', input, {
		TYPE: 'comment',
		isOpeningSection: () => true,
		source: { indentation: '', replyIndentation: ':' },
	})

	return {
		code,
		source: locate(
			`== Topic ==\nOpening. ${aliceSignature}\n${code.replace('~~~~', bobSignature)}`,
			makeData('Bob', '11:00'),
		),
	}
}

describe('toInputValue() at level 0', () => {
	test.each([
		['joins lines with a no-op newline', 'Line 1.\nLine 2.', 'Line 1. Line 2.'],
		['joins lines inside an inline tag', 'Text <span>a\nb</span>.', 'Text <span>a b</span>.'],
		['keeps paragraphs', 'Para 1.\n\nPara 2.', 'Para 1.\n\nPara 2.'],
		['keeps several empty lines', 'Para 1.\n\n\nPara 2.', 'Para 1.\n\n\nPara 2.'],
		['turns <br> into a newline', 'Line 1.<br>Line 2.', 'Line 1.\nLine 2.'],
		[
			'turns <br /> and the newline after it into one newline',
			'Line 1.<br />\nLine 2.',
			'Line 1.\nLine 2.',
		],
		[
			'turns consecutive <br>s into a paragraph',
			'Line 1.<br>\n<br>\nLine 2.',
			'Line 1.\n\nLine 2.',
		],
		['turns a paragraph template into a paragraph', 'Para 1.{{pb}}Para 2.', 'Para 1.\n\nPara 2.'],
		[
			'keeps a newline around a template on its own line',
			'Text.\n{{quote|Q.}}\nText.',
			'Text.\n{{quote|Q.}}\nText.',
		],
		[
			'keeps a newline between templates on their own lines',
			'{{T1}}\n{{T2}}\nText.',
			'{{T1}}\n{{T2}}\nText.',
		],
		[
			'keeps <br> after a template on its own line, since posting adds none there',
			'{{T}}<br>\nText.',
			'{{T}}<br>\nText.',
		],
		[
			'keeps <br> after two templates',
			'Text {{T1}}{{T2}}<br>Text.',
			'Text {{T1}}{{T2}}<br>\nText.',
		],
		[
			'unmasks three paragraph templates in a row',
			'Text.{{pb}}{{pb}}{{pb}}Text.',
			'Text.\n\n\n\n\n\nText.',
		],
		[
			'keeps a newline around a block tag',
			'Text.\n<blockquote>Q.</blockquote>\nText.',
			'Text.\n<blockquote>Q.</blockquote>\nText.',
		],
		[
			'keeps a newline around a file',
			'Text.\n[[File:A.png|thumb]]\nText.',
			'Text.\n[[File:A.png|thumb]]\nText.',
		],
		['keeps a newline around a horizontal line', 'Text.\n----\nText.', 'Text.\n----\nText.'],
		[
			'keeps a newline around a table',
			'Text.\n{|\n| Cell\n|}\nText.',
			'Text.\n{|\n| Cell\n|}\nText.',
		],
		['keeps a newline before a list', 'Text.\n* Item 1.\n* Item 2.', 'Text.\n* Item 1.\n* Item 2.'],
		[
			'keeps a newline inside <pre>',
			'Text.\n<pre>a\nb</pre>\nText.',
			'Text.\n<pre>a\nb</pre>\nText.',
		],
		[
			'keeps a newline inside <nowiki>',
			'Text <nowiki>a\nb</nowiki>.',
			'Text <nowiki>a\nb</nowiki>.',
		],
		['keeps a newline inside a template', '{{T|1=a\nb}}\nText.', '{{T|1=a\nb}}\nText.'],
		['keeps <br> inside a template', '{{T|1=a<br>b}}\nText.', '{{T|1=a<br>b}}\nText.'],
	])('%s', (_label, code, expected) => {
		expect(locateOpening(code).toInputValue()).toBe(expected)
	})
})

describe('toInputValue() in a reply', () => {
	test.each([
		['turns a same-level line into a paragraph', 'Para 1.\n: Para 2.', 'Para 1.\n\nPara 2.'],
		[
			'turns empty indented lines into one paragraph',
			'Para 1.\n:\n:\n: Para 2.',
			'Para 1.\n\nPara 2.',
		],
		['turns a paragraph template into a paragraph', 'Para 1.{{pb}}Para 2.', 'Para 1.\n\nPara 2.'],
		['turns <br> into a newline', 'Line 1.<br>Line 2.', 'Line 1.\nLine 2.'],
		[
			'strips the indentation of the reply from a list',
			'Text.\n:* Item 1.\n:* Item 2.',
			'Text.\n* Item 1.\n* Item 2.',
		],
		['keeps deeper indentation relative', 'Text.\n:: Deeper.', 'Text.\n: Deeper.'],
		[
			'keeps a table on single lines',
			'Text.\n:{|\n| Cell\n|}\n: Text.',
			'Text.\n{|\n| Cell\n|}\nText.',
		],
		['keeps a newline inside <pre>', 'Text <pre>a\nb</pre> end.', 'Text <pre>a\nb</pre> end.'],
	])('%s', (_label, code, expected) => {
		expect(locateReply(code).toInputValue()).toBe(expected)
	})

	test.each([
		['<small>', '<small>Text.', '</small>'],
		['a small div template', '{{smalldiv|1=Text.', '}}'],
	])(
		'turns %s around the comment and the signature into <small> around the comment',
		(_label, code, after) => {
			expect(locateReply(code, after).toInputValue()).toBe('<small>Text.</small>')
		},
	)
})

describe('posting, then editing without changes', () => {
	test.each([
		[0, 'Line 1.\nLine 2.'],
		[0, 'Para 1.\n\nPara 2.'],
		[0, 'Para 1.\n\n\nPara 2.'],
		[0, 'Text.\n* Item 1.\n* Item 2.'],
		[0, 'Text.\n<blockquote>Quote.</blockquote>\nText.'],
		[0, 'Quote:\n{{quote|Text.}}\nEnd.'],
		[0, '{{T1}}\n{{T2}}\nText.'],
		[0, 'Text.\n{|\n| Cell\n|}\nText.'],
		[0, '[[File:A.png|thumb]]\nText.'],
		[0, 'Text.\n----\nText.'],
		[0, 'Text <pre>a\nb</pre> end.'],
		[0, 'Text.<noinclude>\n{{Help}}</noinclude>'],
		[0, '{{Notice}}<noinclude>\n{{Help}}</noinclude>\nText.'],
		[0, 'Text.<noinclude>a<br>b</noinclude>'],
		[0, 'Text.<noinclude>a</noinclude>\nText.'],
		[0, 'Text.<noinclude>\n* Item.</noinclude>'],
		[0, 'Text.<noinclude><nowiki></noinclude></nowiki>a\nb</noinclude>'],
		[1, 'Line 1.\nLine 2.'],
		[1, 'Para 1.\n\nPara 2.'],
		[1, 'Text.\n* Item 1.\n* Item 2.'],
		[1, 'Text.\n# One.\n# Two.'],
		[1, 'Text.\n: Deeper.\n\nBack.'],
		[1, 'Text.\n{|\n| Cell\n|}\nText.'],
		[1, '<small>Line 1.\nLine 2.</small>'],
		[1, 'Text <pre>a\nb</pre> end.'],
	])('gives back the input and the code at level %i: %j', (level, input) => {
		const { code, source } = post(input, level)

		expect(source.toInputValue()).toBe(input)
		expect(editUnchanged(source)).toBe(postedCode(code, level))
	})

	test.each([
		[
			'newlines around a block tag in a reply have no effect',
			1,
			'Text.\n<blockquote>Quote.</blockquote>\nText.',
			'Text.<blockquote>Quote.</blockquote>Text.',
		],
		[
			'newlines around a template on its own line in a reply have no effect',
			1,
			'Quote:\n{{quote|Text.}}\nEnd.',
			'Quote:{{quote|Text.}}End.',
		],
		[
			'a newline after a file in a reply has no effect',
			1,
			'[[File:A.png|thumb]]\nText.',
			'[[File:A.png|thumb]]Text.',
		],
		['a reply has one kind of paragraph break', 1, 'Text.\n\n\nText.', 'Text.\n\nText.'],
		[
			'a list inside a tag in a reply has to be HTML',
			1,
			'<blockquote>\n* Item.\n</blockquote>',
			'<blockquote><ul><li>Item.</li></ul></blockquote>',
		],
		['template content is left as is on editing', 0, '{{quote|a\nb}}', '{{quote|a<br>\nb}}'],
	])('normalizes the input, as %s', (_label, level, input, expected) => {
		const { code, source } = post(input, level)

		expect(source.toInputValue()).toBe(expected)
		expect(editUnchanged(source)).toBe(postedCode(code, level))
	})

	test('keeps a newline inside <noinclude> in a reply from breaking the list item', () => {
		const { code } = post('Text.<noinclude>\n{{Help}}</noinclude>', 1)

		expect(
			code
				.split('\n')
				.filter(Boolean)
				.every((line) => line.startsWith(':')),
		).toBe(true)
	})

	test('keeps a <br> after </noinclude>', () => {
		expect(editUnchanged(locateOpening('Text.<noinclude>a</noinclude><br>Text.'))).toBe(
			originalCode('Text.<noinclude>a</noinclude><br>\nText.', 0),
		)
	})

	test.fails.each([
		['a list', 'Text.\n* Item 1.\n* Item 2.\nEnd.'],
		['a gallery', 'Text.\n<gallery>\nA.png\n</gallery>\nText.'],
	])('adds no paragraph template after %s in a reply', (_label, input) => {
		const { code, source } = post(input, 1)

		expect(editUnchanged(source)).toBe(postedCode(code, 1))
	})

	test.fails('gives back the newlines around a gallery at level 0', () => {
		const input = 'Text.\n<gallery>\nA.png\n</gallery>\nText.'

		expect(post(input, 0).source.toInputValue()).toBe(input)
	})
})

describe('editing without changes', () => {
	test.each([
		[0, 'Para 1.\n\nPara 2.'],
		[0, 'Text.\n{{quote|Q.}}\nText.'],
		[0, 'Text.\n<div>Block.</div>\nText.'],
		[0, 'Text.\n* Item 1.\n* Item 2.\n'],
		[0, 'Text.\n<pre>a\nb</pre>\nText.'],
		[0, 'Text.\n[[File:A.png|thumb]]'],
		[0, 'Text.\n----\nText.'],
		[0, 'Text.\n{|\n| Cell\n|}\nText.'],
		[0, 'Text.<noinclude>\n{{Help}}</noinclude>'],
		[1, 'Para 1.{{pb}}Para 2.'],
		[1, 'Text.\n:* Item 1.\n:* Item 2.\n:'],
		[1, 'Text.<blockquote>Quote.</blockquote>Text.'],
		[1, 'Quote:{{quote|Text.}}End.'],
		[1, '{{smalldiv|1=Small text.}}'],
		[1, 'Text <nowiki>a|b</nowiki>.'],
	])('keeps the code at level %i: %j', (level, code) => {
		const source = level === 0 ? locateOpening(code) : locateReply(code)

		expect(editUnchanged(source)).toBe(originalCode(code, level))
	})

	test.each([
		['a no-op newline is dropped', 0, 'Line 1.\nLine 2.', 'Line 1. Line 2.'],
		[
			'a no-op newline inside an inline tag is dropped',
			0,
			'Text.<span>\nx</span>',
			'Text.<span> x</span>',
		],
		['<br> gets a newline after it', 0, 'Line 1.<br>Line 2.', 'Line 1.<br>\nLine 2.'],
		['<br /> becomes <br>', 0, 'Line 1.<br />\nLine 2.', 'Line 1.<br>\nLine 2.'],
		['consecutive <br>s become a paragraph', 0, 'Line 1.<br>\n<br>\nLine 2.', 'Line 1.\n\nLine 2.'],
		[
			'a paragraph template at level 0 becomes a paragraph',
			0,
			'Para 1.{{pb}}Para 2.',
			'Para 1.\n\nPara 2.',
		],
		['<br> in a reply gets a space after it', 1, 'Line 1.<br>Line 2.', 'Line 1.<br> Line 2.'],
		[
			'a same-level line in a reply becomes a paragraph template',
			1,
			'Para 1.\n: Para 2.',
			'Para 1.{{pb}}Para 2.',
		],
		[
			'empty indented lines in a reply become a paragraph template',
			1,
			'Para 1.\n:\n: Para 2.',
			'Para 1.{{pb}}Para 2.',
		],
		[
			'a table in a reply gets a space after the indentation',
			1,
			'Text.\n:{|\n| Cell\n|}\n: Text.',
			'Text.\n: {|\n| Cell\n|}\n: Text.',
		],
	])('normalizes the code, as %s', (_label, level, code, expected) => {
		const source = level === 0 ? locateOpening(code) : locateReply(code)

		expect(editUnchanged(source)).toBe(originalCode(expected, level))
	})

	test.fails('keeps <small> that leaves out the signature', () => {
		expect(editUnchanged(locateReply('<small>Small text.</small>'))).toBe(
			originalCode('<small>Small text.</small>', 1),
		)
	})

	test.fails('adds no <br> to a newline inside a template parameter', () => {
		expect(editUnchanged(locateOpening('{{quote|a\nb}}\nText.'))).toBe(
			originalCode('{{quote|a\nb}}\nText.', 0),
		)
	})
})
