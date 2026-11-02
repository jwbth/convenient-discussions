import { describe, expect, test, vi } from 'vitest'

vi.mock('../src/commentManager', () => ({ default: {} }))
vi.mock('../src/loader/cd', () => ({ default: {} }))
vi.mock('../src/CommentForm', () => ({ default: {} }))

const { default: CommentActions } = await import('../src/CommentActions')

/**
 * @param {object} [props]
 * @returns {any}
 */
const createForm = (props) => ({ quote: vi.fn(), quoteTransferredData: vi.fn(), ...props })

/**
 * @param {object} [props]
 * @returns {any}
 */
const createComment = (props) => {
	const comment = {
		fixSelection: vi.fn(),
		getChildren: () => [],
		replyForm: undefined,
		reply: vi.fn(() => {
			comment.replyForm = createForm()
		}),
		...props,
	}

	return comment
}

describe('CommentActions#onQuoteAction', () => {
	test('quotes into the existing reply form', () => {
		const replyForm = createForm()
		const comment = createComment({ replyForm })
		new CommentActions(comment).onQuoteAction()
		expect(replyForm.quote).toHaveBeenCalledWith(true, comment)
		expect(comment.reply).not.toHaveBeenCalled()
	})

	test("quotes into the edit form of the user's own reply", () => {
		const editForm = createForm()
		const comment = createComment({
			getChildren: () => [
				{ isOwn: () => false, editForm: createForm() },
				{ isOwn: () => true, editForm },
			],
		})
		new CommentActions(comment).onQuoteAction()
		expect(editForm.quote).toHaveBeenCalledWith(true, comment)
		expect(comment.reply).not.toHaveBeenCalled()
	})

	test("opens a reply form when only someone else's reply is being edited", () => {
		const othersEditForm = createForm()
		const comment = createComment({
			getChildren: () => [
				{ isOwn: () => false, editForm: othersEditForm },
				{ isOwn: () => true, editForm: undefined },
			],
		})
		new CommentActions(comment).onQuoteAction()
		expect(othersEditForm.quote).not.toHaveBeenCalled()
		expect(comment.reply).toHaveBeenCalled()
		expect(comment.replyForm.quote).toHaveBeenCalledWith(true, comment)
	})
})

describe('CommentActions#quoteDropAction', () => {
	const dataTransfer = /** @type {DataTransfer} */ ({})

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

	test("quotes into the section's reply form when replies are outdented", () => {
		const sectionReplyForm = createForm()
		const comment = createComment({
			section: { replyForm: sectionReplyForm },
			reply: vi.fn(),
		})
		new CommentActions(comment).quoteDropAction.drop(dataTransfer)
		expect(sectionReplyForm.quoteTransferredData).toHaveBeenCalledWith(dataTransfer, comment)
	})
})
