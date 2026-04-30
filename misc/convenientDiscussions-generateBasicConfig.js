// Run me:
// mw.loader.load('https://commons.wikimedia.org/w/index.php?title=User:Jack_who_built_the_house/convenientDiscussions-generateBasicConfig.js&action=raw&ctype=text/javascript');
console.log(`Collecting data for ${mw.config.get('wgServerName')}…`)

/* eslint-disable @typescript-eslint/no-unnecessary-condition */

/**
 * @typedef {object} SiteInfoResponse
 * @property {object} query
 * @property {object[]} query.specialpagealiases
 * @property {string} query.specialpagealiases.realname
 * @property {string[]} query.specialpagealiases.aliases
 * @property {object[]} query.magicwords
 * @property {string} query.magicwords.name
 * @property {string[]} query.magicwords.aliases
 * @property {object} query.general
 * @property {string} query.general.timezone
 * @property {object[]} query.extensions
 * @property {string} query.extensions.name
 */

/**
 * @typedef {object} ApiResponseWbGetEntities
 * @property {Record<string, { id: string, sitelinks?: Record<string, { title: string }> }>} [entities]
 */

/**
 * @typedef {object} RedirectsResponse
 * @property {object} [query]
 * @property {object[]} [query.pages]
 * @property {string} query.pages.title
 * @property {object[]} [query.pages.redirects]
 * @property {string} query.pages.redirects.title
 */
// eslint-disable-next-line unicorn/prefer-top-level-await
mw.loader.using(['mediawiki.util', 'mediawiki.ForeignApi', 'mediawiki.Title']).then(async () => {
	/** @type {Partial<typeof import('../config/default').default>} */
	const config = {
		messages: {},
	}
	const api = new mw.Api()

	const messageNames = [
		'sun',
		'mon',
		'tue',
		'wed',
		'thu',
		'fri',
		'sat',

		'sunday',
		'monday',
		'tuesday',
		'wednesday',
		'thursday',
		'friday',
		'saturday',

		'jan',
		'feb',
		'mar',
		'apr',
		'may',
		'jun',
		'jul',
		'aug',
		'sep',
		'oct',
		'nov',
		'dec',

		'january',
		'february',
		'march',
		'april',
		'may_long',
		'june',
		'july',
		'august',
		'september',
		'october',
		'november',
		'december',

		'january-gen',
		'february-gen',
		'march-gen',
		'april-gen',
		'may-gen',
		'june-gen',
		'july-gen',
		'august-gen',
		'september-gen',
		'october-gen',
		'november-gen',
		'december-gen',

		'parentheses',
		'parentheses-start',
		'parentheses-end',
		'word-separator',
		'comma-separator',
		'colon-separator',
		'nextdiff',
		'timezone-utc',
		'pagetitle',
		'discussiontools-topicsubscription-button-subscribe',
		'discussiontools-topicsubscription-button-subscribe-tooltip',
		'discussiontools-topicsubscription-button-unsubscribe',
		'discussiontools-topicsubscription-button-unsubscribe-tooltip',
		'discussiontools-topicsubscription-notify-subscribed-title',
		'discussiontools-topicsubscription-notify-subscribed-body',
		'discussiontools-topicsubscription-notify-unsubscribed-title',
		'discussiontools-topicsubscription-notify-unsubscribed-body',
		'discussiontools-newtopicssubscription-button-subscribe-label',
		'discussiontools-newtopicssubscription-button-subscribe-tooltip',
		'discussiontools-newtopicssubscription-button-unsubscribe-label',
		'discussiontools-newtopicssubscription-button-unsubscribe-tooltip',
		'discussiontools-newtopicssubscription-notify-subscribed-title',
		'discussiontools-newtopicssubscription-notify-subscribed-body',
		'discussiontools-newtopicssubscription-notify-unsubscribed-title',
		'discussiontools-newtopicssubscription-notify-unsubscribed-body',
		'thanks-confirmation2',
		'checkuser-userinfocard-toggle-button-aria-label',
	]

	for (let i = 0; i < messageNames.length; i += 50) {
		const nextNames = messageNames.slice(i, i + 50)
		const messages = await api.getMessages(nextNames, {
			amlang: mw.config.get('wgContentLanguage'),
		})
		config.messages = Object.assign(config.messages || {}, messages)
	}

	const siteInfoResponse = /** @type {SiteInfoResponse} */ (
		/** @type {unknown} */ (
			await api.get({
				action: 'query',
				meta: 'siteinfo',
				siprop: ['specialpagealiases', 'general', 'extensions', 'magicwords'],
			})
		)
	)

	const specialPageAliases = siteInfoResponse.query.specialpagealiases.filter((obj) =>
		['Contributions', 'Diff', 'PermanentLink'].includes(obj.realname),
	)
	if (specialPageAliases.length) {
		config.specialPageAliases = Object.assign(
			{},
			...specialPageAliases.map((page) => ({
				[page.realname]: page.aliases.slice(0, page.aliases.indexOf(page.realname) + 1),
			})),
		)
	}

	const substAliases = siteInfoResponse.query.magicwords
		.find((obj) => obj.name === 'subst')
		?.aliases.map((alias) => alias.toLowerCase())
		.filter((alias) => alias !== 'subst:')
	if (substAliases?.length) {
		config.substAliases = substAliases
	}

	const thumbAliases = siteInfoResponse.query.magicwords
		.find((obj) => obj.name === 'img_thumbnail')
		?.aliases.map((alias) => alias.toLowerCase())
		.filter((alias) => alias !== 'thumb' && alias !== 'thumbnail')
	if (thumbAliases?.length) {
		config.thumbAliases = thumbAliases
	}

	config.timezone = siteInfoResponse.query.general.timezone

	config.useGlobalPreferences = siteInfoResponse.query.extensions.some(
		(ext) => ext.name === 'GlobalPreferences',
	)
	if (config.useGlobalPreferences) {
		// Global preferences are used by default. On WMF wikis this would just distract.
		delete config.useGlobalPreferences
	}

	config.pageWhitelist = []
	config.pageBlacklist = []
	config.userNamespacesByGender = null
	config.genderNeutralUserNamespaceAlias = null
	config.archivePaths = []
	config.pagesWithoutArchives = []
	config.defaultIndentationChar = ':'
	config.spaceAfterIndentationChars = true
	config.indentationCharMode = 'mimic'

	const signatureMessage = (
		await api.getMessages('Signature', {
			amlang: mw.config.get('wgContentLanguage'),
			amincludelocal: true,
		})
	).Signature
	const parsedSignature = await api.parse(String(signatureMessage), { disablelimitreport: true })
	if (!parsedSignature.includes('{{')) {
		const $signature = $(parsedSignature)
		const [, signatureEnding] =
			$signature
				.text()
				.trim()
				.match(/.*\$\d+(.{2,})$/) || []
		if (signatureEnding) {
			config.signatureEndingRegexp = new RegExp(mw.util.escapeRegExp(signatureEnding))
		}
	}

	/** @type {Record<string, string>} */
	const idsToProps = {
		Q5573785: 'unsigned',
		Q10684709: 'unsigned2',
		Q10825134: 'unsignedIp',
		Q13108180: 'unsignedIp2',
		Q21997241: 'paragraph',
		Q45130993: 'smallDiv',
		Q6582792: 'blockquotetop',
		Q6721200: 'blockquotebottom',
		Q6388481: 'movedFrom',
		Q11102202: 'movedTo',
		Q6537954: 'closed',
		Q12109489: 'closedEnd',
		Q11317035: 'discussionTop',
		Q6663585: 'discussionBottom',
		Q10809044: 'archiveTop',
		Q11000627: 'hiddenArchiveTop',
		Q13033802: 'hiddenArchiveBottom',
		Q6854033: 'afdTop',
		Q6671179: 'afdBottom',
		Q5841554: 'outdent',
		Q5411705: 'clear',
		Q11501008: 'reflistTalk',
		Q25733334: 'notelistTalk',
	}

	const foreignApi = new mw.ForeignApi('https://www.wikidata.org/w/api.php', {
		anonymous: true,
	})
	const dbName = mw.config.get('wgDBname')
	const wikidataData = /** @type {ApiResponseWbGetEntities} */ (
		await foreignApi.get({
			action: 'wbgetentities',
			ids: Object.keys(idsToProps),
			props: 'sitelinks',
			sitefilter: dbName,
		})
	).entities

	const titles = /** @type {Record<string, mw.Title[]>} */ ({})
	if (wikidataData) {
		Object.keys(idsToProps).forEach((id) => {
			const sitelinks = wikidataData[id].sitelinks
			if (sitelinks?.[dbName]) {
				titles[idsToProps[id]] = [
					/** @type {mw.Title} */ (mw.Title.newFromText(sitelinks[dbName].title)),
				]
			}
		})
	}

	const redirectsResp = /** @type {RedirectsResponse} */ (
		await api.get({
			action: 'query',
			titles: Object.keys(titles).map((prop) => titles[prop][0].getPrefixedText()),
			prop: 'redirects',
			rdlimit: 500,
			formatversion: 2,
		})
	)

	if (redirectsResp.query?.pages) {
		redirectsResp.query.pages.forEach((page) => {
			if (!page.redirects) return

			const prop = Object.keys(titles).find(
				(prp) => titles[prp][0].getPrefixedText() === page.title,
			)

			// Should always be the case, logically
			if (prop) {
				titles[prop].push(
					...page.redirects.map(
						(redirect) => /** @type {mw.Title} */ (mw.Title.newFromText(redirect.title)),
					),
				)
			}
		})
	}

	/**
	 * @param {mw.Title} title
	 * @returns {string}
	 */
	const getTitleText = (title) => title.getMainText()

	/**
	 * @param {string} s
	 * @returns {string}
	 */
	const toLowerCaseFirst = (s) => (s.length ? s[0].toLowerCase() + s.slice(1) : '')

	config.unsignedTemplates =
		(titles.unsigned || titles.unsigned2 || titles.unsignedIp || titles.unsignedIp2) &&
		(titles.unsigned || [])
			.concat(titles.unsigned2 || [], titles.unsignedIp || [], titles.unsignedIp2 || [])
			.map(getTitleText)

	config.pairQuoteTemplates = (titles.blockquotetop || titles.blockquotebottom) && [
		(titles.blockquotetop || []).map(getTitleText),
		(titles.blockquotebottom || []).map(getTitleText),
	]

	config.smallDivTemplates = titles.smallDiv?.map(getTitleText)
	if (config.smallDivTemplates) {
		config.smallDivTemplates[0] = toLowerCaseFirst(config.smallDivTemplates[0])
	}

	config.paragraphTemplates = titles.paragraph
		?.map(getTitleText)
		.sort((title1, title2) => Number(title2 === 'Pb') - Number(title1 === 'Pb'))
	if (config.paragraphTemplates) {
		config.paragraphTemplates[0] = toLowerCaseFirst(config.paragraphTemplates[0])
	}

	config.outdentTemplates = titles.outdent?.map(getTitleText)
	if (config.outdentTemplates) {
		config.outdentTemplates[0] = toLowerCaseFirst(config.outdentTemplates[0])
	}

	config.clearTemplates = titles.clear?.map(getTitleText)

	config.reflistTalkTemplates =
		(titles.reflistTalk || titles.notelistTalk) &&
		(titles.reflistTalk || []).concat(titles.notelistTalk || []).map(getTitleText)

	config.noSignatureClasses = []

	config.noSignatureTemplates =
		(titles.movedFrom || titles.movedTo) &&
		(titles.movedFrom || []).concat(titles.movedTo || []).map(getTitleText)

	config.commentAntipatterns = []
	config.excludeFromHeadlineClasses = []

	const closedTitles = /** @type {mw.Title[]} */ ([]).concat(
		titles.closed || [],
		titles.discussionTop || [],
		titles.archiveTop || [],
		titles.hiddenArchiveTop || [],
		titles.afdTop || [],
	)
	const closedEndTitles = /** @type {mw.Title[]} */ ([]).concat(
		titles.closedEnd || [],
		titles.discussionBottom || [],
		titles.hiddenArchiveBottom || [],
		titles.afdBottom || [],
	)

	if (closedTitles.length || closedEndTitles.length) {
		config.closedDiscussionTemplates = [
			closedTitles.map(getTitleText),
			closedEndTitles.map(getTitleText),
		]
	}

	config.closedDiscussionClasses = []

	let output = JSON.stringify(config, null, '\t')
		.replace(/\n\t"([a-zA-Z]+)":/g, '\n\t$1:')
		.replace(/("|\])\n(\t|\})/g, '$1,\n$2')
		.replace(/'/g, String.raw`\'`)
		.replace(/"/g, "'")
		.replace(
			/signatureEndingRegexp: \{\}/,
			`signatureEndingRegexp: ${String(config.signatureEndingRegexp)}`,
		)

	// When updating this code, update the code in build-configs.js as well.
	output = `/**
 * This configuration might get outdated as the script evolves, so it's best to keep it up to date
 * by checking for the generator script and documentation updates from time to time. See the
 * documentation at
 * https://commons.wikimedia.org/wiki/Special:MyLanguage/User:Jack_who_built_the_house/Convenient_Discussions#Configuring_for_a_wiki.
 */

// <nowiki>

(function () {

function unique(item, i, arr) {
	return arr.indexOf(item) === i;
}

function getStrings() {
	const requests = [mw.config.get('wgUserLanguage'), mw.config.get('wgContentLanguage')]
		.filter(unique)
		.filter(function (lang) {
			return lang !== 'en';
		})
		.map(function (lang) {
			return mw.loader.getScript('https://commons.wikimedia.org/w/index.php?title=User:Jack_who_built_the_house/convenientDiscussions-i18n/' + lang + '.js&action=raw&ctype=text/javascript');
		});

	// We assume it's OK to fall back to English if the translation is unavailable for any reason.
	return Promise.all(requests).catch(function () {});
}

window.convenientDiscussions = window.convenientDiscussions || {};
if (convenientDiscussions.config) return;


/* BEGINNING OF THE CONFIGURATION */

convenientDiscussions.config = ${output};

/* END OF THE CONFIGURATION */


if (!convenientDiscussions.isRunning) {
	convenientDiscussions.getStringsPromise = getStrings();
	mw.loader.getScript('https://commons.wikimedia.org/w/index.php?title=User:Jack_who_built_the_house/convenientDiscussions.js&action=raw&ctype=text/javascript')
		.catch(function (error) {
			console.warn('Couldn\\'t load Convenient Discussions.', error);
		});
}

}());

// </nowiki>
`

	console.log(output)
})
