/**
 * @jest-environment jsdom
 */

// Mock dependencies
jest.mock('../src/CommentLayers', () => {
	const mockPrototypes = {
		get: jest.fn(),
	};

	class MockCommentLayers {
		static prototypes = mockPrototypes;

		constructor(comment) {
			this.comment = comment;
		}

		getOverlayPrototype() {
			return MockCommentLayers.prototypes.get('overlay');
		}

		setupAdditionalElements() {
			// Base implementation - no additional elements
		}

		create() {
			this.createCalled = true;
			// Mock basic layer creation
			this.underlay = { tagName: 'DIV' };
			this.overlay = this.getOverlayPrototype();
			this.line = { tagName: 'DIV' };
			this.marker = { tagName: 'DIV' };

			this.updateStyles(true);

			// Create jQuery wrappers
			this.$underlay = global.$(this.underlay);
			this.$overlay = global.$(this.overlay);
			this.$marker = global.$(this.marker);

			// Allow subclasses to set up additional elements
			this.setupAdditionalElements();
		}

		updateStyles(wereJustCreated) {
			this.updateStylesCalled = true;
			this.updateStylesWereJustCreated = wereJustCreated;
		}

		destroy() {
			this.destroyCalled = true;
			this.underlay = undefined;
			this.overlay = undefined;
			this.line = undefined;
			this.marker = undefined;
		}
	}

	return MockCommentLayers;
});

// Mock jQuery
global.$ = jest.fn((element) => ({
	element,
}));

// Mock setTimeout and clearTimeout
global.setTimeout = jest.fn((callback, delay) => {
	const id = Math.random();
	// Store callback for testing
	global.setTimeout.callbacks = global.setTimeout.callbacks || {};
	global.setTimeout.callbacks[id] = callback;

	return id;
});

global.clearTimeout = jest.fn();

import CompactCommentLayers from '../src/CompactCommentLayers';

describe('CompactCommentLayers', () => {
	let mockComment;
	let layers;

	beforeEach(() => {
		jest.clearAllMocks();
		global.setTimeout.callbacks = {};

		// Mock the prototype registries
		const CommentLayers = require('../src/CommentLayers');
		CommentLayers.prototypes.get.mockReturnValue({
			tagName: 'DIV',
			firstChild: { tagName: 'DIV' },
		});

		// Mock CompactCommentLayers prototypes
		CompactCommentLayers.prototypes = {
			get: jest.fn().mockReturnValue({
				tagName: 'DIV',
				firstChild: { tagName: 'DIV' },
				lastChild: {
					className: 'cd-comment-overlay-innerWrapper',
					firstChild: { className: 'cd-comment-overlay-gradient' },
					lastChild: { className: 'cd-comment-overlay-menu' },
					addEventListener: jest.fn(),
					style: { display: '' },
				},
			}),
		};

		mockComment = {
			isNew: false,
			isOwn: false,
			isDeleted: false,
			isLineGapped: false,
			wasMenuHidden: false,
		};

		layers = new CompactCommentLayers(mockComment);
	});

	describe('constructor', () => {
		it('should inherit from CommentLayers', () => {
			const CommentLayers = require('../src/CommentLayers');
			expect(layers).toBeInstanceOf(CommentLayers);
		});

		it('should initialize with undefined overlay menu properties', () => {
			expect(layers.overlayInnerWrapper).toBeUndefined();
			expect(layers.overlayGradient).toBeUndefined();
			expect(layers.overlayMenu).toBeUndefined();
			expect(layers.$overlayMenu).toBeUndefined();
			expect(layers.$overlayGradient).toBeUndefined();
			expect(layers.hideMenuTimeout).toBeUndefined();
		});
	});

	describe('create', () => {
		it('should call parent create method', () => {
			layers.create();

			expect(layers.createCalled).toBe(true);
		});

		it('should set up overlay menu elements from overlay structure', () => {
			layers.create();

			expect(layers.overlayInnerWrapper).toBeDefined();
			expect(layers.overlayGradient).toBeDefined();
			expect(layers.overlayMenu).toBeDefined();
		});

		it('should create jQuery wrappers for overlay menu elements', () => {
			layers.create();

			expect(layers.$overlayMenu).toBeDefined();
			expect(layers.$overlayGradient).toBeDefined();
			expect(global.$).toHaveBeenCalledWith(layers.overlayMenu);
			expect(global.$).toHaveBeenCalledWith(layers.overlayGradient);
		});

		it('should handle missing overlay gracefully', () => {
			// Mock create to not set overlay
			const CommentLayers = require('../src/CommentLayers');
			const originalCreate = CommentLayers.prototype.create;
			CommentLayers.prototype.create = function () {
				this.createCalled = true;
				this.overlay = null;
			};

			expect(() => layers.create()).not.toThrow();
			expect(layers.overlayInnerWrapper).toBeUndefined();

			// Restore original create
			CommentLayers.prototype.create = originalCreate;
		});
	});

	describe('updateStyles', () => {
		beforeEach(() => {
			layers.create();
		});

		it('should call parent updateStyles method', () => {
			layers.updateStyles(true);

			expect(layers.updateStylesCalled).toBe(true);
			expect(layers.updateStylesWereJustCreated).toBe(true);
		});

		it('should call parent updateStyles with default parameter', () => {
			layers.updateStyles();

			expect(layers.updateStylesCalled).toBe(true);
			expect(layers.updateStylesWereJustCreated).toBe(false);
		});
	});

	describe('showMenu', () => {
		beforeEach(() => {
			layers.create();
			layers.overlayInnerWrapper = { style: { display: 'none' } };
		});

		it('should show overlay inner wrapper', () => {
			layers.showMenu();

			expect(layers.overlayInnerWrapper.style.display).toBe('');
		});

		it('should handle missing overlay inner wrapper gracefully', () => {
			layers.overlayInnerWrapper = undefined;

			expect(() => layers.showMenu()).not.toThrow();
		});
	});

	describe('hideMenu', () => {
		beforeEach(() => {
			layers.create();
			layers.overlayInnerWrapper = { style: { display: '' } };
		});

		it('should hide overlay inner wrapper', () => {
			layers.hideMenu();

			expect(layers.overlayInnerWrapper.style.display).toBe('none');
		});

		it('should set wasMenuHidden flag on comment', () => {
			layers.hideMenu();

			expect(mockComment.wasMenuHidden).toBe(true);
		});

		it('should prevent default on event', () => {
			const mockEvent = {
				preventDefault: jest.fn(),
			};

			layers.hideMenu(mockEvent);

			expect(mockEvent.preventDefault).toHaveBeenCalled();
		});

		it('should handle missing event gracefully', () => {
			expect(() => layers.hideMenu()).not.toThrow();
		});

		it('should handle missing overlay inner wrapper gracefully', () => {
			layers.overlayInnerWrapper = undefined;

			expect(() => layers.hideMenu()).not.toThrow();
		});
	});

	describe('deferHideMenu', () => {
		beforeEach(() => {
			layers.create();
		});

		it('should set timeout for left button clicks', () => {
			const mockEvent = { button: 0 };

			layers.deferHideMenu(mockEvent);

			expect(global.setTimeout).toHaveBeenCalledWith(expect.any(Function), 1200);
			expect(layers.hideMenuTimeout).toBeDefined();
		});

		it('should not set timeout for non-left button clicks', () => {
			const mockEvent = { button: 1 }; // Right button

			layers.deferHideMenu(mockEvent);

			expect(global.setTimeout).not.toHaveBeenCalled();
			expect(layers.hideMenuTimeout).toBeUndefined();
		});

		it('should bind hideMenu method correctly in timeout', () => {
			const mockEvent = { button: 0 };
			const hideMenuSpy = jest.spyOn(layers, 'hideMenu');

			layers.deferHideMenu(mockEvent);

			// Execute the timeout callback
			const timeoutId = layers.hideMenuTimeout;
			const callback = global.setTimeout.callbacks[timeoutId];
			callback();

			expect(hideMenuSpy).toHaveBeenCalled();
		});
	});

	describe('dontHideMenu', () => {
		beforeEach(() => {
			layers.create();
		});

		it('should clear timeout', () => {
			layers.hideMenuTimeout = 123;

			layers.dontHideMenu();

			expect(global.clearTimeout).toHaveBeenCalledWith(123);
		});

		it('should handle undefined timeout gracefully', () => {
			layers.hideMenuTimeout = undefined;

			expect(() => layers.dontHideMenu()).not.toThrow();
			expect(global.clearTimeout).toHaveBeenCalledWith(undefined);
		});
	});

	describe('destroy', () => {
		beforeEach(() => {
			layers.create();
			layers.hideMenuTimeout = 123;
		});

		it('should clear pending timeouts', () => {
			const dontHideMenuSpy = jest.spyOn(layers, 'dontHideMenu');

			layers.destroy();

			expect(dontHideMenuSpy).toHaveBeenCalled();
		});

		it('should clean up compact-specific element references', () => {
			layers.destroy();

			expect(layers.overlayInnerWrapper).toBeUndefined();
			expect(layers.overlayGradient).toBeUndefined();
			expect(layers.overlayMenu).toBeUndefined();
			expect(layers.$overlayMenu).toBeUndefined();
			expect(layers.$overlayGradient).toBeUndefined();
		});

		it('should call parent destroy method', () => {
			layers.destroy();

			expect(layers.destroyCalled).toBe(true);
		});
	});

	describe('inheritance behavior', () => {
		it('should inherit all base class methods', () => {
			expect(typeof layers.create).toBe('function');
			expect(typeof layers.updateStyles).toBe('function');
			expect(typeof layers.destroy).toBe('function');
			expect(typeof layers.hideMenu).toBe('function');
			expect(typeof layers.deferHideMenu).toBe('function');
			expect(typeof layers.dontHideMenu).toBe('function');
		});

		it('should override base class menu methods with functional implementations', () => {
			layers.create();

			// These should not be no-ops like in the base class
			expect(() => layers.hideMenu()).not.toThrow();
			expect(() => layers.deferHideMenu({ button: 0 })).not.toThrow();
			expect(() => layers.dontHideMenu()).not.toThrow();

			// Should have actual functionality
			expect(global.setTimeout).toHaveBeenCalled();
		});
	});
});
