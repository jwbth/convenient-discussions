# BootManager Refactoring Package

## 📦 Complete Package for Eliminating bootManager.js

This package contains everything you need to safely refactor and eliminate `src/loader/bootManager.js`, distributing its code across the appropriate modules.

---

## 🚀 Quick Start

1. **Read First**: `REFACTORING_SUMMARY.md` - Overview of the entire refactoring
2. **Follow**: `MIGRATION_SCRIPT.md` - Step-by-step instructions
3. **Reference**: Other files as needed during the process

---

## 📁 Files in This Package

### Core Documentation

| File | Purpose | When to Use |
|------|---------|-------------|
| **REFACTORING_SUMMARY.md** | Overview and quick reference | Start here |
| **MIGRATION_SCRIPT.md** | Step-by-step migration guide | Follow during refactoring |
| **REFERENCE_REPLACEMENTS.md** | All bootManager.* replacements | During reference updates |
| **CODE_DISTRIBUTION_GUIDE.md** | Line-by-line code mapping | When moving code |
| **IMPORT_UPDATES.json** | Import changes (machine-readable) | For automated tools |

### Templates

| File | Purpose | When to Use |
|------|---------|-------------|
| **TEMPLATE-app.js** | Complete new app.js file | Copy to create src/app.js |
| **TEMPLATE-controller-additions.js** | Code to add to controller.js | Copy methods to controller |

### Supporting Files

| File | Purpose |
|------|---------|
| **REFACTORING_BOOTMANAGER_PLAN.md** | Original planning document |
| **REFACTORED-loader-part*.js** | Partial loader.js sections (for reference) |
| **REFACTORED_FILES.md** | Started file documentation |

---

## 🎯 What This Refactoring Does

### Before
```
src/loader/bootManager.js (1282 lines)
├─ Everything mixed together
├─ Loader logic
├─ Main app initialization
├─ Controller methods
└─ Utilities
```

### After
```
src/
├── loader/
│   ├── loader.js (+800 lines)
│   │   ├─ Loader-specific code
│   │   ├─ Page type detection
│   │   ├─ Site data loading
│   │   └─ Exposes cd.loader.*
│   │
│   ├── utils-global.js (+12 lines)
│   │   └─ isCurrentRevision() → cd.util.*
│   │
│   └── convenientDiscussions.js (updated)
│       ├─ cd.loader = {}
│       └─ cd.util = {}
│
├── app.js (NEW, ~300 lines)
│   ├─ Main app entry point
│   ├─ initGlobals()
│   ├─ initTimestampTools()
│   ├─ app() function
│   └─ addCommentLinks() function
│
└── controller.js (+200 lines)
    ├─ bootProcess property
    ├─ createBootProcess()
    ├─ getBootProcess()
    ├─ bootTalkPage()
    ├─ reloadPage()
    └─ URL/DOM cleanup methods
```

---

## 🔑 Key Concepts

### cd.loader
Shared between loader and main app:
- `$content` - DOM element
- `pageTypes` - Page type flags
- `isPageOfType()`, `setPageType()` - Page type methods
- `getSiteDataPromises()` - Data loading
- `showLoadingOverlay()`, `hideLoadingOverlay()` - UI
- `isPageOverlayOn()`, `isBooting()` - State

### cd.util
Utility functions:
- `isCurrentRevision()` - Check current revision

### controller
Main app methods:
- `getBootProcess()`, `bootTalkPage()` - Boot management
- `reloadPage()` - Page reload
- `cleanUpUrlAndDom()` - Cleanup

### app.js
Exports:
- `app()` - Main app for talk pages
- `addCommentLinks()` - For special pages
- `initGlobals()`, `initTimestampTools()` - Initialization

---

## 📋 Checklist

### Preparation
- [ ] Read REFACTORING_SUMMARY.md
- [ ] Create git branch: `git checkout -b refactor/eliminate-bootmanager`
- [ ] Backup: `git commit -am "Backup before bootManager refactoring"`

### Phase 1: Create New Files
- [ ] Create `src/app.js` from TEMPLATE-app.js
- [ ] Verify it compiles (won't be used yet)

### Phase 2: Update loader.js
- [ ] Backup: `cp src/loader/loader.js src/loader/loader-BACKUP.js`
- [ ] Move bootManager code to loader.js (use CODE_DISTRIBUTION_GUIDE.md)
- [ ] Expose functions on cd.loader
- [ ] Remove bootManager import

### Phase 3: Update controller.js
- [ ] Add bootProcess property
- [ ] Add methods from TEMPLATE-controller-additions.js
- [ ] Verify methods are in controller object

### Phase 4: Update References
- [ ] Use REFERENCE_REPLACEMENTS.md
- [ ] Update all 13 files that import bootManager
- [ ] Replace all bootManager.* references
- [ ] Update imports

### Phase 5: Update API Bindings
- [ ] Update convenientDiscussions.js API methods
- [ ] Set controller methods in app.js

### Phase 6: Delete bootManager.js
- [ ] Verify no remaining references: `grep -r "bootManager" src/`
- [ ] Delete: `rm src/loader/bootManager.js`
- [ ] Delete backups and temp files

### Phase 7: Test
- [ ] Build: `npm run build`
- [ ] Dev build: `npm run build --dev`
- [ ] Tests: `npm test`
- [ ] Manual testing (see MIGRATION_SCRIPT.md)

### Phase 8: Commit
- [ ] `git add -A`
- [ ] `git commit -m "Refactor: Eliminate bootManager"`

---

## ⚠️ Important Notes

1. **Don't skip phases** - Each builds on the previous
2. **Test after each phase** - Use the checkpoints
3. **Keep console open** - Watch for errors
4. **Commit frequently** - After each successful phase
5. **Have rollback ready** - Know how to undo if needed

---

## 🆘 Troubleshooting

### Build Errors

**"Cannot find module './loader/bootManager'"**
→ Update the import in that file (see REFERENCE_REPLACEMENTS.md)

**"cd.loader.X is not a function"**
→ Check that loader.js exposes it on cd.loader

**"controller.X is not defined"**
→ Verify TEMPLATE-controller-additions.js was properly integrated

### Runtime Errors

**Page doesn't load**
→ Check browser console, likely an import path issue

**"bootManager is not defined"**
→ Search for remaining bootManager references

**Tests fail**
→ Update test files for new paths

---

## 📊 Statistics

- **Files to create**: 1 (app.js)
- **Files to modify**: 15
- **Files to delete**: 1 (bootManager.js)
- **Lines to move**: ~1282
- **References to update**: ~50+
- **Estimated time**: 2-3 hours

---

## ✅ Success Criteria

- [ ] No `import bootManager` in src/
- [ ] No `bootManager.*` references (except comments)
- [ ] `src/loader/bootManager.js` deleted
- [ ] Build completes without errors
- [ ] All tests pass
- [ ] Talk pages load correctly
- [ ] Comment links work
- [ ] Page reload works
- [ ] Loading overlay works

---

## 🎓 Learning Resources

- **Architecture**: See REFACTORING_SUMMARY.md "Architecture After Refactoring"
- **Code Flow**: See REFACTORING_SUMMARY.md "Loading Flow After Refactoring"
- **Benefits**: See REFACTORING_SUMMARY.md "Benefits of This Refactoring"

---

## 📞 Support

If you get stuck:

1. Check the troubleshooting section in MIGRATION_SCRIPT.md
2. Review REFERENCE_REPLACEMENTS.md for correct replacements
3. Verify code placement with CODE_DISTRIBUTION_GUIDE.md
4. Use `git diff` to see what changed
5. Rollback if needed: `git reset --hard HEAD~1`

---

## 🎉 After Completion

Once done, you'll have:
- ✅ Cleaner separation of concerns
- ✅ Better tree-shaking potential
- ✅ More maintainable code
- ✅ Clearer dependencies
- ✅ Smaller, focused files

**Good luck with the refactoring!** 🚀

---

## 📝 Notes

- This refactoring was planned and documented using Option B approach
- All files are ready for manual application
- The code has been carefully analyzed and mapped
- Follow the migration script for best results
- Take breaks between phases - this is a large refactoring!

---

**Version**: 1.0
**Created**: 2025
**Status**: Ready for implementation
