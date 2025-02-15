const fs = require('fs');

const argv = require('yargs').argv;

// node buildConfigs --test
// npm run <command running this script> --test
const testSuffix = (argv.test || process.env.npm_config_test) ? '.test' : '';

fs.readdirSync('./config/').forEach((filename) => {
  const [, name] = filename.match(/^(\w+(?:-\w+)?)\.js$/) || [];
  if (!name || name === 'default') return;
  let content = fs.readFileSync(`config/${filename}`, 'utf8')
    .trim()
    .replace(/[^]*?export default /, '');

  // When updating this code, update the code in misc/convenientDiscussions-generateBasicConfig.js
  // as well.
  content = `/**
 * This file was assembled automatically from the configuration at
 * https://github.com/jwbth/convenient-discussions/tree/main/config/${filename} by running
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

window.convenientDiscussions = /** @type {import('../../src/cd').ConvenientDiscussions} */ (window.convenientDiscussions || {});
if (convenientDiscussions.config) return;


/* BEGINNING OF CONFIGURATION */

convenientDiscussions.config = ${content}

/* END OF CONFIGURATION */


if (!convenientDiscussions.isRunning) {
  convenientDiscussions.getStringsPromise = getStrings();
  mw.loader.getScript('https://commons.wikimedia.org/w/index.php?title=User:Jack_who_built_the_house/convenientDiscussions${testSuffix}.js&action=raw&ctype=text/javascript')
    .catch(function (e) {
      console.warn('Couldn\\'t load Convenient Discussions.', e);
    });
}

}());

// </nowiki>
`;
  fs.mkdirSync('dist/convenientDiscussions-config', { recursive: true });
  fs.writeFileSync(`dist/convenientDiscussions-config/${name}${testSuffix}.js`, content);
});

fs.copyFileSync(
  `misc/convenientDiscussions-generateBasicConfig.js`,
  `dist/convenientDiscussions-generateBasicConfig.js`
);

console.log('Project configs have been built successfully.');
