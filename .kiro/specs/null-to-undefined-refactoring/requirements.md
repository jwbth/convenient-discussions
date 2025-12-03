# Requirements Document

## Introduction

This feature involves systematically replacing `null` values with `undefined` across the Convenient Discussions codebase to improve consistency and align with modern JavaScript practices. The refactoring will focus on functions, properties, variables, and parameters that currently use `null` but have no meaningful semantic difference between `null` and `undefined`.

## Requirements

### Requirement 1

**User Story:** As a developer maintaining the codebase, I want all functions to return `undefined` instead of `null` when there's no meaningful difference, so that the codebase has consistent return value semantics.

#### Acceptance Criteria

1. WHEN a function currently returns `null` directly THEN the system SHALL replace `return null;` with `return;`
2. WHEN a function returns `null` from native JavaScript or MediaWiki APIs THEN the system SHALL add `|| undefined` to convert the return value
3. WHEN a function can return both `null` and `undefined` meaningfully THEN the system SHALL leave it unchanged
4. WHEN function return types are updated THEN the system SHALL update corresponding JSDoc `@returns` tags to reflect `undefined` instead of `null`

### Requirement 2

**User Story:** As a developer working with object properties, I want properties to use `undefined` instead of `null` for unset values, so that property access patterns are consistent throughout the codebase.

#### Acceptance Criteria

1. WHEN a property is initialized with `null` THEN the system SHALL remove the `= null` assignment to let it default to `undefined`
2. WHEN property types are updated THEN the system SHALL update JSDoc type annotations from `?Type` or `Type | null` to `Type | undefined`
3. WHEN properties in settings.js are encountered THEN the system SHALL leave them unchanged as they are explicitly allowed to use `null`
4. WHEN property comparisons check for `null` THEN the system SHALL update them to check for `undefined`

### Requirement 3

**User Story:** As a developer reading and maintaining code, I want variable assignments and comparisons to use `undefined` consistently, so that the codebase follows a single pattern for representing absent values.

#### Acceptance Criteria

1. WHEN variables are assigned `null` values THEN the system SHALL remove the assignment or replace with `undefined` where semantically appropriate
2. WHEN code compares variables to `null` THEN the system SHALL update comparisons to use `undefined`
3. WHEN variable types in JSDoc contain `null` THEN the system SHALL update them to use `undefined`
4. WHEN variables hold values from native APIs that return `null` THEN the system SHALL preserve the `null` values from those APIs

### Requirement 4

**User Story:** As a developer ensuring code quality, I want the refactoring to maintain type safety and not introduce any errors, so that the codebase remains stable and functional.

#### Acceptance Criteria

1. WHEN JSDoc type definitions are updated THEN the system SHALL ensure TypeScript strict null checks continue to pass
2. WHEN function call sites are updated THEN the system SHALL verify that all callers handle the new return types correctly
3. WHEN properties are accessed THEN the system SHALL ensure that dependent code properly handles `undefined` instead of `null`
4. WHEN the refactoring is complete THEN the system SHALL have no introduced type errors or runtime inconsistencies

### Requirement 5

**User Story:** As a developer working with external dependencies, I want to preserve `null` values that come from external APIs, so that integration with MediaWiki and browser APIs remains correct.

#### Acceptance Criteria

1. WHEN encountering `null` from native JavaScript APIs THEN the system SHALL preserve the original `null` values in comparisons
2. WHEN encountering `null` from MediaWiki APIs (`mw`) THEN the system SHALL preserve the original `null` values in comparisons
3. WHEN encountering `null` from the Tribute library THEN the system SHALL leave all `null` values unchanged
4. WHEN converting API return values THEN the system SHALL only add `|| undefined` to function returns, not to direct API usage

### Requirement 6

**User Story:** As a developer working with function parameters, I want parameters to accept `undefined` instead of `null` when there's no semantic difference, so that function interfaces are consistent with the rest of the codebase.

#### Acceptance Criteria

1. WHEN a function parameter type includes `null` but not both `null` and `undefined` THEN the system SHALL update the `@param` JSDoc to use `undefined` instead
2. WHEN function body comparisons check parameters against `null` THEN the system SHALL update them to check against `undefined`
3. WHEN variables and properties within function bodies have types that include `null` THEN the system SHALL update their JSDoc types to use `undefined`
4. WHEN parameters that can meaningfully be both `null` and `undefined` are encountered THEN the system SHALL leave them unchanged

### Requirement 7

**User Story:** As a developer maintaining call chains, I want return value changes to propagate correctly through function call hierarchies, so that the entire call stack uses consistent value semantics.

#### Acceptance Criteria

1. WHEN a function's return type changes from `null` to `undefined` THEN the system SHALL identify all callers of that function
2. WHEN callers return the modified function's value THEN the system SHALL update the caller's return type and JSDoc accordingly
3. WHEN callers compare the return value to `null` THEN the system SHALL update those comparisons to use `undefined`
4. WHEN call chains span multiple levels THEN the system SHALL propagate changes through the entire chain
