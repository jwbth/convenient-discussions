import { describe, expect, test } from 'vitest'

import cd from '../src/loader/cd'
import { cleanUpPasteDom, getElementFromPasteHtml } from '../src/utils-window'

cd.config = /** @type {any} */ ({ paragraphTemplates: [] })

/**
 * @param {string} html
 * @returns {import('../src/utils-window').CleanUpPasteDomReturn}
 */
const cleanUp = (html) => cleanUpPasteDom(getElementFromPasteHtml(html), document.body)

describe('cleanUpPasteDom', () => {
	test('drops image links along with the space separating them from the text', () => {
		// Shape of an inline icon copied from a Parsoid read view
		const { element, isConvertible } = cleanUp(
			'<!--StartFragment--><span>пересадку между </span><span>' +
				'<span typeof="mw:File"><a href="https://ru.wikipedia.org/wiki/A" title="A">' +
				'<img src="https://example.org/a.png" alt="A" width="22" height="11"></a></span> ' +
				'<a rel="mw:WikiLink" href="https://ru.wikipedia.org/wiki/B" title="B"><span>B</span></a>' +
				'</span><span>?</span><!--EndFragment-->',
		)

		expect(element.innerHTML).toBe(
			'пересадку между <a rel="mw:WikiLink" href="https://ru.wikipedia.org/wiki/B" title="B">B</a>?',
		)
		expect(isConvertible).toBe(true)
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
