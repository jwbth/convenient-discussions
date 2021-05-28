require('json5/lib/register.js');

const config = require('./../config.json5');

function wikiUrlencode(s) {
  return encodeURIComponent(s)
    .replace(/'/g, '%27')
    .replace(/%20/g, '_')
    .replace(/%3B/g, ';')
    .replace(/%40/g, '@')
    .replace(/%24/g, '$')
    .replace(/%2C/g, ',')
    .replace(/%2F/g, '/')
    .replace(/%3A/g, ':');
}

function getUrl(page) {
  return (
    `${config.protocol}://${config.server}` +
    config.articlePath.replace('$1', wikiUrlencode(page))
  );
}

function unique(item, i, arr) {
  return arr.indexOf(item) === i;
}

module.exports = { getUrl, unique };
