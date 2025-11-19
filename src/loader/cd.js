import cd from '../shared/cd';

/**
 * @typedef {object} ConvenientDiscussionsLoader
 * @property {JQuery | undefined} $content
 * @property {{ talk: boolean; definitelyTalk: boolean; diff: boolean; watchlist: boolean; contributions: boolean; history: boolean }} pageTypes
 * @property {(type: keyof ConvenientDiscussionsLoader['pageTypes']) => boolean} isPageOfType
 * @property {(type: keyof ConvenientDiscussionsLoader['pageTypes'], value: boolean) => void} setPageType
 * @property {() => boolean} isArticlePageOfTalkType
 * @property {() => JQuery.Promise<any>[]} getSiteDataPromises
 * @property {() => void} showLoadingOverlay
 * @property {() => void} hideLoadingOverlay
 * @property {() => boolean} isPageOverlayOn
 * @property {() => boolean} isBooting
 * @property {boolean} booting
 * @property {(...args: any) => void} [app]
 * @property {(...args: any) => void} [addCommentLinks]
 */

/**
 * @typedef {object} ConvenientDiscussionsUtil
 * @property {(currentRevisionOnly?: boolean) => boolean} isCurrentRevision
 */

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
 * @property {import('./bootManager').default['rebootTalkPage']} reloadPage
 * @property {import('./bootManager').default['rebootTalkPage']} rebootTalkPage
 * @property {import('../controller').default['getRootElement']} getRootElement
 */

/**
 * @typedef {object} ConvenientDiscussionsWindowExtension
 * @property {I18n} i18n
 * @property {import('../Comment').default[]} comments
 * @property {import('../Section').default[]} sections
 * @property {import('../settings').default} settings
 * @property {import('../CommentForm').default[]} commentForms
 * @property {ConvenientDiscussionsApi} api
 * @property {ConvenientDiscussionsLoader} loader
 * @property {ConvenientDiscussionsUtil} util
 * @property {boolean} isRunning
 * @property {ReturnType<import('./loader').getStringsPromise> | undefined} getStringsPromise
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
