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
 * @typedef {typeof import('./convenientDiscussions').convenientDiscussions} ConvenientDiscussions
 */

const convenientDiscussions = context.convenientDiscussions;

export default convenientDiscussions;
