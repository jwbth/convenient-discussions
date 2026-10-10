import { describe, expect, test, vi } from 'vitest'

import loadContextCode from '../src/loadContextCode'
import cd from '../src/loader/cd'
import CdError from '../src/shared/CdError'

cd.sParse = /** @type {any} */ ((/** @type {string} */ name) => name)

const sectionCode = 'SECTION CODE\n'
const pageCode = 'PAGE CODE\n'

/**
 * @param {string} code
 * @returns {CdError}
 */
function cdError(code) {
	return new CdError({ type: 'parse', code })
}

/**
 * A fake of what {@link loadContextCode} is given. `locate` returns `source:<context code>` unless
 * `locateErrors` maps the context code to an error to throw.
 *
 * @param {object} [options]
 * @param {boolean} [options.hasLiveSectionNumber]
 * @param {Error} [options.requestCodeError]
 * @param {Error} [options.loadPageCodeError]
 * @param {{ [code: string]: Error }} [options.locateErrors]
 * @param {() => Promise<any>} [options.locateUsingDt]
 */
function makeInput({
	hasLiveSectionNumber = true,
	requestCodeError,
	loadPageCodeError,
	locateErrors = {},
	locateUsingDt,
} = {}) {
	const page = {
		source: /** @type {{ getCode: () => string } | undefined} */ (undefined),
		loadCode: vi.fn(async () => {
			if (loadPageCodeError) throw loadPageCodeError
			page.source = { getCode: () => pageCode }
		}),
	}

	return {
		section: {
			liveSectionNumber: hasLiveSectionNumber ? 1 : undefined,
			requestCode: vi.fn(async () => {
				if (requestCodeError) throw requestCodeError

				return sectionCode
			}),
		},
		sourcePage: page,
		locate: vi.fn((/** @type {string | undefined} */ code) => {
			const contextCode = code ?? /** @type {NonNullable<typeof page.source>} */ (page.source).getCode()
			if (locateErrors[contextCode]) throw locateErrors[contextCode]

			return `source:${contextCode}`
		}),
		locateUsingDt: locateUsingDt && vi.fn(locateUsingDt),
	}
}

/**
 * @param {Promise<unknown>} promise
 * @returns {Promise<CdError>}
 */
async function rejection(promise) {
	try {
		await promise
	} catch (error) {
		return /** @type {CdError} */ (error)
	}
	throw new Error('Expected a rejection')
}

describe('loadContextCode', () => {
	test('locates in the section code when the section has a live section number', async () => {
		const input = makeInput()

		expect(await loadContextCode(/** @type {any} */ (input))).toEqual({
			source: `source:${sectionCode}`,
			isInSectionContext: true,
			needsDtApi: false,
		})
		expect(input.locate).toHaveBeenCalledWith(sectionCode)
		expect(input.sourcePage.loadCode).not.toHaveBeenCalled()
	})

	test('locates in the page code when the section has no live section number', async () => {
		const input = makeInput({ hasLiveSectionNumber: false })

		expect(await loadContextCode(/** @type {any} */ (input))).toEqual({
			source: `source:${pageCode}`,
			isInSectionContext: false,
			needsDtApi: false,
		})
		expect(input.section.requestCode).not.toHaveBeenCalled()
	})

	test('locates in the page code when there is no section', async () => {
		const input = makeInput()

		expect(await loadContextCode(/** @type {any} */ ({ ...input, section: undefined }))).toEqual({
			source: `source:${pageCode}`,
			isInSectionContext: false,
			needsDtApi: false,
		})
	})

	test('falls back to the page code when the section number is outdated', async () => {
		const input = makeInput({ requestCodeError: cdError('noSuchSection') })

		expect(await loadContextCode(/** @type {any} */ (input))).toEqual({
			source: `source:${pageCode}`,
			isInSectionContext: false,
			needsDtApi: false,
		})
	})

	test.each(['locateSection', 'locateComment'])(
		'falls back to the page code when locating in the section code throws %s',
		async (code) => {
			const input = makeInput({ locateErrors: { [sectionCode]: cdError(code) } })

			expect(await loadContextCode(/** @type {any} */ (input))).toEqual({
				source: `source:${pageCode}`,
				isInSectionContext: false,
				needsDtApi: false,
			})
		},
	)

	test('throws other errors of the section step without loading the page code', async () => {
		const input = makeInput({ requestCodeError: cdError('missing') })

		const error = await rejection(loadContextCode(/** @type {any} */ (input)))

		expect(error.getCode()).toBe('missing')
		expect(error.getMessage()).toBe('cf-error-getpagecode')
		expect(input.sourcePage.loadCode).not.toHaveBeenCalled()
	})

	test('throws errors other than CD errors as they are', async () => {
		const typeError = new TypeError('oops')
		const input = makeInput({ requestCodeError: typeError })

		expect(await rejection(loadContextCode(/** @type {any} */ (input)))).toBe(typeError)
	})

	test('throws a page locating error, with the message set, when there is no DT fallback', async () => {
		const input = makeInput({
			locateErrors: { [sectionCode]: cdError('locateComment'), [pageCode]: cdError('locateComment') },
		})

		const error = await rejection(loadContextCode(/** @type {any} */ (input)))

		expect(error.getCode()).toBe('locateComment')
		expect(error.getMessage()).toBe('cf-error-getpagecode')
	})
})

describe('loadContextCode with the DiscussionTools fallback', () => {
	test.each(['noSuchSection', 'locateSection', 'locateComment'])(
		'locates through DiscussionTools when the page step throws %s',
		async (code) => {
			const input = makeInput({
				hasLiveSectionNumber: false,
				locateErrors: { [pageCode]: cdError(code) },
				locateUsingDt: async () => 'source:transcluded',
			})

			expect(await loadContextCode(/** @type {any} */ (input))).toEqual({
				source: 'source:transcluded',
				isInSectionContext: false,
				needsDtApi: false,
			})
		},
	)

	test('reports that the DiscussionTools API is needed when DiscussionTools finds no source', async () => {
		const input = makeInput({
			locateErrors: { [sectionCode]: cdError('locateComment'), [pageCode]: cdError('locateComment') },
			locateUsingDt: async () => undefined,
		})

		expect(await loadContextCode(/** @type {any} */ (input))).toEqual({
			source: undefined,
			isInSectionContext: false,
			needsDtApi: true,
		})
	})

	test('throws other errors of the page step without asking DiscussionTools', async () => {
		const input = makeInput({
			hasLiveSectionNumber: false,
			loadPageCodeError: cdError('missing'),
			locateUsingDt: async () => 'source:transcluded',
		})

		const error = await rejection(loadContextCode(/** @type {any} */ (input)))

		expect(error.getCode()).toBe('missing')
		expect(error.getMessage()).toBe('cf-error-getpagecode')
		expect(input.locateUsingDt).not.toHaveBeenCalled()
	})

	test("throws DiscussionTools' errors with the message set", async () => {
		const input = makeInput({
			hasLiveSectionNumber: false,
			locateErrors: { [pageCode]: cdError('locateComment') },
			locateUsingDt: async () => {
				throw cdError('cantReply')
			},
		})

		const error = await rejection(loadContextCode(/** @type {any} */ (input)))

		expect(error.getCode()).toBe('cantReply')
		expect(error.getMessage()).toBe('cf-error-getpagecode')
	})
})
