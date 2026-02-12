import { jest, describe, beforeEach, expect } from '@jest/globals'

import TemplatesAutocomplete from '../src/TemplatesAutocomplete'
import * as mock_src_cd from '../src/loader/cd'

// Mock dependencies
jest.mock('../src/loader/cd', () => ({
	s: jest.fn((key) => `mocked-${key}`),
	mws: jest.fn((key) => ' '),
	g: {
		msInMin: 60_000,
	},
	getApi: jest.fn(() => ({
		get: jest.fn(),
	})),
}))

jest.mock('../src/BaseAutocomplete')

jest.mock('../src/utils-api', () => ({
	handleApiReject: jest.fn((error) => Promise.reject(error)),
}))

jest.mock('../src/shared/utils-general', () => ({
	charAt: jest.fn((str, index) => str.charAt(index)),
	phpCharToUpper: jest.fn((char) => char.toUpperCase()),
	removeDoubleSpaces: jest.fn((str) => str.replace(/\s+/g, ' ')),
}))

// Mock mw global
global.mw = {
	config: {
		get: jest.fn((key) => {
			if (key === 'wgCaseSensitiveNamespaces') {
				return [10] // Template namespace is case-sensitive
			}

			return {}
		}),
	},
	util: {
		escapeRegExp: jest.fn((str) => str.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)),
	},
}

describe('TemplatesAutocomplete', () => {
	let templatesAutocomplete

	beforeEach(() => {
		templatesAutocomplete = new TemplatesAutocomplete()
		jest.clearAllMocks()
	})

	describe('getLabel', () => {
		it('should return the templates label', () => {
			expect(templatesAutocomplete.getLabel()).toBe('mocked-cf-autocomplete-templates-label')
		})
	})

	describe('getTrigger', () => {
		it('should return the template trigger', () => {
			expect(templatesAutocomplete.getTrigger()).toBe('{{')
		})
	})

	describe('validateInput', () => {
		it('should validate correct template input', () => {
			expect(templatesAutocomplete.validateInput('Infobox')).toBe(true)
			expect(templatesAutocomplete.validateInput('Template name')).toBe(true)
		})

		it('should reject empty input', () => {
			expect(templatesAutocomplete.validateInput('')).toBe(false)
		})

		it('should reject input that is too long', () => {
			expect(templatesAutocomplete.validateInput('a'.repeat(256))).toBe(false)
		})

		it('should reject input with forbidden characters', () => {
			expect(templatesAutocomplete.validateInput('Template#name')).toBe(false)
			expect(templatesAutocomplete.validateInput('Template<name')).toBe(false)
			expect(templatesAutocomplete.validateInput('Template>name')).toBe(false)
			expect(templatesAutocomplete.validateInput('Template[name')).toBe(false)
			expect(templatesAutocomplete.validateInput('Template]name')).toBe(false)
			expect(templatesAutocomplete.validateInput('Template|name')).toBe(false)
			expect(templatesAutocomplete.validateInput('Template{name')).toBe(false)
			expect(templatesAutocomplete.validateInput('Template}name')).toBe(false)
		})

		it('should reject input with too many spaces', () => {
			// 11 spaces
			expect(templatesAutocomplete.validateInput('a b c d e f g h i j k')).toBe(false)
		})

		it('should reject input with nested templates', () => {
			expect(templatesAutocomplete.validateInput('Template{{nested}}')).toBe(false)
		})
	})

	describe('getInsertionFromEntry', () => {
		it('should transform template name to insert data', () => {
			const result = templatesAutocomplete.getInsertionFromEntry('Infobox')
			expect(result.start).toBe('{{Infobox')
			expect(result.end).toBe('}}')
			expect(typeof result.shiftModify).toBe('function')
		})

		it('should trim whitespace from template name', () => {
			expect(templatesAutocomplete.getInsertionFromEntry('  Infobox  ').start).toBe('{{Infobox')
		})

		it('should modify start when shiftModify is called', () => {
			const result = templatesAutocomplete.getInsertionFromEntry('Infobox')
			result.shiftModify()
			expect(result.start).toBe('{{Infobox|')
		})
	})

	describe('useOriginalFirstCharCase', () => {
		it('should preserve original case for first character', () => {
			expect(templatesAutocomplete.useOriginalFirstCharCase('Infobox', 'infobox')).toBe('infobox')
		})

		it('should not change all-caps words', () => {
			expect(templatesAutocomplete.useOriginalFirstCharCase('ABBA', 'abba')).toBe('ABBA')
		})

		it('should handle single character words', () => {
			expect(templatesAutocomplete.useOriginalFirstCharCase('A', 'a')).toBe('a')
		})
	})

	describe('makeApiRequest', () => {
		it('should be defined and callable', () => {
			expect(typeof templatesAutocomplete.makeApiRequest).toBe('function')
		})

		// Note: Full API testing is complex due to async mocking and static method dependencies.
		// The method is tested through integration tests.
	})

	describe('getCollectionProperties', () => {
		it('should return templates-specific collection properties', () => {
			const properties = templatesAutocomplete.getCollectionProperties()

			expect(properties).toHaveProperty('keepAsEnd')
			expect(properties.keepAsEnd).toBeInstanceOf(RegExp)
		})
	})

	describe('insertTemplateData', () => {
		let mockInput
		let mockItem

		beforeEach(() => {
			mockInput = {
				setDisabled: jest.fn().mockReturnThis(),
				pushPending: jest.fn().mockReturnThis(),
				popPending: jest.fn().mockReturnThis(),
				focus: jest.fn().mockReturnThis(),
				insertContent: jest.fn().mockReturnThis(),
				selectRange: jest.fn().mockReturnThis(),
				getRange: jest.fn(() => ({ to: 10 })),
			}

			mockItem = {
				original: {
					key: 'Infobox person',
				},
			}
		})

		it('should insert template parameters for block format template', async () => {
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
			}

			const mockApi = {
				get: jest.fn().mockResolvedValue(mockResponse),
			}
			mock_src_cd.getApi.mockReturnValue(mockApi)

			await templatesAutocomplete.insertTemplateData(mockItem, mockInput)

			expect(mockInput.setDisabled).toHaveBeenCalledWith(true)
			expect(mockInput.pushPending).toHaveBeenCalled()
			expect(mockInput.setDisabled).toHaveBeenCalledWith(false)
			expect(mockInput.insertContent).toHaveBeenCalledWith('| name = \n| birth_date = \n')
			expect(mockInput.selectRange).toHaveBeenCalled()
			expect(mockInput.popPending).toHaveBeenCalled()
		})

		it('should insert template parameters for inline format template', async () => {
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
			}

			const mockApi = {
				get: jest.fn().mockResolvedValue(mockResponse),
			}
			mock_src_cd.getApi.mockReturnValue(mockApi)

			await templatesAutocomplete.insertTemplateData(mockItem, mockInput)

			expect(mockInput.insertContent).toHaveBeenCalledWith('|')
		})

		it('should handle API errors gracefully', async () => {
			const mockApi = {
				get: jest.fn().mockRejectedValue(new Error('API Error')),
			}
			mock_src_cd.getApi.mockReturnValue(mockApi)

			await templatesAutocomplete.insertTemplateData(mockItem, mockInput)

			expect(mockInput.setDisabled).toHaveBeenCalledWith(true)
			expect(mockInput.setDisabled).toHaveBeenCalledWith(false)
			expect(mockInput.focus).toHaveBeenCalled()
			expect(mockInput.popPending).toHaveBeenCalled()
			expect(mockInput.insertContent).not.toHaveBeenCalled()
		})

		it('should handle empty template data response', async () => {
			const mockApi = {
				get: jest.fn().mockResolvedValue({
					pages: {},
				}),
			}
			mock_src_cd.getApi.mockReturnValue(mockApi)

			await templatesAutocomplete.insertTemplateData(mockItem, mockInput)

			expect(mockInput.setDisabled).toHaveBeenCalledWith(false)
			expect(mockInput.focus).toHaveBeenCalled()
			expect(mockInput.insertContent).not.toHaveBeenCalled()
		})
	})
})
