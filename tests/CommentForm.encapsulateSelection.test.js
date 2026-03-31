import { describe, it, expect, vi, beforeEach } from 'vitest'

import CommentForm from '../src/CommentForm'

// We'll mock the minimal environment needed for the function
const mockCommentInput = {
	getRange: vi.fn(),
	getValue: vi.fn(),
	insertContent: vi.fn(),
	selectRange: vi.fn(),
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
 * @param {import('../src/MultilineTextInputWidget').default} commentInput
 */
function encapsulateSelection(options, commentInput) {
	CommentForm.prototype.encapsulateSelection.call({ commentInput }, options)
}

describe('encapsulateSelection logic', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('Scenario 1: No selection, no peri -> caret between pre and post', () => {
		mockCommentInput.getRange.mockReturnValue({ from: 5, to: 5 })
		mockCommentInput.getValue.mockReturnValue('Some text.')

		encapsulateSelection({ pre: '<code>', post: '</code>' }, mockCommentInput)

		expect(mockCommentInput.insertContent).toHaveBeenCalledWith('<code></code>')
		expect(mockCommentInput.selectRange).toHaveBeenCalledWith(5 + 6, 5 + 6) // selectionStartIndex + pre.length
	})

	it('Scenario 2: No selection, with peri -> peri inserted and selected', () => {
		mockCommentInput.getRange.mockReturnValue({ from: 5, to: 5 })
		mockCommentInput.getValue.mockReturnValue('Some text.')

		encapsulateSelection({ pre: '<code>', post: '</code>', peri: 'example' }, mockCommentInput)

		expect(mockCommentInput.insertContent).toHaveBeenCalledWith('<code>example</code>')
		expect(mockCommentInput.selectRange).toHaveBeenCalledWith(5 + 6, 5 + 6 + 7)
	})

	it('Scenario 3: With selection -> selection wrapped, caret after post (no selectRange call)', () => {
		mockCommentInput.getRange.mockReturnValue({ from: 5, to: 8 }) // selecting "tex" in "Some text."
		mockCommentInput.getValue.mockReturnValue('Some text.')

		encapsulateSelection({ pre: '<code>', post: '</code>', peri: 'unused' }, mockCommentInput)

		expect(mockCommentInput.insertContent).toHaveBeenCalledWith('<code>tex</code>')
		expect(mockCommentInput.selectRange).not.toHaveBeenCalled()
	})

	it('Scenario 4: Selection with spaces -> spaces moved outside', () => {
		mockCommentInput.getRange.mockReturnValue({ from: 4, to: 9 }) // selecting " text" in "Some text."
		mockCommentInput.getValue.mockReturnValue('Some text.')

		encapsulateSelection({ pre: '<code>', post: '</code>' }, mockCommentInput)

		expect(mockCommentInput.insertContent).toHaveBeenCalledWith(' <code>text</code>')
		expect(mockCommentInput.selectRange).not.toHaveBeenCalled()
	})

	it('Scenario 5: Provided selection param -> uses it, caret after post', () => {
		mockCommentInput.getRange.mockReturnValue({ from: 5, to: 5 })
		mockCommentInput.getValue.mockReturnValue('Some text.')

		encapsulateSelection(
			{ pre: '<code>', post: '</code>', selection: 'provided' },
			mockCommentInput,
		)

		expect(mockCommentInput.insertContent).toHaveBeenCalledWith('<code>provided</code>')
		expect(mockCommentInput.selectRange).not.toHaveBeenCalled()
	})
})
