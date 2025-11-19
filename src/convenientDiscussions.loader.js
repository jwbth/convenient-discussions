import bootManager from './loader/bootManager';

/**
 * Initialize the cd.loader namespace with bootManager methods and properties.
 * This module handles populating the cd.loader interface.
 *
 * @module convenientDiscussions.loader
 */

/**
 * Initialize cd.loader with bootManager methods and properties.
 *
 * @returns {void}
 */
function initLoader() {
  cd.loader.$content = undefined;  // Will be set by bootScript()
  cd.loader.pageTypes = bootManager.pageTypes;
  cd.loader.isPageOfType = bootManager.isPageOfType.bind(bootManager);
  cd.loader.setPageType = bootManager.setPageType.bind(bootManager);
  cd.loader.isArticlePageOfTalkType = bootManager.isArticlePageOfTalkType.bind(bootManager);
  cd.loader.getSiteDataPromises = bootManager.getSiteDataPromises.bind(bootManager);
  cd.loader.showLoadingOverlay = bootManager.showLoadingOverlay.bind(bootManager);
  cd.loader.hideLoadingOverlay = bootManager.hideLoadingOverlay.bind(bootManager);
  cd.loader.isPageOverlayOn = bootManager.isPageOverlayOn.bind(bootManager);
  cd.loader.isBooting = bootManager.isBooting.bind(bootManager);
  Object.defineProperty(cd.loader, 'booting', {
    get() {
      return bootManager.booting;
    },
    set(value) {
      bootManager.booting = value;
    },
  });
}

export { initLoader, bootManager };
