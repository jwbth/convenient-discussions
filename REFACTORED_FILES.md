# Refactored Files for BootManager Migration

This document contains the complete refactored versions of files.
Copy each section to the appropriate file.

## Instructions

1. Back up your current files
2. Copy each section below to create/replace the corresponding file
3. Follow the MIGRATION_SCRIPT.md for the order of operations
4. Use REFERENCE_REPLACEMENTS.md to update all references

---

## File 1: src/loader/loader.js (COMPLETE REPLACEMENT)

**Action**: Replace the entire contents of `src/loader/loader.js` with the code below.

**Note**: This file is too large to include in a single markdown section.
See separate files:
- `REFACTORED-loader-FULL.js` (will be created next)

---

## File 2: src/app.js (NEW FILE)

**Action**: Create this new file with the contents below.

```javascript
/**
 * Main application entry point. This file is loaded by the loader via
 * loadPreferablyFromDiskCache() and initializes the main app.
 *
 * @module app
 */

import BootProcess from './BootProcess';
import addCommentLinksModule from './addCommentLinks';
import cd from './loader/cd';
import settings from './settings';
import userRegistry from './userRegistry';
import { getUserInfo, splitIntoBatches } from './utils-api';
import { initDayjs } from './utils-window';

/**
 * Initialize global properties that are part of the main app.
 */
async function initGlobals() {
  // Already initialized
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (cd.page) return;

  const script = mw.loader.moduleRegistry['mediawiki.Title'].script;
  cd.g.phpCharToUpper =
    (
      script &&
      typeof script === 'object' &&
      'files' in script &&
      script.files['phpCharToUpper.json']
    ) ||
    {};

  const pageRegistry = (await import('./pageRegistry')).default;
  cd.page = pageRegistry.getCurrent();

  cd.user = userRegistry.getCurrent();

  // Is there {{gender:}} with at least two pipes in the selection of affected strings?
  cd.g.genderAffectsUserString = /\{\{ *gender *:[^}]+?\|[^} ]+?\|/i.test(
    Object.entries(mw.messages.get())
