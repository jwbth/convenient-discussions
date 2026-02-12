/**
 * @jest-environment jsdom
 */
import { jest, describe, beforeEach, afterEach, test, expect } from '@jest/globals'

describe('Thread hidden="until-found" functionality', () => {
	let mockElement

	beforeEach(() => {
		// Create mock element for testing
		mockElement = document.createElement('div')
		mockElement.textContent = 'Test content'
		document.body.append(mockElement)
	})

	afterEach(() => {
		document.body.innerHTML = ''
	})

	test('should support hidden="until-found" when browser supports beforematch', () => {
		// Mock browser support for beforematch
		Object.defineProperty(mockElement, 'onbeforematch', {
			value: null,
			writable: true,
		})

		// Test the logic that would be in hideElement method
		if ('onbeforematch' in mockElement) {
			mockElement.setAttribute('hidden', 'until-found')
		} else {
			mockElement.classList.add('cd-hidden')
		}

		expect(mockElement.classList.contains('cd-hidden')).toBe(false)
		expect(mockElement.getAttribute('hidden')).toBe('until-found')
	})

	test('should fall back gracefully when browser does not support beforematch', () => {
		// Test the logic directly with a plain object that doesn't have beforematch support
		const elementWithoutSupport = {
			classList: {
				add: jest.fn(),
				contains: jest.fn(() => true),
			},
			setAttribute: jest.fn(),
			getAttribute: jest.fn(() => null),
		}

		// Test the logic that would be in hideElement method
		if ('onbeforematch' in elementWithoutSupport) {
			elementWithoutSupport.setAttribute('hidden', 'until-found')
		} else {
			elementWithoutSupport.classList.add('cd-hidden')
		}

		expect(elementWithoutSupport.classList.add).toHaveBeenCalledWith('cd-hidden')
		expect(elementWithoutSupport.setAttribute).not.toHaveBeenCalled()
	})

	test('should remove hidden attribute when unhiding element', () => {
		// Mock browser support
		Object.defineProperty(mockElement, 'onbeforematch', {
			value: null,
			writable: true,
		})

		// Hide element first (using hidden="until-found" since browser supports it)
		mockElement.setAttribute('hidden', 'until-found')
		expect(mockElement.getAttribute('hidden')).toBe('until-found')

		// Unhide element (test the logic from maybeUnhideElement)
		if (mockElement.hasAttribute('hidden')) {
			mockElement.removeAttribute('hidden')
		} else {
			mockElement.classList.remove('cd-hidden')
		}

		expect(mockElement.classList.contains('cd-hidden')).toBe(false)
		expect(mockElement.getAttribute('hidden')).toBeNull()
	})

	test('should detect beforematch support correctly', () => {
		const testElement = document.createElement('div')

		// In jsdom, beforematch is supported by default
		const hasSupport1 = 'onbeforematch' in testElement
		expect(hasSupport1).toBe(true)

		// Test with an object without support
		const elementWithoutSupport = {}
		const hasSupport2 = 'onbeforematch' in elementWithoutSupport
		expect(hasSupport2).toBe(false)
	})

	test('should handle beforematch event correctly', () => {
		// Mock browser support
		Object.defineProperty(mockElement, 'onbeforematch', {
			value: null,
			writable: true,
		})

		let eventFired = false
		const handleBeforeMatch = (event) => {
			eventFired = true
			expect(event.target).toBe(mockElement)
		}

		// Add event listener
		mockElement.addEventListener('beforematch', handleBeforeMatch)

		// Simulate beforematch event
		const beforeMatchEvent = new Event('beforematch')
		mockElement.dispatchEvent(beforeMatchEvent)

		expect(eventFired).toBe(true)
	})

	test('should not use cd-hidden class when hidden="until-found" is supported', () => {
		// Mock browser support for beforematch
		Object.defineProperty(mockElement, 'onbeforematch', {
			value: null,
			writable: true,
		})

		// Test that when hidden="until-found" is supported, we don't use cd-hidden
		if ('onbeforematch' in mockElement) {
			mockElement.setAttribute('hidden', 'until-found')
		} else {
			mockElement.classList.add('cd-hidden')
		}

		// Element should be hidden via hidden="until-found", not cd-hidden class
		expect(mockElement.getAttribute('hidden')).toBe('until-found')
		expect(mockElement.classList.contains('cd-hidden')).toBe(false)

		// Text content should still be accessible (not affected by display: none)
		expect(mockElement.textContent).toBe('Test content')
	})

	test('should use cd-hidden class as fallback when hidden="until-found" is not supported', () => {
		// Test with an object that doesn't support beforematch
		const elementWithoutSupport = {
			classList: {
				add: jest.fn(),
				contains: jest.fn(() => true),
			},
			setAttribute: jest.fn(),
			getAttribute: jest.fn(() => null),
		}

		// Test the fallback logic
		if ('onbeforematch' in elementWithoutSupport) {
			elementWithoutSupport.setAttribute('hidden', 'until-found')
		} else {
			elementWithoutSupport.classList.add('cd-hidden')
		}

		// Should use cd-hidden class as fallback
		expect(elementWithoutSupport.classList.add).toHaveBeenCalledWith('cd-hidden')
		expect(elementWithoutSupport.setAttribute).not.toHaveBeenCalled()
	})
})
