// @vitest-environment-options {"url": "https://ru.wikipedia.org/wiki/Test"}

import { describe, expect, test } from 'vitest'

import cd from '../src/loader/cd'
import { cleanUpPasteDom, getElementFromPasteHtml } from '../src/utils-window'

cd.config = /** @type {any} */ ({ paragraphTemplates: [] })
Object.assign(cd.g, {
	serverName: 'ru.wikipedia.org',
	isProbablyWmfSulWiki: true,
	articlePathRegexp: /^\/wiki\/(.*)/,
	startsWithScriptTitleRegexp: /^\/w\/index\.php\?title=/,
})
mw.config.set('wgFormattedNamespaces', { 6: 'Файл' })

const iconSrc =
	'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/db/Moskwa_Metro_Line_D1.svg/40px-Moskwa_Metro_Line_D1.svg.png?utm_source=ru.wikipedia.org'

/**
 * @param {string} html
 * @returns {import('../src/utils-window').CleanUpPasteDomReturn}
 */
const cleanUp = (html) => cleanUpPasteDom(getElementFromPasteHtml(html), document.body)

describe('cleanUpPasteDom', () => {
	test('keeps images in the form the transform API turns into file links', () => {
		// Shape of an inline icon copied from a Parsoid read view, `resource` made absolute by the copy
		const { element, isConvertible } = cleanUp(
			'<!--StartFragment--><span>пересадку между </span><span about="#mwt176">' +
				'<span typeof="mw:File"><a href="https://ru.wikipedia.org/wiki/%D0%90_(%D0%91)#C" title="А">' +
				`<img resource="https://ru.wikipedia.org/wiki/Файл:Moskwa_Metro_Line_D1.svg" src="${iconSrc}" ` +
				'alt="А" width="22" height="11" class="mw-file-element" style="vertical-align: middle;">' +
				'</a></span> <a rel="mw:WikiLink" href="https://ru.wikipedia.org/wiki/B" title="B">' +
				'<span>B</span></a></span><span>?</span><!--EndFragment-->',
		)

		expect(element.textContent).toBe('пересадку между  B?')
		const img = /** @type {HTMLImageElement} */ (
			element.querySelector('span[typeof="mw:File"] > a[href="./А (Б)#C"] > img')
		)
		expect(img.getAttribute('resource')).toBe('./Файл:Moskwa Metro Line D1.svg')
		expect([img.width, img.height, img.alt]).toEqual([22, 11, 'А'])
		expect(isConvertible).toBe(true)
	})

	test('points file links to the file description page by default and to other sites as is', () => {
		const { element } = cleanUp(
			'<span typeof="mw:File"><a href="https://ru.wikipedia.org/wiki/Файл:X.svg" class="mw-file-description">' +
				`<img src="${iconSrc}"></a></span> ` +
				'<span typeof="mw:File"><a href="https://example.org/"><img src="' +
				iconSrc +
				'"></a></span>',
		)

		expect(
			[...element.querySelectorAll('a')].map((el) => el.getAttribute('href')),
		).toEqual(['./Файл:Moskwa Metro Line D1.svg', 'https://example.org/'])
	})

	test('keeps the plain text of thumbnail captions', () => {
		const { element } = cleanUp(
			'<figure class="mw-default-size" typeof="mw:File/Thumb"><a href="./Файл:X.svg" ' +
				`class="mw-file-description"><img src="${iconSrc}"></a>` +
				'<figcaption>Подпись <a href="https://ru.wikipedia.org/wiki/Y">Y</a></figcaption></figure>',
		)

		expect(element.querySelector('figure.mw-default-size > figcaption')?.innerHTML).toBe(
			'Подпись Y',
		)
	})

	test('drops images whose file name is unknown, along with their links and the space after them', () => {
		const { element } = cleanUp(
			'<span>между </span><span typeof="mw:File"><a href="https://ru.wikipedia.org/wiki/A">' +
				'<img src="https://example.org/a.png"></a></span> <a href="https://ru.wikipedia.org/wiki/B">B</a>',
		)

		expect(element.innerHTML).toBe('между <a href="https://ru.wikipedia.org/wiki/B">B</a>')
	})

	test.each([
		[
			'a Commons file from another wiki on a wiki without Commons',
			false,
			`<img resource="https://en.wikipedia.org/wiki/File:X.svg" src="${iconSrc}">`,
			false,
		],
		[
			'a local file of another wiki',
			true,
			'<img resource="https://uk.wikipedia.org/wiki/Файл:X.png" ' +
				'src="https://upload.wikimedia.org/wikipedia/uk/a/ab/X.png">',
			false,
		],
		[
			'a file of this wiki',
			false,
			'<img resource="./Файл:X.png" src="/images/a/ab/X.png">',
			true,
		],
	])('%s is kept: %s', (_description, isProbablyWmfSulWiki, imgHtml, isKept) => {
		cd.g.isProbablyWmfSulWiki = isProbablyWmfSulWiki
		const { element } = cleanUp(`<span typeof="mw:File">${imgHtml}</span> text`)
		cd.g.isProbablyWmfSulWiki = true

		expect(Boolean(element.querySelector('img'))).toBe(isKept)
	})

	test('keeps runs of spaces in code', () => {
		expect(cleanUp('<b>a</b> <code>x  y</code>').element.innerHTML).toBe(
			'<b>a</b> <code>x  y</code>',
		)
	})

	test('reports plain text as not convertible', () => {
		expect(cleanUp('<span>plain</span> text').isConvertible).toBe(false)
	})
})
