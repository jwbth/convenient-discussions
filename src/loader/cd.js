import cd from '../shared/cd';

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
 * @property {import('../shared/utils-general')['buildEditSummary']} buildEditSummary
 * @property {import('../utils-window').wrapHtml} wrapHtml
 * @property {import('../utils-window').wrapHtml} wrap
 * @property {import('../utils-window').wrapDiffBody} wrapDiffBody
 */

/**
 * @typedef {object} ConvenientDiscussionsWindowExtension
 * @property {I18n} i18n
 * @property {import('../Comment').default[]} comments
 * @property {import('../Section').default[]} sections
 * @property {import('../settings').default} settings
 * @property {import('../CommentForm').default[]} commentForms
 * @property {ConvenientDiscussionsApi} api
 * @property {typeof import('./convenientDiscussions.loader').default} loader
 * @property {typeof import('./convenientDiscussions.util').default} util
 * @property {boolean} isRunning
 * @property {ReturnType<import('./startup').getStringsPromise> | undefined} getStringsPromise
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
export default /** @type {ConvenientDiscussions} */ (cd);
