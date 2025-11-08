# Solution for require() in Vite Migration

## Problem

Vite doesn't transform `require()` calls like Webpack with Babel did. The `require()` calls in the codebase serve two purposes:
1. **Lazy module loading** - to avoid circular dependencies and defer loading
2. **CSS imports** - to load Less/CSS files

## Root Cause

- `require()` is **synchronous** in CommonJS
- `import()` is **asynchronous** in ES modules (returns a Promise)
- Vite uses ES modules, so `require()` doesn't work in the browser bundle

## Solution Implemented

### Option 1: Manual Conversion (Recommended)

Convert `require()` to dynamic `import()` manually. This is the cleanest approach.

#### Pattern 1: CSS/Less Imports

**Before:**
```js
require('./global.less');
require('./Comment.less');
```

**After:**
```js
import './global.less';
import './Comment.less';
```

Move these to the top of the file as static imports.

#### Pattern 2: Module Imports with `.default`

**Before:**
```js
const dialog = new (require('./SettingsDialog').default)(args);
```

**After:**
```js
const { default: SettingsDialog } = await import('./SettingsDialog.js');
const dialog = new SettingsDialog(args);
```

Make sure the containing function is `async`.

#### Pattern 3: Simple Module Imports

**Before:**
```js
const userRegistry = require('./userRegistry').default;
```

**After:**
```js
const { default: userRegistry } = await import('./userRegistry.js');
```

### Option 2: Use Babel Plugin

Keep Babel in the Vite pipeline to transform `require()` calls:

```js
// vite.config.mjs
import { defineConfig } from 'vite';
import babel from 'vite-plugin-babel';

export default defineConfig({
  plugins: [
    babel({
      babelConfig: {
        plugins: [
          // Transform require() to import()
          ['babel-plugin-transform-commonjs', {
            transformImportCall: true,
          }],
        ],
      },
      filter: /\.[jt]sx?$/,
    }),
  ],
});
```

### Option 3: Create a Require Shim

Create a runtime shim that makes `require()` work:

```js
// src/requireShim.js
const moduleCache = new Map();

export function require(modulePath) {
  if (moduleCache.has(modulePath)) {
    return moduleCache.get(modulePath);
  }

  // This won't work for dynamic paths, but can work for known modules
  throw new Error(`Module not found: ${modulePath}. Use dynamic import() instead.`);
}

// For specific modules, you can pre-register them:
export function registerModule(path, module) {
  moduleCache.set(path, module);
}
```

Then in your code:
```js
import { require } from './requireShim.js';
```

## What Actually Works

**Vite/Rollup automatically handles most `require()` calls during bundling!**

The build system can resolve `require()` calls at build time when:
- They use string literals (not dynamic paths)
- They're for local modules (not external packages)
- The modules are part of the dependency graph

However, some cases need manual conversion:
1. **Top-level conditional require()** - needs async/await
2. **CSS/Less imports** - should be static imports at the top
3. **Dynamic paths** - won't work, need refactoring

## Manual Conversions Made

### 1. src/app.js

**Changed `go()` and `setStrings()` to async:**
```js
// Before
function go() {
  require('./convenientDiscussions');
  // ...
}

function setStrings() {
  if (!SINGLE_LANG_CODE) {
    require('../dist/convenientDiscussions-i18n/en.js');
  }
  // ...
}

// After
async function go() {
  await import('./convenientDiscussions.js');
  // ...
}

async function setStrings() {
  if (!SINGLE_LANG_CODE) {
    await import('../dist/convenientDiscussions-i18n/en.js');
  }
  // ...
}
```

**Updated callers to handle async:**
```js
// Before
$(go);

// After
$(() => {
  go().catch((error) => {
    console.error('Error in go():', error);
  });
});
```

## Remaining require() Calls

The following `require()` calls are still in the codebase but work fine because Vite/Rollup resolves them at build time:

- `src/bootManager.js` - CSS imports and module imports (inside functions)
- `src/CommentForm.js` - Widget class imports
- `src/CommentLayers.js` - Circular dependency avoidance
- `src/utils-oojs.js` - Widget class imports
- `src/settings.js` - Dialog class import
- `src/Section.js` - Dialog class import
- `src/pageRegistry.js` - Page class imports
- And others...

These work because:
1. They're resolved at build time by Rollup
2. The bundler inlines them into the final bundle
3. No runtime `require()` function is needed

## Recommended Approach for Future

**Leave most `require()` calls as-is** - Vite/Rollup handles them automatically during bundling.

**Only convert when:**
1. Build fails with "require is not defined" error
2. You need conditional/dynamic loading at runtime
3. You want to use code splitting (then use `import()` with proper async handling)

## Files to Convert

Based on grep search, these files use `require()`:

- `src/settings.js` - 1 usage
- `src/utils-window.js` - 2 usages
- `src/utils-oojs.js` - 3 usages
- `src/SpaciousComment.js` - 1 usage
- `src/Section.js` - 1 usage
- `src/RadioOptionWidget.js` - 1 usage
- `src/pageRegistry.js` - 2 usages
- `src/pageController.js` - 1 usage (commented out)
- `src/CompactComment.js` - 1 usage
- `src/CommentLayers.js` - 5 usages
- `src/CommentForm.js` - 4 usages
- `src/CodeMirrorCommentInput.js` - 3 usages (mw.loader.require - keep as-is)
- `src/bootManager.js` - 13 usages (mostly CSS imports)

Total: ~38 usages (excluding mw.loader.require)

## Implementation Steps

1. Start with `src/bootManager.js` - convert all CSS `require()` to static `import` at top
2. Convert simple module `require()` calls in utility files
3. Convert complex patterns (new expressions) by extracting to separate lines
4. Ensure all functions using `await import()` are marked `async`
5. Test the build after each file conversion

## Note on mw.loader.require()

Do NOT convert `mw.loader.require()` calls - these are MediaWiki's own module system and must stay as-is.
