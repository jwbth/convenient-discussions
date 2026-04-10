import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest'

import defaultPayload from './worker-default-payload.json'

describe('worker', () => {
	let postMessageSpy

	beforeEach(async () => {
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
		const text =
			'<div class="mw-content-ltr mw-parser-output" lang="en" dir="ltr"><p>Comment. <a href="/wiki/User:Example" title="User:Example">Example</a> (<a href="/wiki/User_talk:Example" title="User talk:Example">talk</a>) 00:00, 1 January 2026 (UTC)\n</p></div>'
		
		const payload = JSON.parse(JSON.stringify(defaultPayload))
		payload.text = text
		
		// Restore RegExp objects lost in JSON stringification
		payload.g.timestampTools.content.parseRegexp = /(^|[^A-Za-z\xC0-\uFFFF])((0?\d|1\d|2[0-3]):([0-5]\d), ([12]?\d|3[01]) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4}) \(UTC\))/
		payload.g.userNamespacesRegexp = /^(?:[uU][sS][eE][rR]|[uU][sS][eE][rR]_[tT][aA][lL][kK]):(.+)/
		payload.g.userLinkRegexp = /^\/wiki\/User:(.+)$/
		payload.g.userTalkLinkRegexp = /^\/wiki\/User_talk:(.+)$/
		payload.g.articlePathRegexp = /^\/wiki\/(.+)$/
		payload.g.userSubpageLinkRegexp = /^\/wiki\/User:(.+?)\//
		payload.g.userTalkSubpageLinkRegexp = /^\/wiki\/User_talk:(.+?)\//
		payload.g.contribsPageLinkRegexp = /^\/wiki\/Special:Contributions\/(.+)$/
		payload.g.isThumbRegexp = /thumb/
		payload.g.startsWithScriptTitleRegexp = /^\/w\/index\.php\?title=(.+)$/
		payload.g.quoteRegexp = /(<blockquote|<q)([^]*?)(<\/blockquote>|<\/q>)/gi
		payload.g.colonNamespacesPrefixRegexp = /^:/
		payload.g.pipeTrickRegexp = /\|$/
		payload.g.signaturePrefixRegexp = / /

		window.dispatchEvent(new MessageEvent('message', { data: payload }))

		expect(postMessageSpy).toHaveBeenCalled()

		const msg = postMessageSpy.mock.calls.find((call) => call[0] && call[0].task === 'parse')
		expect(msg).toBeDefined()
		const parseResult = msg[0]

		expect(parseResult.comments).toHaveLength(1)
		expect(parseResult.comments[0].authorName).toBe('Example')
		expect(parseResult.comments[0].date).toBeDefined()
	})

	test('parse identifies sections correctly', () => {
		const text =
			'<div class="mw-content-ltr mw-parser-output" lang="en" dir="ltr">' +
			'<h2 class="mw-heading"><span class="mw-headline" id="Test_Section">Test Section</span></h2>' +
			'<p>Another comment. <a href="/wiki/User:Example2" title="User:Example2">Example2</a> (<a href="/wiki/User_talk:Example2" title="User talk:Example2">talk</a>) 01:00, 1 January 2026 (UTC)\n</p></div>'
		
		const payload = JSON.parse(JSON.stringify(defaultPayload))
		payload.text = text
		
		// Restore RegExp objects
		payload.g.timestampTools.content.parseRegexp = /(^|[^A-Za-z\xC0-\uFFFF])((0?\d|1\d|2[0-3]):([0-5]\d), ([12]?\d|3[01]) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4}) \(UTC\))/
		payload.g.userNamespacesRegexp = /^(?:[uU][sS][eE][rR]|[uU][sS][eE][rR]_[tT][aA][lL][kK]):(.+)/
		payload.g.userLinkRegexp = /^\/wiki\/User:(.+)$/
		payload.g.userTalkLinkRegexp = /^\/wiki\/User_talk:(.+)$/
		payload.g.articlePathRegexp = /^\/wiki\/(.+)$/
		payload.g.userSubpageLinkRegexp = /^\/wiki\/User:(.+?)\//
		payload.g.userTalkSubpageLinkRegexp = /^\/wiki\/User_talk:(.+?)\//
		payload.g.contribsPageLinkRegexp = /^\/wiki\/Special:Contributions\/(.+)$/
		payload.g.isThumbRegexp = /thumb/
		payload.g.startsWithScriptTitleRegexp = /^\/w\/index\.php\?title=(.+)$/
		payload.g.quoteRegexp = /(<blockquote|<q)([^]*?)(<\/blockquote>|<\/q>)/gi
		payload.g.colonNamespacesPrefixRegexp = /^:/
		payload.g.pipeTrickRegexp = /\|$/
		payload.g.signaturePrefixRegexp = / /

		window.dispatchEvent(new MessageEvent('message', { data: payload }))
		expect(postMessageSpy).toHaveBeenCalled()
		const msg = postMessageSpy.mock.calls.find((call) => call[0] && call[0].task === 'parse')
		const parseResult = msg[0]

		expect(parseResult.sections).toHaveLength(1)
		expect(parseResult.sections[0].headline).toBe('Test Section')
		expect(parseResult.comments).toHaveLength(1)
		expect(parseResult.comments[0].authorName).toBe('Example2')
	})
})
