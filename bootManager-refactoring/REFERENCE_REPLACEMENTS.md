# BootManager Reference Replacements

This document lists all references to `bootManager` that need to be updated.

## Quick Reference Table

| Old Reference | New Reference | Notes |
|--------------|---------------|-------|
| `bootManager.$content` | `cd.loader.$content` | DOM element |
| `bootManager.isBooting()` | `cd.loader.isBooting()` | State check |
| `bootManager.isPageOfType(type)` | `cd.loader.isPageOfType(type)` | Page type check |
| `bootManager.setPageType(type, val)` | `cd.loader.setPageType(type, val)` | Page type setter |
| `bootManager.isArticlePageOfTalkType()` | `cd.loader.isArticlePageOfTalkType()` | Page type check |
| `bootManager.getSiteDataPromises()` | `cd.loader.getSiteDataPromises()` | Data loading |
| `bootManager.showLoadingOverlay()` | `cd.loader.showLoadingOverlay()` | UI |
| `bootManager.hideLoadingOverlay()` | `cd.loader.hideLoadingOverlay()` | UI |
| `bootManager.isPageOverlayOn()` | `cd.loader.isPageOverlayOn()` | State check |
| `bootManager.isCurrentRevision()` | `cd.util.isCurrentRevision()` | Utility |
| `bootManager.getBootProcess()` | `controller.getBootProcess()` | Main app |
| `bootManager.tryBootTalkPage()` | `controller.bootTalkPage()` | Main app |
| `bootManager.rebootTalkPage()` | `controller.reloadPage()` | Main app |
| `bootManager.initGlobals()` | `await initGlobals()` | Import from app.js |
| `bootManager.initTimestampTools()` | `initTimestampTools()` | Import from app.js |
| `import bootManager from './loader/bootManager'` | Remove import | |

## Detailed Replacements by File

### src/loader/loader.js
```javascript
// OLD:
import bootManager from './bootManager';
bootManager.bootScript();
if (!bootManager.isBooting()) {

// NEW:
// No import needed - functions are in same file
bootScript();
if (!cd.loader.isBooting()) {
```

### src/loader/convenientDiscussions.js
```javascript
// OLD:
import bootManager from './bootManager';
/**
 * @see module:bootManager.isPageOverlayOn
 */
cd.api.isPageOverlayOn = bootManager.isPageOverlayOn.bind(bootManager);

// NEW:
// No import needed
/**
 * @see module:loader.isPageOverlayOn
 */
cd.api.isPageOverlayOn = () => cd.loader.isPageOverlayOn();
```

### src/BootProcess.js
```javascript
// OLD:
import bootManager from './loader/bootManager';
if (!bootManager.getBootProcess().isFirstRun()) {
  dtMarkupHavenElement = bootManager.$content.children('.cd-dtMarkupHaven')[0];
}
bootManager.$content.append(dtMarkupHavenElement);
bootManager.getBootProcess().addDtCommentId(el.id);
!bootManager.isPageOfType('definitelyTalk')
bootManager.hideLoadingOverlay();
await Promise.all(bootManager.getSiteDataPromises());
await bootManager.initGlobals();
bootManager.initTimestampTools();
bootManager.setPageType('talk', false);
observer.observe(bootManager.$content[0], {

// NEW:
import controller from './controller';
import { initGlobals, initTimestampTools } from './app';
import cd from './loader/cd';

if (!controller.getBootProcess().isFirstRun()) {
  dtMarkupHavenElement = cd.loader.$content.children('.cd-dtMarkupHaven')[0];
}
cd.loader.$content.append(dtMarkupHavenElement);
controller.getBootProcess().addDtCommentId(el.id);
!cd.loader.isPageOfType('definitelyTalk')
cd.loader.hideLoadingOverlay();
await Promise.all(cd.loader.getSiteDataPromises());
await initGlobals();
initTimestampTools();
cd.loader.setPageType('talk', false);
observer.observe(cd.loader.$content[0], {
```

### src/addCommentLinks.js
```javascript
// OLD:
import bootManager from './loader/bootManager';
bootManager.initGlobals();
await Promise.all(bootManager.getSiteDataPromises());
bootManager.initTimestampTools();
if ($diff?.parent().is(bootManager.$content) && $('.cd-parsed').length) return;
const $root = $diff || bootManager.$content;
if (bootManager.isPageOfType('talk')) {
if (bootManager.isPageOfType('watchlist')) {
} else if (bootManager.isPageOfType('contributions')) {
} else if (bootManager.isPageOfType('history')) {
if (bootManager.isPageOfType('diff')) {

// NEW:
import { initGlobals, initTimestampTools } from './app';
import cd from './loader/cd';

await initGlobals();
await Promise.all(cd.loader.getSiteDataPromises());
initTimestampTools();
if ($diff?.parent().is(cd.loader.$content) && $('.cd-parsed').length) return;
const $root = $diff || cd.loader.$content;
if (cd.loader.isPageOfType('talk')) {
if (cd.loader.isPageOfType('watchlist')) {
} else if (cd.loader.isPageOfType('contributions')) {
} else if (cd.loader.isPageOfType('history')) {
if (cd.loader.isPageOfType('diff')) {
```

### src/CurrentPage.js
```javascript
// OLD:
import bootManager from './loader/bootManager';
return bootManager.isPageOfType('talk') && (this.isActive() || !this.exists());
bootManager.isPageOfType('talk') &&
bootManager.isCurrentRevision() &&
return bootManager.isCurrentRevision() && this.isArchive();
bootManager.$content.children('.noarticletext, .warningbox').hide();
bootManager.$content

// NEW:
import cd from './loader/cd';
return cd.loader.isPageOfType('talk') && (this.isActive() || !this.exists());
cd.loader.isPageOfType('talk') &&
cd.util.isCurrentRevision() &&
return cd.util.isCurrentRevision() && this.isArchive();
cd.loader.$content.children('.noarticletext, .warningbox').hide();
cd.loader.$content
```

### src/commentFormManager.js
```javascript
// OLD:
import bootManager from './loader/bootManager';
if (!bootManager.isCurrentRevision()) return;

// NEW:
import cd from './loader/cd';
if (!cd.util.isCurrentRevision()) return;
```

### src/Comment.js
```javascript
// OLD:
import bootManager from './loader/bootManager';
bootManager.rebootTalkPage(type === 'deleted' || !this.id ? {} : { commentIds: [this.id] });

// NEW:
import controller from './controller';
controller.reloadPage(type === 'deleted' || !this.id ? {} : { commentIds: [this.id] });
```

### src/SettingsDialog.js
```javascript
// OLD:
import bootManager from './loader/bootManager';
if (!(await bootManager.rebootTalkPage())) {

// NEW:
import controller from './controller';
if (!(await controller.reloadPage())) {
```

### src/Thread.js
```javascript
// OLD:
import bootManager from './loader/bootManager';
if (bootManager.isCurrentRevision() && collapsedThreads) {
if (!bootManager.isCurrentRevision()) return;

// NEW:
import cd from './loader/cd';
if (cd.util.isCurrentRevision() && collapsedThreads) {
if (!cd.util.isCurrentRevision()) return;
```

### src/utils-window.js
```javascript
// OLD:
import bootManager from './loader/bootManager';
bootManager.getBootProcess().parser.getTopElementsWithText(element, true).nodes

// NEW:
import controller from './controller';
controller.getBootProcess().parser.getTopElementsWithText(element, true).nodes
```

### src/updateChecker.js
```javascript
// OLD:
import bootManager from './loader/bootManager';
if (!cd.page.isActive() || bootManager.isBooting()) return;
!bootManager.isPageOverlayOn() &&
const bootProcess = bootManager.getBootProcess();

// NEW:
import controller from './controller';
import cd from './loader/cd';
if (!cd.page.isActive() || cd.loader.isBooting()) return;
!cd.loader.isPageOverlayOn() &&
const bootProcess = controller.getBootProcess();
```

### src/toc.js
```javascript
// OLD:
import bootManager from './loader/bootManager';
bootManager.getBootProcess()
bootManager.rebootTalkPage({

// NEW:
import controller from './controller';
controller.getBootProcess()
controller.reloadPage({
```

### src/Section.js
```javascript
// OLD:
import bootManager from './loader/bootManager';
if (bootManager.isPageOverlayOn()) return;

// NEW:
import cd from './loader/cd';
if (cd.loader.isPageOverlayOn()) return;
```

## Files That Import bootManager (Need Updates)

1. ✅ src/loader/loader.js - Remove import, functions moved here
2. ✅ src/loader/convenientDiscussions.js - Remove import
3. ✅ src/BootProcess.js - Change imports
4. ✅ src/addCommentLinks.js - Change imports
5. ✅ src/CurrentPage.js - Change imports
6. ✅ src/commentFormManager.js - Change imports
7. ✅ src/Comment.js - Change imports
8. ✅ src/SettingsDialog.js - Change imports
9. ✅ src/Thread.js - Change imports
10. ✅ src/utils-window.js - Change imports
11. ✅ src/updateChecker.js - Change imports
12. ✅ src/toc.js - Change imports
13. ✅ src/Section.js - Change imports

## Search & Replace Commands

For automated replacement (use with caution, review each change):

```bash
# Replace bootManager.$content
find src -name "*.js" -exec sed -i 's/bootManager\.\$content/cd.loader.$content/g' {} +

# Replace bootManager.isBooting()
find src -name "*.js" -exec sed -i 's/bootManager\.isBooting()/cd.loader.isBooting()/g' {} +

# Replace bootManager.isPageOfType
find src -name "*.js" -exec sed -i 's/bootManager\.isPageOfType/cd.loader.isPageOfType/g' {} +

# Replace bootManager.setPageType
find src -name "*.js" -exec sed -i 's/bootManager\.setPageType/cd.loader.setPageType/g' {} +

# Replace bootManager.isArticlePageOfTalkType()
find src -name "*.js" -exec sed -i 's/bootManager\.isArticlePageOfTalkType()/cd.loader.isArticlePageOfTalkType()/g' {} +

# Replace bootManager.getSiteDataPromises()
find src -name "*.js" -exec sed -i 's/bootManager\.getSiteDataPromises()/cd.loader.getSiteDataPromises()/g' {} +

# Replace bootManager.showLoadingOverlay()
find src -name "*.js" -exec sed -i 's/bootManager\.showLoadingOverlay()/cd.loader.showLoadingOverlay()/g' {} +

# Replace bootManager.hideLoadingOverlay()
find src -name "*.js" -exec sed -i 's/bootManager\.hideLoadingOverlay()/cd.loader.hideLoadingOverlay()/g' {} +

# Replace bootManager.isPageOverlayOn()
find src -name "*.js" -exec sed -i 's/bootManager\.isPageOverlayOn()/cd.loader.isPageOverlayOn()/g' {} +

# Replace bootManager.isCurrentRevision()
find src -name "*.js" -exec sed -i 's/bootManager\.isCurrentRevision()/cd.util.isCurrentRevision()/g' {} +

# Replace bootManager.getBootProcess()
find src -name "*.js" -exec sed -i 's/bootManager\.getBootProcess()/controller.getBootProcess()/g' {} +

# Replace bootManager.rebootTalkPage
find src -name "*.js" -exec sed -i 's/bootManager\.rebootTalkPage/controller.reloadPage/g' {} +
```

**Note**: The above commands are for Unix/Linux/Mac. For Windows PowerShell, use:
```powershell
Get-ChildItem -Path src -Filter *.js -Recurse | ForEach-Object {
  (Get-Content $_.FullName) -replace 'bootManager\.\$content', 'cd.loader.$content' | Set-Content $_.FullName
}
```
