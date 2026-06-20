// Mock mw global before imports
globalThis.mw = {
	Title: class MockTitle {
		static newFromText(title) {
			return new this(title)
		}

		constructor(title) {
			this.title = title
		}

		getPrefixedText() {
			return this.title
		}
	},
}

import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('../src/CrossSiteMwTitle', () => ({
	default: class MockCrossSiteMwTitle {
		constructor(title) {
			this.title = title
		}
	},
}))

vi.mock('../src/loader/cd', () => ({
	default: {
		g: {
			pageName: 'Test_Page',
		},
		s: vi.fn((key) => key),
		utils: {
			skin$: vi.fn(() => ({ length: 0 })),
		},
	},
}))

vi.mock('../src/pageRegistry', () => ({
	default: {
		canonicalCurrentPageName: 'Test_Page',
		get: vi.fn(),
		getCurrent: vi.fn(),
	},
}))

vi.mock('../src/controller', () => ({
	default: {},
}))

vi.mock('../src/commentManager', () => ({
	default: {},
}))

vi.mock('../src/sectionManager', () => ({
	default: {},
}))

vi.mock('../src/userRegistry', () => ({
	default: {},
}))

vi.mock('../src/notifications', () => ({
	default: {},
}))

import CommentForm from '../src/CommentForm'

// We'll mock the minimal environment needed for the function
/**
 * @typedef {import('vitest').MockInstance & ((...args: any[]) => any)} Mock
 */

/**
 * @typedef {object} WidgetMockExtension
 * @property {Mock} getRange
 * @property {Mock} getSelectionRanges
 * @property {Mock} getValue
 * @property {Mock} replaceSelections
 */

/**
 * @typedef {Partial<Omit<import('../src/MultilineTextInputWidget').default, 'constructor'>> & WidgetMockExtension} WidgetMock
 */

/** @type {WidgetMock} */
const mockCommentInput = {
	getRange: vi.fn(),
	getSelectionRanges: vi.fn(),
	getValue: vi.fn(),
	replaceSelections: vi.fn(),
}

/**
 * Helper to call the actual encapsulateSelection method with a mock context.
 *
 * @param {object} options
 * @param {string} [options.pre] Text to insert before the caret/selection.
 * @param {string} [options.peri] Fallback value used instead of a selection and selected
 *   afterwards.
 * @param {string} [options.post] Text to insert after the caret/selection.
 * @param {boolean} [options.replace] If there is a selection, replace it with `pre`, `peri`, `post`
 *   instead of leaving it alone.
 * @param {string} [options.selection] Selected text. Use if the selection is outside of the input.
 * @param {boolean} [options.ownline] Put the inserted text on a line of its own.
 * @param {import('../src/MultilineTextInputWidget').default | WidgetMock} commentInput
 */
function encapsulateSelection(options, commentInput) {
	const commentForm = Object.create(CommentForm.prototype)
	commentForm.commentInput = commentInput
	commentForm.encapsulateSelection(options)
}

describe('encapsulateSelection logic', () => {
	beforeEach(() => {
		vi.resetAllMocks()
	})

	it('Scenario 1: No selection, no peri -> caret between pre and post', () => {
		mockCommentInput.getRange.mockReturnValue({ from: 5, to: 5 })
		mockCommentInput.getSelectionRanges.mockReturnValue([{ from: 5, to: 5 }])
		mockCommentInput.getValue.mockReturnValue('Some text.')

		encapsulateSelection({ pre: '<code>', post: '</code>' }, mockCommentInput)

		expect(mockCommentInput.replaceSelections).toHaveBeenCalledWith([
			{
				from: 5,
				to: 5,
				insert: '<code></code>',
				selection: { from: 6, to: 6 },
			},
		])
	})

	it('Scenario 2: No selection, with peri -> peri inserted and selected', () => {
		mockCommentInput.getRange.mockReturnValue({ from: 5, to: 5 })
		mockCommentInput.getSelectionRanges.mockReturnValue([{ from: 5, to: 5 }])
		mockCommentInput.getValue.mockReturnValue('Some text.')

		encapsulateSelection({ pre: '<code>', post: '</code>', peri: 'example' }, mockCommentInput)

		expect(mockCommentInput.replaceSelections).toHaveBeenCalledWith([
			{
				from: 5,
				to: 5,
				insert: '<code>example</code>',
				selection: { from: 6, to: 13 },
			},
		])
	})

	it('Scenario 3: With selection -> selection wrapped, caret after post (no selectRange call)', () => {
		mockCommentInput.getRange.mockReturnValue({ from: 5, to: 8 }) // selecting "tex" in "Some text."
		mockCommentInput.getSelectionRanges.mockReturnValue([{ from: 5, to: 8 }])
		mockCommentInput.getValue.mockReturnValue('Some text.')

		encapsulateSelection({ pre: '<code>', post: '</code>', peri: 'unused' }, mockCommentInput)

		expect(mockCommentInput.replaceSelections).toHaveBeenCalledWith([
			{
				from: 5,
				to: 8,
				insert: '<code>tex</code>',
				selection: undefined,
			},
		])
	})

	it('Scenario 4: Selection with spaces -> spaces moved outside', () => {
		mockCommentInput.getRange.mockReturnValue({ from: 4, to: 9 }) // selecting " text" in "Some text."
		mockCommentInput.getSelectionRanges.mockReturnValue([{ from: 4, to: 9 }])
		mockCommentInput.getValue.mockReturnValue('Some text.')

		encapsulateSelection({ pre: '<code>', post: '</code>' }, mockCommentInput)

		expect(mockCommentInput.replaceSelections).toHaveBeenCalledWith([
			{
				from: 4,
				to: 9,
				insert: ' <code>text</code>',
				selection: undefined,
			},
		])
	})

	it('Scenario 5: Provided selection param -> uses it, caret after post', () => {
		mockCommentInput.getRange.mockReturnValue({ from: 5, to: 5 })
		mockCommentInput.getValue.mockReturnValue('Some text.')

		encapsulateSelection(
			{ pre: '<code>', post: '</code>', selection: 'provided' },
			mockCommentInput,
		)

		expect(mockCommentInput.replaceSelections).toHaveBeenCalledWith([
			{
				from: 5,
				to: 5,
				insert: '<code>provided</code>',
				selection: undefined,
			},
		])
	})

	it('Scenario 6: ownline: true -> adds newlines if needed', () => {
		mockCommentInput.getRange.mockReturnValue({ from: 5, to: 5 })
		mockCommentInput.getSelectionRanges.mockReturnValue([{ from: 5, to: 5 }])
		mockCommentInput.getValue.mockReturnValue('Some text.')

		encapsulateSelection(
			{ pre: '<code>', post: '</code>', peri: 'example', ownline: true },
			mockCommentInput,
		)

		// value.slice(0, 5) is "Some ", no trailing newline.
		// middleText is "example", no leading newline.
		// value.slice(5) is "text.", no leading newline.
		// post is "</code>", no trailing newline.
		expect(mockCommentInput.replaceSelections).toHaveBeenCalledWith([
			{
				from: 5,
				to: 5,
				insert: '\n<code>example</code>\n',
				selection: { from: 7, to: 14 },
			},
		])
	})

	it('Scenario 7: replace: true -> peri replaces selection', () => {
		mockCommentInput.getRange.mockReturnValue({ from: 5, to: 8 }) // selecting "tex"
		mockCommentInput.getSelectionRanges.mockReturnValue([{ from: 5, to: 8 }])
		mockCommentInput.getValue.mockReturnValue('Some text.')

		encapsulateSelection(
			{ pre: '<code>', post: '</code>', peri: 'replaced', replace: true },
			mockCommentInput,
		)

		expect(mockCommentInput.replaceSelections).toHaveBeenCalledWith([
			{
				from: 5,
				to: 8,
				insert: '<code>replaced</code>',
				selection: { from: 6, to: 14 },
			},
		])
	})

	it('Scenario 8: Multiple selections -> each selection is wrapped separately', () => {
		mockCommentInput.getRange.mockReturnValue({ from: 0, to: 5 })
		mockCommentInput.getSelectionRanges.mockReturnValue([
			{ from: 0, to: 5 },
			{ from: 10, to: 14 },
		])
		mockCommentInput.getValue.mockReturnValue('alpha and beta.')

		encapsulateSelection({ pre: "'''", post: "'''" }, mockCommentInput)

		expect(mockCommentInput.replaceSelections).toHaveBeenCalledWith([
			{
				from: 0,
				to: 5,
				insert: "'''alpha'''",
				selection: undefined,
			},
			{
				from: 10,
				to: 14,
				insert: "'''beta'''",
				selection: undefined,
			},
		])
	})

	it('Scenario 9: Multiple empty selections -> peri is inserted and selected in each range', () => {
		mockCommentInput.getRange.mockReturnValue({ from: 0, to: 0 })
		mockCommentInput.getSelectionRanges.mockReturnValue([
			{ from: 0, to: 0 },
			{ from: 5, to: 5 },
		])
		mockCommentInput.getValue.mockReturnValue('alpha beta')

		encapsulateSelection({ pre: '<code>', post: '</code>', peri: 'example' }, mockCommentInput)

		expect(mockCommentInput.replaceSelections).toHaveBeenCalledWith([
			{
				from: 0,
				to: 0,
				insert: '<code>example</code>',
				selection: { from: 6, to: 13 },
			},
			{
				from: 5,
				to: 5,
				insert: '<code>example</code>',
				selection: { from: 6, to: 13 },
			},
		])
	})

	it('Scenario 10: Provided selection param -> only current range is replaced', () => {
		mockCommentInput.getRange.mockReturnValue({ from: 5, to: 5 })
		mockCommentInput.getSelectionRanges.mockReturnValue([
			{ from: 0, to: 5 },
			{ from: 10, to: 14 },
		])
		mockCommentInput.getValue.mockReturnValue('alpha and beta.')

		encapsulateSelection(
			{ pre: '<blockquote>', post: '</blockquote>', selection: 'provided' },
			mockCommentInput,
		)

		expect(mockCommentInput.replaceSelections).toHaveBeenCalledWith([
			{
				from: 5,
				to: 5,
				insert: '<blockquote>provided</blockquote>',
				selection: undefined,
			},
		])
		expect(mockCommentInput.getSelectionRanges).not.toHaveBeenCalled()
	})
})
