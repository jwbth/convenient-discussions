/**
 * @file End-to-end tests for complete autocomplete user workflows
 */

import AutocompleteManager from '../src/AutocompleteManager.js';

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

// Mock registries with realistic data
jest.mock('../src/commentRegistry.js', () => ({
	getAll: jest.fn(() => [
		{
			id: 'comment1',
			headline: 'Discussion about feature X',
			snippet: 'I think we should implement feature X because...',
			author: { name: 'ExampleUser' },
			date: new Date('2023-01-01'),
		},
		{
			id: 'comment2',
			headline: 'Response to feature discussion',
			snippet: 'That\'s a great idea, but we need to consider...',
			author: { name: 'AnotherUser' },
			date: new Date('2023-01-02'),
		},
	]),
}));

jest.mock('../src/sectionRegistry.js', () => ({
	getAll: jest.fn(() => [
		{
			id: 'section1',
			headline: 'Feature requests',
			anchor: 'Feature_requests',
		},
		{
			id: 'section2',
			headline: 'Bug reports',
			anchor: 'Bug_reports',
		},
	]),
}));

jest.mock('../src/EventEmitter.js', () => class EventEmitter {
	on() {}

	off() {}

	emit() {}
});

describe('Autocomplete End-to-End Workflows', () => {
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

	describe('Real-world User Scenarios', () => {
		test('should handle user mentioning another user in comment', async () => {
			// Scenario: User types "@John" to mention John Doe
			autocompleteManager = new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput],
			});

			const mentionsInstance = autocompleteManager.autocompleteInstances.get('mentions');

			// Mock realistic API response
			mockApi.get.mockResolvedValue({
				query: {
					allusers: [
						{ name: 'John Doe' },
						{ name: 'John Smith' },
						{ name: 'Johnny Walker' },
					],
				},
			});

			jest.spyOn(mentionsInstance, 'getApi').mockReturnValue(mockApi);

			// User types "John"
			const mockCallback = jest.fn();
			await mentionsInstance.getValues('John', mockCallback);

			// Should get suggestions
			expect(mockCallback).toHaveBeenCalled();
			const results = mockCallback.mock.calls[0][0];
			expect(results.length).toBe(3);

			// User selects "John Doe"
			const selectedUser = results.find((r) => r.key === 'John Doe');
			expect(selectedUser).toBeDefined();

			const insertedText = selectedUser.transform();
			expect(insertedText).toBe('[[User:John Doe|John Doe]]');
		});

		test('should handle user linking to a Wikipedia article', async () => {
			// Scenario: User types "[[JavaScript" to link to JavaScript article
			autocompleteManager = new AutocompleteManager({
				types: ['wikilinks'],
				inputs: [mockInput],
			});

			const wikilinksInstance = autocompleteManager.autocompleteInstances.get('wikilinks');

			// Mock realistic API response
			mockApi.get.mockResolvedValue({
				query: {
					opensearch: [
						'JavaScript',
						['JavaScript', 'JavaScript engine', 'JavaScript framework'],
						['Programming language', 'Software component', 'Software framework'],
						['/wiki/JavaScript', '/wiki/JavaScript_engine', '/wiki/JavaScript_framework'],
					],
				},
			});

			jest.spyOn(wikilinksInstance, 'getApi').mockReturnValue(mockApi);

			// User types "JavaScript"
			const mockCallback = jest.fn();
			await wikilinksInstance.getValues('JavaScript', mockCallback);

			// Should get suggestions
			expect(mockCallback).toHaveBeenCalled();
			const results = mockCallback.mock.calls[0][0];
			expect(results.length).toBe(3);

			// User selects "JavaScript"
			const selectedPage = results.find((r) => r.key === 'JavaScript');
			expect(selectedPage).toBeDefined();

			const insertedText = selectedPage.transform();
			expect(insertedText).toBe('JavaScript');
		});

		test('should handle user inserting a template with parameters', async () => {
			// Scenario: User types "{{cite web" to insert citation template
			autocompleteManager = new AutocompleteManager({
				types: ['templates'],
				inputs: [mockInput],
				useTemplateData: true,
			});

			const templatesInstance = autocompleteManager.autocompleteInstances.get('templates');

			// Mock realistic API response
			mockApi.get.mockResolvedValue({
				query: {
					opensearch: [
						'cite web',
						['Template:Cite web', 'Template:Cite website', 'Template:Cite webarchive'],
						['Citation template', 'Website citation', 'Archive citation'],
						['/wiki/Template:Cite_web', '/wiki/Template:Cite_website', '/wiki/Template:Cite_webarchive'],
					],
				},
			});

			jest.spyOn(templatesInstance, 'getApi').mockReturnValue(mockApi);

			// User types "cite web"
			const mockCallback = jest.fn();
			await templatesInstance.getValues('cite web', mockCallback);

			// Should get suggestions
			expect(mockCallback).toHaveBeenCalled();
			const results = mockCallback.mock.calls[0][0];
			expect(results.length).toBe(3);

			// User selects "Cite web"
			const selectedTemplate = results.find((r) => r.key === 'Cite web');
			expect(selectedTemplate).toBeDefined();

			const insertedText = selectedTemplate.transform();
			expect(insertedText).toBe('Cite web');

			// Test template data insertion with Shift+Enter
			autocompleteManager.tribute = {
				current: {
					element: {
						cdInput: mockInput,
					},
				},
			};

			jest.spyOn(autocompleteManager, 'insertTemplateData').mockImplementation(() => {});

			// Simulate Shift+Enter selection
			const collections = autocompleteManager.getCollections();
			const templatesCollection = collections.find((c) => c.trigger === '{{');

			const mockEvent = { shiftKey: true, altKey: false };
			const mockItem = {
				original: selectedTemplate,
			};

			jest.useFakeTimers();
			templatesCollection.selectTemplate(mockItem, mockEvent);
			jest.runAllTimers();

			expect(autocompleteManager.insertTemplateData).toHaveBeenCalledWith(mockItem, mockInput);
			jest.useRealTimers();
		});

		test('should handle user inserting HTML tags', async () => {
			// Scenario: User types "<div" to insert div tag
			autocompleteManager = new AutocompleteManager({
				types: ['tags'],
				inputs: [mockInput],
			});

			const tagsInstance = autocompleteManager.autocompleteInstances.get('tags');

			// User types "div"
			const mockCallback = jest.fn();
			await tagsInstance.getValues('div', mockCallback);

			// Should get suggestions
			expect(mockCallback).toHaveBeenCalled();
			const results = mockCallback.mock.calls[0][0];

			// Should find div tag
			const divTag = results.find((r) => r.key === 'div');
			expect(divTag).toBeDefined();

			const insertedText = divTag.transform();
			expect(insertedText).toBe('div>');
		});

		test('should handle user linking to existing comment', async () => {
			// Scenario: User types "[[#Discussion" to link to existing comment
			autocompleteManager = new AutocompleteManager({
				types: ['commentLinks'],
				inputs: [mockInput],
			});

			const commentLinksInstance = autocompleteManager.autocompleteInstances.get('commentLinks');

			// User types "Discussion"
			const mockCallback = jest.fn();
			await commentLinksInstance.getValues('Discussion', mockCallback);

			// Should get suggestions from comments and sections
			expect(mockCallback).toHaveBeenCalled();
			const results = mockCallback.mock.calls[0][0];
			expect(results.length).toBeGreaterThan(0);

			// Should find matching comment
			const matchingComment = results.find((r) => r.key.includes('Discussion'));
			expect(matchingComment).toBeDefined();

			const insertedText = matchingComment.transform();
			expect(typeof insertedText).toBe('string');
			expect(insertedText.length).toBeGreaterThan(0);
		});
	});

	describe('Multi-type Workflow Integration', () => {
		test('should handle switching between different autocomplete types', async () => {
			// Scenario: User uses multiple autocomplete types in same session
			autocompleteManager = new AutocompleteManager({
				types: ['mentions', 'wikilinks', 'templates'],
				inputs: [mockInput],
			});

			// Mock API responses for different types
			mockApi.get.mockImplementation((params) => {
				if (params.list === 'allusers') {
					return Promise.resolve({
						query: {
							allusers: [{ name: 'TestUser' }],
						},
					});
				} else if (params.action === 'opensearch') {
					if (params.namespace === '10') {
						// Templates
						return Promise.resolve({
							query: {
								opensearch: ['test', ['Template:Test'], ['Test template'], ['/wiki/Template:Test']],
							},
						});
					}

					// Wikilinks
					return Promise.resolve({
						query: {
							opensearch: ['test', ['Test page'], ['Test page description'], ['/wiki/Test_page']],
						},
					});
				}

				return Promise.resolve({});
			});

			// Mock API for all instances
			autocompleteManager.autocompleteInstances.forEach((instance) => {
				jest.spyOn(instance, 'getApi').mockReturnValue(mockApi);
			});

			// Test mentions
			const mentionsCallback = jest.fn();
			await autocompleteManager.autocompleteInstances.get('mentions').getValues('test', mentionsCallback);
			expect(mentionsCallback).toHaveBeenCalled();

			// Test wikilinks
			const wikilinksCallback = jest.fn();
			await autocompleteManager.autocompleteInstances.get('wikilinks').getValues('test', wikilinksCallback);
			expect(wikilinksCallback).toHaveBeenCalled();

			// Test templates
			const templatesCallback = jest.fn();
			await autocompleteManager.autocompleteInstances.get('templates').getValues('test', templatesCallback);
			expect(templatesCallback).toHaveBeenCalled();

			// All should have been called with appropriate results
			expect(mentionsCallback.mock.calls[0][0][0].key).toBe('TestUser');
			expect(wikilinksCallback.mock.calls[0][0][0].key).toBe('Test page');
			expect(templatesCallback.mock.calls[0][0][0].key).toBe('Test');
		});

		test('should maintain state isolation between types', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['mentions', 'wikilinks'],
				inputs: [mockInput],
			});

			const mentionsInstance = autocompleteManager.autocompleteInstances.get('mentions');
			const wikilinksInstance = autocompleteManager.autocompleteInstances.get('wikilinks');

			// Mock different API responses
			mockApi.get.mockImplementation((params) => {
				if (params.list === 'allusers') {
					return Promise.resolve({
						query: {
							allusers: [{ name: 'MentionUser' }],
						},
					});
				}

				return Promise.resolve({
					query: {
						opensearch: ['test', ['WikiPage'], ['Description'], ['/wiki/WikiPage']],
					},
				});
			});

			jest.spyOn(mentionsInstance, 'getApi').mockReturnValue(mockApi);
			jest.spyOn(wikilinksInstance, 'getApi').mockReturnValue(mockApi);

			// Make requests to both types
			const mentionsCallback = jest.fn();
			const wikilinksCallback = jest.fn();

			await mentionsInstance.getValues('test', mentionsCallback);
			await wikilinksInstance.getValues('test', wikilinksCallback);

			// Each should have its own results
			expect(mentionsCallback.mock.calls[0][0][0].key).toBe('MentionUser');
			expect(wikilinksCallback.mock.calls[0][0][0].key).toBe('WikiPage');

			// Cache should be separate
			expect(mentionsInstance.cache).not.toBe(wikilinksInstance.cache);
		});
	});

	describe('Error Recovery and Resilience', () => {
		test('should recover from network failures', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput],
			});

			const mentionsInstance = autocompleteManager.autocompleteInstances.get('mentions');

			// First request fails
			mockApi.get.mockRejectedValueOnce(new Error('Network error'));

			// Second request succeeds
			mockApi.get.mockResolvedValueOnce({
				query: {
					allusers: [{ name: 'RecoveredUser' }],
				},
			});

			jest.spyOn(mentionsInstance, 'getApi').mockReturnValue(mockApi);

			// First request should fail gracefully
			const firstCallback = jest.fn();
			await mentionsInstance.getValues('test1', firstCallback);
			expect(firstCallback).toHaveBeenCalledWith([]);

			// Second request should succeed
			const secondCallback = jest.fn();
			await mentionsInstance.getValues('test2', secondCallback);
			expect(secondCallback).toHaveBeenCalled();
			expect(secondCallback.mock.calls[0][0][0].key).toBe('RecoveredUser');
		});

		test('should handle partial API failures', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['mentions', 'wikilinks'],
				inputs: [mockInput],
			});

			const mentionsInstance = autocompleteManager.autocompleteInstances.get('mentions');
			const wikilinksInstance = autocompleteManager.autocompleteInstances.get('wikilinks');

			// Mentions API fails, wikilinks succeeds
			mockApi.get.mockImplementation((params) => {
				if (params.list === 'allusers') {
					return Promise.reject(new Error('Mentions API down'));
				}

				return Promise.resolve({
					query: {
						opensearch: ['test', ['WorkingPage'], ['Description'], ['/wiki/WorkingPage']],
					},
				});
			});

			jest.spyOn(mentionsInstance, 'getApi').mockReturnValue(mockApi);
			jest.spyOn(wikilinksInstance, 'getApi').mockReturnValue(mockApi);

			// Mentions should fail gracefully
			const mentionsCallback = jest.fn();
			await mentionsInstance.getValues('test', mentionsCallback);
			expect(mentionsCallback).toHaveBeenCalledWith([]);

			// Wikilinks should still work
			const wikilinksCallback = jest.fn();
			await wikilinksInstance.getValues('test', wikilinksCallback);
			expect(wikilinksCallback).toHaveBeenCalled();
			expect(wikilinksCallback.mock.calls[0][0][0].key).toBe('WorkingPage');
		});
	});

	describe('Performance Under Load', () => {
		test('should handle rapid user input efficiently', async () => {
			autocompleteManager = new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput],
			});

			const mentionsInstance = autocompleteManager.autocompleteInstances.get('mentions');

			// Mock API with realistic delay
			mockApi.get.mockImplementation((params) =>
				new Promise((resolve) => {
					setTimeout(() => {
						resolve({
							query: {
								allusers: [{ name: `${params.auprefix}User` }],
							},
						});
					}, 50);
				})
			);

			jest.spyOn(mentionsInstance, 'getApi').mockReturnValue(mockApi);

			// Simulate rapid typing
			const inputs = ['a', 'ab', 'abc', 'abcd'];
			const callbacks = inputs.map(() => jest.fn());

			const startTime = Date.now();

			// Fire all requests
			const promises = inputs.map((input, index) =>
				mentionsInstance.getValues(input, callbacks[index])
			);

			await Promise.all(promises);

			const totalTime = Date.now() - startTime;

			// Should complete in reasonable time
			expect(totalTime).toBeLessThan(1000);

			// All callbacks should be called
			callbacks.forEach((callback) => {
				expect(callback).toHaveBeenCalled();
			});
		});

		test('should handle concurrent requests from multiple inputs', async () => {
			const input1 = { cdInput: {} };
			const input2 = { cdInput: {} };

			autocompleteManager = new AutocompleteManager({
				types: ['mentions'],
				inputs: [input1, input2],
			});

			const mentionsInstance = autocompleteManager.autocompleteInstances.get('mentions');

			mockApi.get.mockImplementation((params) =>
				Promise.resolve({
					query: {
						allusers: [{ name: `${params.auprefix}User` }],
					},
				})
			);

			jest.spyOn(mentionsInstance, 'getApi').mockReturnValue(mockApi);

			// Concurrent requests from different inputs
			const callback1 = jest.fn();
			const callback2 = jest.fn();

			const promise1 = mentionsInstance.getValues('user1', callback1);
			const promise2 = mentionsInstance.getValues('user2', callback2);

			await Promise.all([promise1, promise2]);

			// Both should complete successfully
			expect(callback1).toHaveBeenCalled();
			expect(callback2).toHaveBeenCalled();

			expect(callback1.mock.calls[0][0][0].key).toBe('user1User');
			expect(callback2.mock.calls[0][0][0].key).toBe('user2User');
		});
	});

	describe('Complete User Journey Validation', () => {
		test('should support complete comment composition workflow', async () => {
			// Scenario: User composes a comment with mentions, links, and templates
			autocompleteManager = new AutocompleteManager({
				types: ['mentions', 'wikilinks', 'templates'],
				inputs: [mockInput],
			});

			// Mock all API responses
			mockApi.get.mockImplementation((params) => {
				if (params.list === 'allusers') {
					return Promise.resolve({
						query: {
							allusers: [{ name: 'ExpertUser' }],
						},
					});
				} else if (params.namespace === '10') {
					return Promise.resolve({
						query: {
							opensearch: ['reflist', ['Template:Reflist'], ['Reference list'], ['/wiki/Template:Reflist']],
						},
					});
				}

				return Promise.resolve({
					query: {
						opensearch: ['JavaScript', ['JavaScript'], ['Programming language'], ['/wiki/JavaScript']],
					},
				});
			});

			// Mock API for all instances
			autocompleteManager.autocompleteInstances.forEach((instance) => {
				jest.spyOn(instance, 'getApi').mockReturnValue(mockApi);
			});

			// Step 1: User mentions an expert
			const mentionsCallback = jest.fn();
			await autocompleteManager.autocompleteInstances.get('mentions').getValues('Expert', mentionsCallback);
			expect(mentionsCallback).toHaveBeenCalled();
			const mentionResult = mentionsCallback.mock.calls[0][0][0];
			expect(mentionResult.transform()).toBe('[[User:ExpertUser|ExpertUser]]');

			// Step 2: User links to an article
			const wikilinksCallback = jest.fn();
			await autocompleteManager.autocompleteInstances.get('wikilinks').getValues('JavaScript', wikilinksCallback);
			expect(wikilinksCallback).toHaveBeenCalled();
			const linkResult = wikilinksCallback.mock.calls[0][0][0];
			expect(linkResult.transform()).toBe('JavaScript');

			// Step 3: User adds a template
			const templatesCallback = jest.fn();
			await autocompleteManager.autocompleteInstances.get('templates').getValues('reflist', templatesCallback);
			expect(templatesCallback).toHaveBeenCalled();
			const templateResult = templatesCallback.mock.calls[0][0][0];
			expect(templateResult.transform()).toBe('Reflist');

			// All components should work together seamlessly
			expect(mentionResult).toBeDefined();
			expect(linkResult).toBeDefined();
			expect(templateResult).toBeDefined();
		});
	});
});
