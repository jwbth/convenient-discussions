# BootManager Refactoring Implementation Plan

## Status: IN PROGRESS

## Completed Steps:
1. ✅ Added `cd.loader = {}` and `cd.util = {}` to convenientDiscussions.js
2. ✅ Moved `isCurrentRevision()` to utils-global.js and exposed on `cd.util`

## Next Steps:

### Phase 1: Prepare loader.js structure
- Add imports for all bootManager dependencies
- Create module-level variables for $loadingPopup, booting, siteDataPromises
- Add helper functions: isWatchlistPage, isContributionsPage, isHistoryPage

### Phase 2: Move page type logic to loader.js
- Move pageTypes object
- Move articlePageOfTalkType
- Move isPageOfType, setPageType, isArticlePageOfTalkType
- Expose all on cd.loader

### Phase 3: Move site data loading to loader.js
- Move getSiteData, getSiteDataPromises, initFormats, getUsedDateTokens
- Expose getSiteDataPromises on cd.loader

### Phase 4: Move loading overlay to loader.js
- Move showLoadingOverlay, hideLoadingOverlay
- Move isPageOverlayOn, isBooting
- Expose all on cd.loader

### Phase 5: Move CSS initialization to loader.js
- Move initCssValues, addTalkPageCss
- Keep as private functions in loader.js

### Phase 6: Move bootScript and init functions to loader.js
- Move bootScript (not exposed)
- Refactor initOnTalkPage to load app.js via loadPreferablyFromDiskCache
- Refactor initOnCommentLinksPage to load app.js via loadPreferablyFromDiskCache

### Phase 7: Create app.js
- Export app() function for talk pages
- Export addCommentLinks() function for comment link pages
- Move initGlobals, initTimestampTools and helpers
- Assign functions to cd.loader.app and cd.loader.addCommentLinks

### Phase 8: Move controller methods
- Move bootProcess property to controller.js
- Move createBootProcess, getBootProcess, bootTalkPage to controller.js
- Move reloadPage (rename from rebootTalkPage) to controller.js
- Move handleWikipageContentHookFirings to controller.js
- Move cleanUpUrlAndDom, cleanUpDom, cleanUpUrl to controller.js

### Phase 9: Update all references
- Search and replace all bootManager.* references
- Update cd.api methods to call new locations

### Phase 10: Delete bootManager.js

## Files to Modify:
- src/loader/convenientDiscussions.js ✅
- src/loader/utils-global.js ✅
- src/loader/loader.js (major changes)
- src/app.js (create new)
- src/controller.js (add methods)
- src/BootProcess.js (update imports)
- src/addCommentLinks.js (update imports)
- All files that import bootManager

## Reference Replacements Needed:
- bootManager.$content → cd.loader.$content
- bootManager.isBooting() → cd.loader.isBooting()
- bootManager.isPageOfType() → cd.loader.isPageOfType()
- bootManager.setPageType() → cd.loader.setPageType()
- bootManager.isArticlePageOfTalkType() → cd.loader.isArticlePageOfTalkType()
- bootManager.getSiteDataPromises() → cd.loader.getSiteDataPromises()
- bootManager.showLoadingOverlay() → cd.loader.showLoadingOverlay()
- bootManager.hideLoadingOverlay() → cd.loader.hideLoadingOverlay()
- bootManager.isPageOverlayOn() → cd.loader.isPageOverlayOn()
- bootManager.isCurrentRevision() → cd.util.isCurrentRevision()
- bootManager.getBootProcess() → controller.getBootProcess()
- bootManager.tryBootTalkPage() → controller.bootTalkPage()
- bootManager.rebootTalkPage() → controller.reloadPage()
