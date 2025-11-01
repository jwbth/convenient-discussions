/**
 * @jest-environment jsdom
 */

// Mock global dependencies
global.OO = {
  EventEmitter: class EventEmitter {
    on() {}

    off() {}

    emit() {}
  },
};

jest.mock('../src/EventEmitter.js', () => class EventEmitter {
  on() {}

  off() {}

  emit() {}
});

// Mock dependencies
jest.mock('../src/cd', () => ({
  s: jest.fn((key) => `mocked-${key}`),
  user: {
    isRegistered: jest.fn(() => true),
  },
}));

jest.mock('../src/commentManager', () => ({
  default: {
    getByIndex: jest.fn(() => undefined),
    getThanksStorage: jest.fn(() => ({
      getData: jest.fn(() => ({})),
    })),
  },
}));

import CommentActions from '../src/CommentActions';
import commentManager from '../src/commentManager';

// Create a concrete test implementation
class TestCommentActions extends CommentActions {
  createReplyButton(action) {
    return {
      element: document.createElement('button'),
      setDisabled: jest.fn().mockReturnThis(),
      setTooltip: jest.fn().mockReturnThis(),
      setLabel: jest.fn().mockReturnThis(),
      isConnected: jest.fn(() => false),
      action,
    };
  }

  createEditButton(action) {
    return {
      element: document.createElement('button'),
      setDisabled: jest.fn().mockReturnThis(),
      setTooltip: jest.fn().mockReturnThis(),
      setLabel: jest.fn().mockReturnThis(),
      action,
    };
  }

  createThankButton(action, isThanked) {
    return {
      element: document.createElement('button'),
      setDisabled: jest.fn().mockReturnThis(),
      setTooltip: jest.fn().mockReturnThis(),
      setLabel: jest.fn().mockReturnThis(),
      action,
      isThanked,
    };
  }

  createCopyLinkButton(action) {
    return {
      element: document.createElement('button'),
      action,
    };
  }

  createGoToParentButton(action) {
    return {
      element: document.createElement('button'),
      action,
    };
  }

  createGoToChildButton(action) {
    return {
      element: document.createElement('button'),
      isConnected: jest.fn(() => false),
      action,
    };
  }

  createToggleChildThreadsButton(action) {
    return {
      element: document.createElement('button'),
      isConnected: jest.fn(() => false),
      action,
    };
  }

  appendButton(button) {
    this.appendedButtons = this.appendedButtons || [];
    this.appendedButtons.push(button);
  }

  prependButton(button) {
    this.prependedButtons = this.prependedButtons || [];
    this.prependedButtons.push(button);
  }
}

describe('CommentActions', () => {
  let mockComment;
  let actions;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up commentManager mock
    const commentManager = require('../src/commentManager').default;
    commentManager.getByIndex.mockReturnValue(null);
    commentManager.getThanksStorage.mockReturnValue({
      getData: jest.fn(() => ({})),
    });

    mockComment = {
      index: 0,
      isActionable: true,
      isEditable: true,
      isOwn: false,
      author: {
        isRegistered: jest.fn(() => true),
        name: 'TestUser',
      },
      date: new Date(),
      id: 'test-comment-id',
      dtId: 'test-dt-id',
      section: { name: 'Test Section' },
      elements: [document.createElement('div')],
      replyForm: null,
      reply: jest.fn(),
      edit: jest.fn(),
      thank: jest.fn(),
      copyLink: jest.fn(),
      goToParent: jest.fn(),
      getParent: jest.fn(() => ({ id: 'parent-id' })),
      getChildren: jest.fn(() => []),
      targetChild: null,
      scrollTo: jest.fn(),
      toggleChildThreads: jest.fn(),
      maybeOnboardOntoToggleChildThreads: jest.fn(),
      configureLayers: jest.fn(),
    };

    actions = new TestCommentActions(mockComment);
  });

  describe('constructor', () => {
    it('should initialize with comment reference and undefined buttons', () => {
      expect(actions.comment).toBe(mockComment);
      expect(actions.replyButton).toBeUndefined();
      expect(actions.editButton).toBeUndefined();
      expect(actions.thankButton).toBeUndefined();
      expect(actions.copyLinkButton).toBeUndefined();
      expect(actions.goToParentButton).toBeUndefined();
      expect(actions.goToChildButton).toBeUndefined();
      expect(actions.toggleChildThreadsButton).toBeUndefined();
    });
  });

  describe('create', () => {
    it('should create all appropriate action buttons', () => {
      const addReplySpy = jest.spyOn(actions, 'addReplyButton');
      const addEditSpy = jest.spyOn(actions, 'addEditButton');
      const addThankSpy = jest.spyOn(actions, 'addThankButton');
      const addGoToParentSpy = jest.spyOn(actions, 'addGoToParentButton');

      actions.create();

      expect(addReplySpy).toHaveBeenCalled();
      expect(addEditSpy).toHaveBeenCalled();
      expect(addThankSpy).toHaveBeenCalled();
      expect(addGoToParentSpy).toHaveBeenCalled();
    });
  });

  describe('addReplyButton', () => {
    it('should create and append reply button when comment is actionable', () => {
      actions.addReplyButton();

      expect(actions.replyButton).toBeDefined();
      expect(actions.appendedButtons).toContain(actions.replyButton);
    });

    it('should not create reply button when comment is not actionable', () => {
      mockComment.isActionable = false;

      actions.addReplyButton();

      expect(actions.replyButton).toBeUndefined();
    });

    it('should disable reply button for outdented comments', () => {
      const commentManager = require('../src/commentManager').default;
      commentManager.getByIndex.mockReturnValue({ isOutdented: true });

      actions.addReplyButton();

      expect(actions.replyButton.setDisabled).toHaveBeenCalledWith(true);
      expect(actions.replyButton.setTooltip).toHaveBeenCalledWith('mocked-cm-reply-outdented-tooltip');
    });

    it('should call reply method when button action is triggered', () => {
      actions.addReplyButton();

      actions.replyButton.action();

      expect(mockComment.reply).toHaveBeenCalled();
    });

    it('should cancel reply form if it exists', () => {
      mockComment.replyForm = { cancel: jest.fn() };

      actions.addReplyButton();
      actions.replyButton.action();

      expect(mockComment.replyForm.cancel).toHaveBeenCalled();
      expect(mockComment.reply).not.toHaveBeenCalled();
    });
  });

  describe('addEditButton', () => {
    it('should create and append edit button when comment is editable', () => {
      actions.addEditButton();

      expect(actions.editButton).toBeDefined();
      expect(actions.appendedButtons).toContain(actions.editButton);
    });

    it('should not create edit button when comment is not editable', () => {
      mockComment.isEditable = false;

      actions.addEditButton();

      expect(actions.editButton).toBeUndefined();
    });

    it('should call edit method when button action is triggered', () => {
      actions.addEditButton();

      actions.editButton.action();

      expect(mockComment.edit).toHaveBeenCalled();
    });
  });

  describe('addThankButton', () => {
    const cd = require('../src/cd');

    it('should create and append thank button for valid comments', () => {
      actions.addThankButton();

      expect(actions.thankButton).toBeDefined();
      expect(actions.appendedButtons).toContain(actions.thankButton);
    });

    it('should not create thank button when user is not registered', () => {
      cd.user.isRegistered.mockReturnValue(false);

      actions.addThankButton();

      expect(actions.thankButton).toBeUndefined();
    });

    it('should not create thank button when author is not registered', () => {
      mockComment.author.isRegistered.mockReturnValue(false);

      actions.addThankButton();

      expect(actions.thankButton).toBeUndefined();
    });

    it('should not create thank button for own comments', () => {
      mockComment.isOwn = true;

      actions.addThankButton();

      expect(actions.thankButton).toBeUndefined();
    });

    it('should not create thank button when comment has no date', () => {
      mockComment.date = null;

      actions.addThankButton();

      expect(actions.thankButton).toBeUndefined();
    });

    it('should set thanked state for already thanked comments', () => {
      const commentManager = require('../src/commentManager').default;
      commentManager.getThanksStorage.mockReturnValue({
        getData: () => ({ 'test-comment-id': { id: 'test-comment-id' } }),
      });

      const setThankedSpy = jest.spyOn(actions, 'setThanked');

      actions.addThankButton();

      expect(setThankedSpy).toHaveBeenCalled();
    });

    it('should call thank method when button action is triggered', () => {
      actions.addThankButton();

      actions.thankButton.action();

      expect(mockComment.thank).toHaveBeenCalled();
    });
  });

  describe('addGoToParentButton', () => {
    it('should create and append go to parent button when parent exists', () => {
      actions.addGoToParentButton();

      expect(actions.goToParentButton).toBeDefined();
      expect(actions.appendedButtons).toContain(actions.goToParentButton);
    });

    it('should not create go to parent button when no parent exists', () => {
      mockComment.getParent.mockReturnValue(null);

      actions.addGoToParentButton();

      expect(actions.goToParentButton).toBeUndefined();
    });

    it('should call goToParent method when button action is triggered', () => {
      actions.addGoToParentButton();

      actions.goToParentButton.action();

      expect(mockComment.goToParent).toHaveBeenCalled();
    });
  });

  describe('maybeAddGoToChildButton', () => {
    it('should create and prepend go to child button when target child exists', () => {
      mockComment.targetChild = { scrollTo: jest.fn() };

      actions.maybeAddGoToChildButton();

      expect(actions.goToChildButton).toBeDefined();
      expect(actions.prependedButtons).toContain(actions.goToChildButton);
      expect(mockComment.configureLayers).toHaveBeenCalled();
    });

    it('should not create go to child button when no target child exists', () => {
      actions.maybeAddGoToChildButton();

      expect(actions.goToChildButton).toBeUndefined();
    });

    it('should not create duplicate go to child button', () => {
      mockComment.targetChild = { scrollTo: jest.fn() };
      actions.goToChildButton = { isConnected: jest.fn(() => true) };

      actions.maybeAddGoToChildButton();

      expect(actions.prependedButtons).toBeUndefined();
    });

    it('should call scrollTo on target child when button action is triggered', () => {
      const targetChild = { scrollTo: jest.fn() };
      mockComment.targetChild = targetChild;

      actions.maybeAddGoToChildButton();
      actions.goToChildButton.action();

      expect(targetChild.scrollTo).toHaveBeenCalledWith({ pushState: true });
    });
  });

  describe('addToggleChildThreadsButton', () => {
    it('should create and append toggle button when children with threads exist', () => {
      mockComment.getChildren.mockReturnValue([{ thread: {} }]);

      actions.addToggleChildThreadsButton();

      expect(actions.toggleChildThreadsButton).toBeDefined();
      expect(actions.appendedButtons).toContain(actions.toggleChildThreadsButton);
    });

    it('should not create toggle button when no children with threads exist', () => {
      mockComment.getChildren.mockReturnValue([{ thread: null }]);

      actions.addToggleChildThreadsButton();

      expect(actions.toggleChildThreadsButton).toBeUndefined();
    });

    it('should not create duplicate toggle button', () => {
      mockComment.getChildren.mockReturnValue([{ thread: {} }]);
      actions.toggleChildThreadsButton = { isConnected: jest.fn(() => true) };

      actions.addToggleChildThreadsButton();

      expect(actions.appendedButtons).toBeUndefined();
    });

    it('should call toggleChildThreads when button action is triggered', () => {
      mockComment.getChildren.mockReturnValue([{ thread: {} }]);

      actions.addToggleChildThreadsButton();
      actions.toggleChildThreadsButton.action();

      expect(mockComment.toggleChildThreads).toHaveBeenCalled();
    });

    it('should add mouseenter event listener for onboarding', () => {
      mockComment.getChildren.mockReturnValue([{ thread: {} }]);
      const addEventListenerSpy = jest.spyOn(document.createElement('button'), 'addEventListener');

      // Mock the button element to spy on addEventListener
      actions.createToggleChildThreadsButton = jest.fn(() => ({
        element: {
          addEventListener: addEventListenerSpy,
        },
        isConnected: jest.fn(() => false),
      }));

      actions.addToggleChildThreadsButton();

      expect(addEventListenerSpy).toHaveBeenCalledWith('mouseenter', expect.any(Function));
    });
  });

  describe('setThanked', () => {
    beforeEach(() => {
      actions.addThankButton();
    });

    it('should update thank button to thanked state', () => {
      actions.setThanked();

      expect(actions.thankButton.setDisabled).toHaveBeenCalledWith(true);
      expect(actions.thankButton.setLabel).toHaveBeenCalledWith('mocked-cm-thanked');
      expect(actions.thankButton.setTooltip).toHaveBeenCalledWith('mocked-cm-thanked-tooltip');
    });

    it('should handle missing thank button gracefully', () => {
      actions.thankButton = undefined;

      expect(() => actions.setThanked()).not.toThrow();
    });
  });

  describe('abstract methods', () => {
    let baseActions;

    beforeEach(() => {
      baseActions = new CommentActions(mockComment);
    });

    it('should throw error for createReplyButton', () => {
      expect(() => baseActions.createReplyButton(() => {})).toThrow('createReplyButton must be implemented by subclasses');
    });

    it('should throw error for createEditButton', () => {
      expect(() => baseActions.createEditButton(() => {})).toThrow('createEditButton must be implemented by subclasses');
    });

    it('should throw error for createThankButton', () => {
      expect(() => baseActions.createThankButton(() => {}, false)).toThrow('createThankButton must be implemented by subclasses');
    });

    it('should throw error for createCopyLinkButton', () => {
      expect(() => baseActions.createCopyLinkButton(() => {})).toThrow('createCopyLinkButton must be implemented by subclasses');
    });

    it('should throw error for createGoToParentButton', () => {
      expect(() => baseActions.createGoToParentButton(() => {})).toThrow('createGoToParentButton must be implemented by subclasses');
    });

    it('should throw error for createGoToChildButton', () => {
      expect(() => baseActions.createGoToChildButton(() => {})).toThrow('createGoToChildButton must be implemented by subclasses');
    });

    it('should throw error for createToggleChildThreadsButton', () => {
      expect(() => baseActions.createToggleChildThreadsButton(() => {})).toThrow('createToggleChildThreadsButton must be implemented by subclasses');
    });

    it('should throw error for appendButton', () => {
      expect(() => baseActions.appendButton({})).toThrow('appendButton must be implemented by subclasses');
    });

    it('should throw error for prependButton', () => {
      expect(() => baseActions.prependButton({})).toThrow('prependButton must be implemented by subclasses');
    });
  });
});
