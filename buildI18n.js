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
  const localesTempDirName = 'date-fns-locales-temp';
  fs.mkdirSync(localesTempDirName, { recursive: true });

  // Add temporary language files to that folder that import respective locales if they exist.
  const dateFnsLocales = require('date-fns/locale');
  const langsHavingDateFnsLocale = [];
  Object.keys(i18nWithFallbacks).forEach((lang) => {
    const langDateFnsName = lang
      .replace(/^zh-han./, 'zhCN')
      .replace(/^en$/, 'enUS')
      .replace(/-.+$/, (s) => s.toUpperCase())
      .replace(/-/g, '');
    if (dateFnsLocales[langDateFnsName]) {
      langsHavingDateFnsLocale.push(lang);
      let text = `import { ${langDateFnsName} } from 'date-fns/locale';
convenientDiscussions.i18n['${lang}'].dateFnsLocale = ${langDateFnsName};
`;
      if (lang === 'en') {
        text += `const realFormatDistance = convenientDiscussions.i18n.en.dateFnsLocale.formatDistance;
convenientDiscussions.i18n.en.dateFnsLocale.formatDistance = (...args) => {
  // "1 minute ago" → "a minute ago", "1 hour ago" → "an hour ago", etc.
  return realFormatDistance(...args).replace(/^1 (\\w+)/, (s, m1) => (
    m1.startsWith('hour') ?
    'an ' :
    'a '
  ));
};

`;
      }
      fs.writeFileSync(`${localesTempDirName}/${lang}.js`, text);
    }
  });

  // Build the locales.
  if (langsHavingDateFnsLocale.length) {
    const webpackConfig = `const fs = require('fs');
const path = require('path');

const entry = {};
fs.readdirSync('./${localesTempDirName}')
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
    fs.writeFileSync(`${localesTempDirName}/webpack.config.js`, webpackConfig);
    execSync(`node ./node_modules/webpack/bin/webpack --config "${localesTempDirName}/webpack.config.js"`);
  }

  // Create i18n files that combine translations with date-fns locales.
  for (let [lang, json] of Object.entries(i18nWithFallbacks)) {
    let jsonText = JSON.stringify(json, null, '\t')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#32;/g, ' ');

    let dateFnsLocaleText;
    if (langsHavingDateFnsLocale.includes(lang)) {
      dateFnsLocaleText = fs.readFileSync(`./${localesTempDirName}/dist/${lang}.js`).toString();
    }

    if (lang === 'en') {
      // Prevent creating "</nowiki>" character sequences when building the main script file.
      jsonText = jsonText.replace(/<\/nowiki>/g, '</" + String("") + "nowiki>');
    }

    let text = `window.convenientDiscussions = window.convenientDiscussions || {};
convenientDiscussions.i18n = convenientDiscussions.i18n || {};
convenientDiscussions.i18n['${lang}'] = ${jsonText};
`;
    if (dateFnsLocaleText) {
      text += `
// This assigns a date-fns locale object to \`convenientDiscussions.i18n['${lang}'].dateFnsLocale\`.
${dateFnsLocaleText}
`;
    }
    fs.mkdirSync('dist/convenientDiscussions-i18n', { recursive: true });
    fs.writeFileSync(`dist/convenientDiscussions-i18n/${lang}.js`, text);
  }

  rimraf.sync(localesTempDirName);
}

const i18nListText = JSON.stringify(Object.keys(i18n), null, '\t') + '\n';
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/i18nList.json', i18nListText);

console.log('Internationalization files have been built successfully.');
