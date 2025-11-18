// PART 2: Page type state (exposed on cd.loader)

/**
 * Page type flags and related state.
 */
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

// PART 3: Helper functions for page type detection

/**
 * Check whether the current page is a watchlist or recent changes page.
 *
 * @returns {boolean}
 * @private
 */
function isWatchlistPage() {
  return ['Recentchanges', 'Watchlist'].includes(
    mw.config.get('wgCanonicalSpecialPageName') || ''
  );
}

/**
 * Check whether the current page is a contributions page.
 *
 * @returns {boolean}
 * @private
 */
function isContributionsPage() {
  return mw.config.get('wgCanonicalSpecialPageName') === 'Contributions';
}

/**
 * Check whether the current page is a history page.
 *
 * @returns {boolean}
 * @private
 */
function isHistoryPage() {
  return cd.g.pageAction === 'history' && isProbablyTalkPage(cd.g.pageName, cd.g.namespaceNumber);
}
