/**
 * @module cd
 */

// Worker context
const context = typeof window === 'undefined' ? self : window;

/**
 * @namespace convenientDiscussions
 */
context.convenientDiscussions = context.convenientDiscussions || {};
if (typeof context.convenientDiscussions !== 'object') {
  context.convenientDiscussions = {};
}

export default context.convenientDiscussions;
