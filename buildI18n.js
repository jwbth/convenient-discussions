const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const chalk = require('chalk');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const rimraf = require('rimraf');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

const warning = (text) => console.log(chalk.yellowBright(text));
const code = chalk.inverse;
const keyword = chalk.cyan;

const ALLOWED_TAGS = [
  'b',

  // Haven't met in practice yet, but perhaps these tags could be helpful for RTL languages?
  'bdi',
  'bdo',

  'code',
  'em',
  'i',
  'kbd',
  'li',
  'nowiki',
  'ol',
  'p',
  'pre',
  'span',
  'strong',
  'syntaxhighlight',
  'ul',
  'var',
];

function hideText(text, regexp, hidden) {
  return text.replace(regexp, (s) => '\x01' + hidden.push(s) + '\x02');
}

function unhideText(text, hidden) {
  while (text.match(/\x01\d+\x02/)) {
    text = text.replace(/\x01(\d+)\x02/g, (s, num) => hidden[num - 1]);
  }

  return text;
}

DOMPurify.addHook('uponSanitizeElement', (currentNode, data, config) => {
  if (!Object.keys(data.allowedTags).includes(data.tagName) && data.tagName !== 'body') {
    // `< /li>` qualifies as `#comment` and has content available under `currentNode.textContent`.
    warning(`Disallowed tag found and sanitized in string "${keyword(config.stringName)}" in ${keyword(config.filename)}: ${code(currentNode.outerHTML || currentNode.textContent)}. See https://translatewiki.net/wiki/Wikimedia:Convenient-discussions-${config.stringName}/${config.lang}`);
  }
});

DOMPurify.addHook('uponSanitizeAttribute', (currentNode, hookEvent, config) => {
  if (!Object.keys(hookEvent.allowedAttributes).includes(hookEvent.attrName)) {
    warning(`Disallowed attribute found and sanitized in string "${keyword(config.stringName)}" in ${keyword(config.filename)}: ${code(hookEvent.attrName)} with value "${hookEvent.attrValue}". See https://translatewiki.net/wiki/Wikimedia:Convenient-discussions-${config.stringName}/${config.lang}`);
  }
});

const i18n = {};
fs.readdirSync('./i18n/')
  .filter(filename => path.extname(filename) === '.json' && filename !== 'qqq.json')
  .forEach((filename) => {
    const [, lang] = path.basename(filename).match(/^(.+)\.json$/) || [];
    const strings = require(`./i18n/${filename}`);
    Object.keys(strings)
      .filter((name) => typeof strings[name] === 'string')
      .forEach((stringName) => {
        const hidden = [];
        let sanitized = hideText(strings[stringName], /<nowiki(?: [\w ]+(?:=[^<>]+?)?| *)>([^]*?)<\/nowiki *>/g, hidden);

        sanitized = DOMPurify.sanitize(sanitized, {
          ALLOWED_TAGS,
          ALLOWED_ATTR: [
            'class',
            'dir',
            'href',
            'target',
          ],
          ALLOW_DATA_ATTR: false,
          filename,
          stringName,
          lang,
        });

        sanitized = unhideText(sanitized, hidden);

        // Just in case dompurify or jsdom gets outdated or the repository gets compromised, we will
        // just manually check that only allowed tags are present.
        for (const [, tagName] of sanitized.matchAll(/<(\w+)/g)) {
          if (!ALLOWED_TAGS.includes(tagName.toLowerCase())) {
            warning(`Disallowed tag ${code(tagName)} found in ${keyword(filename)} at the late stage: ${keyword(sanitized)}. The string has been removed altogether.`);
            delete strings[stringName];
            return;
          }
        }

        // The same with suspicious strings containing what seems like the "javascript:" prefix or
        // one of the "on..." attributes.
        let test = sanitized.replace(/&\w+;|\s+/g, '');
        if (/javascript:/i.test(test) || /\bon\w+\s*=/i.test(sanitized)) {
          warning(`Suspicious code found in ${keyword(filename)} at the late stage: ${keyword(sanitized)}. The string has been removed altogether.`);
          delete strings[stringName];
          return;
        }

        strings[stringName] = sanitized;
      });

    i18n[lang] = strings;
  });

const i18nWithFallbacks = {};

if (Object.keys(i18n).length) {
  // Use language fallbacks data to fill missing messages. When fallbacks need to be updated, they
  // can be collected using
  // https://phabricator.wikimedia.org/source/mediawiki/browse/master/languages/messages/?grep=fallback%20%3D.
  const fallbackData = require('./data/languageFallbacks.json');
  Object.keys(i18n).forEach((lang) => {
    const fallbacks = fallbackData[lang];
    if (fallbacks) {
      const fallbackMessages = fallbacks.map((fbLang) => i18n[fbLang]).reverse();
      i18nWithFallbacks[lang] = Object.assign({}, ...fallbackMessages, i18n[lang]);
    } else {
      i18nWithFallbacks[lang] = i18n[lang];
    }
  });

  // Create a temporary folder.
  const dateLocalesTempDirName = 'date-locales-temp';
  fs.mkdirSync(dateLocalesTempDirName, { recursive: true });

  // Add temporary language files to that folder that import respective locales if they exist.
  const dateLocales = require('dayjs/locale').map((locale) => locale.key);
  const langsHavingDateLocale = [];
  Object.keys(i18nWithFallbacks).forEach((lang) => {
    const langDateLocaleName = lang
      .replace(/^zh-hans$/, 'zh-cn')
      .replace(/^zh-hant$/, 'zh-tw');

    // The English locale is built-in.
    if (lang !== 'en' && dateLocales.includes(langDateLocaleName)) {
      langsHavingDateLocale.push(lang);
      let text = `import dateLocale from 'dayjs/locale/${langDateLocaleName}';
convenientDiscussions.i18n['${lang}'].dateLocale = dateLocale;
`;
      fs.writeFileSync(`${dateLocalesTempDirName}/${lang}.js`, text);
    }
  });

  // Build the locales.
  if (langsHavingDateLocale.length) {
    const webpackConfig = `const fs = require('fs');
const path = require('path');

const entry = {};
fs.readdirSync('./${dateLocalesTempDirName}')
  .filter((name) => name.endsWith('.js') && !name.endsWith('webpack.config.js'))
  .forEach((name) => {
    entry[name.slice(0, -3)] = './' + name;
  });

module.exports = {
  mode: 'production',
  context: path.resolve(__dirname, '.'),
  entry,
  output: {
    path: path.resolve(__dirname, 'dist'),
  },
};
`;
    fs.writeFileSync(`${dateLocalesTempDirName}/webpack.config.js`, webpackConfig);
    execSync(`node ./node_modules/webpack/bin/webpack --config "${dateLocalesTempDirName}/webpack.config.js"`);
  }

  // Create i18n files that combine translations with dayjs locales.
  for (let [lang, json] of Object.entries(i18nWithFallbacks)) {
    let jsonText = JSON.stringify(json, null, '\t')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#32;/g, ' ');

    let dateLocaleText;
    if (langsHavingDateLocale.includes(lang)) {
      dateLocaleText = fs.readFileSync(`./${dateLocalesTempDirName}/dist/${lang}.js`).toString();
    }

    if (lang === 'en') {
      // Prevent creating "</nowiki>" character sequences when building the main script file.
      jsonText = jsonText.replace(/<\/nowiki>/g, '</" + String("") + "nowiki>');
    }

    let text = `window.convenientDiscussions = window.convenientDiscussions || {};
convenientDiscussions.i18n = convenientDiscussions.i18n || {};
convenientDiscussions.i18n['${lang}'] = ${jsonText};
`;
    if (dateLocaleText) {
      text += `
// This assigns a day.js locale object to \`convenientDiscussions.i18n['${lang}'].dateLocale\`.
${dateLocaleText}
`;
    }
    fs.mkdirSync('dist/convenientDiscussions-i18n', { recursive: true });
    fs.writeFileSync(`dist/convenientDiscussions-i18n/${lang}.js`, text);
  }

  rimraf.sync(dateLocalesTempDirName);
}

const i18nListText = JSON.stringify(Object.keys(i18n), null, '\t') + '\n';
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/i18nList.json', i18nListText);

console.log('Internationalization files have been built successfully.');
