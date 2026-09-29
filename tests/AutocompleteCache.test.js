import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const MS_IN_MIN = 60_000

vi.mock('../src/loader/cd', () => ({
	default: {
		g: { msInMin: 60_000 },
		debug: { logWarn: vi.fn() },
	},
}))

import AutocompleteCache from '../src/AutocompleteCache'
import cd from '../src/loader/cd'

describe('AutocompleteCache', () => {
	/** @type {AutocompleteCache} */
	let cache

	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(0)
	})

	afterEach(() => {
		cache.destroy()
		vi.useRealTimers()
	})

	it('returns undefined and counts a miss for an unknown key', () => {
		cache = new AutocompleteCache()

		expect(cache.get('foo')).toBeUndefined()
		expect(cache.getStats()).toMatchObject({ hits: 0, misses: 1, hitRate: 0 })
	})

	it('returns stored data and counts hits', () => {
		cache = new AutocompleteCache()
		cache.set('foo', ['a', 'b'])

		expect(cache.get('foo')).toEqual(['a', 'b'])
		cache.get('bar')
		expect(cache.getStats()).toMatchObject({ hits: 1, misses: 1, hitRate: 50, size: 1 })
	})

	it('stores a copy so that later mutations of the source array do not leak in', () => {
		cache = new AutocompleteCache()
		const data = ['a']
		cache.set('foo', data)
		data.push('b')

		expect(cache.get('foo')).toEqual(['a'])
	})

	it('expires entries after the TTL', () => {
		cache = new AutocompleteCache({ ttl: 1000 })
		cache.set('foo', ['a'])

		vi.setSystemTime(1000)
		expect(cache.has('foo')).toBe(true)
		expect(cache.get('foo')).toEqual(['a'])

		vi.setSystemTime(1001)
		expect(cache.has('foo')).toBe(false)
		expect(cache.get('foo')).toBeUndefined()
		expect(cache.size()).toBe(0)
		expect(cache.getStats().size).toBe(0)
	})

	it('does not count has() as a hit or a miss', () => {
		cache = new AutocompleteCache()
		cache.set('foo', ['a'])
		cache.has('foo')
		cache.has('bar')

		expect(cache.getStats()).toMatchObject({ hits: 0, misses: 0 })
	})

	it('evicts the least recently accessed entry when full', () => {
		cache = new AutocompleteCache({ maxSize: 2 })
		cache.set('a', ['1'])
		vi.setSystemTime(10)
		cache.set('b', ['2'])
		vi.setSystemTime(20)
		cache.get('a')
		cache.set('c', ['3'])

		expect(cache.has('a')).toBe(true)
		expect(cache.has('b')).toBe(false)
		expect(cache.has('c')).toBe(true)
		expect(cache.getStats()).toMatchObject({ evictions: 1, size: 2 })
	})

	it.fails('evicts an entry stored under the empty-string key when it is the LRU one (falsy-key check in evictLRU)', () => {
		cache = new AutocompleteCache({ maxSize: 1 })
		cache.set('', ['1'])
		vi.setSystemTime(10)
		cache.set('b', ['2'])

		expect(cache.size()).toBe(1)
	})

	it('overwrites an existing key without evicting or growing', () => {
		cache = new AutocompleteCache({ maxSize: 2 })
		cache.set('a', ['1'])
		cache.set('b', ['2'])
		cache.set('a', ['3'])

		expect(cache.get('a')).toEqual(['3'])
		expect(cache.has('b')).toBe(true)
		expect(cache.getStats()).toMatchObject({ evictions: 0, size: 2 })
	})

	it('evicts a quarter of the entries, least valuable first, under memory pressure', () => {
		// Each entry: key (1 char = 2 bytes) + data (1 char = 2 bytes) + 64 bytes overhead = 68 bytes
		cache = new AutocompleteCache({ maxMemory: 68 * 4 - 1 })
		cache.set('a', ['1'])
		vi.setSystemTime(10)
		cache.set('b', ['2'])
		cache.set('c', ['3'])
		cache.set('d', ['4'])
		cache.set('e', ['5'])

		// 4 entries exceeded the limit, so ceil(4 * 0.25) = 1 entry, the oldest, is gone
		expect(cache.has('a')).toBe(false)
		expect(['b', 'c', 'd', 'e'].every((key) => cache.has(key))).toBe(true)
		expect(cache.getStats().evictions).toBe(1)
	})

	it('estimates memory for strings, objects, and other primitives', () => {
		cache = new AutocompleteCache()

		expect(cache.estimateDataSize(['ab', { x: 1 }, 5])).toBe(4 + JSON.stringify({ x: 1 }).length * 2 + 8)
	})

	it('removes expired entries periodically', () => {
		cache = new AutocompleteCache({ ttl: 1000 })
		cache.set('foo', ['a'])
		vi.advanceTimersByTime(MS_IN_MIN)

		expect(cache.size()).toBe(0)
		expect(cache.getStats().size).toBe(0)
	})

	it('stops periodic cleanup and empties itself on destroy', () => {
		cache = new AutocompleteCache({ ttl: 1000 })
		const cleanup = vi.spyOn(cache, 'cleanup')
		cache.set('foo', ['a'])
		cache.destroy()
		vi.advanceTimersByTime(MS_IN_MIN * 2)

		expect(cleanup).not.toHaveBeenCalled()
		expect(cache.size()).toBe(0)
	})

	it('prefetches only missing keys and swallows fetch errors', async () => {
		cache = new AutocompleteCache()
		cache.set('cached', ['x'])
		const fetchFn = vi.fn(async (/** @type {string} */ key) => {
			if (key === 'bad') {
				throw new Error('boom')
			}

			return [key.toUpperCase()]
		})

		await cache.prefetch(['cached', 'new', 'bad'], fetchFn)

		expect(fetchFn.mock.calls.map(([key]) => key)).toEqual(['new', 'bad'])
		expect(cache.get('new')).toEqual(['NEW'])
		expect(cache.has('bad')).toBe(false)
		expect(cd.debug.logWarn).toHaveBeenCalled()
	})

	it('lists entries by access count', () => {
		cache = new AutocompleteCache()
		cache.set('a', [])
		cache.set('b', [])
		cache.get('b')

		expect(cache.getTopEntries(1).map(([key]) => key)).toEqual(['b'])
	})

	it('round-trips through export/import, dropping expired entries', () => {
		cache = new AutocompleteCache({ ttl: 1000 })
		cache.set('old', ['1'])
		vi.setSystemTime(500)
		cache.set('new', ['2'])
		vi.setSystemTime(1200)
		const exported = cache.export()

		expect(Object.keys(exported.entries)).toEqual(['new'])

		const other = new AutocompleteCache({ ttl: 1000 })
		other.import({ entries: { ...exported.entries, old: { data: ['1'], timestamp: 0, accessCount: 1, lastAccessed: 0 } } })

		expect(other.get('new')).toEqual(['2'])
		expect(other.has('old')).toBe(false)
		expect(other.getStats().size).toBe(1)
		other.destroy()
	})
})
