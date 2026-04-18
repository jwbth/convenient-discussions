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
    const prefixes = quarryResults.rows.filter(row => row[1] >= 100).map(row => row[0])
    JSON.stringify((await new mw.ForeignApi('https://de.wiktionary.org/w/api.php').get({
      meta: 'siteinfo',
      siprop: 'interwikimap',
      formatversion: 2,
    })).query.interwikimap.filter(entry => prefixes.includes(entry.prefix)).map(entry => [entry.prefix, entry.url]))
    ```
 */

/** @type {[string, string][]} */
const prefixData = [
	['appropedia', 'https://www.appropedia.org/$1'],
	['arxiv', 'https://arxiv.org/abs/$1'],
	['betawiki', 'https://translatewiki.net/wiki/$1'],
	['bibcode', 'https://ui.adsabs.harvard.edu/abs/$1/abstract'],
	['bugzilla', 'https://bugzilla.wikimedia.org/show_bug.cgi?id=$1'],
	['bulba', 'https://bulbapedia.bulbagarden.net/wiki/$1'],
	['c2', 'https://wiki.c2.com/?$1'],
	['ccorg', 'https://creativecommons.org/$1'],
	['choralwiki', 'https://www.cpdl.org/wiki/index.php/$1'],
	['citizendium', 'https://en.citizendium.org/wiki/$1'],
	['creativecommons', 'https://creativecommons.org/licenses/$1'],
	['dcdatabase', 'https://dc.fandom.com/$1'],
	['diffblog', 'https://diff.wikimedia.org/$1'],
	['discord', 'https://discord.com/$1'],
	['doi', 'https://doi.org/$1'],
	['etherpad', 'https://etherpad.wikimedia.org/$1'],
	['ethnologue', 'https://www.ethnologue.com/language/$1'],
	['wikia', 'https://community.fandom.com/wiki/w:c:$1'],
	['wikiasite', 'https://community.fandom.com/wiki/w:c:$1'],
	['foundationsite', 'https://wikimediafoundation.org/$1'],
	['freedomdefined', 'https://freedomdefined.org/$1'],
	['gerrit', 'https://gerrit.wikimedia.org/r/$1'],
	['git', 'https://gerrit.wikimedia.org/g/$1'],
	['gitlab', 'https://gitlab.wikimedia.org/$1'],
	['google', 'https://www.google.com/search?q=$1'],
	['gutenberg', 'https://www.gutenberg.org/ebooks/$1'],
	['hdl', 'https://hdl.handle.net/$1'],
	['hrwiki', 'http://www.hrwiki.org/index.php/$1'],
	['iarchive', 'https://archive.org/details/$1'],
	['imdbname', 'https://www.imdb.com/name/nm$1/'],
	['imdbtitle', 'https://www.imdb.com/title/tt$1/'],
	['infosphere', 'https://theinfosphere.org/$1'],
	['irc', 'irc://irc.libera.chat/$1'],
	['iso639-3', 'https://iso639-3.sil.org/code/$1'],
	['issn', 'https://www.worldcat.org/issn/$1'],
	['listarchive', 'https://lists.wikimedia.org/hyperkitty/$1'],
	['localwiki', 'https://localwiki.org/$1'],
	['luxo', 'https://guc.toolforge.org/?user=$1'],
	['mail', 'https://lists.wikimedia.org/postorius/lists/$1.lists.wikimedia.org/'],
	['mailarchive', 'https://lists.wikimedia.org/pipermail/$1'],
	['marveldatabase', 'https://marvel.fandom.com/wiki/$1'],
	['mdwiki', 'https://mdwiki.org/wiki/$1'],
	['meatball', 'https://meatballwiki.org/wiki/$1'],
	['mediazilla', 'https://bugzilla.wikimedia.org/$1'],
	['memoryalpha', 'https://memory-alpha.fandom.com/wiki/$1'],
	['mwod', 'https://www.merriam-webster.com/dictionary/$1'],
	['oeis', 'https://oeis.org/$1'],
	['openstreetmap', 'https://wiki.openstreetmap.org/wiki/$1'],
	['orthodoxwiki', 'https://orthodoxwiki.org/$1'],
	['osmwiki', 'https://wiki.openstreetmap.org/wiki/$1'],
	['otrs', 'https://ticket.wikimedia.org/otrs/index.pl?Action=AgentTicketZoom&TicketID=$1'],
	['petscan', 'https://petscan.wmflabs.org/?psid=$1'],
	['phab', 'https://phabricator.wikimedia.org/$1'],
	['phabricator', 'https://phabricator.wikimedia.org/$1'],
	['pmid', 'https://www.ncbi.nlm.nih.gov/pubmed/$1?dopt=Abstract'],
	['quarry', 'https://quarry.wmcloud.org/$1'],
	['rfc', 'https://datatracker.ietf.org/doc/html/rfc$1'],
	['scholar', 'https://scholar.google.com/scholar?q=$1'],
	['scores', 'https://imslp.org/wiki/$1'],
	['sep11', 'https://meta.wikimedia.org/wiki/Sep11wiki'],
	['stats', 'https://stats.wikimedia.org/$1'],
	['strategywiki', 'https://strategywiki.org/wiki/$1'],
	['ticket', 'https://ticket.wikimedia.org/otrs/index.pl?Action=AgentTicketZoom&TicketNumber=$1'],
	['toolforge', 'https://iw.toolforge.org/$1'],
	['toollabs', 'https://iw.toolforge.org/$1'],
	['tools', 'https://toolserver.org/$1'],
	['translatewiki', 'https://translatewiki.net/wiki/$1'],
	['uncyclopedia', 'https://en.uncyclopedia.co/wiki/$1'],
	['wikicities', 'https://community.fandom.com/wiki/w:$1'],
	['wikiconference', 'https://wikiconference.org/wiki/$1'],
	['wikiedudashboard', 'https://dashboard.wikiedu.org/$1'],
	['wikifur', 'https://en.wikifur.com/wiki/$1'],
	['wikihow', 'https://www.wikihow.com/$1'],
	['wikiindex', 'https://wikiindex.org/$1'],
	['wikitech', 'https://wikitech.wikimedia.org/wiki/$1'],
	['wikiwikiweb', 'https://wiki.c2.com/?$1'],
	['wmau', 'https://wikimedia.org.au/wiki/$1'],
	['wmdc', 'https://wikimediadc.org/wiki/$1'],
	['wmdeblog', 'https://blog.wikimedia.de/$1'],
	['wmdoc', 'https://doc.wikimedia.org/$1'],
	['wmfblog', 'https://diff.wikimedia.org/$1'],
	['wmfdashboard', 'https://outreachdashboard.wmflabs.org/$1'],
	['wmin', 'https://meta.wikimedia.org/wiki/Wikimedia_India'],
	['wmuk', 'https://wikimedia.org.uk/wiki/$1'],
	['wookieepedia', 'https://starwars.fandom.com/wiki/$1'],
	['xkcd', 'https://xkcd.com/$1'],
	['xtools', 'https://xtools.wmcloud.org/$1'],
]

/**
 * @typedef {object} CompiledPrefix
 * @property {string} prefix
 * @property {RegExp} regex
 * @property {boolean} hasParam Whether the URL template contained a `$1` placeholder.
 */

/**
 * Escape a string for use as a literal in a RegExp.
 *
 * @param {string} s
 * @returns {string}
 */
function escapeRegex(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}

/** @type {CompiledPrefix[]} */
const compiledPrefixes = prefixData.map(([prefix, urlTemplate]) => {
	const paramIndex = urlTemplate.indexOf('$1')
	if (paramIndex === -1) {
		return {
			prefix,
			regex: new RegExp('^' + escapeRegex(urlTemplate) + '$'),
			hasParam: false,
		}
	}
	const before = escapeRegex(urlTemplate.slice(0, paramIndex))
	const after = escapeRegex(urlTemplate.slice(paramIndex + '$1'.length))

	return {
		prefix,
		regex: new RegExp('^' + before + '(.+)' + after + '$'),
		hasParam: true,
	}
})

/**
 * Given a URL, return the corresponding MediaWiki prefixed pagename (e.g. `phab:T12345`),
 * or `undefined` if the URL doesn't match any known interwiki prefix.
 *
 * @param {string} url
 * @returns {string|undefined}
 */
export function urlToInterwikiLink(url) {
	for (const { prefix, regex, hasParam } of compiledPrefixes) {
		const match = url.match(regex)
		if (!match) continue
		if (!hasParam) return prefix + ':'
		try {
			return prefix + ':' + decodeURIComponent(match[1])
		} catch {
			return prefix + ':' + match[1]
		}
	}
}
