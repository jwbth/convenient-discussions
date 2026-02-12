import { jest, describe, beforeEach, afterEach, test, expect } from '@jest/globals'
import * as mock_src_cd from '../src/cd';
import MentionsAutocomplete from '../src/MentionsAutocomplete'

// Mock dependencies
jest.mock('../src/cd', () => ({
	s: jest.fn((key) => `mocked-${key}`),
	config: {
		mentionCharacter: '@',
		mentionRequiresLeadingSpace: true,
	},
	mws: jest.fn((key) => ' '),
	g: {
		userNamespacesRegexp: /^User:(.+)$/,
		contribsPages: ['Special:Contributions'],
		msInMin: 60_000,
	},
	getApi: jest.fn(() => ({
		get: jest.fn(),
	})),
}))

jest.mock('../src/userRegistry', () => ({
	get: jest.fn((name) => ({
		getNamespaceAlias: () => 'User',
		isRegistered: () => true,
	})),
}))

jest.mock('../src/BaseAutocomplete')

describe('MentionsAutocomplete', () => {
	let mentionsAutocomplete

	beforeEach(() => {
		mentionsAutocomplete = new MentionsAutocomplete()
	})

	describe('getLabel', () => {
		it('should return the mentions label', () => {
			expect(mentionsAutocomplete.getLabel()).toBe('mocked-cf-autocomplete-mentions-label')
		})
	})

	describe('getTrigger', () => {
		it('should return the mention character', () => {
			expect(mentionsAutocomplete.getTrigger()).toBe('@')
		})
	})

	describe('validateInput', () => {
		it('should validate correct input', () => {
			expect(mentionsAutocomplete.validateInput('testuser')).toBe(true)
		})

		it('should reject empty input', () => {
			expect(mentionsAutocomplete.validateInput('')).toBe(false)
		})

		it('should reject input with forbidden characters', () => {
			expect(mentionsAutocomplete.validateInput('test#user')).toBe(false)
			expect(mentionsAutocomplete.validateInput('test<user')).toBe(false)
			expect(mentionsAutocomplete.validateInput('test[user')).toBe(false)
		})

		it('should reject input that is too long', () => {
			expect(mentionsAutocomplete.validateInput('a'.repeat(86))).toBe(false)
		})

		it('should reject input with too many spaces', () => {
			// 6 spaces
			expect(mentionsAutocomplete.validateInput('a b c d e f')).toBe(false)
		})
	})

	describe('getInsertionFromEntry', () => {
		it('should transform registered user correctly', () => {
			const result = mentionsAutocomplete.getInsertionFromEntry('TestUser')

			expect(result.start).toBe('@[[User:TestUser|')
			expect(result.end).toBe(']]')
			expect(result.content).toBe('TestUser')
		})

		it('should handle user names with special characters', () => {
			const result = mentionsAutocomplete.getInsertionFromEntry('Test(User)')

			expect(result.start).toBe('@[[User:Test(User)|')
			expect(result.end).toBe('Test(User)]]') // Special characters cause name to be included in end
			expect(result.content).toBe('Test(User)')
		})

		it('should handle user names with spaces', () => {
			const result = mentionsAutocomplete.getInsertionFromEntry('Test User')

			expect(result.start).toBe('@[[User:Test User|')
			expect(result.end).toBe(']]')
			expect(result.content).toBe('Test User')
		})

		it('should handle empty user name', () => {
			const result = mentionsAutocomplete.getInsertionFromEntry('')

			expect(result.start).toBe('@[[User:|')
			expect(result.end).toBe(']]')
			expect(result.content).toBe('')
		})

		it('should trim whitespace from user name', () => {
			const result = mentionsAutocomplete.getInsertionFromEntry('  TestUser  ')

			expect(result.start).toBe('@[[User:TestUser|')
			expect(result.content).toBe('TestUser')
		})
	})

	describe('makeApiRequest', () => {
		beforeEach(() => {
			mock_src_cd.getApi.mockReturnValue({
				get: jest.fn(),
			})
		})

		it('should be defined and callable', () => {
			expect(typeof mentionsAutocomplete.makeApiRequest).toBe('function')
		})

		// Note: Full API testing requires complex mocking of AutocompleteManager static methods
		// These are covered in integration tests
	})

	describe('getCollectionProperties', () => {
		it('should return mention-specific collection properties', () => {
			const properties = mentionsAutocomplete.getCollectionProperties()

			expect(properties).toHaveProperty('requireLeadingSpace')
			expect(properties.requireLeadingSpace).toBe(true)
		})
	})
})
