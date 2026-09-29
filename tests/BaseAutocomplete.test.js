import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cdMock = vi.hoisted(() => ({
	g: { msInMin: 60_000, phpCharToUpper: {} },
	debug: { logWarn: () => {} },
}))

vi.mock('../src/loader/cd', () => ({ default: cdMock }))
vi.mock('../src/shared/cd', () => ({ default: cdMock }))

import BaseAutocomplete from '../src/BaseAutocomplete'

class TestAutocomplete extends BaseAutocomplete {
	/** @override */
	makeApiRequest = vi.fn(async (/** @type {string} */ _text) => /** @type {any[]} */ ([]))

	localOnly = false

	/** @override */
	getLabelFromEntry(/** @type {any} */ entry) {
		return typeof entry === 'string' ? entry : entry.label
	}

	/** @override */
	validateInput(/** @type {string} */ text) {
		return Boolean(text) && !text.includes('#')
	}

	/** @override */
	isLocalOnly() {
		return this.localOnly
	}

	/**
	 * Expose the protected `searchLocal()` to the tests.
	 *
	 * @param {string} text
	 * @param {any[]} list
	 * @returns {any[]}
	 */
	search(text, list) {
		return this.searchLocal(text, list)
	}
}

/**
 * @param {import('../src/BaseAutocomplete').Option[]} options
 * @returns {any[]}
 */
const entriesOf = (options) => options.map((option) => option.entry)

/**
 * @param {BaseAutocomplete} autocomplete
 * @param {string} text
 * @returns {Promise<any[][]>} Entries passed to each callback call.
 */
const collectValues = async (autocomplete, text) => {
	/** @type {any[][]} */
	const calls = []
	await autocomplete.getValues(text, (options) => {
		calls.push(entriesOf(options))
	})

	return calls
}

/** @type {TestAutocomplete[]} */
let instances = []

/**
 * @param {object} [config]
 * @returns {TestAutocomplete}
 */
const create = (config) => {
	const autocomplete = new TestAutocomplete(config)
	instances.push(autocomplete)

	return autocomplete
}

afterEach(() => {
	instances.forEach((autocomplete) => {
		autocomplete.destroy()
	})
	instances = []
})

describe('BaseAutocomplete local search', () => {
	it('matches strings case-insensitively anywhere, ranking prefix matches first', () => {
		const autocomplete = create()

		expect(autocomplete.search('ba', ['Foobar', 'Bar', 'Baz', 'qux', 'abacus'])).toEqual([
			'Bar',
			'Baz',
			'Foobar',
			'abacus',
		])
	})

	it('treats regexp special characters in the query literally', () => {
		const autocomplete = create()

		expect(autocomplete.search('a.b', ['axb', 'a.b', 'A.Bc'])).toEqual(['a.b', 'A.Bc'])
		expect(autocomplete.search('(x', ['(x)', 'x'])).toEqual(['(x)'])
	})

	it('searches labeled entries by label', () => {
		const autocomplete = create()
		const list = [{ label: 'Alpha' }, { label: 'beta' }, { label: 'Gamma' }]

		expect(autocomplete.search('A', list)).toEqual(list)
		expect(autocomplete.search('mm', list)).toEqual([list[2]])
	})

	it('returns an empty list for an empty source and throws for unsupported entry types', () => {
		const autocomplete = create()

		expect(autocomplete.search('a', [])).toEqual([])
		expect(() => autocomplete.search('a', [1, 2])).toThrow()
	})

	it('drops null, undefined, and duplicate entries when building options', () => {
		const autocomplete = create()
		const options = autocomplete.getOptionsFromEntries(['a', null, 'b', undefined, 'a'])

		expect(options.map((option) => option.label)).toEqual(['a', 'b'])
		expect(options[0].autocomplete).toBe(autocomplete)
	})

	it('computes lazy default entries once', () => {
		const defaultLazy = vi.fn(() => ['a'])
		const autocomplete = create({ defaultLazy })
		autocomplete.getDefaultEntries()
		autocomplete.getDefaultEntries()

		expect(defaultLazy).toHaveBeenCalledTimes(1)
		expect(autocomplete.getDefaultEntries()).toEqual(['a'])
	})
})

describe('BaseAutocomplete.getValues', () => {
	it('returns only local matches and skips the API when the input is invalid', async () => {
		const autocomplete = create({ defaultEntries: ['a#b', 'c'] })

		expect(await collectValues(autocomplete, 'a#')).toEqual([['a#b']])
		expect(autocomplete.makeApiRequest).not.toHaveBeenCalled()
	})

	it('returns only local matches when the type is local-only', async () => {
		const autocomplete = create({ defaultEntries: ['abc'] })
		autocomplete.localOnly = true

		expect(await collectValues(autocomplete, 'ab')).toEqual([['abc']])
		expect(autocomplete.makeApiRequest).not.toHaveBeenCalled()
	})

	it('collapses double spaces in the query', async () => {
		const autocomplete = create({ defaultEntries: ['a b'] })

		expect(await collectValues(autocomplete, 'a  b')).toEqual([['a b']])
	})

	it('offers local matches plus the typed text without calling the API when there are local matches', async () => {
		const autocomplete = create({ defaultEntries: ['Foo', 'Foobar', 'Baz'] })

		expect(await collectValues(autocomplete, 'foo')).toEqual([['Foo', 'Foobar', 'foo']])
		expect(autocomplete.makeApiRequest).not.toHaveBeenCalled()
	})

	it('shows the typed text first, then API results followed by the typed text, and caches them', async () => {
		const autocomplete = create()
		autocomplete.makeApiRequest.mockResolvedValue(['Foo', 'Foobar'])

		expect(await collectValues(autocomplete, 'foo')).toEqual([['foo'], ['Foo', 'Foobar', 'foo']])
		expect(autocomplete.makeApiRequest).toHaveBeenCalledWith('foo')

		expect(await collectValues(autocomplete, 'foo')).toEqual([['Foo', 'Foobar', 'foo']])
		expect(autocomplete.makeApiRequest).toHaveBeenCalledTimes(1)
	})

	it('narrows previous API results while the query is being extended', async () => {
		const autocomplete = create()
		autocomplete.makeApiRequest.mockResolvedValueOnce(['Foo', 'Foobar', 'Fooqux'])
		await collectValues(autocomplete, 'foo')
		autocomplete.makeApiRequest.mockResolvedValueOnce(['Foobar'])

		expect(await collectValues(autocomplete, 'foob')).toEqual([['Foobar', 'foob'], ['Foobar', 'foob']])
	})

	it('forgets previous API results when the new query does not extend the previous one', async () => {
		const autocomplete = create()
		autocomplete.makeApiRequest.mockResolvedValueOnce(['Foo', 'Foobar'])
		await collectValues(autocomplete, 'foo')
		autocomplete.makeApiRequest.mockResolvedValueOnce([])

		expect((await collectValues(autocomplete, 'fo'))[0]).toEqual(['fo'])
	})

	it('discards API results of a query that has been superseded', async () => {
		const autocomplete = create()
		/** @type {(value: string[]) => void} */
		let resolveFirst = () => {}
		autocomplete.makeApiRequest.mockReturnValueOnce(
			new Promise((resolve) => {
				resolveFirst = resolve
			}),
		)
		/** @type {any[][]} */
		const calls = []
		const first = autocomplete.getValues('foo', (options) => {
			calls.push(entriesOf(options))
		})
		autocomplete.makeApiRequest.mockResolvedValueOnce(['Bar'])
		await collectValues(autocomplete, 'bar')
		resolveFirst(['Foo'])
		await first

		expect(calls).toEqual([['foo']])
		expect(autocomplete.handleCache('foo')).toBeUndefined()
	})

	it('keeps the preliminary options when the API request fails', async () => {
		const autocomplete = create()
		autocomplete.makeApiRequest.mockRejectedValueOnce(new Error('network'))

		expect(await collectValues(autocomplete, 'foo')).toEqual([['foo']])
	})

	it('prefetches only queries that pass validation', async () => {
		const autocomplete = create()
		autocomplete.makeApiRequest.mockResolvedValue(['X'])
		await autocomplete.prefetchCommonQueries(['a', 'b#'])

		expect(autocomplete.makeApiRequest).toHaveBeenCalledTimes(1)
		expect(autocomplete.handleCache('a')).toEqual(['X'])
		expect(autocomplete.handleCache('b#')).toEqual([])
	})
})

describe('BaseAutocomplete.useOriginalFirstCharCase', () => {
	it.each([
		['Foo bar', 'foo', 'foo bar'],
		['Foo bar', 'Foo', 'Foo bar'],
		['A b', 'a', 'a b'],
		['Ärger', 'ärg', 'ärger'],
		['ABBA song', 'abba', 'ABBA song'],
		['Foo', 'bar', 'Foo'],
	])('%s for query %s → %s', (result, query, expected) => {
		expect(create().useOriginalFirstCharCase(result, query)).toBe(expected)
	})
})

describe('BaseAutocomplete.makeTitleSearchRequest', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		mw.config.set('wgScriptPath', '/w')
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.unstubAllGlobals()
		BaseAutocomplete.currentPromise = undefined
	})

	it('queries the REST title search after a delay', async () => {
		const fetchMock = vi.fn(async (/** @type {string} */ _url) => ({
			ok: true,
			json: async () => ({ pages: [] }),
		}))
		vi.stubGlobal('fetch', fetchMock)
		const promise = BaseAutocomplete.makeTitleSearchRequest('Foo bar', 5)

		expect(fetchMock).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(BaseAutocomplete.delay)

		await expect(promise).resolves.toEqual({ pages: [] })
		expect(fetchMock.mock.calls[0][0]).toBe('/w/rest.php/v1/search/title?q=Foo+bar&limit=5')
	})

	it('rejects on an HTTP error', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })))
		const promise = BaseAutocomplete.makeTitleSearchRequest('Foo')
		const assertion = expect(promise).rejects.toThrow()
		await vi.advanceTimersByTimeAsync(BaseAutocomplete.delay)

		await assertion
	})

	it('rejects a request superseded by a newer one without fetching', async () => {
		const fetchMock = vi.fn(async (/** @type {string} */ _url) => ({
			ok: true,
			json: async () => ({ pages: [] }),
		}))
		vi.stubGlobal('fetch', fetchMock)
		const first = BaseAutocomplete.makeTitleSearchRequest('Fo')
		const firstAssertion = expect(first).rejects.toBeDefined()
		const second = BaseAutocomplete.makeTitleSearchRequest('Foo')
		await vi.advanceTimersByTimeAsync(BaseAutocomplete.delay)

		await firstAssertion
		await expect(second).resolves.toEqual({ pages: [] })
		expect(fetchMock).toHaveBeenCalledTimes(1)
	})
})
