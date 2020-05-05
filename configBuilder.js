const fs = require('fs');
const path = require('path');

const langs = [];
fs.readdirSync('./src/js/i18n/').forEach((file) => {
  if (path.extname(file) === '.js') {
    langs.push(path.basename(file, '.js'));
  }
});

const configs = [];
fs.readdirSync('./src/js/config/').forEach((file) => {
  if (path.extname(file) === '.js') {
    const [name, , lang] = path.basename(file).match(/^(\w+)-(\w+)\.js/) || [];
    if (lang && langs.includes(lang)) {
      configs.push({ name, lang });
    }
  }
});

configs.forEach((config) => {
  const configContent = fs.readFileSync(`./src/js/config/${config.name}`).toString();
  const stringsContent = fs.readFileSync(`./src/js/i18n/${config.lang}.js`).toString();

  let data = `window.convenientDiscussions = {};

convenientDiscussions.strings = `;

  data += stringsContent.replace('export default ', '');

  data += `
convenientDiscussions.config = `;

  data += configContent.replace(/[^]*?export default /, '');

  data += `
mw.loader.load('https://ru.wikipedia.org/w/index.php?title=%D0%A3%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8%D0%BA:Jack_who_built_the_house/convenientDiscussions-new.js&action=raw&ctype=text/javascript');
`;

  fs.writeFileSync(`./dist/${config.name}`, data);
});
