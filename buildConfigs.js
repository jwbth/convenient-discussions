const fs = require('fs');
const path = require('path');

const enStrings = JSON.parse(fs.readFileSync(`./i18n/en.json`).toString());

const langs = [];
const stringsRawCodes = {};
fs.readdirSync('./i18n/').forEach((file) => {
  if (path.extname(file) === '.json') {
    const lang = path.basename(file, '.json');
    langs.push(lang);
    const strings = JSON.parse(fs.readFileSync(`./i18n/${file}`).toString());
    Object.keys(enStrings).forEach((key) => {
      if (!strings[key]) {
        strings[key] = enStrings[key];
      }
    });
    stringsRawCodes[lang] = `convenientDiscussions.strings = ${JSON.stringify(strings)};`;
    fs.writeFileSync(`./dist/strings/strings-${lang}.js`, stringsRawCodes[lang] + '\n');
  }
});

const configs = [];
fs.readdirSync('./config/').forEach((file) => {
  if (path.extname(file) === '.js') {
    const [name, lang] = path.basename(file).match(/^\w+-(\w+)\.js/) || [];
    if (lang && langs.includes(lang)) {
      configs.push({ name, lang });
    }
  }
});

configs.forEach((config) => {
  const configContent = fs.readFileSync(`./config/${config.name}`).toString()
    .trim()
    .replace(/[^]*?export default /, '');
  const data = `// This file was assembled automatically from the config at
// https://github.com/jwbth/convenient-discussions/tree/master/config/${config.name} and translation at
// https://translatewiki.net/wiki/Translating:Convenient_Discussions by running
// "node buildConfigs". If you edit this file directly, your changes may be lost with the next
// update. The correct way to update this file is to download the repository and make changes to it,
// run "node buildConfigs", and copy the contents of dist/${config.name} to this page, while making
// a pull request to the repository. See the details at
// https://www.mediawiki.org/wiki/User:Jack_who_built_the_house/Convenient_Discussions#Configuring_for_a_wiki.
window.convenientDiscussions = {};

${stringsRawCodes[config.lang]}

convenientDiscussions.config = ${configContent}

mw.loader.load('https://www.mediawiki.org/w/index.php?title=User:Jack_who_built_the_house/convenientDiscussions.js&action=raw&ctype=text/javascript');
`;
  fs.writeFileSync(`./dist/config/${config.name}`, data);
});

console.log('Configs have been built successfully.');
