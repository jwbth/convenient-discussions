/**
 * @jest-environment jsdom
 */

// Mock dependencies
jest.mock(
	'../src/CommentActions',
	() =>
		class MockCommentActions {
			constructor(comment) {
				this.comment = comment
			}

			addReplyButton() {
				this.baseAddReplyButtonCalled = true
			}

			addEditButton() {
				this.baseAddEditButtonCalled = true
			}

			addThankButton() {
				this.baseAddThankButtonCalled = true
			}

			addGoToParentButton() {
				this.baseAddGoToParentButtonCalled = true
			}

			addCopyLinkButton() {
				this.baseAddCopyLinkButtonCalled = true
			}

			addToggleChildThreadsButton() {
				this.baseAddToggleChildThreadsButtonCalled = true
			}

			maybeAddGoToChildButton() {
				this.baseMaybeAddGoToChildButtonCalled = true
			}
		},
)

jest.mock(
	'../src/CommentButton',
	() =>
		class MockCommentButton {
			constructor(config) {
				this.element = config.element || { tagName: 'BUTTON' }
				this.buttonElement = config.buttonElement
				this.iconElement = config.iconElement
				this.config = config
				this.action = config.action
				this.href = config.href
				this.widgetConstructor = config.widgetConstructor
			}

			setDisabled(disabled) {
				this.disabled = disabled

				return this
			}

			setTooltip(tooltip) {
				this.tooltip = tooltip

				return this
			}

			setLabel(label) {
				this.label = label

				return this
			}

			isConnected() {
				return this.element.isConnected
			}
		},
)

jest.mock('../src/cd', () => ({
	s: jest.fn((key) => `mocked-${key}`),
	user: {
		isRegistered: jest.fn(() => true),
	},
}))

jest.mock('../src/commentManager', () => ({
	default: {
		getByIndex: jest.fn(() => undefined),
		getThanksStorage: jest.fn(() => ({
			getData: jest.fn(() => ({})),
		})),
	},
}))

import CompactCommentActions from '../src/CompactCommentActions'
import commentManager from '../src/commentManager'

describe('CompactCommentActions', () => {
	let mockComment
	let actions

	beforeEach(() => {
		jest.clearAllMocks()

		// Mock commentManager methods
		commentManager.getByIndex = jest.fn(() => undefined)
		commentManager.getThanksStorage = jest.fn(() => ({
			getData: jest.fn(() => ({})),
		}))

		mockComment = {
			id: 'test-comment-id',
			dtId: 'test-dt-id',
			index: 0,
			isActionable: true,
			isEditable: true,
			isOwn: false,
			headerElement: null, // Compact comments don't have header element
			author: {
				isRegistered: jest.fn(() => true),
			},
			date: new Date(),
			section: { name: 'Test Section' },
			elements: [document.createElement('div')],
			layers: {
				underlay: document.createElement('div'),
				overlayMenu: document.createElement('div'), // Add the overlayMenu property
				$overlayMenu: (() => {
					const element = document.createElement('div')
					const jQueryLike = [element]
					jQueryLike.append = jest.fn()
					jQueryLike.prepend = jest.fn()

					return jQueryLike
				})(),
			},
			replyForm: null,
			targetChild: null,
			reply: jest.fn(),
			edit: jest.fn(),
			thank: jest.fn(),
			copyLink: jest.fn(),
			goToParent: jest.fn(),
			getParent: jest.fn(() => ({ id: 'parent-id' })),
			getChildren: jest.fn(() => []),
			scrollTo: jest.fn(),
			toggleChildThreads: jest.fn(),
			maybeOnboardOntoToggleChildThreads: jest.fn(),
			configureLayers: jest.fn(),
			createReplyButton: jest.fn(() => ({ $element: [document.createElement('button')] })),
			createEditButton: jest.fn(() => ({ $element: [document.createElement('button')] })),
			createThankButton: jest.fn(() => ({ $element: [document.createElement('button')] })),
			createCopyLinkButton: jest.fn(() => ({
				$element: [
					(() => {
						const wrapper = document.createElement('div')
						wrapper.append(document.createElement('button'))

						return wrapper
					})(),
				],
			})),
			createGoToParentButton: jest.fn(() => ({ $element: [document.createElement('button')] })),
			createGoToChildButton: jest.fn(() => ({ $element: [document.createElement('button')] })),
			createToggleChildThreadsButton: jest.fn(() => {
				const button = document.createElement('button')
				const icon = document.createElement('span')
				icon.className = 'oo-ui-iconElement-icon'
				button.append(icon)

				return { $element: [button] }
			}),
		}

		actions = new CompactCommentActions(mockComment)
	})

	describe('constructor', () => {
		it('should inherit from CommentActions', () => {
			const CommentActions = require('../src/CommentActions')
			expect(actions).toBeInstanceOf(CommentActions)
		})
	})

	describe('create', () => {
		it('should create buttons in specific order for compact comments', () => {
			const addGoToParentSpy = jest.spyOn(actions, 'addGoToParentButton')
			const addCopyLinkSpy = jest.spyOn(actions, 'addCopyLinkButton')
			const addThankSpy = jest.spyOn(actions, 'addThankButton')
			const addEditSpy = jest.spyOn(actions, 'addEditButton')
			const addReplySpy = jest.spyOn(actions, 'addReplyButton')
			const addToggleSpy = jest.spyOn(actions, 'addToggleChildThreadsButton')

			actions.create()

			expect(addGoToParentSpy).toHaveBeenCalled()
			expect(addCopyLinkSpy).toHaveBeenCalled()
			expect(addThankSpy).toHaveBeenCalled()
			expect(addEditSpy).toHaveBeenCalled()
			expect(addReplySpy).toHaveBeenCalled()
			expect(addToggleSpy).toHaveBeenCalled()
		})
	})

	describe('button creation methods', () => {
		it('should create reply button using comment method', () => {
			const action = jest.fn()
			const button = actions.createReplyButton(action)

			expect(mockComment.createReplyButton).toHaveBeenCalled()
			expect(button.action).toBe(action)
			expect(button.widgetConstructor).toBe(mockComment.createReplyButton)
		})

		it('should create edit button using comment method', () => {
			const action = jest.fn()
			const button = actions.createEditButton(action)

			expect(mockComment.createEditButton).toHaveBeenCalled()
			expect(button.action).toBe(action)
			expect(button.widgetConstructor).toBe(mockComment.createEditButton)
		})

		it('should create thank button using comment method', () => {
			const action = jest.fn()
			const button = actions.createThankButton(action, false)

			expect(mockComment.createThankButton).toHaveBeenCalled()
			expect(button.action).toBe(action)
			expect(button.widgetConstructor).toBe(mockComment.createThankButton)
		})

		it('should create copy link button with button element', () => {
			const action = jest.fn()
			const button = actions.createCopyLinkButton(action)

			expect(mockComment.createCopyLinkButton).toHaveBeenCalled()
			expect(button.buttonElement).toBeInstanceOf(HTMLElement)
			expect(button.href).toBe('#test-dt-id')
			expect(button.action).toBe(action)
		})

		it('should create go to parent button using comment method', () => {
			const action = jest.fn()
			const button = actions.createGoToParentButton(action)

			expect(mockComment.createGoToParentButton).toHaveBeenCalled()
			expect(button.buttonElement).toBeInstanceOf(HTMLElement)
			expect(button.action).toBe(action)
		})

		it('should create go to child button using comment method', () => {
			const action = jest.fn()
			const button = actions.createGoToChildButton(action)

			expect(mockComment.createGoToChildButton).toHaveBeenCalled()
			expect(button.action).toBe(action)
		})

		it('should create toggle child threads button with icon element', () => {
			const action = jest.fn()
			const button = actions.createToggleChildThreadsButton(action)

			expect(mockComment.createToggleChildThreadsButton).toHaveBeenCalled()
			expect(button.iconElement).toBeInstanceOf(HTMLElement)
			expect(button.iconElement.className).toBe('oo-ui-iconElement-icon')
			expect(button.action).toBe(action)
		})
	})

	describe('appendButton', () => {
		it('should append button to overlay menu', () => {
			const button = { element: document.createElement('button') }

			actions.appendButton(button)

			expect(mockComment.layers.$overlayMenu.append).toHaveBeenCalledWith(button.element)
		})

		it('should handle missing overlay menu gracefully', () => {
			mockComment.layers.$overlayMenu = null
			const button = { element: document.createElement('button') }

			expect(() => actions.appendButton(button)).not.toThrow()
		})
	})

	describe('prependButton', () => {
		it('should prepend button to overlay menu', () => {
			const button = { element: document.createElement('button') }

			actions.prependButton(button)

			expect(mockComment.layers.$overlayMenu.prepend).toHaveBeenCalledWith(button.element)
		})

		it('should handle missing overlay menu gracefully', () => {
			mockComment.layers.$overlayMenu = null
			const button = { element: document.createElement('button') }

			expect(() => actions.prependButton(button)).not.toThrow()
		})
	})

	describe('addToggleChildThreadsButton', () => {
		it('should create and position toggle button correctly', () => {
			mockComment.getChildren.mockReturnValue([{ thread: {} }])
			actions.goToParentButton = { element: document.createElement('button') }

			const insertBeforeSpy = jest.spyOn(mockComment.layers.$overlayMenu[0], 'insertBefore')

			actions.addToggleChildThreadsButton()

			expect(actions.toggleChildThreadsButton).toBeDefined()
			expect(insertBeforeSpy).toHaveBeenCalledWith(
				actions.toggleChildThreadsButton.element,
				actions.goToParentButton.element.nextSibling,
			)
		})

		it('should prepend when no target button exists', () => {
			mockComment.getChildren.mockReturnValue([{ thread: {} }])
			const prependSpy = jest.spyOn(actions, 'prependButton')

			actions.addToggleChildThreadsButton()

			expect(prependSpy).toHaveBeenCalledWith(actions.toggleChildThreadsButton)
		})
	})

	describe('maybeAddGoToChildButton', () => {
		it('should create go to child button when target child exists', () => {
			mockComment.targetChild = { scrollTo: jest.fn() }
			const prependSpy = jest.spyOn(actions, 'prependButton')

			actions.maybeAddGoToChildButton()

			expect(mockComment.configureLayers).toHaveBeenCalled()
			expect(actions.goToChildButton).toBeDefined()
			expect(prependSpy).toHaveBeenCalledWith(actions.goToChildButton)
		})

		it('should not create button when no target child exists', () => {
			actions.maybeAddGoToChildButton()

			expect(actions.goToChildButton).toBeUndefined()
		})
	})

	describe('button creation', () => {
		it('should create reply button when comment is actionable', () => {
			actions.addReplyButton()

			expect(actions.replyButton).toBeDefined()
		})

		it('should not create reply button when comment is not actionable', () => {
			mockComment.isActionable = false

			actions.addReplyButton()

			expect(actions.replyButton).toBeUndefined()
		})

		it('should create edit button when comment is editable', () => {
			actions.addEditButton()

			expect(actions.editButton).toBeDefined()
		})

		it('should not create edit button when comment is not editable', () => {
			mockComment.isEditable = false

			actions.addEditButton()

			expect(actions.editButton).toBeUndefined()
		})

		it('should create thank button when conditions are met', () => {
			actions.addThankButton()

			expect(actions.thankButton).toBeDefined()
		})

		it('should not create thank button when user is not registered', () => {
			const cd = require('../src/cd')
			cd.user.isRegistered.mockReturnValue(false)

			actions.addThankButton()

			expect(actions.thankButton).toBeUndefined()
		})

		it('should create go to parent button when parent exists', () => {
			actions.addGoToParentButton()

			expect(actions.goToParentButton).toBeDefined()
		})

		it('should not create go to parent button when no parent exists', () => {
			mockComment.getParent.mockReturnValue(null)

			actions.addGoToParentButton()

			expect(actions.goToParentButton).toBeUndefined()
		})

		it('should create copy link button when comment has id', () => {
			actions.addCopyLinkButton()

			expect(actions.copyLinkButton).toBeDefined()
		})

		it('should not create copy link button when comment has no id', () => {
			mockComment.id = null

			actions.addCopyLinkButton()

			expect(actions.copyLinkButton).toBeUndefined()
		})
	})
})
