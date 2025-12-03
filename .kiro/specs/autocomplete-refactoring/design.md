# Design Document

## Overview

This design document outlines the refactoring of the Autocomplete class into a clean object-oriented architecture. The refactoring will replace the current monolithic approach with separate classes for each autocomplete type, using inheritance and polymorphism to eliminate code duplication and improve maintainability.

## Architecture

> [!WARNING]
> The code snippets below are written in TypeScript. The actual code should use JavaScript with types and keywords expressed using TypeScript-flavored JSDoc (e.g. index signatures instead of `Object` types, generic parameters via `@template {ExtendedType} [Type=DefaultType]`, function overloads using `@overload`, etc.).

### Class Hierarchy

```text
BaseAutocomplete (abstract base class)
├── MentionsAutocomplete
├── WikilinksAutocomplete
├── TemplatesAutocomplete
├── TagsAutocomplete
└── CommentLinksAutocomplete
```

### Core Components

1. **BaseAutocomplete**: Abstract base class containing shared functionality
2. **Type-specific classes**: Concrete implementations for each autocomplete type
3. **AutocompleteManager**: Refactored main class that coordinates the type-specific classes
4. **AutocompleteFactory**: Factory class to create appropriate autocomplete instances

## Components and Interfaces

### BaseAutocomplete Abstract Class

```typescript
abstract class BaseAutocomplete {
  // Shared properties
  cache = {}
  lastResults = []
  lastQuery = ''

  // Abstract methods (must be implemented by subclasses)
  abstract getLabel(): string
  abstract getTrigger(): string
  abstract transformItemToInsertData(item: any): InsertData
  abstract validateInput(text: string): boolean
  abstract makeApiRequest(text: string): Promise<string[]>

  // Shared methods
  async getValues(text: string, callback: Function): Promise<void>
  processResults(items: any[], config: AutocompleteConfigShared): Value[]
  searchLocal(text: string, list: string[]): string[]
  handleCache(text: string): string[] | null
  updateCache(text: string, results: string[]): void
}
```

### Type-Specific Classes

#### MentionsAutocomplete

- Handles user mention autocomplete with @ trigger
- Manages user name validation and API requests to get relevant users
- Transforms mentions into proper wikilink format with user namespace

#### WikilinksAutocomplete

- Handles page link autocomplete with [[ trigger
- Manages page name validation and OpenSearch API requests
- Handles colon prefixes and namespace logic

#### TemplatesAutocomplete

- Handles template autocomplete with {{ trigger
- Manages template name validation and template data insertion
- Integrates with MediaWiki TemplateData API for parameter suggestions

#### TagsAutocomplete

- Handles HTML tag autocomplete with < trigger
- Uses predefined tag list with custom additions
- Handles both simple tags and complex tag structures

#### CommentLinksAutocomplete

- Handles comment and section link autocomplete with [[# trigger
- Processes existing comments and sections to build suggestion list
- Lazy-loads data from comment registry and section registry

### AutocompleteManager (Refactored Main Class)

```typescript
class AutocompleteManager {
  private autocompleteInstances: Map<AutocompleteType, BaseAutocomplete>
  private tribute: Tribute
  private inputs: TextInputWidget[]

  constructor(options: AutocompleteOptions)
  init(): void
  terminate(): void
  private createAutocompleteInstances(types: AutocompleteType[]): void
  private getCollections(): TributeCollection[]
}
```

### AutocompleteFactory

```typescript
class AutocompleteFactory {
  static create(type: AutocompleteType, options: any): BaseAutocomplete {
    switch (type) {
      case 'mentions':
        return new MentionsAutocomplete(options)
      case 'wikilinks':
        return new WikilinksAutocomplete(options)
      case 'templates':
        return new TemplatesAutocomplete(options)
      case 'tags':
        return new TagsAutocomplete(options)
      case 'commentLinks':
        return new CommentLinksAutocomplete(options)
      default:
        throw new CdError(`Unknown autocomplete type: ${type}`)
    }
  }
}
```

## Data Models

### AutocompleteOptions Interface

```typescript
interface AutocompleteOptions {
  types: AutocompleteType[]
  inputs: TextInputWidget[]
  comments?: Comment[]
  defaultUserNames?: string[]
}
```

### Value Interface (Enhanced)

```typescript
interface Value<T = any> {
  key: string
  item: T
  transformItemToInsertData?: () => InsertData
}
```

### AutocompleteConfig Interface

```typescript
interface AutocompleteConfig {
  cache: StringArraysByKey
  lastResults: string[]
  lastQuery: string
  default?: any[]
  defaultLazy?: () => any[]
  transformItemToInsertData?: (this: Value) => InsertData
  data?: AnyByKey
}
```

## Error Handling

### Validation Errors

- Each autocomplete type will validate input according to its specific rules
- Invalid input will be handled gracefully without breaking the autocomplete flow
- Error states will be logged for debugging purposes

### API Request Errors

- API/network failures will be caught and handled without disrupting user experience
- Fallback to cached results when API requests fail

## Testing Strategy

### Unit Tests

- Test each autocomplete type class independently
- Mock API requests and external dependencies
- Verify transform methods produce correct output
- Test caching behavior and cache invalidation

### Integration Tests

- Test AutocompleteManager coordination of type classes
- Verify Tribute integration works correctly
- Test complete autocomplete workflows end-to-end
- Validate backward compatibility with existing code

### Performance Tests

- Measure autocomplete response times
- Test with large datasets (many users, pages, templates)
- Verify memory usage doesn't increase significantly
- Test concurrent autocomplete requests

## Migration Strategy

### Phase 1: Create Base Infrastructure

- Implement BaseAutocomplete abstract class
- Create AutocompleteFactory
- Set up basic project structure for new classes

### Phase 2: Implement Type Classes

- Create each type-specific autocomplete class
- Migrate logic from existing Autocomplete class
- Implement and test transform methods

### Phase 3: Refactor Main Class

- Convert Autocomplete to AutocompleteManager
- Update constructor and public methods
- Integrate with new type-specific classes

### Phase 4: Update External References

- Find and update all imports of Autocomplete class
- Update any code that directly accesses Autocomplete internals
- Ensure backward compatibility where possible

### Phase 5: Testing and Validation

- Run comprehensive test suite
- Validate all autocomplete functionality works correctly
- Performance testing and optimization
- Documentation updates

## Backward Compatibility

### Public API Preservation

- Main constructor signature will remain the same
- Public methods (init, terminate, getActiveMenu) will be preserved
- Static methods will be maintained or provided as aliases

### Configuration Compatibility

- Existing configuration options will continue to work
- Settings integration will remain unchanged
- Tribute configuration will be generated in compatible format

### External Integration Points

- TextInputWidget integration will remain the same
- Event handling (tribute-active-true/false) will be preserved
- Menu positioning and styling will be unchanged
