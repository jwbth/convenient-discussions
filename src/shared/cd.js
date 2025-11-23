/**
 * Module that returns the {@link convenientDiscussions} object in the context shared between window
 * or worker).
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
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
context.convenientDiscussions ??= /** @type {ConvenientDiscussionsBase} */ ({});

const convenientDiscussionsShared = {
  /**
   * Checks whether the current execution context is a web worker.
   *
   * @returns {boolean}
   */
  isWorker() {
    return (
      'WorkerGlobalScope' in self &&
      self instanceof /** @type {any} */ (self.WorkerGlobalScope)
    );
  },
};

Object.assign(context.convenientDiscussions, convenientDiscussionsShared);

/**
 * @typedef {object} ApiErrorFormatHtml
 * @property {string} errorformat
 * @property {any} errorlang
 * @property {boolean} errorsuselocal
 */

/**
 * @template {LanguageTarget} LT
 * @typedef {object} Timestamp
 * @property {string} dateFormat Format of date in `LT` language, as used by MediaWiki.
 * @property {RegExp} regexp Regular expression for matching timestamps in `LT`. In the first case,
 *   ` +` to account for RTL and LTR marks replaced with a space. In the second case, the timestamp
 *   has no timezone at the end.
 * @property {RegExp} parseRegexp Regular expression for parsing timestamps in `LT`.
 * @property {LT extends 'content' ? RegExp : never} noTzRegexp Regular expression for matching
 *   timestamps in content with no timezone at the end.
 * @property {string[]} matchingGroups Codes of date (in `LT` language) components for the timestamp
 *   parser function.
 * @property {LT extends 'content' ? (string | undefined) : (string | number | undefined)} timezone
 *   - For `LT` = 'user': Timezone per user preferences: standard timezone name or offset in
 *   minutes. `'UTC'` is always used instead of `0`.
 *   - For `LT` = 'content`: Timezone of the wiki.
 * @property {LT extends 'content' ? RegExp : undefined} timezoneRegexp Regular expression for
 *   matching the content timezone, with the global flag.
 * @property {LT extends 'user' ? boolean : never} isSameAsLocalTimezone For `LT` = 'user': Whether
 *   the timezone is the same as the local user's timezone.
 */

/**
 * @typedef {object} TimestampTools
 * @property {Timestamp<'content'>} content
 * @property {Timestamp<'user'>} user
 */

/**
 * @typedef {object} GlobalPropertiesExtension
 * @property {string} contentLanguage Language code of the wiki's content language.
 * @property {string} userLanguage Language code of the wiki's user (interface) language.
 * @property {object} digits
 * @property {string | undefined} digits.content Regular expression matching a single digit in
 *   content language, e.g. `[0-9]`.
 * @property {string | undefined} digits.user Regular expression matching a single digit in user
 *   (interface) language, e.g. `[0-9]`.
 * @property {StringsByKey} contentLanguageMessages
 * @property {StringArraysByKey} specialPageAliases Some special page aliases in the wiki's
 *   language.
 * @property {RegExp | undefined} signatureEndingRegexp
 * @property {RegExp} userNamespacesRegexp
 * @property {RegExp} userLinkRegexp
 * @property {RegExp} userSubpageLinkRegexp
 * @property {RegExp} userTalkLinkRegexp
 * @property {RegExp} userTalkSubpageLinkRegexp
 * @property {string[]} contribsPages Contributions page local name.
 * @property {RegExp} contribsPageLinkRegexp
 * @property {string} captureUserNamePattern
 * @property {RegExp} isThumbRegexp
 * @property {string | undefined} unsignedTemplatesPattern
 * @property {RegExp[]} keepInSectionEnding
 * @property {string} userSignature
 * @property {RegExp | undefined} userSignaturePrefixRegexp
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
 * @property {ReturnType<JQueryStatic['client']['profile']>} clientProfile
 * @property {'Ctrl' | 'Cmd'} cmdModifier
 * @property {(typeof mw)['util']['isIPv6Address']} [isIPv6Address]
 * @property {ApiErrorFormatHtml} apiErrorFormatHtml
 * @property {TimestampTools} timestampTools
 */

/**
 * @typedef {typeof import('../loader/convenientDiscussions').globalProperties & GlobalPropertiesExtension} GlobalProps
 */

/**
 * @typedef {object} ConvenientDiscussionsExtension
 * @property {import('../CurrentPage').default} page Current page's object.
 * @property {import('../User').default} user Current user's object.
 * @property {(typeof import('../../config/default').default) & { _mergedWithDefault?: true }} config
 *   Script configuration. The default configuration is in {@link defaultConfig}.
 * @property {import('./CommentSkeleton').default[]} comments
 * @property {import('./SectionSkeleton').default[]} sections
 * @property {GlobalProps} g
 */

/**
 * @typedef {typeof convenientDiscussionsShared & ConvenientDiscussionsExtension} ConvenientDiscussionsBase
 */

const convenientDiscussions = context.convenientDiscussions;

export default convenientDiscussions;
