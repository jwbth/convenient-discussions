# Project Structure

## Root Directory

- **src/**: Main source code directory
- **config/**: Wiki-specific configuration files
- **i18n/**: Internationalization files (JSON format)
- **data/**: Static data files (date formats, timezones, language fallbacks)
- **tests/**: Test files
- **dist/**: Build output directory
- **misc/**: Utility scripts and tools

## Source Code Organization (`src/`)

### Core Application Files

- **app.js**: Main application entry point
- **loader/loader.js**: Entry point for the module loading the main app
- **cd.js**: Core Convenient Discussions object
- **convenientDiscussions.js**: Main initialization script
- **TalkPageBootProcess.js**: Application bootstrap logic for talk pages
- **pageController.js**: Main controller

### UI Components

- **Comment.js**: Comment handling and rendering
- **CommentForm.js**: Comment editing forms
- **Section.js**: Section handling and rendering
- **Thread.js**: Thread handling and rendering
- **Button.js**: Custom button components
- **Various Widget files**: OOUI widget extensions

### Core Systems

- **Page.js**: Page object management
- **User.js**: User-related functionality
- **DtSubscriptions.js**: Topic subscription system
- **updateChecker.js**: Background update checking

### Utilities

- **utils-\*.js**: Utility functions (API, OOJS, window operations)
- **Storage\*.js**: Local storage management
- **registry files**: Object registries for comments, sections, users, pages
- **CdError.js**: Custom error class

### Specialized Features

- **navPanel.js**: Navigation panel
- **pageNav.js**: Page navigation
- **toc.js**: Table of contents enhancement
- **AutocompleteManager.js**: Mention/link autocomplete
- **CodeMirror\*.js**: Rich text editor integration

### Styling

- **\*.less files**: Component-specific styles
- **global.less**: Global styles
- **variables.less**: Style variables

### Types

- **global.d.ts** (at most one per directory): Global type definitions
- **Per-module .d.ts files**: Type definitions for some of the individual modules
- JSDoc type definitions inside individual module files

### Subdirectories

- **loader/**: Modules that create a scaffolding for the script to run (the object structure, some utilities) and load the main app with smart caching strategy
- **worker/**: Page parsing module that runs in a web worker and is accessed from updateChecker.js
- **shared/**: Classes and modules shared between the web worker context and window context
- **tribute/**: Tribute mentions library heavily modified for the apps's need

## Configuration System

### Multi-Wiki Support

- **config.json5**: Main deployment configuration
- **config/wikis/\*.js**: Wiki-specific configuration files
- **buildConfigs.js**: Configuration build script

### Internationalization

- **i18n/\*.json**: Translation files by language code
- **buildI18n.js**: i18n build script
- **data/i18nList.json**: Supported languages list

## Build System Files

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

## Development Tools

- **jsdoc/**: JSDoc documentation configuration
- **patches/**: npm package patches
- **misc/**: Development utilities and scripts
