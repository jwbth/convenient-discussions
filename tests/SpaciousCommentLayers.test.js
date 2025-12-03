/**
 * @jest-environment jsdom
 */

// Mock dependencies
jest.mock(
	'../src/CommentLayers',
	() =>
		class MockCommentLayers {
			constructor(comment) {
				this.comment = comment
			}

			create() {
				this.createCalled = true
				// Mock basic layer creation
				this.underlay = { tagName: 'DIV' }
				this.overlay = { tagName: 'DIV' }
				this.line = { tagName: 'DIV' }
				this.marker = { tagName: 'DIV' }
			}

			updateStyles(wereJustCreated) {
				this.updateStylesCalled = true
				this.updateStylesWereJustCreated = wereJustCreated
			}

			destroy() {
				// Mock destroy method
			}

			hideMenu() {
				// Mock hideMenu method
			}

			deferHideMenu() {
				// Mock deferHideMenu method
			}

			dontHideMenu() {
				// Mock dontHideMenu method
			}
		},
)

import SpaciousCommentLayers from '../src/SpaciousCommentLayers'

describe('SpaciousCommentLayers', () => {
	let mockComment
	let layers

	beforeEach(() => {
		jest.clearAllMocks()

		mockComment = {
			isNew: false,
			isOwn: false,
			isDeleted: false,
			isLineGapped: false,
		}

		layers = new SpaciousCommentLayers(mockComment)
	})

	describe('constructor', () => {
		it('should inherit from CommentLayers', () => {
			const CommentLayers = require('../src/CommentLayers')
			expect(layers).toBeInstanceOf(CommentLayers)
		})

		it('should initialize with comment reference', () => {
			expect(layers.comment).toBe(mockComment)
		})
	})

	describe('create', () => {
		it('should call parent create method', () => {
			layers.create()

			expect(layers.createCalled).toBe(true)
		})

		it('should create basic layer elements through parent', () => {
			layers.create()

			expect(layers.underlay).toBeDefined()
			expect(layers.overlay).toBeDefined()
			expect(layers.line).toBeDefined()
			expect(layers.marker).toBeDefined()
		})

		it('should not create overlay menu elements', () => {
			layers.create()

			// Spacious comments don't have overlay menu elements
			expect(layers.overlayInnerWrapper).toBeUndefined()
			expect(layers.overlayGradient).toBeUndefined()
			expect(layers.overlayMenu).toBeUndefined()
		})
	})

	describe('updateStyles', () => {
		beforeEach(() => {
			layers.create()
		})

		it('should call parent updateStyles method', () => {
			layers.updateStyles(true)

			expect(layers.updateStylesCalled).toBe(true)
			expect(layers.updateStylesWereJustCreated).toBe(true)
		})

		it('should call parent updateStyles with default parameter', () => {
			layers.updateStyles()

			expect(layers.updateStylesCalled).toBe(true)
			expect(layers.updateStylesWereJustCreated).toBe(false)
		})

		it('should handle false parameter correctly', () => {
			layers.updateStyles(false)

			expect(layers.updateStylesCalled).toBe(true)
			expect(layers.updateStylesWereJustCreated).toBe(false)
		})
	})

	describe('inheritance behavior', () => {
		it('should inherit all base class methods', () => {
			const CommentLayers = require('../src/CommentLayers')
			const baseInstance = new CommentLayers(mockComment)

			// Check that spacious layers has the same methods as base class
			expect(typeof layers.create).toBe('function')
			expect(typeof layers.updateStyles).toBe('function')
			expect(typeof layers.destroy).toBe('function')
			expect(typeof layers.hideMenu).toBe('function')
			expect(typeof layers.deferHideMenu).toBe('function')
			expect(typeof layers.dontHideMenu).toBe('function')
		})

		it('should maintain base class properties', () => {
			expect(layers.comment).toBe(mockComment)
			expect(layers.underlay).toBeUndefined()
			expect(layers.overlay).toBeUndefined()
			expect(layers.line).toBeUndefined()
			expect(layers.marker).toBeUndefined()
		})
	})
})
