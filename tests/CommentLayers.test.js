/**
 * @jest-environment jsdom
 */

// Mock dependencies
jest.mock('../src/commentManager', () => ({
	default: {
		underlays: [],
	},
}));

// Mock jQuery
global.$ = jest.fn((element) => ({
	element,
}));

// Mock PrototypeRegistry
jest.mock('../src/PrototypeRegistry', () => jest.fn().mockImplementation(() => ({
	get: jest.fn(),
	add: jest.fn(),
})));

import CommentLayers from '../src/CommentLayers';

describe('CommentLayers', () => {
	let mockComment;
	let layers;

	beforeEach(() => {
		// Reset mocks
		jest.clearAllMocks();

		// Set up mock prototypes
		CommentLayers.prototypes.get.mockImplementation((key) => {
			if (key === 'underlay') {
				return document.createElement('div');
			}
			if (key === 'overlay') {
				const overlay = document.createElement('div');
				const line = document.createElement('div');
				const marker = document.createElement('div');
				overlay.append(line, marker);

				return overlay;
			}

			return document.createElement('div');
		});

		// Create mock comment
		mockComment = {
			isNew: false,
			isOwn: false,
			isDeleted: false,
			isLineGapped: false,
			actions: {
				replyButton: { setDisabled: jest.fn() },
				editButton: { setDisabled: jest.fn() },
			},
		};

		layers = new CommentLayers(mockComment);
	});

	describe('constructor', () => {
		it('should initialize with comment reference', () => {
			expect(layers.comment).toBe(mockComment);
			expect(layers.underlay).toBeUndefined();
			expect(layers.overlay).toBeUndefined();
			expect(layers.line).toBeUndefined();
			expect(layers.marker).toBeUndefined();
		});
	});

	describe('create', () => {
		it('should create layer elements from prototypes', () => {
			layers.create();

			expect(layers.underlay).toBeInstanceOf(HTMLElement);
			expect(layers.overlay).toBeInstanceOf(HTMLElement);
			expect(layers.line).toBeInstanceOf(HTMLElement);
			expect(layers.marker).toBeInstanceOf(HTMLElement);
		});

		it('should create jQuery wrappers', () => {
			layers.create();

			expect(layers.$underlay).toBeDefined();
			expect(layers.$overlay).toBeDefined();
			expect(layers.$marker).toBeDefined();
			expect(global.$).toHaveBeenCalledWith(layers.underlay);
			expect(global.$).toHaveBeenCalledWith(layers.overlay);
			expect(global.$).toHaveBeenCalledWith(layers.marker);
		});

		it('should add underlay to commentManager.underlays', () => {
			const commentManager = require('../src/commentManager').default;

			layers.create();

			expect(commentManager.underlays).toContain(layers.underlay);
		});

		it('should call updateStyles with wereJustCreated=true', () => {
			const updateStylesSpy = jest.spyOn(layers, 'updateStyles');

			layers.create();

			expect(updateStylesSpy).toHaveBeenCalledWith(true);
		});
	});

	describe('destroy', () => {
		beforeEach(() => {
			layers.create();
		});

		it('should remove underlay element and clear reference', () => {
			const removeSpy = jest.spyOn(layers.underlay, 'remove');

			layers.destroy();

			expect(removeSpy).toHaveBeenCalled();
			expect(layers.underlay).toBeUndefined();
		});

		it('should remove overlay element and clear reference', () => {
			const removeSpy = jest.spyOn(layers.overlay, 'remove');

			layers.destroy();

			expect(removeSpy).toHaveBeenCalled();
			expect(layers.overlay).toBeUndefined();
		});

		it('should clear all element references', () => {
			layers.destroy();

			expect(layers.line).toBeUndefined();
			expect(layers.marker).toBeUndefined();
			expect(layers.$underlay).toBeUndefined();
			expect(layers.$overlay).toBeUndefined();
			expect(layers.$marker).toBeUndefined();
		});

		it('should handle destroy after create', () => {
			layers.create();

			expect(() => layers.destroy()).not.toThrow();
			expect(layers.underlay).toBeUndefined();
			expect(layers.overlay).toBeUndefined();
		});
	});

	describe('menu methods', () => {
		it('should have no-op hideMenu method', () => {
			expect(() => layers.hideMenu()).not.toThrow();
		});

		it('should have no-op deferHideMenu method', () => {
			expect(() => layers.deferHideMenu(new MouseEvent('mousedown'))).not.toThrow();
		});

		it('should have no-op dontHideMenu method', () => {
			expect(() => layers.dontHideMenu()).not.toThrow();
		});
	});

	describe('updateStyles', () => {
		beforeEach(() => {
			layers.create();
		});

		it('should handle updateStyles without errors', () => {
			expect(() => layers.updateStyles()).not.toThrow();
			expect(() => layers.updateStyles(true)).not.toThrow();
		});

		it('should update classes for comment flags', () => {
			const updateClassesSpy = jest.spyOn(layers, 'updateClassesForFlag');

			layers.updateStyles();

			expect(updateClassesSpy).toHaveBeenCalledWith('new', false);
			expect(updateClassesSpy).toHaveBeenCalledWith('own', false);
			expect(updateClassesSpy).toHaveBeenCalledWith('deleted', false);
		});

		it('should add gap closer class when line is gapped and just created', () => {
			mockComment.isLineGapped = true;

			layers.updateStyles(true);

			expect(layers.line.classList.contains('cd-comment-overlay-line-gapCloser')).toBe(true);
		});

		it('should not add gap closer class when not just created', () => {
			mockComment.isLineGapped = true;

			layers.updateStyles(false);

			expect(layers.line.classList.contains('cd-comment-overlay-line-gapCloser')).toBe(false);
		});
	});

	describe('updateClassesForFlag', () => {
		beforeEach(() => {
			layers.create();
		});

		it('should handle updateClassesForFlag without errors', () => {
			expect(() => layers.updateClassesForFlag('new', true)).not.toThrow();
			expect(() => layers.updateClassesForFlag('own', false)).not.toThrow();
		});

		it('should toggle classes on underlay and overlay', () => {
			const underlayToggleSpy = jest.spyOn(layers.underlay.classList, 'toggle');
			const overlayToggleSpy = jest.spyOn(layers.overlay.classList, 'toggle');

			layers.updateClassesForFlag('new', true);

			expect(underlayToggleSpy).toHaveBeenCalledWith('cd-comment-underlay-new', true);
			expect(overlayToggleSpy).toHaveBeenCalledWith('cd-comment-overlay-new', true);
		});

		it('should not toggle if class state matches desired state', () => {
			layers.underlay.classList.add('cd-comment-underlay-new');
			const underlayToggleSpy = jest.spyOn(layers.underlay.classList, 'toggle');

			layers.updateClassesForFlag('new', true);

			expect(underlayToggleSpy).not.toHaveBeenCalled();
		});

		it('should disable action buttons when deleted flag is set', () => {
			layers.updateClassesForFlag('deleted', true);

			expect(mockComment.actions.replyButton.setDisabled).toHaveBeenCalledWith(true);
			expect(mockComment.actions.editButton.setDisabled).toHaveBeenCalledWith(true);
		});

		it('should enable action buttons when deleted flag is removed', () => {
			// First add the deleted class so the condition is met
			layers.underlay.classList.add('cd-comment-underlay-deleted');

			layers.updateClassesForFlag('deleted', false);

			expect(mockComment.actions.replyButton.setDisabled).toHaveBeenCalledWith(false);
			expect(mockComment.actions.editButton.setDisabled).toHaveBeenCalledWith(false);
		});

		it('should handle missing action buttons gracefully', () => {
			mockComment.actions = undefined;

			expect(() => layers.updateClassesForFlag('deleted', true)).not.toThrow();
		});
	});
});
