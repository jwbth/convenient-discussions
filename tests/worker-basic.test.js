import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest'

import defaultPayload from './worker-default-payload'

describe('worker', () => {
	let postMessageSpy

	beforeEach(async () => {
		// Silence console output
		vi.spyOn(console, 'log').mockImplementation(() => {})
		vi.spyOn(console, 'warn').mockImplementation(() => {})
		vi.spyOn(console, 'error').mockImplementation(() => {})
		vi.spyOn(console, 'info').mockImplementation(() => {})
		vi.spyOn(console, 'debug').mockImplementation(() => {})

		vi.stubGlobal(
			'Worker',
			class Worker {
				constructor() {}
			},
		)

		postMessageSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {})

		await import('../src/worker/worker')
	})

	afterEach(() => {
		vi.unstubAllGlobals()
		vi.restoreAllMocks()
	})

	test('parse identifies comment, author, and date correctly', () => {
		const text = `<div class="mw-content-ltr mw-parser-output" lang="en" dir="ltr"><div class="mw-heading mw-heading2"><h2 id="Section">Section</h2></div>\n<p>Comment. <a href="/wiki/User:Example" title="User:Example">Example</a> (<a href="/wiki/User_talk:Example" title="User talk:Example">talk</a>) 00:00, 1 January 2026 (UTC)\n</p></div>`

		const payload = structuredClone(defaultPayload)
		payload.text = text

		window.dispatchEvent(new MessageEvent('message', { data: payload }))

		expect(postMessageSpy).toHaveBeenCalled()

		const msg = postMessageSpy.mock.calls.find((call) => call[0]?.task === 'parse')
		expect(msg).toBeDefined()
		const parseResult = msg[0]

		// console.log(parseResult.comments[0])

		expect(parseResult.comments).toHaveLength(1)
		expect(parseResult.comments[0].authorName).toBe('Example')
		expect(parseResult.comments[0].date.toISOString()).toBe('2026-01-01T00:00:00.000Z')
		expect(parseResult.comments[0].text).toBe('Section\nComment.')
	})

	test('parse identifies sections correctly', () => {
		const text = `<div class="mw-content-ltr mw-parser-output" lang="en" dir="ltr"><div class="mw-heading mw-heading2"><h2 id="Section">Section</h2></div>\n<p>Comment. <a href="/wiki/User:Example" title="User:Example">Example</a> (<a href="/wiki/User_talk:Example" title="User talk:Example">talk</a>) 00:00, 1 January 2026 (UTC)\n</p></div>>`

		const payload = structuredClone(defaultPayload)
		payload.text = text

		window.dispatchEvent(new MessageEvent('message', { data: payload }))
		expect(postMessageSpy).toHaveBeenCalled()
		const msg = postMessageSpy.mock.calls.find((call) => call[0]?.task === 'parse')
		const parseResult = msg[0]

		expect(parseResult.sections).toHaveLength(1)
		expect(parseResult.sections[0].headline).toBe('Section')
		expect(parseResult.comments).toHaveLength(1)
		expect(parseResult.comments[0].authorName).toBe('Example')
	})

	const parse = (/** @type {string} */ text) => {
		const payload = structuredClone(defaultPayload)
		payload.text = `<div class="mw-content-ltr mw-parser-output" lang="en" dir="ltr">${text}</div>`
		window.dispatchEvent(new MessageEvent('message', { data: payload }))

		return postMessageSpy.mock.calls.find((call) => call[0]?.task === 'parse')[0]
	}
	const heading = '<div class="mw-heading mw-heading2"><h2 id="Section">Section</h2></div>\n'
	const firstComment =
		'<p>Comment. <a href="/wiki/User:Alice" title="User:Alice">Alice</a> 00:00, 1 January 2026 (UTC)\n</p>\n'

	describe('move marks', () => {
		const moveMark =
			'<div class="mw-notalk cd-moveMark">Moved to <a href="/wiki/Elsewhere" title="Elsewhere">Elsewhere</a>. <a href="/wiki/User:Carol" title="User:Carol">Carol</a> 02:00, 1 January 2026 (UTC)</div>'
		// Parsoid wraps the TemplateStyles output of a template into a span
		const parsoidStyle =
			'<span class="mw-empty-elt" typeof="mw:Transclusion"><style data-mw-deduplicate="TemplateStyles:r1">.x{}</style></span>'
		const thread = (/** @type {string} */ style) =>
			heading +
			firstComment +
			'<ul><li>Reply. <a href="/wiki/User:Bob" title="User:Bob">Bob</a> 01:00, 1 January 2026 (UTC)</li>\n' +
			`<li>${style}${moveMark}</li>\n` +
			'<li>Another reply. <a href="/wiki/User:Dave" title="User:Dave">Dave</a> 03:00, 1 January 2026 (UTC)</li></ul>'

		test.each([
			['the legacy parser', '<style>.x{}</style>'],
			['Parsoid', parsoidStyle],
		])('a move mark in a list item is not a part of the next comment (%s)', (_, style) => {
			const { comments } = parse(thread(style))

			expect(comments.map((c) => c.authorName)).toEqual(['Alice', 'Bob', 'Dave'])
			expect(comments[2].text).toBe('Another reply.')
		})

		test('a move mark after a heading is not highlighted with the opening comment (Parsoid)', () => {
			const { comments } = parse(heading + parsoidStyle + moveMark + '\n' + firstComment)

			expect(comments).toHaveLength(1)
			// A standalone element outside the highlightables, which are marked with `cd-comment-part-first`
			expect(comments[0].elementHtmls).toContainEqual(
				expect.stringMatching(/^<div class="mw-notalk cd-moveMark cd-comment-part">/),
			)
		})
	})

	test.each([
		[
			'the legacy parser',
			'<a class="external autonumber" href="https://example.org/a">[1]</a>',
			['autonumber'],
		],
		[
			'Parsoid',
			'<a rel="mw:ExtLink" href="https://example.org/a" class="external autonumber" id="mwAdc"></a>',
			[],
		],
	])('an autonumbered external link is hidden only when numbered in text (%s)', (_, link, types) => {
		const { comments } = parse(
			heading +
				`<p>See ${link}. <a href="/wiki/User:Alice" title="User:Alice">Alice</a> 00:00, 1 January 2026 (UTC)
</p>`,
		)

		expect(comments[0].hiddenElementsData.map((data) => data.type)).toEqual(types)
		expect(comments[0].htmlToCompare.includes('https://example.org/a')).toBe(!types.length)
	})

	describe('quotes', () => {
		// The output of {{tqb}}
		const quote = '<style>.x{}</style><blockquote class="talkquote"><p>Quote.</p></blockquote>'

		test('a quote in its own list item opens a reply', () => {
			const { comments } = parse(
				heading +
					firstComment +
					'<dl><dd>Reply. <a href="/wiki/User:Bob" title="User:Bob">Bob</a> 01:00, 1 January 2026 (UTC)</dd>\n' +
					`<dd>${quote}</dd>\n` +
					'<dd>Another reply. <a href="/wiki/User:Carol" title="User:Carol">Carol</a> 02:00, 1 January 2026 (UTC)</dd></dl>',
			)

			expect(comments.map((c) => c.authorName)).toEqual(['Alice', 'Bob', 'Carol'])
			expect(comments[2].text).toBe('Quote.\nAnother reply.')
		})

		test('a quote opens an unindented comment', () => {
			const { comments } = parse(
				heading +
					firstComment +
					`${quote}\n` +
					'<p>Another comment. <a href="/wiki/User:Carol" title="User:Carol">Carol</a> 02:00, 1 January 2026 (UTC)</p>',
			)

			expect(comments.map((c) => c.authorName)).toEqual(['Alice', 'Carol'])
			expect(comments[1].text).toBe('Quote.\nAnother comment.')
		})
	})

	test('TemplateStyles inside a comment part are hidden from comparison', () => {
		// TemplateStyles emits <style> for the first use of a template on the page and <link> for the
		// rest, so which one a comment gets depends on the comments above it.
		const parseReply = (/** @type {string} */ styles) =>
			parse(
				heading +
					firstComment +
					`<dl><dd>${styles}<blockquote class="talkquote"><p>Quote.</p></blockquote>Reply. <a href="/wiki/User:Bob" title="User:Bob">Bob</a> 01:00, 1 January 2026 (UTC)</dd></dl>`,
			).comments[1]
		const withStyle = parseReply('<style data-mw-deduplicate="TemplateStyles:r1">.x{}</style>')
		const withLink = parseReply(
			'<link rel="mw-deduplicated-inline-style" href="mw-data:TemplateStyles:r1">',
		)

		expect(withStyle.text).toBe('Quote.Reply.')
		expect(withStyle.htmlToCompare).toBe(withLink.htmlToCompare)
		expect(withStyle.elementHtmls).toEqual(withLink.elementHtmls)
		expect(withStyle.hiddenElementsData).toEqual([
			{
				type: 'templateStyles',
				tagName: 'STYLE',
				html: '<style>.x{}</style>',
			},
		])
	})
})
