const fs = require('fs');
const path = require('path');

const langs = [];
const stringsContents = [];
fs.readdirSync('./i18n/').forEach((file) => {
  if (path.extname(file) === '.json') {
    const lang = path.basename(file, '.json');
    langs.push(lang);
    let stringsContent = fs.readFileSync(`./i18n/${file}`).toString().trim();
    stringsContent = `convenientDiscussions.strings = ${stringsContent};`;
    stringsContents[lang] = stringsContent;
    fs.writeFileSync(`./dist/${lang}.js`, stringsContent + '\n');
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

${stringsContents[config.lang]}

convenientDiscussions.config = ${configContent}

mw.loader.load('https://ru.wikipedia.org/w/index.php?title=%D0%A3%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D0%BA:Jack_who_built_the_house/convenientDiscussions-new.js&action=raw&ctype=text/javascript');
`;
  fs.writeFileSync(`./dist/${config.name}`, data);
});
