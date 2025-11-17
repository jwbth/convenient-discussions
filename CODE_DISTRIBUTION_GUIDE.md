# Code Distribution Guide

This guide shows exactly which code from `bootManager.js` goes to which new location.

## Overview

bootManager.js (1282 lines) will be distributed to:
1. **src/loader/loader.js** - Loader-specific code (~800 lines added)
2. **src/app.js** - Main app initialization (~300 lines, new file)
3. **src/controller.js** - Controller methods (~200 lines added)

## Detailed Code Mapping

### TO: src/loader/loader.js

#### Lines 1-24: Imports
**Action**: Add these imports to loader.js (many already exist)
- Keep all existing imports in loader.js
- Add missing imports from bootManager.js lines 1-20

#### Lines 48-145: BootManager class properties → Module-level variables
**bootManager.js lines 48-145** → **loader.js module-level variables**

```javascript
// In loader.js, add after imports:
let $loadingPopup;
let siteDataPromises;
const pageTypes = {
  talk: false,
  definitelyTalk: false,
  diff: false,
  watchlist: false,
  contributions: false,
  history: false,
};
let articlePageOfTalkType = false;
let booting = false;
```

#### Lines 147-169: Page type methods
**bootManager.js lines 147-169** → **loader.js functions + cd.loader**

Convert these class methods to functions:
- `isPageOfType(type)` → function `isPageOfType(type)`
- `setPageType(type, value)` → function `setPageType(type, value)`
- `isArticlePageOfTalkType()` → function `isArticlePageOfTalkType()`

Then expose on cd.loader at end of file.

#### Lines 171-184: getSiteDataPromises() and getSiteData()
**bootManager.js lines 171-184** → **loader.js functions**

Convert to functions, expose getSiteDataPromises on cd.loader.

#### Lines 186-398: getSiteData() method body
**bootManager.js lines 186-398** → **loader.js getSiteData() function**

This is the large site data loading function. Keep as-is, just convert from method to function.

#### Lines 400-418: initFormats()
**bootManager.js lines 400-418** → **loader.js initFormats() function**

Convert to function, keep private (not exposed).

#### Lines 420-448: getUsedDateTokens()
**bootManager.js lines 420-448** → **loader.js getUsedDateTokens() function**

Convert to function, keep private.

#### Lines 450-458: bootScript()
**bootManager.js lines 450-458** → **loader.js bootScript() function**

Convert to function, keep private. This is called from go() function.

#### Lines 460-550: initOnTalkPage()
**bootManager.js lines 460-550** → **loader.js initOnTalkPage() function**

**IMPORTANT**: This needs significant refactoring:
1. Keep module loading and CSS parts
2. Replace the BootProcess execution with:
   ```javascript
   await loadPreferablyFromDiskCache({
     domain: 'commons.wikimedia.org',
     pageName: 'User:Jack_who_built_the_house/convenientDiscussions-main.js',
     ttlInDays: 1,
     ctype: 'text/javascript',
     addCacheBuster: true,
   });
   // At this point, app.js has loaded and set cd.loader.app
   if (cd.loader.app) {
     await cd.loader.app();
   }
   ```

#### Lines 552-570: initCssValues()
**bootManager.js lines 552-570** → **loader.js initCssValues() function**

Convert to function, keep private.

#### Lines 572-650: addTalkPageCss()
**bootManager.js lines 572-650** → **loader.js addTalkPageCss() function**

Convert to function, keep private.

#### Lines 1050-1070: isBooting()
**bootManager.js lines 1050-1070** → **loader.js isBooting() function**

Convert to function, expose on cd.loader.

#### Lines 1180-1220: showLoadingOverlay()
**bootManager.js lines 1180-1220** → **loader.js showLoadingOverlay() function**

Convert to function, expose on cd.loader.

#### Lines 1222-1228: hideLoadingOverlay()
**bootManager.js lines 1222-1228** → **loader.js hideLoadingOverlay() function**

Convert to function, expose on cd.loader.

#### Lines 1230-1238: isPageOverlayOn()
**bootManager.js lines 1230-1238** → **loader.js isPageOverlayOn() function**

Convert to function, expose on cd.loader.

#### Lines 1240-1282: initOnCommentLinksPage()
**bootManager.js lines 1240-1282** → **loader.js initOnCommentLinksPage() function**

**IMPORTANT**: Similar refactoring as initOnTalkPage:
1. Keep module loading
2. Replace addCommentLinks() call with:
   ```javascript
   await loadPreferablyFromDiskCache({...});
   if (cd.loader.addCommentLinks) {
     cd.loader.addCommentLinks();
   }
   ```

#### Lines 1284-1292: isCurrentRevision()
**ALREADY DONE** - Moved to utils-global.js

#### Lines 1294-1302: isWatchlistPage()
**bootManager.js lines 1294-1302** → **loader.js isWatchlistPage() function**

Convert to function, keep private (only used in bootScript).

#### Lines 1304-1310: isContributionsPage()
**bootManager.js lines 1304-1310** → **loader.js isContributionsPage() function**

Convert to function, keep private.

#### Lines 1312-1316: isHistoryPage()
**bootManager.js lines 1312-1316** → **loader.js isHistoryPage() function**

Convert to function, keep private.

#### End of loader.js: Expose on cd.loader

Add at the end of loader.js:

```javascript
// Expose loader functions on cd.loader
Object.assign(cd.loader, {
  $content: undefined,  // Will be set in bootScript
  pageTypes,
  articlePageOfTalkType: () => articlePageOfTalkType,
  isPageOfType,
  setPageType,
  isArticlePageOfTalkType,
  getSiteDataPromises,
  showLoadingOverlay,
  hideLoadingOverlay,
  isPageOverlayOn,
  isBooting,
  booting: () => booting,
  siteDataPromises: () => siteDataPromises,
});
```

---

### TO: src/app.js (NEW FILE)

#### Lines 450-458: initGlobals()
**bootManager.js lines 450-458** → **app.js initGlobals() function**

Export this function.

#### Lines 460-550: initTimestampTools()
**bootManager.js lines 460-550** → **app.js initTimestampTools() function**

Export this function.

#### Lines 552-650: Helper functions for initTimestampTools
**bootManager.js lines 552-650** → **app.js private functions**

- getTimestampMainPartPattern()
- getMatchingGroups()

Keep as private functions in app.js.

#### New: app() function

Create the main app function:

```javascript
export async function app() {
  // This is called by loader after modules are loaded
  await initGlobals();
  initTimestampTools();

  // Import and create BootProcess
  const BootProcess = (await import('./BootProcess')).default;
  const controller = (await import('./controller')).default;

  const passedData = {}; // Get from somewhere if needed
  const bootProcess = await controller.createBootProcess(passedData);
  await controller.bootTalkPage(false);
}

// Assign to cd.loader so loader can call it
cd.loader.app = app;
```

#### New: addCommentLinks() function

```javascript
export async function addCommentLinks() {
  const addCommentLinksModule = (await import('./addCommentLinks')).default;
  addCommentLinksModule();
}

cd.loader.addCommentLinks = addCommentLinks;
```

---

### TO: src/controller.js (ADDITIONS)

#### Lines 652-660: createBootProcess()
**bootManager.js lines 652-660** → **controller.js createBootProcess() method**

Add to controller object.

#### Lines 662-670: getBootProcess()
**bootManager.js lines 662-670** → **controller.js getBootProcess() method**

Add to controller object.

#### Lines 672-700: tryBootTalkPage()
**bootManager.js lines 672-700** → **controller.js bootTalkPage() method**

Rename from tryBootTalkPage to bootTalkPage. Add to controller object.

#### Lines 1072-1178: rebootTalkPage()
**bootManager.js lines 1072-1178** → **controller.js reloadPage() method**

Rename from rebootTalkPage to reloadPage. Add to controller object.

#### Lines 1180-1220: handleWikipageContentHookFirings()
**bootManager.js lines 1180-1220** → **controller.js handleWikipageContentHookFirings() method**

Add to controller object.

#### Lines 1222-1240: cleanUpUrlAndDom()
**bootManager.js lines 1222-1240** → **controller.js cleanUpUrlAndDom() method**

Add to controller object.

#### Lines 1242-1270: cleanUpDom()
**bootManager.js lines 1242-1270** → **controller.js cleanUpDom() method**

Add to controller object (private).

#### Lines 1272-1320: cleanUpUrl()
**bootManager.js lines 1272-1320** → **controller.js cleanUpUrl() method**

Add to controller object (private).

#### New property: bootProcess

Add to controller:

```javascript
let bootProcess;
```

---

## Summary Table

| bootManager.js Lines | Destination | Type | Exposed On |
|---------------------|-------------|------|------------|
| 48-145 | loader.js | Variables | cd.loader |
| 147-169 | loader.js | Functions | cd.loader |
| 171-398 | loader.js | Functions | cd.loader (getSiteDataPromises only) |
| 400-448 | loader.js | Functions | Private |
| 450-458 | loader.js | Function | Private |
| 460-550 | loader.js | Function (refactored) | Private |
| 552-650 | loader.js | Functions | Private |
| 652-700 | controller.js | Methods | controller.* |
| 702-1050 | app.js | Functions | Exported |
| 1050-1070 | loader.js | Function | cd.loader |
| 1072-1178 | controller.js | Method | controller.reloadPage |
| 1180-1220 | controller.js | Method | controller.* |
| 1222-1320 | controller.js | Methods | controller.* |
| 1240-1282 | loader.js | Function (refactored) | Private |
| 1284-1316 | loader.js | Functions | Private |

## Next Steps

1. Use this guide to manually construct the three files
2. Or wait for me to provide the complete files in the next message
3. Follow MIGRATION_SCRIPT.md for the order of operations
4. Use REFERENCE_REPLACEMENTS.md to update all references

## Tips

- Keep the original bootManager.js open for reference
- Copy code blocks carefully, preserving indentation
- Convert `this.` to direct variable/function access
- Remove class method syntax, use regular functions
- Test after each major section is moved
