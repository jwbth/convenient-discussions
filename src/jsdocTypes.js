/**
 * @typedef {'ltr'|'rtl'} Direction
 */

/**
 * @typedef {Element|import('./worker/domhandlerExtended').Element} ElementLike
 */

/**
 * @typedef {Node|import('./worker/domhandlerExtended').Node} NodeLike
 */

/**
 * @typedef {Text|import('./worker/domhandlerExtended').Text} TextLike
 */

/**
 * Don't use ElementLike[] - elements of different types can't be mixed.
 *
 * @typedef {Element[]|import('./worker/domhandlerExtended').Element[]} ElementLikeArray
 */

/**
 * @typedef {Text[]|import('./worker/domhandlerExtended').Text[]} TextLikeArray
 */

/**
 * @typedef {'dl'|'ul'|'ol'} ListType
 */

/**
 * @typedef {{
 *   field: OO.ui.FieldLayout;
 *   [controlType: string]: any;
 * }} Control
 */

/**
 * @typedef {{ [key: string]: Control }} ControlsByName
 */

/**
 * @typedef {{ [key: string]: string }} StringsByKey
 */

/**
 * @typedef {string|number} ValidKey
 */
