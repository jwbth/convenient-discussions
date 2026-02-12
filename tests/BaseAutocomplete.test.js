/**
 * @jest-environment jsdom
 */
import { jest, describe, beforeEach, afterEach, test, expect } from '@jest/globals'


// Mock dependencies
jest.mock('../src/cd', () => ({
	getApi: () => ({
		get: jest.fn(),
	}),
	g: {
		msInMin: 60_000,
	},
}))

import BaseAutocomplete from '../src/BaseAutocomplete'
import CdError from '../src/shared/CdError'

// Mock global dependencies
global.mw = {
	util: {
		escapeRegExp: (str) => str.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`),
	},
}

describe('BaseAutocomplete', () => {
	let autocomplete

	beforeEach(() => {
		autocomplete = new BaseAutocomplete()
	})

	describe('constructor', () => {
		it('should initialize with default values', () => {
			expect(autocomplete.cache).toBeDefined()
			expect(autocomplete.cache.constructor.name).toBe('AutocompleteCache')
			expect(autocomplete.lastApiResults).toEqual([])
			expect(autocomplete.lastQuery).toBe('')
			expect(autocomplete.defaultEntries).toEqual([])
			expect(autocomplete.data).toEqual({})
		})

		it('should accept configuration options', () => {
			const config = {
				defaultEntries: ['item1', 'item2'],
				data: { key: 'value' },
			}
			const instance = new BaseAutocomplete(config)

			expect(instance.cache).toBeDefined()
			expect(instance.cache.constructor.name).toBe('AutocompleteCache')
			expect(instance.defaultEntries).toEqual(config.defaultEntries)
			expect(instance.data).toEqual(config.data)
		})
	})

	describe('abstract methods', () => {
		it('should throw error for getLabel', () => {
			expect(() => autocomplete.getLabel()).toThrow(CdError)
		})

		it('should throw error for getTrigger', () => {
			expect(() => autocomplete.getTrigger()).toThrow(CdError)
		})

		it('should throw error for getInsertionFromEntry', () => {
			expect(() => autocomplete.getInsertionFromEntry({})).toThrow(CdError)
		})

		it('should throw error for getLabelFromEntry', () => {
			expect(() => autocomplete.getLabelFromEntry({})).toThrow(CdError)
		})

		it('should throw error for validateInput', () => {
			expect(() => autocomplete.validateInput('test')).toThrow(CdError)
		})

		it('should throw error for makeApiRequest', async () => {
			await expect(autocomplete.makeApiRequest('test')).rejects.toThrow(CdError)
		})
	})

	describe('searchLocal', () => {
		it('should filter and sort results correctly', () => {
			const list = ['apple', 'application', 'banana', 'grape']

			expect(autocomplete.searchLocal('app', list)).toEqual(['apple', 'application'])
		})

		it('should prioritize items that start with search text', () => {
			const results = autocomplete.searchLocal('app', ['pineapple', 'application', 'apple'])

			// Items that start with 'app' should come first
			expect(results[0]).toBe('application')
			expect(results[1]).toBe('apple')
			expect(results[2]).toBe('pineapple')
		})

		it('should be case insensitive', () => {
			const results = autocomplete.searchLocal('app', ['Apple', 'BANANA', 'grape'])

			expect(results).toEqual(['Apple'])
		})
	})

	describe('cache methods', () => {
		it('should handle cache correctly', () => {
			autocomplete.cache.set('test', ['result1', 'result2'])

			expect(autocomplete.handleCache('test')).toEqual(['result1', 'result2'])
			expect(autocomplete.handleCache('nonexistent')).toBeUndefined()
		})

		it('should update cache correctly', () => {
			autocomplete.updateCache('query', ['result1', 'result2'])

			expect(autocomplete.cache.get('query')).toEqual(['result1', 'result2'])
		})
	})

	describe('getDefaultEntries', () => {
		it('should return existing default entries', () => {
			autocomplete.defaultEntries = ['item1', 'item2']

			expect(autocomplete.getDefaultEntries()).toEqual(['item1', 'item2'])
		})

		it('should use lazy loading when default is empty', () => {
			const lazyItems = ['lazy1', 'lazy2']
			autocomplete.defaultLazy = jest.fn(() => lazyItems)

			const result = autocomplete.getDefaultEntries()
			expect(autocomplete.defaultLazy).toHaveBeenCalled()
			expect(result).toEqual(lazyItems)
			expect(autocomplete.defaultEntries).toEqual(lazyItems)
		})

		it('should not call lazy loading when default has items', () => {
			autocomplete.defaultEntries = ['existing']
			autocomplete.defaultLazy = jest.fn()

			expect(autocomplete.getDefaultEntries()).toEqual(['existing'])
			expect(autocomplete.defaultLazy).not.toHaveBeenCalled()
		})

		it('should handle undefined defaultLazy function', () => {
			autocomplete.defaultEntries = []
			autocomplete.defaultLazy = undefined

			expect(autocomplete.getDefaultEntries()).toEqual([])
		})

		it('should handle empty default array with lazy loading', () => {
			autocomplete.defaultEntries = []
			autocomplete.defaultLazy = jest.fn(() => ['lazy'])

			expect(autocomplete.getDefaultEntries()).toEqual(['lazy'])
		})
	})

	describe('getOptionsFromEntries', () => {
		// Create a concrete implementation for testing
		class TestAutocomplete extends BaseAutocomplete {
			getLabel() {
				return 'Test'
			}

			getTrigger() {
				return '@'
			}

			getInsertionFromEntry(entry) {
				return { start: entry, end: '' }
			}

			getLabelFromEntry(entry) {
				if (entry === null || entry === undefined) return ''

				return typeof entry === 'string' ? entry : entry.label || entry[0]
			}

			validateInput() {
				return true
			}

			async makeApiRequest() {
				return []
			}
		}

		let testAutocomplete

		beforeEach(() => {
			testAutocomplete = new TestAutocomplete()
		})

		it('should process string items correctly', () => {
			const results = testAutocomplete.getOptionsFromEntries(['item1', 'item2'])

			expect(results).toHaveLength(2)
			expect(results[0].label).toBe('item1')
			expect(results[0].entry).toBe('item1')
			expect(results[0].autocomplete).toBe(testAutocomplete)
		})

		it('should process array items correctly', () => {
			const results = testAutocomplete.getOptionsFromEntries([
				['tag1', 'start', 'end'],
				['tag2', 'start2', 'end2'],
			])

			expect(results).toHaveLength(2)
			expect(results[0].label).toBe('tag1')
			expect(results[0].entry).toEqual(['tag1', 'start', 'end'])
		})

		it('should process object items with label property correctly', () => {
			const results = testAutocomplete.getOptionsFromEntries([
				{ label: 'comment1', id: 'c1' },
				{ label: 'comment2', id: 'c2' },
			])

			expect(results).toHaveLength(2)
			expect(results[0].label).toBe('comment1')
			expect(results[0].entry).toEqual({ label: 'comment1', id: 'c1' })
		})

		it('should filter out undefined and duplicate items', () => {
			const items = ['item1', undefined, 'item2', 'item1', null]

			const results = testAutocomplete.getOptionsFromEntries(items)

			expect(results).toHaveLength(2)
			expect(results.map((r) => r.label)).toEqual(['item1', 'item2'])
		})
	})

	describe('getValues', () => {
		// Create a concrete implementation for testing getValues
		class TestAutocomplete extends BaseAutocomplete {
			getLabel() {
				return 'Test'
			}

			getTrigger() {
				return '@'
			}

			getInsertionFromEntry(entry) {
				return { start: entry, end: '' }
			}

			getLabelFromEntry(entry) {
				if (entry === null || entry === undefined) return ''

				return typeof entry === 'string' ? entry : entry.label || entry[0]
			}

			validateInput = Boolean
			makeApiRequest(text) {
				return [`api-${text}`]
			}
		}

		let testAutocomplete
		let mockCallback

		beforeEach(() => {
			testAutocomplete = new TestAutocomplete()
			mockCallback = jest.fn()
		})

		it('should handle valid input with API request', async () => {
			testAutocomplete.makeApiRequest = jest.fn(() => Promise.resolve(['result1', 'result2']))

			await testAutocomplete.getValues('test', mockCallback)

			expect(testAutocomplete.makeApiRequest).toHaveBeenCalledWith('test')
			expect(mockCallback).toHaveBeenCalledWith(expect.any(Array))
		})

		it('should use cached results when available', async () => {
			testAutocomplete.cache.set('test', ['cached1', 'cached2'])

			await testAutocomplete.getValues('test', mockCallback)

			expect(mockCallback).toHaveBeenCalledWith(expect.any(Array))
			const results = mockCallback.mock.calls[0][0]
			expect(results.map((r) => r.label)).toEqual(['cached1', 'cached2'])
		})

		it('should handle invalid input', async () => {
			await testAutocomplete.getValues('', mockCallback)

			expect(mockCallback).toHaveBeenCalledWith([])
		})

		it('should handle API request errors', async () => {
			testAutocomplete.makeApiRequest = jest.fn(() => Promise.reject(new Error('API Error')))

			await testAutocomplete.getValues('test', mockCallback)

			// Should still call callback with processed results (empty in this case due to error)
			expect(mockCallback).toHaveBeenCalled()
		})
	})

	describe('static methods', () => {
		it('should track current promise for supersession checking', () => {
			const promise1 = Promise.resolve()
			const promise2 = Promise.resolve()

			BaseAutocomplete.currentPromise = promise1
			expect(() => {
				BaseAutocomplete.promiseIsNotSuperseded(promise1)
			}).not.toThrow()
			expect(() => {
				BaseAutocomplete.promiseIsNotSuperseded(promise2)
			}).toThrow(CdError)
		})

		it('should handle undefined current promise', () => {
			BaseAutocomplete.currentPromise = undefined
			const promise = Promise.resolve()

			expect(() => {
				BaseAutocomplete.promiseIsNotSuperseded(promise)
			}).toThrow(CdError)
		})

		it('should create delayed promise correctly', () => {
			const promise = BaseAutocomplete.createDelayedPromise(jest.fn())

			expect(promise).toBeInstanceOf(Promise)
			expect(BaseAutocomplete.currentPromise).toBe(promise)
			// The executor is called asynchronously after delay, not immediately
		})
	})
})
