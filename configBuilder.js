const fs = require('fs');
const path = require('path');

const enStringsContent = fs.readFileSync(`./i18n/en.json`).toString();
const enStrings = JSON.parse(enStringsContent);

const langs = [];
const allMergedStrings = {};
fs.readdirSync('./i18n/').forEach((file) => {
  if (path.extname(file) === '.json') {
    const lang = path.basename(file, '.json');
    langs.push(lang);
    const stringsContent = fs.readFileSync(`./i18n/${file}`).toString();
    const strings = JSON.parse(stringsContent);
    Object.keys(enStrings).forEach((key) => {
      if (!strings[key]) {
        strings[key] = enStrings[key];
      }
    });
    const mergedStrings = `convenientDiscussions.strings = ${JSON.stringify(strings)};`;
    allMergedStrings[lang] = mergedStrings;
    fs.writeFileSync(`./dist/${lang}.js`, mergedStrings + '\n');
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
  const data = `window.convenientDiscussions = {};

${allMergedStrings[config.lang]}

convenientDiscussions.config = ${configContent}

mw.loader.load('https://ru.wikipedia.org/w/index.php?title=%D0%A3%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D0%BA:Jack_who_built_the_house/convenientDiscussions-new.js&action=raw&ctype=text/javascript');
`;
  fs.writeFileSync(`./dist/${config.name}`, data);
});
