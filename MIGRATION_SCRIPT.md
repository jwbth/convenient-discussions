# BootManager Migration Script

**IMPORTANT**: Back up your code before starting! Create a git branch for this refactoring.

```bash
git checkout -b refactor/eliminate-bootmanager
git add -A
git commit -m "Backup before bootManager refactoring"
```

## Prerequisites

- ✅ `cd.loader` and `cd.util` objects added to convenientDiscussions.js
- ✅ `isCurrentRevision()` moved to utils-global.js and exposed on `cd.util`

## Phase 1: Prepare New Files (No Breaking Changes Yet)

### Step 1.1: Create the new app.js file

Create `src/app.js` with the content from `REFACTORED-app.js` (will be provided).

**Checkpoint**: File should exist but won't be used yet. No build errors.

### Step 1.2: Create controller additions file

Create `src/controller-ADDITIONS.js` with content from that file (will be provided).

**Checkpoint**: File exists, not imported anywhere yet.

## Phase 2: Build the New loader.js

### Step 2.1: Create backup of current loader.js

```bash
cp src/loader/loader.js src/loader/loader-BACKUP.js
```

### Step 2.2: Replace loader.js with refactored version

Replace the entire contents of `src/loader/loader.js` with the content from `REFACTORED-loader-FULL.js`.

**What this does**:
- Moves all bootManager code into loader.js
- Exposes functions on `cd.loader`
- Sets up loading of app.js via `loadPreferablyFromDiskCache()`

**Checkpoint**: Build may have errors about bootManager still being imported. That's expected.

## Phase 3: Integrate Controller Additions

### Step 3.1: Add code to controller.js

Open `src/controller.js` and add the following at the top of the file (after existing imports):

```javascript
// Properties moved from bootManager
let bootProcess;
```

Then add all the methods from `src/controller-ADDITIONS.js` to the controller object.

### Step 3.2: Delete the temporary file

```bash
rm src/controller-ADDITIONS.js
```

**Checkpoint**: controller.js now has new methods. Build still has errors.

## Phase 4: Update All References

### Step 4.1: Automated replacements

Use the search-and-replace commands from `REFERENCE_REPLACEMENTS.md`.

**For Unix/Linux/Mac**:
```bash
# Run each command from REFERENCE_REPLACEMENTS.md one by one
# Review the changes after each command
```

**For Windows PowerShell**:
```powershell
# Use the PowerShell commands from REFERENCE_REPLACEMENTS.md
```

**OR Manual approach**: Use your IDE's find-and-replace feature:
1. Find: `bootManager\.\$content` → Replace: `cd.loader.$content`
2. Find: `bootManager\.isBooting\(\)` → Replace: `cd.loader.isBooting()`
3. (Continue with all replacements from the table)

### Step 4.2: Update imports

For each file listed in "Files That Import bootManager" section of `REFERENCE_REPLACEMENTS.md`:

1. Remove: `import bootManager from './loader/bootManager';` (or similar)
2. Add appropriate new imports as shown in the detailed replacements

**Files to update** (13 total):
- src/loader/loader.js
- src/loader/convenientDiscussions.js
- src/BootProcess.js
- src/addCommentLinks.js
- src/CurrentPage.js
- src/commentFormManager.js
- src/Comment.js
- src/SettingsDialog.js
- src/Thread.js
- src/utils-window.js
- src/updateChecker.js
- src/toc.js
- src/Section.js

**Checkpoint**: Run build. Should have no errors about bootManager.

## Phase 5: Update API Bindings

### Step 5.1: Update convenientDiscussions.js API methods

In `src/loader/convenientDiscussions.js`, find and update:

```javascript
// OLD:
cd.api.isPageOverlayOn = bootManager.isPageOverlayOn.bind(bootManager);
cd.api.reloadPage = this.rebootTalkPage.bind(this);
cd.api.rebootTalkPage = this.rebootTalkPage.bind(this);

// NEW:
cd.api.isPageOverlayOn = () => cd.loader.isPageOverlayOn();
// These will be set in app.js after controller is loaded:
// cd.api.reloadPage and cd.api.rebootTalkPage
```

### Step 5.2: Set controller API methods in app.js

In `src/app.js`, after controller is imported, add:

```javascript
cd.api.reloadPage = controller.reloadPage.bind(controller);
cd.api.rebootTalkPage = controller.reloadPage.bind(controller);
```

**Checkpoint**: API methods properly bound.

## Phase 6: Handle Special Cases

### Step 6.1: Update BootProcess imports

In `src/BootProcess.js`, ensure these imports are correct:

```javascript
import controller from './controller';
import { initGlobals, initTimestampTools } from './app';
import cd from './loader/cd';
```

### Step 6.2: Update addCommentLinks

In `src/addCommentLinks.js`, ensure:

```javascript
import { initGlobals, initTimestampTools } from './app';
import cd from './loader/cd';
```

### Step 6.3: Check for dynamic imports

Search for any dynamic imports of bootManager:

```bash
grep -r "import.*bootManager" src/
```

Update any found.

**Checkpoint**: All imports resolved.

## Phase 7: Delete bootManager.js

### Step 7.1: Verify no remaining references

```bash
grep -r "bootManager" src/ --exclude-dir=node_modules
```

Should only find:
- Comments/JSDoc
- The backup file you created

### Step 7.2: Delete the file

```bash
rm src/loader/bootManager.js
```

### Step 7.3: Delete backup files

```bash
rm src/loader/loader-BACKUP.js
rm REFACTORED-*.js  # The temporary refactored files
```

**Checkpoint**: bootManager.js is gone!

## Phase 8: Build and Test

### Step 8.1: Clean build

```bash
npm run build
```

Should complete without errors.

### Step 8.2: Development build

```bash
npm run build --dev
```

Should complete without errors.

### Step 8.3: Run tests

```bash
npm test
```

Fix any failing tests.

## Phase 9: Final Verification

### Step 9.1: Check for console errors

1. Load a talk page in development mode
2. Open browser console
3. Verify no errors about missing modules or undefined properties

### Step 9.2: Test key functionality

- [ ] Talk page loads
- [ ] Comments are parsed
- [ ] Comment forms work
- [ ] Page reload works (click refresh button)
- [ ] Loading overlay shows/hides
- [ ] Comment links work on watchlist/history/contributions
- [ ] Settings dialog works

### Step 9.3: Commit changes

```bash
git add -A
git commit -m "Refactor: Eliminate bootManager, move code to loader/app/controller"
```

## Rollback Procedure

If something goes wrong:

```bash
git reset --hard HEAD~1  # Undo the commit
# OR
git checkout main  # Go back to main branch
git branch -D refactor/eliminate-bootmanager  # Delete the branch
```

## Troubleshooting

### Error: "Cannot find module './loader/bootManager'"

**Solution**: You missed updating an import. Search for `bootManager` in that file and update the import.

### Error: "cd.loader.X is not a function"

**Solution**: The function wasn't properly exposed on `cd.loader`. Check that loader.js assigns it correctly.

### Error: "controller.X is not defined"

**Solution**: The method wasn't added to controller.js. Check controller-ADDITIONS.js was properly integrated.

### Build succeeds but page doesn't load

**Solution**: Check browser console for errors. Likely an import path issue or missing function.

### Tests fail

**Solution**: Tests may need to be updated to use new paths. Check test files for bootManager references.

## Success Criteria

✅ No references to `bootManager` in src/ (except comments)
✅ `src/loader/bootManager.js` deleted
✅ Build completes without errors
✅ Tests pass
✅ Talk pages load and function correctly
✅ Comment links work on special pages
✅ Page reload functionality works

## Estimated Time

- Preparation: 15 minutes
- File creation: 30 minutes
- Reference updates: 45 minutes
- Testing: 30 minutes
- **Total: ~2 hours**

## Notes

- Take breaks between phases
- Commit after each successful phase
- Don't skip the checkpoints
- Keep the browser console open during testing
- If stuck, refer back to REFERENCE_REPLACEMENTS.md
