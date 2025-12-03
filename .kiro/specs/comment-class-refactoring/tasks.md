# Implementation Plan

- [x] 1. Create CommentLayers composition classes
  - [x] 1.1 Implement CommentLayers base class
    - Create src/CommentLayers.js with base layer management
    - Define create, destroy, updateStyles methods
    - Define underlay, overlay, line, marker properties and jQuery wrappers
    - _Requirements: 2.1, 2.2_

  - [x] 1.2 Implement SpaciousCommentLayers class
    - Create src/SpaciousCommentLayers.js extending CommentLayers
    - Override create and updateStyles for spacious layout (no overlay menu)
    - _Requirements: 2.3_

  - [x] 1.3 Implement CompactCommentLayers class
    - Create src/CompactCommentLayers.js extending CommentLayers
    - Add overlayInnerWrapper, overlayGradient, overlayMenu properties
    - Implement showMenu and hideMenu methods for overlay menu management
    - Override create method to include overlay menu elements
    - _Requirements: 2.3_

- [x] 2. Create CommentActions composition classes
  - [x] 2.1 Implement CommentActions base class
    - Create src/CommentActions.js with base action management
    - Define addReplyButton, addEditButton, addThankButton, etc. methods
    - Handle button creation and event binding
    - _Requirements: 7.1, 7.2_

  - [x] 2.2 Implement SpaciousCommentActions class
    - Create src/SpaciousCommentActions.js extending CommentActions
    - Override action creation for spacious-specific styling (menu-based)
    - _Requirements: 7.3_

  - [x] 2.3 Implement CompactCommentActions class
    - Create src/CompactCommentActions.js extending CommentActions
    - Override action creation for compact-specific styling (overlay-based)
    - _Requirements: 7.3_

- [x] 3. Create Comment subclasses
  - [x] 3.1 Create SpaciousComment class
    - Create src/SpaciousComment.js extending Comment
    - Implement createLayers to use SpaciousCommentLayers
    - Add formatHeader method for author/date header management
    - Implement bindEvents as no-op method
    - Create static initPrototypes for header and SVG icon prototypes
    - _Requirements: 1.1, 1.2, 1.5_

  - [x] 3.2 Create CompactComment class
    - Create src/CompactComment.js extending Comment
    - Implement createLayers to use CompactCommentLayers
    - Add hover-specific properties: isHovered, wasMenuHidden
    - Implement bindEvents for hover event handling
    - Add highlightHovered method for hover behavior
    - Create static initPrototypes for overlay menu prototypes
    - _Requirements: 1.1, 1.3, 1.5_

- [x] 4. Update settings system
  - [x] 4.1 Implement settings migration
    - Update src/settings.js to rename reformatComments setting to spaciousComments
    - Add reformatComments to aliases property for backward compatibility
    - Update all references to use new setting name
    - _Requirements: 4.4, 4.5_

- [x] 5. Update Parser integration

- [ ] 5. Update Parser integration
  - [x] 5.1 Update BootProcess.findTargets to choose appropriate Comment class
    - Modify src/BootProcess.js findTargets method to select SpaciousComment or CompactComment
    - Update CommentClass property based on spaciousComments setting
    - Import and use appropriate comment class
    - _Requirements: 4.1, 4.2, 4.3_

-

- [x] 6. Refactor existing Comment class to use composition
  - [x] 6.1 Extract layers functionality to composition
    - Move layer-related properties from Comment to layers composition
    - Update createLayers method to delegate to appropriate layers class
    - Remove direct layer property access in favor of layers.property
    - Update all internal layer references
    - _Requirements: 2.4, 2.6_

  - [x] 6.2 Extract actions functionality to composition
    - Move action-related methods from Comment to actions composition
    - Update action creation to delegate to appropriate actions class
    - Remove direct action method calls in favor of actions.method()
    - Update all internal action references
    - _Requirements: 7.4, 7.6_

  - [x] 6.3 Rename reformatted property to spacious
    - Update all internal references from reformatted to spacious in Comment.js
    - Update type definitions and JSDoc comments
    - Update isReformatted() method to use spacious property
    - _Requirements: 3.5, 5.4_

  - [x] 6.4 Update Comment base class for inheritance
    - Make createLayers, bindEvents, and initPrototypes abstract methods
    - Add layers and actions composition properties
    - Update constructor to not directly set reformatted property
    - Remove spacious/compact-specific code from base class
    - _Requirements: 1.4, 3.1, 3.2_

- [x] 7. Update external references and type guards
  - [x] 7.1 Update layer property access
    - Find all external references to comment.underlay, comment.overlay, etc.
    - Update to use comment.layers.underlay, comment.layers.overlay, etc.
    - Update jQuery wrapper access patterns
    - Search and update all files that access layer properties
    - _Requirements: 5.1, 2.6_

  - [x] 7.2 Update type guards and instanceof checks
    - Replace hasLayers() type guard with layers property check
    - Replace hasClassicUnderlay() type guard with layers property and class check
    - Update isReformatted() type guard to use spacious property
    - Update external type guard references across codebase
    - _Requirements: 3.4, 3.5, 5.3_

  - [x] 7.3 Update action method calls
    - Find all external calls to action methods on comment instances
    - Update to use comment.actions.method() pattern where appropriate
    - Search and update all files that call action methods
    - _Requirements: 7.6_

- [x] 8. Update prototype management
  - [x] 8.1 Refactor Comment.initPrototypes method
    - Move shared prototypes (underlay, overlay) to Comment base class
    - Remove spacious/compact-specific prototypes from base method
    - Update existing initPrototypes method in Comment.js
    - _Requirements: 1.6_

  - [x] 8.2 Implement SpaciousComment.initPrototypes
    - Move header wrapper and SVG icon prototypes to SpaciousComment
    - Ensure prototypes are created when spaciousComments setting is true
    - Extract spacious-specific prototype code from Comment.initPrototypes
    - _Requirements: 1.6_

  - [x] 8.3 Implement CompactComment.initPrototypes
    - Move overlay menu prototypes to CompactComment
    - Ensure prototypes are created when spaciousComments setting is false
    - Extract compact-specific prototype code from Comment.initPrototypes
    - _Requirements: 1.6_

- [x] 9. Remove complex generic type system
  - [x] 9.1 Remove unused generic types
    - Delete HTMLElementIfReformatted, HTMLElementIfNotReformattedAndHasLayers, JQueryIfReformatted, JQueryIfNotReformattedAndHasLayers types from Comment.js
    - Remove HasLayers and Reformatted generic parameters from Comment class
    - Clean up conditional type definitions
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 9.2 Update type definitions for subclasses
    - Add concrete types to SpaciousComment and CompactComment
    - Update JSDoc comments to reflect new class hierarchy
    - Update type definitions for external consumption
    - _Requirements: 5.4_

- [x] 10. Update commentManager integration
  - [x] 10.1 Update commentManager.reformatComments method
    - Update src/commentManager.js to work with new class hierarchy
    - Update reformatCommentsSetting references to use spaciousComments
    - Ensure reformatComments method works with SpaciousComment instances
    - _Requirements: 4.4, 4.5_

- [-] 11. Testing and validation
  - [x] 11.1 Create unit tests for new classes
    - Write tests for CommentLayers, CommentActions, and their subclasses
    - Write tests for SpaciousComment and CompactComment functionality
    - Test prototype management and class instantiation
    - _Requirements: 8.1, 8.2_

  - [x] 11.2 Update existing tests
    - Update Comment class tests to work with new architecture
    - Update integration tests for Parser and settings changes
    - Fix any broken tests due to property and method changes
    - _Requirements: 8.2, 5.5_

  - [x] 11.3 Validate backward compatibility
    - Test that existing comment functionality works identically
    - Verify settings migration works correctly
    - Ensure external references continue to work
    - Test visual appearance matches original
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 11.4 Set up browser testing environment (requires user assistance)
    - User assistance needed to configure Selenium/browser testing setup
    - User assistance needed to update .vscode/launch.json for testing configuration
    - User assistance needed to install and configure any required testing dependencies
    - User assistance needed to verify browser testing environment is working
    - _Requirements: 8.3_

  - [ ] 11.5 Execute browser tests (after environment setup)
    - Test comment display and interaction in actual browser
    - Verify hover behaviors work correctly for CompactComment
    - Test layer positioning and visual appearance
    - Validate action button functionality
    - Test both SpaciousComment and CompactComment modes
    - _Requirements: 8.3_

- [ ] 12. Performance validation and cleanup
  - [ ] 12.1 Performance validation
    - Verify comment creation performance is maintained
    - Test layer rendering with many comments
    - Validate prototype caching still works effectively
    - _Requirements: 8.4_

  - [ ] 12.2 Final cleanup and documentation
    - Update JSDoc comments to reflect new class hierarchy
    - Document the new composition pattern usage
    - Remove any temporary compatibility code
    - _Requirements: 5.4_
