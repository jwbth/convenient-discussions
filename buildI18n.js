const fs = require('fs');
const path = require('path');

const chalk = require('chalk');

const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

const warning = (text) => console.log(chalk.yellowBright(text));
const code = chalk.inverse;
const keyword = chalk.cyan;

DOMPurify.addHook('uponSanitizeElement', (currentNode, data, config) => {
  if (!Object.keys(data.allowedTags).includes(data.tagName) && data.tagName !== 'body') {
    // `< /li>` qualifies as "#comment" and has content available under `currentNode.textContent`.
    warning(`Disallowed tag found and sanitized in ${keyword(config.file)}: ${code(currentNode.outerHTML || currentNode.textContent)}`);
  }
});

DOMPurify.addHook('uponSanitizeAttribute', (currentNode, hookEvent, config) => {
  if (!Object.keys(hookEvent.allowedAttributes).includes(hookEvent.attrName)) {
    warning(`Disallowed attribute found and sanitized in ${keyword(config.file)}: ${code(hookEvent.attrName)} with value "${hookEvent.attrValue}"`);
  }
});

fs.readdirSync('./i18n/').forEach((file) => {
  if (path.extname(file) === '.json' && file !== 'qqq.json') {
    const [, lang] = path.basename(file).match(/^(.+)\.json$/) || [];
    const strings = require(`./i18n/${file}`);
    Object.keys(strings)
      .filter((name) => typeof strings[name] === 'string')
      .forEach((name) => {
        // Prevent replacing HTML numeric character references with characters.
        let sanitized = strings[name].replace(/&#(\d+);/g, '&#_$1;');

        sanitized = DOMPurify.sanitize(sanitized, {
          SAFE_FOR_JQUERY: true,
          ALLOWED_TAGS: [
            'a',
            'b',

            // Haven't met in practice yet, but these tags could be helpful?
            'bdi',
            'bdo',

            'code',
            'em',
            'i',
            'kbd',
            'li',
            'ol',
            'p',
            'span',
            'strong',
            'ul',
            'var',
          ],
          ALLOWED_ATTR: [
            'class',
            'dir',
            'href',
            'target',
          ],
          ALLOW_DATA_ATTR: false,
          file,
        });
        sanitized = sanitized.replace(/&amp;#_(\d+);/g, '&#$1;');
        strings[name] = sanitized;
      });
    const data = `convenientDiscussions.i18n = convenientDiscussions.i18n || {};
convenientDiscussions.i18n['${lang}'] = ${JSON.stringify(strings, null, '\t')};
`;
    fs.mkdirSync('dist/convenientDiscussions-i18n', { recursive: true });
    fs.writeFileSync(`dist/convenientDiscussions-i18n/${lang}.js`, data);
  }
});

console.log('Internationalization files has been built successfully.');
