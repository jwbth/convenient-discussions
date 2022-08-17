require('json5/lib/register.js');

const config = require('./../config.json5');

function wikiUrlencode(string) {
  return encodeURIComponent(string)
    .replace(/'/g, '%27')
    .replace(/%20/g, '_')
    .replace(/%3B/g, ';')
    .replace(/%40/g, '@')
    .replace(/%24/g, '$')
    .replace(/%2C/g, ',')
    .replace(/%2F/g, '/')
    .replace(/%3A/g, ':');
}

function getUrl(server, page, params = {}) {
  const base = `${config.protocol}://${server}`;
  if (Object.keys(params).length) {
    params = Object.assign({}, { title: page }, params);
    const url = new URL(base + config.scriptPath + '/index.php');
    Object.keys(params).forEach((param) => {
      url.searchParams.set(param, params[param]);
    });
    return url.toString();
  } else {
    return base + config.articlePath.replace('$1', wikiUrlencode(page));
  }
}

function unique(item, i, arr) {
  return arr.indexOf(item) === i;
}

function replaceEntitiesInI18n(string) {
  return string
    .replace(/&nbsp;/g, '\xa0')
    .replace(/&#32;/g, ' ')
    .replace(/&rlm;/g, '\u200f')
    .replace(/&lrm;/g, '\u200e');
}

module.exports = { getUrl, unique, replaceEntitiesInI18n };
