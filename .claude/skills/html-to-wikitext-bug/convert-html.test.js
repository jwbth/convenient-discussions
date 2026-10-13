// @vitest-environment-options {"url": "https://en.wikipedia.org/wiki/Test"}

// Feedback loop for HTML-to-wikitext conversion bugs. Copy to `tests/zz-convert-html.test.js`, set
// the URL above to a page on the bug's wiki, and run:
//
//   CONVERT_HTML=<path to .html> [CONVERT_SOURCE=selection] npx vitest run tests/zz-convert-html.test.js
//
// The file holds clipboard HTML (the default) or the HTML of the selected DOM (`selection`). The
// conversion calls the live transform API of the wiki. Then sharpen the expectation to the reported
// symptom.

import fs from 'node:fs'

import { expect, test } from 'vitest'

import cd from '../src/loader/cd'
import { escapePipesOutsideLinks } from '../src/shared/utils-wikitext'
import { convertHtmlToWikitext } from '../src/utils-api'
import { cleanUpPasteDom, getElementFromPasteHtml } from '../src/utils-window'

/** @param {string} title @param {any} value */
const print = (title, value) => {
	process.stdout.write(`--- ${title}\n${typeof value === 'string' ? value : JSON.stringify(value)}\n`)
}

// The setup stubs `$`; the code under test needs these two of its methods.
const globalAny = /** @type {any} */ (globalThis)
globalAny.$ = (/** @type {Element} */ el) => ({
	wrapInner: (/** @type {string} */ html) => {
		const wrapper = /** @type {Element} */ (document.createRange().createContextualFragment(html).firstChild)
		wrapper.append(...el.childNodes)
		el.append(wrapper)
	},
})
globalAny.$.ajax = async (/** @type {string} */ url, /** @type {any} */ { data }) => {
	const response = await fetch(new URL(url, location.origin), {
		method: 'POST',
		body: new URLSearchParams(data),
		headers: { 'User-Agent': 'CD conversion bug harness' },
	})
	const body = await response.text()
	if (!response.ok) {
		print(`transform API ${response.status}`, body.slice(0, 500))
		throw new Error(body)
	}

	return body
}

test('convert', async () => {
	const { query } = await (
		await fetch(
			`${location.origin}/w/api.php?action=query&meta=siteinfo&siprop=namespaces&format=json&formatversion=2`,
			{ headers: { 'User-Agent': 'CD conversion bug harness' } },
		)
	).json()
	mw.config.set(
		'wgFormattedNamespaces',
		Object.fromEntries(Object.values(query.namespaces).map((ns) => [ns.id, ns.name])),
	)
	cd.config = /** @type {any} */ ({ paragraphTemplates: [] })
	Object.assign(cd.g, {
		serverName: location.hostname,
		isProbablyWmfSulWiki: /\.(wikipedia|wiktionary|wikiquote|wikibooks|wikisource|wikinews|wikiversity|wikivoyage|wikimedia|mediawiki|wikidata)\.org$/.test(location.hostname),
		articlePathRegexp: /^\/wiki\/(.*)/,
		startsWithScriptTitleRegexp: /^\/w\/index\.php\?title=/,
	})

	const html = fs.readFileSync(/** @type {string} */ (process.env.CONVERT_HTML), 'utf8')
	let element
	if (process.env.CONVERT_SOURCE === 'selection') {
		element = document.createElement('div')
		element.innerHTML = html
	} else {
		element = getElementFromPasteHtml(html)
	}
	const paste = cleanUpPasteDom(element, document.body)
	print('cleaned-up HTML', paste.element.innerHTML)
	print('plain text', paste.text)
	print('isConvertible, syntaxHighlightLanguages', [paste.isConvertible, paste.syntaxHighlightLanguages])

	const wikitext = await convertHtmlToWikitext(paste.element.innerHTML, [...paste.syntaxHighlightLanguages])
	print('wikitext', wikitext)
	print('quoted into a template', escapePipesOutsideLinks(wikitext ?? paste.text))

	expect(wikitext).toContain('Expected wikitext')
})
