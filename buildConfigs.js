const fs = require('fs');
const path = require('path');

const argv = require('yargs').argv;

// node buildConfigs --dev
// npm run <command running this script> --dev
const devSuffix = (argv.dev || process.env.npm_config_dev) ? '-dev' : '';

fs.readdirSync('./config/').forEach((filename) => {
  if (path.extname(filename) === '.js') {
    const [, name] = path.basename(filename).match(/^(\w+-\w+)\.js$/) || [];
    const content = fs.readFileSync(`./config/${filename}`)
      .toString()
      .trim()
      .replace(/[^]*?export default /, '');

    // When updating this code, update the code in misc/convenientDiscussions-generateBasicConfig.js
    // as well.
    const data = `/**
 * This file was assembled automatically from the configuration at
 * https://github.com/jwbth/convenient-discussions/tree/master/config/${filename} by running
 * "node buildConfigs". The configuration might get outdated as the script evolves, so it's best
 * to keep it up to date by checking for the documentation updates from time to time. See the
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

convenientDiscussions.config = ${content}

/* END OF THE CONFIGURATION */


if (!convenientDiscussions.isRunning) {
  convenientDiscussions.getStringsPromise = getStrings();
  mw.loader.getScript('https://commons.wikimedia.org/w/index.php?title=User:Jack_who_built_the_house/convenientDiscussions${devSuffix}.js&action=raw&ctype=text/javascript')
    .catch(function (e) {
      console.warn('Couldn\\'t load Convenient Discussions.', e);
    });
}

}());

// </nowiki>
`;
    fs.mkdirSync('dist/convenientDiscussions-config', { recursive: true });
    fs.writeFileSync(`dist/convenientDiscussions-config/${name}${devSuffix}.js`, data);
  }
});

console.log('Project configs have been built successfully.');
