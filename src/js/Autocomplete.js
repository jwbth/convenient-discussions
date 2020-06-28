/**
 * Autocomplete mechanism.
 *
 * @module autocomplete
 */

import cd from './cd';
import { defined, firstCharToUpperCase, removeDuplicates } from './util';
import {
  getRelevantPageNames,
  getRelevantTemplateNames,
  getRelevantUserNames,
} from './apiWrappers';

/**
 * Autocomplete class.
 */
export default class Autocomplete {
  /**
   * Create an autocomplete instance. An instance is a set of settings and inputs to which these
   * settings apply.
   *
   * @param {object} options
   * @param {string[]} options.types Can contain `'mentions'`, `'wikilinks'`, `'templates'`, and
   *   `'tags'`.
   * @param {Function} options.inputs Inputs to attach autocomplete to.
   * @param {string[]} options.defaultUserNames Default list of user names for the mentions
   *   autocomplete.
   */
  constructor({ types, inputs, defaultUserNames }) {
    const collections = this.getCollections(types, defaultUserNames);

    mw.loader.load(
      'https://tools-static.wmflabs.org/cdnjs/ajax/libs/tributejs/5.1.3/tribute.css',
      'text/css'
    );
    mw.loader.getScript('https://tools-static.wmflabs.org/cdnjs/ajax/libs/tributejs/5.1.3/tribute.js')
      .then(
        () => {
          this.tribute = new Tribute({
            collection: collections,
            allowSpaces: true,
            menuItemLimit: 10,
            noMatchTemplate: () => null,
            containerClass: 'tribute-container cd-mentionsContainer',
          });

          // Replace the native function, removing:
          // * "space" - it causes the menu not to change or hide when a space was typed;
          // * "delete" - it causes the menu not to appear when backspace is pressed and a character
          // preventing the menu to appear is removed (for example, ">" in "<small>"). It is
          // replaced with "e.keyCode === 8" in shouldDeactivate lower.
          this.tribute.events.constructor.keys = () => [
            {
              key: 9,
              value: 'TAB'
            },
            {
              key: 13,
              value: 'ENTER'
            },
            {
              key: 27,
              value: 'ESCAPE'
            },
            {
              key: 38,
              value: 'UP'
            },
            {
              key: 40,
              value: 'DOWN'
            }
          ];

          // This hack fixes the disappearing of the menu when a part of mention is typed and the
          // user presses any command key.
          this.tribute.events.shouldDeactivate = (e) => {
            if (!this.tribute.isActive) return false;

            return (
              // Backspace
              e.keyCode === 8 ||
              // Page Up, Page Down, End, Home, Left
              (e.keyCode >= 33 && e.keyCode <= 37) ||
              // Right
              e.keyCode === 39 ||
              // Ctrl+...
              (e.ctrlKey && e.keyCode !== 17) ||
              // ⌘+...
              (e.metaKey && (e.keyCode !== 91 && e.keyCode !== 93 && e.keyCode !== 224))
            );
          };

          inputs.forEach((input) => {
            const element = input.$input.get(0);
            this.tribute.attach(element);

            element.addEventListener('tribute-replaced', (e) => {
              // Move the caret to the place we need.
              const cursorIndex = input.getRange().to;
              const value = input.getValue();
              input.setValue(value.slice(0, cursorIndex - 1) + value.slice(cursorIndex));
              input.selectRange(cursorIndex - 1 - e.detail.item.original.endOffset);
            });
          });
        },
        (e) => {
          console.warn('Couldn\'t load Tribute from wmflabs.org.', e);
        }
      );
  }

  getCollections(types, defaultUserNames) {
    const selectTemplate = (item) => {
      if (item) {
        return item.original.value;
      } else {
        return '';
      }
    };

    const search = (text, list) => (
      this.tribute.search
        .filter(text, list)
        .map((match) => match.string)
    );

    const prepareValues = (arr, config) => (
      removeDuplicates(arr)
        .filter(defined)
        .map((name) => ({
          key: name,
          value: config && config.transform ? config.transform(name) : name,
          endOffset: config && config.getEndOffset ? config.getEndOffset(name) : 0,
        }))
    );

    const collectionsByType = {
      mentions: {
        trigger: '@',
        searchOpts: {
          skip: true,
        },
        requireLeadingSpace: true,
        selectTemplate,
        values: async (text, callback) => {
          // Fix multiple event firing (we need it after fixing currentMentionTextSnapshot below).
          if (text && this.mentions.snapshot === text) return;

          if (!text.startsWith(this.mentions.snapshot)) {
            this.mentions.cache = [];
          }
          this.mentions.snapshot = text;

          // Hack to make the menu disappear when a space is typed after "@".
          this.tribute.currentMentionTextSnapshot = {};

          if (text.includes('[[')) {
            callback([]);
            return;
          }

          if (this.mentions.byText[text]) {
            callback(prepareValues(this.mentions.byText[text], this.mentions));
          } else {
            const matches = search(text, this.mentions.default);
            let values = matches.slice();

            const isLikelyName = (
              text &&
              text.length <= 85 &&
              !/[#<>[\]|{}/@:]/.test(text) &&
              // 5 spaces in a user name seems too many. "Jack who built the house" has 4 :-)
              (text.match(/ /g) || []).length <= 4
            );
            if (isLikelyName) {
              // Logically, matched or this.mentions.cache should have zero length (a request is made only
              // if there is no matches in the section; if there are, this.mentions.cache is an empty
              // array).
              if (!matches.length) {
                values.push(...this.mentions.cache);
              }
              values = search(text, values);

              // Make the typed text always appear on the last, 10th place.
              values[9] = text.trim();
            }

            callback(prepareValues(values, this.mentions));

            if (isLikelyName && !matches.length) {
              let values;
              try {
                values = await getRelevantUserNames(text);
              } catch (e) {
                return;
              }

              values = this.mentions.removeSelf(values);
              this.mentions.cache = values.slice();

              // Make the typed text always appear on the last, 10th place.
              values[9] = text.trim();

              this.mentions.byText[text] = values;

              // The text has been updated since the request was made.
              if (this.mentions.snapshot !== text) return;

              callback(prepareValues(values, this.mentions));
            }
          }
        },
      },
      wikilinks: {
        trigger: '[[',
        searchOpts: {
          skip: true,
        },
        selectTemplate,
        values: async (text, callback) => {
          if (!text.startsWith(this.wikilinks.snapshot)) {
            this.wikilinks.cache = [];
          }
          this.wikilinks.snapshot = text;

          if (text.includes('[[')) {
            callback([]);
            return;
          }

          if (this.wikilinks.byText[text]) {
            callback(prepareValues(this.wikilinks.byText[text], this.wikilinks));
          } else {
            let values = [];
            const isLikelyName = (
              text &&
              text.length <= 255 &&
              !/[#<>[\]|{}]/.test(text) &&
              // 10 spaces in a page name seems too many.
              (text.match(/ /g) || []).length <= 9
            );
            if (isLikelyName) {
              values.push(...this.wikilinks.cache);
              values = search(text, values);

              // Make the typed text always appear on the last, 10th place.
              values[9] = text.trim();
            }

            callback(prepareValues(values, this.wikilinks));

            if (isLikelyName) {
              let values;
              try {
                values = await getRelevantPageNames(text);
              } catch (e) {
                return;
              }

              this.wikilinks.cache = values.slice();

              // Make the typed text always appear on the last, 10th place.
              values[9] = text.trim();

              this.wikilinks.byText[text] = values;

              // The text has been updated since the request was made.
              if (this.wikilinks.snapshot !== text) return;

              callback(prepareValues(values, this.wikilinks));
            }
          }
        },
      },
      templates: {
        trigger: '{{',
        searchOpts: {
          skip: true,
        },
        selectTemplate,
        values: async (text, callback) => {
          if (!text.startsWith(this.templates.snapshot)) {
            this.templates.cache = [];
          }
          this.templates.snapshot = text;

          if (text.includes('{{')) {
            callback([]);
            return;
          }

          if (this.templates.byText[text]) {
            callback(prepareValues(this.templates.byText[text], this.templates));
          } else {
            let values = [];
            const isLikelyName = (
              text &&
              text.length <= 255 &&
              !/[#<>[\]|{}]/.test(text) &&
              // 10 spaces in a page name seems too many.
              (text.match(/ /g) || []).length <= 9
            );
            if (isLikelyName) {
              values.push(...this.templates.cache);
              values = search(text, values);

              // Make the typed text always appear on the last, 10th place.
              values[9] = text.trim();
            }

            callback(prepareValues(values, this.templates));

            if (isLikelyName) {
              let values;
              try {
                values = await getRelevantTemplateNames(text);
              } catch (e) {
                return;
              }

              this.templates.cache = values.slice();

              // Make the typed text always appear on the last, 10th place.
              values[9] = text.trim();

              this.templates.byText[text] = values;

              // The text has been updated since the request was made.
              if (this.templates.snapshot !== text) return;

              callback(prepareValues(values, this.templates));
            }
          }
        },
      },
      tags: {
        trigger: '<',
        menuShowMinLength: 1,
        searchOpts: {
          skip: true,
        },
        selectTemplate,
        values: (text, callback) => {
          const regexp = new RegExp('^' + mw.util.escapeRegExp(text), 'i');
          if (!/^[a-z]+$/i.test(text) && !this.tags.withSpace.some((tag) => regexp.test(tag))) {
            callback([]);
            return;
          }
          const matches = this.tags.default.filter((tag) => regexp.test(tag));
          callback(prepareValues(matches, this.tags));
        },
      },
    };

    const collections = [];
    types.forEach((type) => {
      this[type] = Autocomplete[`get${firstCharToUpperCase(type)}Config`]
        .call(null, type === 'mentions' ? defaultUserNames : undefined);
      collections.push(collectionsByType[type]);
    });

    return collections;
  }

  /**
   * Get mentions autocomplete configuration.
   *
   * @param {string[]} defaultUserNames
   * @returns {object}
   */
  static getMentionsConfig(defaultUserNames) {
    const userNamespace = mw.config.get('wgFormattedNamespaces')[2];
    const config = {
      byText: {},
      cache: [],
      transform: (name) => {
        name = name.trim();
        return `@[[${userNamespace}:${name}|${name}]]`;
      },
      removeSelf: (arr) => {
        while (arr.includes(cd.g.CURRENT_USER_NAME)) {
          arr.splice(arr.indexOf(cd.g.CURRENT_USER_NAME), 1);
        }
        return arr;
      },
    };
    config.default = config.removeSelf(defaultUserNames);

    return config;
  }

  /**
   * Get wikilinks autocomplete configuration.
   *
   * @returns {object}
   */
  static getWikilinksConfig() {
    const colonNamespaces = mw.config.get('wgFormattedNamespaces');
    const colonNamespacesRegexp = new RegExp(`^(${colonNamespaces[6]}|${colonNamespaces[14]}):`);
    return {
      byText: {},
      cache: [],
      transform: (name) => {
        name = name.trim();
        if (colonNamespacesRegexp.test(name)) {
          name = ':' + name;
        }
        return `[[${name}]]`;
      },
    };
  }

  /**
   * Get templates autocomplete configuration.
   *
   * @returns {object}
   */
  static getTemplatesConfig() {
    return {
      byText: {},
      cache: [],
      transform: (name) => {
        name = name.trim();
        return `{{${name}}}`;
      },
      getEndOffset: () => 2,
    };
  }

  /**
   * Get tags autocomplete configuration.
   *
   * @returns {object}
   */
  static getTagsConfig() {
    const config = {
      default: [
        // See https://meta.wikimedia.org/wiki/Help:HTML_in_wikitext#Permitted_HTML,
        // https://en.wikipedia.org/wiki/Help:HTML_in_wikitext#Parser_and_extension_tags.
        // Deprecated elements are not included.
        'abbr', 'b', 'bdi', 'bdo', 'blockquote', 'br', 'caption', 'cite', 'code', 'codenowiki',
        'data', 'dd', 'del', 'dfn', 'div', 'dl', 'dt', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'hr', 'i', 'ins', 'kbd', 'li', 'link', 'mark', 'meta', 'ol', 'p', 'pre', 'q', 'rp', 'rt',
        'rtc', 'ruby', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'table', 'td', 'th',
        'time', 'tr', 'u', 'ul', 'var', 'wbr',
        'gallery', 'includeonly', 'noinclude', 'nowiki', 'onlyinclude', 'categorytree',
        'charinsert', 'chem', 'ce', 'graph', 'hiero', 'imagemap', 'indicator', 'inputbox',
        'mapframe', 'maplink', 'math', 'math chem', 'poem', 'ref', 'references', 'score', 'section',
        'syntaxhighlight', 'templatedata', 'templatestyles', 'timeline',
      ],
      transform: (name) => {
        name = name.trim();
        return name === 'codenowiki' ? `<code><nowiki></nowiki></code>` : `<${name}></${name}>`;
      },
      getEndOffset: (name) => {
        name = name.trim();
        return name === 'codenowiki' ? name.length + 6 : name.length + 3;
      },
    };
    config.default.sort();
    config.withSpace = config.default.filter((tag) => tag.includes(' '));

    return config;
  }
}
