import config from '../config.js'

/**
 * Encode a URL using MediaWiki's escaping style.
 *
 * @param {string | number | boolean} string
 */
function wikiUrlencode(string) {
	return encodeURIComponent(string)
		.replace(/'/g, '%27')
		.replace(/%20/g, '_')
		.replace(/%3B/g, ';')
		.replace(/%40/g, '@')
		.replace(/%24/g, '$')
		.replace(/%2C/g, ',')
		.replace(/%2F/g, '/')
		.replace(/%3A/g, ':')
}

/**
 * @param {string} server
 * @param {string} page
 * @param {{ [x: string]: any }} [params]
 */
function getUrl(server, page, params = {}) {
	const base = `${config.protocol}://${server}`
	if (Object.keys(params).length) {
		params = { title: page, ...params }
		const url = new URL(base + config.scriptPath + '/index.php')
		Object.keys(params).forEach((param) => {
			url.searchParams.set(param, params[param])
		})
		return url.toString()
	} else {
		return base + config.articlePath.replace('$1', wikiUrlencode(page))
	}
}

/**
 * @param {any} item
 * @param {any} i
 * @param {string | any[]} arr
 */
function unique(item, i, arr) {
	return arr.indexOf(item) === i
}

/**
 * @param {string} string
 */
function replaceEntitiesInI18n(string) {
	return string
		.replace(/&nbsp;/g, '\u00a0')
		.replace(/&#32;/g, ' ')
		.replace(/&rlm;/g, '\u200f')
		.replace(/&lrm;/g, '\u200e')
}

export { getUrl, replaceEntitiesInI18n, unique }
