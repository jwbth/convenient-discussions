/**
 * @jest-environment jsdom
 */

import AutocompleteFactory from '../src/AutocompleteFactory';
import AutocompleteManager from '../src/AutocompleteManager';

// Mock dependencies
jest.mock('../src/AutocompleteFactory');
jest.mock('../src/cd', () => ({
	g: {
		contentDirection: 'ltr',
		userNamespacesRegexp: /^User:(.+)$/,
	},
	getApi: jest.fn(() => ({
		get: jest.fn(),
	})),
}));

jest.mock('../src/settings', () => ({
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

jest.mock('../src/tribute/Tribute', () => jest.fn().mockImplementation((config) => ({
	config,
	attach: jest.fn(),
	detach: jest.fn(),
	menu: null, // Will be set in tests
	current: { element: null },
})));

jest.mock('../src/utils-api', () => ({
	handleApiReject: jest.fn((error) => Promise.reject(error)),
}));

jest.mock('../src/tribute/tribute.less', () => ({}));

jest.mock('../src/shared/utils-general', () => ({
	defined: jest.fn((value) => value !== undefined && value !== null),
	sleep: jest.fn(() => Promise.resolve()),
	ucFirst: jest.fn((str) => str.charAt(0).toUpperCase() + str.slice(1)),
}));

// Mock global dependencies
global.mw = {
	util: {
		escapeRegExp: jest.fn((str) => str.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)),
	},
};

global.OO = {
	ui: {
		MultilineTextInputWidget: class MockMultilineTextInputWidget {
			on = jest.fn();
		},
	},
};

describe('AutocompleteManager', () => {
	let mockInput1; let mockInput2;
	let mockAutocompleteInstance;

	beforeEach(() => {
		jest.clearAllMocks();

		// Mock text input widgets
		mockInput1 = {
			$input: [document.createElement('textarea')],
			setDisabled: jest.fn().mockReturnThis(),
			pushPending: jest.fn().mockReturnThis(),
			popPending: jest.fn().mockReturnThis(),
			focus: jest.fn().mockReturnThis(),
			insertContent: jest.fn().mockReturnThis(),
			selectRange: jest.fn().mockReturnThis(),
			getRange: jest.fn(() => ({ to: 10 })),
		};

		mockInput2 = {
			$input: [document.createElement('input')],
			setDisabled: jest.fn().mockReturnThis(),
			pushPending: jest.fn().mockReturnThis(),
			popPending: jest.fn().mockReturnThis(),
			focus: jest.fn().mockReturnThis(),
			insertContent: jest.fn().mockReturnThis(),
			selectRange: jest.fn().mockReturnThis(),
			getRange: jest.fn(() => ({ to: 5 })),
		};

		// Mock autocomplete instance
		mockAutocompleteInstance = {
			getLabel: jest.fn(() => 'Test Label'),
			getTrigger: jest.fn(() => '@'),
			getValues: jest.fn(),
			getCollectionProperties: jest.fn(() => ({})),
		};

		AutocompleteFactory.create.mockReturnValue(mockAutocompleteInstance);
	});

	describe('constructor', () => {
		it('should create manager with basic configuration', () => {
			const manager = new AutocompleteManager({
				types: ['mentions', 'wikilinks'],
				inputs: [mockInput1, mockInput2],
			});

			expect(manager.inputs).toEqual([mockInput1, mockInput2]);
			expect(manager.autocompleteInstances).toBeInstanceOf(Map);
			expect(manager.tribute).toBeDefined();
		});

		it('should filter types based on settings', () => {
			require('../src/settings').get.mockImplementation((key) => {
				if (key === 'autocompleteTypes') {
					return ['mentions', 'templates']; // Only allow these types
				}
				if (key === 'useTemplateData') {
					return true;
				}

				return null;
			});

			const manager = new AutocompleteManager({
				types: ['mentions', 'wikilinks', 'templates', 'tags'],
				inputs: [mockInput1],
				typeConfigs: {
					mentions: { default: [] },
				},
			});

			// Should only create instances for allowed types
			expect(AutocompleteFactory.create).toHaveBeenCalledTimes(2);
			expect(AutocompleteFactory.create).toHaveBeenCalledWith('mentions', { default: [] });
			expect(AutocompleteFactory.create).toHaveBeenCalledWith('templates', {});
		});

		it('should pass comments to commentLinks autocomplete', () => {
			const comments = [{ id: 'c1' }, { id: 'c2' }];

			// Reset settings mock to allow commentLinks
			require('../src/settings').get.mockImplementation((key) => {
				if (key === 'autocompleteTypes') {
					return ['commentLinks'];
				}
				if (key === 'useTemplateData') {
					return true;
				}

				return null;
			});

			new AutocompleteManager({
				types: ['commentLinks'],
				inputs: [mockInput1],
				typeConfigs: {
					commentLinks: { data: { comments } },
				},
			});

			expect(AutocompleteFactory.create).toHaveBeenCalledWith('commentLinks', {
				data: { comments },
			});
		});

		it('should pass defaultUserNames to mentions autocomplete', () => {
			const defaultUserNames = ['User1', 'User2'];

			// Reset settings mock to allow mentions
			require('../src/settings').get.mockImplementation((key) => {
				if (key === 'autocompleteTypes') {
					return ['mentions'];
				}
				if (key === 'useTemplateData') {
					return true;
				}

				return null;
			});

			new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput1],
				typeConfigs: {
					mentions: { default: defaultUserNames },
				},
			});

			expect(AutocompleteFactory.create).toHaveBeenCalledWith('mentions', {
				default: defaultUserNames,
			});
		});

		it('should create Tribute instance with correct configuration', () => {
			new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput1],
			});

			expect(require('../src/tribute/Tribute')).toHaveBeenCalledWith({
				collection: expect.any(Array),
				allowSpaces: true,
				menuItemLimit: 10,
				noMatchTemplate: expect.any(Function),
				containerClass: 'tribute-container cd-autocompleteContainer',
				replaceTextSuffix: '',
				direction: 'ltr',
			});
		});
	});

	describe('createAutocompleteInstances', () => {
		it('should create instances for all specified types', () => {
			// Reset settings mock to allow all types
			require('../src/settings').get.mockImplementation((key) => {
				if (key === 'autocompleteTypes') {
					return ['mentions', 'wikilinks', 'templates', 'tags', 'commentLinks'];
				}
				if (key === 'useTemplateData') {
					return true;
				}

				return null;
			});

			expect(new AutocompleteManager({
				types: ['mentions', 'wikilinks', 'templates'],
				inputs: [mockInput1],
			}).autocompleteInstances.size).toBe(3);
			expect(AutocompleteFactory.create).toHaveBeenCalledTimes(3);
		});

		it('should handle empty types array', () => {
			expect(new AutocompleteManager({
				types: [],
				inputs: [mockInput1],
			}).autocompleteInstances.size).toBe(0);
			expect(AutocompleteFactory.create).not.toHaveBeenCalled();
		});
	});

	describe('getCollections', () => {
		it('should return collections for all autocomplete instances', () => {
			// Reset settings mock to allow all types
			require('../src/settings').get.mockImplementation((key) => {
				if (key === 'autocompleteTypes') {
					return ['mentions', 'wikilinks', 'templates', 'tags', 'commentLinks'];
				}
				if (key === 'useTemplateData') {
					return true;
				}

				return null;
			});

			const collections = new AutocompleteManager({
				types: ['mentions', 'wikilinks'],
				inputs: [mockInput1],
			}).getCollections();

			expect(collections).toHaveLength(2);
			expect(collections[0]).toMatchObject({
				label: 'Test Label',
				trigger: '@',
				searchOpts: { skip: true },
				selectTemplate: expect.any(Function),
				values: expect.any(Function),
			});
		});

		it('should handle empty autocomplete instances', () => {
			const collections = new AutocompleteManager({
				types: [],
				inputs: [mockInput1],
			}).getCollections();

			expect(collections).toHaveLength(0);
		});

		it('should include collection properties from instances', () => {
			mockAutocompleteInstance.getCollectionProperties.mockReturnValue({
				customProperty: 'customValue',
			});

			const collections = new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput1],
			}).getCollections();

			expect(collections[0]).toMatchObject({
				customProperty: 'customValue',
			});
		});
	});

	describe('init', () => {
		it('should attach tribute to all inputs', () => {
			const manager = new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput1, mockInput2],
			});

			manager.init();

			expect(manager.tribute.attach).toHaveBeenCalledTimes(2);
			expect(manager.tribute.attach).toHaveBeenCalledWith(mockInput1.$input[0]);
			expect(manager.tribute.attach).toHaveBeenCalledWith(mockInput2.$input[0]);
		});

		it('should set cdInput property on elements', () => {
			new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput1],
			}).init();

			expect(mockInput1.$input[0].cdInput).toBe(mockInput1);
		});

		it('should add event listeners for tribute events', () => {
			const addEventListenerSpy = jest.spyOn(mockInput1.$input[0], 'addEventListener');

			new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput1],
			}).init();

			expect(addEventListenerSpy).toHaveBeenCalledWith('tribute-active-true', expect.any(Function));
			expect(addEventListenerSpy).toHaveBeenCalledWith('tribute-active-false', expect.any(Function));
		});

		it('should handle MultilineTextInputWidget resize events', () => {
			const multilineInput = new OO.ui.MultilineTextInputWidget();
			multilineInput.$input = [document.createElement('textarea')];

			new AutocompleteManager({
				types: ['mentions'],
				inputs: [multilineInput],
			}).init();

			expect(multilineInput.on).toHaveBeenCalledWith('resize', expect.any(Function));
		});
	});

	describe('terminate', () => {
		it('should detach tribute from all inputs', () => {
			const manager = new AutocompleteManager({
				types: ['mentions'],
				inputs: [mockInput1, mockInput2],
			});

			manager.terminate();

			expect(manager.tribute.detach).toHaveBeenCalledTimes(2);
			expect(manager.tribute.detach).toHaveBeenCalledWith(mockInput1.$input[0]);
			expect(manager.tribute.detach).toHaveBeenCalledWith(mockInput2.$input[0]);
		});
	});

	describe('insertTemplateData', () => {
		let manager;
		let mockItem;

		beforeEach(() => {
			manager = new AutocompleteManager({
				types: ['templates'],
				inputs: [mockInput1],
			});

			mockItem = {
				original: {
					key: 'Infobox person',
				},
			};
		});

		it('should insert template parameters for block format', async () => {
			const mockResponse = {
				pages: {
					123: {
						format: 'block',
						params: {
							name: { required: true },
							birth_date: { suggested: true },
							occupation: {},
						},
						paramOrder: ['name', 'birth_date', 'occupation'],
					},
				},
			};

			require('../src/cd').getApi.mockReturnValue({
				get: jest.fn().mockResolvedValue(mockResponse),
			});

			await manager.insertTemplateData(mockItem, mockInput1);

			expect(mockInput1.setDisabled).toHaveBeenCalledWith(true);
			expect(mockInput1.pushPending).toHaveBeenCalled();
			expect(mockInput1.setDisabled).toHaveBeenCalledWith(false);
			expect(mockInput1.insertContent).toHaveBeenCalledWith('| name = \n| birth_date = \n');
			expect(mockInput1.selectRange).toHaveBeenCalled();
			expect(mockInput1.popPending).toHaveBeenCalled();
		});

		it('should insert template parameters for inline format', async () => {
			const mockResponse = {
				pages: {
					123: {
						format: 'inline',
						params: {
							1: { required: true },
							2: { suggested: true },
						},
						paramOrder: ['1', '2'],
					},
				},
			};

			require('../src/cd').getApi.mockReturnValue({
				get: jest.fn().mockResolvedValue(mockResponse),
			});

			await manager.insertTemplateData(mockItem, mockInput1);

			expect(mockInput1.insertContent).toHaveBeenCalledWith('|');
		});

		it('should handle API errors gracefully', async () => {
			require('../src/cd').getApi.mockReturnValue({
				get: jest.fn().mockRejectedValue(new Error('API Error')),
			});

			await manager.insertTemplateData(mockItem, mockInput1);

			expect(mockInput1.setDisabled).toHaveBeenCalledWith(true);
			expect(mockInput1.setDisabled).toHaveBeenCalledWith(false);
			expect(mockInput1.focus).toHaveBeenCalled();
			expect(mockInput1.popPending).toHaveBeenCalled();
			expect(mockInput1.insertContent).not.toHaveBeenCalled();
		});

		it('should handle empty response', async () => {
			require('../src/cd').getApi.mockReturnValue({
				get: jest.fn().mockResolvedValue({ pages: {} }),
			});

			await manager.insertTemplateData(mockItem, mockInput1);

			expect(mockInput1.setDisabled).toHaveBeenCalledWith(false);
			expect(mockInput1.focus).toHaveBeenCalled();
			expect(mockInput1.insertContent).not.toHaveBeenCalled();
		});
	});

	describe('static methods', () => {
		describe('getActiveMenu', () => {
			it('should return active menu', () => {
				const mockMenu = document.createElement('div');
				AutocompleteManager.activeMenu = mockMenu;

				expect(AutocompleteManager.getActiveMenu()).toBe(mockMenu);
			});

			it('should return undefined when no active menu', () => {
				delete AutocompleteManager.activeMenu;

				expect(AutocompleteManager.getActiveMenu()).toBeUndefined();
			});
		});

		describe('useOriginalFirstCharCase', () => {
			it('should preserve original case for first character', () => {
				expect(AutocompleteManager.useOriginalFirstCharCase('Test page', 'test')).toBe('test page');
			});

			it('should not change all-caps words', () => {
				expect(AutocompleteManager.useOriginalFirstCharCase('ABBA', 'abba')).toBe('ABBA');
			});

			it('should handle single character words', () => {
				expect(AutocompleteManager.useOriginalFirstCharCase('A page', 'a')).toBe('A page'); // Single char 'A' is considered all-caps, so no change
			});

			it('should handle case mismatch', () => {
				expect(AutocompleteManager.useOriginalFirstCharCase('Test page', 'X')).toBe('Test page');
			});
		});

		describe('search', () => {
			it('should filter and sort results correctly', () => {
				const list = ['apple', 'application', 'banana', 'grape'];

				expect(AutocompleteManager.search('app', list)).toEqual(['apple', 'application']);
			});

			it('should prioritize items that start with search text', () => {
				const results = AutocompleteManager.search('app', ['pineapple', 'application', 'apple']);

				expect(results[0]).toBe('application');
				expect(results[1]).toBe('apple');
				expect(results[2]).toBe('pineapple');
			});

			it('should be case insensitive', () => {
				const results = AutocompleteManager.search('app', ['Apple', 'BANANA', 'grape']);

				expect(results).toEqual(['Apple']);
			});

			it('should handle empty search string', () => {
				const results = AutocompleteManager.search('', ['apple', 'banana']);

				expect(results).toEqual(['apple', 'banana']);
			});

			it('should handle empty list', () => {
				expect(AutocompleteManager.search('test', [])).toEqual([]);
			});
		});
	});

	describe('static properties', () => {
		it('should have correct default values', () => {
			expect(AutocompleteManager.delay).toBe(100);
			expect(AutocompleteManager.apiConfig).toEqual({ ajax: { timeout: 5000 } });
		});
	});
});
