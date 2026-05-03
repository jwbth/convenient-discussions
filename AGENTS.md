# AGENTS.md

**Convenient Discussions** (**CD**) is a JavaScript tool that provides an enhanced user experience for MediaWiki talk pages. It acts as a shell over the existing MediaWiki discussion system.

## Instructions

- Don't run tests unless asked.
- There is _no_ CSS class `cd-comment` because a comment often consists of multiple elements distributed across DOM. Instead, there are classes:
  - `cd-comment-part-first` for the first comment part;
  - `cd-comment-part` for any comment part.

  All comment parts have the attribute `data-cd-comment-index` specifying the comment's index.

- Don't run `npm run dev` (assume already running).
- In CLI commands, in paths, use forward slashes (/).

## Project Structure

### Core Application Files

- **app.js**: Main application entry point
- **loader/loader.js**: Entry point for the build loading the main app
- **loader/cd.js**: `cd`, core Convenient Discussions object
- **loader/convenientDiscussions.js**: Main initialization script, populating `cd`
- **BootProcess.js**: Application bootstrap logic for talk pages
- **controller.js**: Main controller

### Types

- **global.d.ts** (at most one per directory): Global type definitions
- **Per-module .d.ts files**: Type definitions for some external modules
- JSDoc type definitions inside individual module files

### Subdirectories

- **loader/**: Modules that create a scaffolding for the script to run (the object structure, some utilities) and load the main app with a specialized caching strategy
- **worker/**: Page parsing module that runs in a web worker and is accessed from updateChecker.js
- **shared/**: Classes and modules shared between the window context and web worker context

## Coding Conventions

### JavaScript & TypeScript

- Functions should be ordered in a top-down fashion (high-level first).
- Types, however, should be ordered in a bottom-up (low-level first) fashion.
- Avoid introducing variables used only once. Exceptions:
  - Variables used in template strings. Prefer them to having function calls inside template strings.
  - Cases where the use of the variable is in a loop or function while the assignment is not.

- When using a method in a callback, don't bind it using `.bind()`. Instead, turn it into an arrow function:

  ```js
  someMethod() {
    document.addEventListener('click', this.onClick);
  }

  onClick = () => {
    // ...
  };
  ```

- Use functional patterns where possible.
- Don't introduce new `null` values or return `null` in newly created functions. Use `undefined` instead, but omit assigning or returning it where the value is `undefined` anyway.
- When a function parameter is not used in the function, put an underscore in front of it.
- If ESLint reports wrong import order, unused imports, or wrong indentation, don't fix it. ESLint will apply automatic fixes.

### JSDoc

- Don't fix type errors by changing types to `any`.
- Don't use the `object` type when you know a more precise type is known. If that type is not defined, define it with `@typedef` and use it.
- Don't use tags that are already reflected in the syntax (e.g. `@static`).
- When a class method is overriding a method of the parent class, add `@override` tag to its JSDoc comment.
- Don't start every comment sentence on a new line. Use periods. If it is necessary to separate different groups of information, use paragraphs.
