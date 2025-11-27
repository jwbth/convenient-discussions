import cd from '../shared/cd'

/**
 * @typedef {object} ConvenientDiscussionsWorkerExtension
 * @property {import('./CommentWorker').default[]} comments
 * @property {import('./SectionWorker').default[]} sections
 */

/**
 * @typedef {import('../shared/cd').ConvenientDiscussionsBase & ConvenientDiscussionsWorkerExtension} ConvenientDiscussionsWorker
 */

// We change the type here, which is impossible with export...from
// eslint-disable-next-line unicorn/prefer-export-from
export default /** @type {ConvenientDiscussionsWorker} */ (cd)
