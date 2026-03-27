import { describe, it, expect, vi, beforeEach } from 'vitest'

// We'll mock the minimal environment needed for the function
const mockCommentInput = {
  getRange: vi.fn(),
  getValue: vi.fn(),
  insertContent: vi.fn(),
  selectRange: vi.fn(),
}

// The function we want to test, copied from src/CommentForm.js after my fix
function encapsulateSelection({
  pre = '',
  peri = '',
  post = '',
  selection: selectionParam,
  replace = false,
  ownline = false,
}, commentInput) {
  const range = commentInput.getRange()
  const selectionStartIndex = Math.min(range.from, range.to)
  const selectionEndIndex = Math.max(range.from, range.to)
  const value = commentInput.getValue()

  let selection = selectionParam
  if (selection === undefined && !replace) {
    selection = value.substring(selectionStartIndex, selectionEndIndex)
  }
  selection ??= ''

  const middleText = selection || peri
  const leadingNewline =
    ownline &&
    !/(^|\n)$/.test(value.slice(0, selectionStartIndex)) &&
    !middleText.startsWith('\n')
      ? '\n'
      : ''
  const trailingNewline =
    ownline && !value.slice(selectionEndIndex).startsWith('\n') && !post.endsWith('\n')
      ? '\n'
      : ''

  // Wrap the text, moving the leading and trailing spaces to the sides of the resulting text.
  const [leadingSpace] = selection.match(/^ */)
  const [trailingSpace] = selection.match(/ *$/)

  commentInput.insertContent(
    leadingNewline +
      leadingSpace +
      pre +
      middleText.slice(leadingSpace.length, middleText.length - trailingSpace.length) +
      post +
      trailingSpace +
      trailingNewline,
  )

  if (!selection) {
    const periStartIndex =
      selectionStartIndex + leadingNewline.length + leadingSpace.length + pre.length
    commentInput.selectRange(periStartIndex, periStartIndex + middleText.length)
  }
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

    encapsulateSelection({ pre: '<code>', post: '</code>', selection: 'provided' }, mockCommentInput)

    expect(mockCommentInput.insertContent).toHaveBeenCalledWith('<code>provided</code>')
    expect(mockCommentInput.selectRange).not.toHaveBeenCalled()
  })
})
