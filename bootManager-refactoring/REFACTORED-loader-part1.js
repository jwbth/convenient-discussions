/**
 * Module that serves as an entry point for the loader.
 *
 * This file loads configuration, i18n, and determines page type, then loads the main app
 * via loadPreferablyFromDiskCache() when appropriate.
 *
 * @module loader
 */

// Import polyfills for a bunch of ES2022+ features
import '../shared/polyfills';

import './convenientDiscussions';



// PART 1: Module-level variables and state
// These replace the BootManager class instance properties

/** @type {JQuery | undefined} */
let $loadingPopup;

/** @type {JQuery.Promise<any>[] | undefined} */
let siteDataPromises;
