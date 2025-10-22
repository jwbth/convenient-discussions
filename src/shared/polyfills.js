/**
 * Polyfills for specific ES2022+ features using core-js.
 * Only includes the methods we actually use to minimize bundle size.
 */

// Array.prototype.at polyfill (ES2022)
import 'core-js/actual/array/at';

// Array.prototype.findLastIndex polyfill (ES2023)
import 'core-js/actual/array/find-last-index';
