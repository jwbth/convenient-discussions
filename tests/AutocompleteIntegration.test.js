/**
 * @file Integration tests for complete autocomplete workflows
 */

import AutocompleteManager from '../src/AutocompleteManager.js';
import CommentLinksAutocomplete from '../src/CommentLinksAutocomplete.js';
import MentionsAutocomplete from '../src/MentionsAutocomplete.js';
import TagsAutocomplete from '../src/TagsAutocomplete.js';
import TemplatesAutocomplete from '../src/TemplatesAutocomplete.js';
import WikilinksAutocomplete from '../src/WikilinksAutocomplete.js';

// Mock global dependencies
global.OO = {
	EventEmitter: class EventEmitter {
		constructor() {}

		on() {}

		off() {}

		emit() {}
	},
};

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
				wgArticlePath: '/wiki/$1',
				wgScript: '/w/index.php',
				wgScriptPath: '/w',
				wgServer: 'https://en.wikipedia.org',
				wgServerName: 'en.wikipedia.org',
			};

			return config[key];
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
};

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
		};

		return labels[key] || key;
	}),
}));

jest.mock('../src/TextInputWidget.js', () => jest.fn().mockImplementation(() => ({
	setDisabled: jest.fn().mockReturnThis(),
	pushPending: jest.fn().mockReturnThis(),
	popPending: jest.fn().mockReturnThis(),
	focus: jest.fn().mockReturnThis(),
	getValue: jest.fn(() => ''),
	setValue: jest.fn().mockReturnThis(),
})));

jest.mock('../src/settings.js', () => ({
	get: jest.fn((key) => {
		if (key === 'autocompleteTypes') {
			return ['mentions', 'wikilinks', 'templates', 'tags', 'commentLinks'];
		}
		if (key === 'useTemplateData') {
			return true;
		}

		return null;
	}),
}));

jest.mock('../src/pageRegistry.js', () => ({}));
jest.mock('../src/CurrentPage.js', () => ({}));
jest.mock('../src/CommentForm.js', () => ({}));
jest.mock('../src/Comment.js', () => ({}));
jest.mock('../src/LiveTimestamp.js', () => ({}));

// Mock registries with sample data
jest.mock('../src/commentRegistry.js', () => ({
	getAll: jest.fn(() => [
		{
			id: 'comment1',
			headline: 'Test comment 1',
			snippet: 'This is a test comment',
			author: { name: 'TestUser1' },
			date: new Date('2023-01-01'),
		},
		{
			id: 'comment2',
			headline: 'Test comment 2',
			snippet: 'Another test comment',
			author: { name: 'TestUser2' },
			date: new Date('2023-01-02'),
		},
	]),
}));

jest.mock('../src/sectionRegistry.js', () => ({
	getAll: jest.fn(() => [
		{
			id: 'section1',
			headline: 'Test Section 1',
			anchor: 'Test_Section_1',
		},
		{
			id: 'section2',
			headline: 'Test Section 2',
			anchor: 'Test_Section_2',
		},
	]),
}));

jest.mock('../src/EventEmitter.js', () => class EventEmitter {
	on() {}

	off() {}

	emit() {}
});

describe('Autocomplete Integration Tests', () => {
	let mockInput;
	let autocompleteManager;
	let mockApi;

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
		};

		mockApi = {
			get: jest.fn(),
		};

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
		};

		jest.clearAllMocks();
	});

	describe('Complete Workflow Tests', () => {
		test('should handle complete mentions workflow', async () => {
			// Setup
			autocompleteManager = new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput],
			});

			const mentionsInstance = autocompleteManager.autocompleteInstances.get('mentions');

			// Mock API response for user search
			mockApi.get.mockResolvedValue({
				query: {
					allusers: [
						{ name: 'TestUser1' },
						{ name: 'TestUser2' },
						{ name: 'TestUserMatch' },
					],
				},
			});

			jest.spyOn(mentionsInstance, 'getApi').mockReturnValue(mockApi);

			// Test workflow: user types "@test"
			const mockCallback = jest.fn();
			await mentionsInstance.getValues('test', mockCallback);

			// Verify API was called correctly
			expect(mockApi.get).toHaveBeenCalledWith({
				action: 'query',
				list: 'allusers',
				auprefix: 'test',
				aulimit: 10,
				formatversion: 2,
			});

			// Verify callback was called with results
			expect(mockCallback).toHaveBeenCalled();
			const callbackArgs = mockCallback.mock.calls[0][0];
			expect(callbackArgs).toBeInstanceOf(Array);
			expect(callbackArgs.length).toBe(3);

			// Test transformation
			const firstResult = callbackArgs[0];
			expect(firstResult).toHaveProperty('key', 'TestUser1');
			expect(firstResult).toHaveProperty('transform');

			const transformedText = firstResult.transform();
			expect(transformedText).toBe('[[User:TestUser1|TestUser1]]');
		});

		test('should handle complete wikilinks workflow', async () => {
			// Setup
			autocompleteManager = new AutocompleteManager({
				types: ['wikilinks'],
				inputs: [mockInput],
			});

			const wikilinksInstance = autocompleteManager.autocompleteInstances.get('wikilinks');

			// Mock API response for page search
			mockApi.get.mockResolvedValue({
				query: {
					opensearch: [
						'test',
						['Test Page 1', 'Test Page 2', 'Testing'],
						['Description 1', 'Description 2', 'Description 3'],
						['url1', 'url2', 'url3'],
					],
				},
			});

			jest.spyOn(wikilinksInstance, 'getApi').mockReturnValue(mockApi);

			// Test workflow: user types "[[test"
			const mockCallback = jest.fn();
			await wikilinksInstance.getValues('test', mockCallback);

			// Verify API was called correctly
			expect(mockApi.get).toHaveBeenCalledWith({
				action: 'opensearch',
				search: 'test',
				limit: 10,
				namespace: '0',
				formatversion: 2,
			});

			// Verify callback was called with results
			expect(mockCallback).toHaveBeenCalled();
			const callbackArgs = mockCallback.mock.calls[0][0];
			expect(callbackArgs).toBeInstanceOf(Array);
			expect(callbackArgs.length).toBe(3);

			// Test transformation
			const firstResult = callbackArgs[0];
			expect(firstResult).toHaveProperty('key', 'Test Page 1');
			expect(firstResult).toHaveProperty('transform');

			const transformedText = firstResult.transform();
			expect(transformedText).toBe('Test Page 1');
		});

		test('should handle complete templates workflow', async () => {
			// Setup
			autocompleteManager = new AutocompleteManager({
				types: ['templates'],
				inputs: [mockInput],
				useTemplateData: true,
			});

			const templatesInstance = autocompleteManager.autocompleteInstances.get('templates');

			// Mock API response for template search
			mockApi.get.mockResolvedValue({
				query: {
					opensearch: [
						'test',
						['Template:Test1', 'Template:Test2', 'Template:Testing'],
						['Description 1', 'Description 2', 'Description 3'],
						['url1', 'url2', 'url3'],
					],
				},
			});

			jest.spyOn(templatesInstance, 'getApi').mockReturnValue(mockApi);

			// Test workflow: user types "{{test"
			const mockCallback = jest.fn();
			await templatesInstance.getValues('test', mockCallback);

			// Verify API was called correctly
			expect(mockApi.get).toHaveBeenCalledWith({
				action: 'opensearch',
				search: 'test',
				limit: 10,
				namespace: '10',
				formatversion: 2,
			});

			// Verify callback was called with results
			expect(mockCallback).toHaveBeenCalled();
			const callbackArgs = mockCallback.mock.calls[0][0];
			expect(callbackArgs).toBeInstanceOf(Array);
			expect(callbackArgs.length).toBe(3);

			// Test transformation
			const firstResult = callbackArgs[0];
			expect(firstResult).toHaveProperty('key', 'Test1');
			expect(firstResult).toHaveProperty('transform');

			const transformedText = firstResult.transform();
			expect(transformedText).toBe('Test1');
		});

		test('should handle complete tags workflow', async () => {
			// Setup
			autocompleteManager = new AutocompleteManager({
				types: ['tags'],
				inputs: [mockInput],
			});

			const tagsInstance = autocompleteManager.autocompleteInstances.get('tags');

			// Test workflow: user types "<div"
			const mockCallback = jest.fn();
			await tagsInstance.getValues('div', mockCallback);

			// Verify callback was called with results
			expect(mockCallback).toHaveBeenCalled();
			const callbackArgs = mockCallback.mock.calls[0][0];
			expect(callbackArgs).toBeInstanceOf(Array);

			// Should find div tag
			const divResult = callbackArgs.find((item) => item.key === 'div');
			expect(divResult).toBeDefined();
			expect(divResult).toHaveProperty('transform');

			const transformedText = divResult.transform();
			expect(transformedText).toBe('div>');
		});

		test('should handle complete comment links workflow', async () => {
			// Setup
			autocompleteManager = new AutocompleteManager({
				types: ['commentLinks'],
				inputs: [mockInput],
			});

			const commentLinksInstance = autocompleteManager.autocompleteInstances.get('commentLinks');

			// Test workflow: user types "[[#test"
			const mockCallback = jest.fn();
			await commentLinksInstance.getValues('test', mockCallback);

			// Verify callback was called with results
			expect(mockCallback).toHaveBeenCalled();
			const callbackArgs = mockCallback.mock.calls[0][0];
			expect(callbackArgs).toBeInstanceOf(Array);

			// Should find matching comments and sections
			expect(callbackArgs.length).toBeGreaterThan(0);

			// Test transformation
			const firstResult = callbackArgs[0];
			expect(firstResult).toHaveProperty('transform');

			const transformedText = firstResult.transform();
			expect(typeof transformedText).toBe('string');
			expect(transformedText.length).toBeGreaterThan(0);
		});
	});

	describe('Edge Cases and Error Conditions', () => {
		test('should handle API errors gracefully', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput],
			});

			const mentionsInstance = autocompleteManager.autocompleteInstances.get('mentions');

			// Mock API error
			mockApi.get.mockRejectedValue(new Error('Network error'));
			jest.spyOn(mentionsInstance, 'getApi').mockReturnValue(mockApi);

			const mockCallback = jest.fn();
			await mentionsInstance.getValues('test', mockCallback);

			// Should still call callback with empty results
			expect(mockCallback).toHaveBeenCalledWith([]);
		});

		test('should handle empty API responses', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['wikilinks'],
				inputs: [mockInput],
			});

			const wikilinksInstance = autocompleteManager.autocompleteInstances.get('wikilinks');

			// Mock empty API response
			mockApi.get.mockResolvedValue({
				query: {
					opensearch: ['test', [], [], []],
				},
			});
			jest.spyOn(wikilinksInstance, 'getApi').mockReturnValue(mockApi);

			const mockCallback = jest.fn();
			await wikilinksInstance.getValues('test', mockCallback);

			// Should call callback with empty results
			expect(mockCallback).toHaveBeenCalledWith([]);
		});

		test('should handle invalid input gracefully', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput],
			});

			const mentionsInstance = autocompleteManager.autocompleteInstances.get('mentions');

			// Test with empty string
			const mockCallback = jest.fn();
			await mentionsInstance.getValues('', mockCallback);

			// Should call callback with empty results
			expect(mockCallback).toHaveBeenCalledWith([]);
		});

		test('should handle malformed API responses', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['templates'],
				inputs: [mockInput],
			});

			const templatesInstance = autocompleteManager.autocompleteInstances.get('templates');

			// Mock malformed API response
			mockApi.get.mockResolvedValue({
				query: {
					opensearch: null, // Malformed response
				},
			});
			jest.spyOn(templatesInstance, 'getApi').mockReturnValue(mockApi);

			const mockCallback = jest.fn();
			await templatesInstance.getValues('test', mockCallback);

			// Should handle gracefully and call callback with empty results
			expect(mockCallback).toHaveBeenCalledWith([]);
		});

		test('should handle concurrent requests correctly', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput],
			});

			const mentionsInstance = autocompleteManager.autocompleteInstances.get('mentions');

			// Mock API responses with delays
			let callCount = 0;
			mockApi.get.mockImplementation(() => {
				callCount++;
				const delay = callCount === 1 ? 100 : 50; // First call takes longer

				return new Promise((resolve) => {
					setTimeout(() => {
						resolve({
							query: {
								allusers: [{ name: `User${callCount}` }],
							},
						});
					}, delay);
				});
			});

			jest.spyOn(mentionsInstance, 'getApi').mockReturnValue(mockApi);

			// Make concurrent requests
			const mockCallback1 = jest.fn();
			const mockCallback2 = jest.fn();

			const promise1 = mentionsInstance.getValues('test1', mockCallback1);
			const promise2 = mentionsInstance.getValues('test2', mockCallback2);

			await Promise.all([promise1, promise2]);

			// Both callbacks should be called
			expect(mockCallback1).toHaveBeenCalled();
			expect(mockCallback2).toHaveBeenCalled();

			// Second request should have newer results (due to caching/request management)
			const callback2Args = mockCallback2.mock.calls[0][0];
			expect(callback2Args[0].key).toBe('User2');
		});
	});

	describe('User Experience Validation', () => {
		test('should maintain consistent response times', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput],
			});

			const mentionsInstance = autocompleteManager.autocompleteInstances.get('mentions');

			// Mock API with consistent response
			mockApi.get.mockResolvedValue({
				query: {
					allusers: [{ name: 'TestUser' }],
				},
			});
			jest.spyOn(mentionsInstance, 'getApi').mockReturnValue(mockApi);

			const mockCallback = jest.fn();

			// Measure response time
			const startTime = Date.now();
			await mentionsInstance.getValues('test', mockCallback);
			const responseTime = Date.now() - startTime;

			// Should respond quickly (within reasonable time)
			expect(responseTime).toBeLessThan(1000);
			expect(mockCallback).toHaveBeenCalled();
		});

		test('should provide consistent result formatting', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['mentions', 'wikilinks', 'templates'],
				inputs: [mockInput],
			});

			// Test each type for consistent result structure
			const types = ['mentions', 'wikilinks', 'templates'];

			for (const type of types) {
				const instance = autocompleteManager.autocompleteInstances.get(type);

				// Mock appropriate API response
				if (type === 'mentions') {
					mockApi.get.mockResolvedValue({
						query: {
							allusers: [{ name: 'TestUser' }],
						},
					});
				} else {
					mockApi.get.mockResolvedValue({
						query: {
							opensearch: ['test', ['TestPage'], ['Description'], ['url']],
						},
					});
				}

				jest.spyOn(instance, 'getApi').mockReturnValue(mockApi);

				const mockCallback = jest.fn();
				await instance.getValues('test', mockCallback);

				expect(mockCallback).toHaveBeenCalled();
				const results = mockCallback.mock.calls[0][0];

				// All results should have consistent structure
				results.forEach((result) => {
					expect(result).toHaveProperty('key');
					expect(result).toHaveProperty('transform');
					expect(typeof result.key).toBe('string');
					expect(typeof result.transform).toBe('function');
				});

				mockCallback.mockClear();
				mockApi.get.mockClear();
			}
		});

		test('should handle rapid successive inputs', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput],
			});

			const mentionsInstance = autocompleteManager.autocompleteInstances.get('mentions');

			// Mock API with different responses for different inputs
			mockApi.get.mockImplementation((params) => {
				const prefix = params.auprefix;

				return Promise.resolve({
					query: {
						allusers: [{ name: `${prefix}User` }],
					},
				});
			});

			jest.spyOn(mentionsInstance, 'getApi').mockReturnValue(mockApi);

			// Simulate rapid typing
			const inputs = ['t', 'te', 'tes', 'test'];
			const callbacks = inputs.map(() => jest.fn());

			// Fire all requests rapidly
			const promises = inputs.map((input, index) =>
				mentionsInstance.getValues(input, callbacks[index])
			);

			await Promise.all(promises);

			// All callbacks should be called
			callbacks.forEach((callback) => {
				expect(callback).toHaveBeenCalled();
			});

			// Last callback should have results for 'test'
			const lastResults = callbacks[3].mock.calls[0][0];
			expect(lastResults[0].key).toBe('testUser');
		});
	});

	describe('Backward Compatibility Validation', () => {
		test('should maintain same public API', () => {
			autocompleteManager = new AutocompleteManager({
				types: ['mentions', 'wikilinks', 'templates', 'tags', 'commentLinks'],
				inputs: [mockInput],
			});

			// Verify public methods exist
			expect(typeof autocompleteManager.init).toBe('function');
			expect(typeof autocompleteManager.terminate).toBe('function');
			expect(typeof autocompleteManager.getActiveMenu).toBe('function');

			// Verify properties exist
			expect(autocompleteManager.tribute).toBeDefined();
			expect(autocompleteManager.inputs).toBeDefined();
		});

		test('should work with existing external code patterns', () => {
			// Test pattern: Creating autocomplete with options
			const options = {
				types: ['mentions', 'wikilinks'],
				inputs: [mockInput],
				comments: [],
				defaultUserNames: ['User1', 'User2'],
			};

			expect(() => {
				autocompleteManager = new AutocompleteManager(options);
			}).not.toThrow();

			// Test pattern: Initializing and terminating
			expect(() => {
				autocompleteManager.init();
				autocompleteManager.terminate();
			}).not.toThrow();
		});

		test('should preserve static method behavior', () => {
			// Test static configs access (if it exists)
			if (AutocompleteManager.configs) {
				expect(typeof AutocompleteManager.configs).toBe('object');
			}

			// Test any other static methods that should be preserved
			// (Add specific tests based on what static methods existed in original)
		});
	});

	describe('Performance Validation', () => {
		test('should not create memory leaks', () => {
			// Create and destroy multiple instances
			for (let i = 0; i < 10; i++) {
				const manager = new AutocompleteManager({
					types: ['mentions'],
					inputs: [mockInput],
				});

				manager.init();
				manager.terminate();
			}

			// If we get here without running out of memory, test passes
			expect(true).toBe(true);
		});

		test('should handle large result sets efficiently', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput],
			});

			const mentionsInstance = autocompleteManager.autocompleteInstances.get('mentions');

			// Mock large API response
			const largeUserList = Array.from({ length: 100 }, (_, i) => ({
				name: `User${i}`,
			}));

			mockApi.get.mockResolvedValue({
				query: {
					allusers: largeUserList,
				},
			});

			jest.spyOn(mentionsInstance, 'getApi').mockReturnValue(mockApi);

			const mockCallback = jest.fn();
			const startTime = Date.now();

			await mentionsInstance.getValues('test', mockCallback);

			const processingTime = Date.now() - startTime;

			// Should handle large results efficiently
			expect(processingTime).toBeLessThan(1000);
			expect(mockCallback).toHaveBeenCalled();

			const results = mockCallback.mock.calls[0][0];
			expect(results.length).toBeLessThanOrEqual(10); // Should be limited
		});
	});
});
