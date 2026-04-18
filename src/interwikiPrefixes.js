/*
  How to update prefixData:

  1. Run this in the console of any WMF wiki:
      ```
      window.getInterwikiData_postprocess = (iwData) => ([
        ...iwData.matchingLangPrefixes,
        ...iwData.matchingChapterPrefixes.map((prefix) => 'wm' + prefix),
          ...Object.values(iwData.urlToPrefixes).flat(),
        ].filter(item => !['chapter', '_default'].includes(item)))
      mw.loader.getScript('https://en.wikipedia.org/w/index.php?title=User:Jack_who_built_the_house/getInterwikiData.js&action=raw&ctype=text/javascript')
      ```
  2. Go to https://quarry.wmcloud.org/query/104471
  3. Fork
  4. Replace the list of prefixes in `WHERE i.iwl_prefix NOT IN ( ... )`
  5. Download data
  6. Open "JSON" *in new tab*
  7. Copypaste into console
  8. Prepend with `const quarryResults = `
  9. Run
      ```
      const prefixes = quarryResults
        .rows
        // - 'google' and 'scholar' scramble spaces
        // - 'toollabs' is outdated
        // - 'discord' and 'gitlab' will better do without converting
        .filter(row => (
          row[1] >= 100 &&
          !['toollabs', 'google', 'scholar', 'discord', 'gitlab'].includes(row[0])
        )
        .map(row => row[0])
      const iwMap = (await new mw.ForeignApi('https://de.wiktionary.org/w/api.php').get({
        meta: 'siteinfo',
        siprop: 'interwikimap',
      formatversion: 2,
      })).query.interwikimap
      console.log(
        JSON.stringify(
          prefixes
            .map(prefix => ({
              prefix,
              url: iwMap.find(entry => entry.prefix === prefix).url
            }))
            // Unique
            .filter((elem, i, arr) => arr.findIndex(el => el.url === elem.url) === i)
            .map(entry => [entry.prefix, entry.url])
        )
      )
      ```
 */

/** @type {[string, string][]} */
const prefixData = [
	['xtools', 'https://xtools.wmcloud.org/$1'],
	['toollabs', 'https://iw.toolforge.org/$1'],
	['phab', 'https://phabricator.wikimedia.org/$1'],
	['tools', 'https://toolserver.org/$1'],
	['mail', 'https://lists.wikimedia.org/postorius/lists/$1.lists.wikimedia.org/'],
	['foundationsite', 'https://wikimediafoundation.org/$1'],
	['scores', 'https://imslp.org/wiki/$1'],
	['iarchive', 'https://archive.org/details/$1'],
	['iso639-3', 'https://iso639-3.sil.org/code/$1'],
	['wikitech', 'https://wikitech.wikimedia.org/wiki/$1'],
	['doi', 'https://doi.org/$1'],
	['creativecommons', 'https://creativecommons.org/licenses/$1'],
	['bugzilla', 'https://bugzilla.wikimedia.org/show_bug.cgi?id=$1'],
	['wikiconference', 'https://wikiconference.org/wiki/$1'],
	['ccorg', 'https://creativecommons.org/$1'],
	['freedomdefined', 'https://freedomdefined.org/$1'],
	['ticket', 'https://ticket.wikimedia.org/otrs/index.pl?Action=AgentTicketZoom&TicketNumber=$1'],
	['gerrit', 'https://gerrit.wikimedia.org/r/$1'],
	['diffblog', 'https://diff.wikimedia.org/$1'],
	['wikia', 'https://community.fandom.com/wiki/w:c:$1'],
	['wikiedudashboard', 'https://dashboard.wikiedu.org/$1'],
	['mailarchive', 'https://lists.wikimedia.org/pipermail/$1'],
	['wmuk', 'https://wikimedia.org.uk/wiki/$1'],
	['luxo', 'https://guc.toolforge.org/?user=$1'],
	['oeis', 'https://oeis.org/$1'],
	['choralwiki', 'https://www.cpdl.org/wiki/index.php/$1'],
	['meatball', 'https://meatballwiki.org/wiki/$1'],
	['hdl', 'https://hdl.handle.net/$1'],
	['uncyclopedia', 'https://en.uncyclopedia.co/wiki/$1'],
	['quarry', 'https://quarry.wmcloud.org/$1'],
	['listarchive', 'https://lists.wikimedia.org/hyperkitty/$1'],
	['wmfdashboard', 'https://outreachdashboard.wmflabs.org/$1'],
	['wmdc', 'https://wikimediadc.org/wiki/$1'],
	['wmdoc', 'https://doc.wikimedia.org/$1'],
	['translatewiki', 'https://translatewiki.net/wiki/$1'],
	['mediazilla', 'https://bugzilla.wikimedia.org/$1'],
	['git', 'https://gerrit.wikimedia.org/g/$1'],
	['imdbname', 'https://www.imdb.com/name/nm$1/'],
	['imdbtitle', 'https://www.imdb.com/title/tt$1/'],
	['osmwiki', 'https://wiki.openstreetmap.org/wiki/$1'],
	['stats', 'https://stats.wikimedia.org/$1'],
	['arxiv', 'https://arxiv.org/abs/$1'],
	['mwod', 'https://www.merriam-webster.com/dictionary/$1'],
	['wmau', 'https://wikimedia.org.au/wiki/$1'],
	['otrs', 'https://ticket.wikimedia.org/otrs/index.pl?Action=AgentTicketZoom&TicketID=$1'],
	['wmin', 'https://meta.wikimedia.org/wiki/Wikimedia_India'],
	['wikifur', 'https://en.wikifur.com/wiki/$1'],
	['wookieepedia', 'https://starwars.fandom.com/wiki/$1'],
	['citizendium', 'https://en.citizendium.org/wiki/$1'],
	['wikicities', 'https://community.fandom.com/wiki/w:$1'],
	['pmid', 'https://www.ncbi.nlm.nih.gov/pubmed/$1?dopt=Abstract'],
	['rfc', 'https://datatracker.ietf.org/doc/html/rfc$1'],
	['petscan', 'https://petscan.wmflabs.org/?psid=$1'],
	['gutenberg', 'https://www.gutenberg.org/ebooks/$1'],
	['strategywiki', 'https://strategywiki.org/wiki/$1'],
	['orthodoxwiki', 'https://orthodoxwiki.org/$1'],
	['irc', 'irc://irc.libera.chat/$1'],
	['infosphere', 'https://theinfosphere.org/$1'],
	['wikiindex', 'https://wikiindex.org/$1'],
	['wikiwikiweb', 'https://wiki.c2.com/?$1'],
	['memoryalpha', 'https://memory-alpha.fandom.com/wiki/$1'],
	['dcdatabase', 'https://dc.fandom.com/$1'],
	['etherpad', 'https://etherpad.wikimedia.org/$1'],
	['appropedia', 'https://www.appropedia.org/$1'],
	['hrwiki', 'http://www.hrwiki.org/index.php/$1'],
	['sep11', 'https://meta.wikimedia.org/wiki/Sep11wiki'],
	['localwiki', 'https://localwiki.org/$1'],
	['bulba', 'https://bulbapedia.bulbagarden.net/wiki/$1'],
	['marveldatabase', 'https://marvel.fandom.com/wiki/$1'],
	['bibcode', 'https://ui.adsabs.harvard.edu/abs/$1/abstract'],
	['ethnologue', 'https://www.ethnologue.com/language/$1'],
	['mdwiki', 'https://mdwiki.org/wiki/$1'],
	['wmdeblog', 'https://blog.wikimedia.de/$1'],
	['wikihow', 'https://www.wikihow.com/$1'],
	['xkcd', 'https://xkcd.com/$1'],
	['issn', 'https://www.worldcat.org/issn/$1'],
]

const PLACEHOLDER = '$1'

/**
 * Escape a string for use as a literal in a RegExp.
 *
 * @param {string} s
 * @returns {string}
 */
function escapeRegex(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}

/**
 * Decode a URI component, returning the original string if it contains a malformed
 * percent sequence.
 *
 * @param {string} s
 * @returns {string}
 */
function safeDecode(s) {
	try {
		return decodeURIComponent(s)
	} catch {
		return s
	}
}

/**
 * Parse a query string into a map of decoded-key → raw-value pairs. Values are kept
 * raw (encoded) so the caller can decode them selectively.
 *
 * @param {string} query Query string without the leading `?`.
 * @returns {{ [key: string]: string }}
 */
function parseQuery(query) {
	/** @type {{ [key: string]: string }} */
	const params = {}
	for (const part of query.split('&')) {
		if (!part) continue
		const eqIdx = part.indexOf('=')
		const rawKey = eqIdx === -1 ? part : part.slice(0, eqIdx)
		const rawVal = eqIdx === -1 ? '' : part.slice(eqIdx + 1)
		params[safeDecode(rawKey)] = rawVal
	}

	return params
}

/**
 * @typedef {object} CompiledPrefix
 * @property {string} prefix
 * @property {RegExp} pathRegex Regex for scheme+host+path; has one capture group iff `pathHasParam` is true.
 * @property {boolean} pathHasParam Whether `$1` appears in the path portion of the template.
 * @property {'none' | 'raw' | 'params'} queryMode How to handle the query string.
 * @property {{ [key: string]: string }} fixedParams Fixed query params that must be present verbatim (for `'params'` mode).
 * @property {string | undefined} paramKey The query param key whose value is `$1` (for `'params'` mode).
 */

/**
 * @param {string} prefix
 * @param {string} urlTemplate
 * @returns {CompiledPrefix}
 */
function compilePrefix(prefix, urlTemplate) {
	const qIdx = urlTemplate.indexOf('?')
	const templatePath = qIdx === -1 ? urlTemplate : urlTemplate.slice(0, qIdx)
	const templateQuery = qIdx === -1 ? undefined : urlTemplate.slice(qIdx + 1)

	// Path — $1 may appear anywhere in the path (including mid-segment, e.g. /name/nm$1/)
	const pathParamIdx = templatePath.indexOf(PLACEHOLDER)
	const pathHasParam = pathParamIdx !== -1
	const pathRegex = pathHasParam
		? new RegExp(
				'^' +
					escapeRegex(templatePath.slice(0, pathParamIdx)) +
					'(.+)' +
					escapeRegex(templatePath.slice(pathParamIdx + PLACEHOLDER.length)) +
					'$',
			)
		: new RegExp('^' + escapeRegex(templatePath) + '$')

	// Query
	/** @type {'none' | 'raw' | 'params'} */
	let queryMode
	/** @type {{ [key: string]: string }} */
	const fixedParams = {}
	/** @type {string | undefined} */
	let paramKey

	if (templateQuery === undefined) {
		queryMode = 'none'
	} else if (templateQuery === PLACEHOLDER) {
		// The entire query string is the parameter (e.g. https://wiki.c2.com/?$1)
		queryMode = 'raw'
	} else {
		queryMode = 'params'
		for (const part of templateQuery.split('&')) {
			const eqIdx = part.indexOf('=')
			const key = eqIdx === -1 ? part : part.slice(0, eqIdx)
			const val = eqIdx === -1 ? '' : part.slice(eqIdx + 1)
			if (val === PLACEHOLDER) {
				paramKey = key
			} else {
				fixedParams[key] = val
			}
		}
	}

	return { prefix, pathRegex, pathHasParam, queryMode, fixedParams, paramKey }
}

/** @type {CompiledPrefix[]} */
const compiledPrefixes = prefixData.map(([prefix, urlTemplate]) =>
	compilePrefix(prefix, urlTemplate),
)

/**
 * Given a URL, return the corresponding MediaWiki prefixed pagename (e.g. `phab:T12345`),
 * or `undefined` if the URL doesn't match any known interwiki prefix.
 *
 * @param {string} url
 * @returns {string | undefined}
 */
export function urlToInterwikiLink(url) {
	const qIdx = url.indexOf('?')
	const inputPath = qIdx === -1 ? url : url.slice(0, qIdx)
	const inputQueryStr = qIdx === -1 ? '' : url.slice(qIdx + 1)

	outer: for (const {
		prefix,
		pathRegex,
		pathHasParam,
		queryMode,
		fixedParams,
		paramKey,
	} of compiledPrefixes) {
		const pathMatch = inputPath.match(pathRegex)
		if (!pathMatch) continue

		// param holds the $1 value; paramDecoded tracks whether it still needs safeDecode
		/** @type {string | undefined} */
		let param = pathHasParam ? pathMatch[1] : undefined
		let paramDecoded = false

		if (queryMode === 'none') {
			if (inputQueryStr) continue
		} else if (queryMode === 'raw') {
			if (!inputQueryStr) continue
			param = inputQueryStr
			paramDecoded = true

			// 'params' — must have exactly the keys the template lists, in any order
		} else if (inputQueryStr) {
			const inputParams = parseQuery(inputQueryStr)
			const expectedKeys = new Set([
				...Object.keys(fixedParams),
				...(paramKey === undefined ? [] : [paramKey]),
			])

			// Reject any key not declared in the template
			for (const key of Object.keys(inputParams)) {
				if (!expectedKeys.has(key)) continue outer
			}

			// All fixed params must be present with matching values
			for (const [key, val] of Object.entries(fixedParams)) {
				if (safeDecode(inputParams[key] ?? '') !== val) continue outer
			}

			// Extract $1 from its named param (if it's not in the path)
			if (paramKey !== undefined) {
				if (!(paramKey in inputParams)) continue
				param = safeDecode(inputParams[paramKey])
				paramDecoded = true
			}
		} else if (Object.keys(fixedParams).length || paramKey !== undefined) continue

		if (param === undefined) return prefix + ':'

		return prefix + ':' + (paramDecoded ? param : safeDecode(param))
	}
}
