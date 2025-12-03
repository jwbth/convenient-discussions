# Implementation Plan

- [x] 1. Set up analysis and validation infrastructure
  - Create utility functions for scanning and analyzing null usage patterns
  - Implement diagnostic validation helpers for type checking after changes
  - Set up file processing state tracking to manage the refactoring progress
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 2. Process utility and helper functions (Phase 1 - Leaf functions)
  - [x] 2.1 Update shared/utils-general.js null returns
    - Replace `return null;` statements in `getElementByClassName`, `parsePageNameFromUrl`, and other utility functions
    - Update JSDoc `@returns` tags from `Type | null` to `Type | undefined`
    - _Requirements: 1.1, 1.4_

  - [x] 2.2 Update shared/utils-timestamp.js null returns
    - Replace `return null;` in timestamp parsing functions
    - Update JSDoc return types to use `undefined`
    - _Requirements: 1.1, 1.4_

  - [x] 2.3 Update utils-window.js null returns
    - Replace `return null;` statements in DOM utility functions like `getHigherNodeAndOffsetInSelection`
    - Add `|| undefined` for native API returns where appropriate
    - Update JSDoc return types
    - _Requirements: 1.1, 1.2, 1.4_

  - [x] 2.4 Write validation tests for utility function changes
    - Create unit tests to verify utility functions return `undefined` instead of `null`
    - Test that function behavior remains consistent after changes
    - _Requirements: 4.1, 4.2_

- [x] 3. Process core data model classes (Phase 2 - Properties and constructors)
  - [x] 3.1 Update SectionSkeleton.js property initializations
    - Remove `= null` from `sourcePageName` property initialization
    - Remove `= null` from `sectionNumber` in constructor, move to class field
    - Update JSDoc types from `?Type` to `Type | undefined`
    - _Requirements: 2.1, 2.2, 6.1, 6.2_

  - [ ] 3.2 Update CommentSkeleton.js property initializations
    - Remove `= null` from `section` property assignment
    - Update JSDoc type from `?import('./SectionSkeleton').default` to `import('./SectionSkeleton').default | undefined`
    - Update `date` property JSDoc from `?Date` to `Date | undefined`

    - _Requirements: 2.1, 2.2, 6.3_

  - [ ] 3.3 Update Comment.js property initializations
    - Remove `= null` assignments from `isNew`, `isSeen`, `isChangedSincePreviousVisit`, `collapsedThread`, `isSeenBeforeChanged`
    - Update corresponding JSDoc types to use `| undefined` instead of `?` or `| null`
    - _Requirements: 2.1, 2.2, 6.3_

  - [ ]\* 3.4 Write validation tests for data model property changes
    - Test that properties default to `undefined` when not explicitly set
    - Verify JSDoc types are correctly updated
    - _Requirements: 4.1, 4.2_

- [x] 4. Process Section.js class (Phase 3 - Complex class with dependencies)
  - [x] 4.1 Update Section.js property initializations and null returns
    - Remove `= null` from `sourcePageName` property
    - Update `source` property JSDoc from `?SectionSource | undefined` to `SectionSource | undefined`
    - Update `subscriptionState` JSDoc from `?boolean` to `boolean | undefined`
    - Replace `return null;` statements in methods like `getParent`
    - _Requirements: 1.1, 1.4, 2.1, 2.2_

  - [x] 4.2 Update Section.js null comparisons and assignments
    - Update comparisons that check for `null` to check for `undefined`
    - Update `this.source = null` assignments to remove explicit assignment
    - Update `liveSectionNumber` calculation to handle `undefined` from `sectionNumber`
    - _Requirements: 3.1, 3.2, 7.3_

  - [ ]\* 4.3 Write integration tests for Section class changes
    - Test section property access patterns with `undefined` values
    - Verify section hierarchy methods work correctly with `undefined` returns
    - _Requirements: 4.1, 4.3_

- [x] 5. Process Comment.js class (Phase 4 - Most complex class)
  - [x] 5.1 Update Comment.js null return statements
    - Replace `return null;` in methods like `getVisibleExpandNote`, `findNewSelf`, `isInViewport`
    - Update JSDoc `@returns` tags to use `undefined`
    - Add `|| undefined` for native API calls that return `null`
    - _Requirements: 1.1, 1.2, 1.4_

  - [ ] 5.2 Update Comment.js null assignments and comparisons
    - Update `this.source = null` and `this.collapsedThread = null` assignments
    - Update null comparisons in conditional logic to use `undefined`
    - Update `isSeenBeforeChanged = null` assignment

    - _Requirements: 2.1, 3.1, 3.2_

  - [ ] 5.3 Update Comment.js static method null returns
    - Replace `return null;` in `parseDtId` and `parseId` static methods
    - Update JSDoc return types for static methods
    - _Requirements: 1.1, 1.4_

  - [ ]\* 5.4 Write comprehensive tests for Comment class changes
    - Test comment parsing methods return `undefined` for invalid input
    - Test comment property access with `undefined` values
    - Test comment visibility and viewport methods
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 6. Process Thread.js class (Phase 5 - Thread management)
  - [x] 6.1 Update Thread.js property initialization and null returns
    - Remove `= null` from `collapsedRange` property
    - Replace `return null;` in thread methods
    - Update JSDoc types from `?(HTMLElement[])` to `HTMLElement[] | undefined`
    - _Requirements: 1.1, 1.4, 2.1, 2.2_

  - [x] 6.2 Update Thread.js null comparisons in loops
    - Update for-loop conditions that check against `null`
    - Update thread traversal logic to handle `undefined`
    - _Requirements: 3.1, 3.2_

  - [ ]\* 6.3 Write tests for Thread class changes
    - Test thread collapse/expand functionality with `undefined` values
    - Test thread traversal methods
    - _Requirements: 4.1, 4.3_

- [x] 7. Process form and dialog classes (Phase 6 - UI components)
  - [x] 7.1 Update CommentForm.js null assignments and returns
    - Remove `= null` from `containerListType`, `newSectionApi`, `sectionSubmitted`
    - Update timeout assignments like `this.previewTimeout = null`
    - Update JSDoc types to use `undefined`
    - _Requirements: 1.1, 2.1, 2.2_

  - [x] 7.2 Update other UI component null handling
    - Process MoveSectionDialog.js, SettingsDialog.js null patterns
    - Update widget classes null handling
    - _Requirements: 1.1, 2.1, 2.2_

  - [ ]\* 7.3 Write tests for form and dialog changes
    - Test form state management with `undefined` values
    - Test dialog initialization and cleanup
    - _Requirements: 4.1, 4.2_

- [x] 8. Process manager and controller classes (Phase 7 - Application controllers)
  - [x] 8.1 Update talkPageController.js null assignments
    - Remove `= null` from `lastCheckedRevisionId`, `relevantAddedCommentIds`
    - Update scroll data null assignments
    - Update JSDoc types for controller properties
    - _Requirements: 2.1, 2.2, 6.1, 6.2_

  - [x] 8.2 Update commentManager.js null returns and comparisons
    - Replace `return null;` in `getById` and visibility methods
    - Update null comparisons in comment lookup logic
    - _Requirements: 1.1, 1.4, 3.1, 3.2_

  - [x] 8.3 Update pageRegistry.js and Page.js null handling
    - Replace `return null;` in page lookup methods
    - Update page property null assignments
    - Update archive prefix and page metadata null handling
    - _Requirements: 1.1, 1.4, 2.1, 2.2_

  - [ ]\* 8.4 Write integration tests for manager classes
    - Test comment manager lookup methods with `undefined` returns
    - Test page controller state management
    - _Requirements: 4.1, 4.3_

- [x] 9. Process autocomplete and specialized features (Phase 8 - Feature modules)
  - [x] 9.1 Update autocomplete classes null handling
    - Process BaseAutocomplete.js, MentionsAutocomplete.js null patterns
    - Update autocomplete factory null returns
    - _Requirements: 1.1, 2.1, 2.2_

  - [x] 9.2 Update specialized feature null handling
    - Process Subscriptions.js `getState` method null returns
    - Update navigation and TOC null handling
    - _Requirements: 1.1, 1.4_

  - [ ]\* 9.3 Write tests for specialized feature changes
    - Test autocomplete functionality with `undefined` values
    - Test subscription state management
    - _Requirements: 4.1, 4.2_

- [x] 10. Process worker and parsing modules (Phase 9 - Background processing)
  - [x] 10.1 Update worker null returns and assignments
    - Replace `return null;` in worker.js `restoreFunc`
    - Update CommentWorker.js null returns
    - Update extendDomhandler.js null returns
    - _Requirements: 1.1, 1.4_

  - [x] 10.2 Update Parser.js null handling
    - Replace `return null;` in parsing methods
    - Update parser null comparisons and assignments
    - Update TreeWalker null handling
    - _Requirements: 1.1, 1.4, 3.1, 3.2_

  - [ ]\* 10.3 Write tests for worker and parser changes
    - Test parsing functionality with `undefined` returns
    - Test worker comment processing
    - _Requirements: 4.1, 4.2_

- [x] 11. Update function parameter types and call sites (Phase 10 - Parameter propagation)
  - [x] 11.1 Update function parameter JSDoc types
    - Find functions with `@param` types containing `null` but not both `null` and `undefined`
    - Update parameter types to use `undefined` instead of `null`
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 11.2 Update function call sites and parameter passing
    - Update function calls that pass `null` to parameters now expecting `undefined`
    - Update parameter validation logic in function bodies
    - _Requirements: 6.2, 6.3_

  - [ ]\* 11.3 Write tests for parameter type changes
    - Test function parameter validation with `undefined` values
    - Test function call compatibility
    - _Requirements: 4.1, 4.2_

- [x] 12. Final validation and cleanup (Phase 11 - System validation)
  - Use getDiagnostics to validate all changed files
  - Fix any remaining type inconsistencies
  - Ensure no new type errors were introduced
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 12.2 Update remaining comparison operators and edge cases
    - Find and update any remaining `=== null` or `!== null` comparisons
    - Handle any edge cases discovered during validation
    - Update any missed JSDoc type annotations
    - _Requirements: 3.1, 3.2, 7.1, 7.2, 7.3, 7.4_

  - [x] 12.3 Validate critical code paths and integration points
    - Test comment loading and rendering functionality
    - Test form submission and validation flows
    - Test autocomplete and user interaction features
    - Verify no regressions in core functionality
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]\* 12.4 Create comprehensive regression test suite
    - Write end-to-end tests covering major user workflows
    - Test error handling and edge cases with `undefined` values
    - Document any remaining exceptions or special cases
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
