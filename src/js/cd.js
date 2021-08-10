/**
 * @module cd
 */

// Window or worker context
const context = typeof window === 'undefined' ? self : window;

/**
 * The main script object, globally available (the modules use the `cd` alias).
 *
 * @namespace convenientDiscussions
 */
context.convenientDiscussions = context.convenientDiscussions || {};
if (typeof context.convenientDiscussions !== 'object') {
  context.convenientDiscussions = {};
}

export default context.convenientDiscussions;
