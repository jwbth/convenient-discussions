# Solution for require() in Vite Migration

## Problem

Vite doesn't transform `require()` calls like Webpack with Babel did. The `require()` calls in the codebase serve two purposes:

1. **Lazy module loading** - to avoid circular dependencies and defer loading
2. **CSS imports** - to load Less/CSS files

## Root Cause

- `require()` is **synchronous** in CommonJS
- `import()` is **asynchronous** in ES modules (returns a Promise)
- Vite uses ES modules, so `require()` doesn't exist in the browser bundle
- **Vite/Rollup does NOT automatically transform require() calls at runtime**

## Solution Implemented

Created a custom Vite plugin (`vite-plugin-require-transform.mjs`) that transforms all `require()` calls to static ES module imports at build time.

### Option 1: Manual Conversion (Recommended)

Convert `require()` to dynamic `import()` manually. This is the cleanest approach.

#### Pattern 1: CSS/Less Imports

**Before:**

```js
require('./global.less')
require('./Comment.less')
```

**After:**

```js
import './global.less'
import './Comment.less'
```

Move these to the top of the file as static imports.

#### Pattern 2: Module Imports with `.default`

**Before:**

```js
const dialog = new (require('./SettingsDialog').default)(args)
```

**After:**

```js
const { default: SettingsDialog } = await import('./SettingsDialog.js')
const dialog = new SettingsDialog(args)
```

Make sure the containing function is `async`.

#### Pattern 3: Simple Module Imports

**Before:**

```js
const userRegistry = require('./userRegistry').default
```

**After:**

```js
const { default: userRegistry } = await import('./userRegistry.js')
```

### Option 2: Use Babel Plugin

Keep Babel in the Vite pipeline to transform `require()` calls:

```js
// vite.config.mjs
import { defineConfig } from 'vite'
import babel from 'vite-plugin-babel'

export default defineConfig({
  plugins: [
    babel({
      babelConfig: {
        plugins: [
          // Transform require() to import()
          [
            'babel-plugin-transform-commonjs',
            {
              transformImportCall: true,
            },
          ],
        ],
      },
      filter: /\.[jt]sx?$/,
    }),
  ],
})
```

### Option 3: Create a Require Shim

Create a runtime shim that makes `require()` work:

```js
// src/requireShim.js
const moduleCache = new Map()

export function require(modulePath) {
  if (moduleCache.has(modulePath)) {
    return moduleCache.get(modulePath)
  }

  // This won't work for dynamic paths, but can work for known modules
  throw new Error(
    `Module not found: ${modulePath}. Use dynamic import() instead.`,
  )
}

// For specific modules, you can pre-register them:
export function registerModule(path, module) {
  moduleCache.set(path, module)
}
```

Then in your code:

```js
import { require } from './requireShim.js'
```

### How the Plugin Works

The plugin (`vite-plugin-require-transform.mjs`) runs during the Vite build process and:

1. **Scans all source files** for `require()` calls (excluding `mw.loader.require()`)
2. **Extracts module paths** from each `require()` call
3. **Generates static imports** at the top of each file
4. **Replaces `require()` calls** with references to the imported modules

### Transformation Patterns

#### Pattern 1: CSS/Less Imports

```js
// Before
require('./global.less')

// After
import './global.less'
/* CSS import hoisted */
```

#### Pattern 2: Default Imports

```js
// Before
const dialog = new (require('./SettingsDialog').default)(args)

// After
import _require_0 from './SettingsDialog.js'
const dialog = new _require_0(args)
```

#### Pattern 3: Destructuring Imports

```js
// Before
const { isVisible } = require('./utils-window')

// After
import * as _require_0 from './utils-window.js'
const { isVisible } = _require_0
```

#### Pattern 4: Whole Module Imports

```js
// Before
const settings = require('./settings').default

// After
import _require_0 from './settings.js'
const settings = _require_0
```

### Manual Changes Required

In addition to the plugin, some manual changes were needed in `src/app.js`:

**Changed `go()` and `setStrings()` to async** because they have conditional imports:

```js
// Before
function setStrings() {
  if (!SINGLE_LANG_CODE) {
    require('../dist/convenientDiscussions-i18n/en.js')
  }
}

// After
async function setStrings() {
  if (!SINGLE_LANG_CODE) {
    await import('../dist/convenientDiscussions-i18n/en.js')
  }
}
```

**Updated callers** to handle the async functions:

```js
$(() => {
  go().catch((error) => {
    console.error('Error in go():', error)
  })
})
```

## Result

✅ **Build succeeds** - All `require()` calls are transformed to static imports
✅ **Runtime works** - No "require is not defined" errors
✅ **All patterns handled** - CSS imports, default imports, destructuring, and whole module imports

## Files Modified

1. `vite-plugin-require-transform.mjs` - Custom Vite plugin for transforming require()
2. `vite.config.mjs` - Added the plugin to the build pipeline
3. `src/app.js` - Made functions async for conditional imports

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

---

# Worker Inlining Solution

The worker must be inlined to comply with Wikimedia's Content Security Policy (CSP), which doesn't allow loading separate worker files.

## Problem

When Vite inlines a worker using `?worker&inline`, it creates a separate worker file rather than truly inlining it into the bundle. This violates Wikimedia's CSP policy.

## Solution

We created a custom Vite plugin (`vite-plugin-inline-worker-string.mjs`) that:

1. Intercepts imports with the `?worker&inline-string` query parameter
2. Builds the worker as a separate minified bundle
3. Returns the worker code as a string literal that gets embedded in the main bundle
4. At runtime, creates a Blob URL from the embedded worker code string

This approach truly inlines the worker code while avoiding minification issues.

## Implementation

### Custom Vite Plugin (`vite-plugin-inline-worker-string.mjs`)

The plugin:

- Resolves imports like `'./worker/worker-gate?worker&inline-string'`
- Builds the worker separately using Vite's build API
- Returns the minified worker code as a JSON-stringified export
- Caches the result to avoid rebuilding on subsequent imports

### Usage (`src/convenientDiscussions.js`)

```javascript
import workerCode from './worker/worker-gate?worker&inline-string'

// Later in getWorker():
const blob = new Blob([workerCode], { type: 'application/javascript' })
const blobUrl = URL.createObjectURL(blob)
this.worker = new Worker(blobUrl)
```

### Type Declaration (`src/worker-gate.d.ts`)

```typescript
declare module '*?worker&inline-string' {
  const workerCode: string
  export default workerCode
}
```

This solution maintains compatibility with Wikimedia's CSP while properly inlining the worker code into the main bundle.

## Result

✅ **Worker is truly inlined** - The worker code is embedded as a string in the main bundle
✅ **CSP compliant** - No separate worker files are loaded
✅ **No minification issues** - Worker code is pre-minified before embedding
✅ **File size** - ~759KB for staging build (includes inlined worker)
