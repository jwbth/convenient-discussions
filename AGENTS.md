# AGENTS.md

## Product Overview

**Convenient Discussions** is a JavaScript tool that provides an enhanced user experience for MediaWiki talk pages. It acts as a shell over the existing MediaWiki discussion system.

### Core Features

- **Enhanced Comment System**: Post and edit comments without page switches, with autocomplete for mentions, wikilinks, templates, and tags
- **Real-time Updates**: Background checking for new comments with automatic rendering of simple edits
- **Improved Navigation**: Comment timestamps in local time, highlighting new/own comments, collapsible threads
- **Subscription System**: Topic subscriptions with notifications (based on DiscussionTools)
- **Advanced Tools**: Screenshot uploads to Wikimedia Commons, comment quoting, draft saving, topic moving

### Target Environment

- **Platform**: MediaWiki wikis (primarily Wikimedia projects)
- **Browser Support**: Modern browsers only (no Internet Explorer)
- **Deployment**: User script/gadget system on various Wikipedia language editions and Wikimedia projects

### Key Constraints

- Must work within MediaWiki's existing infrastructure
- Operates as client-side JavaScript enhancement
- Maintains compatibility with existing talk page workflows
- Supports multiple languages and wiki configurations

## Technology Stack

### Core Technologies

- **JavaScript (ES2020)**: Main development language with modern syntax support
- **TypeScript**: Strict type checking via JSDoc comments and .d.ts files (no compilation)
- **Webpack 5**: Module bundling and build system
- **Babel**: JavaScript transpilation with modern feature support
- **Less**: CSS preprocessing for styling

### Key Dependencies

#### Runtime Dependencies

- **date-fns/date-fns-tz**: Date/time manipulation and timezone handling
- **htmlparser2**: HTML parsing for comment/section processing
- **lz-string**: String compression for storage optimization

#### Development Dependencies

- **ESLint**: Code linting with TypeScript, JSDoc, and Unicorn, and Stylistic plugins
- **Jest**: Testing framework
- **CodeMirror 6**: Rich text editing capabilities

### Build System

#### Common Commands

```bash
# Development server with hot reload
npm run start

# Production build
npm run build

# Development build
npm run build --dev

# Test build (with .test postfix)
npm run build --test

# Single-file build for specific wiki
npm run single -- project=w lang=en

# Run tests
npm run test

# Generate documentation
npm run docs

# Build configurations only
npm run configs

# Build i18n files only
npm run i18n
```

#### Build Modes

- **Development**: Source maps, no minification, served at localhost:9000
- **Production**: Minified, optimized, with license extraction
- **Test**: Production build with .test filename postfix
- **Single**: All-in-one file including config and i18n for specific wiki

### MediaWiki Integration

- **Target Environment**: MediaWiki user scripts/gadgets
- **Global Objects**: Relies on `mw`, `$` (jQuery), `OO` (OOJS/OOUI)
- **Module System**: Uses MediaWiki's ResourceLoader modules
- **Deployment**: Multi-wiki configuration system via config.json5

## Project Structure

### Root Directory

- **src/**: Main source code directory
- **config/**: Wiki-specific configuration files
- **i18n/**: Internationalization files (JSON format)
- **data/**: Static data files (date formats, timezones, language fallbacks)
- **tests/**: Test files
- **dist/**: Build output directory
- **misc/**: Utility scripts and tools

### Source Code Organization (`src/`)

#### Core Application Files

- **app.js**: Main application entry point
- **loader/loader.js**: Entry point for the module loading the main app
- **cd.js**: Core Convenient Discussions object
- **convenientDiscussions.js**: Main initialization script
- **TalkPageBootProcess.js**: Application bootstrap logic for talk pages
- **pageController.js**: Main controller

#### UI Components

- **Comment.js**: Comment handling and rendering
- **CommentForm.js**: Comment editing forms
- **Section.js**: Section handling and rendering
- **Thread.js**: Thread handling and rendering
- **Button.js**: Custom button components
- **Various Widget files**: OOUI widget extensions

#### Core Systems

- **Page.js**: Page object management
- **User.js**: User-related functionality
- **DtSubscriptions.js**: Topic subscription system
- **updateChecker.js**: Background update checking

#### Utilities

- **utils-\*.js**: Utility functions (API, OOJS, window operations)
- **Storage\*.js**: Local storage management
- **registry files**: Object registries for comments, sections, users, pages
- **CdError.js**: Custom error class

#### Specialized Features

- **navPanel.js**: Navigation panel
- **pageNav.js**: Page navigation
- **toc.js**: Table of contents enhancement
- **AutocompleteManager.js**: Mention/link autocomplete
- **CodeMirror\*.js**: Rich text editor integration

#### Styling

- **\*.less files**: Component-specific styles
- **global.less**: Global styles
- **variables.less**: Style variables

#### Types

- **global.d.ts** (at most one per directory): Global type definitions
- **Per-module .d.ts files**: Type definitions for some of the individual modules
- JSDoc type definitions inside individual module files

#### Subdirectories

- **loader/**: Modules that create a scaffolding for the script to run (the object structure, some utilities) and load the main app with smart caching strategy
- **worker/**: Page parsing module that runs in a web worker and is accessed from updateChecker.js
- **shared/**: Classes and modules shared between the web worker context and window context
- **tribute/**: Tribute mentions library heavily modified for the apps's need

### Configuration System

#### Multi-Wiki Support

- **config.json5**: Main deployment configuration
- **config/\*.js**: Wiki-specific configuration files
- **buildConfigs.js**: Configuration build script

#### Internationalization

- **i18n/\*.json**: Translation files by language code
- **buildI18n.js**: i18n build script
- **data/i18nList.json**: Supported languages list

### Build System Files

- **webpack.config.js**: Webpack configuration
- **babel.config.js**: Babel transpilation setup
- **eslint.config.js**: ESLint rules and configuration
- **jest.config.js**: Test configuration
- **jsconfig.json**: TypeScript/JSDoc configuration, split between:
  - **./jsconfig.json**: utility scripts
  - **src/jsconfig.json**: web source files
  - **src/worker/jsconfig.json**: worker-related source files
  - **src/shared/jsconfig.json**: source files shared between web and worker
  - **tests/jsconfig.json**: test files

  The common part is stored in **jsconfig-base.json**.

### Development Tools

- **jsdoc/**: JSDoc documentation configuration
- **patches/**: npm package patches
- **misc/**: Development utilities and scripts

## Coding Conventions

### General Rules

- Files should end with a single newline.

### JavaScript & TypeScript

- One class per file.
- Don't introduce one-time variables. E.g., instead of writing

  ```js
  const htmlToCompare = this.getElementHtmlToCompare(element);
  this.updateCompareProperties(element, htmlToCompare);
  ```

  write this:

  ```js
  this.updateCompareProperties(element, this.getElementHtmlToCompare(element));
  ```

  A variable should either be used at least twice or not exist. Exceptions:
  - Variables used in template strings. Those are OK to be used only once. Prefer them to having function calls inside template strings.
  - Cases where the use of the variable is in a loop or function while the assignment is not.
  - Cases where the assignment and the use of the variable are separated by a function with a side effect affecting that variable.
- When using a method in a callback, don't bind it using `.bind()`. Instead, turn it into an arrow function. E.g. don't do this:

  ```js
  someMethod() {
    this.boundOnClick = this.onClick.bind(this);
    document.addEventListener('click', this.boundOnClick);
  }

  onClick() {
    // ...
  }
  ```

  Instead, do this:

  ```js
  someMethod() {
    document.addEventListener('click', this.onClick);
  }

  onClick = () => {
    // ...
  };
  ```

  **Special case:** When the class is a mixin (has `Mixin` in its name), declare `onClick` inside the method itself, not via the class field initialization mechanism.

- Don't introduce new `null` values. Use `undefined` instead, but don't assign any values to variables that don't have a value yet so that they stay `undefined`. Avoid returning `null` from functions instead of `undefined`.
- Introduce class properties using class field syntax rather than inside the constructor.
- Use optional chaining (`?.`) and nullish coalescing (`??`) operators, as well as logical OR assignment (`||=`) and other assignment operators.
- Use trailing commas in objects and arrays.
- Add an empty line before `return` statements at the end of blocks (function, `if` statement, etc.) unless it's the only statement in that block.
- Use 2 spaces for indentation.
- Use single quotes for strings.
- Code comments should have one empty line before them.
- Maximum line length is 100.
- When adding inline comments, place 2 spaces before them: `expression;  // Comment`.
- Put a space between inline JSDoc comments and the following expression: `/** @type {string} */ (variable)`, not `/** @type {string} */(variable)`.
- When a function parameter is not used in the function, put an underscore in front of it.
- When a class method is overriding a method of the parent class, add `@override` tag to its  JSDoc comment.
- If ESLint reports wrong import order, unused imports, or wrong indentation, don't fix it. ESLint will apply automatic fixes.

### JSDoc

- Refrain from fixing type errors by changing types to `any`. Better leave the problem unresolved than resort to `any`.
- Don't use `Function` as a type. Indicate the function signature or use `AnyFunction` to indicate a generic function (`(...args: any) => any`).
- Don't use the `object` type when you know a more precise type is known. If that type is now defined, define it with `@typedef` and use it.
- Don't use the `@static` tag.
- Instead of defining JSDoc types in each file independently, aim to reuse types by importing them with `import('path').Type` from one file deemed the most appropriate to hold it.
- Don't put "-" between the property name and its description.
- Use `Type[]`, not `Array<Type>`.
- Prefer the index signature syntax (e.g. `{ [key: string]: any }`) to `Record` type (e.g. `Record<string, any>`).
- Add an empty line before the first JSDoc tag when it follows a description, e.g.:

  ```js
  /**
   * Get the archive prefix for the page.
   *
   * @param {boolean} [onlyExplicit=false]
   * @returns {string | undefined}
   */
  ```

- Use spaces around logical operators, e.g. write `@type {RadioSelectControl | TextInputControl}`, not `@type {RadioSelectControl|TextInputControl}`.
