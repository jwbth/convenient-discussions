/**
 * Module that returns the {@link convenientDiscussions} object in the relevant context (window or
 * worker).
 *
 * @module cd
 */

// Window or worker context
const context = typeof window === 'undefined' ? self : window;

/**
 * The main script object, globally available (the modules use the {@link module:cd cd} alias).
 *
 * @namespace convenientDiscussions
 * @global
 */
context.convenientDiscussions ||= {};
if (typeof context.convenientDiscussions !== 'object') {
  context.convenientDiscussions = {};
}

export default context.convenientDiscussions;
