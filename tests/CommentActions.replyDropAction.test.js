import { describe, expect, test, vi } from 'vitest'

vi.mock('../src/commentManager', () => ({ default: {} }))
vi.mock('../src/loader/cd', () => ({ default: {} }))
vi.mock('../src/CommentForm', () => ({ default: {} }))

const { default: CommentActions } = await import('../src/CommentActions')

/**
 * @returns {any}
 */
const createForm = () => ({ insertTransferredData: vi.fn() })

/**
 * @param {object} [props]
 * @returns {any}
 */
const createComment = (props) => {
	const comment = {
		replyForm: undefined,
		reply: vi.fn(() => {
			comment.replyForm ||= createForm()
		}),
		...props,
	}

	return comment
}

const dataTransfer = /** @type {DataTransfer} */ ({})

describe('CommentActions#replyDropAction', () => {
	test('inserts into a fresh reply form', () => {
		const comment = createComment()
		new CommentActions(comment).replyDropAction.drop(dataTransfer)
		expect(comment.reply).toHaveBeenCalled()
		expect(comment.replyForm.insertTransferredData).toHaveBeenCalledWith(dataTransfer)
	})

	test('inserts into the existing reply form', () => {
		const replyForm = createForm()
		const comment = createComment({ replyForm })
		new CommentActions(comment).replyDropAction.drop(dataTransfer)
		expect(replyForm.insertTransferredData).toHaveBeenCalledWith(dataTransfer)
	})

	test("inserts into the section's reply form when replies are outdented", () => {
		const sectionReplyForm = createForm()
		const comment = createComment({
			section: { replyForm: sectionReplyForm },
			reply: vi.fn(),
		})
		new CommentActions(comment).replyDropAction.drop(dataTransfer)
		expect(sectionReplyForm.insertTransferredData).toHaveBeenCalledWith(dataTransfer)
	})
})
