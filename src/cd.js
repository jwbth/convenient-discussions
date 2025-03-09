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
context.convenientDiscussions ||= /** @type {ConvenientDiscussions | ConvenientDiscussionsWorker} */ ({});

/**
 * @typedef {object} ApiErrorFormatHtml
 * @property {string} errorformat
 * @property {any} errorlang
 * @property {boolean} errorsuselocal
 */

/**
 * @typedef {object} GlobalPropertiesExtension
 * @property {string} contentDateFormat Format of date in content language, as used by MediaWiki.
 * @property {string} uiDateFormat Format of date in user (interface) language, as used by
 *   MediaWiki.
 * @property {string} contentDigits Regular expression matching a single digit in content language,
 *   e.g. `[0-9]`.
 * @property {string} uiDigits Regular expression matching a single digit in user (interface)
 *   language, e.g. `[0-9]`.
 * @property {{ [name: string]: string }} contentLanguageMessages
 * @property {{ [name: string]: string[] }} specialPageAliases Some special page aliases in the
 *   wiki's language.
 * @property {?string} contentTimezone Timezone of the wiki.
 * @property {?RegExp} signatureEndingRegexp
 * @property {RegExp} userNamespacesRegexp
 * @property {RegExp} userLinkRegexp
 * @property {RegExp} userSubpageLinkRegexp
 * @property {RegExp} userTalkLinkRegexp
 * @property {RegExp} userTalkSubpageLinkRegexp
 * @property {string[]} contribsPages Contributions page local name.
 * @property {RegExp} contribsPageLinkRegexp
 * @property {string} captureUserNamePattern
 * @property {RegExp} isThumbRegexp
 * @property {?string} unsignedTemplatesPattern
 * @property {RegExp[]} keepInSectionEnding
 * @property {string} userSignature
 * @property {?RegExp} userSignaturePrefixRegexp
 * @property {string} piePattern
 * @property {string} pniePattern
 * @property {RegExp} articlePathRegexp
 * @property {RegExp} startsWithScriptTitleRegexp
 * @property {RegExp} startsWithEditActionPathRegexp
 * @property {RegExp} quoteRegexp
 * @property {string} filePrefixPattern
 * @property {RegExp} colonNamespacesPrefixRegexp
 * @property {RegExp[]} badCommentBeginnings
 * @property {RegExp} pipeTrickRegexp
 * @property {boolean} isProbablyWmfSulWiki
 * @property {number} contentLineHeight
 * @property {number} contentFontSize
 * @property {number} defaultFontSize
 * @property {number} bodyScrollPaddingTop
 * @property {{ [char: string]: string | 0 }} phpCharToUpper
 * @property {boolean} genderAffectsUserString
 * @property {string} summaryPostfix
 * @property {number} summaryLengthLimit
 * @property {'Ctrl' | 'Cmd'} cmdModifier
 * @property {Function} isIPv6Address
 * @property {ApiErrorFormatHtml} apiErrorFormatHtml
 * @property {RegExp} contentTimestampRegexp Regular expression for matching timestamps in content.
 *   ` +` to account for RTL and LTR marks replaced with a space.
 * @property {RegExp} parseTimestampContentRegexp Regular expression for parsing timestamps in
 *   content.
 * @property {RegExp} contentTimestampNoTzRegexp Regular expression for matching timestamps in
 *   content with no timezone at the end.
 * @property {string[]} contentTimestampMatchingGroups Codes of date (in content language)
 *   components for the timestamp parser function.
 * @property {RegExp} timezoneRegexp Regular expression for matching timezone, with the global flag.
 * @property {RegExp} uiTimestampRegexp Regular expression for matching timestamps in the interface
 *   with no timezone at the end.
 * @property {RegExp} parseTimestampUiRegexp Regular expression for parsing timestamps in the
 *   interface.
 * @property {string[]} uiTimestampMatchingGroups Codes of date (in interface language) components
 *   for the timestamp parser function.
 * @property {?(string|number)} uiTimezone Timezone per user preferences: standard timezone name or
 *   offset in minutes. `'UTC'` is always used instead of `0`.
 * @property {boolean} areUiAndLocalTimezoneSame
 * @property {boolean|undefined} areTimestampsDefault Whether timestamps in the default format are
 *   shown to the user.
 */

/**
 * @typedef {typeof import('./convenientDiscussions').globalProperties & GlobalPropertiesExtension} GlobalProps
 */

/**
 * @typedef {object} ConvenientDiscussionsExtension
 * @property {import('./CurrentPage').default} page Current page's object.
 * @property {import('./userRegistry').User} user Current user's object.
 * @property {typeof import('../config/default').default} config
 * @property {GlobalProps} g
 * @property {import('./CommentSkeleton').default[]} comments
 * @property {import('./SectionSkeleton').default[]} sections
 */

/**
 * @typedef {(
 *   & typeof import('./convenientDiscussions').convenientDiscussions
 *   & ConvenientDiscussionsExtension
 * )} ConvenientDiscussionsBase
 */

/**
 * @typedef {object} ConvenientDiscussionsWindowExtension
 * @property {import('./Comment').default[]} comments
 * @property {import('./Section').default[]} sections
 * @property {import('./settings').default} settings
 */

/**
 * @typedef {object} ConvenientDiscussionsWorkerExtension
 * @property {import('./worker/CommentWorker').default[]} comments
 * @property {import('./worker/SectionWorker').default[]} sections
 */

/**
 * @typedef {ConvenientDiscussionsBase & ConvenientDiscussionsWindowExtension} ConvenientDiscussions
 */

/**
 * @typedef {ConvenientDiscussionsBase & ConvenientDiscussionsWorkerExtension} ConvenientDiscussionsWorker
 */

const convenientDiscussions = context.convenientDiscussions;

export default convenientDiscussions;
