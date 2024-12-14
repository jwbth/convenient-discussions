/**
 * Module that returns the {@link convenientDiscussions} object in the relevant context (window or
 * worker).
 *
 * @module cd
 */

/**
 * The main script object, globally available (the modules use the {@link module:cd cd} alias).
 *
 * @namespace convenientDiscussions
 * @global
 */
self.convenientDiscussions ||= {};

// Idk how do I make VS Code understand that the export of this module maps to the
// convenientDiscussions namespace. JSDoc generates the contents of that namespace correctly, but VS
// Code doesn't infer types from it. So I just manually type (again) the types of a limited number
// of properties here.

/** @import DefaultConfig from '../config/default' */
/** @import { globalProperties as GlobalProperties } from './convenientDiscussions' */

/**
 * @typedef {object} ConvenientDiscussions
 * @property {import('./pageRegistry').Page} page
 * @property {import('./userRegistry').User} user
 * @property {DefaultConfig} config
 * @property {GlobalProperties} g
 * @private
 */

/**
 * @type {ConvenientDiscussions}
 */
const convenientDiscussions = self.convenientDiscussions;

export default convenientDiscussions;
