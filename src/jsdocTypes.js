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
 * @typedef {{ [key: string]: string }} StringsByKey
 */

/**
 * @typedef {string|number} ValidKey
 */

/**
 * @typedef {object} Revision
 * @property {number} revid
 * @property {number} parentid
 * @property {object} [slots]
 * @property {object} slots.main
 * @property {string} slots.main.contentmodel
 * @property {string} slots.main.contentformat
 * @property {string} slots.main.content
 * @property {boolean} slots.main.nosuchsection
 */

/**
 * Represents the content of a single page in a `query` API response.
 *
 * @typedef {object} ApiResponseQueryPage
 * @property {string} title The title of the page.
 * @property {number} pageid The ID of the page.
 * @property {boolean} [known] Whether the page is known.
 * @property {boolean} [missing] Whether the page is missing.
 * @property {boolean} [invalid]
 * @property {object} [thumbnail] Thumbnail information for the page.
 * @property {string} thumbnail.source The URL of the thumbnail.
 * @property {number} thumbnail.width The width of the thumbnail in pixels.
 * @property {number} thumbnail.height The height of the thumbnail in pixels.
 * @property {object} [pageprops] Additional properties for the page.
 * @property {''} [pageprops.disambiguation] Indicates if the page is a disambiguation page.
 * @property {string} [description] A description of the page.
 * @property {number} ns The namespace of the page.
 * @property {string} [normalizedTitle] The normalized title of the page.
 * @property {number} [index] The index of the page in the list.
 * @property {string} contentmodel The content model of the page.
 * @property {Array<{ title: string }>} [redirects] List of redirects to the page.
 * @property {Revision[]} [revisions]
 */

/**
 * Represents a mapping between two titles in the `query` API response.
 *
 * @typedef {object} FromTo
 * @property {string} from The original title or fragment.
 * @property {string} to The target title or fragment.
 * @property {string} [tofragment] The target fragment, if applicable.
 * @property {number} index The index of the mapping.
 */

/**
 * @typedef {object} ApiResponseQueryBase
 * @property {object} [query] The content object.
 * @property {FromTo[]} [query.redirects] List of redirects in the query.
 * @property {FromTo[]} [query.normalized] List of normalized titles in the query.
 * @property {string} [curtimestamp]
 * @property {boolean} [batchcomplete] Indicates if the batch is complete.
 * @property {object} [continue] Continuation information for the query.
 */

/**
 * @typedef {object} ApiResponseQueryContentPages
 * @property {object} [query] The content object.
 * @property {ApiResponseQueryPage[]} [query.pages] List of pages in the query.
 */

/**
 * Represents the general structure of a `query` API response when `revisions` property is
 * requested.
 *
 * @template {object} T
 * @typedef {ApiResponseQueryBase & T} ApiResponseQuery
 */

/**
 * @typedef {object} ApiResponseQueryContentGlobalUserInfo
 * @property {object} [query] The content object.
 * @property {object} query.globaluserinfo The global user information object.
 * @property {string} query.globaluserinfo.home The home wiki of the global user.
 * @property {number} query.globaluserinfo.id The ID of the global user.
 * @property {string} query.globaluserinfo.registration The registration date of the global user.
 * @property {string} query.globaluserinfo.name The name of the global user.
 */

/**
 * @typedef {object} ApiResponseQueryContentAllUsers
 * @property {object} [query] The content object.
 * @property {object[]} query.allusers An array of user objects.
 * @property {number} query.allusers[].userid The user ID.
 * @property {string} query.allusers[].name The user name.
 */

/**
 * @typedef {object} ControlBase
 * @property {OO.ui.FieldLayout} field
 */

/**
 * @typedef {ControlBase & {
 *   type: 'radio';
 *   select: OO.ui.RadioSelectWidget;
 *   items: import('./RadioOptionWidget').default[];
 * }} RadioSelectControl
 */

/**
 * @typedef {ControlBase & {
 *   type: 'text';
 *   input: OO.ui.TextInputWidget;
 * }} TextInputControl
 */

/**
 * @typedef {ControlBase & {
 *   type: 'multilineText';
 *   input: OO.ui.MultilineTextInputWidget;
 * }} MultilineTextInputControl
 */

/**
 * @typedef {ControlBase & {
 *   type: 'number';
 *   input: OO.ui.NumberInputWidget;
 * }} NumberInputControl
 */

/**
 * @typedef {ControlBase & {
 *   type: 'checkbox';
 *   input: OO.ui.CheckboxInputWidget;
 * }} CheckboxInputControl
 */

/**
 * @typedef {ControlBase & {
 *   type: 'tags';
 *   validate?: Function;
 *   multiselect: OO.ui.TagMultiselectWidget;
 *   uiToData?: (value: string[]) => (string|string[])[];
 * }} TagMultiselectControl
 */

/**
 * @typedef {ControlBase & {
 *   type: 'multicheckbox';
 *   multiselect: OO.ui.CheckboxMultiselectWidget;
 * }} MulticheckboxControl
 */

/**
 * @typedef {ControlBase & {
 *   type: 'button';
 *   button: OO.ui.ButtonWidget;
 * }} ButtonControl
 */

/**
 * @typedef {ControlBase & {
 *   type: 'copyText';
 *   input?: OO.ui.TextInputWidget;
 *   button?: OO.ui.ButtonWidget;
 *   field: OO.ui.CopyTextLayout | OO.ui.ActionFieldLayout;
 * }} CopyTextControl
 */

/**
 * @typedef {RadioSelectControl | TextInputControl | MultilineTextInputControl | NumberInputControl | CheckboxInputControl | TagMultiselectControl | MulticheckboxControl | ButtonControl | CopyTextControl} Control
 */

/**
 * @template {string} [T=string]
 * @typedef {{ [key in T]: Control }} ControlsByName
 */
