import { jest, describe, beforeEach, afterEach, test, expect } from '@jest/globals'
/**
 * Performance tests for the autocomplete system.
 * Tests response times, memory usage, and caching efficiency.
 */

import AutocompleteFactory from '../src/AutocompleteFactory'
import AutocompleteManager from '../src/AutocompleteManager'
import CommentLinksAutocomplete from '../src/CommentLinksAutocomplete'
import MentionsAutocomplete from '../src/MentionsAutocomplete'
import TagsAutocomplete from '../src/TagsAutocomplete'
import TemplatesAutocomplete from '../src/TemplatesAutocomplete'
import WikilinksAutocomplete from '../src/WikilinksAutocomplete'

// Mock dependencies
global.mw = {
	util: {
		escapeRegExp: (str) => str.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`),
	},
}

global.OO = {
	ui: {
		MultilineTextInputWidget: class {},
	},
}

jest.mock('../src/cd', () => ({
	g: {
		contentDirection: 'ltr',
		userNamespacesRegexp: /^User:/,
		colonNamespacesPrefixRegexp: /^:/,
		contribsPages: ['Special:Contributions'],
		allowedTags: ['div', 'span', 'p', 'br', 'strong', 'em'],
	},
	s: jest.fn((key) => key),
	mws: jest.fn((key) => ' '),
	config: {
		mentionCharacter: '@',
		mentionRequiresLeadingSpace: false,
	},
	getApi: jest.fn(() => ({
		get: jest.fn(),
	})),
}))

jest.mock('../src/settings', () => ({
	get: jest.fn((key) => {
		if (key === 'autocompleteTypes')
			return ['mentions', 'wikilinks', 'templates', 'tags', 'commentLinks']
		if (key === 'useTemplateData') return true

		return null
	}),
}))

jest.mock('../src/userRegistry', () => ({
	get: jest.fn(() => ({
		getNamespaceAlias: () => 'User',
		isRegistered: () => true,
	})),
}))

jest.mock('../src/commentRegistry', () => ({
	getAll: jest.fn(() => []),
}))

jest.mock('../src/sectionRegistry', () => ({
	getAll: jest.fn(() => []),
}))

// Performance measurement utilities
class PerformanceTracker {
	constructor() {
		this.measurements = []
		this.memoryBaseline = null
	}

	startMeasurement(name) {
		const measurement = {
			name,
			startTime: performance.now(),
			startMemory: this.getMemoryUsage(),
		}
		this.measurements.push(measurement)

		return measurement
	}

	endMeasurement(measurement) {
		measurement.endTime = performance.now()
		measurement.endMemory = this.getMemoryUsage()
		measurement.duration = measurement.endTime - measurement.startTime
		measurement.memoryDelta = measurement.endMemory - measurement.startMemory

		return measurement
	}

	getMemoryUsage() {
		if (typeof performance !== 'undefined' && performance.memory) {
			return performance.memory.usedJSHeapSize
		}

		// Fallback for environments without performance.memory
		return process.memoryUsage().heapUsed || 0
	}

	setMemoryBaseline() {
		this.memoryBaseline = this.getMemoryUsage()
	}

	getMemoryDelta() {
		return this.getMemoryUsage() - (this.memoryBaseline || 0)
	}

	getAverageResponseTime(name) {
		const measurements = this.measurements.filter((m) => m.name === name && m.duration)
		if (measurements.length === 0) return 0

		return measurements.reduce((sum, m) => sum + m.duration, 0) / measurements.length
	}

	getMaxResponseTime(name) {
		const measurements = this.measurements.filter((m) => m.name === name && m.duration)
		if (measurements.length === 0) return 0

		return Math.max(...measurements.map((m) => m.duration))
	}

	getTotalMemoryUsage() {
		const measurements = this.measurements.filter((m) => m.memoryDelta)

		return measurements.reduce((sum, m) => sum + Math.max(0, m.memoryDelta), 0)
	}

	reset() {
		this.measurements = []
		this.memoryBaseline = null
	}
}

describe('Autocomplete Performance Tests', () => {
	let tracker
	let mockInputs

	beforeEach(() => {
		tracker = new PerformanceTracker()
		tracker.setMemoryBaseline()

		// Mock TextInputWidget
		mockInputs = [
			{
				$input: [
					{
						addEventListener: jest.fn(),
						removeEventListener: jest.fn(),
					},
				],
			},
		]

		// Reset all mocks
		jest.clearAllMocks()
	})

	afterEach(() => {
		tracker.reset()
	})

	describe('Response Time Performance', () => {
		test('mentions autocomplete response time should be under 100ms for cached results', async () => {
			const mentions = new MentionsAutocomplete()
			const callback = jest.fn()

			// Pre-populate cache
			mentions.cache.test = ['testuser1', 'testuser2', 'testuser3']

			const measurement = tracker.startMeasurement('mentions-cached')
			await mentions.getValues('test', callback)
			tracker.endMeasurement(measurement)

			expect(measurement.duration).toBeLessThan(100)
			expect(callback).toHaveBeenCalled()
		})

		test('wikilinks autocomplete response time should be under 200ms for local search', async () => {
			const wikilinks = new WikilinksAutocomplete()
			wikilinks.defaultEntries = ['Test page', 'Test article', 'Another test']
			const callback = jest.fn()

			const measurement = tracker.startMeasurement('wikilinks-local')
			await wikilinks.getValues('test', callback)
			tracker.endMeasurement(measurement)

			expect(measurement.duration).toBeLessThan(200)
			expect(callback).toHaveBeenCalled()
		})

		test('templates autocomplete should handle large template lists efficiently', async () => {
			const templates = new TemplatesAutocomplete()
			// Simulate large template list
			templates.defaultEntries = Array.from({ length: 1000 }, (_, i) => `Template${i}`)
			const callback = jest.fn()

			const measurement = tracker.startMeasurement('templates-large-list')
			await templates.getValues('temp', callback)
			tracker.endMeasurement(measurement)

			expect(measurement.duration).toBeLessThan(500)
			expect(callback).toHaveBeenCalled()
		})

		test('tags autocomplete should be very fast for predefined lists', async () => {
			const tags = new TagsAutocomplete()
			const callback = jest.fn()

			const measurement = tracker.startMeasurement('tags-predefined')
			await tags.getValues('div', callback)
			tracker.endMeasurement(measurement)

			expect(measurement.duration).toBeLessThan(50)
			expect(callback).toHaveBeenCalled()
		})

		test('comment links autocomplete should handle large comment sets', async () => {
			const commentLinks = new CommentLinksAutocomplete()
			// Simulate large comment dataset
			const largeCommentSet = Array.from({ length: 500 }, (_, i) => ({
				id: i,
				getText: () => `Comment ${i} text`,
				getAuthor: () => ({ getName: () => `User${i}` }),
				getUrlFragment: () => `c-User${i}-${i}`,
			}))
			commentLinks.data = { comments: largeCommentSet }
			const callback = jest.fn()

			const measurement = tracker.startMeasurement('commentlinks-large')
			await commentLinks.getValues('comment', callback)
			tracker.endMeasurement(measurement)

			expect(measurement.duration).toBeLessThan(300)
			expect(callback).toHaveBeenCalled()
		})
	})

	describe('Memory Usage Performance', () => {
		test('autocomplete instances should not leak memory', () => {
			const initialMemory = tracker.getMemoryUsage()

			// Create multiple instances
			const instances = []
			for (let i = 0; i < 100; i++) {
				instances.push(new MentionsAutocomplete())
				instances.push(new WikilinksAutocomplete())
				instances.push(new TemplatesAutocomplete())
				instances.push(new TagsAutocomplete())
				instances.push(new CommentLinksAutocomplete())
			}

			const afterCreation = tracker.getMemoryUsage()
			const creationDelta = afterCreation - initialMemory

			// Destroy instances properly
			instances.forEach((instance) => {
				if (typeof instance.destroy === 'function') {
					instance.destroy()
				}
			})
			instances.length = 0

			// Force garbage collection if available
			if (global.gc) {
				global.gc()
			}

			const afterCleanup = tracker.getMemoryUsage()
			const cleanupDelta = afterCleanup - initialMemory

			// Memory usage after cleanup should be reasonable (allow for some overhead)
			expect(cleanupDelta).toBeLessThan(creationDelta * 0.8)
		})

		test('cache should not grow unbounded', async () => {
			const mentions = new MentionsAutocomplete()
			const callback = jest.fn()

			const initialMemory = tracker.getMemoryUsage()

			// Simulate many different queries to fill cache
			const queries = Array.from({ length: 1000 }, (_, i) => `user${i}`)

			for (const query of queries) {
				mentions.cache[query] = [`${query}1`, `${query}2`, `${query}3`]
			}

			const afterCaching = tracker.getMemoryUsage()
			const memoryIncrease = afterCaching - initialMemory

			// Memory increase should be reasonable (less than 10MB for 1000 cache entries)
			expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024)
		})

		test('AutocompleteManager should efficiently manage multiple instances', () => {
			const initialMemory = tracker.getMemoryUsage()

			const managers = []
			for (let i = 0; i < 50; i++) {
				managers.push(
					new AutocompleteManager({
						types: ['mentions', 'wikilinks', 'templates', 'tags', 'commentLinks'],
						inputs: mockInputs,
					}),
				)
			}

			const afterCreation = tracker.getMemoryUsage()
			const memoryPerManager = (afterCreation - initialMemory) / managers.length

			// Each manager should use reasonable memory (less than 1MB)
			expect(memoryPerManager).toBeLessThan(1024 * 1024)

			// Cleanup
			managers.forEach((manager) => manager.terminate())
		})
	})

	describe('Caching Performance', () => {
		test('cache hit should be significantly faster than cache miss', async () => {
			const mentions = new MentionsAutocomplete()
			const callback = jest.fn()

			// Mock API request to simulate slow response
			mentions.makeApiRequest = jest
				.fn()
				.mockImplementation(
					() => new Promise((resolve) => setTimeout(() => resolve(['user1', 'user2']), 100)),
				)

			// First call (cache miss)
			const missMeasurement = tracker.startMeasurement('cache-miss')
			await mentions.getValues('testuser', callback)
			tracker.endMeasurement(missMeasurement)

			// Second call (cache hit)
			const hitMeasurement = tracker.startMeasurement('cache-hit')
			await mentions.getValues('testuser', callback)
			tracker.endMeasurement(hitMeasurement)

			// Cache hit should be at least 5x faster
			expect(hitMeasurement.duration).toBeLessThan(missMeasurement.duration / 5)
		})

		test('cache should handle concurrent requests efficiently', async () => {
			const mentions = new MentionsAutocomplete()
			let apiCallCount = 0

			mentions.makeApiRequest = jest.fn().mockImplementation(() => {
				apiCallCount++

				return Promise.resolve(['user1', 'user2'])
			})

			const callback = jest.fn()

			// Make multiple concurrent requests for the same query
			const promises = Array.from({ length: 10 }, () => mentions.getValues('testuser', callback))

			await Promise.all(promises)

			// Should only make one API call due to promise reuse
			expect(apiCallCount).toBeLessThanOrEqual(1)
			expect(callback).toHaveBeenCalledTimes(10)
		})

		test('cache invalidation should work correctly', async () => {
			const mentions = new MentionsAutocomplete()
			const callback = jest.fn()

			// Populate cache
			mentions.cache.test = ['testuser1']
			mentions.lastQuery = 'test'
			mentions.lastResults = ['testuser1']

			// Query that doesn't start with last query should reset results
			await mentions.getValues('different', callback)

			expect(mentions.lastResults).toEqual([])
			expect(mentions.lastQuery).toBe('different')
		})
	})

	describe('API Request Optimization', () => {
		test('should debounce rapid API requests', async () => {
			const mentions = new MentionsAutocomplete()
			let apiCallCount = 0

			mentions.makeApiRequest = jest.fn().mockImplementation(() => {
				apiCallCount++

				return Promise.resolve(['user1'])
			})

			const callback = jest.fn()

			// Make rapid successive calls
			const promises = [
				mentions.getValues('u', callback),
				mentions.getValues('us', callback),
				mentions.getValues('use', callback),
				mentions.getValues('user', callback),
			]

			await Promise.all(promises)

			// Should make fewer API calls than total requests due to debouncing
			expect(apiCallCount).toBeLessThan(4)
		})

		test('should handle API request failures gracefully', async () => {
			const mentions = new MentionsAutocomplete()
			const callback = jest.fn()

			mentions.makeApiRequest = jest.fn().mockRejectedValue(new Error('API Error'))

			const measurement = tracker.startMeasurement('api-error-handling')
			await mentions.getValues('testuser', callback)
			tracker.endMeasurement(measurement)

			// Should still call callback even with API error
			expect(callback).toHaveBeenCalled()
			// Should complete quickly without hanging
			expect(measurement.duration).toBeLessThan(1000)
		})
	})

	describe('Large Dataset Performance', () => {
		test('should handle large user lists efficiently', async () => {
			const mentions = new MentionsAutocomplete()

			// Simulate large user list
			const largeUserList = Array.from({ length: 10_000 }, (_, i) => `User${i}`)
			mentions.defaultEntries = largeUserList

			const callback = jest.fn()

			const measurement = tracker.startMeasurement('large-user-list')
			await mentions.getValues('User1', callback)
			tracker.endMeasurement(measurement)

			expect(measurement.duration).toBeLessThan(1000)
			expect(callback).toHaveBeenCalled()
		})

		test('should handle large template lists efficiently', async () => {
			const templates = new TemplatesAutocomplete()

			// Simulate large template list
			const largeTemplateList = Array.from({ length: 5000 }, (_, i) => `Template${i}`)
			templates.defaultEntries = largeTemplateList

			const callback = jest.fn()

			const measurement = tracker.startMeasurement('large-template-list')
			await templates.getValues('Template1', callback)
			tracker.endMeasurement(measurement)

			expect(measurement.duration).toBeLessThan(800)
			expect(callback).toHaveBeenCalled()
		})

		test('should handle concurrent requests with large datasets', async () => {
			const mentions = new MentionsAutocomplete()
			const largeUserList = Array.from({ length: 5000 }, (_, i) => `User${i}`)
			mentions.defaultEntries = largeUserList

			const callback = jest.fn()

			const measurement = tracker.startMeasurement('concurrent-large-dataset')

			// Make multiple concurrent requests
			const promises = Array.from({ length: 20 }, (_, i) =>
				mentions.getValues(`User${i}`, callback),
			)

			await Promise.all(promises)
			tracker.endMeasurement(measurement)

			expect(measurement.duration).toBeLessThan(2000)
			expect(callback).toHaveBeenCalledTimes(20)
		})
	})

	describe('Performance Regression Tests', () => {
		test('AutocompleteManager should not be slower than individual instances', async () => {
			const callback = jest.fn()

			// Test individual instance
			const individualMentions = new MentionsAutocomplete()
			individualMentions.cache.test = ['testuser1', 'testuser2']

			const individualMeasurement = tracker.startMeasurement('individual-instance')
			await individualMentions.getValues('test', callback)
			tracker.endMeasurement(individualMeasurement)

			// Test through AutocompleteManager
			const manager = new AutocompleteManager({
				types: ['mentions'],
				inputs: mockInputs,
			})

			// Pre-populate cache in manager's instance
			const managerInstance = manager.autocompleteInstances.get('mentions')
			managerInstance.cache.test = ['testuser1', 'testuser2']

			const managerMeasurement = tracker.startMeasurement('manager-instance')
			await managerInstance.getValues('test', callback)
			tracker.endMeasurement(managerMeasurement)

			// Manager should not add significant overhead (within 50% of individual)
			expect(managerMeasurement.duration).toBeLessThan(individualMeasurement.duration * 1.5)

			manager.terminate()
		})

		test('factory creation should be fast', () => {
			const measurement = tracker.startMeasurement('factory-creation')

			for (let i = 0; i < 1000; i++) {
				AutocompleteFactory.create('mentions', {})
				AutocompleteFactory.create('wikilinks', {})
				AutocompleteFactory.create('templates', {})
				AutocompleteFactory.create('tags', {})
				AutocompleteFactory.create('commentLinks', {})
			}

			tracker.endMeasurement(measurement)

			// Creating 5000 instances should be fast
			expect(measurement.duration).toBeLessThan(1000)
		})
	})

	describe('Performance Monitoring', () => {
		test('should provide performance metrics', () => {
			// Add some measurements
			const measurement1 = tracker.startMeasurement('test-operation')
			measurement1.duration = 100

			const measurement2 = tracker.startMeasurement('test-operation')
			measurement2.duration = 200

			const measurement3 = tracker.startMeasurement('other-operation')
			measurement3.duration = 50

			expect(tracker.getAverageResponseTime('test-operation')).toBe(150)
			expect(tracker.getMaxResponseTime('test-operation')).toBe(200)
			expect(tracker.getAverageResponseTime('other-operation')).toBe(50)
		})

		test('should track memory usage over time', () => {
			tracker.setMemoryBaseline()

			// Simulate memory allocation
			const data = Array.from({ length: 1000 }).fill('test data')

			const memoryDelta = tracker.getMemoryDelta()
			expect(memoryDelta).toBeGreaterThan(0)

			// Clean up
			data.length = 0
		})
	})
})
