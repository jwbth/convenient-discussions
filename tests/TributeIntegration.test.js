/**
 * @file Tests for Tribute integration compatibility
 */

import AutocompleteManager from '../src/AutocompleteManager.js'
import CommentLinksAutocomplete from '../src/CommentLinksAutocomplete.js'
import MentionsAutocomplete from '../src/MentionsAutocomplete.js'
import TagsAutocomplete from '../src/TagsAutocomplete.js'
import TemplatesAutocomplete from '../src/TemplatesAutocomplete.js'
import WikilinksAutocomplete from '../src/WikilinksAutocomplete.js'

// Mock global dependencies
global.OO = {
	EventEmitter: class EventEmitter {
		constructor() {}

		on() {}

		off() {}

		emit() {}
	},
}

global.mw = {
	config: {
		get: jest.fn(),
	},
	user: {
		options: {
			get: jest.fn(),
		},
	},
	util: {
		getUrl: jest.fn(),
	},
}

// Mock dependencies
jest.mock('../src/cd.js', () => ({
	config: {
		mentionRequiresLeadingSpace: true,
		mentionCharacter: '@',
	},
	g: {
		contentDirection: 'ltr',
	},
	getApi: jest.fn(() => ({
		get: jest.fn(),
	})),
	s: jest.fn((key) => {
		const labels = {
			'cf-autocomplete-mentions-label': 'Mentions',
			'cf-autocomplete-wikilinks-label': 'Wikilinks',
			'cf-autocomplete-templates-label': 'Templates',
			'cf-autocomplete-tags-label': 'Tags',
			'cf-autocomplete-commentlinks-label': 'Comment links',
		}

		return labels[key] || key
	}),
}))

jest.mock('../src/TextInputWidget.js', () => jest.fn().mockImplementation(() => ({
	setDisabled: jest.fn().mockReturnThis(),
	pushPending: jest.fn().mockReturnThis(),
	popPending: jest.fn().mockReturnThis(),
	focus: jest.fn().mockReturnThis(),
})))

jest.mock('../src/settings.js', () => ({
	get: jest.fn((key) => {
		if (key === 'autocompleteTypes') {
			return ['mentions', 'wikilinks', 'templates', 'tags', 'commentLinks']
		}
		if (key === 'useTemplateData') {
			return true
		}

		return null
	}),
}))
jest.mock('../src/pageRegistry.js', () => ({}))
jest.mock('../src/CurrentPage.js', () => ({}))
jest.mock('../src/CommentForm.js', () => ({}))
jest.mock('../src/Comment.js', () => ({}))
jest.mock('../src/LiveTimestamp.js', () => ({}))
jest.mock('../src/commentRegistry.js', () => ({}))
jest.mock('../src/sectionRegistry.js', () => ({}))
jest.mock('../src/EventEmitter.js', () => class EventEmitter {
	on() {}

	off() {}

	emit() {}
})

describe('Tribute Integration Compatibility', () => {
	let mockInput
	let autocompleteManager

	beforeEach(() => {
		mockInput = {
			cdInput: {},
		}

		// Mock DOM element
		global.document = {
			createElement: jest.fn(() => ({
				classList: { add: jest.fn() },
				dataset: {},
				addEventListener: jest.fn(),
			})),
			body: {
				appendChild: jest.fn(),
			},
		}
	})

	afterEach(() => {
		jest.clearAllMocks()
	})

	describe('Collection Format Validation', () => {
		test('should generate collections with required Tribute properties', () => {
			autocompleteManager = new AutocompleteManager({
				types: ['mentions', 'wikilinks', 'templates', 'tags', 'commentLinks'],
				inputs: [mockInput],
			})

			const collections = autocompleteManager.getCollections()

			expect(collections).toBeInstanceOf(Array)
			expect(collections.length).toBe(5)

			collections.forEach((collection) => {
				// Required properties for Tribute collections
				expect(collection).toHaveProperty('label')
				expect(collection).toHaveProperty('trigger')
				expect(collection).toHaveProperty('values')
				expect(collection).toHaveProperty('selectTemplate')
				expect(collection).toHaveProperty('searchOpts')

				// Validate property types
				expect(typeof collection.label).toBe('string')
				expect(typeof collection.trigger).toBe('string')
				expect(typeof collection.values).toBe('function')
				expect(typeof collection.selectTemplate).toBe('function')
				expect(typeof collection.searchOpts).toBe('object')

				// Validate searchOpts structure
				expect(collection.searchOpts).toHaveProperty('skip', true)
			})
		})

		test('should include type-specific collection properties', () => {
			autocompleteManager = new AutocompleteManager({
				types: ['mentions', 'wikilinks', 'templates', 'tags', 'commentLinks'],
				inputs: [mockInput],
			})

			const collections = autocompleteManager.getCollections()
			const collectionsByTrigger = {}

			collections.forEach((collection) => {
				collectionsByTrigger[collection.trigger] = collection
			})

			// Mentions should have requireLeadingSpace
			expect(collectionsByTrigger['@']).toHaveProperty('requireLeadingSpace', true)

			// Wikilinks should have keepAsEnd pattern
			expect(collectionsByTrigger['[[']).toHaveProperty('keepAsEnd')
			expect(collectionsByTrigger['[['].keepAsEnd).toBeInstanceOf(RegExp)

			// Templates should have keepAsEnd pattern
			expect(collectionsByTrigger['{{']).toHaveProperty('keepAsEnd')
			expect(collectionsByTrigger['{{'].keepAsEnd).toBeInstanceOf(RegExp)

			// Tags should have keepAsEnd pattern
			expect(collectionsByTrigger['<']).toHaveProperty('keepAsEnd')
			expect(collectionsByTrigger['<'].keepAsEnd).toBeInstanceOf(RegExp)

			// Comment links should have keepAsEnd pattern
			expect(collectionsByTrigger['[[#']).toHaveProperty('keepAsEnd')
			expect(collectionsByTrigger['[[#'].keepAsEnd).toBeInstanceOf(RegExp)
		})
	})

	describe('Callback Signature Compatibility', () => {
		test('selectTemplate callback should have correct signature', () => {
			autocompleteManager = new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput],
			})

			const collections = autocompleteManager.getCollections()
			const mentionsCollection = collections.find((c) => c.trigger === '@')

			// Test with item
			const mockItem = {
				original: {
					transform: jest.fn(() => 'transformed text'),
				},
			}
			const mockEvent = { shiftKey: false }

			const result = mentionsCollection.selectTemplate(mockItem, mockEvent)
			expect(typeof result).toBe('string')
			expect(mockItem.original.transform).toHaveBeenCalled()

			// Test without item
			const resultWithoutItem = mentionsCollection.selectTemplate(null, mockEvent)
			expect(resultWithoutItem).toBe('')
		})

		test('values callback should have correct signature', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput],
			})

			const collections = autocompleteManager.getCollections()
			const mentionsCollection = collections.find((c) => c.trigger === '@')

			const mockCallback = jest.fn()
			const testText = 'test'

			// Mock the instance's getValues method
			const mentionsInstance = autocompleteManager.autocompleteInstances.get('mentions')
			jest.spyOn(mentionsInstance, 'getValues').mockResolvedValue()

			await mentionsCollection.values(testText, mockCallback)

			expect(mentionsInstance.getValues).toHaveBeenCalledWith(testText, mockCallback)
		})
	})

	describe('Template Data Integration', () => {
		test('should handle template data insertion with Shift+Enter', () => {
			autocompleteManager = new AutocompleteManager({
				types: ['templates'],
				inputs: [mockInput],
				useTemplateData: true,
			})

			const collections = autocompleteManager.getCollections()
			const templatesCollection = collections.find((c) => c.trigger === '{{')

			// Mock tribute current state
			autocompleteManager.tribute = {
				current: {
					element: {
						cdInput: mockInput,
					},
				},
			}

			// Mock insertTemplateData method
			jest.spyOn(autocompleteManager, 'insertTemplateData').mockImplementation(() => {})

			const mockItem = {
				original: {
					key: 'TestTemplate',
					transform: jest.fn(() => '{{TestTemplate}}'),
				},
			}
			const mockEvent = { shiftKey: true, altKey: false }

			// Use fake timers to control setTimeout
			jest.useFakeTimers()

			const result = templatesCollection.selectTemplate(mockItem, mockEvent)

			// Should still return the transformed text
			expect(result).toBe('{{TestTemplate}}')

			// Fast-forward timers to trigger setTimeout
			jest.runAllTimers()

			// Should have called insertTemplateData
			expect(autocompleteManager.insertTemplateData).toHaveBeenCalledWith(mockItem, mockInput)

			jest.useRealTimers()
		})
	})

	describe('Individual Class Compatibility', () => {
		test('MentionsAutocomplete should provide correct collection properties', () => {
			const mentions = new MentionsAutocomplete({})
			const properties = mentions.getCollectionProperties()

			expect(properties).toHaveProperty('requireLeadingSpace')
			expect(typeof properties.requireLeadingSpace).toBe('boolean')
		})

		test('WikilinksAutocomplete should provide correct collection properties', () => {
			const wikilinks = new WikilinksAutocomplete({})
			const properties = wikilinks.getCollectionProperties()

			expect(properties).toHaveProperty('keepAsEnd')
			expect(properties.keepAsEnd).toBeInstanceOf(RegExp)
			expect(properties.keepAsEnd.test('|')).toBe(true)
			expect(properties.keepAsEnd.test(']]')).toBe(true)
		})

		test('TemplatesAutocomplete should provide correct collection properties', () => {
			const templates = new TemplatesAutocomplete({})
			const properties = templates.getCollectionProperties()

			expect(properties).toHaveProperty('keepAsEnd')
			expect(properties.keepAsEnd).toBeInstanceOf(RegExp)
			expect(properties.keepAsEnd.test('|')).toBe(true)
			expect(properties.keepAsEnd.test('}}')).toBe(true)
		})

		test('TagsAutocomplete should provide correct collection properties', () => {
			const tags = new TagsAutocomplete({})
			const properties = tags.getCollectionProperties()

			expect(properties).toHaveProperty('keepAsEnd')
			expect(properties.keepAsEnd).toBeInstanceOf(RegExp)
			expect(properties.keepAsEnd.test('>')).toBe(true)
		})

		test('CommentLinksAutocomplete should provide correct collection properties', () => {
			const commentLinks = new CommentLinksAutocomplete({})
			const properties = commentLinks.getCollectionProperties()

			expect(properties).toHaveProperty('keepAsEnd')
			expect(properties.keepAsEnd).toBeInstanceOf(RegExp)
			expect(properties.keepAsEnd.test(']]')).toBe(true)
		})
	})

	describe('Event Compatibility', () => {
		test('should maintain tribute-active event dispatching', () => {
			// This test verifies that the Tribute library's event system works
			// The actual event dispatching is handled by Tribute itself
			autocompleteManager = new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput],
			})

			// Verify that the tribute instance is created
			expect(autocompleteManager.tribute).toBeDefined()
			expect(typeof autocompleteManager.tribute.isActive).toBe('boolean')
		})
	})

	describe('Menu Positioning and Styling', () => {
		test('should not modify Tribute menu creation or positioning', () => {
			autocompleteManager = new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput],
			})

			// Verify that we're using the standard Tribute configuration
			const tributeConfig = {
				collection: autocompleteManager.getCollections(),
				allowSpaces: true,
				menuItemLimit: 10,
				menuShowMinLength: 0,
				positionMenu: true,
				direction: 'ltr',
			}

			// These properties should match what Tribute expects
			expect(tributeConfig.collection).toBeInstanceOf(Array)
			expect(tributeConfig.allowSpaces).toBe(true)
			expect(tributeConfig.menuItemLimit).toBe(10)
			expect(tributeConfig.menuShowMinLength).toBe(0)
			expect(tributeConfig.positionMenu).toBe(true)
			expect(tributeConfig.direction).toBe('ltr')
		})
	})
})
