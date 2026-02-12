import { jest, describe, beforeEach, afterEach, test, expect } from '@jest/globals'
import TagsAutocomplete from '../src/TagsAutocomplete'

// Mock dependencies
jest.mock('../src/loader/cd', () => ({
	s: jest.fn((key) => `mocked-${key}`),
	g: {
		allowedTags: ['div', 'span', 'p', 'strong', 'em', 'code', 'pre', 'blockquote'],
		msInMin: 60_000,
	},
}))

// Mock mw object
global.mw = {
	util: {
		escapeRegExp: jest.fn((str) => str.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)),
	},
}

// Import the mocked cd
import cd from '../src/loader/cd'

describe('TagsAutocomplete', () => {
	let tagsAutocomplete

	beforeEach(() => {
		tagsAutocomplete = new TagsAutocomplete()
		jest.clearAllMocks()
	})

	describe('getLabel', () => {
		it('should return the correct label', () => {
			expect(tagsAutocomplete.getLabel()).toBe('mocked-cf-autocomplete-tags-label')
			expect(cd.s).toHaveBeenCalledWith('cf-autocomplete-tags-label')
		})
	})

	describe('getTrigger', () => {
		it('should return the correct trigger character', () => {
			expect(tagsAutocomplete.getTrigger()).toBe('<')
		})
	})

	describe('validateInput', () => {
		it('should return true for valid alphabetic input', () => {
			expect(tagsAutocomplete.validateInput('div')).toBe(true)
			expect(tagsAutocomplete.validateInput('span')).toBe(true)
			expect(tagsAutocomplete.validateInput('STRONG')).toBe(true)
		})

		it('should return false for invalid input', () => {
			expect(tagsAutocomplete.validateInput('')).toBe(false)
			expect(tagsAutocomplete.validateInput('div123')).toBe(false)
			expect(tagsAutocomplete.validateInput('div-class')).toBe(false)
			expect(tagsAutocomplete.validateInput('div class')).toBe(false)
			expect(tagsAutocomplete.validateInput('123')).toBe(false)
		})
	})

	describe('getInsertionFromEntry', () => {
		it('should transform simple string tags correctly', () => {
			expect(tagsAutocomplete.getInsertionFromEntry('div')).toEqual({
				start: '<div>',
				end: '</div>',
				selectContent: true,
			})
		})

		it('should transform array tags correctly', () => {
			expect(tagsAutocomplete.getInsertionFromEntry(['br', '<br>'])).toEqual({
				start: '<br>',
				end: undefined,
				selectContent: true,
			})
		})

		it('should transform complex array tags correctly', () => {
			expect(
				tagsAutocomplete.getInsertionFromEntry(['gallery', '<gallery>\n', '\n</gallery>']),
			).toEqual({
				start: '<gallery>\n',
				end: '\n</gallery>',
				selectContent: true,
			})
		})
	})

	describe('makeApiRequest', () => {
		it('should return empty array since tags do not use API requests', async () => {
			const result = await tagsAutocomplete.makeApiRequest('div')
			expect(result).toEqual([])
		})
	})

	describe('getValues', () => {
		beforeEach(() => {
			// Mock the callback
			jest.clearAllMocks()
		})

		it('should return empty array for invalid input', async () => {
			const callback = jest.fn()
			await tagsAutocomplete.getValues('', callback)
			expect(callback).toHaveBeenCalledWith([])

			await tagsAutocomplete.getValues('123', callback)
			expect(callback).toHaveBeenCalledWith([])
		})

		it('should return matching tags for valid input', async () => {
			const callback = jest.fn()
			await tagsAutocomplete.getValues('d', callback)

			expect(callback).toHaveBeenCalled()
			const results = callback.mock.calls[0][0]
			expect(results).toBeInstanceOf(Array)
			expect(results.length).toBeGreaterThan(0)

			// Check that results contain div
			const divResult = results.find((result) => result.label === 'div')
			expect(divResult).toBeDefined()
			expect(divResult.entry).toBe('div')
		})

		it('should return case-insensitive matches', async () => {
			const callback = jest.fn()
			await tagsAutocomplete.getValues('D', callback)

			expect(callback).toHaveBeenCalled()
			const results = callback.mock.calls[0][0]
			expect(results.length).toBeGreaterThan(0)

			// Check that results contain div

			expect(results.find((result) => result.label === 'div')).toBeDefined()
		})

		it('should include custom tag additions in results', async () => {
			const callback = jest.fn()
			await tagsAutocomplete.getValues('b', callback)

			expect(callback).toHaveBeenCalled()

			// Check that results contain br tag from additions
			const brResult = callback.mock.calls[0][0].find((result) => result.label === 'br')
			expect(brResult).toBeDefined()
			expect(brResult.entry).toEqual(['br', '<br>'])
		})

		it('should filter results based on starting characters', async () => {
			const callback = jest.fn()
			await tagsAutocomplete.getValues('sp', callback)

			expect(callback).toHaveBeenCalled()
			const results = callback.mock.calls[0][0]

			// Should include span but not div

			expect(results.find((result) => result.label === 'span')).toBeDefined()
			expect(results.find((result) => result.label === 'div')).toBeUndefined()
		})
	})

	describe('defaultLazy', () => {
		it('should create a function that returns sorted tag list', () => {
			const tags = tagsAutocomplete.defaultLazy()
			expect(Array.isArray(tags)).toBe(true)
			expect(tags.length).toBeGreaterThan(0)

			// Check that it includes both allowed tags and additions
			const tagNames = tags.map((tag) => (Array.isArray(tag) ? tag[0] : tag))
			expect(tagNames).toContain('div')
			expect(tagNames).toContain('br')
			expect(tagNames).toContain('gallery')
		})

		it('should sort tags alphabetically', () => {
			const tagNames = tagsAutocomplete
				.defaultLazy()
				.map((tag) => (Array.isArray(tag) ? tag[0] : tag))

			// Check that tags are sorted
			expect(tagNames).toEqual([...tagNames].sort())
		})

		it('should not duplicate tags between allowedTags and additions', () => {
			// Add a tag that exists in both lists to test deduplication
			cd.g.allowedTags.push('br')

			// Count occurrences of 'br'
			const brCount = tagsAutocomplete
				.defaultLazy()
				.map((tag) => (Array.isArray(tag) ? tag[0] : tag))
				.filter((name) => name === 'br').length
			expect(brCount).toBe(1)

			// Clean up
			cd.g.allowedTags.pop()
		})
	})
})
