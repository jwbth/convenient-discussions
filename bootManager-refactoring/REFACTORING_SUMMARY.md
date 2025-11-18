# BootManager Refactoring - Complete Package

## What You Have

This package contains everything you need to eliminate `bootManager.js` and distribute its code across the appropriate modules.

## Files in This Package

### 1. **MIGRATION_SCRIPT.md** ⭐ START HERE
Step-by-step instructions for performing the refactoring safely.
- Phases with checkpoints
- Rollback procedures
- Troubleshooting guide

### 2. **REFERENCE_REPLACEMENTS.md**
Complete list of all `bootManager.*` references and what to replace them with.
- Quick reference table
- Detailed replacements by file
- Search & replace commands (bash and PowerShell)

### 3. **IMPORT_UPDATES.json**
Structured data showing which files import bootManager and what they need instead.
- Machine-readable format
- Could be used for automated updates
- Summary of new module dependencies

### 4. **CODE_DISTRIBUTION_GUIDE.md**
Detailed mapping of which lines from bootManager.js go where.
- Line-by-line breakdown
- Conversion instructions (class methods → functions)
- Summary table

### 5. **REFACTORING_BOOTMANAGER_PLAN.md**
Original planning document with phases and status tracking.

## Quick Start

1. **Read** MIGRATION_SCRIPT.md completely
2. **Create** a git branch for this work
3. **Follow** the migration script phase by phase
4. **Use** REFERENCE_REPLACEMENTS.md for updating references
5. **Refer** to CODE_DISTRIBUTION_GUIDE.md when moving code

## What Gets Created

### New Files
- `src/app.js` - Main app entry point (~300 lines)

### Modified Files
- `src/loader/loader.js` - Gains ~800 lines from bootManager
- `src/loader/convenientDiscussions.js` - Updated API bindings
- `src/loader/utils-global.js` - Gains `isCurrentRevision()`
- `src/controller.js` - Gains ~200 lines from bootManager
- 13 other files - Import updates

### Deleted Files
- `src/loader/bootManager.js` - Eliminated! 🎉

## Architecture After Refactoring

```
src/
├── loader/
│   ├── loader.js          ← Loader logic, exposes cd.loader
│   ├── convenientDiscussions.js  ← cd object with loader/util
│   ├── utils-global.js    ← Utilities, exposed on cd.util
│   └── cd.js              ← Core cd object
│
├── app.js                 ← NEW: Main app entry, exports app()
├── controller.js          ← Gains boot/reload methods
└── BootProcess.js         ← Uses controller, app exports
```

## Key Concepts

### cd.loader
Properties and methods that need to be accessible from both loader and main app:
- `$content` - DOM element
- `pageTypes` - Page type flags
- `isPageOfType()`, `setPageType()` - Page type methods
- `getSiteDataPromises()` - Data loading
- `showLoadingOverlay()`, `hideLoadingOverlay()` - UI
- `isPageOverlayOn()`, `isBooting()` - State checks

### cd.util
Utility functions accessible everywhere:
- `isCurrentRevision()` - Check if viewing current revision
- (More utilities can be added here in future)

### controller
Main app controller methods:
- `getBootProcess()`, `bootTalkPage()` - Boot management
- `reloadPage()` - Page reload
- `cleanUpUrlAndDom()` - URL/DOM cleanup
- `handleWikipageContentHookFirings()` - Event handling

### app.js exports
- `app()` - Main app initialization for talk pages
- `addCommentLinks()` - Comment links for special pages
- `initGlobals()` - Initialize global properties
- `initTimestampTools()` - Initialize timestamp tools

## Loading Flow After Refactoring

```
1. loader.js loads
   ↓
2. Determines page type (bootScript)
   ↓
3. If talk page: initOnTalkPage()
   ├─ Loads modules
   ├─ Adds CSS
   ├─ Calls loadPreferablyFromDiskCache() for app.js
   └─ Calls cd.loader.app()
       ↓
4. app.js executes
   ├─ initGlobals()
   ├─ initTimestampTools()
   ├─ Creates BootProcess
   └─ Calls controller.bootTalkPage()
       ↓
5. BootProcess.execute()
   └─ Parses page, renders comments, etc.
```

## Benefits of This Refactoring

✅ **Separation of Concerns**
- Loader code stays in loader/
- Main app code in app.js and controller.js
- Clear boundaries between contexts

✅ **Better Tree-Shaking**
- Loader build only includes what it needs
- Main app build is separate
- Smaller bundle sizes

✅ **Clearer Dependencies**
- No circular dependencies
- Explicit import paths
- Easier to understand code flow

✅ **Maintainability**
- Smaller, focused files
- Easier to find code
- Better organization

## Estimated Effort

- **Reading/Understanding**: 30 minutes
- **Code Migration**: 1-2 hours
- **Testing**: 30-60 minutes
- **Total**: 2-3 hours

## Support

If you encounter issues:

1. Check MIGRATION_SCRIPT.md troubleshooting section
2. Verify all references updated using REFERENCE_REPLACEMENTS.md
3. Check CODE_DISTRIBUTION_GUIDE.md for correct code placement
4. Use git to compare changes and rollback if needed

## Success Criteria

- [ ] No `import bootManager` statements in src/
- [ ] No `bootManager.*` references in src/ (except comments)
- [ ] `src/loader/bootManager.js` deleted
- [ ] Build completes without errors
- [ ] All tests pass
- [ ] Talk pages load correctly
- [ ] Comment links work on special pages
- [ ] Page reload works
- [ ] Loading overlay shows/hides correctly

## Files You'll Need to Edit

**Critical** (must edit):
1. src/loader/loader.js - Major changes
2. src/app.js - Create new
3. src/controller.js - Add methods
4. src/BootProcess.js - Update imports
5. src/addCommentLinks.js - Update imports

**Important** (update imports/references):
6. src/CurrentPage.js
7. src/Comment.js
8. src/SettingsDialog.js
9. src/Thread.js
10. src/updateChecker.js
11. src/toc.js
12. src/Section.js
13. src/commentFormManager.js
14. src/utils-window.js
15. src/loader/convenientDiscussions.js

## Final Notes

- This is a large refactoring but well-planned
- Take breaks between phases
- Commit after each successful phase
- Don't skip the checkpoints in MIGRATION_SCRIPT.md
- Keep browser console open during testing
- The code will be cleaner and more maintainable after this!

Good luck! 🚀
