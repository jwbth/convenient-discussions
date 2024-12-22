/**
 * Module that returns the {@link convenientDiscussions} object in the relevant context (window or
 * worker).
 *
 * @module cd
 */

/** @type {WindowOrWorkerGlobalScope} */
const context = self;

/**
 * The main script object, globally available (the modules use the {@link module:cd cd} alias).
 *
 * @namespace convenientDiscussions
 * @global
 */
context.convenientDiscussions ||= /** @type {ConvenientDiscussions} */ ({});

// Idk how do I make VS Code understand that the export of this module maps to the
// convenientDiscussions namespace. JSDoc generates the contents of that namespace correctly, but VS
// Code doesn't infer types from it. So I just manually type (again) the types of a limited number
// of properties here.

/**
 * @typedef {object} ApiErrorFormatHtml
 * @property {string} errorformat
 * @property {any} errorlang
 * @property {boolean} errorsuselocal
 */

/**
 * @typedef {object} ConvenientDiscussionsExtension
 * @property {import('./pageRegistry').Page} page Current page's object.
 * @property {import('./userRegistry').User} user Current user's object.
 * @property {typeof import('../config/default').default} config
 * @property {typeof import('./convenientDiscussions').globalProperties} g
 * @property {ApiErrorFormatHtml} apiErrorFormatHtml A replacement for
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions/Unicode_Property_Escapes unicode property escapes}
 * while they are not supported in major browsers. {@link https://github.com/slevithan/xregexp}
 * can be used also.
 */

/**
 * @typedef {(
 *   & typeof import('./convenientDiscussions').convenientDiscussions
 *   & ConvenientDiscussionsExtension
 * )} ConvenientDiscussions
 */

const convenientDiscussions = context.convenientDiscussions;

export default convenientDiscussions;
