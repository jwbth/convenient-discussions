/**
 * @file Tests to validate that refactored autocomplete behaves identically to original
 */

import AutocompleteManager from '../src/AutocompleteManager.js'

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
		get: jest.fn((key) => {
			const config = {
				wgContentLanguage: 'en',
				wgFormattedNamespaces: {
					0: '',
					1: 'Talk',
					2: 'User',
					3: 'User talk',
					4: 'Project',
					5: 'Project talk',
					10: 'Template',
					11: 'Template talk',
				},
				wgNamespaceIds: {
					'': 0,
					'talk': 1,
					'user': 2,
					'user_talk': 3,
					'project': 4,
					'project_talk': 5,
					'template': 10,
					'template_talk': 11,
				},
			}

			return config[key]
		}),
	},
	user: {
		options: {
			get: jest.fn(),
		},
	},
	util: {
		getUrl: jest.fn((title) => `/wiki/${title}`),
	},
	Api: jest.fn().mockImplementation(() => ({
		get: jest.fn(),
	})),
}

// Mock dependencies
jest.mock('../src/cd.js', () => ({
	config: {
		mentionRequiresLeadingSpace: true,
		mentionCharacter: '@',
		useTemplateData: true,
	},
	g: {
		contentDirection: 'ltr',
		namespaceIds: {
			'': 0,
			'talk': 1,
			'user': 2,
			'user_talk': 3,
			'project': 4,
			'project_talk': 5,
			'template': 10,
			'template_talk': 11,
		},
		formattedNamespaces: {
			0: '',
			1: 'Talk',
			2: 'User',
			3: 'User talk',
			4: 'Project',
			5: 'Project talk',
			10: 'Template',
			11: 'Template talk',
		},
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
	getValue: jest.fn(() => ''),
	setValue: jest.fn().mockReturnThis(),
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
jest.mock('../src/commentRegistry.js', () => ({
	getAll: jest.fn(() => []),
}))
jest.mock('../src/sectionRegistry.js', () => ({
	getAll: jest.fn(() => []),
}))
jest.mock('../src/EventEmitter.js', () => class EventEmitter {
	on() {}

	off() {}

	emit() {}
})

describe('Autocomplete Behavior Validation', () => {
	let mockInput
	let autocompleteManager
	let mockApi

	beforeEach(() => {
		mockInput = {
			cdInput: {
				setDisabled: jest.fn(),
				pushPending: jest.fn(),
				popPending: jest.fn(),
				focus: jest.fn(),
				getValue: jest.fn(() => ''),
				setValue: jest.fn(),
			},
		}

		mockApi = {
			get: jest.fn(),
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

		jest.clearAllMocks()
	})

	describe('Mentions Behavior Validation', () => {
		test('should transform mentions exactly like original implementation', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput],
			})

			const mentionsInstance = autocompleteManager.autocompleteInstances.get('mentions')

			// Mock API response
			mockApi.get.mockResolvedValue({
				query: {
					allusers: [
						{ name: 'TestUser' },
						{ name: 'Test User With Spaces' },
						{ name: 'TestUserWithUnicode测试' },
					],
				},
			})

			jest.spyOn(mentionsInstance, 'getApi').mockReturnValue(mockApi)

			const mockCallback = jest.fn()
			await mentionsInstance.getValues('test', mockCallback)

			const results = mockCallback.mock.calls[0][0]

			// Test standard user name
			const standardUser = results.find((r) => r.key === 'TestUser')
			expect(standardUser.transform()).toBe('[[User:TestUser|TestUser]]')

			// Test user name with spaces
			const spacedUser = results.find((r) => r.key === 'Test User With Spaces')
			expect(spacedUser.transform()).toBe('[[User:Test User With Spaces|Test User With Spaces]]')

			// Test user name with unicode
			const unicodeUser = results.find((r) => r.key === 'TestUserWithUnicode测试')
			expect(unicodeUser.transform()).toBe('[[User:TestUserWithUnicode测试|TestUserWithUnicode测试]]')
		})

		test('should handle mention validation exactly like original', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput],
			})

			const mentionsInstance = autocompleteManager.autocompleteInstances.get('mentions')

			// Test various input validations
			expect(mentionsInstance.validateInput('')).toBe(false)
			expect(mentionsInstance.validateInput('a')).toBe(true)
			expect(mentionsInstance.validateInput('test')).toBe(true)
			expect(mentionsInstance.validateInput('Test User')).toBe(true)
		})

		test('should make API requests with same parameters as original', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput],
			})

			const mentionsInstance = autocompleteManager.autocompleteInstances.get('mentions')

			mockApi.get.mockResolvedValue({
				query: {
					allusers: [],
				},
			})

			jest.spyOn(mentionsInstance, 'getApi').mockReturnValue(mockApi)

			await mentionsInstance.getValues('testuser', jest.fn())

			expect(mockApi.get).toHaveBeenCalledWith({
				action: 'query',
				list: 'allusers',
				auprefix: 'testuser',
				aulimit: 10,
				formatversion: 2,
			})
		})
	})

	describe('Wikilinks Behavior Validation', () => {
		test('should transform wikilinks exactly like original implementation', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['wikilinks'],
				inputs: [mockInput],
			})

			const wikilinksInstance = autocompleteManager.autocompleteInstances.get('wikilinks')

			// Mock API response
			mockApi.get.mockResolvedValue({
				query: {
					opensearch: [
						'test',
						['Test Page', 'Test Page (disambiguation)', 'Test:Namespace Page'],
						['Description 1', 'Description 2', 'Description 3'],
						['url1', 'url2', 'url3'],
					],
				},
			})

			jest.spyOn(wikilinksInstance, 'getApi').mockReturnValue(mockApi)

			const mockCallback = jest.fn()
			await wikilinksInstance.getValues('test', mockCallback)

			const results = mockCallback.mock.calls[0][0]

			// Test standard page name
			const standardPage = results.find((r) => r.key === 'Test Page')
			expect(standardPage.transform()).toBe('Test Page')

			// Test disambiguation page
			const disambigPage = results.find((r) => r.key === 'Test Page (disambiguation)')
			expect(disambigPage.transform()).toBe('Test Page (disambiguation)')

			// Test namespace page
			const namespacePage = results.find((r) => r.key === 'Test:Namespace Page')
			expect(namespacePage.transform()).toBe('Test:Namespace Page')
		})

		test('should handle colon prefix validation like original', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['wikilinks'],
				inputs: [mockInput],
			})

			const wikilinksInstance = autocompleteManager.autocompleteInstances.get('wikilinks')

			// Test colon prefix handling
			expect(wikilinksInstance.validateInput('')).toBe(false)
			expect(wikilinksInstance.validateInput('test')).toBe(true)
			expect(wikilinksInstance.validateInput(':test')).toBe(true)
			expect(wikilinksInstance.validateInput('User:test')).toBe(true)
		})

		test('should make API requests with correct namespace like original', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['wikilinks'],
				inputs: [mockInput],
			})

			const wikilinksInstance = autocompleteManager.autocompleteInstances.get('wikilinks')

			mockApi.get.mockResolvedValue({
				query: {
					opensearch: ['test', [], [], []],
				},
			})

			jest.spyOn(wikilinksInstance, 'getApi').mockReturnValue(mockApi)

			// Test main namespace
			await wikilinksInstance.getValues('test', jest.fn())
			expect(mockApi.get).toHaveBeenCalledWith({
				action: 'opensearch',
				search: 'test',
				limit: 10,
				namespace: '0',
				formatversion: 2,
			})

			mockApi.get.mockClear()

			// Test with colon prefix (all namespaces)
			await wikilinksInstance.getValues(':test', jest.fn())
			expect(mockApi.get).toHaveBeenCalledWith({
				action: 'opensearch',
				search: 'test',
				limit: 10,
				namespace: '*',
				formatversion: 2,
			})
		})
	})

	describe('Templates Behavior Validation', () => {
		test('should transform templates exactly like original implementation', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['templates'],
				inputs: [mockInput],
			})

			const templatesInstance = autocompleteManager.autocompleteInstances.get('templates')

			// Mock API response
			mockApi.get.mockResolvedValue({
				query: {
					opensearch: [
						'cite',
						['Template:Cite web', 'Template:Cite book', 'Template:Cite journal'],
						['Web citation', 'Book citation', 'Journal citation'],
						['url1', 'url2', 'url3'],
					],
				},
			})

			jest.spyOn(templatesInstance, 'getApi').mockReturnValue(mockApi)

			const mockCallback = jest.fn()
			await templatesInstance.getValues('cite', mockCallback)

			const results = mockCallback.mock.calls[0][0]

			// Test template name transformation (should remove "Template:" prefix)
			const citeWeb = results.find((r) => r.key === 'Cite web')
			expect(citeWeb.transform()).toBe('Cite web')

			const citeBook = results.find((r) => r.key === 'Cite book')
			expect(citeBook.transform()).toBe('Cite book')

			const citeJournal = results.find((r) => r.key === 'Cite journal')
			expect(citeJournal.transform()).toBe('Cite journal')
		})

		test('should make API requests to template namespace like original', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['templates'],
				inputs: [mockInput],
			})

			const templatesInstance = autocompleteManager.autocompleteInstances.get('templates')

			mockApi.get.mockResolvedValue({
				query: {
					opensearch: ['test', [], [], []],
				},
			})

			jest.spyOn(templatesInstance, 'getApi').mockReturnValue(mockApi)

			await templatesInstance.getValues('test', jest.fn())

			expect(mockApi.get).toHaveBeenCalledWith({
				action: 'opensearch',
				search: 'test',
				limit: 10,
				namespace: '10',
				formatversion: 2,
			})
		})
	})

	describe('Tags Behavior Validation', () => {
		test('should provide same tag list as original implementation', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['tags'],
				inputs: [mockInput],
			})

			const tagsInstance = autocompleteManager.autocompleteInstances.get('tags')

			const mockCallback = jest.fn()
			await tagsInstance.getValues('', mockCallback)

			const results = mockCallback.mock.calls[0][0]

			// Should include standard HTML tags
			const expectedTags = ['div', 'span', 'p', 'br', 'strong', 'em', 'code', 'pre']
			expectedTags.forEach((tagName) => {
				const tag = results.find((r) => r.key === tagName)
				expect(tag).toBeDefined()
				expect(tag.transform()).toBe(`${tagName}>`)
			})
		})

		test('should filter tags by input like original', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['tags'],
				inputs: [mockInput],
			})

			const tagsInstance = autocompleteManager.autocompleteInstances.get('tags')

			const mockCallback = jest.fn()
			await tagsInstance.getValues('div', mockCallback)

			const results = mockCallback.mock.calls[0][0]

			// Should find div tag
			const divTag = results.find((r) => r.key === 'div')
			expect(divTag).toBeDefined()

			// Should not include unrelated tags
			const spanTag = results.find((r) => r.key === 'span')
			expect(spanTag).toBeUndefined()
		})
	})

	describe('Comment Links Behavior Validation', () => {
		test('should handle empty registries like original', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['commentLinks'],
				inputs: [mockInput],
			})

			const commentLinksInstance = autocompleteManager.autocompleteInstances.get('commentLinks')

			const mockCallback = jest.fn()
			await commentLinksInstance.getValues('test', mockCallback)

			// Should call callback even with empty registries
			expect(mockCallback).toHaveBeenCalled()
			const results = mockCallback.mock.calls[0][0]
			expect(results).toBeInstanceOf(Array)
		})
	})

	describe('Caching Behavior Validation', () => {
		test('should cache results like original implementation', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput],
			})

			const mentionsInstance = autocompleteManager.autocompleteInstances.get('mentions')

			// Mock API response
			mockApi.get.mockResolvedValue({
				query: {
					allusers: [{ name: 'CachedUser' }],
				},
			})

			jest.spyOn(mentionsInstance, 'getApi').mockReturnValue(mockApi)

			// First request
			const firstCallback = jest.fn()
			await mentionsInstance.getValues('cached', firstCallback)

			expect(mockApi.get).toHaveBeenCalledTimes(1)
			expect(firstCallback).toHaveBeenCalled()

			// Second request with same input should use cache
			const secondCallback = jest.fn()
			await mentionsInstance.getValues('cached', secondCallback)

			// API should not be called again
			expect(mockApi.get).toHaveBeenCalledTimes(1)
			expect(secondCallback).toHaveBeenCalled()

			// Results should be the same
			const firstResults = firstCallback.mock.calls[0][0]
			const secondResults = secondCallback.mock.calls[0][0]
			expect(firstResults[0].key).toBe(secondResults[0].key)
		})

		test('should handle cache invalidation like original', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput],
			})

			const mentionsInstance = autocompleteManager.autocompleteInstances.get('mentions')

			// Mock different API responses
			mockApi.get
				.mockResolvedValueOnce({
					query: {
						allusers: [{ name: 'FirstUser' }],
					},
				})
				.mockResolvedValueOnce({
					query: {
						allusers: [{ name: 'SecondUser' }],
					},
				})

			jest.spyOn(mentionsInstance, 'getApi').mockReturnValue(mockApi)

			// First request
			const firstCallback = jest.fn()
			await mentionsInstance.getValues('test1', firstCallback)

			// Different request should not use cache
			const secondCallback = jest.fn()
			await mentionsInstance.getValues('test2', secondCallback)

			expect(mockApi.get).toHaveBeenCalledTimes(2)

			const firstResults = firstCallback.mock.calls[0][0]
			const secondResults = secondCallback.mock.calls[0][0]

			expect(firstResults[0].key).toBe('FirstUser')
			expect(secondResults[0].key).toBe('SecondUser')
		})
	})

	describe('Error Handling Behavior Validation', () => {
		test('should handle API errors like original implementation', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput],
			})

			const mentionsInstance = autocompleteManager.autocompleteInstances.get('mentions')

			// Mock API error
			mockApi.get.mockRejectedValue(new Error('API Error'))
			jest.spyOn(mentionsInstance, 'getApi').mockReturnValue(mockApi)

			const mockCallback = jest.fn()
			await mentionsInstance.getValues('test', mockCallback)

			// Should call callback with empty results, not throw
			expect(mockCallback).toHaveBeenCalledWith([])
		})

		test('should handle malformed API responses like original', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['wikilinks'],
				inputs: [mockInput],
			})

			const wikilinksInstance = autocompleteManager.autocompleteInstances.get('wikilinks')

			// Mock malformed response
			mockApi.get.mockResolvedValue({
				query: {
					opensearch: null, // Malformed
				},
			})

			jest.spyOn(wikilinksInstance, 'getApi').mockReturnValue(mockApi)

			const mockCallback = jest.fn()
			await wikilinksInstance.getValues('test', mockCallback)

			// Should handle gracefully
			expect(mockCallback).toHaveBeenCalledWith([])
		})
	})

	describe('Public API Compatibility', () => {
		test('should maintain same constructor signature', () => {
			// Original constructor patterns should work
			expect(() => {
				new AutocompleteManager({
					types: ['mentions'],
					inputs: [mockInput],
				})
			}).not.toThrow()

			expect(() => {
				new AutocompleteManager({
					types: ['mentions', 'wikilinks', 'templates', 'tags', 'commentLinks'],
					inputs: [mockInput],
					comments: [],
					defaultUserNames: ['User1'],
				})
			}).not.toThrow()
		})

		test('should maintain same public methods', () => {
			autocompleteManager = new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput],
			})

			// Public methods should exist and be callable
			expect(typeof autocompleteManager.init).toBe('function')
			expect(typeof autocompleteManager.terminate).toBe('function')
			expect(typeof autocompleteManager.getActiveMenu).toBe('function')

			// Should not throw when called
			expect(() => {
				autocompleteManager.init()
				autocompleteManager.terminate()
			}).not.toThrow()
		})

		test('should maintain same property access patterns', () => {
			autocompleteManager = new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput],
			})

			// Properties that external code might access
			expect(autocompleteManager.tribute).toBeDefined()
			expect(autocompleteManager.inputs).toBeDefined()
			expect(Array.isArray(autocompleteManager.inputs)).toBe(true)
		})
	})
})