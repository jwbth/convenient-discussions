/**
 * Tests for WikilinksAutocomplete section autocomplete functionality.
 */

import WikilinksAutocomplete from '../src/WikilinksAutocomplete'
import cd from '../src/loader/cd'

// Mock dependencies
jest.mock('../src/loader/cd')

describe('WikilinksAutocomplete - Section Autocomplete', () => {
	let autocomplete
	let mockApi

	beforeEach(() => {
		// Setup mocks
		mockApi = {
			get: jest.fn(),
		}

		cd.getApi = jest.fn(() => mockApi)
		cd.s = jest.fn((key) => key)
		cd.mws = jest.fn(() => ' ')
		cd.g = {
			colonNamespacesPrefixRegexp: /^:/,
			msInMin: 60_000,
			phpCharToUpper: {},
		}

		global.mw = {
			config: {
				get: jest.fn((key) => {
					if (key === 'wgNamespaceIds') {
						return { '': 0, 'talk': 1, 'user': 2, 'user_talk': 3 }
					}
					if (key === 'wgCaseSensitiveNamespaces') {
						return []
					}

					return null
				}),
			},
			Title: {
				newFromText: jest.fn((text) => {
					if (!text || text.includes('<') || text.includes('>')) {
						return null
					}

					return {
						getPrefixedText: () => text.split('#')[0],
						getNamespaceId: () => 0,
					}
				}),
			},
			util: {
				escapeRegExp: (str) => str.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`),
			},
		}

		autocomplete = new WikilinksAutocomplete()
	})

	afterEach(() => {
		jest.clearAllMocks()
	})

	describe('detectSectionFragment', () => {
		test('detects section fragment with valid page name', () => {
			const result = autocomplete.detectSectionFragment('Wikipedia#History')

			expect(result).toEqual({
				pageName: 'Wikipedia',
				fragment: 'History',
			})
		})

		test('returns undefined when no # present', () => {
			const result = autocomplete.detectSectionFragment('Wikipedia')

			expect(result).toBeUndefined()
		})

		test('returns undefined when page name is empty', () => {
			const result = autocomplete.detectSectionFragment('#History')

			expect(result).toBeUndefined()
		})

		test('handles empty fragment', () => {
			const result = autocomplete.detectSectionFragment('Wikipedia#')

			expect(result).toEqual({
				pageName: 'Wikipedia',
				fragment: '',
			})
		})

		test('handles multiple # characters', () => {
			const result = autocomplete.detectSectionFragment('Wikipedia#Section#Subsection')

			expect(result).toEqual({
				pageName: 'Wikipedia',
				fragment: 'Section#Subsection',
			})
		})
	})

	describe('validateInput', () => {
		test('validates page names without sections', () => {
			expect(autocomplete.validateInput('Wikipedia')).toBe(true)
			expect(autocomplete.validateInput('User:Example')).toBe(true)
		})

		test('validates page names with sections', () => {
			expect(autocomplete.validateInput('Wikipedia#History')).toBe(true)
			expect(autocomplete.validateInput('Wikipedia#')).toBe(true)
		})

		test('rejects invalid page names', () => {
			expect(autocomplete.validateInput('Page<Name')).toBe(false)
			expect(autocomplete.validateInput('Page[Name')).toBe(false)
		})

		test('rejects invalid section fragments', () => {
			expect(autocomplete.validateInput('Wikipedia#Section<Invalid')).toBe(false)
			expect(autocomplete.validateInput('Wikipedia#Section[Invalid')).toBe(false)
		})

		test('allows # in section fragments', () => {
			// Page#Name is valid: "Page" is valid page name, "Name" is valid section
			expect(autocomplete.validateInput('Page#Name')).toBe(true)
			// Multiple # are allowed in section fragments
			expect(autocomplete.validateInput('Wikipedia#Section#Subsection')).toBe(true)
		})
	})

	describe('validatePageName', () => {
		test('validates normal page names', () => {
			expect(autocomplete.validatePageName('Wikipedia')).toBe(true)
			expect(autocomplete.validatePageName('User:Example')).toBe(true)
		})

		test('rejects page names with #', () => {
			expect(autocomplete.validatePageName('Page#Section')).toBe(false)
		})

		test('rejects page names with forbidden characters', () => {
			expect(autocomplete.validatePageName('Page<Name')).toBe(false)
			expect(autocomplete.validatePageName('Page>Name')).toBe(false)
			expect(autocomplete.validatePageName('Page[Name')).toBe(false)
			expect(autocomplete.validatePageName('Page]Name')).toBe(false)
			expect(autocomplete.validatePageName('Page|Name')).toBe(false)
			expect(autocomplete.validatePageName('Page{Name')).toBe(false)
			expect(autocomplete.validatePageName('Page}Name')).toBe(false)
		})
	})

	describe('validateSectionFragment', () => {
		test('validates normal section fragments', () => {
			expect(autocomplete.validateSectionFragment('History')).toBe(true)
			expect(autocomplete.validateSectionFragment('Section 1')).toBe(true)
			expect(autocomplete.validateSectionFragment('')).toBe(true)
		})

		test('allows # in section fragments', () => {
			expect(autocomplete.validateSectionFragment('Section#Subsection')).toBe(true)
		})

		test('rejects section fragments with forbidden characters', () => {
			expect(autocomplete.validateSectionFragment('Section<Invalid')).toBe(false)
			expect(autocomplete.validateSectionFragment('Section>Invalid')).toBe(false)
			expect(autocomplete.validateSectionFragment('Section[Invalid')).toBe(false)
			expect(autocomplete.validateSectionFragment('Section]Invalid')).toBe(false)
			expect(autocomplete.validateSectionFragment('Section|Invalid')).toBe(false)
		})
	})

	describe('normalizeSectionName', () => {
		test('converts to lowercase', () => {
			expect(autocomplete.normalizeSectionName('History')).toBe('history')
			expect(autocomplete.normalizeSectionName('SECTION')).toBe('section')
		})

		test('replaces underscores with spaces', () => {
			expect(autocomplete.normalizeSectionName('Section_Name')).toBe('section name')
			expect(autocomplete.normalizeSectionName('Multiple_Under_Scores')).toBe(
				'multiple under scores',
			)
		})

		test('handles mixed case and underscores', () => {
			expect(autocomplete.normalizeSectionName('Section_Name_Example')).toBe('section name example')
		})
	})

	describe('getSectionSuggestions', () => {
		test('fetches sections from API and filters by query', async () => {
			mockApi.get.mockResolvedValue({
				parse: {
					sections: [
						{ linkAnchor: 'History', line: 'History' },
						{ linkAnchor: 'Geography', line: 'Geography' },
						{ linkAnchor: 'Historical_events', line: 'Historical events' },
					],
				},
			})

			const results = await autocomplete.getSectionSuggestions('Wikipedia', 'hist')

			expect(mockApi.get).toHaveBeenCalledWith({
				action: 'parse',
				page: 'Wikipedia',
				prop: 'sections',
			})

			expect(results).toEqual(['Wikipedia#History', 'Wikipedia#Historical events'])
		})

		test('prioritizes prefix matches over contains matches', async () => {
			mockApi.get.mockResolvedValue({
				parse: {
					sections: [
						{ linkAnchor: 'Early_history', line: 'Early history' },
						{ linkAnchor: 'History', line: 'History' },
						{ linkAnchor: 'Prehistory', line: 'Prehistory' },
					],
				},
			})

			const results = await autocomplete.getSectionSuggestions('Wikipedia', 'hist')

			// 'History' should come first as it's a prefix match
			expect(results[0]).toBe('Wikipedia#History')
		})

		test('shows all sections when fragment is empty', async () => {
			mockApi.get.mockResolvedValue({
				parse: {
					sections: [
						{ linkAnchor: 'Section_1', line: 'Section 1' },
						{ linkAnchor: 'Section_2', line: 'Section 2' },
						{ linkAnchor: 'Section_3', line: 'Section 3' },
					],
				},
			})

			const results = await autocomplete.getSectionSuggestions('Wikipedia', '')

			expect(results).toEqual(['Wikipedia#Section 1', 'Wikipedia#Section 2', 'Wikipedia#Section 3'])
		})

		test('caches section results', async () => {
			mockApi.get.mockResolvedValue({
				parse: {
					sections: [{ linkAnchor: 'History', line: 'History' }],
				},
			})

			// First call
			await autocomplete.getSectionSuggestions('Wikipedia', 'hist')

			// Second call should use cache
			await autocomplete.getSectionSuggestions('Wikipedia', 'geo')

			// API should only be called once
			expect(mockApi.get).toHaveBeenCalledTimes(1)
		})

		test('returns user input when page does not exist', async () => {
			mockApi.get.mockRejectedValue(new Error('Page not found'))

			const results = await autocomplete.getSectionSuggestions('NonExistentPage', 'section')

			expect(results).toEqual(['NonExistentPage#section'])
		})

		test('returns user input when page name is invalid', async () => {
			mw.Title.newFromText.mockReturnValue(null)

			const results = await autocomplete.getSectionSuggestions('Invalid<Page', 'section')

			expect(results).toEqual(['Invalid<Page#section'])
		})

		test('normalizes underscores in section anchors', async () => {
			mockApi.get.mockResolvedValue({
				parse: {
					sections: [{ linkAnchor: 'Section_with_underscores', line: 'Section with underscores' }],
				},
			})

			const results = await autocomplete.getSectionSuggestions('Wikipedia', 'section')

			expect(results).toEqual(['Wikipedia#Section with underscores'])
		})
	})

	describe('makeApiRequest', () => {
		test('routes to getSectionSuggestions when # is present', async () => {
			mockApi.get.mockResolvedValue({
				parse: {
					sections: [{ linkAnchor: 'History', line: 'History' }],
				},
			})

			const results = await autocomplete.makeApiRequest('Wikipedia#hist')

			expect(mockApi.get).toHaveBeenCalledWith({
				action: 'parse',
				page: 'Wikipedia',
				prop: 'sections',
			})

			expect(results).toEqual(['Wikipedia#History'])
		})

		test('routes to getPageSuggestions when no # is present', async () => {
			// Spy on getPageSuggestions to verify it's called
			const getPageSuggestionsSpy = jest
				.spyOn(autocomplete, 'getPageSuggestions')
				.mockResolvedValue(['Wikipedia', 'Wikidata'])

			const results = await autocomplete.makeApiRequest('wiki')

			expect(getPageSuggestionsSpy).toHaveBeenCalledWith('wiki')
			expect(results).toEqual(['Wikipedia', 'Wikidata'])

			getPageSuggestionsSpy.mockRestore()
		})
	})
})
