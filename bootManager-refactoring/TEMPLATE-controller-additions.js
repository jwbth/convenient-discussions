/**
 * CODE TO ADD TO src/controller.js
 *
 * These methods are moved from bootManager.js
 * Add them to the controller object in controller.js
 */

// ============================================================================
// ADD THIS PROPERTY AT THE TOP OF THE FILE (after imports, before controller object)
// ============================================================================

/**
 * The current (or last available) boot process.
 * Moved from bootManager.bootProcess
 *
 * @type {import('./BootProcess').default | undefined}
 */
let bootProcess;


// ============================================================================
// ADD THESE METHODS TO THE controller OBJECT
// ============================================================================

/**
 * Create a boot process.
 * Moved from bootManager.createBootProcess()
 *
 * @param {import('./BootProcess').PassedData} [passedData]
 * @returns {Promise<import('./BootProcess').default>}
 */
async createBootProcess(passedData = {}) {
  const BootProcess = (await import('./BootProcess')).default;
  bootProcess = new BootProcess(passedData);

  return bootProcess;
},

/**
 * Get the current (or last available) boot process.
 * Moved from bootManager.getBootProcess()
 *
 * @returns {import('./BootProcess').default}
 */
getBootProcess() {
  return bootProcess;
},

/**
 * Run the current boot process and catch errors.
 * Moved from bootManager.tryBootTalkPage() and renamed to bootTalkPage()
 *
 * @param {boolean} isReload Is the page reloaded, not booted the first time.
 */
async bootTalkPage(isReload) {
  cd.loader.booting = true;

  try {
    await bootProcess.execute(isReload);
    if (isReload) {
      mw.hook('wikipage.content').fire(cd.loader.$content);
    }
  } catch (error) {
    mw.notify(cd.s('error-processpage'), { type: 'error' });
    console.error(error);
    cd.loader.hideLoadingOverlay();
  }

  cd.loader.booting = false;
},

/**
 * Reload the page via Ajax.
 * Moved from bootManager.rebootTalkPage() and renamed to reloadPage()
 *
 * @param {import('./BootProcess').PassedData} [passedData]
 * @returns {Promise<boolean>} Successful?
 * @throws {import('./shared/CdError').default|Error}
 */
async reloadPage(passedData = {}) {
  if (cd.loader.isBooting() || !cd.loader.isPageOfType('talk')) {
    return false;
  }

  passedData.isRevisionSliderRunning = Boolean(history.state?.sliderPos);

  this.emit('beforeReboot', passedData);

  if (!passedData.commentIds && !passedData.sectionId) {
    this.saveScrollPosition();
  }

  const debug = (await import('./loader/debug')).default;
  debug.init();
  debug.startTimer('total time');
  debug.startTimer('get HTML');

  const { getUserInfo } = await import('./utils-api');
  getUserInfo().catch((/** @type {unknown} */ error) => {
    console.warn(error);
  });

  cd.loader.showLoadingOverlay();
  const newBootProcess = await this.createBootProcess(passedData);

  try {
    newBootProcess.passedData.parseData = await cd.page.parse(undefined, false, true);
  } catch (error) {
    cd.loader.hideLoadingOverlay();
    if (newBootProcess.passedData.submittedCommentForm) {
      throw error;
    } else {
      mw.notify(cd.s('error-reloadpage'), { type: 'error' });
      console.warn(error);

      return false;
    }
  }

  mw.loader.load(newBootProcess.passedData.parseData.modules);
  mw.loader.load(newBootProcess.passedData.parseData.modulestyles);
  mw.config.set(newBootProcess.passedData.parseData.jsconfigvars);

  const commentManager = (await import('./commentManager')).default;
  newBootProcess.passedData.unseenComments = commentManager
    .query((comment) => comment.isSeen === false);

  bootProcess = newBootProcess;

  if (newBootProcess.passedData.submittedCommentForm?.getMode() === 'addSection') {
    newBootProcess.passedData.submittedCommentForm.teardown();
  }

  debug.stopTimer('get HTML');

  this.emit('startReboot');

  await this.bootTalkPage(true);

  this.emit('reboot');

  if (!newBootProcess.passedData.commentIds && !newBootProcess.passedData.sectionId) {
    this.restoreScrollPosition(false);
  }

  return true;
},

/**
 * Handle firings of the wikipage.content hook.
 * Moved from bootManager.handleWikipageContentHookFirings()
 *
 * @param {JQuery} $content
 */
handleWikipageContentHookFirings($content) {
  if (!$content.is('#mw-content-text')) return;

  const $root = $content.children('.mw-parser-output');
  if ($root.length && !$root.hasClass('cd-parse-started')) {
    this.reloadPage({ isPageReloadedExternally: true });
  }
},

/**
 * Remove fragment and revision parameters from the URL; remove DOM elements related to the diff.
 * Moved from bootManager.cleanUpUrlAndDom()
 */
cleanUpUrlAndDom() {
  if (bootProcess.passedData.isRevisionSliderRunning) return;

  const { searchParams } = new URL(location.href);
  this.cleanUpDom(searchParams);
  this.cleanUpUrl(searchParams);
},

/**
 * Remove diff-related DOM elements.
 * Moved from bootManager.cleanUpDom()
 *
 * @param {URLSearchParams} searchParams
 * @private
 */
async cleanUpDom(searchParams) {
  if (!searchParams.has('diff') && !searchParams.has('oldid')) return;

  cd.loader.$content
    .children('.mw-revslider-container, .mw-diff-table-prefix, .diff, .oo-ui-element-hidden, .diff-hr, .diff-currentversion-title')
    .remove();

  $('.mw-revision').remove();

  $('#firstHeading').text(cd.page.name);
  document.title = cd.mws('pagetitle', cd.page.name);

  this.updateOriginalPageTitle(document.title);
},

/**
 * Remove fragment and revision parameters from the URL.
 * Moved from bootManager.cleanUpUrl()
 *
 * @param {URLSearchParams} searchParams
 * @private
 */
cleanUpUrl(searchParams) {
  const newQuery = Object.fromEntries(searchParams.entries());

  delete newQuery.title;
  delete newQuery.curid;
  delete newQuery.action;
  delete newQuery.redlink;
  delete newQuery.section;
  delete newQuery.cdaddtopic;
  delete newQuery.dtnewcommentssince;
  delete newQuery.dtinthread;

  /** @type {'pushState' | 'replaceState' | undefined} */
  let methodName;
  if (newQuery.diff || newQuery.oldid) {
    methodName = 'pushState';

    delete newQuery.diff;
    delete newQuery.oldid;
    delete newQuery.diffmode;
    delete newQuery.type;

    $(window).on('popstate', () => {
      const { searchParams: newSearchParams } = new URL(location.href);
      if (newSearchParams.has('diff') || newSearchParams.has('oldid')) {
        location.reload();
      }
    });

    cd.loader.setPageType('diff', false);
  } else if (!bootProcess.passedData.pushState) {
    methodName = 'replaceState';
  }

  if (methodName) {
    history[methodName](history.state, '', cd.page.getUrl(newQuery));
  }
},
