const fs = require('fs');
const path = require('path');

fs.readdirSync('./i18n/').forEach((file) => {
  if (path.extname(file) === '.json' && file !== 'qqq.json') {
    const [fullName, name] = path.basename(file).match(/^(.+)\.json$/) || [];
    const content = fs.readFileSync(`./i18n/${fullName}`).toString().trim();
    const data = `convenientDiscussions.i18n['${name}'] = ${content};
`;
    fs.mkdirSync('dist/convenientDiscussions-i18n', { recursive: true });
    fs.writeFileSync(`dist/convenientDiscussions-i18n/${name}.js`, data);
  }
});

console.log('Internationalization files has been built successfully.');
