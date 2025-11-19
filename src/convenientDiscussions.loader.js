import { createSvg } from './utils-window';

/**
 * Singleton for loading and managing page state related to booting and overlays.
 * This handles populating the cd.loader interface with methods and properties.
 *
 * @module convenientDiscussions.loader
 */
class Loader {
  /**
   * @type {JQuery | undefined}
   */
  $content;

  /**
   * @type {JQuery | undefined}
   * @private
   */
  $loadingPopup;

  /** @type {JQuery.Promise<any>[] | undefined} @private */
  siteDataPromises;

  /**
   * Is the page loading (the loading overlay is on).
   *
   * @type {boolean}
   */
  booting = false;

  /**
   * Main app function. Assigned from app.js.
   *
   * @type {((...args: any) => void) | undefined}
   */
  app;

  /**
   * Add comment links function. Assigned from app.js.
   *
   * @type {((...args: any) => void) | undefined}
   */
  addCommentLinks;

  /**
   * @type {{
   *   definitelyTalk: boolean;
   *   diff: boolean;
   *   talk: boolean;
   *   watchlist: boolean;
   *   contributions: boolean;
   *   history: boolean;
   * }}
   */
  pageTypes = {
    talk: false,
    definitelyTalk: false,
    diff: false,
    watchlist: false,
    contributions: false,
    history: false,
  };

  /**
   * See {@link Loader#isArticlePageOfTalkType}.
   *
   * @private
   */
  articlePageOfTalkType = false;

  /**
   * Check if the current page is of a specific type.
   *
   * @param {keyof Loader['pageTypes']} type
   * @returns {boolean}
   */
  isPageOfType(type) {
    return this.pageTypes[type];
  }

  /**
   * Change the evaluation of whether the current page is of a specific type.
   *
   * @param {keyof Loader['pageTypes']} type
   * @param {boolean} value
   */
  setPageType(type, value) {
    this.pageTypes[type] = value;
  }

  /**
   * Check if the _article_ page (the one with `wgIsArticle` being true) of the current page is a
   * talk page eligible for CD.
   *
   * @returns {boolean}
   */
  isArticlePageOfTalkType() {
    return this.articlePageOfTalkType;
  }

  /**
   * _For internal use._ Load messages needed to parse and generate timestamps as well as some site
   * data.
   *
   * @returns {JQuery.Promise<any>[]} There should be at least one promise in the array.
   */
  getSiteDataPromises() {
    // This is populated by bootManager's getSiteDataPromises() which updates cd.loader's version
    return this.siteDataPromises ??= [];
  }

  /**
   * Show the loading overlay (a logo in the corner of the page).
   */
  showLoadingOverlay() {
    this.$loadingPopup ??= $('<div>')
      .addClass('cd-loadingPopup')
      .append(
        $('<div>')
          .addClass('cd-loadingPopup-logo cd-icon')
          .append(
            $('<div>').addClass('cd-loadingPopup-logo-partBackground'),
            createSvg(55, 55, 50, 50).html(
              `<path fill-rule="evenodd" clip-rule="evenodd" d="M42.5 10H45C46.3261 10 47.5979 10.5268 48.5355 11.4645C49.4732 12.4021 50 13.6739 50 15V50L40 40H15C13.6739 40 12.4021 39.4732 11.4645 38.5355C10.5268 37.5979 10 36.3261 10 35V32.5H37.5C38.8261 32.5 40.0979 31.9732 41.0355 31.0355C41.9732 30.0979 42.5 28.8261 42.5 27.5V10ZM5 3.05176e-05H35C36.3261 3.05176e-05 37.5979 0.526815 38.5355 1.4645C39.4732 2.40218 40 3.67395 40 5.00003V25C40 26.3261 39.4732 27.5979 38.5355 28.5355C37.5979 29.4732 36.3261 30 35 30H10L0 40V5.00003C0 3.67395 0.526784 2.40218 1.46447 1.4645C2.40215 0.526815 3.67392 3.05176e-05 5 3.05176e-05ZM19.8 23C14.58 23 10.14 21.66 8.5 17H31.1C29.46 21.66 25.02 23 19.8 23ZM13.4667 7.50561C12.9734 7.17597 12.3933 7.00002 11.8 7.00002C11.0043 7.00002 10.2413 7.31609 9.6787 7.8787C9.11607 8.44131 8.8 9.20437 8.8 10C8.8 10.5934 8.97595 11.1734 9.30559 11.6667C9.6352 12.1601 10.1038 12.5446 10.6519 12.7717C11.2001 12.9987 11.8033 13.0581 12.3853 12.9424C12.9672 12.8266 13.5018 12.5409 13.9213 12.1213C14.3409 11.7018 14.6266 11.1672 14.7424 10.5853C14.8581 10.0033 14.7987 9.40015 14.5716 8.85197C14.3446 8.30379 13.9601 7.83526 13.4667 7.50561ZM27.8 7.00002C28.3933 7.00002 28.9734 7.17597 29.4667 7.50561C29.9601 7.83526 30.3446 8.30379 30.5716 8.85197C30.7987 9.40015 30.8581 10.0033 30.7424 10.5853C30.6266 11.1672 30.3409 11.7018 29.9213 12.1213C29.5018 12.5409 28.9672 12.8266 28.3853 12.9424C27.8033 13.0581 27.2001 12.9987 26.6519 12.7717C26.1038 12.5446 25.6352 12.1601 25.3056 11.6667C24.9759 11.1734 24.8 10.5934 24.8 10C24.8 9.20437 25.1161 8.44131 25.6787 7.8787C26.2413 7.31609 27.0043 7.00002 27.8 7.00002Z" />`
            )
          )
      )
      .appendTo(document.body);

    // Add the element even if the setting is off - we will need it in isPageOverlayOn()
    if (window.cdShowLoadingOverlay === false) return;

    this.$loadingPopup.show();
  }

  /**
   * Hide the loading overlay.
   */
  hideLoadingOverlay() {
    if (!this.$loadingPopup || window.cdShowLoadingOverlay === false) return;

    this.$loadingPopup.hide();
  }

  /**
   * Is there any kind of a page overlay present, like the OOUI/Codex modal overlay or CD loading
   * overlay. This runs very frequently.
   *
   * @returns {boolean}
   */
  isPageOverlayOn() {
    return this.$loadingPopup?.[0].inert || this.booting;
  }

  /**
   * Is the page loading (the loading overlay is on).
   *
   * @returns {boolean}
   */
  isBooting() {
    return this.booting;
  }
}

// Export a singleton instance
const loader = new Loader();

export default loader;
