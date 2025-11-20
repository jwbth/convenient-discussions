# BootManager Refactoring Implementation Plan

## Phases

### Phase 1: Prepare convenientDiscussions.loader.js structure
- Add imports for all bootManager dependencies
- Create Loader class
- Create properties $loadingPopup, booting, siteDataPromises
- Add helper methods: isWatchlistPage, isContributionsPage, isHistoryPage

### Phase 2: Move page type logic to convenientDiscussions.loader.js
- Move pageTypes object
- Move articlePageOfTalkType
- Move isPageOfType, setPageType, isArticlePageOfTalkType
- Expose all on cd.loader

### Phase 3: Move site data loading to convenientDiscussions.loader.js
- Move getSiteData, getSiteDataPromises, initFormats, getUsedDateTokens
- Expose getSiteDataPromises on cd.loader

### Phase 4: Move loading overlay to convenientDiscussions.loader.js
- Move showLoadingOverlay, hideLoadingOverlay
- Move isPageOverlayOn, isBooting
- Expose all on cd.loader

### Phase 5: Move CSS initialization to convenientDiscussions.loader.js
- Move initCssValues, addTalkPageCss
- Keep as private functions in convenientDiscussions.loader.js

### Phase 6: Move bootScript and init functions to convenientDiscussions.loader.js
- Move bootScript
- Refactor initOnTalkPage to load app.js via loadPreferablyFromDiskCache
- Refactor initOnCommentLinksPage to load app.js via loadPreferablyFromDiskCache

### Phase 7: Update uses in loader.js
- Update bootManager references to use `cd.loader`
- Get rid of the bootManager.js import

### Phase 8: Create app.js
- Export app() function for talk pages
- Export addCommentLinks() function for comment link pages
- Move initGlobals, initTimestampTools and helpers
- Assign functions to cd.loader.app and cd.loader.addCommentLinks

### Phase 9: Move controller methods
- Move bootProcess property to controller.js
- Move createBootProcess, getBootProcess, bootTalkPage to controller.js
- Move rebootPage to controller.js
- Move handleWikipageContentHookFirings to controller.js
- Move cleanUpUrlAndDom, cleanUpDom, cleanUpUrl to controller.js

### Phase 10: Update all references
- Search and replace all bootManager.* references
- Update cd.api methods to call new locations (DONE)

### Phase 11: Delete bootManager.js
