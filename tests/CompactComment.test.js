/**
 * @jest-environment jsdom
 */
import { jest, describe, beforeEach, afterEach, test, expect } from '@jest/globals'
import * as mock_src_Comment from '../src/Comment';
import * as mock_src_CommentLayers from '../src/CommentLayers';


// Mock global dependencies
global.OO = {
	EventEmitter: class EventEmitter {
		on() {}

		off() {}

		emit() {}
	},
}

jest.mock(
	'../src/EventEmitter.js',
	() =>
		class EventEmitter {
			on() {}

			off() {}

			emit() {}
		},
)

// Mock dependencies
jest.mock('../src/CommentLayers', () => {
	const MockCommentLayers = class MockCommentLayers {
		static prototypes = {
			get: jest.fn(),
			add: jest.fn(),
		}

		static initPrototypes() {
			// Mock CommentLayers initPrototypes
		}

		constructor(comment) {
			this.comment = comment
		}
	}

	return { default: MockCommentLayers }
})

jest.mock('../src/CompactCommentLayers', () => {
	const MockCompactCommentLayers = class MockCompactCommentLayers {
		constructor(comment) {
			this.comment = comment
		}
	}

	return { default: MockCompactCommentLayers }
})

jest.mock('../src/Comment', () => {
	const mockComment = class MockComment {
		static initPrototypes() {
			// Mock parent initPrototypes
		}

		highlightHovered(event) {
			// Mock parent highlightHovered
			this.parentHighlightHoveredCalled = true
			this.parentHighlightHoveredEvent = event
		}
	}

	return { default: mockComment }
})

import CompactComment from '../src/CompactComment'

describe('CompactComment', () => {
	let comment

	beforeEach(() => {
		jest.clearAllMocks()
		comment = new CompactComment()
	})

	describe('constructor', () => {
		it('should inherit from Comment', () => {
			const Comment = mock_src_Comment.default
			expect(comment).toBeInstanceOf(Comment)
		})

		it('should initialize hover state properties', () => {
			expect(comment.isHovered).toBe(false)
			expect(comment.wasMenuHidden).toBe(false)
		})
	})

	describe('highlightHovered', () => {
		it('should call parent highlightHovered method', () => {
			const event = new MouseEvent('mouseover')

			comment.highlightHovered(event)

			expect(comment.parentHighlightHoveredCalled).toBe(true)
			expect(comment.parentHighlightHoveredEvent).toBe(event)
		})

		it('should handle touchstart event when menu was hidden', () => {
			comment.wasMenuHidden = true
			const event = new TouchEvent('touchstart')

			comment.highlightHovered(event)

			expect(comment.wasMenuHidden).toBe(false)
			expect(comment.parentHighlightHoveredCalled).toBeUndefined()
		})

		it('should call parent method for touchstart when menu was not hidden', () => {
			comment.wasMenuHidden = false
			const event = new TouchEvent('touchstart')

			comment.highlightHovered(event)

			expect(comment.parentHighlightHoveredCalled).toBe(true)
			expect(comment.parentHighlightHoveredEvent).toBe(event)
		})

		it('should call parent method for non-touchstart events even when menu was hidden', () => {
			comment.wasMenuHidden = true
			const event = new MouseEvent('mouseover')

			comment.highlightHovered(event)

			expect(comment.parentHighlightHoveredCalled).toBe(true)
			expect(comment.parentHighlightHoveredEvent).toBe(event)
		})

		it('should handle undefined event gracefully', () => {
			expect(() => comment.highlightHovered()).not.toThrow()
			expect(comment.parentHighlightHoveredCalled).toBe(true)
		})
	})

	describe('initPrototypes', () => {
		beforeEach(() => {
			// Reset the prototypes mock
			const CommentLayers = mock_src_CommentLayers.default
			CommentLayers.prototypes = {
				get: jest.fn((key) => {
					if (key === 'overlay') {
						const overlay = document.createElement('div')
						const line = document.createElement('div')
						const marker = document.createElement('div')
						overlay.append(line, marker)

						return overlay
					}

					return document.createElement('div')
				}),
				add: jest.fn(),
			}

			CompactComment.prototypes = {
				get: jest.fn(),
				add: jest.fn(),
			}
		})

		it('should call CommentLayers initPrototypes', () => {
			const CommentLayers = mock_src_CommentLayers.default
			const layersInitSpy = jest.spyOn(CommentLayers, 'initPrototypes')

			CompactComment.initPrototypes()

			expect(layersInitSpy).toHaveBeenCalled()
		})

		it('should get base overlay prototype from CommentLayers', () => {
			const CommentLayers = mock_src_CommentLayers.default
			const layersGetSpy = jest.spyOn(CommentLayers.prototypes, 'get')

			CompactComment.initPrototypes()

			expect(layersGetSpy).toHaveBeenCalledWith('overlay')
		})

		it('should enhance overlay with compact-specific elements', () => {
			CompactComment.initPrototypes()

			// Should replace the overlay prototype with enhanced version
			expect(CompactComment.prototypes.add).toHaveBeenCalledWith('overlay', expect.any(HTMLElement))
		})

		it('should create overlay with proper structure', () => {
			CompactComment.initPrototypes()

			const overlayCall = CompactComment.prototypes.add.mock.calls.find(
				(call) => call[0] === 'overlay',
			)
			const overlay = overlayCall[1]

			// Check for inner wrapper
			const innerWrapper = overlay.querySelector('.cd-comment-overlay-innerWrapper')
			expect(innerWrapper).toBeInstanceOf(HTMLElement)

			// Check for gradient
			const gradient = innerWrapper.querySelector('.cd-comment-overlay-gradient')
			expect(gradient).toBeInstanceOf(HTMLElement)
			expect(gradient.textContent).toBe('\u00A0') // Non-breaking space

			// Check for content container
			const content = innerWrapper.querySelector('.cd-comment-overlay-menu')
			expect(content).toBeInstanceOf(HTMLElement)
		})

		it('should preserve original overlay line and marker elements', () => {
			CompactComment.initPrototypes()

			const overlayCall = CompactComment.prototypes.add.mock.calls.find(
				(call) => call[0] === 'overlay',
			)
			const overlay = overlayCall[1]

			// Original elements should still be present (added by the mock)
			expect(overlay.children.length).toBeGreaterThan(2) // line, marker, plus new elements
		})

		it('should add inner wrapper as child of overlay', () => {
			CompactComment.initPrototypes()

			const overlayCall = CompactComment.prototypes.add.mock.calls.find(
				(call) => call[0] === 'overlay',
			)
			const overlay = overlayCall[1]

			const innerWrapper = overlay.querySelector('.cd-comment-overlay-innerWrapper')
			expect(innerWrapper.parentElement).toBe(overlay)
		})

		it('should add gradient and content as children of inner wrapper', () => {
			CompactComment.initPrototypes()

			const overlayCall = CompactComment.prototypes.add.mock.calls.find(
				(call) => call[0] === 'overlay',
			)
			const overlay = overlayCall[1]

			const innerWrapper = overlay.querySelector('.cd-comment-overlay-innerWrapper')
			const gradient = innerWrapper.querySelector('.cd-comment-overlay-gradient')
			const content = innerWrapper.querySelector('.cd-comment-overlay-menu')

			expect(gradient.parentElement).toBe(innerWrapper)
			expect(content.parentElement).toBe(innerWrapper)
		})
	})
})
