import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cdMock = vi.hoisted(() => ({ g: { isProbablyWmfSulWiki: false } }))

vi.mock('../src/loader/cd', () => ({ default: cdMock }))
vi.mock('../src/utils-api', () => ({ getUserInfo: vi.fn(), splitIntoBatches: vi.fn() }))

import { Loader } from '../src/loader/convenientDiscussions.loader'

const mapComment = '//# sourceMappingURL=https://tools-static.wmflabs.org/cd/main.js.map'
const workerCode = `self.onmessage = () => {};\n${mapComment}`
const appCode = `const workerCode = ${JSON.stringify(workerCode)};\n${mapComment}\n/* </nowiki> */`

describe('source maps in loaded scripts', () => {
	beforeEach(() => {
		vi.stubGlobal('IS_DEV', false)
		vi.stubGlobal('IS_SINGLE', false)
		cdMock.g.isProbablyWmfSulWiki = false
	})

	afterEach(() => {
		vi.unstubAllGlobals()
		vi.restoreAllMocks()
	})

	it.each([false, true])('imports the app with Wikimedia = %s', async (isWikimedia) => {
		cdMock.g.isProbablyWmfSulWiki = isWikimedia
		const loader = new Loader()
		loader['appCode'] = appCode
		const append = vi.spyOn(document.head, 'append').mockImplementation(() => {})

		await loader['importApp']()

		const script = /** @type {HTMLScriptElement} */ (append.mock.calls[0][0])
		expect(script.textContent).toBe(
			isWikimedia ? appCode : `const workerCode = ${JSON.stringify(workerCode)};\n\n/* </nowiki> */`,
		)
		// The worker's annotation is inside a string literal and must be handled when it runs.
		expect(script.textContent).toContain(JSON.stringify(workerCode))
	})

	it.each([false, true])('prepares worker code with Wikimedia = %s', (isWikimedia) => {
		cdMock.g.isProbablyWmfSulWiki = isWikimedia
		const loader = new Loader()

		expect(loader.maybeRemoveSourceMap(workerCode)).toBe(
			isWikimedia ? workerCode : workerCode.replace(mapComment, ''),
		)
	})

	it('preserves map annotations in multiline worker string literals', async () => {
		const workerLiteral = `\`${workerCode}\``
		const loader = new Loader()
		loader['appCode'] = `const workerCode = ${workerLiteral};\n${mapComment}\n/* </nowiki> */`
		const append = vi.spyOn(document.head, 'append').mockImplementation(() => {})

		await loader['importApp']()

		const script = /** @type {HTMLScriptElement} */ (append.mock.calls[0][0])
		expect(script.textContent).toBe(`const workerCode = ${workerLiteral};\n\n/* </nowiki> */`)
	})

	it.each(['IS_DEV', 'IS_SINGLE'])('keeps source maps in %s builds', (mode) => {
		vi.stubGlobal(mode, true)

		expect(new Loader().maybeRemoveSourceMap(workerCode)).toBe(workerCode)
	})

	it('preserves code with no source map and all line breaks', () => {
		const loader = new Loader()
		const code = `self.onmessage = () => {};\r\n${mapComment}\r\n`

		expect(loader.maybeRemoveSourceMap('self.onmessage = () => {};')).toBe(
			'self.onmessage = () => {};',
		)
		expect(loader.maybeRemoveSourceMap(code)).toBe('self.onmessage = () => {};\r\n\r\n')
	})

	it.each([JSON.stringify(workerCode), `\`${workerCode}\``])(
		'preserves embedded worker maps when the app has no map: %s',
		(workerLiteral) => {
			const code = `const workerCode = ${workerLiteral};\n/* </nowiki> */`

			expect(new Loader().maybeRemoveSourceMap(code)).toBe(code)
		},
	)
})
