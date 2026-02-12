/**
 * @jest-environment jsdom
 */
import { jest, describe, beforeEach, afterEach, test, expect } from '@jest/globals'
import * as mock_src_MentionsAutocomplete from '../src/MentionsAutocomplete';
import * as mock_src_WikilinksAutocomplete from '../src/WikilinksAutocomplete';
import * as mock_src_TemplatesAutocomplete from '../src/TemplatesAutocomplete';
import * as mock_src_TagsAutocomplete from '../src/TagsAutocomplete';
import * as mock_src_CommentLinksAutocomplete from '../src/CommentLinksAutocomplete';


import AutocompleteFactory from '../src/AutocompleteFactory'
import CdError from '../src/shared/CdError'

// Mock all autocomplete classes
jest.mock('../src/MentionsAutocomplete', () => ({
	default: jest.fn().mockImplementation((config) => ({
		type: 'mentions',
		config,
		getLabel: () => 'Mentions',
		getTrigger: () => '@',
	})),
}))

jest.mock('../src/WikilinksAutocomplete', () => ({
	default: jest.fn().mockImplementation((config) => ({
		type: 'wikilinks',
		config,
		getLabel: () => 'Wikilinks',
		getTrigger: () => '[[',
	})),
}))

jest.mock('../src/TemplatesAutocomplete', () => ({
	default: jest.fn().mockImplementation((config) => ({
		type: 'templates',
		config,
		getLabel: () => 'Templates',
		getTrigger: () => '{{',
	})),
}))

jest.mock('../src/TagsAutocomplete', () => ({
	default: jest.fn().mockImplementation((config) => ({
		type: 'tags',
		config,
		getLabel: () => 'Tags',
		getTrigger: () => '<',
	})),
}))

jest.mock('../src/CommentLinksAutocomplete', () => ({
	default: jest.fn().mockImplementation((config) => ({
		type: 'commentLinks',
		config,
		getLabel: () => 'Comment Links',
		getTrigger: () => '[[#',
	})),
}))

describe('AutocompleteFactory', () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	describe('create', () => {
		it('should create MentionsAutocomplete instance', () => {
			const config = { default: ['user1', 'user2'] }
			const instance = AutocompleteFactory.create('mentions', config)

			expect(instance.type).toBe('mentions')
			expect(instance.config).toEqual(config)
			expect(mock_src_MentionsAutocomplete.default).toHaveBeenCalledWith(config)
		})

		it('should create WikilinksAutocomplete instance', () => {
			const config = { cache: {} }
			const instance = AutocompleteFactory.create('wikilinks', config)

			expect(instance.type).toBe('wikilinks')
			expect(instance.config).toEqual(config)
			expect(mock_src_WikilinksAutocomplete.default).toHaveBeenCalledWith(config)
		})

		it('should create TemplatesAutocomplete instance', () => {
			const config = { data: { useTemplateData: true } }
			const instance = AutocompleteFactory.create('templates', config)

			expect(instance.type).toBe('templates')
			expect(instance.config).toEqual(config)
			expect(mock_src_TemplatesAutocomplete.default).toHaveBeenCalledWith(config)
		})

		it('should create TagsAutocomplete instance', () => {
			const config = { default: ['div', 'span'] }
			const instance = AutocompleteFactory.create('tags', config)

			expect(instance.type).toBe('tags')
			expect(instance.config).toEqual(config)
			expect(mock_src_TagsAutocomplete.default).toHaveBeenCalledWith(config)
		})

		it('should create CommentLinksAutocomplete instance', () => {
			const config = { data: { comments: [] } }
			const instance = AutocompleteFactory.create('commentLinks', config)

			expect(instance.type).toBe('commentLinks')
			expect(instance.config).toEqual(config)
			expect(mock_src_CommentLinksAutocomplete.default).toHaveBeenCalledWith(config)
		})

		it('should create instance with empty config when no options provided', () => {
			const instance = AutocompleteFactory.create('mentions')

			expect(instance.config).toEqual({})
			expect(mock_src_MentionsAutocomplete.default).toHaveBeenCalledWith({})
		})

		it('should throw CdError for unknown type', () => {
			expect(() => {
				AutocompleteFactory.create('unknown')
			}).toThrow(CdError)

			expect(() => {
				AutocompleteFactory.create('unknown')
			}).toThrow('Unknown autocomplete type: unknown')
		})

		it('should throw CdError for null type', () => {
			expect(() => {
				AutocompleteFactory.create(null)
			}).toThrow(CdError)
		})

		it('should throw CdError for undefined type', () => {
			expect(() => {
				AutocompleteFactory.create(undefined)
			}).toThrow(CdError)
		})
	})

	describe('getSupportedTypes', () => {
		it('should return all supported autocomplete types', () => {
			const types = AutocompleteFactory.getSupportedTypes()

			expect(types).toEqual(['mentions', 'wikilinks', 'templates', 'tags', 'commentLinks'])
		})

		it('should return array with correct length', () => {
			const types = AutocompleteFactory.getSupportedTypes()

			expect(types).toHaveLength(5)
		})

		it('should return new array each time (not reference)', () => {
			const types1 = AutocompleteFactory.getSupportedTypes()
			const types2 = AutocompleteFactory.getSupportedTypes()

			expect(types1).toEqual(types2)
			expect(types1).not.toBe(types2)
		})
	})

	describe('isTypeSupported', () => {
		it('should return true for supported types', () => {
			expect(AutocompleteFactory.isTypeSupported('mentions')).toBe(true)
			expect(AutocompleteFactory.isTypeSupported('wikilinks')).toBe(true)
			expect(AutocompleteFactory.isTypeSupported('templates')).toBe(true)
			expect(AutocompleteFactory.isTypeSupported('tags')).toBe(true)
			expect(AutocompleteFactory.isTypeSupported('commentLinks')).toBe(true)
		})

		it('should return false for unsupported types', () => {
			expect(AutocompleteFactory.isTypeSupported('unknown')).toBe(false)
			expect(AutocompleteFactory.isTypeSupported('invalid')).toBe(false)
			expect(AutocompleteFactory.isTypeSupported('')).toBe(false)
		})

		it('should return false for null and undefined', () => {
			expect(AutocompleteFactory.isTypeSupported(null)).toBe(false)
			expect(AutocompleteFactory.isTypeSupported(undefined)).toBe(false)
		})

		it('should be case sensitive', () => {
			expect(AutocompleteFactory.isTypeSupported('Mentions')).toBe(false)
			expect(AutocompleteFactory.isTypeSupported('MENTIONS')).toBe(false)
			expect(AutocompleteFactory.isTypeSupported('WikiLinks')).toBe(false)
		})
	})

	describe('integration', () => {
		it('should create different instances for different types', () => {
			const mentions = AutocompleteFactory.create('mentions')
			const wikilinks = AutocompleteFactory.create('wikilinks')

			expect(mentions.type).toBe('mentions')
			expect(wikilinks.type).toBe('wikilinks')
			expect(mentions).not.toBe(wikilinks)
		})

		it('should pass configuration correctly to all types', () => {
			const config = { test: 'value', cache: {}, default: [] }

			AutocompleteFactory.getSupportedTypes().forEach((type) => {
				const instance = AutocompleteFactory.create(type, config)
				expect(instance.config).toEqual(config)
			})
		})
	})
})
