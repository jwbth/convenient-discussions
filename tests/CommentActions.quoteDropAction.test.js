import { describe, expect, test, vi } from 'vitest'

vi.mock('../src/commentManager', () => ({ default: {} }))
vi.mock('../src/loader/cd', () => ({ default: {} }))
vi.mock('../src/CommentForm', () => ({ default: {} }))

const { default: CommentActions } = await import('../src/CommentActions')

/**
 * @returns {any}
 */
const createForm = () => ({ quoteTransferredData: vi.fn() })

/**
 * @param {object} [props]
 * @returns {any}
 */
const createComment = (props) => {
	const comment = {
		getChildren: () => [],
		replyForm: undefined,
		reply: vi.fn(() => {
			comment.replyForm = createForm()
		}),
		...props,
	}

	return comment
}

const dataTransfer = /** @type {DataTransfer} */ ({})

describe('CommentActions#quoteDropAction', () => {
	test('quotes into a fresh reply form', () => {
		const comment = createComment()
		new CommentActions(comment).quoteDropAction.drop(dataTransfer)
		expect(comment.reply).toHaveBeenCalled()
		expect(comment.replyForm.quoteTransferredData).toHaveBeenCalledWith(dataTransfer, comment)
	})

	test("quotes into the edit form of the user's own reply", () => {
		const editForm = createForm()
		const comment = createComment({
			getChildren: () => [{ isOwn: () => true, editForm }],
		})
		new CommentActions(comment).quoteDropAction.drop(dataTransfer)
		expect(editForm.quoteTransferredData).toHaveBeenCalledWith(dataTransfer, comment)
		expect(comment.reply).not.toHaveBeenCalled()
	})
})
