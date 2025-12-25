import cd from '../shared/cd'

/**
 * @typedef {{ [lang: string]: AnyByKey }} I18n
 */

/**
 * @typedef {object} ConvenientDiscussionsApi
 * @property {import('../commentManager').default['getById']} getCommentById
 * @property {import('../commentManager').default['getByDtId']} getCommentByDtId
 * @property {import('../sectionManager').default['getById']} getSectionById
 * @property {import('../sectionManager').default['getByHeadline']} getSectionsByHeadline
 * @property {import('../commentFormManager').default['getLastActive']} getLastActiveCommentForm
 * @property {import('../commentFormManager').default['getLastActiveAltered']} getLastActiveAlteredCommentForm
 * @property {import('../controller').default['rebootPage']} reloadPage Legacy property name
 * @property {import('../controller').default['rebootPage']} rebootPage
 * @property {import('../controller').default['getRootElement']} getRootElement
 * @property {import('../pageRegistry').default} pageRegistry
 * @property {(typeof import('../Comment').default)['generateId']} generateCommentId
 * @property {(typeof import('../Comment').default)['parseId']} parseCommentId
 * @property {import('../utils-window')['buildEditSummary']} buildEditSummary
 * @property {import('../utils-window').wrapHtml} wrapHtml
 * @property {import('../utils-window').wrapHtml} wrap
 * @property {import('../utils-window').wrapDiffBody} wrapDiffBody
 */

/**
 * @typedef {object} ConvenientDiscussionsWindowExtension
 * @property {I18n} i18n Language strings.
 * @property {import('./convenientDiscussions.loader').Loader} loader Utilities for loading the main
 *   script. Some of them continue to be used after the fact to avoid duplication.
 * @property {import('./convenientDiscussions.debug').Debug} debug Debug utilities.
 * @property {typeof import('./convenientDiscussions.utils').utils} utils Several utilities that
 *   would be avaliable before the main script is loaded.
 * @property {import('../settings').default} settings User settings.
 * @property {import('../Comment').default[]} comments List of all comments for convenience.
 * @property {import('../Section').default[]} sections List of all sections for convenience.
 * @property {import('../CommentForm').default[]} commentForms List of all comment forms for
 *   convenience.
 * @property {ConvenientDiscussionsApi} api Several API methods.
 * @property {boolean} isRunning Whether the script has launched (used to prevent two parallel
 *   scripts running).
 * @property {ReturnType<import('./startup').getStringsPromise> | undefined} getStringsPromise
 *   Promise that is set in per-wiki configs that resolves to the i18n strings, as well as some date
 *   and time formats.
 */

/**
 * @typedef {(
 *     Omit<import('../shared/cd').ConvenientDiscussionsBase, 'comments' | 'sections'>
 *   & typeof import('./convenientDiscussions').convenientDiscussionsWindow
 *   & ConvenientDiscussionsWindowExtension
 * )} ConvenientDiscussions
 */

// We don't use export...from here because we change the type here, which is impossible with
// export...from
// eslint-disable-next-line unicorn/prefer-export-from
export default /** @type {ConvenientDiscussions} */ (cd)
