/**
 * `@typedef` declarations common for many modules.
 *
 * @module commonTypedefs
 */

/**
 * Object with the same basic structure as {@link CommentSkeleton} has. (It comes from a web
 * worker so its constructor is lost.)
 *
 * @typedef {object} CommentSkeletonLike
 */
export const CommentSkeletonLike = {};

/**
 * Object with the same basic structure as {@link SectionSkeleton} has. (It comes from a web
 * worker so its constructor is lost.)
 *
 * @typedef {object} SectionSkeletonLike
 */
export const SectionSkeletonLike = {};

/**
 * Data passed from the previous page state.
 *
 * @typedef {object} PassedData
 * @property {string} [html] HTML code of the page content to replace the current content with.
 * @property {string} [commentAnchor] Comment anchor to scroll to.
 * @property {string} [sectionAnchor] Section anchor to scroll to.
 * @property {string} [pushState] Whether to replace the URL in the address bar adding the comment
 *   anchor to it if it's specified.
 * @property {boolean} [wasPageCreated] Whether the page was created while it was in the
 *   previous state. Affects navigation panel mounting and addition of certain event handlers.
 * @property {number} [scrollPosition] Page's Y offset.
 * @property {object[]} [unseenCommentAnchors] Anchors of unseen comments on this page.
 * @property {string} [justWatchedSection] Section just watched so that there could be not
 *   enough time for it to be saved to the server.
 * @property {string} [justUnwatchedSection] Section just unwatched so that there could be not
 *   enough time for it to be saved to the server.
 * @property {boolean} [wasCommentFormSubmitted] Did the user just submit a comment form.
 */
export const PassedData = {};
